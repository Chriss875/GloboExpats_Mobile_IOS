// probe10: seed localStorage with the exact keys restoreSession reads, then cold-load /contact.
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    localStorage.setItem('flutter.auth_token', '"probe-token-not-real"');
    localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com'));
  });
  await p.goto(APP + '/#/contact', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Contact us', 40000).catch(() => {});
  await p.waitForTimeout(3500);
  const vals = await p.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ aria: i.getAttribute('aria-label'), v: i.value })));
  console.log('FIELDS-COLD:', JSON.stringify(vals));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
