import pickle

with open("latest_states.pkl", "rb") as f:
    states = pickle.load(f)

last_games_lal = states['last_games'].get('LAL', [])
print(f"Number of cached games for LAL: {len(last_games_lal)}")
print("\nFirst 3 cached games for LAL:")
for i, g in enumerate(last_games_lal[:3]):
    print(f"Game {i+1}: {g}")

print("\nLast 3 cached games for LAL:")
for i, g in enumerate(last_games_lal[-3:]):
    print(f"Game {len(last_games_lal)-2+i}: {g}")

# Check HOU ELO and champion states if any
print(f"\nELO LAL: {states['elo'].get('LAL')}")
print(f"ELO HOU: {states['elo'].get('HOU')}")
