import sys; sys.path.insert(0,'/home/claude/proc')
import plib, pickle, numpy as np, pandas as pd, lightgbm as lgb
def components(d, M):
    """adds dec_, con_, pow_ columns (runs, + = good for the hitter) for both versions; d must be the `ok` rows"""
    b=d.balls.astype(int).to_numpy(); s=d.strikes.astype(int).to_numpy(); cur,ballv,strikev,foulv=plib.count_vals(b,s)
    sw=d.sw.to_numpy().astype(float); contact=(d.sw&~d.wh).to_numpy().astype(float); bipv=d.bipv.to_numpy()
    sig=lambda z:1/(1+np.exp(-z)); out={}
    for ver,F in (('basic',plib.FEATS_BASIC),('full',plib.FEATS_FULL)):
        X=d[F]; pr=lambda n,f=F: M[(ver,n)].predict(d[plib.FEATS_BASIC] if n=='cs' else X, raw_score=True)
        p=sig(pr('swing')); cs=sig(pr('cs')); C=sig(pr('contact')); Fo=sig(pr('foul')); Q=pr('bip')
        Vt=cs*strikev+(1-cs)*ballv; Vc=Fo*foulv+(1-Fo)*(Q-cur); Vs=(1-C)*strikev+C*Vc
        out[f'dec_{ver}']=(sw-p)*(Vs-Vt); out[f'con_{ver}']=sw*(contact-C)*(Vc-strikev); out[f'pow_{ver}']=np.where(np.isnan(bipv),0.0,bipv-Q)
        out[f'p_{ver}']=p; out[f'C_{ver}']=C; out[f'Q_{ver}']=Q; out[f'gap_{ver}']=Vs-Vt
    return pd.DataFrame(out,index=d.index)
def load_models():
    raw=pickle.load(open('/home/claude/proc/models.pkl','rb')); return {k:lgb.Booster(model_str=v[0]) for k,v in raw.items()}
if __name__=='__main__':
    d=pd.read_parquet('/home/claude/proc/pitches.parquet'); d=d[d.ok].reset_index(drop=True); M=load_models()
    d=pd.concat([d,components(d,M)],axis=1); d.to_parquet('/home/claude/proc/scored.parquet')
    for y,g in d.groupby('year'):
        print(y,'league mean runs/100 pitches:',{c:round(100*float(g[c].mean()),4) for c in ['dec_basic','con_basic','pow_basic','dec_full','con_full','pow_full']})
