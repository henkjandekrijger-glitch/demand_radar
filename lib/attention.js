// Aandacht buiten Google: Wikipedia-paginaweergaven en nieuwsvolume (GDELT), per zoekterm en per maand.
// Gratis, zonder sleutel. Gebruikt als kenmerk in het voorspelmodel (zie lib/ml.js) en als signaal op de pagina.
import { get } from './core.js';

const LANG = { NL: 'nl', DE: 'de', US: 'en' };
const GD = { NL: ['NL', 'dutch'], DE: ['GM', 'german'], US: ['US', 'english'] }; // GDELT: FIPS-landcode + taal
const ymOf = s => [+s.slice(0, 4), +s.slice(4, 6)];
const words = s => String(s).toLowerCase().replace(/\([^)]*\)/g, ' ').normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length >= 2);
const near = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));

// Het Wikipedia-artikel dat bij een zoekterm hoort: alle woorden uit de titel (zonder haakjes) moeten in de zoekterm staan.
export async function wikiArticle(q, cc) {
  const lang = LANG[cc]; if (!lang) return null;
  const j = await get(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=3&srprop=&format=json`, { timeout: 8000 });
  const Q = words(q);
  for (const r of (j.query && j.query.search) || []) {
    const T = words(r.title);
    if (T.length && T.every(t => Q.some(x => near(t, x)))) return r.title;
  }
  return null;
}

// Maandelijkse weergaven (alleen mensen, alle apparaten) van een artikel. from/to: 'YYYYMM'.
export async function wikiMonthly(title, cc, from = '202209', to = null) {
  const lang = LANG[cc]; if (!lang || !title) return [];
  const end = to || new Date().toISOString().slice(0, 7).replace('-', '');
  const t = encodeURIComponent(title.replace(/ /g, '_'));
  const j = await get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/all-access/user/${t}/monthly/${from}0100/${end}2800`, { timeout: 8000 });
  return (j.items || []).map(x => [...ymOf(x.timestamp), x.views]);
}

// Dagelijkse weergaven van de laatste dagen (voor "nu": hoe staat de huidige maand ervoor).
export async function wikiDaily(title, cc, days = 60) {
  const lang = LANG[cc]; if (!lang || !title) return [];
  const d = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
  const t = encodeURIComponent(title.replace(/ /g, '_'));
  const j = await get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/all-access/user/${t}/daily/${d(days)}00/${d(1)}00`, { timeout: 8000 });
  return (j.items || []).map(x => [x.timestamp.slice(0, 8), x.views]);
}

// Nieuwsvolume per maand (GDELT DOC 2.0, terug tot 2017): aandeel artikelen uit het land/de taal dat de zoekterm noemt.
// GDELT weigert Vercel; via de eigen nieuwsophaler op Railway (worker/news) als GDELT_PROXY gezet is.
export const gdeltBase = () => (process.env.GDELT_PROXY ? `${process.env.GDELT_PROXY.replace(/\/$/, '')}/gdelt?` : 'https://api.gdeltproject.org/api/v2/doc/doc?');
export async function gdeltMonthly(q, cc, from = '20220901000000') {
  const [fips, lang] = GD[cc] || []; if (!fips) return [];
  const term = /\s/.test(q.trim()) ? `"${q.trim()}"` : q.trim();
  const url = `${gdeltBase()}query=${encodeURIComponent(`${term} sourcecountry:${fips} sourcelang:${lang}`)}&mode=timelinevolraw&format=json&startdatetime=${from}`;
  const j = await get(url, { timeout: 20000 });
  const by = new Map();
  for (const s of j.timeline || []) for (const p of s.data || []) {
    const k = p.date.slice(0, 6), o = by.get(k) || [0, 0]; o[0] += p.value || 0; o[1] += p.norm || 0; by.set(k, o);
  }
  // per miljoen artikelen (zo telt een groter of kleiner GDELT niet mee)
  return [...by.entries()].sort().map(([k, [v, n]]) => [...ymOf(k), n ? Math.round((v / n) * 1e6) : 0]);
}
