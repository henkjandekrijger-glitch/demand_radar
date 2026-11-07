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
    else if (t === 'errors') { // DataForSEO-foutenlijst (gratis, buiten de dagrem): ?api=keywords_data|serp|dataforseo_labs|merchant|business_data&fn=<functie>&n=
      const r = await fetch(`https://api.dataforseo.com/v3/${/^[a-z_]+$/.test(String(req.query.api || '')) ? req.query.api : 'keywords_data'}/errors`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Basic ${Buffer.from(`${process.env.DFS_LOGIN}:${process.env.DFS_PASSWORD}`).toString('base64')}` }, body: JSON.stringify([{ limit: Math.min(1000, +(req.query.n || 1000)), offset: 0, ...(req.query.fn ? { filtered_function: String(req.query.fn) } : {}) }]) });
      const j = await r.json(), res = (((j.tasks || [])[0] || {}).result || []); const it = res[0] && res[0].items ? res[0].items : res.filter(x => x && (x.function || x.error_code)); if (!it.length && req.query.raw) { out = JSON.stringify(j).slice(0, 1500); } else {
      const per = {}; for (const x of it) { const k = `${String(x.datetime || '').slice(0, 16)} ${x.function} ${x.error_code}`; per[k] = (per[k] || 0) + 1; }
      out = req.query.one ? it.slice(0, 2) : { n: it.length, perMinute: Object.entries(per).sort((a2, b2) => (a2[0] < b2[0] ? 1 : -1)).slice(0, 60), sample: it.slice(0, 3).map(x => ({ at: x.datetime, fn: x.function, code: x.error_code, msg: x.error_message, url: String(x.http_url || '').slice(0, 120) })) }; }
    }
    else if (t === 'ledger') { const { getStore, getJSON } = await import('../lib/store.js'); const s = getStore(), days = Math.min(14, +(req.query.days || 7)); out = {}; for (let i = 0; i < days; i++) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); const files = await s.list(`dfs/ledger/${d}/`).catch(() => []), j = {}; for (const f of files) { const x = await getJSON(s, f.pathname, null).catch(() => null); for (const [k, v] of Object.entries(x || {})) j[k] = Math.round(((j[k] || 0) + v) * 10000) / 10000; } const old = await getJSON(s, `dfs/ledger-${d}.json`, null).catch(() => null); if (old && !files.length) Object.assign(j, old); const bj = await getJSON(s, `dfs/build-${d}.json`, null).catch(() => null); if (Object.keys(j).length || bj) out[d] = { ...j, buildTotal: bj ? bj.spent : null }; } }
    else if (t === 'url') out = await get(req.query.u, { text: true, timeout: 12000 }).then(x => String(x).slice(0, +(req.query.n || 4000)));
    res.status(200).json({ ms: Date.now() - t0, spent: b.spent, errors: b.errors, out: req.query.full ? out : JSON.stringify(out).slice(0, 6000), loc: C && C.loc, ...(req.query.pad ? { pad: '.'.repeat(Math.min(200000, +req.query.pad || 0)) } : {}) });
  } catch (e) { res.status(200).json({ error: String(e.message || e), errors: b.errors }); }
}
