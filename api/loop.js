// Elk uur (Vercel Cron): gebeurtenissen optellen en de kansen van de varianten opnieuw verdelen.
import { getStore } from '../lib/store.js';
import { runLoop } from '../lib/learn.js';

export default async function handler(req, res) {
  const store = getStore();
  if (!store) return res.status(200).json({ ok: false, reason: 'no storage yet (connect a Blob store in Vercel)' });
  try { res.status(200).json({ ok: true, ...(await runLoop(store)) }); }
  catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
}
