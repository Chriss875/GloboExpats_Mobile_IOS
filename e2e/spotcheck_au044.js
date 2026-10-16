// spotcheck_au044.js - quick orchestrator spot-check that hero CTAs navigate.
// Full Appendix A verification of AU-044 happens later via its own verifier agent;
// this only proves my fix works before more code lands on top of it.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const APP = 'http://localhost:9100';
const OUT = path.join(__dirname, 'shots', 'AU-044-spotcheck');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
  });
  for (const vp of [{ w: 375, h: 667 }, { w: 768, h: 1024 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    await page.goto(APP + '/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(4000); // canvaskit paint
    // hero CTA "Buy now" should push /browse
    const buyNow = page.locator('flt-semantics[role="button"]:has-text("Buy now")').first();
    await buyNow.click({ force: true }).catch(e => console.log('click err', e.message));
    await page.waitForTimeout(2500);
    const url1 = page.url();
    // back home, "Sell for free" should push /sell
    await page.goBack().catch(() => {});
    await page.waitForTimeout(2000);
    const sell = page.locator('flt-semantics[role="button"]:has-text("Sell for free")').first();
    await sell.click({ force: true }).catch(e => console.log('click err', e.message));
    await page.waitForTimeout(2500);
    const url2 = page.url();
    console.log(`${vp.w}x${vp.h}: Buy now -> ${url1} | Sell for free -> ${url2}`);
    await page.screenshot({ path: `${OUT}/${vp.w}x${vp.h}-after-cta.png` });
    await ctx.close();
  }
  await browser.close();
  console.log('SPOTCHECK DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
