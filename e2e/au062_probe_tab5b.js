// probe46: click Account tab with looser matching (text contains 'Account\nTab 5')
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
  // use L.btn locator directly
  const loc = L.btn(p, 'Account');
  const cnt = await loc.count();
  console.log('btn(Account) count:', cnt);
  for (let i = 0; i < cnt; i++) {
    const bb = await loc.nth(i).boundingBox();
    if (bb && bb.y > 500) {
      console.log('clicking at', Math.round(bb.x + bb.width/2), Math.round(bb.y + bb.height/2));
      await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
      break;
    }
  }
  await p.waitForTimeout(2500);
  const T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('My account?', T.includes('My account'), '| email?', T.includes('mobile.test.20260820@gmail.com'));
  if (T.includes('My account')) {
    await p.evaluate(() => { window.location.hash = '/contact'; });
    await L.waitText(p, 'Contact us', 15000).catch(() => {});
    await p.waitForTimeout(3000);
    const vals = await p.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ a: i.getAttribute('aria-label'), v: i.value })));
    console.log('FIELDS:', JSON.stringify(vals));
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
