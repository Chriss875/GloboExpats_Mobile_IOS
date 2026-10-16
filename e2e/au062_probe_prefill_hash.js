// probe52: does the hash-based navigation actually REBUILD the screen? Compare:
// (a) in-app push (context.push('/contact') style) — via checkout link? No.
// Instead: check if initState ran with email set by adding a marker: type name, submit
// would fail on reason... simpler: after login, do FULL page reload to /#/contact.
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
  // full reload straight into /contact (app boots WITH session restored)
  await p.goto(APP + '/#/contact', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Contact us', 40000).catch(() => {});
  await p.waitForTimeout(4000);
  let vals = await p.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ a: i.getAttribute('aria-label'), v: i.value })));
  console.log('AFTER-RELOAD FIELDS:', JSON.stringify(vals));
  // is the app even logged in here? account tab shows?
  const r = await p.evaluate(() => {
    let hit = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if ((e.textContent || '').trim() !== 'Account\nTab 5 of 5') return;
      const bb = e.getBoundingClientRect(); hit = [bb.x, bb.y, bb.width, bb.height];
    });
    return hit;
  });
  console.log('tab5 rect present?', !!r);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
