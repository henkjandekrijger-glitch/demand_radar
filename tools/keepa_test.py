# Toets: maakt Amazon-historie uit Keepa (gekocht vorige maand, verkooprang) de voorspelling van zoekvolume beter?
#   python3 tools/keepa_test.py kp-DE.json,kp-US.json keepa-DE.json,keepa-US.json [cut=2025-10]
#   kp-<cc>.json   = /api/early?op=keepa&pick=<cc>&n=2000 (zoekreeksen, 4 jaar)
#   keepa-<cc>.json = /api/early?op=keepa&data=<cc> (Keepa-maandreeksen per zoekterm)
# Zelfde opzet als tools/driver_test.py: leren op doelmaanden vóór 'cut', toetsen erna, met en zonder de Keepa-kenmerken.
# Keepa-kenmerken gebruiken alleen maanden vóór 'nu' (t-1 en eerder). Alleen zoektermen waar Amazon echt over het product gaat
# (een woord van de zoekterm staat in de titels van de topproducten) tellen als 'productterm'.
# Eerlijkheid: de producten zijn de topproducten van oktober 2026. Hun verleden is dus niet blind gekozen (overlevers);
# daarom ook een toets met een vroege grens (cut=2025-04), ver vóór het moment van kiezen.
import sys, json, math, re, numpy as np, pandas as pd, lightgbm as lgb
S, K = {}, {}
for f in sys.argv[1].split(','):
    j = json.load(open(f)); cc = j['cc']
    for k, v in j['series'].items(): S[f'{cc}|{k}'] = v
for f in sys.argv[2].split(','):
    cc = re.search(r'-([A-Z]{2})\.json$', f).group(1)
    for k, v in json.load(open(f)).items(): K[f'{cc}|{k}'] = v
cut = sys.argv[3] if len(sys.argv) > 3 else '2025-10'
def ym(y, m): return f"{y}-{m:02d}"
def add(k, d):
    y, m = map(int, k.split('-')); m += d
    while m < 1: m += 12; y -= 1
    while m > 12: m -= 12; y += 1
    return ym(y, m)
def relevant(sid, kp):
    words = [w for w in re.split(r'[^a-z0-9äöüß]+', sid[3:].lower()) if len(w) >= 4]
    titles = ' '.join(t.get('title', '') for t in kp.get('top', [])).lower()
    return bool(words) and any(w in titles for w in words)
L = lambda a, b: math.log((a + 10) / (b + 10))
def lr(s, a, b):
    x, y = s.get(a), s.get(b)
    return math.log((x + 1) / (y + 1)) if x is not None and y is not None else np.nan
rows = []
for sid, s in S.items():
    m = sorted(s['m']); y = [x[2] for x in m]; keys = [ym(x[0], x[1]) for x in m]
    kp = K.get(sid) or {}; sold, rank = kp.get('sold') or {}, kp.get('rank') or {}
    prod = bool(kp) and not kp.get('error') and relevant(sid, kp)
    cc = sid[:2]
    for t in range(24, len(y) - 1):
        for h in range(1, 4):
            if t + h >= len(y): break
            act = y[t + h]
            if y[t] < 50 and act < 50: continue
            k1 = add(keys[t], -1)
            r = dict(sid=sid, prod=prod, shift=bool(s.get('shift')), tgt=keys[t + h], y0=y[t], act=act, h=h, ly0=math.log1p(y[t]), r1=L(y[t - 1], y[t]), r2=L(y[t - 2], y[t]),
                     rs=L(y[t + h - 12], y[t]), rs2=L(y[t + h - 24], y[t - 12]), rsh=L(y[t + h - 12], y[t - 12]), yoy3=L(sum(y[t - 2:t + 1]), sum(y[t - 14:t - 11])),
                     yoy1=L(y[t], y[t - 12]), spike=L(y[t], float(np.median(y[:t + 1]))), cc={'DE': 1, 'US': 2, 'NL': 0}.get(cc, 3), tm=int(keys[t + h][5:]),
                     # Keepa: gekocht en verkooprang, t.o.v. een jaar eerder en t.o.v. 3 maanden eerder (alleen verleden)
                     ksy=lr(sold, k1, add(k1, -12)), ks3=lr(sold, k1, add(k1, -3)), ksh=lr(sold, add(k1, h - 11), add(k1, -11)),
                     kry=-lr(rank, k1, add(k1, -12)), kr3=-lr(rank, k1, add(k1, -3)), krh=-lr(rank, add(k1, h - 11), add(k1, -11)))
            rows.append(r)
df = pd.DataFrame(rows)
BASE = ['h', 'ly0', 'r1', 'r2', 'rs', 'rs2', 'rsh', 'yoy3', 'yoy1', 'spike', 'cc', 'tm']
KEE = ['ksy', 'ks3', 'ksh', 'kry', 'kr3', 'krh']
df['y'] = np.log((df.act + 10) / (df.y0 + 10))
P = dict(objective='l1', n_estimators=300, learning_rate=0.05, num_leaves=31, min_child_samples=40, subsample=0.8, subsample_freq=1, colsample_bytree=0.8, verbose=-1)
tr, te = df[df.tgt < cut], df[df.tgt >= cut]
wape = lambda f, d: round(float(np.abs(f - d.act).sum() / max(d.act.sum(), 1) * 100), 2)
out = dict(cut=cut, terms=int(df.sid.nunique()), product_terms=int(df[df.prod].sid.nunique()), test_rows=int(len(te)))
for name, feats in [('without_keepa', BASE), ('with_keepa', BASE + KEE)]:
    preds = []
    for seed in range(3):
        mdl = lgb.LGBMRegressor(**P, random_state=seed).fit(tr[feats], tr.y, sample_weight=np.sqrt(tr.y0 + 10))
        preds.append(np.maximum((te.y0 + 10) * np.exp(mdl.predict(te[feats])) - 10, 0))
    f = np.mean(preds, axis=0); p, sh = te['prod'].values, te['shift'].values
    out[name] = dict(all=wape(f, te), product=wape(f[p], te[p]), product_shift=wape(f[p & sh], te[p & sh]), product_stable=wape(f[p & ~sh], te[p & ~sh]))
print(json.dumps(out, indent=1))
