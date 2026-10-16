# AGENTS.md — GloboExpats Mobile

Agent conventions for the Flutter mobile repo. Follow the server `CLAUDE.md` and the execution
brief; this file covers repo-specific rules.

## Git workflow

- Branch policy: work on **`main`** for this mobile repo. Commit Flutter work on
  `main` and push to `origin/main` after each unit of work.
- **Commit + push after every unit of work** (each screen, each milestone, each working test
  batch). Never accumulate uncommitted work; never leave work only on this server's disk.
- Conventional commits: `feat(mobile): …`, `fix(mobile): …`, `docs(mobile): …`, `test(mobile): …`.
- Small, focused commits; `git pull --rebase` before push; never rewrite pushed history.
- Never commit: `.env`, `.dart_tool/`, `build/`, `*.iml`, `.idea/`, secrets, build artifacts.

## Critical areas — extra care, never rushed

- **Order lifecycle & time-based logic** (status transitions, fulfillment, deadlines, delivery
  windows, delivery-slot selection).
- **Price / fee math** (order totals, delivery fees, commissions, currency conversion).
- **Auth & security** (JWT handling, credentials, PII, data exposure).
- For these: smallest possible diff, explicit reasoning in the commit, run every relevant test
  (Dart widget + harness + data check against the sandbox). When in doubt, stop and ask.

## API wiring

- Base URL → **sandbox** `http://localhost:8083` (dev testing). The final APK points at **live**
  and is set only after the sandbox works AND the dev backend is verified.
- Auth is JWT (`Authorization: Bearer <token>`). Public endpoints are `permitAll`; the rest
  redirects to Google OAuth2 for unauthenticated web requests — test with public endpoints first,
  then with a real JWT.

## Testing

- Write **fresh Dart widget tests**; treat the web app's 65 Vitest tests as a **behavior
  checklist**, not portable code.
- Run the Playwright harness against `flutter build web` at mobile (≈375×667) and desktop sizes.
- Use the vision helper to judge layout/color/spacing against the web reference.
- A task is not done while a check is failing.
