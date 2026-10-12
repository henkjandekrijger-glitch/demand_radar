// Elke ochtend (Vercel Cron): de dagmail "Demand of the day" naar alle bevestigde abonnees.
// Kiest per abonnee een onderwerpregel-variant (leert via kliks), stuurt in groepjes van 100 via Resend.
// Maar één keer per dag (ook als hij vaker wordt aangeroepen). Bekijken zonder versturen: ?key=<sleutel>&preview=1[&m=NL,US]
// Proefmail naar één adres: ?key=<sleutel>&test=<mailadres>
import { getStore, getJSON, putJSON } from '../lib/store.js';
import { loadState, bump, bumpTopic, pick, STATE } from '../lib/learn.js';
import { allSubs, buildDaily, sendMail, mailReady, confirmMail, siteBase, saveSub, validEmail, newToken } from '../lib/mail.js';
import { cookieFor, OPEN } from '../lib/access.js';
import { getRadar } from '../lib/data.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const owner = !!cookieFor(req.query.key);
  const store = getStore();
  const base = siteBase(req);
  const date = new Date().toISOString().slice(0, 10);
  try {
    const radar = await getRadar(req);
    const st = store ? await loadState(store) : null;
    const topics = st ? st.topics : {};
    if (owner && (req.query.preview || req.query.test)) {
      const v = String(req.query.v || 'A').toUpperCase();
      const template = st ? st.mail.variants[v] || st.mail.variants.A : undefined;
      const fake = { id: '0'.repeat(20), token: 'preview', email: String(req.query.test || 'you@example.com'), markets: String(req.query.m || 'NL').toUpperCase().split(',') };
      const msg = buildDaily(radar, fake, { base, variant: v, template, topics, date, open: OPEN });
      if (req.query.test) {
        if (!validEmail(req.query.test)) return res.status(400).json({ error: 'bad address' });
        await sendMail({ to: msg.to, subject: `[test] ${msg.subject}`, html: msg.html, text: msg.text });
        return res.status(200).json({ ok: true, sentTo: msg.to, subject: msg.subject });
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(msg.html.replace('<body', `<body data-subject="${msg.subject.replace(/"/g, '')}"`).replace('<table', `<p style="font-family:sans-serif;text-align:center;margin:12px">Subject: <b>${msg.subject.replace(/</g, '&lt;')}</b></p><table`));
    }
    if (!store) return res.status(200).json({ ok: false, reason: 'no storage yet (connect a Blob store in Vercel)' });
    if (!mailReady()) return res.status(200).json({ ok: false, reason: 'mail not configured (RESEND_API_KEY and MAIL_FROM)' });
    const doneKey = `mail/sent/${date}.json`;
    if (await getJSON(store, doneKey, null)) return res.status(200).json({ ok: true, skipped: 'already sent today' });
    await putJSON(store, doneKey, { at: new Date().toISOString(), status: 'sending' });
    const subs = await allSubs(store);
    // Aanmeldingen van vóór de mail werkte: alsnog een bevestiging sturen.
    for (const s of subs.filter(s => s.status === 'pending' && !s.confirmSent)) {
      try { s.token = s.token || newToken(); await sendMail(confirmMail(base, s)); s.confirmSent = new Date().toISOString(); await saveSub(store, s); } catch {}
    }
    const active = subs.filter(s => s.status === 'active');
    const msgs = active.map(s => { const v = pick(st.mail.weights); const m = buildDaily(radar, s, { base, variant: v, template: st.mail.variants[v], topics, date, open: OPEN }); return { v, m }; });
    let sent = 0; const per = {}; const errors = [];
    for (let i = 0; i < msgs.length; i += 100) {
      const chunk = msgs.slice(i, i + 100);
      try {
        await sendMail(chunk.map(({ m }) => ({ to: m.to, subject: m.subject, html: m.html, text: m.text, headers: m.headers })));
        for (const { v, m } of chunk) { sent++; per[v] = (per[v] || 0) + 1; bump(st, 'mail', v, 'sent'); bumpTopic(st, m.cat, 'shown'); }
      } catch (e) { errors.push(String(e.message || e).slice(0, 200)); }
    }
    await putJSON(store, STATE, st);
    await putJSON(store, doneKey, { at: new Date().toISOString(), status: 'done', sent, per, errors });
    res.status(200).json({ ok: true, sent, per, errors });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
