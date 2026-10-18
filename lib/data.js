// Gedeelde ophaal-logica: ruwe data komt uit Vercel's CDN-cache (via ?raw=<token>), met een terugval op direct rekenen.
import { buildRadar, buildCheck } from './core.js';
import { RAW_TOKEN, selfFetch } from './access.js';
import { getStore, getJSON, putJSON } from './store.js';
import { createHash } from 'node:crypto';
import { gatewayToken } from './ai.js';

let mem = null;
export async function getRadar(req) {
  try {
    const r = await selfFetch(req, `/api/radar?raw=${RAW_TOKEN}`);
    if (r.ok) return await r.json();
  } catch {}
  if (!mem || Date.now() - mem.t > 3600e3) mem = { t: Date.now(), d: await buildRadar() };
  return mem.d;
}

export async function getCheck(req, q, m, { ai = false, city = '' } = {}) {
  const key = q.toLowerCase(), c = String(city || '').trim().toLowerCase();
  try {
    const r = await selfFetch(req, `/api/check?raw=${RAW_TOKEN}&m=${m}&ai=${ai ? 1 : 0}&c=${encodeURIComponent(c)}&q=${encodeURIComponent(key)}`);
    if (r.ok) return await r.json();
  } catch {}
  return buildCheck(key, m, { ai, city: c, aiToken: gatewayToken(req) });
}

// Kansenkaart: één keer per dag per thema opgebouwd. Volgorde: opslag (Blob) → CDN-cache → zelf bouwen.
const mapMem = new Map();
const DAYMS = 86400e3;
export const mapKey = ({ pack = 'practice', theme = '' }) => (theme ? `theme-${createHash('sha256').update(theme.toLowerCase()).digest('hex').slice(0, 16)}` : `pack-${pack}`);
export async function storedMap(key, maxAge = DAYMS) {
  const store = getStore();
  const d = store ? await getJSON(store, `maps/${key}.json`, null) : null;
  return d && Date.now() - Date.parse(d.generatedAt) < maxAge ? d : null;
}
export async function saveMap(key, d) { const store = getStore(); if (store) await putJSON(store, `maps/${key}.json`, d).catch(() => {}); }

export async function getMap(req, { pack = 'practice', theme = '', build = false } = {}) {
  const key = mapKey({ pack, theme });
  const hit = mapMem.get(key);
  if (!build && hit && Date.now() - hit.t < 300e3) return hit.d;
  let d = await storedMap(key, 365 * DAYMS);
  if (build || (!d && (autoBuild() || theme))) { // een eigen thema is zelf al een verzoek
    const { buildMap } = await import('./map.js');
    d = await buildMap({ pack, theme, aiToken: gatewayToken(req) });
    await saveMap(key, d);
  }
  if (!d) d = { empty: true, items: [], title: 'Not built yet' };
  mapMem.set(key, { t: Date.now(), d });
  return d;
}

// "Wat er naar boven komt": één keer per dag (opslag → CDN → zelf bouwen), net als de kansenkaart.
let risingMem = null;
export async function getRising(req, { build = false } = {}) {
  if (!build && risingMem && Date.now() - risingMem.t < 300e3) return risingMem.d;
  let d = await storedMap('rising', 365 * DAYMS);
  if (build || (autoBuild() && (!d || Date.now() - Date.parse(d.generatedAt) > DAYMS))) {
    const { buildRising, worthKeeping } = await import('./rising.js');
    const nd = await buildRising({ aiToken: gatewayToken(req) });
    if (worthKeeping(nd)) { d = nd; await saveMap('rising', nd); }
  }
  if (!d) d = { ready: true, empty: true, items: { month: [], year: [] } };
  risingMem = { t: Date.now(), d };
  return d;
}

// De Demand Radar: precies één opbouw per dag. De dag wisselt om 04:00 UTC; de nachtelijke cron (04:15) bouwt hem,
// daarna komt iedereen uit de cache (opslag → CDN met de dag in de sleutel → zelf bouwen als laatste redmiddel).
export const demandDay = (t = Date.now()) => new Date(t - 4 * 3600e3).toISOString().slice(0, 10);
let demandMem = null;
// Op verzoek (vanaf 13 okt 2026): bezoekers krijgen altijd de laatst gebouwde radar; alleen een opdracht van de eigenaar
// (?rebuild=1&key=…, of refresh in de MCP-tool) of AUTO_BUILD=on in Vercel bouwt opnieuw — dat kost DataForSEO-tegoed.
export const autoBuild = () => process.env.AUTO_BUILD === 'on';
export async function getDemand(req, { build = false } = {}) {
  const day = demandDay();
  if (!build && demandMem && Date.now() - demandMem.t < 300e3) return demandMem.d;
  let d = await storedMap('demand', 365 * DAYMS);
  const fresh = d && d.day === day && d.ready && d.items && d.items.length;
  if (build || (autoBuild() && !fresh)) {
    const { buildDemand, worthKeepingDemand } = await import('./demand.js');
    const { buildMode, addBuildSpent } = await import('./dfs.js');
    buildMode(true); let nd;
    try { nd = await buildDemand({ aiToken: gatewayToken(req), day }); } finally { buildMode(false); }
    await addBuildSpent(nd && nd.spent);
    if (worthKeepingDemand(nd)) { d = nd; await saveMap('demand', nd); }
    else if (d) d = { ...d, stale: true, buildNote: nd.budget ? 'daily data budget reached' : 'build gave no results' };
    else d = nd;
  }
  if (!d) d = { ready: true, empty: true, items: [], rise: [], missing: [], today: [], coming: [], charts: {}, views: [] };
  demandMem = { day, t: Date.now(), d };
  return d;
}
