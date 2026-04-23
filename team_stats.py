from nba_api.stats.endpoints import teamgamelog
import pandas as pd

def fetch_lakers_recent_games():
    """Fetch the 5 most recent games for the Los Angeles Lakers (2025-26 Season)."""
    print("=" * 60)
    print("      Lakers Recent 5 Games (2025-26 Season)")
    print("=" * 60)

    try:
        # Lakers Team ID
        lakers_id = '1610612747'

        # Fetch game log for the 2025-26 season
        game_log = teamgamelog.TeamGameLog(
            team_id=lakers_id,
            season='2025-26'
        )

        # Get DataFrame
        df = game_log.get_data_frames()[0]

        if df.empty:
            print("\n[!] No games found for this season.")
            return

        # Sort by game date oldest to newest
        df['GAME_DATE'] = pd.to_datetime(df['GAME_DATE'], format='%b %d, %Y')
        df = df.sort_values('GAME_DATE').reset_index(drop=True)

        # Calculate PTS_5g_avg using .shift(1) and .rolling(5).mean()
        df['PTS_5g_avg'] = df['PTS'].shift(1).rolling(window=5).mean()

        # Select relevant columns for the last 10 games
        columns_to_extract = ["GAME_DATE", "MATCHUP", "PTS", "PTS_5g_avg"]
        
        # Ensure the columns exist before extracting
        available_cols = df.columns
        actual_cols = [col for col in columns_to_extract if col in available_cols]
        
        if len(actual_cols) < len(columns_to_extract):
            print("\n[!] Unexpected data format. Available columns:")
            print(", ".join(available_cols))
            return
            
        # Get the last 10 rows
        recent_games = df.tail(10)
        display_df = recent_games[columns_to_extract].copy()
        display_df.columns = ["Game Date", "Matchup", "PTS", "PTS_5g_avg"]
        
        # Format the Date nicely back to string format
        display_df['Game Date'] = display_df['Game Date'].dt.strftime('%b %d, %Y')

        print(f"\nDisplaying {len(display_df)} most recent games with 5-game rolling average:\n")
        print(display_df.to_string(index=False))
        print("\n" + "=" * 60)

    except Exception as e:
        print(f"\n[ERROR] Error fetching data: {e}")
        print("    Make sure you have an active internet connection.")


if __name__ == "__main__":
    fetch_lakers_recent_games()
