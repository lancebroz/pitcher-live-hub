"""
Pitcher Tracker Backend
-----------------------
A simple API server that fetches MLB data and serves it to the frontend.
"""

import os
import time
import math
import asyncio
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

# ─── VAA (Vertical Approach Angle) helper ───
# Standard formula from FanGraphs / Harry Pavlidis (Baseball Prospectus):
#     vy_f = -sqrt(vy0^2 - 2*ay*(y0-yf))
#     t    = (vy_f - vy0) / ay
#     vz_f = vz0 + az*t
#     VAA  = -arctan(vz_f / vy_f) * (180/pi)
# vy0/vz0 are Statcast's reported initial velocities at y=50ft.
# yf=1.417ft is the front of home plate.
# Returns angle in degrees, or None if any input is missing/invalid.
def _compute_vaa(vy0, vz0, ay, az, y0=50.0, yf=1.417):
    try:
        if any(v is None for v in (vy0, vz0, ay, az)):
            return None
        vy0, vz0, ay, az = float(vy0), float(vz0), float(ay), float(az)
        if ay == 0:
            return None
        discriminant = vy0 * vy0 - 2 * ay * (y0 - yf)
        if discriminant < 0:
            return None
        vy_f = -math.sqrt(discriminant)
        if vy_f == 0:
            return None
        t = (vy_f - vy0) / ay
        vz_f = vz0 + az * t
        vaa = -math.degrees(math.atan(vz_f / vy_f))
        # Sanity check: real VAA values are between ~-15 and 0 degrees.
        # Reject any obvious garbage values.
        if vaa < -25 or vaa > 5:
            return None
        return round(vaa, 2)
    except (ValueError, TypeError, ZeroDivisionError):
        return None

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


# ─── Route: Team logos proxy (avoids browser CORS errors) ───
# ESPN blocks browser CORS but allows server requests. We proxy through here
# and the frontend hits this endpoint instead. Cached for 24h - logos rarely change.
@app.get("/api/teams/logos")
async def get_team_logos():
    cached = get_cached("team_logos", 86400)  # 24h cache
    if cached:
        return cached

    logos = {}
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams",
                timeout=15,
            )
            if resp.status_code == 200:
                data = resp.json()
                for t in (data.get("sports") or [{}])[0].get("leagues", [{}])[0].get("teams", []):
                    team = t.get("team", {})
                    abbr = team.get("abbreviation", "")
                    logos_list = team.get("logos") or []
                    href = logos_list[0].get("href", "") if logos_list else ""
                    if abbr and href:
                        logos[abbr] = href
                # Common abbreviation differences (MLB API uses some variants)
                aliases = [
                    ("WSH", "WAS"), ("AZ", "ARI"), ("CHW", "CWS"), ("CHA", "CWS"),
                    ("CHA", "CHW"), ("KC", "KCR"), ("SD", "SDP"), ("SF", "SFG"),
                    ("TB", "TBR"),
                ]
                for src, dst in aliases:
                    if src in logos and dst not in logos:
                        logos[dst] = logos[src]
                    if dst in logos and src not in logos:
                        logos[src] = logos[dst]
    except Exception as e:
        print(f"[Logos] Failed: {e}")

    set_cache("team_logos", logos)
    return logos


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
async def get_live_games(game_date: str = None):
    """
    Returns all MLB games for a given date (default: today) with scores and status.
    """
    from datetime import date, timedelta
    target = game_date or date.today().strftime("%Y-%m-%d")
    cache_key = f"live_games:{target}"
    cached = get_cached(cache_key, 30)  # refresh every 30 seconds
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{MLB_BASE}/api/v1/schedule",
            params={
                "sportId": 1,
                "date": target,
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

    set_cache(cache_key, games)
    return games


# ─── Route 3: Get pitchers who have pitched in a specific game ───
@app.get("/api/game/{game_pk}/pitchers")
async def get_game_pitchers(game_pk: int):
    """
    Returns all pitchers who have thrown in this game so far,
    including their box score line and season ERA.
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

    # Build a map of pitcher game stats from the boxscore
    boxscore = data.get("liveData", {}).get("boxscore", {})
    pitcher_stats = {}  # pid -> {ip, h, r, er, bb, k, hr, pitches, seasonEra}
    for side in ["home", "away"]:
        team_players = boxscore.get("teams", {}).get(side, {}).get("players", {})
        for key, pdata in team_players.items():
            pid = pdata.get("person", {}).get("id")
            stats = pdata.get("stats", {}).get("pitching", {})
            season_stats = pdata.get("seasonStats", {}).get("pitching", {})
            if pid and stats.get("inningsPitched") is not None:
                pitcher_stats[pid] = {
                    "ip": stats.get("inningsPitched", "0"),
                    "h": stats.get("hits", 0),
                    "r": stats.get("runs", 0),
                    "er": stats.get("earnedRuns", 0),
                    "bb": stats.get("baseOnBalls", 0),
                    "k": stats.get("strikeOuts", 0),
                    "hr": stats.get("homeRuns", 0),
                    "pitches": stats.get("numberOfPitches", 0),
                    "season_era": season_stats.get("era", "-.--"),
                    "season_ip": season_stats.get("inningsPitched", "0"),
                    "season_er": season_stats.get("earnedRuns", 0),
                }

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

            # Count pitches from play events
            pitch_count = 0
            for p in all_plays:
                if p.get("matchup", {}).get("pitcher", {}).get("id") == pid:
                    pitch_count += len(p.get("playEvents", []))

            p_stats = pitcher_stats.get(pid, {})

            pitchers.append({
                "id": pid,
                "name": pitcher.get("fullName", ""),
                "side": side,
                "pitch_count": pitch_count,
                "throws": matchup.get("pitchHand", {}).get("code", ""),
                "game_stats": p_stats if p_stats else None,
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

            # Hit data (only present on balls in play)
            hit_data = event.get("hitData", {})
            launch_speed = hit_data.get("launchSpeed")
            launch_angle = hit_data.get("launchAngle")
            # trajectory: "ground_ball", "fly_ball", "line_drive", "popup"
            trajectory = hit_data.get("trajectory", "")
            # Map trajectory to Savant bb_type format
            bb_type_map = {
                "ground_ball": "ground_ball",
                "fly_ball": "fly_ball",
                "line_drive": "line_drive",
                "popup": "popup",
            }
            bb_type = bb_type_map.get(trajectory, "")

            # IVB and HB come directly from the live feed's breaks object.
            # breakVerticalInduced = induced vertical break (inches)
            # breakHorizontal = horizontal break (inches)
            # Convert to feet to match Savant's pfx_x/pfx_z convention (feet).
            raw_ivb = breaks.get("breakVerticalInduced")
            raw_hb = breaks.get("breakHorizontal")
            pfx_z_ft = raw_ivb / 12.0 if raw_ivb is not None else None
            pfx_x_ft = raw_hb / -12.0 if raw_hb is not None else None

            # Pull velocity / accel for VAA. MLB API uses camelCase.
            vy0_g = coords.get("vY0")
            vz0_g = coords.get("vZ0")
            ax_g = coords.get("aX")
            ay_g = coords.get("aY")
            az_g = coords.get("aZ")
            vaa_g = _compute_vaa(vy0_g, vz0_g, ay_g, az_g)

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
                "vy0": vy0_g,
                "vz0": vz0_g,
                "ax": ax_g,
                "ay": ay_g,
                "az": az_g,
                "vaa": vaa_g,
                "description": details.get("description", ""),
                "call": details.get("call", {}).get("description", ""),
                "is_in_play": details.get("isInPlay", False),
                "is_strike": details.get("isStrike", False),
                "is_ball": details.get("isBall", False),
                "count": count_str,
                "batter_name": batter_name,
                "batter_hand": batter_side,
                "inning": inning,
                "launch_speed": launch_speed,
                "launch_angle": launch_angle,
                "bb_type": bb_type,
            })

    set_cache(cache_key, pitches)
    return pitches


# ─── Route: Get pitcher bio info (height, weight, hand, etc) ───
@app.get("/api/pitcher/{pitcher_id}/info")
async def get_pitcher_info(pitcher_id: int):
    """
    Fetches biographical info for a pitcher from MLB's Stats API.
    Returns height (both formatted string and total inches), weight, throwing hand,
    batting side, birth date, age, primary position, and jersey number.
    Cached for 7 days since this data rarely changes.
    """
    cache_key = f"pitcher_info:{pitcher_id}"
    cached = get_cached(cache_key, 60 * 60 * 24 * 7)  # 7 days
    if cached:
        return cached

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{MLB_BASE}/api/v1/people/{pitcher_id}",
                timeout=10,
            )
            data = resp.json()
    except Exception as e:
        print(f"Pitcher info fetch failed for {pitcher_id}: {e}")
        return {"error": "Failed to fetch pitcher info", "id": pitcher_id}

    people = data.get("people", [])
    if not people:
        return {"error": "Pitcher not found", "id": pitcher_id}

    p = people[0]

    # Parse height "6' 5\"" into total inches
    height_str = p.get("height", "")
    height_inches = None
    try:
        # Height can be like "6' 5\"" or "6'5\"" — handle both
        cleaned = height_str.replace('"', '').replace("\\", "").strip()
        if "'" in cleaned:
            feet_part, inches_part = cleaned.split("'", 1)
            height_inches = int(feet_part.strip()) * 12 + int(inches_part.strip() or "0")
    except Exception:
        height_inches = None

    result = {
        "id": p.get("id"),
        "full_name": p.get("fullName"),
        "first_name": p.get("firstName"),
        "last_name": p.get("lastName"),
        "jersey_number": p.get("primaryNumber"),
        "height": height_str,           # formatted string like "6' 5\""
        "height_inches": height_inches, # numeric total inches for math
        "weight": p.get("weight"),      # integer pounds
        "birth_date": p.get("birthDate"),
        "birth_city": p.get("birthCity"),
        "birth_country": p.get("birthCountry"),
        "age": p.get("currentAge"),
        "pitch_hand": (p.get("pitchHand") or {}).get("code"),       # "L" or "R"
        "bat_side": (p.get("batSide") or {}).get("code"),           # "L", "R", or "S"
        "position": (p.get("primaryPosition") or {}).get("abbreviation"),
        "position_name": (p.get("primaryPosition") or {}).get("name"),
        "active": p.get("active"),
    }
    set_cache(cache_key, result)
    return result


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
            "game_pk": int(row.get("game_pk", "0")) if str(row.get("game_pk", "")).strip().isdigit() else 0,
            "inning": safe_float("inning"),
            "at_bat_number": safe_float("at_bat_number"),
            "events": row.get("events", ""),
            "delta_run_exp": safe_float("delta_run_exp"),
            "bat_speed": safe_float("bat_speed"),
            "swing_length": safe_float("swing_length"),
        })

    # Fill in missing pitch_type from pitch_name (Savant sometimes returns blank codes)
    PITCH_NAME_MAP = {
        "4-Seam Fastball": "FF", "Four-Seam Fastball": "FF",
        "Sinker": "SI", "Cutter": "FC",
        "Slider": "SL", "Sweeper": "ST", "Slurve": "SV",
        "Curveball": "CU", "Knuckle Curve": "KC",
        "Changeup": "CH", "Split-Finger": "FS", "Splitter": "FS",
        "Screwball": "SC", "Forkball": "FO", "Knuckleball": "KN",
        "Eephus": "EP",
    }
    for p in pitches:
        if not p.get("pitch_type") and p.get("pitch_name"):
            p["pitch_type"] = PITCH_NAME_MAP.get(p["pitch_name"], (p["pitch_name"][:2].upper() if p["pitch_name"] else "UN"))

    set_cache(cache_key, pitches)
    return pitches


@app.get("/api/pitcher/{pitcher_id}/statcast-sampled")
async def get_statcast_sampled(pitcher_id: int, start_date: str, end_date: str, sample_per_type: int = 50):
    """
    Same as statcast but samples up to N pitches per pitch type to keep
    response size manageable for large datasets (full seasons).
    Also includes full pitch list for computing accurate aggregate stats.
    """
    import random
    from collections import defaultdict

    cache_key = f"statcast_sampled:{pitcher_id}:{start_date}:{end_date}:{sample_per_type}"
    cached = get_cached(cache_key, 3600)
    if cached:
        return cached

    # Reuse the main statcast fetch
    all_pitches = await get_statcast(pitcher_id, start_date, end_date)
    if not all_pitches:
        return {"sampled": [], "aggregates": [], "total_pitches": 0, "p_throws": ""}

    # Fill in missing pitch_type from pitch_name (Savant sometimes omits the code)
    PITCH_NAME_MAP = {
        "4-Seam Fastball": "FF", "Four-Seam Fastball": "FF",
        "Sinker": "SI", "Cutter": "FC",
        "Slider": "SL", "Sweeper": "ST", "Slurve": "SV",
        "Curveball": "CU", "Knuckle Curve": "KC",
        "Changeup": "CH", "Split-Finger": "FS", "Splitter": "FS",
        "Screwball": "SC", "Forkball": "FO", "Knuckleball": "KN",
        "Eephus": "EP",
    }
    for p in all_pitches:
        if not p.get("pitch_type") and p.get("pitch_name"):
            p["pitch_type"] = PITCH_NAME_MAP.get(p["pitch_name"], p["pitch_name"][:2].upper() or "UN")

    # Group by pitch type and sample
    by_type = defaultdict(list)
    for p in all_pitches:
        pt = p.get("pitch_type") or "UNK"
        by_type[pt].append(p)

    # Deterministic seed per pitcher so re-fetch gives same sample
    random.seed(pitcher_id)

    sampled = []
    aggregates = []
    for pt, pitches in by_type.items():
        # Sample
        if len(pitches) <= sample_per_type:
            sampled.extend(pitches)
        else:
            sampled.extend(random.sample(pitches, sample_per_type))

        # Compute aggregate stats for this pitch type from ALL pitches
        def _avg(key):
            vals = [p.get(key) for p in pitches if p.get(key) is not None]
            return sum(vals) / len(vals) if vals else None

        swstr = sum(1 for p in pitches if "swinging_strike" in (p.get("description") or "").lower())
        called_strike = sum(1 for p in pitches if "called_strike" in (p.get("description") or "").lower())
        foul = sum(1 for p in pitches if "foul" in (p.get("description") or "").lower())
        in_play = sum(1 for p in pitches if p.get("is_in_play"))
        whiffs_plus_swings = sum(1 for p in pitches if (p.get("description") or "").lower() in ("swinging_strike", "foul", "hit_into_play", "foul_tip"))

        aggregates.append({
            "pitch_type": pt,
            "pitch_name": pitches[0].get("pitch_name", ""),
            "count": len(pitches),
            "avg_velo": _avg("release_speed"),
            "avg_spin": _avg("release_spin_rate"),
            "avg_ivb": _avg("pfx_z"),
            "avg_hb": _avg("pfx_x"),
            "avg_extension": _avg("release_extension"),
            "avg_release_pos_x": _avg("release_pos_x"),
            "avg_release_pos_z": _avg("release_pos_z"),
            "swstr": swstr,
            "called_strike": called_strike,
            "foul": foul,
            "in_play": in_play,
            "whiffs_plus_swings": whiffs_plus_swings,
        })

    p_throws = all_pitches[0].get("p_throws", "") if all_pitches else ""

    result = {
        "sampled": sampled,
        "aggregates": aggregates,
        "total_pitches": len(all_pitches),
        "p_throws": p_throws,
    }
    set_cache(cache_key, result)
    return result


# ─── Parquet data source URLs (used by cached-season, season, leaderboard) ───
PARQUET_BASE = "https://raw.githubusercontent.com/lancebroz/mlb-pitcher-data/main/data/raw/2026/monthly"
DAILY_BASE = "https://raw.githubusercontent.com/lancebroz/mlb-pitcher-data/main/data/raw/2026/daily"
MONTH_FILES = [
    "03_march.parquet", "04_april.parquet", "05_may.parquet",
    "06_june.parquet", "07_july.parquet", "08_august.parquet",
    "09_september.parquet", "10_october.parquet",
]


# ─── Cached-season data source ───
# Loads monthly parquet files from the mlb-pitcher-data GitHub repo at startup.
# Refreshes every 24h. Replaces the old LOCAL_SAVANT_PATH approach which required
# a parquet file to be deployed alongside the code.
_local_savant_df = None
_local_savant_loaded_at = 0  # unix timestamp of last load
_LOCAL_SAVANT_TTL = 86400    # refresh once per day


@app.get("/api/debug/local-savant")
async def debug_local_savant():
    """
    Diagnostic: shows what the cached-season loader is actually using.
    """
    df = await _load_local_savant_async()
    info = {
        "df_loaded": df is not None,
        "row_count": len(df) if df is not None else 0,
        "columns": list(df.columns) if df is not None else [],
        "has_ax": "ax" in df.columns if df is not None else False,
        "has_ay": "ay" in df.columns if df is not None else False,
        "has_az": "az" in df.columns if df is not None else False,
        "loaded_at_unix": _local_savant_loaded_at,
        "age_seconds": int(time.time() - _local_savant_loaded_at) if _local_savant_loaded_at else None,
    }
    if df is not None and len(df) > 0:
        try:
            info["latest_game_date"] = str(df["game_date"].max())
            info["pitcher_count"] = int(df["pitcher_id"].nunique())
        except Exception as e:
            info["error"] = str(e)
    return info


async def _load_local_savant_async():
    """
    Load monthly parquets from GitHub. Cached for 24h.
    Returns a single combined DataFrame (or None on failure).
    """
    global _local_savant_df, _local_savant_loaded_at
    import pandas as pd
    import io
    from datetime import datetime as _dt
    from zoneinfo import ZoneInfo as _ZI

    age = time.time() - _local_savant_loaded_at
    if _local_savant_df is not None and age < _LOCAL_SAVANT_TTL:
        return _local_savant_df

    ct_now = _dt.now(_ZI("America/Chicago"))
    current_month = ct_now.month

    months_to_fetch = [
        f for f in MONTH_FILES
        if int(f.split("_")[0]) <= current_month
    ]

    async def _fetch_one(client, fname):
        try:
            resp = await client.get(f"{PARQUET_BASE}/{fname}", timeout=45)
            if resp.status_code == 200:
                return pd.read_parquet(io.BytesIO(resp.content))
        except Exception as e:
            print(f"[CachedSeason] Failed {fname}: {e}")
        return None

    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *[_fetch_one(client, f) for f in months_to_fetch]
        )

    dfs = [d for d in results if d is not None]
    if dfs:
        _local_savant_df = pd.concat(dfs, ignore_index=True)
        _local_savant_loaded_at = time.time()
        print(f"[CachedSeason] Loaded {len(_local_savant_df)} pitches from {len(dfs)} monthly parquets")
        return _local_savant_df
    elif _local_savant_df is not None:
        # Fetch failed but we have stale data — keep using it rather than serve nothing
        print(f"[CachedSeason] Refresh failed, serving stale data ({len(_local_savant_df)} rows)")
        return _local_savant_df
    else:
        print("[CachedSeason] Failed to load any monthly parquets")
        return None


# Backwards-compat sync wrapper for any old callers
def _load_local_savant():
    """Synchronous wrapper. Returns whatever's currently cached, or None."""
    global _local_savant_df
    return _local_savant_df

@app.get("/api/pitcher/{pitcher_id}/cached-season")
async def get_cached_season(pitcher_id: int):
    """
    Returns a pitcher's full 2026 season from the GitHub monthly parquets.
    Cached in memory; near-instant after first load. Refreshes every 24h.
    """
    df = await _load_local_savant_async()
    if df is None:
        return []

    # Filter to this pitcher (parquet uses 'pitcher_id' column)
    pid_col = "pitcher_id" if "pitcher_id" in df.columns else ("pitcher" if "pitcher" in df.columns else None)
    if pid_col is None:
        return []
    try:
        pitcher_df = df[df[pid_col].astype(int) == pitcher_id]
    except Exception:
        return []
    if len(pitcher_df) == 0:
        return []

    # Map pitch_type codes to pitch_name for fallback
    PT_NAMES = {
        "FF": "4-Seam Fastball", "SI": "Sinker", "FC": "Cutter",
        "SL": "Slider", "ST": "Sweeper", "SV": "Slurve",
        "CU": "Curveball", "KC": "Knuckle Curve", "CS": "Slow Curve",
        "CH": "Changeup", "FS": "Splitter", "KN": "Knuckleball",
        "EP": "Eephus", "SC": "Screwball",
    }

    # Map call_description from parquet's snake_case format to readable
    CALL_DESC_MAP = {
        "called_strike": "Called Strike", "swinging_strike": "Swinging Strike",
        "swinging_strike_blocked": "Swinging Strike (Blocked)",
        "foul": "Foul", "foul_tip": "Foul Tip", "foul_bunt": "Foul Bunt",
        "ball": "Ball", "blocked_ball": "Ball In Dirt",
        "hit_by_pitch": "Hit By Pitch", "missed_bunt": "Swinging Strike",
        "hit_into_play": "In Play, Out(s)",
        "hit_into_play_score": "In Play, Run(s)",
        "hit_into_play_no_out": "In Play, No Out",
        "pitchout": "Ball", "intent_ball": "Ball",
    }

    pitches = []
    for _, row in pitcher_df.iterrows():
        def sf(key):
            v = row.get(key)
            if v is not None and str(v) not in ("", "nan", "None", "NaN"):
                try: return float(v)
                except (ValueError, TypeError): return None
            return None

        def ss(key, default=""):
            v = row.get(key, default)
            s = str(v) if v is not None else default
            return default if s in ("nan", "None", "NaN", "") else s

        # Map parquet column names → cached-season output names
        # Parquet: start_speed, spin_rate, release_x/y/z, extension
        # Output:  release_speed, release_spin_rate, release_pos_x/z, release_extension
        release_speed = sf("start_speed") if sf("start_speed") is not None else sf("release_speed")
        release_spin_rate = sf("spin_rate") if sf("spin_rate") is not None else sf("release_spin_rate")
        release_pos_x = sf("release_x") if sf("release_x") is not None else sf("release_pos_x")
        release_pos_z = sf("release_z") if sf("release_z") is not None else sf("release_pos_z")
        release_extension = sf("extension") if sf("extension") is not None else sf("release_extension")

        pt = ss("pitch_type")
        pn = ss("pitch_name") or PT_NAMES.get(pt, pt)

        # Reverse fallback: if pitch_type empty but pitch_name valid, derive code from name
        if not pt and pn:
            PN_TO_PT = {v: k for k, v in PT_NAMES.items()}
            PN_TO_PT["Four-Seam Fastball"] = "FF"
            PN_TO_PT["Split-Finger"] = "FS"
            pt = PN_TO_PT.get(pn, pn[:2].upper() if pn else "UN")

        # Compute VAA from raw kinematics
        vy0_v = sf("vy0")
        vz0_v = sf("vz0")
        ax_v = sf("ax")
        ay_v = sf("ay")
        az_v = sf("az")
        vaa_v = _compute_vaa(vy0_v, vz0_v, ay_v, az_v)

        # call_description: prefer parquet's snake_case → readable mapping
        call_desc_raw = ss("call_description") or ss("description")
        description_out = CALL_DESC_MAP.get(call_desc_raw.lower(), call_desc_raw) if call_desc_raw else ""

        # type field for downstream code (S=strike, B=ball, X=in play)
        is_in_play = bool(row.get("is_in_play", False)) if "is_in_play" in row.index else (ss("type") == "X")
        is_strike = bool(row.get("is_strike", False)) if "is_strike" in row.index else (ss("type") == "S")
        type_v = "X" if is_in_play else ("S" if is_strike else "B")

        # bb_type / trajectory mapping
        bb_type = ss("trajectory") or ss("bb_type")

        pitches.append({
            "pitch_type": pt,
            "pitch_name": pn,
            "pitch_number": sf("pitch_number"),
            "release_speed": release_speed,
            "release_spin_rate": release_spin_rate,
            "spin_axis": sf("spin_direction") if sf("spin_direction") is not None else sf("spin_axis"),
            "pfx_x": (sf("pfx_x") / 12.0) if sf("pfx_x") is not None else None,
            "pfx_z": (sf("pfx_z") / 12.0) if sf("pfx_z") is not None else None,
            "plate_x": sf("plate_x"),
            "plate_z": sf("plate_z"),
            "release_pos_x": release_pos_x,
            "release_pos_z": release_pos_z,
            "release_extension": release_extension,
            "vx0": sf("vx0"),
            "vy0": vy0_v,
            "vz0": vz0_v,
            "ax": ax_v,
            "ay": ay_v,
            "az": az_v,
            "vaa": vaa_v,
            "effective_speed": sf("effective_speed"),
            "zone": sf("zone"),
            "description": description_out,
            "events": ss("events"),
            "type": type_v,
            "launch_speed": sf("launch_speed"),
            "launch_angle": sf("launch_angle"),
            "estimated_woba_using_speedangle": sf("estimated_woba_using_speedangle"),
            "bb_type": bb_type,
            "is_in_play": is_in_play,
            "stand": ss("stand"),
            "p_throws": ss("pitcher_hand") or ss("p_throws"),
            "balls": ss("balls"),
            "strikes": ss("strikes"),
            "game_date": ss("game_date"),
            "game_pk": int(row.get("game_pk", 0)) if str(row.get("game_pk", "0")) not in ("", "nan", "NaN") else 0,
            "inning": sf("inning"),
            "at_bat_number": sf("at_bat_number"),
            "delta_run_exp": sf("delta_run_exp"),
        })
    return pitches


# ─── Route 6: Get 2026 season data from parquet files ───

@app.get("/api/pitcher/{pitcher_id}/era")
async def get_pitcher_era(pitcher_id: int, game_pks: str = ""):
    """
    Returns season pitching stats for a pitcher.
    Primary source: MLB season stats API (exact official numbers).
    Fallback: boxscore aggregation across game_pks.
    """
    import asyncio

    cache_key = f"era_season:{pitcher_id}"
    cached = get_cached(cache_key, 300)
    if cached:
        return cached

    # ── Primary: MLB Season Stats API ──
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{MLB_BASE}/api/v1/people/{pitcher_id}/stats?stats=season&season=2026&group=pitching",
                timeout=10,
            )
            data = r.json()
            splits = data.get("stats", [{}])[0].get("splits", [])
            if splits:
                s = splits[0].get("stat", {})
                ip_str = s.get("inningsPitched", "0.0")
                try:
                    whole, rem = str(ip_str).split(".")
                    total_outs = int(whole) * 3 + int(rem)
                except Exception:
                    total_outs = 0
                innings = total_outs / 3.0
                ip_whole = total_outs // 3
                ip_rem = total_outs % 3
                innings_display = float(f"{ip_whole}.{ip_rem}")

                era_val = None
                try:
                    era_val = float(s.get("era", 0))
                except Exception:
                    if innings > 0:
                        era_val = round(int(s.get("earnedRuns", 0)) * 9.0 / innings, 2)

                result = {
                    "era": round(era_val, 2) if era_val is not None else None,
                    "earned_runs": int(s.get("earnedRuns", 0)),
                    "outs": total_outs,
                    "innings": innings_display,
                    "games": int(s.get("gamesPlayed", 0)),
                    "games_started": int(s.get("gamesStarted", 0)),
                    "strikeouts": int(s.get("strikeOuts", 0)),
                    "walks": int(s.get("baseOnBalls", 0)),
                    "hit_batsmen": int(s.get("hitBatsmen", 0)),
                    "batters_faced": int(s.get("battersFaced", 0)),
                    "home_runs": int(s.get("homeRuns", 0)),
                    "source": "season_api",
                }
                print(f"[ERA {pitcher_id}] Season API: K={result['strikeouts']} BB={result['walks']} HR={result['home_runs']} BF={result['batters_faced']} IP={innings_display} ERA={result['era']}")
                set_cache(cache_key, result)
                return result
    except Exception as e:
        print(f"[ERA {pitcher_id}] Season API failed: {e}, falling back to boxscore aggregation")

    # ── Fallback: Boxscore aggregation ──
    pks = [int(x) for x in game_pks.split(",") if x.strip().isdigit()]
    if not pks:
        return {"era": None, "earned_runs": 0, "outs": 0, "innings": 0.0, "games": 0}

    async def fetch_box(client, gpk):
        bk = f"box:{gpk}"
        b = get_cached(bk, 60 * 60 * 24 * 3)
        if b:
            return b
        try:
            r = await client.get(f"{MLB_BASE}/api/v1/game/{gpk}/boxscore", timeout=10)
            data = r.json()
            set_cache(bk, data)
            return data
        except Exception as e:
            print(f"Boxscore fetch failed for {gpk}: {e}")
            return None

    earned_runs = 0
    outs = 0
    games_with_data = 0
    strikeouts = 0
    walks = 0
    hit_batsmen = 0
    batters_faced = 0
    games_started = 0
    home_runs = 0

    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(*[fetch_box(client, gpk) for gpk in pks])

    for box in results:
        if not box:
            continue
        for side in ("home", "away"):
            players = box.get("teams", {}).get(side, {}).get("players", {})
            pdata = players.get(f"ID{pitcher_id}")
            if not pdata:
                continue
            stats = pdata.get("stats", {}).get("pitching", {})
            if not stats:
                print(f"[ERA {pitcher_id}] Found player in {side} but no pitching stats")
                continue
            ip_str = stats.get("inningsPitched", "0.0")
            er = stats.get("earnedRuns")
            if er is None and ip_str == "0.0":
                continue
            try:
                whole, rem = str(ip_str).split(".")
                game_outs = int(whole) * 3 + int(rem)
            except Exception:
                game_outs = 0
            earned_runs += int(er or 0)
            outs += game_outs
            strikeouts += int(stats.get("strikeOuts") or 0)
            walks += int(stats.get("baseOnBalls") or 0)
            hit_batsmen += int(stats.get("hitBatsmen") or 0)
            batters_faced += int(stats.get("battersFaced") or 0)
            home_runs += int(stats.get("homeRuns") or 0)
            if stats.get("gamesStarted"):
                games_started += int(stats.get("gamesStarted"))
            games_with_data += 1
            break  # pitcher only on one side

    innings = outs / 3.0
    era = (earned_runs * 9.0 / innings) if innings > 0 else None

    # IP in baseball format: 29.2 means 29 innings + 2 outs, not 29.2 decimal
    ip_whole = outs // 3
    ip_rem = outs % 3
    innings_display = float(f"{ip_whole}.{ip_rem}")

    result = {
        "era": round(era, 2) if era is not None else None,
        "earned_runs": earned_runs,
        "outs": outs,
        "innings": innings_display,
        "games": games_with_data,
        "games_started": games_started,
        "strikeouts": strikeouts,
        "walks": walks,
        "hit_batsmen": hit_batsmen,
        "batters_faced": batters_faced,
        "home_runs": home_runs,
    }
    print(f"[ERA {pitcher_id}] {len(pks)} game_pks requested, {games_with_data} found: K={strikeouts} BB={walks} HR={home_runs} BF={batters_faced} IP={innings_display} ERA={result['era']}")
    set_cache(cache_key, result)
    return result


@app.get("/api/pitcher/{pitcher_id}/season")
async def get_season_data(pitcher_id: int):
    """
    Fetches all 2026 season data for a pitcher.
    Combines parquet files (completed games) + today's live data.
    Wrapped in a top-level try/except so any unexpected error returns an empty
    list with a 200 rather than a 500, so one bad pitcher doesn't break the UI.
    """
    try:
        return await _get_season_data_impl(pitcher_id)
    except Exception as e:
        import traceback
        print(f"Season endpoint failed for pitcher {pitcher_id}: {e}")
        traceback.print_exc()
        return []


async def _get_season_data_impl(pitcher_id: int):
    """
    Fetches all 2026 season data for a pitcher.
    Combines parquet files (completed games) + today's live data.
    """
    import pandas as pd
    import io
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    # Use Central Time with 8am rollover to match the frontend's date logic.
    ct = ZoneInfo("America/Chicago")
    ct_now = datetime.now(ct)
    if ct_now.hour < 8:
        ct_now = ct_now - timedelta(days=1)
    today_str = ct_now.strftime("%Y-%m-%d")
    # Also check yesterday's games in case a game spanned the rollover
    yesterday_str = (ct_now - timedelta(days=1)).strftime("%Y-%m-%d")

    # ── Part 1: Parquet data (cached 5 min) ──
    parquet_cache_key = f"season_parquet:{pitcher_id}"
    parquet_pitches = get_cached(parquet_cache_key, 300)

    if parquet_pitches is None:
        # Skip GitHub parquet fetch — cached-season already serves all historical
        # data from the local Savant parquet. The /season endpoint now only needs
        # to add today's live game data that isn't yet in the local parquet.
        # This drops the typical season call from ~3s to ~500ms.
        parquet_pitches = []

    # ── Part 2: Today's live data (cached 30 sec) ──
    # Fetch recent game feeds to merge classified pitch data with parquet.
    # Check up to 4 days back to cover games where the parquet pipeline
    # captured NaN data before Statcast classified the pitches.
    from datetime import timedelta as td
    check_dates = [(ct_now - td(days=i)).strftime("%Y-%m-%d") for i in range(4)]
    live_cache_key = f"season_live:{pitcher_id}:{check_dates[0]}:{check_dates[-1]}"
    live_pitches = get_cached(live_cache_key, 30)

    if live_pitches is None:
        live_pitches = []
        try:
            # Step 1: Find this pitcher's game_pks for recent days from parquet,
            # AND any game_pks with incomplete data (NaN pitch_type = needs live refresh)
            target_game_pks = set()
            incomplete_game_pks = set()
            check_dates_set = set(check_dates)
            for p in parquet_pitches:
                gpk = p.get("game_pk", 0)
                if not gpk:
                    continue
                gd = p.get("game_date", "")
                # Handle game_date that might be "nan" from str(NaN)
                if gd and gd != "nan" and gd in check_dates_set:
                    target_game_pks.add(gpk)
                # Any pitch with empty/nan pitch_type = incomplete parquet data
                pt = p.get("pitch_type", "")
                if not pt or pt == "nan":
                    incomplete_game_pks.add(gpk)

            # Always refresh incomplete games regardless of their date
            target_game_pks.update(incomplete_game_pks)

            print(f"[Season {pitcher_id}] Target game_pks: {target_game_pks} (incomplete: {incomplete_game_pks})")

            # Step 2: If no parquet data for today/yesterday (e.g. first game of season,
            # or pipeline hasn't run yet), fall back to schedule — but only fetch games
            # where this pitcher appears, using the lightweight boxscore endpoint first.
            # NOTE: Only check TODAY (not last 4 days). The local Savant parquet is
            # refreshed daily, so anything older than today is already in parquet_pitches.
            # Checking 4 days here was scanning ~60 boxscores per request unnecessarily.
            if not target_game_pks:
                fallback_dates = [today_str]
                async with httpx.AsyncClient() as client:
                    # Fetch today's schedule
                    async def _fetch_sched(check_date):
                        try:
                            r = await client.get(
                                f"{MLB_BASE}/api/v1/schedule?sportId=1&date={check_date}",
                                timeout=10,
                            )
                            return r.json()
                        except Exception:
                            return None

                    sched_results = await asyncio.gather(
                        *[_fetch_sched(d) for d in fallback_dates]
                    )
                    sched_game_pks = []
                    for sched_json in sched_results:
                        if not sched_json:
                            continue
                        for de in sched_json.get("dates", []):
                            for g in de.get("games", []):
                                sched_game_pks.append(g["gamePk"])

                    # Check today's boxscores in parallel to find this pitcher.
                    async def _fetch_box(gpk):
                        try:
                            r = await client.get(
                                f"{MLB_BASE}/api/v1/game/{gpk}/boxscore",
                                timeout=5,
                            )
                            return (gpk, r.json())
                        except Exception:
                            return (gpk, None)

                    box_results = await asyncio.gather(
                        *[_fetch_box(gpk) for gpk in sched_game_pks]
                    )
                    for gpk, box in box_results:
                        if not box:
                            continue
                        for side in ("home", "away"):
                            players = box.get("teams", {}).get(side, {}).get("players", {})
                            pdata = players.get(f"ID{pitcher_id}")
                            if not pdata:
                                continue
                            pitching = pdata.get("stats", {}).get("pitching", {})
                            if pitching and pitching.get("inningsPitched", "0.0") != "0.0":
                                target_game_pks.add(gpk)
                                print(f"[Season {pitcher_id}] Fallback found pitcher in game {gpk} ({pitching.get('inningsPitched')} IP)")
                                break

            # Step 3: Fetch all targeted game feeds in parallel (was sequential —
            # this was the main remaining bottleneck for active pitchers).
            async def _fetch_feed(client, gpk):
                try:
                    r = await client.get(
                        f"{MLB_BASE}/api/v1.1/game/{gpk}/feed/live",
                        timeout=15,
                    )
                    return (gpk, r.json())
                except Exception:
                    return (gpk, None)

            async with httpx.AsyncClient() as client:
                feed_results = await asyncio.gather(
                    *[_fetch_feed(client, gpk) for gpk in target_game_pks]
                )

            for gpk, feed in feed_results:
                if feed is None:
                    continue
                print(f"[Season {pitcher_id}] Fetched live feed for game {gpk}")

                all_plays = feed.get("liveData", {}).get("plays", {}).get("allPlays", [])
                game_date_str = feed.get("gameData", {}).get("datetime", {}).get("officialDate", today_str)

                for play in all_plays:
                        matchup = play.get("matchup", {})
                        if matchup.get("pitcher", {}).get("id") != pitcher_id:
                            continue

                        about = play.get("about", {})
                        batter_name = matchup.get("batter", {}).get("fullName", "")
                        batter_side = matchup.get("batSide", {}).get("code", "R")
                        pitch_hand = matchup.get("pitchHand", {}).get("code", "")
                        inning = about.get("inning", 0)
                        play_result = play.get("result", {})
                        play_event_type = play_result.get("eventType", "")

                        play_pitches = []
                        for event in play.get("playEvents", []):
                            if not event.get("isPitch", True):
                                continue

                            pitch_data = event.get("pitchData", {})
                            details = event.get("details", {})
                            ptype = details.get("type", {})
                            count_obj = event.get("count", {})
                            coords = pitch_data.get("coordinates", {})
                            breaks = pitch_data.get("breaks", {})
                            hit_data = event.get("hitData", {})

                            raw_ivb = breaks.get("breakVerticalInduced")
                            raw_hb = breaks.get("breakHorizontal")
                            pfx_z_ft = raw_ivb / 12.0 if raw_ivb is not None else None
                            pfx_x_ft = raw_hb / -12.0 if raw_hb is not None else None

                            bb_map = {"ground_ball": "ground_ball", "fly_ball": "fly_ball", "line_drive": "line_drive", "popup": "popup"}

                            desc_raw = details.get("description", "").lower()
                            if "foul tip" in desc_raw:
                                desc = "swinging_strike"  # Savant counts foul tips as swinging strikes
                            elif "swinging" in desc_raw and "strike" in desc_raw:
                                desc = "swinging_strike"
                            elif "called" in desc_raw and "strike" in desc_raw:
                                desc = "called_strike"
                            elif "foul" in desc_raw:
                                desc = "foul"
                            elif "in play" in desc_raw:
                                desc = "hit_into_play"
                            else:
                                desc = "ball"

                            # Pull velocity / accel for VAA. MLB API uses camelCase.
                            vy0_live = coords.get("vY0")
                            vz0_live = coords.get("vZ0")
                            ax_live = coords.get("aX")
                            ay_live = coords.get("aY")
                            az_live = coords.get("aZ")
                            vaa_live = _compute_vaa(vy0_live, vz0_live, ay_live, az_live)

                            play_pitches.append({
                                "pitch_number": 0,
                                "pitch_type": ptype.get("code", ""),
                                "pitch_name": ptype.get("description", ""),
                                "release_speed": pitch_data.get("startSpeed"),
                                "release_spin_rate": breaks.get("spinRate"),
                                "pfx_x": pfx_x_ft,
                                "pfx_z": pfx_z_ft,
                                "movement_source": "live_feed",
                                "plate_x": coords.get("pX"),
                                "plate_z": coords.get("pZ"),
                                "release_pos_x": coords.get("x0"),
                                "release_pos_z": coords.get("z0"),
                                "release_extension": pitch_data.get("extension"),
                                "zone": pitch_data.get("zone"),
                                "vy0": vy0_live,
                                "vz0": vz0_live,
                                "ax": ax_live,
                                "ay": ay_live,
                                "az": az_live,
                                "vaa": vaa_live,
                                "description": desc,
                                "is_in_play": details.get("isInPlay", False),
                                "is_strike": details.get("isStrike", False),
                                "is_ball": details.get("isBall", False),
                                "launch_speed": hit_data.get("launchSpeed"),
                                "launch_angle": hit_data.get("launchAngle"),
                                "bb_type": bb_map.get(hit_data.get("trajectory", ""), ""),
                                "batter_name": batter_name,
                                "batter_hand": batter_side,
                                "stand": batter_side,
                                "p_throws": pitch_hand,
                                "balls": str(count_obj.get("balls", 0)),
                                "strikes": str(count_obj.get("strikes", 0)),
                                "game_date": game_date_str,
                                "game_pk": gpk,
                                "inning": inning,
                                "at_bat_number": play.get("atBatIndex", 0),
                                "events": "",
                            })

                        # Set events on last pitch of at-bat
                        if play_pitches and play_event_type:
                            play_pitches[-1]["events"] = play_event_type

                        live_pitches.extend(play_pitches)

        except Exception as e:
            print(f"Failed to fetch live data: {e}")

        if live_pitches:
            set_cache(live_cache_key, live_pitches)
            print(f"[Season {pitcher_id}] Live merge: {len(live_pitches)} classified pitches from game(s) {set(p['game_pk'] for p in live_pitches)}")
        else:
            print(f"[Season {pitcher_id}] Live merge: no pitches found")

    # ── Part 3: Merge with dedup ──
    # Get game_pks from live data to exclude from parquet
    live_game_pks = set()
    for p in live_pitches:
        if p.get("game_pk"):
            live_game_pks.add(p["game_pk"])

    # Filter parquet to exclude games that are in live data (prevents double-counting)
    pre_dedup = len(parquet_pitches)
    if live_game_pks:
        filtered_parquet = [p for p in parquet_pitches if p.get("game_pk", 0) not in live_game_pks]
    else:
        filtered_parquet = parquet_pitches
    removed = pre_dedup - len(filtered_parquet)
    if removed > 0:
        print(f"[Season {pitcher_id}] Dedup: removed {removed} parquet rows, replaced by {len(live_pitches)} live rows")

    # Unclassified parquet rows (empty/nan pitch_type with game_pk=0) are NOT
    # stripped server-side. The frontend's normAndFilter removes them before
    # rendering. This prevents data loss when the live merge can't find replacements.

    # Combine and re-number
    all_pitches = filtered_parquet + live_pitches
    for i, p in enumerate(all_pitches):
        p["pitch_number"] = i + 1

    return all_pitches


@app.get("/api/starters/today")
async def get_starters_today(game_date: str = None):
    """Returns starting pitchers for today with stat lines and game status."""
    from datetime import datetime
    if not game_date:
        game_date = datetime.now().strftime("%Y-%m-%d")

    cache_key = f"starters:{game_date}"
    cached = get_cached(cache_key, 15)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        sched = await client.get(
            f"{MLB_BASE}/api/v1/schedule?sportId=1&date={game_date}&hydrate=probablePitcher,linescore,team",
            timeout=10,
        )
        data = sched.json()

    results = []
    game_list = []
    for date_entry in data.get("dates", []):
        for game in date_entry.get("games", []):
            game_list.append(game)

    async with httpx.AsyncClient() as client:
        for game in game_list:
            game_pk = game["gamePk"]
            status = game.get("status", {}).get("abstractGameState", "")  # Preview, Live, Final
            detailed = game.get("status", {}).get("detailedState", "")
            home = game.get("teams", {}).get("home", {})
            away = game.get("teams", {}).get("away", {})
            home_abbr = home.get("team", {}).get("abbreviation", "")
            away_abbr = away.get("team", {}).get("abbreviation", "")
            inning = ""
            ls = game.get("linescore", {})
            if status == "Live":
                inning_half = ls.get("inningHalf", "")
                inning_num = ls.get("currentInning", "")
                if inning_num:
                    inning = f"{inning_half[:3]} {inning_num}"

            # Get probable pitchers for Preview games
            for side, team_obj in [("home", home), ("away", away)]:
                prob = team_obj.get("probablePitcher") or {}
                prob_id = prob.get("id")
                prob_name = prob.get("fullName", "")
                team_abbr = home_abbr if side == "home" else away_abbr
                opp_abbr = away_abbr if side == "home" else home_abbr

                starter_data = {
                    "game_pk": game_pk, "game_status": status, "detailed_status": detailed,
                    "inning": inning, "team": team_abbr, "opponent": opp_abbr, "side": side,
                    "pitcher_id": prob_id, "pitcher_name": prob_name,
                    "ip": "0.0", "h": 0, "r": 0, "er": 0, "bb": 0, "k": 0,
                    "pitches": 0, "strikes": 0, "swstr_pct": "0.0", "strike_pct": "0.0",
                    "is_current": False,
                }

                if status in ("Live", "Final"):
                    # Fetch boxscore to get stat line for the starter
                    try:
                        box = await client.get(f"{MLB_BASE}/api/v1/game/{game_pk}/boxscore", timeout=10)
                        box_data = box.json()
                        team_key = "home" if side == "home" else "away"
                        players = box_data.get("teams", {}).get(team_key, {}).get("players", {})
                        # Find the starting pitcher (first pitcher in pitchers list)
                        pitchers_list = box_data.get("teams", {}).get(team_key, {}).get("pitchers", [])
                        if pitchers_list:
                            starter_pid = pitchers_list[0]
                            pdata = players.get(f"ID{starter_pid}", {})
                            p_info = pdata.get("person", {})
                            stats = pdata.get("stats", {}).get("pitching", {})
                            starter_data["pitcher_id"] = p_info.get("id")
                            starter_data["pitcher_name"] = p_info.get("fullName", "")
                            starter_data["ip"] = stats.get("inningsPitched", "0.0")
                            starter_data["h"] = stats.get("hits", 0)
                            starter_data["r"] = stats.get("runs", 0)
                            starter_data["er"] = stats.get("earnedRuns", 0)
                            starter_data["bb"] = stats.get("baseOnBalls", 0)
                            starter_data["k"] = stats.get("strikeOuts", 0)
                            starter_data["pitches"] = stats.get("numberOfPitches", 0)
                            starter_data["strikes"] = stats.get("strikes", 0)
                            # Strike %
                            if starter_data["pitches"] > 0:
                                starter_data["strike_pct"] = f"{(starter_data['strikes'] / starter_data['pitches'] * 100):.1f}"
                            # SwStr% - need to parse play events for swinging strikes
                            # For now, approximate using strikeOuts as proxy or leave at 0
                            # Better: fetch feed/live and count
                            try:
                                feed = await client.get(f"{MLB_BASE}/api/v1.1/game/{game_pk}/feed/live", timeout=10)
                                fd = feed.json()
                                swstr = 0
                                total_pitches_seen = 0
                                for play in fd.get("liveData", {}).get("plays", {}).get("allPlays", []):
                                    if play.get("matchup", {}).get("pitcher", {}).get("id") != starter_pid:
                                        continue
                                    for ev in play.get("playEvents", []):
                                        if ev.get("isPitch"):
                                            total_pitches_seen += 1
                                            call = ev.get("details", {}).get("description", "").lower()
                                            if "swinging strike" in call or "foul tip" in call:
                                                swstr += 1
                                if total_pitches_seen > 0:
                                    starter_data["swstr_pct"] = f"{(swstr / total_pitches_seen * 100):.1f}"
                            except Exception:
                                pass
                            # Check if currently pitching
                            if status == "Live":
                                current_pitcher = ls.get("defense", {}).get("pitcher", {}).get("id")
                                if current_pitcher == starter_pid:
                                    starter_data["is_current"] = True
                    except Exception as e:
                        print(f"Failed boxscore for {game_pk}: {e}")

                if starter_data["pitcher_id"]:
                    results.append(starter_data)

    # Sort: Live first, then Preview, then Final
    status_order = {"Live": 0, "Preview": 1, "Final": 2}
    results.sort(key=lambda r: status_order.get(r["game_status"], 3))

    set_cache(cache_key, results)
    return results


@app.get("/api/leaderboard")
async def get_leaderboard(batter_hand: str = "all", pitch_type: str = "all"):
    """
    Aggregated pitcher stats leaderboard for the 2026 season.
    Reads all daily parquet files, groups by pitcher, computes rate stats.
    Returns { pitchers: [...], pitch_types: [...] }.
    """
    try:
        return await _leaderboard_impl(batter_hand, pitch_type)
    except Exception as e:
        import traceback
        print(f"Leaderboard endpoint failed: {e}")
        traceback.print_exc()
        return {"pitchers": [], "pitch_types": [], "error": str(e)}


async def _leaderboard_impl(batter_hand: str, pitch_type: str):
    import pandas as pd
    import io
    import asyncio
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    # ── Step 1: Load all parquet data (cached 24h - refreshes overnight) ──
    # Sourcing from the SAME monthly parquets that cached-season uses, so leaderboard
    # numbers match the Compare tool exactly. Was Savant CSV before, which caused
    # subtle metric mismatches and was very slow due to chunked CSV downloads.
    raw_key = "leaderboard_raw"
    all_df = get_cached(raw_key, 86400)  # 24h cache

    if all_df is None:
        ct = ZoneInfo("America/Chicago")
        ct_now = datetime.now(ct)

        # Reuse the SAME loader as cached-season so leaderboard ↔ Compare numbers
        # are guaranteed to match. The loader caches the combined DF for 24h.
        combined = await _load_local_savant_async()
        if combined is not None and len(combined) > 0:
            fetched_files = 1  # one combined DF
            failed_files = []
            print(f"[Leaderboard] Using shared cache: {len(combined)} rows")

            # Build records with same column names rest of the function expects
            def _safef(v):
                try:
                    if v is None or str(v) in ("", "nan", "NaN", "None"):
                        return None
                    return float(v)
                except (ValueError, TypeError):
                    return None

            CALL_DESC_MAP = {
                "called_strike": "Called Strike", "swinging_strike": "Swinging Strike",
                "swinging_strike_blocked": "Swinging Strike (Blocked)",
                "foul": "Foul", "foul_tip": "Foul Tip", "foul_bunt": "Foul Bunt",
                "ball": "Ball", "blocked_ball": "Ball In Dirt",
                "hit_by_pitch": "Hit By Pitch", "missed_bunt": "Swinging Strike",
                "hit_into_play": "In Play, Out(s)",
                "hit_into_play_score": "In Play, Run(s)",
                "hit_into_play_no_out": "In Play, No Out",
                "pitchout": "Ball", "intent_ball": "Ball",
            }

            records = []
            for _, row in combined.iterrows():
                pid_v = row.get("pitcher_id")
                if pid_v is None or pd.isna(pid_v):
                    continue
                try:
                    pitcher_id_int = int(pid_v)
                except (ValueError, TypeError):
                    continue

                desc_raw = str(row.get("call_description", "")).strip().lower()
                if not desc_raw or desc_raw == "nan":
                    desc_raw = str(row.get("description", "")).strip().lower()
                call_desc = CALL_DESC_MAP.get(desc_raw, desc_raw.replace("_", " ").title())

                is_strike = bool(row.get("is_strike", False))
                is_in_play = bool(row.get("is_in_play", False))

                pfx_x_raw = _safef(row.get("pfx_x"))
                pfx_z_raw = _safef(row.get("pfx_z"))
                # Parquet stores pfx in inches from MLB API. Convert to feet here
                # so the downstream *12 multiplier yields correct inches.
                pfx_x_ft = (pfx_x_raw / 12.0) if pfx_x_raw is not None else None
                pfx_z_ft = (pfx_z_raw / 12.0) if pfx_z_raw is not None else None

                records.append({
                    "pitcher_id": pitcher_id_int,
                    "pitcher_name": str(row.get("pitcher_name", "") or ""),
                    "pitcher_hand": str(row.get("pitcher_hand", "") or ""),
                    "batter_hand": str(row.get("stand", "") or ""),
                    "pitch_type": str(row.get("pitch_type", "") or ""),
                    "call_description": call_desc,
                    "is_strike": is_strike,
                    "is_in_play": is_in_play,
                    "zone": _safef(row.get("zone")),
                    "start_speed": _safef(row.get("start_speed")),
                    "spin_rate": _safef(row.get("spin_rate")),
                    "pfx_z": pfx_z_ft,
                    "pfx_x": -pfx_x_ft if pfx_x_ft is not None else None,
                    "launch_speed": _safef(row.get("launch_speed")),
                    "launch_angle": _safef(row.get("launch_angle")),
                    "trajectory": str(row.get("trajectory", "") or ""),
                    "events": str(row.get("events", "") or ""),
                    "balls": str(row.get("balls", "") or ""),
                    "strikes": str(row.get("strikes", "") or ""),
                    "game_pk": int(row.get("game_pk", 0)) if not pd.isna(row.get("game_pk")) else 0,
                    "game_date": str(row.get("game_date", "") or ""),
                    "at_bat_number": _safef(row.get("at_bat_number")),
                    "inning": _safef(row.get("inning")),
                })

            all_df = pd.DataFrame(records)
            set_cache(raw_key, all_df)
            set_cache("leaderboard_updated", ct_now.strftime("%Y-%m-%d %I:%M %p CT"))
            set_cache("leaderboard_fetch_stats", {
                "fetched": fetched_files,
                "failed": len(failed_files),
                "failed_files": failed_files,
                "source": "monthly_parquet",
            })
            print(f"[Leaderboard] Built {len(all_df)} pitch records, {all_df['pitcher_id'].nunique()} pitchers")
        else:
            all_df = pd.DataFrame()

    if all_df is None or len(all_df) == 0:
        return {"pitchers": [], "pitch_types": []}

    # Strip rows with empty/NaN pitch_type (unprocessed game data with no analytical value)
    all_df = all_df[all_df["pitch_type"].notna() & (all_df["pitch_type"].astype(str).str.strip() != "") & (all_df["pitch_type"].astype(str).str.lower() != "nan")]

    # Available pitch types (before filtering)
    all_pitch_types = sorted([str(pt) for pt in all_df["pitch_type"].dropna().unique() if str(pt).strip()])

    # ── Step 2: Apply filters ──
    df = all_df
    if batter_hand != "all" and "batter_hand" in df.columns:
        df = df[df["batter_hand"] == batter_hand]
    if pitch_type != "all" and "pitch_type" in df.columns:
        df = df[df["pitch_type"] == pitch_type]

    if len(df) == 0:
        return {"pitchers": [], "pitch_types": all_pitch_types}

    # ── Step 3: Pre-compute columns ──
    desc = df["call_description"].fillna("").str.lower()
    df = df.copy()
    is_foul_tip = desc.str.contains("foul tip", regex=False) | desc.str.contains("foul_tip", regex=False)
    df["_is_swing"] = desc.str.contains("swinging|foul|in play|missed", regex=True)
    df["_is_swstr"] = (desc.str.contains("swinging") & desc.str.contains("strike")) | is_foul_tip
    df["_is_cstr"] = desc.str.contains("called") & desc.str.contains("strike")
    # Strike% (FanGraphs): swing (fouls, whiffs, BIP) + called strikes
    # Computed purely from call_description — does NOT rely on is_strike column
    df["_is_strike_fg"] = df["_is_swing"] | df["_is_cstr"]

    zone = pd.to_numeric(df["zone"], errors="coerce")
    df["_in_zone"] = (zone >= 1) & (zone <= 9)
    df["_out_zone"] = (zone >= 11) & (zone <= 14)
    df["_is_chase"] = df["_out_zone"] & df["_is_swing"]
    df["_zone_swing"] = df["_in_zone"] & df["_is_swing"]
    df["_zone_swstr"] = df["_in_zone"] & df["_is_swstr"]
    df["_is_ip"] = df["is_in_play"].fillna(False).astype(bool)

    # Barrel detection
    BARREL_TABLE = {
        98:(26,30), 99:(25,31), 100:(24,33), 101:(23,34), 102:(22,35),
        103:(21,36), 104:(20,37), 105:(19,38), 106:(18,39), 107:(17,40),
        108:(16,41), 109:(15,42), 110:(14,43), 111:(13,44), 112:(12,45),
        113:(11,46), 114:(10,47), 115:(9,48), 116:(8,50),
    }
    def _barrel(r):
        if not r["_is_ip"]:
            return False
        ev, la = r.get("launch_speed"), r.get("launch_angle")
        try:
            if pd.isna(ev) or pd.isna(la) or ev < 98:
                return False
            w = BARREL_TABLE.get(min(int(ev), 116))
            return w[0] <= la <= w[1] if w else False
        except Exception:
            return False
    df["_is_barrel"] = df.apply(_barrel, axis=1)

    traj = df["trajectory"].fillna("")
    df["_is_gb"] = traj == "ground_ball"
    df["_is_fb"] = traj == "fly_ball"

    # ── Run Value computation (context-neutral, count-based) ──
    COUNT_RE = {
        "0-0": 0.0, "1-0": 0.032, "0-1": -0.037, "2-0": 0.080, "1-1": -0.012,
        "0-2": -0.086, "3-0": 0.149, "2-1": 0.024, "1-2": -0.055, "3-1": 0.101,
        "2-2": -0.026, "3-2": 0.040,
    }
    EVENT_LW = {
        "strikeout": -0.279, "strikeout_double_play": -0.279, "walk": 0.306, "intent_walk": 0.175,
        "hit_by_pitch": 0.352, "single": 0.464, "double": 0.762, "triple": 1.051, "home_run": 1.396,
        "field_out": -0.264, "flyout": -0.264, "groundout": -0.264, "lineout": -0.264, "pop_out": -0.264,
        "force_out": -0.264, "forceout": -0.264, "sac_fly": -0.098, "sac_bunt": -0.147,
        "fielders_choice": -0.243, "fielders_choice_out": -0.264, "field_error": 0.464,
        "catcher_interf": 0.306, "double_play": -0.494, "grounded_into_double_play": -0.494,
        "sac_fly_double_play": -0.494, "sac_bunt_double_play": -0.494, "triple_play": -0.594,
    }
    def _compute_rv(row):
        try:
            b = int(row.get("balls", 0)) if pd.notna(row.get("balls")) else 0
            s = int(row.get("strikes", 0)) if pd.notna(row.get("strikes")) else 0
            ck = f"{b}-{s}"
            cur_re = COUNT_RE.get(ck, 0)
            ev = str(row.get("events", "")).lower().strip()
            # Skip baserunning events (don't end the PA)
            is_baserunning = "caught_stealing" in ev or "pickoff" in ev
            if ev and ev != "nan" and not is_baserunning:
                lw = EVENT_LW.get(ev)
                if lw is not None:
                    return lw - cur_re
                if "out" in ev:
                    return -0.264 - cur_re
                return 0
            cd = str(row.get("call_description", "")).lower()
            if "ball" in cd and "foul" not in cd:
                nk = f"{min(b+1,3)}-{s}"
                return COUNT_RE.get(nk, 0) - cur_re
            if "foul" in cd and s >= 2:
                return 0
            if "strike" in cd or "foul" in cd:
                nk = f"{b}-{min(s+1,2)}"
                return COUNT_RE.get(nk, 0) - cur_re
            return 0
        except Exception:
            return 0
    df["_rv"] = df.apply(_compute_rv, axis=1)

    # ── Step 4: Group and aggregate ──
    grouped = df.groupby("pitcher_id")
    pitchers = []
    for pid, g in grouped:
        try:
            n = len(g)
            swings = int(g["_is_swing"].sum())
            swstr = int(g["_is_swstr"].sum())
            cstr = int(g["_is_cstr"].sum())
            out_zone = int(g["_out_zone"].sum())
            chases = int(g["_is_chase"].sum())
            zone_swings = int(g["_zone_swing"].sum())
            zone_swstr = int(g["_zone_swstr"].sum())
            bip = int(g["_is_ip"].sum())
            gb = int(g["_is_gb"].sum())
            fb = int(g["_is_fb"].sum())
            barrels = int(g["_is_barrel"].sum())

            inning_col = pd.to_numeric(g["inning"], errors="coerce")
            started_games = int(g.loc[inning_col == 1.0, "game_pk"].nunique()) if "game_pk" in g.columns else 0

            velo = g["start_speed"].dropna()
            spin = g["spin_rate"].dropna()
            ivb = g["pfx_z"].dropna()
            hb = g["pfx_x"].dropna()

            pitchers.append({
                "pitcher_id": int(pid),
                "pitcher_name": str(g["pitcher_name"].iloc[0]) if "pitcher_name" in g.columns else "",
                "pitcher_hand": str(g["pitcher_hand"].iloc[0]) if "pitcher_hand" in g.columns else "",
                "total_pitches": n,
                "games": int(g["game_pk"].nunique()) if "game_pk" in g.columns else 0,
                "games_started": int(started_games),
                "is_starter": started_games > 0,
                "avg_velo": round(float(velo.mean()), 1) if len(velo) > 0 else None,
                "max_velo": round(float(velo.max()), 1) if len(velo) > 0 else None,
                "avg_spin": int(round(float(spin.mean()))) if len(spin) > 0 else None,
                "avg_ivb": round(float(ivb.mean()) * 12, 1) if len(ivb) > 0 else None,
                "avg_hb": round(float(hb.mean()) * -12, 1) if len(hb) > 0 else None,
                "strike_rate": round(float(g["_is_strike_fg"].sum()) / n * 100, 1) if n > 0 else None,
                "zone_rate": round(int(g["_in_zone"].sum()) / n * 100, 1) if n > 0 else None,
                "csw_rate": round((cstr + swstr) / n * 100, 1) if n > 0 else None,
                "cstr_rate": round(cstr / n * 100, 1) if n > 0 else None,
                "swstr_rate": round(swstr / n * 100, 1) if n > 0 else None,
                "whiff_rate": round(swstr / swings * 100, 1) if swings > 0 else None,
                "chase_rate": round(chases / out_zone * 100, 1) if out_zone > 0 else None,
                "zone_whiff_rate": round(zone_swstr / zone_swings * 100, 1) if zone_swings > 0 else None,
                "bip": bip,
                "gb_rate": round(gb / bip * 100, 1) if bip > 0 else None,
                "fb_rate": round(fb / bip * 100, 1) if bip > 0 else None,
                "barrel_rate": round(barrels / bip * 100, 1) if bip > 0 else None,
                "run_value": round(float(g["_rv"].sum()), 1),
                "rv_100": round(float(g["_rv"].mean()) * 100, 1) if n > 0 else None,
            })
        except Exception as e:
            print(f"Leaderboard: skipping pitcher {pid}: {e}")
            continue

    pitchers.sort(key=lambda x: x["total_pitches"], reverse=True)

    # Get timestamps for the response
    last_updated = get_cached("leaderboard_updated", 99999) or "—"
    latest_date = str(all_df["game_date"].dropna().max()) if "game_date" in all_df.columns else "—"
    fetch_stats = get_cached("leaderboard_fetch_stats", 99999) or {}

    return {"pitchers": pitchers, "pitch_types": all_pitch_types, "last_updated": last_updated, "latest_game_date": latest_date, "fetch_stats": fetch_stats}


@app.get("/api/pitcher/{pitcher_id}/data-quality")
async def get_data_quality(pitcher_id: int):
    """
    Returns data quality info for a pitcher's 2026 parquet data:
    total rows in parquet vs. rows that would be skipped due to parse errors.
    Useful for verifying that pitch counts are complete.
    """
    import pandas as pd
    import io
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    ct = ZoneInfo("America/Chicago")
    ct_now = datetime.now(ct)
    start = datetime(2026, 3, 25)
    end = ct_now.replace(tzinfo=None)

    total_rows = 0
    skipped_rows = 0
    skip_reasons = {}
    files_checked = 0
    files_missing = 0

    cur = start
    async with httpx.AsyncClient() as client:
        while cur <= end:
            date_str = cur.strftime("%Y-%m-%d")
            cur += timedelta(days=1)
            try:
                resp = await client.get(f"{DAILY_BASE}/{date_str}.parquet", timeout=15)
                if resp.status_code != 200:
                    files_missing += 1
                    continue
                files_checked += 1
                df = pd.read_parquet(io.BytesIO(resp.content))
                pitcher_df = df[df["pitcher_id"].astype(str) == str(pitcher_id)]
                if len(pitcher_df) == 0:
                    continue

                for _, row in pitcher_df.iterrows():
                    total_rows += 1
                    try:
                        # Mirror the critical coercions from the season endpoint
                        gpk_raw = row.get("game_pk")
                        if gpk_raw is not None and not (isinstance(gpk_raw, float) and pd.isna(gpk_raw)):
                            int(gpk_raw)
                        # Try the numeric safe() coercion on key fields
                        for col in ("start_speed", "spin_rate", "pfx_x", "pfx_z",
                                    "plate_x", "plate_z", "release_x", "release_z",
                                    "extension", "launch_speed", "launch_angle",
                                    "inning", "at_bat_number", "zone"):
                            val = row.get(col)
                            if val is not None and not (isinstance(val, float) and pd.isna(val)):
                                if isinstance(val, (int, float)):
                                    float(val)
                    except Exception as row_err:
                        skipped_rows += 1
                        reason = f"{type(row_err).__name__}: {str(row_err)[:80]}"
                        skip_reasons[reason] = skip_reasons.get(reason, 0) + 1
            except Exception as e:
                files_missing += 1
                continue

    return {
        "pitcher_id": pitcher_id,
        "files_checked": files_checked,
        "files_missing": files_missing,
        "total_rows": total_rows,
        "clean_rows": total_rows - skipped_rows,
        "skipped_rows": skipped_rows,
        "skip_percentage": round((skipped_rows / total_rows * 100) if total_rows > 0 else 0, 2),
        "skip_reasons": skip_reasons,
    }


@app.get("/api/debug/parquet")
async def debug_parquet():
    """Diagnostic endpoint to inspect parquet structure."""
    import pandas as pd
    import io

    result = {}
    async with httpx.AsyncClient() as client:
        for fname in MONTH_FILES:
            try:
                resp = await client.get(f"{PARQUET_BASE}/{fname}", timeout=30)
                if resp.status_code == 200:
                    df = pd.read_parquet(io.BytesIO(resp.content))
                    sample_ids = df["pitcher_id"].head(5).tolist() if "pitcher_id" in df.columns else []
                    result[fname] = {
                        "rows": len(df),
                        "columns": list(df.columns),
                        "pitcher_id_dtype": str(df["pitcher_id"].dtype) if "pitcher_id" in df.columns else "MISSING",
                        "sample_pitcher_ids": sample_ids,
                        "sample_row": {k: str(v) for k, v in df.iloc[0].to_dict().items()} if len(df) > 0 else {},
                    }
                else:
                    result[fname] = {"error": f"HTTP {resp.status_code}"}
            except Exception as e:
                result[fname] = {"error": str(e)}
    return result


# ─── Health check ───
@app.get("/")
async def root():
    return {"status": "ok", "service": "pitcher-tracker-api"}
