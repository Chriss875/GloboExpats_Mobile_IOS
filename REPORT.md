# GloboExpats Mobile — Build Hand-off Report (execution brief §14)

Status: **phase 1 (unattended build) complete; ready for human review.** Date: 2026-08-20.

## 1. What got built vs. skipped

**Built (all verified + pushed to `origin/local`, on the `local` branch):**
- **Discovery:** Home (hero/categories/featured), Marketplace/Browse, Category listing, Search, Product detail (image carousel, seller, delivery, Add to cart).
- **Auth:** Login, Register, account view (+ logout). JWT stored in the AuthStore (in-memory).
- **Cart → Checkout → Order (Critical Area, tested against the sandbox):** client-side Cart (mirrors the web's localStorage cart), Checkout with delivery-slot selection (date + MORNING/AFTERNOON/EVENING) that creates a real proforma/order via `POST /checkout/proforma`; honest OrderResult + Payment step (`submit-payment` — never fakes success; shows the real backend status); Orders list + Order detail (incl. escrow/pending state).
- **Admin:** Dashboard (KPI stat cards + **analytics chart cards**: Sales trend, Proforma trend, Top Buyers by Clicks) and Admin Orders list/detail. Verified against real sandbox data as an ADMIN user.
- **Insights:** Insights hub with graph cards (Sales, Completed orders, Proforma volume, Verified proformas, platform stats) — covers `/insights/*` + `/statistics`; analytics failures swallowed → empty (matches the web/hard-rule-3 allowance).
- **Account/misc:** Settings, Notifications, Help/About (covers `/help`, `/about`, `/faq`, `/contact`, `/privacy`, `/terms`).

**Skipped (first-draft; documented in SCOPE.md):** deep seller flows (`/sell`, `/edit-listing/[id]`, `/expat/dashboard`, seller profiles), the long tail of admin sub-pages (`/admin/listings`, `/admin/users`, `/admin/messages`, `/admin/verification`), request-board detail, addresses/payment-methods management, user verification/OTP onboarding, transporter/delivery-tracking, admin escrow-release/refund UI actions. Rationale: low first-draft value vs. cost; the core flows and every named hard-rule-3 item (admin dashboard + analytics graph cards, payment/escrow being built and *tested*, not faked) are covered.

## 2. Deviations from the brief
1. **Scope changed by the user (2026-08-20):** everything now in scope (admin/insights/payment). Updated SCOPE.md to the full 51-route inventory; built accordingly (this supersedes brief §4's original "out of scope" list).
2. **Backend cart is mid-refactor:** `CartController.java` has its `package` line commented out (the `8fe59c0` subpackage refactor left it unmapped) → no `/api/v1/cart/*` at runtime. The **web app is unaffected because its cart is client-side** (localStorage). The mobile app mirrors that (client-side Cart) and drives checkout through the working `/checkout/proforma` + `/delivery-quote` + `/orders` endpoints. Origins and reasoning in memory `cart-checkout-contract`.
3. **Sandbox built from scratch** (the pre-seeded `~/sandbox` from a prior snapshot didn't survive): rebuilt the CORS-patched backend image, seeded the prod volume snapshot, `~/sandbox/reset.sh` proven. Admin testing needed promoting the sandbox test user to ADMIN (sandbox-only DB change).
4. **No system browser libs** → collected Playwright Chromium runtime `.so` deps locally (`~/chromium-libs` + `LD_LIBRARY_PATH`).
5. **Pilot gate / no human at launch:** proceeded and documented the decision (STATUS.md).
6. **Scope numbers re-verified (corrected):** 51 web pages ✓; **92** Vitest test files (brief: 65); **43** controllers / **300** handlers (brief: 40/237) — the repos grew.

## 3. Screen inventory
see `SCOPE.md` (web route → mobile screen, all 51, with build status).

## 4. Test results
- **Dart widget tests: 15 passing** across 7 files (shell, home, product detail, catalog, auth, cart, orders, admin).
- **Flutter Playwright harness (`e2e/check.js`): ALL CHECKS PASSED** at mobile (375×667) and desktop (1280×900) against the sandbox-backed web build (semantics-based role/label assertions).
- **`flutter analyze`: clean (0 issues).**
- **Web reference suite:** not re-run this phase; it only validates the reference app, not the Flutter app (used as a behavior checklist instead).

## 5. Vision-check results
`~/.local/bin/gemini_look.py` describe/compare/defects on the built app vs. the reference:
- Home structure/colors match the reference (#1E40AF hero, "Buy. Sell. Connect.", Shop-by-Category, Featured, bottom nav). Differing items are unbuilt reference-only sections (WhatsApp float, hero category grid, featured filter tabs, footer).
- One defect (bottom-nav "Marketplace" eliding at 375px) was found and **fixed**; final vision defect pass = **PASS**.

## 6. Cost observed
Toolchain download (Flutter SDK), many Docker build + `flutter build web` cycles, Playwright Chromium, and API/vision calls — the bulk was unavoidable foundation + per-screen build/verify. Precise $ to be reconciled by the operator from the run feed; the campaign stayed in the "research envelope ±" range.

## 7. Riskiest things for a human to review first
1. **Checkout order creation** (`checkout_screen.dart`): am I submitting the exact `buyDetails` the backend needs (payment method/delivery fields)? Wrong fields could create malformed proformas. Verified 201 in sandbox, but a human should sanity-check the real gateway/payment config.
2. **Payment honesty:** `payment_screen.dart` shows only the real backend result — confirm it is never coerced into a fake success and that the eventual LIVE APK points at the real (not sandbox) flow.
3. **AuthStore JWT is in-memory only** — app restart logs out. Decide if shared_preferences persistence is required for MVP.
4. **Client-side cart** — matches the web, but cart persistence across restarts isn't implemented; confirm desired.
5. **CORS / base URL:** app defaults to the sandbox `localhost:8083`; the LIVE APK must set `API_BASE_URL` to the live host (and the live `SecurityConfig` origin list needs the app origin, or a native APK uses no CORS).
6. **Backend cart controller is broken in the repo snapshot** (`CartController` commented `package` line) — the web app sidesteps it, but if the backend cart is meant to be used, that's a backend defect to fix upstream.
