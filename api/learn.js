// /api/learn?key=<sleutel> — de stand van het leren (JSON, of &html=1 als leesbare pagina).
// POST met dezelfde sleutel: nieuwe uitdagers zetten, bijv. {"page":{"variants":{"B":{"h1":"…","lead":"…","cta":"…"}}},"mail":{"variants":{"C":"…{top}…"}},"by":"leerlus","note":"waarom"}
// Hier sluit de leerlus aan. A is de controle en blijft altijd staan.
import { getStore, putJSON } from '../lib/store.js';
import { loadState, applyChanges, summary, STATE } from '../lib/learn.js';
import { cookieFor } from '../lib/access.js';
import { allSubs } from '../lib/mail.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!cookieFor(req.query.key)) return res.status(401).json({ error: 'key required' });
  const store = getStore();
  if (!store) return res.status(200).json({ ok: false, reason: 'no storage yet (connect a Blob store in Vercel)' });
  const st = await loadState(store);
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const done = applyChanges(st, body || {});
    await putJSON(store, STATE, st);
    return res.status(200).json({ ok: true, done, ...summary(st) });
  }
  const subs = await allSubs(store).catch(() => []);
  const count = s => subs.filter(x => x.status === s).length;
  const markets = {};
  for (const s of subs) if (s.status === 'active') for (const m of s.markets || []) markets[m] = (markets[m] || 0) + 1;
  const sm = summary(st);
  const data = { ok: true, subscribers: { active: count('active'), pending: count('pending'), unsubscribed: count('unsub'), markets }, ...sm };
  if (!req.query.html) return res.status(200).json(data);
  const tbl = (rows, cols) => `<table><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>${rows.map(r => `<tr>${cols.map(c => `<td>${esc(typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c] ?? '')}</td>`).join('')}</tr>`).join('')}</table>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demand Radar · leren</title><style>body{font-family:Inter,system-ui,sans-serif;max-width:1000px;margin:24px auto;padding:0 16px;color:#111}table{border-collapse:collapse;width:100%;margin:8px 0 22px;font-size:14px}th,td{border-bottom:1px solid #e5e7eb;padding:6px 8px;text-align:left;vertical-align:top}th{color:#6b7280}h2{margin:26px 0 4px}</style>
<h1>Demand Radar · leren</h1><p>Bijgewerkt: ${esc(sm.updated || 'nog niet')} · Abonnees: ${data.subscribers.active} actief, ${data.subscribers.pending} wacht op bevestiging, ${data.subscribers.unsubscribed} afgemeld · ${esc(JSON.stringify(markets))}</p>
<h2>Pagina (score = (checks + 4×aanmeldingen + 8×Pro-kliks) / vertoningen)</h2>${tbl(sm.page, ['variant', 'share', 'view', 'check', 'sub', 'pro', 'score', 'text'])}
<h2>Dagmail (score = kliks / verstuurd)</h2>${tbl(sm.mail, ['variant', 'share', 'sent', 'open', 'click', 'score', 'text'])}
<h2>Onderwerpen in de mail</h2>${tbl(sm.topics, ['category', 'shown', 'open', 'click'])}
<h2>Logboek</h2>${tbl(sm.log, ['at', 'by', 'note', 'done'])}`);
}
