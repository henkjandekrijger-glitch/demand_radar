// Kansenkaart: per subniche en per land een score met vraag, groei, piekmoment, advertentieprijs,
// bestaand aanbod en het gat, plus een eerste stap. Gratis signalen altijd; DataForSEO erbij als die is ingesteld.
import { pool, wikiFind, wikiSeries, metrics } from './core.js';
import { suggest, amazonSuggest, googleNews, appStore, books } from './sources.js';
import { dfsReady, budget, searchVolume, relatedKeywords, serp } from './dfs.js';
import { PACKS, COUNTRIES } from './niches.js';
import { askCached, parseJSON, compact, CHEAP } from './ai.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const r2 = x => Math.round(x * 100) / 100;
const safe = p => p.catch(() => null);
const QWORDS = /^(hoe|wat|waar|welke|wie|wanneer|waarom|kan|wie |was|wo|welche|wann|warum|kann|how|what|where|which|who|when|why|can|is|do|does)\b|\?|vragen|fragen|questions/i;
const words = s => String(s).toLowerCase().split(/[^\p{L}\p{N}+]+/u).filter(w => w.length >= 2);
const GENERIC = new Set('online test tests oefenen oefentoets practice free gratis kostenlos üben übungen examen exam exams prüfung pdf app apps vragen fragen questions answers and the for voor met mit und van der die das een ein kopen prijs preis price review beste best training cursus kurs course online-test 2025 2026 2027 nederland deutschland usa'.split(' '));
// Woorden die een subniche echt onderscheiden (zonder algemene woorden als "online" of "test").
const keyWords = seeds => { const all = [...new Set(seeds.flatMap(words))]; const d = all.filter(w => !GENERIC.has(w)); return new Set(d.length ? d : all); };

// ---------- Eigen thema: AI maakt de subniches ----------
// Model: haiku (thema opsplitsen + zoektermen per land in JSON = gestructureerde extractie). Zelfde thema = 30 dagen uit de opslag.
const SYS_THEME = `You split a market theme into 6 to 10 concrete sub-niches where people would pay for a product, course, test or service.
For each sub-niche give two short Google search terms per country, in the local language, the way real people type them: NL (Dutch), DE (German), US (English). Also a Wikipedia topic per country (or null), and the calendar months (1-12) when demand typically peaks if there is a fixed period such as exam dates (else empty arrays).
Reply ONLY with JSON: {"title":"...","niches":[{"id":"kebab-id","name":"English name","cat":"short category","seeds":{"NL":["",""],"DE":["",""],"US":["",""]},"wiki":{"NL":null,"DE":null,"US":null},"peaks":{"NL":[],"DE":[],"US":[]},"note":"one short sentence on timing, or empty"}]}`;
export async function expandTheme(theme, token) {
  const j = parseJSON(await askCached({ task: 'map-theme', ttlH: 720, system: SYS_THEME, prompt: `Theme: "${String(theme).toLowerCase().trim()}"`, token, maxTokens: 2500, timeoutMs: 60000, model: process.env.MAP_MODEL || CHEAP() }));
  const niches = (j && Array.isArray(j.niches) ? j.niches : []).slice(0, 10).filter(n => n && n.name && n.seeds).map((n, i) => ({
    id: String(n.id || `n${i}`).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || `n${i}`,
    name: String(n.name).slice(0, 60), cat: String(n.cat || '').slice(0, 30), note: String(n.note || '').slice(0, 200),
    seeds: Object.fromEntries(Object.keys(COUNTRIES).map(c => [c, (n.seeds[c] || []).map(s => String(s).slice(0, 60)).filter(Boolean).slice(0, 2)])),
    wiki: Object.fromEntries(Object.keys(COUNTRIES).map(c => [c, n.wiki && n.wiki[c] ? String(n.wiki[c]).slice(0, 80) : null])),
    peaks: Object.fromEntries(Object.keys(COUNTRIES).map(c => [c, ((n.peaks && n.peaks[c]) || []).map(Number).filter(m => m >= 1 && m <= 12)])),
  }));
  if (!niches.length) throw new Error('Could not split this theme into niches. Try a clearer theme.');
  return { title: String((j && j.title) || theme).slice(0, 80), niches };
}

// ---------- Gratis signalen per subniche en land ----------
async function freeSignals(n, cc) {
  const C = COUNTRIES[cc], seeds = (n.seeds[cc] || []).filter(Boolean);
  if (!seeds.length) return null;
  const [s0, s1 = s0] = seeds;
  const [g0, g1, g2, g3, yt, amz, apps, bk, gn, wk] = await Promise.all([
    safe(suggest(s0, cc)), safe(suggest(s1, cc)), safe(suggest(`${C.q[0]} ${s0}`, cc)), safe(suggest(`${C.q[1]} ${s1}`, cc)),
    safe(suggest(s0, cc, 'yt')), safe(amazonSuggest(s0, cc)), safe(appStore(s0, cc)), safe(books(s0, cc)), safe(googleNews(s0, cc)),
    n.wiki && n.wiki[cc] ? safe(wikiFind(C.wiki, n.wiki[cc]).then(async t => (t ? { article: t, ...metrics(await wikiSeries(C.wiki, t, 430)) } : null))) : Promise.resolve(null),
  ]);
  const sugg = [...new Set([...(g0 || []), ...(g1 || []), ...(g2 || []), ...(g3 || [])].map(s => String(s).toLowerCase()))];
  return {
    seeds, suggestions: sugg, questions: sugg.filter(s => QWORDS.test(s)).slice(0, 8), youtube: (yt || []).slice(0, 6), amazon: (amz || []).slice(0, 6),
    apps, books: bk, news: gn && { total: gn.total, weeks: gn.weeks }, wiki: wk && { article: wk.article, daily: wk.daily, momentum: wk.momentum, yoy: wk.yoy, outlook: wk.outlook, peakInDays: wk.peakInDays },
    ok: { google: !!(g0 || g1), youtube: !!yt, amazon: !!amz, appstore: !!apps, books: !!bk, news: !!gn, wikipedia: !!wk },
  };
}

// ---------- Rekenen ----------
function monthlyTotals(kws) {
  const t = {};
  for (const k of kws) for (const m of k.monthly || []) { const key = `${m.y}-${String(m.m).padStart(2, '0')}`; t[key] = (t[key] || 0) + m.v; }
  return Object.entries(t).sort(([a], [b]) => (a < b ? -1 : 1)).map(([ym, v]) => ({ ym, v }));
}

export function seasonality(series) {
  if (series.length < 12) return null;
  const by = Array(12).fill(0), cnt = Array(12).fill(0);
  for (const { ym, v } of series) { const m = +ym.slice(5) - 1; by[m] += v; cnt[m]++; }
  const avg = by.map((v, i) => (cnt[i] ? v / cnt[i] : 0));
  const mean = avg.reduce((a, b) => a + b, 0) / 12 || 1;
  const max = Math.max(...avg);
  const peaks = avg.map((v, i) => [v, i + 1]).filter(([v]) => v >= max * 0.9 && v >= mean * 1.15).map(([, m]) => m);
  return { peaks, strength: r2(max / mean), avg: avg.map(Math.round) };
}

export function yoy(series) {
  if (series.length < 15) return null;
  const last = series.slice(-3), prev = series.slice(-15, -12);
  const a = last.reduce((t, x) => t + x.v, 0), b = prev.reduce((t, x) => t + x.v, 0);
  return b > 0 ? r2(a / b) : null;
}

export function timing(peaks, now = new Date()) {
  if (!peaks || !peaks.length) return { status: 'steady', weeks: null, month: null };
  const m = now.getUTCMonth() + 1;
  if (peaks.includes(m)) return { status: 'now', weeks: 0, month: m };
  const next = [...peaks].sort((a, b) => ((a - m + 12) % 12) - ((b - m + 12) % 12))[0];
  const target = new Date(Date.UTC(now.getUTCFullYear() + (next < m ? 1 : 0), next - 1, 1));
  const weeks = Math.max(0, Math.round((target - now) / (7 * 864e5)));
  return { status: weeks <= 10 ? 'soon' : 'later', weeks, month: next };
}

function score(p) {
  const v = p.demand.volume;
  const demand = v != null ? 35 * clamp(Math.log10(v + 1) / 5) : Math.min(20, p.demand.breadth * 1.2) + Math.min(15, Math.log10(Math.max(0, p.offer.apps ? p.offer.apps.ratings : 0) + 1) * 3);
  const g = p.trend.yoy;
  const growth = g != null ? 10 + 10 * clamp(Math.log2(g), -1, 1) : 10;
  const money = p.money.cpc != null ? 20 * clamp(p.money.cpc / 3) : 10;
  const timingPts = { soon: 10, now: 7, steady: 5, later: 3 }[p.timing.status] || 5;
  const gapPts = Math.min(15, p.gaps.reduce((t, x) => t + x.pts, 0));
  return { total: Math.round(clamp(demand + growth + money + timingPts + gapPts, 0, 100)), parts: { demand: Math.round(demand), growth: Math.round(growth), money: Math.round(money), timing: timingPts, gap: gapPts } };
}

function findGaps(p, cc) {
  const G = [], a = p.offer.apps, b = p.offer.books, s = p.offer.serp, lang = COUNTRIES[cc].name;
  if (a && a.count >= 3 && a.local <= 1 && cc !== 'US') G.push({ pts: 5, kind: 'language', text: `Few apps in the local language: ${a.local} of ${a.count} App Store apps support it.` });
  if (a && (a.count < 5 || a.ratings < 300)) G.push({ pts: 4, kind: 'apps', text: `Thin app supply in ${lang}: ${a.count} apps, ${a.ratings.toLocaleString('en-US')} ratings in total.` });
  if (a && a.count >= 5 && a.top[0] && a.top[0].updated && a.top[0].updated < String(new Date().getUTCFullYear() - 1)) G.push({ pts: 2, kind: 'stale', text: `The biggest app was last updated ${a.top[0].updated.slice(0, 7)}.` });
  if (p.money.competition != null && p.money.competition < 40) G.push({ pts: 4, kind: 'ads', text: `Low advertiser competition (${p.money.competition}/100).` });
  if (s && s.adCount <= 1) G.push({ pts: 3, kind: 'ads', text: `${s.adCount === 0 ? 'No' : 'Only one'} paid ad on Google for "${p.demand.seed}".` });
  if (p.demand.questions.length >= 3) G.push({ pts: 3, kind: 'content', text: `People ask questions that few pages answer well: "${p.demand.questions[0]}".` });
  if (b && b.recent === 0) G.push({ pts: 2, kind: 'books', text: 'No recent books (last two years) in this language.' });
  return G.sort((x, y) => y.pts - x.pts);
}

function firstStep(p) {
  const top = (p.demand.top[0] && p.demand.top[0].k) || p.demand.seed;
  const when = p.timing.status === 'soon' ? ` Launch before the ${MONTHS[p.timing.month - 1]} peak.` : p.timing.status === 'now' ? ' Demand peaks now, so test today.' : '';
  const g = p.gaps[0] ? p.gaps[0].kind : '';
  const base = {
    language: `Build a mobile practice test in ${COUNTRIES[p.cc].name === 'Germany' ? 'German' : 'Dutch'} for "${top}"; the existing apps are not in this language.`,
    apps: `Put a simple practice test online for "${top}" and measure who starts it; there is little on offer.`,
    stale: `Offer an up-to-date practice test for "${top}"; the market leader is outdated.`,
    ads: `Test a small Google Ads campaign on "${top}"${p.money.cpc != null ? ` (about $${p.money.cpc} per click)` : ''}; competition is low.`,
    content: `Write one answer page per question people type, starting with "${p.demand.questions[0] || top}", and link it to a practice test.`,
    books: `Publish a short practice workbook (PDF or KDP) for "${top}".`,
  }[g] || `Check the top search "${top}" with a small test page before building more.`;
  return base + when;
}

// ---------- Kaart bouwen ----------
export async function buildMap({ pack = 'practice', theme = '', countries = Object.keys(COUNTRIES), aiToken = '' } = {}) {
  const t0 = Date.now();
  const def = theme ? await expandTheme(theme, aiToken) : PACKS[pack];
  if (!def) throw new Error('Unknown theme');
  const pairs = [];
  for (const n of def.niches) for (const cc of countries) if (COUNTRIES[cc] && (n.seeds[cc] || []).length) pairs.push({ n, cc });
  const free = await pool(pairs, 6, ({ n, cc }) => freeSignals(n, cc));

  // Betaalde data (DataForSEO), per land in één keer.
  const b = budget(), paid = dfsReady();
  const vol = {}, rel = {}, serps = {};
  if (paid) {
    await Promise.all(countries.filter(cc => COUNTRIES[cc]).map(async cc => {
      const idx = pairs.map((p, i) => [p, i]).filter(([p]) => p.cc === cc);
      const kws = idx.flatMap(([p, i]) => [...p.n.seeds[cc], ...((free[i] && free[i].suggestions) || [])]);
      vol[cc] = await searchVolume(kws, COUNTRIES[cc], b);
      rel[cc] = await relatedKeywords(idx.flatMap(([p]) => p.n.seeds[cc]), COUNTRIES[cc], b);
    }));
    const sres = await pool(pairs, 6, ({ n, cc }) => serp(n.seeds[cc][0], COUNTRIES[cc], b));
    pairs.forEach((p, i) => { serps[`${p.n.id}|${p.cc}`] = sres[i]; });
  }

  const items = pairs.map(({ n, cc }, i) => {
    const f = free[i] || { seeds: n.seeds[cc], suggestions: [], questions: [], youtube: [], amazon: [], ok: {} };
    const nw = keyWords(n.seeds[cc]);
    let kws = [];
    if (paid && vol[cc]) {
      const own = [...new Set([...n.seeds[cc], ...f.suggestions].map(k => k.toLowerCase()))];
      kws = own.map(k => ({ k, ...(vol[cc][k] || {}) })).filter(k => k.volume != null);
      for (const [k, m] of Object.entries(rel[cc] || {})) if (!own.includes(k) && words(k).some(w => nw.has(w))) kws.push({ k, ...m });
      kws.sort((x, y) => (y.volume || 0) - (x.volume || 0));
      kws = kws.slice(0, 40);
    }
    const volume = paid && kws.length ? kws.reduce((t, k) => t + (k.volume || 0), 0) : null;
    const wsum = kws.reduce((t, k) => t + (k.volume || 0), 0) || 1;
    const cpcK = kws.filter(k => k.cpc != null);
    const cpc = cpcK.length ? r2(cpcK.reduce((t, k) => t + k.cpc * (k.volume || 0), 0) / (cpcK.reduce((t, k) => t + (k.volume || 0), 0) || 1)) : null;
    const compK = kws.filter(k => k.competition != null);
    const competition = compK.length ? Math.round(compK.reduce((t, k) => t + k.competition * (k.volume || 0), 0) / (compK.reduce((t, k) => t + (k.volume || 0), 0) || 1)) : null;
    const series = monthlyTotals(kws);
    const seas = seasonality(series);
    const measuredPeaks = seas && seas.peaks.length ? seas.peaks : null;
    const typicalPeaks = (n.peaks && n.peaks[cc]) || [];
    const wikiPeak = f.wiki && f.wiki.outlook > 1.2 && f.wiki.peakInDays > 3 ? [((new Date(Date.now() + f.wiki.peakInDays * 864e5)).getUTCMonth()) + 1] : null;
    const peaks = measuredPeaks || (typicalPeaks.length ? typicalPeaks : wikiPeak);
    const y = yoy(series) ?? (f.wiki ? f.wiki.yoy : null);
    const p = {
      id: `${n.id}-${cc}`, nicheId: n.id, niche: n.name, cat: n.cat, cc, country: COUNTRIES[cc].name, note: n.note || '',
      confidence: volume != null ? 'measured' : 'signals',
      demand: { seed: n.seeds[cc][0], volume, terms: kws.length, top: kws.slice(0, 8).map(k => ({ k: k.k, v: k.volume, cpc: k.cpc })), breadth: f.suggestions.length, suggestions: f.suggestions.slice(0, 12), questions: f.questions, youtube: f.youtube, amazon: f.amazon, series: series.slice(-24) },
      trend: { yoy: y, source: series.length >= 15 ? 'search volume' : f.wiki ? 'Wikipedia' : null, wiki: f.wiki },
      timing: { ...timing(peaks), peaks: peaks || [], source: measuredPeaks ? 'measured' : typicalPeaks.length ? 'typical' : wikiPeak ? 'Wikipedia' : null, strength: seas ? seas.strength : null },
      money: { cpc, bidHigh: kws.reduce((m, k) => Math.max(m, k.bidHigh || 0), 0) || null, competition },
      offer: { apps: f.apps || null, books: f.books || null, serp: serps[`${n.id}|${cc}`] || null },
      news: f.news || null,
      ok: { ...f.ok, searchVolume: volume != null, serp: !!serps[`${n.id}|${cc}`] },
    };
    p.gaps = findGaps(p, cc);
    const sc = score(p);
    p.score = sc.total; p.parts = sc.parts;
    p.firstStep = firstStep(p);
    return p;
  }).sort((a, b) => b.score - a.score);

  // AI scherpt het gat en de eerste stap aan voor de top 15 (als AI beschikbaar is).
  let ai = null;
  if (aiToken || process.env.ANTHROPIC_API_KEY) {
    try {
      const top = items.slice(0, 15).map(p => compact({ id: p.id, niche: p.niche, cc: p.cc, score: p.score, volume: p.demand.volume, cpc: p.money.cpc, competition: p.money.competition, yoy: p.trend.yoy, peak: p.timing && { status: p.timing.status, month: p.timing.month }, top: p.demand.top.slice(0, 4).map(t => `${t.k} ${t.v ?? ''}`.trim()), questions: p.demand.questions.slice(0, 3), apps: p.offer.apps && { n: p.offer.apps.count, local: p.offer.apps.local, ratings: p.offer.apps.ratings, top: p.offer.apps.top.slice(0, 3).map(a => a.name) }, books: p.offer.books && { n: p.offer.books.total, recent: p.offer.books.recent }, google: p.offer.serp && { top: p.offer.serp.organic.slice(0, 5).map(o => o.domain), ads: p.offer.serp.adCount }, gaps: p.gaps.slice(0, 3).map(g => g.text) }));
      // Model: sonnet blijft (het gat en de eerste stap zijn echt advies uit veel cijfers = redeneerwerk). Een keer per dag per thema, gecachet.
      const text = await askCached({ task: 'map-advice', ttlH: 24, token: aiToken, maxTokens: 2500, timeoutMs: 90000, model: process.env.MAP_ADVICE_MODEL || undefined,
        system: 'You advise a solo online entrepreneur who sells practice tests, courses and digital products, and buys cheap traffic. For each opportunity, write the single most useful gap (what is missing in the market, concrete) and a first step he can do this week (concrete, small, testable). Use only the data given; no hype, no invented numbers. English. Reply ONLY with JSON: {"items":[{"id":"","gap":"","first_step":""}]}',
        prompt: `Data (one JSON object per line):\n${top.map(t => JSON.stringify(t)).join('\n')}` });
      const j = parseJSON(text);
      for (const r of (j && j.items) || []) { const p = items.find(x => x.id === r.id); if (p && r.gap) { p.aiGap = String(r.gap).slice(0, 300); p.firstStep = String(r.first_step || p.firstStep).slice(0, 300); } }
      ai = 'used';
    } catch (e) { ai = `failed: ${String(e.message || e).slice(0, 100)}`; }
  }

  const okCount = k => items.filter(p => p.ok[k]).length;
  return {
    generatedAt: new Date().toISOString(), ms: Date.now() - t0, title: def.title, theme: theme || null, pack: theme ? null : pack,
    mode: paid ? 'measured' : 'signals', countries, ai,
    dataforseo: paid ? { spent: r2(b.spent), calls: b.calls, skipped: b.skipped, errors: b.errors.slice(0, 5) } : null,
    sources: ['google', 'youtube', 'amazon', 'appstore', 'books', 'news', 'wikipedia', 'searchVolume', 'serp'].map(k => ({ name: k, answered: okCount(k), of: items.length })),
    niches: def.niches.map(n => ({ id: n.id, name: n.name, cat: n.cat, note: n.note })),
    items,
  };
}
