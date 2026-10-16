# CLAUDE.md — GloboExpats Mobile (Flutter)

You are building GloboExpats' **existing web app** as a **Flutter mobile app**. The web app
(`~/GloboExpats_Frontend`, Next.js) is the source of truth for screens, flows, copy, and behavior.
The execution brief (`~/ultracode-agent/globoexpats-autonomous-build-brief.md`) is the mission
scope; the server reality lives in `~/ultracode-agent/CLAUDE.md`. **Read the brief before acting.**
This file is the mobile repo's operating memory.

## Mission & scope

- Deliver an **~80–90% first-draft Flutter mobile app** (~25 curated screens) that mirrors the web
  app, **verified by our own checks** (Dart widget tests + a Playwright harness against
  `flutter build web`), then hand a **functional APK pointed at the LIVE backend** to the team.
- **IN scope:** auth (login/register), home/discovery (home, browse, search, categories), catalog
  (product detail, listing, saved), cart & checkout through **delivery-slot selection / order
  creation** (against the **sandbox**).
- **OUT of scope:** payment / escrow / refunds (render the "payment not available in this demo"
  guard — **never fake a success path, never touch money logic**), admin & insights dashboards.

## Environment (this server)

- **Flutter** is a home SDK install at `~/flutter/bin/flutter` (add to PATH). `flutter build web`
  is the headless verification target. WebKit is not installed; "mobile fidelity" = iPhone-SE-sized
  Chromium (≈375×667) + desktop.
- **Sandbox backend** (all testing): Postgres on **5543**, Spring Boot backend on **8083**. See
  `~/sandbox`. Never touch the dev (`backend-app`/`backend-db`/`backend-redis`) or live backend.
- **API base URL:** the Flutter app talks to the backend directly (no proxy). Point it at the
  **sandbox** for development/tests; flip to **live** only for the final APK endpoint.

## Hard rules

1. **Never touch the live backend (10.123.23.22) or production data** — live is only the APK's
   final endpoint. All experiments happen in the sandbox.
2. **Never touch the dev backend** or the live `expat_platform` database.
3. **Payments/escrow/refunds are OUT.** Stub with a visible demo guard. **Never fake a success
   path.** Order creation through delivery-slot selection IS in scope (sandbox only).
4. **Never call a task done on failing or skipped checks.** Build → Test → Look → Check → Repeat.
5. **No secrets in the repo.** Credentials live in `~/.claude/agent.env` / `~/.env`.
6. **Git hygiene:** own identity; small conventional commits (`feat(mobile):`/`fix(mobile):`);
   never rewrite pushed history; never commit `.env`, build artifacts, `.dart_tool/`, `build/`;
   **commit + push to `origin/main` after EVERY unit of work** — a milestone is
   not done until it's pushed (the remote is the insurance).
7. **Critical logic** (order lifecycle, delivery slots/deadlines, price/fee math, auth): smallest
   diff, explicit reasoning in the commit, run every relevant test, confirm against the sandbox.
8. **Monitor server disk** (`df -h /`, `docker system df`) — prune the Docker build cache
   before it fills the disk; keep `/` well under 70%. The server has crashed twice from a full disk.

## Verification (what "tested" means here)

| Check | How |
|---|---|
| Logic | Fresh Dart widget tests (behaviors mirror the 65 web Vitest tests, written fresh in Dart) |
| Real browser | Playwright harness against `flutter build web` served locally, mobile + desktop viewports; assert roles/labels/states, not pixels |
| Visual | Screenshots → `~/.local/bin/gemini_look.py` (GOOGLE_GEMINI_API_KEY) |
| Data | Real calls against the **sandbox** backend (8083): filled forms, listings, delivery-slot selection |
| Finish line | No task is done while a check is failing |

## Operating loop

Build → Test → Look → Check → Repeat, unattended. Report deviations in the final hand-off.
Run ONE pilot screen through the full loop first and show a human (or document their absence).
