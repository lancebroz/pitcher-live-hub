# Pitch grades: Stuff+, Location+, Pitching+

Builds the grades shown in the Overview tab (`frontend/src/overviewGrades.js`).
Built November 2026 from the stuff model in `lancebroz/stuff-plus-repo` (v3), with the changes listed below.

## What each grade is

| Grade | Question it answers | Inputs |
|---|---|---|
| Stuff+ | How good is the pitch's shape, wherever it ends up? | velocity, movement, release, extension, spin, arm angle, differences from the primary fastball |
| Location+ | How good is where it ended up, given the pitch type and count? | plate location, count, pitch type, pitcher hand, batter side |
| Pitching+ | How good is the pitch with everything known? | all of the above in one model |

Scale: 100 is the league-average pitch that season. 10 points is 0.45 runs per 100 pitches on all three,
so a point of Stuff+ and a point of Location+ are worth the same. Pitch-type grades sit on the same scale
(a league-average sweeper is about 107, a league-average changeup about 93), and the Overview colors each
cell against the league average for that pitch type.

## How it is built

1. `01_prepare.py` prices every pitch (count run-expectancy change; balls in play valued by exit velocity
   and launch angle, same construction as stuff-plus-repo) and builds features. LHP are mirrored so one
   model serves both hands.
2. `02_train_and_grade.py`
   - Location model: run value from location + count + pitch type + hands. Pitcher-held-out.
   - Stuff model: trained on run value with the location model's prediction subtracted, so it cannot be
     paid for location. Pitch-level features, one pooled model.
   - Pitching model: one joint model on shape + location + count.
   - Stuff and Pitching grades for a season come from a model trained on the other three seasons.
   - Small samples are regressed toward the league average for that pitch type
     (about 1-3 pitches for Stuff, about 120-160 for Location, about 50-90 for Pitching).

3. `03_flags.py` adds low-confidence flags and rewrites the frontend file.
   - Unique shape: a pitch type whose average shape and release has few close matches among other pitchers
     (distance to the 5th-closest other pitcher of 1.0 or more, in spread-of-pitchers units over velocity,
     movement, release point, extension, arm angle and spin). A pitcher is flagged when 40%+ of his pitches
     are flagged pitch types. 24 of 797 pitchers in 2026 (16 of the 423 with 600+ pitches).
   - Small sample: fewer than 200 pitches in the season. 163 of 797 in 2026.
   - Why it matters: for typical shapes, the grade with and without the pitcher's own history differs by
     about 2 points; for the most unusual 2% of pitch types it differs by about 7.

Run: `PITCH_DATA=<parquet folders> STUFF_REPO=<stuff-plus-repo checkout> python 01_prepare.py && python 02_train_and_grade.py && python 03_flags.py`
(about 25 minutes on 2 cores). Needs `lightgbm`, `pandas`, `pyarrow`.

## What changed from stuff-plus-repo v3, and why

All tests grade pitchers the model has never seen and compare a season's grade with the next season's
actual run value (1,051 pitcher-season pairs, 2023-2026, 500+ pitches then 300+).

| Change | Effect on next-season correlation |
|---|---|
| v3 structure as shipped (700 rounds) | 0.33 |
| Stop at ~300-500 rounds with larger leaves (v3 was past its best point) | 0.36 |
| Remove location from the target | 0.39 |
| One pooled model for both hands, plus neutral approach angles and spin-axis features | 0.40 |
| Keep pitch-type value in the grade (common scale across pitch types) | 0.42 |

Tested and rejected:
- Raw accelerations and extra fastball differentials. With the raw target they let the model work out
  where the pitch was thrown (they predict pitch height with R2 0.80), which looks like a big gain but is
  location, not stuff. With location removed from the target they add nothing.
- Season-average or game-average pitch shapes instead of pitch-level shapes (0.35-0.36).
- Dropping the pitch-type label (0.39) or the fastball differentials (0.385, and pitch-type level drops).

## How it tests

| | Stuff+ | Location+ | Pitching+ |
|---|---|---|---|
| Correlation with FanGraphs, 2026, 327 pitchers with 50+ IP | 0.87 | 0.80 | 0.91 |
| Mean absolute difference from FanGraphs (points) | 3.4 | 2.9 | 2.8 |
| Year-to-year stability | 0.87 | 0.68 | 0.70 |
| Predicts next-season run value (r) | 0.42 | 0.01 | 0.39 |
| First 300 pitches predict rest-of-season run value (r) | 0.43 | 0.00 | - |

Benchmarks on the same pairs: last season's run value predicts next season's at 0.40, K-BB% at 0.37.
Same-season, Stuff+ explains 24% of the variation in run value and Stuff+ with Location+ explains 31%.

## Known limits

- Grades are frozen at the build date. Re-run after new data; for a new season, train on all prior seasons.
- FanGraphs still rates unusual release points higher (Tyler Rogers 136 there, 123 here).
- Location+ assumes every pitcher aims where the league aims for that pitch type and count.
- 2023 has no optical arm angle; the stuff-plus-repo imputer fills it.
