// dbg A2 root cause: after the 629 add toast, is the write DELAYED? Poll cart
// storage for 8s after the toast appears.
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
  await p.goto('http://localhost:9108/#/product/629', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  await p.waitForTimeout(4500);
  // OWN-ITEM guard fires on 629 (user owns it) — so use a NON-owned item to
  // study persistence: 646.
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 20 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  await p.waitForTimeout(4000);
  await L.clickBtn(p, 'Add to cart');
  for (let i = 0; i < 15 && !(await p.evaluate(() => document.body.innerHTML.includes('Added to cart'))); i++) await p.waitForTimeout(300);
  for (const ms of [500, 1500, 3000, 6000]) {
    await p.waitForTimeout(ms === 500 ? 500 : ms - (ms === 1500 ? 500 : ms === 3000 ? 1500 : 3000));
    console.log(`t+${ms}ms cart:`, (await dumpCart()).slice(0, 100));
  }
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
