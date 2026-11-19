"""The app's context-neutral expected run value of a pitch (pitchRunValue(p, true) in App.jsx), batter-positive, on Statcast rows.
The season constants and the contact-value table are read out of App.jsx so the two cannot drift; validate.js checks the port."""
import re, json, glob, subprocess, numpy as np, pandas as pd
APP = __file__.rsplit('/tools/', 1)[0] + '/frontend/src/App.jsx'
_src = open(APP).read()
_blk = _src[_src.index('const RV_SEASON = '):]; _blk = _blk[:_blk.index('\n};') + 3]
RV = {int(k): v for k, v in json.loads(subprocess.run(['node', '-e', _blk + ';console.log(JSON.stringify(RV_SEASON))'], capture_output=True, text=True, check=True).stdout).items()}
_x = _src[_src.index('const XWOBACON = ') + len('const XWOBACON = '):]; XW = json.loads(_x[:_x.index('}') + 1])
XL = float(re.search(r'const XWOBACON_LEAGUE = ([\d.]+)', _src).group(1))
_o = _src[_src.index('const RV_OUT_EVENTS = '):]; OUT_EVENTS = re.findall(r'"([a-z_]+)"', _o[:_o.index('];')])
COLS = ['pitch_type', 'pitcher', 'batter', 'p_throws', 'stand', 'plate_x', 'plate_z', 'description', 'events', 'balls', 'strikes', 'launch_speed', 'launch_angle', 'game_type', 'game_date', 'game_pk', 'at_bat_number', 'pitch_number']

def load(root, season):
    d = pd.concat([pd.read_parquet(f, columns=COLS) for f in sorted(glob.glob(f'{root}/{season}/*.parquet'))], ignore_index=True)
    d = d[(d.game_type == 'R') & d.plate_x.notna() & d.plate_z.notna() & d.pitch_type.notna() & d.p_throws.isin(['L', 'R']) & d.stand.isin(['L', 'R'])]
    return d.drop_duplicates(['game_pk', 'at_bat_number', 'pitch_number']).assign(season=season).reset_index(drop=True)

def value(df, season):
    K = RV[season]; lg, sc = K['lg'], K['scale']; OUT = -lg / sc
    lw = {e: OUT for e in OUT_EVENTS}; lw.update({e: (w - lg) / sc for e, w in K['w'].items()}); lw['catcher_interf'] = lw['walk']; lw['intent_walk'] = 0.0
    b = df.balls.fillna(0).astype(int).clip(0, 3).to_numpy(); s = df.strikes.fillna(0).astype(int).clip(0, 2).to_numpy()
    re_ = np.zeros((5, 4))
    for k, v in K['re'].items(): re_[int(k[0]), int(k[2])] = v
    cur = re_[b, s]; de = df.description.fillna(''); ev = df.events.fillna('').str.lower().str.strip()
    ip = de.str.contains('into_play').to_numpy()
    wh = (de.str.contains('foul_tip') | (de.str.contains('swinging') & de.str.contains('strike')) | (de == 'missed_bunt')).to_numpy()
    cs = (de.str.contains('called') & de.str.contains('strike')).to_numpy()
    sw = (de.str.contains('swing') | de.str.contains('foul') | ip | (de == 'missed_bunt')).to_numpy()
    hbp = (de == 'hit_by_pitch').to_numpy(); ball = de.str.contains('ball').to_numpy() & ~sw & ~cs & ~ip & ~hbp      # normalizeLivePitch's is_ball
    v = ev.map(lw).fillna(OUT).to_numpy()
    es, la = df.launch_speed.astype(float).to_numpy(), df.launch_angle.astype(float).to_numpy(); ok = ~np.isnan(es) & ~np.isnan(la)
    evb = (np.floor(np.clip(np.nan_to_num(es), 40, 115) / 5 + 0.5) * 5).astype(int); lab = (np.floor(np.clip(np.nan_to_num(la), -60, 80) / 10 + 0.5) * 10).astype(int)
    xw = np.array([XW.get(f'{a}|{c}', XL) for a, c in zip(evb, lab)])
    v = np.where(ok, (xw - lg) / sc + K['xoff'], v)
    nb = np.where(b == 3, lw['walk'], re_[np.minimum(b + 1, 4), s]); ns = np.where(s == 2, lw['strikeout'], re_[b, np.minimum(s + 1, 3)])
    out = np.where(ip, v - cur, np.where(hbp, lw['hit_by_pitch'] - cur, np.where(ball, nb - cur,
          np.where(wh | cs, ns - cur, np.where(sw, np.where(s >= 2, 0, ns - cur), 0)))))
    return out, dict(is_in_play=ip, is_ball=ball, is_whiff=wh, is_called_strike=cs, is_swing=sw)
