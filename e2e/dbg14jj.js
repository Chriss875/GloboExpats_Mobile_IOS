// dbg: legit add on 646 authed — where does the cart line GO? Check every
// storage backend: localStorage, sessionStorage, indexedDB contents.
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
  await p.waitForTimeout(5000);
  await L.clickBtn(p, 'Add to cart');
  await p.waitForTimeout(1800);
  console.log('added toast in DOM:', await p.evaluate(() => document.body.innerHTML.includes('Added to cart')));
  // navigate to cart route
  await p.goto('http://localhost:9108/#/cart', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  let cartTxt = '';
  for (let i = 0; i < 20; i++) { await p.waitForTimeout(800); cartTxt = await L.allText(p); if (/Cart/.test(cartTxt) && /Subtotal|empty/.test(cartTxt)) break; }
  console.log('cart shows item?', cartTxt.includes('Window Probe Cabinet'), '| empty state?', cartTxt.includes('Your cart is empty'));
  const m = cartTxt.match(/Subtotal[^\n]*/); console.log(m && m[0]);
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-014/dbg-cart-after-add.png' });
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
