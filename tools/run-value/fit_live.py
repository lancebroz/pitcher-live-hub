"""Tables that let the app compute Savant-style run value per pitch from base/out state, count and outcome.
leveraged = E[event][bo] - R[bo][count]            (pitch that ends the plate appearance)
          = R[bo][next count] - R[bo][count]       (any other pitch)
neutral   = leveraged * k[bo]
Fitted to Statcast's per-pitch delta_run_exp (which is the neutral value)."""
import sys; sys.path.insert(0,'/home/claude/rv')
import pandas as pd, numpy as np, json
C=json.load(open('/home/claude/rv/lev_consts.json'))
CNT=[f'{b}-{s}' for b in range(4) for s in range(3)]; CI={c:i for i,c in enumerate(CNT)}
BALL={'ball','blocked_ball','pitchout','automatic_ball','intent_ball'}; STR={'called_strike','swinging_strike','swinging_strike_blocked','foul_tip','missed_bunt','automatic_strike','swinging_pitchout','bunt_foul_tip'}; FOUL={'foul','foul_bunt'}
def classify(r):
    d=r.description; b=r.balls.to_numpy(); s=r.strikes.to_numpy(); last=r['last'].to_numpy(); ev=r.events.fillna('').to_numpy()
    kind=np.where(d.isin(BALL),'B',np.where(d.isin(STR),'S',np.where(d.isin(FOUL),'F',np.where(d=='hit_by_pitch','H',np.where(d=='hit_into_play','X','?')))))
    term=last&(ev!='')
    nb=np.where(kind=='B',np.minimum(b+1,3),b); ns=np.where((kind=='S')|((kind=='F')&(s<2)),np.minimum(s+1,2),s)
    return kind,term,nb,ns
def load(y):
    r=pd.read_parquet(f'/home/claude/rv/sv{str(y)[2:]}.parquet'); r=r[r.delta_run_exp.notna()].copy(); r['year']=y; r['u']=np.array(C[str(y)]['u'])[r.bo.values]
    kind,term,nb,ns=classify(r); r['kind']=kind; r['term']=term; r['c0']=r.balls*3+r.strikes; r['c1']=nb*3+ns
    import glob
    bb=pd.concat([pd.read_parquet(f,columns=['game_pk','at_bat_number','pitch_number','bb_type']) for f in glob.glob(f'/home/claude/dl_statcast/{y}/*.parquet')]).drop_duplicates(['game_pk','at_bat_number','pitch_number'])
    r=r.merge(bb,on=['game_pk','at_bat_number','pitch_number'],how='left')
    ev=r.events.fillna(''); HITS={'single','double','triple','home_run'}
    bunt=(kind=='X')&r.des.fillna('').str.contains('bunt',case=False).to_numpy()&term          # Savant prices every bunt in play alike
    split=(kind=='X')&term&~ev.isin(HITS).to_numpy()&~bunt                                        # other balls in play: priced by event and by ground ball / air ball
    REACH={'field_error','fielders_choice','catcher_interf'}
    cls=np.where(ev.isin(REACH),'reach',np.where(r.bb_type.fillna('')=='ground_ball','out_ground','out_air'))
    r['events']=np.where(bunt,'bunt',np.where(split,cls,np.where(ev.isin(REACH)&term,'reach',np.where(ev=='strikeout_double_play','strikeout',np.where(ev=='intent_walk','walk',ev)))))
    r['L']=r.delta_run_exp.astype(float)*r.u; return r
def fit(r,label):
    u=r.u.to_numpy(); y=label
    # cells: use the modal value (a few pitches carry baserunning events)
    T=r[r.term].groupby(['events','bo','c0']).L.agg(n='size',v=lambda s:s.round(4).mode().iat[0]).reset_index()
    N=r[~r.term&(r.kind!='?')&(r.c1!=r.c0)].groupby(['bo','c0','c1']).L.agg(n='size',v=lambda s:s.round(4).mode().iat[0]).reset_index()
    evs=sorted(T.events.unique()); EI={e:i for i,e in enumerate(evs)}; nR=24*12; nE=len(evs)*24
    rows=[];rhs=[];w=[]
    for t in T.itertuples():
        c=np.zeros(nR+nE); c[nR+EI[t.events]*24+t.bo]=1; c[t.bo*12+t.c0]-=1; rows.append(c); rhs.append(t.v); w.append(t.n)
    for t in N.itertuples():
        c=np.zeros(nR+nE); c[t.bo*12+t.c1]+=1; c[t.bo*12+t.c0]-=1; rows.append(c); rhs.append(t.v); w.append(t.n)
    for bo in range(24):
        c=np.zeros(nR+nE); c[bo*12]=1; rows.append(c); rhs.append(0.0); w.append(1e6)      # R[bo][0-0] = 0
    A=np.array(rows); yv=np.array(rhs); ww=np.sqrt(np.array(w,float)); x,*_=np.linalg.lstsq(A*ww[:,None],yv*ww,rcond=None)
    R=x[:nR].reshape(24,12); E={e:x[nR+EI[e]*24:nR+EI[e]*24+24] for e in evs}
    # reproduce every pitch
    Earr=np.array([E[e] for e in evs]); ei=r.events.map(EI).fillna(-1).astype(int).to_numpy(); bo=r.bo.to_numpy(); c0=r.c0.to_numpy(); c1=r.c1.to_numpy()
    pred=np.where(r.term.to_numpy(),Earr[np.maximum(ei,0),bo]-R[bo,c0],R[bo,c1]-R[bo,c0]); predn=pred/u
    err=predn-r.delta_run_exp.to_numpy(float)
    print(y,'events',len(evs),'| per-pitch neutral: exact (<0.002)',round(np.mean(np.abs(err)<0.002),4),'within 0.01',round(np.mean(np.abs(err)<0.01),4),'MAE',round(np.abs(err).mean(),5),'| league sum diff per 100',round(100*err.mean(),4))
    r['pred']=predn; g=r.groupby(['pitcher','pitch_type']).agg(n=('pred','size'),a=('delta_run_exp','sum'),p=('pred','sum')); g=g[g.n>=200]
    print('   pitcher x type 200+: r',round(np.corrcoef(g.a,g.p)[0,1],5),'MAE runs',round((g.a-g.p).abs().mean(),3),'max',round((g.a-g.p).abs().max(),2))
    bad=r[np.abs(err)>=0.01]; print('   misses by kind/term:',bad.groupby(['kind','term']).size().to_dict(),'| top events',bad[bad.term].events.value_counts().head(6).to_dict())
    return {'R':[[round(float(v),4) for v in row] for row in R],'E':{e:[round(float(v),4) for v in E[e]] for e in evs}}, r
if __name__=='__main__':
    out={}
    for y in (2025,2026):
        tab,rr=fit(load(y),y); tab['k']=[round(float(1/v),4) for v in C[str(y)]['u']]; out[str(y)]=tab; rr.to_parquet(f'/home/claude/rv/live_fit_rows{y}.parquet')
    json.dump(out,open('/home/claude/rv/live_tables.json','w')); print(sorted(out['2026']['E'].keys())); print({e:sum(1 for v in out['2026']['E'][e] if v==0) for e in out['2026']['E']})
