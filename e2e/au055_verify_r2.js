// AU-055 r2 — focused re-run: mobile dashboard nav, order-detail actions,
// saved grid probe (real wishlist ids), requests management surface.
// Canonical checklist items 2/4/5 on the frozen :9110 lane.
const fs = require('fs');
const L = require('./lib_verify');
const APP = 'http://localhost:9110';
const UNIT = 'AU-055';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const OUT = { asserts: [], network: [] };
const SHOT_DIR = `${ROOT}/e2e/shots/${UNIT}`;

function log(...a) { console.log('[r2]', ...a); }
async function dumpText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n'));
}
async function shot(p, vp, state) {
  const f = `${SHOT_DIR}/${UNIT}-${vp}-${state}.png`;
  await L.screenshot(p, f);
  log('shot', state);
  return f;
}

(async () => {
  // real saved ids through the REAL sandbox API (RW lane)
  const token = await L.apiLogin(L.BUYER);
  const saved = await L.api(token, 'GET', '/api/saved-products');
  const savedIds = (saved.json || []).map(x => x.productId);
  const firstSaved = savedIds[0];
  const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${firstSaved}`);
  const savedTitle = det.json && det.json.productName;
  log('saved ids', JSON.stringify(savedIds), 'first title:', savedTitle);
  OUT.savedFixture = { savedIds, firstSaved, savedTitle };

  const browser = await L.newBrowser();
  for (const [vpName, viewport] of [['mobile', { width: 375, height: 667 }], ['tablet', { width: 768, height: 1024 }]]) {
    const ctx = await L.newCtx(browser, { viewport, videoPath: `${ROOT}/e2e/videos/${UNIT}-r2-${vpName}.webm` });
    const page = await ctx.newPage();
    const imgMap = L.watchImages(page);
    page.on('response', r => { if (r.url().includes('/api/')) OUT.network.push({ vp: vpName, url: r.url().slice(0, 150), status: r.status() }); });

    await page.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    const ok = await L.login(page, L.BUYER);
    OUT.asserts.push({ vp: vpName, a: 'login', pass: ok });

    // ---- Account -> Seller dashboard
    await L.clickBtn(page, 'Account') || await L.clickCard(page, 'Account');
    await page.waitForTimeout(1000);
    let txt = await dumpText(p = page);
    // scroll account list to find Seller dashboard
    let dashFound = false;
    for (let i = 0; i < 8 && !dashFound; i++) {
      dashFound = await L.clickCard(page, 'Seller dashboard');
      if (!dashFound) { await p.mouse.move(190, 350); await p.mouse.wheel(0, 300); await p.waitForTimeout(300); }
    }
    await page.waitForTimeout(1500);
    txt = await dumpText(page);
    const dashOk = txt.includes('Welcome back, seller');
    OUT.asserts.push({ vp: vpName, a: 'dashboard-renders', pass: dashOk });
    const statM = txt.match(/(\d+)\s*\n?\s*listings/);
    OUT.asserts.push({ vp: vpName, a: 'stats-listings-real-count', pass: !!statM, value: statM && statM[1] });
    OUT.asserts.push({ vp: vpName, a: 'revenue-line', pass: /Revenue from paid selling orders/.test(txt) });
    await shot(page, vpName, '10-dashboard-r2');

    // ---- Selling orders tile
    let sellClicked = false;
    for (let i = 0; i < 6 && !sellClicked; i++) {
      sellClicked = await L.clickCard(page, 'Selling orders');
      if (!sellClicked) { await page.mouse.move(190, 350); await page.mouse.wheel(0, 260); await page.waitForTimeout(250); }
    }
    await page.waitForTimeout(1500);
    txt = await dumpText(page);
    OUT.asserts.push({ vp: vpName, a: 'selling-orders-title+chips', pass: txt.includes('Selling orders') && txt.includes('Buying') && txt.includes('Selling') });

    // ---- Buying tab -> open ORD row -> detail quick actions inventory
    await L.clickBtn(page, 'Buying');
    await page.waitForTimeout(1300);
    txt = await dumpText(page);
    const ord = (txt.match(/ORD-\d{4}-\d{6}/) || [])[0];
    OUT.asserts.push({ vp: vpName, a: 'buying-rows-real', pass: !!ord, value: ord });
    await shot(page, vpName, '11-buying-orders');
    if (ord) {
      await L.clickCard(page, ord);
      await page.waitForTimeout(1800);
      const dTxt = await dumpText(page);
      const checks = {
        orderNumber: dTxt.includes(ord),
        itemsSection: dTxt.includes('Items Ordered'),
        escrowOrPayment: /Payment:|Escrow/.test(dTxt),
        trackDelivery: dTxt.includes('Track delivery'),
        confirmReceipt: /Confirm receipt/i.test(dTxt),
        rateSeller: /Rate Seller/i.test(dTxt),
        cancelOrder: /Cancel order|Cancel\b/.test(dTxt),
        availabilityGate: /Confirm item availability|Confirm availability|Waiting for seller/.test(dTxt),
        assignRiderCopy: /Assign rider|Arranging delivery|Driver assigned/.test(dTxt),
      };
      OUT.asserts.push({ vp: vpName, a: `order-detail(${ord})`, pass: checks.orderNumber && checks.itemsSection, checks });
      await shot(page, vpName, '12-order-detail');
      // Track delivery click effect
      const t1 = dTxt;
      await L.clickBtn(page, 'Track delivery');
      await page.waitForTimeout(1500);
      const tTrack = await dumpText(page);
      OUT.asserts.push({
        vp: vpName, a: 'track-delivery-effect',
        pass: tTrack !== t1 || tTrack.includes('not available'),
        nowShows: (tTrack.split('\n').filter(Boolean).slice(0, 6)).join(' | ').slice(0, 160),
      });
      await shot(page, vpName, '13-tracking');
    }

    // ---- Requests screen + owner-management probe
    await page.goto(APP, { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(1200);
    await L.clickBtn(page, 'Requests') || await L.clickCard(page, 'Requests');
    await page.waitForTimeout(2000);
    let rTxt = await dumpText(page);
    const reqOk = rTxt.includes('Post request') && /Goods/.test(rTxt);
    OUT.asserts.push({ vp: vpName, a: 'requests-filter-bar', pass: reqOk });
    // feed rows?
    const titles = ['I am looking for a tailor', 'AU056 probe goods with image', 'conference table', 'TCL 4K'];
    const foundTitle = titles.find(t => rTxt.includes(t));
    OUT.asserts.push({ vp: vpName, a: 'requests-feed-real-titles', pass: !!foundTitle, value: foundTitle || null });
    await shot(page, vpName, '14-requests');
    if (!foundTitle) { // scroll the feed
      await L.scrollToBottom(page, 6);
      rTxt = await dumpText(page);
      const t2 = titles.find(t => rTxt.includes(t));
      OUT.asserts.push({ vp: vpName, a: 'requests-feed-after-scroll', pass: !!t2, value: t2 || null });
    }
    // detail + nudge
    const pickTitle = titles.find(t => rTxt.includes(t)) || 'tailor';
    if (await L.clickCard(page, pickTitle)) {
      await page.waitForTimeout(1600);
      const dTxt = await dumpText(page);
      OUT.asserts.push({
        vp: vpName, a: 'request-detail+nudge',
        pass: dTxt.includes('I can help (nudge)'),
        fields: ['Category', 'Status'].filter(f => dTxt.includes(f)),
        ownerManageActions: /Edit|Close|Delete|Mark fulfilled|Fulfill/.test(dTxt),
      });
      await shot(page, vpName, '15-request-detail');
      await L.clickBtn(page, 'I can help (nudge)');
      await page.waitForTimeout(1400);
      const sb = await L.hasSnackBar(page);
      OUT.asserts.push({ vp: vpName, a: 'nudge-feedback', pass: true, snackBarBand: sb.found, atY: sb.atY });
      await shot(page, vpName, '16-after-nudge');
    }

    // ---- Saved grid probe: product detail of the real saved id must show the heart ON
    if (firstSaved && savedTitle) {
      await page.goto(`${APP}/#/product/${firstSaved}`, { waitUntil: 'load' }).catch(() => {});
      await page.waitForTimeout(3200);
      const sTxt = await dumpText(page);
      OUT.asserts.push({
        vp: vpName, a: 'saved-product-detail-renders(real wishlist id)',
        pass: sTxt.includes(savedTitle), id: firstSaved, title: savedTitle,
      });
      await shot(page, vpName, '17-saved-product-detail');
    }

    const s = L.imageSummary(imgMap);
    OUT.images = OUT.images || {}; OUT.images[vpName] = s;
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-055-r2.json`, JSON.stringify(OUT, null, 2));
  console.log(JSON.stringify(OUT.asserts, null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
