"""League references for the Overview: (1) run value by location for the Success heatmap, (2) run value per 100 by pitch type,
pitcher hand, batter side and count bucket for the Value container. Mirrors frontend pitchRunValue / repairTwoStrikeFouls."""
import json, glob, numpy as np, pandas as pd
from scipy.ndimage import gaussian_filter
from rvlib import XW, XW_LG, load
C=json.load(open('consts.json')); G={2025:dict(walk=.691,hit_by_pitch=.722,single=.882,double=1.252,triple=1.584,home_run=2.037),2026:dict(walk=.698,hit_by_pitch=.729,single=.890,double=1.261,triple=1.596,home_run=2.049)}
OUTS=["strikeout","strikeout_double_play","field_out","flyout","groundout","lineout","pop_out","force_out","forceout","sac_fly","sac_bunt","fielders_choice","fielders_choice_out","field_error","double_play","grounded_into_double_play","sac_fly_double_play","sac_bunt_double_play","triple_play"]
def score(y):
    c=C[str(y)]; lg,sc=c['lg'],c['scale']; OUT=-lg/sc; LW={e:OUT for e in OUTS}; LW.update({e:(w-lg)/sc for e,w in G[y].items()}); LW['catcher_interf']=LW['walk']; LW['intent_walk']=0.0; RE=c['re']
    cols=['game_pk','game_date','at_bat_number','pitch_number','balls','strikes','events','call_description','is_in_play','launch_speed','launch_angle','pitch_type','pitch_name','pitcher_id','pitcher_name','pitcher_hand','stand','plate_x','plate_z']
    d={2025:'/home/claude/pq25',2026:'/home/claude/pq'}[y]
    df=pd.concat([pd.read_parquet(f,columns=cols) for f in sorted(glob.glob(d+'/*.parquet'))]); df=df[(df.game_pk!=0)&(df.game_date.astype(str)<=f'{y}-09-28')&df.at_bat_number.notna()]
    df=df.drop_duplicates(['game_pk','at_bat_number','pitch_number']).sort_values(['game_pk','at_bat_number','pitch_number']).reset_index(drop=True)
    cd=df.call_description.fillna('').str.lower(); ev=df.events.fillna('').str.lower().str.strip()
    tip=cd.str.contains('foul_tip'); swing=cd.str.contains('swing|foul|into_play|missed_bunt'); whiff=tip|(cd.str.contains('swinging')&cd.str.contains('strike'))|cd.str.contains('missed_bunt')
    called=cd.str.contains('called')&cd.str.contains('strike'); foul=~tip&cd.str.contains('foul'); ip=(df.is_in_play==True)|cd.str.contains('into_play'); hbp=cd.str.contains('hit_by_pitch')&~whiff&~called&~foul&~ip
    ball=~swing&~called&~ip&cd.str.contains('ball')&~cd.str.contains('hit_by_pitch')
    b=df.balls.fillna(0).clip(0,3).astype(int); s=df.strikes.fillna(0).clip(0,2).astype(int)
    adv=(whiff|called|foul).astype(int); prior=adv.groupby([df.game_pk,df.at_bat_number]).cumsum()-adv        # strikes thrown before this pitch (fouls can only reach two)
    fix=foul&(s==1)&(prior>=2); s=s.where(~fix,2)
    re=lambda bb,ss: (bb.astype(str)+'-'+ss.astype(str)).map(RE).fillna(0.0); cur=re(b,s)
    evb=(np.floor(df.launch_speed.clip(40,115)/5+0.5)*5); lab=(np.floor(df.launch_angle.clip(-60,80)/10+0.5)*10)
    has=df.launch_speed.notna()&df.launch_angle.notna(); xwv=pd.Series([XW.get(f'{int(a)}|{int(c_)}',XW_LG) if h else np.nan for a,c_,h in zip(evb.fillna(0),lab.fillna(0),has)],index=df.index)
    a_ip=ev.map(LW).fillna(OUT); x_ip=np.where(has,(xwv-lg)/sc+c['xoff'],a_ip)
    nb=re((b+1).clip(upper=3),s); ns=re(b,(s+1).clip(upper=2))
    rest=np.where(hbp,LW['hit_by_pitch']-cur,np.where(ball,np.where(b==3,LW['walk'],nb)-cur,np.where(whiff|called,np.where(s==2,OUT,ns)-cur,np.where(swing,np.where(s>=2,0.0,ns-cur),0.0))))
    df['act']=np.where(ip,a_ip-cur,rest); df['exp']=np.where(ip,x_ip-cur,rest); df['s']=s; df['b']=b; df['fixed']=fix; df['year']=y
    ph=df.groupby('pitcher_id').pitcher_hand.agg(lambda q:q.mode().iat[0] if len(q.mode()) else None); df['ph']=df.pitcher_id.map(ph)
    return df
if __name__=='__main__':
    D=pd.concat([score(2025),score(2026)],ignore_index=True)
    D.to_parquet('scored_rv.parquet')
    for y,d in D.groupby('year'):
        print(y,'pitches',len(d),'two-strike fouls corrected',round(100*d.fixed.mean(),2),'% | league runs/100 (batter view): actual',round(100*d.act.mean(),3),'expected',round(100*d.exp.mean(),3),'| before two strikes',round(100*d.act[d.s<2].mean(),3),'two strikes',round(100*d.act[d.s==2].mean(),3))
        pa=d.groupby(['game_pk','at_bat_number']).agg(pid=('pitcher_id','last'),ev=('events','last'),s=('act','sum'))
        t=d[d.pitch_type.isin(['FF','SI','FC','SL','ST','CU','CH','FS','KC','SV'])].groupby('pitch_type').agg(n=('act','size'),act=('act','mean'),exp=('exp','mean'))
        print('   league runs/100 by type, pitcher view: actual',(-100*t.act).round(2).to_dict()); print('      expected',(-100*t.exp).round(2).to_dict())
