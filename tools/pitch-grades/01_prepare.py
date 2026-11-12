"""Step 1. Build one modelling table for 2023-2026: per-pitch run value + stuff / location features.

Inputs (edit the paths below):
  SRC  - monthly parquets from lancebroz/mlb-pitcher-data (data/raw/<year>/monthly/*.parquet), one folder per season
  REPO - a checkout of lancebroz/stuff-plus-repo (Savant arm-angle exports, arm-angle imputer, heights)
Output: all.parquet, re_by_count.json, ev_la_rv.txt
Run value construction is the same as stuff-plus-repo/scripts/01_run_values.py (count run-expectancy deltas,
balls in play valued by exit velocity + launch angle).
"""
import glob, json, numpy as np, pandas as pd, lightgbm as lgb
import os
DATA=os.environ.get('PITCH_DATA','data')            # folder holding 2023/ 2024/ 2025/ 2026/ monthly parquets
SRC={y:f'{DATA}/{y}' for y in (2023,2024,2025,2026)}
REPO=os.environ.get('STUFF_REPO','stuff-plus-repo')
COLS=["game_pk","game_date","at_bat_number","pitch_number","balls","strikes","count","pitch_type","pitcher_id","pitcher_name","pitcher_hand","stand",
      "events","call_description","is_in_play","launch_speed","launch_angle","start_speed","pfx_x","pfx_z","release_x","release_z","extension","spin_rate","spin_direction",
      "vx0","vy0","vz0","ax","ay","az","plate_x","plate_z","sz_top","sz_bottom","zone"]
fr=[]
for y,d in SRC.items():
    for f in sorted(glob.glob(d+'/*.parquet')):
        x=pd.read_parquet(f,columns=COLS); x=x[x.game_pk!=0]; x['season']=y; fr.append(x)
df=pd.concat(fr,ignore_index=True); del fr
df['gd']=df.game_date.astype(str)
df['reg']=df.gd.str[5:]<='09-30'
print(len(df),df.season.value_counts().sort_index().to_dict(),'spin_dir null by season',df.groupby('season').spin_direction.apply(lambda s:s.isna().mean()).round(3).to_dict())
# ---------- run values (same construction as stuff-plus-repo 01_run_values.py, refit on 2023-2025) ----------
EVENT_RUNS={"strikeout":-0.27,"strikeout_double_play":-0.27,"walk":0.32,"intent_walk":0.32,"hit_by_pitch":0.34,"single":0.47,"double":0.77,"triple":1.05,"home_run":1.37,
 "field_out":-0.27,"force_out":-0.27,"grounded_into_double_play":-0.45,"double_play":-0.45,"fielders_choice_out":-0.27,"fielders_choice":-0.27,"sac_fly":-0.20,"sac_bunt":-0.21,
 "field_error":0.30,"catcher_interf":0.32,"strikeout_triple_play":-0.27}
BIP={"single","double","triple","home_run","field_out","force_out","grounded_into_double_play","double_play","fielders_choice","fielders_choice_out","sac_fly","sac_bunt","field_error"}
df=df.drop_duplicates(['game_pk','at_bat_number','pitch_number']).sort_values(['game_pk','at_bat_number','pitch_number']).reset_index(drop=True)
df['events']=df.events.where(df.events.fillna('')!='',None)
tr=df.season<=2025
bip=(df.is_in_play==True)&df.events.isin(BIP)&df.launch_speed.notna()&df.launch_angle.notna()
m=lgb.train(dict(objective='regression',learning_rate=0.05,num_leaves=31,min_child_samples=200,verbose=-1,num_threads=2),
            lgb.Dataset(df.loc[bip&tr,['launch_speed','launch_angle']].values,label=df.loc[bip&tr,'events'].map(EVENT_RUNS).astype(float).values),num_boost_round=300)
m.save_model('ev_la_rv.txt')
df['ev_runs']=df.events.map(EVENT_RUNS)
# terminal row of the PA = last pitch of the PA (events are only set on the PA-ending pitch here; guard both layouts)
last=df.groupby(['game_pk','at_bat_number']).pitch_number.transform('max')==df.pitch_number
term=last&df.events.notna()
pa=df[term].drop_duplicates(['game_pk','at_bat_number']).set_index(['game_pk','at_bat_number']).ev_runs
df=df.join(pa.rename('pa_runs'),on=['game_pk','at_bat_number'])
tr=df.season<=2025
re_count=df[tr].groupby('count').pa_runs.mean().to_dict(); json.dump(re_count,open('re_by_count.json','w'))
print('RE by count',{k:round(v,3) for k,v in sorted(re_count.items())})
df['re_before']=df['count'].map(re_count)
df['re_next']=df.groupby(['game_pk','at_bat_number'])['count'].shift(-1).map(re_count)
ev=df.ev_runs.astype(float).copy(); ev[bip]=m.predict(df.loc[bip,['launch_speed','launch_angle']].values)
rv=np.where(term,ev-df.re_before,df.re_next-df.re_before); rv=np.where(~term&df.re_next.isna(),0.0,rv)
df['rv']=rv
print('rv mean',np.nanmean(rv).round(4),'sd',np.nanstd(rv).round(4),'null',int(np.isnan(rv).sum()))
# outcome class for component models
cd=df.call_description.fillna('').str.lower()
df['swing']=cd.str.contains('swinging|foul|hit_into_play|missed_bunt|bunt_foul')
df['whiff']=cd.str.contains('swinging_strike|foul_tip|missed_bunt')
df['inplay']=df.is_in_play==True
df['cstrike']=cd.eq('called_strike'); df['ball']=cd.str.contains('^ball|blocked_ball|hit_by_pitch|pitchout')
print('outcome shares',{k:round(float(df[k].mean()),3) for k in ('swing','whiff','inplay','cstrike','ball')})
# ---------- features ----------
MODELED=["FF","SI","SL","CH","ST","FC","CU","FS","KC","SV"]
df=df[df.pitch_type.isin(MODELED)&df.pitcher_hand.isin(['L','R'])&df.stand.isin(['L','R'])].copy()
need=["start_speed","pfx_x","pfx_z","release_x","release_z","extension","spin_rate","vx0","vy0","vz0","ax","ay","az","rv"]
df=df.dropna(subset=need)
sgn=np.where(df.pitcher_hand=='L',-1.0,1.0)
df['ivb']=df.pfx_z*12; df['hb']=df.pfx_x*12*sgn; df['rel_side']=df.release_x*sgn
df['ax_m']=df.ax*sgn; df['same_side']=(df.pitcher_hand==df.stand).astype(int)
# location-neutral approach angles: same release point / speed / accelerations, aimed at the middle of the zone
y0,yp=50.0,17/12
t=(-df.vy0-np.sqrt(df.vy0**2-2*df.ay*(y0-yp)))/df.ay
vz_n=(2.5-df.release_z-0.5*df.az*t*t)/t; vx_n=(0-df.release_x-0.5*df.ax*t*t)/t
vyf=df.vy0+df.ay*t
df['vaa_n']=np.degrees(np.arctan((vz_n+df.az*t)/-vyf)); df['haa_n']=np.degrees(np.arctan((vx_n+df.ax*t)/-vyf))*sgn
df['flight']=t
# actual approach angles (location-dependent; for the pitching model only)
df['vaa']=np.degrees(np.arctan((df.vz0+df.az*t)/-vyf)); df['haa']=np.degrees(np.arctan((df.vx0+df.ax*t)/-vyf))*sgn
# spin axis vs movement axis (seam-shifted-wake proxy) and movement per rpm (spin-efficiency proxy)
sd=df.spin_direction.where(df.spin_direction.between(0,360))
sd_m=np.where(df.pitcher_hand=='L',(360-sd)%360,sd)
mov_axis=(np.degrees(np.arctan2(df.ivb,-df.hb))+90)%360    # clock-style: 180 = pure backspin (ball rises), in RHP frame
df['spin_axis']=sd_m; df['mov_axis']=mov_axis
dev=(sd_m-mov_axis+180)%360-180; df['axis_dev']=dev
df['mov_per_rpm']=np.hypot(df.ivb,df.hb)/df.spin_rate.clip(lower=300)*1000
# arm angle: Savant optical by pitcher x season x pitch type, pitcher-season fallback, else the repo's imputer
aa=[]
for y in (2024,2025,2026):
    a=pd.read_csv(f'{REPO}/data/{y} arm angle.csv',encoding='utf-8-sig',usecols=['player_id','pitch_type','arm_angle','pitches']); a['season']=y; aa.append(a)
aa=pd.concat(aa); aa['arm_angle']=pd.to_numeric(aa.arm_angle,errors='coerce'); aa=aa.dropna(subset=['arm_angle'])
df=df.merge(aa.rename(columns={'player_id':'pitcher_id','arm_angle':'aa_pt'})[['pitcher_id','season','pitch_type','aa_pt']],on=['pitcher_id','season','pitch_type'],how='left')
ps=aa.groupby(['player_id','season']).apply(lambda g:np.average(g.arm_angle,weights=g.pitches)).rename('aa_ps').reset_index().rename(columns={'player_id':'pitcher_id'})
df=df.merge(ps,on=['pitcher_id','season'],how='left')
imp=json.load(open(f'{REPO}/models/imputer_v2.json')); H=json.load(open(f'{REPO}/data/mlbam_height.json'))
ht=df.pitcher_id.astype(str).map(H).astype(float)/12; ht=ht.fillna(ht.mean())
aa_imp=(imp['intercept']+imp['rel_z']*df.release_z+imp['height_ft']*ht+imp['abs_rel_side']*df.rel_side.abs()+imp['ext']*df.extension).clip(-10,90)
df['arm_angle']=df.aa_pt.fillna(df.aa_ps).fillna(aa_imp); df['aa_src']=np.where(df.aa_pt.notna(),0,np.where(df.aa_ps.notna(),1,2))
print('arm angle source share by season',df.groupby('season').aa_src.value_counts(normalize=True).round(2).unstack().to_dict('index'))
# primary fastball per pitcher-season, differentials
cnt=df.groupby(['pitcher_id','season','pitch_type']).size().rename('n').reset_index()
def prim(g):
    fb=g[g.pitch_type.isin(['FF','SI','FC'])]; return (fb if len(fb) else g).sort_values('n',ascending=False).pitch_type.iloc[0]
pf=cnt.groupby(['pitcher_id','season']).apply(prim).rename('prim_fb').reset_index()
df=df.merge(pf,on=['pitcher_id','season'],how='left')
fb=df[df.pitch_type==df.prim_fb].groupby(['pitcher_id','season']).agg(fb_velo=('start_speed','mean'),fb_ivb=('ivb','mean'),fb_hb=('hb','mean'),fb_ax=('ax_m','mean'),fb_az=('az','mean'),fb_vaa=('vaa_n','mean'),fb_haa=('haa_n','mean')).reset_index()
df=df.merge(fb,on=['pitcher_id','season'],how='left')
for a,b in (('velo_diff',('start_speed','fb_velo')),('ivb_diff',('ivb','fb_ivb')),('hb_diff',('hb','fb_hb')),('ax_diff',('ax_m','fb_ax')),('az_diff',('az','fb_az')),('vaa_diff',('vaa_n','fb_vaa')),('haa_diff',('haa_n','fb_haa'))): df[a]=df[b[0]]-df[b[1]]
# pitcher-season-pitch-type mean shape ("the pitch as he throws it") for the averaged-feature variant
df['ptc']=df.pitch_type.map({p:i for i,p in enumerate(MODELED)})
# location features (batter's frame: positive px_b = away from a batter? keep simple: mirror so + is toward the batter's side of the plate)
df['px_b']=df.plate_x*np.where(df.stand=='L',-1.0,1.0)        # + = inside to the batter (catcher view: RHH stands at -x) -> negative plate_x is inside to RHH; flipped below
df['px_b']=-df['px_b']
h=(df.sz_top-df.sz_bottom).where((df.sz_top-df.sz_bottom).between(1.2,2.6))
df['pz_n']=(df.plate_z-df.sz_bottom)/h
df['pz']=df.plate_z; df['px']=df.plate_x*sgn
keep=['season','gd','reg','game_pk','at_bat_number','pitch_number','pitcher_id','pitcher_name','pitcher_hand','stand','pitch_type','ptc','same_side','balls','strikes','rv',
 'swing','whiff','inplay','cstrike','ball','launch_speed','launch_angle','events',
 'start_speed','ivb','hb','rel_side','release_z','extension','spin_rate','arm_angle','aa_src','velo_diff','ivb_diff','hb_diff','ax_m','az','ay','ax_diff','az_diff',
 'vaa_n','haa_n','vaa_diff','haa_diff','flight','spin_axis','mov_axis','axis_dev','mov_per_rpm','px_b','px','pz','pz_n','vaa','haa','prim_fb']
out=df[keep].copy()
for c in out.columns:
    if out[c].dtype=='float64': out[c]=out[c].astype('float32')
out.to_parquet('all.parquet',index=False); print('wrote',len(out),out.groupby('season').size().to_dict())
