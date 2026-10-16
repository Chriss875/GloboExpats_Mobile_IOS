// ref_AU-017.js — PARITY: run the same AU-017 flow on the reference Next.js app :3000,
// same viewport, same data (product 481, seller 59). Saves ref-<vp>-<state>.png alongside
// the flutter shots and records deltas.
const { REF, newBrowser, newCtx, closeVideo } = require('./lib_verify');
const fs = require('fs');
const UNIT = 'AU-017';
const PID = 481;
const SHOTS = `e2e/shots/${UNIT}`;
const LINES = [];
function rec(stage, ok, detail, extra = {}) {
  LINES.push({ unit: UNIT, stage, ok, detail, ...extra });
  console.log((ok ? 'PASS ' : 'FAIL ') + stage + ' :: ' + detail);
}
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const vp of [{ name: 'mobile', w: 375, h: 667 }, { name: 'tablet', w: 768, h: 1024 }]) {
    const browser = await newBrowser();
    const ctx = await newCtx(browser, { viewport: { width: vp.w, height: vp.h },
      videoPath: `e2e/videos/${UNIT}-ref-${vp.name}.webm` });
    const page = await ctx.newPage();
    const imgReq = [], imgRes = [];
    page.on('request', r => { if (/\.(png|jpe?g|webp|svg|ico)(\?|$)/i.test(r.url())) imgReq.push(r.url()); });
    page.on('response', r => { const u = r.url(); if (/\.(png|jpe?g|webp|svg|ico)(\?|$)/i.test(u) || u.includes('/uploads/')) imgRes.push(r.status() + ' ' + u); });

    await page.goto(`${REF}/product/${PID}`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    // wait for reviews tab content to hydrate
    let haveReviews = false;
    for (let i = 0; i < 30 && !haveReviews; i++) {
      haveReviews = await page.evaluate(() => document.body.innerText.includes('Seller Reviews')).catch(() => false);
      if (!haveReviews) await page.waitForTimeout(1000);
    }
    const bodyText = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(`e2e/tmp/${UNIT}-ref-${vp.name}-detail.txt`, bodyText);
    const specLabels = ['Product Type', 'Brand', 'Gender', 'Volume/Size', 'Expiry Date'].filter(s => bodyText.includes(s));
    rec(`ref-data-${vp.name}`, bodyText.includes('Rose Whisper') && specLabels.length >= 3,
      `name=${bodyText.includes('Rose Whisper')} specLabels=${specLabels.length} reviewsTab=${haveReviews}`,
      { specLabels });
    await page.screenshot({ path: `${SHOTS}/ref-${vp.name}-01-detail-top.png` });

    // click Specifications tab
    const specTab = page.getByRole('tab', { name: /Specs/i });
    if (await specTab.count()) { await specTab.first().click().catch(() => {}); await page.waitForTimeout(1200); }
    const specTxt = await page.evaluate(() => document.body.innerText);
    await page.screenshot({ path: `${SHOTS}/ref-${vp.name}-02-specs.png` });
    rec(`ref-specs-tab-${vp.name}`, specTxt.includes('Technical Specifications'),
      `Technical Specifications heading=${specTxt.includes('Technical Specifications')}`);

    // click Reviews tab
    const revTab = page.getByRole('tab', { name: /Review/i });
    if (await revTab.count()) { await revTab.first().click().catch(() => {}); await page.waitForTimeout(1500); }
    const revTxt = await page.evaluate(() => document.body.innerText);
    await page.screenshot({ path: `${SHOTS}/ref-${vp.name}-03-reviews.png` });
    rec(`ref-reviews-tab-${vp.name}`, revTxt.includes('Angel Mecky') || revTxt.includes('No reviews yet for this seller'),
      `AngelMecky=${revTxt.includes('Angel Mecky')} emptyState=${revTxt.includes('No reviews yet for this seller')}`);

    // seller card click -> storefront
    const sellerLink = page.locator('a[href*="/seller/"]').first();
    const sellerHref = await sellerLink.getAttribute('href').catch(() => null);
    if (sellerLink) { await sellerLink.click({ force: true }).catch(() => {}); await page.waitForTimeout(3500); }
    const storeTxt = await page.evaluate(() => document.body.innerText);
    await page.screenshot({ path: `${SHOTS}/ref-${vp.name}-04-storefront.png` });
    fs.writeFileSync(`e2e/tmp/${UNIT}-ref-${vp.name}-storefront.txt`, storeTxt);
    rec(`ref-sellercard-nav-${vp.name}`, /\/seller\//.test(page.url()),
      `href=${sellerHref} urlAfter=${page.url()}`, { urlAfter: page.url() });

    const badImgs = imgRes.filter(l => !/^200|^304/.test(l));
    rec(`ref-images-${vp.name}`, badImgs.length === 0,
      `imgResponses=${imgRes.length} failed=${badImgs.length}`, { bad: badImgs.slice(0, 6) });

    await closeVideo(ctx, `e2e/videos/${UNIT}-ref-${vp.name}.webm`);
    await browser.close();
  }
  fs.appendFileSync(`e2e/results/shards/${UNIT}-parity.jsonl`, LINES.map(l => JSON.stringify(l)).join('\n') + '\n');
  console.log('DONE ref');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
