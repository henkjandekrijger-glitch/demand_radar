// Bing als gratis "nu"-signaal (14 nov 2026, Henkjan: "voer door"). De radar vraagt elke nacht per land voor ± 90 termen hoe het NU
// gaat (dagdata). Tot nu toe: Google Trends via DataForSEO voor de bovenste 20 termen en DataForSEO Trends voor de rest (betaald).
// Eerst toetsen, dan pas vervangen (vaste regel): voor de termen die Google-dagdata krijgen haalt de radar ook Bing op (Bing Webmaster
// Tools, gratis, weekcijfers) en telt hoe vaak de richting gelijk is (stijgt / gelijk / daalt). Zodra een land ≥ 150 vergelijkingen
// heeft met ≥ 70% overeenstemming, neemt Bing daar de rest van de termen over; termen waar Bing te weinig ziet, blijven betaald.
// Opslag learn/bing-now.json: { cc: { n, agree, byClass, days } }.
import { getJSON, putJSON } from './store.js';
import { bingReady, bingActivity } from './bing.js';

const P = 'learn/bing-now.json';
export const MIN_N = 150, MIN_AGREE = 0.7;
const cls = st => (st === 'rising' ? 'up' : st === 'steady' ? 'flat' : st === 'fading' || st === 'gone' ? 'down' : null);

// Weekcijfers (bingTrend.series) → dezelfde statussen als nowStatus: laatste 2 weken tegen de 6 weken ervoor.
export function bingStatus(t) {
  if (!t || !t.series || t.series.length < 8) return null;
  const w = t.series.map(x => x.b || x.v || 0), n = w.length, avg = a => a.reduce((s, x) => s + x, 0) / Math.max(a.length, 1);
  const recent = avg(w.slice(n - 2)), before = avg(w.slice(Math.max(0, n - 8), n - 2)), total = w.slice(-8).reduce((s, x) => s + x, 0);
  const ratio = before > 0 ? recent / before : recent > 0 ? 3 : 0;
  const status = total < 30 ? 'quiet' : ratio >= 1.15 ? 'rising' : ratio >= 0.85 ? 'steady' : ratio >= 0.4 ? 'fading' : 'gone';
  return { status, ratio: Math.round(ratio * 100) / 100, weeks: w.slice(-12), src: 'bing' };
}

// Status per term (sleutel = schone term, zoals nowMap). Fouten of te weinig data: geen status.
export async function bingNowMap(terms, cc, store, clean = k => k, conc = 6) {
  const out = {}; if (!bingReady() || !terms.length) return out;
  const list = [...new Set(terms)];
  for (let i = 0; i < list.length; i += conc) {
    await Promise.all(list.slice(i, i + conc).map(async k => { try { const s = bingStatus(await bingActivity(k, cc, store)); if (s) out[clean(k)] = s; } catch {} }));
  }
  return out;
}

// Toets: Google-status naast Bing-status voor dezelfde termen (één keer per land per dag).
export async function recordAgreement(store, cc, pairs, day = new Date().toISOString().slice(0, 10)) {
  if (!store) return null;
  const st = (await getJSON(store, P, null).catch(() => null)) || {};
  const c = (st[cc] = st[cc] || { n: 0, agree: 0, byClass: {}, days: [] });
  if (c.days.includes(day)) return c;
  for (const [g, b] of pairs) {
    const a = cls(g && g.status), z = cls(b && b.status); if (!a || !z) continue;
    c.n++; if (a === z) c.agree++;
    const k = (c.byClass[a] = c.byClass[a] || { n: 0, agree: 0 }); k.n++; if (a === z) k.agree++;
  }
  c.days = [...c.days, day].slice(-60); c.at = new Date().toISOString();
  await putJSON(store, P, st).catch(() => {});
  return c;
}
export async function bingTrusted(store, cc) {
  if (!store || !bingReady()) return false;
  const st = (await getJSON(store, P, null).catch(() => null)) || {}, c = st[cc];
  return !!(c && c.n >= MIN_N && c.agree / c.n >= MIN_AGREE);
}
export async function bingNowState(store) { return (store && (await getJSON(store, P, null).catch(() => null))) || {}; }
