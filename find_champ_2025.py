import pandas as pd

df = pd.read_csv("data/nba_all_seasons_games.csv")
df_playoffs = df[df['SEASON_TYPE'] == 'PO'].copy()
df_playoffs['GAME_DATE'] = pd.to_datetime(df_playoffs['GAME_DATE'])

# Find 2024-25 champion
season_24 = df_playoffs[df_playoffs['SEASON'] == '2024-25']
if not season_24.empty:
    last_date = season_24['GAME_DATE'].max()
    last_day_games = season_24[season_24['GAME_DATE'] == last_date]
    winner_row = last_day_games[last_day_games['WL'] == 'W']
    if not winner_row.empty:
         print(f"2024-25 Champion: {winner_row.iloc[0]['TEAM_ABBREVIATION']} on {last_date.date()}")
else:
    print("No 2024-25 playoff data found.")
