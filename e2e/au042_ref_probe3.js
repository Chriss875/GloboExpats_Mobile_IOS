// Reference: the sandbox all-in-one user lacks web-admin role -> capture the gate
// AND the structural source contract (already read from admin-payments-tab.tsx).
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/admin/dashboard?tab=proformas', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(4000);
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-042/ref-r9-375-proforma-invoices-gate.png' });
  const t = await p.evaluate(() => document.body.innerText);
  console.log('gate text:', t.replace(/\n+/g, ' | ').slice(0, 220));
  await browser.close();
})().catch(e => { console.error('REF CRASH', e.message); process.exit(1); });
