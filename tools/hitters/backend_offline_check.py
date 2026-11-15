"""Run the backend's batter Statcast endpoint against a Savant-shaped CSV built from the Statcast mirror (no network)."""
import sys, glob, asyncio, json, io, types
import pandas as pd
bid=int(sys.argv[1]); out=sys.argv[2]
s=pd.concat([pd.read_parquet(f) for f in sorted(glob.glob('/home/claude/dl_statcast/2025/*.parquet'))],ignore_index=True)
s=s[(s.batter==bid)&(s.game_type=='R')].drop_duplicates(['game_pk','at_bat_number','pitch_number']).sort_values(['game_date','game_pk','at_bat_number','pitch_number'],ascending=False)
s['game_date']=s.game_date.astype(str).str[:10]
for c in ('on_1b','on_2b','on_3b'): s[c]=s[c].map(lambda v: '' if pd.isna(v) else str(int(v)))
csv=s.to_csv(index=False)
sys.path.insert(0,'/home/claude/pitcher-live-hub/backend')
import main
class R:
    def __init__(s,text='',js=None): s.status_code=200; s.text=text; s._js=js
    def json(s): return s._js
seen=[]
class C:
    async def __aenter__(s): return s
    async def __aexit__(s,*a): return False
    async def get(s,url,params=None,**k):
        seen.append((url,params))
        if 'statcast_search' in url: return R(csv)
        if 'byDateRange' in url: return R(js={'stats':[{'splits':[{'team':{'id':1},'stat':{'hits':10,'atBats':40,'baseOnBalls':5,'hitByPitch':1,'sacFlies':0,'totalBases':20,'homeRuns':2,'plateAppearances':46}},{'team':{'id':2},'stat':{'hits':5,'atBats':20,'baseOnBalls':2,'hitByPitch':0,'sacFlies':1,'totalBases':8,'homeRuns':1,'plateAppearances':23}}]}]})
        return R(js={'stats':[{'splits':[{'team':{'id':1},'stat':{'hits':10,'atBats':40,'baseOnBalls':5,'hitByPitch':1,'sacFlies':0,'totalBases':20,'homeRuns':2,'plateAppearances':46}},{'numTeams':2,'stat':{'avg':'.250','hits':15,'atBats':60,'baseOnBalls':7,'hitByPitch':1,'sacFlies':1,'totalBases':28,'homeRuns':3,'plateAppearances':69}}]}]})
main.httpx.AsyncClient=C
rows=asyncio.run(main.get_batter_statcast(bid,'2025-03-27','2025-09-28'))
json.dump(rows,open(out,'w'))
p=seen[0][1]; print('rows',len(rows),'| savant params:',p['player_type'],{k:v for k,v in p.items() if 'lookup' in k})
print('bunts tagged:',sum(1 for r in rows if str(r['bb_type']).startswith('bunt')),'| sample keys ok:',all(k in rows[0] for k in ('outs','on_1b','delta_run_exp','stand','p_throws','at_bat_number')))
print('season line:',asyncio.run(main.get_batter_line(bid,2025)))
print('range line :',asyncio.run(main.get_batter_line(bid,2025,'2025-05-01','2025-05-31')))
print('urls:',[u for u,_ in seen[1:]])
# pitcher endpoint unchanged
seen.clear(); main._cache.clear(); r2=asyncio.run(main.get_statcast(bid,'2025-03-27','2025-09-28')); p=seen[0][1]; print('pitcher call:',p['player_type'],{k:v for k,v in p.items() if 'lookup' in k},len(r2))
