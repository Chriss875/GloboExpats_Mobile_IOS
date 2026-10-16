// dbg: where does CartStore persist? grep storage keys used by the app.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  // login
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
  const before = await p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = (localStorage.getItem(k)||'').length; } return o; });
  console.log('before:', JSON.stringify(before));
  const ab = await p.evaluate(() => {
    const b2 = [...document.querySelectorAll('flt-semantics[role="button"]')]
      .map(e => ({ t: (e.textContent || '').trim(), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }))
      .find(b3 => /Add to cart/i.test(b3.t));
    return b2;
  });
  await p.mouse.click(ab.x, ab.y); await p.waitForTimeout(1800);
  const after = await p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = (localStorage.getItem(k)||''); } return o; });
  for (const [k, v] of Object.entries(after)) {
    if ((before[k] || 0) !== v.length || /cart/i.test(k)) console.log('CHANGED/KEY', k, '=', String(v).slice(0, 400));
  }
  console.log('--- indexedDB? ---', await p.evaluate(() => !!window.indexedDB));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
