/**
 * API Helper
 * ----------
 * All communication with the backend goes through here.
 *
 * In development: set VITE_API_URL in a .env file
 * In production: set it in Vercel's environment variables
 */

const API_BASE = import.meta.env.VITE_API_URL || "https://pitcher-live-hub-production.up.railway.app";

// ESPN team logos - fetched once and cached
let _logoCache = null;
export async function getTeamLogos() {
  if (_logoCache) return _logoCache;
  try {
    const res = await fetch("https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams");
    if (!res.ok) return {};
    const data = await res.json();
    const map = {};
    for (const t of data.sports?.[0]?.leagues?.[0]?.teams || []) {
      const team = t.team;
      const abbr = team.abbreviation;
      const logo = team.logos?.[0]?.href || "";
      if (abbr && logo) map[abbr] = logo;
    }
    // Handle common abbreviation differences (MLB API vs ESPN)
    if (map["WSH"] && !map["WAS"]) map["WAS"] = map["WSH"];
    if (map["WAS"] && !map["WSH"]) map["WSH"] = map["WAS"];
    if (map["AZ"] && !map["ARI"]) map["ARI"] = map["AZ"];
    if (map["ARI"] && !map["AZ"]) map["AZ"] = map["ARI"];
    if (map["CHW"] && !map["CWS"]) map["CWS"] = map["CHW"];
    if (map["CWS"] && !map["CHW"]) map["CHW"] = map["CWS"];
    if (map["CHA"] && !map["CWS"]) map["CWS"] = map["CHA"];
    if (map["CHA"] && !map["CHW"]) map["CHW"] = map["CHA"];
    _logoCache = map;
    return map;
  } catch (e) {
    console.error("Failed to load team logos:", e);
    return {};
  }
}

export async function searchPitchers(query) {
  const res = await fetch(`${API_BASE}/api/search/pitcher?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  return res.json();
}

export async function getLiveGames(gameDate) {
  const params = gameDate ? `?game_date=${gameDate}` : "";
  const res = await fetch(`${API_BASE}/api/games/live${params}`);
  if (!res.ok) return [];
  return res.json();
}

export async function getGamePitchers(gamePk) {
  const res = await fetch(`${API_BASE}/api/game/${gamePk}/pitchers`);
  if (!res.ok) return [];
  return res.json();
}

export async function getGamePitches(gamePk, pitcherId) {
  const res = await fetch(`${API_BASE}/api/game/${gamePk}/pitches?pitcher_id=${pitcherId}`);
  if (!res.ok) return [];
  return res.json();
}

export async function getStatcast(pitcherId, startDate, endDate) {
  const res = await fetch(
    `${API_BASE}/api/pitcher/${pitcherId}/statcast?start_date=${startDate}&end_date=${endDate}`
  );
  if (!res.ok) return [];
  return res.json();
}

export async function getStatcastSampled(pitcherId, startDate, endDate, sampleSize = 50) {
  const res = await fetch(
    `${API_BASE}/api/pitcher/${pitcherId}/statcast-sampled?start_date=${startDate}&end_date=${endDate}&sample_per_type=${sampleSize}`
  );
  if (!res.ok) return { sampled: [], aggregates: [], total_pitches: 0, p_throws: "" };
  return res.json();
}

export async function getPitcherEra(pitcherId, gamePks) {
  if (!gamePks || gamePks.length === 0) return { era: null, earned_runs: 0, innings: 0, games: 0 };
  const res = await fetch(
    `${API_BASE}/api/pitcher/${pitcherId}/era?game_pks=${gamePks.join(",")}`
  );
  if (!res.ok) return { era: null, earned_runs: 0, innings: 0, games: 0 };
  return res.json();
}

export async function getSeasonData(pitcherId) {
  const res = await fetch(`${API_BASE}/api/pitcher/${pitcherId}/season`);
  if (!res.ok) return [];
  return res.json();
}

export async function getStartersToday(gameDate) {
  const params = gameDate ? `?game_date=${gameDate}` : "";
  const res = await fetch(`${API_BASE}/api/starters/today${params}`);
  if (!res.ok) return [];
  return res.json();
}
