// GET /api/feed?shop=yoors&cc=NL — productfeed (XML) voor Google Merchant Center. Eigenaar: &refresh=1&key=… bouwt nu opnieuw.
import { getStore } from '../lib/store.js';
import { isPro } from '../lib/access.js';
import { getFeed, SHOPS } from '../lib/feed.js';

export default async function handler(req, res) {
  const store = getStore();
  const shop = String(req.query.shop || 'yoors'), cc = String(req.query.cc || 'NL').toUpperCase();
  if (!store || !SHOPS[shop] || !/^[A-Z]{2}$/.test(cc)) return res.status(404).send('not found');
  try {
    if (req.query.prices) { // marktprijzen per product (bol, Amazon.nl, Amazon.de) voor het prijsadvies van de winkel; eigenaar: &run=1 haalt nu een stuk op
      if (req.query.resum && isPro(req)) { // opgeslagen oordelen opnieuw samenvatten (na een regelwijziging), zonder AI
        const P = await import('../lib/prices.js'), { getJSON, putJSON } = await import('../lib/store.js'), k = `prices/${shop}-NL.json`, o = (await getJSON(store, k, null)) || { items: {} }; let n = 0;
        for (const [id, x] of Object.entries(o.items)) {
          if (x.offers && x.verdict) { o.items[id] = { ...x, ...P.summarize({ ...x.offers, price: x.price }, x.verdict) }; n++; continue; }
          // oudere rijen zonder bewaard oordeel: alleen de prijsregel toepassen op wat er staat
          const same = { ...(x.same || {}) }, sim = { ...(x.similar || {}) };
          for (const [k, v] of Object.entries(same)) if (x.price && (v.p < x.price * 0.5 || v.p > x.price * 2)) { delete same[k]; if (!sim[k]) sim[k] = { n: 1, median: v.p, low: v.p, ex: v }; }
          const sp = Object.values(same).map(v => v.p), meds = Object.values(sim).map(v => v.median).sort((a, b) => a - b), m = meds.length;
          o.items[id] = { ...x, same, similar: sim, lowSame: sp.length ? Math.min(...sp) : null, medSimilar: m ? Math.round((m % 2 ? meds[(m - 1) / 2] : (meds[m / 2 - 1] + meds[m / 2]) / 2) * 100) / 100 : null }; n++;
        }
        await putJSON(store, k, o); return res.status(200).json({ ok: true, redone: n });
      }
      if (req.query.reset && isPro(req)) { const { putJSON } = await import('../lib/store.js'); await putJSON(store, `prices/${shop}-NL.json`, { items: {} }); await putJSON(store, `prices/${shop}-state.json`, { pending: {}, done: 0 }); return res.status(200).json({ ok: true, reset: true }); }
      if (req.query.pq && isPro(req)) { const P = await import('../lib/prices.js'), q = String(req.query.pq); const [bol, de] = await Promise.all([P.bolSearch(q).catch(e => ({ error: String(e.message || e) })), P.keepaDe(q).catch(e => ({ error: String(e.message || e) }))]); if (req.query.judge) { const { gatewayToken } = await import('../lib/ai.js'); P.judge.debug = true; const v = await P.judge([{ title: String(req.query.title || q), price: +(req.query.price || 0), bol: Array.isArray(bol) ? bol : [], amzNl: [], amzDe: Array.isArray(de) ? de : [] }], gatewayToken(req)).catch(e => ({ error: String(e.message || e) })); return res.status(200).json({ q, v, raw: P.judge.last }); }
        return res.status(200).json({ q, bol, amzDe: de }); }
      if (req.query.run && isPro(req)) { const { shopPrices } = await import('../lib/prices.js'), { gatewayToken } = await import('../lib/ai.js'); return res.status(200).json(await shopPrices(store, shop, { token: gatewayToken(req) })); }
      const { pricesFor } = await import('../lib/prices.js');
      res.setHeader('Cache-Control', 'public, max-age=600');
      return res.status(200).json(await pricesFor(store, shop));
    }
    if (req.query.bing && isPro(req)) { // eigenaar: Yoors Shop bij Bing Webmaster (lib/bingsubmit.js): stand | toevoegen | verifieer | sitemap | indienen (&max=, &droog=1)
      const B = await import('../lib/bingsubmit.js'), a = String(req.query.bing);
      const uit = a === 'toevoegen' ? await B.bingVoegToe(shop) : a === 'verifieer' ? await B.bingVerifieer(shop) : a === 'sitemap' ? await B.bingSitemap(shop, req.query.url ? [String(req.query.url)] : []) : a === 'indienen' ? await B.bingIndienen(store, shop, { max: Number(req.query.max) || 10000, droog: !!req.query.droog }) : await B.bingStand(shop);
      return res.status(200).json(uit);
    }
    if (req.query.probe && isPro(req)) { // eigenaar: zoals Google een productpagina ziet (uitgelogd)
      const r = await fetch(SHOPS[shop].link(String(req.query.probe)) + (req.query.qs ? `?${req.query.qs}` : ''), { headers: { ...(req.query.al ? { 'accept-language': String(req.query.al) } : {}), 'user-agent': req.query.ua === 'bot' ? 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      const h = await r.text(), g = re => { const m = h.match(re); return m ? m[1].trim().slice(0, 160) : null; };
      return res.status(200).json({ status: r.status, url: r.url, title: g(/<title[^>]*>([\s\S]*?)<\/title>/i), productLd: /"@type"\s*:\s*"Product"/.test(h), price: g(/"price"\s*:\s*"?([\d.,]+)/), game: /lollipop|yoors points|silver league/i.test(h), login: /log ?in|inloggen|sign in/i.test(g(/<title[^>]*>([\s\S]*?)<\/title>/i) || '') });
    }
    if (req.query.status) { // korte stand voor de eigen campagnepagina's (geen productgegevens)
      const { getJSON } = await import('../lib/store.js');
      const f0 = await getJSON(store, `feed/${shop}-${cc}.json`, null).catch(() => null), t = (await getJSON(store, `feed/${shop}-titles-${cc}.json`, null).catch(() => null)) || {};
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(200).json({ shop: SHOPS[shop].name, cc, at: f0 && f0.at, products: f0 && f0.n, titles: Object.keys(t).length, merchant: shop === 'yoors' ? 'Yoors (5875752564)' : null, fetch: 'every day at 00:00', feed: `https://demandradar-ivory.vercel.app/api/feed?shop=${shop}&cc=${cc}` });
    }
    const f = await getFeed(store, shop, cc, { force: !!(req.query.refresh && isPro(req)) });
    if (req.query.info && isPro(req)) return res.status(200).json({ at: f.at, products: f.n, skipped: f.skipped, bytes: f.xml.length, items: (f.xml.match(/<item>/g) || []).length });
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(f.xml);
  } catch (e) {
    res.status(502).send(`feed not available: ${String(e.message || e).slice(0, 120)}`);
  }
}
