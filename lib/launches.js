// Lanceringen die vraag geven (18 okt 2026): releasedata van films, games, consoles, telefoons en automodellen uit Wikidata
// (gratis, CC0, wereldwijd). Alleen bekende titels (veel Wikipedia-talen) met een datum op de dag of maand nauwkeurig.
// AI houdt alleen over waar mensen vooraf of erna iets voor kopen, boeken of zoeken, met 2-4 ideeën. Eén keer per week per land.
import { getJSON, putJSON } from './store.js';
import { ask, parseJSON } from './ai.js';

const TYPES = { Q11424: 'film', Q7889: 'video game', Q8076: 'game console', Q19723451: 'smartphone model', Q3231690: 'car model', Q5398426: 'TV series' };
const UA = 'DemandRadar/1.0 (https://demandradar-ivory.vercel.app; henkjan@adsfair.xyz)';

export async function wikidataLaunches(today, days = 120, minLinks = 12) {
  const end = new Date(Date.parse(today) + days * 864e5).toISOString().slice(0, 10);
  const q = `SELECT ?item ?itemLabel ?date ?prec ?type ?links ?art WHERE {
  VALUES ?type { ${Object.keys(TYPES).map(t => 'wd:' + t).join(' ')} }
  ?item wdt:P31 ?type; wikibase:sitelinks ?links; p:P577/psv:P577 [ wikibase:timeValue ?date; wikibase:timePrecision ?prec ].
  FILTER(?links >= ${minLinks} && ?prec >= 10 && ?date >= "${today}T00:00:00Z"^^xsd:dateTime && ?date < "${end}T00:00:00Z"^^xsd:dateTime)
  OPTIONAL { ?art schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY DESC(?links) LIMIT 120`;
  const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { 'user-agent': UA, accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`Wikidata ${r.status}`);
  const j = await r.json(), seen = new Map();
  for (const b of (j.results && j.results.bindings) || []) {
    const id = b.item.value.split('/').pop(), name = b.itemLabel && b.itemLabel.value; if (!name || /^Q\d+$/.test(name)) continue;
    const date = b.date.value.slice(0, 10), prec = +b.prec.value, o = seen.get(id);
    if (o && o.date <= date) continue; // vroegste release telt
    seen.set(id, { id, name, date: prec === 10 ? date.slice(0, 7) + '-01' : date, month: prec === 10, type: TYPES[b.type.value.split('/').pop()] || 'release', links: +b.links.value, url: b.art ? b.art.value : `https://www.wikidata.org/wiki/${id}` });
  }
  return [...seen.values()].sort((a, b) => b.links - a.links);
}

export async function launchMoments(cc, { token, store, today, force = false }) {
  const path = `launches/${cc}.json`;
  const c = store && await getJSON(store, path, null).catch(() => null);
  if (!force && c && Date.parse(today) - Date.parse(c.day) < 7 * 864e5) return c.items;
  if (!token) return c ? c.items : [];
  // één Wikidata-lijst per week voor alle landen
  let L = store && await getJSON(store, 'launches/all.json', null).catch(() => null);
  if (force || !L || Date.parse(today) - Date.parse(L.day) >= 7 * 864e5) { L = { day: today, items: await wikidataLaunches(today).catch(() => []) }; if (store && L.items.length) await putJSON(store, 'launches/all.json', L).catch(() => {}); }
  const cand = (L.items || []).slice(0, 60);
  if (!cand.length) return c ? c.items : [];
  const prompt = `Country: ${cc}. Today: ${today}. Upcoming releases (from Wikidata, with how many Wikipedia languages cover them as a sign of fame):
${cand.map((x, i) => `${i + 1}. ${x.name} (${x.type}, ${x.month ? 'month ' + x.date.slice(0, 7) : x.date}, ${x.links} languages)`).join('\n')}

Keep only the releases that will make many people in ${cc} buy, book, pre-order or search for something around the date (the product itself, tickets, merchandise, accessories, costumes, gift ideas). Skip niche titles and releases not available in ${cc}.
For each: "n" (its number), "ideas" (2-4 things people will want, plain English), "lead" (days before the date that demand starts, 7-90).
JSON only: {"r":[{"n":1,"ideas":["..."],"lead":30}]}`;
  let items = [];
  try {
    const j = parseJSON(await ask({ system: 'You pick which product, film and game releases drive consumer demand in a country. Be selective. JSON only.', prompt, maxTokens: 2000, token, timeoutMs: 60000 }));
    items = ((j && j.r) || []).map(x => ({ x, s: cand[+x.n - 1] })).filter(({ s }) => s).slice(0, 15).map(({ x, s }) => ({
      id: `launch-${s.id}`, kind: 'launch', name: `${s.name} release`, date: s.date, month: s.month, lead: Math.max(7, Math.min(90, +x.lead || 30)), markets: [cc], direction: 'more',
      ideas: (x.ideas || []).map(String).slice(0, 4), launchType: s.type, sources: [{ title: s.name, source: 'Wikidata / Wikipedia', site: s.url }] }));
  } catch { return c ? c.items : []; }
  if (store) await putJSON(store, path, { day: today, items }).catch(() => {});
  return items;
}
