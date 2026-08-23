#!/usr/bin/env python3
"""In-silico falsification test of demand/support-field vascular guidance."""
import json, math
from pathlib import Path
import numpy as np
import pandas as pd

W,H,STEPS=48,24,45
GROUPS=["neutral","demand_only","support_only","uniform_mix","dual_separated","dual_closed_loop"]

def field(kind):
    yy,xx=np.mgrid[0:H,0:W]; d=np.zeros((H,W)); s=np.zeros((H,W))
    target=np.exp(-((xx-W*.78)**2/(2*(W*.18)**2)+(yy-H*.5)**2/(2*(H*.28)**2)))
    corridor=np.exp(-((yy-H*.5)**2/(2*(H*.22)**2)))*np.clip((xx-W*.15)/(W*.55),0,1)
    if kind=="demand_only": d=.8*target
    elif kind=="support_only": s=.8*corridor
    elif kind=="uniform_mix": d[:]=.4; s[:]=.4
    elif kind in ("dual_separated","dual_closed_loop"): d=.8*target; s=.8*corridor
    return d,s

def diffuse(a,r=.08):
    b=a.copy();b[1:-1,1:-1]+=r*(a[1:-1,:-2]+a[1:-1,2:]+a[:-2,1:-1]+a[2:,1:-1]-4*a[1:-1,1:-1]);return b

def trial(kind,seed):
    rng=np.random.default_rng(seed);d,s=field(kind);v=np.zeros((H,W),bool)
    tips=[]
    for k in (-4,-2,0,2,4): y=H//2+k;v[y,2]=1;tips.append((2,y))
    reached=False;leak_samples=[]
    for t in range(STEPS):
        d=diffuse(d);s=diffuse(s,.06);new=[]
        for x,y in tips:
            candidates=[]
            for dx,dy in ((1,0),(1,-1),(1,1),(0,-1),(0,1),(-1,0)):
                nx,ny=x+dx,y+dy
                if 1<=nx<W-1 and 1<=ny<H-1:
                    score=.95*d[ny,nx]+.48*s[ny,nx]+.18*(dx>0)-.05*(dx<0)+rng.random()*.48-1.1*v[ny,nx]
                    candidates.append((score,nx,ny))
            if candidates:
                _,nx,ny=max(candidates);v[ny,nx]=1;new.append((nx,ny))
                if rng.random()<.025+.04*d[ny,nx]:new.append((nx,int(np.clip(ny+rng.choice([-1,1]),1,H-2))))
        tips=new[:40]
        reached|=bool(v[H//2-2:H//2+3,W-5:].any())
        unstable=v&(d>.62)&(s<.28); leak_samples.append(unstable.sum()/max(v.sum(),1))
        if kind=="dual_closed_loop":
            supplied=np.zeros_like(v);supplied[:,2:]=v[:,:-2]|v[:,1:-1]
            d[supplied]*=.965
            if leak_samples[-1]>.08:s=np.minimum(1,s+.008*diffuse(v.astype(float),.1))
    coords=np.argwhere(v);length=len(coords);forward=(coords[:,1].max()-2) if length else 0
    lateral=np.mean(np.abs(coords[:,0]-H/2)) if length else H/2
    efficiency=forward/(length/5+1)/(1+lateral/H)
    return {"group":kind,"seed":seed,"destination":int(reached),"leak":float(np.mean(leak_samples[-30:])),
            "vessel_cells":length,"forward_extent":int(forward),"lateral_deviation":float(lateral),"route_efficiency":float(efficiency)}

RUNS_PER_GROUP=200
rows=[trial(g,10000+i) for g in GROUPS for i in range(RUNS_PER_GROUP)]
df=pd.DataFrame(rows);summary=df.groupby("group").agg(n=("seed","size"),destination_rate=("destination","mean"),
 leak_mean=("leak","mean"),vessel_cells_mean=("vessel_cells","mean"),forward_extent_mean=("forward_extent","mean"),
 lateral_deviation_mean=("lateral_deviation","mean"),route_efficiency_mean=("route_efficiency","mean")).reset_index()
base=summary.set_index("group").loc["neutral"]
summary["destination_gain_vs_neutral"]=summary.destination_rate-base.destination_rate
df.to_csv("dual-field-vascular-guidance-runs.csv",index=False)
wide=df.pivot(index="seed",columns="group",values="destination")
comparisons={}
for other in ["neutral","demand_only","support_only","uniform_mix"]:
    delta=(wide.dual_separated-wide[other]).to_numpy(); br=np.random.default_rng(20260824).choice(delta,(10000,len(delta)),replace=True).mean(1)
    b=int(((wide.dual_separated==1)&(wide[other]==0)).sum()); c=int(((wide.dual_separated==0)&(wide[other]==1)).sum())
    comparisons[f"dual_separated_vs_{other}"]={"paired_rate_difference":float(delta.mean()),"bootstrap_95CI":[float(np.quantile(br,.025)),float(np.quantile(br,.975))],"discordant_dual_wins":b,"discordant_other_wins":c}
summary.to_csv("dual-field-vascular-guidance-summary.csv",index=False)
report={"schema":"TheYKHC dual-field in-silico experiment v1","runs":len(df),"seeds_per_group":RUNS_PER_GROUP,
 "steps":STEPS,"groups":GROUPS,"primary_endpoint":"destination_rate","summary":summary.to_dict(orient="records"),
 "paired_comparisons":comparisons,
 "falsification_rule":"Reject guidance benefit if dual_separated does not exceed both single-field groups in destination rate, or if gain is accompanied by materially higher leakage.",
 "status":"illustrative agent model; not biological evidence"}
Path("dual-field-vascular-guidance-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(summary.to_string(index=False,float_format=lambda x:f"{x:.4f}"))
