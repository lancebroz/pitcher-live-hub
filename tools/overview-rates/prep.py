"""Statcast monthly files -> one table of regular-season pitches with the app's own pitch flags (normalizeLivePitch).
python prep.py <dir with <season>/<yyyy-mm>.parquet> <out.parquet>"""
import sys, glob, numpy as np, pandas as pd
NAME = {'FF': '4-Seam Fastball', 'SI': 'Sinker', 'FC': 'Cutter', 'CH': 'Changeup', 'FS': 'Splitter', 'SL': 'Slider', 'ST': 'Sweeper', 'CU': 'Curveball', 'KC': 'Knuckle Curve', 'SV': 'Slurve'}
COLS = ['pitch_type', 'game_date', 'pitcher', 'events', 'description', 'zone', 'des', 'game_type', 'stand', 'p_throws', 'bb_type', 'balls', 'strikes',
        'plate_x', 'plate_z', 'sz_top', 'sz_bot', 'launch_speed', 'launch_angle', 'game_pk', 'at_bat_number', 'pitch_number']
d = pd.concat([pd.read_parquet(f, columns=COLS).assign(season=int(f.split('/')[-2])) for f in sorted(glob.glob(sys.argv[1] + '/*/*.parquet'))], ignore_index=True)
d = d[(d.game_type == 'R') & d.pitch_type.isin(list(NAME))].drop_duplicates(['game_pk', 'at_bat_number', 'pitch_number']).copy()
d['pn'] = d.pitch_type.map(NAME); de = d.description.fillna('')
d['sw'] = (de.str.contains('swing') | de.str.contains('foul') | de.str.contains('into_play') | (de == 'missed_bunt')).astype(int)
d['wh'] = (de.str.contains('foul_tip') | (de.str.contains('swinging') & de.str.contains('strike')) | (de == 'missed_bunt')).astype(int)
d['cs'] = (de.str.contains('called') & de.str.contains('strike')).astype(int); d['ip'] = de.str.contains('into_play').astype(int)
px, pz = d.plate_x.astype(float), d.plate_z.astype(float); z = d.zone.astype(float)
d['iz'] = np.where(z.notna(), (z >= 1) & (z <= 9), px.notna() & pz.notna() & (px.abs() <= 0.83) & (pz >= 1.5) & (pz <= 3.5)).astype(int)
d['bunt'] = d.des.fillna('').str.contains('bunt', case=False).astype(int) * d.ip
ev = d.events.fillna(''); s = d.strikes.astype(float)
d['kk'] = (ev.isin(['strikeout', 'strikeout_double_play']) & ((d.wh == 1) | (d.cs == 1)) & (s == 2)).astype(int)
TB = {'single': 1, 'double': 2, 'triple': 3, 'home_run': 4}
OUTS = ['field_out', 'force_out', 'grounded_into_double_play', 'double_play', 'triple_play', 'field_error', 'fielders_choice', 'fielders_choice_out', 'other_out', 'batter_out']
con = (d.ip == 1) & ev.isin(list(TB) + OUTS)
d['tb'] = np.where(con, ev.map(TB).fillna(0), 0).astype(int); d['ab'] = (con | (d.kk == 1)).astype(int)
# non-competitive pitch (isNonCompetitive): more than a foot outside an expanded zone
top = np.where(d.sz_top.astype(float) > 1, d.sz_top.astype(float), 3.4); bot = np.where(d.sz_bot.astype(float) > 0.5, d.sz_bot.astype(float), 1.6)
dx = np.maximum(0, px.abs() - 17 / 2 / 12); far = np.hypot(dx, np.maximum(np.maximum(0, pz - top), (2 / 3) * np.maximum(0, bot - pz))) * 12
d['nc'] = (px.notna() & pz.notna() & (far > 12)).astype(int)
d.to_parquet(sys.argv[2], index=False); print(len(d), d.groupby('season').size().to_dict())
