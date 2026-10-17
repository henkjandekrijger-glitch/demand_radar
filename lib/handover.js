// Altijd actuele overdracht voor andere chats: /overdracht (of /handover), als pagina, tekst (?format=text) of JSON (?format=json).
// Drie lagen: (1) live status, automatisch uit de draaiende app; (2) logboek + open taken, bijgewerkt door elke chat
// (POST/GET /api/handover?op=note|todo|done&key=…, of MCP-tools handover / handover_note); (3) de README uit de repo.
import fs from 'node:fs';
import path from 'node:path';
import { getJSON, putJSON } from './store.js';

const LOG = 'handover/log.json', TODO = 'handover/todo.json', GH = 'handover/github.json';
const REPO = 'henkjandekrijger-glitch/demand_radar';
const now = () => new Date().toISOString();
const clean = (s, n) => String(s || '').replace(/\s+\n/g, '\n').trim().slice(0, n);

export async function readHandover(store) {
  const [log, todo] = await Promise.all([getJSON(store, LOG, []).catch(() => []), getJSON(store, TODO, []).catch(() => [])]);
  return { log: log || [], todo: todo || [] };
}
export async function addNote(store, { text, who }) {
  const t = clean(text, 2000); if (!t) throw new Error('text is required');
  const log = (await getJSON(store, LOG, []).catch(() => [])) || [];
  log.unshift({ at: now(), who: clean(who, 40) || 'chat', text: t });
  await putJSON(store, LOG, log.slice(0, 300));
  return log[0];
}
export async function addTodo(store, { text, who }) {
  const t = clean(text, 600); if (!t) throw new Error('text is required');
  const todo = (await getJSON(store, TODO, []).catch(() => [])) || [];
  const id = (todo.reduce((m, x) => Math.max(m, x.id || 0), 0) || 0) + 1;
  todo.push({ id, text: t, who: clean(who, 40) || 'chat', at: now(), done: null });
  await putJSON(store, TODO, todo);
  return todo[todo.length - 1];
}
export async function doneTodo(store, { id, text, who }) {
  const todo = (await getJSON(store, TODO, []).catch(() => [])) || [];
  const it = todo.find(x => x.id === +id); if (!it) throw new Error(`no open task ${id}`);
  it.done = { at: now(), who: clean(who, 40) || 'chat', text: clean(text, 600) };
  await putJSON(store, TODO, todo);
  return it;
}

// Laatste wijzigingen in de code (openbare repo; 10 minuten bewaard zodat GitHub niet te vaak gevraagd wordt).
async function commits(store) {
  const c = await getJSON(store, GH, null).catch(() => null);
  if (c && Date.now() - Date.parse(c.at) < 10 * 6e4) return c.list;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/commits?per_page=12`, { headers: { 'user-agent': 'demand-radar' }, signal: AbortSignal.timeout(6000) });
    const j = await r.json(); if (!Array.isArray(j)) return c ? c.list : [];
    const list = j.map(x => ({ sha: x.sha.slice(0, 7), at: x.commit.author.date, msg: x.commit.message.split('\n')[0] }));
    await putJSON(store, GH, { at: now(), list }).catch(() => {});
    return list;
  } catch { return c ? c.list : []; }
}

export async function liveStatus(store, { owner = false, req = null } = {}) {
  const env = process.env, has = k => !!env[k];
  const { ML } = await import('./ml.js'), { EARLY } = await import('./early.js'), { latestEarly } = await import('./earlydata.js'), { BACKTEST } = await import('./forecast.js');
  const E = await latestEarly(store).catch(() => null);
  const day = new Date(Date.now() - 8 * 36e5).toISOString().slice(0, 10), yt = await getJSON(store, `yt/quota-${day}.json`, null).catch(() => null);
  let spend = null;
  if (owner) { try { const d = await import('./dfs.js'); spend = { today: d.spentToday ? Math.round((await d.spentToday()) * 100) / 100 : null, balance: d.lastBalance ? d.lastBalance() : null, dailyCap: +(env.DFS_DAILY_MAX || 4) }; } catch {} }
  return {
    at: now(), site: 'https://demandradar-ivory.vercel.app', repo: `https://github.com/${REPO}`,
    deploy: { commit: (env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null, message: env.VERCEL_GIT_COMMIT_MESSAGE ? env.VERCEL_GIT_COMMIT_MESSAGE.split('\n')[0] : null },
    setup: { dataforseo: has('DFS_LOGIN') && has('DFS_PASSWORD'), storage: !!store, youtube: has('YOUTUBE_API_KEY'), bing: has('BING_WEBMASTER_KEY'), paddle: has('PADDLE_API_KEY') && has('PADDLE_CLIENT_TOKEN'), mail: has('RESEND_API_KEY') && has('MAIL_FROM'), ai: has('ANTHROPIC_API_KEY') || has('AI_GATEWAY_API_KEY') || has('VERCEL_OIDC_TOKEN') || !!(req && req.headers && req.headers['x-vercel-oidc-token']), radarMode: env.AUTO_BUILD === 'on' ? 'nightly build' : 'on request', dfsDailyCap: +(env.DFS_DAILY_MAX || 4) },
    forecast: ML ? { version: ML.version, trained: ML.trained, test: BACKTEST && BACKTEST.rise ? `${BACKTEST.rise.right40}% of predicted rises were ≥ 40% (old rule ${BACKTEST.old ? BACKTEST.old.right40 : '?'}%)` : null } : null,
    early: E ? { month: E.month, day: E.day, shown: E.items.length, counts: Object.fromEntries(Object.entries(E.counts || {}).map(([k, v]) => [k, { terms: v.terms, shown: v.shown }])), test: EARLY && EARLY.test ? `not visible yet: ${EARLY.test.hidden.hit}% broke out within 6 months (normally ${EARLY.test.hidden.base}%); starting: ${EARLY.test.starting.hit}%` : null } : null,
    youtubeSearchesToday: yt ? yt.searches : 0,
    spend, recentCommits: await commits(store),
  };
}

export function readme() {
  try { return fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8'); } catch { return ''; }
}

export const HOW = `HOE JE MEEWERKT (voor elke chat of sessie die aan Demand Radar werkt)
1. Lees eerst deze overdracht: https://demandradar-ivory.vercel.app/overdracht?format=text (of MCP-tool "handover").
2. Code: repo ${REPO} (openbaar: nooit sleutels of geheimen in code, alleen in Vercel). Push naar main = live op Vercel.
3. Na elke wijziging of beslissing: zet een korte notitie in het logboek:
   - MCP (Demand Radar-connector met teamsleutel): tool "handover_note" met text (en optioneel todo / done).
   - Of HTTP: POST https://demandradar-ivory.vercel.app/api/handover?op=note&key=<teamsleutel> met JSON {"who":"<chat>","text":"…"}
     (GET kan ook: ...&op=note&who=…&text=… voor chats die alleen kunnen ophalen).
   - Taken: op=todo (text) en op=done (id, text).
4. Grotere veranderingen: ook README.md bijwerken (sectie "Stand van zaken"), committen en pushen.
5. Werkwijze Henkjan: Nederlands, kort, één stap tegelijk vragen; zuinig met tokens; DataForSEO max $4 per dag; nooit een eindpunt dat geld of quotum kost in een lus aanroepen.`;

export function toText(st, h, rd = '') {
  const L = [`DEMAND RADAR — OVERDRACHT (live, ${st.at})`, '', HOW, '', 'LIVE STATUS'];
  L.push(`- Site: ${st.site} · repo: ${st.repo} · live versie: ${st.deploy.commit || '?'} ${st.deploy.message || ''}`);
  L.push(`- Koppelingen: ${Object.entries(st.setup).map(([k, v]) => `${k}=${v === true ? 'ja' : v === false ? 'NEE' : v}`).join(', ')}`);
  if (st.forecast) L.push(`- Voorspelmodel v${st.forecast.version} (getraind ${st.forecast.trained}): ${st.forecast.test || ''}`);
  if (st.early) L.push(`- Vroege signalen: data t/m ${st.early.month}, doorgerekend ${st.early.day}, ${st.early.shown} getoond (${Object.entries(st.early.counts).map(([k, v]) => `${k} ${v.shown}/${v.terms}`).join(', ')}). Toets: ${st.early.test}`);
  L.push(`- YouTube-zoekopdrachten vandaag: ${st.youtubeSearchesToday}/96`);
  if (st.spend) L.push(`- DataForSEO vandaag: $${st.spend.today} van $${st.spend.dailyCap} · tegoed: ${st.spend.balance != null ? '$' + st.spend.balance : '?'}`);
  const open = h.todo.filter(t => !t.done), done = h.todo.filter(t => t.done).slice(-5);
  L.push('', `OPEN TAKEN (${open.length})`); for (const t of open) L.push(`- [${t.id}] ${t.text} (${t.who}, ${t.at.slice(0, 10)})`);
  if (done.length) { L.push('', 'LAATST AFGEROND'); for (const t of done) L.push(`- [${t.id}] ${t.text} → ${t.done.text || 'klaar'} (${t.done.who}, ${t.done.at.slice(0, 10)})`); }
  L.push('', 'LOGBOEK (nieuwste eerst)'); for (const n of h.log.slice(0, 25)) L.push(`- ${n.at.slice(0, 16).replace('T', ' ')} · ${n.who}: ${n.text}`);
  L.push('', 'LAATSTE CODEWIJZIGINGEN'); for (const c of st.recentCommits || []) L.push(`- ${c.at.slice(0, 16).replace('T', ' ')} ${c.sha} ${c.msg}`);
  if (rd) L.push('', '════════ README (volledige overdracht en uitleg) ════════', rd);
  return L.join('\n');
}
