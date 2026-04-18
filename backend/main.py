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


# ─── Route 6: Get 2026 season data from parquet files ───
PARQUET_BASE = "https://raw.githubusercontent.com/lancebroz/mlb-pitcher-data/main/data/raw/2026/monthly"
DAILY_BASE = "https://raw.githubusercontent.com/lancebroz/mlb-pitcher-data/main/data/raw/2026/daily"
MONTH_FILES = [
    "03_march.parquet", "04_april.parquet", "05_may.parquet",
    "06_june.parquet", "07_july.parquet", "08_august.parquet",
    "09_september.parquet", "10_october.parquet",
]

@app.get("/api/pitcher/{pitcher_id}/era")
async def get_pitcher_era(pitcher_id: int, game_pks: str):
    """
    Computes ERA for a pitcher across the given game_pks (comma-separated).
    Fetches each boxscore in parallel and sums earned runs / outs for this pitcher.
    Cached per (pitcher_id, game_pks) for 5 minutes; per-game boxscores cached longer below.
    """
    import asyncio

    cache_key = f"era:{pitcher_id}:{game_pks}"
    cached = get_cached(cache_key, 300)
    if cached:
        return cached

    pks = [int(x) for x in game_pks.split(",") if x.strip().isdigit()]
    if not pks:
        return {"era": None, "earned_runs": 0, "outs": 0, "innings": 0.0, "games": 0}

    async def fetch_box(client, gpk):
        # Per-game boxscore cache (3-day TTL since boxscores rarely change after Final)
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
                continue
            er = stats.get("earnedRuns")
            ip_str = stats.get("inningsPitched", "0.0")
            if er is None:
                continue
            # Convert IP "X.Y" to outs (Y is 0/1/2)
            try:
                whole, rem = ip_str.split(".")
                game_outs = int(whole) * 3 + int(rem)
            except Exception:
                game_outs = 0
            earned_runs += int(er)
            outs += game_outs
            strikeouts += int(stats.get("strikeOuts") or 0)
            walks += int(stats.get("baseOnBalls") or 0)
            hit_batsmen += int(stats.get("hitBatsmen") or 0)
            batters_faced += int(stats.get("battersFaced") or 0)
            if stats.get("gamesStarted"):
                games_started += int(stats.get("gamesStarted"))
            games_with_data += 1
            break  # pitcher only on one side

    innings = outs / 3.0
    era = (earned_runs * 9.0 / innings) if innings > 0 else None

    result = {
        "era": round(era, 2) if era is not None else None,
        "earned_runs": earned_runs,
        "outs": outs,
        "innings": round(innings, 1),
        "games": games_with_data,
        "games_started": games_started,
        "strikeouts": strikeouts,
        "walks": walks,
        "hit_batsmen": hit_batsmen,
        "batters_faced": batters_faced,
    }
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
        # Generate list of daily file URLs from March 26 to today
        from datetime import timedelta
        start = datetime(2026, 3, 26)
        end = datetime.now()
        daily_urls = []
        cur = start
        while cur <= end:
            date_str = cur.strftime("%Y-%m-%d")
            daily_urls.append((date_str, f"{DAILY_BASE}/{date_str}.parquet"))
            cur += timedelta(days=1)

        all_dfs = []
        async with httpx.AsyncClient() as client:
            for date_str, url in daily_urls:
                try:
                    resp = await client.get(url, timeout=15)
                    if resp.status_code == 200:
                        df = pd.read_parquet(io.BytesIO(resp.content))
                        pitcher_df = df[df["pitcher_id"].astype(str) == str(pitcher_id)]
                        if len(pitcher_df) > 0:
                            all_dfs.append(pitcher_df)
                except Exception as e:
                    print(f"Failed to fetch {date_str}: {e}")
                    continue

        parquet_pitches = []
        if all_dfs:
            try:
                combined = pd.concat(all_dfs, ignore_index=True)
            except Exception as e:
                print(f"pd.concat failed for pitcher {pitcher_id}: {e}")
                combined = pd.DataFrame()

            trajectory_map = {
                "ground_ball": "ground_ball", "fly_ball": "fly_ball",
                "line_drive": "line_drive", "popup": "popup",
            }

            total_rows = len(combined)
            skipped_rows = 0
            skip_reasons = {}  # error_type_str -> count

            for _, row in combined.iterrows():
                try:
                    def safe(col):
                        val = row.get(col)
                        if val is None or (isinstance(val, float) and pd.isna(val)):
                            return None
                        return float(val) if isinstance(val, (int, float)) else val

                    # Safe int coercion for game_pk (NaN → 0)
                    gpk_raw = row.get("game_pk")
                    if gpk_raw is None or (isinstance(gpk_raw, float) and pd.isna(gpk_raw)):
                        game_pk_int = 0
                    else:
                        try: game_pk_int = int(gpk_raw)
                        except Exception: game_pk_int = 0

                    call_desc = str(row.get("call_description", "")).lower()
                    if "swinging" in call_desc and "strike" in call_desc:
                        desc = "swinging_strike"
                    elif "called" in call_desc and "strike" in call_desc:
                        desc = "called_strike"
                    elif "foul" in call_desc:
                        desc = "foul"
                    elif "in play" in call_desc or "hit into play" in call_desc:
                        desc = "hit_into_play"
                    else:
                        desc = "ball"

                    parquet_pitches.append({
                        "pitch_number": 0,
                        "pitch_type": str(row.get("pitch_type", "")),
                        "pitch_name": str(row.get("pitch_name", "")),
                        "release_speed": safe("start_speed"),
                        "release_spin_rate": safe("spin_rate"),
                        "pfx_x": safe("pfx_x"),
                        "pfx_z": safe("pfx_z"),
                        "movement_source": "parquet",
                        "plate_x": safe("plate_x"),
                        "plate_z": safe("plate_z"),
                        "release_pos_x": safe("release_x"),
                        "release_pos_z": safe("release_z"),
                        "release_extension": safe("extension"),
                        "zone": safe("zone"),
                        "description": desc,
                        "is_in_play": bool(row.get("is_in_play", False)),
                        "is_strike": bool(row.get("is_strike", False)),
                        "is_ball": bool(row.get("is_ball", False)),
                        "launch_speed": safe("launch_speed"),
                        "launch_angle": safe("launch_angle"),
                        "bb_type": trajectory_map.get(str(row.get("trajectory", "")), ""),
                        "batter_name": str(row.get("batter_name", "")),
                        "batter_hand": str(row.get("batter_hand", "")),
                        "stand": str(row.get("batter_hand", "")),
                        "p_throws": str(row.get("pitcher_hand", "")),
                        "balls": str(row.get("balls", "")),
                        "strikes": str(row.get("strikes", "")),
                        "game_date": str(row.get("game_date", "")),
                        "game_pk": game_pk_int,
                        "inning": safe("inning"),
                        "at_bat_number": safe("at_bat_number"),
                        "events": str(row.get("events", "")),
                    })
                except Exception as row_err:
                    # Skip malformed rows rather than crashing the whole endpoint
                    skipped_rows += 1
                    reason = f"{type(row_err).__name__}: {str(row_err)[:100]}"
                    skip_reasons[reason] = skip_reasons.get(reason, 0) + 1
                    continue

            # Log summary if any rows were skipped
            if skipped_rows > 0:
                pct = (skipped_rows / total_rows * 100) if total_rows > 0 else 0
                print(f"[DATA QUALITY] Pitcher {pitcher_id}: skipped {skipped_rows}/{total_rows} rows ({pct:.1f}%)")
                for reason, count in sorted(skip_reasons.items(), key=lambda x: -x[1]):
                    print(f"  - {count}x: {reason}")

        if parquet_pitches:
            set_cache(parquet_cache_key, parquet_pitches)

    # ── Part 2: Today's live data (cached 30 sec) ──
    live_cache_key = f"season_live:{pitcher_id}:{today_str}:{yesterday_str}"
    live_pitches = get_cached(live_cache_key, 30)

    if live_pitches is None:
        live_pitches = []
        try:
            # Get today's AND yesterday's schedule (covers timezone edge cases
            # where the server clock is ahead of local time)
            game_pks = []
            async with httpx.AsyncClient() as client:
                for check_date in [today_str, yesterday_str]:
                    try:
                        sched_resp = await client.get(
                            f"{MLB_BASE}/api/v1/schedule?sportId=1&date={check_date}",
                            timeout=10,
                        )
                        sched_data = sched_resp.json()
                        for date_entry in sched_data.get("dates", []):
                            for game in date_entry.get("games", []):
                                gpk = game["gamePk"]
                                if gpk not in game_pks:
                                    game_pks.append(gpk)
                    except Exception:
                        pass

            # Check each game for this pitcher's pitches
            async with httpx.AsyncClient() as client:
                for gpk in game_pks:
                    try:
                        resp = await client.get(
                            f"{MLB_BASE}/api/v1.1/game/{gpk}/feed/live",
                            timeout=10,
                        )
                        feed = resp.json()
                    except Exception:
                        continue

                    all_plays = feed.get("liveData", {}).get("plays", {}).get("allPlays", [])
                    found = False

                    for play in all_plays:
                        matchup = play.get("matchup", {})
                        if matchup.get("pitcher", {}).get("id") != pitcher_id:
                            continue
                        found = True

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
                            if "swinging" in desc_raw and "strike" in desc_raw:
                                desc = "swinging_strike"
                            elif "called" in desc_raw and "strike" in desc_raw:
                                desc = "called_strike"
                            elif "foul" in desc_raw:
                                desc = "foul"
                            elif "in play" in desc_raw:
                                desc = "hit_into_play"
                            else:
                                desc = "ball"

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
                                "game_date": today_str,
                                "game_pk": gpk,
                                "inning": inning,
                                "at_bat_number": play.get("atBatIndex", 0),
                                "events": "",
                            })

                        # Set events on last pitch of at-bat
                        if play_pitches and play_event_type:
                            play_pitches[-1]["events"] = play_event_type

                        live_pitches.extend(play_pitches)

                    if not found:
                        continue

        except Exception as e:
            print(f"Failed to fetch live data: {e}")

        if live_pitches:
            set_cache(live_cache_key, live_pitches)

    # ── Part 3: Merge with dedup ──
    # Get game_pks from live data to exclude from parquet
    live_game_pks = set()
    for p in live_pitches:
        if p.get("game_pk"):
            live_game_pks.add(p["game_pk"])

    # Filter parquet to exclude games that are in live data (prevents double-counting)
    if live_game_pks:
        filtered_parquet = [p for p in parquet_pitches if p.get("game_pk", 0) not in live_game_pks]
    else:
        filtered_parquet = parquet_pitches

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
                                            if "swinging strike" in call:
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
    from datetime import datetime, timedelta

    # ── Step 1: Load all parquet data (cached 10 min) ──
    raw_key = "leaderboard_raw"
    all_df = get_cached(raw_key, 600)

    if all_df is None:
        start = datetime(2026, 3, 26)
        end = datetime.now()

        all_dfs = []
        fetched = 0
        failed = 0
        async with httpx.AsyncClient() as client:
            cur = start
            while cur <= end:
                date_str = cur.strftime("%Y-%m-%d")
                cur += timedelta(days=1)
                try:
                    r = await client.get(f"{DAILY_BASE}/{date_str}.parquet", timeout=15)
                    if r.status_code == 200:
                        df = pd.read_parquet(io.BytesIO(r.content))
                        if len(df) > 0:
                            all_dfs.append(df)
                            fetched += 1
                except Exception as e:
                    failed += 1
                    continue

        print(f"[Leaderboard] Fetched {fetched} daily files, {failed} failed/missing")
        all_df = pd.concat(all_dfs, ignore_index=True) if all_dfs else pd.DataFrame()
        if len(all_df) > 0:
            set_cache(raw_key, all_df)
            # Store the refresh timestamp in Chicago time
            from zoneinfo import ZoneInfo
            ct_now = datetime.now(ZoneInfo("America/Chicago"))
            set_cache("leaderboard_updated", ct_now.strftime("%Y-%m-%d %I:%M %p CT"))
            print(f"[Leaderboard] Total rows: {len(all_df)}, pitchers: {all_df['pitcher_id'].nunique()}")

    if all_df is None or len(all_df) == 0:
        return {"pitchers": [], "pitch_types": []}

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
    df["_is_swing"] = desc.str.contains("swinging|foul|in play|missed", regex=True)
    df["_is_swstr"] = desc.str.contains("swinging") & desc.str.contains("strike")
    df["_is_cstr"] = desc.str.contains("called") & desc.str.contains("strike")

    zone = pd.to_numeric(df["zone"], errors="coerce")
    df["_in_zone"] = zone.isin(range(1, 10))
    df["_out_zone"] = zone.isin(range(11, 15))
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
                "avg_ivb": round(float(ivb.mean()), 1) if len(ivb) > 0 else None,
                "avg_hb": round(float(hb.mean()), 1) if len(hb) > 0 else None,
                "strike_rate": round(float(g["is_strike"].fillna(False).astype(bool).sum()) / n * 100, 1) if n > 0 else None,
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
            })
        except Exception as e:
            print(f"Leaderboard: skipping pitcher {pid}: {e}")
            continue

    pitchers.sort(key=lambda x: x["total_pitches"], reverse=True)

    # Get timestamps for the response
    last_updated = get_cached("leaderboard_updated", 99999) or "—"
    latest_date = str(all_df["game_date"].dropna().max()) if "game_date" in all_df.columns else "—"

    return {"pitchers": pitchers, "pitch_types": all_pitch_types, "last_updated": last_updated, "latest_game_date": latest_date}


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
    start = datetime(2026, 3, 26)
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
