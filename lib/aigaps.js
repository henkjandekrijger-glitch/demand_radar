// "AI gaps": wat antwoordt een AI-assistent als iemand vraagt wat hij moet kopen, boeken of afsluiten, en waar blijft dat
// antwoord vaag? (19 nov 2026, Henkjan: "We moeten ook data in demand radar krijgen door LLMs zelf te bevragen en dan de gaps
// te vinden" en "Ja bouw en laat nu draaien".) Veel gemeten vraag plus een antwoord zonder namen, of met alleen de grote
// algemene winkels, is een open plek: wie daar het beste antwoord wordt, wordt genoemd.
// Zelfde route als de teksten (lib/claudefill.js), dus zonder AI-aanroep vanaf Vercel en zonder gateway:
// 1) GET /api/gaps geeft de vragen van vandaag: de grootste onderwerpen per land met de echte zoekterm, als koopvraag in de
//    taal van het land. Wat de laatste 7 dagen al gevraagd is, komt niet opnieuw.
// 2) Claude stelt elke vraag aan een verse sessie (eigen kennis, geen webzoeken) en schrijft gaps/<dag>.json op tak `fill`
//    (of POST /api/gaps?key=<teamsleutel>).
// 3) De uurronde (api/warm.js) haalt het bestand op; de radar toont de uitkomst als tegel "AI gaps".
// Eerlijk over de grens: dit is één model zonder webzoeken, niet wat ChatGPT-gebruikers echt zien. Meer modellen (ChatGPT,
// Gemini, Perplexity) kunnen later via lib/aishelf.js met eigen sleutels.
import { createHash } from 'node:crypto';
import { getJSON, putJSON } from './store.js';

const LATEST = 'gaps/latest.json';
const KEEP_DAYS = 14, REASK_DAYS = 7;
const RAW = () => (process.env.FILL_RAW || 'https://raw.githubusercontent.com/henkjandekrijger-glitch/demand_radar/fill/fill').replace(/\/fill$/, '/gaps');
const s = (v, n) => (v == null || v === '' ? null : String(v).replace(/\s+/g, ' ').trim().slice(0, n) || null);
const key = x => `${x.cc}|${String(x.topic || x.keyword || x.name || '').toLowerCase()}`;
const daysAgo = (day, now) => Math.round((Date.parse(now) - Date.parse(day)) / 864e5);

// De koopvraag, in de taal van het land, met de zoekterm zoals mensen hem intypen.
export const QUESTION = {
  NL: k => `Ik zoek: ${k}. Wat raad je me aan, en waar kan ik dat in Nederland het beste kopen, boeken of afsluiten? Noem concrete namen.`,
  DE: k => `Ich suche: ${k}. Was empfiehlst du mir, und wo kann ich das in Deutschland am besten kaufen, buchen oder abschließen? Nenne konkrete Namen.`,
  US: k => `I'm looking for: ${k}. What do you recommend, and where is the best place in the United States to buy, book or sign up for it? Name specific names.`,
};

// Oordeel per antwoord. Vooraf vastgelegd, zodat de lijst niet achteraf naar een gewenste uitkomst wordt gebogen.
// open = de AI noemt niemand; generic = alleen de grote algemene winkels; unclear = wel namen, geen duidelijke eerste keus;
// taken = de AI heeft een duidelijke eerste keus.
export const LEVELS = { open: 1, generic: 0.7, unclear: 0.35, taken: 0.1 };
export function judge(a) {
  const low = v => String(v).toLowerCase();
  const names = [...new Map((a.names || []).map(n => s(n, 60)).filter(Boolean).map(n => [low(n), n])).values()].slice(0, 12);
  const giants = [...new Set((a.giants || []).map(n => s(n, 60)).filter(Boolean).map(low))];
  const special = names.filter(n => !giants.includes(low(n)));
  const pick = s(a.pick, 60);
  // misread: de AI begreep de zoekterm niet (typfout, vage term) en vroeg terug; dat is geen gat in de markt
  const level = a.misread ? 'misread' : !names.length ? 'open' : !special.length ? 'generic' : !pick ? 'unclear' : 'taken';
  return { names, special, giants: names.filter(n => giants.includes(low(n))), pick: level === 'taken' ? pick : null, level };
}
export const score = (level, last) => Math.round(100 * (LEVELS[level] || 0) * Math.log10((+last || 0) + 10)) / 100;

export async function latestGaps(store) { return store ? (await getJSON(store, LATEST, null).catch(() => null)) : null; }

// Wat er vandaag te vragen is: per land de grootste onderwerpen met een nette titel, elk onderwerp één keer.
export async function pendingGaps(store, { per = 30, now = new Date().toISOString() } = {}) {
  const d = (await getJSON(store, 'maps/demand.json', null).catch(() => null)) || {}, L = (await latestGaps(store)) || {};
  const fresh = new Set((L.items || []).filter(x => x.askedDay && daysAgo(x.askedDay, now) < REASK_DAYS).map(key));
  const questions = [];
  for (const cc of Object.keys(QUESTION)) {
    const seen = new Set();
    const rows = (d.items || []).filter(x => x.cc === cc && x.title && !(x.now && x.now.status === 'gone')).sort((a, b) => (b.last || 0) - (a.last || 0));
    for (const x of rows) {
      const k = key({ cc, topic: x.topic, keyword: x.name }); if (seen.has(k)) continue; seen.add(k);
      if (seen.size > per) break;
      if (fresh.has(k)) continue;
      questions.push({ id: x.id, cc, topic: x.topic || null, title: x.title, keyword: x.name, cat: x.cat || null, perMonth: x.last || null, q: QUESTION[cc](x.name) });
    }
  }
  return {
    day: d.day || null, todo: questions.length, per,
    how: `Ask each question "q" to a fresh assistant session that answers from its own knowledge (no web search, no tools), as it would answer any consumer, in the language of the question, in at most 120 words. Do not adapt the answer to the reporting step. Then report per question id: "answer" (the answer, max 600 characters), "names" (every specific company, shop, website, brand or product the answer names), "giants" (the subset of names that are big general marketplaces or mass retailers, such as Amazon, bol, eBay, Walmart, MediaMarkt, Otto), "pick" (the one name the answer recommends most clearly, or null when it gives no clear first choice) and "hedged" (true when the answer mostly gives criteria or says it depends). Save as gaps/${d.day}.json on branch "fill" of github.com/henkjandekrijger-glitch/demand_radar (or POST it to /api/gaps?key=<team key>). Format:
{"day":"${d.day}","model":"<model name, with or without web search>","answers":{"<id>":{"answer":"...","names":["..."],"giants":["..."],"pick":null,"hedged":false}}}`,
    questions,
  };
}

// Antwoorden toepassen: oordeel per onderwerp, samenvoegen met wat de laatste dagen al gevraagd is.
export async function applyGaps(store, f, { now = new Date().toISOString() } = {}) {
  if (!f || typeof f !== 'object' || !f.answers || typeof f.answers !== 'object') return { error: 'no answers' };
  const d = (await getJSON(store, 'maps/demand.json', null).catch(() => null)) || {}, byId = new Map((d.items || []).map(x => [x.id, x]));
  const L = (await latestGaps(store)) || {}, day = s(f.day, 10) || d.day || now.slice(0, 10), model = s(f.model, 80) || 'Claude, no web search';
  const out = new Map((L.items || []).filter(x => x.askedDay && daysAgo(x.askedDay, now) < KEEP_DAYS).map(x => [key(x), x]));
  const res = { asked: 0, open: 0, generic: 0, unclear: 0, taken: 0, misread: 0, unknown: 0 };
  for (const [id, a] of Object.entries(f.answers)) {
    const x = byId.get(id); if (!x || !a || !x.title) { res.unknown++; continue; }
    const cc = x.cc, j = judge(a), q = QUESTION[cc] ? QUESTION[cc](x.name) : null; if (!q) { res.unknown++; continue; }
    const row = { id, cc, topic: x.topic || null, name: x.title, keyword: x.name, cat: x.cat || null, last: x.last || null, period: x.period || null, q, answer: s(a.answer, 600), names: j.names, giants: j.giants, pick: j.pick, hedged: !!a.hedged, level: j.level, score: score(j.level, x.last), model, askedDay: day };
    out.set(key(row), row); res.asked++; res[j.level]++;
  }
  // volumes bijwerken voor wat eerder gevraagd is en vandaag nog op de radar staat
  const byKey = new Map(); for (const x of (d.items || []).filter(x => x.title)) { const k = key({ cc: x.cc, topic: x.topic, keyword: x.name }), o = byKey.get(k); if (!o || (x.last || 0) > (o.last || 0)) byKey.set(k, x); } // grootste zoekterm van het onderwerp
  const items = [...out.values()].map(r => { const x = byKey.get(key(r)); return x && x.last ? { ...r, last: x.last, period: x.period || r.period, score: score(r.level, x.last) } : r; }).sort((a, b) => b.score - a.score);
  const v = { day, at: now, model, items, counts: items.reduce((c, r) => { c[r.level] = (c[r.level] || 0) + 1; return c; }, {}) };
  await putJSON(store, LATEST, v);
  await putJSON(store, `gaps/${day}.json`, { day, at: now, model, res, answers: f.answers }).catch(() => {});
  return { ...res, total: items.length };
}

// gaps/<dag>.json van tak `fill` ophalen en één keer toepassen (zelfde aanpak als fillFromRepo).
export async function gapsFromRepo(store, day) {
  if (!day) return { skip: 'no day' };
  const r = await fetch(`${RAW()}/${day}.json`, { signal: AbortSignal.timeout(15000), headers: { 'cache-control': 'no-cache' } }).catch(() => null);
  if (!r || !r.ok) return { none: r ? r.status : 'fetch failed' };
  const text = await r.text(); let f; try { f = JSON.parse(text); } catch { return { error: 'bad json' }; }
  const h = createHash('sha256').update(text).digest('hex').slice(0, 16), k = `gaps/applied-${day}.json`;
  const done = await getJSON(store, k, null).catch(() => null);
  if (done && done.h === h) return { already: done.at };
  const res = await applyGaps(store, f);
  await putJSON(store, k, { h, at: new Date().toISOString(), res }).catch(() => {});
  return res;
}

// Voor de site en de tekstweergave: de open plekken eerst.
export function presentGaps(L) {
  if (!L || !L.items) return [];
  return L.items.filter(r => r.level !== 'misread').map(r => ({ id: r.id, cc: r.cc, name: r.name, keyword: r.keyword, cat: r.cat, last: r.last, period: r.period, level: r.level, score: r.score, q: r.q, answer: r.answer, names: r.names, giants: r.giants, pick: r.pick, model: r.model, askedDay: r.askedDay }));
}
