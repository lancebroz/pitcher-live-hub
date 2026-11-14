"""Expected batting average on contact by exit velocity / launch angle cell (non-bunt batted balls, 2026 regular season).
Cells with fewer than 20 batted balls borrow the neighbouring exit-velocity cells, then the launch-angle band."""
import sys, json; sys.path.insert(0, '/home/claude/hit')
import hlib
d = hlib.load(2026)
B = d[d.bbe & d.launch_speed.notna() & d.launch_angle.notna()]
c = B.groupby(['evb', 'lab']).agg(n=('hit', 'size'), h=('hit', 'sum')).reset_index()
cells = {(int(r.evb), int(r.lab)): (r.n, r.h) for r in c.itertuples()}
band = B.groupby('lab').hit.mean().to_dict(); lg = float(B.hit.mean()); G = {}
for (e, l), (n, h) in cells.items():
    if n >= 20: G[f'{e}|{l}'] = round(h / n, 3); continue
    nn, hh = n, h
    for de in (-5, 5):
        if (e + de, l) in cells: nn += cells[(e + de, l)][0]; hh += cells[(e + de, l)][1]
    G[f'{e}|{l}'] = round(hh / nn, 3) if nn >= 20 else round((h + 20 * band.get(l, lg)) / (n + 20), 3)
json.dump({'G': G, 'lg': round(lg, 3)}, open('/home/claude/hit/xbacon.json', 'w'))
d.to_parquet('/home/claude/hit/h26.parquet')
