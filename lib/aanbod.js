// Aanbod vóór vraag (21 nov 2026, plan stap 4; Henkjan: "Ja doe alle 4" en "geen skin in game is vaak geen goede voorspeller"):
// wie geld zet, zit vóór de zoekvraag. Eerste bron: nieuw geregistreerde domeinen. WhoisDS zet elke dag gratis een lijst
// (± 70.000 namen, hergebruik ook commercieel toegestaan) online. Per dag tellen we per zoekterm van de kijklijsten (NL, DE, US)
// hoeveel nieuwe domeinen de term bevatten (zonder spaties, ≥ 5 tekens). Per maand opgeteld in aanbod/domeinen.json; de
// voorspelfabriek (lib/fabriek.js, voorspeller 'nieuwe domeinen') gebruikt een maand pas als hij vol is (≥ 25 dagen).
// Gratis, één keer per dag vanuit /api/loop.
import zlib from 'node:zlib';
import { getJSON, putJSON } from './store.js';

export const AANBOD = 'aanbod/domeinen.json';
const URL_NRD = d => `https://www.whoisds.com//whois-database/newly-registered-domains/${Buffer.from(`${d}.zip`).toString('base64')}/nrd`;
export const compact = k => String(k || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
const MIN = 5, MAX = 30;

// Zip met één tekstbestand uitpakken (centrale map achteraan lezen; deflate of opgeslagen).
export function unzipFirst(buf) {
  let e = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('geen zip');
  const cd = buf.readUInt32LE(e + 16); if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error('zip: centrale map');
  const method = buf.readUInt16LE(cd + 10), size = buf.readUInt32LE(cd + 20), lho = buf.readUInt32LE(cd + 42);
  if (buf.readUInt32LE(lho) !== 0x04034b50) throw new Error('zip: kop');
  const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28), data = buf.subarray(start, start + size);
  return (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
}

// Tellen: per domein (zonder extensie en streepjes) elk stuk van 5-30 tekens opzoeken in de termenlijst.
export function telDomeinen(domains, index) {
  const tel = new Map();
  for (const d of domains) {
    const lab = compact(String(d).split('.')[0]); if (lab.length < MIN) continue;
    const seen = new Set();
    for (let i = 0; i + MIN <= lab.length; i++) for (let l = MIN; l <= Math.min(MAX, lab.length - i); l++) { const c = lab.substr(i, l); if (index.has(c) && !seen.has(c)) { seen.add(c); tel.set(c, (tel.get(c) || 0) + 1); } }
  }
  return tel;
}

async function termIndex(store) {
  const idx = new Map(); // compact → [termen]
  for (const cc of ['NL', 'DE', 'US']) {
    const s = await getJSON(store, `early/series-${cc}.json`, null).catch(() => null);
    for (const k of Object.keys((s && s.kw) || {})) { const c = compact(k); if (c.length < MIN || c.length > MAX || /^\d+$/.test(c)) continue; const l = idx.get(c) || idx.set(c, []).get(c); if (!l.includes(k)) l.push(k); }
  }
  return idx;
}

// Dagelijks: de nieuwste dagbestanden (gisteren en eergisteren) die nog niet geteld zijn.
export async function aanbodDag(store, now = new Date()) {
  const st = (await getJSON(store, AANBOD, null).catch(() => null)) || { maand: {}, dagen: [] };
  const today = now.toISOString().slice(0, 10);
  if (st.check === today) return { aanbod: 'up to date' };
  const want = [1, 2].map(n => new Date(now.getTime() - n * 864e5).toISOString().slice(0, 10)).filter(d => !(st.dagen || []).includes(d));
  if (!want.length) { st.check = today; await putJSON(store, AANBOD, st); return { aanbod: 'up to date' }; }
  const idx = await termIndex(store); if (!idx.size) return { aanbod: 'geen kijklijst' };
  const done = [], errors = [];
  for (const d of want) {
    try {
      const r = await fetch(URL_NRD(d), { headers: { 'user-agent': 'Mozilla/5.0 (compatible; DemandRadar/1.0)' }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) { errors.push(`${d}: ${r.status}`); continue; }
      const txt = unzipFirst(Buffer.from(await r.arrayBuffer()));
      const doms = txt.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      if (doms.length < 1000) { errors.push(`${d}: ${doms.length} namen`); continue; }
      const tel = telDomeinen(doms, idx), m = d.slice(0, 7), M = (st.maand[m] = st.maand[m] || { dagen: [], tel: {}, namen: 0 });
      for (const [c, n] of tel) for (const k of idx.get(c)) M.tel[k] = (M.tel[k] || 0) + n;
      M.dagen.push(d); M.namen += doms.length; st.dagen = [...(st.dagen || []), d].slice(-120); done.push({ d, namen: doms.length, termen: tel.size });
    } catch (e) { errors.push(`${d}: ${String(e.message || e).slice(0, 60)}`); }
  }
  // hooguit 18 maanden bewaren
  for (const m of Object.keys(st.maand).sort().slice(0, -18)) delete st.maand[m];
  if (done.length || !errors.length) st.check = today;
  st.at = now.toISOString(); st.fouten = errors.slice(0, 3);
  await putJSON(store, AANBOD, st);
  return { aanbod: done, errors };
}

// Stand voor de overdracht: dagen, namen en de termen met de meeste nieuwe domeinen deze maand.
export function aanbodView(st) {
  if (!st || !st.maand) return null;
  const ms = Object.keys(st.maand).sort(), m = ms[ms.length - 1], M = m && st.maand[m];
  return M ? { maand: m, dagen: M.dagen.length, namen: M.namen, top: Object.entries(M.tel).sort((a, b) => b[1] - a[1]).slice(0, 15), maanden: ms.length, fouten: st.fouten || [] } : null;
}
