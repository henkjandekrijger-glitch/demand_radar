// Drijvers van vraag, per land en per maand: weer, economie en kalender. Alles gratis en zonder sleutel.
//  - weer: Open-Meteo (archief + 16 dagen vooruit), gemiddeld over grote steden
//  - economie: consumentenvertrouwen (Eurostat / FRED), hypotheekrente (ECB / FRED), energieprijzen (Eurostat HICP / FRED)
//  - kalender: weekenddagen, de weken vóór Pasen / carnaval / Pinksteren, schoolvakanties (OpenHolidays)
// Uitvoer: { name: { 'YYYY-MM': waarde } }. Bekende toekomst: kalender altijd, weer tot 16 dagen vooruit.
import { get, pool } from './core.js';
import { easter } from './calendar.js';

const CITIES = {
  NL: [[52.37, 4.9], [51.44, 5.47], [53.22, 6.57], [51.92, 4.48]],
  DE: [[52.52, 13.41], [50.11, 8.68], [48.14, 11.58], [53.55, 9.99], [51.23, 6.78]],
  US: [[40.71, -74.01], [41.88, -87.63], [34.05, -118.24], [29.76, -95.37], [33.75, -84.39], [33.45, -112.07], [47.61, -122.33], [39.95, -75.17]],
};
const ym = d => d.slice(0, 7);
const pad = n => String(n).padStart(2, '0');
const DAY = 864e5;
const iso = t => new Date(t).toISOString().slice(0, 10);

function monthlyMean(byDay) { // { 'YYYY-MM-DD': v } → { 'YYYY-MM': gemiddelde }
  const s = {};
  for (const [d, v] of Object.entries(byDay)) { if (v == null || !isFinite(v)) continue; const k = ym(d); (s[k] = s[k] || [0, 0]); s[k][0] += v; s[k][1]++; }
  return Object.fromEntries(Object.entries(s).map(([k, [t, n]]) => [k, Math.round((t / n) * 100) / 100]));
}

// ---------- weer ----------
export async function weatherMonthly(cc, from = '2023-09-01') {
  const today = iso(Date.now()), archEnd = iso(Date.now() - 6 * DAY);
  const per = await pool(CITIES[cc], 4, async ([lat, lon]) => {
    const vars = 'temperature_2m_mean,precipitation_sum,sunshine_duration';
    const [a, f] = await Promise.all([
      get(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${from}&end_date=${archEnd}&daily=${vars}&timezone=UTC`, { timeout: 20000 }),
      get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&past_days=10&forecast_days=16&daily=${vars}&timezone=UTC`, { timeout: 15000 }),
    ]);
    const out = {};
    for (const src of [a, f]) { const d = src && src.daily; if (!d) continue; d.time.forEach((t, i) => { out[t] = [d.temperature_2m_mean[i], d.precipitation_sum[i], d.sunshine_duration[i]]; }); }
    return out;
  });
  const days = {};
  for (const city of per.filter(Boolean)) for (const [d, v] of Object.entries(city)) { (days[d] = days[d] || []).push(v); }
  const avg = i => Object.fromEntries(Object.entries(days).map(([d, vs]) => { const x = vs.map(v => v[i]).filter(v => v != null); return [d, x.length ? x.reduce((t, v) => t + v, 0) / x.length : null]; }));
  const temp = monthlyMean(avg(0)), rain = monthlyMean(avg(1)), sun = monthlyMean(Object.fromEntries(Object.entries(avg(2)).map(([d, v]) => [d, v == null ? null : v / 3600])));
  const lastDay = Object.keys(days).sort().pop();
  return { temp, rain, sun, weatherUntil: lastDay, today };
}

// ---------- economie ----------
function eurostat(j) {
  const idx = j && j.dimension && j.dimension.time && j.dimension.time.category.index;
  if (!idx) return {};
  const out = {};
  for (const [t, i] of Object.entries(idx)) { const v = j.value[i]; if (v != null) out[t.replace(/M(\d\d)$/, '-$1')] = v; }
  return out;
}
function csvSeries(text, dateCol, valCol) {
  const lines = String(text).trim().split(/\r?\n/), head = lines[0].split(',');
  const di = typeof dateCol === 'number' ? dateCol : head.indexOf(dateCol), vi = typeof valCol === 'number' ? valCol : head.indexOf(valCol);
  const byMonth = {};
  for (const l of lines.slice(1)) { const c = l.split(','); const d = c[di], v = parseFloat(c[vi]); if (!d || !isFinite(v)) continue; const k = d.slice(0, 7); (byMonth[k] = byMonth[k] || []).push(v); }
  return Object.fromEntries(Object.entries(byMonth).map(([k, a]) => [k, Math.round((a.reduce((t, x) => t + x, 0) / a.length) * 1000) / 1000]));
}
const fred = async id => csvSeries(await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=2021-01-01`, { text: true, timeout: 15000 }), 0, 1);
const EUROSTAT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';

export async function economyMonthly(cc) {
  const s = async fn => { try { return await fn(); } catch { return {}; } };
  if (cc === 'US') {
    const [confidence, mortgage, energy] = await Promise.all([s(() => fred('UMCSENT')), s(() => fred('MORTGAGE30US')), s(() => fred('CPIENGSL'))]);
    return { confidence, mortgage, energy };
  }
  const [confidence, mortgage, energy] = await Promise.all([
    s(async () => eurostat(await get(`${EUROSTAT}/ei_bsco_m?geo=${cc}&indic=BS-CSMCI&s_adj=SA&unit=BAL&format=JSON&sinceTimePeriod=2021-01`, { timeout: 15000 }))),
    s(async () => csvSeries(await get(`https://data-api.ecb.europa.eu/service/data/MIR/M.${cc}.B.A2C.AM.R.A.2250.EUR.N?format=csvdata&startPeriod=2021-01`, { text: true, timeout: 15000 }), 'TIME_PERIOD', 'OBS_VALUE')),
    s(async () => {
      // Eurostat ging in 2026 over op 2025=100 (I25); oude reeks (I15) erachter plakken op dezelfde schaal.
      const [a, b] = await Promise.all(['I15', 'I25'].map(u => get(`${EUROSTAT}/prc_hicp_midx?geo=${cc}&coicop=NRG&unit=${u}&format=JSON&sinceTimePeriod=2021-01`, { timeout: 15000 }).then(eurostat).catch(() => ({}))));
      const common = Object.keys(a).filter(k => b[k] != null);
      if (!common.length) return Object.keys(b).length ? b : a;
      const f = common.reduce((t, k) => t + a[k] / b[k], 0) / common.length;
      return { ...a, ...Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v * f * 100) / 100])) };
    }),
  ]);
  return { confidence, mortgage, energy };
}

// ---------- kalender ----------
function dayRange(a, b) { const out = []; for (let t = Date.parse(a); t <= Date.parse(b); t += DAY) out.push(iso(t)); return out; }
function windowShare(fromY, toY, windowFor) { // per maand: aandeel dagen dat in het venster valt
  const out = {};
  for (let y = fromY; y <= toY; y++) {
    const [a, b] = windowFor(y), days = dayRange(a, b);
    for (const d of days) { const k = ym(d); out[k] = (out[k] || 0) + 1 / days.length; }
  }
  return out;
}
export function calendarMonthly(fromY = 2022, toY = new Date().getUTCFullYear() + 1) {
  const weekend = {}, easterPre = windowShare(fromY, toY, y => { const e = easter(y).getTime(); return [iso(e - 21 * DAY), iso(e)]; });
  const carnival = windowShare(fromY, toY, y => { const e = easter(y).getTime(); return [iso(e - 62 * DAY), iso(e - 46 * DAY)]; });
  const pentecost = windowShare(fromY, toY, y => { const e = easter(y).getTime(); return [iso(e + 35 * DAY), iso(e + 50 * DAY)]; });
  for (let y = fromY; y <= toY; y++) for (let m = 1; m <= 12; m++) {
    let n = 0; const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= dim; d++) { const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); if (wd === 0 || wd === 6) n++; }
    weekend[`${y}-${pad(m)}`] = n;
  }
  return { weekend, easter: easterPre, carnival, pentecost };
}

// Schoolvakanties (OpenHolidays API): per maand het gemiddelde aandeel regio's met vakantie (0..1).
export async function schoolMonthly(cc, from = '2022-01-01', to = `${new Date().getUTCFullYear() + 1}-12-31`) {
  if (!['NL', 'DE'].includes(cc)) return {};
  const [subs, ...chunks] = await Promise.all([
    get(`https://openholidaysapi.org/Subdivisions?countryIsoCode=${cc}&languageIsoCode=EN`, { timeout: 15000 }).catch(() => []),
    ...[[from, `${+from.slice(0, 4) + 2}-12-31`], [`${+from.slice(0, 4) + 3}-01-01`, to]].map(([a, b]) => get(`https://openholidaysapi.org/SchoolHolidays?countryIsoCode=${cc}&languageIsoCode=EN&validFrom=${a}&validTo=${b}`, { timeout: 20000 }).catch(() => [])),
  ]);
  const leaf = []; const walk = s => { for (const x of s || []) { if (x.children && x.children.length) walk(x.children); else leaf.push(x.code); } }; walk(subs);
  const total = Math.max(1, leaf.length || 1), perDay = {};
  for (const h of chunks.flat()) {
    const covered = h.nationwide ? leaf : (h.subdivisions || []).flatMap(sd => leaf.filter(c => c === sd.code || c.startsWith(sd.code + '-')).concat(leaf.includes(sd.code) ? [] : [sd.code]));
    for (const d of dayRange(h.startDate, h.endDate)) { (perDay[d] = perDay[d] || new Set()); for (const c of covered) perDay[d].add(c); }
  }
  const byDay = {};
  for (const d of dayRange(from, to)) byDay[d] = perDay[d] ? Math.min(1, perDay[d].size / total) : 0;
  return monthlyMean(byDay);
}

export async function allDrivers(cc, from = '2023-09-01') {
  const [w, e, school] = await Promise.all([weatherMonthly(cc, from).catch(() => ({})), economyMonthly(cc).catch(() => ({})), schoolMonthly(cc, `${from.slice(0, 4)}-01-01`).catch(() => ({}))]);
  const cal = calendarMonthly(+from.slice(0, 4));
  const { weatherUntil, today, ...weather } = w;
  return { cc, weatherUntil, drivers: { ...weather, ...e, ...cal, ...(Object.keys(school).length ? { school } : {}) } };
}
