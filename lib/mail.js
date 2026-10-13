// Dagmail "Demand of the day": aanmelden (met bevestiging), afmelden, de mail opbouwen en versturen via Resend.
// Instellingen: RESEND_API_KEY en MAIL_FROM (bijv. "Demand Radar <radar@jouwdomein.com>", domein geverifieerd in Resend).
import { createHash, randomBytes } from 'node:crypto';
import { getJSON, putJSON } from './store.js';
import { pick } from './learn.js';

export const mailReady = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
export const MARKET_NAMES = { NL: 'Netherlands', US: 'United States', DE: 'Germany', WW: 'Worldwide' };
const COMPANY = 'ADSFAIR B.V., Albert Plesmanplein 20, 2805 AB Gouda, the Netherlands';

export const subId = email => createHash('sha256').update(`sub:${String(email).trim().toLowerCase()}`).digest('hex').slice(0, 20);
export const validEmail = e => /^[^\s@<>()",;:]{1,64}@[^\s@<>()",;:]{1,190}\.[a-z]{2,24}$/i.test(String(e || '').trim());
const SECRET = () => process.env.LINK_SECRET || 'ed927d5e48443a736233ed0eaf204e370cdaa6ce86a77d16ef19ed88e6670070';
export const sign = u => createHash('sha256').update(`${SECRET()}|${u}`).digest('hex').slice(0, 16);
export const siteBase = req => (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null) || (req ? `https://${req.headers['x-forwarded-host'] || req.headers.host}` : 'http://localhost:3000')).replace(/\/$/, '');

export async function getSub(store, id) { return getJSON(store, `subs/${id}.json`, null); }
export async function saveSub(store, sub) { await putJSON(store, `subs/${sub.id}.json`, sub); }
export async function allSubs(store, max = 20000) {
  const list = await store.list('subs/', max);
  const out = [];
  for (let i = 0; i < list.length; i += 25) out.push(...(await Promise.all(list.slice(i, i + 25).map(b => getJSON(store, b.pathname, null)))));
  return out.filter(Boolean);
}

export async function sendMail(msgs) {
  if (!mailReady()) throw new Error('mail not configured (RESEND_API_KEY, MAIL_FROM)');
  const many = Array.isArray(msgs);
  const r = await fetch(`https://api.resend.com/emails${many ? '/batch' : ''}`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(many ? msgs.map(m => ({ from: process.env.MAIL_FROM, ...m })) : { from: process.env.MAIL_FROM, ...msgs }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend ${r.status} ${j.message || ''}`.trim());
  return j;
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const block = s => String(s || '').replace(/[^\s]/g, '█');
const pct = x => (x == null ? '' : `${x >= 1 ? '+' : ''}${Math.round((x - 1) * 100)}%`);
const PH = { early: 'Early', rising: 'Rising', peak: 'Peak', falling: 'Falling', steady: 'Steady' };

export function confirmMail(base, sub) {
  const link = `${base}/api/subscribe?confirm=${sub.id}.${sub.token}`;
  return {
    to: sub.email, subject: 'Confirm your daily Demand Radar mail',
    text: `Confirm that you want the Demand of the day by email:\n${link}\n\nDid not ask for this? Ignore this mail and nothing happens.\n\n${COMPANY}`,
    html: wrap(`<p style="font-size:17px;color:#111113;margin:0 0 16px">Confirm that you want the <b>Demand of the day</b> by email: one short mail each morning with what is rising, spiking and coming up.</p>${button(link, 'Confirm my subscription')}<p style="font-size:14px;color:#6B7280;margin:18px 0 0">Did not ask for this? Ignore this mail and nothing happens.</p>`, ''),
  };
}

const button = (href, label) => `<a href="${esc(href)}" style="display:inline-block;background:#2B47C4;color:#ffffff;text-decoration:none;font-weight:600;border-radius:999px;padding:12px 22px;font-size:16px">${esc(label)}</a>`;
function wrap(inner, footer) {
  return `<!doctype html><html><body style="margin:0;background:#F4F5F7;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#3A3F47"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #E5E7EB;border-radius:14px"><tr><td style="padding:22px 26px 6px"><span style="font-weight:700;font-size:19px;color:#111113;letter-spacing:-.02em">demand<span style="color:#2B47C4">radar</span></span></td></tr><tr><td style="padding:10px 26px 24px;font-size:16px;line-height:1.55">${inner}</td></tr></table><p style="max-width:600px;font-size:12px;color:#6B7280;line-height:1.5;margin:14px auto 0">${footer}${COMPANY}</p></td></tr></table></body></html>`;
}

// Kiest het hoofdonderwerp: hoge score, met een duwtje voor categorieën waarop lezers vaker klikken (en wat toeval).
export function rankItems(items, topics = {}, rand = Math.random) {
  const ctr = c => { const t = topics[c] || {}; return ((t.click || 0) + 1) / ((t.shown || 0) + 20); };
  const vals = items.map(i => ctr(i.cat));
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0.05;
  return items.map((i, k) => ({ i, w: (i.score || 50) * Math.max(0.6, Math.min(1.6, 1 + (vals[k] - avg) / (avg || 1) / 2)) * (0.85 + rand() * 0.3) })).sort((a, b) => b.w - a.w).map(x => x.i);
}

export function buildDaily(radar, sub, { base, variant, template, topics, open = false, date = new Date().toISOString().slice(0, 10) }) {
  const blk = s => (open ? esc(s) : block(s));
  const mks = sub.markets && sub.markets.length ? sub.markets : ['NL'];
  const on = m => mks.includes(m);
  const seen = new Set();
  const cand = [...(radar.rising || []), ...(radar.spikes.products || [])].filter(x => on(x.market) && !seen.has(`${x.market}|${x.name}`) && seen.add(`${x.market}|${x.name}`));
  const ranked = rankItems(cand, topics);
  const top = ranked[0];
  const spikes = (radar.spikes.products || []).filter(x => on(x.market) && (!top || x.name !== top.name)).slice(0, 3);
  const windows = (radar.upcoming.calendar || []).filter(e => e.markets.some(on) && (e.status === 'open' || e.opensIn <= 21)).slice(0, 3);
  const wx = (radar.upcoming.weather || []).find(w => on(w.market) && w.triggers.length);
  const go = (u, c) => `${base}/api/go?u=${encodeURIComponent(u)}&v=${variant}&c=${encodeURIComponent(c || '-')}&d=${date}&s=${sign(u)}`;
  const checkUrl = x => `${base}/?q=${encodeURIComponent(x.name)}&m=${x.market}#check`;
  const n = spikes.length + windows.length + (wx ? 1 : 0);
  const subject = String(template || 'Demand of the day: {top}').replace('{top}', top ? top.name : 'today\'s signals').replace('{pct}', top ? pct(top.momentum) : '').replace('{n}', String(n)).replace('{market}', mks.map(m => MARKET_NAMES[m]).join(', ')).replace(/\s+—\s*$/, '').trim();
  const unsub = `${base}/api/subscribe?unsub=${sub.id}.${sub.token}`;
  const H = [], T = [];
  const h2 = t => `<p style="font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6B7280;margin:22px 0 8px">${esc(t)}</p>`;
  if (top) {
    H.push(h2('Demand of the day'), `<p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111113;letter-spacing:-.02em"><a href="${esc(go(checkUrl(top), top.cat))}" style="color:#111113;text-decoration:none">${esc(top.name)}</a> <span style="font-size:14px;font-weight:600;color:#2B47C4">${esc(MARKET_NAMES[top.market])} · ${PH[top.phase] || top.phase}</span></p>`,
      `<p style="margin:0 0 10px">Score ${top.score}/100. Interest ${pct(top.momentum)} this week versus the month before, ${pct(top.yoy)} year on year. Last year it moved ${pct(top.outlook)} over the six weeks after this date.</p>`,
      button(go(checkUrl(top), top.cat), 'See the full check'));
    T.push(`DEMAND OF THE DAY: ${top.name} (${MARKET_NAMES[top.market]}, ${PH[top.phase]}) — score ${top.score}/100, ${pct(top.momentum)} week vs month, ${pct(top.yoy)} year on year.\n${go(checkUrl(top), top.cat)}`);
  }
  if (spikes.length) {
    H.push(h2('Spiking now'));
    spikes.forEach((x, i) => { const name = i === 0 || open ? esc(x.name) : `<span style="color:#B9BFC7">${block(x.name)}</span>`; H.push(`<p style="margin:0 0 8px"><b style="color:#111113">${name}</b> · ${x.market} · ${pct(x.spike)} in three days${i === 0 || open ? '' : ` · <a href="${esc(go(`${base}/#pricing`, 'unlock'))}" style="color:#2B47C4">unlock</a>`}</p>`); T.push(`SPIKING: ${i === 0 || open ? x.name : '(Pro)'} ${x.market} ${pct(x.spike)}`); });
  }
  if (windows.length) {
    H.push(h2('Coming up'));
    windows.forEach((e, i) => { H.push(`<p style="margin:0 0 8px"><b style="color:#111113">${esc(e.name)}</b> · ${esc(e.date)} · ${e.status === 'open' ? 'window open now' : `window opens in ${e.opensIn} days`}<br><span style="color:#6B7280;font-size:14px">${i === 0 ? esc(e.ideas.join(', ')) : blk(e.ideas.join(', '))}</span></p>`); T.push(`COMING UP: ${e.name} ${e.date} (${e.status === 'open' ? 'open' : `opens in ${e.opensIn} days`})`); });
  }
  if (wx) { H.push(h2('Weather moves demand'), `<p style="margin:0 0 8px"><b style="color:#111113">${esc(wx.city)}</b>: ${esc(wx.triggers[0].name)}. Think of ${esc(wx.triggers[0].ideas.join(', ').toLowerCase())}.</p>`); T.push(`WEATHER: ${wx.city}: ${wx.triggers[0].name}`); }
  const ctaUrl = open ? `${base}/check#check` : `${base}/check#pricing`;
  H.push(`<div style="margin:24px 0 0;padding:16px 18px;background:#EEF1FC;border-radius:12px"><p style="margin:0 0 10px;color:#111113;font-weight:600">${open ? 'Check your own idea, product or service against live demand, down to your city.' : 'See every product, source and date, and check your own ideas down to your city.'}</p>${button(go(ctaUrl, open ? 'check' : 'pro'), open ? 'Check an idea' : 'Unlock Pro, €39 a month')}</div>`);
  T.push(`${open ? 'Check an idea' : 'Unlock Pro'}: ${go(ctaUrl, open ? 'check' : 'pro')}`);
  const pixel = `<img src="${esc(`${base}/api/e?x=mail&k=open&v=${variant}&c=${encodeURIComponent(top ? top.cat : '-')}`)}" width="1" height="1" alt="" style="display:block;border:0">`;
  const footer = `You get this because you subscribed to the Demand of the day for ${esc(mks.map(m => MARKET_NAMES[m]).join(', '))}. <a href="${esc(unsub)}" style="color:#6B7280">Unsubscribe</a> with one click.<br>`;
  return {
    to: sub.email, subject, cat: top ? top.cat : '-',
    html: wrap(H.join('') + pixel, footer),
    text: `${T.join('\n\n')}\n\nUnsubscribe: ${unsub}\n${COMPANY}`,
    headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

export const newToken = () => randomBytes(12).toString('hex');
export { pick };
