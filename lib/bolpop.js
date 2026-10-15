// bol.com: de populairste producten van dit moment (NL), via onze eigen bol-koppeling (project hjdk-api, Marketing Catalog API,
// /products/lists/popular). Geen sleutels nodig in dit project. Zie https://hjdk-api-henq.vercel.app/api/bol/overdracht.
// Elke dag een momentopname in Blob (bolpop/JJJJ-MM-DD.json): zo ontstaat historie om later te toetsen of stijgers op bol
// de Google-vraag voorspellen. Op de pagina: tab Products, "Most popular on bol.com" met nieuwe binnenkomers.
import { get } from './core.js';
import { getJSON, putJSON } from './store.js';

const BOL = () => process.env.BOL_API_URL || 'https://keuzehulp.best';

export async function bolPopular({ size = 50, category = '' } = {}) {
  const j = await get(`${BOL()}/api/bol/search?q=&size=${size}&country=NL${category ? `&category=${encodeURIComponent(category)}` : ''}`, { timeout: 12000 });
  return (j.products || []).map((p, i) => ({ rank: i + 1, ean: p.ean, title: p.title, url: p.url, price: p.price, rating: p.rating }));
}

// Eén momentopname per dag; geeft { day, n } of { skipped }.
export async function bolSnapshot(store, today = new Date().toISOString().slice(0, 10)) {
  const path = `bolpop/${today}.json`;
  if (await getJSON(store, path, null).catch(() => null)) return { skipped: true, day: today };
  const list = await bolPopular({ size: 50 });
  if (!list.length) return { error: 'empty' };
  await putJSON(store, path, { day: today, at: new Date().toISOString(), list: list.map(({ rank, ean, title, price }) => ({ rank, ean, title, price })) });
  return { day: today, n: list.length };
}
