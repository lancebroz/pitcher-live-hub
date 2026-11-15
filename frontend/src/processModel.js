// Process+ for the Hitters tab. Mirrors tools/process/plib.py and compute.py: keep them in sync.
//
// Every pitch is scored on three things, each against what the league does with the same pitch, in runs
// (+ = good for the hitter):
//   Decisions  (swung - league swing probability) x (value of swinging - value of taking)
//   Contact    on swings: (made contact - league contact probability) x (value of contact - value of a whiff)
//   Power      on tracked batted balls: value of the exit velocity / launch angle - league value for that pitch
// The three add up in runs with no weighting. Process+ = 100 + 100 x (runs per pitch above the league) /
// (league runs per pitch), the way wRC+ is built, so 110 is a hitter 10% better than average on process.
//
// The league expectations come from tree models in processModelData.js. "basic" knows pitch group, location,
// count and handedness; "full" adds velocity and movement.
import { PROC_CONST as K, PROC_MODELS, PROC_LEAGUE, PROC_POOLS } from "./processModelData.js";

export { PROC_POOLS };
export const PROC_WINDOW = 400;

const typed = (m) => (m && !m._t ? Object.assign(m, { _t: true, F: Int16Array.from(m.F), T: Float64Array.from(m.T), L: Int16Array.from(m.L), R: Int16Array.from(m.R), V: Float64Array.from(m.V), O: Int32Array.from(m.O), P: Int32Array.from(m.P) }) : m);
const MODELS = { basic: {}, full: {} };
for (const v of ["basic", "full"]) for (const n of ["swing", "cs", "contact", "foul", "bip"]) MODELS[v][n] = typed(PROC_MODELS[v][n] || PROC_MODELS.basic[n]);   // one called-strike model serves both

// Raw score of a tree ensemble for one feature vector.
function raw(m, x) {
  const { F, T, L, R, V, O, P } = m; let s = 0;
  for (let k = 0; k < O.length; k++) {
    const o = O[k]; let n = 0;
    for (;;) { const i = o + n, nx = x[F[i]] <= T[i] ? L[i] : R[i]; if (nx < 0) { s += V[P[k] - nx - 1]; break; } n = nx; }
  }
  return s;
}
const sig = (z) => 1 / (1 + Math.exp(-z));
const re = (b, s) => K.RE[`${b}-${s}`] ?? 0;

// Scores one normalized pitch. Returns { basic: [decisions, contact, power], full: [...] } in runs, or null when the
// pitch cannot be scored (no location, velocity or movement; a pitch type outside the three groups; a bunt attempt).
export function scorePitch(p, xwobaconLookup) {
  const grp = K.GROUPS[p.pitch_type]; if (grp == null) return null;
  const st = p.batter_hand, th = p.p_throws;
  if ((st !== "L" && st !== "R") || (th !== "L" && th !== "R")) return null;
  if (p.plate_x == null || p.plate_z == null || p.release_speed == null || p.pfx_x == null || p.pfx_z == null || p.balls == null || p.strikes == null) return null;
  if (p._nodec || p.is_bunt) return null;
  const sw = !!(p.is_swing || p.is_in_play), wh = !!p.is_whiff, hbp = p.description === "hit_by_pitch";
  if (!(sw || p.is_called_strike || p.is_ball || hbp)) return null;
  // the live feed reports plate location a touch differently from Statcast: bring feed rows onto Statcast's
  const plx = p.plate_x + (p._savant ? 0 : K.FEED_DX), plz = p.plate_z + (p._savant ? 0 : K.FEED_DZ);
  let top = p.sz_top ?? K.SZ_TOP, bot = p.sz_bottom ?? K.SZ_BOT; if (!(top - bot > 0.5)) { top = K.SZ_TOP; bot = K.SZ_BOT; }
  const b = Math.max(0, Math.min(3, Number(p.balls) || 0)), s = Math.max(0, Math.min(2, Number(p.strikes) || 0));
  const era = parseInt(String(p.game_date || "").slice(0, 4), 10) >= 2026 ? 1 : 0;   // the called zone changed with the challenge system in 2026
  const xb = [grp, st === th ? 1 : 0, st === "L" ? 1 : 0, b, s, plx * (st === "L" ? -1 : 1), plz, (plz - bot) / (top - bot), era];
  const xf = [...xb, p.release_speed, p.pfx_x * (th === "R" ? 1 : -1), p.pfx_z];
  const cur = re(b, s), ballV = (b === 3 ? K.V_BB : re(b + 1, s)) - cur, strikeV = (s === 2 ? K.V_OUT : re(b, s + 1)) - cur, foulV = s === 2 ? 0 : re(b, s + 1) - cur;
  const contact = sw && !wh;
  let bipV = null;
  if (p.is_in_play && p.launch_speed != null && p.launch_angle != null) { const xw = xwobaconLookup(p.launch_speed, p.launch_angle); if (xw != null) bipV = (xw - K.LG) / K.SCALE; }
  const cs = sig(raw(MODELS.basic.cs, xb)), vTake = cs * strikeV + (1 - cs) * ballV, out = {};
  for (const [ver, x] of [["basic", xb], ["full", xf]]) {
    const M = MODELS[ver], pS = sig(raw(M.swing, x)), C = sig(raw(M.contact, x)), Fo = sig(raw(M.foul, x)), Q = raw(M.bip, x);
    const vContact = Fo * foulV + (1 - Fo) * (Q - cur), vSwing = (1 - C) * strikeV + C * vContact;
    out[ver] = [((sw ? 1 : 0) - pS) * (vSwing - vTake), sw ? ((contact ? 1 : 0) - C) * (vContact - strikeV) : 0, bipV == null ? 0 : bipV - Q];
  }
  return out;
}

// Scores a list of pitches once (the result is cached on each pitch) and returns the scored ones in game order.
export function scoreAll(pitches, xwobaconLookup) {
  const out = [];
  for (const p of pitches) {
    if (p._proc === undefined) p._proc = scorePitch(p, xwobaconLookup);
    if (p._proc) out.push(p);
  }
  // Savant rows are numbered newest-first by the backend, so their order inside a game runs backwards
  const ord = (p) => (p._savant ? -1 : 1) * (Number(p.pitch_number) || 0);
  return out.sort((a, b) => (a.game_date < b.game_date ? -1 : a.game_date > b.game_date ? 1 : (a.game_pk || 0) - (b.game_pk || 0) || (a.at_bat_number || 0) - (b.at_bat_number || 0) || ord(a) - ord(b)));
}

const leagueFor = (year, ver) => (PROC_LEAGUE[year] || PROC_LEAGUE[Object.keys(PROC_LEAGUE).sort().pop()])[ver];
// Points on the 100 scale from summed runs over n pitches: [decisions, contact, power] and the total.
function points(sum, n, lg) {
  const d = 100 * (sum[0] / n - lg[0]) / K.RPP, c = 100 * (sum[1] / n - lg[1]) / K.RPP, w = 100 * (sum[2] / n - lg[2]) / K.RPP;
  return { n, d, c, w, t: 100 + d + c + w };
}

// Whole-sample line for a set of scored pitches.
export function processLine(scored, year, ver) {
  if (!scored.length) return null;
  const s = [0, 0, 0]; for (const p of scored) { const v = p._proc[ver]; s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; }
  return points(s, scored.length, leagueFor(year, ver));
}

// One point per game day: the previous `window` scored pitches up to the end of that day (fewer early in a season).
export function processRolling(scored, year, ver, window = PROC_WINDOW) {
  const lg = leagueFor(year, ver), n = scored.length, cum = [new Float64Array(n + 1), new Float64Array(n + 1), new Float64Array(n + 1)], out = [];
  for (let i = 0; i < n; i++) { const v = scored[i]._proc[ver]; for (let j = 0; j < 3; j++) cum[j][i + 1] = cum[j][i] + v[j]; }
  for (let i = 0; i < n; i++) {
    if (i + 1 < n && scored[i + 1].game_date === scored[i].game_date) continue;
    const e = i + 1, a = Math.max(0, e - window);
    out.push({ date: scored[i].game_date, ...points([cum[0][e] - cum[0][a], cum[1][e] - cum[1][a], cum[2][e] - cum[2][a]], e - a, lg) });
  }
  return out;
}
