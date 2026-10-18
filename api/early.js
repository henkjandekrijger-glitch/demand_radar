// GET /api/early — vroege signalen: nog niet doorgebroken, maar het patroon lijkt op zoektermen die daarna wél doorbraken.
// ?cc=NL&tier=hidden|starting&limit=20. Eigenaar: POST ?op=seed&cc=NL { series: { zoekterm: { m: [[j,m,v]], cpc } } }, ?op=score, ?op=refresh.
import { getStore } from '../lib/store.js';
import { isPro } from '../lib/access.js';
import { latestEarly, seedEarly, scoreEarly, refreshEarly } from '../lib/earlydata.js';

export default async function handler(req, res) {
  const store = getStore();
  if (!store) return res.status(503).json({ error: 'no storage' });
  const op = String(req.query.op || '');
  try {
    if (op) {
      if (!isPro(req)) return res.status(403).json({ error: 'forbidden' });
      if (op === 'seed') {
        let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
        const cc = String(req.query.cc || '').toUpperCase();
        return res.status(200).json(await seedEarly(store, cc, body && body.series));
      }
      if (op === 'score') return res.status(200).json(await scoreEarly(store));
      if (op === 'shelf') { // AI-schap testen (eigenaar): ?op=shelf&q=...&cc=NL
        const { aiShelf } = await import('../lib/aishelf.js');
        return res.status(200).json(await aiShelf(String(req.query.q || 'airfryer'), String(req.query.cc || 'NL').toUpperCase(), null, { req }));
      }
      if (op === 'models') { // AI Gateway: beschikbare modellen (eigenaar)
        const { gatewayToken } = await import('../lib/ai.js');
        const r = await fetch('https://ai-gateway.vercel.sh/v1/models', { headers: { authorization: `Bearer ${gatewayToken(req)}` }, signal: AbortSignal.timeout(15000) });
        const j = await r.json().catch(() => ({}));
        const ids = (j.data || []).map(m => m.id).filter(id => /^(openai|google|perplexity|xai|anthropic|mistral|meta)\//.test(id));
        return res.status(200).json({ status: r.status, n: ids.length, ids });
      }
      if (op === 'drivers') { // nieuwe oorzaak-bronnen testen (eigenaar): ?op=drivers&cc=NL
        const D = await import('../lib/drivers.js'), cc = String(req.query.cc || 'NL').toUpperCase(), out = {};
        for (const [k, f] of Object.entries({ power: D.powerMonthly, fuel: D.fuelMonthly, retail: D.retailMonthly, now: D.energyNow })) {
          try { const v = await f(cc); out[k] = k === 'now' ? v : Object.fromEntries(Object.entries(v || {}).map(([n, o]) => [n, Object.entries(o || {}).sort().slice(req.query.all ? 0 : -4)])); } catch (e) { out[k] = { error: String(e.message || e).slice(0, 160) }; }
        }
        return res.status(200).json(out);
      }
      if (op === 'amazon') { // Amazon-zoekvolume testen (eigenaar): ?op=amazon&q=a,b,c&cc=NL (± $0,01)
        const { amazonVolume, budget } = await import('../lib/dfs.js'), { COUNTRIES } = await import('../lib/niches.js');
        const cc = String(req.query.cc || 'NL').toUpperCase(), b = budget(0.05);
        const v = await amazonVolume(String(req.query.q || 'airfryer').split(',').map(x => x.trim()).filter(Boolean), COUNTRIES[cc], b);
        return res.status(200).json({ cc, spent: b.spent, errors: b.errors, volumes: v });
      }
      if (op === 'amzsales') { // Amazon gekocht vorige maand (eigenaar): stand, of &cc=NL&month=2026-10 voor de cijfers
        const { getJSON } = await import('../lib/store.js'), { salesFor } = await import('../lib/amazonsales.js');
        if (req.query.cc) return res.status(200).json(await salesFor(store, String(req.query.cc).toUpperCase(), String(req.query.month || new Date().toISOString().slice(0, 7))));
        const st = (await getJSON(store, 'amzsales/state.json', null).catch(() => null)) || {};
        return res.status(200).json({ ...st, open: Object.keys(st.open || {}).length });
      }
      if (op === 'launches') { // lanceerkalender (eigenaar): ?op=launches → Wikidata-lijst (gratis); &cc=NL&ai=1 → wat de radar ervan houdt (één AI-vraag)
        const L = await import('../lib/launches.js'), today = new Date().toISOString().slice(0, 10);
        if (req.query.ai) { const { gatewayToken } = await import('../lib/ai.js'); return res.status(200).json(await L.launchMoments(String(req.query.cc || 'NL').toUpperCase(), { token: gatewayToken(req), store, today, force: true })); }
        return res.status(200).json((await L.wikidataLaunches(today)).slice(0, 40));
      }
      if (op === 'regulation') { // beleidskalender (eigenaar): ?op=regulation&cc=US → opnieuw opbouwen (één AI-vraag)
        const { regulationMoments } = await import('../lib/regulation.js'), { getJSON, putJSON } = await import('../lib/store.js'), { gatewayToken } = await import('../lib/ai.js'), cc = String(req.query.cc || 'US').toUpperCase();
        await putJSON(store, `regulation/${cc}.json`, { day: '2000-01-01', items: [] }).catch(() => {});
        return res.status(200).json(await regulationMoments(cc, { token: gatewayToken(req), store, today: new Date().toISOString().slice(0, 10) }));
      }
      if (op === 'keepa') { // Keepa (eigenaar): stand en tokens; &q=term&cc=DE test één zoekterm (10 tokens); POST {queue:{cc:[...]}} zet termen klaar; &run=1 verzamelt nu; &data=DE geeft de reeksen
        const K = await import('../lib/keepa.js');
        if (!K.keepaReady()) return res.status(200).json({ ready: false, todo: 'KEEPA_KEY in Vercel' });
        if (req.method === 'POST') { let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } } return res.status(200).json(await K.keepaQueue(store, (b && b.queue) || {})); }
        if (req.query.data) return res.status(200).json(await K.keepaData(store, String(req.query.data).toUpperCase()));
        if (req.query.q) return res.status(200).json(await K.keepaTerm(String(req.query.cc || 'DE').toUpperCase(), String(req.query.q)));
        if (req.query.run) return res.status(200).json(await K.keepaCollect(store, { max: Math.min(60, +(req.query.max || 20)) }));
        return res.status(200).json({ ready: true, tokens: await K.keepaTokens().catch(e => ({ error: String(e.message || e) })), ...(await K.keepaState(store)) });
      }
      if (op === 'meta') { // Meta Ad Library testen (eigenaar): ?op=meta&q=...&cc=NL
        const { metaAds, metaReady } = await import('../lib/meta.js');
        if (!metaReady()) return res.status(200).json({ ready: false, how: 'META_AD_TOKEN in Vercel (user token van een account met bevestigde identiteit)' });
        try { return res.status(200).json({ ready: true, ...(await metaAds(String(req.query.q || 'thuisbatterij'), String(req.query.cc || 'NL').toUpperCase())) }); }
        catch (e) { return res.status(200).json({ ready: true, error: String(e.message || e) }); }
      }
      if (op === 'ai') { // AI-zoekvolume testen (eigenaar): ?op=ai&q=a,b&cc=NL (± $0,01–0,10)
        const { aiVolume, budget } = await import('../lib/dfs.js'), { COUNTRIES } = await import('../lib/niches.js');
        const cc = String(req.query.cc || 'NL').toUpperCase(), b = budget(0.12);
        const v = await aiVolume(String(req.query.q || 'airfryer').split(',').map(x => x.trim()).filter(Boolean), COUNTRIES[cc], b);
        return res.status(200).json({ cc, spent: b.spent, errors: b.errors, volumes: v });
      }
      if (op === 'bing') { // Bing-koppeling testen (eigenaar): ?op=bing&q=...&cc=NL
        const { bingWeekly, bingTrend, bingReady } = await import('../lib/bing.js');
        try { const w = await bingWeekly(String(req.query.q || 'thuisbatterij'), String(req.query.cc || 'NL').toUpperCase()); return res.status(200).json({ ready: bingReady(), trend: bingTrend(w), weeks: w }); }
        catch (e) { return res.status(200).json({ ready: bingReady(), error: String(e.message || e).slice(0, 200) }); }
      }
      if (op === 'yt') { // YouTube-koppeling testen (eigenaar): ?op=yt&q=...&cc=NL
        const { ytActivity, ytReady } = await import('../lib/youtube.js');
        try { return res.status(200).json({ ready: ytReady(), v: await ytActivity(String(req.query.q || 'thuisbatterij'), String(req.query.cc || 'NL').toUpperCase(), store) }); }
        catch (e) { return res.status(200).json({ ready: ytReady(), error: String(e.message || e).slice(0, 300) }); }
      }
      if (op === 'wild') { // wildcards (eigenaar): ?op=wild&id=p3&status=hit|partly|miss|open&note=… ; ?op=wild&check=1 kijkt nu na (gratis)
        const { setVerdict, checkWild } = await import('../lib/wildcards.js');
        if (req.query.check) return res.status(200).json(await checkWild(store));
        return res.status(200).json(await setVerdict(store, String(req.query.id || ''), String(req.query.status || ''), req.query.note));
      }
      if (op === 'refresh') return res.status(200).json(await refreshEarly(store, { max: Math.min(3, +(req.query.max || 1.5)) }));
      return res.status(400).json({ error: 'unknown op' });
    }
    if (req.query.wild) { const { wildList } = await import('../lib/wildcards.js'); res.setHeader('Cache-Control', 'public, max-age=600'); return res.status(200).json(await wildList(store)); }
    const L = await latestEarly(store);
    if (!L) return res.status(200).json({ ready: false, items: [] });
    const cc = String(req.query.cc || '').toUpperCase(), tier = String(req.query.tier || ''), n = Math.max(1, Math.min(200, +req.query.limit || 50));
    const items = L.items.filter(x => (!cc || cc === 'ALL' || x.cc === cc) && (!tier || x.tier === tier)).slice(0, n);
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.status(200).json({ ready: true, month: L.month, made: L.made, model: L.model, items });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
}
