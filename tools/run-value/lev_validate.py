import sys; sys.path.insert(0,'/home/claude/rv')
import pandas as pd, numpy as np, json
from solve_lev import prep
from solve_lev2 import solve
r25=prep(2025); r26=prep(2026)
C=json.load(open('/home/claude/rv/lev_consts.json'))
def add(r,y):
    u=np.array(C[str(y)]['u']); RE=np.append(np.array(C[str(y)]['re']),0.0)
    r=r.copy(); r['cn']=-r.delta_run_exp.astype(float); r['L1']=r.cn*u[r.bo.values]
    # actual-outcome version: replace the event-average with what happened to the runners on PA-ending pitches
    act=pd.Series(r.runs.to_numpy(dtype=float)+RE[r.bo_next.values],index=r.index)
    term=(r['last'].fillna(False).astype(bool)&r.events.notna()).to_numpy(dtype=bool, na_value=False)
    avg=act.where(term).groupby([r.events.astype(object).where(term,'~'),r.bo]).transform('mean')
    r['L2']=r.L1-np.where(term,(act-avg).fillna(0.0).to_numpy(),0.0)
    return r
r26=add(r26,2026); r25=add(r25,2025)
r26.to_parquet('/home/claude/rv/sv26.parquet'); r25.to_parquet('/home/claude/rv/sv25.parquet')
X=pd.read_pickle('/home/claude/rv/savant_sheet.pkl')[['pid','pt','pitcher','pitches','cn','lev','ours','oursx','n']].rename(columns={'pitcher':'pname'})
g=r26.groupby(['pitcher','pitch_type']).agg(n2=('balls','size'),cn_s=('cn','sum'),L1=('L1','sum'),L2=('L2','sum')).reset_index()
# park term fitted on the unrounded export (context-neutral): per pitch by home park
S=pd.read_csv('/mnt/user-data/uploads/40a0155c-2026_extra_data.csv')
w=pd.crosstab([r26.pitcher,r26.pitch_type],r26.home_team); parks=list(w.columns); w=w.reset_index()
kk=S.merge(g,left_on=['player_id','pitch_type'],right_on=['pitcher','pitch_type']).merge(w,on=['pitcher','pitch_type']); kk=kk[kk.n2==kk.pitches]
pc,*_=np.linalg.lstsq(kk[parks].values.astype(float),(kk.pitcher_run_exp-kk.cn_s).values,rcond=None); park=pd.Series(pc,index=parks)
json.dump(park.to_dict(),open('/home/claude/rv/park26.json','w'))
r26['pk']=r26.home_team.map(park); gp=r26.groupby(['pitcher','pitch_type']).pk.sum().rename('pk').reset_index()
k=X.merge(g,left_on=['pid','pt'],right_on=['pitcher','pitch_type']).merge(gp,on=['pitcher','pitch_type'])
def rep(a,b,lab):
    v=k[a] if isinstance(a,str) else a; print(f'{lab:44s} r={np.corrcoef(v,k[b])[0,1]:.4f} MAE={np.abs(v-k[b]).mean():.2f} exact={np.mean(v.round()==k[b]):.3f} within1={np.mean(np.abs(v.round()-k[b])<=1):.3f}')
rep('cn_s','cn','sum of per-pitch values vs CN'); rep(k.cn_s+k.pk,'cn','  + park vs CN')
rep('L1','lev','L1 (event average, unscaled) vs Leveraged'); rep(k.L1+k.pk,'lev','  + park'); 
rep('L2','lev','L2 (actual runner outcome) vs Leveraged'); rep(k.L2+k.pk,'lev','  + park')
rep('cn','lev','sheet CN vs sheet Leveraged'); rep('ours','cn','ours (linear weights) vs CN'); rep(k.ours+k.pk,'cn','  ours + park vs CN')
print('lev - cn (sheet) vs L1 - cn_s:',round(np.corrcoef(k.lev-k.cn,k.L1-k.cn_s)[0,1],3),' vs L2 - cn_s:',round(np.corrcoef(k.lev-k.cn,k.L2-k.cn_s)[0,1],3))
print('league means per 100: cn',round(100*r26.cn.mean(),3),'L1',round(100*r26.L1.mean(),3),'L2',round(100*r26.L2.mean(),3))
