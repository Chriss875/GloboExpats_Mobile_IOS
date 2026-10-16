// probe42: after login completes via shell LoginScreen, does the account view show?
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);
  if (await L.isLoggedIn(p)) { await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'load' }); await L.waitText(p, 'Buy now', 30000); }
  // login from the header 'Login' button on home
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 20000);
  const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }); await p.waitForTimeout(300);
  await p.keyboard.type('mobile.test.20260820@gmail.com', { delay: 6 });
  const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }); await p.waitForTimeout(300);
  await p.keyboard.type('StrongPass!1', { delay: 6 });
  await L.clickBtn(p, 'Log in');
  for (let i = 0; i < 25; i++) { if (await L.isLoggedIn(p)) break; await p.waitForTimeout(800); }
  console.log('token?', await L.isLoggedIn(p));
  await p.waitForTimeout(2000);
  let T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('post-login TEXT head:', JSON.stringify(T.replace(/\n+/g,' | ').slice(0, 400)));
  console.log('has My account?', T.includes('My account'), '| has Welcome back?', T.includes('Welcome back'));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
