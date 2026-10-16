// verify_AU-017.js — detail_tabs_seller_card_ratings
// Canonical checklist: freshness / real data / images / clicks / shots(2 vp) / parity later (ref_AU-017).
const { APP, REF, API, BUYER, newBrowser, newCtx, closeVideo, allText, waitText, clickBtn,
  clickCard, listButtons, scrollToBottom, watchImages, imageSummary, login, isLoggedIn,
  screenshot, apiLogin, api } = require('./lib_verify');
const fs = require('fs');

const UNIT = 'AU-017';
const PID = 481; // Natural Perfume - Rose Whisper: spec block + rated seller 59
const SELLER = 59;
const SHOTS = `e2e/shots/${UNIT}`;
const LINES = [];
const ev = [];
function hasName0(t) { return t.length > 0; }
function rec(stage, ok, detail, extra={}) {

  const line = { unit: UNIT, stage, ts: new Date().toISOString(), ok, detail, ...extra };
  LINES.push(line); console.log((ok ? 'PASS ' : 'FAIL ') + stage + ' :: ' + detail);
  return line;
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync('e2e/tmp', { recursive: true });
  for (const vp of [{ name: 'mobile', w: 375, h: 667 }, { name: 'tablet', w: 768, h: 1024 }]) {
    const browser = await newBrowser();
    const ctx = await newCtx(browser, { viewport: { width: vp.w, height: vp.h },
      videoPath: `e2e/videos/${UNIT}-flutter-${vp.name}.webm` });
    const page = await ctx.newPage();
    const imgs = watchImages(page);
    const netlog = [];
    page.on('response', r => { const u = r.url(); if (u.includes(':8083')) netlog.push(r.status() + ' ' + u.replace(/^.*8083/, '')); });

    // ---- login (real sandbox user) ----
    const li = await login(page, BUYER);
    rec(`login-${vp.name}`, li, 'flutter.auth_token present after real login', {});

    // ---- navigate directly to the detail route ----
    await page.goto(`${APP}/product/${PID}`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await waitText(page, 'Rose Whisper', 40000);
    await page.waitForTimeout(2500);
    let txt = await allText(page);
    fs.writeFileSync(`e2e/tmp/${UNIT}-${vp.name}-detail.txt`, txt);
    console.log('detail text bytes', txt.length, 'hasName', hasName0(txt));

    // ---- REAL DATA asserts ----
    const hasName = txt.includes("Natural Perfume - Rose Whisper") || txt.includes('Rose Whisper');
    const specRows = ['Product Type', 'Brand', 'Gender', 'Volume/Size', 'Expiry Date'];
    const specsFound = specRows.filter(s => txt.includes(s));
    const specValsFound = ['fragrance', 'Kasoa', 'women', '20ml', '12/2026'].filter(v => txt.includes(v));
    const reviewsHdr = /Seller Reviews \(\d+\)/.exec(txt);
    const reviewAuthor = txt.includes('Angel Mecky');
    const reviewTextHit = txt.includes('Smooth process. Excellent service.');
    const sellerCard = txt.includes('Radha Saindrane') && txt.includes('Verified');
    rec(`data-${vp.name}`, hasName && specsFound.length >= 4 && specValsFound.length >= 4,
      `name=${hasName} specLabels=${specsFound.join('|')} specValues=${specValsFound.join('|')}`,
      { specLabelsFound: specsFound.length, specValuesFound: specValsFound.length });
    rec(`reviews-${vp.name}`, !!reviewsHdr && reviewAuthor && reviewTextHit,
      `header="${reviewsHdr ? reviewsHdr[0] : 'MISSING'}" author AngelMecky=${reviewAuthor} verbatimText=${reviewTextHit}`,
      { reviewsHeader: reviewsHdr ? reviewsHdr[0] : null });
    rec(`sellerCard-${vp.name}`, sellerCard, 'Radha Saindrane + Verified badge visible on card',
      { sellerCardVisible: sellerCard });

    // placeholder scan
    const ph = /lorem|placeholder|dummy|TODO|sample text/i.exec(txt);
    rec(`no-placeholder-${vp.name}`, !ph, ph ? `HIT ${ph[0]}` : 'clean snapshot', {});

    // ---- screenshots: top state ----
    await screenshot(page, `${SHOTS}/flutter-${vp.name}-01-detail-top.png`);
    // scrolled to specs
    const specY = await page.evaluate(() => {
      const els = [...document.querySelectorAll('flt-semantics')];
      for (const e of els) if ((e.textContent || '').includes('Specifications')) {
        const r = e.getBoundingClientRect(); return r.top;
      }
      return -1;
    });
    if (specY > 0) { await page.mouse.move(vp.w / 2, 400); await page.mouse.wheel(0, Math.max(0, Math.min(specY - 120, 3000))); await page.waitForTimeout(700); }
    else { await scrollToBottom(page, 6); }
    txt = await allText(page);
    await screenshot(page, `${SHOTS}/flutter-${vp.name}-02-specs.png`);
    rec(`specs-visible-${vp.name}`, txt.includes('Specifications'), 'Specifications heading rendered after scroll');

    // scroll to reviews
    for (let i = 0; i < 14 && !(await page.evaluate(() =>
      [...document.querySelectorAll('flt-semantics')].some(e => /Seller Reviews/.test(e.textContent || '')))); i++) {
      await page.mouse.move(vp.w / 2, 400); await page.mouse.wheel(0, 500); await page.waitForTimeout(180);
    }
    await page.waitForTimeout(600);
    txt = await allText(page);
    await screenshot(page, `${SHOTS}/flutter-${vp.name}-03-reviews.png`);
    rec(`reviews-visible-${vp.name}`, /Seller Reviews \(1\)/.test(txt), 'Seller Reviews (1) + Angel Mecky row in view');

    // ---- enumerate controls ----
    const ctrls = await listButtons(page);
    fs.writeFileSync(`e2e/tmp/${UNIT}-${vp.name}-controls.json`, JSON.stringify(ctrls, null, 1));
    rec(`controls-${vp.name}`, true, `${ctrls.length} interactive nodes enumerated`, { count: ctrls.length });

    // ---- CLICK seller card -> storefront ----
    netlog.length = 0; imgs && Object.keys(imgs).forEach(k => delete imgs[k]);
    const beforeUrl = page.url();
    let clicked = false;
    // the card is a tappable node containing the seller name
    const cands = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        if ((e.textContent || '').includes('Radha Saindrane')) {
          const r = e.getBoundingClientRect();
          if (r.width < 20 || r.bottom < 0 || r.top > innerHeight) return;
          out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height });
        }
      });
      out.sort((a, b) => a.area - b.area);
      return out.slice(0, 3);
    });
    for (const c of cands) { await page.mouse.click(c.cx, c.cy); clicked = true; break; }
    if (!clicked) { clicked = await clickCard(page, 'Radha'); }
    await page.waitForTimeout(3500);
    const navTxt = await allText(page);
    const storefrontOk = navTxt.includes("Kasoa was born from a vision") ||
      (/Listings/i.test(navTxt) && navTxt.includes('Saindrane'));
    fs.writeFileSync(`e2e/tmp/${UNIT}-${vp.name}-storefront.txt`, navTxt);
    await screenshot(page, `${SHOTS}/flutter-${vp.name}-04-storefront.png`);
    rec(`sellercard-nav-${vp.name}`, storefrontOk && page.url() !== beforeUrl,
      `url ${beforeUrl} -> ${page.url()} | aboutMe+listings visible=${storefrontOk}`,
      { urlAfter: page.url(), listingsVisible: storefrontOk });

    // back to detail
    await page.goBack(); await page.waitForTimeout(2500);

    // ---- remaining controls: click every one with observable effect check ----
    const ctrlSnapshot = await listButtons(page);
    const seen = new Set();
    let okClicks = 0, totalClicks = 0;
    const clickResults = [];
    for (const c of ctrlSnapshot) {
      const key = c.kind + '|' + c.label.slice(0, 40);
      if (seen.has(key)) continue;
      seen.add(key);
      totalClicks++;
      const beforeTxt = await allText(page);
      const beforeUrl2 = page.url();
      let did = false;
      if (c.kind === 'button') did = await clickBtn(page, c.label.split('\n')[0].slice(0, 30));
      else did = await clickCard(page, c.label.split('\n')[0].slice(0, 24));
      await page.waitForTimeout(1400);
      const afterTxt = await allText(page);
      const changed = afterTxt !== beforeTxt || page.url() !== beforeUrl2;
      clickResults.push({ label: c.label.slice(0, 60), kind: c.kind, effect: changed });
      if (changed) okClicks++;
      if (changed && page.url() !== beforeUrl2) { /* navigated away; go back */ }
    }
    rec(`clicks-${vp.name}`, okClicks === totalClicks, `${okClicks}/${totalClicks} clicks had observable effect`,
      { okClicks, totalClicks, clickResults });

    const isum = imageSummary(imgs);
    rec(`images-${vp.name}`, isum.failed === 0 && isum.total > 0,
      `total=${isum.total} ok=${isum.ok} failed=${isum.failed}`, { ...isum, urls: Object.entries(imgs).map(([u, s]) => s + ' ' + u.slice(-48)) });
    fs.writeFileSync(`e2e/tmp/${UNIT}-${vp.name}-net.log`, netlog.join('\n'));

    // tablet/desktop second viewport already covered by loop
    await closeVideo(ctx, `e2e/videos/${UNIT}-flutter-${vp.name}.webm`);
    await browser.close();
  }

  fs.mkdirSync('e2e/results/shards', { recursive: true });
  fs.appendFileSync(`e2e/results/shards/${UNIT}-verify.jsonl`, LINES.map(l => JSON.stringify(l)).join('\n') + '\n');
  console.log('DONE', JSON.stringify({ stages: LINES.length, fails: LINES.filter(l => !l.ok).length }));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
