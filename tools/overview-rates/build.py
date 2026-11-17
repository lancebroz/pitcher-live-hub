"""League references for the Overview's Rates container, and the count-filter fix for the Compare baselines.

python build.py pitches.parquet        (pitches.parquet comes from prep.py)

1. frontend/src/overviewRatesRef.js
   OV_RATE_REF[season][pitcher hand][pitch type][A|L|R][all|pre|two] = the league's rate for that exact subset
   (all pitches pooled, so it is the number Savant or FanGraphs would show), in OV_RATE_STATS order.
   OV_RATE_K[stat][all|pre|two] = [spread of true talent among pitchers, events for half weight] (colour only).
2. frontend/src/pitchBaselines.js: the rate stats under the count filters (pre2k, two_strikes, ahead, behind, leverage)
   are rebuilt on true pre-pitch counts. The originals came from the parquet feed before its two-strike fouls were
   repaired (they sat in the one-strike bucket), which put the two-strike strike rate at 53% against a real 67%.
   Same shape as before: one row per pitcher, [mean, std, pitchers]. The unfiltered ("all") keys are untouched.
"""
import sys, json, numpy as np, pandas as pd
SRC = __file__.rsplit('/tools/', 1)[0] + '/frontend/src/'
d = pd.read_parquet(sys.argv[1]); d = d[d.p_throws.isin(['L', 'R']) & d.stand.isin(['L', 'R'])].copy()
ip = d.ip == 1
d['gbf'] = (ip & (d.bb_type == 'ground_ball')).astype(int); d['fbf'] = (ip & (d.bb_type == 'fly_ball')).astype(int); d['bbe'] = (ip & (d.bunt != 1)).astype(int)
ls, la = d.launch_speed.astype(float).to_numpy(), d.launch_angle.astype(float).to_numpy()
ev = np.minimum(np.round(np.nan_to_num(ls, nan=0.0)), 116)          # the app picks the window by rounded exit velocity
lo = 26 - (ev - 98); hi = np.select([ev >= 116, ev == 98, ev == 99, ev == 100], [50, 30, 31, 33], default=31 + (ev - 98))
d['brl'] = (ip.to_numpy() & ~np.isnan(ls) & ~np.isnan(la) & (ls >= 98) & (la >= lo) & (la <= hi)).astype(int)
d['one'] = 1; d['st'] = ((d.sw == 1) | (d.cs == 1)).astype(int); d['csw'] = ((d.cs == 1) | (d.wh == 1)).astype(int)
d['oz'] = (d.iz != 1).astype(int); d['ozs'] = d.oz * d.sw; d['izs'] = (d.iz == 1) * d.sw; d['izw'] = (d.iz == 1) * d.wh
# stat -> (numerator, denominator, scale); the definitions are computeMetrics' (App.jsx)
STATS = {'strikeRate': ('st', 'one', 100), 'zoneRate': ('iz', 'one', 100), 'cswRate': ('csw', 'one', 100), 'calledStrikeRate': ('cs', 'one', 100),
         'swStrRate': ('wh', 'one', 100), 'whiffRate': ('wh', 'sw', 100), 'chaseRate': ('ozs', 'oz', 100), 'zoneWhiffRate': ('izw', 'izs', 100),
         'gbRate': ('gbf', 'ip', 100), 'fbRate': ('fbf', 'ip', 100), 'barrelRate': ('brl', 'bbe', 100), 'slg': ('tb', 'ab', 1)}
b, s = d.balls.astype(float), d.strikes.astype(float)
COUNTS = {'all': s >= 0, 'pre2k': s < 2, 'two_strikes': s == 2, 'ahead': ((b == 0) & (s == 1)) | ((b == 0) & (s == 2)) | ((b == 1) & (s == 2)),
          'behind': ((b == 1) & (s == 0)) | ((b == 2) & (s == 0)) | ((b == 3) & (s == 0)) | ((b == 2) & (s == 1)) | ((b == 3) & (s == 1)), 'leverage': ((b == 0) & (s == 0)) | ((b == 1) & (s == 1))}
BK = (('all', 'all'), ('pre', 'pre2k'), ('two', 'two_strikes'))
cols = sorted({c for n, dn, _ in STATS.values() for c in (n, dn)} | {'nc'})

# ── 1. league rate per season x pitcher hand x pitch type x batter side x count bucket ──
ref = {}
for (yr, ph, pt), sub in d.groupby(['season', 'p_throws', 'pitch_type']):
    if len(sub) < 1500: continue
    for side in 'ALR':
        ds = sub if side == 'A' else sub[sub.stand == side]
        if len(ds) < 400: continue
        for bk, cn in BK:
            t = ds[COUNTS[cn].loc[ds.index]][cols].sum()
            row = [None if t[dn] < 100 else round(float(sc * t[n] / t[dn]), 3 if sc == 1 else 1) for n, dn, sc in STATS.values()]
            ref.setdefault(str(yr), {}).setdefault(ph, {}).setdefault(pt, {}).setdefault(side, {})[bk] = row
# talent spread / half-weight sample per stat and bucket (pitcher x season x pitch type x batter side cells)
K = {}
for st, (num, den, sc) in STATS.items():
    K[st] = {}
    for bk, cn in BK:
        sub = d[COUNTS[cn] & (d[den] == 1)]; sub = sub.assign(y=sub[num] * sc)
        g = sub.groupby(['pitcher', 'season', 'pitch_type', 'stand']).y.agg(['size', 'mean', 'var']); lg = sub.groupby(['season', 'p_throws', 'pitch_type', 'stand']).y.mean()
        ph = sub.drop_duplicates('pitcher').set_index('pitcher').p_throws
        g = g[g['size'] >= 20].reset_index(); g['dev'] = g['mean'] - [lg.get((y_, ph[p], t, s_), np.nan) for y_, p, t, s_ in zip(g.season, g.pitcher, g.pitch_type, g.stand)]
        g = g.dropna(subset=['dev', 'var']); sw = np.average(g['var'], weights=g['size'] - 1)
        sb = max(np.average(g.dev ** 2, weights=g['size']) - sw * np.average(1 / g['size'], weights=g['size']), 1e-9)
        K[st][bk] = [round(float(np.sqrt(sb)), 3 if sc == 1 else 2), int(round(sw / sb))]
    print(st, K[st])
open(SRC + 'overviewRatesRef.js', 'w').write(
    "// Generated (tools/overview-rates/build.py). League reference for the Overview's Rates container.\n"
    "// OV_RATE_REF[season][pitcherHand][pitchType][A|L|R batter side][all|pre|two] = league rate for that exact subset, in OV_RATE_STATS order\n"
    "// (percent; SLG as SLG; null where the league has under 100 events).\n"
    "// OV_RATE_K[stat][all|pre|two] = [spread of true talent among pitchers (points; SLG in SLG), events for half weight] (colour only).\n"
    "// Events are the stat's own denominator: pitches, swings, pitches out of the zone, swings in the zone, balls in play, batted balls, at-bats.\n"
    "export const OV_RATE_STATS = " + json.dumps(list(STATS)) + ";\n"
    "export const OV_RATE_REF = " + json.dumps(ref, separators=(',', ':')) + ";\n"
    "export const OV_RATE_K = " + json.dumps(K, separators=(',', ':')) + ";\n")
print('reference cells:', sum(len(c) for y in ref.values() for h in y.values() for t in h.values() for c in t.values()))

# ── 2. Compare baselines under the count filters, on true counts ──
path = SRC + 'pitchBaselines.js'; src = open(path).read(); i = src.index('{', src.index('PITCH_BASELINES')); head, body = src[:i], src[i:].rstrip().rstrip(';')
base = json.loads(body); done = 0
RATE = {k: v for k, v in STATS.items() if k != 'slg'}; RATE['ncRate'] = ('nc', 'one', 100)
for cn in ('pre2k', 'two_strikes', 'ahead', 'behind', 'leverage'):
    dc = d[COUNTS[cn]]
    for ph in 'LR':
        dp = dc[dc.p_throws == ph]
        for bh in ('all', 'L', 'R'):
            db = dp if bh == 'all' else dp[dp.stand == bh]
            for pn, sub in [('ALL', db)] + list(db.groupby('pn')):
                k = f'{pn}|{ph}|{bh}|{cn}'
                if k not in base: continue
                g = sub.groupby('pitcher')[cols].sum(); g = g[g.one >= 20]
                for st, (n, dn, sc) in RATE.items():
                    if st not in base[k]: continue
                    v = (sc * g[n] / g[dn])[g[dn] > 0]
                    if len(v) >= 5: base[k][st] = [round(float(v.mean()), 3), round(float(v.std()), 3), int(len(v))]
                done += 1
open(path, 'w').write(head + json.dumps(base, separators=(',', ':')) + ';\n')
print('count-filter baselines rebuilt:', done, 'keys')
