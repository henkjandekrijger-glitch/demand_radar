// MCP-koppeling: voeg https://<domein>/api/mcp?key=<sleutel> toe als connector in Claude (of een andere AI-assistent).
// Daarna kun je in elke chat vragen: "check de vraag naar thuisbatterijen in Gouda". Zonder geldige sleutel: geen toegang.
import { MARKETS } from '../lib/core.js';
import { cookieFor } from '../lib/access.js';
import { getRadar, getCheck } from '../lib/data.js';

const MK = ['NL', 'US', 'DE', 'WW'];
const TOOLS = [
  {
    name: 'check_demand',
    description: 'Check live demand for an idea, product or service in a market (NL, US, DE or WW = worldwide), optionally in one city. Returns a 0-100 demand score, the phase (early, rising, peak, falling, steady), interest trend and seasonality from Wikipedia, news volume (GDELT and Google News), Reddit and Hacker News activity, what people type in Google, YouTube and Amazon, today\'s Google trending searches, related shopping moments and regulation, the weather outlook, and for a city: local searches, local news and existing local businesses from OpenStreetMap. Use it before starting a campaign, choosing a product or building something.',
    inputSchema: { type: 'object', properties: { idea: { type: 'string', description: 'The idea, product or service, in the language of the market works best (e.g. "thuisbatterij" for NL).' }, market: { type: 'string', enum: MK, description: 'NL, US, DE or WW (worldwide, English).' }, city: { type: 'string', description: 'Optional city for a hyperlocal check, e.g. "Gouda" or "Chicago".' } }, required: ['idea', 'market'] },
  },
  {
    name: 'demand_radar',
    description: 'The live Demand Radar overview: spikes right now (product spikes, Google trending searches, Wikipedia attention spikes), upcoming demand (shopping moments, public holidays, regulation deadlines, weather-driven demand, seasonal rises based on last year), products rising now, and App Store / Apple Books top charts. Filter by market.',
    inputSchema: { type: 'object', properties: { market: { type: 'string', enum: ['ALL', ...MK], description: 'Market filter, default ALL.' }, section: { type: 'string', enum: ['all', 'spikes', 'upcoming', 'rising', 'charts'], description: 'Which part, default all.' }, limit: { type: 'number', description: 'Max items per list, default 10.' } } },
  },
];

const pct = x => (x == null ? '?' : `${x >= 1 ? '+' : ''}${Math.round((x - 1) * 100)}%`);
const feed = (name, f) => (f ? `${name}: ${f.total}${f.capped ? '+' : ''} in 4 weeks (per week, oldest first: ${f.weeks.join('/')})${f.top && f.top.length ? `. Top: ${f.top.slice(0, 3).map(t => `${t.title}${t.url ? ` <${t.url}>` : ''}`).join(' | ')}` : ''}` : `${name}: no data`);

function checkText(c) {
  const L = [];
  L.push(`Demand check: "${c.q}" in ${MARKETS[c.market].name}${c.local && c.local.place ? `, ${c.local.place.name}` : ''}. Score ${c.score}/100, phase: ${c.phase}.`);
  L.push(c.verdict);
  const w = c.wiki;
  if (w) L.push(`Interest (Wikipedia ${w.lang}, "${w.article}" <${w.url}>): ${w.daily} views a day; last week vs the 4 weeks before ${pct(w.momentum)}; year on year ${pct(w.yoy)}; next 6 weeks last year ${pct(w.outlook)}; last year's peak ${w.peakInDays <= 3 ? 'was around now' : `came ${w.peakInDays} days after this date`}. Weekly views, last 26 weeks: ${w.weeks.join(',')}.`);
  L.push(feed('World news (GDELT)', c.news));
  L.push(feed('Google News', c.gnews));
  L.push(feed('Reddit', c.reddit) + (c.reddit && c.reddit.subs && c.reddit.subs.length ? `. Subreddits: ${c.reddit.subs.join(', ')}` : ''));
  L.push(feed('Hacker News', c.hn));
  if (c.suggest) L.push(`What people type: Google: ${c.suggest.google.join('; ') || 'none'}. YouTube: ${c.suggest.youtube.join('; ') || 'none'}. Amazon: ${c.suggest.amazon.join('; ') || 'none'}.`);
  if (c.trending.length) L.push(`Trending on Google today: ${c.trending.map(t => `${t.name} (${t.traffic})`).join(', ')}.`);
  if (c.calendar.length) L.push(`Related moments: ${c.calendar.map(e => `${e.name} on ${e.date} (${e.status === 'open' ? 'window open now' : `window opens in ${e.opensIn} days`}; ideas: ${e.ideas.join(', ')})`).join('; ')}.`);
  if (c.weather) L.push(`Weather ${c.weather.city}: next 7 days average high ${c.weather.next}°C vs ${c.weather.past}°C last week${c.weather.triggers.length ? `; ${c.weather.triggers.map(t => t.name).join('; ')}` : ''}.`);
  const lo = c.local;
  if (lo && lo.error) L.push(`Local: ${lo.error}`);
  else if (lo) {
    L.push(`LOCAL — ${lo.place.name}${lo.place.region ? `, ${lo.place.region}` : ''} (${lo.place.population ? `${lo.place.population.toLocaleString('en-US')} inhabitants` : 'population unknown'}): ${lo.verdict}`);
    L.push(`Local searches with the city name: ${lo.suggestions.join('; ') || 'none'}.`);
    L.push(feed('Local news', lo.news));
    L.push(feed('Local Reddit', lo.reddit));
    if (lo.competitors) L.push(`Existing places on the map within ~9 km: ${lo.competitors.count}${lo.competitors.capped ? '+' : ''}${lo.competitors.per10k != null ? ` (${lo.competitors.per10k} per 10,000 inhabitants)` : ''}${lo.competitors.top.length ? `: ${lo.competitors.top.map(p => `${p.name} (${p.type})`).join(', ')}` : ''}.`);
  }
  if (c.ai && !c.ai.error) L.push(`AI analyst: ${JSON.stringify(c.ai)}`);
  L.push(`Sources answered: ${c.sources.filter(s => s.ok).map(s => s.name).join(', ')}. Not available: ${c.sources.filter(s => !s.ok).map(s => s.name).join(', ') || 'none'}.`);
  return L.join('\n');
}

function radarText(r, market = 'ALL', section = 'all', n = 10) {
  const on = m => market === 'ALL' || m === market;
  const W = a => (a || []).filter(x => on(x.market)).slice(0, n);
  const L = [`Demand Radar, updated ${r.generatedAt}. Market: ${market}.`];
  if (section === 'all' || section === 'spikes') {
    L.push('\nPRODUCT SPIKES (last 3 days vs month):', ...W(r.spikes.products).map(x => `- [${x.market}] ${x.name}: ${pct(x.spike)}, score ${x.score}, ${x.phase}`));
    for (const g of r.spikes.search.filter(g => on(g.geo))) L.push(`\nGOOGLE TRENDING ${g.geo}:`, ...g.items.slice(0, n).map(x => `- ${x.name} (${x.traffic})${x.news && x.news.title ? ` — ${x.news.title} <${x.news.url}>` : ''}`));
    for (const g of r.spikes.attention) L.push(`\nWIKIPEDIA ATTENTION ${g.lang.toUpperCase()}:`, ...g.items.slice(0, n).map(x => `- ${x.name}: ×${x.ratio} (${x.views} views)`));
  }
  if (section === 'all' || section === 'upcoming') {
    L.push('\nDEMAND WINDOWS:', ...r.upcoming.calendar.filter(e => market === 'ALL' || e.markets.includes(market)).slice(0, n * 2).map(e => `- ${e.name} [${e.markets.join(',')}] ${e.date}: ${e.status === 'open' ? 'window open' : `opens in ${e.opensIn} days`}; ideas: ${e.ideas.join(', ')}`));
    L.push('\nWEATHER-DRIVEN DEMAND:', ...(r.upcoming.weather || []).filter(w => on(w.market)).map(w => `- ${w.city}: next week ${w.next}°C vs ${w.past}°C${w.triggers.length ? `; ${w.triggers.map(t => `${t.name} → ${t.ideas.join(', ')}`).join('; ')}` : '; no weather trigger'}`));
    L.push('\nSEASONAL RISES (based on last year):', ...W(r.upcoming.seasonal).map(x => `- [${x.market}] ${x.name}: ${pct(x.outlook)} over the next 6 weeks, peak in ~${x.peakInDays} days`));
  }
  if (section === 'all' || section === 'rising') L.push('\nRISING NOW:', ...W(r.rising).map(x => `- [${x.market}] ${x.name}: score ${x.score}, ${x.phase}, week vs month ${pct(x.momentum)}, year on year ${pct(x.yoy)}`));
  if (section === 'all' || section === 'charts') for (const g of (r.charts || []).filter(g => on(g.geo))) L.push(`\nTOP ${g.kind === 'apps' ? 'FREE APPS' : 'PAID BOOKS'} ${g.geo}:`, ...g.items.slice(0, n).map(x => `- ${x.rank}. ${x.name} — ${x.artist}`));
  return L.join('\n');
}

async function call(name, args, req) {
  if (name === 'check_demand') {
    const q = String(args.idea || '').trim().slice(0, 80), m = String(args.market || 'NL').toUpperCase();
    if (q.length < 2 || !MARKETS[m]) throw new Error('Give an idea (2-80 characters) and a market: NL, US, DE or WW.');
    const c = await getCheck(req, q, m, { ai: false, city: args.city || '' });
    c.q = q;
    return checkText(c);
  }
  if (name === 'demand_radar') {
    const r = await getRadar(req);
    const m = String(args.market || 'ALL').toUpperCase();
    return radarText(r, MK.includes(m) ? m : 'ALL', args.section || 'all', Math.max(1, Math.min(30, +args.limit || 10)));
  }
  throw new Error(`Unknown tool ${name}`);
}

async function handle(msg, req) {
  const { id, method, params = {} } = msg || {};
  const ok = result => ({ jsonrpc: '2.0', id, result });
  if (method === 'initialize') return ok({ protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'demand-radar', version: '1.1.0' }, instructions: 'Use check_demand before choosing a product, campaign or business idea, and demand_radar for what is spiking, rising or coming up. Markets: NL, US, DE, WW. Add a city for a hyperlocal check.' });
  if (method === 'ping') return ok({});
  if (method === 'tools/list') return ok({ tools: TOOLS });
  if (method === 'tools/call') {
    try { return ok({ content: [{ type: 'text', text: await call(params.name, params.arguments || {}, req) }] }); }
    catch (e) { return ok({ content: [{ type: 'text', text: String(e.message || e) }], isError: true }); }
  }
  if (typeof method === 'string' && method.startsWith('notifications/')) return null;
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!cookieFor(req.query.key)) return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Add ?key=<your Demand Radar key> to the connector URL.' } });
  if (req.method === 'GET') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  if (req.method === 'DELETE') return res.status(200).end();
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  const batch = Array.isArray(body);
  const out = (await Promise.all((batch ? body : [body]).map(m => handle(m, req)))).filter(Boolean);
  if (!out.length) return res.status(202).end();
  res.setHeader('Content-Type', 'application/json');
  res.status(200).send(JSON.stringify(batch ? out : out[0]));
}
