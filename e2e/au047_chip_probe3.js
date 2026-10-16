const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 375, height: 667 } })).newPage();
  const resps = [];
  page.on('response', async r => {
    if (r.url().includes('/displayItem/filter')) {
      let body = '';
      try { body = (await r.text()).slice(0, 200); } catch (e) { body = 'ERR ' + e.message; }
      resps.push({ url: r.url().slice(0, 80), status: r.status(), body });
    }
  });
  await page.goto('http://localhost:9131/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { window.location.hash = '#/browse'; });
  await page.waitForTimeout(8000);
  console.log(JSON.stringify(resps, null, 1).slice(0, 1200));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
