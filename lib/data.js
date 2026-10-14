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
export async function storedMap(key) {
  const store = getStore();
  const d = store ? await getJSON(store, `maps/${key}.json`, null) : null;
  return d && Date.now() - Date.parse(d.generatedAt) < DAYMS ? d : null;
}
export async function saveMap(key, d) { const store = getStore(); if (store) await putJSON(store, `maps/${key}.json`, d).catch(() => {}); }

export async function getMap(req, { pack = 'practice', theme = '' } = {}) {
  const key = mapKey({ pack, theme });
  const hit = mapMem.get(key);
  if (hit && Date.now() - hit.t < DAYMS) return hit.d;
  let d = await storedMap(key);
  if (!d) {
    const qs = theme ? `theme=${encodeURIComponent(theme.toLowerCase())}` : `pack=${encodeURIComponent(pack)}`;
    try {
      const r = await selfFetch(req, `/api/map?raw=${RAW_TOKEN}&${qs}`, 290000);
      if (r.status === 400) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Unknown theme'); }
      if (r.ok) d = await r.json();
    } catch (e) { if (/theme|niches/i.test(String(e.message))) throw e; }
  }
  if (!d) {
    const { buildMap } = await import('./map.js');
    d = await buildMap({ pack, theme, aiToken: gatewayToken(req) });
    await saveMap(key, d);
  }
  mapMem.set(key, { t: Date.now(), d });
  return d;
}

// "Wat er naar boven komt": één keer per dag (opslag → CDN → zelf bouwen), net als de kansenkaart.
let risingMem = null;
export async function getRising(req) {
  if (risingMem && Date.now() - risingMem.t < DAYMS) return risingMem.d;
  let d = await storedMap('rising');
  if (!d) {
    try { const r = await selfFetch(req, `/api/rising?raw=${RAW_TOKEN}`, 290000); if (r.ok) d = await r.json(); } catch {}
  }
  if (!d || !d.ready) {
    const { buildRising, worthKeeping } = await import('./rising.js');
    d = await buildRising({ aiToken: gatewayToken(req) });
    if (worthKeeping(d)) await saveMap('rising', d);
  }
  if (d.ready) risingMem = { t: (d.items.month.length + d.items.year.length) ? Date.now() : Date.now() - DAYMS + 600e3, d }; // leeg: over 10 minuten opnieuw proberen
  return d;
}

// De Demand Radar: precies één opbouw per dag. De dag wisselt om 04:00 UTC; de nachtelijke cron (04:15) bouwt hem,
// daarna komt iedereen uit de cache (opslag → CDN met de dag in de sleutel → zelf bouwen als laatste redmiddel).
export const demandDay = (t = Date.now()) => new Date(t - 4 * 3600e3).toISOString().slice(0, 10);
let demandMem = null;
export async function getDemand(req) {
  const day = demandDay();
  if (demandMem && demandMem.day === day && (demandMem.ok || Date.now() - demandMem.t < 600e3) && Date.now() - demandMem.t < 900e3) return demandMem.d; // max 15 min in geheugen, daarna uit opslag
  let d = await storedMap('demand');
  if (d && d.day !== day) d = null;
  if (!d) {
    try { const r = await selfFetch(req, `/api/demand?raw=${RAW_TOKEN}&d=${day}`, 295000); if (r.ok) d = await r.json(); } catch {}
  }
  const { buildDemand, worthKeepingDemand } = await import('./demand.js');
  if (!d || !d.ready) {
    d = await buildDemand({ aiToken: gatewayToken(req), day });
    if (worthKeepingDemand(d)) await saveMap('demand', d);
  }
  if (d.ready) demandMem = { day, t: Date.now(), ok: worthKeepingDemand(d), d };
  return d;
}
