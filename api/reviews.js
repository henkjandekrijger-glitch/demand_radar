// GET /api/reviews — reviews ophalen via DataForSEO voor de reviewplek ("Beloofd is beloofd"; zie README).
//   ?op=post&src=google|trustpilot|tripadvisor&q=<bedrijf + plaats, of domein bij trustpilot>&m=NL|US|DE|BE|CW (CW = Willemstad, Curaçao)&n=<max 100; trustpilot max 500>
//      Zet één taak in de wachtrij. Antwoord: { id, cost } of { cached: true } als dezelfde vraag < 30 dagen oud is.
//   ?op=get&src=...&id=<taak-id>   Haalt de klaargezette reviews op (gratis bij DataForSEO). Status 'pending' tot ze klaar zijn.
//   ?op=cache&src=...&q=...&m=...  Geeft eerder opgehaalde reviews terug zonder kosten.
//   ?op=gmb&m=CW&qs=<JSON-lijst, max 25 namen>  Google-bedrijfsprofiel (score, aantal, site); max GMB_DAY_MAX (100) nieuwe opvragingen per dag, 30 dagen cache. Gebruikt door de Curaçao-keuzehulpen van hjdk-api.
// Kostengrens: max 100 reviews per vraag (Trustpilot max REVIEWS_MAX_N_TP, standaard 500), max REVIEWS_DAY_MAX (standaard 10) nieuwe taken per dag, en de harde
// DataForSEO-dagrem van lib/dfs.js (DFS_DAILY_MAX, standaard $4) geldt ook hier. Namen van reviewers worden niet teruggegeven.
import { createHash } from 'node:crypto';
import { dfsReady, budget, dfsPostMany, dfsGet, underCap } from '../lib/dfs.js';
import { getStore, getJSON, putJSON } from '../lib/store.js';

const MKT = { CW: { loc: 1000009, lang: 'en' }, NL: { loc: 2528, lang: 'nl' }, BE: { loc: 2056, lang: 'nl' }, US: { loc: 2840, lang: 'en' }, DE: { loc: 2276, lang: 'de' } };
const SRC = {
  google: m => q => ({ keyword: q, location_code: MKT[m].loc, language_code: MKT[m].lang, sort_by: 'newest' }),
  trustpilot: () => q => ({ domain: q.replace(/^https?:\/\//, '').replace(/\/.*$/, ''), sort_by: 'recency' }),
  tripadvisor: m => q => ({ keyword: q, location_code: MKT[m].loc, language_code: MKT[m].lang, sort_by: 'most_recent' }),
};
const DAY_MAX = () => +(process.env.REVIEWS_DAY_MAX || 10);
const today = () => new Date().toISOString().slice(0, 10);
const keyOf = (src, q, m) => createHash('sha256').update(`${src}|${m}|${q.toLowerCase()}`).digest('hex').slice(0, 24);

function slim(task) {
  const r = ((task || {}).result || [])[0] || {};
  const items = (r.items || []).map(i => ({
    rating: i.rating ? i.rating.value : null,
    date: i.timestamp || i.time_ago || null,
    title: i.title ? String(i.title).slice(0, 160) : undefined,
    text: String(i.review_text || i.original_review_text || '').slice(0, 1000),
    reply: i.owner_answer ? String(i.owner_answer).slice(0, 400) : undefined,
  })).filter(x => x.text || x.rating != null);
  return { name: r.title || r.domain || null, rating: r.rating ? r.rating.value : null, total: r.reviews_count ?? (r.rating ? r.rating.votes_count : null), reviews: items };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const op = String(req.query.op || '');
  const src = String(req.query.src || 'google');
  const m = String(req.query.m || 'NL').toUpperCase();
  const q = String(req.query.q || '').trim().replace(/\s+/g, ' ').slice(0, 100);
  if (op === 'gmb') { // Google-bedrijfsprofiel (score, aantal reviews, site) voor max 25 namen; max GMB_DAY_MAX (standaard 100) namen per dag; gecachet 30 dagen
    if (!dfsReady()) return res.status(503).json({ error: 'DataForSEO not configured' });
    const store = getStore(); const lijst = (() => { try { return JSON.parse(String(req.query.qs || '[]')); } catch { return []; } })().map(x => String(x).trim().slice(0, 120)).filter(Boolean).slice(0, 25);
    const mk = MKT[m] || { loc: 1000009, lang: 'en' }; const loc = m === 'CW' ? 1000009 : mk.loc;
    const dayPath = `reviews/gmbday/${today()}.json`; const day = (store && await getJSON(store, dayPath).catch(() => null)) || { n: 0 };
    const out = []; const b = budget(0.6);
    for (const q2 of lijst) {
      const ck = `reviews/gmb/${keyOf('gmb', q2, m)}.json`; const c = store ? await getJSON(store, ck).catch(() => null) : null;
      if (c && Date.now() - c.t < 30 * 864e5) { out.push({ ...c.r, cached: true }); continue; }
      if (day.n >= +(process.env.GMB_DAY_MAX || 100) || !(await underCap())) { out.push({ q: q2, later: true }); continue; }
      const { call } = await import('../lib/dfs.js'); const r = await call('business_data/google/my_business_info/live', { keyword: q2, location_code: loc, language_code: mk.lang }, b); day.n++;
      const it = ((r || [])[0] || {}).items && r[0].items[0];
      const rr = it ? { q: q2, naam: it.title, score: it.rating && it.rating.value, aantal: it.rating && it.rating.votes_count, site: it.url || null, adres: it.address || null, cat: it.category || null, cid: it.cid || null } : { q: q2, niet: true };
      out.push(rr); if (store) await putJSON(store, ck, { t: Date.now(), r: rr }).catch(() => {});
    }
    if (store) await putJSON(store, dayPath, day).catch(() => {});
    return res.status(200).json({ out, today: day.n, spent: b.spent });
  }
  if (!SRC[src] || !MKT[m]) return res.status(400).json({ error: 'unknown src or market' });
  if (!dfsReady()) return res.status(503).json({ error: 'DataForSEO not configured' });
  const store = getStore();

  if (op === 'cache' || op === 'post') {
    if (q.length < 2) return res.status(400).json({ error: 'q missing' });
    const cached = store ? await getJSON(store, `reviews/cache/${keyOf(src, q, m)}.json`).catch(() => null) : null;
    if (cached && Date.now() - cached.t < 30 * 864e5) return res.status(200).json({ cached: true, ...cached });
    if (op === 'cache') return res.status(404).json({ cached: false });
    const dayPath = `reviews/day/${today()}.json`;
    const day = (store && await getJSON(store, dayPath).catch(() => null)) || { n: 0, cost: 0 };
    if (day.n >= DAY_MAX()) return res.status(429).json({ error: `daily limit of ${DAY_MAX()} review requests reached` });
    if (!(await underCap())) return res.status(429).json({ error: 'daily DataForSEO budget reached' });
    const maxN = src === 'trustpilot' ? +(process.env.REVIEWS_MAX_N_TP || 500) : 100; // Trustpilot: grotere steekproef met volledige tekst
    const n = Math.max(10, Math.min(maxN, Math.round((+req.query.n || 100) / 10) * 10));
    const b = budget(0.5);
    const task = { ...SRC[src](m)(q), depth: n, tag: keyOf(src, q, m) };
    const out = await dfsPostMany(`business_data/${src}/reviews/task_post`, [task], b);
    const t = out[0];
    if (!t || !t.ok) return res.status(502).json({ error: (t && t.msg) || b.errors[0] || 'post failed' });
    day.n++; day.cost = +(day.cost + b.spent).toFixed(4);
    if (store) {
      await putJSON(store, dayPath, day).catch(() => {});
      await putJSON(store, `reviews/task/${t.id}.json`, { src, q, m, n, t: Date.now() }).catch(() => {});
    }
    return res.status(200).json({ id: t.id, cost: b.spent, today: day });
  }

  if (op === 'get') {
    const id = String(req.query.id || '').replace(/[^\w-]/g, '').slice(0, 80);
    if (!id) return res.status(400).json({ error: 'id missing' });
    const j = await dfsGet(`business_data/${src}/reviews/task_get/${id}`).catch(() => null);
    const t = j && (j.tasks || [])[0];
    if (!t) return res.status(502).json({ error: 'no answer' });
    if (/no search results/i.test(t.status_message || '')) return res.status(200).json({ status: 'notfound', msg: 'Geen bedrijf gevonden; probeer naam + plaats.' });
    if (t.status_code !== 20000 || !(t.result && t.result[0])) return res.status(200).json({ status: 'pending', msg: t.status_message });
    const data = slim(t);
    const meta = store ? await getJSON(store, `reviews/task/${id}.json`).catch(() => null) : null;
    if (store && meta) await putJSON(store, `reviews/cache/${keyOf(meta.src, meta.q, meta.m)}.json`, { t: Date.now(), src: meta.src, q: meta.q, m: meta.m, ...data }).catch(() => {});
    return res.status(200).json({ status: 'ready', src, ...data });
  }

  return res.status(400).json({ error: 'use op=post, op=get or op=cache' });
}
