from rvlib import *
G={2025:dict(lg=.313,scale=1.232,walk=.691,hit_by_pitch=.722,single=.882,double=1.252,triple=1.584,home_run=2.037),
   2026:dict(lg=.316,scale=1.238,walk=.698,hit_by_pitch=.729,single=.890,double=1.261,triple=1.596,home_run=2.049)}
OUTS=['strikeout','strikeout_double_play','field_out','flyout','groundout','lineout','pop_out','force_out','forceout','sac_fly','sac_bunt','fielders_choice','fielders_choice_out','field_error','double_play','grounded_into_double_play','sac_fly_double_play','sac_bunt_double_play','triple_play']
def season(y):
    g=G[y]; out=-g['lg']/g['scale']; LW={e:out for e in OUTS}
    for e in ('walk','hit_by_pitch','single','double','triple','home_run'): LW[e]=(g[e]-g['lg'])/g['scale']
    LW['catcher_interf']=LW['walk']
    df=load(y); last=df.groupby(['game_pk','at_bat_number']).tail(1); pav=last.set_index(['game_pk','at_bat_number']).ev.map(LW)   # IBB and non-PA endings -> NaN, excluded
    m0=pav.mean(); df=df.join(pav.rename('pav'),on=['game_pk','at_bat_number']); df['cnt']=df.b.astype(str)+'-'+df.s.astype(str)
    emp=df[df.pav.notna()].drop_duplicates(['game_pk','at_bat_number','cnt']).groupby('cnt').pav.mean()
    RE={k:round(float(emp[k]-emp['0-0']),4) for k in COUNT_RE}
    # expected contact: (xwOBAcon - lg)/scale, plus a season offset so league expected = league actual on tracked balls in play
    ip=df.ip&df.launch_speed.notna()&df.launch_angle.notna(); x=xw(df.launch_speed[ip],df.launch_angle[ip]); a=df.ev[ip].map(LW).fillna(out)
    xoff=float(a.mean()-((x-g['lg'])/g['scale']).mean())
    return df,LW,RE,dict(year=y,lg=g['lg'],scale=g['scale'],out=round(out,4),lw={e:round(LW[e],4) for e in ('walk','hit_by_pitch','single','double','triple','home_run')},re=RE,xoff=round(xoff,4),meanPA=round(float(m0),4))
if __name__=='__main__':
    out={}
    for y in (2025,2026):
        df,LW,RE,c=season(y); out[y]=c; print(json.dumps(c))
        act,exp=run_values(df,RE=RE,LW={**LW,'intent_walk':0.0},xa=-c['lg']/c['scale']+c['xoff'],xb=1/c['scale'])
        df['act']=act; df['exp']=exp; df['k2']=df.s==2
        print('  per-pitch league mean x100: actual',round(100*act.mean(),3),'expected',round(100*exp.mean(),3),'| two-strike pitches',round(100*df.act[df.k2].mean(),3),'| before two strikes',round(100*df.act[~df.k2].mean(),3))
        t=df[df.pitch_type.isin(['FF','SI','FC','SL','ST','CU','CH','FS','KC','SV'])].groupby('pitch_type').agg(act=('act','mean'),exp=('exp','mean'))
        print('  league runs/100 by type (pitcher view): actual',(-100*t.act).round(2).to_dict(),'expected',(-100*t.exp).round(2).to_dict())
        # identity: a pitcher's pitch run values add up to his plate-appearance results
        pa=df.groupby(['game_pk','at_bat_number']).agg(pid=('pitcher_id','last'),ev=('ev','last'),s=('act','sum')); pa['v']=pa.ev.map({**LW,'intent_walk':0.0})
        z=pa[pa.v.notna()].groupby('pid').agg(n=('v','size'),s=('s','sum'),v=('v','sum')); z=z[z.n>=400]; print('  pitcher totals: sum of pitch values vs sum of PA results, max abs diff (runs)',round(float((z.s-z.v).abs().max()),2),'corr',round(float(np.corrcoef(z.s,z.v)[0,1]),5))
    json.dump(out,open('consts.json','w'))
