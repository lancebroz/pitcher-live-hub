# Arm angle by date range (Overview tab)

The release model and the movement plot's arm-angle line follow the Overview's date range.

## Where the number comes from

1. **Measured.** Statcast publishes arm angle per pitch in Savant's pitch-level export (99.4% of 2025-26 pitches).
   - Past seasons: the app already reads that export for the pitcher; the backend now passes `arm_angle` through
     and the app averages the pitches in the range.
   - Current season: the pitch data comes from the live feed, which has no arm angle, so the app asks
     `/api/pitcher/{id}/arm-angle?season=` for Statcast's averages by game day and pitch type (one Savant pull per
     pitcher, cached 30 minutes) the first time a range is set.
   - Averaging four-seamers by start from that export reproduces Savant's own start-by-start arm angle to within
     0.06 degrees on all 64 Peralta and Skenes starts of 2026.
2. **Estimated** for a game Statcast has not posted yet: his measured arm angle on the other days plus what that
   day's release-point change implies (`fit.py`; coefficients in `frontend/src/armAngle.js`). Shown with an "est"
   tag and a tooltip that says how many games are estimated.
3. **Imputed** when nothing has been measured for him at all (a debut): the stuff model's linear imputer from
   release point and height.

With no range set the season number on file is shown, as before; a season with none on file falls back to the above.
A range needs 5 pitches of his primary fastball.

## How good the estimate is (6,250 games with 15+ primary fastballs, 361 pitcher-seasons, pitcher held out)

| | Mean error per game |
|---|---|
| One model for every pitcher from release point + height (pitcher unseen) | 5.2 degrees |
| His season number on every game | 1.4 |
| Anchored estimate (used here) | 1.1 |

- Explains about 40% of real game-to-game movement (r 0.64). On games that moved 2+ degrees (23%): direction right
  88% of the time, error 2.0 vs 3.3 degrees.
- Same accuracy with the live feed's release point (1.17 on 5,478 games in 2026).
- Measured arm angle itself is only repeatable to about 0.6 degrees per start (odd vs even four-seamers).
- Peralta 2026: season number misses by 1.9 on average (7.9 at worst), the estimate by 1.6 (3.7 at worst).
  Skenes 2026 barely moves (sd 0.8), and there the estimate (0.9) is slightly worse than his season number (0.7).

`backend_offline_check.py` runs the backend's cached-season, statcast and arm-angle endpoints against local data.
