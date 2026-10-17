// Wildcards: gedurfde voorspellingen die het model (nog) niet kan toetsen. Elk met hoe zeker, wanneer we nakijken
// en een VOORAF vastgelegde meetlat, zodat het trackrecord eerlijk is (achteraf niets bijstellen).
// Automatisch nakijken: de zoektermen staan op de kijklijst van de vroege signalen (gratis, maandelijks ververst).
// Dagdata uit Google Trends (bv. p3, p4) kijken we met de hand na: /api/early?op=wild&id=p3&status=hit&note=…&key=…
// Ook de lijst vroege signalen zelf wordt gevolgd: per maand een momentopname, en na 6 maanden geteld hoeveel doorbraken.
import { getJSON, putJSON } from './store.js';
import { brokeOut, MINV, EARLY } from './early.js';

// tests: { cc, k, month, min | max | yoy (× dezelfde maand vorig jaar) | vs + times (× andere zoekterm) }
export const WILD = [
  { id: 'p1', made: '2026-10-16', title: 'Germany switches to electric heating', ccs: ['DE'], sure: 'medium',
    claim: 'The energy shock pushes Germans from oil and gas to electric heat: searches for a portable split air conditioner that also heats keep doubling into winter.',
    basis: 'Heating oil 6×, Midea PortaSplit 6× on last year, electric cars 2.7×. On Amazon Germany the PortaSplit is searched more than the PS5.',
    why: 'Air conditioners as winter heaters never happened before, so the model has no history for it.',
    tests: [{ cc: 'DE', k: 'midea portasplit', month: '2026-11', yoy: 2 }, { cc: 'DE', k: 'midea portasplit', month: '2026-12', yoy: 2 }] },
  { id: 'p2', made: '2026-10-17', title: 'Açaí bowls cross from Germany to the Netherlands', ccs: ['NL'], sure: 'tested', odds: 'about 1 in 4',
    claim: 'Germany went 9× in a year while the Netherlands stayed flat. If the usual pattern holds, Dutch searches double within three months.',
    basis: 'Germany 368K searches in September, higher every month since March, in every big city. Netherlands 14.8K, same as last year.',
    why: 'When a German trend this size appeared, the Netherlands followed within 3 months about 1 in 4 times.',
    tests: [{ cc: 'NL', k: 'acai bowl', month: '2026-12', yoy: 2 }] },
  { id: 'p3', made: '2026-10-17', title: 'The clock beats Halloween', ccs: ['NL', 'DE'], sure: 'strong', due: '2026-10-25', manual: true,
    claim: 'On Saturday 24 October the Dutch and Germans search more for the clock change (wintertijd, Zeitumstellung) than for Halloween, then it drops over 90% within 3 days.',
    basis: 'Daily Google data of 2025: Netherlands 51 vs 37, Germany 34 vs 19 on the Saturday before the change.',
    why: 'Daily data; checked by hand in Google Trends.' },
  { id: 'p4', made: '2026-10-17', title: 'Walibi beats the Efteling in the autumn holiday', ccs: ['NL'], sure: 'medium', due: '2026-11-05', manual: true,
    claim: 'From 17 October Walibi is searched more than the Efteling, Sunday even more. After 1 November Walibi drops below the Efteling within days.',
    basis: 'Autumn holiday starts in the middle and south, with Halloween nights at Walibi. Its previous top was 11 October.',
    why: 'Daily data; checked by hand in Google Trends.' },
  { id: 'p5', made: '2026-10-17', title: 'Searching turns into asking', ccs: ['NL', 'DE'], sure: 'strong',
    claim: 'People type questions as if they talk to an AI. "Where to buy" grew 45× in the US; the Netherlands and Germany follow and peak around Black Friday.',
    basis: 'US "where to buy" 40K to 1.83M. Netherlands "waar te koop" 1.9K to 14.8K (7.8×, speeding up). Germany "wo kaufen" 0.9K to 5.4K.',
    why: 'The signal is strong, the cause is a guess: words about stock stay flat in Europe, so it looks like AI-style searching.',
    tests: [{ cc: 'NL', k: 'waar te koop', month: '2026-11', min: 25000 }, { cc: 'DE', k: 'wo kaufen', month: '2026-11', min: 10000 }] },
  { id: 'p6', made: '2026-10-17', title: 'A shortage Christmas in the US', ccs: ['US'], sure: 'medium',
    claim: 'Americans search for "out of stock" more than ever, rising to a record in December.',
    basis: 'Flat at 3.6K to 5.4K for 4 years, even in the 2022 shortages. Since June: 6.6K, 9.9K, 9.9K, 12.1K. "Is it in stock" 66×. Not seen in the Netherlands or Germany.',
    why: 'Could also be the new question-style searching instead of real shortages.',
    tests: [{ cc: 'US', k: 'out of stock', month: '2026-10', min: 12000 }, { cc: 'US', k: 'out of stock', month: '2026-12', min: 20000 }] },
  { id: 'p7', made: '2026-10-17', title: 'Plug-in batteries beat Tesla', ccs: ['NL'], sure: 'strong',
    claim: 'Anker SOLIX keeps growing toward the end of net metering on 1 January 2027 and is searched 10× more than Tesla Powerwall in December.',
    basis: 'Anker SOLIX 1.0K (Sep 2024), 4.4K, 18.1K (Sep 2026). Tesla Powerwall flat at 1.3K to 1.9K. AI assistants recommend Anker, EcoFlow, Marstek and Zendure, never Tesla.',
    why: 'The deadline is not in the search data, so if anything the model is too low.',
    tests: [{ cc: 'NL', k: 'anker solix', month: '2026-11', min: 20000 }, { cc: 'NL', k: 'anker solix', month: '2026-12', vs: 'tesla powerwall', times: 10 }] },
  { id: 'p8', made: '2026-10-17', title: 'Temu and Shein lose Black Friday in Europe', ccs: ['NL', 'DE'], sure: 'medium',
    claim: 'Since the EU €3 duty per parcel (1 July 2026) Temu and Shein dropped. In November they stay far below last year.',
    basis: 'A step down exactly in July: Netherlands Temu 820K to 550K, Shein 820K to 450K; Germany Temu 2.74M to 1.83M. bol and Amazon flat. November 2025: Netherlands Temu 1.0M, Shein 823K; Germany Temu 4.09M.',
    why: 'Direction is clear, size is not: a big Black Friday campaign could pull them back.',
    tests: [{ cc: 'NL', k: 'temu', month: '2026-11', max: 750000 }, { cc: 'NL', k: 'shein', month: '2026-11', max: 600000 }, { cc: 'DE', k: 'temu', month: '2026-11', max: 2500000 }] },
  { id: 'w1', made: '2026-10-17', title: 'Black Friday starts earlier than ever', ccs: ['NL', 'DE'], sure: 'medium',
    claim: '"Black friday deals" already took off in September. In October it is at least 3× last October in both countries.',
    basis: 'September: Netherlands 6.6K (last year 1K), Germany 18.1K (1K).',
    why: 'One early month can be a quirk of how Google groups searches.',
    tests: [{ cc: 'NL', k: 'black friday deals', month: '2026-10', yoy: 3 }, { cc: 'DE', k: 'black friday deals', month: '2026-10', yoy: 3 }] },
  { id: 'w2', made: '2026-10-17', title: 'Glass air fryers are the kitchen hit of the holidays', ccs: ['NL'], sure: 'weak',
    claim: 'Dutch searches for glass air fryers keep climbing to at least 2.5× last December.',
    basis: '"Glazen airfryer" 590 (Sep 2025) to 2,400 (Sep 2026), 4×. "Airfryer glas" 3×.',
    why: 'Still small numbers, where noise is large.',
    tests: [{ cc: 'NL', k: 'glazen airfryer', month: '2026-12', yoy: 2.5 }] },
];

// Getoetst en verworpen: laat zien dat we ook ideeën weggooien.
export const DROPPED = [
  { id: 'x1', made: '2026-10-17', title: 'German power prices drive searches for power tariffs', ccs: ['DE'],
    claim: 'Wholesale power rose from 105 to 163 €/MWh since July, so we expected searches for "strompreis" to follow.',
    result: 'Tested on 34 months: no link (correlation about 0). An earlier 0.67 came from incomplete price data.' },
  { id: 'x2', made: '2026-10-17', title: '"Shop apothekenvergleich" up 13×', ccs: ['DE'],
    claim: 'Looked like a breakout in Germany.',
    result: 'Google had regrouped the search: "shop apotheke" fell by the same amount. Since then we always compare sibling searches first.' },
];

const STATE = 'wild/state.json', VERDICTS = 'wild/verdicts.json', SNAP = m => `wild/early-${m}.json`, CCS = ['NL', 'DE', 'US'];
const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const lastYear = month => `${+month.slice(0, 4) - 1}${month.slice(4)}`;
const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
function val(kw, k, month) {
  const s = kw[k] || kw[fold(k)]; if (!s || !s.m) return undefined;
  const r = s.m.find(r => ym(r[0], r[1]) === month); return r ? r[2] : undefined;
}

// Eén meetlat tegen de maanddata: waiting / pass / fail (met de gemeten cijfers).
export function judge(t, kw) {
  const v = val(kw, t.k, t.month); if (v == null) return { state: 'waiting' };
  let ref, ok;
  if (t.yoy) { ref = val(kw, t.k, lastYear(t.month)); if (ref == null) return { state: 'waiting' }; ok = v >= t.yoy * Math.max(ref, 10); }
  else if (t.vs) { ref = val(kw, t.vs, t.month); if (ref == null) return { state: 'waiting' }; ok = v >= t.times * Math.max(ref, 10); }
  else ok = (t.min == null || v >= t.min) && (t.max == null || v <= t.max);
  return ref == null ? { state: ok ? 'pass' : 'fail', value: v } : { state: ok ? 'pass' : 'fail', value: v, ref };
}
export function verdict(tests) {
  if (!tests.length) return 'open';
  const done = tests.filter(t => t.state !== 'waiting'), pass = done.filter(t => t.state === 'pass').length;
  if (!done.length) return 'open';
  if (done.length < tests.length) return 'checking';
  return pass === tests.length ? 'hit' : pass ? 'partly' : 'miss';
}
// Nakijkdatum: Google geeft een maand rond de 15e van de maand erna vrij.
function dueOf(tests) {
  const m = tests.reduce((a, t) => (t.month > a ? t.month : a), ''); if (!m) return null;
  const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 15)); return d.toISOString().slice(0, 10);
}

// Lijst vroege signalen volgen: hoeveel braken er binnen 6 maanden echt door?
export function trackEarly(snap, ser) {
  const out = { month: snap.month, hidden: { n: 0, broke: 0 }, starting: { n: 0, broke: 0 }, seen: 0, broke: [] };
  for (const x of snap.items || []) {
    const t = x.tier === 'starting' ? 'starting' : 'hidden'; out[t].n++;
    const s = ser[x.cc] && ser[x.cc].kw && ser[x.cc].kw[x.k]; if (!s || !s.m) continue;
    const rows = s.m.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), y = rows.map(r => +r[2] || 0);
    const i0 = rows.findIndex(r => ym(r[0], r[1]) === snap.month); if (i0 < 0) continue;
    const f = brokeOut(y, MINV[x.cc] || 500), end = Math.min(i0 + 6, y.length - 1);
    out.seen = Math.max(out.seen, end - i0);
    for (let i = i0 + 1; i <= end; i++) if (f[i]) { out[t].broke++; out.broke.push({ cc: x.cc, k: x.k, tier: t, month: ym(rows[i][0], rows[i][1]) }); break; }
  }
  return out;
}

// Dagelijks (gratis) vanuit /api/loop: zoektermen op de kijklijst, meetlatten nakijken, vroege lijst vastleggen en volgen.
export async function dailyWild(store, now = new Date()) {
  const st = (await getJSON(store, STATE, null).catch(() => null)) || {};
  if (st.day === now.toISOString().slice(0, 10)) return { wild: 'up to date' };
  return checkWild(store, now);
}
export async function checkWild(store, now = new Date()) {
  const st = (await getJSON(store, STATE, null).catch(() => null)) || {};
  const { queueEarlyTerms } = await import('./earlydata.js'), by = {};
  for (const w of WILD) for (const t of w.tests || []) (by[t.cc] = by[t.cc] || []).push(t.k, ...(t.vs ? [t.vs] : []));
  let queued = 0; for (const [cc, ks] of Object.entries(by)) queued += await queueEarlyTerms(store, cc, ks).catch(() => 0);
  const ser = {}; for (const cc of CCS) ser[cc] = (await getJSON(store, `early/series-${cc}.json`, null).catch(() => null)) || { kw: {} };
  const results = {}; for (const w of WILD) if (w.tests) results[w.id] = w.tests.map(t => judge(t, ser[t.cc].kw));
  // momentopname van de lijst vroege signalen, één per datamaand
  const snaps = st.snaps || [], L = await getJSON(store, 'early/latest.json', null).catch(() => null);
  if (L && L.month && L.items && L.items.length && !snaps.includes(L.month)) {
    await putJSON(store, SNAP(L.month), { month: L.month, day: L.day, items: L.items.map(x => ({ cc: x.cc, k: x.k, tier: x.tier, chance: x.chance })) });
    snaps.push(L.month);
  }
  const tracks = [];
  for (const m of snaps) { const s = await getJSON(store, SNAP(m), null).catch(() => null); if (s) tracks.push(trackEarly(s, ser)); }
  await putJSON(store, STATE, { day: now.toISOString().slice(0, 10), at: now.toISOString(), queued, results, snaps, tracks });
  return { ok: true, queued, checked: Object.keys(results).length, tracks: tracks.length };
}

// Met de hand nakijken (eigenaar): status hit / partly / miss, of open om te wissen.
export async function setVerdict(store, id, status, note = '') {
  if (!WILD.some(w => w.id === id)) return { ok: false, error: 'unknown id', ids: WILD.map(w => w.id) };
  if (!['hit', 'partly', 'miss', 'open'].includes(status)) return { ok: false, error: 'status must be hit, partly, miss or open' };
  const v = (await getJSON(store, VERDICTS, null).catch(() => null)) || {};
  if (status === 'open') delete v[id]; else v[id] = { status, note: String(note || '').slice(0, 400), at: new Date().toISOString().slice(0, 10) };
  await putJSON(store, VERDICTS, v);
  return { ok: true, id, ...(v[id] || { status: 'open' }) };
}

// Voor de radar: alle voorspellingen met stand, plus het trackrecord.
export async function wildList(store) {
  const st = (store && (await getJSON(store, STATE, null).catch(() => null))) || {}, man = (store && (await getJSON(store, VERDICTS, null).catch(() => null))) || {};
  const items = WILD.map(w => {
    const tests = (w.tests || []).map((t, i) => ({ ...t, ...((st.results && st.results[w.id] && st.results[w.id][i]) || { state: 'waiting' }) }));
    const m = man[w.id];
    return { ...w, tests, status: m ? m.status : verdict(tests), note: m ? m.note : null, judged: m ? m.at : null, due: w.due || dueOf(tests) };
  });
  const T = EARLY && EARLY.test, rate = { hidden: (T && T.hidden && T.hidden.hit) || 17.8, starting: (T && T.starting && T.starting.hit) || 56.2 };
  const tracks = (st.tracks || []).map(t => ({ ...t, expect: { hidden: Math.round(t.hidden.n * rate.hidden / 100), starting: Math.round(t.starting.n * rate.starting / 100) }, rate }));
  const done = items.filter(x => ['hit', 'partly', 'miss'].includes(x.status)), c = s => done.filter(x => x.status === s).length;
  return { items, dropped: DROPPED.map(x => ({ ...x, status: 'dropped' })), tracks, at: st.at || null,
    record: { next: items.filter(x => !done.includes(x) && x.due).map(x => x.due).sort()[0] || null, made: items.length, checked: done.length, hit: c('hit'), partly: c('partly'), miss: c('miss'), open: items.length - done.length, dropped: DROPPED.length } };
}
