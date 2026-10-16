// au049_terminal_rows.js — appends the MANDATED TERMINAL rows (verify + skeptic)
// to the canonical shards, incorporating v1/v2/v3 skeptic results and the
// real_data/parity corrections. APPEND ONLY — never clobbers prior lines.
const fs = require('fs');
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const BUILD_SHA = 'e694463', BUILD_MT = 'Wed, 26 Aug 2026 08:15:26 GMT';

const verifyRow = {
  ts: new Date().toISOString(),
  unit: 'AU-049', title: 'filters_availability_gridlist',
  wave: 'verify', agent: 'verifier-AU-049',
  build_sha: BUILD_SHA, build_mtime: BUILD_MT,
  viewport: '375x667+768x1024',
  verdict: 'FAIL',
  checks: {
    freshness: true,
    real_data: true,
    real_data_probe: 'unfiltered=647 band=312 likeNew=13 oyster=46 community=168 shops=479 nb=12 emptyCats=[Food & Groceries,Garden & Outdoors,Pet & Supplies]',
    images_requested: 275, images_200: 275, images_broken: [],
    buttons_total: 22, buttons_ok: 22, buttons_failed: [],
    state_asserts: 24, nav_asserts: 0, data_asserts: 6,
    vision_defects: 0, vision_findings: ['zero rendering defects across all 20 r14 PNGs read natively at both viewports; defect evidence is behavioral'],
    parity: { blocker: 0, major: 1, minor: 2, accepted: 0 },
  },
  failures: [
    '375x667:A6-empty-categories-hidden-per-availability',
    '768x1024:A6-empty-categories-hidden-per-availability',
    '375x667:A1-sheet-reopens-with-retained-price',
    '768x1024:A1-sheet-reopens-with-retained-price',
    'parity-major:D1-category-availability-gating-missing-in-browse-chipbar',
    'skeptic-BROKEN:ATK4-hostile-price-inputs-no-user-feedback-on-400',
  ],
  defects: [
    { id: 'D1', severity: 'MAJOR', where: 'lib/screens/catalog_screens.dart BrowseScreen chip bar (~line 234, itemCount:_categories.length+1)', what: 'category chips are NOT gated by GET /displayItem/category-availability: Food & Groceries / Garden & Outdoors / Pet & Supplies (0 items each on this seed) render as selectable chips; tapping yields an empty result set. Reference :3000 hides Garden & Outdoors + Pet & Supplies via selectAvailableMarketplaceCategories. Subcategory strips are also entirely absent from the sheet UI (BrowseFilter.subcategoryIds never settable from UI) though the wire field works (subcategoryIds:[95] -> total=4).', evidence: 'e2e/shots/AU-049/AU-049-375x667-01-browse-chipbar.png, e2e/shots/AU-049/AU-049-sk2-sk2-chipbar-empty-cats.png' },
    { id: 'D2', severity: 'MINOR', where: '_FilterSheet price TextFormFields', what: 'after applying a band, reopening Filters shows EMPTY Min/Max inputs while the filter is still active server-side (wire body still carries minPrice:10000/maxPrice:50000). Reference dialog retains slider positions visibly.', evidence: 'e2e/shots/AU-049/AU-049-sk2-sk2-sheet-reopen-retention.png' },
    { id: 'S1', severity: 'MINOR', from: 'skeptic ATK4', what: 'invalid price input (-5000/-100, max<min) sends the raw values to the wire, gets HTTP 400, and the UI shows NO feedback whatsoever (no snackbar band in PNG pixels, no inline error text in semantics): feed silently keeps showing stale unfiltered products as if applied.', evidence: 'e2e/shots/AU-049/AU-049-sk2-p3-negative.png, e2e/shots/AU-049/AU-049-sk2-atk4-negative.png' },
  ],
  evidence: [
    '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-049/AU-049-375x667-01-browse-chipbar.png',
    '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-049/AU-049-375x667-02-sheet-initial.png',
    '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-049/AU-049-375x667-03-sheet-price-filled.png',
    '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-049/AU-049-375x667-05-neighbourhood-menu-open.png',
    '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-049/AU-049-375x667-08-list-mode.png',
    '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-049/AU-049-375x667-09-grid-mode-restored.png',
    '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-049/AU-049-768x1024-01-browse-chipbar.png',
    '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-049/AU-049-768x1024-08-list-mode.png',
    '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-049/ref-375-browse-filters.png',
    '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-049-r14-375x667.webm',
    '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-049-r14-768x1024.webm',
    '/home/devsystemadmin/GloboExpats_Mobile/e2e/reports/AU-049-verifier.md',
  ],
  truth: {
    unfiltered: 647, band_10k_50k: 312, band_cond_LIKE_NEW: 13, band_cond_nb_bamaga: 4,
    combined_community: 9, oysterOnly: 46, communityOnly: 168, shopsOnly: 479,
    subArtSupplies: 4, nbCount: 12,
    emptyCats: ['Food & Groceries', 'Garden & Outdoors', 'Pet & Supplies'], okCatCount: 12,
  },
  parityRef: {
    refDialog: { price: true, condition: true, location: true, source: true, subcategoryAccordion: false },
    refEmptyShown: ['Food & Groceries'],
    deltas: [
      'MAJOR: mobile shows ALL 15 category chips incl. zero-item Garden & Outdoors + Pet & Supplies; reference hides those two (Food & Groceries shown on both = parity)',
      'MINOR: reference filter dialog retains slider values on reopen; mobile sheet blanks Min/Max',
      'MINOR: reference has no subcategory accordion on this build either (accepted scope note)',
      'ACCEPTED-DIVERGENCE: ref feed total drifts (82 vs 647) - ref proxies dev api, structural parity only',
    ],
  },
  notes: 'Supersedes earlier FAIL rows of this run: real_data flag corrected to true (all C2 ground-truth asserts passed; earlier row left it false because no code path ever set it). Parity reclassified MAJOR for D1 per defect severity. A5 grid/list asserts now pass (61/65 asserts green). Verdict stays FAIL on D1 + D2.',
  runtime_ms: 190657,
};

const skepticRow = {
  ts: new Date().toISOString(),
  unit: 'AU-049', wave: 'skeptic', agent: 'skeptic-AU-049',
  build_sha: BUILD_SHA, build_mtime: BUILD_MT,
  attacks_attempted: 13,
  attacks_broken: 2,
  findings: [
    { id: 'ATK1-double-tap-apply', class: 'rapid-double-tap', verdict: 'HELD', observed: 'two Apply taps 250ms apart produced exactly 1 wire request (debounced), 200, total=313==truth, app alive', evidence: 'e2e/shots/AU-049/AU-049-sk2-atk1-double-tap-apply.png' },
    { id: 'ATK2-fresh-boot-apply-empty-clean', class: 'stale-params', verdict: 'HELD', observed: 'fresh boot + Apply with nothing set sends only {priceSort:SHUFFLE,seed,...}; total=648==unfiltered truth', evidence: '' },
    { id: 'ATK3-clear-all-no-stale-wire-params', class: 'state-retention', verdict: 'HELD', observed: 'Clear all wipes inputs (verified in a11y text) and wire body has zero stale keys; total returns to 648', evidence: 'e2e/shots/AU-049/AU-049-sk2-atk3-after-clearall.png' },
    { id: 'ATK4-hostile-price-inputs-isolated', class: 'invalid-input', verdict: 'BROKEN', observed: 'nonnumeric "abc" dropped gracefully (200); BUT negatives -5000/-100 and reversed 50000/10000 go to the wire RAW -> backend 400 -> NO snackbar (pixel scan), NO inline error (semantics), feed silently keeps stale unfiltered list = silent fake-success UX. 12-digit huge parses but returns 0 rows with plain feed.', evidence: 'e2e/shots/AU-049/AU-049-sk2-atk4-negative.png, AU-049-sk2-p3-negative.png (no dark toast band), AU-049-sk2-atk4-maxltmin.png' },
    { id: 'ATK5-locale-comma-price-input', class: 'locale-formats', verdict: 'HELD', observed: '"10,000"/"50,000" correctly parsed to 10000/50000 on the wire, 200, total=313==truth', evidence: 'e2e/shots/AU-049/AU-049-sk2-atk5-comma-price.png' },
    { id: 'ATK6-zero-result-band+likenew+oysterbay', class: 'empty-states', verdict: 'HELD', observed: 'truth=0 combination renders explicit "No products found..." empty-state card; grid/list toggles stay functional on empty set; app alive', evidence: 'e2e/shots/AU-049/AU-049-sk2-atk6-zero-results.png' },
    { id: 'ATK7-offline-mid-request', class: 'offline-retry', verdict: 'DISPUTED', observed: 'ctx.setOffline(true) does NOT block localhost in headless Chromium (200 returned during "offline") so the offline branch is untestable that way; genuine route-abort test (r14c P1): request aborted once, app stayed alive with feed visible, retry after unroute recovered 200 — HELD under the honest method, DISPUTED because first-pass claim was unfalsifiable', evidence: 'e2e/shots/AU-049/AU-049-sk2-p1-offline.png, AU-049-sk2-p1-recovered.png' },
    { id: 'ATK8-token-stripped-filter-still-public-200', class: 'session-expiry', verdict: 'HELD', observed: 'r14b false-BROKEN was probe error (assert raced the response listener); r14c diagnosis: browse stays, sheet opens, band applies, request FIRES and returns 200 total=313 == permitAll expectation', evidence: 'e2e/shots/AU-049/AU-049-sk2-p2-token-stripped.png' },
    { id: 'ATK9-rapid-triple-gridlist-toggle', class: 'rapid-toggle', verdict: 'HELD', observed: 'List->Grid->List at 350ms then back: churned list measures 1 col, restored grid 2 cols, no wedging', evidence: 'e2e/shots/AU-049/AU-049-sk2-atk9-list-after-triple-toggle.png' },
    { id: 'D1-recheck-empty-category-chips-shown', class: 'defect-dispute', verdict: 'CONFIRMED-BROKEN', observed: 'independent sweep reproduces verifier D1 exactly: availability endpoint says 0 items for [Food & Groceries, Garden & Outdoors, Pet & Supplies]; mobile renders all three as chips', evidence: 'e2e/shots/AU-049/AU-049-sk2-sk2-chipbar-empty-cats.png' },
    { id: 'D2-recheck-sheet-reopens-with-retained-price', class: 'defect-dispute', verdict: 'CONFIRMED-BROKEN', observed: 'reproduces verifier D2: after applying band, reopened sheet Min/Max are blank though filter is still active on the wire', evidence: 'e2e/shots/AU-049/AU-049-sk2-sk2-sheet-reopen-retention.png' },
    { id: 'P1-genuine-offline-route-abort', class: 'offline-retry', verdict: 'HELD', observed: 'with route.abort() the single filter call dies, UI keeps last feed + chrome alive, second attempt after unroute succeeds 200 (graceful degradation, no crash)', evidence: '/tmp/au049_skeptic_p123.json p1, e2e/shots/AU-049/AU-049-sk2-p1-recovered.png' },
    { id: 'V1-vision-reinspect', class: 'vision', verdict: 'HELD', observed: '19 skeptic PNGs read natively: no clipping/overlap/tofu/dead zones/misrender beyond verifier findings; empty-state card renders cleanly', evidence: 'all AU-049-sk2-*.png' },
  ],
  verdict: 'BROKEN',
  notes: 'v1 sequential run contaminated itself (sheet retains drafts -> garbage leaked between attacks) and had a liveness-probe false negative; v2 isolated every attack behind a fresh boot (10 attacks), v3 re-probed the 3 ambiguous ones honestly (route-abort offline, token-strip diagnosis, feedback pixel-scan). Net: 8 HELD, 1 DISPUTED (offline emulation limitation, genuinely HELD under route-abort), 2 BROKEN attack classes (silent 400 handling; D1 availability gating) + 2 CONFIRMED verifier defects. Unit was reported FAIL by the verifier, not PASS — skeptic agrees the unit does NOT pass.',
  truth: { unfiltered: 648, band: 313, zero: 0, invalidEnumStatus: 400 },
  evidence: [
    '/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/AU-049-skeptic.jsonl',
    '/home/devsystemadmin/GloboExpats_Mobile/e2e/reports/AU-049-skeptic.md',
    '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-049-skeptic-r14.webm',
  ],
  runtime_ms: 900000,
};

fs.appendFileSync(`${ROOT}/e2e/results/shards/AU-049-verify.jsonl`, JSON.stringify(verifyRow) + '\n');
fs.appendFileSync(`${ROOT}/e2e/results/shards/AU-049-skeptic.jsonl`, JSON.stringify(skepticRow) + '\n');
console.log('appended verify row (verdict FAIL, real_data=true, parity major=1)');
console.log('appended skeptic row (verdict BROKEN, attempted=13 broken=2)');
