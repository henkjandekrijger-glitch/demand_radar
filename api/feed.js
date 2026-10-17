// GET /api/feed?shop=yoors&cc=NL — productfeed (XML) voor Google Merchant Center. Eigenaar: &refresh=1&key=… bouwt nu opnieuw.
import { getStore } from '../lib/store.js';
import { isPro } from '../lib/access.js';
import { getFeed, SHOPS } from '../lib/feed.js';

export default async function handler(req, res) {
  const store = getStore();
  const shop = String(req.query.shop || 'yoors'), cc = String(req.query.cc || 'NL').toUpperCase();
  if (!store || !SHOPS[shop] || !/^[A-Z]{2}$/.test(cc)) return res.status(404).send('not found');
  try {
    if (req.query.probe && isPro(req)) { // eigenaar: zoals Google een productpagina ziet (uitgelogd)
      const r = await fetch(SHOPS[shop].link(String(req.query.probe)), { headers: { 'user-agent': req.query.ua === 'bot' ? 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      const h = await r.text(), g = re => { const m = h.match(re); return m ? m[1].trim().slice(0, 160) : null; };
      return res.status(200).json({ status: r.status, url: r.url, title: g(/<title[^>]*>([\s\S]*?)<\/title>/i), productLd: /"@type"\s*:\s*"Product"/.test(h), price: g(/"price"\s*:\s*"?([\d.,]+)/), game: /lollipop|yoors points|silver league/i.test(h), login: /log ?in|inloggen|sign in/i.test(g(/<title[^>]*>([\s\S]*?)<\/title>/i) || '') });
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
