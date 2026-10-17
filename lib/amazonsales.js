// Amazon "gekocht vorige maand": echte verkoop per zoekterm (DataForSEO Merchant Amazon products, veld bought_past_month).
// Eén keer per maand: voor de zoektermen die ertoe doen (wildcards, gevolgde bedrijven, vroege signalen, voorspelde stijgers)
// de Amazon-zoekresultaten opvragen (wachtrij, async) en optellen hoeveel er vorige maand gekocht is. Zo kunnen we voorspellingen
// toetsen aan verkoop, niet alleen aan zoeken. Opslag: amzsales/<cc>/<JJJJ-MM>.json, stand in amzsales/state.json.
import { getJSON, putJSON } from './store.js';

const LOC = { NL: [2528, 'nl_NL'], DE: [2276, 'de_DE'], US: [2840, 'en_US'] };
const STATE = 'amzsales/state.json', OUT = (cc, m) => `amzsales/${cc}/${m}.json`;
const PER_CC = +(process.env.AMZ_SALES_PER_CC || 150);

// Uit één Amazon-resultatenpagina: totaal gekocht vorige maand (organische producten), aantal met cijfer, top 5 en mediaanprijs.
export function salesFrom(items) {
  const prods = (items || []).flatMap(i => (i.type === 'editorial_recommendations' ? i.items || [] : [i])).filter(i => i && (i.type === 'amazon_serp' || i.type === 'amazon_serp_element' || i.data_asin) && i.type !== 'amazon_paid');
  const seen = new Set(), rows = [];
  for (const p of prods) { if (!p.data_asin || seen.has(p.data_asin)) continue; seen.add(p.data_asin); rows.push({ asin: p.data_asin, title: String(p.title || '').slice(0, 90), bought: +p.bought_past_month || 0, price: p.price_from ?? null }); }
  const withB = rows.filter(r => r.bought > 0), prices = rows.map(r => r.price).filter(x => x != null).sort((a, b) => a - b);
  return { units: withB.reduce((t, r) => t + r.bought, 0), products: rows.length, withData: withB.length, price: prices.length ? prices[Math.floor(prices.length / 2)] : null,
    top: withB.sort((a, b) => b.bought - a.bought).slice(0, 5) };
}

// Welke zoektermen: wildcards, gevolgde bedrijven, vroege signalen, voorspelde stijgers (max PER_CC per land).
export async function salesTerms(store) {
  const by = { NL: new Set(), DE: new Set(), US: new Set() }, add = (cc, k) => { if (by[cc] && k && by[cc].size < PER_CC) by[cc].add(String(k).toLowerCase().trim()); };
  const { WILD } = await import('./wildcards.js');
  for (const w of WILD) for (const t of w.tests || []) add(t.cc, t.k);
  const ix = (await getJSON(store, 'mine/index.json', null).catch(() => null)) || [];
  for (const x of ix) { const r = await getJSON(store, `mine/${x.id}.json`, null).catch(() => null); if (r) for (const [cc, ks] of Object.entries(r.profile.terms || {})) ks.slice(0, 10).forEach(k => add(cc, k)); }
  const L = await getJSON(store, 'early/latest.json', null).catch(() => null);
  for (const x of (L && L.items) || []) add(x.cc, x.k);
  const { storedMap } = await import('./data.js'), d = await storedMap('demand', 365 * 864e5).catch(() => null);
  for (const x of (d && d.rise) || []) add(x.cc, x.keyword);
  return Object.fromEntries(Object.entries(by).map(([cc, s]) => [cc, [...s]]));
}

// Elk uur vanuit /api/loop: begin van de maand taken posten (± $0,002 per zoekterm), daarna gratis ophalen wat klaar is.
export async function amazonSales(store, now = new Date()) {
  const { dfsReady, dfsPostMany, dfsGet, budget, underCap } = await import('./dfs.js');
  if (!dfsReady()) return { ok: false };
  const month = now.toISOString().slice(0, 7), st = (await getJSON(store, STATE, null).catch(() => null)) || {};
  if (st.month !== month) {
    if (!(await underCap(1))) return { wait: 'daily data budget' };
    const terms = await salesTerms(store), b = budget(+(process.env.AMZ_SALES_MAX || 1)), tasks = {};
    for (const [cc, ks] of Object.entries(terms)) {
      for (let i = 0; i < ks.length; i += 100) {
        if (b.spent >= b.max) break;
        const res = await dfsPostMany('merchant/amazon/products/task_post', ks.slice(i, i + 100).map(k => ({ keyword: k, location_code: LOC[cc][0], language_code: LOC[cc][1], depth: 100, tag: `${cc}|${k}` })), b);
        for (const t of res) if (t.ok && t.id) tasks[t.id] = t.tag || `${cc}|`;
      }
    }
    await putJSON(store, STATE, { month, postedAt: now.toISOString(), posted: Object.keys(tasks).length, open: tasks, spent: Math.round(b.spent * 1000) / 1000, errors: b.errors.slice(0, 3) });
    return { posted: Object.keys(tasks).length, spent: b.spent };
  }
  const open = st.open || {}; if (!Object.keys(open).length) return { amazonSales: 'done', month };
  const ready = await dfsGet('merchant/amazon/products/tasks_ready').catch(() => null);
  const ids = (((ready && ready.tasks) || [])[0] || {}).result || [];
  const todo = ids.map(x => x.id).filter(id => open[id]).slice(0, 60), out = {};
  for (let i = 0; i < todo.length; i += 10) {
    await Promise.all(todo.slice(i, i + 10).map(async id => {
      const j = await dfsGet(`merchant/amazon/products/task_get/advanced/${id}`).catch(() => null), t = j && j.tasks && j.tasks[0];
      if (!t || t.status_code !== 20000) return;
      const [cc, k] = String(open[id]).split('|'), r = (t.result || [])[0] || {};
      (out[cc] = out[cc] || {})[k] = { ...salesFrom(r.items), at: now.toISOString().slice(0, 10) };
      delete open[id];
    }));
  }
  for (const [cc, v] of Object.entries(out)) { const f = (await getJSON(store, OUT(cc, month), null).catch(() => null)) || {}; await putJSON(store, OUT(cc, month), { ...f, ...v }); }
  // taken die na 3 dagen nog niet klaar zijn: opgeven (DataForSEO bewaart ze 30 dagen, maar dan is er iets mis)
  const late = now.getTime() - Date.parse(st.postedAt || now.toISOString()) > 3 * 864e5 && !todo.length;
  await putJSON(store, STATE, { ...st, open: late ? {} : open, got: (st.got || 0) + todo.length });
  return { got: todo.length, left: late ? 0 : Object.keys(open).length };
}

export async function salesFor(store, cc, month) { return (await getJSON(store, OUT(cc, month), null).catch(() => null)) || {}; }
