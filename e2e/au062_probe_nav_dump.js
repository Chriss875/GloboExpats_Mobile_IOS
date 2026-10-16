// probe44: dump bottom-nav nodes post-login (Account label text?)
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
  await p.waitForTimeout(1500);
  const nodes = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .map(e => ({ t: (e.textContent || '').trim().slice(0, 50), role: e.getAttribute('role'), y: Math.round(e.getBoundingClientRect().y) }))
    .filter(n => n.y > innerHeight - 90 && n.t));
  console.log('BOTTOM-NAV:', JSON.stringify(nodes));
  // click Account via hash
  await p.evaluate(() => { window.location.hash = '/?tab=account'; });
  await p.waitForTimeout(2500);
  const T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('?tab=account shows My account?', T.includes('My account'), '| email?', T.includes('mobile.test.20260820@gmail.com'));
  console.log('TEXT:', JSON.stringify(T.replace(/\n+/g,' | ').slice(0, 300)));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
