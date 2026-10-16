// Reference admin proforma tab, logged in as the sandbox all-in-one user.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/login', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const email = process.env.REF_EMAIL || 'mobile.test.20260820@gmail.com';
  const pw = process.env.REF_PW;
  await p.fill('input[type="email"], input[name="email"]', email).catch(()=>{});
  await p.fill('input[type="password"]', pw).catch(()=>{});
  await p.click('button[type="submit"]').catch(()=>{});
  await p.waitForTimeout(5000);
  await p.goto('http://localhost:3000/admin/dashboard?tab=proformas', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-042/ref-r9-375-proforma-invoices.png' });
  const t = await p.evaluate(() => document.body.innerText);
  console.log('body:', t.replace(/\n+/g, ' | ').slice(0, 400));
  await browser.close();
})().catch(e => { console.error('REF CRASH', e.message); process.exit(1); });
