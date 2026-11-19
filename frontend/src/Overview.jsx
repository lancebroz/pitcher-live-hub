// ─── Overview tab ───────────────────────────────────────────────────────────────
// Search a pitcher → season line + three containers: 3D release model, pitch mix, pitch movement.
// Pitch data comes from the same endpoints and the same normaliser as the Compare tool
// (passed in through `helpers`), so the numbers reconcile across tabs.
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { searchPitchers, getCachedSeason, getSeasonData, getStatcast, getPitcherEra, getPitcherInfo, getPitcherArmAngle, searchBatters, getBatterCachedSeason, getBatterStatcast, getBatterLine } from "./api.js";
import { OV_PITCHERS, OV_LEAGUE, OV_AVG_HEIGHT_IN, OV_STAT_BASE, OV_POOLS } from "./overviewData.js";
import { solvePose } from "./releaseSolver.js";
import { createReleaseScene, RELEASE_COLORS as COL } from "./releaseScene.js";
import { successWeight, SUCCESS_VIEWS, SUCCESS_LEGEND, SUCCESS_CAPTION } from "./successValue.js";
import { HIT_POOLS, HIT_VALUE_REF, HIT_VALUE_K, HIT_USAGE_REF, HIT_LINE_POOLS, HIT_RANDOM_POOL } from "./hitterData.js";
import { HITTER_RESULT_ROWS, hitterResults, hitterLine } from "./hitterStats.js";
import { OV_VALUE_REF, OV_VALUE_K } from "./overviewValueRef.js";
import { OV_SV_REF, OV_SV_K } from "./overviewValueSvRef.js";
import { OV_RATE_STATS, OV_RATE_REF, OV_RATE_K } from "./overviewRatesRef.js";
import { OV_GRADES, OV_GRADES_LG, OV_RANDOM_POOL } from "./overviewGrades.js";
import { loadGradeCells, gradeRange, GRADE_MIN_PITCHES } from "./gradesRange.js";
import { armAngleFor } from "./armAngle.js";
import { usesSavantValue, hasParkTerm, pitcherValue } from "./pitcherValue.js";

// Remembered for the life of the page so leaving the tab and coming back keeps the same pitcher.
let OV_LAST_PITCHER = null;
let HIT_LAST_BATTER = null;   // same for the Hitters tab

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
.ov-stats{display:flex;gap:10px 10px;flex-wrap:wrap;align-items:stretch;flex:1}
.ov-grp{display:flex;gap:6px;align-items:stretch}
.ov-grp.run{margin-left:auto}
.ov-st{background:var(--surfaceAlt);border:1px solid var(--border);border-radius:8px;padding:6px 12px 7px;min-width:66px}
.ov-st .k{font-size:9.5px;letter-spacing:.9px;text-transform:uppercase;color:var(--muted);font-weight:700}
.ov-st .v{font-size:20px;font-weight:700;line-height:1.15;font-variant-numeric:tabular-nums}
.ov-st.big .v{font-size:26px}.ov-st .v small{font-size:12px;color:var(--muted);margin-left:1px}
.ov-sp{display:flex;flex-direction:column;gap:4px}
.ov-sp div{flex:1;display:flex;align-items:center;gap:7px;justify-content:space-between;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:0 7px;min-width:70px}
.ov-sp span{font-size:9px;letter-spacing:.6px;text-transform:uppercase;color:var(--dim);font-weight:700}
.ov-sp b{font-size:12.5px;font-variant-numeric:tabular-nums}
.ov-ctl{display:flex;flex-direction:column;align-items:flex-end;gap:6px;align-self:flex-start}
.ov-range{display:flex;align-items:center;gap:4px;color:var(--dim);font-size:12px}
.ov-rx{background:transparent;border:1px solid var(--border);color:var(--dim);border-radius:6px;width:20px;height:25px;font-size:14px;line-height:1;cursor:pointer;padding:0}
.ov-rx:hover{color:var(--text)}
.ov-seas{position:relative;opacity:.55}
.ov-seas::after{content:attr(data-seas);position:absolute;left:0;right:0;bottom:-11px;text-align:center;font-size:8px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--dim);white-space:nowrap;pointer-events:none}
.ov-stag{font-size:9px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--dim);border:1px solid var(--border);border-radius:5px;padding:2px 6px;margin-left:8px}
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
.ov-vcell{font-size:13px;letter-spacing:-.2px}
.ov-mcell.hi{box-shadow:inset 0 0 0 2px #22c55e}.ov-mcell.lo{box-shadow:inset 0 0 0 2px #ef4444}
.ov-ccell{border-radius:5px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:36px;background-color:var(--surfaceAlt);color:var(--text);line-height:1.1}
.ov-ccell b{font-size:14.5px;font-variant-numeric:tabular-nums}.ov-ccell small{font-size:9.5px;color:var(--muted);font-weight:600;font-variant-numeric:tabular-nums;margin-top:2px}
.ov-ccell.z{color:var(--dim)}
.ov-res{cursor:help;display:flex;flex-direction:column;justify-content:center}.ov-grp.run .ov-st{padding-left:9px;padding-right:9px;min-width:58px}
.ov-res{padding-left:9px;padding-right:9px;min-width:0}.ov-res .v{font-size:15px;white-space:nowrap}
.ov-tip{white-space:pre-line;position:fixed;z-index:50;max-width:min(300px,calc(100vw - 16px));background:#111827;color:#f3f4f6;font-size:12px;line-height:1.4;font-weight:500;padding:8px 10px;border-radius:7px;box-shadow:0 6px 20px rgba(0,0,0,.35);pointer-events:none;text-align:left;letter-spacing:0;text-transform:none}
.ov-flags{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}
.ov-flag{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#b45309;background:rgba(245,158,11,.14);border:1px solid rgba(245,158,11,.45);border-radius:5px;padding:2px 6px;cursor:help;margin-left:0!important}
.ov-flag svg{width:9px;height:10px;flex:none}
.ov-chip .fl{display:inline-block;margin-left:4px;vertical-align:1px}.ov-chip .fl svg{width:8px;height:9px}
.ov-cnote .fl svg{width:8px;height:9px;vertical-align:-1px;margin-right:3px}
.ov-cnote{font-size:10.5px;color:var(--dim);text-align:center;margin-top:auto;padding-top:8px;line-height:1.45}
.ov-row3{margin-top:14px;justify-content:flex-start}
.ov-rt{gap:4px}.ov-rt .ov-mcell{min-height:30px;font-size:13px}.ov-rt .ov-mrow{gap:4px}.ov-rt .ov-mlab{font-size:11px}
.ov-rt .ov-mrow.brk{margin-top:6px;padding-top:10px;border-top:1px solid var(--border)}
.ov-mkey{font-size:10.5px;color:var(--dim);text-align:center;margin-top:6px}
.ov-mkey i{display:inline-block;width:11px;height:11px;border-radius:3px;vertical-align:-2px;margin:0 5px 0 12px}
.ov-mkey i:first-child{margin-left:0;box-shadow:inset 0 0 0 2px #22c55e}.ov-mkey i:last-of-type{box-shadow:inset 0 0 0 2px #ef4444}
.ov-mvwrap{padding:8px 10px 0 6px;position:relative}
.ov-dot{position:absolute;z-index:3;transform:translate(-50%,calc(-100% - 14px));margin:8px 0 0 6px;background:#111827;color:#f3f4f6;border-radius:7px;border-left:3px solid var(--k);padding:7px 10px 8px;font-size:11.5px;line-height:1.5;pointer-events:none;white-space:nowrap;box-shadow:0 6px 18px rgba(0,0,0,.35);display:flex;flex-direction:column}
.ov-dot[data-flip=l]{transform:translate(calc(-100% - 14px),-50%)}.ov-dot[data-flip=r]{transform:translate(14px,-50%)}
.ov-dot b{font-size:12px;margin-bottom:2px}.ov-dot span{display:flex;justify-content:space-between;gap:14px;font-variant-numeric:tabular-nums;font-weight:600}.ov-dot i{font-style:normal;color:#9ca3af;font-weight:500}
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
.ov-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:auto;font-size:11px;color:var(--dim)}
.ov-hm .lg{display:flex;align-items:center;gap:8px;margin-top:7px;font-size:9.5px;font-weight:600;white-space:nowrap}.ov-hm .lg i{flex:1;height:6px;border-radius:3px;background:linear-gradient(to right,#ef4444,#111827,#22c55e)}
.ov-hm .lg .lo{color:#fca5a5}.ov-hm .lg .hi{color:#86efac}.ov-hm .lgc{margin-top:3px;text-align:center;font-size:9px;color:#8a8a93}
.ov-foot .ov-tg3{margin-left:auto}
.ov-foot select{background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-size:11.5px;font-weight:600;font-family:inherit}
.ov-hr{height:1px;background:var(--border);margin:8px 0 6px}
.ov-hrow{align-items:flex-start;justify-content:flex-start}
.ov-vsec{align-self:center;font-size:9.5px;letter-spacing:.9px;text-transform:uppercase;font-weight:700;color:var(--muted)}
.ov-vbrk{display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)}
.ov-grow{grid-template-columns:repeat(var(--n),minmax(0,1fr))}
.ov-card.ov-wide{flex:1 1 100%;max-width:1588px}
.ov-prow{display:flex;gap:16px;align-items:stretch;flex-wrap:wrap}
.ov-ptiles{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;align-content:center;flex:0 0 250px}
.ov-ptiles .big{grid-column:1/-1}.ov-ptiles .big .v{font-size:34px}.ov-ptiles .ov-st{min-width:0;padding-left:9px;padding-right:9px;cursor:help}
.ov-pn{grid-column:1/-1;font-size:10.5px;color:var(--dim);text-align:center}
.ov-pchart{flex:1 1 420px;min-width:0}.ov-pchart svg{display:block;width:100%;height:auto;touch-action:pan-y}
.ov-pread{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline;font-size:11.5px;color:var(--muted);padding:0 0 4px 34px;font-variant-numeric:tabular-nums}
.ov-pread b{color:var(--text)}.ov-pread i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.ov-tg3{margin-left:auto;display:flex;gap:2px;background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:2px}
.ov-tg3 button{background:transparent;border:0;color:var(--dim);font-size:10.5px;font-weight:600;padding:4px 8px;border-radius:5px;cursor:pointer}
.ov-tg3 button[aria-pressed=true]{background:var(--surfaceAlt);color:var(--text)}
.ov-spin{align-self:stretch;justify-content:space-between}
@media (max-width:820px){.ov-grp.run{margin-left:0}.ov-ctl{order:-1;margin-left:auto}.ov-who{order:-2}}
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
function Slider({ label, dot, pct, value, unit, title, neutral }) {
  const has = pct != null, col = has ? (neutral ? "rgb(140,150,160)" : pctColor(pct)) : "transparent", w = has ? Math.max(4, Math.min(100, pct)) : 0;
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
const AA_NOTE = {
  measured: (a) => `Measured by Statcast on ${a.n.toLocaleString()} pitches in this range.`,
  mixed: (a) => `Statcast has not posted ${a.estDays} of the ${a.days} games in this range yet: those are estimated from his release point (typically within about 1°).`,
  estimate: () => "Estimated from his release point: Statcast has not posted these games yet (typically within about 1°).",
  imputed: () => "Rough estimate from release point and height: no measured arm angle for him yet (typically within about 5°).",
};
function ReleaseCard({ pitcher, hand, heightIn, fb, armAngle, aaInfo, staticRow, getPitchColor, year }) {
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
    { k: "A", name: "Arm angle", est: !!aaInfo && aaInfo.estimated > 0, val: armAngle, unit: "°", avg: lg.avg.armAngle, dist: lg.dist.armAngle, note: aaInfo && AA_NOTE[aaInfo.basis] ? AA_NOTE[aaInfo.basis](aaInfo) : undefined },
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
                  className={`ov-co${activeHot === c.k ? " hot" : ""}`} style={{ "--k": COL[c.k] }} title={c.note} data-basis={c.k === "A" && aaInfo ? aaInfo.basis : undefined}
                  onMouseEnter={() => setHot(c.k)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(c.k)} onBlur={() => setHot(null)}
                  onClick={() => setSticky(s => (s === c.k ? null : c.k))}>
                  <span className="k">{c.name}</span>
                  <span className="v">{r1(c.val)}<small>{c.unit}</small>{c.est && <small style={{ marginLeft: 4, fontSize: 9, fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase", opacity: 0.75 }}>est</small>}</span>
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

// ─── Value: run value per 100 pitches by pitch type, batter side and count (FanGraphs pitch-value construction). ───
// Each pitch is worth the change in run expectancy it causes; xRV values balls in play by exit velocity and launch
// angle instead of the result. Shown from the pitcher's side (+ = runs saved). Colour is vs the league for the same
// pitch type, pitcher hand, batter side and count bucket, after regressing the gap for sample size.
// Savant-style run value sums (context-neutral and leveraged), one lazily loaded file per completed season.
const SV_LOADERS = { "2025": () => import("./overviewValueSv2025.js"), "2026": () => import("./overviewValueSv2026.js") };
const SV_CACHE = {};
const SV_KEYS = ["nv", "nx", "lv", "lx"];
function ValueCard({ mix, year, hand, pitcherId, ranged, pitchRunValue, getPitchColor, PITCH_ABBREV }) {
  const [mode, setMode] = useState("a");   // a = run value, x = expected run value
  const [ctx, setCtx] = useState("n");     // n = context-neutral, l = leveraged by base/out situation
  const [unit, setUnit] = useState("t");   // t = total runs (default), r = runs per 100 pitches
  const [sv, setSv] = useState(SV_CACHE[year]);   // undefined = loading, null = no file for this season
  useEffect(() => {
    if (SV_CACHE[year] !== undefined) { setSv(SV_CACHE[year]); return undefined; }
    const load = SV_LOADERS[year]; if (!load) { SV_CACHE[year] = null; setSv(null); return undefined; }
    let live = true; setSv(undefined);
    load().then(m => { SV_CACHE[year] = m.default || null; if (live) setSv(SV_CACHE[year]); }).catch(() => { if (live) setSv(null); });
    return () => { live = false; };
  }, [year]);
  // Values come from the pitches themselves (pitcherValue.js), the same path the Compare and Tracker tables use, so the
  // numbers agree everywhere. The season file is only a stand-in for a full season whose pitches arrived without their
  // home park (no park term), so the full-season view keeps its park adjustment.
  const cover = useMemo(() => (mix && mix.valid.length ? { sv: usesSavantValue(mix.valid), park: hasParkTerm(mix.valid) } : { sv: false, park: false }), [mix]);
  const mine = sv && !ranged && !(cover.sv && cover.park) ? sv[String(pitcherId)] : null;
  const liveSv = !mine && cover.sv;
  // Savant-style values when the season file has this pitcher; otherwise the live, linear-weights value (neutral only).
  const agg = useMemo(() => {
    if (!mix || (sv === undefined && !(cover.sv && cover.park))) return null;   // the season file only matters when it would be used
    const A = {};
    if (mine) {
      for (const t of Object.keys(mine)) {
        const a = mine[t];
        [["R", "pre"], ["R", "two"], ["L", "pre"], ["L", "two"]].forEach(([h, bk], i) => {
          const n = a[i * 5]; if (!n) return;
          for (const k of ["all", bk]) {
            const c = A[`${t}|${h}|${k}`] || (A[`${t}|${h}|${k}`] = [0, 0, 0, 0, 0]);
            for (let j = 0; j < 4; j++) c[j] += a[i * 5 + 1 + j] / 100; c[4] += n;
          }
        });
      }
      return A;
    }
    for (const p of mix.valid) {
      const h = p.batter_hand === "L" ? "L" : "R", bk = p.strikes === 2 ? "two" : p.strikes != null && p.strikes < 2 ? "pre" : null;
      const v = pitcherValue(p, liveSv, pitchRunValue);   // [RV, xRV, leveraged RV, leveraged xRV], pitcher's side
      for (const k of bk ? ["all", bk] : ["all"]) {
        const key = `${p.pitch_type}|${h}|${k}`, c = A[key] || (A[key] = [0, 0, 0, 0, 0]);
        c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; c[3] += v[3]; c[4]++;
      }
    }
    return A;
  }, [mix, sv, mine, liveSv, cover, pitchRunValue]);
  const savant = !!mine || liveSv, lev = ctx === "l" && savant, mi = (lev ? 2 : 0) + (mode === "a" ? 0 : 1);
  const svRef = OV_SV_REF[year] || OV_SV_REF[Object.keys(OV_SV_REF).sort().pop()];   // a season in progress borrows the latest full season's reference
  const lgAll = (savant ? svRef : OV_VALUE_REF[year])?.[hand] || {};
  const what = `${lev ? "Leveraged: weighted by the base/out situation." : savant ? "Context-neutral: base/out situation ignored." : "Context-neutral."} ${mode === "a" ? "Actual results." : "Expected: balls in play valued by exit velocity and launch angle."}`;
  const tg = (cur, set, opts) => <div className="ov-tg3" style={{ marginLeft: 0 }}>{opts.map(([k, l, tip, off]) => <button key={k} aria-pressed={cur === k} disabled={off} style={off ? { opacity: 0.4, cursor: "default" } : undefined} onClick={() => set(k)} title={tip}>{l}</button>)}</div>;
  return (
    <div className="ov-card">
      <div className="ov-head"><div className="ov-ct">Value</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {tg(lev ? "l" : "n", setCtx, [["n", "Neutral", "Context-neutral: the base/out situation is ignored"], ["l", "Leveraged", savant || sv === undefined ? "Leveraged: plays count for more in bigger base/out situations" : "Leveraged needs base/out data, which these pitches do not carry", sv !== undefined && !savant]])}
          {tg(mode, setMode, [["a", "RV", "Run value from actual results"], ["x", "xRV", "Expected run value: balls in play valued by exit velocity and launch angle"]])}
          {tg(unit, setUnit, [["r", "/100", "Runs per 100 pitches"], ["t", "Total", "Total runs over the pitches thrown"]])}
        </div>
      </div>
      {!mix ? <div className="ov-note">No {year} MLB pitches.</div> : !agg ? <div className="ov-note">Loading…</div> : (
        <div className="ov-mix">
          <div className="ov-mrow" style={{ "--n": mix.types.length }}><span />
            {mix.types.map(t => <div key={t.type} className="ov-chip" style={{ background: getPitchColor(t.type) }} title={t.name}>{PITCH_ABBREV[t.name] || t.type}</div>)}
          </div>
          {[["R", "vs RHH"], ["L", "vs LHH"]].map(([h, lab]) => (
            <div key={h} style={{ display: "contents" }}>
              <div className="ov-msec">{lab}</div>
              {[["all", "Overall"], ["pre", "Pre-2K"], ["two", "2K"]].map(([rk, rl]) => (
                <div key={rk} className={`ov-mrow${rk === "all" ? " ov-all" : ""}`} style={{ "--n": mix.types.length }}>
                  <div className="ov-mlab">{rl}</div>
                  {mix.types.map(t => {
                    const c = agg[`${t.type}|${h}|${rk}`];
                    if (!c || c[4] < 15) return <div key={t.type} className="ov-mcell z" title={c ? `${t.name} ${lab} · ${rl}: only ${c[4]} pitches` : undefined}>—</div>;
                    const n = c[4], v = 100 * c[mi] / n, ref = lgAll[t.type]?.[h]?.[rk]?.[mi], K = savant ? OV_SV_K[SV_KEYS[mi]][rk] : OV_VALUE_K[mode][rk];
                    const z = ref == null ? 0 : ((v - ref) * n / (n + K[1])) / K[0], mag = Math.max(0, Math.min(1, (Math.abs(z) - 0.4) / 1.6)), alpha = (0.07 + 0.36 * mag).toFixed(3);
                    const col = Math.abs(z) < 0.4 ? null : z > 0 ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`, sg = (q, d = 1) => `${q > 0 ? "+" : q < 0 ? "−" : ""}${Math.abs(q).toFixed(d)}`;
                    return <div key={t.type} className="ov-mcell ov-vcell" style={col ? { backgroundImage: `linear-gradient(${col},${col})` } : undefined}
                      title={`${t.name} ${lab} · ${rl}\n${sg(v)} runs per 100 pitches${ref != null ? ` (league ${hand}HP ${PITCH_ABBREV[t.name] || t.type}: ${sg(ref)})` : ""}\n${sg(c[mi])} runs in total over ${n.toLocaleString()} pitches\n${what} Color is the per-100 rate vs the league, adjusted for sample.`}>{sg(unit === "t" ? c[mi] : v)}</div>;
                  })}
                </div>
              ))}
            </div>
          ))}
          <div className="ov-cnote">{unit === "t" ? "Total runs saved" : "Runs saved per 100 pitches"} · + is good for the pitcher<br />{lev ? "Leveraged by base/out" : "Context-neutral"} · {mode === "a" ? "actual results" : "contact valued by exit velocity and launch angle"} · color is vs the league, adjusted for sample</div>
        </div>
      )}
    </div>
  );
}

// ─── Rates: per-pitch-type results (the Compare table's rates, same definitions via pitchRateCounts). ───
// Colour is vs the league's rate for that exact subset (season, pitcher hand, pitch type, batter side, count), with the
// pitcher's own number weighted by its sample: z = (value − league) · n/(n + K1) / K0, where n is the stat's own denominator.
const RATE_ROWS = [
  ["strikeRate", "Strike", "Swings and called strikes per pitch", "pitches"], ["zoneRate", "Zone", "Pitches in the strike zone", "pitches"],
  ["cswRate", "CSW", "Called strikes plus whiffs per pitch", "pitches"], ["calledStrikeRate", "Called", "Called strikes per pitch", "pitches"],
  ["swStrRate", "SwStr", "Whiffs per pitch", "pitches"], ["whiffRate", "Whiff", "Whiffs per swing", "swings"],
  ["chaseRate", "Chase", "Swings at pitches out of the zone", "pitches out of the zone"], ["zoneWhiffRate", "Z-Whiff", "Whiffs per swing in the zone", "swings in the zone"],
  ["gbRate", "GB", "Ground balls per ball in play", "balls in play"], ["fbRate", "FB", "Fly balls per ball in play", "balls in play"],
  ["barrelRate", "Barrel", "Barrels per batted ball", "batted balls"], ["slg", "SLG", "Slugging allowed on at-bats ending on the pitch", "at-bats"],
];
const RATE_BREAK = new Set(["swStrRate", "gbRate"]);   // a rule after Called and after Z-Whiff
function RatesCard({ mix, year, hand, pitchRateCounts, pitchMatchesCount, STAT_GOOD_DIR, getPitchColor, PITCH_ABBREV }) {
  const [side, setSide] = useState("A");    // A = all batters, L / R
  const [bk, setBk] = useState("all");      // all = overall, pre = before two strikes, two = two strikes
  const cells = useMemo(() => {
    if (!mix) return null;
    const by = {}, cf = bk === "pre" ? "pre2k" : bk === "two" ? "two_strikes" : "all";
    for (const p of mix.valid) {
      if (side !== "A" && p.batter_hand !== side) continue;
      if (!pitchMatchesCount(p, cf)) continue;
      (by[p.pitch_type] || (by[p.pitch_type] = [])).push(p);
    }
    const out = {}; for (const t of Object.keys(by)) out[t] = { n: by[t].length, k: pitchRateCounts(by[t]) };
    return out;
  }, [mix, side, bk, pitchRateCounts, pitchMatchesCount]);
  const refYear = OV_RATE_REF[year] ? year : Object.keys(OV_RATE_REF).sort().pop();   // a season with no table yet borrows the latest one
  const lg = OV_RATE_REF[refYear]?.[hand] || {};
  const sideLab = side === "A" ? "all batters" : `vs ${side}HH`, bkLab = bk === "all" ? "Overall" : bk === "pre" ? "Pre-2K" : "2K";
  const tg = (cur, set, opts) => <div className="ov-tg3" style={{ marginLeft: 0 }}>{opts.map(([k, l, tip]) => <button key={k} aria-pressed={cur === k} onClick={() => set(k)} title={tip}>{l}</button>)}</div>;
  return (
    <div className="ov-card">
      <div className="ov-head"><div className="ov-ct">Rates</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {tg(side, setSide, [["A", "All", "All batters"], ["L", "LHH", "Left-handed batters"], ["R", "RHH", "Right-handed batters"]])}
          {tg(bk, setBk, [["all", "Overall", "Every count"], ["pre", "Pre-2K", "Counts with fewer than two strikes"], ["two", "2K", "Two-strike counts"]])}
        </div>
      </div>
      {!mix || !cells ? <div className="ov-note">No {year} MLB pitches.</div> : (
        <div className="ov-mix ov-rt">
          <div className="ov-mrow" style={{ "--n": mix.types.length }}><span />
            {mix.types.map(t => <div key={t.type} className="ov-chip" style={{ background: getPitchColor(t.type), padding: "7px 0" }} title={`${t.name}${cells[t.type] ? ` · ${cells[t.type].n.toLocaleString()} pitches` : ""}`}>{PITCH_ABBREV[t.name] || t.type}</div>)}
          </div>
          {RATE_ROWS.map(([key, lab, desc, unit]) => {
            const si = OV_RATE_STATS.indexOf(key), isSlg = key === "slg", K = OV_RATE_K[key]?.[bk], dir = isSlg ? -1 : (STAT_GOOD_DIR[key] || 0);
            const show = (v) => (isSlg ? v.toFixed(3).replace(/^0/, "") : `${v.toFixed(1)}%`);
            return (
              <div key={key} className={`ov-mrow${RATE_BREAK.has(key) ? " brk" : ""}`} style={{ "--n": mix.types.length }}>
                <div className="ov-mlab" title={desc}>{lab}</div>
                {mix.types.map(t => {
                  const c = cells[t.type], q = c?.k[key];
                  if (!c || c.n < 15 || !q || !q[1]) return <div key={t.type} className="ov-mcell z" title={`${t.name} · ${sideLab} · ${bkLab}\n${lab}: ${c && c.n >= 15 ? `no ${unit}` : `only ${c ? c.n : 0} pitches`}`}>—</div>;
                  const v = (isSlg ? 1 : 100) * q[0] / q[1], ref = lg[t.type]?.[side]?.[bk]?.[si];
                  const z = ref == null || !K || !dir ? 0 : dir * ((v - ref) * q[1] / (q[1] + K[1])) / K[0], mag = Math.max(0, Math.min(1, (Math.abs(z) - 0.4) / 1.6)), alpha = (0.07 + 0.36 * mag).toFixed(3);
                  const col = Math.abs(z) < 0.4 ? null : z > 0 ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`;
                  return <div key={t.type} className="ov-mcell" style={col ? { backgroundImage: `linear-gradient(${col},${col})` } : undefined}
                    title={`${t.name} · ${sideLab} · ${bkLab}\n${desc}: ${show(v)} (${q[0].toLocaleString()} of ${q[1].toLocaleString()} ${unit})${ref != null ? `\nLeague ${hand}HP ${PITCH_ABBREV[t.name] || t.type}, same split: ${show(ref)}` : ""}\nColor is vs the league, adjusted for sample.`}>
                    {isSlg ? show(v) : <>{Math.round(v)}<small>%</small></>}</div>;
                })}
              </div>
            );
          })}
          <div className="ov-cnote">Color is vs the league for the same pitch, hands and count, adjusted for sample</div>
        </div>
      )}
    </div>
  );
}

// ─── Grades: Stuff+ / Location+ / Pitching+ (tools/pitch-grades). Cell = [Stuff+, Location+, Pitching+, pitches]. ───
// 100 = league-average pitch that season, 10 points = 0.45 runs per 100 pitches on all three, so the grades are comparable.
// Colour is vs the league for that exact subset: same pitcher hand, batter side and (in the container) pitch type.
const FlagIcon = ({ color = "currentColor" }) => <svg viewBox="0 0 9 10" aria-hidden="true"><path d="M1 0v10" stroke={color} strokeWidth="1.4" /><path d="M1.6 .6h6.6L6.4 3l1.8 2.4H1.6z" fill={color} /></svg>;
const FLAG_TEXT = {
  u: ["Unique shape", "Few other pitchers throw anything close to his shape and release. The model grades him only from other pitchers, so his Stuff+ is a guess from distant comparisons and may be well off."],
  s: ["Small sample", "Fewer than 200 pitches this season. Location+ and Pitching+ are still pulled most of the way toward average."],
};
// Results vs grades: actual run value against what Pitching+ expected for the same pitches, regressed for sample size.
const RESULT_LEVELS = { 2: ["Well above", "rgba(34,197,94,.36)"], 1: ["Above", "rgba(34,197,94,.16)"], 0: ["In line", null], "-1": ["Below", "rgba(239,68,68,.16)"], "-2": ["Well below", "rgba(239,68,68,.36)"] };
function resultsTile(gr) {
  const [lvl, gap, res] = gr.r, [word, col] = RESULT_LEVELS[lvl];
  const lead = lvl === 0 ? "In line: his results match what his grades expect." : `${word}: his results are ${lvl > 0 ? "better" : "worse"} than his grades expect${Math.abs(lvl) === 2 ? ", by a wide margin" : ""}.`;
  const tip = `${lead}\nActual results grade out at ${res} against a Pitching+ of ${gr.a[2]} over ${gr.a[3].toLocaleString()} pitches. Adjusted for sample size, that is about ${gap > 0 ? "+" : ""}${gap} points.\nGaps like this are partly skill the grades can't see (sequencing, deception) and partly noise; about a third carries over to the next season.`
    + (gr.f?.includes("u") && lvl > 0 ? " He carries the unique-shape flag, so part of this gap may be the model underrating his stuff." : "");
  return <div className="ov-st ov-res" title={tip} style={col ? { backgroundImage: `linear-gradient(${col},${col})` } : undefined}><div className="k">Results</div><div className="v">{word}</div></div>;
}
const GRADE_ROWS = [["s", 0, "Stuff+"], ["l", 1, "Location+"], ["p", 2, "Pitching+"]];
function gradeTone(v, ref, label, n) {
  if (v == null || !ref || !ref[1]) return {};
  const z = (v - ref[0]) / ref[1], mag = Math.max(0, Math.min(1, (Math.abs(z) - 0.4) / 1.6)), alpha = (0.07 + 0.36 * mag).toFixed(3);
  const col = Math.abs(z) < 0.4 ? null : z >= 0 ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`;
  return { style: col ? { backgroundImage: `linear-gradient(${col},${col})` } : undefined,
    title: `${label} ${v} · league avg ${ref[0]}${n != null ? ` · ${n.toLocaleString()} pitches` : ""} · ${ord(Math.max(1, Math.min(99, Math.round(normCdf(z) * 100))))} pctile` };
}
// Plain-language read of a header grade: what the number measures, where it ranks for that subset, and what it is worth in runs.
const GRADE_ABOUT = {
  s: "Stuff+ grades the shape of his pitches (velocity, movement, release, spin) and ignores where they end up. It is the most stable grade and the best predictor of next season.",
  l: "Location+ grades where his pitches end up for the pitch type and count, and ignores stuff. It describes this season well but says little about the next.",
  p: "Pitching+ grades stuff and location together in one model. It is the best single read on how well he has pitched.",
};
function gradeStory(mk, mlab, v, ref, n, who, about) {
  if (v == null || !ref || !ref[1]) return undefined;
  const pct = Math.max(1, Math.min(99, Math.round(normCdf((v - ref[0]) / ref[1]) * 100)));
  const word = pct >= 95 ? "elite" : pct >= 85 ? "well above average" : pct >= 65 ? "above average" : pct > 35 ? "about average" : pct > 15 ? "below average" : pct > 5 ? "well below average" : "among the lowest";
  const runs = (v - ref[0]) * 0.045, worth = Math.abs(runs) < 0.05 ? `Right at the average ${who} (${ref[0]}).`
    : `About ${Math.abs(runs).toFixed(1)} runs per 100 pitches ${runs > 0 ? "better" : "worse"} than the average ${who} (${ref[0]}).`;
  return `${mlab} ${v}: ${word} for a ${who}, ${ord(pct)} percentile.\n${worth}${about ? `\n${GRADE_ABOUT[mk]}` : ""}${n != null ? `\n${n.toLocaleString()} pitches.` : ""}`;
}
function GradesCard({ gr, mix, year, hand, getPitchColor, PITCH_ABBREV, seasonOnly, short }) {
  const lg = OV_GRADES_LG[year]?.[hand] || {}, SK = ["a", "L", "R"], types = mix ? mix.types.filter(t => gr?.t?.[t.type]) : [];
  return (
    <div className="ov-card">
      <div className="ov-head"><div className="ov-ct">Grades</div>{seasonOnly && <span className="ov-stag" title="Showing the full-season grades while the date-range grades load.">Full season</span>}</div>
      {!gr?.a || !types.length ? <div className="ov-note">{short ? `Fewer than ${GRADE_MIN_PITCHES} graded pitches in this date range.` : `No ${year} pitch grades for this pitcher.`}</div> : (
        <div className="ov-mix">
          <div className="ov-mrow" style={{ "--n": types.length }}><span />
            {types.map(t => { const u = gr.u?.includes(t.type); return <div key={t.type} className="ov-chip" style={{ background: getPitchColor(t.type) }} title={u ? `${t.name} · unique shape: few close matches among other pitchers, so this Stuff+ may be well off` : t.name}>{PITCH_ABBREV[t.name] || t.type}{u && <span className="fl"><FlagIcon color="#fff" /></span>}</div>; })}
          </div>
          {GRADE_ROWS.map(([mk, mi, mlab]) => (
            <div key={mk} style={{ display: "contents" }}>
              <div className="ov-msec">{mlab}</div>
              {[[0, "Overall", " ov-all"], [2, "vs RHH", ""], [1, "vs LHH", ""]].map(([i, lab, cls]) => (
                <div key={lab} className={`ov-mrow${cls}`} style={{ "--n": types.length }}>
                  <div className="ov-mlab">{lab}</div>
                  {types.map(t => {
                    const c = gr.t[t.type][i];
                    return c ? <div key={t.type} className="ov-ccell" {...gradeTone(c[mi], lg.t?.[t.type]?.[SK[i]]?.[mk] || lg.t?.[t.type]?.a?.[mk], `${hand}HP ${t.name} ${lab} · ${mlab}`, c[3])}><b>{c[mi]}</b></div>
                      : <div key={t.type} className="ov-ccell z">—</div>;
                  })}
                </div>
              ))}
            </div>
          ))}
          <div className="ov-cnote">100 = average pitch · 10 points = 0.45 runs per 100 pitches · color is vs {hand}HP with that pitch type and batter side{gr.u?.some(u => types.find(t => t.type === u)) && <><br /><span className="fl"><FlagIcon /></span>unique shape, few close matches among other pitchers</>}</div>
        </div>
      )}
    </div>
  );
}

// ─── Container 3: pitch movement (same conventions as the Movement Plot) + arm angle + spin efficiency ───
function MoveCard({ C, hand, mix, year, armAngle, armEst, getPitchColor, PITCH_ABBREV }) {
  const cvRef = useRef(null), dotsRef = useRef([]);
  const [showAvg, setShowAvg] = useState(true), [tick, setTick] = useState(0), [hov, setHov] = useState(null);
  // Hovering (or tapping) an average dot shows that pitch's average velocity, movement and spin.
  const pickDot = (e) => {
    const cv = cvRef.current; if (!cv) return null;
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = 13;
    for (const d of dotsRef.current) { const dist = Math.hypot(d.x - mx, d.y - my); if (dist < bd) { bd = dist; best = d; } }
    return best;
  };
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
    dotsRef.current = [];
    if (!mix) return;
    const idx = {}; mix.types.forEach((t, i) => { idx[t.type] = i; });
    const sums = mix.types.map(() => [0, 0, 0, 0, 0, 0, 0]);   // hb, ivb, n, velo sum, velo n, spin sum, spin n
    c.save(); c.beginPath(); c.rect(X(-AX), Y(AX), side, side); c.clip();
    for (const p of mix.valid) {
      const ti = idx[p.pitch_type]; if (ti == null || p.pfx_x == null || p.pfx_z == null) continue;
      sums[ti][0] += p.pfx_x; sums[ti][1] += p.pfx_z; sums[ti][2]++;
      if (p.release_speed != null && !isNaN(p.release_speed)) { sums[ti][3] += p.release_speed; sums[ti][4]++; }
      if (p.release_spin_rate != null && !isNaN(p.release_spin_rate) && p.release_spin_rate > 0) { sums[ti][5] += p.release_spin_rate; sums[ti][6]++; }
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
      const t = mix.types[ti];
      dotsRef.current.push({ type: t.type, name: t.name, x: X(a[0] / a[2]), y: Y(a[1] / a[2]), hb: a[0] / a[2], ivb: a[1] / a[2], n: a[2], velo: a[4] ? a[3] / a[4] : null, spin: a[6] ? a[5] / a[6] : null });
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
      <div className="ov-mvwrap">
        <canvas ref={cvRef} style={{ cursor: hov ? "pointer" : "default" }}
          onMouseMove={e => { const d = pickDot(e); setHov(h => (d ? (h && h.type === d.type ? h : d) : null)); }} onMouseLeave={() => setHov(null)}
          onClick={e => setHov(pickDot(e))} />
        {hov && showAvg && (
          <div className="ov-dot" style={{ left: hov.x, top: hov.y, "--k": getPitchColor(hov.type) }} data-flip={hov.y < 96 ? (hov.x > (cvRef.current?.clientWidth || 0) / 2 ? "l" : "r") : undefined}>
            <b>{hov.name}</b>
            <span><i>Velo</i>{hov.velo != null ? `${hov.velo.toFixed(1)} mph` : "—"}</span>
            <span><i>iVB</i>{`${hov.ivb.toFixed(1)} in`}</span>
            <span><i>HB</i>{`${hov.hb.toFixed(1)} in`}</span>
            <span><i>Spin</i>{hov.spin != null ? `${Math.round(hov.spin).toLocaleString()} rpm` : "—"}</span>
          </div>
        )}
      </div>
      <div className="ov-mvfoot">
        <div className="ov-mvleg" style={{ flexDirection: "row", alignItems: "center", gap: "12px" }}>
          <div className="ov-lg">{armAngle != null && <span className="aa"><i />Arm angle{armEst ? " (est.)" : ""}</span>}</div>
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

function SideToggle({ side, setSide }) {
  return <div className="ov-tg3">{[["all", "All"], ["L", "vs LHH"], ["R", "vs RHH"]].map(([k, l]) => <button key={k} aria-pressed={side === k} onClick={() => setSide(k)}>{l}</button>)}</div>;
}

// ─── Row 2, middle: location heatmaps (the Heatmaps tab's Gaussian granular canvas) ───
function HeatTile({ label, pitches, mode, Canvas, weightFn, side, legend }) {
  const ref = useRef(null), [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(e => setW(Math.floor(e[0].contentRect.width * 2))); ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  return (
    <div className="tile">
      <div className="hd">{label}<span>{pitches.length.toLocaleString()}</span></div>
      <div className="cv" ref={ref}>{w > 0 && <Canvas pitches={pitches} width={w} height={w} mode={mode} hand={side || "all"} weightFn={weightFn || null} />}</div>
      {legend && <><div className="lg"><span className="lo">{legend[0]}</span><i /><span className="hi">{legend[1]}</span></div><div className="lgc">{SUCCESS_CAPTION}</div></>}
    </div>
  );
}
const HEAT_SLIDES = [["success", "Success"], ["frequency", "Frequency"], ["whiffs", "Whiffs"], ["damage", "Damage"]];
// Success baseline toggle (successValue.js): Value = location earns credit, Vs League = against the league at that spot
function SuccessViewToggle({ view, setView }) {
  return <div className="ov-tg3">{SUCCESS_VIEWS.map(([k, l, tip]) => <button key={k} aria-pressed={view === k} onClick={() => setView(k)} title={tip}>{l}</button>)}</div>;
}
function HeatCard({ mix, year, hand, side, setSide, rvHelpers, getPitchColor, PITCH_ABBREV, GaussianHeatmapCanvas, pitchMatchesCount }) {
  const [sel, setSel] = useState(null), [count, setCount] = useState("all"), [slide, setSlide] = useState(0), [view, setView] = useState("value");
  const types = mix ? mix.types : [], cur = types.find(t => t.type === sel) || types[0];
  const sets = useMemo(() => {
    if (!mix || !cur) return null;
    const base = mix.valid.filter(p => p.pitch_type === cur.type && (side === "all" || p.batter_hand === side) && p.plate_x != null && p.plate_z != null && pitchMatchesCount(p, count));
    return { success: base, frequency: base, whiffs: base.filter(p => p.is_whiff), damage: base.filter(p => p.is_in_play) };
  }, [mix, cur, count, side, pitchMatchesCount]);
  // Success (+ = good for him): where his runs came from, or how each spot played against the league at that spot
  const successFn = useMemo(() => successWeight(view, false, rvHelpers.pitchRunValue, hand), [view, hand, rvHelpers]);
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
              <HeatTile key={mode} label={label} pitches={sets[mode]} mode={mode} side={side} Canvas={GaussianHeatmapCanvas} weightFn={mode === "success" ? successFn : null} legend={mode === "success" ? SUCCESS_LEGEND.pitcher[view] : null} />
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
            {mode === "success" && <SuccessViewToggle view={view} setView={setView} />}
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
  let sw = 0, wh = 0, st = 0, cs = 0, iz = 0, ozs = 0, ozt = 0, izw = 0, izs = 0, ba = 0, bbe = 0;
  for (const p of f) {   // same definitions as computeMetrics
    if (p.is_whiff) wh++; if (p.is_swing) sw++; if (p.is_swing || p.is_called_strike) st++; if (p.is_called_strike) cs++; if (p.is_in_zone) iz++;
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
    barrel: pc(ba, bbe), hr9, swstr: pc(wh, c), cstr: pc(cs, c), strike: pc(st, c), zone: pc(iz, c), chase: pc(ozs, ozt), izwhiff: pc(izw, izs) };
}
const ARSENAL_ROWS = [["k", "K %"], ["bb", "BB %", true], ["kbb", "K-BB %"], ["barrel", "Barrel %", true], ["hr9", "HR/9", true, 2],
  ["swstr", "SwStr %"], ["cstr", "Called Strike %"], ["strike", "Strike %"], ["zone", "Zone %"], ["chase", "Chase %"], ["izwhiff", "In-Zone Whiff %"]];
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
const themeVars = (C) => ({ "--bg": C.bg, "--surface": C.surface, "--surfaceAlt": C.surfaceAlt, "--border": C.border, "--borderLight": C.borderLight, "--text": C.text, "--muted": C.textMuted, "--dim": C.textDim, "--accent": C.accent });

// Touch devices have no hover, so a tap on anything with hover text (a `title`) shows that text in a popover.
// Returns the ref for the container to watch and the popover element to render inside it.
function useTapTips() {
  const rootRef = useRef(null), [tip, setTip] = useState(null);
  useEffect(() => {
    const root = rootRef.current; if (!root) return undefined;
    let touch = false;
    const down = (e) => { touch = !!e.pointerType && e.pointerType !== "mouse"; };
    const click = (e) => {
      if (!touch) return;
      const el = e.target.closest ? e.target.closest("[title]") : null, text = el && root.contains(el) ? el.getAttribute("title") : "";
      if (!text) { setTip(null); return; }
      const r = el.getBoundingClientRect(), vw = window.innerWidth, half = Math.min(150, vw / 2 - 8), below = r.bottom + 130 < window.innerHeight;
      setTip(t => (t && t.el === el ? null : { el, text, x: Math.max(half + 8, Math.min(vw - half - 8, r.left + r.width / 2)), y: below ? r.bottom + 6 : r.top - 6, below }));
    };
    const hide = () => setTip(null);
    document.addEventListener("pointerdown", down, true); document.addEventListener("click", click);
    window.addEventListener("scroll", hide, true); window.addEventListener("resize", hide);
    return () => { document.removeEventListener("pointerdown", down, true); document.removeEventListener("click", click); window.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); };
  }, []);
  return [rootRef, tip ? <div className="ov-tip" role="tooltip" style={{ left: tip.x, top: tip.y, transform: `translate(-50%, ${tip.below ? "0" : "-100%"})` }}>{tip.text}</div> : null];
}

export default function OverviewPage({ C, helpers }) {
  const { fipConstsFor, normAndFilter, computeSummaryStats, isPostseasonDate, getPitchColor, PITCH_ABBREV, GaussianHeatmapCanvas, pitchMatchesCount, DatePickerWithHighlights } = helpers;
  const [q, setQ] = useState(""), [results, setResults] = useState([]), [open, setOpen] = useState(false);
  const [pitcher, setPitcher] = useState(null), [info, setInfo] = useState(null);
  const [year, setYearRaw] = useState("2026");
  // Optional date range inside the season ("" = open end). Cleared when the pitcher or the season changes.
  const [range, setRange] = useState({ s: "", e: "" }), [boxR, setBoxR] = useState(null), endRef = useRef(null);
  const setYear = (y) => { setRange({ s: "", e: "" }); setYearRaw(y); };
  const [d26, setD26] = useState(null), [d25, setD25] = useState(null);
  const [loading26, setLoading26] = useState(false), [loading25, setLoading25] = useState(false);
  const [box26, setBox26] = useState(null), [box25, setBox25] = useState(null);
  const [err, setErr] = useState("");
  const [side, setSide] = useState("R");   // batter side shared by the Location and Results containers
  const [rootRef, tipEl] = useTapTips();
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
    OV_LAST_PITCHER = p;
    const seq = ++seqRef.current;
    setPitcher(p); setQ(p.name); setOpen(false); setResults([]);
    setD26(null); setD25(null); setBox26(null); setBox25(null); setInfo(null); setErr(""); setYear("2026");   // setYear also clears the date range
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

  // First visit: open on a random 2026 pitcher (600+ pitches). Coming back to the tab restores the last one viewed.
  useEffect(() => {
    if (OV_LAST_PITCHER) { loadPitcher(OV_LAST_PITCHER); return; }
    if (!OV_RANDOM_POOL.length) return;
    const [id, name, team, throws] = OV_RANDOM_POOL[Math.floor(Math.random() * OV_RANDOM_POOL.length)];
    loadPitcher({ id, name, team, throws });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const season = year === "2026" ? reg26 : reg25;
  // Date range: everything computed from pitches follows it; model grades, arm angle and spin efficiency are season values.
  const ranged = !!(range.s || range.e);
  const cur = useMemo(() => (season && ranged ? season.filter(p => p.game_date && (!range.s || p.game_date >= range.s) && (!range.e || p.game_date <= range.e)) : season), [season, ranged, range]);
  const pitchedDates = useMemo(() => new Set((season || []).map(p => p.game_date).filter(Boolean)), [season]);
  const seasonSpan = useMemo(() => { const d = [...pitchedDates].sort(); return d.length ? [d[0], d[d.length - 1]] : ["", ""]; }, [pitchedDates]);
  // ERA for a date range: official box-score lines of the games inside it.
  useEffect(() => {
    setBoxR(null);
    if (!ranged || !cur || !pitcher) return undefined;
    const pks = Array.from(new Set(cur.map(p => p.game_pk).filter(Boolean))).slice(0, 200); if (!pks.length) return undefined;
    let alive = true; getPitcherEra(pitcher.id, pks, "games").then(r => { if (alive) setBoxR(r || null); }).catch(() => {});
    return () => { alive = false; };
  }, [ranged, cur, pitcher]);

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

  const line = useMemo(() => seasonLine(cur, ranged ? boxR : year === "2026" ? box26 : box25, ranged || year !== "2026", computeSummaryStats, fipConstsFor), [cur, year, box26, box25, boxR, ranged, computeSummaryStats]);
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
  // Arm angle: the season number on file for the whole season; under a date range (or with nothing on file) it is
  // Statcast's measured angle for those days, with a release-point estimate for any game Statcast has not posted yet.
  const seasonAA = fb && aaMap ? (aaMap[fb.type] ?? null) : null;
  const hasPitchAA = useMemo(() => !!season && season.some(p => p.arm_angle != null), [season]);   // Savant rows carry it per pitch
  const aaKey = pitcher ? `${pitcher.id}|${year}` : "", needAaDays = !!pitcher && !!fb && !!season && !hasPitchAA && (ranged || seasonAA == null);
  const [aaDays, setAaDays] = useState(null);
  useEffect(() => {
    // an empty answer (Savant unreachable, or nothing posted yet) is asked for again the next time a range is set
    if (!needAaDays || (aaDays && aaDays.key === aaKey && !aaDays.empty)) return undefined;
    let alive = true; const key = aaKey, put = (days) => { if (alive) setAaDays({ key, days, empty: !Object.keys(days).length }); };
    getPitcherArmAngle(pitcher.id, year).then(r => put((r && r.days) || {})).catch(() => put({}));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needAaDays, aaKey]);
  const aaInfo = useMemo(() => {
    if (!fb || !season) return null;
    const onFile = seasonAA != null ? { value: seasonAA, basis: "season" } : null;
    if (!ranged && onFile) return onFile;
    const table = hasPitchAA ? null : aaDays && aaDays.key === aaKey ? aaDays.days : undefined;
    if (table === undefined) return onFile;   // by-day measurements still loading
    return armAngleFor({ pitches: season, type: fb.type, hand, range: ranged ? range : null, days: table, seasonValue: seasonAA, heightIn: info?.height_inches || null }) || onFile;
  }, [fb, season, seasonAA, ranged, range, hasPitchAA, aaDays, aaKey, hand, info]);
  const armAngle = aaInfo ? aaInfo.value : null;
  const spin = useMemo(() => {
    if (!mix) return null;
    const codes = mix.types.map(t => t.type), code = codes.includes("FF") ? "FF" : codes.find(c => c === "SI" || c === "FC");
    if (!code) return null;
    const v = srow?.s?.[year.slice(2)]?.[code];
    return { name: { FF: "4-Seam", SI: "Sinker", FC: "Cutter" }[code], eff: v ?? null };
  }, [mix, srow, year]);

  const vars = themeVars(C);
  const base = OV_STAT_BASE[year]?.[hand], hp = `${hand}HP`;
  const busy = year === "2026" ? loading26 : loading25;
  const grSeason = pitcher ? OV_GRADES[year]?.[pitcher.id] || null : null;
  // Under a date range the grades are rebuilt from his per-game building blocks (loaded the first time a range is set).
  // Until they arrive the season grades show dimmed; a range with fewer than 25 graded pitches has no grades.
  const [gradeCells, setGradeCells] = useState(null), cellKey = pitcher ? `${pitcher.id}|${year}` : "";
  useEffect(() => {
    if (!ranged || !grSeason || (gradeCells && gradeCells.key === cellKey)) return undefined;
    let alive = true; const key = cellKey;
    loadGradeCells(year, pitcher.id).then(flat => { if (alive) setGradeCells({ key, flat }); }).catch(() => { if (alive) setGradeCells({ key, flat: null }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranged, cellKey, grSeason]);
  const grRange = useMemo(() => {
    if (!ranged || !grSeason || !gradeCells || gradeCells.key !== cellKey || !gradeCells.flat) return null;
    const g = gradeRange(gradeCells.flat, year, range.s, range.e); return g ? { ...g, f: grSeason.f, u: grSeason.u } : null;
  }, [ranged, grSeason, gradeCells, cellKey, year, range]);
  const gr = ranged && grRange ? grRange : grSeason, grStale = ranged && !grRange;   // stale = still showing the season's grades under a range

  return (
    <div className="ov" style={vars} ref={rootRef}>
      <style>{CSS}</style>
      {tipEl}
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
          {pitcher && !busy && !line && <div className="ov-note" style={{ padding: "8px 0" }}>{err || (ranged ? "No pitches in this date range." : `No ${year} MLB data for this pitcher.`)}</div>}
          {pitcher && !busy && line && (<>
            {gr?.a && GRADE_ROWS.map(([mk, mi, mlab]) => {
              const L = OV_GRADES_LG[year]?.[hand]?.all || {}, who = hand === "L" ? "left-hander" : "right-hander";
              return (
                <div key={mk} className={`ov-grp${grStale ? " ov-seas" : ""}`} data-seas={grStale ? "Full season" : undefined}>
                  <div className="ov-st big" {...gradeTone(gr.a[mi], L.a?.[mk], "", gr.a[3])} title={gradeStory(mk, mlab, gr.a[mi], L.a?.[mk], gr.a[3], who, true)}><div className="k">{mlab}</div><div className="v">{gr.a[mi]}</div></div>
                  <div className="ov-sp">
                    <div {...gradeTone(gr.L?.[mi], L.L?.[mk], "", gr.L?.[3])} title={gr.L ? gradeStory(mk, `${mlab} vs LHH`, gr.L[mi], L.L?.[mk], gr.L[3], `${who} facing lefties`) : undefined}><span>vs L</span><b>{gr.L ? gr.L[mi] : "—"}</b></div>
                    <div {...gradeTone(gr.R?.[mi], L.R?.[mk], "", gr.R?.[3])} title={gr.R ? gradeStory(mk, `${mlab} vs RHH`, gr.R[mi], L.R?.[mk], gr.R[3], `${who} facing righties`) : undefined}><span>vs R</span><b>{gr.R ? gr.R[mi] : "—"}</b></div>
                  </div>
                </div>
              );
            })}
            {gr?.r && (grStale ? <div className="ov-seas" data-seas="Full season">{resultsTile(gr)}</div> : resultsTile(gr))}
            <div className="ov-grp run">
              {[["ERA", line.era, "era", OV_STAT_BASE[year]?.era, `${year} MLB`], ["FIP", line.fip, "fip", base?.all?.fip, `${year} ${hp}`], ["xFIP", line.xfip, "xfip", base?.all?.xfip, `${year} ${hp}`], ["IP", line.ip]].map(([k, v, key, b, lab]) => (
                <div key={k} className="ov-st" {...(key ? tone(key, v, b, lab) : {})}><div className="k">{k}</div><div className="v">{v}</div></div>
              ))}
            </div>
          </>)}
        </div>
        {pitcher && (
          <div className="ov-ctl">
            <div className="ov-years">
              {["2026", "2025"].map(y => <button key={y} aria-pressed={year === y} onClick={() => setYear(y)}>{y}</button>)}
            </div>
            {season && season.length > 0 && (
              <div className="ov-range">
                <DatePickerWithHighlights value={range.s} onChange={v => setRange(r => ({ s: v, e: r.e && r.e < v ? "" : r.e }))} pitchedDates={pitchedDates} C={C} label="Start" placeholder="Start" initial={seasonSpan[0]} compact align="right"
                  onAfterSelect={() => { const b = endRef.current && endRef.current.querySelector("button"); if (b && !range.e) b.click(); }} />
                <span>–</span>
                <div ref={endRef}><DatePickerWithHighlights value={range.e} onChange={v => setRange(r => ({ s: r.s && r.s > v ? "" : r.s, e: v }))} pitchedDates={pitchedDates} C={C} label="End" placeholder="End" initial={seasonSpan[1]} compact align="right" /></div>
                {ranged && <button className="ov-rx" onClick={() => setRange({ s: "", e: "" })} aria-label="Clear date range">×</button>}
              </div>
            )}
          </div>
        )}
      </div>
      {pitcher && reg26 && (<>
        <div className="ov-row">
          <ReleaseCard pitcher={pitcher} hand={hand} heightIn={info?.height_inches || null} fb={busy ? null : fb} armAngle={armAngle} aaInfo={aaInfo} staticRow={srow} getPitchColor={getPitchColor} year={year} />
          <MixCard mix={busy ? null : mix} year={year} getPitchColor={getPitchColor} PITCH_ABBREV={PITCH_ABBREV} />
          <MoveCard C={C} hand={hand} mix={busy ? null : mix} year={year} armAngle={armAngle} armEst={!!aaInfo && aaInfo.estimated > 0} getPitchColor={getPitchColor} PITCH_ABBREV={PITCH_ABBREV} />
        </div>
        <div className="ov-row ov-row2">
          <SpinCard hand={hand} mix={busy ? null : mix} year={year} spin={spin} getPitchColor={getPitchColor} />
          <HeatCard side={side} setSide={setSide} mix={busy ? null : mix} year={year} hand={hand} rvHelpers={helpers} getPitchColor={getPitchColor} PITCH_ABBREV={PITCH_ABBREV} GaussianHeatmapCanvas={GaussianHeatmapCanvas} pitchMatchesCount={pitchMatchesCount} />
          <StatCard side={side} setSide={setSide} hand={hand} cur={busy ? null : cur} line={line} box={ranged ? null : year === "2026" ? box26 : box25} year={year} computeSummaryStats={computeSummaryStats} />
        </div>
        <div className="ov-row ov-row3">
          <GradesCard gr={gr} mix={busy ? null : mix} year={year} hand={hand} seasonOnly={grStale} short={ranged && !!grRange && !grRange.a} getPitchColor={getPitchColor} PITCH_ABBREV={PITCH_ABBREV} />
          <RatesCard mix={busy ? null : mix} year={year} hand={hand} pitchRateCounts={helpers.pitchRateCounts} pitchMatchesCount={pitchMatchesCount} STAT_GOOD_DIR={helpers.STAT_GOOD_DIR} getPitchColor={getPitchColor} PITCH_ABBREV={PITCH_ABBREV} />
          <ValueCard mix={busy ? null : mix} year={year} hand={hand} pitcherId={pitcher.id} ranged={ranged} pitchRunValue={helpers.pitchRunValue} getPitchColor={getPitchColor} PITCH_ABBREV={PITCH_ABBREV} />
        </div>
      </>)}
    </div>
  );
}

// ═══════════════ Hitters tab: Overview-style containers ═══════════════
// Which side he bats from in a set of pitches: "L" / "R", or "S" when both sides have at least 10% of them.
function standOf(ps) {
  let l = 0; for (const p of ps) if (p.batter_hand === "L") l++;
  const sh = ps.length ? l / ps.length : 0;
  return sh >= 0.9 ? "L" : sh <= 0.1 ? "R" : "S";
}

function PitcherHandToggle({ side, setSide }) {
  return <div className="ov-tg3">{[["all", "All"], ["L", "vs LHP"], ["R", "vs RHP"]].map(([k, l]) => <button key={k} aria-pressed={side === k} onClick={() => setSide(k)}>{l}</button>)}</div>;
}

// Results: percentile sliders. "All" ranks him against every hitter; a pitcher-hand split ranks him against hitters
// batting from the same side against that hand.
function HitterResultsCard({ pitches, h, year, side, setSide }) {
  const sub = useMemo(() => (side === "all" ? pitches : pitches.filter(p => p.p_throws === side)), [pitches, side]);
  const vals = useMemo(() => hitterResults(sub, h), [sub, h]);
  const st = useMemo(() => (sub.filter(p => p.batter_hand === "L").length * 2 >= sub.length ? "L" : "R"), [sub]);
  const pool = side === "all" ? HIT_POOLS[year]?.all : HIT_POOLS[year]?.split?.[st]?.[side];
  const among = !pool ? "" : side === "all" ? `Among all ${pool.n} hitters with 100+ PA in ${year}` : `Among ${pool.n} hitters batting ${st === "L" ? "left" : "right"} vs ${side}HP in ${year} (50+ PA)`;
  const enough = { pa: vals && vals.pa >= 10, bbe: vals && vals.bbe >= 10, n: vals && vals.n >= 50 };
  return (
    <div className="ov-card">
      <div className="ov-head"><div className="ov-ct">Results</div>
        <PitcherHandToggle side={side} setSide={setSide} />
      </div>
      <div className="ov-body">
        {!vals || !vals.pa ? <div className="ov-note">No plate appearances{side === "all" ? "" : ` vs ${side}HP`} in this range.</div> : (<>
          {HITTER_RESULT_ROWS.map((grp, gi) => (
            <div key={gi} style={{ display: "contents" }}>
              {gi > 0 && <div className="ov-hr" />}
              {grp.map(([key, label, dir, dec, unit, need]) => {
                const v = vals[key], ok = v != null && !isNaN(v);
                const pct = ok && enough[need] ? pctFromQ(pool?.[key], v, dir < 0) : null;
                const shown = !ok ? "—" : dec === 3 ? v.toFixed(3).replace(/^0/, "") : v.toFixed(dec);
                return <Slider key={key} label={label} pct={pct} neutral={dir === 0} value={shown} unit={ok ? unit : ""}
                  title={!ok ? "" : pct == null ? "Not enough of a sample for a percentile" : `${among}${dir === 0 ? "\nNo good or bad direction: the bar only shows where he ranks, low to high." : dir < 0 ? "\nLower is better for the hitter, so a low number ranks high." : ""}`} />;
              })}
            </div>
          ))}
          <div className="ov-cnote">{vals.pa.toLocaleString()} PA · {vals.bbe.toLocaleString()} batted balls · {vals.n.toLocaleString()} pitches{side === "all" ? "" : ` vs ${side}HP`}</div>
        </>)}
      </div>
    </div>
  );
}

// Value: against one pitcher hand, how he is pitched (usage by pitch type) and what he does with it (run value by
// pitch type), each split overall / before two strikes / two strikes.
const HV_KEYS = ["nv", "nx", "lv", "lx"], HV_ROWS = [["all", "Overall"], ["pre", "Pre-2K"], ["two", "2K"]];
// Columns run in Baseball Savant's pitch order (fastballs, offspeed, curveballs, sliders, knuckleball).
const SAVANT_ORDER = ["FF", "SI", "FC", "CH", "FS", "FO", "SC", "CU", "KC", "CS", "SL", "ST", "SV", "KN"];
const HV_MIN_N = 25, HV_MIN_SHARE = 0.02, HV_MAX_COLS = 8;   // a pitch type shows once he has seen 25 of them and they are 2% of what that hand threw him
function HitterValueCard({ pitches, h, year, ph, setPh }) {
  const [mode, setMode] = useState("a"), [ctx, setCtx] = useState("n");
  const { getPitchColor, PITCH_ABBREV, pitchRunValue } = h;
  const sub = useMemo(() => pitches.filter(p => p.p_throws === ph && p.pitch_type), [pitches, ph]);
  // Savant-style per-pitch values when nearly every pitch carries its base/out state; linear weights otherwise (neutral only)
  const savant = useMemo(() => { let n = 0; for (const p of sub) if (p._sv) n++; return sub.length > 0 && n >= 0.98 * sub.length; }, [sub]);
  const { types, A, tot } = useMemo(() => {
    const A = {}, cnt = {}, names = {}, tot = { all: 0, pre: 0, two: 0 };
    for (const p of sub) {
      const bk = p.strikes === 2 ? "two" : p.strikes != null && p.strikes < 2 ? "pre" : null, q = savant ? p._sv : null;
      const a = q ? q.nv : pitchRunValue(p, false), x = q ? q.nx : pitchRunValue(p, true);
      cnt[p.pitch_type] = (cnt[p.pitch_type] || 0) + 1; if (!names[p.pitch_type]) names[p.pitch_type] = p.pitch_name || p.pitch_type;
      for (const k of bk ? ["all", bk] : ["all"]) {
        const c = A[`${p.pitch_type}|${k}`] || (A[`${p.pitch_type}|${k}`] = [0, 0, 0, 0, 0]);
        c[0] += a; c[1] += x; c[2] += q ? q.lv : a; c[3] += q ? q.lx : x; c[4]++; tot[k]++;
      }
    }
    const ord = (t) => { const i = SAVANT_ORDER.indexOf(t); return i < 0 ? SAVANT_ORDER.length : i; };
    const types = Object.keys(cnt).filter(t => cnt[t] >= HV_MIN_N && cnt[t] >= HV_MIN_SHARE * sub.length).sort((a, b) => cnt[b] - cnt[a]).slice(0, HV_MAX_COLS)
      .sort((a, b) => ord(a) - ord(b) || cnt[b] - cnt[a]).map(t => ({ type: t, name: names[t], n: cnt[t] }));
    return { types, A, tot };
  }, [sub, savant, pitchRunValue]);
  const st = useMemo(() => (sub.filter(p => p.batter_hand === "L").length * 2 >= sub.length ? "L" : "R"), [sub]);
  const lev = ctx === "l" && savant, mi = (lev ? 2 : 0) + (mode === "a" ? 0 : 1), lg = HIT_VALUE_REF[year]?.[st]?.[ph] || {}, KS = HIT_VALUE_K[year] || {}, ulg = HIT_USAGE_REF[year]?.[st]?.[ph] || {};
  const what = `${lev ? "Leveraged: weighted by the base/out situation." : "Context-neutral: base/out situation ignored."} ${mode === "a" ? "Actual results." : "Expected: balls in play valued by exit velocity and launch angle."}`;
  const tg = (cur, set, opts) => <div className="ov-tg3" style={{ marginLeft: 0 }}>{opts.map(([k, l, tip, off]) => <button key={k} aria-pressed={cur === k} disabled={off} style={off ? { opacity: 0.4, cursor: "default" } : undefined} onClick={() => set(k)} title={tip}>{l}</button>)}</div>;
  const matchup = `${st}HB vs ${ph}HP`;
  return (
    <div className="ov-card">
      <div className="ov-head"><div className="ov-ct">Value</div>
        <div style={{ marginLeft: "auto" }}>{tg(ph, setPh, [["R", "vs RHP"], ["L", "vs LHP"]])}</div>
      </div>
      {!types.length ? <div className="ov-note">Not enough pitches vs {ph}HP in this range.</div> : (
        <div className="ov-mix">
          <div className="ov-mrow" style={{ "--n": types.length }}><span className="ov-vsec">Usage</span>
            {types.map(t => <div key={t.type} className="ov-chip" style={{ background: getPitchColor(t.type) }} title={`${t.name}: ${t.n.toLocaleString()} seen vs ${ph}HP`}>{PITCH_ABBREV[t.name] || t.type}</div>)}
          </div>
          {HV_ROWS.map(([rk, rl]) => (
            <div key={rk} className={`ov-mrow${rk === "all" ? " ov-all" : ""}`} style={{ "--n": types.length }}>
              <div className="ov-mlab">{rl}<small>{tot[rk].toLocaleString()}</small></div>
              {types.map(t => {
                const n = tot[rk], c = A[`${t.type}|${rk}`];
                if (n < 15) return <div key={t.type} className="ov-mcell z">—</div>;
                const v = 100 * (c ? c[4] : 0) / n, r = ulg[rk]?.[t.type];
                // marked only when he sees the pitch clearly more or less than hitters in the same matchup and count do
                const z = r ? (v - r[0]) / Math.sqrt(r[1] * r[1] + r[0] * (100 - r[0]) / n) : 0, hi = z >= 1.5 && v - r[0] >= 3, lo = z <= -1.5 && r[0] - v >= 3;
                return <div key={t.type} className={`ov-mcell${hi ? " hi" : lo ? " lo" : ""}${Math.round(v) === 0 ? " z" : ""}`}
                  title={`${t.name} vs ${ph}HP · ${rl}\n${v.toFixed(1)}% of the ${n.toLocaleString()} pitches he saw${r ? `\nLeague ${matchup}: ${r[0].toFixed(1)}%` : ""}`}>{Math.round(v)}<small>%</small></div>;
              })}
            </div>
          ))}
          <div className="ov-mkey"><i />Sees it well above league<i />Well below</div>
          <div className="ov-vbrk"><span className="ov-vsec">Run value</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {tg(lev ? "l" : "n", setCtx, [["n", "Neutral", "Context-neutral: the base/out situation is ignored"], ["l", "Leveraged", savant ? "Leveraged: plays count for more in bigger base/out situations" : "Leveraged needs base/out data, which these pitches do not carry", !savant]])}
              {tg(mode, setMode, [["a", "RV", "Run value from actual results"], ["x", "xRV", "Expected run value: balls in play valued by exit velocity and launch angle"]])}
            </div>
          </div>
          {HV_ROWS.map(([rk, rl]) => (
            <div key={rk} className={`ov-mrow${rk === "all" ? " ov-all" : ""}`} style={{ "--n": types.length }}>
              <div className="ov-mlab">{rl}</div>
              {types.map(t => {
                const c = A[`${t.type}|${rk}`];
                if (!c || c[4] < 15) return <div key={t.type} className="ov-mcell z" title={c ? `${t.name} · ${rl}: only ${c[4]} pitches` : undefined}>—</div>;
                const n = c[4], v = 100 * c[mi] / n, ref = lg[t.type]?.[rk]?.[mi], K = KS[HV_KEYS[mi]]?.[rk] || [1, 0];
                const z = ref == null ? 0 : ((v - ref) * n / (n + K[1])) / K[0], mag = Math.max(0, Math.min(1, (Math.abs(z) - 0.4) / 1.6)), alpha = (0.07 + 0.36 * mag).toFixed(3);
                const col = Math.abs(z) < 0.4 ? null : z > 0 ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`, sg = (q, d = 1) => `${q > 0 ? "+" : q < 0 ? "−" : ""}${Math.abs(q).toFixed(d)}`;
                return <div key={t.type} className="ov-mcell ov-vcell" style={col ? { backgroundImage: `linear-gradient(${col},${col})` } : undefined}
                  title={`${t.name} vs ${ph}HP · ${rl}\n${sg(v)} runs per 100 pitches${ref != null ? ` (league ${matchup}: ${sg(ref)})` : ""}\n${sg(c[mi])} runs in total over ${n.toLocaleString()} pitches\n${what} Color accounts for sample size.`}>{sg(v)}</div>;
              })}
            </div>
          ))}
          <div className="ov-cnote">Runs per 100 pitches · + is good for the hitter<br />{lev ? "Leveraged by base/out" : "Context-neutral"} · {mode === "a" ? "actual results" : "contact valued by exit velocity and launch angle"} · color is vs the league for that matchup, adjusted for sample</div>
        </div>
      )}
    </div>
  );
}

// Location: the pitcher Overview's heatmaps from the hitter's side, by pitch group. Success (+ = good for him) opens on
// "Vs League" (against what the league's hitters do with that pitch type from that pitcher hand at that spot): a hitter
// does not choose where the pitch goes, so the "Value" view mostly credits him for pitches thrown off the plate.
const HIT_GROUPS = [["fb", "Fastballs", "FF", new Set(["FF", "SI", "FC", "FA", "FT"]), "Four-seamers, sinkers, cutters"],
  ["br", "Breaking", "SL", new Set(["SL", "ST", "SV", "CU", "KC", "CS"]), "Sliders, sweepers, slurves, curveballs"],
  ["os", "Offspeed", "CH", new Set(["CH", "FS", "FO", "SC"]), "Changeups, splitters, forkballs, screwballs"]];
function HitterLocationCard({ pitches, h, side, setSide }) {
  const { GaussianHeatmapCanvas, pitchMatchesCount, pitchRunValue, getPitchColor } = h;
  const [grp, setGrp] = useState("fb"), [count, setCount] = useState("all"), [slide, setSlide] = useState(0), [view, setView] = useState("spot");
  const by = useMemo(() => {
    const o = { fb: [], os: [], br: [] };
    for (const p of pitches) {
      if ((side !== "all" && p.p_throws !== side) || p.plate_x == null || p.plate_z == null || !pitchMatchesCount(p, count)) continue;
      const g = HIT_GROUPS.find(x => x[3].has(p.pitch_type)); if (g) o[g[0]].push(p);
    }
    return o;
  }, [pitches, side, count, pitchMatchesCount]);
  const base = by[grp];
  const sets = useMemo(() => ({ success: base, frequency: base, whiffs: base.filter(p => p.is_whiff), damage: base.filter(p => p.is_in_play) }), [base]);
  const successFn = useMemo(() => successWeight(view, true, pitchRunValue, "R"), [view, pitchRunValue]);
  const stand = useMemo(() => { const s = standOf(base); return s === "S" ? "all" : s; }, [base]);   // which batter silhouette(s) to draw
  const [mode, label] = HEAT_SLIDES[slide], step = (d) => setSlide(i => (i + d + HEAT_SLIDES.length) % HEAT_SLIDES.length);
  return (
    <div className="ov-card">
      <div className="ov-head"><div className="ov-ct">Location</div><PitcherHandToggle side={side} setSide={setSide} /></div>
      <div className="ov-body">
        <div className="ov-mrow ov-grow" style={{ "--n": HIT_GROUPS.length }}>
          {HIT_GROUPS.map(([k, l, col, , tip]) => <button key={k} className="ov-chip" aria-pressed={k === grp} style={{ background: getPitchColor(col) }} onClick={() => setGrp(k)} title={tip}>{l}<small>{by[k].length.toLocaleString()}</small></button>)}
        </div>
        <div className="ov-car">
          <button className="ov-arrow" aria-label="Previous map" onClick={() => step(-1)}>‹</button>
          <div className="ov-hm">
            <HeatTile key={mode} label={label} pitches={sets[mode]} mode={mode} side={stand} Canvas={GaussianHeatmapCanvas} weightFn={mode === "success" ? successFn : null} legend={mode === "success" ? SUCCESS_LEGEND.hitter[view] : null} />
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
            <option value="behind">Hitter Ahead</option><option value="ahead">Hitter Behind</option><option value="leverage">Leverage</option>
          </select>
          {mode === "success" && <SuccessViewToggle view={view} setView={setView} />}
        </div>
      </div>
    </div>
  );
}

// Process: Process+ and its three parts (decisions, contact, power), each measured against what the league does
// with the same pitches, plus the rolling 400-pitch chart. The models load the first time the container is shown.
let PROC_MOD = null;
const PROC_PARTS = [["d", "Decisions", "#8b5cf6", "Swing decisions: swinging at pitches worth swinging at and taking the rest, against how often the league swings at the same pitch."],
  ["c", "Contact", "#f59e0b", "Contact on swings (foul or in play), against how often the league makes contact with the same pitch."],
  ["w", "Power", "#14b8a6", "Quality of contact (exit velocity and launch angle) on balls in play, against what the league does with the same pitch."]];
const psgn = (v, d = 0) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`;
const mdLabel = (iso) => `${parseInt(iso.slice(5, 7), 10)}/${parseInt(iso.slice(8, 10), 10)}`;

function ProcessChart({ pts, range }) {
  const [hover, setHover] = useState(null), ref = useRef(null), boxRef = useRef(null), [W, setW] = useState(900);
  // drawn at the container's real width so labels stay the same size on a phone as on a desktop
  useEffect(() => {
    if (!boxRef.current) return undefined;
    const ro = new ResizeObserver(e => setW(Math.max(300, Math.round(e[0].contentRect.width)))); ro.observe(boxRef.current); return () => ro.disconnect();
  }, []);
  const H = Math.round(Math.max(230, Math.min(320, W * 0.36))), m = { l: 34, r: 10, t: 10, b: 24 };
  const geo = useMemo(() => {
    if (!pts.length) return null;
    const day = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
    const d0 = day(pts[0].date), d1 = Math.max(day(pts[pts.length - 1].date), d0 + 20);
    let lo = 80, hi = 120;
    for (const p of pts) { let up = 100, dn = 100; for (const k of ["d", "c", "w"]) { if (p[k] > 0) up += p[k]; else dn += p[k]; } lo = Math.min(lo, dn, p.t); hi = Math.max(hi, up, p.t); }
    lo = Math.floor((lo - 3) / 25) * 25; hi = Math.ceil((hi + 3) / 25) * 25;
    const x = (iso) => m.l + (W - m.l - m.r) * (day(iso) - d0) / (d1 - d0), y = (v) => m.t + (H - m.t - m.b) * (hi - v) / (hi - lo);
    const ticks = []; for (let v = lo; v <= hi; v += 25) ticks.push(v);
    const months = []; const yr = +pts[0].date.slice(0, 4);
    for (let mo = 1; mo <= 12; mo++) { const iso = `${yr}-${String(mo).padStart(2, "0")}-01`; if (day(iso) >= d0 - 3 && day(iso) <= d1) months.push(iso); }
    const bw = Math.max(1.6, Math.min(5, (W - m.l - m.r) / (d1 - d0) * 0.62));
    return { x, y, ticks, months, bw, lo, hi };
  }, [pts, W, H]);
  if (!geo) return null;
  const { x, y, ticks, months, bw } = geo;
  const move = (e) => {
    const r = ref.current.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W; let best = 0, bd = 1e9;
    pts.forEach((p, i) => { const dd = Math.abs(x(p.date) - px); if (dd < bd) { bd = dd; best = i; } }); setHover(best);
  };
  const cur = pts[hover != null && hover < pts.length ? hover : pts.length - 1];
  return (
    <div className="ov-pchart" ref={boxRef}>
      <div className="ov-pread" data-date={cur.date}>
        <b>{mdLabel(cur.date)}</b><span>last {cur.n.toLocaleString()} pitches</span><span className="t">Process+ <b>{Math.round(cur.t)}</b></span>
        {PROC_PARTS.map(([k, l, col]) => <span key={k}><i style={{ background: col }} />{l} <b>{psgn(cur[k])}</b></span>)}
      </div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Rolling Process+ chart" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)}>
        {range && (range.s || range.e) && <rect x={range.s ? Math.max(m.l, x(range.s)) : m.l} y={m.t} width={Math.max(0, (range.e ? Math.min(W - m.r, x(range.e)) : W - m.r) - (range.s ? Math.max(m.l, x(range.s)) : m.l))} height={H - m.t - m.b} fill="var(--accent)" opacity="0.07" />}
        {ticks.map(v => <g key={v}><line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={v === 100 ? 0 : 1} /><text x={m.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--dim)">{v}</text></g>)}
        {months.map(iso => <text key={iso} x={x(iso)} y={H - 7} textAnchor="middle" fontSize="10.5" fill="var(--dim)">{mdLabel(iso)}</text>)}
        {pts.map((p, i) => {
          let up = 100, dn = 100; const full = p.n >= PROC_MOD.PROC_WINDOW;
          return <g key={p.date} opacity={full ? 1 : 0.4} data-day={p.date} data-n={p.n} data-t={p.t.toFixed(2)} data-d={p.d.toFixed(2)} data-c={p.c.toFixed(2)} data-w={p.w.toFixed(2)}>
            {PROC_PARTS.map(([k, , col]) => { const v = p[k]; if (!v) return null; const a = v > 0 ? up : dn, b = a + v; if (v > 0) up = b; else dn = b; return <rect key={k} x={x(p.date) - bw / 2} width={bw} y={y(Math.max(a, b))} height={Math.abs(y(a) - y(b))} fill={col} opacity={i === hover ? 1 : 0.85} />; })}
          </g>;
        })}
        <line x1={m.l} x2={W - m.r} y1={y(100)} y2={y(100)} stroke="var(--text)" strokeWidth="1.2" opacity="0.55" />
        <polyline fill="none" stroke="var(--text)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" points={pts.map(p => `${x(p.date).toFixed(1)},${y(p.t).toFixed(1)}`).join(" ")} />
        {hover != null && hover < pts.length && <g><line x1={x(pts[hover].date)} x2={x(pts[hover].date)} y1={m.t} y2={H - m.b} stroke="var(--text)" strokeWidth="1" opacity="0.35" /><circle cx={x(pts[hover].date)} cy={y(pts[hover].t)} r="4" fill="var(--surface)" stroke="var(--text)" strokeWidth="2" /></g>}
      </svg>
    </div>
  );
}

function HitterProcessCard({ season, pitches, h, year, range }) {
  const [ver, setVer] = useState("full"), [ready, setReady] = useState(!!PROC_MOD);
  useEffect(() => { if (PROC_MOD) return undefined; let alive = true; import("./processModel.js").then(mod => { PROC_MOD = mod; if (alive) setReady(true); }).catch(() => {}); return () => { alive = false; }; }, []);
  // score the season once; the tiles follow the date range, the chart always shows the season's rolling line
  const scored = useMemo(() => (ready ? PROC_MOD.scoreAll(season, h.xwobaconLookup) : null), [ready, season, h]);
  const inRange = useMemo(() => { if (!scored) return null; if (pitches === season) return scored; const keep = new Set(pitches); return scored.filter(p => keep.has(p)); }, [scored, pitches, season]);
  const line = useMemo(() => (inRange ? PROC_MOD.processLine(inRange, year, ver) : null), [inRange, year, ver]);
  const roll = useMemo(() => (scored ? PROC_MOD.processRolling(scored, year, ver).filter(p => p.n >= 200) : []), [scored, year, ver]);
  const pool = ready ? (PROC_MOD.PROC_POOLS[year] || {})[ver] : null;
  const tile = (key, lab, v, shown, about) => {
    const pct = line && line.n >= 200 ? pctFromQ(pool?.[key], v) : null, mag = pct == null ? 0 : Math.max(0, Math.min(1, (Math.abs(pct - 50) - 16) / 33)), alpha = (0.07 + 0.36 * mag).toFixed(3);
    const col = pct == null || Math.abs(pct - 50) < 16 ? null : pct > 50 ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`;
    return <div key={key} className={`ov-st${key === "t" ? " big" : ""}`} data-k={key} style={col ? { backgroundImage: `linear-gradient(${col},${col})` } : undefined}
      title={`${about}\n${pct != null ? `${ordinal(pct)} percentile among ${pool.n} hitters with 400+ pitches in ${year}` : "Too few pitches to rank"}`}><div className="k">{lab}</div><div className="v">{shown}</div></div>;
  };
  return (
    <div className="ov-card ov-wide">
      <div className="ov-head"><div className="ov-ct">Process</div>
        <div className="ov-tg3">{[["basic", "Basic", "League expectation from pitch group, location, count and handedness"], ["full", "Full", "Adds the pitch's velocity and movement to the league expectation"]].map(([k, l, tip]) => <button key={k} aria-pressed={ver === k} onClick={() => setVer(k)} title={tip}>{l}</button>)}</div>
      </div>
      <div className="ov-body">
        {!ready ? <div className="ov-note">Loading models…</div> : !line ? <div className="ov-note">No scoreable pitches in this range.</div> : (<>
          <div className="ov-prow">
            <div className="ov-ptiles">
              {tile("t", "Process+", line.t, Math.round(line.t), "Process+: 100 is league average, and each point is 1% of league run scoring per pitch, the way wRC+ is built. It is the sum of the three parts.")}
              {PROC_PARTS.map(([k, l, , about]) => tile(k, l, line[k], psgn(line[k]), `${about}\nPoints of Process+ it adds or costs.`))}
              <div className="ov-pn">{line.n.toLocaleString()} pitches</div>
            </div>
            {roll.length > 1 ? <ProcessChart pts={roll} range={range} /> : <div className="ov-note" style={{ flex: 1 }}>The rolling chart starts once he has seen 200 pitches.</div>}
          </div>
          <div className="ov-cnote">Rolling {PROC_MOD.PROC_WINDOW} pitches, one bar per game day (faded until the window is full) · bars are what each part adds or costs, the line is Process+ · {ver === "full" ? "league expectation uses location, count, handedness, velocity and movement" : "league expectation uses pitch group, location, count and handedness"}</div>
        </>)}
      </div>
    </div>
  );
}

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
const fmt3 = (v) => (v == null || isNaN(v) ? "—" : v.toFixed(3).replace(/^0(?=\.)/, ""));
const HIT_SEASON = { 2025: ["2025-03-27", "2025-09-28"] };   // past seasons come from Savant by date range
const BATS_WORD = { L: "LHB", R: "RHB", S: "Switch" };

export function HittersPage({ C, helpers }) {
  const { normalizeLivePitch, normAndFilter, isPostseasonDate, DatePickerWithHighlights } = helpers;
  const [q, setQ] = useState(""), [results, setResults] = useState([]), [open, setOpen] = useState(false);
  const [batter, setBatter] = useState(null), [year, setYearRaw] = useState("2026");
  const [data, setData] = useState({}), [loading, setLoading] = useState({});   // by season
  const [range, setRange] = useState({ s: "", e: "" }), [official, setOfficial] = useState(null), endRef = useRef(null);
  const setYear = (y) => { setRange({ s: "", e: "" }); setYearRaw(y); };
  const [side, setSide] = useState("all");   // pitcher hand shared by the Results and Location containers
  // One pitcher-hand choice for the whole page. Value has no "All" (its league numbers are per matchup), so it keeps the last hand picked.
  const [vhand, setVhand] = useState("R");
  const pickSide = useCallback((k) => { setSide(k); if (k !== "all") setVhand(k); }, []);
  const [rootRef, tipEl] = useTapTips();
  const searchRef = useRef(null), seqRef = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2 || (batter && q === batter.name)) { setResults([]); return undefined; }
    let alive = true;
    const t = setTimeout(async () => {
      try { const r = await searchBatters(q); if (alive) { setResults(r || []); setOpen(true); } } catch { if (alive) setResults([]); }
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q, batter]);
  useEffect(() => {
    const f = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f);
  }, []);

  const loadBatter = (b) => {
    HIT_LAST_BATTER = b; ++seqRef.current;
    setBatter(b); setQ(b.name); setOpen(false); setResults([]); setData({}); setLoading({}); setOfficial(null); setYear("2026");   // setYear also clears the date range
  };
  // First visit: open on a random 2026 regular (300+ PA). Coming back to the tab restores the last hitter viewed.
  useEffect(() => {
    if (HIT_LAST_BATTER) { loadBatter(HIT_LAST_BATTER); return; }
    if (!HIT_RANDOM_POOL.length) return;
    const [id, name, team, bats] = HIT_RANDOM_POOL[Math.floor(Math.random() * HIT_RANDOM_POOL.length)];
    loadBatter({ id, name, team, bats });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A season loads the first time it is opened: this year's from the pitch cache, a past one from Savant.
  useEffect(() => {
    if (!batter || data[year] || loading[year]) return;
    const seq = seqRef.current, y = year, done = (rows) => { if (seq !== seqRef.current) return; setData(d => ({ ...d, [y]: rows })); setLoading(l => ({ ...l, [y]: false })); };
    setLoading(l => ({ ...l, [y]: true }));
    const span = HIT_SEASON[y];
    (span ? getBatterStatcast(batter.id, span[0], span[1]).then(raw => normAndFilter(raw || [])) : getBatterCachedSeason(batter.id).then(raw => (raw || []).map(normalizeLivePitch)))
      .then(done).catch(() => done([]));
  }, [batter, year, data, loading, normAndFilter, normalizeLivePitch]);

  // Regular season only (anything after Sep 28 is postseason), as on the pitcher Overview.
  const season = useMemo(() => (data[year] ? data[year].filter(p => !isPostseasonDate(p.game_date)) : null), [data, year, isPostseasonDate]);
  const ranged = !!(range.s || range.e);
  const cur = useMemo(() => (season && ranged ? season.filter(p => p.game_date && (!range.s || p.game_date >= range.s) && (!range.e || p.game_date <= range.e)) : season), [season, ranged, range]);
  const playedDates = useMemo(() => new Set((season || []).map(p => p.game_date).filter(Boolean)), [season]);
  const seasonSpan = useMemo(() => { const d = [...playedDates].sort(); return d.length ? [d[0], d[d.length - 1]] : ["", ""]; }, [playedDates]);

  // Official line from MLB (it counts intentional walks that never show up as a pitch); the pitch-derived line fills in until it arrives.
  const lineKey = batter ? `${batter.id}|${year}|${range.s}|${range.e}` : "";
  useEffect(() => {
    if (!batter || !season || !season.length) return undefined;
    let alive = true; const key = lineKey;
    getBatterLine(batter.id, year, ranged ? range.s || seasonSpan[0] : "", ranged ? range.e || seasonSpan[1] : "")
      .then(r => { if (alive && r && r.pa) setOfficial({ key, line: r }); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineKey, season]);
  const derived = useMemo(() => hitterLine(cur, helpers), [cur, helpers]);
  const line = official && official.key === lineKey ? official.line : derived;
  // Header tiles: AVG / OBP / SLG / HR from the line, K % and BB % from the same line (walks include intentional ones, as
  // FanGraphs counts them). Each is coloured by its percentile among every hitter with 100+ PA that season: green above
  // average, red below, plain in the middle third. HR is ranked as home runs per PA so a partial season compares fairly.
  const tiles = useMemo(() => {
    if (!line || !line.pa) return [];
    const src = line.so != null && line.bb != null ? line : derived && derived.pa ? derived : null, pool = HIT_LINE_POOLS[year];
    const rows = [["AVG", fmt3(line.avg), "avg", line.avg], ["OBP", fmt3(line.obp), "obp", line.obp], ["SLG", fmt3(line.slg), "slg", line.slg], ["HR", line.hr, "hr", 100 * line.hr / line.pa, "", "per PA"]];
    if (src) rows.push(["K%", (100 * src.so / src.pa).toFixed(1), "k", 100 * src.so / src.pa, "%", `${src.so} in ${src.pa.toLocaleString()} PA`, true], ["BB%", (100 * src.bb / src.pa).toFixed(1), "bb", 100 * src.bb / src.pa, "%", `${src.bb} in ${src.pa.toLocaleString()} PA`]);
    return rows.map(([lab, shown, key, v, unit, note, lowGood]) => {
      const pct = line.pa >= 30 ? pctFromQ(pool?.[key], v, lowGood) : null;
      const mag = pct == null ? 0 : Math.max(0, Math.min(1, (Math.abs(pct - 50) - 16) / 33)), alpha = (0.07 + 0.36 * mag).toFixed(3);
      const col = pct == null || Math.abs(pct - 50) < 16 ? null : pct > 50 ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`;
      const rank = pct != null ? `${ordinal(pct)} percentile${key === "hr" ? " in home runs per PA" : ""} among all ${pool.n} hitters with 100+ PA in ${year}${lowGood ? " (fewer strikeouts ranks higher)" : ""}` : line.pa < 30 ? "Too few PA to rank" : "";
      return { lab, shown, unit, col, tip: [key !== "hr" && note, rank].filter(Boolean).join("\n") };
    });
  }, [line, derived, year]);
  const bats = useMemo(() => (batter?.bats === "L" || batter?.bats === "R" || batter?.bats === "S" ? batter.bats : season && season.length ? standOf(season) : ""), [batter, season]);
  const busy = !!loading[year] || (!!batter && !data[year]);
  const lineTip = line ? `${line.pa.toLocaleString()} PA${ranged ? " in this date range" : ` · ${year} regular season`}\n${line.source === "mlb" ? "Official MLB line" : HIT_SEASON[year] ? "From Statcast pitch data" : "From pitch data: an intentional walk issued without a pitch is not counted"}` : undefined;

  return (
    <div className="ov" style={themeVars(C)} ref={rootRef}>
      <style>{CSS}</style>
      {tipEl}
      <div className="ov-sum">
        <div className="ov-who" ref={searchRef}>
          <input value={q} onChange={e => setQ(e.target.value)} onFocus={() => results.length > 0 && setOpen(true)} placeholder="Search hitter..." aria-label="Search hitter" />
          {open && results.length > 0 && (
            <div className="ov-dd">
              {results.map(r => <div key={r.id} onClick={() => loadBatter(r)}><strong>{r.name}</strong>{r.team && <span>{r.team}</span>}{r.position && <span>{r.position}</span>}</div>)}
            </div>
          )}
          {batter && (
            <div className="ov-id">
              <div className="ov-face" role="img" aria-label={batter.name} style={{ backgroundImage: `url(${headshotUrl(batter.id)})` }} />
              {TEAM_IDS[batter.team] && <img className="ov-logo" src={`https://www.mlbstatic.com/team-logos/${TEAM_IDS[batter.team]}.svg`} alt={batter.team} onError={e => { e.currentTarget.style.display = "none"; }} />}
              <div className="nm"><h1>{batter.name}</h1><span>{[BATS_WORD[bats], batter.position].filter(Boolean).join(" · ")}</span></div>
            </div>
          )}
        </div>
        <div className="ov-stats">
          {!batter && <div className="ov-note" style={{ padding: "8px 0", textAlign: "left" }}>Search a hitter to load his season line, results and run value by pitch type.</div>}
          {batter && busy && <div className="ov-note" style={{ padding: "8px 0" }}>Loading {year} season…</div>}
          {batter && !busy && !line && <div className="ov-note" style={{ padding: "8px 0" }}>{ranged ? "No plate appearances in this date range." : `No ${year} MLB data for this hitter.`}</div>}
          {batter && !busy && line && (
            <div className="ov-grp">
              {tiles.map(t => (
                <div key={t.lab} className="ov-st big" title={[t.tip, lineTip].filter(Boolean).join("\n")} style={t.col ? { backgroundImage: `linear-gradient(${t.col},${t.col})` } : undefined}>
                  <div className="k">{t.lab}</div><div className="v">{t.shown}{t.unit && <small>{t.unit}</small>}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        {batter && (
          <div className="ov-ctl">
            <div className="ov-years">
              {["2026", "2025"].map(y => <button key={y} aria-pressed={year === y} onClick={() => setYear(y)}>{y}</button>)}
            </div>
            {season && season.length > 0 && (
              <div className="ov-range">
                <DatePickerWithHighlights value={range.s} onChange={v => setRange(r => ({ s: v, e: r.e && r.e < v ? "" : r.e }))} pitchedDates={playedDates} legend="Played" C={C} label="Start" placeholder="Start" initial={seasonSpan[0]} compact align="right"
                  onAfterSelect={() => { const b = endRef.current && endRef.current.querySelector("button"); if (b && !range.e) b.click(); }} />
                <span>–</span>
                <div ref={endRef}><DatePickerWithHighlights value={range.e} onChange={v => setRange(r => ({ s: r.s && r.s > v ? "" : r.s, e: v }))} pitchedDates={playedDates} legend="Played" C={C} label="End" placeholder="End" initial={seasonSpan[1]} compact align="right" /></div>
                {ranged && <button className="ov-rx" onClick={() => setRange({ s: "", e: "" })} aria-label="Clear date range">×</button>}
              </div>
            )}
          </div>
        )}
      </div>
      {batter && !busy && cur && cur.length > 0 && (
        <div className="ov-row ov-hrow">
          <HitterProcessCard season={season} pitches={cur} h={helpers} year={year} range={ranged ? range : null} />
          <HitterResultsCard pitches={cur} h={helpers} year={year} side={side} setSide={pickSide} />
          <HitterValueCard pitches={cur} h={helpers} year={year} ph={vhand} setPh={pickSide} />
          <HitterLocationCard pitches={cur} h={helpers} side={side} setSide={pickSide} />
        </div>
      )}
    </div>
  );
}
