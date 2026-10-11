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
  assert.equal(list.body.result.tools.length, 2);
  const call = await run({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'check_demand', arguments: { idea: 'padel', market: 'NL', city: 'Gouda' } } });
  const text = call.body.result.content[0].text;
  assert.ok(text.includes('Demand check') && text.includes('LOCAL') && text.includes('Gouda'), text.slice(0, 300));
  const radar = await run({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'demand_radar', arguments: { market: 'NL', section: 'upcoming' } } });
  assert.ok(radar.body.result.content[0].text.includes('DEMAND WINDOWS'));
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
