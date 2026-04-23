"""
NBA Data Fetcher
Fetches today's NBA game schedule using nba_api and prints
Game ID, Home Team ID, and Visitor Team ID.
"""

from nba_api.stats.endpoints import scoreboardv3
from nba_api.stats.static import teams
import pandas as pd


def fetch_todays_games():
    """Fetch today's NBA game schedule and display key game info."""
    print("=" * 60)
    print("       NBA Game Schedule: Dec 25, 2025")
    print("=" * 60)

    try:
        # Build a dictionary to map team IDs to full names
        team_mapping = {team['id']: team['full_name'] for team in teams.get_teams()}

        # Fetch scoreboard data for Dec 25, 2025
        scoreboard = scoreboardv3.ScoreboardV3(game_date='2025-12-25')

        # The V3 endpoint's data structure is best accessed via dictionary
        games_data = scoreboard.get_dict().get('scoreboard', {}).get('games', [])

        if not games_data:
            print("\n[!] No games scheduled for this day.")
            return

        # Parse relevant info into a list of dictionaries
        parsed_games = []
        for g in games_data:
            home_id = g["homeTeam"]["teamId"]
            away_id = g["awayTeam"]["teamId"]
            parsed_games.append({
                "Game ID": g["gameId"],
                "Home Team": team_mapping.get(home_id, f"Unknown ({home_id})"),
                "Visitor Team": team_mapping.get(away_id, f"Unknown ({away_id})")
            })
            
        games_df = pd.DataFrame(parsed_games)

        print(f"\nGames found on this day: {len(games_df)}\n")
        print(games_df.to_string(index=False))
        print("\n" + "=" * 60)

        # Also print row-by-row for clarity
        print("\nDetailed View:\n")
        for _, row in games_df.iterrows():
            print(f"  Game ID     : {row['Game ID']}")
            print(f"  Home Team   : {row['Home Team']}")
            print(f"  Visitor Team: {row['Visitor Team']}")
            print("  " + "-" * 40)

    except Exception as e:
        print(f"\n[ERROR] Error fetching data: {e}")
        print("    Make sure you have an active internet connection.")


if __name__ == "__main__":
    fetch_todays_games()
