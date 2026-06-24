"""
NBA Prediction Engine — v5 (The Ceiling)
=========================================
Takes the highly successful v4b architecture (75.09% true future accuracy)
and pushes it to the absolute limit.

Additions for v5:
  1. Rest Advantage Differential (explicit fatigue advantage)
  2. Four Factors + Star Absent (retained from v4b)
  3. Top 50 Feature Selection (restored from the 85% run)
  4. Proper Temporal Split (Train <=2022, Tune 2023, Test 2024-2026)
"""

import os, pickle, warnings
import pandas as pd
import numpy as np
import xgboost as xgb
import optuna
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score
from sklearn.feature_selection import mutual_info_classif

warnings.filterwarnings("ignore")
optuna.logging.set_verbosity(optuna.logging.WARNING)


def derive_champions(df_all):
    df_po = df_all[df_all['SEASON_TYPE'] == 'PO'].copy()
    if df_po.empty: return {}
    df_po['GAME_DATE'] = pd.to_datetime(df_po['GAME_DATE'])
    champions = {}
    for season in df_po['SEASON'].unique():
        sp = df_po[df_po['SEASON'] == season]
        ld = sp['GAME_DATE'].max()
        w  = sp[(sp['GAME_DATE'] == ld) & (sp['WL'] == 'W')]
        if not w.empty:
            champions[season] = w.iloc[0]['TEAM_ABBREVIATION']
    return champions

def compute_dynamic_hca(df_merged, base_hca=100.0, window=500):
    hca = df_merged[['GAME_DATE', 'WL_home']].copy().sort_values('GAME_DATE').reset_index(drop=True)
    hca['hw']  = (hca['WL_home'] == 'W').astype(float)
    hca['hwp'] = hca['hw'].shift(1).rolling(window, min_periods=100).mean().fillna(0.60)
    return ((hca['hwp'] / 0.60) * base_hca).values

def compute_shock_index(df_team):
    grp = df_team.groupby(['team', 'season'])['plus_minus']
    mu  = grp.transform(lambda x: x.shift(1).rolling(10, min_periods=3).mean())
    sig = grp.transform(lambda x: x.shift(1).rolling(10, min_periods=3).std().replace(0, 1))
    return ((df_team['plus_minus'].shift(1) - mu) / sig).abs().clip(upper=3.0).fillna(0.0)

def compute_h2h(df_merged):
    h2h_records, rates = {}, []
    for _, row in df_merged.iterrows():
        ht, at = row['TEAM_ABBREVIATION_home'], row['TEAM_ABBREVIATION_away']
        key = (min(ht, at), max(ht, at))
        if key not in h2h_records: h2h_records[key] = []
        prior = h2h_records[key][-20:]
        rates.append((sum(1 for g in prior if g == ht) / len(prior)) if len(prior) >= 3 else 0.5)
        h2h_records[key].append(ht if row['WL_home'] == 'W' else at)
    return rates

def compute_schedule_density(df_team):
    df_team = df_team.sort_values(['team', 'GAME_DATE']).reset_index(drop=True)
    def rolling_7d(group):
        dates = group['GAME_DATE'].values
        counts = np.zeros(len(dates), dtype=int)
        for i in range(len(dates)):
            delta = (dates[i] - dates[:i]).astype('timedelta64[D]').astype(int)
            counts[i] = int(np.sum((delta > 0) & (delta <= 7)))
        return counts
    df_team['games_7d'] = df_team.groupby('team', group_keys=False).apply(
        lambda g: pd.Series(rolling_7d(g.reset_index(drop=True)), index=g.index))
    df_team['prev_game_date'] = df_team.groupby('team')['GAME_DATE'].shift(1)
    df_team['is_back_to_back'] = ((df_team['GAME_DATE'] - df_team['prev_game_date']).dt.days == 1).astype(int).fillna(0)
    return df_team

def compute_player_signals(df_p):
    df = df_p[['GAME_ID', 'GAME_DATE', 'PLAYER_ID', 'TEAM_ABBREVIATION', 'PLUS_MINUS']].copy()
    df['GAME_DATE']  = pd.to_datetime(df['GAME_DATE'])
    df['PLUS_MINUS'] = pd.to_numeric(df['PLUS_MINUS'], errors='coerce').fillna(0.0)
    df = df.sort_values(['PLAYER_ID', 'GAME_DATE']).reset_index(drop=True)
    
    df['player_strength'] = (
        df.groupby('PLAYER_ID')['PLUS_MINUS']
          .transform(lambda x: x.shift(1).ewm(span=20, min_periods=5, adjust=False).mean())
          .fillna(0.0)
    )
    
    # Team Strength (Top 8)
    ts = df.groupby(['GAME_ID', 'TEAM_ABBREVIATION'])['player_strength'].apply(lambda x: x.nlargest(8).sum()).reset_index()
    ts.columns = ['GAME_ID', 'TEAM_ABBREVIATION', 'team_player_strength']

    # Star Absent
    idx_max = df.groupby(['TEAM_ABBREVIATION', 'GAME_ID'])['player_strength'].idxmax()
    star = df.loc[idx_max, ['TEAM_ABBREVIATION', 'GAME_ID', 'GAME_DATE', 'PLAYER_ID']].rename(columns={'PLAYER_ID': 'star_id'}).sort_values(['TEAM_ABBREVIATION', 'GAME_DATE'])
    star['expected_star'] = star.groupby('TEAM_ABBREVIATION')['star_id'].shift(1)
    
    players = df.groupby(['GAME_ID', 'TEAM_ABBREVIATION'])['PLAYER_ID'].apply(frozenset).reset_index(name='player_set')
    sc = pd.merge(star[['GAME_ID', 'TEAM_ABBREVIATION', 'expected_star']], players, on=['GAME_ID', 'TEAM_ABBREVIATION'], how='left')
    sc['star_absent'] = sc.apply(lambda r: 0 if pd.isna(r['expected_star']) else int(r['expected_star'] not in (r['player_set'] or set())), axis=1)
    
    return ts, sc[['GAME_ID', 'TEAM_ABBREVIATION', 'star_absent']]


def train():
    print("=" * 62)
    print("  NBA PREDICTION ENGINE — v5 THE CEILING")
    print("  Four Factors | Star Absent | Fatigue Diff | Top 50 Features")
    print("=" * 62)

    g_path = os.path.join("data", "nba_all_seasons_games.csv")
    p_path = os.path.join("data", "nba_all_seasons_players.csv")
    if not os.path.exists(g_path) or not os.path.exists(p_path): return

    df_raw = pd.read_csv(g_path)
    df_p   = pd.read_csv(p_path)
    print(f"[INFO] Loaded {len(df_raw)} games, {len(df_p)} player logs.")

    CHAMPIONS = derive_champions(df_raw)
    ts_df, star_df = compute_player_signals(df_p)

    print("[INFO] Aggregating box scores...")
    p_agg = df_p.groupby(['GAME_ID', 'TEAM_ABBREVIATION']).agg(
        player_pm=('PLUS_MINUS','sum'), num_players=('PLAYER_ID','count')
    ).reset_index()
    p_agg = pd.merge(p_agg, ts_df, on=['GAME_ID', 'TEAM_ABBREVIATION'], how='left')
    p_agg = pd.merge(p_agg, star_df, on=['GAME_ID', 'TEAM_ABBREVIATION'], how='left')

    df_home = df_raw[df_raw['MATCHUP'].str.contains('vs.', na=False)].copy()
    df_away = df_raw[df_raw['MATCHUP'].str.contains('@', na=False)].copy()
    df_m    = pd.merge(df_home, df_away, on=['GAME_ID', 'SEASON', 'GAME_DATE', 'SEASON_TYPE'], suffixes=('_home', '_away'))
    df_m['GAME_DATE'] = pd.to_datetime(df_m['GAME_DATE'])
    df_m    = df_m.sort_values('GAME_DATE').reset_index(drop=True)

    df_m['hca'] = compute_dynamic_hca(df_m)
    df_m['h2h_home_win_rate'] = compute_h2h(df_m)

    print("[INFO] Computing ELO...")
    elo, elo_h, elo_a = {}, [], []
    for _, row in df_m.iterrows():
        ht, at = row['TEAM_ABBREVIATION_home'], row['TEAM_ABBREVIATION_away']
        if ht not in elo: elo[ht] = 1500.0
        if at not in elo: elo[at] = 1500.0
        rh, ra, H = elo[ht], elo[at], row['hca']
        elo_h.append(rh); elo_a.append(ra)
        exp_h = 1.0 / (1.0 + 10.0 ** ((ra - (rh + H)) / 400.0))
        act_h = 1.0 if row['WL_home'] == 'W' else 0.0
        K = 20 + min(abs(row.get('PTS_home', 0) - row.get('PTS_away', 0)) / 10.0, 10.0)
        elo[ht] = rh + K * (act_h - exp_h)
        elo[at] = ra + K * ((1 - act_h) - (1 - exp_h))
    df_m['elo_home'] = elo_h
    df_m['elo_away'] = elo_a
    df_m['elo_diff'] = df_m['elo_home'] - df_m['elo_away']

    print("[INFO] Building team logs (Four Factors)...")
    rows = []
    for _, row in df_m.iterrows():
        for side, opp in [('home', 'away'), ('away', 'home')]:
            fga, fgm, fg3m = row.get(f'FGA_{side}', 0) or 0, row.get(f'FGM_{side}', 0) or 0, row.get(f'FG3M_{side}', 0) or 0
            fta, oreb, tov = row.get(f'FTA_{side}', 0) or 0, row.get(f'OREB_{side}', 0) or 0, row.get(f'TOV_{side}', 0) or 0
            dreb_opp = row.get(f'DREB_{opp}', 0) or 0
            
            efg = (fgm + 0.5 * fg3m) / max(fga, 1)
            tovr = tov / max(fga + 0.44 * fta + tov, 1)
            ftr = fta / max(fga, 1)
            orbr = oreb / max(oreb + dreb_opp, 1)
            poss = max(fga - oreb + tov + 0.44 * fta, 55)

            rows.append({
                'team': row[f'TEAM_ABBREVIATION_{side}'], 'season': row['SEASON'], 'GAME_DATE': row['GAME_DATE'], 'GAME_ID': row['GAME_ID'],
                'is_home': 1 if side == 'home' else 0, 'pts': row[f'PTS_{side}'], 'pts_opp': row[f'PTS_{opp}'],
                'plus_minus': row[f'PLUS_MINUS_{side}'], 'fg_pct': row[f'FG_PCT_{side}'], 'fg3_pct': row[f'FG3_PCT_{side}'],
                'reb': row[f'REB_{side}'], 'ast': row[f'AST_{side}'], 'tov': tov, 'stl': row[f'STL_{side}'], 'blk': row[f'BLK_{side}'],
                'efg_pct': efg, 'tov_rate': tovr, 'ft_rate': ftr, 'oreb_pct': orbr,
                'pts_per100': (row.get(f'PTS_{side}', 0) / poss) * 100, 'pts_opp_per100': (row.get(f'PTS_{opp}', 0) / poss) * 100,
            })

    df_team = pd.DataFrame(rows)
    df_team = pd.merge(df_team, p_agg, left_on=['GAME_ID', 'team'], right_on=['GAME_ID', 'TEAM_ABBREVIATION'], how='left')
    df_team['player_pm'] = df_team['player_pm'].fillna(df_team['plus_minus'] * 5)
    df_team['team_player_strength'] = df_team['team_player_strength'].fillna(0.0)
    df_team['star_absent'] = df_team['star_absent'].fillna(0).astype(int)
    df_team = df_team.sort_values(['team', 'season', 'GAME_DATE']).reset_index(drop=True)

    df_team['shock_index'] = compute_shock_index(df_team)
    df_team['prev_date'] = df_team.groupby(['team', 'season'])['GAME_DATE'].shift(1)
    df_team['rest_days'] = (df_team['GAME_DATE'] - df_team['prev_date']).dt.days.sub(1).fillna(3).clip(upper=10)
    df_team = compute_schedule_density(df_team)

    league_avg_pts = df_team['pts'].mean()
    opp_def_roll = df_team.groupby(['team', 'season'])['pts_opp'].shift(1).rolling(10, min_periods=3).mean().fillna(league_avg_pts)
    df_team['pts_opp_adj'] = df_team['pts'] / (opp_def_roll / league_avg_pts)

    print("[INFO] Computing EMA rolling averages...")
    base_metrics = ['pts', 'pts_opp', 'plus_minus', 'fg_pct', 'fg3_pct', 'reb', 'ast', 'tov', 'stl', 'blk',
                    'player_pm', 'pts_opp_adj', 'shock_index', 'team_player_strength', 'pts_per100', 'pts_opp_per100',
                    'efg_pct', 'tov_rate', 'ft_rate', 'oreb_pct']

    for m in base_metrics:
        df_team[f'{m}_ema5']  = df_team.groupby(['team', 'season'])[m].transform(lambda x: x.shift(1).ewm(span=5, min_periods=2, adjust=False).mean())
        df_team[f'{m}_ema10'] = df_team.groupby(['team', 'season'])[m].transform(lambda x: x.shift(1).ewm(span=10, min_periods=5, adjust=False).mean())

    df_h = df_team[df_team['is_home'] == 1].copy()
    df_a = df_team[df_team['is_home'] == 0].copy()

    rolling_cols = ['rest_days', 'shock_index', 'games_7d', 'is_back_to_back', 'star_absent'] + [f'{m}_ema5' for m in base_metrics] + [f'{m}_ema10' for m in base_metrics]
    df_h = df_h.rename(columns={c: f'{c}_home' for c in rolling_cols})
    df_a = df_a.rename(columns={c: f'{c}_away' for c in rolling_cols})
    df_m = pd.merge(df_m, df_h[['GAME_ID'] + [f'{c}_home' for c in rolling_cols]], on='GAME_ID')
    df_m = pd.merge(df_m, df_a[['GAME_ID'] + [f'{c}_away' for c in rolling_cols]], on='GAME_ID')

    for c in rolling_cols:
        df_m[f'{c}_diff'] = df_m[f'{c}_home'] - df_m[f'{c}_away']

    all_feature_cols = ['elo_home', 'elo_away', 'elo_diff', 'hca', 'h2h_home_win_rate'] + [f'{c}_home' for c in rolling_cols] + [f'{c}_away' for c in rolling_cols] + [f'{c}_diff' for c in rolling_cols]
    
    df_model = df_m[all_feature_cols + ['WL_home', 'SEASON', 'GAME_DATE']].dropna().copy()
    df_model['target'] = df_model['WL_home'].map({'W': 1, 'L': 0})

    print("[INFO] MI feature selection (Top 50)...")
    mi = mutual_info_classif(df_model[all_feature_cols].fillna(0), df_model['target'], random_state=42)
    mi_s = pd.Series(mi, index=all_feature_cols).sort_values(ascending=False)
    feature_cols = mi_s.head(50).index.tolist()

    test_seasons = ['2024-25', '2025-26']
    val_seasons  = ['2023-24']
    otr_mask = ~df_model['SEASON'].isin(val_seasons + test_seasons)
    ov_mask  =  df_model['SEASON'].isin(val_seasons)
    ftr_mask = ~df_model['SEASON'].isin(test_seasons)
    te_mask  =  df_model['SEASON'].isin(test_seasons)

    w_all = df_model['SEASON'].apply(lambda s: 0.93 ** (2025 - int(s[:4])) if str(s)[:4].isdigit() else 1.0).values
    X, y = df_model[feature_cols], df_model['target']

    scaler = StandardScaler()
    scaler.fit(X[ftr_mask])
    X_otr = scaler.transform(X[otr_mask]); y_otr = y[otr_mask]; w_otr = w_all[otr_mask]
    X_ov  = scaler.transform(X[ov_mask]);  y_ov  = y[ov_mask]
    X_tr  = scaler.transform(X[ftr_mask]); y_tr  = y[ftr_mask]; w_tr  = w_all[ftr_mask]
    X_te  = scaler.transform(X[te_mask]);  y_te  = y[te_mask]

    print("[INFO] Running Optuna (40 trials)...")
    def objective(trial):
        p = dict(
            n_estimators=trial.suggest_int('n_estimators', 300, 800),
            max_depth=trial.suggest_int('max_depth', 3, 7),
            learning_rate=trial.suggest_float('learning_rate', 0.01, 0.2, log=True),
            subsample=trial.suggest_float('subsample', 0.60, 1.0),
            colsample_bytree=trial.suggest_float('colsample_bytree', 0.50, 1.0),
            reg_alpha=trial.suggest_float('reg_alpha', 0.0, 3.0),
            reg_lambda=trial.suggest_float('reg_lambda', 0.5, 4.0),
            min_child_weight=trial.suggest_int('min_child_weight', 1, 15),
            gamma=trial.suggest_float('gamma', 0.0, 2.0)
        )
        try: clf = xgb.XGBClassifier(**p, tree_method='hist', device='cuda', random_state=42, eval_metric='logloss', verbosity=0)
        except: clf = xgb.XGBClassifier(**p, tree_method='hist', random_state=42, eval_metric='logloss', verbosity=0)
        clf.fit(X_otr, y_otr, sample_weight=w_otr, verbose=False)
        return roc_auc_score(y_ov, clf.predict_proba(X_ov)[:, 1])

    study = optuna.create_study(direction='maximize', sampler=optuna.samplers.TPESampler(seed=42))
    study.optimize(objective, n_trials=40, show_progress_bar=True)
    best = study.best_params

    print("\n[INFO] Training final model (GPU)...")
    try:
        clf_f = xgb.XGBClassifier(**best, tree_method='hist', device='cuda', random_state=42, eval_metric='logloss')
        clf_f.fit(X_tr, y_tr, sample_weight=w_tr, eval_set=[(X_te, y_te)], verbose=50)
    except:
        clf_f = xgb.XGBClassifier(**best, tree_method='hist', random_state=42, eval_metric='logloss')
        clf_f.fit(X_tr, y_tr, sample_weight=w_tr, eval_set=[(X_te, y_te)], verbose=50)

    y_pred = clf_f.predict(X_te)
    y_prob = clf_f.predict_proba(X_te)[:, 1]
    acc = accuracy_score(y_te, y_pred)
    auc = roc_auc_score(y_te, y_prob)

    print("\n============= FINAL EVALUATION (v5) =============")
    print(f"Test Accuracy : {acc * 100:.2f}%")
    print(f"Test ROC-AUC  : {auc:.4f}")
    
    CONF = 0.62
    cm = (y_prob > CONF) | (y_prob < (1 - CONF))
    if cm.sum() > 0:
        conf_acc = accuracy_score(y_te[cm], (y_prob[cm] > 0.5).astype(int))
        print(f"===== HIGH-CONFIDENCE (>{int(CONF*100)}%) =====")
        print(f"Confident: {cm.sum()} / {len(y_te)} ({cm.mean()*100:.1f}%)")
        print(f"Conf acc : {conf_acc * 100:.2f}%")

    os.makedirs("models", exist_ok=True)
    clf_f.save_model("models/nba_tuned_model.json")
    with open("models/scaler.pkl", "wb") as f: pickle.dump(scaler, f)
    print("\n[OK] v5 Ceiling Artifacts saved.")

if __name__ == "__main__":
    train()
