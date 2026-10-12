// GET /api/rising — gemeten zoekopdrachten die het hardst groeien in NL, DE en de VS (DataForSEO), één keer per dag ververst.
import { buildRising, worthKeeping } from '../lib/rising.js';
import { RAW_TOKEN } from '../lib/access.js';
import { gatewayToken } from '../lib/ai.js';
import { getRising, storedMap, saveMap } from '../lib/data.js';

export default async function handler(req, res) {
  try {
    if (req.query.raw) {
      if (req.query.raw !== RAW_TOKEN) return res.status(403).json({ error: 'forbidden' });
      let d = await storedMap('rising');
      if (!d) { d = await buildRising({ aiToken: gatewayToken(req) }); if (worthKeeping(d)) await saveMap('rising', d); }
      res.setHeader('Cache-Control', worthKeeping(d) ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'no-store');
      return res.status(200).json(d);
    }
    const d = await getRising(req);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(d);
  } catch (e) {
    res.status(500).json({ error: 'Rising searches could not load right now.' });
  }
}
