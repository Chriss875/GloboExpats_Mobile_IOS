// probe37: tap the bottom-nav Account item after login; dump the view
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 20000);
  const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }); await p.waitForTimeout(300);
  await p.keyboard.type('mobile.test.20260820@gmail.com', { delay: 6 });
  const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }); await p.waitForTimeout(300);
  await p.keyboard.type('StrongPass!1', { delay: 6 });
  await L.clickBtn(p, 'Log in');
  for (let i = 0; i < 25; i++) { if (await L.isLoggedIn(p)) break; await p.waitForTimeout(800); }
  // find bottom nav "Account" and click by rect
  const acctRect = await p.evaluate(() => {
    let hit = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim(); if (t !== 'Account') return;
      const bb = e.getBoundingClientRect();
      if (bb.y > innerHeight * 0.8 && bb.width > 5 && !hit) hit = [Math.round(bb.x), Math.round(bb.y), Math.round(bb.width), Math.round(bb.height)];
    });
    return hit;
  });
  console.log('acctRect:', acctRect);
  if (acctRect) { await p.mouse.click(acctRect[0] + acctRect[2] / 2, acctRect[1] + acctRect[3] / 2); }
  else { await L.clickBtn(p, 'Account'); }
  await p.waitForTimeout(2500);
  const T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('TEXT:', JSON.stringify(T.replace(/\n+/g,' | ').slice(0, 700)));
  console.log('has Help & about?', T.includes('Help & about'), '| has My account?', T.includes('My account'));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
