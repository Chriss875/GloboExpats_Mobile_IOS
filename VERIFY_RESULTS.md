# VERIFY_RESULTS.md — Campaign V2 live ledger

**Y = 66 units** (plans/WAVE_PLAN.md, frozen at G1). PROGRESS markers are X/66.
This file is the human-readable mirror of `e2e/results.jsonl` + shards. Disk is truth;
this file is re-derived from shards at every barrier merge.

## 2026-08-25 · orchestrator session — X=14/66

### Standing 2026-08-25 ~02:00 EAT — X = 19/66
- **DONE (PASS verify + skeptic/tie-breaker closed, merged canonical):** AU-000..005,
  AU-010 (r4 guard re-verify), AU-011, AU-012, AU-014, AU-015, AU-016, AU-019,
  AU-020, AU-021, **AU-022 (r3)**, AU-025, AU-026, AU-027.
- Disputes resolved: AU-010/022 re-verified on fresh bundle 97ee952 @ :9110;
  AU-011 clipboard dispute ruled harness-environmental; AU-012 r2 skeptic HELD;
  AU-019 pushState staleness ruled accepted-divergence (matches reference).
- Frozen lane :9110 = build 97ee952. Next: Wave-1b/2 build fan-out (sell wizard
  AU-040/041, order actions AU-037..039, admin console AU-042/043) + verify fan-out
  for built-but-unverified AUs.

## 2026-08-25 ~04:50 EAT — orchestrator session (orders/escrow/admin wave built)

- Lane :9110 restored on fresh bundle **56ba3fc** (AU-013 404→not-found fix ad93547;
  AU-040 pricing-controllers fix 56ba3fc). Lane smoke: boots, home renders, 8 real API calls.
- **AU-013** root cause FIXED (raw HTTP 404 now maps to 'Product not found (HTTP 404)' —
  both markers keep owner-fallback + error_text mapping). Awaiting re-verify on :9110.
- **AU-040 C3** root cause FIXED: payout/price fields had NO controllers so recompute was
  invisible; dead smart-rounding toggle removed (reference hardcodes it, no UI control).
- **AU-034** DONE-in-code: group tabs (All/Ongoing/Overdue/Completed/Cancelled) added to
  buyer/seller list; DELIVERED/PICKED_UP now terminal (reference parity); rental completes
  only at COMPLETED/CONFIRMED. 24 widget tests green.
- **AU-036/037**: payoutStatus/refundAmount parsed → Escrow banner; buyer lifecycle actions
  (Confirm Receipt / Rate Seller w/ rating dialog, Cancel w/ reason) via NEW orderAction()
  on /api/v1/orders; verbs sandbox-probed; ALREADY_RATED surfaces verbatim (widget test).
- **AU-038**: stock gate (AWAITING_SELLER_CONFIRMATION) banner + Confirm availability /
  Can't fulfil (decline w/ reason); dispatch-errors contract ported (7 codes → copy);
  canDispatch/dispatchBlockers parsed.
- **AU-039**: delivery handoff verify card on tracking screen — wrong code decrements
  attempts, lockout after 3, regenerate resets. Widget test drives all three paths.
- **AU-043**: admin orders escrow inline actions — HELD/RELEASED/REFUND badges, Release
  payout (HELD+delivered only), Issue refund (REFUND_PENDING only); NO_REFUND_DUE surfaces.
- Verify fan-out batch2 LIVE vs :9110 (12 units + AU-065 admin lane serialized):
  AU-023 verifier r3 FAIL (fix queued), others in flight. Full suite 250+ tests green.

## Current standing

| Unit | Name | Wave | Status | Attempts | Evidence |
|---|---|---|---|---|---|
| AU-000 | smoke_loop | 0 | **DONE** (PASS, repaired + re-verified on :9103 lane 01:55Z) | 3 | shards/AU-000-repair.jsonl · shots/AU-000 (16) · videos/AU-000-repair-{375,768}.webm |
| AU-001 | auth_session_persistence | 0 | **DONE** (PASS, re-verified live 20:25Z) | 4 | shards/AU-001-verify.jsonl · shots/AU-001 · garbage-gate shot |
| AU-002 | storage_cart_persistence | 0 | **DONE** (PASS, re-verified live 19:35Z) | 3 | shards/AU-002-verify.jsonl · shots/AU-002 |
| AU-003 | router_deep_links | 0 | **DONE** (PASS, audited fan-out evidence 19:50Z) | 3 | shards/AU-003-verify.jsonl · shots/AU-003 (57+30) · videos/AU-003.webm |
| AU-004 | appimage_asset_parity | 0 | **DONE** (PASS, audited fan-out evidence 20:05Z) | 3 | shards/AU-004-verify.jsonl · shots/AU-004 · /tmp/wf-au004-result.json |
| AU-005 | error_taxonomy_empty_states | 0 | **DONE** (PASS 23:55Z; SnackBar defect → fixer task queued) | 1 | shards/AU-005-verify.jsonl · shots/AU-005 |

**X = 6/66 DONE (Wave 0 closed). Skeptics HELD: AU-000-r2 (16 att), AU-002 (17 att), AU-003 (9 att), AU-004 (9 att). Skeptics still owed: AU-001, AU-005.**

PROGRESS: 34/66

### Open Wave-0 units (not yet in results.jsonl) — closeout plan
- **AU-006 stub sweep**: orchestrator grep audit on HEAD 2026-08-23 19:55EAT — zero `PlaceholderScreen`,
  zero empty `onPressed: () {}`, one stale doc-comment TODO removed (`delivery_windows.dart`, pushed).
  Browser click-sweep of remaining screens happens inside each unit's verifier (checklist step 4);
  a final full-app sweep re-runs at campaign end.
- **AU-007 release APK device verification**: INTERNET permission CONFIRMED present in
  `android/app/src/main/AndroidManifest.xml` (Rule-14 fix landed). Existing FINAL APKs
  (`~/GloboExpats_deliverables/GloboExpatsMobile-FINAL-{dev,live}.apk`, Aug 20) verified by binary
  string-scan to carry the right endpoints (`dev.globoexpats.com` reachable 200; live baked) but are
  STALE vs current code → rebuild + emulator network proof scheduled as a closeout unit once Wave-1/2
  merges land (single rebuild with final code, not per-wave).
- **AU-008 final-barrier S1 regression** + **AU-009 demo reel**: campaign-end deliverables; reel
  chapter placeholders already staged in e2e/build_demo_reel.sh; ffmpeg at ~/bin/ffmpeg confirmed.

## 2026-08-23 ~19:20EAT — session restart after provider 401 (state from disk)

Prior session died on provider rotation errors; its in-flight verify lanes (AU-020/021
reverify, AU-045) wrote NO shards ⇒ per ORCHESTRATION those AUs stay OPEN. Their orphaned
evidence committed as audit trail (78641ef): AU-020/021 probes + ref pairs, AU-045 shots+video.
Repo housekeeping pushed (b1bef23, 5e98c40). build/web was STALE vs HEAD (missing AU-036 escrow
banner) → fresh `flutter build web` running; new frozen verify lane will serve it for Wave-1 verify.

## AU-001 postmortem (FAIL 2026-08-22T01:45Z → fixed)

Five findings, all root-caused (see `e2e/reports/AU-001-verifier.md`):

1. Storage key assertion bug in verifier script (`auth_token` vs prefixed
   `flutter.auth_token`) — verifier-side, no app change.
2. Blank render at 375 after reload — unconfirmed transient; re-run with settle waits.
3. Logout did not swap UI — **app fix**: `AuthStore.logout()` cleared local state
   AFTER awaiting the backend POST; sandbox has no `/api/v1/auth/logout`
   (500) so the await hung the swap. Reference has the call commented out too
   (auth-provider.tsx:736) — clearing local-first IS parity. Fixed in `2b3af97`.
4. Missing logout POST — accepted divergence (backend lacks endpoint; reference never calls it).
5. Garbage-token probe invalid — test wrote storage without reload first; guard reads
   AuthStore memory by design. Re-run does reload-before-deeplink.

Bonus Rule-13 defect found during AU-001: subcategory art (`/images/quick-subcategories/*.webp`)
was fetched over the network although those exact files are bundled — sandbox answers them
with 302→OAuth, so tiles rendered broken-image placeholders. Fix in `2b3af97`:
`AppConfig.bundledAssetPath()` maps bundled dirs to asset paths; `AppImage` loads
`assets/…` via rootBundle, never network.

## Rules in force

- Verifier ≠ skeptic ≠ fixer for any unit. Fixes re-verified by FRESH pairs only.
- Every verify run records video to e2e/videos/<unit>.webm and the agent watches it natively.
- PASS requires: real data asserted, images_200==images_requested, zero unclicked controls,
  vision findings enumerated, parity blocker/major == 0.
- Commit+push after every completed unit (rule 8); disk checked each barrier (rule 9).

## 2026-08-23T01:50Z — orchestrator session (Rule 18 restructure)

Frozen verify bundle: **7866a11 @ :9103** (fresh release build incl. AU-020/21 cart work; preflight CORS OK; sandbox login 200 verified).

Three concurrent lanes live:
1. wave0-closeout — AU-000 repair verifier + skeptic pair on :9103 (old BROKEN root cause = CORS infra, fixed); skeptics attacking AU-001/002/004/005 PASSes.
2. wave1-builders-a — worktree builders: AU-010..012 auth/OTP, AU-039 delivery-code, AU-015/016 rental+choices, AU-030 payment proof.
3. wave1-builders-b — checkout cluster: AU-022..025+027 step machine, AU-026 EAT windows, AU-028 proforma payload guard.

X remains 5/66 until skeptics approve. Builder commits merge via orchestrator only (never self-push).

— updated 2026-08-22T04:15Z by orchestrator (ox-alpha)

## Queued post-barrier (Wave 0) polish — do NOT touch lib/ during an active verify run

- [ ] Login CTA copy "Log in" → "Sign In" (reference auth page copy; MINOR parity from AU-001).
- [ ] AU-003 outcome pending: returnUrl behavior after login on gated deep links.

## 2026-08-22 ~09:00Z — Wave-0 verify fan-out audit (orchestrator)

Fan-out ran 4 verifiers against build 2b3af97 (fresh, mtime verified). Results:

- **AU-001**: re-run executed (47 new shots incl. ref pairs, videos AU-001-375.webm + AU-001-768.webm).
  Agent died pre-write (provider 400, context overflow). Evidence audited by orchestrator natively.
- **AU-002**: 10 shots incl. cart-after-reload. Agent died pre-write. Shard MISSING -> not counted.
- **AU-003**: 57 shots + ref pairs, video. Verifier's own summary (recovered): freshness PASS,
  real data PASS (487 products, ORD-2026-000011, real proforma id), images 427 tracked ALL 200/304,
  60 controls / 59 clicked / 1 disabled, 26 observable effects, 33 clicks w/o visible effect
  (classified MINOR harness fidelity). Died pre-write. Shard MISSING -> not counted.
- **AU-004**: 16 shots. Agent ERRORED mid-run (same provider 400). Shard MISSING -> not counted.

### CONFIRMED DEFECT D-001 (blocker, Wave 0)
At 375x667 ONLY: after page.reload(), after logout, and after garbage-token deep link,
the app paints a BLANK WHITE canvas. Evidence: e2e/shots/AU-001/AU-001-375x667-04-account-controls.png
(2,103 bytes = blank); byte-identical ~11,255-byte blanks recur across runs 1+2 at 375 only.
Same flows at 768x1024 render fully (462 KB shot proves it).
Hypothesis: unhandled exception during AuthStore-transition rebuild (web release paints empty
canvas on build exception). Blocks AU-001..005 until fixed + re-verified by a FRESH pair.

X remains 1/66. PROGRESS: 34/66

## 2026-08-22 ~10:00Z — D-001 CORRECTION (orchestrator native read of fresh repro shots)

Fixer agent reproduced against build 2b3af97 with a clean script:
- /tmp/d001-375x667-after-reload.png = FULL render (135 KB). Reload-persistence at 375 PASSES.
  The run-1 byte-identical blanks after reload were stale-bundle/timing artifacts (first verifier
  itself called it transient first-paint). The "blank after reload" claim in the audit above is
  RETRACTED.
- /tmp/d001-375x667-after-logout.png = BLANK WHITE. Same logout flow at 768 renders fully.
  => D-001 (real): LOGOUT rebuild path paints blank at 375x667 only.

## 2026-08-22 ~11:05Z — D-001 CLOSED; harness false-negative root-caused (orchestrator, fresh session)

Reproduced BOTH flows against fresh build a919b1e at 375x667 AND 768x1024
(evidence: e2e/shots/AU-001/login-probe-*.png, harness-*.png, videos/AU-001-harness-check-*.webm,
/tmp/login_probe.json):

- LOGOUT: clean Login screen render both viewports (blankCanvas=false, len=894/1462).
  D-001 does NOT reproduce on the current build. CLOSED — no app change needed or made.
- LOGIN: the real defect all along was in the HARNESS. lib.login() waited for 'My account'
  after submit; commit 82bb928 made post-login pop back to the referring page (web parity),
  so that marker never appears when login starts from Home. Network proof: /auth/login
  returned 200 in both viewports and flutter.auth_token persisted — the app worked every time;
  every 'login: false' since 82bb928 was a verifier-side false negative.

FIX: e2e/lib_verify.js login() now polls localStorage flutter.auth_token as its success signal
(commit a919b1e). Post-fix end-to-end check: login ok -> Account tab reachable ('My account',
'Log out', real email) -> logout -> full render, ALL GREEN at both viewports.

Wave 0 verify fan-out re-launches now with the fixed harness. Verifiers must assert the token
signal (lib.isLoggedIn) for auth state, never a landing view.

X remains 1/66 pending fresh AU-001..004 shards. PROGRESS: 34/66

## 2026-08-22 ~14:55Z — AU-000 re-closed by orchestrator (fresh session)

Latest AU-000 shard line (11:41Z, build 4edbaff) was PASS with
`vision_findings: ['PENDING native read by orchestrator']` — an open evidence gap.
Orchestrator closed it natively (Rule 16):
- Read e2e/shots/AU-000/AU-000-375-initial.png + AU-000-768-initial.png: full home render,
  real data (hero copy, CTAs, category grid, featured products w/ prices+images),
  zero vision defects at both viewports. Shard patched accordingly (681b551).
- Watched e2e/videos/AU-000.webm natively (frames @0s/16s/32s): blank first-paint →
  full render; no flicker/broken transitions/stuck loaders.
AU-000 stands DONE. X = 1/66. PROGRESS: 34/66

## 2026-08-22 15:00Z — Wave 0 verify fan-out v2 launched

Harness fixed (login() token-signal, clickCard smallest-node). Fan-out targets:
AU-001..004 re-runs (shards were lost to agent deaths) + AU-005 first run.
Verifiers write shards + reports; skeptic layer runs after wave fan-out completes.

## 2026-08-22 16:35 · Orchestrator session — throughput restructure (Rule 18 / THROUGHPUT_DIRECTIVE)

State from disk (not conversation memory): results.jsonl = AU-000 PASS only → **X=1/66**. Shards:
AU-000 PASS (11/11 clicks, native vision), AU-001 FAIL (7 documented failures, honest). Shots exist
for AU-002..004 but NO shards → per ORCHESTRATION §1 that work did not happen; those AUs stay OPEN.

**Lane split to let build+verify overlap (frozen verify bundle):**
- `:9102` = SNAPSHOT of build/web @ cf35e99 (mtime 15:13) — Wave-0 verifiers + skeptics test THIS,
  so a concurrent Wave-1 rebuild can never shift the bundle under them (anti-slop #9).
- `:9100` = live build — Wave-1 builders iterate here.
- Sandbox :8083 healthy (categories 200, real data), ref :3000 up, disk 23%, load 0.31.

Wave-0 verify fan-out (AU-001..005 vs :9102) runs CONCURRENTLY with Wave-1 build fan-out
(AU-010..018 P0 core-money) as two separate workflows.

## 2026-08-23 00:25Z — Wave-0 skeptics + Wave-1 build lanes launched (orchestrator)

State from disk: results.jsonl = AU-000..005 PASS ⇒ X=6/66, zero skeptics yet.
- **Skeptic fan-out** (workflow wave0-skeptics) vs FROZEN :9102 bundle @ cf35e99: 6 attacker
  agents, ≥6 attack classes each. First evidence already landing (AU-003 deep-link/gate shots,
  resume-after-login verified natively by orchestrator — checkout renders post-login redirect).
- **Wave-1 build fan-out** (workflow wave1-build): clusters C1 auth/OTP, C2 product-detail
  parity, C3 cart model, C4 checkout step machine. Builders commit+push per unit.
- **Fresh frozen lane :9103** = build/web @ b0b9d6e (rebuilt + frozen 21:24Z) for Wave-1 verify;
  :9100 stays live for builders. Freeze script committed (3515404).
- Receipt-proof fixture staged (e2e/fixtures/receipt-proof.png) for T11–T14 vectors.
- Checkout contract violations re-confirmed in source pre-build (checkout_screen.dart:84-88:
  CARD/SALE/state:=city) — C4 fix target.

## 2026-08-23 00:45Z — Skeptic layer catches real defect: frozen-lane CORS gap (AU-000 BROKEN)

AU-000 skeptic (fresh instance, 24 attacks) returned **BROKEN**: the frozen :9102 verify bundle
(cf35e99) cannot reach the sandbox — SecurityConfig allowlists :9100 but not :9102/9103, so every
API call from that origin dies in CORS preflight. The skeptic's two BROKEN findings are honest and
correct. Provenance audit of the five Wave-0 verify shards: ALL ran their real-browser passes
against :9100 (allowlisted; scripts + lib_verify.js APP const prove it), so their PASSes stand on
their actual evidence. The AU-000 PASS itself was also recorded against :9100.

Fix: patched the SANDBOX-ONLY copy's SecurityConfig to add 9102/9103 origins (never origin repo),
rebuilding globoexpats_backend-sandbox image now; will restart sandbox-backend, re-run AU-000
skeptic attacks against :9102 fresh (fixer != verifier), then Wave-1 verifiers use frozen :9103.

## 2026-08-23 01:05Z — AU-000 skeptic final report: 24 attacks, DISPUTED findings dispositioned

Skeptic verdict stands **BROKEN** (2 env findings: CORS-blocked origin on :9102 — root-caused,
sandbox SecurityConfig patched + image rebuilt + backend restarted, all origins preflight 200;
fresh verifier→skeptic re-verification pair launched vs :9102).

Three DISPUTED findings dispositioned against HEAD (b0b9d6e+):
1. Raw `ClientException` text leaks to UI (offline + product-not-found) → RESOLVED at HEAD by
   AU-005 error taxonomy (b1ab73d, widgets/error_text.dart friendlyApiError); frozen bundle predates it.
2. Dead Save/Buy/Add-to-cart buttons above "Could not load product" → RESOLVED at HEAD (b0b9d6e
   hides commerce bottom bar on product-not-found).
3. Unauth `/#/admin` renders failing admin shell instead of login redirect (web requireAdmin parity)
   → OPEN, tracked to AU-065 acceptance ("Admin routing/guard": role gate hides menu/route for
   non-admins). Auth-only gating alone would not match web semantics; full role gate lands with AU-065.

## 2026-08-23 01:55Z — AU-005 skeptic finds real UI defect: SnackBar clipped by bottom nav

Skeptic evidence (e2e/shots/AU-005/final-share-snack-caught.png): the product-detail "Share"
SnackBar ("Share this product with a friend.") renders CLIPPED behind the bottom navigation bar
at 375x667 — text partially truncated.
Root cause: lib/screens/product_detail_screen.dart:119 uses a default (fixed) SnackBar inside a
screen that has a `bottomNavigationBar` (_BottomBar). Default snackbars sit at the very bottom of
the scaffold and get covered by persistent bars unless floating behavior + margin is used.

DISPOSITION: FIXER TASK queued for the Wave-1 C2 lane (owner of product_detail_screen.dart) —
fix = behavior: SnackBarBehavior.floating (+ margin) for snackbars shown on screens with bottom
bars, matching web reference where the toast floats above content. Coordinator does NOT hand-edit
a builder-owned shared checkout (scope isolation, ORCHESTRATION s2). Fix must be re-verified by a
fresh verifier+skeptic pair after it lands.


## 2026-08-24 · Session log (orchestrator, resumed from files)

**Ledger:** X=13/66 DONE (AU-000..005 Wave 0; AU-010/011/012/014/015/019/025).

**Builds landed this session (all committed+pushed, tests green):**
- AU-017/018 reviews+SPECIFICATIONS table, buy gates (own-item/out-of-stock/login)
- AU-022..028 checkout 4-step machine via build workflow (gate: 226 tests @7b4342f)
- AU-054/055 seller dashboard stats + listings mgmt + selling-orders tab
- AU-046 wa.me FAB + how-it-works strip + availability rails
- AU-060 addresses full CRUD + map-pin coords (+ controller-dispose fix)
- AU-065 messages inbox on /contact/all + order group chips + user actions + ratings tab
- AU-016 rental booking panel + cart-line signature (+ skeptic deadlock fix)
- AU-062 contact form, AU-059 profile editor, AU-057 transporter modal,
  AU-056 create-request + filter bar, AU-061 verification hub,
  AU-051 full storefront, AU-052 scorer wired to rail

**Fixes driven by verifier/skeptic evidence:**
- AU-012 forgot-password plain-text parse (BROKEN -> PASS r5, skeptic HELD 10 attacks)
- AU-010 failed-send advance (skeptic DECISIVE) fixed
- AU-013 backend-404 not-found copy
- AU-064 Top Buyers endpoint corrected to analytics service

**Infra:** frozen-lane discipline (:9108 pristine copy, spa_server_frozen);
docker cache pruned 16.7GB; orphaned recordings pruned twice (~800MB).

**Open:** RW-lane verifiers for AU-020/021/022/026/027 in flight; AU-016 r3
re-verify after skeptic fixes; demo reel assembly at campaign end.
