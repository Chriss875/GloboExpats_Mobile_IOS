// CONFIRM: after a hostile deep link, does ANY subsequent detail page accept
// clicks? Test on 646 (non-owned): add toast after error-page visit.
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
  await p.goto('http://localhost:9108/#/product/999999', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2500);
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  await p.waitForTimeout(4500);
  await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(1800);
  console.log('646 added toast after error page:', await p.evaluate(() => document.body.innerHTML.includes('Added to cart')));
  // and with an intermediate HOME visit between error and target:
  await p.goto('http://localhost:9108/', { waitUntil: 'load' }).catch(() => {});
  await p.waitForTimeout(2500);
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load' }).catch(() => {});
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  await p.waitForTimeout(4000);
  await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(1800);
  console.log('646 added toast after home-interposed:', await p.evaluate(() => document.body.innerHTML.includes('Added to cart')));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
