# Toets: maken energieprijzen (of een andere drijver) de voorspelling beter voor zoektermen die erop reageren?
#   python3 tools/driver_test.py all-series48.json drv-NL.json,drv-DE.json,drv-US.json [cut=2025-10]
# Zelfde opzet als de andere toetsen: leren op doelmaanden vóór 'cut', toetsen erna; model met en zonder de drijverkenmerken,
# fout (WAPE) gemeten op de zoektermen die bij de drijver horen. Drijver = verandering t.o.v. een jaar eerder, 1-3 maanden vóór 'nu'
# (wat je op dat moment al weet; Eurostat publiceert ± 2 weken na de maand).
import sys, json, math, re, numpy as np, pandas as pd, lightgbm as lgb
alls = json.load(open(sys.argv[1])); D = {}
for f in sys.argv[2].split(','):
    d = json.load(open(f)); D[d['cc']] = d['drivers']
cut = sys.argv[3] if len(sys.argv) > 3 else '2025-10'
NAMES = ['energy', 'petrol', 'diesel', 'power']
ENERGY = re.compile(r'(pellet|elektrisch\w* kachel|kachel|heizl|heizstrahl|heizdecke|heizkissen|elektrische deken|electric blanket|heated blanket|space heater|infrarood|infrarot|isolatie|dämmung|insulation|tochtstrip|zonnepane|solarpan|balkonkraftwerk|photovoltaik|solar panel|thuisbatterij|thuis batterij|stromspeicher|home battery|warmtepomp|wärmepumpe|heat pump|e-?bike|elektrische fiets|pedelec|laadpaal|wallbox|ev charger|elektroauto|electric car|energie vergelijk|energievergelijk|stromanbieter|strom vergleich|energy supplier|thermostaat|thermostat|airco|klimaanlage|air condition|houtkachel|kaminofen|wood stove|petroleumkachel|generator|stroomgenerator|benzine|diesel|e-auto)', re.I)
def ym(y, m): return f"{y}-{m:02d}"
def add(k, d):
    y, m = map(int, k.split('-')); m += d
    while m < 1: m += 12; y -= 1
    while m > 12: m -= 12; y += 1
    return ym(y, m)
L = lambda a, b: math.log((a + 10) / (b + 10))
def dyoy(cc, name, k):
    s = D.get(cc, {}).get(name) or {}
    a, b = s.get(k), s.get(add(k, -12))
    return math.log(a / b) if a and b and a > 0 and b > 0 else np.nan
rows = []
for sid, s in alls.items():
    m = sorted(s['m']); y = [x[2] for x in m]; keys = [ym(x[0], x[1]) for x in m]
    if len(y) < 30: continue
    cc = sid.split('|')[0]; hit = bool(ENERGY.search(sid[3:]))
    for t in range(24, len(y) - 1):
        for h in range(1, 4):
            if t + h >= len(y): break
            act = y[t + h]
            if y[t] < 50 and act < 50: continue
            hist = y[:t + 1]; med = float(np.median(hist))
            r = dict(sid=sid, hit=hit, tgt=keys[t + h], y0=y[t], act=act, h=h, ly0=math.log1p(y[t]), r1=L(y[t - 1], y[t]), r2=L(y[t - 2], y[t]),
                     rs=L(y[t + h - 12], y[t]), rs2=L(y[t + h - 24], y[t - 12]), rsh=L(y[t + h - 12], y[t - 12]), yoy3=L(sum(y[t - 2:t + 1]), sum(y[t - 14:t - 11])),
                     yoy1=L(y[t], y[t - 12]), spike=L(y[t], med), cc={'NL': 0, 'DE': 1, 'US': 2}[cc], tm=int(keys[t + h][5:]))
            for n in NAMES:  # drijver op 1 en 3 maanden vóór 'nu' (bekend), en hoe hij veranderde
                r[n + '1'] = dyoy(cc, n, add(keys[t], -1)); r[n + '3'] = dyoy(cc, n, add(keys[t], -3))
            rows.append(r)
df = pd.DataFrame(rows)
BASE = ['h', 'ly0', 'r1', 'r2', 'rs', 'rs2', 'rsh', 'yoy3', 'yoy1', 'spike', 'cc', 'tm']
DRV = [n + s for n in NAMES for s in ('1', '3')]
df['y'] = np.log((df.act + 10) / (df.y0 + 10))
P = dict(objective='l1', n_estimators=300, learning_rate=0.05, num_leaves=31, min_child_samples=40, subsample=0.8, subsample_freq=1, colsample_bytree=0.8, verbose=-1, random_state=1)
tr, te = df[df.tgt < cut], df[df.tgt >= cut]
wape = lambda f, d: round(float(np.abs(f - d.act).sum() / d.act.sum() * 100), 2)
out = dict(cut=cut, rows=len(df), energy_terms=int(df[df.hit].sid.nunique()), test_rows=int(len(te)), test_energy_rows=int(te.hit.sum()))
for name, feats, sub in [('base_all', BASE, tr), ('drv_all', BASE + DRV, tr), ('drv_energy_only', BASE + DRV, tr[tr.hit])]:
    preds = []
    for seed in range(3):
        P['random_state'] = seed
        mdl = lgb.LGBMRegressor(**P).fit(sub[feats], sub.y, sample_weight=np.sqrt(sub.y0 + 10))
        preds.append(np.maximum((te.y0 + 10) * np.exp(mdl.predict(te[feats])) - 10, 0))
    f = np.mean(preds, axis=0); e = te.hit.values
    out[name] = dict(all=wape(f, te), energy=wape(f[e], te[e]))
print(json.dumps(out, indent=1))
