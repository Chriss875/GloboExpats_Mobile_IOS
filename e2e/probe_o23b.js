// Scroll the detail list and dump full a11y text to see if item line exists below fold.
const { chromium } = require('playwright');
const APP = 'http://localhost:9131';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  let n = 0;
  async function boot(hash, settle = 8000) {
    ++n; await page.goto(`${APP}/?pb=${n}#${hash}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await sleep(settle);
  }
  await boot('/login', 5000);
  const ei = page.locator('input[type="text"]').first(); const pi = page.locator('input[type="password"]').first();
  await ei.click({ force: true }); await page.keyboard.type('mobile.test.20260820@gmail.com');
  await pi.click({ force: true }); await page.keyboard.type('StrongPass!1');
  await page.keyboard.press('Enter'); await sleep(6000);
  await boot('/orders/49dee2e4-e785-45e9-91a8-6a4dac2b3270', 9000);
  // scroll down inside the scrollable
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 400); await sleep(700); }
  const t = await page.evaluate(() => Array.from(document.querySelectorAll('flt-semantics')).map(e => (e.textContent || '').trim()).filter(Boolean).join('\n'));
  console.log('after-scroll has Unit:', t.includes('Unit:'));
  console.log('has Rental booking:', t.includes('Rental booking'));
  console.log('has Lakeside:', /Lakeside/i.test(t));
  console.log('has cabin img request earlier — check semantics count:', await page.evaluate(() => document.querySelectorAll('flt-semantics').length));
  await page.screenshot({ path: '/tmp/o23-probe-scrolled.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
