// League-average run value for a pitch of that type, pitcher hand, batter side and location (batter-positive),
// shared by the Overview "Success" map and the Heatmaps tab. Mirrored from the opposite-handed table when a
// matchup is too rare to have its own; 0 when the pitch type has no table at all.
import { OV_RVBASE } from "./overviewRvBase.js";

export function leagueRunValue(p, hand) {
  const T = OV_RVBASE, cell = (key, x) => {
    const t = T.t[key]; if (!t) return null;
    const xi = Math.max(0, Math.min(T.nx - 1, Math.floor((x - T.x0) / T.d))), zi = Math.max(0, Math.min(T.nz - 1, Math.floor((p.plate_z - T.z0) / T.d)));
    return t[zi * T.nx + xi] / 1000;
  };
  const bh = p.batter_hand === "L" ? "L" : "R", flip = (h) => (h === "L" ? "R" : "L");
  return cell(`${p.pitch_type}|${hand}|${bh}`, p.plate_x) ?? cell(`${p.pitch_type}|${flip(hand)}|${flip(bh)}`, -p.plate_x) ?? 0;
}
