// Regels die vraag verschuiven (zoals het einde van de salderingsregeling): wekelijks gezocht in het nieuws,
// door AI omgezet naar datum + wat mensen dan meer of minder gaan kopen. Alleen met een bronkop erbij.
import { get } from './core.js';
import { getJSON, putJSON } from './store.js';
import { ask, parseJSON } from './ai.js';

const GN = { NL: 'hl=nl&gl=NL&ceid=NL:nl', DE: 'hl=de&gl=DE&ceid=DE:de', US: 'hl=en-US&gl=US&ceid=US:en' };
const QUERIES = {
  NL: y => [`wat verandert er per 1 januari ${y}`, `nieuwe regels ${y}`, `verplicht vanaf ${y}`, `subsidie stopt ${y}`, `verbod vanaf ${y}`, `belasting omhoog ${y}`],
  DE: y => [`was ändert sich ${y}`, `ab 1. januar ${y} pflicht`, `neue gesetze ${y}`, `förderung endet ${y}`, `verbot ab ${y}`, `steuer steigt ${y}`],
  US: y => [`new laws take effect january 1 ${y}`, `tax credit expires ${y}`, `ban takes effect ${y}`, `new rules ${y} consumers`, `rebate ends ${y}`, `tariffs ${y} prices`],
};
const ent = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

async function headlines(cc, today) {
  const y = +today.slice(0, 4), qs = [...QUERIES[cc](y + 1), ...QUERIES[cc](y).slice(0, 3)];
  const seen = new Set(), out = [];
  for (const q of qs) {
    const xml = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${GN[cc]}`, { text: true, timeout: 10000 }).catch(() => '');
    for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const b = m[1], t = ent((b.match(/<title>([\s\S]*?)<\/title>/) || [])[1]), src = b.match(/<source url="([^"]+)">([\s\S]*?)<\/source>/);
      const pub = Date.parse((b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '');
      if (!t || seen.has(t) || (pub && Date.now() - pub > 200 * 864e5)) continue;
      seen.add(t); out.push({ t: t.replace(/ - [^-]+$/, ''), source: src ? ent(src[2]) : '', site: src ? src[1] : null });
    }
  }
  return out.slice(0, 80);
}

export async function regulationMoments(cc, { token, store, today }) {
  if (!GN[cc]) return [];
  const path = `regulation/${cc}.json`;
  const c = store && await getJSON(store, path, null).catch(() => null);
  if (c && Date.parse(today) - Date.parse(c.day) < 7 * 864e5) return c.items;
  if (!token) return c ? c.items : [];
  const H = await headlines(cc, today);
  if (!H.length) return c ? c.items : [];
  const prompt = `Country: ${cc}. Today: ${today}. Below are recent news headlines about new rules, laws, taxes, subsidies and bans.
List only concrete changes with a known start date between today and 15 months from now that will make people buy, book or arrange something more (or less) before or after that date. Ignore politics without a fixed date, rumours and changes that do not affect what consumers or small businesses buy.
For each change: "name" (max 8 plain English words), "date" (YYYY-MM-DD, the day it takes effect), "direction" ("more" or "less" demand), "ideas" (2-4 products or services people will want, plain English), "ids" (numbers of the headlines that state it; at least one).
JSON only: {"r":[{"name":"...","date":"2027-01-01","direction":"more","ideas":["..."],"ids":[1]}]}

${H.map((h, i) => `${i + 1}. ${h.t} (${h.source})`).join('\n')}`;
  let items = [];
  try {
    const j = parseJSON(await ask({ system: 'You extract dated rule changes from headlines for a demand radar. Be strict: only what the headlines state. JSON only.', prompt, maxTokens: 2500, token, timeoutMs: 60000 }));
    const lim = Date.parse(today) + 460 * 864e5;
    items = ((j && j.r) || []).filter(x => x && x.name && /^\d{4}-\d\d-\d\d$/.test(x.date || '') && Date.parse(x.date) > Date.parse(today) && Date.parse(x.date) < lim && Array.isArray(x.ids) && x.ids.some(i => H[+i - 1]))
      .slice(0, 12).map(x => ({ id: `reg-${x.date}-${String(x.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`, kind: 'regulation', name: String(x.name).slice(0, 80), date: x.date, lead: 120, markets: [cc], direction: x.direction === 'less' ? 'less' : 'more', ideas: (x.ideas || []).map(String).slice(0, 4), sources: x.ids.map(i => H[+i - 1]).filter(Boolean).slice(0, 2).map(h => ({ title: h.t, source: h.source, site: h.site })) }));
  } catch { return c ? c.items : []; }
  if (store) await putJSON(store, path, { day: today, items }).catch(() => {});
  return items;
}
