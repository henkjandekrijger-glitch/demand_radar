// Concurrenten in kaart en jouw gaten: wie staat er in Google (organisch en advertenties) en wie raden AI-assistenten aan
// voor de zoektermen van dit bedrijf, en waar staat het bedrijf zelf niet terwijl er wel vraag is.
// Eén keer per week per bedrijf (mine/<id>/compete-<week>.json). Kosten: Google-resultaten ± $0,002 per zoekterm (binnen de dagrem),
// AI-assistenten ± 4 korte vragen per zoekterm, en één samenvatting (haiku).
import { getJSON, putJSON } from './store.js';
import { askCached, parseJSON, compact, CHEAP } from './ai.js';

const week = d => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const y = t.getUTCFullYear(); return `${y}-w${String(1 + Math.round((t - Date.UTC(y, 0, 4)) / 6048e5)).padStart(2, '0')}`; };
const host = u => { try { return new URL(/^https?:/.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const MARKET = /(^|\.)(bol\.com|amazon\.[a-z.]+|ebay\.[a-z.]+|marktplaats\.nl|etsy\.com|aliexpress\.com|temu\.com|shein\.com|zalando\.[a-z.]+|kleinanzeigen\.de|otto\.de|wish\.com)$/;
const INFO = /(^|\.)(youtube\.com|wikipedia\.org|reddit\.com|pinterest\.[a-z.]+|facebook\.com|instagram\.com|tiktok\.com|quora\.com)$/;

// Welke zoektermen: de grootste uit "vraag naar wat je verkoopt", anders de eerste uit het profiel.
export function pickTerms(rec, own, n = 6) {
  const out = [];
  for (const cc of rec.profile.countries) {
    const o = own && own[cc];
    const ks = o && o.terms && o.terms.length ? o.terms.filter(t => t.v >= 50).slice(0, n).map(t => ({ k: t.k, v: t.v })) : (rec.profile.terms[cc] || []).slice(0, n).map(k => ({ k, v: null }));
    for (const t of ks) out.push({ cc, ...t });
  }
  return out.slice(0, n * 2);
}

// Domeinen optellen over alle zoektermen: hoe vaak, beste positie, advertenties, en wij zelf.
export function tally(serps, ownHosts) {
  const by = new Map(), mine = [];
  for (const s of serps) {
    const seen = new Set();
    (s.organic || []).forEach((o, i) => {
      const h = host(o.domain || o.url); if (!h || seen.has(h)) return; seen.add(h);
      if (ownHosts.some(x => h === x || h.endsWith(`.${x}`))) { mine.push({ k: s.k, pos: i + 1 }); return; }
      const d = by.get(h) || { domain: h, hits: 0, best: 99, ads: 0, terms: [], kind: MARKET.test(h) ? 'marketplace' : INFO.test(h) ? 'content' : 'shop' };
      d.hits++; d.best = Math.min(d.best, i + 1); d.terms.push(s.k); by.set(h, d);
    });
    for (const a of s.ads || []) { const h = host(a.domain); if (!h) continue; const d = by.get(h) || { domain: h, hits: 0, best: 99, ads: 0, terms: [], kind: MARKET.test(h) ? 'marketplace' : 'shop' }; d.ads++; if (!d.terms.includes(s.k)) d.terms.push(s.k); by.set(h, d); }
  }
  const list = [...by.values()].sort((a, b) => (b.hits + b.ads * 0.5) - (a.hits + a.ads * 0.5) || a.best - b.best);
  return { competitors: list.slice(0, 12), mine };
}

export async function compete(store, rec, own, { token, force = false, now = new Date() } = {}) {
  const key = `mine/${rec.id}/compete-${week(now)}.json`;
  if (!force) { const c = await getJSON(store, key, null).catch(() => null); if (c) return c; }
  const terms = pickTerms(rec, own), ownHosts = String(rec.url || '').split(/\s+/).map(host).filter(Boolean);
  const { serpFull: serp, budget, dfsReady, underCap } = await import('./dfs.js'), { COUNTRIES } = await import('./niches.js');
  // 1. Google: wie staat er bovenaan en wie adverteert
  const serps = [];
  if (dfsReady() && (await underCap(0.1))) {
    const b = budget(0.1);
    for (const t of terms) { if (!COUNTRIES[t.cc]) continue; const r = await serp(t.k, COUNTRIES[t.cc], b).catch(() => null); if (r) serps.push({ ...t, ...r }); }
  }
  const T = tally(serps, ownHosts);
  // 2. AI-assistenten: welke winkels raden ze aan (en wij?)
  const { aiShelf } = await import('./aishelf.js'), shelf = [];
  for (const t of terms.slice(0, 4)) { const s = await aiShelf(t.k, t.cc, store, { token }).catch(() => null); if (s && s.asked) shelf.push({ k: t.k, cc: t.cc, asked: s.asked, shops: s.shops.slice(0, 6) }); }
  const name = String(rec.profile.name || '').toLowerCase(), aiHas = shelf.filter(s => s.shops.some(x => x.name.toLowerCase().includes(name.split(' ')[0])));
  // 3. Gaten (AI vat samen, alleen op deze cijfers)
  const facts = { business: `${rec.profile.name}: ${rec.profile.summary}`, sells: rec.profile.sells, terms: terms.map(t => ({ search: t.k, country: t.cc, perMonth: t.v, ourGooglePosition: (T.mine.find(m => m.k === t.k) || {}).pos || (serps.length ? 'not in top 10' : 'unknown') })),
    googleCompetitors: T.competitors.slice(0, 8).map(c => ({ domain: c.domain, type: c.kind, inTop10For: c.hits, adsFor: c.ads, bestPosition: c.best < 99 ? c.best : null })),
    aiAssistantsRecommend: shelf.map(s => ({ search: s.k, shops: s.shops.map(x => `${x.name} (${x.n}/${s.asked})`) })), aiMentionsUs: aiHas.length };
  let gaps = [], note = null;
  // haiku: samenvatten op gegeven cijfers (geen open redeneerwerk); één keer per week per bedrijf bewaard. Leeg antwoord: één keer opnieuw met haiku.
  try {
    const j = parseJSON(await askCached({ task: 'compete', ttlH: 24, token, model: CHEAP(), maxTokens: 1800,
      system: `You are a sharp e-commerce strategist. Use only the facts given. Answer with JSON only, no markdown.
Name the 3-5 most valuable gaps: places where there is demand and competitors win but this business is missing or weak (Google positions, ads, AI assistant recommendations, assortment, positioning). For each: a short title, why (with the numbers), and one concrete action for this week. Also name the 3 strongest competitors with one line on why they win.
Return JSON: {"gaps":[{"title":"","why":"","action":"","terms":[""]}],"rivals":[{"name":"","why":""}]}`,
      prompt: `Facts about a business and its competition (JSON):\n${JSON.stringify(compact(facts) || {})}`, valid: t => { const x = parseJSON(t); return !!(x && Array.isArray(x.gaps) && x.gaps.length); } }));
    gaps = (j && j.gaps) || []; facts.rivals = (j && j.rivals) || [];
  } catch (e) { /* geen samenvatting */ }
  if (!gaps.length) note = 'The summary is not available right now.';
  const out = { week: week(now), made: now.toISOString(), terms, serpChecked: serps.length, competitors: T.competitors, mine: T.mine, shelf, aiMentionsUs: aiHas.length, gaps: gaps.slice(0, 5), rivals: (facts.rivals || []).slice(0, 3), note };
  if (!note && serps.length) await putJSON(store, key, out).catch(() => {}); // zonder Google-cijfers (dagrem) niet voor een week bewaren
  return out;
}
