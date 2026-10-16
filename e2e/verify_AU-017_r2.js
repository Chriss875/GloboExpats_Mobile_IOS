// verify_AU-017_r2.js — round 2: precise seller-card tap (label contains name+org+Verified),
// click-everything with goBack-after-nav, popup capture for WhatsApp, snackbar detection.
const { APP, BUYER, newBrowser, newCtx, closeVideo, allText, waitText, clickBtn,
  listButtons, scrollToBottom, watchImages, imageSummary, login, screenshot, hasSnackBar } = require('./lib_verify');
const fs = require('fs');
const UNIT = 'AU-017';
const PID = 481;
const OUT = '/home/devsystemadmin/GloboExpats_Mobile/e2e';
const SHOTS = `${OUT}/e2e/shots/${UNIT}`;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(`${OUT}/e2e/tmp`, { recursive: true });
fs.mkdirSync(`${OUT}/e2e/results/shards`, { recursive: true });
const LINES = [];
function rec(stage, ok, detail, extra = {}) {
  LINES.push({ unit: UNIT, stage, ts: new Date().toISOString(), ok, detail, ...extra });
  console.log((ok ? 'PASS ' : 'FAIL ') + stage + ' :: ' + detail);
}
// find a tappable node by predicate over its full text; returns center coords
async function findTappable(page, mustInclude) {
  return page.evaluate((needles) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (e.getAttribute('flt-tappable') === null) return;
      const txt = (e.textContent || '');
      for (const n of needles) if (!txt.includes(n)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 20 || r.height < 10 || r.bottom < 0 || r.top > innerHeight) return null;
      const area = r.width * r.height;
      if (!best || area < best.area) best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area, txt: txt.slice(0, 80) };
    });
    return best;
  }, mustInclude);
}
(async () => {
  for (const vp of [{ name: 'mobile', w: 375, h: 667 }, { name: 'tablet', w: 768, h: 1024 }]) {
    const browser = await newBrowser();
    const ctx = await newCtx(browser, { viewport: { width: vp.w, height: vp.h },
      videoPath: `${OUT}/e2e/videos/${UNIT}-flutter-${vp.name}.webm` });
    const page = await ctx.newPage();
    const imgs = watchImages(page);
    const popups = [];
    ctx.on('page', p => popups.push(p.url()));
    await login(page, BUYER);
    await page.goto(`${APP}/product/${PID}`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await waitText(page, 'Rose Whisper', 40000);
    await page.waitForTimeout(2500);

    // ---- precise SELLER CARD tap ----
    let cardHit = await findTappable(page, ['Radha Saindrane', 'Zuri Distributors']);
    if (!cardHit) { // scroll a bit if off-screen
      await scrollToBottom(page, 4); await page.waitForTimeout(500);
      cardHit = await findTappable(page, ['Radha Saindrane', 'Zuri Distributors']);
    }
    console.log('sellerCard node:', JSON.stringify(cardHit));
    const urlBefore = page.url();
    if (cardHit) await page.mouse.click(cardHit.cx, cardHit.cy);
    await page.waitForTimeout(3500);
    let txt = await allText(page);
    const storeMarkers = ['Founder', 'Kasoa was born from a vision', 'Mlangi Langi'];
    const storeHits = storeMarkers.filter(m => txt.includes(m));
    fs.writeFileSync(`${OUT}/e2e/tmp/${UNIT}-${vp.name}-storefront.txt`, txt);
    await screenshot(page, `${SHOTS}/flutter-${vp.name}-04-storefront.png`);
    rec(`sellercard-nav-${vp.name}`, page.url() !== urlBefore && storeHits.length >= 2,
      `clicked ${JSON.stringify(cardHit)}; url ${urlBefore} -> ${page.url()}; markers=[${storeHits.join('|')}]`,
      { urlAfter: page.url(), markersFound: storeHits });

    // storefront images + ratings presence
    const storeRatings = /Received Ratings|Seller Reviews|Ratings \(/.test(txt);
    rec(`storefront-content-${vp.name}`, storeHits.length >= 2 && storeRatings,
      `ratingsSection=${storeRatings} listingsVisible=${txt.includes('TSh')}`);

    // back
    await page.goBack(); await page.waitForTimeout(2500);

    // ---- CLICK EVERYTHING v2 ----
    const ctrls = await listButtons(page);
    fs.writeFileSync(`${OUT}/e2e/tmp/${UNIT}-${vp.name}-controls.json`, JSON.stringify(ctrls, null, 1));
    // inspect unlabeled buttons (rects + neighbors)
    const unlabeled = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (e.getAttribute('role') === 'button' && !(e.textContent || '').trim()) {
          const r = e.getBoundingClientRect(); out.push({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
        }
      });
      return out;
    });
    console.log(vp.name, 'unlabeled buttons:', JSON.stringify(unlabeled));
    const seen = new Set(); let okClicks = 0; const totalClicks = []; const noEffect = [];
    for (const c of ctrls) {
      const key = c.kind + '|' + c.label.slice(0, 40);
      if (seen.has(key)) continue; seen.add(key);
      const name = c.kind + ':' + (c.label.replace(/\n/g, ' ').slice(0, 36) || '<unlabeled>');
      // ensure target is on screen: scroll to top first for header items
      if (/Back|Share/.test(name)) { await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(400); }
      const beforeTxt = await allText(page); const beforeUrl = page.url();
      let effect = '';
      if (c.kind === 'button' && c.label.trim()) {
        const okb = await clickBtn(page, c.label.split('\n')[0].slice(0, 28));
        if (!okb) effect = 'click-failed';
      } else {
        const hit = c.label.trim()
          ? await findTappable(page, [c.label.split('\n')[0].slice(0, 20)])
          : (unlabeled[0] ? { cx: unlabeled[0].x + unlabeled[0].w / 2, cy: unlabeled[0].y + unlabeled[0].h / 2 } : null);
        if (hit) await page.mouse.click(hit.cx, Math.max(15, Math.min(hit.cy, vp.h - 25)));
        else effect = 'node-not-found';
      }
      await page.waitForTimeout(1600);
      const afterTxt = await allText(page);
      if (page.url() !== beforeUrl) effect += ' NAV:' + page.url().replace(APP, '');
      else if (afterTxt !== beforeTxt) effect += ' TEXT-CHANGED';
      else { const sb = await hasSnackBar(page); if (sb.found) effect += ' SNACKBAR@y' + sb.atY; }
      totalClicks.push({ name, effect: effect || 'NONE' });
      if (effect && !effect.startsWith('click-failed') && effect !== 'node-not-found') okClicks++;
      else noEffect.push(name);
      if (page.url() !== beforeUrl) { await page.goto(beforeUrl, { waitUntil: 'load' }).catch(() => {}); await waitText(page, 'Rose Whisper', 30000); await page.waitForTimeout(1800); }
    }
    fs.writeFileSync(`${OUT}/e2e/tmp/${UNIT}-${vp.name}-clicks.json`, JSON.stringify(totalClicks, null, 1));
    rec(`clicks-${vp.name}`, noEffect.length === 0,
      `${okClicks}/${totalClicks.length} distinct controls produced an effect; none: ${noEffect.join('; ')}`,
      { okClicks, total: totalClicks.length, noEffect, results: totalClicks });

    const isum = imageSummary(imgs);
    rec(`images-${vp.name}`, isum.failed === 0 && isum.total > 0,
      `total=${isum.total} ok=${isum.ok} failed=${isum.failed}`, { bad: Object.entries(imgs).filter(([, s]) => s >= 400) });
    rec(`popups-${vp.name}`, true, `external pages opened: ${popups.join(', ') || 'none'}`, { popups });

    await closeVideo(ctx, `${OUT}/e2e/videos/${UNIT}-flutter-${vp.name}.webm`);
    await browser.close();
  }
  fs.writeFileSync(`${OUT}/e2e/results/shards/${UNIT}-verify.jsonl`, LINES.map(l => JSON.stringify(l)).join('\n') + '\n');
  console.log('DONE r2', JSON.stringify({ fails: LINES.filter(l => !l.ok).length }));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
