// Demand Radar — nieuwsophaler voor GDELT (https://www.gdeltproject.org), draait op Railway.
// Waarom: GDELT weigert verzoeken vanaf de gedeelde Vercel-servers (429). Deze kleine server heeft een eigen adres,
// vraagt GDELT rustig (hooguit één verzoek per 6 seconden, zoals GDELT vraagt) en bewaart antwoorden een uur.
// De radar (Vercel) vraagt hier: GET /gdelt?query=…&mode=timelinevolraw&timespan=… → hetzelfde antwoord als GDELT.
// Alleen de DOC-API van GDELT, alleen lezen; geen sleutels nodig.
import http from 'node:http';

const PORT = +(process.env.PORT || 8080);
const GAP = +(process.env.GDELT_GAP_MS || 6000);
const TTL = 3600e3;
const MODES = new Set(['timelinevol', 'timelinevolraw', 'timelinetone', 'timelinesourcecountry', 'timelinelang', 'artlist', 'tonechart']);
const KEYS = ['query', 'mode', 'timespan', 'startdatetime', 'enddatetime', 'maxrecords', 'sort', 'timelinesmooth'];
const cache = new Map();
let chain = Promise.resolve(), last = 0, served = 0, fetched = 0, errors = 0;

function clean(sp) {
  const out = new URLSearchParams();
  for (const k of KEYS) { const v = sp.get(k); if (v != null && v !== '') out.set(k, String(v).slice(0, 400)); }
  if (!out.get('query')) return null;
  if (!MODES.has(out.get('mode') || 'artlist')) return null;
  out.set('format', 'json');
  return out.toString();
}
const wait = ms => new Promise(r => setTimeout(r, ms));
// Eén verzoek tegelijk naar GDELT, met een vaste pauze ertussen; bij 429 even langer wachten en één keer opnieuw.
function gdelt(qs) {
  const run = async () => {
    for (let i = 0; i < 2; i++) {
      const pause = last + GAP - Date.now(); if (pause > 0) await wait(pause);
      last = Date.now(); fetched++;
      const r = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${qs}`, { headers: { 'user-agent': 'DemandRadar/1.0 (+https://demandradar-ivory.vercel.app)' }, signal: AbortSignal.timeout(40000) });
      const t = await r.text();
      if (r.status === 429 && i === 0) { await wait(GAP * 3); continue; }
      return { status: r.status, body: t };
    }
  };
  const p = chain.then(run, run); chain = p.catch(() => {}); return p;
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('access-control-allow-origin', '*');
  if (u.pathname === '/' || u.pathname === '/health') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, service: 'radar-news', served, fetched, errors, cached: cache.size }));
  if (u.pathname !== '/gdelt') return res.writeHead(404).end('not found');
  const qs = clean(u.searchParams); if (!qs) return res.writeHead(400, { 'content-type': 'application/json' }).end('{"error":"query and a supported mode are needed"}');
  const c = cache.get(qs);
  if (c && Date.now() - c.t < TTL) { served++; return res.writeHead(c.status, { 'content-type': 'application/json', 'x-cache': 'hit' }).end(c.body); }
  try {
    const r = await gdelt(qs); served++;
    if (r.status === 200) { cache.set(qs, { t: Date.now(), status: 200, body: r.body }); if (cache.size > 5000) cache.delete(cache.keys().next().value); }
    else errors++;
    res.writeHead(r.status, { 'content-type': 'application/json', 'x-cache': 'miss' }).end(r.body);
  } catch (e) { errors++; res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(e.message || e).slice(0, 200) })); }
}).listen(PORT, () => console.log(`radar-news on ${PORT}`));
