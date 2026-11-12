// ─── Overview tab ───────────────────────────────────────────────────────────────
// Search a pitcher → season line + three containers: 3D release model, pitch mix, pitch movement.
// Pitch data comes from the same endpoints and the same normaliser as the Compare tool
// (passed in through `helpers`), so the numbers reconcile across tabs.
import { useState, useEffect, useMemo, useRef } from "react";
import { searchPitchers, getCachedSeason, getSeasonData, getStatcast, getPitcherEra, getPitcherInfo } from "./api.js";
import { OV_PITCHERS, OV_LEAGUE, OV_AVG_HEIGHT_IN, OV_STAT_BASE, OV_POOLS } from "./overviewData.js";
import { solvePose } from "./releaseSolver.js";
import { createReleaseScene, RELEASE_COLORS as COL } from "./releaseScene.js";
import { OV_RVBASE } from "./overviewRvBase.js";
import { OV_GRADES, OV_GRADES_LG } from "./overviewGrades.js";

const FB_CODES = ["FF", "SI", "FC", "FA"];
// MLB team IDs by the abbreviation the search endpoint returns (plus common alternates), for mlbstatic logos
const TEAM_IDS = { AZ: 109, ARI: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112, CWS: 145, CHW: 145, CIN: 113, CLE: 114, COL: 115, DET: 116, HOU: 117, KC: 118, KCR: 118,
  LAA: 108, LAD: 119, MIA: 146, MIL: 158, MIN: 142, NYM: 121, NYY: 147, ATH: 133, OAK: 133, PHI: 143, PIT: 134, SD: 135, SDP: 135, SF: 137, SFG: 137, SEA: 136,
  STL: 138, TB: 139, TBR: 139, TEX: 140, TOR: 141, WSH: 120, WSN: 120 };
const headshotUrl = (id) => `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_426,q_auto:best/v1/people/${id}/headshot/67/current`;
const SHORT = { "4-Seam Fastball": "4-Seam", "Four-Seam Fastball": "4-Seam", "Split-Finger": "Splitter" };
const r1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const R = (x) => Math.round(x * 10) / 10;
const mean = (a) => { const f = a.filter(v => v != null && !isNaN(v)); return f.length ? f.reduce((s, v) => s + v, 0) / f.length : null; };
const ftIn = (i) => { const f = Math.floor(i / 12), r = Math.round((i - f * 12) * 2) / 2; return `${f}′${r}″`; };
const sgn = (x, unit) => { const v = R(x); return (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(1) + unit; };
const ord = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const pctile = (arr, x) => { let lo = 0, eq = 0; for (const v of arr) { if (v < x - 1e-9) lo++; else if (Math.abs(v - x) <= 1e-9) eq++; } return Math.max(1, Math.min(99, Math.round(100 * (lo + eq / 2) / arr.length))); };
const validType = (p) => p.pitch_type && p.pitch_type !== "PO" && p.pitch_type !== "UN" && p.pitch_name !== "Other" &&
  p.pitch_type.toLowerCase() !== "nan" && (p.pitch_name || "").toLowerCase() !== "nan";

const CSS = `
.ov{--cH:${COL.H};--cE:${COL.E};--cS:${COL.S};--cA:${COL.A}}
.ov *{box-sizing:border-box}
.ov button{font-family:inherit}
.ov-sum{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:14px}
.ov-who{display:flex;flex-direction:column;gap:6px;min-width:220px;position:relative}
.ov-who input{width:100%;padding:8px 11px;font-size:12.5px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:inherit;outline:none}
.ov-dd{position:absolute;top:36px;left:0;right:0;background:var(--surface);border:1px solid var(--border);border-radius:6px;z-index:30;max-height:300px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.25)}
.ov-dd div{padding:9px 12px;cursor:pointer;font-size:12px;color:var(--text);border-bottom:1px solid var(--border)}
.ov-dd div:last-child{border-bottom:0}.ov-dd div:hover{background:var(--surfaceAlt)}
.ov-dd span{color:var(--dim);margin-left:8px}
.ov-id{display:flex;align-items:center;gap:10px}
.ov-face{width:54px;height:54px;border-radius:50%;flex:none;background-color:var(--surfaceAlt);background-size:cover;background-position:center 38%;border:1px solid var(--border)}
.ov-logo{width:30px;height:30px;flex:none;object-fit:contain}
.ov-who h1{font-size:20px;margin:0;line-height:1.1;display:inline;font-weight:700}
.ov-who .nm span{font-size:12px;color:var(--muted);margin-left:8px}
.ov-stats{display:flex;gap:10px 16px;flex-wrap:wrap;align-items:stretch;flex:1}
.ov-grp{display:flex;gap:6px;align-items:stretch}
.ov-grp.run{margin-left:auto}
.ov-st{background:var(--surfaceAlt);border:1px solid var(--border);border-radius:8px;padding:6px 12px 7px;min-width:66px}
.ov-st .k{font-size:9.5px;letter-spacing:.9px;text-transform:uppercase;color:var(--muted);font-weight:700}
.ov-st .v{font-size:20px;font-weight:700;line-height:1.15;font-variant-numeric:tabular-nums}
.ov-st.big .v{font-size:26px}.ov-st .v small{font-size:12px;color:var(--muted);margin-left:1px}
.ov-sp{display:flex;flex-direction:column;gap:4px}
.ov-sp div{flex:1;display:flex;align-items:center;gap:7px;justify-content:space-between;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:0 8px;min-width:78px}
.ov-sp span{font-size:9px;letter-spacing:.6px;text-transform:uppercase;color:var(--dim);font-weight:700}
.ov-sp b{font-size:12.5px;font-variant-numeric:tabular-nums}
.ov-years{display:flex;gap:2px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:3px;align-self:flex-start}
.ov-years button{background:transparent;border:0;color:var(--dim);font-size:12px;font-weight:700;padding:6px 12px;border-radius:6px;cursor:pointer}
.ov-years button[aria-pressed=true]{background:var(--accent);color:#fff}
.ov-row{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;align-items:stretch}
.ov-card{flex:1 1 420px;max-width:520px;min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.ov-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding:11px 14px 9px;border-bottom:1px solid var(--border)}
.ov-ct{font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:var(--dim);font-weight:700}
.ov-head h2{font-size:17px;line-height:1.1;margin:0;font-weight:700;display:inline}
.ov-sub{font-size:12px;color:var(--muted)}
.ov-tag{color:#ca8a04;margin-left:6px;letter-spacing:.5px}
.ov-note{color:var(--dim);font-size:12px;padding:28px 18px;text-align:center}
.ov-stage{position:relative;flex:1;min-height:440px;touch-action:none;cursor:grab;overflow:hidden;background:#0a0e17;color:#e2e8f0;--bg:#0a0e17;--surface:#111827;--surfaceAlt:#1a2234;--border:#1e293b;--borderLight:#334155;--text:#e2e8f0;--muted:#94a3b8;--dim:#64748b}
.ov-stage .ov-tag{position:absolute;top:44px;left:10px;margin:0;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#facc15;pointer-events:none}
.ov-stage.drag{cursor:grabbing}
.ov-stage canvas{display:block;width:100%;height:100%}
.ov-leaders{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.ov-seg{position:absolute;top:8px;display:flex;gap:4px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:3px}
.ov-seg button{background:transparent;border:0;color:var(--muted);font-size:10.5px;font-weight:600;padding:5px 7px;border-radius:5px;cursor:pointer}
.ov-seg.views{left:8px}.ov-seg.views button.on{background:var(--accent);color:#fff}
.ov-seg.tg{right:8px}.ov-seg.tg button{color:var(--dim)}.ov-seg.tg button[aria-pressed=true]{color:var(--text);background:var(--surfaceAlt)}
.ov-zoom{position:absolute;left:8px;bottom:8px;display:flex;gap:4px}
.ov-zoom button{width:26px;height:26px;border-radius:6px;background:var(--surface);border:1px solid var(--border);color:var(--text);font-size:14px;cursor:pointer;line-height:1}
.ov-legend{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:10px;font-size:10.5px;color:var(--muted);background:var(--surface);border:1px solid var(--border);padding:4px 8px;border-radius:6px;pointer-events:none;white-space:nowrap}
.ov-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:-1px}
.ov-cards{position:absolute;inset:0;pointer-events:none}
.ov-co{position:absolute;left:0;top:0;width:86px;display:block;text-align:left;pointer-events:auto;background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--k);border-radius:6px;padding:5px 7px 6px;color:var(--text);cursor:pointer;will-change:transform}
.ov-co span{display:block}
.ov-co .k{font-size:8.5px;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);font-weight:700}
.ov-co .v{font-size:16px;font-weight:700;line-height:1.15;font-variant-numeric:tabular-nums}
.ov-co .v small{font-size:10px;font-weight:600;color:var(--muted);margin-left:2px}
.ov-co .bar{position:relative;height:3px;border-radius:2px;background:var(--borderLight);margin:5px 4px 4px}
.ov-co .bar .a{position:absolute;left:50%;top:-2px;width:2px;height:7px;background:var(--muted);transform:translateX(-1px)}
.ov-co .bar .p{position:absolute;top:-2.5px;width:8px;height:8px;border-radius:50%;background:var(--k);border:1.5px solid var(--surface);transform:translateX(-4px)}
.ov-co .pc{font-size:10px;color:var(--muted)}
.ov-co .pc b,.ov-co .d b{color:var(--text);font-weight:700}
.ov-co .d{display:none;font-size:9.5px;margin-top:2px;white-space:nowrap;color:var(--muted)}
.ov-co.hot .d,.ov-co:hover .d{display:block}
.ov-co.hot,.ov-co:hover,.ov-co:focus-visible{width:auto;min-width:86px;z-index:2;border-color:var(--k);outline:none}
.ov-mix{padding:12px 14px 14px;display:flex;flex-direction:column;gap:6px;flex:1}
.ov-mrow{display:grid;grid-template-columns:62px repeat(var(--n),minmax(0,1fr));gap:5px;align-items:stretch}
.ov-mrow.ov-all{padding-bottom:7px;margin-bottom:1px;border-bottom:2.5px solid var(--text)}
.ov-chip{border-radius:6px;padding:9px 0;text-align:center;font-weight:700;font-size:13px;color:#fff;letter-spacing:.3px;line-height:1.1;border:0;font-family:inherit}
.ov-velo{font-size:12px;font-weight:700;text-align:center;font-variant-numeric:tabular-nums;color:var(--text);align-self:center}
.ov-mvtop{padding:12px 14px 0;display:flex;flex-direction:column;gap:5px}
button.ov-chip{cursor:pointer;opacity:.38}button.ov-chip[aria-pressed=true]{opacity:1;box-shadow:0 0 0 2px var(--text)}
.ov-chip small{display:block;font-size:9px;font-weight:600;opacity:.85;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 3px}
.ov-msec{display:flex;align-items:center;gap:8px;font-size:10.5px;letter-spacing:1.1px;text-transform:uppercase;font-weight:700;color:var(--muted);margin:10px 0 2px}
.ov-msec::before,.ov-msec::after{content:"";flex:1;height:1px;background:var(--border)}
.ov-mlab{display:flex;flex-direction:column;justify-content:center;font-size:11.5px;font-weight:600;color:var(--text);line-height:1.15}
.ov-mlab small{font-size:9.5px;color:var(--dim);font-weight:500;font-variant-numeric:tabular-nums}
.ov-mcell{border-radius:5px;display:flex;align-items:center;justify-content:center;min-height:40px;font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--text);background:var(--surfaceAlt)}
.ov-mcell small{font-size:9.5px;font-weight:600;opacity:.75;margin-left:1px}
.ov-mcell.z{color:var(--dim);font-weight:500}
.ov-mcell.hi{box-shadow:inset 0 0 0 2px #22c55e}.ov-mcell.lo{box-shadow:inset 0 0 0 2px #ef4444}
.ov-ccell{border-radius:5px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:36px;background-color:var(--surfaceAlt);color:var(--text);line-height:1.1}
.ov-ccell b{font-size:14.5px;font-variant-numeric:tabular-nums}.ov-ccell small{font-size:9.5px;color:var(--muted);font-weight:600;font-variant-numeric:tabular-nums;margin-top:2px}
.ov-ccell.z{color:var(--dim)}
.ov-flags{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}
.ov-flag{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#b45309;background:rgba(245,158,11,.14);border:1px solid rgba(245,158,11,.45);border-radius:5px;padding:2px 6px;cursor:help;margin-left:0!important}
.ov-flag svg{width:9px;height:10px;flex:none}
.ov-chip .fl{display:inline-block;margin-left:4px;vertical-align:1px}.ov-chip .fl svg{width:8px;height:9px}
.ov-cnote .fl svg{width:8px;height:9px;vertical-align:-1px;margin-right:3px}
.ov-cnote{font-size:10.5px;color:var(--dim);text-align:center;margin-top:auto;padding-top:8px;line-height:1.45}
.ov-row3{margin-top:14px;justify-content:flex-start}
.ov-mkey{font-size:10.5px;color:var(--dim);text-align:center;margin-top:6px}
.ov-mkey i{display:inline-block;width:11px;height:11px;border-radius:3px;vertical-align:-2px;margin:0 5px 0 12px}
.ov-mkey i:first-child{margin-left:0;box-shadow:inset 0 0 0 2px #22c55e}.ov-mkey i:last-of-type{box-shadow:inset 0 0 0 2px #ef4444}
.ov-mvwrap{padding:8px 10px 0 6px}
.ov-mvwrap canvas{display:block;width:100%;aspect-ratio:1/0.82}
.ov-mvfoot{display:flex;gap:10px;align-items:stretch;padding:6px 12px 12px;margin-top:auto}
.ov-mvleg{flex:1;display:flex;flex-direction:column;gap:7px;justify-content:center;min-width:0}
.ov-lg{display:flex;flex-wrap:wrap;gap:5px 10px;font-size:10.5px;color:var(--muted)}
.ov-lg i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
.ov-lg .aa{white-space:nowrap}.ov-lg .aa i{width:14px;height:0;border-top:2px dotted var(--text);border-radius:0;vertical-align:3px}
.ov-avg{align-self:flex-start;display:flex;align-items:center;gap:5px;background:transparent;border:1px solid var(--border);border-radius:4px;padding:3px 9px;color:var(--dim);font-size:10px;font-weight:600;cursor:pointer}
.ov-avg i{width:8px;height:8px;border-radius:50%;background:var(--dim);border:1.5px solid #000}
.ov-avg[aria-pressed=true]{border-color:var(--accent);color:var(--accent)}.ov-avg[aria-pressed=true] i{background:var(--accent)}
.ov-spin{display:flex;align-items:center;gap:9px;border:1px solid var(--border);border-radius:8px;padding:6px 6px 6px 10px;background:var(--surfaceAlt)}
.ov-spin .k{font-size:8.5px;letter-spacing:.7px;text-transform:uppercase;color:var(--muted);font-weight:700;line-height:1.25}
.ov-spin .v{font-size:19px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
.ov-spin .v small{font-size:10px;color:var(--muted);margin-left:1px}
.ov-spin .s{font-size:9.5px;color:var(--dim);white-space:nowrap}
.ov-spin svg{display:block;border-radius:6px}
.ov-lg b{font-weight:700;font-variant-numeric:tabular-nums;margin-left:4px;color:var(--text)}
.ov-row2{margin-top:14px}
.ov-body{padding:12px 14px 14px;display:flex;flex-direction:column;gap:6px;flex:1}
.ov-sl{display:grid;grid-template-columns:118px minmax(0,1fr) 62px;align-items:center;gap:10px;min-height:32px}
.ov-sl .l{font-size:12px;color:var(--muted);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ov-sl .l i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
.ov-sl .t{position:relative;height:6px;border-radius:3px;background:var(--borderLight);margin-right:12px}
.ov-sl .t::before,.ov-sl .t::after{content:"";position:absolute;top:0;bottom:0;width:2px;background:var(--surface);opacity:.8}
.ov-sl .t::before{left:50%}.ov-sl .t::after{left:0;width:0}
.ov-sl .f{position:absolute;left:0;top:-7px;height:20px;border-radius:3px 10px 10px 3px;min-width:12px}
.ov-sl .c{position:absolute;top:-10px;width:26px;height:26px;border-radius:50%;transform:translateX(-13px);display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:700;color:#fff;border:2px solid var(--surface);font-variant-numeric:tabular-nums}
.ov-sl .v{font-size:12.5px;font-weight:600;text-align:right;font-variant-numeric:tabular-nums;color:var(--text);white-space:nowrap}
.ov-sl .v small{font-size:10px;color:var(--dim);font-weight:500;margin-left:2px}
.ov-hsub{font-size:10px;letter-spacing:1.1px;text-transform:uppercase;font-weight:700;color:var(--dim);margin-top:4px}
.ov-car{display:flex;align-items:center;gap:6px;margin-top:4px}
.ov-hm{flex:1;min-width:0;max-width:400px;margin:0 auto}
.ov-arrow{flex:none;width:30px;height:44px;border-radius:8px;background:var(--surfaceAlt);border:1px solid var(--border);color:var(--text);font-size:20px;line-height:1;cursor:pointer}
.ov-tabs{display:flex;justify-content:center;gap:4px;margin-top:2px}
.ov-tabs button{background:transparent;border:1px solid var(--border);color:var(--dim);font-size:10.5px;font-weight:600;padding:4px 10px;border-radius:999px;cursor:pointer}
.ov-tabs button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.ov-hm .tile{background:#0a0a12;border:1px solid #222;border-radius:8px;padding:8px}
.ov-hm .hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:11px;font-weight:700;color:#e0e0e0}
.ov-hm .hd span{font-size:10px;color:#888;font-weight:500;font-variant-numeric:tabular-nums}
.ov-hm .cv{width:100%;aspect-ratio:1/1;border-radius:4px;overflow:hidden}
.ov-hm .cv canvas{display:block;width:100%;height:100%}
.ov-foot{display:flex;align-items:center;gap:8px;margin-top:auto;font-size:11px;color:var(--dim)}
.ov-skey{margin-left:auto;font-size:10px;white-space:nowrap}.ov-skey i{display:inline-block;width:8px;height:8px;border-radius:2px;margin:0 4px 0 8px}
.ov-foot select{background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-size:11.5px;font-weight:600;font-family:inherit}
.ov-tg3{margin-left:auto;display:flex;gap:2px;background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:2px}
.ov-tg3 button{background:transparent;border:0;color:var(--dim);font-size:10.5px;font-weight:600;padding:4px 8px;border-radius:5px;cursor:pointer}
.ov-tg3 button[aria-pressed=true]{background:var(--surfaceAlt);color:var(--text)}
.ov-spin{align-self:stretch;justify-content:space-between}
@media (max-width:820px){.ov-grp.run{margin-left:0}.ov-years{order:-1;margin-left:auto}.ov-who{order:-2}}
`;

// Colour vs. the league average for that exact subset (season → pitcher hand → batter side), using the
// same fill rule as the Compare table: neutral within ~0.4 SD, then green (better) / red (worse).
const STAT_DIR = { k: 1, kbb: 1, bb: -1, era: -1, fip: -1, xfip: -1 };
const normCdf = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };
function tone(stat, value, base, label) {
  const v = typeof value === "string" ? parseFloat(value) : value;
  if (!base || v == null || isNaN(v) || !base[1]) return {};
  const good = STAT_DIR[stat] * ((v - base[0]) / base[1]);
  const mag = Math.max(0, Math.min(1, (Math.abs(good) - 0.4) / 1.6)), alpha = (0.07 + 0.36 * mag).toFixed(3);
  const col = Math.abs(good) < 0.4 ? null : good >= 0 ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`;
  const avg = stat === "era" || stat === "fip" || stat === "xfip" ? base[0].toFixed(2) : `${base[0].toFixed(1)}%`;
  return { style: col ? { backgroundImage: `linear-gradient(${col},${col})` } : undefined,
    title: `${label} avg ${avg}${stat === "era" ? "" : ` · ${ord(Math.max(1, Math.min(99, Math.round(normCdf(good) * 100))))} pctile`}` };
}

// Percentile of x within a pool stored as 21 quantiles (0–100% in 5% steps). `lowGood` flips it so that
// a high percentile always means "better", the way Savant's sliders read.
function pctFromQ(q, x, lowGood) {
  if (!q || x == null || isNaN(x)) return null;
  let p;
  if (x <= q[0]) p = 0; else if (x >= q[20]) p = 100;
  else { let i = 0; while (i < 19 && x > q[i + 1]) i++; const span = q[i + 1] - q[i]; p = 5 * (i + (span > 0 ? (x - q[i]) / span : 0)); }
  if (lowGood) p = 100 - p;
  return Math.max(1, Math.min(99, Math.round(p)));
}
// Savant-style ramp: blue (low) → grey (middle) → red (high)
function pctColor(p) {
  const lo = [50, 90, 161], mid = [163, 181, 190], hi = [200, 49, 44], t = p / 100;
  const a = t < .5 ? lo : mid, b = t < .5 ? mid : hi, u = t < .5 ? t * 2 : (t - .5) * 2;
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * u)).join(",")})`;
}
function Slider({ label, dot, pct, value, unit, title }) {
  const has = pct != null, col = has ? pctColor(pct) : "transparent", w = has ? Math.max(4, Math.min(100, pct)) : 0;
  return (
    <div className="ov-sl" title={title}>
      <span className="l">{dot && <i style={{ background: dot }} />}{label}</span>
      <span className="t">{has && <><span className="f" style={{ width: `${w}%`, background: col }} /><span className="c" style={{ left: `${w}%`, background: col }}>{pct}</span></>}</span>
      <span className="v">{value}{unit && <small>{unit}</small>}</span>
    </div>
  );
}

// ─── Season line: mirrors SummaryStatsBar (box-score truth for all-hands when available, pitch-derived splits) ───
function seasonLine(raw, box, eraOnly, computeSummaryStats, fipConstsFor) {
  if (!raw || raw.length === 0) return null;
  const all = computeSummaryStats(raw, "all"); if (!all) return null;
  const num = (s) => { const v = parseFloat(s); return isNaN(v) ? null : v; };
  const out = { k: num(all.kPct), bb: num(all.bbPct), fip: all.fip, xfip: all.xfip, ip: all.ip, era: "—" };
  const useBox = !eraOnly && box && box.batters_faced > 0;
  if (useBox) {
    const bf = box.batters_faced;
    out.k = (box.strikeouts / bf) * 100; out.bb = (box.walks / bf) * 100;
    const ip = box.outs / 3;
    if (ip > 0) {
      const { c: FIP_CONSTANT, hrfb: LG_HR_FB_RATE } = fipConstsFor(raw);
      out.fip = ((13 * box.home_runs + 3 * (box.walks + box.hit_batsmen) - 2 * box.strikeouts) / ip + FIP_CONSTANT).toFixed(2);
      let fb = 0; for (const p of raw) if (p.is_in_play && (p.bb_type === "fly_ball" || p.bb_type === "popup")) fb++;
      out.xfip = ((13 * fb * LG_HR_FB_RATE + 3 * (box.walks + box.hit_batsmen) - 2 * box.strikeouts) / ip + FIP_CONSTANT).toFixed(2);
    }
  }
  if (!eraOnly && box && box.innings != null) out.ip = Number(box.innings).toFixed(1);
  if (box && box.era != null) out.era = Number(box.era).toFixed(2);
  const split = (h) => { const s = computeSummaryStats(raw, h); return s ? { k: num(s.kPct), bb: num(s.bbPct) } : { k: null, bb: null }; };
  out.L = split("L"); out.R = split("R");
  return out;
}

function buildMix(pitches) {
  const v = pitches.filter(validType), tot = v.length; if (!tot) return null;
  const cnt = {}, names = {};
  for (const p of v) { cnt[p.pitch_type] = (cnt[p.pitch_type] || 0) + 1; names[p.pitch_type] = p.pitch_name; }
  const types = Object.keys(cnt).filter(t => cnt[t] / tot >= 0.01).sort((a, b) => cnt[b] - cnt[a])
    .map(t => ({ type: t, name: names[t], usage: 100 * cnt[t] / tot }));
  const splits = {};
  for (const h of ["R", "L"]) {
    const dh = v.filter(p => p.batter_hand === h);
    const row = (sub) => { const c = {}; for (const p of sub) c[p.pitch_type] = (c[p.pitch_type] || 0) + 1; const pct = {}; types.forEach(t => { pct[t.type] = sub.length ? 100 * (c[t.type] || 0) / sub.length : null; }); return { n: sub.length, pct }; };
    splits[h] = { all: row(dh), pre: row(dh.filter(p => p.strikes != null && p.strikes < 2)), two: row(dh.filter(p => p.strikes === 2)) };
  }
  return { types, splits, valid: v };
}

// Primary fastball: four-seam when he throws one, otherwise his most-used fastball.
function primaryFastball(valid) {
  const tot = valid.length, cnt = {};
  for (const p of valid) cnt[p.pitch_type] = (cnt[p.pitch_type] || 0) + 1;
  let code = null;
  if ((cnt.FF || 0) >= Math.max(40, 0.05 * tot)) code = "FF";
  else code = FB_CODES.filter(c => c !== "FF" && cnt[c]).sort((a, b) => cnt[b] - cnt[a])[0] || (cnt.FF ? "FF" : null);
  if (!code) return null;
  const ps = valid.filter(p => p.pitch_type === code);
  return { type: code, name: ps[0].pitch_name, n: ps.length, usage: 100 * ps.length / tot,
    relZ: mean(ps.map(p => p.release_pos_z)), relX: mean(ps.map(p => p.release_pos_x)), ext: mean(ps.map(p => p.release_extension)) };
}

// ─── Container 1: 3D release model ───
function ReleaseCard({ pitcher, hand, heightIn, fb, armAngle, staticRow, getPitchColor, year }) {
  const stageRef = useRef(null), canvasRef = useRef(null), svgRef = useRef(null), cardRefs = useRef({}), sceneRef = useRef(null);
  const lastId = useRef(null);
  const [view, setViewName] = useState("catcher");
  const [showAvg, setShowAvg] = useState(true), [showLines, setShowLines] = useState(true);
  const [hot, setHot] = useState(null), [sticky, setSticky] = useState(null);
  const LY = OV_LEAGUE[year] || OV_LEAGUE["2026"], lg = LY[hand] || LY.R, is26 = year === "2026", hp = `${hand}HP`;
  const ready = fb && armAngle != null && fb.relZ != null && fb.relX != null && fb.ext != null;

  useEffect(() => {
    if (!ready) return undefined;
    const sc = createReleaseScene({ canvas: canvasRef.current, stage: stageRef.current, svg: svgRef.current, getCards: () => cardRefs.current, onViewChange: setViewName });
    sceneRef.current = sc; lastId.current = null;
    return () => { sc.dispose(); sceneRef.current = null; };
  }, [ready]);
  useEffect(() => {
    const sc = sceneRef.current; if (!sc || !ready) return;
    const h = heightIn || OV_AVG_HEIGHT_IN;
    const pose = solvePose({ heightIn: h, hand, relX: fb.relX, relZ: fb.relZ, ext: fb.ext, armAngle, front: is26 ? staticRow?.f : staticRow?.f25, comX: is26 ? staticRow?.c : staticRow?.c25 });
    const a = lg.avg, avg = solvePose({ heightIn: OV_AVG_HEIGHT_IN, hand, relX: a.relX, relZ: a.relZ, ext: a.ext, armAngle: a.armAngle, front: lg.front, comX: lg.comX });
    sc.setData({ pose, avg, pitchColor: getPitchColor(fb.type), showAvg, showLines, resetView: lastId.current !== pitcher.id });
    lastId.current = pitcher.id;
  }, [ready, pitcher.id, hand, heightIn, fb, armAngle, staticRow, showAvg, showLines, lg, getPitchColor]);
  useEffect(() => { if (sceneRef.current) sceneRef.current.setHot(hot || sticky); }, [hot, sticky, ready]);

  const cards = ready ? [
    { k: "A", name: "Arm angle", val: armAngle, unit: "°", avg: lg.avg.armAngle, dist: lg.dist.armAngle },
    { k: "H", name: "Rel. height", val: fb.relZ, unit: "ft", avg: lg.avg.relZ, dist: lg.dist.relZ },
    { k: "S", name: "Rel. side", val: fb.relX, unit: "ft", avg: lg.avg.relX, dist: lg.dist.relX, abs: true },
    { k: "E", name: "Extension", val: fb.ext, unit: "ft", avg: lg.avg.ext, dist: lg.dist.ext },
  ] : [];
  const activeHot = hot || sticky;
  return (
    <div className="ov-card">
      {!ready ? (
        <div className="ov-note">{!fb ? `No ${year} fastballs on record for this pitcher.` : `No ${year} arm angle on file for this pitcher yet.`}</div>
      ) : (
        <div className="ov-stage" ref={stageRef}>
          <canvas ref={canvasRef} />
          <svg className="ov-leaders" ref={svgRef} />
          <div className="ov-cards">
            {showLines && cards.map(c => {
              // deltas use the rounded values shown, so the arithmetic on screen always checks out
              const v = c.abs ? Math.abs(c.val) : c.val, a = c.abs ? Math.abs(c.avg) : c.avg, dv = R(v) - R(a), pc = pctile(c.dist, R(v) === R(a) ? a : v);
              return (
                <button key={c.k} ref={el => { if (el) cardRefs.current[c.k] = el; else delete cardRefs.current[c.k]; }}
                  className={`ov-co${activeHot === c.k ? " hot" : ""}`} style={{ "--k": COL[c.k] }}
                  onMouseEnter={() => setHot(c.k)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(c.k)} onBlur={() => setHot(null)}
                  onClick={() => setSticky(s => (s === c.k ? null : c.k))}>
                  <span className="k">{c.name}</span>
                  <span className="v">{r1(c.val)}<small>{c.unit}</small></span>
                  <span className="bar"><span className="a" /><span className="p" style={{ left: `${pc}%` }} /></span>
                  <span className="pc"><b>{ord(pc)}</b> pct</span>
                  <span className="d"><b>{sgn(dv, c.unit === "°" ? "°" : " ft")}</b> vs avg {r1(c.avg)}{c.unit === "°" ? "°" : ""}</span>
                </button>
              );
            })}
          </div>
          <div className="ov-seg views">
            {[["quarter", "3/4"], ["catcher", "Front"], ["open", "Side"], ["behind", "Back"], ["top", "Top"]].map(([k, l]) => (
              <button key={k} className={view === k ? "on" : ""} onClick={() => sceneRef.current && sceneRef.current.setView(k)}>{l}</button>
            ))}
          </div>
          <div className="ov-seg tg">
            <button aria-pressed={showAvg} onClick={() => setShowAvg(v => !v)}>Avg</button>
            <button aria-pressed={showLines} onClick={() => setShowLines(v => !v)}>Lines</button>
          </div>
          <div className="ov-zoom">
            <button aria-label="Zoom in" onClick={() => sceneRef.current && sceneRef.current.zoomBy(.72)}>+</button>
            <button aria-label="Zoom out" onClick={() => sceneRef.current && sceneRef.current.zoomBy(1.39)}>−</button>
          </div>
          <div className="ov-legend">
            <span><i style={{ background: "#eceff3" }} />{pitcher.name} · {SHORT[fb.name] || fb.name}</span>
            {showAvg && <span><i style={{ background: COL.G }} />Average {hp}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Container 2: pitch mix by batter side and count ───
function MixCard({ mix, year, getPitchColor, PITCH_ABBREV }) {
  return (
    <div className="ov-card">
      <div className="ov-head"><div className="ov-ct">Mix</div></div>
      {!mix ? <div className="ov-note">No {year} MLB pitches.</div> : (
        <div className="ov-mix">
          <div className="ov-mrow" style={{ "--n": mix.types.length }}><span />
            {mix.types.map(t => <div key={t.type} className="ov-chip" style={{ background: getPitchColor(t.type) }} title={t.name}>{PITCH_ABBREV[t.name] || t.type}</div>)}
          </div>
          {[["R", "vs RHH"], ["L", "vs LHH"]].map(([h, lab]) => (
            <div key={h} style={{ display: "contents" }}>
              <div className="ov-msec">{lab}</div>
              {[["all", "Overall"], ["pre", "Pre-2K"], ["two", "2K"]].map(([rk, rl]) => {
                const row = mix.splits[h][rk];
                return (
                  <div key={rk} className={`ov-mrow${rk === "all" ? " ov-all" : ""}`} style={{ "--n": mix.types.length }}>
                    <div className="ov-mlab">{rl}<small>{row.n.toLocaleString()}</small></div>
                    {mix.types.map(t => {
                      const v = row.pct[t.type];
                      if (v == null) return <div key={t.type} className="ov-mcell z">—</div>;
                      // only the standouts get marked: green well above his norm for that pitch, red well below
                      // Overall row: vs. his whole mix (both batter sides). Pre-2K / 2K rows: vs. his Overall for that batter side.
                      const base = rk === "all" ? t.usage : mix.splits[h].all.pct[t.type];
                      const rv = Math.round(v), d = base == null ? 0 : rv - Math.round(base), hi = d >= 8 && v >= base * 1.3, lo = d <= -8 && v <= base * .7;
                      return <div key={t.type} className={`ov-mcell${hi ? " hi" : lo ? " lo" : ""}${rv === 0 ? " z" : ""}`} title={`${t.name} · ${v.toFixed(1)}% (${rk === "all" ? "his overall" : `his overall ${lab}`}: ${base == null ? "—" : base.toFixed(1)}%)`}>{rv}<small>%</small></div>;
                    })}
                  </div>
                );
              })}
            </div>
          ))}
          <div className="ov-mkey"><i />Well above his usual usage<i />Well below</div>
        </div>
      )}
    </div>
  );
}

// ─── Grades: Stuff+ / Location+ / Pitching+ (tools/pitch-grades). Cell = [Stuff+, Location+, Pitching+, pitches]. ───
// 100 = league-average pitch that season, 10 points = 0.45 runs per 100 pitches on all three, so the grades are comparable.
// Colour is vs the league for that exact subset: overall tiles vs 100, pitch-type cells vs the league mean for that pitch type.
const FlagIcon = ({ color = "currentColor" }) => <svg viewBox="0 0 9 10" aria-hidden="true"><path d="M1 0v10" stroke={color} strokeWidth="1.4" /><path d="M1.6 .6h6.6L6.4 3l1.8 2.4H1.6z" fill={color} /></svg>;
const FLAG_TEXT = {
  u: ["Unique shape", "Few other pitchers throw anything close to his shape and release, so Stuff+ is extrapolating from distant comparisons. Treat it as an estimate."],
  s: ["Small sample", "Fewer than 200 pitches this season. Location+ and Pitching+ are still pulled most of the way toward average."],
};
const GRADE_ROWS = [["s", 0, "Stuff+"], ["l", 1, "Location+"], ["p", 2, "Pitching+"]];
function gradeTone(v, ref, label, n) {
  if (v == null || !ref || !ref[1]) return {};
  const z = (v - ref[0]) / ref[1], mag = Math.max(0, Math.min(1, (Math.abs(z) - 0.4) / 1.6)), alpha = (0.07 + 0.36 * mag).toFixed(3);
  const col = Math.abs(z) < 0.4 ? null : z >= 0 ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`;
  return { style: col ? { backgroundImage: `linear-gradient(${col},${col})` } : undefined,
    title: `${label} ${v} · league avg ${ref[0]}${n != null ? ` · ${n.toLocaleString()} pitches` : ""} · ${ord(Math.max(1, Math.min(99, Math.round(normCdf(z) * 100))))} pctile` };
}
function GradesCard({ gr, mix, year, getPitchColor, PITCH_ABBREV }) {
  const lg = OV_GRADES_LG[year] || {}, types = mix ? mix.types.filter(t => gr?.t?.[t.type]) : [];
  return (
    <div className="ov-card">
      <div className="ov-head"><div className="ov-ct">Grades</div></div>
      {!gr?.a || !types.length ? <div className="ov-note">No {year} pitch grades for this pitcher.</div> : (
        <div className="ov-mix">
          <div className="ov-mrow" style={{ "--n": types.length }}><span />
            {types.map(t => { const u = gr.u?.includes(t.type); return <div key={t.type} className="ov-chip" style={{ background: getPitchColor(t.type) }} title={u ? `${t.name} · unique shape: few close matches among other pitchers, Stuff+ is extrapolating` : t.name}>{PITCH_ABBREV[t.name] || t.type}{u && <span className="fl"><FlagIcon color="#fff" /></span>}</div>; })}
          </div>
          {GRADE_ROWS.map(([mk, mi, mlab]) => (
            <div key={mk} style={{ display: "contents" }}>
              <div className="ov-msec">{mlab}</div>
              {[[0, "Overall", " ov-all"], [2, "vs RHH", ""], [1, "vs LHH", ""]].map(([i, lab, cls]) => (
                <div key={lab} className={`ov-mrow${cls}`} style={{ "--n": types.length }}>
                  <div className="ov-mlab">{lab}</div>
                  {types.map(t => {
                    const c = gr.t[t.type][i];
                    return c ? <div key={t.type} className="ov-ccell" {...gradeTone(c[mi], lg.t?.[t.type]?.[mk], `${t.name} ${lab} · ${mlab}`, c[3])}><b>{c[mi]}</b></div>
                      : <div key={t.type} className="ov-ccell z">—</div>;
                  })}
                </div>
              ))}
            </div>
          ))}
          <div className="ov-cnote">100 = average pitch · 10 points = 0.45 runs per 100 pitches · color is vs the league for that pitch type{gr.u?.some(u => types.find(t => t.type === u)) && <><br /><span className="fl"><FlagIcon /></span>unique shape, few close matches among other pitchers</>}</div>
        </div>
      )}
    </div>
  );
}

// ─── Container 3: pitch movement (same conventions as the Movement Plot) + arm angle + spin efficiency ───
function MoveCard({ C, hand, mix, year, armAngle, getPitchColor, PITCH_ABBREV }) {
  const cvRef = useRef(null);
  const [showAvg, setShowAvg] = useState(true), [tick, setTick] = useState(0);
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return undefined;
    const ro = new ResizeObserver(() => setTick(t => t + 1)); ro.observe(cv); return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const cw = cv.clientWidth, ch = cv.clientHeight; if (!cw || !ch) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2); cv.width = cw * dpr; cv.height = ch * dpr;
    const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cw, ch);
    const mL = 38, mB = 30, mT = 6, mR = 8, side = Math.min(cw - mL - mR, ch - mT - mB), x0 = mL + (cw - mL - mR - side) / 2, y0 = mT, AX = 25;
    const X = (v) => x0 + (v + AX) / (2 * AX) * side, Y = (v) => y0 + (AX - v) / (2 * AX) * side;
    c.font = "10px 'DM Sans',sans-serif"; c.textBaseline = "middle";
    for (let g = -25; g <= 25; g += 5) {
      c.strokeStyle = g === 0 ? C.borderLight : C.border; c.lineWidth = 1; c.setLineDash(g === 0 ? [] : [3, 3]);
      c.beginPath(); c.moveTo(X(g), Y(-AX)); c.lineTo(X(g), Y(AX)); c.moveTo(X(-AX), Y(g)); c.lineTo(X(AX), Y(g)); c.stroke();
      c.fillStyle = C.textDim; c.textAlign = "center"; c.fillText(g, X(g), Y(-AX) + 10); c.textAlign = "right"; c.fillText(g, X(-AX) - 5, Y(g));
    }
    c.setLineDash([]); c.textAlign = "center"; c.fillStyle = C.textDim;
    c.fillText("Horizontal Break (in)", x0 + side / 2, Y(-AX) + 24);
    c.save(); c.translate(x0 - 28, y0 + side / 2); c.rotate(-Math.PI / 2); c.fillText("Induced Vertical Break (in)", 0, 0); c.restore();
    if (!mix) return;
    const idx = {}; mix.types.forEach((t, i) => { idx[t.type] = i; });
    const sums = mix.types.map(() => [0, 0, 0]);
    c.save(); c.beginPath(); c.rect(X(-AX), Y(AX), side, side); c.clip();
    for (const p of mix.valid) {
      const ti = idx[p.pitch_type]; if (ti == null || p.pfx_x == null || p.pfx_z == null) continue;
      sums[ti][0] += p.pfx_x; sums[ti][1] += p.pfx_z; sums[ti][2]++;
      c.beginPath(); c.arc(X(p.pfx_x), Y(p.pfx_z), 2.7, 0, 6.2832); c.globalAlpha = .8; c.fillStyle = getPitchColor(p.pitch_type); c.fill();
      c.globalAlpha = .45; c.strokeStyle = "#000"; c.lineWidth = .5; c.stroke();
    }
    c.globalAlpha = 1;
    // arm angle: dotted line from the origin out the arm side (pitcher's view: RHP arm side is +x)
    const s = hand === "L" ? -1 : 1, hasAA = armAngle != null, th = (armAngle || 0) * Math.PI / 180, dx = s * Math.cos(th), dy = Math.sin(th);
    const tEdge = Math.min(AX / Math.abs(dx || 1e-9), AX / Math.abs(dy || 1e-9));
    if (hasAA) { c.strokeStyle = C.text; c.lineWidth = 1.6; c.setLineDash([2, 4]); c.lineCap = "round"; c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(dx * tEdge), Y(dy * tEdge)); c.stroke(); c.setLineDash([]); }
    if (showAvg) sums.forEach((a, ti) => {
      if (!a[2]) return; c.beginPath(); c.arc(X(a[0] / a[2]), Y(a[1] / a[2]), 7, 0, 6.2832);
      c.fillStyle = getPitchColor(mix.types[ti].type); c.shadowColor = "rgba(0,0,0,.75)"; c.shadowBlur = 9 * dpr; c.shadowOffsetY = 2.5 * dpr; c.fill();
      c.shadowColor = "transparent"; c.shadowBlur = 0; c.shadowOffsetY = 0; c.lineWidth = 2; c.strokeStyle = "#000"; c.stroke();
    });
    c.restore();
    if (hasAA) {
      const txt = `${r1(armAngle)}°`; c.font = "700 10.5px 'DM Sans',sans-serif";
      const tw = c.measureText(txt).width + 8;
      const lx = Math.max(X(-AX) + tw / 2 + 2, Math.min(X(AX) - tw / 2 - 2, X(dx * tEdge * .9) - s * (tw / 2 + 4)));
      const ly = Math.max(Y(AX) + 9, Math.min(Y(-AX) - 9, Y(dy * tEdge * .9) + (dy >= 0 ? 12 : -12)));
      c.fillStyle = C.surface; c.globalAlpha = .88; c.fillRect(lx - tw / 2, ly - 8, tw, 16); c.globalAlpha = 1; c.fillStyle = C.text; c.textAlign = "center"; c.fillText(txt, lx, ly + .5);
    }
  }, [mix, armAngle, hand, showAvg, C, tick, getPitchColor]);

  return (
    <div className="ov-card">
      <div className="ov-head"><div className="ov-ct">Break</div></div>
      {mix && (
        <div className="ov-mvtop">
          <div className="ov-mrow" style={{ "--n": mix.types.length }}><span />
            {mix.types.map(t => <div key={t.type} className="ov-chip" style={{ background: getPitchColor(t.type) }} title={t.name}>{PITCH_ABBREV[t.name] || t.type}</div>)}
          </div>
          <div className="ov-mrow" style={{ "--n": mix.types.length }}><div className="ov-mlab">Velo<small>mph</small></div>
            {mix.types.map(t => {
              // average velocity vs. the league average for that pitch type and pitcher hand: green = harder, red = softer,
              // stronger colour the further from average (full strength at 2 SD)
              const v = mean(mix.valid.filter(p => p.pitch_type === t.type).map(p => p.release_speed)), bl = OV_POOLS[year]?.[hand]?.pitch?.[t.type]?.v;
              const z = v != null && bl && bl[1] ? (v - bl[0]) / bl[1] : 0;
              return <div key={t.type} className="ov-velo" style={Math.abs(z) < 0.4 ? undefined : { color: `color-mix(in srgb, ${z > 0 ? "#16a34a" : "#dc2626"} ${Math.round(40 + 60 * Math.min(1, (Math.abs(z) - 0.4) / 1.6))}%, var(--text))` }} title={bl ? `${year} ${hand}HP ${t.name} avg ${bl[0].toFixed(1)} mph` : t.name}>{v != null ? v.toFixed(1) : "—"}</div>;
            })}
          </div>
        </div>
      )}
      <div className="ov-mvwrap"><canvas ref={cvRef} /></div>
      <div className="ov-mvfoot">
        <div className="ov-mvleg" style={{ flexDirection: "row", alignItems: "center", gap: "12px" }}>
          <div className="ov-lg">{armAngle != null && <span className="aa"><i />Arm angle</span>}</div>
          <button className="ov-avg" aria-pressed={showAvg} onClick={() => setShowAvg(v => !v)}><i />Avg.</button>
        </div>
      </div>
    </div>
  );
}

// Spin efficiency = share of spin that is perpendicular to the ball's flight (the part that makes it move).
// Seen from above with the pitch travelling up the frame: 100% = spin axis square to the flight path;
// the axis swings toward the flight path by the "gyro angle", where efficiency = cos(gyro angle).
function SpinGraphic({ spin, hand }) {
  const label = <div className="k">{spin?.name || "Fastball"}<br />spin efficiency</div>;
  if (!spin || spin.eff == null) return <div className="ov-spin"><div>{label}<div className="v">—</div></div></div>;
  const e = spin.eff, gyro = Math.acos(Math.min(1, e / 100)) * 180 / Math.PI, s = hand === "L" ? 1 : -1, rot = s * gyro;   // glove-side end leads: cut-style spin
  const W = 132, H = 92, bx = 84, by = 34, Rb = 19;
  let st = "";
  for (let i = -4; i <= 4; i++) { const a = i * .17; st += `<line x1="${(Math.sin(a) * Rb * 1.02).toFixed(1)}" y1="${(-Rb * .52 - Math.cos(a) * 3 + 6).toFixed(1)}" x2="${(Math.sin(a) * Rb * 1.02 + Math.sin(a) * 1.5).toFixed(1)}" y2="${(-Rb * .52 - Math.cos(a) * 3 + 2.2).toFixed(1)}"/>`; }
  const seam = `<path d="M${-Rb * .82} ${-Rb * .46} Q0 ${-Rb * .9} ${Rb * .82} ${-Rb * .46}" fill="none" stroke="#b91c1c" stroke-width="1"/><g stroke="#b91c1c" stroke-width=".8" transform="translate(0,-5.2)">${st}</g>`;
  const skin = "#b3a79b", skinD = "#978b80";
  const svg = `<defs><radialGradient id="ovsb" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#e5e7eb"/><stop offset="1" stop-color="#b6bcc6"/></radialGradient>` +
    `<linearGradient id="ovsd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9a7658"/><stop offset="1" stop-color="#7d5f47"/></linearGradient>` +
    `<linearGradient id="ovsk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${skinD}"/><stop offset=".45" stop-color="${skin}"/><stop offset="1" stop-color="${skinD}"/></linearGradient>` +
    `<clipPath id="ovsc"><circle r="${Rb}"/></clipPath></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#ovsd)"/>` +
    `<line x1="${bx - 40}" y1="${by}" x2="${bx + 40}" y2="${by}" stroke="#f1f5f9" stroke-opacity=".45" stroke-width="1" stroke-dasharray="2 3"/>` +
    `<path d="M${bx} ${by - Rb - 3} V5 M${bx - 3.5} 9.5 L${bx} 5 L${bx + 3.5} 9.5" fill="none" stroke="#f1f5f9" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    // hand following through below the ball: right hand for a righty, left for a lefty (seen from above)
    `<g transform="translate(${bx + s * 2} ${by + 30}) scale(${s} 1) rotate(-24)">` +
    `<path d="M-8 60 L-6.5 20 Q-7 12 -9.5 6 L-9 -8 Q-8.6 -11 -6.6 -11 Q-4.8 -11 -4.6 -8 L-4.3 -13 Q-4 -16.5 -1.8 -16.5 Q.4 -16.5 .6 -13 L.9 -12 Q1.3 -15 3.3 -15 Q5.4 -15 5.5 -11.5 L5.7 -8 Q6.2 -10.5 8 -10.3 Q9.9 -10 9.8 -6.5 L9.3 6 Q11.5 3 13.6 4.4 Q15 5.6 13.6 8 L9.5 15 Q8 18.5 8 22 L10.5 60 Z" fill="url(#ovsk)" stroke="#6f655c" stroke-width=".6" stroke-linejoin="round"/>` +
    `<path d="M-4.4 -8 V2 M.8 -12 V2 M5.6 -8 V2" stroke="#857a70" stroke-width=".6" fill="none"/></g>` +
    `<g transform="translate(${bx} ${by}) rotate(${rot.toFixed(1)})"><line x1="-36" y1="0" x2="36" y2="0" stroke="#0b0f17" stroke-width="4.5"/>` +
    `<circle r="${Rb}" fill="url(#ovsb)" stroke="#6b7280" stroke-width=".6"/><g clip-path="url(#ovsc)">${seam}<g transform="scale(1,-1)">${seam}</g></g></g>`;
  return (
    <div className="ov-spin">
      <div>{label}<div className="v">{r1(e)}<small>%</small></div><div className="s">axis {Math.round(gyro)}° off square</div></div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Spin axis tilted ${Math.round(gyro)} degrees from square`} dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

// ─── Row 2, left: spin efficiency + spin rate by pitch type ───
function SpinCard({ hand, mix, year, spin, getPitchColor }) {
  const pools = OV_POOLS[year]?.[hand]?.pitch || {};
  return (
    <div className="ov-card">
      <div className="ov-head"><div className="ov-ct">Spin</div></div>
      <div className="ov-body">
        <SpinGraphic spin={spin} hand={hand} />
        <div className="ov-hsub">Spin rate · percentile among {hand}HP</div>
        {!mix ? <div className="ov-note">No {year} MLB pitches.</div> : mix.types.map(t => {
          const v = mean(mix.valid.filter(p => p.pitch_type === t.type).map(p => p.release_spin_rate));
          return <Slider key={t.type} label={SHORT[t.name] || t.name} dot={getPitchColor(t.type)} pct={pctFromQ(pools[t.type]?.s, v)}
            value={v != null ? Math.round(v).toLocaleString() : "—"} unit="rpm" title={pools[t.type] ? `Among ${pools[t.type].n} ${hand}HP with 50+ ${t.name}s` : "Too few pitchers throw this to rank it"} />;
        })}
      </div>
    </div>
  );
}

// Run value of one pitch from the batter's side (+ = good for the hitter). Balls in play are scored by
// expected damage from exit velocity and launch angle (xwOBAcon → runs on the EVENT_LW scale), not the
// actual result; everything else by the change in count run expectancy, or the K / BB / HBP weight.
function pitchRunValue(p, { xwobaconLookup, COUNT_RE, EVENT_LW }) {
  const b = Math.max(0, Math.min(3, Number(p.balls) || 0)), s = Math.max(0, Math.min(2, Number(p.strikes) || 0));
  const re = (bb, ss) => COUNT_RE[`${bb}-${ss}`] ?? 0, cur = re(b, s);
  if (p.is_in_play) {
    const x = xwobaconLookup(p.launch_speed, p.launch_angle), ev = (p.events || "").toLowerCase().trim();
    return (x != null ? -0.264 + 0.827 * x : (EVENT_LW[ev] ?? -0.264)) - cur;
  }
  if (p.is_ball) return (b === 3 ? EVENT_LW.walk : re(b + 1, s)) - cur;
  if (p.is_whiff || p.is_called_strike) return (s === 2 ? EVENT_LW.strikeout : re(b, s + 1)) - cur;
  if (p.is_swing) return s >= 2 ? 0 : re(b, s + 1) - cur;                                   // foul
  if ((p.events || "").toLowerCase().trim() === "hit_by_pitch") return EVENT_LW.hit_by_pitch - cur;
  return 0;
}
// League-average run value for that pitch type, pitcher hand, batter side and location (mirrored from
// the opposite-handed table when a matchup is too rare to have its own).
function leagueRunValue(p, hand) {
  const T = OV_RVBASE, cell = (key, x) => {
    const t = T.t[key]; if (!t) return null;
    const xi = Math.max(0, Math.min(T.nx - 1, Math.floor((x - T.x0) / T.d))), zi = Math.max(0, Math.min(T.nz - 1, Math.floor((p.plate_z - T.z0) / T.d)));
    return t[zi * T.nx + xi] / 1000;
  };
  const bh = p.batter_hand === "L" ? "L" : "R", flip = (h) => (h === "L" ? "R" : "L");
  return cell(`${p.pitch_type}|${hand}|${bh}`, p.plate_x) ?? cell(`${p.pitch_type}|${flip(hand)}|${flip(bh)}`, -p.plate_x) ?? 0;
}

function SideToggle({ side, setSide }) {
  return <div className="ov-tg3">{[["all", "All"], ["L", "vs LHH"], ["R", "vs RHH"]].map(([k, l]) => <button key={k} aria-pressed={side === k} onClick={() => setSide(k)}>{l}</button>)}</div>;
}

// ─── Row 2, middle: location heatmaps (the Heatmaps tab's Gaussian granular canvas) ───
function HeatTile({ label, pitches, mode, Canvas, weightFn, side }) {
  const ref = useRef(null), [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(e => setW(Math.floor(e[0].contentRect.width * 2))); ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  return (
    <div className="tile">
      <div className="hd">{label}<span>{pitches.length.toLocaleString()}</span></div>
      <div className="cv" ref={ref}>{w > 0 && <Canvas pitches={pitches} width={w} height={w} mode={mode} hand={side || "all"} granular weightFn={weightFn || null} />}</div>
    </div>
  );
}
const HEAT_SLIDES = [["success", "Success"], ["frequency", "Frequency"], ["whiffs", "Whiffs"], ["damage", "Damage"]];
function HeatCard({ mix, year, hand, side, setSide, rvHelpers, getPitchColor, PITCH_ABBREV, GaussianHeatmapCanvas, pitchMatchesCount }) {
  const [sel, setSel] = useState(null), [count, setCount] = useState("all"), [slide, setSlide] = useState(0);
  const types = mix ? mix.types : [], cur = types.find(t => t.type === sel) || types[0];
  const sets = useMemo(() => {
    if (!mix || !cur) return null;
    const base = mix.valid.filter(p => p.pitch_type === cur.type && (side === "all" || p.batter_hand === side) && p.plate_x != null && p.plate_z != null && pitchMatchesCount(p, count));
    return { success: base, frequency: base, whiffs: base.filter(p => p.is_whiff), damage: base.filter(p => p.is_in_play) };
  }, [mix, cur, count, side, pitchMatchesCount]);
  // Success = runs saved per pitch vs. the league average for that pitch type at that spot (+ = good for him)
  const successFn = useMemo(() => (p) => leagueRunValue(p, hand) - pitchRunValue(p, rvHelpers), [hand, rvHelpers]);
  const [mode, label] = HEAT_SLIDES[slide], step = (d) => setSlide(i => (i + d + HEAT_SLIDES.length) % HEAT_SLIDES.length);
  return (
    <div className="ov-card">
      <div className="ov-head"><div className="ov-ct">Location</div><SideToggle side={side} setSide={setSide} /></div>
      <div className="ov-body">
        {!sets ? <div className="ov-note">No {year} MLB pitches.</div> : (<>
          <div className="ov-mrow" style={{ "--n": types.length }}><span />
            {types.map(t => <button key={t.type} className="ov-chip" aria-pressed={t.type === cur.type} style={{ background: getPitchColor(t.type) }} onClick={() => setSel(t.type)} title={t.name}>{PITCH_ABBREV[t.name] || t.type}</button>)}
          </div>
          <div className="ov-car">
            <button className="ov-arrow" aria-label="Previous map" onClick={() => step(-1)}>‹</button>
            <div className="ov-hm">
              <HeatTile key={mode} label={label} pitches={sets[mode]} mode={mode} side={side} Canvas={GaussianHeatmapCanvas} weightFn={mode === "success" ? successFn : null} />
            </div>
            <button className="ov-arrow" aria-label="Next map" onClick={() => step(1)}>›</button>
          </div>
          <div className="ov-tabs">
            {HEAT_SLIDES.map(([k, l], i) => <button key={k} aria-pressed={i === slide} onClick={() => setSlide(i)}>{l}</button>)}
          </div>
          <div className="ov-foot">
            <span>Count</span>
            <select value={count} onChange={e => setCount(e.target.value)} aria-label="Count situation">
              <option value="all">All Counts</option><option value="pre2k">Pre-Two-Strike</option><option value="two_strikes">Two Strikes</option>
              <option value="ahead">Pitcher Ahead</option><option value="behind">Pitcher Behind</option><option value="leverage">Leverage</option>
            </select>
            {mode === "success" && <span className="ov-skey"><i style={{ background: "#22c55e" }} />Better than league there<i style={{ background: "#ef4444" }} />Worse</span>}
          </div>
        </>)}
      </div>
    </div>
  );
}

// ─── Row 2, right: whole-arsenal percentile sliders ───
function arsenalStats(pitches, h, line, box, year, computeSummaryStats) {
  if (!pitches || !line) return null;
  const f = pitches.filter(p => (h === "all" || p.batter_hand === h) && p.pitch_name && p.pitch_name.trim() !== "" && p.pitch_name.toLowerCase() !== "nan");
  if (!f.length) return null;
  let sw = 0, wh = 0, st = 0, ozs = 0, ozt = 0, izw = 0, izs = 0, ba = 0, bbe = 0;
  for (const p of f) {   // same definitions as computeMetrics
    if (p.is_whiff) wh++; if (p.is_swing) sw++; if (p.is_swing || p.is_called_strike) st++;
    if (!p.is_in_zone) { ozt++; if (p.is_swing) ozs++; } else if (p.is_swing) { izs++; if (p.is_whiff) izw++; }
    if (p.is_in_play && !p.is_bunt) { bbe++; if (p.is_barrel) ba++; }
  }
  const c = f.length, pc = (n, d) => (d > 0 ? 100 * n / d : null);
  const src = h === "all" ? line : line[h];
  // HR/9: official box totals for the full 2026 line, otherwise counted from at-bat-ending events
  let hr9 = null;
  if (h === "all" && year === "2026" && box && box.outs > 0 && box.home_runs != null) hr9 = 27 * box.home_runs / box.outs;
  else {
    const ab = new Map();
    for (const p of pitches) { if ((h !== "all" && p.batter_hand !== h) || !p.game_pk || p.at_bat_number == null) continue; const ev = (p.events || "").toLowerCase().trim(); if (ev) ab.set(`${p.game_pk}-${p.at_bat_number}`, ev); }
    let hr = 0; for (const ev of ab.values()) if (ev === "home_run") hr++;
    const s = computeSummaryStats(pitches, h), ip = s ? String(s.ip).split(".") : null, outs = ip ? Number(ip[0]) * 3 + Number(ip[1] || 0) : 0;
    if (outs > 0) hr9 = 27 * hr / outs;
  }
  return { k: src?.k, bb: src?.bb, kbb: src && src.k != null && src.bb != null ? R(R(src.k) - R(src.bb)) : null, era: h === "all" ? parseFloat(line.era) : null,
    barrel: pc(ba, bbe), hr9, swstr: pc(wh, c), strike: pc(st, c), chase: pc(ozs, ozt), izwhiff: pc(izw, izs) };
}
const ARSENAL_ROWS = [["k", "K %"], ["bb", "BB %", true], ["kbb", "K-BB %"], ["barrel", "Barrel %", true], ["hr9", "HR/9", true, 2],
  ["swstr", "SwStr %"], ["strike", "Strike %"], ["chase", "Chase %"], ["izwhiff", "In-Zone Whiff %"]];
function StatCard({ hand, cur, line, box, year, computeSummaryStats, side: h, setSide: setH }) {
  const vals = useMemo(() => arsenalStats(cur, h, line, box, year, computeSummaryStats), [cur, h, line, box, year, computeSummaryStats]);
  const pool = OV_POOLS[year]?.[hand]?.stats?.[h], era = OV_STAT_BASE[year]?.era;
  return (
    <div className="ov-card">
      <div className="ov-head"><div className="ov-ct">Results</div>
        <SideToggle side={h} setSide={setH} />
      </div>
      <div className="ov-body">
        {!vals ? <div className="ov-note">No {year} MLB data.</div> : ARSENAL_ROWS.map(([key, label, lowGood, dec]) => {
          const v = vals[key], ok = v != null && !isNaN(v);
          // ERA has no pitch-level pool (earned runs aren't in the feed): rank it against league ERA with an assumed spread
          const pct = !ok ? null : key === "era" ? (era ? Math.max(1, Math.min(99, Math.round(normCdf((era[0] - v) / era[1]) * 100))) : null) : pctFromQ(pool?.[key], v, lowGood);
          return <Slider key={key} label={label} pct={pct} value={ok ? v.toFixed(dec || 1) : "—"}
            title={key === "era" ? (h === "all" ? `League ERA ${era ? era[0].toFixed(2) : "—"} · approximate percentile` : "ERA isn't split by batter side") : pool ? `Among ${pool.n} qualified ${hand}HP` : ""} />;
        })}
      </div>
    </div>
  );
}

// ─── Page ───
export default function OverviewPage({ C, helpers }) {
  const { fipConstsFor, normAndFilter, computeSummaryStats, isPostseasonDate, getPitchColor, PITCH_ABBREV, GaussianHeatmapCanvas, pitchMatchesCount } = helpers;
  const [q, setQ] = useState(""), [results, setResults] = useState([]), [open, setOpen] = useState(false);
  const [pitcher, setPitcher] = useState(null), [info, setInfo] = useState(null);
  const [year, setYear] = useState("2026");
  const [d26, setD26] = useState(null), [d25, setD25] = useState(null);
  const [loading26, setLoading26] = useState(false), [loading25, setLoading25] = useState(false);
  const [box26, setBox26] = useState(null), [box25, setBox25] = useState(null);
  const [err, setErr] = useState("");
  const [side, setSide] = useState("R");   // batter side shared by the Location and Results containers
  const searchRef = useRef(null), seqRef = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2 || (pitcher && q === pitcher.name)) { setResults([]); return undefined; }
    let alive = true;
    const t = setTimeout(async () => {
      try { const data = await searchPitchers(q); if (alive) { setResults(data || []); setOpen(true); } } catch { if (alive) setResults([]); }
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q, pitcher]);
  useEffect(() => {
    const h = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  const loadPitcher = async (p) => {
    const seq = ++seqRef.current;
    setPitcher(p); setQ(p.name); setOpen(false); setResults([]);
    setD26(null); setD25(null); setBox26(null); setBox25(null); setInfo(null); setErr(""); setYear("2026");
    setLoading26(true);
    getPitcherInfo(p.id).then(r => { if (seq === seqRef.current && r && !r.error) setInfo(r); }).catch(() => {});
    try {
      // Same progressive load as the Compare tab: cached season first, today's live games merged in after.
      const livePromise = getSeasonData(p.id).catch(() => []);
      const cachedRaw = await getCachedSeason(p.id).catch(() => []);
      if (seq !== seqRef.current) return;
      if (cachedRaw && cachedRaw.length > 0) {
        setD26(normAndFilter(cachedRaw)); setLoading26(false);
        livePromise.then(liveRaw => {
          if (seq !== seqRef.current || !liveRaw || liveRaw.length === 0) return;
          const real = new Set(cachedRaw.filter(x => x.game_pk && x.pitch_type && x.pitch_type.toLowerCase() !== "nan").map(x => String(x.game_pk)));
          const extra = liveRaw.filter(x => x.game_pk && !real.has(String(x.game_pk)));
          if (extra.length) setD26(normAndFilter([...cachedRaw, ...extra]));
        });
        return;
      }
      const liveRaw = await livePromise;
      if (seq !== seqRef.current) return;
      setD26(normAndFilter(liveRaw || []));
    } catch (e) {
      console.error("Overview load failed", e);
      if (seq === seqRef.current) setErr("Failed to load 2026 season data.");
    }
    if (seq === seqRef.current) setLoading26(false);
  };

  // 2025 loads on demand, from the same Statcast endpoint the Compare tab uses for its 2025 row.
  useEffect(() => {
    if (year !== "2025" || !pitcher || d25 || loading25) return;
    const seq = seqRef.current; setLoading25(true);
    getStatcast(pitcher.id, "2025-03-27", "2025-09-28").then(raw => {
      if (seq !== seqRef.current) return;
      setD25(normAndFilter(raw || [])); setLoading25(false);
    }).catch(() => { if (seq === seqRef.current) { setD25([]); setLoading25(false); } });
  }, [year, pitcher, d25, loading25, normAndFilter]);

  // Full season = regular season only (postseason is anything after Sep 28), as on the Compare tab.
  const reg26 = useMemo(() => (d26 ? d26.filter(p => !isPostseasonDate(p.game_date)) : null), [d26, isPostseasonDate]);
  const reg25 = useMemo(() => (d25 ? d25.filter(p => !isPostseasonDate(p.game_date)) : null), [d25, isPostseasonDate]);
  const cur = year === "2026" ? reg26 : reg25;

  // Official ERA / IP / box totals: season API for 2026 (as Compare does); box scores for 2025 (ERA only).
  useEffect(() => {
    if (!reg26 || !pitcher) return undefined;
    const pks = Array.from(new Set(reg26.map(p => p.game_pk).filter(Boolean))).slice(0, 200); if (!pks.length) return undefined;
    let alive = true; getPitcherEra(pitcher.id, pks, "season").then(r => { if (alive) setBox26(r || null); }).catch(() => {});
    return () => { alive = false; };
  }, [reg26, pitcher]);
  useEffect(() => {
    if (!reg25 || !pitcher) return undefined;
    const pks = Array.from(new Set(reg25.map(p => p.game_pk).filter(Boolean))).slice(0, 200); if (!pks.length) return undefined;
    let alive = true; getPitcherEra(pitcher.id, pks, "games").then(r => { if (alive) setBox25(r || null); }).catch(() => {});
    return () => { alive = false; };
  }, [reg25, pitcher]);

  const line = useMemo(() => seasonLine(cur, year === "2026" ? box26 : box25, year !== "2026", computeSummaryStats, fipConstsFor), [cur, year, box26, box25, computeSummaryStats]);
  const mix = useMemo(() => (cur ? buildMix(cur) : null), [cur]);
  const fb = useMemo(() => (mix ? primaryFastball(mix.valid) : null), [mix]);
  const hand = useMemo(() => {
    const h = info?.pitch_hand || pitcher?.throws; if (h === "L" || h === "R") return h;
    const src = (reg26 && reg26.length ? reg26 : cur) || []; let l = 0, r = 0; for (const p of src) { if (p.p_throws === "L") l++; else if (p.p_throws === "R") r++; }
    if (l || r) return l > r ? "L" : "R";
    const x = mean(src.map(p => p.release_pos_x)); return x != null && x > 0 ? "L" : "R";
  }, [info, pitcher, reg26, cur]);
  const srow = pitcher ? OV_PITCHERS[pitcher.id] : null;
  const aaMap = year === "2026" ? srow?.a : srow?.a25;
  const armAngle = fb && aaMap ? (aaMap[fb.type] ?? null) : null;
  const spin = useMemo(() => {
    if (!mix) return null;
    const codes = mix.types.map(t => t.type), code = codes.includes("FF") ? "FF" : codes.find(c => c === "SI" || c === "FC");
    if (!code) return null;
    const v = srow?.s?.[year.slice(2)]?.[code];
    return { name: { FF: "4-Seam", SI: "Sinker", FC: "Cutter" }[code], eff: v ?? null };
  }, [mix, srow, year]);

  const vars = { "--bg": C.bg, "--surface": C.surface, "--surfaceAlt": C.surfaceAlt, "--border": C.border, "--borderLight": C.borderLight, "--text": C.text, "--muted": C.textMuted, "--dim": C.textDim, "--accent": C.accent };
  const base = OV_STAT_BASE[year]?.[hand], hp = `${hand}HP`;
  const busy = year === "2026" ? loading26 : loading25;
  const gr = pitcher ? OV_GRADES[year]?.[pitcher.id] || null : null;

  return (
    <div className="ov" style={vars}>
      <style>{CSS}</style>
      <div className="ov-sum">
        <div className="ov-who" ref={searchRef}>
          <input value={q} onChange={e => setQ(e.target.value)} onFocus={() => results.length > 0 && setOpen(true)} placeholder="Search pitcher..." aria-label="Search pitcher" />
          {open && results.length > 0 && (
            <div className="ov-dd">
              {results.map(r => <div key={r.id} onClick={() => loadPitcher(r)}><strong>{r.name}</strong>{r.team && <span>{r.team}</span>}{r.throws && <span>({r.throws}HP)</span>}</div>)}
            </div>
          )}
          {pitcher && (
            <div className="ov-id">
              <div className="ov-face" role="img" aria-label={pitcher.name} style={{ backgroundImage: `url(${headshotUrl(pitcher.id)})` }} />
              {TEAM_IDS[pitcher.team] && <img className="ov-logo" src={`https://www.mlbstatic.com/team-logos/${TEAM_IDS[pitcher.team]}.svg`} alt={pitcher.team} onError={e => { e.currentTarget.style.display = "none"; }} />}
              <div className="nm"><h1>{pitcher.name}</h1><span>{hand}HP{info?.height_inches ? ` · ${ftIn(info.height_inches)}` : ""}</span>
                {gr?.f && <div className="ov-flags">{[...gr.f].map(k => <span key={k} className="ov-flag" title={FLAG_TEXT[k][1]}><FlagIcon />{FLAG_TEXT[k][0]}</span>)}</div>}
              </div>
            </div>
          )}
        </div>
        <div className="ov-stats">
          {!pitcher && <div className="ov-note" style={{ padding: "8px 0", textAlign: "left" }}>Search a pitcher to load his season line, release model, pitch mix and movement.</div>}
          {pitcher && busy && <div className="ov-note" style={{ padding: "8px 0" }}>Loading {year} season…</div>}
          {pitcher && !busy && !line && <div className="ov-note" style={{ padding: "8px 0" }}>{err || `No ${year} MLB data for this pitcher.`}</div>}
          {pitcher && !busy && line && (<>
            {gr?.a && GRADE_ROWS.map(([mk, mi, mlab]) => (
              <div key={mk} className="ov-grp">
                <div className="ov-st big" {...gradeTone(gr.a[mi], OV_GRADES_LG[year]?.all?.[mk], `${year} ${mlab}`, gr.a[3])}><div className="k">{mlab}</div><div className="v">{gr.a[mi]}</div></div>
                <div className="ov-sp">
                  <div {...gradeTone(gr.L?.[mi], OV_GRADES_LG[year]?.all?.[mk], `${year} ${mlab} vs LHH`, gr.L?.[3])}><span>vs L</span><b>{gr.L ? gr.L[mi] : "—"}</b></div>
                  <div {...gradeTone(gr.R?.[mi], OV_GRADES_LG[year]?.all?.[mk], `${year} ${mlab} vs RHH`, gr.R?.[3])}><span>vs R</span><b>{gr.R ? gr.R[mi] : "—"}</b></div>
                </div>
              </div>
            ))}
            <div className="ov-grp run">
              {[["ERA", line.era, "era", OV_STAT_BASE[year]?.era, `${year} MLB`], ["FIP", line.fip, "fip", base?.all?.fip, `${year} ${hp}`], ["xFIP", line.xfip, "xfip", base?.all?.xfip, `${year} ${hp}`], ["IP", line.ip]].map(([k, v, key, b, lab]) => (
                <div key={k} className="ov-st" {...(key ? tone(key, v, b, lab) : {})}><div className="k">{k}</div><div className="v">{v}</div></div>
              ))}
            </div>
          </>)}
        </div>
        {pitcher && (
          <div className="ov-years">
            {["2026", "2025"].map(y => <button key={y} aria-pressed={year === y} onClick={() => setYear(y)}>{y}</button>)}
          </div>
        )}
      </div>
      {pitcher && reg26 && (<>
        <div className="ov-row">
          <ReleaseCard pitcher={pitcher} hand={hand} heightIn={info?.height_inches || null} fb={busy ? null : fb} armAngle={armAngle} staticRow={srow} getPitchColor={getPitchColor} year={year} />
          <MixCard mix={busy ? null : mix} year={year} getPitchColor={getPitchColor} PITCH_ABBREV={PITCH_ABBREV} />
          <MoveCard C={C} hand={hand} mix={busy ? null : mix} year={year} armAngle={armAngle} getPitchColor={getPitchColor} PITCH_ABBREV={PITCH_ABBREV} />
        </div>
        <div className="ov-row ov-row2">
          <SpinCard hand={hand} mix={busy ? null : mix} year={year} spin={spin} getPitchColor={getPitchColor} />
          <HeatCard side={side} setSide={setSide} mix={busy ? null : mix} year={year} hand={hand} rvHelpers={helpers} getPitchColor={getPitchColor} PITCH_ABBREV={PITCH_ABBREV} GaussianHeatmapCanvas={GaussianHeatmapCanvas} pitchMatchesCount={pitchMatchesCount} />
          <StatCard side={side} setSide={setSide} hand={hand} cur={busy ? null : cur} line={line} box={year === "2026" ? box26 : box25} year={year} computeSummaryStats={computeSummaryStats} />
        </div>
        <div className="ov-row ov-row3">
          <GradesCard gr={gr} mix={busy ? null : mix} year={year} getPitchColor={getPitchColor} PITCH_ABBREV={PITCH_ABBREV} />
        </div>
      </>)}
    </div>
  );
}
