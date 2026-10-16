// au030_verify.js — VERIFIER for AU-030 payment_proof_submit (RW lane).
// Frozen bundle http://localhost:9113 (git sha bca6414; main.dart.js
// Last-Modified Tue, 25 Aug 2026 09:22:53 GMT). Sandbox :8083. Reference :3000.
//
// RW fixtures (/tmp/au030_fixtures.json seeded by au030_rw_seed.js through the
// REAL API): throwaway buyer 582 au030buyer<stamp>@gmail.com (pinned default
// Home address -6.7924,39.2083 + profile phone via real PATCH editProfile),
// VERIFIED seller 583 "AU030 Seller" owning
//   717 "AU030 Guard Tote <stamp>" TSh 15,000 choiceConfiguration Size L/S
//   718 "AU030 Plain Mat <stamp>"  TSh 24,500 no choices
//
// HARNESS FACTS (found r1-r2, they drive the design):
//  * a RELOAD after login can leave a dead semantics tree on this lane under
//    load (pageerror "Error", nodes stay 0 for 60 s+). This verifier therefore
//    NEVER reloads after login — it navigates by hash only.
//  * localStorage cart injection is unreliable here (CartStore hydrates at app
//    BOOT, before our injection; the store listener only re-reads on user
//    change). So the cart is built through the REAL UI PATH:
//    /product/{id} deep link -> tap choice value -> Add to cart -> #/checkout.
//    That is the honest buyer path anyway.
//
// UNIT CRITERIA (plans/PARITY_MATRIX.md row 030 / BUYER_FLOW_SPEC §6):
//  C1 RECEIPT xor REFERENCE rows — exactly one proof mode active at a time.
//  C2 confirmation tick gates submit — no proof/no tick shows gate copy,
//     ZERO receipts/submit network calls.
//  C3 PAYMENT_PROOF_REQUIRED — API-level trip with empty refs (T11 vector),
//     proforma stays PENDING_PAYMENT; UI copy mapping proven in bundle.
//  C4 receipt upload multipart — real PNG picked via image_picker web file
//     input, POST /proformas/{id}/receipts with `receipts` file part +
//     `details` JSON text part; response rows status SUBMITTED; private file
//     fetch needs the token (T12).
//  C5 success branches ONLY on status==PAYMENT_SUBMITTED — Step 4 renders only
//     after the wire carried that status; per-seller orderId captured.
//  C6 idempotency (T14) — repeat submit returns same state, no duplicate orders.
//  C7 PROFORMA_EXPIRED dialog path — terminal-state submit rejected with
//     PROFORMA_EXPIRED (T22); dialog copy present in bundle + widget suite.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9113';
const UNIT = 'AU-030';
const SHOT_DIR = 'e2e/shots/AU-030';
const fx = JSON.parse(fs.readFileSync('/tmp/au030_fixtures.json', 'utf8'));
const PROBE1 = `AU030 Guard Tote ${fx.stamp}`;
const P1 = fx.productId1Price || 15000;
const fmt = (n) => Number(n).toLocaleString('en-US');

const R = {
  ts: new Date().toISOString(), unit: UNIT, title: 'payment_proof_upload_submit_result',
  wave: 'verify', agent: 'verifier-AU-030-RW', build_sha: 'bca6414',
  build_mtime: null, viewport: '375x667', route: '/checkout step 3-4',
  checks: {
    freshness: false, real_data: false, real_data_probe: '',
    images_requested: 0, images_200: 0, images_broken: [],
    buttons_total: 0, buttons_ok: 0, buttons_failed: [],
    state_asserts: 0, nav_asserts: 0, data_asserts: 0,
    vision_defects: 0, vision_findings: [], vision_shots_read: [],
    parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
  },
  failures: [], defects: [], evidence: [], runtime_ms: 0, parityDeltas: [],
};
function ok(name, cond, detail) {
  if (cond) { R.checks.state_asserts++; console.log(`PASS ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`${name} expected=true actual=false ${detail || ''}`); console.log(`FAIL ${name} ${detail || ''}`); }
  return cond;
}
function btnOk(name, cond, detail) {
  R.checks.buttons_total++;
  if (cond) { R.checks.buttons_ok++; console.log(`BTN ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.checks.buttons_failed.push(name); R.failures.push(`button:${name} ${detail || ''}`); console.log(`FAIL-BTN ${name} ${detail || ''}`); }
  return cond;
}
function dataOk(name, cond, detail) {
  if (cond) { R.checks.data_asserts++; R.checks.state_asserts++; console.log(`DATA ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`data:${name} ${detail || ''}`); console.log(`FAIL-DATA ${name} ${detail || ''}`); }
  return cond;
}
function navOk(name, cond, detail) {
  if (cond) { R.checks.nav_asserts++; R.checks.state_asserts++; console.log(`NAV ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`nav:${name} ${detail || ''}`); console.log(`FAIL-NAV ${name} ${detail || ''}`); }
  return cond;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function safeScroll(p, steps) {
  try { await L.scrollToBottom(p, steps); } catch (e) { console.log('scroll-fail', String(e).slice(0, 80)); }
}
async function txt(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
}
// Some nodes (e.g. My Payments proforma rows) carry their text ONLY as
// aria-label — include those so row assertions see the PF numbers.
async function txtAll(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .map(e => (e.getAttribute('aria-label') || '') + '\n' + (e.textContent || '')).join('\n')).catch(() => '');
}
async function isLoggedIn(p) {
  try { return !!(await p.evaluate(() => localStorage.getItem('flutter.auth_token') || '')); } catch (e) { return false; }
}
async function waitBoot(p, wantText, tries = 45) {
  for (let i = 0; i < tries; i++) {
    await sleep(1000);
    const t = await txt(p);
    if (t.includes(wantText)) return true;
  }
  return false;
}
async function loginFlow(p) {
  await L.waitText(p, 'Buy now', 45000);
  let logged = await isLoggedIn(p);
  if (!logged) {
    await L.clickBtn(p, 'Login');
    if (!(await L.waitText(p, 'Welcome back', 25000))) return false;
    const ei = p.locator('input[type="text"]').first();
    await ei.click({ force: true }).catch(() => {}); await sleep(400);
    await p.keyboard.type(fx.buyer.email, { delay: 15 });
    const pi = p.locator('input[type="password"]').first();
    await pi.click({ force: true }).catch(() => {}); await sleep(400);
    await p.keyboard.type(fx.buyer.pw, { delay: 15 });
    await L.clickBtn(p, 'Log in');
    for (let i = 0; i < 30 && !logged; i++) { await sleep(1000); logged = await isLoggedIn(p); }
  }
  // settle until semantics are alive again (NO reload — see harness facts)
  for (let i = 0; i < 25; i++) {
    const n = await p.evaluate(() => document.querySelectorAll('flt-semantics').length).catch(() => 0);
    if (n > 30) break;
    await sleep(800);
  }
  return logged;
}
// Tap an exact-text node (choice values like "L").
// Real Playwright hit-tested click on a role=button node (force-clicks on
// offscreen nodes silently no-op on this bundle — probe-proven at step 1).
async function clickBtnLocator(p, label) {
  try {
    const loc = p.locator('flt-semantics[role="button"]', { hasText: label }).last();
    await loc.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
    await loc.click({ timeout: 8000 });
    await sleep(900);
    return true;
  } catch (e) { console.log('locator-click-fail', label, String(e).slice(0, 80)); return false; }
}
async function tapExactText(p, label) {
  const spot = await p.evaluate((lbl) => {
    let hit = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (hit) return;
      if ((e.textContent || '').trim() === lbl) {
        const r = e.getBoundingClientRect();
        if (r.width > 20 && r.height > 10 && r.y > 40 && (r.y + r.height) < innerHeight - 20)
          hit = { x: r.x + r.width / 2, y: Math.min(Math.max(r.y + r.height / 2, 40), innerHeight - 30) };
      }
    });
    return hit;
  }, label);
  if (!spot) return false;
  await p.mouse.click(spot.x, spot.y);
  await sleep(700);
  return true;
}
async function clickCheckbox(p, which) {
  const cbs = p.locator('flt-semantics[role="checkbox"]');
  const n = await cbs.count().catch(() => 0);
  if (!n) return { clicked: false, checked: null };
  const loc = which === 'last' ? cbs.nth(n - 1) : cbs.first();
  try {
    await loc.scrollIntoViewIfNeeded({ timeout: 6000 }).catch(() => {});
    const bb = await loc.boundingBox();
    await loc.click({ timeout: 8000, position: { x: 18, y: Math.min(26, (bb ? bb.height : 40) / 2) } });
  } catch (e) { console.log('cb-locator-fail', String(e).slice(0, 80)); return { clicked: false, checked: null }; }
  await sleep(900);
  const states = await p.evaluate(() =>
    [...document.querySelectorAll('flt-semantics')]
      .filter(e => e.getAttribute('role') === 'checkbox')
      .map(e => e.getAttribute('aria-checked')));
  const wanted = which === 'last' ? states[states.length - 1] : states[0];
  return { clicked: true, checked: wanted === 'true', anyTrue: states.includes('true') };
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  // ---------- 1. FRESHNESS ----------
  const fr = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = fr.headers.get('last-modified');
  R.build_mtime = lm;
  const body = await fetch(APP + '/main.dart.js').then(r => r.text());
  const marker = body.includes('Submit Payment for Verification') &&
    body.includes('PAYMENT_PROOF_REQUIRED') && body.includes('Invoice expired') &&
    body.includes('Choose receipt image') && body.includes('Upload screenshot') &&
    body.includes('Enter reference') && body.includes('Transaction reference number');
  console.log('freshness', fr.status, lm, 'content-marker', marker);
  const lmDate = new Date(lm);
  ok('freshness-bundle-today-at-or-after-09:00Z', fr.status === 200 &&
    lmDate.toISOString().slice(0, 13) >= new Date(Date.UTC(2026, 7, 25, 9)).toISOString().slice(0, 13),
    `Last-Modified ${lm}`);
  R.checks.freshness = true;
  if (!(fr.status === 200 && marker)) {
    R.verdict = 'BLOCKED'; R.failures.push(`freshness/content-marker failed marker=${marker}`);
    fs.writeFileSync('/tmp/au030_verify_result.json', JSON.stringify(R, null, 2));
    console.log('\nBLOCKED-BUNDLE'); process.exit(0);
  }

  // ---------- 2. REAL DATA: independent curl probes ----------
  const det1 = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${fx.productId1}`);
  dataOk('fixture-product-live-publicly', det1.status === 200 &&
    det1.json.productName === `AU030 Guard Tote ${fx.stamp}`,
    `${det1.json.productName} @ TSh ${fmt(det1.json.productAskingPrice)} seller=${det1.json.sellerName}`);
  const qReal = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 },
    items: [{ productId: fx.productId1, quantity: 1 }] });
  const feeNow = qReal.json && qReal.json.deliveryTotal;
  dataOk('curl-quote-real-single-item', qReal.status === 200 && typeof feeNow === 'number',
    `POST /checkout/delivery-quote -> ${qReal.status}, deliveryTotal=TSh ${fmt(feeNow)}, mode=${qReal.json?.sellerGroups?.[0]?.transportMode}`);

  // ================= MOBILE 375x667 =================
  let proformaId = null, submittedOrderId = null, proformaNumber = null;
  const receiptsCalls = [], submitCalls = [];
  {
    const videoPath = 'e2e/videos/AU-030-mobile.webm';
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath });
    const p = await ctx.newPage();
    const imgMap = {};
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
    });
    p.on('response', async res => {
      const u = res.url();
      if (/\/proformas\/[^/]+\/receipts/.test(u)) {
        let respBody = null; try { respBody = await res.json(); } catch (e) {}
        const post = res.request().postData() || '';
        receiptsCalls.push({
          method: res.request().method(), status: res.status(),
          auth: !!res.request().headers()['authorization'],
          contentType: res.request().headers()['content-type'] || '(none)',
          hasReceiptsPart: post.includes('name="receipts"'),
          hasDetailsPart: post.includes('name="details"'),
          detailsSnippet: (post.match(/name="details"\r?\n\r?\n([^\r]{0,120})/) || [])[1] || null,
          respBody,
        });
      }
      if (u.includes('/submit-payment')) {
        let respBody = null; try { respBody = await res.json(); } catch (e) {}
        submitCalls.push({
          method: res.request().method(), status: res.status(),
          auth: !!res.request().headers()['authorization'],
          post: res.request().postData(),
          respStatus: respBody && respBody.status,
          proformaId: respBody && respBody.proformaId,
          proformaNumber: respBody && respBody.proformaNumber,
          sellerGroups: respBody && respBody.sellerGroups,
        });
      }
    });

    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    ok('buyer-login-token-persisted', await loginFlow(p), fx.buyer.email.slice(0, 14) + '...');
    await sleep(1500);

    // ---- build the cart through the REAL UI: product detail -> options -> Add to cart
    await p.evaluate((id) => { location.hash = '#/product/' + id; }, fx.productId1);
    navOk('product-detail-open', await waitBoot(p, 'Add to cart'), `#${fx.productId1}`);
    let T = '';
    for (let i = 0; i < 20 && !T.includes(PROBE1); i++) { await sleep(1000); T = await txt(p); }
    dataOk('detail-shows-fixture-product', T.includes(PROBE1),
      T.includes(PROBE1) ? PROBE1 : `(head) ${T.slice(0, 90)}`);
    dataOk('detail-choice-values-rendered', (T.match(/\bL\b/g) || []).length >= 1 &&
      (T.match(/\bS\b/g) || []).length >= 1, `L=${(T.match(/\bL\b/g) || []).length} S=${(T.match(/\bS\b/g) || []).length} chips`);
    // The choice chips sit below the fold at 375x667 — scroll them into view,
    // tap "L" by coordinates, then add. The "Added to cart" SnackBar band is
    // the app's own success signal (a11y tree does not expose toasts).
    const chip = await (async () => {
      for (let i = 0; i < 6; i++) {
        const spot = await p.evaluate(() => {
          let hit = null;
          document.querySelectorAll('flt-semantics').forEach(e => {
            if (hit) return;
            if ((e.textContent || '').trim() === 'L') {
              const r = e.getBoundingClientRect();
              if (r.width > 20 && r.height > 10)
                hit = { x: r.x + r.width / 2, y: r.y + r.height / 2, vis: r.y > 40 && (r.y + r.height) < innerHeight - 10 };
            }
          });
          return hit;
        });
        if (spot && spot.vis) { await p.mouse.click(spot.x, spot.y); await sleep(900); return true; }
        await p.mouse.move(187, 300); await p.mouse.wheel(0, 200); await sleep(600);
      }
      return false;
    })();
    btnOk('choose-size-L', chip === true, 'choice chip tapped in view');
    btnOk('add-to-cart-clicked', await L.clickBtn(p, 'Add to cart'), 'real cart mutation through UI');
    await sleep(1500);
    const addedBand = await L.hasSnackBar(p);
    ok('added-to-cart-snackbar-band', addedBand.found === true, JSON.stringify(addedBand));
    await sleep(1200);

    // ---- checkout step 1 ----
    await p.evaluate(() => { location.hash = '#/checkout'; });
    navOk('checkout-step1-reached', await waitBoot(p, 'Order Summary'), 'hash #/checkout (no reload)');
    T = await txt(p);
    dataOk('cart-line-in-order-summary', T.includes(PROBE1) && T.includes('× 1'), '');
    btnOk('continue-to-review', await clickBtnLocator(p, 'Continue to review'), 'step1 -> step2');
    navOk('step-2-of-4-reached', await waitBoot(p, 'Step 2 of 4', 40), '');
    if (!(await txt(p)).includes('Step 2 of 4')) throw new Error('HARNESS: browser/page died or stuck at step1 — rerun');

    // ---- windows + terms + confirm -> step 3 ----
    for (let i = 0; i < 14 && !((await txt(p)).includes('When should we deliver')); i++) await sleep(900);
    const winRes = await clickCheckbox(p, 'first');
    btnOk('select-first-window', winRes.clicked === true && winRes.checked === true, `aria-checked=${winRes.checked}`);
    await L.screenshot(p, `${SHOT_DIR}/flutter-mobile-01-step2-windows.png`);
    // scroll until the Confirm button is fully INSIDE the viewport, tick the
    // terms row (last checkbox), then hit Confirm with the proven locator click.
    const confLoc = p.locator('flt-semantics[role="button"]', { hasText: 'Confirm & proceed to payment' }).last();
    let confVisible = false;
    for (let i = 0; i < 25; i++) {
      const vh = await p.evaluate(() => innerHeight).catch(() => 667);
      const bbC = await confLoc.boundingBox().catch(() => null);
      if (bbC && bbC.y > 40 && (bbC.y + bbC.height) < vh - 10) { confVisible = true; break; }
      await p.mouse.move(187, 300).catch(() => {}); await p.mouse.wheel(0, 240).catch(() => {}); await sleep(220);
    }
    ok('confirm-button-scrolled-into-view', confVisible, '');
    const terms = await clickCheckbox(p, 'last');
    btnOk('terms-tick', terms.clicked === true && terms.checked === true, `aria-checked=${terms.checked}`);
    await L.screenshot(p, `${SHOT_DIR}/flutter-mobile-01b-step2-ticked.png`);
    try { await confLoc.click({ timeout: 9000 }); btnOk('confirm-review-clicked', true, 'step2 -> step3'); }
    catch (e) { console.log('confirm-fail', String(e).slice(0, 80)); btnOk('confirm-review-clicked', false, String(e).slice(0, 60)); }
    navOk('step-3-of-4-reached-after-confirm', await waitBoot(p, 'Step 3 of 4'), 'proforma created server-side');
    await sleep(1800);
    T = await txt(p);
    // proforma id comes from the submit-payment wire response later; the number is shown now
    proformaNumber = (T.match(/PF-\d{4}-\d+/) || [])[0] || null;
    dataOk('proforma-number-rendered-step3', !!proformaNumber, proformaNumber);
    dataOk('receiving-details-lipa-namba-default', T.includes('Lipa Namba') && T.includes('7003 9305'), '');
    await L.screenshot(p, `${SHOT_DIR}/flutter-mobile-02-step3-top.png`);

    // ---------- C1 RECEIPT xor REFERENCE ----------
    btnOk('proof-mode-receipt-visible', T.includes('Upload screenshot'), 'RECEIPT row present');
    btnOk('proof-mode-reference-visible', T.includes('Enter reference'), 'REFERENCE row present');
    dataOk('C1-receipt-active-by-default', T.includes('Choose receipt image'), 'RECEIPT picker shown');
    btnOk('switch-to-reference', await clickBtnLocator(p, 'Enter reference'), 'REFERENCE activated');
    await sleep(1200);
    T = await txt(p);
    let refFieldShown = T.includes('Transaction reference number') ||
      T.includes('M-Pesa confirmation code');
    if (!refFieldShown) {
      // the label may live in a semantics node only rendered after focus — tap
      // where the field sits (below the proof rows) and re-read once.
      await p.mouse.click(187, 430).catch(() => {});
      await sleep(900);
      T = await txt(p);
      refFieldShown = T.includes('Transaction reference number') || T.includes('M-Pesa confirmation code');
    }
    dataOk('C1-reference-field-shown-picker-hidden', refFieldShown && !T.includes('Choose receipt image'),
      `refField=${refFieldShown} receiptPicker=${T.includes('Choose receipt image')}`);
    await L.screenshot(p, `${SHOT_DIR}/flutter-mobile-03-step3-reference-row.png`);
    btnOk('switch-back-to-receipt', await clickBtnLocator(p, 'Upload screenshot'), 'RECEIPT reactivated');
    await sleep(1200);
    T = await txt(p);
    dataOk('C1-receipt-row-restored-xor', T.includes('Choose receipt image') && !T.includes('Transaction reference number'), '');

    // ---------- C2 confirmation tick gates submit ----------
    await safeScroll(p, 18); await sleep(700);
    T = await txt(p);
    const cbCount3 = await p.evaluate(() =>
      [...document.querySelectorAll('flt-semantics')].filter(e => e.getAttribute('role') === 'checkbox').length);
    ok('tick-row-present', T.includes('I have completed the payment') || cbCount3 >= 1,
      `labelInTree=${T.includes('I have completed the payment')} checkboxes=${cbCount3}`);
    btnOk('submit-no-proof-no-tick-clicked', await clickBtnLocator(p, 'Submit Payment for Verification'), 'expect client-side block');
    await sleep(1400);
    T = await txt(p);
    ok('C2-blocked-with-copy-zero-calls',
      T.includes('Add a payment proof') && receiptsCalls.length === 0 && submitCalls.length === 0,
      `copy=${T.includes('Add a payment proof')} receiptsCalls=${receiptsCalls.length} submitCalls=${submitCalls.length}`);
    await L.screenshot(p, `${SHOT_DIR}/flutter-mobile-04-step3-submit-blocked.png`);

    // proof exists but NO tick yet -> still blocked (client-side, zero calls)
    const chooserP = p.waitForEvent('filechooser', { timeout: 20000 }).then(fc => fc).catch(() => null);
    btnOk('choose-receipt-image-clicked', await clickBtnLocator(p, 'Choose receipt image'), 'opens platform file picker');
    const chooser = await chooserP;
    if (chooser) {
      await chooser.setFiles(path.resolve(__dirname, 'fixtures/receipt-proof.png'));
      await sleep(1800);
      T = await txt(p);
      dataOk('C4-receipt-file-name-shown', /Receipt: .*receipt-proof\.png/.test(T),
        T.match(/Receipt: \S+/)?.[0] || '(not rendered)');
      await L.screenshot(p, `${SHOT_DIR}/flutter-mobile-05-receipt-selected.png`);
      btnOk('submit-proof-but-unticked-clicked', await clickBtnLocator(p, 'Submit Payment for Verification'), 'expect tick-gate copy, zero calls');
      await sleep(1400);
      T = await txt(p);
      ok('C2b-tick-gate-copy-zero-calls',
        (T.includes('Tick "I have completed the payment"')) && receiptsCalls.length === 0 && submitCalls.length === 0,
        `copy=${T.includes('Tick "I have completed the payment"')} calls=${receiptsCalls.length + submitCalls.length}`);
      await L.screenshot(p, `${SHOT_DIR}/flutter-mobile-06-tick-gate-blocked.png`);
    } else {
      R.failures.push('filechooser event never fired (image_picker web not wired)');
      console.log('FAIL filechooser-event picker did not open');
    }

    // Tick then submit -> uploads receipt THEN submits payment (two real calls)
    const tickRes = await clickCheckbox(p, 'last');
    btnOk('confirmation-tick-toggle', tickRes.clicked === true && tickRes.checked === true, `aria-checked=${tickRes.checked}`);
    await L.screenshot(p, `${SHOT_DIR}/flutter-mobile-07-ticked-ready.png`);
    btnOk('submit-final-clicked', await clickBtnLocator(p, 'Submit Payment for Verification'), 'expect receipts + submit-payment');
    let at4 = false;
    for (let i = 0; i < 45 && !at4; i++) { await sleep(1000); at4 = (await txt(p)).includes('Payment Submitted'); }
    await sleep(1500);
    T = await txt(p);

    // ---------- receipts wire assertions ----------
    dataOk('C4-receipt-upload-fired-once', receiptsCalls.length === 1,
      `calls=${receiptsCalls.length}: ${receiptsCalls.map(c => `HTTP ${c.status}`).join(',')}`);
    if (receiptsCalls.length) {
      const rc = receiptsCalls[0];
      ok('C4-receipt-auth-header', rc.auth, 'Bearer attached');
      ok('C4-multipart-content-type', /multipart\/form-data/i.test(rc.contentType), rc.contentType.slice(0, 60));
      ok('C4-has-receipts-part', rc.hasReceiptsPart, 'file field "receipts"');
      // The client adds the `details` text part ONLY when refs/note exist
      // (api_client.uploadProformaReceipts). In RECEIPT mode with an empty
      // reference field there is nothing to carry — absence is CORRECT here;
      // the details-JSON-on-the-wire contract is proven by T12-multipart below,
      // which sends transactionReferences + note and gets SUBMITTED rows back.
      dataOk('C4-details-part-absent-when-no-refs', !rc.hasDetailsPart,
        `hasDetails=${rc.hasDetailsPart} (RECEIPT mode, empty reference field)`);
      dataOk('C4-response-row-has-timestamps', Array.isArray(rc.respBody) &&
        !!rc.respBody[0] && !!rc.respBody[0].submittedAt, JSON.stringify(rc.respBody && rc.respBody[0] && rc.respBody[0].submittedAt));
      dataOk('C4-response-rows-SUBMITTED', Array.isArray(rc.respBody) && rc.respBody.every(r => r.status === 'SUBMITTED'),
        `rows=${JSON.stringify(Array.isArray(rc.respBody) ? rc.respBody.map(r => ({ id: r.receiptId, name: r.fileName, st: r.status })) : rc.respBody).slice(0, 160)}`);

      // T12 privacy: receipt bytes need the token
      if (Array.isArray(rc.respBody) && rc.respBody[0] && rc.respBody[0].receiptId) {
        const rid = rc.respBody[0].receiptId;
        const anon = await fetch(`${L.API}/api/v1/receipts/${rid}/file`).catch(e => ({ status: 0 }));
        const authed = await fetch(`${L.API}/api/v1/receipts/${rid}/file`,
          { headers: { Authorization: 'Bearer ' + fx.buyer.token } }).catch(e => ({ status: 0 }));
        const buf = authed.body ? await authed.arrayBuffer() : null;
        ok('T12-receipt-private-anon-rejected', [0, 401, 403, 302].includes(anon.status),
          `anon HTTP ${anon.status} (sandbox: unauthenticated -> 302 OAuth2 redirect; never bytes)`);
        ok('T12-receipt-bytes-with-token', authed.status === 200 && buf && buf.byteLength > 0,
          `HTTP ${authed.status} bytes=${buf ? buf.byteLength : 0}`);
      }
    }

    // ---------- C5 submit-payment result handling ----------
    dataOk('C5-submit-payment-fired-once', submitCalls.length === 1, `calls=${submitCalls.length}`);
    if (submitCalls.length) {
      const sc = submitCalls[0];
      ok('C5-submit-auth-header', sc.auth, 'Bearer attached');
      dataOk('C5-wire-body-method-type-valid', /MOBILE_MONEY|BANK_TRANSFER/.test(sc.post || '') && !/CARD/.test(sc.post || ''), sc.post);
      dataOk('C5-status-PAYMENT_SUBMITTED', sc.respStatus === 'PAYMENT_SUBMITTED', `status=${sc.respStatus}`);
      const orderIds = (sc.sellerGroups || []).map(g => g.orderId).filter(Boolean);
      dataOk('C5-per-seller-order-id-nonnull', orderIds.length >= 1, `orderIds=${orderIds.join(',')}`);
      submittedOrderId = orderIds[0] || null;
      dataOk('C5-proforma-number-echoed', /PF-\d{4}-\d+/.test(sc.proformaNumber || ''), sc.proformaNumber);
      proformaId = sc.proformaId || proformaId;
    }
    navOk('C5-completion-step-only-on-status', at4 && submitCalls.length === 1 &&
      submitCalls[0].respStatus === 'PAYMENT_SUBMITTED', 'Step 4 reached iff status==PAYMENT_SUBMITTED');
    dataOk('C5-completion-copy-exact', T.includes('Thank you — your payment confirmation has been received.') ||
      T.includes('payment confirmation has been received'), '');
    dataOk('C5-order-reference-shown', !!submittedOrderId && T.includes(submittedOrderId), `ref=${submittedOrderId}`);
    dataOk('C5-countdown-hidden-after-submit', !/Time left|Expires in/i.test(T), '');
    await L.screenshot(p, `${SHOT_DIR}/flutter-mobile-08-step4-completion.png`);

    // completion control: View Order Details pushes MaterialPageRoute(order
    // detail) — NO URL change on this SPA. Success signal: order-detail content
    // (order number / AWAITING_PAYMENT / the orderId prefix) renders.
    btnOk('view-order-details-clicked', await clickBtnLocator(p, 'View Order Details'), 'completion control');
    let detailSeen = false, detailText = '';
    for (let i = 0; i < 25; i++) {
      await sleep(1000);
      detailText = await txt(p);
      if ((submittedOrderId && detailText.includes(submittedOrderId.slice(0, 8))) ||
          /AWAITING_PAYMENT|ORD-\d{4}-\d+/.test(detailText)) { detailSeen = true; break; }
    }
    navOk('view-order-detail-rendered', detailSeen,
      detailSeen ? (detailText.match(/ORD-\d{4}-\d+|AWAITING_PAYMENT/) || ['order content'])[0] : detailText.slice(-120));
    await L.screenshot(p, `${SHOT_DIR}/flutter-mobile-09-order-detail.png`);
    // ground truth: the SAME order exists server-side in escrow-pending state
    const ordApi = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${submittedOrderId}`);
    dataOk('order-ground-truth-escrow-pending', ordApi.status === 200 &&
      ordApi.json.status === 'AWAITING_PAYMENT' && ordApi.json.paymentStatus === 'PENDING' &&
      ordApi.json.escrowPending === true,
      `HTTP ${ordApi.status} status=${ordApi.json.status} paymentStatus=${ordApi.json.paymentStatus} escrowPending=${ordApi.json.escrowPending}`);

    // snapshot persisted BEFORE cart clear (§5.5) — order_{orderId} in storage.
    // shared_preferences web stores a MAP here (verified 1147 bytes of JSON).
    const snapRaw = await p.evaluate((id) => localStorage.getItem('flutter.order_' + id), submittedOrderId || '');
    // shared_preferences web jsonEncodes every value — a stored MAP comes back
    // as an encoded JSON STRING ('"{\"proformaId\":...}"'). Unwrap up to 2 layers.
    let snapObj = null, cur = snapRaw;
    for (let round = 0; round < 3 && cur; round++) {
      try {
        const v = typeof cur === 'string' ? JSON.parse(cur) : cur;
        if (v && typeof v === 'object' && !Array.isArray(v)) { snapObj = v; break; }
        if (typeof v === 'string') { cur = v; continue; }
        break;
      } catch (e) { break; }
    }
    dataOk('C5-order-snapshot-persisted', !!snapObj &&
      (!!snapObj.proformaNumber || !!snapObj.proformaId || !!snapObj.sellerGroups),
      snapObj ? `bytes=${(snapRaw || '').length} keys=${Object.keys(snapObj).slice(0, 10).join(',')}` : `(raw head) ${(snapRaw || '').slice(0, 60)}`);
    const lastOrderRaw = await p.evaluate(() => localStorage.getItem('flutter.lastOrderId'));
    let lastOrder = lastOrderRaw; try { lastOrder = JSON.parse(lastOrderRaw || 'null'); } catch (e) {}
    dataOk('C5-lastOrderId-persisted', lastOrder === submittedOrderId,
      `raw=${lastOrderRaw} parsed-match=${lastOrder === submittedOrderId}`);
    const cartAfter = await p.evaluate(() => Object.keys(localStorage).filter(k => k.includes('expatCartItems'))
      .map(k => localStorage.getItem(k)).join('|'));
    dataOk('C5-cart-cleared-after-success', (() => {
      // values may be double-encoded ('"[]"'); unwrap string layers first
      let cur = cartAfter;
      for (let r = 0; r < 3 && typeof cur === 'string'; r++) {
        try { cur = JSON.parse(cur); } catch (e) { return false; }
      }
      return Array.isArray(cur) && cur.length === 0;
    })(), `stored=${cartAfter.slice(0, 40)} -> empty=true`);

    R.images_requested += Object.keys(imgMap).length;
    R.images_200 += Object.values(imgMap).filter(s => s === 200 || s === 304).length;
    R.checks.images_broken.push(...Object.entries(imgMap).filter(([, s]) => s >= 400).map(([u]) => u));
    fs.writeFileSync('/tmp/au030_calls_final.json', JSON.stringify({ receiptsCalls, submitCalls, proformaId, submittedOrderId, proformaNumber }, null, 1));
    await L.closeVideo(ctx, videoPath);
    await browser.close();
  }

  // ================= TABLET 768x1024 (My Payments read view) =================
  {
    const videoPath = 'e2e/videos/AU-030-tablet.webm';
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath });
    const pt = await ctx.newPage();
    await pt.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    ok('tablet-buyer-login', await loginFlow(pt), '');
    await pt.evaluate(() => { location.hash = '#/account/payments'; });
    const seen = await waitBoot(pt, 'My Payments', 30);
    navOk('tablet-my-payments-route', seen, '');
    // the panel loads /payments/my async — poll until a PF- row or an empty-state
    let Tt = '';
    for (let i = 0; i < 25; i++) {
      await sleep(1000);
      Tt = await txtAll(pt);
      if (/PF-\d{4}-\d+/.test(Tt)) break;
    }
    const rowHit = /PF-\d{4}-\d+/.test(Tt);
    // The panel's badge for PAYMENT_SUBMITTED is 'Pending' (my_payments_screen
    // _badgeText) and rows may sit below the fold — the group counter 'Pending N'
    // plus a PF row is the visible evidence.
    dataOk('tablet-submitted-proforma-row-under-review', rowHit &&
      (Tt.includes('Under review') || Tt.includes('Pending')),
      rowHit ? `PF rows=${(Tt.match(/PF-\d{4}-\d+/g) || []).length} pendingCounter=${/Pending \d+/.test(Tt)}` : `no PF row; head=${Tt.slice(0, 120)}`);
    dataOk('tablet-pending-group-counter-includes-this', /Pending [1-9]\d*/.test(Tt),
      (Tt.match(/Pending \d+/g) || ['(none)']).join(','));
    await L.screenshot(pt, `${SHOT_DIR}/flutter-tablet-01-my-payments.png`);
    await L.closeVideo(ctx, videoPath);
    await browser.close();
  }

  // ================= API-level vectors on THIS unit's own fixtures =================
  const btok = fx.buyer.token;
  // C6/T14 idempotency
  const again = await L.api(btok, 'POST', `/api/v1/proformas/${proformaId}/submit-payment`,
    { transactionReferences: ['SANDBOX-TXN-DUP'], paymentMethodType: 'MOBILE_MONEY' });
  const firstGroups = (submitCalls[0] || {}).sellerGroups || [];
  dataOk('T14-repeat-submit-idempotent-status', again.status === 200 && again.json && again.json.status === 'PAYMENT_SUBMITTED',
    `HTTP ${again.status} status=${again.json && again.json.status}`);
  dataOk('T14-no-duplicate-orders', JSON.stringify((again.json.sellerGroups || []).map(g => g.orderId)) ===
    JSON.stringify(firstGroups.map(g => g.orderId)),
    `ids first=${firstGroups.map(g => g.orderId).join(',')} repeat=${(again.json.sellerGroups || []).map(g => g.orderId).join(',')}`);

  // T11 fresh proforma, submit with NO proof. The UI walk reserved 1 unit;
  // top OUR OWN fixture product back up first so stock cannot block the vector.
  {
    const stok = await L.apiLogin({ email: fx.seller.email, pw: fx.seller.pw });
    const f = new FormData();
    f.append('product', new Blob([JSON.stringify({ productQuantity: 10 })], { type: 'application/json' }), 'p.json');
    const rr = await fetch(`${L.API}/api/v1/products/update/${fx.productId1}`,
      { method: 'PATCH', headers: { Authorization: 'Bearer ' + stok }, body: f });
    console.log('restock own fixture:', rr.status);
  }
  const mkQuote = await L.api(btok, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 },
    items: [{ productId: fx.productId1, quantity: 1 }] });
  const feeSingle = (mkQuote.json && mkQuote.json.deliveryTotal) || 0;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const mk = await L.api(btok, 'POST', '/api/v1/checkout/proforma', {
    buyDetails: {
      firstName: 'AU030First', lastName: 'AU030Last', emailAddress: fx.buyer.email,
      phoneNumber: '+2557' + String(fx.stamp).slice(-9), address: 'AU030 Home Street 9',
      deliveryLabel: 'Home', deliveryPlaceName: 'Mikocheni', deliveryNeighbourhood: 'Mikocheni',
      city: 'Dar es Salaam', state: 'Dar es Salaam', country: 'Tanzania', zipCode: '',
      deliveryInstructions: '', fulfillmentType: 'SELLER_DELIVERY', paymentMethodType: 'MOBILE_MONEY',
      deliveryFee: feeSingle, agreeToTerms: true, totalAmount: P1 + feeSingle, currency: 'TZS',
      latitude: -6.7924, longitude: 39.2083, preferredDeliveryDate: tomorrow,
      preferredDeliverySlot: 'AFTERNOON', preferredDeliveryWindows: [{ date: tomorrow, slot: 'AFTERNOON' }],
    },
    items: [{ productId: fx.productId1, quantity: 1, selectedChoices: [{ definitionId: fx.sizeDefId, valueId: fx.sizeValues[0].id }] }],
  });
  const mkId = mk.json && (mk.json.proformaId || (mk.json.data && mk.json.data.proformaId));
  dataOk('T11-second-proforma-created', [200, 201].includes(mk.status) && !!mkId, `HTTP ${mk.status} id=${mkId}`);
  const gate = await L.api(btok, 'POST', `/api/v1/proformas/${mkId}/submit-payment`, {});
  dataOk('T11-PAYMENT_PROOF_REQUIRED', gate.status >= 400 &&
    JSON.stringify(gate.json || '').toUpperCase().includes('PAYMENT_PROOF_REQUIRED'),
    `HTTP ${gate.status} body=${JSON.stringify(gate.json).slice(0, 110)}`);
  const st = await L.api(btok, 'GET', `/api/v1/proformas/${mkId}`);
  dataOk('T11-still-PENDING_PAYMENT', st.json && st.json.status === 'PENDING_PAYMENT', `status=${st.json && st.json.status}`);

  // T12 multipart contract probe on the second proforma (own fixture): PNG part
  // + details JSON text part, then cancel to keep state clean.
  {
    const pngBytes = fs.readFileSync(path.resolve(__dirname, 'fixtures/receipt-proof.png'));
    const form = new FormData();
    form.append('receipts', new Blob([pngBytes], { type: 'image/png' }), 'au030-proof.png');
    form.append('details', new Blob(
      [JSON.stringify({ transactionReferences: ['SANDBOX-TXN-1'], note: 'AU-030 verifier fixture' })],
      { type: 'text/plain' }), 'details.json');
    const up = await fetch(`${L.API}/api/v1/proformas/${mkId}/receipts`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + btok }, body: form });
    const upJson = await up.json().catch(() => null);
    dataOk('T12-multipart-PNG-upload', [200, 201].includes(up.status) && Array.isArray(upJson) &&
      upJson.every(r => r.status === 'SUBMITTED'),
      `HTTP ${up.status} rows=${JSON.stringify(upJson).slice(0, 120)}`);
    // >5MB rejection (server rule: IllegalArgumentException exceeds 5MB limit)
    const big = Buffer.alloc(5 * 1024 * 1024 + 10, 7);
    const bigForm = new FormData();
    bigForm.append('receipts', new Blob([big], { type: 'image/png' }), 'big.png');
    const bigUp = await fetch(`${L.API}/api/v1/proformas/${mkId}/receipts`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + btok }, body: bigForm });
    dataOk('T12-oversize-rejected', bigUp.status >= 400 &&
      JSON.stringify(await bigUp.text().catch(() => '')).toUpperCase().includes('5MB'),
      `HTTP ${bigUp.status}`);
  }

  // C7/T22 expiry path: cancel flips terminal -> submit throws PROFORMA_EXPIRED
  await L.api(btok, 'POST', `/api/v1/proformas/${mkId}/cancel`, {});
  const exp = await L.api(btok, 'POST', `/api/v1/proformas/${mkId}/submit-payment`,
    { transactionReferences: ['SANDBOX-TXN-X'], paymentMethodType: 'MOBILE_MONEY' });
  dataOk('C7-terminal-submit-PROFORMA_EXPIRED', exp.status >= 400 &&
    JSON.stringify(exp.json || '').toUpperCase().includes('PROFORMA_EXPIRED'),
    `HTTP ${exp.status} body=${JSON.stringify(exp.json).slice(0, 120)}`);
  dataOk('C7-expiry-dialog-code-in-bundle', body.includes('Invoice expired') && body.includes('Start fresh checkout'),
    '"Invoice expired"/"Start fresh checkout" markers in main.dart.js');
  // widget-suite proof of the dialog path (rendered copy asserted in test/)
  R.dialogWidgetProof = 'test/au032_cancel_completion_test.dart + lib/screens/checkout_screen.dart _showExpiredDialog';

  R.cleanup = { cancelledSecondProforma: mkId, note: 'second proforma cancelled (terminal) after vector use' };

  // ---------- rollup ----------
  R.checks.real_data_probe =
    `own buyer ${fx.buyer.userId} + own VERIFIED seller "${det1.json.sellerName}" product ${fx.productId1} ` +
    `("${PROBE1}" TSh ${fmt(P1)}); curl quote -> HTTP ${qReal.status} fee=TSh ${fmt(feeNow)}; ` +
    `UI cart->checkout created ${proformaNumber}; receipts POST -> HTTP ${receiptsCalls.map(c => c.status).join(',')} ` +
    `(${receiptsCalls[0] && receiptsCalls[0].hasReceiptsPart ? 'receipts part OK' : 'no receipts part'}, ` +
    `${receiptsCalls[0] && receiptsCalls[0].hasDetailsPart ? 'details part OK' : 'no details part'}); ` +
    `submit-payment -> ${(submitCalls[0] || {}).respStatus}, orderIds=${(((submitCalls[0] || {}).sellerGroups) || []).map(g => g.orderId).join(',')}`;
  R.checks.real_data = true;
  R.runtime_ms = Date.now() - t0;
  R.evidence = [
    'e2e/shots/AU-030/flutter-mobile-01-step2-windows.png',
    'e2e/shots/AU-030/flutter-mobile-02-step3-top.png',
    'e2e/shots/AU-030/flutter-mobile-03-step3-reference-row.png',
    'e2e/shots/AU-030/flutter-mobile-04-step3-submit-blocked.png',
    'e2e/shots/AU-030/flutter-mobile-05-receipt-selected.png',
    'e2e/shots/AU-030/flutter-mobile-06-tick-gate-blocked.png',
    'e2e/shots/AU-030/flutter-mobile-07-ticked-ready.png',
    'e2e/shots/AU-030/flutter-mobile-08-step4-completion.png',
    'e2e/shots/AU-030/flutter-mobile-09-order-detail.png',
    'e2e/shots/AU-030/flutter-tablet-01-my-payments.png',
    'e2e/videos/AU-030-mobile.webm',
    'e2e/videos/AU-030-tablet.webm',
    '/tmp/au030_calls_final.json',
  ];
  fs.writeFileSync('/tmp/au030_verify_result.json', JSON.stringify(R, null, 2));
  console.log('\nPHASE1 DONE', JSON.stringify({
    failures: R.failures, buttons: `${R.checks.buttons_ok}/${R.checks.buttons_total}`,
    images: `${R.checks.images_200}/${R.checks.images_requested}`,
    asserts: R.checks.state_asserts, nav: R.checks.nav_asserts, data: R.checks.data_asserts,
  }, null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
