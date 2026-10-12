// Vercel Cron: elk uur de radar, elke nacht de kansenkaart opnieuw opbouwen zodat bezoekers niet hoeven te wachten.
import { getRadar, getMap } from '../lib/data.js';

export default async function handler(req, res) {
  try {
    if (req.query.map) { const d = await getMap(req, { pack: 'practice' }); return res.status(200).json({ ok: true, map: d.generatedAt, items: d.items.length, mode: d.mode }); }
    const d = await getRadar(req);
    res.status(200).json({ ok: true, radar: d.generatedAt });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e) });
  }
}
