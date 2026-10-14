// Vercel Cron (04:15 UTC). Sinds 13 okt 2026 bouwt de radar alleen op verzoek; met AUTO_BUILD=on in Vercel weer elke nacht.
import { getMap, getDemand, getRising, autoBuild } from '../lib/data.js';

export default async function handler(req, res) {
  if (!autoBuild()) return res.status(200).json({ ok: true, skipped: 'on demand (set AUTO_BUILD=on to build every night)' });
  try { const [r, d] = await Promise.all([getDemand(req).catch(() => null), getMap(req, { pack: 'practice' }).catch(() => null), getRising(req).catch(() => null)]); res.status(200).json({ ok: true, demand: r && r.items ? r.items.length : 0, map: d && d.items ? d.items.length : 0 }); }
  catch (e) { res.status(200).json({ ok: false, error: String(e.message || e) }); }
}
