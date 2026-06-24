import pickle
import pandas as pd
import numpy as np
import xgboost as xgb
import os

def clean_and_fill_game_logs(games_list):
    df = pd.DataFrame(games_list)
    # Fill player-level nan columns with team-level equivalents if they exist
    if 'player_total_pts' in df.columns:
        df['player_total_pts'] = df['player_total_pts'].fillna(df['pts'])
    if 'player_total_reb' in df.columns:
        df['player_total_reb'] = df['player_total_reb'].fillna(df['reb'])
    if 'player_total_ast' in df.columns:
        df['player_total_ast'] = df['player_total_ast'].fillna(df['ast'])
    if 'player_total_stl' in df.columns:
        df['player_total_stl'] = df['player_total_stl'].fillna(df['stl'])
    if 'player_total_blk' in df.columns:
        df['player_total_blk'] = df['player_total_blk'].fillna(df['blk'])
    if 'player_total_tov' in df.columns:
        df['player_total_tov'] = df['player_total_tov'].fillna(df['tov'])
    if 'player_team_plus_minus' in df.columns:
        df['player_team_plus_minus'] = df['player_team_plus_minus'].fillna(df['plus_minus'] * 5)
    if 'fg_pct_players' in df.columns:
        df['fg_pct_players'] = df['fg_pct_players'].fillna(df['fg_pct'])
    if 'fg3_pct_players' in df.columns:
        df['fg3_pct_players'] = df['fg3_pct_players'].fillna(df['fg3_pct'])
    if 'ft_pct_players' in df.columns:
        df['ft_pct_players'] = df['ft_pct_players'].fillna(df['ft_pct'])
    if 'num_players' in df.columns:
        df['num_players'] = df['num_players'].fillna(10.0)
    
    df = df.ffill().bfill().fillna(0.0)
    return df

def run_test_prediction():
    # Load files
    with open("latest_states.pkl", "rb") as f:
        states = pickle.load(f)
    
    with open("scaler.pkl", "rb") as f:
        scaler = pickle.load(f)
        
    clf = xgb.XGBClassifier()
    clf.load_model("nba_tuned_model.json")
    
    home_team = "LAL"
    away_team = "HOU"
    target_date = "2025-12-25"
    defending_champion = "OKC"
    
    # ELO
    elo_home = states['elo'].get(home_team, 1500.0)
    elo_away = states['elo'].get(away_team, 1500.0)
    elo_diff = elo_home - elo_away
    
    # Rest Days
    last_date_home = states['last_game_date'].get(home_team)
    last_date_away = states['last_game_date'].get(away_team)
    
    rest_days_home = (pd.to_datetime(target_date) - pd.to_datetime(last_date_home)).days - 1
    rest_days_away = (pd.to_datetime(target_date) - pd.to_datetime(last_date_away)).days - 1
    
    rest_days_home = min(max(rest_days_home, 0), 10)
    rest_days_away = min(max(rest_days_away, 0), 10)
    rest_days_diff = rest_days_home - rest_days_away
    
    # Defending Champion
    is_defending_champion_home = 1 if home_team == defending_champion else 0
    is_defending_champion_away = 1 if away_team == defending_champion else 0
    def_champ_diff = is_defending_champion_home - is_defending_champion_away
    
    # Base Features dict
    features_dict = {
        'elo_home': elo_home,
        'elo_away': elo_away,
        'elo_diff': elo_diff,
        'rest_days_home': rest_days_home,
        'rest_days_away': rest_days_away,
        'rest_days_diff': rest_days_diff,
        'is_defending_champion_home': is_defending_champion_home,
        'is_defending_champion_away': is_defending_champion_away,
        'def_champ_diff': def_champ_diff
    }
    
    # Rolling features
    df_home_games = clean_and_fill_game_logs(states['last_games'][home_team])
    df_away_games = clean_and_fill_game_logs(states['last_games'][away_team])
    
    for m in states['metrics_list']:
        # roll5
        r5_home = df_home_games[m].tail(5).mean()
        r5_away = df_away_games[m].tail(5).mean()
        features_dict[f'{m}_roll5_home'] = r5_home
        features_dict[f'{m}_roll5_away'] = r5_away
        features_dict[f'{m}_roll5_diff'] = r5_home - r5_away
        
        # roll10
        r10_home = df_home_games[m].tail(10).mean()
        r10_away = df_away_games[m].tail(10).mean()
        features_dict[f'{m}_roll10_home'] = r10_home
        features_dict[f'{m}_roll10_away'] = r10_away
        features_dict[f'{m}_roll10_diff'] = r10_home - r10_away

    # Align with feature_cols from scaler/model
    feature_cols = states['feature_cols']
    X_dict = {col: features_dict[col] for col in feature_cols}
    
    X_df = pd.DataFrame([X_dict])
    X_scaled = scaler.transform(X_df)
    
    pred = clf.predict(X_scaled)[0]
    pred_prob = clf.predict_proba(X_scaled)[0]
    
    print(f"Prediction: {'WIN' if pred == 1 else 'LOSS'}")
    print(f"LAL Win Probability: {pred_prob[1]*100:.2f}%")
    print(f"HOU Win Probability: {pred_prob[0]*100:.2f}%")

if __name__ == "__main__":
    run_test_prediction()
