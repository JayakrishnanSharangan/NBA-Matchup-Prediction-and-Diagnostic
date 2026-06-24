from nba_api.stats.endpoints import leaguestandings
import json

try:
    standings = leaguestandings.LeagueStandings(season="2024-25")
    df = standings.get_data_frames()[0]
    print(df[['TeamName', 'WINS', 'LOSSES', 'WinPCT']].head())
except Exception as e:
    print(e)
