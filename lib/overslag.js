// Overslag: welke zoektrends uit de VS en Duitsland slaan over naar Nederland (24 nov 2026, Henkjan: "zoals we eerder keken duitse
// of vs trend die naar NL over slaat ? of kan slaan die voorspelling kan je maken" en "Ja doe").
// Eerder (16 okt, README) bleek in een event-studie alleen Duitsland → Nederland eenzijdig; de VS liep net zo vaak achter als voor
// (gezamenlijke oorzaak). Als kenmerk in het model gaf het geen winst. Dit onderdeel maakt er wat toen open bleef van: een lijst
// "stijgt in de VS of DE, nog niet in NL", met per bronland een eerlijke terugtoets en de omgekeerde richting als controle.
//  1. Koppelen: dezelfde term (merk- en productnamen zijn vaak gelijk) of een vertaling uit een kleine, zekere woordenlijst
//     EN/DE → NL (KAART). Een koppeling telt alleen als de NL-vorm echt op de NL-kijklijst staat.
//  2. Stijging (vooraf vastgelegd, `stijgtIdx` in ledger.js, dezelfde formule als het voorspellingsboek): 3 maanden op rij boven
//     dezelfde maand vorig jaar, samen ≥ 1,5× die maanden, en gemiddeld ≥ VLOER per maand. Begin = eerste maand dat dit geldt.
//  3. Terugtoets: elk begin in het bronland terwijl NL de 3 maanden ervoor niet steeg → steeg NL binnen 6 maanden, en na hoeveel?
//     Toeval = dezelfde koppelingen in maanden zonder voorloper. Omgekeerd = NL eerst, volgt het bronland? (gelijk = gezamenlijke
//     oorzaak, geen voorloper). Kans per "maanden sinds het begin" × sterkte, met rem naar het gemiddelde.
//  4. Live: bronland stijgt nu (begin hooguit 3 maanden terug), NL nog niet → verwachte maand en kans uit de terugtoets.
// Alleen lezen en rekenen op de kijklijst (early/series-<cc>.json), dus gratis. Opslag overslag/<cc>.json.
import { getJSON, putJSON } from './store.js';
import { toArr, stijgtIdx, recordPredictions } from './ledger.js';
import { schoon } from './schoon.js';
import { noise } from './rising.js';

export const VERSIE = 1, OUT = cc => `overslag/${cc}.json`;
export const DOEL = { NL: ['US', 'DE'] }; // België: geen kijklijst (alleen NL, DE en US hebben maanddata; BE erbij kost DataForSEO)
const M0 = 2015 * 12, MIN_GEVALLEN = 30, H = 6, KOEL = 12, PRIOR = 20, VLOER = { NL: 50, DE: 100, US: 100 };
const ymOf = i => { const n = M0 + i; return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`; };
const idxOf = s => { const [y, m] = String(s).split('-').map(Number); return y * 12 + m - 1 - M0; };
const ok = v => v >= 0;

// Woorden die niets zeggen over het product (kopen, best, goedkoop) vallen weg aan beide kanten.
const LEEG = new Set(['buy', 'kopen', 'kaufen', 'kauf', 'bestellen', 'order', 'online', 'shop', 'sale', 'best', 'beste', 'besten', 'cheap', 'goedkoop', 'goedkope', 'gunstig', 'guenstig', 'kaufen.', 'the', 'de', 'het', 'een', 'der', 'die', 'das']);
export const norm = k => String(k || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(w => w && !LEEG.has(w));

// Kleine vertaalkaart, alleen zekere productwoorden (sleutels al genormaliseerd: geen accenten, ß = ss). Een woord dat er niet in
// staat blijft zichzelf (lamp, laptop, airfryer). Bijvoeglijke vormen (gouden, zwarte) staan als tweede keus.
export const KAART = {
  EN: {
    necklace: ['ketting'], necklaces: ['kettingen', 'ketting'], bracelet: ['armband'], bracelets: ['armbanden', 'armband'], earrings: ['oorbellen'], earring: ['oorbel', 'oorbellen'],
    watch: ['horloge'], watches: ['horloges', 'horloge'], bag: ['tas'], bags: ['tassen', 'tas'], backpack: ['rugzak'], wallet: ['portemonnee'], umbrella: ['paraplu'],
    shoes: ['schoenen'], boots: ['laarzen'], jacket: ['jas'], coat: ['jas'], dress: ['jurk'], dresses: ['jurken', 'jurk'], socks: ['sokken'], sunglasses: ['zonnebril'], glasses: ['bril'],
    lamp: ['lamp'], lamps: ['lampen', 'lamp'], water: ['water'], filter: ['filter'], bottle: ['fles'], mug: ['mok'], candle: ['kaars'], candles: ['kaarsen'],
    chair: ['stoel'], chairs: ['stoelen', 'stoel'], table: ['tafel'], desk: ['bureau'], mattress: ['matras'], pillow: ['kussen'], blanket: ['deken'], curtains: ['gordijnen'],
    mirror: ['spiegel'], wardrobe: ['kledingkast'], kitchen: ['keuken'], knife: ['mes'], knives: ['messen'], toys: ['speelgoed'], toy: ['speelgoed'], puzzle: ['puzzel'],
    book: ['boek'], books: ['boeken'], calendar: ['kalender'], christmas: ['kerst'], tree: ['boom'], garden: ['tuin'], plants: ['planten'], flowers: ['bloemen'],
    heater: ['kachel'], vacuum: ['stofzuiger'], coffee: ['koffie'], tea: ['thee'], bike: ['fiets'], bicycle: ['fiets'], helmet: ['helm'], tent: ['tent'],
    drill: ['boormachine'], saw: ['zaag'], battery: ['batterij', 'accu'], charger: ['oplader'], cable: ['kabel'], phone: ['telefoon'], headphones: ['koptelefoon'],
    keyboard: ['toetsenbord'], mouse: ['muis'], soap: ['zeep'], toothbrush: ['tandenborstel'], dog: ['hond', 'honden'], cat: ['kat', 'katten'], stroller: ['kinderwagen'],
    women: ['dames'], womens: ['dames'], men: ['heren'], mens: ['heren'], kids: ['kinder', 'kinderen'], gold: ['goud', 'gouden'], silver: ['zilver', 'zilveren'],
    wooden: ['houten'], wood: ['hout', 'houten'], black: ['zwart', 'zwarte'], white: ['wit', 'witte'], red: ['rood', 'rode'], pink: ['roze'], blue: ['blauw', 'blauwe'],
    green: ['groen', 'groene'], wireless: ['draadloos', 'draadloze'], electric: ['elektrisch', 'elektrische'], outdoor: ['buiten'], ice: ['ijs'], bath: ['bad'], sauna: ['sauna'],
  },
  DE: {
    kette: ['ketting'], halskette: ['ketting'], ketten: ['kettingen', 'ketting'], armband: ['armband'], armbander: ['armbanden'], ohrringe: ['oorbellen'], ohrring: ['oorbel'],
    uhr: ['horloge'], uhren: ['horloges'], tasche: ['tas'], taschen: ['tassen'], rucksack: ['rugzak'], geldborse: ['portemonnee'], regenschirm: ['paraplu'],
    schuhe: ['schoenen'], stiefel: ['laarzen'], jacke: ['jas'], mantel: ['jas'], kleid: ['jurk'], socken: ['sokken'], sonnenbrille: ['zonnebril'], brille: ['bril'],
    lampe: ['lamp'], lampen: ['lampen'], leuchte: ['lamp'], wasser: ['water'], filter: ['filter'], flasche: ['fles'], kerze: ['kaars'], kerzen: ['kaarsen'],
    stuhl: ['stoel'], stuhle: ['stoelen'], tisch: ['tafel'], schreibtisch: ['bureau'], bett: ['bed'], matratze: ['matras'], kissen: ['kussen'], decke: ['deken'],
    vorhange: ['gordijnen'], teppich: ['vloerkleed', 'tapijt'], spiegel: ['spiegel'], schrank: ['kast'], kleiderschrank: ['kledingkast'], kuche: ['keuken'], pfanne: ['pan'],
    messer: ['mes'], spielzeug: ['speelgoed'], puzzle: ['puzzel'], buch: ['boek'], bucher: ['boeken'], kalender: ['kalender'], adventskalender: ['adventskalender'],
    weihnachten: ['kerst'], weihnachts: ['kerst'], baum: ['boom'], garten: ['tuin'], pflanzen: ['planten'], blumen: ['bloemen'], staubsauger: ['stofzuiger'],
    saugroboter: ['robotstofzuiger'], kaffee: ['koffie'], kaffeemaschine: ['koffiemachine', 'koffiezetapparaat'], tee: ['thee'], fahrrad: ['fiets'], helm: ['helm'],
    zelt: ['tent'], schlafsack: ['slaapzak'], bohrmaschine: ['boormachine'], sage: ['zaag'], akku: ['accu'], batterie: ['batterij'], ladegerat: ['oplader'], kabel: ['kabel'],
    handy: ['telefoon'], kopfhorer: ['koptelefoon'], tastatur: ['toetsenbord'], maus: ['muis'], seife: ['zeep'], zahnburste: ['tandenborstel'], hund: ['hond', 'honden'],
    katze: ['kat', 'katten'], kinderwagen: ['kinderwagen'], damen: ['dames'], herren: ['heren'], kinder: ['kinder', 'kinderen'], gold: ['goud', 'gouden'],
    silber: ['zilver', 'zilveren'], holz: ['hout', 'houten'], schwarz: ['zwart', 'zwarte'], schwarze: ['zwarte'], weiss: ['wit', 'witte'], weisse: ['witte'], rot: ['rood', 'rode'],
    rosa: ['roze'], blau: ['blauw', 'blauwe'], grun: ['groen', 'groene'], kabellos: ['draadloos', 'draadloze'], elektrisch: ['elektrisch', 'elektrische'],
    elektrische: ['elektrische'], eis: ['ijs'], eisbad: ['ijsbad'], sauna: ['sauna'], whirlpool: ['jacuzzi'],
  },
};
// Eén woord dat in beide talen bestaat maar iets anders betekent: dan geen koppeling op "dezelfde term".
const VALS = { EN: new Set(['gift', 'boot', 'boots', 'kind', 'slim', 'brief', 'room', 'mist', 'door', 'arm', 'angel', 'bank', 'wet', 'worst', 'die', 'pet', 'rug', 'step', 'stem', 'lap', 'tip', 'hoes', 'rok', 'spot', 'hel', 'hell', 'bad', 'fee', 'pad', 'kantoor', 'tank']),
  DE: new Set(['mist', 'winkel', 'tafel', 'hut', 'rat', 'doof', 'kast', 'bellen', 'lust', 'zalig', 'wiegen', 'stuur']) };
// Ruis die niet over te nemen of te verkopen is (bovenop lib/rising.js noise): media, nieuws, weer, losse evenementen en feestdagen
// die per jaar van maand wisselen (dan is "boven vorig jaar" alleen de kalender).
const RUIS = /\b(film|movie|trailer|season|staffel|seizoen|episode|lyrics|songtekst|song|album|tour|concert|konzert|tickets?|karten|news|nieuws|nachrichten|weather|wetter|weer|stock|aktie|aandeel|koers|kurs|election|wahl|verkiezing|score|uitslag|live|stream|black friday|cyber monday|prime day|thanksgiving|easter|ostern|pasen|ramadan|eid|walmart|target|costco|kmart|lidl|aldi|kruidvat|action|near me|in der nahe|in de buurt)\b/;
const ruis = (k, cc) => RUIS.test(norm(k).join(' ')) || noise({ k, monthly: [] }, cc);

// Varianten per woord: zichzelf plus de vertaling; Duitse samenstellingen ook in twee bekende delen (wasserfilter → water + filter).
function opties(w, taal) {
  const K = KAART[taal] || {}, o = new Set([w, ...(K[w] || [])]);
  if (taal === 'DE' && !K[w] && w.length >= 8) for (let i = 3; i <= w.length - 4; i++) {
    let l = w.slice(0, i); const r = w.slice(i); if (!K[r]) continue;
    const ls = K[l] ? K[l] : K[l.replace(/(s|n|en|e)$/, '')]; if (!ls) continue;
    for (const a of ls) for (const b of K[r]) o.add(a + b);
  }
  return [...o];
}
// Alle NL-vormen die bij een bronterm horen (hooguit 48), elk met "gelijk" (zelfde woorden) of "vertaald".
export function kandidaten(woorden, taal) {
  if (!woorden.length || woorden.length > 4) return [];
  let combos = [[]];
  for (const w of woorden) { const n = []; for (const c of combos) for (const o of opties(w, taal)) if (n.length < 48) n.push([...c, o]); combos = n; }
  const eigen = woorden.join(' '), out = new Map();
  for (const c of combos) {
    const vorm = c.join(' '), soort = vorm === eigen ? 'gelijk' : 'vertaald';
    if (!out.has(vorm)) out.set(vorm, soort);
    if (c.length >= 2 && c.length <= 3) { const plak = c.join(''); if (!out.has(plak)) out.set(plak, soort === 'gelijk' ? 'gelijk' : 'vertaald'); }
  }
  return [...out].map(([vorm, soort]) => ({ vorm, soort }));
}

const vol12 = a => { let s = 0, L = a.length; for (let i = 0; i < L; i++) if (ok(a[i])) s += a[i]; return s; };
// Per land: genormaliseerde sleutel → { k, a } (bij varianten de grootste). Met ruis- en breukfilter.
function index(raw, cc, L0) {
  const map = new Map();
  for (const [k, s] of Object.entries(raw.kw || {})) {
    if (!s || !s.m || s.m.length < 30 || ruis(k, cc)) continue;
    const w = norm(k); if (!w.length || w.join('').length < 3 || /^\d+$/.test(w.join(''))) continue;
    const key = w.join(' '), a = schoon(toArr(s.m), L0).a, v = vol12(a.subarray(Math.max(0, L0 - 11), L0 + 1));
    const had = map.get(key); if (!had || v > had.v) map.set(key, { k, a, v, w });
  }
  return map;
}

// Koppelingen bronland → NL (één per NL-term per bronland: de grootste bronterm).
export function koppel(bron, doel, taal) {
  const per = new Map();
  for (const [, s] of bron) {
    const vals = s.w.length === 1 && (VALS[taal] || new Set()).has(s.w[0]); // valse vriend: niet op "dezelfde term"
    const best = []; for (const c of kandidaten(s.w, taal)) { const d = doel.get(c.vorm); if (d && !(vals && c.soort === 'gelijk')) best.push({ d, soort: c.soort }); }
    if (!best.length) continue;
    best.sort((p, q) => (p.soort === q.soort ? q.d.v - p.d.v : p.soort === 'gelijk' ? -1 : 1));
    const { d, soort } = best[0];
    const had = per.get(d.k); if (!had || s.v > had.s.v) per.set(d.k, { s, d, soort });
  }
  return [...per.values()];
}

const kwart = (l, q) => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const sterkte = (a, t) => { const s = a[t] + a[t - 1] + a[t - 2], s0 = a[t - 12] + a[t - 13] + a[t - 14]; return (s + 30) / (s0 + 30); };
// Eén losse piekmaand (nieuws, actie, telfout) is geen trend: de grootste van de 3 maanden is ≥ 70% van het totaal.
const piek = (a, t) => Math.max(a[t], a[t - 1], a[t - 2]) >= 0.7 * (a[t] + a[t - 1] + a[t - 2]);
const sterkVak = r => (r >= 3 ? '3x+' : r >= 2 ? '2-3x' : '1,5-2x');
const pct = (h, n) => (n ? Math.round((1000 * h) / n) / 10 : null);

// Terugtoets voor één bronland. Geeft cijfers en de kanstabel (per maanden sinds het begin × sterkte).
export function terugtoets(paren, L0, vB, vD) {
  const st = (a, t, v) => stijgtIdx(a, t, v), geenNL = (a, t) => !(st(a, t, vD) || st(a, t - 1, vD) || st(a, t - 2, vD) || st(a, t - 3, vD));
  const gevallen = [], omg = { n: 0, raak: 0 }, ctrl = { n: 0, raak: 0 }, ctrlB = { n: 0, raak: 0 };
  const tMin = 16, tMax = L0 - H;
  for (const { s, d } of paren) {
    const A = s.a, B = d.a; let koelB = -Infinity, koelD = -Infinity;
    for (let t = tMin; t <= tMax; t++) {
      const bNu = st(A, t, vB), bBegin = bNu && !st(A, t - 1, vB), dNu = st(B, t, vD), dBegin = dNu && !st(B, t - 1, vD);
      const bRust = !(bNu || st(A, t - 1, vB) || st(A, t - 2, vB) || st(A, t - 3, vB));
      if (bBegin && t >= koelB && geenNL(B, t) && !piek(A, t)) { // voorloper: bron begint, NL nog niet
        let lag = 0; for (let h = 1; h <= H; h++) if (st(B, t + h, vD)) { lag = h; break; }
        gevallen.push({ t, lag, r: sterkte(A, t) }); koelB = t + KOEL;
      } else if (bRust && geenNL(B, t)) { // toeval: dezelfde koppelingen zonder voorloper
        let h1 = 0; for (let h = 1; h <= H; h++) if (st(B, t + h, vD)) { h1 = h; break; }
        ctrl.n++; if (h1) ctrl.raak++;
      }
      if (dBegin && t >= koelD && !(st(A, t, vB) || st(A, t - 1, vB) || st(A, t - 2, vB) || st(A, t - 3, vB))) { // omgekeerd: NL eerst
        let h1 = 0; for (let h = 1; h <= H; h++) if (st(A, t + h, vB)) { h1 = h; break; }
        omg.n++; if (h1) omg.raak++; koelD = t + KOEL;
      } else if (bRust && !dNu && !(st(B, t - 1, vD) || st(B, t - 2, vD) || st(B, t - 3, vD))) {
        let h1 = 0; for (let h = 1; h <= H; h++) if (st(A, t + h, vB)) { h1 = h; break; }
        ctrlB.n++; if (h1) ctrlB.raak++;
      }
    }
  }
  const raak = gevallen.filter(g => g.lag), base = ctrl.n ? ctrl.raak / ctrl.n : 0, gem = gevallen.length ? raak.length / gevallen.length : 0;
  const helft = gevallen.length ? kwart(gevallen.map(g => g.t), 0.5) : 0, oud = gevallen.filter(g => g.t < helft), nieuw = gevallen.filter(g => g.t >= helft);
  // kanstabel: al d maanden na het begin zonder NL-stijging → kans dat NL nog volgt binnen de 6 maanden na het begin
  const tabel = {};
  for (let dd = 0; dd <= 3; dd++) for (const vak of ['1,5-2x', '2-3x', '3x+', 'alle']) {
    const g = gevallen.filter(x => (vak === 'alle' || sterkVak(x.r) === vak) && !(x.lag && x.lag <= dd)), h = g.filter(x => x.lag > dd);
    const gemD = (() => { const a = gevallen.filter(x => !(x.lag && x.lag <= dd)); return a.length ? a.filter(x => x.lag > dd).length / a.length : gem; })();
    tabel[`${dd}|${vak}`] = { n: g.length, raak: h.length, kans: Math.round((1000 * (h.length + PRIOR * gemD)) / (g.length + PRIOR)) / 10, lag: kwart(h.map(x => x.lag), 0.5) };
  }
  return {
    gevallen: gevallen.length, raak: pct(raak.length, gevallen.length), toeval: pct(ctrl.raak, ctrl.n), toevalN: ctrl.n,
    lift: base ? +(gem / base).toFixed(1) : null, vertraging: kwart(raak.map(g => g.lag), 0.5), vertragingVan: kwart(raak.map(g => g.lag), 0.25), vertragingTot: kwart(raak.map(g => g.lag), 0.75),
    perVertraging: Object.fromEntries([1, 2, 3, 4, 5, 6].map(h => [h, raak.filter(g => g.lag === h).length])),
    oud: { n: oud.length, raak: pct(oud.filter(g => g.lag).length, oud.length), tot: ymOf(helft) }, nieuw: { n: nieuw.length, raak: pct(nieuw.filter(g => g.lag).length, nieuw.length) },
    omgekeerd: { gevallen: omg.n, raak: pct(omg.raak, omg.n), toeval: pct(ctrlB.raak, ctrlB.n), lift: ctrlB.n && ctrlB.raak && omg.n ? +((omg.raak / omg.n) / (ctrlB.raak / ctrlB.n)).toFixed(1) : null },
    tabel,
  };
}

// Een doelland doorrekenen: koppelen, terugtoets per bronland, live lijst.
export async function overslagLand(store, cc = 'NL', { ser = null } = {}) {
  const bronnen = DOEL[cc]; if (!bronnen) return { cc, skip: 'geen doelland (alleen NL; BE heeft geen kijklijst)' };
  const t0 = Date.now(), raws = {};
  for (const x of [cc, ...bronnen]) raws[x] = (ser && ser[x]) || (await getJSON(store, `early/series-${x}.json`, null).catch(() => null));
  if (!raws[cc] || !raws[cc].month) return { cc, skip: 'geen kijklijst' };
  const L0 = idxOf(raws[cc].month), doel = index(raws[cc], cc, L0), out = { cc, versie: VERSIE, month: raws[cc].month, termen: doel.size, bron: {}, items: [] };
  const live = new Map();
  for (const b of bronnen) {
    if (!raws[b] || !raws[b].month) { out.bron[b] = { skip: 'geen kijklijst' }; continue; }
    const LB = Math.min(L0, idxOf(raws[b].month)), bron = index(raws[b], b, LB), taal = b === 'DE' ? 'DE' : 'EN';
    const paren = koppel(bron, doel, taal), T = terugtoets(paren, LB, VLOER[b], VLOER[cc]);
    out.bron[b] = { month: raws[b].month, termen: bron.size, koppelingen: paren.length, gelijk: paren.filter(p => p.soort === 'gelijk').length, vertaald: paren.filter(p => p.soort === 'vertaald').length, ...T };
    // live: bron stijgt nu (begin hooguit 3 maanden terug), NL de maanden sinds het begin niet
    for (const p of paren) {
      const A = p.s.a, B = p.d.a; if (!stijgtIdx(A, LB, VLOER[b])) continue;
      let begin = LB; while (begin > LB - 3 && stijgtIdx(A, begin - 1, VLOER[b])) begin--; if (stijgtIdx(A, begin - 1, VLOER[b])) continue; // al langer dan 4 maanden: oud nieuws
      let nlAl = false; for (let i = begin - 3; i <= L0; i++) if (stijgtIdx(B, i, VLOER[cc])) nlAl = true; if (nlAl) continue;
      if (piek(A, begin)) continue; // losse piek, geen trend (zelfde regel als in de terugtoets)
      const dd = LB - begin, r = sterkte(A, begin), vak = T.tabel[`${dd}|${sterkVak(r)}`], alle = T.tabel[`${dd}|alle`];
      const genoeg = T.gevallen >= MIN_GEVALLEN, kans = !genoeg ? null : vak && vak.n >= 10 ? vak.kans : alle.kans, lag = (vak && vak.n >= 10 && vak.lag) || alle.lag || T.vertraging || 3;
      const verwacht = ymOf(Math.max(L0 + 1, begin + lag)), nlNu = ok(B[L0]) ? Math.round(B[L0]) : null, nl12 = ok(B[L0 - 12]) ? Math.round(B[L0 - 12]) : null;
      const it = { k: p.d.k, bron: b, bronterm: p.s.k, koppeling: p.soort, sinds: ymOf(begin), bronGroei: +sterkte(A, LB).toFixed(1), bronNu: Math.round(A[LB]),
        nlNu, nlVorigJaar: nl12, kans, toeval: T.toeval, verwacht };
      const had = live.get(it.k); if (!had || (it.kans ?? -1) > (had.kans ?? -1)) live.set(it.k, { ...it, ook: had ? [...(had.ook || []), had.bron] : undefined }); else had.ook = [...(had.ook || []), b];
    }
  }
  out.items = [...live.values()].sort((p, q) => (q.kans ?? -1) - (p.kans ?? -1) || q.bronGroei - p.bronGroei).slice(0, 200);
  out.ms = Date.now() - t0; out.at = new Date().toISOString(); out.day = out.at.slice(0, 10);
  return out;
}

// Vanuit /api/loop: één keer per dag (gratis). De sterkste tips gaan als soort 'overslag' in het voorspellingsboek.
export async function overslagRonde(store, { cc = 'NL', force = false } = {}) {
  const cur = await getJSON(store, OUT(cc), null).catch(() => null), day = new Date().toISOString().slice(0, 10);
  if (!force && cur && cur.day === day && cur.versie === VERSIE) return { overslag: 'up to date' };
  const r = await overslagLand(store, cc); if (r.skip) return { overslag: r.skip };
  await putJSON(store, OUT(cc), r);
  // alleen tips die duidelijk boven toeval zitten (≥ 1,5× het toevalsniveau van hun bronland)
  const tips = r.items.filter(x => x.kans != null && x.toeval != null && x.kans >= 1.5 * x.toeval).slice(0, 40);
  const rec = await recordPredictions(store, tips.map(x => ({ kind: 'overslag', cc, k: x.k, now: r.month, target: x.verwacht, p: x.kans, src: x.bron, v: VERSIE })))
    .catch(e => ({ error: String(e.message || e).slice(0, 80) }));
  return { overslag: cc, ms: r.ms, items: r.items.length, ledger: rec, bron: Object.fromEntries(Object.entries(r.bron).map(([b, x]) => [b, { koppelingen: x.koppelingen, gevallen: x.gevallen, raak: x.raak, toeval: x.toeval }])) };
}

// Leesbaar (publiek): geen bedragen of sleutels. Zonder de kanstabel (alleen intern).
export function overslagView(cur, n = 50) {
  if (!cur) return { ready: false, reden: 'nog niet doorgerekend (uurronde, of /api/early?overslag=1&run=1)' };
  const bron = Object.fromEntries(Object.entries(cur.bron || {}).map(([b, x]) => { const { tabel, ...rest } = x; return [b, rest]; }));
  return { ready: true, cc: cur.cc, month: cur.month, at: cur.at, termen: cur.termen,
    meetlat: 'stijging = 3 maanden op rij boven dezelfde maand vorig jaar, samen ≥ 1,5× (en gemiddeld ≥ 50 per maand in NL, ≥ 100 in het bronland); volgen = NL haalt dat binnen 6 maanden na het begin in het bronland',
    bron, items: (cur.items || []).slice(0, n) };
}
export async function loadOverslag(store, cc = 'NL') { return store ? getJSON(store, OUT(cc), null).catch(() => null) : null; }

export function overslagTekst(v) {
  if (!v.ready) return `OVERSLAG — ${v.reden}`;
  const L = [`OVERSLAG naar ${v.cc} — data t/m ${v.month}, doorgerekend ${String(v.at).slice(0, 16).replace('T', ' ')} UTC, ${v.termen} termen op de NL-kijklijst`, v.meetlat, ''];
  for (const [b, x] of Object.entries(v.bron)) {
    if (x.skip) { L.push(`${b} → ${v.cc}: ${x.skip}`); continue; }
    if (x.gevallen < MIN_GEVALLEN) { L.push(`${b} → ${v.cc}: ${x.koppelingen} koppelingen (${x.gelijk} gelijk, ${x.vertaald} vertaald) · ${x.gevallen} gevallen: te weinig voor een betrouwbare uitspraak (minstens ${MIN_GEVALLEN}), geen kans`); continue; }
    L.push(`${b} → ${v.cc}: ${x.koppelingen} koppelingen (${x.gelijk} gelijk, ${x.vertaald} vertaald) · ${x.gevallen} gevallen · ${x.raak}% volgde (toeval ${x.toeval}%, ${x.lift ?? '?'}×) · vertraging mediaan ${x.vertraging ?? '?'} mnd (${x.vertragingVan ?? '?'}-${x.vertragingTot ?? '?'})`);
    L.push(`   oud (t/m ${x.oud.tot}) ${x.oud.raak}% op ${x.oud.n} · nieuw ${x.nieuw.raak}% op ${x.nieuw.n} · omgekeerd (${v.cc} eerst) ${x.omgekeerd.raak}% volgde (toeval ${x.omgekeerd.toeval}%, ${x.omgekeerd.lift ?? '?'}×; even groot = gezamenlijke oorzaak)`);
  }
  L.push('', `VOORSPELLIJST (${v.items.length})`);
  v.items.forEach((x, i) => L.push(`${i + 1}. ${x.k}: ${x.kans == null ? 'kans onbekend' : x.kans + '% kans'}, verwacht ${x.verwacht} · ${x.bron}${x.ook ? '+' + x.ook.join('+') : ''} "${x.bronterm}" ${x.bronGroei}× sinds ${x.sinds} (${x.bronNu}/mnd) · NL nu ${x.nlNu}${x.nlVorigJaar != null ? ` (vorig jaar ${x.nlVorigJaar})` : ''}${x.koppeling === 'vertaald' ? ' · vertaald' : ''}`));
  return L.join('\n');
}
