// GET /api/radar — het hele radaroverzicht. Gratis bezoekers krijgen een gemaskerde versie.
// De ruwe data wordt via /api/radar?raw=<token> één keer per uur opgebouwd en door Vercel's CDN bewaard.
import { buildRadar } from '../lib/core.js';
import { isPro, maskRadar, RAW_TOKEN, selfBase } from '../lib/access.js';

let mem = null;

async function rawData(req) {
  try {
    const r = await fetch(`${selfBase(req)}/api/radar?raw=${RAW_TOKEN}`, { signal: AbortSignal.timeout(58000) });
    if (r.ok) return await r.json();
  } catch {}
  if (!mem || Date.now() - mem.t > 3600e3) mem = { t: Date.now(), d: await buildRadar() };
  return mem.d;
}

export default async function handler(req, res) {
  try {
    if (req.query.raw) {
      if (req.query.raw !== RAW_TOKEN) return res.status(403).json({ error: 'forbidden' });
      const data = await buildRadar();
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).json(data);
    }
    const data = await rawData(req);
    const pro = isPro(req);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json({ pro, ...(pro ? data : maskRadar(data)) });
  } catch (e) {
    res.status(500).json({ error: 'The radar could not load right now. Try again in a minute.' });
  }
}
