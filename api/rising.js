// GET /api/rising — gemeten zoekopdrachten die het hardst groeien in NL, DE en de VS (DataForSEO), één keer per dag ververst.
import { buildRising, worthKeeping } from '../lib/rising.js';
import { RAW_TOKEN, isPro } from '../lib/access.js';
import { gatewayToken } from '../lib/ai.js';
import { getRising, storedMap, saveMap } from '../lib/data.js';

export default async function handler(req, res) {
  try {
    if (req.query.raw) return res.status(410).json({ error: 'gone' });
    if (req.query.rebuild && isPro(req)) { const nd = await getRising(req, { build: true }); return res.status(200).json({ rebuilt: true, month: nd.items.month.length, year: nd.items.year.length }); }
    const r0 = await getRising(req);
    const cap = t => { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); };
    const pr = x => ({ ...x, name: x.title || cap(x.name), keyword: x.name });
    const d = r0 && r0.items ? { ...r0, items: { month: (r0.items.month || []).map(pr), year: (r0.items.year || []).map(pr) } } : r0;
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(d);
  } catch (e) {
    res.status(500).json({ error: 'Rising searches could not load right now.' });
  }
}
