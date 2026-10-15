import { mlValue, mlRise, shownChance, ML } from './ml.js';

// Voorspellen op historische zoekdata (Google Ads, 24-25 maanden per zoekterm).
// Elke methode krijgt een reeks maandwaarden (oud → nieuw) en voorspelt h maanden vooruit.
// backtest() toetst methodes op het verleden: alsof we in maand t stonden, wat voorspelden we voor t+h, en wat gebeurde er echt.

const sum = a => a.reduce((t, x) => t + x, 0);
const clip = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const med = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

// Niveau t.o.v. vorig jaar: laatste k maanden gedeeld door dezelfde k maanden een jaar eerder.
function yoyRatio(y, t, k = 3) {
  if (t - 12 - (k - 1) < 0) return null;
  const a = sum(y.slice(t - k + 1, t + 1)), b = sum(y.slice(t - 12 - k + 1, t - 12 + 1));
  return b > 0 ? a / b : null;
}

export const MODELS = {
  // Alles blijft zoals het nu is.
  naive: (y, t, h) => y[t],
  // Zelfde maand vorig jaar.
  season: (y, t, h) => (t + h - 12 >= 0 ? y[t + h - 12] : null),
  // Zelfde maand vorig jaar × hoe het niveau nu is t.o.v. vorig jaar (laatste 3 maanden).
  seasonLevel: (y, t, h) => {
    if (t + h - 12 < 0) return null;
    const r = yoyRatio(y, t, 3);
    return r == null ? y[t + h - 12] : y[t + h - 12] * clip(r, 0.25, 4);
  },
  // Idem met de laatste 6 maanden (rustiger niveau).
  seasonLevel6: (y, t, h) => {
    if (t + h - 12 < 0) return null;
    const r = yoyRatio(y, t, 6) ?? yoyRatio(y, t, 3);
    return r == null ? y[t + h - 12] : y[t + h - 12] * clip(r, 0.25, 4);
  },
  // Seizoensvorm van vorig jaar toegepast op de huidige waarde: y[t] × (vorig jaar t+h / vorig jaar t).
  seasonShape: (y, t, h) => {
    if (t + h - 12 < 0 || t - 12 < 0) return null;
    const base = (y[t - 12] + (y[t - 13] ?? y[t - 12]) + (y[t - 11] ?? y[t - 12])) / 3, now = (y[t] + y[t - 1] + y[t - 2]) / 3;
    return base > 0 ? y[t + h - 12] * clip(now / base, 0.25, 4) : y[t];
  },
  // Doorgaande beweging (gedempt): wat de afgelopen 3 maanden deed, half doortrekken.
  momentum: (y, t, h) => {
    if (t - 3 < 0 || y[t - 3] <= 0) return y[t];
    const g = Math.pow(clip(y[t] / y[t - 3], 0.2, 5), 1 / 3);
    return y[t] * Math.pow(1 + (g - 1) * 0.5, h);
  },
};

// Combinatie: gewogen gemiddelde van methodes (gewichten uit de backtest).
export function blend(y, t, h, weights) {
  let tot = 0, wsum = 0;
  for (const [m, w] of Object.entries(weights)) { const f = MODELS[m](y, t, h); if (f != null && isFinite(f)) { tot += w * f; wsum += w; } }
  return wsum ? tot / wsum : y[t];
}

const dir = (from, to, band = 0.15) => (from <= 0 ? (to > 0 ? 1 : 0) : to / from - 1 > band ? 1 : to / from - 1 < -band ? -1 : 0);

// Toets op het verleden. series: [{ id, y: [..] }]. Geeft per methode en horizon: fout (WAPE), richting goed (%),
// en "trefzekerheid stijgers": van de voorspelde stijgers (> +25%) hoeveel stegen echt (> +10%).
export function backtest(series, { horizons = [1, 2, 3, 4], models = Object.keys(MODELS), weights = null, minOrigin = 12 } = {}) {
  const out = {};
  const names = weights ? [...models, 'blend'] : models;
  for (const h of horizons) for (const m of names) out[`${m}|${h}`] = { m, h, n: 0, absErr: 0, actual: 0, dirOk: 0, dirN: 0, upPred: 0, upHit: 0, apes: [] };
  for (const s of series) {
    const y = s.y;
    for (const h of horizons) for (let t = minOrigin; t + h < y.length; t++) {
      const act = y[t + h];
      if (y[t] < 50 && act < 50) continue; // te klein om iets over te zeggen
      for (const m of names) {
        const f = m === 'blend' ? blend(y, t, h, weights) : MODELS[m](y, t, h);
        if (f == null || !isFinite(f)) continue;
        const o = out[`${m}|${h}`];
        o.n++; o.absErr += Math.abs(f - act); o.actual += act;
        if (act > 0) o.apes.push(Math.abs(f - act) / act);
        const pd = dir(y[t], f), ad = dir(y[t], act);
        if (ad !== 0 || pd !== 0) { o.dirN++; if (pd === ad) o.dirOk++; }
        if (y[t] > 0 && f / y[t] - 1 > 0.25) { o.upPred++; if (act / y[t] - 1 > 0.10) o.upHit++; }
      }
    }
  }
  return Object.values(out).map(o => ({ model: o.m, h: o.h, n: o.n, wape: o.actual ? Math.round((o.absErr / o.actual) * 1000) / 10 : null, mdape: Math.round(med(o.apes) * 1000) / 10, direction: o.dirN ? Math.round((o.dirOk / o.dirN) * 1000) / 10 : null, upPred: o.upPred, upHitRate: o.upPred ? Math.round((o.upHit / o.upPred) * 1000) / 10 : null }));
}

// Voorspelling voor één reeks (oud → nieuw) vanaf de laatste maand: waarden voor h = 1..H, plus een bandbreedte uit de
// spreiding tussen de methodes en de gemeten fout per horizon.
export function forecastSeries(y, { H = 4, weights, errByH = {} } = {}) {
  const t = y.length - 1, out = [];
  for (let h = 1; h <= H; h++) {
    const f = blend(y, t, h, weights);
    const e = (errByH[h] ?? 30) / 100;
    out.push({ h, v: Math.max(0, Math.round(f)), lo: Math.max(0, Math.round(f * (1 - e))), hi: Math.round(f * (1 + e)) });
  }
  return out;
}

// ---------- In productie ----------
// Gekozen na de backtest van 13 okt 2026 (4.507 zoekreeksen NL/DE/US, 24 maanden Google Ads):
//  - waarde: gemiddelde van "zelfde maand vorig jaar" en "blijft gelijk" → goed geijkt (gemeten/voorspeld ≈ 1,0)
//  - stijging voorspellen alleen als beide seizoensmethodes stijging zien én het vorig jaar in dezelfde periode
//    echt ≥ 40% steeg: 80-83% steeg daarna echt > 10%, 63-71% > 25% (basiskans > 25%: 16-20%)
//  - daling voorspellen (spiegelbeeld): 85-87% daalde echt > 10%
//  - "wat net steeg, blijft stijgen" klopte maar in ~14% van de gevallen
export const WEIGHTS = { season: 1, naive: 1 };
// 15 okt 2026: lerend model v2 (lib/ml.js, tools/train_forecast.py) op 4 jaar Google Ads-maanddata (okt 2022 - sep 2026).
// Eerlijke toets: geleerd op doelmaanden t/m april 2026, getoetst op mei-sep 2026 (120.661 stijg-vragen, 85.753 waarden):
// voorspelde stijgingen (kans ≥ 70%) kwamen 94% uit (>10%), 90% >25%, 90% ≥ 40% (basiskans ≥ 40%: 16%); de oude regel 76% / 66% / 66%.
// Fout in de waarden 27,0% → 21,9%. Tweede toets (geleerd t/m dec 2025, getoetst jan-sep 2026): 94% / 88% / 88%, fout 25,4% → 20,1%.
// v1 (14 okt, 2 jaar data): 87% / 80% / 79%. De getoonde kans is gekalibreerd: gemiddeld 90% gezegd, 90% gebeurd.
// Bronnen getoetst op 15 okt (zelfde toets): Wikipedia-weergaven geen winst; Google Trends-weekdata geen winst; griep (ECDC/CDC) en
// vacatures (Indeed) als drijver slechter → niet gebruikt; dezelfde zoekterm in de VS als voorloper voor NL/DE: niet consistent beter; koopplannen (Eurostat) kleine winst bij geldonderwerpen → gebruikt; weer nu NASA POWER.
export const BACKTEST = {
  date: '2026-10-15', series: 4514, months: 48, model: 'ml-v2',
  rise: { right10: 94, right25: 90, right40: 90, base40: 16, calls: 4961 }, old: { right10: 76, right25: 66, right40: 66, calls: 7853 },
  value: { wapeOld: 27.0, wapeNew: 21.9 }, check2: { cut: '2026-01', right10: 94, right40: 88, wapeOld: 25.4, wapeNew: 20.1 }, fall: { right10: 86 }, momentum: { right10: 14 },
  // 5 jaar Google Trends (635 voorspelde stijgingen): steeg dezelfde periode in álle eerdere jaren → 96% kwam uit (>10%), 86% >25%;
  // in de meeste jaren → 76% / 57%; in weinig jaren → 73% / 51%.
  stability: { all: { right10: 96, right25: 86 }, most: { right10: 76, right25: 57 }, few: { right10: 73, right25: 51 }, n: 635 },
  // Weer (144 weer- en geldgevoelige zoektermen, 5 jaar): fout in de maanden waarvan het weer al bekend is −6% (WAPE 28,6% → 26,9%),
  // richting goed 92,7% → 94,2%. Hypotheekrente/energie/vertrouwen: −2% (alleen geldonderwerpen). Kalender: geen vaste winst.
  drivers: { weather: { wapeBefore: 28.6, wapeAfter: 26.9 }, money: { wapeBefore: 15.0, wapeAfter: 14.8 } },
};

// ---------- 5 jaar historie: hoe vast is het patroon, en reageert het op weer of geld? ----------
const ymAdd = (k, d) => { let [y, m] = k.split('-').map(Number); m += d; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return `${y}-${String(m).padStart(2, '0')}`; };
const ymOf = x => `${x.y}-${String(x.m).padStart(2, '0')}`;
const ZERO = new Set(['easter', 'carnival', 'pentecost', 'school']);

// Weekdata (Google Trends, 5 jaar) → maandgemiddelden; eerste en laatste (onvolledige) maand weg.
export function trendMonths(points) {
  const by = new Map();
  for (const p of points || []) { if (p.v == null) continue; const m = p.d.slice(0, 7); const o = by.get(m) || [0, 0]; o[0] += p.v; o[1]++; by.set(m, o); }
  const keys = [...by.keys()].sort().slice(1, -1);
  return Object.fromEntries(keys.map(k => [k, by.get(k)[0] / by.get(k)[1]]));
}

// In hoeveel eerdere jaren steeg dezelfde periode (van -> naar) meer dan 20%?
export function stability(T, fromYm, toYm) {
  let yrs = 0, up = 0;
  for (let b = 1; b <= 5; b++) { const o = ymAdd(fromYm, -12 * b), g = ymAdd(toYm, -12 * b); if (T[o] > 0 && T[g] != null) { yrs++; if (T[g] / T[o] > 1.2) up++; } }
  if (yrs < 2) return null;
  return { years: yrs, up, level: up === yrs ? 'all' : up / yrs >= 0.5 ? 'most' : 'few' };
}

// Gevoeligheid voor een drijver: verandering t.o.v. vorig jaar in zoekinteresse vs in de drijver (maanddata).
function fitDriver(T, D, name) {
  const xs = [], ys = [], z = ZERO.has(name);
  for (const m of Object.keys(T).sort()) {
    const p = ymAdd(m, -12); if (T[p] == null) continue;
    const a = D[m] ?? (z ? 0 : null), b = D[p] ?? (z ? 0 : null); if (a == null || b == null) continue;
    xs.push(a - b); ys.push(Math.log((T[m] + 1) / (T[p] + 1)));
  }
  const n = xs.length; if (n < 18) return null;
  const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n; let c = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { c += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; vy += (ys[i] - my) ** 2; }
  return vx && vy ? { name, beta: c / vx, corr: c / Math.sqrt(vx * vy), n } : null;
}
// Kies de sterkste weerdrijver (|corr| ≥ 0,3); voor geldonderwerpen ook rente/energie/vertrouwen (halve kracht).
export function sensitivity(T, drivers, { money = false } = {}) {
  const pick = (names, thr) => names.map(n => drivers[n] && fitDriver(T, drivers[n], n)).filter(f => f && Math.abs(f.corr) >= thr).sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr))[0] || null;
  const w = pick(['temp', 'sun', 'rain'], 0.3); // getoetst: drempel 0,3 en 0,5 gaven dezelfde winst
  const m = money ? pick(['mortgage', 'energy', 'confidence', 'purchases'], 0.5) : null; // purchases: getoetst 15 okt (fout 11,5 → 11,4%); griep en vacatures maakten het slechter → niet gebruikt
  return [w && { ...w, shrink: 1, kind: 'weather' }, m && { ...m, shrink: 0.5, kind: 'money' }].filter(Boolean);
}

// Voorspelling verrijken: stabiliteit van het patroon en (voor maanden waarvan weer/economie al bekend is) de drijvers.
// T = Google Trends-maanden (5 jaar), drivers = { naam: { 'YYYY-MM': waarde } }, known = laatste maand met bekende drijverwaarden.
export function enrich(fc, series, T, drivers, { money = false, known = {} } = {}) {
  if (!fc) return fc;
  const s = [...series].sort((a, b) => a.y - b.y || a.m - b.m), y = s.map(x => x.v), t = y.length - 1, fromYm = ymOf(s[t]);
  const out = { ...fc, months: fc.months.map(x => ({ ...x })) };
  if (T && Object.keys(T).length >= 36) {
    const best = fc.months.filter(x => x.chance != null).sort((a, b) => b.chance - a.chance)[0];
    const target = fc.peak || fc.low || best || fc.months[fc.months.length - 1];
    out.stability = stability(T, fromYm, ymOf(target));
    const sens = drivers ? sensitivity(T, drivers, { money }) : [];
    const effects = [];
    for (const m of out.months) {
      const ym = ymOf(m), p = ymAdd(ym, -12); let f = 0;
      for (const d of sens) {
        if (!known[d.name] || ym > known[d.name]) continue;
        const D = drivers[d.name], a = D[ym] ?? (ZERO.has(d.name) ? 0 : null), b = D[p] ?? (ZERO.has(d.name) ? 0 : null); if (a == null || b == null) continue;
        f += Math.max(-1.5, Math.min(1.5, d.shrink * d.beta * (a - b)));
        effects.push({ ym, name: d.name, kind: d.kind, change: Math.round((a - b) * 10) / 10, pct: Math.round((Math.exp(d.shrink * d.beta * (a - b)) - 1) * 100) });
      }
      if (f && t + m.h - 12 >= 0) m.v = Math.max(0, Math.round(fc.model === 'ml' ? m.v * Math.exp(f / 2) : (y[t + m.h - 12] * Math.exp(f) + y[t]) / 2));
    }
    if (sens.length) out.drivers = { sens: sens.map(d => ({ name: d.name, kind: d.kind, corr: Math.round(d.corr * 100) / 100 })), effects: effects.filter(e => Math.abs(e.pct) >= 3) };
  }
  // Bij een andere top na aanpassing: opnieuw bepalen.
  const now = out.months[0];
  if (out.call === 'rise' && fc.model === 'ml') { out.peak = out.months.find(x => x.h === fc.peak.h); out.extra = Math.max(out.peak.v - now.v, Math.round(now.v * 0.4)); }
  else if (out.call === 'rise') { const pk = out.months.reduce((a, b) => (b.v > a.v ? b : a)); out.peak = pk; out.extra = pk.v - Math.max(now.v, y[t]); if (pk.v < Math.max(now.v, y[t]) * 1.2) { out.call = 'flat'; out.peak = null; out.extra = 0; } }
  out.confidence = fc.model === 'ml' ? fc.confidence : !out.stability ? 'unknown' : out.stability.level === 'all' ? 'high' : out.stability.level === 'most' ? 'medium' : 'low';
  return out;
}
export const CONF_WEIGHT = { high: 1, medium: 0.75, unknown: 0.65, low: 0.5 };

export function riseCall(y, t, h) {
  const s1 = MODELS.season(y, t, h), s2 = MODELS.seasonShape(y, t, h);
  if (s1 == null || s2 == null || !(y[t - 12] > 0)) return 0;
  const ly = y[t + h - 12] / y[t - 12];
  if (s1 / y[t] > 1.2 && s2 / y[t] > 1.2 && ly > 1.4) return 1;
  if (s1 / y[t] < 0.8 && s2 / y[t] < 0.8 && ly < 0.7) return -1;
  return 0;
}

// Voorspelling vanaf de laatste maand in de data. months: [{y, m}] van de reeks (oud → nieuw).
// Doelmaanden: vanaf de huidige kalendermaand tot 3 maanden verder (de data loopt 1-2 maanden achter).
// Sinds 14 okt 2026: waarden uit het lerende model (lib/ml.js); een stijging wordt voorspeld als het model de kans op
// ≥ 40% stijging t.o.v. nu op ≥ 70% schat (getoetst: zie BACKTEST.ml). Zonder model: de oude seizoensregel.
export function predict(series, today = new Date(), { cc } = {}) {
  const s = [...series].filter(x => x && x.v != null).sort((a, b) => a.y - b.y || a.m - b.m);
  const n = s.length; if (n < 15) return null;
  const y = s.map(x => x.v), t = n - 1, L = s[t];
  const lag = (today.getUTCFullYear() - L.y) * 12 + (today.getUTCMonth() + 1 - L.m); // maanden tussen data en nu
  const months = [], h0 = Math.max(1, lag);
  for (let h = h0; h <= Math.min(lag + 3, 4); h++) { // getoetst tot 4 maanden vooruit
    const d = new Date(Date.UTC(L.y, L.m - 1 + h, 1)), b = Math.max(0, blend(y, t, h, WEIGHTS)), v = mlValue(y, t, h, cc);
    months.push({ h, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, v: Math.round(v ?? b), b, call: riseCall(y, t, h), p: h > h0 ? mlRise(y, t, h, cc, h0) : null });
  }
  if (!months.length) return null;
  const now = months[0], low = months.reduce((a, b) => (b.b < a.b ? b : a));
  const okOld = x => x.call === 1 && x.b >= now.b * 1.2 && x.b > y[t] * 1.2;
  let rise = null, chance = null;
  // De hoogste maand met kans ≥ 0,7.
  if (ML) { const c = months.filter(x => x.p != null && x.p >= 0.7).sort((a, b) => b.v - a.v)[0]; if (c) { rise = c; chance = shownChance(c.p); } }
  else if (months.find(okOld)) rise = months.reduce((a, b) => (b.v > a.v ? b : a));
  const fall = !rise && months.slice(1).some(x => x.call === -1) && low.b <= now.b * 0.8 ? low : null;
  // Wat er vorig jaar gebeurde in dezelfde maanden (de onderbouwing)
  const lastYear = months.map(x => ({ m: x.m, v: t + x.h - 12 >= 0 ? y[t + x.h - 12] : null }));
  const out = months.map(({ b, p, ...x }) => (p != null ? { ...x, chance: shownChance(p) } : x)); // chance: % kans op ≥ 40% boven nu
  const pick = x => x && out.find(o => o.h === x.h);
  const peak = pick(rise);
  return {
    from: { y: L.y, m: L.m, v: y[t] }, months: out, call: rise ? 'rise' : fall ? 'fall' : 'flat', peak: peak || null, low: pick(fall) || null, lastYear,
    extra: peak ? (chance != null ? Math.max(peak.v - out[0].v, Math.round(out[0].v * 0.4)) : peak.v - Math.max(out[0].v, y[t])) : 0,
    ...(chance != null ? { chance, confidence: chance >= 85 ? 'high' : chance >= 72 ? 'medium' : 'low', model: 'ml' } : {}),
  };
}
