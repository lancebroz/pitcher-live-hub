import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as recharts from "recharts";
import { searchPitchers, getLiveGames, getGamePitchers, getGamePitches, getStatcast, getStatcastSampled, getTeamLogos, getSeasonData, getStartersToday, getPitcherEra, getLeaderboard } from "./api.js";

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
const avgInt = (a) => { const f = a.filter(v => v != null && !isNaN(v)); return f.length > 0 ? Math.round(f.reduce((s, v) => s + v, 0) / f.length) : "—"; };
const avg3 = (a) => { const f = a.filter(v => v != null && !isNaN(v)); return f.length > 0 ? (f.reduce((s, v) => s + v, 0) / f.length).toFixed(3) : "—"; };
const avgNum = (a) => { const f = a.filter(v => v != null && !isNaN(v)); return f.length > 0 ? f.reduce((s, v) => s + v, 0) / f.length : 0; };

const computeMetrics = (pitches, hf) => {
  if (!pitches?.length) return null;
  const f = hf === "all" ? pitches : pitches.filter(p => p.batter_hand === hf);
  if (!f.length) return null;
  const bt = {};
  f.forEach(p => { if (!bt[p.pitch_name]) bt[p.pitch_name] = []; bt[p.pitch_name].push(p); });
  const ptm = Object.entries(bt).map(([n, pts]) => {
    const c = pts.length, sw = pts.filter(p => p.is_swing).length, wh = pts.filter(p => p.is_whiff).length,
      iz = pts.filter(p => p.is_in_zone).length, cs = pts.filter(p => p.is_called_strike).length,
      st = pts.filter(p => p.is_in_zone || p.is_swing || p.is_called_strike || p.description === "foul").length,
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
      expRunValue: pts.filter(p => p.delta_run_exp != null).map(p => p.delta_run_exp).reduce((a, b) => a + b, 0).toFixed(2),
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
    ast = allPts.filter(p => p.is_in_zone || p.is_swing || p.is_called_strike || p.description === "foul").length,
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
    strikeRate: pct(ast, ac), zoneRate: pct(aiz, ac), cswRate: pct(acs + awh, ac),
    calledStrikeRate: pct(acs, ac), swStrRate: pct(awh, ac), whiffRate: pct(awh, asw),
    chaseRate: pct(aozs, aozt), zoneWhiffRate: pct(aizw, aizs),
    gbRate: pct(agb, aip), fbRate: pct(afb, aip), barrelRate: pct(aba, aip),
    bipCount: aip,
    xSLG: avg3(allPts.filter(p => p.estimated_slg_using_speedangle != null).map(p => p.estimated_slg_using_speedangle)),
    xwOBACON: avg3(allPts.filter(p => p.estimated_woba_using_speedangle != null).map(p => p.estimated_woba_using_speedangle)),
    xwOBA: avg3(allPts.filter(p => p.woba_value != null).map(p => p.woba_value)),
    expRunValue: allPts.filter(p => p.delta_run_exp != null).map(p => p.delta_run_exp).reduce((a, b) => a + b, 0).toFixed(2),
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

// ─── Normalize API pitch data into internal format ───
const normalizeLivePitch = (p) => {
  const desc = (p.description || "").toLowerCase();
  const isStrike = p.is_strike || desc.includes("strike") || desc.includes("foul");
  const isSwing = desc.includes("swing") || desc.includes("foul") || desc.includes("in play") || desc.includes("hit");
  const isWhiff = desc.includes("swinging") && desc.includes("strike");
  const isCalledStrike = desc.includes("called") && desc.includes("strike");
  const isFoul = desc.includes("foul");
  const isInPlay = p.is_in_play || desc.includes("in play");
  const zone = p.zone;
  const isInZone = zone != null ? (zone >= 1 && zone <= 9) : (Math.abs(p.plate_x || 0) <= 0.83 && (p.plate_z || 0) >= 1.5 && (p.plate_z || 0) <= 3.5);

  // Movement data: both Savant and live feed pfx values are in FEET → multiply by 12 for inches
  // HB is flipped (negated) for pitcher's perspective
  const pfx_z_inches = p.pfx_z != null ? p.pfx_z * 12 : null;
  const pfx_x_inches = p.pfx_x != null ? p.pfx_x * -12 : null;

  return {
    pitch_number: p.pitch_number,
    pitch_type: p.pitch_type || "",
    pitch_name: p.pitch_name || p.pitch_type || "",
    release_speed: p.release_speed,
    release_spin_rate: p.release_spin_rate || p.spin_rate,
    spin_efficiency: p.spin_efficiency || null,
    pfx_z: pfx_z_inches,
    pfx_x: pfx_x_inches,
    release_pos_z: p.release_pos_z,
    release_pos_x: p.release_pos_x,
    vaa: p.vaa || null,
    release_extension: p.release_extension,
    plate_x: p.plate_x,
    plate_z: p.plate_z,
    description: isWhiff ? "swinging_strike" : isCalledStrike ? "called_strike" : isFoul ? "foul" : isInPlay ? "hit_into_play" : "ball",
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
    count: p.count || `${p.balls || 0}-${p.strikes || 0}`,
    batter_name: p.batter_name || "",
    inning: p.inning || 0,
    launch_speed: p.launch_speed,
    launch_angle: p.launch_angle,
    estimated_slg_using_speedangle: p.estimated_slg_using_speedangle || null,
    estimated_woba_using_speedangle: p.estimated_woba_using_speedangle || null,
    estimated_ba_using_speedangle: p.estimated_ba_using_speedangle || null,
    woba_value: p.woba_value || null,
    delta_run_exp: p.delta_run_exp,
    game_date: p.game_date || "",
    at_bat_number: p.at_bat_number || null,
    events: p.events || "",
  };
};

const normAndFilter = (raw) => raw.map(normalizeLivePitch).filter(p => p.pitch_type && p.pitch_type !== "PO" && p.pitch_type !== "UN" && p.pitch_name !== "Other");

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
  const bbPct = totalPA > 0 ? ((walks / totalPA) * 100).toFixed(1) : "0.0";
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
  // FIP = ((13*HR + 3*BB - 2*K) / IP) + 3.2 (constant)
  const homeRuns = abEndPitches.filter(p => (p.events || "").toLowerCase() === "home_run").length;
  const fip = ipNum > 0 ? (((13 * homeRuns + 3 * walks - 2 * strikeouts) / ipNum) + 3.20).toFixed(2) : "-.--";

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
  { key: "avgExt", label: "Ext" },
];
const PERF_COLS = [
  { key: "name", label: "Pitch", align: "left" }, { key: "count", label: "#" },
  { key: "strikeRate", label: "Strike%" }, { key: "zoneRate", label: "Zone%" },
  { key: "cswRate", label: "CSW%" }, { key: "calledStrikeRate", label: "CStr%" },
  { key: "swStrRate", label: "SwStr%" }, { key: "whiffRate", label: "Whiff%" },
  { key: "chaseRate", label: "Chase%" }, { key: "zoneWhiffRate", label: "ZWhiff%" },
  { key: "bipCount", label: "BIP" }, { key: "gbRate", label: "GB%" },
  { key: "fbRate", label: "FB%" }, { key: "barrelRate", label: "Barrel%" },
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
];

// Compute high-level pitcher stats (GS, IP, ERA, SIERA, K%, BB%, K-BB%) from raw pitches.
// Filtered by batter handedness if hand !== "all".
const computeSummaryStats = (rawPitches, hand) => {
  if (!rawPitches || rawPitches.length === 0) return null;
  const pitches = hand === "all" ? rawPitches : rawPitches.filter(p => p.batter_hand === hand);
  if (pitches.length === 0) return null;

  // Distinct game dates as a proxy for games started
  const gs = new Set(pitches.filter(p => p.game_date).map(p => p.game_date)).size;

  // Plate appearance ending pitches have a non-empty events field
  const paPitches = pitches.filter(p => p.events && p.events.trim() !== "");
  const pa = paPitches.length;

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
  // Iterate over ALL pitches (not just paPitches) to capture baserunning outs like caught_stealing
  // that can occur mid-at-bat and don't end the PA but still consume an out.
  for (const p of pitches) {
    const ev = (p.events || "").toLowerCase().trim();
    if (!ev) continue;
    if (ev.includes("strikeout")) {
      // Only count strikeout PA once (these end the at-bat)
      if (ev === "strikeout_double_play") outs += 2;
      else outs += 1;
    } else if (isSingleOut(ev)) {
      outs += 1;
    } else if (ev === "double_play" || ev === "grounded_into_double_play" || ev === "sac_bunt_double_play" || ev === "sac_fly_double_play") {
      outs += 2;
    } else if (ev === "triple_play") {
      outs += 3;
    } else if (ev === "caught_stealing_2b" || ev === "caught_stealing_3b" || ev === "caught_stealing_home" ||
               ev === "pickoff_1b" || ev === "pickoff_2b" || ev === "pickoff_3b" ||
               ev === "pickoff_caught_stealing_2b" || ev === "pickoff_caught_stealing_3b" || ev === "pickoff_caught_stealing_home") {
      outs += 1;
    }
    // PA-ending events (mutually exclusive with baserunning events above)
    if (ev.includes("strikeout")) so += 1;
    else if (ev === "walk") bb += 1;
    else if (ev === "intent_walk") { bb += 1; ibb += 1; }
    else if (ev === "hit_by_pitch") hbp += 1;
  }
  // Count GB/FB/PU from in-play pitches (using bb_type)
  for (const p of pitches) {
    if (!p.is_in_play) continue;
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

  // Rates (BB% includes IBB and HBP per SIERA convention)
  const bbAll = bb + hbp;
  const kPct = pa > 0 ? (so / pa) : 0;
  const bbPct = pa > 0 ? (bbAll / pa) : 0;
  const kbbPct = kPct - bbPct;

  // SIERA — classic Eric Seidman formula
  let siera = null;
  if (pa >= 1) {
    const gbDiff = (gb - fb - pu) / pa;
    const sign = gbDiff >= 0 ? 1 : -1;
    siera = 6.145
          - 16.986 * kPct
          + 11.434 * bbPct
          -  1.858 * gbDiff
          +  7.653 * (kPct * kPct)
          + sign * 6.664 * (gbDiff * gbDiff)
          + 10.130 * kPct * gbDiff
          -  5.195 * bbPct * gbDiff;
  }

  return {
    gs,
    ip: ipStr,
    era,
    siera: siera != null ? siera.toFixed(2) : "—",
    kPct: pa > 0 ? `${(kPct * 100).toFixed(1)}%` : "—",
    bbPct: pa > 0 ? `${(bbPct * 100).toFixed(1)}%` : "—",
    kbbPct: pa > 0 ? `${(kbbPct * 100).toFixed(1)}%` : "—",
    pa,
  };
};

const SummaryStatsBar = ({ rawPitches, hand, C, eraOverride, ipOverride, boxStats }) => {
  const stats = useMemo(() => computeSummaryStats(rawPitches, hand), [rawPitches, hand]);
  if (!stats) return null;
  // When hand="all" and we have boxscore truth-source numbers, use them. They are season totals
  // (not split by hand), so they shouldn't be used when filtering by batter handedness.
  const useBox = hand === "all" && boxStats && boxStats.batters_faced > 0;
  const eraDisplay = (hand === "all" && eraOverride != null) ? eraOverride.toFixed(2) : stats.era;
  const ipDisplay = (hand === "all" && ipOverride != null) ? ipOverride.toFixed(1) : stats.ip;
  const gsDisplay = useBox ? boxStats.games_started : stats.gs;
  let kPctDisplay = stats.kPct, bbPctDisplay = stats.bbPct, kbbPctDisplay = stats.kbbPct;
  if (useBox) {
    const bf = boxStats.batters_faced;
    const k = boxStats.strikeouts;
    const bb = boxStats.walks + boxStats.hit_batsmen; // BB% includes HBP per SIERA convention
    const kPct = (k / bf) * 100;
    const bbPct = (bb / bf) * 100;
    kPctDisplay = `${kPct.toFixed(1)}%`;
    bbPctDisplay = `${bbPct.toFixed(1)}%`;
    kbbPctDisplay = `${(kPct - bbPct).toFixed(1)}%`;
  }
  // SIERA needs accurate PA + GB/FB/PU. Recompute with boxscore PA when available.
  let sieraDisplay = stats.siera;
  if (useBox) {
    // Use pitch-level GB/FB/PU counts (those are reliable from pitch data) but with boxscore PA
    const filtered = rawPitches.filter(p => p.is_in_play);
    let gb = 0, fb = 0, pu = 0;
    for (const p of filtered) {
      if (p.bb_type === "ground_ball") gb += 1;
      else if (p.bb_type === "fly_ball") fb += 1;
      else if (p.bb_type === "popup") pu += 1;
    }
    const bf = boxStats.batters_faced;
    const kPct = boxStats.strikeouts / bf;
    const bbPct = (boxStats.walks + boxStats.hit_batsmen) / bf;
    const gbDiff = (gb - fb - pu) / bf;
    const sign = gbDiff >= 0 ? 1 : -1;
    const siera = 6.145
                - 16.986 * kPct
                + 11.434 * bbPct
                -  1.858 * gbDiff
                +  7.653 * (kPct * kPct)
                + sign * 6.664 * (gbDiff * gbDiff)
                + 10.130 * kPct * gbDiff
                -  5.195 * bbPct * gbDiff;
    sieraDisplay = siera.toFixed(2);
  }
  const cells = [
    { l: "GS", v: gsDisplay },
    { l: "IP", v: ipDisplay },
    { l: "ERA", v: eraDisplay },
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

const CompareTable = ({ rawPitches, label, sublabel, C, isMobile, hand, onHandChange, pitcherId, pitchOrder, onComputed, hoveredCode, onHoverCode }) => {
  const metrics = useMemo(() => rawPitches ? computeMetrics(rawPitches, hand || "all") : null, [rawPitches, hand]);
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
  const orderMetrics = useMemo(() => rawPitches ? computeMetrics(rawPitches, "all") : null, [rawPitches]);
  useEffect(() => {
    if (onComputed && orderMetrics?.pitchTypeMetrics) {
      onComputed(orderMetrics.pitchTypeMetrics.map(r => PITCH_ABBREV[r.name] || r.name));
    }
  }, [orderMetrics]);

  // Fetch real ERA + IP from boxscores whenever the underlying pitch set changes
  useEffect(() => {
    setEra(null);
    setIpFromBox(null);
    setBoxStats(null);
    if (!rawPitches || !pitcherId) return;
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
  }, [rawPitches, pitcherId]);

  if (!rawPitches) return null;
  const allRow = metrics?.allRow;
  const filteredCount = metrics ? (hand === "all" ? rawPitches.length : rawPitches.filter(p => p.batter_hand === hand).length) : 0;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "16px", marginBottom: "16px", overflowX: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: C.accent }}>{label}</div>
          {sublabel && <div style={{ fontSize: "11px", color: C.textDim, marginTop: "2px" }}>{sublabel} {hand !== "all" && `(${filteredCount} vs ${hand}HH)`}</div>}
        </div>
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
      <SummaryStatsBar rawPitches={rawPitches} hand={hand} C={C} eraOverride={era} ipOverride={ipFromBox} boxStats={boxStats} />
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
  const [cmpStart, setCmpStart] = useState("2026-03-26");
  const [cmpEnd, setCmpEnd] = useState(new Date().toISOString().slice(0, 10));
  const [errMsg, setErrMsg] = useState("");
  const [topHand, setTopHand] = useState("all");
  const [cmpHand, setCmpHand] = useState("all");
  const [topPitchOrder, setTopPitchOrder] = useState([]);
  const [hoveredCode, setHoveredCode] = useState(null);
  const [topStart, setTopStart] = useState("2026-03-26");
  const [topEnd, setTopEnd] = useState(new Date().toISOString().slice(0, 10));
  const [topUseRange, setTopUseRange] = useState(false); // false = full season, true = custom range

  // Compute pitched dates from topData for calendar highlighting
  const pitchedDates = useMemo(() => {
    if (!topData) return new Set();
    return new Set(topData.map(p => p.game_date).filter(d => d && d !== "nan"));
  }, [topData]);

  const searchRef = useRef(null);

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

  const loadPitcher = async (p) => {
    setPitcher(p);
    setSearchValue(p.name);
    setSearchOpen(false);
    setTopData(null);
    setCmpData(null);
    setErrMsg("");
    setTopUseRange(false);
    setTopStart("2026-03-26");
    setTopEnd(new Date().toISOString().slice(0, 10));

    setTopLoading(true);
    try {
      const raw = await getSeasonData(p.id); // parquet+live merged
      setTopData(normAndFilter(raw || []));
    } catch (e) {
      console.error("Top load failed", e);
      setErrMsg("Failed to load 2026 season data.");
    }
    setTopLoading(false);
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

  const topMetrics = useMemo(() => topData ? computeMetrics(topData, "all") : null, [topData]);
  const cmpMetrics = useMemo(() => cmpData ? computeMetrics(cmpData, "all") : null, [cmpData]);

  const cmpLabel = cmpMode === "2025" ? "2025 Full Season (sampled)" : `2026 Custom Range: ${cmpStart} → ${cmpEnd}`;

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
        // Apply date filter if custom range is active
        const topFiltered = topUseRange
          ? topData.filter(p => p.game_date && p.game_date >= topStart && p.game_date <= topEnd)
          : topData;
        const isFullSeason = !topUseRange;
        const topLabel = isFullSeason
          ? "Full 2026 Season (parquet + live)"
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
                  <DatePickerWithHighlights value={topStart} onChange={setTopStart} pitchedDates={pitchedDates} C={C} label="Start" />
                  <span style={{ color: C.textDim, fontSize: "11px" }}>to</span>
                  <DatePickerWithHighlights value={topEnd} onChange={setTopEnd} pitchedDates={pitchedDates} C={C} label="End" />
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
                <DatePickerWithHighlights value={cmpStart} onChange={setCmpStart} pitchedDates={pitchedDates} C={C} label="Start" />
                <span style={{ color: C.textDim, fontSize: "11px" }}>to</span>
                <DatePickerWithHighlights value={cmpEnd} onChange={setCmpEnd} pitchedDates={pitchedDates} C={C} label="End" />
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
            />
          )}
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
  const [pitchData, setPitchData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  // 2026 date range filter
  const [startDate, setStartDate] = useState("2026-03-26");
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const searchRef = useRef(null);

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
          raw = await getSeasonData(pitcher.id);
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

  // Filter pitch data by hand, date range, and mode (frequency/whiffs/damage), then group by pitch_name
  const filteredGroups = useMemo(() => {
    if (!pitchData) return null;
    const isXBH = (ev) => {
      const e = (ev || "").toLowerCase();
      return e === "double" || e === "triple" || e === "home_run";
    };
    const passesMode = (p) => {
      if (hmMode === "frequency") return true;
      if (hmMode === "whiffs") return (p.description || "").toLowerCase() === "swinging_strike";
      if (hmMode === "damage") return isXBH(p.events);
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
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length).map(([name, pitches]) => ({
      name,
      code: PITCH_ABBREV[name] || pitches[0]?.pitch_type || "—",
      color: getPitchColor(name),
      pitches,
    }));
  }, [pitchData, hand, year, startDate, endDate, hmMode]);

  const totalPitchCount = filteredGroups ? filteredGroups.reduce((s, g) => s + g.pitches.length, 0) : 0;

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
          {/* Year toggle */}
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

          {/* Hand toggle */}
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

          {/* Mode toggle */}
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

          {/* Date pickers (2026 only) */}
          {year === "2026" && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: C.textDim, letterSpacing: "1px", textTransform: "uppercase" }}>Range</span>
              <input type="date" value={startDate} min="2026-03-26" max={new Date().toISOString().slice(0, 10)}
                onChange={e => setStartDate(e.target.value)}
                style={{ padding: "6px 10px", fontSize: "11px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "4px", color: C.text, fontFamily: "inherit" }} />
              <span style={{ color: C.textDim, fontSize: "11px" }}>to</span>
              <input type="date" value={endDate} min="2026-03-26" max={new Date().toISOString().slice(0, 10)}
                onChange={e => setEndDate(e.target.value)}
                style={{ padding: "6px 10px", fontSize: "11px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "4px", color: C.text, fontFamily: "inherit" }} />
            </div>
          )}

          {totalPitchCount > 0 && (
            <span style={{ fontSize: "11px", color: C.accent, fontWeight: 600 }}>{totalPitchCount} pitches</span>
          )}
        </div>
      )}

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
            <HeatmapTile key={g.name} group={g} C={C} />
          ))}
        </div>
      )}

      {/* Legend */}
      {filteredGroups && filteredGroups.length > 0 && (
        <div style={{ marginTop: "20px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "10px", fontWeight: 600, color: C.textDim, letterSpacing: "1px", textTransform: "uppercase" }}>
            {hmMode === "frequency" ? "Pitch Frequency" : hmMode === "whiffs" ? "Swing-and-Miss Density" : "Extra-Base Hit Density"}
          </span>
          <span style={{ fontSize: "10px", color: C.textDim }}>Low</span>
          <div style={{ width: "180px", height: "10px", borderRadius: "3px", background: "linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)" }} />
          <span style={{ fontSize: "10px", color: C.textDim }}>High</span>
        </div>
      )}
    </div>
  );
};

const HeatmapTile = ({ group, C }) => {
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
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: group.color }} />
          <span style={{ fontSize: "12px", fontWeight: 700, color: C.text }}>{group.name}</span>
        </div>
        <span style={{ fontSize: "10px", color: C.textDim, fontVariantNumeric: "tabular-nums" }}>{group.pitches.length}</span>
      </div>
      <div ref={containerRef} style={{ width: "100%", aspectRatio: "1/1", borderRadius: "4px", overflow: "hidden" }}>
        <HeatmapCanvas pitches={group.pitches} width={size.w} height={size.h} C={C} />
      </div>
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
];

const LeaderboardPage = ({ C, isMobile }) => {
  const [data, setData] = useState(null);
  const [pitchTypes, setPitchTypes] = useState([]);
  const [lastUpdated, setLastUpdated] = useState("");
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
  const avgRow = useMemo(() => {
    if (displayData.length === 0) return null;
    const numCols = LB_COLS.filter(c => c.key !== "pitcher_name" && c.key !== "pitcher_hand");
    const avgs = {};
    for (const col of numCols) {
      const vals = displayData.map(p => p[col.key]).filter(v => v != null && v !== "—");
      if (vals.length > 0) {
        const sum = vals.reduce((a, b) => a + Number(b), 0);
        const mean = sum / vals.length;
        avgs[col.key] = col.key === "avg_spin" ? Math.round(mean) : Number(mean.toFixed(1));
      } else {
        avgs[col.key] = "—";
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
          <div style={{ fontSize: "10px", color: C.textDim, marginTop: "4px", fontStyle: "italic" }}>Last updated: {lastUpdated}</div>
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

// ─── Main App ───
export default function PitcherTracker() {
  const [theme, setTheme] = useState("light");
  const C = themes[theme];
  const isMobile = useIsMobile();
  const [pitcherName, setPitcherName] = useState("");
  const [activePitcher, setActivePitcher] = useState(null);
  const [pitcherId, setPitcherId] = useState(null);
  const [pitcherHand, setPitcherHand] = useState("");
  const [page, setPage] = useState("tracker"); // "tracker" | "compare" | "heatmaps" | "leaderboard"
  const [view, setView] = useState("live");
  const [pitchData, setPitchData] = useState(null);
  const [livePitchData, setLivePitchData] = useState(null);
  const [historicalPitchData, setHistoricalPitchData] = useState(null);
  const [season2025PitchData, setSeason2025PitchData] = useState(null);
  const todayStr = new Date().toISOString().split("T")[0];
  const [seasonStart, setSeasonStart] = useState("2026-03-26");
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
      // 2025 Season from Baseball Savant (SAMPLED for performance)
      if (season2025PitchData) {
        setPitchData(season2025PitchData);
      } else if (pitcherId) {
        setIsLoading(true);
        try {
          const result = await getStatcastSampled(pitcherId, "2025-03-27", "2025-09-28", 50);
          console.log(`2025 load: ${result.total_pitches} total, ${result.sampled.length} sampled`);
          if (result.sampled && result.sampled.length > 0) {
            const normalized = normAndFilter(result.sampled);
            setSeason2025PitchData(normalized);
            setPitchData(normalized);
            if (!pitcherHand && result.p_throws) setPitcherHand(result.p_throws);
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
            {page === "tracker" && <LiveGameSelector onSelectPitcher={handleSelectFromGame} C={C} logos={teamLogos} />}
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
