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
