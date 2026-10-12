// "What came up": gemeten Google-zoekopdrachten die het hardst groeien, per land (DataForSEO).
// 1) Labs "top searches" op maandgroei en jaargroei (koop- en vergelijkzoekopdrachten),
// 2) ruis eruit: wedstrijden, nieuws, personen, downloadtrucs en schijnsprongen door Google's samenvoegen van varianten,
// 3) varianten samen tot één onderwerp (eclipsbril, eclipsbril hema, eclipsbrillen kopen → eclipsbril, gezocht bij HEMA),
// 4) verse Google Ads-maanddata over 25 maanden: echte groei t.o.v. vorige maand én dezelfde maand vorig jaar,
// 5) AI zegt per onderwerp wat mensen willen en een eerste verkoopidee, en schrapt wat geen koopvraag is.
// Valt AI weg, dan blijven stap 1 t/m 4 staan.
import { dfsReady, budget, topSearches, searchVolume, cleanKw } from './dfs.js';
import { COUNTRIES } from './niches.js';
import { ask, parseJSON } from './ai.js';

const MIN = { NL: 300, DE: 1000, US: 3000 };     // minimale zoekvolumes en minimale groei in zoekopdrachten
const PER_LIST = 25;                                // per land per lijst
const FRESH = 45;                                   // onderwerpen per land die verse Google Ads-data krijgen

const ADULT = /porn|sex|xxx|nude|naakt|nackt|escort|onlyfans|casino|gokken|wetten|betting|\bslots?\b|lotto|erotik/i;
const NOISE = new RegExp([
  // sport: wedstrijden, standen, opstellingen, toernooien
  String.raw`\bvs\.?\b`, String.raw`\bversus\b`, String.raw`\bgegen\b`, String.raw`\btegen\b`, String.raw`\bmatch\b`, 'player stats', 'statisti', 'aufstellung', 'opstelling',
  String.raw`\bline-?ups?\b`, 'teilnehmer', 'tabelle', String.raw`^stand\b`, String.raw`\bticker\b`, 'timeline', 'uitslag', 'ergebnis', 'spielplan', 'speelschema',
  String.raw`\b(ek|wk|em|wm)\b`, 'leichtathletik', 'atletiek',
  // media en personen
  'tatort', String.raw`\bnetflix\b`, String.raw`\bhulu\b`, 'aflevering', String.raw`\bfolge\b`, 'staffel', String.raw`\bepisode`, String.raw`\bcast\b`, 'besetzung',
  String.raw`\bfrau\b`, String.raw`\bvrouw\b`, String.raw`\bwife\b`, 'husband', 'freundin', 'net worth',
  // vragen, inloggen, meldingen
  String.raw`^(wie|wat|wer|was|who|what|met welke|hoe oud|how old)\b`, 'inloggen', String.raw`\blogin\b`, 'anmelden', 'p2000',
  // downloadtrucs
  'download', 'convert', String.raw`\bapk\b`, 'torrent', String.raw`\bcrack\b`,
  // kaartjes voor één evenement
  String.raw`\btickets?\b`, String.raw`\bkarten\b`, String.raw`\bkaarten\b`,
  // nieuws en rampen
  'datalek', String.raw`closures?\b`, 'betrug', 'ongeluk', 'unfall', 'shooting', String.raw`\bdied\b`, 'overleden', 'gestorben', 'polizei', 'politie', String.raw`\bfeuer\b`, 'stromausfall', 'storing',
].join('|'), 'i');
const FIRE = /(^|\s)brand(\s|$)/i; // in NL en DE betekent "brand" vuur

// Winkels in een zoekopdracht zeggen wáár mensen het zoeken; ze tellen niet mee voor het onderwerp.
const SHOPS = ['albert heijn', 'best buy', 'home depot', 'action', 'hema', 'kruidvat', 'etos', 'bol', 'coolblue', 'mediamarkt', 'jumbo', 'lidl', 'aldi', 'ikea', 'blokker',
  'gamma', 'praxis', 'karwei', 'intratuin', 'zeeman', 'wibra', 'primark', 'decathlon', 'rossmann', 'dm', 'müller', 'otto', 'kaufland', 'saturn', 'obi', 'hornbach', 'tchibo',
  'temu', 'shein', 'amazon', 'walmart', 'target', 'costco', 'bestbuy', 'lowes', 'kohls', 'cvs', 'walgreens', 'ebay', 'etsy', 'marktplaats', 'zalando', 'depot'];
const SHOP_NAME = { 'albert heijn': 'Albert Heijn', 'best buy': 'Best Buy', 'home depot': 'Home Depot', hema: 'HEMA', dm: 'dm', bol: 'bol', cvs: 'CVS', obi: 'OBI' };
const STOP = new Set(('kopen kaufen buy bestellen order waar wo where winkel laden shop store stores online near me in de het een der die das the a an of for voor für fur met mit with and en und '
  + 'prijs preis price prices kosten cost goedkoop günstig gunstig cheap best beste top sale aanbieding angebot angebote deal deals nl com morgen huis vandaag heute today nu jetzt now '
  + '2025 2026 2027 nieuw neue neu new kopen').split(' '));

const pad = n => String(n).padStart(2, '0');
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const sortSeries = m => [...(m || [])].filter(x => x && x.v != null).sort((a, b) => a.y - b.y || a.m - b.m);

export function stem(w) {
  if (w.length <= 4 || /\d/.test(w)) return w;
  let s = w.replace(/(en|es|e|s|n)$/, '');
  if (/([b-df-hj-np-tv-z])\1$/.test(s)) s = s.slice(0, -1);
  return s;
}
const words = k => String(k || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);

// Google voegt schrijfvarianten samen; een variant die anders is dan zijn kernwoord beweegt mee met dat samenvoegen, niet met vraag.
export function glitch(k, core) {
  if (!core) return false;
  const a = words(k).map(stem), b = words(core).map(stem);
  if ([...a].sort().join(' ') === [...b].sort().join(' ')) return false;
  if (a.join('') === b.join('') || words(k).join('') === words(core).join('')) return false;
  return true;
}

export function topicOf(k) {
  let s = ' ' + words(k).join(' ') + ' ';
  const where = [];
  for (const shop of SHOPS) if (s.includes(' ' + shop + ' ')) { where.push(SHOP_NAME[shop] || shop[0].toUpperCase() + shop.slice(1)); s = s.split(' ' + shop + ' ').join(' '); }
  const t = [...new Set(s.trim().split(' ').filter(w => w && !STOP.has(w)).map(stem))];
  return { t: t.length ? t : [words(k).join(' ')], where };
}

export function noise(x, cc) {
  const k = x.k || '';
  if (!k || ADULT.test(k) || NOISE.test(k) || /^[\d\s]+$/.test(k)) return true;
  if ((cc === 'NL' || cc === 'DE') && FIRE.test(k)) return true;
  if (glitch(k, x.core)) return true;
  const s = sortSeries(x.monthly), n = s.length;
  if (n >= 4) { // een sprong uit het niets zonder aanloop is bijna altijd nieuws of een datafout
    const last = s[n - 1].v, prev = s[n - 2].v, base = Math.max(10, median(s.slice(0, n - 3).map(m => m.v)));
    if (last / base > 50 && prev / base < 3) return true;
  }
  return false;
}

// Varianten samenvoegen: een zoekopdracht hoort bij een onderwerp als hij alle woorden van dat onderwerp bevat.
export function cluster(list) {
  const rows = list.map(x => ({ ...x, ...topicOf(x.k) })).sort((a, b) => a.t.length - b.t.length || b.volume - a.volume);
  const groups = [];
  for (const x of rows) {
    const g = groups.find(g => (x.core && g.cores.has(x.core)) || g.t.every(w => x.t.includes(w)));
    if (g) { g.items.push(x); x.where.forEach(w => g.where.add(w)); if (x.core) g.cores.add(x.core); }
    else groups.push({ t: x.t, items: [x], where: new Set(x.where), cores: new Set(x.core ? [x.core] : []) });
  }
  return groups.map(g => {
    const items = g.items.sort((a, b) => b.volume - a.volume);
    const top = items[0].volume, name = items.filter(i => i.volume >= top * 0.5).sort((a, b) => a.k.length - b.k.length)[0].k;
    return { name, members: items, where: [...g.where] };
  });
}

// Tel de maandreeksen van varianten op; identieke reeksen (Google gaf ze samen) tellen één keer.
export function sumSeries(list) {
  const seen = new Set(), tot = new Map();
  for (const m of list) {
    const s = sortSeries(m); if (!s.length) continue;
    const sig = s.map(x => x.v).join(','); if (seen.has(sig)) continue; seen.add(sig);
    for (const x of s) { const key = x.y * 100 + x.m; tot.set(key, (tot.get(key) || 0) + x.v); }
  }
  return [...tot.entries()].sort((a, b) => a[0] - b[0]).map(([key, v]) => ({ y: Math.floor(key / 100), m: key % 100, v }));
}

// Datafout: één maand ×20 omhoog en daarna maandenlang vlak = Google heeft varianten samengevoegd, geen nieuwe vraag.
export function stepGlitch(series) {
  const s = sortSeries(series).map(x => x.v), n = s.length;
  for (let i = 1; i < n; i++) {
    if (s[i] / Math.max(s[i - 1], 10) > 20) {
      const after = s.slice(i);
      if (after.length >= 6 && Math.max(...after) / Math.max(Math.min(...after), 1) < 2.5) return true;
    }
  }
  return false;
}

export function measure(series) {
  const s = sortSeries(series), n = s.length;
  if (n < 4) return null;
  const L = s[n - 1], last = L.v, prev = s[n - 2].v;
  const ly = n >= 13 ? s[n - 13].v : null;
  const base = median(s.slice(Math.max(0, n - 13), n - 2).map(x => x.v));
  const mom = prev > 0 ? (last - prev) / prev * 100 : last > 0 ? 999 : 0;
  const yoy = ly != null ? (ly > 0 ? (last - ly) / ly * 100 : last > 0 ? 999 : 0) : null;
  let sustained = null;
  if (n >= 15) { const a = s.slice(n - 3).reduce((t, x) => t + x.v, 0), b = s.slice(n - 15, n - 12).reduce((t, x) => t + x.v, 0); sustained = a >= 1.5 * Math.max(b, 1); }
  const label = base < 0.15 * last && (ly == null || ly < 0.15 * last) ? 'new' : ly != null && ly >= 0.6 * last && mom > 30 ? 'seasonal' : 'rising';
  return { period: `${L.y}-${pad(L.m)}`, last, prev, ly, base, mom: Math.round(mom), yoy: yoy == null ? null : Math.round(yoy), addedMonth: last - prev, addedYear: ly != null ? last - ly : null, sustained, label };
}

const SYSTEM = 'You sort measured Google searches for a demand radar used by entrepreneurs and advertisers. Be strict, factual and brief. Reply with JSON only.';
function aiPrompt(cc, rows) {
  return `Country: ${COUNTRIES[cc] ? cc : cc}. For each search topic decide if it is real buying demand that someone could sell or advertise to: a product, product category, service, subscription, trip, course or tool → keep:true. Not demand → keep:false: sports results, news, disasters, a person or celebrity, a TV/film/game title people only look up, going to one website or login, trivia, a misspelled or glitched keyword.
For kept topics write "what": max 10 plain English words on what people want, and "idea": max 14 words, one concrete way to sell or advertise to this demand right now.
Reply exactly as {"r":[{"id":1,"keep":true,"kind":"product|service|seasonal|event|other","what":"...","idea":"..."}]}

${rows.map((r, i) => `${i + 1}. ${r.name}${r.members.length > 1 ? ` (also: ${r.members.slice(1, 4).map(m => m.k).join(', ')})` : ''}${r.where.length ? ` [searched with: ${r.where.join(', ')}]` : ''} — ${r.last} searches in ${r.period}, ${r.mom >= 0 ? '+' : ''}${r.mom}% vs previous month${r.yoy != null ? `, ${r.yoy >= 0 ? '+' : ''}${r.yoy}% vs a year ago` : ''}`).join('\n')}`;
}

async function classify(cc, rows, token) {
  if (!rows.length) return { ok: true, rows };
  const text = await ask({ system: SYSTEM, prompt: aiPrompt(cc, rows), maxTokens: 4000, token, timeoutMs: 80000 });
  const j = parseJSON(text);
  if (!j || !Array.isArray(j.r)) throw new Error('AI gave no list');
  const by = new Map(j.r.map(x => [+x.id, x]));
  return { ok: true, rows: rows.map((r, i) => { const a = by.get(i + 1); return a ? { ...r, keep: a.keep !== false, kind: a.kind || null, what: a.what ? String(a.what).slice(0, 90) : null, idea: a.idea ? String(a.idea).slice(0, 130) : null } : r; }).filter(r => r.keep !== false) };
}

async function country(cc, b, aiToken) {
  const C = COUNTRIES[cc], min = MIN[cc] || 1000;
  // Hardste groei in procenten (nieuwe dingen) én grootste volumes die duidelijk groeien (grote vraag).
  const lists = await Promise.all([
    topSearches(C, b, { order: 'monthly', minVolume: min, limit: 100 }),
    topSearches(C, b, { order: 'yearly', minVolume: min, limit: 100 }),
    topSearches(C, b, { order: 'monthly', by: 'volume', minGrowth: 50, minVolume: min, limit: 100 }),
    topSearches(C, b, { order: 'yearly', by: 'volume', minGrowth: 50, minVolume: min, limit: 100 }),
  ]);
  const pool = new Map();
  for (const x of lists.flat()) if (x.k && !pool.has(x.k) && !noise(x, cc)) pool.set(x.k, x);
  const clusters = cluster([...pool.values()]).map(c => {
    const pre = Math.max(...c.members.map(x => { const s = sortSeries(x.monthly), n = s.length; if (n < 2) return 0; const last = s[n - 1].v; return Math.max(last - s[n - 2].v, x.trend.y > 0 ? last - last / (1 + x.trend.y / 100) : 0); }));
    return { ...c, pre };
  }).sort((a, b2) => b2.pre - a.pre).slice(0, FRESH);

  // Verse Google Ads-data (25 maanden) voor de kandidaten.
  const kws = clusters.flatMap(c => c.members.slice(0, 3).map(x => x.k));
  const ads = await searchVolume(kws, C, b).catch(() => ({}));
  const rows = [];
  for (const c of clusters) {
    const fresh = c.members.slice(0, 3).map(x => ads[cleanKw(x.k)]).filter(a => a && a.monthly && a.monthly.length >= 13);
    const series = fresh.length ? sumSeries(fresh.map(a => a.monthly)) : sumSeries(c.members.map(x => x.monthly));
    const me = measure(series); if (!me || stepGlitch(series)) continue;
    const top = c.members[0], ad = fresh[0];
    if (!fresh.length) { // alleen 12 maanden Labs-data: jaargroei moet ook binnen die 12 maanden zichtbaar zijn
      const s = sortSeries(series).map(x => x.v), n = s.length, a = s.slice(-3).reduce((t, v) => t + v, 0), z = s.slice(0, 3).reduce((t, v) => t + v, 0);
      me.sustained = n >= 9 && a >= 1.5 * Math.max(z, 1);
      if (me.yoy == null && top.trend.y != null) me.yoy = Math.round(top.trend.y);
    }
    rows.push({
      id: `${cc}:${c.name}`, cc, name: c.name, members: c.members.slice(0, 6).map(x => ({ k: x.k })), where: c.where, source: fresh.length ? 'ads' : 'labs', ...me,
      cpc: ad && ad.cpc != null ? ad.cpc : top.cpc, competition: ad && ad.competition != null ? ad.competition : top.competition,
      series: sortSeries(series).slice(-13),
    });
  }
  const month = rows.filter(r => r.mom >= 30 && r.addedMonth >= min).sort((a, b2) => b2.addedMonth - a.addedMonth).slice(0, PER_LIST);
  const year = rows.filter(r => r.label !== 'seasonal' && r.yoy != null && r.yoy >= 50 && r.sustained !== false && (r.addedYear == null ? r.last >= min : r.addedYear >= min))
    .sort((a, b2) => (b2.addedYear ?? b2.last * b2.yoy / (100 + b2.yoy)) - (a.addedYear ?? a.last * a.yoy / (100 + a.yoy))).slice(0, PER_LIST);

  // AI: wat is het, wat kun je ermee, en weg met wat geen koopvraag is.
  const pick = [...new Map([...month, ...year].map(r => [r.id, r])).values()];
  let ai = 'off', aiError = null, kept = null;
  if (aiToken || process.env.ANTHROPIC_API_KEY) {
    try { const r = await classify(cc, pick, aiToken); kept = new Map(r.rows.map(x => [x.id, x])); ai = 'on'; } catch (e) { aiError = `${cc}: ${String(e.message || e).slice(0, 120)}`; }
  }
  const fin = list => (kept ? list.filter(r => kept.has(r.id)).map(r => kept.get(r.id)) : list);
  return { month: fin(month), year: fin(year), ai, aiError };
}

export async function buildRising({ countries = Object.keys(COUNTRIES), aiToken = '' } = {}) {
  const t0 = Date.now();
  if (!dfsReady()) return { generatedAt: new Date().toISOString(), ready: false, items: { month: [], year: [] } };
  const b = budget(+(process.env.DFS_MAX_RISING || 1));
  const out = await Promise.all(countries.map(cc => country(cc, b, aiToken).catch(e => { b.errors.push(`${cc}: ${String(e.message || e).slice(0, 120)}`); return { month: [], year: [], ai: 'off' }; })));
  const month = out.flatMap(o => o.month), year = out.flatMap(o => o.year);
  const periods = [...month, ...year].map(r => r.period).sort();
  return {
    generatedAt: new Date().toISOString(), ms: Date.now() - t0, ready: true, spent: Math.round(b.spent * 100) / 100, errors: b.errors.slice(0, 5),
    period: periods.length ? periods[periods.length - 1] : null, ai: out.every(o => o.ai === 'on') ? 'on' : out.some(o => o.ai === 'on') ? 'partial' : 'off',
    aiErrors: out.map(o => o.aiError).filter(Boolean),
    items: { month, year },
  };
}
