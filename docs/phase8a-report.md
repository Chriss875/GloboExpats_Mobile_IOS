# Phase 8a report — order / money DISPLAY parity patch

Working tree on branch `local` was preserved untouched (no git operations ran). Only
in-scope files were edited; the one drive-by was creating `lib/domain/buyer_payment_recovery.dart`
and additive `Order` model fields (needed by D-4/D-5, inside the money-DISPLAY scope).
Every surfaced action below is **display-only** or deep-links to an existing guarded
surface (My Payments re-upload, `/account/payout-details`, `/checkout?proforma=`); no
money-movement capability was added and no payment success was faked.

## GROUP 1 — order card & detail affordances (`orders_screen.dart`)

- **A-1** `FIXED (lib/screens/orders_screen.dart:1500-1534, 2810-2915)` — code card on the
  buyer order detail carries web kind-specific copy ("Pickup code" for vehicle rentals,
  "Arrival code" for property), a Copy-to-clipboard `IconButton` (`2876-2882`), a
  "Generate new code" regenerate action where the backend exposes it (`2904-2913`), and the
  web "Generating your code…" placeholder while the code is still unissued (`2885-2893`).
  Delivery-OTP card (`1502-1507`) shares the same component.
- **A-2** `FIXED (lib/screens/orders_screen.dart:351-364, 451-455)` — order **list** cards
  now render the "Expected:" (buying) / "Delivery window:" (selling) / "Delivered:" line
  from `deliveryWindowLabel`, hidden only for cancelled/failed/expired orders — matches the
  existing detail row.
- **A-3** `FIXED (lib/screens/orders_screen.dart:1327-1353)` — order-detail "Delivery fee"
  row is shown only when a genuine persisted fee exists; cross-region deferred/absent fees
  render the amber italic "Arranged after checkout" copy instead of a literal `TSh 0`.
- **A-4** `FIXED (lib/screens/orders_screen.dart:1822-1837)` — seller Cancel is gated to
  `PENDING` / `AWAITING_PAYMENT` (web `isSellerActionable`); no Cancel once paid/being fulfilled.
- **A-5** `FIXED (lib/screens/orders_screen.dart:1754-1792)` — "Arrange transport" is gated
  on `canAssignTransporterAfterProduction`; while a made-to-order item is incomplete the
  seller sees the "Mark production complete before assigning a transporter." helper instead.
- **A-6** `FIXED (lib/screens/orders_screen.dart:1144-1165; lib/widgets/production_time_card.dart:94-105)` —
  "Mark production complete" is hidden in PENDING / AWAITING_PAYMENT /
  AWAITING_SELLER_CONFIRMATION / IN_TRANSIT / PICKED_UP / DELIVERED / COMPLETED / CANCELLED /
  FAILED / EXPIRED; unknown statuses stay permissive so a real control is never hidden.
- **A-7** `FIXED (lib/screens/orders_screen.dart:51-88, 196-224, 278-310)` — orders list is
  paginated 10/page with a "Load more orders" footer (`_visibleCount`/`_showMore`) and
  pull-to-refresh on both tab branches; refresh resets to page one (grouping/overdue intact).
- **A-23** `FIXED (lib/screens/orders_screen.dart:1264-1272, 2139-2401)` — buying non-rental
  order detail shows the web "Delivery journey" 4-milestone strip (Availability confirmed →
  Processing → Ready for collection/Out for delivery → Collected/Delivered) with
  reached/current/future state colors and a connected line, followed by the "Latest update"
  ("Order update" when cancelled) narrative headline + description — all derived from the
  existing status/timeline state, display-only. Rental orders and the seller perspective are
  excluded.

## GROUP 2 — My Payments (`my_payments_screen.dart`)

- **A-8a** `FIXED (lib/screens/my_payments_screen.dart:126-144, 208)` — the failure-state
  "Try again" button now actually refetches by calling `_load()` (it no longer touches an
  unobserved `_reloadKey`). Covered by `test/my_payments_test.dart:356-386`.
- **A-8b** `FIXED (lib/screens/my_payments_screen.dart:85-89, 99-117)` — the 30 s ticker now
  detects when a Pending proforma's `expiresAt` has crossed zero and triggers a refetch, with
  a per-deadline guard set so it reloads once (and again only if the server extends the
  deadline) instead of looping. Covered by `test/my_payments_test.dart:388-422`.

## GROUP 3 — money-path DISPLAY (render/dialog only)

- **D-1** `FIXED (lib/screens/orders_screen.dart:1184-1186, 1450-1499)` — seller order detail
  renders a read-only "Seller gets / GloboExpats gets" box from `computeSellerPricingTotals`
  (stored per-item seller payouts preferred, live reverse-commission fallback); same math as
  the selling-card "You receive" chip. Hidden for zero totals and never for buyers.
- **D-2** `FIXED (lib/screens/orders_screen.dart:1586-1608, 2403+)` — the AWAITING_SELLER_
  CONFIRMATION stock gate is now a per-line-item checklist ("Buyer paid … / emerald You
  receive"), an order-level paid/receives totals strip, a production-deadline warning, and a
  Confirm that stays disabled until every item is checked; the decline path keeps its
  reason-required cancel/refund dialog.
- **D-3** `FIXED (lib/screens/orders_screen.dart:984-1014, 1613-1625)` — buyer Confirm
  Received / Rate Seller now passes through the "Confirm you received your items" dialog that
  states the escrow release, then opens the SAME guarded rating dialog that exists today.
- **D-4** `FIXED (lib/domain/buyer_payment_recovery.dart; lib/models/order.dart:285-289,
  371-373, 471-485; lib/screens/orders_screen.dart:1187-1314, 1904-1914, 1925+)` — when a
  buyer order's payment proof was rejected (matched via GET /payments/my or the embedded
  payment fields), the order detail shows the amber "Payment proof rejected - upload a
  corrected proof" banner + reason and an "Upload new proof" CTA that deep-links to the
  existing My-Payments Rejected tab. Corrected under-review proof swaps to the blue
  "New payment proof submitted - under review" banner + a "Submitted - under review" status
  row. No new upload capability — reuses the guarded My Payments re-upload surface.
- **D-5** `FIXED (lib/screens/orders_screen.dart:1187-1314, 1916-1923; lib/domain/countdown.dart)`
  — an unpaid (PENDING_PAYMENT) proforma behind a buying order shows a "Pay now" card with the
  live countdown (normal / urgent / expired tones) whose CTA resumes the existing
  `/checkout?proforma=` surface; hidden when the order has no payable proforma.
- **D-6** `FIXED (lib/screens/orders_screen.dart:59-62, 90-137, 211-213)` — the Selling
  workspace calls `getSellerPayoutPromptStatus` (previously zero-caller API) and, when the
  backend says the seller has listings but no payout method and should be prompted, shows the
  non-dismissible "Set up your payout method" dialog whose CTA points at the existing
  `/account/payout-details` form. Best-effort: a network failure never gates the order list.

## GROUP 4 — MySpace Requests owner board

- **A-20** `FIXED (lib/screens/requests_screen.dart:29-49, 92-108; lib/screens/delivery_dashboard_screens.dart:505-510)` —
  `RequestsScreen` gains an `initialBoard` param (defaulting to the public board) and the
  MySpace Requests tab passes `RequestsInitialBoard.mine` so it lands on the owner "My
  requests" view like the web dashboard tab; the standalone `/requests` route keeps the
  public-board default.

## Verification

- `flutter analyze` → **9 issues** (the pre-existing baseline: 6 `curly_braces_in_flow_control_structures`
  in `orders_screen.dart` + 3 import lints in `test/sell_wizard_flow_test.dart`) — no new issues.
- `flutter test` → **635 passed / 1 skipped** (baseline was 616 / 1; the +19 are the new
  widget tests added for the D-* money-DISPLAY surfaces, A-23 buyer-journey strip, A-8a/b
  My-Payments retry/expiry behaviors, etc.).

Behaviour tests for the D-1…D-6 + A-23 work live in `test/orders_seller_money_gate_test.dart`
(D-4 rejected-proof banner/CTA + rejected/under-review status rows, D-5 Pay-now countdown and
no-proforma hide, D-6 eligible vs configured seller prompt, A-23 pickup/delivery journey strips
and the seller-negative). `test/my_payments_test.dart` covers A-8a retry-reload and A-8b
single-expiry-refetch.
