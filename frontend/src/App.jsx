import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as recharts from "recharts";
import { searchPitchers, getLiveGames, getGamePitchers, getGamePitches, getStatcast } from "./api.js";

const {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, ReferenceArea
} = recharts;

const themes = {
  dark: {
    bg: "#0a0e17", surface: "#111827", surfaceAlt: "#1a2234",
    border: "#1e293b", borderLight: "#334155", text: "#e2e8f0",
    textMuted: "#94a3b8", textDim: "#64748b", accent: "#3b82f6",
    accentGlow: "rgba(59,130,246,0.15)", tableStripe: "rgba(26,34,52,0.5)",
    yellow: "#facc15",
  },
  light: {
    bg: "#f1f5f9", surface: "#ffffff", surfaceAlt: "#f8fafc",
    border: "#e2e8f0", borderLight: "#cbd5e1", text: "#1e293b",
    textMuted: "#475569", textDim: "#94a3b8", accent: "#2563eb",
    accentGlow: "rgba(37,99,235,0.1)", tableStripe: "rgba(241,245,249,0.7)",
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
const avg1 = (a) => a.length > 0 ? (a.reduce((s, v) => s + v, 0) / a.length).toFixed(1) : "—";
const avgInt = (a) => a.length > 0 ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : "—";
const avg3 = (a) => a.length > 0 ? (a.reduce((s, v) => s + v, 0) / a.length).toFixed(3) : "—";
const avgNum = (a) => a.length > 0 ? a.reduce((s, v) => s + v, 0) / a.length : 0;

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
      maxVelo: Math.max(...pts.map(p => p.release_speed)).toFixed(1),
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
      expRunValue: pts.map(p => p.delta_run_exp).reduce((a, b) => a + b, 0).toFixed(2),
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
    maxVelo: Math.max(...allPts.map(p => p.release_speed)).toFixed(1),
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
    expRunValue: allPts.map(p => p.delta_run_exp).reduce((a, b) => a + b, 0).toFixed(2),
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
    <div ref={ref} style={{ position: "relative", width: "280px" }}>
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

// ─── Live Game Selector (real MLB API) ───
const LiveGameSelector = ({ onSelectPitcher, C }) => {
  const [open, setOpen] = useState(false);
  const [sg, setSg] = useState(null);
  const [games, setGames] = useState([]);
  const [pitchers, setPitchers] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSg(null); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleOpen = async () => {
    const nowOpen = !open;
    setOpen(nowOpen);
    setSg(null);
    if (nowOpen) {
      setLoading(true);
      try {
        const g = await getLiveGames();
        setGames(g);
      } catch (e) { console.error("Failed to load games:", e); }
      setLoading(false);
    }
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

  const liveGames = games.filter(g => g.status === "Live" || g.status === "In Progress");
  const allGames = games.length > 0 ? games : [];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={handleOpen} style={{ display: "flex", alignItems: "center", gap: "16px", background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px 20px", cursor: "pointer", fontFamily: "inherit" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px rgba(34,197,94,0.6)" }} />
          <span style={{ fontSize: "12px", fontWeight: 700, color: C.accent, letterSpacing: "1px" }}>GAMES</span>
        </div>
        <span style={{ fontSize: "10px", color: C.textDim }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 200, marginTop: "4px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", boxShadow: "0 12px 40px rgba(0,0,0,0.4)", width: "420px", overflow: "hidden", maxHeight: "500px", overflowY: "auto" }}>
          {!sg ? (
            <>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: C.textDim }}>
                {loading ? "Loading games..." : `Today's Games (${allGames.length})`}
              </div>
              {allGames.map(g => (
                <div key={g.game_pk} onClick={() => handleSelectGame(g)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", cursor: "pointer", borderBottom: `1px solid ${C.border}` }}
                  onMouseEnter={e => e.currentTarget.style.background = C.accentGlow} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: C.text }}>{g.away_team}</span>
                    <span style={{ fontSize: "12px", color: C.textDim, margin: "0 8px" }}>@</span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: C.text }}>{g.home_team}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: C.text }}>{g.away_score} - {g.home_score}</div>
                    <div style={{ fontSize: "10px", color: g.status === "Live" ? "#22c55e" : C.accent }}>{g.inning || g.detailed_status}</div>
                  </div>
                </div>
              ))}
              {!loading && allGames.length === 0 && (
                <div style={{ padding: "20px 16px", textAlign: "center", fontSize: "12px", color: C.textDim }}>No games scheduled today</div>
              )}
            </>
          ) : (
            <>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button onClick={() => setSg(null)} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontFamily: "inherit", fontSize: "11px", fontWeight: 600 }}>← Back</button>
                <span style={{ fontSize: "12px", fontWeight: 700, color: C.text }}>{sg.away_team} @ {sg.home_team}</span>
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
  const grouped = {};
  pitchTypeMetrics.forEach(pt => {
    pt.rawPitches.forEach(p => {
      if (!grouped[p.pitch_name]) grouped[p.pitch_name] = { name: p.pitch_name, abbrev: PITCH_ABBREV[p.pitch_name] || p.pitch_type, color: pt.color, data: [] };
      grouped[p.pitch_name].data.push({
        x: p.pfx_x, y: p.pfx_z, name: p.pitch_name, color: pt.color,
        velo: p.release_speed, inning: p.inning, count: p.count, batter: p.batter_name,
      });
    });
  });
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "20px" }}>
      <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: C.textDim, marginBottom: "16px" }}>Pitch Movement Profile</div>
      <div style={{ width: "100%", aspectRatio: "1/1", maxHeight: "440px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 15 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis type="number" dataKey="x" domain={[-25, 25]} tick={{ fill: C.textDim, fontSize: 10 }} ticks={[-25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25]} label={{ value: "Horizontal Break (in)", position: "bottom", fill: C.textDim, fontSize: 10, dy: 12 }} />
            <YAxis type="number" dataKey="y" domain={[-25, 25]} tick={{ fill: C.textDim, fontSize: 10 }} ticks={[-25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25]} label={{ value: "Induced Vertical Break (in)", angle: -90, position: "insideLeft", fill: C.textDim, fontSize: 10, dx: -5 }} />
            <ReferenceLine x={0} stroke={C.borderLight} />
            <ReferenceLine y={0} stroke={C.borderLight} />
            <Tooltip content={({ payload }) => {
              if (!payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "8px 12px", fontSize: "11px", minWidth: "160px" }}>
                  <div style={{ color: d.color, fontWeight: 700, marginBottom: "4px" }}>{d.name} — {d.velo != null ? d.velo.toFixed(1) : "—"} mph</div>
                  <div style={{ color: C.textMuted, lineHeight: 1.6 }}>
                    <div>IVB: {d.y != null ? d.y.toFixed(1) : "—"}" | HB: {d.x != null ? d.x.toFixed(1) : "—"}"</div>
                    {currentView === "live" && (
                      <>
                        {d.batter && <div>vs. {d.batter}</div>}
                        <div>Inning {d.inning} · Count: {d.count}</div>
                      </>
                    )}
                  </div>
                </div>
              );
            }} />
            {Object.values(grouped).map(g => <Scatter key={g.name} name={g.name} data={g.data} fill={g.color} opacity={0.7} r={4} />)}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap", marginTop: "8px" }}>
        {Object.values(grouped).map(g => (
          <div key={g.name} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: C.textMuted }}>
            <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: g.color }} />{g.abbrev}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Usage Split with Count Slider ───
const UsageSplitChart = ({ pitchTypeMetrics, pitchData, C }) => {
  const [countState, setCountState] = useState("all");
  const usageSplits = useMemo(() => computeUsageSplits(pitchData, countState), [pitchData, countState]);
  const ordered = pitchTypeMetrics.map(pt => ({
    name: pt.name, code: pt.code, color: pt.color,
    vsL: usageSplits[pt.name]?.vsL || 0, vsR: usageSplits[pt.name]?.vsR || 0,
  }));
  const maxUsage = Math.max(...ordered.flatMap(p => [p.vsL, p.vsR]), 50);
  const countKeys = Object.keys(COUNT_STATES);
  const currentIdx = countKeys.indexOf(countState);

  const PillBar = ({ value, color, align, code }) => {
    const widthPct = (value / maxUsage) * 100;
    return (
      <div style={{ display: "flex", alignItems: "center", flexDirection: align === "right" ? "row-reverse" : "row", gap: "6px", width: "100%" }}>
        <div style={{ flex: 1, height: "26px", borderRadius: "13px", background: C.surfaceAlt, overflow: "hidden", display: "flex", justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
          <div style={{ width: `${Math.max(widthPct, 4)}%`, height: "100%", borderRadius: "13px", background: color, opacity: 0.85, transition: "width 0.4s ease" }} />
        </div>
        <span style={{ fontSize: "12px", fontWeight: 700, color: C.text, minWidth: "32px", textAlign: "center" }}>{value}%</span>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: color, color: "#fff", fontWeight: 700, fontSize: "10px", borderRadius: "4px", padding: "3px 8px", minWidth: "28px", textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>{code}</span>
      </div>
    );
  };

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "20px", display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: C.textDim, marginBottom: "20px" }}>Pitch Usage by Batter Hand</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "center", marginBottom: "12px", paddingBottom: "8px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ textAlign: "center", fontSize: "11px", fontWeight: 700, letterSpacing: "1.5px", color: C.accent }}>vs. LHH</div>
        <div style={{ textAlign: "center", fontSize: "11px", fontWeight: 700, letterSpacing: "1.5px", color: C.accent }}>vs. RHH</div>
      </div>
      <div style={{ flex: 1 }}>
        {ordered.map(p => (
          <div key={p.name} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "center", padding: "5px 0", gap: "12px" }}>
            <PillBar value={p.vsL} color={p.color} align="right" code={p.code} />
            <PillBar value={p.vsR} color={p.color} align="left" code={p.code} />
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
const ReleasePointPlot = ({ pitchTypeMetrics, avgRelH, avgRelS, avgExt, C }) => {
  const rh = parseFloat(avgRelH) || 0;
  const rs = typeof avgRelS === "number" ? avgRelS : parseFloat(avgRelS) || 0;
  const dots = pitchTypeMetrics.map(pt => ({ x: pt.avgRelSNum, y: pt.avgRelHNum, name: pt.name, color: pt.color }));
  return (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "20px", width: "520px" }}>
        <div style={{ fontSize: "14px", fontWeight: 700, color: C.text, textAlign: "center", marginBottom: "12px" }}>Release Point</div>
        <div style={{ display: "flex", justifyContent: "center", gap: "16px", marginBottom: "12px" }}>
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
          </ScatterChart>
        </ResponsiveContainer>
      </div>
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

// ─── Pitch Location Plot ───
const PitchLocationPlot = ({ pitchData, pitchTypeMetrics, C }) => {
  const [locHand, setLocHand] = useState("all");

  const filtered = useMemo(() => {
    if (!pitchData) return [];
    const f = locHand === "all" ? pitchData : pitchData.filter(p => p.batter_hand === locHand);
    return f.map(p => ({
      x: p.plate_x, y: p.plate_z, name: p.pitch_name, color: getPitchColor(p.pitch_name),
      code: p.pitch_type, velo: p.release_speed, count: p.count,
      batter: p.batter_name, inning: p.inning, description: p.description, hand: p.batter_hand,
    }));
  }, [pitchData, locHand]);

  const descLabel = (d) => ({ ball: "Ball", swinging_strike: "Swinging Strike", called_strike: "Called Strike", foul: "Foul", hit_into_play: "In Play" }[d] || d);

  // From pitcher POV: LHH stands on RIGHT side of plate, RHH on LEFT
  const batterSide = locHand === "L" ? "right" : locHand === "R" ? "left" : null;

  return (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "20px", width: "520px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: C.text }}>Pitch Locations</div>
          <div style={{ display: "flex", gap: "4px" }}>
            {[{ key: "all", label: "All" }, { key: "L", label: "vs LHH" }, { key: "R", label: "vs RHH" }].map(t => (
              <button key={t.key} onClick={() => setLocHand(t.key)} style={{
                background: locHand === t.key ? C.accentGlow : "transparent",
                border: `1px solid ${locHand === t.key ? C.accent : C.border}`,
                borderRadius: "4px", padding: "4px 10px",
                color: locHand === t.key ? C.accent : C.textDim,
                fontSize: "10px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>{t.label}</button>
            ))}
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <ResponsiveContainer width="100%" height={480}>
            <ScatterChart margin={{ top: 10, right: 40, bottom: 40, left: 40 }}>
              <CartesianGrid stroke="none" />
              <XAxis type="number" dataKey="x" domain={[-2.5, 2.5]} tick={{ fill: C.textDim, fontSize: 10 }} ticks={[-2, -1, 0, 1, 2]} label={{ value: "Feet from Center", position: "bottom", fill: C.textDim, fontSize: 10, dy: 12 }} />
              <YAxis type="number" dataKey="y" domain={[0, 5]} tick={{ fill: C.textDim, fontSize: 10 }} label={{ value: "Height (ft)", angle: -90, position: "insideLeft", fill: C.textDim, fontSize: 10, dx: -5 }} />
              {/* Strike zone */}
              <ReferenceArea x1={-0.83} x2={0.83} y1={1.5} y2={3.5} fill="none" stroke={C.textMuted} strokeWidth={2} />
              {/* Home plate drawn via ReferenceLine label for perfect coordinate alignment */}
              <ReferenceLine y={0.65} stroke="none" label={{
                position: "center",
                content: (props) => {
                  const { viewBox } = props;
                  if (!viewBox) return null;
                  const centerX = viewBox.x + viewBox.width / 2;
                  const centerY = viewBox.y;
                  // viewBox.width spans the full data range (-2.5 to 2.5 = 5 ft)
                  const pxPerFt = viewBox.width / 5;
                  const halfW = 0.83 * pxPerFt;
                  const tipUp = 18;
                  const cornerUp = 8;
                  return (
                    <polygon
                      points={`${centerX - halfW},${centerY} ${centerX + halfW},${centerY} ${centerX + halfW * 0.88},${centerY - cornerUp} ${centerX},${centerY - tipUp} ${centerX - halfW * 0.88},${centerY - cornerUp}`}
                      fill={C.textMuted} fillOpacity={0.15}
                      stroke={C.textMuted} strokeWidth={2} strokeOpacity={0.45}
                      strokeLinejoin="round"
                    />
                  );
                }
              }} />
              <Tooltip content={({ payload }) => {
                if (!payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "10px 14px", fontSize: "11px", minWidth: "180px" }}>
                    <div style={{ color: d.color, fontWeight: 700, marginBottom: "4px" }}>{d.name} — {d.velo} mph</div>
                    <div style={{ color: C.textMuted, lineHeight: 1.6 }}>
                      <div>vs. {d.batter} ({d.hand}HH)</div>
                      <div>Inning {d.inning} · Count: {d.count}</div>
                      <div>Result: {descLabel(d.description)}</div>
                    </div>
                  </div>
                );
              }} />
              <Scatter data={filtered} r={5} opacity={0.8}>
                {filtered.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>


        </div>
        {/* Legend */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginTop: "4px" }}>
          {pitchTypeMetrics.map(pt => (
            <div key={pt.name} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: C.textMuted }}>
              <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: pt.color }} />
              {PITCH_ABBREV[pt.name] || pt.code}
            </div>
          ))}
        </div>
      </div>
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

  // Movement data:
  // - Savant CSV: pfx_z and pfx_x are IVB and HB in FEET → multiply by 12 for inches
  // - Live feed: pfxZ and pfxX from coordinates are already in INCHES
  const isSavant = p.movement_source === "savant";
  const pfx_z_inches = p.pfx_z != null ? (isSavant ? p.pfx_z * 12 : p.pfx_z) : null;
  const pfx_x_inches = p.pfx_x != null ? (isSavant ? p.pfx_x * -12 : p.pfx_x * -1) : null;

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
    is_ground_ball: false,
    is_fly_ball: false,
    is_barrel: false,
    batter_hand: p.batter_hand || p.stand || "R",
    count: p.count || `${p.balls || 0}-${p.strikes || 0}`,
    batter_name: p.batter_name || "",
    inning: p.inning || 0,
    launch_speed: p.launch_speed,
    estimated_slg_using_speedangle: null,
    estimated_woba_using_speedangle: p.estimated_woba_using_speedangle,
    woba_value: null,
    delta_run_exp: p.delta_run_exp,
  };
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
];
const RESULT_COLS = [
  { key: "name", label: "Pitch", align: "left" }, { key: "bipCount", label: "BIP" },
  { key: "gbRate", label: "GB%" }, { key: "fbRate", label: "FB%" },
  { key: "barrelRate", label: "Barrel%" }, { key: "xSLG", label: "xSLG" },
  { key: "xwOBACON", label: "xwOBACON" }, { key: "xwOBA", label: "xwOBA" },
  { key: "expRunValue", label: "xRV" },
];

// ─── Main App ───
export default function PitcherTracker() {
  const [theme, setTheme] = useState("light");
  const C = themes[theme];
  const [pitcherName, setPitcherName] = useState("");
  const [activePitcher, setActivePitcher] = useState(null);
  const [pitcherId, setPitcherId] = useState(null);
  const [pitcherHand, setPitcherHand] = useState("");
  const [view, setView] = useState("live");
  const [pitchData, setPitchData] = useState(null);
  const [livePitchData, setLivePitchData] = useState(null);
  const [historicalPitchData, setHistoricalPitchData] = useState(null);
  const [startDate, setStartDate] = useState("2025-04-01");
  const [endDate, setEndDate] = useState("2025-06-15");
  const [isLoading, setIsLoading] = useState(false);
  const [tableView, setTableView] = useState("stuff");
  const [handFilter, setHandFilter] = useState("all");
  const [activeGame, setActiveGame] = useState(null);
  const [gamePk, setGamePk] = useState(null);
  const pollRef = useRef(null);

  const metrics = useMemo(() => {
    if (!pitchData) return null;
    const hf = (tableView === "performance" || tableView === "results") ? handFilter : "all";
    return computeMetrics(pitchData, hf);
  }, [pitchData, handFilter, tableView]);
  const stuffMetrics = useMemo(() => pitchData ? computeMetrics(pitchData, "all") : null, [pitchData]);

  // Live polling: re-fetch pitch data every 15 seconds during live games
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (view === "live" && gamePk && pitcherId) {
      pollRef.current = setInterval(async () => {
        try {
          const raw = await getGamePitches(gamePk, pitcherId);
          if (raw.length > 0) {
            const normalized = raw.map(normalizeLivePitch);
            setLivePitchData(normalized);
            setPitchData(normalized);
          }
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
          const normalized = raw.map(normalizeLivePitch);
          setLivePitchData(normalized);
          setPitchData(normalized);
        } catch (e) { console.error("Failed to reload live:", e); }
        setIsLoading(false);
      } else if (livePitchData) {
        setPitchData(livePitchData);
      }
    } else {
      // Historical: restore cached historical data if available
      if (historicalPitchData) {
        setPitchData(historicalPitchData);
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
    // Reset historical on pitcher change
    setHistoricalPitchData(null);
    setIsLoading(true);
    try {
      const raw = await getGamePitches(game.game_pk, pitcher.id);
      const normalized = raw.map(normalizeLivePitch);
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
        const normalized = raw.map(normalizeLivePitch);
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
  const tableCols = tableView === "stuff" ? STUFF_COLS : tableView === "performance" ? PERF_COLS : RESULT_COLS;
  const tableTitle = tableView === "stuff" ? "Stuff & Movement" : tableView === "performance" ? "Plate Discipline & Performance" : "Batted Ball & Expected Stats";
  const displayMetrics = tableView === "stuff" ? stuffMetrics : metrics;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'JetBrains Mono','SF Mono','Fira Code',monospace" }}>
      {/* Header */}
      <div style={{ background: theme === "dark" ? `linear-gradient(180deg,${C.surfaceAlt} 0%,${C.bg} 100%)` : C.surface, borderBottom: `1px solid ${C.border}`, padding: "16px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: "1440px", margin: "0 auto" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: C.accent, marginBottom: "4px" }}>Pitcher Command Center</div>
            <div style={{ fontSize: "11px", color: C.textDim, letterSpacing: "1px" }}>Live Statcast Tracking & Analytics</div>
          </div>
          {view === "live" && <LiveGameSelector onSelectPitcher={handleSelectFromGame} C={C} />}
          {activePitcher && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "16px", fontWeight: 700, color: C.text }}>
                {activePitcher}{pitcherHand && <span style={{ fontSize: "12px", fontWeight: 600, color: C.textDim, marginLeft: "8px" }}>{pitcherHand === "L" ? "LHP" : pitcherHand === "R" ? "RHP" : ""}</span>}
              </div>
              <div style={{ fontSize: "11px", color: C.textDim }}>
                {view === "live" && currentGame && <span>{currentGame.away_team} @ {currentGame.home_team} · {currentGame.inning || currentGame.detailed_status}</span>}
                {view === "historical" && `${startDate} → ${endDate}`}
                {stuffMetrics && <span style={{ marginLeft: "12px", color: C.accent }}>{stuffMetrics.total} pitches</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: "1440px", margin: "0 auto", padding: "24px 32px" }}>
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

        {activePitcher && (
          <>
            {/* View tabs */}
            <div style={{ display: "flex", marginBottom: "24px", borderBottom: `1px solid ${C.border}` }}>
              {["live", "historical"].map(t => (
                <button key={t} onClick={() => handleViewSwitch(t)} style={{
                  padding: "10px 24px", fontSize: "11px", fontWeight: 600, letterSpacing: "2px",
                  textTransform: "uppercase", color: view === t ? C.accent : C.textDim,
                  background: "transparent", border: "none", fontFamily: "inherit", cursor: "pointer",
                  borderBottom: view === t ? `2px solid ${C.accent}` : "2px solid transparent",
                }}>
                  {t === "live" ? "Live Game" : "Historical"}
                </button>
              ))}
            </div>

            {view === "historical" && (
              <div style={{ display: "flex", gap: "12px", marginBottom: "20px", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: "11px", color: C.textDim, letterSpacing: "1px", textTransform: "uppercase" }}>From</span>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "10px 14px", color: C.text, fontSize: "13px", fontFamily: "inherit", outline: "none", colorScheme: theme }} />
                <span style={{ fontSize: "11px", color: C.textDim, letterSpacing: "1px", textTransform: "uppercase" }}>To</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "10px 14px", color: C.text, fontSize: "13px", fontFamily: "inherit", outline: "none", colorScheme: theme }} />
                <button onClick={handleLoadHistorical} style={{
                  background: C.accent, border: "none", borderRadius: "6px", padding: "10px 20px",
                  color: "#fff", fontSize: "12px", fontWeight: 600, letterSpacing: "1px",
                  textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
                }}>
                  {isLoading ? "Loading..." : "Fetch Data"}
                </button>
              </div>
            )}

            {stuffMetrics && (
              <>
                {/* Movement + Usage */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
                  <MovementPlot pitchTypeMetrics={stuffMetrics.pitchTypeMetrics} C={C} view={view} />
                  <UsageSplitChart pitchTypeMetrics={stuffMetrics.pitchTypeMetrics} pitchData={pitchData} C={C} />
                </div>

                {/* Table tabs */}
                <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                  {[
                    { key: "stuff", label: "Stuff & Movement" },
                    { key: "performance", label: "Plate Discipline" },
                    { key: "results", label: "Batted Ball & xStats" },
                  ].map(t => (
                    <button key={t.key} onClick={() => { setTableView(t.key); setHandFilter("all"); }} style={{
                      background: tableView === t.key ? C.accentGlow : "transparent",
                      border: `1px solid ${tableView === t.key ? C.accent : C.border}`,
                      borderRadius: "6px", padding: "10px 20px",
                      color: tableView === t.key ? C.accent : C.textMuted,
                      fontSize: "12px", fontWeight: 600, letterSpacing: "1px",
                      textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
                    }}>{t.label}</button>
                  ))}
                </div>

                {displayMetrics && (
                  <SortableTable
                    data={displayMetrics.pitchTypeMetrics} columns={tableCols} title={tableTitle} C={C}
                    showHandToggle={tableView === "performance" || tableView === "results"}
                    handFilter={handFilter} setHandFilter={setHandFilter}
                    allRow={(tableView === "performance" || tableView === "results") ? displayMetrics.allRow : null}
                  />
                )}

                {/* Release Point */}
                <ReleasePointPlot
                  pitchTypeMetrics={stuffMetrics.pitchTypeMetrics}
                  avgRelH={stuffMetrics.avgRelH} avgRelS={stuffMetrics.avgRelS} avgExt={stuffMetrics.avgExt} C={C}
                />

                {/* Pitch Locations */}
                <PitchLocationPlot pitchData={pitchData} pitchTypeMetrics={stuffMetrics.pitchTypeMetrics} C={C} />
              </>
            )}
          </>
        )}

        {!activePitcher && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 40px", textAlign: "center" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px", opacity: 0.3 }}>⚾</div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: C.textMuted, marginBottom: "8px" }}>No Pitcher Selected</div>
            <div style={{ fontSize: "12px", color: C.textDim, maxWidth: "400px", lineHeight: 1.6 }}>
              Enter a pitcher's name above, or click "Live Games" to select a pitcher from an active game.
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: "16px 32px", display: "flex", justifyContent: "center", alignItems: "center", gap: "16px" }}>
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
