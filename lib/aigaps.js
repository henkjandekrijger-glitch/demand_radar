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

// Eigen keuzehulpen (19 nov 2026, Henkjan: "Wij moeten simpelweg de betere antwoorden leveren"): staat er voor dit gat al een
// pagina op onze eigen sites? Gratis: de sitemaps, 12 uur bewaard. Streng vergeleken, liever een keuzehulp missen dan er een
// verzinnen: een gemiste zie je in de lijst "gat zonder keuzehulp", een verzonnen verstopt een kans.
export const GUIDE_SITES = { NL: 'https://keuzehulp.best', DE: 'https://kaufberater.best', US: 'https://whichtobuy.best' };
const GUIDES = 'gaps/guides-v2.json', GUIDE_HOURS = 12;
let fetchImpl = (...a) => fetch(...a);
export function setGapsFetch(f) { fetchImpl = f || ((...a) => fetch(...a)); }
const plain = v => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
const STOP = new Set(['near', 'me', 'en', 'in', 'de', 'het', 'een', 'der', 'die', 'das', 'im', 'the', 'a', 'and', 'und', 'of', 'best', 'beste', 'bester']);
const LINK = new Set(['for', 'fuer', 'voor', 'to', 'with', 'mit', 'met', 'under', 'unter', 'onder', 'kiezen', 'kaufen', 'kopen', 'vergelijken', 'vergleich', 'vs', 'zum', 'zur', 'und', 'en', 'and', 'in', 'im']);
const SKIP = /^\/(categorie|category|kategorie|about|over|deals|connect|verbinden|koppel)(\/|$)/;
function lev(a, b) { const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 3; let p = Array.from({ length: n + 1 }, (_, i) => i); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; }
// zelfde woord: gelijk, enkelvoud/meervoud (jas/jassen, verzekering/verzekeringen), of een typfout in een lang woord
export function sameWord(a, b) {
  if (!a || !b) return false; if (a === b) return true;
  const [x, y] = a.length <= b.length ? [a, b] : [b, a];
  const stems = [x]; if (/f$/.test(x)) stems.push(x.slice(0, -1) + 'v'); if (/s$/.test(x)) stems.push(x.slice(0, -1) + 'z'); // bedrijf/bedrijven, huis/huizen
  if (x.length >= 3 && stems.some(p => y.startsWith(p) && /^(.?en|e?s|e|n|er)$/.test(y.slice(p.length)))) return true;
  return x.length >= 9 && lev(x, y) <= 2;
}
const kwWords = k => plain(k).split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w));
const slugTokens = path => plain(path).split(/[^a-z0-9]+/).filter(Boolean);
// 3 = de hele pagina gaat hierover, 2 = begint ermee ("adventskalender-fuer-maenner"), 1 = alle woorden staan erin, 0 = niets
export function guideMatch(keyword, path) {
  if (!path || path === '/' || SKIP.test(path)) return 0;
  const kw = kwWords(keyword), raw = slugTokens(path); if (!kw.length || !raw.length) return 0;
  const sl = raw.filter(w => !STOP.has(w));
  if (sameWord(kw.join(''), sl.join(''))) return 3;
  const last = slugTokens(String(path).split('/').filter(Boolean).pop() || '').filter(w => !STOP.has(w)); // /rotterdam/schoonmaakbedrijf
  if (raw.length > last.length && sameWord(kw.join(''), last.join(''))) return 3;
  if (kw.length === 1) return sl.length > 1 && sameWord(kw[0], sl[0]) && (LINK.has(sl[1]) || /^20\d\d$/.test(sl[1])) ? 2 : 0;
  return kw.every(w => sl.some(x => sameWord(w, x))) ? 1 : 0;
}
export function findGuide(cc, keyword, sites) {
  const base = GUIDE_SITES[cc], paths = (sites && sites[cc]) || []; if (!base) return null;
  let best = null;
  for (const p of paths) { const m = guideMatch(keyword, p); if (m && (!best || m > best.m || (m === best.m && p.length < best.p.length))) best = { m, p }; }
  return best ? base + best.p : null;
}
// Alle sitemaps van een site: /sitemap.xml plus wat robots.txt noemt (de keuzehulpen hebben er een per onderdeel: zorgverzekering,
// huis-kopen, hypotheek, rotterdam), en sitemap-indexen volgen. Hooguit 25 bestanden per site.
async function sitemapPaths(base) {
  const host = new URL(base).host.replace(/^www\./, ''), queue = [`${base}/sitemap.xml`], seen = new Set(), paths = new Set();
  try { const r = await fetchImpl(`${base}/robots.txt`, { signal: AbortSignal.timeout(8000) }); if (r && r.ok) for (const m of (await r.text()).matchAll(/^[ \t]*sitemap:[ \t]*(\S+)/gim)) queue.push(m[1]); } catch {}
  for (let i = 0; i < queue.length && seen.size < 25; i++) {
    const u = queue[i]; if (seen.has(u)) continue; seen.add(u);
    try {
      if (new URL(u).host.replace(/^www\./, '') !== host) continue;
      const r = await fetchImpl(u, { signal: AbortSignal.timeout(10000) }); if (!r || !r.ok) continue;
      const xml = await r.text(), locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));
      if (/<sitemapindex/i.test(xml)) queue.push(...locs);
      else for (const l of locs) { try { const x = new URL(l); if (x.host.replace(/^www\./, '') === host) paths.add(x.pathname.replace(/\/$/, '') || '/'); } catch {} }
    } catch {}
  }
  return [...paths];
}
// Sitemaps ophalen (hooguit eens per 12 uur); lukt er een niet, dan blijft de vorige lijst staan.
export async function guideSites(store, { now = new Date().toISOString() } = {}) {
  const c = (await getJSON(store, GUIDES, null).catch(() => null)) || {};
  if (c.at && (Date.parse(now) - Date.parse(c.at)) / 36e5 < GUIDE_HOURS) return c.sites || {};
  const sites = { ...(c.sites || {}) };
  await Promise.all(Object.entries(GUIDE_SITES).map(async ([cc, base]) => { const paths = await sitemapPaths(base).catch(() => []); if (paths.length) sites[cc] = paths.slice(0, 8000); }));
  await putJSON(store, GUIDES, { at: now, sites }).catch(() => {});
  return sites;
}
// Een rij met guideSet (door Claude gezet in het antwoordbestand, veld "guide": url of false) blijft zoals hij is.
const withGuides = (items, sites) => items.map(r => (r.guideSet ? r : { ...r, guide: findGuide(r.cc, r.keyword, sites) }));
// Uurronde: nieuwe keuzehulpen meteen meenemen, zonder opnieuw te vragen.
export async function refreshGuides(store, { now = new Date().toISOString() } = {}) {
  const L = await latestGaps(store); if (!L || !(L.items || []).length) return { skip: 'no gaps' };
  const items = withGuides(L.items, await guideSites(store, { now }));
  const changed = items.filter((r, i) => (r.guide || null) !== (L.items[i].guide || null)).length;
  if (changed) await putJSON(store, LATEST, { ...L, items });
  const gaps = items.filter(r => r.level !== 'taken' && r.level !== 'misread');
  return { changed, gaps: gaps.length, noGuide: gaps.filter(r => !r.guide).length };
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
    const row = { id, cc, topic: x.topic || null, name: x.title, keyword: x.name, cat: x.cat || null, last: x.last || null, period: x.period || null, q, answer: s(a.answer, 600), names: j.names, giants: j.giants, pick: j.pick, hedged: !!a.hedged, level: j.level, score: score(j.level, x.last), model, askedDay: day, ...(a.guide === false || typeof a.guide === 'string' ? { guideSet: true, guide: /^https:\/\//.test(a.guide || '') ? s(a.guide, 200) : null } : {}) };
    const prev = out.get(key(row)); if (prev && prev.others && prev.q === row.q) row.others = prev.others; // andere AI's blijven staan bij dezelfde vraag
    out.set(key(row), row); res.asked++; res[j.level]++;
  }
  // volumes bijwerken voor wat eerder gevraagd is en vandaag nog op de radar staat
  const byKey = new Map(); for (const x of (d.items || []).filter(x => x.title)) { const k = key({ cc: x.cc, topic: x.topic, keyword: x.name }), o = byKey.get(k); if (!o || (x.last || 0) > (o.last || 0)) byKey.set(k, x); } // grootste zoekterm van het onderwerp
  const rows = [...out.values()].map(r => { const x = byKey.get(key(r)); return x && x.last ? { ...r, last: x.last, period: x.period || r.period, score: score(r.level, x.last) } : r; }).sort((a, b) => b.score - a.score);
  const items = withGuides(rows, await guideSites(store, { now }).catch(() => ({})));
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

// Andere AI's (19 nov 2026, Henkjan: "ik zet gateway weer aan"): de gaten ook voorleggen aan Perplexity (zoekt live op het web),
// een GPT-model en Gemini, via de Vercel AI Gateway. Alleen met AI_GAPS_GATEWAY=on; de rest van de radar blijft zonder gateway
// (AI_GATEWAY, lib/ai.js). Alleen de gaten (geen favoriet bij de eerste vraag), elk hooguit eens per 7 dagen, en samen hooguit
// AI_GAPS_MAX_DAY vragen per dag (standaard 40, elk naar drie modellen; ruim onder een dollar per dag).
export const OTHER_MODELS = () => (process.env.AI_GAPS_MODELS || 'perplexity/sonar,openai/gpt-5.4-mini,google/gemini-3.8-flash').split(',').map(x => x.trim()).filter(Boolean);
const OTHER_MAX_DAY = () => Math.max(0, +(process.env.AI_GAPS_MAX_DAY || 40));
export const othersOn = () => process.env.AI_GAPS_GATEWAY === 'on' || process.env.AI_GATEWAY === 'on'; // eigen schakelaar, of de hele gateway aan
export const othersToken = req => (othersOn() ? (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || (req && req.headers && req.headers['x-vercel-oidc-token']) || '') : '');
// Twee stappen (v2, 19 nov): eerst de kale vraag, precies zoals een gebruiker hem stelt; daarna leest een goedkoop model het antwoord
// en haalt de namen en de eerste keus eruit. Eerst vroegen we het model zelf om een "pick" erbij: dan kiest het er bijna altijd
// een, ook als het antwoord zelf geen voorkeur had. Zo meten we het antwoord en niet de invuloefening.
const OTHERS_V = 2;
const READER = () => process.env.AI_GAPS_READER || 'anthropic/claude-haiku-5.5';
async function gateway(model, prompt, token, max) {
  const r = await fetchImpl('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'ai-reporting-tags': 'project:demand_radar,fn:aigaps' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: max }), signal: AbortSignal.timeout(45000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status}: ${String((j.error && (j.error.message || j.error)) || 'error').slice(0, 80)}`);
  return String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '');
}
const READ = (q, a) => `Below is an AI assistant's answer to a shopper's question. Read it and return only one line of JSON, nothing else:
{"names":["the brands, shops, sites or providers the answer names, at most 12, most prominent first"],"giants":["those of them that are big general players such as Amazon, Google, Google Maps, Booking, Yelp"],"pick":"the one name the answer itself clearly presents as its first choice or top recommendation, else empty","misread":false}
Do not choose a favourite yourself: "pick" stays empty unless the answer clearly puts one name first. A list of options, or "it depends", has no pick. Set "misread" to true only if the answer says it did not understand the question.

Question: ${q}

Answer: ${String(a).slice(0, 4000)}`;
// Lezer-uitvoer: eerst het hele blok tussen de eerste { en de laatste }, anders het laatste losse blok met "names";
// is het afgekapt, dan redden we de namen die er al staan (zonder eerste keus telt het dan als "geen duidelijke keus" niet mee: null).
const tailJSON = t => {
  const x = String(t), a = x.indexOf('{'), b = x.lastIndexOf('}');
  if (a >= 0 && b > a) { try { const j = JSON.parse(x.slice(a, b + 1)); if (j && Array.isArray(j.names)) return j; } catch {} }
  const m = x.match(/\{[^{}]*"names"[^{}]*\}/g); if (m) { try { return JSON.parse(m[m.length - 1]); } catch {} }
  return null;
};
async function askOne(model, q, token) {
  const answer = await gateway(model, q, token, 2000); if (answer.trim().length < 20) throw new Error('empty answer');
  const read = await gateway(READER(), READ(q, answer), token, 1500), j = tailJSON(read); if (!j) throw new Error(`reader gave no json: ${read.slice(0, 40).replace(/\s+/g, ' ')}`);
  const v = judge(j); return { model, level: v.level, names: v.names.slice(0, 8), pick: v.pick, answer: s(answer, 400) };
}
const othersFresh = (r, now) => !!(r.others && r.others.v === OTHERS_V && daysAgo(r.others.day, now) < (r.others.models.some(m => m.error) ? 1 : REASK_DAYS)); // een model dat faalde: morgen opnieuw
export async function askOthers(store, { req = null, max = 3, now = new Date().toISOString() } = {}) {
  const token = othersToken(req); if (!token) return { off: true };
  const L = await latestGaps(store); if (!L || !(L.items || []).length) return { skip: 'no gaps' };
  const day = now.slice(0, 10), ck = `gaps/others-${day}.json`, c = (await getJSON(store, ck, null).catch(() => null)) || { n: 0 };
  const room = OTHER_MAX_DAY() - (c.n || 0); if (room <= 0) return { cap: c.n };
  const open = L.items.filter(r => ['open', 'generic', 'unclear'].includes(r.level) && !othersFresh(r, now));
  const todo = open.slice(0, Math.max(1, Math.min(max, room))); if (!todo.length) return { done: true };
  await putJSON(store, ck, { n: (c.n || 0) + todo.length, at: now }); // eerst tellen: een mislukte ronde vraagt nooit gratis opnieuw
  const models = OTHER_MODELS(), errors = [];
  const got = await Promise.all(todo.map(async r => ({ k: key(r), models: await Promise.all(models.map(async model => {
    try { return await askOne(model, r.q, token); }
    catch (e) { const m = String(e.message || e).slice(0, 100); errors.push(`${model} ${m}`); return { model, error: m }; }
  })) })));
  const by = new Map(got.filter(g => g.models.some(m => !m.error)).map(g => [g.k, { v: OTHERS_V, day, models: g.models }]));
  const L2 = (await latestGaps(store)) || L; // opnieuw lezen: de uurronde kan intussen keuzehulpen hebben bijgewerkt
  if (by.size) await putJSON(store, LATEST, { ...L2, items: L2.items.map(r => (by.has(key(r)) ? { ...r, others: by.get(key(r)) } : r)) });
  return { asked: todo.length, saved: by.size, models: models.length, left: open.length - by.size, today: (c.n || 0) + todo.length, errors: errors.slice(0, 3) };
}
// Samenvatting per rij: hoeveel andere AI's antwoordden, en hoeveel daarvan ook geen eerste keus hebben.
const otherSum = o => { if (!o || !o.models || o.v !== OTHERS_V) return undefined; const ok = o.models.filter(m => !m.error && m.level !== 'misread'); return { day: o.day, asked: ok.length, noPick: ok.filter(m => m.level !== 'taken').length, models: ok.map(m => ({ model: m.model, level: m.level, pick: m.pick || null, names: m.names || [], answer: m.answer || null })) }; };

// Voor de site en de tekstweergave: de open plekken eerst.
export function presentGaps(L) {
  if (!L || !L.items) return [];
  return L.items.filter(r => r.level !== 'misread').map(r => ({ id: r.id, cc: r.cc, name: r.name, keyword: r.keyword, cat: r.cat, last: r.last, period: r.period, level: r.level, score: r.score, q: r.q, answer: r.answer, names: r.names, giants: r.giants, pick: r.pick, guide: r.guide || null, others: otherSum(r.others), model: r.model, askedDay: r.askedDay }));
}
