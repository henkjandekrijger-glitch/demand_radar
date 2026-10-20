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
    else if (t === 'gmb') { // Google-bedrijfsprofielen (score, aantal reviews, site) voor een lijst namen; max 25 per keer; gebruikt door hjdk-api voor de Curaçao-keuzehulpen
      const qs = JSON.parse(req.query.qs || '[]').slice(0, 25); const loc = +(req.query.loc || 1000009); const lang = String(req.query.lang || 'en'); const b2 = budget(0.5); out = [];
      for (let i = 0; i < qs.length; i += 5) { const part = await Promise.all(qs.slice(i, i + 5).map(async q => { const r = await call('business_data/google/my_business_info/live', { keyword: String(q).slice(0, 120), location_code: loc, language_code: lang }, b2); const it = ((r || [])[0] || {}).items && r[0].items[0]; return it ? { q, naam: it.title, score: it.rating && it.rating.value, aantal: it.rating && it.rating.votes_count, site: it.url || it.domain || null, adres: it.address || null, cat: it.category || null, cid: it.cid || null, place_id: it.place_id || null } : { q, niet: true }; })); out.push(...part); }
      b.spent += b2.spent; b.errors.push(...b2.errors.slice(0, 3)); }
    else if (t === 'locs') { const { adsLocations } = await import('../lib/dfs.js'); const all = await adsLocations(req.query.cc || 'NL'); out = all.filter(l => !req.query.f || l.name.toLowerCase().includes(String(req.query.f).toLowerCase())).slice(0, 30).concat([{ total: all.length }]); }
    else if (t === 'balance') {
      const r = await fetch('https://api.dataforseo.com/v3/appendix/user_data', { headers: { Authorization: `Basic ${Buffer.from(`${process.env.DFS_LOGIN}:${process.env.DFS_PASSWORD}`).toString('base64')}` } });
      const j = await r.json(); const u = (((j.tasks || [])[0] || {}).result || [])[0] || {};
      out = { balance: u.money && u.money.balance, total: u.money && u.money.total, limits: u.money && u.money.limits, spentToday: u.money && u.money.statistics && u.money.statistics.day, rates: u.rates && u.rates.statistics && u.rates.statistics.day };
    }
    else if (t === 'url') out = await get(req.query.u, { text: true, timeout: 12000 }).then(x => String(x).slice(0, +(req.query.n || 4000)));
    res.status(200).json({ ms: Date.now() - t0, spent: b.spent, errors: b.errors, out: req.query.full ? out : JSON.stringify(out).slice(0, 6000), loc: C && C.loc });
  } catch (e) { res.status(200).json({ error: String(e.message || e), errors: b.errors }); }
}
