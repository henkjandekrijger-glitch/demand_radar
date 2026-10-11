// Lokale server: node tools/dev.mjs (MOCK=1 gebruikt nepbronnen). Bootst Vercel's /api-functies na.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { setFetch } from '../lib/core.js';

if (process.env.MOCK) setFetch((await import('./mock.mjs')).mockFetch);
const PORT = +process.env.PORT || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (u.pathname.startsWith('/api/')) {
    req.query = Object.fromEntries(u.searchParams);
    res.status = c => { res.statusCode = c; return res; };
    res.json = o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    res.send = b => { res.end(typeof b === 'string' || Buffer.isBuffer(b) ? b : JSON.stringify(b)); };
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    try { req.body = /json/.test(req.headers['content-type'] || '') ? JSON.parse(raw || '{}') : raw; } catch { req.body = raw; }
    try { (await import(`../api/${u.pathname.slice(5)}.js`)).default(req, res); } catch (e) { res.statusCode = 404; res.end(String(e)); }
    return;
  }
  const p = join('public', u.pathname === '/' ? 'index.html' : u.pathname);
  try { res.setHeader('content-type', TYPES[extname(p)] || 'application/octet-stream'); res.end(await readFile(p)); } catch { res.statusCode = 404; res.end('not found'); }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
