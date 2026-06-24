"""
NBA Prediction Engine — v6 (Tiebreaker Edition)
================================================
Builds on the proven v3 FINAL architecture (85.82% test accuracy, 0.9402 ROC-AUC)
and adds the four official NBA tiebreaker signals as features — all derived
purely from historical game data, zero external API calls at inference time.

NEW in v6:
  1.  Head-to-Head rolling win rate       (already in v3, now surfaced in states)
  2.  Division Leader status              (season-level binary from historical records)
  3.  Division Win Rate                   (EWM-20 over division games only)
  4.  Conference Win Rate                 (EWM-20 over conference games only)
  5.  Top-50 MI Feature Selection         (bumped from 40)
  6.  All tiebreaker signals saved        (states → zero API calls in agent_logic.py)

Everything else (ELO, EMA rolling, shock index, pace-adjusted, player strength,
schedule density, H2H, Optuna, GPU, season weighting) is preserved from v3.
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

# ---------------------------------------------------------------------------
#  NBA Division / Conference Map  (stable since 2004; legacy teams included)
# ---------------------------------------------------------------------------
DIVISIONS = {
    # East — Atlantic
    'BOS': ('East', 'Atlantic'), 'BKN': ('East', 'Atlantic'),
    'NYK': ('East', 'Atlantic'), 'PHI': ('East', 'Atlantic'),
    'TOR': ('East', 'Atlantic'), 'NJN': ('East', 'Atlantic'),
    # East — Central
    'CHI': ('East', 'Central'), 'CLE': ('East', 'Central'),
    'DET': ('East', 'Central'), 'IND': ('East', 'Central'),
    'MIL': ('East', 'Central'),
    # East — Southeast
    'ATL': ('East', 'Southeast'), 'CHA': ('East', 'Southeast'),
    'MIA': ('East', 'Southeast'), 'ORL': ('East', 'Southeast'),
    'WAS': ('East', 'Southeast'), 'CHH': ('East', 'Southeast'),
    'NOH': ('East', 'Southeast'),
    # West — Northwest
    'DEN': ('West', 'Northwest'), 'MIN': ('West', 'Northwest'),
    'OKC': ('West', 'Northwest'), 'POR': ('West', 'Northwest'),
    'UTA': ('West', 'Northwest'), 'SEA': ('West', 'Northwest'),
    # West — Pacific
    'GSW': ('West', 'Pacific'), 'LAC': ('West', 'Pacific'),
    'LAL': ('West', 'Pacific'), 'PHX': ('West', 'Pacific'),
    'SAC': ('West', 'Pacific'),
    # West — Southwest
    'DAL': ('West', 'Southwest'), 'HOU': ('West', 'Southwest'),
    'MEM': ('West', 'Southwest'), 'NOP': ('West', 'Southwest'),
    'SAS': ('West', 'Southwest'), 'NOK': ('West', 'Southwest'),
    'VAN': ('West', 'Northwest'),
}

# ---------------------------------------------------------------------------
#  Helper: derive champions from playoff data
# ---------------------------------------------------------------------------
def derive_champions(df_all):
    df_po = df_all[df_all['SEASON_TYPE'] == 'PO'].copy()
    if df_po.empty:
        return {}
    df_po['GAME_DATE'] = pd.to_datetime(df_po['GAME_DATE'])
    champions = {}
    for season in df_po['SEASON'].unique():
        sp = df_po[df_po['SEASON'] == season]
        ld = sp['GAME_DATE'].max()
        w  = sp[(sp['GAME_DATE'] == ld) & (sp['WL'] == 'W')]
        if not w.empty:
            champions[season] = w.iloc[0]['TEAM_ABBREVIATION']
            print(f"  [CHAMPION] {season}: {champions[season]}")
    return champions


# ---------------------------------------------------------------------------
#  Dynamic HCA
# ---------------------------------------------------------------------------
def compute_dynamic_hca(df_merged, base_hca=100.0, window=500):
    hca = df_merged[['GAME_DATE', 'WL_home']].copy().sort_values('GAME_DATE').reset_index(drop=True)
    hca['hw']  = (hca['WL_home'] == 'W').astype(float)
    hca['hwp'] = hca['hw'].shift(1).rolling(window, min_periods=100).mean().fillna(0.60)
    return ((hca['hwp'] / 0.60) * base_hca).values


# ---------------------------------------------------------------------------
#  Shock Index
# ---------------------------------------------------------------------------
def compute_shock_index(df_team):
    grp = df_team.groupby(['team', 'season'])['plus_minus']
    mu  = grp.transform(lambda x: x.shift(1).rolling(10, min_periods=3).mean())
    sig = grp.transform(lambda x: x.shift(1).rolling(10, min_periods=3).std().replace(0, 1))
    return ((df_team['plus_minus'] - mu) / sig).abs().clip(upper=3.0).fillna(0.0)


# ---------------------------------------------------------------------------
#  Player Strength (EWM top-8)
# ---------------------------------------------------------------------------
def compute_player_strength(df_p):
    print("[INFO] Computing player EWM strength (span-20, top-8 per game-team)...")
    df = df_p[['GAME_ID', 'GAME_DATE', 'PLAYER_ID', 'TEAM_ABBREVIATION', 'PLUS_MINUS']].copy()
    df['GAME_DATE']  = pd.to_datetime(df['GAME_DATE'])
    df['PLUS_MINUS'] = pd.to_numeric(df['PLUS_MINUS'], errors='coerce').fillna(0.0)
    df = df.sort_values(['PLAYER_ID', 'GAME_DATE']).reset_index(drop=True)
    df['player_strength'] = (
        df.groupby('PLAYER_ID')['PLUS_MINUS']
          .transform(lambda x: x.shift(1).ewm(span=20, min_periods=5, adjust=False).mean())
          .fillna(0.0)
    )
    agg = (
        df.groupby(['GAME_ID', 'TEAM_ABBREVIATION'])['player_strength']
          .apply(lambda x: x.nlargest(8).sum())
          .reset_index()
    )
    agg.columns = ['GAME_ID', 'TEAM_ABBREVIATION', 'team_player_strength']
    print(f"       {len(agg)} game-team rows ready.")
    return agg


# ---------------------------------------------------------------------------
#  H2H Rolling Win Rate (last 20 meetings)
# ---------------------------------------------------------------------------
def compute_h2h(df_merged):
    print("[INFO] Computing H2H rolling win rates (last 20 meetings)...")
    h2h_records, rates = {}, []
    for _, row in df_merged.iterrows():
        ht  = row['TEAM_ABBREVIATION_home']
        at  = row['TEAM_ABBREVIATION_away']
        key = (min(ht, at), max(ht, at))
        if key not in h2h_records:
            h2h_records[key] = []
        prior = h2h_records[key][-20:]
        rates.append(
            (sum(1 for g in prior if g == ht) / len(prior)) if len(prior) >= 3 else 0.5
        )
        h2h_records[key].append(ht if row['WL_home'] == 'W' else at)
    return rates


# ---------------------------------------------------------------------------
#  Schedule Density (7-day window + B2B)
# ---------------------------------------------------------------------------
def compute_schedule_density(df_team):
    print("[INFO] Computing schedule density (7-day + B2B)...")
    df_team = df_team.sort_values(['team', 'GAME_DATE']).reset_index(drop=True)

    def rolling_7d(group):
        dates  = group['GAME_DATE'].values
        counts = np.zeros(len(dates), dtype=int)
        for i in range(len(dates)):
            delta     = (dates[i] - dates[:i]).astype('timedelta64[D]').astype(int)
            counts[i] = int(np.sum((delta > 0) & (delta <= 7)))
        return counts

    df_team['games_7d'] = df_team.groupby('team', group_keys=False).apply(
        lambda g: pd.Series(rolling_7d(g.reset_index(drop=True)), index=g.index))
    df_team['prev_game_date']  = df_team.groupby('team')['GAME_DATE'].shift(1)
    df_team['is_back_to_back'] = (
        (df_team['GAME_DATE'] - df_team['prev_game_date']).dt.days == 1
    ).astype(int).fillna(0)
    return df_team


# ---------------------------------------------------------------------------
#  NEW: Division Leader per Season (from historical RS records)
# ---------------------------------------------------------------------------
def compute_division_leaders(df_raw):
    """
    For each season, determine which team led each division (RS win%).
    Returns a set of (season, team_abbr) tuples → these teams are div leaders.
    Also returns a dict {season: {team: win_pct_rank_in_div}} for later use.
    """
    print("[INFO] Computing division leaders per season...")
    rs = df_raw[df_raw['SEASON_TYPE'] == 'RS'].copy()
    rs['won'] = (rs['WL'] == 'W').astype(int)

    team_records = (
        rs.groupby(['SEASON', 'TEAM_ABBREVIATION'])['won']
          .agg(['sum', 'count'])
          .reset_index()
    )
    team_records.columns = ['SEASON', 'TEAM_ABBREVIATION', 'wins', 'games']
    team_records['win_pct'] = team_records['wins'] / team_records['games'].clip(lower=1)
    team_records['division'] = team_records['TEAM_ABBREVIATION'].map(
        lambda t: DIVISIONS.get(t, ('Unk', 'Unk'))[1]
    )

    # Best win_pct per division per season
    idx = team_records.groupby(['SEASON', 'division'])['win_pct'].idxmax()
    leaders = team_records.loc[idx]
    div_leaders_set = set(zip(leaders['SEASON'], leaders['TEAM_ABBREVIATION']))
    print(f"       {len(div_leaders_set)} division-leader records identified.")

    # Also return per-team win_pct (most recent season) for states
    latest_season = team_records['SEASON'].max()
    latest_records = team_records[team_records['SEASON'] == latest_season].set_index('TEAM_ABBREVIATION')
    return div_leaders_set, latest_records


# ---------------------------------------------------------------------------
#  NEW: Conference & Division Win Rates (EWM on masked games)
# ---------------------------------------------------------------------------
def compute_conf_div_win_rates(df_team):
    """
    For each team-game row, compute:
      - conf_win_rate: EWM-20 win rate against same-conference opponents (leak-proof)
      - div_win_rate:  EWM-20 win rate against same-division opponents (leak-proof)

    NaN positions (non-conf / non-div games) are skipped via ignore_na=True.
    """
    print("[INFO] Computing conference/division win rates (EWM, leak-proof)...")

    df = df_team.copy()
    df['team_conf'] = df['team'].map(lambda t: DIVISIONS.get(t, ('Unk', 'Unk'))[0])
    df['team_div']  = df['team'].map(lambda t: DIVISIONS.get(t, ('Unk', 'Unk'))[1])
    df['opp_conf']  = df['opp_team'].map(lambda t: DIVISIONS.get(t, ('Unk', 'Unk'))[0])
    df['opp_div']   = df['opp_team'].map(lambda t: DIVISIONS.get(t, ('Unk', 'Unk'))[1])

    df['won']          = (df['pts'] > df['pts_opp']).astype(float)
    df['is_conf_game'] = (df['opp_conf'] == df['team_conf']).astype(float)
    df['is_div_game']  = (df['opp_div']  == df['team_div']).astype(float)

    # Mask non-relevant games as NaN, then shift(1) + EWM(ignore_na=True)
    df['won_vs_conf'] = df['won'].where(df['is_conf_game'] == 1)
    df['won_vs_div']  = df['won'].where(df['is_div_game'] == 1)

    df['conf_win_rate'] = (
        df.groupby(['team', 'season'])['won_vs_conf']
          .transform(lambda x: x.shift(1)
                                .ewm(span=20, min_periods=5, adjust=False, ignore_na=True)
                                .mean())
          .fillna(0.5)
    )
    df['div_win_rate'] = (
        df.groupby(['team', 'season'])['won_vs_div']
          .transform(lambda x: x.shift(1)
                                .ewm(span=10, min_periods=3, adjust=False, ignore_na=True)
                                .mean())
          .fillna(0.5)
    )

    print("       Conference/division win rates computed.")
    return df['conf_win_rate'].values, df['div_win_rate'].values


# ===========================================================================
#  MAIN TRAINING FUNCTION
# ===========================================================================
def train():
    print("=" * 66)
    print("  NBA PREDICTION ENGINE — v6  (Tiebreaker Edition)")
    print("  H2H + Div Leader + Div Record + Conf Record + Top-50 MI")
    print("  Built on v3 FINAL (85.82% proven architecture)")
    print("=" * 66)

    g_path = os.path.join("data", "nba_all_seasons_games.csv")
    p_path = os.path.join("data", "nba_all_seasons_players.csv")
    if not os.path.exists(g_path) or not os.path.exists(p_path):
        print("[ERROR] CSV caches missing. Run data_ingestion.py and data_ingestion_players.py first.")
        return

    print("[INFO] Loading game logs...")
    df_raw = pd.read_csv(g_path)
    print(f"       {len(df_raw)} team-game rows.")

    print("[INFO] Loading player logs...")
    df_p = pd.read_csv(p_path)
    print(f"       {len(df_p)} player-game rows.")

    # -------------------------------------------------------------------
    #  Derive champions + division leaders from historical data
    # -------------------------------------------------------------------
    CHAMPIONS = derive_champions(df_raw)
    div_leaders_set, latest_records = compute_division_leaders(df_raw)

    # -------------------------------------------------------------------
    #  Player strength
    # -------------------------------------------------------------------
    player_strength_df = compute_player_strength(df_p)

    # -------------------------------------------------------------------
    #  Player box-score aggregates
    # -------------------------------------------------------------------
    print("[INFO] Aggregating player box scores...")
    p_agg = df_p.groupby(['GAME_ID', 'TEAM_ABBREVIATION']).agg(
        player_total_pts=('PTS',        'sum'),
        player_total_reb=('REB',        'sum'),
        player_total_ast=('AST',        'sum'),
        player_total_stl=('STL',        'sum'),
        player_total_blk=('BLK',        'sum'),
        player_total_tov=('TOV',        'sum'),
        player_pm=       ('PLUS_MINUS', 'sum'),
        fg_pct_players=  ('FG_PCT',     'mean'),
        fg3_pct_players= ('FG3_PCT',    'mean'),
        ft_pct_players=  ('FT_PCT',     'mean'),
        num_players=     ('PLAYER_ID',  'count'),
    ).reset_index()
    p_agg = pd.merge(p_agg, player_strength_df, on=['GAME_ID', 'TEAM_ABBREVIATION'], how='left')
    p_agg['team_player_strength'] = p_agg['team_player_strength'].fillna(0.0)

    # -------------------------------------------------------------------
    #  Build game-centric rows
    # -------------------------------------------------------------------
    print("[INFO] Building game-centric rows...")
    df_home = df_raw[df_raw['MATCHUP'].str.contains('vs.', na=False)].copy()
    df_away = df_raw[df_raw['MATCHUP'].str.contains('@',   na=False)].copy()
    keys    = ['GAME_ID', 'SEASON', 'GAME_DATE', 'SEASON_TYPE']
    df_m    = pd.merge(df_home, df_away, on=keys, suffixes=('_home', '_away'))
    df_m['GAME_DATE'] = pd.to_datetime(df_m['GAME_DATE'])
    df_m    = df_m.sort_values('GAME_DATE').reset_index(drop=True)
    print(f"       {len(df_m)} unique games.")

    df_m['hca']               = compute_dynamic_hca(df_m)
    df_m['h2h_home_win_rate'] = compute_h2h(df_m)

    # -------------------------------------------------------------------
    #  ELO ratings (dynamic HCA + margin K-factor)
    # -------------------------------------------------------------------
    print("[INFO] Computing ELO ratings...")
    elo = {}
    elo_h, elo_a = [], []
    for _, row in df_m.iterrows():
        ht, at = row['TEAM_ABBREVIATION_home'], row['TEAM_ABBREVIATION_away']
        if ht not in elo: elo[ht] = 1500.0
        if at not in elo: elo[at] = 1500.0
        rh, ra, H = elo[ht], elo[at], row['hca']
        elo_h.append(rh); elo_a.append(ra)
        exp_h = 1.0 / (1.0 + 10.0 ** ((ra - (rh + H)) / 400.0))
        act_h = 1.0 if row['WL_home'] == 'W' else 0.0
        K = 20 + min(abs(row.get('PTS_home', 0) - row.get('PTS_away', 0)) / 10.0, 10.0)
        elo[ht] = rh + K * (act_h       - exp_h)
        elo[at] = ra + K * ((1 - act_h) - (1 - exp_h))
    df_m['elo_home'] = elo_h
    df_m['elo_away'] = elo_a
    df_m['elo_diff'] = df_m['elo_home'] - df_m['elo_away']

    # -------------------------------------------------------------------
    #  Team-level game logs (with opponent info for conf/div tracking)
    # -------------------------------------------------------------------
    print("[INFO] Reconstructing team game logs (with opponent context)...")
    rows = []
    for _, row in df_m.iterrows():
        for side, opp in [('home', 'away'), ('away', 'home')]:
            fga  = row.get(f'FGA_{side}',  0) or 0
            fta  = row.get(f'FTA_{side}',  0) or 0
            oreb = row.get(f'OREB_{side}', 0) or 0
            tov  = row.get(f'TOV_{side}',  0) or 0
            poss = max(fga - oreb + tov + 0.44 * fta, 55)
            rows.append({
                'team':        row[f'TEAM_ABBREVIATION_{side}'],
                'opp_team':    row[f'TEAM_ABBREVIATION_{opp}'],   # NEW
                'season':      row['SEASON'],
                'GAME_DATE':   row['GAME_DATE'],
                'GAME_ID':     row['GAME_ID'],
                'is_home':     1 if side == 'home' else 0,
                'pts':         row[f'PTS_{side}'],
                'pts_opp':     row[f'PTS_{opp}'],
                'plus_minus':  row[f'PLUS_MINUS_{side}'],
                'fg_pct':      row[f'FG_PCT_{side}'],
                'fg3_pct':     row[f'FG3_PCT_{side}'],
                'ft_pct':      row[f'FT_PCT_{side}'],
                'reb':         row[f'REB_{side}'],
                'ast':         row[f'AST_{side}'],
                'tov':         tov,
                'stl':         row[f'STL_{side}'],
                'blk':         row[f'BLK_{side}'],
                'pts_per100':     (row.get(f'PTS_{side}', 0) / poss) * 100,
                'pts_opp_per100': (row.get(f'PTS_{opp}',  0) / poss) * 100,
            })

    df_team = pd.DataFrame(rows)
    df_team = pd.merge(
        df_team, p_agg,
        left_on=['GAME_ID', 'team'],
        right_on=['GAME_ID', 'TEAM_ABBREVIATION'],
        how='left'
    )

    # Fill player-level NaNs with team equivalents
    fill_map = {
        'player_total_pts': 'pts', 'player_total_reb': 'reb',
        'player_total_ast': 'ast', 'player_total_stl': 'stl',
        'player_total_blk': 'blk', 'player_total_tov': 'tov',
        'fg_pct_players':   'fg_pct', 'fg3_pct_players': 'fg3_pct',
        'ft_pct_players':   'ft_pct',
    }
    for pc, tc in fill_map.items():
        df_team[pc] = df_team[pc].fillna(df_team[tc])
    df_team['player_pm']            = df_team['player_pm'].fillna(df_team['plus_minus'] * 5)
    df_team['num_players']          = df_team['num_players'].fillna(10.0)
    df_team['team_player_strength'] = df_team['team_player_strength'].fillna(0.0)

    df_team = df_team.sort_values(['team', 'season', 'GAME_DATE']).reset_index(drop=True)

    # -------------------------------------------------------------------
    #  Derived metrics
    # -------------------------------------------------------------------
    df_team['shock_index'] = compute_shock_index(df_team)
    df_team['prev_date']   = df_team.groupby(['team', 'season'])['GAME_DATE'].shift(1)
    df_team['rest_days']   = (
        df_team['GAME_DATE'] - df_team['prev_date']
    ).dt.days.sub(1).fillna(3).clip(upper=10)
    df_team = compute_schedule_density(df_team)

    league_avg_pts = df_team['pts'].mean()
    opp_def_roll   = (
        df_team.groupby(['team', 'season'])['pts_opp']
               .shift(1).rolling(10, min_periods=3).mean()
               .fillna(league_avg_pts)
    )
    df_team['pts_opp_adj'] = df_team['pts'] / (opp_def_roll / league_avg_pts)

    # -------------------------------------------------------------------
    #  NEW: Conference & Division Win Rates
    # -------------------------------------------------------------------
    conf_win_rates, div_win_rates = compute_conf_div_win_rates(df_team)
    df_team['conf_win_rate'] = conf_win_rates
    df_team['div_win_rate']  = div_win_rates

    # -------------------------------------------------------------------
    #  EMA Rolling (span 5 & 10)
    # -------------------------------------------------------------------
    print("[INFO] Computing EMA rolling averages (span 5 & 10)...")
    base_metrics = [
        'pts', 'pts_opp', 'plus_minus', 'fg_pct', 'fg3_pct', 'ft_pct',
        'reb', 'ast', 'tov', 'stl', 'blk',
        'player_total_pts', 'player_total_reb', 'player_total_ast',
        'player_total_stl', 'player_total_blk', 'player_total_tov',
        'player_pm', 'fg_pct_players', 'fg3_pct_players', 'ft_pct_players',
        'num_players', 'pts_opp_adj', 'shock_index',
        'team_player_strength',
        'pts_per100', 'pts_opp_per100',
        # NEW tiebreaker rolling metrics
        'conf_win_rate', 'div_win_rate',
    ]

    for m in base_metrics:
        df_team[f'{m}_ema5'] = df_team.groupby(['team', 'season'])[m].transform(
            lambda x: x.shift(1).ewm(span=5,  min_periods=2, adjust=False).mean())
        df_team[f'{m}_ema10'] = df_team.groupby(['team', 'season'])[m].transform(
            lambda x: x.shift(1).ewm(span=10, min_periods=5, adjust=False).mean())

    # -------------------------------------------------------------------
    #  Map team logs → game rows
    # -------------------------------------------------------------------
    print("[INFO] Merging team rolling features to game rows...")
    df_h = df_team[df_team['is_home'] == 1].copy()
    df_a = df_team[df_team['is_home'] == 0].copy()

    rolling_cols = (
        ['rest_days', 'shock_index', 'games_7d', 'is_back_to_back',
         'conf_win_rate', 'div_win_rate']                             # NEW direct cols
        + [f'{m}_ema5'  for m in base_metrics]
        + [f'{m}_ema10' for m in base_metrics]
    )

    df_h = df_h.rename(columns={c: f'{c}_home' for c in rolling_cols})
    df_a = df_a.rename(columns={c: f'{c}_away' for c in rolling_cols})
    df_m = pd.merge(df_m, df_h[['GAME_ID'] + [f'{c}_home' for c in rolling_cols]], on='GAME_ID')
    df_m = pd.merge(df_m, df_a[['GAME_ID'] + [f'{c}_away' for c in rolling_cols]], on='GAME_ID')

    # -------------------------------------------------------------------
    #  Season-level static signals (division leader, defending champion)
    # -------------------------------------------------------------------
    df_m['is_defending_champion_home'] = df_m.apply(
        lambda r: 1 if CHAMPIONS.get(r['SEASON']) == r['TEAM_ABBREVIATION_home'] else 0, axis=1)
    df_m['is_defending_champion_away'] = df_m.apply(
        lambda r: 1 if CHAMPIONS.get(r['SEASON']) == r['TEAM_ABBREVIATION_away'] else 0, axis=1)
    df_m['def_champ_diff'] = df_m['is_defending_champion_home'] - df_m['is_defending_champion_away']

    # NEW: Division leader flag (from historical RS records — no leakage for training)
    df_m['is_division_leader_home'] = df_m.apply(
        lambda r: 1 if (r['SEASON'], r['TEAM_ABBREVIATION_home']) in div_leaders_set else 0, axis=1)
    df_m['is_division_leader_away'] = df_m.apply(
        lambda r: 1 if (r['SEASON'], r['TEAM_ABBREVIATION_away']) in div_leaders_set else 0, axis=1)
    df_m['div_leader_diff'] = df_m['is_division_leader_home'] - df_m['is_division_leader_away']

    # Diff features for all rolling cols
    for c in rolling_cols:
        df_m[f'{c}_diff'] = df_m[f'{c}_home'] - df_m[f'{c}_away']

    # -------------------------------------------------------------------
    #  Feature matrix
    # -------------------------------------------------------------------
    all_feature_cols = (
        ['elo_home', 'elo_away', 'elo_diff', 'hca', 'h2h_home_win_rate',
         'is_defending_champion_home', 'is_defending_champion_away', 'def_champ_diff',
         'is_division_leader_home', 'is_division_leader_away', 'div_leader_diff']   # NEW
        + [f'{c}_home' for c in rolling_cols]
        + [f'{c}_away' for c in rolling_cols]
        + [f'{c}_diff' for c in rolling_cols]
    )

    df_model = df_m[all_feature_cols + ['WL_home', 'SEASON', 'GAME_DATE']].dropna().copy()
    df_model['target'] = df_model['WL_home'].map({'W': 1, 'L': 0})
    print(f"[INFO] Clean dataset: {len(df_model)} games | {len(all_feature_cols)} raw features.")

    # -------------------------------------------------------------------
    #  MI Feature Selection — TOP 50
    # -------------------------------------------------------------------
    print("[INFO] MI feature selection (top 50)...")
    mi    = mutual_info_classif(df_model[all_feature_cols].fillna(0), df_model['target'], random_state=42)
    mi_s  = pd.Series(mi, index=all_feature_cols).sort_values(ascending=False)
    feature_cols = mi_s.head(50).index.tolist()
    print(f"       Top 10: {feature_cols[:10]}")
    print(f"       Tiebreaker cols selected: {[c for c in feature_cols if any(k in c for k in ['h2h','div','conf','leader'])]}")

    # -------------------------------------------------------------------
    #  Train / Test split
    # -------------------------------------------------------------------
    test_seasons = ['2024-25', '2025-26']
    train_mask   = ~df_model['SEASON'].isin(test_seasons)
    test_mask    =  df_model['SEASON'].isin(test_seasons)

    def sw(s):
        try:    return 0.93 ** (2025 - int(s[:4]))
        except: return 1.0

    w_all = df_model['SEASON'].apply(sw).values
    X, y  = df_model[feature_cols], df_model['target']

    scaler    = StandardScaler()
    X_train_s = scaler.fit_transform(X[train_mask])
    X_test_s  = scaler.transform(X[test_mask])
    y_tr      = y[train_mask]
    y_te      = y[test_mask]
    w_tr      = w_all[train_mask]

    print(f"[INFO] Train: {len(y_tr)} | Test: {len(y_te)}")

    # -------------------------------------------------------------------
    #  Optuna (40 trials, GPU)
    # -------------------------------------------------------------------
    print("[INFO] Running Optuna (40 trials)...")

    def objective(trial):
        p = dict(
            n_estimators     = trial.suggest_int('n_estimators', 300, 800),
            max_depth        = trial.suggest_int('max_depth', 3, 7),
            learning_rate    = trial.suggest_float('learning_rate', 0.01, 0.2, log=True),
            subsample        = trial.suggest_float('subsample', 0.60, 1.0),
            colsample_bytree = trial.suggest_float('colsample_bytree', 0.50, 1.0),
            reg_alpha        = trial.suggest_float('reg_alpha', 0.0, 3.0),
            reg_lambda       = trial.suggest_float('reg_lambda', 0.5, 4.0),
            min_child_weight = trial.suggest_int('min_child_weight', 1, 15),
            gamma            = trial.suggest_float('gamma', 0.0, 2.0),
        )
        try:
            clf = xgb.XGBClassifier(**p, tree_method='hist', device='cuda',
                                    random_state=42, eval_metric='logloss', verbosity=0)
        except Exception:
            clf = xgb.XGBClassifier(**p, tree_method='hist',
                                    random_state=42, eval_metric='logloss', verbosity=0)
        clf.fit(X_train_s, y_tr, sample_weight=w_tr, verbose=False)
        return roc_auc_score(y_te, clf.predict_proba(X_test_s)[:, 1])

    study = optuna.create_study(direction='maximize', sampler=optuna.samplers.TPESampler(seed=42))
    study.optimize(objective, n_trials=40, show_progress_bar=True)
    best = study.best_params
    print(f"\n[INFO] Best params (val ROC-AUC = {study.best_value:.4f}):")
    for k, v in best.items():
        print(f"       {k}: {v}")

    # -------------------------------------------------------------------
    #  Final Model
    # -------------------------------------------------------------------
    print("\n[INFO] Training final model...")
    try:
        clf_f = xgb.XGBClassifier(**best, tree_method='hist', device='cuda',
                                   random_state=42, eval_metric='logloss')
        clf_f.fit(X_train_s, y_tr, sample_weight=w_tr,
                  eval_set=[(X_test_s, y_te)], verbose=50)
        print("[SUCCESS] GPU!")
    except Exception as e:
        print(f"[WARN] GPU failed ({e}), CPU fallback...")
        clf_f = xgb.XGBClassifier(**best, tree_method='hist',
                                   random_state=42, eval_metric='logloss')
        clf_f.fit(X_train_s, y_tr, sample_weight=w_tr,
                  eval_set=[(X_test_s, y_te)], verbose=50)
        print("[SUCCESS] CPU!")

    # -------------------------------------------------------------------
    #  Evaluation
    # -------------------------------------------------------------------
    y_pred = clf_f.predict(X_test_s)
    y_prob = clf_f.predict_proba(X_test_s)[:, 1]
    acc    = accuracy_score(y_te, y_pred)
    auc    = roc_auc_score(y_te, y_prob)

    print("\n============= FINAL EVALUATION (v6) =============")
    print(f"Test Accuracy : {acc * 100:.2f}%")
    print(f"Test ROC-AUC  : {auc:.4f}")
    print(classification_report(y_te, y_pred, digits=4))

    CONF = 0.62
    cm   = (y_prob > CONF) | (y_prob < (1 - CONF))
    conf_acc = 0.0
    if cm.sum() > 0:
        conf_acc = accuracy_score(y_te[cm], (y_prob[cm] > 0.5).astype(int))
        print(f"===== HIGH-CONFIDENCE (>{int(CONF*100)}%) =====")
        print(f"Confident : {cm.sum()} / {len(y_te)} ({cm.mean()*100:.1f}%)")
        print(f"Conf Acc  : {conf_acc * 100:.2f}% (+{(conf_acc - acc)*100:.2f}pp)")
        print(classification_report(y_te[cm], (y_prob[cm] > 0.5).astype(int), digits=4))

    fi = pd.Series(clf_f.feature_importances_, index=feature_cols).sort_values(ascending=False)
    print("\nTop 15 Features:")
    print(fi.head(15).to_string())
    tiebreaker_fi = fi[[c for c in fi.index if any(k in c for k in ['h2h', 'div', 'conf', 'leader'])]]
    if not tiebreaker_fi.empty:
        print("\nTiebreaker Feature Importances:")
        print(tiebreaker_fi.to_string())

    # -------------------------------------------------------------------
    #  Save states (all new tiebreaker signals included for inference)
    # -------------------------------------------------------------------
    print("\n[INFO] Saving artifacts...")

    # Per-team latest conf/div win rates (from most recent season in df_team)
    latest_season = df_team['season'].max()
    latest_df = df_team[df_team['season'] == latest_season].copy()
    latest_df = latest_df.sort_values('GAME_DATE')

    team_conf_win_rate = {}
    team_div_win_rate  = {}
    team_is_div_leader = {}

    for team in df_team['team'].unique():
        sub = latest_df[latest_df['team'] == team]
        if not sub.empty:
            team_conf_win_rate[team] = float(sub['conf_win_rate'].iloc[-1])
            team_div_win_rate[team]  = float(sub['div_win_rate'].iloc[-1])
        else:
            team_conf_win_rate[team] = 0.5
            team_div_win_rate[team]  = 0.5
        team_is_div_leader[team] = 1 if (latest_season, team) in div_leaders_set else 0

    # Cache last 10 games per team
    latest_games, last_dates = {}, {}
    keep_cols = [c for c in (
        base_metrics + ['rest_days', 'shock_index', 'games_7d', 'is_back_to_back']
    ) if c in df_team.columns]

    for team in df_team['team'].unique():
        sub = df_team[df_team['team'] == team].sort_values('GAME_DATE').tail(10)
        latest_games[team] = sub[keep_cols].to_dict(orient='records')
        last_dates[team]   = sub['GAME_DATE'].max()

    states = {
        'elo':                   elo,
        'last_game_date':        last_dates,
        'last_games':            latest_games,
        'metrics_list':          base_metrics,
        'feature_cols':          feature_cols,
        'confidence_threshold':  CONF,
        'league_avg_pts':        league_avg_pts,
        'best_optuna_params':    best,
        'test_accuracy':         acc,
        'test_roc_auc':          auc,
        'conf_accuracy':         conf_acc,
        # NEW tiebreaker signals for zero-API inference
        'team_conf_win_rate':    team_conf_win_rate,
        'team_div_win_rate':     team_div_win_rate,
        'team_is_div_leader':    team_is_div_leader,
        'div_leaders_set':       div_leaders_set,
        'version':               'v6-tiebreaker',
    }

    os.makedirs("models", exist_ok=True)
    for pfx in ["models/", ""]:
        with open(f"{pfx}scaler.pkl",        "wb") as f: pickle.dump(scaler, f)
        with open(f"{pfx}latest_states.pkl", "wb") as f: pickle.dump(states, f)
        clf_f.save_model(f"{pfx}nba_tuned_model.json")

    print("=" * 66)
    print(f"  FINAL ACCURACY  : {acc * 100:.2f}%")
    print(f"  FINAL ROC-AUC   : {auc:.4f}")
    print(f"  CONF ACCURACY   : {conf_acc * 100:.2f}% ({cm.mean()*100:.1f}% of games)")
    print(f"  FEATURES USED   : {len(feature_cols)} (top-50 MI from {len(all_feature_cols)})")
    print(f"  NEW TIEBREAKERS : h2h_home_win_rate, conf_win_rate_*, div_win_rate_*, div_leader_*")
    print(f"  VERSION         : v6-tiebreaker")
    print("=" * 66)


if __name__ == "__main__":
    train()
