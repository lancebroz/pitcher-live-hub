# Hitters tab: header line, Results and Value containers

`frontend/src/hitterStats.js` holds the stat definitions the app uses; `hlib.py` mirrors them in Python to build
the league references in `frontend/src/hitterData.js`. Keep the two in sync.

1. `build_xbacon.py`: expected batting average on contact by exit velocity / launch angle cell
2. `validate.py`: per-hitter comparison with Savant (from Statcast pitch rows)
3. `gen_hitter_data.py`: percentile pools, run value references and the first-load pool, by season -> `hitterData.js`
4. `backend_offline_check.py`: runs the backend's batter Statcast and batting-line endpoints against a
   Savant-shaped CSV built from Statcast rows (no network)

Paths at the top of each script point at a local working directory. Sources: mlb-pitcher-data for 2026 (what
the app reads for the current season, `hlib.load`), Statcast rows for 2025 (what the app gets from Savant for a
past season, `hlib.load_savant`). Regular season only.

## Header (AVG / OBP / SLG / HR)

The official line from the MLB Stats API (`/api/batter/{id}/line`, season or date range). The pitch-derived line
(`hitterLine`) shows until it arrives and when the API has nothing. From Statcast rows (2025) the pitch-derived
line is exact; from the current-season feed its OBP runs low for hitters who are walked intentionally, because
an intentional walk issued without a pitch never appears in pitch data (.002 low on average, up to .029).

## Results (percentile sliders)

"All" ranks a hitter against every hitter with 100+ PA that season, whatever side he bats from. vs LHP / vs RHP
rank him against hitters batting from the same side against that pitcher hand with 50+ PA. Contact-quality
stats need 25+ batted balls to enter a pool.

Check against Savant, 360 hitters with 200+ PA (2026):

| | r | mean abs. difference |
|---|---|---|
| xwOBA | 0.974 | .006 |
| xBA | 0.956 | .006 |
| xSLG | 0.979 | .013 (ours runs about .010 high) |
| K %, BB %, Swing %, Chase %, Contact %, Zone Swing %, Zone Contact % | 0.999+ | 0.15 points or less |
| Max exit velocity | 1.000 | 0.0 |

Exit velocity, hard-hit and barrel rates leave bunts out (the app's existing convention), which puts average
exit velocity about 0.7 mph above a count that includes them.

## Value (run value by pitch type seen)

Savant-style per-pitch run values (see `tools/run-value`), from the hitter's side, no park term. League
references are by batter side x pitcher hand x pitch type x count bucket; colour is the gap to that reference,
shrunk for sample size (a hitter needs roughly 1,500 pitches of one type for half weight).
