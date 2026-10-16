const { chromium } = require('playwright');
const APP = 'http://localhost:9131';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  page.on('response', async r => {
    if (r.url().includes('8083') && r.request().method() === 'GET' && !r.url().includes('categories')) {
      let body = '';
      try { body = (await r.text()).slice(0, 300); } catch (_) {}
      console.log('API:', r.request().method(), r.url().slice(0, 120), '->', r.status(), '|', body.replace(/\s+/g, ' ').slice(0, 200));
    }
  });
  let n = 0;
  async function boot(hash, settle = 7000) {
    ++n; await page.goto(`${APP}/?probe=${n}#${hash}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await sleep(settle);
  }
  await boot('/login', 5000);
  const ei = page.locator('input[type="text"]').first(); const pi = page.locator('input[type="password"]').first();
  await ei.click({ force: true }); await page.keyboard.type('mobile.test.20260820@gmail.com');
  await pi.click({ force: true }); await page.keyboard.type('StrongPass!1');
  await page.keyboard.press('Enter'); await sleep(6000);
  console.log('--- navigating to o23 detail ---');
  await boot('/orders/49dee2e4-e785-45e9-91a8-6a4dac2b3270', 9000);
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
