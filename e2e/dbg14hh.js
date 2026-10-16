// BREAKTHROUGH CHECK: clickBtn(force) DID write "Added to cart" into the DOM
// (snackbar fired!) but flt-semantics never exposed it. => Snackbars render
// OUTSIDE the semantics tree (or as a raw HTML overlay). So the app WORKS;
// my earlier "NO REACTION" verdicts were a MEASUREMENT bug — I only polled
// allText() (semantics) and missed body.innerHTML.
//
// Re-test every attack leg with BOTH signals: semantics text AND innerHTML.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const htmlHas = (s) => p.evaluate((x) => document.body.innerHTML.includes(x), s);
  // 1. guest add on 646 -> Login Required toast in innerHTML?
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  await p.waitForTimeout(2500);
  await L.clickBtn(p, 'Add to cart');
  await p.waitForTimeout(1200);
  console.log('guest add -> LoginRequired toast in DOM:', await htmlHas('Login Required'));
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-014/dbg-guest-toast.png' });
  // 2. own-item on 629 (login first)
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
  await p.waitForTimeout(2500);
  await L.clickBtn(p, 'Add to cart');
  await p.waitForTimeout(1200);
  console.log('own-item guard toast in DOM:', await htmlHas('own listed items'), '| Added-to-cart absent:', !(await htmlHas('>Added to cart<')));
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-014/dbg-ownitem-toast.png' });
  // 3. cart storage after legit add on 646
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  await p.waitForTimeout(2500);
  await L.clickBtn(p, 'Add to cart');
  await p.waitForTimeout(1500);
  const keys = await p.evaluate(() => Object.keys(localStorage).filter(k => /cart/i.test(k)));
  console.log('cart keys:', JSON.stringify(keys));
  const val = await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (/expatCartItems/i.test(k)) return localStorage.getItem(k).slice(0, 260); return null; });
  console.log('cart payload:', val);
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
