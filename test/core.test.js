import test from 'node:test';
import assert from 'node:assert/strict';
import { metrics, phaseOf, parseTrends, parseTraffic, setFetch, buildRadar, buildCheck } from '../lib/core.js';
import { easter, upcoming, moments } from '../lib/calendar.js';
import { maskRadar, maskCheck, scramble, cookieFor } from '../lib/access.js';
import { mockFetch } from '../tools/mock.mjs';

const iso = d => d.toISOString().slice(0, 10);

test('calendar dates', () => {
  assert.equal(iso(easter(2026)), '2026-04-05');
  assert.equal(iso(easter(2027)), '2027-03-28');
  const m = Object.fromEntries(moments(2026).map(e => [e.id, iso(e.date)]));
  assert.equal(m.thanksgiving, '2026-11-26');
  assert.equal(m.blackfriday, '2026-11-27');
  assert.equal(m.cybermonday, '2026-11-30');
  assert.equal(m.advent, '2026-11-29');
  assert.equal(m.mothersday, '2026-05-10');
  assert.equal(m.kingsday, '2026-04-27');
  assert.equal(iso(moments(2027).find(e => e.id === 'carnival').date), '2027-02-08');
  const up = upcoming(new Date(Date.UTC(2026, 9, 11)));
  assert.ok(up.find(e => e.id === 'nl-net-metering' && e.status === 'open'));
  assert.ok(up.every(e => e.days >= 0));
});

test('metrics and phases', () => {
  const flat = Array(430).fill(100);
  const f = metrics(flat);
  assert.equal(f.phase, 'steady');
  assert.equal(f.weeks.length, 26);
  assert.equal(f.proj.length, 8);
  const rise = flat.map((v, i) => (i > 422 ? 200 : v));
  assert.equal(metrics(rise).phase, 'rising');
  // vorig jaar steeg het in de 6 weken na vandaag → early
  const season = flat.map((v, i) => (i >= 430 - 365 && i < 430 - 365 + 42 ? 300 : v));
  assert.equal(metrics(season).phase, 'early');
  assert.equal(phaseOf(0.7, 0.8), 'falling');
  assert.equal(phaseOf(1.05, 0.7), 'peak');
});

test('trends rss parsing', () => {
  const x = '<rss><item><title>a &amp; b</title><ht:approx_traffic>2,000+</ht:approx_traffic><ht:news_item_title><![CDATA[News]]></ht:news_item_title><ht:news_item_url>https://x.y/1</ht:news_item_url></item></rss>';
  const [t] = parseTrends(x);
  assert.equal(t.name, 'a & b'); assert.equal(t.volume, 2000); assert.equal(t.news.url, 'https://x.y/1');
  assert.equal(parseTraffic('10K+'), 10000);
});

test('masking hides names and links', () => {
  assert.equal(scramble('Heat pump').length, 9);
  assert.notEqual(scramble('Heat pump'), 'Heat pump');
  assert.equal(cookieFor('nope'), null);
});

test('radar + check end to end on mock data', async () => {
  setFetch(mockFetch);
  const r = await buildRadar();
  assert.ok(r.watch.length >= 60, 'watch list');
  assert.ok(r.spikes.search.length === 3);
  assert.ok(r.spikes.attention[0].items.every(a => !a.name.includes(':')));
  const m = maskRadar(r);
  assert.ok(m.rising.slice(1).every(x => x.locked && x.url === null && x.name !== r.rising.find(y => y.article === x.article)?.name));
  assert.ok(r.upcoming.weather.length === 4 && r.upcoming.weather[0].triggers.length >= 1, 'weather triggers');
  assert.ok(r.charts.length === 6, 'charts');
  assert.ok(r.upcoming.calendar.some(e => e.kind === 'holiday'), 'holidays merged');
  const c = await buildCheck('thuisbatterij', 'NL', { city: 'Gouda' });
  assert.ok(c.wiki && c.news && c.score >= 0 && c.score <= 100);
  assert.ok(c.gnews && c.reddit && c.hn && c.suggest.google.length && c.suggest.amazon.length);
  assert.equal(c.local.place.name, 'Gouda'); assert.equal(c.local.competitors.count, 3);
  assert.ok(c.sources.every(s => s.ok), JSON.stringify(c.sources.filter(s => !s.ok)));
  const mc = maskCheck(c);
  assert.equal(mc.wiki.momentum, null); assert.ok(mc.news.top.every(h => h.url === null));
  assert.ok(mc.local.competitors.top.every(p => p.url === null) && mc.reddit.top.every(p => p.url === null));
});

test('mcp connector', async () => {
  setFetch(mockFetch);
  const { default: mcp } = await import('../api/mcp.js');
  const run = (body, key = 'dr-362d937ce815868c78') => new Promise(resolve => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ code: this.statusCode, body: o }); }, send(t) { resolve({ code: this.statusCode, body: JSON.parse(t) }); }, end() { resolve({ code: this.statusCode }); } };
    mcp({ method: 'POST', query: { key }, headers: { host: 'localhost:1' }, body }, res);
  });
  assert.equal((await run({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'wrong')).code, 401);
  const init = await run({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal(init.body.result.serverInfo.name, 'demand-radar');
  const list = await run({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(list.body.result.tools.length, 4);
  const call = await run({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'check_demand', arguments: { idea: 'padel', market: 'NL', city: 'Gouda' } } });
  const text = call.body.result.content[0].text;
  assert.ok(text.includes('Demand check') && text.includes('LOCAL') && text.includes('Gouda'), text.slice(0, 300));
  const radar = await run({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'live_signals', arguments: { market: 'NL', section: 'upcoming' } } });
  assert.ok(radar.body.result.content[0].text.includes('DEMAND WINDOWS'));
  const { demandText } = await import('../api/mcp.js');
  const t = demandText({ ready: true, day: '2026-10-13', period: '2026-08', items: [{ cc: 'NL', name: 'thuisbatterij', cat: 'money', what: 'Home batteries', last: 1000, mom: 40, yoy: 120, now: { status: 'rising' }, idea: 'Sell installs', firstSeen: '2026-10-13' }], missing: [], coming: [], today: [] }, 'money', 'NL', 5);
  assert.ok(t.includes('thuisbatterij') && t.includes('rising'), t);
  process.env.TEAM_KEY = 'team-test-key';
  assert.equal((await run({ jsonrpc: '2.0', id: 5, method: 'tools/list' }, 'team-test-key')).code, 200);
  delete process.env.TEAM_KEY;
  assert.equal((await run({ jsonrpc: '2.0', method: 'notifications/initialized' })).code, 202);
});

test('daily mail, subscribe and learning loop', async () => {
  setFetch(mockFetch);
  const { useStore, memoryStore, getJSON } = await import('../lib/store.js');
  const store = memoryStore(); useStore(store);
  const { runLoop, loadState, applyChanges, record, weights, MIN } = await import('../lib/learn.js');
  const { buildDaily, subId } = await import('../lib/mail.js');
  const { default: subscribe } = await import('../api/subscribe.js');
  const call = (h, req) => new Promise(resolve => { const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ code: this.statusCode, body: o }); }, send(t) { resolve({ code: this.statusCode, body: t }); }, end() { resolve({ code: this.statusCode, headers: this.headers }); } }; h({ headers: { host: 'localhost:1' }, query: {}, ...req }, res); });
  const r1 = await call(subscribe, { method: 'POST', body: { email: 'Test@Example.com', markets: ['NL', 'US'], v: 'B' } });
  assert.equal(r1.body.status, 'saved');
  const sub = JSON.parse(await store.get(`subs/${subId('test@example.com')}.json`));
  assert.equal(sub.status, 'pending');
  const r2 = await call(subscribe, { method: 'GET', query: { confirm: `${sub.id}.${sub.token}` } });
  assert.equal(r2.headers.Location, '/?sub=ok#daily');
  assert.equal(JSON.parse(await store.get(`subs/${sub.id}.json`)).status, 'active');
  assert.equal((await call(subscribe, { method: 'POST', body: { email: 'nope', markets: ['NL'] } })).code, 400);
  // e-mail opbouwen
  const radar = await buildRadar();
  const m = buildDaily(radar, { ...sub, status: 'active' }, { base: 'https://x.test', variant: 'B', template: '{top} is rising {pct} — today\'s demand signals', topics: {} });
  assert.ok(m.subject.length > 5 && !m.subject.includes('{'), m.subject);
  assert.ok(m.html.includes('Unsubscribe') && m.html.includes('/api/go?u=') && m.headers['List-Unsubscribe']);
  // leren: gebeurtenissen tellen, oude uren worden opgeteld
  for (let i = 0; i < 5; i++) await record(store, { x: 'page', k: 'view', v: 'B' });
  for (const b of await store.list('ev/')) { store.files.set(b.pathname.replace(/ev\/\d+/, 'ev/2000010100'), '1'); store.files.delete(b.pathname); }
  const out = await runLoop(store);
  assert.ok(out.counted >= 6, JSON.stringify(out)); // 5 views + 1 sub
  const st = await loadState(store);
  assert.equal(st.page.stats.B.view, 5);
  st.page.stats = { A: { view: MIN.page, check: 10 }, B: { view: MIN.page, check: 40 }, C: { view: MIN.page, check: 5 } };
  assert.equal(weights(st, 'page').B, 0.7);
  const done = applyChanges(st, { page: { variants: { A: { h1: 'x', cta: 'y' }, C: { h1: 'New headline', lead: 'New lead', cta: 'Go' } } }, note: 'test' });
  assert.deepEqual(done, ['page C: New headline']);
  assert.equal(st.page.variants.A.h1, 'See demand rise before everyone else does.');
  useStore(undefined);
});

test('opportunity map: free signals and measured mode', async () => {
  setFetch(mockFetch);
  const { buildMap, seasonality, timing, yoy } = await import('../lib/map.js');
  const free = await buildMap({ pack: 'practice' });
  assert.equal(free.mode, 'signals');
  assert.equal(free.items.length, 30);
  assert.ok(free.items.every((p, i, a) => i === 0 || a[i - 1].score >= p.score), 'sorted');
  assert.ok(free.items.every(p => p.score >= 0 && p.score <= 100 && p.firstStep && p.offer.apps));
  process.env.DFS_LOGIN = 'x'; process.env.DFS_PASSWORD = 'y';
  const m = await buildMap({ pack: 'practice', countries: ['NL'] });
  delete process.env.DFS_LOGIN; delete process.env.DFS_PASSWORD;
  assert.equal(m.mode, 'measured');
  const job = m.items.find(p => p.nicheId === 'job-interview');
  assert.ok(job.demand.volume > 0 && job.money.cpc != null && job.trend.yoy > 1, JSON.stringify(job.trend));
  assert.deepEqual(job.timing.peaks.sort((a, b) => a - b), [1, 9]);
  assert.equal(job.timing.source, 'measured');
  assert.ok(job.offer.serp && job.offer.serp.organic.length === 8);
  assert.ok(m.dataforseo.calls >= 3 && m.dataforseo.spent > 0);
  assert.equal(timing([1], new Date(Date.UTC(2026, 9, 12))).weeks, 12);
  assert.equal(timing([10], new Date(Date.UTC(2026, 9, 12))).status, 'now');
  assert.equal(seasonality([{ ym: '2025-01', v: 1 }]), null);
  assert.equal(yoy([]), null);
});

test('rising searches (measured)', async () => {
  setFetch(mockFetch);
  const R = await import('../lib/rising.js');
  assert.equal((await R.buildRising()).ready, false);
  process.env.DFS_LOGIN = 'x'; process.env.DFS_PASSWORD = 'y';
  const r = await R.buildRising();
  delete process.env.DFS_LOGIN; delete process.env.DFS_PASSWORD;
  const all = [...r.items.month, ...r.items.year];
  assert.ok(r.ready && r.items.month.length > 0 && r.items.year.length > 0, JSON.stringify({ m: r.items.month.length, y: r.items.year.length, e: r.errors }));
  assert.ok(all.every(x => /boom/.test(x.name) && x.source === 'ads' && x.series.length === 13 && x.period), 'only growing topics, with fresh data');
  assert.ok(!all.some(x => / vs /.test(x.name)), 'sports filtered');
  assert.ok(r.items.month.every((x, i, a) => i === 0 || a[i - 1].cc !== x.cc || a[i - 1].addedMonth >= x.addedMonth));
  assert.equal(r.ai, 'off');
  // ruis, varianten en datafouten
  assert.ok(R.noise({ k: 'feyenoord tegen ajax', monthly: [] }, 'NL') && R.noise({ k: 'brand venray', monthly: [] }, 'NL') && !R.noise({ k: 'brand new shoes', monthly: [] }, 'US'));
  assert.ok(R.glitch('plywood grounds', 'playground') && !R.glitch('eclipsbrillen kopen', 'eclipsbril kopen') && !R.glitch('stopp-start-system', 'start stopp system'));
  const c = R.cluster([{ k: 'eclipsbril', volume: 100 }, { k: 'eclipsbril hema', volume: 50 }, { k: 'eclipsbrillen kopen', volume: 40 }, { k: 'airfryer', volume: 80 }]);
  assert.equal(c.length, 2); assert.deepEqual(c.find(g => g.name === 'eclipsbril').where, ['HEMA']);
  const flat = Array.from({ length: 14 }, (_, i) => ({ y: 2025 + (i > 11 ? 1 : 0), m: (i % 12) + 1, v: i < 3 ? 8 : 1000000 }));
  assert.ok(R.stepGlitch(flat));
  const ramp = Array.from({ length: 25 }, (_, i) => ({ y: 2024 + Math.floor(i / 12), m: (i % 12) + 1, v: 100 + i * i * 10 }));
  const me = R.measure(ramp); assert.ok(me.yoy > 50 && me.sustained && !R.stepGlitch(ramp));
  assert.equal(R.sumSeries([[{ y: 2026, m: 1, v: 5 }], [{ y: 2026, m: 1, v: 5 }], [{ y: 2026, m: 1, v: 7 }]])[0].v, 12);
  // AI schrapt wat geen koopvraag is en schrijft wat het is
  const { setAiFetch } = await import('../lib/ai.js');
  setAiFetch(async (url, opts) => { const p = JSON.parse(opts.body).messages[0].content; const n = (p.match(/^\d+\. /gm) || []).length; return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ r: Array.from({ length: n }, (_, i) => ({ id: i + 1, keep: i !== 0, kind: 'product', what: 'People want gadgets', idea: 'Run a shopping ad' })) }) }] }), { status: 200 }); });
  process.env.DFS_LOGIN = 'x'; process.env.DFS_PASSWORD = 'y';
  const r2 = await R.buildRising({ aiToken: 't' });
  delete process.env.DFS_LOGIN; delete process.env.DFS_PASSWORD;
  setAiFetch((...a) => fetch(...a));
  assert.equal(r2.ai, 'on');
  assert.ok([...r2.items.month, ...r2.items.year].every(x => x.what && x.idea));
  assert.ok(r2.items.month.length + r2.items.year.length < all.length);
});

test('demand radar: categories, missing, coming up, daily learning', async () => {
  setFetch(mockFetch);
  const { buildDemand, CATS } = await import('../lib/demand.js');
  const { memoryStore } = await import('../lib/store.js');
  const { setAiFetch } = await import('../lib/ai.js');
  const store = memoryStore();
  const resp = o => new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(o) }] }), { status: 200 });
  setAiFetch(async (url, opts) => {
    const p = JSON.parse(opts.body).messages[0].content;
    if (p.includes('search terms people in that country')) { const keys = [...p.matchAll(/^(\w\w\|[\w-]+):/gm)].map(m => m[1]); return resp({ t: Object.fromEntries(keys.map(k => [k, [`boom ${k.split('|')[1]}`, 'cadeau idee', 'feest spullen']])) }); }
    if (p.includes('distinct needs')) return resp({ needs: [{ need: 'An app that measures room temperature', ids: [1, 2], exists: 'no', gap: 'Phones have no thermometer', idea: 'Sell a bluetooth thermometer with app', cat: 'apps' }], today: [{ id: 1, angle: 'People want the thing in the news', cat: 'products', idea: 'Stock it now' }] });
    const n = (p.match(/^\d+\. /gm) || []).length;
    return resp({ r: Array.from({ length: n }, (_, i) => ({ id: i + 1, keep: i % 5 !== 4, cat: ['products', 'courses', 'books', 'services'][i % 4], topic: `topic ${i}`, what: 'What people want', idea: 'One idea', unexpected: i === 0, why: 'Came out of nowhere' })) });
  });
  process.env.DFS_LOGIN = 'x'; process.env.DFS_PASSWORD = 'y'; process.env.DFS_MAX_DEMAND = '10';
  const d1 = await buildDemand({ aiToken: 't', store, day: '2026-10-13' });
  const d2 = await buildDemand({ aiToken: 't', store, day: '2026-10-14' });
  delete process.env.DFS_LOGIN; delete process.env.DFS_PASSWORD; delete process.env.DFS_MAX_DEMAND;
  setAiFetch((...a) => fetch(...a));
  const ids = CATS.map(c => c.id);
  assert.ok(d1.ready && d1.items.length > 0, JSON.stringify({ n: d1.items.length, e: d1.errors, notes: d1.notes, ai: d1.aiErrors }));
  assert.ok(d1.items.every(i => ids.includes(i.cat) && typeof i.score === 'number' && i.now && i.what && i.firstSeen === '2026-10-13'));
  assert.ok(d1.items.some(i => i.unexpected) && d1.today.length > 0, 'unexpected');
  assert.ok(d1.missing.length > 0 && d1.missing[0].searches.length > 0, 'missing');
  assert.ok(d1.coming.length > 0 && d1.coming.some(c => c.terms.length), 'coming up');
  assert.ok(d1.views.find(v => v.id === 'missing').n > 0 && d1.views.find(v => v.id === 'now').n === d1.items.length);
  assert.ok(Array.isArray(d1.rise) && d1.views[0].id === 'rise' && d1.forecast && d1.forecast.backtest.series > 4000);
  assert.equal(d1.learning.day, 1); assert.ok(d1.learning.saved);
  assert.equal(d2.learning.day, 2);
  assert.ok(d2.learning.checked > 0, 'yesterday graded');
  assert.ok(d2.items.some(i => i.firstSeen === '2026-10-13' && i.seen === 2), 'remembered');
  assert.ok(!d2.items.some(i => / vs /.test(i.name)), 'sports filtered');
});

test('forecast: seasonal rise predicted, momentum not trusted, backtest numbers', async () => {
  const F = await import('../lib/forecast.js');
  const shape = [100, 100, 100, 100, 100, 100, 100, 100, 120, 300, 800, 200]; // jan..dec: piek in november
  const ser = []; for (let i = 0; i < 24; i++) { const d = new Date(Date.UTC(2024, 8 + i, 1)); ser.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, v: Math.round(shape[d.getUTCMonth()] * (i >= 12 ? 1.1 : 1)) }); }
  const p = F.predict(ser, new Date(Date.UTC(2026, 9, 13)));
  assert.equal(p.call, 'rise'); assert.equal(p.peak.m, 11); assert.ok(p.peak.v > p.from.v * 3);
  assert.deepEqual(p.months.map(m => m.m), [10, 11, 12]);
  const flat = ser.map(x => ({ ...x, v: 500 }));
  assert.equal(F.predict(flat, new Date(Date.UTC(2026, 9, 13))).call, 'flat');
  const bt = F.backtest([{ y: ser.map(x => x.v) }], { horizons: [2] });
  assert.ok(bt.find(r => r.model === 'season').wape < bt.find(r => r.model === 'naive').wape);
  assert.ok(F.BACKTEST.rise.right10 > 70 && F.BACKTEST.momentum.right10 < 20);
});
