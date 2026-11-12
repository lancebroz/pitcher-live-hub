"""Step 2. Train Location / Stuff / Pitching models and export grades for the Overview tab.

  Location  E[run value | plate location, count, pitch type, pitcher hand, batter side]      (no stuff inputs)
  Stuff     E[run value with the location effect removed | pitch shape]                       (no location, no count)
  Pitching  E[run value | shape + location + count]                                           (one joint model)

Every grade comes from a model that has never seen that pitcher in any season (4 folds, grouped by pitcher),
so a grade reflects only what similar pitches did for other pitchers. See README.md for the tests behind each choice.
Output: grades.json and ../../frontend/src/overviewGrades.js
"""
import json, os, numpy as np, pandas as pd, lightgbm as lgb
OUT_JS=os.environ.get('OUT_JS','../../frontend/src/overviewGrades.js')
D=pd.read_parquet('all.parquet'); D=D[D.reg].reset_index(drop=True)
D['ph']=(D.pitcher_hand=='R').astype(int)
BASE=["start_speed","ivb","hb","rel_side","release_z","extension","spin_rate","velo_diff","ivb_diff","hb_diff","arm_angle","ptc","same_side"]
STUFF=BASE+["vaa_n","haa_n","axis_dev","spin_axis","mov_per_rpm","ph"]
LOCF=["px_b","pz","pz_n","balls","strikes"]
CAT=['ptc','same_side']
P_LOC=dict(objective="regression",learning_rate=0.05,num_leaves=63,min_child_samples=400,feature_fraction=0.9,bagging_fraction=0.8,bagging_freq=1,lambda_l2=5.0,seed=42,verbose=-1)
P_STUFF=dict(objective="regression",learning_rate=0.03,num_leaves=31,min_child_samples=2000,feature_fraction=0.7,bagging_fraction=0.8,bagging_freq=1,lambda_l2=10.0,seed=42,verbose=-1)
P_JOINT=dict(objective="regression",learning_rate=0.05,num_leaves=63,min_child_samples=600,feature_fraction=0.8,bagging_fraction=0.8,bagging_freq=1,lambda_l2=5.0,seed=42,verbose=-1)
def fit(feats,y,mask,params,rounds):
    return lgb.train(params,lgb.Dataset(D.loc[mask,feats],label=D.loc[mask,y].astype(float),categorical_feature=[c for c in CAT if c in feats]),num_boost_round=rounds)
# --- Location: pitcher-held-out (4 folds) ---
rng=np.random.default_rng(7); pid=D.pitcher_id.unique(); D['fold']=D.pitcher_id.map(pd.Series(rng.integers(0,4,len(pid)),index=pid)).values
D['loc']=np.nan
for k in range(4):
    m=fit(LOCF+['ptc','same_side','ph'],'rv',(D.fold!=k).values,P_LOC,450); D.loc[D.fold==k,'loc']=m.predict(D.loc[D.fold==k,LOCF+['ptc','same_side','ph']]); print('location fold',k,flush=True)
D['T']=D.groupby(['ptc','ph','same_side']).rv.transform('mean')                       # pitch-type x platoon value
D['B']=D.groupby(['ptc','ph','same_side','balls','strikes'])['loc'].transform('mean')   # average location value in that context
D['loc_val']=D['loc']-D['B']                                                           # location value vs league for the same pitch type / count / hands
D['stuff_y']=D.rv-D['loc']+D['T']                                                      # run value with the location (and count) effect taken out
# --- Stuff and Pitching: pitcher-held-out (same folds) ---
D['st']=np.nan; D['pj']=np.nan
for k in range(4):
    tr=(D.fold!=k).values; sc=(D.fold==k).values
    D.loc[sc,'st']=fit(STUFF,'stuff_y',tr,P_STUFF,500).predict(D.loc[sc,STUFF])
    D.loc[sc,'pj']=fit(STUFF+LOCF,'rv',tr,P_JOINT,450).predict(D.loc[sc,STUFF+LOCF]); print('stuff + pitching fold',k,flush=True)
D['pit']=D.pj-(D.B-D['T'])
y=D.rv.astype(float); r2=lambda p: round(float(1-np.mean((y-p)**2)/np.var(y)),5)
print('pitch-level R2: location',r2(D['loc']),'| pitching',r2(D.pj),'| stuff (vs location-neutral target)',round(float(1-np.mean((D.stuff_y-D.st)**2)/np.var(D.stuff_y)),5))
# --- grades ---
PTS=10/0.45       # 10 points = 0.45 runs per 100 pitches, on all three grades
M=(('s','st'),('l','loc_val'),('p','pit'))
def kconst(col,keys,minn=60):
    g=D.groupby(keys)[col].agg(['size','mean','var']); g=g[g['size']>=minn]; sw=np.average(g['var'],weights=g['size']-1); sb=g['mean'].var()-np.mean(sw/g['size']); return max(sw/sb,1.0)
LV=(('all',['pitcher_id','season']),('side',['pitcher_id','season','stand']),('type',['pitcher_id','season','pitch_type']),('typeside',['pitcher_id','season','pitch_type','stand']))
KC={m:{lvl:kconst(col,keys) for lvl,keys in LV} for m,col in M}
print('sample-size regression constants (pitches):',{m:{k:round(v) for k,v in d.items()} for m,d in KC.items()})
out={}; lg={}
for yv in (2025,2026):
    X=D[D.season==yv]; mu={m:X[col].mean() for m,col in M}; tmu=X.groupby('pitch_type')[['st','loc_val','pit']].mean()
    def g(sub,lvl,base):
        n=len(sub)
        if n<25: return None
        return [int(round(100-PTS*100*(((sub[col].mean()-base[m])*n/(n+KC[m][lvl])+base[m])-mu[m]))) for m,col in M]+[int(n)]
    Y={}
    for p,P in X.groupby('pitcher_id'):
        A=g(P,'all',mu)
        if A is None: continue
        e={'a':A,'L':g(P[P.stand=='L'],'side',mu),'R':g(P[P.stand=='R'],'side',mu),'t':{}}
        for pt,Pt in P.groupby('pitch_type'):
            base={'s':tmu.loc[pt,'st'],'l':tmu.loc[pt,'loc_val'],'p':tmu.loc[pt,'pit']}; c0=g(Pt,'type',base)
            if c0: e['t'][pt]=[c0,g(Pt[Pt.stand=='L'],'typeside',base),g(Pt[Pt.stand=='R'],'typeside',base)]
        Y[str(int(p))]=e
    out[str(yv)]=Y
    big=[v['a'] for v in Y.values() if v['a'][3]>=600]; L={'all':{m:[100,round(float(np.std([b[i] for b in big])),1)] for i,(m,_) in enumerate(M)},'t':{}}
    for pt in tmu.index:
        cells=[v['t'][pt][0] for v in Y.values() if pt in v['t'] and v['t'][pt][0][3]>=150]
        if len(cells)>=8: L['t'][pt]={m:[int(round(100-PTS*100*(tmu.loc[pt,col]-mu[m]))),round(float(np.std([c_[i] for c_ in cells])),1)] for i,(m,col) in enumerate(M)}
    lg[str(yv)]=L; print(yv,'pitchers graded',len(Y),flush=True)
json.dump({'grades':out,'league':lg},open('grades.json','w'),separators=(',',':'))
D[['pitcher_id','season','pitch_type','stand','rv','st','loc_val','pit','pj']].to_parquet('scored_final.parquet')
open(OUT_JS,'w').write("// Generated by tools/pitch-grades (see README there). Stuff+ / Location+ / Pitching+ for 2025 and 2026.\n// Per pitcher: a / L / R = [Stuff+, Location+, Pitching+, pitches] overall / vs LHH / vs RHH; t[pitchType] = [all, vsL, vsR] of the same.\n// 100 = league-average pitch that season; 10 points = 0.45 runs per 100 pitches on all three; small samples are regressed toward average.\n// OV_GRADES_LG[year].t[pitchType][metric] = [league mean for that pitch type, spread among pitchers] (used for colour).\nexport const OV_GRADES = "+json.dumps(out,separators=(',',':'))+";\nexport const OV_GRADES_LG = "+json.dumps(lg,separators=(',',':'))+";\n")
print('wrote',OUT_JS)
