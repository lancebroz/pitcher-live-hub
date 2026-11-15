import sys; sys.path.insert(0,'/home/claude/proc')
import plib, json, numpy as np, pandas as pd, lightgbm as lgb
from sklearn.metrics import log_loss, roc_auc_score
d=pd.read_parquet('/home/claude/proc/pitches.parquet'); d=d[d.ok].reset_index(drop=True)
test=(d.game_pk%7==0).to_numpy()
SETS={'swing':(np.ones(len(d),bool),'sw','binary'),'cs':((d.cs|d.ballc).to_numpy(),'cs','binary'),'contact':(d.sw.to_numpy(),None,'binary'),'foul':((d.sw&~d.wh).to_numpy(),'foul','binary'),'bip':(d.bipv.notna().to_numpy(),'bipv','regression')}
d['_contact']=(d.sw&~d.wh)
P=dict(num_leaves=24,learning_rate=0.08,min_child_samples=300,subsample=0.8,subsample_freq=1,colsample_bytree=0.9,reg_lambda=5.0,verbose=-1,n_jobs=8)
NT={'swing':260,'cs':160,'contact':220,'foul':160,'bip':160}
models={}; rep=[]
for ver,F in (('basic',plib.FEATS_BASIC),('full',plib.FEATS_FULL)):
    for name,(mask,ycol,obj) in SETS.items():
        if name=='cs' and ver=='full': models[(ver,name)]=models[('basic',name)]; continue     # the called zone does not care about stuff: one model serves both
        y=(d['_contact'] if name=='contact' else d[ycol]).astype(float).to_numpy()
        tr=mask&~test; te=mask&test
        m=(lgb.LGBMClassifier if obj=='binary' else lgb.LGBMRegressor)(n_estimators=NT[name],**P).fit(d.loc[tr,F],y[tr])
        if obj=='binary':
            p=m.predict_proba(d.loc[te,F])[:,1]; base=np.full(te.sum(),y[tr].mean()); r=(name,ver,int(tr.sum()),round(log_loss(y[te],base),4),round(log_loss(y[te],p),4),round(roc_auc_score(y[te],p),4))
        else:
            p=m.predict(d.loc[te,F]); r=(name,ver,int(tr.sum()),round(float(np.var(y[te])),5),round(float(np.mean((y[te]-p)**2)),5),round(1-float(np.mean((y[te]-p)**2))/float(np.var(y[te])),4))
        rep.append(r); print(r,flush=True); models[(ver,name)]=m
import pickle; pickle.dump({k:(v.booster_.model_to_string(),v.__class__.__name__) for k,v in models.items()},open('/home/claude/proc/models.pkl','wb'))
pd.DataFrame(rep,columns=['model','version','train_rows','baseline','model_loss','auc_or_r2']).to_csv('/home/claude/proc/fit_report.csv',index=False)
