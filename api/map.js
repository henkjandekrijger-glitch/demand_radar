// GET /api/map?pack=practice  of  /api/map?theme=<eigen thema> — de kansenkaart.
// Wordt één keer per dag per thema opgebouwd (Vercel CDN), zodat het snel is en DataForSEO weinig kost.
import { buildMap } from '../lib/map.js';
import { RAW_TOKEN, isPro } from '../lib/access.js';
import { getMap, mapKey, storedMap, saveMap } from '../lib/data.js';
import { gatewayToken } from '../lib/ai.js';
import { PACKS } from '../lib/niches.js';

export default async function handler(req, res) {
  const theme = String(req.query.theme || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const pack = String(req.query.pack || 'practice');
  if (!theme && !PACKS[pack]) return res.status(400).json({ error: 'Unknown theme.' });
  if (theme && theme.length < 3) return res.status(400).json({ error: 'Type a theme of at least 3 characters.' });
  try {
    if (req.query.raw) return res.status(410).json({ error: 'gone' });
    const data = await getMap(req, { pack, theme, build: !!(req.query.rebuild && isPro(req)) });
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(data);
  } catch (e) {
    res.status(/theme|niches/i.test(String(e.message)) ? 400 : 500).json({ error: String(e.message || 'The map could not be built right now.').slice(0, 200) });
  }
}
