// Elke nacht (Vercel Cron): de kansenkaart opnieuw opbouwen, zodat bezoekers niet hoeven te wachten.
import { getMap } from '../lib/data.js';

export default async function handler(req, res) {
  try { const d = await getMap(req, { pack: 'practice' }); res.status(200).json({ ok: true, map: d.generatedAt, items: d.items.length, mode: d.mode }); }
  catch (e) { res.status(200).json({ ok: false, error: String(e.message || e) }); }
}
