// /api/status — gezondheid: welke bronnen antwoorden, hoeveel data de radar heeft, wat er nog ingesteld moet worden.
// Geen gevoelige gegevens, alleen aantallen en ja/nee.
import { get, wikiFind, trends, news } from '../lib/core.js';
import { suggest, amazonSuggest, reddit, hackernews, googleNews, weather, holidays, appleCharts, geocode, places } from '../lib/sources.js';
import { getRadar } from '../lib/data.js';
import { getStore } from '../lib/store.js';
import { mailReady } from '../lib/mail.js';
import { aiAvailable } from '../lib/ai.js';

const time = async (name, fn) => { const t = Date.now(); try { const v = await fn(); const n = Array.isArray(v) ? v.length : v && typeof v === 'object' ? (v.total ?? v.items?.length ?? Object.keys(v).length) : v ? 1 : 0; return { name, ok: true, n, ms: Date.now() - t }; } catch (e) { return { name, ok: false, error: String(e.message || e).slice(0, 120), ms: Date.now() - t }; } };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=300');
  const gouda = { name: 'Gouda', country: 'NL', lat: 52.01, lon: 4.71 };
  const checks = await Promise.all([
    time('Wikipedia search', () => wikiFind('nl', 'warmtepomp')),
    time('Wikipedia pageviews', () => get('https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Air_fryer/daily/2026090100/2026091000').then(j => j.items)),
    time('Google trending NL', () => trends('NL')),
    time('GDELT news', () => news('heat pump', 'english')),
    time('Google News', () => googleNews('warmtepomp', 'NL')),
    time('Google suggestions', () => suggest('warmtepomp', 'NL')),
    time('YouTube suggestions', () => suggest('air fryer', 'US', 'yt')),
    time('Amazon suggestions US', () => amazonSuggest('air fryer', 'US')),
    time('Amazon suggestions DE', () => amazonSuggest('heizdecke', 'DE')),
    time('Amazon suggestions NL', () => amazonSuggest('airfryer', 'NL')),
    time('Reddit', () => reddit('air fryer')),
    time('Hacker News', () => hackernews('ai agent')),
    time('Weather', () => weather(['NL', 'Amsterdam', 52.37, 4.9]).then(w => w.days)),
    time('City lookup', () => geocode('Gouda', 'NL')),
    time('OpenStreetMap places', () => places('bakkerij', gouda)),
    time('Public holidays', () => holidays()),
    time('Apple charts', () => appleCharts()),
  ]);
  let radar = null;
  try { const r = await getRadar(req); radar = { generatedAt: r.generatedAt, buildMs: r.ms, watch: r.watch.length, rising: r.rising.length, productSpikes: r.spikes.products.length, search: r.spikes.search.map(g => `${g.geo}:${g.items.length}`), attention: r.spikes.attention.map(g => `${g.lang}:${g.items.length}`), calendar: r.upcoming.calendar.length, seasonal: r.upcoming.seasonal.length, weather: (r.upcoming.weather || []).length, charts: (r.charts || []).length }; } catch (e) { radar = { error: String(e.message || e) }; }
  // Opslag echt testen: schrijven en teruglezen.
  let storageTest = null;
  const st = getStore();
  if (st) { try { const v = new Date().toISOString(); await st.put('health/status.json', JSON.stringify({ v }), 'application/json'); const back = await st.get('health/status.json'); storageTest = back && back.includes(v) ? 'ok' : 'read mismatch'; } catch (e) { storageTest = String(e.message || e).slice(0, 160); } }
  let dataBudget = null;
  try { const { spentToday, dailyCap, lastBalance } = await import('../lib/dfs.js'); const sp = await spentToday(); dataBudget = { spentTodayUTC: Math.round(sp * 100) / 100, dailyCap: dailyCap(), balance: lastBalance() != null ? Math.round(lastBalance() * 100) / 100 : null }; } catch {}
  res.status(200).json({ dataBudget, storageTest, app: 'demand-radar', at: new Date().toISOString(), sourcesOk: `${checks.filter(c => c.ok).length}/${checks.length}`, sources: checks, radar, setup: { storage: !!getStore(), mail: mailReady(), youtube: !!process.env.YOUTUBE_API_KEY, bing: !!process.env.BING_WEBMASTER_KEY, ai: aiAvailable(req), storageVars: Object.keys(process.env).filter(n => /BLOB|READ_WRITE_TOKEN/.test(n)) } });
}
