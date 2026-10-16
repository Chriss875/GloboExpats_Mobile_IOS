// dbg: own-item guard on 629 — timing. _resolveViewer runs at initState and
// sets _viewerUserId AFTER user-details returns. My click may fire before that
// (deep-link load + 3s wait should be plenty...). OR: the guard compares
// _viewerUserId == d.sellerId — sellerId of 629 is 142 per DB, userId=142.
// Test with LONG wait + retry clicks.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9108/', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Buy now', 1500)); i++) {}
  if (!(await L.isLoggedIn(p))) {
    await L.clickBtn(p, 'Login'); await p.waitForTimeout(2000);
    await p.locator('input[type="text"]').first().click({ force: true }); await p.waitForTimeout(250);
    await p.keyboard.type(L.BUYER.email, { delay: 10 });
    await p.locator('input[type="password"]').first().click({ force: true }); await p.waitForTimeout(250);
    await p.keyboard.type(L.BUYER.pw, { delay: 10 });
    await L.clickBtn(p, 'Log in');
    let ok = false; for (let i = 0; i < 25 && !ok; i++) { ok = await L.isLoggedIn(p); if (!ok) await p.waitForTimeout(700); }
    console.log('login', ok);
  }
  await p.goto('http://localhost:9108/#/product/629', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  await p.waitForTimeout(6000); // generous settle
  for (let attempt = 1; attempt <= 3; attempt++) {
    await L.clickBtn(p, 'Add to cart');
    await p.waitForTimeout(1400);
    const guardHit = await p.evaluate(() => document.body.innerHTML.includes('own listed items'));
    console.log(`attempt ${attempt}: guard toast=${guardHit}`);
    if (guardHit) break;
  }
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-014/dbg-ownitem-retry.png' });
  // also check the "Who viewed this listing"/viewer-dependent sections rendered:
  // their presence proves _viewerUserId resolved.
  const t = await L.allText(p);
  console.log('viewer-resolved markers:', /views|viewers/.test(t), '| MobileTest?', t.includes('Mobile'));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
