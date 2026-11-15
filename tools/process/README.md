# Process+ (Hitters tab)

A per-pitch read on a hitter's process, in the spirit of Pitcher List's Process+ (Decisions, Contact, Power on a
100 scale, charted over a rolling 400 pitches). Pitcher List does not publish its models or scaling, so this is
our own construction, not a replica.

## Definition

Every pitch is scored against what the league does with the same pitch, in runs (+ = good for the hitter):

| Part | Per pitch |
|---|---|
| Decisions | (swung − league swing probability) × (value of swinging − value of taking) |
| Contact | on swings: (made contact − league contact probability) × (value of contact − value of a whiff) |
| Power | on tracked batted balls: value of the exit velocity / launch angle − league value for that pitch |

The three are added with no weighting. Process+ = 100 + 100 × (runs per pitch above league) / (league runs per
pitch, 0.0299), the way wRC+ is built. Count values are context-neutral (the app's count table); a batted ball is
worth (xwOBAcon − league wOBA) / wOBA scale using the app's exit-velocity / launch-angle grid.

Left out on purpose: which pitches he happened to see, called-strike luck on takes, fair vs foul on contact, and
what a batted ball actually became. Bunt attempts, pitchouts, pitches with no location / velocity / movement and
pitch types outside fastball / breaking / offspeed are not scored.

## League expectations

Five gradient-boosted models (LightGBM), trained on 2025 Statcast rows and 2026 feed rows, each as the app sees
them: swing, called strike on takes, contact on swings, foul on contact, batted-ball value on balls in play.

- **Basic**: pitch group, same/opposite hand, batter side, balls, strikes, location (mirrored by batter side),
  height within his zone, era flag (the called zone changed in 2026).
- **Full**: Basic plus velocity, arm-side movement and induced vertical break.

One called-strike model serves both. Held-out fit is in `fit_report.csv` (log loss for the classifiers, MSE and
R² for batted-ball value). The models run in the browser from `frontend/src/processModelData.js` (flat tree
arrays, loaded only when the Process container is shown), so new pitches are scored live in season. The feed
reports plate location slightly differently from Statcast (+0.008 ft across, −0.080 ft up, measured on 115k
pitches); feed rows are shifted onto Statcast's before scoring.

## Checks (hitters with 1,200+ pitches, 536 hitter-seasons)

- Regressing xwOBA runs per pitch on the three parts gives coefficients 0.98 / 1.10 / 0.99 (r² 0.82), so a run
  of Decisions, Contact or Power is worth a run. Against actual wOBA the r² is 0.52.
- Next season (2025 → 2026, 190 hitters), r² with next-year wOBA: Process+ 0.19 (Full) / 0.19 (Basic),
  wOBA 0.17, xwOBA 0.22. Process+ itself repeats at r² 0.44.
- Reliability reaches 0.5 at about 240 pitches for Decisions, 200 for Contact, 400 for Power.
- Basic vs Full: r = 0.996 over a season (mean gap 1.5 points, 95th percentile 3.7); on a rolling 400 pitches
  the mean gap is 2.5 points (95th percentile 6.4).
- Browser vs Python: identical to 0.03 points on six test hitter-seasons, tiles and every chart day.
- Against Pitcher List's Tommy Pham 2025 chart: same shape (Decisions positive all year, Power negative
  through June then positive, trough in June, peak in August–September), but our Power swings about twice as
  far (trough near 53 vs their ~85). Their Power is described as extra bases on contact; ours values all
  contact quality in the same currency as xwOBA.

## Rebuild

`build.py` → `train.py` → `compute.py` → `validate.py` → `export.py`. Paths at the top of `plib.py` point at a
local working directory. Refit when a season completes; until then a new season is scored with these models
and the latest season's league means.
