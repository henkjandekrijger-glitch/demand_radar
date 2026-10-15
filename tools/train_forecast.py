# Traint het voorspelmodel (lib/model.js) op rijen van tools/mlrows.mjs.
#   python3 tools/train_forecast.py rows.csv 2026-05 lib/model.js
# 1) Toets: leren op doelmaanden vóór de grensmaand, toetsen op de maanden erna (eerlijk: alleen verleden → toekomst).
# 2) Definitief: leren op alles, bomen wegschrijven als JS-module die lib/ml.js uitrekent.
import sys, json, math, datetime, numpy as np, pandas as pd, lightgbm as lgb
rows, cut, outp = sys.argv[1], sys.argv[2], sys.argv[3]
df = pd.read_csv(rows)
import os
FEATS = list(df.columns[df.columns.get_loc('old') + 1:])  # alles na 'old' (zelfde volgorde als lib/ml.js FEATS)
DROP = [f for f in os.environ.get('DROP', '').split(',') if f]  # kenmerken uitzetten om bronnen te vergelijken (ontbrekend in productie = NaN)
SUB = os.environ.get('SUBSET', 'wy0')  # deelverzameling waar een bron aanwezig is (wy0 = Wikipedia, uy0 = VS)
HAS_WIKI = (df[SUB].notna() & (df['uyoy'].notna() if SUB == 'uy0' else True)).values if SUB in df else None  # vóór het uitzetten
for f in DROP: df[f] = np.nan
print('features', len(FEATS), 'dropped', DROP)
V, R = df[df.kind == 'value'].copy(), df[df.kind == 'rise'].copy()
V['y'] = np.log((V.act + 10) / (V.y0 + 10)); R['y'] = (R.act >= 1.4 * R.ynow).astype(int)  # sterke stijging: ≥ 40% boven nu (één Google-Ads-trede is al ±22%)
PV = dict(objective='l1', n_estimators=300, learning_rate=0.05, num_leaves=31, min_child_samples=50, subsample=0.8, subsample_freq=1, colsample_bytree=0.8, verbose=-1)
PR = dict(objective='binary', n_estimators=300, learning_rate=0.05, num_leaves=31, min_child_samples=50, subsample=0.8, subsample_freq=1, colsample_bytree=0.8, verbose=-1)
def fitV(d): return lgb.LGBMRegressor(**PV).fit(d[FEATS], d.y, sample_weight=np.sqrt(d.y0 + 10))
def fitR(d): return lgb.LGBMClassifier(**PR).fit(d[FEATS], d.y)
# ---- 1) toets ----
vtr, vte, rtr, rte = V[V.tgt < cut], V[V.tgt >= cut], R[R.tgt < cut], R[R.tgt >= cut]
fv = np.maximum((vte.y0 + 10) * np.exp(fitV(vtr).predict(vte[FEATS])) - 10, 0)
wape = lambda f, d: float(np.abs(f - d.act).sum() / d.act.sum() * 100)
test = dict(cut=cut, value_n=int(len(vte)), wape_old=round(wape(vte.old, vte), 1), wape_new=round(wape(fv, vte), 1))
p = fitR(rtr).predict_proba(rte[FEATS])[:, 1]; yt = rte.y.values; g = (rte.act / rte.ynow).values
test.update(rise_n=int(len(rte)), base=round(float(yt.mean() * 100), 1))
o = rte.old.values == 1
st = lambda k: dict(calls=int(k.sum()), hit10=round(float((g[k] > 1.1).mean() * 100), 1), hit20=round(float((g[k] >= 1.2).mean() * 100), 1), hit25=round(float((g[k] > 1.25).mean() * 100), 1), hit40=round(float((g[k] >= 1.4).mean() * 100), 1), caught40=round(float((k & (yt == 1)).sum() / yt.sum() * 100), 1))
test['old'] = st(o); test['new'] = st(p >= 0.7); test['p80'] = st(p >= 0.8)  # productie: stijging bij kans ≥ 0,7
# kalibratie: wat het model zei → hoe vaak het echt gebeurde (productie toont de gekalibreerde kans)
# alleen binnen de stijgers die de radar toont (kans ≥ 0,7)
cal = []
for lo, hi in [(0.7, 0.75), (0.75, 0.8), (0.8, 0.85), (0.85, 0.9), (0.9, 0.95), (0.95, 1.01)]:
    k = (p >= lo) & (p < hi)
    if k.sum() >= 30: cal.append([round(float(p[k].mean()), 4), round(float(yt[k].mean()), 4), int(k.sum())])
k = p >= 0.7; test['callsAvgChance'] = round(float(np.interp(p[k], [c[0] for c in cal], [c[1] for c in cal]).mean() * 100), 1)
test['calibration'] = cal
# deelverzameling met Wikipedia-artikel (daar kan die bron iets toevoegen)
hv, hr = (HAS_WIKI[vte.index] if HAS_WIKI is not None else None), (HAS_WIKI[rte.index] if HAS_WIKI is not None else None)
if hv is not None and hv.any():
    test['wiki_subset'] = dict(value_n=int(hv.sum()), wape_old=round(wape(vte.old.values[hv], vte[hv]), 1), wape_new=round(wape(fv.values[hv] if hasattr(fv, 'values') else fv[hv], vte[hv]), 1),
                               rise=st((p >= 0.7) & hr), rise_old=st(o & hr))
print(json.dumps(test, indent=1))
# ---- 2) definitief ----
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
    return dict(trees=trees)
mv, mr = fitV(V), fitR(R)
model = dict(version=2 if V.rs2.notna().any() else 1, trained=datetime.date.today().isoformat(), rows=dict(value=int(len(V)), rise=int(len(R)), series=int(df.sid.nunique())), test=test, feats=FEATS, value=compact(mv.booster_), rise=compact(mr.booster_))
open(outp, 'w').write('// Gegenereerd door tools/train_forecast.py — niet met de hand aanpassen.\nexport default ' + json.dumps(model, separators=(',', ':')) + ';\n')
# controle-voorbeelden voor de JS-uitrekening
sv = V.sample(200, random_state=1); sr = R.sample(200, random_state=1)
json.dump(dict(value=[dict(x=[None if pd.isna(a) else a for a in row], p=float(q)) for row, q in zip(sv[FEATS].values.tolist(), mv.predict(sv[FEATS]))],
               rise=[dict(x=[None if pd.isna(a) else a for a in row], p=float(q)) for row, q in zip(sr[FEATS].values.tolist(), mr.predict_proba(sr[FEATS])[:, 1])]), open(rows + '.check.json', 'w'))
print('written', outp)
