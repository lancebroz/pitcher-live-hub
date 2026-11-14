# Hitters tab: Results and Value containers

`frontend/src/hitterStats.js` holds the stat definitions the app uses; `hlib.py` mirrors them in Python to build
the league references in `frontend/src/hitterData.js`. Keep the two in sync.

1. `build_xbacon.py`: expected batting average on contact by exit velocity / launch angle cell
2. `validate.py`: per-hitter comparison with Savant (from Statcast pitch rows)
3. `gen_hitter_data.py`: percentile pools and run value references -> `hitterData.js`

Paths at the top of each script point at a local working directory. Source: mlb-pitcher-data 2026 regular season.

## Results (percentile sliders)

Pools are hitters in the same handedness matchup: for "All", hitters who bat from the same side with 100+ PA
(switch hitters are their own pool); for vs LHP / vs RHP, hitters batting from that side against that pitcher
hand with 50+ PA. Contact-quality stats need 25+ batted balls to enter a pool.

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
