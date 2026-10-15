// Drijvers van vraag, per land en per maand: weer, economie en kalender. Alles gratis en zonder sleutel.
//  - weer: NASA POWER (gemeten) + MET Norway (± 9 dagen vooruit), gemiddeld over grote steden
//  - economie: consumentenvertrouwen (Eurostat / FRED), hypotheekrente (ECB / FRED), energieprijzen (Eurostat HICP / FRED)
//  - kalender: weekenddagen, de weken vóór Pasen / carnaval / Pinksteren, schoolvakanties (OpenHolidays)
// Uitvoer: { name: { 'YYYY-MM': waarde } }. Bekende toekomst: kalender altijd, weer tot ± 9 dagen vooruit.
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
// Gemeten: NASA POWER (publieke data, ook commercieel vrij te gebruiken; loopt 2-3 dagen achter).
// Vooruit: MET Norway Locationforecast (CC BY 4.0, commercieel toegestaan met bronvermelding; ± 9 dagen).
// (Tot 15 okt 2026 Open-Meteo; de gratis versie daarvan is alleen voor niet-commercieel gebruik.)
export async function weatherMonthly(cc, from = '2023-09-01') {
  const today = iso(Date.now()), ymd = d => d.replace(/-/g, '');
  const per = await pool(CITIES[cc], 4, async ([lat, lon]) => {
    const out = {};
    const p = await get(`https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN&community=RE&longitude=${lon}&latitude=${lat}&start=${ymd(from)}&end=${ymd(today)}&format=JSON`, { timeout: 25000 }).catch(() => null);
    const P = p && p.properties && p.properties.parameter;
    if (P) for (const k of Object.keys(P.T2M || {})) {
      const v = x => (x == null || x <= -999 ? null : x), d = `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
      if (v(P.T2M[k]) != null) out[d] = [v(P.T2M[k]), v(P.PRECTOTCORR[k]), v(P.ALLSKY_SFC_SW_DWN[k])];
    }
    // verwachting: dagen die NASA nog niet heeft
    const f = await get(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`, { timeout: 12000 }).catch(() => null); // UA met contact (vereist)
    const byDay = {};
    for (const s of (f && f.properties && f.properties.timeseries) || []) {
      const d = s.time.slice(0, 10), x = s.data || {}, T = x.instant && x.instant.details && x.instant.details.air_temperature;
      const r = (x.next_1_hours && x.next_1_hours.details.precipitation_amount) ?? (x.next_6_hours && x.next_6_hours.details.precipitation_amount / 6);
      const o = (byDay[d] = byDay[d] || { t: [], r: 0, n: 0 }); if (T != null) o.t.push(T); if (r != null) { o.r += r; o.n++; }
    }
    for (const [d, o] of Object.entries(byDay)) if (!out[d] && o.t.length >= 4 && o.n >= 4) out[d] = [o.t.reduce((a, b) => a + b, 0) / o.t.length, (o.r / o.n) * 24, null];
    return out;
  });
  const days = {};
  for (const city of per.filter(Boolean)) for (const [d, v] of Object.entries(city)) { (days[d] = days[d] || []).push(v); }
  const avg = i => Object.fromEntries(Object.entries(days).map(([d, vs]) => { const x = vs.map(v => v[i]).filter(v => v != null); return [d, x.length ? x.reduce((t, v) => t + v, 0) / x.length : null]; }));
  // sun = zonne-instraling (kWh/m² per dag): zelfde rol als zonuren, de gevoeligheid wordt per zoekterm opnieuw gemeten
  const temp = monthlyMean(avg(0)), rain = monthlyMean(avg(1)), sun = monthlyMean(avg(2));
  const lastDay = Object.keys(days).sort().pop();
  return { temp, rain, sun, weatherUntil: lastDay, today, source: 'NASA POWER + MET Norway' };
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

// ---------- griep, vacatures, koopplannen (15 okt 2026) ----------
//  - flu: griepachtige klachten per week → maandgemiddelde. NL/DE: ECDC ERVISS (huisartsenpeilstations), US: CDC ILINet via Delphi Epidata.
//  - jobs: Indeed vacature-index (dagelijks, NL/DE/US, CC BY 4.0) → leidend voor cursussen en opleidingen.
//  - purchases: Europese consumentenenquête "grote aankopen komende 12 maanden" (Eurostat BS-MP-NY, NL/DE).
const isoWeekMonth = yw => { const [y, w] = yw.split('-W').map(Number); const d = new Date(Date.UTC(y, 0, 4 + (w - 1) * 7)); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); return d.toISOString().slice(0, 7); };
const meanBy = pairs => { const s = {}; for (const [k, v] of pairs) { if (!isFinite(v)) continue; (s[k] = s[k] || [0, 0]); s[k][0] += v; s[k][1]++; } return Object.fromEntries(Object.entries(s).map(([k, [t, n]]) => [k, Math.round((t / n) * 100) / 100])); };
export async function healthMonthly(cc) {
  if (cc === 'US') {
    const y = new Date().getUTCFullYear();
    const j = await get(`https://api.delphi.cmu.edu/epidata/fluview/?regions=nat&epiweeks=202101-${y}53`, { timeout: 20000 });
    return { flu: meanBy((j.epidata || []).map(r => { const w = String(r.epiweek); return [isoWeekMonth(`${w.slice(0, 4)}-W${w.slice(4)}`), r.wili]; })) };
  }
  const name = { NL: 'Netherlands', DE: 'Germany' }[cc]; if (!name) return {};
  const t = await get('https://raw.githubusercontent.com/EU-ECDC/Respiratory_viruses_weekly_data/main/data/ILIARIRates.csv', { text: true, timeout: 25000 });
  const rows = []; let ind = null;
  for (const l of String(t).split(/\r?\n/)) {
    const c = l.split(','); if (c[1] !== name || c[4] !== 'total' || !/^\d{4}-W\d\d$/.test(c[2])) continue;
    if (!ind) ind = /ILI/.test(c[3]) ? c[3] : null; if (c[3] !== ind && !(ind == null && /ARI/.test(c[3]))) continue; // ILI als dat er is, anders ARI
    if (c[2] >= '2021-W01') rows.push([isoWeekMonth(c[2]), parseFloat(c[5])]);
  }
  return rows.length ? { flu: meanBy(rows) } : {};
}
export async function jobsMonthly(cc) {
  const t = await get(`https://raw.githubusercontent.com/hiring-lab/job_postings_tracker/master/${cc}/aggregate_job_postings_${cc}.csv`, { text: true, timeout: 20000 });
  return { jobs: meanBy(String(t).split(/\r?\n/).slice(1).map(l => l.split(',')).filter(c => c[4] === 'total postings' && c[0] >= '2021-01').map(c => [c[0].slice(0, 7), parseFloat(c[2])])) };
}
export async function purchasesMonthly(cc) {
  if (cc === 'US') return {};
  return { purchases: eurostat(await get(`${EUROSTAT}/ei_bsco_m?geo=${cc}&indic=BS-MP-NY&s_adj=SA&unit=BAL&format=JSON&sinceTimePeriod=2021-01`, { timeout: 15000 })) };
}

export async function allDrivers(cc, from = '2023-09-01') {
  const [w, e, school, hl, jb, pu] = await Promise.all([weatherMonthly(cc, from).catch(() => ({})), economyMonthly(cc).catch(() => ({})), schoolMonthly(cc, `${from.slice(0, 4)}-01-01`).catch(() => ({})), healthMonthly(cc).catch(() => ({})), jobsMonthly(cc).catch(() => ({})), purchasesMonthly(cc).catch(() => ({}))]);
  const cal = calendarMonthly(+from.slice(0, 4));
  const { weatherUntil, today, ...weather } = w;
  return { cc, weatherUntil, drivers: { ...weather, ...e, ...hl, ...jb, ...pu, ...cal, ...(Object.keys(school).length ? { school } : {}) } };
}

// Schoolvakanties als koopmomenten (NL, DE): per vakantie de vroegste start over alle regio's, binnen de horizon.
export async function schoolMoments(cc, today = new Date(), horizon = 120) {
  if (!['NL', 'DE'].includes(cc)) return [];
  const from = iso(today.getTime()), to = iso(today.getTime() + horizon * DAY);
  const list = await get(`https://openholidaysapi.org/SchoolHolidays?countryIsoCode=${cc}&languageIsoCode=EN&validFrom=${from}&validTo=${to}`, { timeout: 15000 }).catch(() => []);
  const by = new Map();
  for (const h of list || []) {
    const name = ((h.name || []).find(n => n.language === 'EN') || (h.name || [])[0] || {}).text || 'School holidays';
    const g = by.get(name) || { name, start: h.startDate, end: h.endDate, regions: new Set() };
    if (h.startDate < g.start) g.start = h.startDate; if (h.endDate > g.end) g.end = h.endDate;
    for (const s of h.subdivisions || []) g.regions.add(s.shortName || s.code);
    if (h.nationwide) g.regions.add('all');
    by.set(name, g);
  }
  const IDEAS = { autumn: ['Holiday parks', 'Day trips', 'Indoor play', 'Short city breaks'], christmas: ['Ski trips', 'Holiday parks', 'Board games', 'Indoor activities'], winter: ['Ski trips', 'Snow gear', 'Holiday parks'], spring: ['Short breaks', 'Theme parks', 'Bikes'], easter: ['Short breaks', 'Theme parks', 'Garden'], summer: ['Holidays abroad', 'Camping', 'Beach gear'] };
  return [...by.values()].filter(g => g.start >= from && (Date.parse(g.end) - Date.parse(g.start)) / DAY >= 3).map(g => {
    const kind = Object.keys(IDEAS).find(k => g.name.toLowerCase().includes(k)) || 'autumn';
    return { id: `school-${kind}-${g.start}`, kind: 'school', name: `${g.name} (school)`, date: new Date(`${g.start}T00:00:00Z`), lead: 28, markets: [cc], ideas: IDEAS[kind], note: `${g.start} to ${g.end}` };
  });
}
