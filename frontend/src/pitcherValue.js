// One definition of a pitcher's run value for every pitcher table in the app (Overview Value, Compare, Tracker),
// so the same pitches always give the same number wherever they are shown.
//
// Savant-style per-pitch values (rvSavant.js) from the pitcher's side, + = runs saved, with the park term when the
// pitch carries its home park and the season has a park table. A sample where fewer than 98% of pitches carry their
// base/out state falls back to count-based linear weights for every pitch, so one sample never mixes the two.

// Whether a sample is valued the Savant way.
export function usesSavantValue(pitches) {
  let n = 0, t = 0;
  for (const p of pitches) { t++; if (p._sv) n++; }
  return t > 0 && n >= 0.98 * t;
}

// Whether the sample's Savant values carry the park term (nearly every pitch has it).
export function hasParkTerm(pitches) {
  let n = 0, t = 0;
  for (const p of pitches) { t++; if (p._sv && p._sv.park) n++; }
  return t > 0 && n >= 0.98 * t;
}

// [RV, xRV, leveraged RV, leveraged xRV] for one pitch from the pitcher's side.
export function pitcherValue(p, savant, pitchRunValue) {
  const q = savant ? p._sv : null;
  if (q) return [q.pn, q.px, q.pl, q.plx];
  const a = -pitchRunValue(p, false), x = -pitchRunValue(p, true);
  return [a, x, a, x];
}
