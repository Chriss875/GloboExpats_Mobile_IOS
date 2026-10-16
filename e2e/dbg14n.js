// dbg: click Add on 646 authed, then IMMEDIATELY read semantics for snackbar
// (ScaffoldMessenger snackbars render as role=alert? or in flt-semantics live region)
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
  // go to CART first (via home bottom nav) and note its state
  await p.goto('http://localhost:9108/#/cart', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(3000);
  console.log('cart route text:', (await L.allText(p)).slice(0, 200).replace(/\n+/g, '|'));
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  const ab = await p.evaluate(() => {
    const b2 = [...document.querySelectorAll('flt-semantics[role="button"]')]
      .map(e => ({ t: (e.textContent || '').trim(), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }))
      .find(b3 => /Add to cart/i.test(b3.t));
    return b2;
  });
  await p.mouse.click(ab.x, ab.y);
  for (let ms = 250; ms <= 2000; ms += 250) {
    await p.waitForTimeout(250);
    if ((await L.allText(p)).includes('Added to cart')) { console.log('snackbar visible at ~' + ms + 'ms'); break; }
  }
  const t = await L.allText(p);
  console.log('final has Added?', t.includes('Added to cart'), '| has Cart badge?', /Cart\s*\d/.test(t));
  console.log('tail:', JSON.stringify(t.slice(-260)));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
