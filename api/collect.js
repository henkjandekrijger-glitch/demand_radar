// /api/collect — alleen voor de eigenaar: historie ophalen uit gratis bronnen om het voorspelmodel op te toetsen en te trainen.
// POST {keywords: [...]} met ?cc=NL&src=wiki|gdelt  →  { "zoekterm": { title?, m: [[jaar, maand, waarde], ...] } }
import { isPro } from '../lib/access.js';
import { pool } from '../lib/core.js';
import { wikiArticle, wikiMonthly, gdeltMonthly } from '../lib/attention.js';

export default async function handler(req, res) {
  if (!isPro(req)) return res.status(403).json({ error: 'forbidden' });
  const cc = String(req.query.cc || 'NL').toUpperCase(), src = String(req.query.src || 'wiki');
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const kws = ((body && body.keywords) || []).slice(0, src === 'gdelt' ? 60 : 400);
  const t0 = Date.now(), errors = [];
  const out = {};
  if (src === 'wiki') {
    await pool(kws, 12, async k => {
      try { const title = await wikiArticle(k, cc); out[k] = title ? { title, m: await wikiMonthly(title, cc) } : { title: null, m: [] }; }
      catch (e) { errors.push(String(e.message || e).slice(0, 80)); }
    });
  } else if (src === 'gdelt') {
    // GDELT vraagt rustig aan: één verzoek tegelijk met een korte pauze.
    for (const k of kws) {
      if (Date.now() - t0 > 270000) break;
      try { out[k] = { m: await gdeltMonthly(k, cc) }; } catch (e) { errors.push(`${k}: ${String(e.message || e).slice(0, 60)}`); }
      await new Promise(r => setTimeout(r, +(req.query.wait || 1500)));
    }
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ cc, src, ms: Date.now() - t0, n: Object.keys(out).length, errors: errors.slice(0, 8), data: out });
}
