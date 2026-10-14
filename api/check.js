// GET /api/check?q=<idee>&m=NL|US|DE|WW[&c=<stad>] — één idee, product of dienst tegen verse data houden.
// Ruwe uitkomst wordt 6 uur per idee+markt+stad bewaard. Pro + ANTHROPIC_API_KEY = ook AI-analist met webonderzoek.
// Pro-toegang via het cookie of via &key=<sleutel> (voor gebruik vanuit andere tools).
import { buildCheck, MARKETS } from '../lib/core.js';
import { isPro, canSee, maskCheck, RAW_TOKEN, OPEN } from '../lib/access.js';
import { getCheck } from '../lib/data.js';
import { gatewayToken, aiAvailable } from '../lib/ai.js';
import { getStore } from '../lib/store.js';
import { checked } from '../lib/signals.js';
import { isBot } from '../lib/bots.js';

export default async function handler(req, res) {
  const q = String(req.query.q || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const m = String(req.query.m || 'NL').toUpperCase();
  const c = String(req.query.c || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (q.length < 2 || !MARKETS[m]) return res.status(400).json({ error: 'Type an idea, product or service (2 to 80 characters) and pick a market.' });
  try {
    if (req.query.raw) {
      if (req.query.raw !== RAW_TOKEN) return res.status(403).json({ error: 'forbidden' });
      const data = await buildCheck(q, m, { ai: req.query.ai === '1', city: c, aiToken: gatewayToken(req) });
      res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
      return res.status(200).json(data);
    }
    if (!isBot(req)) checked(getStore(), { cc: m, q }).catch(() => {}); // wat mensen checken is zelf een vraagsignaal
    const pro = isPro(req);
    const data = await getCheck(req, q, m, { ai: pro && req.query.ai !== '0', city: c });
    data.q = q;
    res.setHeader('Cache-Control', 'private, no-store');
    const see = canSee(req);
    res.status(200).json({ pro: see, open: OPEN, aiEnabled: pro && aiAvailable(req), ...(see ? data : maskCheck(data)) });
  } catch (e) {
    res.status(500).json({ error: 'The check failed. Try again in a minute.' });
  }
}
