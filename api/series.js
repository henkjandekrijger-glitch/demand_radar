// /api/series — alleen voor de eigenaar: historische zoekreeksen (Google Ads, 25 maanden) voor een brede steekproef per land,
// om voorspelmodellen op te toetsen. Steekproef = populairste zoekopdrachten (niet geselecteerd op groei, dus eerlijk) + categorieën.
import { isPro } from '../lib/access.js';
import { budget, topSearches, searchVolume, cleanKw, longTrends } from '../lib/dfs.js';
import { pool } from '../lib/core.js';
import { COUNTRIES } from '../lib/niches.js';

export default async function handler(req, res) {
  if (!isPro(req)) return res.status(403).json({ error: 'forbidden' });
  const cc = String(req.query.cc || 'NL').toUpperCase(), C = COUNTRIES[cc];
  if (!C) return res.status(400).json({ error: 'cc' });
  const b = budget(1), min = { NL: 300, DE: 1000, US: 3000 }[cc];
  // POST {keywords: [...]} met ?trends=1: 5 jaar weekdata per zoekterm (gegroepeerd per 5, in de aangeleverde volgorde).
  if (req.method === 'POST' && req.query.trends) {
    let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const kws = (body && body.keywords || []).slice(0, 600), groups = [];
    for (let i = 0; i < kws.length; i += 5) groups.push(kws.slice(i, i + 5));
    const tb = budget(1.5);
    const parts = await pool(groups, 25, g => longTrends(g, C, tb));
    const all = Object.assign({}, ...parts.filter(Boolean)), first = Object.values(all)[0];
    // Compact: één datumlijst, per zoekterm alleen de waarden (anders te groot voor één antwoord).
    return res.status(200).json({ cc, spent: tb.spent, errors: tb.errors.slice(0, 5), dates: first ? first.map(x => x.d) : [], trends: Object.fromEntries(Object.entries(all).map(([k, a]) => [k, a.map(x => x.v)])) });
  }
  const offset = +req.query.offset || 0;
  // mode=pop: populairste (geen groeifilter); mode=mid: middelgroot volume; mode=grow: wat de radar zou kiezen (hardst gegroeid)
  const mode = String(req.query.mode || 'pop');
  const pop = mode === 'grow'
    ? (await Promise.all([topSearches(C, b, { order: 'monthly', minVolume: min, limit: 300 }), topSearches(C, b, { order: 'yearly', minVolume: min, limit: 300 }), topSearches(C, b, { order: 'monthly', by: 'volume', minGrowth: 50, minVolume: min, limit: 300 })])).flat()
    : mode === 'mid'
      ? await topSearches(C, b, { by: 'volume', minGrowth: -100, minVolume: min, limit: 1000, intent: ['commercial', 'transactional'], regex: '^[a-zäöüß]+ [a-zäöüß]+( [a-zäöüß]+)?$' })
      : await topSearches(C, b, { by: 'volume', minGrowth: -100, minVolume: min, limit: 1000, intent: ['commercial', 'transactional'] });
  const seen = new Set(), kws = [];
  for (const x of pop) { const k = cleanKw(x.k); const core = x.core || k; if (!seen.has(core)) { seen.add(core); kws.push(k); } }
  const pick = kws.slice(offset, offset + 1000);
  const ads = await searchVolume(pick, C, b);
  const series = Object.fromEntries(Object.entries(ads).filter(([, a]) => a.monthly && a.monthly.length >= 20).map(([k, a]) => [k, { v: a.volume, cpc: a.cpc, m: [...a.monthly].sort((p, q) => p.y - q.y || p.m - q.m).map(x => [x.y, x.m, x.v]) }]));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ cc, spent: b.spent, errors: b.errors, pool: pop.length, unique: kws.length, n: Object.keys(series).length, series });
}
