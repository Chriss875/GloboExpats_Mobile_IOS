// dbg A2 FINAL: 629 add toasts but NEVER persists. Isolated repro with long
// post-toast wait + storage polling on the OWN-ITEM-guarded item is nonsense
// (guard blocks). Wait — A2's first add toasts 'Added to cart'... but user142
// OWNS 629! The guard should have blocked it! Unless _viewerUserId wasn't
// resolved yet (deep-link + immediate click) => add PROCEEDED (bug!) and then...
// no, it never persisted either. Two possibilities:
//  a) toast fired but guard returned early AFTER showing? No—guard returns
//     before any toast.
//  b) 'Added to cart' text came from the UNCONDITIONAL snackbar in the button
//     onPressed (product_detail_screen.dart:1025) which fires EVEN when the
//     guard rejected! Look: onPressed calls onAddToCart() THEN shows the
//     snackbar unconditionally. So the toast ALWAYS fires regardless of guard!
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
  const dumpCart = () => p.evaluate(() => localStorage.getItem('flutter.expatCartItems_mobile.test.20260820@gmail.com') || 'null');
  await p.goto('http://localhost:9108/#/product/629', { waitUntil: 'load' }).catch(() => {});
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  await p.waitForTimeout(5000); // full viewer settle
  await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(1500);
  console.log('own-item guard toast:', await p.evaluate(() => document.body.innerHTML.includes('own listed items')));
  console.log('added toast ALSO shown:', await p.evaluate(() => document.body.innerHTML.includes('Added to cart')));
  console.log('cart:', (await dumpCart()).slice(0, 60));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
