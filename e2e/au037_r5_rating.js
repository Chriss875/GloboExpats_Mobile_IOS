// au037_r5_rating.js — AU-037 rating leg, attempt 2 (fresh DELIVERED order, product 787).
// Drives the REAL app dialog: Confirm Received -> stars -> review text -> Submit,
// then proves server truth: COMPLETED + buyerRated + BUYER_TO_SELLER row verbatim
// + duplicate confirm-receipt -> 409 ALREADY_RATED surfaced.
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs');
(async () => {
  const fx = JSON.parse(fs.readFileSync('/tmp/au037_r5_fixtures.json', 'utf8'));
  const R = { asserts: [], failures: [], network: [] };
  const ok = (n, c, d) => { R.asserts.push({ name: n, pass: !!c, detail: String(d || '').slice(0, 250) }); console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? ' :: ' + String(d).slice(0, 130) : '')); if (!c) R.failures.push(n); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const PID = 787;

  // ---- mint fresh order -> DELIVERED ----
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const buyDetails = { firstName: 'AU037R5', lastName: 'Buyer', emailAddress: fx.buyer.email, phoneNumber: '+255715000777', address: 'au037 r5 seed street', deliveryLabel: 'Home', deliveryPlaceName: '', deliveryNeighbourhood: '', city: 'dar es salaam', state: '', country: 'tanzania', zipCode: '', deliveryInstructions: '', fulfillmentType: 'SELLER_DELIVERY', paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true, deliveryFee: 2000, totalAmount: 16000, currency: 'TZS', latitude: -6.7924, longitude: 39.2083, preferredDeliveryDate: tomorrow, preferredDeliverySlot: 'AFTERNOON', preferredDeliveryWindows: [{ date: tomorrow, slot: 'AFTERNOON' }] };
  const pf = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/proforma', { buyDetails, items: [{ productId: PID, quantity: 1 }] });
  ok('seed-proforma', [200, 201].includes(pf.status), pf.status);
  const sp = await L.api(fx.buyer.token, 'POST', `/api/v1/proformas/${pf.json.proformaId}/submit-payment`, { transactionReferences: [`AU037R5-R2-${fx.stamp}`], paymentMethodType: 'MOBILE_MONEY' });
  const oid = ((sp.json && sp.json.sellerGroups) || []).map(g => g.orderId).filter(Boolean)[0];
  ok('seed-order-id', !!oid, oid);
  await L.api(fx.adminToken, 'POST', `/api/v1/admin/proformas/${pf.json.proformaId}/confirm-payment`);
  await L.api(fx.seller.token, 'POST', `/api/v1/orders/${oid}/confirm-availability`);
  await L.api(fx.seller.token, 'POST', `/api/v1/orders/${oid}/transporter`, { transporterId: fx.transporterId, proposedDeliveryTime: new Date(Date.now() + 3600e3).toISOString(), note: 'au037 r5 rating' });
  const dp = await L.api(fx.adminToken, 'POST', `/api/v1/orders/${oid}/dispatch`);
  ok('seed-dispatch', [200, 201].includes(dp.status), dp.status);
  const od = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${oid}`);
  const code = od.json.deliveryCode;
  ok('seed-delivery-code', !!code, code);
  const vd = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${oid}/verify-delivery`, { code });
  ok('seed-verify-delivery', [200, 201].includes(vd.status), JSON.stringify(vd.json || {}).slice(0, 100));
  let d = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${oid}`);
  const NUM = d.json.orderNumber;
  ok('seed-order-DELIVERED', d.json.status === 'DELIVERED', `${NUM} ${d.json.status}`);

  // ---- browser: drive the app dialog at 375 AND 768 (rating submitted at 375; 768 verifies state) ----
  const browser = await L.newBrowser();
  for (const vp of [{ w: 375, h: 667, tag: 'mobile' }, { w: 768, h: 1024, tag: 'tablet' }]) {
    const ctx = await L.newCtx(browser, { viewport: { width: vp.w, height: vp.h }, videoPath: `e2e/videos/AU-037-r5-rating-${vp.tag}.webm` });
    const p = await ctx.newPage();
    p.on('response', r => { if (/localhost:8083\/api\//.test(r.url())) R.network.push(`[${vp.tag}] ${r.request().method()} ${r.url().replace('http://localhost:8083', '')} -> ${r.status()}`); });
    await p.goto('http://localhost:9121/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 60000);
    let li = await p.evaluate(() => !!(localStorage.getItem('flutter.auth_token') || ''));
    if (!li) {
      await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
      const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(fx.buyer.email, { delay: 10 });
      const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(fx.buyer.pw, { delay: 10 });
      await L.clickBtn(p, 'Log in');
      for (let i = 0; i < 30 && !li; i++) { await sleep(1000); li = await p.evaluate(() => !!(localStorage.getItem('flutter.auth_token') || '')); }
    }
    ok(`login-${vp.tag}`, li, '');
    await sleep(1500);
    await p.evaluate((id) => { location.hash = '#/orders/' + id; }, oid);
    await sleep(6000);
    let T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
    ok(`${vp.tag}-detail-open`, T.includes(NUM), T.slice(0, 60).replace(/\n/g, '|'));

    if (vp.tag === 'mobile') {
      ok('m-item-title-a11y-D3', T.includes('AU037R5 Cancel-Gate Bench'), 'line item title in flt-semantics');
      ok('m-confirm-received-visible', T.includes('Confirm Received'), '');
      await L.screenshot(p, 'e2e/shots/AU-037/AU-037-mobile-rating2-detail.png');
      // tap Confirm Received (smallest tappable node)
      const hit = await p.evaluate(() => {
        let best = null;
        document.querySelectorAll('flt-semantics').forEach(e => {
          const t = (e.textContent || '').trim();
          if (!t.includes('Confirm Received')) return;
          if (e.getAttribute('role') !== 'button') return;
          const r = e.getBoundingClientRect();
          if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return;
          if (!best || r.width * r.height < best.area) best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        });
        return best;
      });
      ok('m-tap-confirm-received', !!hit, '');
      if (hit) { await p.mouse.click(Math.min(hit.x, 371), Math.min(hit.y, 663)); await sleep(1500); }
      T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
      ok('m-dialog-open-review-field', T.includes('Review (optional)'), T.split('\n').filter(x => /[Rr]eview|Submit/.test(x)).slice(0, 2).join('|'));
      await L.screenshot(p, 'e2e/shots/AU-037/AU-037-mobile-rating2-dialog.png');
      // star buttons: icon-sized role=button nodes in the dialog
      const stars = await p.evaluate(() => {
        const out = [];
        document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
          const t = (e.textContent || '').trim();
          if (t.length > 24) return;
          const r = e.getBoundingClientRect();
          if (r.width >= 40 && r.width <= 110 && r.height >= 30 && r.height <= 90 && r.y > 40)
            out.push({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
        });
        return out.sort((a, b) => a.x - b.x);
      });
      ok('m-stars-found', stars.length >= 4, `n=${stars.length}`);
      const reviewText = `AU037R5 five stars ${fx.stamp}R2`;
      const ins = p.locator('input,textarea');
      if (await ins.count()) {
        await ins.first().click({ force: true }).catch(() => {}); await sleep(250);
        await p.keyboard.type(reviewText, { delay: 10 }); await sleep(250);
      }
      const dv = await p.evaluate(() => { const el = document.querySelector('input,textarea'); return el ? el.value : null; }).catch(() => null);
      ok('m-review-in-dom', !!dv && dv.includes('AU037R5'), String(dv).slice(0, 50));
      if (stars.length >= 4) { await p.mouse.click(stars[stars.length - 1].x, stars[stars.length - 1].y); await sleep(400); } // 5th star
      await L.screenshot(p, 'e2e/shots/AU-037/AU-037-mobile-rating2-filled.png');
      // Submit
      const sub = await p.evaluate(() => {
        let best = null;
        document.querySelectorAll('flt-semantics').forEach(e => {
          const t = (e.textContent || '').trim();
          if (t !== 'Submit') return;
          if (e.getAttribute('role') !== 'button') return;
          const r = e.getBoundingClientRect();
          if (r.width < 4 || r.bottom < 0 || r.top > innerHeight) return;
          if (!best || r.width * r.height < best.area) best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        });
        return best;
      });
      ok('m-submit-found', !!sub, '');
      if (sub) { await p.mouse.click(sub.x, sub.y); await sleep(4000); }
      d = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${oid}`);
      ok('T20-COMPLETED-after-dialog', d.json.status === 'COMPLETED', d.json.status);
      ok('T20-buyerRated-true', d.json.buyerRated === true, String(d.json.buyerRated));
      ok('network-PATCH-confirm-receipt-200', R.network.some(l => l.includes(`/orders/${oid}/confirm-receipt`) && l.includes('-> 200')),
        R.network.filter(l => l.includes('confirm-receipt')).join(';').slice(0, 130));
      T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
      ok('UI-completed-wording', T.includes('Completed'), '');
      ok('UI-ratings-line-buyer-done', T.includes('Ratings: buyer done'), T.split('\n').filter(x => /Ratings/.test(x)).slice(0, 1).join('|'));
      await L.screenshot(p, 'e2e/shots/AU-037/AU-037-mobile-rating2-completed.png');
    } else {
      // tablet: verify the completed order shows no action row + ratings line
      ok('t-completed-wording', T.includes('Completed'), T.slice(0, 60).replace(/\n/g, '|'));
      ok('t-no-cancel-control', !(await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].some(e => (e.textContent || '').trim().startsWith('Cancel')))), 'no Cancel on completed');
      await L.scrollToBottom(p, 8); await sleep(500);
      await L.screenshot(p, 'e2e/shots/AU-037/AU-037-tablet-rating2-completed.png');
    }
    await ctx.close();
  }

  // ---- rating persistence + ALREADY_RATED ----
  const rat = await L.api(fx.buyer.token, 'GET', `/api/v1/user-ratings/${fx.seller.userId}?page=0&size=20`);
  const rows = ((rat.json && (rat.json.content || rat.json)) || []);
  const mine = rows.find(r => r.orderId === oid);
  ok('BUYER_TO_SELLER-persisted', !!mine && mine.ratingType === 'BUYER_TO_SELLER', mine ? `${mine.ratingType} stars=${mine.stars}` : `rows=${rows.length}`);
  ok('stars-verbatim-5', !!mine && Number(mine.stars) === 5, mine ? String(mine.stars) : 'missing');
  ok('reviewText-verbatim', !!mine && mine.reviewText === `AU037R5 five stars ${fx.stamp}R2`, mine ? `"${mine.reviewText}"` : 'missing');
  ok('target-is-seller', !!mine && mine.targetUserId === fx.seller.userId, mine ? String(mine.targetUserId) : 'missing');

  const dup = await L.api(fx.buyer.token, 'PATCH', `/api/v1/orders/${oid}/confirm-receipt`, { rating: 2, comment: 'dup probe' });
  ok('ALREADY_RATED-http-409', dup.status === 409, JSON.stringify(dup.json || {}).slice(0, 140));
  ok('ALREADY_RATED-code-verbatim', dup.json && dup.json.errorCode === 'ALREADY_RATED', dup.json && dup.json.errorCode);
  ok('ALREADY_RATED-message-verbatim', dup.json && dup.json.message === 'You have already rated this user for this order.', dup.json && dup.json.message);

  fs.writeFileSync('/tmp/au037_r5_rating_result.json', JSON.stringify(R, null, 2));
  console.log('\nRATING LEG DONE. failures:', R.failures.length ? R.failures.join(' | ') : 'none');
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
