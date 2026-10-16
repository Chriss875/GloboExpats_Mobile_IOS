// Probe: does the rental order detail render the item line + Rental booking block?
const { chromium } = require('playwright');
const APP = 'http://localhost:9131';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  let n = 0;
  async function boot(hash, settle = 9000) {
    ++n; await page.goto(`${APP}/?probe=${n}#${hash}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await sleep(settle);
    return page.evaluate(() => Array.from(document.querySelectorAll('flt-semantics')).map(e => (e.textContent || '').trim()).filter(Boolean).join('\n'));
  }
  // login first
  await boot('/login', 6000);
  const ei = page.locator('input[type="text"]').first(); const pi = page.locator('input[type="password"]').first();
  await ei.click({ force: true }); await page.keyboard.type('mobile.test.20260820@gmail.com');
  await pi.click({ force: true }); await page.keyboard.type('StrongPass!1');
  await page.keyboard.press('Enter');
  await sleep(7000);
  const t = await boot('/orders/49dee2e4-e785-45e9-91a8-6a4dac2b3270', 10000);
  console.log('=== has product name:', /Lakeside|AU016/i.test(t));
  console.log('=== has "Items Ordered":', t.includes('Items Ordered'));
  console.log('=== has "Unit:":', t.includes('Unit:'));
  console.log('=== has "Rental booking":', t.includes('Rental booking'));
  console.log('=== has window:', t.includes('2026-08-27') || t.includes('Aug 27'));
  console.log('=== has "2 days":', /2 days/.test(t));
  console.log('--- excerpt around Items Ordered ---');
  const i = t.indexOf('Items Ordered');
  console.log(JSON.stringify(t.slice(Math.max(0,i-80), i+400)));
  await page.screenshot({ path: '/tmp/o23-probe.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
