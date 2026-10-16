// probe6: prefill check — login via UI, then open /contact via ACCOUNT TAB ListTile path
// (the real in-app navigation), not hash. Also dump AuthStore email from a fresh /contact build.
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);
  if (await L.isLoggedIn(p)) {
    await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil: 'load' }); await L.waitText(p, 'Buy now', 30000);
  }
  // go to Account tab and use the Login screen there
  await L.clickBtn(p, 'Account'); await p.waitForTimeout(1200);
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 20000);
  const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }); await p.waitForTimeout(300);
  await p.keyboard.type('mobile.test.20260820@gmail.com', { delay: 6 });
  const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }); await p.waitForTimeout(300);
  await p.keyboard.type('StrongPass!1', { delay: 6 });
  await L.clickBtn(p, 'Log in');
  let logged = false;
  for (let i = 0; i < 25; i++) { if (await L.isLoggedIn(p)) { logged = true; break; } await p.waitForTimeout(800); }
  console.log('logged', logged);
  await p.waitForTimeout(1500);
  // Now the account view should be showing; tap "Help & about" then look for links
  const T1 = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('ACCOUNT-VIEW has Help & about?', T1.includes('Help & about'));
  // deep-link to /contact after login (initState reads AuthStore.instance.email)
  await p.evaluate(() => { window.location.hash = '/contact'; });
  await L.waitText(p, 'Contact us', 15000).catch(() => {});
  await p.waitForTimeout(4000);
  const vals = await p.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ aria: i.getAttribute('aria-label'), v: i.value })));
  console.log('FIELDS:', JSON.stringify(vals));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
