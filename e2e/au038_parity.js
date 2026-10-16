// au038_parity.js — reference judge (:3000) for AU-038 surfaces + decline-with-reason probe (H).
// The reference proxies the DEV backend, so our sandbox fixtures don't exist there; parity is
// structural: what the seller sees on an ASC order detail and a READY_FOR_DISPATCH detail.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const REF = 'http://localhost:3000';
const APP = 'http://localhost:9112';
const fx = JSON.parse(fs.readFileSync('/tmp/au038_fixtures.json', 'utf8'));
let R = { ts: new Date().toISOString(), asserts: [], shots: [], deltas: [] };
function assert(n, p, d) { R.asserts.push({ n, p: !!p, d: String(d || '').slice(0, 400) }); console.log(p ? 'PASS' : 'FAIL', n, String(d || '').slice(0, 200)); }

(async () => {
  const browser = await L.newBrowser();
  // ---------- Reference: seller login + orders list (structural)
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-038-parity-ref.webm' });
  const p = await ctx.newPage();
  try {
    await p.goto(REF + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await p.waitForTimeout(3500);
    // reference login form
    try {
      await p.fill('input[type="email"], input[name="email"], input#email', process.env.REF_EMAIL || '');
    } catch (e) {}
    // The ref needs credentials; use the SAME test account family as web tests if configured.
    // We do NOT have web creds in env — record honestly and fall back to code-level comparison.
    const hasLoginForm = await p.locator('input').count();
    assert('ref-login-form-present', hasLoginForm > 0, `inputs=${hasLoginForm}`);
    await p.screenshot({ path: 'e2e/shots/AU-038/ref-mobile-login.png' }).catch(() => {});
    R.shots.push('e2e/shots/AU-038/ref-mobile-login.png');

    // Structural parity from source (documented, since ref data lives on DEV backend):
    const gate = fs.readFileSync(process.env.HOME + '/GloboExpats_Frontend/components/orders/seller-availability-gate.tsx', 'utf8');
    const orderPage = fs.readFileSync(process.env.HOME + '/GloboExpats_Frontend/app/orders/[id]/page.tsx', 'utf8');
    R.deltas.push({ area: 'gate banner copy',
      ref: 'Card with per-item checkboxes, "Order paid"/"Seller receives" money rows, buttons "Confirm all checked items" + "Can\'t fulfil"',
      mobile: 'Single amber explainer banner ("The buyer has paid. Confirm this item is available to dispatch it — declining cancels the order and refunds the buyer.") + buttons "Confirm availability" / "Can\'t fulfil"',
      classification: 'MINOR', rationale: 'Same contract (confirm/decline → same endpoints); mobile omits per-item checkbox list and payout rows but keeps the gate semantics and decline-reason dialog.' });
    R.deltas.push({ area: 'confirm button gating',
      ref: '"Confirm all checked items" disabled until every item checkbox ticked (allItemsChecked)',
      mobile: '"Confirm availability" always enabled (no per-item checklist)',
      classification: 'MINOR', rationale: 'Backend enforces the real gate server-side; mobile relies on that.' });
    R.deltas.push({ area: 'decline reason',
      ref: 'Decline sheet requires reason textarea before submit (reason state)',
      mobile: 'Dialog collects Reason but Submit proceeds even when empty — app silently falls back to "Item unavailable" (orders_screen.dart _declineAvailabilityDialog). Backend accepted it (fixture D → CANCELLED/REFUND_PENDING with reason "Item unavailable").',
      classification: 'MAJOR', rationale: 'Reference blocks empty reasons? (validate) — mobile sends fallback text without telling the buyer why. AvailabilityGate.validateDeclineReason exists in domain/dispatch.dart but the dialog never calls it.' });
    R.deltas.push({ area: 'dispatch too-early explainer',
      ref: 'READY_FOR_DISPATCH shows "Ready to dispatch" card; tapping Dispatch inside the window shows toast "Not time to dispatch yet" + DISPATCH_TOO_EARLY copy; blocked state renders "Cannot dispatch yet"/"Dispatch scheduled" banner with blocker messages',
      mobile: 'NO dispatch button and NO blocker explainer anywhere on the READY_FOR_DISPATCH detail — only status label "Driver assigned - dispatch once they have the items", timeline step, Track delivery. Domain copy exists (lib/domain/dispatch_errors.dart) but no widget consumes it.',
      classification: 'MAJOR', rationale: 'Acceptance criterion "dispatch too-early blocker explainer" is not rendered by any screen; the seller gets no explainer at all.' });
    R.deltas.push({ area: 'mark picked-up/delivered',
      ref: 'Seller "Mark Picked Up"/"Mark Delivered" buttons when canMarkFulfilled (AWAITING_PICKUP/AWAITING_DELIVERY/PAID/IN_TRANSIT, non-rental, not SELLER_DELIVERY+logistics-v2)',
      mobile: 'No mark-picked-up/mark-delivered button on any seller state; AWAITING_PICKUP shows Actions→Cancel only. API verb map supports both (api_client.dart orderAction) but nothing calls them.',
      classification: 'MAJOR', rationale: 'Acceptance criterion "mark picked-up/delivered" has no UI surface.' });
    R.parity_blocker = 0; R.parity_major = 3; R.parity_minor = 2;
  } finally {
    await L.closeVideo(ctx, 'e2e/videos/AU-038-parity-ref.webm');
  }
  await browser.close().catch(() => {});

  // ---------- Decline WITH reason on H (proves decline happy path end-to-end)
  const stok = await L.apiLogin({ email: fx.seller.email, pw: fx.seller.pw });
  const dr = await L.api(stok, 'POST', `/api/v1/orders/${fx.H.orderId}/decline-availability`,
    { reason: 'AU038 probe: item cracked' });
  assert('H-decline-api', dr.status === 200 || dr.status === 201, JSON.stringify(dr.json || {}).slice(0, 150));
  const d2 = await L.api(stok, 'GET', `/api/v1/orders/${fx.H.orderId}`);
  assert('H-cancelled-refundpending', d2.json.status === 'CANCELLED' && d2.json.refundStatus === 'REFUND_PENDING',
    `${d2.json.status}/${d2.json.refundStatus}`);
  fs.writeFileSync('/tmp/au038_parity.json', JSON.stringify(R, null, 1));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
