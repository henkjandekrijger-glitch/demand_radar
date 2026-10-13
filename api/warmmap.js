// Elke nacht (Vercel Cron): de Demand Radar (met leerronde) en de kansenkaart opnieuw opbouwen, zodat bezoekers niet hoeven te wachten.
import { getMap, getDemand } from '../lib/data.js';

export default async function handler(req, res) {
  try { const [r, d] = await Promise.all([getDemand(req).catch(() => null), getMap(req, { pack: 'practice' })]); res.status(200).json({ ok: true, map: d.generatedAt, items: d.items.length, mode: d.mode, demand: r && r.ready ? r.items.length : 0 }); }
  catch (e) { res.status(200).json({ ok: false, error: String(e.message || e) }); }
}
