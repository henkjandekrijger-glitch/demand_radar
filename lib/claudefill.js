// Claude vult de teksten van de radar in vanuit een eigen sessie (4 nov 2026, Henkjan: "Vul content gewoon aan met jouw
// tokens. Niet Vercel gateway!!"). Geen AI-aanroep vanaf Vercel:
// 1) GET /api/fill geeft wat er vandaag nog een tekst mist (onderwerpen, verwachte stijgers, trending, voorspellingsmarkten)
//    plus de instructie en het antwoordformaat. Alleen openbare radargegevens, dus zonder sleutel.
// 2) Claude (dagelijkse geplande taak of een chat) schrijft de antwoorden als fill/<dag>.json op tak `fill` van de repo
//    (alleen wie mag pushen kan dat; Vercel bouwt die tak niet), of POST /api/fill?key=<teamsleutel>.
// 3) De uurronde (api/warm.js) haalt fill/<dag>.json op en past het toe: de radar van vandaag, het geheugen (onderwerpen
//    5 dagen, stijgers 7 dagen, zodat de opbouw van morgen ze hergebruikt) en de events van vandaag.
import { getJSON, putJSON } from './store.js';
import { itemMemo } from './ai.js';

const REPO_RAW = () => process.env.FILL_RAW || 'https://raw.githubusercontent.com/henkjandekrijger-glitch/demand_radar/fill/fill';
const s = (v, n) => (v == null || v === '' ? null : String(v).slice(0, n));
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function pendingFill(store, { radar = null } = {}) {
  const D = await import('./demand.js'), d = (await getJSON(store, 'maps/demand.json', null).catch(() => null)) || {};
  const day = d.day || null;
  const items = (d.items || []).filter(x => !x.title && !x.filled).map(x => ({ id: x.id, cc: x.cc, name: x.name, also: (x.members || []).slice(1, 4).map(m => m.k), searchedWith: (x.where || []).slice(0, 3), foundAs: x.hint || null, perMonth: x.last, vsPrevMonth: x.mom, vsLastYear: x.yoy, period: x.period, now: x.now ? x.now.status : null }));
  const rise = (d.rise || []).filter(x => !x.title && !x.filled).map(x => { const f = x.forecast || {}; return { id: x.id, cc: x.cc, name: x.name, now: f.from ? `${Math.round(f.from.v)} (${MONS[f.from.m - 1]})` : null, predicted: (f.months || []).slice(0, 6).map(m => `${MONS[m.m - 1]} ${Math.round(m.v)}`).join(', '), lastYear: (f.lastYear || []).slice(0, 6).map(m => `${MONS[m.m - 1]} ${Math.round(m.v)}`).join(', ') }; });
  const trending = {};
  for (const g of ((radar && radar.spikes && radar.spikes.search) || [])) if (['NL', 'DE', 'US'].includes(g.geo)) trending[g.geo] = (g.items || []).map(t => ({ name: t.name, traffic: t.traffic, news: t.news ? t.news.title : null }));
  const ev = await getJSON(store, `events/latest.json`, null).catch(() => null), evDay = new Date().toISOString().slice(0, 10);
  const mk = ev && ev.day === evDay ? null : await getJSON(store, `events/markets-${evDay}.json`, null).catch(() => null);
  const markets = mk ? mk.items.map((x, i) => ({ n: i + 1, q: x.title, leading: x.outcome, chance: x.prob, ends: x.ends })) : [];
  const { EVENTS_SYS } = await import('./events.js');
  return {
    day, eventsDay: evDay, todo: { items: items.length, rise: rise.length, trending: Object.values(trending).flat().length, markets: markets.length },
    how: `Write one JSON file and save it as fill/${day}.json on branch "fill" of github.com/henkjandekrijger-glitch/demand_radar (or POST it to /api/fill?key=<team key>). Leave out what you have no good answer for. Format:
{"day":"${day}","eventsDay":"${evDay}","items":{"<id>":{"keep":true,"title":"...","cat":"products","topic":"...","what":"...","idea":"...","unexpected":false}},"rise":{"<id>":{"keep":true,"oneoff":false,"title":"...","cat":"...","topic":"...","what":"...","idea":"..."}},"today":[{"cc":"NL","name":"<trending name exactly as given>","title":"...","angle":"...","cat":"products","idea":"..."}],"events":[{"n":1,"effect":"...","dir":"more","cc":["NL"],"terms":{"NL":["..."]}}]}
Rules for "items" (search topics with measured numbers): ${D.SYS_ROWS.split('\n').slice(2, 5).join(' ')}
Rules for "rise" (searches predicted to rise): ${D.SYS_RISE.split('\n').slice(2, 5).join(' ')}
Rules for "today" (today's trending Google searches per country): pick only those that create buying demand; "title" 2-5 words, attractive plain English name of what people will want to buy or book; "angle" max 12 words; "idea" max 14 words.
Rules for "events" (prediction markets, n = number in the list): ${EVENTS_SYS.split('\n').slice(1, 3).join(' ')}`,
    items, rise, trending, markets,
  };
}

// Antwoorden toepassen op de radar van vandaag, het geheugen en de events.
export async function applyFill(store, f, { by = 'claude' } = {}) {
  if (!f || typeof f !== 'object') return { error: 'no fill' };
  const D = await import('./demand.js'), CAT = D.CAT_IDS, res = { items: 0, dropped: 0, rise: 0, today: 0, events: 0 };
  const d = await getJSON(store, 'maps/demand.json', null).catch(() => null);
  const [rowMemo, riseMemo] = await Promise.all([itemMemo(store, 'demand-rows', 5), itemMemo(store, 'demand-rise', 7)]);
  const fields = (a, x) => ({ title: s(a.title, 60) || x.title || null, cat: CAT.includes(a.cat) ? a.cat : x.cat, topic: a.topic ? String(a.topic).toLowerCase().slice(0, 60) : x.topic || null, what: s(a.what, 90) || x.what || null, idea: s(a.idea, 130) || x.idea || null });
  if (d && d.ready) {
    const A = f.items || {}, R = f.rise || {};
    d.items = (d.items || []).map(x => {
      const a = A[x.id]; if (!a) return x;
      for (const k of [x.name, ...(x.members || []).map(m => m.k)]) rowMemo.set(`${x.cc}|${k}`, a);
      if (a.keep === false) { res.dropped++; return null; }
      res.items++; return { ...x, ...fields(a, x), unexpected: !!a.unexpected, why: a.unexpected ? s(a.why, 90) : null, filled: by };
    }).filter(Boolean);
    // zelfde onderwerp in hetzelfde land → één regel (zoals de opbouw doet)
    const byTopic = new Map();
    d.items = d.items.filter(x => {
      const k = x.topic ? `${x.cc}|${x.topic}` : null, first = k && byTopic.get(k);
      if (!first) { if (k) byTopic.set(k, x); return true; }
      const have = new Set((first.members || []).map(m => m.k));
      for (const m of [{ k: x.name }, ...(x.members || [])]) if (!have.has(m.k)) { have.add(m.k); (first.members = first.members || []).push({ k: m.k }); }
      first.members = first.members.slice(0, 8); return false;
    });
    d.rise = (d.rise || []).map(x => {
      const a = R[x.id]; if (!a) return x;
      riseMemo.set(`${x.cc}|${x.name}`, a);
      if (a.keep === false || a.oneoff) { res.dropped++; return null; }
      res.rise++; return { ...x, ...fields(a, x), filled: by };
    }).filter(Boolean);
    if (Array.isArray(f.today) && f.today.length) {
      const ccs = new Set(f.today.map(t => t.cc));
      const T = f.today.filter(t => t && t.name && t.angle && ['NL', 'DE', 'US'].includes(t.cc)).slice(0, 30).map(t => ({ cc: t.cc, name: s(t.name, 80), title: s(t.title, 60), traffic: s(t.traffic, 20), news: t.news && t.news.url ? t.news : null, angle: s(t.angle, 90), cat: CAT.includes(t.cat) ? t.cat : 'products', idea: s(t.idea, 130) }));
      d.today = [...(d.today || []).filter(t => !ccs.has(t.cc)), ...T]; res.today = T.length;
    }
    const count = id => id === 'rise' ? d.rise.length : id === 'now' ? d.items.length : id === 'unexpected' ? d.items.filter(i => i.unexpected).length + (d.today || []).length : id === 'missing' ? (d.missing || []).length : id === 'coming' ? (d.coming || []).length : d.items.filter(i => i.cat === id).length;
    d.views = (d.views || D.VIEWS).map(v => ['early', 'wild'].includes(v.id) ? v : { ...v, n: count(v.id) });
    d.ai = by; d.aiErrors = []; d.filled = { at: new Date().toISOString(), by, ...res };
    await putJSON(store, 'maps/demand.json', d);
    await Promise.all([rowMemo.save(), riseMemo.save()]);
  }
  if (Array.isArray(f.events) && f.events.length) {
    const evDay = f.eventsDay || new Date().toISOString().slice(0, 10), mk = await getJSON(store, `events/markets-${evDay}.json`, null).catch(() => null);
    if (mk && mk.items) { const { saveEvents } = await import('./events.js'); const out = await saveEvents(store, mk.items, f.events, evDay, Date.now(), [], by); res.events = out.items.length; }
  }
  return res;
}

// Uurronde: fill/<dag>.json van tak `fill` ophalen en één keer toepassen (opnieuw als het bestand verandert).
export async function fillFromRepo(store, day) {
  if (!day) return { skip: 'no day' };
  const r = await fetch(`${REPO_RAW()}/${day}.json`, { signal: AbortSignal.timeout(15000), headers: { 'cache-control': 'no-cache' } }).catch(() => null);
  if (!r || !r.ok) return { none: r ? r.status : 'fetch failed' };
  const text = await r.text(); let f; try { f = JSON.parse(text); } catch { return { error: 'bad json' }; }
  const { createHash } = await import('node:crypto'), h = createHash('sha256').update(text).digest('hex').slice(0, 16), k = `fill/applied-${day}.json`;
  const done = await getJSON(store, k, null).catch(() => null);
  if (done && done.h === h) return { already: done.at };
  const res = await applyFill(store, f, { by: 'claude' });
  await putJSON(store, k, { h, at: new Date().toISOString(), res }).catch(() => {});
  return res;
}
