# Parity closure report — mobile-vs-web gap audit (phase 7)

**Date:** 2026-09-08 · **Method:** read-only re-verification of every gap in
`docs/frontend-parity-gaps.md` (275 verified IDs + 48 second-pass candidates + 25 coverage sweeps)
against the **final** working tree, by five independent verifier agents, each owning a disjoint
line-range. Every row was confirmed at code level (file:line evidence or a stated blocker); no code
changed in this phase. The status of a row is what the tree proves **now**, not what an earlier
phase reported.

Row-by-row evidence lives in the per-group matrices linked below. The numbers are matrix-row counts;
several distinct rows describe the same root cause seen from different domains (the register at the
bottom is the deduplicated view).

## Closure matrix

| Matrix | Coverage (frontend-parity-gaps.md) | Rows | FIXED | OPEN | REFUTED | N-A |
|---|---|---|---|---|---|---|
| [`parity-closure/group_A.md`](parity-closure/group_A.md) | Sell wizard + edit-listing/profile (52–751) | 65 | 49 | 15 | 1 | 0 |
| [`parity-closure/group_B.md`](parity-closure/group_B.md) | Cart & checkout (752–1079), seller-fin (2051–2239), buyer-fin (2240–2543) | 72 | 26 | 45 | 1 | 0 |
| [`parity-closure/group_C.md`](parity-closure/group_C.md) | Requests / request-board (1080–1479), notifications / pending-actions (2842–3174) | 71 | 39 | 22 | 0 | 10 |
| [`parity-closure/group_D.md`](parity-closure/group_D.md) | Buyer orders (1480–1705), seller orders (1706–2050) | 51 | 15 | 34 | 2 | 0 |
| [`parity-closure/group_E.md`](parity-closure/group_E.md) | API (2544–2841), business-rules (3175–3408), account-gates (3409–3649), sweeps (3650+) | 92 | 40 | 47 | 0 | 5 |
| **Total** | all 12 domains | **351** | **169** | **163** | **4** | **15** |

**Status legend:** **FIXED** = code/test proves the web behavior is present (citable file:line).
**OPEN** = a concrete blocker remains (see row). **REFUTED** = the audit claim does not match
web/mobile truth (the web also lacks it, or mobile already behaves to parity). **N-A** = admin /
out-of-scope per the repo CLAUDE.md, a duplicate of a canonical row, or a confirmed-equivalence
inventory block (not a gap).

**REFUTED rows (4):** Group A — audit's own refuted claim "edit silently clears an inactive
subcategory" (never matched code). Group B — "cross-region policy completely absent" (now fully
implemented, `delivery_region.dart:121` + `checkout_screen.dart:677`). Group D — "payment-deadline
countdown on buyer cards/detail" and "buyer order-card per-card CTAs" (the web itself renders
neither under LOGISTICS_V2). **N-A rows (15):** 2 request-board/notification admin surfaces, 6
duplicate second-pass candidates, 2 confirmed-equivalence inventory blocks, and 5 web-only surfaces
(Matomo analytics consoles, admin-console scope, web-stub `/profiles`, driver.js guided tour).

## Code gate at closure

`flutter analyze` → exit 0, **9 infos** (documented baseline: 6 `curly_braces` in `orders_screen.dart`
+ 3 test-import lints in `sell_wizard_flow_test.dart`). `flutter test` → **616 passed / 1 skipped /
exit 0** (suite grew from 296 at phase 0 → 616 across the campaign; the 1 skip is a locked
SERVICE-path test). Both verified locally by the orchestrator.

---

## Group A — sell wizard / edit-listing / profile (65 rows: 49 FIXED / 15 OPEN / 1 REFUTED)

The sell-wizard and edit-listing integrity work is present and holds at code level: transportRequirement
round-trip (EXEMPT for rentals, qty 1), SPECIFICATIONS re-serialization incl. Item Age,
`choiceConfiguration`/`rentalConfiguration`/fee-bands/production-time round-trip, image management
(delete-all + batch-5 cover-first re-upload, `deleteProductImage`), map-pin bottom sheet + saved-address
preselect + `placeName`, live commission panel from `GET /platform-settings/commission`, TZS floor,
WhatsApp step-1 requirement, choice-editor auto-enable, rental-purpose editor, review/commission/Terms
parity, nudge prefill + post-publish auto-nudge, image cap 30 + size counters, Clear-all reset, category
normalization, and the full seller-listings surface (inventory PATCH actions, state-conditional menus,
attention + rejected banners with repair CTAs, filters with counts, 20/page pagination, View Details /
"You receive" / Halal on cards). Edit screen now also carries the interactive choice editor, web-parity
condition selector, ordered validation list + toast, and promo-inversion warning.

OPEN (15): admin edit mode (`updateAdminProduct` + `?admin=true` route handling absent — SELLWI-23 /
LISTIN-08), edit route not verification-gated (LISTIN-09), anchor-nav / unsaved-changes indicator
(LISTIN-07), Transporters management sub-tab unwired (LISTIN-17 partial), Overview analytics/range
selector (LISTIN-18), dashboard-tab pending badges (LISTIN-20), seller working-hours card (LISTIN-27 —
no API), name-only slug fallback (LISTIN-28 partial), and cosmetic second-pass items (custom colour
picker, dimension-unit selector, choice-payout inline error + final-price box, per-step tips,
WhatsApp-field → account-settings link, archived-date card footnote).

## Group B — cart / checkout + seller & buyer finance (72 rows: 26 FIXED / 45 OPEN / 1 REFUTED)

Checkout v2 core is verified fixed: proforma resume via `?proforma=`, expired-invoice snapshot restore,
cross-region deferred-fee policy, rentals/EXEMPT excluded from delivery logistics, rental booking tiles,
receipts-only proof gate + disabled-until-proof tick, support tel/WhatsApp + terms/privacy links,
read-only WhatsApp, blocking Processing-Order dialog, 30s proforma polling, My-Payments → order
deep-link via GoRouter, `>=1000` pricing gate, live commission rates, payout delete/set-default/form
rules, seller Payments-Received panel + revenue-over-statuses formula, "You receive" card chip.

OPEN (45) — the largest single cluster in the audit, and mostly **money-path scope or no-consumer
wiring** (see register): legacy meet-seller/CASH checkout & `/checkout/success` order-confirmation parity,
PDF receipts (needs `file_picker`), server availability-window wiring into checkout, delivery route map,
guest-cart TTL + selection-fallback, per-card payment countdowns + rejected-proof CTA, receipt preview,
"Arranged after checkout" on order surfaces, per-order "Seller gets / GloboExpats gets" transparency,
recommendations rail + Current Cart overview card, My-Payments countdown onExpire reload + inert "Try
again" button, typed `transactionReferences` still sent (web sends `[]`), tick reset only on last-receipt
removal, payout-setup prompt, Transporters sub-tab + registry management, duplicate-payment screen gaps,
Matomo events, static saved-payment-methods screen.

## Group C — requests + notifications / pending-actions (71 rows: 39 FIXED / 22 OPEN / 10 N-A)

Request board is rebuilt to web parity and verified: owner nudge inbox + responses panel +
fulfil-by-nudge and fulfil-outside, PENDING/FULFILLED/CLOSED vocabulary, infinite-scroll pagination,
My-Requests pager with per-row unread badges, photo gallery + thumbnail editing, saved-address →
neighbourhood privacy, canSell/verification gates, web taxonomy (service categories constant, GOODS from
platform categories), REQUEST_* → `/request/:id` routing, budget/date/image validation, "I am looking
for" prefix + counters, view-count + analytics dialog, share dialog, fulfilled-detail dialog, Related
section, sort / category / neighbourhood filters, live debounced search, owner Close removed to web
parity, poster-name masking, relative time + formatted budget + requestBoard constant path.
Notifications/pending-actions: delivery-time confirm/counter + propose, seller Dispatch button
(timing-locked, blocker list), nudge canSell gate, post-publish auto-nudge, classifier sellerId/buyerId
fallback + 30-day window, My-Payments deep link, low-rating review-required.

OPEN (22): service-offer composer + edit-my-nudge UI (REQUES-02 / NOTIFP-04 / SWEEP-10), notifications
Requests-tab nudge aggregation + badge contribution (REQUES-23 / NOTIFP-10), grid/list toggle (REQUES-33),
global pending-actions banner (NOTIFP-07), per-row notification actions + dismiss (NOTIFP-08/16),
feed pagination + richer empty states (NOTIFP-11/22), tab count badges + metric strip, escrow-release
confirm warning (NOTIFP-12), push / FCM / local notifications (NOTIFP-14), 30s global poll (NOTIFP-15),
receipt preview + multi-file/PDF upload (NOTIFP-17/18), availability per-item checklist + payout summary
(NOTIFP-19), payment countdown / Pay-now on order cards (NOTIFP-21), dispatch-unlock bounded retry,
MySpace Requests tab → owner My-Requests view, ongoing-order/pending badges.

## Group D — buyer + seller orders (51 rows: 15 FIXED / 34 OPEN / 2 REFUTED)

Verified fixed: buyer delivery-time confirm/counter + propose dialog; seller Dispatch (timing-locked);
low-rating review-required; cancel-reason-required; overdue deadline full precedence chain + grouping
(`order.dart`); production step in the delivery timeline + awaiting-production override; seller
rental-handoff code verify card; Mark-delivered gated off SELLER_DELIVERY; delivery-window row on
detail; Explore-Marketplace empty CTA; `PRODUCTION_NOT_COMPLETE` + `SELLER_HOURS` + server
`dispatchOpensAt` support; My-Payments order deep-link.

OPEN (34): no countdown widgets anywhere (rental return-deadline, dispatch/payment); detail code card
has no copy / kind-specific copy / generating placeholder (copy+self-confirm only on the separate
tracking screen); no call / WhatsApp / share / maps launch affordances on order or transporter surfaces;
no destination map links; agreed delivery-window line missing from **list** cards; no receipt preview;
no buyer-journey milestone strip; no per-card payout transparency (ORDS-24); "Delivery fee TSh 0" +
no "Arranged after checkout" on detail; assign modal never sends `proposedDeliveryTime`; no production
gate on assign; cancel still offered in paid/escrow states; dispatch auto-refresh timer; rejected-proof
not surfaced on seller side; `_create` transporter form lacks validation + WhatsApp/notes/photo;
TRANSPORTER_NOT_LINKED error generic; no auto rate-buyer prompt; orders list has no pagination /
pull-to-refresh / stale-while-revalidate; Mark-production-complete not status-gated; role-resolution
dependency hides the seller code card when it fails.

## Group E — API / business-rules / account-gates / sweeps (92 rows: 40 FIXED / 47 OPEN / 5 N-A)

Fixed (API): proforma deep-link, cross-region policy, user-role `dispatch` / delivery-time confirm /
propose verbs, invoice snapshot restore, 30s polling, seller payments-received + seller-document,
commission settings fetch + warm start, FEATURED price cap 200000, Mark-delivered gating, request-board
client, 90-day surface items absent → see register. Fixed (biz-rules): monthly-rental calendar
arithmetic, transport-requirement resolution, server `dispatchOpensAt`, `PRODUCTION_NOT_COMPLETE`,
delivery-deadline precedence chain, transport-mode synonym normalization, unit-price/financial fallback
chains, `&`→`and` category normalization, epoch-seconds parsing. Fixed (account): NATURAL_VERIFIED,
REJECTED/BLOCKED follow-up, application validation, payout row actions + form rules + default method,
default-address → seller-pickup sync + Set-as-default, auth-gated verification/payout routes.
Sweeps fixed: receipt attach on payment step, seller Payments-Received panel, `/checkout?proforma=`,
request fulfil-choice/fulfilled-detail/views dialogs, nudge inbox, share request + seller-profile modals.

OPEN (47): no request timeout / 504 mapping; availability-windows never consumed; transporter
CRUD/manager/photo/trips + managed-scope filter; rejected-payment recovery not on order page; receipt
upload image-only; rating still `seller-rate` not `/rate-user`; notification delete UI; 90-day token
expiry; no dedupe/TTL resilience; legacy createOrder/meet-seller; analytics event POST absent; no
background polling layer; PDF/MIME allow-list; rental-completion countdown; currency static table;
rejected-reason copy; 30-min review-overdue not surfaced; `trip.deliveryTimeStatus` labels; staged
verification conversation (org-email path); verification popup before buy; client-side canSell/canBuy
gates; working-hours (ACCOUN-07 = LISTIN-27); payout-setup prompt; forced profile-completion modal;
saved-card wallet; WhatsApp E.164 + profile payload fields; current-password-always-required;
inconsistent session-clearing on API error; pending/needs-info view copy; address-book 5/page
pagination + empty-state CTA; product share stub; image carousel full-screen; SWEEP-19; admin WhatsApp
contact/share; Matomo analytics events; plus SWEEP-2/3/8/9/23/24 (transporter trips console, payment
methods static, global banner + push, transporter contact/share, code copy-to-clipboard, maps deep link).

---

## OPEN register — deduplicated root causes

The 163 OPEN **matrix rows** collapse to ~**70 distinct root causes**. Most duplicate rows are the
same deficit described from each domain's angle (the transporter workspace alone is the subject of
≈10 rows across B/C/D/E; PDF receipts ≈5; server availability-window wiring ≈4). Grouped by what it
would take to close:

**A. Patchable in mobile code alone (no backend, no new dependency) — highest-leverage if continued.**
Order-affordance and presentational gaps: code-card copy button + kind-specific copy, delivery-window
line on list cards, deferred-fee "Arranged after checkout" row on order detail, past-window shown
disabled (not hidden) + availability retry, cancel gated off paid/escrow states, production gate on
assign, Mark-production-complete status gating, orders-list pagination / pull-to-refresh,
notification per-row delete + bulk-select UI, feed load-more, richer empty states, My-Payments "Try
again" reload + onExpire refetch, tick reset on any receipt change + drop typed refs, archive-date
footnote, saved-address empty-state CTA + 5/page, product-share sheet, image-carousel fullscreen,
copy-to-clipboard for delivery/rental codes, list-card You-receive/payout rows, edit route
verification gate, edit anchor-nav + unsaved indicator, buyer-journey milestone strip, per-tab
pending badges, MySpace Requests → owner My-Requests mode.

**B. Needs a mobile dependency (pubspec).** PDF / multi-file receipt upload → `file_picker` (≈5 rows);
full-screen image preview → `photo_view`; push/local notifications → `firebase_messaging` /
`flutter_local_notifications` + FCM setup (NOTIFP-14, + the "no 30s poll" and dispatch-unlock-retry
items become moot once a refresh/timer layer exists).

**C. Needs a backend endpoint / contract that mobile has no method for.** Transporter CRUD, photo,
manager scope + `managedByCurrentUser`, trips screen + role handling; seller working-hours
(`/api/v1/userManagement/working-schedule` exists server-side but no mobile API method or UI);
`updateAdminProduct` admin-edit; `/rate-user` buyer→seller rating; server availability windows
**wired into checkout** (fetch + parser already exist — pure wiring, could be A if the composite
fallback is kept); `POST /api/analytics/event`; 90-day token-expiry clamp.

**D. Money-path / escrow display surfaces (CLAUDE.md "payments/escrow OUT, never fake a success
path").** Legacy meet-seller/CASH checkout; `/checkout/success` as a real order-confirmation page;
escrow-release confirm warning; per-order "Seller gets / GloboExpats gets" + per-item availability
checklist with payouts; payment countdown + Pay-now deep links on order surfaces; payout-setup prompt;
rejected-proof CTA. These are *display-only* (no money moves in the app) but sit in the area the
repo's hard rules keep out; each needs an explicit decision before a patch agent touches it.

**E. Cosmetic / copy-only.** Custom colour picker, dimension-unit selector, per-step selling tips,
WhatsApp-field → settings link, rejected-reason copy, pending/needs-info view copy, WhatsApp E.164
validator + profile payload fields, saved-payment-methods screen CRUD.

**F. Genuinely out of scope (not mobile gaps).** Admin request-board tab, admin notifications,
Matomo analytics consoles, driver.js tour, `/profiles` web stub, admin WhatsApp contacts.

## Honest bottom line

- Every gap an earlier phase **claimed** fixed was re-confirmed at code level — no over-claims survived.
  169 of 351 enumerated rows (48%) are fixed with citable evidence, at 616 passing tests and the
  analyze baseline. The web's most load-bearing behaviours — sell/edit integrity, checkout v2
  (resume / restore / proof-gate / polling), the request-board + nudge inbox, order delivery-time and
  dispatch chains, business-rule maths, account gates — are present.
- The claim "all gaps patched" is **not** true at matrix level: 163 rows are still OPEN. That is the
  honest number. Deduplicated, it is ~70 root causes, of which roughly **25–30 are patchable in
  mobile code alone (bucket A)**, ~10 need a new dependency (bucket B), ~10 need backend methods or
  wiring (bucket C), ~15 are money-path display surfaces needing an explicit scope decision (bucket D),
  ~8 are cosmetic (bucket E), and the rest are out of scope (bucket F).
- Buckets A + the wiring half of C could be closed by one further bounded implementation phase without
  backend or dependency changes; B, the backend half of C, and D each need their own decision first.

---

## Phase 8 update (2026-09-08) — buckets A + D implemented, demo-guarded

Following the user's go-ahead, two sequential implementer phases (8a orders/money-display, 8b
checkout/notifications/listings/profile — disjoint file sets) closed the bucket-A mobile-code gaps and
the bucket-D money-path **display** surfaces (render/dialog only; no money movement added, no success
faked; existing demo-guard semantics retained). Reports: `docs/phase8a-report.md`, `docs/phase8b-report.md`.

**Resolved (30 items, mapped to the OPEN rows they close):**
- Order card/detail (A-1..A-7, A-23): code-card copy + kind-specific copy + "Generating…" placeholder
  (`ORDERS-04`, `ORDERS-16`, `SWEEP-23`); "Expected:" window line on list cards (`ORDERS-09`, seller
  `ORDS-12`); delivery-fee row only when real, else "Arranged after checkout" (`ORDERS-18` def. half +
  `2nd-pass 3`); seller Cancel gated to PENDING/AWAITING_PAYMENT (seller `ORDS-09`); production gate on
  Arrange transport (seller `ORDS-08`); Mark-production-complete status-gated (seller `ORDS-26`);
  orders pull-to-refresh + 10/page load-more (seller `ORDS-25`); buyer-journey milestone strip +
  Latest-update card (`ORDERS-12`).
- My Payments (A-8a/b): working "Try again" reload; 30 s ticker refetches on countdown expiry (buyer
  `FINANC-10`, seller `FINANC-13`).
- Money-path display (D-1..D-6): seller "Seller gets / GloboExpats gets" read-only box (seller
  `FINANC-08`, `ORDS-24`); availability gate → per-item checklist + paid/you-receive summary (seller
  `FINANC-07`, `NOTIFP-19`); escrow-release confirm warning before Confirm Received/rating (`NOTIFP-12`);
  rejected-proof banner + "Upload new proof" → My-Payments Rejected tab (buyer `ORDERS-05`, `APISUR-15`,
  buyer `FINANC-04`); "Pay now" card + live countdown resuming `/checkout?proforma=` (`NOTIFP-21`);
  payout-setup prompt wired to `getSellerPayoutPromptStatus` (seller `FINANC-06`, `ACCOUN-08`, C14).
- MySpace Requests tab → owner "My requests" board (2nd-pass row) via `RequestsScreen.initialBoard`.
- Checkout (A-9..A-11): proof tick resets on any receipt change (buyer `FINANC-12`); typed
  `transactionReferences` dropped to match web `[]` (buyer `FINANC-11`); past delivery-window slots
  render disabled "Time passed" not removed (2nd-pass partial — server-window wiring still out).
- Notifications (A-12..A-14): per-row delete + bulk "Delete shown" wired to the existing
  delete/bulk endpoints (`NOTIFP-16`, `APISUR-19`); feed load-more past 20 (`NOTIFP-11`); richer empty
  state + CTAs (`NOTIFP-22`).
- Listings/edit/addresses/product (A-15..A-19, A-21): archived-date card footnote; edit route
  verification gate (`LISTIN-09`) + dirty-state PopScope unsaved guard (`LISTIN-07`); real product
  share sheet — copy + WhatsApp (`SWEEP-5`); fullscreen image preview, no zoom dependency (`SWEEP-19`
  basic half — pinch-zoom still needs `photo_view`); address empty-state CTA + 5-per-page (2nd-pass
  #7/#8).

**Gate at end of Phase 8 (verified locally by the orchestrator):** `flutter analyze` exit 0 at the
9-info baseline; `flutter test` **653 passed / 1 skipped** (suite grew 296 → 616 → 635 → 653 across
the campaign; 12 new tests landed in 8b, 3 in 8a plus behavioural updates).

**What this means for the matrix:** the matrix tables above are the phase-7 read-only snapshot. The
Phase 8 items above resolve ~40 of its OPEN rows — essentially all of bucket A and bucket D that are
safe in mobile code. Remaining OPEN is dominated by: bucket B (needs a dependency — `file_picker`
PDF/multi-file receipts ≈5 rows, `photo_view` zoom, push/FCM ≈3 rows), bucket C backend contracts
(transporter CRUD/managed-scope/trips, seller working-hours, `updateAdminProduct` admin-edit,
`/rate-user`, server availability windows wired into checkout — fetch/parser exist), a few deliberate
exclusions (legacy meet-seller/CASH checkout and `/checkout/success` order-confirmation parity are
transactional, not display — kept OUT per the money rule), cosmetic copy items, and the F bucket that
is genuinely out of scope. All remain documented row-by-row in the group matrices.
