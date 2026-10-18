// Marktprijzen per product van een eigen winkel (nu Yoors Shop), voor het prijsadvies aan de winkel (hjdk-api, Babita's briefing).
// Per product één korte zoekopdracht (AI maakt die van de titel) bij drie bronnen:
//   bol.com    via de eigen bol-koppeling (hjdk-api /api/bol/search, gratis)
//   Amazon.nl  via DataForSEO Merchant Amazon (wachtrij, ± $0,0015 per product, binnen de dagrem)
//   Amazon.de  via Keepa (10 tokens per product)
// Daarna beoordeelt AI per bron of er hetzelfde product tussen zit ('same') of alleen vergelijkbare ('similar').
// Elk uur een stukje (PER_RUN producten), in de volgorde van de winkel (aanbevolen eerst). Opslag prices/<shop>-NL.json,
// stand prices/<shop>-state.json. Openbaar (kort): /api/feed?shop=yoors&cc=NL&prices=1.
import { getJSON, putJSON } from './store.js';
import { ask, parseJSON } from './ai.js';

const OUT = shop => `prices/${shop}-NL.json`, STATE = shop => `prices/${shop}-state.json`;
const PER_RUN = +(process.env.PRICES_PER_RUN || 40);
const BOL = () => process.env.BOL_API_URL || 'https://keuzehulp.best';
const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^\d.,]/g, '').replace(',', '.')); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
const med = a => { const s = a.filter(x => x != null).sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

// Zoekopdrachten zoals een koper ze typt (Nederlands, 2-5 woorden), voor een hele rij titels in één AI-vraag.
async function queriesFor(items, token) {
  const j = parseJSON(await ask({ token, model: process.env.MINE_MODEL || 'anthropic/claude-haiku-5.5', maxTokens: 2500, system: 'You write short web-shop search queries. JSON only.',
    prompt: `For each Dutch web-shop product title, write the search query (Dutch, 2-5 words, no brand of the shop, keep the product type, size or material if it defines the product) that finds the same product on bol.com or Amazon.nl.\n${items.map((x, i) => `${i + 1}. ${x.title}${x.brand ? ` (brand ${x.brand})` : ''}`).join('\n')}\nJSON: {"q":["...", ...]} in the same order.` }));
  return (j && j.q) || [];
}

async function bolSearch(q) {
  const r = await fetch(`${BOL()}/api/bol/search?q=${encodeURIComponent(q)}&size=8&country=NL`, { signal: AbortSignal.timeout(15000) }).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => null) : null;
  return ((j && j.products) || []).map(p => ({ t: String(p.title || '').slice(0, 110), p: num(p.price), url: p.url || null, ean: p.ean || null })).filter(x => x.p).slice(0, 8);
}
async function keepaDe(q) {
  const { keepaReady } = await import('./keepa.js'); if (!keepaReady()) return [];
  const u = `https://api.keepa.com/search?key=${encodeURIComponent(process.env.KEEPA_KEY)}&domain=3&type=product&term=${encodeURIComponent(q)}&stats=30&history=0`;
  const r = await fetch(u, { signal: AbortSignal.timeout(40000) }).catch(() => null); const j = r && r.ok ? await r.json().catch(() => null) : null;
  return ((j && j.products) || []).slice(0, 8).map(p => { const c = (p.stats && p.stats.current) || []; const v = [c[0], c[1]].filter(x => x > 0); return { t: String(p.title || '').slice(0, 110), p: v.length ? Math.min(...v) / 100 : null, url: `https://www.amazon.de/dp/${p.asin}` }; }).filter(x => x.p);
}
function amzFrom(items) {
  return (items || []).filter(i => i && i.type === 'amazon_serp' && i.data_asin).slice(0, 8).map(i => ({ t: String(i.title || '').slice(0, 110), p: num(i.price_from), url: `https://www.amazon.nl/dp/${i.data_asin}` })).filter(x => x.p);
}

// AI: per product en per bron het nummer van hetzelfde product (of null) en de vergelijkbare.
async function judge(rows, token) {
  const S = ['bol', 'amzNl', 'amzDe'];
  const prompt = `For each shop product, look at the offers found per marketplace. Say which offer is the SAME product (same item, size and material; brand may differ only if it is clearly the same generic item) and which are SIMILAR (same product type and use, comparable size and quality). Prices are in euros.
${rows.map((r, i) => `#${i + 1} ${r.title} — our price €${r.price}\n${S.map(s => (r[s] || []).length ? `  ${s}: ${(r[s] || []).map((o, k) => `[${k + 1}] ${o.t} €${o.p}`).join(' | ')}` : `  ${s}: none`).join('\n')}`).join('\n')}
JSON only: {"r":[{"same":{"bol":2,"amzNl":null,"amzDe":1},"similar":{"bol":[1,3],"amzNl":[2],"amzDe":[]}}, ...]} one entry per product, in order.`;
  const j = parseJSON(await ask({ token, model: process.env.MINE_MODEL || 'anthropic/claude-haiku-5.5', maxTokens: 4000, system: 'You compare product offers across marketplaces. Be strict about SAME. JSON only.', prompt }));
  return (j && j.r) || [];
}

export function summarize(r, v) { // per product: per bron hetzelfde of vergelijkbaar, en de referentieprijzen
  const S = ['bol', 'amzNl', 'amzDe'], out = { same: {}, similar: {} };
  for (const s of S) {
    const L = r[s] || [], si = v && v.same && v.same[s], same = si && L[si - 1];
    if (same) out.same[s] = same;
    const sim = ((v && v.similar && v.similar[s]) || []).map(k => L[k - 1]).filter(Boolean);
    if (sim.length) out.similar[s] = { n: sim.length, median: med(sim.map(x => x.p)), low: Math.min(...sim.map(x => x.p)), ex: sim[0] };
  }
  const sameP = Object.values(out.same).map(x => x.p);
  out.lowSame = sameP.length ? Math.min(...sameP) : null;
  out.medSimilar = med(Object.values(out.similar).map(x => x.median));
  return out;
}

export async function shopPrices(store, shop = 'yoors', { token, now = new Date() } = {}) {
  if (!token) return { skip: 'no AI token' };
  const items = (await getJSON(store, `feed/${shop}-items-NL.json`, null).catch(() => null)) || [];
  if (!items.length) return { skip: 'no products yet' };
  const st = (await getJSON(store, STATE(shop), null).catch(() => null)) || { pending: {}, done: 0 };
  const out = (await getJSON(store, OUT(shop), null).catch(() => null)) || { items: {} };
  const res = { judged: 0, posted: 0 };
  // 1) eerder geposte Amazon.nl-taken ophalen; producten met alle drie de bronnen beoordelen
  const { dfsGet, dfsPostMany, budget, underCap, dfsReady } = await import('./dfs.js');
  const ready = [];
  for (const [id, p] of Object.entries(st.pending || {})) {
    if (p.task && !p.amzNl) {
      const j = await dfsGet(`merchant/amazon/products/task_get/advanced/${p.task}`).catch(() => null), t = j && j.tasks && j.tasks[0];
      if (t && t.status_code === 20000) p.amzNl = amzFrom(((t.result || [])[0] || {}).items);
      else if (Date.parse(now) - Date.parse(p.at) > 2 * 864e5) p.amzNl = []; // na 2 dagen niet meer wachten
    }
    if (!p.task || p.amzNl) ready.push(id);
    if (ready.length >= 40) break;
  }
  for (let i = 0; i < ready.length; i += 20) {
    const batch = ready.slice(i, i + 20).map(id => st.pending[id]);
    let v = []; try { v = await judge(batch, token); } catch (e) { res.error = String(e.message || e).slice(0, 100); break; }
    batch.forEach((p, k) => { out.items[p.id] = { at: now.toISOString().slice(0, 10), q: p.q, price: p.price, ...summarize(p, v[k]) }; delete st.pending[p.id]; res.judged++; });
  }
  // 2) nieuwe producten: zoekopdracht maken, bol en Amazon.de meteen, Amazon.nl in de wachtrij
  const todo = items.filter(x => !out.items[x.id] && !(st.pending || {})[x.id]).slice(0, PER_RUN);
  if (todo.length) {
    const qs = await queriesFor(todo, token).catch(() => []);
    const recs = todo.map((x, i) => ({ id: x.id, title: x.title, price: x.price, q: String(qs[i] || x.title).slice(0, 80), at: now.toISOString() })).filter(r => r.q);
    for (let i = 0; i < recs.length; i += 6) await Promise.all(recs.slice(i, i + 6).map(async r => { r.bol = await bolSearch(r.q).catch(() => []); r.amzDe = await keepaDe(r.q).catch(() => []); }));
    if (dfsReady() && (await underCap(0.2))) {
      const b = budget(0.3), posted = await dfsPostMany('merchant/amazon/products/task_post', recs.map(r => ({ keyword: r.q, location_code: 2528, language_code: 'nl_NL', depth: 20, tag: `price|${r.id}` })), b);
      const byId = new Map(recs.map(r => [`price|${r.id}`, r])); posted.forEach(t => { const r = byId.get(t.tag); if (t.ok && r) { r.task = t.id; res.posted++; } });
    }
    st.pending = st.pending || {}; for (const r of recs) st.pending[r.id] = r;
  }
  out.at = now.toISOString(); out.n = Object.keys(out.items).length;
  await putJSON(store, OUT(shop), out); st.done = out.n; st.left = items.length - out.n; await putJSON(store, STATE(shop), st);
  return { ...res, done: out.n, pending: Object.keys(st.pending).length, left: st.left };
}
export async function pricesFor(store, shop = 'yoors') { return (await getJSON(store, OUT(shop), null).catch(() => null)) || { items: {} }; }
