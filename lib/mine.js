// "Mijn bedrijf": een bedrijf (URL + een paar antwoorden) koppelen aan alle voorspellingen van de radar.
// mine/<id>.json            profiel: wat het verkoopt, landen, thema's, zoektermen per land
// mine/<id>/<dag>.json      dagelijkse uitkomst: vraag naar wat het verkoopt + passende voorspellingen (lui berekend bij openen)
// mine/index.json           alle profielen (voor de eigenaar)
// De zoektermen gaan op de kijklijst van de vroege signalen, dus ze worden maandelijks ververst en vroeg-signaal-getoetst.
import { randomBytes } from 'node:crypto';
import { getJSON, putJSON } from './store.js';
import { ask, parseJSON } from './ai.js';
import { earlySignal } from './early.js';

export const CCS = ['NL', 'DE', 'US'];
const INDEX = 'mine/index.json', P = id => `mine/${id}.json`, DAY = (id, d) => `mine/${id}/${d}.json`;
const today = () => new Date().toISOString().slice(0, 10);
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();

// ---------- Website lezen (alleen openbare http(s)-adressen) ----------
export function safeUrl(u) {
  let x; try { x = new URL(/^https?:\/\//i.test(u) ? u : `https://${String(u).trim()}`); } catch { return null; }
  const h = x.hostname.toLowerCase();
  if (!/^https?:$/.test(x.protocol) || !h.includes('.') || /^(localhost|.*\.local|.*\.internal)$/.test(h) || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return null;
  return x.toString();
}
export function pageText(html) {
  const g = re => { const m = html.match(re); return m ? clean(m[1]) : ''; };
  const title = g(/<title[^>]*>([\s\S]*?)<\/title>/i), desc = g(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || g(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)/i);
  const lang = g(/<html[^>]+lang=["']([a-zA-Z-]+)/i);
  const body = clean(html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#?\w+;/g, ' '));
  return { title, desc, lang, text: `${title}\n${desc}\n${body}`.slice(0, 7000) };
}
export async function readSite(url, f = fetch) {
  const u = safeUrl(url); if (!u) throw new Error('That does not look like a public website address.');
  const r = await f(u, { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; DemandRadar/1.0; +https://demandradar-ivory.vercel.app)', accept: 'text/html' } });
  if (!r.ok) throw new Error(`The website answered ${r.status}.`);
  const html = (await r.text()).slice(0, 500000);
  return { url: r.url || u, ...pageText(html) };
}

// ---------- Profiel maken met AI ----------
const SYS = 'You help Demand Radar understand a business so it can match it to search-demand data and predictions for the Netherlands, Germany and the US. Answer with JSON only.';
export async function makeProfile({ url = '', text = '', note = '', token }) {
  const prompt = `${url ? `Website: ${url}\n` : ''}${text ? `Website text (partial):\n"""${text.slice(0, 7000)}"""\n` : ''}${note ? `The owner says: ${note}\n` : ''}
Return JSON:
{"name": business or brand name,
 "summary": one plain English sentence: what it offers and to whom,
 "sells": [3-8 short things it sells or offers],
 "audience": "consumers" | "businesses" | "both",
 "countries": which of "NL","DE","US" it most likely serves,
 "themes": [5-10 broad market themes in English, 1-3 words each],
 "terms": {"NL": [12-20 Dutch Google searches a potential customer types when they need what this business offers: short, real, buying intent, not this business's own brand], "DE": [the same in German], "US": [the same in English]},
 "question": {"q": the ONE short question to the owner that would most improve matching (not about countries), "options": [2-4 short answers]}}`;
  const j = parseJSON(await ask({ prompt, system: SYS, maxTokens: 1800, token }));
  if (!j || !j.name) throw new Error('Could not understand this business. Try describing it in one sentence.');
  const terms = {}; for (const cc of CCS) terms[cc] = [...new Set(((j.terms && j.terms[cc]) || []).map(t => clean(t).toLowerCase()).filter(t => t.length > 2 && t.length < 80))].slice(0, 20);
  return { name: clean(j.name).slice(0, 80), summary: clean(j.summary).slice(0, 240), sells: (j.sells || []).map(clean).filter(Boolean).slice(0, 8), audience: j.audience || 'both',
    countries: (j.countries || []).filter(c => CCS.includes(c)), themes: (j.themes || []).map(clean).filter(Boolean).slice(0, 10), terms,
    question: j.question && j.question.q ? { q: clean(j.question.q).slice(0, 160), options: (j.question.options || []).map(clean).filter(Boolean).slice(0, 4) } : null };
}

// ---------- Opslaan ----------
export async function saveProfile(store, { url, profile, answers = {}, owner = '' }) {
  const id = randomBytes(8).toString('base64url').replace(/[-_]/g, '').slice(0, 10).toLowerCase();
  const ccs = (answers.countries || profile.countries || []).filter(c => CCS.includes(c));
  const brand = profile.name.toLowerCase();
  const terms = {}; for (const cc of ccs) terms[cc] = [...new Set([...(profile.terms[cc] || []), ...(brand.length >= 3 ? [brand] : [])])].slice(0, 21);
  const rec = { id, made: new Date().toISOString(), url: url || null, owner, profile: { ...profile, countries: ccs, terms }, answers };
  await putJSON(store, P(id), rec);
  const ix = (await getJSON(store, INDEX, null).catch(() => null)) || [];
  ix.push({ id, name: profile.name, url: url || null, owner, made: rec.made }); await putJSON(store, INDEX, ix);
  return rec;
}
export const getProfile = (store, id) => (/^[a-z0-9]{6,16}$/.test(String(id)) ? getJSON(store, P(id), null).catch(() => null) : null);
export async function listProfiles(store, owner = null) { const ix = (await getJSON(store, INDEX, null).catch(() => null)) || []; return owner ? ix.filter(x => x.owner === owner) : ix; }

// Zoektermen meteen ophalen (4 jaar, ± $0,08 per land) en op de kijklijst zetten.
export async function fetchTerms(store, rec, { max = 0.4 } = {}) {
  const { searchVolume, budget, dfsReady, underCap } = await import('./dfs.js'), { COUNTRIES } = await import('./niches.js'), { queueEarlyTerms, seedEarly } = await import('./earlydata.js');
  const out = {};
  for (const [cc, kws] of Object.entries(rec.profile.terms)) {
    if (!kws.length) continue;
    if (!dfsReady() || !(await underCap(0.5))) { out[cc] = { queued: await queueEarlyTerms(store, cc, kws) }; continue; }
    const v = await searchVolume(kws, COUNTRIES[cc], budget(max), { months: 48 }).catch(() => ({})), ser = {};
    for (const [k, x] of Object.entries(v)) if (x.monthly && x.monthly.length >= 27) ser[k] = { m: x.monthly.map(r => [r.y, r.m, r.v]), cpc: x.cpc };
    if (Object.keys(ser).length) await seedEarly(store, cc, ser);
    out[cc] = { got: Object.keys(ser).length, queued: await queueEarlyTerms(store, cc, kws.filter(k => !ser[k])) };
  }
  return out;
}

// ---------- Vraag naar wat het bedrijf verkoopt ----------
export function ownDemand(rec, series) {
  const out = {};
  for (const [cc, kws] of Object.entries(rec.profile.terms)) {
    const kw = (series[cc] && series[cc].kw) || {}, rows = [], waiting = [], tot = new Map();
    for (const k of kws) {
      const s = kw[k]; if (!s || !s.m || s.m.length < 14) { waiting.push(k); continue; }
      const m = s.m.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), y = m.map(r => +r[2] || 0), t = y.length - 1;
      m.forEach(r => { const key = `${r[0]}-${String(r[1]).padStart(2, '0')}`; tot.set(key, (tot.get(key) || 0) + (+r[2] || 0)); });
      const s3 = y.slice(-3).reduce((a, b) => a + b, 0), l3 = y.slice(-15, -12).reduce((a, b) => a + b, 0);
      const e = earlySignal(m, cc, k);
      rows.push({ k, v: y[t], ly: y[t - 12], yoy: l3 ? Math.round((s3 / l3 - 1) * 100) : null, spark: y.slice(-13), early: e && e.call ? { tier: e.tier, chance: e.chance } : null, cpc: s.cpc ?? null });
    }
    const months = [...tot.keys()].sort(), tv = months.map(x => tot.get(x)), n = tv.length;
    const s3 = tv.slice(-3).reduce((a, b) => a + b, 0), l3 = n >= 15 ? tv.slice(-15, -12).reduce((a, b) => a + b, 0) : 0;
    out[cc] = { month: months[n - 1] || null, total: tv[n - 1] || 0, yoy: l3 ? Math.round((s3 / l3 - 1) * 100) : null, spark: tv.slice(-13), terms: rows.sort((a, b) => b.v - a.v), waiting };
  }
  return out;
}

// ---------- Voorspellingen die het bedrijf raken ----------
export function candidates(d, early, wild, ccs) {
  const on = x => !x.cc || x.cc === 'WW' || ccs.includes(x.cc), out = [], cut = s => clean(s).slice(0, 120);
  const add = (id, type, cc, name, about, show) => out.push({ id, type, cc, name: cut(name), about: cut(about), show });
  (d.rise || []).filter(on).forEach((x, i) => { const pk = x.forecast && x.forecast.peak; add(`r${i}`, 'rise', x.cc, x.name, x.what, { q: x.keyword, chance: x.forecast && x.forecast.chance, peak: pk ? { y: pk.y, m: pk.m, v: pk.v } : null }); });
  (d.items || []).filter(on).forEach((x, i) => add(`n${i}`, 'now', x.cc, x.name, x.what, { q: x.keyword, yoy: x.yoy, v: x.last }));
  (early || []).filter(on).forEach((x, i) => add(`e${i}`, 'early', x.cc, x.k, x.tier === 'starting' ? 'starting to rise' : 'not visible in the numbers yet', { q: x.k, tier: x.tier, chance: x.chance }));
  (d.coming || []).filter(on).forEach((x, i) => add(`c${i}`, 'coming', x.cc, x.name, `${x.date}${x.ideas ? `; ${x.ideas.slice(0, 3).join(', ')}` : ''}`, { date: x.date, days: x.days, terms: (x.terms || []).slice(0, 3).map(t => t.k) }));
  (d.missing || []).filter(on).forEach((x, i) => add(`m${i}`, 'missing', x.cc, x.need, x.idea, { q: x.searches && x.searches[0] && x.searches[0].q }));
  (d.today || []).filter(on).forEach((x, i) => add(`t${i}`, 'today', x.cc, x.name, x.angle, { q: x.keyword }));
  ((wild && wild.items) || []).filter(x => x.ccs.some(c => ccs.includes(c))).forEach(x => add(`w${x.id}`, 'wild', x.ccs.filter(c => ccs.includes(c)).join('/'), x.title, x.claim, { status: x.status, due: x.due }));
  return out;
}
export async function matchAI(rec, cands, token, dbg = null) {
  if (!cands.length) return [];
  const p = rec.profile, a = rec.answers || {};
  const prompt = `Business: ${p.name}. ${p.summary}
Sells: ${p.sells.join('; ')}. Audience: ${p.audience}. Countries: ${p.countries.join(', ')}. Themes: ${p.themes.join(', ')}.${a.answer ? `\nOwner's answer to "${p.question && p.question.q}": ${a.answer}` : ''}${a.extra ? `\nOwner also offers or plans: ${a.extra}` : ''}

Demand Radar items (id | type | country | name | about):
${cands.map(c => `${c.id} | ${c.type} | ${c.cc} | ${c.name} | ${c.about}`).join('\n')}

Pick the items that really matter to this business. Kinds: "direct" (more or less demand for what it sells), "adjacent" (demand it could serve with a small step), "moment" (a date or season to prepare for), "threat" (something that could cost it customers). Be strict: leave out anything a sensible owner would call unrelated. At most 15 in total and at most 5 moments; look hardest for direct, adjacent and threat. Only use ids from the list.
Return JSON: {"matches":[{"id":..., "kind":..., "fit": 1-3 (3 = very relevant), "say": one short sentence (max 25 words) for the owner: what it means and what to do}]}`;
  const raw = await ask({ prompt, system: 'You match market signals to one specific business. Answer with JSON only.', maxTokens: 2500, token, model: process.env.MINE_MODEL || 'anthropic/claude-haiku-5.5' }), j = parseJSON(raw);
  if (dbg) { dbg.n = cands.length; dbg.raw = String(raw).slice(0, 3000); }
  const by = new Map(cands.map(c => [c.id, c]));
  // ook een afgekapt antwoord gebruiken: elk volledig {"id":…}-object apart lezen
  const list = (j && j.matches) || (String(raw).match(/\{[^{}]*"id"\s*:\s*"[^"]+"[^{}]*\}/g) || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
  return list.filter(m => by.has(m.id) && ['direct', 'adjacent', 'moment', 'threat'].includes(m.kind))
    .map(m => { const c = by.get(m.id); return { kind: m.kind, fit: Math.max(1, Math.min(3, +m.fit || 1)), say: clean(m.say).slice(0, 220), type: c.type, cc: c.cc, name: c.name, ...c.show }; })
    .sort((x, y) => y.fit - x.fit).slice(0, 20);
}

// Dagelijkse uitkomst (lui: bij openen; daarna uit de opslag).
export async function dailyMine(store, rec, { token, getDemand, force = false, debug = false } = {}) {
  const day = today();
  if (!force) { const c = await getJSON(store, DAY(rec.id, day), null).catch(() => null); if (c) return c; }
  const { latestEarly } = await import('./earlydata.js'), { wildList } = await import('./wildcards.js');
  const ccs = rec.profile.countries, series = {};
  for (const cc of ccs) series[cc] = (await getJSON(store, `early/series-${cc}.json`, null).catch(() => null)) || { kw: {} };
  const own = ownDemand(rec, series);
  const d = getDemand ? await getDemand().catch(() => ({})) : {}, L = await latestEarly(store), W = await wildList(store).catch(() => null);
  let matches = [], note = null;
  const dbg = debug ? {} : null;
  try { matches = await matchAI(rec, candidates(d || {}, L ? L.items : [], W, ccs), token, dbg); } catch (e) { note = 'Matching is not available right now; try again later.'; if (dbg) dbg.error = String(e.message || e); }
  const out = { day, made: new Date().toISOString(), radarDay: d && d.day, own, matches, note, ...(dbg ? { debug: dbg } : {}) };
  if (!note) await putJSON(store, DAY(rec.id, day), out).catch(() => {});
  return out;
}
