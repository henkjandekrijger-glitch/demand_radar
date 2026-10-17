// Vroege signalen bewaren en verversen (Blob, privé).
// early/series-<cc>.json  { month, at, kw: { zoekterm: { m: [[jaar, maand, volume], ...], cpc } } }  — de "kijklijst" met 4 jaar maanddata
// early/added-<cc>.json   zoektermen die iemand checkte (gratis: de check haalt de 4 jaar al op), gaan bij de volgende verversing mee
// early/pending-<cc>.json  nieuwe zoektermen uit de radar (alleen de woorden); hun 4 jaar wordt dagelijks in één keer opgehaald
// early/latest.json       de lijst die de radar toont; early/state.json  wanneer er voor het laatst ververst is
import { getJSON, putJSON } from './store.js';
import { earlySignal, MINV, EARLY } from './early.js';

export const EARLY_CCS = Object.keys(MINV);
const SER = cc => `early/series-${cc}.json`, ADDED = cc => `early/added-${cc}.json`, PENDING = cc => `early/pending-${cc}.json`, LATEST = 'early/latest.json', STATE = 'early/state.json';
const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const lastYm = m => (m && m.length ? m.reduce((a, x) => (ym(x[0], x[1]) > a ? ym(x[0], x[1]) : a), '') : '');
const asRows = monthly => (monthly || []).map(x => (Array.isArray(x) ? x : [x.y ?? x.year, x.m ?? x.month, x.v ?? x.search_volume ?? 0]));

export async function latestEarly(store) { return store ? getJSON(store, LATEST, null).catch(() => null) : null; }

// Kijklijst aanvullen (eigenaar): { zoekterm: { m: [[j, m, v]], cpc } }
export async function seedEarly(store, cc, series) {
  const cur = (await getJSON(store, SER(cc), null).catch(() => null)) || { kw: {} };
  for (const [k, s] of Object.entries(series || {})) if (s && s.m && s.m.length) cur.kw[k] = { m: asRows(s.m), cpc: s.cpc ?? null };
  cur.month = Object.values(cur.kw).reduce((a, s) => (lastYm(s.m) > a ? lastYm(s.m) : a), ''); cur.at = new Date().toISOString();
  await putJSON(store, SER(cc), cur);
  return { cc, terms: Object.keys(cur.kw).length, month: cur.month };
}

// Een gecheckte zoekterm onthouden (max 3.000 per land).
export async function addEarlyTerm(store, cc, k, monthly, cpc = null) {
  if (!store || !MINV[cc] || !k || !monthly || monthly.length < 27) return;
  const a = (await getJSON(store, ADDED(cc), null).catch(() => null)) || {};
  a[k] = { m: asRows(monthly), cpc, d: new Date().toISOString().slice(0, 10) };
  const keys = Object.keys(a); if (keys.length > 3000) keys.sort((x, y) => (a[x].d < a[y].d ? -1 : 1)).slice(0, keys.length - 3000).forEach(x => delete a[x]);
  await putJSON(store, ADDED(cc), a);
}

// Nieuwe zoektermen uit de radar op de wachtlijst (gratis; de data komt bij de volgende dagelijkse ophaalronde).
export async function queueEarlyTerms(store, cc, keywords) {
  if (!store || !MINV[cc] || !keywords || !keywords.length) return 0;
  const s = (await getJSON(store, SER(cc), null).catch(() => null)) || { kw: {} }, q = (await getJSON(store, PENDING(cc), null).catch(() => null)) || {};
  const day = new Date().toISOString().slice(0, 10); let n = 0;
  for (const k of new Set(keywords.map(x => String(x || '').toLowerCase().trim()).filter(Boolean))) if (!s.kw[k] && !q[k]) { q[k] = day; n++; }
  if (n) await putJSON(store, PENDING(cc), q);
  return n;
}

// Wachtlijst ophalen: 4 jaar maanddata, max 2.000 termen per land per keer (± $0,15).
export async function fetchPending(store, { max = 0.6 } = {}) {
  const { searchVolume, budget, dfsReady } = await import('./dfs.js'), { COUNTRIES } = await import('./niches.js');
  if (!dfsReady()) return { ok: false };
  const b = budget(max), res = {};
  for (const cc of EARLY_CCS) {
    const q = (await getJSON(store, PENDING(cc), null).catch(() => null)) || {}, kws = Object.keys(q).slice(0, 2000);
    if (!kws.length) continue;
    const s = (await getJSON(store, SER(cc), null).catch(() => null)) || { kw: {} };
    let got = 0, done = 0;
    for (let i = 0; i < kws.length; i += 1000) {
      if (b.spent + 0.1 > b.max) break;
      const part = kws.slice(i, i + 1000), v = await searchVolume(part, COUNTRIES[cc], b, { months: 48 }).catch(() => null);
      if (!v) break;
      for (const [k, x] of Object.entries(v)) if (x.monthly && x.monthly.length >= 27) { s.kw[k] = { m: x.monthly.map(r => [r.y, r.m, r.v]), cpc: x.cpc }; got++; }
      for (const k of part) delete q[k]; done += part.length;
    }
    if (got) { s.month = Object.values(s.kw).reduce((a, x) => (lastYm(x.m) > a ? lastYm(x.m) : a), ''); s.at = new Date().toISOString(); await putJSON(store, SER(cc), s); }
    if (done) await putJSON(store, PENDING(cc), q);
    res[cc] = { asked: done, got, left: Object.keys(q).length };
  }
  return { ok: true, spent: Math.round(b.spent * 1000) / 1000, res };
}

// Alle termen doorrekenen (gratis) → early/latest.json
export async function scoreEarly(store) {
  const items = [], counts = {};
  let month = '';
  for (const cc of EARLY_CCS) {
    const s = (await getJSON(store, SER(cc), null).catch(() => null)) || { kw: {} }, add = (await getJSON(store, ADDED(cc), null).catch(() => null)) || {};
    const kw = { ...add, ...s.kw }; // de verse kijklijst wint
    if (s.month > month) month = s.month;
    const groups = new Map(), why = {};
    for (const [k, x] of Object.entries(kw)) {
      const sig = earlySignal(x.m, cc, k);
      if (!sig || sig.skip) { why[sig ? sig.skip : 'none'] = (why[sig ? sig.skip : 'none'] || 0) + 1; continue; }
      if (sig.call !== 'early') { why.low = (why.low || 0) + 1; continue; }
      // te klein om nu al iets mee te doen ("starting" moet de doorbraakgrens al halen)
      if (sig.now.v < MINV[cc] * (sig.tier === 'starting' ? 1 : 0.5)) { why.tiny = (why.tiny || 0) + 1; continue; }
      const rows = [...x.m].sort((a, b) => a[0] - b[0] || a[1] - b[1]), fp = rows.slice(-24).map(r => r[2]).join(',');
      const it = { cc, k, tier: sig.tier, chance: sig.chance, p: sig.p, now: sig.now, lastYear: sig.lastYear, reasons: sig.reasons, cpc: x.cpc ?? null, series: rows.slice(-13).map(([y, m, v]) => ({ y, m, v })) };
      (groups.get(fp) || groups.set(fp, []).get(fp)).push(it);
    }
    // varianten met precies dezelfde cijfers (xbox series x / xbox serie x): de gangbaarste schrijfwijze blijft
    const seen = new Map();
    for (const [fp, g] of groups) {
      const freq = {}; for (const it of g) for (const w of new Set(it.k.split(' '))) freq[w] = (freq[w] || 0) + 1;
      const sc = it => it.k.split(' ').reduce((t, w) => t + freq[w], 0) / it.k.split(' ').length;
      seen.set(fp, g.sort((a, b) => sc(b) - sc(a) || a.k.length - b.k.length)[0]);
    }
    const list = [...seen.values()].sort((a, b) => b.p - a.p || b.now.v - a.now.v);
    counts[cc] = { terms: Object.keys(kw).length, shown: list.length, skipped: why };
    items.push(...list);
  }
  const out = { made: new Date().toISOString(), day: new Date().toISOString().slice(0, 10), month, model: EARLY && { version: EARLY.version, trained: EARLY.trained, test: EARLY.test }, counts, items };
  await putJSON(store, LATEST, out);
  return { month, counts, shown: items.length };
}

// Verse 4-jaarsdata ophalen voor de hele kijklijst (± $0,075 per 1.000 termen), daarna doorrekenen.
export async function refreshEarly(store, { max = 1.5 } = {}) {
  const { searchVolume, budget, dfsReady } = await import('./dfs.js'), { COUNTRIES } = await import('./niches.js');
  if (!dfsReady()) return { ok: false, reason: 'no DataForSEO' };
  const b = budget(max), res = {};
  for (const cc of EARLY_CCS) {
    const s = (await getJSON(store, SER(cc), null).catch(() => null)) || { kw: {} }, add = (await getJSON(store, ADDED(cc), null).catch(() => null)) || {};
    const kws = [...new Set([...Object.keys(s.kw), ...Object.keys(add)])];
    let got = 0;
    for (let i = 0; i < kws.length; i += 1000) {
      if (b.spent + 0.1 > b.max) break;
      const v = await searchVolume(kws.slice(i, i + 1000), COUNTRIES[cc], b, { months: 48 }).catch(() => ({}));
      for (const [k, x] of Object.entries(v)) if (x.monthly && x.monthly.length >= 27) { s.kw[k] = { m: x.monthly.map(r => [r.y, r.m, r.v]), cpc: x.cpc }; got++; }
    }
    s.month = Object.values(s.kw).reduce((a, x) => (lastYm(x.m) > a ? lastYm(x.m) : a), ''); s.at = new Date().toISOString();
    if (got) await putJSON(store, SER(cc), s);
    res[cc] = { terms: kws.length, fresh: got, month: s.month };
  }
  const st0 = (await getJSON(store, STATE, null).catch(() => null)) || {};
  await putJSON(store, STATE, { ...st0, at: new Date().toISOString(), spent: Math.round(b.spent * 1000) / 1000, res }).catch(() => {});
  return { ok: true, spent: Math.round(b.spent * 1000) / 1000, res, score: await scoreEarly(store) };
}

// Elk uur vanuit /api/loop: dagelijks (gratis) opnieuw doorrekenen; maandelijks verse data zodra Google de nieuwe maand heeft.
export async function autoEarly(store, now = new Date()) {
  const L = await latestEarly(store), today = now.toISOString().slice(0, 10);
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)), want = ym(prev.getUTCFullYear(), prev.getUTCMonth() + 1);
  if (L && L.month && L.month < want && now.getUTCDate() >= 12) {
    const st = await getJSON(store, STATE, null).catch(() => null);
    if (!st || !st.at || Date.now() - Date.parse(st.at) > 3 * 864e5) {
      const { underCap } = await import('./dfs.js');
      if (await underCap(1)) return { refresh: await refreshEarly(store) };
    }
  }
  // nieuwe termen uit de radar: één ophaalronde per dag
  const st = await getJSON(store, STATE, null).catch(() => null), out = {};
  if (!st || !st.pendingDay || st.pendingDay !== today) {
    const { underCap } = await import('./dfs.js');
    if (await underCap(1)) { out.pending = await fetchPending(store); await putJSON(store, STATE, { ...(st || {}), pendingDay: today }).catch(() => {}); }
  }
  if (!L || L.day !== today || (out.pending && Object.values(out.pending.res || {}).some(r => r.got))) out.score = await scoreEarly(store);
  return Object.keys(out).length ? out : { early: 'up to date' };
}
