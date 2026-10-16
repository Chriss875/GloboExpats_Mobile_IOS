// probe34: after reload, does the APP restore the session (Account tab shows My account)?
// Distinguishes "restore broken" from "prefill-only bug".
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
  console.log('logged(pre)', await L.isLoggedIn(p));
  // full reload -> app must restore session from storage
  await p.reload({ waitUntil: 'load' }); await L.waitText(p, 'Buy now', 40000);
  await p.waitForTimeout(2500);
  let T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('after reload shows My account?', T.includes('My account'), '| shows Welcome back?', T.includes('Welcome back'));
  // open account tab explicitly
  await p.evaluate(() => { window.location.hash = '/?tab=account'; }); await p.waitForTimeout(2500);
  T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('account-tab shows My account?', T.includes('My account'), '| email shown?', T.includes('mobile.test.20260820@gmail.com'));
  // now deep-link /contact in the SAME restored session
  await p.evaluate(() => { window.location.hash = '/contact'; });
  await L.waitText(p, 'Contact us', 15000).catch(() => {});
  await p.waitForTimeout(3000);
  const vals = await p.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ a: i.getAttribute('aria-label'), v: i.value })));
  console.log('FIELDS:', JSON.stringify(vals));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
