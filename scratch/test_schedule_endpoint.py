from nba_api.stats.endpoints import scheduleleaguev2
import pandas as pd

print("Calling ScheduleLeagueV2 for 2024-25...")
try:
    sched = scheduleleaguev2.ScheduleLeagueV2(season="2024-25", league_id='00', timeout=5)
    df = sched.get_data_frames()[0]
    print(f"Success! DataFrame shape: {df.shape}")
    if not df.empty:
        print("Columns:")
        print(list(df.columns))
        print("First 3 rows:")
        print(df.head(3).to_dict('records'))
except Exception as e:
    print(f"Error: {e}")
