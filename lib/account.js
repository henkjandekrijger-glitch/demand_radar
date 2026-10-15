// Accounts en abonnementen (Paddle). Inloggen met een link per e-mail (Resend), geen wachtwoorden.
// Blob (privé): accounts/<uid>.json, usage/<JJJJ-MM>/<id>.json, config/paddle.json (prijs-ID's en webhookgeheim).
// Vercel-variabelen: PADDLE_API_KEY, PADDLE_CLIENT_TOKEN, PADDLE_ENV (production|sandbox), SESSION_SECRET (optioneel),
// RESEND_API_KEY + MAIL_FROM (voor de inloglink).
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getJSON, putJSON } from './store.js';
import { isPro } from './access.js';

// ---------- Plannen ----------
// Alleen wat echt gebouwd is staat erin. Prijzen in euro; de echte prijzen staan in Paddle (config/paddle.json).
export const PLANS = {
  anon: { name: 'Visitor', checks: 3 },
  free: { name: 'Free', checks: 3 },
  pro: { name: 'Pro', checks: 300, ai: true, eur: { month: 29, year: 290 } },
  business: { name: 'Business', checks: 2000, ai: true, api: true, eur: { month: 99, year: 990 } },
  team: { name: 'Team', checks: Infinity, ai: true, api: true },
};
const ACTIVE = new Set(['active', 'trialing', 'past_due']);

// ---------- Sessie ----------
const SECRET = () => process.env.SESSION_SECRET || createHash('sha256').update(`sess:${process.env.DFS_PASSWORD || ''}:${process.env.VERCEL_PROJECT_ID || 'local'}`).digest('hex');
const mac = s => createHmac('sha256', SECRET()).update(s).digest('hex').slice(0, 32);
export const uidOf = email => createHash('sha256').update(`acct:${String(email).trim().toLowerCase()}`).digest('hex').slice(0, 24);
const b64 = s => Buffer.from(s).toString('base64url'), unb64 = s => Buffer.from(s, 'base64url').toString();
export function token(email, ttlMs) { const p = `${b64(String(email).trim().toLowerCase())}.${Date.now() + ttlMs}`; return `${p}.${mac(p)}`; }
export function readToken(t) {
  const [e, exp, sig] = String(t || '').split('.'); if (!e || !exp || !sig) return null;
  const want = mac(`${e}.${exp}`);
  if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig)) || +exp < Date.now()) return null;
  return unb64(e);
}
export const sessionCookie = email => `dr_user=${token(email, 180 * 864e5)}; Path=/; Max-Age=${180 * 86400}; HttpOnly; Secure; SameSite=Lax`;
export const clearCookie = 'dr_user=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
export function userEmail(req) { const m = String(req.headers.cookie || '').match(/(?:^|;\s*)dr_user=([^;]+)/); return m ? readToken(decodeURIComponent(m[1])) : null; }

// ---------- Account en plan ----------
export async function getAccount(store, email) { return email && store ? getJSON(store, `accounts/${uidOf(email)}.json`, null) : null; }
export async function saveAccount(store, a) { await putJSON(store, `accounts/${a.uid}.json`, { ...a, updatedAt: new Date().toISOString() }); }

// Zakelijke API-sleutel (Business): alleen de hash staat in het account, de index wijst naar het account.
const keyHash = k => createHash('sha256').update(`apikey:${k}`).digest('hex');
export async function issueApiKey(store, acct) {
  const k = `drb-${randomBytes(12).toString('hex')}`;
  acct.apiKeyHash = keyHash(k); await saveAccount(store, acct); await putJSON(store, `apikeys/${acct.apiKeyHash}.json`, { uid: acct.uid });
  return k;
}
async function accountByKey(store, k) {
  if (!k || !/^drb-[a-f0-9]{24}$/.test(k)) return null;
  const idx = await getJSON(store, `apikeys/${keyHash(k)}.json`, null); return idx ? getJSON(store, `accounts/${idx.uid}.json`, null) : null;
}

// Wie is dit en welk plan geldt? { plan, email, acct, id } — id is waaraan het gebruik telt.
export async function planOf(req, store) {
  if (isPro(req)) return { plan: 'team', id: 'team' };
  const viaKey = req.query && req.query.key ? await accountByKey(store, String(req.query.key)).catch(() => null) : null;
  const email = viaKey ? viaKey.email : userEmail(req);
  const acct = viaKey || (email ? await getAccount(store, email).catch(() => null) : null);
  if (acct && acct.plan && acct.plan !== 'free' && ACTIVE.has(acct.status)) return { plan: acct.plan, email: acct.email, acct, id: acct.uid };
  if (email) return { plan: 'free', email, acct, id: uidOf(email) };
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
  return { plan: 'anon', id: `ip-${createHash('sha256').update(`ip:${ip}:${SECRET().slice(0, 8)}`).digest('hex').slice(0, 20)}` };
}

// ---------- Gebruik per maand ----------
const month = () => new Date().toISOString().slice(0, 7);
export async function usage(store, id) { return (await getJSON(store, `usage/${month()}/${id}.json`, null).catch(() => null)) || { n: 0 }; }
export async function useOne(store, id) { const u = await usage(store, id); u.n++; u.last = new Date().toISOString(); await putJSON(store, `usage/${month()}/${id}.json`, u).catch(() => {}); return u.n; }

// ---------- Paddle ----------
const PADDLE = () => (process.env.PADDLE_ENV === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com');
export const paddleReady = () => !!process.env.PADDLE_API_KEY;
export async function paddle(path, { method = 'GET', body } = {}) {
  const r = await fetch(PADDLE() + path, { method, headers: { authorization: `Bearer ${process.env.PADDLE_API_KEY}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Paddle ${r.status}: ${(j.error && (j.error.detail || j.error.code)) || 'error'}`);
  return j.data;
}
export async function paddleConfig(store) { return (await getJSON(store, 'config/paddle.json', null).catch(() => null)) || {}; }

// Eenmalig (eigenaar): product, 4 prijzen en de webhook in Paddle aanmaken; ID's en webhookgeheim in Blob (privé).
export async function paddleSetup(store, siteUrl) {
  const cfg = await paddleConfig(store);
  if (!cfg.productId) cfg.productId = (await paddle('/products', { method: 'POST', body: { name: 'Demand Radar', tax_category: 'saas', description: 'Measured and forecast consumer demand per search term (NL, DE, US), with advice.' } })).id;
  const want = { pro_month: ['pro', 'month'], pro_year: ['pro', 'year'], business_month: ['business', 'month'], business_year: ['business', 'year'] };
  cfg.prices = cfg.prices || {};
  for (const [k, [plan, iv]] of Object.entries(want)) {
    if (cfg.prices[k]) continue;
    const eur = PLANS[plan].eur[iv];
    cfg.prices[k] = (await paddle('/prices', { method: 'POST', body: { product_id: cfg.productId, description: `${PLANS[plan].name} ${iv === 'month' ? 'monthly' : 'yearly'}`, name: `${PLANS[plan].name} (${iv === 'month' ? 'monthly' : 'yearly'})`, unit_price: { amount: String(eur * 100), currency_code: 'EUR' }, billing_cycle: { interval: iv, frequency: 1 }, custom_data: { plan } } })).id;
  }
  if (!cfg.webhookId) {
    const n = await paddle('/notification-settings', { method: 'POST', body: { description: 'Demand Radar', destination: `${siteUrl}/api/paddle`, type: 'url', subscribed_events: ['subscription.created', 'subscription.updated', 'subscription.canceled', 'subscription.past_due', 'subscription.activated', 'transaction.completed'] } });
    cfg.webhookId = n.id; cfg.webhookSecret = n.endpoint_secret_key;
  }
  cfg.env = process.env.PADDLE_ENV || 'production'; cfg.at = new Date().toISOString();
  await putJSON(store, 'config/paddle.json', cfg);
  return { productId: cfg.productId, prices: cfg.prices, webhook: !!cfg.webhookSecret };
}
export const planOfPrice = (cfg, priceId) => (Object.entries(cfg.prices || {}).find(([, id]) => id === priceId) || [''])[0].split('_')[0] || null;

// Webhook-handtekening: Paddle-Signature: ts=...;h1=... over `${ts}:${body}`.
export function paddleSigned(raw, header, secret) {
  const p = Object.fromEntries(String(header || '').split(';').map(x => x.split('=')));
  if (!p.ts || !p.h1 || !secret) return false;
  if (Math.abs(Date.now() / 1000 - +p.ts) > 3600) return false;
  const want = createHmac('sha256', secret).update(`${p.ts}:${raw}`).digest('hex');
  return want.length === p.h1.length && timingSafeEqual(Buffer.from(want), Buffer.from(p.h1));
}
