"""Writes frontend/src/hitterData.js: expected-BA grid, percentile pools and run value references for the Hitters tab."""
import sys; sys.path.insert(0,'/home/claude/hit'); sys.path.insert(0,'/home/claude/rv')
import hlib, json, numpy as np, pandas as pd
import sv_live_ref as ref
d=pd.read_parquet('/home/claude/hit/h26x.parquet'); d=d[d.stand.isin(['L','R'])&d.pitcher_hand.isin(['L','R'])].copy()
KEYS=[s for s,_ in hlib.STATS]; DEC={'xwoba':3,'xba':3,'xslg':3}
def qs(s,k):
    s=s.dropna(); return [round(float(v),DEC.get(k,2)) for v in np.quantile(s,np.linspace(0,1,21))] if len(s)>=15 else None
def pool(o,minpa):
    q=o[o.pa>=minpa]; P={'n':int(len(q))}
    for k in KEYS:
        col=q[k].where(q.bbe>=25) if k in('ev','maxev','barrel','hardhit','hhla','gb','fb') else q[k]
        P[k]=qs(col,k)
    return P
# batter class: L / R, or S when he has batted from both sides for at least 10% of his pitches
sh=d.groupby('batter_id').stand.apply(lambda s:(s=='L').mean()); cls=pd.Series(np.where(sh>=0.9,'L',np.where(sh<=0.1,'R','S')),index=sh.index); d['cls']=d.batter_id.map(cls)
POOLS={'all':{},'split':{}}
o=hlib.agg(d,['batter_id']); o['cls']=cls.reindex(o.index)
for c in ('L','R','S'): POOLS['all'][c]=pool(o[o.cls==c],100)
POOLS['all']['A']=pool(o,100)
for st in 'LR':
    POOLS['split'][st]={}
    for ph in 'LR':
        sub=d[(d.stand==st)&(d.pitcher_hand==ph)]; POOLS['split'][st][ph]=pool(hlib.agg(sub,['batter_id']),50)
print('pool sizes: all',{c:POOLS['all'][c]['n'] for c in POOLS['all']},'| split',{st+'v'+ph:POOLS['split'][st][ph]['n'] for st in 'LR' for ph in 'LR'})
print('median xwOBA: all A',POOLS['all']['A']['xwoba'][10],'| LHB vs LHP',POOLS['split']['L']['L']['xwoba'][10],'LHB vs RHP',POOLS['split']['L']['R']['xwoba'][10],'RHB vs LHP',POOLS['split']['R']['L']['xwoba'][10],'RHB vs RHP',POOLS['split']['R']['R']['xwoba'][10])
# ---- run value by pitch type (Savant-style per pitch, batter view: + = good for the hitter) ----
ref.X=json.load(open('/home/claude/rv/live_x_tables.json'))
v=ref.savant_values(d.assign(game_date=d.game_date.astype(str))); d=pd.concat([d,v],axis=1); d=d[d.nv.notna()&d.pitch_type.notna()&(d.pitch_type!='')].copy()
d['bk']=np.where(pd.to_numeric(d.strikes,errors='coerce')==2,'two','pre'); M=['nv','nx','lv','lx']
print('league per 100 (batter view):',{m:round(100*float(d[m].mean()),3) for m in M})
REF={}
for st,ds in d.groupby('stand'):
    REF[st]={}
    for ph,dp in ds.groupby('pitcher_hand'):
        R={}
        for pt,dt in dp.groupby('pitch_type'):
            if len(dt)<1500: continue
            R[pt]={'all':[round(100*float(dt[m].mean()),2) for m in M],'pre':[round(100*float(dt[dt.bk=='pre'][m].mean()),2) for m in M],'two':[round(100*float(dt[dt.bk=='two'][m].mean()),2) for m in M]}
        REF[st][ph]=R
K={}
for m in M:
    K[m]={}
    for bk,sub in (('all',d),('pre',d[d.bk=='pre']),('two',d[d.bk=='two'])):
        g=sub.groupby(['batter_id','stand','pitcher_hand','pitch_type'])[m].agg(['size','mean','var']).reset_index(); lg=sub.groupby(['stand','pitcher_hand','pitch_type'])[m].mean().rename('lg').reset_index()
        g=g[g['size']>=40].merge(lg,on=['stand','pitcher_hand','pitch_type']); g['dev']=g['mean']-g.lg
        sw=np.average(g['var'],weights=g['size']-1); sb=max(np.average(g.dev**2,weights=g['size'])-sw*np.average(1/g['size'],weights=g['size']),1e-9)
        K[m][bk]=[round(100*float(np.sqrt(sb)),2),int(round(sw/sb))]
print('value K',json.dumps(K)); print('RHB vs RHP FF',REF['R']['R']['FF'],'| types per matchup',{st+'v'+ph:sorted(REF[st][ph].keys()) for st in 'LR' for ph in 'LR'})
XB=json.load(open('/home/claude/hit/xbacon.json'))
js="""// Generated (tools/hitters/gen_hitter_data.py) from the 2026 regular season in mlb-pitcher-data.
// XBACON: league batting average on contact by exit velocity (nearest 5 mph, 40-115) and launch angle (nearest 10 deg, -60-80), non-bunt batted balls.
export const XBACON = %s;
export const XBACON_LEAGUE = %s;
// Percentile pools for the Hitters "Results" container: 21 quantiles (0-100%% in 5%% steps) per stat.
// all[L|R|S|A]: hitters with 100+ PA, by the side they bat from (S = switch, A = everyone).
// split[batter side][pitcher hand]: hitters with 50+ PA in that matchup. Contact-quality stats need 25+ batted balls.
export const HIT_POOLS = %s;
// Run value by pitch type for the Hitters "Value" container (Savant-style per-pitch values, + = good for the hitter).
// HIT_VALUE_REF[batter side][pitcher hand][pitch type][all|pre|two] = [neutral RV, neutral xRV, leveraged RV, leveraged xRV], runs per 100 pitches.
// HIT_VALUE_K[nv|nx|lv|lx][all|pre|two] = [spread of true talent among hitters (runs per 100), pitches for half weight] (colour only).
export const HIT_VALUE_REF = %s;
export const HIT_VALUE_K = %s;
""" % (json.dumps(XB['G'],separators=(',',':')),XB['lg'],json.dumps(POOLS,separators=(',',':')),json.dumps(REF,separators=(',',':')),json.dumps(K,separators=(',',':')))
open('/home/claude/pitcher-live-hub/frontend/src/hitterData.js','w').write(js); print(len(js),'bytes')
d[['batter_id','stand','pitcher_hand','pitch_type','bk','nv','nx','lv','lx']].to_parquet('/home/claude/hit/h26_value.parquet')
