// dbg: use L.clickBtn exactly like the passing verifiers do (force click on
// the locator, which Playwright computes itself). If THIS works, my raw
// p.mouse.click coords were wrong all along.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9108/#/product/629', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  await p.waitForTimeout(3000);
  const okClick = await L.clickBtn(p, 'Add to cart');
  console.log('clickBtn returned:', okClick);
  let seen = '';
  for (let i = 0; i < 40; i++) { await p.waitForTimeout(120); const m = (await L.allText(p)).match(/own listed items|Added to cart|Login Required|out of stock/); if (m) { seen = m[0]; break; } }
  console.log('result:', seen || 'NO REACTION');
  console.log('DOM has Added?', await p.evaluate(() => document.body.innerHTML.includes('Added to cart')));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
