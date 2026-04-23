from nba_api.stats.endpoints import teamgamelog
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score

def train_lakers_model():
    print("=" * 60)
    print("      Lakers Machine Learning Model (2025-26 Season)")
    print("=" * 60)

    try:
        # Fetch game log
        lakers_id = '1610612747'
        game_log = teamgamelog.TeamGameLog(
            team_id=lakers_id,
            season='2025-26'
        )
        df = game_log.get_data_frames()[0]

        if df.empty:
            print("\n[!] No games found for this season.")
            return

        # Sort from oldest to newest
        df['GAME_DATE'] = pd.to_datetime(df['GAME_DATE'], format='%b %d, %Y')
        df = df.sort_values('GAME_DATE').reset_index(drop=True)

        # 1. Feature: PTS_5g_avg
        df['PTS_5g_avg'] = df['PTS'].shift(1).rolling(window=5).mean()

        # 2. Feature: Is_Home
        # 'vs.' means home, '@' means away
        df['Is_Home'] = df['MATCHUP'].apply(lambda x: 1 if 'vs.' in x else 0)

        # 3. Target: Win
        # Map 'W' -> 1, 'L' -> 0
        df['Win'] = df['WL'].map({'W': 1, 'L': 0})

        # Drop NaNs (first 5 games won't have averages)
        df = df.dropna(subset=['PTS_5g_avg', 'Is_Home', 'Win'])

        # Prepare X and y
        X = df[['PTS_5g_avg', 'Is_Home']]
        y = df['Win']

        if len(X) == 0:
             print("[!] Not enough data available after dropping NaNs to train the model.")
             return

        # Initialize and Train Model
        clf = RandomForestClassifier(random_state=42)
        clf.fit(X, y)

        # Predict and Score
        y_pred = clf.predict(X)
        accuracy = accuracy_score(y, y_pred)

        print(f"\nModel trained successfully on {len(df)} games.")
        print(f"Features: PTS_5g_avg, Is_Home -> Target: Win")
        print(f"Accuracy Score: {accuracy * 100:.2f}%\n")
        print("=" * 60)

    except Exception as e:
        print(f"\n[ERROR] Error: {e}")

if __name__ == "__main__":
    train_lakers_model()
