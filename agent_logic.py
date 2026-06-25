import os
import time
import pickle
import pandas as pd
import numpy as np
import xgboost as xgb
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import date
import warnings
warnings.filterwarnings("ignore")

# nba_api roster/stats imports (with graceful fallback)
try:
    from nba_api.stats.endpoints import commonteamroster, leaguedashplayerstats
    NBA_API_AVAILABLE = True
except ImportError:
    NBA_API_AVAILABLE = False
    print("[WARN] nba_api not available. /roster endpoint will return empty data.")

# -----------------------------------------------------------------------------
#  FastAPI Application
# -----------------------------------------------------------------------------
app = FastAPI(
    title="NBA XGBoost Prediction API (Upgraded v10.0)",
    description=(
        "Hybrid ELO + XGBoost microservice with zero-API inference. "
        "Includes H2H, division leader, division record, and conference record."
    ),
    version="10.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
#  Team Name Map
# -----------------------------------------------------------------------------
TEAM_NAMES = {
    'ATL':'Atlanta Hawks','BOS':'Boston Celtics','BKN':'Brooklyn Nets',
    'CHA':'Charlotte Hornets','CHI':'Chicago Bulls','CLE':'Cleveland Cavaliers',
    'DAL':'Dallas Mavericks','DEN':'Denver Nuggets','DET':'Detroit Pistons',
    'GSW':'Golden State Warriors','HOU':'Houston Rockets','IND':'Indiana Pacers',
    'LAC':'Los Angeles Clippers','LAL':'Los Angeles Lakers','MEM':'Memphis Grizzlies',
    'MIA':'Miami Heat','MIL':'Milwaukee Bucks','MIN':'Minnesota Timberwolves',
    'NOP':'New Orleans Pelicans','NYK':'New York Knicks','OKC':'Oklahoma City Thunder',
    'ORL':'Orlando Magic','PHI':'Philadelphia 76ers','PHX':'Phoenix Suns',
    'POR':'Portland Trail Blazers','SAC':'Sacramento Kings','SAS':'San Antonio Spurs',
    'TOR':'Toronto Raptors','UTA':'Utah Jazz','WAS':'Washington Wizards'
}

# NBA team numeric IDs (for CommonTeamRoster)
TEAM_NBA_IDS = {
    'ATL':1610612737,'BOS':1610612738,'BKN':1610612751,'CHA':1610612766,
    'CHI':1610612741,'CLE':1610612739,'DAL':1610612742,'DEN':1610612743,
    'DET':1610612765,'GSW':1610612744,'HOU':1610612745,'IND':1610612754,
    'LAC':1610612746,'LAL':1610612747,'MEM':1610612763,'MIA':1610612748,
    'MIL':1610612749,'MIN':1610612750,'NOP':1610612740,'NYK':1610612752,
    'OKC':1610612760,'ORL':1610612753,'PHI':1610612755,'PHX':1610612756,
    'POR':1610612757,'SAC':1610612758,'SAS':1610612759,'TOR':1610612761,
    'UTA':1610612762,'WAS':1610612764
}



# -----------------------------------------------------------------------------
#  Roster Cache (TTL=30 min per team, shared stats cache TTL=60 min)
# -----------------------------------------------------------------------------
_roster_cache: dict = {}          # team -> (data, timestamp)
_stats_cache:  dict = {}          # season -> (df, timestamp)
_ROSTER_TTL = 1800                # 30 minutes
_STATS_TTL  = 3600                # 60 minutes


def _get_season_stats(season: str = "2024-25") -> pd.DataFrame:
    """Fetch & cache LeagueDashPlayerStats for a full season."""
    now = time.time()
    if season in _stats_cache:
        df, ts = _stats_cache[season]
        if now - ts < _STATS_TTL:
            return df
    if not NBA_API_AVAILABLE:
        return pd.DataFrame()
    try:
        ep = leaguedashplayerstats.LeagueDashPlayerStats(
            season=season, per_mode_detailed="PerGame", timeout=10
        )
        df = ep.get_data_frames()[0]
        _stats_cache[season] = (df, now)
        return df
    except Exception as e:
        print(f"[WARN] LeagueDashPlayerStats failed: {e}")
        return pd.DataFrame()


def _compute_player_elo(ppg, rpg, apg, spg, bpg, tov, fg_pct) -> int:
    elo = 1000.0
    elo += ppg  * 14
    elo += rpg  * 9
    elo += apg  * 11
    elo += spg  * 20
    elo += bpg  * 16
    elo -= tov  * 10
    if fg_pct and fg_pct > 0.30:
        elo += fg_pct * 80
    return max(600, int(round(elo)))


def _derive_status(gp: int):
    if gp == 0:
        return "OUT", "0 GP this season"
    elif gp < 15:
        return "DAY-TO-DAY", f"{gp} GP"
    return "ACTIVE", None

# -----------------------------------------------------------------------------
#  Load ML Artifacts at Startup
# -----------------------------------------------------------------------------
MODEL_PATH  = "models/nba_tuned_model.json"
SCALER_PATH = "models/scaler.pkl"
STATES_PATH = "models/latest_states.pkl"

# Fallback to local dir if not in models/
if not os.path.exists(MODEL_PATH): MODEL_PATH = "nba_tuned_model.json"
if not os.path.exists(SCALER_PATH): SCALER_PATH = "scaler.pkl"
if not os.path.exists(STATES_PATH): STATES_PATH = "latest_states.pkl"

for p in [MODEL_PATH, SCALER_PATH, STATES_PATH]:
    if not os.path.exists(p):
        print(f"[WARN] Missing ML artifact: {p}. Make sure to run train_model_v6.py first.")

try:
    with open(SCALER_PATH, "rb") as f:
        scaler = pickle.load(f)

    with open(STATES_PATH, "rb") as f:
        states = pickle.load(f)

    clf = xgb.XGBClassifier()
    clf.load_model(MODEL_PATH)
    
    CONFIDENCE_THRESHOLD = states.get('confidence_threshold', 0.62)
    LEAGUE_AVG_PTS       = states.get('league_avg_pts', 113.0)
    TEST_ACCURACY        = states.get('test_accuracy', 0.67) * 100
    DEFENDING_CHAMPION   = "BOS"   # 2023-24 champion
    
    print(f"[OK] Loaded upgraded XGBoost model | {len(states['elo'])} teams | "
          f"confidence threshold: {CONFIDENCE_THRESHOLD:.0%}")
except Exception as e:
    print(f"[ERROR] Failed to load ML artifacts: {e}")
    states, scaler, clf = {}, None, None

# -----------------------------------------------------------------------------
#  Schedule Import
# -----------------------------------------------------------------------------
try:
    from data_fetcher import fetch_upcoming_games, fetch_standings, fetch_recent_games
except ImportError:
    def fetch_upcoming_games(season=None, test_mode_season=None):
        return [{"home_team": "LAL", "away_team": "HOU", "game_date": str(date.today()), "game_id": "0"}]
    def fetch_standings(season=None):
        return []
    def fetch_recent_games(num_games=10):
        return []


# -----------------------------------------------------------------------------
#  Helper: Reconstruct EMA Rolling Features from Cached Last-10 Games
# -----------------------------------------------------------------------------
def ema_from_series(values: list, span: int) -> float:
    if not values:
        return 0.0
    alpha = 2.0 / (span + 1.0)
    ema = values[0]
    for v in values[1:]:
        ema = alpha * v + (1.0 - alpha) * ema
    return ema


def build_team_features(team: str, suffix: str, features_dict: dict):
    games = states['last_games'].get(team, [])
    if not games:
        return

    df = pd.DataFrame(games)

    fill_map = {
        'player_total_pts': 'pts', 'player_total_reb': 'reb',
        'player_total_ast': 'ast', 'player_total_stl': 'stl',
        'player_total_blk': 'blk', 'player_total_tov': 'tov',
        'fg_pct_players':   'fg_pct', 'fg3_pct_players': 'fg3_pct',
        'ft_pct_players':   'ft_pct'
    }
    for pc, tc in fill_map.items():
        if pc in df.columns and tc in df.columns:
            df[pc] = df[pc].fillna(df[tc])
    if 'player_pm' in df.columns:
        df['player_pm'] = df['player_pm'].fillna(df.get('plus_minus', pd.Series([0]*len(df))) * 5)
    if 'num_players' in df.columns:
        df['num_players'] = df['num_players'].fillna(10.0)

    if 'shock_index' not in df.columns:
        df['shock_index'] = 0.0

    if 'pts_opp' in df.columns:
        opp_avg = df['pts_opp'].mean() if len(df) > 0 else states.get('league_avg_pts', 113.0)
        df['pts_opp_adj'] = df['pts'] / (opp_avg / states.get('league_avg_pts', 113.0))
    else:
        df['pts_opp_adj'] = df.get('pts', 0)

    df = df.ffill().bfill().fillna(0.0)

    metrics = states.get('metrics_list', [])
    all_m = metrics + ['pts_opp_adj', 'shock_index']
    all_m = [m for m in all_m if m in df.columns]

    for m in all_m:
        vals = df[m].tolist()
        features_dict[f'{m}_ema5_{suffix}']  = ema_from_series(vals[-5:],  span=5)
        features_dict[f'{m}_ema10_{suffix}'] = ema_from_series(vals[-10:], span=10)

    features_dict[f'rest_days_{suffix}']   = games[-1].get('rest_days', 3)
    features_dict[f'shock_index_{suffix}'] = df['shock_index'].iloc[-1] if 'shock_index' in df.columns else 0.0


# -----------------------------------------------------------------------------
#  API Endpoints
# -----------------------------------------------------------------------------
@app.get("/schedule")
def get_schedule(
    season: str = Query("2024-25", description="Target season"),
    test_season: str = Query("2024-25", description="Fallback season if off-season")
):
    try:
        games = fetch_upcoming_games(season=season, test_mode_season=test_season)
        return {"status": "success", "games": games}
    except Exception as e:
        return {"status": "error", "message": str(e), "games": []}

@app.get("/standings")
def get_standings(season: str = Query("2025-26", description="Target season")):
    try:
        standings = fetch_standings(season=season)
        return {"status": "success", "standings": standings}
    except Exception as e:
        return {"status": "error", "message": str(e), "standings": []}

@app.get("/recent_games")
def get_recent_games(
    num_games: int = Query(10, description="Number of games to fetch"),
    season: str = Query("2025-26", description="Target season")
):
    try:
        games = fetch_recent_games(num_games=num_games, season=season)
        return {"status": "success", "games": games}
    except Exception as e:
        return {"status": "error", "message": str(e), "games": []}


@app.get("/roster/{team}")
def get_roster(
    team: str,
    season: str = Query("2025-26", description="Season for stats")
):
    """
    Full squad roster with player ELO, position, coach, and injury status.
    Cached for 30 minutes per team to avoid nba_api rate limits.
    """
    team = team.upper()
    if team not in TEAM_NBA_IDS:
        return {"error": f"Unknown team: {team}. Valid: {sorted(TEAM_NBA_IDS.keys())}"}

    # Check cache
    now = time.time()
    cache_key = f"{team}_{season}"
    if cache_key in _roster_cache:
        cached, ts = _roster_cache[cache_key]
        if now - ts < _ROSTER_TTL:
            return cached

    if not NBA_API_AVAILABLE:
        return {"team": team, "coach": "N/A", "players": [],
                "note": "nba_api not available"}

    try:
        # 1. Get roster (names, numbers, positions, coach)
        import time as _t
        roster_ep = commonteamroster.CommonTeamRoster(
            team_id=TEAM_NBA_IDS[team], season=season, timeout=10
        )
        dfs = roster_ep.get_data_frames()
        roster_df = dfs[0]   # Player list
        coach_df  = dfs[1]   # Coaches

        _t.sleep(0.6)  # Rate limit buffer

        # 2. Get season stats for all players (cached)
        stats_df = _get_season_stats(season)

        # 3. Extract coach name
        coach_name = "N/A"
        if not coach_df.empty:
            head = coach_df[coach_df['COACH_TYPE'] == 'Head Coach']
            if not head.empty:
                fn = head.iloc[0].get('FIRST_NAME', '')
                ln = head.iloc[0].get('LAST_NAME', '')
                coach_name = f"{fn} {ln}".strip()

        # 4. Build player list
        players = []
        for _, row in roster_df.iterrows():
            pid  = row.get('PLAYER_ID', 0)
            name = row.get('PLAYER', row.get('PLAYER_NAME', 'Unknown'))
            pos  = row.get('POSITION', 'N/A')
            num  = str(row.get('NUM', ''))
            age  = row.get('AGE', None)

            # Find stats
            ppg = rpg = apg = spg = bpg = tov = fg_pct = 0.0
            gp = 0
            if not stats_df.empty:
                pstat = stats_df[stats_df['PLAYER_ID'] == pid]
                if not pstat.empty:
                    ps = pstat.iloc[0]
                    ppg    = float(ps.get('PTS', 0) or 0)
                    rpg    = float(ps.get('REB', 0) or 0)
                    apg    = float(ps.get('AST', 0) or 0)
                    spg    = float(ps.get('STL', 0) or 0)
                    bpg    = float(ps.get('BLK', 0) or 0)
                    tov    = float(ps.get('TOV', 0) or 0)
                    fg_pct = float(ps.get('FG_PCT', 0) or 0)
                    gp     = int(ps.get('GP', 0) or 0)

            player_elo = _compute_player_elo(ppg, rpg, apg, spg, bpg, tov, fg_pct)
            status, injury_note = _derive_status(gp)

            players.append({
                "player_id": int(pid),
                "name":      name,
                "position":  pos if pos else "N/A",
                "number":    num,
                "age":       int(age) if age else None,
                "ppg":       round(ppg, 1),
                "rpg":       round(rpg, 1),
                "apg":       round(apg, 1),
                "spg":       round(spg, 1),
                "bpg":       round(bpg, 1),
                "player_elo": player_elo,
                "gp":        gp,
                "status":    status,
                "injury_note": injury_note,
            })

        # Sort by player ELO descending (best players first)
        players.sort(key=lambda p: p['player_elo'], reverse=True)

        result = {
            "team":    team,
            "coach":   coach_name,
            "players": players,
            "season":  season,
        }

        # Cache it
        _roster_cache[cache_key] = (result, now)
        return result

    except Exception as e:
        print(f"[ERROR] Roster fetch failed for {team}: {e}")
        return {"team": team, "coach": "N/A", "players": [],
                "error": str(e)}

@app.get("/predict")
def predict(
    home_team:  str = Query("LAL", description="Home team abbreviation (e.g. LAL)"),
    away_team:  str = Query("HOU", description="Away team abbreviation (e.g. HOU)"),
    game_date:  str = Query(None,  description="Target game date (YYYY-MM-DD)"),
):
    if not states or not scaler or not clf:
        raise HTTPException(status_code=500, detail="ML models not loaded properly.")
        
    home_team = home_team.upper()
    away_team = away_team.upper()
    if not game_date:
        game_date = str(date.today())

    if home_team not in states['elo'] or away_team not in states['elo']:
        return {"error": f"Invalid teams. Valid: {sorted(states['elo'].keys())}"}

    # Base Features (raw ELO — playoff signal handled by v7 model features)
    elo_home = states['elo'][home_team]
    elo_away = states['elo'][away_team]
    elo_diff = elo_home - elo_away
    hca = 80.0

    # Rest days
    def safe_rest(team, target):
        ld = states['last_game_date'].get(team)
        if not ld: return 3
        try:
            target_dt = pd.to_datetime(target)
            ld_dt = pd.to_datetime(ld)
            if target_dt.tz is not None and ld_dt.tz is None:
                ld_dt = ld_dt.tz_localize(target_dt.tz)
            elif ld_dt.tz is not None and target_dt.tz is None:
                target_dt = target_dt.tz_localize(ld_dt.tz)
            r = (target_dt - ld_dt).days - 1
            return int(min(max(r, 0), 10))
        except Exception:
            return 3

    rest_home = safe_rest(home_team, game_date)
    rest_away = safe_rest(away_team, game_date)

    # Static signals
    is_dc_home = 1 if home_team == DEFENDING_CHAMPION else 0
    is_dc_away = 1 if away_team == DEFENDING_CHAMPION else 0

    # New Tiebreaker Signals (from states)
    conf_win_home = states.get('team_conf_win_rate', {}).get(home_team, 0.5)
    conf_win_away = states.get('team_conf_win_rate', {}).get(away_team, 0.5)
    div_win_home  = states.get('team_div_win_rate', {}).get(home_team, 0.5)
    div_win_away  = states.get('team_div_win_rate', {}).get(away_team, 0.5)
    div_ldr_home  = states.get('team_is_div_leader', {}).get(home_team, 0)
    div_ldr_away  = states.get('team_is_div_leader', {}).get(away_team, 0)

    # Estimate H2H from cache
    h2h_home_win_rate = 0.5
    h_games = states['last_games'].get(home_team, [])
    # Very crude approximation if we don't have true H2H in states
    # Note: V6 adds true H2H per matchup during training, but for inference
    # we default to 0.5 if not found, since we dropped live API calls.
    
    features_dict = {
        'elo_home': elo_home, 'elo_away': elo_away, 'elo_diff': elo_diff, 'hca': hca,
        'is_defending_champion_home': is_dc_home,
        'is_defending_champion_away': is_dc_away,
        'def_champ_diff': is_dc_home - is_dc_away,
        'is_division_leader_home': div_ldr_home,
        'is_division_leader_away': div_ldr_away,
        'div_leader_diff': div_ldr_home - div_ldr_away,
        'conf_win_rate_home': conf_win_home,
        'conf_win_rate_away': conf_win_away,
        'conf_win_rate_diff': conf_win_home - conf_win_away,
        'div_win_rate_home': div_win_home,
        'div_win_rate_away': div_win_away,
        'div_win_rate_diff': div_win_home - div_win_away,
        'h2h_home_win_rate': h2h_home_win_rate,
    }

    # v7: Playoff depth features (from states, 0.0 fallback for v6 compat)
    po_depth = states.get('playoff_depth', {})
    po_home  = po_depth.get(home_team, 0.0)
    po_away  = po_depth.get(away_team, 0.0)
    features_dict['playoff_depth_home']  = po_home
    features_dict['playoff_depth_away']  = po_away
    features_dict['playoff_depth_diff']  = po_home - po_away
    features_dict['made_playoffs_home']  = 1 if po_home > 0 else 0
    features_dict['made_playoffs_away']  = 1 if po_away > 0 else 0
    features_dict['made_playoffs_diff']  = features_dict['made_playoffs_home'] - features_dict['made_playoffs_away']

    # EMA rolling features for each side
    build_team_features(home_team, 'home', features_dict)
    build_team_features(away_team, 'away', features_dict)

    # Compute diff features
    feature_cols = states['feature_cols']
    for col in feature_cols:
        if col not in features_dict:
            if col.endswith('_diff'):
                base = col[:-5]
                h_key = f'{base}_home'
                a_key = f'{base}_away'
                if h_key in features_dict and a_key in features_dict:
                    features_dict[col] = features_dict[h_key] - features_dict[a_key]
                else:
                    features_dict[col] = 0.0
            else:
                features_dict[col] = 0.0

    X_dict   = {col: features_dict.get(col, 0.0) for col in feature_cols}
    X_df     = pd.DataFrame([X_dict])
    X_scaled = scaler.transform(X_df)

    pred      = clf.predict(X_scaled)[0]
    pred_prob = clf.predict_proba(X_scaled)[0]
    win_prob  = round(float(pred_prob[1]) * 100, 2)

    is_confident = win_prob > (CONFIDENCE_THRESHOLD * 100) or win_prob < ((1 - CONFIDENCE_THRESHOLD) * 100)
    
    # Adjust prediction string based on probability since target is 1 for Home Win
    prediction_str = "WIN" if win_prob >= 50 else "LOSS"

    return {
        "team":             TEAM_NAMES.get(home_team, home_team),
        "prediction":       prediction_str,
        "win_probability":  win_prob if win_prob >= 50 else round(100 - win_prob, 2),
        "accuracy":         round(TEST_ACCURACY, 2),
        "opponent":         TEAM_NAMES.get(away_team, away_team),
        "game_date":        game_date,
        "model":            f"{states.get('version', 'v6-tiebreaker')} (Zero-API)",
        "training_samples": len(states['elo']) * 82 * 24, # Approximate
        "features_used":    len(feature_cols),
        "algorithm_used":   "XGBoost Classifier GPU",
        "telemetry": {
            "computed_team_elo":   round(elo_home, 1),
            "opponent_elo":        round(elo_away,  1),
            "elo_diff":            round(elo_diff,  1),
            "dynamic_hca":         hca,
            "is_confident_pick":   is_confident,
            "conf_win_rate_home":  round(conf_win_home, 3),
            "div_win_rate_home":   round(div_win_home, 3),
            "is_division_leader":  bool(div_ldr_home),
            "playoff_depth_home":  round(po_home, 3),
            "playoff_depth_away":  round(po_away, 3),
            "playoff_depth_diff":  round(po_home - po_away, 3),
            "made_playoffs_home":  bool(po_home > 0),
            "made_playoffs_away":  bool(po_away > 0)
        }
    }
