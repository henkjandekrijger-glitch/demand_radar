// /api/e?x=page|mail&k=view|check|sub|pro|open|click&v=<variant>&c=<categorie> — telt één gebeurtenis (geen IP, geen mailadres).
import { getStore } from '../lib/store.js';
import { record } from '../lib/learn.js';
import { isBot } from '../lib/bots.js';

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export default async function handler(req, res) {
  const { x, k, v, c } = req.query;
  if (!(x === 'page' && isBot(req))) await record(getStore(), { x, k, v, c }).catch(() => {});
  res.setHeader('Cache-Control', 'no-store');
  if (k === 'open') { res.setHeader('Content-Type', 'image/gif'); return res.status(200).send(GIF); }
  res.status(204).end();
}
