import { createHash } from 'node:crypto';
import { getStore, getJSON, putJSON } from './store.js';

// AI-aanroepen. Standaard via de Vercel AI Gateway: op Vercel geen eigen sleutel nodig (net als outname.now).
// Met ANTHROPIC_API_KEY gaat het rechtstreeks naar Anthropic, dan ook met webonderzoek.
export const GATEWAY = 'https://ai-gateway.vercel.sh/v1/messages';
export const MODEL = process.env.AI_MODEL || 'anthropic/claude-sonnet-5.5';
// Goedkoop model voor extractie, classificatie en JSON-werk (20 okt 2026: standaard voor bijna alles).
export const CHEAP = () => process.env.MINE_MODEL || 'anthropic/claude-haiku-5.5';

export const gatewayToken = req => process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || (req && req.headers && req.headers['x-vercel-oidc-token']) || '';
export const aiAvailable = req => !!(process.env.ANTHROPIC_API_KEY || gatewayToken(req));

let fetchImpl = (...a) => fetch(...a);
export function setAiFetch(f) { fetchImpl = f; }

// Opruimlus (20 okt 2026, Henkjan: "waar gaan de AI Gateway-tokens heen en waar kan ik besparen"):
// elke aanroep krijgt het label project:demand_radar (plus het bestand dat hem doet), en het model wordt
// opgevraagd bij de opruimlus: boven het dagbudget krijgt dit project een goedkoper Anthropic-model.
// Bij een fout of trage opruimlus gewoon het gevraagde model.
const OPRUIM = process.env.OPRUIM_URL || 'https://opruimlus.vercel.app';
const keuzes = new Map(); // gevraagd model -> { model, t }
export async function kiesModel(model) {
  if (!process.env.VERCEL || process.env.OPRUIM === 'uit' || !/^anthropic\//.test(model)) return model;
  const c = keuzes.get(model);
  if (c && Date.now() - c.t < 5 * 60e3) return c.model;
  let gekozen = model;
  try {
    const r = await fetch(`${OPRUIM}/api/model?p=demand_radar&m=${encodeURIComponent(model)}`, { signal: AbortSignal.timeout(1500) });
    const j = await r.json();
    if (j && typeof j.model === 'string' && /^anthropic\//.test(j.model)) gekozen = j.model; // /v1/messages: alleen Anthropic-modellen
  } catch (e) {}
  keuzes.set(model, { model: gekozen, t: Date.now() });
  return gekozen;
}
function aanroeper() {
  const m = String(new Error().stack || '').split('\n').slice(2).map(l => (l.match(/\/(lib|api|worker)\/([\w-]+)\.js/) || [])[2]).find(x => x && x !== 'ai');
  return m || 'onbekend';
}

// Geeft de tekst van het antwoord terug.
export async function ask({ prompt, system, maxTokens = 1200, web = false, token = '', timeoutMs = 50000, model = MODEL }) {
  const direct = process.env.ANTHROPIC_API_KEY;
  if (!direct && !token) throw new Error('no AI access in this deployment');
  // Vaste systeemprompt cachen: herhaalde aanroepen betalen dan ~10% voor dat deel.
  const sys = system ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] : null;
  const body = { max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }], ...(sys ? { system: sys } : {}) };
  const r = direct
    ? await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'x-api-key': direct, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: (process.env.AI_MODEL || 'claude-sonnet-5-5').replace(/^anthropic\//, '').replace(/\./g, '-'), ...body, ...(web ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] } : {}) }),
    })
    : await fetchImpl(GATEWAY, {
      method: 'POST', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'ai-reporting-tags': `project:demand_radar,fn:${aanroeper()}` },
      body: JSON.stringify({ model: await kiesModel(model), ...body }),
    });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`AI ${r.status} ${j.error && j.error.message ? j.error.message : ''}`.trim());
  return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

// Zelfde taak + zelfde invoer = antwoord uit de opslag (Blob, aicache/<taak>/<hash>.json), geen nieuwe AI-aanroep.
// Leeg antwoord: één keer opnieuw, met het goedkope model. Alleen een bruikbaar antwoord (valid) wordt bewaard.
const memo = new Map();
const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 32);
export async function askCached({ task, ttlH = 24, store, valid = t => parseJSON(t) != null, ...a }) {
  const key = `aicache/${task}/${hash([a.model || MODEL, a.system || '', a.prompt, a.maxTokens || ''].join('\u0000'))}.json`, ttl = ttlH * 36e5, now = Date.now();
  // Lokaal en in de tests alleen met een meegegeven opslag; op Vercel standaard de Blob-opslag. Uitzetten: AI_CACHE=uit.
  const on = process.env.AI_CACHE !== 'uit' && (store || process.env.VERCEL);
  const st = on ? (store || getStore()) : null;
  const m = on && memo.get(key); if (m && now - m.t < ttl) return m.text;
  if (st) { const c = await getJSON(st, key, null).catch(() => null); if (c && now - Date.parse(c.at) < ttl) { memo.set(key, { t: Date.parse(c.at), text: c.text }); return c.text; } }
  let text = await ask(a);
  if (!String(text || '').trim()) text = await ask({ ...a, model: CHEAP() });
  if (valid(text)) {
    if (on) { if (memo.size > 400) memo.clear(); memo.set(key, { t: now, text }); }
    if (st) await putJSON(st, key, { at: new Date(now).toISOString(), text }).catch(() => {});
  }
  return text;
}

// Geheugen per item (bijv. per zoekterm): alleen items die nog niet (of te lang geleden) beoordeeld zijn gaan naar AI.
export async function itemMemo(store, name, ttlDays = 7, max = 6000) {
  const path = `aicache/items-${name}.json`, ttl = ttlDays * 864e5, now = Date.now();
  const raw = (store && (await getJSON(store, path, null).catch(() => null))) || {};
  const m = Object.fromEntries(Object.entries(raw).filter(([, x]) => x && now - x.t < ttl));
  let dirty = false;
  return {
    get: k => (m[k] ? m[k].v : undefined),
    set: (k, v) => { m[k] = { t: now, v }; dirty = true; },
    async save() { if (!store || !dirty) return; const e = Object.entries(m).sort((x, y) => y[1].t - x[1].t).slice(0, max); await putJSON(store, path, Object.fromEntries(e)).catch(() => {}); },
  };
}

// Voor prompts: geen lege velden, getallen afgerond, lange tekst afgekapt.
export function compact(v) {
  if (Array.isArray(v)) { const a = v.map(compact).filter(x => x !== undefined); return a.length ? a : undefined; }
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) { const c = compact(x); if (c !== undefined) o[k] = c; } return Object.keys(o).length ? o : undefined; }
  if (typeof v === 'number') return Number.isFinite(v) ? (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100) : undefined;
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'string') return v.length > 240 ? v.slice(0, 240) : v;
  return v;
}

export function parseJSON(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}
