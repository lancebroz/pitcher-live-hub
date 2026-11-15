"""Hitter stats from mlb-pitcher-data pitches, mirroring the app's definitions (frontend/src/hitterStats.js)."""
import re, json, glob, numpy as np, pandas as pd
APP='/home/claude/pitcher-live-hub/frontend/src/App.jsx'
def grid(name):
    s=open(APP).read(); m=re.search(r'const '+name+r' = (\{[^;]*\});',s); return json.loads(m.group(1))
BT={98:(26,30),99:(25,31),100:(24,33),101:(23,34),102:(22,35),103:(21,36),104:(20,37),105:(19,38),106:(18,39),107:(17,40),108:(16,41),109:(15,42),110:(14,43),111:(13,44),112:(12,45),113:(11,46),114:(10,47),115:(9,48),116:(8,50)}
HIT={'single','double','triple','home_run'}; TB={'single':1,'double':2,'triple':3,'home_run':4}
OUTS={"field_out","force_out","grounded_into_double_play","double_play","triple_play","field_error","fielders_choice","fielders_choice_out","other_out","batter_out"}
def load(year=2026):
    cols=['game_pk','game_date','at_bat_number','pitch_number','batter_id','batter_name','pitcher_id','stand','pitcher_hand','pitch_type','pitch_name','balls','strikes','outs','on_1b','on_2b','on_3b','call_description','events','is_in_play','is_ball','zone','trajectory','launch_speed','launch_angle','half_inning','home_team','away_team']
    d=pd.concat([pd.read_parquet(f,columns=cols) for f in sorted(glob.glob(f'/home/claude/mlb-pitcher-data/data/raw/{year}/monthly/*.parquet'))],ignore_index=True)
    d=d[(d.game_date.astype(str)<=f'{year}-09-28')&(d.game_pk!=0)].drop_duplicates(['game_pk','at_bat_number','pitch_number']).reset_index(drop=True)
    d['bat_team']=np.where(d.half_inning.astype(str).str.lower().str.startswith('top'),d.away_team,d.home_team)
    return flags(d)
def jsround(x): return np.floor(x+0.5)
def flags(d):
    desc=d.call_description.fillna('').str.lower(); ev=d.events.fillna('').str.lower().str.strip(); d['ev']=ev
    tip=desc.str.contains('foul_tip'); d['sw']=desc.str.contains('swing')|desc.str.contains('foul')|desc.str.contains('into_play')|desc.str.contains('missed_bunt')
    d['wh']=tip|(desc.str.contains('swinging')&desc.str.contains('strike'))|desc.str.contains('missed_bunt'); d['cs']=desc.str.contains('called')&desc.str.contains('strike')
    d['ip']=d.is_in_play.fillna(False).astype(bool)|desc.str.contains('into_play')
    z=d.zone; d['iz']=z.between(1,9); d['oz']=z.between(11,14)
    tr=d.trajectory.fillna(''); d['bunt']=tr.str.startswith('bunt'); d['bbe']=d.ip&~d.bunt
    ls=d.launch_speed; la=d.launch_angle; evi=np.minimum(jsround(ls),116); lo=evi.map(lambda v:BT.get(v,(999,-999))[0]); hi=evi.map(lambda v:BT.get(v,(999,-999))[1])
    d['brl']=d.ip&ls.notna()&la.notna()&(ls>=98)&(la>=lo)&(la<=hi)
    d['gb']=tr=='ground_ball'; d['fb']=tr=='fly_ball'
    b=pd.to_numeric(d.balls,errors='coerce'); s=pd.to_numeric(d.strikes,errors='coerce')
    d['k']=ev.isin(['strikeout','strikeout_double_play'])&(d.wh|d.cs)&(s==2)
    d['bbk']=ev.isin(['walk','intent_walk'])&d.is_ball.fillna(False).astype(bool)&(b==3); d['ibb']=d.bbk&(ev=='intent_walk')
    d['hbp']=(ev=='hit_by_pitch')&desc.str.contains('hit_by_pitch')
    d['hit']=d.ip&ev.isin(HIT); d['tb']=np.where(d.ip,ev.map(TB).fillna(0).astype(float),0.0); d['cout']=d.ip&ev.isin(OUTS)
    d['sf']=d.ip&ev.isin(['sac_fly','sac_fly_double_play']); d['sh']=d.ip&(ev=='sac_bunt')
    d['ab']=d.hit|d.cout|d.k; d['pa']=d.ab|d.bbk|d.hbp|d.sf|d.sh
    # EV / LA cells shared by the expected-stat grids (JS Math.round)
    d['evb']=(jsround(ls.clip(40,115)/5)*5); d['lab']=(jsround(la.clip(-60,80)/10)*10)
    return d
def lookup(d,G,league):
    key=d.evb.fillna(-1).astype(int).astype(str)+'|'+d.lab.fillna(-999).astype(int).astype(str)
    v=key.map(G); has=d.launch_speed.notna()&d.launch_angle.notna()
    return np.where(has,pd.to_numeric(v,errors='coerce').fillna(league).astype(float),np.nan).astype(float)
def results(d, XW, XS, XB):
    """Per-group sums needed for every Results stat. d must carry xw, xs, xb columns (per BBE)."""
    raise NotImplementedError

STATS=[('xwoba',1),('xba',1),('xslg',1),('ev',1),('maxev',1),('barrel',1),('hardhit',1),('hhla',0),('gb',-1),('fb',1),
       ('k',-1),('bb',1),('swing',0),('chase',-1),('contact',1),('zswing',1),('zcontact',1),('zmiss',-1)]
def attach_x(d):
    XW=grid('XWOBACON'); XS=grid('XSLGCON'); XB=json.load(open('/home/claude/hit/xbacon.json'))
    t=d.bbe; d['xwc']=np.where(t,lookup(d,XW,0.362),np.nan); d['xsc']=np.where(t,lookup(d,XS,0.528),np.nan); d['xbc']=np.where(t,lookup(d,XB['G'],XB['lg']),np.nan)
    ev=d.ev
    fbw=ev.map({'single':0.882,'double':1.254,'triple':1.590,'home_run':2.050}).fillna(0.0)
    # xwOBA numerator / denominator per pitch (same gating as the app's xwobaParts)
    inx=d.bbe&~ev.isin(['sac_bunt','sac_bunt_double_play','strikeout','strikeout_double_play','walk','intent_walk','hit_by_pitch',''])
    bbn=d.bbk&(ev=='walk')
    d['xw_num']=np.where(bbn,0.689,np.where(d.hbp,0.720,np.where(inx,np.where(np.isnan(d.xwc),fbw,d.xwc),0.0)))
    d['xw_den']=(d.k|bbn|d.hbp|inx).astype(int)
    # xSLG / xBA: expected value on tracked contact, actual when untracked, over at-bats
    inab=d.bbe&(d.hit|d.cout)
    d['xs_num']=np.where(inab,np.where(np.isnan(d.xsc),d.tb,d.xsc),0.0); d['xb_num']=np.where(inab,np.where(np.isnan(d.xbc),d.hit.astype(float),d.xbc),0.0)
    d['x_ab']=(inab|d.k).astype(int)
    return d
def agg(d,keys):
    hasev=d.bbe&d.launch_speed.notna(); hh=hasev&(d.launch_speed>=95)
    t=d.assign(_hasev=hasev,_hh=hh,_evs=d.launch_speed.where(hasev),_hhla=d.launch_angle.where(hh&d.launch_angle.notna()),_hhlan=(hh&d.launch_angle.notna()),
               _gb=d.bbe&d.gb,_fb=d.bbe&d.fb,_brl=d.bbe&d.brl,_ozs=d.oz&d.sw,_izs=d.iz&d.sw,_izw=d.iz&d.sw&d.wh,_whs=d.sw&d.wh)
    g=t.groupby(keys).agg(n=('sw','size'),pa=('pa','sum'),k=('k','sum'),bbk=('bbk','sum'),xw_num=('xw_num','sum'),xw_den=('xw_den','sum'),xs_num=('xs_num','sum'),xb_num=('xb_num','sum'),x_ab=('x_ab','sum'),
        bbe=('bbe','sum'),nev=('_hasev','sum'),evsum=('_evs','sum'),maxev=('_evs','max'),hh=('_hh','sum'),hhla=('_hhla','sum'),hhlan=('_hhlan','sum'),gbn=('_gb','sum'),fbn=('_fb','sum'),brl=('_brl','sum'),
        sw=('sw','sum'),wh=('_whs','sum'),oz=('oz','sum'),ozs=('_ozs','sum'),iz=('iz','sum'),izs=('_izs','sum'),izw=('_izw','sum'))
    f=lambda a,b: a/b.where(b>0)
    o=pd.DataFrame({'n':g.n,'pa':g.pa,'bbe':g.bbe,'xwoba':f(g.xw_num,g.xw_den),'xba':f(g.xb_num,g.x_ab),'xslg':f(g.xs_num,g.x_ab),'ev':f(g.evsum,g.nev),'maxev':g.maxev,
        'barrel':100*f(g.brl,g.bbe),'hardhit':100*f(g.hh,g.nev),'hhla':f(g.hhla,g.hhlan),'gb':100*f(g.gbn,g.bbe),'fb':100*f(g.fbn,g.bbe),
        'k':100*f(g.k,g.pa),'bb':100*f(g.bbk,g.pa),'swing':100*f(g.sw,g.n),'chase':100*f(g.ozs,g.oz),'contact':100*(1-f(g.wh,g.sw)),'zswing':100*f(g.izs,g.iz),'zcontact':100*(1-f(g.izw,g.izs)),'zmiss':100*f(g.izw,g.izs)})
    return o


def load_savant(year=2025, start='2025-03-27', end='2025-09-28'):
    """Statcast rows shaped like what the app gets for a past season (backend /api/batter/{id}/statcast), same flags as load()."""
    c=['game_pk','game_date','at_bat_number','pitch_number','batter','pitcher','stand','p_throws','pitch_type','pitch_name','balls','strikes','outs_when_up','on_1b','on_2b','on_3b','description','events','type','zone','bb_type','launch_speed','launch_angle','des','game_type','delta_run_exp','inning_topbot','home_team','away_team','player_name']
    s=pd.concat([pd.read_parquet(f,columns=c) for f in sorted(glob.glob(f'/home/claude/dl_statcast/{year}/*.parquet'))],ignore_index=True)
    gd=s.game_date.astype(str).str[:10]; s=s[(s.game_type=='R')&(gd>=start)&(gd<=end)].drop_duplicates(['game_pk','at_bat_number','pitch_number']).reset_index(drop=True)
    pt=s.pitch_type.fillna(''); pn=s.pitch_name.fillna(''); ev=s.events.fillna('')
    valid=(pt!='')&(pt!='PO')&(pt!='UN')&(pn!='Other')            # the app keeps a pitch with a real pitch type, or any pitch that carries an event
    s=s[valid|(ev.str.strip()!='')].reset_index(drop=True)
    bunt=(s['type']=='X')&s.des.fillna('').str.contains('bunt',case=False)
    desc=s.description.fillna('').str.lower(); sw=desc.str.contains('swing')|desc.str.contains('foul')|desc.str.contains('into_play')|desc.str.contains('missed_bunt'); cs=desc.str.contains('called')&desc.str.contains('strike')
    d=pd.DataFrame({'game_pk':s.game_pk,'game_date':s.game_date.astype(str).str[:10],'at_bat_number':s.at_bat_number,'pitch_number':s.pitch_number,'batter_id':s.batter,'pitcher_id':s.pitcher,'stand':s.stand,'pitcher_hand':s.p_throws,
        'pitch_type':s.pitch_type,'pitch_name':s.pitch_name,'balls':s.balls,'strikes':s.strikes,'outs':s.outs_when_up,'on_1b':s.on_1b.notna(),'on_2b':s.on_2b.notna(),'on_3b':s.on_3b.notna(),
        'call_description':s.description,'events':s.events,'is_in_play':s['type']=='X','is_ball':(~sw&~cs&~(s['type']=='X')&desc.str.contains('ball')&~desc.str.contains('hit_by_pitch')),'zone':s.zone,
        'trajectory':np.where(bunt,'bunt_'+s.bb_type.fillna('grounder'),s.bb_type),'launch_speed':s.launch_speed,'launch_angle':s.launch_angle,'dre':s.delta_run_exp.astype(float),
        'bat_team':np.where(s.inning_topbot=='Top',s.away_team,s.home_team),'batter_name':s.player_name})
    return flags(d)

def line(d,keys):
    t=d.assign(_h=d.hit,_tb=d.tb,_hr=d.ip&(d.ev=='home_run'))
    g=t.groupby(keys).agg(pa=('pa','sum'),ab=('ab','sum'),h=('_h','sum'),tb=('_tb','sum'),hr=('_hr','sum'),bb=('bbk','sum'),hbp=('hbp','sum'),sf=('sf','sum'))
    g['avg']=g.h/g.ab; g['obp']=(g.h+g.bb+g.hbp)/(g.ab+g.bb+g.hbp+g.sf); g['slg']=g.tb/g.ab; return g
