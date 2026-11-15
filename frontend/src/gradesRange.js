// Stuff+ / Location+ / Pitching+ over a date range on the Overview tab.
// The per-game building blocks (gradesDaily/, 16 lazy chunks per season) hold each pitcher's pitch count and summed model
// values by day, pitch type and batter side. A range grade is the season formula (tools/pitch-grades/02_train_and_grade.py)
// applied to the days in the range, so selecting the whole season gives the season grade exactly.
import { GD } from "./gradesDailyConst.js";

const LOADERS = import.meta.glob("./gradesDaily/*.js");
const cache = new Map();
export const GRADE_MIN_PITCHES = GD.MIN;

// Flat cells for one pitcher-season, or null when that season has no grades for him.
export async function loadGradeCells(year, pid) {
  const b = String(Number(pid) % GD.NB).padStart(2, "0"), key = `./gradesDaily/${year}_${b}.js`, load = LOADERS[key];
  if (!load) return null;
  if (!cache.has(key)) cache.set(key, load().then(m => m.default));
  const chunk = await cache.get(key);
  return chunk[pid] || null;
}

const dayOf = (iso, day0) => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(+day0.slice(0, 4), +day0.slice(5, 7) - 1, +day0.slice(8, 10))) / 864e5);
const MK = ["s", "l", "p"];

// Grades for the days from `start` to `end` (ISO dates; either may be empty), in the shape of an OV_GRADES entry:
// { a, L, R: [Stuff+, Location+, Pitching+, pitches] | null, t: { type: [all, vsL, vsR] }, r: [level, gap, results] | null }.
export function gradeRange(flat, year, start, end) {
  const S = GD.S[year]; if (!S || !flat) return null;
  const lo = start ? dayOf(start, S.day0) : -1e9, hi = end ? dayOf(end, S.day0) : 1e9;
  const z = () => [0, 0, 0, 0], all = z(), side = [z(), z()], type = {}, ts = {}; let res = 0, rv = 0;
  for (let i = 0; i < flat.length; i += 9) {
    const d = flat[i]; if (d < lo || d > hi) continue;
    const ti = flat[i + 1], sd = flat[i + 2], n = flat[i + 3], v = [flat[i + 4], flat[i + 5], flat[i + 6]];
    const tt = type[ti] || (type[ti] = z()), tts = ts[ti] || (ts[ti] = [z(), z()]);
    for (const acc of [all, side[sd], tt, tts[sd]]) { acc[0] += n; acc[1] += v[0]; acc[2] += v[1]; acc[3] += v[2]; }
    res += flat[i + 7]; rv += flat[i + 8];
  }
  const grade = (acc, lvl, base) => {
    const n = acc[0]; if (n < GD.MIN) return null;
    return [...MK.map((m, i) => Math.round(100 - GD.PTS * 100 * ((((acc[i + 1] / GD.SC / n) - base[i]) * n / (n + GD.K[m][lvl]) + base[i]) - S.mu[i]))), n];
  };
  const out = { a: grade(all, "all", S.mu), L: grade(side[0], "side", S.mu), R: grade(side[1], "side", S.mu), t: {}, r: null, n: all[0] };
  for (const ti of Object.keys(type)) {
    const pt = GD.TYPES[ti], base = S.tmu[pt]; if (!base) continue;
    const c0 = grade(type[ti], "type", base);
    if (c0) out.t[pt] = [c0, grade(ts[ti][0], "typeside", base), grade(ts[ti][1], "typeside", base)];
  }
  if (out.a) {
    const n = all[0], gap = -(res / GD.SC / n) * 100 * GD.PTS * n / (n + GD.KGAP), mag = Math.abs(gap);
    out.r = [Math.sign(gap) * (mag >= GD.GAP[1] ? 2 : mag >= GD.GAP[0] ? 1 : 0), Math.round(gap), Math.round(100 - GD.PTS * 100 * (rv / GD.SC / n - S.mrv))];
  }
  return out;
}
