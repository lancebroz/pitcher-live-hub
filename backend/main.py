"""
Pitcher Tracker Backend
-----------------------
A simple API server that fetches MLB data and serves it to the frontend.
"""

import time
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Allow your frontend to talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # We'll lock this down later to your Vercel URL
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Simple cache so we don't spam MLB servers ───
_cache = {}

def get_cached(key, max_age_seconds):
    """Return cached data if it's fresh enough, otherwise None."""
    if key in _cache:
        data, timestamp = _cache[key]
        if time.time() - timestamp < max_age_seconds:
            return data
    return None

def set_cache(key, data):
    _cache[key] = (data, time.time())


MLB_BASE = "https://statsapi.mlb.com"


# ─── Route 1: Search for pitchers by name ───
@app.get("/api/search/pitcher")
async def search_pitcher(q: str):
    """
    Type a name, get back matching MLB players.
    Example: /api/search/pitcher?q=gerrit+cole
    """
    cache_key = f"search:{q.lower()}"
    cached = get_cached(cache_key, 86400)  # cache for 24 hours
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        # Search the MLB people endpoint
        resp = await client.get(
            f"{MLB_BASE}/api/v1/people/search",
            params={"names": q, "sportId": 1, "hydrate": "currentTeam"},
            timeout=10,
        )
        data = resp.json()

    results = []
    for person in data.get("people", []):
        # Filter to pitchers
        pos = person.get("primaryPosition", {}).get("abbreviation", "")
        if pos == "P":
            team = person.get("currentTeam", {}).get("abbreviation", "")
            throw_hand = person.get("pitchHand", {}).get("code", "")
            results.append({
                "id": person["id"],
                "name": person["fullName"],
                "team": team,
                "throws": throw_hand,
            })

    set_cache(cache_key, results)
    return results


# ─── Route 2: Get today's live/scheduled games ───
@app.get("/api/games/live")
async def get_live_games():
    """
    Returns all of today's MLB games with scores and status.
    """
    cached = get_cached("live_games", 30)  # refresh every 30 seconds
    if cached:
        return cached

    from datetime import date
    today = date.today().strftime("%Y-%m-%d")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{MLB_BASE}/api/v1/schedule",
            params={
                "sportId": 1,
                "date": today,
                "hydrate": "linescore,probablePitcher,decisions,team",
            },
            timeout=10,
        )
        data = resp.json()

    games = []
    for date_entry in data.get("dates", []):
        for game in date_entry.get("games", []):
            status = game.get("status", {})
            linescore = game.get("linescore", {})
            inning_half = linescore.get("inningHalf", "")
            inning_num = linescore.get("currentInning", "")
            inning_str = f"{inning_half} {inning_num}" if inning_half else status.get("detailedState", "")

            away = game.get("teams", {}).get("away", {})
            home = game.get("teams", {}).get("home", {})

            away_abbr = away.get("team", {}).get("abbreviation") or away.get("team", {}).get("name", "?")
            home_abbr = home.get("team", {}).get("abbreviation") or home.get("team", {}).get("name", "?")

            games.append({
                "game_pk": game["gamePk"],
                "status": status.get("abstractGameState", ""),  # Preview, Live, Final
                "detailed_status": status.get("detailedState", ""),
                "away_team": away_abbr,
                "home_team": home_abbr,
                "away_score": away.get("score", 0),
                "home_score": home.get("score", 0),
                "inning": inning_str,
                "venue": game.get("venue", {}).get("name", ""),
            })

    set_cache("live_games", games)
    return games


# ─── Route 3: Get pitchers who have pitched in a specific game ───
@app.get("/api/game/{game_pk}/pitchers")
async def get_game_pitchers(game_pk: int):
    """
    Returns all pitchers who have thrown in this game so far.
    """
    cache_key = f"game_pitchers:{game_pk}"
    cached = get_cached(cache_key, 30)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{MLB_BASE}/api/v1.1/game/{game_pk}/feed/live",
            timeout=15,
        )
        data = resp.json()

    pitchers = []
    seen_ids = set()

    # Walk through all plays to find every pitcher
    all_plays = data.get("liveData", {}).get("plays", {}).get("allPlays", [])
    for play in all_plays:
        about = play.get("about", {})
        matchup = play.get("matchup", {})
        pitcher = matchup.get("pitcher", {})
        pid = pitcher.get("id")
        if pid and pid not in seen_ids:
            seen_ids.add(pid)
            # Figure out which team this pitcher is on
            half = about.get("halfInning", "")
            # Top inning = away batting = home pitching, Bottom = home batting = away pitching
            side = "home" if half == "top" else "away"

            # Count pitches
            pitch_count = 0
            for p in all_plays:
                if p.get("matchup", {}).get("pitcher", {}).get("id") == pid:
                    pitch_count += len(p.get("playEvents", []))

            pitchers.append({
                "id": pid,
                "name": pitcher.get("fullName", ""),
                "side": side,
                "pitch_count": pitch_count,
            })

    set_cache(cache_key, pitchers)
    return pitchers


# ─── Route 4: Get pitch-by-pitch data for a pitcher in a game ───
@app.get("/api/game/{game_pk}/pitches")
async def get_game_pitches(game_pk: int, pitcher_id: int):
    """
    The main endpoint for the LIVE view.
    Returns every pitch a specific pitcher threw in a specific game.
    """
    cache_key = f"pitches:{game_pk}:{pitcher_id}"
    cached = get_cached(cache_key, 15)  # refresh every 15 seconds
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{MLB_BASE}/api/v1.1/game/{game_pk}/feed/live",
            timeout=15,
        )
        data = resp.json()

    pitches = []
    all_plays = data.get("liveData", {}).get("plays", {}).get("allPlays", [])

    for play in all_plays:
        matchup = play.get("matchup", {})
        if matchup.get("pitcher", {}).get("id") != pitcher_id:
            continue

        about = play.get("about", {})
        batter_name = matchup.get("batter", {}).get("fullName", "")
        batter_side = matchup.get("batSide", {}).get("code", "R")
        inning = about.get("inning", 0)

        for event in play.get("playEvents", []):
            if event.get("isPitch") is not True:
                continue

            pitch_data = event.get("pitchData", {})
            details = event.get("details", {})
            pitch_type = details.get("type", {})
            count_obj = event.get("count", {})
            count_str = f"{count_obj.get('balls', 0)}-{count_obj.get('strikes', 0)}"

            coords = pitch_data.get("coordinates", {})
            breaks = pitch_data.get("breaks", {})

            # Compute IVB and HB from the 9-parameter fit.
            # Uses the standard PITCHf/x formula: pfx = a_spin * T^2 / 2
            # where a_spin removes gravity from az.
            # Note: Savant's pfx values use a proprietary computation that
            # differs slightly from the simple 9P, but this gives values
            # within ~5-10%, which is acceptable for live game display.
            g = 32.174  # gravity in ft/s²
            ax = coords.get("aX")
            ay = coords.get("aY")
            az = coords.get("aZ")
            vx0 = coords.get("vX0")
            vy0 = coords.get("vY0")
            vz0 = coords.get("vZ0")
            y0 = coords.get("y0", 50.0)

            pfx_x_ft = None
            pfx_z_ft = None

            if all(v is not None for v in [ax, ay, az, vy0]):
                # Flight time T from y0 to front of plate
                yf = 17.0 / 12.0
                disc = vy0 * vy0 + 2.0 * ay * (yf - y0)
                if disc >= 0 and ay != 0:
                    vyf = -(disc ** 0.5)  # vyf is negative
                    T = (vyf - vy0) / ay
                    if T > 0 and T < 1.0:
                        pfx_x_ft = (ax / 2.0) * T * T
                        pfx_z_ft = ((az + g) / 2.0) * T * T

            pitches.append({
                "pitch_number": len(pitches) + 1,
                "pitch_type": pitch_type.get("code", ""),
                "pitch_name": pitch_type.get("description", ""),
                "release_speed": pitch_data.get("startSpeed"),
                "plate_x": coords.get("pX"),
                "plate_z": coords.get("pZ"),
                "release_pos_x": coords.get("x0"),
                "release_pos_z": coords.get("z0"),
                "release_extension": pitch_data.get("extension"),
                "pfx_x": pfx_x_ft,
                "pfx_z": pfx_z_ft,
                "movement_source": "live_feed",
                "release_spin_rate": breaks.get("spinRate"),
                "spin_direction": breaks.get("spinDirection"),
                "zone": pitch_data.get("zone"),
                "description": details.get("description", ""),
                "call": details.get("call", {}).get("description", ""),
                "is_in_play": details.get("isInPlay", False),
                "is_strike": details.get("isStrike", False),
                "is_ball": details.get("isBall", False),
                "count": count_str,
                "batter_name": batter_name,
                "batter_hand": batter_side,
                "inning": inning,
            })

    set_cache(cache_key, pitches)
    return pitches


# ─── Route 5: Get Statcast data for historical queries ───
@app.get("/api/pitcher/{pitcher_id}/statcast")
async def get_statcast(pitcher_id: int, start_date: str, end_date: str):
    """
    The main endpoint for the HISTORICAL view.
    Fetches Statcast CSV data from Baseball Savant.
    """
    cache_key = f"statcast:{pitcher_id}:{start_date}:{end_date}"
    cached = get_cached(cache_key, 3600)  # cache for 1 hour
    if cached:
        return cached

    url = "https://baseballsavant.mlb.com/statcast_search/csv"
    params = {
        "all": "true",
        "hfPT": "",
        "hfAB": "",
        "hfGT": "R|",
        "hfPR": "",
        "hfZ": "",
        "stadium": "",
        "hfBBL": "",
        "hfNewZones": "",
        "hfPull": "",
        "hfC": "",
        "hfSea": "",
        "hfSit": "",
        "player_type": "pitcher",
        "hfOuts": "",
        "opponent": "",
        "pitcher_throws": "",
        "batter_stands": "",
        "hfSA": "",
        "game_date_gt": start_date,
        "game_date_lt": end_date,
        "hfInfield": "",
        "team": "",
        "position": "",
        "hfOutfield": "",
        "hfRO": "",
        "home_road": "",
        "pitchers_lookup[]": str(pitcher_id),
        "hfFlag": "",
        "hfBBT": "",
        "metric_1": "",
        "hfInn": "",
        "min_pitches": "0",
        "min_results": "0",
        "group_by": "name",
        "sort_col": "pitches",
        "player_event_sort": "api_p_release_speed",
        "sort_order": "desc",
        "min_pas": "0",
        "type": "details",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params=params, timeout=30, follow_redirects=True)

    if resp.status_code != 200 or "pitch_type" not in resp.text[:500]:
        return []

    # Parse CSV
    import csv
    import io

    reader = csv.DictReader(io.StringIO(resp.text))
    pitches = []

    for row in reader:
        def safe_float(key):
            val = row.get(key, "")
            try:
                return float(val)
            except (ValueError, TypeError):
                return None

        pitches.append({
            "pitch_number": len(pitches) + 1,
            "pitch_type": row.get("pitch_type", ""),
            "pitch_name": row.get("pitch_name", ""),
            "release_speed": safe_float("release_speed"),
            "release_spin_rate": safe_float("release_spin_rate"),
            "spin_axis": safe_float("spin_axis"),
            "pfx_x": safe_float("pfx_x"),
            "pfx_z": safe_float("pfx_z"),
            "movement_source": "savant",
            "plate_x": safe_float("plate_x"),
            "plate_z": safe_float("plate_z"),
            "release_pos_x": safe_float("release_pos_x"),
            "release_pos_z": safe_float("release_pos_z"),
            "release_extension": safe_float("release_extension"),
            "vx0": safe_float("vx0"),
            "vy0": safe_float("vy0"),
            "vz0": safe_float("vz0"),
            "effective_speed": safe_float("effective_speed"),
            "zone": safe_float("zone"),
            "description": row.get("description", ""),
            "events": row.get("events", ""),
            "type": row.get("type", ""),  # S=strike, B=ball, X=in play
            "launch_speed": safe_float("launch_speed"),
            "launch_angle": safe_float("launch_angle"),
            "estimated_ba_using_speedangle": safe_float("estimated_ba_using_speedangle"),
            "estimated_woba_using_speedangle": safe_float("estimated_woba_using_speedangle"),
            "estimated_slg_using_speedangle": safe_float("estimated_slg_using_speedangle"),
            "woba_value": safe_float("woba_value"),
            "bb_type": row.get("bb_type", ""),
            "is_in_play": row.get("type", "") == "X",
            "batter_name": row.get("player_name", ""),
            "stand": row.get("stand", ""),  # Batter handedness: L or R
            "p_throws": row.get("p_throws", ""),
            "balls": row.get("balls", ""),
            "strikes": row.get("strikes", ""),
            "game_date": row.get("game_date", ""),
            "inning": safe_float("inning"),
            "delta_run_exp": safe_float("delta_run_exp"),
            "bat_speed": safe_float("bat_speed"),
            "swing_length": safe_float("swing_length"),
        })

    set_cache(cache_key, pitches)
    return pitches


# ─── Health check ───
@app.get("/")
async def root():
    return {"status": "ok", "service": "pitcher-tracker-api"}
