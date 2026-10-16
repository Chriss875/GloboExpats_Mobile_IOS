# VERIFY_RECIPE — Campaign V2 stack recipe (replaces the Gemini-era recipe; Rule 16)

## Environment
- Flutter web build served at **http://localhost:9100** (`flutter build web` → `build/web`, `python3 -m http.server 9100 -d build/web`)
- Reference Next.js at **http://localhost:3000** (THE JUDGE — same sandbox data, same viewport)
- Sandbox backend **http://localhost:8083** (public endpoints permitAll; rest 302→OAuth unauth)
- Sandbox Postgres **:5543** (user postgres, db expat_platform)
- Chromium needs `LD_LIBRARY_PATH=$HOME/chromium-libs/usr/lib/x86_64-linux-gnu`

## Accounts (sandbox only)
- BUYER/ADMIN/SELLER all-in-one: `mobile.test.20260820@gmail.com` (password in lib_verify.js BUYER const)

## Viewports (mandatory per AU)
- 375×667 (phone) AND 768×1024 (tablet); admin/insights AUs add 1280×900 desktop.
- Reference parity runs use the SAME viewport + same sandbox entity.

## Vision = NATIVE (Rule 16)
- The agent Reads PNGs DIRECTLY with the Read tool. There is NO gemini(), NO gemini_look.py,
  NO GOOGLE_GEMINI_API_KEY anywhere in this stack. Do not restore them.

## Video evidence (mandatory)
- `ctx = await lib.newCtx(browser,{viewport:{width:375,height:667}, videoPath:'e2e/videos/<unit>.webm'})`
- End with `await lib.closeVideo(ctx,'e2e/videos/<unit>.webm')`; agent then WATCHES the webm natively.
- Cap e2e/videos/ at 2 GB; compress/delete raw after demo reel assembly.

## Canonical checklist = CAMPAIGN_V2.md Appendix A (pasted verbatim into every verifier prompt).
## Skeptic brief = CAMPAIGN_V2.md Appendix B.

## Results
- Shards: `e2e/results/shards/<UNIT>-verify.jsonl` and `<UNIT>-skeptic.jsonl`
- Merged canonically at wave barriers into `e2e/results.jsonl` (schema CAMPAIGN_V2 §6).
- Validator enforced at merge: PASS ⇒ real_data=true, images_200==images_requested,
  buttons_failed==[], vision findings enumerated (or explicit zero-defect citing PNG paths),
  parity.blocker==0 && parity.major==0, every evidence path exists on disk.

## Build freshness (anti-slop #9)
Every verifier asserts the served bundle is newer than wave start:
`curl -sI http://localhost:9100/main.dart.js | grep -i last-modified` + records build sha
(`git -C ~/GloboExpats_Mobile rev-parse --short HEAD`) in its shard line. Stale ⇒ rebuild, never test old bundle.

## Frozen-lane discipline (added 2026-08-24)
Verify lanes MUST serve a **pristine copy** of build/web made at wave freeze
(`cp -r build/web /tmp/frozen_web_<port>` with WIP stashed), never the live
`build/` dir — a parallel builder running `flutter build web` silently changes
the served bundle's Last-Modified and BLOCKs every verifier on the freshness
check (this invalidated lane :9108 mid-wave). Current frozen lane:
**http://localhost:9108 — sha e46b732, main.dart.js mtime Mon, 24 Aug 2026 02:10:55 GMT**.

**UPDATE 2026-08-24 06:20**: frozen lane :9108 now serves a rebuilt bundle of
the same HEAD **7b4342f** (rebuilt at 06:13 local / Last-Modified
"Mon, 24 Aug 2026 03:13:31 GMT") after the checkout-gate's final build. Both
mtimes (03:02:36 and 03:13:31) refer to valid pristine 7b4342f bundles —
verifiers may accept EITHER, provided `Select your rental dates` appears in
main.dart.js (content check beats timestamp when copies race).

**UPDATE 2026-08-24 12:02**: frozen lane :9109 rebuilt at HEAD b1f8757
(Last-Modified "Mon, 24 Aug 2026 09:01:30 GMT") — contains the AU-022 C3 fix
(cold deep links honor Uri.base.path, login gate + returnUrl fire on /checkout)
plus all session builds. AU-022 r3 verify must use this bundle; the canonical
AU-022 FAIL stands until that re-verify passes.

**UPDATE 2026-08-25 16:30**: GitHub hard-rejects files >100MB on push. Policy: any
per-unit recording must stay <100MB (target <20MB per ORCHESTRATION §3) — if a raw
capture exceeds it, compress with ffmpeg (`-crf 30 -preset veryfast`, scale to
viewport) BEFORE `git add`. The two AU-006 sweep re-captures (113MB/101MB working-tree
versions) stay at their committed (smaller) versions; live re-captures for AU-006 must
be compressed first.

**UPDATE 2026-08-26 04:00**: frozen lane **:9130 — sha a405494, main.dart.js
Last-Modified "Wed, 26 Aug 2026 00:58:48 GMT"**. Contains ALL session fixes:
AU-040 draft/bytes-image chain (c633384..858b0ef), AU-039 role-gated card +
buyer self-confirm + backend lockout patch (sandbox image 8a800d3b), AU-047
body-bound filters + grid/list toggle + neighbourhood parse (44bf240),
AU-052 newest-pool top-4 rail (7c65ea5), AU-055 timeline a11y fix (a405494).
ALL re-verifies and first-time verifies MUST use :9130.

**UPDATE 2026-08-26 05:15 (ENV FIX — receipts volume)**: payment receipts are stored
under `/app/private-receipts` (ephemeral container layer) — every `sandbox-backend`
recreate SILENTLY DELETED uploaded receipt files while DB rows survived, producing
404 previews + cascading T16 failures in AU-042 rounds. Fixed: `~/sandbox/docker-compose.yml`
now mounts named volume `sandbox-receipts:/app/private-receipts`. Round-trip proven:
upload → `private-receipts:<uuid>.webp` → admin proxy 200. Verifiers recreating the
backend container no longer lose receipts.


## UPDATE 2026-08-26 07:55 — CURRENT FROZEN LANES
- **:9131 @ c6b4d61** (main verify lane; contains AU-038 cc31ae6 + AU-039 a11y 842bd6d),
  Last-Modified Wed, 26 Aug 2026 04:41:42 GMT. Bundle dir ~/.verify_bundles/c6b4d61.
- :9130 @ a405494 (older, kept for reference only — lacks the two fixes above).
Freeze recipe: `flutter build web` on HEAD then `PORT=9131 e2e/freeze_verify_bundle.sh <sha>`.
