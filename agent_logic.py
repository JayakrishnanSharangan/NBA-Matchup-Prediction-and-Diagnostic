import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# -----------------------------------------------------------------------------
#  FastAPI Application
# -----------------------------------------------------------------------------
app = FastAPI(
    title="NBA Lakers ML Prediction API",
    description="Microservice wrapping a Random Forest classifier for Lakers game predictions.",
    version="7.0.0",
)

# Allow CORS for the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
#  CONFIG
# -----------------------------------------------------------------------------
DATA_URL = (
    "https://raw.githubusercontent.com/fivethirtyeight/data/master/"
    "nba-elo/nbaallelo.csv"
)
LAKERS_SLUGS = {"LAL", "LALakers"}
MOCK_DATE    = "2025-12-25"
MOCK_OPP     = "Houston Rockets"


# -----------------------------------------------------------------------------
#  ML ENGINE (Pandas ingestion + Scikit-Learn Random Forest)
# -----------------------------------------------------------------------------
def run_prediction():
    """
    Full ML pipeline: ingest data, feature-engineer, train a Random Forest,
    and return prediction results as a dictionary.
    """

    # 1. Pull public CSV
    df_raw = pd.read_csv(DATA_URL, low_memory=False)

    # 2. Filter for Lakers
    lakers_mask = df_raw["team_id"].isin(LAKERS_SLUGS)
    df = df_raw[lakers_mask].copy()

    # 3. Feature Engineering
    score_col = next((c for c in df.columns if "pts" in c.lower() or "score" in c.lower()), None)
    elo_col   = next((c for c in df.columns if "elo" in c.lower() and "opp" not in c.lower()), None)
    opp_elo   = next((c for c in df.columns if "elo" in c.lower() and "opp" in c.lower()), None)

    # Home/Away flag
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
        score_col_fb = next((c for c in df.columns if c.lower() in ("pts", "score")), None)
        opp_col_fb   = next((c for c in df.columns if c.lower() in ("opp_pts", "opp_score")), None)
        if score_col_fb and opp_col_fb:
            df["Win"] = (df[score_col_fb] > df[opp_col_fb]).astype(int)
        else:
            df["Win"] = 0

    df["Win"] = df["Win"].fillna(0).astype(int)

    # Build feature matrix
    feature_cols = []

    if elo_col and elo_col in df.columns:
        df[elo_col] = pd.to_numeric(df[elo_col], errors="coerce")
        df[elo_col] = df[elo_col].fillna(df[elo_col].median())
        feature_cols.append(elo_col)

    if opp_elo and opp_elo in df.columns:
        df[opp_elo] = pd.to_numeric(df[opp_elo], errors="coerce")
        df[opp_elo] = df[opp_elo].fillna(df[opp_elo].median())
        feature_cols.append(opp_elo)

    if score_col and score_col in df.columns:
        df[score_col] = pd.to_numeric(df[score_col], errors="coerce")
        df[score_col] = df[score_col].fillna(df[score_col].median())
        feature_cols.append(score_col)

    feature_cols.append("Is_Home")

    # 4. Handle Missing Data
    df_model = df[feature_cols + ["Win"]].dropna()

    if len(df_model) < 50:
        return {"error": "Insufficient data after cleaning."}

    # 5. Train / Evaluate
    X = df_model[feature_cols]
    y = df_model["Win"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    clf = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)
    clf.fit(X_train, y_train)

    accuracy = accuracy_score(y_test, clf.predict(X_test))

    # 6. Mock Prediction — Christmas Day Home Game
    mock_vals = {}
    for col in feature_cols:
        if col == "Is_Home":
            mock_vals[col] = 1
        elif "opp" in col.lower():
            mock_vals[col] = float(df[col].mean())
        else:
            mock_vals[col] = float(df[col].quantile(0.72))

    X_mock = pd.DataFrame([mock_vals])
    prob       = clf.predict_proba(X_mock)[0]
    win_prob   = round(prob[1] * 100, 2)
    prediction = "WIN" if win_prob >= 50 else "LOSS"

    return {
        "team": "Los Angeles Lakers",
        "prediction": prediction,
        "win_probability": win_prob,
        "accuracy": round(accuracy * 100, 2),
        "opponent": MOCK_OPP,
        "game_date": MOCK_DATE,
        "model": "Random Forest (200 trees)",
        "training_samples": len(X_train),
        "features_used": len(feature_cols),
    }


# -----------------------------------------------------------------------------
#  API ENDPOINT
# -----------------------------------------------------------------------------
@app.get("/predict")
def predict():
    """Execute the ML pipeline and return prediction as JSON."""
    result = run_prediction()
    return result
