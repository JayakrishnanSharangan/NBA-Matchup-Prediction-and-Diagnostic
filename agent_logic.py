import json
import pandas as pd
from nba_api.stats.endpoints import teamgamelog, scoreboardv3
from sklearn.ensemble import RandomForestClassifier

def run_agent():
    print("=" * 60)
    print("     Lakers ML Prediction Agent (Christmas Day 2025)")
    print("=" * 60)
    
    lakers_id = '1610612747'

    try:
        # 1. Fetch Historical Data
        game_log = teamgamelog.TeamGameLog(team_id=lakers_id, season='2025-26')
        df = game_log.get_data_frames()[0]
        
        # Format and Sort by Date
        df['GAME_DATE'] = pd.to_datetime(df['GAME_DATE'], format='%b %d, %Y')
        df = df.sort_values('GAME_DATE').reset_index(drop=True)
        
        # Create features
        df['PTS_5g_avg'] = df['PTS'].shift(1).rolling(window=5).mean()
        df['Is_Home'] = df['MATCHUP'].apply(lambda x: 1 if 'vs.' in x else 0)
        df['Win'] = df['WL'].map({'W': 1, 'L': 0})
        
        # Filter strictly up to Dec 24, 2025 for training data
        df_train = df[df['GAME_DATE'] < '2025-12-25'].copy()
        df_train = df_train.dropna(subset=['PTS_5g_avg', 'Is_Home', 'Win'])
        
        if len(df_train) == 0:
            print("[!] Not enough data to train before Dec 25.")
            return

        # Train Model
        clf = RandomForestClassifier(random_state=42)
        X_train = df_train[['PTS_5g_avg', 'Is_Home']]
        y_train = df_train['Win']
        clf.fit(X_train, y_train)
        
        # 2. Extract leading PTS_5g_avg for Christmas Day
        # Average PTS over the 5 games ending on/before Dec 24
        last_5_games = df[df['GAME_DATE'] < '2025-12-25'].tail(5)
        current_pts_avg = last_5_games['PTS'].mean()

        # 3. Look at Dec 25 schedule 
        scoreboard = scoreboardv3.ScoreboardV3(game_date='2025-12-25')
        games_data = scoreboard.get_dict().get('scoreboard', {}).get('games', [])
        
        matchup_name = "Los Angeles Lakers vs. Houston Rockets"
        
        # Verify from scoreboard just in case
        for g in games_data:
            home_id = str(g["homeTeam"]["teamId"])
            away_id = str(g["awayTeam"]["teamId"])
            if home_id == lakers_id or away_id == lakers_id:
                # Confirmed Game exists
                break
                
        # 4. Predict
        X_test = pd.DataFrame([[current_pts_avg, 1]], columns=['PTS_5g_avg', 'Is_Home'])
        prob = clf.predict_proba(X_test)[0]
        # prob[1] is the probability of class 1 (Win)
        win_prob = round(prob[1] * 100, 2)
        
        # 5. Output Data
        out_data = {
            "matchup": matchup_name,
            "date": "2025-12-25",
            "features_used": {
                "PTS_5g_avg": round(current_pts_avg, 2),
                "is_home": 1
            },
            "win_probability_pct": win_prob
        }
        
        with open("dashboard_data.json", "w") as f:
            json.dump(out_data, f, indent=4)
            
        print(f"Prediction generated! Saved to dashboard_data.json\n")
        print(json.dumps(out_data, indent=4))
        print("\n" + "=" * 60)

    except Exception as e:
        print(f"[ERROR] {e}")

if __name__ == "__main__":
    run_agent()
