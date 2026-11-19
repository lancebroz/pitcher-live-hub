"""60,000 random pitches per season with the port's value, for validate.js.   python sample.py <statcast dir> > sample.json"""
import sys, json, pandas as pd, lib
rows = []
for season in (2025, 2026):
    d = lib.load(sys.argv[1], season).sample(60000, random_state=season); v, f = lib.value(d, season)
    num = lambda x: None if pd.isna(x) else float(x)
    for i, r in enumerate(d.itertuples()):
        o = dict(game_date=str(r.game_date)[:10], balls=int(r.balls), strikes=int(r.strikes), events=None if pd.isna(r.events) else r.events, description=r.description,
                 launch_speed=num(r.launch_speed), launch_angle=num(r.launch_angle), py=float(v[i]))
        o.update({k: bool(a[i]) for k, a in f.items()}); rows.append(o)
json.dump(rows, sys.stdout)
