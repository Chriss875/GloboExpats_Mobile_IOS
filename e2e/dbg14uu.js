// A2 root cause FINAL: 629 IS OWNED by the logged-in user (seller_id=142 ==
// users.user_id=142). The own-item guard fires when the viewer resolves.
// In A2's flow the click lands BEFORE viewer resolution => guard passes =>
// _addToCart proceeds => CartStore.addDetail... but persistence no-ops because
// CartStore's userId isn't loaded yet either. Then the toast 'Added to cart'
// shows unconditionally from onPressed.
// Verify: fast-click add on 629, poll storage 8s — expect NO line EVER.
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
  // click IMMEDIATELY (viewer likely unresolved)
  await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(1000);
  console.log('fast add on 629 -> addedToast:', await p.evaluate(() => document.body.innerHTML.includes('Added to cart')),
    '| guardToast:', await p.evaluate(() => document.body.innerHTML.includes('own listed items')));
  let persisted = false;
  for (let i = 0; i < 16; i++) { await p.waitForTimeout(500); if ((await dumpCart()) !== 'null') { persisted = true; break; } }
  console.log('line persisted ever?', persisted, '| final cart:', (await dumpCart()).slice(0, 60));
  // now SLOW path after settle:
  await p.waitForTimeout(3000);
  await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(1500);
  console.log('slow add -> guardToast:', await p.evaluate(() => document.body.innerHTML.includes('own listed items')));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
