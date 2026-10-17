// AI-aanroepen. Standaard via de Vercel AI Gateway: op Vercel geen eigen sleutel nodig (net als outname.now).
// Met ANTHROPIC_API_KEY gaat het rechtstreeks naar Anthropic, dan ook met webonderzoek.
export const GATEWAY = 'https://ai-gateway.vercel.sh/v1/messages';
export const MODEL = process.env.AI_MODEL || 'anthropic/claude-sonnet-5.5';

export const gatewayToken = req => process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || (req && req.headers && req.headers['x-vercel-oidc-token']) || '';
export const aiAvailable = req => !!(process.env.ANTHROPIC_API_KEY || gatewayToken(req));

let fetchImpl = (...a) => fetch(...a);
export function setAiFetch(f) { fetchImpl = f; }

// Geeft de tekst van het antwoord terug.
export async function ask({ prompt, system, maxTokens = 1200, web = false, token = '', timeoutMs = 50000, model = MODEL }) {
  const direct = process.env.ANTHROPIC_API_KEY;
  if (!direct && !token) throw new Error('no AI access in this deployment');
  const body = { max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }], ...(system ? { system } : {}) };
  const r = direct
    ? await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'x-api-key': direct, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: (process.env.AI_MODEL || 'claude-sonnet-5-5').replace(/^anthropic\//, '').replace(/\./g, '-'), ...body, ...(web ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] } : {}) }),
    })
    : await fetchImpl(GATEWAY, {
      method: 'POST', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ model, ...body }),
    });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`AI ${r.status} ${j.error && j.error.message ? j.error.message : ''}`.trim());
  return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

export function parseJSON(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}
