import sys
sys.path.append(".")
from data_fetcher import fetch_upcoming_games

try:
    print("Testing fetch_upcoming_games...")
    games = fetch_upcoming_games(season="2025-26", test_mode_season="2024-25")
    print(f"Result length: {len(games)}")
    print("Games:")
    for g in games:
        print(g)
except Exception as e:
    import traceback
    print(f"Exception raised: {e}")
    traceback.print_exc()
