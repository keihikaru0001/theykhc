#!/usr/bin/env python3
"""Leakage-resistant external validation for ODC-SCI CLIMBER IAD.

Usage:
  python validate_public_sci_data.py dataset_1081_1720635248.csv

The script never mixes animals from the held-out PMID into training. It predicts
the reported post-injury outcome from baseline/control score and study metadata.
This validates locomotor-recovery prediction only; it does not validate vascular,
axon-guidance, RPI, or clinical-treatment claims.
"""
import json, sys
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import LeaveOneGroupOut

REQUIRED = {"PMID", "controlresult", "outcomeresult"}
CANDIDATES = [
    "controlresult", "Animal", "Strain", "Sex_Grouped", "Type_of_Injury",
    "Injury_Segment_", "Injury_Device", "behavioraltest", "outcomescore_max",
    "Contusion_severity_group", "grouplabel"
]

def main(path):
    df = pd.read_csv(path)
    missing = sorted(REQUIRED - set(df.columns))
    if missing:
        raise SystemExit(f"Missing required columns: {missing}")
    df = df.dropna(subset=["PMID", "outcomeresult"]).copy()
    features = [c for c in CANDIDATES if c in df.columns]
    numeric = [c for c in features if pd.api.types.is_numeric_dtype(df[c])]
    categorical = [c for c in features if c not in numeric]
    prep = ColumnTransformer([
        ("num", Pipeline([("imp", SimpleImputer(strategy="median")),
                           ("scale", StandardScaler())]), numeric),
        ("cat", Pipeline([("imp", SimpleImputer(strategy="most_frequent")),
                           ("onehot", OneHotEncoder(handle_unknown="ignore",
                                                    sparse_output=False))]), categorical),
    ])
    model = Pipeline([("prep", prep), ("model", HistGradientBoostingRegressor(
        learning_rate=.05, max_iter=250, max_leaf_nodes=15,
        l2_regularization=1.0, random_state=20260823))])
    X, y, groups = df[features], df["outcomeresult"].astype(float), df["PMID"]
    logo = LeaveOneGroupOut(); predictions = np.full(len(df), np.nan); folds=[]
    for train, test in logo.split(X, y, groups):
        if len(train) < 20 or len(test) < 2: continue
        model.fit(X.iloc[train], y.iloc[train]); p = model.predict(X.iloc[test])
        predictions[test] = p
        folds.append({"held_out_PMID": str(groups.iloc[test[0]]), "n": int(len(test)),
                      "MAE": float(mean_absolute_error(y.iloc[test], p)),
                      "RMSE": float(mean_squared_error(y.iloc[test], p) ** .5)})
    keep = np.isfinite(predictions); yt=y.to_numpy()[keep]; yp=predictions[keep]
    baseline = pd.to_numeric(df.loc[keep,"controlresult"],errors="coerce").to_numpy()
    base_keep=np.isfinite(baseline)
    report = {
      "schema":"TheYKHC ODC-SCI held-out-study validation v1",
      "dataset":Path(path).name,
      "rows_total":int(len(df)), "rows_predicted":int(keep.sum()),
      "studies_total":int(groups.nunique()), "studies_evaluated":len(folds),
      "split":"Leave-One-PMID-Out",
      "features":features,
      "model":{"name":"HistGradientBoostingRegressor","random_state":20260823},
      "held_out_metrics":{"MAE":float(mean_absolute_error(yt,yp)),
                          "RMSE":float(mean_squared_error(yt,yp)**.5),
                          "R2":float(r2_score(yt,yp)),
                          "Pearson_r":float(np.corrcoef(yt,yp)[0,1])},
      "baseline_control_score_metrics":({"MAE":float(mean_absolute_error(yt[base_keep],baseline[base_keep])),
                          "RMSE":float(mean_squared_error(yt[base_keep],baseline[base_keep])**.5),
                          "R2":float(r2_score(yt[base_keep],baseline[base_keep]))} if base_keep.any() else None),
      "folds":folds,
      "interpretation_limit":"Behavioral outcome prediction across held-out preclinical studies only; no vascular/RPI/clinical validation."
    }
    out=Path("sci-held-out-validation.json"); out.write_text(json.dumps(report,indent=2,ensure_ascii=False))
    pred=df.loc[keep,["PMID","controlresult","outcomeresult"]].copy(); pred["prediction"]=yp
    pred.to_csv("sci-held-out-predictions.csv",index=False)
    print(json.dumps(report["held_out_metrics"],indent=2)); print(f"Wrote {out} and sci-held-out-predictions.csv")

if __name__ == "__main__":
    if len(sys.argv)!=2: raise SystemExit(__doc__)
    main(sys.argv[1])
