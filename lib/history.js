// 5 jaar Google Trends per zoekterm (maanden), bewaard in Blob zodat elke zoekterm maar eens per 60 dagen geld kost.
// Ook de drijvers (weer, economie, kalender) per land: één keer per dag.
import { googleTrends, budget as mkBudget } from './dfs.js';
import { trendMonths } from './forecast.js';
import { getJSON, putJSON } from './store.js';
import { pool } from './core.js';
import { allDrivers } from './drivers.js';

const KEEP_DAYS = 60, MAX_KEYS = 4000;

export async function histories(cc, C, items, b, store, today) {
  const path = `hist/${cc}.json`;
  const cache = (store && await getJSON(store, path, null).catch(() => null)) || {};
  const fresh = k => cache[k] && Date.parse(today) - Date.parse(cache[k].d) < KEEP_DAYS * 864e5;
  const need = [...new Map(items.filter(x => x.k && !fresh(x.k)).map(x => [x.k, x])).values()].sort((a, b2) => (b2.volume || 0) - (a.volume || 0));
  const groups = []; for (let i = 0; i < need.length; i += 5) groups.push(need.slice(i, i + 5).map(x => x.k)); // vergelijkbaar volume samen
  const tb = mkBudget(Math.max(0, b.max - b.spent));
  const got = await pool(groups, 6, g => googleTrends(g, C, tb, 'past_5_years'));
  b.spent += tb.spent; b.calls += tb.calls;
  let added = 0;
  got.forEach((res, gi) => { for (const k of groups[gi]) { const pts = res && (res[k] || res[k.toLowerCase()]); if (pts) { cache[k] = { d: today, T: trendMonths(pts) }; added++; } } });
  if (added && store) {
    const keys = Object.keys(cache);
    if (keys.length > MAX_KEYS) keys.sort((a, b2) => (cache[a].d < cache[b2].d ? -1 : 1)).slice(0, keys.length - MAX_KEYS).forEach(k => delete cache[k]);
    await putJSON(store, path, cache).catch(() => {});
  }
  return Object.fromEntries(items.map(x => [x.k, cache[x.k] ? cache[x.k].T : null]));
}

export async function driversFor(cc, store, today) {
  const path = `drivers/${cc}.json`;
  const c = store && await getJSON(store, path, null).catch(() => null);
  if (c && c.day === today) return c;
  const d = await allDrivers(cc, '2021-01-01');
  const lastKey = o => Object.keys(o || {}).sort().pop() || null;
  const known = {};
  for (const [n, s] of Object.entries(d.drivers)) known[n] = ['temp', 'sun', 'rain'].includes(n) ? (d.weatherUntil || '').slice(0, 7) || lastKey(s) : ['weekend', 'easter', 'carnival', 'pentecost', 'school'].includes(n) ? '2099-12' : lastKey(s);
  const out = { day: today, ...d, known };
  if (store) await putJSON(store, path, out).catch(() => {});
  return out;
}
