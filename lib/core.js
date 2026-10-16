// Demand Radar — kern: data ophalen bij gratis open bronnen en rekenen.
// Bronnen: Wikipedia-paginaweergaven (dagelijks, 400+ dagen historie), Google Trends trending-RSS (elk uur),
// GDELT wereldnieuws (elke 15 min). Alles zonder API-sleutel.
import { upcoming } from './calendar.js';
import { WATCH } from './watchlist.js';
import { ask, parseJSON } from './ai.js';
import { suggest, amazonSuggest, reddit, hackernews, googleNews, weather, holidays, appleCharts, local, CITIES } from './sources.js';

export const UA = 'DemandRadar/1.0 (+https://github.com/henkjandekrijger-glitch/demand_radar; henkjan@adsfair.xyz)';
export const DAY = 864e5;

export const MARKETS = {
  NL: { wiki: 'nl', geo: 'NL', lang: 'dutch', name: 'Netherlands' },
  US: { wiki: 'en', geo: 'US', lang: 'english', name: 'United States' },
  DE: { wiki: 'de', geo: 'DE', lang: 'german', name: 'Germany' },
  WW: { wiki: 'en', geo: null, lang: 'english', name: 'Worldwide' },
};

let fetchImpl = (...a) => fetch(...a);
export function setFetch(f) { fetchImpl = f; }

export async function get(url, { text = false, timeout = 9000 } = {}) {
  const r = await fetchImpl(url, { headers: { 'user-agent': UA, accept: text ? '*/*' : 'application/json' }, signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return text ? r.text() : r.json();
}

export async function postJSON(url, body, { headers = {}, timeout = 30000 } = {}) {
  const r = await fetchImpl(url, { method: 'POST', headers: { 'user-agent': UA, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return j;
}

// Eén keer opnieuw proberen bij een tijdelijke fout (429/5xx/time-out).
export async function retry(fn, tries = 2, wait = 800) {
  let err;
  for (let i = 0; i < tries; i++) { try { return await fn(); } catch (e) { err = e; if (!/HTTP (429|5\d\d)|timeout|aborted|fetch failed/i.test(String(e.message || e))) break; await new Promise(r => setTimeout(r, wait * (i + 1))); } }
  throw err;
}

export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch { out[k] = null; } } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
export const iso = d => d.toISOString().slice(0, 10);
export const utcDay = (t = Date.now()) => { const d = new Date(t); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };
export const r2 = x => Math.round(x * 100) / 100;
const clamp = x => Math.max(0, Math.min(100, Math.round(x)));
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const wikiUrl = (lang, title) => `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(title).replace(/ /g, '_'))}`;

// ---------- Wikipedia ----------
export async function wikiFind(lang, q) {
  const j = await get(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&srprop=&format=json&formatversion=2`);
  return j?.query?.search?.[0]?.title || null;
}

// Dagelijkse weergaven (alleen mensen, geen bots), dagen zonder data worden 0. Laatste element = `end`.
export async function wikiSeries(lang, title, days, end = new Date(utcDay().getTime() - DAY)) {
  const start = new Date(end.getTime() - (days - 1) * DAY);
  const t = encodeURIComponent(String(title).replace(/ /g, '_'));
  const j = await get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/all-access/user/${t}/daily/${ymd(start)}00/${ymd(end)}00`);
  const map = new Map((j.items || []).map(x => [String(x.timestamp).slice(0, 8), x.views]));
  const out = [];
  for (let i = 0; i < days; i++) out.push(map.get(ymd(new Date(start.getTime() + i * DAY))) || 0);
  return out;
}

const ratio = (a, b) => (a + 3) / (b + 3);

export function phaseOf(m, o) {
  if (m < 0.85 && o < 1.05) return 'falling';
  if (o >= 1.25 && m < 1.6) return 'early';
  if (m >= 1.15 && o >= 0.95) return 'rising';
  if (m >= 1 && o < 0.9) return 'peak';
  if (m >= 1.15) return 'rising';
  if (o < 0.8) return 'falling';
  return 'steady';
}

// s = dagreeks (≥ 430 dagen), laatste element = gisteren.
export function metrics(s) {
  const n = s.length;
  const avg = (a, b) => { a = Math.max(0, a); b = Math.min(n, b); let t = 0; for (let i = a; i < b; i++) t += s[i]; return b > a ? t / (b - a) : 0; };
  const ly = n - 365; // zelfde dag vorig jaar
  const last3 = avg(n - 3, n), last7 = avg(n - 7, n), prev28 = avg(n - 35, n - 7), last28 = avg(n - 28, n);
  const lyBack = avg(ly - 28, ly), lyNext = avg(ly, ly + 42);
  const momentum = ratio(last7, prev28), spike = ratio(last3, prev28), yoy = ratio(last28, lyBack), outlook = ratio(lyNext, lyBack);
  let peak = 0, pv = -1;
  for (let i = ly; i < Math.min(n, ly + 150); i++) if (s[i] > pv) { pv = s[i]; peak = i - ly; }
  const weeks = [];
  for (let w = 26; w >= 1; w--) weeks.push(Math.round(avg(n - w * 7, n - (w - 1) * 7)));
  const lyW = [];
  for (let w = 0; w <= 8; w++) lyW.push(avg(ly - 7 + w * 7, ly + w * 7));
  const base = weeks[weeks.length - 1];
  const proj = lyW.slice(1).map(v => Math.round(base * ((v + 3) / (lyW[0] + 3))));
  const phase = phaseOf(momentum, outlook);
  const score = clamp(50 + 28 * Math.log2(momentum) + 22 * Math.log2(outlook) + 8 * Math.log2(yoy));
  return { daily: Math.round(last28), momentum: r2(momentum), spike: r2(spike), yoy: r2(yoy), outlook: r2(outlook), peakInDays: peak, phase, score, weeks, proj };
}

export async function buildWatch(list = WATCH) {
  const items = [];
  for (const [mk, arr] of Object.entries(list)) for (const [q, cat] of arr) items.push({ mk, q, cat });
  const res = await pool(items, 16, async it => {
    const lang = MARKETS[it.mk].wiki;
    const title = await wikiFind(lang, it.q);
    if (!title) return null;
    const m = metrics(await wikiSeries(lang, title, 430));
    if (m.daily < 3) return null;
    return { market: it.mk, name: it.q, article: title, cat: it.cat, url: wikiUrl(lang, title), ...m };
  });
  return res.filter(Boolean);
}

const MAIN = new Set(['Main_Page', 'Hoofdpagina', '-']);
const ADULT = /porn|xxx|xhamster|xvideos|onlyfans|sexual|^sex/i;

export async function wikiSpikes(lang, min) {
  let top = null, day = null;
  for (const back of [1, 2, 3]) {
    day = new Date(utcDay().getTime() - back * DAY);
    const [y, mo, d] = iso(day).split('-');
    try { top = await get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${lang}.wikipedia/all-access/${y}/${mo}/${d}`); break; } catch { top = null; }
  }
  if (!top) return { day: null, items: [] };
  const arts = (top.items?.[0]?.articles || []).filter(a => !a.article.includes(':') && !MAIN.has(a.article) && !ADULT.test(a.article)).slice(0, 45);
  const res = await pool(arts, 10, async a => {
    const s = await wikiSeries(lang, a.article, 30, day);
    const v = s[s.length - 1], base = median(s.slice(0, -1));
    return { name: a.article.replace(/_/g, ' '), views: v, base: Math.round(base), ratio: Math.round(((v + 50) / (base + 50)) * 10) / 10, url: wikiUrl(lang, a.article), spark: s.slice(-14) };
  });
  return { day: iso(day), items: res.filter(x => x && x.ratio >= 3 && x.views >= min).sort((a, b) => b.ratio - a.ratio).slice(0, 12) };
}

// ---------- Google Trends trending searches (RSS) ----------
export const ent = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&').trim();
export function parseTraffic(t) {
  const m = String(t).replace(/[,\s]/g, '').match(/(\d+(?:\.\d+)?)([KM])?/i);
  if (!m) return 0;
  const u = (m[2] || '').toUpperCase();
  return Math.round(+m[1] * (u === 'M' ? 1e6 : u === 'K' ? 1e3 : 1));
}
export function parseTrends(xml) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const b = m[1];
    const tag = t => { const r = b.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)); return r ? ent(r[1]) : ''; };
    const traffic = tag('ht:approx_traffic');
    return { name: tag('title'), traffic, volume: parseTraffic(traffic), started: tag('pubDate'), news: { title: tag('ht:news_item_title'), url: tag('ht:news_item_url'), source: tag('ht:news_item_source') } };
  }).filter(x => x.name);
}
export async function trends(geo) {
  return parseTrends(await get(`https://trends.google.com/trending/rss?geo=${geo}`, { text: true })).sort((a, b) => b.volume - a.volume);
}

// ---------- GDELT nieuws ----------
const gdate = s => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11) || 0, +s.slice(11, 13) || 0);
export async function news(q, lang) {
  const t = q.trim();
  const term = /\s/.test(t) ? `"${t}"` : t;
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(`${term} sourcelang:${lang}`)}&mode=artlist&maxrecords=75&timespan=4w&sort=datedesc&format=json`;
  let j;
  try { j = JSON.parse(await get(url, { text: true, timeout: 12000 })); } catch { return null; }
  const arts = j.articles || [];
  const now = Date.now(), weeks = [0, 0, 0, 0];
  for (const a of arts) { const k = Math.floor((now - gdate(a.seendate || '')) / (7 * DAY)); if (k >= 0 && k < 4) weeks[3 - k]++; }
  const prev = (weeks[0] + weeks[1] + weeks[2]) / 3;
  return { weeks, total: arts.length, capped: arts.length >= 75, momentum: r2((weeks[3] + 1) / (prev + 1)), top: arts.slice(0, 6).map(a => ({ title: a.title, url: a.url, source: a.domain, date: String(a.seendate || '').slice(0, 8) })) };
}

// ---------- Radar (alles samen) ----------
export async function buildRadar() {
  const t0 = Date.now();
  const [watch, search, attention, wx, hol, charts] = await Promise.all([
    buildWatch().catch(() => []),
    pool(['NL', 'US', 'DE'], 3, async geo => ({ geo, items: (await trends(geo)).slice(0, 15) })),
    pool([['nl', 1500], ['en', 25000], ['de', 6000]], 3, async ([lang, min]) => ({ lang, ...(await wikiSpikes(lang, min)) })),
    pool(CITIES, 4, weather),
    holidays().catch(() => []),
    appleCharts().catch(() => []),
  ]);
  const products = watch.filter(x => x.spike >= 1.6 && x.daily >= 5).sort((a, b) => b.spike - a.spike).slice(0, 20);
  const rising = watch.filter(x => x.phase === 'rising' || (x.momentum >= 1.1 && x.phase !== 'falling' && x.phase !== 'peak')).sort((a, b) => b.score - a.score);
  const seasonal = watch.filter(x => x.outlook >= 1.2).sort((a, b) => b.outlook - a.outlook);
  return {
    generatedAt: new Date().toISOString(), ms: Date.now() - t0,
    spikes: { products, search: search.filter(Boolean), attention: attention.filter(Boolean) },
    upcoming: { calendar: upcoming(new Date(), 120, hol), seasonal, weather: wx.filter(Boolean) },
    charts,
    rising,
    watch: [...watch].sort((a, b) => b.score - a.score),
  };
}

// ---------- Idee checken ----------
const words = s => String(s).toLowerCase().split(/[^a-zà-ÿß0-9]+/).filter(w => w.length >= 4);
const overlap = (a, b) => { const B = words(b); return words(a).some(w => B.some(v => v.includes(w) || w.includes(v))); };
const pct = x => `${x >= 1 ? '+' : ''}${Math.round((x - 1) * 100)}%`;
const inWeeks = d => (d < 14 ? `${d} days` : `${Math.round(d / 7)} weeks`);

export function verdictText(phase, w, nws) {
  if (!w) return nws && nws.total ? 'Too niche for interest data, so this is judged on news coverage only.' : 'Not enough data for this idea. Try a broader or more common term.';
  const peak = w.peakInDays > 3 && w.outlook > 1 ? ` Last year it peaked about ${inWeeks(w.peakInDays)} after this date.` : '';
  switch (phase) {
    case 'early': return `Demand usually rises soon: last year interest grew ${pct(w.outlook)} over the next six weeks.${peak} A good moment to prepare.`;
    case 'rising': return `Interest is climbing now: ${pct(w.momentum)} in the last week compared with the four weeks before.${peak}`;
    case 'peak': return `Interest is at or near its seasonal high. Many buyers have already bought; last year it moved ${pct(w.outlook)} over the next six weeks.`;
    case 'falling': return `Interest is falling (${pct(w.momentum)} week on month). Not the moment to start.`;
    default: return `No clear movement right now (${pct(w.momentum)} week on month, ${pct(w.yoy)} year on year).`;
  }
}

// Wikipedia-zoeken geeft altijd wel een artikel terug, ook als het nergens op slaat ("ai receptionist" → RingCentral,
// "split expenses with friends" → de film Split). Alleen gebruiken als de titel echt over het idee gaat.
const WSTOP = new Set('the a an and or of for with to in on at by from de het een en van voor met der die das und mit für von zu'.split(' '));
const cw = s => String(s).toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-zà-ÿß0-9]+/).filter(w => w.length >= 2 && !WSTOP.has(w));
const same = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, Math.max(4, b.length - 2))) || b.startsWith(a.slice(0, Math.max(4, a.length - 2)))));
export function wikiMatch(q, title) {
  if (/\((film|movie|album|song|single|band|tv series|series|novel|book|video game|game|play|musical|magazine|newspaper|company|software|app|website|rapper|singer|footballer|politician)[^)]*\)/i.test(title)) return false;
  const T = cw(title), Q = cw(q);
  if (!T.length || !Q.length) return false;
  const tIn = T.filter(t => Q.some(x => same(t, x))).length, qIn = Q.filter(x => T.some(t => same(t, x))).length;
  return tIn === T.length && qIn / Q.length >= 0.5;
}

async function wikiFor(q, mk) {
  const langs = [...new Set([MARKETS[mk].wiki, 'en'])];
  for (const lang of langs) {
    const title = await wikiFind(lang, q).catch(() => null);
    if (!title || !wikiMatch(q, title)) continue;
    const m = metrics(await wikiSeries(lang, title, 430));
    if (m.daily < 2 && lang !== 'en') continue;
    return { lang, article: title, url: wikiUrl(lang, title), ...m };
  }
  return null;
}

export async function buildCheck(q, mk, { ai = false, city = '', aiToken = '' } = {}) {
  const M = MARKETS[mk];
  const cityName = String(city || '').trim().slice(0, 60);
  city = CITIES.find(c => c[0] === mk);
  const safe = p => p.catch(() => null);
  const [wiki, nws, tr, gs, yt, amz, rd, hn, gn, wx, loc] = await Promise.all([
    safe(wikiFor(q, mk)), safe(news(q, M.lang)), M.geo ? trends(M.geo).catch(() => null) : Promise.resolve([]),
    safe(suggest(q, mk)), safe(suggest(q, mk, 'yt')), safe(amazonSuggest(q, mk)),
    safe(reddit(q)), safe(hackernews(q)), safe(googleNews(q, mk)), city ? safe(weather(city)) : Promise.resolve(null),
    cityName ? safe(local(q, cityName, mk)) : Promise.resolve(null),
  ]);
  const sources = [['Wikipedia interest', wiki], ['GDELT world news', nws], ['Google trending searches', tr], ['Google suggestions', gs], ['YouTube suggestions', yt], ['Amazon suggestions', amz], ['Reddit', rd], ['Hacker News', hn], ['Google News', gn], ['Weather forecast', wx], ...(cityName ? [['City lookup', loc && !loc.error ? loc : null], ['Local businesses (OpenStreetMap)', loc && loc.competitors]] : [])].map(([name, v]) => ({ name, ok: v != null }));
  const ql = q.toLowerCase();
  const trending = (tr || []).filter(t => { const n = t.name.toLowerCase(); return n.includes(ql) || ql.includes(n) || overlap(n, ql); }).slice(0, 5);
  const calendar = upcoming().filter(e => e.markets.includes(mk) && [e.name, ...e.ideas].some(x => overlap(x, q)));
  let score = wiki ? wiki.score : 50;
  const phase = wiki ? wiki.phase : (nws && nws.total >= 8 ? (nws.momentum >= 1.3 ? 'rising' : nws.momentum < 0.7 ? 'falling' : 'steady') : 'steady');
  if (nws && nws.total >= 8) score += 10 * Math.log2(nws.momentum);
  if (trending.length) score += 10;
  if (gn && gn.total >= 8) score += 6 * Math.log2(gn.momentum);
  if (rd && rd.total >= 10) score += 6 * Math.log2(rd.momentum);
  if (gs && gs.length >= 8) score += 3;
  if (amz && amz.length >= 5) score += 4;
  const res = { q, market: mk, generatedAt: new Date().toISOString(), score: clamp(score), phase, verdict: verdictText(phase, wiki, nws), wiki, news: nws, gnews: gn, reddit: rd, hn, suggest: { google: gs || [], youtube: yt || [], amazon: amz || [] }, trending, calendar, weather: wx, local: loc, sources, ai: null };
  res.measured = await measuredFor(q, mk, gs, loc && !loc.error ? loc : null).catch(() => null);
  if (res.measured && res.measured.budget) { res.budgetReached = true; res.measured = null; }
  res.scoreBasis = 'signals';
  if (!wiki) res.confidence = 'low';
  if (res.measured && (res.measured.volume != null || res.measured.last != null)) { res.score = measuredScore(res.measured, mk); res.scoreBasis = 'measured'; res.confidence = 'high'; }
  // Met echte zoekcijfers bepalen die de fase en de conclusie (Wikipedia is dan alleen een extra signaal).
  const mm = res.measured;
  if (mm && (mm.yoy != null || mm.mom != null)) {
    const y = mm.yoy ?? 0, mo = mm.mom ?? 0, vol = mm.last ?? mm.volume;
    const fc = mm.forecast;
    // Met een voorspelling telt de seizoensbeweging van maand op maand niet als groei; dan beslissen voorspelling en jaargroei.
    res.phase = fc && fc.call === 'rise' ? (mm.label === 'new' ? 'early' : 'rising') : fc && fc.call === 'fall' ? 'falling' : mm.label === 'new' ? 'early' : y >= 25 || (!fc && mo >= 40) ? 'rising' : y <= -20 ? 'falling' : 'steady';
    const NAME = { NL: 'the Netherlands', DE: 'Germany', US: 'the US' }[mk];
    const where = mm.local ? `${mm.local.measured ? '' : 'About '}${Number(mm.local.volume).toLocaleString('en-US')} Google searches a month in ${mm.local.city}${mm.local.measured ? '' : ' (estimate)'} and ${vol != null ? Number(vol).toLocaleString('en-US') : 'some'} in ${NAME}` : `${vol != null ? Number(vol).toLocaleString('en-US') : 'Some'} Google searches a month in ${NAME}`;
    const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fcText = fc && fc.call === 'rise' && fc.peak ? ` Expected to rise to ${Number(fc.peak.v).toLocaleString('en-US')} by ${MN[fc.peak.m - 1]}, like last year.` : fc && fc.call === 'fall' && fc.low ? ` Expected to drop to ${Number(fc.low.v).toLocaleString('en-US')} by ${MN[fc.low.m - 1]}, like last year.` : '';
    if (mm.jump && !mm.jump.confirmed) { res.phase = 'steady'; res.verdict = `${where}, but that is ${mm.jump.factor}× the usual level in one or two months and Google Trends does not confirm it: Google probably merged similar searches. Treat the real demand as closer to ${Number(mm.series.length > 3 ? mm.series[mm.series.length - 3].v : 0).toLocaleString('en-US')} a month.`; }
    else res.verdict = `${where}${mm.yoy != null ? `, ${y >= 0 ? '+' : ''}${y}% on last year` : ''}.${fcText} ` + { early: 'New demand: early movers win.', rising: fc && fc.call === 'rise' && y < 25 ? 'A seasonal rise is coming: start now.' : 'Demand is growing: a good moment to start.', falling: 'Demand is shrinking: only start with a sharp angle.', steady: 'Stable demand: win on offer and price.' }[res.phase];
  }
  // Advies: wat nu te doen, alleen uit gemeten cijfers en de voorspelling (lib/advice.js).
  try { const { advise } = await import('./advice.js'); res.advice = advise(res); } catch (e) { res.advice = null; }
  if (ai && (process.env.ANTHROPIC_API_KEY || aiToken)) res.ai = await analyst(res, aiToken).catch(e => ({ error: String(e.message || e) }));
  return res;
}

// Score 0-100 uit gemeten Google-cijfers: hoeveel vraag (35), groei t.o.v. vorig jaar (30), verwachting komende maanden
// volgens de getoetste voorspeller (20) en wat adverteerders betalen (15). Geen Wikipedia, geen nieuws.
export function measuredScore(m, mk) {
  if (m.jump && !m.jump.confirmed) m = { ...m, yoy: null, mom: null, last: m.series && m.series.length > 3 ? m.series[m.series.length - 3].v : m.last };
  const REF = { NL: 1e5, DE: 3e5, US: 1e6 }[mk] || 3e5, v = m.last ?? m.volume ?? 0;
  const size = v > 0 ? clamp01((Math.log10(v) - 2) / (Math.log10(REF) - 2)) : 0;
  const yo = m.yoy != null ? clamp01((m.yoy + 50) / 150) : m.mom != null ? clamp01((m.mom + 50) / 200) : 0.4;
  const f = m.forecast, out = !f ? 0.5 : f.call === 'rise' ? clamp01(0.6 + 0.4 * Math.log2(Math.max(1, (f.peak ? f.peak.v : 0) / Math.max(1, f.from.v)))) : f.call === 'fall' ? 0.1 : 0.5;
  const money = m.cpc != null ? clamp01(m.cpc / 2) : 0.3;
  return Math.round(35 * size + 30 * yo + 20 * out + 15 * money);
}
const clamp01 = x => Math.max(0, Math.min(1, x));

// Echte zoekvolumes voor de check (Google Ads via DataForSEO, ca. $0,075 per check; per dag begrensd met DFS_MAX_CHECKS).
let checkDay = '', checkCount = 0;
async function measuredFor(q, mk, sugg, lo = null) {
  if (!['NL', 'DE', 'US'].includes(mk)) return null;
  const { dfsReady, budget, searchVolume, cleanKw, adsLocations } = await import('./dfs.js');
  if (!dfsReady()) return null;
  const day = iso(new Date());
  if (checkDay !== day) { checkDay = day; checkCount = 0; }
  if (++checkCount > +(process.env.DFS_MAX_CHECKS || 40)) return null;
  { const { underCap } = await import('./dfs.js'), { getStore, getJSON } = await import('./store.js'); const st = getStore();
    const built = st ? await getJSON(st, 'maps/demand.json', null).then(d => d && d.day === iso(new Date(Date.now() - 4 * 3600e3))).catch(() => false) : true;
    // Reserve voor de nachtelijke opbouw alleen als die automatisch draait (AUTO_BUILD=on); op verzoek gaan checks voor.
    if (!(await underCap(built || process.env.AUTO_BUILD !== 'on' ? 0.2 : 2.7))) return { budget: true }; }
  const { COUNTRIES } = await import('./niches.js');
  const { measure } = await import('./rising.js');
  const kws = [q, ...(sugg || []).slice(0, 14)];
  const vol = await searchVolume(kws, COUNTRIES[mk], budget(0.2));
  const main = vol[cleanKw(q)];
  const related = kws.slice(1).map(k => ({ k, d: vol[cleanKw(k)] })).filter(x => x.d && x.d.volume > 0).sort((a, b) => b.d.volume - a.d.volume).slice(0, 8).map(x => ({ k: x.k, volume: x.d.volume, cpc: x.d.cpc }));
  if (!main && !related.length) return null;
  const me = main && main.monthly && main.monthly.length >= 4 ? measure(main.monthly) : null;
  const { predict } = await import('./forecast.js');
  const forecast = main && main.monthly && main.monthly.length >= 15 ? predict(main.monthly, new Date(), { cc: mk }) : null;
  // 5 jaar Google Trends: hoe vast is het patroon, en speelt het weer of geld mee? (± $0,011 per check)
  let fcx = forecast;
  if (forecast && main) {
    try {
      const { histories, driversFor } = await import('./history.js'), { getStore } = await import('./store.js'), { enrich } = await import('./forecast.js');
      const store = getStore(), today = iso(new Date());
      const [H, drv] = await Promise.all([histories(mk, COUNTRIES[mk], [{ k: cleanKw(q), volume: main.volume }], budget(0.05), store, today), driversFor(mk, store, today).catch(() => null)]);
      const T = H[cleanKw(q)];
      if (T) fcx = enrich(forecast, main.monthly, T, drv && drv.drivers, { money: /hypothe|mortgage|baufinanz|lening|kredit|loan|energie|energy|strom|gas|spaar|savings|tagesgeld|verzeker|insurance|versicher/i.test(q), known: drv ? drv.known : {} });
    } catch {}
  }
  // Plotselinge sprong (≥ 10× het gewone niveau): echt, of heeft Google vergelijkbare zoekopdrachten samengevoegd?
  // Google Trends (12 maanden) moet de sprong bevestigen; anders telt de groei niet mee.
  let jump = null;
  const ser = main && main.monthly ? [...main.monthly].sort((a, b) => a.y - b.y || a.m - b.m).map(x => x.v) : [];
  if (ser.length >= 6) {
    const base = [...ser.slice(Math.max(0, ser.length - 14), ser.length - 2)].sort((a, b) => a - b), mb = base[Math.floor(base.length / 2)] || 0;
    if (mb > 0 && ser[ser.length - 1] >= 10 * mb) {
      const { googleTrends } = await import('./dfs.js');
      const g = await googleTrends([q], COUNTRIES[mk], budget(0.05), 'past_12_months').catch(() => ({}));
      const pts = (g[cleanKw(q)] || []).filter(p => p.v != null).map(p => p.v);
      const n = pts.length, recent = n >= 12 ? pts.slice(n - 8).reduce((t, v) => t + v, 0) / 8 : null, before = n >= 12 ? pts.slice(0, n - 12).reduce((t, v) => t + v, 0) / Math.max(1, n - 12) : null;
      const confirmed = recent != null && (before === 0 ? recent > 5 : recent / Math.max(before, 1) >= 3);
      jump = { factor: Math.round(ser[ser.length - 1] / mb), confirmed };
    }
  }
  // In de stad zelf: Google Ads kent zoekvolumes per stad. Lukt dat niet, dan een schatting naar inwonertal (zo vermeld).
  let local = null;
  if (lo && lo.place) {
    const P = lo.place, POP = { NL: 17.9e6, DE: 83.5e6, US: 335e6 };
    try {
      const locs = await adsLocations(mk), nm = String(P.name).toLowerCase();
      const hit = locs.filter(l => l.name.toLowerCase().startsWith(nm + ',')).sort((a, b) => (a.type === 'City' ? 0 : 1) - (b.type === 'City' ? 0 : 1) || (P.region && b.name.includes(P.region) ? 1 : 0) - (P.region && a.name.includes(P.region) ? 1 : 0))[0];
      if (hit) {
        const lk = [q, ...(lo.suggestions || []).slice(0, 5), ...(sugg || []).slice(0, 6)];
        const lv = await searchVolume(lk, { loc: hit.code, lang: COUNTRIES[mk].lang }, budget(0.2));
        const lm = lv[cleanKw(q)];
        const lrel = lk.slice(1).map(k => ({ k, d: lv[cleanKw(k)] })).filter(x => x.d && x.d.volume > 0).sort((a, b) => b.d.volume - a.d.volume).slice(0, 5).map(x => ({ k: x.k, volume: x.d.volume, cpc: x.d.cpc }));
        if (lm || lrel.length) local = { city: P.name, measured: true, volume: lm ? lm.volume : 0, cpc: lm ? lm.cpc : null, related: lrel };
      }
    } catch {}
    if (!local && main && P.population) local = { city: P.name, measured: false, volume: Math.round((main.volume * P.population) / POP[mk]), cpc: main.cpc, related: [] };
  }
  return {
    local, country: mk, forecast: fcx, jump,
    volume: main ? main.volume : null, cpc: main ? main.cpc : null, competition: main ? main.competition : null,
    period: me && me.period, last: me && me.last, mom: me && me.mom, yoy: me && me.yoy, label: me && me.label,
    series: main && main.monthly ? [...main.monthly].sort((a, b) => a.y - b.y || a.m - b.m).slice(-13) : [],
    related, total: (main ? main.volume : 0) + related.reduce((t, r) => t + r.volume, 0),
  };
}

async function analyst(r, token) {
  const data = {
    score: r.score, phase: r.phase,
    measuredGoogleSearches: r.measured && { perMonth: r.measured.last ?? r.measured.volume, yearOnYearPct: r.measured.yoy, cpcUSD: r.measured.cpc, competition: r.measured.competition, forecast: r.measured.forecast && { call: r.measured.forecast.call, chancePct: r.measured.forecast.chance, months: r.measured.forecast.months.map(m => `${m.y}-${m.m}: ${m.v}`) }, city: r.measured.local },
    advice: r.advice && { decision: r.advice.label, headline: r.advice.headline, when: r.advice.when },
    interest: r.wiki && { article: r.wiki.article, dailyViews: r.wiki.daily, weekVsMonth: r.wiki.momentum, yearOnYear: r.wiki.yoy, next6WeeksLastYear: r.wiki.outlook, lastYearPeakInDays: r.wiki.peakInDays },
    newsWeeks: r.news && r.news.weeks, headlines: r.news && r.news.top.map(h => h.title),
    trendingToday: r.trending.map(t => t.name), calendar: r.calendar.map(c => `${c.name} ${c.date}`),
    googleNewsWeeks: r.gnews && r.gnews.weeks, redditWeeks: r.reddit && r.reddit.weeks, searchSuggestions: r.suggest, 
    local: r.local && !r.local.error ? { city: r.local.place.name, population: r.local.place.population, searchesWithCity: r.local.suggestions, localNews: r.local.news && r.local.news.total, competitorsFound: r.local.competitors && r.local.competitors.count } : null,
  };
  const prompt = `You are a demand analyst for affiliate marketers, e-commerce sellers and product builders.
Idea: "${r.q}". Market: ${MARKETS[r.market].name}${r.local && r.local.place ? `, city: ${r.local.place.name}` : ''}. Today: ${iso(new Date())}.
Measured data: ${JSON.stringify(data)}
If you have web search, use it (at most 3 searches) to find what drives demand; otherwise reason from the data and what you know. The measured Google searches, the forecast and the advice decision are tested facts: do not contradict them, explain them. Explain what drives demand for this idea in this market right now: regulation, subsidies, prices, shortages, seasonality, trends, competition.
Reply ONLY with JSON: {"verdict":"two plain sentences","drivers":["..."],"risks":["..."],"timing":"when to start and until when","first_step":"one concrete action","sources":[{"title":"","url":""}]}. English, plain, no hype, only real direct URLs.`;
  const text = await ask({ prompt, token, web: true, maxTokens: 1200 });
  return parseJSON(text) || { verdict: text.slice(0, 700) };
}
