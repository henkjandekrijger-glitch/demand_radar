// Toegang: gratis bezoekers zien alles geblurd (namen worden op de server al onleesbaar gemaakt, dus
// 'inspecteren' helpt niet). Pro-bezoekers hebben een cookie dr_pro met de hash van hun sleutel.
// Sleutels: de eigenaarssleutel (alleen de hash staat hier) plus PRO_KEYS (komma-gescheiden, Vercel-omgevingsvariabele).
import { createHash, randomBytes } from 'node:crypto';

const OWNER_HASH = 'ed927d5e48443a736233ed0eaf204e370cdaa6ce86a77d16ef19ed88e6670070';
const hash = k => createHash('sha256').update(`dr:${k}`).digest('hex');

export function keyHashes() {
  return [OWNER_HASH, ...String(process.env.PRO_KEYS || '').split(',').map(s => s.trim()).filter(Boolean).map(hash)];
}
export function cookieFor(key) {
  if (!key) return null;
  const h = hash(String(key).trim());
  return keyHashes().includes(h) ? h : null;
}
export function isPro(req) {
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)dr_pro=([a-f0-9]{64})/);
  return !!m && keyHashes().includes(m[1]);
}

// Interne sleutel voor de gecachte ruwe data. Staat niet in de code (de repo kan openbaar zijn).
export const RAW_TOKEN = createHash('sha256')
  .update(`raw:${process.env.RAW_SECRET || process.env.VERCEL_DEPLOYMENT_ID || randomBytes(16).toString('hex')}`)
  .digest('hex').slice(0, 32);

export function selfBase(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (String(host).startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

// ---------- Maskeren ----------
export function scramble(s, seed = '') {
  if (s == null) return s;
  let h = 2166136261;
  for (const c of seed + s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return [...String(s)].map(c => {
    if (/[\s\-–,.()/'&]/.test(c)) return c;
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    return String.fromCharCode((/[A-ZÀ-Þ]/.test(c) ? 65 : 97) + ((h >>> 16) % 26));
  }).join('');
}
const lock = (o, keys) => {
  const c = { ...o, locked: true };
  for (const k of keys) {
    if (c[k] == null) continue;
    if (k === 'url') c[k] = null;
    else if (typeof c[k] === 'string') c[k] = scramble(c[k]);
    else if (Array.isArray(c[k])) c[k] = c[k].map(v => (typeof v === 'string' ? scramble(v) : null));
  }
  return c;
};
const list = (arr, keys, free = 1) => (arr || []).map((x, i) => (i < free ? x : lock(x, keys)));
const W = ['name', 'article', 'url', 'cat'];

export function maskRadar(r) {
  return {
    ...r,
    spikes: {
      products: list(r.spikes.products, W),
      search: r.spikes.search.map((g, gi) => ({ ...g, items: g.items.map((x, i) => (gi === 0 && i === 0 ? x : { ...lock(x, ['name']), news: { title: scramble(x.news.title), url: null, source: scramble(x.news.source) } })) })),
      attention: r.spikes.attention.map((g, gi) => ({ ...g, items: list(g.items, ['name', 'url'], gi === 0 ? 1 : 0) })),
    },
    upcoming: { calendar: list(r.upcoming.calendar, ['ideas'], 2), seasonal: list(r.upcoming.seasonal, W) },
    rising: list(r.rising, W),
    watch: list(r.watch, W, 0),
  };
}

export function maskCheck(c) {
  return {
    q: c.q, market: c.market, generatedAt: c.generatedAt, score: c.score, phase: c.phase, locked: true,
    verdict: scramble(c.verdict),
    wiki: c.wiki && { locked: true, lang: c.wiki.lang, article: scramble(c.wiki.article), daily: null, momentum: null, yoy: null, outlook: null, peakInDays: null, weeks: c.wiki.weeks, proj: c.wiki.proj },
    news: c.news && { locked: true, weeks: c.news.weeks, total: c.news.total, momentum: null, top: c.news.top.map(h => ({ title: scramble(h.title), url: null, source: scramble(h.source), date: h.date })) },
    trending: c.trending.map(t => ({ name: scramble(t.name), traffic: t.traffic, locked: true })),
    calendar: c.calendar.map(e => ({ ...e, ideas: e.ideas.map(i => scramble(i)), locked: true })),
    ai: null,
  };
}
