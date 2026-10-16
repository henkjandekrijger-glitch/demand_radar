// Vroege signalen: zoektermen die nog NIET zijn doorgebroken, maar waarvan het patroon lijkt op termen die daarna wél doorbraken.
// Doorbraak = aanhoudend: de middelste van 3 maanden ≥ 2× de middelste van dezelfde maanden vorig jaar (één piekmaand telt niet).
// Getoetst op ± 3.000 schone zoekreeksen (NL, DE, US; 4 jaar), getraind op de jaren vóór de toets (tools/train_early.py).
// earlyFeats() is de ENIGE definitie van de kenmerken: training (tools/earlyrows.mjs) en productie gebruiken dezelfde functie.
import E from './early-model.js';
import { noise } from './rising.js';

export const MINV = { NL: 200, DE: 500, US: 1000 }; // een doorbraak telt pas vanaf dit volume per maand
export const EFEATS = ['ly0', 'yoy1', 'yoy3', 'yoy3p', 'acc', 'yoy2y', 'r1', 'r3', 'cv', 'run', 'slope6', 'sh3', 'maxyoy', 'ccn'];
const CC = { NL: 0, DE: 1, US: 2 };
const L = (a, b) => Math.log((a + 10) / (b + 10)); // NaN als een van beide ontbreekt
const g = (y, i) => (i >= 0 && i < y.length && y[i] != null ? y[i] : NaN);
const m3 = (y, i) => (i >= 2 ? (y[i - 2] + y[i - 1] + y[i]) / 3 : NaN);
const med3 = (a, b, c) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));

// Per maand: is de term op dat moment doorgebroken?
export function brokeOut(y, minv) {
  const f = y.map(() => false);
  for (let i = 14; i < y.length; i++) { const a = med3(y[i - 2], y[i - 1], y[i]), b = med3(y[i - 14], y[i - 13], y[i - 12]); f[i] = a >= minv && a >= 2 * Math.max(b, 10); }
  return f;
}

// Telfouten van Google: één sprong ×20 waarna het vlak blijft.
export function stepJump(y) {
  for (let i = 1; i < y.length; i++) if (y[i] / Math.max(y[i - 1], 10) > 20) { const a = y.slice(i); if (a.length >= 6 && Math.max(...a) / Math.max(Math.min(...a), 1) < 2.5) return true; }
  return false;
}
// Losse pieken (nieuws, wedstrijden, samengevoegde varianten): een sprong ×5 omhoog of omlaag die niet elk jaar in dezelfde maand terugkomt.
export function oneOffJumps(y) {
  const r = i => (y[i] + 10) / (y[i - 1] + 10);
  for (let i = 1; i < y.length; i++) {
    const q = r(i); if (!(q >= 5 || q <= 0.2)) continue;
    const same = [i - 12, i + 12, i - 24, i + 24].some(j => j >= 1 && j < y.length && (q > 1 ? r(j) >= 2.5 : r(j) <= 0.4));
    if (!same) return true;
  }
  return false;
}

export function earlyFeats(y, t, cc) {
  const yoy3 = t >= 14 ? L(m3(y, t), m3(y, t - 12)) : NaN, yoy3p = t >= 17 ? L(m3(y, t - 3), m3(y, t - 15)) : NaN;
  const win = y.slice(Math.max(0, t - 12), t + 1), mean = win.reduce((s, x) => s + x, 0) / win.length;
  const sd = Math.sqrt(win.reduce((s, x) => s + (x - mean) ** 2, 0) / win.length);
  let run = 0; for (let i = t; i >= 12; i--) { if (g(y, i) > 1.15 * Math.max(g(y, i - 12), 10)) run++; else break; }
  let slope = NaN;
  if (t >= 5) { const v = y.slice(t - 5, t + 1).map(Math.log1p), vm = v.reduce((s, x) => s + x, 0) / 6; slope = v.reduce((s, x, i) => s + (i - 2.5) * (x - vm), 0) / 17.5; }
  const sh = t >= 11 ? L((y[t - 11] + y[t - 10] + y[t - 9]) / 3, g(y, t - 12)) : NaN;
  let maxyoy = NaN; for (let i = Math.max(14, t - 11); i <= t; i++) { const v = L(m3(y, i), m3(y, i - 12)); if (!(v <= maxyoy)) maxyoy = v; }
  return [Math.log1p(y[t]), L(g(y, t), g(y, t - 12)), yoy3, yoy3p, Number.isFinite(yoy3) && Number.isFinite(yoy3p) ? yoy3 - yoy3p : NaN,
    t >= 26 ? L(m3(y, t), m3(y, t - 24)) : NaN, L(g(y, t), g(y, t - 1)), L(g(y, t), g(y, t - 3)), mean ? sd / mean : 0, run, slope, sh, maxyoy, CC[cc] ?? NaN];
}

// Doet deze term mee? (geen ruis, geen telfout, nog niet doorgebroken, niet te klein)
export function eligible(y, t, cc, k = '') {
  if (t < 26 || y.length <= t) return 'short';
  if (k && noise({ k, monthly: [] }, cc)) return 'noise';
  const past = y.slice(0, t + 1);
  if (stepJump(past) || oneOffJumps(past)) return 'jumpy';
  const f = brokeOut(past, MINV[cc]); for (let i = Math.max(0, t - 12); i <= t; i++) if (f[i]) return 'already';
  if (y[t] < MINV[cc] * 0.1) return 'small';
  return null;
}

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
export const earlyRaw = x => (E ? 1 / (1 + Math.exp(-E.trees.reduce((s, T) => s + walk(T, x), 0))) : null);
export const EARLY = E ? { version: E.version, trained: E.trained, test: E.test, show: E.show } : null;

// Getoonde kans: gemeten in de toets voor dezelfde laag (al zichtbaar begonnen / nog niet zichtbaar) en dezelfde modelscore.
function shown(p, tier) {
  const C = E && E.calib && E.calib[tier]; if (!C) return Math.round(p * 100);
  let v = C[0][1]; for (const [lo, hit] of C) if (p >= lo) v = hit;
  return Math.round(v * 100);
}

// series: [{y, m, v}] of [[y, m, v]] (oud → nieuw). Geeft null als de term niet meedoet.
export function earlySignal(series, cc, k = '') {
  if (!E || !series || !series.length) return null;
  const s = series.map(x => (Array.isArray(x) ? { y: x[0], m: x[1], v: x[2] } : { y: x.y ?? x.year, m: x.m ?? x.month, v: x.v ?? x.search_volume ?? 0 })).sort((a, b) => a.y - b.y || a.m - b.m);
  const y = s.map(x => +x.v || 0), t = y.length - 1;
  const why = eligible(y, t, cc, k); if (why) return { skip: why };
  const x = earlyFeats(y, t, cc), p = earlyRaw(x);
  const tier = x[1] >= Math.log(1.5) ? 'starting' : 'hidden', chance = shown(p, tier);
  const reasons = [];
  if (x[9] >= 3) reasons.push(`Up on last year ${x[9]} months in a row`);
  if (Number.isFinite(x[4]) && x[4] >= Math.log(1.15)) reasons.push('Growth is speeding up');
  if (Number.isFinite(x[10]) && x[10] >= 0.05) reasons.push('Climbing for 6 months');
  if (Number.isFinite(x[2]) && x[2] > 0) reasons.push(`+${Math.round((Math.exp(x[2]) - 1) * 100)}% on last year (last 3 months)`);
  if (tier === 'starting') reasons.unshift(`Last month already ${Math.round((y[t] + 10) / (y[t - 12] + 10) * 10) / 10}× last year`);
  return { p: Math.round(p * 1000) / 1000, chance, tier, call: E.show && p >= E.show[tier] ? 'early' : null, now: { y: s[t].y, m: s[t].m, v: y[t] }, lastYear: y[t - 12], reasons: reasons.slice(0, 3) };
}
