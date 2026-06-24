from nba_api.stats.endpoints import leaguegamelog
import time

try:
    print("Fetching player game logs for 2025-26 Regular Season...")
    log = leaguegamelog.LeagueGameLog(
        season="2025-26",
        season_type_all_star="Regular Season",
        player_or_team_abbreviation="P"
    )
    df = log.get_data_frames()[0]
    print(f"Success! Retrieved {len(df)} rows.")
    print("Columns in player gamelog:")
    print(list(df.columns))
    print("\nFirst row sample:")
    print(df.iloc[0].to_dict())
except Exception as e:
    print(f"Error fetching player gamelogs: {e}")
