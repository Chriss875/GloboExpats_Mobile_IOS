// dbg: click Add on 646 and take screenshots at 200/500/900ms to catch a
// transient snackbar; also probe whether the click even registers by using
// Playwright's element click (not raw coords).
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
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  // Use locator click on the semantics button itself.
  const loc = p.locator('flt-semantics[role="button"]', { hasText: 'Add to cart' }).first();
  console.log('loc count', await loc.count());
  await loc.click({ force: true });
  for (const ms of [200, 400, 700, 1000]) {
    await p.waitForTimeout(ms === 200 ? 200 : 200);
    const has = (await L.allText(p)).includes('Added to cart');
    if (has) { console.log('snackbar seen at <=', ms + 'ms cumulative'); break; }
  }
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-014/dbg-locator-click.png' });
  const found = await p.evaluate(() => document.body.innerHTML.includes('Added to cart'));
  console.log('DOM contains Added to cart after locator click:', found);
  // Cart route check
  await p.goto('http://localhost:9108/#/cart', { waitUntil: 'load' }).catch(() => {});
  await p.waitForTimeout(3000);
  const t = await L.allText(p);
  console.log('cart shows item?', t.includes('Window Probe Cabinet'), '| empty?', t.includes('Your cart is empty'));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
