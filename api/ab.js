// /api/ab — de varianten van de pagina en hoe vaak elke variant getoond wordt (gezet door de uurronde).
import { getStore } from '../lib/store.js';
import { loadState, DEFAULTS } from '../lib/learn.js';

export default async function handler(req, res) {
  const store = getStore();
  let page = { variants: DEFAULTS.page, weights: { A: 1 / 3, B: 1 / 3, C: 1 / 3 } };
  if (store) { try { const st = await loadState(store); page = { variants: st.page.variants, weights: st.page.weights }; } catch {} }
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
  res.status(200).json(page);
}
