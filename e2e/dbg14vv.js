// A2 disambiguation: in the battery the first add DID show 'Added to cart'
// (toast=true logged) on 629 — meaning at that instant the viewer WAS resolved
// as NOT the owner, OR the guard didn't fire. Then nothing persisted. The one
// state that produces BOTH signals: viewer resolved (so not guest) but
// CartStore._userId still null? No — add would persist under whatever uid.
// OR: viewer unresolved => guard skipped (null != 142) => add proceeds =>
// _persist() no-ops (CartStore uid null until loadForUser runs post-login-
// restore). Toast fires unconditionally. That matches EXACTLY.
// Confirm by checking whether 'own listed items' toast appears a moment later
// (viewer resolves late): poll both toasts for 10s after fast click.
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
  // battery-like: clear cart via storage removal then IMMEDIATE deep link+click
  await p.evaluate(() => { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (/expatCartItems/i.test(k)) localStorage.removeItem(k); } });
  await p.goto('http://localhost:9108/#/product/629', { waitUntil: 'load' }).catch(() => {});
  let appeared = false;
  for (let i = 0; i < 40 && !appeared; i++) { appeared = /Add to cart/.test(await L.allText(p)); if (!appeared) await p.waitForTimeout(200); }
  await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(600);
  console.log('t+0.6s addedToast:', await p.evaluate(() => document.body.innerHTML.includes('Added to cart')), '| guardToast:', await p.evaluate(() => document.body.innerHTML.includes('own listed items')));
  let everAdded = false, everGuard = false;
  for (let i = 0; i < 20; i++) { await p.waitForTimeout(500);
    if (!everAdded && await p.evaluate(() => document.body.innerHTML.includes('Added to cart'))) everAdded = true;
    if (!everGuard && await p.evaluate(() => document.body.innerHTML.includes('own listed items'))) everGuard = true;
  }
  console.log('within 10s: addedToastEver=', everAdded, 'guardToastEver=', everGuard, '| cart:', (await dumpCart()).slice(0, 50));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
