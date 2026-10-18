// /api/events — wat de wereld verwacht (Polymarket, Kalshi) en wat dat voor de vraag betekent. Eén keer per dag opgebouwd
// (ook door /api/warm). Eigenaar: ?refresh=1&key=… bouwt nu opnieuw (één AI-vraag).
import { getStore } from '../lib/store.js';
import { isPro } from '../lib/access.js';
import { gatewayToken } from '../lib/ai.js';
import { getEvents } from '../lib/events.js';

export default async function handler(req, res) {
  const store = getStore(); if (!store) return res.status(503).json({ error: 'no storage' });
  try {
    const d = await getEvents(store, { token: gatewayToken(req), force: !!(req.query.refresh && isPro(req)) });
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.status(200).json(d);
  } catch (e) { res.status(500).json({ error: String(e.message || e).slice(0, 200) }); }
}
