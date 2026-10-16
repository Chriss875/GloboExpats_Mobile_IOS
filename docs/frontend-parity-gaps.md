# Mobile vs Frontend — Parity Gap Report

> **Scope:** selling, checkout, requests, order management (buyer + seller), and finance (seller + buyer) — every feature the web app has that the mobile app misses, partially implements, or implements differently.
> **Method:** 12 domains audited in parallel. Each domain: independent exhaustive inventories of both codebases → gap analysis where every claim was re-verified against actual code on **both** sides (file:line evidence) → two adversarial verifiers per domain (one trying to refute each gap by finding the feature elsewhere in the Flutter app, one checking the frontend evidence and severity). Route-level and hidden-affordance sweeps + a completeness critic on top.

> **Coverage statement:** a final completeness critic re-checked the full gap list and sweep results against both repositories and found **no uncovered items** — every feature of the five core flows is accounted for below. 48 additional second-pass candidates (independent re-audit of five domains) are included but not adversarially verified.

**Totals: 275 verified gaps** — 🔴 18 critical · 🟠 111 major · 🟡 146 minor — plus **48 second-pass candidates** (found by an independent re-audit of five domains; not adversarially verified). 2 claimed gap(s) were refuted during verification (appendix).

## Summary by domain

| Domain | Critical | Major | Minor | Refuted | Confirmed-equivalent features |
|---|---:|---:|---:|---:|---:|
| Creating a listing (sell wizard) | 1 | 12 | 9 | 1 | 20 |
| Editing & managing listings + public seller profile | 2 | 13 | 17 | 0 | 21 |
| Cart & checkout | 0 | 8 | 19 | 0 | 23 |
| Community request board | 1 | 10 | 23 | 0 | 18 |
| Order management - buyer side | 1 | 4 | 13 | 0 | 20 |
| Order management - seller side + transport/dispatch | 2 | 13 | 11 | 0 | 18 |
| Seller finance: earnings, payouts, commissions | 2 | 6 | 7 | 0 | 16 |
| Buyer finance: payment methods & payment flows | 1 | 5 | 14 | 0 | 31 |
| API client surface parity (cross-cutting) | 4 | 10 | 10 | 1 | 22 |
| Notifications, pending actions & nudges in commerce flows | 3 | 11 | 8 | 0 | 26 |
| Business-rule & calculation parity (cross-cutting) | 1 | 8 | 10 | 0 | 17 |
| Account gates: verification, addresses, payout/payment-method setup | 0 | 11 | 5 | 0 | 19 |

## 🔴 Critical gaps at a glance

- **[Creating a listing (sell wizard)]** Mobile edit sends transportRequirement 'REQUIRED' for every listing (stored value never loaded) — _broken_
- **[Editing & managing listings + public seller profile]** Mobile edit screen has no image management at all (add, remove, reorder, set cover) — _missing_
- **[Editing & managing listings + public seller profile]** Mobile edit save corrupts delivery state: transportRequirement forced to REQUIRED, rentalConfiguration omitted, rental quantity not forced to 1 — _broken_
- **[Community request board]** Owner cannot see or act on nudges: no nudge inbox, no responses panel, no fulfill-by-nudge — _missing_
- **[Order management - buyer side]** Buyer cannot confirm or counter-propose a proposed delivery time — _missing_
- **[Order management - seller side + transport/dispatch]** Seller-facing dispatch action does not exist on mobile — _missing_
- **[Order management - seller side + transport/dispatch]** Buyer delivery-time accept/counter-propose UI missing (PROPOSED trip loop unresolvable) — _missing_
- **[Seller finance: earnings, payouts, commissions]** Mobile has no seller 'Payments Received' surface at all (per-order payouts, seller documents, receipts) — _missing_
- **[Seller finance: earnings, payouts, commissions]** Mobile never consumes GET /platform-settings/commission; VAT/Selcom rates are hardcoded defaults while web feeds live settings into every calculation — _missing_
- **[Buyer finance: payment methods & payment flows]** Proforma resume deep-link (?proforma=) is accepted but ignored; an unpaid proforma can never be reopened — _missing_
- **[API client surface parity (cross-cutting)]** Checkout resume deep link /checkout?proforma=ID is parsed but the parameter is dropped, so 'Continue payment' from My Payments opens a blank checkout instead of resuming the invoice — _broken_
- **[API client surface parity (cross-cutting)]** Client-side cross-region delivery policy (force-null quoted fees before invoicing) is absent on mobile, so cross-region orders would be invoiced fees the web app defers — _missing_
- **[API client surface parity (cross-cutting)]** Seller dispatch action (POST /orders/{id}/dispatch) is not exposed to sellers on mobile - the verb exists only in the mobile ADMIN action map, so the v2 delivery chain stalls at the seller step — _missing_
- **[API client surface parity (cross-cutting)]** Buyer delivery-time confirm/counter-propose (PATCH /orders/{id}/delivery-time/confirm and /delivery-time/propose) is missing from the user surface on mobile - admin-only verbs and an orphaned local descriptor — _missing_
- **[Notifications, pending actions & nudges in commerce flows]** Nudge inbox / owner responses panel entirely absent; requester can never see who nudged — _missing_
- **[Notifications, pending actions & nudges in commerce flows]** Buyer cannot confirm or counter-propose a proposed delivery time; order stalls at AWAITING_BUYER_CONFIRMATION — _missing_
- **[Notifications, pending actions & nudges in commerce flows]** Seller 'Dispatch items' action has no button; dispatch only exists as an admin action — _missing_
- **[Business-rule & calculation parity (cross-cutting)]** Monthly rental unit count uses an arithmetic formula that diverges from the web's calendar cursor-walk — _broken_

---

# Detailed gaps by domain

## Creating a listing (sell wizard)

### 🔴 CRITICAL · BROKEN — Mobile edit sends transportRequirement 'REQUIRED' for every listing (stored value never loaded)

**ID:** `sell-wizard:SELLWI-03` · **Area:** Edit listing - transport requirement

**Impact:** Any mobile edit of a rental or real-estate (EXEMPT) listing flips it to REQUIRED with no delivery mode - corrupts the listing's delivery contract and, per the platform's deliverySetupReady visibility model, hides it from buyers as 'needs attention'.

- **Frontend evidence:** app/edit-listing/[id]/page.tsx:496-497 - loads transportRequirement from the product on prefill; app/edit-listing/[id]/page.tsx:1110-1112 - save preserves 'EXEMPT' for rentals
- **Mobile evidence:** lib/screens/edit_listing_screen.dart:52 - _transportRequirement declared but never assigned (_load at lines 83-121 sets only _transportMode); lib/screens/edit_listing_screen.dart:224-226 - sends 'transportRequirement': _transportRequirement ?? 'REQUIRED' and gates deliveryTransportMode on (_transportRequirement == 'EXEMPT'), a test that can never be true
- **Mobile-side verification:** Verified in lib/screens/edit_listing_screen.dart: 'String? _transportRequirement;' declared at line 52 and its only other occurrences are the two save-body uses (225, 226) — _load (72-129) assigns only _transportMode (line 119). So line 226 always sends 'transportRequirement': 'REQUIRED' and the (_transportRequirement == 'EXEMPT') test at 225 can never be true, so deliveryTransportMode always carries the loaded mode. Every mobile edit rewrites a rental/real-estate/optional listing's transportRequirement to REQUIRED. Critical is defensible given the deliverySetupReady visibility model.
- **Frontend-side verification:** Frontend verified: app/edit-listing/[id]/page.tsx:496-503 loads transportRequirement from product.transportRequirement (falling back to getDefaultTransportRequirement); lines 1110-1112 save transportRequirement: formData.rentalConfiguration ? 'EXEMPT' : formData.transportRequirement, i.e. the stored/EXEMPT value is preserved. The critical severity is backed by the frontend's own visibility model: lib/image-utils.ts:96-145 (isPublicDeliveryReadyProduct returns false when !hasPickupPin || !transportMode at line 141, and deliverySetupReady===false filters the product out at 133/158-164), so a REQUIRED listing with no delivery mode is hidden from buyers as needs-attention. Critical justified.

### 🟠 Major · missing — Sell verification gate not enforced on mobile

**ID:** `sell-wizard:SELLWI-01` · **Area:** Route gating / verification

**Impact:** Unverified accounts can create and submit listings from mobile, bypassing the web business rule that only verified sellers may list.

- **Frontend evidence:** app/sell/page.tsx:191-198 - <RouteGuard requireAuth requireVerification="sell"> wraps the wizard; components/route-guard.tsx:118-136 - checkVerification('sell') failing toasts 'Verification Required' and router.push('/account/verification')
- **Mobile evidence:** lib/app_router.dart:49-57 - '/sell' is only in _gatedRoutes; lib/app_router.dart:69-76 - _loginRedirect checks only AuthStore.isAuthenticated, no verification check exists anywhere in the router
- **Mobile-side verification:** Read lib/app_router.dart fully: '/sell' is in _gatedRoutes (49-57) and _loginRedirect (69-76) checks only AuthStore.isAuthenticated. Read the entire SellWizardScreen (1731 l) — initState (57-117) and _publish (161-262) contain no verification check; grep repo-wide for 'isVerified|verified|Verification Required|requireVerification' finds no gate on the sell path (only OTP/payment verification flows and api_error_view.dart:49-50 mapping a backend 'seller not verified' message). A VerificationHubScreen exists at /account/verification (app_router.dart:256-259) but nothing routes /sell through it; both /sell entry points (seller_listings_screen.dart:236, delivery_dashboard_screens.dart:547) push unconditionally.
- **Frontend-side verification:** Frontend verified: app/sell/page.tsx:191-198 wraps the wizard in <RouteGuard requireAuth requireVerification="sell" loadingMessage="Verifying seller permissions...">; components/route-guard.tsx:118-136 runs checkVerification('sell') and on failure toasts 'Verification Required' / "Please verify your account to list items for sale..." then router.push('/account/verification'). Description accurate; major is right for a business-rule gate (web blocks unverified sellers from /sell entirely).

### 🟠 Major · missing — Request-nudge prefill and post-publish nudge entirely absent

**ID:** `sell-wizard:SELLWI-02` · **Area:** Request-board nudge flow

**Impact:** Sellers responding to buyer requests cannot prefill the wizard from a request, auto-attach the new listing as a nudge, or land back on the request from mobile.

- **Frontend evidence:** app/sell/page.tsx:361-379 - getPendingRequestNudgeIntent prefills title/category/description/street + 'Request match ready' toast; app/sell/page.tsx:1116-1142 - nudgeRequest POST after publish with 'Nudge sent'/'Listing posted, nudge not sent' toasts and redirect to /request/{id}
- **Mobile evidence:** lib/screens/sell/sell_wizard_screen.dart:244-251 - publish success path ends at clearDraft + 'Listing created.' SnackBar + popUntil; no intent read and no nudge call (repo-wide grep for 'pending_request_nudge_intent'/'nudge' returns zero hits under lib/screens/sell/)
- **Mobile-side verification:** api_client.dart:1354 does define nudgeRequest (even with a productId param) but its only call site is requests_screen.dart:448 (buyer-side 'I can help (nudge)', no productId, no sell navigation). Publish success path sell_wizard_screen.dart:244-251 is exactly clearDraft + 'Listing created.' SnackBar + popUntil — no nudge POST, no /request/{id} redirect. Both /sell entry points push '/sell' with zero arguments; repo-wide grep for 'intent|Request match ready|pending_request|getPendingRequestNudgeIntent' returns no request-nudge prefill anywhere. Nothing prefills title/category/street from a request.
- **Frontend-side verification:** Frontend verified at both cited spots. app/sell/page.tsx:361-379: getPendingRequestNudgeIntent() prefills title (titleFromRequestTitle strips quotes and leading 'looking for ', lines 168-175), category, description 'Posted in response to request: "{title}"\n\n{message}', and street from intent.location, plus 'Request match ready' toast. app/sell/page.tsx:1116-1142: after publish, nudgeRequest(...) POST with 'Nudge sent' success toast and 'Listing posted, nudge not sent' destructive 10s failure toast, then redirect to returnTo || /request/{id}. Backed by lib/request-nudge-intent.ts:3 (key 'pending_request_nudge_intent') and lib/request-board-api.ts:314 (POST /api/v1/request-board/{id}/nudge). Minor wording nit: the prefill text includes the request title plus message, not just '{message}'. Major severity stands.

### 🟠 Major · BROKEN — Mobile edit deletes the --- SPECIFICATIONS --- block (category fields + Item Age) from the description

**ID:** `sell-wizard:SELLWI-04` · **Area:** Edit listing - description/specs

**Impact:** Editing any listing from mobile permanently removes Brand/Model/Year/Item Age etc. spec lines from the stored description - buyer-facing product data loss on every mobile edit.

- **Frontend evidence:** app/edit-listing/[id]/page.tsx:1024-1031 - formatDescriptionWithCategoryFields re-serializes formData.categoryFields plus the item-age condition value back into productDescription on save
- **Mobile evidence:** lib/screens/edit_listing_screen.dart:91-97 - _description.text = parsed.description (prose only; lib/domain/description_parser.dart:28 strips the specs section); lib/screens/edit_listing_screen.dart:193-204 - save sends 'productDescription': desc with no specs re-append and no categoryFields key
- **Mobile-side verification:** description_parser.dart:18-61 splits the '--- SPECIFICATIONS ---' section off; parseProductDescription.description is prose only. Edit screen line 97 puts parsed.description into _description.text and parsed.specifications is never used (grep for 'specifications' in edit_listing_screen.dart: zero hits). Save body line 204 sends 'productDescription': _description.text.trim() with no re-append — line 193 even carries the stale comment 'Fold Item-Age-style spec rows back into the description block' but the next line does no such thing. Specs (Brand/Model/Item Age etc.) are permanently dropped from the stored description on every mobile edit.
- **Frontend-side verification:** Frontend verified: app/edit-listing/[id]/page.tsx:1024-1028 calls formatDescriptionWithCategoryFields(formData.productDescription.trim(), formData.categoryFields, categoryName) and 1033-1037 appendItemAgeToDescription(enhancedDescription, formData.itemAge, listingCondition) before sending productDescription in updateData (line 1087) — the web re-serializes the --- SPECIFICATIONS --- block and Item Age on every save. Major (permanent buyer-facing spec data loss on mobile edits) is right.

### 🟠 Major · divergent — Mobile edit omits choiceConfiguration, rentalConfiguration, production time and delivery-fee bands; no UI to edit them

**ID:** `sell-wizard:SELLWI-05` · **Area:** Edit listing - payload completeness

**Impact:** Mobile cannot edit product choices, rental config, prep time or fee bands, and saves a partial product record where the web round-trips the complete one (mobile's own create code documents that omitted keys reach the backend DTO as null - lib/models/sell_form_state.dart:497-500), risking wiped config on edit.

- **Frontend evidence:** app/edit-listing/[id]/page.tsx:1103-1119 - edit payload sends requiresProductionTime, productionTimeDays, deliveryTransportMode, transportRequirement, choiceConfiguration and rentalConfiguration; line 504 loads fee bands
- **Mobile evidence:** lib/screens/edit_listing_screen.dart:195-231 - save body contains none of those keys; lib/api/api_client.dart:1520-1523 - updateListing PATCH carries only the 'product' JSON part (no images/imageIds either)
- **Mobile-side verification:** Edit save body (edit_listing_screen.dart:195-231) contains none of requiresProductionTime / productionTimeDays / choiceConfiguration / rentalConfiguration / the four delivery-fee-band keys, and the screen has no UI for any of them. api_client.dart:1520-1530 updateListing sends only the multipart 'product' JSON part (no image parts, no imageIds). The null-on-omission risk is documented in mobile's own create code at sell_form_state.dart:497-500 ('an omitted key arrives as null, which is NOT the same value as the 0 web sends').
- **Frontend-side verification:** Frontend verified: app/edit-listing/[id]/page.tsx updateData (lines 1079-1121) sends requiresProductionTime (1104), productionTimeDays (1105-1108), deliveryTransportMode (1109), transportRequirement (1110-1112), choiceConfiguration (1117) and rentalConfiguration (1118-1120); fee bands are loaded from the product at lines 504-507. The web round-trips the complete record, so a mobile save omitting these keys diverges from the platform contract. Major is appropriate (config-wipe risk on a core flow, short of proven money loss).

### 🟠 Major · missing — Mobile edit has no image management at all

**ID:** `sell-wizard:SELLWI-06` · **Area:** Edit listing - images

**Impact:** Sellers cannot add, remove, reorder or re-cover photos from mobile; image fixes (e.g. after rejection) require the web app.

- **Frontend evidence:** app/edit-listing/[id]/page.tsx:1135 (buildEditListingImageSaveOrder), 1191 and 1220 (deleteProductImage for all current images, then re-upload in save order) - full remove/keep/make-cover/re-upload flow
- **Mobile evidence:** lib/screens/edit_listing_screen.dart:33-40 - controllers list has no image state whatsoever; lib/api/api_client.dart:1521-1523 - updateListing multipart has no image parts and no imageIds query
- **Mobile-side verification:** Edit screen controllers list (edit_listing_screen.dart:33-40) has no image state and build (262-439) renders no image grid/controls; the payload has no image keys. api_client.dart:1520-1530 updateListing has no image file parts and no imageIds. Repo-wide grep found no deleteProductImage method anywhere in lib; addProductImages (1460-1475) exists but is called only from the wizard's publish sequence, never from edit. No add/remove/reorder/re-cover is possible from mobile edit.
- **Frontend-side verification:** Frontend verified: app/edit-listing/[id]/page.tsx:1135 buildEditListingImageSaveOrder(...); line 1191 deletes ALL current images via Promise.all(allCurrentIds.map(id => apiClient.deleteProductImage(id))) on reorder; line 1220 deletes individually marked images; plus download-and-reupload in cover-first batches of 5 (1160-1246). The web edit has a full remove/keep/make-cover/reorder flow. Major is right — image repair (e.g. post-rejection) is impossible without it.

### 🟠 Major · missing — Mobile edit has no map-pin picker or saved-address select; an unpinned listing cannot be saved at all

**ID:** `sell-wizard:SELLWI-07` · **Area:** Edit listing - pickup pin / address

**Impact:** The primary 'needs attention' repair (confirm the pickup pin) is impossible from mobile; listings without a pin are hard-blocked on save with no remedy, forcing sellers back to web.

- **Frontend evidence:** app/edit-listing/[id]/page.tsx:24 - imports MapPinPicker for interactive pin setting; app/edit-listing/[id]/page.tsx:1836-1841 - SavedAddressSelect for saved pickup addresses
- **Mobile evidence:** lib/screens/edit_listing_screen.dart:134-139 - _hasValidPin only inspects the loaded lat/lng; lib/screens/edit_listing_screen.dart:162-165 - _save blocks with 'Pick a valid map pin for the pickup address (lat/lng).' though no UI exists to set coordinates; lib/screens/edit_listing_screen.dart:394-410 - free-text street field plus a read-only pin status line
- **Mobile-side verification:** Confirmed in edit_listing_screen.dart: _hasValidPin (134-139) only inspects the loaded _latitude/_longitude; _save hard-blocks at 162-165 with 'Pick a valid map pin for the pickup address (lat/lng).'; the UI offers a free-text street field plus a read-only status line (394-410), and the save body sends the loaded coordinates back (227-228). Nuance, not a refutation: the app does contain a Google-maps pin picker (lib/widgets/map_location_picker.dart, web-parity MapPinPicker) but it is wired only into the Addresses screen (addresses_screen.dart:15,171), never into edit-listing, and no mobile code path writes a listing's coordinates from an address. An unpinned listing is unsaveable from mobile.
- **Frontend-side verification:** Frontend verified: app/edit-listing/[id]/page.tsx:24 imports MapPinPicker (used at 1850-1869 with pin status copy); lines 1834-1842 render the SavedAddressSelect (SavedAddressSelectValue/SavedAddressSelectContent) for pickup addresses, and lines 227-234 auto-preselect the saved address matching the product pin. Major is right: the primary 'needs attention' repair path (confirm the pickup pin) is a core web edit capability.

### 🟠 Major · BROKEN — TSh 1,000 minimum checked in the display currency instead of TZS at publish

**ID:** `sell-wizard:SELLWI-08` · **Area:** Pricing validation - min floor

**Impact:** A seller typing e.g. USD 1,000 passes mobile validation but publishes a ~TSh 380 listing (0.00038 rate), below the platform floor the web enforces - mispriced listings reach the marketplace.

- **Frontend evidence:** app/sell/page.tsx:874-878 - publish re-checks the TZS-converted values (askingPriceInTZS/sellerPayoutInTZS < 1000) and blocks with 'Product value and final asking price must be at least TSh 1,000.'
- **Mobile evidence:** lib/models/sell_form_state.dart:452-454 - validateStep(3) checks state price/payout in the selected currency (askingPrice => price, line 467); lib/models/sell_form_state.dart:476-483 - buildProductJson converts to TZS at publish with no floor re-check
- **Mobile-side verification:** The code claim is accurate: sell_form_state.dart:452-454 checks askingPrice/sellerPayout (askingPrice => price, line 467) in the SELECTED currency, and buildProductJson (476-478) converts to TZS with no floor re-check. But the impact example is inverted: toTzs DIVIDES by the exchange rate (currency.dart:54-59), so USD 1,000 converts to ~TSh 2.63M — above the floor, no leak. Under-enforcement exists only for UGX (rate 1.4 > 1): typing 1,000-1,399 UGX passes mobile's >=1000 check but publishes ~TSh 714-999, below the floor the web enforces. For every other currency (rate < 1) mobile OVER-enforces, blocking small foreign-currency entries web would accept. Real divergence, wrong failure illustration; keeping major since all 16 non-TZS currencies get a floor at the wrong scale.
- **Frontend-side verification:** Frontend verified: app/sell/page.tsx:850-872 computes askingPriceInTZS/sellerPayoutInTZS (dividing by the currency rate for non-TZS) and lines 874-880 block with 'Price too low' / 'Product value and final asking price must be at least TSh 1,000.' exactly as cited. The web enforces the floor on TZS-converted values at publish (its step-3 check at line 678 additionally checks the display-currency value). Major is right for a pricing-floor bypass.

### 🟠 Major · BROKEN — Mobile reports 'Listing created.' success even when the backend returned no productId

**ID:** `sell-wizard:SELLWI-09` · **Area:** Publish - missing productId

**Impact:** When creation silently fails, the mobile seller is told the listing is live and the draft is wiped, so nothing exists on the server and re-entry is manual.

- **Frontend evidence:** app/sell/page.tsx:1010-1014 - createdProductId falsy (0/missing) throws 'Product creation failed: No product ID returned' and lands in the publish-failed path
- **Mobile evidence:** lib/screens/sell/sell_wizard_screen.dart:199-206 - productId may resolve to null and batch uploads are simply skipped; lib/screens/sell/sell_wizard_screen.dart:244-251 - clearDraft + 'Listing created.' SnackBar + popUntil run unconditionally
- **Mobile-side verification:** Verified: sell_wizard_screen.dart:199-206 resolves productId to null when neither root nor data.productId exists; the `if (productId != null)` guard at 206 then skips all image batches (and the quantity/choice PATCHes), and lines 244-251 run unconditionally after the create — clearDraft, 'Listing created.' SnackBar, popUntil(isFirst). createListingMultipart (api_client.dart:1434-1456) performs no productId validation, just decodes the body. A creation that returns no id is reported as success and the draft is destroyed.
- **Frontend-side verification:** Frontend verified: app/sell/page.tsx:1010-1014 — const createdProductId = result.productId; if (!createdProductId) throw new Error('Product creation failed: No product ID returned') — which lands in the catch at 1179-1201 showing the '❌ Publishing Failed' destructive toast; the web never shows success or clears the draft when no productId is returned (draft clear/reset only happens after the success path at 1159-1174). Major is right: false success + draft wipe loses the seller's work.

### 🟠 Major · missing — Wizard does not require a WhatsApp number before publishing

**ID:** `sell-wizard:SELLWI-10` · **Area:** Step 1 validation - WhatsApp

**Impact:** Mobile publishes listings with an empty whatsappNumber, leaving buyers with no contact channel; the web blocks this at step 1.

- **Frontend evidence:** app/sell/page.tsx:639-641 - validateStep(1) blocks with 'No WhatsApp number found. Please add one in your Profile Settings first.'
- **Mobile evidence:** lib/models/sell_form_state.dart:424-432 - step-1 validation checks title/category/subcategory/address only, no WhatsApp branch; lib/screens/sell/sell_wizard_screen.dart:125-136 - profile fetch failure leaves the field blank silently
- **Mobile-side verification:** validateStep(1) (sell_form_state.dart:424-432) checks title/category/subcategory/pickup-address only — no WhatsApp branch (verified by reading the full switch). _loadWhatsappFromProfile (sell_wizard_screen.dart:125-136) silently swallows fetch failure leaving the field blank, and buildProductJson line 506 sends 'whatsappNumber': whatsappNumber.trim() — an empty string rides through to publish. Web's step-1 block has no mobile counterpart.
- **Frontend-side verification:** Frontend verified: app/sell/page.tsx:639-641 in validateStep(1): 'No WhatsApp number found. Please add one in your Profile Settings first.' — validation failures toast under '📝 Almost There!' (701-707) and never advance the step. Major is right: the web hard-blocks publishing without a WhatsApp contact channel.

### 🟠 Major · partial — Rental listing-purpose controls missing: rental forced by taxonomy, no For-sale/For-rent switch, unconstrained rate periods

**ID:** `sell-wizard:SELLWI-11` · **Area:** Step 1 - rental configuration

**Impact:** On mobile a rental subcategory can never be listed 'For sale', a property cannot be opted into For-rent booking, and period options are not constrained per vehicle/property as on web - different listing types get created for the same seller actions.

- **Frontend evidence:** components/product-choices/rental-listing-editor.tsx:73-104 - 'Listing purpose' select (For sale when not automatic / For rent) with 'This subcategory uses booking automatically.' note; 105-136 - vehicle rate buttons HOUR/DAY/WEEK/MONTH with descriptions; 138-156 - non-vehicle 'Charge buyers' NIGHT/DAY/WEEK/MONTH
- **Mobile evidence:** lib/screens/sell/sell_wizard_screen.dart:1661-1730 - _RentalNotice offers only a 'Charged' dropdown with all five periods for every rental; lib/models/sell_form_state.dart:308-324 - _applyRentalDefault forces rental purely from taxonomy (no opt-out) and nothing can enable rental for a non-rental subcategory
- **Mobile-side verification:** Verified: _applyRentalDefault (sell_form_state.dart:308-324) derives rental purely from rentals.dart getDefaultRentalConfiguration(categorySlug, subcategorySlug) (rentals.dart:284-302); setRental (sell_form_state.dart:409) exists but has zero call sites in lib, so no For-sale/For-rent switch or opt-out exists — a rental subcategory can never be listed FOR_SALE and a non-rental one never FOR_RENT. _RentalNotice (sell_wizard_screen.dart:1661-1730) exposes a single 'Charged' dropdown listing all five periods for every rental (vehicles can be set NIGHT, properties HOUR), unlike web's constrained per-type sets.
- **Frontend-side verification:** Frontend verified in components/product-choices/rental-listing-editor.tsx: lines 73-104 'Listing purpose' select offering 'For sale' only when !automaticRental (line 95) with the note 'This subcategory uses booking automatically.' (99-103); lines 105-136 vehicle rate buttons HOUR/DAY/WEEK/MONTH with per-option descriptions; lines 138-156 non-vehicle 'Charge buyers' select NIGHT/DAY/WEEK/MONTH. Choosing 'For sale' clears the rental config (onChange(null), 78-87). Major is right: listing purpose determines the created listing type.

### 🟠 Major · divergent — Choice editor not auto-enabled for subcategories with recommended attributes

**ID:** `sell-wizard:SELLWI-12` · **Area:** Step 2 - product choices default

**Impact:** Mobile sellers start with attributes/choices OFF where web pre-enables them, so mobile-created listings routinely lack the recommended fixed details and buyer choices unless the seller discovers the hidden switch.

- **Frontend evidence:** app/sell/page.tsx:1951 - ProductChoiceEditor gets defaultEnabled; components/product-choices/product-choice-editor.tsx:84-92 - when definitions exist and config is empty it auto-applies { hasChoices: true }
- **Mobile evidence:** lib/screens/sell/product_choice_editor.dart:43-69 - _maybeFetch loads definitions but never sets hasChoices; lib/screens/sell/product_choice_editor.dart:160-163 - master Switch binds to config.hasChoices which starts false (lib/models/sell_form_state.dart:71 - choiceConfiguration = ProductChoiceConfiguration.empty)
- **Mobile-side verification:** Verified: product_choice_editor.dart:43-69 _maybeFetch only loads _definitions and never touches hasChoices; the master Switch (160-163) binds config.hasChoices which starts false (ProductChoiceConfiguration.empty = hasChoices:false, product_choices.dart:280; initial field sell_form_state.dart:71). No auto-enable exists anywhere in the mobile editor — the editor's per-attribute cards are only rendered 'if (config.hasChoices)' (line 182), so recommended attributes are invisible until the seller finds the switch.
- **Frontend-side verification:** Frontend verified: app/sell/page.tsx:1951 passes defaultEnabled to ProductChoiceEditor; components/product-choices/product-choice-editor.tsx:84-92 auto-fires onChangeRef.current({ hasChoices: true, attributes: [] }) when defaultEnabled && visibleDefinitions.length > 0 && the current config is empty — i.e. choices pre-enable for subcategories with recommended attributes. Major is reasonable: it changes the default content of every mobile-created listing for those subcategories.

### 🟠 Major · partial — 'Mark out of stock', the quantity 'Mark as available' dialog and 'View Details' missing; status menu not state-conditional

**ID:** `sell-wizard:SELLWI-18` · **Area:** My Listings - stock/status actions

**Impact:** Sellers cannot mark a listing sold-out or set its available quantity from mobile (only via the edit form), have no View Details shortcut, and can archive Pending/Rejected/Sold rows the web protects.

- **Frontend evidence:** components/ui/product-card.tsx:978-1007 - 'View Details', 'Mark as available' (only when out of stock and not a rental) and 'Mark out of stock'; 1024-1040 - Archive/Delete; app/expat/dashboard/page.tsx:4424-4474 - quantity dialog ('Enter the quantity currently available for ...') and 1590 updateProductInventory PATCH
- **Mobile evidence:** lib/screens/seller_listings_screen.dart:502-517 - Status popup offers only AVAILABLE/'Mark available' and ARCHIVED/'Archive' unconditionally for every row; no inventory endpoint call exists (grep: updateProductInventory absent from lib/)
- **Mobile-side verification:** Verified: the Status popup (seller_listings_screen.dart:502-517) is a const menu offering only AVAILABLE/'Mark available' and ARCHIVED/'Archive' for every row regardless of state; card actions are Edit/Dates/Status/Delete only (487-524) — no 'View Details', no 'Mark out of stock', no quantity dialog. Repo-wide grep for 'inventory|updateProductInventory|View Details' finds no inventory write anywhere in lib (only buyer-side out-of-stock rendering in product_detail_screen.dart and the filter label); the only quantity write paths are the create-flow updateListingQuantity workaround and the edit form's field. updateProductStatus (api_client.dart:1495-1504) accepts only AVAILABLE|ARCHIVED.
- **Frontend-side verification:** Frontend verified: components/ui/product-card.tsx:978-1007 — 'View Details' (978), 'Mark as available' only when !availableRentalConfiguration && onStockChange && isOutOfStock (980-991), 'Mark out of stock' hidden for rentals/ARCHIVED/PENDING/UNAPPROVED/SOLD (992-1009); Archive gated the same way and red 'Delete Listing' at 1010-1043 (cited 1024-1040). Dashboard quantity dialog at app/expat/dashboard/page.tsx:4409-4479 with 'Enter the quantity currently available for {productName}.', min 0.01/step any/autoFocus input and 'Update quantity' spinner button; apiClient.updateProductInventory PATCH at line 1590 with success/failure toasts (1592-1606). Major is right — stock management is a core seller capability.

### 🟡 Minor · partial — Review step omits subcategory, WhatsApp, quantity, production time, configured attributes and delivery tariff

**ID:** `sell-wizard:SELLWI-13` · **Area:** Step 4 - review content

**Impact:** The last checkpoint before publishing shows far less detail on mobile; sellers cannot verify contact number, stock, prep time, choice configuration or the delivery tariff before going live.

- **Frontend evidence:** components/sell/review-step.tsx:159-191 - Subcategory/Location/Street/WhatsApp/Available Quantity/Production Time rows; 211-227 - 'Product attributes and buyer choices' block; 333-354 - delivery tariff box; 128-138 and 359-366 - 'Ready to Publish!'/'Ready to Go Live?' panels
- **Mobile evidence:** lib/screens/sell/sell_wizard_screen.dart:1574-1615 - review shows only Title/Category/Pickup, first-6 photos + truncated description, and Final asking price/You receive/Original price/Transport rows
- **Mobile-side verification:** Read the entire _StepReview (sell_wizard_screen.dart:1536-1627): cover hero, then 'Basic details' with Title/Category/Pickup (1578-1581), 'Photos & description' with first-6 thumbs + truncated description (1588-1600), 'Pricing & delivery' with Final asking price/You receive/Original price/Transport (1607-1613), and Clear all. No subcategory, WhatsApp, quantity, production time, product-attributes block, delivery tariff, or ready-to-publish panel anywhere. Minor is the right severity.
- **Frontend-side verification:** Frontend verified in components/sell/review-step.tsx: 'Ready to Publish!' panel at 128-138; rows Subcategory (159-162), Location (163-176), Street (177-179), WhatsApp (180-182), Available Quantity (183-185), Production Time (186-191); 'Product attributes and buyer choices' block at 211-227; delivery tariff box at 333-354 with the exact 'Current tariff: TSh {baseFare} for the first {baseKm} km, then TSh {ratePerKm} per additional kilometre.' copy; 'Ready to Go Live?' panel at 359-366. Minor is right — informational checkpoint content.

### 🟡 Minor · divergent — Commission breakdown rendered with different rows, no placeholders, no category header or Terms link

**ID:** `sell-wizard:SELLWI-14` · **Area:** Step 3 - commission breakdown display

**Impact:** Mobile exposes VAT/Selcom rows the web hides and omits the product-value row, placeholders and Terms link; the underlying math and payload are identical, so this is informational divergence only.

- **Frontend evidence:** components/sell/commission-calculator.tsx:71-83 - category header with 'Automatic pricing' badge; 165-187 - rows 'Your product value'/'GloboExpats commission'/'Final Total Asking Price' with '-' placeholders below TSh 1,000; 189-201 - footnote with /terms#commission link
- **Mobile evidence:** lib/screens/sell/sell_wizard_screen.dart:1127-1133 - rows 'GloboExpats commission'/'VAT'/'Selcom fee'/'Final total asking price' only; no product-value row, no '-' placeholders, no header/badge, no Terms link
- **Mobile-side verification:** Verified at sell_wizard_screen.dart:1127-1133: rows are exactly 'GloboExpats commission' / 'VAT' / 'Selcom fee' / 'Final total asking price'. No 'Your product value' row, no '-' placeholders (the block only renders when both amounts > 0, lines 1031-1033), no category header/'Automatic pricing' badge, no /terms#commission link (grep: no terms link in the wizard). Mobile additionally shows VAT/Selcom rows web hides. Underlying math and payload match; informational divergence only, minor is right.
- **Frontend-side verification:** Frontend verified in components/sell/commission-calculator.tsx: category header + 'Automatic pricing' badge at 71-83; breakdown rows 'Your product value' (168), 'GloboExpats commission' (174, red), 'Final Total Asking Price' (181, emerald) with '-' placeholders whenever hasPrice is false (line 66: both values >= 1000 else '-'), at 165-187; footnote with Link to /terms#commission at 189-201. The web shows exactly three rows and hides VAT/Selcom detail. Minor (informational divergence) is right.

### 🟡 Minor · missing — No 'stored as TSh in TZS at the displayed rate' note when a non-TZS currency is selected

**ID:** `sell-wizard:SELLWI-15` · **Area:** Step 3 - currency transparency

**Impact:** Mobile sellers are never told the backend stores TZS at the displayed rate; combined with SELLWI-08 the floor rule is invisible for non-TZS sellers.

- **Frontend evidence:** app/sell/page.tsx:2135-2143 - live note '... TSh {tzs} ... in TZS at the displayed rate.' under the price inputs
- **Mobile evidence:** lib/screens/sell/sell_wizard_screen.dart:1040-1133 - step 3 renders currency dropdown, price fields, breakdown and transport only; no storage note exists anywhere in the wizard
- **Mobile-side verification:** Read the full wizard and grepped lib/screens/sell for 'stored|displayed rate|indicative|TZS': step 3 (sell_wizard_screen.dart:1040-1191) renders the currency dropdown, the two price fields or priced-choice readouts, the breakdown and transport controls only. No 'stored as TSh / in TZS at the displayed rate' note exists anywhere in the wizard; the only TZS-mention is the per-choice payout field label in product_choice_editor.dart:833.
- **Frontend-side verification:** Frontend verified: app/sell/page.tsx:2131-2146 — when currency !== 'TZS' and a positive price is entered, renders 'Final asking price is stored as TSh {tzs.toLocaleString()} in TZS at the displayed rate.' directly under the pricing controls. Minor is right.

### 🟡 Minor · divergent — Image cap divergent: mobile stops at 50 silently, web enforces 30 with a toast; no total-size counter

**ID:** `sell-wizard:SELLWI-16` · **Area:** Step 2 - image caps

**Impact:** Mobile can submit up to 50 images where the web/backend path caps at 30 (extras then fail per batch, surfacing as 'some photos failed'), and sellers get no cumulative-size feedback.

- **Frontend evidence:** app/sell/page.tsx:790-799 - MAX_IMAGES = 30, toast 'Backend allows up to 30 images...' and slice; app/sell/page.tsx:1819-1821 - live 'Total size: X MB / 100MB' line
- **Mobile evidence:** lib/screens/sell/sell_wizard_screen.dart:294 - pick loop breaks at 50 images with no toast; lib/screens/sell/sell_wizard_screen.dart:821 - caption 'Up to 50 - JPG, PNG or WebP - 10MB each' with no running size counter
- **Mobile-side verification:** Verified: _pickImages stops silently at 50 images ('if (state.images.length + kept.length >= 50) break;', sell_wizard_screen.dart:294) and also silently at the 100MB cumulative cap (line 283) — no toast in either case; the only feedback is the per-file >10MB skip snackbar (300-304). Caption at line 821 reads 'Up to 50 – JPG, PNG or WebP – 10MB each' and there is no running total-size counter anywhere on step 2 (full file read). Divergence from web's 30-cap + toast + 'Total size' line stands; minor is right.
- **Frontend-side verification:** Frontend verified: app/sell/page.tsx:790-799 — MAX_IMAGES = 30, toast '📸 Too many photos' / 'Backend allows up to 30 images. Extra images will be ignored.' and slice(0, 30); live 'Total size: X.X MB / 100MB' line at 1817-1823 (cited 1819-1821); note the web dropzone copy itself advertises 'Up to 50' (line 1812) while enforcing 30 at publish. Minor is right.

### 🟡 Minor · divergent — Clear all leaves quantity, item age and WhatsApp unrestored-to-default

**ID:** `sell-wizard:SELLWI-17` · **Area:** Clear all

**Impact:** After 'Clear all', a new mobile draft silently carries the previous quantity/item age, unlike the web's full reset.

- **Frontend evidence:** app/sell/page.tsx:270-281 - clearForm sets formData to INITIAL_FORM_DATA (every field including quantity/originalPrice reset) and removes the draft
- **Mobile evidence:** lib/screens/sell/sell_wizard_screen.dart:393-407 - reset list covers title/description/images/category/price/address/transport/choices only; state.quantity, state.itemAge and state.whatsappNumber are not reset despite the dialog copy 'This wipes every field of this draft.'
- **Mobile-side verification:** Verified _clearAll (sell_wizard_screen.dart:393-407): the reset list covers title, description, images, category/commission, price/payout/originalPrice, address+lat/lng, transport mode/requirement/feeBands and choices, plus step reset — it never assigns state.quantity, state.itemAge or state.whatsappNumber (cross-checked against SellFormState's field list; quantity default 1, itemAge '', whatsapp from profile). The dialog copy at line 384 says 'This wipes every field of this draft.', so the residue contradicts the copy exactly as claimed. Minor is right.
- **Frontend-side verification:** Frontend verified: app/sell/page.tsx:270-281 clearForm removes the sessionStorage draft and setFormData(INITIAL_FORM_DATA) — and INITIAL_FORM_DATA (lines 133-164) resets every field including quantity: '', itemAge: '', originalPrice: '' and whatsappNumber: '' — plus toast 'Form cleared'. The web truly wipes all fields. Minor is right.

### 🟡 Minor · partial — No text search, subcategory filter, attention banner with repair CTA, or pagination

**ID:** `sell-wizard:SELLWI-19` · **Area:** My Listings - filters and attention UX

**Impact:** On larger catalogs mobile sellers cannot search listings, and delivery-setup problems are only discoverable through the 'Needs attention' chip - no banner, no per-listing 'fix now' affordance, and all rows render at once.

- **Frontend evidence:** app/expat/dashboard/page.tsx:2882-2899 and 3058-3059 - search inputs; 2868 - '{n} need attention' chip; 3198-3215 - attention banner with 'Show affected'/'Show all listings' toggle; 3328 - '{repair label} - update now' deep link per affected card
- **Mobile evidence:** lib/screens/seller_listings_screen.dart:281-341 - only status chips, a category dropdown and a sort dropdown (no search, subcategory filter or pagination); lib/screens/seller_listings_screen.dart:123-134 - _needsAttention is used solely as a filter value, with no banner or per-card repair CTA
- **Mobile-side verification:** Verified in seller_listings_screen.dart: the filter row is status ChoiceChips (93-103 rendered at 281-298), a category-name dropdown (307-324) and a sort dropdown (325-338) — no text search, no subcategory filter, no pagination (ListView.separated over all filtered rows, 348-353; pull-to-refresh only). _needsAttention (123-134) is referenced exactly once, as the 'attention' filter value (line 273); no banner, no 'Show affected' toggle, no per-card repair CTA exists. Minor is right.
- **Frontend-side verification:** Frontend verified: app/expat/dashboard/page.tsx — search inputs at 2880-2906 (mobile, aria 'Search your listings') and 3057-3063 (desktop, placeholder 'Search your listings...'); '{n} need attention' chip at 2857-2871 (sets status filter 'attention'); attention banner at 3187-3219 with 'Delivery information needs attention', the singular/plural body copy and 'Show affected'/'Show all listings' toggle; per-card repair button '{getLogisticsRepairLabel(listing)} - update now' deep-linking to /edit-listing/{id} at 3319-3330; subcategory filter at 3092+; cumulative pagination ('Showing 1 to {n} of {total} listings', 3346-3351) with infinite-scroll sentinel. Minor is right (filtering/attention discoverability polish on top of the existing 'Needs attention' filter).

### 🟡 Minor · divergent — Category dropdown not normalized: no dedupe, no 'jobs' filter, no A-Z sort with 'Other' last

**ID:** `sell-wizard:SELLWI-20` · **Area:** Step 1 - category list normalization

**Impact:** The mobile category picker can show duplicate or 'jobs' entries, different ordering and no 'Other'-last convention compared to web.

- **Frontend evidence:** app/sell/page.tsx:1554-1579 - dedupes categories, filters categoryName !== 'jobs', sorts A-Z and moves 'Other' to the bottom; 1588-1590 - 'Loading categories...' placeholder row
- **Mobile evidence:** lib/api/api_client.dart:55-66 - fetchCategories returns the raw backend list unfiltered/unsorted; lib/screens/sell/sell_wizard_screen.dart:606-620 - dropdown consumes it directly
- **Mobile-side verification:** Verified: fetchCategories (api_client.dart:55-66) maps the raw backend JSON array straight into Category objects with no dedupe, no 'jobs' filter, no sorting; the wizard dropdown (sell_wizard_screen.dart:606-620) builds items directly from widget.categories with no intervening normalization (grep found no 'Other'/'jobs'/sort logic in the sell flow). Loading is a full-screen spinner (318-319), not a placeholder row. Divergence as claimed; minor is right.
- **Frontend-side verification:** Frontend verified: app/sell/page.tsx:1554-1561 dedupes by categoryName+categoryId (with a console.warn on duplicates), 1570-1572 filters out categoryName.toLowerCase() === 'jobs', 1575-1579 sorts A-Z then moves 'Other' to the bottom, and 1587-1590 renders a disabled 'Loading categories...' row while empty. Minor is right.

### 🟡 Minor · divergent — Default saved address is not preselected as the pickup address

**ID:** `sell-wizard:SELLWI-21` · **Area:** Step 1 - pickup address preselect

**Impact:** Mobile sellers must always pick an address manually and get no 'Default' marker, adding friction and risking publishing from an unintended pickup address.

- **Frontend evidence:** app/sell/page.tsx:440-448 - prefill effect selects addresses.find(isDefault) || addresses[0] and sets location/street automatically
- **Mobile evidence:** lib/screens/sell/sell_wizard_screen.dart:687-747 - _AddressPicker FutureBuilder renders an unselected radio list (no default marking or preselect); lib/models/sell_form_state.dart:64 - selectedAddressId starts null
- **Mobile-side verification:** Verified: _AddressPicker (sell_wizard_screen.dart:684-751) renders unselected RadioListTiles with no 'Default' marker and no preselect effect; selectedAddressId starts null (sell_form_state.dart:64) and setLocationFromAddress runs only on user tap. getDefaultAddress exists in api_client.dart:1542 ('used by checkout/sell prefill' per its comment) but repo-wide grep shows zero call sites — nothing in the sell flow auto-picks the default or first address. Friction as claimed; minor is right.
- **Frontend-side verification:** Frontend verified: app/sell/page.tsx:440-448 prefill effect selects addresses.find(addr => addr.isDefault) || addresses[0] and sets location/street from it, and lines 482-486 additionally preselect that address as selectedAddressId (the default marker itself is rendered by SavedAddressSelectContent). Minor is right.

### 🟡 Minor · missing — Admin edit mode (?admin=true via updateAdminProduct) missing

**ID:** `sell-wizard:SELLWI-23` · **Area:** Edit listing - admin path

**Impact:** Admins cannot perform admin-scope listing edits from mobile; that workflow stays web-only.

- **Frontend evidence:** app/edit-listing/[id]/page.tsx:163-165 - searchParams 'admin' + isAdminUser switches the save to apiClient.updateAdminProduct
- **Mobile evidence:** lib/screens/edit_listing_screen.dart:155-236 - single save path through updateListing only; lib/app_router.dart:310-315 - /edit-listing/:id route ignores any admin parameter
- **Mobile-side verification:** Verified: no updateAdminProduct method exists anywhere in lib (grep; api_client has only adminProducts list 651-653, adminProductsExpiringSoon 836-837, and adminUpdateProductStatus 877-880 which is a moderation status PATCH, not a full admin product update). EditListingScreen._save has a single path through updateListing (edit_listing_screen.dart:232) and the /edit-listing/:id route (app_router.dart:310-315) ignores any admin query parameter. Admin-scope listing editing is web-only, as claimed; minor is right.
- **Frontend-side verification:** Frontend verified: app/edit-listing/[id]/page.tsx:163-166 — isAdminEdit = searchParams.get('admin') === 'true' && isAdminUser(user); updateProductForRole binds apiClient.updateAdminProduct for the admin path (also used for admin image batches at 1202-1203). Minor is right: admin-only workflow, no impact on regular sellers.

#### Refuted claims in this domain (1)

- ~~Edit silently clears a subcategory that is inactive or missing from the taxonomy~~ — The claim misreads the code. edit_listing_screen.dart:305-307 nulls only the DROPDOWN's displayed value ('value: _subs.any((s) => s.subcategoryId == _subcategoryId) ? _subcategoryId : null') — the _subcategoryId field itself keeps the loaded id (set at line 99) and is never cleared by the missing-from-taxonomy case. The save body then still sends it: line 198 is 'if (_subcategoryId != null) 'subcategoryId': _subcategoryId', and _subcategoryId is non-null, so the original (inactive) subcategoryId IS included in every save. The only path that drops it is the user explicitly changing category (296-299), which is user-initiated. Actual mobile behavior on edit is payload preservation (like web), with a cosmetic empty-dropdown display — the claimed silent subcategory loss does not occur.

#### Second-pass candidates (10) — unverified

_Found by an independent re-audit of this domain (different inventory pass). Not adversarially verified; wording may overlap a canonical gap above._

- **🔴 CRITICAL · missing — Platform commission settings are never fetched; mobile always uses hardcoded defaults**
  - Impact: If the platform ever changes VAT/Selcom rates server-side, the web wizard reprices while mobile keeps computing sellerPayout/finalTotalSellingPrice/commission fields from stale constants. The backend trusts these client-sent money fields, so mobile listings would be mispriced.
  - FE: lib/api.ts:1402 - dedupeGet fetches '/api/v1/platform-settings/commission'; hooks/use-platform-commission-settings.ts:18 - 60s TTL cache; app/sell/page.tsx:257 - settings feed the wizard's commission engine
  - MO: lib/models/sell_form_state.dart:97 - `CommissionRates rates = const CommissionRates();` is the only assignment in the repo (grep for 'platform-settings' across lib/ returns nothing); lib/domain/commission_calculator.dart:11-13 - vatRate 0.18 / selcom rates 0.02 hardcoded
- **🟠 Major · missing — Missing productId from create is silently treated as success**
  - Impact: When the backend multipart-parse fails (web's apiClient returns {productId: 0} for non-JSON responses), mobile tells the seller the listing was created while remaining photos/quantity/choice-images were never uploaded - no review warning, no guidance.
  - FE: app/sell/page.tsx:1069-1090 - no-productId path shows destructive 'Listing May Need Review' toast (10s), waits 3s, redirects to /expat/dashboard?tab=listings&warning=check-status
  - MO: lib/screens/sell/sell_wizard_screen.dart:199-206 - null productId skips every remaining upload; :244-251 - unconditionally shows 'Listing created.' and pops to root (productId==0 proceeds to PATCH /products/update/0)
- **🟡 Minor · divergent — Create flow caps images at 50 instead of web's 30**
  - Impact: Business-rule divergence: mobile can push up to 50 images at a listing where the backend (per web's comment) allows 30, risking server-side failures or oversized listings.
  - FE: app/sell/page.tsx:791-798 - `const MAX_IMAGES = 30` with slice and toast 'Backend allows up to 30 images. Extra images will be ignored.' (UI copy advertises 50 at :1812)
  - MO: lib/screens/sell/sell_wizard_screen.dart:294 - `if (state.images.length + kept.length >= 50) break;` enforces 50 on create
- **🟡 Minor · partial — Custom color input limited to 11 fixed swatches (no arbitrary color picker)**
  - Impact: Buyers-choice colors outside the 11 presets (web default #64748b grey, pastels, etc.) cannot be authored on mobile.
  - FE: components/product-choices/product-choice-definition-editor.tsx:255-263 - `<Input type="color">` custom picker (default '#64748b' at :50) alongside predefined chips
  - MO: lib/screens/sell/product_choice_editor.dart:315 - fixed `_swatches` map of 11 named colors; :546-570 - swatch row + name field, no custom hex picker
- **🟡 Minor · partial — Dimensions custom value hardcodes centimetres; web offers cm/m/mm/in/ft unit buttons**
  - Impact: Sellers working in inches/feet/metres must mentally convert; stored dimension labels always read 'cm' regardless of the real unit.
  - FE: components/product-choices/dimension-choice-input.tsx:9-15 - DIMENSION_UNITS cm/m/mm/in/ft; :91-103 - unit toggle button group prepends the chosen unit to the label
  - MO: lib/screens/sell/product_choice_editor.dart:390-392 - labels hardcoded as 'L {v}cm'/'W {v}cm'/'H {v}cm' with no unit selection
- **🟡 Minor · partial — Address picker never marks or fetches the default address**
  - Impact: Sellers with multiple addresses get no default hint on mobile and the preselection convenience of web is absent.
  - FE: components/location/saved-address-select.tsx:46 - renders `{address.isDefault && '• Default'}` suffix (list + default loaded via useAddresses)
  - MO: lib/screens/sell/sell_wizard_screen.dart:687+ - _AddressPicker FutureBuilder calls getAddresses only; get-default-address exists in lib/api/api_client.dart but has no sell-flow call site; radio subtitle shows 'pinned · place' (:1.3.3) with no default marker
- **🟡 Minor · partial — Choice payout input lacks inline invalid state and the 'Final price' confirmation box**
  - Impact: Invalid per-choice amounts give no immediate feedback on mobile; the seller only discovers the problem at step validation, and web's per-value final-price confirmation is missing.
  - FE: components/product-choices/choice-seller-payout-input.tsx:68 - red border when invalid; :73-74 - 'Enter an amount greater than zero.'; :79-82 - emerald 'Final price' box
  - MO: lib/screens/sell/product_choice_editor.dart:828-838 - _PayoutField is a plain TextField (no error decoration); invalid input is silently ignored (double.tryParse null) and empty-on-blur is not normalized to 0
- **🟡 Minor · missing — Per-step selling tips / sidebar content absent**
  - Impact: Mobile loses the contextual selling guidance web shows per step (photos quality, pricing, category tips).
  - FE: lib/step-tips.ts:37-103 - four tips per step consumed by the desktop SellingSidebar plus category tips
  - MO: lib/screens/sell/sell_wizard_screen.dart:597-666 (step 1 column) - only form fields; no tip widgets exist anywhere in the 1731-line wizard file
- **🟡 Minor · missing — No link from the read-only WhatsApp field to account settings**
  - Impact: A seller whose WhatsApp is wrong/missing must leave the wizard and find settings themselves; web routes them there directly with a return path.
  - FE: app/sell/page.tsx:1719 - href="/account/settings?returnTo=/sell" next to the read-only phone input
  - MO: lib/screens/sell/sell_wizard_screen.dart:660-664 - the WhatsApp TextFormField has helperText 'Managed in account settings' but is not tappable and no navigation is offered
- **🟡 Minor · partial — No search input, no filter counts, no pagination, no archive-date footnote on cards**
  - Impact: Sellers with many listings cannot search their catalog and see unpaginated raw lists; the 'Archives 12 Mar 2026' notice is missing.
  - FE: app/expat/dashboard/page.tsx:3058-3059 - 'Search your listings...' search input; per-category counts and 20/page cumulative pagination and 'Archives {date}' footnote per the listing-card implementation
  - MO: lib/screens/seller_listings_screen.dart:281-341 - filter chips + category/sort dropdowns only (no search field, no counts); :348-354 - full ListView with no pagination; card :478-481 shows price/stock/views but no archiveDate line

<details><summary><strong>Confirmed equivalent in both apps (20)</strong></summary>

- 4-step wizard Details/Photos/Pricing/Review with per-step validation on forward moves, free backward jumps, publishing spinner, and inline error surfacing (lib/screens/sell/sell_wizard_screen.dart:146-157, 504-554 vs app/sell/page.tsx:625-741)
- Draft autosave with 3s debounce, images never persisted, restore guarded against the autosave race, draft cleared on publish and on Clear all (lib/models/sell_form_state.dart:119-206, sell_wizard_screen.dart:77-116 vs app/sell/page.tsx:283-401, 1159-1170)
- Commission engine is an exact port: same grossTargetRate/multiplier formulas, FORWARD ceil-to-1000 / REVERSE floor-to-1000 with zero-floor guard, identical breakdown fields, and identical category fallback table including Vehicles/'Pet & Supplies'/Other aliases with the fetched commissionRate winning (lib/domain/commission_calculator.dart:59-174 vs lib/commission.ts)
- Create payload key-for-key match with web's productData: all commission fields (incl. platformNetProfit = AfterCuts), currency 'TZS', 'Not specified' street/zip defaults, latitude/longitude/placeName/neighbourhood, four fee-band fields zeroed when exempt, rentalConfiguration and choiceConfiguration-with-images-stripped (lib/models/sell_form_state.dart:471-568 vs app/sell/page.tsx:940-987)
- 17 currencies with identical rates/decimals/symbol positions; switching currency re-denominates payout, price, original price and per-choice adjustments (lib/domain/currency.dart:28-44, sell_form_state.dart:288-298 vs app/sell/page.tsx:2040-2075)
- Transport: 6 modes with identical fare ladder (BODA 2000/600 ... SEMI_TRUCK 45000/4500), fare = ceil-to-1000(base + max(0,km-1.5)*rate), same fallback bands fare(2)/fare(25)/fare(25)/fare(100) auto-filled on mode change and zeroed for exempt; requirement selector offers REQUIRED/EXEMPT cards, locks to EXEMPT for rentals/real-estate with the same copy, EXEMPT clears mode+bands (lib/domain/delivery_fare.dart, sell_wizard_screen.dart:1227-1307, sell_form_state.dart:393-407 vs components/sell/transport-requirement-selector.tsx:36-37, transport-mode-selector.tsx)
- Per-choice pricing system: allowDifferentPrices toggle seeding (default keeps base, others priceOverridden with adjustment = -base), setChoiceSellerPayout rebasing with sibling re-anchor, normalizeChoicePriceDefault, non-positive priced-choice guard with the same message plus the 'Enter the amount you receive for at least one priced choice' min-1000 rule (lib/domain/product_choices.dart, sell_form_state.dart:443-450 vs app/sell/page.tsx:643-666)
- Priced-choices mode on step 3 hides editable inputs and shows the DEFAULT CHOICE PRICE panel plus per-value rows with Default/Custom price/Uses default price pills, red commission, green final price, the amber base-payout<=0 warning and the combine-at-checkout footnote (sell_wizard_screen.dart:1072-1137, 1311-1428 vs commission-calculator readOnly + ChoicePriceRows)
- Product choice editor: master switch explainer copy, per-slug helper texts (dimensions/choice-condition/warranty/age), predefined chips with color dots, Buyer choice vs Fixed detail badges, per-value active switch / Make default (disabled when inactive) / remove, archived-attribute amber card with Remove, buyer preview chips with TSh amounts (lib/screens/sell/product_choice_editor.dart vs components/product-choices/*)
- Visual choice values attach wizard photos by index and are resolved after publish by re-fetching itemDetails and PATCHing choiceConfiguration (sell_wizard_screen.dart:226-241 vs app/sell/page.tsx:1047-1065)
- Item Age: conditional on a non-NEW configured condition choice, serialized into the --- SPECIFICATIONS --- block and skipped for NEW (sell_form_state.dart:279-283, 487-490 vs app/sell/page.tsx:1954-1969)
- Production time: switch + 1..365 whole-day validation with identical message, cleared when switched off, hidden for rentals, payload derived from one parsed value so requiresProductionTime/productionTimeDays can never disagree; rentals force quantity 1, EXEMPT and no mode (sell_form_state.dart:266-274, 437-442, 491-543 vs app/sell/page.tsx:652-658, 966-975)
- Publish sequence parity: post-product with main image only, remaining images in batches of 5, quantity follow-up PATCH when != 1, 'Add at least one choice' empty-choices publish guard, draft cleared on success (sell_wizard_screen.dart:161-251 vs app/sell/page.tsx:814-819, 1005-1045, 1090-1107)
- Edit screen parity where implemented: single-page editor, parallel itemDetails+categories prefill, SPECIFICATIONS parsed back out of the description, promotional price must be HIGHER than asking (inverse of create), quantity 0-1000 for out-of-stock, WhatsApp read-only with the cannot-change rule, payout loaded floor-rounded to 1000s and sent as loaded when unchanged (lib/screens/edit_listing_screen.dart:83-153, 166-178, 362-424 vs app/edit-listing/[id]/page.tsx)
- Description parser port: tolerant 1-3 dash SPECIFICATIONS separator, Label: value lines, inline flattened-legacy recovery (lib/domain/description_parser.dart:13-61)
- My Listings status model is an exact port of getListingStatusKey/getListingStatusLabel (two-field precedence, legacy ARCHIVED, rental booked/active, '{sold} sold / {left} left'), with the same filter tabs incl. Needs attention, category + newest/oldest/views sorts off clickCount, delete confirm, FAB to /sell and rental-only Dates action (lib/screens/seller_listings_screen.dart:62-134, 382-407)
- Rental availability management: owner-only close/reopen date ranges with booking-overlap guard, half-open exclusive end conversion, pull-to-refresh (lib/screens/rental_availability_screen.dart, lib/domain/rentals.dart)
- Image pipeline: >=1 image required with the same message, 10MB per-file skip, 100MB cumulative cap, WebP 1440px q82 compression with raw-bytes fallback, cover badge + make cover/remove with first-image auto-cover (sell_wizard_screen.dart:271-305, 763-845 vs app/sell/page.tsx:554-558, 1812-1821)
- WhatsApp prefill from profile (whatsAppPhoneNumber || phoneNumber fallback chain) as a read-only field, never typed (sell_wizard_screen.dart:119-136, 652-665 vs app/sell/page.tsx:433-437)
- Address add-and-return flow: empty state CTA pushes /account/addresses and refreshes the picker on return (sell_wizard_screen.dart:679-716)

</details>


## Editing & managing listings + public seller profile

### 🔴 CRITICAL · missing — Mobile edit screen has no image management at all (add, remove, reorder, set cover)

**ID:** `listing-mgmt:LISTIN-01` · **Area:** Edit listing - image management

**Impact:** Sellers cannot add, remove, replace or re-cover photos of an existing listing from mobile. This also dead-ends the create flow's own recovery path: the create wizard's failure copy says 'edit the listing to retry' for failed photo batches, but the edit screen cannot upload or fix images.

- **Frontend evidence:** app/edit-listing/[id]/page.tsx:826-852 - per-image remove (imagesToRemove state, one-image floor 'Product must have at least one image') and 'Set as main' with 'Main photo updated' toast; :1123-1134 - image rebuild order logic so intended cover survives delete-and-reupload; :1145 - imageIds deletion query sent to PATCH; :1405-1416 - current-photos grid with per-image controls; :1614 - 'X/50 photos' add control
- **Mobile evidence:** lib/screens/edit_listing_screen.dart:195-231 - save body contains no image fields/ops whatsoever; :283-435 - form renders no image widgets or picker; whole repo grep shows addProductImages (lib/api/api_client.dart:1460-1475) is called only from the create wizard (lib/screens/sell/sell_wizard_screen.dart:210), never from edit; no delete-image or set-cover API exists in api_client.dart
- **Mobile-side verification:** Full read of lib/screens/edit_listing_screen.dart: save body (195-231) has zero image fields; build (262-439) renders no image widgets/picker. addProductImages (api_client.dart:1460-1475) is called only from sell_wizard_screen.dart:210 (grep repo-wide: single call site). No delete-image/set-cover endpoint exists anywhere in api_client.dart (grep 'images' shows only post-product, /products/{id}/images upload, and request-board uploads). Greps for imagesToRemove/setCover/deleteProductImage: zero hits. The legacy SellScreen (sell_screen.dart) is unrouted dead code. The 'edit the listing to retry' dead-end is real: the edit screen cannot upload images.
- **Frontend-side verification:** Frontend has full image management on edit: per-image remove with imagesToRemove + one-image floor 'Product must have at least one image' (edit-listing/[id]/page.tsx:824-839), '✅ Main photo updated' toast 8s (:841-857), 'Cover photo selected' for new covers (:1538-1541), current-photos grid with Make cover/Remove controls (:1405-1461), X/50 photos counter (:1610-1627), cover-first rebuild with delete-all + batch-5 re-upload (:1160-1245), choice-image re-resolution (:1248-1263). One evidence bullet is imprecise about mechanism: :1145 defines imageIdsToDelete, but this page removes images via DELETE /products/delete-image/{imageId} (:1215-1227) rather than the ?imageIds= PATCH query — though that query-param support does exist in updateProduct (lib/api.ts:2192-2214). Substance and critical severity (breaks the core manage-listings flow and the create-wizard retry path) stand.

### 🔴 CRITICAL · BROKEN — Mobile edit save corrupts delivery state: transportRequirement forced to REQUIRED, rentalConfiguration omitted, rental quantity not forced to 1

**ID:** `listing-mgmt:LISTIN-03` · **Area:** Edit listing - rentals & transport requirement

**Impact:** Every mobile save of a rental (or real-estate EXEMPT) listing flips its transport requirement from EXEMPT to REQUIRED with a null mode, which per the delivery-setup model (mobile lib/screens/seller_listings_screen.dart:123-134) marks the listing as needing attention/hidden from buyers until re-fixed on web; rental rate periods can also never be changed from mobile.

- **Frontend evidence:** app/edit-listing/[id]/page.tsx:1110-1112 - submit sends transportRequirement 'EXEMPT' for rentals; :1103 - productQuantity forced to 1 for rentals; :1118-1120 - rentalConfiguration always sent (disabled default for non-rentals); :2084-2086 - selector locked to EXEMPT for rentals
- **Mobile evidence:** lib/screens/edit_listing_screen.dart:52 - _transportRequirement declared but never assigned in _load (94-121), so :226 always sends 'transportRequirement': _transportRequirement ?? 'REQUIRED'; :195-231 - body omits rentalConfiguration; :383-389 - quantity editable 0..1000 and never forced to 1 for rentals
- **Mobile-side verification:** Verified exactly: _transportRequirement declared at edit_listing_screen.dart:52 and never assigned anywhere in the file (only usage is 224-226); _load (72-129) assigns _transportMode (119) but not the requirement, so line 226 always sends 'REQUIRED'. For an EXEMPT rental the loaded mode is null, so the save sends REQUIRED + null mode. Body (195-231) omits rentalConfiguration; quantity (223, validator 383-389) is never forced to 1 for rentals and there is no rental-awareness in the form at all. Mobile's own _needsAttention (seller_listings_screen.dart:123-134) confirms the hidden-from-buyers consequence model.
- **Frontend-side verification:** Verified frontend contract: submit forces transportRequirement 'EXEMPT' for rentals (:1110-1112), productQuantity 1 for rentals (:1103), rentalConfiguration always sent incl. disabled default (:1118-1120), selector locked to EXEMPT for rentals/real-estate (:2083-2088), mode nulled for rentals/EXEMPT (:1039-1042). Mobile sending 'REQUIRED' with null mode would flip listings into the web's needsLogisticsConfirmation model (page.tsx:567-577) — hidden from buyers. Critical (money-affecting corruption of delivery state) justified.

### 🟠 Major · missing — Product choice editor absent from edit; choiceConfiguration dropped on every mobile save

**ID:** `listing-mgmt:LISTIN-02` · **Area:** Edit listing - product choices

**Impact:** Sellers cannot change buyer options, fixed product details, per-choice prices, or archived-attribute removal on a live listing; any mobile edit save leaves choices untouched by omission and priced-choice sellers must go to web to adjust options.

- **Frontend evidence:** app/edit-listing/[id]/page.tsx:1798-1806 - ProductChoiceEditor rendered on edit with current images passed for choice-image matching; :1067-1077 - preparedChoiceConfiguration built and sent; :1117 - updateData always includes choiceConfiguration
- **Mobile evidence:** lib/screens/edit_listing_screen.dart:195-231 - edit body omits choiceConfiguration entirely; :283-435 - no choice editor UI; the editor exists only in the create wizard (lib/screens/sell/product_choice_editor.dart:14)
- **Mobile-side verification:** Edit save body (edit_listing_screen.dart:195-231) omits choiceConfiguration; the form has no choice UI. ProductChoiceEditor is referenced only by sell_wizard_screen.dart:876 (grep 'ProductChoiceEditor|product_choice_editor' hits only the editor file and the wizard import/use). Edit always PATCHes /products/update/{id} via updateListing (api_client.dart:1520-1530) with no choices payload.
- **Frontend-side verification:** Verified: ProductChoiceEditor rendered on edit with images passed for choice-image matching (edit-listing/[id]/page.tsx:1798-1826), preparedChoiceConfiguration built (:1067-1077), updateData always carries choiceConfiguration (:1117), plus the second updateProduct pass to re-resolve visual choice images (:1248-1263). Major is right: a user-visible feature absent from mobile while web edits round-trip it.

### 🟠 Major · BROKEN — SPECIFICATIONS block stripped on load and never re-appended - mobile edit permanently deletes spec data

**ID:** `listing-mgmt:LISTIN-04` · **Area:** Edit listing - description specifications

**Impact:** Saving any listing from mobile destroys the structured '--- SPECIFICATIONS ---' section (category spec fields, item age), which the web product detail renders as a spec table - a one-way data-loss divergence on every mobile edit.

- **Frontend evidence:** app/edit-listing/[id]/page.tsx:1024-1033 - description rebuilt with formatDescriptionWithCategoryFields + appendItemAgeToDescription before save; :1087 - enhancedDescription sent as productDescription
- **Mobile evidence:** lib/screens/edit_listing_screen.dart:91,97 - parseProductDescription strips the specs block out for display; :194,204 - save submits _description.text.trim() (prose only) with no re-serialization of specs; lib/domain/description_parser.dart:18-61 parses but nothing re-emits the block on edit
- **Mobile-side verification:** edit_listing_screen.dart:91 parses specs out via parseProductDescription (shown at 97), save submits _description.text.trim() (194, 204) with no re-serialization. description_parser.dart contains only the parser - no formatter/re-emit function (grep formatDescription|appendItemAge|SPECIFICATIONS: appendItemAgeToDescription exists in listing_submit_utils.dart:31-37 but its only caller is sell_form_state.dart:490, i.e. create flow only). Every mobile edit save strips the structured block - one-way data loss as claimed.
- **Frontend-side verification:** Verified: description rebuilt with formatDescriptionWithCategoryFields + appendItemAgeToDescription before save (:1024-1037) and enhancedDescription sent as productDescription (:1087); Item Age is parsed back out of specs on load (:465-485), proving the block is structured data web round-trips. Permanent loss of the specs block on every mobile edit = major (one-way data loss of user-visible content, not money/flow).

### 🟠 Major · partial — Edit form missing production time, item age, condition, saved-address select, map-pin editing and placeName

**ID:** `listing-mgmt:LISTIN-05` · **Area:** Edit listing - detail fields & pickup

**Impact:** Sellers cannot set or fix production time (blocking the production-in-progress order feature), item age, condition, or the pickup pin/place from mobile; a listing loaded without a pin can never be repaired from the app, and placeName is dropped on save.

- **Frontend evidence:** app/edit-listing/[id]/page.tsx:1782-1789 - ProductionTimeSelector switch+days on edit; :1104-1108 - requiresProductionTime/productionTimeDays submitted; :1115 - placeName submitted (with address fallbacks); §2.8 saved pickup-address select resolves pin (lib/edit-listing-validation.ts:44-47 address+pin errors)
- **Mobile evidence:** lib/screens/edit_listing_screen.dart:283-435 - only title/category/subcategory/description/price/payout/promo/quantity/street/whatsapp fields; :394-400 - free-text street instead of saved-address select; :403-410 - pin shown as status text only (no picker, _latitude/_longitude fixed from load at :117-118); :49-50 - _placeName/_neighbourhood never populated so :229-230 omit placeName/neighbourhood from the save body
- **Mobile-side verification:** Full read of the edit form (262-439): fields are exactly title/category/subcategory/description/price/payout/promo/quantity/street/whatsapp - no production time, item age, condition, saved-address select, or map picker. _latitude/_longitude fixed from load (117-118); pin rendered as status text only (403-410); _save hard-blocks without a pin (162-165) so an unpinned listing cannot even be saved from mobile. _placeName/_neighbourhood declared (48-49) and never populated, so 229-230 always omit them. Free-text street field at 394-400.
- **Frontend-side verification:** Verified all cited frontend pieces: ProductionTimeSelector on edit (:1782-1794), requiresProductionTime/productionTimeDays submitted with rental skip (:1104-1108), placeName submitted with fallbacks (:1115), saved pickup-address select (:1834-1842), MapPinPicker (:1850-1855), address+pin validation errors (lib/edit-listing-validation.ts:43-49), Item Age field (:1900-1904), condition via choice label/product field (:1029-1031). Major is right — pin-less listings are unrepairable from mobile and production time gates the order flow.

### 🟠 Major · missing — 'Mark out of stock' action, stock dialog and PATCH /products/{id}/inventory never used

**ID:** `listing-mgmt:LISTIN-10` · **Area:** My Listings - stock & out-of-stock

**Impact:** Sellers cannot quickly mark a listing out of stock or set an exact available quantity from the list; the OUT_OF_STOCK availability state (which hides listings from in-stock buyer results) is unreachable from mobile.

- **Frontend evidence:** components/ui/product-card.tsx:1007 - 'Mark out of stock' menu item; app/expat/dashboard/page.tsx:1590 - saveInventory calls apiClient.updateProductInventory; :4424-4440 - 'Mark as available' dialog with quantity input min 0.01; :1631 - 'Quantity must be greater than zero'
- **Mobile evidence:** lib/screens/seller_listings_screen.dart:502-508 - status menu offers only AVAILABLE and ARCHIVED; repo-wide grep finds no updateProductInventory/inventory endpoint (api_client.dart has only create-time updateListingQuantity at :1479-1490)
- **Mobile-side verification:** Status menu is hard-coded to exactly AVAILABLE and ARCHIVED (seller_listings_screen.dart:505-508); updateProductStatus documents only those two values (api_client.dart:1492-1504). Repo grep for inventory/updateProductInventory finds only Icons.inventory_2_outlined decorations - no endpoint, matching web's lib/api.ts:2307 updateProductInventory which mobile lacks. Mobile's only quantity write is the create-time updateListingQuantity (api_client.dart:1479-1490); exact quantity can only be changed via the full edit screen, never from the list, and OUT_OF_STOCK availability is unreachable.
- **Frontend-side verification:** Verified: 'Mark out of stock' menu item (product-card.tsx:992-1008), saveInventory → apiClient.updateProductInventory with 'Listing available'/'Listing out of stock' toasts (dashboard page.tsx:1586-1611; endpoint lib/api.ts:2307), 'Mark as available' dialog with quantity input min 0.01 (:4409-4479) and 'Quantity must be greater than zero' (:1630-1633). Major is right: availability management that hides listings from in-stock buyer results.

### 🟠 Major · partial — Delivery-attention banner, per-card 'Needs attention' overlay and repair CTA missing (filter chip only)

**ID:** `listing-mgmt:LISTIN-12` · **Area:** My Listings - delivery attention

**Impact:** Sellers can filter hidden listings but get no banner explaining listings are hidden from buyers, no per-card flag, and no one-tap 'fix now' path - the discovery/instruction layer around the flag is gone.

- **Frontend evidence:** app/expat/dashboard/page.tsx:2868 - amber banner 'N need attention' with explainer copy and Show affected/Show all toggle (§1.18); :3264-3319 - per-card 'Needs attention'/'Hidden from buyers' overlay with repair labels deep-linking into edit (§2.23)
- **Mobile evidence:** lib/screens/seller_listings_screen.dart:95,271-275 - only a 'Needs attention' ChoiceChip filter exists; :429-528 - the card itself shows no attention badge, explanation, or repair action
- **Mobile-side verification:** Full read of seller_listings_screen.dart: the only 'attention' UI is the 'Needs attention' ChoiceChip (95, filter at 273) backed by _needsAttention (123-134). The card build (429-528) has no badge, no explanation, no repair CTA, no banner anywhere in the screen; Edit (489) is the only repair path and it is not labeled as one.
- **Frontend-side verification:** Verified: amber banner 'Delivery information needs attention' with pluralized body and Show affected/Show all listings toggle (dashboard :3187-3219; the 'N need attention' chip is the adjacent element at :2857-2871 — the evidence's :2868 pointer is the chip, banner copy+toggle live at 3187-3219), per-card 'Needs attention'/'Hidden from buyers' overlay (:3264-3272), repair CTA '{label} - update now' deep-linking to /edit-listing (:3319-3330) with the three repair labels (:579-591). Major is right: discovery/instruction layer for buyer-hidden listings.

### 🟠 Major · missing — Selling tab has no Orders/Payments/Transporters sub-tabs (seller payments received + invoice upload and transporter registry screens absent)

**ID:** `listing-mgmt:LISTIN-17` · **Area:** Dashboard - Selling sub-tabs

**Impact:** Sellers cannot view received payments or upload invoice/EFD documents, and cannot manage their transporter registry, from mobile.

- **Frontend evidence:** app/expat/dashboard/page.tsx:2807-2810 - Selling sub-nav gains 'Payments' and 'Transporters' under LOGISTICS_V2_ENABLED; §9.26 GET /payments/received + POST /payments/received/{orderId}/seller-document
- **Mobile evidence:** lib/screens/delivery_dashboard_screens.dart:497 - Selling tab renders SellerListingsScreen only; repo grep finds no 'payments/received' or 'seller-document' endpoints; transporter registry (lib/api/api_client.dart:965-988) is reachable only inside the order assignment modal (lib/widgets/assign_transporter_modal.dart:9-12), not as a management screen
- **Mobile-side verification:** Selling tab renders SellerListingsScreen and nothing else (delivery_dashboard_screens.dart:497); the TabBar is fixed Overview/Selling/Buying/Saved/Requests (478-484) with no Payments/Transporters sub-tabs. Greps for payments/received and seller-document: zero hits in lib/. my_payments_screen.dart is the buyer panel (GET /payments/my), not seller received payments. Transporter registry (api_client.dart:965-988) is reachable only via AssignTransporterModal used from orders_screen.dart:995 - no management screen.
- **Frontend-side verification:** Verified: Selling sub-nav gains Payments and Transporters under LOGISTICS_V2_ENABLED (dashboard :2801-2813), rendering PaymentsReceivedPanel (:2840-2850) and SellerTransportersPanel (:2851-2853); endpoints GET /api/v1/payments/received and POST /payments/received/{orderId}/seller-document exist (lib/api.ts:3494, :3496-3506). Major is right: entire seller-payments/transporter-management surfaces absent on mobile.

### 🟠 Major · partial — Overview reduced to 4 stat tiles: no date ranges, Seller/Buyer view, charts, top listings, or recommendations

**ID:** `listing-mgmt:LISTIN-18` · **Area:** Dashboard - Overview analytics

**Impact:** Sellers lose all visual analytics and actionable recommendations (visibility/inventory nudges) on mobile; the overview is informational-only.

- **Frontend evidence:** app/expat/dashboard/page.tsx:1651-1656 - inactiveListings recommendation; §1.27 - 7d/30d/90d/all selector, KPI cards, Top Performing Listings, Views bar chart, status/category pies, cart preview, recommendations; :3504,:3566 - active/revenue cards
- **Mobile evidence:** lib/screens/delivery_dashboard_screens.dart:527-643 - Overview is a 'Sell an item' button, 4 _stat tiles (listings/active/views/orders), one revenue line, and two navigation ListTiles; no charts, ranges, toggles, or recommendation cards
- **Mobile-side verification:** _OverviewTab (delivery_dashboard_screens.dart:511-643) is exactly: heading, 'Sell an item' button, 4 _stat tiles, one revenue line, two ListTiles (Selling orders / Delivery tracking). No date-range selector, no charts, no top listings, no cart preview, no recommendation cards anywhere in the file.
- **Frontend-side verification:** Verified: 7d/30d/90d range selector (:843, :3446-3448), Top Performing Listings (:3588), Views by Listing (:3659), Listing Status (:3713-3718), Category Breakdown (:3783), visibility recommendation copy (:3863-3864), inactiveListings basis for the inventory recommendation (:1651-1656), KPI cards incl. active/revenue (:3495-3506, :3558-3570). Major is right: whole analytics layer absent.

### 🟠 Major · missing — Profile missing verified badge, N Listings badge, location row, Member Since, Success Rating and profile photo

**ID:** `listing-mgmt:LISTIN-22` · **Area:** Seller profile - header fields

**Impact:** The mobile storefront header lacks every trust and identity signal web buyers see (verification, scale, location, tenure), weakening the profile as a selling surface.

- **Frontend evidence:** app/seller/[id]/page.tsx:575-585 - emerald verified avatar badge title 'Verified Seller'; :611-622 - 'Verified' + '{n} Listings' badges; :625-638 - location row with CountryFlag + formatLocation; :645-657 - Member Since year (fallback 2024); :659-670 - Success Rating row; :566-570 - profile image avatar
- **Mobile evidence:** lib/screens/seller_profile_screen.dart:56-90 - only initial-letter CircleAvatar (no profileImageUrl), full name, position, and a rating row; no verification state, listings count, location, member-since, or success rating; data comes from the reduced GET /userManagement/seller-summary/{id} (lib/api/api_client.dart:1810-1812) instead of the web's seller-profile chain (frontend lib/api.ts:2579-2581)
- **Mobile-side verification:** Full read of seller_profile_screen.dart:56-90: initial-letter CircleAvatar (name.substring(0,1), '?' fallback), full name, optional position, rating row - and nothing else. No verified badge, listings count, location, member-since, or success rating anywhere in the file. Data source is fetchSellerSummary -> GET /userManagement/seller-summary/{id} (api_client.dart:1810-1814); profileImageUrl is parsed only on ProductDetail (models/product_detail.dart:36,141), never on this screen, and even the detail seller card uses a person icon, not a photo.
- **Frontend-side verification:** Verified all header elements: profile image avatar (:565-573), emerald verified badge title 'Verified Seller' (:575-585), Verified + '{n} Listings' badges (:610-623), location row with CountryFlag + formatLocation (:625-638), Member Since with 2024 fallback (:645-657), Success Rating row (:659-670); web fetches the full 6-endpoint getSellerProfile chain (lib/api.ts:2563-2587). Major is right: the storefront's trust/identity block is a user-visible selling surface.

### 🟠 Major · divergent — Full legal names exposed: profile shows full name and reviews show raw authorName (web masks to first name + last initial)

**ID:** `listing-mgmt:LISTIN-23` · **Area:** Seller profile - privacy masking

**Impact:** Privacy regression: mobile publishes full personal names that the web deliberately masks, on the profile header and every review; review dates are also dropped.

- **Frontend evidence:** app/seller/[id]/page.tsx:526 - sellerDisplayName = getPublicSellerName (lib/seller-display.ts:2-18 first name + uppercased last initial); :753-756 - review author rendered as firstName + lastName initial + '.'; :770 - formatReviewDate row
- **Mobile evidence:** lib/screens/seller_profile_screen.dart:48-50,:68 - header joins and renders firstName + lastName in full; :202-204 - review card prints r['authorName'] verbatim (fallback 'Anonymous'); no review date row (:191-224)
- **Mobile-side verification:** Header joins firstName+lastName in full (seller_profile_screen.dart:48-50) and renders it (68). Review cards print r['authorName'] verbatim with only an 'Anonymous' empty fallback (202-204); no masking helper exists in mobile (grep getPublicSellerName/seller-display: zero) and no review-date row (191-224). Frontend spot-check confirms web masks via getPublicName (lib/seller-display.ts:2-18: first name + uppercased last initial).
- **Frontend-side verification:** Verified masking: sellerDisplayName = getPublicSellerName (page :526; lib/seller-display.ts:2-16 = first name + uppercased last initial) and review authors rendered as firstName + last-initial '.' (:753-756) with formatReviewDate date row (:769-771). Mobile rendering full legal names is a real privacy regression vs the web's deliberate masking; major (user-visible privacy/trust divergence, not flow-breaking) is right.

### 🟠 Major · missing — No showcase search, category/subcategory filter, or sort controls

**ID:** `listing-mgmt:LISTIN-24` · **Area:** Seller profile - showcase controls

**Impact:** Buyers cannot find anything within a seller's catalog beyond eyeballing 24 cards; the entire showcase filtering/sorting UX is absent.

- **Frontend evidence:** app/seller/[id]/page.tsx:804-810 - SellerShowcaseControls mounted when listings exist; components/seller/seller-showcase-controls.tsx:72-73 - search 'Search this seller's products'; :90-118 - All categories/subcategory selects; :129-140 - six MARKETPLACE_SORT_OPTIONS; :215 - 'Clear search and filters'
- **Mobile evidence:** lib/screens/seller_profile_screen.dart:100-176 - 'Listings' section renders an unfilterable, unsortable, unsearchable 2-column grid
- **Mobile-side verification:** The Listings section (seller_profile_screen.dart:100-176) is a bare shrinkWrap GridView with zero controls - no search field, no category/subcategory select, no sort, no clear button anywhere in the file. fetchFiltered is called once with no searchTerm/sort args (27-28).
- **Frontend-side verification:** Verified: SellerShowcaseControls mounted when listings exist (page :804-819); search placeholder "Search this seller's products" with Escape-close on mobile (:58-77, :151-189), All categories + subcategory selects (:79-123), sort over MARKETPLACE_SORT_OPTIONS (:125-147), 'Clear search and filters' shown when filters active (:206-218). Major is right: core storefront discovery UX.

### 🟠 Major · partial — Storefront listings capped at one 24-item page; no load-more (web paginates 12/page infinitely); reviews capped at 5

**ID:** `listing-mgmt:LISTIN-25` · **Area:** Seller profile - pagination

**Impact:** Sellers with more than 24 listings have products permanently invisible on their mobile storefront, and reviews are truncated at 5 with no way to see more.

- **Frontend evidence:** app/seller/[id]/page.tsx:73 - ITEMS_PER_PAGE = 12; :470-487 - IntersectionObserver sentinel load-more; :887-896 - 'Loading more products...' with visibleListings slice; reviews section renders fetched rows with count in header (§1.41-1.42)
- **Mobile evidence:** lib/screens/seller_profile_screen.dart:27-28 - single fetchFiltered(sellerId:, size: 24) with no load-more (totalElements fetched but unused); :191 - reviews rendered via rows.take(5) from a size-10 fetch (:29-31)
- **Mobile-side verification:** Single one-shot fetchFiltered(sellerId:, size: 24) (27-28) - the returned totalElements is carried in the record but never used (only .products read at 109); no load-more, no scroll sentinel. Reviews: fetchUserRatings default size 10 (api_client.dart:1820) rendered via rows.take(5) (191) with section hidden when empty. No pagination in the screen at all.
- **Frontend-side verification:** Verified: ITEMS_PER_PAGE = 12 (:73), IntersectionObserver load-more (threshold 0.1, rootMargin 100px, :469-487) with 'Loading more products...' sentinel (:887-898), and reviews rendered in full from getUserRatings(userId, 0, 20) (:306, :734-775) with count badge (:721-725) — web shows up to 20 reviews, not 5. Major is right: products permanently invisible beyond 24 on mobile is a lost-sales bug.

### 🟠 Major · missing — No share-profile modal (copy link / WhatsApp share) anywhere; product share is a stub

**ID:** `listing-mgmt:LISTIN-26` · **Area:** Seller profile - share

**Impact:** Mobile loses the entire word-of-mouth loop for seller storefronts (copyable link + WhatsApp invite), a primary growth action for this marketplace.

- **Frontend evidence:** app/seller/[id]/page.tsx:554-557 - ShareSellerProfileModal with profilePath from buildSellerProfilePath; components/seller/share-seller-profile-modal.tsx:38 - 'Welcome! Check out {name}'s products on GloboExpats.'; :58 - wa.me share URL; :105-107 - Copy/Copied button
- **Mobile evidence:** lib/screens/seller_profile_screen.dart - no share action on the AppBar (line 36: title only) or body; the only share in the app is a stub SnackBar on product detail (lib/screens/product_detail_screen.dart:357-361 'Share this product with a friend.'); pubspec.yaml has url_launcher (^6.3.0) but no share_plus
- **Mobile-side verification:** Seller profile AppBar is title-only (seller_profile_screen.dart:36) and the body has no share action (full read). The only share in the app is the stub SnackBar 'Share this product with a friend.' (product_detail_screen.dart:357-361). pubspec.yaml has url_launcher ^6.3.0 and no share_plus; the wa.me launches that exist (product detail 707-715, home 71-75, admin 266) are contact deep-links, not share-profile modals.
- **Frontend-side verification:** Verified: ShareSellerProfileModal mounted on the profile (page :553-558) with profilePath from buildSellerProfilePath (:529; lib/seller-profile-route.ts:14-26); modal has message 'Welcome! Check out {name}'s products on GloboExpats.' (:38), wa.me URL target=_blank (:58, :111-119), Copy/Copied toggle with 2000ms reset (:40-56, :105-107) and copy toasts (§2.41). Major is right: the growth/share loop is a user-visible feature.

### 🟠 Major · missing — Seller working-hours card (view + edit) entirely absent

**ID:** `listing-mgmt:LISTIN-27` · **Area:** Seller profile - working hours

**Impact:** Buyers cannot see when a seller works/delivers and sellers cannot set hours from mobile, losing the working-hours promise shown on every web profile.

- **Frontend evidence:** app/seller/[id]/page.tsx:678-681 - SellerScheduleCard mounted on the profile; components/account/seller-schedule-card.tsx:74 - 'Edit hours'/'Set hours', :80 - 'Retry loading hours', :87-88 - not-configured/loading copy, :62 - reload on 'seller-working-schedule-saved'; lib/api.ts:2790-2805 - working-schedule GET/PUT/timezones endpoints
- **Mobile evidence:** lib/screens/seller_profile_screen.dart - no schedule block; repo-wide grep for 'working-schedule'/'workingSchedule' returns zero hits in lib/
- **Mobile-side verification:** Repo-wide grep working-schedule/workingSchedule across lib/: zero hits. seller_profile_screen.dart has no schedule block (full read); api_client.dart has no schedule GET/PUT/timezones methods (frontend lib/api.ts:2790-2805 has them).
- **Frontend-side verification:** Verified: SellerScheduleCard mounted on the profile (page :678-681); card has 'Edit hours'/'Set hours' (:72-76), 'Retry loading hours' (:78-81), not-configured/loading copy (:84-90), reload on 'seller-working-schedule-saved' (:60-64), ScheduleOverview weekday rows with (+1 day)/Closed/Exceptional closures (:19-45); endpoints GET/PUT working-schedule + timezones (lib/api.ts:2790-2805). Major is right: a user-visible profile feature with editing, wholly absent on mobile.

### 🟡 Minor · partial — No live commission breakdown panel on the edit screen

**ID:** `listing-mgmt:LISTIN-06` · **Area:** Edit listing - commission panel

**Impact:** Mobile editors see no 'You receive / commission / Final Total Asking Price' breakdown while editing, so they cannot preview the fee impact of a payout change before saving.

- **Frontend evidence:** app/edit-listing/[id]/page.tsx:1970 - CommissionCalculator rendered in the Pricing section (read-only 'Default choice price' mode for priced choices per components/sell/commission-calculator.tsx)
- **Mobile evidence:** lib/screens/edit_listing_screen.dart:188-192 - breakdown computed silently for the payload with no UI; the money-row UI exists only in the create wizard (lib/screens/sell/sell_wizard_screen.dart:1129-1131)
- **Mobile-side verification:** Breakdown computed silently for the payload at edit_listing_screen.dart:188-192 with no widget. The money-row UI exists only in the wizard (sell_wizard_screen.dart:1127-1131 _moneyRow commission/VAT/Selcom/final total). Edit shows only the 'You receive'/'Final buyer price' inputs (349-360).
- **Frontend-side verification:** Verified: CommissionCalculator rendered in the edit Pricing section (:1970-1988) with readOnly={hasPricedChoices(...)} (:1979) and the readOnly 'Default choice price' panel in components/sell/commission-calculator.tsx (:20,:51,:86-106). Minor is right: it is an informational preview; the payout/price inputs themselves exist on mobile and the money-row UI exists in the create wizard.

### 🟡 Minor · missing — No section anchor nav and no unsaved-changes indicator on edit

**ID:** `listing-mgmt:LISTIN-07` · **Area:** Edit listing - navigation & unsaved state

**Impact:** Cosmetic/UX: no jump navigation and no dirty-state warning; a seller can back out of the mobile editor losing edits with no warning.

- **Frontend evidence:** app/edit-listing/[id]/page.tsx:1358-1378 - sticky anchor nav Photos/Details/Pricing/Delivery; :2137 - sticky footer shows 'Unsaved changes' / 'No changes yet'
- **Mobile evidence:** lib/screens/edit_listing_screen.dart:268-435 - single scrolling form with a plain 'Save changes' button and no change-tracking; :15 doc comment claims anchor chips but the build() renders none
- **Mobile-side verification:** Full read: single scrolling ListView form, plain 'Save changes' FilledButton (426-434), no anchor chips (the doc comment at line 15 claims them but build() renders none), no change-tracking, no WillPopScope/PopScope, no dirty-state indicator anywhere in the file.
- **Frontend-side verification:** Verified: sticky anchor nav Photos/Details/Pricing/Delivery (:1358-1378; sticky on mobile, sm:static on desktop) and sticky footer showing 'Unsaved changes' / 'No changes yet' (:2128-2137) driven by hasUnsavedChanges snapshot. Minor (cosmetic/UX) is right.

### 🟡 Minor · missing — Admin edit variant (?admin=true → updateAdminProduct) not implemented

**ID:** `listing-mgmt:LISTIN-08` · **Area:** Edit listing - admin mode

**Impact:** Support/admin corrections of any listing must be done on web; mobile admins silently use the normal seller endpoint.

- **Frontend evidence:** app/edit-listing/[id]/page.tsx:163-165 - isAdminEdit swaps save to apiClient.updateAdminProduct (PATCH /api/v1/admin/products/{id}, lib/api.ts §9.3)
- **Mobile evidence:** lib/api/api_client.dart - no admin product-update method (admin endpoints limited to list/status at :880); lib/screens/edit_listing_screen.dart:1520 (via updateListing at lib/api/api_client.dart:1520-1523) always PATCHes /products/update/{id}
- **Mobile-side verification:** Repo-wide grep updateAdminProduct/admin/products: api_client.dart has only GET /admin/products (651-653), GET /admin/products/expiring-soon (833-837) and PATCH /admin/products/{id}/status (874-880) - no admin product-update method. Edit always calls updateListing -> PATCH /products/update/{id} (edit_listing_screen.dart:232, api_client.dart:1520-1523).
- **Frontend-side verification:** Verified: ?admin=true AND isAdminUser swaps save to apiClient.updateAdminProduct (edit-listing/[id]/page.tsx:163-166, used at :1156/:1203/:1238/:1261) which PATCHes /api/v1/admin/products/{id} with ?imageIds= (lib/api.ts:2224-2244). Minor is right: admin/support-only path.

### 🟡 Minor · divergent — No seller-verification gate on the edit route

**ID:** `listing-mgmt:LISTIN-09` · **Area:** Edit listing - route guard

**Impact:** Unverified sellers can open and submit the mobile editor; enforcement is left entirely to the backend instead of the route guard.

- **Frontend evidence:** app/edit-listing/[id]/page.tsx:150 - RouteGuard requireAuth requireVerification="sell" blocks unverified sellers before render
- **Mobile evidence:** lib/screens/edit_listing_screen.dart:73-80 - only checks for a token; unverified sellers reach the full editor with no verification check
- **Mobile-side verification:** Route /edit-listing/:id is a plain builder in app_router.dart:311-316 with no guard wrapper (grep requireVerification: zero hits in the repo). The screen checks only for a token (edit_listing_screen.dart:73-80). /sell is likewise ungated (router:306-309). The verification hub exists at /account/verification (router:254-257) but is not wired into either route.
- **Frontend-side verification:** Verified: RouteGuard requireAuth requireVerification="sell" wraps the editor before render (edit-listing/[id]/page.tsx:148-153). Minor is right: enforcement likely remains server-side.

### 🟡 Minor · divergent — Status/Edit actions offered unconditionally instead of per-status guards

**ID:** `listing-mgmt:LISTIN-11` · **Area:** My Listings - status menu guards

**Impact:** Mobile offers transitions web forbids (e.g. archiving a pending/rejected listing, editing a sold one); these either fail at the backend or bypass the web's state model.

- **Frontend evidence:** components/ui/product-card.tsx:984-990 - 'Mark as available' only when out-of-stock non-rental; :991-1029 - 'Mark out of stock'/'Archive' hidden for ARCHIVED/PENDING/UNAPPROVED/SOLD; Edit hidden for SOLD (§4.19)
- **Mobile evidence:** lib/screens/seller_listings_screen.dart:505-508 - both 'Mark available' and 'Archive' always rendered regardless of status; :487-492 - Edit always shown (including SOLD)
- **Mobile-side verification:** Mobile: both 'Mark available' and 'Archive' are const, unconditional PopupMenuItems (seller_listings_screen.dart:505-508) and Edit is always rendered (487-492). Frontend spot-check confirms the guards exist on web: product-card.tsx shows 'Mark as available' gated on out-of-stock and 'Mark out of stock'/'Archive' hidden for ARCHIVED/PENDING/UNAPPROVED/SOLD (984-1029). Mobile offers transitions web forbids with no per-status logic anywhere in the file.
- **Frontend-side verification:** Verified guards in product-card.tsx: 'Mark as available' only when out-of-stock non-rental (:980-990), 'Mark out of stock' and 'Archive' hidden for ARCHIVED/PENDING/UNAPPROVED/SOLD (:992-1028), Edit overlay hidden for SOLD (:945). Minor is right: guard/safety divergence.

### 🟡 Minor · partial — Rejected-listings review-and-resubmit banner missing

**ID:** `listing-mgmt:LISTIN-13` · **Area:** My Listings - rejected banner

**Impact:** Sellers of unapproved listings get no explanation that their items were removed from Marketplace/Home or that re-saving resubmits them for review.

- **Frontend evidence:** app/expat/dashboard/page.tsx:3231 - red banner 'These listings have been flagged and removed from the Marketplace... save to resubmit for review.'
- **Mobile evidence:** lib/screens/seller_listings_screen.dart:100 - 'Rejected' filter chip exists but no banner or resubmission guidance anywhere in the screen
- **Mobile-side verification:** 'Rejected' exists only as a filter chip label ('unapproved': 'Rejected', seller_listings_screen.dart:100). No banner, no resubmission guidance - grep 'flagged|resubmit|removed from' in the screen: nothing. The unapproved state is computed (71) but only surfaces as a colored chip.
- **Frontend-side verification:** Verified the red banner with the exact 'flagged and removed from the Marketplace and Home page... save to resubmit for review.' copy (dashboard :3221-3239). Nuance: it renders when the Rejected status filter is active (selectedStatus === 'unapproved', :3222), not automatically for any unapproved listing — but since mobile has a Rejected chip with no banner/guidance in that view, the gap and its minor severity hold.

### 🟡 Minor · partial — Filter bar reduced: no text search, no subcategory filter, no per-category counts, no Reset/Clear All

**ID:** `listing-mgmt:LISTIN-14` · **Area:** My Listings - filters

**Impact:** Sellers with many listings cannot search their listings by name/description or drill by subcategory from mobile.

- **Frontend evidence:** app/expat/dashboard/page.tsx §2.25/§7.16 - search across name+description, category select with counts, subcategory select of present subcategories, status select, sort, Reset/Clear All (filter bar block around :3024-3142)
- **Mobile evidence:** lib/screens/seller_listings_screen.dart:93-103 - status ChoiceChips only; :307-324 - category dropdown (no counts, hidden when a single category); :325-338 - sort dropdown; no search field, subcategory filter, or reset control
- **Mobile-side verification:** Full read: status ChoiceChips (281-298), count text + category dropdown (299-324, only when >1 category, no per-category counts) + sort dropdown (325-338). No TextField/search anywhere in the file, no subcategory filter, no reset/clear control. fetchFiltered's searchTerm capability is never used here.
- **Frontend-side verification:** Verified filter bar: search input (:3054-3064), category select with per-category counts (:3066-3090), subcategory select only over present subcategories (:3092-3117), status select incl. 'Needs attention (N)' (:3119-3144), sort options Most/Least Views (:2955-2956, :3158-3159), Reset (:3029-3049) and Clear All (:3181). Minor is right: capability-reduction in filtering UX.

### 🟡 Minor · divergent — Listings render all-at-once with no 20/page incremental pagination or 'Showing 1 to X of Y' footer

**ID:** `listing-mgmt:LISTIN-15` · **Area:** My Listings - pagination

**Impact:** Performance/UX difference on large catalogs rather than a capability loss (no paging cap), but the paged loading contract differs.

- **Frontend evidence:** app/expat/dashboard/page.tsx:3348 - footer 'Showing 1 to {X} of {Y} listings'; §7.15 20/page cumulative infinite scroll (IntersectionObserver)
- **Mobile evidence:** lib/screens/seller_listings_screen.dart:43-51 - single user-details.products fetch, whole list rendered at once; :303 - simple 'N listings' count text
- **Mobile-side verification:** Single _load fetch of user-details.products[] (43-51) rendered wholesale in one ListView.separated (348-354); no pagination state, no IntersectionObserver-equivalent, no footer beyond 'N listing(s)' (303). Divergence (not capability loss) as categorized.
- **Frontend-side verification:** Verified: itemsPerPage = 20 (:716), IntersectionObserver sentinel (:968-971, ref :3336-3344) and footer 'Showing 1 to {X} of {Y} listings' (:3346-3351). Minor/divergent is right: performance/UX contract difference, no capability loss.

### 🟡 Minor · missing — Card lacks 'View Details' action, 'You receive' payout chip and Halal badge; no tap-through to a detail view

**ID:** `listing-mgmt:LISTIN-16` · **Area:** My Listings - card content

**Impact:** No quick view of the listing from the management list, sellers don't see their net payout per card, and halal-certified products lose their badge on mobile.

- **Frontend evidence:** components/ui/product-card.tsx:978 - 'View Details' menu item; :1102-1105 - emerald 'You receive' chip (managementSellerReceives); :668 - Halal badge via hasHalalChoice
- **Mobile evidence:** lib/screens/seller_listings_screen.dart:436-528 - card has no InkWell/onTap and only Edit/Dates/Status/Delete actions; no payout chip; repo-wide grep finds no 'halal' anywhere in lib/
- **Mobile-side verification:** Card build (429-528): no InkWell/onTap, action row is exactly Edit/Dates(rentals)/Status/Delete (487-523); meta line is price/stock/views only (478-481) with no 'You receive' payout. Repo grep 'halal' (case-insensitive, lib + pubspec): zero hits. No 'View Details' anywhere.
- **Frontend-side verification:** Verified in product-card.tsx: 'View Details' menu item (:970-979), emerald 'You receive' chip fed by managementSellerReceives (dashboard :3285-3289; chip :1094-1109), Halal badge via hasHalalChoice (:58-59, :668, :891-893). Minor is right: convenience/trust polish on the management card.

### 🟡 Minor · BROKEN — Overview stat formulas diverge from web: active-listings and revenue computed on different fields

**ID:** `listing-mgmt:LISTIN-19` · **Area:** Dashboard - Overview metrics

**Impact:** Mobile shows inflated 'active' counts and under-reports revenue versus the web dashboard for the same account.

- **Frontend evidence:** app/expat/dashboard/page.tsx:1207-1209 - activeListings counts getListingStatusKey in ['active','booked']; :1224-1229 - orderRevenue sums totalAmount for order.status in DELIVERED/COMPLETED/PICKED_UP/PAID
- **Mobile evidence:** lib/screens/delivery_dashboard_screens.dart:569-572 - 'active' counts every product whose productStatus != 'ARCHIVED' (includes pending/rejected/sold/out-of-stock); :577-580 - revenue sums only orders with paymentStatus == 'PAID', missing delivered/picked-up orders
- **Mobile-side verification:** Mobile: 'active' = products where productStatus != 'ARCHIVED' (delivery_dashboard_screens.dart:569-572 - includes pending/rejected/sold/out-of-stock/null); revenue = sum of totalAmount where paymentStatus == 'PAID' only (577-580). Frontend spot-check confirms the divergence direction: web counts getListingStatusKey in ['active','booked'] (page.tsx:1207-1209) and sums totalAmount for order.status in DELIVERED/COMPLETED/PICKED_UP/PAID (:1222-1229). Mobile inflates active and under-reports revenue.
- **Frontend-side verification:** Verified web formulas: activeListings counts getListingStatusKey in ['active','booked'] (:1207-1209) where pending/rejected/sold/out_of_stock map to their own keys (:525-548), and orderRevenue sums totalAmount (fallback price) over DELIVERED/COMPLETED/PICKED_UP/PAID selling orders (:1219-1230). Minor is right: informational stat divergence, no money movement.

### 🟡 Minor · missing — No pending-action count badges on dashboard tabs (getPendingActionsCount unused)

**ID:** `listing-mgmt:LISTIN-20` · **Area:** Dashboard - pending actions

**Impact:** Sellers lose the at-a-glance actionable-count signal on the dashboard shell.

- **Frontend evidence:** app/expat/dashboard/page.tsx:1029,:1147 - apiClient.getPendingActionsCount fetched and rendered as badges on Selling/Orders tabs (§1.12)
- **Mobile evidence:** lib/screens/delivery_dashboard_screens.dart:478-484 - TabBar labels have no badge support; repo grep finds no 'pending-actions-count' endpoint call (lib/domain/pending_actions.dart derives items from orders instead)
- **Mobile-side verification:** TabBar labels are const Tab(text:...) with no badge support (delivery_dashboard_screens.dart:478-484). Repo grep getPendingActionsCount/pending-actions: zero endpoint calls; lib/domain/pending_actions.dart is a pure order-derived classifier (AU-058, reads lib/models/order.dart) with no HTTP.
- **Frontend-side verification:** Verified: apiClient.getPendingActionsCount fetched at :1029 and :1147 and rendered as badge counts on the Selling/Orders tabs (:2713-2737, :2805, :4321). Minor is right: at-a-glance signal only.

### 🟡 Minor · missing — Non-seller verification gate card missing (silent empty list instead)

**ID:** `listing-mgmt:LISTIN-21` · **Area:** Dashboard - seller gate

**Impact:** Non-verified users get a misleading 'no listings' state instead of being guided to seller verification.

- **Frontend evidence:** app/expat/dashboard/page.tsx:2825,:2833 - 'Verify your account to start selling' block card with 'Get Verified' button for non-sellers (§1.31)
- **Mobile evidence:** lib/screens/seller_listings_screen.dart:45,:261-266 - token-null returns [] and the screen renders 'You have no listings yet.' with no seller-status check or verification CTA (a verification hub exists at lib/app_router.dart:254 but is not linked here)
- **Mobile-side verification:** Token-null _load returns const [] (seller_listings_screen.dart:45) and the empty state is 'You have no listings yet.' (261-266) - no seller-status/verification check, no CTA. The verification hub route exists (app_router.dart:254-257) but nothing in this screen links to it.
- **Frontend-side verification:** Verified: non-seller gate card 'Verify your account to start selling' with 'Get Verified' button linking /account/verification (dashboard :2818-2836). Minor is right: onboarding guidance gap.

### 🟡 Minor · divergent — Profile route accepts only numeric ids; web's name and -p{base36} slug deep links fail

**ID:** `listing-mgmt:LISTIN-28` · **Area:** Seller profile - routing

**Impact:** Shared web-format profile links (with slugs) do not resolve inside the app; only bare numeric deep links work.

- **Frontend evidence:** lib/seller-profile-route.ts:28,:38 - parseSellerProfileSegment accepts numeric id, '{name}-p{base36}' and plain-name segments; app/seller/[id]/page.tsx §7.22 name-slug search fallback
- **Mobile evidence:** lib/app_router.dart:154-156 - '/seller/:id' passes pathParameters['id'] straight to _routeId; :63-67 - non-numeric or out-of-range ids degrade to 0, so slug links render 'Could not load seller.'
- **Mobile-side verification:** app_router.dart:154-158 passes state.pathParameters['id'] straight to _routeId, which returns 0 for anything int.tryParse rejects or out of 0..2^53-1 (63-67); sellerId 0 then fails fetchSellerSummary -> 'Could not load seller.' No slug parsing, no name-search fallback anywhere in the router or the profile screen.
- **Frontend-side verification:** Verified: parseSellerProfileSegment accepts numeric id, '{name}-p{base36}' and plain-name segments (lib/seller-profile-route.ts:28-53, base36 regex :38), and the page resolves name-only slugs by searching products by sellerName then deriving the id (page :195-206) with 'Seller not found' only when both fail (:221-225). Minor is right: deep-link compatibility gap.

### 🟡 Minor · partial — Availability editor lacks calendar grid with 'Booked from/Available again' labels, seller-only explainer, bookedToday/availableFrom display, and the save-time quantity=1 forcing

**ID:** `listing-mgmt:LISTIN-29` · **Area:** Rental availability editor

**Impact:** Functional parity for close/reopen dates exists, but the richer calendar UX, explainer copy and the quantity/booking state synchronization on save are missing.

- **Frontend evidence:** components/product-choices/seller-rental-calendar-dialog.tsx:123-126 - 'Reserve booked dates' dialog with 'Seller-only shortcut.' explainer; §1.59-1.60 RentalDateRangeCalendar labels; app/expat/dashboard/page.tsx:4402 - saving from the dialog sets rentalBookedToday and productQuantity: 1
- **Mobile evidence:** lib/screens/rental_availability_screen.dart:86-92 - date input is showDateRangePicker only (no calendar grid or block labels); :174,:232-246 - renders bookedRanges only, bookedToday/availableFrom parsed but unused; :112-124 - createRentalBlock appends locally without any productQuantity/rentalBookedToday write-back
- **Mobile-side verification:** rental_availability_screen.dart: date input is showDateRangePicker only (86-92) - no custom calendar grid or 'Booked from/Available again' labels anywhere; the body renders only 'Guests can book any date except...' (200-203) plus the Closed/Booked sections. _availability is stored but only bookedRanges are read (174, 232-246); bookedToday/availableFrom parsed in the model, never displayed. createRentalBlock (112-124) appends locally with no productQuantity/rentalBookedToday write-back (grep: mobile never PATCHes quantity from this screen).
- **Frontend-side verification:** Verified: dialog 'Reserve booked dates' with the 'Seller-only shortcut.' explainer (seller-rental-calendar-dialog.tsx:121-130), RentalDateRangeCalendar labels 'Booked from'/'Available again' (:132-142), Reserve disabled until both dates (:144-152), and the dashboard's onAvailabilityChange writing rentalBookedToday + productQuantity: 1 (dashboard :4392-4406). Nuance: web's quantity=1 is a local-state mirror on refresh (the backend quantity forcing lives in the edit submit :1103), which matches how the claim phrases it. Minor is right: functional parity for block/delete exists; UX + state-sync extras missing.

### 🟡 Minor · divergent — Validation contract diverges: no fixed-order error list or blocked-submit summary toast; subcategory optional; no 255-char title cap

**ID:** `listing-mgmt:LISTIN-30` · **Area:** Edit listing - validation rules

**Impact:** Same core rules (title/description required, price floors, promo inversion, WhatsApp immutability) but different enforcement UX and looser subcategory/length rules allow submissions web would block.

- **Frontend evidence:** lib/edit-listing-validation.ts:40-82 - fixed error order incl. 'Subcategory is required' (:42); :90 - blocked-submit toast 'Please complete the required fields' with 'Review {N} more field(s)'; app/edit-listing/[id]/page.tsx:996-1000,:1080 - MAX_LENGTHS.productName 255 enforced by truncation
- **Mobile evidence:** lib/screens/edit_listing_screen.dart:302-315 - subcategory dropdown has no validator (saved without subcategoryId when cleared); :283-289 - title has no max-length; :156,:277-282 - per-field inline validators + top error banner, no ordered summary or count toast
- **Mobile-side verification:** Verified: title TextFormField (edit_listing_screen.dart:283-289) has no maxLength (only description has 2500, 321); subcategory dropdown (302-315) has no validator and is sent only when non-null (198); _save on invalid form returns silently (156) - per-field inline errors + top banner only, no ordered summary or 'Review N fields' toast anywhere in the file.
- **Frontend-side verification:** Verified: getEditListingValidationErrors returns the fixed order incl. 'Subcategory is required' at :42 (lib/edit-listing-validation.ts:38-84), formatEditListingValidationToast 'Please complete the required fields' + 'Review {N} more field(s)' (:86-96), both wired into the submit (:903, :926), and MAX_LENGTHS.productName 255 enforced by substring truncation (edit page :996-1000, :1080). Minor is right: same core rules, looser mobile enforcement UX.

### 🟡 Minor · BROKEN — Detail-screen seller card shows a static 'Verified' label for every seller instead of the verification heuristic

**ID:** `listing-mgmt:LISTIN-31` · **Area:** Product detail - seller trust label

**Impact:** Unverified sellers are presented as Verified on mobile product pages, diluting the trust signal web computes.

- **Frontend evidence:** app/seller/[id]/page.tsx:255-263 - isVerified computed from verificationStatus/roles/product seller flags before any Verified badge renders (§6.9)
- **Mobile evidence:** lib/screens/product_detail_screen.dart:699 - unconditional Text('Verified', ...) in _SellerCard for all sellers; the profile screen shows no badge at all
- **Mobile-side verification:** product_detail_screen.dart:699 renders Text('Verified', ...) unconditionally in _SellerCard for every seller (the isVerified:false at 130 is an unrelated Product-model field). The profile screen shows no badge at all; no verificationStatus/roles heuristic exists in either screen (grep verificationStatus in product_detail: zero).
- **Frontend-side verification:** Verified: the web profile computes isVerified from verificationStatus VERIFIED/NATURAL_VERIFIED, SELLER/ADMIN roles, and product-level seller flags before any Verified badge renders (page :255-264, badges :575-585/:611-616; label helper lib/seller-display.ts:50-71). Minor is right: a static trust label divergence, no flow impact.

### 🟡 Minor · partial — No warning toast on promotional-price inversion (inline error only)

**ID:** `listing-mgmt:LISTIN-32` · **Area:** Edit listing - promotional price toasts

**Impact:** Same blocking rule, but mobile omits the explanatory toast telling the seller to use the previous asking price in the promotional field.

- **Frontend evidence:** app/edit-listing/[id]/page.tsx §2.15 - entering promo ≤ asking triggers toast 'Promotional price must be higher' with explainer description plus the inline error (lib/edit-listing-validation.ts:81)
- **Mobile evidence:** lib/screens/edit_listing_screen.dart:143-153 - _validateOriginal returns inline 'Promotional price must be HIGHER than the final asking price.'; no SnackBar/toast is issued for the inversion
- **Mobile-side verification:** _validateOriginal (edit_listing_screen.dart:143-153) returns the inline error only; no SnackBar/toast is issued for the inversion anywhere in the file (the only toasts are 'Listing updated.' at 234-235). Same blocking rule via Form validation, but the explanatory toast layer web has is absent.
- **Frontend-side verification:** Verified the toast exists on web: 'Promotional price must be higher' with the 'Use the product's previous asking price here...' description fires on change (:671-681) and again at submit (:976-984), plus the inline error (:2043-2047) and validation entry (lib/edit-listing-validation.ts:76-82). Minor is right: same blocking rule, missing explanatory toast on mobile.

<details><summary><strong>Confirmed equivalent in both apps (21)</strong></summary>

- Edit route loads via GET /displayItem/itemDetails/{id} + categories in parallel, with logged-out ('Log in to edit your listing.') and hidden/deleted load-failure states (lib/screens/edit_listing_screen.dart:72-128)
- Save goes through PATCH /products/update/{id} multipart 'product' JSON part; success SnackBar + pop; ApiException triggers handleUnauthorized (edit_listing_screen.dart:232-250; api_client.dart:1520-1529)
- WhatsApp is read-only on edit with the same 'cannot be changed from the edit listing page' copy and required check (edit_listing_screen.dart:412-424)
- Promotional price must be strictly HIGHER than asking price, with valid-amount/non-negative checks - same business rule as web (edit_listing_screen.dart:141-153)
- TSh 1,000 floors on both asking price and 'You receive'; loaded payout displayed floor-rounded to 1000s (edit_listing_screen.dart:104-108,175-177,339-345)
- Unchanged-price guard: payout re-sent as loaded unless edited (delta > 0.5), mirroring web's no-reconversion drift guard (edit_listing_screen.dart:166-174)
- Commission engine is an exact port: VAT 0.18 / Selcom 0.02 / 0.02, grossTargetRate & multiplier formulas, FORWARD ceil / REVERSE floor to TZS 1000, full breakdown incl. platformNetProfit = afterCuts, category rate from backend commissionRate with identical fallback table and 0.10 default (lib/domain/commission_calculator.dart:59-174)
- Category change resets subcategory on edit (edit_listing_screen.dart:296-299)
- Delivery fare tariffs and fallback bands identical: BODA 2000/600 … SEMI_TRUCK 45000/4500 over 1.5 km base, ceil-to-1000, sameRegion fare(2)/fare(25), outsideRegion fare(25)/fare(100) (lib/domain/delivery_fare.dart:107 vectors)
- Two-field listing status model ported exactly (_statusKey/_key: REJECTED/UNAPPROVED, PENDING, legacy ARCHIVED on both fields, rentalBookedToday Booked/Available, SOLD, OUT_OF_STOCK, partial-stock '{sold} sold / {left} left') (seller_listings_screen.dart:62-91,382-407)
- Status change via PATCH /products/status/{id} and delete via DELETE /products/delete/{id} with a confirm dialog, busy-gating, error toasts and reload (seller_listings_screen.dart:166-227; api_client.dart:1495-1516)
- 'Needs attention' computation (needsLogisticsConfirmation) ported: deliverySetupReady/deliverySetupIssues win, else coordinatesSource == PINNED and transportModeSource == SELLER_SELECTED (seller_listings_screen.dart:123-134) with a filter chip
- Delivery fare/rental math ported: billable units HOUR ceil-minutes/DAY/WEEK ceil/MONTH calendar with partial-month round-up, end-after-start and pickup/return-time errors, half-open overlap test, end-exclusive single-night close (lib/domain/rentals.dart; rental_availability_screen.dart:95-108)
- Rental availability management exists owner-side: GET/POST/DELETE /products/{id}/rental-blocks plus public rental-availability fetch, booked-by-guests read-only section, busy LinearProgressIndicator, and overlap-rejection message (rental_availability_screen.dart:48-152; api_client.dart:2279-2350)
- MySpace 5-tab shell (Overview/Selling/Buying/Saved/Requests) hosting the listings screen; 'Add listing'/'Sell an item' entry points to /sell wizard (delivery_dashboard_screens.dart:478-501; seller_listings_screen.dart:234-239)
- Saved tab lists wishlist with per-card unsave (unsave API + SnackBar + instant removal) and login/empty/error states (saved_items_screen.dart:36-78,96-123)
- Seller profile renders avatar, name, position, rating row (1-dp + count), About section, 2-column listings grid from POST /displayItem/filter {sellerId}, and reviews with stars/text from /user-ratings/{userId} (seller_profile_screen.dart:37-233)
- Seller order lifecycle is broadly present in the app (confirm/decline availability, production-complete, dispatch with not-yet gating, delivery-code verify/regenerate, mark paid/delivered/picked-up, seller-cancel, seller-rate, rental handoff codes, transporter assignment) via lib/screens/orders_screen.dart and lib/api/api_client.dart:2021-2106 - orders detail belongs to the orders domain audit
- Product detail adjacent surfaces match: own-item purchase block, out-of-stock Buy/Add disable, login-required gate, WhatsApp wa.me row, owner/admin hidden-listing gate, fire-and-forget click tracking with totals/unique (product_detail_screen.dart:128-141,355-371,668-733)
- Legacy dead SellScreen is unrouted; /sell → SellWizardScreen and /edit-listing/:id → EditListingScreen (app_router.dart:311-318)
- Notification deep link PRODUCT_LOGISTICS_UPDATE_REQUIRED → /edit-listing/{referenceId} gives mobile a repair entry path (lib/domain/notification_feed.dart, app_router.dart)

</details>


## Cart & checkout

### 🟠 Major · missing — Legacy checkout flow (meet-seller / CASH / WhatsApp-call coordination) entirely absent from mobile

**ID:** `cart-checkout:CARTCH-01` · **Area:** Checkout flow

**Impact:** On a default deploy (LOGISTICS_V2 off) web buyers get the meet-seller/cash flow; mobile forces every order through the v2 proforma + bank/Lipa Namba transfer, so cash-arrangement buyers cannot check out on mobile at all

- **Frontend evidence:** app/checkout/checkout-content.tsx:315 - legacy CASH payment method def; :990-992 - auto-select CASH; :2073 - 'Handle Meet in Person checkout via meet-seller API'; lib/api.ts:4032-4036 - POST /api/v1/checkout/meet-seller
- **Mobile evidence:** lib/screens/checkout_screen.dart:23-41 - only the 4-step v2 proforma machine exists; :99/:130 - fulfillment/payment limited to SELLER_DELIVERY|BUYER_PICKUP and MOBILE_MONEY|BANK_TRANSFER; repo-wide grep for meet-seller/CASH in lib/ returns no hits
- **Mobile-side verification:** Exhaustive search of lib/ (case-insensitive) for meet-seller/meet_seller/meetSeller/MEET_IN_PERSON/in-person/CASH/cash payment returns zero hits. api_client.dart has only two /api/v1/checkout/* calls: delivery-quote (:403-415) and proforma (:522-530). checkout_proforma.dart:91-95 asserts fulfillmentType ∈ SELLER_DELIVERY|BUYER_PICKUP and paymentMethodType ∈ MOBILE_MONEY|BANK_TRANSFER only; checkout_screen.dart:844-857 offers only those two fulfillment radios. No legacy/cash flow exists under any name. Caveat on impact: the 'default deploy LOGISTICS_V2 off' premise is a backend-config assumption not verifiable from the mobile repo, but the feature itself is genuinely absent on mobile.
- **Frontend-side verification:** Frontend verified: checkout-content.tsx:313-322 defines the single CASH payment method ('Cash / Mobile Money / Bank Transfer when receiving order'), :988-993 auto-selects CASH on every fulfillmentType change, :2072-2102 builds MeetSellerCheckoutPayload for the meet-seller branch, and lib/api.ts:4032-4040 POSTs /api/v1/checkout/meet-seller (initiateMeetSellerCheckout). The legacy flow is real and is the only payment path when LOGISTICS_V2 is off. Severity major is right: it removes an entire checkout flow on mobile, though the v2 proforma flow still lets mobile buyers complete orders (so not a total core-flow break).

### 🟠 Major · BROKEN — Proforma resume is not implemented: 'Continue payment' lands on a fresh cart-based checkout

**ID:** `cart-checkout:CARTCH-02` · **Area:** Payment recovery / resume

**Impact:** The cart is cleared when the proforma is created, so a buyer who leaves checkout and taps 'Continue payment' gets an empty-cart checkout; a PENDING_PAYMENT invoice can never be paid from mobile and expires after 1h, losing the reservation

- **Frontend evidence:** app/checkout/checkout-content.tsx:443 - resumeProformaId from ?proforma=; :1122-1141 - resume-vs-new decision incl. proformaMatchesCart; components/dashboard/my-payments-panel.tsx:384 - 'Continue payment' link
- **Mobile evidence:** lib/screens/my_payments_screen.dart:546 - pushes '/checkout?proforma=$proformaId'; lib/app_router.dart:163-171 - /checkout builder ignores the query param (comment: 'the resume flow itself lands in Wave 1'); lib/screens/checkout_screen.dart:42-49 - CheckoutScreen has no proformaId parameter
- **Mobile-side verification:** Verified end to end: my_payments_screen.dart:546 pushes '/checkout?proforma=$proformaId'; app_router.dart:163-171 /checkout builder constructs CheckoutScreen(auth: AuthStore.instance) and discards the query param; CheckoutScreen's constructor (checkout_screen.dart:42-49) has no proformaId parameter and initState (:144-147) only loads profile/addresses. Cart is cleared at :462 after proforma creation, so 'Continue payment' opens a fresh empty-cart checkout. The proforma_{id} KV written at :456-459 is never read back (repo-wide grep for 'proforma_$' finds only the write). No resume path exists anywhere.
- **Frontend-side verification:** Frontend verified: checkout-content.tsx:443 reads ?proforma= into resumeProformaId ('a ?proforma=<id> param resumes payment from My Payments even with an empty cart'); :1116-1142 is the one-shot resume decision where a deep link always resumes (:1127-1131) and otherwise proformaMatchesCart (defined :303-309) decides; my-payments-panel.tsx:372-387 renders the 'Continue payment' Link (text at :384) to /checkout?proforma={id}. Severity major is right: the resumable-payment path is money-adjacent and its absence strands PENDING_PAYMENT invoices, but the buyer can still re-order and create a new invoice.

### 🟠 Major · divergent — Expired-invoice dialog offers no cart restore; snapshot is persisted but never read back

**ID:** `cart-checkout:CARTCH-03` · **Area:** Proforma expiry recovery

**Impact:** After the 1h expiry web puts the items back in the cart; mobile tells the buyer to start over with a lost cart - choices and rental bookings must be re-entered from scratch

- **Frontend evidence:** app/checkout/checkout-content.tsx:1611 - restoreExpiredCart(); :3998 and :4006 - expiry dialog actions restore the confirmed items before navigating
- **Mobile evidence:** lib/screens/checkout_screen.dart:601-646 - 'Invoice expired' dialog + _restartCheckout clears proforma/receipts/windows and jumps to review with an empty cart; :452-455 writes proforma_cart_snapshot and :591/:683 remove it, but no code path ever reads it (grep kProformaCartSnapshot)
- **Mobile-side verification:** kProformaCartSnapshot is defined (kv_store.dart:100), written once (checkout_screen.dart:452-455) and removed twice (:591 on payment success, :683 on cancel) — never read. _restartCheckout (:627-646) clears proforma/receipts/references/confirmation/windows/quote and jumps to review without restoring anything; _showExpiredDialog (:601-625) offers only OK / 'Start fresh checkout'. The cancel-invoice dialog copy (:662-665) even tells the buyer 'you'll need to add the items again to reorder'. Grep for kProformaCartSnapshot returns exactly those 4 sites — no restore path.
- **Frontend-side verification:** Frontend verified: checkout-content.tsx:1611-1633 restoreExpiredCart() re-adds every confirmed item via addToCart(product, quantity, true) then clears proforma/snapshot/receipt state; the expiry dialog (:3981-4013) calls `if (await restoreExpiredCart()) router.push('/cart')` at :3998 and `if (await restoreExpiredCart()) setCurrentStep(2)` at :4006, and its copy explicitly promises 'We can restore the confirmed items to your cart'. Severity major is right: without it mobile loses choices/rental bookings on expiry — significant data loss in a recovery path, not a primary-flow break.

### 🟠 Major · partial — Server availability windows are never fetched; only 6 static composites offered

**ID:** `cart-checkout:CARTCH-04` · **Area:** Delivery windows

**Impact:** Mobile buyers can select slots the seller never offered (seller working hours ignored), producing delivery windows the seller cannot meet and misleading 'Earliest' dates

- **Frontend evidence:** lib/api.ts:2812 - POST /api/v1/checkout/availability-windows; app/checkout/steps/review-step.tsx:203-206 and :554-556 - server availabilityWindows preferred over the static options
- **Mobile evidence:** lib/domain/delivery_windows.dart:135-142 - kDeliveryWindowOptions is exactly the 6 TODAY/TOMORROW x MORNING/AFTERNOON/EVENING composites (no SELLER_HOURS); lib/screens/checkout_screen.dart:876 - windows come only from resolveDeliveryWindows; no availability-windows call anywhere in lib/
- **Mobile-side verification:** kDeliveryWindowOptions (delivery_windows.dart:135-142) is exactly the 6 TODAY/TOMORROW × MORNING/AFTERNOON/EVENING composites with no seller-hours input; review builds windows solely via resolveDeliveryWindows(_nowUtc, _productionTimeDays) (checkout_screen.dart:876). Repo-wide search for availability-windows/availabilityWindows/SELLER_HOURS (case-insensitive) returns zero hits; api_client.dart has no such endpoint. Quote failures are the only server input, and they never alter the offered slot list.
- **Frontend-side verification:** Frontend verified: lib/api.ts:2809-2816 getAvailabilityWindows POSTs /api/v1/checkout/availability-windows with {items:[{productId,quantity:1}]}; review-step.tsx:202-227 prunes/validates against quote?.availabilityWindows when present, and :554-560 renders the server AvailabilityWindowPicker in preference to the static DELIVERY_WINDOW_OPTIONS fallback (:561-629). Severity major is right: seller working-hour windows are a user-visible checkout feature; static-only slots can produce undeliverable windows.

### 🟠 Major · divergent — Cross-region delivery policy not applied: quoted cross-region fee is billed online with no 'Arranged after checkout' state

**ID:** `cart-checkout:CARTCH-05` · **Area:** Delivery fee policy

**Impact:** Web defers cross-region cost to post-checkout arrangement (amber 'Arranged after checkout', marker-only map, excluded from totals); mobile charges/shows the deferred fee online and never tells the buyer the cost is unsettled - a money-display divergence

- **Frontend evidence:** lib/delivery-region.ts:109-125 - applyCrossRegionDeliveryPolicy nulls consolidatedDeliveryFee/distanceKm and sets crossRegionDelivery; app/checkout/checkout-content.tsx:1232-1239 - applied to every quote before use
- **Mobile evidence:** lib/screens/checkout_screen.dart:335-338 - quote map is stored and used verbatim; lib/domain/delivery_quote.dart:243-264 - quotedFeeForSeller reads only consolidatedDeliveryFee; grep for crossRegion in lib/ has no hits
- **Mobile-side verification:** _fetchQuote stores the response verbatim (_quote = quote, checkout_screen.dart:337) and quotedFeeForSeller (delivery_quote.dart:243-264) reads only consolidatedDeliveryFee keyed by sellerId/sellerKey — no policy transformation of any kind. Case-insensitive grep for crossRegion/cross_region/'Arranged after checkout' across lib/ returns zero hits; totals (checkout_screen.dart:1622-1637) always show the quoted fee in money. The applyCrossRegionDeliveryPolicy concept does not exist on mobile.
- **Frontend-side verification:** Frontend verified: lib/delivery-region.ts:109-138 applyCrossRegionDeliveryPolicy nulls consolidatedDeliveryFee/consolidatedDeliveryFeeMin/distanceKm, sets crossRegionDelivery:true, and recomputes deliveryTotal for cross-region sellers; checkout-content.tsx:1232-1241 applies it to every successful quote and derives hasDeferredCrossRegionDelivery; review-step.tsx:372-373 surfaces the amber 'Arranged after checkout' state. Severity major is right: a money-display divergence (fee billed online vs deferred), kept at major rather than critical since the fee still originates from the server quote — the missing piece is the client-side deferral policy.

### 🟠 Major · BROKEN — Rentals / transport-exempt items are forced through delivery quoting and windows

**ID:** `cart-checkout:CARTCH-06` · **Area:** Fulfillment eligibility

**Impact:** A rental/property booking on mobile is pushed through SELLER_DELIVERY with a delivery fee and delivery windows that web marks 'Booking access'/'Direct handoff' with no vehicle - bogus fees or quote failures; in pickup mode the per-group fee row still reads 'To be confirmed'

- **Frontend evidence:** lib/transport-requirements.ts:10-29 - itemUsesDeliveryLogistics/resolveCheckoutTransportRequirement (rentals and EXEMPT -> no delivery logistics); app/checkout/checkout-content.tsx:572-576 - forces setFulfillmentType('BUYER_PICKUP') when !requiresDeliveryLogistics; :636/:716/:808 - quote and windows built from delivery items only
- **Mobile evidence:** lib/screens/checkout_screen.dart:99 - _fulfillmentType defaults 'SELLER_DELIVERY' and is never forced; :304-306 - quote payload built from ALL selected lines incl. rentalBooking; transportRequirement exists only in the sell flow (lib/models/sell_form_state.dart:101-103)
- **Mobile-side verification:** _fulfillmentType defaults 'SELLER_DELIVERY' (checkout_screen.dart:99) and the radios (:844-857) are the only thing that changes it — nothing forces BUYER_PICKUP. The quote payload (:305-306, :423-424 via buildItemsPayload) includes every selected line and rentals ride along with rentalBooking (checkout_proforma.dart:157). transportRequirement is parsed (models/product_detail.dart:25,132-133) but never consumed by the buyer flow — it is used only in the sell flow (sell_form_state.dart, edit_listing_screen.dart:225-226, sell_wizard_screen.dart). product_detail_screen.dart add/Buy Now (:109-143) checks rental completeness only and pushes CheckoutScreen unchanged. Pickup-mode per-group fee row falls to 'To be confirmed' (:1576-1579) since fee is null and no failure exists.
- **Frontend-side verification:** Frontend verified: lib/transport-requirements.ts:10-16 itemUsesDeliveryLogistics returns false for rentalBooking and EXEMPT (OPTIONAL only with a transport mode) and :29-40 resolveCheckoutTransportRequirement; checkout-content.tsx:572-576 forces setFulfillmentType('BUYER_PICKUP') when !requiresDeliveryLogistics, :577-580 gates the availability hook on requiresDeliveryLogistics, and delivery-only filtering is applied at :636 (route previews), :716 (quote failure detection) and :808 (fee estimator); the v2 quote payload itself filters via itemUsesDeliveryLogistics at :1166-1178. Severity major is right: rentals get bogus delivery fees/quote requirements on mobile — fee-affecting but not a total flow break.

### 🟠 Major · partial — Rental booking dates/times/units are not rendered anywhere in cart or review

**ID:** `cart-checkout:CARTCH-07` · **Area:** Rental booking visibility

**Impact:** A buyer cannot see which pickup/return dates they booked before paying; a wrong-period booking is only discoverable after the proforma/order exists

- **Frontend evidence:** app/cart/page.tsx:26 and :286 - RentalBookingSummary rendered on each cart line; app/checkout/steps/review-step.tsx:288, :343, :348 - rental summary + orderItemUnitLabel in review
- **Mobile evidence:** lib/screens/cart_screen.dart:385-417 - cart tile renders title/choice values/price only; lib/screens/checkout_screen.dart:1538-1551 - review line shows choices + 'Qty: n' only; lib/cart/cart_store.dart:63 - CartItem.rentalBooking is carried but no cart/checkout UI reads it
- **Mobile-side verification:** Cart tile (cart_screen.dart:385-417) renders title/choice values/price/'each'/shipping caption only; review line (checkout_screen.dart:1538-1551) renders title/choices/'Qty: n'/subtotal. CartItem.rentalBooking (cart_store.dart:63) is carried, keys the lineId (:87-101) and is serialized into the proforma (checkout_proforma.dart:157) but no cart/checkout widget reads it. Scope note: a rental summary IS rendered post-purchase on order detail (orders_screen.dart:1173 _RentalBookingSummary), which does not refute the claim as scoped to cart/review.
- **Frontend-side verification:** Frontend verified: cart/page.tsx:26 imports RentalBookingSummary and :286 renders <RentalBookingSummary booking={item.rentalBooking}> on every cart line; review-step.tsx renders it per review line at :342-346 plus orderItemUnitLabel(item.rentalBooking): quantity at :347-349 (groupIsRental 'Booking access' footer at :288/:363-365). Severity major is right: booked pickup/return dates and billable units are invisible before paying on mobile — a core review-information gap for rental money.

### 🟠 Major · partial — PDF receipts unsupported (gallery images only); no MIME whitelist or PDF compression

**ID:** `cart-checkout:CARTCH-08` · **Area:** Payment proof upload

**Impact:** Bank-transfer proofs that exist only as PDF cannot be attached on mobile at all, blocking payment submission for those buyers; web accepts them

- **Frontend evidence:** components/checkout/receipt-upload.tsx:18 - ALLOWED_MIME_TYPES includes application/pdf; :59-62 - pdf-lib re-save compression for PDFs
- **Mobile evidence:** lib/screens/checkout_screen.dart:1255-1259 - ImagePicker().pickImage(source: gallery) only, no PDF path; :536 - upload contentType hardcoded 'image/png'; lib/screens/my_payments_screen.dart:555-559 - same gallery-only picker for proof re-upload
- **Mobile-side verification:** Both pickers are ImagePicker().pickImage(source: ImageSource.gallery) only — checkout_screen.dart:1255-1259 and my_payments_screen.dart:555-559 — with no PDF path, no MIME whitelist and no file-type choice. Upload contentType is hardcoded 'image/png' (checkout_screen.dart:536; my_payments default fileName 'receipt.png'/contentType 'image/png' :841-842). pubspec.yaml contains image_picker (^1.2.0) only — no file_picker, no pdf package. The PaymentsApi doc comment itself (my_payments_screen.dart:550-552) acknowledges web accepts JPEG/PNG/WebP/PDF while mobile is gallery-only.
- **Frontend-side verification:** Frontend verified: receipt-upload.tsx:18 ALLOWED_MIME_TYPES = {image/jpeg, image/png, image/webp, application/pdf}; :53-88 compressPdf() re-saves PDFs via pdf-lib with object streams (kept only if smaller), and compressReceipt (:90-94) routes both formats. Severity major is right: PDF-only bank proofs cannot be attached on mobile, blocking submission for those buyers, though a screenshot/convert workaround exists so it is not a hard critical break.

### 🟡 Minor · missing — No 30s proforma polling on the payment step; getProforma is never called

**ID:** `cart-checkout:CARTCH-09` · **Area:** Proforma lifecycle sync

**Impact:** Server-owned transitions (expiry, admin confirmation/cancellation) are only discovered when submit-payment fails; a buyer can sit on a payable-looking invoice the server already expired

- **Frontend evidence:** hooks/use-proforma.ts:22 - POLL_INTERVAL_MS = 30_000; :134 - setInterval poll while status in PENDING_PAYMENT/PAYMENT_SUBMITTED
- **Mobile evidence:** lib/api/api_client.dart:495 - getProforma() defined but has zero callers (grep); lib/screens/checkout_screen.dart:1791-1798 - the only timer is the 1s countdown tick
- **Mobile-side verification:** getProforma is defined at api_client.dart:495 with zero callers (repo-wide grep finds only the definition and its doc comment). The only timer in CheckoutScreen is the 1s countdown tick (checkout_screen.dart:1794 _timer = Timer.periodic(Duration(seconds: 1))); _quoteWatchdog (:308) is the 20s quote timeout. No poll loop, no interval constant, no proforma refresh on the payment step. Non-PAYMENT_SUBMITTED outcomes are discovered only when submit-payment responds (:546-553) or throws (:556-572).
- **Frontend-side verification:** Frontend verified: hooks/use-proforma.ts:22 POLL_INTERVAL_MS = 30_000 and :131-138 sets an interval polling getProformaInvoice while status is PENDING_PAYMENT/PAYMENT_SUBMITTED (isActive, :55-56), plus handleClientExpiry re-check (:156-161). Severity minor is right: it is background state-sync resilience; mobile still discovers transitions at submit time via its countdown and server errors.

### 🟡 Minor · missing — Delivery route map (seller pins, buyer pin, polylines) missing from review

**ID:** `cart-checkout:CARTCH-10` · **Area:** Review step visuals

**Impact:** Buyers cannot visually verify the pickup-to-delivery route before paying; cross-region marker-only map is also impossible (see CARTCH-05)

- **Frontend evidence:** app/checkout/steps/review-step.tsx:275 and :279 - DeliveryRouteMap rendered for delivery and for rentals
- **Mobile evidence:** lib/widgets/map_location_picker.dart is only used by lib/screens/addresses_screen.dart:176; lib/screens/checkout_screen.dart review step (874-1015) has no map of any kind
- **Mobile-side verification:** MapLocationPicker's only consumer is addresses_screen.dart:176 (grep across lib/ shows the widget definition in map_location_picker.dart and that single usage). The entire review step (checkout_screen.dart:874-1016) is a ListView of destination block, seller group cards, totals, window checkboxes, quote-failure box and terms checkbox — no GoogleMap, no polylines, no map widget of any kind. google_maps_flutter is used solely by the address pin picker.
- **Frontend-side verification:** Frontend verified: review-step.tsx:274-276 renders <DeliveryRouteMap destination routes> for delivery items and :278-284 a second purpose="rental" DeliveryRouteMap for rentalRoutePreviews. Severity minor is right: visual route verification is an aid; the fee/state information it complements is still shown textually.

### 🟡 Minor · BROKEN — Unconditional wishlist toggle can DELETE an already-saved item while claiming success

**ID:** `cart-checkout:CARTCH-11` · **Area:** Cart save-for-later

**Impact:** 'Save for later' on a cart line that is already wishlisted silently removes the product from the wishlist and still toasts 'Saved for later - moved to your wishlist.'

- **Frontend evidence:** app/cart/page.tsx:55-56 - saves only `if (!isProductSaved(productIdValue))` before removeFromCart
- **Mobile evidence:** lib/screens/cart_screen.dart:476-477 - calls SavedProductsStore().toggle(...) unconditionally then removes the line; lib/cart/saved_products_store.dart:55-66 - toggle calls unsaveProduct when the id is already present
- **Mobile-side verification:** cart_screen.dart:465-491: the save-for-later handler calls SavedProductsStore().toggle(item.productId, token) unconditionally, then cart.remove(lineId), then toasts 'Saved for later — moved to your wishlist.' SavedProductsStore.toggle (saved_products_store.dart:55-66) calls unsaveProduct when the id is already in _ids, so an already-wishlisted product is deleted server-side while the success toast still fires. The only isSaved guard in the codebase is the product-detail heart (product_detail_screen.dart:369,403) — the cart path has none, unlike web's if(!isProductSaved(...)).
- **Frontend-side verification:** Frontend verified: cart/page.tsx:51-62 handleSaveForLater guards the wishlist write with `if (!isProductSaved(productIdValue)) { await toggleSaveProduct(productIdValue) }` (:55-56) before unconditionally removeFromCart(item.id) — exactly the guard mobile lacks. Severity minor is right: silent wishlist deletion is an edge-case data-loss bug on an already-saved line.

### 🟡 Minor · divergent — Reference-only submissions accepted and confirmation tick not gated on an attached receipt

**ID:** `cart-checkout:CARTCH-12` · **Area:** Payment proof validation

**Impact:** Mobile buyers can submit a payment claim with only a typed reference and no screenshot, a proof standard web never allows - inconsistent material for the 30-minute finance review

- **Frontend evidence:** app/checkout/steps/payment-confirmation-step.tsx:98 - hasProof = receiptFiles.length > 0; :283 - checkbox disabled until a receipt file exists
- **Mobile evidence:** lib/screens/checkout_screen.dart:513-518 - hasProof = _receipts.isNotEmpty || refs.isNotEmpty ('screenshot or transaction reference'); :1194-1203 - confirmation checkbox always enabled
- **Mobile-side verification:** checkout_screen.dart:513 hasProof = _receipts.isNotEmpty || refs.isNotEmpty (rejecting only when both are empty) and the confirmation CheckboxListTile (:1194-1203) is always enabled. I also spot-checked the cited frontend file to test the divergence: payment-confirmation-step.tsx:98 is hasProof = receiptFiles.length > 0 and :283 disables the checkbox with disabled={disabled || !hasProof} — so the mobile comment at :131-134 claiming web parity ('receiptFiles.length > 0 || refs.some') is wrong. Reference-only submission with the tick is possible on mobile and not on web.
- **Frontend-side verification:** Frontend verified: payment-confirmation-step.tsx:98 `const hasProof = receiptFiles.length > 0` and :280-286 checkbox `disabled={disabled || !hasProof}` with helper 'Upload a payment screenshot first.' when no proof (:292-296). Severity minor is right: a proof-strictness divergence in the submission material, not a broken flow.

### 🟡 Minor · missing — Support call / WhatsApp contacts missing from the payment step

**ID:** `cart-checkout:CARTCH-13` · **Area:** Payment step support

**Impact:** A mobile buyer whose transfer or proof is stuck has no one-tap escalation on the exact screen where they need it

- **Frontend evidence:** app/checkout/steps/payment-confirmation-step.tsx:32 - OFFICIAL_SUPPORT_PHONE '+255693749306'; :95-97 - tel + wa.me hrefs rendered with the escrow box
- **Mobile evidence:** lib/screens/checkout_screen.dart:1018-1243 - payment step renders escrow box and submit button with no call/WhatsApp affordance; no url_launcher/tel usage in checkout_screen.dart or payment_screen.dart (grep)
- **Mobile-side verification:** The payment step (checkout_screen.dart:1018-1244) renders intro copy, made-to-order banner, amount card, countdown, method chips, receiving details, proof section, escrow box, ErrorBox, submit and cancel — no call/WhatsApp affordance. payment_screen.dart likewise has none. url_launcher (pubspec ^6.3.0) is imported only in admin_sublist_screens.dart (wa.me rows), account_misc_screens.dart (contact/help text incl. the +255 693 749 306 mention) and product_detail_screen.dart (contact-seller row) — never in checkout_screen.dart or payment_screen.dart. OFFICIAL_SUPPORT_PHONE does not exist on mobile.
- **Frontend-side verification:** Frontend verified: payment-confirmation-step.tsx:32 OFFICIAL_SUPPORT_PHONE = '+255693749306'; :95-97 construct supportPhone/supportWhatsApp/whatsAppHref, and the tel: link (:313-316) and wa.me link (:318-325) render at :310-328 directly under the escrow box (:300-308). Citation 95-97 is the href construction rather than the render site — immaterial. Severity minor is right: a missing convenience affordance.

### 🟡 Minor · partial — Terms & Conditions / Privacy Policy are styled text, not links

**ID:** `cart-checkout:CARTCH-14` · **Area:** Terms consent

**Impact:** Mobile buyers must agree to documents they cannot open from the checkout; the /terms and /privacy routes exist in lib/app_router.dart:298-305 but are unreachable from the checkbox

- **Frontend evidence:** app/checkout/steps/review-step.tsx:663-670 - href=/terms and /privacy on the required checkbox; app/checkout/checkout-content.tsx:3300-3307 - legacy step links
- **Mobile evidence:** lib/screens/checkout_screen.dart:960-972 - TextSpan children styled bold/brand-blue with no gesture recognizer or route push
- **Mobile-side verification:** checkout_screen.dart:956-975: the terms CheckboxListTile's title is a Text.rich whose 'Terms & Conditions' and 'Privacy Policy' TextSpans carry only bold/brand-blue styles — no GestureRecognizer, no onTap, no NavigationSpan. The /terms and /privacy routes exist (app_router.dart:298-305, HelpScreen) but nothing in the checkout navigates to them. No other terms link exists anywhere in the checkout flow.
- **Frontend-side verification:** Frontend verified: review-step.tsx:660-675 terms label contains <Link href="/terms"> and <Link href="/privacy"> (v2), and checkout-content.tsx:3299-3311 the same links on the legacy step-3 checkbox. Severity minor is right: consent is still captured; only the documents are unreachable from mobile's checkbox.

### 🟡 Minor · divergent — WhatsApp phone is editable inline instead of read-only with a redirect to Profile Settings

**ID:** `cart-checkout:CARTCH-15` · **Area:** Checkout identity fields

**Impact:** Mobile lets the buyer type a WhatsApp number that is never written back to the profile, diverging from web's single-source-of-truth behavior and risking delivery coordination calls to an unsaved number

- **Frontend evidence:** app/checkout/checkout-content.tsx:2480-2513 - click on read-only fields toasts 'Update in Profile Settings' with a 'Go to Settings' action to /account/settings?returnTo=/checkout
- **Mobile evidence:** lib/screens/checkout_screen.dart:776-781 - phone is an editable TextFormField (validator non-empty) while first/last/email are readOnly
- **Mobile-side verification:** checkout_screen.dart:776-782: the WhatsApp phone field is an editable TextFormField with keyboardType phone and only a non-empty validator; first/last/email are readOnly (:753-774) but phone is not. The address step (:742-871) contains no 'Update in Profile Settings' toast, no 'Go to Settings' action and no redirect to /account/settings (that route exists at app_router.dart:222-225 but is not referenced from checkout). Nuance on impact: the typed number is still sent on the proforma (buildBuyDetails phoneNumber, checkout_proforma.dart:116) — it just never reaches the profile.
- **Frontend-side verification:** Frontend verified: checkout-content.tsx:2551-2574 — the WhatsApp Phone Number input is readOnly with onClick toast 'Update in Profile Settings / To change your WhatsApp number…' and a 'Go to Settings' action linking /account/settings?returnTo=/checkout (same pattern as first/last name at :2468-2521, which the cited 2480-2513 range covers). Severity minor is right: divergence in edit UX with a data-hygiene risk, not a flow break.

### 🟡 Minor · partial — Uploaded receipts are not viewable from a payment card (count only)

**ID:** `cart-checkout:CARTCH-16` · **Area:** My Payments

**Impact:** When a proof is rejected the buyer cannot re-inspect what they uploaded before re-uploading, unlike web

- **Frontend evidence:** components/dashboard/my-payments-panel.tsx:19 and :492 - receipts <details> lists each receipt with AuthenticatedReceiptPreview
- **Mobile evidence:** lib/screens/my_payments_screen.dart:634-637 - receipts surface only as '{n} receipts' in the metadata line; no preview/download UI exists in the file
- **Mobile-side verification:** my_payments_screen.dart:635-637: receipts appear only as '${payment.receipts.length} receipt(s)' inside the metadata join ('Pending since … · method · N receipts'). The _PaymentCard build (:574-777) otherwise renders badge, price, countdown, rejection block and buttons — no AuthenticatedReceiptPreview equivalent, no image thumbnail, no download/open. BuyerPayment.receipts (:278-281) exposes raw maps but nothing renders their contents beyond fileName + rejection label (:738-740).
- **Frontend-side verification:** Frontend verified: my-payments-panel.tsx:19 imports AuthenticatedReceiptPreview and :478-499 renders a <details> 'View receipts (n)' listing each receipt with <AuthenticatedReceiptPreview receipt={...}> at :492-494. Severity minor is right: inspection convenience for re-upload decisions.

### 🟡 Minor · partial — Order list/detail cards lack payment countdown, rejected-proof badge + 'Upload new proof' CTA, and rental stage countdown

**ID:** `cart-checkout:CARTCH-17` · **Area:** Buyer order cards

**Impact:** Mobile buyers lose the at-a-glance urgency (payment deadline ticking) and the rejected-proof shortcut from the order itself; they must find My Payments on their own

- **Frontend evidence:** app/expat/dashboard/page.tsx:2360 - PaymentCountdown on buyer orders with paymentDeadline; :2350 - RentalStageCountdown; :2442 - rejected-proof CTA deep link '?tab=orders&sub=payments&paymentStatus=rejected'
- **Mobile evidence:** lib/screens/orders_screen.dart - grep for Countdown/paymentDeadline/rejected/RentalStage returns no hits; cards show escrow banner (716-765) and delivery-code cards (768-787) only
- **Mobile-side verification:** Grep of orders_screen.dart for Countdown/paymentDeadline/rejected/Rejected/RentalStage/proof/upload new proof returns zero hits (sanity-checked the same file does match escrow/Escrow/deliveryCode: escrow banner at :714-719, _DeliveryCodeCard at :770-778). Order cards carry a normalized status badge (:320 area) but no payment countdown, no rejected-proof badge or deep-link CTA, and no rental stage countdown anywhere in list or detail.
- **Frontend-side verification:** Frontend verified: dashboard/page.tsx:2349-2356 RentalStageCountdown on rental order cards; :2357-2365 PaymentCountdown (compact) for buying-list orders in PENDING/AWAITING_PAYMENT with order.paymentDeadline; :2439-2448 the action CTA links to '/expat/dashboard?tab=orders&sub=payments&paymentStatus=rejected' when paymentNeedsNewProof (:2442). Severity minor is right: at-a-glance urgency/shortcut lost; My Payments surface still exists on mobile.

### 🟡 Minor · missing — Empty-state 'Start Shopping' CTA and the recommendations strip are missing

**ID:** `cart-checkout:CARTCH-18` · **Area:** Cart page

**Impact:** Mobile dead-ends the empty cart and loses the cross-sell strip; users must navigate to browse themselves

- **Frontend evidence:** app/cart/page.tsx:177 - 'Start Shopping' button -> /browse in the empty state; :424-425 - 'These are for you' / 'Featured' recommendations strip
- **Mobile evidence:** lib/screens/cart_screen.dart:132-150 - empty state is icon + copy with no CTA; the file contains no recommendations section (no getAllProductsComplete call)
- **Mobile-side verification:** The empty state (cart_screen.dart:132-150) is icon + 'Your cart is empty' + copy with no button at all; case-insensitive grep of cart_screen.dart for recommend/Featured/'for you'/Start Shopping/browse/getAllProducts returns zero hits, and the file (~530 lines, read in full) contains no recommendation section. The bottom bar still renders with a disabled checkout rather than a CTA.
- **Frontend-side verification:** Frontend verified: cart/page.tsx:172-179 empty state renders the 'Start Shopping' button linking /browse ('Start Shopping' at :177), and :420-433 the recommendations section headed 'These are for you' (:424) / 'Featured' (:425) with a 5-card grid and 'See all' → /browse. Severity minor is right: dead-end empty state plus lost cross-sell — polish/discoverability.

### 🟡 Minor · partial — Condition badge not shown on cart lines

**ID:** `cart-checkout:CARTCH-19` · **Area:** Cart line detail

**Impact:** For products whose condition is not encoded in the choices, mobile buyers cannot see new/used condition before checkout

- **Frontend evidence:** app/cart/page.tsx:272 - ITEM_CONDITIONS badge rendered when selectedChoices has no condition attribute
- **Mobile evidence:** lib/screens/cart_screen.dart:390-400 - line shows only joined choice values; CartItem.condition exists (lib/cart/cart_store.dart:31) but is never rendered in cart or checkout
- **Mobile-side verification:** The cart tile shows only joined choice values (cart_screen.dart:390-400) and the review line likewise (checkout_screen.dart:1543-1547). CartItem.condition exists and round-trips (cart_store.dart:31, :130, :152, passed from product_detail_screen.dart:127) but is never rendered — grep for condition across lib/screens shows uses only in catalog filters, sell flow and admin; zero in cart/checkout UI.
- **Frontend-side verification:** Frontend verified: cart/page.tsx:265-278 renders a condition Badge when `!hasSelectedChoiceAttribute(item.selectedChoices, 'condition') && item.condition`, labeling via the ITEM_CONDITIONS lookup at :272-275. Severity minor is right: small informational gap on lines whose condition is not encoded in choices.

### 🟡 Minor · divergent — No fallback to all items at checkout: zero selection hard-blocks instead of checking out everything

**ID:** `cart-checkout:CARTCH-20` · **Area:** Selection semantics

**Impact:** Web takes a buyer with items but no explicit ticks straight into checkout with everything; mobile blocks until each line is hand-ticked - different flow for the same state

- **Frontend evidence:** app/checkout/checkout-content.tsx:552 - checkoutItems = selectedItemsData.length > 0 ? selectedItemsData : items
- **Mobile evidence:** lib/screens/cart_screen.dart:248-253 - 'Go to checkout' disabled when selectedCount == 0; :185-193 - 'Select at least one item to check out' hint
- **Mobile-side verification:** cart_screen.dart:248-249 disables 'Go to checkout' when cart.selectedCount == 0 and :185-193 shows the 'Select at least one item to check out' hint; CheckoutScreen independently errors 'Your cart is empty.' when _cart.selectedCount is 0 (checkout_screen.dart:288-291). There is no fallback anywhere — checkoutItems is always _cart.selectedItems (checkout_screen.dart:250-254), never items. The all-selected-by-default behavior (CartItem.selected defaults true, cart_store.dart:89) is a different default, not the web's zero-selection fallback.
- **Frontend-side verification:** Frontend verified: checkout-content.tsx:552 `const checkoutItems = selectedItemsData.length > 0 ? selectedItemsData : items` — checkout proceeds with everything when nothing is ticked. Severity minor is right: divergent selection semantics for the same cart state, no money or data risk.

### 🟡 Minor · divergent — Guest cart is memory-only (not inherited at login) and stored carts never expire (no 7-day TTL)

**ID:** `cart-checkout:CARTCH-21` · **Area:** Cart persistence

**Impact:** Mobile guests lose their cart on app restart (web keeps and adopts it at login), and abandoned mobile carts resurface indefinitely instead of aging out after 7 days

- **Frontend evidence:** providers/cart-provider.tsx:252 - CART_EXPIRY_HOURS = 168; :293 - maxAge validity check; :384-403 - guest cart inheritance on login
- **Mobile evidence:** lib/cart/cart_store.dart:235-237 - _persist returns early for guests ('guest cart: memory only'); :210-225 - loadForUser applies no timestamp/age validation
- **Mobile-side verification:** cart_store.dart:235-237 — _persist early-returns for guests ('guest cart: memory only'); main.dart:28-32 guests start with an empty in-memory cart, and on login :36-45 swaps to the user's persisted cart via loadForUser without merging guest items (CartStore has no merge API; reset() drops everything). No TTL: CartItem.toJson (:121-142) writes no timestamp, loadForUser (:210-225) does no age validation, and there is no 168/7-day/expiry constant in the cart code — only the 1-hour proforma windows. Both halves of the claim hold.
- **Frontend-side verification:** Frontend verified: providers/cart-provider.tsx:252 CART_EXPIRY_HOURS = 168 (7 days); :287-304 isCartDataValid rejects carts older than maxAge (:291-295); :379-407 guest-cart inheritance on login — canUseCart accepts cartUserId === 'guest' (:387) and re-stamps the guest cart with setItemImmediate (:402-407). Severity minor is right: persistence-lifetime divergences (guest loss on restart, no TTL) are edge-case annoyances.

### 🟡 Minor · partial — zipCode always empty and currency hardcoded to TZS (no display-currency approximation)

**ID:** `cart-checkout:CARTCH-22` · **Area:** Proforma payload

**Impact:** Address zip never reaches the backend from mobile, and non-TZS display currency with an approximate TZS total (web sidebar note) is unsupported in the buyer flow

- **Frontend evidence:** app/checkout/checkout-content.tsx:1680 - zipCode: shippingAddress.zip; :1699 - currency: selectedCountryData?.currency || 'TZS'; :3903 - 'Approx. TZS {total}' conversion note
- **Mobile evidence:** lib/domain/checkout_proforma.dart:64 and :128 - CheckoutAddressInput.zipCode defaults '' and is sent as zipCode: '' (no zip captured anywhere in the address flow); :135 - currency: 'TZS' hardcoded; lib/domain/currency.dart conversion helpers are used only by the sell flow (lib/screens/sell/sell_wizard_screen.dart:1220)
- **Mobile-side verification:** CheckoutAddressInput.zipCode defaults '' (checkout_proforma.dart:64) and buildBuyDetails sends it as-is (:128); the sole construction site (checkout_screen.dart:394-414) omits zipCode, and neither the checkout address step nor the address sheet captures a zip anywhere. currency is hardcoded 'TZS' (:135). The conversion helpers (toTzs/convertBetween/formatMoney, domain/currency.dart:54-68) are referenced only from sell_form_state.dart and sell_wizard_screen.dart (:1220,1406-1410,1607-1609) — zero buyer-flow usage, no display-currency selection or approximation note.
- **Frontend-side verification:** Frontend verified: checkout-content.tsx:1680 `zipCode: shippingAddress.zip || ''` in the proforma payload, :1699 `currency: selectedCountryData?.currency || 'TZS'` (derived from the selected country, not literally hardcoded as mobile's is), and :3901-3905 the sidebar 'Approx. TZS {total}' note shown when selectedCurrency !== 'TZS'. Severity minor is right: field/precision gaps — zip is auxiliary and the currency note is display-only.

### 🟡 Minor · partial — No blocking 'Processing Order' dialog during proforma creation / payment submit

**ID:** `cart-checkout:CARTCH-23` · **Area:** Submission safety

**Impact:** On mobile the buyer can navigate away mid-submission, risking orphaned 1-hour stock locks that the (broken, CARTCH-02) resume flow cannot recover

- **Frontend evidence:** app/checkout/checkout-content.tsx:4018 - 'Processing Order' AlertDialog ('Please don't close this window or click back') while isProcessing
- **Mobile evidence:** lib/screens/checkout_screen.dart:996-1005 and :1225-1233 - only button spinner + disabled state; no modal, and system-back navigation stays available
- **Mobile-side verification:** checkout_screen.dart contains exactly two dialogs: the expired-invoice dialog (:602) and the cancel-invoice confirm (:654). No 'Processing Order' AlertDialog, no PopScope/WillPopScope/AbsorbPointer/ModalBarrier anywhere in the file (grep verified). During _confirmReview and _submitPayment the only safeguards are the button-level disabled+spinner (:996-1005, :1225-1233); system back and the AppBar remain live, and the IndexedStack keeps all four steps built.
- **Frontend-side verification:** Frontend verified: checkout-content.tsx:4015-4043 an `<AlertDialog open={isProcessing}>` with hidden close button, title 'Processing Order' (:4018) and copy "Please don't close this window or click back." (:4033). Severity minor is right: mobile's button-spinner + disabled state still guards double-submits; the modal adds back-navigation safety, which matters mainly in combination with the broken resume path.

### 🟡 Minor · BROKEN — 'Order' button uses Navigator.pushNamed, which cannot resolve routes under MaterialApp.router

**ID:** `cart-checkout:CARTCH-24` · **Area:** My Payments navigation

**Impact:** Tapping 'Order' on a non-resumable payment throws instead of opening the order, unlike web's working link

- **Frontend evidence:** components/dashboard/my-payments-panel.tsx:389-391 - Order row links to /orders/{orderIds[0]}
- **Mobile evidence:** lib/screens/my_payments_screen.dart:666-668 - Navigator.of(context).pushNamed('/orders/...'); lib/main.dart:57 - MaterialApp.router with no routes map; lib/screens/checkout_screen.dart:1688-1690 documents this exact pattern failing ('GoRouter owns these paths and MaterialApp has no routes map, so Navigator.pushNamed threw')
- **Mobile-side verification:** my_payments_screen.dart:666-668 uses Navigator.of(context).pushNamed('/orders/${payment.orderIds.first}'); main.dart:57-63 builds MaterialApp.router with routerConfig only — no routes map, no onGenerateRoute. The repo documents this exact failure itself: checkout_screen.dart:1688-1689 'GoRouter owns these paths and MaterialApp has no routes map, so Navigator.pushNamed threw instead of navigating' (which is why that button uses context.push). Note the same latent bug exists in the checkout logged-out gate (checkout_screen.dart:716 pushNamed('/login')), reinforcing the pattern. Nothing on the 'Order' button path converts to a GoRouter push.
- **Frontend-side verification:** Frontend verified: my-payments-panel.tsx:388-396 — the non-resumable branch renders an asChild Button wrapping <Link href={`/orders/${payment.orderIds[0]}`}> with the 'Order' label (:391-394), i.e. a working next/link. Severity minor is right: a single broken button on mobile's payment card.

### 🟡 Minor · divergent — /checkout/success renders a payment form (with sandbox disclaimer), not the order-confirmation page; 'View Order Details' is a SnackBar

**ID:** `cart-checkout:CARTCH-25` · **Area:** Order confirmation page

**Impact:** Mobile lacks the post-order confirmation surface (order number copy, per-seller items, platform payment details for awaiting-payment orders, support link), and its success-page button does nothing but toast

- **Frontend evidence:** app/checkout/success/page.tsx:283 and :376 - awaiting-payment detection + PlatformPaymentDetails on the order confirmation page; per-seller item cards and Contact Support per inventory 1.24
- **Mobile evidence:** lib/app_router.dart:172-177 - /checkout/success builds PaymentScreen; lib/screens/payment_screen.dart:181-186 - 'This sandbox runs...' disclaimer paragraph in the production UI; :233-241 - 'View Order Details' only shows a SnackBar with the order reference (no navigation)
- **Mobile-side verification:** app_router.dart:172-177 maps /checkout/success to PaymentScreen(proformaId: query param) — verified; payment_screen.dart:181-186 renders the 'This sandbox runs…' disclaimer in the pre-submit UI and :233-241 'View Order Details' only shows a SnackBar with the order reference (no navigation). Context notes that do not refute the claim: nothing in-app navigates to /checkout/success (it is deep-link-only), and the 4-step checkout's own completion step (checkout_screen.dart:735, _CompletionStep) does offer View Order Details → OrderDetailScreen — but the /checkout/success surface itself has no order confirmation, per-seller items, or platform payment details.
- **Frontend-side verification:** Frontend verified: success/page.tsx:283 `const awaitingPayment = isOrderAwaitingPayment(orderData.status, orderData.paymentStatus)`; :375-377 renders <PlatformPaymentDetails orderReference> when awaitingPayment; the page also has order-number code + copy button (:389-396), 'Contact Support' → /contact (:400-406), and per-seller item grouping — none of which mobile's PaymentScreen reroute offers. Severity minor is right: a confirmation-surface divergence; the order itself exists and is reachable via dashboard/orders.

### 🟡 Minor · missing — 'Current Cart' overview card with one-tap checkout is absent from the mobile dashboard

**ID:** `cart-checkout:CARTCH-26` · **Area:** Buyer dashboard overview

**Impact:** Mobile buyers lose the at-a-glance cart snapshot and its direct checkout entry from the dashboard

- **Frontend evidence:** app/expat/dashboard/page.tsx:3991-3996 - 'Current Cart ({n} items)' card in the buyer overview with Proceed to Checkout
- **Mobile evidence:** lib/screens/delivery_dashboard_screens.dart:645-669 - _BuyingTab offers only orders/payments sub-tabs and the five-tab dashboard (:431-498) has no cart card; grep for 'Current Cart'/'Proceed to Checkout' across lib/screens/ returns no hits
- **Mobile-side verification:** ExpatDashboardScreen (delivery_dashboard_screens.dart:435-508) is the five-tab Overview/Selling/Buying/Saved/Requests hub; _OverviewTab (:510+, stats + Sell CTA) has no cart card, and _BuyingTab (:649-699) offers only Orders/Payments sub-tabs. Repo-wide grep for 'Current Cart'/'Proceed to Checkout' (case-insensitive) returns zero hits. Nothing in the dashboard reads CartStore.
- **Frontend-side verification:** Frontend verified: dashboard/page.tsx:3991-3996 the buyer-overview 'Current Cart ({cartItemCount} items)' CardTitle, first-5 cart item rows (:4000-4031), Cart Total (:4049-4053) and the full-width 'Proceed to Checkout' Link → /checkout (:4055-4057), plus the empty-cart 'Browse Products' state (:4039-4044). Severity minor is right: a dashboard convenience card, not a flow dependency.

### 🟡 Minor · missing — Matomo ecommerce events (add_to_cart, purchase) are never fired on mobile

**ID:** `cart-checkout:CARTCH-27` · **Area:** Ecommerce analytics

**Impact:** Cart-to-purchase funnel analytics have no mobile coverage, so conversion reporting undercounts app users

- **Frontend evidence:** providers/cart-provider.tsx:634-636 and :778-780 - window._mtm.push add_to_cart events; app/checkout/success/page.tsx:80-90 - deduped purchase event
- **Mobile evidence:** lib/api/api_client.dart:1123-1129 - the only Matomo integration is a read-only matomoQuery client; grep for _mtm/add_to_cart across lib/ returns no event pushes
- **Mobile-side verification:** The only Matomo integration on mobile is the read-only matomoQuery client (api_client.dart:1123-1152, GET API methods with token_auth) consumed exclusively by the admin Insights screen (insights_screen.dart:32-65). Grep for _mtm/add_to_cart/ecommerce/purchase-event pushes returns zero hits, and pubspec.yaml has no analytics/Matomo SDK. No add-to-cart or purchase events are ever sent from the mobile app.
- **Frontend-side verification:** Frontend verified: providers/cart-provider.tsx:634-650 pushes window._mtm add_to_cart on quantity increase and :778-794 on item add (payload {item_id, item_name, item_category, item_price, quantity, total}); success/page.tsx:74-102 trackConfirmedPurchase pushes the deduped 'purchase' event only when status 'confirmed' or paymentStatus contains 'completed'. Severity minor is right: analytics coverage gap with no user-facing effect.

<details><summary><strong>Confirmed equivalent in both apps (23)</strong></summary>

- Client-side cart persisted per user under expatCartItems_{email} via KvStore (lib/cart/cart_store.dart:177-242), mirroring web's localStorage cart; per-user isolation on login/reset
- Choice-aware + rental-aware line identity (p{id}|d{def}:{val} sorted|r{rental signature}) so different choices/bookings are separate lines (cart_store.dart:93-102), with merge-on-same-line and Buy Now overwrite semantics
- Cart grouped by seller with letter avatar, verified badge, 'Ships from {location}' (cart_screen.dart:282-323); per-line selection checkbox drives subtotal and the checkout gate
- Quantity stepper minus disabled at 1, plus capped by fresh stock from GET /displayItem/itemDetails/{id} revalidated on cart open, with silent stock shrink/remove banner and 'Only N units are available' over-cap rejection (cart_screen.dart:61-103, 424-448)
- Save-for-later (login-gated) then remove-from-cart, and immediate remove, matching web's flow (cart_screen.dart:461-498)
- Checkout is a 4-step machine (Address/Review/Payment/Done) with read-only first/last/email prefilled from userManagement/user-details and phone preferring whatsAppPhoneNumber || phoneNumber (checkout_screen.dart:162-201)
- Saved-address dropdown with default preselect (isDefault else first) locking delivery lat/lng, plus non-fatal free-text fallback when no addresses exist (checkout_screen.dart:205-231, 787-840)
- Fulfillment radios SELLER_DELIVERY (default) / BUYER_PICKUP with fee 0 and quote skip in pickup mode (checkout_screen.dart:281-293, 844-857)
- Server delivery quote POST /api/v1/checkout/delivery-quote per seller group, consolidated fee charged once per group, 20s watchdog -> CALCULATION_TIMEOUT, 8-reason failure taxonomy with web-identical short labels, buyer-fixable/seller-fixable action buttons and retry (checkout_screen.dart:296-357; lib/domain/delivery_quote.dart)
- Multi-select Today/Tomorrow x Morning/Afternoon/Evening windows computed in EAT (UTC+3), shifted by maximumProductionTimeDays with 'Earliest ·' dating, past windows excluded from the payload, first window mirrored to preferredDeliveryDate/Slot (lib/domain/delivery_windows.dart)
- buyDetails payload invariants match web: real enums only, state:'', address = street+neighbourhood join, lat/lng keys always present, agreeToTerms, deliveryFee = quoted or 0, totalAmount = round2(subtotal+fee), deliveryInstructions:'' (lib/domain/checkout_proforma.dart:81-142)
- Items payload {productId, quantity>=1, selectedChoices, rentalBooking} incl. full rental billing fields (checkout_proforma.dart:146-159)
- Authoritative price guard: |grandTotal - reviewedTotal| > 0.01 cancels the proforma, resyncs cart unit prices from sellerGroups[].items[].unitPrice (first wins), refetches the quote and asks the buyer to re-confirm (checkout_screen.dart:429-447; checkout_proforma.dart:163-186)
- Proforma creation with durable snapshot-before-clear (proforma_cart_snapshot + proforma_{id} written before cart.clear()), cart cleared after creation, order_{id}/lastOrderId persisted on submit (checkout_screen.dart:449-469, 576-598)
- Payment step shows byte-identical Selcom receiving details (Bank 5527108094688 / Lipa Namba 7003 9305 / GloboExpats Limited), method chips with MOBILE_MONEY default (same as web checkout-content.tsx:514), payment reference = proformaNumber, <=5 receipts x 5MB guards, confirmation tick, green escrow-protection box, 30-minute verification copy, submit branching only on status == PAYMENT_SUBMITTED, cancel-invoice confirm dialog releasing stock (checkout_screen.dart:1018-1276)
- Proforma countdown: 1s tick, urgent <3h, expired tone with web's 'Please re-order' copy, rendered only while PENDING_PAYMENT; PROFORMA_EXPIRED on submit opens the expired dialog (checkout_screen.dart:601-646, 1764-1833; lib/domain/countdown.dart)
- Proforma creation failure mapping for ACCOUNT_BLOCKED / INSUFFICIENT_STOCK / BUYER_PROFILE_SETUP_FAILED / CHECKOUT_DATA_INVALID identical to web's handler (checkout_proforma.dart:217-234)
- My Payments panel: four group tabs with counts, web-identical recovery precedence (replacement SUBMITTED receipt outranks older REJECTED; CONFIRMED/VERIFIED -> Approved; EXPIRED/CANCELLED -> Expired), 'Action needed - new proof' badge override, 48h correction-deadline math (explicit field > rejectedAt+48h > max receipt stamp +48h), per-receipt rejection reasons, re-upload that restarts review and surfaces CORRECTION_WINDOW_CLOSED, 'Continue payment' for PENDING_PAYMENT, 30s now-ticker, and fetch-failure-is-not-empty state (lib/screens/my_payments_screen.dart)
- Address book CRUD with default selection, delete confirm dialog, and a map pin picker (search, current location, drag pin, reverse geocode) feeding checkout coordinates (lib/screens/addresses_screen.dart, lib/widgets/map_location_picker.dart, lib/services/geocoding_service.dart)
- Buyer order detail shows the escrow state banner mapping, delivery OTP card while IN_TRANSIT, rental handoff code + regenerate while AWAITING_PICKUP, Confirm Received / Rate Seller via confirm-receipt {rating, comment}, and dispatch blocker hints + unlock labels (lib/screens/orders_screen.dart:416-628, 716-931)
- Made-to-order handling: maximumProductionTimeDays across selected lines shifts windows and is captured into the invoice for the payment-step 'Made-to-order production' notice after the cart is cleared (checkout_screen.dart:108-125, 1035-1061)
- Timestamps parsed defensively (ISO/offset, naive, Jackson arrays, epoch) with all window/deadline math pinned to EAT regardless of device timezone (lib/domain/time_utils.dart)
- Add-to-cart entry guards on the product screen (self-purchase, out-of-stock, login gate, rental-range completeness, cap rejection) with Buy Now jumping straight into checkout (mobile inventory §8.130; cart/checkout contracts verified in cart_store.dart)

</details>


## Community request board

### 🔴 CRITICAL · missing — Owner cannot see or act on nudges: no nudge inbox, no responses panel, no fulfill-by-nudge

**ID:** `requests:REQUES-01` · **Area:** Owner responses / nudge inbox

**Impact:** The core request->response->accept loop is broken on mobile: responders can send nudges but the owner has no surface to see them, contact responders, or accept an offer, and the web's fulfill-by-nudge flow (adds matched product to cart and goes to checkout) does not exist. Service-request matching is effectively dead-ended.

- **Frontend evidence:** components/request-board/nudge-inbox.tsx:120 - owner nudge list dialog with per-nudge responder rows (WhatsApp/tel contact, product links, legacy SERVICE_OFFER_V1 parsing at :125); components/request-board/request-nudge-panel.tsx:174 - owner accepts an offer via fulfillRequestByNudge, :150 builds a cart item (productToCartItem) and goes to checkout; lib/request-board-api.ts:338,345 - fetchNudgesForRequest + markNudgesRead; lib/request-board-api.ts:214-221 - fulfillRequestByNudge with FULFILL_BY_NUDGE_UNAVAILABLE sentinel
- **Mobile evidence:** lib/api/api_client.dart:1399 - fetchRequestNudges (GET /{id}/nudges) is defined but has zero callers and no mark-read method; lib/screens/requests_screen.dart:365-423 - detail screen builds only the owner Edit/Fulfil/Close/Delete row or a single nudge button; there is no responses UI, no unread count, and no path to fulfill from a nudge (searched lib/ for callers)
- **Mobile-side verification:** Exhaustive search (grep 'nudge|Nudge' across all of lib/ + test/, plus 'fetchRequestNudges', 'markNudgesRead', 'fulfillRequestByNudge', 'unreadNudge') found zero callers of fetchRequestNudges (lib/api/api_client.dart:1399-1405 - definition only) and no mark-read method. The only nudge UI in the app is the responder's button (lib/screens/requests_screen.dart:416-423, 439-464); the owner actions row (requests_screen.dart:365-414) is Edit/Fulfil/Close/Delete only. The MySpace dashboard 'Requests' tab embeds the same public feed (lib/screens/delivery_dashboard_screens.dart:483-500), not an inbox. No fulfill-by-nudge or checkout handoff exists. Critical is justified: the response loop is dead-ended on mobile.
- **Frontend-side verification:** Frontend evidence checks out. nudge-inbox.tsx:120 is the 'No nudges yet.' empty state; the per-nudge responder rows with WhatsApp/tel buttons are :123-233 (contact buttons :179-197) and legacy SERVICE_OFFER_V1 recovery via parseServiceOffer at :125. request-nudge-panel.tsx:174 is exactly `await fulfillRequestByNudge(requestId, nudge.id)` and :150 exactly `productToCartItem({...})` with addToCart+router.push('/checkout') at :176/:185. request-board-api.ts:338 fetchNudgesForRequest, :345 markNudgesRead, :214-223 fulfillRequestByNudge with FULFILL_BY_NUDGE_UNAVAILABLE sentinel at :220-222. Critical is right: this is the core request->response->accept loop and includes a cart+checkout (money) path.

### 🟠 Major · partial — Nudge is a hardcoded one-shot POST: no product match, no service-offer form, no edit-my-nudge, no 'post it first' intent

**ID:** `requests:REQUES-02` · **Area:** Nudge composer

**Impact:** Responders cannot attach a listing (the commerce driver of goods requests) or share contact details via a service offer (the entire point of service requests), cannot edit or personalize their message, and the sell-form nudge-intent handoff is absent. Nudges sent from mobile carry nudgeType GENERAL, which web's inbox type labels treat as legacy.

- **Frontend evidence:** components/request-board/nudge-dialog.tsx:306 - SERVICE_OFFER payload with providerName/serviceCategory/location/contact + consent checkbox (fields at :411-448); :338,362 - PRODUCT_MATCH payload with productId from listing search or pasted product link (:564 'Search your listings or paste a product link...', parseProductId :64); :327,400 - GET my-nudge prefill and edit mode ('Update Nudge'/'Update Offer' :654-663); :661 - 'Continue to Post' flow saving pending_request_nudge_intent
- **Mobile evidence:** lib/api/api_client.dart:1354-1355 - nudgeRequest hardcodes message 'I can help with this!' and nudgeType 'GENERAL' (productId param exists but is never used); lib/screens/requests_screen.dart:448 - `_api.nudgeRequest(token, _id)` sends with no composer; no my-nudge (GET) or nudge-update (PUT) method exists in lib/api/api_client.dart (searched 'my-nudge', 'nudge/read')
- **Mobile-side verification:** nudgeRequest hardcodes message 'I can help with this!' and nudgeType 'GENERAL' (lib/api/api_client.dart:1354-1355); sole call site is lib/screens/requests_screen.dart:448 with no composer. Read the entire request-board client section (api_client.dart:1303-1405) - no my-nudge GET, no nudge PUT. Grep 'my-nudge|SERVICE_OFFER|PRODUCT_MATCH|pending_request_nudge' returns only the notification-type check at lib/domain/notification_feed.dart:131. The productId param exists but no caller passes it.
- **Frontend-side verification:** All described frontend behavior exists: SERVICE_OFFER payload with serviceOffer{providerName,serviceCategory,location,contact} at nudge-dialog.tsx:305-314 plus consent checkbox :476-485 (fields :410-461, cite '411-448' close); PRODUCT_MATCH payload with productId at :352-362 and :338 (pending intent); listing search/paste-link input placeholder :564 with parseProductId :64-73; my-nudge prefill/edit mode (fetchMyNudge :218, editing banner :398-402, 'Update Nudge'/'Update Offer' :652-657 - cited :327/:400 are approximate but the behavior is real); 'Continue to Post' label :661 with the flow saving pending_request_nudge_intent at :329-349 (key confirmed in lib/request-nudge-intent.ts:3, sessionStorage.removeItem('sell_form_draft') :346, router.push('/sell?requestNudge=1') :348). Major is right: this is the responder-side commerce/contact composer.

### 🟠 Major · divergent — Fulfill flow divergent: web links a completed buying order or marks outside-platform; mobile fulfills with any of the owner's own listings

**ID:** `requests:REQUES-03` · **Area:** Owner fulfill flow

**Impact:** Mobile lets an owner mark a request fulfilled with an arbitrary listing that may never have been sold to the requester, corrupting the fulfillment record web ties to a delivered/completed order; the outside-GloboExpats option and its 'Coming soon' sentinel handling are absent, and the picker silently truncates at 20 listings.

- **Frontend evidence:** components/request-board/fulfill-choice-dialog.tsx:44,58,77 - 'How was ... fulfilled?' choice between 'Through GloboExpats' and 'Outside GloboExpats'; components/request-board/fulfill-request-dialog.tsx:43-44 - options extracted from apiClient.getOrders() via extractCompletedBuyingOrderProducts (DELIVERED/COMPLETED buying orders only, dedup by orderId:productId); lib/request-board-api.ts:231 - fulfillRequestOutside sends {source:'EXTERNAL'}
- **Mobile evidence:** lib/screens/requests_screen.dart:287-336 - _fulfillWithProduct lists the owner's own products from getUserDetails (any listing regardless of any order relationship), :309 caps at products.take(20); comment :285-286 states the outside-platform path 'stays web-only'; lib/api/api_client.dart:1389-1392 - fulfillRequest only ever sends {productId}
- **Mobile-side verification:** _fulfillWithProduct (lib/screens/requests_screen.dart:287-336) lists the owner's own products from getUserDetails with no order/delivered-order linkage, caps products.take(20) at :309, and PATCHes only {productId} (lib/api/api_client.dart:1389-1392). Comment :284-286 explicitly says the outside-platform sentinel 'stays web-only'. No choice dialog, no EXTERNAL source, no extractCompletedBuyingOrderProducts equivalent anywhere (grep 'EXTERNAL|fulfillRequestByNudge' - no match).
- **Frontend-side verification:** Verified: fulfill-choice-dialog.tsx:44 'How was ... fulfilled?', :58 'Through GloboExpats', :77 'Outside GloboExpats' with spinner-while-submitting :71-72. fulfill-request-dialog.tsx:42-44 apiClient.getOrders() -> extractCompletedBuyingOrderProducts; lib/request-board-order-utils.ts confirms DELIVERED/COMPLETED only (:66), orderType 'buying' only (:69), CONFIRMED->COMPLETED (:9), dedup key orderId:productId (:80-82). request-board-api.ts:231-238 fulfillRequestOutside sends {source:'EXTERNAL'} (:235). Major (divergent fulfill semantics) is right.

### 🟠 Major · BROKEN — Status vocabulary mismatch: mobile filters and colors use OPEN, while the data model and gating use PENDING

**ID:** `requests:REQUES-04` · **Area:** Status model / filters

**Impact:** Filtering the feed by its own 'Open' option diverges from the backend status set the rest of the app codes against; a PENDING request cannot be filtered for; FULFILLED and CLOSED requests are visually indistinguishable from PENDING (all orange), and no distinct fulfilled/closed treatment exists.

- **Frontend evidence:** components/request-board/request-feed.tsx:89-91 - status filter options PENDING/FULFILLED/CLOSED; lib/request-board-types.ts:3 - RequestStatus = 'PENDING' | 'FULFILLED' | 'CLOSED'; components/request-board/request-card.tsx:102 - nudge shown only when request.status === 'PENDING'
- **Mobile evidence:** lib/screens/requests_screen.dart:94 - status dropdown offers 'OPEN' (no PENDING option) so the live state cannot be filtered; :472-473 - status chip paints only OPEN/ACTIVE green and renders PENDING/FULFILLED/CLOSED/EXPIRED all in the same orange palette; :419,365 - nudge and all owner actions are gated on raw status == 'PENDING' exactly
- **Mobile-side verification:** Status dropdown offers only OPEN/FULFILLED/CLOSED (lib/screens/requests_screen.dart:93-97) - no PENDING item; _Status paints green only for OPEN/ACTIVE and everything else (PENDING/FULFILLED/CLOSED/EXPIRED) the same orange (:471-478); nudge (:419) and all owner actions (:365) gate on raw 'PENDING' exactly. The internal vocabulary mismatch is real as coded: the UI's own 'Open' filter produces a live state whose nudge/owner actions are permanently disabled, and PENDING cannot be filtered for.
- **Frontend-side verification:** request-feed.tsx:89-91 are exactly the PENDING/FULFILLED/CLOSED status filter options; lib/request-board-types.ts:3 is exactly RequestStatus = 'PENDING' | 'FULFILLED' | 'CLOSED'; request-card.tsx:102 is exactly `const canNudge = Boolean(!isOwner && request.status === 'PENDING')`. Web also renders distinct status treatments (request-card.tsx:45-52 default/secondary/destructive; detail page.tsx:82-86 blue/green/red), so the described divergence is real. Major is right.

### 🟠 Major · missing — No pagination or infinite scroll: only the first 20 requests are reachable

**ID:** `requests:REQUES-05` · **Area:** Feed pagination

**Impact:** On any board with more than 20 matching requests, everything past the first page is unreachable on mobile; users and their own older requests become invisible as the board grows.

- **Frontend evidence:** components/request-board/request-feed.tsx:445 - IntersectionObserver sentinel (rootMargin 500px) appends pages while page+1 < totalPages, with loading and end-of-feed messaging; lib/request-board-api.ts:114 - fetchRequestFeed takes page/size with appendPages de-dup
- **Mobile evidence:** lib/screens/requests_screen.dart:36-40 - _load() calls fetchRequestsFiltered without page/size; lib/api/api_client.dart:1310 - page=0, size=20 are hardcoded defaults and no load-more/scroll-sentinel exists anywhere in the screen (verified full read)
- **Mobile-side verification:** fetchRequestsFiltered defaults page=0, size=20 (lib/api/api_client.dart:1310) and _load() passes no paging (lib/screens/requests_screen.dart:36-40); the ListView.separated (:116-152) has no ScrollController, sentinel or load-more (full read). Notably the codebase does implement infinite scroll for browse (lib/screens/catalog_screens.dart:447, 524, 559), so the pattern exists in-repo but was never applied to requests - the gap is real, not a search miss.
- **Frontend-side verification:** IntersectionObserver sentinel at request-feed.tsx:443-455 with rootMargin '500px 0px' (:451), gated on canLoadMore = page+1 < feed.totalPages (:435), 'Loading more requests...' :631-636 and 'You've reached the end of the Request Hub.' :638-642. Small citation nit: the appendPages de-dup lives in hooks/use-request-board.ts:86-101 (seen-Set filter), while lib/request-board-api.ts:114 fetchRequestFeed indeed takes page/size; the described pagination behavior is otherwise exactly as claimed. Major is right (content past page 1 unreachable on mobile).

### 🟠 Major · missing — No 'My Requests' list: no my-requests endpoint, no owner-scoped tab, no Prev/Next pagination of own posts

**ID:** `requests:REQUES-06` · **Area:** My Requests management

**Impact:** Owners cannot list or manage the requests they posted; they must find each post in the global feed (within the first 20 items) to reach the detail screen's owner actions. The web's unread-nudge badge on My Requests is also unreachable since the underlying endpoint is never called.

- **Frontend evidence:** lib/request-board-api.ts:141 - fetchMyRequests (GET /request-board/my-requests); components/request-board/request-board-tab.tsx:227 - dedicated 'My Requests' tab with status filter, paginated grid (:302-314 Prev/Page X of Y/Next) and per-request edit/fulfill/delete dialogs (:327-403)
- **Mobile evidence:** lib/api/api_client.dart:1307-1328 - the only feed method is the public filtered feed; no my-requests request exists in the client (searched 'my-requests': no match); lib/screens/requests_screen.dart:121-150 - the single feed renders all community requests with no owner-scoped list or pagination controls
- **Mobile-side verification:** Grep 'my-requests|myRequests|fetchMyRequests' across lib/ and test/ - no match. The only feed methods are the public fetchRequests (api_client.dart:1287) and fetchRequestsFiltered (:1307-1328). The dashboard 'Requests' tab (delivery_dashboard_screens.dart:500) renders the same public RequestsScreen, not an owner-scoped list; no Prev/Next pagination exists anywhere in the request domain.
- **Frontend-side verification:** fetchMyRequests at request-board-api.ts:141-155 (GET /request-board/my-requests). RequestBoardTab: 'My Requests' heading at :227 with unread 'N new' badge :228-232 (fed by fetchUnreadNudgeCount :83-88), status filter :241-252, Prev/'Page X of Y'/Next at :293-317 (cited 302-314 matches), and per-request edit/fulfill/delete dialogs at :319-407. Major is right: it is the owner management surface.

### 🟠 Major · missing — Request photos are never displayed: no images on feed cards, no gallery on the detail page

**ID:** `requests:REQUES-07` · **Area:** Request images display

**Impact:** Photos are mandatory content for goods requests on web (at least one required), so mobile presents goods requests with their primary content stripped; posters get no confirmation of what they uploaded and browsers lose the visual context that drives nudges.

- **Frontend evidence:** app/request/[id]/page.tsx:137,492-539 - imageUrls gallery card with prev/next arrows, counter and ImagePreviewModal; components/request-board/request-card.tsx:239 - card image block on feed cards
- **Mobile evidence:** lib/screens/requests_screen.dart:124-149 - feed card renders only title, status chip, poster name and category/location/budget chips (no Image widget); lib/screens/requests_screen.dart:343-425 - detail ListView contains title, fields, description and action buttons with no image section (verified full read)
- **Mobile-side verification:** Full read of lib/screens/requests_screen.dart: feed card (:124-148) renders only title, _Status, userName and category/location/budget chips - no Image widget; detail ListView (:343-425) has no image section; the _Req accessor (:483-502) exposes no imageUrls field. Repo-wide grep 'imageUrls' - zero matches in lib/. Photos are captured at create (create_request_screen.dart:279-311) but never displayed anywhere.
- **Frontend-side verification:** Detail page: `const images = request?.imageUrls ?? []` at page.tsx:137; gallery card :489-555 with prev/next arrows :513-536, counter '{currentImage+1}/{images.length}' :537-540, and ImagePreviewModal mounted :803-810. Feed card image block at request-card.tsx:238-269 (cited :239 is the carousel container). Major is right: photos are mandatory for goods requests on web (create-modal :294-296), so mobile strips primary content.

### 🟠 Major · divergent — Saved-address flow replaced by a free-text optional field defaulting 'Dar es Salaam'; neighbourhood-only privacy rule not applied

**ID:** `requests:REQUES-08` · **Area:** Location / address handling

**Impact:** Mobile posters get no saved-address picker and the privacy parsing that reduces the published value to a neighbourhood/region is skipped - whatever the user types (e.g. a full street) becomes the public location. Requests also lose the correct geographic anchoring the address book provided on web.

- **Frontend evidence:** components/request-board/create-request-modal.tsx:583 - 'Select From Saved Addresses' section with address select, flag card and Manage link; :70 - public location value is splitStreetAndNeighbourhood(address.street).neighbourhood (or region); :676 - 'Only the neighbourhood or region is shown publicly.'; :96 - profile fallback neighbourhood/region
- **Mobile evidence:** lib/screens/create_request_screen.dart:33 - `_location` TextEditingController prefilled with the literal 'Dar es Salaam'; :147 - raw `_location.text.trim()` is sent as the public location; :229-232 - plain optional TextFormField with no address book, no neighbourhood parsing, no derivable-location validation
- **Mobile-side verification:** lib/screens/create_request_screen.dart:33 prefills `_location = TextEditingController(text: 'Dar es Salaam')`; the raw trimmed text is sent as the public location (:147); the field is a plain optional TextFormField (:229-232). The repo does have saved-address and neighbourhood infrastructure (addresses_screen.dart, joinStreetAndNeighbourhood in lib/domain/checkout_proforma.dart:239, address picker in sell_wizard_screen.dart:734) but none of it is wired into the request form - no picker, no neighbourhood/region-only privacy parsing, no validation.
- **Frontend-side verification:** All four citations exact: create-request-modal.tsx:583 'Select From Saved Addresses'; :69-70 getPublicAddressLabel = splitStreetAndNeighbourhood(address.street).neighbourhood || address.region; :675-677 'Only the neighbourhood or region is shown publicly.'; :95-96 profile fallback neighbourhood/region. The address select (:608-637), flag card (:639-660) and Manage link (:590-595) are all present. Major is right (privacy rule and geo-anchoring both lost on mobile).

### 🟠 Major · missing — canSell/verification gate absent: any logged-in (even unverified) user can create, edit and nudge

**ID:** `requests:REQUES-09` · **Area:** Verification gating

**Impact:** A business rule enforced on web (only verified sellers create requests or respond) is not enforced on mobile, so unverified accounts can post requests and send nudges that web would block, producing content/notifications the platform otherwise gates.

- **Frontend evidence:** components/request-board/request-feed.tsx:335-338 - 'Verification Required' toast + router.push('/account/verification') for unverified users; :346 - New Request blocked when !canSell; components/request-board/create-request-modal.tsx:262 - 'Verify your account before creating a request.'; nudge-dialog.tsx:280 - 'Verify your account before responding to a request.'
- **Mobile evidence:** lib/screens/create_request_screen.dart:134-137 - submit checks only `AuthStore.instance?.token` ('Log in to post a request.'); lib/screens/requests_screen.dart:440-445 - nudge checks only the token ('Log in to nudge the requester.'); searched lib/ for canSell/verificationStatus in the request domain: no verification check exists anywhere
- **Mobile-side verification:** Grep 'canSell' across lib/ - zero matches; 'verificationStatus' appears only in an unrelated comment (lib/screens/verification_hub_screen.dart:13). Create submit checks only AuthStore.instance?.token (create_request_screen.dart:134-137, inline 'Log in to post a request.'); nudge checks only the token (requests_screen.dart:440-445). No verification gate exists anywhere in the request domain.
- **Frontend-side verification:** request-feed.tsx:333-339 requireVerification: 'Verification Required' toast + router.push('/account/verification') (:338); :346 `if (!canSell)` blocks New Request. create-request-modal.tsx:261-263 'Verify your account before creating a request.'; nudge-dialog.tsx:280-282 'Verify your account before responding to a request.' All exact. Also enforced in the hook (use-request-board.ts:116-118, 163-165) and request-board-tab.tsx:110-117. Major is right.

### 🟠 Major · divergent — Category lists hardcoded on mobile and the service taxonomy diverges from the platform constant

**ID:** `requests:REQUES-10` · **Area:** Category taxonomy

**Impact:** Service requests created on mobile carry category values that do not exist in the web taxonomy, so they cannot be matched/filtered consistently with web-created requests; goods categories are frozen in code and will drift as the platform category list changes.

- **Frontend evidence:** lib/request-board-types.ts:6-17 - SERVICE_REQUEST_CATEGORIES = Tailor, Hair & Beauty, House Help, IT Support, Repairs, Transport, Tutoring, Cleaning, Health & Wellness, Other; components/request-board/create-request-modal.tsx:510 - service Select maps this constant (goods categories come from the platform categories API)
- **Mobile evidence:** lib/screens/create_request_screen.dart:75-82 - hardcoded `_goodsCategories` (Electronics, Furniture, Clothing, Vehicles & Supplies, Home & Kitchen Appliances, Beauty & Personal Care, Other) and `_serviceCategories` (Cleaning, Moving & Transport, Repairs, Tutoring, Personal Care, Other) - Tailor, Hair & Beauty, House Help, IT Support, Health & Wellness are absent; 'Personal Care' and 'Moving & Transport' do not exist in the web list
- **Mobile-side verification:** Hardcoded lists at lib/screens/create_request_screen.dart:75-82. Cross-checked the web constant SERVICE_REQUEST_CATEGORIES (GloboExpats_Frontend/lib/request-board-types.ts:6-17): mobile is missing Tailor, Hair & Beauty, House Help, IT Support, Health & Wellness and adds 'Moving & Transport' and 'Personal Care', which do not exist in the web list; goods categories are also frozen in Dart code rather than fetched from the categories API.
- **Frontend-side verification:** lib/request-board-types.ts:6-17 is exactly SERVICE_REQUEST_CATEGORIES = Tailor, Hair & Beauty, House Help, IT Support, Repairs, Transport, Tutoring, Cleaning, Health & Wellness, Other; create-request-modal.tsx:510 maps that constant in the service Select while goods categories come from apiClient.getCategories() (passed from request-feed.tsx:299-301). Major is right: taxonomy values created on mobile would not match web-created requests for matching/filtering.

### 🟠 Major · BROKEN — REQUEST_* notifications never navigate to the request: no /request/:id mapping in the action-URL resolver

**ID:** `requests:REQUES-11` · **Area:** Request notifications

**Impact:** A nudge or request notification on mobile is a dead end: tapping it marks it read and the owner is never taken to the request or its responses, so the notification - the only surface that hints at responses on mobile - leads nowhere.

- **Frontend evidence:** components/request-nudge-notifications.tsx:84-98 - '{n} new nudges on {title}' cards with a 'View Nudges' button that takes the owner to the request detail; badge count folds in fetchUnreadNudgeCount (:27)
- **Mobile evidence:** lib/domain/notification_feed.dart:230-255 - notificationActionUrl maps only logistics edits, payments and ORDER/RATING referenceIds; REQUEST_* types fall through to the raw actionUrl at :254, which safeNotificationActionUrl (:99-104) drops when absent, returning null; lib/screens/account_misc_screens.dart:105-124 - a null target just marks the row read and reloads (no navigation)
- **Mobile-side verification:** notificationActionUrl (lib/domain/notification_feed.dart:230-255) maps only logistics-edit referenceIds, payment-filter rows, and ORDER|RATING-typed referenceIds; REQUEST_* falls through to raw actionUrl (:254), which safeNotificationActionUrl (:99-104) drops unless it is a rooted same-origin path. _open with a null target just marks read and reloads (lib/screens/account_misc_screens.dart:105-124). Ironic corroboration: the router DOES have /request/:id (lib/app_router.dart:195-200) - the resolver simply never maps REQUEST_* types to it.
- **Frontend-side verification:** request-nudge-notifications.tsx:83-100: '{n} new nudge(s) on {title}' card with status badge and 'View Nudges' Link to the request detail; copy at :92-94. Citation nit: the badge fold lives in hooks/use-notifications.ts:94 (fetchUnreadNudgeCount in the parallel fetch) and :128 (nudgeUnread + ...), while the component's own :27 call feeds its local unread count - the folded-badge behavior is real regardless. Major is right: on mobile the notification is a dead end.

### 🟡 Minor · divergent — Goods requests allow zero images; 'at least one image' rule not enforced

**ID:** `requests:REQUES-12` · **Area:** Create form - goods images

**Impact:** Image-less goods requests can be created from mobile, diverging from the web data contract and producing posts that web then renders without the imagery its UI assumes.

- **Frontend evidence:** components/request-board/create-request-modal.tsx:295 - 'At least one image is required for goods requests' validation (photos required for Goods per 3.1.8)
- **Mobile evidence:** lib/screens/create_request_screen.dart:283-287 - photo button labelled 'Add photos (optional)' with no validator requiring an image for GOODS before submit (:132-137 submit validates only the Form)
- **Mobile-side verification:** Photo button is literally labelled 'Add photos (optional)' with the 'N of 5 photos' counter (lib/screens/create_request_screen.dart:282-287) and disabled at 5, but _submit (:132-138) runs only the Form validators (title/category/description required) - no GOODS image requirement. Nothing else in the file or the API client enforces at-least-one-image.
- **Frontend-side verification:** create-request-modal.tsx:294-296: `if (requestType === 'GOODS' && totalImages === 0) reportError('At least one image is required for goods requests')` - exact. Minor is right: it is a validation-contract divergence; the user-visible symptom (image-less goods posts) is already covered by REQUES-07 (major).

### 🟡 Minor · partial — Edit mode has no photo management at all (removeImageUrls unimplemented, no upload on edit)

**ID:** `requests:REQUES-13` · **Area:** Edit request - photos

**Impact:** Owners editing a request on mobile can change text but never add or remove photos; images can only ever be set once at creation.

- **Frontend evidence:** components/request-board/create-request-modal.tsx:109,161,348 - removeImageUrls state, visibleExistingImages filtering, and removeImageUrls included in the edit payload, with existing-image thumbnails and removal
- **Mobile evidence:** lib/screens/create_request_screen.dart:277-279 - comment states the update endpoint's removeImageUrls handling 'is its own unit of work' and the whole photo block is wrapped in `if (!_editing)`; lib/api/api_client.dart:812-823 - updateRequestPost supports image parts in its signature but the screen sends none
- **Mobile-side verification:** The photo block is wrapped in `if (!_editing)` (create_request_screen.dart:279-311) with the removeImageUrls comment at :277-278; edit-mode submit calls updateRequestPost with no image parts (create_request_screen.dart:158). updateRequestPost's signature accepts imagePaths (api_client.dart:812-823) but no caller supplies them, and grep 'imageUrls' finds nothing in lib/. 'Partial' is the right category: create has photo UI, edit has none.
- **Frontend-side verification:** All three citations exact: create-request-modal.tsx:109 removeImageUrls state, :161 visibleExistingImages = existingImages.filter(...), :348 `...(isEditing ? { removeImageUrls } : {})` in the edit payload; existing-image removal via removeExistingImage :236-238 and RequestImageUploader :567-576. Minor is right (sub-capability of edit; images still display via REQUES-07's surfaces).

### 🟡 Minor · divergent — SERVICE requests posted to /request-board/service on mobile; the web UI always posts to /request-board

**ID:** `requests:REQUES-14` · **Area:** Service create endpoint

**Impact:** The two clients hit different backend endpoints for service requests; if the /service route behaves differently (validation, defaults, notifications), service posts created on mobile will diverge from identical posts created on web.

- **Frontend evidence:** lib/request-board-api.ts:164-168 - createRequest posts multipart to '/api/v1/request-board'; the dedicated service helper at :175 is defined but never called by any component
- **Mobile evidence:** lib/api/api_client.dart:770 - `final path = isService ? '/api/v1/request-board/service' : '/api/v1/request-board'`; lib/screens/create_request_screen.dart:160-161 - createRequestPost(isService: _type == 'SERVICE')
- **Mobile-side verification:** Path ternary at lib/api/api_client.dart:770 (`isService ? '/api/v1/request-board/service' : '/api/v1/request-board'`); the screen sends isService: _type == 'SERVICE' (create_request_screen.dart:160-161). Spot-checked the frontend: web's createRequest always posts to /request-board (request-board-api.ts:164-168) and createServiceRequest (:171-176) is a non-exported private helper with no component callers - so the two clients genuinely hit different endpoints for SERVICE posts.
- **Frontend-side verification:** request-board-api.ts:164-168 createRequest posts multipart to '/api/v1/request-board' (:168); createServiceRequest defined at :171-176 posting to '/api/v1/request-board/service' and a repo-wide grep finds it only at its definition - it is module-private and never called. Minor is right (impact is conditional on backend route differences).

### 🟡 Minor · BROKEN — No budget validation: negative/non-numeric values silently dropped, no max>=min check

**ID:** `requests:REQUES-15` · **Area:** Budget validation

**Impact:** Invalid budgets that web rejects with a clear error are silently dropped or accepted on mobile (e.g. max < min posts fine), producing requests with nonsensical or missing budget data.

- **Frontend evidence:** components/request-board/create-request-modal.tsx:314,321,329 - 'Minimum budget must be a positive amount' / 'Maximum budget must be a positive amount' / 'Maximum budget must be greater than or equal to minimum budget'
- **Mobile evidence:** lib/screens/create_request_screen.dart:150-153 - `double.tryParse(...)` result is omitted from the payload when null (non-numeric input silently ignored) and there is no sign or min<=max cross-field validation
- **Mobile-side verification:** double.tryParse with the field omitted when parse yields null (create_request_screen.dart:150-153); no positive-value or min<=max cross-field validation anywhere in the file. Precision nuance within a correct gap: non-numeric input is silently dropped, but a negative numeric value IS sent (tryParse('-5') = -5.0 and the non-empty check passes), and max<min posts fine - so negatives are silently accepted rather than dropped, exactly as the impact text's 'dropped or accepted' phrasing covers.
- **Frontend-side verification:** create-request-modal.tsx:314 'Minimum budget must be a positive amount', :321 'Maximum budget must be a positive amount', :329 'Maximum budget must be greater than or equal to minimum budget' - all exact (checks at :310-331). Minor is right: budgets are informational on web (badge only), so this is validation polish, not a money path.

### 🟡 Minor · partial — No title prefix enforcement, no 150/2000 maxLength, no counters

**ID:** `requests:REQUES-16` · **Area:** Create form - title/description

**Impact:** Mobile titles can exceed 150 characters and descriptions 2000, which web rejects; the 'I am looking for...' convention that shapes feed copy on web is absent.

- **Frontend evidence:** components/request-board/create-request-modal.tsx:51 - REQUEST_TITLE_PREFIX 'I am looking for ' enforced while typing on create; :457 - title maxLength={150} with visible counter; :473 - description maxLength={2000}
- **Mobile evidence:** lib/screens/create_request_screen.dart:201-205 and :220-227 - plain TextFormFields with only a blank-required validator; no maxLength, no prefix, no counters (verified full read)
- **Mobile-side verification:** Full read of create_request_screen.dart: title (:201-205) and description (:220-227) are plain TextFormFields with only a blank-after-trim validator - no maxLength, no counter, and no 'I am looking for ' prefix logic anywhere in the request domain (grep 'I am looking for' in lib/ - no match in the request screens).
- **Frontend-side verification:** create-request-modal.tsx:51 REQUEST_TITLE_PREFIX = 'I am looking for '; prefix enforced while typing on create at :438-456 (partial-prefix snap-back :448-454); title Input maxLength={150} at :457 with desktop counter :460-462; description Textarea maxLength={2000} at :473 with counter :477-479. Minor is right.

### 🟡 Minor · partial — No date-range calendar or end>=start validation; deadline not clearable after pick

**ID:** `requests:REQUES-17` · **Area:** Fulfillment window

**Impact:** Users can pick a deadline before the start date with no error; once a deadline is set it cannot be removed from the form, and web's range-calendar UX (same-day allowed, two-month view) is reduced to bare pickers.

- **Frontend evidence:** components/request-board/create-request-modal.tsx:307 - 'End date must be on or after the start date'; RentalDateRangeCalendar with allowSameDay, clear dates, and fulfillmentDeadline = end || start mapping (3.1.10)
- **Mobile evidence:** lib/screens/create_request_screen.dart:84-102 - two independent showDatePicker calls (start initial today, deadline initial +7d), no cross-field validation; :267-275 - deadline ListTile has only an edit icon with no clear affordance (the start date has one at :260-264)
- **Mobile-side verification:** Two independent showDatePicker calls (create_request_screen.dart:84-102) with identical +365-day windows and no end>=start validation; the deadline ListTile (:267-275) renders only the edit_calendar icon with no clear affordance, while the start date ListTile has a clear button (:258-264). No RentalDateRangeCalendar equivalent exists in the repo.
- **Frontend-side verification:** create-request-modal.tsx:306-308 'End date must be on or after the start date'; RentalDateRangeCalendar at :682-691 with allowSameDay (:685) and start/end labels; deadline mapping at :347 `dateInputToIso(fulfillmentEndDate || fulfillmentStartDate)` (start -> '{yyyy-MM-dd}T00:00:00' per dateInputToIso :63-67). Minor is right.

### 🟡 Minor · missing — View counts never displayed and owner view-analytics dialog missing (tracking only)

**ID:** `requests:REQUES-18` · **Area:** View counts / analytics

**Impact:** View tracking data is collected but never surfaced: posters get no feedback that their request is being seen, and the owner analytics breakdown (members vs guests, viewer list) is entirely absent.

- **Frontend evidence:** components/request-board/request-card.tsx:356-361 - 'N view(s)' with Eye icon on cards; components/request-board/request-views-dialog.tsx:99-102 - owner analytics Total/Unique/Members/Guests plus per-viewer list; lib/request-board-api.ts:388 - fetchRequestViewAnalytics
- **Mobile evidence:** lib/api/api_client.dart:1340-1349 - only trackRequestView exists (searched 'views/analytics': no match); lib/screens/requests_screen.dart:483-502 - the _Req accessor exposes no viewCount/views field, so no count is rendered on cards or detail
- **Mobile-side verification:** Only trackRequestView exists in the request-board client (api_client.dart:1340-1349); grep 'viewCount|ViewAnalytics' - the only analytics methods are product click analytics (api_client.dart:2167-2184, 2235). The _Req accessor (requests_screen.dart:483-502) exposes no views/viewCount field, and the full read of feed card and detail confirms no count is rendered anywhere.
- **Frontend-side verification:** request-card.tsx:356-364 renders Eye icon + '{viewCount} view(s)' when a numeric count resolves (:90-95 viewCount ?? views); request-views-dialog.tsx:98-103 exactly the Total/Unique/Members/Guests stat cards plus per-viewer list :115-142; fetchRequestViewAnalytics at request-board-api.ts:388-393. Minor is right (small display element + owner-only dialog).

### 🟡 Minor · BROKEN — X-Anonymous-Id never sent: supported anonId parameter is not passed by any caller

**ID:** `requests:REQUES-19` · **Area:** Anonymous view tracking

**Impact:** Guest view tracking works but cannot be de-duplicated per device, so a single anonymous visitor inflates view counts relative to the web behavior the de-dup was designed around.

- **Frontend evidence:** lib/request-board-api.ts:258-260 - when no Authorization header is present, the persisted anonymous id is attached as 'X-Anonymous-Id' on PATCH /view
- **Mobile evidence:** lib/api/api_client.dart:1340-1343 - trackRequestView accepts an `anonId` param and would send the header, and an anonymous id is persisted (ge_anon_id, :2152-2250); lib/screens/requests_screen.dart:193 - `_api.trackRequestView(token, _id)` is called without anonId, so guest views carry no header
- **Mobile-side verification:** The sole caller is requests_screen.dart:193 `_api.trackRequestView(token, _id).catchError((_) {})` - no anonId argument. The persisted anonymous id (api_client.dart:2247-2259, KvStore key ge_anon_id) is wired only into _clickHeaders for product-click tracking (api_client.dart:2156, 2262-2264); trackRequestView's optional anonId header (api_client.dart:1340-1343) is never passed by any caller, so guest request views carry no X-Anonymous-Id.
- **Frontend-side verification:** request-board-api.ts:258-261 is exactly `if (!headers['Authorization']) { const anon = getAnonymousId(); if (anon) headers['X-Anonymous-Id'] = anon }` inside trackRequestView; getAnonymousId persists 'ge_anon_id' with the anon:{uuid} format (:28-47). Minor is right.

### 🟡 Minor · missing — No share action anywhere in the request domain (copy link, WhatsApp, email)

**ID:** `requests:REQUES-20` · **Area:** Share request

**Impact:** Mobile users cannot propagate requests off-platform, removing the growth loop the web detail page provides to every viewer.

- **Frontend evidence:** components/request-board/share-request-modal.tsx:60,80-95 - 'Share this request' dialog with clipboard copy ('Link copied' toast), wa.me and mailto links; app/request/[id]/page.tsx:690 - ShareRequestModal mounted on the detail page for all viewers
- **Mobile evidence:** lib/screens/requests_screen.dart:339-427 - the detail screen's action area contains only owner buttons or the nudge button; no share widget or share_plus call exists in the request screens (verified full read of requests_screen.dart and create_request_screen.dart)
- **Mobile-side verification:** pubspec.yaml contains no share_plus (grep 'share' matches only shared_preferences); grep 'Share\.|share_plus|Clipboard' across lib/ - no usage in the request domain. The detail action area (requests_screen.dart:343-425) contains only the owner button rows or the single nudge button (full read). No share sheet, no link copy, no wa.me/mailto anywhere in the request screens.
- **Frontend-side verification:** share-request-modal.tsx:60 'Share this request' DialogTitle; copy button :76-84 with 'Link copied' toast :29, 'Copied' flip for 2s :30/:82-83, 'Copy failed' :32-36; WhatsApp wa.me link :40-42/:89-97 and mailto :43-45/:98-103, both pre-encoded. Mounted on the detail page for all viewers at page.tsx:689-691 (only requires requestUrl). Minor is right (ancillary growth action).

### 🟡 Minor · missing — No fulfilled-detail dialog and no 'Fulfilled via ...' banner (who fulfilled it, linked product)

**ID:** `requests:REQUES-21` · **Area:** Fulfilled request details

**Impact:** Once fulfilled, a request carries no record on mobile of how or by whom it was fulfilled; the trust/traceability information web exposes to owners and verified viewers is lost.

- **Frontend evidence:** lib/request-board-api.ts:273 - fetchFulfilledRequestDetail (GET /{id}/fulfilled-detail); app/request/[id]/page.tsx:470-474 - 'Fulfilled via {productName}' banner; FulfilledDetailDialog shows product box, 'Fulfilled by' identity and View Product link
- **Mobile evidence:** lib/api/api_client.dart - no fulfilled-detail method exists (searched 'fulfilled-detail': no match); lib/screens/requests_screen.dart:346-349 - a fulfilled request renders the same title + status chip layout as any other, with no banner, fulfiller name, or product link
- **Mobile-side verification:** Grep 'fulfilled-detail|fulfilledDetail|FulfilledDetail' across lib/ - no match; the request-board client section (api_client.dart:1303-1405) has no fulfilled-detail method. A fulfilled request renders the same title + orange status chip layout as any other (requests_screen.dart:346-357) - no banner, no fulfiller identity, no product link (full read).
- **Frontend-side verification:** fetchFulfilledRequestDetail at request-board-api.ts:273-278; banner 'Fulfilled via {productName}' at page.tsx:460-484 (:470 Link, :474 span, 'by {name}' :480-482); FulfilledDetailDialog product box :75-107 (image productImageUrls[0] else requestImageUrls[0] :44-48; captions :90-96; View Product :97-104) and 'Fulfilled by' box :109-147 gated by canViewIdentity ('Community seller' :135-137, org line :139-143). Minor is right (post-fulfillment traceability, no flow blocked).

### 🟡 Minor · missing — No 'Related requests' section on the detail page

**ID:** `requests:REQUES-22` · **Area:** Related requests

**Impact:** Detail viewers are not cross-linked to similar open requests, reducing discovery of the rest of the board.

- **Frontend evidence:** app/request/[id]/page.tsx:560 - 'Related requests' card fed by same type+category fetch (page 0, size 4, self-excluded, capped at 3)
- **Mobile evidence:** lib/screens/requests_screen.dart:343-425 - the detail ListView ends after description and the actions block; no related-requests fetch or section exists (verified full read)
- **Mobile-side verification:** The detail ListView ends after the description and the single actions block (requests_screen.dart:343-425, full read) - no related-requests fetch or section. The repo does have a _RelatedRail pattern for products (lib/screens/product_detail_screen.dart:595, 1095) but nothing analogous exists for requests, and no second feed call is issued from the detail screen.
- **Frontend-side verification:** page.tsx:557-594 'Related requests' card with heading at :560; fetch effect :196-210 uses fetchRequestFeed({requestType, category, page:0, size:4}), self-excludes via filter (:208) and caps at 3 via slice(0,3), hiding the card when empty (:557). Minor is right (discovery nicety).

### 🟡 Minor · divergent — Requests tab driven by generic typed notification rows instead of per-request unread-nudge counts

**ID:** `requests:REQUES-23` · **Area:** Notifications - Requests tab model

**Impact:** Mobile shows a differently-sourced Requests tab: generic request-typed notifications rather than the owner's per-request outstanding-response counts, and no request-nudge contribution to a badge, so unread-response awareness differs between platforms.

- **Frontend evidence:** components/request-nudge-notifications.tsx:27-32 - parallel fetchUnreadNudgeCount + fetchMyRequests, listing the owner's own requests with unreadNudgeCount > 0 and a per-request 'View Nudges' action; Requests-tab badge = nudgeUnread + requestNotificationUnread
- **Mobile evidence:** lib/domain/notification_feed.dart:129-134 - the Requests tab is defined as rows whose notificationType is NEW_REQUEST/REQUEST_NUDGE/REQUEST_SERVICE_OFFER/REQUEST_UPDATE; lib/api/api_client.dart - no request-board nudges/unread-count call exists (searched 'nudges/unread': no match)
- **Mobile-side verification:** The Requests tab is defined purely by notification type (notification_feed.dart:129-134 via _scopeOf, applied at :160-168) - generic typed rows. Grep 'nudges/unread|unreadNudge|fetchMyRequests' - no match; the app-badge (globo_app_bar.dart:48-70, notifications unread-count + orders waiting) has no request-nudge contribution, and the badge is fetched on mount/tab-change rather than polled (shell.dart:47).
- **Frontend-side verification:** request-nudge-notifications.tsx:26-33: Promise.all of fetchUnreadNudgeCount + fetchMyRequests({page:0,size:50}), then filter to requests with unreadNudgeCount > 0 (:32) - exactly as cited. Minor is right (differently-sourced notification tab, no broken flow).

### 🟡 Minor · missing — No admin requests tab: no all-requests feed, status override, admin delete, admin nudges or stats

**ID:** `requests:REQUES-24` · **Area:** Admin moderation

**Impact:** Admins cannot moderate the request board from mobile. Note: the mobile repo CLAUDE.md declares admin dashboards out of scope, so this may be a deliberate deferral rather than an oversight.

- **Frontend evidence:** lib/request-board-api.ts:397-441 - adminFetchAllRequests / adminUpdateRequestStatus / adminDeleteRequest / adminFetchNudgesForRequest / adminFetchStats; components/admin/admin-requests-tab.tsx:113,147,163,530 - list, 'Status updated' flow, delete dialog, nudges accordion
- **Mobile evidence:** lib/api/api_client.dart - no request-board/admin endpoints exist (searched 'request-board/admin': no match); lib/screens/admin_dashboard.dart - zero matches for 'request' (searched)
- **Mobile-side verification:** Grep 'request-board/admin|adminFetchAllRequests|adminUpdateRequestStatus' across lib/ - no match; admin_dashboard.dart has zero 'request' mentions (verified). One scoping nuance: the mobile repo does ship other admin surfaces (AdminRatingsScreen, admin orders console, payments review, plus tests for admin messages/users/escrow/top-buyers), so the CLAUDE.md 'admin dashboards OUT of scope' line the claim hedges with is already stale in practice - but the request-board admin endpoints and tab are genuinely absent. Severity minor stands either way.
- **Frontend-side verification:** request-board-api.ts:397-446 defines all five admin calls (cited 397-441 covers them through adminFetchStats at :441); admin-requests-tab.tsx:113 adminFetchAllRequests, :147-150 adminUpdateRequestStatus + 'Status updated' toast, :163 adminDeleteRequest, :530 'Delete Request' AlertDialog, nudges accordion at :98/:374/:481. Minor with the noted out-of-scope caveat is right.

### 🟡 Minor · BROKEN — Returning from the create screen does not refetch the feed despite the refresh comment

**ID:** `requests:REQUES-25` · **Area:** Feed refresh after create

**Impact:** After posting, the user returns to a feed that does not show their new request until they change a filter or reopen the screen - the create flow appears not to have worked.

- **Frontend evidence:** components/request-board/request-feed.tsx:388,400 - feed.refresh() is invoked after create/mutations so new posts appear immediately
- **Mobile evidence:** lib/screens/requests_screen.dart:48-54 - FAB onPressed awaits the create route then runs only `setState(() {})`; the `_future` field (:33,:42) is unchanged, so the FutureBuilder keeps the old snapshot and no request is issued (comment claims 'feed refreshes on return')
- **Mobile-side verification:** FAB onPressed awaits the create route then runs only `setState(() {})` (requests_screen.dart:48-54) while _future (assigned once at :33, rebuilt only by _applyFilters at :42) is untouched - FutureBuilder does not re-run an unchanged Future instance, so returning from a successful post shows the stale list despite the 'feed refreshes on return' comment at :52. No listener, no callback, no refresh mechanism exists.
- **Frontend-side verification:** Refetch-after-mutation is real: feed.refresh() at request-feed.tsx:388 after nudge send/update and :400 in the already-nudged branch; after create the refetch is issued inside the hook - use-request-board.ts:119-120 calls fetchData() right after apiCreateRequest (same for update/fulfill/delete at :128-158). Mechanism nit: the create-path refresh comes from the hook rather than feed.refresh() at :388/:400, and the 15s feed cache (request-board-api.ts:15) can briefly delay visibility, but the frontend behavior as described (feed refetches so new posts appear) stands. Minor is right.

### 🟡 Minor · BROKEN — Search applies on submit only and unsubmitted text snaps back on rebuild

**ID:** `requests:REQUES-26` · **Area:** Feed search input

**Impact:** Mobile search feels laggy (no live filtering) and visibly eats the user's in-progress text whenever the widget rebuilds.

- **Frontend evidence:** components/request-board/request-feed.tsx:536-538 - search input applies immediately via onChange (setSearch drives the query with page reset per 7.4)
- **Mobile evidence:** lib/screens/requests_screen.dart:82 - `controller: TextEditingController(text: _search)` is constructed fresh every build, so typed-but-unsubmitted text reverts to the last submitted query on any rebuild; :86 - filtering happens only in onSubmitted
- **Mobile-side verification:** `controller: TextEditingController(text: _search)` is constructed fresh every build (requests_screen.dart:82), so any rebuild (segment change, status change, or FutureBuilder state transition) replaces the controller with one holding the last submitted query - unsubmitted text snaps back. Filtering runs only in onSubmitted (:86); there is no onChanged/live path. Both defects verified in the full read.
- **Frontend-side verification:** request-feed.tsx:535-540: search Input bound to `search` state with onChange={(e) => setSearch(e.target.value)} at :538 - applied immediately; the value drives the feed query (search param at :291) and resets page via useEffect at :314-316. Minor is right.

### 🟡 Minor · missing — No sort control (Relevance/Newest/Most nudged/Most viewed)

**ID:** `requests:REQUES-27` · **Area:** Feed sorting

**Impact:** Mobile users always see raw backend order and cannot surface the most-nudged, most-viewed or newest requests the way web allows.

- **Frontend evidence:** components/request-board/request-feed.tsx:570-586 - sort Select with Newest/Most nudged/Most viewed; :415-433 - client-side stable sorts of the loaded feed
- **Mobile evidence:** lib/screens/requests_screen.dart:61-101 - the filter bar contains only the type segment, search field and status dropdown; no sort control exists (verified full read)
- **Mobile-side verification:** The filter bar (requests_screen.dart:61-101) contains exactly three controls - the type SegmentedButton, the search TextField and the status DropdownButton; the list renders server order as-is (ListView.separated at :116). No sort control, no sort param, and no client-side sorting exists in the request domain (full read; grep 'sort' in the request screens - no match).
- **Frontend-side verification:** request-feed.tsx:570-588 sort Select with Relevance/Newest/Most nudged/Most viewed items at :583-586; client-side stable sorts in the sortedRequests useMemo at :415-433 (newest :420-421, nudges :423-424, views :426-427, relevance = untouched backend order :429-430). Minor is right.

### 🟡 Minor · missing — Category and neighbourhood filter UI missing (API params supported but unused)

**ID:** `requests:REQUES-28` · **Area:** Feed filtering

**Impact:** Mobile discovery is limited to type+status+search; users cannot narrow the board to their neighbourhood or a category, which on web is the primary browse path (sticky filter sidebar / filter sheet).

- **Frontend evidence:** components/request-board/request-feed.tsx:163 - category button grid (availability-filtered); :204-235 - neighbourhood text input with TZ_DAR_NEIGHBOURHOODS datalist and clear button; :108 - 'Clear all' reset
- **Mobile evidence:** lib/screens/requests_screen.dart:61-101 - no category or location controls in the filter bar; lib/api/api_client.dart:1316-1317 - fetchRequestsFiltered accepts category/location params that no caller supplies
- **Mobile-side verification:** No category or location control exists anywhere in requests_screen.dart (full read of the filter bar :61-101 and the whole file). fetchRequestsFiltered accepts category/location (api_client.dart:1308, sent at :1316-1317) but its only caller (requests_screen.dart:36-40) passes neither - the params are dead UI-wise, exactly as claimed.
- **Frontend-side verification:** request-feed.tsx:163 category button grid (availability-filtered via getAvailableCategoryIds at :303-312); neighbourhood input :199-237 with TZ_DAR_NEIGHBOURHOODS datalist :231-235 and clear (X) button :221-230; 'Clear all' ghost button (disabled without active filters) at :101-109, label at :108. Minor is right (feature gap in discovery, API params already supported).

### 🟡 Minor · divergent — Owner 'Close' action exists only on mobile (web close is API-only; CLOSED is admin-set)

**ID:** `requests:REQUES-29` · **Area:** Status transitions

**Impact:** Mobile owners can move their PENDING request to CLOSED, a transition web intentionally reserves for admins; the two platforms expose different status-transition surfaces for the same account.

- **Frontend evidence:** lib/request-board-api.ts:186 - closeRequest defined in the API layer but no component triggers it (owner controls in request-board-tab.tsx:282-285,338 are Edit / Mark as Fulfilled / Delete only); web status model makes CLOSED admin-only in the UI
- **Mobile evidence:** lib/screens/requests_screen.dart:396-401 - owner 'Close' OutlinedButton (lock icon) calls _ownerAction('close'); :239-250 - 'Close request?' AlertDialog -> closeRequestPost -> refetch
- **Mobile-side verification:** Mobile owner 'Close' OutlinedButton (requests_screen.dart:395-401) opens the 'Close request?' dialog (:236-253) and calls closeRequestPost (:261) - the transition is fully wired. Spot-checked the web side: closeRequest is defined at request-board-api.ts:186 with zero component callers, and the web owner controls are Edit/Mark as Fulfilled/Delete only. The owner-close surface really is mobile-only in the UI.
- **Frontend-side verification:** closeRequest defined at request-board-api.ts:186-192; repo grep shows its only other references are the hook exposure (use-request-board.ts:10/:51/:191) and a test mock - no component ever invokes it. Owner controls are Edit / Mark as Fulfilled / Delete only (request-board-tab.tsx:278-286, :338-364, :378-407; detail page :655-678). Minor is right (divergent transition surface, no data corruption implied).

### 🟡 Minor · divergent — Requester name shown to every viewer without the owner-or-verified gating web applies

**ID:** `requests:REQUES-30` · **Area:** Identity privacy

**Impact:** Requester identity that web deliberately masks from anonymous/unverified viewers is displayed to everyone on mobile, diverging from the platform's data-exposure rule for this domain.

- **Frontend evidence:** components/request-board/request-card.tsx:151 - `showRequesterIdentity ? publicUserName : 'Community member'` (showFullIdentity = isOwner || canSell per 4.4.3), with initials/avatar and org label only for gated viewers
- **Mobile evidence:** lib/screens/requests_screen.dart:137 and :351 - `r.userName ?? 'Community member'` is rendered unconditionally on feed cards and the detail page for any viewer, logged in or not
- **Mobile-side verification:** `r.userName ?? 'Community member'` is rendered unconditionally on the feed card (requests_screen.dart:137) and the detail page (:351) for any viewer, guest included - no isOwner/canSell gating exists in the mobile code (the only showRequesterIdentity-style logic in the repo is absent here; _isOwner at :183-212 drives buttons only, never identity masking).
- **Frontend-side verification:** request-card.tsx:151 is exactly `{showRequesterIdentity ? publicUserName : 'Community member'}` with `showRequesterIdentity = Boolean(isOwner || canViewRequesterIdentity)` at :98; avatar/initials and org badge are likewise gated (:134-147, :153-166). Detail page applies the same rule (page.tsx:134, :602-633). Minor is right.

### 🟡 Minor · BROKEN — No relative posted time; deadline rendered as the raw backend timestamp string

**ID:** `requests:REQUES-31` · **Area:** Time formatting

**Impact:** Mobile users see machine-formatted deadline strings and never see when a request was posted, losing the freshness cues ('2h ago') that drive engagement on web.

- **Frontend evidence:** components/request-board/request-card.tsx:59-64 - relative formatter ('just now', '{m}m ago', '{h}h ago', '{d}d ago', else date) used on cards and list
- **Mobile evidence:** lib/screens/requests_screen.dart:493 - `m['fulfillmentDeadline']?.toString()` is shown verbatim in the 'Deadline' field (:357), e.g. '2026-09-15T00:00:00.000+00:00'; no createdAt display exists anywhere on cards or detail (verified full read)
- **Mobile-side verification:** Deadline is the raw backend string - `_Req.deadline => m['fulfillmentDeadline']?.toString()` (requests_screen.dart:493) rendered verbatim in the Deadline field (:357), e.g. the full ISO timestamp; there is no createdAt accessor, no relative-time formatter, and no posting-time display anywhere on cards or detail (full read; the repo's TimeUtils relative helpers are not used in this domain).
- **Frontend-side verification:** request-card.tsx:54-66 relative formatter - 'just now' :59, '{m}m ago' :60, '{h}h ago' :62, '{d}d ago' :64, else toLocaleDateString :65 - rendered on every card at :170 (createdAt). Minor is right.

### 🟡 Minor · divergent — Single-end budgets lose currency formatting: raw number without 'from'/'up to' phrasing or TZS suffix

**ID:** `requests:REQUES-32` · **Area:** Budget display

**Impact:** Requests with only one budget end display an unformatted bare number on mobile (e.g. '50000'), inconsistent with web's formatted 'Budget: from ...' phrasing.

- **Frontend evidence:** lib/request-budget.ts:14-18 - both ends 'Budget: {min} – {max}', min only 'Budget: from {min}', max only 'Budget: up to {max}', all through an en-TZ TZS currency formatter
- **Mobile evidence:** lib/screens/requests_screen.dart:494-501 - both ends render thousands-formatted 'min – max TZS', but a single end falls through to `(min ?? max).toString()` with no thousands separators, no currency suffix and no from/up-to phrasing
- **Mobile-side verification:** budgetRange (requests_screen.dart:494-501): both ends -> NumberFormat('#,##0') 'min - max TZS'; single end -> `(min ?? max).toString()` - a bare unformatted number with no thousands separators, no TZS suffix and no 'from'/'up to' phrasing. Verified against the full accessor implementation.
- **Frontend-side verification:** lib/request-budget.ts:14-18 exactly: both ends 'Budget: {min} - {max}' (:15), min only 'Budget: from ...' (:17), max only 'Budget: up to ...' (:18), all through Intl.NumberFormat('en-TZ', TZS, 0 fraction digits) (:1-5); null hides the badge (:19). Minor is right.

### 🟡 Minor · missing — No grid/list view toggle, no back-to-top button, no dedicated filter sheet

**ID:** `requests:REQUES-33` · **Area:** Feed view affordances

**Impact:** Cosmetic/UX parity gap: mobile offers one dense list with no visual browse mode or quick return-to-top on long feeds.

- **Frontend evidence:** components/request-board/request-feed.tsx:592-600 - grid/list toggle buttons with navy selected state; :680-688 - floating 'Back to top' button above the mobile bottom nav; mobile filter Sheet per 1.3
- **Mobile evidence:** lib/screens/requests_screen.dart:116-152 - a single always-list ListView with no view toggle; no back-to-top or filter-sheet affordance exists (verified full read)
- **Mobile-side verification:** Full read confirms a single always-on ListView (requests_screen.dart:116-152) with a fixed filter bar - no grid/list toggle, no back-to-top button, no filter sheet/bottom-sheet anywhere in the screen. (The catalog screens do have a filter sheet and infinite scroll, so these UX patterns exist in-repo but were not carried into the request board.)
- **Frontend-side verification:** request-feed.tsx:590-605 grid/list toggle with navy (#1E3A8A) selected state (:593/:600); floating 'Back to top' button :677-689 appearing when scrollY > 600 (:280) and positioned above the mobile bottom nav via bottom-[calc(var(--mobile-bottom-nav-height)+0.35rem)] (:681); mobile filter Sheet :544-568. Minor is right (cosmetic/UX parity).

### 🟡 Minor · partial — Detail has no loading, error or invalid-id state; failures silently keep stale data

**ID:** `requests:REQUES-34` · **Area:** Detail screen states

**Impact:** Opening an invalid, deleted or unreachable request on mobile shows a blank/possibly zero-id page indefinitely instead of web's explicit unavailable state, and stale data is silently presented when refetch fails.

- **Frontend evidence:** app/request/[id]/page.tsx:331-334 - full error state 'Request unavailable' + 'Back to Request Hub' link; RequestDetailSkeleton and 'Request not found' handling per 4.3
- **Mobile evidence:** lib/screens/requests_screen.dart:217-226 - _refetch failures are swallowed ('Keep showing the feed payload') with no error UI; :228 - the id accessor falls back to 0 with no guard; the deep-link stub map (lib/app_router.dart:196-197 passes only {'id'}) renders blank title/fields until a refetch happens to succeed
- **Mobile-side verification:** _refetch swallows failures and keeps the stale payload (requests_screen.dart:217-226, comment :224); the id accessor falls back to 0 with no guard (:228); the deep-link route passes only {'id': <value>} as the request map (app_router.dart:196-200), so title/fields render blank until refetch. Corroborating detail making it slightly worse than claimed: for a deep link the stub's 'id' is a String and the accessor casts `(...) as int` (:228), which throws a TypeError ('String' as int) inside initState - a deep-linked detail crashes before rendering rather than showing a blank page. No error/skeleton/unavailable state exists.
- **Frontend-side verification:** page.tsx:323-325 RequestDetailSkeleton while loading; :327-338 full error state ('Request unavailable' :331, message :332, 'Back to Request Hub' :333-335); invalid/zero id short-circuits to 'Request not found' without a network call (:146-150). Minor is right.

<details><summary><strong>Confirmed equivalent in both apps (18)</strong></summary>

- Entry points: bottom-nav tab 'Requests' -> /requests (lib/screens/shell.dart:59,104), MySpace dashboard 'Requests' tab embedding the same RequestsScreen (lib/screens/delivery_dashboard_screens.dart:483,500), and deep links /request/:id + /requests/new (lib/app_router.dart:196,271) mirror web /requests, /expat/dashboard?tab=requests, /request/[id] and ?new=1
- Public feed GET /api/v1/request-board/feed with server-side requestType/status/search filtering (lib/api/api_client.dart:1307-1328 vs lib/request-board-api.ts:114)
- Type filter All/Goods/Services via SegmentedButton with immediate refetch (lib/screens/requests_screen.dart:66-74)
- Search filter with trim and empty-clears behavior (lib/screens/requests_screen.dart:86)
- Request detail screen with title, status chip, category/service, location, budget, deadline and description fields, all null-safe ('—'/'No description provided.'/'Community member' fallbacks) (lib/screens/requests_screen.dart:346-361,483-502)
- View tracking PATCH /{id}/view fired on detail open, fire-and-forget with errors swallowed (lib/screens/requests_screen.dart:190-193 vs lib/request-board-api.ts:252-271)
- Real authenticated nudge POST to /{id}/nudge with login gate: guests get a toast and no API call, no redirect (lib/screens/requests_screen.dart:439-445 vs lib/request-guest-access.ts:2-3)
- Duplicate-nudge handling: ALREADY_NUDGED sentinel in the error message rewritten to a friendly 'You already nudged this request.' (lib/screens/requests_screen.dart:455-457 vs components/request-board/nudge-dialog.tsx:267-276)
- Create request multipart: JSON `request` part + up to 5 `images` parts, auth required, GOODS vs SERVICE payload key (category vs serviceCategory) (lib/api/api_client.dart:763-788, lib/screens/create_request_screen.dart:144-161)
- Image pipeline parity: max 5 images, 1440px cap, WebP quality 82, fallback to original bytes on compression failure (lib/screens/create_request_screen.dart:109-130)
- Budget chip on cards/detail when both ends present: thousands-formatted 'min – max TZS' (lib/screens/requests_screen.dart:494-500 vs lib/request-budget.ts:14-16)
- Fulfillment window carried in payload: both fulfillmentStartDate and fulfillmentDeadline as YYYY-MM-DD (lib/screens/create_request_screen.dart:154-155)
- Edit via PUT /request-board/{id}, owner-only and PENDING-gated, with detail refetch on return (lib/screens/requests_screen.dart:365-380; lib/screens/create_request_screen.dart:157-158)
- Delete request with irreversible-confirm dialog, permanent, pops back to feed (lib/screens/requests_screen.dart:236-268)
- Fulfill via PATCH /{id}/fulfill {productId} with snackbar + refetch (lib/screens/requests_screen.dart:317-325)
- Notifications screen has a Requests tab (All/Buying/Selling/Requests) with forum icons for REQUEST_* rows, mark-all-read, delete-all, pull-to-refresh, and mark-read-before-navigate (lib/screens/account_misc_screens.dart:150-155,105-125; lib/domain/notification_feed.dart:160-169,332-333)
- Guest model equivalence in kind: feed and detail are public; create/nudge require login and show an inline message without navigation (lib/screens/create_request_screen.dart:134-137; lib/screens/requests_screen.dart:440-445)
- Friendly error taxonomy for feed/notifications (401/403/404/5xx mapping) (lib/widgets/error_text.dart)

</details>


## Order management - buyer side

### 🔴 CRITICAL · missing — Buyer cannot confirm or counter-propose a proposed delivery time

**ID:** `orders-buyer:ORDERS-01` · **Area:** Order detail - delivery time confirmation (AWAITING_BUYER_CONFIRMATION)

**Impact:** After the seller assigns a transporter (order -> AWAITING_BUYER_CONFIRMATION) the mobile buyer has no way to accept the proposed time or request another, so the v2 delivery flow cannot advance to IN_TRANSIT from the app; the order stalls for the buyer while the web can complete it.

- **Frontend evidence:** GloboExpats_Frontend/components/transporter/delivery-time-confirmation.tsx:48-100 - buyer banner: "Yes, I can receive it" calls apiClient.confirmDeliveryTime(orderId) and "Request another time" opens a datetime+note dialog calling proposeDeliveryTime(orderId, {proposedDeliveryTime, note}); mounted on the buyer detail page at app/orders/[id]/page.tsx:1122 and :1873.
- **Mobile evidence:** GloboExpats_Mobile/lib/api/api_client.dart:2091-2107 - the user-facing orderAction verb map has no 'delivery-time/confirm' or 'delivery-time/propose' (those verbs exist only in the ADMIN map at :2042-2043 hitting /api/v1/admin/orders); lib/domain/order_action_hint.dart:149-155 returns a 'Confirm delivery time' CTA but lib/screens/orders_screen.dart:916-931 renders the hint as a plain Text with no gesture, and grep finds no call sites for confirmDeliveryTime/proposeDeliveryTime anywhere in lib/.
- **Mobile-side verification:** Searched lib/ for confirmDeliveryTime|proposeDeliveryTime|delivery-time|AWAITING_BUYER_CONFIRMATION|'Request another time'|propose — no buyer UI. The user-facing orderAction verb map (api_client.dart:2091-2107) has no delivery-time verbs; they exist only in the admin map (api_client.dart:2042-2043, /api/v1/admin/orders). OrderActionType.confirmDeliveryTime (pending_actions.dart:68-75) is consumed solely by pendingOrderActionCount for the bell badge (globo_app_bar.dart:77). The buyer hint CTA 'Confirm delivery time' (order_action_hint.dart:149-155) renders as a plain non-gestured Text at orders_screen.dart:927 (icon+Text row on the card at :272-292); grep '.cta' shows the cta field is never read by any screen. Mobile's own AssignTransporterModal produces AWAITING_BUYER_CONFIRMATION (assign_transporter_modal.dart:12) with no in-app way out: seller has no dispatch/override button either (only admin _adminAction('dispatch') orders_screen.dart:1066), so the stall claim and critical severity hold.
- **Frontend-side verification:** Frontend verified. components/transporter/delivery-time-confirmation.tsx: handleConfirm calls apiClient.confirmDeliveryTime(orderId) (:51), handleCounterPropose calls proposeDeliveryTime(orderId, {proposedDeliveryTime, note}) (:80-83); buttons 'Yes, I can receive it' (:128) and 'Request another time' (:136) open the datetime-local+note dialog with 'Send Request' (:143-186). Mounted on the buyer detail at app/orders/[id]/page.tsx:1122 (v2 buyer tracking layout) and :1873 (v2 legacy buyer). Endpoints exist in lib/api.ts:3877-3891 (PATCH /orders/{id}/delivery-time/confirm|propose). NEXT_PUBLIC_LOGISTICS_V2=true (.env:55, .env.local:74, docker-compose default true), so this is the live v2 flow. Without it the AWAITING_BUYER_CONFIRMATION -> IN_TRANSIT step cannot be completed by the buyer: breaks a core delivery flow, critical is right.

### 🟠 Major · missing — No rental period / return-deadline countdown on list or detail

**ID:** `orders-buyer:ORDERS-02` · **Area:** Rental orders - stage countdown

**Impact:** Rental buyers never see how long is left, the 'ending soon' urgency state, or the auto-complete-at-deadline state; the rental end is invisible until they manually reload.

- **Frontend evidence:** GloboExpats_Frontend/components/orders/rental-stage-countdown.tsx:25-36 - countdown against rental.deadline titled 'Time until completion' / 'Rental ending soon' / 'Rental period ended' with 'This order is being completed automatically.'; rendered on buyer cards (app/expat/dashboard/page.tsx:2349-2356) and on detail with onExpire refresh (app/orders/[id]/page.tsx:1792).
- **Mobile evidence:** GloboExpats_Mobile/lib/widgets/order_status_timeline.dart:105-124 - rental is represented only by the static 'Rental period' timeline step; the order detail build (lib/screens/orders_screen.dart:651-1088) mounts no countdown, and grep finds no rental.deadline/rental-countdown usage anywhere in lib/.
- **Mobile-side verification:** Searched rental+countdown/remaining/deadline/ending soon/until completion/period ended/time left across lib/. RentalBooking.endDate (rentals.dart:73) is used only for billing math (billableUnits); the Countdown widget is instantiated only in checkout_screen.dart:1095/1768, and proforma countdowns only in checkout/my_payments (:677-699) and payment_screen. The rental order surface shows only the static 'Rental period' timeline step (order_status_timeline.dart:119-121). No rental.deadline, no urgency or auto-complete states anywhere.
- **Frontend-side verification:** Behavior is real but one cite is stale. Verified: components/orders/rental-stage-countdown.tsx:25-36 renders PaymentCountdown against rental.deadline with titles 'Time until completion'/'Rental ending soon'/'Rental period ended' and 'This order is being completed automatically.'; buyer-visible on detail at app/orders/[id]/page.tsx:1791-1793 with onExpire={fetchOrder}. NOT verified: 'rendered on buyer cards (dashboard :2349-2356)' - commit bc5a1f3 (2026-09-06) added an early return at app/expat/dashboard/page.tsx:1998-2000 that routes the buying list to renderBuyerOrderHistory (:1723-1911), which renders no RentalStageCountdown; the shared card at :2350 now renders only for selling. The mobile gap (no rental countdown anywhere in the app) still stands against the detail surface. Severity major unchanged (user-visible rental progress/urgency feature).

### 🟠 Major · partial — Card action CTAs are missing; hints are text-only

**ID:** `orders-buyer:ORDERS-03` · **Area:** Orders list - per-card action buttons

**Impact:** Buyers lose the one-tap 'I received the items' confirmation, 'Upload new proof', 'View handoff code', 'Rate Seller', 'Confirm received' and 'View delivery code' from the list; every action requires opening the order detail first.

- **Frontend evidence:** GloboExpats_Frontend/app/expat/dashboard/page.tsx:2402-2449 - buyer card CTAs: IN_TRANSIT+code -> 'I received the items' (opens confirm dialog -> confirmDeliveredByBuyer, :1393/:1401), paymentNeedsNewProof -> 'Upload new proof' deep link to the payments tab (:2441-2443), rental 'View handoff code' (:2117-2121), remaining CTAs link to the detail page.
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:269-291 - the card hint (including hint.cta from lib/domain/order_action_hint.dart) is drawn as a non-interactive Icon+Text row; the card's only tap target navigates to the detail screen (:189-195).
- **Mobile-side verification:** _OrderCard (orders_screen.dart:160-298) is a single InkWell whose onTap only pushes OrderDetailScreen (:189-195); the hint including any CTA is drawn as a non-interactive Icon+Text row (:272-292), and hint.cta is never rendered or wired anywhere (grep '.cta' finds only the model field). No 'I received the items', 'Upload new proof', 'View handoff code' or any other per-card action exists on the list.
- **Frontend-side verification:** The current frontend buyer list has NO per-card CTAs - the claim misreads it. Since commit bc5a1f3 (2026-09-06), renderOrdersList early-returns buying to renderBuyerOrderHistory (app/expat/dashboard/page.tsx:1998-2000), whose card is a single <Link> (:1765-1860) with no Buttons, no action hint, and no CTAs. Every cited artifact lives only in the seller-only branch: actionHint CTA block :2402-2449, 'I received the items' :2420-2432 (setConfirmDeliveryOrder :2429 -> handler :1396-1416 -> confirmDeliveredByBuyer :1401), 'Upload new proof' deep link :2441-2443, 'View handoff code' :2116-2121. The listType==='buying' branches inside that block (:2068, :2112-2119, :2185-2186, :2260, :2357, :2420, :2549) are dead code. Web buyers therefore also must open detail for every action, so there is no web-vs-mobile parity gap of the kind claimed.

### 🟠 Major · missing — Payment-proof-rejected override absent from order list/detail (My Payments only)

**ID:** `orders-buyer:ORDERS-05` · **Area:** Payment recovery - rejected proof state on order surfaces

**Impact:** On the orders list and detail the mobile buyer is told a rejected payment is 'being verified' with no pointer to correct it; the re-upload path is only discoverable in the My Payments tab.

- **Frontend evidence:** GloboExpats_Frontend/app/expat/dashboard/page.tsx:2075-2107 - getBuyerPaymentRecoveryState(...)==='rejected' overrides the card label to 'Payment proof rejected - action required' (amber) with CTA 'Upload new proof'; detail banners at app/orders/[id]/page.tsx:1083 and :1829; recovery precedence (under_review beats rejected) in lib/buyer-payment-recovery.ts:22-43.
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/my_payments_screen.dart:577-578,703 - needsNewProof exists only inside My Payments; the order hint for PENDING/AWAITING_PAYMENT is a static 'Payment submitted - GloboExpats is verifying it and will notify you.' (lib/domain/order_action_hint.dart:131-135) and the escrow banner states in lib/domain/escrow.dart:19-88 have no rejected branch.
- **Mobile-side verification:** Escrow.view (escrow.dart:19-88) has REFUNDED/REFUND_PENDING/escrowPending/payout branches but no rejected-proof branch; the buyer hint for PENDING/AWAITING_PAYMENT is the static 'Payment submitted - GloboExpats is verifying it and will notify you.' (order_action_hint.dart:131-135). needsNewProof, the 48h correction countdown and re-upload exist only in my_payments_screen.dart (:309-328, :703+). One nuance: when escrowPending is false the detail falls back to the raw paymentStatus string in orange (orders_screen.dart:726-729), so 'REJECTED' can appear verbatim — but with no action-required styling, CTA or pointer to My Payments on any order surface. Category/severity as claimed.
- **Frontend-side verification:** Detail evidence is real; the list-card cite is stale. Verified: lib/buyer-payment-recovery.ts:32-46 - replacement SUBMITTED receipt ('under_review', :40) is checked before REJECTED (:41), exactly the claimed precedence; buyer-visible rejected banners on detail at app/orders/[id]/page.tsx:1083-1099 and :1829-1845 ('Payment proof rejected - upload a corrected proof' + 'Upload new proof' -> payments deep link). NOT verified: the list-card override at dashboard :2075-2107 (getBuyerPaymentRecoveryState :2075-2076, label :2086-2087, CTA :2101-2107) sits in the seller-only branch since bc5a1f3 (early return :1998-2000); buyer list cards render no payment-rejected state. The gap stands on the order-detail surface (mobile shows only 'being verified' there), so severity major is unchanged.

### 🟠 Major · missing — No call/WhatsApp/share-location for the transporter and no order help link

**ID:** `orders-buyer:ORDERS-07` · **Area:** Order detail / tracking - contact and support affordances

**Impact:** A buyer waiting for a delivery cannot call or WhatsApp the driver, share the destination, or reach order-specific help from the app - the phone number is displayed as inert text.

- **Frontend evidence:** GloboExpats_Frontend/app/orders/[id]/page.tsx:1410-1434 and :2009-2033 - transporter card 'Call {name}' (tel: link) and WhatsApp buttons; 'Share location' at :1442/:2045; 'Need help with this order?' -> /help at :1546; buyer/seller phone rows via components/orders/order-contact-info.tsx:7-37.
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/delivery_dashboard_screens.dart:225-247 - transporter name/phone/status/est-delivery are plain _row Texts with no tap or launch actions; grep shows url_launcher/tel:/WhatsApp used only by home support, admin screens and profile editing, never on order surfaces.
- **Mobile-side verification:** Transporter name/phone/status/est-delivery are rendered via _row (delivery_dashboard_screens.dart:225-247), which builds plain Texts with no GestureDetector (:290-300). grep url_launcher|tel:|whatsapp|launchUrl across the order screens returns nothing; url_launcher exists only in account_misc_screens, admin_sublist_screens, home_screen and product_detail_screen. No 'Need help with this order?'/help link and no 'Share location' on any order surface (grep found none). The phone number is inert text as claimed.
- **Frontend-side verification:** Frontend verified, all buyer-visible. Buyer tracking layout transporter section: 'Call {name}' tel: link :1409-1414, WhatsApp button :1417-1437 (getWhatsAppUrl), 'Share location' :1438-1445; legacy transporter card mirrors them at :2001-2050 (Call :2009-2012, WhatsApp :2017-2035, Share :2037-2048). 'Need help with this order?' -> /help in the buyer sidebar :1540-1547. components/orders/order-contact-info.tsx renders buyer phone as a tel: link (:35-42) and seller rows (:44-54), mounted in the legacy layout at :2322-2329. Severity major is right: contacting the driver and order-specific help are real user-visible capabilities the mobile order surfaces lack.

### 🟡 Minor · divergent — Detail code card is display-only; copy/regenerate/self-confirm moved to a separate tracking screen

**ID:** `orders-buyer:ORDERS-04` · **Area:** Order detail - delivery code card (buyer)

**Impact:** From order detail the mobile buyer cannot copy, rotate, or self-confirm the delivery code - all three require opening 'Track delivery'; capability exists but the UX path diverges from the web.

- **Frontend evidence:** GloboExpats_Frontend/components/orders/delivery-code-card.tsx:144-203 - the buyer card on the order detail page has Copy (:161-169), 'Generate a new code' -> regenerateDeliveryCode (:174-187) and 'I received the items' gated on allowBuyerConfirmation (:188-198); mounted at app/orders/[id]/page.tsx:1530/:1617/:1811.
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:1255-1314 - the detail `_DeliveryCodeCard` shows title/code/subtitle only; the delivery-OTP instance (:768-773) passes no onRegenerate, and copy, regenerate and buyer self-confirm exist only on the separate DeliveryTrackingScreen (lib/screens/delivery_dashboard_screens.dart:261-281, 312-426).
- **Mobile-side verification:** _DeliveryCodeCard (orders_screen.dart:1255-1314) renders title/code/subtitle plus an optional regenerate TextButton only; the buyer delivery-code instance at :772 passes no onRegenerate, and grep Copy|Clipboard in orders_screen.dart returns nothing — the detail card is display-only. Copy, 'Generate a new code' and backend-gated 'I received the items' self-confirm (key buyer-confirm-delivery-btn) exist only on DeliveryTrackingScreen (delivery_dashboard_screens.dart:312-426, copy/regenerate at :177-188, :415). Capability present but on a separate screen — divergent/minor as claimed.
- **Frontend-side verification:** Frontend verified. components/orders/delivery-code-card.tsx buyer branch (:144-203): Copy icon button with clipboard + aria-live (:161-173, handler :51-64), 'Generate a new code' -> regenerateDeliveryCode (:174-187, handler :105-121 calling apiClient.regenerateDeliveryCode :108), 'I received the items' gated on allowBuyerConfirmation (:188-198, handler :123-142 -> confirmDeliveredByBuyer :126). Mounted buyer-side at app/orders/[id]/page.tsx:1530-1538 (tracking sidebar) and :1616-1630 (legacy, above timeline); seller entry-form variant :1810-1817. Severity minor is right: mobile keeps the capabilities behind the separate tracking screen, so this is a UX-path divergence.

### 🟡 Minor · partial — No payment-deadline countdown on buyer order cards/detail

**ID:** `orders-buyer:ORDERS-06` · **Area:** Unpaid orders - payment deadline countdown

**Impact:** Unpaid mobile orders show no time-remaining or auto-cancel warning; the deadline is only visible via the proforma countdown inside checkout/My Payments, so the urgency signal on the order itself is lost.

- **Frontend evidence:** GloboExpats_Frontend/app/expat/dashboard/page.tsx:2357-2365 - PaymentCountdown (1s tick, urgent <3h, expired copy 'This order is being cancelled automatically and stock will be released.') rendered inline on buying cards with status PENDING/AWAITING_PAYMENT and order.paymentDeadline.
- **Mobile evidence:** GloboExpats_Mobile/lib/models/order.dart:166,233,271 - the Order model parses paymentDeadline but nothing consumes it (grep '.paymentDeadline' finds only the field/constructor); Countdown is used only for proformas in checkout and My Payments (lib/screens/my_payments_screen.dart:677-699).
- **Mobile-side verification:** paymentDeadline is parsed at models/order.dart:166/233/271 and grep finds zero other references in lib/ — nothing consumes it. Countdown is used only for proformas (checkout_screen.dart:1095/1768, my_payments_screen.dart:677-699, payment_screen); the orders list/detail have no timer at all (no Timer, no countdown for PENDING/AWAITING_PAYMENT orders). Gap accurate as partial/minor.
- **Frontend-side verification:** The current frontend does not show a payment-deadline countdown to buyers on order surfaces. (a) The cited card render (dashboard :2357-2365) is in the seller-only branch - the buying early return at :1998-2000 (commit bc5a1f3, 2026-09-06) routes buyers to renderBuyerOrderHistory, which renders no PaymentCountdown. (b) With LOGISTICS_V2_ENABLED=true (.env:55), the detail page replaces PaymentCountdown with v2 verification banners in both layouts (app/orders/[id]/page.tsx:1101-1119 and :1847-1869); the code comment at :1819-1821 states the design intent: under v2 a payment deadline never applies to orders (orders exist only after proof submission). So the web buyer sees no countdown on cards or detail either - no parity gap as claimed.

### 🟡 Minor · missing — No Google Maps destination links on cards or detail

**ID:** `orders-buyer:ORDERS-08` · **Area:** Destination / map links

**Impact:** Buyers can read the address text but cannot open navigation to the delivery/pickup point from an order; the rental 'Rental location' map affordance is likewise absent.

- **Frontend evidence:** GloboExpats_Frontend/components/orders/order-card-destination.tsx:25-34 - card destination block with a 'View map' Google Maps link, rendered on buyer cards at app/expat/dashboard/page.tsx:2369-2375; 'Open delivery location' on detail at app/orders/[id]/page.tsx:1314/:1563/:2306.
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:651-712 - detail shows only textual 'Delivery address'/'City' rows (:706-708) and the card build (:184-296) has no destination block; no map link exists in any order screen.
- **Mobile-side verification:** Detail shows only textual 'Delivery address'/'City'/'Delivery' rows (orders_screen.dart:706-710) and the card build (:184-298) has no destination block. grep google.com/maps|maps.google|geo:|View map|Open delivery location|Rental location across lib/ finds only geocoding_service.dart (Places geocoding for checkout address entry); map_location_picker is an address-input widget, never launched from orders. No navigation links anywhere on order surfaces.
- **Frontend-side verification:** Component and detail evidence real; the buyer-card mount cite is stale. Verified: components/orders/order-card-destination.tsx:25-34 'View map' Google Maps anchor; 'Open delivery location' on detail at app/orders/[id]/page.tsx:1314 (delivery-details card), :1563 (sidebar full-width), :2306 (legacy layout). NOT verified: 'rendered on buyer cards at dashboard :2369-2375' - that OrderCardDestination mount is in the seller-only branch since bc5a1f3 (:1998-2000); buyer list cards render no destination block. The gap stands vs the detail page; severity minor unchanged.

### 🟡 Minor · partial — Agreed delivery slot not shown on list or detail

**ID:** `orders-buyer:ORDERS-09` · **Area:** Delivery window / expected delivery info

**Impact:** The buyer-selected window (e.g. 'Today MORNING (10:00-12:00)') is nowhere visible on the mobile order list or detail; fulfillment-type context (delivery vs pickup) is also missing.

- **Frontend evidence:** GloboExpats_Frontend/app/expat/dashboard/page.tsx:2309-2317 - card line 'Expected delivery: {window labels}'; detail 'Delivery details' card with Fulfillment type / Delivery window / delivery fee rows at app/orders/[id]/page.tsx:1211-1259.
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:697-710 - detail shows only raw 'Delivery address'/'City'/'Delivery method' payload rows and the card build (:227-291) has no window line; the only ETA anywhere is the transporter's 'Est. delivery' on the tracking screen (lib/screens/delivery_dashboard_screens.dart:244-247).
- **Mobile-side verification:** deliveryWindowFields is captured on the model (models/order.dart:294-304) but its only consumer is the seller dispatch-unlock banner (orders_screen.dart:402-403, :935-956). No 'Expected delivery' line on cards, no 'Delivery window' or 'Fulfillment type' row on detail (fulfillmentType is used only for action gating :988 and the timeline :671). The only ETA anywhere is the transporter 'Est. delivery' row on the tracking screen (delivery_dashboard_screens.dart:244-247). Minor nuance: detail does show a raw 'Delivery: <deliveryMethod>' row (:709-710), but the agreed slot is nowhere visible — gap stands as partial/minor.
- **Frontend-side verification:** Behavior real, cite mispointed. The cited dashboard :2309-2317 ('Expected delivery: ...') is the seller-branch variant; the buyer card (renderBuyerOrderHistory) shows the window line at :1812-1825 ('Expected: ...'/'Delivered: ...' joined ' · ', hidden when cancelled) via getOrderDeliveryWindowLabels (lib/order-delivery-deadline.ts:194-232). Detail 'Delivery details' card verified at app/orders/[id]/page.tsx:1211-1263: Fulfillment type (:1218-1223), Delivery window (:1226-1240), Delivery fee (:1241-1263). The mobile gap (no window/fulfillment context on list or detail) stands; severity minor unchanged.

### 🟡 Minor · divergent — Low-rating review requirement not enforced

**ID:** `orders-buyer:ORDERS-10` · **Area:** Rating form - validation rule

**Impact:** Business-rule mismatch: mobile accepts 1-2 star ratings with no review text where the web blocks submission, so low-rating reviews arrive without the mandatory comment.

- **Frontend evidence:** GloboExpats_Frontend/components/order-action-modal.tsx:192-228 - review is required for rating <= 2 ('Review *' label, inline error 'Please provide a review for ratings below 3 stars.', Confirm disabled while rating<=2 && !review.trim()).
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:476-527 - the rating dialog has no validation: the review field is always 'Review (optional)' (:500-506), Submit is always enabled, and the body is sent as {rating, comment|reviewText} (:523-525).
- **Mobile-side verification:** _ratingDialog (orders_screen.dart:476-527) is shared by confirm-receipt and seller-rate: the review field is always labelled 'Review (optional)' (:500-506), Submit is unconditionally enabled (:519-521), and the body is sent as {rating, comment|reviewText} (:523-525). No rating<=2 review requirement or inline error exists anywhere in lib/ (grep 'below 3|provide a review' finds nothing). Business-rule divergence is real.
- **Frontend-side verification:** Frontend verified exactly. components/order-action-modal.tsx: label renders 'Review *' (rose) when rating <= 2 vs '(Optional)' (:190-197); inline error 'Please provide a review for ratings below 3 stars.' (:208-212); Confirm disabled while `rating === 0 || (rating <= 2 && !review.trim())` for CONFIRM_RECEIPT/RATE_BUYER/RATE_SELLER (:221-229). Business-rule divergence with no review enforcement on mobile; minor is right.

### 🟡 Minor · partial — Overdue uses only fulfillmentDeadline and is never re-evaluated

**ID:** `orders-buyer:ORDERS-11` · **Area:** Overdue detection - deadline sources and freshness

**Impact:** Orders lacking fulfillmentDeadline never show as overdue on mobile even though the web derives a deadline, and an order that lapses while the list is open stays 'ongoing' until a manual reload.

- **Frontend evidence:** GloboExpats_Frontend/lib/order-delivery-deadline.ts:40-60 - deadline precedence fulfillmentDeadline -> deliveryDeadline -> deliveryDueAt -> promisedDeliveryAt -> trip.proposedDeliveryTime -> max window end -> legacy date+slot; the dashboard recomputes groups every 30 s (app/expat/dashboard/page.tsx:638-641 ticker, grouping at :1725-1729 and :1940-1943).
- **Mobile evidence:** GloboExpats_Mobile/lib/models/order.dart:365-368 - overdue only when the order's fulfillmentDeadline parses and is past; the model has no deliveryDeadline/deliveryDueAt/promisedDeliveryAt/window-end fallback fields (grep finds none), and the group is computed once per fetch with no ticker (lib/screens/orders_screen.dart:41-48).
- **Mobile-side verification:** Order.group (models/order.dart:352-370) checks overdue only against fulfillmentDeadline; grep deliveryDeadline|deliveryDueAt|promisedDeliveryAt in lib/ finds nothing — the model parses no fallback deadline fields, and window-end derivation exists in delivery_windows.dart but is not fed into grouping. orders_screen.dart contains no Timer/periodic and no RefreshIndicator (grep confirms 0), so groups are computed once per fetch and never re-evaluated. Both halves of the claim verified.
- **Frontend-side verification:** Frontend verified (the claim's :40-60 cite points at the supporting helpers getNestedTripDeadline/readDeliveryWindows; the precedence itself is implemented in the same file at getOrderDeliveryDeadline, lib/order-delivery-deadline.ts:239-268: explicit fulfillmentDeadline -> deliveryDeadline -> deliveryDueAt -> promisedDeliveryAt (:241-249), then trip.proposedDeliveryTime (:251-252), then max window end (:254-258), then legacy date+slot (:260-267)). Dashboard re-evaluation verified: 30s orderStatusNow ticker :638-643 feeding grouping at :1724-1731 (buyer Active/Past) and :1938-1951 (seller tab counts). Severity minor right.

### 🟡 Minor · missing — No 'Delivery journey' milestone strip or 'Latest update' narrative card

**ID:** `orders-buyer:ORDERS-12` · **Area:** Order detail - buyer journey presentation

**Impact:** Mobile loses the buyer-friendly progress narrative and per-milestone descriptions; status is still conveyed by the generic timeline, so this is presentational rather than functional.

- **Frontend evidence:** GloboExpats_Frontend/app/orders/[id]/page.tsx:988 - 'Delivery journey' strip of 4 milestones with buyer copy ('Availability confirmed' :798, 'Ready for collection' :812, 'Out for delivery' :816) plus the 'Latest update' card (:1066) with per-index headlines/descriptions (:838-841).
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:669-674 - the detail renders only the shared OrderStatusTimeline; grep finds no journey strip or 'Latest update' card anywhere in lib/.
- **Mobile-side verification:** grep journey|latest update|milestone|Availability confirmed|Ready for collection across lib/ finds only the confirm-availability success message (orders_screen.dart:847). The detail renders the shared OrderStatusTimeline (orders_screen.dart:668-675) and nothing else narrative; no 4-milestone strip and no 'Latest update' card exist. Presentational gap as characterized (minor).
- **Frontend-side verification:** Frontend verified exactly. app/orders/[id]/page.tsx: 'Delivery journey' strip :987-1061 (grid-cols-4, aria-label 'Buyer delivery progress'); buyerJourneySteps :796-827 with 'Availability confirmed' :798, 'Ready for collection' :812, 'Out for delivery' :816, 'Collected' :822, 'Delivered' :824; 'Latest update'/'Order update' card :1064-1074 with per-index buyerStatusHeadline :829-841 and buyerStatusDescription :843-859. Presentational-only gap; minor is right.

### 🟡 Minor · partial — Production step missing from the delivery timeline

**ID:** `orders-buyer:ORDERS-13` · **Area:** Status timeline - made-to-order production step

**Impact:** The mobile timeline skips the production milestone for made-to-order orders; the information survives on the production card, so impact is cosmetic sequencing.

- **Frontend evidence:** GloboExpats_Frontend/components/orders/order-status-timeline.tsx:180-222 - a 'Production · N day(s)' step is inserted between confirm and the dispatch steps for non-rental orders with productionTimeDays and becomes current while production is outstanding.
- **Mobile evidence:** GloboExpats_Mobile/lib/widgets/order_status_timeline.dart:49-81 - delivery steps are placed/confirm/assigned/transit/delivered/done with no production step; production state is only shown via the separate ProductionTimeCard (lib/widgets/production_time_card.dart:53-107).
- **Mobile-side verification:** Delivery timeline steps are placed/confirm/assigned/transit/delivered/done (order_status_timeline.dart:49-81) with no production step; production state surfaces only through the separate ProductionTimeCard (orders_screen.dart:677-685, production_time_card.dart). Information survives on the card, so the sequencing omission is cosmetic — partial/minor as claimed.
- **Frontend-side verification:** Frontend verified. components/orders/order-status-timeline.tsx: for non-rental orders with productionTimeDays > 0 a step labeled `Production · ${n} day(s)` (mobileLabel 'Making') is spliced between confirm and the transit steps (:173-186, label at :180), and it becomes the current step while status is in {AWAITING_DELIVERY, AWAITING_PICKUP, SELLER_PREPARING_ORDER, AWAITING_BUYER_CONFIRMATION} and !productionCompletedAt (:212-222). Information survives on mobile via ProductionTimeCard, so minor/cosmetic is right.

### 🟡 Minor · partial — Transport label, inline delivery-OTP chip, refund badge, rating chip and item count missing from cards

**ID:** `orders-buyer:ORDERS-14` · **Area:** Orders list - card metadata

**Impact:** At-a-glance card context is thinner; notably the delivery code never appears on the list, so the buyer must open detail/tracking to see it.

- **Frontend evidence:** GloboExpats_Frontend/app/expat/dashboard/page.tsx:1746/:1798 - transport mode label via getLargestRequiredDeliveryMode ('Motorbike delivery' etc., :381-389); :2260-2268 inline emerald 'Delivery OTP' code chip; :2254-2258 amber refund badge (getRefundStatusLabel :2150-2152); :2528 'Pending rating' chip; :2302-2307 items count.
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:184-296 - the card renders thumbnail, title/orderNumber, status chip, total, counterparty name, date and the text hint only; none of the transport label, OTP code, refund badge, pending-rating chip or item count appear.
- **Mobile-side verification:** Four of five sub-claims verified: no transport-mode label on cards (TransportMode in delivery_fare.dart is checkout fare math only), no inline delivery-OTP chip (deliveryCode is never rendered in _OrderCard), no refund badge (refund appears only in the detail escrow banner, orders_screen.dart:722-723), no 'Pending rating' chip (ratings shown only as the detail line :788-794). But the 'item count missing' sub-claim is wrong: the card title renders '<first item> +$extraItems more' when there are additional items (orders_screen.dart:187, 229-231), conveying the count at a glance. Real gap, one detail mischaracterized — adjusted, severity stays minor.
- **Frontend-side verification:** Partly real, partly stale. Verified on the buyer card (renderBuyerOrderHistory): transport label via getBuyerOrderTransport at :1746 rendered :1796-1799 (labels at :376-403, 'Motorbike delivery' :389) and item count computed :1737-1740 rendered :1801-1803. NOT buyer-card-accurate anymore: the inline Delivery OTP chip :2260-2268, amber refund badge :2254-2258 (getRefundStatusLabel :2150-2152) and 'Pending rating' chip :2524-2530 are all in the seller-only branch since bc5a1f3 (early return :1998-2000) - buyer list cards render none of them (nor any status chips), so the web/mobile delta reduces to transport label + item count, and the web also no longer shows the delivery code on the list. Remaining gap is real but thin; minor unchanged.

### 🟡 Minor · partial — No receipt preview/viewer for uploaded proofs

**ID:** `orders-buyer:ORDERS-15` · **Area:** My Payments - receipt viewing

**Impact:** Mobile buyers cannot re-open the proofs they uploaded - e.g. to compare against a rejected receipt before re-uploading; rejection reasons are shown but the artifacts themselves are not viewable.

- **Frontend evidence:** GloboExpats_Frontend/components/dashboard/my-payments-panel.tsx:481-492 - collapsible 'View receipts (N)' rendering each receipt image/PDF via AuthenticatedReceiptPreview (authed object-URL fetch, lib/api.ts fetchReceiptFileObjectUrl).
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/my_payments_screen.dart:634-637 - the payment card shows only the text 'N receipt(s)'; no receipt preview or viewer exists in the screen (grep finds no receipt image rendering).
- **Mobile-side verification:** My Payments renders receipts only as the text 'N receipt(s)' (my_payments_screen.dart:634-637, also :635-637); receipts are parsed (:278-281) and used solely for grouping/badges (:287-293). grep for receipt image rendering finds nothing; the only receipt-file fetch in the repo is admin-only (adminReceiptFile -> /api/v1/admin/receipts/{id}/file, api_client.dart:2010-2020, used by admin_payments_review_screen). No buyer-side preview/viewer exists — buyers cannot re-open uploaded proofs.
- **Frontend-side verification:** Frontend verified. components/dashboard/my-payments-panel.tsx :478-498: collapsible <details> with summary 'View receipts ({n})' (:480-482) rendering each receipt with filename (:489-491) via AuthenticatedReceiptPreview (:492-494); the component (components/admin/admin-receipt-preview.tsx:16) fetches an authed object URL through lib/api.ts:3825 fetchReceiptFileObjectUrl. Buyer-facing panel unaffected by the dashboard card refactor; minor is right.

### 🟡 Minor · divergent — Generic card copy, no copy button, no pending-code placeholder

**ID:** `orders-buyer:ORDERS-16` · **Area:** Rental handoff code card (buyer)

**Impact:** Copy/wording divergence from the web (arrival vs pickup distinction lost) plus no copy affordance and no pending-code state; regenerate exists on both sides.

- **Frontend evidence:** GloboExpats_Frontend/components/orders/rental-handoff-code-card.tsx:108-158 - buyer card is kind-specific ('Arrival code'/'Pickup code' :115-117), includes a Copy button (:127-136) and shows 'Generating your code…' while the code is absent (:138-140).
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:774-787 with :1255-1314 - a single generic 'Rental handoff code' / 'Show this to the renter to start your rental.' card, no copy button, and the card renders only when rentalHandoffCode != null (no generating state).
- **Mobile-side verification:** The buyer rental card is the shared generic _DeliveryCodeCard with hardcoded title 'Rental handoff code' and subtitle 'Show this to the renter to start your rental.' (orders_screen.dart:778-787); _DeliveryCodeCard has no copy button (:1255-1314, no Clipboard anywhere in the file), and the card mounts only when rentalHandoffCode != null (:774), so there is no 'Generating your code…' placeholder. grep 'Arrival code|Pickup code|Generating your code' finds nothing; RentalPresentation kind (models/order.dart:102-125) drives only the timeline step label. All three divergences verified.
- **Frontend-side verification:** Frontend verified exactly. components/orders/rental-handoff-code-card.tsx buyer branch :108-163: kind-specific heading 'Arrival code'/'Pickup code' (:115-117), Copy icon button with aria 'Copy {handoffNoun} code' (:127-136), 'Generating your code…' placeholder when the code is absent (:138-140), 'Generate a new code' (:144-158). Mounted buyer-side on detail at app/orders/[id]/page.tsx:1632-1641. Copy/wording + affordance divergence; minor is right.

### 🟡 Minor · missing — No 'Explore Marketplace' CTA on the empty buying list

**ID:** `orders-buyer:ORDERS-17` · **Area:** Orders list - empty state

**Impact:** Dead-end empty state on mobile: a new buyer is given no path into the marketplace from the orders screen.

- **Frontend evidence:** GloboExpats_Frontend/app/expat/dashboard/page.tsx:1988 - the empty buying list offers an 'Explore Marketplace' button linking to /browse.
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:89-96 and :132-143 - empty states are plain grey text ('No orders yet.' / 'You have no buying orders yet.') with no action.
- **Mobile-side verification:** Both empty states are plain grey Text with no action: all-empty 'No orders yet.\nWhen you place an order it will appear here.' (orders_screen.dart:89-96) and per-tab 'You have no buying/selling orders yet.' (:132-143). No button, link or route push; the /browse route does exist (app_router.dart:104) so the CTA is feasible but absent. Dead-end empty state confirmed.
- **Frontend-side verification:** Frontend verified. app/expat/dashboard/page.tsx:1965-1993 - the zero-orders empty state renders inside renderOrdersList before the buying early-return at :1998, so the buying list gets it: 'No Purchases Found' (:1976) with a Button/Link to /browse (:1987) labeled 'Explore Marketplace' (:1988). Dead-end empty state on mobile; minor is right.

### 🟡 Minor · partial — No unit-price/subtotal/total fallback derivation and no 'Arranged after checkout' deferred-fee state

**ID:** `orders-buyer:ORDERS-18` · **Area:** Order totals - fallback chains and deferred fee state

**Impact:** On sparse payloads the mobile detail shows TSh 0 subtotal/fee or 0 unit prices where the web derives them, and cross-region orders whose fee is computed later show a bare 0 instead of the 'Arranged after checkout' explanation.

- **Frontend evidence:** GloboExpats_Frontend/lib/order-detail-view.ts:25-53 - getOrderItemUnitPrice chains unitPrice -> finalTotalSellingPrice -> price -> productPrice -> askingPrice, and subtotal/total fall back through itemsSubtotal/itemsTotal, line sums and grandTotal/orderTotal; deferred cross-region fee renders 'Arranged after checkout' (app/orders/[id]/page.tsx:1251).
- **Mobile evidence:** GloboExpats_Mobile/lib/models/order.dart:78 - effectiveUnitPrice = unitPrice ?? price only; :266-267 subtotal/deliveryFee default to 0 straight from the payload; lib/screens/orders_screen.dart:697-702 renders those values with no recomputation and no deferred-fee state.
- **Mobile-side verification:** effectiveUnitPrice is unitPrice ?? price only (models/order.dart:78-80) and OrderItem.fromJson reads only json['unitPrice'] (:60) — no finalTotalSellingPrice/productPrice/askingPrice fallback (those strings appear only in sell/edit-listing payloads). subtotal/deliveryFee/totalAmount come straight from the payload defaulting to 0 (models/order.dart:266-268) and the detail renders them verbatim (orders_screen.dart:699-702) with no recomputation. grep 'Arranged|deferred' across lib/ returns nothing — no 'Arranged after checkout' state. All sub-claims verified.
- **Frontend-side verification:** Frontend verified. lib/order-detail-view.ts: getOrderItemUnitPrice chain unitPrice -> finalTotalSellingPrice -> price -> productPrice -> askingPrice -> 0 (:25-34); getOrderFinancialSummary falls back through persisted subtotal ['subtotal','itemsSubtotal','itemsTotal'] (:46-48), line sums/unit-price*qty (:36-42), deliveryFee chain (:49-51) and total chain ['totalAmount','grandTotal','orderTotal','total'] (:52-54). 'Arranged after checkout' deferred-fee state on detail at app/orders/[id]/page.tsx:1250-1251 (also sidebar :1482-1483). Sparse-payload and cross-region display divergence; minor is right.

<details><summary><strong>Confirmed equivalent in both apps (20)</strong></summary>

- Status normalization and groups match: uppercase/trim/dashes, legacy CONFIRMED -> COMPLETED, humanized fallback for unknown statuses; completed {COMPLETED, DELIVERED, PICKED_UP}, cancelled {CANCELLED, FAILED, EXPIRED}, rentals complete only at COMPLETED/CONFIRMED (mobile lib/models/order.dart:338-387 mirrors web lib/order-status.ts / dashboard grouping).
- Buyer/seller/admin per-status label map matches the web wording ('Payment submitted - being verified', 'Awaiting payment verification', 'Driver assigned - dispatch in progress', 'Confirm the new delivery time', etc.) (models/order.dart:392-462).
- Per-status buyer action-hint copy and tones mirror web getOrderActionHint, including the suppressed legacy Mark Paid, IN_TRANSIT code hint, AWAITING_PICKUP no-CTA, DELIVERED/PICKED_UP rating prompts (lib/domain/order_action_hint.dart:129-187).
- Confirm Received / Rate Seller at PICKED_UP|DELIVERED (non-rental) via PATCH confirm-receipt {rating, comment}; standalone Rate Seller at COMPLETED + buyerRated==false via seller-rate (orders_screen.dart:623-628, 866-880, 1004-1016); rating dialog with 5 amber stars default 5 and optional review (:476-527).
- Delivery-code lifecycle: buyer code only from backend at IN_TRANSIT (never faked), 6-digit verify contract, server attemptsRemaining honored, 429/0 lockout copy 'Three attempts have been used...', regenerate resets attempts/unlock, buyer self-confirm gated on backend buyerCanConfirmDelivery (delivery_dashboard_screens.dart:110-172, 261-281; domain/delivery_code.dart).
- Rental handoff code card + regenerate at AWAITING_PICKUP (orders_screen.dart:453-472, 774-787); rental kind detection uses the same vehicle subcategory slugs and category-text rule (models/order.dart:102-125).
- Production timing states notApplicable/inProgress/overdue/complete, hour-ceiled remaining format, seller-only completion, dispatch gated until complete (domain/production_time.dart; widgets/production_time_card.dart:53-107).
- Status timeline sequences for delivery/pickup/rental with buyer/seller wording and rose cancelled/failed rendering (widgets/order_status_timeline.dart:49-167).
- Escrow banner states: escrowPending 'under review' checked before payoutStatus, HELD refinements per status, RELEASED, REFUND_PENDING, REFUNDED with amount formatting (domain/escrow.dart:19-88).
- My Payments parity is strong: Pending/Approved/Rejected/Expired tabs with live counts and ?paymentStatus= deep link; badge map incl. 'Action needed - new proof'; per-receipt rejection reasons with fileName; 48h correction window with 'remaining / overstayed' copy and hidden upload after the window; Continue payment -> /checkout?proforma=; Order link; dedicated load-error state with Try again; pull-to-refresh; 30s now ticker (my_payments_screen.dart).
- Checkout payment step parity: <=5 receipts x 5MB, transaction references, mandatory confirmation tick, success only on status PAYMENT_SUBMITTED, PROFORMA_EXPIRED dialog, cancel-invoice releases stock, 1h reservation copy; grand-total mismatch guard cancels the proforma and resyncs prices; round2 math and BUYER_PICKUP fee 0 (checkout_screen.dart; domain/checkout_proforma.dart:99-186).
- Proforma countdown: 1s tick, urgent <3h, expired state, visible only while PENDING_PAYMENT (domain/countdown.dart).
- Delivery windows: exactly 6 EAT composites TODAY/TOMORROW x MORNING/AFTERNOON/EVENING with 10-12/12-16/16-20 slot hours, past windows dropped, production shift with 'Earliest ·' label (domain/delivery_windows.dart).
- Dispatch timing: opens window start - 1h, 'Unlocks at HH:MM (Xm/Xh Ym)' label, blocker list rendered via kDispatchErrorMessages, timing-only unlock detection (domain/dispatch.dart:73-129; orders_screen.dart:935-983; domain/dispatch_errors.dart:16-32).
- Seller stock gate visible in the same order flow: AWAITING_SELLER_CONFIRMATION banner + Confirm availability / Can't fulfil with required reason, decline cancels and refunds buyer (orders_screen.dart:826-864, 533-586).
- Pending-action badge exists: bell = unread notifications + pending order actions from a decision tree mirroring the web's buyer/seller branches (domain/pending_actions.dart:47-209; widgets/globo_app_bar.dart:63-86) - note mobile computes it client-side from the orders list rather than calling GET /orders/pending-actions-count.
- Status-group filter chips All/Ongoing/Overdue/Completed/Cancelled on the list match the web's group buckets (orders_screen.dart:115-130).
- Notifications: buying/selling scoping rules, action filters, deep links to /orders/{id} and /account/payments, mark-all-read/delete-all, pull-to-refresh (account_misc_screens.dart; domain/notification_feed.dart).
- Money formatting (TZS no-decimals 'TSh 1,234,567') and detail Subtotal/Delivery fee/Total rows (models/order.dart:314-317; orders_screen.dart:697-702).
- Timestamp parsing tolerance (ISO+offset, naive ISO as UTC, Jackson arrays, epoch) and EAT display stamps on list/detail/payments (domain/time_utils.dart).

</details>


## Order management - seller side + transport/dispatch

### 🔴 CRITICAL · missing — Seller-facing dispatch action does not exist on mobile

**ID:** `orders-seller:ORDERS-01` · **Area:** Dispatch flow

**Impact:** An order that reaches READY_FOR_DISPATCH/AWAITING_DISPATCH can never be dispatched from the mobile app; the core v2 seller flow (assign -> wait for window -> dispatch -> IN_TRANSIT) stalls unless someone uses the web app or the admin console. The 'Dispatch items' CTA appears in mobile hints (lib/domain/order_action_hint.dart:97-106) as text only.

- **Frontend evidence:** GloboExpats_Frontend/app/expat/dashboard/page.tsx:1359-1371 - seller quick action on READY_FOR_DISPATCH/AWAITING_DISPATCH opens DISPATCH_ORDER (with isDispatchTooEarlyLocally guard); :1460 apiClient.dispatchOrder(orderId); :1483-1484 dispatch 409 mapped via getDispatchFailureMessage
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:1064-1067 - 'dispatch' exists only as an admin-panel button (_adminAction('dispatch')); lib/api/api_client.dart:2047 - 'dispatch': 'POST' present only in the admin verb map; the user orderAction map (api_client.dart:2085-2120) has no dispatch entry and no screen calls it
- **Mobile-side verification:** dispatch verb only admin map (api_client.dart:2047) + admin button (orders_screen.dart:1066); dispatch.dart banners exist, no seller caller.
- **Frontend-side verification:** Frontend evidence verified: app/expat/dashboard/page.tsx:1359-1371 quick action handles READY_FOR_DISPATCH/AWAITING_DISPATCH with isDispatchTooEarlyLocally guard (1361-1369) then DISPATCH_ORDER (1370); :1460 apiClient.dispatchOrder(orderId); :1482-1486 DISPATCH_ORDER errors mapped via getDispatchFailureMessage. Critical is right: dispatch is the core v2 seller transition to IN_TRANSIT.

### 🔴 CRITICAL · missing — Buyer delivery-time accept/counter-propose UI missing (PROPOSED trip loop unresolvable)

**ID:** `orders-seller:ORDERS-02` · **Area:** Delivery-time confirmation

**Impact:** A buyer on mobile cannot accept or counter-propose a delivery time, so an order sitting in AWAITING_BUYER_CONFIRMATION can never progress from the phone; the whole proposed->confirmed delivery-time loop is web-only.

- **Frontend evidence:** GloboExpats_Frontend/components/transporter/delivery-time-confirmation.tsx:108 - buyer banner 'Can you receive this delivery?' with confirm action; :146 - 'Request Another Delivery Time' counter-proposal dialog; lib/api.ts:3878 and :3891 - user PATCH /orders/{id}/delivery-time/confirm and /delivery-time/propose
- **Mobile evidence:** GloboExpats_Mobile/lib/api/api_client.dart:2042-2043 - 'delivery-time/confirm' and 'delivery-time/propose' exist only in the ADMIN verb map; grep of lib shows no other delivery-time reference and no propose/confirm UI; AWAITING_BUYER_CONFIRMATION renders only hint text (lib/domain/order_action_hint.dart:108-111 seller, :149-155 buyer)
- **Mobile-side verification:** delivery-time/confirm|propose only in admin verb map (api_client.dart:2042-2043); zero other refs; no accept/counter UI anywhere.
- **Frontend-side verification:** Verified: components/transporter/delivery-time-confirmation.tsx:108 'Can you receive this delivery?' with confirm button, :146 'Request Another Delivery Time' dialog; lib/api.ts:3878 PATCH /orders/{id}/delivery-time/confirm and :3891 PATCH .../propose. Banner renders only when trip.deliveryTimeStatus === 'PROPOSED' (:46), so an unresolvable PROPOSED loop blocks progress - critical correct.

### 🟠 Major · partial — Assignment never sends proposedDeliveryTime derived from the buyer's checkout window

**ID:** `orders-seller:ORDERS-03` · **Area:** Transporter assignment

**Impact:** Trips are created without the buyer's window-derived proposed time, so 'Est. delivery' renders as an em dash in tracking (lib/screens/delivery_dashboard_screens.dart:244-247) and the delivery-time state machine the web drives is fed no data.

- **Frontend evidence:** GloboExpats_Frontend/components/transporter/assign-transporter-modal.tsx:211-241 - proposedDeliveryTime computed via buildAssignmentDeliveryTime and sent in the assign payload; lib/delivery-assignment.ts:40-74 - resolved window start / slot-hour / next-day-10:00 fallbacks
- **Mobile evidence:** GloboExpats_Mobile/lib/widgets/assign_transporter_modal.dart:85 - assignTransporter(widget.token, widget.orderId, _pickedId!) with no time argument; lib/api/api_client.dart:999-1008 - proposedDeliveryTime/note params exist but no caller passes them
- **Mobile-side verification:** Param exists (api_client.dart:1001) but sole caller assign_transporter_modal.dart:85 passes only id; nothing derives checkout window.
- **Frontend-side verification:** Verified: assign-transporter-modal.tsx:211-224 computes proposedDeliveryTime via buildAssignmentDeliveryTime and sends it in the payload (:239-243 payload {transporterId, proposedDeliveryTime} -> apiClient.assignTransporter(orderId, payload)); lib/delivery-assignment.ts:40-74 implements resolvedStart-authoritative / slot-hour / next-day-10:00 EAT fallbacks. Major correct.

### 🟠 Major · missing — Transporter trips screen (/transporter equivalent) missing

**ID:** `orders-seller:ORDERS-04` · **Area:** Transporter workspace

**Impact:** Registered transporters have no trip workspace on mobile: no active-trip list, no per-stop Navigate, no buyer call/WhatsApp rows, no empty state; trip acceptance/verification is only reachable per-order from the buyer/seller detail screens.

- **Frontend evidence:** GloboExpats_Frontend/app/transporter/page.tsx:1 - role-gated 'My deliveries' trip list screen (TRANSPORTER role gate, trip cards with Navigate/Call/WhatsApp/code entry); lib/api.ts:3795 - GET /api/v1/transporter/trips
- **Mobile evidence:** GloboExpats_Mobile grep 'transporter/trips' across lib = 0 hits; tripCount is consumed only inside assign-modal rows (lib/widgets/assign_transporter_modal.dart:154); the closest surface is DeliveryTrackingScreen for a single order (lib/screens/delivery_dashboard_screens.dart:20)
- **Mobile-side verification:** Zero hits for /trips|my deliveries; tripCount only in assign modal (:154); nearest surface is per-order DeliveryTrackingScreen.
- **Frontend-side verification:** Verified: app/transporter/page.tsx exists ('Transporter app - the driver's view'), RouteGuard requireAuth + hasTransporterRole check on roles[].roleName === 'TRANSPORTER', isActiveTrip filter, TransporterTripCard with Navigate (:79), WhatsApp (:179), Confirm delivery (:213); lib/api.ts:3795 GET /api/v1/transporter/trips. Major correct.

### 🟠 Major · missing — Transporter registry management (edit, deactivate, photo, WhatsApp/notes, managers, search) missing

**ID:** `orders-seller:ORDERS-05` · **Area:** Transporter registry

**Impact:** Sellers cannot maintain their transporter team from mobile: no editing, deactivation, photos, WhatsApp/notes fields, manager management, or server-side search; the registry can only grow.

- **Frontend evidence:** GloboExpats_Frontend/app/expat/dashboard/page.tsx:2852 - SellerTransportersPanel rendered as the Transporters sub-tab; lib/api.ts:3599-3609 PATCH /admin/transporters/{id} (Save changes), :3656-3663 photo upload/delete, :3672-3713 managers list/remove
- **Mobile evidence:** GloboExpats_Mobile/lib/widgets/assign_transporter_modal.dart:162-187 - only an inline create form exists; lib/api/api_client.dart:969-994 - the API client exposes only GET /transporters?active=true and POST /transporters (no update/photo/manager methods)
- **Mobile-side verification:** api_client.dart:963-994: only GET /transporters + POST; no PATCH/photo/managers/search caller outside admin map; no registry screen.
- **Frontend-side verification:** Verified: dashboard/page.tsx:2852 renders SellerTransportersPanel; panel has server-side search (getManagedTransporters(search)), updateTransporter Save changes (:233), managers list/remove; lib/api.ts:3598-3600 PATCH /api/v1/admin/transporters/{id} (+DELETE deactivate at :3609), photo POST/DELETE :3653-3666, managers GET/POST/DELETE :3668-3716. Major correct.

### 🟠 Major · divergent — Assign modal lists all active transporters instead of the seller-managed, fail-closed scope

**ID:** `orders-seller:ORDERS-06` · **Area:** Transporter assignment

**Impact:** A mobile seller sees and can select every vendor's active drivers; the backend then rejects with TRANSPORTER_NOT_LINKED_TO_SELLER, which mobile surfaces as a raw error string (assign_transporter_modal.dart:88-93) instead of the web's explanatory mapping.

- **Frontend evidence:** GloboExpats_Frontend/components/transporter/assign-transporter-modal.tsx:139 - getAssignableTransporters(list, false) for the seller path; lib/transporter-scope.ts:13-17 - getSellerManagedTransporters requires managedByCurrentUser === true AND relationshipRole OWNER/MANAGER (deliberately fail-closed)
- **Mobile evidence:** GloboExpats_Mobile/lib/api/api_client.dart:969-981 - fetchTransporterRegistry sends only active=true and applies no managed/relationship filter; lib/widgets/assign_transporter_modal.dart:139-158 - every returned row is rendered and selectable
- **Mobile-side verification:** fetchTransporterRegistry sends only active=true (api_client.dart:971-973); no managedByCurrentUser anywhere; modal renders all rows (:139-158).
- **Frontend-side verification:** Verified: assign-transporter-modal.tsx:139 getAssignableTransporters(list, false) then filters by transporterMatchesDeliveryMode; lib/transporter-scope.ts:13-17 getSellerManagedTransporters requires managedByCurrentUser === true AND relationshipRole OWNER/MANAGER, with the fail-closed rationale in the doc comment. Major correct.

### 🟠 Major · partial — Availability confirmation reduced to a banner - no per-item checklist, payouts, or production-day framing

**ID:** `orders-seller:ORDERS-07` · **Area:** Availability gate

**Impact:** The escrow-gate decision (confirm stock before the buyer's held money moves forward) is made on mobile with far less information and no per-item verification ritual; the seller also never sees the per-order payout totals the web shows.

- **Frontend evidence:** GloboExpats_Frontend/components/orders/seller-availability-gate.tsx:88 - confirm disabled until every item checkbox is checked; :155-165 - 'Confirm only if you can make or prepare the order within N calendar day(s)'; :170-180 - per-item rows 'Buyer paid'/'You receive (payout*qty)'; :115-123 - decline reason required with destructive toast
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:826-864 - a static amber banner plus 'Confirm availability'/'Can't fulfil' buttons; no per-item checkboxes, no paid/payout totals, no production-days copy, no escrow-holding framing beyond one sentence
- **Mobile-side verification:** Static amber banner + 2 buttons (orders_screen.dart:826-862); no per-item checkboxes, payouts or production-days copy.
- **Frontend-side verification:** Verified: seller-availability-gate.tsx:88 allItemsChecked gates confirm (disabled at :242, button 'Confirm all checked items'); :155-165 production-days copy verbatim; per-item rows 'Buyer paid:' (:210-211) and 'You receive:' payout*qty (:213-217); :115-123 decline reason destructive toast 'Reason required'. Totals 'Order paid'/'Seller receives' at :232-235. Major correct.

### 🟠 Major · BROKEN — Transporter assignment offered while production is still incomplete

**ID:** `orders-seller:ORDERS-08` · **Area:** Production gate

**Impact:** Mobile guides the seller to assign a transporter before made-to-order production is complete; the backend then rejects assignment/dispatch with PRODUCTION_NOT_COMPLETE and mobile shows the raw 409 with no 'mark production complete first' guidance, unlike the web's dedicated lock UX.

- **Frontend evidence:** GloboExpats_Frontend/app/expat/dashboard/page.tsx:1351 - quick action returns early when !canAssignTransporterAfterProduction(order); :2080-2085 - status label overridden to 'Production in progress'; :2138 - hint 'Finish making or preparing the item, then mark production complete before assigning a transporter.'; app/orders/[id]/page.tsx:692-703 - canAssignTransporter requires productionAllowsAssignment
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:986-988 - 'Arrange transport' shown for selling + PAID/AWAITING_DELIVERY + SELLER_DELIVERY with no production check; lib/domain/order_action_hint.dart:78-87 - PAID/AWAITING_DELIVERY hint offers 'Assign a driver and dispatch this order.' regardless of production state
- **Mobile-side verification:** 'Arrange transport' gated only by status+SELLER_DELIVERY (orders_screen.dart:986-988); no production-complete check.
- **Frontend-side verification:** Verified: dashboard/page.tsx:1351 quick action returns early when !canAssignTransporterAfterProduction(order); :2078-2087 status label override 'Production in progress'; :2136-2145 hint 'Finish making or preparing the item, then mark production complete before assigning a transporter.'; app/orders/[id]/page.tsx:692-703 canAssignTransporter requires productionAllowsAssignment. Major correct.

### 🟠 Major · divergent — Cancel offered to the seller in paid/escrow states

**ID:** `orders-seller:ORDERS-09` · **Area:** Cancellation

**Impact:** Post-payment cancellation (money held in escrow) is directly reachable from mobile, a transition the web deliberately reserves for the availability-decline full-refund path; a misc tap on a PAID order fires seller-cancel where web shows no such button.

- **Frontend evidence:** GloboExpats_Frontend/app/orders/[id]/page.tsx:900-909 - Cancel button rendered only when status is PENDING or AWAITING_PAYMENT (even though isSellerActionable covers more statuses at :668-678)
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:632-634 - _sellerFulfillable includes PAID/PROCESSING/AWAITING_PICKUP; :1033-1045 - Cancel button rendered for _sellerFulfillable OR PENDING/AWAITING_PAYMENT, calling PATCH seller-cancel
- **Mobile-side verification:** _sellerFulfillable adds PAID/PROCESSING/AWAITING_PICKUP (orders_screen.dart:632-634) and Cancel shows for it (:1033-1045).
- **Frontend-side verification:** Verified: app/orders/[id]/page.tsx Cancel button renders only for ['PENDING','AWAITING_PAYMENT'].includes(status) (~:900-909) even though isSellerActionable (:668-678) covers AWAITING_PICKUP/AWAITING_DELIVERY/PAID/AWAITING_BUYER_CONFIRMATION/IN_TRANSIT. Web indeed reserves post-payment cancellation for the availability-decline path. Major correct.

### 🟠 Major · divergent — 'Mark delivered' exposed for v2 SELLER_DELIVERY orders, bypassing the delivery-code release path

**ID:** `orders-seller:ORDERS-10` · **Area:** Escrow release

**Impact:** The seller can mark a SELLER_DELIVERY order delivered from the phone without the buyer's OTP, a transition the web hides because escrow release is supposed to go through code verification (or buyer self-confirm); money-affecting status divergence.

- **Frontend evidence:** GloboExpats_Frontend/app/orders/[id]/page.tsx:685-691 - canMarkFulfilled explicitly excludes LOGISTICS_V2_ENABLED && fulfillmentType === 'SELLER_DELIVERY' ('delivery orders confirm delivery via the buyer's code'); :887-898 - button hidden accordingly
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:896-910 - 'Mark delivered' shown for selling + IN_TRANSIT/AWAITING_PICKUP with no fulfillmentType gate, calling PATCH mark-delivered
- **Mobile-side verification:** 'Mark delivered' for selling IN_TRANSIT/AWAITING_PICKUP (orders_screen.dart:896-910) with no fulfillmentType/LOGISTICS_V2 gate.
- **Frontend-side verification:** Verified: app/orders/[id]/page.tsx:685-691 canMarkFulfilled excludes LOGISTICS_V2_ENABLED && fulfillmentType === 'SELLER_DELIVERY' with the exact comment 'delivery orders confirm delivery via the buyer's code (DeliveryCodeCard), so hide the manual "Mark Delivered" fallback there'; Mark Delivered button hidden at :887-898. Major correct (money-path divergence via escrow release).

### 🟠 Major · missing — 'Manage delivery' card absent from mobile order detail (transporter/vehicle/window/status grid, Call/WhatsApp/Share location, map links)

**ID:** `orders-seller:ORDERS-11` · **Area:** Order detail logistics

**Impact:** From an order, a mobile seller cannot call or WhatsApp the assigned driver, share the delivery pin, or open the buyer's map pin; all contact/navigation affordances are web-only.

- **Frontend evidence:** GloboExpats_Frontend/app/orders/[id]/page.tsx:1410-1442 and :2009-2045 - Call (tel:), WhatsApp (getWhatsAppUrl) and 'Share location' (buildDeliveryWhatsAppUrl) buttons on the delivery card; :2086 - 'Assign transporter'/'Change transporter'; :1314/:1563/:2306 - 'Open delivery location' Google Maps links
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/delivery_dashboard_screens.dart:225-247 - tracking screen shows transporter/phone/status/est-delivery as plain text rows with no actions; lib/screens/orders_screen.dart:796-806 - detail offers only a 'Track delivery' button; grep for wa.me/tel:/maps links in the order screens returns nothing
- **Mobile-side verification:** No whatsapp/tel: in order screens; tracking shows 4 text rows (delivery_dashboard_screens.dart:225-247); detail has only Track delivery.
- **Frontend-side verification:** Verified: app/orders/[id]/page.tsx:1410-1442 (seller card) and :2009-2045 (buyer card) have tel: Call, getWhatsAppUrl WhatsApp (#25D366), 'Share location' via deliveryShareUrl; :2080-2092 'Change transporter'/'Assign transporter' button; 'Open delivery location' Google Maps links at :1314/:1563/:2306 exactly as cited. Major correct.

### 🟠 Major · missing — Buyer's selected delivery windows are never displayed on mobile orders

**ID:** `orders-seller:ORDERS-12` · **Area:** Delivery windows

**Impact:** Sellers and buyers on mobile can never see which delivery window(s) the buyer selected - the data that drives dispatch timing and handoff expectations is invisible.

- **Frontend evidence:** GloboExpats_Frontend/app/expat/dashboard/page.tsx:2313 - card line 'Expected delivery:'; lib/order-delivery-deadline.ts:174-232 - getOrderDeliveryWindowLabels renders stored startsAt/endsAt or '{Today|Tomorrow} {Morning (10:00-12:00)|...}' per window
- **Mobile evidence:** GloboExpats_Mobile/lib/models/order.dart:294-304 - deliveryWindowFields parsed and kept verbatim, but no screen renders them: detail rows are only Subtotal/Delivery fee/Total/Seller/Address/City/Method (lib/screens/orders_screen.dart:697-710); grep 'Expected delivery' in lib = 0 hits
- **Mobile-side verification:** deliveryWindowFields used only for dispatchUnlockLabel (orders_screen.dart:403); detail rows :697-710 never render window labels.
- **Frontend-side verification:** Verified: dashboard/page.tsx:2313 'Expected delivery:' + deliveryWindowLabels.join(' · '); lib/order-delivery-deadline.ts:174-232 SLOT_LABELS ('Morning (10:00-12:00)' etc.) and getOrderDeliveryWindowLabels rendering stored startsAt/endsAt or '{Today|Tomorrow|d MMM} {slot}'. Major correct.

### 🟠 Major · BROKEN — Order transport requirement ignored when assigning: no required-vehicle lock, no GUTA option, free default MOTORBIKE

**ID:** `orders-seller:ORDERS-13` · **Area:** Vehicle-mode matching

**Impact:** Mobile sellers can assign a vehicle-class-mismatched driver (leading to 409 TRANSPORT_MODE_MISMATCH at dispatch, shown raw), and GUTA/Guta-Toyo transporters cannot be represented at all, so those orders cannot be correctly assigned from mobile.

- **Frontend evidence:** GloboExpats_Frontend/components/transporter/assign-transporter-modal.tsx:106 - requiredVehicleType = getRequiredTransporterVehicleType(orderContext.requiredTransportMode); :154-156 and :178 - new-transporter vehicle locked to the required type; :470-474 - Select disabled when requiredVehicleType set; lib/transporter-vehicles.ts:36,59 - mode-to-vehicle derivation incl. GUTA
- **Mobile evidence:** GloboExpats_Mobile/lib/widgets/assign_transporter_modal.dart:39-47 - fixed option list (MOTORBIKE/TRICYCLE/CAR/MINI_TRUCK/SEMI_TRUCK - no GUTA), default MOTORBIKE; :172-179 - DropdownButtonFormField freely changeable, never derived from or locked to the order's requirement
- **Mobile-side verification:** Fixed MOTORBIKE..SEMI_TRUCK list, default MOTORBIKE, free dropdown (:39-47,172-179); GUTA + requiredTransportMode: zero hits.
- **Frontend-side verification:** Verified: assign-transporter-modal.tsx:106 requiredVehicleType = getRequiredTransporterVehicleType(orderContext?.requiredTransportMode); :153-156 new-transporter vehicle preset to required type; :474 Select disabled={Boolean(requiredVehicleType)}; lib/transporter-vehicles.ts:18-25 mode map includes GUTA: 'GUTA' (options list :10 'Guta / Toyo'), matcher :55-61. Major correct.

### 🟠 Major · missing — Seller-side rental handoff code verification missing (rental cannot be started from mobile)

**ID:** `orders-seller:ORDERS-14` · **Area:** Rental handoff

**Impact:** A renter arrives with a six-digit code and the seller on mobile has no way to verify it; the rental-start transition is web-only, while mobile exposes the cruder mark-picked-up shortcut.

- **Frontend evidence:** GloboExpats_Frontend/app/expat/dashboard/page.tsx:2120 - seller card CTA 'Enter handoff code' for rental AWAITING_PICKUP; components/orders/rental-handoff-code-card.tsx:77 - verifyRentalHandoff(orderId, code); lib/api.ts:3294-3295 - POST /orders/{id}/verify-rental-handoff
- **Mobile evidence:** GloboExpats_Mobile/lib/api/api_client.dart:2052 - 'verify-rental-handoff' exists only in the admin verb map with no screen caller; the rental handoff card is buyer-only (lib/screens/orders_screen.dart:774-776 requires !o.isSelling) and a selling rental at AWAITING_PICKUP offers only 'Mark picked up' (:883-894)
- **Mobile-side verification:** verify-rental-handoff only in admin map (api_client.dart:2052); code card buyer-only (orders_screen.dart:774-776); no seller verify caller.
- **Frontend-side verification:** Verified: dashboard/page.tsx:2120 seller rental CTA 'Enter handoff code'; components/orders/rental-handoff-code-card.tsx:77 apiClient.verifyRentalHandoff(orderId, code); lib/api.ts:3294-3295 POST /orders/{id}/verify-rental-handoff. Major correct (rental start transition is web-only per this evidence).

### 🟠 Major · missing — Seller Payments sub-tab and payment-proof-rejected handling missing (no paymentNeedsNewProof concept)

**ID:** `orders-seller:ORDERS-15` · **Area:** Seller payments visibility

**Impact:** Rejected-payment-proof state ('Delivery remains paused until corrected payment proof is approved') and the seller-side payments view do not exist on mobile; delivery-paused-because-of-payment is not represented.

- **Frontend evidence:** GloboExpats_Frontend/app/expat/dashboard/page.tsx:757 - Orders area sub-tabs include Payments (and Transporters) under v2; :2442 - 'Upload new proof' routes to /expat/dashboard?tab=orders&sub=payments&paymentStatus=rejected
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/delivery_dashboard_screens.dart:646-689 - a Payments sub-view exists only under the Buying tab (buyer MyPaymentsScreen); the Selling tab renders only SellerListingsScreen (:497); grep paymentNeedsNewProof/'Upload new proof' in lib = 0 hits
- **Mobile-side verification:** paymentNeedsNewProof/'Upload new proof': zero hits; Payments views are buyer (my_payments_screen.dart) + admin only.
- **Frontend-side verification:** Verified: dashboard/page.tsx:756-771 sub-tab state includes 'payments' and 'transporters'; :2840 and :2851 render them only under LOGISTICS_V2_ENABLED; :2441-2447 'Upload new proof' routes to '/expat/dashboard?tab=orders&sub=payments&paymentStatus=rejected'; paymentNeedsNewProof drives 'Payment proof rejected - action required' label (:2086-2087). Major correct.

### 🟡 Minor · missing — Dispatch readiness auto-refresh scheduling absent - unlock banner is static

**ID:** `orders-seller:ORDERS-16` · **Area:** Order detail logistics

**Impact:** When the unlock instant passes, mobile keeps showing the stale 'Unlocks at HH:MM' banner until the user re-enters the screen; combined with the missing dispatch action the seller has no timed path to dispatch.

- **Frontend evidence:** GloboExpats_Frontend/app/expat/dashboard/page.tsx:1049-1092 - single setTimeout scheduled at dispatchOpensAt+2s (bounded: 4 attempts, 5s backoff, 6h horizon) that refetches orders when the dispatch window opens; lib/order-delivery-deadline.ts:134-150 - getDispatchReadinessCheckDelay
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:935-956 - the dispatch-unlock banner is recomputed only on rebuild; grep Timer across lib shows no dispatch/readiness scheduling (only quote watchdog, proforma countdown, tickers)
- **Mobile-side verification:** No Timer in orders_screen.dart (grep); unlock banner recomputed on rebuild only (:935-956 via :403).
- **Frontend-side verification:** Verified: dashboard/page.tsx:1049-1092 single setTimeout scheduled at the soonest getDispatchReadinessCheckDelay across timing-locked orders, bounded (4 checks, 5s backoff base, 6h max schedule); lib/order-delivery-deadline.ts:134-150 implements it with the named constants. Minor correct (auto-refresh polish on top of a lock banner).

### 🟡 Minor · partial — Timeline lacks the 'Production - N day(s)' step and the awaiting-production current-index override

**ID:** `orders-seller:ORDERS-17` · **Area:** Status timeline

**Impact:** On made-to-order orders the mobile tracker jumps from 'Confirm item availability' straight to 'Assign rider', hiding the production stage the web tracks.

- **Frontend evidence:** GloboExpats_Frontend/components/orders/order-status-timeline.tsx:173-181 - extra step label 'Production · N day(s)' (mobileLabel 'Making') inserted when productionDays > 0 and not rental; :213-222 - awaitingProduction override of currentIndex
- **Mobile evidence:** GloboExpats_Mobile/lib/widgets/order_status_timeline.dart:49-124 - delivery/pickup/rental sequences contain no production step and no awaiting-production index override
- **Mobile-side verification:** No production step in any sequence (order_status_timeline.dart:49-124); production shown only via separate ProductionTimeCard.
- **Frontend-side verification:** Verified: components/orders/order-status-timeline.tsx:180-181 label 'Production · N day(s)' with mobileLabel 'Making'; :213-222 awaitingProduction override of currentIndex (productionIndex when awaiting). Minor correct.

### 🟡 Minor · divergent — Overdue deadline uses only fulfillmentDeadline (no deliveryDeadline/deliveryDueAt/promisedDeliveryAt/trip/window-end fallbacks)

**ID:** `orders-seller:ORDERS-18` · **Area:** Overdue grouping

**Impact:** For orders that carry any of the later-precedence deadline fields but no fulfillmentDeadline, web groups them as Overdue while mobile keeps them Ongoing (and vice versa for window-end fallbacks); Overdue tab membership diverges.

- **Frontend evidence:** GloboExpats_Frontend/lib/order-delivery-deadline.ts:239-268 - getOrderDeliveryDeadline precedence: fulfillmentDeadline -> deliveryDeadline -> deliveryDueAt -> promisedDeliveryAt -> trip.proposedDeliveryTime -> max window end -> legacy date+slot
- **Mobile evidence:** GloboExpats_Mobile/lib/models/order.dart:365-368 - group.overdue is decided solely by fulfillmentDeadline being past
- **Mobile-side verification:** order.dart:365-367 overdue keyed solely to fulfillmentDeadline; no deliveryDeadline/promisedDeliveryAt/window fallbacks.
- **Frontend-side verification:** Verified: lib/order-delivery-deadline.ts:239-268 getOrderDeliveryDeadline precedence exactly fulfillmentDeadline -> deliveryDeadline -> deliveryDueAt -> promisedDeliveryAt -> trip.proposedDeliveryTime -> max window end -> legacy date+slot (MORNING/AFTERNOON/EVENING only). Minor correct.

### 🟡 Minor · divergent — Low-rating review not required on mobile (web blocks submit for ratings 1-2 without review)

**ID:** `orders-seller:ORDERS-19` · **Area:** Ratings validation

**Impact:** A 1-2 star rating with empty review can be submitted from mobile, which the web's validation prevents - inconsistent review data quality between platforms.

- **Frontend evidence:** GloboExpats_Frontend/components/order-action-modal.tsx:192-208 - rose border + inline error 'Please provide a review for ratings below 3 stars.'; :228 - Confirm disabled when rating === 0 || (rating <= 2 && !review.trim())
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:476-527 - rating dialog defaults to 5, review always optional, no validation before submit
- **Mobile-side verification:** Rating dialog defaults 5, review optional, no low-rating validation (orders_screen.dart:476-527).
- **Frontend-side verification:** Verified: components/order-action-modal.tsx rose border on empty review when rating <= 2 (:199-202) and inline error 'Please provide a review for ratings below 3 stars.' (:206-208); Confirm disabled when rating === 0 || (rating <= 2 && !review.trim()) in the footer disabled expression (~:225-234). Minor correct.

### 🟡 Minor · divergent — Cancel reason optional on mobile (web requires a non-empty reason)

**ID:** `orders-seller:ORDERS-20` · **Area:** Cancellation validation

**Impact:** Same endpoint, different business rule: web forces a stated reason for every cancellation; mobile permits reason-free cancellations.

- **Frontend evidence:** GloboExpats_Frontend/components/order-action-modal.tsx:223-224 - Confirm disabled while (action === 'CANCEL_ORDER' && !reason.trim()); :116 - 'Please provide a reason for cancelling this order.'
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:596-620 - cancel dialog reason field has no required validation; blank reason is silently sent as 'Operational reasons'
- **Mobile-side verification:** Cancel dialog sends 'Operational reasons' when blank (orders_screen.dart:616-620); no required validation.
- **Frontend-side verification:** Verified: components/order-action-modal.tsx:116 CANCEL_ORDER description 'Please provide a reason for cancelling this order.'; Confirm disabled while (action === 'CANCEL_ORDER' && !reason.trim()) in the footer disabled expression (~:225-227). Minor correct.

### 🟡 Minor · partial — Inline transporter create form lacks required-field validation and WhatsApp/notes/photo fields

**ID:** `orders-seller:ORDERS-21` · **Area:** Transporter creation

**Impact:** Mobile can create transporters with empty name/phone (raw backend error surfaced) and cannot capture WhatsApp/notes/photo, producing thinner registry records than web.

- **Frontend evidence:** GloboExpats_Frontend/components/transporter/assign-transporter-modal.tsx:167 - toast 'Missing information'/'Transporter name and phone number are required.' when name/phone blank; plus a photo picker (JPEG/PNG/WebP <=5MB) and WhatsApp number field on the add form
- **Mobile evidence:** GloboExpats_Mobile/lib/widgets/assign_transporter_modal.dart:49-58 - _create() posts fullName/phoneNumber as typed (empty strings included) with no validation, and the form (:162-179) has no WhatsApp, notes, or photo fields
- **Mobile-side verification:** _create posts empty name/phone as typed (assign_transporter_modal.dart:49-58); form has no WhatsApp/notes/photo (:162-179).
- **Frontend-side verification:** Verified: assign-transporter-modal.tsx:163-171 'Missing information' / 'Transporter name and phone number are required.' toast; WhatsApp number field (:455-466); TransporterPhotoPicker mounted in the add form (:427-432) with MAX_PHOTO_SIZE = 5*1024*1024 and JPEG/PNG/WebP accept in transporter-photo-picker.tsx:10-11/:75. Minor correct.

### 🟡 Minor · divergent — Seller verify card depends on a role-resolution fetch and is silently hidden when it fails

**ID:** `orders-seller:ORDERS-22` · **Area:** Delivery code verification

**Impact:** If the user-details or order fetch hiccups, the mobile seller loses the OTP verification surface entirely (and with it the escrow-release step) until a successful retry, where the web always offers the code card for their own orders.

- **Frontend evidence:** GloboExpats_Frontend/app/expat/dashboard/page.tsx:1355-1357 and :4568 - for a selling IN_TRANSIT order the DeliveryCodeCard dialog opens directly from the order (no role endpoint involved)
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/delivery_dashboard_screens.dart:61-88 - _resolveRole() must succeed (getUserDetails + order refetch) before the seller _CodeVerifyCard mounts (:250), otherwise the card stays hidden ('Role unknown -> keep the card hidden')
- **Mobile-side verification:** _resolveRole failure leaves _isSellerView=false so card stays hidden (delivery_dashboard_screens.dart:83-87, gate :250).
- **Frontend-side verification:** Verified: dashboard/page.tsx:1355-1357 IN_TRANSIT selling quick action opens the delivery-code dialog directly (no role-resolution fetch); :4565+ renders DeliveryCodeCard perspective="seller" from sellerQuickAction. Minor correct.

### 🟡 Minor · divergent — 'Delivery information needs attention' banner with repair links replaced by a passive filter chip

**ID:** `orders-seller:ORDERS-23` · **Area:** Listings logistics hygiene

**Impact:** Same detection, weaker surfacing: mobile never proactively tells the seller their listing's logistics setup is unfinished - the seller must apply the filter to discover it.

- **Frontend evidence:** GloboExpats_Frontend/app/expat/dashboard/page.tsx:3194 - 'Delivery information needs attention' banner on the Listings tab; :582-590 - repair link labels 'Select a mode of transport'/'Confirm the pickup pin'/'Fix pickup and transport details' routing to /edit-listing/{id}
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/seller_listings_screen.dart:123-133 - identical _needsAttention detection (deliverySetupReady/coordinatesSource/transportModeSource) but used only as the 'attention' filter chip (:273); edit is reachable via a row action (:489)
- **Mobile-side verification:** _needsAttention (:123-134) feeds only the 'attention' filter chip (:273); no banner or repair links.
- **Frontend-side verification:** Verified: dashboard/page.tsx:3194 'Delivery information needs attention' banner on Listings tab; :579-591 getLogisticsRepairLabel returns 'Select a mode of transport' / 'Confirm the pickup pin' / 'Fix pickup and transport details'; :3323-3328 repair link navigates to /edit-listing/{id}. Minor correct.

### 🟡 Minor · missing — Seller payout summary ('Seller gets' / 'GloboExpats gets') missing from mobile order detail

**ID:** `orders-seller:ORDERS-24` · **Area:** Seller pricing

**Impact:** A mobile seller cannot see what they will receive and what GloboExpats takes on a specific order; payout visibility is web-only.

- **Frontend evidence:** GloboExpats_Frontend/app/orders/[id]/page.tsx:712-756 - sellerPricing computed per item (stored sellerPayout else reverse commission fallback) gated to isSellerViewing; :2386-2396 - 'Seller gets' / 'GloboExpats gets' summary rows
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:697-710 - detail totals show only Subtotal/Delivery fee/Total; grep sellerPayout in lib shows usages only in sell wizard/edit-listing/commission code, none in the order screens
- **Mobile-side verification:** sellerPayout: zero hits in orders_screen.dart; detail totals only Subtotal/Delivery fee/Total (:697-710).
- **Frontend-side verification:** Verified: app/orders/[id]/page.tsx:712-756 sellerPricing reduce (stored sellerPayout else reverse calculateCommissionPricing fallback), gated by isSellerViewing/showSellerPricing (:757-758); 'Seller gets' / 'GloboExpats gets' summary rows at ~:2381-2400. Minor correct.

### 🟡 Minor · divergent — No pagination, no pull-to-refresh, no stale-while-revalidate cache on the mobile orders list

**ID:** `orders-seller:ORDERS-25` · **Area:** Orders list data behavior

**Impact:** Mobile order lists load once per screen entry: large histories render unpaged, data goes stale until the screen is reopened, and a failed fetch shows only an error with no cached fallback.

- **Frontend evidence:** GloboExpats_Frontend/app/expat/dashboard/page.tsx:1960 - filteredOrders.slice(...) implements 10-per-page pagination with live group counts; the dashboard keeps a per-user cache and refetches while keeping the old list rendered (stale-while-revalidate)
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:41-43 - a single Future fetch on widget init; :144-150 - plain ListView.separated over the full filtered set; no RefreshIndicator/pull-to-refresh anywhere in the file (grep confirms)
- **Mobile-side verification:** No RefreshIndicator/Timer in orders_screen.dart (grep); single init future + plain ListView; sibling screens do have RefreshIndicator.
- **Frontend-side verification:** Verified: dashboard/page.tsx:1959-1964 filteredOrders.slice pagination at itemsPerOrderPage = 10 (:776) with clamped shared page; stale-while-revalidate/keep-list-on-failure confirmed (:1042-1045 comment and sessionStorage cache per inventory 7.1). Minor correct.

### 🟡 Minor · divergent — 'Mark production complete' not status-gated (web hides it in PENDING/AWAITING_PAYMENT/AWAITING_SELLER_CONFIRMATION/IN_TRANSIT/etc.)

**ID:** `orders-seller:ORDERS-26` · **Area:** Production completion

**Impact:** In lifecycle stages where the web suppresses the completion button (e.g. already IN_TRANSIT), mobile still offers 'Mark production complete'; the backend rejects it and mobile shows the raw failure.

- **Frontend evidence:** GloboExpats_Frontend/app/orders/[id]/page.tsx:1756-1763 - canComplete={selling && !['PENDING','AWAITING_PAYMENT','AWAITING_SELLER_CONFIRMATION','IN_TRANSIT',...].includes(status)}
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:680-684 - ProductionTimeCard receives canComplete: perspective == 'seller' with no status exclusion; the card shows the button whenever production timing data exists and is incomplete (lib/widgets/production_time_card.dart:94-106)
- **Mobile-side verification:** canComplete: perspective=='seller' only (orders_screen.dart:682); button shows whenever timing incomplete (production_time_card.dart:94).
- **Frontend-side verification:** Verified: app/orders/[id]/page.tsx:1754-1771 canComplete={orderType === 'selling' && !['PENDING','AWAITING_PAYMENT','AWAITING_SELLER_CONFIRMATION','IN_TRANSIT','PICKED_UP','DELIVERED','COMPLETED','CANCELLED','FAILED','EXPIRED'].includes(status)} - exact exclusion list as claimed (claim's 'selling' shorthand for orderType === 'selling' is a faithful paraphrase). Minor correct.

#### Second-pass candidates (7) — unverified

_Found by an independent re-audit of this domain (different inventory pass). Not adversarially verified; wording may overlap a canonical gap above._

- **🟠 Major · BROKEN — Vehicle-type enum diverges: mobile sends TRICYCLE/MINI_TRUCK/SEMI_TRUCK; web registry enum is BAJAJI/GUTA/VAN/TRUCK/OTHER**
  - Impact: Transporters created from mobile store vehicle-type values the web never writes; the web's required-vehicle matching (BAJAJI/GUTA/VAN/TRUCK) can never match them, producing TRANSPORT_MODE_MISMATCH dispatch rejections and a registry that reads inconsistently across platforms
  - FE: GloboExpats_Frontend/lib/transporter-vehicles.ts:4-15 - TRANSPORTER_VEHICLE_OPTIONS = MOTORBIKE, BAJAJI, GUTA, CAR, VAN, TRUCK, OTHER; :18-25 DELIVERY_MODE_TO_VEHICLE maps BAJAJI→BAJAJI, MINI_TRUCK→VAN, SEMI_TRUCK→TRUCK
  - MO: GloboExpats_Mobile/lib/widgets/assign_transporter_modal.dart:41-47 - dropdown offers ('MOTORBIKE','Boda'),('TRICYCLE','Bajaji'),('CAR','Car'),('MINI_TRUCK','Mini truck'),('SEMI_TRUCK','Semi truck') and posts the raw value at :55
- **🟠 Major · missing — No success panel and no 'Share trip via WhatsApp' after assignment**
  - Impact: The seller's only channel for actually informing the assigned driver (WhatsApp trip sheet with address + pin + time) is gone; on mobile the assignment ends silently
  - FE: GloboExpats_Frontend/components/transporter/assign-transporter-modal.tsx:270-298 - buildWhatsAppShareUrl (order #, buyer, address, map pin, delivery time → wa.me); :325-345 - success panel '{name} is assigned to this order', 'Proposed delivery: … waiting for the buyer to confirm', green WhatsApp button, Done; :246 triggerNotificationRefresh()
  - MO: GloboExpats_Mobile/lib/widgets/assign_transporter_modal.dart:84-99 - _assign() just pop(true) for the detail reload; no success state, no WhatsApp deep link anywhere in the order domain (launchUrl appears only in admin/account screens, e.g. lib/screens/admin_sublist_screens.dart:268)
- **🟠 Major · BROKEN — Missing/deferred delivery fee renders as 'TSh 0' and the Delivery fee row always shows (web: 'Arranged after checkout', row only for SELLER_DELIVERY)**
  - Impact: On deferred cross-region or fee-less orders the seller reads 'Delivery fee: TSh 0' - a wrong money figure that suggests free delivery instead of 'to be arranged', and pickup orders show a delivery fee row the web hides
  - FE: GloboExpats_Frontend/app/orders/[id]/page.tsx:1251,1483,2225,2351 - deferred cross-region fee rendered as 'Arranged after checkout'; Order Summary delivery row only for SELLER_DELIVERY with hasDeliveryFee only when a fee is persisted (lib/order-detail-view.ts getOrderFinancialSummary, 5.10)
  - MO: GloboExpats_Mobile/lib/models/order.dart:267-268 - deliveryFee: (json['deliveryFee'] as num?)?.toDouble() ?? 0 (null → 0); lib/screens/orders_screen.dart:698-699 - 'Delivery fee' row rendered unconditionally with Order.formatAmount(o.deliveryFee)
- **🟡 Minor · partial — PRODUCTION_NOT_COMPLETE dispatch code missing from the mobile message map (7 of 8 codes ported)**
  - Impact: A made-to-order blocked dispatch shows the raw enum 'PRODUCTION_NOT_COMPLETE' instead of the actionable instruction, and the hint falls back to the generic 'cannot be dispatched yet' copy
  - FE: GloboExpats_Frontend/lib/dispatch-errors.ts:8-16 - union includes 'PRODUCTION_NOT_COMPLETE'; :22-23 - 'Mark production complete before assigning a transporter or dispatching this made-to-order item.'
  - MO: GloboExpats_Mobile/lib/domain/dispatch_errors.dart:8-32 - kDispatchErrorMessages holds 7 codes, no PRODUCTION_NOT_COMPLETE; lib/domain/dispatch.dart:16-26 short-copy map likewise omits it; lib/screens/orders_screen.dart:975-980 falls back to the raw code string in the bullet list
- **🟡 Minor · divergent — Unlock instant diverges: server dispatchOpensAt ignored, first-listed window used instead of earliest of all windows, and SELLER_HOURS windows unsupported**
  - Impact: For multi-window or SELLER_HOURS orders the mobile 'Unlocks at…' banner can be absent or show a later instant than the web/backend; harmless to correctness (backend authoritative) but the seller loses the wait guidance exactly on the orders where timing is least obvious
  - FE: GloboExpats_Frontend/lib/order-delivery-deadline.ts:106-122 - getDispatchOpensAt prefers the server's dispatchOpensAt, else min(start of ALL windows) − 1h; :58,78 - SELLER_HOURS accepted as a valid slot
  - MO: GloboExpats_Mobile/lib/domain/dispatch.dart:99-102 - dispatchOpensAt = primaryDeliveryWindow(order).startUtc − 1h with no server-field read and first-parseable-window-only semantics (:78-95); lib/domain/delivery_windows.dart:35 - enum DeliverySlot { MORNING, AFTERNOON, EVENING } so parseDatedWindow (:215-225) returns null for SELLER_HOURS orders
- **🟡 Minor · divergent — TRANSPORTER_NOT_LINKED_TO_SELLER assignment error shows generic failure text instead of the vendor-link guidance**
  - Impact: When an assign hits the linking rule, mobile sellers get an unexplained failure instead of the recovery path
  - FE: GloboExpats_Frontend/components/transporter/assign-transporter-modal.tsx:254-264 - error code mapped to title 'Driver is not linked to your vendor' + 'Refresh your transporter list. If this driver belongs to your team but is still missing, ask an administrator to link them to your vendor account.'
  - MO: GloboExpats_Mobile/lib/widgets/assign_transporter_modal.dart:88-98 - any ApiException sets _error = e.message (generic ErrorText), no code-specific handling
- **🟡 Minor · divergent — No auto rate-buyer prompt after the seller confirms delivery (web opens the rating modal once per session on confirmation)**
  - Impact: Completion of the loop (rating that moves the order to COMPLETED) depends on the seller manually returning and rating; web actively prompts at the moment of confirmation
  - FE: GloboExpats_Frontend/app/orders/[id]/page.tsx:1815 - DeliveryCodeCard onDeliveryConfirmed={() => setPendingRatingAction('RATE_BUYER')}; :336-360 - effect auto-opens the rating modal once per order per session (autoPromptedSellerRatingsRef) gated on COMPLETED
  - MO: GloboExpats_Mobile/lib/screens/delivery_dashboard_screens.dart:110-118 - verify-delivery success only paints 'Delivery confirmed…' message/SnackBar; Rate Buyer exists solely as a manual detail-screen button requiring COMPLETED/CONFIRMED (orders_screen.dart:1018-1027)

<details><summary><strong>Confirmed equivalent in both apps (18)</strong></summary>

- Availability accept/decline: POST confirm-availability and decline-availability {reason} both wired on mobile detail (orders_screen.dart:843-862, 533-586); blank decline reason is blocked with an inline error, matching the web's reason-required rule
- ProductionTimeCard ported faithfully: notApplicable/inProgress/overdue/complete states, remaining-time copy ('N day(s) N hour(s) remaining|overdue', 'less than 1 hour'), 'Mark production complete' confirm dialog with verbatim web copy and 'Keep in production'/'Yes, production is complete' actions; POST production-complete then reload (production_time_card.dart:33-143, orders_screen.dart:680-685)
- Delivery-code lifecycle: buyer code shown only while IN_TRANSIT, clipboard copy, 'Generate a new code' resetting attempts to 3, 3-attempt budget with 'Three attempts have been used...' lockout, INVALID_DELIVERY_CODE attempt parsing that never consumes an attempt on 403/network, buyer self-confirm 'I received the items' gated on buyerCanConfirmDelivery (delivery_dashboard_screens.dart:61-188, 312-426)
- Dispatch blocker contract: all 7 blocker codes mapped with verbatim web messages, detail screen lists backend dispatchBlockers, and the action hint withholds the dispatch CTA on canDispatch==false while keeping a greyed CTA for DISPATCH_TOO_EARLY (dispatch_errors.dart:16-65, order_action_hint.dart:88-107, orders_screen.dart:957-983)
- Dispatch timing math: 1-hour allowance, EAT slot starts 10/12/16, too-early only when window data positively proves it, unlock label with ceiling minutes and EAT clock identical to web (dispatch.dart:60-129, delivery_windows.dart:39-50)
- Order action hints ported for both roles including payment-verification suppression of legacy Mark Paid, pickup vs delivery wording, and buyer CTAs (Confirm delivery time / View delivery code / Rate Seller / Confirm received) (order_action_hint.dart:43-187)
- Status model: normalizeOrderStatus (CONFIRMED->COMPLETED), role-worded labels for seller/buyer/admin, web color families for status chips, and CANCELLED/FAILED failed-first timeline step (models/order.dart:382-462, orders_screen.dart:322-353, order_status_timeline.dart:126-140)
- OrderStatusTimeline three sequences (delivery 6 steps, pickup 5, rental 5) with role wording incl. 'Payment secured'/'Order placed', 'Rental pickup'/'Arrival / check-in', and DELIVERED-then-Completed semantics (order_status_timeline.dart:49-124)
- Status-group filtering: All/Ongoing/Overdue/Completed/Cancelled chips with Buying/Selling split and overdue regrouping on fulfillmentDeadline (orders_screen.dart:118-130, models/order.dart:352-370)
- Transporter assignment core: GET /transporters?active=true registry, RadioListTile picker with vehicle/plate/tripCount, inline create POST /transporters auto-selecting the new row, POST /orders/{id}/transporter then detail reload, loading/empty/error states and Assign disabled until a pick (assign_transporter_modal.dart:27-207, api_client.dart:963-1015)
- Escrow display states: REFUNDED/REFUND_PENDING/awaiting-verification/RELEASED/HELD refinements by status, checked in the same order as web including the payoutStatus=HELD default trap (escrow.dart:19-92, orders_screen.dart:716-765)
- Rental handoff code: buyer-view card at AWAITING_PICKUP with regenerate via POST regenerate-rental-handoff-code (orders_screen.dart:774-787, 452-472)
- Ratings: Confirm Received/Rate Seller (buyer) and Rate Buyer (seller) with 5-star dialog defaulting to 5 and comment/reviewText body keys matching the web endpoints (orders_screen.dart:476-527, 867-880, 1004-1028)
- Admin escrow panel parity: mark-paid/dispatch/confirm-receipt/release-payment/refund against /admin/orders/{id} with verbatim backend errors and state re-fetch (orders_screen.dart:416-428, 1054-1087; admin_orders_screen.dart escrow guards)
- Listing logistics-setup detection identical to web needsLogisticsConfirmation (deliverySetupReady wins, else coordinatesSource!=PINNED || transportModeSource!=SELLER_SELECTED) (seller_listings_screen.dart:123-134)
- Checkout-side constraints that feed dispatch: six EAT windows (Today/Tomorrow x Morning/Afternoon/Evening) shifted by max production days with past-window expiry re-checks at submit, transport requirement EXEMPT for rentals/real-estate, six vehicle modes with fare bands, production days 1-365 (checkout_screen.dart:842-946, delivery_windows.dart:14-50, sell_form_state.dart:437-460)
- Timestamps parsed across ISO/Jackson-array/epoch shapes and rendered in EAT; delivery-quote consolidated per-seller fees with failure taxonomy and buyer-vs-seller fix split (time_utils.dart:14-57, delivery_quote.dart:12-109)
- Notification deep-links into /orders/{id} with logistics accent rows and an app-bar badge combining unread count with a client-side pending-order-action classifier covering the same action families as the web badges (notification_feed.dart:88-255, pending_actions.dart:47-199, globo_app_bar.dart:63-86)

</details>


## Seller finance: earnings, payouts, commissions

### 🔴 CRITICAL · missing — Mobile has no seller 'Payments Received' surface at all (per-order payouts, seller documents, receipts)

**ID:** `finance-seller:FINANC-01` · **Area:** Seller earnings — Payments Received panel

**Impact:** Sellers on mobile can never see which completed orders were paid, how much is payable to them per order, upload the invoice/EFD receipt the platform needs, or view buyer receipts. The entire post-sale payout visibility workflow is absent; the seller has no way to fulfil the seller-document requirement from a phone.

- **Frontend evidence:** components/dashboard/payments-received-panel.tsx:222-238 - per-order stat cells 'Total amount paid' / 'Amount payable to seller' (sellerPayable) / 'Delivery fee'; :289-326 - 'Upload/Replace document', 'Seller documents (n)', 'View receipts (n)'; app/expat/dashboard/page.tsx:2840-2850 - Payments sub-tab renders PaymentsReceivedPanel (canSell + LOGISTICS_V2 gated); lib/api.ts:3494 - GET /api/v1/payments/received; lib/api.ts:3498-3505 - POST /api/v1/payments/received/{orderId}/seller-document
- **Mobile evidence:** lib/api/api_client.dart:934-961 - the only seller-finance API section is payout-details (fetchPayoutDetails/savePayoutDetails); no GET /payments/received or seller-document call exists anywhere in lib/ (grep returns no match); lib/screens/delivery_dashboard_screens.dart:596 - the only seller earnings figure in the app is the single 'Revenue from paid selling orders: TSh N' text line
- **Mobile-side verification:** No match in lib/ for payments/received, seller-documents, 'Payments Received'; only buyer proforma receipts (api_client.dart:448) exist.
- **Frontend-side verification:** Frontend evidence verified. payments-received-panel.tsx:220-249 renders the three stat cells 'Total amount paid' / 'Amount payable to seller' (sellerPayable) / 'Delivery fee' (cross-region amber '— Arranged after checkout' at :239-240); :289 'Upload document'/'Replace document' file input, :303-322 'Seller documents (n)' details viewer, :323-342 'View receipts (n)'. app/expat/dashboard/page.tsx:2840-2850 renders PaymentsReceivedPanel inside the canSell branch and only when LOGISTICS_V2_ENABLED. lib/api.ts:3493-3495 GET /api/v1/payments/received and :3498-3505 uploadSellerPaymentDocument POST /payments/received/{orderId}/seller-document (FormData 'document', sanitized filename). Severity critical is right: the entire post-sale payout-visibility + seller-document workflow surface is absent on mobile, squarely in the money domain.

### 🔴 CRITICAL · missing — Mobile never consumes GET /platform-settings/commission; VAT/Selcom rates are hardcoded defaults while web feeds live settings into every calculation

**ID:** `finance-seller:FINANC-02` · **Area:** Commission engine — platform commission settings

**Impact:** If the admin changes global commission settings (web exposes PATCH on the same path), the mobile app keeps pricing listings with stale rates. The backend trusts these client-computed fields (commission_calculator.dart:2-4), so buyer prices and commission amounts for every listing published from mobile can diverge from web for the identical seller input — direct money impact on platform revenue and seller payouts.

- **Frontend evidence:** hooks/use-platform-commission-settings.ts:18,53-99 - fetches GET /api/v1/platform-settings/commission with 60s TTL cache + dedupe + event broadcast; lib/api.ts:1403 - endpoint call; app/sell/page.tsx:342-351 - platformCommissionSettings.vatRate/selcomCommissionRate/selcomTransactionRate passed into calculateCommissionPricing for every forward computation (also edit-listing, orders/[id], choice selector)
- **Mobile evidence:** lib/models/sell_form_state.dart:97 - `CommissionRates rates = const CommissionRates()` (defaults 0.18/0.02/0.02, field never reassigned from any fetch); lib/domain/commission_calculator.dart:11-13 - hardcoded default rates; test/commission_test.dart:64-73 - the JSON-override path (CommissionRates.fromJson) is exercised only in tests, never wired to the endpoint (grep for 'platform-settings' in lib/ returns nothing)
- **Mobile-side verification:** commission_calculator.dart:11 defaults vatRate 0.18; sell_form_state.dart:97 const rates; grep: no platform-settings/commission or settings fetch anywhere.
- **Frontend-side verification:** Frontend evidence verified. hooks/use-platform-commission-settings.ts:18 CACHE_TTL_MS=60_000, :21-23 module-level cache + inflight dedupe, :53-103 fetch with defaults fallback and CustomEvent broadcast (SETTINGS_UPDATED_EVENT :19). lib/api.ts:1401-1407 getPlatformCommissionSettings -> GET /api/v1/platform-settings/commission. Live settings are fed into calculateCommissionPricing broadly, not just one site: app/sell/page.tsx:348-350 (choice forward pricing), 866-896, 2001-2003, and passed as props to the calculator at 2107-2128; app/edit-listing/[id]/page.tsx:443-445, 604-606, 1019; app/orders/[id]/page.tsx:737-739 (reverse recompute). Severity critical stands under the audit's 'affects money' bar: web prices every listing from live admin settings while mobile uses only defaults, so any admin change diverges mobile-published pricing/commission amounts.

### 🟠 Major · BROKEN — Revenue is computed on paymentStatus == 'PAID' instead of completed order statuses

**ID:** `finance-seller:FINANC-03` · **Area:** Seller earnings — dashboard revenue figure

**Impact:** The mobile figure counts every order whose payment was verified (escrow held) regardless of delivery, and excludes completed orders whose paymentStatus is not literally 'PAID' (e.g. later-stage flows). A seller's only earnings number on mobile can be substantially higher or lower than the web figure for the same account, misrepresenting earnings.

- **Frontend evidence:** app/expat/dashboard/page.tsx:1225-1228 (and :1259-1261, :1529-1531) - orderRevenue = completedSales reduce over orders with status in ['DELIVERED','COMPLETED','PICKED_UP','PAID']; lib/api.ts commission settings aside, the criterion is the order status set
- **Mobile evidence:** lib/screens/delivery_dashboard_screens.dart:577-580 - `sum + ((o?.paymentStatus == 'PAID') ? o!.totalAmount : 0)`; :596 - rendered as 'Revenue from paid selling orders: TSh N'
- **Mobile-side verification:** delivery_dashboard_screens.dart:577-580 sums orders where paymentStatus=='PAID'; :596 renders 'Revenue from paid selling orders'.
- **Frontend-side verification:** Frontend evidence verified. app/expat/dashboard/page.tsx:1224-1230 (completedSales filter to ['DELIVERED','COMPLETED','PICKED_UP','PAID'] then orderRevenue reduce), same formula re-synced at :1259-1261 and :1529-1531. The web criterion is exactly the order-status set as claimed, so the described mobile divergence (paymentStatus == 'PAID') is against a correctly-described frontend. Severity major is right: the seller's only earnings figure on mobile misrepresents the web figure.

### 🟠 Major · partial — No delete, no set-as-default, and no primary-first sorting for saved payout methods

**ID:** `finance-seller:FINANC-04` · **Area:** Payout methods — management actions

**Impact:** A seller whose default destination changed (old bank account, switched mobile wallet) cannot remove the stale method or promote the correct one on mobile — payouts keep targeting the wrong destination. Users will immediately notice the missing Delete/Make-default affordances present on web.

- **Frontend evidence:** lib/api.ts:2769-2774 - setPrimarySellerPayoutDetails (PUT /payout-details/{id}/primary); :2776-2780 - deleteSellerPayoutDetails (DELETE); components/account/seller-payout-details.tsx:26-27 - rows sorted primary-first; :71-74 - Make default action; :92-102 - delete with remaining[0] auto-promoted; :211-218 - 'Remove this payout method?' AlertDialog
- **Mobile evidence:** lib/screens/payout_details_screen.dart:178-186 - the only header action is 'Add'; :189-236 - _row() renders icon/label/Primary pill/account lines with no tap actions beyond opening the edit sheet; lib/api/api_client.dart:939-961 - client implements only GET and PUT; no DELETE or /primary call exists
- **Mobile-side verification:** api_client.dart:939/951 only fetch/save; payout_details_screen.dart:178-186 Add-only header, :189-236 rows render Primary pill with no actions/sorting.
- **Frontend-side verification:** Frontend evidence verified. lib/api.ts:2769-2774 setPrimarySellerPayoutDetails (PUT /payout-details/{id}/primary), :2776-2780 deleteSellerPayoutDetails (DELETE). seller-payout-details.tsx:26-27 sortDetails primary-first (applied at :41 and after every mutation), :69-79 makePrimary with toasts, :91-115 deleteDetails promoting remaining[0] when the primary is deleted (:98-99), :209-235 'Remove this payout method?' AlertDialog with the 'Another saved method will automatically become the default.' / 'You can add this payout method again later.' copy and Keep/Remove buttons. Severity major is right: without delete/set-default on mobile, payouts keep targeting a stale destination.

### 🟠 Major · missing — Non-dismissable 'Set up your payout method' prompt is missing

**ID:** `finance-seller:FINANC-06` · **Area:** Payout setup onboarding

**Impact:** Sellers with listings but no payout method are never proactively prompted on mobile, so orders can complete with no payout destination configured — the seller must discover the Settings Payout segment themselves. Web funnels every eligible seller into configuring payouts; mobile does not.

- **Frontend evidence:** components/account/seller-payout-setup-prompt.tsx:45-49 - eligibility via GET prompt-status (`hasListings && !configured && shouldPrompt`); :63-70 - Dialog with hideCloseButton and Escape/outside-click preventDefault; components/account/account-setup-prompts.tsx - ordering after profile/schedule prompts; lib/api.ts:2782-2786 - getSellerPayoutPromptStatus
- **Mobile evidence:** lib/api/api_client.dart:934-961 - the payout-details API section contains only fetchPayoutDetails and savePayoutDetails; no prompt-status call exists in lib/ (grep no match); lib/screens/payout_details_screen.dart:253-265 - payout setup is only reachable manually via the empty state / 'Add' button inside Settings
- **Mobile-side verification:** Grep prompt-status: no match in lib/; setup is only the static empty state at payout_details_screen.dart:253-265.
- **Frontend-side verification:** Frontend evidence verified. seller-payout-setup-prompt.tsx:45-50 eligibility via apiClient.getSellerPayoutPromptStatus() -> setIsOpen(status.hasListings && !status.configured && status.shouldPrompt); :63-70 Dialog with hideCloseButton, onEscapeKeyDown/onPointerDownOutside/onInteractOutside all preventDefault (non-dismissable); title 'Set up your payout method' (:78) and body 'Your seller payments will be sent here after the payment process is completed.' (:81); embeds PayoutDetailsForm closing onSaved (:96). lib/api.ts:2782-2786 GET prompt-status. account-setup-prompts.tsx:15-22 confirms the ProfileCompletionModal -> SellerScheduleSetupPrompt -> SellerPayoutSetupPrompt suppression ordering. Severity major is right: a user-visible proactive onboarding funnel is missing.

### 🟠 Major · partial — Availability gate is reduced to a one-tap confirm: no per-item checkboxes, no per-item 'Buyer paid'/'You receive' amounts, no order totals, no production-deadline copy

**ID:** `finance-seller:FINANC-07` · **Area:** Escrow — seller availability confirmation

**Impact:** The escrow acceptance flow that protects the seller's money loses its review safeguards on mobile: a seller can confirm availability without reviewing each line item, seeing what they will be paid per item, or being warned about the production deadline. Web also surfaces the gate directly on the dashboard order card; mobile requires opening the order detail.

- **Frontend evidence:** components/orders/seller-availability-gate.tsx:88 - confirm disabled until every item checked (`allItemsChecked`); :170-236 - per-item rows with image, quantity, 'Buyer paid: {unitPrice x qty}', emerald 'You receive: {sellerPayout x qty}', totals 'Order paid'/'Seller receives'; :155-165 - 'Confirm only if you can make or prepare the order within N calendar days'; :242 - `disabled={... || !allItemsChecked}`; also rendered on the dashboard card (app/expat/dashboard/page.tsx:4549)
- **Mobile evidence:** lib/screens/orders_screen.dart:826-864 - amber banner + a single 'Confirm availability' FilledButton that immediately calls confirm-availability (no item list, no amounts, no production-time warning); decline dialog at :529-586 does require a reason (parity); the gate only exists inside OrderDetailScreen, not the seller order list
- **Mobile-side verification:** orders_screen.dart:826-864 amber banner + one FilledButton directly calling confirm-availability; no item list, amounts or deadline copy.
- **Frontend-side verification:** Frontend evidence verified (file is components/orders/seller-availability-gate.tsx — the gap's cited path is the correct one). :88 allItemsChecked = itemKeys.length === 0 || itemKeys.every(checkedItems.has); :155-165 'Confirm only if you can make or prepare the order within {N} calendar days.'; :170-236 per-item checkbox rows with image, 'Buyer paid: {unitPrice x qty}' (:209-211), emerald 'You receive: {sellerPayout x qty}' only when payout > 0 (:213-217), totals 'Order paid'/'Seller receives' (:232-235); :242 confirm disabled={isConfirming || isDeclining || !allItemsChecked}. Dashboard surface confirmed at app/expat/dashboard/page.tsx:4548-4559 — the full gate renders in a quick-action Dialog opened from the seller order card, so web resolves it without opening order detail. Decline-with-reason parity also verified (:115-142, :265-302). Severity major is right.

### 🟠 Major · missing — Seller viewing an order never sees the 'Seller gets' / 'GloboExpats gets' per-item payout and commission breakdown

**ID:** `finance-seller:FINANC-08` · **Area:** Order detail — seller pricing block

**Impact:** On mobile a seller cannot see, for any order, how much of the buyer's payment is theirs versus commission — the primary money-transparency feature of the order detail page is absent. (Related: web listing cards also show an emerald 'You receive' box in management mode — FINANC-15.)

- **Frontend evidence:** app/orders/[id]/page.tsx:707-756 - isSellerViewing + sellerPricing totals (stored item.sellerPayout preferred, else recomputed via calculateCommissionPricing reverse with live platform settings; globoExpatsCut from sellerFacingCommissionAmount); :2383-2405 - 'Seller gets' (emerald) / 'GloboExpats gets' (rose) box with PriceDisplay
- **Mobile evidence:** lib/screens/orders_screen.dart:712-730 - the OrderDetailScreen 'Payment:' section renders only the Escrow.view banner + paymentStatus fallback; grep across lib/ finds no 'Seller gets'/'GloboExpats gets' or any per-item payout display in the order detail
- **Mobile-side verification:** orders_screen.dart:712-765 Payment section is escrow banner + paymentStatus only; grep 'Seller gets'/'GloboExpats gets': zero hits in lib/.
- **Frontend-side verification:** Frontend evidence verified. app/orders/[id]/page.tsx:707-711 isSellerViewing; :712-754 sellerPricing reduce using stored item.sellerPayout when > 0 else calculateCommissionPricing reverse with live platformCommissionSettings (:730-741), globoExpatsCut from stored sellerFacingCommissionAmount else final - payout (:742-746), totals x quantity (:748-751); :755-756 showSellerPricing gated on isSellerViewing && totals > 0; :2383-2405 renders the emerald 'Seller gets' / rose 'GloboExpats gets' box with PriceDisplay. Severity major is right: primary money-transparency feature of the order detail page.

### 🟠 Major · missing — Verification gate on the Selling area is absent: unverified sellers can open Selling, listings, orders and the payout section on mobile

**ID:** `finance-seller:FINANC-09` · **Area:** Eligibility gating of the selling/payout area

**Impact:** Web blocks the entire seller finance area (receiving orders, the Payments surface, payout configuration) behind seller verification; mobile exposes it to any logged-in user. Whatever the backend enforces, the client-side eligibility gate and the verification funnel are missing, so unverified sellers get a broken experience (orders/payouts that cannot work) instead of the guided verification pitch.

- **Frontend evidence:** app/expat/dashboard/page.tsx:2818-2836 - `!canSell` renders the locked 'Verify your account to start selling' pitch ('Verify your organization email to create listings, receive orders, and get paid.') instead of all seller content; :2775,2789-2815 - Sell CTA and Listings/Orders/Payments/Transporters sub-tabs rendered only when canSell
- **Mobile evidence:** lib/screens/delivery_dashboard_screens.dart:480,497 - MySpace 'Selling' tab unconditionally renders SellerListingsScreen; grep across lib/screens (sell flow, shell, seller listings, settings) finds no check of verification/reviewStatus before selling surfaces; lib/screens/verification_hub_screen.dart:14 - the rule is only documented in a comment, no consumer enforces it
- **Mobile-side verification:** delivery_dashboard_screens.dart:497 renders SellerListingsScreen unconditionally; no canSell/reviewStatus gate in any sell or listing screen.
- **Frontend-side verification:** Frontend evidence verified. app/expat/dashboard/page.tsx:2818-2836 — !canSell renders the locked pitch with exact copy 'Verify your account to start selling' (:2825) and 'Verify your organization email to create listings, receive orders, and get paid.' (:2828) plus CTA to /account/verification; :2775-2786 Sell CTA rendered only when canSell; :2789-2815 Listings/Orders/Payments/Transporters sub-tabs rendered only when canSell (Payments/Transporters additionally LOGISTICS_V2-gated at :2807-2812). Severity major is right: the client-side eligibility gate and verification funnel over the whole seller finance area is a user-visible feature web has and mobile allegedly lacks.

### 🟡 Minor · partial — Payout form validation is reduced and the default method diverges (MOBILE_MONEY vs BANK_ACCOUNT)

**ID:** `finance-seller:FINANC-05` · **Area:** Payout methods — editor form rules

**Impact:** Mobile accepts payout data web would reject (1-char bank account, 2-digit mobile number, missing provider). If the backend also accepts it, payouts to an invalid destination fail later; at minimum the seller gets a raw server error instead of web's field-level guidance, and the default method a new seller lands on differs from web.

- **Frontend evidence:** lib/payout-details.ts:81-98 - validatePayoutDetails: provider/accountName min length 2, BANK_ACCOUNT regex '^[A-Za-z0-9][A-Za-z0-9 ./-]{3,33}$' (4-34 chars), LIPA/MOBILE normalized '^\+?\d{4,20}$'; components/account/payout-details-form.tsx:38 - default `payoutMethod: editingMethod || 'BANK_ACCOUNT'`; :106,126,139,142 - maxLength 120/64 and inputMode text/tel; components/account/payout-method-selector.tsx:17-50 - 'Choose how you want to be paid' RadioGroup
- **Mobile evidence:** lib/screens/payout_details_screen.dart:71-72 - default method `'MOBILE_MONEY'`; :106-110 - Provider field has NO validator; :112-126 - account name/number validators are only `(v == null || v.trim().isEmpty) ? 'Required' : null`; :95-104 - method chosen via DropdownButtonFormField, no maxLengths, no per-method format checks
- **Mobile-side verification:** payout_details_screen.dart:71-72 default MOBILE_MONEY; :106-110 provider unvalidated; :117-126 only 'Required' checks, no length/regex.
- **Frontend-side verification:** Frontend evidence verified. lib/payout-details.ts:81-99 validatePayoutDetails exactly as claimed: provider/accountName trimmed length >= 2, BANK_ACCOUNT regex /^[A-Za-z0-9][A-Za-z0-9 ./-]{3,33}$/ (4-34 chars) with the '4 to 34 letters or digits' error, LIPA/MOBILE strip [\s()-] then /^\+?\d{4,20}$/; payoutFieldLabels :48-79 give the CRDB/Vodacom/+255 examples. payout-details-form.tsx:38 default payoutMethod: editingMethod || 'BANK_ACCOUNT'; :106 and :126 maxLength 120, :139 inputMode text for bank / tel otherwise, :142 maxLength 64. payout-method-selector.tsx:17-50 fieldset/legend 'Choose how you want to be paid' with the 3-option RadioGroup. Severity minor is right (form-rule divergence with server fallback).

### 🟡 Minor · partial — Proof upload is gallery-image-only and one file per pick; web accepts up to 5 JPEG/PNG/WebP/PDF with compression (including PDF rewriting)

**ID:** `finance-seller:FINANC-10` · **Area:** Payment proof uploads

**Impact:** Buyers cannot attach PDF payment proofs (bank statements, receipts exported as PDF) from mobile, and cannot batch-select multiple proofs at once. The accepted-type contract ('JPEG/PNG/WEBP/PDF') is only nominally supported; count and size caps (5 x 5MB) are enforced (checkout_screen.dart:1250-1264), but the format coverage is narrower than web.

- **Frontend evidence:** components/checkout/receipt-upload.tsx:16-18 - MAX_FILES 5, 5MB, ALLOWED_MIME_TYPES includes application/pdf; :30-92 - compressImage (<=1600px JPEG q0.8) and compressPdf (pdf-lib object streams); :151 - accept='image/jpeg,image/png,image/webp,application/pdf'
- **Mobile evidence:** lib/screens/checkout_screen.dart:1255-1259 - ImagePicker().pickImage(source: gallery, maxWidth: 1600, imageQuality: 80) — single image, no PDF; lib/screens/my_payments_screen.dart:555-559 - the rejected-proof re-upload uses the same image-only single pick (comment at :551-552 acknowledges 'image_picker is the only real file source on mobile')
- **Mobile-side verification:** checkout_screen.dart:1255 and my_payments_screen.dart:555 both single ImagePicker().pickImage; no file_picker/pickFiles/PDF support in lib/.
- **Frontend-side verification:** Frontend evidence verified. components/checkout/receipt-upload.tsx:16-18 MAX_FILES=5, MAX_FILE_SIZE=5MB, ALLOWED_MIME_TYPES includes application/pdf; :30-51 compressImage (>300KB scaled to <=1600px JPEG q0.8), :58-88 compressPdf via pdf-lib with useObjectStreams; :151-152 accept='image/jpeg,image/png,image/webp,application/pdf' with multiple. Toasts 'Too many files'/'Unsupported file'/'File too large' at :110-133 and duplicate skip :136. Severity minor is right: buyers can still complete proof upload with images, so this is narrower format/batch coverage, not a broken flow.

### 🟡 Minor · partial — No dedicated Transporters management panel: registry exists only as an inline add + pick list inside the assign sheet (no search, photo, managers, Active/Inactive, trip counts)

**ID:** `finance-seller:FINANC-11` · **Area:** Transporter registry (fulfils paid orders)

**Impact:** Sellers can add a bare-bones transporter and assign it to paid orders, but cannot manage the registry from mobile: no search, no photos, no notes/WhatsApp, no manager sharing, no edit/deactivate. Registry curation (and the web Payments/Transporters workspace) is effectively web-only; day-to-day fulfilment still works.

- **Frontend evidence:** app/expat/dashboard/page.tsx:2851-2853 - Transporters sub-tab renders SellerTransportersPanel; components/dashboard/seller-transporters-panel.tsx:29-31,56-66 - search + registry fetch; :118-121 - photo upload on create; :154-170,186-207 - OWNER 'Manage' dialog with editable fields, photo upload/remove, manager list
- **Mobile evidence:** lib/widgets/assign_transporter_modal.dart:9-12,29-30 - registry only loaded as GET /transporters?active=true inside the assign-transporter sheet; :165-178 - inline creation fields limited to Full name / Phone number / Plate / vehicleType; lib/api/api_client.dart:963-1007 - API has fetch/create/assign but no photo, manager, or active-toggle calls; no standalone transporters screen exists in lib/screens/
- **Mobile-side verification:** api_client.dart:963-1006 only registry GET, inline POST create, assign; no update/activate/delete endpoints or dedicated transporter screen.
- **Frontend-side verification:** Frontend evidence verified. app/expat/dashboard/page.tsx:2851-2853 renders SellerTransportersPanel under the Transporters sub-tab. seller-transporters-panel.tsx:50 search state + :62-76 registry fetch (getManagedTransporters(search)) + :82-95 search filtering; :117-119 uploadTransporterPhoto on create; :154-174 openManage filling editable fields and loading managers via getTransporterManagers; :186-215 managed photo upload/remove. Photo validation (JPEG/PNG/WebP <= 5MB) at :36-37,141-152. Severity minor is right: day-to-day add/assign fulfilment works on mobile; only registry curation is web-only.

### 🟡 Minor · partial — Seller order list lacks the web's status-label precedence overrides ('Payment proof rejected - action required', production-awaiting-completion)

**ID:** `finance-seller:FINANC-12` · **Area:** Seller order list — payment-state overrides

**Impact:** A seller scanning their order list on mobile cannot see at a glance that a buyer's payment proof was rejected (order stuck pre-PAID) — the row shows the generic status label. Web turns this into an actionable 'Payment proof rejected - action required' state on the seller's money pipeline.

- **Frontend evidence:** app/expat/dashboard/page.tsx:2075-2101 - label precedence productionAwaitingCompletion > paymentNeedsNewProof ('Payment proof rejected - action required') > deliveryIsOverdue ('Overdue - delivery window passed') > status label, with matching colors and action hints
- **Mobile evidence:** lib/models/order.dart:349-367 - Order.group computes only ongoing/overdue/completed/cancelled from fulfillmentDeadline; no paymentNeedsNewProof or production-completion override anywhere; lib/domain/order_action_hint.dart:69 - the only payment-related seller hint is 'GloboExpats is verifying the buyer's payment - no action needed yet.'
- **Mobile-side verification:** Grep paymentNeedsNewProof/productionAwaiting/'proof rejected'/'Overdue -': no matches in lib/; only generic order_action_hint copy.
- **Frontend-side verification:** The cited precedence chain exists (app/expat/dashboard/page.tsx:2075-2101) but the claim misdescribes where it applies. 'Payment proof rejected - action required' can never render on the SELLER list: relatedBuyerPayment is computed only when listType === 'buying' (page.tsx:2067-2074) and is null otherwise, and getBuyerPaymentRecoveryState(null) returns 'pending_payment', not 'rejected' (lib/buyer-payment-recovery.ts:32-45 — null status hits none of the rejected branches). The payment-rejected override is a buyer-list (and order-detail, orders/[id]/page.tsx:1588-1597) state only. The seller-list overrides web actually applies are 'Production in progress' (productionAwaitingCompletion, :2078-2085, seller-only) and 'Overdue - delivery window passed' (deliveryIsOverdue, :2077/:2088-2089), plus the matching colors/hints. So the real mobile gap is those two overrides, not the payment-rejected one; severity stays minor.

### 🟡 Minor · divergent — Payment countdown ticks every 30s and does not reload the panel on expiry (web: 1s tick + onExpire reload)

**ID:** `finance-seller:FINANC-13` · **Area:** My Payments — countdown behavior

**Impact:** After a proforma reservation lapses, the mobile list keeps showing it under 'Pending' (with expired copy) until a manual refresh, whereas web immediately refetches and the row moves to Expired. Cosmetic-to-confusing timing difference; money state itself is unaffected.

- **Frontend evidence:** components/payment-countdown.tsx:74-76 - setInterval 1000ms (1s tick); :81-86 - onExpire fires once; components/dashboard/my-payments-panel.tsx:359 - `onExpire={() => setReloadKey((current) => current + 1)}` reloads the panel when a payment expires
- **Mobile evidence:** lib/screens/my_payments_screen.dart:92-95 - 30-second Timer updates only the `_now` clock ('countdowns keep moving without a per-second rebuild'); :677-699 - the card renders Countdown.proformaLabel but nothing refetches on expiry, so an expired proforma stays in the Pending tab with expired copy until the user pulls to refresh
- **Mobile-side verification:** my_payments_screen.dart:92 Timer.periodic 30s; no refetch on expiry anywhere in the screen, matching the divergent-behavior claim.
- **Frontend-side verification:** Frontend evidence verified. components/payment-countdown.tsx:74-77 setInterval(..., 1000) — 1s tick; :80-86 onExpire fires once via the expireNotified guard; components/dashboard/my-payments-panel.tsx:359 exactly onExpire={() => setReloadKey((current) => current + 1)} on the pending-payment countdown (:354-361), which reloads the panel data. Severity minor is right: cosmetic/refresh-timing divergence, money state unaffected.

### 🟡 Minor · divergent — Commission breakdown rows differ: no 'Your product value' row, renders at >0 instead of web's >=1000 gate, no /terms#commission link, plus extra VAT/Selcom rows

**ID:** `finance-seller:FINANC-14` · **Area:** Sell-flow commission breakdown display

**Impact:** Same underlying math (the calculator is a verified port), but the seller sees a differently-shaped breakdown on mobile with no terms reference, and web's 1000-TZS gate is replaced by a >0 gate (mobile instead validates >=1000 at submit/edit). Cosmetic/informational divergence only.

- **Frontend evidence:** components/sell/commission-calculator.tsx:66 - `hasPrice = finalTotalSellingPrice >= 1000 && sellerPayout >= 1000` gates the breakdown (shows '-' below); :168-185 - rows 'Your product value' / 'GloboExpats commission' (red) / 'Final Total Asking Price' (emerald); :196 - footnote linking /terms#commission; :80-82 - 'Automatic pricing' chip
- **Mobile evidence:** lib/screens/sell/sell_wizard_screen.dart:1031-1033 - breakdown computed when `sellerPayout > 0 && price > 0`; :1129-1132 - rows 'GloboExpats commission' / 'VAT' / 'Selcom fee' / 'Final total asking price' (no 'Your product value' row); no terms-of-service link exists on the pricing step
- **Mobile-side verification:** sell_wizard_screen.dart:1031 gates on >0; :1129-1132 rows commission/VAT/Selcom/final only — no 'Your product value' row, no terms link.
- **Frontend-side verification:** Frontend evidence verified. components/sell/commission-calculator.tsx:66 hasPrice = breakdown.finalTotalSellingPrice >= 1000 && breakdown.sellerPayout >= 1000, gating all breakdown values to '-' below that; :168-185 rows 'Your product value' / 'GloboExpats commission' (red-600) / 'Final Total Asking Price' (emerald-700); :196 Link to /terms#commission; :80-82 'Automatic pricing' chip; :77 'Commission is determined automatically from the listing category.' Severity minor is right: same underlying math, differently-shaped informational breakdown.

### 🟡 Minor · missing — Seller listing cards never show the emerald 'You receive' payout box that web shows in management mode

**ID:** `finance-seller:FINANC-15` · **Area:** Listing management — 'You receive' display

**Impact:** Sellers browsing their own listings on mobile cannot see what they would receive per listing, a small but persistent earnings-transparency feature on web's management cards.

- **Frontend evidence:** components/ui/product-card.tsx:616-617 - managementSellerReceives rendered only when finite and > 0; :1102-1105 - emerald 'You receive' box in management mode (fed from sellerPayout/whatSellerReceives)
- **Mobile evidence:** lib/screens/seller_listings_screen.dart:470-491 - _ListingCard shows status chip, price, 'views' count and Edit/Archive/Delete actions; grep of the file finds no sellerPayout/'You receive' rendering
- **Mobile-side verification:** seller_listings_screen.dart:458-502 card shows chip/price/stock/views + Edit actions; grep 'You receive'/sellerPayout: no hits in this file.
- **Frontend-side verification:** Frontend evidence verified. components/ui/product-card.tsx:614-617 showManagementMoney = effectiveManagementMode && Number.isFinite(managementSellerReceives) && > 0; :1094-1112 emerald 'You receive' box ('You receive' label :1102, PriceDisplay :1104-1108). Feed confirmed: app/expat/dashboard/page.tsx:3258-3259 sellerReceives = Number(listing.sellerPayout ?? listing.whatSellerReceives ?? 0), passed as managementSellerReceives at :3285-3289. Severity minor is right: small persistent earnings-transparency polish on management cards.

<details><summary><strong>Confirmed equivalent in both apps (16)</strong></summary>

- Buyer My Payments panel is a faithful port: GET /payments/my (List or {content}/{items} envelope), four group tabs Pending/Approved/Rejected/Expired with live counts, and the full recovery-state precedence including 'status REJECTED or any rejected receipt -> Rejected' and newer-SUBMITTED-outranks-REJECTED (mobile my_payments_screen.dart:287-305 mirroring web lib/buyer-payment-recovery.ts).
- 'Continue payment' resumes /checkout?proforma={id}; non-pending rows link to /orders/{first orderId}; deep link ?paymentStatus= selects the initial group (my_payments_screen.dart:540-547; app_router.dart route), matching web's paymentStatus param (my-payments-panel.tsx:131).
- 48-h rejected-proof correction window: correctionDeadline precedence explicit field > rejectedAt+48h > max(receipt reviewedAt/submittedAt)+48h, 'X remaining to upload corrected proof.' / 'overstayed by X. GloboExpats can now cancel this invoice.' copy, reopen button hidden once closed, CORRECTION_WINDOW_CLOSED surfaced, success -> 'New proof sent' + jump to Pending + refetch (my_payments_screen.dart:124-162, 576-773; escrow.dart:94-110; web my-payments-panel.tsx:318-471, payment-timing.ts:2,69-81).
- Payout details list + create/update: GET and PUT /api/v1/userManagement/payout-details[/{id}] with the same three methods BANK_ACCOUNT/LIPA_NUMBER/MOBILE_MONEY, 'Primary' pill on the backend-flagged row, embedded as the seller-only 'Payout' segment of Profile Information (payout_details_screen.dart:48-52,210-224; account_misc_screens.dart SettingsScreen; web api.ts:2750-2767).
- Commission math engine is an exact port: grossTargetRate and multiplier formulas, FORWARD ceil-to-1000, REVERSE floor-to-1000 with the >0-floor-else-unrounded guard, identical category fallback table (incl. Vehicles/Pet & Supplies/Other aliases and 0.10 default), live category commissionRate override, and a publish payload key-for-key identical to web's buildProductJson (commission_calculator.dart:67-94,136-174; sell_form_state.dart:471-524; web commission.ts).
- Priced-choice per-value payouts: base+adjustment model, 'Make default' rebasing with sibling recompute, hasPricedChoices/non-positive-choice guard, currency re-denomination of adjustments (product_choices.dart; sell_wizard_screen.dart:1309+ ChoicePriceRows; web setChoiceSellerPayout).
- Escrow display state machine with matching precedence (REFUNDED > REFUND_PENDING > escrowPending under-review > RELEASED > HELD variants > PENDING) and seller-side 'cannot see escrow-pending order' rule (escrow.dart:29-92).
- Seller availability confirm/decline endpoints at parity: POST confirm-availability, decline-availability {reason} with required non-empty reason ('Please enter a reason') cancelling + refunding the buyer (orders_screen.dart:529-586,826-864; web api.ts:3727-3745).
- OTP delivery flow: 6-digit entry, 3 attempts, INVALID_DELIVERY_CODE attemptsRemaining parsing and decrement, lockout at 0 with 'Three attempts have been used. Ask the buyer to generate a new code.', regenerate-delivery-code, buyer 'I received the items' gated by buyerCanConfirmDelivery (delivery_dashboard_screens.dart:106-164,308+; delivery_code.dart; web delivery-code-card.tsx).
- Dispatch unlock timing: 1-hour dispatch allowance before the delivery window, disabled CTA before unlock, 'Unlocks at HH:MM (N min)' / 'Dispatch is available now' labels, backend blockers listed verbatim via kDispatchErrorMessages (orders_screen.dart:940-983; dispatch.dart).
- Proforma countdown: driven by expiresAt, visible only while PENDING_PAYMENT, <3h urgent tone, expired tone 'Proforma invoice has expired... Please re-order.' (countdown.dart:36-78; web payment-countdown.tsx).
- Checkout payment step caps: max 5 receipts x 5MB ('You can upload up to 5 receipts.' / '{name} exceeds the 5MB limit.'), payment method chips MOBILE_MONEY (default) / BANK_TRANSFER, cancel-invoice confirm flow releasing reserved items, escrow protection note, completion gated on status PAYMENT_SUBMITTED (checkout_screen.dart:1246-1276; web receipt-upload.tsx:16-17).
- Admin money review fully implemented: GET /admin/payments queue + /admin/proformas/stats KPIs, receipt verify/reject with the same six reason codes, confirm-payment, bulk approve, 'Cancel invoice (48h window)' only when all receipts non-SUBMITTED, status filter chips, authed receipt preview (admin_payments_review_screen.dart).
- Admin escrow actions mirror backend guards: 'Release payout' only when payoutStatus HELD && status in DELIVERED/COMPLETED/CONFIRMED, 'Issue refund' only on REFUND_PENDING, ORDER_NOT_DELIVERED / ORDER_REFUNDED / NO_REFUND_DUE surfaced verbatim (admin_orders_screen.dart; web admin api + release-payment DELIVERED contract).
- Seller production-complete action and assign-transporter flow (registry fetch, inline add, POST /orders/{id}/transporter) exist on mobile (orders_screen.dart:684,984-1003; assign_transporter_modal.dart; production_time_card.dart:99-127).
- Verification hub with referral form, seller type, org-email OTP alternative path, and VERIFIED/NATURAL_VERIFIED rule documented (verification_hub_screen.dart:14,128; web seller-verification.ts gating).

</details>


## Buyer finance: payment methods & payment flows

### 🔴 CRITICAL · missing — Proforma resume deep-link (?proforma=) is accepted but ignored; an unpaid proforma can never be reopened

**ID:** `finance-buyer:FINANC-01` · **Area:** Checkout — payment resume

**Impact:** Buyer who leaves checkout, kills the app, or taps 'Continue payment' in My Payments lands in a fresh empty checkout instead of their reserved invoice. The core payment-continuation flow is broken: the proforma cannot be paid from anywhere except the live checkout session, and reserved stock silently expires after 1 hour.

- **Frontend evidence:** app/checkout/checkout-content.tsx:441-443 - reads `searchParams.get('proforma')` into resumeProformaId; hooks/use-proforma.ts:71-113 - resumes proforma on mount (stored or explicit id) via getProformaInvoice, only PENDING_PAYMENT resumes, per-status resume-error copy; hooks/use-proforma.ts:20-44 - sessionStorage 'checkout_active_proforma' persistence; checkout-content.tsx:1127 - explicit ?proforma= deep-link always resumes
- **Mobile evidence:** lib/app_router.dart:163-171 - '/checkout' builder creates CheckoutScreen WITHOUT reading state.uri.queryParameters['proforma'] (comment admits resume 'lands in Wave 1'); lib/screens/checkout_screen.dart:143-147 - initState only loads profile/addresses, no proforma fetch/resume anywhere in the 1903-line screen; lib/screens/my_payments_screen.dart:540-547 - 'Continue payment' pushes '/checkout?proforma=<id>' which the router ignores
- **Mobile-side verification:** app_router.dart:163-171 ignores ?proforma= (admits Wave 1); initState only loads profile; getProforma api_client.dart:495 has no caller
- **Frontend-side verification:** FE resumes via searchParams+use-proforma. Mobile: router reads ?proforma= (app_router:175) but CheckoutScreen ignores it; getProforma never called.

### 🟠 Major · missing — Confirmed cart is not restored when the proforma invoice expires

**ID:** `finance-buyer:FINANC-02` · **Area:** Checkout — invoice expiry recovery

**Impact:** After the 1-hour payment window lapses, the mobile buyer loses the confirmed order entirely and must rebuild it item-by-item from memory; web restores the items so the buyer can re-order immediately.

- **Frontend evidence:** app/checkout/checkout-content.tsx:3981-4013 - expiry dialog 'Back to Cart'/'Start Over' both call restoreExpiredCart (3998, 4006); checkout-content.tsx:1611-1619 - restoreExpiredCart re-adds confirmedCartItems to the cart
- **Mobile evidence:** lib/screens/checkout_screen.dart:601-625 - expired dialog only offers 'OK' / 'Start fresh checkout' with no cart restore; lib/screens/checkout_screen.dart:627-646 - _restartCheckout resets proforma/receipts/quote and lands on the review step while the cart stays cleared (the proforma_cart_snapshot written at 452-455 is never read back anywhere - grep shows only set/remove)
- **Mobile-side verification:** checkout_screen.dart:601-625 expired dialog offers OK/Start fresh only; _restartCheckout 627-646 resets to review, no confirmed-cart restore
- **Frontend-side verification:** FE expiry dialog both buttons call restoreExpiredCart (checkout-content 3998/4006); mobile dialog offers only OK / Start fresh checkout.

### 🟠 Major · partial — Receipt picker accepts gallery images only - no PDF/WebP, no multi-select, no duplicate skip; corrected-proof re-upload is a single image

**ID:** `finance-buyer:FINANC-03` · **Area:** Payment proof upload

**Impact:** Buyers paying by bank transfer whose proof is a PDF statement cannot attach it at all; attaching several receipts (e.g. two partial transfers) requires repeated manual picks, and WebP screenshots are unhandled. Web's compression pipeline (PDF rewrite, <=300KB skip, duplicate skip) has no mobile equivalent beyond maxWidth/quality.

- **Frontend evidence:** components/checkout/receipt-upload.tsx:16-18 - MAX_FILES 5 / 5MB / ALLOWED_MIME_TYPES jpeg,png,webp,application/pdf; receipt-upload.tsx:151 - input accept attribute; receipt-upload.tsx:58-88 - client-side PDF re-optimization; receipt-upload.tsx:136 - duplicates skipped by name+size; used for both step 3 (payment-confirmation-step.tsx:265-269) and My Payments re-upload (my-payments-panel.tsx:429-433)
- **Mobile evidence:** lib/screens/checkout_screen.dart:1255-1259 - ImagePicker().pickImage(source: gallery) - images only, one at a time; lib/screens/checkout_screen.dart:536 - contentType hardcoded 'image/png'; lib/screens/my_payments_screen.dart:555-559 - corrected-proof re-upload also a single gallery image
- **Mobile-side verification:** checkout_screen.dart:1255+ & my_payments:555 use pickImage(gallery) only; 'image/png' hardcoded :536; no FilePicker/pdf/webp pick anywhere
- **Frontend-side verification:** FE: 5 files, jpeg/png/webp/pdf, PDF re-opt, dup-skip. Mobile: pickImage gallery-only, contentType hardcoded image/png.

### 🟠 Major · missing — Order detail never fetches payments: no rejected-proof banner, no 'Upload new proof' CTA, no Payment method row

**ID:** `finance-buyer:FINANC-04` · **Area:** Order detail — rejected payment proof

**Impact:** A buyer whose proof was rejected sees only generic escrow copy on the order page and gets no rejection reason and no path to fix it from there; the ordered-by payments cross-reference that drives web's buyer banners is absent.

- **Frontend evidence:** app/orders/[id]/page.tsx:285-289 - fetches apiClient.getMyPayments() and merges via findPaymentForOrder; page.tsx:576-582 - paymentRecoveryState/rejectionReasons/paymentNeedsNewProof; page.tsx:1077-1100 - amber 'Payment proof rejected - upload a corrected proof' banner + 'Upload new proof' button deep-linking to payments; page.tsx:1101-1116 - blue under-review / corrected-proof-under-review banners; page.tsx:1502-1525 - 'Payment method' and 'Payment status' ('Rejected - new proof required') rows; page.tsx:1588-1597 - badge override 'Payment proof rejected - action required'
- **Mobile evidence:** lib/screens/orders_screen.dart:712-765 - payment section renders only the Escrow.view banner plus raw paymentStatus text; no getMyPayments call exists in the screen (grep: payments/my only in my_payments_screen.dart); lib/models/order.dart:160-194 - Order model has no paymentMethod field at all
- **Mobile-side verification:** orders_screen.dart detail 359-1093 never calls getMyPayments; payment block 712-765 renders Escrow.view banner + paymentStatus only
- **Frontend-side verification:** FE fetches getMyPayments, amber rejected banner + Upload new proof (orders/[id] 1077-1100); mobile orders_screen has no getMyPayments.

### 🟠 Major · partial — No payment-derived pending actions: buyer_payment_rejected and buyer_payment_unfinished never surface (no banner)

**ID:** `finance-buyer:FINANC-05` · **Area:** Pending-action alerts (payments)

**Impact:** A rejected payment proof (48-hour correction window!) or an unpaid proforma holding reserved stock never proactively alerts the buyer on mobile; they must discover it by opening My Payments. Web pins the highest-priority payment task under the header on every page.

- **Frontend evidence:** components/pending-actions-banner.tsx:88-94,111-115 - polls orders + getMyPayments every 60s and on pathname change; lib/pending-action-alerts.ts:195-208 - buyer_payment_rejected alert (priority 0, urgent, 'Payment update required ... within 48 hours'); lib/pending-action-alerts.ts:247-260 - buyer_payment_unfinished alert ('Continue payment' -> /checkout?proforma=); lib/pending-action-alerts.ts:62-70 - KIND_PRIORITY ordering
- **Mobile evidence:** lib/domain/pending_actions.dart:47-111 - buyer feed derives ONLY from Order fields (paymentRequired/confirmDeliveryTime/codes/receipt); no payments input, no rejected-proof or unfinished-proforma kind in OrderActionType (lines 8-24); pending_actions.dart:202-210 - the feed only powers the bell badge count, and there is no banner UI anywhere
- **Mobile-side verification:** pending_actions.dart:8-24 OrderActionType lacks any payment-rejected/unfinished kind; buyer feed 59-111 derives from Order fields only
- **Frontend-side verification:** FE banner polls orders+payments every 60s (POLL_INTERVAL_MS=60_000) with buyer_payment_rejected alert; mobile OrderActionType has no payment kinds.

### 🟠 Major · BROKEN — 'Order' button uses Navigator.pushNamed, which is not wired in this MaterialApp.router app and does not navigate

**ID:** `finance-buyer:FINANC-06` · **Area:** My Payments — navigation

**Impact:** Tapping 'Order' on a payment row fails to open the order detail (same unwired Navigator.pushNamed path the codebase already documented as throwing), so the buyer cannot reach the order behind a payment from the payments list.

- **Frontend evidence:** components/dashboard/my-payments-panel.tsx:389-397 - 'Order' is a Next Link to /orders/{firstOrderId}
- **Mobile evidence:** lib/screens/my_payments_screen.dart:661-668 - 'Order' button calls Navigator.of(context).pushNamed('/orders/${...}'); lib/main.dart:61 - app root is MaterialApp.router(routerConfig: router) with no routes map (grep: no MaterialApp routes: anywhere); lib/screens/checkout_screen.dart:1686-1689 - the repo's own comment records that this exact call pattern 'threw instead of navigating' and had to be replaced with GoRouter push ('/account/addresses')
- **Mobile-side verification:** my_payments:667 pushNamed; main.dart:57 MaterialApp.router no routes map; checkout_screen.dart:1688 comment says pushNamed never navigates
- **Frontend-side verification:** FE uses Next Link; mobile my_payments_screen:667 pushNamed under MaterialApp.router (main.dart:57) - dead navigation.

### 🟡 Minor · missing — No 30s polling of the proforma while on the payment step (getProforma implemented but unused)

**ID:** `finance-buyer:FINANC-07` · **Area:** Checkout — proforma status freshness

**Impact:** Admin verification/rejection or server-side expiry never reaches a parked mobile checkout; the buyer can sit on a dead invoice and only learns at submit time via the PROFORMA_EXPIRED dialog, and admin status changes require a manual revisit.

- **Frontend evidence:** hooks/use-proforma.ts:22,131-138 - POLL_INTERVAL_MS 30_000, polls GET /api/v1/proformas/{id} while status is PENDING_PAYMENT/PAYMENT_SUBMITTED; use-proforma.ts:156-161 - client countdown expiry re-checks the server
- **Mobile evidence:** lib/api/api_client.dart:493-502 - getProforma() implemented but called from no screen (grep: definition only); lib/screens/checkout_screen.dart:1791-1798 - the only timer on the payment step ticks the local countdown display
- **Mobile-side verification:** api_client.dart:495 getProforma defined, zero callers; checkout_screen.dart:1791-1798 timer only ticks the local countdown display
- **Frontend-side verification:** FE use-proforma.ts:22,132-138 polls 30s while PENDING_PAYMENT/SUBMITTED; mobile getProforma (api_client:495) has zero callers.

### 🟡 Minor · missing — No 'View receipts (N)' disclosure or buyer-side receipt previews

**ID:** `finance-buyer:FINANC-08` · **Area:** My Payments — receipts

**Impact:** Mobile buyers can never re-check which proof they uploaded or what the admin saw; web shows inline previews of every receipt on the payment card.

- **Frontend evidence:** components/dashboard/my-payments-panel.tsx:478-499 - <details> 'View receipts (N)' rendering each receipt via AuthenticatedReceiptPreview (authed blob fetch)
- **Mobile evidence:** lib/screens/my_payments_screen.dart:635-636 - payment card renders only a 'N receipt(s)' text in the meta line; grep shows no buyer receipt-preview anywhere (only the admin file endpoint api_client.dart:2010-2014)
- **Mobile-side verification:** my_payments_screen.dart:635-636 renders 'N receipt(s)' text only; no ReceiptPreview/authed blob preview anywhere in lib
- **Frontend-side verification:** FE renders View receipts (N) with AuthenticatedReceiptPreview (panel 478-499); mobile shows only 'N receipts' text in meta line.

### 🟡 Minor · partial — Seller availabilityWindows from the delivery quote are ignored; no seller-working-hours picker or 'Refresh available times'

**ID:** `finance-buyer:FINANC-09` · **Area:** Checkout — delivery windows on the proforma

**Impact:** Mobile buyers can select Today/Tomorrow windows that fall outside the seller's actual working hours; web replaces the picker with seller availability and lets the buyer refresh it, so app orders can be created against unfulfillable slots.

- **Frontend evidence:** app/checkout/checkout-content.tsx:1400-1415 - step-2 validation switches to availabilityWindows when the quote returns them (selectedAvailabilityWindows, availability.retry); inventory 3.8 - AvailabilityWindowPicker replaces the static windows on seller hours
- **Mobile evidence:** lib/domain/delivery_quote.dart:243-264 - quotedFeeForSeller reads only sellerGroups/consolidatedDeliveryFee; no availabilityWindows anywhere in mobile lib (grep: zero hits); lib/screens/checkout_screen.dart:876,912-941 - always renders the local six-composite resolver with no refresh control
- **Mobile-side verification:** grep availabilityWindow: zero hits in lib; checkout_screen.dart:876 uses static resolveDeliveryWindows; no seller-window refresh
- **Frontend-side verification:** FE validates via quote availabilityWindows + availability.retry (1400-1415, 2979); zero availabilityWindows hits in mobile lib.

### 🟡 Minor · partial — An expired proforma row does not trigger a refetch; stale 'Pending payment' badge persists

**ID:** `finance-buyer:FINANC-10` · **Area:** My Payments — expiry refresh

**Impact:** After the countdown lapses, the mobile row keeps its stale badge/group until the buyer manually refreshes; web immediately re-syncs with the server's EXPIRED status.

- **Frontend evidence:** components/dashboard/my-payments-panel.tsx:354-361 - PaymentCountdown onExpire={() => setReloadKey(...)} refetches the list the moment a countdown crosses zero
- **Mobile evidence:** lib/screens/my_payments_screen.dart:677-699 - row countdown only re-renders the expired-state label; no expiry callback reloads the list (reload happens solely via pull-to-refresh or post-reupload)
- **Mobile-side verification:** my_payments_screen.dart:677-699 countdown is a label Builder; 30s ticker 92-95 only moves the clock; _reloadKey++ solely on resend 139-142
- **Frontend-side verification:** FE PaymentCountdown onExpire bumps reloadKey (panel 354-361); mobile countdown is display-only, no expiry reload.

### 🟡 Minor · divergent — Transaction references diverge: mobile collects and sends buyer-typed references; web always sends []

**ID:** `finance-buyer:FINANC-11` · **Area:** Payment submission payload

**Impact:** Divergent wire behavior between platforms: admin review sees transaction references from app buyers only; mobile also treats a typed reference alone as sufficient proof while web requires an uploaded receipt (its checkbox is disabled without files), so equivalent actions produce different evidence.

- **Frontend evidence:** app/checkout/checkout-content.tsx:1869-1871 - submitProformaPayment(..., { transactionReferences: [], paymentMethodType }) - no web input field exists for a reference (inventory 3.6)
- **Mobile evidence:** lib/screens/checkout_screen.dart:510-512 - typed reference rows collected; 538 - sent in the receipts multipart 'details'; 541-542 - sent in submit-payment; lib/screens/payment_screen.dart:61-68 - standalone screen submits [reference.text.trim()] (possibly empty)
- **Mobile-side verification:** checkout_screen.dart:510-542 collects/sends typed refs in multipart+submit; payment_screen.dart:64 sends typed ref; web always sends []
- **Frontend-side verification:** FE always sends transactionReferences: [] (1869-1871); mobile collects typed refs and sends them (payment_screen:61).

### 🟡 Minor · divergent — Confirmation checkbox is never disabled and removing a receipt does not reset the tick

**ID:** `finance-buyer:FINANC-12` · **Area:** Payment step — confirmation gating

**Impact:** Weaker client validation ordering on mobile: the buyer can keep the 'I confirm' tick after deleting the attached proof (as long as a reference remains) and submit, where web forces re-confirmation after every proof change and physically disables the tick without proof.

- **Frontend evidence:** app/checkout/steps/payment-confirmation-step.tsx:280-297 - Checkbox disabled={disabled || !hasProof} with helper text 'Upload a payment screenshot first.' / 'Tick to enable...'; app/checkout/checkout-content.tsx:2990-2994 - ANY receipt change resets both paymentProofUploaded and paymentConfirmed
- **Mobile evidence:** lib/screens/checkout_screen.dart:1194-1203 - CheckboxListTile always enabled, no helper copy; 1267-1271 - _paymentConfirmed reset only when ADDING a receipt; 1139-1145 - remove-receipt does not reset it (only the hasProof guard at 513 remains)
- **Mobile-side verification:** checkout_screen.dart:1194-1203 checkbox always enabled, no helper copy; reset only on add :1270; remove at 1139-1145 leaves tick set
- **Frontend-side verification:** FE checkbox disabled without proof, any receipt change resets tick (checkout-content 2990-2994); mobile tick not reset on remove.

### 🟡 Minor · divergent — Receipts are re-uploaded on every submit attempt (no paymentProofUploaded guard)

**ID:** `finance-buyer:FINANC-13` · **Area:** Payment submission — duplicate uploads

**Impact:** If receipt upload succeeds but submit-payment then fails (network error, PROFORMA_EXPIRED), retrying re-uploads identical proof files, creating duplicate PaymentReceipt rows for the admin queue.

- **Frontend evidence:** app/checkout/checkout-content.tsx:1864-1867,1874 - uploads only `if (receiptFiles.length > 0 && !paymentProofUploaded)`, sets the flag, resets it after submit (duplicate-submission guard, inventory 8.4)
- **Mobile evidence:** lib/screens/checkout_screen.dart:530-540 - _submitPayment unconditionally calls uploadProformaReceipts whenever _receipts is non-empty; no uploaded flag exists and the list is not cleared until success
- **Mobile-side verification:** checkout_screen.dart:530-540 uploads whenever _receipts non-empty; no paymentProofUploaded flag; list not cleared until success
- **Frontend-side verification:** FE guards upload with !paymentProofUploaded and resets after submit (1864-1874); mobile _submitPayment uploads unconditionally.

### 🟡 Minor · divergent — Mobile-only duplicate payment screen lacks receipts, confirmation tick and real navigation; 'View Order Details' does nothing

**ID:** `finance-buyer:FINANC-14` · **Area:** Standalone payment screen (/checkout/success)

**Impact:** A reduced copy of the payment step exists at a web-equivalent URL but with weaker safeguards (can submit with an empty reference list and no proof) and a success CTA that does not navigate - a dead end for buyers who land there.

- **Frontend evidence:** app/checkout/success/page.tsx:283,376 - web's /checkout/success is the legacy order-success page (PlatformPaymentDetails), not a submit surface; web's step-3 submit requires receipt + tick (payment-confirmation-step.tsx:280-298)
- **Mobile evidence:** lib/screens/payment_screen.dart:173-179 - single reference field, no receipt upload, no confirmation checkbox; 61-68 - submits payment straight from this screen; 233-241 - success 'View Order Details' button only shows a SnackBar with the order reference (contrast lib/screens/checkout_screen.dart:1867-1876 which pushes OrderDetailScreen)
- **Mobile-side verification:** payment_screen.dart:173-179 single ref field, no receipts/tick; submits at 61-68; View Order Details 233-241 only shows a SnackBar
- **Frontend-side verification:** FE success page shows PlatformPaymentDetails, no submit; mobile payment_screen submits w/o receipts/tick, View Order = SnackBar.

### 🟡 Minor · missing — No support contacts on the payment step (phone / WhatsApp)

**ID:** `finance-buyer:FINANC-15` · **Area:** Payment step — support

**Impact:** At the exact moment money is due, mobile buyers have no help path; web embeds call/WhatsApp contacts on the payment card.

- **Frontend evidence:** app/checkout/steps/payment-confirmation-step.tsx:32,95-97,310-328 - 'Need help? Call +255693749306 or message us on WhatsApp' with tel: and wa.me links rendered on the payment card
- **Mobile evidence:** lib/screens/checkout_screen.dart:1018-1243 - the entire payment step build has no support block (the only support affordance in checkout is the quote-failure box's 'Contact support' at 1693-1698)
- **Mobile-side verification:** checkout_screen.dart:1018-1243 payment build has no support block; wa.me/tel only in home, product and admin screens
- **Frontend-side verification:** FE payment card has tel:+255693749306 and wa.me links (confirmation-step 310-328); no support links in mobile checkout.

### 🟡 Minor · divergent — No 'Back' from step 3 and cancel-invoice lands on a dead review step instead of the cart

**ID:** `finance-buyer:FINANC-16` · **Area:** Payment step — exit paths

**Impact:** After cancelling, the mobile buyer is dropped on an empty review step (a dead end - items were cleared and the snapshot removed) while web returns them to the cart page; mobile also offers no stock-releasing way back to review like web's Back.

- **Frontend evidence:** app/checkout/checkout-content.tsx:1559-1568 - handlePrevStep cancels the proforma (releasing stock) and resets proof state when leaving step 3 back to step 2; checkout-content.tsx:1588-1598 - 'Cancel invoice' toasts and router.push('/cart')
- **Mobile evidence:** lib/screens/checkout_screen.dart:1235-1242 - from step >= 3 'Back' is gone, 'Cancel invoice' is the only exit; 650-698 - after cancel the screen deletes the snapshot (683) and setState back to CheckoutStep.review (689-692) with the cart still empty
- **Mobile-side verification:** checkout_screen.dart:1235-1242 Back gone from step 3; _cancelInvoice 650-698 deletes snapshot :683 and setState to review :689-692, no /cart
- **Frontend-side verification:** FE Back from step 3 cancels proforma, Cancel invoice routes to /cart (1559-1598); mobile drops Back, cancel lands on review step.

### 🟡 Minor · missing — Order.paymentDeadline is parsed but never rendered (no payment countdown on buyer order cards)

**ID:** `finance-buyer:FINANC-17` · **Area:** Order cards — payment deadline

**Impact:** On mobile the buyer sees no ticking payment deadline on their order cards; web surfaces the remaining payment time directly on each order card.

- **Frontend evidence:** app/expat/dashboard/page.tsx:2359-2361 - buyer order card renders <PaymentCountdown deadline={order.paymentDeadline}/> (merged via findPaymentForOrder at 2069)
- **Mobile evidence:** lib/models/order.dart:166,233,271 - paymentDeadline parsed on Order; grep shows no widget consumes it (countdowns exist only for proforma expiresAt in checkout_screen/my_payments_screen)
- **Mobile-side verification:** order.dart:166,233,271 parse paymentDeadline; no widget consumes it; orders_screen card and detail show no countdown
- **Frontend-side verification:** FE buyer order card renders PaymentCountdown for paymentDeadline (dashboard 2357-2364); mobile parses it but never renders.

### 🟡 Minor · divergent — Confirm-receipt safety dialog replaced by a rating dialog with no escrow-release warning

**ID:** `finance-buyer:FINANC-18` · **Area:** Escrow release — confirm receipt

**Impact:** The deliberate safety rail that makes the buyer acknowledge money is released to the seller is absent on mobile; the action is bundled into a rating flow (stars prefilled at 5), changing the UX and dropping the warning copy around an escrow-release trigger.

- **Frontend evidence:** app/expat/dashboard/page.tsx:4488-4491 - 'Confirm you received your items' AlertDialog: 'This confirms your order has arrived and releases payment to the seller. Only confirm once you actually have your items in hand.'; components/orders/delivery-code-card.tsx:155 - same release warning on the order-detail confirm path
- **Mobile evidence:** lib/screens/orders_screen.dart:476-506 - _ratingDialog: 5 stars (default 5) + optional review text, no escrow-release warning copy; 867-880 - 'Confirm Received' opens this rating dialog and sends confirm-receipt {rating, comment}
- **Mobile-side verification:** orders_screen.dart:476-527 _ratingDialog stars+review, no escrow-release copy; Confirm Received 867-880 sends {rating, comment}
- **Frontend-side verification:** FE dialog warns of escrow release (dashboard 4488-4491); mobile opens 5-star rating dialog (default 5) with no warning.

### 🟡 Minor · missing — No currency selection or 'Approx. TZS' conversion note; TZS hardcoded

**ID:** `finance-buyer:FINANC-19` · **Area:** Payment amounts — currency

**Impact:** Buyers browsing in another currency get no TZS approximation on mobile at the payment step, where web spells out the settlement currency and the approximate amount due.

- **Frontend evidence:** app/checkout/checkout-content.tsx:349 - useCurrency() selectedCurrency drives the checkout; checkout-content.tsx:3901-3903 - 'Approx. TZS {n}' shown when selectedCurrency !== 'TZS'; sidebar note 'Payment processed in TZS' (inventory 1.13)
- **Mobile evidence:** lib/domain/checkout_proforma.dart:131-135 - buyDetails hardcodes 'currency': 'TZS'; no currency selector exists in the app (Product.formatPrice renders TSh)
- **Mobile-side verification:** checkout_proforma.dart:135 hardcodes 'currency': TZS; zero selectedCurrency/useCurrency hits; no conversion note anywhere
- **Frontend-side verification:** FE uses useCurrency + Approx. TZS note (349, 3901-3905); mobile hardcodes currency TZS (checkout_proforma:135).

### 🟡 Minor · missing — Legacy CASH-on-delivery checkout and the order-success platform payment details page are absent

**ID:** `finance-buyer:FINANC-20` · **Area:** Legacy payment path

**Impact:** The flag-gated legacy 'pay on delivery/pickup' path and its prepay-by-Selcom success page do not exist on mobile; a buyer who could use cash-on-delivery on web has no equivalent method in the app.

- **Frontend evidence:** lib/feature-flags.ts:12 - LOGISTICS_V2_ENABLED is build-time; app/checkout/checkout-content.tsx:311-317 - legacy single method 'Cash / Mobile Money / Bank Transfer when receiving order'; 3251,3274 - 'Coming Soon' Mobile Money/Card accordions; 2082-2124 - meetSeller order placement; app/checkout/success/page.tsx:283,376 - PlatformPaymentDetails rendered while isOrderAwaitingPayment
- **Mobile evidence:** grep of lib for CASH|meetSeller|Coming Soon returns no matches - the app implements only the v2 proforma flow; lib/screens/payment_screen.dart occupies /checkout/success with the v2 submit screen instead of the legacy success page
- **Mobile-side verification:** no CASH/Coming Soon hits in lib; only v2 proforma flow; app_router.dart:172-177 puts PaymentScreen at /checkout/success
- **Frontend-side verification:** FE keeps legacy CASH method (311-317) + Coming Soon Mobile Money/Card (3251,3274); mobile implements v2 proforma only.

#### Second-pass candidates (10) — unverified

_Found by an independent re-audit of this domain (different inventory pass). Not adversarially verified; wording may overlap a canonical gap above._

- **🟠 Major · missing — Saved payment-method management absent — static informational screen instead of card list with add/delete**
  - Impact: Mobile buyers cannot save or manage cards at all; the screen also advertises 'Card (CARD)' settlement although every payment surface in the app asserts CARD invalid (MOBILE_MONEY/BANK_TRANSFER only). Parity feature users will notice missing.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/app/account/payment-methods/page.tsx:57-105 - GET/POST/DELETE `/api/payment-methods` with add ('Payment method added') and remove ('Payment method removed') handlers; :124-181 - 'Add new card' dialog with cardNumber/MM/YY/CVC inputs; :201-222 - per-card delete AlertDialog 'Remove card?' ('This action cannot be undone...'); :184-185 - 'No payment methods saved yet.' empty state
  - MO: D:/Projects/Global_Expats/GloboExpats_Mobile/lib/screens/account_misc_screens.dart:1092-1127 - PaymentMethodsScreen is a `const` ListView of two hardcoded ListTiles ('Mobile money', 'Card (CARD)') plus a grey disclaimer; no state, no API call, no add/edit/delete — comment says it is 'informational'
- **🟠 Major · missing — Cross-region delivery policy completely absent: no 'Arranged after checkout', no cross-region explainer box, no 'Arrange with seller' handoff state, no 'Pending delivery quote' total**
  - Impact: Cross-region buyers see an unexplained 'To be confirmed' instead of the 'arranged after checkout, not included in amount due' contract, and rental/handoff groups lose the 'Arrange with seller' state. Money-display semantics diverge for exactly the orders where the amount due is not final.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/app/checkout/steps/review-step.tsx:142 - `crossRegion: quoted.crossRegionDelivery === true || quoted.consolidatedDeliveryFee === null`; :372-373 - amber 'Arranged after checkout' fee state; :390-402 - cross-region box ('The delivery cost will be discussed and arranged after checkout…' / 'The delivery cost is not included in the amount due.'); :493-494 - delivery total '-' for cross-region; :505-509 - total 'Pending delivery quote'; :369 - green 'Arrange with seller' for non-delivery (rental/handoff) groups
  - MO: D:/Projects/Global_Expats/GloboExpats_Mobile/lib/domain/delivery_quote.dart:243-264 - quotedFeeForSeller reads only `consolidatedDeliveryFee`; grep of the whole mobile repo for `crossRegion|Arranged after checkout|Arrange with seller` returns zero matches; D:/Projects/Global_Expats/GloboExpats_Mobile/lib/screens/checkout_screen.dart:1566-1579 - fee row shows only price(>0) / failure label / 'To be confirmed' — a zero fee and an unquoted/cross-region group both fall into 'To be confirmed'
- **🟠 Major · missing — 'Back to Cart' restore-on-expiry missing: cart snapshot is persisted but never read back, expired flow leaves the buyer with an empty cart**
  - Impact: After an invoice expires, web buyers get their confirmed items restored to the cart; mobile buyers lose the entire cart contents and must re-find and re-add every item manually. Data-loss UX on a failure path users actually hit (1-hour lock).
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/app/checkout/checkout-content.tsx:1611 - `restoreExpiredCart` re-adds the snapshot cart; :3998 and :4006 - both expiry-dialog buttons ('Back to Cart' → /cart, 'Start Over') call restoreExpiredCart; :145 - snapshot key `checkout_proforma_cart_snapshot`
  - MO: D:/Projects/Global_Expats/GloboExpats_Mobile/lib/screens/checkout_screen.dart:452-455 - snapshot written to KvStore.kProformaCartSnapshot before `_cart.clear()` (462); :591 and :683 - snapshot only ever removed (on submit/cancel), never read; :601-625 - expired dialog offers only OK / 'Start fresh checkout'; :627-646 - `_restartCheckout` resets to the review step with the cart still empty
- **🟡 Minor · divergent — Payment-submit validation diverges: transaction-reference-only proof accepted, confirmation checkbox not gated on proof, submit button always tappable, refs sent in submit body**
  - Impact: Mobile permits a reference-only declaration the web flow deliberately prevents (web requires an attached screenshot before the tick can even be enabled). Different proof-quality bar and different submit payload for the same backend endpoint.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/app/checkout/steps/payment-confirmation-step.tsx:283 - Checkbox `disabled={disabled || !hasProof}` where hasProof = receipt files only (:98); :293-295 - helper 'Upload a payment screenshot first.'; D:/Projects/Global_Expats/GloboExpats_Frontend/app/checkout/checkout-content.tsx:1851-1857 - submit blocked with toast 'Upload a payment screenshot, then tick "I have completed the payment".'; :1869-1871 - submit-payment always sends `transactionReferences: []`
  - MO: D:/Projects/Global_Expats/GloboExpats_Mobile/lib/screens/checkout_screen.dart:513-518 - `hasProof = _receipts.isNotEmpty || refs.isNotEmpty` — references alone satisfy proof; :1194-1196 - checkbox has no proof gating; :1221-1225 - submit button enabled even without proof/tick (validation deferred to inline errors); :541-542 - user-entered refs sent in the submit-payment body (copy at :1123-1125 explicitly offers 'a screenshot, a transaction reference, or both')
- **🟡 Minor · partial — No 30s proforma polling and no server refresh on client expiry; My Payments rows do not reload when their countdown expires**
  - Impact: Mobile state goes stale: server-side expiry/verification/cancellation surfaces only after a manual pull-to-refresh, a failed submit, or leaving the screen; countdown-expired rows sit in Pending until manual refresh. Web treats the server as authoritative against clock skew; mobile relies on the device clock.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/hooks/use-proforma.ts:22 - POLL_INTERVAL_MS = 30_000; :131-138 - setInterval refresh while PENDING_PAYMENT/PAYMENT_SUBMITTED; :156-161 - handleClientExpiry re-checks the server when the countdown crosses zero; D:/Projects/Global_Expats/GloboExpats_Frontend/components/dashboard/my-payments-panel.tsx:359 - row countdown `onExpire={() => setReloadKey(...)}` reloads the list
  - MO: D:/Projects/Global_Expats/GloboExpats_Mobile/lib/api/api_client.dart:495 - getProforma defined, called by no screen (grep across lib); D:/Projects/Global_Expats/GloboExpats_Mobile/lib/screens/checkout_screen.dart:1791-1798 - countdown is a purely local 1s tick with no expiry callback; D:/Projects/Global_Expats/GloboExpats_Mobile/lib/screens/my_payments_screen.dart:92-95 - 30s timer updates only `_now` (label rendering), never refetches
- **🟡 Minor · partial — Multi-currency checkout absent: country fixed to Tanzania, currency hardcoded TZS, no selected-currency display or TZS-settlement notice**
  - Impact: KE/UG/RW buyers get no localized currency display in checkout (everything renders TSh); web's currency selection, approx-conversion line and settlement notice have no mobile counterpart. Settlement is TZS on both sides, so impact is display-level.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/app/checkout/checkout-content.tsx:326-329 - country list TZ/KE/UG/RW each mapping currency TZS/KES/UGX/RWF; :1699 - proforma payload `currency: selectedCountryData?.currency || 'TZS'`; :3824-3825 - standing notice 'Prices shown in your selected currency. Payment processed in TZS…'; :3901-3903 - 'Approx. TZS' conversion line when selectedCurrency !== TZS
  - MO: D:/Projects/Global_Expats/GloboExpats_Mobile/lib/screens/checkout_screen.dart:236-237 - city prefilled 'Dar es Salaam', `_countryText = 'Tanzania'` with no country selector (only mirrored from a saved address at :229); D:/Projects/Global_Expats/GloboExpats_Mobile/lib/domain/checkout_proforma.dart:135 - `'currency': 'TZS'` hardcoded in buildBuyDetails
- **🟡 Minor · missing — Buyer finance analytics missing: no Total Spend/success-rate KPIs, Spending Summary, Current Cart card, or Order Status Breakdown**
  - Impact: Buyers get no spend/success overview on mobile; checkout-health messaging ('N orders failed or were canceled. Review payment method and checkout flow.') is absent. Informational, not flow-affecting.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/app/expat/dashboard/page.tsx:3903-3952 - buyer KPI cards 'Total Orders'/'Total Spend'/'Saved Items'/'Cart Value' with success rate; :4130-4190 - 'Spending Summary' (Total Lifetime Spend, Average Order Value, Success Rate .toFixed(1)%); :4275-4291 - checkout-health recommendations (failedOrders → 'Review payment method and checkout flow.')
  - MO: D:/Projects/Global_Expats/GloboExpats_Mobile/lib/screens/delivery_dashboard_screens.dart:511-590 - _OverviewTab renders only seller stats (listings/active/views/orders from products + selling orders); grep for 'Total Spend|success rate|Cart Value|Spending Summary' in mobile lib returns no matches
- **🟡 Minor · partial — Window picker divergences: server-supplied availability windows ignored, past windows hidden instead of disabled 'Time passed', no availability loading/error/retry states**
  - Impact: When the backend supplies seller-specific working-hour windows, mobile still offers the generic Today/Tomorrow catalog; buyers lose the 'Time passed' explanation for vanished slots and web's availability retry affordance. Proforma payload windows may diverge from what the web would send for the same sellers.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/app/checkout/steps/review-step.tsx:203-212 - prunes selection against `quote.availabilityWindows` (server windows drive AvailabilityWindowPicker); :540-554 - availabilityLoading / availabilityError with 'Retry availability' button; :618 - disabled option label 'Time passed'
  - MO: D:/Projects/Global_Expats/GloboExpats_Mobile/lib/screens/checkout_screen.dart:876 + 912-941 - only the fixed 6-composite catalog from resolveDeliveryWindows is rendered; D:/Projects/Global_Expats/GloboExpats_Mobile/lib/domain/delivery_windows.dart:148 - past options are filtered OUT of the list (never shown disabled); grep for `availabilityWindows` in mobile lib: no matches
- **🟡 Minor · BROKEN — 'Try again' button is inert: increments an unobserved _reloadKey and never refetches**
  - Impact: On a failed payments fetch, the only on-screen recovery does nothing; the buyer must leave and re-enter the screen to retry. Web's explicit retry path is the deliberate pattern being ported.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/components/dashboard/my-payments-panel.tsx:225 - 'Try again' button re-runs the payments fetch (explicit failure card 'Couldn't load your payments', deliberately not an empty state)
  - MO: D:/Projects/Global_Expats/GloboExpats_Mobile/lib/screens/my_payments_screen.dart:189 - `OutlinedButton(onPressed: () => _reloadKey++, child: const Text('Try again'))`; :82 - `int _reloadKey = 0` is read nowhere (only other use :141 before an explicit `await _load()`); incrementing a field without setState triggers no rebuild and no fetch, and the failure branch (:169-192) is outside the RefreshIndicator, so pull-to-refresh is unavailable there
- **🟡 Minor · missing — Matomo 'purchase' event on order/payment confirmation is not implemented on mobile**
  - Impact: Mobile-originated orders produce no purchase/revenue analytics events; conversion reporting undercounts mobile payments. No user-facing flow impact.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/app/checkout/success/page.tsx:90-93 - `window._mtm.push({event: 'purchase', …purchase: {…}})` on confirmed status/completed payment, deduped per order; :113-114 - tracking failures warned, never fatal
  - MO: D:/Projects/Global_Expats/GloboExpats_Mobile/lib/api/api_client.dart:1123-1152 - the mobile Matomo client is read-only (`matomoQuery` GET for the insights screen); grep for purchase/trackEvent across lib shows no event push anywhere (only a comment in models/product_detail.dart:47)

<details><summary><strong>Confirmed equivalent in both apps (31)</strong></summary>

- 4-step v2 checkout machine (Address/Review/Payment/Completion) with items locked from step 3 (web checkout-content.tsx:537 vs lib/screens/checkout_screen.dart:264-267 + 'Locked' badge 1303-1314)
- Proforma creation on review confirm with grand-total mismatch guard: |grandTotal - reviewedTotal| > 0.01 auto-cancels the created proforma, resyncs cart prices from authoritative unit prices and refetches the quote (checkout-content 5.7 vs checkout_screen.dart:429-447, lib/domain/checkout_proforma.dart:163-189)
- Proforma totals card on payment step uses authoritative proforma itemsTotal/deliveryTotal/grandTotal with cart fallbacks (checkout_screen.dart:1062-1093)
- Hardcoded Selcom receiving details identical on both sides (bank 5527108094688 / Lipa Namba 7003 9305 / GloboExpats Limited) with 'Payment reference' = proformaNumber, deliberately not sourced from proforma.paymentInstructions (payment-confirmation-step.tsx:43-64 vs checkout_screen.dart:1706-1760, payment_screen.dart:13-23, lib/platform-payment-details.ts:1-6)
- Method picker MOBILE_MONEY default / BANK_TRANSFER with paymentMethodType asserted to real backend enums (never CARD/SALE) and sent in both create and submit payloads (checkout_screen.dart:1097-1116, checkout_proforma.dart:93-95,131 vs checkout-content 3.7)
- Proof-of-payment limits: 5 files x 5MB client-enforced with 'You can upload up to 5 receipts.' / 'exceeds the 5MB limit.' copy and per-row remove; image downscale to 1600px @ q80 (receipt-upload.tsx:16-23,110-134 vs checkout_screen.dart:73-74,1250-1264)
- Confirmation checkbox copy byte-identical and required before submit (payment-confirmation-step.tsx:288-296 vs checkout_screen.dart:1199-1203,520-523)
- Escrow buyer-protection banner on the payment step ('money is held by GloboExpats until your order is delivered... refunded in full') (payment-confirmation-step.tsx:301-308 vs checkout_screen.dart:1204-1215)
- Submit success branches strictly on response status == PAYMENT_SUBMITTED, never on body emptiness; PROFORMA_EXPIRED gets the expiry dialog, PAYMENT_PROOF_REQUIRED the friendly copy (checkout-content 1869-1873 vs checkout_screen.dart:546-573, lib/widgets/api_error_view.dart friendlyErrorMessage)
- Order snapshot + lastOrderId persisted and proforma cart snapshot removed on submit success; snapshot written BEFORE the cart is cleared; proforma cached under proforma_{id} for killed-app recovery (checkout_screen.dart:449-462,588-591, lib/storage/kv_store.dart:98-105)
- Cancel-invoice confirm dialog copy ('Your reserved items will be released...') with Keep/Cancel actions and POST /proformas/{id}/cancel releasing stock (checkout-content 1.7 vs checkout_screen.dart:650-698)
- My Payments: 4 group tabs (Pending/Approved/Rejected/Expired) with live counts and identical group descriptions; same deep-link values pending|verified|rejected|expired (my-payments-panel.tsx:70-84,148-152 vs my_payments_screen.dart:256,356-445, lib/app_router.dart:231-242)
- Recovery-state precedence ported exactly: CONFIRMED/VERIFIED > EXPIRED/CANCELLED > replacement SUBMITTED receipt outranks older REJECTED > status PAYMENT_SUBMITTED/SUBMITTED/PENDING_VERIFICATION/UNDER_REVIEW > pending (my-payments-panel.tsx:86-92 vs my_payments_screen.dart:287-305)
- Status badge map identical incl. 'Action needed - new proof' amber override, Approved/Pending/Expired/Rejected/Cancelled/Pending payment (my-payments-panel.tsx:103-127 vs my_payments_screen.dart:502-538)
- 48h correction-window math identical (explicit correctionDeadline > rejectedAt+48h > max receipt reviewedAt|submittedAt+48h) with 'X remaining to upload corrected proof.' / 'overstayed by X. GloboExpats can now cancel this invoice.' copy and 'Xd Yh Zm' duration format (lib/payment-timing.ts vs lib/domain/escrow.dart:96-114, my_payments_screen.dart:578-586,743-752,782-793)
- Rejected-proof inline re-upload: 'Reopen & update payment' -> upload -> 'New proof sent' -> jumps to Pending group + refetch; CORRECTION_WINDOW_CLOSED surfaced with the 48h-closed copy; per-receipt reason fallback chain incl. 'No reason provided - contact support.' (my-payments-panel.tsx:154-176,412-426 vs my_payments_screen.dart:124-162,724-742)
- 'Continue payment' on resumable PENDING_PAYMENT rows and 'Order' button otherwise; ticking proforma countdown only on resumable rows (my-payments-panel.tsx:354-397 vs my_payments_screen.dart:650-699)
- My Payments distinct loading / 'Couldn't load your payments' + Try again / 'No payments yet' empty states, pull-to-refresh, 30s clock tick, tolerant content/items/array parsing (my-payments-panel.tsx:178-245 vs my_payments_screen.dart:104-122,164-253,807-830)
- Made-to-order banner on the payment step from maximumProductionTimeDays frozen at invoice time (payment-confirmation-step.tsx:126-138 vs checkout_screen.dart:1035-1061,112-118)
- Proforma countdown semantics: visible only while PENDING_PAYMENT, 3h urgent threshold, expired-state copy 'reserved items were released. Please re-order.', 1s tick (components/checkout/proforma-countdown.tsx vs lib/domain/countdown.dart:10-78, checkout_screen.dart:1762-1833)
- Order-detail escrow banner table: REFUNDED (with amount) > REFUND_PENDING > escrowPending 'under review' > RELEASED > HELD refined by order status > pending, with tone colors and verified_user icon (lib/domain/escrow.dart:19-88, orders_screen.dart:712-765)
- Buyer order-status wording incl. PENDING 'Payment submitted - being verified', AWAITING_PAYMENT 'Awaiting payment verification', PAID 'Payment confirmed - order placed', legacy CONFIRMED->COMPLETED normalization (lib/order-status.ts vs lib/models/order.dart orderStatusLabel)
- Delivery-code / rental-handoff cards buyer-only at IN_TRANSIT/AWAITING_PICKUP with regenerate action (DeliveryCodeCard vs orders_screen.dart:766-787)
- Delivery-window model: six Today/Tomorrow composites, multi-select ('Selecting more than one window gives the seller safe alternatives.'), slot hours 10-12/12-16/16-20, EAT dating shifted by production days, past-window errors (checkout-content 3.8 vs lib/domain/delivery_windows.dart, checkout_screen.dart:904-947)
- Delivery-quote failure taxonomy, per-reason resolutions, 20s watchdog -> CALCULATION_TIMEOUT, Retry/Fix delivery address/Contact support buttons (checkout-content 5.10-5.12 vs lib/domain/delivery_quote.dart:63-239, checkout_screen.dart:296-357,1652-1703)
- Terms checkbox gating proforma generation with the same error copy (checkout-content 3.9 vs checkout_screen.dart:374-375,956-975)
- API surface for the buyer payment flow matches: POST /checkout/proforma, POST /proformas/{id}/receipts (multipart + plain-text details JSON with transactionReferences/note), POST /proformas/{id}/submit-payment, POST /proformas/{id}/cancel, GET /payments/my (api_client.dart:449-590, my_payments_screen.dart:798-884)
- Proforma create payload invariants: round2 money math, deliveryFee 0 for BUYER_PICKUP, currency TZS, dated preferredDeliveryWindows[] (checkout-content 3.11 vs checkout_proforma.dart:80-140, delivery_windows.dart:236-264)
- Proforma-creation failure copy: ACCOUNT_BLOCKED / INSUFFICIENT_STOCK / BUYER_PROFILE_SETUP_FAILED (checkout-content 8.6 vs lib/widgets/api_error_view.dart proformaFailureMessage)
- Seller 'Mark paid' suppressed from the per-order action hint in v2 ('no action needed yet') on both sides, while the derived order-notification classifier keeps the same seller MARK_PAID entry web's own lib/order-notification-actions.ts:158-164 has (lib/domain/order_action_hint.dart, lib/domain/pending_actions.dart:123-130)
- Admin payments-review surface driving buyer-visible states exists with verify/reject (6 reason codes), confirm-payment, cancel-after-rejection and authed receipt preview (lib/screens/admin_payments_review_screen.dart + api_client.dart:1942-2014)

</details>


## API client surface parity (cross-cutting)

### 🔴 CRITICAL · BROKEN — Checkout resume deep link /checkout?proforma=ID is parsed but the parameter is dropped, so 'Continue payment' from My Payments opens a blank checkout instead of resuming the invoice

**ID:** `api-surface:APISUR-01` · **Area:** Checkout / proforma resume

**Impact:** A buyer with a saved invoice taps Continue payment and lands on an empty checkout: the cart is gone, the invoice is not shown, and they must restart the whole checkout and re-submit payment for an already-created proforma - risk of duplicate proformas and abandoned payments (money flow).

- **Frontend evidence:** GloboExpats_Frontend/app/checkout/checkout-content.tsx:443 - resumeProformaId is read from the URL search params and passed into the proforma fetch flow; hooks/use-proforma.ts:27-39 fetches the existing proforma by id to rebuild the checkout state
- **Mobile evidence:** GloboExpats_Mobile/lib/app_router.dart:163-176 - the /checkout builder constructs CheckoutScreen(auth: AuthStore.instance) and never forwards the parsed ?proforma= query parameter; lib/screens/checkout_screen.dart:42-58 - constructor has no proformaId parameter at all; lib/screens/my_payments_screen.dart:545-546 - 'Continue payment' pushes the dead link; repo-wide grep shows zero calls to api.getProforma in the mobile app
- **Mobile-side verification:** app_router.dart:168-170 drops ?proforma; CheckoutScreen has no such param; my_payments_screen.dart:546 pushes the URL anyway
- **Frontend-side verification:** Frontend evidence checks out. checkout-content.tsx:443 reads `searchParams.get('proforma')` into resumeProformaId (comment explicitly says it resumes payment from My Payments even with an empty cart), :489 forces logisticsV2 when set, :549 passes it into useProforma(resumeProformaId), :1296-1311 renders 'Loading your invoice / Resuming your payment...' until the proforma loads, and :1128 treats a deep link as authoritative over the cart. Minor cite nit: the actual fetch is use-proforma.ts:77-93 (explicitProformaId -> apiClient.getProformaInvoice), lines 27-39 are the sessionStorage helpers; behavior described is real. Critical is right (payment-critical resume flow).

### 🔴 CRITICAL · missing — Client-side cross-region delivery policy (force-null quoted fees before invoicing) is absent on mobile, so cross-region orders would be invoiced fees the web app defers

**ID:** `api-surface:APISUR-02` · **Area:** Checkout / cross-region delivery pricing

**Impact:** Cross-region buyers are charged delivery fees up front that the platform's business rules defer/void - direct money impact: overcharged invoices and payment amounts that disagree with the web platform for the same cart.

- **Frontend evidence:** GloboExpats_Frontend/lib/delivery-region.ts:109 - export applyCrossRegionDeliveryPolicy; app/checkout/checkout-content.tsx:1232 - policy applied to the delivery quote before the proforma is created; app/checkout/steps/review-step.tsx:122 - fee display renders the policy-adjusted (nulled) fee for cross-region seller groups
- **Mobile evidence:** GloboExpats_Mobile/lib/domain/delivery_quote.dart:248-259 - fee is read directly from sellerGroups[].consolidatedDeliveryFee with no crossRegion handling; lib/screens/checkout_screen.dart:417 - proforma payload uses the raw quoted fee; repo-wide grep for 'crossRegion' in GloboExpats_Mobile returns zero matches
- **Mobile-side verification:** Zero lib matches for crossRegion/deliveryPolicy/forceNull; quote and proforma payload use raw consolidatedDeliveryFee
- **Frontend-side verification:** delivery-region.ts:109-138 applyCrossRegionDeliveryPolicy force-nulls consolidatedDeliveryFee/Min/distanceKm, sets crossRegionDelivery:true, and recomputes deliveryTotal for cross-region seller groups. checkout-content.tsx:1232-1236 applies it to the quote response and stores BOTH the quote and `deliveryFee = effectiveQuote?.deliveryTotal ?? 0` — the very fee later invoiced in the proforma (5.1 reads deliveryQuote.deliveryTotal). review-step.tsx:118-137 feeForSeller reads the same policy-adjusted effectiveQuote. Severity critical is right: the invoiced amount itself changes.

### 🔴 CRITICAL · missing — Seller dispatch action (POST /orders/{id}/dispatch) is not exposed to sellers on mobile - the verb exists only in the mobile ADMIN action map, so the v2 delivery chain stalls at the seller step

**ID:** `api-surface:APISUR-03` · **Area:** Logistics v2 / seller dispatch

**Impact:** A seller on mobile who accepted a SELLER_DELIVERY order cannot dispatch it; the order sits in AWAITING_DISPATCH with no buyer-visible progress, blocking the downstream escrow-release chain for v2 orders (money flow).

- **Frontend evidence:** GloboExpats_Frontend/lib/api.ts:3750-3754 - dispatchOrder posts to /orders/{id}/dispatch on the user client, wired into the seller order page flow
- **Mobile evidence:** GloboExpats_Mobile/lib/api/api_client.dart:2091-2107 - user orderAction verb map contains confirm-receipt/seller-cancel/seller-rate/verify-delivery/regenerate-delivery-code/confirm-delivery/mark-picked-up/mark-delivered/availability-* but no 'dispatch'; 'dispatch' only exists in the admin map at api_client.dart:2047; lib/screens/orders_screen.dart:1066 - dispatch button rendered only in the admin screen branch
- **Mobile-side verification:** User orderAction map (api_client.dart:2091-2107) lacks dispatch; only admin map :2047; no seller orderAction('dispatch') call site
- **Frontend-side verification:** lib/api.ts:3750-3754 is exactly `dispatchOrder(orderId)` -> `this.request('/api/v1/orders/${orderId}/dispatch', {method:'POST'})` on the user ApiClient, with the comment 'Seller hands the assigned order to the transporter during its delivery window'. It is wired into the seller order page (app/orders/[id]/page.tsx:222-226 DISPATCH_ORDER in runOrderAction) and the dispatch card flow. Critical is right — the v2 chain (and escrow release downstream) stalls without it.

### 🔴 CRITICAL · missing — Buyer delivery-time confirm/counter-propose (PATCH /orders/{id}/delivery-time/confirm and /delivery-time/propose) is missing from the user surface on mobile - admin-only verbs and an orphaned local descriptor

**ID:** `api-surface:APISUR-04` · **Area:** Logistics v2 / buyer delivery-time confirmation

**Impact:** The buyer cannot confirm or negotiate the seller's proposed delivery slot on mobile, so v2 orders cannot leave the scheduling step; pending-action badges nag forever and escrow release is never reached (money flow).

- **Frontend evidence:** GloboExpats_Frontend/lib/api.ts:3877-3895 - confirmDeliveryTime (PATCH delivery-time/confirm) and proposeDeliveryTime (PATCH delivery-time/propose) on the user API client, used by the buyer order page to accept or counter the proposed window
- **Mobile evidence:** GloboExpats_Mobile/lib/api/api_client.dart:2042-2043 - delivery-time/confirm and delivery-time/propose exist only inside the ADMIN verb map; lib/domain/pending_actions.dart:68-75 - a confirmDeliveryTime pending-action descriptor is derived locally but has no matching user API call or UI handler anywhere in the app
- **Mobile-side verification:** delivery-time verbs only in admin map api_client.dart:2042-2043; user map omits them; zero screen references
- **Frontend-side verification:** lib/api.ts:3877-3881 confirmDeliveryTime -> PATCH /api/v1/orders/{id}/delivery-time/confirm; :3887-3895 proposeDeliveryTime -> PATCH /api/v1/orders/{id}/delivery-time/propose with {proposedDeliveryTime, note} — both on the user client, both consumed by the buyer order page (DeliveryTimeConfirmation actions, inventory 2.11). Cited line range is exact. Critical is right: without these the trip stays PROPOSED and the order never reaches IN_TRANSIT.

### 🟠 Major · partial — Persisted proforma cart snapshot is written but never read back: mobile restarts checkout with an empty cart after invoice expiry while web restores the cart

**ID:** `api-surface:APISUR-05` · **Area:** Checkout / expired invoice recovery

**Impact:** Buyers whose invoice expired must rebuild their entire cart manually on mobile; on web the same flow restores the cart in one tap - a large friction difference on a payment-critical path.

- **Frontend evidence:** GloboExpats_Frontend/app/checkout/checkout-content.tsx:1611,3998,4006 - restoreExpiredCart rehydrates the cart items when the proforma is expired so the buyer can immediately re-checkout
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/checkout_screen.dart:452-459 - snapshot is written to KvStore on proforma creation and :591/:683 - removed on submit/cancel, but the expiry dialog at :601-625 and _restartCheckout at :627-646 never read it (zero kProformaCartSnapshot reads), so the restart starts from an empty cart
- **Mobile-side verification:** kProformaCartSnapshot written :453, removed :591/:683, never read anywhere - no restore path exists
- **Frontend-side verification:** checkout-content.tsx:1611 restoreExpiredCart re-adds every confirmedCartItems entry via addToCart, clears proforma/snapshot/receipt state, returns success; the blocking expiry dialog's 'Back to Cart' (:3997-3998) and 'Start Over' (:4005-4006) buttons both await restoreExpiredCart() before navigating. So web restores the cart from the expiry dialog in one tap. Major is right (payment-critical recovery friction, not a money-amount break).

### 🟠 Major · partial — No 30s proforma status polling during checkout on mobile - admin-side payment approval (or rejection/cancellation) is never observed mid-checkout

**ID:** `api-surface:APISUR-06` · **Area:** Checkout / proforma status polling

**Impact:** On mobile the buyer can never see 'payment verified' arrive asynchronously; they sit on the countdown until expiry and may re-pay for an invoice that was already approved (duplicate payment risk), or never learn the payment was rejected.

- **Frontend evidence:** GloboExpats_Frontend/hooks/use-proforma.ts:22,134-136 - useProforma polls GET /api/v1/proformas/{id} every 30 seconds while the checkout waits, transitioning to success when payment is verified
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/checkout_screen.dart:308 (20s delivery-quote watchdog) and :1794 (1s expiry countdown) are the only timers; repo-wide grep shows zero getProforma calls, so the screen only reacts to the local countdown
- **Mobile-side verification:** getProforma (api_client.dart:495) has zero callers; checkout's only timer is the 1s countdown at :1794
- **Frontend-side verification:** use-proforma.ts:22 POLL_INTERVAL_MS = 30_000; :131-138 polls refresh() while isActive (PENDING_PAYMENT or PAYMENT_SUBMITTED); getProformaInvoice hits GET /api/v1/proformas/{id} (api.ts:3393-3396) — the claimed endpoint path is correct. One nuance: the hook itself doesn't hard-navigate to a success screen; it applies the latest status so consumers react (e.g. ProformaCountdown hides once status != PENDING_PAYMENT, expiry paused on PAYMENT_SUBMITTED, rejection states surface). The 30s mid-checkout polling behavior and its absence on mobile stand; major is right (duplicate-payment risk).

### 🟠 Major · partial — No request timeout on any mobile API call and 504 is not mapped in error UI - a hung gateway blocks the call site forever, versus web's 30s AbortController and 502/503/504 maintenance mapping

**ID:** `api-surface:APISUR-07` · **Area:** HTTP client resilience

**Impact:** A stalled connection freezes buttons indefinitely with no spinner timeout and no retry cue; a 504 during checkout shows a raw/generic error instead of the maintenance-style message web users get.

- **Frontend evidence:** GloboExpats_Frontend/lib/api.ts:511-512 - fetchWithTimeout wraps every request in a 30000ms AbortController; :579-581 - isGatewayStatus treats 502/503/504 as gateway errors and surfaces the maintenance message
- **Mobile evidence:** GloboExpats_Mobile/lib/api/api_client.dart:31-53 - _send uses plain http.* calls with no .timeout() anywhere (grep: only geocoding_service.dart:93,127,148,167 uses .timeout); lib/widgets/error_text.dart:15-16 maps 502/503 but not 504
- **Mobile-side verification:** .timeout( only in geocoding_service.dart:93-167; no 504 mapping found in lib error UI
- **Frontend-side verification:** lib/api.ts:506-524 fetchWithTimeout aborts every request via AbortController at 30000ms (claim's :511-512 exact); :579-581 isGatewayStatus covers 502/503/504 (exact); MAINTENANCE_MESSAGE (:83-84) is surfaced with isGatewayError set from isGatewayStatus or the maintenance message (:826-827), and timeouts are converted to MAINTENANCE_MESSAGE errors (:906-910). Major is right for a hung-request/504 UX gap on checkout paths.

### 🟠 Major · missing — Seller-side payments/received, seller-document and related seller payout-visibility endpoints are absent on mobile

**ID:** `api-surface:APISUR-08` · **Area:** Seller payments / documents

**Impact:** Sellers on mobile cannot see received/verified payments or upload required seller documents, losing payout visibility that web sellers have (money-adjacent flow).

- **Frontend evidence:** GloboExpats_Frontend/lib/api.ts:3494 - getPaymentsReceived (GET /payments/received) and :3498-3502 - seller-document endpoints on the user client, feeding the seller earnings/documents views
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/my_payments_screen.dart:798-830 - PaymentsApi implements only GET /payments/my (buyer view); lib/screens/delivery_dashboard_screens.dart:497 - the Selling tab renders SellerListingsScreen with no received-payments surface; grep for 'payments/received' in mobile returns zero matches
- **Mobile-side verification:** Only GET /payments/my (my_payments_screen.dart:809); zero matches for payments/received or seller-document
- **Frontend-side verification:** lib/api.ts:3493-3495 getReceivedPayments() -> GET /api/v1/payments/received (claim calls it getPaymentsReceived — trivial naming delta); :3498-3505 uploadSellerPaymentDocument -> POST /api/v1/payments/received/{orderId}/seller-document. These feed the seller 'Payments received' panel with EFD-receipt upload/replace (inventory 2.18). Major is right (seller payout visibility is a user-visible feature).

### 🟠 Major · missing — Availability-windows/working-schedule endpoint is absent; mobile hardcodes six fixed composites (TODAY/TOMORROW x MORNING/AFTERNOON/EVENING EAT)

**ID:** `api-surface:APISUR-09` · **Area:** Delivery scheduling / windows

**Impact:** Mobile shows delivery slots the backend may not honor (holidays, seller-specific schedules, changed hours) and hides slots the server offers, producing failed or rejected delivery-time proposals in the v2 chain.

- **Frontend evidence:** GloboExpats_Frontend/lib/api.ts:2790-2812 - getAvailabilityWindows and working-schedule endpoints drive the schedule the server actually offers
- **Mobile evidence:** GloboExpats_Mobile/lib/domain/delivery_windows.dart:25-49 - a fixed list of 6 composite windows built in code; grep for 'availability-windows' and 'working-schedule' in mobile returns zero matches
- **Mobile-side verification:** Zero matches for availability-windows/working-schedule; delivery_windows.dart builds fixed EAT composites in code
- **Frontend-side verification:** lib/api.ts:2809-2816 getAvailabilityWindows -> POST /api/v1/checkout/availability-windows with per-product items; :2788-2801 getSellerSchedule/saveSellerSchedule -> GET/PUT /api/v1/userManagement/working-schedule (+ /timezones :2803-2807). On web these server windows override the Today/Tomorrow fallback grid and are revalidated (inventory 8.7), so the cited range is accurate. Major is right: mobile's six hardcoded composites can propose slots the server never offered.

### 🟠 Major · missing — Transporter management surface is missing: create-registry-entry CRUD, manager assignment, vehicle photo and link-transporter endpoints reduced to two calls on mobile

**ID:** `api-surface:APISUR-10` · **Area:** Transporter management

**Impact:** Fleet operators cannot manage transporters, assign managers, upload vehicle photos or link transporters to orders from mobile - the whole transporter admin workflow is web-only.

- **Frontend evidence:** GloboExpats_Frontend/lib/api.ts:3554-3713 - transporter registry CRUD, manager add/remove, vehicle photo upload, and :3799-3807 - link transporter + trips endpoints
- **Mobile evidence:** GloboExpats_Mobile/lib/api/api_client.dart:969-981 - fetchTransporterRegistry (GET /transporters?active=true) and :986-994 - createTransporter are the only transporter calls; no update/delete/manager/photo/link methods exist
- **Mobile-side verification:** CRUD/manager/photo/link missing, but 4 calls exist: registry :975, create :988, assign :1003, order-transporter :1832, not two
- **Frontend-side verification:** lib/api.ts:3551-3576 registry list/create; :3581-3612 admin update/deactivate; :3653-3666 photo upload + delete; :3668-3716 manager add/remove (OWNER/MANAGER); :3799-3807 linkTransporterAccount -> POST /api/v1/admin/transporters/{id}/link; :3794-3795 getTransporterTrips -> GET /api/v1/transporter/trips. All cited surface exists. Major is right (entire transporter admin workflow is user-visible feature loss).

### 🟠 Major · divergent — Transporter assignment list is registry-wide instead of fail-closed per-scope, and the vehicle vocabulary/mode-mapping diverges (MOTORBIKE|TRICYCLE|CAR|MINI_TRUCK|SEMI_TRUCK vs web's MOTORBIKE/BAJAJI/GUTA/CAR/VAN/TRUCK/OTHER with delivery-mode matching)

**ID:** `api-surface:APISUR-11` · **Area:** Transporter assignment scope

**Impact:** A seller/admin on mobile sees and can assign transporters they do not manage (wrong party gets the job, no accountability), and vehicles typed BAJAJI/GUTA/VAN on web cannot be represented or matched on mobile.

- **Frontend evidence:** GloboExpats_Frontend/lib/transporter-scope.ts:13-17 - filterTransporterScope keeps only managedByCurrentUser + OWNER/MANAGER + active entries (fail-closed); lib/transporter-vehicles.ts - canonical vocabulary MOTORBIKE/BAJAJI/GUTA/CAR/VAN/TRUCK/OTHER plus delivery-mode-to-vehicle matching
- **Mobile evidence:** GloboExpats_Mobile/lib/widgets/assign_transporter_modal.dart:30,39-48 - fetches GET /transporters?active=true registry-wide with no ownership/manager filter; :9 - vehicle types hardcoded as MOTORBIKE|TRICYCLE|CAR|MINI_TRUCK|SEMI_TRUCK, a vocabulary the web never sends
- **Mobile-side verification:** Registry-wide unfiltered fetch real, but BAJAJI/GUTA vocab exists (delivery_fare.dart:16-39); divergence is only the modal list
- **Frontend-side verification:** lib/transporter-scope.ts:13-17 getSellerManagedTransporters fail-closed filter (active!==false && managedByCurrentUser===true && OWNER|MANAGER), plus :20-26 getAssignableTransporters(allowGlobalRegistry) for admins. lib/transporter-vehicles.ts:4-15 TRANSPORTER_VEHICLE_OPTIONS = MOTORBIKE/BAJAJI/GUTA/CAR/VAN/TRUCK/OTHER; :18-25 DELIVERY_MODE_TO_VEHICLE (MINI_TRUCK->VAN, SEMI_TRUCK->TRUCK); :44-61 largest-mode matching. Divergence claim and severity (wrong assignee, unrepresentable vehicle types) are right.

### 🟠 Major · divergent — Mobile shows the manual 'Mark Delivered' button on Logistics-v2 SELLER_DELIVERY orders where web deliberately hides it (delivery must be confirmed via buyer OTP)

**ID:** `api-surface:APISUR-12` · **Area:** Order actions / Mark Delivered gating

**Impact:** A seller can bypass the v2 OTP verification chain on mobile by force-marking delivery, desynchronizing order state from the transporter/buyer OTP flow and prematurely triggering escrow release conditions (money flow).

- **Frontend evidence:** GloboExpats_Frontend/app/orders/[id]/page.tsx:685-691 - canMarkFulfilled excludes v2 seller delivery: "!(LOGISTICS_V2_ENABLED && fulfillmentType === 'SELLER_DELIVERY')" so the Mark Delivered button (:887-898) is hidden
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:896-910 - mark-delivered action rendered unconditionally for selling orders in the allowed statuses, with no fulfillmentType/LOGISTICS_V2 exclusion
- **Mobile-side verification:** orders_screen.dart:896-910 gates only isSelling+status; no fulfillmentType exclusion; LOGISTICS_V2 absent from lib
- **Frontend-side verification:** app/orders/[id]/page.tsx:685-691 canMarkFulfilled includes the exact exclusion `!(LOGISTICS_V2_ENABLED && fulfillmentType === 'SELLER_DELIVERY')` with the comment that v2 delivery confirms via the buyer's code; the Mark Delivered/Mark Picked Up button at :887-898 is rendered only `canMarkFulfilled`. Web deliberately hides manual delivery-marking on v2 SELLER_DELIVERY. Major is right (state desync + premature escrow conditions on money flow).

### 🟠 Major · missing — Request-board client is a subset: my-requests, nudge lifecycle, fulfill-by-nudge and outside-visibility endpoints are absent on mobile

**ID:** `api-surface:APISUR-13` · **Area:** Request board API

**Impact:** Buyers cannot track or act on their own posted requests (nudge sellers, fulfill from a nudge) from mobile; the request loop dead-ends after posting.

- **Frontend evidence:** GloboExpats_Frontend/lib/request-board-api.ts:141,214,231,273,319,327,345,353,388,397-441 - full surface incl. my-requests listing, nudge send/list, fulfill-by-nudge, and outside-request visibility helpers
- **Mobile evidence:** GloboExpats_Mobile/lib/api/api_client.dart:1287-1405 - request-board methods cover only the board listing/detail and basic posting; grep for 'my-requests', 'nudge', 'fulfill-by-nudge' in mobile returns zero matches
- **Mobile-side verification:** Nudge send/list exist (api_client.dart:1354,1400; requests_screen.dart:448); only my-requests and fulfill-by-nudge are absent
- **Frontend-side verification:** lib/request-board-api.ts:141-155 fetchMyRequests (/my-requests), :214-224 fulfillRequestByNudge (with FULFILL_BY_NUDGE_UNAVAILABLE sentinel), :231-238 fulfillRequestOutside, :273-278 fetchFulfilledRequestDetail, :290-334 nudge/updateNudge/fetchMyNudge (404->null), :338-361 nudges list/mark-read/unread-count, :388-393 view analytics, :397-446 admin endpoints. Every cited line matches. Major is right (the request loop dead-ends after posting on mobile).

### 🟠 Major · missing — Platform commission settings endpoint is not fetched on mobile; rates are hardcoded defaults/local tables and computed fields are trusted by the backend

**ID:** `api-surface:APISUR-14` · **Area:** Platform commission settings

**Impact:** If the platform changes commission/VAT/selcom rates server-side, mobile keeps quoting stale hardcoded rates; totals sent for payment can disagree with web and with the backend's expected amounts (money flow).

- **Frontend evidence:** GloboExpats_Frontend/lib/api.ts:1402 - getPlatformCommissionSettings calls the /platform-commission-settings endpoint (with dedupeGet) so the UI always uses server-configured rates
- **Mobile evidence:** GloboExpats_Mobile/lib/domain/commission_calculator.dart:11-21 - defaults vatRate 0.18, selcomCommissionRate 0.02, selcomTransactionRate 0.02 hardcoded when the payload omits them, and :137-149 - a local category commission table (0.10 for 'food and groceries', 'furniture', etc.); no platform-settings call exists in api_client.dart
- **Mobile-side verification:** No platform-commission-settings endpoint in lib; commission_calculator.dart:11-21 hardcodes 0.18/0.02/0.02 defaults
- **Frontend-side verification:** lib/api.ts:1401-1407 getPlatformCommissionSettings fetches server-configured rates via dedupeGet (key 'platform-commission-settings'); exact URL is /api/v1/platform-settings/commission (claim's shorthand endpoint name is slightly off, behavior identical). It feeds reverse-commission fallbacks (usePlatformCommissionSettings, inventory 9.7). Major is right: server-changed VAT/selcom/category rates would make mobile quotes diverge on invoiced totals.

### 🟡 Minor · partial — Buyer rejected-payment recovery flow (buyer-payment-recovery) is not surfaced on the mobile order page

**ID:** `api-surface:APISUR-15` · **Area:** Rejected-payment recovery

**Impact:** Buyers whose payment was rejected must discover the My Payments screen themselves on mobile; web routes them to the fix directly on the order page.

- **Frontend evidence:** GloboExpats_Frontend/lib/buyer-payment-recovery.ts:38-45 - recovery logic computes the buyer's next step after a payment rejection and is wired into the order page
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:714-720 - order detail only shows the raw payment status with no recovery branch; the recovery UX exists solely in my_payments_screen.dart's re-upload path (:837-882)
- **Mobile-side verification:** Recovery ported only into my_payments_screen.dart:23,283 re-upload path; orders_screen has no recovery branch
- **Frontend-side verification:** lib/buyer-payment-recovery.ts:32-46 getBuyerPaymentRecoveryState with the claimed precedence (verified -> expired -> under_review via any SUBMITTED receipt -> rejected -> pending_payment); :48-51 rejection reasons. Wired into the order page: app/orders/[id]/page.tsx:88-92 imports, :289 findPaymentForOrder, :576 getBuyerPaymentRecoveryState drives the rejected-payment banner/'Upload new proof' path (also used in dashboard :121-124, :2069-2076). Minor is right — mobile still has the recovery UX in My Payments, so this is a discoverability/surfacing gap on the order page.

### 🟡 Minor · partial — Receipt upload on mobile is image-only (pickImage, contentType forced to image/png) while web accepts PDFs and a wider MIME list

**ID:** `api-surface:APISUR-16` · **Area:** Receipt upload

**Impact:** Users with PDF receipts cannot submit proof of payment on mobile, and non-PNG images are uploaded with a wrong content type, risking backend rejection of valid receipts (payment-proof flow).

- **Frontend evidence:** GloboExpats_Frontend/components/checkout/receipt-upload.tsx:18 - ALLOWED_MIME_TYPES includes application/pdf alongside images
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/my_payments_screen.dart:554-561 - only ImagePicker.pickImage is offered; lib/screens/checkout_screen.dart:534-536 - multipart part hardcodes contentType 'image/png' regardless of the actual file
- **Mobile-side verification:** Only pickImage (checkout:1255, my_payments:555); 'image/png' hardcoded checkout_screen.dart:536; no pdf/file_picker in lib
- **Frontend-side verification:** components/checkout/receipt-upload.tsx:18 ALLOWED_MIME_TYPES = image/jpeg, image/png, image/webp, application/pdf (comment: 'Accepts images and PDFs, max 5 files, 5MB each'), with client-side compression for both formats. Mobile image-only upload + hardcoded image/png content type is a real divergence. Minor is right (edge-case format support on the payment-proof flow).

### 🟡 Minor · divergent — FEATURED_MAX_PRICE diverges: web caps featured items at 200000, mobile caps at 500000

**ID:** `api-surface:APISUR-17` · **Area:** Featured listing price cap

**Impact:** The featured/shuffle shelf shows a different (more expensive) item set on mobile than on web for the same user and seed.

- **Frontend evidence:** GloboExpats_Frontend/lib/api.ts:82 - FEATURED_MAX_PRICE = 200000 used in the featured fetch
- **Mobile evidence:** GloboExpats_Mobile/lib/api/api_client.dart:134-145 - fetchDisplayShuffle hardcodes maxPrice '500000' in the query
- **Mobile-side verification:** api_client.dart:134,142 hardcode maxPrice 500000 (comment at :126 even asserts web parity at that value)
- **Frontend-side verification:** lib/api.ts:82 FEATURED_MAX_PRICE = 200000 (comment: mirrors backend app.featured.max-price), used at :1745-1764 getFeaturedListings seeded SHUFFLE path (`maxPrice: FEATURED_MAX_PRICE`). The divergence would change the featured/shuffle item set for the same seed. Minor is right.

### 🟡 Minor · divergent — Buyer-to-seller rating uses POST /orders/{id}/seller-rate on mobile instead of web's POST /rate-user with ratingType payload

**ID:** `api-surface:APISUR-18` · **Area:** Ratings / buyer rates seller

**Impact:** If the backend treats order-scoped seller-rate and user-scoped rate-user differently (aggregation, dedupe, counters), mobile ratings may not update the seller's public rating the way web ratings do.

- **Frontend evidence:** GloboExpats_Frontend/app/orders/[id]/page.tsx:209-218 - RATE_SELLER calls rateUser; lib/api.ts:2951-2967 - rateUser posts to /rate-user with an explicit ratingType field
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/orders_screen.dart:1012 - the rate-seller dialog submits via api 'seller-rate'; lib/api/api_client.dart:2094 - maps to POST /orders/{id}/seller-rate (the same path web's rateBuyer uses for the opposite direction)
- **Mobile-side verification:** orders_screen.dart:1012 submits seller-rate; user map api_client.dart:2094 posts /orders/{id}/seller-rate, not /rate-user
- **Frontend-side verification:** app/orders/[id]/page.tsx:209-218 RATE_SELLER -> apiClient.rateUser({targetUserId, rating, ratingType:'BUYER_TO_SELLER', orderId, reviewText}); lib/api.ts:2951-2967 rateUser POSTs /api/v1/rate-user with explicit ratingType + orderId params. Both cites exact. Minor is right: the divergence is real but the impact is conditional on backend aggregation semantics.

### 🟡 Minor · missing — Single-notification delete and bulk delete are absent on mobile (only read/read-all/delete-all)

**ID:** `api-surface:APISUR-19` · **Area:** Notifications management

**Impact:** Mobile users cannot clear individual or selected notifications - only wipe everything - which is destructive and discourages inbox management.

- **Frontend evidence:** GloboExpats_Frontend/lib/api.ts:3942,3948 - deleteNotification(id) and bulk delete endpoints on the user client
- **Mobile evidence:** GloboExpats_Mobile/lib/api/api_client.dart:1088-1112 - only markRead, markAllRead and deleteAll notification methods exist
- **Mobile-side verification:** Only read :1089, read-all :1098, delete-all :1107; no single or bulk delete notification method
- **Frontend-side verification:** lib/api.ts:3942-3946 deleteNotification -> DELETE /api/v1/notifications/{id}; :3948-3953 deleteNotifications(ids) -> DELETE /api/v1/notifications/bulk; both exposed in the notifications facade (:5104-5105). Web has single + bulk delete alongside delete-all (:3955-3959). Minor is right.

### 🟡 Minor · missing — No 90-day token expiry, clamped auto-logout timer, or expired-token restore validation on mobile - a stored token is restored unconditionally and lives forever

**ID:** `api-surface:APISUR-20` · **Area:** Session lifecycle

**Impact:** Mobile sessions never expire proactively: revoked/stale tokens are replayed until the first 401, and there is no 'session expired, please log in' messaging parity with web.

- **Frontend evidence:** GloboExpats_Frontend/lib/auth-service.ts:5-7,160-186 - TOKEN_EXPIRY_DAYS = 90 with setupAutoLogout (MAX_TIMEOUT_MS clamp :157) and authTokenExpired event; providers/auth-provider.tsx:531 - redirects to /login?expired=true
- **Mobile evidence:** GloboExpats_Mobile/lib/auth/auth_store.dart:43-47 - restore() reads the token from KvStore with no expiry check or validation call; :250-259 - only a reactive 401 triggers handleUnauthorized
- **Mobile-side verification:** No TOKEN_EXPIR/authTokenExpired/expiry identifiers anywhere in lib; restore unconditional, only reactive 401
- **Frontend-side verification:** lib/auth-service.ts:6-7 TOKEN_EXPIRY_DAYS=90 / TOKEN_EXPIRY_MS; :157 MAX_TIMEOUT_MS = 2_147_483_647 clamp (exact); :160-186 setupAutoLogout with rescheduling + clearAuthToken + authTokenExpired CustomEvent (:183); providers/auth-provider.tsx:531 `window.location.href = '/login?expired=true'` on protected paths (exact). Mobile-side claim (restore without expiry check, only reactive 401) is consistent with web being proactive. Minor is right.

### 🟡 Minor · missing — No client-side caching or fallback resilience on mobile: web's in-flight GET dedupe, 15s TTL caches, sessionStorage orders cache and seller-profile 6-endpoint fallback have no equivalents

**ID:** `api-surface:APISUR-21` · **Area:** Client resilience / caching

**Impact:** Mobile duplicates identical concurrent GETs (extra backend load, flapping UI) and loses web's tolerance for a degraded endpoint - a single failing fallback endpoint blanks the section instead of degrading gracefully.

- **Frontend evidence:** GloboExpats_Frontend/lib/api.ts:474-486 - dedupeGet collapses in-flight duplicate GETs; lib/contact-api.ts:4,38-53 - 15s TTL unread cache; lib/request-board-api.ts:15,64 - TTL cache; lib/api.ts:2563 - getSellerProfile fallback chain; app/expat/dashboard/page.tsx:985 - sessionStorage orders cache
- **Mobile evidence:** GloboExpats_Mobile/lib/api/api_client.dart:31-53 - every call is a fresh http request; grep shows no TTL cache, no dedupe map, no fallback chain anywhere in lib/
- **Mobile-side verification:** No dedupe/TTL/cache matches in lib; every call is a fresh http request
- **Frontend-side verification:** All cited frontend pieces verified: lib/api.ts:474-486 dedupeGet in-flight map; lib/contact-api.ts:4 CONTACT_CACHE_TTL_MS=15_000 with :38-60 TTL cache + in-flight dedupe; lib/request-board-api.ts:15 REQUEST_CACHE_TTL_MS=15_000 and :64-70 cachedGet; lib/api.ts:2563-2587 getSellerProfile 6-endpoint fallback chain; app/expat/dashboard/page.tsx:985-993 sessionStorage 'globoexpats-orders-cache-v1' stale-while-revalidate. Minor is right (resilience/load polish, no direct user-flow break).

### 🟡 Minor · missing — Legacy non-v2 checkout paths (direct createOrder and meet-seller flow) are absent on mobile, which is proforma-only

**ID:** `api-surface:APISUR-22` · **Area:** Legacy checkout path

**Impact:** If the backend still serves legacy checkout modes to web users, mobile users cannot use them at all; currently a coverage gap that only matters when those modes are enabled.

- **Frontend evidence:** GloboExpats_Frontend/lib/api.ts:3246 - createOrder on the user client and :4032-4036 - meet-seller endpoints backing the legacy/instant checkout modes
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/checkout_screen.dart:425-477 - checkout always creates a proforma; grep for 'createOrder' and 'meet-seller' in mobile lib/ returns zero matches
- **Mobile-side verification:** Zero matches for createOrder/meet-seller; checkout only POST /checkout/proforma (api_client.dart:530)
- **Frontend-side verification:** lib/api.ts:3246-3251 createOrder -> POST /api/v1/orders; :4032-4036 initiateMeetSeller -> POST /api/v1/checkout/meet-seller. Web retains legacy/instant checkout paths that mobile (proforma-only) lacks. Minor is right — impact only materializes if those legacy modes are enabled.

### 🟡 Minor · missing — Analytics surface is a subset (~8 read endpoints vs ~28) and the client event-tracking POST /api/analytics/event is absent on mobile

**ID:** `api-surface:APISUR-23` · **Area:** Analytics

**Impact:** Sellers see far fewer analytics cards on mobile and the platform receives no mobile client-side events, skewing analytics and hiding mobile behavior from the dashboard.

- **Frontend evidence:** GloboExpats_Frontend/lib/api.ts:4124-4545 - ~28 analytics endpoints; lib/analytics.ts:11,18 - trackEvent posting to /api/analytics/event (plus ge_anon_id bootstrap)
- **Mobile evidence:** GloboExpats_Mobile/lib/api/api_client.dart:1201-1284 - only 8 analytics read methods; grep for 'analytics/event' and 'ge_anon_id' in mobile returns zero matches, so no client events are ever sent (failures are also swallowed into blank cards)
- **Mobile-side verification:** Event POST truly absent, but ge_anon_id exists (api_client.dart:2247, request-board); the mo grep-zero claim is wrong
- **Frontend-side verification:** lib/api.ts:4122-4545 contains ~30 /api/analytics/* read/admin endpoints (claim's ~28 is in the right range), all failure-tolerant (isOptionalAnalyticsError :947). lib/analytics.ts:11 ANALYTICS_ENDPOINT='/api/analytics/event', POSTed at :18 — but the function is trackProductClick (not trackEvent), and the ge_anon_id bootstrap lives in lib/request-board-api.ts:28-47, not analytics.ts. Those two cite nits don't change the gap: web sends client events and exposes a large analytics surface mobile lacks. Minor is right.

### 🟡 Minor · missing — No background polling layer on mobile: web's 30s notification loop (7 aggregated calls incl. /orders/pending-actions-count), order-page 30s re-tick and review-step window pruning have no mobile equivalents

**ID:** `api-surface:APISUR-25` · **Area:** Background polling layer

**Impact:** Mobile users get stale badges and no push-style awareness of new orders/messages/payment events while the app is open; server-authoritative pending-action counts are replaced by a local guess that can drift from the backend.

- **Frontend evidence:** GloboExpats_Frontend/hooks/use-notifications.ts:25,89-141,179-181 - 30s interval aggregating 7 endpoints incl. GET /orders/pending-actions-count; app/orders/[id]/page.tsx:262 - 30s order re-tick; app/checkout/steps/review-step.tsx:198 - expired window pruning
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/shell.dart:92 - notifications refresh only on tab change (no timer); lib/domain/pending_actions.dart:208-210 - pendingOrderActionCount derived locally instead of calling /orders/pending-actions-count (grep: endpoint never called); grep for Timer.periodic in lib/screens shows only checkout countdowns
- **Mobile-side verification:** Only countdown/carousel tickers (my_payments:92, home:174, checkout:1794); no notification loop; pending-actions-count absent
- **Frontend-side verification:** hooks/use-notifications.ts:25 triggerNotificationRefresh; :88-96 fetchCounts aggregates exactly 7 calls (pending-actions count, unread count, getNotifications(0,100), getOrders, admin unread, nudge unread, contact unread); :123-129 totalPending sum; :179-183 30s setInterval. app/orders/[id]/page.tsx:261-264 30s setDeliveryStatusNow re-tick. review-step.tsx:197-200 30s clock with expired-window pruning at :202-217. All frontend evidence verified; minor is right (mobile still refreshes on tab change, so staleness not absence).

#### Refuted claims in this domain (1)

- ~~After signup, web auto-logs the user in from the register response while mobile routes to a separate login step~~ — mobile-side: register_screen.dart:173-174 auto-logins via store.login after register (web-parity comment) then pops; no separate login step

<details><summary><strong>Confirmed equivalent in both apps (22)</strong></summary>

- Proforma checkout: POST /api/v1/checkout/proforma, cancel-invoice, submit-payment (MOBILE_MONEY|BANK_TRANSFER) with grand-total mismatch guard (0.01 tolerance) that cancels and re-syncs the invoice - identical on both sides (FE checkout-content.tsx vs ME checkout_screen.dart:429-447)
- Receipt multipart contract parity: files field `receipts` + plain-text `details` JSON part, max 5 files, 5MB each (FE receipt-upload.tsx vs ME checkout_screen.dart:503-598 / my_payments_screen.dart:837-882)
- Delivery-quote flow: same endpoint, 20s watchdog timeout, and failure-reason surfacing on both sides (ME checkout_screen.dart:308)
- Delivery OTP verification: 400 INVALID_DELIVERY_CODE with attemptsRemaining parsing, 429 lockout handling, regenerate-delivery-code, and buyer self-confirm-delivery all implemented on mobile (ME delivery_dashboard_screens.dart:113-179,312; api_client.dart:2091-2107)
- Rental handoff: pickup/delivery code regenerate endpoints present on mobile (ME orders_screen.dart:452-472)
- Delivery fare tariff display parity (sellerGroups[].consolidatedDeliveryFee rendering)
- Commission arithmetic (VAT/selcom/categorical rounding) matches web's current server values; only the source (hardcoded vs endpoint) diverges
- Order status normalization CONFIRMED->COMPLETED and overdue grouping behave the same (ME pending_actions.dart local classifier mirrors FE status helpers)
- Admin payments review loop complete on mobile: queue, stats, verify, reject with {reasonCode, note}, confirm, bulk-approve, cancel-after-rejection, and receipt-file viewing (api_client.dart:2032-2056)
- GET /payments/my with tolerant content|items shape parsing, 48h correction-window deadline chain, and SUBMITTED-outranks-REJECTED precedence match web's recovery precedence (ME my_payments_screen.dart:284-293,319-325,798-830)
- Auth endpoints parity incl. signup, organization OTP verification, login, refresh, and the backend quirk of returning HTTP 200 with a 'Wrong OTP' body - handled identically
- OAuth: google auth-URL + code exchange with ACCOUNT_BLOCKED 403 handling; mobile additionally supports native Google ID-token sign-in
- Multipart contracts: post-product `product` JSON part, image batches capped at 5, PATCH editProfile `profileInformationDTO`, and the quantity-update PATCH workaround all replicated
- displayItem/filter accepting dual query+body forms incl. SHUFFLE sort with seed (ME api_client.dart:127-157)
- user-details fetch with WhatsApp-contact fallback chain; address CRUD incl. 404->null default-address tolerance
- Wishlist endpoints called without the /v1 prefix on both sides
- X-Anonymous-Id header sent on click/view tracking from both clients (mobile ge_anon_id bootstrap in KvStore)
- KvStore/localStorage key parity: expatCartItems_{userId}, proforma_cart_snapshot (written), lastOrderId, order_{id}
- Error taxonomy surfaced identically: INSUFFICIENT_STOCK, ACCOUNT_BLOCKED, PROFORMA_EXPIRED, CORRECTION_WINDOW_CLOSED, DISPATCH_TOO_EARLY mapped to user messages
- Production-complete endpoint (POST /orders/{id}/production-complete) present and wired for sellers on both sides
- Buyer-rating-seller direction parity: both sides POST /orders/{id}/seller-rate for buyer ratings (web rateBuyer == mobile 'seller-rate')
- Seller-gated cancel: buyer cancel requests route through the same seller-decision endpoints on both sides (ME orders_screen.dart:1029-1045)

</details>


## Notifications, pending actions & nudges in commerce flows

### 🔴 CRITICAL · missing — Nudge inbox / owner responses panel entirely absent; requester can never see who nudged

**ID:** `notif-pending:NOTIFP-01` · **Area:** Request nudges — owner inbox

**Impact:** The request-board loop is broken for requesters: they never learn who responded (responder names, product matches, service-offer contacts are never displayed), cannot review offers, and fulfill-by-nudge (web fulfillRequestByNudge) is impossible. Unread-nudge tracking (markNudgesRead, unreadNudgeCount, Requests-tab nudge summary cards) is absent, so nudges pile up invisible to the owner.

- **Frontend evidence:** components/request-board/nudge-inbox.tsx:19,88,106 - owner dialog 'Nudges for "{title}"' calls fetchNudgesForRequest + markNudgesRead; components/request-board/request-nudge-panel.tsx:112 - owner panel marks nudges read; components/request-board/request-card.tsx:347-351 - nudge count line with owner '({unreadNudgeCount} new)' opening NudgeInbox; app/request/[id]/page.tsx:717-736 - public Responses card with responder count
- **Mobile evidence:** lib/api/api_client.dart:1399-1400 - fetchRequestNudges (GET /request-board/{id}/nudges) implemented with ZERO UI consumers (grep shows no screen calls it); lib/screens/requests_screen.dart:439-464 - only nudge SENDING exists; no inbox/panel widget anywhere in lib/
- **Mobile-side verification:** lib-wide grep for 'nudge' (any case) hits only the SENDING path and the API def: lib/api/api_client.dart:1399-1400 defines fetchRequestNudges with zero callers (sole grep match is the declaration); lib/screens/requests_screen.dart:415-423 renders only the non-owner 'I can help (nudge)' FilledButton and :439-464 the _nudge() POST. No inbox dialog/panel, no 'Responses' card (grep 'Responses' empty in mobile), no unread-nudge count, no markNudgesRead anywhere. Requester never sees who nudged.
- **Frontend-side verification:** Frontend verified: nudge-inbox.tsx:19 imports fetchNudgesForRequest/markNudgesRead, :88 marks read, :106 dialog title 'Nudges for ...'; request-nudge-panel.tsx:106-118 fetches and markNudgesRead(requestId) at :112, with fulfillRequestByNudge at :174; request-card.tsx:323-331 opens NudgeInbox for owner when nudgeCount>0, :346-353 shows '{nudgeCount} nudge(s)' plus owner '({unreadNudgeCount} new)' in red, NudgeInbox rendered owner-only at :370-378; app/request/[id]/page.tsx:698-705 owner-only RequestNudgePanel and :710-748 public Responses card with count chip. The requester half of the nudge loop (contacts, matches, fulfill-by-nudge, unread tracking) is a core flow; critical stands.

### 🔴 CRITICAL · missing — Buyer cannot confirm or counter-propose a proposed delivery time; order stalls at AWAITING_BUYER_CONFIRMATION

**ID:** `notif-pending:NOTIFP-02` · **Area:** Delivery-time confirmation (buyer)

**Impact:** When a transporter proposes a delivery time, the mobile buyer has no way to accept it (which on web moves the order to IN_TRANSIT) or request another time. The order is stuck in AWAITING_BUYER_CONFIRMATION with only a non-interactive hint; the whole delivery-time negotiation flow is unreachable.

- **Frontend evidence:** components/transporter/delivery-time-confirmation.tsx:51,80,108 - 'Yes, I can receive it' calls apiClient.confirmDeliveryTime(orderId) (order moves to IN_TRANSIT), 'Request another time' calls proposeDeliveryTime; banner 'Can you receive this delivery?' rendered when trip.deliveryTimeStatus === 'PROPOSED'
- **Mobile evidence:** lib/screens/orders_screen.dart:807-1045 - order-detail Actions section has no AWAITING_BUYER_CONFIRMATION branch (buyer actions only for PICKED_UP/DELIVERED via _buyerActionable at :625-628); lib/domain/order_action_hint.dart:149 - AWAITING_BUYER_CONFIRMATION renders a hint label with no CTA; lib/api/api_client.dart:2042-2043 - 'delivery-time/confirm'/'delivery-time/propose' verbs mapped but no UI caller exists
- **Mobile-side verification:** Grep AWAITING_BUYER_CONFIRMATION|confirmDeliveryTime|proposeDeliveryTime|delivery-time across lib/: verbs are mapped at lib/api/api_client.dart:2042-2043 but every orderAction caller is orders_screen.dart:439,457 and delivery_dashboard_screens.dart:113,160,179 — none call delivery-time/*. Order detail Actions (orders_screen.dart:807-1045 read in full) has no AWAITING_BUYER_CONFIRMATION branch; the only surface is the non-interactive hint at lib/domain/order_action_hint.dart:149-152 ('The seller proposed a delivery time - confirm it works for you.'), plus a status label in models/order.dart:425. Order stalls with no CTA.
- **Frontend-side verification:** Frontend verified: delivery-time-confirmation.tsx:46 returns null unless trip.deliveryTimeStatus === 'PROPOSED'; :51 apiClient.confirmDeliveryTime(orderId) (doc :5-6 says confirm moves order to IN_TRANSIT), :80 proposeDeliveryTime with {proposedDeliveryTime, note}, :108 banner 'Can you receive this delivery?'. Blocks a core money-affecting delivery step; critical stands.

### 🔴 CRITICAL · missing — Seller 'Dispatch items' action has no button; dispatch only exists as an admin action

**ID:** `notif-pending:NOTIFP-03` · **Area:** Seller dispatch action

**Impact:** A mobile seller with a READY_FOR_DISPATCH/AWAITING_DISPATCH order is told when dispatch unlocks and why it is blocked, but has no button to actually dispatch the order — the delivery cannot proceed from the seller side on mobile.

- **Frontend evidence:** lib/order-status.ts:168,176 - seller READY_FOR_DISPATCH/AWAITING_DISPATCH yields CTA 'Dispatch items' (timing-locked vs ready); app/expat/dashboard/page.tsx:1459-1460 - DISPATCH_ORDER handler calls apiClient.dispatchOrder(orderId)
- **Mobile evidence:** lib/screens/orders_screen.dart:1066 - only 'Dispatch for delivery' is the ADMIN action (_adminAction('dispatch',...)); no user dispatch call anywhere (grep of lib/screens and lib/widgets finds no orderAction(..., 'dispatch')); lib/api/api_client.dart:2047 - 'dispatch': 'POST' mapped with zero UI callers; seller sees only the unlock banner (:935-956) and blocker list (:957-983)
- **Mobile-side verification:** 'dispatch' is mapped POST at lib/api/api_client.dart:2047 but its only caller is _adminAction('dispatch','Dispatch for delivery') at lib/screens/orders_screen.dart:1066, inside the widget.admin block (1054+). Read the full seller Actions section (orders_screen.dart:623-1053): for READY_FOR_DISPATCH/AWAITING_DISPATCH the seller gets only the unlock banner (:935-956), blocker list (:957-983) and hint label — no dispatch button. Grep of orderAction/_adminAction callers confirms no user-side dispatch.
- **Frontend-side verification:** Frontend verified: lib/order-status.ts:168 cta 'Dispatch items' for the timing-locked READY_FOR_DISPATCH/AWAITING_DISPATCH case and :176 cta 'Dispatch items' when ready; app/expat/dashboard/page.tsx:1459-1460 DISPATCH_ORDER -> apiClient.dispatchOrder(orderId). Seller dispatch is a core commerce step; critical stands.

### 🟠 Major · partial — Nudge reduced to a fixed one-liner: no service-offer form, no product-match picker, no message, no edit

**ID:** `notif-pending:NOTIFP-04` · **Area:** Request nudges — sending

**Impact:** Service requests can only receive a generic 'I can help with this!' with no provider name, service, area or contact — the requester gets no way to reach the offerer. Goods requests cannot attach a listing (nudgeType PRODUCT_MATCH + productId unsupported by any UI), cannot customize the note, and cannot update an existing response after an ALREADY_NUDGED 409 (web prefills and switches to edit).

- **Frontend evidence:** components/request-board/nudge-dialog.tsx:79,308,334,470 - REQUEST_NUDGE_MESSAGES presets, serviceOffer payload {providerName, serviceCategory, location, contact}, savePendingRequestNudgeIntent new-listing handoff, message maxLength 220; lib/request-board-api.ts:328,336-339 - GET my-nudge + PUT update nudge (edit mode)
- **Mobile evidence:** lib/api/api_client.dart:1354-1361 - nudgeRequest defaults message 'I can help with this!', nudgeType 'GENERAL'; lib/screens/requests_screen.dart:448 - _nudge() calls it with no arguments (no product, no service offer, no note); :455-457 - ALREADY_NUDGED only shows a SnackBar instead of switching to edit mode
- **Mobile-side verification:** lib/api/api_client.dart:1354-1361 hardcodes defaults message 'I can help with this!', nudgeType 'GENERAL'; lib/screens/requests_screen.dart:448 calls _api.nudgeRequest(token, _id) with no arguments. No nudge dialog exists (grep 'nudge' shows no dialog/serviceOffer/product picker), ALREADY_NUDGED at :455-457 only shows a SnackBar (no edit-mode switch), and no GET my-nudge/PUT update-nudge API exists in api_client.dart at all.
- **Frontend-side verification:** Frontend verified: nudge-dialog.tsx:79-84 REQUEST_NUDGE_MESSAGES presets; :305-314 SERVICE_OFFER payload {message, serviceOffer:{providerName, serviceCategory, location, contact}}; :334-348 savePendingRequestNudgeIntent + router.push('/sell?requestNudge=1'); :470 maxLength={220}; :267-276 ALREADY_NUDGED -> fetchMyNudge + prefill + edit mode. One citation drift: PUT update nudge is lib/request-board-api.ts:318-321 (updateNudgeRequest -> sendNudge 'PUT') and GET my-nudge at :327-334; cited 336-339 is the viewing-endpoints section header. Behavior fully real; major stands.

### 🟠 Major · divergent — Nudge/offer gating weaker: no redirect to login and no seller-verification (canSell) gate

**ID:** `notif-pending:NOTIFP-05` · **Area:** Request nudges — gating

**Impact:** Business-rule divergence: on web only registered, sell-verified users can respond to requests (unverified users are redirected to verification); on mobile any authenticated account can nudge, and guests are not taken to login (they are just shown a toast), so the verification funnel and guest conversion step are lost.

- **Frontend evidence:** components/request-board/request-feed.tsx:319 - guests get REQUEST_REGISTRATION_TOAST and are blocked; :335-346 - 'Verification Required' toast + redirect to /account/verification when !canSell (also applied to nudge entry points per request-detail handlers)
- **Mobile evidence:** lib/screens/requests_screen.dart:442-444 - logged-out tap only shows SnackBar 'Log in to nudge the requester.' with no navigation to /login; :447-448 - any logged-in user nudges; no canSell/verificationStatus check exists anywhere in lib/screens/requests_screen.dart
- **Mobile-side verification:** lib/screens/requests_screen.dart:442-444: logged-out tap shows SnackBar 'Log in to nudge the requester.' and returns — no context.push('/login'). Grep canSell|verificationStatus|sellVerified across lib hits only an unrelated doc comment (lib/screens/verification_hub_screen.dart:13); requests_screen.dart has no sell-verification gate — any authenticated user reaches the POST at :448.
- **Frontend-side verification:** Frontend verified: request-feed.tsx:318-320 requireAuth -> toast(REQUEST_REGISTRATION_TOAST); :333-339 requireVerification -> 'Verification Required' toast + router.push('/account/verification'); :346-349 canSell gate in handleNewRequest, repeated for ?new=1 at :363-371. Same gates on request detail: app/request/[id]/page.tsx:263-269 (handleNudge) and :298-304 (handleOpenNudge). Major stands.

### 🟠 Major · missing — Auto-nudge of a request after publishing a listing is missing

**ID:** `notif-pending:NOTIFP-06` · **Area:** Sell flow auto-nudge

**Impact:** The web's 'nudge with a new listing' funnel (offer -> publish -> auto-attach listing to the request -> return to the request) does not exist on mobile; a seller who started from a request must manually find it again, and the returned-to-request redirect is lost.

- **Frontend evidence:** app/sell/page.tsx:751,1118 - after publish, getPendingRequestNudgeIntent() is read and nudgeRequest(requestId, {nudgeType, productId}) auto-sends, then redirects to /request/{id}; components/request-board/nudge-dialog.tsx:334 - intent saved before routing to /sell?requestNudge=1
- **Mobile evidence:** grep of lib/screens (incl. lib/screens/sell_screen.dart) finds no requestNudge / pending_request_nudge / nudge references — the sell screen has no intent handoff and no post-publish nudge call
- **Mobile-side verification:** Grep requestNudge|pendingRequestNudge|pending_request|nudgeIntent|getPendingRequest across lib matches only the unrelated fetchRequestNudges declaration (api_client.dart:1399). lib/screens/sell/sell_wizard_screen.dart and sell_screen.dart contain no nudge references and no post-publish nudgeRequest call — the publish flow never reads or writes a pending nudge intent.
- **Frontend-side verification:** Frontend verified: app/sell/page.tsx:751 getPendingRequestNudgeIntent(); :1116-1142 auto-sends nudgeRequest(requestId, {message, nudgeType || 'PRODUCT_MATCH', productId}), clearPendingRequestNudgeIntent, redirect returnTo || /request/{id}, 'Nudge sent' toast; failure path :1131-1141 (intent cleared, destructive 'Listing posted, nudge not sent' toast, listing stays live). nudge-dialog.tsx:334-348 saves the intent before routing. Major stands.

### 🟠 Major · missing — Global pinned pending-actions banner (urgent task alert with per-kind CTA) missing

**ID:** `notif-pending:NOTIFP-07` · **Area:** Pending-actions banner

**Impact:** The web's always-visible 'you have N urgent tasks' surface with one-tap deep links (review payments, update payment, confirm received, continue payment...) is absent on mobile; the classifier output is reduced to an integer badge, so urgent money/delivery tasks surface only if the user happens to open the right screen.

- **Frontend evidence:** components/pending-actions-banner.tsx:139 - only alerts[0] renders; :35,:45 - KIND_ICON/KIND_CTA maps for the 7 alert kinds (admin_payment_review, buyer_payment_rejected, seller_fulfillment, buyer_confirm_receipt, buyer_confirm_delivery_time/delivery, buyer_payment_unfinished); :33 - POLL_INTERVAL_MS = 60_000 refetch
- **Mobile evidence:** lib/domain/pending_actions.dart:47,208-210 - getOrderNotificationAction/pendingOrderActionCount exist but their ONLY consumer is the badge: lib/widgets/globo_app_bar.dart:77; no banner/alert list widget is built from it anywhere in lib/
- **Mobile-side verification:** Grep pendingOrderActionCount|getOrderNotificationAction|pending_actions: consumers are only the definitions (lib/domain/pending_actions.dart:47,208-210) and lib/widgets/globo_app_bar.dart:77 (badge sum). Grep urgent|task|banner surfaces nothing global — no pending-actions banner/alert widget exists anywhere in lib/; the 16-verb classifier output is reduced to the integer badge.
- **Frontend-side verification:** Frontend verified: pending-actions-banner.tsx:33 POLL_INTERVAL_MS = 60_000; :35-43 KIND_ICON and :45-53 KIND_CTA maps for exactly the 7 kinds listed; :139 `const alert = alerts[0]` with '+N more task(s)' at :158-162; CTA Link to alert.href at :183-188; urgent amber vs blue palette :147-151. Major stands.

### 🟠 Major · partial — No 'Take action' buttons, no Dismiss (single/shown), no actionable-order cards on the notifications screen

**ID:** `notif-pending:NOTIFP-08` · **Area:** Notifications page — per-item actions

**Impact:** Mobile notifications are read-and-deep-link only: the user cannot act inline per kind (e.g. jump straight into the completed-orders filter for confirm-receipt), cannot dismiss noisy cards for the session, and the web's derived actionable-order cards (orders needing action, listed even without a notification row) have no mobile equivalent.

- **Frontend evidence:** app/notifications/page.tsx:675 - per-card 'Take action' (getOrderActionDashboardUrl, marks read then navigates); :692-695 - per-card 'Dismiss'; :568 - toolbar 'Dismiss shown actions'; :151,:246,:332-335 - dismissedActionKeys session dismissal filter; actionable-order cards unified with notifications (keys order:{id}/notification:{id})
- **Mobile evidence:** lib/screens/account_misc_screens.dart:105-125,293 - a row's only interaction is _open(): mark-read then GoRouter.go to a derived URL (lib/domain/notification_feed.dart:230) or reload; no per-card action button, no dismissal state, no actionable-order card list exists
- **Mobile-side verification:** Notification rows have exactly one interaction: onTap -> _open(n, target) (lib/screens/account_misc_screens.dart:293), which mark-reads then GoRouter.go/refresh (:105-125). Grep 'Take action' returns nothing; grep 'dismiss' in lib only hits unrelated auth/image-picker comments — no dismissal state, no 'Dismiss shown', no actionable-order card list; _visible (:130-143) filters only tab/action/search.
- **Frontend-side verification:** Frontend verified: app/notifications/page.tsx:675 'Take action' via getOrderActionDashboardUrl with markRead on click (:669-673); :686-696 per-card Dismiss; :561-573 toolbar 'Dismiss shown actions' (aria-label :568, handler dismissShownActions :334-340); :151 dismissedActionKeys state and :246 dismissal filter; unified dedupe keys order:{id}/notification:{id} at :294-319. Major stands.

### 🟠 Major · missing — Admin tab and admin notifications section (filters, pagination, bulk delete) missing

**ID:** `notif-pending:NOTIFP-09` · **Area:** Admin notifications

**Impact:** Admins on mobile have no admin notification feed at all — no admin unread badge contribution, no review-overdue/payment-review surfacing, no per-type links into admin dashboard tabs. The only admin inbox is contact messages (admin_sublist_screens.dart), which reads /contact/all instead.

- **Frontend evidence:** app/notifications/page.tsx:146 - default tab isAdmin ? 'admin' : 'all'; :463 - AdminNotificationsSection rendered; components/admin-notifications.tsx:1.4.2-1.4.8 - read-state/user/action/timeline filters, 8/page server pagination, mark-read, bulk delete, delete-all with confirm
- **Mobile evidence:** lib/screens/account_misc_screens.dart:217,266-271 - NotificationTab enum has exactly all/buying/selling/requests (no admin or messages tab); lib/api/api_client.dart:665 - adminNotifications() (GET /api/v1/admin/notifications) implemented with zero callers
- **Mobile-side verification:** lib/domain/notification_feed.dart:11 enum NotificationTab { all, buying, selling, requests } — exactly 4 values, rendered at account_misc_screens.dart:217/266-271. lib/api/api_client.dart:665 adminNotifications() has zero callers (sole grep match is the declaration); admin_dashboard.dart contains no notification/nudge references; the only admin inbox is contact messages (admin_sublist_screens.dart reading /contact/all at :150).
- **Frontend-side verification:** Frontend verified: app/notifications/page.tsx:146 default tab `isAdmin ? 'admin' : 'all'`; :461-465 renders AdminNotificationsSection (admin-only). admin-notifications.tsx: ITEMS_PER_PAGE 8 (:210) with hasMore heuristic (:241), 300ms user-search debounce (:219), timeline filter (:204,:480), unreadOnly (:232), Mark all read (:358), Delete shown (:369), Delete-all AlertDialog (:373-395), per-item Delete (:641-644). Major stands.

### 🟠 Major · partial — Badge counts fewer sources: no nudge-unread, contact-unread or admin-unread halves

**ID:** `notif-pending:NOTIFP-10` · **Area:** Unread badge composition

**Impact:** The mobile bell undercounts: unread request nudges and admin/contact messages never contribute to the badge, so users get no signal that a requester responded or that admin messages arrived — directly compounding the missing nudge inbox (NOTIFP-01).

- **Frontend evidence:** hooks/use-notifications.ts:123-129 - totalPending = buyingPending + sellingPending + standaloneUserUnread + adminUnread + nudgeUnread + contactUnread (7 parallel sources, refreshed on event + 30s); app/notifications/page.tsx:330 - pendingCount = unifiedCounts.all + nudgeUnread + contactUnread drives per-tab badges
- **Mobile evidence:** lib/widgets/globo_app_bar.dart:74-82 - badge = fetchUnreadNotificationCount(token) + pendingOrderActionCount(fetchOrders()) only; fetchContactUnreadCount (lib/api/api_client.dart:1019) is used solely inside AdminMessagesScreen (:150), and no unread-nudge-count request exists at all
- **Mobile-side verification:** lib/widgets/globo_app_bar.dart:74-82 (read in full): badge = fetchUnreadNotificationCount(token) + pendingOrderActionCount(fetchOrders()) with a swallow-on-failure fallback — nothing else. fetchContactUnreadCount (api_client.dart:1019) is used only at admin_sublist_screens.dart:150; no unread-nudge-count request exists anywhere in the repo.
- **Frontend-side verification:** Frontend verified: use-notifications.ts:80-96 seven parallel sources (getPendingActionsCount, unread-count, notifications, orders, adminUnread, nudgeUnread, contactUnread); :123-129 totalPending sum exactly as claimed; refresh event listener :169-173 and 30s poll :176-184. app/notifications/page.tsx:330 pendingCount = unifiedCounts.all + nudgeUnread + contactUnread driving the All Actions badge (:414-415). Major stands.

### 🟠 Major · partial — Feed hard-capped at 20 rows with no pagination; older notifications unreachable

**ID:** `notif-pending:NOTIFP-11` · **Area:** Notifications pagination

**Impact:** Any user with more than 20 notifications can never see items 21+ on mobile: no load-more, no page controls. Combined with mark-all-read/delete-all being the only bulk tools, older unread actionable notifications become permanently invisible in the list.

- **Frontend evidence:** app/notifications/page.tsx:154,:267-270 - ITEMS_PER_PAGE = 8 with Previous/Next 'Page X of Y' over the fetched page (notifications fetched size 30); user notifications + counts fetched with pagination
- **Mobile evidence:** lib/api/api_client.dart:1063-1064 - fetchNotifications default page=0, size=20; lib/screens/account_misc_screens.dart:44 - single _load() call, FutureBuilder list with no pagination/infinite-scroll UI (:160-204)
- **Mobile-side verification:** lib/api/api_client.dart:1063-1064 fetchNotifications defaults page=0,size=20; its sole caller is lib/screens/account_misc_screens.dart:44 (`return _api.fetchNotifications(token);`). The list is a single FutureBuilder ListView.separated (:196-201) with no ScrollController/load-more/page controls; the only refresh paths are pull-to-refresh and post-mutation reloads.
- **Frontend-side verification:** Frontend verified: app/notifications/page.tsx:154 ITEMS_PER_PAGE = 8; :267-270 totalPages/paginatedActions slice over the fetched page; :710-734 Previous/Next with 'Page {currentPage} of {totalPages}'. User notifications fetched with size 30 (user-notifications-section.tsx:33 getNotifications(0, 30)). Major stands.

### 🟠 Major · divergent — Escrow-releasing 'I received the items' fires immediately with no confirmation dialog

**ID:** `notif-pending:NOTIFP-12` · **Area:** Buyer confirm-delivery guard

**Impact:** A mis-tap on mobile releases escrow to the seller with zero friction; the web's explicit irreversible-action warning (money-affecting guard) is gone. After confirmation mobile also does not chain into the Confirm Received / rating modal the way web does.

- **Frontend evidence:** components/orders/delivery-code-card.tsx:126 - confirmDeliveredByBuyer invoked from an AlertDialog 'Confirm you received your items' whose copy (:155) warns it 'releases payment to the seller. Only confirm once you actually have your items in hand.'
- **Mobile evidence:** lib/screens/delivery_dashboard_screens.dart:177-188 - _buyerConfirmDelivery POSTs confirm-delivery directly; :413-419 - the card's 'I received the items' FilledButton calls onConfirm with no intervening dialog
- **Mobile-side verification:** lib/screens/delivery_dashboard_screens.dart:177-188 _buyerConfirmDelivery POSTs 'confirm-delivery' immediately; the card wires onConfirm: _buyerConfirmDelivery (:268) and the button at :413-419 ('I received the items', key buyer-confirm-delivery-btn) calls it directly. Grep showDialog|AlertDialog in the file finds no confirm dialog for this action — no escrow-warning friction, and success only paints a message (:181-183), no chaining into a rating modal.
- **Frontend-side verification:** Frontend verified, with a location clarification: the AlertDialog 'Confirm you received your items' lives in app/expat/dashboard/page.tsx:4482-4506 (copy :4489-4492 includes 'releases payment to the seller. Only confirm once you actually have your items in hand.'), opened from the buyer card 'I received the items' button (:2426-2432) whose handler :1396-1416 calls confirmDeliveredByBuyer (:1401) then chains into the CONFIRM_RECEIPT modal (:1405). delivery-code-card.tsx:126 is a second, direct confirmDeliveredByBuyer call inside the buyer code card (button :188-198) with the release warning copy at :154-155. The described escrow-release guard exists in substance; major stands.

### 🟠 Major · BROKEN — 'Order' button on payment cards is broken: Navigator.pushNamed throws under GoRouter

**ID:** `notif-pending:NOTIFP-13` · **Area:** My Payments — order navigation

**Impact:** Tapping 'Order' on a pending/verified/rejected payment card throws instead of opening the order, so buyers cannot reach the order behind an invoice from My Payments on mobile (web works).

- **Frontend evidence:** components/dashboard/my-payments-panel.tsx (2.6.1) - non-resumable rows show 'Order' navigating to /orders/{orderIds[0]}
- **Mobile evidence:** lib/screens/my_payments_screen.dart:667 - Navigator.of(context).pushNamed('/orders/${payment.orderIds.first}'); the codebase itself documents this fails: lib/screens/checkout_screen.dart:1689 - 'GoRouter owns these paths and MaterialApp has no routes map, so Navigator.pushNamed threw instead of navigating'; lib/app_router.dart registers no route names (grep 'name:' finds none)
- **Mobile-side verification:** lib/screens/my_payments_screen.dart:667 uses Navigator.of(context).pushNamed('/orders/${payment.orderIds.first}'). main.dart:57-61 is MaterialApp.router(routerConfig: router) with no routes map, and the codebase itself documents the failure mode at lib/screens/checkout_screen.dart:1688-1690 ('GoRouter owns these paths and MaterialApp has no routes map, so Navigator.pushNamed threw instead of navigating') — checkout was fixed to use context.push but My Payments still uses pushNamed.
- **Frontend-side verification:** Frontend verified: my-payments-panel.tsx:388-396 - non-resumable rows render an 'Order' Link to `/orders/${payment.orderIds[0]}` (vs 'Continue payment' -> /checkout?proforma= for resumable rows at :372-387). Web behavior real; mobile breakage severity major stands.

### 🟠 Major · missing — No push, FCM or local notifications — the 'Alert me' desktop-alert channel has no mobile counterpart

**ID:** `notif-pending:NOTIFP-14` · **Area:** Push / desktop notifications

**Impact:** Mobile is pull-only: a buyer or seller learns about a payment rejection, delivery window or nudge only when they happen to open the app and navigate. On a phone the OS-notification channel is the primary expected surface for these urgent commerce tasks; it is entirely absent.

- **Frontend evidence:** components/pending-actions-banner.tsx:137,179 - useDesktopAlerts(alerts) with 'Alert me' enable button; hooks/use-desktop-alerts.ts:49,59 - Notification.permission-gated desktop alerts with seen-id persistence and visibility gating
- **Mobile evidence:** pubspec.yaml - grep for firebase/fcm/notification returns nothing (no firebase_messaging, no flutter_local_notifications); lib/widgets/globo_app_bar.dart:19-22 - 'Deliberately no periodic poll... fetched on mount and re-fetched when the shell changes tab'
- **Mobile-side verification:** Grep firebase|fcm|messaging|notification|push in pubspec.yaml returns zero matches; grep firebase|flutter_local_notifications|awesome_notifications across lib returns nothing. The only Timer.periodic in the domain is the countdown ticker (my_payments_screen.dart:92), not a notifier. lib/widgets/globo_app_bar.dart:19-22 doc comment confirms pull-only design. No OS-notification channel of any kind.
- **Frontend-side verification:** Frontend verified: pending-actions-banner.tsx:137 useDesktopAlerts(alerts); 'Alert me' ghost button :169-181 (label text :179, aria-label :176); use-desktop-alerts.ts:49 hook, :59 Notification.permission read, gesture-gated enable() :68-84, visibility-gated firing :109-111, localStorage seen-id persistence :22-38. Major stands.

### 🟡 Minor · divergent — No 30s polling and no global refresh event; badge only updates on tab change

**ID:** `notif-pending:NOTIFP-15` · **Area:** Badge / list freshness

**Impact:** After acting on an order (e.g. confirming receipt), the mobile bell keeps showing the stale count until the user switches tabs; web refreshes instantly via the event and keeps counts fresh every 30s while the app is open.

- **Frontend evidence:** hooks/use-notifications.ts:19,:171,:179-181 - NOTIFICATION_REFRESH_EVENT 'globoexpats:notifications:refresh' dispatched on every read/success, listened to, plus setInterval(...,30000) poll while logged in
- **Mobile evidence:** lib/widgets/globo_app_bar.dart:19-22,53 - doc comment states the 30s poll was deliberately dropped; refreshSignal listener fires only on shell tab change; :82 badge otherwise static
- **Mobile-side verification:** lib/widgets/globo_app_bar.dart:19-22 doc comment states the 30s poll was deliberately dropped; refreshSignal is a ValueListenable bumped only by shell.dart:69/81 (tab change / shell init) and listened at globo_app_bar.dart:53. No global refresh event and no timer exist (grep Timer.periodic across lib shows only the payments countdown ticker).
- **Frontend-side verification:** Frontend verified: use-notifications.ts:19 NOTIFICATION_REFRESH_EVENT = 'globoexpats:notifications:refresh'; :169-173 event listener refetches counts; :176-184 setInterval(..., 30000) while logged in. Minor stands.

### 🟡 Minor · partial — Per-item delete and bulk ('delete shown') missing — only mark-all and delete-all exist

**ID:** `notif-pending:NOTIFP-16` · **Area:** Notification deletion

**Impact:** A user cannot clear a single irrelevant or sensitive notification, nor a selected subset; the only options are marking everything read or wiping the entire history.

- **Frontend evidence:** lib/api.ts:9.1.5-9.1.7 - DELETE /notifications/{id}, DELETE /notifications/bulk {ids}, DELETE /notifications/delete-all; components/admin-notifications.tsx 1.4.4 - 'Delete shown' bulk ids and per-item Delete
- **Mobile evidence:** lib/api/api_client.dart:1106-1112 - only deleteAllNotifications implemented; lib/screens/account_misc_screens.dart:74-100,:148-158 - AppBar offers only 'Mark all read' and 'Delete all'
- **Mobile-side verification:** lib/api/api_client.dart:1088-1112 implements only markNotificationRead, markAllNotificationsRead and deleteAllNotifications (delete-all) — no DELETE /notifications/{id} and no bulk-ids endpoint. The AppBar (account_misc_screens.dart:148-159) offers exactly 'Mark all read' and 'Delete all'; no per-row delete/dismiss control exists.
- **Frontend-side verification:** Frontend verified: lib/api.ts:3942 deleteNotification, :3948-3950 DELETE /api/v1/notifications/bulk, :3955-3957 delete-all; admin UI has 'Delete shown' (admin-notifications.tsx:369), per-item Delete (:641-644) and Delete-all with confirm (:373-395). Minor stands.

### 🟡 Minor · missing — 'View receipts (N)' preview missing; only a receipt count is shown

**ID:** `notif-pending:NOTIFP-17` · **Area:** My Payments — receipts viewer

**Impact:** Buyers cannot re-open or verify which proof they submitted for a proforma (useful when GloboExpats asks about a specific receipt); they only see how many were uploaded.

- **Frontend evidence:** components/dashboard/my-payments-panel.tsx:481,:492 - collapsible 'View receipts ({payment.receipts!.length})' rendering AuthenticatedReceiptPreview per receipt
- **Mobile evidence:** lib/screens/my_payments_screen.dart:634-637 - meta line shows only "N receipt(s)" text; no receipt list, thumbnail or preview widget exists in the payment card
- **Mobile-side verification:** lib/screens/my_payments_screen.dart:635-636 renders only '${payment.receipts.length} receipt(s)' inside the meta line; the receipts list (:278-334) is used solely for grouping precedence, rejected-receipt reasons and the correction deadline — no preview/thumbnail/viewer widget anywhere in the payment card.
- **Frontend-side verification:** Frontend verified: my-payments-panel.tsx:478-498 collapsible <details> with summary 'View receipts ({payment.receipts!.length})' at :481 and AuthenticatedReceiptPreview per receipt at :492-494. Minor stands.

### 🟡 Minor · partial — Re-upload reduced to a single camera-roll image: no PDF, no multi-file, no 5MB client validation

**ID:** `notif-pending:NOTIFP-18` · **Area:** Rejected-proof re-upload

**Impact:** Buyers with a PDF bank receipt, or needing to send several proof images as web allows, cannot complete the correction step the same way; oversized images are silently sent rather than rejected with the web's clear limit message (backend may then refuse).

- **Frontend evidence:** lib/api.ts:3433 - uploadPaymentReceipts enforces 'Receipt N (name) exceeds 5MB limit' client-side; web ReceiptUpload accepts up to 5 files of JPEG/PNG/WebP/PDF (3.5.1)
- **Mobile evidence:** lib/screens/my_payments_screen.dart:555-567 - ImagePicker().pickImage(source: gallery, single pick, no size check); lib/screens/my_payments_screen.dart:852-853 - exactly one 'receipts' part added (no multi-file loop)
- **Mobile-side verification:** lib/screens/my_payments_screen.dart:549-572 _pickAndSend uses a single ImagePicker().pickImage(source: gallery, maxWidth:1600, quality:80) with only an empty-bytes check — no 5MB validation, no PDF, no multi-pick; :852 adds exactly one 'receipts' MultipartFile. The file's own comment (:550-551) acknowledges the web accepts 'JPEG/PNG/WebP/PDF up to 5 files x 5MB'.
- **Frontend-side verification:** Frontend verified: lib/api.ts:3419-3433 uploadPaymentReceipts throws `Receipt ${index+1} (${file.name}) exceeds 5MB limit` client-side; components/checkout/receipt-upload.tsx:16-18 MAX_FILES=5 and JPEG/PNG/WebP/PDF allowlist, :127-133 5MB check, multiple file input :148-160. Minor stands.

### 🟡 Minor · partial — Availability gate simplified: no per-item checkboxes, no 'Order paid / Seller receives' payout summary

**ID:** `notif-pending:NOTIFP-19` · **Area:** Seller availability gate

**Impact:** The seller can confirm availability without reviewing each line item, and never sees the escrowed amount vs payout framing web shows; for multi-item orders the deliberate per-item acknowledgment safeguard is gone.

- **Frontend evidence:** components/orders/seller-availability-gate.tsx:182 - per-item Checkbox list; :215 - 'You receive: {payout}'; :233 - 'Order paid: {amountPaid}'; :250 - 'Confirm all checked items' disabled until every item checked
- **Mobile evidence:** lib/screens/orders_screen.dart:826-863 - a single amber banner plus immediate 'Confirm availability' / "Can't fulfil" buttons; no item list, no checkbox gating, no money summary
- **Mobile-side verification:** lib/screens/orders_screen.dart:826-863: the AWAITING_SELLER_CONFIRMATION gate is one amber banner + 'Confirm availability' / "Can't fulfil" buttons. No item list or checkbox gating (the only 'You receive' matches in lib are the unrelated sell wizard / edit-listing price fields), no 'Order paid'/payout summary.
- **Frontend-side verification:** Frontend verified: seller-availability-gate.tsx:170-231 per-item rows with Checkbox (:182-194), 'required: N . Buyer paid:' :209-211, 'You receive: {payout}' :213-217; :232-235 'Order paid: / Seller receives:' summary; :240-251 'Confirm all checked items' disabled until allItemsChecked. Minor stands.

### 🟡 Minor · divergent — Low-rating review requirement missing: review is always optional and submit never blocked

**ID:** `notif-pending:NOTIFP-20` · **Area:** Rating validation

**Impact:** A 1-2 star confirmation/review can be submitted with no explanatory comment on mobile, so sellers receive low ratings with zero context that web would have forced.

- **Frontend evidence:** components/order-action-modal.tsx:203,:208-210,:228 - confirm disabled when rating <= 2 && review empty; error 'Please provide a review for ratings below 3 stars.' with rose border
- **Mobile evidence:** lib/screens/orders_screen.dart:500-506 - rating dialog review TextField labelled 'Review (optional)' with no conditional requirement; :523-526 - body sent regardless of rating value; no disable logic on Submit
- **Mobile-side verification:** lib/screens/orders_screen.dart:476-527: rating dialog has stars + a TextField labelled 'Review (optional)' (:500-506); Submit (:513-515) is never disabled and the body (:523-525) sends {rating, comment|reviewText} regardless of rating value. Notably the same file DOES enforce a required reason in the decline dialog (:568-573), so the missing low-rating rule is a real divergence, not a global policy.
- **Frontend-side verification:** Frontend verified: order-action-modal.tsx:192-196 review becomes required (asterisk) for rating <= 2; :202-206 rose border; :208-212 'Please provide a review for ratings below 3 stars.'; :223-229 Confirm disabled when rating === 0 || (rating <= 2 && !review.trim()). Minor stands.

### 🟡 Minor · partial — No payment countdown and no 'Pay now' action on order cards/detail for AWAITING_PAYMENT

**ID:** `notif-pending:NOTIFP-21` · **Area:** Buyer payment urgency on orders

**Impact:** The 60-minute pay-or-lose urgency nudge is invisible on the order surfaces where web shows it; a buyer who goes straight to Orders sees 'Pay now' as plain text with nothing to tap and no ticking clock, and must know to find My Payments instead.

- **Frontend evidence:** components/dashboard (2.5.9) - PaymentCountdown card rendered for PENDING/AWAITING_PAYMENT orders; lib/pending-action-alerts.ts 6.1.1 - buyer AWAITING_PAYMENT -> PAYMENT_REQUIRED 'Pay now' CTA deep-linking to checkout; banner kind buyer_payment_unfinished -> /checkout?proforma={id}
- **Mobile evidence:** lib/screens/orders_screen.dart - no countdown widget and no payment/checkout action in the buyer card or detail Actions (only hint text via lib/domain/order_action_hint.dart buyer AWAITING_PAYMENT branch); countdown exists only in my_payments_screen.dart:677-699 and checkout
- **Mobile-side verification:** Grep Countdown|Pay now|checkout|proforma in orders_screen.dart matches only comments (:589, :1032) — no countdown widget, no checkout deep link, no Pay now button on card or detail (read the full Actions section, 590-1053). The buyer AWAITING_PAYMENT surface is the hint label only (order_action_hint.dart). Countdowns exist only on My Payments (my_payments_screen.dart:677-699) and checkout, as the claim states.
- **Frontend-side verification:** Frontend verified: PaymentCountdown renders on buyer order cards for PENDING/AWAITING_PAYMENT with paymentDeadline (app/expat/dashboard/page.tsx:2357-2365); buyer AWAITING_PAYMENT -> PAYMENT_REQUIRED with actionLabel 'Pay now' (lib/order-notification-actions.ts:84-92). One precision note: the notifications-page card CTA deep-links to the dashboard payments filter (getOrderActionDashboardUrl -> /expat/dashboard?tab=orders&sub=payments&id=..., lib/notification-feed.ts:255-268); the /checkout?proforma={id} link is the banner's buyer_payment_unfinished alert (lib/pending-action-alerts.ts:247-260). Both payment-urgency surfaces exist on web; minor stands.

### 🟡 Minor · partial — Empty state is bare text; missing 'Go to Dashboard' / 'Browse Products' shortcuts and caught-up copy

**ID:** `notif-pending:NOTIFP-22` · **Area:** Notifications empty state

**Impact:** Cosmetic/flow polish: at zero pending actions the web nudges the user onward to dashboard or browsing; mobile dead-ends with a single grey line.

- **Frontend evidence:** app/notifications/page.tsx 1.3.10 - CheckCircle2 'You're all caught up!' with buttons 'Go to Dashboard' (/expat/dashboard) and 'Browse Products' (/browse)
- **Mobile evidence:** lib/screens/account_misc_screens.dart:187-192 - empty state is only 'No notifications yet.' grey text inside a pull-to-refresh ListView; no action buttons
- **Mobile-side verification:** lib/screens/account_misc_screens.dart:184-193 (read): the empty branch is a RefreshIndicator wrapping a single grey 'No notifications yet.' Text — no CheckCircle, no 'Go to Dashboard'/'Browse Products' buttons, no caught-up copy.
- **Frontend-side verification:** Frontend verified: app/notifications/page.tsx:737-759 empty state with CheckCircle2 (:739), 'You're all caught up!' (:742), coffee copy (:744-747), buttons 'Go to Dashboard' -> /expat/dashboard (:749-751) and 'Browse Products' -> /browse (:752-757). Minor stands.

#### Second-pass candidates (13) — unverified

_Found by an independent re-audit of this domain (different inventory pass). Not adversarially verified; wording may overlap a canonical gap above._

- **🟠 Major · missing — No cross-app 'act now' banner surface; classifier feeds only the bell badge**
  - Impact: Mobile users get no ambient surface for the most urgent commerce steps — a rejected proof of payment, an unfinished proforma, an admin payment past its 30-minute review SLA, or an order blocking someone else is only visible if they happen to open My Payments or the order detail screen.
  - FE: components/pending-actions-banner.tsx:72-141 — banner pinned on every page, single most urgent alert + '+N more tasks' (143-162), per-kind CTA map (45-53), 60s poll (33, 111-115) and refresh on route change + NOTIFICATION_REFRESH_EVENT (119-123); lib/pending-action-alerts.ts:62-70 KIND_PRIORITY and 179-260 build alerts for admin_payment_review, buyer_payment_rejected, seller_fulfillment, buyer_confirm_receipt/delivery_time/delivery, buyer_payment_unfinished
  - MO: lib/domain/pending_actions.dart:4-6 and 208-210 — classifier doc says 'the notifications feed and any banner' but grep shows the only consumer is lib/widgets/globo_app_bar.dart:77 (bell badge count); no banner/alert widget exists anywhere in lib/
- **🟠 Major · missing — No opt-in OS-level notification channel (web Notification API alerts have no mobile equivalent)**
  - Impact: On web an urgent pending step can interrupt the user while the tab is hidden; on mobile nothing ever leaves the app — no push, no local notifications — so time-critical steps (payment rejection with a 48h correction window, dispatch unlock) are missed until the app is opened.
  - FE: hooks/use-desktop-alerts.ts:95-132 — Notification.requestPermission, fires only when document.visibilityState === 'hidden', tag = alert.kind, seen-IDs persisted in localStorage with 200 cap; components/pending-actions-banner.tsx:169-181 'Alert me' opt-in button
  - MO: pubspec.yaml — grep for firebase|notification|push|fcm returns nothing; no local-notification or push package or code exists in any Dart file; notification surfacing is exclusively in-app lists and badges
- **🟠 Major · partial — Nudge is a fixed GENERAL payload; the whole NudgeDialog feature set is missing**
  - Impact: Responders cannot attach a listing (PRODUCT_MATCH), cannot send a structured service offer with contact details and consent (SERVICE_OFFER), cannot edit a previous nudge, and unverified users are not gated. The nudge the requester receives carries no match, no price, and no contact — gutting the request-board's two-sided loop.
  - FE: components/request-board/nudge-dialog.tsx:79-84 goods/service default messages; 279-369 canSell gate ('Verify your account before responding to a request.'), service form validation (292-303), PRODUCT_MATCH payload {nudgeType:'PRODUCT_MATCH', message, productId} (362), SERVICE_OFFER payload with providerName/serviceCategory/location/contact (305-314), mode 'new' → pending intent + /sell?requestNudge=1 (329-349), product picker with pasted-link parsing (64-73)
  - MO: lib/screens/requests_screen.dart:439-463 _nudge() sends one fixed call with no dialog; lib/api/api_client.dart:1354-1363 defaults message 'I can help with this!', nudgeType 'GENERAL', productId optional but the only call site (requests_screen.dart:448) passes none; no nudge update (PUT) method and no my-nudge fetch exist; ALREADY_NUDGED just toasts 'You already nudged this request.' (requests_screen.dart:455-457) instead of switching to edit mode
- **🟠 Major · partial — Fixed 20-row fetch, no pagination, and search ignores referenceId**
  - Impact: Users with more than 20 notifications can never reach older items on mobile (web pages through everything 8 at a time), and reference/order-id searches return nothing, degrading the action center into a truncated recent-events list.
  - FE: app/notifications/page.tsx:150-154 currentPage + ITEMS_PER_PAGE = 8 with Previous/Next (267-271); search matches `${title} ${message} ${referenceId}` (229-231) and action cards match title/description/orderId (259-263); hooks/use-notifications.ts:91 fetches notifications(0,100) for counts
  - MO: lib/api/api_client.dart:1063-1064 fetchNotifications defaults page 0 size 20; sole call site lib/screens/account_misc_screens.dart:44 passes no args; 138-141 search matches title and message only; the ListView (196-202) has no pagination controls
- **🟡 Minor · missing — Pending/Buying/Selling metric strip and per-tab count badges missing**
  - Impact: Mobile users lose the at-a-glance totals that tell them how many buying vs selling vs request actions are outstanding; the Requests tab also never signals unread nudge activity.
  - FE: app/notifications/page.tsx:294-330 unifiedCounts (dedup Sets keyed order:{id}/notification:{id}), requestCount = nudgeUnread + requestNotificationUnread, pendingCount; 358-387 three metric cards; 410-443 tab triggers carry live counts incl. red Requests badge (438-442) and admin Messages badge (452-456)
  - MO: lib/screens/account_misc_screens.dart:210-230 tab bar is a plain horizontal ChoiceChip row with no counts; no metric widgets exist in the screen (172-204)
- **🟡 Minor · divergent — Overdue grouping uses only fulfillmentDeadline; backend overdue flag parsed but ignored; no periodic recompute**
  - Impact: An order whose deliveryDeadline/deliveryDueAt/proposed delivery time or buyer window has passed (with no fulfillmentDeadline) stays in 'Ongoing' on mobile instead of moving to 'Overdue', and groups never roll over while the screen is open — the urgency signal diverges from web and from the backend's own overdue flag.
  - FE: lib/order-delivery-deadline.ts:239-268 getOrderDeliveryDeadline resolves fulfillmentDeadline → deliveryDeadline → deliveryDueAt → promisedDeliveryAt → trip.proposedDeliveryTime → max end of all buyer windows → legacy preferredDeliveryDate+slot; web dashboard recomputes groups on a 30s clock
  - MO: lib/models/order.dart:349-368 Order.group tests only TimeUtils.tryParseBackendTimestamp(fulfillmentDeadline); :214 and :310 parse json['overdue'] into a field that group never reads; orders list does a single fetch with no recompute timer
- **🟡 Minor · divergent — Unlock instant ignores the authoritative server dispatchOpensAt and the earliest-window rule; no readiness retry**
  - Impact: For orders with several buyer windows or a server-stamped unlock instant, the mobile 'Unlocks at …' banner can disagree with web/backend (first-listed window vs earliest), and the locked banner does not clear itself when the moment passes — the seller must leave and reopen the order.
  - FE: lib/order-delivery-deadline.ts:106-122 getDispatchOpensAt prefers the server's offset-carrying dispatchOpensAt, else Math.min() of ALL resolved window starts − 1h allowance, then legacy window; 134-150 bounded readiness retry backoff (5s × 2^n, max 4 checks, 6h schedule cap); :20 2s unlock buffer
  - MO: lib/domain/dispatch.dart:78-95 primaryDeliveryWindow returns the FIRST parseable window entry; :99-102 dispatchOpensAt = that window's start − 1h with no server field read; no retry/backoff scheduling exists (banner text is computed once per build)
- **🟡 Minor · partial — Uploaded receipts cannot be viewed — only counted**
  - Impact: A buyer who needs to check which proof they uploaded (e.g. before re-uploading after a rejection) cannot open their receipts on mobile.
  - FE: components/dashboard/my-payments-panel.tsx:481 'View receipts ({payment.receipts!.length})' collapsible listing the uploaded proofs per proforma
  - MO: lib/screens/my_payments_screen.dart:635-636 renders only '${payment.receipts.length} receipt(s)' as meta text (receipts parsed at 278-280); no tap target, list, or preview of receipt files anywhere in the screen
- **🟡 Minor · divergent — Classifier never applies the sellerId/buyerId fallback; missing orderType is always treated as buying**
  - Impact: Any order payload without an explicit orderType is classified as buying on mobile, so a seller's pending fulfillment actions (confirm availability, dispatch, verify delivery) are mis-scoped and the bell badge/hints disagree with web for the same data.
  - FE: lib/order-notification-actions.ts:60-71 resolveOrderNotificationType: explicit orderType/listType, else currentUserId matched against sellerId then buyerId, else buying
  - MO: lib/domain/pending_actions.dart:48-55 — doc comment claims the user-id fallback but the code sets selling=false whenever orderType is absent; lib/models/order.dart:167 the Order model has no sellerId/buyerId fields at all; lib/widgets/globo_app_bar.dart:77 computes the badge count without passing currentUserId
- **🟡 Minor · divergent — 30-day active-notification window not applied to badge order actions**
  - Impact: A stale order left in an actionable state (e.g. an abandoned AWAITING_PAYMENT from months ago) inflates the mobile bell badge indefinitely, while web drops it from the action feed after 30 days — badge numbers diverge and the 'urgent' signal loses meaning.
  - FE: app/notifications/page.tsx:95-105 ACTIVE_NOTIFICATION_DAYS = 30 + isWithinActiveNotificationWindow; 163-164 skips orders older than 30 days before classifying them into action cards
  - MO: lib/domain/pending_actions.dart:208-210 pendingOrderActionCount counts every order with a non-null action with no date filter, and getOrderNotificationAction (47-199) never inspects createdAt/updatedAt; lib/widgets/globo_app_bar.dart:77 feeds that count straight into the badge
- **🟡 Minor · divergent — MySpace Requests tab embeds the public community feed instead of the My Requests owner board**
  - Impact: Request owners landing on MySpace→Requests see the community board rather than their own requests with the unread-nudge badge, removing the owner-side entry point into the nudge loop (compounding NOTIFP-05) and risking accidental re-posting from the embedded FAB.
  - FE: app/expat/dashboard/page.tsx:93 imports RequestBoardTab and :4388 renders it as the Requests tab (owner 'My Requests' view); components/request-board/request-board-tab.tsx:230 shows the '{unreadCount} new' unread-nudge red badge with page reset on filter change
  - MO: lib/screens/delivery_dashboard_screens.dart:478-500 — the Requests tab renders `const RequestsScreen()`, the public feed with its own type/status/search filters and a 'Post request' FAB, not an owner-scoped board
- **🟡 Minor · missing — Ongoing-order badges on the menu and pending badges on dashboard tabs are absent**
  - Impact: The ambient 'you have N ongoing buying/selling orders' and 'N pending' nudges that steer users back into commerce flows are entirely absent from mobile chrome.
  - FE: components/header/ongoing-order-count-badge.tsx:19 '99+' badge rendered next to the mobile menu Buying/Selling items (hidden at 0, aria '{count} ongoing … order(s)'); components/dashboard/dashboard-section-tabs.tsx:79 pending badges on the Selling/Buying dashboard section tabs
  - MO: lib/screens/shell.dart:113-123 BottomNavigationBarItems are plain icon+label with no badge; lib/screens/delivery_dashboard_screens.dart:478-484 dashboard TabBar is plain text ('Overview'…'Requests') with no counts; no ongoing-order badge widget exists in lib/
- **🟡 Minor · divergent — 'Confirm Received' skips the escrow-release warning/confirm step before submitting**
  - Impact: The irreversible escrow release (buyer money → seller payout) can be triggered on mobile with one tap plus the rating dialog, without the explicit 'payment will be released' warning web shows — a lighter-weight but riskier confirmation UX for a money-affecting action.
  - FE: app/expat/dashboard/page.tsx:4490 AlertDialog 'Confirm you received your items' — 'This confirms your order has arrived and releases payment to the seller. Only confirm once you actually have your items in hand.' gates the confirmDeliveredByBuyer/receipt flow (buyer order card, inventory §2.99)
  - MO: lib/screens/orders_screen.dart:867-880 — buyer 'Confirm Received' FilledButton opens _ratingDialog('confirm-receipt', …) directly (871-875); there is no intermediate confirm dialog and no 'releases payment to the seller' warning copy before the PATCH

<details><summary><strong>Confirmed equivalent in both apps (26)</strong></summary>

- Unread bell badge: red bubble, 9+ cap, hidden at 0, deep-links to /notifications (lib/widgets/globo_app_bar.dart:136-141,180 vs components/header/notification-badge)
- Notifications screen tabs All/Buying/Selling/Requests with the same scope classifier (_BUYING/_SELLING suffixes, regex rules) as lib/notification-feed.ts (lib/domain/notification_feed.dart scope + account_misc_screens.dart:130-143)
- Action-type filter All types/Payment/Fulfillment/Receipt/Rating with same priority order and client-side title+message search (account_misc_screens.dart:137-142,251-262)
- Read informational-payment rows (PAYMENT_VERIFIED/PAYMENT_SUBMITTED/PAYMENT_DETAILS_RECEIVED) hidden from the active feed once read (notification_feed.dart:210 shouldShowNotificationInActiveFeed)
- Seller-confirmed-delivery message rewrite to the exact web copy (notification_feed.dart:88 _normalizeMessage)
- Cancelled notifications never deep-link and unsafe actionUrl values are dropped (notification_feed.dart:230+); row without a target just marks read
- Mark-one-read on open (awaited before nav), mark-all-read, delete-all with confirm dialog (account_misc_screens.dart:52-125)
- Derived deep-link targets incl. /edit-listing/{referenceId} for PRODUCT_LOGISTICS_UPDATE_REQUIRED and /account/payments for payment scope (notification_feed.dart:230)
- Order pending-action decision tree fully ported with all 16 verbs, rental-aware, canDispatch timing-null (lib/domain/pending_actions.dart:47-210) and badge sums unread + order actions (globo_app_bar.dart:74-82)
- Order status groups All/Ongoing/Overdue/Completed/Cancelled with rental-aware grouping (orders_screen.dart:46-48,126; models/order.dart group)
- Delivery-code verify with 3-attempt lockout, server attemptsRemaining parsing, 403/network not consuming attempts, regenerate reset, buyer copy button, rental handoff regenerate (delivery_dashboard_screens.dart:91-172; orders_screen.dart:453-472)
- Buyer OTP-free confirm-delivery self-confirm gated on buyerCanConfirmDelivery (delivery_dashboard_screens.dart:177-188,413-419)
- Confirm availability / decline availability with required reason, decline cancels order and moves buyer money to REFUND_PENDING (orders_screen.dart:533-586,826-863; escrow banner REFUND_PENDING)
- Confirm Received + rating, standalone Rate Seller / Rate Buyer driven by buyerRated/sellerRated flags (orders_screen.dart:476-527,867-880,1005-1028)
- Seller mark picked-up / mark-delivered and Arrange transport via AssignTransporterModal with registry + inline create (orders_screen.dart:883-1003; widgets/assign_transporter_modal.dart)
- Dispatch unlock banner 'Unlocks at HH:MM (N min)' with 1h allowance and dispatch-blocker list with fixed per-code copy (orders_screen.dart:935-983; lib/domain/dispatch.dart, dispatch_errors.dart)
- Escrow banner state table: REFUNDED / REFUND_PENDING / escrowPending / HELD / RELEASED with the same precedence and copy family (lib/domain/escrow.dart Escrow.view; orders_screen.dart:716-765)
- My Payments: 4 groups Pending/Approved/Rejected/Expired with identical grouping precedence incl. replacement-SUBMITTED-beats-rejection, deep link ?paymentStatus=, Continue payment -> /checkout?proforma=, 'Action needed - new proof' badge (my_payments_screen.dart:287-305,521-537,540-547)
- 48h rejected-proof correction window math (explicit field > rejectedAt+48h > max receipt stamp+48h) with remaining/overstated copy and CORRECTION_WINDOW_CLOSED handling (my_payments_screen.dart:319-328,703-772; lib/domain/escrow.dart)
- Proforma countdown visible only while PENDING_PAYMENT, 3h urgency threshold, expired clamp (lib/domain/countdown.dart; my_payments_screen.dart:677-699)
- Requests feed: type segments All/Goods/Services, server status/search filters, view tracking fire-and-forget with anonymous id (requests_screen.dart:26-42,190-196; api_client.dart:2152)
- Request owner actions Edit / Fulfil (product picker) / Close / Delete gated to owner+PENDING with confirm dialogs (requests_screen.dart:233-336,365-414)
- ALREADY_NUDGED mapped to friendly 'You already nudged this request.' both locally and in the global error map (requests_screen.dart:455-457; widgets/api_error_view.dart)
- Request budget min-max TZS formatting and EAT timestamp rendering with 'Date unavailable' fallback (requests_screen.dart:494-501; lib/domain/time_utils.dart)
- Admin contact-message inbox: unread count, mark-read on expand, delete, WhatsApp deep link, pull-to-refresh (admin_sublist_screens.dart AdminMessagesScreen)
- Global friendly error copy map covering this domain: already_nudged, correction_window_closed, dispatch_too_early, delivery_code_required, proforma_expired, order_refunded etc. (lib/widgets/api_error_view.dart)

</details>


## Business-rule & calculation parity (cross-cutting)

### 🔴 CRITICAL · BROKEN — Monthly rental unit count uses an arithmetic formula that diverges from the web's calendar cursor-walk

**ID:** `biz-logic:BIZLOG-01` · **Area:** Rentals - monthly billing units

**Impact:** Money: for any monthly rental starting on day 29-31, mobile bills fewer months than the web quotes for the same dates (e.g. Jan 31 -> Mar 30: 2 vs 3), so the price shown/charged for month-based rentals is wrong on mobile.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/lib/rentals.ts:259-267 - countCalendarMonths walks anniversaries with addOneCalendarMonth (269-275) clamping to month-end (Jan 31 -> Feb 28/29), so Jan 31 -> Mar 30 counts 3 months
- **Mobile evidence:** D:/Projects/Global_Expats/GloboExpats_Mobile/lib/domain/rentals.dart:200-205 - _countCalendarMonths computes months=(end.year-start.year)*12+(end.month-start.month) then months+=1 if end.day>start.day (min 1), so Jan 31 -> Mar 30 counts 2 months
- **Mobile-side verification:** Verified mobile lib/domain/rentals.dart:200-205: months=(end.year-start.year)*12+(end.month-start.month); if(end.day>start.day)months+=1; min 1. Web lib/rentals.ts:259-275 is a cursor walk with month-end clamping. Recomputed both: Jan 31->Mar 30 gives web 3 (Jan31->Feb28->Mar28->Apr28) vs mobile 2; even Jan 30->Mar 30 diverges (3 vs 2). The formula feeds the buyer-facing live total (product_detail_screen.dart:800 calls buildRentalBooking) and proforma billableUnits/sellerTotal/sellingTotal (rentals.dart:232-244), so monthly rentals starting day 29-31 are mispriced on mobile. Searched for any alternative month-count implementation: _countCalendarMonths is the only one. Critical stands.
- **Frontend-side verification:** Frontend verified. lib/rentals.ts:259-267 countCalendarMonths walks anniversaries while cursor < end; addOneCalendarMonth (269-275) clamps to month end via Math.min(day, lastDay) where lastDay = new Date(Date.UTC(year, month+2, 0)).getUTCDate(). Used for MONTH ratePeriod at lib/rentals.ts:124 (billableUnits = countCalendarMonths(start, end)). Traced Jan 31 -> Mar 30: Jan31->Feb28 (1) ->Mar28 (2) ->Apr28 (3) = 3 months as claimed. Deterministic billing-unit divergence for month-based rentals starting on day 29-31 affects the quoted/billed amount, so critical (affects money) is right.

### 🟠 Major · missing — Mobile never fetches /platform-settings/commission; all commission math runs on compiled-in defaults

**ID:** `biz-logic:BIZLOG-02` · **Area:** Commission - platform settings

**Impact:** If admins change VAT/Selcom/category commission rates, mobile keeps the stale defaults: seller earnings previews, stored pricing fields (categoryCommissionPercentage, sellerFacingCommissionAmount sent from edit_listing_screen.dart:207-213) and admin money views diverge from what the platform actually charges.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/hooks/use-platform-commission-settings.ts:53-80 - hook fetches apiClient.getPlatformCommissionSettings() with a 60s cache (line 18); D:/Projects/Global_Expats/GloboExpats_Frontend/lib/api.ts:1403 - GET '/api/v1/platform-settings/commission'; used by sell (app/sell/page.tsx:257), order detail (app/orders/[id]/page.tsx:237), edit-listing (167) and admin (admin-commission-calculator.tsx:78, admin-order-pricing-breakdown.tsx:115)
- **Mobile evidence:** D:/Projects/Global_Expats/GloboExpats_Mobile/lib/domain/commission_calculator.dart:61 - CommissionCalculator defaults to const CommissionRates(); D:/Projects/Global_Expats/GloboExpats_Mobile/lib/models/sell_form_state.dart:97 - rates = const CommissionRates(); grep of lib/ shows zero platform-settings calls, and mobile admin screens (admin_dashboard.dart, admin_orders_screen.dart, admin_payments_review_screen.dart) have no pricing-breakdown/commission-calculator surface
- **Mobile-side verification:** Repo-wide grep for platform-settings/platformSettings/PlatformCommission/commissionSettings finds zero fetch calls (only grossPlatformCommission field names and a test name). CommissionRates.fromJson exists (commission_calculator.dart:16-22) but is exercised only by test/commission_test.dart:64; all app call sites use compiled-in defaults: sell_form_state.dart:97 'CommissionRates rates = const CommissionRates()', :112 'CommissionCalculator(rates: rates)', edit_listing_screen.dart:188 'const CommissionCalculator()'. api_client.dart has no settings/commission endpoint (only an unrelated changePassword comment at :1759). Admin screens contain no commission-calculator/pricing-breakdown surface. Confirmed major.
- **Frontend-side verification:** Frontend verified. hooks/use-platform-commission-settings.ts:70-80 fetches apiClient.getPlatformCommissionSettings() with CACHE_TTL_MS = 60_000 (line 18) and inflight dedupe (23); lib/api.ts:1401-1407 issues GET '/api/v1/platform-settings/commission' (line 1403). All cited usage sites confirmed by grep: app/sell/page.tsx:257, app/orders/[id]/page.tsx:237, app/edit-listing/[id]/page.tsx:167, components/admin/admin-commission-calculator.tsx:78, components/admin/admin-order-pricing-breakdown.tsx:115. Major is right: the web re-derives pricing from live platform settings wherever commission math runs, so divergence only materializes when admins deviate from defaults (backend stays authoritative for actual charges), but previews/stored fields diverge user-visibly.

### 🟠 Major · divergent — Checkout does not resolve item transport requirements; fulfillment type is a free buyer toggle defaulting to SELLER_DELIVERY

**ID:** `biz-logic:BIZLOG-03` · **Area:** Checkout - transport requirement rule

**Impact:** Exempt goods (rentals, real-estate) default into SELLER_DELIVERY on mobile, so a delivery fee is quoted/charged where the web charges none, and buyers can also switch REQUIRED orders to BUYER_PICKUP where the web forces seller delivery. Either a wrong fee or a proforma mismatch at creation.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/lib/transport-requirements.ts:29-40 - resolveCheckoutTransportRequirement (any REQUIRED -> REQUIRED, else OPTIONAL, else EXEMPT; real-estate EXEMPT 18-20, rental EXEMPT 22-27); D:/Projects/Global_Expats/GloboExpats_Frontend/app/checkout/checkout-content.tsx:564-565 - derives requiresDeliveryLogistics from it and gates windows/quote/proforma on it (573-579, 1410-1414, 1651-1659)
- **Mobile evidence:** D:/Projects/Global_Expats/GloboExpats_Mobile/lib/screens/checkout_screen.dart:99 - String _fulfillmentType = 'SELLER_DELIVERY' (hard default); :847,854 - buyer picks fulfillment from radio buttons with no requirement resolution; grep of checkout shows zero hits for transportRequirement/requiresDeliveryLogistics/EXEMPT (the model only exists seller-side in sell_form_state.dart:539-543)
- **Mobile-side verification:** Verified checkout_screen.dart:99 'String _fulfillmentType = SELLER_DELIVERY' with the only assignments being the two RadioListTile handlers (:847, :854) — a free buyer toggle. Grep of checkout_screen.dart for rental/exempt/transportRequirement/requiresDeliveryLogistics: zero hits. The model does parse product.transportRequirement (product_detail.dart:25,132-133) but no buyer-side screen consumes it. Web checkout-content.tsx:564-574 resolves resolveCheckoutTransportRequirement and auto-sets fulfillmentType to BUYER_PICKUP when delivery logistics are not required; mobile has no equivalent, so exempt items (rentals/real-estate) default into SELLER_DELIVERY and REQUIRED items can be flipped to pickup. Confirmed major.
- **Frontend-side verification:** Frontend verified. lib/transport-requirements.ts:29-40 resolveCheckoutTransportRequirement (any REQUIRED -> REQUIRED, else OPTIONAL, else EXEMPT, rentals skipped) exactly as described; real-estate EXEMPT at 18-20, rental EXEMPT at 22-27. app/checkout/checkout-content.tsx:564-571 derives requiresDeliveryLogistics from it (plus itemUsesDeliveryLogistics), 572-576 forces setFulfillmentType('BUYER_PICKUP') when !requiresDeliveryLogistics, 577-580 gates the availability fetch, 1408-1415 gates the Review step (windows + quote), and 1650-1661 gates proforma window resolution. Web really does resolve the requirement and force/gate on it; major (user-visible fulfillment/fee behavior) is right.

### 🟠 Major · missing — Cross-region delivery policy (null fee -> 'To be confirmed', deferred after checkout) is absent on mobile

**ID:** `biz-logic:BIZLOG-04` · **Area:** Delivery fee - cross-region policy

**Impact:** Money: for cross-region carts the mobile quote shows a computed fee the web explicitly refuses to charge (null + 'To be confirmed', collected later). Buyer sees a different, non-deferred total on mobile for the same cart.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/lib/delivery-region.ts:109-138 - applyCrossRegionDeliveryPolicy nulls the fee, sets 'To be confirmed' and defers fee collection after checkout when buyer country/region differs from the seller's (isCrossRegionDelivery 27-51, getCrossRegionSellerKeys 78-103)
- **Mobile evidence:** D:/Projects/Global_Expats/GloboExpats_Mobile/lib/domain/delivery_quote.dart:243-264 - quotedFeeForSeller takes consolidatedDeliveryFee at face value with no cross-region branch; grep of mobile lib/ returns zero matches for crossRegion
- **Mobile-side verification:** Grep of mobile lib/ for crossRegion/cross-region: zero matches. Verified quotedFeeForSeller (delivery_quote.dart:243-264) reads consolidatedDeliveryFee at face value with no cross-region branch; checkout builds totals straight from it (checkout_screen.dart:256-262, 890-901). Web lib/delivery-region.ts:27-51 + 109-138 nulls the fee and defers collection. One nuance: mobile does render 'To be confirmed' when a group fee is null/missing (checkout_screen.dart:1577, 1632-1636), so if the SERVER also nulls the fee the displays coincide — the missing piece is the client-side defensive policy that nulls even a stale priced response and derives cross-region seller keys. Gap confirmed as claimed; impact sentence is conditional on the server returning a computed fee. Major kept.
- **Frontend-side verification:** Frontend verified. lib/delivery-region.ts:109-138 applyCrossRegionDeliveryPolicy sets consolidatedDeliveryFee/consolidatedDeliveryFeeMin/distanceKm to null and crossRegionDelivery: true for cross-region seller groups, recomputing deliveryTotal with ?? 0; isCrossRegionDelivery at 27-51 (country mismatch -> true, region mismatch when both present, unknown -> false); getCrossRegionSellerKeys at 78-103 parsing seller location tails. Deferred-fee display copy confirmed: checkout-content.tsx:3853/3862 ('Arranged after checkout' / amber 'To be confirmed') and app/checkout/steps/review-step.tsx:373/381. Major is right for a divergent money-display/fee-collection behavior.

### 🟠 Major · partial — Seller-configured availability windows (and per-window server startsAt/endsAt, SELLER_HOURS) unsupported in checkout

**ID:** `biz-logic:BIZLOG-05` · **Area:** Delivery windows - seller availability

**Impact:** Buyers on mobile can select windows the seller never offers (availability endpoint never consulted), and seller-customized hours or server-adjusted window bounds are silently ignored - deliveries get scheduled outside the seller's real availability.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/lib/api.ts:2809-2816 - POST '/api/v1/checkout/availability-windows' returns seller AvailabilityWindows; checkout-content.tsx:581 - availabilityWindows = availability.windows, filtered into selectable windows (1401-1411) and the proforma gate (1651-1659); lib/checkout-delivery-windows.ts:25-37 supports the SELLER_HOURS slot and 125-150 honor server startsAt/endsAt overrides
- **Mobile evidence:** D:/Projects/Global_Expats/GloboExpats_Mobile/lib/domain/delivery_windows.dart:215-225 - parseDatedWindow only accepts the 6 fixed TODAY/TOMORROW x MORNING/AFTERNOON/EVENING composites; :243-254 - preferredDeliveryWindowsPayload emits only composites; :105-119 has no startsAt/endsAt handling; grep of api_client.dart shows no checkout/availability-windows call
- **Mobile-side verification:** api_client.dart has no /api/v1/checkout/availability-windows call (grep 'availability' surfaces only order availability-decision/confirm/decline verbs :2039-2106, category-availability :2191, rental-availability :2271). delivery_windows.dart: grep SELLER_HOURS/startsAt/endsAt = zero hits; parseDatedWindow (verified in inventory and code) accepts only the 6 TODAY/TOMORROW x MORNING/AFTERNOON/EVENING composites. Web lib/api.ts:2809-2816 and lib/checkout-delivery-windows.ts:26-37 (SELLER_HOURS) and 125-150 (startsAt/endsAt overrides) confirmed. Confirmed major.
- **Frontend-side verification:** Frontend verified. lib/api.ts:2809-2816 getAvailabilityWindows POSTs '/api/v1/checkout/availability-windows'; checkout-content.tsx:581 availabilityWindows = availability.windows, selectable-window filtering at 1401-1411 (selectedAvailabilityWindows vs fallback getAvailableDeliveryWindowValues), proforma-side window gate at 1650-1661; lib/checkout-delivery-windows.ts:25-37 SLOT_END_HOUR/SLOT_START_HOUR include SELLER_HOURS (24/0), and getResolvedDeliveryWindowEnd/Start honor server startsAt/endsAt overrides first (lines 126, 140). Major is right: the web consults seller availability and server window bounds; a mobile build without them lets buyers pick windows the seller never offered.

### 🟠 Major · partial — Receipt upload accepts images only; PDF support, 5MB cap and file compression are missing

**ID:** `biz-logic:BIZLOG-09` · **Area:** Payment proof - receipt upload rules

**Impact:** Buyers paying via bank transfer receipts saved as PDF - the format the web explicitly supports - cannot upload proof on mobile at all, stalling the PAYMENT_SUBMITTED step; oversized images also go up unvalidated.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/components/checkout/receipt-upload.tsx:17-18 - MAX_FILE_SIZE 5MB, ALLOWED_MIME_TYPES image/jpeg|png|webp|application/pdf; :30-92 - compressImage + compressPdf pipelines; :151 - accept attribute; :174 - 'JPEG, PNG, WebP, or PDF, up to N files, 5MB each' copy
- **Mobile evidence:** D:/Projects/Global_Expats/GloboExpats_Mobile/lib/screens/checkout_screen.dart:1246-1276 - _pickReceipt uses ImagePicker().pickImage(maxWidth 1600, quality 80): photos/gallery images only, no PDF input, no MIME allow-list and no size validation
- **Mobile-side verification:** Real gap: PDF is genuinely unsupported — both pickers use ImagePicker().pickImage(source: gallery) only (checkout_screen.dart:1257-1260; my_payments_screen.dart:555-558, whose own comment admits web accepts JPEG/PNG/WebP/PDF), no file_picker dependency in pubspec.yaml, no MIME allow-list; the re-upload path also skips a size cap (only an empty-file check). BUT the claim's mobile evidence is wrong on two points: the 5MB cap DOES exist in the checkout picker (checkout_screen.dart:73-74 _kMaxReceiptBytes = 5*1024*1024; :1262-1266 rejects with exact '{name} exceeds the 5MB limit.') and image compression IS applied (maxWidth 1600, imageQuality 80) — matching web's compressImage intent. So the accurate scope is 'no PDF input + missing size cap on the re-upload path', not '5MB cap and compression missing'. Severity corrected to minor: image proofs (dominant case) work end-to-end and PDF holders can screenshot/print-to-image; the claim's 'stalls PAYMENT_SUBMITTED at all' is overstated.
- **Frontend-side verification:** Frontend verified. components/checkout/receipt-upload.tsx:17 MAX_FILE_SIZE = 5*1024*1024; :18 ALLOWED_MIME_TYPES = image/jpeg, image/png, image/webp, application/pdf; compressImage at 30-51 and compressPdf (pdf-lib) at 58-88 with original-file fallback; :151 accept="image/jpeg,image/png,image/webp,application/pdf"; :174 copy 'JPEG, PNG, WebP, or PDF, up to {MAX_FILES} files, 5MB each. Files are compressed before upload.' All exactly as cited. Major is right: PDF proof is a supported input path on web and its absence on mobile blocks that segment of the payment submission (images remain a workaround, so not critical).

### 🟠 Major · missing — Rental completion countdown / auto-complete notice for active (PICKED_UP) rentals is missing

**ID:** `biz-logic:BIZLOG-10` · **Area:** Rentals - completion countdown

**Impact:** Mobile renters get no warning that their rental window is ending or that completion happens automatically, so late returns/charges surprise them; web buyers see the same state prominently.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/components/orders/rental-stage-countdown.tsx:23-35 - renders PaymentCountdown for PICKED_UP rentals with 'Time until completion', 'Rental ending soon', 'Rental period ended' and 'This order is being completed automatically.'
- **Mobile evidence:** Grep of D:/Projects/Global_Expats/GloboExpats_Mobile/lib for 'Time until completion'/'Rental ending soon' returns zero matches; rental detail on mobile (lib/screens/orders_screen.dart:775-790) renders only the rental handoff code card, no completion countdown or auto-complete note
- **Mobile-side verification:** Searched mobile lib/ for 'Time until completion', 'Rental ending soon', 'Rental period ended', 'completed automatically', 'PaymentCountdown', any PICKED_UP rental deadline rendering: zero matches. Countdown widgets exist only for proforma/payment steps (checkout/payment/my_payments screens). Rental detail renders only the handoff-code card (orders_screen.dart:774-786) and the timeline shows a bare 'Rental period' step (order_status_timeline.dart:122) with no countdown or auto-complete note; RentalPresentation carries the booking map but nothing renders a completion deadline. Web rental-stage-countdown.tsx:23-35 confirmed and rendered on order detail + dashboard + admin. Confirmed, but severity corrected to minor: it is an informational banner (completion is automatic server-side; no money miscalculation or blocked action), not a broken flow.
- **Frontend-side verification:** Frontend verified. components/orders/rental-stage-countdown.tsx:23 returns null unless normalizeOrderStatus(status) === 'PICKED_UP'; 25-35 renders PaymentCountdown with title="Time until completion", urgentTitle="Rental ending soon", expiredTitle="Rental period ended", expiredMessage="This order is being completed automatically." - all four strings exactly as claimed (it is part of the order-detail surface per inventory 1.28). Major (user-visible feature missing) is right.

### 🟠 Major · partial — Assign-transporter flow diverges: free vehicle picker, no proposed delivery time, no not-linked error, no WhatsApp share

**ID:** `biz-logic:BIZLOG-11` · **Area:** Seller - transporter assignment

**Impact:** Sellers can assign an incompatible vehicle (guaranteed TRANSPORT_MODE_MISMATCH at dispatch), buyers never receive a proposed delivery time, and the not-linked/WhatsApp conveniences are gone - more dispatch failures and manual coordination than web.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/components/transporter/assign-transporter-modal.tsx:155,178,192 - vehicleType locked to the order's requiredVehicleType; :211,241 - proposedDeliveryTime collected and shown ('Proposed delivery: ...' on success, 333); :256 - TRANSPORTER_NOT_LINKED_TO_SELLER handling; :340 - 'Share trip via WhatsApp'
- **Mobile evidence:** D:/Projects/Global_Expats/GloboExpats_Mobile/lib/widgets/assign_transporter_modal.dart:39-47 - free vehicleType dropdown defaulting to 'MOTORBIKE' with 5 options regardless of requirement; :85 - _assign submits only transporterId (proposedDeliveryTime supported in api_client.dart:1001-1007 but never sent); no not-linked error copy and no WhatsApp share anywhere in the widget
- **Mobile-side verification:** All four sub-claims verified in assign_transporter_modal.dart: (1) create-form vehicle dropdown is free with 5 options defaulting MOTORBIKE (:39-47, :172-178) with no requiredVehicleType lock (web locks it, assign-transporter-modal.tsx:153-157,178,192); (2) _assign sends only transporterId (:85) although api_client.dart:997-1007 accepts proposedDeliveryTime/note — never passed; web computes and sends proposedDeliveryTime and shows 'Proposed delivery: ...' (web modal :211,241,333); (3) no TRANSPORTER_NOT_LINKED_TO_SELLER special-casing — errors render raw e.message (:88-93) vs web's 'Driver is not linked to your vendor' (:256); (4) no WhatsApp share — grep 'Share trip'/NOT_LINKED zero hits in mobile lib vs web 'Share trip via WhatsApp' button (:336-341). Major kept.
- **Frontend-side verification:** Frontend verified. components/transporter/assign-transporter-modal.tsx:153-156 pins newTransporter.vehicleType to requiredVehicleType (also 178 and 192), 211-224 computes proposedDeliveryTime via buildAssignmentDeliveryTime and 239-243 sends {transporterId, proposedDeliveryTime}, 256 detects errorCode === 'TRANSPORTER_NOT_LINKED_TO_SELLER' with the 260-263 toast copy, 333 shows 'Proposed delivery: {...} - waiting for the buyer to confirm.', and 337-342 renders 'Share trip via WhatsApp' with the wa.me builder at 270-298. Major is right: requirement-locked vehicle + proposed time are functional (dispatch-failure prevention), not-linked handling and WhatsApp share are conveniences.

### 🟠 Major · divergent — Currency conversion uses a static table; web refreshes live TZS rates every 30 minutes

**ID:** `biz-logic:BIZLOG-12` · **Area:** Currency - rate freshness

**Impact:** Money: multi-currency listings and converted prices on mobile drift from the web (and from reality) between table snapshots, so sellers publishing from mobile and buyers comparing platforms see different TZS equivalents.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/providers/currency-provider.tsx:160 - refreshRates fetches https://api.exchangerate-api.com/v4/latest/TZS; D:/Projects/Global_Expats/GloboExpats_Frontend/lib/currency-types.ts:195 - AUTO_REFRESH_INTERVAL 30 min; sell flow re-denominates prices with live rates
- **Mobile evidence:** D:/Projects/Global_Expats/GloboExpats_Mobile/lib/domain/currency.dart:28-45 - hard-coded 17-currency table; line 26 comment wrongly asserts rates are 'not fetched live on either platform'; no fetch/refresh code exists in the file
- **Mobile-side verification:** Partly real: mobile currency.dart:29-47 is a hard-coded 17-currency table with no fetch anywhere (grep exchangerate/refreshRates zero), and the comment at :24-25 ('not fetched live on either platform') is factually wrong — web currency-provider.tsx:160 fetches api.exchangerate-api.com/v4/latest/TZS, calls converter.updateExchangeRates (:189), auto-refreshing every 30 min (currency-types.ts:194-195). BUT the claim's key impact premise is false: the web SELL flow re-denominates with the SAME static table mobile uses (app/sell/page.tsx:23 imports CURRENCY_DEFINITIONS from lib/currency-converter; :833-834, :2059-2061, :2133 read .exchangeRate from it), so published TZS amounts cannot diverge between platforms. The live rates only affect display conversions on web surfaces consuming the provider (header, product page, checkout, admin). Severity corrected to minor: displayed non-TZS conversions drift, charged TZS does not.
- **Frontend-side verification:** Frontend verified. providers/currency-provider.tsx:160 refreshRates fetches 'https://api.exchangerate-api.com/v4/latest/TZS' (filters to supported codes, forces TZS = 1 at 178-188); lib/currency-types.ts:195 AUTO_REFRESH_INTERVAL: 30 * 60 * 1000 (RATE_CACHE_DURATION 1h at 192). The web genuinely refreshes live rates; major is right since TZS remains the charge base and divergence is in displayed conversions (user-visible feature, not a wrong charge).

### 🟡 Minor · partial — dispatchOpensAt is always recomputed as window start minus 1h; the server's authoritative dispatchOpensAt is ignored

**ID:** `biz-logic:BIZLOG-06` · **Area:** Dispatch gate - open time

**Impact:** When the backend overrides the unlock time (e.g. per-seller readiness), mobile's 'you can dispatch from...' messaging and local unlock logic disagree with the server gate; sellers see a wrong countdown until the 409 DISPATCH_TOO_EARLY.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/lib/order-delivery-deadline.ts:106-120 - getDispatchOpensAt prefers the server-provided dispatchOpensAt when present; :14 - DISPATCH_ALLOWANCE_MS is only the fallback
- **Mobile evidence:** D:/Projects/Global_Expats/GloboExpats_Mobile/lib/domain/dispatch.dart:99-102 - dispatchOpensAt = window.startUtc - 1h only; D:/Projects/Global_Expats/GloboExpats_Mobile/lib/models/order.dart:294-304 - Order.fromJson's deliveryWindowFields subset does not parse a dispatchOpensAt/dispatch fields at all
- **Mobile-side verification:** Verified dispatch.dart:99-102: dispatchOpensAt = primaryDeliveryWindow(order)?.startUtc.subtract(kDispatchAllowance) — always recomputed. order.dart:294-304 deliveryWindowFields captures only preferredDeliveryWindows/_delivery_date/_delivery_slot keys; no dispatchOpensAt field is parsed anywhere (grep: only a doc comment at order.dart:203). Web order-delivery-deadline.ts:106-120 prefers the server instant. Extra divergence found: the web fallback uses the EARLIEST accepted window start, mobile uses the first-listed parseable window. Minor kept.
- **Frontend-side verification:** Frontend verified. lib/order-delivery-deadline.ts:106-108 getDispatchOpensAt returns parseTimestamp(order.dispatchOpensAt) whenever present (comment at 100-105 states that value is authoritative); DISPATCH_ALLOWANCE_MS (line 14) is explicitly documented (9-13) as the fallback for backends that predate the field, applied at 116 and 121. The web therefore prefers the server instant; minor (seller-facing countdown accuracy, backend 409 still authoritative) is right.

### 🟡 Minor · partial — PRODUCTION_NOT_COMPLETE blocker code missing from the dispatch-error map

**ID:** `biz-logic:BIZLOG-07` · **Area:** Dispatch blockers - made-to-order

**Impact:** Sellers with made-to-order items get the raw backend message instead of the actionable 'production not complete' instruction when a dispatch is blocked.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/lib/dispatch-errors.ts:22-23 - PRODUCTION_NOT_COMPLETE maps to its seller-facing copy in the 8-code blocker map
- **Mobile evidence:** D:/Projects/Global_Expats/GloboExpats_Mobile/lib/domain/dispatch_errors.dart:8-14 - only 7 code constants (_kNotReady.._kTooEarly); PRODUCTION_NOT_COMPLETE is absent, so getDispatchBlockedMessage/getDispatchBlockerMessages (34-65) skip it and the seller sees the raw backend fallback
- **Mobile-side verification:** Verified dispatch_errors.dart:8-14 defines exactly 7 codes (NOT_READY_FOR_DISPATCH, ITEM_AVAILABILITY_UNRESOLVED, NO_TRANSPORTER_ASSIGNED, TRANSPORTER_INACTIVE, TRANSPORT_MODE_MISMATCH, DISPATCH_DETAILS_INCOMPLETE, DISPATCH_TOO_EARLY); PRODUCTION_NOT_COMPLETE is absent while web dispatch-errors.ts:22-23,28-29 includes it ('Mark production complete before assigning a transporter or dispatching this made-to-order item.'). Nuance vs the claim's impact line: on the blocked-reason/blockers path getDispatchBlockedMessage returns null for unknown codes (dispatch_errors.dart:44-47) so the blocker is silently OMITTED, not shown raw; only the 409 path (getDispatchFailureMessage:39-42) falls back to the backend's raw message. Gap itself confirmed; minor kept.
- **Frontend-side verification:** Frontend verified. lib/dispatch-errors.ts: DispatchBlockedReason union (8-17) lists exactly 8 codes including PRODUCTION_NOT_COMPLETE (line 11), with seller-facing copy at 22-23 ('Mark production complete before assigning a transporter or dispatching this made-to-order item.'); getDispatchBlockedMessage/getDispatchBlockerMessages (50-74) resolve all 8 keys. The web does map this code; minor is right.

### 🟡 Minor · partial — Overdue grouping uses only fulfillmentDeadline; the web's delivery-deadline fallback chain is not ported

**ID:** `biz-logic:BIZLOG-08` · **Area:** Orders - overdue grouping

**Impact:** Orders whose payload lacks fulfillmentDeadline (legacy rows, rental or dispatch-derived deadlines) never appear in the Overdue tab on mobile, so overdue accounting differs between platforms.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/lib/order-status.ts:342-353 - getOrderStatusGroupForOrder derives overdue via getOrderDeliveryDeadline, whose chain (lib/order-delivery-deadline.ts:239-261) falls back through window end and dispatch+window derivations
- **Mobile evidence:** D:/Projects/Global_Expats/GloboExpats_Mobile/lib/models/order.dart:365-367 - Order.group marks overdue only when fulfillmentDeadline parses and is past; window fields (294-304) are kept raw but never used for the deadline
- **Mobile-side verification:** Verified Order.group (order.dart:352-368): overdue only when TimeUtils.tryParseBackendTimestamp(fulfillmentDeadline) parses and is past. No window-end or dispatch-derived fallback chain. Note the backend 'overdue' bool IS parsed (order.dart:310) but is never consulted by group (grep shows no other use), and orders_screen never reads it — so even a server-flagged overdue row lands in Ongoing when fulfillmentDeadline is absent. Web order-delivery-deadline.ts:106-120 chain confirmed. Minor kept.
- **Frontend-side verification:** Frontend verified. lib/order-status.ts:342-353 getOrderStatusGroupForOrder: ongoing-status orders become 'overdue' when getOrderDeliveryDeadline(order) <= now. Deadline chain at lib/order-delivery-deadline.ts:239-268: fulfillmentDeadline/deliveryDeadline/deliveryDueAt/promisedDeliveryAt -> trip.proposedDeliveryTime -> max resolved window ends -> legacy date+slot end (SELLER_HOURS excluded at 265). Small wording nit: the chain has no dispatch-derived branch - the 'dispatch' element is trip.proposedDeliveryTime - but the load-bearing claim (web derives overdue through a multi-fallback delivery deadline, not just fulfillmentDeadline) is accurate and minor severity is right.

### 🟡 Minor · partial — Legacy/alternate transport-mode synonyms are not normalized on mobile

**ID:** `biz-logic:BIZLOG-13` · **Area:** Delivery fare - transport mode names

**Impact:** Listings or trips carrying legacy mode strings quote the default-mode fare on mobile instead of the correct ladder, producing fee mismatches for those orders.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/lib/delivery-fare.ts:94-131 - normalizeDeliveryTransportMode maps synonyms/legacy spellings onto the canonical modes
- **Mobile evidence:** D:/Projects/Global_Expats/GloboExpats_Mobile/lib/domain/delivery_fare.dart:12-29 - transportModeFromName matches exact enum names only, anything else falls to the default
- **Mobile-side verification:** Normalization gap is real: delivery_fare.dart:12-29 matches only the 6 exact enum names (else null), vs web delivery-fare.ts:94-131 mapping MOTORBIKE/MOTORCYCLE/BIKE/BODA_BODA->BODA, TUKTUK/TUK_TUK->BAJAJI, VAN/PICKUP/PICKUP_TRUCK->MINI_TRUCK, TRUCK->SEMI_TRUCK plus whitespace/dash normalization. But the claim's impact is wrong on both counts: (1) mobile falls to NULL, not 'the default-mode fare'; (2) the sole consumer is sell-draft restore (sell_form_state.dart:182), and mobile drafts only ever contain canonical names mobile itself wrote — no checkout/fee path consumes raw legacy strings (deliveryQuote params are destination+items, api_client.dart:406-424; fee bands use the enum from the dropdown). A legacy name therefore surfaces as the 'Choose a delivery vehicle.' validation error, not a wrong fare. Severity minor kept, scope corrected.
- **Frontend-side verification:** Frontend verified. lib/delivery-fare.ts:94-131 normalizeDeliveryTransportMode maps BODA/MOTORBIKE/MOTORCYCLE/BIKE/BODA_BODA -> BODA, TUKTUK/TUK_TUK -> BAJAJI, VAN/PICKUP/PICKUP_TRUCK -> MINI_TRUCK, TRUCK -> SEMI_TRUCK (comment: 'Legacy 4-vehicle model + common synonyms'), returning undefined for unknowns. Exactly as cited; minor is right.

### 🟡 Minor · partial — Order detail lacks the web's unit-price and financial-summary fallback chains

**ID:** `biz-logic:BIZLOG-14` · **Area:** Orders - financial field fallbacks

**Impact:** When the API omits or renames a money field, web still renders correct amounts while mobile shows 0/blank figures on order detail - silent data loss rather than a visible error.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/lib/order-detail-view.ts:25-34 - getOrderItemUnitPrice chain unitPrice>finalTotalSellingPrice>price>productPrice>askingPrice; :36-42 line-subtotal fallback; :44-70 getOrderFinancialSummary chains (subtotal/itemsSubtotal/itemsTotal, deliveryFee/delivery_fee/consolidatedDeliveryFee/deliveryTotal, totalAmount/grandTotal/orderTotal/total) plus derived subtotal/total
- **Mobile evidence:** D:/Projects/Global_Expats/GloboExpats_Mobile/lib/models/order.dart:266-268 - subtotal/deliveryFee/totalAmount read as bare num fields defaulting to 0; :78 - OrderItem.effectiveUnitPrice = unitPrice ?? price only (2 of 5 fallbacks), no line-subtotal or missing-total derivation
- **Mobile-side verification:** Verified order.dart:78 'effectiveUnitPrice => unitPrice ?? price' (2 of the web's 5 fallbacks — finalTotalSellingPrice/productPrice/askingPrice unparsed); :266-268 subtotal/deliveryFee/totalAmount are bare num fields defaulting 0; orders_screen.dart:697-701 and :255 render them raw with no derivation (grep itemsSubtotal/grandTotal/financialSummary in order surfaces: none; my_payments' grandTotal is a different surface). Web order-detail-view.ts:25-70 chains plus derived subtotal/total confirmed. Minor kept.
- **Frontend-side verification:** Frontend verified. lib/order-detail-view.ts:25-34 getOrderItemUnitPrice chain unitPrice > finalTotalSellingPrice > price > productPrice > askingPrice (finite >= 0, else 0); :36-42 stored line subtotal (subtotal/lineTotal/total) else unitPrice * max(1, qty); :44-70 getOrderFinancialSummary chains subtotal/itemsSubtotal/itemsTotal, deliveryFee/delivery_fee/consolidatedDeliveryFee/deliveryTotal, totalAmount/grandTotal/orderTotal/total, plus derived subtotal (max(0, total - fee)) and total, hasDeliveryFee only when persisted. All as cited; minor is right.

### 🟡 Minor · divergent — normalizeCategoryName replaces '&' with ' and ' instead of 'and', shifting fallback-table keys

**ID:** `biz-logic:BIZLOG-15` · **Area:** Commission - category normalization

**Impact:** For any category name containing '&', the normalized key differs between platforms (e.g. 'A&B' -> 'andb' vs 'and b'), so a fallback commission rate can resolve differently and display a different platform fee for the same listing.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/lib/commission.ts:84-90 - normalizeCategoryName does .replace(/&/g,'and') (no added spaces)
- **Mobile evidence:** D:/Projects/Global_Expats/GloboExpats_Mobile/lib/domain/commission_calculator.dart:167-171 - same function uses .replaceAll('&', ' and ')
- **Mobile-side verification:** Verified the code divergence: mobile commission_calculator.dart:167-171 uses .replaceAll('&', ' and ') while web commission.ts:84-90 uses .replace(/&/g, 'and'). Two scope caveats for the record: (1) the keys only diverge when '&' is NOT space-separated — 'A & B' normalizes identically on both ('a and b') because the following [^a-z0-9]+ collapses runs; for 'A&B' web yields 'aandb' (the claim's example 'andb' is slightly off) vs mobile 'a and b'; (2) the fallback table only fires when a Category row omits commissionRate, which per mobile's own comment (commission_calculator.dart:141-145) every live category supplies. Real, code-level, minor.
- **Frontend-side verification:** Frontend verified. lib/commission.ts:84-90 normalizeCategoryName does .toLowerCase().replace(/&/g, 'and') (no added spaces) before replace(/[^a-z0-9]+/g, ' ') - exactly as cited. Trivial example nit: 'A&B' normalizes to 'aandb' on web (claim wrote 'andb'), but the substance stands: for '&' names without surrounding spaces the keys diverge (e.g. 'Art&Crafts' -> web 'artandcrafts' -> 0.1 fallback vs a spaced key match at 0.12), while spaced canonical names normalize identically. Minor is right.

### 🟡 Minor · partial — Epoch-seconds timestamps are not parsed on mobile

**ID:** `biz-logic:BIZLOG-16` · **Area:** Timestamps - epoch seconds

**Impact:** Any endpoint returning second-granularity stamps renders on mobile as dates ~54,000 years in the future (deadlines, windows, countdowns), breaking time-gated logic for those payloads.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/lib/time.ts:48 - numeric values < 1_000_000_000_000 are treated as epoch seconds and multiplied by 1000
- **Mobile evidence:** D:/Projects/Global_Expats/GloboExpats_Mobile/lib/domain/time_utils.dart:27-34 - numeric input is read as epoch millis only; string handling accepts 13-digit millis but not 10-digit seconds
- **Mobile-side verification:** Parsing gap is real: time_utils.dart:27-31 treats any num as epoch MILLIS and :33-36 accepts only a 13-digit string; there is no seconds branch, while web lib/time.ts:48 multiplies values < 1e12 by 1000. Searched for any 10-digit handling: none. But the claimed impact is arithmetically wrong: a 10-digit epoch-seconds value (~1.7-1.8e9) read as millis renders ~Jan 1970 — dates ~55 years in the PAST, so deadlines/windows/countdowns appear long EXPIRED (overdue/overstayed states), not '~54,000 years in the future'. Minor kept.
- **Frontend-side verification:** Frontend verified. lib/time.ts:48 in parseBackendTimestamp: `const normalized = value < 1_000_000_000_000 ? value * 1000 : value` - numeric values below 1e12 are treated as epoch seconds, per the documented contract (36-39). Exactly as cited; minor is right.

### 🟡 Minor · divergent — Rejected-reason display diverges: code-prefixed string and different no-reason copy

**ID:** `biz-logic:BIZLOG-17` · **Area:** Payments - rejection reason copy

**Impact:** Buyers see the raw status code prefixed to the reason and slightly different support copy on mobile, an inconsistent message for a sensitive payment-failure state.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/lib/buyer-payment-recovery.ts:48-52 - getPaymentRejectionReasons yields receipt.rejectionReason?.trim() || 'No reason was provided. Contact support.'
- **Mobile evidence:** D:/Projects/Global_Expats/GloboExpats_Mobile/lib/screens/my_payments_screen.dart:332-337 - rejectionLabel renders '$code — $reason' and falls back to 'No reason provided - contact support.'
- **Mobile-side verification:** Verified my_payments_screen.dart:332-338 rejectionLabel returns '$code — $reason' when a free-text reason exists and 'No reason provided - contact support.' (or the bare code) otherwise; web buyer-payment-recovery.ts:48-52 returns receipt.rejectionReason?.trim() || 'No reason was provided. Contact support.' with no code prefix. So mobile shows e.g. 'AMOUNT_MISMATCH — ...' where web shows the plain reason, and the no-reason copy differs ('No reason provided' vs 'No reason was provided'; '-' vs '.'). Minor kept.
- **Frontend-side verification:** Frontend verified. lib/buyer-payment-recovery.ts:48-52 getPaymentRejectionReasons maps rejected receipts to receipt.rejectionReason?.trim() || 'No reason was provided. Contact support.' - no code prefix, exact fallback copy as claimed. Minor is right.

### 🟡 Minor · partial — 30-minute payment-review OVERDUE state is not computed on the mobile buyer surface

**ID:** `biz-logic:BIZLOG-18` · **Area:** Payments - review-overdue state

**Impact:** Buyers waiting longer than the 30-minute SLA get no 'review is overdue' signal on mobile, and mobile admins lose the client-side overdue derivation when the backend flag is absent.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/lib/payment-timing.ts:1,59-66 - PAYMENT_REVIEW_LIMIT_MS 30 min and isPaymentReviewOverdue (server flag or submittedAt+30min); D:/Projects/Global_Expats/GloboExpats_Frontend/components/pending-actions-banner.tsx:107 - buyer banner counts overdue reviewable payments; admin-payments-tab.tsx:125-128 uses it too
- **Mobile evidence:** D:/Projects/Global_Expats/GloboExpats_Mobile/lib/screens/my_payments_screen.dart:287-305 - groupOf maps every PAYMENT_SUBMITTED payment to PaymentGroup.pending with no elapsed-time/overdue branch; admin_payments_review_screen.dart:234 only renders the backend-provided row['overdue'] flag with no client fallback
- **Mobile-side verification:** Verified groupOf (my_payments_screen.dart:287-305) maps every PAYMENT_SUBMITTED/under-review payment to PaymentGroup.pending with no elapsed-time branch; the only 'overdue' Duration in that file is the 48-hour correction window (:580-586), not the 30-min review SLA. Admin queue renders only the backend flag: admin_payments_review_screen.dart:234 "row['overdue'] == true ? ' · overdue' : ''" with no submittedAt+30min client fallback; grep shows no PAYMENT_REVIEW_LIMIT/30-min logic anywhere in mobile lib. Web payment-timing.ts:59-66 (server flag OR submittedAt+30min) confirmed. Minor kept.
- **Frontend-side verification:** Frontend verified. lib/payment-timing.ts:1 PAYMENT_REVIEW_LIMIT_MS = 30 * 60 * 1000; isPaymentReviewOverdue at 59-66 (server overdue flag wins, else submittedAt + 30 min). Consumed at components/pending-actions-banner.tsx:107 (overdue count of reviewable payments) and components/admin/admin-payments-tab.tsx:125-128 (OVERDUE grouping, plus 432/476/577). All as cited; minor is right.

### 🟡 Minor · partial — trip.deliveryTimeStatus label surface ('Buyer confirmed' / 'Needs new time' / 'Waiting for buyer') missing

**ID:** `biz-logic:BIZLOG-19` · **Area:** Orders - trip time-confirmation state

**Impact:** When a transporter proposes a new delivery time, mobile buyers/sellers cannot see whether the buyer confirmed, declined, or is pending - the rescheduling state is invisible in the mobile order view.

- **Frontend evidence:** D:/Projects/Global_Expats/GloboExpats_Frontend/app/orders/[id]/page.tsx:757-764 - deliveryTimeStatusLabel maps trip.deliveryTimeStatus BUYER_CONFIRMED/BUYER_DECLINED/trip-present to 'Buyer confirmed'/'Needs new time'/'Waiting for buyer'
- **Mobile evidence:** Grep of D:/Projects/Global_Expats/GloboExpats_Mobile/lib for deliveryTimeStatus/'Buyer confirmed'/'Needs new time' returns no model or UI match; Order.fromJson (lib/models/order.dart:259-312) parses no trip/deliveryTimeStatus fields (nearest is the AWAITING_BUYER_CONFIRMATION status label at order.dart:427)
- **Mobile-side verification:** Grep of mobile lib/ for deliveryTimeStatus, 'Buyer confirmed', 'Needs new time': zero model or UI hits. Order.fromJson (order.dart:259-312) parses no trip/deliveryTimeStatus object — the only adjacent string is the generic AWAITING_BUYER_CONFIRMATION status label 'Waiting for buyer to confirm the new time' (order.dart:427), a different surface. proposedDeliveryTime appears solely in the transporter's own trip dashboard (delivery_dashboard_screens.dart:246), not the buyer/seller order view, so rescheduling state (confirmed/declined/pending) is invisible on mobile order detail. Web app/orders/[id]/page.tsx:757-764 mapping confirmed. Minor kept.
- **Frontend-side verification:** Frontend verified. app/orders/[id]/page.tsx:757-764 deliveryTimeStatusLabel: trip?.deliveryTimeStatus === 'BUYER_CONFIRMED' -> 'Buyer confirmed', 'BUYER_DECLINED' -> 'Needs new time', any trip -> 'Waiting for buyer', else 'Not assigned' - exactly the four labels claimed. Minor is right.

<details><summary><strong>Confirmed equivalent in both apps (17)</strong></summary>

- Commission algebra is an exact port: grossTargetRate=(t+sc*(1+st*(1+vat)))/(1-sc*(1+vat)), multiplier 1+(gross+st)*(1+vat), forward ceil-to-1000 / reverse floor-to-1000 with <=0 fallback, category fallback table + 0.10 default (D:/Projects/Global_Expats/GloboExpats_Frontend/lib/commission.ts vs D:/Projects/Global_Expats/GloboExpats_Mobile/lib/domain/commission_calculator.dart).
- Seller payout inference and breakdown-from-amounts with smart rounding match, and the mobile sell wizard/edit listing render the same money rows (GloboExpats commission, Selcom fee) and submit the same pricing fields (commission.ts:233-277; sell_wizard_screen.dart:1032-1131,1369-1408; edit_listing_screen.dart:186-213).
- Delivery fare ladder, bands and mode tables match verbatim including banner copy (delivery-fare.ts vs delivery_fare.dart), and the 8-reason quote failure taxonomy with 20s watchdog -> CALCULATION_TIMEOUT is ported (checkout_screen.dart:307-322; delivery_quote.dart).
- EAT delivery-window math matches: Africa/Dar_es_Salaam fixed UTC+3, six Today/Tomorrow x Morning/Afternoon/Evening composites (10-12/12-16/16-20), production-time pushout applied to dates, past-window filtering and a re-check at review time (checkout-delivery-windows.ts vs delivery_windows.dart:28-31,97-148; checkout_screen.dart:112-124,364-373,876).
- Preferred-window payload shape and the 'Earliest · <date>' day label match (delivery_windows.dart:114-119,243-254 vs checkout-delivery-windows.ts:64-76).
- Proforma/payment countdown semantics match: countdown visible only while PENDING_PAYMENT, urgent under 3h, dedicated expired state telling the buyer to re-order (countdown.dart vs payment-countdown/proforma-countdown).
- Proforma creation parity: identical buy-details payload, 0.01 grand-total mismatch guard with cancel+resync, authoritative unit prices, and the same per-code failure copy for ACCOUNT_BLOCKED / INSUFFICIENT_STOCK / BUYER_PROFILE_SETUP_FAILED (checkout_proforma.dart:81-234 vs checkout-content.tsx:1683,1815-1842).
- Payment methods v2 match: MOBILE_MONEY and BANK_TRANSFER with identical Selcom receiving details (account 5527108094688 / 7003 9305, GloboExpats Limited) - payment-confirmation-step.tsx:43-69 vs checkout_screen.dart:1104-1113; the web's CASH-only list is legacy-only, not a divergence.
- Buyer payment-recovery grouping precedence (confirmed > expired > submitted > rejected) and correction-deadline precedence (explicit > rejectedAt+48h > max receipt stamps+48h) match (my_payments_screen.dart:283-305; escrow.dart:96-114 vs buyer-payment-recovery.ts, payment-timing.ts).
- Escrow view state machine priority order (REFUNDED > REFUND_PENDING > escrowPending > RELEASED > HELD x status > PENDING) is a faithful port (escrow.dart).
- Order status normalization (upper-case, spaces/dashes->underscores, legacy CONFIRMED->COMPLETED) and the full per-role label maps including 'Waiting for buyer to confirm the new time' match (order.dart:380-462 vs order-status.ts).
- Production-time model matches: max production days across cart items, remaining/overdue formatting rounding hours up, and the ProductionTimeCard states (production_time.dart, production_time_card.dart vs web).
- Pending-actions classifier is a branch-for-branch port of the web's order-notification-actions (pending_actions.dart).
- Delivery OTP and rental handoff code handling matches: buyer-visible delivery code while IN_TRANSIT, rental handoff code while AWAITING_PICKUP, regenerate endpoint wired (orders_screen.dart:452-458,775-790; delivery_dashboard_screens.dart:126-146; api_client.dart:2052).
- Transport-requirement model exists on the seller/listing side with the same EXEMPT rules for rentals and real-estate and REQUIRED/OPTIONAL otherwise, submitted with the listing (sell_form_state.dart:539-543; sell_wizard_screen.dart:1141,1226; edit_listing_screen.dart:225-226) - the gap is only the checkout-side resolution (BIZLOG-03).
- The 17-currency TZS-anchored static rate table values are identical to the web's default table (currency.dart:28-45); the divergence is live refresh only (BIZLOG-12).
- Null delivery-fee rendering ('To be confirmed') exists in mobile checkout states (checkout_screen.dart:1577,1633) matching the web's display for unquoted fees, independent of the missing cross-region policy (BIZLOG-04).

</details>


## Account gates: verification, addresses, payout/payment-method setup

### 🟠 Major · divergent — Verification hub has no staged flow: no organization/work-email question steps, no buyer tier, no signed-out gate, no verified-state CTA

**ID:** `account-gates:ACCOUN-01` · **Area:** Verification hub flow

**Impact:** Mobile collapses the web's guided gating conversation into one form page. Buyers are never told they need no vendor verification, signed-out users are shown a submission form they cannot successfully use, and verified users get no marketplace hand-off button.

- **Frontend evidence:** GloboExpats_Frontend/app/account/verification/page.tsx:38 - step machine useState('organization'); page.tsx:173-241 - organization/work-email/role steps with Yes/No cards; page.tsx:246-268 - buyer terminal card 'No vendor verification needed' with Browse/Return buttons; page.tsx:94 - signed-out 'Sign in to continue' card
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/verification_hub_screen.dart:124-221 - single page that renders verified/pending states then the vendor form plus a collapsed org-email TextButton toggle; no question steps, no buyer terminal state; verification_hub_screen.dart:53-54 - tokenless load returns {} which renders the form (no sign-in prompt); lib/app_router.dart:49-57 - '/account/verification' absent from _gatedRoutes so signed-out users see the application form instead of a login gate
- **Mobile-side verification:** Verified in full (verification_hub_screen.dart, 350 lines): single FutureBuilder page; verified branch (125-129) is icon+text with no CTA/hand-off; tokenless _load returns {} (53-54) which falls into the form branch (139); '/account/verification' absent from _gatedRoutes (app_router.dart:49-57). Searched lib/ for 'work email|workEmail|vendor|No vendor|buyer tier|do you work|organization steps' - only a doc comment at verification_hub_screen.dart:10. No step machine, no question cards, no buyer terminal state anywhere.
- **Frontend-side verification:** Frontend evidence exact: app/account/verification/page.tsx:38 useState<ConversationStep>('organization'); :173-214 organization + work-email Yes/No VerificationChoice steps; :224-243 role step (Vendor/Seller vs Buyer); :246-267 buyer terminal card 'No vendor verification needed' with 'Browse the marketplace' (/browse) + 'Return to homepage' (/); :88-108 signed-out 'Sign in to continue' card with /login?redirect=/account/verification; :110-124 verified state with 'Go to marketplace' hand-off button. Major is right: this staged gating conversation is the primary account gate.

### 🟠 Major · BROKEN — NATURAL_VERIFIED seller application is rendered as pending instead of verified

**ID:** `account-gates:ACCOUN-02` · **Area:** Verification status model

**Impact:** A seller approved via the backend's NATURAL_VERIFIED path (the same path web treats as fully verified) sees 'Application natural_verified.' with an hourglass on mobile. Users believe they are still under review and may re-contact support or distrust their seller access.

- **Frontend evidence:** GloboExpats_Frontend/app/account/verification/page.tsx:79-82 - applicationIsVerified = status === 'VERIFIED' || status === 'NATURAL_VERIFIED'; isVerified then shows the verified state
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/verification_hub_screen.dart:125 - verified branch requires status == 'VERIFIED' only; lines 130-138 - NATURAL_VERIFIED falls into the else-if and renders hourglass 'Application natural_verified.' pending copy
- **Mobile-side verification:** verification_hub_screen.dart:125 gates the verified state on status == 'VERIFIED' only; NATURAL_VERIFIED falls into the else-if (130-134) rendering hourglass 'Application natural_verified.' pending copy. Grep 'NATURAL_VERIFIED|natural' across lib/ returns only two doc comments (api_client.dart:889, verification_hub_screen.dart:14) - no normalization maps it to VERIFIED before display.
- **Frontend-side verification:** page.tsx:79-82 is verbatim as claimed: applicationIsVerified = application ? status === 'VERIFIED' || status === 'NATURAL_VERIFIED' : true; isVerified = Boolean(verificationStatus?.isFullyVerified && applicationIsVerified). So web presents a NATURAL_VERIFIED application as verified ('Your account is verified' at :110-124), never as pending. Major is right: mobile showing an approved-via-NATURAL_VERIFIED seller an hourglass pending view is a user-visible status error on a trust-critical screen.

### 🟠 Major · missing — REJECTED/BLOCKED follow-up answer flow (reviewNote response) is absent

**ID:** `account-gates:ACCOUN-03` · **Area:** Verification review loop

**Impact:** A rejected seller on mobile is dead-ended: they cannot answer the review team's question, so the application can never return to PENDING, and they get no support route. On web this is the only way a rejected application recovers.

- **Frontend evidence:** GloboExpats_Frontend/app/account/verification/page.tsx:151-170 - REJECTED/BLOCKED renders VerificationFollowUp when reviewNote exists, else 'Needs Information' with Contact support (/contact); components/account/verification-follow-up.tsx submits POST /seller-verification/{requestId}/response returning the application to PENDING
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/verification_hub_screen.dart:130-138 - every non-VERIFIED application (rejected/blocked included) gets the same hourglass 'Application {status}.' view; reviewNote is never read, no response form exists, and no support-contact path is offered
- **Mobile-side verification:** Searched lib/ for reviewNote, '/response', seller-verification follow-up, VerificationFollowUp, 'Needs Information' - zero hits. api_client.dart has only fetchSellerVerification (:915), submitSellerVerification (:926) and the admin queue (:1116); no per-application response endpoint. verification_hub_screen.dart:130-138 renders every non-VERIFIED status (REJECTED/BLOCKED included) as the same hourglass pending view; no support-contact path offered from that state.
- **Frontend-side verification:** page.tsx:148-169: REJECTED/BLOCKED renders <VerificationFollowUp application={application}> when reviewNote exists, else 'Needs Information' StatusView with 'Contact support' -> /contact (:161-162) and 'Back to marketplace' (:163-164). verification-follow-up.tsx:24-49 enforces >=3 chars and calls apiClient.respondToSellerVerification(application.requestId, normalized), which is POST /api/v1/seller-verification/{requestId}/response (lib/api.ts:3082-3086) returning the application to review. Major is right: it is the only recovery path for a rejected application.

### 🟠 Major · partial — Org-email path is a bare email+OTP pair: no organization select, organization never persisted, no personal-domain diversion, weak email validation

**ID:** `account-gates:ACCOUN-04` · **Area:** Organization email verification

**Impact:** Personal-email diversion (the edge case that keeps self-verification honest) and organization persistence for the review team are lost; a gmail/yahoo address that the web would divert into manual review can proceed through the org-email OTP on mobile, weakening the verification gate.

- **Frontend evidence:** GloboExpats_Frontend/components/account/organization-email-verification.tsx:63-66 - personal-domain emails get 'That looks like a personal email' toast and onAlternative() diversion to seller review; :74 - saves organization via apiClient.editProfile({organization}) before requesting OTP; OrganizationSelect offers a curated org combobox with manual entry; email validated by full regex
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/verification_hub_screen.dart:232-240 - plain 'Organization email' TextField only (no org selector, and the chosen organization is never saved to the profile); :284 - validation is only `email.isEmpty || !email.contains('@')` (no regex, no personal-domain blocklist); :251-257 - OTP entered in one TextField rather than six auto-advancing boxes
- **Mobile-side verification:** The org-email section is entirely verification_hub_screen.dart:231-349: plain 'Organization email' TextField (232-240), validation only `email.isEmpty || !email.contains('@')` (284), single OTP TextField (251-257). The hub never calls editProfile (organization never persisted) and its only API calls are the four seller-verification/org-OTP methods. Grep for personal-domain diversion ('personal email|gmail|yahoo|OrganizationSelect') found only the unrelated register-screen signup regex (register_screen.dart:296).
- **Frontend-side verification:** organization-email-verification.tsx:61-68: isLikelyPersonalEmail(email) (blocklist at lib/seller-verification.ts:74+ incl. gmail.com) -> toast 'That looks like a personal email' + onAlternative() (diverts to role step per page.tsx:219). :72-79 saves organization via apiClient.editProfile({organization}) (exact at :74) before requestOrganizationEmailOtp. :226-231 OrganizationSelect placeholder 'e.g. UNICEF, Embassy, NGO'; organization-select.tsx:267/332/379-383 confirms curated combobox with manual 'Add Organization' entry. Email regex at :53. Major is right: these are the gate-integrity mechanisms (diversion + org persistence) the mobile path skips.

### 🟠 Major · divergent — No client-side verification gate anywhere: no Verification Required popup, no buy/sell capability checks, no dashboard Get-Verified panel, sell CTA unconditional

**ID:** `account-gates:ACCOUN-06` · **Area:** Client-side verification gating

**Impact:** Unverified users walk the entire sell wizard (or buyer/contact flows) on mobile and only discover they are blocked when the backend rejects the final submission, with no 'Start Verification' hand-off. Web intercepts the action up front and routes to /account/verification.

- **Frontend evidence:** GloboExpats_Frontend/components/verification-popup.tsx:1-63 - 'Verification Required' dialog with Maybe Later / Start Verification; components/product-actions.tsx:147,230 - checkVerification('buy') before purchase actions, :546-548 - popup mounted; app/expat/dashboard/page.tsx:2825-2833 - 'Verify your account to start selling' panel with 'Get Verified' button in the Selling tab; lib/verification-utils.ts:31-33 - capability model (canUserBuy/canSell/canContact)
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/delivery_dashboard_screens.dart:542-550 - MySpace 'Sell an item' FilledButton unconditionally context.push('/sell'); lib/screens/sell/sell_wizard_screen.dart - no verification check exists in the wizard (grep for verification/verified/canSell returns nothing); lib/widgets/api_error_view.dart:49-50 - the only enforcement surface is the backend 'seller not verified' message mapping shown after a failed action
- **Mobile-side verification:** Grep canSell|canUserBuy|checkVerification|'Verification Required'|'Get Verified'|'Start Verification' across lib/: canUserBuy appears only as a comment in product_detail_screen.dart:96-97 whose gate is sign-in only ('verification NEVER blocks buying'). delivery_dashboard_screens.dart:542-550 'Sell an item' unconditionally context.push('/sell'); grep 'verif' in sell/ and the dashboard returns only AU-040 test-verifier comments and the delivery handover-code card. Only enforcement surface is api_error_view.dart:49 'seller not verified' mapping. No popup, no capability checks, no Get Verified panel.
- **Frontend-side verification:** All four citations verified: verification-popup.tsx:1-63 'Verification Required' dialog with 'Maybe Later'/'Start Verification' (-> /account/verification); product-actions.tsx:147 and :230 both `if (!checkVerification('buy')) return` (addToCart/buyNow) and :546-548 <VerificationPopup .../> mounted; app/expat/dashboard/page.tsx:2818-2834 `{!canSell ? (...)}` panel 'Verify your account to start selling' + 'Get Verified' -> /account/verification; lib/verification-utils.ts:31-51 canUserBuy (Boolean(user)) / canUserSell / canUserContact. Major is right: mobile losing all up-front gating is a user-visible flow divergence.

### 🟠 Major · missing — Entire working-hours feature missing: schedule card, weekly-hours form, closure calendar, timezone select, blocking setup prompt, and all working-schedule APIs

**ID:** `account-gates:ACCOUN-07` · **Area:** Working schedule

**Impact:** Mobile sellers can never set weekly hours, timezone, or closures. Web blocks sellers from continuing until hours are saved (the hours feed buyer delivery-date promises); on mobile the gate and the feature are both absent, so schedules stay unconfigured and delivery-date reliability diverges from web-configured sellers.

- **Frontend evidence:** GloboExpats_Frontend/components/account/seller-schedule-card.tsx:1-114 - 'Working hours' card with Edit/Set hours and reload on seller-working-schedule-saved; seller-schedule-form.tsx - weekly form with validateSchedule rules and overnight logic; seller-closure-calendar.tsx - 366-date closure cap; components/account/seller-schedule-setup-prompt.tsx:50,67-70 - 60s-polling non-dismissible blocking prompt; app/account/settings/page.tsx embeds the card for sellers; APIs GET/PUT /userManagement/working-schedule + /timezones
- **Mobile evidence:** GloboExpats_Mobile - grep for working-schedule/workingSchedule across lib/ returns zero hits; lib/api/api_client.dart contains no working-schedule or timezones methods (only payout/address/user endpoints); SettingsScreen pills are Profile/Payout/Addresses only (lib/screens/account_misc_screens.dart:583-597) with no schedule section anywhere
- **Mobile-side verification:** Grep -i for working-schedule|workingSchedule|WorkingSchedule|timezones|workingHours|seller-schedule across lib/ returns zero app-code hits (only unrelated 'closure' code comments). api_client.dart has no working-schedule or timezone methods. SettingsScreen segments are exactly Profile/Payout/Addresses (account_misc_screens.dart:583-597). Feature wholly absent.
- **Frontend-side verification:** seller-schedule-card.tsx is exactly 114 lines: 'Working hours' card (:66-76), 'Edit hours'/'Set hours' by status.configured (:74), reload on 'seller-working-schedule-saved' (:62), 'Retry loading hours' (:80). seller-schedule-form.tsx:49 calls validateSchedule (lib/seller-schedule.ts:45-56, incl. 'Choose at least one working day.' and next-day overnight overlap at :56) with overnight recomputed at :139/:153. seller-closure-calendar.tsx 366-date cap (:13,:56,:93). seller-schedule-setup-prompt.tsx:50 window.setInterval(check, 60_000) and :67-73 non-dismissible (onOpenChange noop, hideCloseButton, escape/outside prevented). settings/page.tsx:972-977 embeds SellerScheduleCard for sellers. APIs at lib/api.ts:2790-2805 (working-schedule GET/PUT + /timezones). Major is right: whole feature + blocking gate absent.

### 🟠 Major · missing — Blocking payout setup prompt and prompt-status check are absent

**ID:** `account-gates:ACCOUN-08` · **Area:** Payout setup gate

**Impact:** A mobile seller with live listings and no payout method is never forced to add one, unlike web where the blocking modal stops them. Payout setup is left to chance, delaying or breaking seller payments after a sale.

- **Frontend evidence:** GloboExpats_Frontend/components/account/seller-payout-setup-prompt.tsx:63-66 - non-dismissible dialog that closes only on successful save, driven by GET /userManagement/payout-details/prompt-status ({hasListings, configured, shouldPrompt}); lib/payout-details.ts:14-18 - SellerPayoutPromptStatus type; components/account/account-setup-prompts.tsx:20-21 - mounted in the app-wide cascade
- **Mobile evidence:** GloboExpats_Mobile - grep for prompt-status/promptStatus/shouldPrompt across lib/ returns zero hits; lib/screens/payout_details_screen.dart:253-265 - an empty payout list renders only static 'No payout details yet.' text with no gating, and nothing checks whether a seller with listings has configured a payout destination
- **Mobile-side verification:** Grep -i for prompt-status|promptStatus|shouldPrompt|payout-setup|setupPrompt across lib/ returns zero hits; the only matches are e2e/au060_verify_r14.js:153-156, a harness script that checks the backend API response shape, not app UI. payout_details_screen.dart:253-265 empty state is static text; nothing anywhere checks hasListings/configured/shouldPrompt or blocks a seller.
- **Frontend-side verification:** seller-payout-setup-prompt.tsx:47-49 opens on apiClient.getSellerPayoutPromptStatus() where setIsOpen(status.hasListings && !status.configured && status.shouldPrompt); :62-70 non-dismissible dialog (cited 63-66, actual 62-70: hideCloseButton, escape/pointer/interact prevented); closes only via onSaved -> setIsOpen(false) (:96); header copy 'Set up your payout method' / 'Your seller payments will be sent here...' (:77-82) and privacy note (:93). lib/payout-details.ts:14-18 SellerPayoutPromptStatus {hasListings, configured, shouldPrompt} exact; account-setup-prompts.tsx:20-22 mounts it in the cascade suppressed by profile/schedule blocking. Major is right: money-adjacent setup gate.

### 🟠 Major · missing — Non-dismissible profile-completion modal (WhatsApp phone + address + pin gate with snooze/suppression rules) is absent

**ID:** `account-gates:ACCOUN-09` · **Area:** Profile completion gate

**Impact:** Web hard-gates every signed-in user into saving a valid WhatsApp number and delivery address before continued use; mobile has no equivalent, so accounts drift through the app with missing/unvalidated contact and address data that checkout and buyer-seller contact depend on.

- **Frontend evidence:** GloboExpats_Frontend/components/profile-completion-modal.tsx:153-154 - needsPhone/needsAddress computed from profileHasPhone/profileHasAddress; :171-172 - modal visible while any need is unmet; :286 - isValidInternationalPhone validation with country-code error; :583 - location name maxLength 40; :40 - 7-day pin-prompt snooze key; :143 - addressLookupFailed suppression; components/account/account-setup-prompts.tsx:15-21 - app-wide cascade ordering
- **Mobile evidence:** GloboExpats_Mobile - grep for ProfileCompletion/needsPhone/needsAddress across lib/ returns zero hits; lib/screens/shell.dart contains no phone/address prompt (grep for phone returns nothing); the only phone/address capture is the per-checkout address step in lib/screens/checkout_screen.dart, which never persists a validated WhatsApp number to the profile
- **Mobile-side verification:** Grep -i for ProfileCompletion|needsPhone|needsAddress|profileHasPhone|profile-completion across lib/ returns zero hits. Grep phone|whatsapp|address|prompt|modal in shell.dart returns only doc comments about the section switcher. The only WhatsApp/address capture is the profile form (optional, unvalidated) and the per-checkout address step; no app-wide gate, snooze, or suppression logic exists.
- **Frontend-side verification:** Every described behavior verified in profile-completion-modal.tsx, though several cited line numbers are drifted: needsPhone/needsAddress are at :175-176 (not 153-154) derived from profileHasPhone/profileHasAddress (:172-173); shouldPrompt = isLoggedIn && user && !authLoading && !isChecking && !addressLookupFailed && (needsPhone || needsAddress || needsLocationPin) at ~:183-189 with setIsOpen(true) at :275-281; addressLookupFailed state at :165 (not 143); snooze key 'globo_location_prompt_snoozed_until' + 7*24h MS at :150-151 (not 40); non-dismissible via hideCloseButton={!isDismissable} + escape/outside prevention at :480-486. Citations that are exact: :286 isValidInternationalPhone with 'Enter a complete WhatsApp number using its correct country code.' (:287), :583 maxLength={40}, :393 syncSellerProductsForDefaultAddress; cascade ordering account-setup-prompts.tsx:15-22. Severity major is right (hard gate); only the stale line refs keep this from being a perfect citation, the description itself is accurate.

### 🟠 Major · missing — Payout rows have no Edit, Delete, or Make-default actions; API client lacks the delete and set-primary endpoints

**ID:** `account-gates:ACCOUN-10` · **Area:** Payout method management

**Impact:** A mobile seller cannot correct a wrong account number, remove a stale method, or choose which destination is primary - the field that decides where sale money is sent. Primary is display-only on mobile, so payouts can keep flowing to an outdated destination with no in-app remedy.

- **Frontend evidence:** GloboExpats_Frontend/components/account/seller-payout-row.tsx:82-94 - 'Make default' (setPrimary), Edit and Delete buttons per row (with primary-delete confirmation copy); frontend exposes PUT /userManagement/payout-details/{id}/primary and DELETE /userManagement/payout-details/{id} (9.22-9.23)
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/payout_details_screen.dart:189-236 - _row renders icon, label, 'Primary' pill and account text only; no buttons anywhere on the row; lib/api/api_client.dart:934-961 - ApiClient has only fetchPayoutDetails and savePayoutDetails (PUT collection/{id}); no delete or set-primary method exists; _sheet(existing) (line 67) is only ever called with null (line 179), so the update path is dead code
- **Mobile-side verification:** Verified: payout_details_screen.dart _row (189-236) renders icon/label/Primary pill/account text with zero buttons; _sheet is called only with null (header Add, :179) so the detailsId update path (:140, api_client.dart:953-955) is dead code. api_client.dart payout section (934-961) contains only fetchPayoutDetails and savePayoutDetails - no delete, no set-primary endpoint anywhere.
- **Frontend-side verification:** seller-payout-row.tsx:74-107 (cited 82-94 covers the Make-default/Edit region): 'Make default' only on non-primary with aria-label `Make ${methodLabel} default` (:83), Edit, red Delete, all disabled={busy}; api.ts:2771 PUT /api/v1/userManagement/payout-details/{detailsId}/primary and :2777 DELETE /api/v1/userManagement/payout-details/{detailsId} both exist. Major is right: choosing/correcting the payout destination is money-critical seller functionality.

### 🟠 Major · missing — Saved card wallet is absent: /account/payment-methods is a static informational screen with no CRUD

**ID:** `account-gates:ACCOUN-12` · **Area:** Payment methods (cards)

**Impact:** Users cannot view, add, or remove saved payment methods on mobile at all; the gated route implies functionality that does not exist.

- **Frontend evidence:** GloboExpats_Frontend/app/account/payment-methods/page.tsx:54-80 - fetches GET /api/payment-methods on mount and POSTs new cards from an add dialog, with per-card delete confirm (9.29-9.31)
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/account_misc_screens.dart:1095-1127 - PaymentMethodsScreen is a StatelessWidget rendering two hardcoded ListTiles ('Mobile money', 'Card (CARD)') plus a gateway disclaimer; no API call, no saved-method list, no add/delete; route /account/payment-methods is gated (lib/app_router.dart:55) yet leads only to this static content
- **Mobile-side verification:** Verified: PaymentMethodsScreen (account_misc_screens.dart:1095-1127) is a StatelessWidget with two hardcoded ListTiles ('Mobile money', 'Card (CARD)') and a gateway disclaimer - no state, no fetch, no add/delete. Grep payment-methods|api/payment|saved card|add card across lib/ returns only the router entries (app_router.dart:55,246) and this screen; api_client.dart has no payment-methods methods.
- **Frontend-side verification:** app/account/payment-methods/page.tsx:54-68 fetch('/api/payment-methods', {cache:'no-store'}) on mount (cited 54-80 region also holds the POST add at :77-89 with 'Payment method added' toast), :98 DELETE /api/payment-methods/${id}, and the per-card confirm 'Remove card?' / 'This action cannot be undone and you will need to add this card again...' at :209-217. Major is right: the whole saved-card wallet is a user-facing feature mobile reduces to static text.

### 🟠 Major · missing — Changing the default address never syncs seller listing pickup locations (POST /products/sync-location)

**ID:** `account-gates:ACCOUN-13` · **Area:** Default address side effects

**Impact:** On web, moving your default pickup pin propagates to eligible listings so buyers see correct pickup locations; on mobile the listings keep the old pin, feeding the delivery-setup 'needs attention' state that hides listings from buyers until manually repaired per listing.

- **Frontend evidence:** GloboExpats_Frontend/app/account/addresses/page.tsx:73 and app/account/settings/page.tsx:128 - call syncSellerProductsForDefaultAddress after set-default; components/profile-completion-modal.tsx:393 - same on profile save; lib/seller-location-sync.ts:4 + lib/api.ts:4108 - POST /api/v1/products/sync-location with result toasts describing updated/failed listings
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/addresses_screen.dart:394-409 - _setDefault only calls _api.setDefaultAddress then shows a snackbar and reloads; grep for sync-location/syncLocation across lib/ returns zero hits and ApiClient has no sync-location method
- **Mobile-side verification:** Verified: addresses_screen.dart _setDefault (394-409) calls only _api.setDefaultAddress then snackbar + reload. Grep -i for sync-location|syncLocation|syncSellerProducts|products/sync across lib/ returns zero hits and api_client.dart has no such method. No listing pickup-location propagation exists on mobile.
- **Frontend-side verification:** addresses/page.tsx:71-78 syncDefaultLocation -> syncSellerProductsForDefaultAddress (cited :73 lands inside it); settings/page.tsx:126-134 identical helper (cited :128); profile-completion-modal.tsx:393 same call on profile save; lib/seller-location-sync.ts:4 exports syncSellerProductsForDefaultAddress -> apiClient.syncSellerProductLocation(addressId, false); lib/api.ts:4105-4116 POST /api/v1/products/sync-location with body {addressId, applyToAllProducts:false}; describeProductLocationSync toasts at seller-location-sync.ts:13-22. Major is right: stale pickup pins feed the delivery-setup 'needs attention' state that hides listings from buyers.

### 🟡 Minor · divergent — Application form validation diverges: full name optional, productTypes minimum length dropped, empty referralOther silently omitted

**ID:** `account-gates:ACCOUN-05` · **Area:** Seller application validation

**Impact:** Mobile submits applications web would reject: one-character product descriptions, personal applications with no name, and OTHER referrals with no source text - degrading the data the review team relies on and creating web/mobile acceptance inconsistencies.

- **Frontend evidence:** GloboExpats_Frontend/components/account/vendor-verification-flow.tsx:52 - submit blocked unless sellerName.trim() non-empty for BOTH seller types; :217 - submit disabled while productTypes.trim().length < 3; :55 - empty referralOther blocked with 'Tell us where you heard about GloboExpats' toast
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/verification_hub_screen.dart:65 - productTypes validated as non-empty only (no 3-char minimum); :69 + :84-85 - BUSINESS requires businessName but PERSONAL fullName is optional and only sent when non-empty; :80-81 - when OTHER is chosen with a blank referralOther it is silently omitted instead of blocked
- **Mobile-side verification:** Verified exactly as claimed in verification_hub_screen.dart: productTypes checked trim().isEmpty only (65, no 3-char min); BUSINESS requires businessName (69) but PERSONAL fullName is unvalidated and only sent when non-empty (84-85); OTHER with blank referralOther is silently omitted from the body (80-81) with no blocking error. Minor severity is fair.
- **Frontend-side verification:** vendor-verification-flow.tsx:52: submit returns early unless sellerName.trim() non-empty for BOTH types; :53-59: OTHER with empty referralOther blocked with toast 'Tell us where you heard about GloboExpats' (title at :55); :217: disabled={submitting || !sellerName.trim() || productTypes.trim().length < 3}. Minor is right: it is a validation/data-quality divergence, not a missing user-facing feature.

### 🟡 Minor · partial — Payout form skips provider requirement and all account-number format rules; default method and edit-mode selector behavior diverge

**ID:** `account-gates:ACCOUN-11` · **Area:** Payout form validation

**Impact:** Mobile accepts payout methods the web would bounce (empty provider, malformed bank/mobile numbers), producing bad payout records and inconsistent validation between platforms; the different default method also nudges users onto a different payout rail.

- **Frontend evidence:** GloboExpats_Frontend/lib/payout-details.ts:81-99 - validatePayoutDetails requires provider >= 2 chars, accountName >= 2, bank number regex 4-34 chars, Lipa/mobile 4-20 digits after stripping separators; components/account/payout-details-form.tsx:38 - default method BANK_ACCOUNT; method selector hidden read-only while editing; helper 'Use the exact name and number registered with the bank or telecom provider'
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/payout_details_screen.dart:106-126 - providerName field has no validator at all; accountName/accountNumber only check non-empty ('Required'); no length/format validation for bank (4-34) or Lipa/mobile (4-20 digit) numbers; :71-72 - default method is MOBILE_MONEY not BANK_ACCOUNT; :95-104 - method dropdown stays editable when editing an existing method (web shows it read-only)
- **Mobile-side verification:** Verified in payout_details_screen.dart: provider TextFormField (106-110) has no validator; accountName/accountNumber validators are non-empty only (117-118, 125-126); no 4-34/4-20 format rules anywhere; default method is existing value else 'MOBILE_MONEY' (71-72); the method DropdownButtonFormField (95-104) stays editable while editing. Minor severity appropriate.
- **Frontend-side verification:** lib/payout-details.ts:81-99 validatePayoutDetails exact: providerName <2 / accountName <2 -> '{label} is required.'; BANK_ACCOUNT regex /^[A-Za-z0-9][A-Za-z0-9 ./-]{3,33}$/ -> '4 to 34 letters or digits'; Lipa/mobile strips [\s()-] then /^\+?\d{4,20}$/. payout-details-form.tsx:38 payoutMethod: editingMethod || 'BANK_ACCOUNT' (exact), and :86-93 while editing the selector is replaced by a read-only panel showing payoutMethodLabel(editingMethod) instead of PayoutMethodSelector. Minor is right: validation-strictness divergence.

### 🟡 Minor · partial — Address sheet lacks the 'Set as default address' checkbox (save-and-set-default in one step)

**ID:** `account-gates:ACCOUN-14` · **Area:** Address dialog

**Impact:** Users must save the address and then find the card action to make it default - two steps instead of one, and a new address silently stays non-default, diverging from web behavior where adding with the checkbox immediately updates the default (and, via ACCOUN-13's missing sync, listing locations).

- **Frontend evidence:** GloboExpats_Frontend/app/account/addresses/page.tsx:373 - 'Set as default address' checkbox in the dialog; :149,158 - setDefault called with the saved/edited addressId after save; app/account/settings/page.tsx:1326-1334 - same checkbox and post-save setDefault
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/addresses_screen.dart:285-337 - sheet has only the Save/Update button; no default checkbox; default can only be set afterwards via the per-card 'Set default' action (:573-578)
- **Mobile-side verification:** Verified: the shared add/edit sheet (addresses_screen.dart:114-343) contains label, suggestion chips, map picker, manual fallback fields, resolved-address box and a single Save/Update button - no 'Set as default' checkbox. Default is only settable afterwards via the per-card 'Set default' TextButton (573-578, rendered only for non-default cards). Minor severity appropriate.
- **Frontend-side verification:** addresses/page.tsx:366-374 'Set as default address' Checkbox in the dialog (cited :373 is the Label); post-save setDefaultAddress exactly at :149 (edit path: `await setDefaultAddress(editingAddressId)` then syncDefaultLocation) and :158-159 (add path: `if (formData.isDefault && result?.addressId)` -> setDefaultAddress(result.addressId)). settings/page.tsx:1322-1338 same checkbox gated to `{!editingAddressId && ...}` (add-only), with post-save setDefault at :322-334. Minor is right: two-step default election vs web's one-step.

### 🟡 Minor · partial — WhatsApp number is saved without E.164 validation and the profile payload omits phoneNumber (plus name/location/street fields web sends)

**ID:** `account-gates:ACCOUN-15` · **Area:** Profile phone handling

**Impact:** Malformed WhatsApp numbers save silently on mobile (web rejects with a country-code error), and because mobile never writes phoneNumber, any backend surface that reads the plain phone field diverges for mobile-edited accounts.

- **Frontend evidence:** GloboExpats_Frontend/app/account/settings/page.tsx - save payload sends firstName, lastName, joined 'name', phoneNumber AND whatsAppPhoneNumber both set to the phone, location, aboutMe, organization, position, street (3.28); lib/international-phone.ts - isValidInternationalPhone E.164 /^\+[1-9]\d{7,14}$/ with dedicated error copy (3.16/5.2); profile-completion-modal.tsx:286 - same validation at gate time
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/account_misc_screens.dart:784-792 - WhatsApp TextFormField has keyboardType phone and a helper line but no validator; :537-549 - editProfile payload sends only firstName, lastName, whatsAppPhoneNumber, aboutMe, organization, position - phoneNumber, name, location and street are never written, so an account lacking phoneNumber stays lacking it after any mobile profile edit
- **Mobile-side verification:** Verified: WhatsApp TextFormField (account_misc_screens.dart:784-792) has keyboardType phone and a helper line but no validator; the editProfile payload (537-549) sends only firstName, lastName, whatsAppPhoneNumber, aboutMe, organization, position - no phoneNumber, name, location or street. Grep for isValidInternationalPhone|E.164|hasPassword|international-phone across lib/ returns zero hits. Minor severity appropriate.
- **Frontend-side verification:** settings/page.tsx:512-526 save payload sends firstName, lastName, joined name, phoneNumber AND whatsAppPhoneNumber both = profileData.phone, location, aboutMe, organization, position, street, zipCode, with email deliberately excluded (comment :528-530). lib/international-phone.ts:60-63 isValidInternationalPhone enforces E.164 ('E.164 allows at most 15 digits. Eight is the shortest practical complete number.'); profile-completion-modal.tsx:286-287 applies the same check at gate time with the country-code error copy. Minor is right: silent-save of malformed numbers + field drift.

### 🟡 Minor · divergent — Current password is always required; web makes it optional for passwordless (social/OAuth) accounts

**ID:** `account-gates:ACCOUN-16` · **Area:** Password change

**Impact:** A mobile user who registered via Google (no password) cannot set an initial password from the app - the form demands a current password that does not exist, whereas web lets them set one.

- **Frontend evidence:** GloboExpats_Frontend/app/account/settings/page.tsx:147 - requiresCurrentPassword = userProfile?.hasPassword !== false; :1544 - label switches to 'Current Password (optional)' when the account has no password, and the API accepts the change without currentPassword
- **Mobile evidence:** GloboExpats_Mobile/lib/screens/account_misc_screens.dart:1007-1012 - SecurityScreen current-password TextFormField validator rejects empty with 'Enter your current password' unconditionally; hasPassword is never consulted (no hasPassword reference in the file)
- **Mobile-side verification:** Verified: SecurityScreen current-password TextFormField (account_misc_screens.dart:1006-1012) rejects empty with 'Enter your current password' unconditionally; grep for hasPassword across lib/ returns zero hits, so passwordless (Google-registered) accounts cannot set an initial password from mobile. Minor severity appropriate.
- **Frontend-side verification:** settings/page.tsx:147 `const requiresCurrentPassword = userProfile?.hasPassword !== false` (exact); :1542-1544 Label switches to 'Current Password (optional)' when hasPassword === false; :1556 `required={requiresCurrentPassword}`; description copy at :1535-1537 'Set a password for your account so you can log in with email and password.' Minor is right: a passwordless-account edge case, user-visible but narrow.

#### Second-pass candidates (8) — unverified

_Found by an independent re-audit of this domain (different inventory pass). Not adversarially verified; wording may overlap a canonical gap above._

- **🟠 Major · BROKEN — Any API error in account-gate flows clears the session (handleUnauthorized called for every ApiException, not just 401)**
  - Impact: A 400/409/500 (e.g. payout-save validation failure, duplicate seller-verification application, transient address API error) logs the mobile user out mid-flow instead of just showing the error, unlike web where only a dead token ends the session.
  - FE: GloboExpats_Frontend/app/account/verification/page.tsx:62-67 - status-lookup failure is swallowed ('The organization-email path remains usable if status lookup is temporarily unavailable') and the page continues; verification/address/payout errors surface as inline messages or toasts without dropping the session (hooks/use-addresses.ts destructive toasts; follow-up toast at verification-follow-up.tsx:43).
  - MO: GloboExpats_Mobile/lib/auth/auth_store.dart:248-251 - handleUnauthorized() clears the session unconditionally whenever authenticated (no status inspection); GloboExpats_Mobile/lib/screens/payout_details_screen.dart:142-143, GloboExpats_Mobile/lib/screens/addresses_screen.dart:330-331,387,404, GloboExpats_Mobile/lib/screens/verification_hub_screen.dart:93 - every 'on ApiException' branch calls AuthStore.instance?.handleUnauthorized() regardless of e.unauthorized.
- **🟠 Major · partial — Payout-details validation reduced to 'Required' - all format/length rules missing**
  - Impact: Malformed bank/Lipa/mobile-money numbers reach the backend from mobile; errors the web catches inline arrive as backend failures (which additionally log the user out per ACCOUN-10), and dirty data can end up in the payout destination.
  - FE: GloboExpats_Frontend/lib/payout-details.ts:81-95 - validatePayoutDetails: provider/accountName trimmed >=2 chars else '{label} is required.'; BANK_ACCOUNT number regex ^[A-Za-z0-9][A-Za-z0-9 ./-]{3,33}$ ('4 to 34 letters or digits'); LIPA/MOBILE_MONEY strip [\s()-] then ^\+?\d{4,20}$ ('4 to 20 digits'); maxLengths 120/120/64 on the form fields (inventory 3.11).
  - MO: GloboExpats_Mobile/lib/screens/payout_details_screen.dart:112-126 - provider field has no validator at all; accountName and accountNumber validators are only (v == null || v.trim().isEmpty) ? 'Required' : null; no maxLength, no regex, no digit checks.
- **🟡 Minor · missing — Verification, payout-details and verify-email routes are not even auth-gated; unauthenticated users see the form instead of a sign-in redirect**
  - Impact: Unauthenticated deep-links show a seller-verification form that can never submit (generic 'Could not submit your verification.') instead of routing to login, mirroring web's guest redirect.
  - FE: GloboExpats_Frontend/app/account/verification/page.tsx (guest view, inventory 1.4) - 'Sign in to continue' with Sign in button to /login?redirect=/account/verification.
  - MO: GloboExpats_Mobile/lib/app_router.dart:49-57 - _gatedRoutes omits /account/verification, /account/payout-details, /verify-email and /notifications; GloboExpats_Mobile/lib/screens/verification_hub_screen.dart:53-54 - _load() returns const {} when token is null, so the unauthenticated deep-link renders the full 'Verify to start selling' submit form whose submit then fails (AuthStore.instance!.token! at :91).
- **🟡 Minor · partial — Application submit validations are weaker: productTypes >=3 not enforced, referral OTHER free text optional, PERSONAL fullName optional**
  - Impact: Mobile can submit applications with a 1-2 char product description, an OTHER referral with no detail, or no name at all for personal sellers - data the review team expects, producing weaker applications or backend rejections.
  - FE: GloboExpats_Frontend/components/account/vendor-verification-flow.tsx:52-53 - submit blocked unless sellerName.trim() and productTypes.trim() (>=3 chars per inventory 2B/3.1); :53 - referralSource==='OTHER' && !referralOther.trim() blocks submit with destructive toast.
  - MO: GloboExpats_Mobile/lib/screens/verification_hub_screen.dart:61-74 - productTypes checked only for non-empty ('Please describe what you plan to sell.'); :80-81 - referralOther included only 'if (_referral == 'OTHER' && text.isNotEmpty)' with no requirement; :84-85 - fullName sent only when non-empty, never required for PERSONAL.
- **🟡 Minor · partial — Pending/needs-info views lose web copy and context: no loggingEmail/business name, no applicantResponse variant, no Contact support path**
  - Impact: Mobile users in review get less context about which application is under review and have no in-app route to support when more information is needed.
  - FE: GloboExpats_Frontend/app/account/verification/page.tsx:110-166 - pending view varies by applicantResponse ('We received your answer...' vs 'You cannot submit another application while this one is pending.'), shows loggingEmail and businessName||fullName; needs-info without reviewNote renders 'Contact support' -> /contact and 'Back to marketplace'.
  - MO: GloboExpats_Mobile/lib/screens/verification_hub_screen.dart:130-138 - single generic block for every non-VERIFIED status showing only status word and 'You submitted "{productTypes}"'; no email, no name, no contact-support action, no verified-state marketplace action.
- **🟡 Minor · divergent — Method picker and per-method labels diverge: free dropdown (default MOBILE_MONEY) vs required radio choice; label tuples differ**
  - Impact: Mobile pre-selects mobile money (risk of wrong-method submissions) and uses different field labels/examples than web, so the same user sees inconsistent guidance; method remains changeable in the (currently dead) edit path where web locks it.
  - FE: GloboExpats_Frontend/components/account/payout-method-selector.tsx:19-49 - radio fieldset 'Choose how you want to be paid' with no default; GloboExpats_Frontend/lib/payout-details.ts:51,62-66,72-76 - labels 'Bank name', 'Telecom provider' / 'Business or account name' / 'Lipa number', 'Mobile money number' with examples; editing locks the method (inventory 2.24/8.14).
  - MO: GloboExpats_Mobile/lib/screens/payout_details_screen.dart:48-52 - _methods tuples: LIPA_NUMBER -> ('Lipa number','Provider','Registered name','Lipa number'), MOBILE_MONEY account number labelled 'Phone number'; :76-77 - method defaults to 'MOBILE_MONEY' when adding; :86-95 - DropdownButtonFormField always editable, no lock-when-editing and no radio UI.
- **🟡 Minor · partial — Settings shipping-addresses section lacks the 5-per-page pagination**
  - Impact: Users with many addresses scroll an unbounded embedded list on mobile; cosmetic/UX only.
  - FE: GloboExpats_Frontend/app/account/settings/page.tsx:96,211-214 - PROFILE_ADDRESS_PAGE_SIZE = 5 with page-sliced dot pagination in the Shipping Addresses section.
  - MO: GloboExpats_Mobile/lib/screens/account_misc_screens.dart:625 - the Addresses pill renders AddressBookSection(embedded: true) as one unpaginated list (addresses_screen.dart renders Column of all cards, no paging).
- **🟡 Minor · partial — Empty address book has no call-to-action button**
  - Impact: First-time mobile users must find the header 'Add New' button themselves; minor onboarding polish loss.
  - FE: GloboExpats_Frontend/app/account/addresses/page.tsx:509-513 - empty card 'No addresses saved' with 'Add Your First Address' button.
  - MO: GloboExpats_Mobile/lib/screens/addresses_screen.dart:449-456 - empty state is a bordered container with only the text 'No shipping addresses saved.' and no action.

<details><summary><strong>Confirmed equivalent in both apps (19)</strong></summary>

- Address book CRUD parity: list/add/update/delete with the same endpoints (GET get-addresses, POST add-address, PUT update-address/{id}, DELETE delete-address/{id}) and a delete confirmation AlertDialog - mobile lib/screens/addresses_screen.dart:321-327, 359-392 vs frontend hooks/use-addresses.ts + app/account/addresses/page.tsx
- Set-default action on non-default cards only, POST set-default-address?addressId= with success snackbar and reload - mobile addresses_screen.dart:394-409, 573-578 vs frontend addresses page 2.9
- Address label suggestion chips Home/Shop/Office filling the preferred-location-name field - mobile addresses_screen.dart:147-155 vs frontend addresses page 2.11
- Map pin picker parity: search autocomplete, tap-to-pin, draggable marker, use-current-location (high accuracy, 12s), placeName captured only from search/Place-Details (never raw tap/GPS), and a no-API-key muted notice that never blocks the form - mobile lib/widgets/map_location_picker.dart + addresses_screen.dart:176-205 vs frontend components/location/map-pin-picker.tsx (8.6)
- Pin hard-required when maps are configured with matching copy ('Pin your location...' / 'Location not recognised - adjust the pin until the street, region and country fill in.') - mobile addresses_screen.dart:293-304 vs frontend 3.23
- Address request body is exactly the backend AddressDTO (label/street/region/country/placeName/latitude/longitude, no city/phoneNumber keys) for both create and edit - mobile addresses_screen.dart:309-319 vs frontend 3.24
- Payout details list rendering: three methods (BANK_ACCOUNT/LIPA_NUMBER/MOBILE_MONEY) with per-method field labels, Primary pill on the primary row, empty/error/loading states - mobile lib/screens/payout_details_screen.dart:48-52, 189-270 vs frontend seller-payout-details.tsx + seller-payout-row.tsx
- Payout create/update via PUT /userManagement/payout-details (and PUT .../{detailsId} for update) - mobile lib/api/api_client.dart:951-961 vs frontend lib/payout-details.ts API surface
- Seller verification application: same 6 referral options and values, Personal/Business split, referralOther field shown only for OTHER, productTypes required, POST /api/v1/seller-verification with businessName/fullName mapping, submit spinner, pending/verified states with distinct icons - mobile verification_hub_screen.dart:43-50, 60-104, 125-138 vs frontend vendor-verification-flow.tsx 3.7-3.13
- Org-email OTP against the same endpoints POST /email/sendOTP?organizationalEmail= and POST /email/verifyOTP with send-to-resend relabel and inline status message coloring - mobile verification_hub_screen.dart:243-273, 276-349 vs frontend 3A/9B
- Seller-only payout section gating: Payout pill rendered only when roleName == SELLER, matching web showPayout = isSeller() - mobile account_misc_screens.dart:588-592 vs frontend 4.9
- Profile Information fields: first/last name, read-only email with static green 'Verified' badge (static on both platforms), WhatsApp number, About Me, Organization + Position - mobile account_misc_screens.dart:752-773 vs frontend settings 3.26 (verified badge confirmed static at settings/page.tsx:911)
- Avatar upload via multipart PATCH editProfile and DELETE deleteProfileImage with busy-disabled delete button - mobile lib/api/api_client.dart:718-750 vs frontend 3.27/9.1
- Unsaved-changes Save/Discard machinery driven by field edits, discard re-applies the load snapshot - mobile account_misc_screens.dart:524-574 vs frontend settings 2.22/2.14
- Change password via PUT /userManagement/changePassword with min-8 new password and match confirmation - mobile account_misc_screens.dart:958-1012 vs frontend 3.29
- Login gating on sensitive routes with returnUrl redirect (checkout/orders/addresses/payments/settings) matching web RouteGuard - mobile lib/app_router.dart:49-76 vs frontend RouteGuard
- Checkout address-gate repair loop: 'Fix delivery address' button on buyer-fixable proforma failures pushes /account/addresses and reloads on return - mobile lib/screens/checkout_screen.dart:1685-1691 vs frontend checkout address handling
- Sell wizard pickup-address picker shares the address book with an 'Add an address' escape hatch - mobile lib/screens/sell/sell_wizard_screen.dart:650, 670-713 vs frontend sell flow's address book usage
- Buyer payments panel with rejection reason, 48-hour correction countdown and re-upload flow (CORRECTION_WINDOW_CLOSED handling) - mobile lib/screens/my_payments_screen.dart 2.22/2.43 vs frontend rejected-proof payments view 8.8

</details>

---

## Coverage sweeps — items flagged (25)

These come from the route-level sweep (web pages vs registered mobile screens) and the hidden-affordance sweep (modals/dialogs/share-copy actions). They are ordered by severity:

- **🔴 CRITICAL — Payment receipt upload (images/PDF) on the payment-confirmation step** — In checkout step 3, the buyer can attach up to 5 proof-of-payment files (JPEG/PNG/WebP/PDF, 5MB each) with client-side compression before submitting the proforma payment. Mobile: the payment step only submits typed transaction reference strings — there is no file/receipt upload affordance anywhere in the flow.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/components/checkout/receipt-upload.tsx:3-22 (limits + compression), wired into app/checkout payment-confirmation step and apiClient.uploadPaymentReceipts
  - MO: Searched mobile lib for receipt / upload / proof / attachment. screens/payment_screen.dart:61-68 calls submitPayment with transactionReferences only (TextEditingController text); no image_picker use in the payment flow (image_picker is used only for listings and request images).
- **🟠 Major — /transporter — driver's trips console missing entirely on mobile** — Web /transporter is the TRANSPORTER-role console: RouteGuard + role check, apiClient.getTransporterTrips() scoped server-side to the caller, active-trip list with TransporterTripCard (mark delivered, buyer details, directions). Mobile has NO route for /transporter, no getTransporterTrips in lib/api/api_client.dart, and no TRANSPORTER role handling anywhere. The similarly-named DeliveryTrackingScreen (lib/screens/delivery_dashboard_screens.dart:20) is a per-order 'Track delivery' view pushed from OrderDetailScreen for buyer/seller — it does not cover the driver persona. SCOPE.md claims '/transporter | Transporter / delivery tracking | ✅' — that checkmark is backed only by the wrong screen.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/app/transporter/page.tsx (157 lines, whole implementation); trip data via apiClient.getTransporterTrips(), status gate on roles[].roleName === 'TRANSPORTER'.
  - MO: Register a gated '/transporter' GoRoute in D:/Projects/Global_Expats/GloboExpats_Mobile/lib/app_router.dart rendering a new TransporterTripsScreen; add getTransporterTrips + mark-delivered to lib/api/api_client.dart; reuse the trip-card pattern from TransporterTripCard; add TRANSPORTER to the role check used in shell.dart AccountScreen.
- **🟠 Major — /account/payment-methods — mobile screen is a static placeholder, no card CRUD** — Web page does real payment-method management: GET /api/payment-methods, POST to add a card, DELETE /api/payment-methods/{id}, with default/expiry fields. Mobile PaymentMethodsScreen (lib/screens/account_misc_screens.dart:1095) is a StatelessWidget rendering two hardcoded ListTile blurbs ('Mobile money', 'Card') with zero API calls — it cannot list, add, or delete a saved method. SCOPE.md claims ✅; the claim is not backed by real functionality.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/app/account/payment-methods/page.tsx lines 54-100: fetch('/api/payment-methods') GET/POST and DELETE by id.
  - MO: Convert PaymentMethodsScreen to a StatefulWidget backed by GET/POST/DELETE /api/payment-methods in lib/api/api_client.dart (the /account/payment-methods route is already registered in app_router.dart, so only the screen body is missing).
- **🟠 Major — Seller 'Payments received' panel (inside /expat/dashboard) has no mobile counterpart** — Web /expat/dashboard renders PaymentsReceivedPanel (money the seller has received from buyers) alongside MyPaymentsPanel (the buyer's own submissions). Mobile MySpace (ExpatDashboardScreen, lib/screens/delivery_dashboard_screens.dart:435) has tabs Overview/Selling/Buying/Saved/Requests; its Buying>payments sub-view is MyPaymentsScreen — the BUYER's payment submissions only. A grep of the whole mobile lib finds no payments-received / seller-earnings view at all, so the seller's finance money-in visibility exists only on web. (Seller payout-details config IS covered: /account/payout-details + embedded section in SettingsScreen.)
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/components/dashboard/payments-received-panel.tsx, mounted from app/expat/dashboard/page.tsx (line ~112 import).
  - MO: Add a 'Received' sub-view to the MySpace Buying tab (or Selling tab) in lib/screens/delivery_dashboard_screens.dart, backed by the same payments endpoint MyPaymentsScreen's PaymentsApi uses, filtered to sales where the user is the seller.
- **🟠 Major — Product share sheet (ShareProductModal + lib/product-share)** — On the product detail page, a Share button opens a dialog with copy-to-clipboard of a formatted product message, plus channel buttons (Facebook, Instagram via navigator.share, WhatsApp, LinkedIn, Pinterest, email) that open external share windows. Mobile: the product detail app-bar share icon only shows a SnackBar 'Share this product with a friend.' — it never shares anything.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/components/share-product-modal.tsx:135-197 (copy, navigator.share, window.open per channel), trigger on app/product/[id]/page.tsx:829; lib/product-share.ts:91-107 builds the channel URLs
  - MO: Searched mobile lib for share / share_plus / Share / clipboard / wa.me / url_launcher. Evidence of the stub: D:/Projects/Global_Expats/GloboExpats_Mobile/lib/screens/product_detail_screen.dart:356-362. pubspec.yaml has no share_plus package; only real external opens are wa.me seller-contact (product_detail_screen.dart:715) and support (home_screen.dart:75).
- **🟠 Major — Verification-required popup gating buy/contact (VerificationPopup + use-verification)** — When a signed-in-but-unverified user taps buy actions on a product (add to cart / buy now), a modal 'Verification Required' blocks the action and routes to /account/verification; the route guard shows the same gate on verification-required routes. Mobile: buy/checkout is ungated (no verification check before cart/checkout), and nudge is gated by login only.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/components/verification-popup.tsx:20-63; gates at components/product-actions.tsx:147,230 and components/route-guard.tsx:119; hook logic in hooks/use-verification.ts:93-148
  - MO: Searched mobile lib for canSell / verificationStatus / 'verify your account' / Verification required. Only hits are data fields (cart_store.dart, seller_grouping.dart) and the verification hub screens; no gate around product actions or checkout in product_detail_screen.dart / cart_screen.dart / checkout_screen.dart.
- **🟠 Major — Forced profile-completion modal (phone + address + map pin, with snooze)** — A global non-dismissible dialog appears for logged-in users missing a WhatsApp number or delivery address (hideCloseButton, escape/outside-click prevented); it captures an international phone, reverse-geocoded address and map pin, syncs seller listings to the new location, and the optional location-pin step can be snoozed for 7 days via localStorage. Mobile: phone/address are only collected inline at checkout/registration and in the address book — there is no proactive prompt, no forced gate, no snooze.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/components/profile-completion-modal.tsx:146-180 (prompt conditions), 442-475 (non-dismissible + 7-day snooze key 'globo_location_prompt_snoozed_until')
  - MO: Searched mobile lib for 'complete your' / 'complete profile' / 'add your address' / 'pin your location' / snooze. Only address-book pin help text (screens/addresses_screen.dart:295) and an unrelated register toast; shell.dart has no global prompt/banner.
- **🟠 Major — Global pending-actions banner + desktop notifications opt-in** — A banner pinned under the header on every page polls every 60s and surfaces the single most urgent outstanding commerce step (admin payment review, rejected/unfinished proforma, seller fulfillment, buyer confirm receipt/delivery, continue payment) with a CTA link; an 'Alert me' button requests browser Notification permission and mirrors new alerts as OS desktop notifications while the tab is hidden. Mobile: nothing equivalent — no persistent act-now banner in the shell, and no push/local notification capability at all.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/components/pending-actions-banner.tsx:62-71,145-192; hooks/use-desktop-alerts.ts:97-130 (Notification.requestPermission + new Notification), opt-in key 'globoexpats:desktop-alerts:enabled'
  - MO: Searched mobile lib for banner / snackbar / toast / flushbar / notification / firebase / local_notifications. Mobile has a SnackBar system and a notifications feed screen (account_misc_screens.dart:20), but shell.dart/home_screen.dart render no alert banner and pubspec.yaml contains neither firebase_messaging nor flutter_local_notifications.
- **🟠 Major — Transporter contact + WhatsApp delivery-location share on the order detail page** — On the buyer/seller order detail page, once a trip/transporter exists, the page shows Call (tel:), WhatsApp chat with the driver, and a 'Share location' button that opens a pre-composed wa.me message containing order id, destination, notes, Google Maps pin link and proposed delivery time. Mobile: the order detail screen has none of these — no tel:, no wa.me, no maps link for the transporter or destination.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/app/orders/[id]/page.tsx:585-600 (buildDeliveryWhatsAppUrl), 1407-1446 (Call / WhatsApp / Share location buttons); lib/delivery-share.ts:50-105
  - MO: Searched mobile lib for wa.me / tel: / whatsapp / maps / launchUrl inside screens/orders_screen.dart — zero matches (only delivery-code UI and a tracking screen push).
- **🟠 Major — Rich nudge compose dialog (attach listing / post-first handoff / service offer / edit)** — Responding to a request opens a dialog where the seller picks 'Already posted' (search own listings or paste a product link/ID to attach) or 'Post it first' (persists a pending-nudge intent in sessionStorage and resumes to /sell?requestNudge=1 to auto-send after publishing), or composes a SERVICE_OFFER (provider name, area, WhatsApp contact, consent checkbox, note); it pre-fills and edits an existing nudge. Mobile: the request detail nudge button fires a one-tap POST with the default generic message — no product attach, no service-offer form, no post-first handoff, no edit.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/components/request-board/nudge-dialog.tsx:79-91 (predefined messages), 279-369 (modes, intent save, service offer); intent handoff lib/request-nudge-intent.ts:18-39
  - MO: Searched mobile lib for nudge / nudgeRequest. screens/requests_screen.dart:418-421 (button), 439-462 (_nudge calls _api.nudgeRequest(token, _id) with no body — api/api_client.dart:1354 supports productId but the UI never passes one); no sessionStorage-equivalent intent handoff found.
- **🟡 Minor — Seller transporters registry panel (inside /expat/dashboard) not ported** — Web dashboard includes SellerTransportersPanel (manage the seller's linked transporters) and AssignTransporterModal. Mobile has the assign-transporter modal (lib/widgets/assign_transporter_modal.dart, AU-057, wired into OrderDetailScreen) but no registry/management panel — assignment works per-order, managing the transporter list does not exist.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/components/dashboard/seller-transporters-panel.tsx, mounted from app/expat/dashboard/page.tsx.
  - MO: Low priority: the order-level assign flow exists. If ported, hang it off the MySpace Selling tab in lib/screens/delivery_dashboard_screens.dart reusing the transporters endpoint the web panel calls.
- **🟡 Minor — /statistics — no mobile route; only a partial Matomo block inside /insights** — Web /statistics is the full Matomo analytics console: 8 tabs (Overview, Audience, Technology, Content, Realtime, UserActivity, ProductAnalytics, Errors) with date-range/cache-TTL controls. Mobile registers no /statistics route; InsightsScreen (lib/screens/insights_screen.dart) embeds a Matomo section with only 5 datasets (visits/pages/countries/devices/search) plus trend cards. SCOPE.md claims '/statistics | ✅' — partially backed at best.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/app/statistics/page.tsx + app/statistics/components/* (8 tab components).
  - MO: If the checkmark must stand, either register /statistics → InsightsScreen (with a note that coverage is the 5-tab subset) or extend the Matomo block in lib/screens/insights_screen.dart with realtime/product tabs.
- **🟡 Minor — /insights/ceo|customers|growth|marketing|product|qa|sales — 7 section routes have no mobile screens** — Web has seven dedicated Matomo insights sections (each a separate page with its own chart sets, 650-1213 lines each). Mobile registers only /insights → a single InsightsScreen hub with trend cards; none of the seven section routes exist. SCOPE.md marks every section ✅, but the router backs only the hub.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/app/insights/{ceo,customers,growth,marketing,product,qa,sales}/page.tsx (recharts + useMatomo).
  - MO: Analytics, not core commerce — decide whether one aggregate hub satisfies parity or register /insights/:section deep links that select a tab in lib/screens/insights_screen.dart; at minimum correct SCOPE.md to 'hub only'.
- **🟡 Minor — /profiles — SCOPE ✅ not backed by a real screen on either platform** — The web /profiles page is itself a stub: ProfilesPageContent declares `allProfiles: any[] = []` with a `// TODO: Fetch seller profiles from backend API` — it renders an empty directory behind a RouteGuard. Mobile registers no /profiles route and no equivalent screen. SCOPE.md claims '/profiles | User profiles | ✅ (account/profile)' — there is no real commerce functionality on either side to have covered.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/app/profiles/page.tsx lines 53-63 (empty data + TODO).
  - MO: Nothing to port until web ships the backend fetch. Update SCOPE.md to mark /profiles as stub-on-web rather than ✅.
- **🟡 Minor — Admin console routes exist on mobile only as in-app drill-ins, and /admin/users is read-only** — Mobile registers only /admin, /admin/payments-review and /admin/ratings. The rest of the admin surface (AdminOrdersScreen, AdminUsersScreen, AdminListingsScreen, AdminMessagesScreen, AdminVerificationScreen in lib/screens/admin_orders_screen.dart + admin_sublist_screens.dart) is reachable only via the tab map inside AdminDashboard (lib/screens/admin_dashboard.dart:69), so none of /admin/dashboard?tab=…, /admin/orders, /admin/orders/[id], /admin/users, /admin/listings, /admin/verification, /admin/messages are deep-linkable. Depth also differs: mobile AdminUsersScreen/AdminListingsScreen are read-only lists while the web console has management actions (roles, category lifecycle, commission rates — AdminUsersTab, admin-categories-tab.tsx with disable/restore + rate editing). Web /admin/listings and /admin/verification are themselves placeholders, so those two are at parity.
  - FE: Web console: app/admin/dashboard/page.tsx (tab set incl. proformas + AdminCommissionCalculator) and components/admin/admin-users-tab.tsx / admin-categories-tab.tsx for the management actions.
  - MO: Register GoRoutes for the admin sub-screens (they are already built screens — just map paths in app_router.dart) and decide whether admin user/category/commission management is in mobile scope or gets an explicit out-of-scope note in SCOPE.md.
- **🟡 Minor — /checkout?proforma=<id> resume deep link not wired on mobile** — Web /checkout accepts ?proforma= to resume an active proforma (checkout-content.tsx builds ProformaCheckoutPayload from it). Mobile registers /checkout but the router builder passes only auth — CheckoutScreen never reads the query parameter, so a shared /checkout?proforma= link (or push notification) lands on a fresh checkout. Partial mitigation exists: the created proforma is persisted locally ('proforma_<id>' key) and can be resumed from My Payments, so the flow is recoverable but the deep link is not honored.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/app/checkout/checkout-content.tsx — useSearchParams-driven proforma resume + useProforma hook.
  - MO: In app_router.dart's /checkout builder, read state.uri.queryParameters['proforma'] and pass it into CheckoutScreen to jump straight to the payment step (the screen already has the proforma payload plumbing in lib/screens/checkout_screen.dart step 3).
- **🟡 Minor — Request-board dialog suite: fulfill choice (outside platform), fulfilled detail, view analytics** — Three owner affordances with no mobile counterpart: (1) FulfillChoiceDialog asks whether the request was fulfilled 'Through GloboExpats' (link an order) or 'Outside GloboExpats' (no order) — mobile only offers fulfill-with-listing and its own code comments the outside path is absent; (2) FulfilledDetailDialog shows what/who fulfilled a request with a View Product link; (3) RequestViewsDialog shows view analytics (total/unique/member/guest) plus a per-viewer list with emails and last-viewed dates.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/components/request-board/fulfill-choice-dialog.tsx:30-90, fulfilled-detail-dialog.tsx:21-153, request-views-dialog.tsx:40-151
  - MO: Searched mobile lib for fulfil / fulfill / views / analytics / 'mark as fulfilled'. screens/requests_screen.dart:284-302 — comment states 'Outside-platform fulfillment has no product picker on mobile'; no fulfilled-detail or view-analytics dialog anywhere (view tracking exists at api/api_client.dart:1340 but is write-only).
- **🟡 Minor — Nudge inbox for request owners (responder contacts)** — Web request owners get a nudge inbox panel/dialog listing everyone who nudged their request, including responder contact details for service offers. Mobile: fetchRequestNudges exists in the API client ('My nudges for own request incl. responder contacts') but is never called by any screen — REQUEST_NUDGE only appears as a generic item in the notifications feed.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/components/request-board/nudge-inbox.tsx (whole file), surfaced from request-card.tsx / request-list-view.tsx
  - MO: Searched mobile lib for nudge / fetchRequestNudges / inbox. api/api_client.dart:1398-1400 defines the endpoint; grep of screens/requests_screen.dart shows no call — no inbox UI.
- **🟡 Minor — Full-screen image preview with keyboard nav (product + request pages)** — Clicking a product or request image opens a fullscreen dark overlay (body scroll locked) with prev/next arrows, an index counter, Escape/arrow-key navigation and a loading state. Mobile: product images are a PageView carousel with dots — no tap-to-fullscreen, no zoom, no counter dialog.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/components/image-preview-modal.tsx:36-52 (keydown), 54-111 (overlay); mounted at app/product/[id]/page.tsx:1617 and app/request/[id]/page.tsx:804
  - MO: Searched mobile lib for InteractiveViewer / photo_view / fullscreen / Dialog / PageView in product_detail_screen.dart:624-666 — the _ImageCarousel has no onTap handler and no fullscreen route; pubspec has no photo_view.
- **🟡 Minor — Share request modal (copy link, WhatsApp, email)** — On the request detail page a Share button opens a dialog with copy-link-to-clipboard, a wa.me 'Share on WhatsApp' button and a mailto 'Send by email' button to recruit help for the request. Mobile: request detail has no share affordance at all.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/components/request-board/share-request-modal.tsx:21-107; mounted at app/request/[id]/page.tsx:690
  - MO: Searched mobile lib for share / wa.me / clipboard within screens/requests_screen.dart and create_request_screen.dart — no matches (clipboard appears only in the delivery dashboard).
- **🟡 Minor — Share seller profile modal (copy link + WhatsApp)** — On the seller storefront page (/seller/[id]) a share icon opens a dialog showing the absolute profile URL with a Copy button plus a 'Share on WhatsApp' button carrying a pre-written message. Mobile: the seller profile screen has no share affordance.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/components/seller/share-seller-profile-modal.tsx:25-124; mounted at app/seller/[id]/page.tsx:554
  - MO: Searched mobile lib screens/seller_profile_screen.dart for share / whatsapp / wa.me / tel: — zero matches; no share_plus in pubspec.yaml.
- **🟡 Minor — Platform guided tour (driver.js) with replay entry** — A step-by-step onboarding overlay (welcome card, then highlighted steps over search, currency selector, marketplace, sell/My Space, requests, cart, notifications, account menu) with variant scripts for logged-out / unverified / verified users, CTA buttons that navigate (Create account, Verify email), reduced-motion support, and replay from the account menu. Mobile: no onboarding, tour, or 'how it works' screen exists.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/components/platform-tutorial.tsx:91-318 (steps, driver config, goTo targets); provider at providers/tutorial-provider
  - MO: Searched mobile lib for tutorial / onboarding / tour / guide / driver — zero matches in screens, widgets, or pubspec dependencies.
- **🟡 Minor — Buyer-side copy-to-clipboard for delivery and rental handoff codes** — On web order detail, both the delivery-code card and the rental-handoff-code card have a copy button that writes the code to the clipboard with a toast, next to a generate-new-code action. Mobile: the buyer order detail renders the same code cards with regenerate, but no copy button — clipboard copy for codes exists only in the transporter delivery dashboard, not the buyer flow.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/components/orders/delivery-code-card.tsx:54 (navigator.clipboard.writeText) and components/orders/rental-handoff-code-card.tsx:43
  - MO: Searched mobile lib for Clipboard.setData — only screens/delivery_dashboard_screens.dart:332 (driver side); screens/orders_screen.dart:1256-1308 _DeliveryCodeCard renders code + optional regenerate with no copy action.
- **🟡 Minor — Transporter 'Navigate' Google Maps deep link on trip cards** — In the seller/transporter delivery dashboard, each pickup/dropoff stop with coordinates shows a Navigate button that opens Google Maps at the pin (target=_blank). The assign-transporter modal links the order location the same way. Mobile: the delivery dashboard screens never open external maps (google_maps_flutter is used only for the address picker).
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/components/transporter/transporter-trip-card.tsx:71-82 (Navigate via coordsToGoogleMapsUrl), assign-transporter-modal.tsx:279; lib/location-utils.ts:340-348
  - MO: Searched mobile lib for launchUrl / google.com/maps / Navigate. launchUrl appears only in account_misc_screens.dart:1226, admin_sublist_screens.dart:268, home_screen.dart:77, product_detail_screen.dart:717 — none in delivery_dashboard_screens.dart.
- **🟡 Minor — Admin order detail: WhatsApp party contact + share buyer/seller location** — On the admin order detail page, each Buyer/Seller panel offers a mailto/WhatsApp contact link and a 'Share [party] location' button that opens a wa.me message with the party's place, address and Google Maps link. Mobile: the admin orders screen has no contact or location-share affordances.
  - FE: D:/Projects/Global_Expats/GloboExpats_Frontend/app/admin/orders/[id]/page.tsx:209-225 (share button), 394-410 (buildPartyLocationWhatsAppUrl calls); lib/delivery-share.ts:81-105
  - MO: Searched mobile lib screens/admin_orders_screen.dart and admin_sublist_screens.dart for whatsapp / wa.me / share / maps — the only WhatsApp deep link in admin is the users list (admin_sublist_screens.dart:266-268); admin orders screen has none.

<details><summary><strong>Sweep method notes</strong></summary>

METHOD: 51 web routes from Glob(app/**/page.tsx), each peeked (head for the big files) for its commerce-relevant content; mobile truth taken from lib/app_router.dart plus the screens it imports (router registration alone was not trusted — every claimed screen was opened to check it is real, since several "✅" screens turned out to be static placeholders).

WEB ROUTE INVENTORY (one line each; C = commerce-relevant):
- / — landing: featured listings + category discovery rails (C entry point).
- /browse — marketplace feed: filters, neighbourhood/taxonomy strips, product-source toggle, add-to-cart (C).
- /search — query + filters + add-to-cart (C).
- /category/[slug] — static slug lookup that 302s to /browse?category= (C, trivial).
- /product/[id] — product detail: choice config, rental config, reviews, seller link, add-to-cart, per-viewer analytics (C).
- /cart — client-side cart: per-seller grouping, qty, save-for-later, recommendations (C).
- /checkout — 4-step (checkout-content.tsx, page.tsx is a dynamic wrapper): address/fulfillment, review with server delivery quotes + delivery windows, proforma creation (stock reserved, total guard), payment-confirmation step (Selcom receiving details, submit-payment), completion (C, critical area).
- /checkout/success — order result: platform payment details, escrow states, Matomo purchase tracking (C).
- /orders/[id] — order detail: payment countdown, escrow/refund states, dispatch gates, assign-transporter, delivery code, rental stages, ratings (C, critical area).
- /requests — request board feed, create via modal (C).
- /request/[id] — request detail: edit/close/delete, nudge, fulfill (with product or outside-platform), views, share (C).
- /sell — multi-step listing wizard: commission calculator, choice-specific pricing, rental editor, transport requirements/production time, request-nudge intent (C).
- /edit-listing/[id] — edit listing incl. images, choices, commission re-calc (C).
- /expat/dashboard — MySpace (4640 lines): seller listings, seller order management (confirm-availability, dispatch, assign transporter, payment countdown), My Payments panel, PaymentsReceived panel, seller transporters panel, rental calendar, saved, request-board tab (C, critical area).
- /transporter — TRANSPORTER-role driver console: own trips, mark delivered (C).
- /account — hub with order stats + links (C-adjacent).
- /account/settings — profile + SellerPayoutDetailsCard + SellerScheduleCard + address entries (C).
- /account/addresses — address CRUD, default, map pin, syncs seller product locations (C gate for checkout/sell).
- /account/payment-methods — saved-card CRUD via /api/payment-methods (C gate).
- /account/verification — org-email verification + vendor/seller verification application (gates selling) (C).
- /account/verification/otp — re-exports the verification page; exists only as a Matomo-tracked URL (no separate functionality).
- /seller/[id] — public seller profile + listings showcase + schedule (C).
- /notifications — user + admin notifications, request-nudge notifications, contact count (C-adjacent).
- /admin — redirect to /admin/dashboard; /admin/dashboard — full console (overview analytics cards, users, proformas, orders, listings, ratings, requests, transporters, commission calculator) (C).
- /admin/orders — redirect to ?tab=orders; /admin/orders/[id] — admin order detail: financial summary, seller payout destination, transporter assignment, dispatch, cancellation (C).
- /admin/users — user management tab; /admin/messages — contact inbox (read/delete/reply) (C-adjacent).
- /admin/listings, /admin/verification — placeholder pages ("will display… connect to backend") — stubs on web.
- /insights + /insights/{ceo,customers,growth,marketing,product,qa,sales}, /statistics — Matomo analytics dashboards (not core commerce).
- /login, /register (signup-OTP), /reset-password (3-step OTP), /verify-email (6-digit OTP) — auth gates (C gates).
- /about, /privacy, /terms, /contact, /help, /faq — marke

</details>

<details><summary><strong>Completeness-critic coverage statement</strong></summary>

critic failed

</details>
