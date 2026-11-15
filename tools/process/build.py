import sys; sys.path.insert(0,'/home/claude/proc')
import plib, pandas as pd, numpy as np
a=plib.load_2025(); b=plib.load_2026(); d=pd.concat([a,b],ignore_index=True)
print('rows',len(a),len(b),'| usable',a.ok.mean().round(4),b.ok.mean().round(4))
for y,g in d.groupby('year'):
    k=g[g.ok]; print(y,'swing%',round(100*k.sw.mean(),2),'whiff/swing',round(100*k.wh.sum()/k.sw.sum(),2),'foul/contact',round(100*k.foul.sum()/(k.sw&~k.wh).sum(),2),'CS/take',round(100*k.cs.sum()/(k.cs|k.ballc).sum(),2),'bip tracked',round(100*k.bipv.notna().sum()/k.ip.sum(),2),'bipv mean',round(float(k.bipv.mean()),4),
        '| px',round(float(k.px.mean()),3),'pz',round(float(k.pz.mean()),3),'zn',round(float(k.zn.mean()),3),'velo',round(float(k.velo.mean()),2),'hb',round(float(k.hb.mean()),2),'ivb',round(float(k.ivb.mean()),2))
    print('   why dropped:',{c:int(v) for c,v in {'no group':g.grp.isna().sum(),'no loc':g.px.isna().sum(),'no velo/mov':(g.velo.isna()|g.hb.isna()).sum(),'bunt':g.buntp.sum()}.items()})
print('2025 runs per pitch',round(float(a.runs.where(a.events!='').sum()/len(a)),5), '| pitches per PA', round(len(a)/(a.events!='').sum(),3))
d.to_parquet('/home/claude/proc/pitches.parquet')
