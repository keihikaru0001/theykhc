#!/usr/bin/env python3
"""Compare ODC-SCI CLIMBER literature-extracted and individual-animal values."""
import json,sys
import numpy as np, pandas as pd
from pathlib import Path

iad,led=pd.read_csv(sys.argv[1]),pd.read_csv(sys.argv[2])
iad["iad_effect"]=(iad.outcomeresult-iad.controlresult)/iad.outcomescore_max
agg=iad.groupby(["PMID","experimentalgroup"],as_index=False).agg(
    iad_n=("Subject_ID","size"),iad_unique_n=("Subject_ID","nunique"),
    iad_control=("controlresult","mean"),iad_outcome=("outcomeresult","mean"),
    iad_effect=("iad_effect","mean"))
m=led.merge(agg,on=["PMID","experimentalgroup"],how="outer",indicator=True)
q=m[m._merge=="both"].copy(); diff=q.iad_effect-q.effect
report={
 "schema":"TheYKHC ODC-SCI LED-IAD concordance v1",
 "sources":{"IAD":Path(sys.argv[1]).name,"LED":Path(sys.argv[2]).name,
            "dataset_DOIs":["10.34945/F5J59P","10.34945/F5DG6D"]},
 "rows":{"IAD":int(len(iad)),"LED_groups":int(len(led)),"matched_groups":int(len(q)),
         "LED_only":int((m._merge=="left_only").sum()),"IAD_only":int((m._merge=="right_only").sum())},
 "mean_concordance":{"control_mean_Pearson_r":float(q[["controlresult","iad_control"]].corr().iloc[0,1]),
   "outcome_mean_Pearson_r":float(q[["outcomeresult","iad_outcome"]].corr().iloc[0,1]),
   "control_mean_MAE_score_units":float((q.iad_control-q.controlresult).abs().mean()),
   "outcome_mean_MAE_score_units":float((q.iad_outcome-q.outcomeresult).abs().mean())},
 "normalized_change_concordance":{"definition":"(outcome-control)/outcomescore_max",
   "Pearson_r":float(q[["effect","iad_effect"]].corr().iloc[0,1]),
   "MAE":float(abs(diff).mean()),"RMSE":float(np.sqrt(np.mean(diff**2))),
   "direction_agreement":float(np.mean(np.sign(q.effect)==np.sign(q.iad_effect))),
   "LED_mean":float(q.effect.mean()),"IAD_mean":float(q.iad_effect.mean()),
   "LED_absolute_effect_larger_fraction":float(np.mean(abs(q.effect)>abs(q.iad_effect)))},
 "sample_size":{"reported_total_matched":int(q["n.treat"].sum()),
   "IAD_rows_matched":int(q.iad_n.sum()),"groups_exact_n":int((q["n.treat"]==q.iad_n).sum()),
   "groups_compared":int(len(q))},
 "limitations":["Group assignment unavailable for PMID 22445934 in IAD",
  "11 unknown and 1 NA group rows for PMID 21963672 are not matched",
  "Normalized change is not the paired standardized mean difference used in the publication meta-analysis",
  "Behavioral recovery concordance does not validate vascular, RPI, axon-guidance, or clinical equations"]}
Path("sci-led-iad-concordance.json").write_text(json.dumps(report,indent=2,ensure_ascii=False))
print(json.dumps(report,indent=2,ensure_ascii=False))
