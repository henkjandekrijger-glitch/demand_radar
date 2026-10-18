// Keepa: Amazon-historie per product (verkooprang en "bought in past month" door de tijd). Sleutel in Vercel: KEEPA_KEY.
// Eén zoekopdracht = 10 tokens en geeft tot 20 producten met hun volledige historie. Per zoekterm maken we daar twee maandreeksen van:
//   sold: som van "bought in past month" over de producten (tijdgewogen gemiddelde per maand)
//   rank: mediaan van de verkooprang (lager = meer verkocht)
//   price: mediaan van de laagste nieuwprijs (€/$), voor prijs-elasticiteit, kortingsmomenten en prijspositie
// Verzamelen gaat elk uur een stukje (binnen de tokens die er zijn), in keepa/<cc>.json; de toets staat in tools/keepa_test.py.
// Let op bij toetsen: de producten zijn de topproducten van nu; hun verleden is dus niet blind gekozen (zie README).
import { getJSON, putJSON } from './store.js';

const BASE = 'https://api.keepa.com';
export const DOMAIN = { US: 1, GB: 2, DE: 3, FR: 4, JP: 5, CA: 6, IT: 8, ES: 9, IN: 10, MX: 11, NL: 3 }; // amazon.nl staat niet in Keepa: NL via .de
export const keepaReady = () => !!process.env.KEEPA_KEY;
const STATE = 'keepa/state.json', OUT = cc => `keepa/${cc}.json`;
const unix = t => (t + 21564000) * 60000; // Keepa-minuten → ms
const ymOf = ms => new Date(ms).toISOString().slice(0, 7);

async function call(path, params) {
  const u = `${BASE}/${path}?key=${encodeURIComponent(process.env.KEEPA_KEY || '')}&${new URLSearchParams(params)}`;
  const r = await fetch(u, { signal: AbortSignal.timeout(40000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Keepa ${r.status}${j && j.error ? ': ' + (j.error.message || j.error.type || '') : ''}`);
  return j;
}
export async function keepaTokens() { const j = await call('token', {}); return { left: j.tokensLeft, refillIn: j.refillIn, perMinute: j.refillRate }; }

// [tijd, waarde, tijd, waarde, …] (trap: een waarde geldt tot de volgende) → { 'YYYY-MM': tijdgewogen gemiddelde }; -1 = geen data.
export function monthly(pairs, until = Date.now()) {
  const acc = {};
  if (!Array.isArray(pairs) || pairs.length < 2) return {};
  for (let i = 0; i < pairs.length; i += 2) {
    const v = pairs[i + 1]; if (v == null || v < 0) continue;
    let a = unix(pairs[i]); const b = i + 2 < pairs.length ? unix(pairs[i + 2]) : until;
    while (a < b) {
      const d = new Date(a), next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1), e = Math.min(b, next), k = ymOf(a);
      (acc[k] = acc[k] || [0, 0]); acc[k][0] += v * (e - a); acc[k][1] += e - a; a = e;
    }
  }
  return Object.fromEntries(Object.entries(acc).filter(([, [, w]]) => w > 3 * 864e5).map(([k, [s, w]]) => [k, s / w]));
}
const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

// Producten van één zoekopdracht → maandreeksen voor de zoekterm.
export function termSeries(products, until = Date.now()) {
  const ps = (products || []).slice(0, 20), sold = {}, ranks = {}, prices = {};
  for (const p of ps) {
    for (const [k, v] of Object.entries(monthly(p.monthlySoldHistory, until))) sold[k] = (sold[k] || 0) + v;
    const r = monthly(p.csv && p.csv[3], until);
    for (const [k, v] of Object.entries(r)) (ranks[k] = ranks[k] || []).push(v);
    // prijs: laagste nieuwprijs (csv[1], in centen), anders de Amazon-prijs (csv[0]); zelfde zoekopdracht, geen extra tokens
    const pr = monthly(p.csv && (p.csv[1] && p.csv[1].length ? p.csv[1] : p.csv[0]), until);
    for (const [k, v] of Object.entries(pr)) (prices[k] = prices[k] || []).push(v / 100);
  }
  const rank = Object.fromEntries(Object.entries(ranks).filter(([, l]) => l.length >= 3).map(([k, l]) => [k, Math.round(median(l))]));
  const r1 = o => Object.fromEntries(Object.entries(o).sort().map(([k, v]) => [k, Math.round(v)]));
  const price = Object.fromEntries(Object.entries(prices).filter(([, l]) => l.length >= 3).sort().map(([k, l]) => [k, Math.round(median(l) * 100) / 100]));
  return { n: ps.length, price, withSold: ps.filter(p => p.monthlySoldHistory && p.monthlySoldHistory.length).length, sold: r1(sold), rank: r1(rank), top: ps.slice(0, 3).map(p => ({ asin: p.asin, title: String(p.title || '').slice(0, 80) })) };
}

export async function keepaTerm(cc, term) {
  if (!DOMAIN[cc]) throw new Error('country not on Keepa');
  const j = await call('search', { domain: DOMAIN[cc], type: 'product', term });
  return { term, cc, at: new Date().toISOString().slice(0, 10), tokensLeft: j.tokensLeft, ...termSeries(j.products) };
}

// Rij zoektermen klaarzetten (eigenaar): { cc: [termen] }.
export async function keepaQueue(store, add) {
  const st = (await getJSON(store, STATE, null).catch(() => null)) || { queue: {}, done: 0 };
  for (const [cc, l] of Object.entries(add || {})) { if (!DOMAIN[cc]) continue; const have = new Set(st.queue[cc] || []); for (const t of l) if (t) have.add(String(t).toLowerCase().trim()); st.queue[cc] = [...have]; }
  await putJSON(store, STATE, st); return { queued: Object.fromEntries(Object.entries(st.queue).map(([k, v]) => [k, v.length])) };
}

// Elk uur: zoveel zoektermen als de tokens toelaten (10 per stuk), hooguit 'max' en 50 seconden.
export async function keepaCollect(store, { max = 30 } = {}) {
  if (!keepaReady()) return { skip: 'no KEEPA_KEY' };
  const st = (await getJSON(store, STATE, null).catch(() => null)) || { queue: {}, done: 0 };
  const todo = Object.entries(st.queue || {}).flatMap(([cc, l]) => l.map(t => [cc, t]));
  if (!todo.length) return { idle: true };
  let tk = await keepaTokens().catch(e => ({ error: String(e.message || e) }));
  if (tk.error) return tk;
  const n = Math.min(max, Math.floor(tk.left / 10)); if (n < 1) return { wait: 'tokens', ...tk };
  const got = {}, t0 = Date.now(), list = todo.slice(0, n); let left = tk.left, errors = 0, stop = false;
  for (let i = 0; i < list.length && !stop && Date.now() - t0 < 50000; i += 6) { // 6 tegelijk; tokens bepalen het tempo
    await Promise.all(list.slice(i, i + 6).map(async ([cc, t]) => {
      try { const r = await keepaTerm(cc, t); left = Math.min(left, r.tokensLeft); const { tokensLeft, ...keep } = r; (got[cc] = got[cc] || {})[t] = keep; }
      catch (e) { errors++; if (/429|402|token/i.test(String(e.message))) { stop = true; return; } (got[cc] = got[cc] || {})[t] = { error: String(e.message || e).slice(0, 80), at: new Date().toISOString().slice(0, 10) }; }
      st.queue[cc] = st.queue[cc].filter(x => x !== t); st.done = (st.done || 0) + 1;
    }));
    if (left < 60) break;
  }
  for (const [cc, v] of Object.entries(got)) { const f = (await getJSON(store, OUT(cc), null).catch(() => null)) || {}; await putJSON(store, OUT(cc), { ...f, ...v }); }
  st.last = new Date().toISOString(); await putJSON(store, STATE, st);
  return { got: Object.values(got).reduce((a, v) => a + Object.keys(v).length, 0), errors, tokensLeft: left, left: Object.values(st.queue).reduce((a, l) => a + l.length, 0) };
}
export async function keepaData(store, cc) { return (await getJSON(store, OUT(cc), null).catch(() => null)) || {}; }
export async function keepaState(store) { const st = (await getJSON(store, STATE, null).catch(() => null)) || { queue: {} }; return { done: st.done || 0, last: st.last || null, left: Object.fromEntries(Object.entries(st.queue || {}).map(([k, v]) => [k, v.length])) }; }
