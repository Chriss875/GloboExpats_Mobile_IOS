// dbg: cart persistence key = expatCartItems_<uid>. Find the uid and read the
// real key. Also verify the authed add writes a line.
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
  const allKeys = () => p.evaluate(() => { const o = []; for (let i = 0; i < localStorage.length; i++) o.push(localStorage.key(i)); return o; });
  console.log('keys after login:', JSON.stringify(await allKeys()));
  // token payload -> uid
  const uid = await p.evaluate(() => { try { const t = localStorage.getItem('flutter.auth_token'); return JSON.parse(atob(t.split('.')[1])).sub || JSON.parse(atob(t.split('.')[1])).id || '?'; } catch (e) { return 'err:' + e.message; } });
  console.log('token uid claim:', uid);
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  const ab = await p.evaluate(() => {
    const b2 = [...document.querySelectorAll('flt-semantics[role="button"]')]
      .map(e => ({ t: (e.textContent || '').trim(), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }))
      .find(b3 => /Add to cart/i.test(b3.t));
    return b2;
  });
  await p.mouse.click(ab.x, ab.y); await p.waitForTimeout(1800);
  const dump = await p.evaluate((u) => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/expatCartItems/.test(k)) o[k] = (localStorage.getItem(k) || '').slice(0, 400); } return o; }, uid);
  console.log('cart keys:', JSON.stringify(dump, null, 1));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
