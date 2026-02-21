/**
 * API Helper
 * ----------
 * All communication with the backend goes through here.
 *
 * In development: set VITE_API_URL in a .env file
 * In production: set it in Vercel's environment variables
 */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function searchPitchers(query) {
  const res = await fetch(`${API_BASE}/api/search/pitcher?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  return res.json();
}

export async function getLiveGames() {
  const res = await fetch(`${API_BASE}/api/games/live`);
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
