// probe39: DEFINITIVE prefill test — fresh login in-session, then FIRST navigation to
// /contact (initState runs once) — check email. Then pop and re-enter (new initState).
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);
  if (await L.isLoggedIn(p)) { await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'load' }); await L.waitText(p, 'Buy now', 30000); }
  // login via bottom-nav Account tab (shell LoginScreen uses the MAIN store)
  const acctRect = await p.evaluate(() => {
    let hit = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim(); if (!t.startsWith('Account | Tab 5')) return;
      const bb = e.getBoundingClientRect();
      if (bb.width > 5 && !hit) hit = [Math.round(bb.x), Math.round(bb.y), Math.round(bb.width), Math.round(bb.height)];
    });
    return hit;
  });
  if (acctRect) await p.mouse.click(acctRect[0] + acctRect[2] / 2, acctRect[1] + acctRect[3] / 2); else await L.clickBtn(p, 'Login');
  await p.waitForTimeout(1200);
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 20000);
  const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }); await p.waitForTimeout(300);
  await p.keyboard.type('mobile.test.20260820@gmail.com', { delay: 6 });
  const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }); await p.waitForTimeout(300);
  await p.keyboard.type('StrongPass!1', { delay: 6 });
  await L.clickBtn(p, 'Log in');
  for (let i = 0; i < 25; i++) { if (await L.isLoggedIn(p)) break; await p.waitForTimeout(800); }
  console.log('token?', await L.isLoggedIn(p));
  await p.waitForTimeout(2000);
  // FIRST /contact build after login
  await p.evaluate(() => { window.location.hash = '/contact'; });
  await L.waitText(p, 'Contact us', 15000).catch(() => {});
  await p.waitForTimeout(3000);
  let vals = await p.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ a: i.getAttribute('aria-label'), v: i.value })));
  console.log('FIRST-VISIT FIELDS:', JSON.stringify(vals));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
