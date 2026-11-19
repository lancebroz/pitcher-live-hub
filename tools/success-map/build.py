"""League run value by location for the Success maps -> frontend/src/overviewRvBase.js.     python build.py <statcast dir>

For every pitch type x pitcher hand x batter side: the league's average expected run value (batter-positive, the app's own
pitchRunValue(p, true)) in 1.5-inch cells, and its average over all locations. A cell is the plain average of the pitches
in it, leaning on a smoothed surface only where it holds few pitches, so an average pitcher's pitches net to zero at every
spot (the earlier, smoothed table read slightly green on the zone's edges and red off the plate for everybody)."""
import sys, json, numpy as np, pandas as pd, lib
from scipy.ndimage import gaussian_filter
X0, Z0, D, NX, NZ = -2.0, 0.5, 0.125, 32, 32
K_CELL, K_KEY, MIN_KEY = 8, 25, 2500          # pitches at which a cell is half its own average; same for the smooth surface vs the key's mean
def frames(root):
    out = []
    for season in (2025, 2026):
        d = lib.load(root, season); d['v'] = lib.value(d, season)[0]; out.append(d)
    d = pd.concat(out, ignore_index=True)
    d['xi'] = np.clip(np.floor((d.plate_x.astype(float) - X0) / D), 0, NX - 1).astype(int); d['zi'] = np.clip(np.floor((d.plate_z.astype(float) - Z0) / D), 0, NZ - 1).astype(int)
    return d
def tables(d):
    T, M = {}, {}
    for (pt, ph, st), g in d.groupby(['pitch_type', 'p_throws', 'stand']):
        if len(g) < MIN_KEY: continue
        sm = np.zeros((NZ, NX)); ct = np.zeros((NZ, NX)); np.add.at(sm, (g.zi, g.xi), g.v); np.add.at(ct, (g.zi, g.xi), 1); m0 = g.v.mean()
        prior = (gaussian_filter(sm, 1.6, mode='nearest') + K_KEY * m0) / (gaussian_filter(ct, 1.6, mode='nearest') + K_KEY)
        T[f'{pt}|{ph}|{st}'] = (sm + K_CELL * prior) / (ct + K_CELL); M[f'{pt}|{ph}|{st}'] = m0
    return T, M
if __name__ == '__main__':
    d = frames(sys.argv[1]); T, M = tables(d)
    js = ("// Generated (tools/success-map/build.py). League-average expected run value per pitch (runs x 1000, batter-positive) by location,\n"
          "// for the Success maps. Key: pitchType|pitcherHand|batterHand. t: 32 x 32 cells of 0.125 ft, plate_x from -2 ft (catcher's view),\n"
          "// plate_z from 0.5 ft, row-major from the bottom row. m: the same average over every location. 2025 + 2026 regular seasons.\n"
          "export const OV_RVBASE = " + json.dumps(dict(x0=X0, z0=Z0, d=D, nx=NX, nz=NZ, t={k: [int(round(v * 1000)) for v in a.flatten()] for k, a in T.items()},
                                                        m={k: round(v * 1000, 2) for k, v in M.items()}), separators=(',', ':')) + ";\n")
    open(__file__.rsplit('/tools/', 1)[0] + '/frontend/src/overviewRvBase.js', 'w').write(js); print(len(T), 'tables,', len(js) // 1024, 'KB')
