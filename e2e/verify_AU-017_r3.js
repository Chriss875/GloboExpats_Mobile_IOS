// verify_AU-017_r3.js — round 3: correct sequencing.
// Stage A: detail screen — click-everything sweep (no storefront detour first).
// Stage B: seller-card tap -> storefront assert -> goBack -> VERIFY DETAIL RESTORED.
// Stage C: WhatsApp button (popup capture + snackbar fallback) on the restored detail.
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
async function findTappable(page, needles) {
  return page.evaluate((ns) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (e.getAttribute('flt-tappable') === null) return;
      const txt = (e.textContent || '');
      for (const n of ns) if (!txt.includes(n)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 20 || r.height < 10 || r.bottom < 0 || r.top > innerHeight) return null;
      const area = r.width * r.height;
      if (!best || area < best.area) best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area };
    });
    return best;
  }, needles);
}
async function openDetail(page, vp) {
  await page.goto(`${APP}/product/${PID}`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await waitText(page, 'Rose Whisper', 40000);
  await page.waitForTimeout(2500);
}
(async () => {
  for (const vp of [{ name: 'mobile', w: 375, h: 667 }, { name: 'tablet', w: 768, h: 1024 }]) {
    const browser = await newBrowser();
    const ctx = await newCtx(browser, { viewport: { width: vp.w, height: vp.h },
      videoPath: `${OUT}/e2e/videos/${UNIT}-flutter-${vp.name}.webm` });
    const page = await ctx.newPage();
    const imgs = watchImages(page);
    const popups = [];
    ctx.on('page', async p => { popups.push(p.url()); try { await p.close(); } catch (e) {} });

    await login(page, BUYER);
    await openDetail(page, vp);
    let txt = await allText(page);

    // ---------- STAGE A: click everything on the DETAIL screen ----------
    // WhatsApp handled separately at stage C (external launcher), skip in sweep.
    const ctrls = (await listButtons(page)).filter(c => !/WhatsApp/.test(c.label));
    fs.writeFileSync(`${OUT}/e2e/tmp/${UNIT}-${vp.name}-controls.json`, JSON.stringify(ctrls, null, 1));
    const seen = new Set(); const results = []; const noEffect = [];
    for (const c of ctrls) {
      const key = c.kind + '|' + c.label.slice(0, 40);
      if (seen.has(key)) continue; seen.add(key);
      const name = c.kind + ':' + (c.label.replace(/\n/g, ' ').slice(0, 36) || '<unlabeled>');
      const beforeUrl = page.url(); const beforeTxt = await allText(page);
      let effect = '';
      if (/^Back$|^Share$/.test(c.label.trim())) { await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(400); }
      if (c.kind === 'button' && c.label.trim()) {
        const okb = await clickBtn(page, c.label.split('\n')[0].slice(0, 28));
        if (!okb) effect = 'click-failed';
      } else {
        const firstLine = c.label.split('\n')[0].slice(0, 20);
        const hit = await findTappable(page, [firstLine]);
        if (hit) await page.mouse.click(hit.cx, Math.max(15, Math.min(hit.cy, vp.h - 25)));
        else effect = 'node-not-found';
      }
      await page.waitForTimeout(1700);
      const afterTxt = await allText(page);
      if (page.url() !== beforeUrl) effect += ' NAV:' + page.url().replace(APP, '');
      else if (afterTxt !== beforeTxt) effect += ' TEXT-CHANGED';
      else { const sb = await hasSnackBar(page); if (sb.found) effect += ' SNACKBAR@y' + sb.atY; }
      results.push({ name, effect: effect || 'NONE' });
      if (effect && effect !== 'click-failed' && effect !== 'node-not-found') { /* good */ } else noEffect.push(name);
      if (page.url() !== beforeUrl) { await openDetail(page, vp); }
    }
    rec(`clicks-detail-${vp.name}`, noEffect.length === 0,
      `${results.length - noEffect.length}/${results.length} distinct controls produced an observable effect; without effect: ${noEffect.join('; ') || '(none)'}`,
      { total: results.length, ok: results.length - noEffect.length, noEffect });

    // ---------- STAGE B: seller card -> storefront ----------
    let cardHit = await findTappable(page, ['Radha Saindrane', 'Zuri Distributors']);
    if (!cardHit) { await scrollToBottom(page, 4); await page.waitForTimeout(600); cardHit = await findTappable(page, ['Radha Saindrane', 'Zuri Distributors']); }
    console.log(vp.name, 'sellerCard node:', JSON.stringify(cardHit));
    const urlBefore = page.url();
    const txtBeforeCard = await allText(page);
    if (cardHit) await page.mouse.click(cardHit.cx, cardHit.cy);
    await page.waitForTimeout(3500);
    txt = await allText(page);
    const markers = ['Founder', 'Kasoa was born from a vision', 'Listings'].filter(m => txt.includes(m));
    const ratingsOnStore = /Received Ratings|Ratings \(|Seller Reviews/i.test(txt);
    fs.writeFileSync(`${OUT}/e2e/tmp/${UNIT}-${vp.name}-storefront.txt`, txt);
    await screenshot(page, `${SHOTS}/flutter-${vp.name}-04-storefront.png`);
    rec(`sellercard-nav-${vp.name}`, cardHit && markers.length >= 2 && txtBeforeCard !== '' && txt.includes('Saindrane'),
      `tapped ${JSON.stringify(cardHit)} -> storefront markers=[${markers.join('|')}] ratingsSection=${ratingsOnStore}`,
      { markersFound: markers, ratingsSection: ratingsOnStore });
    rec(`storefront-listings-${vp.name}`, txt.includes('AU018 Own In Stock Teak Set') && txt.includes('TSh'),
      "seller's own listings render with real prices on storefront");

    await screenshot(page, `${SHOTS}/flutter-${vp.name}-05-storefront-bottom.png`);

    // back to detail
    await page.goBack(); await page.waitForTimeout(2800);
    txt = await allText(page);
    const backOk = txt.includes('Rose Whisper') && txt.includes('Specifications');
    await screenshot(page, `${SHOTS}/flutter-${vp.name}-06-back-to-detail.png`);
    rec(`back-to-detail-${vp.name}`, backOk, 'goBack restores the product detail view');

    // ---------- STAGE C: WhatsApp button ----------
    let waHit = await findTappable(page, ['WhatsApp']);
    if (!waHit) { await page.evaluate(() => scrollTo(0, 500)); await page.waitForTimeout(700); waHit = await findTappable(page, ['WhatsApp']); }
    console.log(vp.name, 'whatsapp node:', JSON.stringify(waHit));
    const beforeWa = await allText(page);
    let waEffect = '';
    if (waHit) {
      await page.mouse.click(waHit.cx, waHit.cy);
      await page.waitForTimeout(2200);
      const afterWa = await allText(page);
      if (popups.length) waEffect = 'EXTERNAL-PAGE:' + popups[0];
      else { const sb = await hasSnackBar(page); if (sb.found) waEffect = 'SNACKBAR@y' + sb.atY; else if (afterWa !== beforeWa) waEffect = 'TEXT-CHANGED'; }
    } else waEffect = 'node-not-found';
    rec(`whatsapp-${vp.name}`, waEffect.startsWith('EXTERNAL-PAGE') || waEffect.startsWith('SNACKBAR'),
      `tap WhatsApp seller row -> ${waEffect} (popups=${JSON.stringify(popups)})`, { effect: waEffect, popups });

    const isum = imageSummary(imgs);
    rec(`images-${vp.name}`, isum.failed === 0 && isum.total > 0,
      `image requests=${isum.total} ok=${isum.ok} failed=${isum.failed}`, { bad: Object.entries(imgs).filter(([, s]) => s >= 400) });

    await closeVideo(ctx, `${OUT}/e2e/videos/${UNIT}-flutter-${vp.name}.webm`);
    await browser.close();
  }
  fs.writeFileSync(`${OUT}/e2e/results/shards/AU-017-verify.jsonl`, LINES.map(l => JSON.stringify(l)).join('\n') + '\n');
  console.log('DONE r3 fails=' + LINES.filter(l => !l.ok).length);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
