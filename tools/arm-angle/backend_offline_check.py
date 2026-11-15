"""Offline harness: backend responses for the arm-angle work, built from local data (no network).
  - /api/pitcher/{id}/cached-season      from the local mlb-pitcher-data monthly parquets (current season, feed rows)
  - /api/pitcher/{id}/statcast           from a Savant-shaped CSV built out of the Statcast archive (past season)
  - /api/pitcher/{id}/arm-angle          same CSV path, aggregated by day
"""
import sys, glob, asyncio, json
import pandas as pd
sys.path.insert(0,'/home/claude/pitcher-live-hub/backend'); import main
pid=int(sys.argv[1]); out=sys.argv[2]
feed=pd.concat([pd.read_parquet(f) for f in sorted(glob.glob('/home/claude/mlb-pitcher-data/data/raw/2026/monthly/*.parquet'))],ignore_index=True)
feed=feed[pd.to_numeric(feed.pitcher_id,errors='coerce')==pid].copy()
async def _local(): return feed
main._load_local_savant_async=_local
cs=asyncio.run(main.get_cached_season(pid)); json.dump(cs,open(f'{out}/cs_{pid}.json','w')); print('cached-season rows',len(cs),'| has arm_angle key:', 'arm_angle' in cs[0])
def csv_for(season):
    s=pd.concat([pd.read_parquet(f) for f in sorted(glob.glob(f'/home/claude/dl_statcast/{season}/*.parquet'))],ignore_index=True)
    s=s[(s.pitcher==pid)&(s.game_type=='R')].drop_duplicates(['game_pk','at_bat_number','pitch_number']).sort_values(['game_date','game_pk','at_bat_number','pitch_number'],ascending=False)
    s['game_date']=s.game_date.astype(str).str[:10]
    for c in ('on_1b','on_2b','on_3b'): s[c]=s[c].map(lambda v: '' if pd.isna(v) else str(int(v)))
    return s.to_csv(index=False)
CSV={y:csv_for(y) for y in (2025,2026)}; seen=[]
class R:
    def __init__(s,text): s.status_code=200; s.text=text
class C:
    async def __aenter__(s): return s
    async def __aexit__(s,*a): return False
    async def get(s,url,params=None,**k):
        seen.append(params); return R(CSV[int(params['game_date_gt'][:4])])
main.httpx.AsyncClient=C
sc=asyncio.run(main.get_statcast(pid,'2025-03-18','2025-09-28')); json.dump(sc,open(f'{out}/sc_{pid}.json','w'))
print('2025 statcast rows',len(sc),'| with arm_angle',sum(1 for r in sc if r.get('arm_angle') is not None))
aa=asyncio.run(main.get_pitcher_arm_angle(pid,2026)); json.dump(aa,open(f'{out}/aa_{pid}.json','w'))
d=sorted(aa['days']); print('2026 arm-angle days',len(d),'| Savant call dates',seen[-1]['game_date_gt'],seen[-1]['game_date_lt'],'| sample',d[0],aa['days'][d[0]])
