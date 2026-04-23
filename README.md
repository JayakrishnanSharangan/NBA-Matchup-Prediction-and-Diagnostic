# 🏀 NBA Prediction Agent: Lakers ML Model

**Status: ✅ Completed Script**

A Python-based predictive agent that uses historical game data and machine learning to forecast the win probability of the Los Angeles Lakers for specific matchups.

## 🧠 Project Overview
The agent focuses on predicting the outcome of the Lakers' game on **Christmas Day 2025** (vs. Houston Rockets). It fetches real-time data using the `nba_api`, processes historical performance trends, and trains a Random Forest model to generate win probabilities.

## ✨ Key Features
- **Real-time Data Fetching**: Utilizes `nba_api` to retrieve team game logs and scoreboards.
- **Dynamic Feature Engineering**: Computes rolling averages (PTS_5g_avg) and home/away status as model features.
- **Machine Learning Integration**: Implements a `RandomForestClassifier` for binary classification (Win/Loss).
- **Automated Prediction Dashboard**: Outputs predictions into a `dashboard_data.json` for easy visualization integration.

## 🧰 Tech Stack
- **Language**: Python 3
- **Data Handling**: Pandas, JSON
- **Machine Learning**: Scikit-Learn (Random Forest)
- **NBA Data**: `nba_api`

## 🚀 Setup & Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the prediction agent:
   ```bash
   python agent_logic.py
   ```
4. View the results in `dashboard_data.json`.

## 📈 Model Rationale
The model prioritizes short-term momentum (5-game rolling point averages) and the "home court advantage" factor, which are statistically significant indicators in regular-season NBA performances.
