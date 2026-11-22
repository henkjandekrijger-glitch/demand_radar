// Ruisfilter voor Google-maanddata (21 nov 2026, Henkjan: "En ja ruis filteren ."). Google Ads groepeert varianten soms opnieuw:
// dan springt een term in één keer 4× of meer omhoog of omlaag en blijft daar, terwijl de vraag niet echt veranderde
// ("luxury nyc hotels" −89% in een jaar). Wie dat als vraag leest, voorspelt een herstel dat niet komt. Regel: een blijvende
// sprong (mediaan van 3 maanden erna tegen 3 maanden ervoor ≥ 4× of ≤ ¼, en een half jaar later nog ≥ 3× of ≤ ⅓) die een jaar
// eerder niet op dezelfde plek zat (dus geen seizoen) = breuk. Alles vóór de breuk telt dan niet meer mee (NaN).
const med = l => { const s = l.filter(x => x >= 0).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const r = (a, b) => (b > 0 ? a / b : a > 0 ? Infinity : 1);

// Zoekt in de rij (index = maanden sinds 2015-01) de laatste breuk tot en met maand L. Geeft de index van de eerste maand ná de breuk, of -1.
export function breuk(a, L) {
  for (let j = L - 2; j >= L - 40; j--) {
    const na = med([a[j], a[j + 1], a[j + 2]]), voor = med([a[j - 1], a[j - 2], a[j - 3]]); if (!(na >= 0) || !(voor >= 0)) continue;
    const x = r(na + 10, voor + 10); if (x < 4 && x > 0.25) continue;
    const lang = med([a[j], a[j + 1], a[j + 2], a[j + 3], a[j + 4], a[j + 5]]), langVoor = med([a[j - 1], a[j - 2], a[j - 3], a[j - 4], a[j - 5], a[j - 6]]);
    const y = r(lang + 10, langVoor + 10); if (y < 3 && y > 1 / 3) continue;
    const vj = r(med([a[j - 12], a[j - 11], a[j - 10]]) + 10, med([a[j - 13], a[j - 14], a[j - 15]]) + 10);
    if (Number.isFinite(vj) && (x >= 4 ? vj >= 2 : vj <= 0.5)) continue; // vorig jaar zelfde sprong: seizoen
    // de medianen vinden de sprong 1-2 maanden te vroeg of te laat: neem de maand met de grootste stap
    let best = j, bs = -1; for (let i = j - 2; i <= j + 1; i++) { if (!(a[i] >= 0) || !(a[i - 1] >= 0)) continue; const st = Math.abs(Math.log((a[i] + 10) / (a[i - 1] + 10))); if (st > bs) { bs = st; best = i; } }
    return best;
  }
  return -1;
}
// Schone kopie: alles vóór de breuk weg. Geeft { a, j } (j = -1 zonder breuk).
export function schoon(a, L) { const j = breuk(a, L); if (j < 0) return { a, j }; const b = Float32Array.from(a); for (let i = 0; i < j; i++) b[i] = NaN; return { a: b, j }; }
