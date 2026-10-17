// Meta Ad Library (Facebook/Instagram): hoeveel bedrijven nu adverteren op een zoekterm — een aanbod-signaal (concurrentie die eraan komt).
// Commerciële advertenties alleen voor de EU (DSA): NL en DE, niet de VS. Vercel: META_AD_TOKEN (gebruikerstoken van een account met
// bevestigde identiteit, 60 dagen geldig; verlengen via developers.facebook.com/tools/debug/accesstoken → "Extend Access Token").
import { createHash } from 'node:crypto';
import { getJSON, putJSON } from './store.js';

export const metaReady = () => !!process.env.META_AD_TOKEN;
const EU = new Set(['NL', 'DE', 'BE', 'FR', 'ES', 'IT', 'AT', 'PL', 'SE', 'DK', 'FI', 'IE', 'PT', 'CZ', 'RO', 'HU', 'GR']);
const V = 'v26.0';

// Actieve advertenties (max 4 pagina's à 500), waarvan nieuw in 30 dagen, en de grootste adverteerders.
export async function metaAds(q, cc, f = fetch, now = new Date()) {
  if (!metaReady() || !q || !EU.has(cc)) return null;
  const p = new URLSearchParams({ search_terms: q, ad_reached_countries: JSON.stringify([cc]), ad_active_status: 'ACTIVE', ad_type: 'ALL', fields: 'page_id,page_name,ad_delivery_start_time', limit: '500', access_token: process.env.META_AD_TOKEN });
  let url = `https://graph.facebook.com/${V}/ads_archive?${p}`, ads = [], pages = 0;
  while (url && pages < 4) {
    const r = await f(url, { signal: AbortSignal.timeout(15000) }), j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = j.error || {}; throw new Error(`Meta ${e.code || r.status}${e.error_subcode ? `/${e.error_subcode}` : ''}: ${String(e.message || 'error').slice(0, 120)}`); }
    ads = ads.concat(j.data || []); pages++; url = j.paging && j.paging.next;
  }
  const since = now.getTime() - 30 * 864e5, by = new Map();
  for (const a of ads) { const k = a.page_name || a.page_id; by.set(k, (by.get(k) || 0) + 1); }
  return { active: ads.length, capped: !!url, new30: ads.filter(a => Date.parse(a.ad_delivery_start_time) >= since).length, advertisers: by.size,
    top: [...by].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, n]) => ({ name, n })) };
}

// Met bewaren per term per dag (Blob), zodat herhaalde checks Meta niet opnieuw vragen.
export async function metaActivity(q, cc, store, now = new Date()) {
  if (!metaReady() || !EU.has(cc)) return null;
  const day = now.toISOString().slice(0, 10), key = `meta/${cc}/${createHash('sha1').update(String(q).toLowerCase()).digest('hex').slice(0, 16)}.json`;
  const c = store ? await getJSON(store, key, null).catch(() => null) : null;
  if (c && c.day === day) return c.v;
  const v = await metaAds(q, cc, fetch, now);
  if (store && v) await putJSON(store, key, { day, v }).catch(() => {});
  return v;
}
