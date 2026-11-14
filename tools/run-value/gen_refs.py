import json, numpy as np, pandas as pd
from scipy.ndimage import gaussian_filter
D=pd.read_parquet('scored_rv.parquet'); D=D[D.pitch_type.notna()&D.ph.isin(['R','L'])&D.stand.isin(['R','L'])]
SRC='/home/claude/pitcher-live-hub/frontend/src/'
# ---- (1) Success-heatmap baseline: expected run value by location (batter-positive, runs x 1000) ----
L=D[D.plate_x.notna()&D.plate_z.notna()].copy(); NX=NZ=16; X0=-2.0; Z0=0.5; DD=0.25
L['xi']=np.clip(np.floor((L.plate_x-X0)/DD),0,NX-1).astype(int); L['zi']=np.clip(np.floor((L.plate_z-Z0)/DD),0,NZ-1).astype(int); T={}
for (pt,h,st),d in L.groupby(['pitch_type','ph','stand']):
    if len(d)<4000: continue
    sm=np.zeros((NZ,NX)); ct=np.zeros((NZ,NX)); np.add.at(sm,(d.zi,d.xi),d.exp); np.add.at(ct,(d.zi,d.xi),1)
    S=gaussian_filter(sm,0.8,mode='nearest'); Cn=gaussian_filter(ct,0.8,mode='nearest'); T[f'{pt}|{h}|{st}']=[int(round(v*1000)) for v in ((S+25*d.exp.mean())/(Cn+25)).flatten()]
old=open(SRC+'overviewRvBase.js').read(); head=old[:old.index('export const OV_RVBASE')]
oldT=json.loads(old[old.index('export const OV_RVBASE = ')+len('export const OV_RVBASE = '):].rstrip().rstrip(';'))
open(SRC+'overviewRvBase.js','w').write(head+'export const OV_RVBASE = '+json.dumps({'x0':X0,'z0':Z0,'d':DD,'nx':NX,'nz':NZ,'t':T},separators=(',',':'))+';\n')
g=np.array(T['FF|R|R']).reshape(NZ,NX); go=np.array(oldT['t']['FF|R|R']).reshape(NZ,NX)
print('location tables',len(T),'(was',len(oldT['t']),') | FF R v R middle',g[8,8],'(was',go[8,8],') low-away',g[3,3],'(was',go[3,3],') | mean shift',round(float(np.mean(g-go)),1))
# ---- (2) Value container reference ----
D['bk']=np.where(D.s==2,'two','pre'); ref={}; 
def cellstats(d): return [round(-100*float(d.act.mean()),2),round(-100*float(d.exp.mean()),2)]
for y,dy in D.groupby('year'):
    ref[str(y)]={}
    for h,dh in dy.groupby('ph'):
        R={}
        for pt,dt in dh.groupby('pitch_type'):
            if len(dt)<1500: continue
            R[pt]={}
            for st,ds in dt.groupby('stand'):
                if len(ds)<400: continue
                R[pt][st]={'all':cellstats(ds),'pre':cellstats(ds[ds.bk=='pre']),'two':cellstats(ds[ds.bk=='two'])}
        ref[str(y)][h]=R
# talent spread and sample-size constant per metric and bucket (pitcher x season x pitch type x batter side cells)
K={}
for m in ('act','exp'):
    K[m[0] if m=='act' else 'x']={}
    for bk,sub in (('all',D),('pre',D[D.bk=='pre']),('two',D[D.bk=='two'])):
        g=sub.groupby(['pitcher_id','year','pitch_type','stand'])[m].agg(['size','mean','var']); lg=sub.groupby(['year','ph','pitch_type','stand'])[m].mean()
        g=g[g['size']>=40].reset_index(); phm=sub.drop_duplicates('pitcher_id').set_index('pitcher_id').ph; g['dev']=g['mean']-[lg.get((yy,phm[p],t,s_),np.nan) for yy,p,t,s_ in zip(g.year,g.pitcher_id,g.pitch_type,g.stand)]
        g=g.dropna(subset=['dev']); sw=np.average(g['var'],weights=g['size']-1); sb=max(np.average(g.dev**2,weights=g['size'])-sw*np.average(1/g['size'],weights=g['size']),1e-9)
        K['a' if m=='act' else 'x'][bk]=[round(100*float(np.sqrt(sb)),2),int(round(sw/sb))]
print('talent spread (runs/100) and sample constant (pitches):',json.dumps(K))
print('2026 RHP reference:',json.dumps({t:ref['2026']['R'][t] for t in ('FF','ST','CH')}))
open(SRC+'overviewValueRef.js','w').write("// Generated (tools/run-value). League reference for the Overview's Value container.\n// OV_VALUE_REF[year][pitcherHand][pitchType][batterSide][all|pre|two] = [run value, expected run value], runs per 100 pitches, + = good for the pitcher.\n// OV_VALUE_K[a|x][all|pre|two] = [spread of true talent among pitchers (runs per 100), pitches for half weight] (used for colour only).\nexport const OV_VALUE_REF = "+json.dumps(ref,separators=(',',':'))+";\nexport const OV_VALUE_K = "+json.dumps(K,separators=(',',':'))+";\n")
