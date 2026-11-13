// Extra gratis bronnen (13 nov 2026, Henkjan: "voeg alle bronnen toe die mogelijk zijn"). Allemaal zonder sleutel en zonder kosten.
// Elke bron levert een lijst (titel, link, toelichting) voor de radar én zoektermen die in het voorspellingsboek gaan
// (soort "src", lib/ledger.js): zo toetst de radar per bron of zijn tips vaker doorbreken dan de basiskans, vóór een bron
// ooit in het model mag (vaste regel: alleen wat aantoonbaar beter voorspelt).
//   mastodon   trending hashtags per land (NL mastodon.nl, DE troet.cafe, US mastodon.social), naast Bluesky
//   steam      best verkochte games per land (Steam-winkel)
//   hf         populairste AI-apps van dit moment (Hugging Face Spaces)
//   off        nieuwe producten in de winkel per land (Open Food Facts, open database, ODbL)
//   rdw        nieuw geregistreerde auto's in NL, snelste stijgers per model (RDW open data)
//   manifold   voorspellingsmarkt Manifold (in lib/events.js, naast Polymarket en Kalshi)
import { get } from './core.js';

const words = (t, n = 5) => String(t || '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/[™®©]/g, '').split(/[,|–—:]| - /)[0].replace(/\s+/g, ' ').trim().split(' ').slice(0, n).join(' ');
const term = t => words(t).toLowerCase().replace(/[^\p{L}\p{N}' &+.-]/gu, ' ').replace(/\s+/g, ' ').trim();

// Mastodon: trending hashtags (openbare API, geen account nodig).
export const MASTO = { NL: 'mastodon.nl', DE: 'troet.cafe', US: 'mastodon.social' };
export async function mastodonTrends(cc) {
  const host = MASTO[cc]; if (!host) return [];
  const j = await get(`https://${host}/api/v1/trends/tags?limit=20`, { timeout: 7000 });
  return (Array.isArray(j) ? j : []).map(t => {
    const h = (t.history || [])[0] || {}, name = String(t.name || '').replace(/([a-z])([A-Z])/g, '$1 $2');
    return { name, traffic: 'Mastodon', volume: +h.uses || 0, news: { title: `#${t.name} · ${+h.accounts || 0} people today on ${host}`, url: t.url || `https://${host}/tags/${t.name}`, source: 'Mastodon' } };
  }).filter(x => x.name && x.name.length > 2);
}

// Steam: best verkocht nu, per land.
export async function steamTop(cc) {
  const j = await get(`https://store.steampowered.com/api/featuredcategories?cc=${cc.toLowerCase()}&l=english`, { timeout: 9000 });
  const seen = new Set();
  return ((j.top_sellers && j.top_sellers.items) || []).filter(x => x && x.name && !seen.has(x.id) && seen.add(x.id) && !/steam deck/i.test(x.name)).slice(0, 15)
    .map(x => ({ title: x.name, url: `https://store.steampowered.com/app/${x.id}`, by: x.final_price ? `${x.currency === 'USD' ? '$' : '€'}${(x.final_price / 100).toFixed(2)}` : 'free', k: term(x.name) }));
}

// Hugging Face: AI-apps (Spaces) die nu het snelst populair worden.
export async function hfTrending() {
  const j = await get('https://huggingface.co/api/spaces?sort=trendingScore&direction=-1&limit=15', { timeout: 9000 });
  return (Array.isArray(j) ? j : []).map(s => { const id = s.id || s.name || '', nm = id.split('/').pop().replace(/[-_]+/g, ' '); return { title: nm, url: `https://huggingface.co/spaces/${id}`, by: id.split('/')[0] || '', k: term(nm) }; }).filter(x => x.title);
}

// Open Food Facts: wat er de laatste weken nieuw in de schappen kwam (per land), met merk.
const OFF_C = { NL: 'netherlands', DE: 'germany', US: 'united-states' };
export async function offNew(cc, now = Date.now()) {
  const c = OFF_C[cc]; if (!c) return [];
  const j = await get(`https://world.openfoodfacts.org/api/v2/search?countries_tags_en=${c}&sort_by=created_t&page_size=100&fields=code,product_name,brands,created_t`, { timeout: 12000 });
  const since = now / 1000 - 45 * 86400, seen = new Set();
  return (j.products || []).filter(p => p && p.product_name && (+p.created_t || 0) >= since).map(p => {
    const brand = String(p.brands || '').split(',')[0].trim(), nm = words(p.product_name, 6);
    return { title: nm, url: `https://world.openfoodfacts.org/product/${p.code}`, by: brand, k: term(`${brand && !nm.toLowerCase().includes(brand.toLowerCase()) ? brand + ' ' : ''}${nm}`) };
  }).filter(x => x.k && !seen.has(x.k) && seen.add(x.k)).slice(0, 20);
}

// RDW: nieuw geregistreerde personenauto's (eerste toelating) per model, laatste 30 dagen tegen de 30 dagen ervoor.
const day = t => new Date(t).toISOString().slice(0, 10);
export async function rdwRisers(now = Date.now()) {
  const q = (from, to) => `https://opendata.rdw.nl/resource/m9d7-ebf2.json?$select=${encodeURIComponent('merk,handelsbenaming,count(*) as n')}&$where=${encodeURIComponent(`voertuigsoort='Personenauto' AND datum_eerste_toelating_dt >= '${from}T00:00:00' AND datum_eerste_toelating_dt < '${to}T00:00:00'`)}&$group=merk,handelsbenaming&$order=n DESC&$limit=300`;
  const d0 = day(now - 3 * 864e5), d1 = day(now - 33 * 864e5), d2 = day(now - 63 * 864e5); // 3 dagen marge: registraties komen met vertraging binnen
  const [cur, prev] = await Promise.all([get(q(d1, d0), { timeout: 25000 }), get(q(d2, d1), { timeout: 25000 })]);
  const key = r => `${String(r.merk || '').trim()} ${String(r.handelsbenaming || '').trim()}`.replace(/\s+/g, ' ').trim();
  const before = new Map((prev || []).map(r => [key(r).toLowerCase(), +r.n || 0]));
  return (cur || []).map(r => { const k = key(r), n = +r.n || 0, p = before.get(k.toLowerCase()) || 0; return { k, n, p, x: n / Math.max(p, 10) }; })
    .filter(r => r.n >= 25 && r.x >= 1.3 && r.k.length > 3)
    .sort((a, b) => b.x - a.x).slice(0, 15)
    .map(r => ({ title: r.k.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()), url: `https://ovi.rdw.nl/`, by: `${r.n} new in 30 days (was ${r.p})`, k: term(r.k) }));
}

// Alles voor de nachtelijke opbouw, per land; een bron die faalt, valt stil weg (status in /api/status).
export async function extraCharts(countries) {
  const jobs = [];
  for (const cc of countries) {
    jobs.push(steamTop(cc).then(list => ({ kind: 'apps', cc, src: 'steam', source: 'Steam', label: 'Top selling games on Steam', list })).catch(() => null));
    jobs.push(offNew(cc).then(list => ({ kind: 'products', cc, src: 'off', source: 'Open Food Facts', label: 'New on the shelves (Open Food Facts)', list })).catch(() => null));
  }
  jobs.push(hfTrending().then(list => ({ kind: 'apps', cc: 'WW', src: 'hf', source: 'Hugging Face', label: 'Trending AI apps on Hugging Face', list })).catch(() => null));
  if (countries.includes('NL')) jobs.push(rdwRisers().then(list => ({ kind: 'products', cc: 'NL', src: 'rdw', source: 'RDW', label: 'Fastest rising new cars in NL (RDW)', list })).catch(() => null));
  return (await Promise.all(jobs)).filter(x => x && x.list && x.list.length);
}
