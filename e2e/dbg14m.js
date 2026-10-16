// dbg: after clicking Add on 646, does a snackbar appear at all? Screenshot
// immediately (300ms) and again at 1.5s. Then open Cart via bottom-nav icon.
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
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  const ab = await p.evaluate(() => {
    const b2 = [...document.querySelectorAll('flt-semantics[role="button"]')]
      .map(e => ({ t: (e.textContent || '').trim(), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }))
      .find(b3 => /Add to cart/i.test(b3.t));
    return b2;
  });
  await p.mouse.click(ab.x, ab.y);
  await p.waitForTimeout(400);
  const t400 = await L.allText(p);
  console.log('@400ms has Added-to-cart?', t400.includes('Added to cart'));
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-014/dbg-snack-400.png' });
  await p.waitForTimeout(1200);
  // find bottom nav Cart (icon-only?) - dump all role=button labels
  const btns = await p.evaluate(() => [...document.querySelectorAll('flt-semantics[role="button"]')].map(e => (e.textContent || '').trim().slice(0, 30)));
  console.log('buttons:', JSON.stringify(btns.filter(Boolean)));
  // click the last nav item area (bottom bar)
  const navBtns = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.y > innerHeight - 80) out.push({ t: (e.textContent || '').trim(), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
    });
    return out;
  });
  console.log('nav buttons:', JSON.stringify(navBtns));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
