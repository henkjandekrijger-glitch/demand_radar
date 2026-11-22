// Behoeftes in plaats van zoektermen (21 nov 2026, Henkjan: "We zijn nu heel gefocust op zoektermen vind ik" en "Ja zorg dat je
// alle mogelijke data points hebt . En zoeken moet nog wel beschikbaar blijven natuurlijk ."). Een behoefte = een groep zoektermen
// over hetzelfde (zelfde specifieke kernwoorden), per land. Per behoefte alle meters die de radar heeft, in vijf lagen:
//   zoeken    Google (maandreeks van alle termen samen), Search Console van de eigen sites
//   kopen     Amazon "gekocht vorige maand", Keepa (verkoop, rang, prijs), bol.com populair (NL)
//   aanbod    nieuwe domeinen, AI-antwoord (gaps), adverteerderswaarde (volume × klikprijs)
//   oorzaak   gebeurtenissen van voorspellingsmarkten
//   aandacht  Wikipedia-paginaweergaven (gratis, per maand)
// plus de voorspelling: de voorspelfabriek (lib/fabriek.js) draait ook op de opgetelde reeks van elke behoefte (minder ruis dan
// losse termen). Score = kans op een verrassing × geld per maand. Zoektermen blijven gewoon beschikbaar (/api/early, /api/demand).
// Opslag behoefte/<cc>.json; publiek /api/early?behoefte=1&cc=NL. Gratis (alleen lezen en rekenen; Wikipedia gratis).
import { getJSON, putJSON } from './store.js';
import { toArr } from './ledger.js';
import { fabriekLand } from './fabriek.js';
import { schoon } from './schoon.js';
import { UA as CORE_UA } from './core.js';
import { METERS, CM, cmDag, metersRonde } from './meters.js';

const CCS = ['NL', 'DE', 'US'], M0 = 2015 * 12, OUT = cc => `behoefte/${cc}.json`, WIKI = 'behoefte/wiki.json';
const ymOf = i => { const n = M0 + i; return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`; };
const idxOf = s => { const [y, m] = String(s).split('-').map(Number); return y * 12 + m - 1 - M0; };
const STOP = new Set(['for', 'the', 'and', 'with', 'near', 'best', 'top', 'cheap', 'online', 'price', 'prices', 'how', 'what', 'where', 'when', 'why', 'who', 'can', 'does', 'kopen', 'voor', 'met', 'van', 'een', 'het', 'wat', 'hoe', 'waar', 'beste', 'goedkoop', 'goedkope', 'prijs', 'kaufen', 'für', 'mit', 'von', 'der', 'die', 'das', 'und', 'wie', 'was', 'wo', 'beste', 'günstig', 'preis', 'test', 'bei', 'buy', 'free', 'gratis', 'kostenlos', 'nederland', 'deutschland', 'usa', 'today', 'vandaag', 'heute', 'new', 'nieuw', 'neue', 'neu']);
export const stam = w => w.replace(/z/g, 's').replace(/s$/, '').replace(/ing$/, '').replace(/(en|e|n)$/, '').replace(/y$/, 'i').replace(/(.)\1$/, '$1');
export const stammen = k => [...new Set(String(k).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss').split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)).map(stam).filter(w => w.length >= 3))];

// Groeperen: per term de twee meest specifieke kernwoorden die minstens 3 termen delen (zeldzaam maar gedeeld = het onderwerp).
export function groepeer(termen) {
  const st = new Map(), df = new Map();
  for (const k of termen) { const s = stammen(k); st.set(k, s); for (const w of s) df.set(w, (df.get(w) || 0) + 1); }
  const max = Math.max(50, Math.round(termen.length * 0.02)), groep = new Map();
  for (const k of termen) {
    const kand = st.get(k).filter(w => { const d = df.get(w); return d >= 3 && d <= max; }).sort((a, b) => df.get(a) - df.get(b) || b.length - a.length);
    const key = kand.length ? kand.slice(0, 2).sort().join(' ') : `=${k}`;
    (groep.get(key) || groep.set(key, []).get(key)).push(k);
  }
  return groep;
}

// Tekst (zoekvraag, producttitel, vraag van een markt) → behoeftes waarvan alle kernwoorden erin staan.
function matcher(keys) {
  const byW = new Map(); for (const key of keys) { if (key.startsWith('=')) continue; for (const w of key.split(' ')) (byW.get(w) || byW.set(w, []).get(w)).push(key); }
  return text => { const s = new Set(stammen(text)), hit = new Set(); for (const w of s) for (const key of byW.get(w) || []) if (key.split(' ').every(x => s.has(x))) hit.add(key); return [...hit]; };
}

async function laatste(store, prefix, n = 2) { // nieuwste maandbestand (deze of vorige maand)
  const d = new Date(); for (let i = 0; i < n; i++) { const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7); const j = await getJSON(store, `${prefix}${m}.json`, null).catch(() => null); if (j) return { m, j }; }
  return null;
}

// Eén land opbouwen: behoeftes, opgetelde reeks, alle meters, voorspelling, score.
export async function bouwBehoeftes(store, cc, { ser = null, top = 300 } = {}) {
  const raw = ser || (await getJSON(store, `early/series-${cc}.json`, null).catch(() => null));
  if (!raw || !raw.kw || !raw.month) return { cc, skip: 'geen kijklijst' };
  const t0 = Date.now(), L0 = idxOf(raw.month), arr = new Map(), cpc = new Map();
  let breuken = 0;
  for (const [k, s] of Object.entries(raw.kw)) if (s && s.m && s.m.length >= 30) { const c = schoon(toArr(s.m), L0); if (c.j >= 0) breuken++; arr.set(k, c.a); cpc.set(k, +s.cpc || 0); }
  const groep = groepeer([...arr.keys()]), B = new Map();
  for (const [key, ks] of groep) {
    const sum = new Float32Array(180).fill(NaN); let geld = 0;
    for (let i = L0 - 47; i <= L0; i++) { let s = 0, ok = true; for (const k of ks) { const v = arr.get(k)[i]; if (!(v >= 0)) { ok = false; break; } s += v; } if (ok) sum[i] = s; }
    for (const k of ks) geld += (arr.get(k)[L0] || 0) * cpc.get(k);
    const ord = [...ks].sort((a, b) => (arr.get(b)[L0] || 0) - (arr.get(a)[L0] || 0));
    if (!(sum[L0] >= 300)) continue;
    B.set(key, { key, naam: ord[0], termen: ord.slice(0, 8), n: ks.length, alle: ks, sum, geld: Math.round(geld) });
  }
  // voorspelling op behoefte-niveau: dezelfde fabriek, maar op de opgetelde reeksen
  const kw = {}; for (const b of B.values()) { const m = []; for (let i = L0 - 47; i <= L0; i++) if (b.sum[i] >= 0) m.push([Math.floor((M0 + i) / 12), ((M0 + i) % 12) + 1, Math.round(b.sum[i])]); kw[b.key] = { m }; }
  const F = await fabriekLand(null, cc, { ser: { month: raw.month, kw }, top: 400 });
  const kans = new Map((F.calls || []).map(c => [c.k, c]));
  // alle meters ophalen (stuk voor stuk; een ontbrekende bron laat zijn veld leeg)
  const keys = [...B.keys()], match = matcher(keys), termNaar = new Map(); for (const b of B.values()) for (const k of b.alle) termNaar.set(k, b.key);
  const per = new Map(keys.map(k => [k, {}])), put = (key, laag, veld, f) => { const o = per.get(key); if (!o) return; const l = (o[laag] = o[laag] || {}); l[veld] = f(l[veld]); };
  const gsc = await getJSON(store, 'gsc/latest.json', null).catch(() => null);
  const GCC = { NL: ['nld', 'bel'], DE: ['deu', 'aut'], US: ['usa'] }[cc];
  for (const s of (gsc && gsc.rows) || []) for (const r of s.rows || []) { const [q, c, imp, imp0] = r; if (!GCC.includes(String(c).toLowerCase())) continue; for (const key of match(q)) put(key, 'eigen', 'searchConsole', v => ({ vertoningen: ((v && v.vertoningen) || 0) + (+imp || 0), ervoor: ((v && v.ervoor) || 0) + (+imp0 || 0), site: (v && v.site) || s.prop })); }
  const amz = await laatste(store, `amzsales/${cc}/`);
  if (amz) for (const [k, v] of Object.entries(amz.j)) { const key = termNaar.get(k) || match(k)[0]; if (key && v && v.units != null) put(key, 'kopen', 'amazonGekocht', o => ({ stuks: ((o && o.stuks) || 0) + (+v.units || 0), prijs: (o && o.prijs) || v.price || null, maand: amz.m })); }
  const kp = cc === 'NL' ? null : await getJSON(store, `keepa/${cc}.json`, null).catch(() => null);
  if (kp) for (const [k, v] of Object.entries(kp)) { const key = termNaar.get(k) || match(k)[0]; if (!key || !v || !v.sold) continue; const ms = Object.keys(v.sold).sort(), m = ms[ms.length - 1], m3 = ms[ms.length - 4]; put(key, 'kopen', 'keepa', o => ({ verkocht: ((o && o.verkocht) || 0) + (v.sold[m] || 0), drieMaandenTerug: ((o && o.drieMaandenTerug) || 0) + ((m3 && v.sold[m3]) || 0), prijs: (v.price && v.price[Object.keys(v.price).sort().pop()]) || (o && o.prijs) || null, maand: m })); }
  if (cc === 'NL') { const d = new Date(); for (let i = 0; i < 3; i++) { const day = new Date(d.getTime() - i * 864e5).toISOString().slice(0, 10), bp = await getJSON(store, `bolpop/${day}.json`, null).catch(() => null); if (!bp) continue; for (const p of bp.list || []) for (const key of match(p.title || '')) put(key, 'kopen', 'bolPopulair', o => ({ producten: ((o && o.producten) || 0) + 1, besteRang: Math.min((o && o.besteRang) || 9999, p.rank || 9999), dag: day })); break; } }
  const dom = await getJSON(store, 'aanbod/domeinen.json', null).catch(() => null);
  if (dom && dom.maand) { const ms = Object.keys(dom.maand).sort(), M = dom.maand[ms[ms.length - 1]]; for (const [k, c] of Object.entries(M.tel || {})) { const key = termNaar.get(k); if (key) put(key, 'aanbod', 'nieuweDomeinen', o => ({ aantal: ((o && o.aantal) || 0) + c, dagen: M.dagen.length, maand: ms[ms.length - 1] })); } }
  const gaps = await getJSON(store, 'gaps/latest.json', null).catch(() => null);
  const walk = (o, f, d = 0) => { if (!o || d > 5) return; if (Array.isArray(o)) { for (const x of o) walk(x, f, d + 1); return; } if (typeof o === 'object') { if (o.cc === cc && (o.k || o.keyword || o.q)) f(o); for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, f, d + 1); } };
  walk(gaps, g => { for (const key of match(g.k || g.keyword || g.q)) put(key, 'aanbod', 'aiAntwoord', () => ({ vraag: String(g.q || g.question || g.k || '').slice(0, 120), oordeel: g.verdict || g.kind || g.gap || g.type || null, dag: gaps.day || null })); });
  const ev = await getJSON(store, 'events/latest.json', null).catch(() => null);
  for (const e of (ev && ev.items) || []) for (const t of (e.terms && e.terms[cc]) || []) for (const key of new Set([termNaar.get(String(t).toLowerCase()), ...match(t)].filter(Boolean))) put(key, 'oorzaak', 'gebeurtenissen', l => [...(l || []), { vraag: String(e.title || e.q || '').slice(0, 140), richting: e.dir, effect: String(e.effect || '').slice(0, 160), bron: e.src || e.source || null }].slice(0, 3));
  // lanceringen en beleid (lib/launches.js, lib/regulation.js): naam en ideeën tegen de kernwoorden
  for (const [bron, veld] of [['launches', 'lanceringen'], ['regulation', 'beleid']]) {
    const L = await getJSON(store, `${bron}/${cc}.json`, null).catch(() => null);
    for (const x of (L && L.items) || []) for (const key of new Set([x.name, ...(x.ideas || [])].flatMap(t => match(String(t || ''))))) put(key, 'oorzaak', veld, l => [...(l || []), { wat: String(x.name || '').slice(0, 100), datum: x.date, richting: x.direction || 'more' }].slice(0, 3));
  }
  // Clickmind: mensen die de term aanklikten op Henkjans eigen advertenties en sites (14 dagen tegen 14 ervoor)
  const cmd = await getJSON(store, CM, null).catch(() => null);
  for (const [kw, nu, voor] of (cmd && cmd.termen) || []) for (const key of new Set([termNaar.get(String(kw).toLowerCase()), ...match(kw)].filter(Boolean))) { const o = per.get(key); if (!o) continue; const c = (o.cm = o.cm || { clickmind: { mensen14d: 0, mensenErvoor: 0, termen: [] } }).clickmind; c.mensen14d += nu; c.mensenErvoor += voor; if (c.termen.length < 3) c.termen.push(kw); }
  const MT = (await getJSON(store, METERS, null).catch(() => null)) || {};
  const wiki = await getJSON(store, WIKI, null).catch(() => null), W = (wiki && wiki[cc]) || {};
  // samenstellen en rangschikken
  const items = [];
  for (const b of B.values()) {
    const s = b.sum, nu = s[L0], vj = s[L0 - 12], p = kans.get(b.key), o = per.get(b.key) || {};
    const zoeken = { google: { nu: Math.round(nu), jaarGeleden: vj >= 0 ? Math.round(vj) : null, groeiJaar: vj > 0 ? Math.round((nu / vj - 1) * 100) : null, reeks: Array.from({ length: 12 }, (_, i) => (s[L0 - 11 + i] >= 0 ? Math.round(s[L0 - 11 + i]) : null)) }, ...(o.eigen || {}) };
    const geld = b.geld, kansPct = p ? p.p : Math.round(F.toevalNu * 10) / 10;
    const mt = m => MT[m] && MT[m][cc] && MT[m][cc][b.key];
    const aandacht = { ...(W[b.key] ? { wikipedia: W[b.key] } : {}), ...(mt('reddit') ? { reddit: mt('reddit') } : {}), ...(mt('youtube') ? { youtube: mt('youtube') } : {}) };
    items.push({ id: b.key, naam: b.naam, termen: b.termen, aantalTermen: b.n, zoeken, kopen: o.kopen || null, aanbod: { ...(o.aanbod || {}), ...(mt('meta') ? { metaAdvertenties: mt('meta') } : {}), adverteerderswaarde: geld }, oorzaak: o.oorzaak || null,
      eigen: o.cm ? { clickmind: o.cm.clickmind } : null, aandacht: Object.keys(aandacht).length ? aandacht : null, voorspelling: p ? { kans: p.p, doel: p.target, gok: p.gok, waarom: p.why } : { kans: kansPct, doel: null },
      // in een jaar meer dan gehalveerd: meestal Google-ruis of een herstel, geen kans om op te bouwen → onderaan
      ...(vj > 0 && nu < 0.5 * vj ? { let_op: 'meer dan gehalveerd in een jaar (Google-ruis of herstel)' } : {}),
      score: Math.round(kansPct * Math.log10(geld + 10) * (vj > 0 && nu < 0.5 * vj ? 0.2 : 1) * 10) / 10 });
  }
  items.sort((a, c) => c.score - a.score);
  const metingen = l => items.filter(x => l(x)).length;
  const out = { versie: 3, cc, month: raw.month, at: new Date().toISOString(), ms: Date.now() - t0, behoeftes: items.length, termen: arr.size,
    toets: F.toets && { winst: F.toets.winst, top100: F.toets.top100, toeval: F.toets.toeval, perMaand: F.toets.perMaand }, markt: F.markt,
    dekking: { searchConsole: metingen(x => x.zoeken.searchConsole), amazonGekocht: metingen(x => x.kopen && x.kopen.amazonGekocht), keepa: metingen(x => x.kopen && x.kopen.keepa), bolPopulair: metingen(x => x.kopen && x.kopen.bolPopulair), nieuweDomeinen: metingen(x => x.aanbod.nieuweDomeinen), aiAntwoord: metingen(x => x.aanbod.aiAntwoord), gebeurtenissen: metingen(x => x.oorzaak && x.oorzaak.gebeurtenissen), lanceringen: metingen(x => x.oorzaak && x.oorzaak.lanceringen), beleid: metingen(x => x.oorzaak && x.oorzaak.beleid),
      clickmind: metingen(x => x.eigen), wikipedia: metingen(x => x.aandacht && x.aandacht.wikipedia), reddit: metingen(x => x.aandacht && x.aandacht.reddit), youtube: metingen(x => x.aandacht && x.aandacht.youtube), metaAdvertenties: metingen(x => x.aanbod.metaAdvertenties) },
    ruis: { termenMetBreuk: breuken },
    items: items.slice(0, top) };
  if (store) await putJSON(store, OUT(cc), out);
  return out;
}

// Wikipedia-weergaven (gratis): per ronde hooguit 60 behoeftes zonder artikel opzoeken (zoek-API in de taal van het land) en
// de maandweergaven van het afgelopen jaar ophalen. Bewaard in behoefte/wiki.json, ververst na 30 dagen.
const WLANG = { NL: 'nl', DE: 'de', US: 'en' }, UA = { 'user-agent': CORE_UA };
export async function wikiRonde(store, { max = 60 } = {}) {
  const W = (await getJSON(store, WIKI, null).catch(() => null)) || {}; let done = 0;
  for (const cc of CCS) {
    const B = await getJSON(store, OUT(cc), null).catch(() => null); if (!B) continue;
    const w = (W[cc] = W[cc] || {}), lang = WLANG[cc];
    for (const it of B.items.slice(0, 300)) {
      if (done >= max) break;
      const cur = w[it.id]; if (cur && Date.now() - Date.parse(cur.at) < 30 * 864e5) continue;
      try {
        let art = cur && cur.artikel;
        if (!art) { const r = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&srsearch=${encodeURIComponent(it.naam)}`, { headers: UA, signal: AbortSignal.timeout(8000) }); const j = await r.json(); art = j.query && j.query.search && j.query.search[0] && j.query.search[0].title; }
        if (!art) { w[it.id] = { at: new Date().toISOString(), artikel: null }; done++; continue; }
        const end = new Date(), start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), 1)), f = d => d.toISOString().slice(0, 10).replace(/-/g, '');
        const r = await fetch(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/all-access/user/${encodeURIComponent(art.replace(/ /g, '_'))}/monthly/${f(start)}/${f(end)}`, { headers: UA, signal: AbortSignal.timeout(8000) });
        const j = await r.json().catch(() => ({})), maanden = (j.items || []).map(x => [String(x.timestamp).slice(0, 4) + '-' + String(x.timestamp).slice(4, 6), x.views]);
        w[it.id] = { at: new Date().toISOString(), artikel: art, maanden: maanden.slice(-13) }; done++;
      } catch { done++; }
    }
  }
  if (done) await putJSON(store, WIKI, W);
  return { wiki: done };
}

// Vanuit /api/loop: één land per ronde, één keer per dag (de meters veranderen dagelijks), daarna Wikipedia aanvullen.
export async function behoefteRonde(store, { cc: only = null, force = false, oidc = '' } = {}) {
  const day = new Date().toISOString().slice(0, 10);
  const cm = await cmDag(store, oidc).catch(e => ({ clickmind: String(e.message || e).slice(0, 80) })); // Clickmind eerst (dagelijks), zodat de opbouw hem meeneemt
  for (const cc of CCS) {
    if (only && cc !== only) continue;
    const cur = await getJSON(store, OUT(cc), null).catch(() => null);
    if (!force && cur && String(cur.at || '').slice(0, 10) === day && cur.versie === 3) continue;
    const r = await bouwBehoeftes(store, cc); if (r.skip) continue;
    return { behoefte: cc, n: r.behoeftes, ms: r.ms, toets: r.toets && r.toets.top100, ...cm };
  }
  // alles van vandaag gebouwd: per uur een stukje meters bijmeten (Wikipedia, Reddit, YouTube, Meta)
  const wiki = await wikiRonde(store).catch(e => ({ wiki: String(e.message || e).slice(0, 80) }));
  const meters = await metersRonde(store).catch(e => ({ meters: String(e.message || e).slice(0, 80) }));
  return { behoefte: 'up to date', ...cm, ...wiki, meters };
}

export async function behoefteView(store, cc, n = 50) {
  const B = await getJSON(store, OUT(cc), null).catch(() => null);
  if (!B) return { ready: false };
  return { ready: true, cc, month: B.month, at: B.at, behoeftes: B.behoeftes, termen: B.termen, ruis: B.ruis, toets: B.toets, markt: B.markt, dekking: B.dekking, items: B.items.slice(0, n) };
}
