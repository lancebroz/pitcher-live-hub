"""Reference implementation of the per-pitch Savant-style run value used by the app (frontend rvSavant.js, backend).
Input: pitches as stored by mlb-pitcher-data (feed event names, trajectory, base/out fields)."""
import json, numpy as np, pandas as pd
T=json.load(open('/home/claude/rv/live_tables.json')); X=json.load(open('/home/claude/rv/live_x_tables.json'))
BALL={'ball','blocked_ball','pitchout','intent_ball','automatic_ball'}; STRK={'called_strike','swinging_strike','swinging_strike_blocked','foul_tip','missed_bunt','automatic_strike','swinging_pitchout','bunt_foul_tip'}; FOUL={'foul','foul_bunt'}
HIT={'single','double','triple','home_run'}; REACH={'field_error','fielders_choice','catcher_interf'}
def savant_values(df):
    """Returns DataFrame nv, nx, lv, lx: batter-view neutral / leveraged x actual / expected. NaN where base/out is unknown."""
    n=len(df); year=pd.to_datetime(df.game_date,errors='coerce').dt.year.fillna(2026).astype(int).clip(2025,2026).to_numpy()
    b=pd.to_numeric(df.balls,errors='coerce').fillna(0).clip(0,3).astype(int).to_numpy(); s=pd.to_numeric(df.strikes,errors='coerce').fillna(0).clip(0,2).astype(int).to_numpy()
    known=df.on_1b.notna()&df.on_2b.notna()&df.on_3b.notna()&df.outs.notna()
    o=pd.to_numeric(df.outs,errors='coerce').fillna(0).clip(0,2).astype(int).to_numpy()
    bo=((df.on_1b.fillna(False).astype(int)+2*df.on_2b.fillna(False).astype(int)+4*df.on_3b.fillna(False).astype(int))*3).to_numpy()+o
    cd=df.call_description.fillna('').str.lower().to_numpy(); ev=df.events.fillna('').str.lower().to_numpy(); ip=df.is_in_play.fillna(False).astype(bool).to_numpy(); tr=df.trajectory.fillna('').to_numpy()
    cls=np.full(n,'',dtype=object)
    cls[ip]=np.where(np.char.startswith(tr[ip].astype(str),'bunt'),'bunt',np.where(np.isin(ev[ip],list(HIT)),ev[ip],np.where(np.isin(ev[ip],list(REACH)),'reach',np.where(tr[ip]=='ground_ball','out_ground','out_air'))))
    isb=np.isin(cd,list(BALL)); iss=np.isin(cd,list(STRK)); isf=np.isin(cd,list(FOUL)); hbp=(cd=='hit_by_pitch')&~ip
    cls[hbp]='hit_by_pitch'; cls[isb&(b==3)&~ip]='walk'; cls[(iss&(s==2)&~ip)|((cd=='foul_bunt')&(s==2)&~ip)]='strikeout'
    c0=b*3+s; c1=np.where(isb,np.minimum(b+1,3)*3+s,np.where(iss|isf,b*3+np.minimum(s+1,2),c0))
    lev=np.zeros(n); k=np.ones(n)
    for y in np.unique(year):
        t=T[str(y)]; R=np.array(t['R']); kk=np.array(t['k']); m=year==y; E=t['E']
        k[m]=kk[bo[m]]
        v=R[bo[m],c1[m]]-R[bo[m],c0[m]]                     # count change
        cm=cls[m]
        for c in np.unique(cm):
            if c=='': continue
            e=np.array(E[c]); 
            if c=='bunt': e=np.where(e==0,np.array(E['out_ground']),e)
            sel=cm==c; v[sel]=e[bo[m][sel]]-R[bo[m][sel],c0[m][sel]]
        lev[m]=v
    nv=lev*k
    # expected: re-price balls in play by the outcome mix of their EV/LA cell
    ls=pd.to_numeric(df.launch_speed,errors='coerce'); la=pd.to_numeric(df.launch_angle,errors='coerce'); has=ip&ls.notna().to_numpy()&la.notna().to_numpy()
    evb=(np.floor(ls.clip(40,115)/5+0.5)*5).fillna(0).astype(int).to_numpy(); lab=(np.floor(la.clip(-60,80)/10+0.5)*10).fillna(0).astype(int).to_numpy()
    sw=np.zeros(n); CL={'single':'1B','double':'2B','triple':'3B','home_run':'HR'}
    Dc={c:np.array(v) for c,v in X['Dc'].items()}
    idx=np.where(has)[0]
    for i in idx:
        p=X['P'].get(f'{evb[i]}|{lab[i]}')
        if p is None: continue
        e=sum(p[j]*Dc[c][bo[i]] for j,c in enumerate(('1B','2B','3B','HR'))); a=Dc[CL[cls[i]]][bo[i]] if cls[i] in CL else 0.0
        sw[i]=e-a+X['xoff'].get(str(year[i]),0.0)
    nx=nv+sw
    out=pd.DataFrame({'nv':nv,'nx':nx,'lv':nv/k,'lx':nx/k},index=df.index); out[~known.to_numpy()]=np.nan
    return out
