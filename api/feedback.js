// POST /api/feedback {cc, k, cat, vote: 1|-1, view} — "klopt / klopt niet" op een onderwerp van de radar.
import { getStore } from '../lib/store.js';
import { feedback } from '../lib/signals.js';
import { isBot } from '../lib/bots.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  if (isBot(req)) return res.status(204).end();
  let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  const ok = await feedback(getStore(), b || {}).catch(() => false);
  res.status(ok ? 200 : 400).json({ ok: !!ok });
}
