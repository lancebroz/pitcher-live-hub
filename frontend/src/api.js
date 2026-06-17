/**
 * API Helper
 * ----------
 * All communication with the backend goes through here.
 *
 * In development: set VITE_API_URL in a .env file
 * In production: set it in Vercel's environment variables
 */

const API_BASE = import.meta.env.VITE_API_URL || "https://pitcher-live-hub-production.up.railway.app";

// For cached-season, use same backend
async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`);
  return res;
}

// Team logos via backend proxy (avoids browser CORS errors with ESPN's API)
let _logoCache = null;
export async function getTeamLogos() {
  if (_logoCache) return _logoCache;
  try {
    const res = await fetch(`${API_BASE}/api/teams/logos`);
    if (!res.ok) return {};
    const data = await res.json();
    _logoCache = data || {};
    return _logoCache;
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

export async function getCachedSeason(pitcherId) {
  // Uses auto-detected backend (local if available, Railway otherwise)
  const res = await apiFetch(`/api/pitcher/${pitcherId}/cached-season`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.length > 0 ? data : [];
}

export async function getStatcastSampled(pitcherId, startDate, endDate, sampleSize = 50) {
  const res = await fetch(
    `${API_BASE}/api/pitcher/${pitcherId}/statcast-sampled?start_date=${startDate}&end_date=${endDate}&sample_per_type=${sampleSize}`
  );
  if (!res.ok) return { sampled: [], aggregates: [], total_pitches: 0, p_throws: "" };
  return res.json();
}

export async function getPitcherEra(pitcherId, gamePks, scope = "season") {
  if (!gamePks || gamePks.length === 0) return { era: null, earned_runs: 0, innings: 0, games: 0 };
  const res = await fetch(
    `${API_BASE}/api/pitcher/${pitcherId}/era?game_pks=${gamePks.join(",")}&scope=${scope}`
  );
  if (!res.ok) return { era: null, earned_runs: 0, innings: 0, games: 0 };
  return res.json();
}

export async function getPitcherInfo(pitcherId) {
  const res = await fetch(`${API_BASE}/api/pitcher/${pitcherId}/info`);
  if (!res.ok) return null;
  return res.json();
}

export async function getPitcherDataQuality(pitcherId) {
  const res = await fetch(`${API_BASE}/api/pitcher/${pitcherId}/data-quality`);
  if (!res.ok) return null;
  return res.json();
}

export async function getLeaderboard(batterHand = "all", pitchType = "all") {
  const res = await fetch(`${API_BASE}/api/leaderboard?batter_hand=${batterHand}&pitch_type=${pitchType}`);
  if (!res.ok) return { pitchers: [], pitch_types: [] };
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

export async function getReport(date, mode = "season", pitcherId = 0) {
  const params = new URLSearchParams({ date, mode });
  if (pitcherId) params.set("pitcher_id", pitcherId.toString());
  const res = await fetch(`${API_BASE}/api/report?${params.toString()}`);
  if (!res.ok) return { pitchers: [] };
  return res.json();
}
