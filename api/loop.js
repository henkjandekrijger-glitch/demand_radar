// Elk uur (Vercel Cron): gebeurtenissen optellen en de kansen van de varianten opnieuw verdelen.
import { getStore } from '../lib/store.js';
import { runLoop } from '../lib/learn.js';
import { aggregate } from '../lib/signals.js';
import { bolSnapshot } from '../lib/bolpop.js';

export default async function handler(req, res) {
  const store = getStore();
  if (!store) return res.status(200).json({ ok: false, reason: 'no storage yet (connect a Blob store in Vercel)' });
  try { const sig = await aggregate(store).catch(e => ({ error: String(e.message || e) })); const bol = await bolSnapshot(store).catch(e => ({ error: String(e.message || e).slice(0, 120) })); // gratis, één keer per dag
    res.status(200).json({ ok: true, signals: sig, bol, ...(await runLoop(store)) }); }
  catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
}
