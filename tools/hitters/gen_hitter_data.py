"""Writes frontend/src/hitterData.js: expected-BA grid, percentile pools, run value references and the first-load pool for the Hitters tab.
2026 comes from mlb-pitcher-data (what the app reads for the current season); 2025 from Statcast rows (what the app gets from Savant for a past season)."""
import sys; sys.path.insert(0,'/home/claude/hit'); sys.path.insert(0,'/home/claude/rv')
import hlib, json, numpy as np, pandas as pd
import sv_live_ref as ref
ref.X=json.load(open('/home/claude/rv/live_x_tables.json'))
KEYS=[s for s,_ in hlib.STATS]; DEC={'xwoba':3,'xba':3,'xslg':3}; M=['nv','nx','lv','lx']
def qs(s,k):
    s=s.dropna(); return [round(float(v),DEC.get(k,2)) for v in np.quantile(s,np.linspace(0,1,21))] if len(s)>=15 else None
def pool(o,minpa):
    q=o[o.pa>=minpa]; P={'n':int(len(q))}
    for k in KEYS: P[k]=qs(q[k].where(q.bbe>=25) if k in('ev','maxev','barrel','hardhit','hhla','gb','fb') else q[k],k)
    return P
POOLS={};REF={};KK={};USE={}
for y in (2025,2026):
    d=pd.read_parquet(f'/home/claude/hit/h{str(y)[2:]}x.parquet'); d=d[d.stand.isin(['L','R'])&d.pitcher_hand.isin(['L','R'])].copy()
    P={'all':pool(hlib.agg(d,['batter_id']),100),'split':{}}          # "All" ranks against every hitter, whatever side he bats from
    for st in 'LR':
        P['split'][st]={ph:pool(hlib.agg(d[(d.stand==st)&(d.pitcher_hand==ph)],['batter_id']),50) for ph in 'LR'}
    POOLS[str(y)]=P
    print(y,'pool sizes: all',P['all']['n'],'| split',{st+'v'+ph:P['split'][st][ph]['n'] for st in 'LR' for ph in 'LR'},'| median xwOBA',P['all']['xwoba'][10],'chase',P['all']['chase'][10],'EV',P['all']['ev'][10])
    # pitch usage against hitters: league share of each pitch type by batter side x pitcher hand x count bucket, and how far
    # hitters truly differ from it (spread of hitter shares with the binomial noise taken out), in percentage points
    u=d[d.pitch_type.notna()&(d.pitch_type!='')].copy(); u['bk']=np.where(pd.to_numeric(u.strikes,errors='coerce')==2,'two','pre'); U={}
    for (st,ph),g in u.groupby(['stand','pitcher_hand']):
        big=g.pitch_type.value_counts(); big=list(big[big>=1500].index); U.setdefault(st,{})[ph]={}
        for bk,gb in (('all',g),('pre',g[g.bk=='pre']),('two',g[g.bk=='two'])):
            tot=gb.groupby('batter_id').size(); tot=tot[tot>=200]; o={}
            for pt in big:
                lg=float((gb.pitch_type==pt).mean()); c=gb[gb.pitch_type==pt].groupby('batter_id').size().reindex(tot.index).fillna(0); sh=c/tot
                var=np.average((sh-lg)**2,weights=tot)-np.average(lg*(1-lg)/tot,weights=tot)
                o[pt]=[round(100*lg,2),round(100*float(np.sqrt(max(var,1e-8))),2)]
            U[st][ph][bk]=o
    USE[str(y)]=U; print('   usage ref (RHB vs RHP, overall):',U['R']['R']['all'])
    # run value by pitch type, batter view (+ = good for the hitter)
    v=ref.savant_values(d.assign(game_date=d.game_date.astype(str)), own=(d.dre if 'dre' in d.columns else None)); d=pd.concat([d,v],axis=1); d=d[d.nv.notna()&d.pitch_type.notna()&(d.pitch_type!='')].copy()
    d['bk']=np.where(pd.to_numeric(d.strikes,errors='coerce')==2,'two','pre')
    print('   league value per 100:',{m:round(100*float(d[m].mean()),3) for m in M})
    R={}
    for st,ds in d.groupby('stand'):
        R[st]={}
        for ph,dp in ds.groupby('pitcher_hand'):
            R[st][ph]={pt:{'all':[round(100*float(dt[m].mean()),2) for m in M],'pre':[round(100*float(dt[dt.bk=='pre'][m].mean()),2) for m in M],'two':[round(100*float(dt[dt.bk=='two'][m].mean()),2) for m in M]} for pt,dt in dp.groupby('pitch_type') if len(dt)>=1500}
    REF[str(y)]=R; K={}
    for m in M:
        K[m]={}
        for bk,sub in (('all',d),('pre',d[d.bk=='pre']),('two',d[d.bk=='two'])):
            g=sub.groupby(['batter_id','stand','pitcher_hand','pitch_type'])[m].agg(['size','mean','var']).reset_index(); lg=sub.groupby(['stand','pitcher_hand','pitch_type'])[m].mean().rename('lg').reset_index()
            g=g[g['size']>=40].merge(lg,on=['stand','pitcher_hand','pitch_type']); g['dev']=g['mean']-g.lg
            sw=np.average(g['var'],weights=g['size']-1); sb=max(np.average(g.dev**2,weights=g['size'])-sw*np.average(1/g['size'],weights=g['size']),1e-9); K[m][bk]=[round(100*float(np.sqrt(sb)),2),int(round(sw/sb))]
    KK[str(y)]=K; print('   value K',json.dumps(K))
    d[['batter_id','stand','pitcher_hand','pitch_type','bk','nv','nx','lv','lx']].to_parquet(f'/home/claude/hit/h{str(y)[2:]}_value.parquet')
# first-load pool: 2026 hitters with 300+ PA
d=pd.read_parquet('/home/claude/hit/h26x.parquet'); pa=d.groupby('batter_id').pa.sum(); ids=pa[pa>=300].index
sh=d[d.batter_id.isin(ids)].groupby('batter_id').stand.apply(lambda s:(s=='L').mean()); nm=d[d.batter_id.isin(ids)].groupby('batter_id').batter_name.agg(lambda s:s.mode().iat[0]); tm=d[d.batter_id.isin(ids)].sort_values('game_date').groupby('batter_id').bat_team.last()
RP=[[int(i),nm[i],tm[i],('L' if sh[i]>=0.9 else 'R' if sh[i]<=0.1 else 'S')] for i in ids]; print('first-load pool',len(RP),RP[:3])
XB=json.load(open('/home/claude/hit/xbacon.json'))
js="""// Generated (tools/hitters/gen_hitter_data.py). 2026 from mlb-pitcher-data, 2025 from Statcast rows; regular season.
// XBACON: league batting average on contact by exit velocity (nearest 5 mph, 40-115) and launch angle (nearest 10 deg, -60-80), non-bunt batted balls.
export const XBACON = %s;
export const XBACON_LEAGUE = %s;
// Percentile pools for the Hitters "Results" container: 21 quantiles (0-100%% in 5%% steps) per stat, by season.
// all: every hitter with 100+ PA. split[batter side][pitcher hand]: hitters with 50+ PA in that matchup.
// Contact-quality stats need 25+ batted balls.
export const HIT_POOLS = %s;
// Run value by pitch type for the Hitters "Value" container (Savant-style per-pitch values, + = good for the hitter), by season.
// HIT_VALUE_REF[year][batter side][pitcher hand][pitch type][all|pre|two] = [neutral RV, neutral xRV, leveraged RV, leveraged xRV], runs per 100 pitches.
// HIT_VALUE_K[year][nv|nx|lv|lx][all|pre|two] = [spread of true talent among hitters (runs per 100), pitches for half weight] (colour only).
export const HIT_VALUE_REF = %s;
export const HIT_VALUE_K = %s;
// Pitch usage against hitters, by season. HIT_USAGE_REF[year][batter side][pitcher hand][all|pre|two][pitch type] =
// [league share of pitches (%%), spread of true hitter-to-hitter differences in that share (points)].
export const HIT_USAGE_REF = %s;
// Hitters with 300+ PA in 2026, for the random first load: [id, name, team, bats].
export const HIT_RANDOM_POOL = %s;
""" % (json.dumps(XB['G'],separators=(',',':')),XB['lg'],json.dumps(POOLS,separators=(',',':')),json.dumps(REF,separators=(',',':')),json.dumps(KK,separators=(',',':')),json.dumps(USE,separators=(',',':')),json.dumps(RP,separators=(',',':'),ensure_ascii=False))
open('/home/claude/pitcher-live-hub/frontend/src/hitterData.js','w').write(js); print(len(js),'bytes')
