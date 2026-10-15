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
import { planOf, PLANS, usage, useOne } from '../lib/account.js';

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
    // Abonnement: aantal checks per maand (bezoeker/gratis 3, Pro 300, Business 2000, team onbeperkt).
    const store = getStore(), p = await planOf(req, store), lim = PLANS[p.plan].checks;
    if (Number.isFinite(lim) && store) {
      const u = await usage(store, p.id);
      if (u.n >= lim) return res.status(402).json({ limit: true, plan: p.plan, used: u.n, max: lim, signedIn: !!p.email, error: p.plan === 'anon' || p.plan === 'free' ? `You used your ${lim} free checks this month.` : `You reached the ${lim} checks of your plan this month.` });
    }
    const pro = !!PLANS[p.plan].ai;
    const data = await getCheck(req, q, m, { ai: pro && req.query.ai !== '0', city: c });
    if (Number.isFinite(lim) && store && !data.budgetReached) await useOne(store, p.id);
    data.q = q;
    if (data && !data.advice && data.measured !== undefined) { try { const { advise } = await import('../lib/advice.js'); data.advice = advise(data); } catch {} } // ook voor oudere, bewaarde checks
    res.setHeader('Cache-Control', 'private, no-store');
    const see = canSee(req);
    res.status(200).json({ pro: see, open: OPEN, aiEnabled: pro && aiAvailable(req), plan: p.plan, ...(see ? data : maskCheck(data)) });
  } catch (e) {
    res.status(500).json({ error: 'The check failed. Try again in a minute.' });
  }
}
