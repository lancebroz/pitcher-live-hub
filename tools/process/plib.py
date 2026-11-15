"""Process+ shared definitions (mirrored in frontend/src/processModel.js: keep the two in sync).

A pitch is scored on three things, each against what the league does with the same pitch, in runs (+ = good for the hitter):
  Decisions  (swung - league swing probability) x (value of swinging - value of taking)
  Contact    on swings: (made contact - league contact probability) x (value of contact - value of a whiff)
  Power      on tracked batted balls: value of the exit velocity / launch angle - league batted-ball value for that pitch
Expectations come from five league models: swing, called strike (on takes), contact (on swings), foul (on contact),
batted-ball value (on balls in play). "Basic" knows pitch group, location, count and handedness; "Full" adds velocity and movement.
"""
import glob, json, re, numpy as np, pandas as pd
APP='/home/claude/pitcher-live-hub/frontend/src/App.jsx'
GROUPS={'FF':0,'SI':0,'FC':0,'FA':0,'FT':0,'SL':1,'ST':1,'SV':1,'CU':1,'KC':1,'CS':1,'CH':2,'FS':2,'FO':2,'SC':2}
FEED_DX,FEED_DZ=0.008,-0.080     # the MLB feed's plate location vs Statcast's (measured on 115k June 2026 pitches): add to feed rows
SZ_TOP,SZ_BOT=3.21,1.62          # league-average zone, used when a row has no zone heights
# context-neutral count values (average of the app's 2025 and 2026 tables) and wOBA-scale constants
RE={"0-0":0.0,"1-0":0.0333,"0-1":-0.0384,"2-0":0.0923,"1-1":-0.0174,"0-2":-0.0927,"3-0":0.1944,"2-1":0.0241,"1-2":-0.0753,"3-1":0.1149,"2-2":-0.0375,"3-2":0.0488}
LG,SCALE,W_BB=0.3145,1.235,0.6945
V_OUT=-LG/SCALE; V_BB=(W_BB-LG)/SCALE
FEATS_BASIC=['grp','same','bl','balls','strikes','px','pz','zn','era']   # era: 1 from 2026 on (the called zone changed with the challenge system)
FEATS_FULL=FEATS_BASIC+['velo','hb','ivb']
def grid(name):
    s=open(APP).read(); m=re.search(r'const '+name+r' = (\{[^;]*\});',s); return json.loads(m.group(1))
def jsround(x): return np.floor(x+0.5)
def xwobacon(ls,la,G,league):
    evb=(jsround(ls.clip(40,115)/5)*5); lab=(jsround(la.clip(-60,80)/10)*10)
    key=evb.fillna(-1).astype(int).astype(str)+'|'+lab.fillna(-999).astype(int).astype(str)
    v=pd.to_numeric(key.map(G),errors='coerce').fillna(league); return v.where(ls.notna()&la.notna())
def count_vals(b,s):
    """ball / strike / foul values and the count's own value, vectorised over integer balls, strikes"""
    R=np.zeros((5,4)); 
    for k,v in RE.items(): bb,ss=map(int,k.split('-')); R[bb,ss]=v
    cur=R[b,s]
    ball=np.where(b==3,V_BB,R[np.minimum(b+1,3),s])-cur
    strike=np.where(s==2,V_OUT,R[b,np.minimum(s+1,2)])-cur
    foul=np.where(s==2,0.0,R[b,np.minimum(s+1,2)]-cur)
    return cur,ball,strike,foul
def finish(d):
    """d: batter_id, game_pk, game_date, at_bat_number, pitch_number, stand, p_throws, pitch_type, balls, strikes, desc, ip, bunt_bip,
    events, velo, pfx_x (ft, catcher view), pfx_z (ft), plate_x, plate_z, sz_top, sz_bot, launch_speed, launch_angle"""
    desc=d.desc.fillna('').str.lower()
    tip=desc.str.contains('foul_tip'); d['sw']=desc.str.contains('swing')|desc.str.contains('foul')|desc.str.contains('into_play')|desc.str.contains('missed_bunt')|d.ip
    d['wh']=tip|(desc.str.contains('swinging')&desc.str.contains('strike'))|desc.str.contains('missed_bunt'); d['cs']=desc.str.contains('called')&desc.str.contains('strike')
    d['foul']=d.sw&~d.wh&~d.ip; d['hbp']=desc.str.contains('hit_by_pitch'); d['ballc']=~d.sw&~d.cs&~d.hbp&desc.str.contains('ball')
    d['buntp']=desc.str.contains('bunt')|d.bunt_bip
    d['grp']=d.pitch_type.map(GROUPS)
    L=(d.stand=='L'); d['bl']=L.astype(int); d['same']=(d.stand==d.p_throws).astype(int)
    d['px']=d.plate_x*np.where(L,-1,1); d['pz']=d.plate_z
    top=d.sz_top.fillna(SZ_TOP); bot=d.sz_bot.fillna(SZ_BOT); ok=(top-bot)>0.5; top=top.where(ok,SZ_TOP); bot=bot.where(ok,SZ_BOT)
    d['zn']=(d.plate_z-bot)/(top-bot)
    d['era']=(d.year>=2026).astype(int)
    d['hb']=d.pfx_x*12*np.where(d.p_throws=='R',-1,1); d['ivb']=d.pfx_z*12
    d['balls']=pd.to_numeric(d.balls,errors='coerce').clip(0,3); d['strikes']=pd.to_numeric(d.strikes,errors='coerce').clip(0,2)
    d['ok']=d.grp.notna()&d.px.notna()&d.pz.notna()&d.velo.notna()&d.hb.notna()&d.ivb.notna()&d.balls.notna()&d.strikes.notna()&~d.buntp&d.stand.isin(['L','R'])&d.p_throws.isin(['L','R'])&~desc.str.contains('pitchout')&(d.sw|d.cs|d.ballc|d.hbp)
    G=grid('XWOBACON'); xw=xwobacon(d.launch_speed,d.launch_angle,G,0.362)
    d['bipv']=((xw-LG)/SCALE).where(d.ip&~d.bunt_bip)          # value of a tracked batted ball (NaN when untracked)
    return d
def load_2025():
    c=['game_pk','game_date','at_bat_number','pitch_number','batter','stand','p_throws','pitch_type','balls','strikes','description','type','events','des','release_speed','pfx_x','pfx_z','plate_x','plate_z','sz_top','sz_bot','launch_speed','launch_angle','game_type','bat_score','post_bat_score','player_name']
    s=pd.concat([pd.read_parquet(f,columns=c) for f in sorted(glob.glob('/home/claude/dl_statcast/2025/*.parquet'))],ignore_index=True)
    gd=s.game_date.astype(str).str[:10]; s=s[(s.game_type=='R')&(gd>='2025-03-27')&(gd<='2025-09-28')].drop_duplicates(['game_pk','at_bat_number','pitch_number']).reset_index(drop=True)
    ip=(s['type']=='X')
    d=pd.DataFrame({'batter_id':s.batter,'game_pk':s.game_pk,'game_date':s.game_date.astype(str).str[:10],'at_bat_number':s.at_bat_number,'pitch_number':s.pitch_number,'stand':s.stand,'p_throws':s.p_throws,'pitch_type':s.pitch_type,
        'balls':s.balls,'strikes':s.strikes,'desc':s.description,'ip':ip,'bunt_bip':ip&s.des.fillna('').str.contains('bunt',case=False),'events':s.events.fillna(''),'velo':s.release_speed.astype(float),'pfx_x':s.pfx_x.astype(float),'pfx_z':s.pfx_z.astype(float),
        'plate_x':s.plate_x.astype(float),'plate_z':s.plate_z.astype(float),'sz_top':s.sz_top.astype(float),'sz_bot':s.sz_bot.astype(float),'launch_speed':s.launch_speed.astype(float),'launch_angle':s.launch_angle.astype(float),
        'runs':(s.post_bat_score-s.bat_score).astype(float),'name':s.player_name})
    d['year']=2025; return finish(d)
def load_2026():
    c=['game_pk','game_date','at_bat_number','pitch_number','batter_id','batter_name','stand','pitcher_hand','pitch_type','balls','strikes','call_description','is_in_play','events','trajectory','start_speed','pfx_x','pfx_z','plate_x','plate_z','sz_top','sz_bottom','launch_speed','launch_angle','home_team','away_team']
    s=pd.concat([pd.read_parquet(f,columns=c) for f in sorted(glob.glob('/home/claude/mlb-pitcher-data/data/raw/2026/monthly/*.parquet'))],ignore_index=True)
    gd=s.game_date.astype(str).str[:10]; s=s[(gd>='2026-03-25')&(gd<='2026-09-28')&(s.game_pk>0)].drop_duplicates(['game_pk','at_bat_number','pitch_number']).reset_index(drop=True)
    f=lambda x: pd.to_numeric(x,errors='coerce').astype(float)
    ip=s.is_in_play.fillna(False).astype(bool)|s.call_description.fillna('').str.contains('into_play')
    d=pd.DataFrame({'batter_id':s.batter_id,'game_pk':s.game_pk,'game_date':s.game_date.astype(str).str[:10],'at_bat_number':s.at_bat_number,'pitch_number':s.pitch_number,'stand':s.stand,'p_throws':s.pitcher_hand,'pitch_type':s.pitch_type,
        'balls':s.balls,'strikes':s.strikes,'desc':s.call_description,'ip':ip,'bunt_bip':ip&s.trajectory.fillna('').str.startswith('bunt'),'events':s.events.fillna(''),'velo':f(s.start_speed),'pfx_x':f(s.pfx_x),'pfx_z':f(s.pfx_z),
        'plate_x':f(s.plate_x)+FEED_DX,'plate_z':f(s.plate_z)+FEED_DZ,'sz_top':f(s.sz_top),'sz_bot':f(s.sz_bottom),'launch_speed':f(s.launch_speed),'launch_angle':f(s.launch_angle),'runs':np.nan,'name':s.batter_name})
    d['year']=2026; return finish(d)
