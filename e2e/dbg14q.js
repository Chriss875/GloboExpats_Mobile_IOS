// dbg: is the click landing? Instrument Flutter's semantics action counter:
// read flt-semantics node's onclick handler firing via a CDP-free approach —
// dispatch a real pointerdown/up at the button center and watch for ANY state
// change (e.g. 'Added' snackbar OR cart route count). Compare with the OWN-ITEM
// guard case (629) where we KNOW a toast fires — that validates our click method.
const L = require('./lib_verify.js');
async function loginFlow(p) {
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
    return ok;
  }
  return true;
}
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  console.log('login', await loginFlow(p));
  // CONTROL: 629 own-item -> toast MUST fire if clicks work
  await p.goto('http://localhost:9108/#/product/629', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  const ab629 = await p.evaluate(() => {
    const b2 = [...document.querySelectorAll('flt-semantics[role="button"]')]
      .map(e => ({ t: (e.textContent || '').trim(), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }))
      .find(b3 => /Add to cart/i.test(b3.t));
    return b2;
  });
  await p.mouse.click(ab629.x, ab629.y); await p.waitForTimeout(1200);
  const tControl = (await L.allText(p)).includes('own listed items');
  console.log('CONTROL 629 own-item toast fired:', tControl);
  // TREATMENT: 646 non-owner
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  const ab = await p.evaluate(() => {
    const b2 = [...document.querySelectorAll('flt-semantics[role="button"]')]
      .map(e => ({ t: (e.textContent || '').trim(), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }))
      .find(b3 => /Add to cart/i.test(b3.t));
    return b2;
  });
  console.log('btn', ab);
  await p.mouse.click(ab.x, ab.y); await p.waitForTimeout(1500);
  const tTreat = (await L.allText(p));
  console.log('646 any toast?', /Added to cart|Login Required|out of stock|units are/i.test(tTreat));
  // what about Buy Now?
  const bn = await p.evaluate(() => {
    const b4 = [...document.querySelectorAll('flt-semantics[role="button"]')]
      .map(e => ({ t: (e.textContent || '').trim(), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }))
      .find(b5 => /^Buy now$/i.test(b5.t));
    return b4;
  });
  if (bn) { await p.mouse.click(bn.x, bn.y); await p.waitForTimeout(2500); }
  const tAfterBN = await L.allText(p);
  console.log('after BuyNow route has Checkout?', /Checkout|Delivery/i.test(tAfterBN), '| url', p.url());
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
