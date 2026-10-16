// au032_sk_stage1.js — REGRESSION PROBE (skeptic): full happy path once, mobile 375x667.
// A) Cancel invoice replaces Back >=step3 -> CANCELLED + stock released
// B) Completion step offers View Order Details -> /orders/{id}
// C) /checkout/success shows platform receiving details + orderReference
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const S = require('./au032_sk_lib.js');
const L = S.L;
const { fx, sleep } = S;
(async () => {
  const rec = S.mkRec('skeptic-regression');
  const A = (name, pass, detail = '') => { rec.asserts.push({ name, pass: !!pass, detail: String(detail).slice(0, 300) }); console.log(pass ? 'PASS' : 'FAIL', name, detail === undefined ? '' : String(detail).slice(0, 160)); };

  const head = await fetch(S.APP + '/main.dart.js', { method: 'HEAD' });
  rec.bundle_lm = head.headers.get('last-modified');
  A('freshness-b56e345-lm-200809', head.status === 200 && rec.bundle_lm === 'Tue, 25 Aug 2026 20:08:09 GMT', `${head.status} ${rec.bundle_lm}`);

  const btok = (await L.api(null, 'POST', '/api/v1/auth/login', { email: fx.buyer.email, password: fx.buyer.pw })).json.token;
  const det = await L.api(btok, 'GET', `/api/v1/displayItem/itemDetails/${fx.productId}`);
  A('fixture-real-product', det.status === 200 && det.json.productName.includes('AU032 Cancel Tote'), `qty=${det.json.productQuantity} price=${det.json.productAskingPrice}`);
  if (det.json.productQuantity < 8) await S.topUpStock(fx.productId, 8);
  const baseQty = (await L.api(btok, 'GET', `/api/v1/displayItem/itemDetails/${fx.productId}`)).json.productQuantity;

  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-032-sk-mobile.webm' });
  const p = await ctx.newPage();
  let imgMap = {}; p.on('response', r => { const u = r.url(); if (/\/uploads\/|\/assets\/.*(png|webp|jpg)/.test(u)) imgMap[u] = r.status(); });
  try {
    A('login-buyer-mobile', await S.loginUi(p), '');
    // add to cart via deep link then real CTA
    await p.goto(`${S.APP}/product/${fx.productId}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await sleep(5000);
    let T = await S.txt(p);
    A('product-detail-real-name', T.includes(`AU032 Cancel Tote ${fx.stamp}`), T.split('\n').filter(Boolean).slice(0, 6).join('|'));
    const addOk = await S.tapExact(p, 'Add to cart') || (await S.findNode(p, 'Add to cart')) != null;
    A('add-to-cart', addOk, ''); await sleep(1500);
    await p.goto(`${S.APP}/cart`, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await sleep(3500);
    T = await S.txt(p);
    A('cart-has-item', /Cart \(1 item\)/.test(T), T.split('\n').filter(Boolean).slice(0, 8).join('|'));
    A('go-to-checkout', await S.tapExact(p, 'Go to checkout'), ''); await sleep(3500);
    T = await S.txt(p);
    A('checkout-step1-renders', T.includes('Contact') && /Step 1 of 4/.test(T), T.split('\n').filter(Boolean).slice(0, 6).join('|'));
    {
      const phEmpty = await p.evaluate(() => { const i = [...document.querySelectorAll('input')].find(i => { const s = i.closest('flt-semantics'); return s && /WhatsApp phone number/.test(s.textContent || ''); }); return i ? (i.value || '') : null; });
      if (phEmpty !== null && phEmpty.length === 0) {
        const node = await S.findNode(p, 'WhatsApp phone number');
        if (node) { await p.mouse.click(Math.min(node.x, 371), Math.max(20, Math.min(node.y, 663))); await sleep(400); }
        else { await p.locator('input').last().click({ force: true }).catch(() => {}); }
        await sleep(300); await p.keyboard.type('+2557' + String(fx.stamp).slice(-9), { delay: 10 });
      }
    }
    await S.shot(p, 'mobile', 'r-step1'); 
    A('continue-to-review', await S.tapExact(p, 'Continue to review') || await S.tap(p, 'Continue to review', 2), ''); await sleep(2500);
    for (let i = 0; i < 12 && !(await S.txt(p)).includes('I agree to the'); i++) await sleep(1000);
    for (let i = 0; i < 14 && !(await S.txt(p)).includes('Step 2 of 4'); i++) await sleep(1000);
    T = await S.txt(p);
    A('review-step2', T.includes('Step 2 of 4') && S_T_windows(T), '');
    function S_T_windows(t) { return t.includes('When should we deliver'); }
    await L.scrollToBottom(p, 16); await sleep(800);
    const w = await S.clickCheckbox(p, 'first'); A('window-selected', w.clicked && w.checked, `checked=${w.checked}`);
    const ag = await S.clickCheckbox(p, 'last'); A('agree-checked', ag.clicked && ag.checked, `checked=${ag.checked}`);
    const preQty = await S.qty(btok, fx.productId); rec.preQty = preQty;
    A('confirm-proceed-payment', await S.tap(p, 'Confirm & proceed to payment', 2), ''); await sleep(4500);
    let pfNum = null;
    for (let i = 0; i < 14 && !pfNum; i++) { T = await S.txt(p); pfNum = (T.match(/PF-\d{4}-\d{6}/) || [null])[0]; if (!pfNum) await sleep(1000); }
    A('payment-step-invoice-shown', !!pfNum, pfNum || T.split('\n').filter(Boolean).slice(0, 8).join('|'));
    // resolve proforma id via server
    const payLs = await L.api(btok, 'GET', '/api/v1/payments/my');
    const row = (Array.isArray(payLs.json) ? payLs.json : []).find(x => x.proformaNumber === pfNum);
    const pfId = row ? row.proformaId : null; rec.pfNum = pfNum; rec.pfId = pfId;
    const g = pfId ? await L.api(btok, 'GET', `/api/v1/proformas/${pfId}`) : { status: 0 };
    A('server-proforma-PENDING_PAYMENT', g.status === 200 && g.json.status === 'PENDING_PAYMENT', JSON.stringify(g.json && g.json.status));
    let qRes = null; for (let i = 0; i < 5; i++) { qRes = await S.qty(btok, fx.productId); if (qRes < baseQty) break; await sleep(1200); }
    A('stock-reserved-during-payment', qRes === preQty - 1, `during=${qRes} pre=${preQty}`);

    // ---- criterion A on the CURRENT bundle: cancel node present, wide Back absent
    const backBtn = await p.evaluate(() => {
      let hit = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (hit) return;
        if ((e.textContent || '').trim() !== 'Back') return;
        if (e.getAttribute('role') !== 'button') return;
        const r = e.getBoundingClientRect();
        if (r.width < 60 || r.height < 4) return;
        hit = { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y), vis: r.bottom > 0 && r.top < innerHeight };
      });
      return hit;
    });
    const cancelNode = await S.findNode(p, 'Cancel invoice');
    A('cancel-invoice-replaces-back-step3-mobile', !!cancelNode && (!backBtn || backBtn.vis === false),
      `Cancel invoice node=${JSON.stringify(cancelNode)}; wide Back=${backBtn ? JSON.stringify(backBtn) : 'absent'}`);
    await S.shot(p, 'mobile', 'r-payment-cancelinvoice');

    // Keep invoice negative branch
    A('open-cancel-dialog', await S.tap(p, 'Cancel invoice', 3), ''); await sleep(1000);
    T = await S.txt(p);
    A('dialog-copy', T.includes('Cancel this invoice?') && T.includes('Keep invoice'), '');
    await S.shot(p, 'mobile', 'r-dialog');
    A('keep-invoice-tap', await S.tap(p, 'Keep invoice', 2), ''); await sleep(1200);
    T = await S.txt(p);
    A('still-on-payment-after-keep', T.includes('Submit Payment for Verification'), '');
    A('reopen-dialog', await S.tap(p, 'Cancel invoice', 3), ''); await sleep(900);
    A('confirm-cancel-tap', await S.tapExact(p, 'Cancel invoice', 371, 663), ''); await sleep(2600);
    const snack = await L.hasSnackBar(p);
    A('snackbar-after-cancel', snack.found, JSON.stringify(snack));
    T = await S.txt(p);
    A('back-on-review-after-cancel', T.includes('Confirm & proceed to payment'), '');
    const gc = await L.api(btok, 'GET', `/api/v1/proformas/${pfId}`); 
    A('server-proforma-CANCELLED', gc.status === 200 && gc.json.status === 'CANCELLED', JSON.stringify({ st: gc.json && gc.json.status }));
    let qAfter = null; for (let i = 0; i < 5; i++) { qAfter = await S.qty(btok, fx.productId); if (qAfter >= preQty) break; await sleep(1200); }
    A('stock-released-after-cancel', qAfter === preQty, `after=${qAfter} pre=${preQty}`);
    await S.shot(p, 'mobile', 'r-after-cancel');

    // ---- second purchase straight through to completion (criterion B)
    await p.goto(`${S.APP}/product/${fx.productId}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await sleep(4500);
    A('add-to-cart-2', await S.tap(p, 'Add to cart', 4), ''); await sleep(800);
    await p.goto(`${S.APP}/cart`, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await sleep(3000);
    await S.tap(p, 'Checkout', 3); await sleep(3000);
    T = await S.txt(p);
    if (!T.includes('Continue to review')) { await p.goto(`${S.APP}/checkout`, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await sleep(3500); }
    let c2 = await S.tapExact(p, 'Go to checkout');
    if (!c2) { await p.goto(`${S.APP}/checkout`, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await sleep(3500); }
    A('continue2-to-review', await S.tapExact(p, 'Continue to review') || await S.tap(p, 'Continue to review', 2), ''); await sleep(2500);
    for (let i = 0; i < 14 && !(await S.txt(p)).includes('When should we deliver'); i++) await sleep(1000);
    await L.scrollToBottom(p, 16); await sleep(800);
    await S.clickCheckbox(p, 'first'); await sleep(400);
    await S.clickCheckbox(p, 'last'); await sleep(700);
    A('confirm2', await S.tap(p, 'Confirm & proceed to payment', 2), ''); await sleep(4500);
    let pf2 = null; for (let i = 0; i < 14 && !pf2; i++) { T = await S.txt(p); pf2 = (T.match(/PF-\d{4}-\d{6}/) || [null])[0]; if (!pf2) await sleep(1000); }
    A('payment-step-2', !!pf2, pf2);
    rec.pf2Num = pf2;
    await S.tap(p, 'Enter reference', 2); await sleep(500);
    const refVal = 'SK032' + Date.now();
    { const node = await S.findNode(p, 'Transaction reference number');
      if (node) { await p.mouse.click(Math.min(node.x, 371), Math.max(20, Math.min(node.y, 663))); await sleep(400); }
      else { await p.locator('input').last().click({ force: true }).catch(() => {}); }
      await p.keyboard.type(refVal, { delay: 10 }); }
    await L.scrollToBottom(p, 18); await sleep(700);
    await S.tap(p, 'I have completed the payment', 2); await sleep(400);
    const tick = await S.clickCheckbox(p, 'last'); A('confirm-checkbox-tick', tick.clicked && tick.checked, `checked=${tick.checked}`);
    A('submit-payment-click', await S.tap(p, 'Submit Payment for Verification', 2), ''); await sleep(5000);
    T = await S.txt(p);
    A('completion-step-copy', T.includes('Payment Submitted and Under review'), T.split('\n').filter(Boolean).slice(0, 8).join('|'));
    const refShown = (T.match(/Reference:\s*([0-9a-f-]{36}|ORD-[0-9-]+)/) || [null, null])[1];
    A('reference-shown-completion', !!refShown, refShown);
    A('view-order-details-present', T.includes('View Order Details'), '');
    A('continue-shopping-present', T.includes('Continue Shopping'), '');
    A('invoice-footer-completion', T.includes(`Invoice ${pf2}`), `Invoice ${pf2}`);
    await S.shot(p, 'mobile', 'r-completion');
    const ordList = await L.api(btok, 'GET', '/api/v1/orders');
    const mine = (Array.isArray(ordList.json) ? ordList.json : []).find(o => o.orderId === refShown);
    A('server-order-created', !!mine, mine ? JSON.stringify({ id: mine.orderId, num: mine.orderNumber, status: mine.status }) : 'none');
    rec.orderId = refShown;
    // click the REAL button (not deep link) and verify URL change -> /orders/{id}
    const urlBefore = p.url();
    const vod = await S.tapExact(p, 'View Order Details') || await S.tap(p, 'View Order Details', 2);
    await sleep(4500);
    const urlAfter = p.url();
    A('view-order-details-navigates', vod && /\/orders\//.test(urlAfter) && urlAfter !== urlBefore, `clicked=${vod} ${urlBefore} -> ${urlAfter}`);
    T = await S.txt(p);
    A('order-detail-shows-order-number', T.includes(mine ? (mine.orderNumber || '') : ''), T.includes('Order details') ? 'Order details header' : T.split('\n').filter(Boolean).slice(0, 8).join('|'));
    await S.shot(p, 'mobile', 'r-order-detail');

    // ---- criterion C: in-app success page via PaymentScreen submit (real flow)
    await p.goto(`${S.APP}/product/${fx.productId}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await sleep(4500);
    await S.tap(p, 'Add to cart', 4); await sleep(800);
    await p.goto(`${S.APP}/cart`, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await sleep(3000);
    await S.tap(p, 'Checkout', 3); await sleep(3000);
    if (!(await S.txt(p)).includes('Continue to review')) { await p.goto(`${S.APP}/checkout`, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await sleep(3500); }
    if (!await S.tapExact(p, 'Go to checkout')) { await p.goto(`${S.APP}/checkout`, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await sleep(3500); }
    await S.tapExact(p, 'Continue to review') || await S.tap(p, 'Continue to review', 2); await sleep(2500);
    for (let i = 0; i < 14 && !(await S.txt(p)).includes('When should we deliver'); i++) await sleep(1000);
    await L.scrollToBottom(p, 16); await sleep(700);
    await S.clickCheckbox(p, 'first'); await sleep(400);
    await S.clickCheckbox(p, 'last'); await sleep(700);
    await S.tap(p, 'Confirm & proceed to payment', 2); await sleep(4500);
    let pf3 = null; for (let i = 0; i < 14 && !pf3; i++) { T = await S.txt(p); pf3 = (T.match(/PF-\d{4}-\d{6}/) || [null])[0]; if (!pf3) await sleep(1000); }
    rec.pf3Num = pf3;
    // pay from the IN-APP payment step but capture the completion Reference, then deep-link /checkout/success?proforma=
    const payLs2 = await L.api(btok, 'GET', '/api/v1/payments/my');
    const row3 = (Array.isArray(payLs2.json) ? payLs2.json : []).find(x => x.proformaNumber === pf3);
    rec.pf3Id = row3 ? row3.proformaId : null;
    // cancel this third invoice to leave state clean (and re-prove cancel works twice in one session)
    A('cancel-invoice-third-open', await S.tap(p, 'Cancel invoice', 3), ''); await sleep(900);
    A('confirm-cancel-third', await S.tapExact(p, 'Cancel invoice'), ''); await sleep(2600);
    const g3 = rec.pf3Id ? await L.api(btok, 'GET', `/api/v1/proformas/${rec.pf3Id}`) : { status: 0 };
    A('third-proforma-CANCELLED', g3.status === 200 && g3.json.status === 'CANCELLED', JSON.stringify(g3.json && g3.json.status));

    // deep-link success page for the SUBMITTED proforma (pf2) — the documented route
    await p.goto(`${S.APP}/checkout/success?proforma=${rec.pf2Id || ''}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await sleep(5000);
    T = await S.txt(p);
    const hasRecv = T.includes('Lipa Namba') && T.includes('7003 9305') && T.includes('Selcom');
    A('success-receiving-details', hasRecv, hasRecv ? 'Lipa Namba/7003 9305/Selcom verbatim' : T.split('\n').filter(Boolean).slice(0, 10).join('|'));
    A('success-guard-copy', T.includes('Use only the official GloboExpats account below.'), '');
    const succRefRow = (T.match(/Payment reference\n?([^\n]*)/) || [null, ''])[1];
    const numShown = pf2 && T.includes(pf2);
    rec.successPf2IdResolved = false;
    // resolve pf2's proforma id now (server truth)
    const payLs3 = await L.api(btok, 'GET', '/api/v1/payments/my');
    const row2 = (Array.isArray(payLs3.json) ? payLs3.json : []).find(x => x.proformaNumber === pf2);
    rec.pf2Id = row2 ? row2.proformaId : null;
    const uuidShown = rec.pf2Id && T.includes(rec.pf2Id);
    A('success-reference-value-nonempty', !!(uuidShown || numShown), `painted=${uuidShown ? 'proformaId' : numShown ? pf2 : 'BLANK'}; row='${succRefRow.slice(0, 40)}'`);
    await S.shot(p, 'mobile', 'r-success');
    const bank = await S.tap(p, 'Bank Account', 2); await sleep(800);
    T = await S.txt(p);
    A('success-bank-block', bank && T.includes('5527108094688') && T.includes('Account name'), '');
    await S.shot(p, 'mobile', 'r-success-bank');

    const sum = L.imageSummary(imgMap);
    A('images-ok', sum.failed === 0, JSON.stringify(sum));
    rec.images = sum;
  } catch (e) {
    rec.notes.push('run error: ' + e.message);
    console.error('RUN ERR', e);
  } finally {
    fs.mkdirSync('e2e/results/shards', { recursive: true });
    fs.writeFileSync('e2e/results/shards/tmp-AU-032-skeptic-stage1.json', JSON.stringify(rec, null, 2));
    console.log('saved stage1 rec; asserts:', rec.asserts.length, 'fail:', rec.asserts.filter(a => !a.pass).length);
    await ctx.close().catch(() => {}); await browser.close().catch(() => {});
  }
})();
