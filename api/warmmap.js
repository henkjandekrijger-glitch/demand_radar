// Elke nacht (Vercel Cron): de kansenkaart opnieuw opbouwen, zodat bezoekers niet hoeven te wachten.
import { getMap, getRising } from '../lib/data.js';

export default async function handler(req, res) {
  try { const [r, d] = await Promise.all([getRising(req).catch(() => null), getMap(req, { pack: 'practice' })]); res.status(200).json({ ok: true, map: d.generatedAt, items: d.items.length, mode: d.mode, rising: r && r.ready ? r.items.month.length : 0 }); }
  catch (e) { res.status(200).json({ ok: false, error: String(e.message || e) }); }
}
