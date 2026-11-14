"""Python replica of the app's per-pitch run value (batter's view, + = good for the hitter)."""
import re, json, glob, numpy as np, pandas as pd
APP=open('/home/claude/pitcher-live-hub/frontend/src/App.jsx').read()
XW=json.loads(re.search(r'^const XWOBACON = (\{.*?\});$',APP,re.M).group(1)); XW_LG=0.362
COUNT_RE={"0-0":0.000,"1-0":0.032,"0-1":-0.037,"2-0":0.080,"1-1":-0.012,"0-2":-0.086,"3-0":0.149,"2-1":0.024,"1-2":-0.055,"3-1":0.101,"2-2":-0.026,"3-2":0.040}
EVENT_LW=dict(strikeout=-0.279,strikeout_double_play=-0.279,walk=0.306,intent_walk=0.175,hit_by_pitch=0.352,single=0.464,double=0.762,triple=1.051,home_run=1.396,field_out=-0.264,flyout=-0.264,groundout=-0.264,lineout=-0.264,pop_out=-0.264,force_out=-0.264,forceout=-0.264,sac_fly=-0.098,sac_bunt=-0.147,fielders_choice=-0.243,fielders_choice_out=-0.264,field_error=0.464,catcher_interf=0.306,double_play=-0.494,grounded_into_double_play=-0.494,sac_fly_double_play=-0.494,sac_bunt_double_play=-0.494,triple_play=-0.594)
def load(year):
    d={2025:'/home/claude/pq25',2026:'/home/claude/pq'}[year]
    cols=['game_pk','game_date','at_bat_number','pitch_number','balls','strikes','events','call_description','is_in_play','launch_speed','launch_angle','pitch_type','pitch_name','pitcher_id','pitcher_name','pitcher_hand','stand','trajectory']
    df=pd.concat([pd.read_parquet(f,columns=cols) for f in sorted(glob.glob(d+'/*.parquet'))]); df=df[(df.game_pk!=0)&(df.game_date.astype(str)<=f'{year}-09-28')&df.at_bat_number.notna()].copy()
    df=df.drop_duplicates(['game_pk','at_bat_number','pitch_number']).sort_values(['game_pk','at_bat_number','pitch_number']).reset_index(drop=True)
    cd=df.call_description.fillna(''); df['ev']=df.events.fillna('').str.lower().str.strip()
    df['sw']=cd.isin(['swinging_strike','swinging_strike_blocked','foul','foul_tip','foul_bunt','missed_bunt'])|cd.str.startswith('hit_into_play')
    df['wh']=cd.isin(['swinging_strike','swinging_strike_blocked','foul_tip','missed_bunt']); df['cs']=cd=='called_strike'
    df['ball']=cd.isin(['ball','blocked_ball','pitchout','intent_ball','automatic_ball']); df['ip']=df.is_in_play==True
    df['b']=df.balls.fillna(0).clip(0,3).astype(int); df['s']=df.strikes.fillna(0).clip(0,2).astype(int)
    return df
def xw(ev,la):
    evb=(np.round(np.clip(ev,40,115)/5)*5).astype('Int64'); lab=(np.round(np.clip(la,-60,80)/10)*10).astype('Int64')
    return pd.Series([np.nan if (pd.isna(a) or pd.isna(b)) else XW.get(f'{int(a)}|{int(b)}',XW_LG) for a,b in zip(evb,lab)],index=ev.index)
def run_values(df,RE=COUNT_RE,LW=EVENT_LW,xa=-0.264,xb=0.827):
    re=lambda b,s: (b.astype(str)+'-'+s.astype(str)).map(RE).fillna(0)
    cur=re(df.b,df.s); lw=df.ev.map(LW)
    act=pd.Series(0.0,index=df.index); exp=pd.Series(0.0,index=df.index)
    ip=df.ip; x=xw(df.launch_speed[ip],df.launch_angle[ip]); a_ip=lw[ip].fillna(LW['field_out'])
    act[ip]=a_ip-cur[ip]; exp[ip]=np.where(x.notna(),xa+xb*x,a_ip)-cur[ip]
    m=~ip&df.ball; v=np.where(df.b[m]==3,LW['walk'],re(np.minimum(df.b[m]+1,3),df.s[m]))-cur[m]; act[m]=v; exp[m]=v
    m=~ip&~df.ball&(df.wh|df.cs); v=np.where(df.s[m]==2,LW['strikeout'],re(df.b[m],np.minimum(df.s[m]+1,2)))-cur[m]; act[m]=v; exp[m]=v
    m=~ip&~df.ball&~(df.wh|df.cs)&df.sw; v=np.where(df.s[m]>=2,0,re(df.b[m],np.minimum(df.s[m]+1,2))-cur[m]); act[m]=v; exp[m]=v
    m=~ip&~df.ball&~(df.wh|df.cs)&~df.sw&(df.ev=='hit_by_pitch'); v=LW['hit_by_pitch']-cur[m]; act[m]=v; exp[m]=v
    return act,exp
