// Productfeed voor Google Merchant Center uit een eigen winkel (nu: Yoors Shop, yoo.rs/shop). Eén keer per dag opgebouwd en bewaard
// (Blob feed/<shop>-<cc>.xml); Merchant Center haalt hem dagelijks op via /api/feed?shop=yoors&cc=NL.
// Titels kunnen later per product vervangen worden door een titel met de zoektermen die volgens de radar het meest gezocht worden
// (feed/<shop>-titles-<cc>.json: { id: titel }).
import { getJSON, putJSON } from './store.js';

export const SHOPS = {
  yoors: { name: 'Yoors Shop', api: 'https://yoo.rs/shop/api/shop', link: id => `https://yoo.rs/product/${id}`, site: 'https://yoo.rs/shop' },
};
const CAT_NL = { home: 'Wonen & decoratie', hobby: 'Hobby & creatief', kitchen: 'Keuken & tafel', kids: 'Kinderen & speelgoed', gifts: 'Cadeaus', beauty: 'Beauty & verzorging', garden: 'Tuin, buiten & sport', tech: 'Tech & gadgets', fashion: 'Mode & accessoires', pets: 'Dieren', food: 'Eten & drinken' };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Alle producten ophalen (48 per pagina; de winkel-API geeft soms een 502, dus opnieuw proberen).
export async function fetchProducts(shop, { lang = 'nl', f = fetch, max = 3000 } = {}) {
  const S = SHOPS[shop]; if (!S) throw new Error('unknown shop');
  const all = [], skipped = [];
  for (let o = 0; o < max; o += 48) {
    let items = null, empty = false;
    for (let t = 0; t < 6 && !items; t++) {
      if (t) await sleep(1500 * t);
      const r = await f(`${S.api}?offset=${o}&limit=48&q=&filter=all&cat=all&sub=&sort=recommended&lang=${lang}`, { headers: { 'accept-language': `${lang}-${lang.toUpperCase()},${lang};q=0.9`, accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; DemandRadarFeed/1.0)' }, signal: AbortSignal.timeout(20000) }).catch(() => null);
      if (r && r.ok) { const j = await r.json().catch(() => null); if (j && Array.isArray(j.items)) items = j.items; }
    }
    if (!items) { skipped.push(o); if (skipped.length > 3) throw new Error(`shop API keeps failing (offsets ${skipped.join(', ')})`); continue; } // één pagina overslaan, morgen opnieuw
    all.push(...items); if (items.length < 48) break;
    await sleep(400);
  }
  const out = [...new Map(all.map(x => [x.id, x])).values()]; out.skipped = skipped;
  return out;
}

// Google-feed (RSS 2.0 met g:-velden). Geen GTIN bekend → identifier_exists no.
export function feedXml(shop, items, { cc = 'NL', titles = {} } = {}) {
  const S = SHOPS[shop], cur = 'EUR';
  const rows = items.filter(x => x.type === 'physical' && x.price > 0 && x.photos && x.photos.length).map(x => {
    const title = (titles[x.id] || x.title || '').slice(0, 150), cat = [CAT_NL[x.shop_category] || x.shop_category, x.shop_sub].filter(Boolean).join(' > ');
    const sale = x.original_price && x.original_price > x.price;
    const desc = `${x.title}. ${x.brand ? `Merk: ${x.brand}. ` : ''}${cat ? `Categorie: ${cat}. ` : ''}Levering in ${x.delivery_days || 5} werkdagen met track & trace, 14 dagen bedenktijd, veilig betalen met iDEAL, PayPal of kaart.`;
    return `<item>
<g:id>${esc(x.id)}</g:id>
<g:title>${esc(title)}</g:title>
<g:description>${esc(desc)}</g:description>
<g:link>${esc(S.link(x.id))}</g:link>
<g:image_link>${esc(x.photos[0].src || x.photos[0].serverUrl)}</g:image_link>
${x.photos.slice(1, 6).map(p => `<g:additional_image_link>${esc(p.src || p.serverUrl)}</g:additional_image_link>`).join('\n')}
<g:availability>${x.in_stock ? 'in_stock' : 'out_of_stock'}</g:availability>
<g:price>${(sale ? x.original_price : x.price).toFixed(2)} ${cur}</g:price>
${sale ? `<g:sale_price>${x.price.toFixed(2)} ${cur}</g:sale_price>` : ''}
<g:condition>${/^vt_|^vinted/i.test(x.id) ? 'used' : 'new'}</g:condition>
${x.brand ? `<g:brand>${esc(x.brand)}</g:brand>` : ''}
<g:identifier_exists>no</g:identifier_exists>
${cat ? `<g:product_type>${esc(cat)}</g:product_type>` : ''}
<g:shipping><g:country>${cc}</g:country><g:price>${(x.free_shipping ? 0 : +(x.shipping_cost || 0)).toFixed(2)} ${cur}</g:price></g:shipping>
</item>`.replace(/\n{2,}/g, '\n');
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>${esc(S.name)}</title>
<link>${esc(S.site)}</link>
<description>${esc(S.name)} productfeed</description>
${rows.join('\n')}
</channel>
</rss>`;
}

// Bewaard per dag; opnieuw opbouwen als hij ouder is dan 20 uur (of force).
export async function getFeed(store, shop, cc = 'NL', { force = false } = {}) {
  const key = `feed/${shop}-${cc}.json`, c = await getJSON(store, key, null).catch(() => null);
  if (!force && c && Date.now() - Date.parse(c.at) < 20 * 3600e3 && !(c.skipped && c.skipped.length && Date.now() - Date.parse(c.at) > 3600e3)) return c;
  const lang = { NL: 'nl', DE: 'de', US: 'en', BE: 'nl' }[cc] || 'nl';
  const items = await fetchProducts(shop, { lang });
  const titles = (await getJSON(store, `feed/${shop}-titles-${cc}.json`, null).catch(() => null)) || {};
  const out = { at: new Date().toISOString(), shop, cc, n: items.length, skipped: items.skipped || [], xml: feedXml(shop, items, { cc, titles }) };
  await putJSON(store, key, out);
  return out;
}
