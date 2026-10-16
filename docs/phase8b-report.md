# Phase 8b — Parity Patch Report (A-9 … A-21)

Web source of truth: `GloboExpats_Frontend` (Next.js). Every item below is
**FIXED** unless marked otherwise. Worklist A-1…A-8 was Phase 8a (see
`phase8a-report.md`); this phase did **not** touch Phase 8a files, the backend,
or `pubspec.yaml`, and no git history operations were run.

Grouped by area: **Group 1 = checkout**, **Group 2 = notifications**,
**Group 3 = misc**.

---

## Group 1 — Checkout (A-9 … A-11)

### A-9 — Receipt tick resets on ANY receipt change — FIXED
Adding a screenshot and removing one both clear `_paymentConfirmed`, matching
web `checkout-content.tsx` which resets on every files change (not only when
the last file is removed).
- Add: `lib/screens/checkout_screen.dart:1861-1865` (`_receipts.add(...)` then
  `_paymentConfirmed = false` in the same `setState`).
- Remove: `lib/screens/checkout_screen.dart:1666-1669` (`_receipts.removeAt(i)` +
  `_paymentConfirmed = false`).
- Tests: `test/checkout_phase8b_test.dart`.

### A-10 — Submit sends empty `transactionReferences: []` — FIXED
`submitPayment` always includes `'transactionReferences': transactionReferences ?? const []`
so a screenshot-only submission never carries a typed-reference array.
- `lib/api/api_client.dart:609-612` (payload line 610).
- Called from `lib/screens/checkout_screen.dart:884-885`.
- Tests: `test/checkout_phase8b_test.dart` (payload assertion).

### A-11 — Past delivery-window slots render DISABLED with "Time passed" — FIXED
`isDeliveryWindowPast` (EAT end-hour) drives the tile: past windows stay in
the grid as a greyed, disabled `CheckboxListTile` with a "Time passed"
subtitle instead of being dropped.
- `lib/domain/delivery_windows.dart:119-123` (`isPast`), `:162-166` (filter for
  the *still-selectable* helper — visual grid still renders every option).
- `lib/screens/checkout_screen.dart:1339-1372` (`_windowTile`; disabled
  `onChanged`, greyed title, `Text('Time passed')` at 1366).
- Tests: `test/checkout_phase8b_test.dart`.

---

## Group 2 — Notifications (A-12 … A-14)

File: `lib/screens/account_misc_screens.dart` (imperative `_NotificationsScreenState`).

### A-12 — Per-row delete + bulk "Delete shown" wired to existing API — FIXED
- Per-row trash `IconButton` (`key: 'notif-delete-{id}'`) calls `_deleteOne`
  → `DELETE /notifications/{id}` then removes the row locally.
  `account_misc_screens.dart:133-155`, `536-544`.
- Bulk bar button (`key: 'notif-delete-shown'`, label `Delete shown (n)`)
  calls `_deleteShown` → `deleteNotificationsBulk` (`DELETE /notifications/bulk`
  body `{ids:[...]}`) over the ids of the **currently visible** rows.
  `account_misc_screens.dart:157-170`, `419-422`.
- Tests: `test/notifications_phase8b_test.dart` (per-row DELETE `/notifications/5`;
  bulk body `{'ids':[1]}` for a filtered row).

### A-13 — Feed pagination past the fixed 20-row fetch — FIXED
- Paged feed: `_pageSize = 20`, `_hasMore = fetched length >= pageSize`,
  `_loadFirst`/`_loadMore` fetch `?page=&size=20`, and the list renders a
  "Load more" footer (`key: 'notif-load-more'`) that appends page+1.
  `account_misc_screens.dart:29`, `63-110`, `343`, `392-400`.
- Tests: `test/notifications_phase8b_test.dart` (25-row paged mock: page 0
  loads ids 1-20, load-more fetches page 1, footer disappears on the short
  final page).

### A-14 — Richer empty state with web-parity copy + CTAs — FIXED
- Empty card mirrors the web: `check_circle` icon, heading **"You're all
  caught up!"**, subcopy, and two CTAs — **Go to Dashboard**
  (`key: 'notif-empty-dashboard'` → `/expat/dashboard`) and **Browse Products**
  (`key: 'notif-empty-browse'` → `/browse`).
  `account_misc_screens.dart:351-386`.
- Tests: `test/notifications_test.dart` + `test/notifications_phase8b_test.dart`.

---

## Group 3 — Misc (A-15 … A-21)

### A-15 — Archived-date footnote on seller listing card meta — FIXED
Active/Booked listing cards with a scheduled `archiveDate` render a small
centred footnote **"Archives {day Mon year}"** (`key: 'listing-archives-on'`),
web dashboard parity. Archived status never shows it.
- `lib/screens/seller_listings_screen.dart:910-922` (`_archivesOnDate`
  getter), `1165-1179` (conditional footnote under the actions row).
- Tests: `test/seller_listings_phase8b_test.dart`.

### A-16 — `/edit-listing/:id` wrapped in SellerVerificationGate — FIXED
Route builder now returns `SellerVerificationGate(child: EditListingScreen(...))`,
matching web `<RouteGuard requireVerification="sell">` on `app/edit-listing/[id]`.
- `lib/app_router.dart:335-346`.
- Tests: `test/edit_listing_phase8b_test.dart` (route-content guard that the
  gate wraps the editor on the `/edit-listing/:id` route).

### A-17 — Edit dirty detection + PopScope "Discard your changes?" — FIXED
- `_stateSignature()` serializes every editable field; `_baselineSignature` is
  snapshotted when the listing loads; `_hasUnsavedChanges()` compares them.
  `lib/screens/edit_listing_screen.dart:132-133`, `257`, `906`, `911-959`.
- Back navigation is guarded by `PopScope` that shows **"Discard your changes?"**
  with **Keep editing** / **Discard**. The guard decision is made **live** in
  `onPopInvokedWithResult` (PopScope `canPop` is always `false`): text edits do
  not rebuild this State, so a build-time `canPop` snapshot would stay stale and
  let an unsaved change slip past the first back press.
  `lib/screens/edit_listing_screen.dart:963-1012` (`_confirmDiscard`, `build`).
- Tests: `test/edit_listing_phase8b_test.dart` (clean back pops silently; dirty
  back prompts; Keep editing stays; Discard returns to host).

### A-18 — Real share sheet (copy-link + WhatsApp wa.me) replacing stub SnackBar — FIXED
Product AppBar Share now opens a bottom sheet with the product URL, a **Copy**
action (`key: 'share-product-copy'` → `Clipboard.setData` + "Product link
copied" SnackBar) and a **Share on WhatsApp** action
(`key: 'share-product-whatsapp'` → `https://wa.me/?text=` via
`launchUrl(LaunchMode.externalApplication)`).
- `lib/screens/product_detail_screen.dart:389-497` (`_showProductShareSheet`;
  wire-up at 362).
- Tests: `test/product_detail_phase8b_test.dart` (clipboard `Clipboard.setData`
  payload + launched `wa.me` URL captured on a mocked platform channel).

### A-19 — Fullscreen image preview (no pinch-zoom) — FIXED
New `FullscreenImageViewer` (`lib/widgets/fullscreen_image_viewer.dart`) —
black fullscreen dialog, `PageView` of `AppImage`s, dismissible close
(`key: 'fullscreen-preview-close'`) and an `i / n` counter
(`key: 'fullscreen-image-counter'`, only when >1). Deliberately no pinch-zoom.
- Product carousel tap → preview at that image's index:
  `lib/screens/product_detail_screen.dart:757-767`.
- Seller profile avatar tap → preview (single photo, no counter):
  `lib/screens/seller_profile_screen.dart:681-695` (photo parsed at 178-181).
- Tests: `test/product_detail_phase8b_test.dart` (2-image carousel: opens,
  counter `1 / 2`, close dismisses), `test/seller_profile_phase8b_test.dart`
  (avatar opens preview; no counter for a single photo; close dismisses).

### A-21 — Address book "Add Your First Address" CTA + embedded list 5-per-page — FIXED
- Standalone `/account/addresses` empty card: **"No addresses saved"** +
  **Add Your First Address** CTA (`key: 'address-empty-add'`) → add sheet.
  `lib/screens/addresses_screen.dart:538-571`.
- Profile-embedded empty variant: **"No shipping addresses saved"** + outline
  **Add Address** (`key: 'address-empty-add-embedded'`).
  `lib/screens/addresses_screen.dart:575-600`.
- Embedded list pages 5 per page (web `PROFILE_ADDRESS_PAGE_SIZE = 5`) with a
  prev/dot/next pager (`addr-prev-page`, `addr-page-i`, `addr-next-page`); the
  standalone book shows all rows.
  `lib/screens/addresses_screen.dart:68-71`, `488-534`, `603-646`.
- Tests: `test/addresses_phase8b_test.dart` (both empty states + 11-row pager:
  first page rows 1-5, next 6-10, last row 11, dot jump back).

---

## Verification (post-Group-3)

```
flutter analyze 2>&1 | tail -3
9 issues found.   (unchanged baseline — 6 curly_braces in orders_screen.dart +
                   3 import lints in test/sell_wizard_flow_test.dart)

flutter test 2>&1 | tail -3
00:48 +653 ~1: All tests passed!   (653 passed, 1 skipped)
```

Tally: **A-9 … A-21 → all 13 FIXED** (0 OPEN, 0 REFUTED).
