// Live probe: do category chips refetch + change grid on :9131 @c6b4d61?
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  const reqs = [];
  page.on('request', r => { if (r.url().includes('/displayItem/filter')) reqs.push(r.postData()); });
  await page.goto('http://localhost:9131/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { window.location.hash = '#/browse'; });
  await page.waitForTimeout(6000);
  const dump = () => page.evaluate(() => {
    const nodes = [...document.querySelectorAll('flt-semantics[role]')];
    return nodes.map(n => n.getAttribute('aria-label') || n.textContent).filter(Boolean).slice(0, 40);
  });
  let t = await dump();
  console.log('CONTROLS:', JSON.stringify(t.filter(x => x && x.length < 40)));
  // tap Books & Media chip
  const before = (await dump()).join('|');
  const chip = page.locator('flt-semantics', { hasText: 'Books & Media' }).first();
  try { await chip.click({ timeout: 5000 }); console.log('clicked Books&Media'); } catch (e) { console.log('click fail', e.message.slice(0, 60)); }
  await page.waitForTimeout(4000);
  const after = (await dump()).join('|');
  console.log('reqs fired:', reqs.length, 'last body:', (reqs[reqs.length - 1] || '').slice(0, 120));
  console.log('grid changed:', before !== after);
  console.log('after head:', after.slice(0, 200));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
