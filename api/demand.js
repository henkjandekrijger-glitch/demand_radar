// GET /api/demand — de Demand Radar: wat mensen nu willen, per categorie en land. Eén keer per dag opgebouwd (en dan bijgeleerd).
import { buildDemand, worthKeepingDemand } from '../lib/demand.js';
import { RAW_TOKEN } from '../lib/access.js';
import { gatewayToken } from '../lib/ai.js';
import { getDemand, storedMap, saveMap, demandDay } from '../lib/data.js';
import { getStore, getJSON } from '../lib/store.js';
import { STATE } from '../lib/learn.js';

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
    res.status(200).json(order ? { ...d, order } : d);
  } catch (e) {
    res.status(500).json({ error: 'The radar could not load right now.' });
  }
}
