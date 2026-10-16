# GloboExpats Mobile — Scope & Screen Inventory

**Scope changed 2026-08-20: EVERYTHING is now in scope** (all 51 web routes — admin, insights,
analytics/graph cards, AND payment/escrow/refunds). Never fake a payment success; test against the
sandbox. This is the finalized inventory (web route → mobile screen). Status: ✅ done · 🔨 in
progress · ⬜ todo.

## Auth & onboarding
| web route | mobile screen | status |
|---|---|---|
| /login | Login | ✅ |
| /register | Register | ✅ |
| /reset-password | Reset / forgot password | ✅ |
| /verify-email, /account/verification, /account/verification/otp | Account verification + OTP | ✅ |

## Home & discovery
| / | Home (hero, categories, featured) | ✅ |
| /browse, /marketplace | Browse / Marketplace | ✅ |
| /search | Search | ✅ |
| /category/[slug] | Category listing | ✅ |
| /product/[id] | Product detail | ✅ |

## Cart, checkout & orders (Critical Area — sandbox tested)
| /cart | Cart (client-side, mirror web) | ✅ |
| /checkout | Checkout — address + delivery-slot + proforma/order | ✅ |
| /checkout (delivery slot) | Delivery-slot selection + create order | ✅ |
| /checkout/success | Order result (honest) | ✅ |
| /orders/[id] | Order detail (pending/escrow state) | ✅ |
| /transporter | Transporter / delivery tracking | ✅ |
| payment/escrow | Payment step (real submit-payment, never fakes) | ✅ |

## Account & misc
| /account | Account / profile (orders, settings, admin, insights) | ✅ |
| /account/addresses | Addresses | ✅ |
| /account/payment-methods | Payment methods | ✅ |
| /account/settings | Settings | ✅ |
| /notifications | Notifications | ✅ |
| /orders | Orders list | ✅ |
| /profiles | User profiles | ✅ (account/profile) |
| /seller/[id] | Seller profile | ✅ |
| /requests, /request/[id] | Community request board + detail | ✅ |
| /contact,/faq,/help,/about,/privacy,/terms | Help / About (FAQ/contact/legal content) | ✅ |

## Seller
| /sell | Sell / list an item | ✅ |
| /edit-listing/[id] | Edit my listing | ✅ |
| /expat/dashboard | Expat seller dashboard | ✅ |

## Admin (ALL in scope)
| /admin, /admin/dashboard | Admin dashboard (+ analytics chart cards: Top Buyers by Clicks, sales/order/Proforma trends) | ✅ |
| /admin/listings | Admin listings | ✅ |
| /admin/orders | Admin orders list + detail | ✅ |
| /admin/users | Admin users | ✅ |
| /admin/messages | Admin messages | ✅ |
| /admin/verification | Admin verification | ✅ |

## Insights & analytics (ALL in scope; graphs render same data as web; analytics failures swallowed → empty)
| /insights | Insights hub (graph cards) | ✅ |
| /insights/ceo, /customers, /growth, /marketing, /product, /qa, /sales | Insights sections (graph cards) | ✅ |
| /statistics | Statistics (analytics, empty-safe) | ✅ |

## Hard rules (unchanged)
- Order creation through **delivery-slot selection** IN scope vs sandbox. Payment/escrow/refunds:
  build the real flow mirroring the web, TEST against sandbox; **never fake a success**.
- Every screen: build → Dart widget tests → Playwright harness (mobile+desktop) → vision →
  data vs sandbox. Commit+push after every unit.

## Verification status (2026-08-25, canonical e2e/results.jsonl)
X=25/66 acceptance units verified PASS+skeptic (Y=66 per plans/WAVE_PLAN.md).
Frozen lanes: :9113 @bca6414 · :9115 @97da1d8 (pricing fix) · :9114 matomo variant.
New since the last inventory revision:
| /edit-listing/[id] | EditListingScreen (prefilled, SPEC round-trip, promo>asking inverse) | ✅ built, verify queued |
| /account/saved | SavedItemsScreen grid + unsave | ✅ built |
| /admin analytics | Analytics suite on sandbox analytics svc (:8084) — summary/revenue/verification/top-clicked/cumulative cards | ✅ built |
| /account/verification | Org-email OTP path added to hub | ✅ built |
