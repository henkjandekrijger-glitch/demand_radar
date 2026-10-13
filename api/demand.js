// GET /api/demand — de Demand Radar: wat mensen nu willen, per categorie en land. Eén keer per dag opgebouwd (en dan bijgeleerd).
import { buildDemand, worthKeepingDemand } from '../lib/demand.js';
import { RAW_TOKEN } from '../lib/access.js';
import { gatewayToken } from '../lib/ai.js';
import { getDemand, storedMap, saveMap, demandDay } from '../lib/data.js';
import { getStore, getJSON } from '../lib/store.js';
import { STATE } from '../lib/learn.js';
import { demandText } from './mcp.js';

// Volgorde van de categorieën leren uit wat bezoekers openen (pas vanaf 30 kliks).
async function learnedOrder() {
  const store = getStore(); if (!store) return null;
  const st = await getJSON(store, STATE, null).catch(() => null);
  const r = st && st.radar; if (!r || (r.open || 0) < 30) return null;
  const c = r.cats || {}, ids = ['products', 'courses', 'books', 'services', 'apps', 'trips', 'money', 'unexpected', 'missing', 'coming'];
  const sc = id => (c[id] || 0) + (c[`tab-${id}`] || 0) + (id === 'unexpected' ? c.today || 0 : 0);
  return ids.sort((a, b) => sc(b) - sc(a));
}

export default async function handler(req, res) {
  try {
    if (req.query.raw) {
      if (req.query.raw !== RAW_TOKEN) return res.status(403).json({ error: 'forbidden' });
      const day = String(req.query.d || demandDay()).slice(0, 10);
      let d = await storedMap('demand');
      if (d && d.day !== day) d = null;
      if (!d) { d = await buildDemand({ aiToken: gatewayToken(req), day }); if (worthKeepingDemand(d)) await saveMap('demand', d); }
      res.setHeader('Cache-Control', worthKeepingDemand(d) ? 'public, s-maxage=93600' : 'no-store');
      return res.status(200).json(d);
    }
    const d = await getDemand(req);
    const order = await learnedOrder().catch(() => null);
    res.setHeader('Cache-Control', 'private, no-store');
    // Voor tools en collega's: ?view=courses&cc=NL&limit=20 geeft een korte lijst; ?format=text geeft leesbare tekst.
    const { view, cc, limit, format } = req.query;
    if (view || cc || limit || format) {
      const v = String(view || 'now'), c = ['NL', 'DE', 'US'].includes(String(cc || '').toUpperCase()) ? String(cc).toUpperCase() : 'ALL', n = Math.max(1, Math.min(100, +limit || 20));
      if (format === 'text') { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.status(200).send(demandText(d, v, c, n)); }
      const on = x => c === 'ALL' || x.cc === c;
      const pick = v === 'missing' ? d.missing.filter(on) : v === 'coming' ? d.coming.filter(on) : v === 'unexpected' ? [...d.today.filter(on), ...d.items.filter(on).filter(x => x.unexpected)] : d.items.filter(on).filter(x => v === 'now' || x.cat === v);
      return res.status(200).json({ day: d.day, period: d.period, view: v, country: c, items: pick.slice(0, n).map(x => { const { series, members, srcs, weight, base, ...rest } = x; return { ...rest, also: members ? members.slice(1, 4).map(m => m.k) : undefined }; }) });
    }
    res.status(200).json(order ? { ...d, order } : d);
  } catch (e) {
    res.status(500).json({ error: 'The radar could not load right now.' });
  }
}
