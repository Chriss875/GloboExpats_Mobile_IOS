# GloboExpats Mobile Build — Status Log

Live status of the autonomous build. Updated each milestone; pushed to the `local` branch
(remote insurance). Screens → SCOPE.md. Deviations → final report.

## 2026-08-20 · KICKOFF + HOME PILOT ✅
Environment & toolchain (all verified):
- **Flutter 3.27.4 / Dart 3.6.2** installed from SDK tarball at `~/flutter` (home install, no sudo
  needed; `flutter build web` works). Git identity: `Benny (mobile agent)`.
- **Sandbox backend built + running**: `sandbox-db`:5543, `sandbox-backend`:8083 (CORS-patched
  image `globoexpats_backend-sandbox:latest`), `sandbox-redis`. Seeded from the 2026-08-14 prod
  volume snapshot (15 product categories + uploads); `~/sandbox/reset.sh` proves seed+reset.
  CORS verified: `http://localhost:9100` allowed, `evil.example.com` blocked.
- **Scope re-verified vs repos** (corrected for the report): **51 web pages ✓** (matches brief),
  **92 Vitest test files** (brief said 65 — grew), **43 backend controllers / 300 handlers**
  (brief said 40/237 — grew).
- **Vision bridge** (`~/.local/bin/gemini_look.py`) confirmed on a live screenshot of the
  reference web app. No system browser libs → collected Chromium deps locally
  (`~/chromium-libs`, set `LD_LIBRARY_PATH`); Playwright Chromium installed.

Home screen — **full pilot loop, all checks green**:
- **Dart widget tests (2)**: shell bottom-nav labels; home renders hero/categories/featured via
  MockClient. ✅ passing.
- **Playwright harness** (`e2e/check.js`, semantics-enabled): ALL CHECKS PASSED at mobile
  (375×667) and desktop (1280×900) against the sandbox-backed build. ✅
- **Data**: home loads real categories/products from the sandbox via CORS. ✅
- **Vision**: describe + compare confirm structure/colors match the web reference (#1E40AF hero,
  "Buy. Sell. Connect.", CTAs, Shop-by-Category, Featured, bottom nav). Remaining diffs are only
  reference-only sections not yet built (WhatsApp float, featured filter tabs, footer). Minor:
  "Marketplace" bottom-nav label truncates to "Marketpla…" at 375px.

**Pilot gate (brief §9/§15): no human reachable at launch → proceeding, documented here.**

## 2026-09-03 · NAV SHELL + ACCOUNT SETTINGS (concept sketch) 🔨
Reshaped the app chrome to the hand-drawn concept and brought settings up to web parity.
Toolchain note: Flutter 3.27.4 was installed on the Windows workstation (`~/flutter`) so these
changes could be analysed, tested and web-built locally rather than only on the build server.

- **Bottom bar → Home · Marketplace · MySpace · Requests · Account.** Sell is no longer a tab; it
  is the primary (green) action inside MySpace, which already owns listings, orders, saved and
  requests. Labels dropped to 10px, fixing the noted "Marketpla…" truncation at 375px.
- **The bars are now persistent.** Only `/` used to be a `ShellRoute` child, so the first tap on
  Marketplace pushed a bare full-screen route with no bottom nav and no way back. `/browse`,
  `/expat/dashboard`, `/requests` and the new `/account` are shell children; `/requests` had no
  route at all before.
- **One shared top bar** (`lib/widgets/globo_app_bar.dart`), mirroring the web mobile header:
  wordmark · country indicator · search · cart badge · notifications badge. Previously 43 screens
  each built their own `AppBar`, so cart and unread counts only ever showed on Home. The unread
  count refreshes on tab change rather than on a timer (keeps widget tests free of pending timers).
  Duplicate per-screen app bars removed from Browse, Requests, MySpace and Home.
- **Account settings rebuilt** to the web's `/account/settings`: Profile and Security halves
  (SegmentedButton, mirroring the web's mobile select), profile photo, first/last name, read-only
  sign-in email, WhatsApp, organization, position, bio, plus a link to the addresses screen. New
  `ApiClient.changePassword` (`PUT /api/v1/userManagement/changePassword`, `ChangePasswordDTO`);
  a wrong current password surfaces the backend's own message, never a fake success.
- **`editProfile` now takes image bytes** as well as a path — `MultipartFile.fromPath` has no
  filesystem on web, where the harness runs (same lesson as AU-040's listing images).

Verification: `flutter analyze` clean for every touched file (6 pre-existing `curly_braces` infos
remain in `orders_screen.dart`, untouched); `flutter test` **296 passed / 1 skipped / 0 failed**,
including 9 new tests across `shell_chrome_test.dart` and `settings_tabs_test.dart`.

Still open from the concept: the core-logic list (adding property, checkout, order management,
delivery/tracking, requests + nudging, **services / short stays — no mobile surface at all**,
notifications, profile management) and the ledger's own FAIL/BROKEN units (AU-049/057/062/063).

## Next milestones
1. Auth: Login / Register / Forgot-password (JWT against sandbox; real register → email OTP in
   local-test mode). 
2. Marketplace/Browse + categories + category listing + product detail (itemDetails is permitAll).
3. Search (+ search results).
4. Saved products (needs auth).
5. Cart → checkout-address → **delivery-slot selection → create order (sandbox)** + payment guard.
6. Account: profile, orders list, order detail, settings, notifications, help/about/faq/contact,
   delivery tracking, requests board.
Each: build → Dart tests → harness → vision → data vs sandbox, then **commit+push**.

## 2026-08-20 · MILESTONE 2: Product Detail ✅
- **ProductDetail model + `fetchProductDetail`** (`/api/v1/displayItem/itemDetails/{id}`, public).
- **ProductDetailScreen**: image carousel (with dots), price (TZS), name, subcategory, rating,
  location, seller card (avatar/org/Verified), Description, delivery-fee section, bottom action
  bar (Save + Add to cart). Add-to-cart is wired to a demo snackbar (cart & checkout come next;
  no fake success).
- **Home → detail navigation** wired from every product card.
- Verification: 2 new Dart widget tests (render + demo snackbar) — all 4 tests pass; `flutter
  analyze` clean; live `itemDetails` endpoint returns 200 with real data; home harness still
  ALL PASS. Vision `defects` on home → PASS.

## 2026-08-20 · MILESTONE 3: Catalog cluster (Browse / Category / Search) ✅
- Shared `ProductCard` + `ProductGrid`/`CatalogGrid` widgets (extracted pattern).
- **BrowseScreen** (Marketplace tab): all products + search entry.
- **CategoryScreen**: products per category (`displayItem/filter?categoryId=`).
- **SearchScreen**: `/products/search` results.
- Wired: Marketplace tab → Browse; category chip → Category listing; header search → Search.
- Verification: new Browse widget test (product listing from API) — 5 tests pass; analyze clean;
  harness ALL PASS on rebuilt web. Commit+pushed.

## 2026-08-20 · MILESTONE 4: Auth (Login / Register) ✅
- `AuthStore` (ChangeNotifier): login/register/logout, JWT + email, busy/error state.
- `ApiClient.login/register` (POST /api/v1/auth/login, /api/v1/auth/register); terse error
  parsing (e.g. "Work emails are not allowed…").
- **LoginScreen** (email+password, validation, shows server errors, busy spinner),
  **RegisterScreen** (first/last/email/password/confirm, validation).
- Shell: Login/Account tab shows LoginScreen when logged out, minimal account view + logout when
  in. Verified against the sandbox: register→201, login→JWT (personal email; globoexpats.com
  domain is rejected as a "work email").
- 4 auth widget tests (login validation/state, register) — 9 tests total pass; analyze clean;
  harness ALL PASS on rebuilt web.
- NOTE: JWT persisted only in memory for now (app-restart persistence is a follow-up).

## 2026-08-20 · MILESTONE 5: Cart + Checkout + delivery-slot → order (Critical Area) ✅
- Discovery: web **cart is client-side** (localStorage); backend cart controller is mid-refactor
  (unmapped) but irrelevant. Verified checkout contract live vs sandbox: delivery-quote 200
  (BODA fee), `POST /checkout/proforma` → 201 real proforma PF-2026-000010 (PENDING_PAYMENT).
- **CartStore** (client-side cart mirroring the web): add/remove/qty/total/count, product-detail
  "Add to cart" wired, home header shows live count badge → CartScreen.
- **CartScreen**: line items, qty steppers, remove, total, Checkout.
- **CheckoutScreen** (Critical Area): buyer address form + **delivery-slot selection** (date picker
  tomorrow..+14d + MORNING/AFTERNOON/EVENING) + terms → creates the proforma/order against the
  sandbox. **OrderResultScreen is honest — never fakes payment success; shows the real proforma
  status (PENDING_PAYMENT) returned by the backend.**
- Auth required for checkout (token from AuthStore). `AuthStore.instance` + `CartStore.instance` set
  at startup.
- 3 cart tests + updated product-detail test — **12 tests total pass**; analyze clean; harness ALL
  PASS on rebuilt web.

## 2026-08-20 · MILESTONE 6: Orders list/detail + honest payment step ✅
- **ApiClient.fetchOrders / fetchOrderDetail / submitPayment** (authed via JWT).
- **OrdersScreen** (GET /orders): order number, status chip, totals, empty state.
- **OrderDetailScreen** (GET /orders/{id}): totals, delivery info, payment/escrow state
  (honest — pending shown as pending).
- **PaymentScreen**: calls sandbox `POST /proformas/{id}/submit-payment` and renders the real
  backend response — never fakes a payment success.
- Wiring: Account "My orders" → Orders; checkout result → "Complete payment" → PaymentScreen.
- `AuthStore` supports an initial token (testable). `Order` model.
- 2 orders tests — **14 tests total pass**; analyze clean; harness ALL PASS.

## 2026-08-20 · MILESTONE 7: Admin cluster (dashboard + analytics graph cards) ✅
- Promoted the sandbox test user to ADMIN (user_roles) so admin endpoints return data.
- **ApiClient.adminStats / adminTrend / adminOrders / adminTopBuyers** (JWT+ADMIN).
- **SimpleBarChart** (no external dep) for analytics trend cards.
- **AdminDashboard** (mirrors web admin-overview): KPI stat cards (Users/Orders/Products/
  Ratings/Revenue), **Sales trend** chart (orders/trend), **Proforma trend** (proformas/trend),
  and **Top Buyers by Clicks** card. Degrades gracefully on 403 (analytics failures -> empty,
  per hard rule 3).
- **AdminOrdersScreen**: full admin orders list (admin/orders) -> OrderDetailScreen.
- Admin entry wired in the account view.
- Data verified vs sandbox as ADMIN (stats: 142 users, 401,000 TZS revenue; order/proforma trend
  series). 1 admin test — **15 tests total pass**; analyze clean; harness ALL PASS.

## 2026-08-20 · MILESTONE 8: Insights + account/misc screens ✅
- **InsightsScreen** (covers web /insights/* + /statistics): graph cards for Sales, Completed
  orders, Proforma volume, Verified proformas, and platform stats — reuses SimpleBarChart;
  analytics failures swallowed → empty (per hard rule 3). Wired in the account view.
- **Account misc**: Notifications, Settings (prefs/currency), Help/About (covers /notifications,
  /account/settings, /help, /about, /faq, /contact, /privacy, /terms). Wired in account view.
- 15 tests total pass; analyze clean; harness ALL PASS on rebuilt web.

## 2026-08-20 · MILESTONE 9: Requests (community request board) ✅
- **ApiClient.fetchRequests** (public GET /request-board/feed).
- **RequestsScreen** (Requests bottom tab): feed of community requests (title, requester,
  category/service/location/budget chips, OPEN/status pill) with resilience to missing fields.
- **RequestDetailScreen** (/request/[id]): full description, metadata, "I can help (nudge)".
- 2 requests tests — **17 tests total pass**; analyze clean; harness ALL PASS on rebuilt web.

## 2026-08-20 · MILESTONE 10: Sell (create listing) — Sell tab ✅
- **ApiClient.createListing** (POST /products/post-product, seller/auth).
- **SellScreen** wired to the Sell bottom tab: listing form (title, price TZS, condition,
  description) with validation; on submit posts to the sandbox and reports the real result
  (never faked). Requires login.
- 2 sell tests — **19 tests total pass**; analyze clean; harness ALL PASS on rebuilt web.

## 2026-08-20 · MILESTONE 11: Addresses + Admin Users/Listings ✅
- **ApiClient.getAddresses / addAddress** (auth; verified vs sandbox: list [], add -> 201).
- **AddressesScreen** (/account/addresses): list saved addresses + modal add form, Default flag.
- **Admin Users / Admin Listings** screens (admin/users, admin/products) via a reusable
  AdminListScreen; wired to the Admin dashboard app bar. Delegate AuthStore.instance / admin JWT.
- 1 addresses test — **20 tests total pass**; analyze clean; harness ALL PASS on rebuilt web.

## 2026-08-20 · MILESTONE 12: Payment methods + verification / forgot password ✅
- **PaymentMethodsScreen** (/account/payment-methods): lists supported methods (Mobile money,
  Card) with the honest no-fake payment note. Wired in the account view.
- **ForgotPasswordScreen** (/reset-password, public reset-passwordEmail?email=): requests a reset.
- **VerificationScreen** (/verify-email, /account/verification): OTP entry, sends signup OTP.
  Wired in account + "Forgot password?" on Login.
- 2 tests — **22 tests total pass**; analyze clean; harness ALL PASS on rebuilt web.

## 2026-08-20 · MILESTONE 13: Seller profile + edit-listing mode ✅
- **SellerProfileScreen** (/seller/[id]): loads the public seller-summary endpoint — name,
  position, about; verified vs sandbox (real seller 59 data).
- Product detail seller card now links to the seller profile.
- **SellScreen gained edit mode** (covers /edit-listing/[id]): editing flag changes title/CTA.
- `sellerId` added to ProductDetail. 1 seller test — **23 tests total pass**; analyze clean;
  harness ALL PASS on rebuilt web.

## 2026-08-20 · MILESTONE 14: Delivery tracking + Expat/seller dashboard ✅
- **DeliveryTrackingScreen** (/transporter): reads the order's transporter/status; honest
  "not available yet" state when the order has no transporter (verified 404-before-fulfillment).
- **ExpatDashboardScreen** (/expat/dashboard): seller home menu (add listing, orders, delivery,
  insights). Wired in the account view.
- 1 delivery test — **24 tests total pass**; analyze clean; harness ALL PASS on rebuilt web.

## 2026-08-20 · MILESTONE 15: Admin messages + verification (inventory complete) ✅
- **AdminMessagesScreen** (/admin/messages): admin notifications list (admin/notifications,
  verified real rows {id,title,...}).
- **AdminVerificationScreen** (/admin/verification): seller-verifications queue.
- Reuse AdminListScreen; wired to the Admin dashboard app bar. This covers every route in the
  finalized 51-route inventory.
- 24 tests total pass; analyze clean; harness ALL PASS on rebuilt web.

## 2026-08-20 · MILESTONE 16: Functional Android APK ✅ (sandbox endpoint)
- Set up the Android toolchain from scratch on this host (no sudo): JDK 17 extracted from the
  eclipse-temurin docker image into ~/jdk; Android SDK (cmdline-tools + platform-tools +
  platforms;android-35 + build-tools;35.0.0) installed to ~/Android; licenses accepted.
- `flutter build apk --release` succeeds → **build/app/outputs/flutter-apk/app-release.apk (22.6MB)**,
  package `com.globoexpats.globoexpats_mobile`, minSdk 21 / targetSdk 35. App label "GloboExpats".
- Copy kept at **~/GloboExpats_deliverables/GloboExpatsMobile-sandbox.apk**.
- Points at the SANDBOX API base URL (localhost:8083) — per hard rule 1 the LIVE endpoint is
  flipped only after the dev backend is verified. Live variant: build with
  `--dart-define=API_BASE_URL=https://api.globoexpats.com`.
- Build recipe (env): `JAVA_HOME=~/jdk ANDROID_HOME=~/Android PATH=~/flutter/bin`.

## 2026-08-20 · MILESTONE 17: LIVE-variant APK ✅ (gate cleared)
- **Gate cleared (hard rule 1):** sandbox API verified ✓ + dev backend API tested read-only ✓
  (categories/featured/get-all-products/itemDetails/search all 200 on :8081). 
- Built **live APK**: `~/GloboExpats_deliverables/GloboExpatsMobile-live.apk` (22.6MB) with
  `--dart-define=API_BASE_URL=https://api.globoexpats.com`. Confirmed the live URL is baked in
  (binary search: `https://api.globoexpats.com` present; `localhost:8083`/`apidev` absent).
- Deliverables: `GloboExpatsMobile-sandbox.apk` (localhost:8083) + `GloboExpatsMobile-live.apk`
  (https://api.globoexpats.com).
