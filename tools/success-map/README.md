# Success maps

The league baseline behind the Success heatmaps (Overview, Hitters, Heatmaps tabs) and the checks for it.

- `lib.py` — the app's expected run value of a pitch (`pitchRunValue(p, true)`) on Statcast rows. Season constants and the
  contact-value table are read out of `App.jsx`.
- `sample.py` + `validate.js` — runs 120,000 pitches through both the port and the app's own function. They must agree exactly.
- `build.py <statcast dir>` — writes `frontend/src/overviewRvBase.js`: per pitch type × pitcher hand × batter side, the
  league's value in 1.5-inch cells (`t`) and over every location (`m`). 2025 + 2026 regular seasons, pooled.

The map itself (`successValue.js`, `GaussianHeatmapCanvas` in `App.jsx`):

- **Value** — each pitch against the league's average pitch of that type anywhere. Location earns credit or blame.
- **Vs League** — each pitch against the league's average pitch of that type at the same spot.
- Colour is the area's total divided by the noise expected from that many pitches (0.17 runs per pitch). Full colour is at
  2.4 standard errors, or at the map's own strongest spot when that is lower, so small samples still show a shape.

Rebuild after a season ends, or whenever the run-value constants in `App.jsx` change.
