// DataForSEO (betaald, per gebruik): echte zoekvolumes per maand, prijs per klik (CPC), concurrentie,
// verwante zoektermen en wie er in Google staat en adverteert. Aan zodra DFS_LOGIN en DFS_PASSWORD in Vercel staan.
// Budget per kaart: DFS_MAX_PER_MAP (dollar, standaard 1). Elke aanroep telt de kosten die DataForSEO teruggeeft.
import { postJSON, retry } from './core.js';

const API = 'https://api.dataforseo.com/v3/';
export const dfsReady = () => !!(process.env.DFS_LOGIN && process.env.DFS_PASSWORD);
const auth = () => ({ Authorization: `Basic ${Buffer.from(`${process.env.DFS_LOGIN}:${process.env.DFS_PASSWORD}`).toString('base64')}` });

export function budget(max = +(process.env.DFS_MAX_PER_MAP || 1)) {
  return { max, spent: 0, calls: 0, skipped: 0, errors: [] };
}

// Harde dagrem over álles (alle builds, checks, andere chats): DataForSEO's eigen teller van vandaag (UTC), 2 minuten bewaard.
let spendCache = null;
export async function spentToday() {
  if (spendCache && Date.now() - spendCache.t < 120e3) return spendCache.v;
  const r = await fetch(API + 'appendix/user_data', { headers: auth(), signal: AbortSignal.timeout(8000) });
  const j = await r.json(); const u = (((j.tasks || [])[0] || {}).result || [])[0] || {};
  const v = +(u.money && u.money.statistics && u.money.statistics.day && u.money.statistics.day.total) || 0;
  spendCache = { t: Date.now(), v, balance: u.money ? u.money.balance : null };
  return v;
}
export const dailyCap = () => +(process.env.DFS_DAILY_MAX || 4);
export async function underCap(reserve = 0) { try { return (await spentToday()) + reserve < dailyCap(); } catch { return true; } }
export const lastBalance = () => (spendCache ? spendCache.balance : null);

export async function call(path, task, b) {
  if (!dfsReady()) return null;
  if (b.spent >= b.max) { b.skipped++; return null; }
  if (!(await underCap())) { b.skipped++; if (!b.errors.includes('daily data budget reached')) b.errors.push('daily data budget reached'); return null; }
  try {
    const j = await retry(() => postJSON(API + path, [task], { headers: auth(), timeout: 45000 }));
    b.calls++; b.spent += +(j.cost || 0);
    const t = (j.tasks || [])[0];
    if (!t || t.status_code !== 20000) { b.errors.push(`${path}: ${t ? t.status_message : j.status_message || 'no task'}`.slice(0, 160)); return null; }
    return t.result || [];
  } catch (e) { b.errors.push(`${path}: ${String(e.message || e)}`.slice(0, 160)); return null; }
}

// Google Ads tolereert geen bijzondere tekens; houd zoektermen schoon en kort.
export const cleanKw = k => String(k || '').toLowerCase().replace(/[^\p{L}\p{N}\s+&-]/gu, ' ').replace(/\s+/g, ' ').trim();
const okKw = k => k.length >= 2 && k.length <= 80 && k.split(' ').length <= 10;

const firstOfMonth = monthsBack => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - monthsBack); return d.toISOString().slice(0, 10); };

// Zoekvolume, CPC, concurrentie en 4 jaar maanddata voor maximaal 1000 zoektermen.
export async function searchVolume(keywords, c, b, { months = 48 } = {}) { // 4 jaar historie: zelfde prijs, het voorspelmodel gebruikt 2-3 jaar terug
  const kw = [...new Set(keywords.map(cleanKw).filter(okKw))].slice(0, 1000);
  if (!kw.length) return {};
  const res = await call('keywords_data/google_ads/search_volume/live', { keywords: kw, location_code: c.loc, language_code: c.lang, date_from: firstOfMonth(Math.min(48, Math.max(12, months))) }, b);
  const out = {};
  for (const r of res || []) out[r.keyword] = pick(r);
  return out;
}

// Verwante zoektermen (Google Ads Keyword Planner) voor maximaal 20 startwoorden.
export async function relatedKeywords(seeds, c, b) {
  const kw = [...new Set(seeds.map(cleanKw).filter(okKw))].slice(0, 20);
  if (!kw.length) return {};
  const res = await call('keywords_data/google_ads/keywords_for_keywords/live', { keywords: kw, location_code: c.loc, language_code: c.lang }, b);
  const out = {};
  for (const r of res || []) out[r.keyword] = pick(r);
  return out;
}

function pick(r) {
  return {
    volume: r.search_volume || 0, cpc: r.cpc != null ? Math.round(r.cpc * 100) / 100 : null,
    bidLow: r.low_top_of_page_bid ?? null, bidHigh: r.high_top_of_page_bid ?? null,
    competition: r.competition_index ?? null,
    monthly: (r.monthly_searches || []).map(m => ({ y: m.year, m: m.month, v: m.search_volume || 0 })),
  };
}

// Wie staat er bovenaan in Google, en wie adverteert erop?
export async function serp(keyword, c, b) {
  const res = await call('serp/google/organic/live/regular', { keyword: cleanKw(keyword), location_code: c.loc, language_code: c.lang, depth: 10 }, b);
  const items = (res && res[0] && res[0].items) || [];
  const organic = items.filter(i => i.type === 'organic').map(i => ({ domain: i.domain, title: i.title, url: i.url }));
  const ads = items.filter(i => i.type === 'paid').map(i => ({ domain: i.domain, title: i.title }));
  return res ? { organic: organic.slice(0, 10), ads: ads.slice(0, 6), adCount: ads.length } : null;
}

// Wat er in een land in Google naar boven komt (DataForSEO Labs "top searches"). Alleen koop- en vergelijkzoekopdrachten.
// order: 'monthly' (deze maand t.o.v. vorige) of 'yearly' (t.o.v. een jaar eerder).
// by: 'trend' = hardste procentuele groei eerst; 'volume' = grootste zoekvolume eerst, mits minstens minGrowth % gegroeid.
export async function topSearches(c, b, { order = 'monthly', by = 'trend', minGrowth = 30, minVolume = 1000, limit = 100, regex = null, intent = ['commercial', 'transactional'], growthAny = false } = {}) {
  const filters = [['keyword_info.search_volume', '>=', minVolume]];
  if (intent) filters.push('and', ['search_intent_info.main_intent', 'in', intent]);
  if (regex) filters.push('and', ['keyword', 'regex', regex]);
  if (growthAny) filters.push('and', [['keyword_info.search_volume_trend.monthly', '>=', minGrowth], 'or', ['keyword_info.search_volume_trend.yearly', '>=', minGrowth]]);
  else if (by === 'volume') filters.push('and', [`keyword_info.search_volume_trend.${order}`, '>=', minGrowth]);
  const res = await call('dataforseo_labs/google/top_searches/live', {
    location_code: c.loc, language_code: c.lang, limit, filters,
    order_by: [by === 'volume' ? 'keyword_info.search_volume,desc' : `keyword_info.search_volume_trend.${order},desc`],
  }, b);
  const items = (res && res[0] && res[0].items) || [];
  return items.map(it => {
    const ki = it.keyword_info || {}, tr = ki.search_volume_trend || {};
    return {
      k: it.keyword, volume: ki.search_volume || 0, cpc: ki.cpc != null ? Math.round(ki.cpc * 100) / 100 : null,
      competition: ki.competition != null ? Math.round(ki.competition * 100) : null,
      trend: { m: tr.monthly ?? null, q: tr.quarterly ?? null, y: tr.yearly ?? null },
      monthly: (ki.monthly_searches || []).map(m => ({ y: m.year, m: m.month, v: m.search_volume || 0 })),
      intent: it.search_intent_info ? it.search_intent_info.main_intent : null,
      core: it.keyword_properties ? it.keyword_properties.core_keyword : null,
      kd: it.keyword_properties ? it.keyword_properties.keyword_difficulty : null,
    };
  });
}

// Laatste 14 dagen tegenover de 6 weken daarvoor → 'rising' | 'steady' | 'fading' | 'gone' | 'quiet'.
export function nowStatus(v) {
  const n = v.length;
  if (n < 30) return null;
  const avg = a => a.reduce((t, x) => t + x, 0) / Math.max(a.length, 1);
  const recent = avg(v.slice(n - 14)), before = avg(v.slice(Math.max(0, n - 56), n - 14)), total = v.reduce((t, x) => t + x, 0);
  const ratio = before > 0 ? recent / before : recent > 0 ? 3 : 0;
  const status = total < 15 ? 'quiet' : ratio >= 1.15 ? 'rising' : ratio >= 0.85 ? 'steady' : ratio >= 0.4 ? 'fading' : 'gone';
  const weeks = []; for (let e = n; e - 7 >= 0 && weeks.length < 12; e -= 7) weeks.unshift(v.slice(e - 7, e).reduce((t, x) => t + x, 0));
  return { status, ratio: Math.round(ratio * 100) / 100, weeks };
}

// Hoe het NU gaat (dagdata tot vandaag, DataForSEO Trends, max 5 zoektermen per aanroep, ca. $0,001).
// Per zoekterm: laatste 14 dagen tegenover de 6 weken daarvoor. Waarden zijn relatief binnen één aanroep,
// dus groepeer zoektermen met vergelijkbaar volume.
export async function nowTrends(keywords, c, b) {
  const kw = [...new Set(keywords.map(cleanKw).filter(okKw))].slice(0, 5);
  if (!kw.length) return {};
  const res = await call('keywords_data/dataforseo_trends/explore/live', { location_code: c.loc, keywords: kw, time_range: 'past_90_days', type: 'web' }, b);
  const it = res && res[0] && (res[0].items || []).find(i => Array.isArray(i.data));
  if (!it) return {};
  const days = it.data.filter(d => d.date_from === d.date_to); // laatste (onvolledige) periode weglaten
  const out = {};
  kw.forEach((k, i) => {
    const st = nowStatus(days.map(d => (d.values && d.values[i] != null ? +d.values[i] : 0)));
    if (st) out[k] = st;
  });
  return out;
}

// Steden en regio's die Google Ads kent (gratis lijst bij DataForSEO), per land één keer per proces opgehaald.
const locCache = new Map();
export async function adsLocations(cc) {
  if (!dfsReady()) return [];
  if (locCache.has(cc)) return locCache.get(cc);
  const r = await fetch(`${API}keywords_data/google_ads/locations/${cc.toLowerCase()}`, { headers: auth(), signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  const list = ((j.tasks || [])[0] || {}).result || [];
  const out = list.map(l => ({ code: l.location_code, name: l.location_name, type: l.location_type }));
  if (out.length) locCache.set(cc, out);
  return out;
}

// Lange historie (5 jaar, per week) van DataForSEO Trends voor max 5 zoektermen tegelijk. Waarden zijn relatief binnen één
// aanroep; groepeer dus zoektermen met een vergelijkbaar volume. Geeft per zoekterm [{d: 'YYYY-MM-DD', v}].
export async function longTrends(keywords, c, b, timeRange = 'past_5_years') {
  const kw = [...new Set(keywords.map(cleanKw).filter(okKw))].slice(0, 5);
  if (!kw.length) return {};
  const res = await call('keywords_data/dataforseo_trends/explore/live', { location_code: c.loc, keywords: kw, time_range: timeRange, type: 'web' }, b);
  const it = res && res[0] && (res[0].items || []).find(i => Array.isArray(i.data));
  if (!it) return {};
  const out = {};
  kw.forEach((k, i) => { out[k] = it.data.map(d => ({ d: d.date_from, e: d.date_to, v: d.values && d.values[i] != null ? +d.values[i] : null })); });
  return out;
}

// Google Trends zelf (via DataForSEO, ca. $0,01 per aanroep van max 5 zoektermen): Googles eigen interessecijfers tot gisteren.
export async function googleTrends(keywords, c, b, timeRange = 'past_5_years') {
  const kw = [...new Set(keywords.map(cleanKw).filter(okKw))].slice(0, 5);
  if (!kw.length) return {};
  const res = await call('keywords_data/google_trends/explore/live', { location_code: c.loc, language_code: c.lang, keywords: kw, time_range: timeRange, item_types: ['google_trends_graph'] }, b);
  const it = res && res[0] && (res[0].items || []).find(i => Array.isArray(i.data));
  if (!it) return {};
  const out = {};
  kw.forEach((k, i) => { out[k] = it.data.map(d => ({ d: d.date_from, e: d.date_to, v: d.values && d.values[i] != null ? +d.values[i] : null, missing: !!d.missing_data })); });
  return out;
}

// "Nu"-status uit Google Trends zelf (beter dan DataForSEO's eigen trenddata: in de toets volgde Google Trends de
// echte Google Ads-cijfers twee keer zo goed). Ca. $0,01 per 5 zoektermen.
export async function googleNow(keywords, c, b) {
  const g = await googleTrends(keywords, c, b, 'past_90_days');
  const out = {};
  for (const [k, pts] of Object.entries(g)) { const st = nowStatus(pts.filter(p => !p.missing && p.d === p.e).map(p => p.v || 0)); if (st) out[k] = { ...st, src: 'google' }; }
  return out;
}
