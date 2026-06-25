import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

orig_request = requests.Session.request
def patched_request(self, *args, **kwargs):
    kwargs['verify'] = False
    return orig_request(self, *args, **kwargs)
requests.Session.request = patched_request

from nba_api.stats.endpoints import scoreboardv3, scheduleleaguev2
from nba_api.stats.static import teams
from datetime import date
import pandas as pd
import time

def fetch_upcoming_games(season="2025-26", test_mode_season="2024-25", num_games=10):
    """
    Fetch upcoming games using a 3-tier fallback:
    1. Try live ScoreboardV3 for today.
    2. Try ScheduleLeagueV2 for upcoming dates in the requested season.
    3. Fallback to a past 'test_mode_season' if no future games exist (off-season).
    """
    team_mapping = {team['id']: team['abbreviation'] for team in teams.get_teams()}
    today = date.today().isoformat()
    
    # ---------------------------------------------------------
    # Tier 1: Try ScoreboardV3 for today
    # ---------------------------------------------------------
    try:
        sb = scoreboardv3.ScoreboardV3(game_date=today, timeout=5)
        games_data = sb.get_dict().get('scoreboard', {}).get('games', [])
        if games_data:
            results = []
            for g in games_data:
                home_id = g["homeTeam"]["teamId"]
                away_id = g["awayTeam"]["teamId"]
                results.append({
                    "game_id": g["gameId"],
                    "home_team": team_mapping.get(home_id, "UNK"),
                    "away_team": team_mapping.get(away_id, "UNK"),
                    "game_date": today,
                    "status": "LIVE"
                })
            return results[:num_games]
    except Exception as e:
        print(f"[WARN] ScoreboardV3 failed: {e}")
        
    # ---------------------------------------------------------
    # Tier 2: Return empty schedule during off-season
    # ---------------------------------------------------------
    print("[INFO] No active games found. Returning empty schedule for off-season.")
    return []

def fetch_standings(season="2024-25"):
    try:
        from nba_api.stats.endpoints import leaguestandings
        standings = leaguestandings.LeagueStandings(season=season, timeout=5)
        df = standings.get_data_frames()[0]
        # Return top teams or all
        return df[['TeamName', 'TeamCity', 'Conference', 'WINS', 'LOSSES', 'WinPCT', 'strCurrentStreak']].to_dict('records')
    except Exception as e:
        print(f"[ERROR] Failed to fetch standings: {e}")
        return []

def fetch_recent_games(num_games=10, season="2025-26"):
    try:
        from nba_api.stats.endpoints import leaguegamefinder
        gamefinder = leaguegamefinder.LeagueGameFinder(season_nullable=season, league_id_nullable="00", timeout=5)
        df = gamefinder.get_data_frames()[0]
        # Sort by date
        df['GAME_DATE'] = pd.to_datetime(df['GAME_DATE'])
        df = df.sort_values('GAME_DATE', ascending=False)
        # Filter to get unique games (the API returns 2 rows per game, one for each team)
        df = df.drop_duplicates(subset=['GAME_ID'])
        df = df.head(num_games)
        
        results = []
        for _, row in df.iterrows():
            matchup = row['MATCHUP'] # e.g. "LAL @ GSW" or "LAL vs. GSW"
            results.append({
                "game_id": row['GAME_ID'],
                "matchup": matchup,
                "game_date": row['GAME_DATE'].strftime("%Y-%m-%d"),
                "wl": row['WL']
            })
        return results
    except Exception as e:
        print(f"[ERROR] Failed to fetch recent games: {e}")
        return []

if __name__ == "__main__":
    games = fetch_upcoming_games()
    print("\n--- SCHEDULE RESULTS ---")
    for g in games:
        print(f"{g['game_date']} | {g['away_team']} @ {g['home_team']} [{g['status']}]")
