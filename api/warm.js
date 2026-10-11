// Elk uur (Vercel Cron): haalt de radar op zodat de data in de cache vers blijft.
import { RAW_TOKEN, selfBase } from '../lib/access.js';

export default async function handler(req, res) {
  try {
    const r = await fetch(`${selfBase(req)}/api/radar?raw=${RAW_TOKEN}`, { signal: AbortSignal.timeout(58000) });
    res.status(200).json({ ok: r.ok, status: r.status });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e) });
  }
}
