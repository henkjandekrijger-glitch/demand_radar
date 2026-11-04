// /api/fill — Claude vult de radarteksten in vanuit een eigen sessie, zonder Vercel AI Gateway (lib/claudefill.js).
// GET: wat er vandaag nog een tekst mist + instructie en formaat (openbaar, alleen radargegevens).
// POST (eigenaar, ?key=…): de antwoorden meteen toepassen. Eigenaar ?repo=1: fill/<dag>.json van tak `fill` nu ophalen.
import { getStore } from '../lib/store.js';
import { isPro } from '../lib/access.js';
import { pendingFill, applyFill, fillFromRepo } from '../lib/claudefill.js';
import { getRadar } from '../lib/data.js';

export default async function handler(req, res) {
  const store = getStore(); if (!store) return res.status(503).json({ error: 'no storage' });
  try {
    if (req.method === 'POST') {
      if (!isPro(req)) return res.status(403).json({ error: 'forbidden' });
      let f = req.body; if (typeof f === 'string') { try { f = JSON.parse(f); } catch { return res.status(400).json({ error: 'bad json' }); } }
      return res.status(200).json(await applyFill(store, f, { by: 'claude' }));
    }
    if (req.query.repo && isPro(req)) { const { demandDay } = await import('../lib/data.js'); return res.status(200).json(await fillFromRepo(store, String(req.query.day || demandDay()))); }
    const radar = await getRadar(req).catch(() => null);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(await pendingFill(store, { radar }));
  } catch (e) { res.status(500).json({ error: String(e.message || e).slice(0, 200) }); }
}
