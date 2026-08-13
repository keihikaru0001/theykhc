"""Command line interface for Luna."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .engine import LunaEngine


def main() -> int:
    parser = argparse.ArgumentParser(description="Luna — evidence-aware TheYKHC venture generator")
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[1]), help="TheYKHC repository root")
    parser.add_argument("--inventory", action="store_true", help="Print integrated archive inventory")
    parser.add_argument("--generate", type=int, metavar="N", help="Generate N low-risk venture candidates")
    parser.add_argument("--allow-high-risk", action="store_true", help="Include medically/financially sensitive candidates")
    parser.add_argument("--output", help="Write JSON output to this path")
    args = parser.parse_args()

    engine = LunaEngine(args.root).load()
    if args.generate is not None:
        payload = {
            "inventory": engine.inventory(),
            "generated_ventures": engine.generate(args.generate, allow_high_risk=args.allow_high_risk),
        }
    else:
        payload = engine.inventory()

    rendered = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
