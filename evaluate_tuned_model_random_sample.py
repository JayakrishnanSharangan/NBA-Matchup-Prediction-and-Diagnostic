import os
import pickle
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score
import warnings
warnings.filterwarnings("ignore")


def compute_shock_index(df_team):
    grp      = df_team.groupby(['team', 'season'])['plus_minus']
    roll_mean = grp.transform(lambda x: x.shift(1).rolling(10, min_periods=3).mean())
    roll_std  = grp.transform(lambda x: x.shift(1).rolling(10, min_periods=3).std().replace(0, 1))
    return ((df_team['plus_minus'] - roll_mean) / roll_std).abs().clip(upper=3.0).fillna(0.0)


def derive_champions(df_all):
    df_po = df_all[df_all['SEASON_TYPE'] == 'PO'].copy()
    if df_po.empty:
        return {}
    df_po['GAME_DATE'] = pd.to_datetime(df_po['GAME_DATE'])
    champions = {}
    for season in df_po['SEASON'].unique():
        sp = df_po[df_po['SEASON'] == season]
        ld = sp['GAME_DATE'].max()
        winner = sp[sp['GAME_DATE'] == ld][sp['WL'] == 'W']
        if not winner.empty:
            champions[season] = winner.iloc[0]['TEAM_ABBREVIATION']
    return champions


def run_evaluation():
    print("==========================================================")
    print("[INFO] UPGRADED MODEL EVALUATION (20% RANDOM SAMPLE)")
    print("==========================================================")

    games_cache   = "data/nba_all_seasons_games.csv"
    players_cache = "data/nba_all_seasons_players.csv"

    print("[INFO] Loading data...")
    df_raw = pd.read_csv(games_cache)
    df_p   = pd.read_csv(players_cache)

    p_agg = df_p.groupby(['GAME_ID', 'TEAM_ABBREVIATION']).agg(
        player_total_pts=('PTS','sum'), player_total_reb=('REB','sum'),
        player_total_ast=('AST','sum'), player_total_stl=('STL','sum'),
        player_total_blk=('BLK','sum'), player_total_tov=('TOV','sum'),
        player_pm=('PLUS_MINUS','sum'), fg_pct_players=('FG_PCT','mean'),
        fg3_pct_players=('FG3_PCT','mean'), ft_pct_players=('FT_PCT','mean'),
        num_players=('PLAYER_ID','count')
    ).reset_index()

    CHAMPIONS = derive_champions(df_raw)

    # Build game-centric rows
    df_home   = df_raw[df_raw['MATCHUP'].str.contains('vs.', na=False)].copy()
    df_away   = df_raw[df_raw['MATCHUP'].str.contains('@',   na=False)].copy()
    df_merged = pd.merge(df_home, df_away,
                         on=['GAME_ID','SEASON','GAME_DATE','SEASON_TYPE'],
                         suffixes=('_home','_away'))
    df_merged['GAME_DATE'] = pd.to_datetime(df_merged['GAME_DATE'])
    df_merged = df_merged.sort_values('GAME_DATE').reset_index(drop=True)

    # Dynamic HCA — computed from df_merged (has WL_home after merge)
    hca_df = df_merged[['GAME_DATE','WL_home']].copy()
    hca_df = hca_df.sort_values('GAME_DATE').reset_index(drop=True)
    hca_df['home_win'] = (hca_df['WL_home'] == 'W').astype(float)
    hca_df['rolling_hwp'] = hca_df['home_win'].shift(1).rolling(500, min_periods=100).mean().fillna(0.60)
    hca_df['dynamic_hca'] = (hca_df['rolling_hwp'] / 0.60) * 100.0
    df_merged['hca'] = hca_df['dynamic_hca'].values

    print("[INFO] Recomputing ELO ratings...")
    elo_dict, elo_h, elo_a = {}, [], []
    for _, row in df_merged.iterrows():
        ht, at = row['TEAM_ABBREVIATION_home'], row['TEAM_ABBREVIATION_away']
        if ht not in elo_dict: elo_dict[ht] = 1500.0
        if at not in elo_dict: elo_dict[at] = 1500.0
        rh, ra, H = elo_dict[ht], elo_dict[at], row['hca']
        elo_h.append(rh); elo_a.append(ra)
        exp_h    = 1.0 / (1.0 + 10.0 ** ((ra - (rh + H)) / 400.0))
        act_h    = 1.0 if row['WL_home'] == 'W' else 0.0
        margin   = abs(row.get('PTS_home', 0) - row.get('PTS_away', 0))
        K = 20 + min(margin / 10.0, 10.0)
        elo_dict[ht] = rh + K * (act_h       - exp_h)
        elo_dict[at] = ra + K * ((1 - act_h) - (1 - exp_h))

    df_merged['elo_home'] = elo_h
    df_merged['elo_away'] = elo_a
    df_merged['elo_diff'] = df_merged['elo_home'] - df_merged['elo_away']

    print("[INFO] Building team logs with player aggregates...")
    rows = []
    for _, row in df_merged.iterrows():
        for side, opp in [('home','away'),('away','home')]:
            rows.append({'team': row[f'TEAM_ABBREVIATION_{side}'], 'season': row['SEASON'],
                         'GAME_DATE': row['GAME_DATE'], 'GAME_ID': row['GAME_ID'],
                         'is_home': 1 if side=='home' else 0,
                         'pts': row[f'PTS_{side}'], 'pts_opp': row[f'PTS_{opp}'],
                         'plus_minus': row[f'PLUS_MINUS_{side}'], 'fg_pct': row[f'FG_PCT_{side}'],
                         'fg3_pct': row[f'FG3_PCT_{side}'], 'ft_pct': row[f'FT_PCT_{side}'],
                         'reb': row[f'REB_{side}'], 'ast': row[f'AST_{side}'],
                         'tov': row[f'TOV_{side}'], 'stl': row[f'STL_{side}'],
                         'blk': row[f'BLK_{side}']})

    df_team = pd.DataFrame(rows)
    df_team = pd.merge(df_team, p_agg,
                       left_on=['GAME_ID','team'], right_on=['GAME_ID','TEAM_ABBREVIATION'],
                       how='left')

    fill_map = {'player_total_pts':'pts','player_total_reb':'reb','player_total_ast':'ast',
                'player_total_stl':'stl','player_total_blk':'blk','player_total_tov':'tov',
                'fg_pct_players':'fg_pct','fg3_pct_players':'fg3_pct','ft_pct_players':'ft_pct'}
    for pc, tc in fill_map.items():
        df_team[pc] = df_team[pc].fillna(df_team[tc])
    df_team['player_pm']   = df_team['player_pm'].fillna(df_team['plus_minus'] * 5)
    df_team['num_players'] = df_team['num_players'].fillna(10.0)

    df_team = df_team.sort_values(['team','season','GAME_DATE']).reset_index(drop=True)
    df_team['shock_index'] = compute_shock_index(df_team)
    df_team['prev_date']   = df_team.groupby(['team','season'])['GAME_DATE'].shift(1)
    df_team['rest_days']   = (df_team['GAME_DATE'] - df_team['prev_date']).dt.days.sub(1).fillna(3).clip(upper=10)

    # Opponent-adjusted pts
    league_avg_pts = df_team['pts'].mean()
    opp_def_roll   = df_team.groupby(['team','season'])['pts_opp'].shift(1).rolling(10, min_periods=3).mean().fillna(league_avg_pts)
    df_team['pts_opp_adj'] = df_team['pts'] / (opp_def_roll / league_avg_pts)

    base_metrics = [
        'pts','pts_opp','plus_minus','fg_pct','fg3_pct','ft_pct',
        'reb','ast','tov','stl','blk',
        'player_total_pts','player_total_reb','player_total_ast',
        'player_total_stl','player_total_blk','player_total_tov',
        'player_pm','fg_pct_players','fg3_pct_players','ft_pct_players',
        'num_players','pts_opp_adj','shock_index'
    ]

    print("[INFO] Computing EMA rolling averages...")
    for m in base_metrics:
        df_team[f'{m}_ema5']  = df_team.groupby(['team','season'])[m].transform(
            lambda x: x.shift(1).ewm(span=5,  min_periods=2, adjust=False).mean())
        df_team[f'{m}_ema10'] = df_team.groupby(['team','season'])[m].transform(
            lambda x: x.shift(1).ewm(span=10, min_periods=5, adjust=False).mean())

    df_h = df_team[df_team['is_home'] == 1].copy()
    df_a = df_team[df_team['is_home'] == 0].copy()

    base_side = ['rest_days','shock_index'] + [f'{m}_ema5' for m in base_metrics] + [f'{m}_ema10' for m in base_metrics]
    df_h = df_h.rename(columns={c: f'{c}_home' for c in base_side})
    df_a = df_a.rename(columns={c: f'{c}_away' for c in base_side})

    df_merged = pd.merge(df_merged, df_h[['GAME_ID'] + [f'{c}_home' for c in base_side]], on='GAME_ID')
    df_merged = pd.merge(df_merged, df_a[['GAME_ID'] + [f'{c}_away' for c in base_side]], on='GAME_ID')

    df_merged['is_defending_champion_home'] = df_merged.apply(
        lambda r: 1 if CHAMPIONS.get(r['SEASON']) == r['TEAM_ABBREVIATION_home'] else 0, axis=1)
    df_merged['is_defending_champion_away'] = df_merged.apply(
        lambda r: 1 if CHAMPIONS.get(r['SEASON']) == r['TEAM_ABBREVIATION_away'] else 0, axis=1)
    df_merged['def_champ_diff'] = df_merged['is_defending_champion_home'] - df_merged['is_defending_champion_away']

    for c in base_side:
        df_merged[f'{c}_diff'] = df_merged[f'{c}_home'] - df_merged[f'{c}_away']

    # Load the feature columns from the new model's states
    with open("latest_states.pkl", "rb") as f:
        states = pickle.load(f)
    feature_cols = states['feature_cols']

    # Build model dataframe (use only features that exist in both)
    available = [c for c in feature_cols if c in df_merged.columns]
    df_model = df_merged[available + ['WL_home','SEASON','GAME_DATE']].dropna().copy()
    df_model['target'] = df_model['WL_home'].map({'W':1,'L':0})
    print(f"[INFO] Clean dataset: {len(df_model)} games | Features used: {len(available)}")

    # 20% random sample
    df_sample = df_model.sample(frac=0.20, random_state=42)
    X_s = df_sample[available]
    y_s = df_sample['target']
    print(f"[INFO] Sampled {len(X_s)} games for evaluation.")

    with open("scaler.pkl", "rb") as f:
        scaler = pickle.load(f)
    X_s_scaled = scaler.transform(X_s)

    clf = xgb.XGBClassifier()
    clf.load_model("nba_tuned_model.json")

    y_pred      = clf.predict(X_s_scaled)
    y_prob      = clf.predict_proba(X_s_scaled)[:, 1]
    accuracy    = accuracy_score(y_s, y_pred)
    roc_auc     = roc_auc_score(y_s, y_prob)

    print(f"\n======== STANDARD EVALUATION (20% RANDOM SAMPLE) ========")
    print(f"XGBoost Accuracy : {accuracy * 100:.2f}%")
    print(f"XGBoost ROC-AUC  : {roc_auc:.4f}")
    print("\nClassification Report:")
    print(classification_report(y_s, y_pred))

    # Confidence corridor
    THRESHOLD = states.get('confidence_threshold', 0.62)
    conf_mask = (y_prob > THRESHOLD) | (y_prob < (1 - THRESHOLD))
    y_conf    = y_s[conf_mask]
    y_pred_c  = (y_prob[conf_mask] > 0.5).astype(int)

    if len(y_conf) > 0:
        conf_acc = accuracy_score(y_conf, y_pred_c)
        print(f"======== HIGH-CONFIDENCE CORRIDOR (>{int(THRESHOLD*100)}%) ========")
        print(f"Confident games  : {len(y_conf)} / {len(y_s)} ({len(y_conf)/len(y_s)*100:.1f}%)")
        print(f"Confident accuracy: {conf_acc * 100:.2f}% (+{(conf_acc - accuracy)*100:.2f}pp)")
        print(classification_report(y_conf, y_pred_c))
    print("==========================================================")


if __name__ == "__main__":
    run_evaluation()
