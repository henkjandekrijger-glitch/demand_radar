// Elk uur (Vercel Cron): gebeurtenissen optellen en de kansen van de varianten opnieuw verdelen.
import { getStore } from '../lib/store.js';
import { runLoop } from '../lib/learn.js';
import { aggregate } from '../lib/signals.js';
import { bolSnapshot } from '../lib/bolpop.js';
import { autoEarly } from '../lib/earlydata.js';
import { dailyWild } from '../lib/wildcards.js';
import { amazonSales } from '../lib/amazonsales.js';

export default async function handler(req, res) {
  const store = getStore();
  if (!store) return res.status(200).json({ ok: false, reason: 'no storage yet (connect a Blob store in Vercel)' });
  try { const sig = await aggregate(store).catch(e => ({ error: String(e.message || e) })); const bol = await bolSnapshot(store).catch(e => ({ error: String(e.message || e).slice(0, 120) })); // gratis, één keer per dag
    const early = await autoEarly(store).catch(e => ({ error: String(e.message || e).slice(0, 120) })); // vroege signalen: dagelijks doorrekenen, nieuwe termen ophalen, maandelijks vers
    const wild = await dailyWild(store).catch(e => ({ error: String(e.message || e).slice(0, 120) })); // wildcards nakijken (gratis)
    const amzSales = await amazonSales(store).catch(e => ({ error: String(e.message || e).slice(0, 120) })); // Amazon gekocht vorige maand (maandelijks)
    res.status(200).json({ ok: true, signals: sig, bol, early, wild, amzSales, ...(await runLoop(store)) }); }
  catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
}
