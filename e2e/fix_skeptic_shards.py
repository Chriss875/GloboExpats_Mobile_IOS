#!/usr/bin/env python3
"""Normalize skeptic shard lines so the canonical validator can judge them.

Two mechanical issues found at the Wave-0 skeptic merge:
  1. Agents wrote evidence paths relative to e2e/ (shots/..., videos/...) while the
     validator resolves them from the repo root -> prefix with e2e/ when that exists.
  2. Some skeptic lines lack a `checks` object (validator requires non-empty checks).
     Synthesize one from attacks_attempted/attacks_broken.
Evidence paths that exist nowhere on disk are DROPPED (not fabricated) and reported,
so a HELD/BROKEN verdict still needs >=1 real artifact to survive validation.
"""
import json
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHARDS = os.path.join(REPO, "e2e", "results", "shards")


def fix_path(p):
    if os.path.exists(os.path.join(REPO, p)):
        return p, True
    if not p.startswith("e2e/") and os.path.exists(os.path.join(REPO, "e2e", p)):
        return "e2e/" + p, True
    return None, False


def main():
    names = sys.argv[1:] or sorted(
        n for n in os.listdir(SHARDS) if n.endswith("-skeptic.jsonl")
    )
    for name in names:
        path = os.path.join(SHARDS, name)
        lines = [l for l in open(path).read().splitlines() if l.strip()]
        if not lines:
            continue
        d = json.loads(lines[-1])
        fixed, missing = [], []
        for p in d.get("evidence", []):
            newp, ok = fix_path(p)
            (fixed.append(newp) if ok else missing.append(p))
        d["evidence"] = fixed
        if not isinstance(d.get("checks"), dict) or not d.get("checks"):
            d["checks"] = {
                "attacks_attempted": d.get("attacks_attempted", 0),
                "attacks_broken": d.get("attacks_broken", 0),
            }
        print(f"{name}: verdict={d.get('verdict')} evidence_kept={len(fixed)} "
              f"evidence_missing={len(missing)}")
        for m in missing:
            print(f"   MISSING: {m}")
        with open(path, "w") as fh:
            fh.write(json.dumps(d) + "\n")


if __name__ == "__main__":
    main()
