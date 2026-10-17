// /api/mine — "Mijn bedrijf": een bedrijf koppelen aan alle voorspellingen van de radar.
// POST ?op=analyse {url | text}           → profielvoorstel (team of betalend)
// POST ?op=save {url, profile, answers}   → opslaan, zoektermen ophalen → {id}; volgen op /mine/<id>
// GET  ?id=…                               → profiel + vraag naar wat het verkoopt + passende voorspellingen (dagelijks ververst)
// GET  ?list=1                             → eigen profielen;  ?id=…&refresh=1 (eigenaar) rekent vandaag opnieuw
import { getStore, getJSON, putJSON } from '../lib/store.js';
import { isPro } from '../lib/access.js';
import { gatewayToken } from '../lib/ai.js';
import { planOf } from '../lib/account.js';
import { readSite, makeProfile, saveProfile, getProfile, listProfiles, fetchTerms, dailyMine, CCS } from '../lib/mine.js';

const body = req => { let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } } return b || {}; };
async function who(req, store) { const p = await planOf(req, store).catch(() => ({ plan: 'anon' })); return { ok: p.plan === 'team' || !['free', 'anon'].includes(p.plan), owner: p.plan === 'team' ? 'team' : p.email || '' }; }
// Rem: max 40 analyses per dag (AI-kosten).
async function underLimit(store) { const k = `mine/rate-${new Date().toISOString().slice(0, 10)}.json`, r = (await getJSON(store, k, null).catch(() => null)) || { n: 0 }; if (r.n >= 40) return false; r.n++; await putJSON(store, k, r).catch(() => {}); return true; }

export default async function handler(req, res) {
  const store = getStore();
  if (!store) return res.status(503).json({ error: 'no storage' });
  res.setHeader('Cache-Control', 'private, no-store');
  const op = String(req.query.op || ''), token = gatewayToken(req);
  try {
    if (op === 'analyse' || op === 'save') {
      const me = await who(req, store);
      if (!me.ok) return res.status(403).json({ error: 'signin', message: 'Following your business is part of the paid plans. Sign in or pick a plan.' });
      const b = body(req);
      if (op === 'analyse') {
        if (!(await underLimit(store))) return res.status(429).json({ error: 'Too many requests today, try again tomorrow.' });
        // één of meer websites (gescheiden door spatie of komma), max 3
        const urls = [...new Set(String(b.url || '').split(/[\s,]+/).filter(Boolean))].slice(0, 3);
        const sites = await Promise.all(urls.map(u => readSite(u).catch(e => ({ error: String(e.message || e) }))));
        const ok = sites.filter(x => !x.error);
        if (urls.length && !ok.length && !b.text) return res.status(400).json({ error: `${sites[0].error} You can also describe your business in one sentence.` });
        const text = ok.map(x => `[${x.url}]\n${x.text.slice(0, Math.floor(7000 / ok.length))}`).join('\n\n');
        const profile = await makeProfile({ url: ok.map(x => x.url).join(' '), text, note: String(b.text || b.note || '').slice(0, 600), token });
        return res.status(200).json({ url: ok.length ? ok.map(x => x.url).join(' ') : null, profile });
      }
      // save: antwoorden verwerken (land, antwoord op de vraag, wat er nog meer bij kan), profiel aanscherpen, opslaan
      const p0 = b.profile; if (!p0 || !p0.name) return res.status(400).json({ error: 'profile missing' });
      const a = { countries: (b.answers && b.answers.countries || []).filter(c => CCS.includes(c)), answer: String(b.answers && b.answers.answer || '').slice(0, 200), extra: String(b.answers && b.answers.extra || '').slice(0, 400) };
      if (!a.countries.length) a.countries = p0.countries && p0.countries.length ? p0.countries : ['NL'];
      let profile = p0;
      if (a.answer || a.extra) {
        const note = `${p0.summary}${p0.question && a.answer ? ` Question "${p0.question.q}": ${a.answer}.` : ''}${a.extra ? ` Also offers or plans: ${a.extra}.` : ''} Countries: ${a.countries.join(', ')}.`;
        profile = await makeProfile({ url: b.url || '', note, token }).catch(() => p0);
        profile.question = p0.question;
      }
      const rec = await saveProfile(store, { url: b.url || null, profile, answers: a, owner: me.owner });
      const fetched = await fetchTerms(store, rec).catch(e => ({ error: String(e.message || e).slice(0, 120) }));
      return res.status(200).json({ id: rec.id, link: `/mine/${rec.id}`, fetched });
    }
    if (req.query.list) {
      const me = await who(req, store); if (!me.ok) return res.status(200).json({ items: [] });
      return res.status(200).json({ items: (await listProfiles(store, me.owner === 'team' ? null : me.owner)).slice(-50).reverse() });
    }
    const rec = await getProfile(store, String(req.query.id || ''));
    if (!rec) return res.status(404).json({ error: 'Not found. Check the link.' });
    const { getDemand } = await import('../lib/data.js'), { presentDemand } = await import('../lib/demand.js');
    if (req.query.compete) { // concurrenten en gaten (wekelijks, lui)
      const { getDemand } = await import('../lib/data.js'), { presentDemand } = await import('../lib/demand.js'), { compete } = await import('../lib/compete.js');
      const d0 = await dailyMine(store, rec, { token, getDemand: async () => presentDemand(await getDemand(req)) });
      return res.status(200).json(await compete(store, rec, d0.own, { token, force: !!(req.query.refresh && isPro(req)) }));
    }
    const out = await dailyMine(store, rec, { token, force: !!(req.query.refresh && isPro(req)), debug: !!(req.query.debug && isPro(req)), getDemand: async () => presentDemand(await getDemand(req)) });
    const { owner, ...pub } = rec;
    // Eigen winkel met productfeed (nu Yoors Shop): stand van Google Shopping / Merchant Center, dagelijks ververst
    let shopping = null;
    if (/(^|\/\/|\.)yoo\.rs\/shop/.test(String(rec.url || ''))) {
      const { getJSON } = await import('../lib/store.js'), f = await getJSON(store, 'feed/yoors-NL.json', null).catch(() => null), t = (await getJSON(store, 'feed/yoors-titles-NL.json', null).catch(() => null)) || {};
      if (f) shopping = { feed: 'https://demandradar-ivory.vercel.app/api/feed?shop=yoors&cc=NL', products: f.n, at: f.at, titles: Object.keys(t).length, merchant: 'Yoors (5875752564)', fetch: 'every day at 00:00' };
    }
    return res.status(200).json({ ...pub, ...out, shopping });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
}
