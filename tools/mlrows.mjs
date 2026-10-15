// Trainingsrijen voor het voorspelmodel, met precies dezelfde kenmerken als productie (lib/ml.js feats).
// Gebruik: node tools/mlrows.mjs all-series.json > rows.csv   (all-series.json: { "NL|zoekterm": { m: [[jaar, maand, volume], ...] } } uit /api/series)
import fs from 'node:fs';
import { feats, FEATS } from '../lib/ml.js';
import { blend, riseCall, WEIGHTS } from '../lib/forecast.js';

const all = JSON.parse(fs.readFileSync(process.argv[2]));
// optioneel: Wikipedia-maanddata per zoekterm (uit /api/collect?src=wiki) → op dezelfde maanden als de Ads-reeks
const wiki = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3])) : {};
// optioneel: VS-maanddata voor dezelfde zoektermen ({ zoekterm: { m: [...] } }) → kenmerken voor NL/DE
const us = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4])) : {};
const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
// Oude regel (tot 14 okt 2026): seizoensstijging vorig jaar ≥ 40% en gemiddelde van 'vorig jaar' en 'nu' ≥ 20% boven nu.
const oldRise = (y, t, h, h0) => { const v = blend(y, t, h, WEIGHTS), n = blend(y, t, h0, WEIGHTS); return riseCall(y, t, h) === 1 && v >= n * 1.2 && v > y[t] * 1.2 ? 1 : 0; };
const out = [['sid', 'cc', 'kind', 'tgt', 'y0', 'ynow', 'act', 'old', ...FEATS].join(',')];
const num = v => (Number.isFinite(v) ? +v.toFixed(6) : '');
for (const [sid, s] of Object.entries(all)) {
  const ser = [...s.m].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (ser.length < 15) continue;
  const cc = sid.split('|')[0], y = ser.map(x => x[2]), keys = ser.map(x => ym(x[0], x[1]));
  const sidq = JSON.stringify(sid);
  const wm = wiki[sid] && wiki[sid].m && wiki[sid].m.length ? new Map(wiki[sid].m.map(x => [ym(x[0], x[1]), x[2]])) : null;
  const w = wm ? keys.map(k => (wm.has(k) ? wm.get(k) : NaN)) : null;
  const um = cc !== 'US' && us[sid.slice(3)] && us[sid.slice(3)].m ? new Map(us[sid.slice(3)].m.map(x => [ym(x[0], x[1]), x[2]])) : null;
  const u = um ? keys.map(k => (um.has(k) ? um.get(k) : NaN)) : null;
  const wn = t => (wm && t + 1 < keys.length && wm.has(keys[t + 1]) ? wm.get(keys[t + 1]) : NaN);
  for (let t = 12; t < y.length - 1; t++) for (let h = 1; h <= 4 && t + h < y.length; h++) {
    // value: waarde van maand t+h
    if (!(y[t] < 50 && y[t + h] < 50)) out.push([sidq, cc, 'value', keys[t + h], y[t], y[t], y[t + h], Math.round(blend(y, t, h, WEIGHTS)), ...feats(y, t, h, cc, 0, w, wn(t), u).map(num)].join(','));
    // rise: stijgt t+h ≥ 40% boven "nu" (t+h0), h0 = 1..3 maanden achterstand van de data
    for (let h0 = 1; h0 < h; h0++) if (y[t + h0] >= 100) // label in train_forecast.py: act ≥ 1,4 × nu
      out.push([sidq, cc, 'rise', keys[t + h], y[t], y[t + h0], y[t + h], oldRise(y, t, h, h0), ...feats(y, t, h, cc, h0, w, wn(t), u).map(num)].join(','));
  }
}
process.stdout.write(out.join('\n') + '\n');
