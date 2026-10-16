// probe30: empty form -> Send -> screenshot validation errors (name/reason/subject/message)
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  let fired = false;
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  p.on('request', r => { if (/contact\/submit/.test(r.url())) fired = true; });
  await p.goto(APP + '/#/contact', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Contact us', 40000);
  await p.waitForTimeout(3000);
  await p.locator('flt-semantics[role="button"]', { hasText: 'Send message' }).first().click({ force: true }).catch(() => {});
  await p.waitForTimeout(1500);
  console.log('empty-send fired post?', fired);
  await p.screenshot({ path: '/home/devsystemadmin/tmp_au062/probe30-empty.png' });
  const T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  for (const s of ['Name is required', 'Please select a reason', 'Subject is required', 'Message is required']) {
    console.log(`"${s}"`, T.includes(s));
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
