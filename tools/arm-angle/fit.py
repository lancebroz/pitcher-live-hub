"""Arm angle from release point: how well it tracks Statcast's measured arm angle, and the fit used in the app.

Input: Statcast pitch rows with the measured `arm_angle` column (2025-26 regular season), one parquet per month.
Unit of analysis: a pitcher's primary fastball in one game (15+ pitches), pitchers with 5+ such games.
The app only uses the anchored fit (frontend/src/armAngle.js): his measured arm angle on other days plus what the
day's release-point change implies. Run: STATCAST=<folder with 2025/ 2026/ parquets> HEIGHTS=<mlbam_height.json> python fit.py
"""
import glob, json, os, numpy as np, pandas as pd
from sklearn.model_selection import GroupKFold
SRC=os.environ.get('STATCAST','statcast'); H=json.load(open(os.environ.get('HEIGHTS','mlbam_height.json')))
c=['game_pk','game_date','at_bat_number','pitch_number','pitcher','p_throws','pitch_type','release_pos_x','release_pos_z','release_extension','arm_angle','game_type']
S=pd.concat([pd.read_parquet(x,columns=c).assign(season=int(y)) for y in ('2025','2026') for x in sorted(glob.glob(f'{SRC}/{y}/*.parquet'))],ignore_index=True)
S=S[S.game_type=='R'].drop_duplicates(['game_pk','at_bat_number','pitch_number']); S['gd']=S.game_date.astype(str).str[:10]
d=S.dropna(subset=['arm_angle','release_pos_x','release_pos_z','release_extension','pitch_type']).copy()
d['ht']=d.pitcher.astype(str).map(H).astype(float)/12; d=d[d.ht.notna()]
d['rx']=-d.release_pos_x*np.where(d.p_throws=='L',-1,1); d['rz']=d.release_pos_z; d['ext']=d.release_extension     # rx: arm-side distance, + for both hands
fb=d[d.pitch_type.isin(['FF','SI','FC'])]; prim=fb.groupby(['season','pitcher','pitch_type']).size().reset_index(name='n').sort_values('n').groupby(['season','pitcher']).tail(1)[['season','pitcher','pitch_type']]
p=fb.merge(prim,on=['season','pitcher','pitch_type'])
g=p.groupby(['season','pitcher','gd']).agg(n=('arm_angle','size'),aa=('arm_angle','mean'),rx=('rx','mean'),rz=('rz','mean'),ext=('ext','mean')).reset_index(); g=g[g.n>=15]; g=g[g.groupby(['season','pitcher']).gd.transform('size')>=5].copy()
grp=g.groupby(['season','pitcher'])
for k in ('aa','rx','rz','ext'):      # his usual, leaving this game out
    tot=grp[k].transform(lambda s:(s*g.loc[s.index,'n']).sum()); nn=grp.n.transform('sum'); g['b_'+k]=(tot-g[k]*g.n)/(nn-g.n); g['d_'+k]=g[k]-g['b_'+k]
th=np.radians(g.b_aa); X=np.column_stack([g.d_rz,g.d_rx,g.d_ext,g.d_rz*np.cos(th),g.d_rx*np.sin(th)]); y=g.d_aa.to_numpy(); g['est']=np.nan
for tr,te in GroupKFold(5).split(g,groups=g.pitcher): g.iloc[te,g.columns.get_loc('est')]=X[te]@np.linalg.lstsq(X[tr],y[tr],rcond=None)[0]
b=np.linalg.lstsq(X,y,rcond=None)[0]; mae=lambda a:float(np.abs(a).mean()); e=g.d_aa-g.est; big=g[g.d_aa.abs()>=2]
print('games',len(g),'pitcher-seasons',grp.ngroups)
print('game-to-game movement in measured arm angle: sd %.2f, mean abs %.2f, 90th pct %.2f'%(g.d_aa.std(),mae(g.d_aa),g.d_aa.abs().quantile(.9)))
print('season number on every game: MAE %.2f | anchored estimate (pitcher held out): MAE %.2f, r %.2f, variance explained %.0f%%'%(mae(g.d_aa),mae(e),np.corrcoef(g.est,g.d_aa)[0,1],100*(1-(e**2).mean()/(g.d_aa**2).mean())))
print('games that moved 2+ degrees (%.0f%%): direction right %.0f%%, MAE %.2f vs %.2f'%(100*len(big)/len(g),100*(np.sign(big.est)==np.sign(big.d_aa)).mean(),mae(big.d_aa-big.est),mae(big.d_aa)))
print('coefficients [d_relZ, d_side, d_ext, d_relZ*cos(aa), d_side*sin(aa)]:',[round(float(v),4) for v in b])
