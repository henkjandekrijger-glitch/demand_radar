// Leren: de pagina en de dagmail testen elk een paar varianten tegen elkaar (A = controle, blijft altijd).
// Elke gebeurtenis is een piepklein bestandje; de uurronde (api/loop) telt ze op in learn/state.json en
// verdeelt de kansen opnieuw: gelijk tot elke variant genoeg metingen heeft, daarna 70% voor de beste.
// Een externe leerlus kan via /api/learn nieuwe uitdagers zetten (B, C, ...). Geen IP-adressen, geen mailadressen.
import { getJSON, putJSON } from './store.js';

export const STATE = 'learn/state.json';
const EVENTS = 'ev/';
export const MIN = { page: 300, mail: 200 };
export const WIN_SHARE = 0.7;
export const MAX_LOG = 60;

export const DEFAULTS = {
  page: {
    A: { h1: 'See demand rise before everyone else does.', lead: 'Demand Radar reads live search, Wikipedia and news data for the Netherlands, the United States, Germany and worldwide. It shows what spikes today, what is rising and what will rise next, with the timing to act on it.', cta: 'Check demand' },
    B: { h1: 'Know what will sell before it sells.', lead: 'Fourteen live sources, from Google searches to the weather forecast, tell you which products are taking off in the Netherlands, the US and Germany, and when to start.', cta: 'Check my idea' },
    C: { h1: 'Stop guessing which product to sell next.', lead: 'Check any idea, product or service against live demand data in seconds, down to your own city. See what spikes today and what will rise next.', cta: 'Show me the demand' },
  },
  mail: {
    A: 'Demand of the day: {top}',
    B: '{top} is rising {pct} — today\'s demand signals',
    C: 'What sells next: {top} and {n} more signals',
  },
};

// Gewicht van elke stap in de pagina-score: een check, een aanmelding, een klik op Pro.
const PAGE_W = { check: 1, sub: 4, pro: 8 };
export const pageScore = s => (s && s.view ? ((s.check || 0) * PAGE_W.check + (s.sub || 0) * PAGE_W.sub + (s.pro || 0) * PAGE_W.pro) / s.view : 0);
export const mailScore = s => (s && s.sent ? (s.click || 0) / s.sent : 0);

export function freshState() {
  return { page: { variants: { ...DEFAULTS.page }, stats: {}, weights: {} }, mail: { variants: { ...DEFAULTS.mail }, stats: {}, weights: {} }, topics: {}, log: [], updated: null };
}
export async function loadState(store) {
  const s = await getJSON(store, STATE, null);
  const st = s || freshState();
  for (const x of ['page', 'mail']) {
    st[x] = st[x] || { variants: {}, stats: {}, weights: {} };
    if (!st[x].variants.A) st[x].variants.A = DEFAULTS[x].A;
  }
  st.topics = st.topics || {}; st.log = st.log || [];
  for (const x of ['page', 'mail']) st[x].weights = weights(st, x);
  return st;
}

export function weights(st, x) {
  const ks = Object.keys(st[x].variants).sort();
  const trials = k => (st[x].stats[k] || {})[x === 'page' ? 'view' : 'sent'] || 0;
  if (ks.length < 2 || ks.some(k => trials(k) < MIN[x])) return Object.fromEntries(ks.map(k => [k, 1 / ks.length]));
  const score = x === 'page' ? pageScore : mailScore;
  const best = ks.reduce((a, b) => (score(st[x].stats[b]) > score(st[x].stats[a]) ? b : a));
  return Object.fromEntries(ks.map(k => [k, k === best ? WIN_SHARE : (1 - WIN_SHARE) / (ks.length - 1)]));
}

export function pick(w, r = Math.random()) {
  const ks = Object.keys(w).sort();
  for (const k of ks) { r -= w[k]; if (r < 0) return k; }
  return ks[0] || 'A';
}

const clean = (s, n = 24) => String(s || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, n) || '-';
const hour = (d = new Date()) => d.toISOString().slice(0, 13).replace(/[-T]/g, '');
// x = page|mail, k = view|check|sub|pro|open|click, v = variant, c = categorie (voor mail-kliks)
export async function record(store, { x, k, v, c }) {
  if (!store) return false;
  if (!['page', 'mail', 'radar'].includes(x) || !['view', 'check', 'sub', 'pro', 'open', 'click'].includes(k)) return false;
  await store.put(`${EVENTS}${hour()}/${x}.${k}.${clean(v, 2).toUpperCase()}.${clean(c)}.${Math.random().toString(36).slice(2, 10)}`, '1', 'text/plain');
  return true;
}

export function bump(st, x, v, k, n = 1) {
  st[x].stats[v] = st[x].stats[v] || {};
  st[x].stats[v][k] = (st[x].stats[v][k] || 0) + n;
}
export function bumpTopic(st, c, k, n = 1) {
  if (!c || c === '-') return;
  st.topics[c] = st.topics[c] || {};
  st.topics[c][k] = (st.topics[c][k] || 0) + n;
}

// De uurronde: gebeurtenissen optellen, opruimen, kansen opnieuw verdelen.
export async function runLoop(store, now = new Date()) {
  const st = await loadState(store);
  const cur = hour(now);
  const blobs = (await store.list(EVENTS)).filter(b => b.pathname.split('/')[1] < cur); // het lopende uur laten staan
  let n = 0;
  for (const b of blobs) {
    const [x, k, v, c] = b.pathname.split('/').pop().split('.');
    if (x === 'radar') { // radar: welke categorieën en onderwerpen bezoekers openen
      st.radar = st.radar || { view: 0, open: 0, cats: {} };
      if (k === 'view') st.radar.view++; else { st.radar.open++; st.radar.cats[c] = (st.radar.cats[c] || 0) + 1; }
      n++; continue;
    }
    if (!st[x]) continue;
    bump(st, x, v, k); n++;
    if (x === 'mail' && (k === 'click' || k === 'open')) bumpTopic(st, c, k);
  }
  for (const x of ['page', 'mail']) st[x].weights = weights(st, x);
  st.updated = now.toISOString();
  await putJSON(store, STATE, st); // eerst de stand, dan pas opruimen
  await store.del(blobs.map(b => b.url));
  return { counted: n, weights: { page: st.page.weights, mail: st.mail.weights } };
}

// Nieuwe uitdagers zetten (van de leerlus). A blijft altijd; een vervangen variant begint opnieuw te tellen.
export function applyChanges(st, body, now = new Date()) {
  const done = [];
  const txt = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);
  for (const [k, v] of Object.entries((body.page && body.page.variants) || {})) {
    if (k === 'A' || !/^[B-F]$/.test(k)) continue;
    if (v === null) { delete st.page.variants[k]; delete st.page.stats[k]; done.push(`page ${k} removed`); continue; }
    const nv = { h1: txt(v.h1, 90), lead: txt(v.lead, 320), cta: txt(v.cta, 28) };
    if (!nv.h1 || !nv.cta) continue;
    st.page.variants[k] = nv; delete st.page.stats[k]; done.push(`page ${k}: ${nv.h1}`);
  }
  for (const [k, v] of Object.entries((body.mail && body.mail.variants) || {})) {
    if (k === 'A' || !/^[B-F]$/.test(k)) continue;
    if (v === null) { delete st.mail.variants[k]; delete st.mail.stats[k]; done.push(`mail ${k} removed`); continue; }
    const subj = txt(v, 110);
    if (!subj) continue;
    st.mail.variants[k] = subj; delete st.mail.stats[k]; done.push(`mail ${k}: ${subj}`);
  }
  for (const x of ['page', 'mail']) st[x].weights = weights(st, x);
  if (done.length || body.note) st.log.unshift({ at: now.toISOString(), by: txt(body.by || 'leerlus', 40), note: txt(body.note, 400), done });
  st.log = st.log.slice(0, MAX_LOG);
  return done;
}

export function summary(st) {
  const row = (x, k) => { const s = st[x].stats[k] || {}; return { variant: k, text: st[x].variants[k], ...s, score: Math.round((x === 'page' ? pageScore(s) : mailScore(s)) * 10000) / 10000, share: Math.round((st[x].weights[k] || 0) * 100) }; };
  return {
    updated: st.updated, min: MIN, winShare: WIN_SHARE,
    page: Object.keys(st.page.variants).sort().map(k => row('page', k)),
    mail: Object.keys(st.mail.variants).sort().map(k => row('mail', k)),
    topics: Object.entries(st.topics).map(([c, s]) => ({ category: c, ...s })).sort((a, b) => (b.click || 0) - (a.click || 0)),
    log: st.log.slice(0, 20),
  };
}
