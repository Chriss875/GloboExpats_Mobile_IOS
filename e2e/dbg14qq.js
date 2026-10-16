// dbg A6 FINAL: the battery's A6 runs AFTER clearCart() which REMOVES the
// expatCartItems key and RELOADS. Isolated test showed guard fires after that
// same sequence (dbg14mm attempt1=true). Difference remaining: battery logs in
// via loginIfNeeded() on a FRESH context each viewport pass... same as mm.
// One more variable: A5 deeplinks ran right before A6, leaving app on an error
// shell. gotoDetail(629) from there may serve a STALE semantics tree where the
// Add node's handler belongs to the error page. Test: error page first, then 629.
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
  // hostile deep link FIRST (like the battery's A5)
  await p.goto('http://localhost:9108/#/product/999999', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(3000);
  console.log('error shell shown:', /not found|error/i.test(await L.allText(p)));
  // then 629
  await p.goto('http://localhost:9108/#/product/629', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  await p.waitForTimeout(4500);
  for (const a of [1, 2]) {
    await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(1500);
    console.log(`attempt ${a}: guard=${await p.evaluate(() => document.body.innerHTML.includes('own listed items'))} added=${await p.evaluate(() => document.body.innerHTML.includes('Added to cart'))}`);
  }
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
