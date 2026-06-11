import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import * as recharts from "recharts";
import { searchPitchers, getLiveGames, getGamePitchers, getGamePitches, getStatcast, getStatcastSampled, getCachedSeason, getTeamLogos, getSeasonData, getStartersToday, getPitcherEra, getLeaderboard, getReport } from "./api.js";

const {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, ReferenceArea
} = recharts;

// ─── Responsive hook ───
const useIsMobile = (breakpoint = 768) => {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < breakpoint : false);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [breakpoint]);
  return isMobile;
};

const themes = {
  dark: {
    bg: "#0a0e17", surface: "#111827", surfaceAlt: "#1a2234",
    border: "#1e293b", borderLight: "#334155", text: "#e2e8f0",
    textMuted: "#94a3b8", textDim: "#64748b", accent: "#3b82f6",
    accentGlow: "rgba(59,130,246,0.15)", tableStripe: "rgba(26,34,52,0.5)",
    yellow: "#facc15",
  },
  light: {
    bg: "#f5f0e8", surface: "#faf7f2", surfaceAlt: "#f0ebe3",
    border: "#e0d9ce", borderLight: "#c9c1b4", text: "#2c2418",
    textMuted: "#5c5347", textDim: "#9c9488", accent: "#2563eb",
    accentGlow: "rgba(37,99,235,0.1)", tableStripe: "rgba(240,235,227,0.7)",
    yellow: "#ca8a04",
  },
};

const PITCH_COLORS = {
  "4-Seam Fastball": "#dc2626", "Four-Seam Fastball": "#dc2626", "FF": "#dc2626",
  "Sinker": "#ea580c", "SI": "#ea580c", "Two-Seam Fastball": "#ea580c",
  "Changeup": "#16a34a", "CH": "#16a34a",
  "Slider": "#ca8a04", "SL": "#ca8a04",
  "Cutter": "#78350f", "FC": "#78350f",
  "Curveball": "#2563eb", "CU": "#2563eb",
  "Splitter": "#0d9488", "FS": "#0d9488", "Split-Finger": "#0d9488",
  "Sweeper": "#a16207", "ST": "#a16207",
  "Knuckle Curve": "#7c3aed", "KC": "#7c3aed",
  "Knuckleball": "#78716c", "KN": "#78716c",
  "Slow Curve": "#2563eb", "CS": "#2563eb",
  "Slurve": "#a16207", "SV": "#a16207",
  "Eephus": "#78716c", "EP": "#78716c",
  "Screwball": "#0d9488", "SC": "#0d9488",
};
const PITCH_ABBREV = {
  "4-Seam Fastball": "FF", "Four-Seam Fastball": "FF",
  "Sinker": "SI", "Two-Seam Fastball": "SI",
  "Changeup": "CH", "Slider": "SL",
  "Cutter": "FC", "Curveball": "CU",
  "Splitter": "FS", "Split-Finger": "FS",
  "Sweeper": "ST", "Knuckle Curve": "KC",
  "Knuckleball": "KN", "Slow Curve": "CS",
  "Slurve": "SV", "Eephus": "EP", "Screwball": "SC",
};
const getPitchColor = (n) => PITCH_COLORS[n] || PITCH_COLORS[PITCH_ABBREV[n]] || "#94a3b8";

const COUNT_STATES = {
  all: { label: "All", counts: null },
  early: { label: "Early", counts: ["0-0", "1-0", "0-1"] },
  ahead: { label: "Ahead", counts: ["0-1", "0-2", "1-2", "2-2"] },
  behind: { label: "Behind", counts: ["1-0", "2-0", "3-0", "2-1", "3-1"] },
  preTwoK: { label: "Pre-2K", counts: ["0-0", "0-1", "1-0", "1-1", "2-1", "3-1"] },
};

const PITCHER_DB = [
  "Gerrit Cole", "Spencer Strider", "Zack Wheeler", "Corbin Burnes", "Logan Webb",
  "Yoshinobu Yamamoto", "Dylan Cease", "Framber Valdez", "Kevin Gausman", "Sonny Gray",
  "Tarik Skubal", "Chris Sale", "Pablo Lopez", "Luis Castillo", "Tyler Glasnow",
  "Max Fried", "Shota Imanaga", "Seth Lugo", "Cole Ragans", "Tanner Houck",
  "Bryce Miller", "Hunter Brown", "Jared Jones", "Paul Skenes", "Jack Flaherty",
  "Zac Gallen", "Joe Ryan", "Aaron Nola", "Shane Bieber", "Justin Verlander",
  "Ranger Suarez", "Michael King", "Mitch Keller", "Marcus Stroman", "Nestor Cortes",
  "Blake Snell", "Yu Darvish", "Sandy Alcantara", "Freddy Peralta", "Bailey Ober",
];

const MOCK_HITTERS = [
  "Aaron Judge", "Juan Soto", "Mookie Betts", "Shohei Ohtani", "Ronald Acuña Jr.",
  "Freddie Freeman", "Corey Seager", "Marcus Semien", "Rafael Devers", "Yordan Alvarez",
  "Kyle Tucker", "Bobby Witt Jr.", "Trea Turner", "Matt Olson", "Gunnar Henderson",
];

const MOCK_LIVE_GAMES = [
  { id: 1, away: "NYY", home: "BOS", score: "3 - 2", inning: "Top 6th", venue: "Fenway Park",
    pitchers: [
      { name: "Gerrit Cole", team: "NYY", role: "SP", ip: "5.1", pitches: 87, status: "active" },
      { name: "Clay Holmes", team: "NYY", role: "RP", ip: "0.2", pitches: 12, status: "bullpen" },
      { name: "Tanner Houck", team: "BOS", role: "SP", ip: "5.0", pitches: 79, status: "done" },
      { name: "Kenley Jansen", team: "BOS", role: "RP", ip: "1.0", pitches: 14, status: "active" },
    ] },
  { id: 2, away: "LAD", home: "SF", score: "1 - 0", inning: "Bot 3rd", venue: "Oracle Park",
    pitchers: [
      { name: "Yoshinobu Yamamoto", team: "LAD", role: "SP", ip: "3.0", pitches: 42, status: "active" },
      { name: "Logan Webb", team: "SF", role: "SP", ip: "2.1", pitches: 38, status: "active" },
    ] },
  { id: 3, away: "HOU", home: "TEX", score: "4 - 4", inning: "Top 8th", venue: "Globe Life Field",
    pitchers: [
      { name: "Framber Valdez", team: "HOU", role: "SP", ip: "6.0", pitches: 94, status: "done" },
      { name: "Bryan Abreu", team: "HOU", role: "RP", ip: "1.0", pitches: 16, status: "done" },
      { name: "Ryan Pressly", team: "HOU", role: "RP", ip: "0.2", pitches: 11, status: "active" },
      { name: "Nathan Eovaldi", team: "TEX", role: "SP", ip: "7.0", pitches: 101, status: "done" },
      { name: "Kirby Yates", team: "TEX", role: "RP", ip: "0.2", pitches: 9, status: "active" },
    ] },
  { id: 4, away: "ATL", home: "PHI", score: "0 - 2", inning: "Bot 5th", venue: "Citizens Bank Park",
    pitchers: [
      { name: "Chris Sale", team: "ATL", role: "SP", ip: "4.1", pitches: 71, status: "active" },
      { name: "Zack Wheeler", team: "PHI", role: "SP", ip: "5.0", pitches: 68, status: "active" },
    ] },
];

const POSSIBLE_COUNTS = ["0-0", "0-1", "0-2", "1-0", "1-1", "1-2", "2-0", "2-1", "2-2", "3-0", "3-1", "3-2"];

const generateMockPitchData = () => {
  const pitchTypes = [
    { name: "4-Seam Fastball", code: "FF", vR: [93, 97], sR: [2200, 2450], iR: [14, 18], hR: [6, 12], uL: 0.38, uR: 0.31 },
    { name: "Sweeper", code: "ST", vR: [81, 85], sR: [2500, 2800], iR: [-4, 0], hR: [-8, -14], uL: 0.16, uR: 0.32 },
    { name: "Cutter", code: "FC", vR: [88, 92], sR: [2300, 2550], iR: [4, 8], hR: [1, -3], uL: 0.15, uR: 0.23 },
    { name: "Curveball", code: "CU", vR: [78, 82], sR: [2600, 2900], iR: [-8, -4], hR: [-4, -10], uL: 0.13, uR: 0.01 },
    { name: "Changeup", code: "CH", vR: [84, 87], sR: [1600, 1900], iR: [6, 10], hR: [14, 18], uL: 0.11, uR: 0.005 },
    { name: "Sinker", code: "SI", vR: [93, 96], sR: [2100, 2350], iR: [6, 10], hR: [14, 18], uL: 0.07, uR: 0.13 },
  ];
  const pitches = [];
  const totalPitches = 85 + Math.floor(Math.random() * 30);
  let currentInning = 1, pitchInInning = 0;
  for (let i = 0; i < totalPitches; i++) {
    pitchInInning++;
    if (pitchInInning > 18) { currentInning++; pitchInInning = 1; }
    const isVsLeft = Math.random() < 0.45;
    const rand = Math.random();
    let cumulative = 0, selectedType = pitchTypes[0];
    for (const pt of pitchTypes) {
      cumulative += isVsLeft ? pt.uL : pt.uR;
      if (rand <= cumulative) { selectedType = pt; break; }
    }
    const v = selectedType.vR[0] + Math.random() * (selectedType.vR[1] - selectedType.vR[0]);
    const sp = selectedType.sR[0] + Math.random() * (selectedType.sR[1] - selectedType.sR[0]);
    const iv = selectedType.iR[0] + Math.random() * (selectedType.iR[1] - selectedType.iR[0]);
    const hb = selectedType.hR[0] + Math.random() * (selectedType.hR[1] - selectedType.hR[0]);
    const iz = Math.random() < 0.45;
    const sw = iz ? Math.random() < 0.7 : Math.random() < 0.3;
    const wh = sw ? Math.random() < 0.28 : false;
    const cs = !sw && iz ? Math.random() < 0.85 : false;
    const fo = sw && !wh ? Math.random() < 0.4 : false;
    const ip = sw && !wh && !fo;
    const gb = ip ? Math.random() < 0.44 : false;
    const fb = ip && !gb ? Math.random() < 0.55 : false;
    const ba = ip ? Math.random() < 0.07 : false;
    let desc = "ball";
    if (wh) desc = "swinging_strike";
    else if (cs) desc = "called_strike";
    else if (fo) desc = "foul";
    else if (ip) desc = "hit_into_play";
    pitches.push({
      pitch_number: i + 1, pitch_type: selectedType.code, pitch_name: selectedType.name,
      release_speed: Math.round(v * 10) / 10, release_spin_rate: Math.round(sp),
      spin_efficiency: Math.round(55 + Math.random() * 40),
      pfx_z: Math.round(iv * 10) / 10, pfx_x: Math.round(hb * 10) / 10,
      release_pos_z: Math.round((4.8 + Math.random() * 0.5) * 10) / 10,
      release_pos_x: Math.round((3.0 + Math.random() * 0.6) * 10) / 10,
      vaa: Math.round((-4 + Math.random() * -3) * 10) / 10,
      release_extension: Math.round((5.8 + Math.random() * 1.2) * 10) / 10,
      plate_x: Math.round((-1.2 + Math.random() * 2.4) * 100) / 100,
      plate_z: Math.round((0.8 + Math.random() * 3.2) * 100) / 100,
      description: desc, is_in_zone: iz, is_swing: sw, is_whiff: wh,
      is_called_strike: cs, is_in_play: ip,
      is_ground_ball: gb, is_fly_ball: fb, is_barrel: ba,
      batter_hand: isVsLeft ? "L" : "R",
      count: POSSIBLE_COUNTS[Math.floor(Math.random() * POSSIBLE_COUNTS.length)],
      batter_name: MOCK_HITTERS[Math.floor(Math.random() * MOCK_HITTERS.length)],
      inning: currentInning,
      launch_speed: ip ? Math.round((75 + Math.random() * 40) * 10) / 10 : null,
      estimated_slg_using_speedangle: ip ? Math.round(Math.random() * 2 * 1000) / 1000 : null,
      estimated_woba_using_speedangle: ip ? Math.round(Math.random() * 0.8 * 1000) / 1000 : null,
      woba_value: ip ? Math.round(Math.random() * 1.5 * 1000) / 1000 : null,
      delta_run_exp: Math.round((-0.15 + Math.random() * 0.3) * 1000) / 1000,
    });
  }
  return pitches;
};

const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) + "%" : "—";
const avg1 = (a) => { const f = a.filter(v => v != null && !isNaN(v)); return f.length > 0 ? (f.reduce((s, v) => s + v, 0) / f.length).toFixed(1) : "—"; };
const avg2 = (a) => { const f = a.filter(v => v != null && !isNaN(v)); return f.length > 0 ? (f.reduce((s, v) => s + v, 0) / f.length).toFixed(2) : "—"; };
const avgInt = (a) => { const f = a.filter(v => v != null && !isNaN(v)); return f.length > 0 ? Math.round(f.reduce((s, v) => s + v, 0) / f.length) : "—"; };
const avg3 = (a) => { const f = a.filter(v => v != null && !isNaN(v)); return f.length > 0 ? (f.reduce((s, v) => s + v, 0) / f.length).toFixed(3) : "—"; };
const avgNum = (a) => { const f = a.filter(v => v != null && !isNaN(v)); return f.length > 0 ? f.reduce((s, v) => s + v, 0) / f.length : 0; };

const computeMetrics = (pitches, hf) => {
  if (!pitches?.length) return null;
  let f = hf === "all" ? pitches : pitches.filter(p => p.batter_hand === hf);
  // Filter out "events-only" pitches (those kept for events but missing pitch classification)
  // so they don't show as a blank row in the pitch-type table.
  f = f.filter(p => p.pitch_name && p.pitch_name.trim() !== "" && p.pitch_name.toLowerCase() !== "nan");
  if (!f.length) return null;
  const bt = {};
  f.forEach(p => { if (!bt[p.pitch_name]) bt[p.pitch_name] = []; bt[p.pitch_name].push(p); });
  const ptm = Object.entries(bt).map(([n, pts]) => {
    const c = pts.length, sw = pts.filter(p => p.is_swing).length, wh = pts.filter(p => p.is_whiff).length,
      iz = pts.filter(p => p.is_in_zone).length, cs = pts.filter(p => p.is_called_strike).length,
      st = pts.filter(p => p.is_swing || p.is_called_strike).length,
      ip = pts.filter(p => p.is_in_play).length, gb = pts.filter(p => p.is_ground_ball).length,
      fb = pts.filter(p => p.is_fly_ball).length, ba = pts.filter(p => p.is_barrel).length,
      ozs = pts.filter(p => !p.is_in_zone && p.is_swing).length,
      ozt = pts.filter(p => !p.is_in_zone).length,
      izw = pts.filter(p => p.is_in_zone && p.is_whiff).length,
      izs = pts.filter(p => p.is_in_zone && p.is_swing).length;
    return {
      name: n, code: pts[0].pitch_type, color: getPitchColor(n), count: c,
      avgVelo: avg1(pts.map(p => p.release_speed)),
      maxVelo: (() => { const v = pts.map(p => p.release_speed).filter(v => v != null); return v.length ? Math.max(...v).toFixed(1) : "—"; })(),
      avgSpin: avgInt(pts.map(p => p.release_spin_rate)),
      avgSpinEff: avgInt(pts.map(p => p.spin_efficiency)) + "%",
      avgIVB: avg1(pts.map(p => p.pfx_z)), avgHB: avg1(pts.map(p => p.pfx_x)),
      avgRelH: avg1(pts.map(p => p.release_pos_z)), avgRelS: avg1(pts.map(p => p.release_pos_x)),
      avgExt: avg1(pts.map(p => p.release_extension)), avgVAA: avg1(pts.map(p => p.vaa)),
      strikeRate: pct(st, c), zoneRate: pct(iz, c), cswRate: pct(cs + wh, c),
      calledStrikeRate: pct(cs, c), swStrRate: pct(wh, c), whiffRate: pct(wh, sw),
      chaseRate: pct(ozs, ozt), zoneWhiffRate: pct(izw, izs),
      gbRate: pct(gb, ip), fbRate: pct(fb, ip), barrelRate: pct(ba, ip),
      bipCount: ip,
      xSLG: avg3(pts.filter(p => p.estimated_slg_using_speedangle != null).map(p => p.estimated_slg_using_speedangle)),
      xwOBACON: avg3(pts.filter(p => p.estimated_woba_using_speedangle != null).map(p => p.estimated_woba_using_speedangle)),
      xwOBA: avg3(pts.filter(p => p.woba_value != null).map(p => p.woba_value)),
      expRunValue: pts.filter(p => p.delta_run_exp != null).map(p => p.delta_run_exp).reduce((a, b) => a + b, 0).toFixed(1),
      rv100: (() => { const rvPts = pts.filter(p => p.delta_run_exp != null); const total = rvPts.reduce((a, p) => a + p.delta_run_exp, 0); return rvPts.length > 0 ? ((total / rvPts.length) * 100).toFixed(1) : "—"; })(),
      rawPitches: pts,
      avgRelHNum: avgNum(pts.map(p => p.release_pos_z)),
      avgRelSNum: avgNum(pts.map(p => p.release_pos_x)),
    };
  });
  ptm.sort((a, b) => b.count - a.count);

  // Compute "All" summary row across all pitches
  const allPts = f;
  const ac = allPts.length, asw = allPts.filter(p => p.is_swing).length, awh = allPts.filter(p => p.is_whiff).length,
    aiz = allPts.filter(p => p.is_in_zone).length, acs = allPts.filter(p => p.is_called_strike).length,
    ast = allPts.filter(p => p.is_swing || p.is_called_strike).length,
    aip = allPts.filter(p => p.is_in_play).length, agb = allPts.filter(p => p.is_ground_ball).length,
    afb = allPts.filter(p => p.is_fly_ball).length, aba = allPts.filter(p => p.is_barrel).length,
    aozs = allPts.filter(p => !p.is_in_zone && p.is_swing).length,
    aozt = allPts.filter(p => !p.is_in_zone).length,
    aizw = allPts.filter(p => p.is_in_zone && p.is_whiff).length,
    aizs = allPts.filter(p => p.is_in_zone && p.is_swing).length;
  const allRow = {
    name: "All", code: "", color: C => C.accent, isAllRow: true, count: ac,
    avgVelo: avg1(allPts.map(p => p.release_speed)),
    maxVelo: (() => { const v = allPts.map(p => p.release_speed).filter(v => v != null); return v.length ? Math.max(...v).toFixed(1) : "—"; })(),
    avgSpin: avgInt(allPts.map(p => p.release_spin_rate)),
    avgIVB: avg1(allPts.map(p => p.pfx_z)), avgHB: avg1(allPts.map(p => p.pfx_x)),
    avgRelH: avg1(allPts.map(p => p.release_pos_z)), avgRelS: avg1(allPts.map(p => p.release_pos_x)),
    avgExt: avg1(allPts.map(p => p.release_extension)),
    avgVAA: avg1(allPts.map(p => p.vaa)),
    strikeRate: pct(ast, ac), zoneRate: pct(aiz, ac), cswRate: pct(acs + awh, ac),
    calledStrikeRate: pct(acs, ac), swStrRate: pct(awh, ac), whiffRate: pct(awh, asw),
    chaseRate: pct(aozs, aozt), zoneWhiffRate: pct(aizw, aizs),
    gbRate: pct(agb, aip), fbRate: pct(afb, aip), barrelRate: pct(aba, aip),
    bipCount: aip,
    xSLG: avg3(allPts.filter(p => p.estimated_slg_using_speedangle != null).map(p => p.estimated_slg_using_speedangle)),
    xwOBACON: avg3(allPts.filter(p => p.estimated_woba_using_speedangle != null).map(p => p.estimated_woba_using_speedangle)),
    xwOBA: avg3(allPts.filter(p => p.woba_value != null).map(p => p.woba_value)),
    expRunValue: allPts.filter(p => p.delta_run_exp != null).map(p => p.delta_run_exp).reduce((a, b) => a + b, 0).toFixed(1),
    rv100: (() => { const rvPts = allPts.filter(p => p.delta_run_exp != null); const total = rvPts.reduce((a, p) => a + p.delta_run_exp, 0); return rvPts.length > 0 ? ((total / rvPts.length) * 100).toFixed(1) : "—"; })(),
    rawPitches: allPts,
  };

  return {
    total: f.length, pitchTypeMetrics: ptm, allRow,
    avgRelH: avg1(pitches.map(p => p.release_pos_z)),
    avgRelS: avgNum(pitches.map(p => p.release_pos_x)),
    avgExt: avg1(pitches.map(p => p.release_extension)),
  };
};

const computeUsageSplits = (pitches, countState) => {
  const cf = COUNT_STATES[countState]?.counts;
  const f = cf ? pitches.filter(p => cf.includes(p.count)) : pitches;
  if (!f.length) return {};
  const vL = f.filter(p => p.batter_hand === "L");
  const vR = f.filter(p => p.batter_hand === "R");
  const bt = {};
  f.forEach(p => { if (!bt[p.pitch_name]) bt[p.pitch_name] = []; bt[p.pitch_name].push(p); });
  const s = {};
  Object.entries(bt).forEach(([n, pts]) => {
    s[n] = {
      vsL: vL.length > 0 ? Math.round((pts.filter(p => p.batter_hand === "L").length / vL.length) * 100) : 0,
      vsR: vR.length > 0 ? Math.round((pts.filter(p => p.batter_hand === "R").length / vR.length) * 100) : 0,
    };
  });
  return s;
};
// ─── Autocomplete (real MLB API search) ───
const AutocompleteInput = ({ value, onChange, onSelect, C }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [show, setShow] = useState(false);
  const [hl, setHl] = useState(-1);
  const ref = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (value.length < 2) { setSuggestions([]); return; }
    // Debounce: wait 300ms after user stops typing before searching
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchPitchers(value);
        const mapped = results.map(r => ({ id: r.id, name: r.name, team: r.team, display: `${r.name}${r.team ? ` (${r.team})` : ""}` }));
        setSuggestions(mapped);
        setShow(mapped.length > 0);
      } catch (e) {
        console.error("Search failed:", e);
      }
    }, 300);
    setHl(-1);
  }, [value]);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setShow(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const hk = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHl(h => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHl(h => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && hl >= 0) { e.preventDefault(); onSelect(suggestions[hl]); setShow(false); }
    else if (e.key === "Enter" && suggestions.length > 0) { onSelect(suggestions[0]); setShow(false); }
  };

  return (
    <div ref={ref} style={{ position: "relative", width: "280px", maxWidth: "100%" }}>
      <input
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "10px 14px", color: C.text, fontSize: "13px", fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" }}
        placeholder="Search pitcher name..." value={value} onChange={e => onChange(e.target.value)} onKeyDown={hk} onFocus={() => suggestions.length > 0 && setShow(true)}
      />
      {show && suggestions.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, background: C.surface, border: `1px solid ${C.border}`, borderRadius: "0 0 6px 6px", boxShadow: "0 8px 24px rgba(0,0,0,0.3)", maxHeight: "240px", overflowY: "auto" }}>
          {suggestions.map((s, i) => (
            <div key={s.id} style={{ padding: "8px 14px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", color: i === hl ? C.accent : C.text, background: i === hl ? C.accentGlow : "transparent" }}
              onMouseEnter={() => setHl(i)} onClick={() => { onSelect(s); setShow(false); }}>
              {s.name} {s.team && <span style={{ color: C.textDim, fontSize: "11px" }}>({s.team})</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Team Logo Helper ───
const TeamLogo = ({ abbr, logos, size = 20 }) => {
  const src = logos?.[abbr];
  if (!src) return null;
  return <img src={src} alt={abbr} style={{ width: size, height: size, objectFit: "contain" }} />;
};

// ─── Live Game Selector (real MLB API) ───
const LiveGameSelector = ({ onSelectPitcher, C, logos }) => {
  const [open, setOpen] = useState(false);
  const [sg, setSg] = useState(null);
  const [games, setGames] = useState([]);
  const [pitchers, setPitchers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    // Roll over at 8am Central Time
    const now = new Date();
    const ctNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
    if (ctNow.getHours() < 8) ctNow.setDate(ctNow.getDate() - 1);
    return `${ctNow.getFullYear()}-${String(ctNow.getMonth() + 1).padStart(2, "0")}-${String(ctNow.getDate()).padStart(2, "0")}`;
  });
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSg(null); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const loadGamesForDate = async (dateStr) => {
    setLoading(true);
    try {
      const g = await getLiveGames(dateStr);
      setGames(g);
    } catch (e) { console.error("Failed to load games:", e); }
    setLoading(false);
  };

  const handleOpen = async () => {
    const nowOpen = !open;
    setOpen(nowOpen);
    setSg(null);
    if (nowOpen) await loadGamesForDate(selectedDate);
  };

  const shiftDate = async (days) => {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + days);
    const newDate = d.toISOString().slice(0, 10);
    setSelectedDate(newDate);
    setSg(null);
    await loadGamesForDate(newDate);
  };

  const handleDateChange = async (e) => {
    const newDate = e.target.value;
    setSelectedDate(newDate);
    setSg(null);
    await loadGamesForDate(newDate);
  };

  const handleSelectGame = async (game) => {
    setSg(game);
    setLoading(true);
    try {
      const p = await getGamePitchers(game.game_pk);
      setPitchers(p);
    } catch (e) { console.error("Failed to load pitchers:", e); }
    setLoading(false);
  };

  const isFinal = g => g.status === "Final" || (g.detailed_status || "").toLowerCase().includes("final") || (g.detailed_status || "").toLowerCase().includes("game over");
  const isLive = g => (g.status === "Live" || g.status === "In Progress") && !isFinal(g);
  const sortedGames = [...games].sort((a, b) => {
    const order = g => isLive(g) ? 0 : isFinal(g) ? 2 : 1;
    return order(a) - order(b);
  });
  const allGames = sortedGames.length > 0 ? sortedGames : [];
  const today = (() => {
    const now = new Date();
    const ctNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
    if (ctNow.getHours() < 8) ctNow.setDate(ctNow.getDate() - 1);
    return `${ctNow.getFullYear()}-${String(ctNow.getMonth() + 1).padStart(2, "0")}-${String(ctNow.getDate()).padStart(2, "0")}`;
  })();
  const isToday = selectedDate === today;

  // Format display date
  const formatDate = (dateStr) => {
    if (dateStr === today) return "Today";
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={handleOpen} style={{ display: "flex", alignItems: "center", gap: "16px", background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px 20px", cursor: "pointer", fontFamily: "inherit" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {isToday && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px rgba(34,197,94,0.6)" }} />}
          <span style={{ fontSize: "12px", fontWeight: 700, color: C.accent, letterSpacing: "1px" }}>GAMES</span>
        </div>
        <span style={{ fontSize: "10px", color: C.textDim }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 200, marginTop: "4px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", boxShadow: "0 12px 40px rgba(0,0,0,0.4)", width: "min(420px, 92vw)", overflow: "hidden", maxHeight: "500px", overflowY: "auto" }}>
          {!sg ? (
            <>
              {/* Date navigation header */}
              <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <button onClick={() => shiftDate(-1)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: C.accent, fontWeight: 700, padding: "2px 8px", fontFamily: "inherit" }}>‹</button>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: C.text, letterSpacing: "0.5px" }}>{formatDate(selectedDate)}</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={handleDateChange}
                    style={{ width: "18px", height: "18px", opacity: 0.5, cursor: "pointer", border: "none", background: "transparent", colorScheme: C === themes.dark ? "dark" : "light" }}
                    title="Pick a date"
                  />
                </div>
                <button onClick={() => shiftDate(1)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: C.accent, fontWeight: 700, padding: "2px 8px", fontFamily: "inherit" }}>›</button>
              </div>
              <div style={{ padding: "6px 16px", borderBottom: `1px solid ${C.border}`, fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: C.textDim }}>
                {loading ? "Loading games..." : `${allGames.length} Game${allGames.length !== 1 ? "s" : ""}`}
              </div>
              {allGames.map(g => (
                <div key={g.game_pk} onClick={() => handleSelectGame(g)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", cursor: "pointer", borderBottom: `1px solid ${C.border}` }}
                  onMouseEnter={e => e.currentTarget.style.background = C.accentGlow} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <TeamLogo abbr={g.away_team} logos={logos} size={24} />
                    <span style={{ fontSize: "12px", color: C.textDim }}>@</span>
                    <TeamLogo abbr={g.home_team} logos={logos} size={24} />
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: C.text }}>{g.away_score} - {g.home_score}</div>
                    <div style={{ fontSize: "10px", color: isFinal(g) ? "#ef4444" : isLive(g) ? "#22c55e" : C.accent, fontWeight: isFinal(g) ? 700 : 400 }}>{isFinal(g) ? "Final" : (g.inning || g.detailed_status)}</div>
                  </div>
                </div>
              ))}
              {!loading && allGames.length === 0 && (
                <div style={{ padding: "20px 16px", textAlign: "center", fontSize: "12px", color: C.textDim }}>No games scheduled</div>
              )}
            </>
          ) : (
            <>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button onClick={() => setSg(null)} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontFamily: "inherit", fontSize: "11px", fontWeight: 600 }}>← Back</button>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <TeamLogo abbr={sg.away_team} logos={logos} size={18} />
                  <span style={{ fontSize: "12px", fontWeight: 700, color: C.text }}>{sg.away_team} @ {sg.home_team}</span>
                  <TeamLogo abbr={sg.home_team} logos={logos} size={18} />
                </div>
                <span style={{ fontSize: "10px", color: C.accent }}>{sg.inning || sg.detailed_status}</span>
              </div>
              <div style={{ padding: "8px 16px", fontSize: "9px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: C.textDim }}>
                {loading ? "Loading pitchers..." : "Select a Pitcher"}
              </div>
              {pitchers.map((p, i) => (
                <div key={p.id || i} onClick={() => { onSelectPitcher(p, sg); setOpen(false); setSg(null); }}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", cursor: "pointer", borderBottom: `1px solid ${C.border}` }}
                  onMouseEnter={e => e.currentTarget.style.background = C.accentGlow} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e" }} />
                    <span style={{ fontSize: "13px", fontWeight: 600, color: C.text }}>{p.name}</span>
                    <span style={{ fontSize: "10px", color: C.textDim }}>{p.side}</span>
                  </div>
                  <div style={{ fontSize: "11px", color: C.textMuted }}>{p.pitch_count}P</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const SortIcon = ({ active, dir }) => (
  <span style={{ marginLeft: "4px", opacity: active ? 1 : 0.3, fontSize: "8px" }}>{dir === "asc" ? "▲" : "▼"}</span>
);

// ─── Movement Plot ───
const MovementPlot = ({ pitchTypeMetrics, C, view: currentView }) => {
  const [showAvg, setShowAvg] = useState(false);
  const [mvHand, setMvHand] = useState("all");
  const grouped = {};
  let maxAbs = 0;
  pitchTypeMetrics.forEach(pt => {
    pt.rawPitches.forEach(p => {
      if (mvHand !== "all" && p.batter_hand !== mvHand) return;
      if (!grouped[p.pitch_name]) grouped[p.pitch_name] = { name: p.pitch_name, abbrev: PITCH_ABBREV[p.pitch_name] || p.pitch_type, color: pt.color, data: [] };
      grouped[p.pitch_name].data.push({
        x: p.pfx_x, y: p.pfx_z, name: p.pitch_name, color: pt.color,
        velo: p.release_speed, inning: p.inning, count: p.count, batter: p.batter_name,
        description: p.description, events: p.events,
        game_date: p.game_date || "",
      });
      if (Math.abs(p.pfx_x) > maxAbs) maxAbs = Math.abs(p.pfx_x);
      if (Math.abs(p.pfx_z) > maxAbs) maxAbs = Math.abs(p.pfx_z);
    });
  });

  // Compute average dots
  const avgDots = Object.values(grouped).map(g => {
    const xs = g.data.map(d => d.x).filter(v => v != null);
    const ys = g.data.map(d => d.y).filter(v => v != null);
    const avgX = xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    const avgY = ys.length > 0 ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
    return { x: avgX, y: avgY, name: g.name, abbrev: g.abbrev, color: g.color, isAvg: true, count: g.data.length };
  });

  const axisMax = 25;
  const ticks = [-25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25];
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: C.textDim }}>Pitch Movement Profile</div>
        <div style={{ display: "flex", gap: "4px" }}>
          {[{ key: "all", label: "All" }, { key: "L", label: "vs LHH" }, { key: "R", label: "vs RHH" }].map(t => (
            <button key={t.key} onClick={() => setMvHand(t.key)} style={{
              background: mvHand === t.key ? C.accentGlow : "transparent",
              border: `1px solid ${mvHand === t.key ? C.accent : C.border}`,
              borderRadius: "4px", padding: "4px 10px",
              color: mvHand === t.key ? C.accent : C.textDim,
              fontSize: "10px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>{t.label}</button>
          ))}
        </div>
      </div>
      <div style={{ width: "100%", aspectRatio: "1/1", maxHeight: "440px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 15 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis type="number" dataKey="x" domain={[-axisMax, axisMax]} tick={{ fill: C.textDim, fontSize: 10 }} ticks={ticks} label={{ value: "Horizontal Break (in)", position: "bottom", fill: C.textDim, fontSize: 10, dy: 12 }} />
            <YAxis type="number" dataKey="y" domain={[-axisMax, axisMax]} tick={{ fill: C.textDim, fontSize: 10 }} ticks={ticks} label={{ value: "Induced Vertical Break (in)", angle: -90, position: "insideLeft", fill: C.textDim, fontSize: 10, dx: -5 }} />
            <ReferenceLine x={0} stroke={C.borderLight} />
            <ReferenceLine y={0} stroke={C.borderLight} />
            <defs>
              <filter id="avgShadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.35" />
              </filter>
            </defs>
            <Tooltip content={({ payload }) => {
              if (!payload?.length) return null;
              const d = payload[0].payload;
              if (d.isAvg) return (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "8px 12px", fontSize: "11px", minWidth: "140px" }}>
                  <div style={{ color: d.color, fontWeight: 700, marginBottom: "4px" }}>{d.name} — Avg</div>
                  <div style={{ color: C.textMuted, lineHeight: 1.6 }}>
                    <div>IVB: {d.y.toFixed(1)}" | HB: {d.x.toFixed(1)}"</div>
                    <div>{d.count} pitches</div>
                  </div>
                </div>
              );
              return (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "8px 12px", fontSize: "11px", minWidth: "160px" }}>
                  <div style={{ color: d.color, fontWeight: 700, marginBottom: "4px" }}>{d.name} — {d.velo != null ? d.velo.toFixed(1) : "—"} mph</div>
                  <div style={{ color: C.textMuted, lineHeight: 1.6 }}>
                    <div>IVB: {d.y != null ? d.y.toFixed(1) : "—"}" | HB: {d.x != null ? d.x.toFixed(1) : "—"}"</div>
                    {d.batter && <div>vs. {d.batter}</div>}
                    {d.game_date && <div>{d.game_date}</div>}
                    <div>Inning {d.inning} · Count: {d.count}</div>
                    {d.description && <div>Result: {({ ball: "Ball", swinging_strike: "Swinging Strike", called_strike: "Called Strike", foul: "Foul", hit_into_play: d.events ? d.events.replace(/_/g, " ") : "In Play" }[d.description] || d.description)}</div>}
                  </div>
                </div>
              );
            }} />
            {Object.values(grouped).map(g => (
              <Scatter key={g.name} name={g.name} data={g.data} fill={g.color} r={3.3}
                isAnimationActive={false}
                shape={(props) => (
                  <circle cx={props.cx} cy={props.cy} r={3.3} fill={g.color} fillOpacity={0.8} stroke="#000" strokeWidth={0.5} strokeOpacity={0.45} />
                )}
              />
            ))}
            {showAvg && (
              <Scatter name="averages" data={avgDots} fill="#000" opacity={1} r={9} shape={(props) => {
                const { cx, cy, payload } = props;
                return (
                  <circle
                    cx={cx} cy={cy} r={9}
                    fill={payload.color} fillOpacity={0.95}
                    stroke="#000" strokeWidth={2}
                    filter="url(#avgShadow)"
                  />
                );
              }} />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: "flex", alignItems: "center", marginTop: "8px" }}>
        <div style={{ display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap", flex: 1 }}>
          {Object.values(grouped).map(g => (
            <div key={g.name} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: C.textMuted }}>
              <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: g.color }} />{g.abbrev}
            </div>
          ))}
        </div>
        <button onClick={() => setShowAvg(!showAvg)} style={{
          display: "flex", alignItems: "center", gap: "5px", background: showAvg ? C.accentGlow : "transparent",
          border: `1px solid ${showAvg ? C.accent : C.border}`, borderRadius: "4px", padding: "3px 10px",
          color: showAvg ? C.accent : C.textDim, fontSize: "10px", fontWeight: 600, cursor: "pointer",
          fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0,
        }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: showAvg ? C.accent : C.textDim, border: "1.5px solid #000", display: "inline-block" }} />
          Avg.
        </button>
      </div>
    </div>
  );
};

// ─── Usage Split with Count Slider ───
const UsageSplitChart = ({ pitchTypeMetrics, pitchData, C }) => {
  const [countState, setCountState] = useState("all");
  const usageSplits = useMemo(() => computeUsageSplits(pitchData, countState), [pitchData, countState]);
  const ordered = pitchTypeMetrics.map(pt => ({
    name: pt.name, code: pt.code || PITCH_ABBREV[pt.name] || "?", color: pt.color,
    vsL: usageSplits[pt.name]?.vsL || 0, vsR: usageSplits[pt.name]?.vsR || 0,
  }));
  const countKeys = Object.keys(COUNT_STATES);
  const currentIdx = countKeys.indexOf(countState);
  const MAX_SCALE = 80; // bars fill completely at 80%+

  const PillBar = ({ value, color, align }) => {
    const widthPct = value > 0 ? Math.min((value / MAX_SCALE) * 100, 100) : 0;
    const barColor = value > 0 ? color : "transparent";
    return (
      <div style={{ flex: 1, height: "36px", borderRadius: "18px", background: C.surfaceAlt, overflow: "hidden", display: "flex", justifyContent: align === "left" ? "flex-start" : "flex-end" }}>
        <div style={{ width: `${Math.max(widthPct, value > 0 ? 5 : 0)}%`, height: "100%", borderRadius: "18px", background: barColor, opacity: 0.85, transition: "width 0.4s ease" }} />
      </div>
    );
  };

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "20px", display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: C.textDim, marginBottom: "20px" }}>Pitch Usage by Batter Hand</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 60px 40px 1fr", alignItems: "center", marginBottom: "12px", paddingBottom: "8px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ textAlign: "center", fontSize: "11px", fontWeight: 700, letterSpacing: "1.5px", color: C.accent }}>vs. LHH</div>
        <div />
        <div style={{ textAlign: "center", fontSize: "11px", fontWeight: 700, letterSpacing: "1.5px", color: C.textDim }}>Pitch</div>
        <div />
        <div style={{ textAlign: "center", fontSize: "11px", fontWeight: 700, letterSpacing: "1.5px", color: C.accent }}>vs. RHH</div>
      </div>
      <div style={{ flex: 1 }}>
        {ordered.map(p => (
          <div key={p.name} style={{ display: "grid", gridTemplateColumns: "1fr 40px 60px 40px 1fr", alignItems: "center", padding: "6px 0", gap: "0" }}>
            <PillBar value={p.vsL} color={p.color} align="right" />
            <span style={{ fontSize: "12px", fontWeight: 700, color: C.text, textAlign: "right", paddingRight: "4px" }}>{p.vsL}%</span>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: p.color, color: "#fff", fontWeight: 700, fontSize: "11px", borderRadius: "6px", padding: "5px 8px", minWidth: "40px", height: "26px", boxSizing: "border-box", textShadow: "0 1px 2px rgba(0,0,0,0.3)", whiteSpace: "nowrap", lineHeight: 1 }}>{p.code || "?"}</span>
            </div>
            <span style={{ fontSize: "12px", fontWeight: 700, color: C.text, textAlign: "left", paddingLeft: "4px" }}>{p.vsR}%</span>
            <PillBar value={p.vsR} color={p.color} align="left" />
          </div>
        ))}
      </div>
      {/* Count State Slider */}
      <div style={{ marginTop: "20px", borderTop: `1px solid ${C.border}`, paddingTop: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
          <div style={{ position: "absolute", top: "50%", left: "10%", right: "10%", height: "3px", background: C.border, borderRadius: "2px", transform: "translateY(-50%)" }} />
          <div style={{ position: "absolute", top: "50%", left: "10%", height: "3px", background: C.accent, borderRadius: "2px", transform: "translateY(-50%)", width: `${(currentIdx / (countKeys.length - 1)) * 80}%`, transition: "width 0.2s" }} />
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "0 10%", position: "relative", zIndex: 1 }}>
            {countKeys.map((key, i) => (
              <div key={key} onClick={() => setCountState(key)} style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", gap: "8px" }}>
                <div style={{ width: i === currentIdx ? "14px" : "10px", height: i === currentIdx ? "14px" : "10px", borderRadius: "50%", background: i <= currentIdx ? C.accent : C.border, border: i === currentIdx ? `2px solid ${C.text}` : "2px solid transparent", transition: "all 0.2s" }} />
                <span style={{ fontSize: "9px", fontWeight: i === currentIdx ? 700 : 500, color: i === currentIdx ? C.accent : C.textDim, whiteSpace: "nowrap" }}>{COUNT_STATES[key].label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Release Point ───
const ReleasePointPlot = ({ pitchTypeMetrics, avgRelH, avgRelS, avgExt, C, pitcherHand }) => {
  const rh = parseFloat(avgRelH) || 0;
  const rs = typeof avgRelS === "number" ? avgRelS : parseFloat(avgRelS) || 0;
  const dots = pitchTypeMetrics.map(pt => ({ x: pt.avgRelSNum, y: pt.avgRelHNum, name: pt.name, color: pt.color }));
  const mlbAvg = pitcherHand === "L" ? { x: 2.08, y: 5.78 } : { x: -1.88, y: 5.76 };
  const avgDot = [{ x: mlbAvg.x, y: mlbAvg.y, name: "MLB Avg", isMLBAvg: true }];
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "20px" }}>
      <div style={{ fontSize: "14px", fontWeight: 700, color: C.text, textAlign: "center", marginBottom: "12px" }}>Release Point</div>
      <div style={{ display: "flex", justifyContent: "center", gap: "16px", marginBottom: "12px", flexWrap: "wrap" }}>
          <div style={{ background: C.yellow + "22", border: `1px solid ${C.yellow}55`, borderRadius: "4px", padding: "4px 10px", fontSize: "10px", fontWeight: 600, color: C.yellow }}>Avg Release Height: {avgRelH} ft</div>
          <div style={{ background: C.yellow + "22", border: `1px solid ${C.yellow}55`, borderRadius: "4px", padding: "4px 10px", fontSize: "10px", fontWeight: 600, color: C.yellow }}>Avg Extension: {avgExt} ft</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0 30px 0 50px", marginBottom: "2px" }}>
          <span style={{ fontSize: "9px", color: C.textDim, fontStyle: "italic" }}>1B Side</span>
          <span style={{ fontSize: "9px", color: C.textDim, fontStyle: "italic" }}>3B Side</span>
        </div>
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart margin={{ top: 5, right: 20, bottom: 30, left: 15 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis type="number" dataKey="x" domain={[-4, 4]} reversed={true} tick={{ fill: C.textDim, fontSize: 10 }} label={{ value: "Release Side (ft)", position: "bottom", fill: C.textDim, fontSize: 10, dy: 12 }} />
            <YAxis type="number" dataKey="y" domain={[0, 7.6]} tick={{ fill: C.textDim, fontSize: 10 }} label={{ value: "Release Height (ft)", angle: -90, position: "insideLeft", fill: C.textDim, fontSize: 10, dx: -5 }} />
            <ReferenceLine x={0} stroke={C.borderLight} strokeDasharray="4 4" />
            <ReferenceLine y={rh} stroke={C.yellow} strokeWidth={1.5} />
            <ReferenceLine x={rs} stroke={C.yellow} strokeWidth={1.5} />
            <Tooltip content={({ payload }) => {
              if (!payload?.length) return null;
              const d = payload[0].payload;
              if (d.isMLBAvg) return (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "8px 12px", fontSize: "11px" }}>
                  <div style={{ fontWeight: 700, color: C.textMuted }}>MLB Avg ({pitcherHand === "L" ? "LHP" : "RHP"})</div>
                  <div style={{ color: C.textDim }}>Side: {d.x.toFixed(2)}ft | Height: {d.y.toFixed(2)}ft</div>
                </div>
              );
              return (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "8px 12px", fontSize: "11px" }}>
                  <div style={{ color: d.color, fontWeight: 700 }}>{d.name}</div>
                  <div style={{ color: C.textMuted }}>Side: {d.x.toFixed(1)}ft | Height: {d.y.toFixed(1)}ft</div>
                </div>
              );
            }} />
            <Scatter data={dots} r={12}>
              {dots.map((d, i) => <Cell key={i} fill={d.color} stroke="#000" strokeWidth={1.5} />)}
            </Scatter>
            <Scatter data={avgDot} r={14} shape={(props) => {
              const { cx, cy } = props;
              return (
                <g>
                  <circle cx={cx} cy={cy} r={14} fill="none" stroke={C.textMuted} strokeWidth={2} strokeDasharray="3 2" />
                  <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
                    fill={C.textMuted} fontSize="7" fontWeight="700" fontFamily="inherit" letterSpacing="0.5">AVG</text>
                </g>
              );
            }} />
          </ScatterChart>
        </ResponsiveContainer>
    </div>
  );
};

// ─── Batter SVG (realistic stance with bat) ───
const BatterSilhouette = ({ side, color }) => {
  // Drawn as right-handed batter; flip for left-handed
  const isLeft = side === "left";
  return (
    <svg width="80" height="180" viewBox="0 0 80 180" style={{ transform: isLeft ? "scaleX(-1)" : "none" }}>
      {/* Helmet */}
      <ellipse cx="35" cy="20" rx="14" ry="16" fill={color} opacity="0.85" />
      <ellipse cx="32" cy="16" rx="15" ry="10" fill={color} opacity="0.65" />
      {/* Face shadow */}
      <ellipse cx="38" cy="24" rx="6" ry="8" fill={color} opacity="0.5" />
      {/* Neck */}
      <rect x="30" y="33" width="10" height="10" rx="3" fill={color} opacity="0.8" />
      {/* Torso */}
      <path d="M20 43 Q24 40 40 40 Q50 40 54 43 L56 90 Q50 94 38 94 Q24 94 18 90 Z" fill={color} opacity="0.75" />
      {/* Belt */}
      <rect x="18" y="86" width="38" height="6" rx="2" fill={color} opacity="0.55" />
      {/* Back shoulder / arm leading to hands */}
      <path d="M20 45 Q10 50 12 62 Q14 68 18 65" fill={color} opacity="0.7" />
      {/* Front shoulder / arm */}
      <path d="M54 45 Q62 50 58 60 Q56 66 52 58" fill={color} opacity="0.7" />
      {/* Hands gripping bat */}
      <ellipse cx="56" cy="52" rx="5" ry="5" fill={color} opacity="0.85" />
      <ellipse cx="58" cy="48" rx="4" ry="4" fill={color} opacity="0.8" />
      {/* Bat (angled upward, ready stance) */}
      <line x1="58" y1="48" x2="68" y2="12" stroke={color} strokeWidth="4" strokeLinecap="round" opacity="0.85" />
      <line x1="68" y1="12" x2="72" y2="4" stroke={color} strokeWidth="5" strokeLinecap="round" opacity="0.7" />
      {/* Front leg (stride leg, slightly forward) */}
      <path d="M38 92 Q42 120 40 145 Q39 155 36 158" fill={color} opacity="0.7" />
      {/* Front foot */}
      <ellipse cx="35" cy="161" rx="10" ry="4" fill={color} opacity="0.55" />
      {/* Back leg (bent, weight loaded) */}
      <path d="M28 92 Q22 115 26 140 Q27 150 30 152" fill={color} opacity="0.7" />
      {/* Back foot */}
      <ellipse cx="30" cy="155" rx="9" ry="4" fill={color} opacity="0.55" />
    </svg>
  );
};

// ─── Home Plate SVG (pitcher POV: point faces UP toward pitcher, centered) ───
const PlateSVG = ({ color }) => (
  <svg width="80" height="48" viewBox="0 0 80 48">
    <polygon
      points="8,48 72,48 76,26 40,2 4,26"
      fill={color} fillOpacity="0.2"
      stroke={color} strokeWidth="2.5" strokeOpacity="0.5"
      strokeLinejoin="round"
    />
  </svg>
);

// ─── Heatmap Canvas renderer ───
const HeatmapCanvas = ({ pitches, width, height, C }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = width, h = height;
    canvas.width = w; canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    if (!pitches.length) return;
    const toCanvasX = (x) => ((x + 2.5) / 5) * w;
    const toCanvasY = (y) => (1 - y / 5) * h;
    const gridW = 200, gridH = 200;
    const grid = new Float32Array(gridW * gridH);
    const bandwidth = 0.25, bw2 = bandwidth * bandwidth;
    for (const p of pitches) {
      if (p.plate_x == null || p.plate_z == null) continue;
      const gxC = ((p.plate_x + 2.5) / 5) * gridW;
      const gyC = ((1 - p.plate_z / 5)) * gridH;
      const rad = Math.ceil((bandwidth / 5) * gridW * 3);
      for (let gy = Math.max(0, Math.floor(gyC - rad)); gy <= Math.min(gridH - 1, Math.ceil(gyC + rad)); gy++) {
        for (let gx = Math.max(0, Math.floor(gxC - rad)); gx <= Math.min(gridW - 1, Math.ceil(gxC + rad)); gx++) {
          const dx = (gx / gridW) * 5 - 2.5 - p.plate_x, dy = (1 - gy / gridH) * 5 - p.plate_z;
          grid[gy * gridW + gx] += Math.exp(-(dx * dx + dy * dy) / (2 * bw2));
        }
      }
    }
    let maxVal = 0;
    for (let i = 0; i < grid.length; i++) if (grid[i] > maxVal) maxVal = grid[i];
    if (maxVal === 0) return;
    const colorRamp = (t) => {
      if (t < 0.2) { const s = t / 0.2; return [0, Math.round(s * 200), 255]; }
      if (t < 0.4) { const s = (t - 0.2) / 0.2; return [0, 200 + Math.round(55 * s), Math.round(255 * (1 - s))]; }
      if (t < 0.6) { const s = (t - 0.4) / 0.2; return [Math.round(255 * s), 255, 0]; }
      if (t < 0.8) { const s = (t - 0.6) / 0.2; return [255, Math.round(255 * (1 - s * 0.5)), 0]; }
      const s = (t - 0.8) / 0.2; return [255, Math.round(128 * (1 - s)), 0];
    };
    const imgData = ctx.createImageData(w, h);
    // Fill background with deep blue (matches low-frequency areas in reference image)
    for (let i = 0; i < imgData.data.length; i += 4) {
      imgData.data[i] = 0; imgData.data[i + 1] = 0; imgData.data[i + 2] = 200; imgData.data[i + 3] = 200;
    }
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const gxf = (px / w) * (gridW - 1), gyf = (py / h) * (gridH - 1);
        const gx0 = Math.floor(gxf), gy0 = Math.floor(gyf);
        const gx1 = Math.min(gx0 + 1, gridW - 1), gy1 = Math.min(gy0 + 1, gridH - 1);
        const fx = gxf - gx0, fy = gyf - gy0;
        const val = (grid[gy0 * gridW + gx0] * (1 - fx) * (1 - fy) + grid[gy0 * gridW + gx1] * fx * (1 - fy) + grid[gy1 * gridW + gx0] * (1 - fx) * fy + grid[gy1 * gridW + gx1] * fx * fy) / maxVal;
        const idx = (py * w + px) * 4;
        // Always paint with the ramp — low values get blue, higher values warm up
        const t = Math.pow(Math.min(val, 1), 0.7);
        const [r, g, b] = colorRamp(t);
        imgData.data[idx] = r; imgData.data[idx + 1] = g; imgData.data[idx + 2] = b;
        imgData.data[idx + 3] = 220;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = 2;
    ctx.strokeRect(toCanvasX(-0.83), toCanvasY(3.5), toCanvasX(0.83) - toCanvasX(-0.83), toCanvasY(1.5) - toCanvasY(3.5));
    const pcx = toCanvasX(0), pby = toCanvasY(0), phw = (toCanvasX(0.83) - toCanvasX(-0.83)) / 2;
    ctx.beginPath(); ctx.moveTo(pcx - phw, pby); ctx.lineTo(pcx + phw, pby);
    ctx.lineTo(pcx + phw * 0.88, pby - 8); ctx.lineTo(pcx, pby - 16); ctx.lineTo(pcx - phw * 0.88, pby - 8);
    ctx.closePath(); ctx.fillStyle = "rgba(120,120,120,0.15)"; ctx.fill();
    ctx.strokeStyle = "rgba(120,120,120,0.5)"; ctx.lineWidth = 1.5; ctx.stroke();
  }, [pitches, width, height]);
  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", borderRadius: "4px" }} />;
};

// Batter silhouette images (white on transparent, from pitcher POV)
const _lhhImg = new Image(); _lhhImg.src = "data:image/png;base64,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";
const _rhhImg = new Image(); _rhhImg.src = "data:image/png;base64,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";

// ─── Gaussian KDE Heatmap Canvas (cinematic style) ───
// Approximation of xwOBA from exit velocity + launch angle when Savant data isn't available
const approxXwoba = (ev, la) => {
  if (ev == null || la == null) return 0.25;
  // Barrel zone (matches our Statcast table)
  if (ev >= 98 && la >= 8 && la <= 50) return Math.min(1.8, 0.9 + (ev - 98) * 0.05);
  // Hard line drives
  if (ev >= 95 && la >= 10 && la <= 25) return 0.7 + (ev - 95) * 0.03;
  // Medium line drives
  if (la >= 10 && la <= 25) return 0.3 + Math.max(0, ev - 80) * 0.015;
  // Fly balls
  if (la > 25 && la <= 50) return 0.15 + Math.max(0, ev - 85) * 0.02;
  // Hard grounders
  if (ev >= 95 && la < 10 && la >= -10) return 0.35;
  // Soft grounders
  if (la < 10 && la >= -10) return 0.15 + Math.max(0, ev - 70) * 0.005;
  // Popups
  if (la > 50) return 0.02;
  return 0.1;
};

const GaussianHeatmapCanvas = ({ pitches, width, height, mode, hand, granular = false }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = width, h = height;
    canvas.width = w; canvas.height = h;
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(0, 0, w, h);

    // Coordinate conversion: pitcher POV (negate plate_x)
    const toCanvasX = (x) => ((-x + 2.5) / 5) * w;
    const toCanvasY = (y) => (1 - y / 5) * h;

    if (!pitches.length) return;

    // Granular: finer grid (300x300 vs 200x200) + tighter Gaussian (smaller sigma).
    // This produces sharper, more localized hot spots vs the smoother default view.
    const gridW = granular ? 300 : 200;
    const gridH = granular ? 300 : 200;
    const grid = new Float32Array(gridW * gridH);
    const sigma = granular ? (mode === "damage" ? 0.20 : 0.17) : (mode === "damage" ? 0.35 : 0.30);
    const bw2 = sigma * sigma;

    // Stamp each pitch onto the grid (negate plate_x for pitcher POV)
    for (const p of pitches) {
      if (p.plate_x == null || p.plate_z == null) continue;
      let weight = 1.0;
      if (mode === "damage") {
        weight = p.estimated_woba_using_speedangle || approxXwoba(p.launch_speed, p.launch_angle);
      }
      const px = -p.plate_x; // Flip for pitcher POV
      const gxC = ((px + 2.5) / 5) * gridW;
      const gyC = (1 - p.plate_z / 5) * gridH;
      const rad = Math.ceil((sigma / 5) * gridW * 3);
      for (let gy = Math.max(0, Math.floor(gyC - rad)); gy <= Math.min(gridH - 1, Math.ceil(gyC + rad)); gy++) {
        for (let gx = Math.max(0, Math.floor(gxC - rad)); gx <= Math.min(gridW - 1, Math.ceil(gxC + rad)); gx++) {
          const dx = (gx / gridW) * 5 - 2.5 - px;
          const dy = (1 - gy / gridH) * 5 - p.plate_z;
          grid[gy * gridW + gx] += weight * Math.exp(-(dx * dx + dy * dy) / (2 * bw2));
        }
      }
    }

    let maxVal = 0;
    for (let i = 0; i < grid.length; i++) if (grid[i] > maxVal) maxVal = grid[i];
    if (maxVal === 0) return;

    // Color ramps
    const freqRamp = (t) => {
      if (t < 0.15) { const s = t / 0.15; return [0, 0, Math.round(80 * s), Math.round(180 * s)]; }
      if (t < 0.3) { const s = (t - 0.15) / 0.15; return [0, Math.round(100 * s), 80 + Math.round(175 * s), 180 + Math.round(55 * s)]; }
      if (t < 0.5) { const s = (t - 0.3) / 0.2; return [0, 100 + Math.round(155 * s), 255 - Math.round(100 * s), 235]; }
      if (t < 0.7) { const s = (t - 0.5) / 0.2; return [Math.round(255 * s), 255, Math.round(155 * (1 - s)), 240]; }
      if (t < 0.85) { const s = (t - 0.7) / 0.15; return [255, Math.round(255 * (1 - s * 0.6)), 0, 245]; }
      const s = (t - 0.85) / 0.15; return [255, Math.round(100 * (1 - s)), 0, 250];
    };
    const intensityRamp = (t) => {
      // Blue (cold) → white (neutral) → red (hot) — used for whiffs AND damage
      if (t < 0.15) return [0, 0, 0, Math.round(60 * (t / 0.15))];
      if (t < 0.4) { const s = (t - 0.15) / 0.25; return [Math.round(40 * s), Math.round(80 * s), Math.round(200 * s), 60 + Math.round(160 * s)]; }
      if (t < 0.55) { const s = (t - 0.4) / 0.15; return [40 + Math.round(200 * s), 80 + Math.round(175 * s), 200 + Math.round(55 * s), 220 + Math.round(20 * s)]; }
      if (t < 0.7) { const s = (t - 0.55) / 0.15; return [240 + Math.round(15 * s), 255 - Math.round(30 * s), 255 - Math.round(60 * s), 240]; }
      const s = (t - 0.7) / 0.3; return [255, Math.round(225 * (1 - s)), Math.round(195 * (1 - s)), 240 + Math.round(10 * s)];
    };
    const ramp = mode === "frequency" ? freqRamp : intensityRamp;

    const imgData = ctx.createImageData(w, h);
    for (let i = 0; i < imgData.data.length; i += 4) {
      imgData.data[i] = 10; imgData.data[i + 1] = 10; imgData.data[i + 2] = 18; imgData.data[i + 3] = 255;
    }
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const gxf = (px / w) * (gridW - 1), gyf = (py / h) * (gridH - 1);
        const gx0 = Math.floor(gxf), gy0 = Math.floor(gyf);
        const gx1 = Math.min(gx0 + 1, gridW - 1), gy1 = Math.min(gy0 + 1, gridH - 1);
        const fx = gxf - gx0, fy = gyf - gy0;
        const raw = grid[gy0 * gridW + gx0] * (1 - fx) * (1 - fy) + grid[gy0 * gridW + gx1] * fx * (1 - fy) + grid[gy1 * gridW + gx0] * (1 - fx) * fy + grid[gy1 * gridW + gx1] * fx * fy;
        const val = raw / maxVal;
        const t = Math.pow(Math.min(val, 1), 0.6);
        const [r, g, b, a] = ramp(t);
        const idx = (py * w + px) * 4;
        const aF = a / 255;
        imgData.data[idx] = Math.round(10 * (1 - aF) + r * aF);
        imgData.data[idx + 1] = Math.round(10 * (1 - aF) + g * aF);
        imgData.data[idx + 2] = Math.round(18 * (1 - aF) + b * aF);
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Re-draw batter images ON TOP of heatmap
    // Scale large; push down so feet are at canvas bottom (image has padding below feet)
    const imgH2 = h * 1.6;
    const imgW2 = imgH2 * (494 / 498);
    const batterTopY = h - imgH2 + h * 0.12; // push down to account for padding below feet in PNG
    const edgeOffset = w * 0.12; // push batters away from center
    if ((hand === "all" || hand === "L") && _lhhImg.complete) {
      ctx.globalAlpha = 0.45;
      ctx.drawImage(_lhhImg, toCanvasX(2.5) - edgeOffset, batterTopY, imgW2, imgH2);
      ctx.globalAlpha = 1.0;
    }
    if ((hand === "all" || hand === "R") && _rhhImg.complete) {
      ctx.globalAlpha = 0.45;
      ctx.drawImage(_rhhImg, w - imgW2 + edgeOffset, batterTopY, imgW2, imgH2);
      ctx.globalAlpha = 1.0;
    }

    // Strike zone in white
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1.5;
    ctx.strokeRect(toCanvasX(0.83), toCanvasY(3.5), toCanvasX(-0.83) - toCanvasX(0.83), toCanvasY(1.5) - toCanvasY(3.5));
    // Home plate (filled white + stroke)
    const pcx = toCanvasX(0), pby = toCanvasY(0), phw = Math.abs(toCanvasX(0.83) - toCanvasX(-0.83)) / 2;
    ctx.beginPath(); ctx.moveTo(pcx - phw, pby); ctx.lineTo(pcx + phw, pby);
    ctx.lineTo(pcx + phw * 0.88, pby - 6); ctx.lineTo(pcx, pby - 12); ctx.lineTo(pcx - phw * 0.88, pby - 6);
    ctx.closePath(); ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1.5; ctx.stroke();
  }, [pitches, width, height, mode, hand, granular]);
  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", borderRadius: "4px" }} />;
};

// ─── Pitch Location Plot ───
const PitchLocationPlot = ({ pitchData, pitchTypeMetrics, C }) => {
  const [locHand, setLocHand] = useState("all");
  const [viewMode, setViewMode] = useState("dots");
  const [heatPitchFilter, setHeatPitchFilter] = useState("all");
  const heatContainerRef = useRef(null);
  const [heatSize, setHeatSize] = useState({ w: 400, h: 400 });

  useEffect(() => {
    if (!heatContainerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setHeatSize({ w: Math.round(width), h: Math.round(width) });
    });
    ro.observe(heatContainerRef.current);
    return () => ro.disconnect();
  }, [viewMode]);

  const filtered = useMemo(() => {
    if (!pitchData) return [];
    const f = locHand === "all" ? pitchData : pitchData.filter(p => p.batter_hand === locHand);
    return f.map(p => ({
      x: p.plate_x, y: p.plate_z, name: p.pitch_name, color: getPitchColor(p.pitch_name),
      code: p.pitch_type, velo: p.release_speed, count: p.count,
      batter: p.batter_name, inning: p.inning, description: p.description, hand: p.batter_hand,
    }));
  }, [pitchData, locHand]);

  const heatFiltered = useMemo(() => {
    if (!pitchData) return [];
    let f = locHand === "all" ? pitchData : pitchData.filter(p => p.batter_hand === locHand);
    if (heatPitchFilter !== "all") f = f.filter(p => p.pitch_type === heatPitchFilter);
    return f;
  }, [pitchData, locHand, heatPitchFilter]);

  const descLabel = (d) => ({ ball: "Ball", swinging_strike: "Swinging Strike", called_strike: "Called Strike", foul: "Foul", hit_into_play: "In Play" }[d] || d);

  const availPitchTypes = useMemo(() => {
    if (!pitchTypeMetrics) return [];
    return pitchTypeMetrics.map(pt => ({ code: pt.code || PITCH_ABBREV[pt.name] || "?", name: pt.name, color: pt.color }));
  }, [pitchTypeMetrics]);

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ fontSize: "14px", fontWeight: 700, color: C.text }}>Pitch Locations</div>
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <button onClick={() => setViewMode("dots")} style={{ background: viewMode === "dots" ? C.accentGlow : "transparent", border: `1px solid ${viewMode === "dots" ? C.accent : C.border}`, borderRadius: "4px", padding: "4px 10px", color: viewMode === "dots" ? C.accent : C.textDim, fontSize: "10px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Dots</button>
          <button onClick={() => setViewMode("heatmap")} style={{ background: viewMode === "heatmap" ? C.accentGlow : "transparent", border: `1px solid ${viewMode === "heatmap" ? C.accent : C.border}`, borderRadius: "4px", padding: "4px 10px", color: viewMode === "heatmap" ? C.accent : C.textDim, fontSize: "10px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Heatmap</button>
          <span style={{ width: "1px", height: "16px", background: C.border, margin: "0 4px" }} />
          {[{ key: "all", label: "All" }, { key: "L", label: "vs LHH" }, { key: "R", label: "vs RHH" }].map(t => (
            <button key={t.key} onClick={() => setLocHand(t.key)} style={{ background: locHand === t.key ? C.accentGlow : "transparent", border: `1px solid ${locHand === t.key ? C.accent : C.border}`, borderRadius: "4px", padding: "4px 10px", color: locHand === t.key ? C.accent : C.textDim, fontSize: "10px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{t.label}</button>
          ))}
        </div>
      </div>

      {viewMode === "heatmap" && (
        <div style={{ display: "flex", gap: "4px", marginBottom: "12px", flexWrap: "wrap" }}>
          <button onClick={() => setHeatPitchFilter("all")} style={{ background: heatPitchFilter === "all" ? C.accentGlow : "transparent", border: `1px solid ${heatPitchFilter === "all" ? C.accent : C.border}`, borderRadius: "4px", padding: "3px 10px", color: heatPitchFilter === "all" ? C.accent : C.textDim, fontSize: "10px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>All</button>
          {availPitchTypes.map(pt => (
            <button key={pt.code} onClick={() => setHeatPitchFilter(pt.code)} style={{ background: heatPitchFilter === pt.code ? pt.color + "22" : "transparent", border: `1px solid ${heatPitchFilter === pt.code ? pt.color : C.border}`, borderRadius: "4px", padding: "3px 10px", color: heatPitchFilter === pt.code ? pt.color : C.textDim, fontSize: "10px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{pt.code}</button>
          ))}
          <span style={{ fontSize: "10px", color: C.textDim, alignSelf: "center", marginLeft: "8px" }}>{heatFiltered.length} pitches</span>
        </div>
      )}

      {viewMode === "dots" && (
        <>
          <div style={{ position: "relative" }}>
            <ResponsiveContainer width="100%" height={480}>
              <ScatterChart margin={{ top: 10, right: 40, bottom: 40, left: 40 }}>
                <CartesianGrid stroke="none" />
                <XAxis type="number" dataKey="x" domain={[-2.5, 2.5]} tick={{ fill: C.textDim, fontSize: 10 }} ticks={[-2, -1, 0, 1, 2]} label={{ value: "Feet from Center", position: "bottom", fill: C.textDim, fontSize: 10, dy: 12 }} />
                <YAxis type="number" dataKey="y" domain={[0, 5]} tick={{ fill: C.textDim, fontSize: 10 }} ticks={[0, 1, 2, 3, 4, 5]} label={{ value: "Height (ft)", angle: -90, position: "insideLeft", fill: C.textDim, fontSize: 10, dx: -5 }} />
                <ReferenceArea x1={-0.83} x2={0.83} y1={1.5} y2={3.5} fill="none" stroke={C.textMuted} strokeWidth={2} />
                <ReferenceArea x1={-0.83} x2={0.83} y1={0} y2={0.5} fill="none" stroke="none" label={{ position: "center", content: (props) => { const { viewBox } = props; if (!viewBox) return null; const cx = viewBox.x + viewBox.width / 2, bottomY = viewBox.y + viewBox.height, halfW = viewBox.width / 2; return (<polygon points={`${cx - halfW},${bottomY} ${cx + halfW},${bottomY} ${cx + halfW * 0.88},${bottomY - 8} ${cx},${bottomY - 18} ${cx - halfW * 0.88},${bottomY - 8}`} fill={C.textMuted} fillOpacity={0.15} stroke={C.textMuted} strokeWidth={2} strokeOpacity={0.45} strokeLinejoin="round" />); }}} />
                <Tooltip content={({ payload }) => { if (!payload?.length) return null; const d = payload[0].payload; return (<div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "10px 14px", fontSize: "11px", minWidth: "180px" }}><div style={{ color: d.color, fontWeight: 700, marginBottom: "4px" }}>{d.name} — {d.velo} mph</div><div style={{ color: C.textMuted, lineHeight: 1.6 }}><div>vs. {d.batter} ({d.hand}HH)</div><div>Inning {d.inning} · Count: {d.count}</div><div>Result: {descLabel(d.description)}</div></div></div>); }} />
                <Scatter data={filtered} r={5} opacity={0.8} isAnimationActive={false}>
                  {filtered.map((d, i) => <Cell key={i} fill={d.color} stroke="#000" strokeWidth={0.5} strokeOpacity={0.35} />)}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginTop: "4px" }}>
            {pitchTypeMetrics.map(pt => (
              <div key={pt.name} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: C.textMuted }}>
                <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: pt.color }} />
                {PITCH_ABBREV[pt.name] || pt.code}
              </div>
            ))}
          </div>
        </>
      )}

      {viewMode === "heatmap" && (
        <>
          <div ref={heatContainerRef} style={{ width: "100%", aspectRatio: "1/1", maxHeight: "500px", position: "relative", background: "#f8f8f8", borderRadius: "6px", overflow: "hidden" }}>
            <HeatmapCanvas pitches={heatFiltered} width={heatSize.w * 2} height={heatSize.h * 2} C={C} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "10px" }}>
            <span style={{ fontSize: "9px", fontWeight: 600, color: C.textDim }}>Least</span>
            <div style={{ width: "120px", height: "10px", borderRadius: "3px", background: "linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)" }} />
            <span style={{ fontSize: "9px", fontWeight: 600, color: C.textDim }}>Most</span>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Plot Compare section (Compare tool) ───
// Renders two MOVEMENT plots side by side from a frozen snapshot (older left, newer right).
// Wrapped in memo so it renders exactly once per snapshot: without this, every hover on the
// Compare tables (hoveredCode state) re-rendered both plots' thousands of SVG dots and froze the page.
const PlotCompareSection = memo(({ snapshot, C, isMobile, onClear }) => {
  if (!snapshot) return null;
  return (
    <div style={{ marginTop: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: C.accent }}>
          Movement Plot Compare
        </div>
        <button onClick={() => onClear(null)} style={{
          background: "transparent", border: `1px solid ${C.border}`, borderRadius: "4px",
          padding: "4px 10px", color: C.textDim, fontSize: "10px", fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}>✕ Close</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "20px" }}>
        {[snapshot.left, snapshot.right].map((side, idx) => (
          <div key={idx}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: C.text, marginBottom: "8px", textAlign: "center" }}>
              {side.label}
              <span style={{ color: C.textDim, fontWeight: 600, marginLeft: "8px" }}>
                {side.count} pitches
              </span>
            </div>
            {side.metrics && side.metrics.pitchTypeMetrics && side.metrics.pitchTypeMetrics.length > 0 ? (
              <MovementPlot pitchTypeMetrics={side.metrics.pitchTypeMetrics} C={C} />
            ) : (
              <div style={{ padding: "40px 0", textAlign: "center", color: C.textDim, fontSize: "12px" }}>No data</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

// ─── Sortable Table ───
const SortableTable = ({ data, columns, title, C, showHandToggle, handFilter, setHandFilter, allRow }) => {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("desc");
  const handleSort = (k) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };
  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      let aV = a[sortKey], bV = b[sortKey];
      if (typeof aV === "string") { aV = parseFloat(aV.replace("%", "")) || 0; bV = parseFloat(bV.replace("%", "")) || 0; }
      return sortDir === "asc" ? aV - bV : bV - aV;
    });
  }, [data, sortKey, sortDir]);
  const thStyle = (align) => ({
    padding: "8px 10px", fontSize: "9px", fontWeight: 700, letterSpacing: "1.2px",
    textTransform: "uppercase", color: C.textDim, borderBottom: `1px solid ${C.border}`,
    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
    textAlign: align === "left" ? "left" : "right",
  });
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "20px", marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: C.textDim }}>{title}</div>
        {showHandToggle && (
          <div style={{ display: "flex", gap: "4px" }}>
            {[{ key: "all", label: "All" }, { key: "L", label: "vs LHH" }, { key: "R", label: "vs RHH" }].map(t => (
              <button key={t.key} onClick={() => setHandFilter(t.key)} style={{
                background: handFilter === t.key ? C.accentGlow : "transparent",
                border: `1px solid ${handFilter === t.key ? C.accent : C.border}`,
                borderRadius: "4px", padding: "4px 10px",
                color: handFilter === t.key ? C.accent : C.textDim,
                fontSize: "10px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>{t.label}</button>
            ))}
          </div>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} style={thStyle(col.align)} onClick={() => col.key !== "name" && handleSort(col.key)}>
                  {col.label}{col.key !== "name" && <SortIcon active={sortKey === col.key} dir={sortKey === col.key ? sortDir : "desc"} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allRow && (
              <tr style={{ background: C.accentGlow, fontWeight: 600 }}>
                {columns.map(col => (
                  <td key={col.key} style={{ padding: "7px 10px", textAlign: col.align === "left" ? "left" : "right", borderBottom: `2px solid ${C.border}`, color: C.text, whiteSpace: "nowrap" }}>
                    {col.key === "name" ? (
                      <span style={{ fontWeight: 700 }}>All</span>
                    ) : allRow[col.key]}
                  </td>
                ))}
              </tr>
            )}
            {sorted.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : C.tableStripe }}>
                {columns.map(col => (
                  <td key={col.key} style={{ padding: "7px 10px", textAlign: col.align === "left" ? "left" : "right", borderBottom: `1px solid ${C.border}`, color: C.text, whiteSpace: "nowrap" }}>
                    {col.key === "name" ? (
                      <span>
                        <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: row.color, marginRight: "8px", verticalAlign: "middle" }} />
                        <span style={{ fontWeight: 600 }}>{row.name}</span>
                      </span>
                    ) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Context-neutral pitch run value from count states ───
// Run expectancy by count (runs above average PA, from Tom Tango's linear weights)
const COUNT_RE = {
  "0-0": 0.000, "1-0": 0.032, "0-1": -0.037, "2-0": 0.080, "1-1": -0.012,
  "0-2": -0.086, "3-0": 0.149, "2-1": 0.024, "1-2": -0.055, "3-1": 0.101,
  "2-2": -0.026, "3-2": 0.040,
};
// PA outcome linear weights (~4.3 R/G environment, 2024-2025)
const EVENT_LW = {
  strikeout: -0.279, strikeout_double_play: -0.279, walk: 0.306, intent_walk: 0.175,
  hit_by_pitch: 0.352, single: 0.464, double: 0.762, triple: 1.051, home_run: 1.396,
  field_out: -0.264, flyout: -0.264, groundout: -0.264, lineout: -0.264, pop_out: -0.264,
  force_out: -0.264, forceout: -0.264, sac_fly: -0.098, sac_bunt: -0.147,
  fielders_choice: -0.243, fielders_choice_out: -0.264, field_error: 0.464,
  catcher_interf: 0.306, double_play: -0.494, grounded_into_double_play: -0.494,
  sac_fly_double_play: -0.494, sac_bunt_double_play: -0.494, triple_play: -0.594,
};
const computePitchRunValue = (p) => {
  const b = parseInt(p.balls) || 0, s = parseInt(p.strikes) || 0;
  const countKey = `${b}-${s}`;
  const currentRE = COUNT_RE[countKey] ?? 0;
  const ev = (p.events || "").toLowerCase().trim();
  // Skip baserunning events (they don't end the PA)
  const isBaserunning = ev.includes("caught_stealing") || ev.includes("pickoff");
  // PA-ending event: RV = event weight - current count RE
  if (ev && !isBaserunning) {
    const lw = EVENT_LW[ev];
    if (lw != null) return lw - currentRE;
    if (ev.includes("out") || ev.includes("play")) return -0.264 - currentRE;
    return 0;
  }
  // Non-terminal pitch: RV = new count RE - current count RE
  const desc = (p.description || "").toLowerCase();
  if (desc.includes("ball") && !desc.includes("foul")) {
    const newKey = `${Math.min(b + 1, 3)}-${s}`;
    return (COUNT_RE[newKey] ?? 0) - currentRE;
  }
  if (desc.includes("foul") && s >= 2) return 0; // foul with 2 strikes = no change
  if (desc.includes("strike") || desc.includes("foul")) {
    const newKey = `${b}-${Math.min(s + 1, 2)}`;
    return (COUNT_RE[newKey] ?? 0) - currentRE;
  }
  return 0;
};

// ─── Normalize API pitch data into internal format ───
// Compute the extrapolated release point at the ball's actual release from the pitcher's hand.
// MLB tracking captures position at y=50 ft from home plate, but Savant publishes "Vertical/Horizontal Release Pt"
// extrapolated back to where the ball actually leaves the hand (y = 60.5 - release_extension).
// Without this correction, our displayed release height was ~0.2-0.3 ft below Savant's published values.
// Uses standard projectile motion: pos_at_release = pos_at_50 + v0*dt + 0.5*a*dt²
// where dt is the (negative) time delta to travel from y=50 back to y=release.
const computeReleaseAtHand = (p) => {
  const pos50_x = p.release_pos_x;
  const pos50_z = p.release_pos_z;
  const vy0 = p.vy0;
  const vx0 = p.vx0;
  const vz0 = p.vz0;
  const ax = p.ax;
  const ay = p.ay;
  const az = p.az;
  const extension = p.release_extension;
  // If we lack any required kinematic field, return the raw value unchanged
  if (pos50_z == null || vy0 == null || ay == null || vz0 == null || az == null || extension == null) {
    return { release_pos_x: pos50_x, release_pos_z: pos50_z };
  }
  // Target y-coordinate: where the ball leaves the hand (rubber at 60.5 - extension)
  const y_release = 60.5 - extension;
  // We need dt such that starting at (y=50, vy=vy0) and going backward in time, we end up at y=y_release.
  // y(t) = 50 + vy0*t + 0.5*ay*t² = y_release
  // Solve for t: 0.5*ay*t² + vy0*t + (50 - y_release) = 0
  // dt should be negative since we're going backward in time (from y=50 to y > 50).
  const A = 0.5 * ay;
  const B = vy0;
  const C_ = 50 - y_release; // y_release > 50, so C_ < 0
  const discriminant = B * B - 4 * A * C_;
  if (discriminant < 0) {
    return { release_pos_x: pos50_x, release_pos_z: pos50_z };
  }
  const sqrtDisc = Math.sqrt(discriminant);
  // Two roots: pick the one closer to zero (smallest |t|) since release was a short time before y=50 measurement
  const t1 = (-B + sqrtDisc) / (2 * A);
  const t2 = (-B - sqrtDisc) / (2 * A);
  const dt = Math.abs(t1) < Math.abs(t2) ? t1 : t2;
  // Now apply kinematics to compute x and z at that release time
  const z_release = pos50_z + vz0 * dt + 0.5 * az * dt * dt;
  const x_release = (pos50_x != null && vx0 != null && ax != null)
    ? pos50_x + vx0 * dt + 0.5 * ax * dt * dt
    : pos50_x;
  return { release_pos_x: x_release, release_pos_z: z_release };
};

const normalizeLivePitch = (p) => {
  const desc = (p.description || "").toLowerCase();
  const isFoulTip = desc.includes("foul_tip") || desc.includes("foul tip");
  const isStrike = p.is_strike || desc.includes("strike") || desc.includes("foul");
  const isSwing = desc.includes("swing") || desc.includes("foul") || desc.includes("in play") || desc.includes("into_play") || desc.includes("missed_bunt");
  const isWhiff = isFoulTip || (desc.includes("swinging") && desc.includes("strike")) || desc.includes("missed_bunt");
  const isCalledStrike = desc.includes("called") && desc.includes("strike");
  const isFoul = !isFoulTip && desc.includes("foul"); // regular fouls only, NOT foul tips
  const isInPlay = p.is_in_play || desc.includes("in play") || desc.includes("into_play");
  const zone = p.zone;
  const isInZone = zone != null ? (zone >= 1 && zone <= 9) : (Math.abs(p.plate_x || 0) <= 0.83 && (p.plate_z || 0) >= 1.5 && (p.plate_z || 0) <= 3.5);

  // Movement data: Savant CSV pfx values are in FEET → multiply by 12 for inches
  // HB is flipped (negated) for pitcher's perspective
  const pfx_z_inches = p.pfx_z != null ? p.pfx_z * 12 : null;
  const pfx_x_inches = p.pfx_x != null ? p.pfx_x * -12 : null;

  // Compute extrapolated release point at the ball's actual release from the hand.
  // This matches Savant's "Vertical/Horizontal Release Pt" convention.
  const { release_pos_x: rel_x_hand, release_pos_z: rel_z_hand } = computeReleaseAtHand(p);

  // Backend sometimes returns blank pitch_type even when pitch_name is valid.
  // Derive the code from the name so the filter in normAndFilter doesn't strip these.
  const PN_TO_PT_LOOKUP = {
    "4-Seam Fastball": "FF", "Four-Seam Fastball": "FF",
    "Sinker": "SI", "Cutter": "FC",
    "Slider": "SL", "Sweeper": "ST", "Slurve": "SV",
    "Curveball": "CU", "Knuckle Curve": "KC", "Slow Curve": "CS",
    "Changeup": "CH", "Split-Finger": "FS", "Splitter": "FS",
    "Screwball": "SC", "Forkball": "FO", "Knuckleball": "KN",
    "Eephus": "EP",
  };
  const _rawPt = p.pitch_type || "";
  const _rawPn = p.pitch_name || "";
  const _derivedPt = (!_rawPt || _rawPt.toLowerCase() === "nan") && _rawPn && _rawPn.toLowerCase() !== "nan"
    ? (PN_TO_PT_LOOKUP[_rawPn] || _rawPn.slice(0, 2).toUpperCase())
    : _rawPt;

  return {
    pitch_number: p.pitch_number,
    pitch_type: _derivedPt,
    pitch_name: (_rawPn || _rawPt || "").replace("Four-Seam", "4-Seam"),
    release_speed: p.release_speed,
    release_spin_rate: p.release_spin_rate || p.spin_rate,
    spin_efficiency: p.spin_efficiency || null,
    pfx_z: pfx_z_inches,
    pfx_x: pfx_x_inches,
    release_pos_z: rel_z_hand,
    release_pos_x: rel_x_hand,
    vaa: p.vaa || null,
    release_extension: p.release_extension,
    plate_x: p.plate_x,
    plate_z: p.plate_z,
    description: isWhiff ? "swinging_strike" : isCalledStrike ? "called_strike" : isFoul ? "foul" : isInPlay ? "hit_into_play" : desc.includes("hit_by_pitch") ? "hit_by_pitch" : "ball",
    is_in_zone: isInZone,
    is_swing: isSwing,
    is_whiff: isWhiff,
    is_called_strike: isCalledStrike,
    is_in_play: isInPlay,
    is_ground_ball: p.bb_type === "ground_ball" || (!p.bb_type && p.launch_angle != null && p.launch_angle < 10 && isInPlay),
    is_fly_ball: p.bb_type === "fly_ball" || (!p.bb_type && p.launch_angle != null && p.launch_angle >= 25 && isInPlay),
    is_line_drive: p.bb_type === "line_drive",
    is_popup: p.bb_type === "popup",
    // Exact Statcast barrel definition (per MLB.com glossary).
    // Each integer mph of EV from 98 to 116+ has its own LA window.
    // Source: https://www.mlb.com/glossary/statcast/barrel
    is_barrel: (() => {
      if (!isInPlay || p.launch_speed == null || p.launch_angle == null) return false;
      const ev = p.launch_speed, la = p.launch_angle;
      if (ev < 98) return false;
      // Hand-coded table: [lowerLA, upperLA] per integer mph from 98 to 116+
      const table = {
        98:  [26, 30], 99:  [25, 31], 100: [24, 33], 101: [23, 34],
        102: [22, 35], 103: [21, 36], 104: [20, 37], 105: [19, 38],
        106: [18, 39], 107: [17, 40], 108: [16, 41], 109: [15, 42],
        110: [14, 43], 111: [13, 44], 112: [12, 45], 113: [11, 46],
        114: [10, 47], 115: [9, 48],  116: [8, 50],
      };
      const evInt = Math.min(Math.floor(ev), 116);
      const window = table[evInt];
      if (!window) return false;
      return la >= window[0] && la <= window[1];
    })(),
    batter_hand: p.batter_hand || p.stand || "R",
    bb_type: p.bb_type || "",
    count: p.count || `${p.balls || 0}-${p.strikes || 0}`,
    batter_name: p.batter_name || "",
    inning: p.inning || 0,
    launch_speed: p.launch_speed,
    launch_angle: p.launch_angle,
    estimated_slg_using_speedangle: p.estimated_slg_using_speedangle || null,
    estimated_woba_using_speedangle: p.estimated_woba_using_speedangle || null,
    estimated_ba_using_speedangle: p.estimated_ba_using_speedangle || null,
    woba_value: p.woba_value || null,
    delta_run_exp: p.delta_run_exp != null ? p.delta_run_exp : computePitchRunValue(p),
    game_date: p.game_date || "",
    game_pk: p.game_pk || 0,
    at_bat_number: p.at_bat_number || null,
    events: p.events || "",
  };
};

const normAndFilter = (raw) => {
  // Filter rule: keep pitches with valid pitch_type, OR pitches with events (regardless
  // of pitch_type) so we don't lose AB-ending pitches whose pitch_type wasn't classified.
  // Without the events exception, walks/Ks tied to unclassifiable borderline pitches were
  // being stripped, causing under-counted BB% and K% in summary stats.
  const normalized = raw.map(normalizeLivePitch).filter(p => {
    const hasValidType = p.pitch_type && p.pitch_type !== "PO" && p.pitch_type !== "UN" &&
      p.pitch_name !== "Other" && p.pitch_type.toLowerCase() !== "nan" &&
      p.pitch_name.toLowerCase() !== "nan";
    const hasEvent = p.events && p.events.trim() !== "";
    return hasValidType || hasEvent;
  });
  // Dedup by game_pk + at_bat_number + pitch_number (catches Savant CSV dupes & merge overlaps)
  const seen = new Set();
  return normalized.filter(p => {
    const key = `${p.game_pk || ""}-${p.at_bat_number || ""}-${p.pitch_number || ""}-${p.pitch_type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// ─── Compute Historical Summary Stats from pitch-level data ───
const computeHistoricalSummary = (pitchData) => {
  if (!pitchData || pitchData.length === 0) return null;

  // Get unique game dates
  const gameDates = [...new Set(pitchData.filter(p => p.game_date).map(p => p.game_date))];
  const gamesStarted = gameDates.length;

  // Find at-bat ending pitches (those with events)
  const abEndPitches = pitchData.filter(p => p.events && p.events.trim() !== "");

  // Count plate appearances (batters faced)
  const totalPA = abEndPitches.length;

  // Count strikeouts
  const strikeouts = abEndPitches.filter(p => {
    const ev = (p.events || "").toLowerCase();
    return ev.includes("strikeout") || ev === "strikeout_double_play";
  }).length;

  // Count walks (BB + HBP)
  const walks = abEndPitches.filter(p => {
    const ev = (p.events || "").toLowerCase();
    return ev === "walk" || ev === "hit_by_pitch" || ev === "intent_walk";
  }).length;

  const bbOnly = abEndPitches.filter(p => {
    const ev = (p.events || "").toLowerCase();
    return ev === "walk" || ev === "intent_walk";
  }).length;

  // Count hits
  const hits = abEndPitches.filter(p => {
    const ev = (p.events || "").toLowerCase();
    return ev === "single" || ev === "double" || ev === "triple" || ev === "home_run";
  }).length;

  // Count outs to estimate IP
  const outEvents = abEndPitches.reduce((outs, p) => {
    const ev = (p.events || "").toLowerCase();
    if (ev === "strikeout" || ev === "field_out" || ev === "flyout" || ev === "groundout" ||
        ev === "lineout" || ev === "pop_out" || ev === "force_out" || ev === "forceout" ||
        ev === "sac_fly" || ev === "sac_bunt" || ev === "sac_fly_double_play" ||
        ev === "fielders_choice" || ev === "fielders_choice_out" ||
        ev === "field_error" || ev === "catcher_interf") return outs + 1;
    if (ev === "double_play" || ev === "grounded_into_double_play" ||
        ev === "strikeout_double_play" || ev === "sac_bunt_double_play") return outs + 2;
    if (ev === "triple_play") return outs + 3;
    return outs;
  }, 0);

  const ipNum = outEvents / 3;
  const ipWhole = Math.floor(ipNum);
  const ipRemainder = outEvents % 3;
  const ipStr = `${ipWhole}.${ipRemainder}`;

  // Compute rates
  const kPct = totalPA > 0 ? ((strikeouts / totalPA) * 100).toFixed(1) : "0.0";
  const bbPct = totalPA > 0 ? ((bbOnly / totalPA) * 100).toFixed(1) : "0.0"; // walks only, no HBP
  const whip = ipNum > 0 ? ((bbOnly + hits) / ipNum).toFixed(2) : "-.--";

  // ERA: use delta_run_exp sum as a proxy for runs, or compute from run-scoring events
  // Since we don't have earned runs directly, we'll estimate using run expectancy
  // A better approach: count runs scored via events (HR = at least 1 run, etc.)
  // But the most accurate available proxy is sum of delta_run_exp
  const totalRunExp = pitchData.reduce((s, p) => s + (p.delta_run_exp || 0), 0);
  // delta_run_exp sums to approximately total runs above average
  // For ERA, we'll note it's estimated. Alternative: just show "-" if we can't get ER
  // Let's use the rough estimate: total estimated runs = totalRunExp + league_avg_runs_per_out * outs
  // Actually, let's just show the stats we can compute accurately and skip ERA since we can't get ER
  // Instead, we'll compute FIP which is more meaningful from pitch data:
  // FIP = ((13*HR + 3*(BB+HBP) - 2*K) / IP) + constant
  const FIP_CONSTANT = 3.15;
  const homeRuns = abEndPitches.filter(p => (p.events || "").toLowerCase() === "home_run").length;
  const fip = ipNum > 0 ? (((13 * homeRuns + 3 * walks - 2 * strikeouts) / ipNum) + FIP_CONSTANT).toFixed(2) : "-.--";

  return {
    gamesStarted, ip: ipStr, kPct, bbPct, whip, fip, gameDates,
    totalPA, strikeouts, walks, hits, homeRuns, outs: outEvents,
  };
};

// ─── Historical Summary Box ───
const HistoricalSummaryBox = ({ pitchData, activePitcher, pitcherHand, C }) => {
  const summary = useMemo(() => computeHistoricalSummary(pitchData), [pitchData]);
  if (!summary) return null;

  const lastName = activePitcher.split(" ").slice(-1)[0];
  const firstName = activePitcher.split(" ")[0];
  const initial = firstName ? firstName[0] + "." : "";
  const displayName = `${initial} ${lastName}`;

  const statCols = [
    { label: "GS", val: summary.gamesStarted },
    { label: "IP", val: summary.ip },
    { label: "K%", val: `${summary.kPct}` },
    { label: "BB%", val: `${summary.bbPct}` },
    { label: "WHIP", val: summary.whip },
    { label: "FIP", val: summary.fip },
  ];

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", marginBottom: "20px", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", overflowX: "auto" }}>
        <div style={{ padding: "12px 20px", minWidth: "120px", fontSize: "13px", fontWeight: 700, color: C.text, borderRight: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "6px" }}>
          {displayName}
          {pitcherHand && <span style={{ fontSize: "10px", fontWeight: 500, color: C.textDim }}>({pitcherHand}HP)</span>}
        </div>
        <div style={{ display: "flex", flex: 1 }}>
          {statCols.map((col, i) => (
            <div key={col.label} style={{ flex: 1, textAlign: "center", padding: "0 4px", borderRight: i < statCols.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: C.textDim, letterSpacing: "1px", padding: "8px 0 4px", borderBottom: `1px solid ${C.border}` }}>{col.label}</div>
              <div style={{ fontSize: "14px", fontWeight: 600, padding: "8px 0", color: C.text }}>{col.val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Date Picker with Pitched Date Highlights ───
const DatePickerWithHighlights = ({ value, onChange, pitchedDates, C, label, onAfterSelect }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const parsed = value ? new Date(value + "T12:00:00") : new Date();
  const [viewYear, setViewYear] = useState(parsed.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed.getMonth());

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (value) {
      const d = new Date(value + "T12:00:00");
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  // Expose open method via ref for auto-jump
  const openPicker = () => setOpen(true);

  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const selectDate = (day, monthOffset = 0) => {
    const m = viewMonth + monthOffset;
    const y = m > 11 ? viewYear + 1 : viewYear;
    const actualMonth = m > 11 ? m - 12 : m;
    const dateStr = `${y}-${String(actualMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(dateStr);
    setOpen(false);
    if (onAfterSelect) setTimeout(() => onAfterSelect(), 50);
  };

  const renderMonth = (year, month, monthOffset = 0) => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    return (
      <div style={{ flex: "1", minWidth: "200px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: C.text, textAlign: "center", marginBottom: "8px" }}>
          {monthNames[month]} {year}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "4px" }}>
          {dayNames.map(d => (
            <div key={d} style={{ fontSize: "9px", fontWeight: 700, color: C.textDim, textAlign: "center", padding: "2px 0" }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
          {cells.map((day, i) => {
            if (day === null) return <div key={`e-${i}`} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const pitched = pitchedDates && pitchedDates.has(dateStr);
            const isSelected = dateStr === value;
            return (
              <div key={dateStr} onClick={() => selectDate(day, monthOffset)} style={{
                fontSize: "11px", textAlign: "center", padding: "5px 0", borderRadius: "4px", cursor: "pointer",
                fontWeight: (pitched || isSelected) ? 700 : 400,
                color: isSelected ? "#fff" : pitched ? C.accent : C.text,
                background: isSelected ? C.accent : pitched ? (C.accent + "22") : "transparent",
                border: pitched && !isSelected ? `1px solid ${C.accent}55` : "1px solid transparent",
                transition: "background 0.15s",
              }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.accentGlow; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = pitched ? (C.accent + "22") : "transparent"; }}
              >
                {day}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const displayVal = value || "Select date";
  const month2 = viewMonth + 1 > 11 ? 0 : viewMonth + 1;
  const year2 = viewMonth + 1 > 11 ? viewYear + 1 : viewYear;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(!open)} data-picker-open={openPicker} style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "10px 14px",
        color: C.text, fontSize: "13px", fontFamily: "inherit", cursor: "pointer", minWidth: "130px",
        textAlign: "left", display: "flex", alignItems: "center", gap: "8px",
      }}>
        <span>{displayVal}</span>
        <span style={{ fontSize: "10px", color: C.textDim, marginLeft: "auto" }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, zIndex: 300, marginTop: "4px",
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)", padding: "12px", width: "440px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <button onClick={prevMonth} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: C.accent, fontWeight: 700, padding: "2px 6px", fontFamily: "inherit" }}>‹</button>
            <span style={{ fontSize: "12px", fontWeight: 700, color: C.text }}>{monthNames[viewMonth]} – {monthNames[month2]} {year2}</span>
            <button onClick={nextMonth} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: C.accent, fontWeight: 700, padding: "2px 6px", fontFamily: "inherit" }}>›</button>
          </div>
          <div style={{ display: "flex", gap: "16px" }}>
            {renderMonth(viewYear, viewMonth, 0)}
            {renderMonth(year2, month2, 1)}
          </div>
          {pitchedDates && pitchedDates.size > 0 && (
            <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "2px", border: `1px solid ${C.accent}55`, background: C.accent + "22" }} />
              <span style={{ fontSize: "9px", color: C.textDim }}>Pitched ({pitchedDates.size} days)</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Table Columns ───
const STUFF_COLS = [
  { key: "name", label: "Pitch", align: "left" }, { key: "count", label: "#" },
  { key: "avgVelo", label: "Velo" }, { key: "maxVelo", label: "Max" },
  { key: "avgSpin", label: "Spin" },
  { key: "avgIVB", label: "IVB" }, { key: "avgHB", label: "HB" },
  { key: "avgRelH", label: "RelH" }, { key: "avgRelS", label: "RelS" },
  { key: "avgExt", label: "Ext" }, { key: "avgVAA", label: "VAA" },
];
const PERF_COLS = [
  { key: "name", label: "Pitch", align: "left" }, { key: "count", label: "#" },
  { key: "strikeRate", label: "Strike%" }, { key: "zoneRate", label: "Zone%" },
  { key: "cswRate", label: "CSW%" }, { key: "calledStrikeRate", label: "CStr%" },
  { key: "swStrRate", label: "SwStr%" }, { key: "whiffRate", label: "Whiff%" },
  { key: "chaseRate", label: "Chase%" }, { key: "zoneWhiffRate", label: "ZWhiff%" },
  { key: "bipCount", label: "BIP" }, { key: "gbRate", label: "GB%" },
  { key: "fbRate", label: "FB%" }, { key: "barrelRate", label: "Barrel%" },
  { key: "expRunValue", label: "RV" }, { key: "rv100", label: "RV/100" },
];

// ─── Starters Grid (home page) ───
const StartersGrid = ({ C, logos, onSelect, isMobile }) => {
  const [starters, setStarters] = useState(null);
  const [loading, setLoading] = useState(true);

  // Compute the current "active date" using 8am CT rollover
  const getActiveDate = () => {
    const now = new Date();
    const ctNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
    if (ctNow.getHours() < 8) ctNow.setDate(ctNow.getDate() - 1);
    return `${ctNow.getFullYear()}-${String(ctNow.getMonth() + 1).padStart(2, "0")}-${String(ctNow.getDate()).padStart(2, "0")}`;
  };

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await getStartersToday(getActiveDate());
        if (alive) { setStarters(data); setLoading(false); }
      } catch { if (alive) setLoading(false); }
    };
    load();
    const iv = setInterval(load, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const statusBadge = (s) => {
    if (s.game_status === "Live") return <span style={{ fontSize: "9px", fontWeight: 700, color: "#10b981", letterSpacing: "1px" }}>● LIVE {s.inning}</span>;
    if (s.game_status === "Final") return <span style={{ fontSize: "9px", fontWeight: 700, color: "#ef4444", letterSpacing: "1px" }}>FINAL</span>;
    return <span style={{ fontSize: "9px", fontWeight: 700, color: C.textDim, letterSpacing: "1px" }}>{s.detailed_status || "SCHED"}</span>;
  };

  const cols = ["IP", "H", "R", "ER", "BB", "K", "P", "Str%", "SwStr%"];

  return (
    <div style={{ padding: isMobile ? "16px 0" : "24px 0" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: C.textDim, marginBottom: "16px" }}>
        Starting Pitchers Today
      </div>
      {loading && <div style={{ color: C.textDim, fontSize: "12px", padding: "20px 0" }}>Loading…</div>}
      {!loading && starters && starters.length === 0 && <div style={{ color: C.textDim, fontSize: "12px" }}>No games today.</div>}
      {!loading && starters && starters.length > 0 && (
        <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: "8px", background: C.surface }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ background: C.accentGlow }}>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: C.textDim, letterSpacing: "1px", textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>Pitcher</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: C.textDim, letterSpacing: "1px", textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>Matchup</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: C.textDim, letterSpacing: "1px", textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>Status</th>
                {cols.map(c => (
                  <th key={c} style={{ padding: "10px 10px", textAlign: "right", fontSize: "10px", fontWeight: 700, color: C.textDim, letterSpacing: "1px", textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {starters.map((s, i) => (
                <tr key={`${s.game_pk}-${s.side}-${i}`}
                  onClick={() => {
                    if (!s.pitcher_id || s.game_status === "Preview") return;
                    onSelect(
                      { id: s.pitcher_id, name: s.pitcher_name, throws: "" },
                      { game_pk: s.game_pk, home_team: s.side === "home" ? s.team : s.opponent, away_team: s.side === "away" ? s.team : s.opponent, detailed_status: s.detailed_status, inning: s.inning }
                    );
                  }}
                  style={{ cursor: s.game_status !== "Preview" ? "pointer" : "default", borderBottom: `1px solid ${C.border}` }}
                  onMouseEnter={e => { if (s.game_status !== "Preview") e.currentTarget.style.background = C.accentGlow; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <td style={{ padding: "10px 12px", color: C.text, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {s.pitcher_name}{s.is_current && <span style={{ marginLeft: "6px", fontSize: "8px", color: "#10b981", fontWeight: 700 }}>●</span>}
                  </td>
                  <td style={{ padding: "10px 12px", color: C.textMuted, fontSize: "11px", whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <TeamLogo abbr={s.team} logos={logos} size={14} /> {s.team} vs <TeamLogo abbr={s.opponent} logos={logos} size={14} /> {s.opponent}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{statusBadge(s)}</td>
                  <td style={{ padding: "10px 10px", textAlign: "right", color: C.text, fontVariantNumeric: "tabular-nums" }}>{s.ip}</td>
                  <td style={{ padding: "10px 10px", textAlign: "right", color: C.text, fontVariantNumeric: "tabular-nums" }}>{s.h}</td>
                  <td style={{ padding: "10px 10px", textAlign: "right", color: C.text, fontVariantNumeric: "tabular-nums" }}>{s.r}</td>
                  <td style={{ padding: "10px 10px", textAlign: "right", color: C.text, fontVariantNumeric: "tabular-nums" }}>{s.er}</td>
                  <td style={{ padding: "10px 10px", textAlign: "right", color: C.text, fontVariantNumeric: "tabular-nums" }}>{s.bb}</td>
                  <td style={{ padding: "10px 10px", textAlign: "right", color: C.text, fontVariantNumeric: "tabular-nums" }}>{s.k}</td>
                  <td style={{ padding: "10px 10px", textAlign: "right", color: C.text, fontVariantNumeric: "tabular-nums" }}>{s.pitches}</td>
                  <td style={{ padding: "10px 10px", textAlign: "right", color: C.text, fontVariantNumeric: "tabular-nums" }}>{s.strike_pct}</td>
                  <td style={{ padding: "10px 10px", textAlign: "right", color: C.text, fontVariantNumeric: "tabular-nums" }}>{s.swstr_pct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: "10px", color: C.textDim, marginTop: "10px", textAlign: "center" }}>
        Click any live or final row to load that pitcher • Updates every 15s
      </div>
    </div>
  );
};

// ─── Compare Page (full-season + comparison row) ───
// All columns shown in one wide row. Order matches the user's requested layout.
const COMPARE_COLS = [
  { key: "name", label: "Pitch", align: "left", w: 130 },
  { key: "count", label: "#", w: 50 },
  { key: "pitchPct", label: "Pitch%", w: 60 },
  { key: "avgVelo", label: "Velo", w: 55 },
  { key: "maxVelo", label: "Max", w: 55 },
  { key: "avgSpin", label: "Spin", w: 60 },
  { key: "avgIVB", label: "IVB", w: 55 },
  { key: "avgHB", label: "HB", w: 55 },
  { key: "avgRelH", label: "RelH", w: 55 },
  { key: "avgRelS", label: "RelS", w: 55 },
  { key: "avgExt", label: "Ext", w: 55 },
  { key: "avgVAA", label: "VAA", w: 55 },
  { key: "strikeRate", label: "Strike%", w: 65 },
  { key: "zoneRate", label: "Zone%", w: 60 },
  { key: "cswRate", label: "CSW%", w: 60 },
  { key: "calledStrikeRate", label: "CStr%", w: 60 },
  { key: "swStrRate", label: "SwStr%", w: 65 },
  { key: "whiffRate", label: "Whiff%", w: 65 },
  { key: "chaseRate", label: "Chase%", w: 65 },
  { key: "zoneWhiffRate", label: "ZWhiff%", w: 65 },
  { key: "bipCount", label: "BIP", w: 50 },
  { key: "gbRate", label: "GB%", w: 55 },
  { key: "fbRate", label: "FB%", w: 55 },
  { key: "barrelRate", label: "Barrel%", w: 65 },
  { key: "expRunValue", label: "RV", w: 50 },
  { key: "rv100", label: "RV/100", w: 60 },
];

// Compute high-level pitcher stats (GS, IP, ERA, SIERA, K%, BB%, K-BB%) from raw pitches.
// Filtered by batter handedness if hand !== "all".
const computeSummaryStats = (rawPitches, hand) => {
  if (!rawPitches || rawPitches.length === 0) return null;
  const pitches = hand === "all" ? rawPitches : rawPitches.filter(p => p.batter_hand === hand);
  if (pitches.length === 0) return null;

  // Distinct game dates as a proxy for games started
  const gs = new Set(pitches.filter(p => p.game_date).map(p => p.game_date)).size;

  // Count plate appearances using unique at-bat identifiers (game_pk + at_bat_number)
  // This is more reliable than counting event-ending pitches because normAndFilter may
  // have removed NaN-classified pitches that had valid events.
  const uniqueABs = new Set(pitches.filter(p => p.game_pk && p.at_bat_number != null).map(p => `${p.game_pk}-${p.at_bat_number}`));
  const pa = uniqueABs.size;

  // Categorize PA outcomes
  let so = 0, bb = 0, hbp = 0, ibb = 0;
  let outs = 0;
  let gb = 0, fb = 0, pu = 0;
  // Robust out detection: catches all single-out events including common edge cases.
  const isSingleOut = (ev) => {
    if (!ev) return false;
    if (ev === "field_out" || ev === "fieldout" || ev === "flyout" || ev === "groundout" ||
        ev === "lineout" || ev === "pop_out" || ev === "force_out" || ev === "forceout" ||
        ev === "sac_fly" || ev === "sac_bunt" || ev === "fielders_choice" ||
        ev === "fielders_choice_out") return true;
    return false;
  };

  // CRITICAL: events are repeated on EVERY pitch of an at-bat (not just the last pitch).
  // Iterating over all pitches without deduping caused walks/Ks/outs to be counted
  // ~4-5x per AB (once per pitch). Build a map of unique ABs first, then count events
  // exactly once per at-bat. Within an AB, prefer pitches that actually have an event
  // string (some pitches may have empty events even within an AB-ending PA).
  const abEvents = new Map(); // key: "game_pk-at_bat_number" → event string
  for (const p of pitches) {
    if (!p.game_pk || p.at_bat_number == null) continue;
    const ev = (p.events || "").toLowerCase().trim();
    if (!ev) continue;
    const key = `${p.game_pk}-${p.at_bat_number}`;
    // Keep updating - last non-empty event wins (in case parquet has stale early events)
    abEvents.set(key, ev);
  }

  for (const ev of abEvents.values()) {
    if (ev.includes("strikeout")) {
      if (ev === "strikeout_double_play") outs += 2;
      else outs += 1;
    } else if (isSingleOut(ev)) {
      outs += 1;
    } else if (ev === "double_play" || ev === "grounded_into_double_play" || ev === "sac_bunt_double_play" || ev === "sac_fly_double_play") {
      outs += 2;
    } else if (ev === "triple_play") {
      outs += 3;
    }
    // PA-ending event tallies
    if (ev.includes("strikeout")) so += 1;
    else if (ev === "walk") bb += 1;
    else if (ev === "intent_walk") { bb += 1; ibb += 1; }
    else if (ev === "hit_by_pitch") hbp += 1;
  }

  // Baserunning outs (caught_stealing, pickoffs) — these don't end PAs but consume outs.
  // They appear on individual pitches mid-AB, so we DO count per-pitch occurrences but
  // need to dedupe by exact (game_pk, at_bat_number, pitch_number) to avoid duplicates.
  const seenBaserunOuts = new Set();
  for (const p of pitches) {
    const ev = (p.events || "").toLowerCase().trim();
    if (!ev) continue;
    if (ev === "caught_stealing_2b" || ev === "caught_stealing_3b" || ev === "caught_stealing_home" ||
        ev === "pickoff_1b" || ev === "pickoff_2b" || ev === "pickoff_3b" ||
        ev === "pickoff_caught_stealing_2b" || ev === "pickoff_caught_stealing_3b" || ev === "pickoff_caught_stealing_home") {
      const key = `${p.game_pk}-${p.at_bat_number}-${p.pitch_number}-${ev}`;
      if (!seenBaserunOuts.has(key)) {
        seenBaserunOuts.add(key);
        outs += 1;
      }
    }
  }

  // Count GB/FB/PU from in-play pitches (using bb_type) - dedupe per AB since
  // bb_type may also be repeated across pitches.
  const seenInPlayABs = new Set();
  for (const p of pitches) {
    if (!p.is_in_play) continue;
    if (!p.game_pk || p.at_bat_number == null) continue;
    const key = `${p.game_pk}-${p.at_bat_number}`;
    if (seenInPlayABs.has(key)) continue;
    seenInPlayABs.add(key);
    if (p.bb_type === "ground_ball") gb += 1;
    else if (p.bb_type === "fly_ball") fb += 1;
    else if (p.bb_type === "popup") pu += 1;
  }

  const ipNum = outs / 3;
  const ipWhole = Math.floor(ipNum);
  const ipRem = outs % 3;
  const ipStr = `${ipWhole}.${ipRem}`;

  // We don't have earned runs directly. Use HR and run-scoring events as a rough proxy.
  // Fall back to "—" for ERA since accurate ER tracking would need boxscore lookups.
  const era = "—";

  // Display rates: BB% = walks only (FanGraphs convention)
  // Formula rates: BB% includes HBP (used for FIP/SIERA internally)
  const bbAll = bb + hbp; // for FIP/SIERA formulas
  const kPct = pa > 0 ? (so / pa) : 0;
  const bbPctDisplay = pa > 0 ? (bb / pa) : 0; // walks only for display
  const bbPctFormula = pa > 0 ? (bbAll / pa) : 0; // walks+HBP for SIERA
  const kbbPct = kPct - bbPctDisplay;

  // FIP = (13×HR + 3×(BB+HBP) - 2×K) / IP + constant
  const FIP_CONSTANT = 3.15;
  const LG_HR_FB_RATE = 0.119; // league-average HR/FB rate (2025: 11.9%)
  let fip = null, xfip = null, siera = null;
  let hr = 0;
  // Count HR from deduped at-bat events (same dedup as K/BB to avoid 4-5x overcounts)
  for (const ev of abEvents.values()) {
    if (ev === "home_run") hr += 1;
  }
  if (ipNum > 0) {
    fip = (13 * hr + 3 * (bb + hbp) - 2 * so) / ipNum + FIP_CONSTANT;
    // xFIP: replace actual HR with expected HR (FB × league HR/FB rate)
    const expectedHR = fb * LG_HR_FB_RATE;
    xfip = (13 * expectedHR + 3 * (bb + hbp) - 2 * so) / ipNum + FIP_CONSTANT;
  }
  // SIERA with 2026 run-environment adjustment
  // Constant calibrated so league-average SIERA ≈ league-average ERA (4.03 in 2026)
  const SIERA_CONSTANT = 0.28;
  if (pa >= 1) {
    const gbDiff = (gb - fb - pu) / pa;
    const sign = gbDiff >= 0 ? 1 : -1;
    siera = 6.145
          - 16.986 * kPct
          + 11.434 * bbPctFormula
          -  1.858 * gbDiff
          +  7.653 * (kPct * kPct)
          + sign * 6.664 * (gbDiff * gbDiff)
          + 10.130 * kPct * gbDiff
          -  5.195 * bbPctFormula * gbDiff
          + SIERA_CONSTANT;
  }

  return {
    gs,
    ip: ipStr,
    era,
    fip: fip != null ? fip.toFixed(2) : "—",
    xfip: xfip != null ? xfip.toFixed(2) : "—",
    siera: siera != null ? siera.toFixed(2) : "—",
    kPct: pa > 0 ? `${(kPct * 100).toFixed(1)}%` : "—",
    bbPct: pa > 0 ? `${(bbPctDisplay * 100).toFixed(1)}%` : "—",
    kbbPct: pa > 0 ? `${(kbbPct * 100).toFixed(1)}%` : "—",
    pa,
  };
};

const SummaryStatsBar = ({ rawPitches, hand, C, eraOverride, ipOverride, boxStats }) => {
  const stats = useMemo(() => computeSummaryStats(rawPitches, hand), [rawPitches, hand]);
  if (!stats) return null;
  // When hand="all" and we have boxscore truth-source numbers, use them. They are season totals
  // (not split by hand), so they shouldn't be used when filtering by batter handedness.
  const hasBox = boxStats && boxStats.batters_faced > 0;
  const useBox = hand === "all" && hasBox;
  const eraDisplay = (hand === "all" && eraOverride != null) ? eraOverride.toFixed(2) : stats.era;
  const ipDisplay = (hand === "all" && ipOverride != null) ? ipOverride.toFixed(1) : stats.ip;
  const gsDisplay = useBox ? boxStats.games_started : stats.gs;
  let kPctDisplay = stats.kPct, bbPctDisplay = stats.bbPct, kbbPctDisplay = stats.kbbPct;
  if (useBox) {
    const bf = boxStats.batters_faced;
    const k = boxStats.strikeouts;
    const bbOnly = boxStats.walks; // BB% display = walks only (FanGraphs convention)
    const kPct = (k / bf) * 100;
    const bbPct = (bbOnly / bf) * 100;
    kPctDisplay = `${kPct.toFixed(1)}%`;
    bbPctDisplay = `${bbPct.toFixed(1)}%`;
    kbbPctDisplay = `${(kPct - bbPct).toFixed(1)}%`;
  } else if (hand !== "all" && hasBox) {
    // For hand-filtered views, pitch-level event counting is unreliable because
    // normAndFilter may have removed NaN-classified at-bat-ending pitches.
    // Instead: count unique at-bats via (game_pk, at_bat_number) for this hand,
    // and use event-based K/BB counts as-is (those we have are correct, just incomplete).
    const handPitches = rawPitches.filter(p => p.batter_hand === hand);
    const uniqueABs = new Set(handPitches.filter(p => p.game_pk && p.at_bat_number != null).map(p => `${p.game_pk}-${p.at_bat_number}`));
    const pa = uniqueABs.size;
    if (pa > 0) {
      // Dedupe events by (game_pk, at_bat_number) — events repeat on every pitch of an AB.
      // Without this, K and BB get counted ~5x leading to >100% rates.
      const handAbEvents = new Map();
      for (const p of handPitches) {
        if (!p.game_pk || p.at_bat_number == null) continue;
        const ev = (p.events || "").toLowerCase().trim();
        if (!ev) continue;
        handAbEvents.set(`${p.game_pk}-${p.at_bat_number}`, ev);
      }
      let k = 0, bb = 0;
      for (const ev of handAbEvents.values()) {
        if (ev.includes("strikeout")) k++;
        else if (ev === "walk" || ev === "intent_walk") bb++; // BB% = walks only, no HBP
      }
      const kPct = (k / pa) * 100;
      const bbPct = (bb / pa) * 100;
      kPctDisplay = `${kPct.toFixed(1)}%`;
      bbPctDisplay = `${bbPct.toFixed(1)}%`;
      kbbPctDisplay = `${(kPct - bbPct).toFixed(1)}%`;
    }
  }
  // FIP, xFIP, SIERA from boxscore data when available (hand="all" only)
  let fipDisplay = stats.fip, xfipDisplay = stats.xfip, sieraDisplay = stats.siera;
  if (useBox) {
    const ip = boxStats.outs / 3.0;
    const FIP_CONSTANT = 3.15;
    const LG_HR_FB_RATE = 0.119;
    if (ip > 0) {
      const fipVal = (13 * boxStats.home_runs + 3 * (boxStats.walks + boxStats.hit_batsmen) - 2 * boxStats.strikeouts) / ip + FIP_CONSTANT;
      fipDisplay = fipVal.toFixed(2);
      // xFIP: need fly balls from pitch data
      const filtered = rawPitches.filter(p => p.is_in_play);
      let fbCount = 0, gbCount = 0, puCount = 0;
      for (const p of filtered) {
        if (p.bb_type === "fly_ball") fbCount += 1;
        else if (p.bb_type === "ground_ball") gbCount += 1;
        else if (p.bb_type === "popup") puCount += 1;
      }
      const expectedHR = fbCount * LG_HR_FB_RATE;
      const xfipVal = (13 * expectedHR + 3 * (boxStats.walks + boxStats.hit_batsmen) - 2 * boxStats.strikeouts) / ip + FIP_CONSTANT;
      xfipDisplay = xfipVal.toFixed(2);
      // SIERA with 2026 run-environment constant
      const bf = boxStats.batters_faced;
      if (bf > 0) {
        const SIERA_CONSTANT = 0.28;
        const kPct = boxStats.strikeouts / bf;
        const bbPct = (boxStats.walks + boxStats.hit_batsmen) / bf;
        const gbDiff = (gbCount - fbCount - puCount) / bf;
        const sign = gbDiff >= 0 ? 1 : -1;
        const sieraVal = 6.145
                    - 16.986 * kPct
                    + 11.434 * bbPct
                    -  1.858 * gbDiff
                    +  7.653 * (kPct * kPct)
                    + sign * 6.664 * (gbDiff * gbDiff)
                    + 10.130 * kPct * gbDiff
                    -  5.195 * bbPct * gbDiff
                    + SIERA_CONSTANT;
        sieraDisplay = sieraVal.toFixed(2);
      }
    }
  }
  // For hand-filtered views, GS/IP/ERA aren't meaningful (no such thing as "ERA vs LHH").
  // Replace with PA count which IS meaningful per-handedness.
  const isHandFiltered = hand !== "all";
  const handPaCount = isHandFiltered
    ? new Set(rawPitches.filter(p => p.batter_hand === hand && p.game_pk && p.at_bat_number != null).map(p => `${p.game_pk}-${p.at_bat_number}`)).size
    : null;
  const cells = isHandFiltered ? [
    { l: "PA", v: handPaCount != null ? handPaCount.toString() : "—" },
    { l: "FIP", v: fipDisplay },
    { l: "xFIP", v: xfipDisplay },
    { l: "SIERA", v: sieraDisplay },
    { l: "K%", v: kPctDisplay },
    { l: "BB%", v: bbPctDisplay },
    { l: "K-BB%", v: kbbPctDisplay },
  ] : [
    { l: "GS", v: gsDisplay },
    { l: "IP", v: ipDisplay },
    { l: "ERA", v: eraDisplay },
    { l: "FIP", v: fipDisplay },
    { l: "xFIP", v: xfipDisplay },
    { l: "SIERA", v: sieraDisplay },
    { l: "K%", v: kPctDisplay },
    { l: "BB%", v: bbPctDisplay },
    { l: "K-BB%", v: kbbPctDisplay },
  ];
  return (
    <div style={{ display: "flex", gap: "0", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "0", marginBottom: "12px", overflow: "hidden" }}>
      {cells.map((c, i) => (
        <div key={c.l} style={{
          flex: 1, padding: "12px 10px", textAlign: "center",
          borderRight: i < cells.length - 1 ? `1px solid ${C.border}` : "none",
        }}>
          <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.textDim, marginBottom: "4px" }}>{c.l}</div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{c.v}</div>
        </div>
      ))}
    </div>
  );
};

const CompareTable = ({ rawPitches, label, sublabel, C, isMobile, hand, onHandChange, pitcherId, pitchOrder, onComputed, hoveredCode, onHoverCode, season, isFullSeason = true }) => {
  // Count situation filter (default: all counts)
  const [countFilter, setCountFilter] = useState("all");

  // Apply count filter BEFORE everything else - downstream metrics see the filtered set.
  // Definitions:
  //   pre2k        - all counts where strikes < 2
  //   two_strikes  - all counts where strikes = 2
  //   ahead        - pitcher ahead: 0-1, 0-2, 1-2 (strikes > balls)
  //   behind       - pitcher behind: 1-0, 2-0, 3-0, 2-1, 3-1 (balls > strikes)
  //   leverage     - 0-0 and 1-1 (even counts where neither has the edge)
  const countFilteredPitches = useMemo(() => {
    if (!rawPitches) return null;
    if (countFilter === "all") return rawPitches;
    return rawPitches.filter(p => {
      // Coerce balls/strikes — they may come through as strings or numbers
      const b = Number(p.balls);
      const s = Number(p.strikes);
      if (Number.isNaN(b) || Number.isNaN(s)) return false;
      if (countFilter === "pre2k") return s < 2;
      if (countFilter === "two_strikes") return s === 2;
      if (countFilter === "ahead") return (b === 0 && s === 1) || (b === 0 && s === 2) || (b === 1 && s === 2);
      if (countFilter === "behind") return (b === 1 && s === 0) || (b === 2 && s === 0) || (b === 3 && s === 0) || (b === 2 && s === 1) || (b === 3 && s === 1);
      if (countFilter === "leverage") return (b === 0 && s === 0) || (b === 1 && s === 1);
      return true;
    });
  }, [rawPitches, countFilter]);

  const metrics = useMemo(() => countFilteredPitches ? computeMetrics(countFilteredPitches, hand || "all") : null, [countFilteredPitches, hand]);
  const [era, setEra] = useState(null);
  const [ipFromBox, setIpFromBox] = useState(null);
  const [boxStats, setBoxStats] = useState(null);

  // Apply pitchOrder if provided: sort matching pitch types into the top table's order,
  // then append any additional pitch types not in the order at the bottom.
  // Match by canonical abbreviation (e.g. "FF") rather than display name, so that
  // "Four-Seam Fastball" (parquet) and "4-Seam Fastball" (Savant) align correctly.
  const orderedPitchTypes = useMemo(() => {
    if (!metrics?.pitchTypeMetrics) return [];
    if (!pitchOrder || pitchOrder.length === 0) return metrics.pitchTypeMetrics;
    const canon = (name) => PITCH_ABBREV[name] || name;
    const byCode = new Map(metrics.pitchTypeMetrics.map(r => [canon(r.name), r]));
    const ordered = [];
    const used = new Set();
    for (const code of pitchOrder) {
      if (byCode.has(code)) { ordered.push(byCode.get(code)); used.add(code); }
    }
    // Append pitches not in the top table's order
    for (const r of metrics.pitchTypeMetrics) {
      const code = canon(r.name);
      if (!used.has(code)) ordered.push(r);
    }
    return ordered;
  }, [metrics, pitchOrder]);

  // Always publish the canonical order based on the FULL pitch usage (hand="all"),
  // not the currently filtered view, so toggling hand on the top table doesn't reshuffle the bottom.
  // Publish abbreviation codes (FF, SL, etc.) so different display name spellings still match.
  // PERF: when hand is "all" (the default on every load), `metrics` above IS the
  // all-hands computation, so reuse it instead of running computeMetrics twice over
  // the full season. Deps intentionally exclude hand/metrics: the order is frozen
  // from whatever the data looked like when it arrived, which is the desired behavior.
  const orderMetrics = useMemo(
    () => {
      if (!countFilteredPitches) return null;
      return (hand || "all") === "all" ? metrics : computeMetrics(countFilteredPitches, "all");
    },
    [countFilteredPitches] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    if (onComputed && orderMetrics?.pitchTypeMetrics) {
      onComputed(orderMetrics.pitchTypeMetrics.map(r => PITCH_ABBREV[r.name] || r.name));
    }
  }, [orderMetrics]);

  // Fetch real ERA + IP from boxscores whenever the underlying pitch set changes
  // Only for 2026 data — 2025 Savant CSV has complete events for pitch-level stats
  // Skip when custom date range is active — ERA endpoint returns season totals only,
  // which would override the correctly computed filtered stats.
  // Skip when count filter is active — ERA endpoint can't filter by count situation.
  useEffect(() => {
    setEra(null);
    setIpFromBox(null);
    setBoxStats(null);
    if (!rawPitches || !pitcherId || season === "2025" || !isFullSeason) return;
    if (countFilter !== "all") return;
    const gamePks = Array.from(new Set(rawPitches.map(p => p.game_pk).filter(g => g))).slice(0, 200);
    if (gamePks.length === 0) return;
    let alive = true;
    getPitcherEra(pitcherId, gamePks).then(r => {
      if (!alive) return;
      setEra(r?.era ?? null);
      setIpFromBox(r?.innings ?? null);
      setBoxStats(r ?? null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [rawPitches, pitcherId, season, isFullSeason, countFilter]);

  if (!rawPitches) return null;
  const allRow = metrics?.allRow;
  const filteredCount = metrics ? (hand === "all" ? rawPitches.length : rawPitches.filter(p => p.batter_hand === hand).length) : 0;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "16px", marginBottom: "16px", overflowX: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: C.accent }}>{label}</div>
          {sublabel && (
            <div style={{ fontSize: "11px", color: C.textDim, marginTop: "2px" }}>
              {countFilter === "all"
                ? `${(countFilteredPitches || rawPitches).length} pitches`
                : `${(countFilteredPitches || []).length} of ${rawPitches.length} pitches`}
              {hand !== "all" && ` (${filteredCount} vs ${hand}HH)`}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={countFilter}
            onChange={(e) => setCountFilter(e.target.value)}
            style={{
              background: countFilter !== "all" ? C.accentGlow : "transparent",
              border: `1px solid ${countFilter !== "all" ? C.accent : C.border}`,
              borderRadius: "4px",
              padding: "4px 10px",
              color: countFilter !== "all" ? C.accent : C.textDim,
              fontSize: "10px",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              outline: "none",
            }}
          >
            <option value="all">All Counts</option>
            <option value="pre2k">Pre-Two-Strike</option>
            <option value="two_strikes">Two Strikes</option>
            <option value="ahead">Pitcher Ahead</option>
            <option value="behind">Pitcher Behind</option>
            <option value="leverage">Leverage (0-0, 1-1)</option>
          </select>
          <div style={{ display: "flex", gap: "4px" }}>
            {[{ k: "all", l: "All" }, { k: "L", l: "vs LHH" }, { k: "R", l: "vs RHH" }].map(t => (
              <button key={t.k} onClick={() => onHandChange(t.k)} style={{
                background: hand === t.k ? C.accentGlow : "transparent",
                border: `1px solid ${hand === t.k ? C.accent : C.border}`,
                borderRadius: "4px", padding: "4px 10px",
                color: hand === t.k ? C.accent : C.textDim,
                fontSize: "10px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>{t.l}</button>
            ))}
          </div>
        </div>
      </div>
      <SummaryStatsBar rawPitches={countFilteredPitches} hand={hand} C={C} eraOverride={era} ipOverride={ipFromBox} boxStats={boxStats} />
      {!allRow ? (
        <div style={{ padding: "20px 0", color: C.textDim, fontSize: "12px" }}>No pitches match this filter.</div>
      ) : (
      <table style={{ width: "100%", minWidth: "1400px", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ background: C.accentGlow }}>
            {COMPARE_COLS.map(c => (
              <th key={c.key} style={{
                padding: "8px 6px",
                textAlign: c.align || "right",
                fontSize: "9.5px",
                fontWeight: 700,
                color: C.textDim,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                borderBottom: `1px solid ${C.border}`,
                whiteSpace: "nowrap",
                width: c.w,
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: `2px solid ${C.accent}`, background: C.accentGlow }}>
            {COMPARE_COLS.map(c => (
              <td key={c.key} style={{
                padding: "12px 6px",
                textAlign: c.align || "right",
                color: c.key === "name" ? C.accent : C.text,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}>
                {c.key === "name" ? "All"
                  : c.key === "pitchPct" ? "100%"
                  : (allRow[c.key] != null ? allRow[c.key] : "—")}
              </td>
            ))}
          </tr>
          {orderedPitchTypes.map((row, i) => {
            const code = PITCH_ABBREV[row.name] || row.name;
            const isHovered = hoveredCode === code;
            // Convert hex color to rgba with 20% opacity for highlight wash
            const hexToRgba = (hex, a) => {
              if (!hex || hex[0] !== "#") return `rgba(0,0,0,${a})`;
              const h = hex.length === 4 ? hex.replace(/(.)/g, "$1$1") : hex;
              const r = parseInt(h.slice(1, 3), 16);
              const g = parseInt(h.slice(3, 5), 16);
              const b = parseInt(h.slice(5, 7), 16);
              return `rgba(${r},${g},${b},${a})`;
            };
            return (
              <tr
                key={i}
                onMouseEnter={() => onHoverCode && onHoverCode(code)}
                onMouseLeave={() => onHoverCode && onHoverCode(null)}
                style={{
                  borderBottom: `1px solid ${C.border}`,
                  background: isHovered ? hexToRgba(row.color, 0.2) : "transparent",
                  transition: "background 0.12s ease",
                  cursor: "default",
                }}
              >
                {COMPARE_COLS.map(c => (
                <td key={c.key} style={{
                  padding: "8px 6px",
                  textAlign: c.align || "right",
                  color: C.text,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}>
                  {c.key === "name"
                    ? <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: row.color }} />
                        {row.name}
                      </span>
                    : c.key === "pitchPct"
                    ? (allRow.count > 0 ? `${Math.round((row.count / allRow.count) * 100)}%` : "—")
                    : (row[c.key] != null ? row[c.key] : "—")}
                </td>
              ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      )}
    </div>
  );
};

const ComparePage = ({ C, isMobile, teamLogos }) => {
  const [searchValue, setSearchValue] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pitcher, setPitcher] = useState(null); // { id, name, throws }
  const [topData, setTopData] = useState(null);   // 2026 full season raw pitches
  const [cmpData, setCmpData] = useState(null);   // comparison raw pitches
  const [topLoading, setTopLoading] = useState(false);
  const [cmpLoading, setCmpLoading] = useState(false);
  const [cmpMode, setCmpMode] = useState("2025"); // "2025" | "2026range"
  const [cmpStart, setCmpStart] = useState("2026-03-25");
  const [cmpEnd, setCmpEnd] = useState(new Date().toISOString().slice(0, 10));
  const [errMsg, setErrMsg] = useState("");
  const [topHand, setTopHand] = useState("all");
  const [cmpHand, setCmpHand] = useState("all");
  const [topPitchOrder, setTopPitchOrder] = useState([]);
  const [hoveredCode, setHoveredCode] = useState(null);
  // Snapshot for the "Plot Compare" section. Holds {left, right} each with
  // {pitches, label, metrics}. Set only when the button is clicked, so changing
  // dates above does NOT live-update the plots — re-click the button to refresh.
  const [plotCompare, setPlotCompare] = useState(null);
  const [topStart, setTopStart] = useState("2026-03-25");
  const [topEnd, setTopEnd] = useState(new Date().toISOString().slice(0, 10));
  const [topUseRange, setTopUseRange] = useState(false); // false = full season, true = custom range

  // Compute pitched dates from topData for calendar highlighting
  const pitchedDates = useMemo(() => {
    if (!topData) return new Set();
    return new Set(topData.map(p => p.game_date).filter(d => d && d !== "nan"));
  }, [topData]);

  const searchRef = useRef(null);
  const topEndPickerRef = useRef(null);
  const cmpEndPickerRef = useRef(null);

  // Pitcher search
  useEffect(() => {
    if (searchValue.trim().length < 2) { setSearchResults([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const data = await searchPitchers(searchValue);
        if (alive) { setSearchResults(data || []); setSearchOpen(true); }
      } catch { if (alive) setSearchResults([]); }
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [searchValue]);

  useEffect(() => {
    const h = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Sequence token so a late background merge from a previous pitcher can't
  // clobber the data after the user has already switched to a new pitcher.
  const loadSeqRef = useRef(0);

  const loadPitcher = async (p) => {
    const seq = ++loadSeqRef.current;
    setPitcher(p);
    setSearchValue(p.name);
    setSearchOpen(false);
    setTopData(null);
    setCmpData(null);
    setErrMsg("");
    setPlotCompare(null);
    setTopUseRange(false);
    setTopStart("2026-03-25");
    setTopEnd(new Date().toISOString().slice(0, 10));

    setTopLoading(true);
    try {
      // PROGRESSIVE LOAD: kick off both fetches in parallel, but render as soon
      // as cached-season returns (fast, ~hundreds of ms) instead of also waiting
      // for the live /season endpoint, which hits MLB live feeds server-side and
      // can take several seconds. Today's live data merges in quietly when ready.
      const cachedPromise = getCachedSeason(p.id).catch(() => []);
      const livePromise = getSeasonData(p.id).catch(() => []);

      const cachedRaw = await cachedPromise;
      if (seq !== loadSeqRef.current) return; // user switched pitchers mid-flight

      if (cachedRaw && cachedRaw.length > 0) {
        // PHASE 1: render immediately from the cache
        setTopData(normAndFilter(cachedRaw));
        setTopLoading(false);

        // PHASE 2: merge today's live supplement in the background when it lands.
        // Build dedup set ONLY from games that have REAL pitch data in the cache
        // (i.e. valid pitch_type, not just game_pk stubs). Otherwise cached-season's
        // empty placeholder rows for in-progress games would block today's live data.
        livePromise.then(liveRaw => {
          if (seq !== loadSeqRef.current) return;
          if (!liveRaw || liveRaw.length === 0) return;
          const cachedRealGamePks = new Set(
            cachedRaw
              .filter(q => q.game_pk && q.pitch_type && q.pitch_type.toLowerCase() !== "nan")
              .map(q => String(q.game_pk))
          );
          const liveSupplement = liveRaw.filter(q => q.game_pk && !cachedRealGamePks.has(String(q.game_pk)));
          if (liveSupplement.length === 0) return; // nothing new today - skip the re-render
          setTopData(normAndFilter([...cachedRaw, ...liveSupplement]));
        });
        return;
      }

      // FALLBACK (cache empty): Savant CSV + live merge, same as before
      const [savantRaw, liveRaw] = await Promise.all([
        getStatcast(p.id, "2026-03-25", new Date().toISOString().slice(0, 10)).catch(() => []),
        livePromise,
      ]);
      if (seq !== loadSeqRef.current) return;
      let merged;
      if (savantRaw && savantRaw.length > 0) {
        const cachedRealGamePks = new Set(
          savantRaw
            .filter(q => q.game_pk && q.pitch_type && q.pitch_type.toLowerCase() !== "nan")
            .map(q => String(q.game_pk))
        );
        const liveSupplement = (liveRaw || []).filter(q => q.game_pk && !cachedRealGamePks.has(String(q.game_pk)));
        merged = [...savantRaw, ...liveSupplement];
      } else {
        merged = liveRaw || [];
      }
      setTopData(normAndFilter(merged));
    } catch (e) {
      console.error("Top load failed", e);
      if (seq === loadSeqRef.current) setErrMsg("Failed to load 2026 season data.");
    }
    if (seq === loadSeqRef.current) setTopLoading(false);
  };

  const loadComparison = async () => {
    if (!pitcher) return;
    setCmpLoading(true);
    setErrMsg("");
    // Hard timeout: if a fetch takes more than 60s, give up so the spinner doesn't hang forever.
    const timeoutId = setTimeout(() => {
      setCmpLoading(false);
      setErrMsg("Comparison fetch timed out after 60s. Try again or pick a smaller range.");
    }, 60000);
    try {
      if (cmpMode === "2025") {
        // Use FULL statcast data (not sampled). Compare tab only renders one wide
        // row of aggregated numbers, so 3000+ pitches don't overload anything —
        // and sampling distorts PA-derived stats like K%, BB%, IP, SIERA.
        const raw = await getStatcast(pitcher.id, "2025-03-27", "2025-09-28");
        if (raw && raw.length > 0) {
          setCmpData(normAndFilter(raw));
        } else {
          setCmpData([]);
          setErrMsg("No 2025 data available for this pitcher.");
        }
      } else {
        // 2026 custom range — filter the already-loaded top data
        if (!topData) return;
        const filtered = topData.filter(p => p.game_date && p.game_date >= cmpStart && p.game_date <= cmpEnd);
        setCmpData(filtered);
      }
    } catch (e) {
      console.error("Comparison load failed", e);
      setErrMsg("Comparison failed to load. Try again.");
      setCmpData(null);
    }
    clearTimeout(timeoutId);
    setCmpLoading(false);
  };

  const cmpLabel = cmpMode === "2025" ? "2025 Full Season" : `2026 Custom Range: ${cmpStart} → ${cmpEnd}`;

  return (
    <div style={{ padding: isMobile ? "16px" : "32px", maxWidth: "1600px", margin: "0 auto" }}>
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: C.textDim, marginBottom: "6px" }}>Pitcher Compare</div>
        <div style={{ fontSize: "12px", color: C.textDim }}>Search a pitcher to load their full 2026 stats, then compare to 2025 or a custom 2026 date range.</div>
      </div>

      {/* Search bar */}
      <div ref={searchRef} style={{ position: "relative", marginBottom: "24px", maxWidth: "400px" }}>
        <input
          value={searchValue}
          onChange={e => setSearchValue(e.target.value)}
          onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
          placeholder="Search pitcher..."
          style={{
            width: "100%", padding: "10px 14px", fontSize: "13px",
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: "6px",
            color: C.text, fontFamily: "inherit",
          }}
        />
        {searchOpen && searchResults.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, marginTop: "4px",
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: "6px",
            maxHeight: "300px", overflowY: "auto", zIndex: 200,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          }}>
            {searchResults.slice(0, 12).map((r, i) => (
              <div key={i} onClick={() => loadPitcher(r)} style={{
                padding: "10px 14px", cursor: "pointer", fontSize: "12px", color: C.text,
                borderBottom: i < searchResults.length - 1 ? `1px solid ${C.border}` : "none",
              }} onMouseEnter={e => e.currentTarget.style.background = C.accentGlow}
                 onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <strong>{r.name}</strong>
                {r.team && <span style={{ color: C.textDim, marginLeft: "8px" }}>{r.team}</span>}
                {r.throws && <span style={{ color: C.textDim, marginLeft: "8px" }}>({r.throws}HP)</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {pitcher && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: C.text }}>
            {pitcher.name} {pitcher.throws && <span style={{ fontSize: "12px", color: C.textDim, marginLeft: "8px" }}>{pitcher.throws}HP</span>}
          </div>
        </div>
      )}

      {/* Top section: full 2026 */}
      {pitcher && topLoading && <div style={{ padding: "20px 0", color: C.textDim, fontSize: "12px" }}>Loading 2026 full season...</div>}
      {pitcher && !topLoading && topData && topData.length === 0 && (
        <div style={{ padding: "20px 0", color: C.textDim, fontSize: "12px" }}>No 2026 data available for this pitcher.</div>
      )}
      {pitcher && !topLoading && topData && topData.length > 0 && (() => {
        // Apply date filter if custom range is active. Convert game_date to string
        // for safe comparison (some sources may emit Date objects or formatted strings).
        const topFiltered = topUseRange
          ? topData.filter(p => {
              if (!p.game_date) return false;
              const gd = String(p.game_date).slice(0, 10);
              return gd >= topStart && gd <= topEnd;
            })
          : topData;
        const isFullSeason = !topUseRange;
        const topLabel = isFullSeason
          ? "Full 2026 Season (Statcast + Live)"
          : `2026 Custom Range (${topStart} to ${topEnd})`;
        return (
          <>
            {/* Date range controls */}
            <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "12px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: "4px" }}>
                <button onClick={() => setTopUseRange(false)} style={{
                  background: !topUseRange ? C.accentGlow : "transparent",
                  border: `1px solid ${!topUseRange ? C.accent : C.border}`,
                  borderRadius: "4px", padding: "6px 14px",
                  color: !topUseRange ? C.accent : C.textDim,
                  fontSize: "11px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>Full Season</button>
                <button onClick={() => setTopUseRange(true)} style={{
                  background: topUseRange ? C.accentGlow : "transparent",
                  border: `1px solid ${topUseRange ? C.accent : C.border}`,
                  borderRadius: "4px", padding: "6px 14px",
                  color: topUseRange ? C.accent : C.textDim,
                  fontSize: "11px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>Custom Range</button>
              </div>
              {topUseRange && (
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <DatePickerWithHighlights value={topStart} onChange={setTopStart} pitchedDates={pitchedDates} C={C} label="Start"
                    onAfterSelect={() => { if (topEndPickerRef.current) topEndPickerRef.current.querySelector("button").click(); }} />
                  <span style={{ color: C.textDim, fontSize: "11px" }}>to</span>
                  <div ref={topEndPickerRef}>
                    <DatePickerWithHighlights value={topEnd} onChange={setTopEnd} pitchedDates={pitchedDates} C={C} label="End" />
                  </div>
                </div>
              )}
            </div>
            <CompareTable
              rawPitches={topFiltered}
              label={topLabel}
              sublabel={`${topFiltered.length} pitches`}
              C={C}
              isMobile={isMobile}
              hand={topHand}
              onHandChange={setTopHand}
              pitcherId={pitcher.id}
              onComputed={setTopPitchOrder}
              hoveredCode={hoveredCode}
              onHoverCode={setHoveredCode}
              season="2026"
              isFullSeason={isFullSeason}
            />
          </>
        );
      })()}

      {/* Bottom section: comparison */}
      {pitcher && topData && (
        <>
          <div style={{ marginTop: "32px", marginBottom: "12px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: C.textDim }}>Compare To</div>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
            <select
              value={cmpMode}
              onChange={e => { setCmpMode(e.target.value); setCmpData(null); setErrMsg(""); }}
              style={{
                padding: "8px 12px", fontSize: "12px",
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: "6px",
                color: C.text, fontFamily: "inherit", cursor: "pointer",
              }}
            >
              <option value="2025">Full 2025 Season</option>
              <option value="2026range">Custom 2026 Range</option>
            </select>
            {cmpMode === "2026range" && (
              <>
                <DatePickerWithHighlights value={cmpStart} onChange={setCmpStart} pitchedDates={pitchedDates} C={C} label="Start"
                  onAfterSelect={() => { if (cmpEndPickerRef.current) cmpEndPickerRef.current.querySelector("button").click(); }} />
                <span style={{ color: C.textDim, fontSize: "11px" }}>to</span>
                <div ref={cmpEndPickerRef}>
                  <DatePickerWithHighlights value={cmpEnd} onChange={setCmpEnd} pitchedDates={pitchedDates} C={C} label="End" />
                </div>
              </>
            )}
            <button onClick={loadComparison} disabled={cmpLoading} style={{
              padding: "8px 18px", fontSize: "11px", fontWeight: 600, letterSpacing: "1px",
              textTransform: "uppercase", background: C.accent, color: "#fff",
              border: "none", borderRadius: "6px", cursor: cmpLoading ? "wait" : "pointer", fontFamily: "inherit",
            }}>
              {cmpLoading ? "Loading..." : "Load Comparison"}
            </button>
          </div>

          {errMsg && <div style={{ padding: "12px", color: "#ef4444", fontSize: "12px", marginBottom: "12px" }}>{errMsg}</div>}
          {cmpLoading && <div style={{ padding: "20px 0", color: C.textDim, fontSize: "12px" }}>Loading comparison...</div>}
          {!cmpLoading && cmpData && cmpData.length > 0 && (
            <CompareTable
              rawPitches={cmpData}
              label={cmpLabel}
              sublabel={`${cmpData.length} pitches`}
              C={C}
              isMobile={isMobile}
              hand={cmpHand}
              onHandChange={setCmpHand}
              pitcherId={pitcher.id}
              pitchOrder={topPitchOrder}
              hoveredCode={hoveredCode}
              onHoverCode={setHoveredCode}
              season={cmpMode === "2025" ? "2025" : "2026"}
              isFullSeason={false}
            />
          )}

          {/* "View as Heatmap Compare" button - shows when a comparison is loaded.
              Opens a new tab pre-configured with the same pitcher + date selections,
              defaulting to the Gaussian-Granular heatmap style. */}
          {!cmpLoading && cmpData && cmpData.length > 0 && pitcher && (
            <div style={{ marginTop: "20px", textAlign: "center" }}>
              <button
                onClick={() => {
                  // Build URL params. Columns are ordered CHRONOLOGICALLY:
                  // older period on the LEFT, newer period on the RIGHT.
                  const params = new URLSearchParams();
                  params.set("pitcher_id", String(pitcher.id));
                  if (pitcher.name) params.set("pitcher_name", pitcher.name);
                  if (pitcher.throws) params.set("pitcher_hand", pitcher.throws);

                  // Describe each section as a {mode, start, end} config
                  const topCfg = topUseRange
                    ? { mode: "2026range", start: topStart, end: topEnd, sortKey: topStart }
                    : { mode: "2026", sortKey: "2026-03-25" };
                  const bottomCfg = cmpMode === "2025"
                    ? { mode: "2025", sortKey: "2025-03-27" }
                    : { mode: "2026range", start: cmpStart, end: cmpEnd, sortKey: cmpStart };

                  // Older period (earlier start date) goes left; ISO date strings compare correctly
                  const leftCfg = bottomCfg.sortKey <= topCfg.sortKey ? bottomCfg : topCfg;
                  const rightCfg = leftCfg === bottomCfg ? topCfg : bottomCfg;

                  params.set("left_mode", leftCfg.mode);
                  if (leftCfg.start) { params.set("left_start", leftCfg.start); params.set("left_end", leftCfg.end); }
                  params.set("right_mode", rightCfg.mode);
                  if (rightCfg.start) { params.set("right_start", rightCfg.start); params.set("right_end", rightCfg.end); }

                  params.set("style", "gaussian_granular");

                  // Open new tab to the same site with the params attached.
                  // Use an anchor-click rather than window.open() — browsers treat this
                  // as a genuine user-initiated navigation, so it's far less likely to be
                  // blocked by popup blockers and reliably opens a new tab (not a window).
                  const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
                  const a = document.createElement("a");
                  a.href = url;
                  a.target = "_blank";
                  a.rel = "noopener noreferrer";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
                style={{
                  background: C.accent,
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  padding: "10px 20px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "0.5px",
                }}
              >
                🔥 View as Heatmap Compare
              </button>
              <button
                onClick={() => {
                  // Snapshot the CURRENT selections. Plots won't change until this
                  // button is clicked again with new windows selected.
                  const topPitches = topUseRange
                    ? (topData || []).filter(p => {
                        if (!p.game_date) return false;
                        const gd = String(p.game_date).slice(0, 10);
                        return gd >= topStart && gd <= topEnd;
                      })
                    : (topData || []);
                  const topSnap = {
                    count: topPitches.length,
                    label: topUseRange ? `2026: ${topStart} → ${topEnd}` : "2026 Full Season",
                    metrics: computeMetrics(topPitches, "all"),
                  };
                  const botSnap = {
                    count: (cmpData || []).length,
                    label: cmpMode === "2025" ? "2025 Full Season" : `2026: ${cmpStart} → ${cmpEnd}`,
                    metrics: computeMetrics(cmpData, "all"),
                  };
                  // Chronological order: older period left, newer right
                  const topKey = topUseRange ? topStart : "2026-03-25";
                  const botKey = cmpMode === "2025" ? "2025-03-27" : cmpStart;
                  const [left, right] = botKey <= topKey ? [botSnap, topSnap] : [topSnap, botSnap];
                  setPlotCompare({ left, right });
                }}
                style={{
                  background: "transparent",
                  color: C.accent,
                  border: `1px solid ${C.accent}`,
                  borderRadius: "6px",
                  padding: "10px 20px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "0.5px",
                  marginLeft: "10px",
                }}
              >
                📍 Plot Compare
              </button>
            </div>
          )}

          {/* Plot Compare section - frozen snapshot, older left / newer right.
              Memoized so table hovers and other state churn don't re-render it. */}
          <PlotCompareSection snapshot={plotCompare} C={C} isMobile={isMobile} onClear={setPlotCompare} />
        </>
      )}
    </div>
  );
};

// ─── Heatmaps Page (per-pitch-type heatmap grid) ───
const HeatmapsPage = ({ C, isMobile }) => {
  const [searchValue, setSearchValue] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pitcher, setPitcher] = useState(null);
  const [year, setYear] = useState("2026");
  const [hand, setHand] = useState("all");
  const [hmMode, setHmMode] = useState("frequency"); // "frequency" | "whiffs" | "damage"
  const [hmStyle, setHmStyle] = useState("gaussian"); // "gaussian" | "gaussian_granular"
  const [pitchData, setPitchData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  // 2026 date range filter (single-view mode)
  const [startDate, setStartDate] = useState("2026-03-25");
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  // ─── Compare-mode state ───
  // When compareMode is true, side-by-side view with independent date selectors per column.
  // Each column has its own mode + dates. mode is "2026" (Full Season), "2025" (Full Season),
  // or "2026range" (custom date range within 2026).
  const [compareMode, setCompareMode] = useState(false);
  const [leftMode, setLeftMode] = useState("2026");       // left column default: 2026 Full Season
  const [leftStart, setLeftStart] = useState("2026-03-25");
  const [leftEnd, setLeftEnd] = useState(new Date().toISOString().slice(0, 10));
  const [rightMode, setRightMode] = useState("2025");     // right column default: 2025 Full Season
  const [rightStart, setRightStart] = useState("2026-03-25");
  const [rightEnd, setRightEnd] = useState(new Date().toISOString().slice(0, 10));
  // Per-column raw pitch data (loaded independently in compare mode)
  const [leftData, setLeftData] = useState(null);
  const [rightData, setRightData] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);

  // ─── URL param handler: lets the Compare tool open a pre-configured heatmap compare view ───
  // Expected params (all optional, but should be passed together):
  //   pitcher_id  - MLB ID, used to construct pitcher object
  //   pitcher_name - display name
  //   pitcher_hand - "L" or "R"
  //   left_mode  - "2026" | "2025" | "2026range"
  //   left_start, left_end - YYYY-MM-DD (only when left_mode = "2026range")
  //   right_mode - "2026" | "2025" | "2026range"
  //   right_start, right_end - YYYY-MM-DD (only when right_mode = "2026range")
  //   style - "gaussian" | "gaussian_granular" (defaults to gaussian_granular when launched from Compare)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("pitcher_id");
    if (!pid) return;
    const name = params.get("pitcher_name") || "";
    const throws = params.get("pitcher_hand") || "";
    const lMode = params.get("left_mode");
    const lStart = params.get("left_start");
    const lEnd = params.get("left_end");
    const rMode = params.get("right_mode");
    const rStart = params.get("right_start");
    const rEnd = params.get("right_end");
    const style = params.get("style");

    // Apply each setting if present. Open compare view and load the pitcher.
    if (lMode) setLeftMode(lMode);
    if (lStart) setLeftStart(lStart);
    if (lEnd) setLeftEnd(lEnd);
    if (rMode) setRightMode(rMode);
    if (rStart) setRightStart(rStart);
    if (rEnd) setRightEnd(rEnd);
    if (style === "gaussian" || style === "gaussian_granular") setHmStyle(style);

    setCompareMode(true);
    setPitcher({ id: parseInt(pid, 10), name, throws });
    setSearchValue(name);
    // Clear the URL params after consuming them so refreshes don't re-trigger
    try {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, "", cleanUrl);
    } catch (e) { /* fine if browser blocks this */ }
  }, []); // run once on mount

  const searchRef = useRef(null);
  const hmEndPickerRef = useRef(null);

  // Compute pitched dates from loaded data for calendar highlighting
  const pitchedDates = useMemo(() => {
    if (!pitchData) return new Set();
    return new Set(pitchData.map(p => p.game_date).filter(d => d && d !== "nan"));
  }, [pitchData]);

  // Compare-mode: each column's pitched-dates set comes from that column's loaded data.
  // Only includes 2026 dates (custom range only operates on 2026); 2025 dates filtered out.
  const leftPitchedDates = useMemo(() => {
    if (!leftData) return new Set();
    return new Set(
      leftData
        .map(p => p.game_date)
        .filter(d => d && d !== "nan" && d.startsWith("2026"))
    );
  }, [leftData]);
  const rightPitchedDates = useMemo(() => {
    if (!rightData) return new Set();
    return new Set(
      rightData
        .map(p => p.game_date)
        .filter(d => d && d !== "nan" && d.startsWith("2026"))
    );
  }, [rightData]);

  // Search
  useEffect(() => {
    if (searchValue.trim().length < 2) { setSearchResults([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const data = await searchPitchers(searchValue);
        if (alive) { setSearchResults(data || []); setSearchOpen(true); }
      } catch { if (alive) setSearchResults([]); }
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [searchValue]);

  useEffect(() => {
    const h = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Load data when pitcher or year changes
  useEffect(() => {
    if (!pitcher) return;
    let alive = true;
    const load = async () => {
      setLoading(true);
      setErrMsg("");
      setPitchData(null);
      try {
        let raw = [];
        if (year === "2026") {
          // Try cached data first (instant if local), fall back to Savant CSV
          const [cachedRaw, liveRaw] = await Promise.all([
            getCachedSeason(pitcher.id).catch(() => []),
            getSeasonData(pitcher.id).catch(() => []),
          ]);
          let savantRaw = cachedRaw && cachedRaw.length > 0 ? cachedRaw :
            await getStatcast(pitcher.id, "2026-03-25", new Date().toISOString().slice(0, 10)).catch(() => []);
          if (savantRaw && savantRaw.length > 0) {
            // Only dedup by game_pk for games with REAL pitch data in cache.
            // Stubs (game_pk only, no pitch_type) shouldn't block today's live pitches.
            const cachedRealGamePks = new Set(
              savantRaw
                .filter(p => p.game_pk && p.pitch_type && p.pitch_type.toLowerCase() !== "nan")
                .map(p => String(p.game_pk))
            );
            const liveSupplement = (liveRaw || []).filter(p => p.game_pk && !cachedRealGamePks.has(String(p.game_pk)));
            raw = [...savantRaw, ...liveSupplement];
          } else {
            raw = liveRaw || [];
          }
        } else {
          raw = await getStatcast(pitcher.id, "2025-03-27", "2025-09-28");
        }
        if (!alive) return;
        if (raw && raw.length > 0) {
          setPitchData(normAndFilter(raw));
        } else {
          setPitchData([]);
          setErrMsg(`No ${year} data available for this pitcher.`);
        }
      } catch (e) {
        console.error("Heatmaps load failed", e);
        if (alive) setErrMsg("Failed to load data.");
      }
      if (alive) setLoading(false);
    };
    load();
    return () => { alive = false; };
  }, [pitcher, year]);

  const loadPitcher = (p) => {
    setPitcher(p);
    setSearchValue(p.name);
    setSearchOpen(false);
  };

  // ─── Helper to load data for a given mode ("2026" full season or "2025" full season) ───
  // Returns a normalized pitch array (same shape as `pitchData`).
  // Date filtering happens later in the grouping step; this returns the whole period.
  const loadDataForMode = async (pitcherId, mode) => {
    if (mode === "2025") {
      const raw = await getStatcast(pitcherId, "2025-03-27", "2025-09-28").catch(() => []);
      return raw && raw.length > 0 ? normAndFilter(raw) : [];
    }
    // "2026" or "2026range" - use cached + live merge
    const [cachedRaw, liveRaw] = await Promise.all([
      getCachedSeason(pitcherId).catch(() => []),
      getSeasonData(pitcherId).catch(() => []),
    ]);
    let savantRaw = cachedRaw && cachedRaw.length > 0 ? cachedRaw :
      await getStatcast(pitcherId, "2026-03-25", new Date().toISOString().slice(0, 10)).catch(() => []);
    let raw;
    if (savantRaw && savantRaw.length > 0) {
      const cachedRealGamePks = new Set(
        savantRaw.filter(p => p.game_pk && p.pitch_type && p.pitch_type.toLowerCase() !== "nan")
          .map(p => String(p.game_pk))
      );
      const liveSupplement = (liveRaw || []).filter(p => p.game_pk && !cachedRealGamePks.has(String(p.game_pk)));
      raw = [...savantRaw, ...liveSupplement];
    } else {
      raw = liveRaw || [];
    }
    return raw && raw.length > 0 ? normAndFilter(raw) : [];
  };

  // ─── Compare-mode data loader ───
  // Loads both columns in parallel whenever pitcher, leftMode, or rightMode changes.
  // Date-range modes ("2026range") still load full 2026 data here; filtering happens at render time.
  useEffect(() => {
    if (!compareMode || !pitcher) return;
    let alive = true;
    const loadBoth = async () => {
      setCompareLoading(true);
      setErrMsg("");
      try {
        // Coalesce "2026range" to "2026" for the actual fetch
        const leftFetchMode = leftMode === "2026range" ? "2026" : leftMode;
        const rightFetchMode = rightMode === "2026range" ? "2026" : rightMode;
        const [leftResult, rightResult] = await Promise.all([
          loadDataForMode(pitcher.id, leftFetchMode),
          loadDataForMode(pitcher.id, rightFetchMode),
        ]);
        if (!alive) return;
        setLeftData(leftResult);
        setRightData(rightResult);
      } catch (e) {
        console.error("Heatmap compare load failed", e);
        if (alive) setErrMsg("Failed to load comparison data.");
      }
      if (alive) setCompareLoading(false);
    };
    loadBoth();
    return () => { alive = false; };
  }, [compareMode, pitcher, leftMode, rightMode]);

  // Filter pitch data by hand, date range, and mode (frequency/whiffs/damage), then group by pitch_name
  const filteredGroups = useMemo(() => {
    if (!pitchData) return null;
    const isXBH = (ev) => {
      const e = (ev || "").toLowerCase();
      return e === "double" || e === "triple" || e === "home_run";
    };
    const passesMode = (p) => {
      if (hmMode === "frequency") return true;
      if (hmMode === "whiffs") return p.is_whiff;
      if (hmMode === "damage") {
        // Both gaussian variants: show all balls in play (canvas weights by xwOBA)
        return p.is_in_play;
      }
      return true;
    };
    const filtered = pitchData.filter(p => {
      if (hand !== "all" && p.batter_hand !== hand) return false;
      if (year === "2026" && p.game_date) {
        if (p.game_date < startDate || p.game_date > endDate) return false;
      }
      if (p.plate_x == null || p.plate_z == null) return false;
      return passesMode(p);
    });
    const groups = new Map();
    for (const p of filtered) {
      const name = p.pitch_name || "Unknown";
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(p);
    }
    // Canonical pitch type ordering (fastballs → offspeed → breaking)
    const CANONICAL_ORDER = ["FF", "SI", "FC", "CH", "FS", "FO", "SC", "CU", "KC", "SL", "ST", "SV"];
    const orderIndex = (code) => {
      const idx = CANONICAL_ORDER.indexOf(code);
      return idx >= 0 ? idx : 999; // unknown types go to end
    };
    return Array.from(groups.entries())
      .map(([name, pitches]) => ({
        name,
        code: PITCH_ABBREV[name] || pitches[0]?.pitch_type || "—",
        color: getPitchColor(name),
        pitches,
      }))
      .sort((a, b) => orderIndex(a.code) - orderIndex(b.code));
  }, [pitchData, hand, year, startDate, endDate, hmMode, hmStyle]);

  const totalPitchCount = filteredGroups ? filteredGroups.reduce((s, g) => s + g.pitches.length, 0) : 0;

  // ─── Per-column groups for compare mode ───
  // Same grouping logic as filteredGroups, but parameterized per column.
  // Date filtering uses each column's own mode/range.
  const buildGroupsForColumn = (data, colMode, colStart, colEnd) => {
    if (!data) return null;
    const passesMode = (p) => {
      if (hmMode === "frequency") return true;
      if (hmMode === "whiffs") return p.is_whiff;
      if (hmMode === "damage") return p.is_in_play;
      return true;
    };
    const filtered = data.filter(p => {
      if (hand !== "all" && p.batter_hand !== hand) return false;
      // Apply date filter only when column is in 2026range mode
      if (colMode === "2026range" && p.game_date) {
        if (p.game_date < colStart || p.game_date > colEnd) return false;
      }
      if (p.plate_x == null || p.plate_z == null) return false;
      return passesMode(p);
    });
    const groups = new Map();
    for (const p of filtered) {
      const name = p.pitch_name || "Unknown";
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(p);
    }
    return groups;
  };

  // Build the combined comparison: union of pitch types across both columns,
  // each entry has left + right pitch arrays for that type.
  const compareGroups = useMemo(() => {
    if (!compareMode) return null;
    const leftGroups = buildGroupsForColumn(leftData, leftMode, leftStart, leftEnd);
    const rightGroups = buildGroupsForColumn(rightData, rightMode, rightStart, rightEnd);
    if (!leftGroups && !rightGroups) return null;

    // Union of pitch type names across both columns
    const allNames = new Set();
    if (leftGroups) for (const n of leftGroups.keys()) allNames.add(n);
    if (rightGroups) for (const n of rightGroups.keys()) allNames.add(n);

    const CANONICAL_ORDER = ["FF", "SI", "FC", "CH", "FS", "FO", "SC", "CU", "KC", "SL", "ST", "SV"];
    const orderIndex = (code) => {
      const idx = CANONICAL_ORDER.indexOf(code);
      return idx >= 0 ? idx : 999;
    };

    const rows = Array.from(allNames).map(name => {
      const leftPitches = leftGroups?.get(name) || [];
      const rightPitches = rightGroups?.get(name) || [];
      const samplePitch = leftPitches[0] || rightPitches[0];
      return {
        name,
        code: PITCH_ABBREV[name] || samplePitch?.pitch_type || "—",
        color: getPitchColor(name),
        leftPitches,
        rightPitches,
      };
    });
    rows.sort((a, b) => orderIndex(a.code) - orderIndex(b.code));
    return rows;
  }, [compareMode, leftData, rightData, leftMode, rightMode, leftStart, leftEnd, rightStart, rightEnd, hand, hmMode]);

  return (
    <div style={{ padding: isMobile ? "16px" : "32px", maxWidth: "1600px", margin: "0 auto" }}>
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: C.textDim, marginBottom: "6px" }}>Heatmaps</div>
        <div style={{ fontSize: "12px", color: C.textDim }}>Per-pitch-type pitch location heatmaps. Search a pitcher to load.</div>
      </div>

      {/* Search */}
      <div ref={searchRef} style={{ position: "relative", marginBottom: "20px", maxWidth: "400px" }}>
        <input
          value={searchValue}
          onChange={e => setSearchValue(e.target.value)}
          onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
          placeholder="Search pitcher..."
          style={{
            width: "100%", padding: "10px 14px", fontSize: "13px",
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: "6px",
            color: C.text, fontFamily: "inherit",
          }}
        />
        {searchOpen && searchResults.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, marginTop: "4px",
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: "6px",
            maxHeight: "300px", overflowY: "auto", zIndex: 200,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          }}>
            {searchResults.slice(0, 12).map((r, i) => (
              <div key={i} onClick={() => loadPitcher(r)} style={{
                padding: "10px 14px", cursor: "pointer", fontSize: "12px", color: C.text,
                borderBottom: i < searchResults.length - 1 ? `1px solid ${C.border}` : "none",
              }} onMouseEnter={e => e.currentTarget.style.background = C.accentGlow}
                 onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <strong>{r.name}</strong>
                {r.team && <span style={{ color: C.textDim, marginLeft: "8px" }}>{r.team}</span>}
                {r.throws && <span style={{ color: C.textDim, marginLeft: "8px" }}>({r.throws}HP)</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pitcher header */}
      {pitcher && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: C.text }}>
            {pitcher.name}{pitcher.throws && <span style={{ fontSize: "12px", color: C.textDim, marginLeft: "8px" }}>{pitcher.throws}HP</span>}
          </div>
        </div>
      )}

      {/* Controls */}
      {pitcher && (
        <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center" }}>
          {/* Year toggle - hidden in compare mode (each column has its own) */}
          {!compareMode && (
            <div style={{ display: "flex", gap: "4px" }}>
              {[{ k: "2026", l: "2026" }, { k: "2025", l: "2025" }].map(t => (
                <button key={t.k} onClick={() => setYear(t.k)} style={{
                  background: year === t.k ? C.accentGlow : "transparent",
                  border: `1px solid ${year === t.k ? C.accent : C.border}`,
                  borderRadius: "4px", padding: "6px 14px",
                  color: year === t.k ? C.accent : C.textDim,
                  fontSize: "11px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>{t.l}</button>
              ))}
            </div>
          )}

          {/* Hand toggle - shared across both modes */}
          <div style={{ display: "flex", gap: "4px" }}>
            {[{ k: "all", l: "All" }, { k: "L", l: "vs LHH" }, { k: "R", l: "vs RHH" }].map(t => (
              <button key={t.k} onClick={() => setHand(t.k)} style={{
                background: hand === t.k ? C.accentGlow : "transparent",
                border: `1px solid ${hand === t.k ? C.accent : C.border}`,
                borderRadius: "4px", padding: "6px 14px",
                color: hand === t.k ? C.accent : C.textDim,
                fontSize: "11px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>{t.l}</button>
            ))}
          </div>

          {/* Mode toggle - shared */}
          <div style={{ display: "flex", gap: "4px" }}>
            {[{ k: "frequency", l: "Frequency" }, { k: "whiffs", l: "Whiffs" }, { k: "damage", l: "Damage" }].map(t => (
              <button key={t.k} onClick={() => setHmMode(t.k)} style={{
                background: hmMode === t.k ? C.accentGlow : "transparent",
                border: `1px solid ${hmMode === t.k ? C.accent : C.border}`,
                borderRadius: "4px", padding: "6px 14px",
                color: hmMode === t.k ? C.accent : C.textDim,
                fontSize: "11px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>{t.l}</button>
            ))}
          </div>

          {/* Style toggle - shared */}
          <div style={{ display: "flex", gap: "4px" }}>
            {[{ k: "gaussian", l: "Gaussian" }, { k: "gaussian_granular", l: "Gaussian - Granular" }].map(t => (
              <button key={t.k} onClick={() => setHmStyle(t.k)} style={{
                background: hmStyle === t.k ? C.accentGlow : "transparent",
                border: `1px solid ${hmStyle === t.k ? C.accent : C.border}`,
                borderRadius: "4px", padding: "6px 14px",
                color: hmStyle === t.k ? C.accent : C.textDim,
                fontSize: "11px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>{t.l}</button>
            ))}
          </div>

          {/* Date pickers (single-view 2026 only) */}
          {!compareMode && year === "2026" && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: C.textDim, letterSpacing: "1px", textTransform: "uppercase" }}>Range</span>
              <DatePickerWithHighlights value={startDate} onChange={setStartDate} pitchedDates={pitchedDates} C={C} label="Start"
                onAfterSelect={() => { if (hmEndPickerRef.current) hmEndPickerRef.current.querySelector("button").click(); }} />
              <span style={{ color: C.textDim, fontSize: "11px" }}>to</span>
              <div ref={hmEndPickerRef}>
                <DatePickerWithHighlights value={endDate} onChange={setEndDate} pitchedDates={pitchedDates} C={C} label="End" />
              </div>
            </div>
          )}

          {/* Compare button - toggles side-by-side view */}
          <button onClick={() => setCompareMode(m => !m)} style={{
            background: compareMode ? C.accent : "transparent",
            border: `1px solid ${compareMode ? C.accent : C.border}`,
            borderRadius: "4px", padding: "6px 14px",
            color: compareMode ? "#fff" : C.textDim,
            fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            letterSpacing: "0.5px",
          }}>
            {compareMode ? "✕ Close Compare" : "Compare"}
          </button>

          {!compareMode && totalPitchCount > 0 && (
            <span style={{ fontSize: "11px", color: C.accent, fontWeight: 600 }}>{totalPitchCount} pitches</span>
          )}
        </div>
      )}

      {/* ─── Compare mode: per-column controls + side-by-side grid ─── */}
      {compareMode && pitcher && (
        <div style={{ maxWidth: isMobile ? "100%" : "900px", margin: "0 auto" }}>
          {/* Per-column date selectors */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 1fr", gap: "16px", marginBottom: "20px", alignItems: "start" }}>
            {/* LEFT column controls */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.accent, marginBottom: "8px" }}>Left Column</div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                {[{ k: "2026", l: "2026 Full" }, { k: "2025", l: "2025 Full" }, { k: "2026range", l: "Custom Range" }].map(t => (
                  <button key={t.k} onClick={() => setLeftMode(t.k)} style={{
                    background: leftMode === t.k ? C.accentGlow : "transparent",
                    border: `1px solid ${leftMode === t.k ? C.accent : C.border}`,
                    borderRadius: "4px", padding: "4px 10px",
                    color: leftMode === t.k ? C.accent : C.textDim,
                    fontSize: "10px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}>{t.l}</button>
                ))}
              </div>
              {leftMode === "2026range" && (
                <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "4px" }}>
                  <DatePickerWithHighlights value={leftStart} onChange={setLeftStart} pitchedDates={leftPitchedDates} C={C} label="Start" />
                  <span style={{ fontSize: "10px", color: C.textDim }}>to</span>
                  <DatePickerWithHighlights value={leftEnd} onChange={setLeftEnd} pitchedDates={leftPitchedDates} C={C} label="End" />
                </div>
              )}
            </div>

            {/* Center spacer (empty - matches pitch type name column in grid) */}
            <div />

            {/* RIGHT column controls */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.accent, marginBottom: "8px" }}>Right Column</div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                {[{ k: "2026", l: "2026 Full" }, { k: "2025", l: "2025 Full" }, { k: "2026range", l: "Custom Range" }].map(t => (
                  <button key={t.k} onClick={() => setRightMode(t.k)} style={{
                    background: rightMode === t.k ? C.accentGlow : "transparent",
                    border: `1px solid ${rightMode === t.k ? C.accent : C.border}`,
                    borderRadius: "4px", padding: "4px 10px",
                    color: rightMode === t.k ? C.accent : C.textDim,
                    fontSize: "10px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}>{t.l}</button>
                ))}
              </div>
              {rightMode === "2026range" && (
                <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "4px" }}>
                  <DatePickerWithHighlights value={rightStart} onChange={setRightStart} pitchedDates={rightPitchedDates} C={C} label="Start" />
                  <span style={{ fontSize: "10px", color: C.textDim }}>to</span>
                  <DatePickerWithHighlights value={rightEnd} onChange={setRightEnd} pitchedDates={rightPitchedDates} C={C} label="End" />
                </div>
              )}
            </div>
          </div>

          {/* Compare loading / errors */}
          {compareLoading && <div style={{ padding: "40px 0", color: C.textDim, fontSize: "12px", textAlign: "center" }}>Loading comparison data...</div>}
          {errMsg && !compareLoading && <div style={{ padding: "12px", color: "#ef4444", fontSize: "12px", marginBottom: "12px" }}>{errMsg}</div>}

          {/* Side-by-side grid: pitch type rows, left tile / name / right tile */}
          {!compareLoading && compareGroups && compareGroups.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {compareGroups.map(row => (
                <CompareRow key={row.name} row={row} C={C} hmStyle={hmStyle} hmMode={hmMode} hand={hand} isMobile={isMobile} />
              ))}
            </div>
          )}

          {!compareLoading && compareGroups && compareGroups.length === 0 && pitcher && (
            <div style={{ padding: "40px 0", color: C.textDim, fontSize: "12px", textAlign: "center" }}>No pitches match the current filters in either column.</div>
          )}

          {/* Legend (shared) */}
          {compareGroups && compareGroups.length > 0 && (
            <div style={{ marginTop: "20px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "10px", fontWeight: 600, color: C.textDim, letterSpacing: "1px", textTransform: "uppercase" }}>
                {hmMode === "frequency" ? "Pitch Frequency" : hmMode === "whiffs" ? "Swing-and-Miss Density" : "Expected Damage (xwOBA)"}
              </span>
              <span style={{ fontSize: "10px", color: C.textDim }}>Low</span>
              <div style={{
                width: "180px", height: "10px", borderRadius: "3px",
                background: (hmMode === "damage" || hmMode === "whiffs")
                  ? "linear-gradient(to right, #0a0a12, #0050c8, #ffffff, #ff6644, #ff0000)"
                  : "linear-gradient(to right, #0a0a12, #0050ff, #00c8ff, #00ff66, #ffff00, #ff4400)",
              }} />
              <span style={{ fontSize: "10px", color: C.textDim }}>High</span>
            </div>
          )}
        </div>
      )}

      {/* ─── Single-view mode (existing behavior) ─── */}
      {!compareMode && (
        <>
          {/* Loading / errors */}
          {loading && <div style={{ padding: "40px 0", color: C.textDim, fontSize: "12px" }}>Loading {year} data...</div>}
          {errMsg && !loading && <div style={{ padding: "12px", color: "#ef4444", fontSize: "12px", marginBottom: "12px" }}>{errMsg}</div>}
          {!loading && pitchData && totalPitchCount === 0 && pitcher && !errMsg && (
            <div style={{ padding: "40px 0", color: C.textDim, fontSize: "12px" }}>No pitches match the current filters.</div>
          )}

          {/* Heatmap grid: max 4 across, additional rows wrap */}
          {filteredGroups && filteredGroups.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: "20px" }}>
              {filteredGroups.map(g => (
                <HeatmapTile key={g.name} group={g} C={C} hmStyle={hmStyle} hmMode={hmMode} hand={hand} />
              ))}
            </div>
          )}

          {/* Legend */}
          {filteredGroups && filteredGroups.length > 0 && (
            <div style={{ marginTop: "20px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "10px", fontWeight: 600, color: C.textDim, letterSpacing: "1px", textTransform: "uppercase" }}>
                {hmMode === "frequency" ? "Pitch Frequency" : hmMode === "whiffs" ? "Swing-and-Miss Density"
                  : "Expected Damage (xwOBA)"}
              </span>
              <span style={{ fontSize: "10px", color: C.textDim }}>Low</span>
              <div style={{
                width: "180px", height: "10px", borderRadius: "3px",
                background: (hmMode === "damage" || hmMode === "whiffs")
                  ? "linear-gradient(to right, #0a0a12, #0050c8, #ffffff, #ff6644, #ff0000)"
                  : "linear-gradient(to right, #0a0a12, #0050ff, #00c8ff, #00ff66, #ffff00, #ff4400)",
              }} />
              <span style={{ fontSize: "10px", color: C.textDim }}>High</span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const HeatmapTile = ({ group, C, hmStyle, hmMode, hand }) => {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 220, h: 220 });
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setSize({ w: Math.floor(r.width * 2), h: Math.floor(r.width * 2) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);
  const isGaussian = hmStyle === "gaussian" || hmStyle === "gaussian_granular";
  const isGranular = hmStyle === "gaussian_granular";
  return (
    <div style={{ background: isGaussian ? "#0a0a12" : C.surface, border: `1px solid ${isGaussian ? "#222" : C.border}`, borderRadius: "8px", padding: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: group.color }} />
          <span style={{ fontSize: "12px", fontWeight: 700, color: isGaussian ? "#e0e0e0" : C.text }}>{group.name}</span>
        </div>
        <span style={{ fontSize: "10px", color: isGaussian ? "#888" : C.textDim, fontVariantNumeric: "tabular-nums" }}>{group.pitches.length}</span>
      </div>
      <div ref={containerRef} style={{ width: "100%", aspectRatio: "1/1", borderRadius: "4px", overflow: "hidden" }}>
        {isGaussian
          ? <GaussianHeatmapCanvas pitches={group.pitches} width={size.w} height={size.h} mode={hmMode} hand={hand} granular={isGranular} />
          : <HeatmapCanvas pitches={group.pitches} width={size.w} height={size.h} C={C} />
        }
      </div>
    </div>
  );
};

// ─── CompareRow: a single row in the side-by-side comparison view ───
// Layout: [left tile] [pitch type name + color dot] [right tile]
// Each tile is rendered with the same Gaussian canvas the single-view uses.
const CompareRow = ({ row, C, hmStyle, hmMode, hand, isMobile }) => {
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const [leftSize, setLeftSize] = useState({ w: 220, h: 220 });
  const [rightSize, setRightSize] = useState({ w: 220, h: 220 });

  useEffect(() => {
    if (!leftRef.current) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setLeftSize({ w: Math.floor(r.width * 2), h: Math.floor(r.width * 2) });
    });
    ro.observe(leftRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!rightRef.current) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setRightSize({ w: Math.floor(r.width * 2), h: Math.floor(r.width * 2) });
    });
    ro.observe(rightRef.current);
    return () => ro.disconnect();
  }, []);

  const isGranular = hmStyle === "gaussian_granular";

  const renderTile = (pitches, containerRef, size) => (
    <div style={{ background: "#0a0a12", border: "1px solid #222", borderRadius: "8px", padding: "12px" }}>
      <div style={{ fontSize: "10px", color: "#888", marginBottom: "6px", textAlign: "right" }}>{pitches.length} pitches</div>
      <div ref={containerRef} style={{ width: "100%", aspectRatio: "1/1", borderRadius: "4px", overflow: "hidden" }}>
        {pitches.length > 0
          ? <GaussianHeatmapCanvas pitches={pitches} width={size.w} height={size.h} mode={hmMode} hand={hand} granular={isGranular} />
          : <div style={{ width: "100%", height: "100%", background: "#0a0a12", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: "11px" }}>No data</div>
        }
      </div>
    </div>
  );

  if (isMobile) {
    // On mobile: stack the columns vertically with the name at the top
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", justifyContent: "center" }}>
          <span style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "50%", background: row.color }} />
          <span style={{ fontSize: "14px", fontWeight: 700, color: C.text }}>{row.name}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {renderTile(row.leftPitches, leftRef, leftSize)}
          {renderTile(row.rightPitches, rightRef, rightSize)}
        </div>
      </div>
    );
  }

  // Desktop: tile | name | tile
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 1fr", gap: "16px", alignItems: "center" }}>
      {renderTile(row.leftPitches, leftRef, leftSize)}
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "50%", background: row.color, marginBottom: "6px" }} />
        <div style={{ fontSize: "13px", fontWeight: 700, color: C.text, lineHeight: 1.2 }}>{row.name}</div>
      </div>
      {renderTile(row.rightPitches, rightRef, rightSize)}
    </div>
  );
};

// ─── Leaderboard Page ───
const LB_COLS = [
  { key: "pitcher_name", label: "Pitcher", align: "left", w: 150, noSort: true },
  { key: "pitcher_hand", label: "Th", w: 30, noSort: true },
  { key: "total_pitches", label: "#", w: 45 },
  { key: "avg_velo", label: "Velo", w: 50 },
  { key: "max_velo", label: "Max", w: 50 },
  { key: "avg_spin", label: "Spin", w: 55 },
  { key: "avg_ivb", label: "IVB", w: 45 },
  { key: "avg_hb", label: "HB", w: 45 },
  { key: "strike_rate", label: "Str%", w: 50 },
  { key: "zone_rate", label: "Zone%", w: 55 },
  { key: "csw_rate", label: "CSW%", w: 55 },
  { key: "cstr_rate", label: "CStr%", w: 55 },
  { key: "swstr_rate", label: "SwStr%", w: 58 },
  { key: "whiff_rate", label: "Whiff%", w: 58 },
  { key: "chase_rate", label: "Chase%", w: 58 },
  { key: "zone_whiff_rate", label: "ZWhiff%", w: 62 },
  { key: "gb_rate", label: "GB%", w: 45 },
  { key: "fb_rate", label: "FB%", w: 45 },
  { key: "barrel_rate", label: "Barrel%", w: 60 },
  { key: "run_value", label: "RV", w: 50 },
  { key: "rv_100", label: "RV/100", w: 58 },
];

const LeaderboardPage = ({ C, isMobile }) => {
  const [data, setData] = useState(null);
  const [pitchTypes, setPitchTypes] = useState([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const [fetchStats, setFetchStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pitcherHand, setPitcherHand] = useState("all");
  const [batterHand, setBatterHand] = useState("all");
  const [pitchType, setPitchType] = useState("all");
  const [minPitches, setMinPitches] = useState(100);
  const [role, setRole] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState(null); // "desc" | "asc" | null

  // Fetch when backend-affecting filters change
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setShowAll(false);
    getLeaderboard(batterHand, pitchType)
      .then(r => {
        if (!alive) return;
        setData(r.pitchers || []);
        setPitchTypes(r.pitch_types || []);
        setLastUpdated(r.last_updated || "");
        setFetchStats(r.fetch_stats || null);
      })
      .catch(() => { if (alive) setData([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [batterHand, pitchType]);

  // Client-side filter + sort
  const displayData = useMemo(() => {
    if (!data) return [];
    let f = data;
    if (pitcherHand !== "all") f = f.filter(p => p.pitcher_hand === pitcherHand);
    if (role === "SP") f = f.filter(p => p.is_starter);
    else if (role === "RP") f = f.filter(p => !p.is_starter);
    f = f.filter(p => p.total_pitches >= minPitches);
    if (sortCol && sortDir) {
      f = [...f].sort((a, b) => {
        const av = a[sortCol] ?? -Infinity;
        const bv = b[sortCol] ?? -Infinity;
        return sortDir === "desc" ? bv - av : av - bv;
      });
    }
    return f;
  }, [data, pitcherHand, role, minPitches, sortCol, sortDir]);

  const shown = showAll ? displayData : displayData.slice(0, 50);
  const totalCount = displayData.length;

  // Compute average row from ALL filtered data (not just shown slice)
  // Rate stats (percentages) are weighted by total_pitches for accurate league averages
  const avgRow = useMemo(() => {
    if (displayData.length === 0) return null;
    const numCols = LB_COLS.filter(c => c.key !== "pitcher_name" && c.key !== "pitcher_hand");
    const rateKeys = new Set(["strike_rate", "zone_rate", "csw_rate", "cstr_rate", "swstr_rate",
      "whiff_rate", "chase_rate", "zone_whiff_rate", "gb_rate", "fb_rate", "barrel_rate", "rv_100",
      "avg_velo", "avg_spin", "avg_ivb", "avg_hb"]);
    const avgs = {};
    for (const col of numCols) {
      const vals = displayData.map(p => p[col.key]).filter(v => v != null && v !== "—");
      if (vals.length === 0) { avgs[col.key] = "—"; continue; }
      if (rateKeys.has(col.key)) {
        // Pitch-weighted average for rate stats
        let wSum = 0, wTotal = 0;
        for (const p of displayData) {
          const v = p[col.key], w = p.total_pitches || 0;
          if (v != null && v !== "—" && w > 0) { wSum += Number(v) * w; wTotal += w; }
        }
        avgs[col.key] = wTotal > 0 ? (col.key === "avg_spin" ? Math.round(wSum / wTotal) : Number((wSum / wTotal).toFixed(1))) : "—";
      } else {
        const sum = vals.reduce((a, b) => a + Number(b), 0);
        const mean = sum / vals.length;
        avgs[col.key] = col.key === "avg_spin" ? Math.round(mean) : Number(mean.toFixed(1));
      }
    }
    avgs.pitcher_name = "AVERAGE";
    avgs.pitcher_hand = "";
    return avgs;
  }, [displayData]);

  const handleSort = (col) => {
    if (sortCol !== col) { setSortCol(col); setSortDir("desc"); }
    else if (sortDir === "desc") { setSortDir("asc"); }
    else { setSortCol(null); setSortDir(null); }
  };

  const sortArrow = (col) => {
    if (sortCol !== col) return "";
    return sortDir === "desc" ? " ▼" : " ▲";
  };

  const pillBtn = (active, onClick, label) => (
    <button onClick={onClick} style={{
      background: active ? C.accentGlow : "transparent",
      border: `1px solid ${active ? C.accent : C.border}`,
      borderRadius: "4px", padding: "6px 12px",
      color: active ? C.accent : C.textDim,
      fontSize: "11px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    }}>{label}</button>
  );

  return (
    <div style={{ padding: isMobile ? "16px" : "32px", maxWidth: "1800px", margin: "0 auto" }}>
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: C.textDim, marginBottom: "6px" }}>Leaderboard</div>
        <div style={{ fontSize: "12px", color: C.textDim }}>2026 season pitcher stats from parquet data. Sortable columns, filterable by hand, role, pitch type.</div>
        {lastUpdated && (
          <div style={{ fontSize: "10px", color: C.textDim, marginTop: "4px", fontStyle: "italic" }}>
            Last updated: {lastUpdated}
            {fetchStats && fetchStats.failed > 0 && (
              <span style={{ color: C.yellow, marginLeft: "8px" }}>⚠ {fetchStats.failed} day(s) missing data</span>
            )}
            {fetchStats && fetchStats.fetched > 0 && (
              <span style={{ marginLeft: "8px" }}>({fetchStats.fetched} days loaded)</span>
            )}
          </div>
        )}
      </div>

      {/* Filter controls */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center" }}>
        {/* Role */}
        <div style={{ display: "flex", gap: "4px" }}>
          {[{ k: "all", l: "All" }, { k: "SP", l: "SP" }, { k: "RP", l: "RP" }].map(t => (
            <span key={t.k}>{pillBtn(role === t.k, () => setRole(t.k), t.l)}</span>
          ))}
        </div>

        {/* Pitcher hand */}
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", color: C.textDim, letterSpacing: "1px", textTransform: "uppercase", marginRight: "2px" }}>Throws</span>
          {[{ k: "all", l: "All" }, { k: "L", l: "LHP" }, { k: "R", l: "RHP" }].map(t => (
            <span key={t.k}>{pillBtn(pitcherHand === t.k, () => setPitcherHand(t.k), t.l)}</span>
          ))}
        </div>

        {/* Batter hand */}
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", color: C.textDim, letterSpacing: "1px", textTransform: "uppercase", marginRight: "2px" }}>vs</span>
          {[{ k: "all", l: "All" }, { k: "L", l: "LHH" }, { k: "R", l: "RHH" }].map(t => (
            <span key={t.k}>{pillBtn(batterHand === t.k, () => setBatterHand(t.k), t.l)}</span>
          ))}
        </div>

        {/* Pitch type */}
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", color: C.textDim, letterSpacing: "1px", textTransform: "uppercase", marginRight: "2px" }}>Pitch</span>
          <select value={pitchType} onChange={e => setPitchType(e.target.value)} style={{
            padding: "6px 10px", fontSize: "11px", background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: "4px", color: C.text, fontFamily: "inherit", cursor: "pointer",
          }}>
            <option value="all">All Types</option>
            {pitchTypes.map(pt => <option key={pt} value={pt}>{pt}</option>)}
          </select>
        </div>

        {/* Min pitches */}
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", color: C.textDim, letterSpacing: "1px", textTransform: "uppercase", marginRight: "2px" }}>Min</span>
          <select value={minPitches} onChange={e => setMinPitches(Number(e.target.value))} style={{
            padding: "6px 10px", fontSize: "11px", background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: "4px", color: C.text, fontFamily: "inherit", cursor: "pointer",
          }}>
            {[25, 50, 100, 200, 500].map(v => <option key={v} value={v}>{v} pitches</option>)}
          </select>
        </div>
      </div>

      {/* Loading */}
      {loading && <div style={{ padding: "40px 0", color: C.textDim, fontSize: "12px" }}>Loading leaderboard data...</div>}

      {/* Table */}
      {!loading && data && (
        <>
          <div style={{ fontSize: "11px", color: C.textDim, marginBottom: "8px" }}>
            Showing {shown.length} of {totalCount} pitchers
            {!showAll && totalCount > 50 && (
              <span onClick={() => setShowAll(true)} style={{
                color: C.accent, cursor: "pointer", marginLeft: "8px", textDecoration: "underline",
              }}>Show all</span>
            )}
            {showAll && totalCount > 50 && (
              <span onClick={() => setShowAll(false)} style={{
                color: C.accent, cursor: "pointer", marginLeft: "8px", textDecoration: "underline",
              }}>Show top 50</span>
            )}
          </div>

          <div style={{ overflowX: "auto", borderRadius: "8px", border: `1px solid ${C.border}` }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", fontFamily: "inherit", minWidth: "1100px" }}>
              <thead>
                <tr style={{ background: C.surface }}>
                  <th style={{ padding: "8px 6px", textAlign: "center", color: C.textDim, fontSize: "10px", fontWeight: 700, width: "30px", borderBottom: `2px solid ${C.accent}` }}>#</th>
                  {LB_COLS.map(c => (
                    <th key={c.key} onClick={() => !c.noSort && handleSort(c.key)} style={{
                      padding: "8px 6px",
                      textAlign: c.align || "right",
                      color: sortCol === c.key ? C.accent : C.textDim,
                      fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px",
                      cursor: c.noSort ? "default" : "pointer",
                      whiteSpace: "nowrap",
                      borderBottom: `2px solid ${C.accent}`,
                      userSelect: "none",
                      minWidth: `${c.w}px`,
                    }}>
                      {c.label}{!c.noSort && sortArrow(c.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Frozen average row */}
                {avgRow && (
                  <tr style={{
                    position: "sticky", top: 0, zIndex: 5,
                    background: C.surface,
                    borderBottom: `2px solid ${C.accent}`,
                    fontWeight: 700,
                  }}>
                    <td style={{ padding: "7px 6px", textAlign: "center", color: C.accent, fontSize: "10px" }}>—</td>
                    {LB_COLS.map(c => (
                      <td key={c.key} style={{
                        padding: "7px 6px",
                        textAlign: c.align || "right",
                        color: c.key === "pitcher_name" ? C.accent : C.text,
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                        fontSize: c.key === "pitcher_name" ? "11px" : "12px",
                        letterSpacing: c.key === "pitcher_name" ? "1.5px" : "0",
                      }}>
                        {avgRow[c.key] != null ? avgRow[c.key] : "—"}
                      </td>
                    ))}
                  </tr>
                )}
                {shown.map((p, i) => (
                  <tr key={p.pitcher_id} style={{
                    borderBottom: `1px solid ${C.border}`,
                    background: i % 2 === 0 ? "transparent" : `${C.surface}44`,
                  }}>
                    <td style={{ padding: "7px 6px", textAlign: "center", color: C.textDim, fontSize: "10px", fontVariantNumeric: "tabular-nums" }}>{i + 1}</td>
                    {LB_COLS.map(c => (
                      <td key={c.key} style={{
                        padding: "7px 6px",
                        textAlign: c.align || "right",
                        color: C.text,
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                        fontWeight: c.key === "pitcher_name" ? 600 : 400,
                      }}>
                        {c.key === "pitcher_name" ? p.pitcher_name
                          : c.key === "pitcher_hand" ? p.pitcher_hand
                          : (p[c.key] != null ? p[c.key] : "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!showAll && totalCount > 50 && (
            <div style={{ textAlign: "center", marginTop: "12px" }}>
              <button onClick={() => setShowAll(true)} style={{
                padding: "8px 24px", fontSize: "11px", fontWeight: 600,
                background: C.accentGlow, border: `1px solid ${C.accent}`,
                borderRadius: "4px", color: C.accent, cursor: "pointer", fontFamily: "inherit",
              }}>Show All {totalCount} Pitchers</button>
            </div>
          )}
        </>
      )}

      {!loading && data && totalCount === 0 && (
        <div style={{ padding: "40px 0", color: C.textDim, fontSize: "12px" }}>No pitchers match the current filters.</div>
      )}
    </div>
  );
};

// ─── Daily Pitcher Report ───
// Shows per-pitcher diffs between recent and baseline performance.
// Three modes: season-to-date, last 3 starts, last 4 vs prior 4 starts.
const ReportView = ({ C, onBack, logos, isMobile }) => {
  // Build a default date (today in local time)
  const todayStr = new Date().toISOString().slice(0, 10);
  const [reportDate, setReportDate] = useState(todayStr);
  const [mode, setMode] = useState("season"); // "season" | "last3" | "last4_vs_prior4"
  const [sortBy, setSortBy] = useState("change"); // "change" | "era"
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showMore, setShowMore] = useState({}); // { pitcher_id: true/false }
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [extraPitcherIds, setExtraPitcherIds] = useState([]); // Added via search
  const [extraReports, setExtraReports] = useState([]); // Report data for searched pitchers

  // Fetch the main report whenever date or mode changes
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setData(null);
    setShowMore({});
    setExtraPitcherIds([]);
    setExtraReports([]);

    getReport(reportDate, mode).then(r => {
      if (!alive) return;
      setData(r);
      setLoading(false);
    }).catch(e => {
      if (!alive) return;
      setError("Failed to load report");
      setLoading(false);
    });

    return () => { alive = false; };
  }, [reportDate, mode]);

  // Pitcher search (debounced)
  useEffect(() => {
    if (searchQuery.trim().length < 2) { setSearchResults([]); return; }
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const results = await searchPitchers(searchQuery);
        if (alive) setSearchResults(results || []);
      } catch (e) {
        if (alive) setSearchResults([]);
      }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [searchQuery]);

  // Add a pitcher to the report via search
  const addPitcher = async (pitcher) => {
    const pid = pitcher.id;
    if (extraPitcherIds.includes(pid)) return;
    // Check if already in main report
    if (data && data.pitchers && data.pitchers.some(p => p.pitcher_id === pid)) return;
    setSearchQuery("");
    setSearchResults([]);
    try {
      const r = await getReport(reportDate, mode, pid);
      if (r && r.pitchers && r.pitchers.length > 0) {
        setExtraReports(prev => [...prev, ...r.pitchers]);
        setExtraPitcherIds(prev => [...prev, pid]);
      }
    } catch (e) {
      // Silently fail
    }
  };

  // Combine main + extra reports, sort
  const allReports = useMemo(() => {
    const main = (data?.pitchers || []).filter(p => p.qualified !== false);
    const combined = [...main, ...extraReports];
    // Deduplicate by pitcher_id
    const seen = new Set();
    const dedup = [];
    for (const p of combined) {
      if (seen.has(p.pitcher_id)) continue;
      seen.add(p.pitcher_id);
      dedup.push(p);
    }
    // Sort
    if (sortBy === "era") {
      dedup.sort((a, b) => {
        const ea = a.era == null ? 99 : a.era;
        const eb = b.era == null ? 99 : b.era;
        return ea - eb;
      });
    } else {
      dedup.sort((a, b) => (b.change_score || 0) - (a.change_score || 0));
    }
    return dedup;
  }, [data, extraReports, sortBy]);

  // Available date options (today + last 7 days)
  const dateOptions = useMemo(() => {
    const out = [];
    const today = new Date();
    for (let i = 0; i < 8; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  }, []);

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: isMobile ? "12px" : "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <button onClick={onBack} style={{
          background: "transparent", border: `1px solid ${C.border}`, borderRadius: "6px",
          padding: "6px 12px", color: C.textDim, fontSize: "12px", fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}>← Back to Live</button>
        <div style={{ fontSize: isMobile ? "18px" : "22px", fontWeight: 700, color: C.text, letterSpacing: "1px" }}>
          DAILY PITCHER REPORT
        </div>
        <div style={{ width: "100px" }}></div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <label style={{ fontSize: "10px", color: C.textDim, display: "block", marginBottom: "4px", fontWeight: 600 }}>DATE</label>
          <select value={reportDate} onChange={e => setReportDate(e.target.value)} style={{
            background: "transparent", border: `1px solid ${C.border}`, borderRadius: "4px",
            padding: "6px 10px", color: C.text, fontSize: "12px", fontFamily: "inherit", cursor: "pointer",
          }}>
            {dateOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: "10px", color: C.textDim, display: "block", marginBottom: "4px", fontWeight: 600 }}>COMPARE</label>
          <select value={mode} onChange={e => setMode(e.target.value)} style={{
            background: "transparent", border: `1px solid ${C.border}`, borderRadius: "4px",
            padding: "6px 10px", color: C.text, fontSize: "12px", fontFamily: "inherit", cursor: "pointer",
          }}>
            <option value="season">vs Season-to-date</option>
            <option value="last3">vs Last 3 Starts</option>
            <option value="last4_vs_prior4">Last 4 vs Prior 4 Starts</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: "10px", color: C.textDim, display: "block", marginBottom: "4px", fontWeight: 600 }}>SORT BY</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
            background: "transparent", border: `1px solid ${C.border}`, borderRadius: "4px",
            padding: "6px 10px", color: C.text, fontSize: "12px", fontFamily: "inherit", cursor: "pointer",
          }}>
            <option value="change">Change Magnitude</option>
            <option value="era">Season ERA</option>
          </select>
        </div>
        <div style={{ position: "relative", flex: "1", minWidth: "200px" }}>
          <label style={{ fontSize: "10px", color: C.textDim, display: "block", marginBottom: "4px", fontWeight: 600 }}>ADD PITCHER</label>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search to add a specific pitcher..."
            style={{
              background: "transparent", border: `1px solid ${C.border}`, borderRadius: "4px",
              padding: "6px 10px", color: C.text, fontSize: "12px", fontFamily: "inherit",
              width: "100%", boxSizing: "border-box", outline: "none",
            }} />
          {searchResults.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, marginTop: "4px",
              background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "4px",
              maxHeight: "300px", overflow: "auto", zIndex: 10,
            }}>
              {searchResults.slice(0, 8).map(p => (
                <div key={p.id} onClick={() => addPitcher(p)} style={{
                  padding: "8px 12px", cursor: "pointer", fontSize: "12px", color: C.text,
                  borderBottom: `1px solid ${C.border}`,
                }} onMouseEnter={e => e.currentTarget.style.background = C.accentGlow}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {p.full_name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Status */}
      {loading && <div style={{ color: C.textDim, fontSize: "12px", padding: "20px 0" }}>Loading report...</div>}
      {error && <div style={{ color: "#ef4444", fontSize: "12px", padding: "20px 0" }}>{error}</div>}
      {!loading && !error && allReports.length === 0 && (
        <div style={{ color: C.textDim, fontSize: "12px", padding: "20px 0" }}>
          No pitcher reports available for {reportDate}. Try a different date or use search to add a pitcher.
        </div>
      )}

      {/* Reports list */}
      {!loading && !error && allReports.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {allReports.map(p => {
            const visibleNotes = showMore[p.pitcher_id] ? p.notes : p.notes.slice(0, 5);
            const hasMore = p.notes.length > 5;
            return (
              <div key={p.pitcher_id} style={{
                background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "8px",
                padding: "14px 16px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: C.text }}>
                      {p.pitcher_name}
                      <span style={{ fontSize: "10px", color: C.textDim, marginLeft: "8px", fontWeight: 600 }}>
                        {p.pitcher_hand}HP · {p.team}
                      </span>
                    </div>
                    <div style={{ fontSize: "10px", color: C.textDim, marginTop: "2px" }}>
                      {p.current_pitches} pitches in sample · {p.baseline_pitches} pitches in baseline
                    </div>
                  </div>
                  {p.era != null && (
                    <div style={{ fontSize: "11px", color: C.textDim }}>
                      Season ERA: <span style={{ color: C.text, fontWeight: 700 }}>{p.era.toFixed(2)}</span>
                    </div>
                  )}
                </div>
                {visibleNotes.length === 0 ? (
                  <div style={{ fontSize: "11px", color: C.textDim, fontStyle: "italic" }}>
                    No material changes detected for this sample.
                  </div>
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "5px" }}>
                    {visibleNotes.map((note, idx) => (
                      <li key={idx} style={{
                        fontSize: "12px", color: C.text, paddingLeft: "12px", position: "relative",
                      }}>
                        <span style={{
                          position: "absolute", left: 0, top: "6px", width: "5px", height: "5px",
                          borderRadius: "50%", background: noteColor(note.category),
                        }}></span>
                        {note.text}
                      </li>
                    ))}
                  </ul>
                )}
                {hasMore && (
                  <button onClick={() => setShowMore(s => ({ ...s, [p.pitcher_id]: !s[p.pitcher_id] }))} style={{
                    background: "transparent", border: "none", color: C.accent, fontSize: "11px",
                    fontWeight: 600, cursor: "pointer", padding: "6px 0 0 12px", fontFamily: "inherit",
                  }}>
                    {showMore[p.pitcher_id] ? "Show less" : `Show all ${p.notes.length} notes`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Color-code the note bullet by category
function noteColor(category) {
  const map = {
    velocity: "#ef4444",     // red
    movement: "#f59e0b",     // amber
    release: "#8b5cf6",      // purple
    usage: "#3b82f6",        // blue
    results: "#10b981",      // green
  };
  return map[category] || "#6b7280";
}

// ─── Main App ───
export default function PitcherTracker() {
  const [theme, setTheme] = useState("light");
  const C = themes[theme];
  const isMobile = useIsMobile();
  const [pitcherName, setPitcherName] = useState("");
  const [activePitcher, setActivePitcher] = useState(null);
  const [pitcherId, setPitcherId] = useState(null);
  const [pitcherHand, setPitcherHand] = useState("");
  // Default to "heatmaps" when arriving via deep link (from Compare's "View as Heatmap" button).
  // Otherwise default to "tracker" as before.
  const initialPage = (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("pitcher_id"))
    ? "heatmaps" : "tracker";
  const [page, setPage] = useState(initialPage); // "tracker" | "compare" | "heatmaps" | "leaderboard" | "report"
  const [view, setView] = useState("live");
  const [pitchData, setPitchData] = useState(null);
  const [livePitchData, setLivePitchData] = useState(null);
  const [historicalPitchData, setHistoricalPitchData] = useState(null);
  const [season2025PitchData, setSeason2025PitchData] = useState(null);
  const todayStr = new Date().toISOString().split("T")[0];
  const [seasonStart, setSeasonStart] = useState("2026-03-25");
  const [seasonEnd, setSeasonEnd] = useState(todayStr);
  const [isLoading, setIsLoading] = useState(false);
  const [tableView, setTableView] = useState("stuff");
  const [handFilter, setHandFilter] = useState("all");
  const [activeGame, setActiveGame] = useState(null);
  const [gamePk, setGamePk] = useState(null);
  const [pitcherGameStats, setPitcherGameStats] = useState(null);
  const [teamLogos, setTeamLogos] = useState({});
  const pollRef = useRef(null);
  const endPickerRef = useRef(null);

  // Load team logos on mount
  useEffect(() => { getTeamLogos().then(setTeamLogos); }, []);

  const metrics = useMemo(() => {
    if (!pitchData) return null;
    const hf = tableView === "performance" ? handFilter : "all";
    return computeMetrics(pitchData, hf);
  }, [pitchData, handFilter, tableView]);
  const stuffMetrics = useMemo(() => pitchData ? computeMetrics(pitchData, "all") : null, [pitchData]);
  const pitchedDates = useMemo(() => {
    if (!historicalPitchData) return new Set();
    return new Set(historicalPitchData.filter(p => p.game_date).map(p => p.game_date));
  }, [historicalPitchData]);

  // Filter season data by date range whenever dates change
  useEffect(() => {
    if (view !== "historical" || !historicalPitchData) return;
    const filtered = historicalPitchData.filter(p => {
      if (!p.game_date) return true;
      return p.game_date >= seasonStart && p.game_date <= seasonEnd;
    });
    setPitchData(filtered);
  }, [seasonStart, seasonEnd, historicalPitchData, view]);

  // Live polling: re-fetch pitch data every 15 seconds during live games
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (view === "live" && gamePk && pitcherId) {
      pollRef.current = setInterval(async () => {
        try {
          const raw = await getGamePitches(gamePk, pitcherId);
          if (raw.length > 0) {
            const normalized = normAndFilter(raw);
            setLivePitchData(normalized);
            setPitchData(normalized);
          }
          // Also refresh pitcher game stats
          const pitchers = await getGamePitchers(gamePk);
          const me = pitchers.find(p => p.id === pitcherId);
          if (me?.game_stats) setPitcherGameStats(me.game_stats);
        } catch (e) { console.error("Poll failed:", e); }
      }, 15000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [view, gamePk, pitcherId]);

  // When switching views, swap the displayed data
  const handleViewSwitch = async (newView) => {
    setView(newView);
    if (newView === "live") {
      // Reload live data if we have a game selected
      if (gamePk && pitcherId) {
        setIsLoading(true);
        try {
          const raw = await getGamePitches(gamePk, pitcherId);
          const normalized = normAndFilter(raw);
          setLivePitchData(normalized);
          setPitchData(normalized);
        } catch (e) { console.error("Failed to reload live:", e); }
        setIsLoading(false);
      } else if (livePitchData) {
        setPitchData(livePitchData);
      }
    } else if (newView === "season2025") {
      // 2025 Season from Baseball Savant (full data)
      if (season2025PitchData) {
        setPitchData(season2025PitchData);
      } else if (pitcherId) {
        setIsLoading(true);
        try {
          const raw = await getStatcast(pitcherId, "2025-03-27", "2025-09-28");
          if (raw && raw.length > 0) {
            const normalized = normAndFilter(raw);
            setSeason2025PitchData(normalized);
            setPitchData(normalized);
            if (!pitcherHand && normalized.length > 0) {
              // Extract pitcher hand from the first pitch's p_throws
              const firstWithHand = raw.find(p => p.p_throws);
              if (firstWithHand) setPitcherHand(firstWithHand.p_throws);
            }
          } else {
            setPitchData(null);
          }
        } catch (e) { console.error("Failed to load 2025:", e); }
        setIsLoading(false);
      } else {
        setPitchData(null);
      }
    } else {
      // 2026 Season: restore cached or auto-load
      if (historicalPitchData) {
        // pitchData will be set by the useEffect date filter
      } else if (pitcherId) {
        setIsLoading(true);
        try {
          const raw = await getSeasonData(pitcherId);
          console.log("Season auto-load:", raw.length, "pitches");
          if (raw.length > 0) {
            const normalized = normAndFilter(raw);
            setHistoricalPitchData(normalized);
            if (!pitcherHand && raw[0]?.p_throws) setPitcherHand(raw[0].p_throws);
          }
        } catch (e) { console.error("Failed to load season data:", e); }
        setIsLoading(false);
      } else {
        setPitchData(null);
      }
    }
  };

  // Load pitcher from search
  const handleLoadPitcher = async (selection) => {
    if (!selection) return;
    const name = typeof selection === "string" ? selection : selection.name;
    const id = typeof selection === "string" ? null : selection.id;
    const hand = typeof selection === "string" ? "" : (selection.throws || "");
    setPitcherName(name);
    setPitcherId(id);
    setPitcherHand(hand);
    setActivePitcher(name);
    // Reset all data on pitcher change
    setPitchData(null);
    setLivePitchData(null);
    setHistoricalPitchData(null);
    setSeason2025PitchData(null);
    setActiveGame(null);
    setGamePk(null);
  };

  // Load pitcher from live game selector
  const handleSelectFromGame = async (pitcher, game) => {
    setPitcherName(pitcher.name);
    setPitcherId(pitcher.id);
    setPitcherHand(pitcher.throws || "");
    setActiveGame(game);
    setGamePk(game.game_pk);
    setView("live");
    setPitcherGameStats(pitcher.game_stats || null);
    // Reset historical on pitcher change
    setHistoricalPitchData(null);
    setSeason2025PitchData(null);
    setIsLoading(true);
    try {
      const raw = await getGamePitches(game.game_pk, pitcher.id);
      const normalized = normAndFilter(raw);
      setLivePitchData(normalized);
      setPitchData(normalized);
      setActivePitcher(pitcher.name);
    } catch (e) {
      console.error("Failed to load pitches:", e);
    }
    setIsLoading(false);
  };

  // Load historical Statcast data
  const handleLoadHistorical = async () => {
    if (!pitcherId) {
      alert("Please search for and select a pitcher first.");
      return;
    }
    setIsLoading(true);
    try {
      const raw = await getStatcast(pitcherId, startDate, endDate);
      if (raw.length > 0) {
        const normalized = normAndFilter(raw);
        setHistoricalPitchData(normalized);
        setPitchData(normalized);
        // Detect hand from Savant data if we don't have it
        if (!pitcherHand && raw[0]?.p_throws) setPitcherHand(raw[0].p_throws);
      } else {
        alert("No Statcast data found for this pitcher in that date range.");
      }
    } catch (e) {
      console.error("Failed to load Statcast:", e);
    }
    setIsLoading(false);
  };

  const currentGame = activeGame;
  const tableCols = tableView === "stuff" ? STUFF_COLS : PERF_COLS;
  const tableTitle = tableView === "stuff" ? "Stuff & Movement" : "Plate Discipline & Batted Ball";
  const displayMetrics = tableView === "stuff" ? stuffMetrics : metrics;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" }}>
      {/* Header */}
      <div style={{ background: theme === "dark" ? `linear-gradient(180deg,${C.surfaceAlt} 0%,${C.bg} 100%)` : C.surface, borderBottom: `1px solid ${C.border}`, padding: isMobile ? "12px 16px" : "16px 32px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", maxWidth: "1440px", margin: "0 auto", gap: isMobile ? "10px" : "0" }}>
          <div>
            <div style={{ fontSize: isMobile ? "11px" : "13px", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: C.accent, marginBottom: "4px" }}>Pitcher Command Center</div>
            {!isMobile && <div style={{ fontSize: "11px", color: C.textDim, letterSpacing: "1px" }}>Live Statcast Tracking & Analytics</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "4px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "2px" }}>
              {[{ k: "tracker", l: "Tracker" }, { k: "compare", l: "Compare" }, { k: "heatmaps", l: "Heatmaps" }, { k: "leaderboard", l: "Leaderboard" }].map(p => (
                <button key={p.k} onClick={() => setPage(p.k)} style={{
                  padding: "6px 14px", fontSize: "10px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase",
                  background: page === p.k ? C.accent : "transparent", color: page === p.k ? "#fff" : C.textDim,
                  border: "none", borderRadius: "4px", cursor: "pointer", fontFamily: "inherit",
                }}>{p.l}</button>
              ))}
            </div>
            <a href="https://lancebroz.substack.com/subscribe" target="_blank" rel="noopener noreferrer" style={{
              display: "inline-flex", alignItems: "center", gap: "6px", background: "#FF6719", color: "#fff",
              fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px", padding: isMobile ? "6px 10px" : "8px 16px", borderRadius: "6px",
              textDecoration: "none", fontFamily: "inherit", transition: "opacity 0.2s", whiteSpace: "nowrap",
            }} onMouseEnter={e => e.currentTarget.style.opacity = "0.85"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 3H20V5H4V3Z" fill="#fff"/>
                <path d="M4 7H20V9H4V7Z" fill="#fff"/>
                <path d="M4 11H20V21L12 16.5L4 21V11Z" fill="#fff"/>
              </svg>
              {isMobile ? "Substack" : "Subscribe to my Substack!"}
            </a>
            {page === "tracker" && (
              <>
                <button onClick={() => setPage("report")} style={{
                  background: C.accent, color: "#fff", border: "none", borderRadius: "8px",
                  padding: isMobile ? "6px 12px" : "8px 16px", fontSize: isMobile ? "11px" : "12px",
                  fontWeight: 700, cursor: "pointer", letterSpacing: "0.5px", fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}>
                  📊 {isMobile ? "Report" : "Daily Report"}
                </button>
                <LiveGameSelector onSelectPitcher={handleSelectFromGame} C={C} logos={teamLogos} />
              </>
            )}
          </div>
        </div>
        {page === "tracker" && activePitcher && (
          <div style={{ maxWidth: "1440px", margin: "0 auto", marginTop: "8px", textAlign: isMobile ? "left" : "right" }}>
            <div style={{ fontSize: isMobile ? "14px" : "16px", fontWeight: 700, color: C.text }}>
              {activePitcher}{pitcherHand && <span style={{ fontSize: "12px", fontWeight: 600, color: C.textDim, marginLeft: "8px" }}>{pitcherHand === "L" ? "LHP" : pitcherHand === "R" ? "RHP" : ""}</span>}
            </div>
            <div style={{ fontSize: "11px", color: C.textDim, display: "flex", alignItems: "center", justifyContent: isMobile ? "flex-start" : "flex-end", gap: "6px", flexWrap: "wrap" }}>
              {view === "live" && currentGame && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                  <TeamLogo abbr={currentGame.away_team} logos={teamLogos} size={16} />
                  {currentGame.away_team} @ {currentGame.home_team}
                  <TeamLogo abbr={currentGame.home_team} logos={teamLogos} size={16} />
                  <span style={{ margin: "0 2px" }}>·</span> {currentGame.inning || currentGame.detailed_status}
                </span>
              )}
              {view === "historical" && `${seasonStart} → ${seasonEnd}`}
              {view === "season2025" && "2025 Regular Season"}
              {stuffMetrics && <span style={{ marginLeft: "12px", color: C.accent }}>{stuffMetrics.total} pitches</span>}
            </div>
          </div>
        )}
      </div>

      <div style={{ maxWidth: "1440px", margin: "0 auto", padding: isMobile ? "16px 12px" : "24px 32px" }}>
        {/* Search */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "24px", alignItems: "center", flexWrap: "wrap" }}>
          <AutocompleteInput value={pitcherName} onChange={setPitcherName} onSelect={handleLoadPitcher} C={C} />
          <button onClick={() => handleLoadPitcher()} style={{
            background: C.accent, border: "none", borderRadius: "6px", padding: "10px 20px",
            color: "#fff", fontSize: "12px", fontWeight: 600, letterSpacing: "1px",
            textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
          }}>
            {isLoading ? "Loading..." : "Load Pitcher"}
          </button>
        </div>

        {page === "tracker" && activePitcher && (
          <>
            {/* View tabs */}
            <div style={{ display: "flex", marginBottom: "24px", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
              {[
                { key: "live", label: "Live Game" },
                { key: "historical", label: "2026 Season" },
                { key: "season2025", label: "2025 Season" },
              ].map(t => (
                <button key={t.key} onClick={() => handleViewSwitch(t.key)} style={{
                  padding: "10px 24px", fontSize: "11px", fontWeight: 600, letterSpacing: "2px",
                  textTransform: "uppercase", color: view === t.key ? C.accent : C.textDim,
                  background: "transparent", border: "none", fontFamily: "inherit", cursor: "pointer",
                  borderBottom: view === t.key ? `2px solid ${C.accent}` : "2px solid transparent",
                }}>
                  {t.label}
                </button>
              ))}
              {view === "live" && gamePk && pitcherId && (
                <button onClick={async () => {
                  try {
                    const raw = await getGamePitches(gamePk, pitcherId);
                    if (raw.length > 0) {
                      const normalized = normAndFilter(raw);
                      setLivePitchData(normalized);
                      setPitchData(normalized);
                    }
                    const pitchers = await getGamePitchers(gamePk);
                    const me = pitchers.find(p => p.id === pitcherId);
                    if (me?.game_stats) setPitcherGameStats(me.game_stats);
                  } catch (e) { console.error("Refresh failed:", e); }
                }} style={{
                  background: "transparent", border: `1px solid ${C.border}`, borderRadius: "5px",
                  padding: "4px 10px", marginLeft: "auto", cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: "5px", color: C.textDim, fontSize: "10px",
                  fontWeight: 600, letterSpacing: "0.5px", marginBottom: "2px",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textDim; }}
                >
                  <span style={{ fontSize: "13px", lineHeight: 1 }}>↻</span> Refresh
                </button>
              )}
            </div>

            {/* Pitcher Game Line - Live view only */}
            {view === "live" && pitcherGameStats && activePitcher && (() => {
              const s = pitcherGameStats;
              // Calculate ERA: season_era is cumulative including this game
              // The API's seasonStats already includes this game's stats
              // So season_era IS the current ERA including today's ER
              const era = s.season_era && s.season_era !== "-.--" ? s.season_era : "-.--";
              const lastName = activePitcher.split(" ").slice(-1)[0];
              const firstName = activePitcher.split(" ")[0];
              const initial = firstName ? firstName[0] + "." : "";
              const displayName = `${initial} ${lastName}`;
              const statCols = [
                { label: "IP", val: s.ip || "0" },
                { label: "H", val: s.h ?? 0 },
                { label: "R", val: s.r ?? 0 },
                { label: "ER", val: s.er ?? 0 },
                { label: "BB", val: s.bb ?? 0 },
                { label: "K", val: s.k ?? 0 },
                { label: "HR", val: s.hr ?? 0 },
                { label: "ERA", val: era },
              ];
              return (
                <div style={{
                  background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px",
                  marginBottom: "20px", overflow: "hidden",
                }}>
                  <div style={{ display: "flex", alignItems: "center", overflowX: "auto" }}>
                    {/* Pitcher name */}
                    <div style={{
                      padding: "12px 20px", minWidth: "120px", fontSize: "13px", fontWeight: 700,
                      color: C.text, borderRight: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "6px",
                    }}>
                      {displayName}
                      {pitcherHand && <span style={{ fontSize: "10px", fontWeight: 500, color: C.textDim }}>({pitcherHand}HP)</span>}
                    </div>
                    {/* Stat columns */}
                    <div style={{ display: "flex", flex: 1 }}>
                      {statCols.map((col, i) => (
                        <div key={col.label} style={{
                          flex: 1, textAlign: "center", padding: "0 4px",
                          borderRight: i < statCols.length - 1 ? `1px solid ${C.border}` : "none",
                        }}>
                          <div style={{ fontSize: "10px", fontWeight: 700, color: C.textDim, letterSpacing: "1px", padding: "8px 0 4px", borderBottom: `1px solid ${C.border}` }}>
                            {col.label}
                          </div>
                          <div style={{
                            fontSize: "14px", fontWeight: 600, padding: "8px 0",
                            color: col.label === "ERA" ? C.accent : C.text,
                          }}>
                            {col.val}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {view === "historical" && !historicalPitchData && !isLoading && pitcherId && (
              <div style={{ display: "flex", gap: "12px", marginBottom: "20px", alignItems: "center" }}>
                <button onClick={async () => {
                  setIsLoading(true);
                  try {
                    const raw = await getSeasonData(pitcherId);
                    if (raw.length > 0) {
                      const normalized = normAndFilter(raw);
                      setHistoricalPitchData(normalized);
                      if (!pitcherHand && raw[0]?.p_throws) setPitcherHand(raw[0].p_throws);
                    }
                  } catch (e) { console.error("Failed:", e); }
                  setIsLoading(false);
                }} style={{
                  background: C.accent, border: "none", borderRadius: "6px", padding: "10px 20px",
                  color: "#fff", fontSize: "12px", fontWeight: 600, letterSpacing: "1px",
                  textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
                }}>
                  Load 2026 Season Data
                </button>
              </div>
            )}

            {view === "historical" && isLoading && (
              <div style={{ padding: "40px 0", textAlign: "center", color: C.textDim, fontSize: "12px" }}>
                Loading 2026 season data...
              </div>
            )}

            {view === "season2025" && isLoading && (
              <div style={{ padding: "40px 0", textAlign: "center", color: C.textDim, fontSize: "12px" }}>
                Loading 2025 season data from Baseball Savant...
              </div>
            )}

            {view === "season2025" && !isLoading && !season2025PitchData && pitcherId && (
              <div style={{ padding: "40px 0", textAlign: "center", color: C.textDim, fontSize: "12px" }}>
                No 2025 data available for this pitcher.
              </div>
            )}

            {view === "season2025" && season2025PitchData && (
              <div style={{ display: "flex", gap: "12px", marginBottom: "20px", alignItems: "center" }}>
                <span style={{ fontSize: "11px", color: C.textDim, letterSpacing: "1px", textTransform: "uppercase" }}>2025 Regular Season</span>
                {pitchData && (
                  <span style={{ fontSize: "11px", color: C.accent, fontWeight: 600 }}>
                    {pitchData.length} pitches
                  </span>
                )}
              </div>
            )}

            {view === "season2025" && pitchData && pitchData.length > 0 && activePitcher && (
              <HistoricalSummaryBox pitchData={pitchData} activePitcher={activePitcher} pitcherHand={pitcherHand} C={C} />
            )}

            {view === "historical" && historicalPitchData && (
              <div style={{ display: "flex", gap: "12px", marginBottom: "20px", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: "11px", color: C.textDim, letterSpacing: "1px", textTransform: "uppercase" }}>From</span>
                <DatePickerWithHighlights value={seasonStart} onChange={setSeasonStart} pitchedDates={pitchedDates} C={C} label="Start"
                  onAfterSelect={() => { if (endPickerRef.current) endPickerRef.current.querySelector("button").click(); }}
                />
                <span style={{ fontSize: "11px", color: C.textDim, letterSpacing: "1px", textTransform: "uppercase" }}>To</span>
                <div ref={endPickerRef}>
                  <DatePickerWithHighlights value={seasonEnd} onChange={setSeasonEnd} pitchedDates={pitchedDates} C={C} label="End" />
                </div>
                {pitchData && (
                  <span style={{ fontSize: "11px", color: C.accent, fontWeight: 600 }}>
                    {pitchData.length} pitches
                  </span>
                )}
              </div>
            )}

            {view === "historical" && pitchData && pitchData.length > 0 && activePitcher && (
              <HistoricalSummaryBox pitchData={pitchData} activePitcher={activePitcher} pitcherHand={pitcherHand} C={C} />
            )}

            {stuffMetrics && (
              <>
                {/* Movement + Usage */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
                  <MovementPlot pitchTypeMetrics={stuffMetrics.pitchTypeMetrics} C={C} view={view} />
                  <UsageSplitChart pitchTypeMetrics={stuffMetrics.pitchTypeMetrics} pitchData={pitchData} C={C} />
                </div>

                {/* Table tabs */}
                <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
                  {[
                    { key: "stuff", label: "Stuff & Movement" },
                    { key: "performance", label: "Plate Discipline & Batted Ball" },
                  ].map(t => (
                    <button key={t.key} onClick={() => { setTableView(t.key); setHandFilter("all"); }} style={{
                      background: tableView === t.key ? C.accentGlow : "transparent",
                      border: `1px solid ${tableView === t.key ? C.accent : C.border}`,
                      borderRadius: "6px", padding: isMobile ? "8px 12px" : "10px 20px",
                      color: tableView === t.key ? C.accent : C.textMuted,
                      fontSize: isMobile ? "10px" : "12px", fontWeight: 600, letterSpacing: "1px",
                      textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
                    }}>{t.label}</button>
                  ))}
                </div>

                {displayMetrics && (
                  <SortableTable
                    data={displayMetrics.pitchTypeMetrics} columns={tableCols} title={tableTitle} C={C}
                    showHandToggle={tableView === "performance"}
                    handFilter={handFilter} setHandFilter={setHandFilter}
                    allRow={tableView === "performance" ? displayMetrics.allRow : null}
                  />
                )}

                {/* Release Point + Pitch Locations (hidden on 2025 view since samples would be misleading) */}
                {view !== "season2025" && (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
                    <ReleasePointPlot
                      pitchTypeMetrics={stuffMetrics.pitchTypeMetrics}
                      avgRelH={stuffMetrics.avgRelH} avgRelS={stuffMetrics.avgRelS} avgExt={stuffMetrics.avgExt} C={C}
                      pitcherHand={pitcherHand}
                    />
                    <PitchLocationPlot pitchData={pitchData} pitchTypeMetrics={stuffMetrics.pitchTypeMetrics} C={C} />
                  </div>
                )}
              </>
            )}
          </>
        )}

        {page === "tracker" && !activePitcher && (
          <StartersGrid C={C} logos={teamLogos} onSelect={handleSelectFromGame} isMobile={isMobile} />
        )}
        {page === "compare" && (
          <ComparePage C={C} isMobile={isMobile} teamLogos={teamLogos} />
        )}
        {page === "heatmaps" && (
          <HeatmapsPage C={C} isMobile={isMobile} />
        )}
        {page === "leaderboard" && (
          <LeaderboardPage C={C} isMobile={isMobile} />
        )}
        {page === "report" && (
          <ReportView C={C} isMobile={isMobile} logos={teamLogos} onBack={() => setPage("tracker")} />
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: isMobile ? "12px 16px" : "16px 32px", display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ fontSize: "9px", color: C.textDim, letterSpacing: "1px" }}>DATA SOURCES: MLB STATS API · BASEBALL SAVANT STATCAST</div>
        <div style={{ width: "1px", height: "16px", background: C.border }} />
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} style={{
          background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: "20px",
          padding: "5px 14px", color: C.textMuted, fontSize: "10px", fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "6px",
        }}>
          {theme === "dark" ? "☀️" : "🌙"} {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>
      </div>
    </div>
  );
}
