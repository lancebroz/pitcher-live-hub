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

### Per pitch, for a season in progress

`frontend/src/rvSavant.js` (and `_pitch_run_values` in `backend/main.py`) compute the same values pitch by
pitch from the base/out state the feed now carries (`on_1b`, `on_2b`, `on_3b`, `outs`; mlb-pitcher-data
fetches since 2026-11):

    leveraged = E[outcome][bo] - R[bo][count]        pitch that ends the plate appearance
              = R[bo][next count] - R[bo][count]     any other pitch
    neutral   = leveraged * k[bo]

Savant prices 12 outcomes: single, double, triple, home run, walk, hit by pitch, strikeout, ground-ball out,
air out, reached (error / fielder's choice / catcher's interference), bunt, and a truncated plate appearance.
An out is priced by its trajectory, not by what the defense did with it: a double-play grounder and a
routine grounder with a man on first are worth the same. `fit_live.py` fits `R` and `E` per season;
`gen_rvsavant_js.py` writes the frontend module and `backend/rv_savant_tables.json`.

Check on the app's own 2026 pitches (feed event names and trajectory, Statcast base/out): the neutral value
equals Statcast's `delta_run_exp` on 99.9% of 712,249 pitches; pitcher x pitch-type sums differ by 0.09
runs on average. Seasons after the last fitted one use the latest table.

## One number in every pitcher table

The Overview's Value container, the Compare and Tracker pitch tables and the Leaderboard all show the same
thing: the per-pitch value from the pitcher's side (+ = runs saved) plus the park term
(`frontend/src/pitcherValue.js`; the backend mirrors it for the Leaderboard). The park term is stored per season,
home park and outcome class (`park_table.json`, written into `rvSavant.js` and `backend/rv_park.json`), so it
can be added pitch by pitch and any date range or filter carries it. It needs Savant's published totals to
fit, so a season in progress has none until it is fitted.

- Against Savant's published pitcher x pitch-type run value (200+ pitches): per-pitch values with the park
  term are off by 0.21 runs on average in 2025 and 0.25 in 2026; without it, 0.62 and 0.58.
- In 2025 the per-pitch sums equal the season file exactly; in 2026 they differ by 0.02 runs per 100 pitches
  on average (the 0.1% of pitches where the rebuilt value differs from Statcast's).
- A sample where fewer than 98% of pitches carry base/out state is valued with construction 2 throughout.
- The season file (`overviewValueSv*.js`) is now only a stand-in for a full season whose pitches arrive
  without their home park.
- The expected versions (xRV) come from the per-pitch construction too, which differs a little from the
  season file's: about 0.06-0.10 runs per 100 pitches per pitch type.

## 2. Linear weights (Success heatmap; fallback wherever a pitch has no base/out state)

FanGraphs-style: one value per event from season wOBA weights, count values centered on the league, no
base/out state. `pitchRunValue` in `frontend/src/App.jsx` and `_pitch_run_values` in `backend/main.py`;
`gen_value.py` is the Python replica and `gen_refs.py` writes `overviewRvBase.js` / `overviewValueRef.js`.
Tracks Savant's context-neutral totals at r = 0.95.
