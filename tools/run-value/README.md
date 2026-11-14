# Run value (Overview: Value container, Success heatmap, Leaderboard RV)

Two constructions live in the app.

## 1. Savant-style (Value container, completed seasons)

Reproduces Baseball Savant's two pitching run values and splits them by batter side and count bucket.

- **Leveraged**: the run-expectancy change of the pitch's outcome in its actual base/out/count state.
  Savant prices the *event* in that state (every single with a man on first and one out is worth the same,
  whatever the runner did).
- **Context-neutral**: the leveraged value multiplied by a weight `k[bases, outs]`, large in low-leverage
  states (bases empty, two out: 2.60) and small in high-leverage ones (bases loaded, none out: 0.39).
  Statcast's per-pitch `delta_run_exp` column is this version.
- **Park**: Savant's published totals carry a park adjustment the per-pitch column does not. It is fitted
  per home park and outcome class so pitcher x pitch-type sums match Savant's published totals.
- **Expected (xRV)**: balls in play are re-priced by the outcome mix of their exit velocity / launch angle
  cell, in the same base/out state. No park term on those pitches.

`k` and the run-expectancy table were recovered from the per-pitch values themselves (`solve_lev2.py`),
using events whose result is fixed: home run, triple, walk, hit by pitch, strikeout.

Validation against Savant's pitch arsenal leaderboard, 2026, 849 pitcher x pitch-type rows (291+ pitches):

| | r | within 1 run |
|---|---|---|
| Context-neutral | 0.997 | 99.8% |
| Leveraged | 0.997 | 99.3% |

The park term is fitted on the context-neutral totals only, so the leveraged row is an independent check.

Pipeline (paths at the top of each script point at a local working directory):

1. `sv_load.py`, `solve_lev.py`, `solve_lev2.py`: load Statcast pitch files, recover `k` and RE24 -> `lev_consts.json`
2. `lev_validate.py`: attach leveraged values, compare with a Savant export
3. `gen_sv_value.py`: neutral / leveraged x actual / expected per pitch, park term
4. `gen_sv_files.py`: writes `frontend/src/overviewValueSv{year}.js` and `overviewValueSvRef.js`

Inputs: Statcast pitch-level files with `delta_run_exp`, `on_1b/2b/3b`, `outs_when_up` (pulled from the
public Hugging Face dataset `elcax1/mlb-statcast`, which mirrors Savant's CSV), plus a Savant pitch arsenal
export per season for the park fit.

The live feed (mlb-pitcher-data parquets) has no runners-on or run-scoring fields, so this cannot be
computed for a season in progress. The Value container then falls back to construction 2 and the
Leveraged toggle is disabled.

## 2. Linear weights (Success heatmap, Leaderboard RV, Tracker / Compare, Value fallback)

FanGraphs-style: one value per event from season wOBA weights, count values centered on the league, no
base/out state. `pitchRunValue` in `frontend/src/App.jsx` and `_pitch_run_values` in `backend/main.py`;
`gen_value.py` is the Python replica and `gen_refs.py` writes `overviewRvBase.js` / `overviewValueRef.js`.
Tracks Savant's context-neutral totals at r = 0.95.
