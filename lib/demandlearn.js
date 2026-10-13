// Het geheugen van de radar: elke dag bijleren.
// 1) Onthouden wat er opkwam (eerst gezien, hoeveel dagen op rij).
// 2) Nakijken: zette wat gisteren bovenaan stond vandaag door? Dat geeft per categorie en per bron een trefkans,
//    en die trefkans weegt mee in de rangorde van morgen.
// 3) Ruis leren: woorden die steeds als "geen koopvraag" worden afgekeurd, worden voortaan meteen weggefilterd.
// 4) Hergebruiken: zoektermen voor komende momenten en de hitlijsten van gisteren (wat is nieuw).
import { getJSON, putJSON } from './store.js';

const PATH = 'demand/memory.json';
const STOP = new Set('kopen kaufen buy best beste price prijs preis online near voor für for with met mit and und the een der die das het van von from'.split(' '));

export function freshMemory() {
  return { v: 1, since: null, days: 0, lastDay: null, lastGraded: null, topics: {}, picks: {}, score: { cat: {}, src: {} }, noise: {}, terms: {}, charts: {}, log: [] };
}
export async function loadMemory(store) {
  if (!store) return freshMemory();
  const m = await getJSON(store, PATH, null).catch(() => null);
  return m && m.v === 1 ? { ...freshMemory(), ...m } : freshMemory();
}
export async function saveMemory(store, mem) { if (store) await putJSON(store, PATH, mem); }

const rate = s => (s ? (s.hit + 2) / (s.hit + s.miss + 4) : 0.5); // voorzichtig gemiddelde: begint op 50%
// Gewicht 0,6 .. 1,4 per categorie en per bron; zonder gegevens precies 1.
export function weight(mem, cat, srcs) {
  const w = s => 0.6 + 0.8 * rate(s);
  const sv = (srcs || []).map(s => w(mem.score.src[s]));
  return Math.round(w(mem.score.cat[cat]) * (sv.length ? Math.max(...sv) : 1) * 100) / 100;
}

// nowBy: Map "CC|naam" → status van vandaag ('rising' | 'steady' | 'fading' | 'gone' | 'quiet').
export function grade(mem, nowBy, today) {
  if (mem.lastGraded === today) return null;
  let checked = 0, hits = 0;
  for (const [cc, picks] of Object.entries(mem.picks || {})) {
    for (const p of picks) {
      if (p.day === today) continue;
      const st = nowBy.get(`${cc}|${p.name}`);
      if (!st || st === 'quiet') continue;
      const hit = st === 'rising' || st === 'steady';
      checked++; if (hit) hits++;
      const bump = (o, k) => { o[k] = o[k] || { hit: 0, miss: 0 }; o[k][hit ? 'hit' : 'miss']++; };
      bump(mem.score.cat, p.cat);
      for (const s of p.srcs || []) bump(mem.score.src, s);
    }
  }
  mem.lastGraded = today;
  return { checked, hits };
}

// Wat er vandaag bovenaan staat en nog stijgt: dat wordt morgen nagekeken.
export function setPicks(mem, items, today) {
  const by = {};
  for (const it of [...items].sort((a, b) => b.score - a.score)) {
    if (!it.now || !['rising', 'steady'].includes(it.now.status)) continue;
    (by[it.cc] = by[it.cc] || []);
    if (by[it.cc].length < 15) by[it.cc].push({ name: it.name, cat: it.cat, srcs: it.srcs, day: today });
  }
  mem.picks = by;
}

export function remember(mem, items, today) {
  for (const it of items) {
    const key = `${it.cc}|${it.topic || it.name}`;
    const t = mem.topics[key] || (mem.topics[key] = { first: today, seen: 0, last: null });
    if (t.last !== today) { t.seen++; t.last = today; }
    t.cat = it.cat;
    it.firstSeen = t.first; it.seen = t.seen; it.fresh = t.first === today && mem.days > 0;
  }
  const cutoff = new Date(Date.parse(today) - 60 * 864e5).toISOString().slice(0, 10);
  for (const [k, t] of Object.entries(mem.topics)) if (t.last < cutoff) delete mem.topics[k];
}

const toks = s => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w));
export function learnNoise(mem, dropped, kept) {
  for (const n of dropped) for (const w of new Set(toks(n))) mem.noise[w] = (mem.noise[w] || 0) + 1;
  for (const n of kept) for (const w of new Set(toks(n))) if (mem.noise[w] != null) mem.noise[w] -= 3;
  for (const [w, c] of Object.entries(mem.noise)) if (c <= -6) delete mem.noise[w];
  const keys = Object.keys(mem.noise);
  if (keys.length > 3000) for (const w of keys.sort((a, b) => mem.noise[a] - mem.noise[b]).slice(0, keys.length - 3000)) delete mem.noise[w];
}
export const noiseSet = mem => new Set(Object.entries(mem.noise || {}).filter(([, c]) => c >= 4).map(([w]) => w));
export const isLearnedNoise = (set, k) => toks(k).some(w => set.has(w));

// Hitlijsten: wat staat er vandaag in dat er gisteren niet in stond?
export function chartNews(mem, key, titles, today) {
  const s0 = mem.charts[key];
  const prev = !s0 ? [] : s0.day === today ? s0.prev || [] : s0.titles || [];
  mem.charts[key] = { day: today, titles, prev };
  const set = new Set(prev);
  return titles.map(t => ({ t, isNew: set.size > 0 && !set.has(t) }));
}

export function closeDay(mem, today, stats) {
  if (!mem.since) mem.since = today;
  if (mem.lastDay !== today) { mem.days++; mem.lastDay = today; }
  mem.log = [...(mem.log || []).filter(l => l.day !== today), { day: today, ...stats }].slice(-90);
}

export function learningSummary(mem) {
  const tot = Object.values(mem.score.cat).reduce((a, s) => ({ hit: a.hit + s.hit, miss: a.miss + s.miss }), { hit: 0, miss: 0 });
  const last = (mem.log || []).filter(l => l.graded && l.graded.checked).slice(-1)[0];
  return {
    day: mem.days, since: mem.since, tracked: Object.keys(mem.topics).length,
    hitRate: tot.hit + tot.miss ? Math.round((tot.hit / (tot.hit + tot.miss)) * 100) : null, checked: tot.hit + tot.miss,
    yesterday: last ? { checked: last.graded.checked, hits: last.graded.hits } : null,
    noiseWords: noiseSet(mem).size,
    catRate: Object.fromEntries(Object.entries(mem.score.cat).map(([k, s]) => [k, Math.round(rate(s) * 100)])),
  };
}
