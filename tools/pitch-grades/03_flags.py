"""Step 3. Add low-confidence flags to the grades and rewrite frontend/src/overviewGrades.js.

  unique shape  - a pitch type whose average shape/release has few close matches among OTHER pitchers, so the
                  Stuff model is extrapolating. Distance is measured in spread-of-pitchers units over velocity,
                  movement, release point, extension, arm angle and spin, to the 5th-closest other pitcher who
                  throws that pitch type (100+ pitches, any season 2023-2026). Flagged at UNIQUE_D or more.
  small sample  - fewer than SMALL_N pitches in the season (Location+ and Pitching+ are still heavily regressed).
A pitcher carries the unique-shape flag when at least UNIQUE_SHARE of his pitches are flagged pitch types.
  results gap   - actual run value minus what the Pitching model expected for the same pitches (rv - pj), per
                  pitcher-season, regressed for sample size (half weight at about 1,400 pitches) and bucketed:
                  well above / above / in line / below / well below at +-GAP_1 and +-GAP_2 grade points.
It also builds the league reference used for colour: the average grade and the spread among pitchers for the
same pitcher hand, batter side and pitch type (the grades themselves are not changed).
It also writes OV_RANDOM_POOL: 2026 pitchers with POOL_N+ pitches (id, name, team, hand) for the Overview's first-load pick.
Input: all.parquet, grades.json, scored_final.parquet (from steps 1-2), and the 2026 raw parquets (PITCH_DATA) for teams.
"""
import json, os, numpy as np, pandas as pd
OUT_JS=os.environ.get('OUT_JS','../../frontend/src/overviewGrades.js')
UNIQUE_D, UNIQUE_SHARE, SMALL_N, MIN_TYPE_N = 1.0, 0.40, 200, 50
GAP_1, GAP_2 = 4, 8
POOL_N = 600
F=["start_speed","ivb","hb","rel_side","release_z","extension","arm_angle","spin_rate"]
D=pd.read_parquet('all.parquet',columns=['pitcher_id','season','pitch_type','reg']+F); D=D[D.reg]
c=D.groupby(['pitcher_id','season','pitch_type']).agg(n=('ivb','size'),**{f:(f,'mean') for f in F}).reset_index()
c['d']=np.nan
for pt,g in c.groupby('pitch_type'):
    ref=g[g.n>=100]; sd=ref[F].std().values; R=ref[F].values/sd; rp=ref.pitcher_id.values
    for idx,row in g[g.n>=MIN_TYPE_N].iterrows():
        dist=np.sqrt(((R-row[F].values.astype(float)/sd)**2).mean(axis=1)); other=rp!=row.pitcher_id
        dd=pd.Series(dist[other],index=rp[other]).groupby(level=0).min().sort_values()
        if len(dd)>=5: c.loc[idx,'d']=dd.iloc[4]
G=json.load(open('grades.json')); out=G['grades']; lg=G['league']
for y,Y in out.items():
    cy=c[c.season==int(y)].set_index(['pitcher_id','pitch_type'])
    nu=ns=nb=0
    for p,e in Y.items():
        e.pop('f',None); e.pop('u',None)
        tot=e['a'][3]; u=[t for t in e['t'] if (int(p),t) in cy.index and cy.loc[(int(p),t),'d']>=UNIQUE_D]
        share=sum(e['t'][t][0][3] for t in u)/tot if tot else 0
        f=('u' if share>=UNIQUE_SHARE else '')+('s' if tot<SMALL_N else '')
        if u: e['u']=u
        if f: e['f']=f
        nu+='u' in f; ns+='s' in f; nb+=f=='us'
    print(y,'pitchers',len(Y),'| unique shape',nu,'| small sample',ns,'| both',nb,'| pitchers with any flagged pitch type',sum('u' in e for e in Y.values()))
# --- league reference by pitcher hand x batter side x pitch type: [mean grade, spread among pitchers] ---
S=pd.read_parquet('scored_final.parquet'); hand=pd.read_parquet('all.parquet',columns=['pitcher_id','pitcher_hand']).drop_duplicates('pitcher_id').set_index('pitcher_id').pitcher_hand
S['ph']=S.pitcher_id.map(hand); PTS=10/0.45; M=(('s','st'),('l','loc_val'),('p','pit'))
# --- results vs grades: e['r'] = [level -2..2, regressed gap in points, actual results on the grade scale] ---
S['res']=S.rv-S.pj; gq=S.groupby(['pitcher_id','season']).res.agg(['size','mean','var']); gq=gq[gq['size']>=60]
sw=np.average(gq['var'],weights=gq['size']-1); KGAP=sw/(gq['mean'].var()-np.mean(sw/gq['size'])); print('results-gap regression constant (pitches):',round(KGAP))
for y,Y in out.items():
    X=S[S.season==int(y)]; mrv=X.rv.mean(); a=X.groupby('pitcher_id').agg(n=('res','size'),res=('res','mean'),rv=('rv','mean')); cnt={}
    for p,e in Y.items():
        r=a.loc[int(p)]; gap=-r.res*100*PTS*r.n/(r.n+KGAP); lvl=int(np.sign(gap))*(2 if abs(gap)>=GAP_2 else 1 if abs(gap)>=GAP_1 else 0)
        e['r']=[lvl,int(round(gap)),int(round(100-PTS*100*(r.rv-mrv)))]; cnt[lvl]=cnt.get(lvl,0)+1
    print(y,'results vs grades:',{k:cnt.get(k,0) for k in (2,1,0,-1,-2)})
lg={}
for y,Y in out.items():
    X=S[S.season==int(y)]; mu={c:X[c].mean() for _,c in M}; L={}
    for h in ('R','L'):
        Xh=X[X.ph==h]; Yh=[e for p,e in Y.items() if hand.get(int(p))==h]
        def ref(sub,cells,minn,fallback=None):
            r={}
            for i,(m,c) in enumerate(M):
                v=[x[i] for x in cells if x and x[3]>=minn]; sd=round(float(np.std(v)),1) if len(v)>=8 else (fallback[m][1] if fallback else None)
                r[m]=[int(round(100-PTS*100*(sub[c].mean()-mu[c]))),sd]
            return r
        A={'a':ref(Xh,[e['a'] for e in Yh],600)}
        for i,sd in ((1,'L'),(2,'R')): A[sd]=ref(Xh[Xh.stand==sd],[e[sd] for e in Yh],300,A['a'])
        T={}
        for pt,Xt in Xh.groupby('pitch_type'):
            cells=[e['t'][pt] for e in Yh if pt in e['t']]
            if len(Xt)<500 or not cells: continue
            T[pt]={'a':ref(Xt,[c_[0] for c_ in cells],150,A['a'])}
            for i,sd in ((1,'L'),(2,'R')):
                if (Xt.stand==sd).sum()>=200: T[pt][sd]=ref(Xt[Xt.stand==sd],[c_[i] for c_ in cells],75,T[pt]['a'])
        L[h]={'all':A,'t':T}
    lg[y]=L; print(y,'league reference',{h:{k:v['s'] for k,v in L[h]['all'].items()} for h in L})
# --- first-load pool: [id, name, team, throws] ---
import glob
raw=pd.concat([pd.read_parquet(f,columns=['game_pk','game_date','pitcher_id','home_team','away_team','top_bottom']) for f in sorted(glob.glob(os.environ.get('PITCH_DATA','data')+'/2026/*.parquet'))])
raw=raw[raw.game_pk!=0].sort_values('game_date'); raw['team']=np.where(raw.top_bottom.astype(str).str.lower().str.startswith('top'),raw.home_team,raw.away_team)
team=raw.groupby('pitcher_id').team.last(); names=pd.read_parquet('all.parquet',columns=['pitcher_id','pitcher_name','season']); names=names[names.season==2026].drop_duplicates('pitcher_id').set_index('pitcher_id').pitcher_name
pool=[[int(p),names.get(int(p),''),team.get(int(p),''),hand.get(int(p),'')] for p,e in out['2026'].items() if e['a'][3]>=POOL_N and names.get(int(p))]
print('first-load pool',len(pool),pool[:3])
json.dump({'grades':out,'league':lg},open('grades.json','w'),separators=(',',':'))
open(OUT_JS,'w').write("// Generated by tools/pitch-grades (see README there). Stuff+ / Location+ / Pitching+ for 2025 and 2026.\n// Per pitcher: a / L / R = [Stuff+, Location+, Pitching+, pitches] overall / vs LHH / vs RHH; t[pitchType] = [all, vsL, vsR] of the same.\n// r = [results vs Pitching+ level (-2 well below .. 2 well above), sample-regressed gap in points, actual results on the grade scale].\n// f = low-confidence flags ('u' unique shape, 's' small sample); u = pitch types whose shape has few close matches among other pitchers.\n// 100 = league-average pitch that season; 10 points = 0.45 runs per 100 pitches on all three; small samples are regressed toward average.\n// OV_GRADES_LG[year][pitcherHand] = { all: {a,L,R}, t: {pitchType: {a,L,R}} }, each {s,l,p: [league mean, spread among pitchers]} for that\n// pitcher hand / batter side / pitch type (used for colour only).\nexport const OV_GRADES = "+json.dumps(out,separators=(',',':'))+";\nexport const OV_GRADES_LG = "+json.dumps(lg,separators=(',',':'))+";\nexport const OV_RANDOM_POOL = "+json.dumps(pool,ensure_ascii=False,separators=(',',':'))+";\n")
if __name__=='__main__':
    nm=pd.read_parquet('all.parquet',columns=['pitcher_id','pitcher_name']).drop_duplicates('pitcher_id').set_index('pitcher_id').pitcher_name
    Y=out['2026']; U=sorted([(nm.get(int(p),p),e['a'][3],e['a'][0],','.join(e.get('u',[]))) for p,e in Y.items() if 'u' in e.get('f','')],key=lambda r:-r[1])
    print('2026 unique-shape pitchers:',[(a,b,c_,d) for a,b,c_,d in U])
    big=[e for e in Y.values() if e['a'][3]>=600]; print('of pitchers with 600+ pitches:',len(big),'unique',sum('u' in e.get('f','') for e in big))
