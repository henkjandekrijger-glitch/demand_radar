// Trainingsrijen voor de vroege signalen, met precies dezelfde kenmerken als productie (lib/early.js earlyFeats).
// Gebruik: node tools/earlyrows.mjs all-series.json 6 > early6.csv   (6 = doorbraak binnen 6 maanden)
import fs from 'node:fs';
import { earlyFeats, EFEATS, brokeOut, stepJump, oneOffJumps, MINV } from '../lib/early.js';
import { noise } from '../lib/rising.js';

const all = JSON.parse(fs.readFileSync(process.argv[2])), H = +(process.argv[3] || 6);
const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`, num = v => (Number.isFinite(v) ? +v.toFixed(6) : '');
const out = [['sid', 'cc', 't', 'tgt', 'y', ...EFEATS].join(',')];
let used = 0, skipped = 0;
for (const [sid, s] of Object.entries(all)) {
  const [cc, ...rest] = sid.split('|'), k = rest.join('|');
  if (!MINV[cc]) continue;
  const ser = [...s.m].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const y = ser.map(x => +x[2] || 0), keys = ser.map(x => ym(x[0], x[1]));
  // hele reeks overslaan bij ruis (nieuws, sport, personen) of telfouten van Google
  if (y.length < 30 || noise({ k, monthly: ser.map(([yy, mm, v]) => ({ year: yy, month: mm, search_volume: v })) }, cc) || stepJump(y) || oneOffJumps(y)) { skipped++; continue; }
  used++;
  const f = brokeOut(y, MINV[cc]), onset = f.map((v, i) => v && i > 0 && !f[i - 1]);
  for (let t = 14; t < y.length - H; t++) {
    let recent = false; for (let i = Math.max(0, t - 12); i <= t; i++) if (f[i]) recent = true;
    if (recent || y[t] < MINV[cc] * 0.1) continue;
    const lab = onset.slice(t + 1, t + 1 + H).some(Boolean) ? 1 : 0;
    out.push([JSON.stringify(sid), cc, keys[t], keys[t + H], lab, ...earlyFeats(y, t, cc).map(num)].join(','));
  }
}
process.stdout.write(out.join('\n') + '\n');
console.error(`series used ${used}, skipped ${skipped}, rows ${out.length - 1}`);
