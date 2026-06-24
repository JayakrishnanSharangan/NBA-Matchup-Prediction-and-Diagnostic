from nba_api.stats.endpoints import scoreboardv3
from datetime import date

today = date.today().isoformat()
print(f"Calling ScoreboardV3 for {today} with timeout=5...")
try:
    sb = scoreboardv3.ScoreboardV3(game_date=today, timeout=5)
    print("ScoreboardV3 returned successfully!")
    print(sb.get_dict())
except Exception as e:
    print(f"Error: {e}")
