// Search Console van alle eigen sites als gratis Google-bron (14 nov 2026, Henkjan: "voer door"). hjdk-api leest Search Console
// (Workload Identity, geen sleutel) en geeft via /api/gsc?op=radar de zoekvragen per land: vertoningen nu (14 dagen) en de 14 dagen
// ervoor. Alleen dit Vercel-project mag dat lezen: het stuurt zijn eigen ondertekende Vercel OIDC-token mee (geen gedeeld geheim).
// Eén keer per dag vanuit /api/loop. Opslag gsc/latest.json. Zoekvragen waarvan de vertoningen duidelijk stijgen gaan als tip van
// bron "gsc" in het voorspellingsboek (lib/ledger.js), zodat getoetst wordt of ze vaker doorbreken dan toeval.
import { getJSON, putJSON } from './store.js';

const URL0 = () => process.env.GSC_FEED_URL || 'https://hjdk-api-henq.vercel.app/api/gsc?op=radar';
const CC = { nld: 'NL', bel: 'NL', deu: 'DE', aut: 'DE', usa: 'US' }; // BE en AT lopen mee met de taal van NL en DE
const P = 'gsc/latest.json';

export function risers(data, { min = 30, x = 1.5 } = {}) {
  const out = [];
  for (const s of (data && data.sites) || []) for (const r of s.rows || []) {
    const [q, c, imp, imp0] = r, cc = CC[String(c).toLowerCase()];
    if (!cc || !q || imp < min || imp < x * Math.max(imp0, 10)) continue;
    out.push({ cc, k: String(q).toLowerCase().slice(0, 80), imp, imp0, site: s.prop });
  }
  return out.sort((a, b) => b.imp - a.imp);
}

export async function gscDaily(store, oidc, now = new Date()) {
  if (!store) return { gsc: 'no store' };
  const day = now.toISOString().slice(0, 10), cur = await getJSON(store, P, null).catch(() => null);
  if (cur && cur.day === day) return { gsc: 'up to date' };
  if (!oidc) return { gsc: 'geen Vercel OIDC-token' };
  const r = await fetch(URL0(), { headers: { authorization: `Bearer ${oidc}` }, signal: AbortSignal.timeout(90000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) { await putJSON(store, P, { ...(cur || {}), day, error: `hjdk-api ${r.status}: ${String(j.fout || '').slice(0, 100)}` }).catch(() => {}); return { gsc: 'fout', status: r.status }; }
  const up = risers(j), sites = (j.sites || []).map(s => ({ prop: s.prop, rows: (s.rows || []).length, fout: s.fout || null }));
  await putJSON(store, P, { day, at: now.toISOString(), sites, rows: j.sites, risers: up.slice(0, 200) });
  let ledger = null;
  if (up.length) { const { recordPredictions } = await import('./ledger.js'); const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    ledger = await recordPredictions(store, up.slice(0, 150).map(t => ({ kind: 'src', src: 'gsc', cc: t.cc, k: t.k, base })), day).catch(() => null); }
  return { gsc: 'ok', sites: sites.length, risers: up.length, ledger };
}
export async function gscState(store) { return (store && (await getJSON(store, P, null).catch(() => null))) || null; }
