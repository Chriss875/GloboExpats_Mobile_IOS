// probe8: does AuthStore.instance.email exist at /contact build time?
// Read KvStore key via localStorage 'flutter.auth_email' — restoreSession reads
// KvStore.kAuthEmail = 'auth_email' but shared_preferences on web prefixes 'flutter.'
// => restoreSession reads the WRONG key. Verify by checking what main.dart reads vs writes.
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);
  const all = await p.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  console.log('LS-KEYS:', JSON.stringify(Object.keys(all)));
  console.log('flutter.auth_email =', JSON.stringify(all['flutter.auth_email'] ?? null));
  // Now login fresh and check again + open contact
  if (!(await L.isLoggedIn(p))) {
    await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 20000);
    const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }); await p.waitForTimeout(300);
    await p.keyboard.type('mobile.test.20260820@gmail.com', { delay: 6 });
    const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }); await p.waitForTimeout(300);
    await p.keyboard.type('StrongPass!1', { delay: 6 });
    await L.clickBtn(p, 'Log in');
    for (let i = 0; i < 25; i++) { if (await L.isLoggedIn(p)) break; await p.waitForTimeout(800); }
  }
  const all2 = await p.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  console.log('AFTER-LOGIN flutter.auth_email =', JSON.stringify(all2['flutter.auth_email'] ?? null));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
