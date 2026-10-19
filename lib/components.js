// Statuslijst voor de overdracht: elk onderdeel van Demand Radar met een live controle (alleen kleine stand-bestanden en
// hartslagen, geen betaalde aanroepen). Nieuw onderdeel = hier een regel toevoegen én een sectie "### <id>" in docs/WERKING.md
// (de test controleert dat). Niveaus: ok · let op (oud of half) · fout · wacht (op een sleutel of op Henkjan).
import { getJSON, putJSON } from './store.js';

const H = 36e5, ago = t => (t ? Math.round((Date.now() - Date.parse(t)) / 6e4) : null);
const since = t => { const m = ago(t); return m == null ? 'nooit' : m < 90 ? `${m} min geleden` : m < 48 * 60 ? `${Math.round(m / 60)} uur geleden` : `${Math.round(m / 1440)} dagen geleden`; };
const R = (level, line) => ({ level, line });

// Hartslag van een geplande taak: tijdstip plus een korte samenvatting (alleen eenvoudige waarden).
export function brief(o, depth = 0) {
  if (o == null || typeof o !== 'object') return typeof o === 'string' ? o.slice(0, 120) : o;
  if (Array.isArray(o)) return o.length > 5 ? `${o.length} items` : o.map(x => brief(x, depth + 1));
  if (depth > 2) return '…';
  const out = {}; for (const [k, v] of Object.entries(o).slice(0, 14)) out[k] = brief(v, depth + 1); return out;
}
export async function heartbeat(store, job, summary) { if (store) await putJSON(store, `status/${job}.json`, { at: new Date().toISOString(), summary: brief(summary) }).catch(() => {}); }

export const COMPONENTS = [
  { id: 'radar', name: 'Radar (nachtelijke opbouw)', async check(s, x) {
    const w = x.warm, n = w && w.summary && w.summary.night, day = new Date(Date.now() - 4 * H).toISOString().slice(0, 10);
    const r = w && w.summary && w.summary.radar;
    const a = await getJSON(s, `demand/attempt-${day}.json`, null).catch(() => null);
    const built = x.demandDay === day;
    return R(built ? 'ok' : new Date().getUTCHours() < 5 ? 'ok' : 'fout', `${built ? 'van vandaag' : `laatste opbouw ${x.demandDay || '?'}`}${a ? ` · ${a.n} poging(en) vandaag` : ''}${n && n.note ? ` · ${n.note}` : ''}${r ? ` · overzicht ${since(r)}` : ''}`);
  } },
  { id: 'forecast', name: 'Voorspeller (Will rise)', async check() { const { ML } = await import('./ml.js'); return ML ? R('ok', `model v${ML.version}, getraind ${ML.trained}`) : R('fout', 'geen model geladen'); } },
  { id: 'early', name: 'Vroege signalen', async check(s) {
    const { latestEarly } = await import('./earlydata.js'), E = await latestEarly(s).catch(() => null);
    if (!E) return R('fout', 'geen uitkomst');
    const old = ago(E.made || E.at || (E.day ? E.day + 'T12:00:00Z' : null)) > 3 * 1440;
    return R(old ? 'let op' : 'ok', `data t/m ${E.month}, doorgerekend ${E.day}, ${E.items.length} getoond`);
  } },
  { id: 'wildcards', name: 'Wildcards (trackrecord)', async check(s) { const st = await getJSON(s, 'wild/state.json', null).catch(() => null); return st ? R('ok', `laatst nagekeken ${since(st.checked || st.at)}`) : R('let op', 'nog niet nagekeken'); } },
  { id: 'coming', name: 'Komende momenten (beleid, lanceringen)', async check(s) {
    const L = await getJSON(s, 'launches/all.json', null).catch(() => null), G = await getJSON(s, 'regulation/US.json', null).catch(() => null);
    const old = d => !d || Date.now() - Date.parse(d) > 9 * 864e5;
    return R(old(L && L.day) || old(G && G.day) ? 'let op' : 'ok', `lanceringen ${L ? `${L.day} (${(L.items || []).length})` : 'nog niet'} · beleid VS ${G ? `${G.day} (${(G.items || []).length})` : 'nog niet'}`);
  } },
  { id: 'events', name: 'Events (voorspellingsmarkten)', async check(s) {
    const e = await getJSON(s, 'events/latest.json', null).catch(() => null), today = new Date().toISOString().slice(0, 10);
    return e ? R(e.day === today ? 'ok' : 'let op', `${e.day}: ${(e.items || []).length} gebeurtenissen uit ${e.scanned || '?'} vragen${(e.errors || []).length ? ` · fouten: ${e.errors.join('; ').slice(0, 80)}` : ''}`) : R('let op', 'nog niet opgebouwd');
  } },
  { id: 'mine', name: 'Mijn bedrijf', async check(s) { const ix = (await getJSON(s, 'mine/index.json', null).catch(() => null)) || []; return R('ok', `${ix.length} gevolgde bedrijven`); } },
  { id: 'compete', name: 'Concurrenten en gaten', async check() { return R('ok', 'op verzoek per bedrijf, één keer per week bewaard'); } },
  { id: 'feed', name: 'Yoors-feed in Merchant Center', async check(s) {
    const m = await getJSON(s, 'feed/yoors-NL-meta.json', null).catch(() => null), t = (await getJSON(s, 'feed/yoors-titles-NL.json', null).catch(() => null)) || {};
    return m ? R(ago(m.at) > 26 * 60 ? 'let op' : 'ok', `${m.n} producten, ververst ${since(m.at)}${m.skipped && m.skipped.length ? ` · ${m.skipped.length} pagina's overgeslagen` : ''} · ${Object.keys(t).length} titels met zoektermen`) : R('let op', `feed-stand nog niet bewaard · ${Object.keys(t).length} titels met zoektermen`);
  } },
  { id: 'prices', name: 'Marktprijzen Yoors (prijsadvies)', async check(s) {
    const st = await getJSON(s, 'prices/yoors-state.json', null).catch(() => null);
    return st ? R('ok', `${st.done || 0} vergeleken, ${Object.keys(st.pending || {}).length} wachten, nog ${st.left ?? '?'} te doen`) : R('let op', 'nog niet gestart');
  } },
  { id: 'keepa', name: 'Keepa (Amazon-historie en -prijzen)', async check(s) {
    const { keepaReady, keepaState } = await import('./keepa.js');
    if (!keepaReady()) return R('wacht', 'KEEPA_KEY ontbreekt');
    const st = await keepaState(s).catch(() => ({}));
    return R('ok', `${st.done || 0} termen opgehaald, rij: ${Object.entries(st.left || {}).map(([k, v]) => `${k} ${v}`).join(', ') || 'leeg'}, laatst ${since(st.last)}`);
  } },
  { id: 'amazonsales', name: 'Amazon gekocht vorige maand', async check(s) { const st = await getJSON(s, 'amzsales/state.json', null).catch(() => null); return st ? R('ok', `maand ${st.month || '?'} · ${Object.keys(st.open || {}).length} open taken · ${st.got || 0} opgehaald`) : R('let op', 'nog niet gestart'); } },
  { id: 'bol', name: 'Populair op bol.com', async check(s, x) { const l = x.loop && x.loop.summary && x.loop.summary.bol; return R('ok', l ? `laatste ronde: ${JSON.stringify(l).slice(0, 80)}` : 'dagelijkse momentopname'); } },
  { id: 'check', name: 'Idee-check', async check() { return R('ok', 'op verzoek (/check, connector)'); } },
  { id: 'news', name: 'Nieuwsophaler (Railway, GDELT)', async check() {
    const p = process.env.GDELT_PROXY; if (!p) return R('wacht', 'nog niet op Railway gezet (GDELT_PROXY ontbreekt)');
    try { const r = await fetch(`${p.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(5000) }); const j = await r.json(); return R(r.ok ? 'ok' : 'fout', `${j.fetched || 0} opgehaald, ${j.errors || 0} fouten`); } catch (e) { return R('fout', `niet bereikbaar: ${String(e.message || e).slice(0, 60)}`); }
  } },
  { id: 'sources', name: 'Koppelingen met sleutel', async check() {
    const k = { Bing: 'BING_WEBMASTER_KEY', YouTube: 'YOUTUBE_API_KEY', Meta: 'META_AD_TOKEN', Keepa: 'KEEPA_KEY', Nieuws: 'GDELT_PROXY', Paddle: 'PADDLE_API_KEY', Mail: 'RESEND_API_KEY' };
    const miss = Object.entries(k).filter(([, v]) => !process.env[v]).map(([n]) => n);
    return R(miss.length ? 'wacht' : 'ok', miss.length ? `nog niet ingesteld: ${miss.join(', ')}` : 'alles ingesteld');
  } },
  { id: 'learning', name: 'Leren (kliks, feedback, uitkomsten)', async check(s, x) { return x.loop ? R(ago(x.loop.at) > 3 * 60 ? 'fout' : 'ok', `uurronde ${since(x.loop.at)}`) : R('let op', 'nog geen hartslag van de uurronde'); } },
  { id: 'accounts', name: 'Inloggen en abonnement', async check() { return R(process.env.PADDLE_API_KEY ? 'ok' : 'wacht', process.env.PADDLE_API_KEY ? 'betalen ingesteld' : 'betalen nog niet live (Paddle-sleutels, domein)'); } },
  { id: 'connector', name: 'Connector voor andere chats', async check() { return R('ok', '/mcp?key=<teamsleutel>'); } },
  { id: 'handover', name: 'Overdracht', async check() { return R('ok', 'live, deze pagina'); } },
  { id: 'tools', name: 'Onderzoek en toetsen', async check() { return R('ok', 'alleen voor de eigenaar'); } },
];

export async function componentStatus(store) {
  const [warm, loop] = await Promise.all(['warm', 'loop'].map(j => getJSON(store, `status/${j}.json`, null).catch(() => null)));
  let demandDay = null; try { const m = await getJSON(store, 'demand/meta.json', null); demandDay = m && m.day; } catch {}
  const x = { warm, loop, demandDay };
  const rows = await Promise.all(COMPONENTS.map(async c => { try { return { id: c.id, name: c.name, ...(await c.check(store, x)) }; } catch (e) { return { id: c.id, name: c.name, level: 'fout', line: String(e.message || e).slice(0, 100) }; } }));
  return { jobs: { warm: warm ? since(warm.at) : 'nooit', loop: loop ? since(loop.at) : 'nooit' }, rows };
}
