// probe36: after login, what IS on the account tab? (bottom-nav Account vs shell _AccountView)
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/?tab=account', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 20000);
  const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }); await p.waitForTimeout(300);
  await p.keyboard.type('mobile.test.20260820@gmail.com', { delay: 6 });
  const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }); await p.waitForTimeout(300);
  await p.keyboard.type('StrongPass!1', { delay: 6 });
  await L.clickBtn(p, 'Log in');
  for (let i = 0; i < 25; i++) { if (await L.isLoggedIn(p)) break; await p.waitForTimeout(800); }
  console.log('token?', await L.isLoggedIn(p));
  await p.waitForTimeout(2500);
  const T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('TEXT:', JSON.stringify(T.replace(/\n+/g,' | ').slice(0, 600)));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
