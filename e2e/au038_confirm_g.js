// au038_confirm_g.js — vector G: proves the Confirm availability BUTTON end-to-end.
// Mint a fresh ASC order (G), open its detail in the browser as the fixture seller,
// scroll to the gate, CLICK "Confirm availability", then assert via the REAL API that
// the order moved to AWAITING_DELIVERY. Also captures the success snackbar/message shot.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9112';
const fx = JSON.parse(fs.readFileSync('/tmp/au038_fixtures.json', 'utf8'));
const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
const STAMP = 'G' + Date.now();
let R = { asserts: [], shots: [] };
function assert(n, p, d) { R.asserts.push({ n, p: !!p, d: String(d || '').slice(0, 300) }); console.log(p ? 'PASS' : 'FAIL', n, String(d || '').slice(0, 160)); }

(async () => {
  const atok = await L.apiLogin(L.ADMIN);
  // mint G on product2 qty1 MORNING window
  const buyDetails = {
    firstName: 'AU038First', lastName: 'AU038Buyer', emailAddress: fx.buyer.email,
    phoneNumber: '+255713000444', address: 'AU038 Street 9', city: 'Dar es Salaam',
    state: 'Dar es Salaam', country: 'Tanzania', zipCode: '',
    deliveryMethod: "Seller's delivery", paymentMethodType: 'MOBILE_MONEY',
    agreeToTerms: true, fulfillmentType: 'SELLER_DELIVERY', currency: 'TZS',
    latitude: -6.7924, longitude: 39.2083,
    preferredDeliveryWindows: [{ date: tomorrow(), slot: 'MORNING' }],
  };
  const pf = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/proforma', { buyDetails, items: [{ productId: fx.productId2, quantity: 1 }] });
  if (![200, 201].includes(pf.status)) throw new Error('proforma G failed');
  const sp = await L.api(fx.buyer.token, 'POST', `/api/v1/proformas/${pf.json.proformaId}/submit-payment`,
    { transactionReferences: ['AU038-' + STAMP], paymentMethodType: 'MOBILE_MONEY' });
  if (![200, 201].includes(sp.status)) throw new Error('submit G failed');
  const pf2 = await L.api(fx.buyer.token, 'GET', `/api/v1/proformas/${pf.json.proformaId}`);
  const gid = (pf2.json.sellerGroups || []).map(g => g.orderId).filter(Boolean)[0];
  fx.G = { orderId: gid };
  await L.api(atok, 'POST', `/api/v1/admin/proformas/${pf.json.proformaId}/confirm-payment`);
  let d = await L.api(fx.seller.token, 'GET', `/api/v1/orders/${gid}`);
  assert('G-minted-ASC', d.json.status === 'AWAITING_SELLER_CONFIRMATION', d.json.status);

  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-038-confirm-G.webm' });
  const page = await ctx.newPage();
  const net = [];
  page.on('response', r => { if (r.url().includes('/api/')) net.push({ m: r.request().method(), u: r.url().slice(-70), s: r.status() }); });
  try {
    await page.goto(APP + '/login', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(page, 'Welcome back', 30000);
    const ei = page.locator('input[type="text"]').first(); const pi = page.locator('input[type="password"]').first();
    await ei.click({ force: true }); await page.waitForTimeout(300); await page.keyboard.type(fx.seller.email);
    await pi.click({ force: true }); await page.waitForTimeout(300); await page.keyboard.type(fx.seller.pw);
    await L.clickBtn(page, 'Log in');
    let ok = false; for (let i = 0; i < 30 && !ok; i++) { ok = await L.isLoggedIn(page); if (!ok) await page.waitForTimeout(1000); }
    assert('G-login', ok);
    await page.goto(APP + '/orders/' + gid, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(4200);
    // scroll to actions
    await page.mouse.move(190, 330);
    for (let i = 0; i < 7; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(220); }
    await page.waitForTimeout(700);
    const btnY = await page.evaluate(() => {
      let b = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if ((e.textContent || '').includes('Confirm availability') && e.getAttribute('role') === 'button') {
          const r = e.getBoundingClientRect(); if (!b) b = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        }
      });
      return b;
    });
    assert('G-button-visible', !!btnY, JSON.stringify(btnY));
    if (btnY) {
      const beforeNet = net.length;
      await page.mouse.click(Math.min(btnY.x, 370), Math.min(btnY.y, 660));
      await page.waitForTimeout(2600);
      await page.screenshot({ path: 'e2e/shots/AU-038/AU-038-mobile-07-after-confirm.png' }).catch(() => {});
      R.shots.push('e2e/shots/AU-038/AU-038-mobile-07-after-confirm.png');
      const firedConfirm = net.slice(beforeNet).some(n => n.u.includes('confirm-availability') && (n.s === 200 || n.s === 201));
      assert('G-confirm-api-fired', firedConfirm, JSON.stringify(net.slice(beforeNet).map(n => n.m + ' ' + n.u + ' ' + n.s)));
      d = await L.api(fx.seller.token, 'GET', `/api/v1/orders/${gid}`);
      assert('G-state-AWAITING_DELIVERY', d.json.status === 'AWAITING_DELIVERY', `server status now ${d.json.status}`);
      // UI reflects the new state
      await page.waitForTimeout(1500);
      const T = await L.allText(page);
      assert('G-ui-banner-gone', !T.includes('The buyer has paid'), 'gate banner removed after confirm');
    }
  } finally {
    await L.closeVideo(ctx, 'e2e/videos/AU-038-confirm-G.webm');
    fs.writeFileSync('e2e/results/shards/raw-AU-038-confirmG.json', JSON.stringify(R, null, 1));
  }
  await browser.close().catch(() => {});
  fx.G.afterStatus = (await L.api(fx.seller.token, 'GET', `/api/v1/orders/${gid}`)).json.status;
  fs.writeFileSync('/tmp/au038_fixtures.json', JSON.stringify(fx, null, 2));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
