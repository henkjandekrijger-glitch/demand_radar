// GET /api/feed?shop=yoors&cc=NL — productfeed (XML) voor Google Merchant Center. Eigenaar: &refresh=1&key=… bouwt nu opnieuw.
import { getStore } from '../lib/store.js';
import { isPro } from '../lib/access.js';
import { getFeed, SHOPS } from '../lib/feed.js';

export default async function handler(req, res) {
  const store = getStore();
  const shop = String(req.query.shop || 'yoors'), cc = String(req.query.cc || 'NL').toUpperCase();
  if (!store || !SHOPS[shop] || !/^[A-Z]{2}$/.test(cc)) return res.status(404).send('not found');
  try {
    const f = await getFeed(store, shop, cc, { force: !!(req.query.refresh && isPro(req)) });
    if (req.query.info && isPro(req)) return res.status(200).json({ at: f.at, products: f.n, bytes: f.xml.length, items: (f.xml.match(/<item>/g) || []).length });
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(f.xml);
  } catch (e) {
    res.status(502).send(`feed not available: ${String(e.message || e).slice(0, 120)}`);
  }
}
