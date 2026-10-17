// Bing-zoekcijfers per week (Bing Webmaster Tools API, gratis; Vercel: BING_WEBMASTER_KEY uit Bing Webmaster → Settings → API access).
// GetKeywordStats geeft per zoekterm wekelijkse vertoningen (± 6 maanden terug, oud → nieuw). Vers: Google Ads-cijfers lopen 1-2 maanden achter.
// Bing is klein in NL/DE, dus alleen de richting telt, niet het aantal. Context bij een check, niet in het getoetste model.
import { createHash } from 'node:crypto';
import { getJSON, putJSON } from './store.js';

export const bingReady = () => !!process.env.BING_WEBMASTER_KEY;
const LOC = { NL: ['nl', 'nl-NL'], DE: ['de', 'de-DE'], US: ['us', 'en-US'] };
const wkDate = s => { const m = /Date\((\d+)/.exec(String(s)); return m ? new Date(+m[1]).toISOString().slice(0, 10) : null; };

export async function bingWeekly(q, cc) {
  if (!bingReady() || !LOC[cc] || !q) return null;
  const [country, language] = LOC[cc];
  const u = `https://ssl.bing.com/webmaster/api.svc/json/GetKeywordStats?${new URLSearchParams({ q, country, language, apikey: process.env.BING_WEBMASTER_KEY })}`;
  const r = await fetch(u, { signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Bing ${r.status}: ${String((j && (j.Message || j.message)) || 'error').slice(0, 120)}`);
  return (j.d || []).map(x => ({ d: wkDate(x.Date), v: +x.Impressions || 0, b: +x.BroadImpressions || 0 })).filter(x => x.d).sort((a, b) => (a.d < b.d ? -1 : 1));
}

// Laatste 4 weken tegen de 4 weken ervoor (broad = alle varianten, stabieler bij kleine aantallen).
export function bingTrend(weeks) {
  if (!weeks || weeks.length < 8) return weeks && weeks.length ? { weeks: weeks.length, last: weeks[weeks.length - 1], change4w: null } : null;
  const s = a => a.reduce((t, x) => t + (x.b || x.v), 0), n = weeks.length, now = s(weeks.slice(n - 4)), before = s(weeks.slice(n - 8, n - 4));
  return { weeks: n, last: weeks[n - 1], recent4: now, prev4: before, change4w: before > 0 ? Math.round((now / before - 1) * 100) : null, series: weeks.slice(-26) };
}

// Met bewaren per term per dag (Blob), zodat herhaalde checks Bing niet opnieuw vragen.
export async function bingActivity(q, cc, store, now = new Date()) {
  if (!bingReady()) return null;
  const day = now.toISOString().slice(0, 10), key = `bing/${cc}/${createHash('sha256').update(String(q).toLowerCase().trim()).digest('hex').slice(0, 24)}.json`;
  const hit = store && (await getJSON(store, key, null).catch(() => null));
  if (hit && hit.day === day) return hit.v;
  const v = bingTrend(await bingWeekly(q, cc));
  if (store) await putJSON(store, key, { day, v }).catch(() => {});
  return v;
}
