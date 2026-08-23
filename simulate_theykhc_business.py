#!/usr/bin/env python3
"""Monte Carlo business-execution experiment for TheYKHC.

This is a decision model, not a revenue forecast. All commercial inputs are
explicit assumptions and should be replaced with observed funnel data.
"""

import csv
import json
import math
import random
from pathlib import Path

SEED = 20260824
TRIALS = 20000
MONTHS = 12


SCENARIOS = {
    "archive_only": {
        "label_ja": "現状継続（公開・蓄積のみ）",
        "visits": (15, 35), "visit_growth": (0.00, 0.04),
        "inquiry_rate": (0.001, 0.006), "close_rate": (0.05, 0.18),
        "outreach": (0, 0), "reply_rate": (0, 0),
        "outreach_close": (0, 0), "fee": (0, 0),
    },
    "clear_offer": {
        "label_ja": "商品を一本化（90分・研究設計相談）",
        "visits": (20, 50), "visit_growth": (0.01, 0.07),
        "inquiry_rate": (0.006, 0.025), "close_rate": (0.10, 0.30),
        "outreach": (0, 0), "reply_rate": (0, 0),
        "outreach_close": (0, 0), "fee": (10000, 30000),
    },
    "targeted_outreach": {
        "label_ja": "一本化商品＋月20件の個別提案",
        "visits": (20, 50), "visit_growth": (0.01, 0.07),
        "inquiry_rate": (0.006, 0.025), "close_rate": (0.10, 0.30),
        "outreach": (16, 24), "reply_rate": (0.03, 0.12),
        "outreach_close": (0.08, 0.25), "fee": (20000, 60000),
    },
    "paid_pilot": {
        "label_ja": "月20件提案＋小規模な有償研究設計実証",
        "visits": (20, 50), "visit_growth": (0.01, 0.07),
        "inquiry_rate": (0.006, 0.025), "close_rate": (0.10, 0.30),
        "outreach": (16, 24), "reply_rate": (0.03, 0.12),
        "outreach_close": (0.05, 0.18), "fee": (80000, 250000),
    },
}


def u(rng, pair):
    lo, hi = pair
    return rng.uniform(lo, hi)


def poisson(rng, lam):
    if lam <= 0:
        return 0
    # Stable and exact enough for the small rates used in this experiment.
    limit = math.exp(-lam)
    k, product = 0, 1.0
    while product > limit:
        k += 1
        product *= rng.random()
    return k - 1


def quantile(values, q):
    s = sorted(values)
    p = (len(s) - 1) * q
    lo, hi = int(math.floor(p)), int(math.ceil(p))
    if lo == hi:
        return s[lo]
    return s[lo] * (hi - p) + s[hi] * (p - lo)


def simulate_scenario(name, cfg):
    rng = random.Random(SEED + sum(map(ord, name)))
    revenues, customers = [], []
    for _ in range(TRIALS):
        visits = u(rng, cfg["visits"])
        growth = u(rng, cfg["visit_growth"])
        inquiry = u(rng, cfg["inquiry_rate"])
        close = u(rng, cfg["close_rate"])
        outreach = u(rng, cfg["outreach"])
        reply = u(rng, cfg["reply_rate"])
        out_close = u(rng, cfg["outreach_close"])
        fee = u(rng, cfg["fee"])
        annual_customers = 0
        for _month in range(MONTHS):
            inbound = poisson(rng, visits * inquiry * close)
            outbound = poisson(rng, outreach * reply * out_close)
            annual_customers += inbound + outbound
            visits *= 1 + growth
        customers.append(annual_customers)
        revenues.append(annual_customers * fee)
    return {
        "scenario": name,
        "label_ja": cfg["label_ja"],
        "trials": TRIALS,
        "probability_any_customer": sum(x > 0 for x in customers) / TRIALS,
        "customers_median": quantile(customers, .5),
        "customers_p10": quantile(customers, .1),
        "customers_p90": quantile(customers, .9),
        "revenue_median_yen": round(quantile(revenues, .5)),
        "revenue_p10_yen": round(quantile(revenues, .1)),
        "revenue_p90_yen": round(quantile(revenues, .9)),
        "probability_annual_120k_yen": sum(x >= 120000 for x in revenues) / TRIALS,
        "probability_annual_600k_yen": sum(x >= 600000 for x in revenues) / TRIALS,
    }


def main():
    results = [simulate_scenario(k, v) for k, v in SCENARIOS.items()]
    report = {
        "schema": "TheYKHC business execution experiment v1",
        "date": "2026-08-24",
        "status": "decision simulation, not a revenue forecast",
        "trials_per_scenario": TRIALS,
        "months": MONTHS,
        "observed_public_signals": [
            "TheYKHC public website has multiple indexed entry pages",
            "TheYKHC has a public Zenodo hypothesis archive with DOI records",
            "No verified access-log, inquiry, conversion, or payment data were available",
        ],
        "results": results,
        "falsification": {
            "archive_only": "If publication alone produces a paid inquiry, replace its zero-fee assumption and refit.",
            "outreach": "If 60 well-targeted contacts produce no qualified replies, revise target, offer, or evidence package before scaling.",
            "paid_pilot": "If three qualified proposal meetings produce no willingness to pay, do not interpret DOI volume as a commercial product.",
        },
        "next_measurements": [
            "qualified landing-page visits",
            "offer-page clicks",
            "targeted contacts sent",
            "qualified replies",
            "meetings",
            "paid conversions",
            "fee and delivery hours",
        ],
    }
    Path("theykhc-business-experiment.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    with Path("theykhc-business-experiment-summary.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(results[0].keys()))
        w.writeheader()
        w.writerows(results)
    for r in results:
        print(r)


if __name__ == "__main__":
    main()
