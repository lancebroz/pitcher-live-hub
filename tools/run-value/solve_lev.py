"""Recover Savant's run-expectancy table and base/out leverage weights from the per-pitch delta_run_exp values.
Model: delta_run_exp = k[base,outs] * (runs + RE(after) - RE(before)); linear in u = 1/k and RE."""
import sys; sys.path.insert(0,'/home/claude/rv')
import pandas as pd, numpy as np, json
from sv_load import load
def prep(y):
    d=load(y); r=d[d.game_type=='R'].copy()
    r=r.sort_values(['game_pk','at_bat_number','pitch_number']).reset_index(drop=True)
    r['b1']=r.on_1b.notna().astype(int); r['b2']=r.on_2b.notna().astype(int); r['b3']=r.on_3b.notna().astype(int)
    r['bo']=(r.b1+2*r.b2+4*r.b3)*3+r.outs_when_up.astype(int)            # 0..23
    half=r.game_pk.astype(str)+'|'+r.inning.astype(str)+'|'+r.inning_topbot.astype(str); r['half']=half
    nxt_same=(half.shift(-1)==half)
    r['bo_next']=np.where(nxt_same,r.bo.shift(-1),24).astype(int)          # 24 = inning over
    r['runs']=(r.post_bat_score-r.bat_score).fillna(0)
    r['last']=((r.at_bat_number!=r.at_bat_number.shift(-1))|(r.game_pk!=r.game_pk.shift(-1))).fillna(True).astype(bool)
    return r
def solve(r):
    q=r[r.last&(r.balls==0)&(r.strikes==0)&r.delta_run_exp.notna()&r.events.notna()]
    t=q.groupby(['bo','bo_next','runs']).delta_run_exp.agg(['count','median','min','max']).reset_index(); t=t[(t['count']>=3)&((t['max']-t['min'])<0.0015)]
    A=np.zeros((len(t),48)); bvec=t.runs.to_numpy(dtype=float)
    for i,(bo,bn,dv) in enumerate(zip(t.bo,t.bo_next,t['median'])):
        A[i,bo]+=dv; A[i,24+bo]+=1.0
        if bn<24: A[i,24+bn]-=1.0
    w=np.sqrt(t['count'].to_numpy(dtype=float)); x,*_=np.linalg.lstsq(A*w[:,None],bvec*w,rcond=None); res=A@x-bvec
    print('transitions',len(t),'pitches',int(t['count'].sum()),'max abs resid (runs)',round(np.abs(res).max(),4),'median',round(np.median(np.abs(res)),4))
    return x[:24],x[24:]
if __name__=='__main__':
    out={}
    for y in (2025,2026):
        r=prep(y); u,re=solve(r)
        print(y,'k = 1/u by bases(000,100,010,110,001,101,011,111) x outs:'); print(np.round(1/u,3).reshape(8,3)); print('RE24:'); print(np.round(re,3).reshape(8,3))
        out[y]={'u':u.tolist(),'re':re.tolist()}
    json.dump(out,open('/home/claude/rv/lev_consts.json','w'))
