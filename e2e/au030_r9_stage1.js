// au030_r9_stage1.js — AU-030 verify-r9 MOBILE 375x667 on the FROZEN RO lane :9130.
// Real receipt upload via Playwright filechooser + setInputFiles; wire taps on
// /proformas/{id}/receipts and /submit-payment; C1 xor, C2 tick gate, C4 multipart,
// C5 status==PAYMENT_SUBMITTED success branch. Writes /tmp/au030_r9_stage1.json.
const fs = require('fs');
const path = require('path');
const L = require('./au030_r9_lib.js');
const fx = JSON.parse(fs.readFileSync('/tmp/au030_fixtures.json', 'utf8'));
const SHOT_DIR = 'e2e/shots/AU-030';
const PROBE1 = `AU030 Guard Tote ${fx.stamp}`;
const fmt = n => Number(n).toLocaleString('en-US');

const out = { asserts: [], failures: [], buttons: [], data: [], navs: [], receiptsCalls: [], submitCalls: [], images: {}, shots: [] };
function ok(name, cond, detail) {
  const line = `${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`;
  console.log(line); (cond ? out.asserts : out.failures).push(`${name} ${cond ? 'OK' : 'FAILED'} ${detail || ''}`);
  return cond;
}
async function T(p) { return await L.txt(p); }

(async () => {
  // ---------- 1. FRESHNESS ----------
  const fr = await fetch(L.APP + '/main.dart.js', { method: 'HEAD' });
  const lm = fr.headers.get('last-modified');
  ok('freshness-main.dart.js-LastModified', fr.status === 200 && lm === 'Wed, 26 Aug 2026 00:58:48 GMT', `HTTP ${fr.status} Last-Modified=${lm}`);
  out.build_mtime = lm;

  const videoPath = 'e2e/videos/AU-030-r9-375.webm';
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath });
  const p = await ctx.newPage();
  p.on('response', r => {
    const u = r.url();
    if (/\/proformas\/[^/]+\/receipts/.test(u)) {
      let body = null; try { body = null; } catch (e) {}
      const req = r.request(); const post = req.postData() || '';
      out.receiptsCalls.push({ method: req.method(), status: r.status(), url: u,
        auth: !!req.headers()['authorization'],
        ct: req.headers()['content-type'] || '(none)',
        hasReceiptsPart: post.includes('name="receipts"'),
        hasDetailsPart: post.includes('name="details"'),
        detailsSnippet: (post.match(/name="details"\r?\n\r?\n([^\r]{0,140})/) || [])[1] || null });
      r.text().then(t => { const c = out.receiptsCalls[out.receiptsCalls.length - 1]; try { c.respBody = JSON.parse(t); } catch (e) { c.respBodyRaw = t.slice(0, 200); } }).catch(() => {});
    }
    if (/\/submit-payment/.test(u)) {
      const req = r.request();
      const sc = { method: req.method(), status: r.status(), url: u, auth: !!req.headers()['authorization'], post: req.postData() };
      out.submitCalls.push(sc);
      r.text().then(t => { const c = out.submitCalls[out.submitCalls.length - 1]; try { c.resp = JSON.parse(t); } catch (e) { c.respRaw = t.slice(0, 200); } }).catch(() => {});
    }
  });
  const imgMap = L.watchImages(p);
  out.images = imgMap;

  // ---------- login by real token injection ----------
  const token = await L.apiLogin(fx.buyer.email, fx.buyer.pw);
  await L.injectSession(p, fx.buyer.email, token, []);
  await L.gotoApp(p);
  for (let i = 0; i < 25; i++) { if ((await L.nodeCount(p)) > 30) break; await L.sleep(800); }
  ok('buyer-session-restored-from-real-JWT', (await p.evaluate(() => !!localStorage.getItem('flutter.auth_token'))) === true,
    `${fx.buyer.email.slice(0, 18)}... userId=${fx.buyer.userId}`);

  // ---------- cart through REAL UI path ----------
  await L.hashNav(p, '#/product/' + fx.productId1);
  ok('nav-product-detail-open', await L.waitText(p, 'Add to cart', 40000), `#/product/${fx.productId1}`);
  let t = '';
  for (let i = 0; i < 20 && !t.includes(PROBE1); i++) { await L.sleep(1000); t = await T(p); }
  ok('data-fixture-product-name-rendered', t.includes(PROBE1), PROBE1);
  ok('data-fixture-price-rendered', t.includes(fmt(fx.productId1Price)), `TSh ${fmt(fx.productId1Price)} in a11y text`);

  // pick choice value "L" (scroll into view, coordinate tap)
  const chip = await L.scrollToFind(p, () => {
    let hit = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (hit) return;
      if ((e.textContent || '').trim() === 'L') {
        const r = e.getBoundingClientRect();
        if (r.width > 20 && r.height > 10 && r.y > 40 && (r.y + r.height) < innerHeight - 10)
          hit = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    });
    return hit;
  }, 8);
  if (chip) { await p.mouse.click(chip.x, chip.y); await L.sleep(900); }
  out.buttons.push(`choose-size-L:${chip ? 'ok' : 'FAIL'}`);
  ok('btn-choose-size-L', !!chip, chip ? 'choice chip tapped' : 'chip never in view');

  const addOk = await L.clickBtnLocator(p, 'Add to cart');
  out.buttons.push(`add-to-cart:${addOk ? 'ok' : 'FAIL'}`); ok('btn-add-to-cart-clicked', addOk, 'real cart mutation through UI');
  await L.sleep(1500);

  // ---------- checkout step 1 -> 2 -> 3 ----------
  await L.hashNav(p, '#/checkout');
  ok('nav-checkout-step1-reached', await L.waitText(p, 'Order Summary', 40000), '#/checkout (no reload)');
  t = await T(p);
  ok('data-cart-line-in-order-summary', t.includes(PROBE1), `line "${PROBE1}" present`);
  const contOk = await L.clickBtnLocator(p, 'Continue to review');
  out.buttons.push(`continue-to-review:${contOk ? 'ok' : 'FAIL'}`);
  ok('nav-step-2-of-4-reached', await L.waitText(p, 'Step 2 of 4', 40000), '');

  // delivery window checkbox
  let winSeen = false;
  for (let i = 0; i < 14 && !winSeen; i++) { winSeen = (await T(p)).includes('When should we deliver'); if (!winSeen) await L.sleep(900); }
  const cbCount2 = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].filter(e => e.getAttribute('role') === 'checkbox').length);
  ok('tick-window-row-present', winSeen || cbCount2 >= 1, `labelInTree=${winSeen} checkboxes=${cbCount2}`);
  const w = await L.clickCheckbox(p, 'first');
  out.buttons.push(`select-first-window:${w.clicked && w.checked ? 'ok' : 'FAIL'}`);
  ok('btn-select-first-window', w.clicked && w.checked === true, `aria-checked=${w.checked}`);
  await L.screenshot(p, `${SHOT_DIR}/AU-030-r9-375-01-step2-windows.png`); out.shots.push('01-step2-windows');

  // terms tick + Confirm
  const confLoc = L.btnLoc(p, 'Confirm & proceed to payment');
  let confVis = false;
  for (let i = 0; i < 26; i++) {
    const vh = await p.evaluate(() => innerHeight).catch(() => 667);
    const bb = await confLoc.boundingBox().catch(() => null);
    if (bb && bb.y > 40 && (bb.y + bb.height) < vh - 10) { confVis = true; break; }
    await p.mouse.move(187, 300).catch(() => {}); await p.mouse.wheel(0, 240).catch(() => {}); await L.sleep(200);
  }
  ok('confirm-button-scrolled-into-view', confVis, '');
  const trm = await L.clickCheckbox(p, 'last');
  out.buttons.push(`terms-tick:${trm.clicked && trm.checked ? 'ok' : 'FAIL'}`);
  ok('btn-terms-tick', trm.clicked && trm.checked === true, `aria-checked=${trm.checked}`);
  await L.screenshot(p, `${SHOT_DIR}/AU-030-r9-375-01b-step2-ticked.png`); out.shots.push('01b-step2-ticked');
  let confClicked = false;
  try { await confLoc.click({ timeout: 9000 }); confClicked = true; } catch (e) { console.log('confirm-fail', String(e).slice(0, 80)); }
  out.buttons.push(`confirm-review:${confClicked ? 'ok' : 'FAIL'}`);
  ok('btn-confirm-and-proceed-to-payment', confClicked, 'step2 -> step3');
  ok('nav-step-3-of-4-reached', await L.waitText(p, 'Step 3 of 4', 45000), 'proforma created server-side');
  await L.sleep(1800);
  t = await T(p);
  const pfNumber = (t.match(/PF-\d{4}-\d+/) || [])[0] || null;
  ok('data-proforma-number-rendered-step3', !!pfNumber, pfNumber || '(none)');
  ok('data-receiving-details-lipa-namba', t.includes('Lipa Namba') && t.includes('7003 9305'), 'MOBILE_MONEY receiving block');
  ok('data-countdown-visible-pending-payment', /Complete payment within \d{2}:\d{2}/.test(t),
    (t.match(/Complete payment within [\d:]+/) || ['(none)'])[0]);
  await L.screenshot(p, `${SHOT_DIR}/AU-030-r9-375-02-step3-top.png`); out.shots.push('02-step3-top');

  // ---------- C1 RECEIPT xor REFERENCE ----------
  ok('data-C1-receipt-active-by-default', t.includes('Choose receipt image'), 'RECEIPT picker row shown');
  ok('ui-proof-mode-receipt-present', t.includes('Upload screenshot'), '');
  ok('ui-proof-mode-reference-present', t.includes('Enter reference'), '');
  const swRef = await L.clickBtnLocator(p, 'Enter reference');
  out.buttons.push(`switch-to-reference:${swRef ? 'ok' : 'FAIL'}`);
  ok('btn-switch-to-reference', swRef, 'REFERENCE activated');
  await L.sleep(1000);
  t = await T(p);
  let refShown = t.includes('Transaction reference number') || t.includes('M-Pesa confirmation code');
  ok('data-C1-reference-mode-exclusive', refShown && !t.includes('Choose receipt image'),
    `refField=${refShown} pickerHidden=${!t.includes('Choose receipt image')}`);
  await L.screenshot(p, `${SHOT_DIR}/AU-030-r9-375-03-step3-reference-row.png`); out.shots.push('03-step3-reference-row');
  const swBack = await L.clickBtnLocator(p, 'Upload screenshot');
  out.buttons.push(`switch-back-to-receipt:${swBack ? 'ok' : 'FAIL'}`);
  ok('btn-switch-back-to-receipt', swBack, '');
  await L.sleep(1000);
  t = await T(p);
  ok('data-C1-receipt-mode-restored-xor', t.includes('Choose receipt image') && !t.includes('Transaction reference number'), 'xor holds');

  // ---------- C2 submit with NO proof, NO tick -> client-side block ----------
  const beforeCalls = out.receiptsCalls.length + out.submitCalls.length;
  const sub1 = await L.clickBtnLocator(p, 'Submit Payment for Verification');
  out.buttons.push(`submit-no-proof-no-tick:${sub1 ? 'ok' : 'FAIL'}`);
  ok('btn-submit-payment-no-proof-clicked', sub1, 'expect client-side block');
  await L.sleep(1300);
  t = await T(p);
  ok('C2-block-copy-shown-zero-calls', t.includes('Add a payment proof') &&
    (out.receiptsCalls.length + out.submitCalls.length) === beforeCalls,
    `copy=${t.includes('Add a payment proof')} callsDelta=${out.receiptsCalls.length + out.submitCalls.length - beforeCalls}`);
  await L.screenshot(p, `${SHOT_DIR}/AU-030-r9-375-04-step3-submit-blocked.png`); out.shots.push('04-submit-blocked');

  // ---------- C4 real PNG upload via file input ----------
  const chooserP = p.waitForEvent('filechooser', { timeout: 20000 }).then(fc => fc).catch(() => null);
  const chooseOk = await L.clickBtnLocator(p, 'Choose receipt image');
  out.buttons.push(`choose-receipt-image:${chooseOk ? 'ok' : 'FAIL'}`);
  ok('btn-choose-receipt-image-clicked', chooseOk, 'opens platform file picker');
  const chooser = await chooserP;
  if (!chooser) {
    out.failures.push('filechooser event never fired — image_picker web not wired on this bundle');
    console.log('FATAL filechooser-missing'); 
  } else {
    await chooser.setFiles(path.resolve(__dirname, 'fixtures/receipt-proof.png'));
    await L.sleep(2000);
    t = await T(p);
    ok('C4-receipt-file-name-rendered', /Receipt: .*receipt-proof\.png/.test(t), (t.match(/Receipt: [^"'\n]{0,60}/) || ['(none)'])[0]);
    await L.screenshot(p, `${SHOT_DIR}/AU-030-r9-375-05-receipt-selected.png`); out.shots.push('05-receipt-selected');

    // proof exists, tick NOT set -> still gated, ZERO network calls
    const b2 = out.receiptsCalls.length + out.submitCalls.length;
    const sub2 = await L.clickBtnLocator(p, 'Submit Payment for Verification');
    out.buttons.push(`submit-proof-unticked:${sub2 ? 'ok' : 'FAIL'}`);
    ok('btn-submit-payment-unticked-clicked', sub2, '');
    await L.sleep(1300);
    t = await T(p);
    ok('C2b-tick-gate-copy-zero-calls', t.includes('Tick "I have completed the payment"') &&
      (out.receiptsCalls.length + out.submitCalls.length) === b2,
      `copy=${t.includes('Tick "I have completed the payment"')} callsDelta=${out.receiptsCalls.length + out.submitCalls.length - b2}`);
    await L.screenshot(p, `${SHOT_DIR}/AU-030-r9-375-06-tick-gate-blocked.png`); out.shots.push('06-tick-gate-blocked');

    // tick then submit -> uploads receipt THEN submits payment
    const tk = await L.clickCheckbox(p, 'last');
    out.buttons.push(`confirmation-tick:${tk.clicked && tk.checked ? 'ok' : 'FAIL'}`);
    ok('btn-confirmation-tick-toggle', tk.clicked && tk.checked === true, `aria-checked=${tk.checked}`);
    await L.screenshot(p, `${SHOT_DIR}/AU-030-r9-375-07-ticked-ready.png`); out.shots.push('07-ticked-ready');
    const sub3 = await L.clickBtnLocator(p, 'Submit Payment for Verification');
    out.buttons.push(`submit-final:${sub3 ? 'ok' : 'FAIL'}`);
    ok('btn-submit-final-clicked', sub3, 'expect receipts POST then submit-payment POST');
    let at4 = false;
    for (let i = 0; i < 50 && !at4; i++) { await L.sleep(1000); at4 = (await T(p)).includes('Payment Submitted'); }
    await L.sleep(1500);
    t = await T(p);
    out.atStep4 = at4;

    // ---- receipts wire assertions ----
    const rc = out.receiptsCalls[0];
    ok('C4-receipt-upload-fired-exactly-once', out.receiptsCalls.length === 1,
      `calls=${out.receiptsCalls.length} statuses=${out.receiptsCalls.map(c => c.status).join(',')}`);
    if (rc) {
      ok('C4-receipt-auth-header', rc.auth, 'Bearer attached');
      ok('C4-multipart-content-type', /multipart\/form-data/i.test(rc.ct), rc.ct.slice(0, 70));
      ok('C4-has-receipts-file-part', rc.hasReceiptsPart, 'field name "receipts"');
      ok('C4-details-part-absent-empty-refs', !rc.hasDetailsPart, `hasDetails=${rc.hasDetailsPart} (RECEIPT mode, empty ref field)`);
      ok('C4-upload-HTTP-200', rc.status >= 200 && rc.status < 300, `HTTP ${rc.status}`);
      const rows = Array.isArray(rc.respBody) ? rc.respBody : null;
      ok('C4-response-rows-SUBMITTED', !!rows && rows.length >= 1 && rows.every(r => r.status === 'SUBMITTED'),
        `rows=${JSON.stringify(rows ? rows.map(r => ({ id: r.receiptId, file: r.fileName, st: r.status })) : rc.respBodyRaw).slice(0, 220)}`);
      ok('C4-row-has-submittedAt', !!rows && !!rows[0] && !!rows[0].submittedAt, String(rows && rows[0] && rows[0].submittedAt));
      out.receiptRow = rows && rows[0];

      // T12 privacy probe: receipt bytes need the token
      if (rows && rows[0] && rows[0].receiptId) {
        const rid = rows[0].receiptId;
        const anon = await fetch(`${L.API}/api/v1/receipts/${rid}/file`, { redirect: 'manual' }).catch(() => ({ status: 0 }));
        const authed = await fetch(`${L.API}/api/v1/receipts/${rid}/file`, { headers: { Authorization: 'Bearer ' + token } }).catch(() => ({ status: 0 }));
        const buf = authed.body ? await authed.arrayBuffer() : null;
        ok('T12-receipt-private-anon-rejected', [0, 401, 403, 302].includes(anon.status), `anon HTTP ${anon.status}`);
        ok('T12-receipt-bytes-with-token', authed.status === 200 && buf && buf.byteLength > 0, `HTTP ${authed.status} bytes=${buf ? buf.byteLength : 0}`);
      }
    }

    // ---- C5 submit-payment result handling ----
    const sc = out.submitCalls[0];
    ok('C5-submit-payment-fired-exactly-once', out.submitCalls.length === 1, `calls=${out.submitCalls.length}`);
    if (sc) {
      ok('C5-submit-auth-header', sc.auth, 'Bearer attached');
      ok('C5-wire-body-method-valid', /MOBILE_MONEY|BANK_TRANSFER/.test(sc.post || '') && !/CARD/.test(sc.post || ''), String(sc.post).slice(0, 90));
      out.respStatus = sc.resp && sc.resp.status;
      ok('C5-success-branch-only-on-PAYMENT_SUBMITTED', at4 === true && sc.resp && sc.resp.status === 'PAYMENT_SUBMITTED',
        `wireStatus=${sc.resp && sc.resp.status} step4Rendered=${at4}`);
      const groups = (sc.resp && sc.resp.sellerGroups) || [];
      const orderIds = groups.map(g => g.orderId).filter(Boolean);
      out.orderIds = orderIds; out.proformaId = sc.resp && sc.resp.proformaId; out.proformaNumberEcho = sc.resp && sc.resp.proformaNumber;
      ok('C5-per-seller-order-id-nonnull', orderIds.length >= 1, `orderIds=${orderIds.join(',')}`);
      ok('C5-proforma-number-echoed', /PF-\d{4}-\d+/.test(sc.resp && sc.resp.proformaNumber || ''), sc.resp && sc.resp.proformaNumber);
    }
    ok('C5-completion-copy-exact', t.includes('Thank you — your payment confirmation has been received.'), (t.match(/Thank you[^\n"]{0,80}/) || ['(none)'])[0]);
    const firstOrder = (out.orderIds || [])[0] || null;
    ok('C5-order-reference-shown', !!firstOrder && t.includes(firstOrder), `ref=${firstOrder}`);
    ok('C5-countdown-hidden-after-submit', !/Complete payment within|Time left/i.test(t), 'countdown hidden once PAYMENT_SUBMITTED');
    out.step4TextHead = t.slice(0, 700);
    await L.screenshot(p, `${SHOT_DIR}/AU-030-r9-375-08-step4-completion.png`); out.shots.push('08-step4-completion');

    // View Order Details control
    const vod = await L.clickBtnLocator(p, 'View Order Details');
    out.buttons.push(`view-order-details:${vod ? 'ok' : 'FAIL'}`);
    ok('btn-view-order-details-clicked', vod, 'completion control');
    let seen = false, dtext = '';
    for (let i = 0; i < 25; i++) { await L.sleep(1000); dtext = await T(p);
      if ((firstOrder && dtext.includes(firstOrder.slice(0, 8))) || /AWAITING_PAYMENT|ORD-\d{4}-\d+/.test(dtext)) { seen = true; break; } }
    ok('nav-view-order-detail-rendered', seen, seen ? (dtext.match(/ORD-\d{4}-\d+|AWAITING_PAYMENT/) || ['order content'])[0] : dtext.slice(-140));
    await L.screenshot(p, `${SHOT_DIR}/AU-030-r9-375-09-order-detail.png`); out.shots.push('09-order-detail');

    // ground truth server-side
    if (firstOrder) {
      const od = await L.api(token, 'GET', `/api/v1/orders/${firstOrder}`);
      out.orderApi = { status: od.status, status_: od.json && od.json.status, paymentStatus: od.json && od.json.paymentStatus, escrowPending: od.json && od.json.escrowPending };
      ok('order-ground-truth-AWAITING_PAYMENT-escrow', od.status === 200 && od.json.status === 'AWAITING_PAYMENT' &&
        od.json.paymentStatus === 'PENDING' && od.json.escrowPending === true,
        `HTTP ${od.status} status=${od.json && od.json.status} payStatus=${od.json && od.json.paymentStatus} escrowPending=${od.json && od.json.escrowPending}`);
    }

    // persisted snapshot + cleared cart
    const snapRaw = await p.evaluate((id) => localStorage.getItem('flutter.order_' + id), firstOrder || '').catch(() => null);
    let snapObj = null, cur = snapRaw;
    for (let r = 0; r < 3 && cur; r++) { try { const v = typeof cur === 'string' ? JSON.parse(cur) : cur;
      if (v && typeof v === 'object' && !Array.isArray(v)) { snapObj = v; break; } if (typeof v === 'string') { cur = v; continue; } break; } catch (e) { break; } }
    ok('C5-order-snapshot-persisted', !!snapObj && (!!snapObj.proformaNumber || !!snapObj.proformaId || !!snapObj.sellerGroups),
      snapObj ? `bytes=${(snapRaw || '').length} keys=${Object.keys(snapObj).slice(0, 8).join(',')}` : `(raw head) ${(snapRaw || '').slice(0, 50)}`);
    const lastRaw = await p.evaluate(() => localStorage.getItem('flutter.lastOrderId')).catch(() => null);
    let last = lastRaw; try { last = JSON.parse(lastRaw || 'null'); } catch (e) {}
    ok('C5-lastOrderId-persisted', last === firstOrder, `stored=${lastRaw} match=${last === firstOrder}`);
    const cartAfter = await p.evaluate(() => Object.keys(localStorage).filter(k => k.includes('expatCartItems'))
      .map(k => localStorage.getItem(k)).join('|')).catch(() => '');
    let cc = cartAfter, arr = null;
    for (let r = 0; r < 3 && typeof cc === 'string'; r++) { try { cc = JSON.parse(cc); } catch (e) { break; } }
    arr = Array.isArray(cc) ? cc : null;
    ok('C5-cart-cleared-after-success', !!arr && arr.length === 0, `stored="${cartAfter.slice(0, 40)}" -> empty=${!!arr && arr.length === 0}`);
  }

  // images rollup
  const imgs = Object.entries(imgMap);
  out.images_requested = imgs.length;
  out.images_200 = imgs.filter(([, s]) => s === 200 || s === 304).length;
  out.images_broken = imgs.filter(([, s]) => s >= 400).map(([u]) => u);

  fs.writeFileSync('/tmp/au030_r9_stage1.json', JSON.stringify(out, null, 1));
  console.log('\nSTAGE1 DONE failures=' + out.failures.length, JSON.stringify(out.failures, null, 1));
  await L.closeVideo(ctx, videoPath);
  await browser.close();
})().catch(e => { console.error('FATAL', e); out.fatal = String(e && e.stack || e).slice(0, 500);
  try { fs.writeFileSync('/tmp/au030_r9_stage1.json', JSON.stringify(out, null, 1)); } catch (_) {}
  process.exit(1); });
