# GloboExpats Mobile — implementation phases

**Written:** 2026-09-03 · **Source:** the concept sketch (bottom/top bar + nine core-logic flows)
and a screen-by-screen comparison of this repo against the web frontend, which remains the source
of truth for screens, flows and copy.

Each phase is a shippable unit: it ends with the app installed on a real device, working against
`apidev`, with `flutter analyze` clean and the Dart suite green. Phases are ordered by *how much
of the concept is missing*, not by how hard they are.

---

## Verification loop (available for every phase)

Flutter 3.27.4 is installed on the Windows workstation (`~/flutter`), so the whole loop runs
locally now — it is no longer "compiles for web" only:

| Step | Command |
| --- | --- |
| Static | `flutter analyze` — baseline is 6 pre-existing `curly_braces` infos in `lib/screens/orders_screen.dart` |
| Logic | `flutter test` — ~296 tests |
| Web build | `flutter build web` |
| Device | `flutter build apk --release --dart-define=API_BASE_URL=https://apidev.globoexpats.com` → `adb install -r` |
| Look | `adb exec-out screencap -p` on the connected Pixel |

Two standing constraints: the Android build is pinned to **Java 17** because the repo's AGP is
8.1.0 (`flutter config --jdk-dir`), and release APKs are **debug-signed** per
`android/app/build.gradle` — fine for a test device, not for distribution.

---

## Phase 0 — App chrome · **built, not committed**

The concept's points 1 and 2. Done and verified; commits deliberately held.

- Bottom bar is `Home · Marketplace · MySpace · Requests · Account`. Selling left the bar and
  became the primary action inside MySpace.
- The bars are **persistent**. Previously only `/` was a `ShellRoute` child, so the first tap on
  Marketplace pushed a bare full-screen route with no bottom nav and no way back. `/browse`,
  `/expat/dashboard`, `/requests` and a new `/account` are shell children; `/requests` had no
  route at all.
- One shared top bar (`lib/widgets/globo_app_bar.dart`): wordmark · country · search · cart badge ·
  notifications badge. 43 screens each built their own `AppBar` before, so cart and unread counts
  only ever appeared on Home.
- Account settings rebuilt to the web's Profile/Security split, with a real
  `PUT /userManagement/changePassword`.

**State:** 296 tests pass, analyze clean, APK verified on a Pixel 6 Pro.

---

## Phase 1 — Sell & Services · **done**

All four units landed. The hourly billing bug found during the port is described
under "Units" below. 332 tests pass; analyze sits at its 6-info baseline.

**Why it was first:** two of the nine core-logic items live in one wizard, and one of them has *no mobile
surface at all*. "Adding & managing services like short stays" is entirely absent: `SHORT_STAY`
appears once in the whole app, as a word in a type comment. This phase also justifies the new
bottom bar — Sell now lives inside MySpace, so arriving there has to be worth it.

**Evidence of the gap**

| | web | mobile |
| --- | --- | --- |
| Sell flow | `app/sell/page.tsx`, 2263 lines | `sell_wizard_screen.dart`, 853 lines (same 4 steps: Details · Photos · Pricing · Review) |
| Listing types | `FOR_RENT \| SHORT_STAY \| RENTAL` | `FOR_SALE \| FOR_RENT` |
| Rentals domain | `lib/rentals.ts`, 275 lines | `lib/domain/rentals.dart`, 210 lines |

Missing from the mobile rentals domain: `RentalDateRange`, `RentalAvailability`,
`RentalCalendarBlock`, `isRentalListingCategory`, `rentalConfigurationForType`,
`getDefaultRentalConfiguration`, `formatRentalCalendarDate`, `rentalCalendarDayCount`,
`orderItemUnitLabel` — i.e. everything about **availability and blocked dates**, which is what a
short stay actually is.

**Units**

1. Port the missing rentals types and helpers, with Dart tests mirroring the web's rental maths.
2. Add `SHORT_STAY` to the wizard's listing types, with the rate-period and per-night pricing
   branch the web shows for it.
3. Availability editor: date ranges and blocked dates on a listing.
4. MySpace: manage an existing service/short-stay listing — edit availability, block dates.

**Done when:** a `SHORT_STAY` listing created on the phone against `apidev` appears in MySpace,
renders on the web app, and its blocked dates are refused at booking time.

---

## Phase 2 — MySpace as a real dashboard · **done bar on-device sign-off**

The five tabs and the listing management are in. The parity checklist still has
to be walked on a handset — the test device was unplugged when the phase
finished building.

**Why:** it is now one tap from every screen but the screen behind it is a stats block plus a
menu. The web's My Space (`app/expat/dashboard/page.tsx`, 4298 lines) is a five-tab dashboard.

**Units**

1. Tabs mirroring the web: overview · listings · orders · saved · requests.
2. Listing management the web already has: filter by status (available, booked, sold, pending,
   rejected, archived, out of stock), by category/subcategory, and sort by newest/oldest/views.
3. Owner actions on a listing — edit, archive, mark sold — from the listings tab.

**Done when:** a parity checklist against `/expat/dashboard` passes on the device, tab by tab.

---

## Phase 3 — Transaction spine audit

**Why:** checkout, orders and delivery are the *most* mature parts of this app
(`checkout_screen.dart` 1791 lines, `orders_screen.dart` 1162, `delivery_dashboard_screens.dart`
698). The expected defect class here is **parity bugs, not missing screens** — and those surface
fastest by driving the real app on a real phone against real dev data, which only became possible
this week.

These are the repo's declared **critical areas** (order lifecycle, delivery windows and deadlines,
price/fee maths, auth). House rules apply: smallest possible diff, explicit reasoning in the
commit, every relevant test run, never fake a payment success.

**Units**

1. Buyer path on the device: cart → checkout → address → delivery slot → order created.
2. Seller path: incoming order → dispatch → delivery-code handover.
3. Money and time: order totals, delivery fees per seller group, commissions, countdown deadlines
   — compared field by field against the web for the same order.

**Done when:** one real order runs end to end on the phone and every number and deadline matches
the web for the same order id.

---

## Phase 4 — Requests, sourcing and notifications

**Why:** three of the nine items ("adding request & source", "nudging & managing requests",
"notification system") sit on surfaces that already exist and mostly need completion, not
construction. The unread badge is already wired into the Phase 0 top bar.

**Units**

1. Request creation parity for both GOODS and SERVICE posts, including images.
2. Nudge and manage: the request owner's side — responses, closing a request.
3. Notifications: deep-link each notification to its target (order, request, listing) instead of
   ending at the list.

---

## Phase 5 — Clear the verification ledger

The repo's own `e2e/results.jsonl` records **39 PASS · 32 HELD · 3 DISPUTED · 1 FAIL** against a
66-unit plan, with a documented backlog:

- **AU-049** — browse filters miss category-availability gating (empty category chips render,
  subcategory strips absent) and an invalid price silently returns HTTP 400 with no user feedback.
- **AU-062** — `/help` and `/faq` are static stubs (no topics, no search filter); privacy and terms
  lack their numbered sections and last-updated; about lacks team/values/mission; the signed-in
  email never prefills the contact form.
- **AU-057 / AU-063** — outstanding FAIL/DISPUTED units to re-verify.

**Why last:** these are real, user-visible defects, but they sit on screens that already exist and
work. Nothing in the concept sketch is blocked on them. Pull this phase forward if the priority is
polish over coverage.

---

## Decisions still open

1. **Raised centre tab.** The sketch draws the middle item raised; on the web that is the green
   Sell FAB. Since Sell moved into MySpace, all five tabs are currently flat. Raising MySpace is a
   small change if wanted.
2. **AGP bump.** Moving `com.android.application` past 8.2.1 would free the build from the Java 17
   pin. It deserves its own change with a full test pass, not a drive-by.
3. **Signing.** A real keystore is needed before any APK goes to anyone outside the team.
