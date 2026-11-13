// Voorspellingsboek (13 nov 2026, Henkjan: "verbeter totaal en zorg dat je blijft leren").
// Alles wat de radar voorspelt of aandraagt wordt vastgelegd met een VOORAF vastgelegde meetlat en later automatisch
// nagekeken zodra de maanddata binnen is (de termen gaan op de kijklijst early/series-<cc>.json, die ze maandelijks ververst).
// Elke uitkomst telt mee tegen de basiskans: hoe vaak hetzelfde gebeurde bij álle termen op de kijklijst in dezelfde maanden.
// Zo zie je per soort, land, categorie, bron en kans of de radar beter is dan toeval, en daar leert de rangorde van.
//   ledger/open.json     { v, items: { id: entry } }       nog na te kijken
//   ledger/graded.json   { items: [entry + uitkomst] }     laatste 6.000 nagekeken (voor het bijleren)
//   ledger/summary.json  tellers per soort/land/categorie/bron/kans, plus de basiskansen
import { getJSON, putJSON } from './store.js';

const OPEN = 'ledger/open.json', LOG = 'ledger/graded.json', SUM = 'ledger/summary.json';
export const LEDGER_PATHS = { OPEN, LOG, SUM };
// De meetlatten (in de eigen woorden van de radar). Nooit achteraf aanpassen: een nieuwe regel = een nieuwe soort.
export const RULES = {
  rise: 'Will rise: the predicted month is at least 40% above the month "now"',
  now: 'Rising now: the next month is at least as high as the month the radar saw',
  src: 'Source tip: within 3 months at least 40% above the month the source pointed at it',
  event: 'Event: the month after is at least 20% higher (more) or lower (less) than the month before',
};
const CCS = ['NL', 'DE', 'US'];
const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
export const addM = (s, n) => { const [y, m] = String(s).split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return ym(d.getUTCFullYear(), d.getUTCMonth() + 1); };
export const cleanK = k => String(k || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
const FLOOR = 50; // onder 50 zoekopdrachten per maand is elke beweging ruis

// Maanddata als vaste rij per term (snel en zuinig met geheugen bij ± 20.000 termen per land).
const M0 = 2015 * 12;
const mi = s => { const [y, m] = String(s).split('-').map(Number); return y * 12 + m - 1 - M0; };
export function toArr(rows) {
  const a = new Float32Array(180).fill(NaN);
  for (const r of rows || []) { const i = r[0] * 12 + r[1] - 1 - M0; if (i >= 0 && i < 180) a[i] = +r[2] || 0; }
  return a;
}
const getter = at => (at instanceof Float32Array ? m => { const v = at[mi(m)]; return Number.isNaN(v) || v === undefined ? null : v; } : m => (at && at[m] != null ? +at[m] : null));

// Een meetlat tegen de maanddata van één term (at: { 'JJJJ-MM': volume } of een rij uit toArr). → { state: waiting|hit|miss, v, ref }
export function judgeEntry(e, at) {
  const g = getter(at);
  if (e.kind === 'rise') {
    const ref = g(e.now), v = g(e.target); if (ref == null || v == null) return { state: 'waiting' };
    return { state: v >= 1.4 * Math.max(ref, FLOOR) ? 'hit' : 'miss', v, ref };
  }
  if (e.kind === 'now') {
    const ref = g(e.base), v = g(addM(e.base, 1)); if (ref == null || v == null) return { state: 'waiting' };
    return { state: v >= Math.max(ref, FLOOR) ? 'hit' : 'miss', v, ref };
  }
  if (e.kind === 'src') {
    const ref = g(e.base); if (ref == null) return { state: 'waiting' };
    const nx = [1, 2, 3].map(i => g(addM(e.base, i))), best = Math.max(...nx.filter(x => x != null), -1);
    if (best >= 1.4 * Math.max(ref, FLOOR)) return { state: 'hit', v: best, ref };
    return nx.every(x => x != null) ? { state: 'miss', v: best, ref } : { state: 'waiting' };
  }
  if (e.kind === 'event') {
    const ref = g(addM(e.month, -1)), v = g(addM(e.month, 1)); if (ref == null || v == null) return { state: 'waiting' };
    const ok = e.dir === 'less' ? v <= 0.8 * Math.max(ref, FLOOR) : v >= 1.2 * Math.max(ref, FLOOR);
    return { state: ok ? 'hit' : 'miss', v, ref };
  }
  return { state: 'waiting' };
}

// Basiskans: dezelfde meetlat op alle termen van de kijklijst (met ≥ 100 zoekopdrachten in de vergelijkingsmaand).
export function baseRate(arrs, e) {
  let n = 0, hit = 0; const ri = mi(e.kind === 'rise' ? e.now : e.kind === 'event' ? addM(e.month, -1) : e.base);
  for (const a of arrs) {
    if (!(a[ri] >= 100)) continue;
    const r = judgeEntry(e, a); if (r.state === 'waiting') continue;
    n++; if (r.state === 'hit') hit++;
  }
  return n >= 200 ? { n, rate: hit / n } : null;
}

// Vastleggen: één regel per soort + land + term + maand (dagelijks dezelfde term telt één keer).
// entries: [{ kind, cc, k, cat?, srcs?, p? (0-100), now?, target?, base?, month?, dir? }]
const CAP_SRC = 200; // per bron per land per maand: genoeg om te toetsen, klein genoeg om te bewaren
export async function recordPredictions(store, entries, today = new Date().toISOString().slice(0, 10)) {
  if (!store || !entries || !entries.length) return { added: 0 };
  const o = (await getJSON(store, OPEN, null).catch(() => null)) || { v: 1, items: {} };
  const perSrc = {}; for (const x of Object.values(o.items)) if (x.kind === 'src') { const c = `${x.src}|${x.cc}|${x.base}`; perSrc[c] = (perSrc[c] || 0) + 1; }
  let added = 0; const queue = {};
  for (const e of entries) {
    const k = cleanK(e.k); if (!k || k.length < 2 || !CCS.includes(e.cc) || !RULES[e.kind]) continue;
    const when = e.kind === 'rise' ? e.target : e.kind === 'event' ? e.month : e.base; if (!/^\d{4}-\d\d$/.test(when || '')) continue;
    const id = `${e.kind}|${e.cc}|${k}|${when}${e.kind === 'src' ? `|${e.src}` : ''}${e.kind === 'event' ? `|${e.dir}` : ''}`;
    if (o.items[id]) continue;
    if (e.kind === 'src') { const c = `${e.src}|${e.cc}|${e.base}`; if ((perSrc[c] || 0) >= CAP_SRC) continue; perSrc[c] = (perSrc[c] || 0) + 1; }
    o.items[id] = { kind: e.kind, cc: e.cc, k, made: today, ...(e.cat ? { cat: e.cat } : {}), ...(e.src ? { src: e.src } : {}), ...(e.srcs && e.srcs.length ? { srcs: e.srcs.slice(0, 6) } : {}),
      ...(e.p != null ? { p: Math.round(e.p) } : {}), ...(e.now ? { now: e.now } : {}), ...(e.target ? { target: e.target } : {}), ...(e.base ? { base: e.base } : {}),
      ...(e.month ? { month: e.month, dir: e.dir === 'less' ? 'less' : 'more' } : {}), ...(e.title ? { title: String(e.title).slice(0, 80) } : {}) };
    (queue[e.cc] = queue[e.cc] || new Set()).add(k); added++;
  }
  if (added) {
    await putJSON(store, OPEN, o);
    // de termen gaan op de kijklijst: hun maanddata komt bij de volgende ophaalronde (binnen het DataForSEO-plafond)
    try { const { queueEarlyTerms } = await import('./earlydata.js'); for (const [cc, s] of Object.entries(queue)) await queueEarlyTerms(store, cc, [...s]); } catch {}
  }
  return { added, open: Object.keys(o.items).length };
}

const bucket = p => (p == null ? null : p >= 95 ? '95+' : p >= 90 ? '90-94' : p >= 85 ? '85-89' : p >= 80 ? '80-84' : p >= 75 ? '75-79' : p >= 70 ? '70-74' : '<70');
const add = (o, key, hit, exp) => { if (key == null) return; const s = (o[key] = o[key] || { n: 0, hit: 0, exp: 0 }); s.n++; if (hit) s.hit++; s.exp = Math.round((s.exp + (exp ?? 0)) * 1000) / 1000; };

// Nakijken (dagelijks vanuit /api/loop, gratis: alleen de kijklijst lezen).
export async function gradeLedger(store, now = new Date(), { force = false } = {}) {
  const today = now.toISOString().slice(0, 10);
  const sum = (await getJSON(store, SUM, null).catch(() => null)) || { v: 1, since: today, totals: {} };
  if (!force && sum.day === today) return { ledger: 'up to date' };
  const o = (await getJSON(store, OPEN, null).catch(() => null)) || { v: 1, items: {} };
  const ids = Object.keys(o.items);
  if (!ids.length) { await putJSON(store, SUM, { ...sum, day: today, open: 0 }); return { graded: 0, open: 0 }; }
  const ser = {}; // per land: term → rij (één keer omgezet)
  for (const cc of CCS) if (ids.some(id => id.split('|')[1] === cc)) {
    const raw = (await getJSON(store, `early/series-${cc}.json`, null).catch(() => null)) || { kw: {} }, map = new Map();
    for (const [k, s] of Object.entries(raw.kw || {})) if (s && s.m) map.set(k, toArr(s.m));
    ser[cc] = map;
  }
  const log = (await getJSON(store, LOG, null).catch(() => null)) || { items: [] };
  const baseCache = new Map(), T = sum.totals || {};
  let graded = 0, expired = 0;
  for (const id of ids) {
    const e = o.items[id], at = ser[e.cc] && ser[e.cc].get(e.k);
    const r = at ? judgeEntry(e, at) : { state: 'waiting' };
    if (r.state === 'waiting') { if (Date.parse(e.made) < now.getTime() - 270 * 864e5) { delete o.items[id]; expired++; } continue; }
    const bk = `${e.cc}|${e.kind}|${e.now || e.base || e.month}|${e.target || ''}|${e.dir || ''}`;
    if (!baseCache.has(bk)) baseCache.set(bk, baseRate(ser[e.cc].values(), e));
    const b = baseCache.get(bk), hit = r.state === 'hit', exp = b ? b.rate : null;
    const K = (T[e.kind] = T[e.kind] || { all: { n: 0, hit: 0, exp: 0 }, cc: {}, cat: {}, src: {}, chance: {}, month: {} });
    const t = e.target || e.base || e.month;
    add(K, 'all', hit, exp); add(K.cc, e.cc, hit, exp); add(K.cat, e.cat, hit, exp); add(K.month, t, hit, exp);
    for (const sname of [e.src, ...(e.srcs || [])].filter(Boolean)) add(K.src, sname, hit, exp);
    if (e.kind === 'rise') add(K.chance, bucket(e.p), hit, exp);
    log.items.push({ ...e, res: r.state, v: r.v, ref: r.ref, base: e.base, baseRate: exp != null ? Math.round(exp * 1000) / 1000 : null, graded: today });
    delete o.items[id]; graded++;
  }
  log.items = log.items.slice(-6000);
  const out = { v: 1, since: sum.since || today, day: today, at: now.toISOString(), totals: T, open: Object.keys(o.items).length, graded: (sum.graded || 0) + graded, expired: (sum.expired || 0) + expired, rules: RULES };
  await Promise.all([putJSON(store, OPEN, o), putJSON(store, LOG, log), putJSON(store, SUM, out)]);
  return { graded, expired, open: out.open };
}

// Leesbaar overzicht (voor /api/demand, de overdracht en de site): raak-percentage tegen de basiskans.
export function ledgerView(sum) {
  if (!sum || !sum.totals) return null;
  const pct = s => (s && s.n ? Math.round((100 * s.hit) / s.n) : null), base = s => (s && s.n ? Math.round((100 * s.exp) / s.n) : null);
  const row = s => (s && s.n ? { n: s.n, hit: pct(s), base: base(s) } : null);
  const kinds = {};
  for (const [kind, K] of Object.entries(sum.totals)) {
    kinds[kind] = { ...row(K.all), cc: Object.fromEntries(Object.entries(K.cc || {}).map(([k, s]) => [k, row(s)])),
      cat: Object.fromEntries(Object.entries(K.cat || {}).filter(([, s]) => s.n >= 10).map(([k, s]) => [k, row(s)])),
      src: Object.fromEntries(Object.entries(K.src || {}).filter(([, s]) => s.n >= 10).map(([k, s]) => [k, row(s)])),
      ...(kind === 'rise' ? { chance: Object.fromEntries(Object.entries(K.chance || {}).map(([k, s]) => [k, row(s)])) } : {}) };
  }
  return { since: sum.since, day: sum.day, open: sum.open || 0, graded: sum.graded || 0, kinds, rules: RULES };
}
export async function loadLedger(store) {
  if (!store) return null;
  return getJSON(store, SUM, null).catch(() => null);
}

// Gewichten voor de rangorde: per categorie en per bron raak tegen de basiskans (soorten now en src samen).
// Vorm zoals demandlearn.weight verwacht: { cat: { naam: { hit, miss, exp } }, src: { ... } }
export function ledgerScores(sum) {
  const out = { cat: {}, src: {} }; if (!sum || !sum.totals) return out;
  for (const kind of ['now', 'src', 'rise']) {
    const K = sum.totals[kind]; if (!K) continue;
    for (const part of ['cat', 'src']) for (const [k, s] of Object.entries(K[part] || {})) {
      const o = (out[part][k] = out[part][k] || { hit: 0, miss: 0, exp: 0 }); o.hit += s.hit; o.miss += s.n - s.hit; o.exp += s.exp || 0;
    }
  }
  return out;
}
