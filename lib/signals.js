// Signalen van mensen: "klopt / klopt niet" op de radar, welke ideeën mensen checken, en resultaten van eigen campagnes.
// Elke melding is een klein bestand in Blob (wachtrij); de uurronde telt ze op in één stand: signals/state.json.
import { getJSON, putJSON } from './store.js';

const Q = { fb: 'fbq/', chk: 'chq/', out: 'outq/' };
const STATE = 'signals/state.json';
const rid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const clean = (s, n = 80) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, n);
const CC = new Set(['NL', 'DE', 'US', 'WW']);

export async function queue(store, kind, data) {
  if (!store || !Q[kind]) return false;
  await store.put(`${Q[kind]}${rid()}.json`, JSON.stringify({ ...data, t: new Date().toISOString() }), 'application/json');
  return true;
}
export const feedback = (store, { cc, k, cat, vote, view }) => {
  cc = String(cc || '').toUpperCase(); k = clean(k); vote = +vote > 0 ? 1 : -1;
  if (!CC.has(cc) || k.length < 2) return false;
  return queue(store, 'fb', { cc, k, cat: clean(cat, 20), vote, view: clean(view, 20) });
};
export const checked = (store, { cc, q }) => { cc = String(cc || '').toUpperCase(); q = clean(q); return CC.has(cc) && q.length >= 2 ? queue(store, 'chk', { cc, q }) : false; };
export const outcome = (store, o) => {
  const cc = String(o.cc || '').toUpperCase(), k = clean(o.term || o.keyword);
  if (!CC.has(cc) || k.length < 2) return false;
  const n = x => Math.max(0, +x || 0);
  return queue(store, 'out', { cc, k, network: clean(o.network, 30), clicks: n(o.clicks), conversions: n(o.conversions), spend: n(o.spend), revenue: n(o.revenue), day: String(o.date || '').slice(0, 10) });
};

export async function loadSignals(store) {
  const s = store ? await getJSON(store, STATE, null).catch(() => null) : null;
  return s || { fb: {}, checks: {}, out: {}, updated: null };
}

// Uurronde: wachtrijen leegmaken en optellen. Checks onthouden we 30 dagen (per dag geteld).
export async function aggregate(store, now = new Date()) {
  const st = await loadSignals(store), day = now.toISOString().slice(0, 10);
  let n = 0;
  for (const [kind, prefix] of Object.entries(Q)) {
    const blobs = (await store.list(prefix)).slice(0, 2000);
    for (const b of blobs) {
      let x; try { x = JSON.parse(await store.get(b.pathname)); } catch { continue; }
      if (!x) continue;
      const key = `${x.cc}|${x.k || x.q}`;
      if (kind === 'fb') { const o = st.fb[key] || (st.fb[key] = { up: 0, down: 0, cat: x.cat || null }); x.vote > 0 ? o.up++ : o.down++; }
      if (kind === 'chk') { const o = st.checks[key] || (st.checks[key] = { days: {} }); o.days[day] = (o.days[day] || 0) + 1; }
      if (kind === 'out') { const o = st.out[key] || (st.out[key] = { clicks: 0, conversions: 0, spend: 0, revenue: 0, networks: [] }); for (const f of ['clicks', 'conversions', 'spend', 'revenue']) o[f] = Math.round((o[f] + x[f]) * 100) / 100; if (x.network && !o.networks.includes(x.network)) o.networks.push(x.network); o.last = x.day || day; }
      n++;
    }
    if (blobs.length) { await putJSON(store, STATE, { ...st, updated: now.toISOString() }); await store.del(blobs.map(b => b.url)); }
  }
  const cutoff = new Date(now.getTime() - 30 * 864e5).toISOString().slice(0, 10);
  for (const [k, o] of Object.entries(st.checks)) { for (const d of Object.keys(o.days)) if (d < cutoff) delete o.days[d]; if (!Object.keys(o.days).length) delete st.checks[k]; }
  st.updated = now.toISOString();
  await putJSON(store, STATE, st);
  return { counted: n };
}

// Voor de nachtelijke opbouw: wat mensen checkten (meest eerst), en per onderwerp een gewicht uit feedback en campagnes.
export function topChecks(st, cc, n = 40) {
  return Object.entries(st.checks || {}).filter(([k]) => k.startsWith(cc + '|')).map(([k, o]) => ({ q: k.slice(3), n: Object.values(o.days).reduce((a, b) => a + b, 0) })).sort((a, b) => b.n - a.n).slice(0, n);
}
export function humanWeight(st, cc, keys) {
  let w = 1, block = false, proven = null;
  for (const k of keys) {
    const f = st.fb && st.fb[`${cc}|${k}`];
    if (f) { if (f.down >= 2 && f.down > f.up * 2) block = true; w *= Math.min(1.5, 1 + 0.1 * f.up) * Math.max(0.5, 1 - 0.15 * f.down); }
    const o = st.out && st.out[`${cc}|${k}`];
    if (o) { if (o.conversions > 0) { w *= 1.3; proven = o; } else if (o.spend >= 10) w *= 0.7; }
  }
  return { w: Math.round(w * 100) / 100, block, proven };
}
