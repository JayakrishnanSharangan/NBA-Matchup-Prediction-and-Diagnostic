import os
import time
import pandas as pd
from nba_api.stats.endpoints import leaguegamelog

def fetch_and_cache_player_games():
    print("==========================================================")
    print("[INFO] NBA HISTORICAL PLAYER-LEVEL DATA INGESTION PIPELINE")
    print("[INFO] Fetching Regular Season + Playoffs (2000-01 to 2025-26)")
    print("==========================================================")

    os.makedirs("data", exist_ok=True)
    cache_path = os.path.join("data", "nba_all_seasons_players.csv")

    seasons = []
    for y in range(2000, 2026):
        season_str = f"{y}-{str(y+1)[-2:]}"
        seasons.append(season_str)

    season_types = [
        ("Regular Season", "RS"),
        ("Playoffs", "PO")
    ]

    all_dfs = []
    total_calls = len(seasons) * len(season_types)
    call_idx = 0

    for season in seasons:
        for season_type_label, season_type_short in season_types:
            call_idx += 1
            print(f"[{call_idx}/{total_calls}] Fetching player logs for {season} - {season_type_label}...")

            retries = 3
            success = False
            while retries > 0 and not success:
                try:
                    log = leaguegamelog.LeagueGameLog(
                        season=season,
                        season_type_all_star=season_type_label,
                        player_or_team_abbreviation="P"
                    )
                    df = log.get_data_frames()[0]

                    if df.empty:
                        print(f"  [WARN] No player data for {season} {season_type_label}. Skipping.")
                    else:
                        df["SEASON"] = season
                        df["SEASON_TYPE"] = season_type_short
                        all_dfs.append(df)
                        print(f"  [SUCCESS] Retrieved {len(df)} player-game rows.")

                    success = True

                except Exception as e:
                    retries -= 1
                    print(f"  [ERROR] Failed to fetch: {e}. Retries remaining: {retries}")
                    time.sleep(5)

            # Polite sleep delay between hits to respect stats.nba.com rate limiting
            time.sleep(1.2)

    if not all_dfs:
        print("\n[ERROR] No data fetched. Cache not written.")
        return

    print("\n[INFO] Compiling all seasons into a single dataset...")
    combined_df = pd.concat(all_dfs, ignore_index=True)
    
    # Save to CSV
    combined_df.to_csv(cache_path, index=False)
    
    rs_count = combined_df[combined_df['SEASON_TYPE'] == 'RS']
    po_count = combined_df[combined_df['SEASON_TYPE'] == 'PO']
    
    print(f"\n[OK] PLAYER DATA INGESTION COMPLETE!")
    print(f"     Regular Season player rows : {len(rs_count)}")
    print(f"     Playoffs player rows       : {len(po_count)}")
    print(f"     Total player rows saved    : {len(combined_df)}")
    print(f"     Saved to                   : {cache_path}")
    print("==========================================================")

if __name__ == "__main__":
    fetch_and_cache_player_games()
