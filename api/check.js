// GET /api/check?q=<idee>&m=NL|US|DE|WW — één idee, product of dienst tegen verse data houden.
// Ruwe uitkomst wordt 6 uur per idee+markt bewaard. Pro + ANTHROPIC_API_KEY = ook AI-analist met webonderzoek.
import { buildCheck, MARKETS } from '../lib/core.js';
import { isPro, maskCheck, RAW_TOKEN, selfBase } from '../lib/access.js';

export default async function handler(req, res) {
  const q = String(req.query.q || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const m = String(req.query.m || 'NL').toUpperCase();
  if (q.length < 2 || !MARKETS[m]) return res.status(400).json({ error: 'Type an idea, product or service (2 to 80 characters) and pick a market.' });
  try {
    if (req.query.raw) {
      if (req.query.raw !== RAW_TOKEN) return res.status(403).json({ error: 'forbidden' });
      const data = await buildCheck(q, m, { ai: req.query.ai === '1' });
      res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
      return res.status(200).json(data);
    }
    const pro = isPro(req);
    const key = q.toLowerCase();
    let data = null;
    try {
      const r = await fetch(`${selfBase(req)}/api/check?raw=${RAW_TOKEN}&m=${m}&ai=${pro ? 1 : 0}&q=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(58000) });
      if (r.ok) data = await r.json();
    } catch {}
    if (!data) data = await buildCheck(key, m, { ai: pro });
    data.q = q;
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json({ pro, aiEnabled: !!process.env.ANTHROPIC_API_KEY, ...(pro ? data : maskCheck(data)) });
  } catch (e) {
    res.status(500).json({ error: 'The check failed. Try again in a minute.' });
  }
}
