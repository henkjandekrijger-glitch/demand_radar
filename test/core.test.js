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
  const c = await buildCheck('thuisbatterij', 'NL');
  assert.ok(c.wiki && c.news && c.score >= 0 && c.score <= 100);
  const mc = maskCheck(c);
  assert.equal(mc.wiki.momentum, null); assert.ok(mc.news.top.every(h => h.url === null));
});
