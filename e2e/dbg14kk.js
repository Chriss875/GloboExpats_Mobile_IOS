// dbg: find the cart's persisted key by adding on 646 then diffing storage
// AFTER a proper settle (KvStore SharedPreferences writes may be async).
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
  const keys = () => p.evaluate(() => Object.keys(localStorage));
  console.log('keys before:', JSON.stringify(await keys()));
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  await p.waitForTimeout(5000);
  await L.clickBtn(p, 'Add to cart');
  await p.waitForTimeout(3000); // long wait for the prefs write
  console.log('keys after:', JSON.stringify(await keys()));
  for (const k of await keys()) if (/expatCartItems|cart/i.test(k)) console.log('KEY', k, (await p.evaluate((kk) => localStorage.getItem(kk).slice(0, 300), k)));
  // sessionStorage too
  console.log('session:', await p.evaluate(() => Object.keys(sessionStorage)));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
