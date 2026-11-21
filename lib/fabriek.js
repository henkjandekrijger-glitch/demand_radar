// Voorspelfabriek (21 nov 2026, Henkjan: "Radar moet vooral extreem goed voorspellen kom weeer met een voorstel wat het 100 x beter
// maakt" en "Ja doe alle 4"). Drie dingen in één:
//  1. Meetlat: alleen wat de simpele gok (zelfde maand vorig jaar × trend, ledger.seizoensGok) NIET al zei telt. Een verrassing =
//     de doelmaand ligt ≥ 40% boven die gok. Seizoen is kalender, geen voorspelling.
//  2. Terugtoets op de historie: de kijklijst (± 20.000 termen per land, 4 jaar maanddata) wordt maand voor maand nagespeeld met
//     alleen de data van toen (± 1 miljoen nagekeken voorspellingen per land, gratis). Leren op de oudste jaren, toetsen op de
//     laatste 12 doelmaanden die het leren nooit zag.
//  3. Interne voorspelmarkt: elke voorspeller zet per term een kans in (eigen leertabel per voorspeller), de markt geeft elke
//     voorspeller gewicht naar hoe goed hij voorspelt (logistische weging op logloss, met rem). Voorspellers zonder geschiedenis
//     (aanbod: nieuwe domeinen, Keepa) doen mee zodra ze maanden hebben; tot dan weegt de markt ze vanzelf op nul.
// Uitkomst learn/fabriek.json (per land: toets, voorspellers met gewicht en eigen trefkans, top-verrassingen voor de komende
// maanden). De live tips gaan als soort 'verrassing' in het voorspellingsboek (ledger.js) en worden tegen toeval nagekeken.
import { getJSON, putJSON } from './store.js';
import { toArr, gokIdx, recordPredictions } from './ledger.js';

export const FABRIEK = 'learn/fabriek.json', VERSIE = 5; // 2 = gok "zo hoog als nu × seizoensstap"; 3 = én ≥ 40% boven nu; 4 = één tip per onderwerp (21 nov 2026)
const CCS = ['NL', 'DE', 'US'], M0 = 2015 * 12, SURPRISE = 1.4, FLOOR = 50, MINV = 100;
const ymOf = i => { const n = M0 + i; return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`; };
const idxOf = s => { const [y, m] = String(s).split('-').map(Number); return y * 12 + m - 1 - M0; };
const L = (x, y) => Math.log((x + 10) / (y + 10));
const ok = v => v >= 0; // NaN en ontbrekend → false
const sig = x => 1 / (1 + Math.exp(-x)), logit = p => { const q = Math.min(0.995, Math.max(0.005, p)); return Math.log(q / (1 - q)); };

// De voorspellers: elk één getal uit het verleden van de term (en eventueel een eigen bron), NaN = weet het niet.
// a = maandrij (index sinds 2015-01), t = laatste bekende maand, T = doelmaand, x = extra bronnen voor deze term.
export const VOORSPELLERS = [
  { id: 'nu', naam: 'verrassing nu', f: (a, t) => { const g = gokIdx(a, t - 1, t); return g == null ? NaN : L(a[t], g); } },
  { id: 'momentum', naam: 'momentum', f: (a, t) => (ok(a[t - 3]) ? L(a[t], (a[t - 1] + a[t - 2] + a[t - 3]) / 3) : NaN) },
  { id: 'jaartrend', naam: 'jaartrend', f: (a, t) => { let x = 0, y = 0; for (let i = 0; i < 12; i++) { if (!ok(a[t - i]) || !ok(a[t - 12 - i])) return NaN; x += a[t - i]; y += a[t - 12 - i]; } return L(x, y); } },
  { id: 'versnelling', naam: 'versnelling', f: (a, t) => (ok(a[t - 15]) ? L(a[t], a[t - 12]) - L(a[t - 3], a[t - 15]) : NaN) },
  { id: 'piek', naam: 'piek (terugval)', f: (a, t) => { const w = []; for (let i = t - 14; i <= t - 3; i++) { if (!ok(a[i])) return NaN; w.push(a[i]); } w.sort((p, q) => p - q); return L(Math.max(a[t], a[t - 1], a[t - 2]), (w[5] + w[6]) / 2); } },
  { id: 'grootte', naam: 'grootte', f: (a, t) => Math.log10(a[t] + 1) },
  { id: 'onrust', naam: 'onrust', f: (a, t) => { const r = []; for (let i = t - 11; i <= t; i++) { if (!ok(a[i]) || !ok(a[i - 12])) return NaN; r.push(L(a[i], a[i - 12])); } const m = r.reduce((s, v) => s + v, 0) / r.length; return Math.sqrt(r.reduce((s, v) => s + (v - m) ** 2, 0) / r.length); } },
  { id: 'seizoenspiek', naam: 'seizoenspiek', f: (a, t, T) => { let s = 0; for (let i = t - 11; i <= t; i++) { if (!ok(a[i])) return NaN; s += a[i]; } return L(a[T - 12], s / 12); } },
  { id: 'vorigjaar', naam: 'vorig jaar verrast', f: (a, t, T) => { const g = gokIdx(a, t - 12, T - 12); return g == null ? NaN : L(a[T - 12], g); } },
  { id: 'horizon', naam: 'maanden vooruit', f: (a, t, T) => T - t },
  // Aanbod vóór vraag (stap 4): wie geld zet, zit vóór de zoekvraag. Live vanaf 21 nov 2026, dus eerst zonder geschiedenis.
  { id: 'domeinen', naam: 'nieuwe domeinen', f: (a, t, T, x) => { const c = x.domCov, d = x.dom || {}; return c && c.has(t) && c.has(t - 1) && c.has(t - 2) && c.has(t - 3) ? L(d[t] || 0, ((d[t - 1] || 0) + (d[t - 2] || 0) + (d[t - 3] || 0)) / 3) : NaN; } },
  { id: 'amazon', naam: 'Amazon-verkoop (Keepa)', f: (a, t, T, x) => (x.sold && ok(x.sold[t]) && ok(x.sold[t - 3]) ? L(x.sold[t], x.sold[t - 3]) - L(a[t], a[t - 3]) : NaN) },
];
const STOP = new Set(['for', 'the', 'and', 'kopen', 'kaufen', 'buy', 'voor', 'für', 'with', 'met', 'mit', 'near', 'van', 'von', 'der', 'die', 'das', 'het', 'een']);
const K = VOORSPELLERS.length, BINS = 10, PRIOR_BIN = 30, LAMBDA = 30;

// Een voorspeller leert zijn eigen kans: kwantielvakjes over zijn getal (plus een vakje "weet het niet"), trefkans per vakje met rem.
function leerVakjes(vals, ys, base) {
  const fin = []; for (let i = 0; i < vals.length; i++) if (Number.isFinite(vals[i])) fin.push(vals[i]);
  fin.sort((p, q) => p - q);
  const edges = []; for (let b = 1; b < BINS; b++) if (fin.length) edges.push(fin[Math.floor((b * fin.length) / BINS)]);
  const uniq = [...new Set(edges)], n = new Float64Array(uniq.length + 2), h = new Float64Array(uniq.length + 2);
  const vak = v => { if (!Number.isFinite(v)) return uniq.length + 1; let i = 0; while (i < uniq.length && v > uniq[i]) i++; return i; };
  for (let i = 0; i < vals.length; i++) { const b = vak(vals[i]); n[b]++; h[b] += ys[i]; }
  const p = [...n].map((c, b) => (h[b] + base * PRIOR_BIN) / (c + PRIOR_BIN));
  return { edges: uniq, p: p.map(x => +x.toFixed(5)), n: [...n], vak };
}
const kansVan = (V, v) => V.p[V.vak(v)];

// De markt: logistische weging van de (gelogitte) kansen van de voorspellers, met rem naar 0 (Newton).
function leerMarkt(X, ys, base, k) {
  const w = new Float64Array(k + 1); w[0] = logit(base);
  for (let it = 0; it < 12; it++) {
    const g = new Float64Array(k + 1), H = Array.from({ length: k + 1 }, () => new Float64Array(k + 1));
    for (let j = 1; j <= k; j++) { g[j] += LAMBDA * w[j]; H[j][j] += LAMBDA; }
    H[0][0] += 1e-6;
    for (let r = 0; r < ys.length; r++) {
      let z = w[0]; const o = r * k; for (let j = 0; j < k; j++) z += w[j + 1] * X[o + j];
      const q = sig(z), e = q - ys[r], s = q * (1 - q);
      g[0] += e; H[0][0] += s;
      for (let j = 0; j < k; j++) { const xj = X[o + j]; g[j + 1] += e * xj; H[0][j + 1] += s * xj; for (let l = j; l < k; l++) H[j + 1][l + 1] += s * xj * X[o + l]; }
    }
    for (let j = 0; j <= k; j++) for (let l = 0; l < j; l++) H[j][l] = H[l][j];
    const d = solve(H, g); if (!d) break;
    let m = 0; for (let j = 0; j <= k; j++) { w[j] -= d[j]; m += Math.abs(d[j]); }
    if (m < 1e-6) break;
  }
  return [...w];
}
function solve(A, b) { // Gauss met pivot; klein stelsel (≤ 13)
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null; [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

// Alle rijen van één land: elke term, elke beginmaand t, horizon 1-3. cb(term, t, T, y, waarden) per rij.
function rijen(terms, xtra, L0, { tMax = L0 - 1, tMin = -Infinity, TMin = -Infinity, TMax = L0 } = {}, cb) {
  const v = new Float64Array(K), leeg = { domCov: xtra.domCov };
  for (const [k, a] of terms) {
    const x = xtra.get(k) || leeg;
    for (let t = Math.max(tMin, 27); t <= tMax; t++) {
      if (!(a[t] >= MINV) || !ok(a[t - 26])) continue;
      for (let h = 1; h <= 3; h++) {
        const T = t + h; if (T < TMin || T > TMax) continue;
        const gok = gokIdx(a, t, T); if (gok == null) continue;
        const known = ok(a[T]); const y = known ? (a[T] >= SURPRISE * Math.max(gok, a[t], FLOOR) ? 1 : 0) : -1; // stijgt ≥ 40% boven nu én boven de gok
        for (let j = 0; j < K; j++) v[j] = VOORSPELLERS[j].f(a, t, T, x);
        cb(k, t, T, y, v, gok, a);
      }
    }
  }
}

// Leren op een set rijen: eerst elke voorspeller zijn eigen kans, dan de markt. Steekproef om het snel te houden.
function leer(terms, xtra, L0, win, cap = 300000) {
  let tot = 0; rijen(terms, xtra, L0, win, (k, t, T, y) => { if (y >= 0) tot++; });
  const step = Math.max(1, tot / cap), vals = Array.from({ length: K }, () => []), ys = []; let c = 0;
  rijen(terms, xtra, L0, win, (k, t, T, y, v) => { if (y < 0) return; c++; if (c % step >= 1) return; for (let j = 0; j < K; j++) vals[j].push(v[j]); ys.push(y); });
  const n = ys.length, base = n ? ys.reduce((s, x) => s + x, 0) / n : 0;
  const V = vals.map(col => leerVakjes(col, ys, base));
  const X = new Float64Array(n * K); for (let r = 0; r < n; r++) for (let j = 0; j < K; j++) X[r * K + j] = logit(kansVan(V[j], vals[j][r])) - logit(base);
  const w = leerMarkt(X, ys, base, K);
  // aandeel per voorspeller in de markt: gewicht × spreiding van zijn bijdrage
  const sd = Array.from({ length: K }, (_, j) => { let m = 0, q = 0; for (let r = 0; r < n; r++) { const x = X[r * K + j]; m += x; q += x * x; } m /= n || 1; return Math.sqrt(Math.max(0, q / (n || 1) - m * m)); });
  const inv = sd.map((s, j) => Math.abs(w[j + 1]) * s), sum = inv.reduce((s, x) => s + x, 0) || 1;
  return { n, tot, base, V, w, share: inv.map(x => x / sum) };
}
const marktKans = (M, v, out) => { let z = M.w[0]; for (let j = 0; j < K; j++) { const x = logit(kansVan(M.V[j], v[j])) - logit(M.base); if (out) out[j] = M.w[j + 1] * x; z += M.w[j + 1] * x; } return sig(z); };

// Toets op de laatste 12 doelmaanden (nooit gezien bij het leren): logloss tegen toeval en trefkans van de top-100 per maand.
function toets(terms, xtra, L0, M, cut) {
  let n = 0, hits = 0, llM = 0, llB = 0; const perM = new Map();
  rijen(terms, xtra, L0, { TMin: cut + 1, TMax: L0, tMin: cut - 2 }, (k, t, T, y, v) => {
    if (y < 0) return;
    const q = marktKans(M, v); n++; hits += y; llM -= y ? Math.log(q) : Math.log(1 - q); llB -= y ? Math.log(M.base) : Math.log(1 - M.base);
    if (T - t !== 2) return; // top-100: tips die 2 maanden vooruit gedaan zijn
    const ps = new Float32Array(K); for (let j = 0; j < K; j++) ps[j] = kansVan(M.V[j], v[j]);
    (perM.get(T) || perM.set(T, []).get(T)).push({ q, y, ps });
  });
  const top = (key, N = 100) => { const out = []; for (const [T, l] of perM) { if (l.length < 500) continue; const r = l.reduce((s, x) => s + x.y, 0) / l.length; const tk = [...l].sort((p, q) => key(q) - key(p)).slice(0, N); out.push({ m: ymOf(T), hit: tk.reduce((s, x) => s + x.y, 0) / tk.length, base: r, n: l.length }); } return out.sort((p, q) => (p.m < q.m ? -1 : 1)); };
  const avg = l => { if (!l.length) return null; const hit = l.reduce((s, x) => s + x.hit, 0) / l.length, base = l.reduce((s, x) => s + x.base, 0) / l.length; return { hit: Math.round(hit * 100), base: Math.round(base * 1000) / 10, lift: base ? +(hit / base).toFixed(1) : null, maanden: l.length }; };
  const mk = top(x => x.q);
  return { rijen: n, toeval: n ? Math.round((1000 * hits) / n) / 10 : null, winst: llB ? Math.round((1 - llM / llB) * 1000) / 10 : null,
    top100: avg(mk), perMaand: mk.map(x => ({ m: x.m, raak: Math.round(x.hit * 100), toeval: Math.round(x.base * 1000) / 10, termen: x.n })),
    alleen: Object.fromEntries(VOORSPELLERS.map((P, j) => [P.id, avg(top(x => x.ps[j]))])) };
}

// Extra bronnen per term: nieuwe domeinen (aanbod/domeinen-<maand>.json) en Keepa-verkoop (keepa/<cc>.json), als rijen op dezelfde index.
async function extraBronnen(store, cc) {
  const xtra = new Map();
  const kp = await getJSON(store, `keepa/${cc === 'NL' ? 'DE' : cc}.json`, null).catch(() => null);
  if (kp && cc !== 'NL') for (const [k, s] of Object.entries(kp)) if (s && s.sold) { const a = new Float32Array(180).fill(NaN); for (const [m, v] of Object.entries(s.sold)) { const i = idxOf(m); if (i >= 0 && i < 180 && v >= 0) a[i] = v; } (xtra.get(k) || xtra.set(k, {}).get(k)).sold = a; }
  // nieuwe domeinen: alleen volle maanden (≥ 25 dagbestanden) tellen als gemeten; per term het aantal per maand
  const dom = await getJSON(store, 'aanbod/domeinen.json', null).catch(() => null); xtra.domCov = new Set();
  if (dom && dom.maand) for (const [m, M] of Object.entries(dom.maand)) {
    const i = idxOf(m); if (i < 0 || i >= 180 || !((M.dagen || []).length >= 25)) continue; xtra.domCov.add(i);
    for (const [k, c] of Object.entries(M.tel || {})) { const x = xtra.get(k) || xtra.set(k, {}).get(k); (x.dom = x.dom || {})[i] = c; }
  }
  for (const x of xtra.values()) x.domCov = xtra.domCov;
  return xtra;
}

// Eén land doorrekenen: toets (leren op oud, toetsen op de laatste 12 maanden), dan opnieuw leren op alles en live voorspellen.
export async function fabriekLand(store, cc, { ser = null, top = 40 } = {}) {
  const raw = ser || (await getJSON(store, `early/series-${cc}.json`, null).catch(() => null));
  if (!raw || !raw.kw || !raw.month) return { cc, skip: 'geen kijklijst' };
  const t0 = Date.now(), L0 = idxOf(raw.month), terms = [];
  for (const [k, s] of Object.entries(raw.kw)) if (s && s.m && s.m.length >= 30) terms.push([k, toArr(s.m)]);
  const xtra = await extraBronnen(store, cc), cut = L0 - 12;
  const Mt = leer(terms, xtra, L0, { TMax: cut, tMax: cut - 1 });
  const T = toets(terms, xtra, L0, Mt, cut);
  const M = leer(terms, xtra, L0, { TMax: L0 }); // alles wat bekend is
  // live: beginmaand = laatste maand van de kijklijst, doel 1-3 maanden vooruit
  const live = [], bij = new Float64Array(K);
  rijen(terms, xtra, L0, { tMin: L0, tMax: L0, TMin: L0 + 1, TMax: L0 + 3 }, (k, t, Tt, y, v, gok, a) => {
    const p = marktKans(M, v, bij); if (p < M.base * 2) return;
    const why = [...bij].map((c, j) => [VOORSPELLERS[j].naam, c]).filter(x => x[1] > 0.05).sort((p1, q) => q[1] - p1[1]).slice(0, 2).map(x => x[0]);
    live.push({ k, now: ymOf(t), target: ymOf(Tt), p: Math.round(p * 1000) / 10, gok: Math.round(gok), nu: Math.round(a[t]), why });
  });
  live.sort((p, q) => q.p - p.p);
  // één tip per onderwerp: varianten (meervoud, woordvolgorde, "kopen") tellen als dezelfde term
  const stam = k => String(k).toLowerCase().split(/[\s-]+/).filter(w => w.length >= 3 && !STOP.has(w)).map(w => w.replace(/z/g, 's').replace(/s$/, '').replace(/ing$/, '').replace(/(en|e|n)$/, '').replace(/y$/, 'i').replace(/(.)\1$/, '$1')).sort().join(' ');
  const seen = new Set(), calls = []; for (const c of live) { const s = stam(c.k) || c.k; if (seen.has(s)) continue; seen.add(s); calls.push(c); if (calls.length >= top) break; }
  return { cc, month: raw.month, terms: terms.length, ms: Date.now() - t0, toets: T,
    leren: { rijen: Mt.tot, steekproef: Mt.n, toeval: Math.round(Mt.base * 1000) / 10 },
    markt: VOORSPELLERS.map((P, j) => ({ id: P.id, naam: P.naam, aandeel: Math.round(M.share[j] * 100), gewicht: +M.w[j + 1].toFixed(3), alleenTop100: T.alleen[P.id] })).sort((p1, q) => q.aandeel - p1.aandeel),
    toevalNu: Math.round(M.base * 1000) / 10, calls };
}

// Vanuit /api/loop: één land per ronde, alleen als de kijklijst een nieuwere maand heeft (of nog nooit gedraaid).
export async function fabriekRonde(store, { force = false, cc: only = null } = {}) {
  const cur = (await getJSON(store, FABRIEK, null).catch(() => null)) || { landen: {} };
  for (const cc of CCS) {
    if (only && cc !== only) continue;
    const ser = await getJSON(store, `early/series-${cc}.json`, null).catch(() => null);
    if (!ser || !ser.month) continue;
    const had = cur.landen[cc];
    if (!force && had && (cur.versie || 1) === VERSIE && had.month === ser.month && Date.now() - Date.parse(had.at || 0) < 30 * 864e5) continue;
    const r = await fabriekLand(store, cc, { ser });
    if ((cur.versie || 1) < VERSIE) { // nieuwe meetlat: ongetoetste tips van de oude intrekken (nog niets nagekeken), oude landen opnieuw
      const o = await getJSON(store, 'ledger/open.json', null).catch(() => null);
      if (o && o.items) { let n = 0; for (const [id, e] of Object.entries(o.items)) if (e.kind === 'verrassing' && e.v !== VERSIE) { delete o.items[id]; n++; } if (n) await putJSON(store, 'ledger/open.json', o); }
      for (const k of Object.keys(cur.landen)) if (k !== cc) delete cur.landen[k];
    }
    r.at = new Date().toISOString(); cur.landen[cc] = r; cur.at = r.at; cur.versie = VERSIE;
    await putJSON(store, FABRIEK, cur);
    // live tips in het voorspellingsboek: nagekeken tegen toeval met precies dezelfde meetlat
    const rec = await recordPredictions(store, (r.calls || []).map(c => ({ kind: 'verrassing', cc, k: c.k, now: c.now, target: c.target, p: c.p, v: VERSIE }))).catch(e => ({ error: String(e.message || e).slice(0, 80) }));
    return { fabriek: cc, ms: r.ms, toets: r.toets && { winst: r.toets.winst, top100: r.toets.top100 }, calls: (r.calls || []).length, ledger: rec };
  }
  return { fabriek: 'up to date' };
}

// Leesbaar overzicht (publiek, voor de overdracht en /api/early?fabriek=1): geen bedragen of sleutels.
export function fabriekView(cur) {
  if (!cur || !cur.landen) return { ready: false };
  return { ready: true, at: cur.at, meetlat: `verrassing = doelmaand ≥ ${Math.round((SURPRISE - 1) * 100)}% boven nu én boven de simpele gok (zo hoog als nu, met de seizoensstap van de vorige twee jaren)`,
    landen: Object.fromEntries(Object.entries(cur.landen).map(([cc, r]) => [cc, { month: r.month, terms: r.terms, toets: r.toets && { rijen: r.toets.rijen, toeval: r.toets.toeval, winst: r.toets.winst, top100: r.toets.top100, perMaand: r.toets.perMaand }, leren: r.leren, markt: r.markt, calls: r.calls, at: r.at }])) };
}
export async function loadFabriek(store) { return store ? getJSON(store, FABRIEK, null).catch(() => null) : null; }
