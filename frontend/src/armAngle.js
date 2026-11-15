// Arm angle for the Overview tab's release model, for a season or a date range.
//
// Measured values come first: Statcast's per-pitch arm angle (on Savant rows, i.e. past seasons) or its by-day
// averages from /api/pitcher/{id}/arm-angle (current season, where the pitch data comes from the live feed and has
// none). A game Statcast has not processed yet is estimated from how far that day's release point sits from his
// usual one (tools/arm-angle): his measured arm angle plus what the release-point change implies. On 6,250 starts
// that estimate is off by 1.1 degrees on average, against 1.4 for assuming he never changes.
//
// Change in arm angle (degrees) per foot of change in: release height, arm-side release distance, extension,
// height x cos(arm angle), side x sin(arm angle).
const COEF = [4.2121, 0.7326, 1.8672, 9.157, -5.5869];
// Last resort when nothing has been measured for him at all (a debut): the stuff model's linear imputer from
// release height, pitcher height, arm-side distance and extension. Off by about 5 degrees on average.
const IMPUTER = { intercept: 10.8506, relZ: 20.7891, heightFt: -22.3478, side: -3.8044, ext: 8.5466 };
export const ARM_ANGLE_MIN_PITCHES = 5;

// pitches: the season's pitches (regular season); type: the fastball the model is drawn from; hand: "L" | "R";
// range: { s, e } ISO dates or null for the whole season; days: by-day measured table from the API, or null;
// seasonValue: the season arm angle on file, or null; heightIn: pitcher height in inches, or null.
// Returns { value, n, measured, estimated, estDays, basis } or null when there is too little to go on.
//   basis: "measured" | "mixed" | "estimate" (anchored to his measured angle) | "imputed" (no measurement at all)
export function armAngleFor({ pitches, type, hand, range, days, seasonValue, heightIn }) {
  if (!pitches || !type) return null;
  const s = hand === "L" ? 1 : -1, byDay = new Map();
  for (const p of pitches) {
    if (p.pitch_type !== type || !p.game_date) continue;
    let d = byDay.get(p.game_date); if (!d) { d = { date: p.game_date, n: 0, nr: 0, rx: 0, rz: 0, ext: 0, nm: 0, am: 0 }; byDay.set(p.game_date, d); }
    d.n++;
    if (p.release_pos_x != null && p.release_pos_z != null && p.release_extension != null) { d.nr++; d.rx += s * p.release_pos_x; d.rz += p.release_pos_z; d.ext += p.release_extension; }
    if (p.arm_angle != null) { d.nm++; d.am += p.arm_angle; }
  }
  const all = [...byDay.values()];
  for (const d of all) {
    if (d.nr) { d.rx /= d.nr; d.rz /= d.nr; d.ext /= d.nr; }
    const api = days && days[d.date] && days[d.date][type];
    d.aa = d.nm ? d.am / d.nm : api && api[0] > 0 ? api[1] : null;   // measured arm angle that day, if any
  }
  // his usual: measured arm angle and release point over the days that have a measurement
  const meas = all.filter(d => d.aa != null && d.nr), wsum = (list, f) => { let a = 0, w = 0; for (const d of list) { a += f(d) * d.n; w += d.n; } return w ? a / w : null; };
  const anchorDays = meas.length ? meas : all.filter(d => d.nr);
  const base = { aa: meas.length ? wsum(meas, d => d.aa) : seasonValue ?? null, rx: wsum(anchorDays, d => d.rx), rz: wsum(anchorDays, d => d.rz), ext: wsum(anchorDays, d => d.ext) };
  const inRange = range && (range.s || range.e) ? all.filter(d => (!range.s || d.date >= range.s) && (!range.e || d.date <= range.e)) : all;
  let num = 0, n = 0, measured = 0, estimated = 0, estDays = 0, imputed = false;
  for (const d of inRange) {
    let v = d.aa;
    if (v == null) {
      if (!d.nr) continue;
      if (base.aa != null) {
        const th = base.aa * Math.PI / 180, dz = d.rz - base.rz, dx = d.rx - base.rx, de = d.ext - base.ext;
        v = base.aa + COEF[0] * dz + COEF[1] * dx + COEF[2] * de + COEF[3] * dz * Math.cos(th) + COEF[4] * dx * Math.sin(th);
      } else if (heightIn) {
        v = Math.max(-10, Math.min(90, IMPUTER.intercept + IMPUTER.relZ * d.rz + IMPUTER.heightFt * (heightIn / 12) + IMPUTER.side * Math.abs(d.rx) + IMPUTER.ext * d.ext)); imputed = true;
      } else continue;
      estimated += d.n; estDays++;
    } else measured += d.n;
    num += v * d.n; n += d.n;
  }
  if (n < ARM_ANGLE_MIN_PITCHES) return null;
  return { value: num / n, n, measured, estimated, estDays, days: inRange.length, basis: !estimated ? "measured" : imputed ? "imputed" : measured ? "mixed" : "estimate" };
}
