// Hitter stat definitions for the Hitters tab's Results container (pure functions, no React).
// Mirrored in tools/hitters/hlib.py, which builds the percentile pools in hitterData.js: keep the two in sync.
import { XBACON, XBACON_LEAGUE } from "./hitterData.js";

// Expected batting average on contact for an exit velocity / launch angle (same cells as the xwOBA and xSLG grids).
export const xbaconLookup = (ev, la) => {
  if (ev == null || la == null || isNaN(ev) || isNaN(la)) return null;
  const evb = Math.round(Math.min(115, Math.max(40, ev)) / 5) * 5, lab = Math.round(Math.min(80, Math.max(-60, la)) / 10) * 10;
  const v = XBACON[`${evb}|${lab}`];
  return v != null ? v : XBACON_LEAGUE;
};

// [key, label, direction, decimals, unit, sample]: direction +1 = higher is better for the hitter, -1 = lower is
// better, 0 = neither (the bar shows rank only). sample = what the stat needs before it gets a percentile.
export const HITTER_RESULT_ROWS = [
  [["xwoba", "xwOBA", 1, 3, "", "pa"], ["xba", "xBA", 1, 3, "", "pa"], ["xslg", "xSLG", 1, 3, "", "pa"],
   ["ev", "Avg Exit Velo", 1, 1, "", "bbe"], ["maxev", "Max Exit Velo", 1, 1, "", "bbe"], ["barrel", "Barrel %", 1, 1, "", "bbe"],
   ["hardhit", "Hard Hit %", 1, 1, "", "bbe"], ["hhla", "Hard Hit LA", 0, 1, "°", "bbe"], ["gb", "GB %", -1, 1, "", "bbe"], ["fb", "FB %", 1, 1, "", "bbe"]],
  [["k", "K %", -1, 1, "", "pa"], ["bb", "BB %", 1, 1, "", "pa"], ["swing", "Swing %", 0, 1, "", "n"], ["chase", "Chase %", -1, 1, "", "n"],
   ["contact", "Contact %", 1, 1, "", "n"], ["zswing", "Zone Swing %", 1, 1, "", "n"], ["zcontact", "Zone Contact %", 1, 1, "", "n"], ["zmiss", "Zone Miss %", -1, 1, "", "n"]],
];

// ps: normalized pitches seen by the hitter. h: { xwobaParts, xslgconLookup, SLG_TB, SLG_AB_CONTACT_OUTS, endsPaAsK } from App.jsx.
// Plate-appearance results are read off the pitch that ended the PA (the feed stamps `events` on every pitch).
export function hitterResults(ps, h) {
  if (!ps || !ps.length) return null;
  let hits = 0, outs = 0, k = 0, bb = 0, hbp = 0, sf = 0, sh = 0, xab = 0, xtb = 0, xh = 0;
  let bbe = 0, nev = 0, evSum = 0, maxev = null, hh = 0, hhla = 0, hhlan = 0, gb = 0, fb = 0, brl = 0;
  let sw = 0, wh = 0, oz = 0, ozs = 0, iz = 0, izs = 0, izw = 0;
  for (const p of ps) {
    if (p.is_swing) { sw++; if (p.is_whiff) wh++; }
    if (p.is_out_zone) { oz++; if (p.is_swing) ozs++; }
    if (p.is_in_zone) { iz++; if (p.is_swing) { izs++; if (p.is_whiff) izw++; } }
    if (p.is_in_play && !p.is_bunt) {
      bbe++; if (p.is_ground_ball) gb++; if (p.is_fly_ball) fb++; if (p.is_barrel) brl++;
      if (p.launch_speed != null) {
        nev++; evSum += p.launch_speed; if (maxev == null || p.launch_speed > maxev) maxev = p.launch_speed;
        if (p.launch_speed >= 95) { hh++; if (p.launch_angle != null) { hhla += p.launch_angle; hhlan++; } }
      }
    }
    const ev = p.events; if (!ev) continue;
    if (ev === "strikeout" || ev === "strikeout_double_play") { if (h.endsPaAsK(p)) { k++; xab++; } continue; }
    if (ev === "walk" || ev === "intent_walk") { if (p.is_ball && Number(p.balls) === 3) bb++; continue; }
    if (ev === "hit_by_pitch") { if ((p.call_description || p.description || "").toLowerCase().includes("hit_by_pitch")) hbp++; continue; }
    if (!p.is_in_play) continue;
    const tb = h.SLG_TB[ev], isOut = h.SLG_AB_CONTACT_OUTS.has(ev);
    if (tb != null) hits++; else if (ev === "sac_fly" || ev === "sac_fly_double_play") sf++; else if (ev === "sac_bunt") sh++; else if (isOut) outs++;
    if (p.is_bunt || (tb == null && !isOut)) continue;
    // expected hits and total bases on tracked contact, the actual result when the ball was not tracked
    const xs = h.xslgconLookup(p.launch_speed, p.launch_angle), xb = xbaconLookup(p.launch_speed, p.launch_angle);
    xtb += xs != null ? xs : (tb || 0); xh += xb != null ? xb : (tb != null ? 1 : 0); xab++;
  }
  const pa = hits + outs + k + bb + hbp + sf + sh, xw = h.xwobaParts(ps), r = (a, b) => (b > 0 ? a / b : null), pc = (a, b) => (b > 0 ? 100 * a / b : null);
  return {
    n: ps.length, pa, bbe,
    xwoba: r(xw.num, xw.den), xba: r(xh, xab), xslg: r(xtb, xab),
    ev: r(evSum, nev), maxev, barrel: pc(brl, bbe), hardhit: pc(hh, nev), hhla: r(hhla, hhlan), gb: pc(gb, bbe), fb: pc(fb, bbe),
    k: pc(k, pa), bb: pc(bb, pa), swing: pc(sw, ps.length), chase: pc(ozs, oz), contact: sw > 0 ? 100 * (1 - wh / sw) : null,
    zswing: pc(izs, iz), zcontact: izs > 0 ? 100 * (1 - izw / izs) : null, zmiss: pc(izw, izs),
  };
}

// Traditional line (AVG / OBP / SLG / HR) from pitch data, same plate-appearance rules as hitterResults.
// The header prefers the official MLB line; this one is the fallback. It misses intentional walks issued
// without a pitch in current-season feed data, so its OBP can run slightly low there.
export function hitterLine(ps, h) {
  if (!ps || !ps.length) return null;
  let hits = 0, tb = 0, hr = 0, outs = 0, k = 0, bb = 0, hbp = 0, sf = 0, sh = 0;
  for (const p of ps) {
    const ev = p.events; if (!ev) continue;
    if (ev === "strikeout" || ev === "strikeout_double_play") { if (h.endsPaAsK(p)) k++; continue; }
    if (ev === "walk" || ev === "intent_walk") { if (p.is_ball && Number(p.balls) === 3) bb++; continue; }
    if (ev === "hit_by_pitch") { if ((p.call_description || p.description || "").toLowerCase().includes("hit_by_pitch")) hbp++; continue; }
    if (!p.is_in_play) continue;
    const t = h.SLG_TB[ev];
    if (t != null) { hits++; tb += t; if (ev === "home_run") hr++; }
    else if (ev === "sac_fly" || ev === "sac_fly_double_play") sf++;
    else if (ev === "sac_bunt") sh++;
    else if (h.SLG_AB_CONTACT_OUTS.has(ev)) outs++;
  }
  const ab = hits + outs + k, pa = ab + bb + hbp + sf + sh, od = ab + bb + hbp + sf;
  if (!pa) return null;
  return { avg: ab ? hits / ab : null, obp: od ? (hits + bb + hbp) / od : null, slg: ab ? tb / ab : null, hr, pa, ab, source: "pitches" };
}
