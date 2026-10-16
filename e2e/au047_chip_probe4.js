// capture ALL requests + responses from #/browse load, incl. failures
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 375, height: 667 } })).newPage();
  const log = [];
  page.on('request', r => { if (r.url().includes(':8083') || r.url().includes('/api/')) log.push(['REQ', r.method(), r.url().slice(0, 110)]); });
  page.on('response', r => { if (r.url().includes(':8083') || r.url().includes('/api/')) log.push(['RES', r.status(), r.url().slice(0, 110)]); });
  page.on('requestfailed', r => { log.push(['FAIL', r.failure() && r.failure().errorText, r.url().slice(0, 110)]); });
  console.onconsole = null;
  page.on('console', m => { if (m.type() === 'error') log.push(['CONSOLE-ERR', m.text().slice(0, 140), '']); });
  await page.goto('http://localhost:9131/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { window.location.hash = '#/browse'; });
  await page.waitForTimeout(9000);
  for (const l of log.slice(-30)) console.log(l.join(' | '));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
