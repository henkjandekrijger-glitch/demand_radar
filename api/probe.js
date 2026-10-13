// /api/probe — alleen voor de eigenaar: test één bron vanaf Vercel en geef de ruwe uitkomst terug (voor controle bij bouwen).
import { isPro } from '../lib/access.js';
import { call, budget } from '../lib/dfs.js';
import { get } from '../lib/core.js';
import { COUNTRIES } from '../lib/niches.js';

export default async function handler(req, res) {
  if (!isPro(req)) return res.status(403).json({ error: 'forbidden' });
  const t = req.query.t, C = COUNTRIES[req.query.cc || 'NL'], b = budget(0.2), t0 = Date.now();
  try {
    let out;
    if (t === 'dfs') out = await call(req.query.path, JSON.parse(req.query.task || '{}'), b);
    else if (t === 'locs') { const { adsLocations } = await import('../lib/dfs.js'); const all = await adsLocations(req.query.cc || 'NL'); out = all.filter(l => !req.query.f || l.name.toLowerCase().includes(String(req.query.f).toLowerCase())).slice(0, 30).concat([{ total: all.length }]); }
    else if (t === 'url') out = await get(req.query.u, { text: true, timeout: 12000 }).then(x => String(x).slice(0, +(req.query.n || 4000)));
    res.status(200).json({ ms: Date.now() - t0, spent: b.spent, errors: b.errors, out: req.query.full ? out : JSON.stringify(out).slice(0, 6000), loc: C && C.loc });
  } catch (e) { res.status(200).json({ error: String(e.message || e), errors: b.errors }); }
}
