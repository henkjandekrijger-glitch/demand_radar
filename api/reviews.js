// GET /api/reviews — reviews ophalen via DataForSEO voor de reviewplek ("Beloofd is beloofd"; zie README).
//   ?op=post&src=google|trustpilot|tripadvisor&q=<bedrijf + plaats, of domein bij trustpilot>&m=NL|US|DE|BE|CW (CW = Willemstad, Curaçao)&n=<max 100; trustpilot max 500>
//      Zet één taak in de wachtrij. Antwoord: { id, cost } of { cached: true } als dezelfde vraag < 30 dagen oud is.
//   ?op=get&src=...&id=<taak-id>   Haalt de klaargezette reviews op (gratis bij DataForSEO). Status 'pending' tot ze klaar zijn.
//   ?op=cache&src=...&q=...&m=...  Geeft eerder opgehaalde reviews terug zonder kosten.
//   ?op=listings[&read=<n>]  alle bedrijven op Curaçao in pagina's van 1000 (zie code), plafond CW_LISTINGS_USD ($3) per dag
//   ?op=gmb&m=CW&qs=<JSON-lijst, max 25 namen>[&v=2]  Google-bedrijfsprofiel (score, aantal, site, telefoon, adres, coördinaten, openingstijden, place_id); max GMB_DAY_MAX (700) nieuwe opvragingen en GMB_DAY_USD ($2,50) per dag, binnen de DFS-dagrem; 30 dagen cache; v=2 haalt oude cache zonder telefoon opnieuw op. Gebruikt door de Curaçao-keuzehulpen van hjdk-api.
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
  if (op === 'listings') { // Alle bedrijven op Curaçao (Google Business Listings, DataForSEO $0,01 per verzoek + $0,0003 per bedrijf). Eén pagina van max 1000 per aanroep, hervat met offset_token; plafond CW_LISTINGS_USD per dag (standaard $3) binnen de DFS-dagrem. read=<n> geeft een opgeslagen pagina terug (gratis).
    const store = getStore(); if (!store) return res.status(503).json({ error: 'geen opslag' });
    const stPath = 'cw/listings/state.json'; const st = (await getJSON(store, stPath).catch(() => null)) || { n: 0, token: null, total: null, done: false, dag: '', usd: 0 };
    if (req.query.read != null) { const n = Math.max(0, Math.floor(+req.query.read || 0)); const pg = await getJSON(store, `cw/listings/page-${n}.json`).catch(() => null); return res.status(200).json({ state: { n: st.n, total: st.total, done: st.done }, page: pg }); }
    if (req.query.reset === '1' && st.done && st.dag !== today()) { st.n = 0; st.token = null; st.done = false; }
    if (st.done) return res.status(200).json({ state: st, klaar: true });
    if (!dfsReady()) return res.status(503).json({ error: 'DataForSEO not configured' });
    if (st.dag !== today()) { st.dag = today(); st.usd = 0; }
    if (st.usd >= +(process.env.CW_LISTINGS_USD || 3) || !(await underCap(0.35))) return res.status(200).json({ state: st, later: true });
    const lock = await getJSON(store, 'cw/listings/lock.json').catch(() => null); if (lock && Date.now() - lock.t < 90000) return res.status(200).json({ state: st, bezig: true });
    await putJSON(store, 'cw/listings/lock.json', { t: Date.now() }).catch(() => {});
    const { call } = await import('../lib/dfs.js'); const b = budget(0.5);
    const task = st.token ? { location_coordinate: '12.185,-68.98,38', limit: 1000, offset_token: st.token } : { location_coordinate: '12.185,-68.98,38', limit: 1000, order_by: ['rating.votes_count,desc'] };
    const r = await call('business_data/business_listings/search/live', task, b); const res0 = (r || [])[0];
    if (!res0) { await putJSON(store, 'cw/listings/lock.json', { t: 0 }).catch(() => {}); return res.status(200).json({ state: st, fout: b.errors.slice(0, 3), spent: b.spent }); }
    const tt = w => { const t = w && w.work_hours && w.work_hours.timetable; return t ? Object.fromEntries(Object.entries(t).map(([d, a]) => [d.slice(0, 3), (a || []).map(x => [x.open, x.close].map(z => z ? String(z.hour).padStart(2, '0') + ':' + String(z.minute).padStart(2, '0') : '').join('-')).join(', ')])) : null; };
    const items = (res0.items || []).map(it => ({ naam: it.title, cat: it.category || null, cats: (it.additional_categories || []).slice(0, 5), catIds: (it.category_ids || []).slice(0, 5), adres: it.address || null, plaats: it.address_info && it.address_info.city || null, land: it.address_info && it.address_info.country_code || null, tel: it.phone || null, site: it.url || null, place_id: it.place_id || null, cid: it.cid || null, lat: it.latitude, lng: it.longitude, score: it.rating && it.rating.value || null, aantal: it.rating && it.rating.votes_count || 0, prijs: it.price_level || null, claimed: it.is_claimed ?? null, uren: tt(it.work_time), status: it.work_time && it.work_time.work_hours && it.work_time.work_hours.current_status || null, beschrijving: (it.description || '').slice(0, 400) || null, foto: it.main_image || null, bijgewerkt: it.last_updated_time || null }));
    await putJSON(store, `cw/listings/page-${st.n}.json`, { t: Date.now(), n: st.n, items });
    st.n++; st.total = res0.total_count ?? st.total; st.token = res0.offset_token || null; st.usd = +(st.usd + b.spent).toFixed(4); if (!st.token || !items.length) { st.done = true; st.klaarOp = new Date().toISOString(); }
    await putJSON(store, stPath, st); await putJSON(store, 'cw/listings/lock.json', { t: 0 }).catch(() => {});
    return res.status(200).json({ state: st, opgehaald: items.length, spent: b.spent });
  }
  if (op === 'catagg') { // Aantal bedrijven per soort in een vaste plaats (Google Business Listings categories_aggregation, ca. $0,01-0,05 per plaats), voor vergelijken welke soorten bedrijven ergens ontbreken. Bewaard in blob; opnieuw ophalen hooguit eens per 30 dagen, max 6 verzoeken per dag.
    const PL = { cw: '12.185,-68.98,38', rotterdam: '51.9225,4.47917,10', amsterdam: '52.3676,4.9041,10', aruba: '12.52,-69.97,25' };
    const pl = String(req.query.plaats || ''); if (!PL[pl]) return res.status(400).json({ error: 'onbekende plaats', plaatsen: Object.keys(PL) });
    const store = getStore(); if (!store) return res.status(503).json({ error: 'geen opslag' });
    const pad = `cw/catagg/${pl}.json`; const oud = await getJSON(store, pad).catch(() => null);
    if (oud && (req.query.vers !== '1' || Date.now() - oud.t < 30 * 864e5)) return res.status(200).json(oud);
    if (!dfsReady()) return res.status(503).json({ error: 'DataForSEO not configured' });
    const dp = `cw/catagg/dag-${today()}.json`; const dag = (await getJSON(store, dp).catch(() => null)) || { n: 0 }; if (dag.n >= 6 || !(await underCap(0.2))) return res.status(200).json({ later: true });
    const { call } = await import('../lib/dfs.js'); const b = budget(0.3); const items = []; let total = null;
    for (let off = 0; off < 3000; off += 1000) { const r = await call('business_data/business_listings/categories_aggregation/live', { location_coordinate: PL[pl], limit: 1000, offset: off, internal_list_limit: 20 }, b); const r0 = (r || [])[0]; if (!r0) break; total = r0.total_count ?? total; const its = r0.items || []; for (const it of its) { const a = it.aggregation || {}; items.push({ cat: it.categories || it.categoiries || null, n: a.count || 0, sites: a.websites_count || 0, top: (a.top_categories || []).slice(0, 20).map(x => [x.category || x.key || x.name, x.count ?? x.value]) }); } dag.n++; if (its.length < 1000) break; }
    await putJSON(store, dp, dag).catch(() => {});
    if (!items.length) return res.status(200).json({ fout: b.errors.slice(0, 3), spent: b.spent });
    const uit = { t: Date.now(), plaats: pl, coord: PL[pl], total, items, spent: b.spent }; await putJSON(store, pad, uit); return res.status(200).json(uit);
  }
  if (op === 'gmb') { // Google-bedrijfsprofiel (score, aantal reviews, site) voor max 25 namen; max GMB_DAY_MAX (standaard 100) namen per dag; gecachet 30 dagen
    if (!dfsReady()) return res.status(503).json({ error: 'DataForSEO not configured' });
    const store = getStore(); const lijst = (() => { try { return JSON.parse(String(req.query.qs || '[]')); } catch { return []; } })().map(x => String(x).trim().slice(0, 120)).filter(Boolean).slice(0, 25);
    const mk = MKT[m] || { loc: 1000009, lang: 'en' }; const loc = m === 'CW' ? 1000009 : mk.loc;
    const dayPath = `reviews/gmbday/${today()}.json`; const day = (store && await getJSON(store, dayPath).catch(() => null)) || { n: 0, cost: 0 };
    const out = []; const b = budget(0.6); const v2 = req.query.v === '2'; const maxN = +(process.env.GMB_DAY_MAX || 700), maxUsd = +(process.env.GMB_DAY_USD || 2.5);
    for (const q2 of lijst) {
      const ck = `reviews/gmb/${keyOf('gmb', q2, m)}.json`; const c = store ? await getJSON(store, ck).catch(() => null) : null;
      if (c && Date.now() - c.t < 30 * 864e5 && (!v2 || c.r.v2 || c.r.niet)) { out.push({ ...c.r, cached: true }); continue; }
      if (day.n >= maxN || (day.cost || 0) + b.spent >= maxUsd || !(await underCap())) { out.push({ q: q2, later: true }); continue; }
      const { call } = await import('../lib/dfs.js'); const r = await call('business_data/google/my_business_info/live', { keyword: q2, location_code: loc, language_code: mk.lang }, b); day.n++;
      const it = ((r || [])[0] || {}).items && r[0].items[0];
      const tt = it && it.work_time && it.work_time.work_hours && it.work_time.work_hours.timetable; const uren = tt ? Object.fromEntries(Object.entries(tt).map(([d, a]) => [d.slice(0, 3), (a || []).map(x => [x.open, x.close].map(t => t ? String(t.hour).padStart(2, '0') + ':' + String(t.minute).padStart(2, '0') : '').join('-')).join(', ')])) : null;
      const rr = it ? { v2: true, q: q2, naam: it.title, score: it.rating && it.rating.value, aantal: it.rating && it.rating.votes_count, site: it.url || null, adres: it.address || null, cat: it.category || null, cats: (it.additional_categories || []).slice(0, 4), cid: it.cid || null, place_id: it.place_id || null, tel: it.phone || null, lat: it.latitude || null, lng: it.longitude || null, uren, claimed: it.is_claimed ?? null, foto: it.main_image || null, prijs: it.price_level || null } : { v2: true, q: q2, niet: true };
      out.push(rr); if (store) await putJSON(store, ck, { t: Date.now(), r: rr }).catch(() => {});
    }
    day.cost = +((day.cost || 0) + b.spent).toFixed(4); if (store) await putJSON(store, dayPath, day).catch(() => {});
    return res.status(200).json({ out, today: day.n, todayUsd: day.cost, spent: b.spent });
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
