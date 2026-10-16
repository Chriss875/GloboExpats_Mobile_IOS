// dbg A2: reproduce EXACTLY — login, gotoDetail(629), add (toast), check
// storage, goBack, gotoDetail(619), add, dump storage.
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
  await p.evaluate(() => { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (/expatCartItems/i.test(k)) localStorage.removeItem(k); } });
  const dumpCart = () => p.evaluate(() => { try { return localStorage.getItem('flutter.expatCartItems_mobile.test.20260820@gmail.com') || 'null'; } catch (e) { return 'err'; } });
  console.log('cart after clear:', await dumpCart());
  await p.goto('http://localhost:9108/#/product/629', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  await p.waitForTimeout(4500);
  console.log('click1:', await L.clickBtn(p, 'Add to cart'));
  for (let i = 0; i < 15 && !(await p.evaluate(() => document.body.innerHTML.includes('Added to cart'))); i++) await p.waitForTimeout(300);
  console.log('cart after 629 add:', await dumpCart());
  await p.goBack(); await p.waitForTimeout(1800);
  console.log('after goBack url:', p.url(), '| cart:', (await dumpCart()).slice(0, 80));
  await p.goto('http://localhost:9108/#/product/619', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  await p.waitForTimeout(4500);
  console.log('cart BEFORE 619 add:', (await dumpCart()).slice(0, 120));
  console.log('click2:', await L.clickBtn(p, 'Add to cart'));
  for (let i = 0; i < 15 && !(await p.evaluate(() => document.body.innerHTML.includes('Added to cart'))); i++) await p.waitForTimeout(300);
  console.log('FINAL cart:', (await dumpCart()).slice(0, 400));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
