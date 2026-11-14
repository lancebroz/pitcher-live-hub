import sys; sys.path.insert(0,'/home/claude/hit')
import hlib, numpy as np, pandas as pd, glob
d=hlib.attach_x(pd.read_parquet('/home/claude/hit/h26.parquet')); d.to_parquet('/home/claude/hit/h26x.parquet')
o=hlib.agg(d,['batter_id']); q=o[o.pa>=200]
lg=hlib.agg(d.assign(all=1),['all']).iloc[0]; print('league:',{k:round(float(lg[k]),3) for k,_ in hlib.STATS})
c=['game_pk','batter','events','description','type','woba_value','woba_denom','estimated_woba_using_speedangle','estimated_ba_using_speedangle','estimated_slg_using_speedangle','launch_speed','launch_angle','game_type','zone']
s0=pd.concat([pd.read_parquet(f,columns=c) for f in sorted(glob.glob('/home/claude/dl_statcast/2026/*.parquet'))]); s0=s0[s0.game_type=='R']
s=s0[s0.events.notna()&(s0.events!='')]; s=s[~s.events.isin(['truncated_pa','catcher_interf','intent_walk','sac_bunt','sac_bunt_double_play'])].copy()
bbe=s['type']=='X'; isab=~s.events.isin(['walk','hit_by_pitch','sac_fly','sac_fly_double_play'])
s['xw']=np.where(bbe&s.estimated_woba_using_speedangle.notna(),s.estimated_woba_using_speedangle,s.woba_value); s['xb']=np.where(bbe,s.estimated_ba_using_speedangle.fillna(0),0.0); s['xs']=np.where(bbe,s.estimated_slg_using_speedangle.fillna(0),0.0)
S=s.assign(isab=isab,kk=s.events.isin(['strikeout','strikeout_double_play']),bbb=s.events=='walk').groupby('batter').agg(pa_s=('xw','size'),sxw=('xw','sum'),den=('woba_denom','sum'),sxb=('xb','sum'),sxs=('xs','sum'),ab=('isab','sum'),kk=('kk','sum'),bbb=('bbb','sum'))
S['xwoba_s']=S.sxw/S.den; S['xba_s']=S.sxb/S.ab; S['xslg_s']=S.sxs/S.ab
# plate discipline and contact quality straight from Statcast rows
sw=s0.description.isin(['swinging_strike','swinging_strike_blocked','foul','foul_tip','hit_into_play','foul_bunt','missed_bunt','bunt_foul_tip','swinging_pitchout','foul_pitchout']); wh=s0.description.isin(['swinging_strike','swinging_strike_blocked','foul_tip','missed_bunt','bunt_foul_tip','swinging_pitchout'])
iz=s0.zone.between(1,9); oz=s0.zone.between(11,14); x=s0['type']=='X'
D=s0.assign(sw=sw,wh=sw&wh,iz=iz,oz=oz,ozs=oz&sw,izs=iz&sw,izw=iz&sw&wh,x=x&s0.launch_speed.notna(),hh=x&(s0.launch_speed>=95),evv=s0.launch_speed.where(x)).groupby('batter').agg(n=('sw','size'),sw=('sw','sum'),wh=('wh','sum'),iz=('iz','sum'),oz=('oz','sum'),ozs=('ozs','sum'),izs=('izs','sum'),izw=('izw','sum'),x=('x','sum'),hh=('hh','sum'),ev=('evv','mean'),mx=('evv','max'))
S=S.join(D); S['swing_s']=100*S.sw/S.n; S['chase_s']=100*S.ozs/S.oz; S['contact_s']=100*(1-S.wh/S.sw); S['zswing_s']=100*S.izs/S.iz; S['zcontact_s']=100*(1-S.izw/S.izs); S['hardhit_s']=100*S.hh/S.x; S['ev_s']=S['ev']; S['maxev_s']=S.mx; S['k_s']=100*S.kk/S.pa_s; S['bb_s']=100*S.bbb/S.pa_s
m=q.join(S,how='inner',rsuffix='_raw'); print('compared',len(m),'| PA: ours',int(m.pa.sum()),'Savant (excl. IBB, sac bunts, CI)',int(m.pa_s.sum()))
for a in ('xwoba','xba','xslg','ev','maxev','hardhit','k','bb','swing','chase','contact','zswing','zcontact'):
    b=a+'_s'; print(f'{a:9s} ours {m[a].mean():8.3f}  Savant {m[b].mean():8.3f} | r={np.corrcoef(m[a],m[b])[0,1]:.3f} | MAE {np.abs(m[a]-m[b]).mean():.3f}')
