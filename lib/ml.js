// Lerend voorspelmodel (LightGBM, getraind over alle zoekreeksen tegelijk; zie tools/train_forecast.py).
// feats() is de ENIGE definitie van de kenmerken: training (tools/mlrows.mjs) en productie gebruiken dezelfde functie.
// Twee modellen: "value" voorspelt log((y[t+h]+10)/(y[t]+10)); "rise" geeft de kans dat maand t+h ≥ 40% boven maand t+h0 ("nu") ligt.
import M from './model.js';

const L = (a, b) => Math.log((a + 10) / (b + 10)); // NaN als een van beide ontbreekt
const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const CC = { NL: 0, DE: 1, US: 2 };

export const FEATS = ['ly0', 'r1', 'r2', 'rs', 'rsh', 'rshn', 'yoy3', 'yoy1', 'spike', 'cv', 'rs2', 'rsh2', 'rs3', 'msh', 'ccn', 'h', 'h0', 'rsn', 'rsn2', 'rsn3',
  // Wikipedia (zelfde maanden als y; ontbreekt → NaN). Getoetst 15 okt 2026 op 4.371 zoektermen: geen winst (fout 24,8% → 24,9%),
  // dus NIET in het getrainde model; blijft beschikbaar voor een nieuwe toets.
  'wy0', 'wyoy', 'wm3', 'wr1', 'wdiv', 'wsn', 'wnow',
  // dezelfde zoekterm in de VS (alleen voor NL/DE; loopt de VS voor?). Getoetst 15 okt: mei-sep +0,4 punt, jan-sep geen winst → niet gebruikt.
  'uy0', 'uyoy', 'um3', 'ur1', 'udiv'];

// y = maandwaarden (oud → nieuw), t = laatste bekende maand, h = maanden vooruit, h0 = welke maand "nu" is (0 = t zelf).
// w = Wikipedia-weergaven per maand, op dezelfde plekken als y (mag ontbreken); wNow = weergaven van maand t+1 (als bekend).
export function feats(y, t, h, cc, h0 = 0, w = null, wNow = NaN, u = null) {
  const g = i => (i >= 0 && i <= t && y[i] != null ? y[i] : NaN);
  const win = []; for (let i = Math.max(0, t - 12); i <= t; i++) win.push(y[i]);
  const mean = win.reduce((s, x) => s + x, 0) / win.length, sd = Math.sqrt(win.reduce((s, x) => s + (x - mean) ** 2, 0) / win.length);
  const sh = [1, 2, 3].map(b => L(g(t + h - 12 * b), g(t - 12 * b)));
  const shOk = sh.filter(Number.isFinite);
  return [
    Math.log1p(y[t]), L(g(t - 1), y[t]), L(g(t - 2), y[t]),
    L(g(t + h - 12), y[t]), sh[0],
    L((g(t + h - 13) + g(t + h - 12) + g(t + h - 11)) / 3, (g(t - 13) + g(t - 12) + g(t - 11)) / 3),
    L(g(t) + g(t - 1) + g(t - 2), g(t - 12) + g(t - 13) + g(t - 14)), L(y[t], g(t - 12)),
    L(y[t], median(win)), mean ? sd / mean : 0,
    L(g(t + h - 24), y[t]), sh[1], L(g(t + h - 36), y[t]), shOk.length >= 2 ? median(shOk) : NaN,
    CC[cc] ?? NaN, h, h0,
    // vorig jaar (en 2-3 jaar terug): van de maand die nu is naar de doelmaand
    ...[1, 2, 3].map(b => L(g(t + h - 12 * b), g(t + h0 - 12 * b))),
    ...wikiFeats(y, t, h, h0, w, wNow),
    ...usFeats(y, t, u),
  ];
}

function wikiFeats(y, t, h, h0, w, wNow) {
  if (!w) return [NaN, NaN, NaN, NaN, NaN, NaN, NaN];
  const W = i => (i >= 0 && i <= t && w[i] != null && Number.isFinite(w[i]) ? w[i] : NaN), Y = i => (i >= 0 && i <= t && y[i] != null ? y[i] : NaN);
  return [Math.log1p(W(t)), L(W(t), W(t - 12)), L(W(t), W(t - 3)), L(W(t), W(t - 1)), L(W(t), W(t - 12)) - L(Y(t), Y(t - 12)), L(W(t + h - 12), W(t + h0 - 12)), L(wNow, W(t))];
}

function usFeats(y, t, u) {
  if (!u) return [NaN, NaN, NaN, NaN, NaN];
  const U = i => (i >= 0 && i <= t && u[i] != null && Number.isFinite(u[i]) ? u[i] : NaN), Y = i => (i >= 0 && i <= t && y[i] != null ? y[i] : NaN);
  return [Math.log1p(U(t)) - Math.log1p(Y(t)), L(U(t), U(t - 12)), L(U(t), U(t - 3)), L(U(t), U(t - 1)), L(U(t), U(t - 12)) - L(Y(t), Y(t - 12))];
}

// Eén boom doorlopen (zelfde regels als LightGBM: x ≤ drempel → links; ontbrekend → standaardrichting).
function walk(T, x) {
  let i = 0;
  while (T.f[i] >= 0) {
    let v = x[T.f[i]];
    if (Number.isNaN(v)) { if (T.m[i] === 0) v = 0; else { i = T.d[i] ? T.l[i] : T.r[i]; continue; } }
    if (T.m[i] === 1 && Math.abs(v) <= 1e-35) { i = T.d[i] ? T.l[i] : T.r[i]; continue; }
    i = v <= T.t[i] ? T.l[i] : T.r[i];
  }
  return T.v[i];
}
const raw = (model, x) => model.trees.reduce((s, T) => s + walk(T, x), 0);

export const ML = M ? { trained: M.trained, version: M.version, test: M.test } : null;

// Voorspelde waarde voor maand t+h.
export function mlValue(y, t, h, cc) {
  if (!M) return null;
  const v = (y[t] + 10) * Math.exp(raw(M.value, feats(y, t, h, cc, 0))) - 10;
  return Number.isFinite(v) ? Math.max(0, v) : null;
}
// Kans (0-1) dat maand t+h minstens 40% hoger ligt dan maand t+h0 ("nu").
export function mlRise(y, t, h, cc, h0) {
  if (!M || !(h > h0)) return null;
  const p = 1 / (1 + Math.exp(-raw(M.rise, feats(y, t, h, cc, h0))));
  return Number.isFinite(p) ? p : null;
}

// Kans zoals getoond: gekalibreerd op de toets (wat het model zei → hoe vaak het echt gebeurde), alleen voor getoonde stijgers.
export function shownChance(p) {
  const C = M && M.test && M.test.calibration; if (!C || !C.length || p == null) return p == null ? null : Math.round(p * 100);
  if (p <= C[0][0]) return Math.round(Math.min(p, (p * C[0][1]) / C[0][0]) * 100); // onder de getoetste stijgers: niet hoger maken
  for (let i = 1; i < C.length; i++) if (p <= C[i][0]) { const [x0, y0] = C[i - 1], [x1, y1] = C[i]; return Math.round((y0 + ((p - x0) / (x1 - x0)) * (y1 - y0)) * 100); }
  return Math.round(C[C.length - 1][1] * 100);
}
