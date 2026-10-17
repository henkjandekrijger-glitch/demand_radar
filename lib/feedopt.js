// Producttitels voor Google Shopping met de zoektermen die echt gezocht worden (en minder concurrentie hebben dan de grote termen).
// Per product, in stappen die elk uur verder gaan (vanuit /api/loop), tot alles klaar is:
//  1. AI (haiku) bedenkt 3 Nederlandse zoekopdrachten die een koper van dit product typt;
//  2. DataForSEO geeft per zoekopdracht volume en concurrentie (± $0,075 per 1.000);
//  3. de beste "slimme positie" (veel volume, minder concurrentie) komt vooraan in een nieuwe titel (AI, max 150 tekens, geen reclametaal).
// Uitkomst: feed/<shop>-titles-<cc>.json { id: titel } (de feed gebruikt die vanzelf) en feed/<shop>-opt-<cc>.json (onderbouwing).
import { getJSON, putJSON } from './store.js';
import { ask, parseJSON } from './ai.js';

const MODEL = () => process.env.FEED_MODEL || 'anthropic/claude-haiku-5.5';
const LANG = { NL: 'Dutch', DE: 'German', US: 'English', BE: 'Dutch' };

// "Slimme positie": volume telt, maar zware concurrentie (competition 0-100) halveert de waarde.
export const smart = (v, c) => (v || 0) * (1 - 0.5 * Math.min(100, c || 0) / 100);
export function bestPhrase(phrases, vol) {
  return phrases.map(p => ({ p, v: (vol[p] && vol[p].v) || 0, c: (vol[p] && vol[p].c) || 0 })).filter(x => x.v > 0).sort((a, b) => smart(b.v, b.c) - smart(a.v, a.c))[0] || null;
}

async function phrasesFor(items, cc, token) {
  const prompt = `For each product sold in an online shop in ${cc}, give 3 short ${LANG[cc]} Google searches (2-4 words, lowercase) that a buyer who wants exactly this kind of product would type. Generic product words, no shop names; include the brand only if it is a well-known brand people search for.
Products (id | title | brand | category):
${items.map(x => `${x.id} | ${x.title} | ${x.brand} | ${x.cat}/${x.sub}`).join('\n')}
Return JSON: {"p": {"<id>": ["search 1", "search 2", "search 3"]}}`;
  const j = parseJSON(await ask({ prompt, system: 'You are an e-commerce search expert. Answer with JSON only.', maxTokens: 3500, token, model: MODEL() }));
  return (j && j.p) || {};
}

async function titlesFor(items, cc, token) {
  const prompt = `Write a Google Shopping product title in ${LANG[cc]} for each product. Rules: start with the given search phrase (natural word order, capitalised first letter), then the most important distinguishing details from the original title (material, size, colour, type), then the brand if it adds trust; max 150 characters; no promotional words (no "beste", "goedkoop", "gratis", "sale"), no capitals-only words, no emojis; keep facts from the original title, invent nothing.
Products (id | search phrase | original title | brand):
${items.map(x => `${x.id} | ${x.phrase} | ${x.title} | ${x.brand}`).join('\n')}
Return JSON: {"t": {"<id>": "title"}}`;
  const j = parseJSON(await ask({ prompt, system: 'You write accurate, policy-compliant Google Shopping titles. Answer with JSON only.', maxTokens: 4000, token, model: MODEL() }));
  return (j && j.t) || {};
}

// Eén stap per aanroep (elk uur): max `per` producten voor AI-stappen, volumes als de dagrem het toelaat.
export async function feedTitles(store, shop = 'yoors', cc = 'NL', { token, per = 200, batch = 40 } = {}) {
  const items = (await getJSON(store, `feed/${shop}-items-${cc}.json`, null).catch(() => null)) || [];
  if (!items.length) return { wait: 'no feed yet' };
  const O = `feed/${shop}-opt-${cc}.json`, T = `feed/${shop}-titles-${cc}.json`;
  const st = (await getJSON(store, O, null).catch(() => null)) || { phrases: {}, vol: {}, pick: {} };
  const titles = (await getJSON(store, T, null).catch(() => null)) || {};
  const out = { phrases: 0, volumes: 0, titles: 0 };
  const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  // 1. zoekopdrachten bedenken
  const need = items.filter(x => !st.phrases[x.id]).slice(0, per);
  if (need.length && token) {
    const res = await Promise.all(chunks(need, batch).map(c => phrasesFor(c, cc, token).catch(() => ({}))));
    for (const r of res) for (const [id, ps] of Object.entries(r)) if (Array.isArray(ps)) { st.phrases[id] = ps.map(p => String(p).toLowerCase().trim()).filter(p => p.length > 2 && p.length < 60).slice(0, 3); out.phrases++; }
  }
  // 2. volumes (alleen zoekopdrachten die we nog niet kennen)
  const { searchVolume, budget, dfsReady, underCap } = await import('./dfs.js'), { COUNTRIES } = await import('./niches.js');
  const unknown = [...new Set(Object.values(st.phrases).flat())].filter(p => !st.vol[p]);
  if (unknown.length && dfsReady() && COUNTRIES[cc] && (await underCap(0.5))) {
    const b = budget(0.3);
    for (const part of chunks(unknown, 1000).slice(0, 3)) {
      const v = await searchVolume(part, COUNTRIES[cc], b, { months: 12 }).catch(() => ({}));
      for (const p of part) { const x = v[p]; st.vol[p] = { v: x ? x.volume || 0 : 0, c: x ? x.competition ?? 0 : 0 }; out.volumes++; }
    }
  }
  // 3. titels schrijven voor producten met een gekozen zoekterm
  const ready = items.filter(x => !titles[x.id] && st.phrases[x.id] && st.phrases[x.id].every(p => st.vol[p])).slice(0, per);
  const todo = ready.map(x => { const b = bestPhrase(st.phrases[x.id], st.vol); st.pick[x.id] = b; return b ? { ...x, phrase: b.p } : null; }).filter(Boolean);
  for (const x of ready) if (!st.pick[x.id]) titles[x.id] = x.title; // geen zoekterm met volume: originele titel houden
  if (todo.length && token) {
    const res = await Promise.all(chunks(todo, batch).map(c => titlesFor(c, cc, token).catch(() => ({}))));
    for (const r of res) for (const [id, t] of Object.entries(r)) { const s = String(t || '').replace(/\s+/g, ' ').trim(); if (s.length >= 10 && s.length <= 150) { titles[id] = s; out.titles++; } }
  }
  await putJSON(store, O, st); await putJSON(store, T, titles);
  return { ...out, done: Object.keys(titles).length, of: items.length };
}
