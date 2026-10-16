#!/usr/bin/env python3
"""merge_shard.py — append one shard's verdict to canonical e2e/results.jsonl.

Usage: merge_shard.py <unit> <stage>   (e.g. merge_shard.py AU-010 verify)

Reads e2e/results/shards/<unit>-<stage>.jsonl, normalizes to the canonical schema,
skips if that unit+wave row already exists (idempotent), prints the new PROGRESS count.
"""
import json, sys, os, datetime

REPO = os.path.expanduser("~/GloboExpats_Mobile")
SHARDS = f"{REPO}/e2e/results/shards"
CANON = f"{REPO}/e2e/results.jsonl"

def main(unit: str, stage: str) -> int:
    shard_path = f"{SHARDS}/{unit}-{stage}.jsonl"
    if not os.path.exists(shard_path):
        print(f"NO-SHARD {shard_path}"); return 1
    with open(shard_path) as fh:
        lines = [l for l in fh if l.strip()]
    if not lines:
        print(f"EMPTY-SHARD {shard_path}"); return 1
    # Shards are append-only: the LAST line is the current verdict (earlier
    # lines are superseded attempts from prior rounds).
    raw = json.loads(lines[-1])

    verdict = raw.get("verdict") or raw.get("status") or "?"
    wave = "skeptic" if "skeptic" in stage or raw.get("wave") == "skeptic" else "verify"
    title = raw.get("title", "")
    build_sha = raw.get("build_sha", "")

    # idempotency: same unit+wave already in canon?
    with open(CANON) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            if r.get("unit") == unit and r.get("wave") == wave:
                print(f"DUP {unit}/{wave} already in canon ({r.get('verdict')})"); return 0

    row = {
        "ts": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "unit": unit, "title": title, "wave": stage,
        "agent": raw.get("agent", "workflow-agent"),
        "build_sha": build_sha,
        "viewport": raw.get("viewport", "375x667+768x1024"),
        "verdict": verdict,
        "attacks_attempted": raw.get("attacks_attempted", 0),
        "attacks_broken": raw.get("attacks_broken", 0),
        "findings": raw.get("findings", []),
        "checks": raw.get("checks", {}),
        "failures": raw.get("failures", []),
        "evidence": raw.get("evidence", []),
        "runtime_ms": raw.get("runtime_ms", 0),
        "notes": json.dumps(raw.get("notes", ""))[:2000] if isinstance(raw.get("notes"), dict) else str(raw.get("notes", "") or "")[:2000],
    }
    with open(CANON, "a") as fh:
        fh.write(json.dumps(row) + "\n")

    # X = distinct units whose latest state is DONE-ish (PASS verified; skeptic HELD strengthens)
    units_done = set()
    with open(CANON) as fh:
        rows = [json.loads(l) for l in fh if l.strip()]
    by_unit = {}
    for r in rows:
        by_unit.setdefault(r["unit"], []).append(r)
    for u, rs in by_unit.items():
        has_pass = any(r["verdict"] == "PASS" and r.get("wave", "").startswith("verify") or r["verdict"] == "PASS" for r in rs)
        held = any(r["verdict"] == "HELD" for r in rs)
        broken = any(r["verdict"] == "BROKEN" for r in rs)
        failed_last = rs[-1]["verdict"] == "FAIL"
        if not failed_last and not broken and (has_pass or held):
            units_done.add(u)
    print(f"MERGED {unit}/{stage} verdict={verdict}")
    print(f"PROGRESS: {len(units_done)}/{66}")
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
