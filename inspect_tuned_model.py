import pickle
import xgboost as xgb
import os

print("=== INSPECTING SCALER ===")
if os.path.exists("scaler.pkl"):
    with open("scaler.pkl", "rb") as f:
        scaler = pickle.load(f)
    print(f"Scaler type: {type(scaler)}")
    if hasattr(scaler, "n_features_in_"):
        print(f"Number of features scaled: {scaler.n_features_in_}")
    if hasattr(scaler, "feature_names_in_"):
        print(f"Features in scaler:\n{list(scaler.feature_names_in_)}")
else:
    print("scaler.pkl not found!")

print("\n=== INSPECTING LATEST STATES ===")
if os.path.exists("latest_states.pkl"):
    with open("latest_states.pkl", "rb") as f:
        states = pickle.load(f)
    print(f"States keys: {list(states.keys())}")
    
    if "metrics_list" in states:
        print(f"Metrics tracked: {states['metrics_list']}")
    
    if "feature_cols" in states:
        print(f"Number of feature columns: {len(states['feature_cols'])}")
        print(f"First 10 feature columns: {states['feature_cols'][:10]}")
        
    if "elo" in states:
        print(f"ELO tracked for {len(states['elo'])} teams.")
        print(f"Sample ELOs (e.g., LAL, HOU, BOS):")
        for team in ['LAL', 'HOU', 'BOS']:
            print(f"  {team}: {states['elo'].get(team, 'N/A')}")
            
    if "last_games" in states:
        print(f"Tracking prior game logs for {len(states['last_games'])} teams.")
        if "LAL" in states['last_games']:
            print(f"LAL sample prior game metrics: {states['last_games']['LAL'][0] if states['last_games']['LAL'] else 'empty'}")
else:
    print("latest_states.pkl not found!")

print("\n=== INSPECTING TUNED XGBOOST MODEL ===")
if os.path.exists("nba_tuned_model.json"):
    clf = xgb.XGBClassifier()
    clf.load_model("nba_tuned_model.json")
    print(f"Model successfully loaded!")
    print(f"Model parameters: {clf.get_params()}")
else:
    print("nba_tuned_model.json not found!")
