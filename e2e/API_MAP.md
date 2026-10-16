# API_MAP.md — verified sandbox endpoint inventory (curl-proven 2026-08-23T02:05Z)

Source of truth: controller annotations in `~/GloboExpats_Backend` (origin repo, read-only).
Base URL for all agents: `http://localhost:8083`. Auth: `Authorization: Bearer <JWT>` from
`POST /api/v1/auth/login` (creds in `e2e/lib_verify.js`). Public endpoints are `permitAll`;
everything else 302→OAuth when unauthenticated.

## Checkout / proforma (`ProformaController`, base `/api/v1`)
| Method | Path | Used by |
|---|---|---|
| POST | `/api/v1/checkout/proforma` | AU-022..028 |
| GET | `/api/v1/proformas/{proformaId}` | AU-029/031/033 |
| POST | `/api/v1/proformas/{proformaId}/cancel` | AU-032 |
| POST | `/api/v1/proformas/{proformaId}/submit-payment` | AU-030 |
| POST | `/api/v1/checkout/delivery-quote` | AU-025 |

## Payments
| Method | Path | Used by |
|---|---|---|
| GET | `/api/v1/payments/my` (`PaymentsController`) | AU-033 |
| GET | `/api/v1/payments/received` (`SellerDocumentController` base) | AU-043 seller side |

## Orders (`OrderLifecycleController`, base `/api/v1/orders`; `OrderEscrowController` same base)
GET list `` · GET `/{orderId}` · GET `/pending-actions-count`
PATCH `/{orderId}/mark-paid` · `/mark-picked-up` · `/mark-delivered`
POST `/{orderId}/verify-rental-handoff` · `/regenerate-rental-handoff-code`
PATCH `/{orderId}/seller-cancel` · POST `/{orderId}/seller-rate`
PATCH `/{orderId}/confirm-receipt` (buyer)
Escrow: POST `/{orderId}/confirm-availability` · `/decline-availability` ·
`/items/availability` · `/availability-decision`

Admin money console: base `/api/v1/admin/orders` (`AdminOrderEscrowController`),
`/api/v1/admin/proformas*` under `/api/v1/admin` (`AdminProformaController`).

## Catalog (public)
`/api/v1/products/categories` · `/products/get-all-products` · `/products/search` ·
`/displayItem/featured` · `/displayItem/itemDetails/{id}` · `/displayItem/filter` (POST body
filterCriteria) · `/products/{productId}/clicks` · `/products/{productId}/rental-blocks`

## Sandbox fixture state (verified 2026-08-23T02:20Z)
- Products: 487 total, 20/page paging; **16 of first 20 have choiceConfiguration** (615–624 rich).
- **FOR_RENT: products 623 (apartment, NIGHT rate) and 470** — AU-016 covered.
- **whatsappNumber: product 627** ("Fixture WhatsApp Contact Phone Listing", TZS 45000,
  image uploads/5272e1e7…favicon.webp) — seeded via real POST /products/post-product by
  orchestrator; AU-019 covered.
- Orders: exactly 1 (`ORD-2026-000011`, AWAITING_SELLER_CONFIRMATION, payoutStatus HELD,
  no deliveryCode yet). All order-lifecycle AUs (034–039) need RW agents to drive the real
  purchase path (proforma → submit-payment → admin verify → confirm) to mint fresh states.
- Test user `mobile.test.20260820@gmail.com` holds BUYER+ADMIN+SELLER (userId 142).

## Fixture-seeding recipe (sandbox only, through the REAL API)
1. `POST /api/v1/products/post-product` (multipart): part `product`=JSON (productName,
   quantity, categoryId/subcategoryId, location fields, currency TZS, askingPrice, plus any
   ListProductDTO field e.g. whatsappNumber), part `images`=file(s).
2. New listings are hidden until logistics are set: PATCH
   `/api/v1/admin/products/{id}/logistics` `{latitude, longitude, deliveryTransportMode,
   neighbourhood}` → flips `deliverySetupReady=true`; public itemDetails then returns 200.
3. Unauthenticated `itemDetails` on a not-ready listing = 404 "Product not found"
   (this IS the AU-013 hidden-guard behavior working as designed).

## Order/escrow lifecycle — curl-proven END-TO-END 2026-08-23T12:36Z (orchestrator, real sandbox)
Full chain executed live: proforma PENDING_PAYMENT -> receipts multipart (74-byte PNG OK,
contentType echoed image/webp) -> submit-payment {transactionReferences,paymentMethodType} ->
PAYMENT_SUBMITTED + order AWAITING_PAYMENT escrowPending=true (T13) -> admin confirm-payment ->
CONFIRMED / PAID / payout HELD / AWAITING_SELLER_CONFIRMATION (T16) -> confirm-availability ->
AWAITING_DELIVERY (T17) -> POST transporter {transporterId} -> trip minted -> POST dispatch ->
IN_TRANSIT + buyer-visible deliveryCode 934415 (T18) -> POST verify-delivery body **{"code":"934415"}**
-> DELIVERED via OTP (T19) -> PATCH confirm-receipt {rating,comment} -> COMPLETED (T20).

### Contract corrections proven against the backend (fix the app to these)
1. `verify-delivery` body key is **`code`** (NOT `deliveryCode`). TransporterController.java:145.
   Wrong-code response: `{"success":false,"message":"INVALID_DELIVERY_CODE","attemptsRemaining":2}`
   (attemptsRemaining did NOT decrement in 4 probes — lockout semantics need re-probing before AU-039 claims it).
2. Buyer-rates-seller endpoint is **POST `/api/v1/orders/{orderId}/seller-rate`** `{rating,reviewText}`.
   There is NO `/api/v1/review-user` (404 INTERNAL "No endpoint"). Seller-rate as non-owner correctly
   refuses ("You are not the seller for this order") — buyer-side rating of seller happens via the
   SAME endpoint when the order's buyer==you? UNPROVEN; needs a second-account probe in AU-037.
3. Admin action verb map (AdminController.java:178-315) — the app's current heuristic
   (`api_client.dart adminOrderAction`) guesses WRONG (would 405) on:
   availability-decision, transporter, verify-delivery, regenerate-delivery-code,
   verify-rental-handoff, regenerate-rental-handoff-code, rate-buyer — ALL are **POST**.
   Correct full map recorded here; AU-043 must replace the heuristic with this explicit map.
4. Refund path PROVEN (T21): PAID order -> PATCH admin cancel {reason} -> CANCELLED +
   refundStatus=REFUND_PENDING refundAmount=72000 (note: amount was the ORDER total incl. fee,
   NOT proforma grandTotal 630000 — order subtotal+fee basis) -> POST admin refund -> REFUNDED +
   refundedAt. Guards PROVEN: release-payment on REFUNDED -> ORDER_REFUNDED; double refund -> NO_REFUND_DUE.
5. `GET /api/v1/orders/{id}` returns deliveryCode ONLY while IN_TRANSIT (buyer view); after DELIVERED
   it is null. canDispatch flips false post-dispatch.

### Fresh fixtures now on sandbox (for verifier use)
- ORD-...012 = COMPLETED payoutStatus RELEASED (full happy path, rated=false)
- ORD b564e951… = CANCELLED refundStatus REFUNDED refundAmount 72000 (refund path)
- PF-2026-000024 CONFIRMED w/ receipt SUBMITTED; PF2 f1062bd2… CONFIRMED

## Contact inbox contract (probed 2026-08-23T13:1xZ, for AU-065)
- REAL source: GET `/api/v1/contact/all?page=&size=` (auth, ADMIN) → `[{id,name,email,reason,
  subject,message,userId,isRead,createdAt}]` — ContactController.java:21. The app's current
  AdminMessagesScreen reads `/api/v1/admin/notifications` (wrong source; matrix row "broken-data-source").

## Buyer-side action contract (probed 2026-08-23, for AU-037/038/039)
- NO `POST /orders/{id}/cancel` for buyers exists anywhere in the backend. Buyer cancel =
  proforma-level POST `/api/v1/proformas/{id}/cancel` (PENDING_PAYMENT only) or the
  AWAITING_BUYER_DECISION path POST `/orders/{id}/availability-decision`
  {decision:'PROCEED_AVAILABLE'|'CANCEL_ORDER'}. OrderLifecycleController has only
  seller-cancel (PATCH). AU-037 must NOT build a nonexistent buyer /cancel button.
- Buyer rate-seller: POST `/api/v1/orders/{id}/seller-rate` {rating,reviewText} — SAME endpoint
  as seller-rate; backend enforces role ("You are not the seller for this order" when wrong).
  UNPROVEN whether buyer-role calls are accepted on completed orders — AU-037 verifier must
  probe with a real second account before claiming the rating flow works.

## Reference review-step structure (for AU-027 builder)
Source: ~/GloboExpats_Frontend/app/checkout/steps/review-step.tsx (+ components/checkout/delivery-route-map.tsx).
Key sections: destination block w/ DeliveryRouteMap previews (routeDestination, routePreviews[]),
per-seller groups from quote.sellerGroups (items + consolidatedDeliveryFee per group),
delivery-quote failure copy via describeDeliveryQuoteFailures/getDeliveryQuoteResolutions,
delivery windows via getAvailableDeliveryWindowValues/isDeliveryWindowPast (lib/checkout-delivery-windows),
terms gate before "Confirm & Proceed to Payment". Copy note: 'Delivery is expected within 24 hours
after payment confirmation. Selecting more than one window gives the seller safe alternatives.'
