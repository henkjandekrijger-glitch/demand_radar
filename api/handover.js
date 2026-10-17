// /overdracht en /handover — altijd actuele overdracht (zie lib/handover.js). Lezen: iedereen (zonder geldbedragen).
// Bijwerken (teamsleutel): ?op=note|todo|done, als POST (JSON) of GET (voor chats die alleen kunnen ophalen).
import { getStore } from '../lib/store.js';
import { isPro } from '../lib/access.js';
import { readHandover, addNote, addTodo, doneTodo, liveStatus, readme, toText, HOW } from '../lib/handover.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default async function handler(req, res) {
  const store = getStore();
  if (!store) return res.status(503).json({ error: 'no storage' });
  res.setHeader('Cache-Control', 'no-store');
  const op = String(req.query.op || '');
  try {
    if (op) {
      if (!isPro(req)) return res.status(403).json({ error: 'team key required (?key=…)' });
      let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
      const a = { ...(req.query || {}), ...(b || {}) };
      if (op === 'note') return res.status(200).json({ ok: true, note: await addNote(store, a) });
      if (op === 'todo') return res.status(200).json({ ok: true, todo: await addTodo(store, a) });
      if (op === 'done') return res.status(200).json({ ok: true, todo: await doneTodo(store, a) });
      return res.status(400).json({ error: 'op must be note, todo or done' });
    }
    const [st, h] = await Promise.all([liveStatus(store, { owner: isPro(req), req }), readHandover(store)]);
    const f = String(req.query.format || '');
    if (f === 'json') return res.status(200).json({ how: HOW, status: st, ...h });
    const text = toText(st, h, f === 'short' ? '' : readme());
    if (f === 'text' || f === 'short' || /claude|python|curl|node|fetch|bot/i.test(String(req.headers['user-agent'] || ''))) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.status(200).send(text);
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Demand Radar — overdracht</title>
<style>body{margin:0;background:#fff;color:#111;font:15px/1.55 ui-sans-serif,system-ui,-apple-system,sans-serif}main{max-width:900px;margin:0 auto;padding:24px 16px 64px}h1{font-size:24px;margin:0 0 4px}p.m{color:#6b7280;margin:0 0 18px}pre{white-space:pre-wrap;word-break:break-word;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:#f7f7f8;border:1px solid #e5e7eb;border-radius:12px;padding:16px}@media(prefers-color-scheme:dark){body{background:#0f1116;color:#f2f3f5}pre{background:#161922;border-color:#272c37}p.m{color:#8b929b}}</style></head>
<body><main><h1>Demand Radar — overdracht</h1><p class="m">Live bijgewerkt · tekst voor chats: <a href="?format=text">?format=text</a> · kort: <a href="?format=short">?format=short</a> · JSON: <a href="?format=json">?format=json</a></p><pre>${esc(text)}</pre></main></body></html>`);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
}
