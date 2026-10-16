// dbg: why does the own-item guard fire in isolation (dbg14ii attempt1=true)
// but not inside the battery flow? Difference: battery does clearCart() (which
// REMOVES the expatCartItems key + reloads) then gotoDetail. Maybe after
// reload+login the _token getter reads a DIFFERENT storage shape.
// Isolate: login -> clearCart -> gotoDetail(629) -> click add x3, log toasts.
const L = require('./lib_verify.js');
const API = 'http://localhost:8083';
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
  // clearCart exactly like the battery
  await p.evaluate(() => { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (/expatCartItems/i.test(k)) localStorage.removeItem(k); } });
  await p.goto('http://localhost:9108/#/product/629', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  await p.waitForTimeout(4500);
  for (const a of [1, 2]) {
    const okC = await L.clickBtn(p, 'Add to cart');
    await p.waitForTimeout(1500);
    console.log(`attempt ${a}: click=${okC} guardToast=${await p.evaluate(() => document.body.innerHTML.includes('own listed items'))} addedToast=${await p.evaluate(() => document.body.innerHTML.includes('Added to cart'))}`);
  }
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
