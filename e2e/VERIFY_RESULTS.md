
## 2026-08-25 · Session: batch4/5/6 fan-out + AU-053/AU-061/AU-064 builds

**State at open:** X=19/66 canonical; dirty tree from the dead prior session
(AU-034..043 code uncommitted, merge_shard.py readline bug).

**Fixed infra this session:**
- `merge_shard.py` read the FIRST shard line (stale FAILs); now reads the LAST line
  of append-only shards. Two wrongly-merged FAIL rows purged and re-merged.
- Re-merged verified shards: AU-013 r4 PASS, AU-023 PASS, AU-046 PASS -> X=22.

**Built + pushed this session (all tests green at each step):**
- AU-040 C2/D1: web-proofed draft restore (_restoreTick rebuild) + bytes-based
  PendingImage (thumbnails actually paint on web).
- AU-054 D3: Delivery-tracking tile routed to /orders.
- AU-040 copy parity: step-2 validation text matches reference exactly.
- AU-055 C-REQMGT/C-SAVED: request owner action row (Edit/Fulfil/Close/Delete w/
  confirm dialogs, fetchRequestById refresh), SavedItemsScreen at /account/saved,
  nudge gating = reference canNudge (!owner && PENDING). Old test fixtures fixed
  from invalid 'OPEN' to real 'PENDING' status.
- AU-053: full EditListingScreen replacing the legacy empty-form edit route —
  prefills everything from itemDetails, SPECIFICATIONS parsed back out,
  promotional>asking inverse rule, WhatsApp locked.
- AU-061: org-email verification path (sendOTP authed + verifyOTP) in hub.
- AU-064: analytics-service client (ANALYTICS_BASE_URL dart-define -> :8084
  sandbox instance reading the sandbox db) + admin overview chart suite
  (summary/revenue/verification/top-clicked/cumulative cards, blank-when-empty).

**Sandbox infra added:** sandbox-analytics container (:8084) on the sandbox
network reading sandbox-db — 5/5 analytics endpoints verified with admin JWT.
Matomo-enabled bundle variant at lane :9114 for AU-063 (token via --dart-define;
localhost-only lane).

**APKs rebuilt at HEAD:** GloboExpatsMobile-{live,sandbox}-0825.apk. INTERNET
permission confirmed in binary manifest; live endpoint baked, zero localhost refs.
Device leg BLOCKED (no emulator/KVM on host) — recorded honestly in the AU-007 shard.

**Workflows live:** batch4 (17 lanes vs :9112 @858b0ef), batch5 (7 lanes:
skeptics 013/023/046 + first verifies 028/032/033/042), batch6 (13 lanes vs
:9113 @bca6414 / :9114 matomo). Shards merge to canonical as skeptics land.
