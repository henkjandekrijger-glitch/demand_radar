// Dagmail: POST /api/subscribe {email, markets, v} meldt aan (met bevestigingsmail),
// GET ?confirm=<id>.<token> bevestigt, GET of POST ?unsub=<id>.<token> meldt af (ook met één klik vanuit de mail).
import { getStore } from '../lib/store.js';
import { record } from '../lib/learn.js';
import { subId, validEmail, getSub, saveSub, newToken, mailReady, sendMail, confirmMail, siteBase } from '../lib/mail.js';

const MK = ['NL', 'US', 'DE', 'WW'];
const go = (res, loc) => { res.statusCode = 302; res.setHeader('Location', loc); res.setHeader('Cache-Control', 'no-store'); res.end(); };

export default async function handler(req, res) {
  const store = getStore();
  const ref = String(req.query.confirm || req.query.unsub || '');
  if (ref) {
    const [id, token] = ref.split('.');
    const sub = store && /^[a-f0-9]{20}$/.test(id || '') ? await getSub(store, id) : null;
    if (!sub || sub.token !== token) return req.method === 'POST' ? res.status(200).end() : go(res, '/?sub=invalid#daily');
    if (req.query.confirm) { if (sub.status !== 'active') { sub.status = 'active'; sub.confirmedAt = new Date().toISOString(); await saveSub(store, sub); } return go(res, '/?sub=ok#daily'); }
    sub.status = 'unsub'; sub.unsubAt = new Date().toISOString(); await saveSub(store, sub);
    return req.method === 'POST' ? res.status(200).end() : go(res, '/?sub=bye#daily');
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  if (b.hp) return res.status(200).json({ ok: true, status: 'confirm' }); // honeypot: bots krijgen een nette 'ok'
  const email = String(b.email || '').trim().toLowerCase();
  if (!validEmail(email)) return res.status(400).json({ error: 'That email address does not look right.' });
  const markets = (Array.isArray(b.markets) ? b.markets : [b.markets]).map(m => String(m || '').toUpperCase()).filter(m => MK.includes(m));
  if (!markets.length) return res.status(400).json({ error: 'Pick at least one market.' });
  if (!store) return res.status(503).json({ error: 'Subscriptions open in a few days. Try again soon.' });
  const id = subId(email);
  const old = await getSub(store, id);
  if (old && old.status === 'active') { old.markets = markets; await saveSub(store, old); return res.status(200).json({ ok: true, status: 'active' }); }
  const sub = { id, email, markets, status: 'pending', token: old && old.token ? old.token : newToken(), created: (old && old.created) || new Date().toISOString(), v: String(b.v || '').slice(0, 2), src: String(b.src || '').slice(0, 40), confirmSent: null };
  if (mailReady()) { try { await sendMail(confirmMail(siteBase(req), sub)); sub.confirmSent = new Date().toISOString(); } catch (e) { sub.confirmError = String(e.message || e).slice(0, 200); } }
  await saveSub(store, sub);
  await record(store, { x: 'page', k: 'sub', v: sub.v }).catch(() => {});
  res.status(200).json({ ok: true, status: sub.confirmSent ? 'confirm' : 'saved' });
}
