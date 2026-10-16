#!/usr/bin/env python3
"""status_board.py - authoritative X/Y recomputer for Campaign V2 (ORCHESTRATION.md section 4).

X/Y is computed FROM DISK (plans/WAVE_PLAN.md unit rows + e2e/results.jsonl + shards),
never from conversation or prose. Emits the exact PROGRESS marker token for the
ngrok tracker plus a per-unit standing table.

Usage:
  python3 e2e/status_board.py            # table + PROGRESS marker
  python3 e2e/status_board.py --marker   # marker line only
"""
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANON = os.path.join(REPO, "e2e", "results.jsonl")
SHARDS = os.path.join(REPO, "e2e", "results", "shards")
WAVE_PLAN = os.path.join(os.path.dirname(REPO), "ultracode-agent", "plans", "WAVE_PLAN.md")


def total_units():
    """Y = number of | AU | rows in WAVE_PLAN.md unit tables (AU-000..AU-065 = 66 frozen)."""
    n = 0
    if os.path.exists(WAVE_PLAN):
        for line in open(WAVE_PLAN):
            if re.match(r"^\|\s*\d{3}\s*\|", line.strip()):
                n += 1
    return n or 66


def canonical_status():
    """Latest verify-wave status per unit from canonical results.jsonl."""
    st = {}
    if not os.path.exists(CANON):
        return st
    for line in open(CANON):
        line = line.strip()
        if not line:
            continue
        try:
            d = json.loads(line)
        except ValueError:
            continue
        u = d.get("unit")
        v = d.get("verdict") or d.get("status")
        if d.get("wave") == "skeptic":
            # skeptic HELD confirms; BROKEN overturns the unit's PASS
            if v == "BROKEN":
                st[u] = ("REPAIR", d.get("ts"))
            continue
        if v == "PASS":
            cur = st.get(u)
            # skeptic-approved beats bare PASS only if skeptic ran after
            if cur is None or cur[0] != "REPAIR":
                prev_ts = cur[1] if cur else None
                if prev_ts is None or str(d.get("ts")) >= str(prev_ts):
                    st[u] = ("PASS", d.get("ts"))
        elif v == "FAIL":
            st[u] = ("FAIL", d.get("ts"))
        elif v == "BLOCKED":
            st[u] = ("BLOCKED", d.get("ts"))
    return st


def skeptic_state():
    st = {}
    for fn in os.listdir(SHARDS) if os.path.isdir(SHARDS) else []:
        m = re.match(r"(AU-\d+)-skeptic\.jsonl", fn)
        if not m:
            continue
        last = None
        for line in open(os.path.join(SHARDS, fn)):
            try:
                d = json.loads(line.strip())
            except ValueError:
                continue
            last = d
        if last:
            st[m.group(1)] = (last.get("verdict"), int(last.get("attacks_attempted") or 0))
    return st


def main():
    marker_only = "--marker" in sys.argv
    Y = total_units()
    units = {i: "AU-%03d" % i for i in range(66)}
    cs = canonical_status()
    sk = skeptic_state()

    done = [units[i] for i in sorted(units) if cs.get(units[i], ("",))[0] == "PASS"]
    repair = [u for u, (v, _) in cs.items() if v == "REPAIR"]
    fails = [u for u, (v, _) in cs.items() if v == "FAIL"]
    blocked = [u for u, (v, _) in cs.items() if v == "BLOCKED"]
    X = len(done)

    if marker_only:
        print(f"PROGRESS: {X}/{Y}")
        return

    print(f"X = {X}/{Y}   repair={len(repair)} fail={len(fails)} blocked={len(blocked)}")
    print(f"DONE: {', '.join(done) if done else '-'}")
    if repair:
        print(f"REPAIR (skeptic BROKEN): {', '.join(repair)}")
    if fails:
        print(f"FAIL: {', '.join(fails)}")
    if blocked:
        print(f"BLOCKED: {', '.join(blocked)}")
    if sk:
        print("\nSkeptic layer:")
        for u in sorted(sk):
            print(f"  {u}: {sk[u][0]} ({sk[u][1]} attacks)")
    print(f"\nPROGRESS: {X}/{Y}")


if __name__ == "__main__":
    main()
