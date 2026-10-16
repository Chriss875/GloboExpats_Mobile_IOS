// A2 FINAL DISAMBIGUATION: on 629 the OWN-ITEM guard fires (proven in dbg14ss:
// guard toast=true, added toast=false, cart=null). So why did A2 see
// 'Added to cart'?? Because in the battery, A2 runs right after clearCart()
// which RELOADS — viewer not yet resolved when Add clicked => guard passes
// (viewer null) => add PROCEEDS and writes... but then storage shows nothing?
// Actually: if viewer unresolved, add proceeds AND persists. Unless _userId is
// ALSO unresolved at that instant => _persist() no-ops (guest cart = memory)!
// That's exactly cart_store.dart:_persist -> if uid==null return.
// Repro: login, reload, IMMEDIATELY add on 646 (non-owned) before settle.
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
  // NO settle: click Add as soon as the button exists (like a fast user)
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load' }).catch(() => {});
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  console.log('cart BEFORE fast add:', (await dumpCart()).slice(0, 60));
  await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(1200);
  console.log('added toast:', await p.evaluate(() => document.body.innerHTML.includes('Added to cart')));
  for (let i = 0; i < 15; i++) { await p.waitForTimeout(500); const c = await dumpCart(); if (c !== 'null') break; }
  console.log('cart AFTER fast add (+7.5s poll):', (await dumpCart()).slice(0, 80));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
