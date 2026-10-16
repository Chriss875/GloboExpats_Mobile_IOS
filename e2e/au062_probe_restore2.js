// probe35: after reload, what does the account tab show? (login form or account view)
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/?tab=account', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);
  console.log('token?', await L.isLoggedIn(p));
  let T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('account tab text head:', JSON.stringify(T.slice(0, 200)));
  // login
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 20000);
  const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }); await p.waitForTimeout(300);
  await p.keyboard.type('mobile.test.20260820@gmail.com', { delay: 6 });
  const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }); await p.waitForTimeout(300);
  await p.keyboard.type('StrongPass!1', { delay: 6 });
  await L.clickBtn(p, 'Log in');
  for (let i = 0; i < 25; i++) { if (await L.isLoggedIn(p)) break; await p.waitForTimeout(800); }
  await p.waitForTimeout(1500);
  T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('after login shows My account?', T.includes('My account'), '| email?', T.includes('mobile.test.20260820@gmail.com'));
  // reload and re-check account tab
  await p.reload({ waitUntil: 'load' }); await L.waitText(p, 'Buy now', 40000); await p.waitForTimeout(2500);
  await p.evaluate(() => { window.location.hash = '/'; }); await p.waitForTimeout(1200);
  await p.evaluate(() => { window.location.search = '?tab=account'; }); 
  await p.goto(APP + '/?tab=account', { waitUntil: 'load' }); await L.waitText(p, 'Buy now', 40000);
  await p.waitForTimeout(3000);
  T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('POST-RELOAD account shows My account?', T.includes('My account'), '| Login?', T.includes('Welcome back'), '| token?', await L.isLoggedIn(p));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
