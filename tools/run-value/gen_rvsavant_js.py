import json
T=json.load(open('/home/claude/rv/live_tables.json')); X=json.load(open('/home/claude/rv/live_x_tables.json'))
for y in T: T[y]['E'].pop('truncated_pa',None)
js='''// Generated (tools/run-value/gen_rvsavant_js.py). Savant-style run value per pitch, from base/out state, count and outcome.
// Reproduces Statcast's per-pitch delta_run_exp (context-neutral) on 99.9% of pitches; see tools/run-value/README.md.
//   leveraged = E[outcome][bo] - R[bo][count]          (pitch that ends the plate appearance)
//             = R[bo][next count] - R[bo][count]       (any other pitch)
//   neutral   = leveraged * k[bo]
// bo = (on_1b + 2*on_2b + 4*on_3b) * 3 + outs; count index = balls * 3 + strikes.
export const SV_T = @@T@@;
// Expected value of contact: P[ev|la] = share of [1B, 2B, 3B, HR] in that exit-velocity / launch-angle cell;
// Dc[class][bo] = neutral value of that hit over an out; xoff = per-ball-in-play offset that centres the league.
export const SV_X = @@X@@;
const YEARS = Object.keys(SV_T).map(Number).sort((a, b) => a - b);
const tableFor = (d) => { const y = typeof d === "number" ? d : parseInt(String(d || "").slice(0, 4), 10); const use = !y || y > YEARS[YEARS.length - 1] ? YEARS[YEARS.length - 1] : y < YEARS[0] ? YEARS[0] : y; return [SV_T[use], SV_X.xoff[use] || 0]; };
const HITS = { single: "1B", double: "2B", triple: "3B", home_run: "HR" }, REACH = { field_error: 1, fielders_choice: 1, catcher_interf: 1 }, XC = ["1B", "2B", "3B", "HR"];
// Batter-view values { nv, nx, lv, lx } (neutral / leveraged x actual / expected), or null when the pitch has no base/out state.
// `own` is Statcast's own delta_run_exp when the row came from Savant; it is used as the neutral value as is.
export function savantRunValue(p, own) {
  if (p.on_1b == null || p.on_2b == null || p.on_3b == null || p.outs == null) return null;
  const o = Math.max(0, Math.min(2, Number(p.outs) || 0)), bo = ((p.on_1b ? 1 : 0) + (p.on_2b ? 2 : 0) + (p.on_3b ? 4 : 0)) * 3 + o;
  const [T, xoff] = tableFor(p.game_date), k = T.k[bo], R = T.R[bo];
  const b = Math.max(0, Math.min(3, Number(p.balls) || 0)), s = Math.max(0, Math.min(2, Number(p.strikes) || 0)), c0 = b * 3 + s;
  const ev = (p.events || "").toLowerCase().trim();
  let cls = null, c1 = c0;
  if (p.is_in_play) cls = p.is_bunt ? "bunt" : HITS[ev] ? ev : REACH[ev] ? "reach" : (p.bb_type ? p.bb_type === "ground_ball" : p.is_ground_ball) ? "out_ground" : "out_air";
  else if (p.description === "hit_by_pitch") cls = "hit_by_pitch";
  else if (p.is_ball) { if (b === 3) cls = "walk"; else c1 = (b + 1) * 3 + s; }
  else if (p.is_whiff || p.is_called_strike) { if (s === 2) cls = "strikeout"; else c1 = b * 3 + s + 1; }
  else if (p.is_swing) { if (s < 2) c1 = b * 3 + s + 1; else if ((p.call_description || "").toLowerCase().replace(/ /g, "_") === "foul_bunt") cls = "strikeout"; }
  let lev;
  if (cls) { let e = T.E[cls][bo]; if (cls === "bunt" && e === 0) e = T.E.out_ground[bo]; lev = e - R[c0]; } else lev = R[c1] - R[c0];
  const nv = own != null ? own : lev * k;
  let nx = nv;
  if (p.is_in_play && p.launch_speed != null && p.launch_angle != null) {
    const evb = Math.floor(Math.max(40, Math.min(115, p.launch_speed)) / 5 + 0.5) * 5, lab = Math.floor(Math.max(-60, Math.min(80, p.launch_angle)) / 10 + 0.5) * 10, P = SV_X.P[`${evb}|${lab}`];
    if (P) { let e = 0; for (let j = 0; j < 4; j++) e += P[j] * SV_X.Dc[XC[j]][bo]; nx = nv + e - (HITS[ev] && cls !== "bunt" ? SV_X.Dc[HITS[ev]][bo] : 0) + xoff; }
  }
  return { nv, nx, lv: nv / k, lx: nx / k };
}
'''.replace('@@T@@',json.dumps(T,separators=(',',':'))).replace('@@X@@',json.dumps(X,separators=(',',':')))
open('/home/claude/pitcher-live-hub/frontend/src/rvSavant.js','w').write(js); print(len(js),'bytes')
json.dump(T,open('/home/claude/pitcher-live-hub/backend/rv_savant_tables.json','w'),separators=(',',':'))
