// /api/gaps — "AI gaps": wat een AI-assistent antwoordt op de koopvraag achter de grootste onderwerpen (lib/aigaps.js).
// GET: de vragen die vandaag nog gesteld moeten worden, met instructie en formaat (openbaar, alleen radargegevens).
// GET ?latest=1: de laatste uitkomst. POST (eigenaar, ?key=…): antwoorden meteen toepassen.
// Eigenaar ?repo=1: gaps/<dag>.json van tak `fill` nu ophalen. Eigenaar ?others=1: gaten aan andere AI's voorleggen (AI_GAPS_GATEWAY=on).
import { getStore } from '../lib/store.js';
import { isPro } from '../lib/access.js';
import { pendingGaps, applyGaps, gapsFromRepo, latestGaps, presentGaps, askOthers, askQuestion, probeSources } from '../lib/aigaps.js';

export default async function handler(req, res) {
  const store = getStore(); if (!store) return res.status(503).json({ error: 'no storage' });
  try {
    if (req.method === 'POST') {
      if (!isPro(req)) return res.status(403).json({ error: 'forbidden' });
      let f = req.body; if (typeof f === 'string') { try { f = JSON.parse(f); } catch { return res.status(400).json({ error: 'bad json' }); } }
      return res.status(200).json(await applyGaps(store, f));
    }
    res.setHeader('Cache-Control', 'no-store');
    if (req.query.repo && isPro(req)) { const { demandDay } = await import('../lib/data.js'); return res.status(200).json(await gapsFromRepo(store, String(req.query.day || demandDay()))); }
    // Eigenaar ?others=1: een paar gaten nu aan de andere AI's voorleggen (kost gatewaygeld; dagrem in lib/aigaps.js, nooit in een lus)
    if (req.query.others && isPro(req)) return res.status(200).json(await askOthers(store, { req, max: Math.max(1, Math.min(6, +req.query.max || 5)) }));
    // Eigenaar ?ask=<koopvraag>&site=<host>: één vraag aan de andere AI's, hooguit eens per 7 dagen per vraag (kost gatewaygeld, telt in de dagrem)
    if (req.query.ask && isPro(req)) return res.status(200).json(await askQuestion(store, String(req.query.ask), { req, site: String(req.query.site || ''), force: req.query.force === '1' }));
    // Eigenaar ?probe=chat|responses|sdk: één vraag aan Perplexity, alleen de vorm van het antwoord en de gevonden bronnen terug (telt als 1 vraag)
    if (req.query.probe && isPro(req)) return res.status(200).json(await probeSources(store, { req, api: String(req.query.probe) }));
    if (req.query.latest) { const L = await latestGaps(store); return res.status(200).json(L ? { day: L.day, at: L.at, model: L.model, counts: L.counts, items: presentGaps(L).map(g => (isPro(req) || !g.others ? g : { ...g, others: (({ cited, ...o }) => o)(g.others) })) } : { items: [] }); }
    res.status(200).json(await pendingGaps(store, { per: Math.max(5, Math.min(40, +req.query.per || 30)) }));
  } catch (e) { res.status(500).json({ error: String(e.message || e).slice(0, 200) }); }
}
