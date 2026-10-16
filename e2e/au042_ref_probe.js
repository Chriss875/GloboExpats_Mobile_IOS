const { chromium } = require(require('path').join(process.cwd(),'node_modules','playwright'));
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/admin/dashboard?tab=proformas', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-042/ref-r9-375-proforma-invoices-gate.png' });
  console.log('body text:', (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 300));
  // try login flow if gated
  const hasLogin = /log in|sign in|welcome/i.test(await p.evaluate(() => document.body.innerText));
  console.log('gated:', hasLogin);
  await browser.close();
})().catch(e => { console.error('REF CRASH', e.message); process.exit(1); });
