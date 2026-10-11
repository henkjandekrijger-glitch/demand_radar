// Gedeelde ophaal-logica: ruwe data komt uit Vercel's CDN-cache (via ?raw=<token>), met een terugval op direct rekenen.
import { buildRadar, buildCheck } from './core.js';
import { RAW_TOKEN, selfBase } from './access.js';
import { gatewayToken } from './ai.js';

let mem = null;
export async function getRadar(req) {
  try {
    const r = await fetch(`${selfBase(req)}/api/radar?raw=${RAW_TOKEN}`, { signal: AbortSignal.timeout(58000) });
    if (r.ok) return await r.json();
  } catch {}
  if (!mem || Date.now() - mem.t > 3600e3) mem = { t: Date.now(), d: await buildRadar() };
  return mem.d;
}

export async function getCheck(req, q, m, { ai = false, city = '' } = {}) {
  const key = q.toLowerCase(), c = String(city || '').trim().toLowerCase();
  try {
    const r = await fetch(`${selfBase(req)}/api/check?raw=${RAW_TOKEN}&m=${m}&ai=${ai ? 1 : 0}&c=${encodeURIComponent(c)}&q=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(58000) });
    if (r.ok) return await r.json();
  } catch {}
  return buildCheck(key, m, { ai, city: c, aiToken: gatewayToken(req) });
}
