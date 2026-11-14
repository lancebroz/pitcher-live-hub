"""Recover Savant's base/out weights k and RE24 from deterministic events (HR, triple, HBP, walk, strikeout).
Savant context-neutral value = k[base,outs] * (average run-expectancy change of that event in that base/out/count state)."""
import sys; sys.path.insert(0,'/home/claude/rv')
import pandas as pd, numpy as np, json
from solve_lev import prep
def after(ev,bo):
    b,o=divmod(bo,3); b1,b2,b3=b&1,(b>>1)&1,(b>>2)&1; nr=b1+b2+b3
    if ev=='home_run': return nr+1, 0*3+o
    if ev=='triple': return nr, 4*3+o
    if ev in('walk','hit_by_pitch'):
        runs=1 if nr==3 else 0
        nb3=1 if (b3 and not(b1 and b2)) or (b1 and b2) else 0
        nb2=1 if (b2 and not b1) or b1 and (b1) and (b1==1 and (b1)) and (b1 and (b2 or True)) and b1 and (True if b1 else False) and (b1==1) and (b1 and (1 if b1 else 0)) and (b1 and (b1)) and (1 if b1 else 0) else 0
        # forced advance: runner on 1st -> 2nd; runner on 2nd advances only if 1st occupied; 3rd only if 1st and 2nd occupied
        nb2=1 if b1 or b2 else 0; nb3=1 if (b3 or (b1 and b2)) else 0
        return runs,(1+2*nb2+4*nb3)*3+o
    if ev=='strikeout': return 0,(b*3+o+1) if o<2 else 24
def solve(r,verbose=True):
    q=r[r.last&r.delta_run_exp.notna()&r.events.isin(['home_run','triple','walk','hit_by_pitch','strikeout'])]
    t=q.groupby(['bo','balls','strikes','events']).delta_run_exp.agg(['count',lambda s:s.mode().iat[0]]).reset_index(); t.columns=['bo','b','s','ev','n','v']
    rows=[];rhs=[];wt=[]
    def eq(coef,val,w): rows.append(coef); rhs.append(val); wt.append(w)
    for (bo,b,s),g in t.groupby(['bo','b','s']):
        g=g.set_index('ev')
        if b==0 and s==0:
            for ev,x in g.iterrows():
                runs,af=after(ev,bo); c=np.zeros(48); c[bo]+=x.v; c[24+bo]+=1
                if af<24: c[24+af]-=1
                eq(c,runs,x.n)
        evs=list(g.index)
        for i in range(len(evs)):
            for j in range(i+1,len(evs)):
                e1,e2=evs[i],evs[j]; r1,a1=after(e1,bo); r2,a2=after(e2,bo); c=np.zeros(48); c[bo]+=g.v[e1]-g.v[e2]
                if a1<24: c[24+a1]-=1
                if a2<24: c[24+a2]+=1
                eq(c,r1-r2,min(g.n[e1],g.n[e2]))
    A=np.array(rows); y=np.array(rhs,float); w=np.sqrt(np.array(wt,float)); x,*_=np.linalg.lstsq(A*w[:,None],y*w,rcond=None); res=A@x-y
    if verbose: print('equations',len(y),'rank',np.linalg.matrix_rank(A),'resid: median',round(np.median(np.abs(res)),4),'p95',round(np.percentile(np.abs(res),95),4),'max',round(np.abs(res).max(),3))
    return x[:24],x[24:]
if __name__=='__main__':
    out={}
    for y in (2025,2026):
        r=prep(y); u,re=solve(r)
        print(y,'k by bases(000,100,010,110,001,101,011,111) x outs:'); print(np.round(1/u,3).reshape(8,3)); print('RE24:'); print(np.round(re,3).reshape(8,3))
        out[y]={'u':u.tolist(),'re':re.tolist()}
    json.dump(out,open('/home/claude/rv/lev_consts.json','w'))
