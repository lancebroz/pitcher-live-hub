// The Success maps (Overview, Hitters and Heatmaps tabs): what one pitch is worth against a league baseline.
// Two views of the same pitches:
//   value  against the league's average pitch of that type and matchup thrown anywhere, so location earns credit or blame
//          ("where did the runs come from")
//   spot   against the league's average pitch of that type and matchup at that same spot, so location is held equal
//          ("given where it was, did it play")
// Values are the app's expected run value per pitch (pitchRunValue(p, true)). The table is mirrored from the
// opposite-handed matchup when one is too rare to have its own, and reads 0 when the pitch type has none at all.
import { OV_RVBASE } from "./overviewRvBase.js";

const T = OV_RVBASE, flip = (h) => (h === "L" ? "R" : "L");
const cell = (key, x, z) => {
  const t = T.t[key]; if (!t) return null;
  const xi = Math.max(0, Math.min(T.nx - 1, Math.floor((x - T.x0) / T.d))), zi = Math.max(0, Math.min(T.nz - 1, Math.floor((z - T.z0) / T.d)));
  return t[zi * T.nx + xi] / 1000;
};
// League value at the pitch's own spot (batter-positive)
export function leagueRunValue(p, hand) {
  const bh = p.batter_hand === "L" ? "L" : "R";
  return cell(`${p.pitch_type}|${hand}|${bh}`, p.plate_x, p.plate_z) ?? cell(`${p.pitch_type}|${flip(hand)}|${flip(bh)}`, -p.plate_x, p.plate_z) ?? 0;
}
// League value of that pitch type and matchup over every location (batter-positive)
export function leagueMeanValue(p, hand) {
  const bh = p.batter_hand === "L" ? "L" : "R";
  return (T.m[`${p.pitch_type}|${hand}|${bh}`] ?? T.m[`${p.pitch_type}|${flip(hand)}|${flip(bh)}`] ?? 0) / 1000;
}
export const SUCCESS_VIEWS = [
  ["value", "Value", "Where the runs came from: each pitch against the league's average pitch of that type, wherever it was thrown. Location earns credit or blame."],
  ["spot", "Vs League", "Each pitch against the league's average pitch of that type at the same spot. Location is held equal."],
];
// Legend ends, [red, green]
export const SUCCESS_LEGEND = {
  pitcher: { value: ["Cost runs", "Saved runs"], spot: ["Worse than league", "Better than league"] },
  hitter: { value: ["Lost runs", "Added runs"], spot: ["Worse than league", "Better than league"] },
};
export const SUCCESS_CAPTION = "Brighter = bigger effect, more pitches behind it";
// Per-pitch weight for the map, + = good for the subject. `fallbackHand` is the pitcher's hand when a row does not carry it.
export function successWeight(view, forHitter, pitchRunValue, fallbackHand) {
  const base = view === "spot" ? leagueRunValue : leagueMeanValue;
  return (p) => {
    const hand = p.p_throws === "L" || p.p_throws === "R" ? p.p_throws : (fallbackHand === "L" ? "L" : "R");
    const d = pitchRunValue(p, true) - base(p, hand);
    return forHitter ? d : -d;
  };
}
