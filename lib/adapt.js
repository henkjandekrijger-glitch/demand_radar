// Het model blijft leren (13 nov 2026). Elke nieuwe datamaand stelt de radar de kansen van "Will rise" bij op wat er in de
// nieuwste maanden ECHT gebeurde: maanden die het model bij het trainen nog niet zag (eerlijk: alleen verleden → toekomst).
// Rijen uit de kijklijst (± 20.000 termen per land, early/series-<cc>.json), met precies dezelfde kenmerken als productie.
// Per land: q = σ(a + b·logit(getoonde kans)), met een rem richting "niets veranderen" (a=0, b=1) zolang er weinig rijen zijn.
// Daarnaast de ondergrens: stijgers waarvan de bijgestelde kans onder MIN_SHOW komt, toont de radar niet meer.
// Opslag learn/forecast-adapt.json; stand per land in de overdracht. Gratis: alleen de kijklijst lezen en rekenen.
import { getJSON, putJSON } from './store.js';
import { ML, mlRise, shownChance } from './ml.js';

export const ADAPT = 'learn/forecast-adapt.json';
export const MIN_SHOW = 60; // % kans (na bijstellen) om als stijger getoond te worden
const PRIOR = 40; // sterkte van de rem: zoveel "denkbeeldige" rijen die zeggen dat de oude kans klopt
const CCS = ['NL', 'DE', 'US'];
const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const sig = x => 1 / (1 + Math.exp(-x)), logit = p => { const q = Math.min(0.995, Math.max(0.005, p)); return Math.log(q / (1 - q)); };

// Vanaf welke doelmaand het model niets zag: de maand waarin het getraind is (de data liep toen tot de maand ervoor).
export const unseenFrom = () => process.env.ADAPT_FROM || (ML && ML.trained ? ML.trained.slice(0, 7) : '2026-10');

// Rijen voor één land: elke term, elke onzichtbare doelmaand, de horizons die productie gebruikt.
export function adaptRows(kw, cc, from = unseenFrom(), { minP = 0.6, limit = 400000 } = {}) {
  const rows = [];
  for (const s of Object.values(kw || {})) {
    if (!s || !s.m || s.m.length < 16) continue;
    const r = [...s.m].sort((a, b) => a[0] - b[0] || a[1] - b[1]), y = r.map(x => +x[2] || 0), keys = r.map(x => ym(x[0], x[1]));
    const lo = Math.max(13, keys.length - 12); // hooguit de laatste 12 doelmaanden (recent telt, en het blijft snel)
    for (let T = keys.length - 1; T >= lo && keys[T] >= from; T--) {
      for (let h0 = 1; h0 <= 2; h0++) for (let h = h0 + 1; h <= 4; h++) {
        const t = T - h; if (t < 12 || !(y[t + h0] >= 100)) continue;
        const p = mlRise(y, t, h, cc, h0); if (p == null || p < minP) continue;
        rows.push({ s: shownChance(p) / 100, y: y[T] >= 1.4 * y[t + h0] ? 1 : 0, raw: p, tgt: keys[T] });
        if (rows.length >= limit) return rows;
      }
    }
  }
  return rows;
}

// Logistische bijstelling met rem (Newton, 2 getallen). Geeft { a, b, n, ... }.
export function fitCalib(rows, prior = PRIOR) {
  let a = 0, b = 1;
  for (let it = 0; it < 25; it++) {
    let ga = prior * a, gb = prior * (b - 1), haa = prior, hab = 0, hbb = prior;
    for (const r of rows) { const x = logit(r.s), q = sig(a + b * x), w = q * (1 - q), e = q - r.y; ga += e; gb += e * x; haa += w; hab += w * x; hbb += w * x * x; }
    const det = haa * hbb - hab * hab; if (!(Math.abs(det) > 1e-12)) break;
    const da = (hbb * ga - hab * gb) / det, db = (haa * gb - hab * ga) / det; a -= da; b -= db;
    if (Math.abs(da) + Math.abs(db) < 1e-7) break;
  }
  const shown = rows.filter(r => r.raw >= 0.7), hit = shown.filter(r => r.y).length;
  const avgS = shown.length ? shown.reduce((t, r) => t + r.s, 0) / shown.length : null;
  const adj = r => sig(a + b * logit(r.s));
  const kept = shown.filter(r => adj(r) * 100 >= MIN_SHOW), keptHit = kept.filter(r => r.y).length;
  const ll = f => rows.reduce((t, r) => { const q = Math.min(0.999, Math.max(0.001, f(r))); return t - (r.y ? Math.log(q) : Math.log(1 - q)); }, 0) / Math.max(1, rows.length);
  return { a: +a.toFixed(4), b: +b.toFixed(4), n: rows.length, shown: shown.length, hit: shown.length ? Math.round((100 * hit) / shown.length) : null,
    said: avgS != null ? Math.round(avgS * 100) : null, now: shown.length ? Math.round((100 * shown.reduce((t, r) => t + adj(r), 0)) / shown.length) : null,
    kept: kept.length, keptHit: kept.length ? Math.round((100 * keptHit) / kept.length) : null,
    loglossOld: +ll(r => r.s).toFixed(4), loglossNew: +ll(adj).toFixed(4) };
}

// Bijgestelde kans (0-100) voor een getoonde kans (0-100). Zonder bijstelling: ongewijzigd.
export function applyAdapter(ad, cc, chance) {
  const f = ad && ad.fits && (ad.fits[cc] || ad.fits.ALL); if (!f || chance == null || !f.use) return chance;
  return Math.round(sig(f.a + f.b * logit(chance / 100)) * 100);
}
export async function loadAdapter(store) {
  if (!store) return null;
  return getJSON(store, ADAPT, null).catch(() => null);
}

// Maandelijks (vanuit /api/loop): alleen opnieuw als de kijklijst een nieuwere maand heeft dan de laatste bijstelling.
// Eén land per ronde (rekenwerk), daarna samen opslaan.
export async function adaptForecast(store, { force = false } = {}) {
  if (!ML) return { adapt: 'no model' };
  const cur = (await getJSON(store, ADAPT, null).catch(() => null)) || { fits: {}, months: {} };
  const t0 = Date.now(), from = unseenFrom(); let did = null;
  for (const cc of CCS) {
    const ser = await getJSON(store, `early/series-${cc}.json`, null).catch(() => null);
    if (!ser || !ser.month) continue;
    if (!force && cur.months[cc] === ser.month) continue;
    const rows = adaptRows(ser.kw, cc, from), f = fitCalib(rows);
    // alleen gebruiken als er genoeg getoonde stijgers zijn nagekeken en de bijstelling de voorspelling echt beter maakt
    f.use = f.shown >= 150 && f.loglossNew < f.loglossOld;
    f.month = ser.month; f.from = from; f.at = new Date().toISOString();
    cur.fits[cc] = f; cur.months[cc] = ser.month; did = cc;
    break; // één land per ronde
  }
  if (!did) return { adapt: 'up to date', months: cur.months };
  cur.at = new Date().toISOString(); cur.model = ML ? { version: ML.version, trained: ML.trained } : null; cur.minShow = MIN_SHOW;
  // logboek: hoe goed was het model in de nieuwste maanden (per land, per bijstelling)
  cur.log = [...(cur.log || []), { cc: did, month: cur.months[did], n: cur.fits[did].n, shown: cur.fits[did].shown, hit: cur.fits[did].hit, said: cur.fits[did].said, use: cur.fits[did].use, at: cur.at }].slice(-36);
  await putJSON(store, ADAPT, cur);
  return { adapted: did, ms: Date.now() - t0, fit: cur.fits[did] };
}
