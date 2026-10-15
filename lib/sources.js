// Extra bronnen (allemaal gratis, zonder sleutel): Google- en YouTube-zoeksuggesties, Amazon-zoeksuggesties,
// Reddit, Hacker News, Google News, weer (NASA POWER + MET Norway), steden (OpenStreetMap), officiële feestdagen (Nager.Date),
// App Store- en Apple Books-hitlijsten. Elke bron mag falen; de rest werkt dan gewoon door.
import { get, pool, ent, DAY, r2 } from './core.js';

const r1 = x => (x == null || !isFinite(x) ? null : Math.round(x * 10) / 10);
const mom = w => r2((w[3] + 1) / ((w[0] + w[1] + w[2]) / 3 + 1));
const weekly = (times, now = Date.now()) => { const w = [0, 0, 0, 0]; for (const t of times) { const k = Math.floor((now - t) / (7 * DAY)); if (k >= 0 && k < 4) w[3 - k]++; } return w; };

// ---------- Zoeksuggesties: wat mensen echt intypen ----------
const HL = { NL: ['nl', 'nl'], US: ['en', 'us'], DE: ['de', 'de'], WW: ['en', 'us'] };
export async function suggest(q, mk, ds = '') {
  const [hl, gl] = HL[mk];
  const j = await get(`https://suggestqueries.google.com/complete/search?client=firefox&oe=utf-8&ie=utf-8&hl=${hl}&gl=${gl}${ds ? `&ds=${ds}` : ''}&q=${encodeURIComponent(q)}`, { timeout: 6000 });
  return (Array.isArray(j) && Array.isArray(j[1]) ? j[1] : []).filter(s => String(s).toLowerCase() !== q.toLowerCase()).slice(0, 10);
}
const AMZ = { US: ['completion.amazon.com', 'ATVPDKIKX0DER', 'en_US'], WW: ['completion.amazon.com', 'ATVPDKIKX0DER', 'en_US'], DE: ['completion.amazon.de', 'A1PA6795UKMFR9', 'de_DE'], NL: ['completion.amazon.nl', 'A1805IZSGTT6HS', 'nl_NL'] };
export async function amazonSuggest(q, mk) {
  const [host, mid, lop] = AMZ[mk];
  const j = await get(`https://${host}/api/2017/suggestions?limit=11&prefix=${encodeURIComponent(q)}&suggestion-type=KEYWORD&page-type=Gateway&alias=aps&site-variant=desktop&version=3&lop=${lop}&mid=${mid}`, { timeout: 6000 });
  return (j.suggestions || []).map(s => s.value).filter(Boolean).slice(0, 10);
}

// ---------- Gesprekken ----------
export async function reddit(q) {
  const j = await get(`https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&t=month&limit=100&raw_json=1`, { timeout: 8000 });
  const posts = (j.data?.children || []).map(c => c.data).filter(Boolean);
  const subs = {};
  for (const p of posts) subs[p.subreddit_name_prefixed] = (subs[p.subreddit_name_prefixed] || 0) + 1;
  const weeks = weekly(posts.map(p => p.created_utc * 1000));
  return {
    total: posts.length, capped: posts.length >= 100, weeks, momentum: mom(weeks),
    subs: Object.entries(subs).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, n]) => `${s} (${n})`),
    top: [...posts].sort((a, b) => b.score + b.num_comments - a.score - a.num_comments).slice(0, 4).map(p => ({ title: p.title, url: `https://www.reddit.com${p.permalink}`, source: p.subreddit_name_prefixed })),
  };
}
export async function hackernews(q) {
  const since = Math.floor(Date.now() / 1000) - 28 * 86400;
  const j = await get(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=100&numericFilters=created_at_i>${since}`, { timeout: 8000 });
  const hits = j.hits || [];
  const weeks = weekly(hits.map(h => h.created_at_i * 1000));
  return { total: hits.length, weeks, momentum: mom(weeks), top: [...hits].sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 4).map(h => ({ title: h.title, url: `https://news.ycombinator.com/item?id=${h.objectID}`, source: 'Hacker News' })) };
}

// ---------- Google News (aantallen per week; link naar de uitgever, nooit een Google-doorverwijzing) ----------
const GN = { NL: 'hl=nl&gl=NL&ceid=NL:nl', US: 'hl=en-US&gl=US&ceid=US:en', DE: 'hl=de&gl=DE&ceid=DE:de', WW: 'hl=en-US&gl=US&ceid=US:en' };
export async function googleNews(q, mk) {
  const x = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:28d`)}&${GN[mk]}`, { text: true, timeout: 8000 });
  const items = [...String(x).matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const b = m[1], src = b.match(/<source url="([^"]*)">([\s\S]*?)<\/source>/);
    return { title: ent((b.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').replace(/ - [^-]+$/, ''), source: src ? ent(src[2]) : '', url: src ? ent(src[1]) : null, t: Date.parse((b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '') };
  });
  const weeks = weekly(items.map(i => i.t));
  return { total: items.length, capped: items.length >= 100, weeks, momentum: mom(weeks), top: items.slice(0, 5).map(i => ({ title: i.title, url: i.url, source: i.source })) };
}

// ---------- Weer: vraag naar kachels, ventilatoren, sneeuwkettingen volgt het weer ----------
export const CITIES = [['NL', 'Amsterdam', 52.37, 4.9], ['DE', 'Berlin', 52.52, 13.41], ['US', 'New York', 40.71, -74.01], ['US', 'Chicago', 41.88, -87.63]];
export async function weather([mk, city, lat, lon]) {
  // Afgelopen week gemeten (NASA POWER, publieke data) en de komende ± 9 dagen (MET Norway, CC BY 4.0) — beide commercieel toegestaan.
  const ymd = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
  const [p, f] = await Promise.all([
    get(`https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX&community=RE&longitude=${lon}&latitude=${lat}&start=${ymd(12)}&end=${ymd(0)}&format=JSON`, { timeout: 15000 }).catch(() => null),
    get(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`, { timeout: 12000 }), // UA met contact (vereist door MET Norway)
  ]);
  const pastMax = Object.values((p && p.properties && p.properties.parameter && p.properties.parameter.T2M_MAX) || {}).filter(v => v > -999).slice(-7);
  const byDay = {};
  for (const x of (f && f.properties && f.properties.timeseries) || []) {
    const d = x.time.slice(0, 10), T = x.data.instant.details.air_temperature, o = (byDay[d] = byDay[d] || { t: [], r: 0, snow: 0 });
    if (T != null) o.t.push(T);
    const nx = x.data.next_1_hours || x.data.next_6_hours, pr = nx && nx.details && nx.details.precipitation_amount;
    if (pr != null && (x.data.next_1_hours || !o.has1)) { o.r += pr; if (T != null && T <= 0) o.snow += pr; } // neerslag bij vorst ≈ sneeuw (1 mm ≈ 1 cm)
    if (x.data.next_1_hours) o.has1 = true;
  }
  const dd = Object.keys(byDay).sort().filter(k => byDay[k].t.length >= 4).slice(1); // vandaag (onvolledig) overslaan
  const d = { time: dd, temperature_2m_max: dd.map(k => Math.max(...byDay[k].t)), temperature_2m_min: dd.map(k => Math.min(...byDay[k].t)), precipitation_sum: dd.map(k => byDay[k].r), snowfall_sum: dd.map(k => byDay[k].snow) }, n = d.time.length;
  const avg = (a, s, e) => { const x = a.slice(s, e).filter(v => v != null); return x.length ? x.reduce((p, c) => p + c, 0) / x.length : null; };
  const sum = (a, s, e) => a.slice(s, e).reduce((p, c) => p + (c || 0), 0);
  const past = pastMax.length ? pastMax.reduce((a, b) => a + b, 0) / pastMax.length : null, next = avg(d.temperature_2m_max, 0, 7), later = avg(d.temperature_2m_max, 7, n);
  const minLow = Math.min(...d.temperature_2m_min.filter(v => v != null));
  const rain = sum(d.precipitation_sum, 0, 7), snow = sum(d.snowfall_sum, 0, n);
  const T = [];
  if (past != null && next - past <= -4) T.push({ name: `Cold snap: ${Math.round(past - next)}°C colder next week`, ideas: ['Heaters', 'Electric blankets', 'Thermal wear', 'Hot water bottles'] });
  if (minLow <= -2) T.push({ name: `Frost ahead, down to ${Math.round(minLow)}°C`, ideas: mk === 'DE' ? ['Ice scrapers', 'Winter tyres', 'Snow chains', 'De-icer'] : ['Ice scrapers', 'De-icer', 'Thermal gloves', mk === 'NL' ? 'Ice skates' : 'Snow boots'] });
  if (snow >= 1) T.push({ name: `Snow forecast, about ${Math.round(snow)} cm`, ideas: ['Snow shovels', 'Sleds', 'Snow boots', 'Snow blowers'] });
  if (next >= 27) T.push({ name: `Heat ahead, around ${Math.round(next)}°C`, ideas: ['Fans', 'Portable air conditioners', 'Paddling pools', 'Sunscreen'] });
  else if (past != null && next - past >= 5 && next >= 18) T.push({ name: `Warm spell: ${Math.round(next - past)}°C warmer next week`, ideas: ['Barbecues', 'Garden furniture', 'Outdoor toys'] });
  if (rain >= 30) T.push({ name: `Wet week, about ${Math.round(rain)} mm of rain`, ideas: ['Rain jackets', 'Umbrellas', 'Dehumidifiers'] });
  return { market: mk, city, past: r1(past), next: r1(next), later: r1(later), minLow: r1(minLow), rain: Math.round(rain), snow: Math.round(snow), triggers: T, days: d.time.map((t, i) => ({ d: t, max: d.temperature_2m_max[i], min: d.temperature_2m_min[i] })) };
}

// ---------- Officiële feestdagen (vrije dagen = uitjes, klussen, reizen) ----------
export async function holidays(today = new Date()) {
  const y = today.getUTCFullYear();
  const jobs = [];
  for (const c of ['NL', 'DE', 'US']) for (const yr of [y, y + 1]) jobs.push([c, yr]);
  const res = await pool(jobs, 6, async ([c, yr]) => (await get(`https://date.nager.at/api/v3/PublicHolidays/${yr}/${c}`)).filter(h => h.global !== false).map(h => ({ market: c, date: h.date, name: h.name })));
  return res.filter(Boolean).flat();
}

// ---------- Hitlijsten: App Store (gratis apps) en Apple Books (betaalde boeken) ----------
export async function appleCharts() {
  const jobs = [];
  for (const c of ['nl', 'us', 'de']) { jobs.push(['apps', c, `https://rss.applemarketingtools.com/api/v2/${c}/apps/top-free/10/apps.json`]); jobs.push(['books', c, `https://rss.applemarketingtools.com/api/v2/${c}/books/top-paid/10/books.json`]); }
  const res = await pool(jobs, 6, async ([kind, c, url]) => ({ kind, geo: c.toUpperCase(), items: ((await get(url)).feed?.results || []).map((r, i) => ({ rank: i + 1, name: r.name, artist: r.artistName, url: r.url, genre: r.genres?.[0]?.name || '' })) }));
  return res.filter(x => x && x.items.length);
}

// ---------- Hyperlokaal: een idee checken in één stad ----------
const CC = { NL: 'NL', DE: 'DE', US: 'US' };
export async function geocode(city, mk) {
  // OpenStreetMap Nominatim (ODbL, commercieel toegestaan met bronvermelding; max 1 verzoek per seconde — alleen bij een stad-check).
  const lang = { NL: 'nl', DE: 'de' }[mk] || 'en';
  const all = await get(`https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}${CC[mk] ? `&countrycodes=${CC[mk].toLowerCase()}` : ''}&format=jsonv2&addressdetails=1&extratags=1&limit=8&accept-language=${lang}`, { timeout: 8000 });
  const pop = r => +String((r.extratags && r.extratags.population) || '').replace(/[^0-9]/g, '') || 0;
  const x = (all || []).filter(r => ['city', 'town', 'village', 'municipality', 'administrative'].includes(r.addresstype || r.type)).sort((a, b) => pop(b) - pop(a))[0] || (all || [])[0];
  if (!x) return null;
  const a = x.address || {};
  return { name: a.city || a.town || a.village || a.municipality || x.name, region: a.state || a.province || '', country: (a.country_code || '').toUpperCase(), lat: +x.lat, lon: +x.lon, population: pop(x) || null };
}
// Bestaand aanbod in de stad (OpenStreetMap): hoeveel plekken passen bij het idee, binnen ~9 km van het centrum.
export async function places(q, p) {
  const box = [p.lon - 0.12, p.lat + 0.08, p.lon + 0.12, p.lat - 0.08].map(v => v.toFixed(4)).join(',');
  const j = await get(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=40&countrycodes=${String(p.country).toLowerCase()}&viewbox=${box}&bounded=1&q=${encodeURIComponent(q)}`, { timeout: 8000 });
  return (Array.isArray(j) ? j : []).map(x => ({ name: x.name || String(x.display_name || '').split(',')[0], type: String(x.type || '').replace(/_/g, ' '), url: `https://www.openstreetmap.org/${x.osm_type}/${x.osm_id}` }));
}
export async function local(q, city, mk) {
  const place = await geocode(city, mk);
  if (!place) return { error: `Could not find the city "${city}".` };
  const s = pr => pr.catch(() => null);
  const term = `${q} ${place.name}`;
  const [sg, gn, rd, pl, wx] = await Promise.all([s(suggest(term, mk)), s(googleNews(term, mk)), s(reddit(term)), s(places(q, place)), s(weather([mk, place.name, place.lat, place.lon]))]);
  const n = pl ? pl.length : null;
  const per10k = n != null && place.population ? r1((n / place.population) * 1e4) : null;
  const searched = (sg || []).length;
  let verdict;
  if (searched >= 3 && n != null && n <= 2) verdict = 'People search for this together with the city name, and there is little on offer locally. Looks like a gap.';
  else if (searched >= 3) verdict = 'Proven local demand: people search for it with the city name. There is local competition, so you need a sharper offer.';
  else if (n === 0) verdict = 'Hardly any local searches yet and no local competitors found. Test cheaply before you invest.';
  else verdict = 'Weak local signal. Demand for this is mostly regional or national.';
  return { place, verdict, suggestions: sg || [], news: gn, reddit: rd, competitors: pl && { count: n, capped: n >= 40, per10k, top: pl.slice(0, 10) }, weather: wx };
}

// ---------- Aanbod: wie biedt het al aan? ----------
// App Store (iTunes Search API, gratis): apps die het al aanbieden, met aantal beoordelingen (= bewezen vraag) en talen.
const LANG2 = { NL: 'NL', DE: 'DE', US: 'EN', WW: 'EN' };
export async function appStore(term, cc) {
  const j = await get(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${cc === 'WW' ? 'us' : cc.toLowerCase()}&entity=software&limit=25`, { timeout: 8000 });
  const apps = (j.results || []).map(a => ({ name: a.trackName, seller: a.sellerName, ratings: a.userRatingCount || 0, rating: a.averageUserRating ? Math.round(a.averageUserRating * 10) / 10 : null, price: a.price || 0, updated: String(a.currentVersionReleaseDate || '').slice(0, 10), local: (a.languageCodesISO2A || []).includes(LANG2[cc]), url: a.trackViewUrl }));
  return { count: apps.length, ratings: apps.reduce((t, a) => t + Math.max(0, a.ratings), 0), local: apps.filter(a => a.local).length, paid: apps.filter(a => a.price > 0).length, top: [...apps].sort((a, b) => b.ratings - a.ratings).slice(0, 5) };
}
// Google Books (gratis): hoeveel boeken er al over zijn, en hoeveel van de laatste twee jaar.
const BLANG = { NL: 'nl', DE: 'de', US: 'en', WW: 'en' };
export async function books(term, cc) {
  const j = await get(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(term)}&langRestrict=${BLANG[cc]}&maxResults=20&orderBy=relevance&printType=books`, { timeout: 8000 });
  const items = j.items || [];
  const y = new Date().getUTCFullYear();
  return { total: j.totalItems || 0, recent: items.filter(b => +String(b.volumeInfo?.publishedDate || '').slice(0, 4) >= y - 2).length, top: items.slice(0, 3).map(b => ({ title: b.volumeInfo?.title, year: String(b.volumeInfo?.publishedDate || '').slice(0, 4), url: b.volumeInfo?.infoLink })) };
}
