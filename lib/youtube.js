// YouTube Data API v3 (gratis, 10.000 eenheden per dag per Google Cloud-project "Demand Radar"; Vercel: YOUTUBE_API_KEY).
// Wat makers doen: hoeveel nieuwe video's over dit onderwerp de laatste 30 dagen, tegen dezelfde 30 dagen een jaar eerder,
// en hoeveel er naar gekeken wordt. Niet in het getoetste model (4 jaar historie per term past niet in het quotum): context bij een check.
// Kosten per term: 2 zoekopdrachten (2 × 100) + 1 videolijst (1) = 201 eenheden; per dag per term bewaard in Blob.
import { createHash } from 'node:crypto';
import { getJSON, putJSON } from './store.js';

export const ytReady = () => !!process.env.YOUTUBE_API_KEY;
const DAY_MAX = 9000, COST = 201;
const LANG = { NL: 'nl', DE: 'de', US: 'en', WW: 'en' };
const iso = d => d.toISOString().replace(/\.\d+Z$/, 'Z');

async function api(path, params) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY })}`, { signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`YouTube ${r.status}: ${(j.error && j.error.message) || 'error'}`.slice(0, 160));
  return j;
}

// Quotum per dag bijhouden (Blob), zodat checks nooit op een harde YouTube-fout stuiten.
async function reserve(store, day, units) {
  if (!store) return true;
  const p = `yt/quota-${day}.json`, q = (await getJSON(store, p, null).catch(() => null)) || { used: 0 };
  if (q.used + units > DAY_MAX) return false;
  q.used += units; await putJSON(store, p, q).catch(() => {});
  return true;
}

async function windowCount(q, cc, after, before) {
  const j = await api('search', { part: 'id', type: 'video', q, maxResults: '50', publishedAfter: iso(after), publishedBefore: iso(before), ...(cc !== 'WW' ? { regionCode: cc } : {}), relevanceLanguage: LANG[cc] || 'en', safeSearch: 'moderate' });
  const ids = (j.items || []).map(x => x.id && x.id.videoId).filter(Boolean);
  return { n: ids.length, est: j.pageInfo ? j.pageInfo.totalResults : null, ids };
}

export async function ytActivity(q, cc, store, now = new Date()) {
  if (!ytReady() || !q) return null;
  const day = now.toISOString().slice(0, 10), key = `yt/${cc}/${createHash('sha256').update(String(q).toLowerCase().trim()).digest('hex').slice(0, 24)}.json`;
  const hit = store && (await getJSON(store, key, null).catch(() => null));
  if (hit && hit.day === day) return hit.v;
  if (!(await reserve(store, day, COST))) return { skipped: 'daily YouTube quota reached' };
  const D = 864e5, t = now.getTime();
  const [a, b] = await Promise.all([windowCount(q, cc, new Date(t - 30 * D), now), windowCount(q, cc, new Date(t - 395 * D), new Date(t - 365 * D))]);
  let views = 0, top = [];
  if (a.ids.length) {
    const v = await api('videos', { part: 'statistics,snippet', id: a.ids.join(','), maxResults: '50' });
    const list = (v.items || []).map(x => ({ title: x.snippet.title, channel: x.snippet.channelTitle, url: `https://www.youtube.com/watch?v=${x.id}`, views: +(x.statistics.viewCount || 0), published: x.snippet.publishedAt.slice(0, 10) }));
    views = list.reduce((s, x) => s + x.views, 0); top = list.sort((x, y) => y.views - x.views).slice(0, 3);
  }
  // Bij 50 (de grens van één pagina) is het echte aantal hoger: dan zegt de schatting van YouTube meer dan de telling.
  const capped = a.n >= 50 && b.n >= 50;
  const growth = capped ? (a.est && b.est ? Math.round((a.est / b.est) * 10) / 10 : null) : Math.round(((a.n + 1) / (b.n + 1)) * 10) / 10;
  const out = { recent: a.n, lastYear: b.n, capped, growth, views, top, window: 30 };
  if (store) await putJSON(store, key, { day, v: out }).catch(() => {});
  return out;
}
