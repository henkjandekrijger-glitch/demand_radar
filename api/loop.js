// Elk uur (Vercel Cron): gebeurtenissen optellen en de kansen van de varianten opnieuw verdelen.
import { getStore } from '../lib/store.js';
import { runLoop } from '../lib/learn.js';
import { aggregate } from '../lib/signals.js';
import { bolSnapshot } from '../lib/bolpop.js';
import { autoEarly } from '../lib/earlydata.js';
import { dailyWild } from '../lib/wildcards.js';
import { amazonSales } from '../lib/amazonsales.js';
import { feedTitles } from '../lib/feedopt.js';
import { gatewayToken } from '../lib/ai.js';

export default async function handler(req, res) {
  const store = getStore();
  if (!store) return res.status(200).json({ ok: false, reason: 'no storage yet (connect a Blob store in Vercel)' });
  try { const sig = await aggregate(store).catch(e => ({ error: String(e.message || e) })); const bol = await bolSnapshot(store).catch(e => ({ error: String(e.message || e).slice(0, 120) })); // gratis, één keer per dag
    const early = await autoEarly(store).catch(e => ({ error: String(e.message || e).slice(0, 120) })); // vroege signalen: dagelijks doorrekenen, nieuwe termen ophalen, maandelijks vers
    const wild = await dailyWild(store).catch(e => ({ error: String(e.message || e).slice(0, 120) })); // wildcards nakijken (gratis)
    const amzSales = await amazonSales(store).catch(e => ({ error: String(e.message || e).slice(0, 120) })); // Amazon gekocht vorige maand (maandelijks)
    const heavy = early && (early.refresh || early.pending || early.grow); // zwaar uur: titels het volgende uur
    const feedOpt = heavy ? { wait: 'busy hour' } : await feedTitles(store, 'yoors', 'NL', { token: gatewayToken(req) }).catch(e => ({ error: String(e.message || e).slice(0, 120) })); // Yoors-titels met radar-zoektermen (tot alles klaar is)
    const { shopPrices } = await import('../lib/prices.js'); // marktprijzen per Yoors-product (bol, Amazon.nl, Amazon.de) voor het prijsadvies
    const prices = heavy ? { wait: 'busy hour' } : await shopPrices(store, 'yoors', { token: gatewayToken(req) }).catch(e => ({ error: String(e.message || e).slice(0, 120) }));
    const { keepaCollect } = await import('../lib/keepa.js'); // Keepa: Amazon-historie per zoekterm, binnen de tokens van het uur
    const keepa = heavy ? { wait: 'busy hour' } : await keepaCollect(store, { max: 110 }).catch(e => ({ error: String(e.message || e).slice(0, 120) }));
    const out = { ok: true, signals: sig, bol, early, wild, amzSales, feedOpt, prices, keepa, ...(await runLoop(store)) };
    const { heartbeat } = await import('../lib/components.js'); await heartbeat(store, 'loop', out); // hartslag voor de overdracht
    res.status(200).json(out); }
  catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
}
