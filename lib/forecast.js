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
export const BACKTEST = {
  date: '2026-10-13', series: 4507, months: 24,
  rise: { right10: 81, right25: 67, base25: 18 }, fall: { right10: 86 }, momentum: { right10: 14 },
};

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
export function predict(series, today = new Date()) {
  const s = [...series].filter(x => x && x.v != null).sort((a, b) => a.y - b.y || a.m - b.m);
  const n = s.length; if (n < 15) return null;
  const y = s.map(x => x.v), t = n - 1, L = s[t];
  const lag = (today.getUTCFullYear() - L.y) * 12 + (today.getUTCMonth() + 1 - L.m); // maanden tussen data en nu
  const months = [];
  for (let h = Math.max(1, lag); h <= Math.min(lag + 3, 4); h++) { // getoetst tot 4 maanden vooruit
    const d = new Date(Date.UTC(L.y, L.m - 1 + h, 1));
    months.push({ h, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, v: Math.max(0, Math.round(blend(y, t, h, WEIGHTS))), call: riseCall(y, t, h) });
  }
  if (!months.length) return null;
  const now = months[0], peak = months.reduce((a, b) => (b.v > a.v ? b : a)), low = months.reduce((a, b) => (b.v < a.v ? b : a));
  const rise = months.find(x => x.call === 1 && x.v >= now.v * 1.2 && x.v > y[t] * 1.2) ? peak : null;
  const fall = !rise && months.slice(1).some(x => x.call === -1) && low.v <= now.v * 0.8 ? low : null;
  // Wat er vorig jaar gebeurde in dezelfde maanden (de onderbouwing)
  const lastYear = months.map(x => ({ m: x.m, v: t + x.h - 12 >= 0 ? y[t + x.h - 12] : null }));
  return { from: { y: L.y, m: L.m, v: y[t] }, months, call: rise ? 'rise' : fall ? 'fall' : 'flat', peak: rise || null, low: fall || null, lastYear, extra: rise ? rise.v - Math.max(now.v, y[t]) : 0 };
}
