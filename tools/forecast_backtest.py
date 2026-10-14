import json, math, numpy as np, pandas as pd, lightgbm as lgb, sys
import os
S = os.environ.get('DR_DATA', './')  # folder with all-series.json and trends5y.json (from /api/series)
alls = json.load(open(S+'all-series.json'))
tr = json.load(open(S+'trends5y.json')); dates = tr.pop('__dates')
def months_of(vals):
    by = {}
    for d, v in zip(dates, vals):
        if v is None: continue
        by.setdefault(d[:7], []).append(v)
    ks = sorted(by)[1:-1]
    return {k: sum(by[k])/len(by[k]) for k in ks}
T = {k: months_of(v) for k, v in tr.items()}
def ym(y, m): return f"{y}-{m:02d}"
def ymadd(k, d):
    y, m = map(int, k.split('-')); m += d
    while m < 1: m += 12; y -= 1
    while m > 12: m -= 12; y += 1
    return ym(y, m)
L = lambda a, b: math.log((a+10)/(b+10))
rows = []
for sid, s in alls.items():
    if len(s['m']) < 24: continue
    cc = sid.split('|')[0]; y = [x[2] for x in s['m']][-24:]; keys = [ym(x[0], x[1]) for x in s['m']][-24:]
    Tk = T.get(sid)
    for h in range(1, 5):
        for t in range(12, 24-h):
            act = y[t+h]
            if y[t] < 50 and act < 50: continue
            hist = y[:t+1]; med = float(np.median(hist)); mean = float(np.mean(hist))
            r = dict(sid=sid, cc=cc, h=h, t=t, tgt=t+h, y0=y[t], act=act,
                f_naive=y[t], f_season=y[t+h-12], f_blend=(y[t]+y[t+h-12])/2,
                ly0=math.log1p(y[t]), r1=L(y[t-1], y[t]), r2=L(y[t-2], y[t]),
                rs=L(y[t+h-12], y[t]), rsh=L(y[t+h-12], y[t-12]), rshn=L((y[t+h-13]+y[t+h-12]+y[t+h-11])/3, (y[t-13]+y[t-12]+y[t-11])/3),
                yoy3=L(sum(y[t-2:t+1]), sum(y[t-14:t-11])), yoy1=L(y[t], y[t-12]), spike=L(y[t], med), cv=float(np.std(hist)/(mean or 1)),
                ccn={'NL':0,'DE':1,'US':2}[cc])
            # 5 jaar Trends: meerjarig seizoen + nowcast van de maanden die Ads nog niet heeft
            if Tk:
                k0, kt = keys[t], keys[t+h]
                rat = [math.log((Tk[ymadd(kt,-12*b)]+1)/(Tk[ymadd(k0,-12*b)]+1)) for b in range(1,5) if ymadd(kt,-12*b) in Tk and ymadd(k0,-12*b) in Tk]
                r['ms'] = float(np.median(rat)) if len(rat) >= 2 else np.nan
                r['msn'] = len(rat)
                for lag in (1, 2):
                    kl = ymadd(k0, lag)
                    r[f'now{lag}'] = math.log((Tk[kl]+1)/(Tk[k0]+1)) if (lag <= h and kl in Tk and k0 in Tk) else np.nan
            rows.append(r)
df = pd.DataFrame(rows); df['tgtlog'] = np.log((df.act+10)/(df.y0+10))
print('rows', len(df), 'with trends', df.ms.notna().sum())
base = ['ly0','r1','r2','rs','rsh','rshn','yoy3','yoy1','spike','cv','ccn','h']
def fit_pred(train, test, feats, w=True):
    m = lgb.LGBMRegressor(objective='l1', n_estimators=400, learning_rate=0.03, num_leaves=31, min_child_samples=50, subsample=0.8, subsample_freq=1, colsample_bytree=0.8, verbose=-1)
    m.fit(train[feats], train.tgtlog, sample_weight=np.sqrt(train.y0+10) if w else None)
    return (test.y0+10)*np.exp(m.predict(test[feats]))-10, m
def score(name, d, f):
    f = np.maximum(f, 0); a = d.act.values; y0 = d.y0.values
    wape = np.abs(f-a).sum()/a.sum()*100
    up = f/np.maximum(y0,1)-1 > 0.25; g = a/np.maximum(y0,1)-1
    real25 = g > 0.25
    print(f"{name:34s} WAPE {wape:5.1f}%  rise calls {up.sum():5d}  came true >10% {100*(g[up]>0.1).mean():5.1f}%  >25% {100*(g[up]>0.25).mean():5.1f}%  caught {100*(up&real25).sum()/max(real25.sum(),1):5.1f}% of real >25% rises")
def run(df, label, extra=[]):
    tr_, te = df[df.tgt <= 19], df[df.tgt >= 20]
    print(f"\n== {label}: train {len(tr_)} rows, test {len(te)} rows (last 4 months), base rate >25% rise {100*((te.act/te.y0.clip(lower=1)-1)>0.25).mean():.1f}%")
    score('last value', te, te.f_naive.values); score('same month last year', te, te.f_season.values); score('NOW: average of both', te, te.f_blend.values)
    if 'ms' in df and te.ms.notna().any():
        score('multi-year season x level', te, ((te.y0+10)*np.exp(te.ms.fillna(te.rs))-10).values)
    f, m = fit_pred(tr_, te, base); score('ML model across all searches', te, f.values)
    if extra:
        f2, m2 = fit_pred(tr_, te, base+extra); score('ML + 5y Trends + nowcast', te, f2.values)
        imp = sorted(zip(m2.feature_importances_, base+extra), reverse=True)[:8]; print('  top features', imp)
    for h in (1,2,3,4):
        d = te[te.h==h]; fb = d.f_blend.values; fm = (f[te.h==h]).values
        print(f"  h{h}: now {np.abs(fb-d.act).sum()/d.act.sum()*100:5.1f}%  ML {np.abs(np.maximum(fm,0)-d.act).sum()/d.act.sum()*100:5.1f}%")
    return te, f
run(df, 'ALL 4.5k searches')
sub = df[df.ms.notna()].copy()
run(sub, 'searches with 5y Trends', ['ms','msn','now1','now2'])
