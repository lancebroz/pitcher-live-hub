"""Writes frontend/src/processModelData.js: the league models as flat tree arrays, league means and percentile pools."""
import sys; sys.path.insert(0,'/home/claude/proc')
import plib, compute, json, numpy as np, pandas as pd
M=compute.load_models(); RPP=0.0299
def sig(x,n=5): return float(f'{x:.{n}g}')
def flat(b):
    F=[];T=[];L=[];R=[];V=[];O=[];P=[]
    for t in b.dump_model()['tree_info']:
        O.append(len(F)); P.append(len(V)); nodes=[]; 
        def walk(n):
            if 'leaf_value' in n: V.append(sig(n['leaf_value'])); return -(len(V)-P[-1])        # leaf k (1-based within the tree) -> -k
            assert n['decision_type']=='<='
            i=len(F); F.append(n['split_feature']); T.append(sig(n['threshold'],6)); L.append(0); R.append(0)
            l=walk(n['left_child']); r=walk(n['right_child']); L[i]=l if l<0 else l-O[-1]; R[i]=r if r<0 else r-O[-1]; return i
        walk(t['tree_structure'])
    return {'F':F,'T':T,'L':L,'R':R,'V':V,'O':O,'P':P}
def predict_flat(m,X):
    """reference evaluator for the exported arrays (what the browser runs)"""
    F=np.array(m['F']);T=np.array(m['T']);L=np.array(m['L']);R=np.array(m['R']);V=np.array(m['V']);O=m['O'];P=m['P']; out=np.zeros(len(X))
    for k in range(len(O)):
        node=np.zeros(len(X),int); done=np.zeros(len(X),bool); val=np.zeros(len(X))
        while not done.all():
            i=O[k]+node; go=X[np.arange(len(X)),F[i]]<=T[i]; nxt=np.where(go,L[i],R[i]); leaf=(nxt<0)&~done
            val[leaf]=V[P[k]+(-nxt[leaf]-1)]; done|=leaf; node=np.where(nxt<0,0,nxt)
        out+=val
    return out
if __name__=='__main__':
    out={'basic':{},'full':{}}
    for (ver,name),b in M.items(): out[ver][name]=flat(b) if not (ver=='full' and name=='cs') else None
    d=pd.read_parquet('/home/claude/proc/scored.parquet')
    # the exported (rounded) trees against LightGBM on a sample
    s=d.sample(20000,random_state=1)
    for ver,F in (('basic',plib.FEATS_BASIC),('full',plib.FEATS_FULL)):
        for name in ('swing','contact','foul','bip','cs'):
            if out[ver][name] is None: continue
            a=predict_flat(out[ver][name],s[plib.FEATS_BASIC if name=='cs' else F].to_numpy(float)); b=M[(ver,name)].predict(s[plib.FEATS_BASIC if name=='cs' else F],raw_score=True)
            print(ver,name,'trees',len(out[ver][name]['O']),'nodes',len(out[ver][name]['F']),'max |raw diff| %.5f'%np.abs(a-b).max(),'mean %.6f'%np.abs(a-b).mean())
    # league means per pitch and percentile pools (hitters with 400+ scored pitches), per season and version
    LGM={};POOL={}
    for y,g in d.groupby('year'):
        LGM[str(y)]={v:[sig(float(g[f'{c}_{v}'].mean()),4) for c in ('dec','con','pow')] for v in ('basic','full')}
        h=g.groupby('batter_id').agg(n=('sw','size'),**{c:(c,'mean') for c in ['dec_basic','con_basic','pow_basic','dec_full','con_full','pow_full']}); h=h[h.n>=400]; POOL[str(y)]={}
        for v in ('basic','full'):
            pts={c:100*(h[f'{c}_{v}']-LGM[str(y)][v][i])/RPP for i,c in enumerate(('dec','con','pow'))}; tot=100+pts['dec']+pts['con']+pts['pow']
            POOL[str(y)][v]={'n':int(len(h)),'t':[round(float(x),1) for x in np.quantile(tot,np.linspace(0,1,21))],**{k:[round(float(x),1) for x in np.quantile(pts[c],np.linspace(0,1,21))] for c,k in (('dec','d'),('con','c'),('pow','w'))}}
        print(y,'pool',POOL[str(y)]['full']['n'],'median Process+',POOL[str(y)]['full']['t'][10],'5th/95th',POOL[str(y)]['full']['t'][1],POOL[str(y)]['full']['t'][19])
    const={'RE':plib.RE,'LG':plib.LG,'SCALE':plib.SCALE,'V_OUT':round(plib.V_OUT,5),'V_BB':round(plib.V_BB,5),'FEED_DX':plib.FEED_DX,'FEED_DZ':plib.FEED_DZ,'SZ_TOP':plib.SZ_TOP,'SZ_BOT':plib.SZ_BOT,'RPP':RPP,'GROUPS':plib.GROUPS,'FEATS':{'basic':plib.FEATS_BASIC,'full':plib.FEATS_FULL}}
    js="// Generated (tools/process/export.py). League models behind Process+ on the Hitters tab; see tools/process/README.md.\n"
    js+="// Each model is a gradient-boosted tree ensemble stored flat: F feature index, T threshold, L / R child (negative = leaf number), V leaf values, O / P per-tree offsets.\n"
    js+="export const PROC_CONST = %s;\nexport const PROC_MODELS = %s;\n"%(json.dumps(const,separators=(',',':')),json.dumps(out,separators=(',',':')))
    js+="// League mean of each component (runs per pitch: decisions, contact, power) by season and version, and percentile pools among hitters with 400+ pitches\n// (21 quantiles: t = Process+, d / c / w = decisions / contact / power in points).\n"
    js+="export const PROC_LEAGUE = %s;\nexport const PROC_POOLS = %s;\n"%(json.dumps(LGM,separators=(',',':')),json.dumps(POOL,separators=(',',':')))
    open('/home/claude/pitcher-live-hub/frontend/src/processModelData.js','w').write(js); print(len(js),'bytes')
