// probe57: same as 56 but wait longer after login for the account tab to show the email
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);
  if (!(await L.isLoggedIn(p))) {
    await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 20000);
    const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }); await p.waitForTimeout(300);
    await p.keyboard.type('mobile.test.20260820@gmail.com', { delay: 6 });
    const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }); await p.waitForTimeout(300);
    await p.keyboard.type('StrongPass!1', { delay: 6 });
    await L.clickBtn(p, 'Log in');
    for (let i = 0; i < 25; i++) { if (await L.isLoggedIn(p)) break; await p.waitForTimeout(800); }
  }
  console.log('token?', await L.isLoggedIn(p));
  // click Tab5
  const r = await p.evaluate(() => {
    let hit = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if ((e.textContent || '').trim() !== 'Account\nTab 5 of 5') return;
      const bb = e.getBoundingClientRect(); hit = [bb.x, bb.y, bb.width, bb.height];
    });
    return hit;
  });
  console.log('tab5?', !!r);
  if (r) { await p.mouse.click(r[0] + r[2] / 2, r[1] + r[3] / 2); }
  else { await p.mouse.click(340, 640); }   // bottom-right corner fallback
  await p.waitForTimeout(3500);
  let T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('account email visible?', T.includes('mobile.test.20260820@gmail.com'));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
