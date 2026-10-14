// POST /api/outcome?key=<sleutel> — resultaten van eigen campagnes terugmelden, zodat de radar leert wat echt verkoopt.
// Body: {cc, term, network, clicks, conversions, spend, revenue, date} of een lijst daarvan. Alleen met een geldige sleutel.
import { getStore } from '../lib/store.js';
import { outcome } from '../lib/signals.js';
import { isPro } from '../lib/access.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isPro(req)) return res.status(401).json({ error: 'Add ?key=<your Demand Radar key>.' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST {cc, term, network, clicks, conversions, spend, revenue, date}' });
  let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
  const list = (Array.isArray(b) ? b : [b]).filter(Boolean).slice(0, 500);
  let n = 0; for (const o of list) if (await outcome(getStore(), o).catch(() => false)) n++;
  res.status(200).json({ ok: true, saved: n });
}
