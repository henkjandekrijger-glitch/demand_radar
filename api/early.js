// GET /api/early — vroege signalen: nog niet doorgebroken, maar het patroon lijkt op zoektermen die daarna wél doorbraken.
// ?cc=NL&tier=hidden|starting&limit=20. Eigenaar: POST ?op=seed&cc=NL { series: { zoekterm: { m: [[j,m,v]], cpc } } }, ?op=score, ?op=refresh.
import { getStore } from '../lib/store.js';
import { isPro } from '../lib/access.js';
import { latestEarly, seedEarly, scoreEarly, refreshEarly } from '../lib/earlydata.js';

export default async function handler(req, res) {
  const store = getStore();
  if (!store) return res.status(503).json({ error: 'no storage' });
  const op = String(req.query.op || '');
  try {
    if (op) {
      if (!isPro(req)) return res.status(403).json({ error: 'forbidden' });
      if (op === 'seed') {
        let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
        const cc = String(req.query.cc || '').toUpperCase();
        return res.status(200).json(await seedEarly(store, cc, body && body.series));
      }
      if (op === 'score') return res.status(200).json(await scoreEarly(store));
      if (op === 'refresh') return res.status(200).json(await refreshEarly(store, { max: Math.min(3, +(req.query.max || 1.5)) }));
      return res.status(400).json({ error: 'unknown op' });
    }
    const L = await latestEarly(store);
    if (!L) return res.status(200).json({ ready: false, items: [] });
    const cc = String(req.query.cc || '').toUpperCase(), tier = String(req.query.tier || ''), n = Math.max(1, Math.min(200, +req.query.limit || 50));
    const items = L.items.filter(x => (!cc || cc === 'ALL' || x.cc === cc) && (!tier || x.tier === tier)).slice(0, n);
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.status(200).json({ ready: true, month: L.month, made: L.made, model: L.model, items });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
}
