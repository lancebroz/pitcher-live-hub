import pandas as pd, numpy as np
RPP=0.0299
d=pd.read_parquet('/home/claude/proc/scored.parquet')
g=d.groupby(['year','batter_id']).agg(n=('sw','size'),name=('name','first'),**{c:(c,'mean') for c in ['dec_basic','con_basic','pow_basic','dec_full','con_full','pow_full']}).reset_index()
for v in ('basic','full'):
    for c in ('dec','con','pow'): g[f'{c}{v[0]}']=100*g[f'{c}_{v}']/RPP
    g[f'proc_{v}']=100+g[f'dec{v[0]}']+g[f'con{v[0]}']+g[f'pow{v[0]}']
# results side: wOBA and xwOBA per hitter-season from the hitter library frames
res=[]
for y in (2025,2026):
    h=pd.read_parquet(f'/home/claude/hit/h{str(y)[2:]}x.parquet'); ev=h.ev
    w=0.69*(h.bbk&~h.ibb)+0.72*h.hbp+0.88*(h.hit&(ev=='single'))+1.25*(h.hit&(ev=='double'))+1.59*(h.hit&(ev=='triple'))+2.04*(h.hit&(ev=='home_run'))
    den=(h.ab|(h.bbk&~h.ibb)|h.hbp|h.sf)
    r=h.assign(_w=w,_d=den).groupby('batter_id').agg(pa=('pa','sum'),wn=('_w','sum'),wd=('_d','sum'),xn=('xw_num','sum'),xd=('xw_den','sum')); r['woba']=r.wn/r.wd; r['xwoba']=r.xn/r.xd; r['year']=y; res.append(r.reset_index())
g=g.merge(pd.concat(res),on=['year','batter_id'],how='left'); g.to_parquet('/home/claude/proc/hitters.parquet')
q=g[g.n>=1200]
print('hitter-seasons with 1,200+ pitches:',len(q))
for v in ('basic','full'):
    print(f'\n[{v}] Process+ mean {q["proc_"+v].mean():.1f} sd {q["proc_"+v].std():.1f} min {q["proc_"+v].min():.0f} max {q["proc_"+v].max():.0f} | component sd: Decisions {q["dec"+v[0]].std():.1f} Contact {q["con"+v[0]].std():.1f} Power {q["pow"+v[0]].std():.1f}')
    print('   same season: r² with wOBA %.3f, with xwOBA %.3f'%(np.corrcoef(q['proc_'+v],q.woba)[0,1]**2,np.corrcoef(q['proc_'+v],q.xwoba)[0,1]**2))
    # runs check: wOBA above average per pitch in runs vs process runs per pitch
    wraa=(q.woba-0.315)/1.235/3.89; pr=(q['proc_'+v]-100)/100*RPP; sl=np.polyfit(pr,wraa,1); print('   slope of actual runs above average per pitch on Process runs per pitch: %.2f'%sl[0])
a=g[(g.year==2025)&(g.n>=1200)].merge(g[(g.year==2026)&(g.n>=1200)],on='batter_id',suffixes=('_25','_26'))
print('\nnext season (2025 -> 2026), %d hitters with 1,200+ pitches both years: r² with 2026 wOBA'%len(a))
for c in ('proc_basic_25','proc_full_25','woba_25','xwoba_25'): print('   %-14s %.3f'%(c,np.corrcoef(a[c],a.woba_26)[0,1]**2))
print('   year-to-year r² of Process+ itself: basic %.3f full %.3f'%(np.corrcoef(a.proc_basic_25,a.proc_basic_26)[0,1]**2,np.corrcoef(a.proc_full_25,a.proc_full_26)[0,1]**2))
print('   components year to year (full): Decisions %.3f Contact %.3f Power %.3f'%tuple(np.corrcoef(a[c+'_25'],a[c+'_26'])[0,1]**2 for c in ('decf','conf','powf')))
print('\nBasic vs Full, same hitter-season: r %.3f | mean abs difference %.1f | 95th pct %.1f'%(np.corrcoef(q.proc_basic,q.proc_full)[0,1],(q.proc_basic-q.proc_full).abs().mean(),(q.proc_basic-q.proc_full).abs().quantile(.95)))
for y in (2025,2026):
    t=q[q.year==y].sort_values('proc_full',ascending=False)
    print(f'\n{y} top 12 (full):'); print(t.head(12)[['name','n','decf','conf','powf','proc_full','proc_basic','woba']].round(1).assign(woba=t.head(12).woba.round(3)).to_string(index=False))
    print(f'{y} bottom 5:'); print(t.tail(5)[['name','n','decf','conf','powf','proc_full','proc_basic']].round(1).to_string(index=False))
t=q.assign(diff=q.proc_full-q.proc_basic).sort_values('diff'); print('\nlargest Full - Basic gaps:'); print(pd.concat([t.head(5),t.tail(5)])[['year','name','proc_basic','proc_full','diff','decb','decf','conb','conf','powb','powf']].round(1).to_string(index=False))
