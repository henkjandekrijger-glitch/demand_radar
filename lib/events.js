// Events: wat de wereld verwacht (voorspellingsmarkten) en wat dat voor de vraag betekent (18 okt 2026).
// Bronnen (gratis, openbaar, alleen lezen): Polymarket (gamma-api) en Kalshi (trade-api v2, marktgegevens).
// Per dag één keer: de open gebeurtenissen met het meeste geld erop ophalen, daarna kiest AI (één vraag) welke de vraag
// van consumenten of kleine bedrijven in NL/DE/US verschuiven, met per land de echte zoektermen in de eigen taal.
// Elke dag een momentopname (events/<dag>.json): zo kunnen we later nakijken wat er gebeurde en of de vraag meebewoog.
import { getJSON, putJSON } from './store.js';
import { ask, askCached, parseJSON, CHEAP } from './ai.js';

const UA = { 'user-agent': 'DemandRadar/1.0 (+https://demandradar-ivory.vercel.app)', accept: 'application/json' };
const arr = v => { if (Array.isArray(v)) return v; try { const j = JSON.parse(v || '[]'); return Array.isArray(j) ? j : []; } catch { return []; } };
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

// Polymarket: een gebeurtenis met één ja/nee-markt → kans op "ja"; met meerdere markten → de koploper.
export function polyEvent(e) {
  const ms = (e.markets || []).filter(m => !m.closed);
  const rows = ms.map(m => { const o = arr(m.outcomes), p = arr(m.outcomePrices).map(Number), yes = o.findIndex(x => /^yes$/i.test(x)); return { label: m.groupItemTitle || m.question, p: yes >= 0 ? p[yes] : p[0], q: m.question }; }).filter(r => r.p != null && isFinite(r.p));
  if (!rows.length) return null;
  const lead = rows.length === 1 ? rows[0] : rows.sort((a, b) => b.p - a.p)[0];
  return { src: 'Polymarket', id: `pm-${e.id}`, title: e.title, url: `https://polymarket.com/event/${e.slug}`, ends: (e.endDate || '').slice(0, 10) || null, prob: Math.round(lead.p * 100), outcome: rows.length > 1 ? lead.label : 'Yes', options: rows.length, volume: Math.round(+e.volume24hr || +e.volume || 0), tags: (e.tags || []).map(t => t.label).filter(Boolean).slice(0, 4) };
}
export function kalshiEvent(e) {
  const ms = (e.markets || []).filter(m => !m.status || /open|active/i.test(m.status));
  const price = m => { const d = m.last_price_dollars ?? m.yes_bid_dollars; if (d != null && d !== '') return +d; const c = m.last_price || ((+m.yes_bid || 0) + (+m.yes_ask || 0)) / 2; return c ? c / 100 : null; };
  const rows = ms.map(m => ({ label: m.yes_sub_title || m.subtitle || m.title, p: price(m), close: m.close_time, vol: +m.volume || 0 })).filter(r => r.p != null && isFinite(r.p) && r.p > 0);
  if (!rows.length) return null;
  const lead = rows.sort((a, b) => b.p - a.p)[0];
  return { src: 'Kalshi', id: `ks-${e.event_ticker}`, title: e.title + (e.sub_title ? ` (${e.sub_title})` : ''), url: `https://kalshi.com/markets/${String(e.series_ticker || e.event_ticker || '').toLowerCase()}`, ends: (lead.close || '').slice(0, 10) || null, prob: Math.round(lead.p * 100), outcome: rows.length > 1 ? lead.label : 'Yes', options: rows.length, volume: rows.reduce((a, r) => a + r.vol, 0), tags: e.category ? [e.category] : [] };
}

export async function fetchMarkets() {
  const out = [], errors = [];
  try {
    const r = await fetch('https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume24hr&ascending=false&limit=120', { headers: UA, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`Polymarket ${r.status}`);
    for (const e of await r.json()) { const x = polyEvent(e); if (x) out.push(x); }
  } catch (e) { errors.push(String(e.message || e).slice(0, 100)); }
  try {
    let cursor = '', n = 0;
    do {
      const r = await fetch(`https://api.elections.kalshi.com/trade-api/v2/events?status=open&with_nested_markets=true&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { headers: UA, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`Kalshi ${r.status}`);
      const j = await r.json(); for (const e of j.events || []) { const x = kalshiEvent(e); if (x) out.push(x); }
      cursor = j.cursor || ''; n++;
    } while (cursor && n < 3);
  } catch (e) { errors.push(String(e.message || e).slice(0, 100)); }
  // sport-uitslagen per wedstrijd en kortlopende koersmarkten zijn ruis voor de radar
  const noise = /\b(vs\.?|o\/u|over\/under|spread|1st half|map \d|game \d|set \d|bitcoin (up|down)|price of|above \$|below \$|temperature in|tweets?)\b/i;
  return { items: out.filter(x => x.title && !noise.test(x.title)).sort((a, b) => b.volume - a.volume).slice(0, 160), errors };
}

// AI: welke gebeurtenissen verschuiven de vraag, en hoe (per land de echte zoektermen).
async function pick(items, token, today) {
  // haiku (kiezen uit een lijst + zoektermen = classificatie); één keer per dag; vaste instructie in de gecachete systeemprompt.
  const system = `You link world events to consumer demand. Be concrete and selective. JSON only, no reasoning.
Input: open questions on prediction markets, with the market's chance for the leading outcome. Pick up to 18 that will clearly change what consumers or small businesses in the Netherlands, Germany or the US search for, buy, book or arrange (prices, tariffs, interest rates, energy, travel, big sports and culture events, product launches, rules). Skip pure politics without a consumer effect and anything not decided within 12 months.
For each: "n" (its number), "effect" (one plain English sentence: if the leading outcome happens, what people will want more or less of, and when), "dir" ("more" or "less"), "cc" (the countries affected, from NL, DE, US), "terms" ({"NL":[...],"DE":[...],"US":[...]}: 2-3 real search queries per affected country, in that country's language, as people type them).
JSON only: {"r":[{"n":1,"effect":"...","dir":"more","cc":["US"],"terms":{"US":["..."]}}]}`;
  const prompt = `Today: ${today}.
${items.map((x, i) => `${i + 1}. ${String(x.title).slice(0, 120)} — ${String(x.outcome).slice(0, 50)}: ${x.prob}% (${x.ends || 'later'})`).join('\n')}`;
  let raw = await askCached({ task: 'events', ttlH: 20, token, model: CHEAP(), maxTokens: 8000, timeoutMs: 90000, system, prompt });
  let r = ((parseJSON(raw) || {}).r || []).filter(x => items[+x.n - 1]);
  // leeg of afgekapt antwoord (sinds 20 okt bleef de lijst staan): één keer opnieuw met het standaardmodel, zonder cache
  if (!r.length) { raw = await ask({ token, maxTokens: 8000, timeoutMs: 100000, system, prompt }).catch(e => String(e.message || e)); r = ((parseJSON(raw) || {}).r || []).filter(x => items[+x.n - 1]); }
  if (!r.length) pick.last = String(raw || '').slice(-160);
  return r;
}

export async function getEvents(store, { token, force = false, now = Date.now() } = {}) {
  const today = day(now), key = 'events/latest.json';
  const c = await getJSON(store, key, null).catch(() => null);
  if (!force && c && c.day === today && c.items && c.items.length) return c;
  if (!token) return c || { day: today, items: [], note: 'no AI' };
  const M = await fetchMarkets();
  if (!M.items.length) return c ? { ...c, stale: true, errors: ['no market data', ...M.errors] } : { day: today, items: [], errors: M.errors };
  let picked = []; try { picked = await pick(M.items, token, today); } catch (e) { M.errors.push(String(e.message || e).slice(0, 100)); }
  if (!picked.length) return c ? { ...c, stale: true, errors: [`AI picked nothing: ${pick.last || ''}`.slice(0, 200), ...M.errors] } : { day: today, items: [], errors: M.errors };
  const items = picked.map(x => { const e = M.items[+x.n - 1]; return { ...e, effect: String(x.effect || '').slice(0, 260), dir: x.dir === 'less' ? 'less' : 'more', ccs: (x.cc || []).filter(k => ['NL', 'DE', 'US'].includes(k)), terms: Object.fromEntries(Object.entries(x.terms || {}).filter(([k]) => ['NL', 'DE', 'US'].includes(k)).map(([k, v]) => [k, (v || []).map(String).slice(0, 3)])) }; });
  const out = { day: today, made: new Date(now).toISOString(), items, scanned: M.items.length, errors: M.errors };
  await putJSON(store, key, out).catch(() => {});
  await putJSON(store, `events/${today}.json`, out).catch(() => {}); // momentopname om later na te kijken
  return out;
}
