// /api/go?u=<adres>&v=<variant>&c=<categorie>&s=<handtekening> — telt een klik uit de dagmail en stuurt door.
import { getStore } from '../lib/store.js';
import { record } from '../lib/learn.js';
import { sign } from '../lib/mail.js';

export default async function handler(req, res) {
  const u = String(req.query.u || '');
  if (!/^https?:\/\//.test(u) || req.query.s !== sign(u)) { res.statusCode = 302; res.setHeader('Location', '/'); return res.end(); }
  await record(getStore(), { x: 'mail', k: 'click', v: req.query.v, c: req.query.c }).catch(() => {});
  res.statusCode = 302; res.setHeader('Location', u); res.setHeader('Cache-Control', 'no-store'); res.end();
}
