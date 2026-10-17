// MCP-koppeling: voeg https://<domein>/api/mcp?key=<sleutel> toe als connector in Claude (of een andere AI-assistent).
// Daarna kun je in elke chat vragen: "check de vraag naar thuisbatterijen in Gouda". Zonder geldige sleutel: geen toegang.
import { MARKETS } from '../lib/core.js';
import { cookieFor } from '../lib/access.js';
import { planOf, PLANS, usage, useOne } from '../lib/account.js';
import { getStore } from '../lib/store.js';
import { getRadar, getCheck, getMap, getDemand } from '../lib/data.js';

const MK = ['NL', 'US', 'DE', 'WW'];
const TOOLS = [
  {
    name: 'check_demand',
    description: 'Check live demand for an idea, product or service in a market (NL, US, DE or WW = worldwide), optionally in one city. Returns a 0-100 demand score, the phase (early, rising, peak, falling, steady), interest trend and seasonality from Wikipedia, news volume (GDELT and Google News), Reddit and Hacker News activity, what people type in Google, YouTube and Amazon, today\'s Google trending searches, related shopping moments and regulation, the weather outlook, and for a city: local searches, local news and existing local businesses from OpenStreetMap. Use it before starting a campaign, choosing a product or building something.',
    inputSchema: { type: 'object', properties: { idea: { type: 'string', description: 'The idea, product or service, in the language of the market works best (e.g. "thuisbatterij" for NL).' }, market: { type: 'string', enum: MK, description: 'NL, US, DE or WW (worldwide, English).' }, city: { type: 'string', description: 'Optional city for a hyperlocal check, e.g. "Gouda" or "Chicago".' } }, required: ['idea', 'market'] },
  },
  {
    name: 'opportunity_map',
    description: 'Ranked opportunity map for a theme, per sub-niche and country (NL, DE, US): monthly search volume, whether it is rising, when it peaks (exam and application periods), what advertisers pay per click, who already offers it (App Store apps, books, Google results and ads), the gap in the market and a concrete first step. Default theme: everything people practise for (job interviews, assessments, IQ, citizenship, driving theory, school and language exams, certificates). Pass your own theme to map any market (takes up to a few minutes the first time, then cached for a day).',
    inputSchema: { type: 'object', properties: { theme: { type: 'string', description: 'Optional own theme, e.g. "things people learn for a hobby". Leave empty for the practice/exams map.' }, country: { type: 'string', enum: ['ALL', 'NL', 'DE', 'US'], description: 'Filter, default ALL.' }, limit: { type: 'number', description: 'Max rows, default 15.' } } },
  },
  {
    name: 'demand_radar',
    description: 'Today\'s Demand Radar (rebuilt every night, learns daily): measured demand that is rising in the Netherlands, Germany and the US, per category (products, courses, books, services, apps, trips, money), plus what is unexpected, what people look for but does not exist yet, and moments coming up with last year\'s search curve. Each topic has monthly Google searches, growth vs last month and last year, whether it is still rising today, ad price per click, what people want and one idea to sell to it. Use this first to find demand; use check_demand to dig into one idea.',
    inputSchema: { type: 'object', properties: { view: { type: 'string', enum: ['rise', 'now', 'products', 'courses', 'books', 'services', 'apps', 'trips', 'money', 'unexpected', 'missing', 'coming'], description: 'rise = predicted to rise in the coming months (the forecast, default); now = strongest measured growth; a category; unexpected; missing = does not exist yet; coming = coming up.' }, country: { type: 'string', enum: ['ALL', 'NL', 'DE', 'US'], description: 'Default ALL.' }, limit: { type: 'number', description: 'Max rows, default 15, max 50.' }, refresh: { type: 'boolean', description: 'Rebuild the radar with fresh data first (costs about $2 of DataForSEO credit, takes 1-3 minutes). Only when the user asks for fresh data.' } } },
  },
  {
    name: 'report_outcome',
    description: 'Report the results of your own campaign for a search term or topic (clicks, conversions, spend, revenue), so the Demand Radar learns what really sells and ranks it higher. Call this after checking a campaign.',
    inputSchema: { type: 'object', properties: { cc: { type: 'string', enum: ['NL', 'DE', 'US', 'WW'] }, term: { type: 'string', description: 'The search term or topic the campaign targeted.' }, network: { type: 'string' }, clicks: { type: 'number' }, conversions: { type: 'number' }, spend: { type: 'number', description: 'In dollars or euros.' }, revenue: { type: 'number' }, date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['cc', 'term'] },
  },
  {
    name: 'handover',
    description: 'TEAM ONLY. The always-current handover for Demand Radar: how to work on it, live status (connections, model, early signals, spend), open tasks, the log of what other chats did, recent code changes and the full README. Read this first before working on Demand Radar.',
    inputSchema: { type: 'object', properties: { short: { type: 'boolean', description: 'Leave out the long README part.' } } },
  },
  {
    name: 'handover_note',
    description: 'TEAM ONLY. Update the shared Demand Radar handover after you changed or decided something, so other chats can continue: add a log note, open a task, or close a task.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'What you did or decided (short, Dutch is fine), or the task text.' }, who: { type: 'string', description: 'Which chat/session you are, e.g. "claude.ai chat" or "Claude Code".' }, todo: { type: 'boolean', description: 'true = add text as an open task instead of a log note.' }, done: { type: 'number', description: 'Id of an open task to close; text = how it was done.' } }, required: ['text'] },
  },
  {
    name: 'live_signals',
    description: 'The live Demand Radar overview: spikes right now (product spikes, Google trending searches, Wikipedia attention spikes), upcoming demand (shopping moments, public holidays, regulation deadlines, weather-driven demand, seasonal rises based on last year), products rising now, and App Store / Apple Books top charts. Filter by market.',
    inputSchema: { type: 'object', properties: { market: { type: 'string', enum: ['ALL', ...MK], description: 'Market filter, default ALL.' }, section: { type: 'string', enum: ['all', 'spikes', 'upcoming', 'rising', 'charts'], description: 'Which part, default all.' }, limit: { type: 'number', description: 'Max items per list, default 10.' } } },
  },
];

function mapText(d, country = 'ALL', n = 15) {
  const rows = d.items.filter(p => country === 'ALL' || p.cc === country).slice(0, n);
  const L = [`Opportunity map: ${d.title}. Updated ${d.generatedAt}. Data: ${d.mode === 'measured' ? 'measured search volumes and ad prices (DataForSEO) plus free signals' : 'free signals only (no search volumes or ad prices yet)'}.`];
  rows.forEach((p, i) => {
    const t = p.timing, pk = t.status === 'now' ? 'peak now' : t.status === 'soon' ? `peak in ${t.weeks} weeks (${t.source})` : t.status === 'later' ? `next peak in ${t.weeks} weeks (${t.source})` : 'no clear peak';
    L.push(`\n${i + 1}. ${p.niche} — ${p.country} — score ${p.score}/100 (${p.confidence})`);
    L.push(`   Demand: ${p.demand.volume != null ? `${p.demand.volume.toLocaleString('en-US')} searches/month over ${p.demand.terms} terms` : `${p.demand.breadth} distinct Google suggestions`}. Trend: ${p.trend.yoy != null ? pct(p.trend.yoy) + ' year on year' : 'unknown'}. Timing: ${pk}.`);
    L.push(`   Money: ${p.money.cpc != null ? `$${p.money.cpc} per click, competition ${p.money.competition}/100` : 'ad prices need DataForSEO'}.`);
    const o = p.offer;
    L.push(`   Offered by: ${o.apps ? `${o.apps.count} apps (${o.apps.local} in local language, ${o.apps.ratings} ratings; top: ${o.apps.top.slice(0, 2).map(a => a.name).join(', ')})` : 'apps unknown'}; ${o.books ? `${o.books.total} books (${o.books.recent} recent)` : ''}${o.serp ? `; Google top: ${o.serp.organic.slice(0, 3).map(x => x.domain).join(', ')}; ${o.serp.adCount} ads` : ''}.`);
    if (p.demand.top.length) L.push(`   Top searches: ${p.demand.top.slice(0, 5).map(k => `${k.k} (${k.v}${k.cpc != null ? `, $${k.cpc}` : ''})`).join('; ')}.`);
    if (p.demand.questions.length) L.push(`   Questions people type: ${p.demand.questions.slice(0, 4).join('; ')}.`);
    L.push(`   Gap: ${p.aiGap || (p.gaps[0] && p.gaps[0].text) || 'no clear gap found'}`);
    L.push(`   First step: ${p.firstStep}`);
  });
  return L.join('\n');
}

const pct = x => (x == null ? '?' : `${x >= 1 ? '+' : ''}${Math.round((x - 1) * 100)}%`);
const feed = (name, f) => (f ? `${name}: ${f.total}${f.capped ? '+' : ''} in 4 weeks (per week, oldest first: ${f.weeks.join('/')})${f.top && f.top.length ? `. Top: ${f.top.slice(0, 3).map(t => `${t.title}${t.url ? ` <${t.url}>` : ''}`).join(' | ')}` : ''}` : `${name}: no data`);

function checkText(c) {
  const L = [];
  L.push(`Demand check: "${c.q}" in ${MARKETS[c.market].name}${c.local && c.local.place ? `, ${c.local.place.name}` : ''}. Score ${c.score}/100, phase: ${c.phase}. ${c.scoreBasis === 'measured' ? 'Score and phase are based on measured Google search volumes and the tested forecast.' : 'No measured search volume available: the score is a rough estimate from news and suggestions — treat it as weak.'}`);
  if (c.advice) L.push(`WHAT TO DO: ${c.advice.label}. ${c.advice.headline}${c.advice.when ? ` When: ${c.advice.when}` : ''}${(c.advice.steps || []).length ? ` Next steps: ${c.advice.steps.join(' ')}` : ''}${(c.advice.angles || []).length ? ` Cheaper angles: ${c.advice.angles.map(a => `${a.k} (${a.volume}/mo${a.cpc != null ? `, $${a.cpc}` : ''})`).join(', ')}.` : ''}`);
  L.push(c.verdict);
  if (c.bing && c.bing.change4w != null) L.push(`Bing weekly searches: ${c.bing.change4w > 0 ? '+' : ''}${c.bing.change4w}% in the last 4 weeks vs the 4 weeks before (fresher than Google's monthly data; Bing is small in NL/DE, so direction only).`);
  if (c.youtube) L.push(`YouTube creators: ${c.youtube.recent >= 50 ? '50+' : c.youtube.recent} new videos in the last 30 days vs ${c.youtube.lastYear >= 50 ? '50+' : c.youtube.lastYear} in the same window a year earlier${c.youtube.growth != null ? ` (${c.youtube.growth}×)` : ''}, ${c.youtube.views} views (context, not part of the tested forecast).`);
  if (c.measured && c.measured.early && c.measured.early.call === 'early') { const e = c.measured.early; L.push(`EARLY SIGNAL (${e.tier === 'starting' ? 'starting to break out' : 'not visible yet'}): ${e.chance}% tested chance of a lasting breakout (≥ 2× last year) within 6 months. ${e.reasons.join('; ')}.`); }
  const m = c.measured, MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (m) {
    L.push(`MEASURED (Google Ads): ${m.last != null ? `${m.last} searches in ${m.period}` : `${m.volume} searches/month`}${m.mom != null ? `, ${m.mom >= 0 ? '+' : ''}${m.mom}% vs previous month` : ''}${m.yoy != null ? `, ${m.yoy >= 0 ? '+' : ''}${m.yoy}% vs a year ago` : ''}${m.cpc != null ? `, $${m.cpc}/click` : ''}${m.competition != null ? `, competition ${m.competition}/100` : ''}.`);
    if (m.series && m.series.length) L.push(`Last 13 months: ${m.series.map(x => `${MN[x.m - 1]} ${x.y} ${x.v}`).join(', ')}.`);
    if (m.forecast) L.push(`Forecast (learning model, tested: ~9 in 10 predicted rises came true): ${m.forecast.call}${m.forecast.chance != null ? ` (${m.forecast.chance}% chance of ≥40% more searches by ${MN[m.forecast.peak.m - 1]})` : ''}; ${m.forecast.months.map(x => `${MN[x.m - 1]} ${x.v}${x.chance != null ? ` (${x.chance}% chance of ≥40% vs now)` : ''}`).join(', ')}.`);
    if (m.local) L.push(`In ${m.local.city}: ${m.local.measured ? '' : 'about '}${m.local.volume} searches/month${m.local.measured ? '' : ' (estimate by population)'}.`);
    if (m.related && m.related.length) L.push(`Related searches: ${m.related.map(r => `${r.k} ${r.volume}/month${r.cpc != null ? ` $${r.cpc}` : ''}`).join('; ')}.`);
  }
  const w = c.wiki;
  if (w) L.push(`Extra signal, Wikipedia ${w.lang}, "${w.article}" <${w.url}>): ${w.daily} views a day; last week vs the 4 weeks before ${pct(w.momentum)}; year on year ${pct(w.yoy)}; next 6 weeks last year ${pct(w.outlook)}; last year's peak ${w.peakInDays <= 3 ? 'was around now' : `came ${w.peakInDays} days after this date`}. Weekly views, last 26 weeks: ${w.weeks.join(',')}.`);
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

const n0 = x => (x == null ? '?' : Number(x).toLocaleString('en-US'));
const p0 = x => (x == null ? '?' : x >= 999 ? 'new' : `${x >= 0 ? '+' : ''}${x}%`);
export function demandText(d, view = 'now', country = 'ALL', n = 15) {
  if (!d || !d.ready) return 'The Demand Radar has no measured data right now.';
  const on = x => country === 'ALL' || x.cc === country;
  const L = [`Demand Radar ${d.day} (search volumes for ${d.period}; "today" = daily trend up to today). View: ${view}. Country: ${country}.`];
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (view === 'rise') {
    const B = d.forecast && d.forecast.backtest;
    if (B) L.push(`Forecast method (learning model) tested on ${B.series} searches: ${B.rise.right10}% of predicted rises rose >10%, ${B.rise.right25}% rose >25%${B.rise.right40 ? `, ${B.rise.right40}% rose ≥40%` : ''}. Each row shows its own chance.`);
    (d.rise || []).filter(on).slice(0, n).forEach((x, i) => { const f = x.forecast; L.push(`${i + 1}. [${x.cc}] ${x.name}${x.keyword && x.keyword !== x.name ? ` (search: "${x.keyword}")` : ''} (${x.cat}) — ${x.what || ''} Now ${n0(f.from.v)}/month (${MN[f.from.m - 1]});${f.chance != null && f.peak ? ` ${f.chance}% chance of ≥40% more searches by ${MN[f.peak.m - 1]};` : ''} forecast ${f.months.map(m => `${MN[m.m - 1]} ${n0(m.v)}`).join(', ')}; last year ${f.lastYear.map(m => `${MN[m.m - 1]} ${n0(m.v)}`).join(', ')}${x.cpc != null ? `; $${x.cpc}/click` : ''}. Idea: ${x.idea || '-'}`); });
  } else if (view === 'missing') {
    d.missing.filter(on).slice(0, n).forEach((m, i) => L.push(`${i + 1}. [${m.cc}] ${m.need} — ${m.exists === 'no' ? "doesn't exist yet" : 'only partly exists'}; ${m.volume ? `${n0(m.volume)} searches/month` : 'searches not measured'}. Gap: ${m.gap || '-'} Idea: ${m.idea || '-'} People typed: ${m.searches.map(s => `"${s.q}"`).join('; ')}`));
  } else if (view === 'coming') {
    d.coming.filter(on).slice(0, n).forEach((m, i) => L.push(`${i + 1}. [${m.cc}] ${m.name} on ${m.date} (in ${m.days} days; ${m.status === 'open' ? 'demand open now' : `demand opens in ${m.opensIn} days`}). Last year: ${n0(m.lastYear.now)} → ${n0(m.lastYear.peak)} searches (${p0(m.lastYear.rise)}). Terms: ${m.terms.map(t => `${t.k} ${n0(t.now)}→${n0(t.peak)}`).join('; ') || '-'}. Sell: ${m.ideas.join(', ')}`));
  } else {
    let list = d.items.filter(on).filter(x => view === 'now' || (view === 'unexpected' ? x.unexpected : x.cat === view));
    if (view === 'unexpected') d.today.filter(on).forEach(t => L.push(`- TODAY [${t.cc}] ${t.name} (${t.traffic}): ${t.angle}. Idea: ${t.idea || '-'}${t.news && t.news.url ? ` <${t.news.url}>` : ''}`));
    list.slice(0, n).forEach((x, i) => L.push(`${i + 1}. [${x.cc}] ${x.name}${x.keyword && x.keyword !== x.name ? ` (search: "${x.keyword}")` : ''} (${x.cat}) — ${x.what || ''} ${n0(x.last)} searches in ${x.period}, ${p0(x.mom)} vs previous month, ${p0(x.yoy)} vs a year ago, today: ${x.now ? x.now.status : 'unknown'}${x.cpc != null ? `, $${x.cpc}/click` : ''}. ${x.unexpected && x.why ? `Unexpected: ${x.why}. ` : ''}Idea: ${x.idea || '-'}${x.firstSeen ? ` (on radar since ${x.firstSeen})` : ''}`));
  }
  if (L.length === 1) L.push('Nothing for this selection today.');
  return L.join('\n');
}

async function call(name, args, req) {
  if (name === 'check_demand') {
    const q = String(args.idea || '').trim().slice(0, 80), m = String(args.market || 'NL').toUpperCase();
    if (q.length < 2 || !MARKETS[m]) throw new Error('Give an idea (2-80 characters) and a market: NL, US, DE or WW.');
    const lim = PLANS[req.plan.plan].checks, st = getStore();
    if (Number.isFinite(lim) && st && (await usage(st, req.plan.id)).n >= lim) throw new Error(`Monthly check limit reached (${lim}). It resets on the 1st.`);
    const c = await getCheck(req, q, m, { ai: false, city: args.city || '' });
    if (Number.isFinite(lim) && st) await useOne(st, req.plan.id);
    if (c && !c.advice) { try { const { advise } = await import('../lib/advice.js'); c.advice = advise(c); } catch {} }
    c.q = q;
    return checkText(c);
  }
  if (name === 'opportunity_map') {
    const d = await getMap(req, { pack: 'practice', theme: String(args.theme || '').trim().slice(0, 80) });
    const c = String(args.country || 'ALL').toUpperCase();
    return mapText(d, ['NL', 'DE', 'US'].includes(c) ? c : 'ALL', Math.max(1, Math.min(40, +args.limit || 15)));
  }
  if (name === 'demand_radar') {
    const { presentDemand } = await import('../lib/demand.js');
    const d = presentDemand(await getDemand(req, { build: args.refresh === true }));
    const c = String(args.country || 'ALL').toUpperCase();
    return demandText(d, String(args.view || 'rise'), ['NL', 'DE', 'US'].includes(c) ? c : 'ALL', Math.max(1, Math.min(50, +args.limit || 15)));
  }
  if (name === 'report_outcome') {
    const { outcome } = await import('../lib/signals.js'), { getStore } = await import('../lib/store.js');
    const ok = await outcome(getStore(), args);
    return ok ? `Saved: ${args.term} (${args.cc}). The radar uses it in tonight's learning round.` : 'Not saved: give cc (NL, DE, US or WW) and a term.';
  }
  if (name === 'handover' || name === 'handover_note') {
    if (!req.plan || req.plan.plan !== 'team') return 'The handover is only for the Demand Radar team (team key).';
    const H = await import('../lib/handover.js'), { getStore } = await import('../lib/store.js'), store = getStore();
    if (name === 'handover') { const [st, h] = await Promise.all([H.liveStatus(store, { owner: true, req }), H.readHandover(store)]); return H.toText(st, h, args.short ? '' : H.readme()); }
    if (args.done) { const t = await H.doneTodo(store, { id: args.done, text: args.text, who: args.who }); return `Task ${t.id} closed.`; }
    if (args.todo) { const t = await H.addTodo(store, args); return `Task ${t.id} added.`; }
    await H.addNote(store, args); return 'Note added to the handover log.';
  }
  if (name === 'live_signals') {
    const r = await getRadar(req);
    const m = String(args.market || 'ALL').toUpperCase();
    return radarText(r, MK.includes(m) ? m : 'ALL', args.section || 'all', Math.max(1, Math.min(30, +args.limit || 10)));
  }
  throw new Error(`Unknown tool ${name}`);
}

async function handle(msg, req) {
  const { id, method, params = {} } = msg || {};
  const ok = result => ({ jsonrpc: '2.0', id, result });
  if (method === 'initialize') return ok({ protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'demand-radar', version: '1.1.0' }, instructions: 'Use opportunity_map to find where demand and gaps are in a theme (default: everything people practise for). Use check_demand before choosing a product, campaign or business idea, and demand_radar for what is spiking, rising or coming up. Markets: NL, US, DE, WW. Add a city for a hyperlocal check. Team: working ON Demand Radar itself? Read the handover tool first and log what you did with handover_note.' });
  if (method === 'ping') return ok({});
  if (method === 'tools/list') return ok({ tools: req.plan && req.plan.plan === 'team' ? TOOLS : TOOLS.filter(t => !t.name.startsWith('handover')) }); // overdracht alleen voor het team
  if (method === 'tools/call') {
    try { return ok({ content: [{ type: 'text', text: await call(params.name, params.arguments || {}, req) }] }); }
    catch (e) { return ok({ content: [{ type: 'text', text: String(e.message || e) }], isError: true }); }
  }
  if (typeof method === 'string' && method.startsWith('notifications/')) return null;
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  // Toegang: teamsleutel, of de API-sleutel van een Business-abonnement (telt mee in het maandgebruik).
  req.plan = cookieFor(req.query.key) ? { plan: 'team', id: 'team' } : await planOf(req, getStore()).catch(() => ({ plan: 'anon' }));
  if (!PLANS[req.plan.plan] || !PLANS[req.plan.plan].api) return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Add ?key=<your Demand Radar key> to the connector URL (Business plan or team key).' } });
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
