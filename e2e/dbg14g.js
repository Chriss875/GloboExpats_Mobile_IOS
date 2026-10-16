// dbg: AUTHED add on 646 — login first, then add, dump cart storage.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  // login via UI
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
  await p.evaluate(() => { window.__snackLog = []; new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes || []) if (n.nodeType === 1) window.__snackLog.push((n.textContent || '').trim().slice(0, 80)); }).observe(document.body, { childList: true, subtree: true }); });
  const ab = await p.evaluate(() => {
    const b2 = [...document.querySelectorAll('flt-semantics[role="button"]')]
      .map(e => ({ t: (e.textContent || '').trim(), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }))
      .find(b3 => /Add to cart/i.test(b3.t));
    return b2;
  });
  console.log('addBtn', ab);
  await p.mouse.click(ab.x, ab.y); await p.waitForTimeout(1600);
  console.log('snacks:', JSON.stringify(await p.evaluate(() => window.__snackLog)));
  const store = await p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/cart/i.test(k)) o[k] = (localStorage.getItem(k) || '').slice(0, 300); } return o; });
  console.log('cart storage:', JSON.stringify(store, null, 1));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
