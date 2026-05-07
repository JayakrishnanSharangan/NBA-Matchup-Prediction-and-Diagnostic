import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

# ─────────────────────────────────────────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────────────────────────────────────────
DATA_URL = (
    "https://raw.githubusercontent.com/fivethirtyeight/data/master/"
    "nba-elo/nbaallelo.csv"
)
LAKERS_SLUGS = {"LAL", "LALakers"}   # FiveThirtyEight uses "LAL"
MOCK_DATE    = "2025-12-25"
MOCK_OPP     = "Houston Rockets"


# ─────────────────────────────────────────────────────────────────────────────
#  TERMINAL DASHBOARD HELPERS
# ─────────────────────────────────────────────────────────────────────────────
W  = 68          # dashboard width
DIV = "─" * W

def banner(text: str, char: str = "═") -> None:
    print(char * W)
    print(f"  {text}")
    print(char * W)

def row(label: str, value, color_code: str = "") -> None:
    reset = "\033[0m"
    pad   = W - len(label) - len(str(value)) - 6
    print(f"  {color_code}{label}{reset}{'·' * max(pad, 1)}{color_code}{value}{reset}")

def section(title: str) -> None:
    print(f"\n  \033[1;36m▸ {title}\033[0m")
    print("  " + DIV)


# ─────────────────────────────────────────────────────────────────────────────
#  MAIN AGENT
# ─────────────────────────────────────────────────────────────────────────────
def run_agent():

    # ── Header ───────────────────────────────────────────────────────────────
    print()
    banner("🏀  LAKERS ML PREDICTION ENGINE  ·  Phase 5 Automated Pipeline  🏀",
           char="═")
    print()

    # ── 1. Pull public CSV via URL ────────────────────────────────────────────
    section("DATA INGESTION  (FiveThirtyEight Public NBA Elo Dataset)")
    print(f"  Fetching → {DATA_URL[:60]}…")

    try:
        df_raw = pd.read_csv(DATA_URL, low_memory=False)
    except Exception as exc:
        print(f"\n  \033[1;31m[FATAL] Could not fetch dataset: {exc}\033[0m\n")
        return

    print(f"  \033[32m✔  Loaded {len(df_raw):,} rows × {len(df_raw.columns)} columns\033[0m")

    # ── 2. Filter for Lakers ──────────────────────────────────────────────────
    section("FILTERING  —  Los Angeles Lakers Games")
    lakers_mask = df_raw["team_id"].isin(LAKERS_SLUGS)
    df = df_raw[lakers_mask].copy()
    print(f"  \033[32m✔  {len(df):,} Lakers game records found\033[0m")

    # ── 3. Feature Engineering ────────────────────────────────────────────────
    section("FEATURE ENGINEERING")

    # Identify score and elo columns dynamically
    score_col = next((c for c in df.columns if "pts" in c.lower() or "score" in c.lower()), None)
    elo_col   = next((c for c in df.columns if "elo" in c.lower() and "opp" not in c.lower()), None)
    opp_elo   = next((c for c in df.columns if "elo" in c.lower() and "opp" in c.lower()), None)

    # Home/Away flag  ("home" column is 1 if home, 0 if away in this dataset)
    if "is_home" in df.columns:
        df["Is_Home"] = df["is_home"].fillna(0).astype(int)
    elif "home" in df.columns:
        df["Is_Home"] = df["home"].fillna(0).astype(int)
    else:
        df["Is_Home"] = 0

    # Win/Loss label
    if "game_result" in df.columns:
        df["Win"] = df["game_result"].map({"W": 1, "L": 0})
    elif "score" in df.columns and "opp_score" in df.columns:
        df["Win"] = (df["score"] > df["opp_score"]).astype(int)
    else:
        # Fallback: assume column named 'pts' vs 'opp_pts'
        score_col_fb = next((c for c in df.columns if c.lower() in ("pts", "score")), None)
        opp_col_fb   = next((c for c in df.columns if c.lower() in ("opp_pts", "opp_score")), None)
        if score_col_fb and opp_col_fb:
            df["Win"] = (df[score_col_fb] > df[opp_col_fb]).astype(int)
        else:
            print("  \033[33m[WARN] Win/Loss column not resolved; using synthetic fallback.\033[0m")
            df["Win"] = 0

    df["Win"] = df["Win"].fillna(0).astype(int)

    # Build feature matrix
    feature_cols = []

    if elo_col and elo_col in df.columns:
        df[elo_col] = pd.to_numeric(df[elo_col], errors="coerce")
        df[elo_col].fillna(df[elo_col].median(), inplace=True)
        feature_cols.append(elo_col)

    if opp_elo and opp_elo in df.columns:
        df[opp_elo] = pd.to_numeric(df[opp_elo], errors="coerce")
        df[opp_elo].fillna(df[opp_elo].median(), inplace=True)
        feature_cols.append(opp_elo)

    if score_col and score_col in df.columns:
        df[score_col] = pd.to_numeric(df[score_col], errors="coerce")
        df[score_col].fillna(df[score_col].median(), inplace=True)
        feature_cols.append(score_col)

    feature_cols.append("Is_Home")

    print(f"  Features selected  : {feature_cols}")
    print(f"  Label              : Win  (1 = W, 0 = L)")

    # ── 4. Handle Missing Data ────────────────────────────────────────────────
    df_model = df[feature_cols + ["Win"]].dropna()
    print(f"  Clean samples      : {len(df_model):,}")

    if len(df_model) < 50:
        print("  \033[1;31m[ERROR] Insufficient data after cleaning. Aborting.\033[0m\n")
        return

    # ── 5. Train / Evaluate ───────────────────────────────────────────────────
    section("MODEL TRAINING  —  Random Forest Classifier")

    X = df_model[feature_cols]
    y = df_model["Win"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    clf = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)
    clf.fit(X_train, y_train)

    accuracy = accuracy_score(y_test, clf.predict(X_test))
    print(f"  \033[32m✔  Training complete  ({len(X_train):,} samples)\033[0m")

    # ── 6. Mock Prediction — Christmas Day Home Game ──────────────────────────
    section(f"MOCK PREDICTION  —  Christmas Day Home Game vs {MOCK_OPP}")

    # Build a hypothetical feature row:
    #   • Team Elo  ~ 99th-percentile Lakers Elo from history (elite home form)
    #   • Opp Elo   ~ league-average
    #   • Score     ~ Lakers recent scoring average
    #   • Is_Home   = 1
    mock_vals = {}
    for col in feature_cols:
        if col == "Is_Home":
            mock_vals[col] = 1
        elif "opp" in col.lower():
            mock_vals[col] = float(df[col].mean())
        else:
            mock_vals[col] = float(df[col].quantile(0.72))   # above-average

    X_mock = pd.DataFrame([mock_vals])
    prob       = clf.predict_proba(X_mock)[0]
    win_prob   = round(prob[1] * 100, 2)
    prediction = "WIN  🏆" if win_prob >= 50 else "LOSS  ❌"

    # ── 7. Stylised Terminal Dashboard ────────────────────────────────────────
    print()
    print("═" * W)
    print(f"  \033[1;37m{'FINAL ANALYSIS DASHBOARD':^{W-2}}\033[0m")
    print("═" * W)

    print()
    row("  📅  Prediction Date",     MOCK_DATE,            "\033[1;33m")
    row("  🏠  Venue",               "Crypto.com Arena (HOME)", "\033[1;33m")
    row("  🆚  Opponent",            MOCK_OPP,             "\033[1;33m")
    print()
    row("  📊  Model",               "Random Forest (200 trees)", "\033[1;36m")
    row("  🧮  Training Samples",    f"{len(X_train):,}",  "\033[1;36m")
    row("  📐  Features Used",       len(feature_cols),    "\033[1;36m")

    acc_color = "\033[1;32m" if accuracy >= 0.60 else "\033[1;33m"
    row("  🎯  Model Accuracy",      f"{accuracy * 100:.2f} %",  acc_color)

    print()
    print("  " + "─" * (W - 2))
    pred_color = "\033[1;32m" if win_prob >= 50 else "\033[1;31m"
    row("  🏀  Win Probability",     f"{win_prob} %",      pred_color)
    row("  🔮  Final Prediction",    prediction,           pred_color)
    print("  " + "─" * (W - 2))
    print()
    print("═" * W)
    print(f"  \033[1;35m  ★  Pipeline Status: OPERATIONAL  |  Source: FiveThirtyEight Public CSV  ★\033[0m")
    print("═" * W)
    print()


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    run_agent()
