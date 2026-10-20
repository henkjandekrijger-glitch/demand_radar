// "AI-schap": welke winkels en merken raden AI-assistenten aan als iemand vraagt waar je iets koopt?
// Echte vraag in de taal van het land aan meerdere modellen via de Vercel AI Gateway (OpenAI, Google, Perplexity met web, Anthropic).
// Niet wat ChatGPT-gebruikers echt zien (dat deelt niemand), wel wat deze modellen nu antwoorden. Per term per dag bewaard in Blob.
import { createHash } from 'node:crypto';
import { getJSON, putJSON } from './store.js';
import { gatewayToken } from './ai.js';

export const SHELF_MODELS = (process.env.AI_SHELF_MODELS || 'openai/gpt-5.4-mini,google/gemini-3.8-flash,perplexity/sonar,anthropic/claude-haiku-5.5').split(',').map(s => s.trim()).filter(Boolean);
const Q = {
  NL: q => `Waar kan ik ${q} het beste kopen in Nederland? Noem concreet de winkels of webshops en de merken die je aanraadt.`,
  DE: q => `Wo kann ich ${q} am besten in Deutschland kaufen? Nenne konkret die Geschäfte oder Onlineshops und die Marken, die du empfiehlst.`,
  US: q => `Where is the best place to buy ${q} in the United States? Name the specific stores or online shops and the brands you recommend.`,
  WW: q => `Where is the best place to buy ${q}? Name the specific stores or online shops and the brands you recommend.`,
};
const TAIL = '\n\nAfter your answer, add one last line with only JSON: {"shops":["..."],"brands":["..."]}';

async function askModel(model, prompt, token) {
  const r = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'ai-reporting-tags': 'project:demand_radar,fn:aishelf' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 600 }), signal: AbortSignal.timeout(25000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${model} ${r.status}: ${String((j.error && (j.error.message || j.error)) || 'error').slice(0, 100)}`);
  return String(j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '');
}
const lastJSON = t => { const m = String(t).match(/\{[^{}]*"shops"[^{}]*\}/g); if (!m) return null; try { return JSON.parse(m[m.length - 1]); } catch { return null; } };
const norm = s => String(s || '').trim().replace(/\.(nl|de|com)$/i, '').replace(/\s+/g, ' ');

export async function aiShelf(q, cc, store, { token = '', req = null, now = new Date() } = {}) {
  token = token || gatewayToken(req); if (!token || !q || !Q[cc]) return null;
  const day = now.toISOString().slice(0, 10), key = `aishelf/${cc}/${createHash('sha256').update(String(q).toLowerCase().trim()).digest('hex').slice(0, 24)}.json`;
  const hit = store && (await getJSON(store, key, null).catch(() => null));
  if (hit && hit.day === day) return hit.v;
  const answers = await Promise.all(SHELF_MODELS.map(async model => {
    try { const t = await askModel(model, Q[cc](q) + TAIL, token), j = lastJSON(t) || {}; return { model, shops: (j.shops || []).map(norm).filter(Boolean).slice(0, 10), brands: (j.brands || []).map(norm).filter(Boolean).slice(0, 10) }; }
    catch (e) { return { model, error: String(e.message || e).slice(0, 120) }; }
  }));
  const ok = answers.filter(a => !a.error);
  const tally = kind => { const c = new Map(); for (const a of ok) for (const n of new Set(a[kind].map(x => x.toLowerCase()))) { const name = a[kind].find(x => x.toLowerCase() === n); const o = c.get(n) || { name, n: 0 }; o.n++; c.set(n, o); } return [...c.values()].sort((x, y) => y.n - x.n).slice(0, 8); };
  const v = ok.length ? { asked: ok.length, models: answers.map(a => ({ model: a.model, ok: !a.error })), shops: tally('shops'), brands: tally('brands') } : { asked: 0, errors: answers.map(a => a.error).slice(0, 4) };
  if (store && ok.length) await putJSON(store, key, { day, v }).catch(() => {});
  return v;
}
