// Demand Radar: wat mensen nu willen, per categorie en per land. Eén keer per dag opgebouwd, en elke dag bijgeleerd.
//
// Bronnen
//  - DataForSEO Labs: zoekopdrachten die het hardst groeien (algemeen + per categorie met eigen woorden per taal)
//  - Google Ads-zoekvolumes (25 maanden): echte groei t.o.v. vorige maand en dezelfde maand vorig jaar
//  - DataForSEO Trends: dagdata tot vandaag — stijgt het NU nog, of is het al voorbij?
//  - Google-autocomplete: "bestaat er een app die…", "is there a…" → wat mensen zoeken maar niet vinden
//  - Hacker News "Ask HN: is there a…" → wensen van makers
//  - Google trending (vandaag) met nieuwskoppen → onverwachte vraag van vandaag
//  - Open Library trending + Apple-hitlijsten (boeken, apps) → wat nieuw binnenkomt
//  - Vraagkalender (feestdagen, koopmomenten, regelgeving) + zoekvolume van vorig jaar → wat eraan komt
//  - AI (Vercel AI Gateway): sorteert in categorieën, schrapt ruis, zegt wat mensen willen en een eerste idee
import { dfsReady, budget, topSearches, searchVolume, nowTrends, googleNow, cleanKw } from './dfs.js';
import { predict, BACKTEST } from './forecast.js';
import { COUNTRIES } from './niches.js';
import { ask, parseJSON } from './ai.js';
import { get, pool, trends as trendingToday } from './core.js';
import { suggest } from './sources.js';
import { upcoming } from './calendar.js';
import { noise, cluster, sumSeries, measure, stepGlitch } from './rising.js';
import { getStore } from './store.js';
import { loadMemory, saveMemory, weight, grade, setPicks, remember, learnNoise, noiseSet, isLearnedNoise, chartNews, closeDay, learningSummary } from './demandlearn.js';

export const CATS = [
  { id: 'products', name: 'Products', desc: 'Things people buy' },
  { id: 'courses', name: 'Courses & training', desc: 'Courses, exams, certificates and lessons' },
  { id: 'books', name: 'Books', desc: 'Books, ebooks and audiobooks' },
  { id: 'services', name: 'Services', desc: 'Someone who does it for you' },
  { id: 'apps', name: 'Apps & AI tools', desc: 'Software, apps and online tools' },
  { id: 'trips', name: 'Trips & outings', desc: 'Travel, stays and days out' },
  { id: 'money', name: 'Money & contracts', desc: 'Energy, insurance, banking and investing' },
];
const CAT_IDS = CATS.map(c => c.id);
export const VIEWS = [
  { id: 'rise', name: 'Will rise', desc: 'Predicted to rise in the coming months, from last year\'s pattern and this year\'s level' },
  { id: 'now', name: 'Rising now', desc: 'The strongest measured growth across all categories' },
  ...CATS,
  { id: 'unexpected', name: 'Unexpected', desc: 'Demand nobody saw coming' },
  { id: 'missing', name: "Doesn't exist yet", desc: 'What people look for but cannot find' },
  { id: 'coming', name: 'Coming up', desc: 'Moments when demand is about to rise, measured from last year' },
];

// Eigen woorden per categorie en taal (regex in DataForSEO). DataForSEO kent geen \\b, dus hele woorden = spatie of begin/eind.
// [hele woorden, stukjes]
const rx = (whole, part) => [whole.length ? `(^| )(${whole.join('|')})( |$)` : null, part.length ? `(${part.join('|')})` : null].filter(Boolean).join('|');
const W = {
  courses: {
    NL: [['training', 'trainingen', 'lessen', 'les', 'diploma'], ['cursus', 'opleiding', 'examen', 'certificaat', 'bijscholing', 'workshop', 'bootcamp', 'rijles', 'zwemles', 'taalles', 'bijles', 'oefentoets', 'leren typen', 'leren zwemmen', 'leren programmeren']],
    DE: [['kurse', 'lernen'], ['kurs für', 'kurs online', 'sprachkurs', 'onlinekurs', 'ausbildung', 'weiterbildung', 'fortbildung', 'umschulung', 'schulung', 'prüfung', 'zertifikat', 'seminar', 'lehrgang', 'fernstudium', 'nachhilfe', 'workshop', 'führerschein']],
    US: [['courses', 'lessons'], ['online course', 'certification', 'certificate program', 'exam prep', 'practice test', 'bootcamp', 'training course', 'classes near me', 'lessons near me', 'tutoring', 'workshop', 'learn to ', 'how to become']],
  },
  books: {
    NL: [['boek', 'boeken', 'roman'], ['ebook', 'e-book', 'luisterboek', 'kookboek', 'leesboek', 'prentenboek', 'stripboek']],
    DE: [['buch', 'roman'], ['bücher', 'ebook', 'e-book', 'hörbuch', 'kochbuch', 'kinderbuch', 'taschenbuch']],
    US: [['books', 'novel', 'novels'], ['book about', 'book on ', 'book series', 'best books', 'new book', 'ebook', 'audiobook', 'cookbook', 'paperback', 'hardcover']],
  },
  services: {
    NL: [['huren', 'laten'], ['monteur', 'installateur', 'loodgieter', 'stukadoor', 'hovenier', 'schoonmaak', 'glazenwasser', 'kapper', 'tandarts', 'fysio', 'advocaat', 'notaris', 'makelaar', 'boekhouder', 'reparatie', 'repareren', 'verhuur', 'bezorg', 'in de buurt', 'offerte']],
    DE: [['maler', 'notar', 'mieten'], ['lassen', 'handwerker', 'installateur', 'klempner', 'gärtner', 'reinigung', 'friseur', 'zahnarzt', 'physio', 'anwalt', 'makler', 'steuerberater', 'reparatur', 'reparieren', 'wartung', 'vermietung', 'lieferservice', 'in der nähe']],
    US: [['services', 'repair', 'rental'], ['near me', 'installer', 'installation', 'contractor', 'plumber', 'electrician', 'cleaning service', 'lawyer', 'attorney', 'dentist', 'therapist', 'accountant', 'for rent', 'delivery service']],
  },
  apps: {
    NL: [['app', 'apps', 'tool', 'ai', 'software'], ['chatgpt', 'generator', 'abonnement']],
    DE: [['app', 'apps', 'tool', 'ki', 'ai', 'software', 'programm'], ['chatgpt', 'generator', 'abonnement']],
    US: [['app', 'apps', 'tool', 'tools', 'ai', 'software', 'saas', 'plugin', 'extension'], ['chatgpt', 'generator', 'subscription']],
  },
  trips: {
    NL: [['reis', 'hotel', 'hotels', 'vlucht', 'uitje'], ['vakantiehuis', 'camping', 'vliegtickets', 'weekendje', 'stedentrip', 'cruise', 'wellness', 'pretpark', 'dagje uit', 'bungalow', 'last minute']],
    DE: [['reise', 'hotel', 'flug'], ['urlaub', 'camping', 'flüge', 'kreuzfahrt', 'wellness', 'freizeitpark', 'ausflug', 'ferienwohnung', 'ferienhaus', 'kurzurlaub']],
    US: [['trip', 'hotel', 'hotels', 'resort', 'flights', 'cruise', 'vacation'], ['getaway', 'camping', 'theme park', 'spa day', 'airbnb', 'things to do']],
  },
  money: {
    NL: [['sparen', 'lening', 'beleggen'], ['verzekering', 'energiecontract', 'energieleverancier', 'hypotheek', 'zorgverzekering', 'spaarrekening', 'creditcard', 'sim only', 'thuisbatterij', 'zonnepanelen']],
    DE: [['kredit', 'depot', 'etf'], ['versicherung', 'stromanbieter', 'gasanbieter', 'tagesgeld', 'festgeld', 'baufinanzierung', 'girokonto', 'kreditkarte', 'handyvertrag', 'balkonkraftwerk', 'stromspeicher']],
    US: [['loan', 'loans', 'mortgage', 'insurance'], ['credit card', 'savings account', 'medicare', 'health plan', 'phone plan', 'solar panels', 'home battery', 'refinance']],
  },
};
const PULL = Object.fromEntries(Object.entries(W).map(([cat, by]) => [cat, Object.fromEntries(Object.entries(by).map(([cc, [w, p]]) => [cc, rx(w, p)]))]));

// Autocomplete per categorie: wat mensen nu intikken. Gaat mee in de Google Ads-aanroep en wordt dus ook gemeten.
const AC = {
  NL: { products: ['waar koop ik', 'goedkope'], courses: ['cursus', 'online cursus', 'opleiding tot'], books: ['boek over', 'beste boek over'], services: ['laten maken', 'iemand die'], apps: ['app voor', 'ai tool voor'], trips: ['weekendje weg', 'dagje uit'], money: ['overstappen', 'beste verzekering'] },
  DE: { products: ['wo kaufe ich', 'günstige'], courses: ['kurs', 'online kurs', 'ausbildung zum'], books: ['buch über', 'bestes buch über'], services: ['jemand der', 'lassen'], apps: ['app für', 'ki tool für'], trips: ['kurzurlaub', 'ausflug'], money: ['wechseln', 'beste versicherung'] },
  US: { products: ['where to buy', 'cheap'], courses: ['course on', 'online course', 'certification for'], books: ['book about', 'best book on'], services: ['someone to', 'hire someone to'], apps: ['app for', 'ai tool for'], trips: ['weekend getaway', 'things to do'], money: ['switch to', 'best insurance'] },
};

// Wensen: zoekopdrachten waarin mensen vragen om iets dat ze niet vinden.
const WISH = {
  NL: ['bestaat er een app die', 'bestaat er een apparaat dat', 'bestaat er een website waar', 'bestaat er iets dat', 'bestaat er een', 'is er een app die', 'waarom is er geen', 'waar vind ik iemand die', 'ik zoek een app die'],
  DE: ['gibt es eine app die', 'gibt es ein gerät das', 'gibt es eine website wo', 'gibt es etwas das', 'gibt es einen service der', 'warum gibt es kein', 'warum gibt es keine', 'suche jemanden der'],
  US: ['is there an app that', 'is there a device that', 'is there a website that', 'is there a service that', 'is there a product that', 'i wish there was a', 'why is there no', 'does anyone make a', 'someone should make a', 'is there a tool that'],
};

const MIN = { NL: 300, DE: 1000, US: 3000 };
const NOW_MULT = { rising: 1.4, steady: 1, quiet: 0.8, fading: 0.35, gone: 0.05 };
const today0 = () => new Date().toISOString().slice(0, 10);
const r2 = x => Math.round(x * 100) / 100;

// ---------- AI ----------
const SYS = 'You sort measured demand data for a demand radar used by entrepreneurs and advertisers. Be strict, factual and brief. Reply with JSON only.';

function rowsPrompt(cc, rows, today) {
  const period = rows[0] ? rows[0].period : '';
  return `Country: ${cc}. Today: ${today}. Search numbers are for ${period}, the latest measured month; "now" compares the last 14 days with the 6 weeks before.
Categories: ${CAT_IDS.join(', ')} (products = physical things; courses = courses, exams, certificates, lessons; books; services = someone does it for you; apps = software, apps, online/AI tools; trips = travel, stays, days out; money = energy, insurance, banking, investing, phone plans).
For each search topic: keep:true if it is real buying demand someone could sell or advertise to. keep:false for sports results, news, disasters, people or celebrities, TV/film/game titles people only look up, going to one website or login (a word can also be the name of a site or app), trivia, misspelled or glitched keywords.
For kept topics give "cat" (one category), "topic" (short lowercase English name of the underlying demand, identical for topics that are the same thing), "what" (max 10 plain English words: what people want), "idea" (max 14 words: one concrete way to sell or advertise to it that makes sense today; if a one-time moment has passed, aim at the next time), "unexpected" (true only when this demand is surprising: it came out of nowhere or is an odd new want), "why" (max 12 words, only when unexpected).
JSON only: {"r":[{"id":1,"keep":true,"cat":"products","topic":"...","what":"...","idea":"...","unexpected":false}]}

${rows.map((r, i) => `${i + 1}. ${r.name}${r.members.length > 1 ? ` (also: ${r.members.slice(1, 4).map(m => m.k).join(', ')})` : ''}${r.where.length ? ` [searched with: ${r.where.join(', ')}]` : ''}${r.hint ? ` [found as: ${r.hint}]` : ''} — ${r.last} searches, ${r.mom >= 0 ? '+' : ''}${r.mom}% vs previous month${r.yoy != null ? `, ${r.yoy >= 0 ? '+' : ''}${r.yoy}% vs a year ago` : ''}${r.now ? `, now: ${r.now.status}` : ''}`).join('\n')}`;
}

const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function risePrompt(cc, rows, today) {
  return `Country: ${cc}. Today: ${today}. These searches are predicted to rise in the coming months because they rose in the same months last year and their level now is similar.
For each: keep:true if it is real buying demand someone could sell or advertise to: a product, product type, product brand, service, subscription, trip or course. keep:false for sports results, news, people, TV titles, trivia, glitched keywords, and for going to one store, restaurant or website by name (a retailer, department store, supermarket, pizza chain or webshop like "kohl's" or "total wine"); a product brand people buy anywhere (like "ugg" or "lego") stays.
"oneoff": true when last year's rise came from a one-time event that will not repeat this year (an election, a single tournament, a product launch, a one-time government campaign, a one-time disaster); false for yearly patterns (seasons, holidays, school year, tax and insurance deadlines, weather).
For kept topics also give "cat" (${CAT_IDS.join('|')}), "topic" (short lowercase English name, identical for the same thing), "what" (max 10 plain English words), "idea" (max 14 words: what to sell or advertise, and when to start).
JSON only: {"r":[{"id":1,"keep":true,"oneoff":false,"cat":"products","topic":"...","what":"...","idea":"..."}]}

${rows.map((r, i) => { const f = r.forecast; return `${i + 1}. ${r.name} — now ${f.from.v}/month (${MONS[f.from.m - 1]}), predicted ${f.months.map(m => `${MONS[m.m - 1]} ${m.v}`).join(', ')}; last year ${f.lastYear.map(m => `${MONS[m.m - 1]} ${m.v}`).join(', ')}`; }).join('\n')}`;
}

function extrasPrompt(cc, wishes, trending, today) {
  return `Country: ${cc}. Today: ${today}.
A) Searches and posts where people ask for something (autocomplete like "is there an app that…", Reddit and Hacker News posts), with monthly Google searches when known:
${wishes.map((w, i) => `${i + 1}. ${w.q}${w.volume ? ` (${w.volume}/month)` : ''}`).join('\n') || '(none)'}
Group them into at most 15 distinct needs, the most wanted first. For each need: "need" (max 12 plain English words), "ids" (numbers of the searches), "exists": "no" | "partly" | "yes" (does a good, well-known solution already exist?), "gap" (max 14 words: what is missing), "idea" (max 14 words: what to build or sell), "cat" (${CAT_IDS.join('|')}). Leave out jokes, trivia and medical emergencies.
B) Today's trending Google searches with a news headline:
${trending.map((t, i) => `${i + 1}. ${t.name} (${t.traffic || '?'} searches)${t.news && t.news.title ? ` — ${t.news.title}` : ''}`).join('\n') || '(none)'}
Pick only those that create buying demand: people will want to buy, book or learn something because of it. For each: "id", "angle" (max 12 words: what people will want), "cat", "idea" (max 14 words).
JSON only: {"needs":[{"need":"...","ids":[1,2],"exists":"no","gap":"...","idea":"...","cat":"apps"}],"today":[{"id":1,"angle":"...","cat":"products","idea":"..."}]}`;
}

async function aiJSON(prompt, token, maxTokens = 4000) {
  return parseJSON(await ask({ system: SYS, prompt, maxTokens, token, timeoutMs: 90000 }));
}

// Zoektermen voor komende momenten, per land in de eigen taal. Eén keer gevraagd, daarna uit het geheugen.
async function comingTerms(list, mem, token) {
  const need = list.filter(x => !mem.terms[x.key]);
  if (need.length && token) {
    try {
      const j = await aiJSON(`For each line give 3 short search terms people in that country type into Google when they want to buy, book or arrange something for this moment. Local language, lowercase, no brand names.
JSON only: {"t":{"<key>":["...","...","..."]}}
${need.map(x => `${x.key}: ${x.name} — e.g. ${x.ideas.slice(0, 4).join(', ')}`).join('\n')}`, token, 2500);
      for (const [k, v] of Object.entries((j && j.t) || {})) if (Array.isArray(v)) mem.terms[k] = v.map(String).slice(0, 3);
    } catch {}
  }
  return list.map(x => ({ ...x, terms: mem.terms[x.key] || [] }));
}

// ---------- gratis bronnen ----------
const MKT = { NL: ['nl-NL', 'nl-nl'], DE: ['de-DE', 'de-de'], US: ['en-US', 'us-en'] };
async function bingAC(q, cc) { const j = await get(`https://api.bing.com/osjson.aspx?market=${MKT[cc][0]}&query=${encodeURIComponent(q)}`, { timeout: 6000 }); return Array.isArray(j) && Array.isArray(j[1]) ? j[1] : []; }
async function ddgAC(q, cc) { const j = await get(`https://duckduckgo.com/ac/?type=list&kl=${MKT[cc][1]}&q=${encodeURIComponent(q)}`, { timeout: 6000 }); return Array.isArray(j) && Array.isArray(j[1]) ? j[1] : []; }
// Wat mensen vragen maar niet vinden: autocomplete van Google, Bing en DuckDuckGo.
async function wishes(cc) {
  const jobs = WISH[cc].flatMap(p => [['google', p], ['bing', p], ['ddg', p]]);
  const out = await pool(jobs, 6, async ([eng, p]) => (await (eng === 'google' ? suggest(p, cc) : eng === 'bing' ? bingAC(p, cc) : ddgAC(p, cc))).map(q => ({ q: String(q).toLowerCase().trim(), prefix: p, from: eng })));
  const seen = new Map();
  for (const w of out.flat().filter(Boolean)) { if (w.q.split(' ').length < 5 || w.q === w.prefix) continue; const have = seen.get(w.q); if (have) { have.engines++; continue; } seen.set(w.q, { ...w, engines: 1 }); }
  return [...seen.values()].sort((a, b) => b.engines - a.engines);
}
// Autocomplete per categorie (Google): verse zoekopdrachten die daarna gemeten worden.
async function acCategory(cc) {
  const jobs = Object.entries(AC[cc]).flatMap(([cat, ps]) => ps.map(p => [cat, p]));
  const out = await pool(jobs, 6, async ([cat, p]) => (await suggest(p, cc)).map(q => ({ q: String(q).toLowerCase().trim(), cat })));
  const seen = new Set();
  return out.flat().filter(Boolean).filter(x => x.q.split(' ').length >= 2 && !seen.has(x.q) && seen.add(x.q));
}
// Reddit (RSS werkt vanaf Vercel, JSON niet): wensen en producten die mensen willen hebben.
const SUBS = ['SomebodyMakeThis', 'AppIdeas', 'shutupandtakemymoney', 'BuyItForLife', 'INEEDIT'];
async function redditWishes() {
  const out = [];
  for (const sub of SUBS) {
    try {
      const xml = await get(`https://www.reddit.com/r/${sub}/top.rss?t=week&limit=25`, { text: true, timeout: 8000 });
      for (const m of String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
        const t = (m[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1], l = (m[1].match(/<link href="([^"]+)"/) || [])[1];
        if (t) out.push({ q: t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim().slice(0, 160), prefix: `r/${sub}`, from: 'reddit', url: l || null });
      }
    } catch {}
    await new Promise(r => setTimeout(r, 400)); // Reddit beperkt snelle reeksen
  }
  return out;
}
// Bluesky: waar mensen het vandaag over hebben (Engelstalig, wereldwijd).
async function blueskyTrending() {
  const j = await get('https://public.api.bsky.app/xrpc/app.bsky.unspecced.getTrendingTopics?limit=15', { timeout: 6000 });
  return (j.topics || []).map(t => ({ name: t.displayName || t.topic, traffic: 'Bluesky', volume: 0, news: t.description ? { title: t.description, url: t.link ? `https://bsky.app${t.link}` : null, source: 'Bluesky' } : null }));
}
async function askHN() {
  const since = Math.floor(Date.now() / 1000) - 30 * 86400;
  const j = await get(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent('is there a')}&tags=ask_hn&hitsPerPage=40&numericFilters=created_at_i>${since}`, { timeout: 8000 });
  return (j.hits || []).filter(h => /is there (a|an|any)\b/i.test(h.title || '')).map(h => ({ q: String(h.title).replace(/^ask hn:\s*/i, '').toLowerCase(), prefix: 'hn', url: `https://news.ycombinator.com/item?id=${h.objectID}` }));
}
async function openLibrary() {
  const j = await get('https://openlibrary.org/trending/daily.json?limit=15', { timeout: 8000 });
  return (j.works || []).map(w => ({ title: w.title, by: (w.author_name || [])[0] || '', url: `https://openlibrary.org${w.key}` }));
}
async function apple(kind, cc) {
  const path = kind === 'books' ? 'books/top-paid/15/books.json' : 'apps/top-free/15/apps.json';
  const j = await get(`https://rss.applemarketingtools.com/api/v2/${cc.toLowerCase()}/${path}`, { timeout: 8000 });
  return (j.feed && j.feed.results || []).map(r => ({ title: r.name, by: r.artistName, url: r.url, genre: r.genres && r.genres[0] && r.genres[0].name }));
}

// ---------- per land ----------
async function country(cc, ctx) {
  const C = COUNTRIES[cc], min = MIN[cc] || 1000, { b, mem, today, token, learned } = ctx;
  const notes = [];

  // 1) Gemeten groei: algemeen + per categorie.
  const pulls = [
    { src: 'jump', o: { order: 'monthly' } },
    { src: 'big-jump', o: { order: 'monthly', by: 'volume', minGrowth: 50 } },
    { src: 'big-year', o: { order: 'yearly', by: 'volume', minGrowth: 50 } },
    ...Object.entries(PULL).map(([cat, rx]) => ({ src: `cat-${cat}`, hint: cat, o: { regex: rx[cc], by: 'volume', growthAny: true, minGrowth: 20, intent: null, minVolume: Math.round(min / 2), limit: 200 } })),
  ];
  const curYear = +today.slice(0, 4);
  const oldYear = k => (String(k).match(/\b(20\d\d)\b/g) || []).some(y => +y < curYear);
  const [popList, lists, wish, hn, rd, trend, sky, acs] = await Promise.all([
    topSearches(C, b, { by: 'volume', minGrowth: -100, minVolume: min, limit: 700 }).catch(() => []),
    pool(pulls, 5, async p => (await topSearches(C, b, { minVolume: min, limit: 100, ...p.o })).map(x => ({ ...x, src: p.src, hint: p.hint || null }))),
    wishes(cc).catch(() => []),
    cc === 'US' ? askHN().catch(() => []) : [],
    cc === 'US' ? redditWishes().catch(() => []) : [],
    trendingToday(cc).catch(() => []),
    cc === 'US' ? blueskyTrending().catch(() => []) : [],
    acCategory(cc).catch(() => []),
  ]);
  const poolMap = new Map();
  for (const x of lists.flat().filter(Boolean)) {
    if (!x.k) continue;
    const have = poolMap.get(x.k);
    if (have) { have.srcs.add(x.src); if (!have.hint && x.hint) have.hint = x.hint; continue; }
    if (noise(x, cc) || isLearnedNoise(learned, x.k)) continue;
    poolMap.set(x.k, { ...x, srcs: new Set([x.src]) });
  }

  // 2) Varianten samenvoegen; per categorie genoeg kandidaten zodat cursussen en boeken niet wegvallen onder producten.
  const clusters = cluster([...poolMap.values()]).map(c => {
    const hints = c.members.map(m => m.hint).filter(Boolean);
    const pre = Math.max(...c.members.map(x => { const s = [...(x.monthly || [])].sort((a, b2) => a.y - b2.y || a.m - b2.m), n = s.length; if (n < 2) return 0; const last = s[n - 1].v; return Math.max(last - s[n - 2].v, x.trend.y > 0 ? last - last / (1 + x.trend.y / 100) : 0); }));
    return { ...c, pre, hint: hints[0] || null, srcs: [...new Set(c.members.flatMap(m => [...m.srcs]))] };
  }).sort((a, b2) => b2.pre - a.pre);
  const chosen = new Set();
  for (const cat of Object.keys(PULL)) clusters.filter(c => c.hint === cat).slice(0, 18).forEach(c => chosen.add(c));
  clusters.filter(c => !c.hint).slice(0, 30).forEach(c => chosen.add(c));
  const cand = [...chosen];

  // 3) Eén Google Ads-aanroep voor alles: kandidaten, wensen en termen voor komende momenten.
  const coming = (ctx.coming || []).filter(m => m.cc === cc);
  const wishList = [...wish.slice(0, 70), ...hn.slice(0, 15), ...rd.slice(0, 40)];
  const acList = acs.filter(a => !poolMap.has(a.q) && !noise({ k: a.q, monthly: [] }, cc) && !isLearnedNoise(learned, a.q)).slice(0, 200);
  const kws = [...cand.flatMap(c => c.members.slice(0, 3).map(x => x.k)), ...wishList.filter(w => w.from !== 'reddit').map(w => w.q), ...coming.flatMap(m => m.terms), ...acList.map(a => a.q)];
  const seenCore = new Set();
  const popKws = popList.filter(x => x.k && !oldYear(x.k) && !noise(x, cc) && !isLearnedNoise(learned, x.k) && !seenCore.has(x.core || x.k) && seenCore.add(x.core || x.k)).map(x => x.k).slice(0, 600);
  const gradeKws = (mem.fc && mem.fc[cc] || []).map(f => f.k);
  const ab = budget(Math.max(0, b.max - b.spent));
  const [ads, adsF] = await Promise.all([searchVolume(kws, C, ab).catch(() => ({})), searchVolume([...gradeKws, ...popKws], C, ab).catch(() => ({}))]);
  b.spent += ab.spent; b.calls += ab.calls;
  notes.push(...ab.errors.map(e => (/402/.test(e) ? 'Google Ads data needs DataForSEO credit' : e)));

  // 4) Meten (ook de autocomplete-zoekopdrachten per categorie).
  for (const a of acList) { const d = ads[cleanKw(a.q)]; if (d && d.monthly && d.monthly.length >= 13 && d.volume >= MIN[cc] * 0.3) cand.push({ name: a.q, members: [{ k: a.q, volume: d.volume, monthly: [], trend: {}, cpc: d.cpc, competition: d.competition }], where: [], hint: a.cat, srcs: ['autocomplete'] }); }
  let rows = [];
  for (const c of cand) {
    const fresh = c.members.slice(0, 3).map(x => ads[cleanKw(x.k)]).filter(a => a && a.monthly && a.monthly.length >= 13);
    const series = fresh.length ? sumSeries(fresh.map(a => a.monthly)) : sumSeries(c.members.map(x => x.monthly));
    const me = measure(series); if (!me || stepGlitch(series)) continue;
    const top = c.members[0], ad = fresh[0];
    if (!fresh.length) {
      const s = [...series].sort((a, b2) => a.y - b2.y || a.m - b2.m).map(x => x.v), n = s.length, a = s.slice(-3).reduce((t, v) => t + v, 0), z = s.slice(0, 3).reduce((t, v) => t + v, 0);
      me.sustained = n >= 9 && a >= 1.5 * Math.max(z, 1);
      if (me.yoy == null && top.trend.y != null) me.yoy = Math.round(top.trend.y);
    }
    // Categorieën als cursussen en boeken groeien rustiger dan producten: daar volstaat minder groei.
    const soft = !!c.hint && c.hint !== 'products';
    const minAdd = soft ? min * 0.1 : min;
    const jump = me.mom >= (soft ? 15 : 30) && me.addedMonth >= minAdd;
    const grew = me.label !== 'seasonal' && me.yoy != null && me.yoy >= (soft ? 20 : fresh.length ? 50 : 100) && (me.sustained !== false || (soft && me.mom > -20)) && (fresh.length || me.mom > -30) && (me.addedYear == null ? me.last >= minAdd : me.addedYear >= minAdd);
    // Cursussen, boeken, diensten…: ook grote vraag die stabiel is of licht groeit, zodat elke categorie een volledig beeld geeft.
    const steady = soft && !jump && !grew && me.last >= min * 0.5 && (me.yoy == null || me.yoy >= 0) && me.mom >= -10;
    if (!jump && !grew && !steady) continue;
    if (steady) me.label = 'steady';
    const base = steady ? Math.round(me.last * 0.03) : Math.max(jump ? me.addedMonth : 0, grew ? 0.6 * (me.addedYear ?? (me.last * me.yoy) / (100 + me.yoy)) : 0);
    const fc = fresh.length ? predict(series, new Date(`${today}T00:00:00Z`)) : null;
    rows.push({
      forecast: fc, id: `${cc}:${c.name}`, cc, name: c.name, members: c.members.slice(0, 6).map(x => ({ k: x.k })), where: c.where, hint: c.hint, srcs: c.srcs, source: fresh.length ? 'ads' : 'labs',
      ...me, jump, grew, base: Math.round(base), cpc: ad && ad.cpc != null ? ad.cpc : top.cpc, competition: ad && ad.competition != null ? ad.competition : top.competition,
      series: [...series].sort((a, b2) => a.y - b2.y || a.m - b2.m).slice(-13),
    });
  }
  // De sterkste 30, plus per categorie de sterkste 6 (zodat kleinere categorieën ook gewogen worden).
  rows.sort((a, b2) => b2.base - a.base);
  const keep = new Set(rows.slice(0, 30));
  for (const cat of Object.keys(PULL)) rows.filter(r => r.hint === cat).slice(0, 10).forEach(r => keep.add(r));
  rows = rows.filter(r => keep.has(r)).slice(0, 90);

  // 5) Hoe gaat het NU (dagdata)? Ook voor wat gisteren bovenaan stond, om dat na te kijken.
  const yesterday = (mem.picks[cc] || []).map(p => p.name).filter(n => !rows.some(r => r.name === n));
  const names = [...rows.map(r => ({ k: r.name, v: r.last })), ...yesterday.map(k => ({ k, v: 0 }))].sort((a, b2) => b2.v - a.v).map(x => x.k);
  const chunks = []; for (let i = 0; i < names.length; i += 5) chunks.push(names.slice(i, i + 5));
  const nb = budget(Math.max(0, b.max - b.spent));
  const nowMap = Object.assign({}, ...(await pool(chunks, 4, (ch, i) => (i < 8 ? googleNow(ch, C, nb).then(g => (Object.keys(g).length ? g : nowTrends(ch, C, nb))) : nowTrends(ch, C, nb)))).filter(Boolean));
  b.spent += nb.spent; b.calls += nb.calls;
  for (const r of rows) r.now = nowMap[cleanKw(r.name)] || null;
  const nowBy = new Map(names.map(n => [`${cc}|${n}`, nowMap[cleanKw(n)] && nowMap[cleanKw(n)].status]).filter(x => x[1]));

  // 5b) De voorspeller: populaire zoekopdrachten + radar-onderwerpen waarvan het patroon van vorig jaar en het niveau van nu
  //     een stijging in de komende maanden voorspellen (getoetst: zie lib/forecast.js).
  const tday = new Date(`${today}T00:00:00Z`), seenSig = new Set(rows.map(r => r.series.map(x => x.v).join(',')));
  let rise = [];
  for (const k of popKws) {
    const a = adsF[cleanKw(k)]; if (!a || !a.monthly || a.monthly.length < 15 || a.volume < min * 0.3) continue;
    const ser = sumSeries([a.monthly]); if (stepGlitch(ser)) continue;
    const f = predict(ser, tday); if (!f || f.call !== 'rise' || f.extra < min * 0.3) continue;
    const sig = ser.slice(-13).map(x => x.v).join(','); if (seenSig.has(sig)) continue; seenSig.add(sig);
    rise.push({ id: `${cc}:f:${k}`, cc, name: k, members: [{ k }], where: [], hint: null, srcs: ['forecast'], source: 'ads', forecast: f, last: f.from.v, period: `${f.from.y}-${String(f.from.m).padStart(2, '0')}`, mom: null, yoy: null, cpc: a.cpc, competition: a.competition, series: ser.slice(-13), label: 'forecast' });
  }
  for (const r of rows) if (r.forecast && r.forecast.call === 'rise' && r.forecast.extra >= min * 0.3) rise.push({ ...r, srcs: [...r.srcs, 'forecast'] });
  rise = rise.sort((a, b2) => b2.forecast.extra - a.forecast.extra).slice(0, 36);

  // Nakijken: voorspellingen van eerder waarvan de doelmaand nu in de data staat.
  const fcGraded = { n: 0, hit10: 0, hit25: 0 };
  mem.fc = mem.fc || {}; mem.fscore = mem.fscore || { n: 0, hit10: 0, hit25: 0 };
  mem.fc[cc] = (mem.fc[cc] || []).filter(f => {
    const a = adsF[cleanKw(f.k)]; const act = a && (a.monthly || []).find(x => x.y === f.target.y && x.m === f.target.m);
    if (!act) return Date.parse(f.made) > Date.now() - 200 * 864e5; // nog niet bekend: bewaren (max ± 6 maanden)
    fcGraded.n++; if (act.v >= f.from.v * 1.1) fcGraded.hit10++; if (act.v >= f.from.v * 1.25) fcGraded.hit25++;
    return false;
  });
  mem.fscore.n += fcGraded.n; mem.fscore.hit10 += fcGraded.hit10; mem.fscore.hit25 += fcGraded.hit25;

  // 6) AI: categorie, wat het is, een idee, en weg met wat geen koopvraag is. Tegelijk: wensen en trending van vandaag.
  const wishWithVol = wishList.map(w => ({ ...w, volume: ads[cleanKw(w.q)] ? ads[cleanKw(w.q)].volume : 0 }));
  const trendTop = [...trend.slice(0, 20), ...sky.slice(0, 10)];
  let ai = 'off', aiErrors = [], kept = null, extras = null;
  if (token) {
    const parts = []; for (let i = 0; i < rows.length; i += 14) parts.push(rows.slice(i, i + 14));
    const rparts = []; for (let i = 0; i < rise.length; i += 12) rparts.push(rise.slice(i, i + 12));
    const [r2x, rr, ...r1s] = await Promise.allSettled([aiJSON(extrasPrompt(cc, wishWithVol, trendTop, today), token, 6000), Promise.allSettled(rparts.map(p => aiJSON(risePrompt(cc, p, today), token, 2600))), ...parts.map(p => aiJSON(rowsPrompt(cc, p, today), token, 2600))]);
    if (rr.status === 'fulfilled') {
      const rk = new Map();
      rr.value.forEach((x, pi) => { if (x.status === 'fulfilled' && x.value && Array.isArray(x.value.r)) for (const a of x.value.r) rk.set(pi * 12 + +a.id, a); else rparts[pi].forEach((_, j) => rk.set(pi * 12 + j + 1, { keep: true })); });
      rise = rise.map((r, i) => { const a = rk.get(i + 1); if (!a || a.keep === false || a.oneoff) return null; return { ...r, cat: CAT_IDS.includes(a.cat) ? a.cat : r.cat || r.hint || 'products', topic: a.topic ? String(a.topic).toLowerCase().slice(0, 60) : r.topic || null, what: a.what ? String(a.what).slice(0, 90) : r.what || null, idea: a.idea ? String(a.idea).slice(0, 130) : r.idea || null }; }).filter(Boolean);
    }
    kept = new Map();
    r1s.forEach((r1, pi) => {
      if (r1.status === 'fulfilled' && r1.value && Array.isArray(r1.value.r)) for (const x of r1.value.r) kept.set(pi * 14 + +x.id, x);
      else { aiErrors.push(`${cc} topics ${pi + 1}: ${r1.reason ? String(r1.reason.message || r1.reason).slice(0, 100) : 'no list'}`); parts[pi].forEach((_, j) => kept.set(pi * 14 + j + 1, { keep: true })); }
    });
    if (r1s.some(r => r.status === 'fulfilled' && r.value && Array.isArray(r.value.r))) ai = 'on'; else kept = null;
    if (r2x.status === 'fulfilled' && r2x.value) extras = r2x.value; else aiErrors.push(`${cc} extras: ${r2x.reason ? String(r2x.reason.message || r2x.reason).slice(0, 100) : 'no answer'}`);
  }
  const dropped = [], keptNames = [];
  rows = rows.map((r, i) => {
    const a = kept && kept.get(i + 1);
    if (kept && (!a || a.keep === false)) { if (a) dropped.push(r.name); return null; }
    keptNames.push(r.name);
    const cat = a && CAT_IDS.includes(a.cat) ? a.cat : r.hint || 'products';
    return { ...r, cat, topic: a && a.topic ? String(a.topic).toLowerCase().slice(0, 60) : null, what: a && a.what ? String(a.what).slice(0, 90) : null, idea: a && a.idea ? String(a.idea).slice(0, 130) : null, unexpected: !!(a && a.unexpected), why: a && a.why ? String(a.why).slice(0, 90) : null };
  }).filter(Boolean);
  if (kept) learnNoise(mem, dropped, keptNames);

  // Zelfde onderwerp of dezelfde cijfers → één regel.
  const merged = [], byTopic = new Map(), bySig = new Map();
  for (const r of rows) {
    const sig = r.series.map(x => x.v).join(','), seen = (r.topic && byTopic.get(r.topic)) || bySig.get(sig);
    if (seen) { const have = new Set(seen.members.map(m => m.k)); for (const k of [r.name, ...r.members.map(m => m.k)]) if (!have.has(k)) { have.add(k); seen.members.push({ k }); } seen.members = seen.members.slice(0, 8); seen.where = [...new Set([...seen.where, ...r.where])]; seen.srcs = [...new Set([...seen.srcs, ...r.srcs])]; continue; }
    merged.push(r); if (r.topic) byTopic.set(r.topic, r); bySig.set(sig, r);
  }
  for (const r of merged) {
    const nm = r.now ? NOW_MULT[r.now.status] ?? 0.8 : 0.8, w = weight(mem, r.cat, r.srcs);
    r.weight = w; r.score = Math.round(r.base * nm * w);
  }

  { const seenT = new Set(); rise = rise.filter(r => { const t = r.topic || r.name; if (seenT.has(t)) return false; seenT.add(t); return true; }).slice(0, 25); }
  for (const r of rise) if (!r.cat) r.cat = r.hint || 'products';
  const have = new Set(mem.fc[cc].map(f => f.k));
  for (const r of rise.slice(0, 20)) if (!have.has(r.name) && r.forecast.peak) mem.fc[cc].push({ k: r.name, made: today, from: r.forecast.from, target: { y: r.forecast.peak.y, m: r.forecast.peak.m, v: r.forecast.peak.v } });
  mem.fc[cc] = mem.fc[cc].slice(-150);

  // Bestaat nog niet: gegroepeerde wensen met hun zoekvolume.
  const missing = ((extras && extras.needs) || []).filter(n => n && n.need && n.exists !== 'yes').map(n => {
    const ws = (n.ids || []).map(i => wishWithVol[+i - 1]).filter(Boolean);
    return { cc, need: String(n.need).slice(0, 100), exists: n.exists === 'partly' ? 'partly' : 'no', gap: n.gap ? String(n.gap).slice(0, 110) : null, idea: n.idea ? String(n.idea).slice(0, 130) : null, cat: CAT_IDS.includes(n.cat) ? n.cat : 'apps', volume: ws.reduce((t, w) => t + (w.volume || 0), 0), searches: ws.map(w => ({ q: w.q, volume: w.volume || 0, url: w.url || null })).slice(0, 5) };
  }).filter(n => n.searches.length).sort((a, b2) => b2.volume - a.volume || b2.searches.length - a.searches.length).slice(0, 15);

  // Onverwacht vandaag: trending met een koop-invalshoek.
  const todayList = ((extras && extras.today) || []).map(t => { const s = trendTop[+t.id - 1]; return s && t.angle && !/^(unknown|null|undefined)$/i.test(s.name) ? { cc, name: s.name, traffic: s.traffic, volume: s.volume, news: s.news && s.news.url ? { title: s.news.title, url: s.news.url, source: s.news.source } : null, angle: String(t.angle).slice(0, 90), cat: CAT_IDS.includes(t.cat) ? t.cat : 'products', idea: t.idea ? String(t.idea).slice(0, 130) : null } : null; }).filter(Boolean);

  // Komt eraan: wat deden dezelfde zoektermen vorig jaar rond dit moment?
  const nowM = new Date(`${today}T00:00:00Z`);
  const comingOut = coming.map(m => {
    const mDate = new Date(`${m.date}T00:00:00Z`);
    const lyNow = new Date(Date.UTC(nowM.getUTCFullYear() - 1, nowM.getUTCMonth(), 1));
    const peakMonths = [new Date(Date.UTC(mDate.getUTCFullYear() - 1, mDate.getUTCMonth() - (mDate.getUTCDate() <= 10 ? 1 : 0), 1)), new Date(Date.UTC(mDate.getUTCFullYear() - 1, mDate.getUTCMonth(), 1))];
    const at = (series, d) => { const x = (series || []).find(s => s.y === d.getUTCFullYear() && s.m === d.getUTCMonth() + 1); return x ? x.v : null; };
    const terms = m.terms.map(k => { const a = ads[cleanKw(k)]; if (!a) return null; const now = at(a.monthly, lyNow), peak = Math.max(...peakMonths.map(d => at(a.monthly, d) || 0)); return now != null && peak ? { k, now, peak, rise: now > 0 ? Math.round((peak / now - 1) * 100) : null, cpc: a.cpc } : null; }).filter(Boolean);
    const now = terms.reduce((t, x) => t + x.now, 0), peak = terms.reduce((t, x) => t + x.peak, 0);
    return { cc, id: m.id, name: m.name, kind: m.kind, date: m.date, days: m.days, opensIn: m.opensIn, status: m.status, ideas: m.ideas.slice(0, 4), terms, lastYear: { now, peak, rise: now > 0 ? Math.round((peak / now - 1) * 100) : null, peakMonth: peakMonths[1].getUTCMonth() + 1 } };
  });

  return { items: merged, rise, fcGraded, missing, today: todayList, coming: comingOut, ai, aiErrors, notes, nowBy, wishCount: wishList.length, trendCount: trend.length };
}

export async function buildDemand({ countries = Object.keys(COUNTRIES), aiToken = '', store = getStore(), day = null } = {}) {
  const t0 = Date.now(), today = day || today0();
  if (!dfsReady()) return { generatedAt: new Date().toISOString(), ready: false, views: VIEWS, items: [], missing: [], today: [], coming: [], charts: {} };
  const mem = await loadMemory(store);
  const b = budget(+(process.env.DFS_MAX_DEMAND || 3));
  const token = aiToken || (process.env.ANTHROPIC_API_KEY ? 'direct' : '');

  // Komende momenten (± 100 dagen) per land, met zoektermen in de eigen taal.
  const moments = upcoming(new Date(`${today}T00:00:00Z`), 100).flatMap(m => m.markets.filter(x => countries.includes(x)).map(cc => ({ ...m, cc, key: `${cc}|${m.id}` })));
  const coming = await comingTerms(moments, mem, token);

  const learned = noiseSet(mem);
  const [out, ol, ...charts] = await Promise.all([
    Promise.all(countries.map(cc => country(cc, { b, mem, today, token, learned, coming }).catch(e => ({ items: [], missing: [], today: [], coming: [], ai: 'off', aiErrors: [], notes: [`${cc}: ${String(e.message || e).slice(0, 120)}`], nowBy: new Map(), rise: [] })))),
    openLibrary().catch(() => []),
    ...countries.flatMap(cc => [apple('books', cc).then(x => ['books', cc, x]).catch(() => null), apple('apps', cc).then(x => ['apps', cc, x]).catch(() => null)]),
  ]);

  // Leren: gisteren nakijken, vandaag onthouden, morgen nakijken.
  const nowBy = new Map(out.flatMap(o => [...(o.nowBy || new Map())]));
  const graded = grade(mem, nowBy, today);
  const items = out.flatMap(o => o.items);
  remember(mem, items, today);
  setPicks(mem, items, today);

  const chartOut = { books: [], apps: [] };
  if (ol.length) chartOut.books.push({ cc: 'WW', source: 'Open Library', label: 'Trending today on Open Library', list: chartNews(mem, 'ol', ol.map(x => x.title), today).map((x, i) => ({ ...ol[i], isNew: x.isNew })) });
  for (const c of charts.filter(Boolean)) {
    const [kind, cc, list] = c; if (!list.length) continue;
    const marks = chartNews(mem, `apple-${kind}-${cc}`, list.map(x => x.title), today);
    chartOut[kind].push({ cc, source: 'Apple', label: kind === 'books' ? 'Apple Books top paid' : 'App Store top free', list: list.map((x, i) => ({ ...x, isNew: marks[i].isNew })) });
  }

  const periods = items.map(r => r.period).sort();
  const stats = { items: items.length, missing: out.reduce((t, o) => t + o.missing.length, 0), graded, spent: r2(b.spent) };
  closeDay(mem, today, stats);
  let saved = false;
  if (store) { try { await saveMemory(store, mem); saved = true; } catch {} }

  const rise = out.flatMap(o => o.rise || []).sort((a, b2) => b2.forecast.extra - a.forecast.extra);
  const count = id => id === 'rise' ? rise.length : id === 'now' ? items.length : id === 'unexpected' ? items.filter(i => i.unexpected).length + out.reduce((t, o) => t + o.today.length, 0) : id === 'missing' ? stats.missing : id === 'coming' ? out.reduce((t, o) => t + o.coming.length, 0) : items.filter(i => i.cat === id).length;
  return {
    generatedAt: new Date().toISOString(), ms: Date.now() - t0, ready: true, day: today, period: periods.length ? periods[periods.length - 1] : null,
    spent: r2(b.spent), calls: b.calls, errors: b.errors.slice(0, 5), notes: [...new Set(out.flatMap(o => o.notes || []))].slice(0, 5),
    ai: out.every(o => o.ai === 'on') ? 'on' : out.some(o => o.ai === 'on') ? 'partial' : 'off', aiErrors: out.flatMap(o => o.aiErrors || []).slice(0, 6),
    views: VIEWS.map(v => ({ ...v, n: count(v.id) })),
    learning: { ...learningSummary(mem), saved, today: graded },
    forecast: { backtest: BACKTEST, live: mem.fscore || { n: 0, hit10: 0, hit25: 0 }, open: Object.values(mem.fc || {}).reduce((t, a) => t + a.length, 0) },
    rise,
    sources: { wishes: out.reduce((t, o) => t + (o.wishCount || 0), 0), trending: out.reduce((t, o) => t + (o.trendCount || 0), 0) },
    items: items.sort((a, b2) => b2.score - a.score),
    missing: out.flatMap(o => o.missing), today: out.flatMap(o => o.today), coming: out.flatMap(o => o.coming).sort((a, b2) => a.days - b2.days),
    charts: chartOut,
  };
}

export const worthKeepingDemand = d => !!(d && d.ready && d.items && d.items.length > 0);
