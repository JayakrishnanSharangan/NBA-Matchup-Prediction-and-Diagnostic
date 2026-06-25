import xgboost as xgb
print("XGBoost version:", xgb.__version__)
try:
    # try training a small dummy model with gpu
    import numpy as np
    X = np.random.rand(100, 10)
    y = np.random.randint(0, 2, 100)
    clf = xgb.XGBClassifier(tree_method='hist', device='cuda')
    clf.fit(X, y)
    print("Success: CUDA is working in XGBoost!")
except Exception as e:
    print("Error using GPU in XGBoost:")
    print(e)
