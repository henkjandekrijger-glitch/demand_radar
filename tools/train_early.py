# Traint het vroege-signalenmodel (lib/early-model.js) op rijen van tools/earlyrows.mjs.
#   python3 tools/train_early.py early6.csv lib/early-model.js
# 1) Toets op twee grensmaanden: leren op doelmaanden t/m de grens, toetsen op signalen ná de grens (alleen verleden → toekomst).
# 2) Kans per laag gemeten: 'starting' (laatste maand al ≥ 1,5× vorig jaar) en 'hidden' (nog niet zichtbaar).
# 3) Definitief: leren op alles, bomen wegschrijven als JS-module die lib/early.js uitrekent.
import sys, json, math, datetime, numpy as np, pandas as pd, lightgbm as lgb
rows, outp = sys.argv[1], sys.argv[2]
df = pd.read_csv(rows); FEATS = list(df.columns[df.columns.get_loc('y') + 1:])
P = dict(n_estimators=500, learning_rate=0.02, num_leaves=15, min_child_samples=200, subsample=0.8, subsample_freq=1, colsample_bytree=0.8, verbose=-1)
fit = lambda d: lgb.LGBMClassifier(**P).fit(d[FEATS], d.y)
tier = lambda d: np.where(d.yoy1 >= math.log(1.5), 'starting', 'hidden')
SHOW = {'starting': 0.5, 'hidden': 0.3}
BANDS = [0.3, 0.4, 0.5]
test, pooled = {}, []
for cut in ('2025-03', '2025-09'):
    tr, te = df[df.tgt <= cut], df[df.t > cut].copy()
    te['p'] = fit(tr).predict_proba(te[FEATS])[:, 1]; te['tier'] = tier(te); pooled.append(te)
    r = dict(months=int(te.t.nunique()))
    for tr_ in ('starting', 'hidden'):
        z = te[te.tier == tr_]; s = z[z.p >= SHOW[tr_]]
        r[tr_] = dict(n=int(len(z)), base=round(float(z.y.mean() * 100), 1), shown=int(len(s)), perMonth=round(len(s) / max(1, z.t.nunique()), 1), hit=round(float(s.y.mean() * 100), 1) if len(s) else None)
    test[cut] = r
pl = pd.concat(pooled)
calib = {}
for tr_ in ('starting', 'hidden'):
    z = pl[pl.tier == tr_]; c = []
    for i, lo in enumerate(BANDS):
        hi = BANDS[i + 1] if i + 1 < len(BANDS) else 1.01
        k = (z.p >= lo) & (z.p < hi)
        if k.sum() >= 20: c.append([lo, round(float(z.y[k].mean()), 3), int(k.sum())])
    for i in range(1, len(c)): c[i][1] = max(c[i][1], c[i - 1][1])  # monotoon: hogere score nooit lagere kans
    s = z[z.p >= SHOW[tr_]]
    calib[tr_] = [[a, b] for a, b, n in c]
    test[tr_] = dict(base=round(float(z.y.mean() * 100), 1), hit=round(float(s.y.mean() * 100), 1), shown=int(len(s)), lift=round(float(s.y.mean() / z.y.mean()), 1))
print(json.dumps(dict(test=test, calib=calib), indent=1))
def compact(booster):
    trees = []
    for ti in booster.dump_model()['tree_info']:
        f, t, l, r, d, m, v = [], [], [], [], [], [], []
        def add(n):
            i = len(f); f.append(-1); t.append(0); l.append(-1); r.append(-1); d.append(0); m.append(0); v.append(0)
            if 'leaf_value' in n and 'split_feature' not in n: v[i] = round(n['leaf_value'], 7); return i
            f[i] = n['split_feature']; t[i] = n['threshold']; d[i] = 1 if n['default_left'] else 0; m[i] = {'None': 0, 'Zero': 1, 'NaN': 2}[n['missing_type']]
            assert n['decision_type'] == '<='
            l[i] = add(n['left_child']); r[i] = add(n['right_child']); return i
        add(ti['tree_structure']); trees.append(dict(f=f, t=t, l=l, r=r, d=d, m=m, v=v))
    return trees
m = fit(df)
model = dict(version=1, trained=datetime.date.today().isoformat(), horizon=6, rows=int(len(df)), series=int(df.sid.nunique()), feats=FEATS, show=SHOW, calib=calib, test=test, trees=compact(m.booster_))
open(outp, 'w').write('// Gegenereerd door tools/train_early.py — niet met de hand aanpassen.\nexport default ' + json.dumps(model, separators=(',', ':')) + ';\n')
s = df.sample(300, random_state=1)
json.dump([dict(x=[None if pd.isna(a) else a for a in row], p=float(q)) for row, q in zip(s[FEATS].values.tolist(), m.predict_proba(s[FEATS])[:, 1])], open(rows + '.check.json', 'w'))
