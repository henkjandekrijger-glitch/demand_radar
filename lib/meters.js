// Meters per behoefte die per onderwerp opgehaald worden (21 nov 2026, Henkjan: "Kijk naar clickmind > Doe rediit en YT . Voer 3
// helemaal uit ."). Elke uurronde een klein stuk, binnen de gratis grenzen, voor de best scorende behoeftes (behoefte/<cc>.json):
//   Clickmind   mensen per zoekterm op Henkjans eigen advertenties en sites (hjdk-api /api/mm?op=cmradar, eigen OIDC-token)
//   Reddit      berichten over het onderwerp in de laatste 30 dagen (reddit.com, anders PullPush), met de 30 dagen ervoor
//   YouTube     nieuwe video's in 30 dagen tegen een jaar eerder, en kijkers (lib/youtube.js, binnen het dagquotum)
//   Meta        actieve advertenties en adverteerders in NL/DE (lib/meta.js; wacht op META_AD_TOKEN)
// Opslag behoefte/meters.json { reddit: {cc: {id: {...}}}, youtube: {...}, meta: {...} } en cm/latest.json.
import { getJSON, putJSON } from './store.js';
import { get } from './core.js';
import { ytActivity, ytReady } from './youtube.js';
import { metaActivity, metaReady } from './meta.js';

export const METERS = 'behoefte/meters.json', CM = 'cm/latest.json';
const CCS = ['NL', 'DE', 'US'], D = 864e5;

// Clickmind: één keer per dag.
export async function cmDag(store, oidc, now = new Date()) {
  const cur = await getJSON(store, CM, null).catch(() => null), day = now.toISOString().slice(0, 10);
  if (cur && cur.day === day && !cur.fout) return { clickmind: 'up to date' };
  if (!oidc) return { clickmind: 'geen Vercel OIDC-token' };
  const r = await fetch(process.env.CM_FEED_URL || 'https://keuzehulp.best/api/mm?op=cmradar', { headers: { authorization: `Bearer ${oidc}` }, signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) { await putJSON(store, CM, { ...(cur || {}), day, fout: `hjdk-api ${r.status}: ${String(j.fout || '').slice(0, 80)}` }).catch(() => {}); return { clickmind: 'fout', status: r.status }; }
  await putJSON(store, CM, { day, at: now.toISOString(), start: j.start, termen: j.termen || [] });
  return { clickmind: (j.termen || []).length };
}

// Reddit: eerst reddit.com zelf (laatste maand, max 100), anders PullPush (twee vensters van 30 dagen).
export async function redditTel(q, now = Date.now()) {
  try {
    const j = await get(`https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&t=month&limit=100&raw_json=1`, { timeout: 8000 });
    const posts = ((j && j.data && j.data.children) || []).map(c => c.data).filter(Boolean);
    if (j && j.data) { const subs = {}; for (const p of posts) subs[p.subreddit_name_prefixed] = (subs[p.subreddit_name_prefixed] || 0) + 1;
      return { bron: 'reddit', maand: posts.length, vol: posts.length >= 100, subs: Object.entries(subs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]) }; }
  } catch {}
  // archieven met dezelfde vensters: Arctic Shift, dan PullPush
  const t = Math.floor(now / 1000), fouten = [];
  const bronnen = [
    ['arcticshift', (a, b) => `https://arctic-shift.photon-reddit.com/api/posts/search?query=${encodeURIComponent(q)}&after=${a}&before=${b}&limit=100`],
    ['pullpush', (a, b) => `https://api.pullpush.io/reddit/search/submission/?q=${encodeURIComponent(q)}&after=${a}&before=${b}&size=100`],
  ];
  for (const [naam, url] of bronnen) {
    try {
      const win = async (a, b) => { const j = await get(url(a, b), { timeout: 10000 }); if (!j || !Array.isArray(j.data)) throw new Error('geen data'); return j.data; };
      const [nu, voor] = await Promise.all([win(t - 30 * 86400, t), win(t - 60 * 86400, t - 30 * 86400)]);
      const subs = {}; for (const p of nu) subs['r/' + p.subreddit] = (subs['r/' + p.subreddit] || 0) + 1;
      return { bron: naam, maand: nu.length, maandErvoor: voor.length, vol: nu.length >= 100, subs: Object.entries(subs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]) };
    } catch (e) { fouten.push(`${naam}: ${String(e.message || e).slice(0, 40)}`); }
  }
  throw new Error(fouten.join(' · '));
}

// Elk uur: per meter een paar behoeftes die nog geen (verse) meting hebben, best scorende eerst, verdeeld over de landen.
export async function metersRonde(store, { reddit = 30, youtube = 8, meta = 15, now = new Date() } = {}) {
  const M = (await getJSON(store, METERS, null).catch(() => null)) || {}, uit = {};
  const lijsten = {}; for (const cc of CCS) { const B = await getJSON(store, `behoefte/${cc}.json`, null).catch(() => null); if (B) lijsten[cc] = B.items.slice(0, 300); }
  const todo = (meter, dagen, max, ok = () => true) => {
    const l = []; let i = 0, more = true; const sec = (M[meter] = M[meter] || {});
    while (l.length < max && more) { more = false; for (const cc of CCS) { const it = (lijsten[cc] || [])[i]; if (!it) continue; more = true; if (!ok(cc)) continue; const c = sec[cc] && sec[cc][it.id]; if (!c || now - Date.parse(c.at) > dagen * D) l.push([cc, it]); if (l.length >= max) break; } i++; }
    return l;
  };
  const zet = (meter, cc, id, v) => { ((M[meter] = M[meter] || {})[cc] = M[meter][cc] || {})[id] = { at: now.toISOString(), ...v }; };
  // Reddit (gratis)
  let r = 0, rf = 0, eerste = null;
  for (const [cc, it] of todo('reddit', 7, reddit)) { try { zet('reddit', cc, it.id, await redditTel(it.naam, now.getTime())); r++; } catch (e) { rf++; eerste = eerste || String(e.message || e).slice(0, 160); if (rf >= 3 && !r) break; } } // drie fouten op rij: deze ronde stoppen
  uit.reddit = { gemeten: r, fouten: rf, ...(eerste ? { fout: eerste } : {}) };
  // YouTube (dagquotum in lib/youtube.js; stopt vanzelf als het op is)
  if (ytReady()) { let y = 0; for (const [cc, it] of todo('youtube', 14, youtube)) { const v = await ytActivity(it.naam, cc, store, now).catch(e => ({ fout: String(e.message || e).slice(0, 60) })); if (v && v.skipped) break; zet('youtube', cc, it.id, v || { fout: 'leeg' }); y++; } uit.youtube = y; }
  else uit.youtube = 'wacht op YOUTUBE_API_KEY';
  // Meta Ad Library (NL en DE)
  if (metaReady()) { let m = 0; for (const [cc, it] of todo('meta', 7, meta, cc => cc !== 'US')) { const v = await metaActivity(it.naam, cc, store, now).catch(e => ({ fout: String(e.message || e).slice(0, 60) })); zet('meta', cc, it.id, v || { fout: 'leeg' }); m++; } uit.meta = m; }
  else uit.meta = 'wacht op META_AD_TOKEN';
  M.at = now.toISOString(); await putJSON(store, METERS, M);
  return uit;
}
