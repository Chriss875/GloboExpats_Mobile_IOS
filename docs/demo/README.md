# GloboExpats Mobile — Feature Demonstration Reel

Assembled at campaign end from the per-unit Playwright recordings in
`e2e/videos/` (CAMPAIGN_V2 video-evidence requirement). One chapter per major
flow, per the campaign directive:

1. Guest discovery (home, browse, filters, search, product detail)
2. Buyer purchase end-to-end incl. payment (cart -> checkout -> proforma ->
   receipt upload -> submit-payment -> escrow states)
3. Multistage selling end-to-end (4-step wizard -> images -> commission ->
   publish)
4. Seller management (dashboard stats, listings mgmt, selling orders,
   transporter assignment)
5. Requests board (feed, create, nudge, owner fulfill/close/delete)
6. Delivery (trip tracking, delivery-code handoff, confirm receipt)
7. Insights (Matomo console) + Admin analytics suite (:8084 service)
8. Admin incl. escrow actions (payments review loop, order console, refunds)
9. Bugs found and fixed (before/after clips from verifier evidence)

Assembly: `ffmpeg-run` concat of compressed per-unit clips (<20 MB each);
raw captures are pruned after the reel lands (ORCHESTRATION section 3, 2 GB
cap). This file is updated with the final reel filename when AU-009 closes.
