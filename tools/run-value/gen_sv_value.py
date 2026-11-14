"""Savant-style run value for the Overview's Value container, from Statcast per-pitch values.
neutral   = Savant context-neutral  (delta_run_exp, pitcher view) + park term
leveraged = neutral / k[base,outs]  (run-expectancy change in the actual base/out state) + park term
expected  = balls in play re-valued by exit velocity and launch angle (outcome mix of that EV/LA cell, priced in the same base/out state)
"""
import sys; sys.path.insert(0,'/home/claude/rv')
import pandas as pd, numpy as np, json
C=json.load(open('/home/claude/rv/lev_consts.json'))
EXPORT={2026:'/mnt/user-data/uploads/40a0155c-2026_extra_data.csv',2025:'/mnt/user-data/uploads/75162bc4-savant_data_16.csv'}
CLS={'single':'1B','double':'2B','triple':'3B','home_run':'HR'}
def build(y):
    r=pd.read_parquet(f'/home/claude/rv/sv{str(y)[2:]}.parquet'); u=np.array(C[str(y)]['u'])
    r=r[r.delta_run_exp.notna()&r.pitch_type.notna()&(r.pitch_type!='')].copy()
    r['v']=r.delta_run_exp.astype(float)                      # batter view, Savant context-neutral
    r['ub']=u[r.bo.values]
    ip=(r['type']=='X').to_numpy(); r['ip']=ip
    r['cls']=np.where(ip,r.events.map(CLS).fillna('OUT'),'')
    r['cnt']=r.balls.astype(int).astype(str)+'-'+r.strikes.astype(int).astype(str)
    return r
R={y:build(y) for y in (2025,2026)}
A=pd.concat(R.values(),ignore_index=True); B=A[A.ip]
# value of each contact class relative to an out, by base/out state (the count term cancels inside a base/out/count cell)
m=B.groupby(['bo','cnt','cls']).v.agg(['mean','size']).reset_index(); o=m[m.cls=='OUT'].rename(columns={'mean':'om','size':'on'})[['bo','cnt','om','on']]
m=m.merge(o,on=['bo','cnt']); m['d']=m['mean']-m.om; m['w']=np.minimum(m['size'],m.on)
Dc=m.groupby(['cls','bo']).apply(lambda g:np.average(g.d,weights=g.w),include_groups=False).unstack('bo').reindex(columns=range(24))
print('class value over an out, by base/out (neutral):'); print(Dc.round(3).to_string())
# outcome mix by exit velocity / launch angle cell (same cells as the app's xwOBAcon grid)
hasx=B.launch_speed.notna()&B.launch_angle.notna(); Bx=B[hasx].copy()
Bx['evb']=(np.floor(Bx.launch_speed.clip(40,115)/5+0.5)*5).astype(int); Bx['lab']=(np.floor(Bx.launch_angle.clip(-60,80)/10+0.5)*10).astype(int)
P=pd.crosstab([Bx.evb,Bx.lab],Bx.cls); tot=P.sum(axis=1); prior=P.sum()/P.sum().sum(); P=(P.add(prior*5,axis=1)).div(tot+5,axis=0)       # light shrink for thin cells
print('cells',len(P),'BIP',len(Bx),'share with EV/LA',round(hasx.mean(),3))
json.dump({'Dc':{c:[round(float(v),4) for v in Dc.loc[c].to_numpy()] for c in ('1B','2B','3B','HR')},'P':{f'{int(e)}|{int(l)}':[round(float(P.loc[(e,l),c]),4) for c in ('1B','2B','3B','HR')] for e,l in P.index}},open('/home/claude/rv/live_x_tables.json','w'))
def xterm(r):
    ip=r.ip.to_numpy(); has=(ip&r.launch_speed.notna().to_numpy()&r.launch_angle.notna().to_numpy())
    evb=(np.floor(r.launch_speed.clip(40,115)/5+0.5)*5); lab=(np.floor(r.launch_angle.clip(-60,80)/10+0.5)*10)
    idx=pd.MultiIndex.from_arrays([evb.fillna(0).astype(int),lab.fillna(0).astype(int)]); Pm=P.reindex(idx)
    exp_over_out=np.zeros(len(r)); act_over_out=np.zeros(len(r)); bo=r.bo.to_numpy()
    for c in ('1B','2B','3B','HR'):
        dv=Dc.loc[c].to_numpy()[bo]; exp_over_out+=np.nan_to_num(Pm[c].to_numpy())*dv; act_over_out+=np.where(r.cls.to_numpy()==c,dv,0.0)
    ok=has&Pm['OUT'].notna().to_numpy()
    return np.where(ok,exp_over_out-act_over_out,0.0)
out={}
for y,r in R.items():
    sw=xterm(r); n_ip=int((r.ip).sum()); off=-sw.sum()/max(int((sw!=0).sum()),1)
    sw=np.where(sw!=0,sw+off,0.0)                                # centre: league expected = league actual
    r['nv']=-r.v; r['nx']=-(r.v+sw); r['lv']=r.nv*r.ub; r['lx']=-(r.v+sw)*r.ub
    # park term: Savant's published totals carry a park adjustment that the per-pitch file does not. Fit it per home park and
    # outcome class so pitcher x pitch-type sums match the published context-neutral totals (unrounded export).
    ev=r.events.fillna('').to_numpy(); ipn=r.ip.to_numpy()
    r['pcl']=np.where(ipn,np.where(ev=='home_run','HR',np.where(np.isin(ev,['single','double','triple']),'H','O')),np.where(np.isin(ev,['strikeout','strikeout_double_play']),'K',np.where(np.isin(ev,['walk','hit_by_pitch']),'BB','n')))
    last=r['last'].to_numpy(); r.loc[~ipn&~last,'pcl']='n'
    key=r.home_team+'_'+r.pcl
    S=pd.read_csv(EXPORT[y]); g=r.groupby(['pitcher','pitch_type']).agg(n=('v','size'),s=('nv','sum')).reset_index()
    w=pd.crosstab([r.pitcher,r.pitch_type],key); parks=list(w.columns); w=w.reset_index()
    k=S.merge(g,left_on=['player_id','pitch_type'],right_on=['pitcher','pitch_type']).merge(w,on=['pitcher','pitch_type']); k=k[(k.n-k.pitches).abs()<=2]
    pc,*_=np.linalg.lstsq(k[parks].values.astype(float),(k.pitcher_run_exp-k.s).values,rcond=None); park=pd.Series(pc,index=parks)
    r['pk']=key.map(park).fillna(0.0)
    # expected versions: EV/LA outcomes are already park-independent, so balls in play with EV/LA carry no park term
    hasx=(sw!=0)|(ipn&r.launch_speed.notna().to_numpy()&r.launch_angle.notna().to_numpy())
    r['pkx']=np.where(hasx,0.0,r.pk)
    r['nv']+=r.pk; r['lv']+=r.pk; r['nx']+=r.pkx; r['lx']+=r.pkx
    # re-centre the expected versions so the league's expected value equals its actual value
    hx=hasx.astype(float); r['nx']+=hx*(r.nv.sum()-r.nx.sum())/hx.sum(); r['lx']+=hx*r.ub*(r.lv.sum()-r.lx.sum())/(hx*r.ub).sum()
    k['fit']=k.s+k[parks].values@pc
    print(y,'pitches',len(r),'x offset per BIP',round(off,4),'| league /100: nv',round(100*r.nv.mean(),3),'nx',round(100*r.nx.mean(),3),'lv',round(100*r.lv.mean(),3),'lx',round(100*r.lx.mean(),3))
    print('   vs Savant export (all pitcher x type rows',len(k),'): r',round(np.corrcoef(k.fit,k.pitcher_run_exp)[0,1],4),'MAE',round((k.fit-k.pitcher_run_exp).abs().mean(),3),'| 200+ pitches: MAE',round((k.fit-k.pitcher_run_exp)[k.pitches>=200].abs().mean(),3),'max',round((k.fit-k.pitcher_run_exp)[k.pitches>=200].abs().max(),2))
    pt=park.rename('v').reset_index(); pt[['park','cl']]=pt['index'].str.split('_',expand=True); print('   park term per 100 events:'); print((100*pt.pivot(index='park',columns='cl',values='v')).round(1).to_string())
    r['bk']=np.where(r.strikes==2,'two','pre'); r['year']=y
    out[y]=r
D=pd.concat(out.values(),ignore_index=True)[['year','game_pk','at_bat_number','pitch_number','pitcher','p_throws','stand','pitch_type','bk','bo','ip','nv','nx','lv','lx','pk','home_team','game_date']]
D.to_parquet('/home/claude/rv/sv_value.parquet'); print('saved',len(D))
