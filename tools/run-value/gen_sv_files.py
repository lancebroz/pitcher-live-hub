"""Write the static files behind the Overview's Value container (Savant-style run value)."""
import json, numpy as np, pandas as pd
SRC='/home/claude/pitcher-live-hub/frontend/src/'
D=pd.read_parquet('/home/claude/rv/sv_value.parquet'); D=D[D.stand.isin(['R','L'])&D.p_throws.isin(['R','L'])].copy()
ph=D.groupby(['year','pitcher']).p_throws.agg(lambda q:q.mode().iat[0]); D['ph']=[ph[(y,p)] for y,p in zip(D.year,D.pitcher)]
M=['nv','nx','lv','lx']
# ---- per-pitcher sums ----
for y,dy in D.groupby('year'):
    g=dy.groupby(['pitcher','pitch_type','stand','bk'])[M].sum().join(dy.groupby(['pitcher','pitch_type','stand','bk']).size().rename('n')).reset_index()
    tot=dy.groupby(['pitcher','pitch_type']).size(); out={}
    for (pid,pt),q in g.groupby(['pitcher','pitch_type']):
        if tot[(pid,pt)]<15: continue
        arr=[0]*20; q=q.set_index(['stand','bk'])
        for i,(st,bk) in enumerate((('R','pre'),('R','two'),('L','pre'),('L','two'))):
            if (st,bk) in q.index:
                row=q.loc[(st,bk)]; arr[i*5:i*5+5]=[int(row.n)]+[int(round(100*float(row[m]))) for m in M]
        out.setdefault(str(int(pid)),{})[pt]=arr
    js=json.dumps(out,separators=(',',':'))
    open(SRC+f'overviewValueSv{y}.js','w').write(f"// Generated (tools/run-value). Savant-style run value sums for the Overview's Value container, {y} regular season.\n// [pitcherId][pitchType] = 4 blocks of 5 (vs RHH before two strikes, vs RHH two strikes, vs LHH before two strikes, vs LHH two strikes):\n// [pitches, neutral RV, neutral xRV, leveraged RV, leveraged xRV], runs x 100, + = good for the pitcher.\nexport default {js};\n")
    print(y,'pitchers',len(out),'bytes',len(js))
# ---- league reference and colour constants ----
ref={}
def cell(d): return [round(100*float(d[m].mean()),2) for m in M]
for y,dy in D.groupby('year'):
    ref[str(y)]={}
    for h,dh in dy.groupby('ph'):
        R={}
        for pt,dt in dh.groupby('pitch_type'):
            if len(dt)<1500: continue
            R[pt]={}
            for st,ds in dt.groupby('stand'):
                if len(ds)<400: continue
                R[pt][st]={'all':cell(ds),'pre':cell(ds[ds.bk=='pre']),'two':cell(ds[ds.bk=='two'])}
        ref[str(y)][h]=R
K={}
for m in M:
    K[m]={}
    for bk,sub in (('all',D),('pre',D[D.bk=='pre']),('two',D[D.bk=='two'])):
        g=sub.groupby(['pitcher','year','ph','pitch_type','stand'])[m].agg(['size','mean','var']).reset_index(); lg=sub.groupby(['year','ph','pitch_type','stand'])[m].mean().rename('lg').reset_index()
        g=g[g['size']>=40].merge(lg,on=['year','ph','pitch_type','stand']); g['dev']=g['mean']-g.lg
        sw=np.average(g['var'],weights=g['size']-1); sb=max(np.average(g.dev**2,weights=g['size'])-sw*np.average(1/g['size'],weights=g['size']),1e-9)
        K[m][bk]=[round(100*float(np.sqrt(sb)),2),int(round(sw/sb))]
print('talent spread (runs/100) and sample constant (pitches):',json.dumps(K))
print('2026 RHP FF reference:',json.dumps(ref['2026']['R']['FF']))
open(SRC+'overviewValueSvRef.js','w').write("// Generated (tools/run-value). League reference for the Savant-style values in the Overview's Value container.\n// OV_SV_REF[year][pitcherHand][pitchType][batterSide][all|pre|two] = [neutral RV, neutral xRV, leveraged RV, leveraged xRV], runs per 100 pitches, + = good for the pitcher.\n// OV_SV_K[nv|nx|lv|lx][all|pre|two] = [spread of true talent among pitchers (runs per 100), pitches for half weight] (used for colour only).\nexport const OV_SV_REF = "+json.dumps(ref,separators=(',',':'))+";\nexport const OV_SV_K = "+json.dumps(K,separators=(',',':'))+";\n")
s=D[(D.year==2026)&(D.pitcher==694973)]; print(s.groupby(['pitch_type']).size().to_dict())
for st in 'RL':
    for bk,q in (('all',s[s.stand==st]),('pre',s[(s.stand==st)&(s.bk=='pre')]),('two',s[(s.stand==st)&(s.bk=='two')])):
        t=q.groupby('pitch_type').agg(n=('nv','size'),nv=('nv','mean'),lv=('lv','mean'),nx=('nx','mean'),lx=('lx','mean'))
        print('Skenes',st,bk,{p:(int(r.n),round(100*r.nv,1),round(100*r.nx,1),round(100*r.lv,1),round(100*r.lx,1)) for p,r in t.iterrows() if p in('FF','ST','CH','SI','FS','SL')})
