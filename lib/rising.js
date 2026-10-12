// "Wat er naar boven komt": gemeten Google-zoekopdrachten per land die het hardst groeien (DataForSEO).
// Per land twee lijsten: grootste sprong deze maand, en het hardst gegroeid in een jaar.
import { dfsReady, budget, topSearches } from './dfs.js';
import { COUNTRIES } from './niches.js';

const ADULT = /porn|sex|xxx|nude|escort|onlyfans|casino|gokken|wetten|betting/i;
const MIN = { NL: 300, DE: 1000, US: 3000 };

export function label(t) {
  if (t.y != null && t.y >= 50) return 'new';           // structureel hoger dan een jaar geleden
  if (t.m != null && t.m >= 50 && (t.y == null || t.y < 20)) return 'seasonal'; // komt elk jaar rond deze tijd terug
  return 'rising';
}

function clean(list, cc) {
  const seen = new Set();
  return list.filter(x => x.k && !ADULT.test(x.k) && !/^\d+$/.test(x.k)).filter(x => { const key = x.core || x.k; if (seen.has(key)) return false; seen.add(key); return true; })
    .map(x => {
      const prev = x.trend.m != null ? x.volume / (1 + x.trend.m / 100) : x.volume;
      const months = [...x.monthly].sort((a, b) => a.y - b.y || a.m - b.m).slice(-12);
      return { ...x, cc, added: Math.max(0, Math.round(x.volume - prev)), label: label(x.trend), monthly: months };
    });
}

export async function buildRising({ countries = Object.keys(COUNTRIES) } = {}) {
  const t0 = Date.now();
  if (!dfsReady()) return { generatedAt: new Date().toISOString(), ready: false, items: { month: [], year: [] } };
  const b = budget(+(process.env.DFS_MAX_RISING || 1));
  const month = [], year = [];
  await Promise.all(countries.map(async cc => {
    const C = COUNTRIES[cc];
    const [m, y] = await Promise.all([
      topSearches(C, b, { order: 'monthly', minVolume: MIN[cc] || 1000, limit: 100 }),
      topSearches(C, b, { order: 'yearly', minVolume: MIN[cc] || 1000, limit: 100 }),
    ]);
    month.push(...clean(m, cc).filter(x => (x.trend.m || 0) > 0).sort((a, b2) => b2.added - a.added).slice(0, 40));
    year.push(...clean(y, cc).filter(x => (x.trend.y || 0) > 0).sort((a, b2) => (b2.trend.y || 0) - (a.trend.y || 0)).slice(0, 40));
  }));
  return { generatedAt: new Date().toISOString(), ms: Date.now() - t0, ready: true, spent: Math.round(b.spent * 100) / 100, errors: b.errors.slice(0, 5), items: { month, year } };
}
