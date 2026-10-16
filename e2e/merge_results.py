#!/usr/bin/env python3
"""Barrier merge + validator for Campaign V2 (CAMPAIGN_V2.md section 5/6).

Merges every shard in e2e/results/shards/ into the canonical e2e/results.jsonl
(sorted by ts), enforcing the validator rules. Rejected lines are reported and
NOT merged — a rejected line reverts the unit to FAIL with no human judgment.

Usage:
  python3 e2e/merge_results.py            # merge all shards -> results.jsonl
  python3 e2e/merge_results.py --check    # validate existing results.jsonl only
"""
import json
import os
import re
import sys
from datetime import datetime

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHARDS = os.path.join(REPO, "e2e", "results", "shards")
CANON = os.path.join(REPO, "e2e", "results.jsonl")

REQUIRED = ["ts", "unit", "title", "wave", "agent", "build_sha", "viewport",
            "verdict", "checks", "failures", "evidence"]
WAVES = {"verify", "skeptic", "regression"}
# CAMPAIGN_V2 section 4: skeptic lines carry verdict HELD (PASS survives attack),
# BROKEN (PASS overturned) or BLOCKED; verify/regression lines carry PASS/FAIL/BLOCKED.
VERDICTS = {"PASS", "FAIL", "BLOCKED", "HELD", "BROKEN"}


def ts_ok(ts):
    if not isinstance(ts, str):
        return False
    try:
        datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def validate(line, lineno):
    """Return list of rejection reasons ([] = valid)."""
    errs = []
    if not isinstance(line, dict):
        return ["not a JSON object"]
    for k in REQUIRED:
        if k not in line:
            errs.append(f"missing key {k}")
    if line.get("wave") not in WAVES:
        errs.append(f"bad wave {line.get('wave')!r}")
    if line.get("verdict") not in VERDICTS:
        errs.append(f"bad verdict {line.get('verdict')!r}")
    if not ts_ok(line.get("ts")):
        errs.append("ts not parseable ISO-8601")
    checks = line.get("checks") or {}
    if not isinstance(checks, dict) or not checks:
        errs.append("empty checks object")
    v = line.get("verdict")
    if v == "PASS":
        if checks.get("real_data") is not True:
            errs.append("PASS without real_data=true")
        ir, i200 = checks.get("images_requested"), checks.get("images_200")
        if not (isinstance(ir, int) and isinstance(i200, int) and i200 == ir):
            errs.append(f"PASS with images_200({i200}) != images_requested({ir})")
        bf = checks.get("buttons_failed")
        if bf != [] and bf is not None:
            errs.append("PASS with non-empty buttons_failed")
        bt = checks.get("buttons_total")
        if isinstance(bt, int) and bt > 0:
            bok = checks.get("buttons_ok")
            if not isinstance(bok, int):
                errs.append("buttons_total set but buttons_ok missing")
            elif bok < bt - len(bf or []):
                errs.append(f"unclicked controls: ok={bok} total={bt}")
        vd, vf = checks.get("vision_defects"), checks.get("vision_findings")
        if not (vd == 0 or (isinstance(vd, int) and vd > 0 and vf)):
            errs.append("vision findings neither zero nor enumerated")
        par = checks.get("parity") or {}
        if par.get("blocker", 1) != 0 or par.get("major", 1) != 0:
            errs.append(f"PASS with parity blocker={par.get('blocker')} major={par.get('major')}")
        shots = [p for p in (line.get("evidence") or []) if p.endswith(".png")]
        if len(shots) < 2:
            errs.append("PASS with fewer than 2 screenshots in evidence")
        if v == "PASS" and not any("/shots/" in p for p in (line.get("evidence") or [])):
            errs.append("PASS with no shots/ path in evidence")
    for p in line.get("evidence") or []:
        if not os.path.exists(os.path.join(REPO, p)):
            errs.append(f"evidence path missing on disk: {p}")
    if line.get("wave") == "skeptic":
        n = line.get("attacks_attempted", 0)
        verdict = line.get("verdict")
        if verdict in ("HELD", "PASS") and (not isinstance(n, int) or n < 6):
            errs.append(f"skeptic {verdict} with attacks_attempted={n} (<6)")
    return errs


def main():
    check_only = "--check" in sys.argv
    lines = []
    rejected = []
    if check_only:
        with open(CANON) as f:
            for i, raw in enumerate(f, 1):
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    obj = json.loads(raw)
                except json.JSONDecodeError as e:
                    rejected.append((f"results.jsonl:{i}", [f"bad JSON: {e}"]))
                    continue
                errs = validate(obj, i)
                (lines if not errs else rejected).append(
                    obj if not errs else (f"results.jsonl:{i}", errs))
    else:
        if not os.path.isdir(SHARDS):
            print("no shards dir"); sys.exit(1)
        for name in sorted(os.listdir(SHARDS)):
            if not name.endswith(".jsonl"):
                continue
            path = os.path.join(SHARDS, name)
            with open(path) as f:
                for i, raw in enumerate(f, 1):
                    raw = raw.strip()
                    if not raw:
                        continue
                    try:
                        obj = json.loads(raw)
                    except json.JSONDecodeError as e:
                        rejected.append((f"{name}:{i}", [f"bad JSON: {e}"]))
                        continue
                    errs = validate(obj, i)
                    if errs:
                        rejected.append((f"{name}:{i}", errs))
                    else:
                        lines.append(obj)
        seen, deduped = set(), []
        for obj in sorted(lines, key=lambda o: (o.get("ts") or "", o.get("unit") or "")):
            key = (obj["unit"], obj["wave"], obj.get("verdict"), obj.get("agent"), obj["ts"])
            if key in seen:
                continue
            seen.add(key)
            deduped.append(obj)
        lines = deduped
        with open(CANON, "w") as f:
            for obj in lines:
                f.write(json.dumps(obj, ensure_ascii=False) + "\n")
        print(f"merged {len(lines)} valid shard lines -> e2e/results.jsonl")

    units = {}
    # Skeptic verdicts fold into the same unit status: HELD == PASS survived,
    # BROKEN overturns to FAIL (CAMPAIGN_V2 section 4).
    NORMALIZE = {"HELD": "PASS", "BROKEN": "FAIL"}
    for obj in lines:
        u = obj["unit"]
        cur = units.get(u)
        v = NORMALIZE.get(obj["verdict"], obj["verdict"])
        rank = {"PASS": 0, "FAIL": 1, "BLOCKED": 2}
        if cur is None or rank[v] > rank[cur[0]]:
            units[u] = (v, obj["wave"])
    done = sum(1 for v, _ in units.values() if v == "PASS")
    print("\nunit status (worst verdict wins per unit):")
    for u in sorted(units):
        v, w = units[u]
        mark = "DONE" if v == "PASS" else ("REPAIR" if v == "FAIL" else "BLOCKED")
        print(f"  {u:<8} {w:<10} {v:<8} {mark}")
    y = 66
    print(f"\nX = {done}/{y}")
    print(f"PROGRESS: {done}/{y}")
    if rejected:
        print(f"\nREJECTED ({len(rejected)}):")
        for where, errs in rejected:
            print(f"  {where}: {'; '.join(errs)}")
        sys.exit(2)


if __name__ == "__main__":
    main()
