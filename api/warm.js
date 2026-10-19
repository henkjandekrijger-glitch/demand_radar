// Vercel Cron: elk uur de radar, elke nacht de kansenkaart opnieuw opbouwen zodat bezoekers niet hoeven te wachten.
import { getRadar, getMap } from '../lib/data.js';

export default async function handler(req, res) {
  try {
    if (req.query.map) { const d = await getMap(req, { pack: 'practice' }); return res.status(200).json({ ok: true, map: d.generatedAt, items: d.items.length, mode: d.mode }); }
    const d = await getRadar(req);
    // Elke nacht de radar opnieuw opbouwen (vanaf 04:00 UTC, als de radardag omslaat), hooguit 2 pogingen per dag.
    let night = null;
    if (new Date().getUTCHours() >= 4) {
      const { getDemand, demandDay } = await import('../lib/data.js'), { getStore, getJSON, putJSON } = await import('../lib/store.js');
      const cur = await getDemand(req), day = demandDay(), store = getStore();
      if (store && (!cur || cur.day !== day || cur.stale)) {
        const k = `demand/attempt-${day}.json`, a = (await getJSON(store, k, null).catch(() => null)) || { n: 0 };
        if (a.n < 2) { a.n++; a.at = new Date().toISOString(); await putJSON(store, k, a).catch(() => {}); const nd = await getDemand(req, { build: true }); night = { day: nd.day, stale: !!nd.stale, note: nd.buildNote || null, spent: nd.spent, attempt: a.n }; }
        else night = { skip: 'two attempts today' };
      }
    }
    // Events (voorspellingsmarkten) één keer per dag klaarzetten
    let events = null; try { const { getEvents } = await import('../lib/events.js'), { getStore } = await import('../lib/store.js'), { gatewayToken } = await import('../lib/ai.js'); const ev = await getEvents(getStore(), { token: gatewayToken(req) }); events = { day: ev.day, items: (ev.items || []).length, errors: ev.errors || [] }; } catch (e) { events = { error: String(e.message || e).slice(0, 120) }; }
    // klein stand-bestand en hartslag voor de overdracht
    try { const { getDemand } = await import('../lib/data.js'), { getStore, putJSON } = await import('../lib/store.js'), { heartbeat } = await import('../lib/components.js'), st = getStore(), cur = await getDemand(req);
      if (st && cur && cur.day) await putJSON(st, 'demand/meta.json', { day: cur.day, generatedAt: cur.generatedAt || null, items: (cur.items || []).length, rise: (cur.rise || []).length });
      await heartbeat(st, 'warm', { radar: d.generatedAt, night, events }); } catch {}
    res.status(200).json({ ok: true, radar: d.generatedAt, night, events });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e) });
  }
}
