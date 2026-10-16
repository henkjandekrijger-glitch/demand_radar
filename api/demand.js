// GET /api/demand — de Demand Radar: wat mensen nu willen, per categorie en land. Eén keer per dag opgebouwd (en dan bijgeleerd).
import { buildDemand, worthKeepingDemand, presentDemand } from '../lib/demand.js';
import { RAW_TOKEN, isPro } from '../lib/access.js';
import { gatewayToken } from '../lib/ai.js';
import { getDemand, storedMap, saveMap, demandDay } from '../lib/data.js';
import { getStore, getJSON } from '../lib/store.js';
import { STATE } from '../lib/learn.js';
import { demandText } from './mcp.js';
import { latestEarly } from '../lib/earlydata.js';
import { EARLY } from '../lib/early.js';

// Volgorde van de categorieën leren uit wat bezoekers openen (pas vanaf 30 kliks).
async function learnedOrder() {
  const store = getStore(); if (!store) return null;
  const st = await getJSON(store, STATE, null).catch(() => null);
  const r = st && st.radar; if (!r || (r.open || 0) < 30) return null;
  const c = r.cats || {}, ids = ['products', 'courses', 'books', 'services', 'apps', 'trips', 'money', 'unexpected', 'missing', 'coming'];
  const sc = id => (c[id] || 0) + (c[`tab-${id}`] || 0) + (id === 'unexpected' ? c.today || 0 : 0);
  return ids.sort((a, b) => sc(b) - sc(a));
}

// Vroege signalen (lib/earlydata.js, dagelijks doorgerekend) als eigen tabblad naast "Will rise".
const oneIn = pct => `1 in ${Math.max(2, Math.round(100 / Math.max(pct, 0.5)))}`;
async function withEarly(d) {
  const L = await latestEarly(getStore());
  d.early = L ? L.items.map(x => ({ ...x, name: x.k.charAt(0).toUpperCase() + x.k.slice(1), keyword: x.k })) : [];
  const t = EARLY && EARLY.test, desc = t ? `Not broken out yet, but the pattern matches searches that did. Tested: ${oneIn(t.hidden.hit)} "not visible yet" broke out within 6 months (normally ${oneIn(t.hidden.base)}); ${Math.round(t.starting.hit)}% of the "starting" ones did.` : 'Not broken out yet, but the pattern matches searches that did';
  const v = { id: 'early', name: 'Early signals', desc, n: d.early.length };
  const views = (d.views || []).filter(x => x.id !== 'early'), at = views.findIndex(x => x.id === 'rise');
  views.splice(at < 0 ? 0 : at + 1, 0, v); d.views = views;
  if (L) d.earlyMonth = L.month;
}

export default async function handler(req, res) {
  try {
    if (req.query.raw) return res.status(410).json({ error: 'gone' });
    // Eigenaar: ?rebuild=1&key=… bouwt vandaag opnieuw (na een update), anders één opbouw per dag.
    if (req.query.rebuild && isPro(req)) { const nd = await getDemand(req, { build: true }); return res.status(200).json({ rebuilt: !nd.stale, day: nd.day, spent: nd.spent, items: (nd.items || []).length, rise: (nd.rise || []).length, note: nd.buildNote || null }); }
    const d = presentDemand(await getDemand(req));
    if (d && d.ready) await withEarly(d).catch(() => {});
    const order = await learnedOrder().catch(() => null);
    res.setHeader('Cache-Control', 'private, no-store');
    // Voor tools en collega's: ?view=courses&cc=NL&limit=20 geeft een korte lijst; ?format=text geeft leesbare tekst.
    const { view, cc, limit, format } = req.query;
    if (view || cc || limit || format) {
      const v = String(view || 'rise'), c = ['NL', 'DE', 'US'].includes(String(cc || '').toUpperCase()) ? String(cc).toUpperCase() : 'ALL', n = Math.max(1, Math.min(100, +limit || 20));
      if (format === 'text') { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.status(200).send(demandText(d, v, c, n)); }
      const on = x => c === 'ALL' || x.cc === c;
      const pick = v === 'early' ? (d.early || []).filter(on) : v === 'rise' ? (d.rise || []).filter(on) : v === 'missing' ? d.missing.filter(on) : v === 'coming' ? d.coming.filter(on) : v === 'unexpected' ? [...d.today.filter(on), ...d.items.filter(on).filter(x => x.unexpected)] : d.items.filter(on).filter(x => v === 'now' || x.cat === v);
      return res.status(200).json({ day: d.day, period: d.period, view: v, country: c, items: pick.slice(0, n).map(x => { const { series, members, srcs, weight, base, ...rest } = x; return { ...rest, also: members ? members.slice(1, 4).map(m => m.k) : undefined }; }) });
    }
    res.status(200).json(order ? { ...d, order } : d);
  } catch (e) {
    res.status(500).json({ error: 'The radar could not load right now.' });
  }
}
