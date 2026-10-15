// /api/paddle — webhook van Paddle: abonnement aangemaakt, gewijzigd, opgezegd of betaald → account bijwerken.
// Handtekening wordt gecontroleerd met het geheim uit config/paddle.json (aangemaakt door /api/account?op=setup).
import { getStore } from '../lib/store.js';
import { paddleConfig, paddleSigned, planOfPrice, uidOf, getAccount, saveAccount, paddle } from '../lib/account.js';
import { getJSON, putJSON } from '../lib/store.js';

export const config = { api: { bodyParser: false } };
async function rawBody(req) { if (typeof req.body === 'string') return req.body; const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks).toString('utf8'); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const store = getStore(); if (!store) return res.status(503).end();
  const raw = await rawBody(req), cfg = await paddleConfig(store);
  if (!paddleSigned(raw, req.headers['paddle-signature'], cfg.webhookSecret)) return res.status(401).json({ error: 'bad signature' });
  let ev; try { ev = JSON.parse(raw); } catch { return res.status(400).end(); }
  const d = ev.data || {};
  try {
    if (/^subscription\./.test(ev.event_type)) {
      // E-mail: uit custom_data (meegegeven bij het afrekenen), anders via de klant bij Paddle.
      let email = d.custom_data && d.custom_data.email;
      if (!email && d.customer_id) email = (await paddle(`/customers/${d.customer_id}`).catch(() => ({}))).email;
      if (!email) return res.status(200).json({ ok: true, skipped: 'no email' });
      email = String(email).toLowerCase();
      const a = (await getAccount(store, email)) || { uid: uidOf(email), email, createdAt: new Date().toISOString() };
      const priceId = d.items && d.items[0] && d.items[0].price && d.items[0].price.id;
      a.plan = d.status === 'canceled' ? 'free' : planOfPrice(cfg, priceId) || (d.items && d.items[0] && d.items[0].price && d.items[0].price.custom_data && d.items[0].price.custom_data.plan) || a.plan || 'pro';
      a.status = d.status;
      a.paddle = { customerId: d.customer_id, subscriptionId: d.id, priceId, nextBilledAt: d.next_billed_at || null, scheduledChange: d.scheduled_change || null, event: ev.event_type, at: ev.occurred_at };
      await saveAccount(store, a);
    }
    // Logboek (laatste 200) voor de overdracht.
    const log = await getJSON(store, 'config/paddle-log.json', []).catch(() => []);
    log.push({ at: ev.occurred_at, type: ev.event_type, id: d.id, status: d.status }); await putJSON(store, 'config/paddle-log.json', log.slice(-200));
    res.status(200).json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e.message || e).slice(0, 160) }); }
}
