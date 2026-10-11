// GET /api/radar — het hele radaroverzicht. Gratis bezoekers krijgen een gemaskerde versie.
// De ruwe data wordt via /api/radar?raw=<token> één keer per uur opgebouwd en door Vercel's CDN bewaard.
import { buildRadar } from '../lib/core.js';
import { isPro, maskRadar, RAW_TOKEN } from '../lib/access.js';
import { getRadar } from '../lib/data.js';

export default async function handler(req, res) {
  try {
    if (req.query.raw) {
      if (req.query.raw !== RAW_TOKEN) return res.status(403).json({ error: 'forbidden' });
      const data = await buildRadar();
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).json(data);
    }
    const data = await getRadar(req);
    const pro = isPro(req);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json({ pro, ...(pro ? data : maskRadar(data)) });
  } catch (e) {
    res.status(500).json({ error: 'The radar could not load right now. Try again in a minute.' });
  }
}
