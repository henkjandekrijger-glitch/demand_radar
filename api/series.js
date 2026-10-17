// /api/series — alleen voor de eigenaar: historische zoekreeksen (Google Ads, 25 maanden) voor een brede steekproef per land,
// om voorspelmodellen op te toetsen. Steekproef = populairste zoekopdrachten (niet geselecteerd op groei, dus eerlijk) + categorieën.
import { isPro } from '../lib/access.js';
import { budget, topSearches, searchVolume, cleanKw, longTrends, googleTrends } from '../lib/dfs.js';
import { pool } from '../lib/core.js';
import { COUNTRIES } from '../lib/niches.js';

export default async function handler(req, res) {
  if (!isPro(req)) return res.status(403).json({ error: 'forbidden' });
  // Extra landen alleen voor onderzoek (toets 'loopt een ander land voor?'); de radar zelf bouwt alleen NL/DE/US.
  const EXTRA = { GB: { name: 'United Kingdom', lang: 'en', loc: 2826 }, BE: { name: 'Belgium', lang: 'nl', loc: 2056 }, SE: { name: 'Sweden', lang: 'sv', loc: 2752 }, FR: { name: 'France', lang: 'fr', loc: 2250 } };
  const cc = String(req.query.cc || 'NL').toUpperCase(), C = COUNTRIES[cc] || (req.query.ads ? EXTRA[cc] : null);
  if (!C) return res.status(400).json({ error: 'cc' });
  if (req.query.drivers) { const { allDrivers } = await import('../lib/drivers.js'); return res.status(200).json(await allDrivers(cc, /^\d{4}-\d\d-\d\d$/.test(req.query.from || '') ? req.query.from : undefined)); }
  const b = budget(1), min = { NL: 300, DE: 1000, US: 3000 }[cc];
  // POST {keywords: [...]} met ?trends=1: 5 jaar weekdata per zoekterm (gegroepeerd per 5, in de aangeleverde volgorde).
  if (req.method === 'POST' && req.query.trends) {
    let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const kws = (body && body.keywords || []).slice(0, 600), groups = [];
    const per = Math.max(1, Math.min(5, +req.query.per || 5));
    for (let i = 0; i < kws.length; i += per) groups.push(kws.slice(i, i + per));
    const tb = budget(1.5);
    const fn = req.query.src === 'google' ? googleTrends : longTrends;
    // ?range=past_7_days|past_30_days|past_90_days|past_12_months (alleen met src=google): dag- of weekdata voor korte toetsen
    const range = ['past_7_days', 'past_30_days', 'past_90_days', 'past_12_months', 'past_5_years'].includes(String(req.query.range)) ? String(req.query.range) : null;
    const parts = await pool(groups, 25, g => (range && fn === googleTrends ? fn(g, C, tb, range) : fn(g, C, tb)));
    const all = Object.assign({}, ...parts.filter(Boolean)), first = Object.values(all)[0];
    // Compact: één datumlijst, per zoekterm alleen de waarden (anders te groot voor één antwoord).
    return res.status(200).json({ cc, spent: tb.spent, errors: tb.errors.slice(0, 5), dates: first ? first.map(x => x.d) : [], trends: Object.fromEntries(Object.entries(all).map(([k, a]) => [k, a.map(x => x.v)])) });
  }
  // POST {keywords: [...]} met ?ads=1&months=48: Google Ads-maanddata voor een vaste lijst (opnieuw ophalen met langere historie).
  if (req.method === 'POST' && req.query.ads) {
    let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const kws = (body && body.keywords || []).slice(0, 3000), ab = budget(0.5), parts = [];
    for (let i = 0; i < kws.length; i += 1000) parts.push(await searchVolume(kws.slice(i, i + 1000), C, ab, { months: +req.query.months || 48 }));
    const all = Object.assign({}, ...parts);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ cc, spent: ab.spent, errors: ab.errors.slice(0, 5), n: Object.keys(all).length, series: Object.fromEntries(Object.entries(all).filter(([, a]) => a.monthly && a.monthly.length >= 15).map(([k, a]) => [k, { v: a.volume, cpc: a.cpc, m: [...a.monthly].sort((p, q) => p.y - q.y || p.m - q.m).map(x => [x.y, x.m, x.v]) }])) });
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
  const ads = await searchVolume(pick, C, b, { months: +req.query.months || 25 });
  const series = Object.fromEntries(Object.entries(ads).filter(([, a]) => a.monthly && a.monthly.length >= 20).map(([k, a]) => [k, { v: a.volume, cpc: a.cpc, m: [...a.monthly].sort((p, q) => p.y - q.y || p.m - q.m).map(x => [x.y, x.m, x.v]) }]));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ cc, spent: b.spent, errors: b.errors, pool: pop.length, unique: kws.length, n: Object.keys(series).length, series });
}
