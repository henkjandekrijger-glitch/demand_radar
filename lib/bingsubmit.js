// Yoors Shop bij Bing Webmaster Tools (Henkjan 20 okt 2026: "meld alles van de shop bij Bing webmaster aan").
// Bing Webmaster API (BING_WEBMASTER_KEY): site toevoegen, sitemap indienen, productpagina's indienen binnen het dagquotum.
// Wat al is ingediend staat in Blob feed/<shop>-bing.json, zodat elke URL één keer gaat en een nieuwe dag verder gaat waar het bleef.
import { getJSON, putJSON } from './store.js';
import { SHOPS } from './feed.js';

const API = 'https://ssl.bing.com/webmaster/api.svc/json/';
const SITE = { yoors: 'https://yoo.rs/' };
const key = () => process.env.BING_WEBMASTER_KEY || '';

async function call(method, { get = null, post = null } = {}) {
  const u = new URL(API + method); u.searchParams.set('apikey', key());
  if (get) for (const [k, v] of Object.entries(get)) u.searchParams.set(k, v);
  const r = await fetch(u, post ? { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(post), signal: AbortSignal.timeout(20000) } : { signal: AbortSignal.timeout(20000) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* geen JSON */ }
  if (!r.ok) throw new Error(`Bing ${method} ${r.status}: ${String((j && (j.Message || j.message)) || t).slice(0, 200)}`);
  return j && 'd' in j ? j.d : j;
}

// Stand: staat de site in het Bing-account, is hij geverifieerd, quotum, sitemaps.
export async function bingStand(shop = 'yoors') {
  if (!key()) return { ok: false, fout: 'BING_WEBMASTER_KEY ontbreekt' };
  const site = SITE[shop]; const sites = await call('GetUserSites');
  const s = (sites || []).find(x => String(x.Url || '').replace(/\/$/, '') === site.replace(/\/$/, ''));
  const uit = { ok: true, site, inAccount: !!s, geverifieerd: s ? !!s.IsVerified : false, sites: (sites || []).map(x => ({ url: x.Url, geverifieerd: !!x.IsVerified })) };
  if (s) {
    uit.verificatieCode = s.AuthenticationCode || null; // openbaar bedoeld: komt in BingSiteAuth.xml of de meta-tag msvalidate.01
    try { uit.quotum = await call('GetUrlSubmissionQuota', { get: { siteUrl: site } }); } catch (e) { uit.quotumFout = String(e.message).slice(0, 160); }
    try { uit.sitemaps = ((await call('GetFeeds', { get: { siteUrl: site } })) || []).map(f => ({ url: f.Url, status: f.Status, urls: f.UrlCount, gelezen: f.LastCrawled })); } catch (e) { uit.sitemapFout = String(e.message).slice(0, 160); }
  }
  return uit;
}

export async function bingVoegToe(shop = 'yoors') { await call('AddSite', { post: { siteUrl: SITE[shop] } }); return bingStand(shop); }
export async function bingVerifieer(shop = 'yoors') { const v = await call('VerifySite', { post: { siteUrl: SITE[shop] } }); return { verifieerd: v, stand: await bingStand(shop) }; }

// Sitemap(s) van de shop indienen: robots.txt lezen; anders de bekende plekken proberen.
export async function bingSitemap(shop = 'yoors') {
  const site = SITE[shop], gevonden = new Set();
  try { const r = await fetch(site + 'robots.txt', { signal: AbortSignal.timeout(10000) }); if (r.ok) for (const m of (await r.text()).matchAll(/^\s*sitemap:\s*(\S+)/gim)) gevonden.add(m[1]); } catch { /* geen robots */ }
  if (!gevonden.size) for (const p of ['sitemap.xml', 'shop/sitemap.xml', 'sitemap_index.xml']) { try { const r = await fetch(site + p, { method: 'GET', signal: AbortSignal.timeout(10000) }); if (r.ok && /<(urlset|sitemapindex)/i.test((await r.text()).slice(0, 2000))) gevonden.add(site + p); } catch { /* volgende */ } }
  const uit = [];
  for (const u of gevonden) { try { await call('SubmitFeed', { post: { siteUrl: site, feedUrl: u } }); uit.push({ sitemap: u, ingediend: true }); } catch (e) { uit.push({ sitemap: u, fout: String(e.message).slice(0, 160) }); } }
  return { sitemaps: uit, gevonden: gevonden.size };
}

// Productpagina's indienen, in stukken van 500, tot het dagquotum op is. max = hoogstens zoveel in deze aanroep.
export async function bingIndienen(store, shop = 'yoors', { max = 10000, droog = false } = {}) {
  const site = SITE[shop], S = SHOPS[shop];
  const items = (await getJSON(store, `feed/${shop}-items-NL.json`, null).catch(() => null)) || [];
  const urls = [S.site, ...items.map(x => S.link(x.id, 'nl'))];
  const k = `feed/${shop}-bing.json`, gedaan = (await getJSON(store, k, null).catch(() => null)) || { urls: {}, log: [] };
  const todo = urls.filter(u => !gedaan.urls[u]);
  if (!todo.length && !droog) return { ok: true, totaal: urls.length, ingediend: 0, nogTeGaan: 0 };
  let quotum = null; try { quotum = await call('GetUrlSubmissionQuota', { get: { siteUrl: site } }); } catch (e) { return { ok: false, fout: String(e.message).slice(0, 200), todo: todo.length }; }
  const ruimte = Math.max(0, Math.min(max, Number(quotum && quotum.DailyQuota) || 0));
  const nu = todo.slice(0, ruimte);
  if (droog) return { ok: true, droog: true, totaal: urls.length, alIngediend: urls.length - todo.length, todo: todo.length, quotum, zouNuIndienen: nu.length };
  let ingediend = 0, fout = null;
  for (let i = 0; i < nu.length; i += 500) {
    const deel = nu.slice(i, i + 500);
    try { await call('SubmitUrlBatch', { post: { siteUrl: site, urlList: deel } }); ingediend += deel.length; const t = Date.now(); for (const u of deel) gedaan.urls[u] = t; }
    catch (e) { fout = String(e.message).slice(0, 200); break; }
  }
  gedaan.log = [{ at: new Date().toISOString(), ingediend, fout }, ...(gedaan.log || [])].slice(0, 30);
  await putJSON(store, k, gedaan);
  return { ok: !fout, totaal: urls.length, ingediend, nogTeGaan: todo.length - ingediend, quotumVoor: quotum, fout };
}
