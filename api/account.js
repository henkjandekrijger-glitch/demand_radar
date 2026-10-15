// /api/account — inloggen per e-mail, abonnement en gebruik. op=config|login|verify|me|logout|portal|apikey|setup
import { getStore } from '../lib/store.js';
import { isPro } from '../lib/access.js';
import { mailReady, sendMail, validEmail, siteBase } from '../lib/mail.js';
import { PLANS, token, readToken, sessionCookie, clearCookie, userEmail, uidOf, getAccount, saveAccount, planOf, usage, paddle, paddleReady, paddleConfig, paddleSetup, issueApiKey } from '../lib/account.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default async function handler(req, res) {
  const op = String(req.query.op || 'me'), store = getStore();
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    if (op === 'config') {
      const cfg = store ? await paddleConfig(store) : {};
      return res.status(200).json({
        plans: { free: { checks: PLANS.free.checks }, pro: { checks: PLANS.pro.checks, eur: PLANS.pro.eur }, business: { checks: PLANS.business.checks, eur: PLANS.business.eur } },
        paddle: process.env.PADDLE_CLIENT_TOKEN && cfg.prices ? { token: process.env.PADDLE_CLIENT_TOKEN, env: process.env.PADDLE_ENV || 'production', prices: cfg.prices } : null,
        signIn: mailReady(),
      });
    }
    if (op === 'login' && req.method === 'POST') {
      let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
      const email = String((b && b.email) || '').trim().toLowerCase();
      if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
      if (!mailReady()) return res.status(503).json({ error: 'Sign-in by email is not available yet.' });
      const next = /^\/[a-z0-9/_-]*$/i.test(String(b.next || '')) ? b.next : '/pricing';
      const link = `${siteBase(req)}/api/account?op=verify&next=${encodeURIComponent(next)}&t=${encodeURIComponent(token(email, 30 * 60e3))}`;
      await sendMail({ to: email, subject: 'Your sign-in link for Demand Radar', text: `Sign in to Demand Radar: ${link}\n\nThe link works for 30 minutes. If you did not ask for it, ignore this email.`,
        html: `<p>Sign in to Demand Radar:</p><p><a href="${esc(link)}" style="display:inline-block;background:#2B47C4;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Sign in</a></p><p style="color:#666">The link works for 30 minutes. If you did not ask for it, ignore this email.</p>` });
      return res.status(200).json({ ok: true });
    }
    if (op === 'verify') {
      const email = readToken(req.query.t);
      const next = /^\/[a-z0-9/_-]*$/i.test(String(req.query.next || '')) ? req.query.next : '/pricing';
      if (!email) { res.writeHead(302, { Location: '/pricing?link=expired' }); return res.end(); }
      if (store && !(await getAccount(store, email))) await saveAccount(store, { uid: uidOf(email), email, plan: 'free', status: 'free', createdAt: new Date().toISOString() });
      res.writeHead(302, { 'Set-Cookie': sessionCookie(email), Location: `${next}?signedin=1` }); return res.end();
    }
    if (op === 'logout') { res.writeHead(302, { 'Set-Cookie': clearCookie, Location: '/' }); return res.end(); }
    if (op === 'me') {
      const p = await planOf(req, store), u = store ? await usage(store, p.id) : { n: 0 };
      const a = p.acct || (p.email && store ? await getAccount(store, p.email) : null);
      return res.status(200).json({ email: p.email || null, plan: p.plan, name: PLANS[p.plan].name, used: u.n, limit: Number.isFinite(PLANS[p.plan].checks) ? PLANS[p.plan].checks : null,
        status: a ? a.status : null, nextBilledAt: a && a.paddle ? a.paddle.nextBilledAt : null, cancelAt: a && a.paddle && a.paddle.scheduledChange && a.paddle.scheduledChange.action === 'cancel' ? a.paddle.scheduledChange.effective_at : null, hasApiKey: !!(a && a.apiKeyHash) });
    }
    if (op === 'portal') {
      const email = userEmail(req), a = email && store ? await getAccount(store, email) : null;
      if (!a || !a.paddle || !a.paddle.customerId || !paddleReady()) { res.writeHead(302, { Location: '/pricing' }); return res.end(); }
      const s = await paddle(`/customers/${a.paddle.customerId}/portal-sessions`, { method: 'POST', body: a.paddle.subscriptionId ? { subscription_ids: [a.paddle.subscriptionId] } : {} });
      res.writeHead(302, { Location: s.urls.general.overview }); return res.end();
    }
    if (op === 'apikey' && req.method === 'POST') {
      const p = await planOf(req, store);
      if (!['business', 'team'].includes(p.plan) || !p.acct) return res.status(403).json({ error: 'API keys come with the Business plan.' });
      return res.status(200).json({ key: await issueApiKey(store, p.acct), note: 'Shown once. Use it as ?key=… on /api/mcp or /api/check.' });
    }
    if (op === 'setup') { // eigenaar: product, prijzen en webhook in Paddle aanmaken
      if (!isPro(req)) return res.status(403).json({ error: 'forbidden' });
      if (!paddleReady()) return res.status(400).json({ error: 'PADDLE_API_KEY missing' });
      return res.status(200).json(await paddleSetup(store, siteBase(req)));
    }
    res.status(400).json({ error: 'unknown op' });
  } catch (e) { res.status(500).json({ error: String(e.message || e).slice(0, 200) }); }
}
