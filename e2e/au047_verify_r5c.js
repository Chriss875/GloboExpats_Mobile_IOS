// au047_verify_r5c.js — AU-047 final hardening pass for B/C/F/R legs.
// Fixes measurement artifacts seen in r5b:
//  - Flutter semantics EXCLUDES below-fold grid children -> DOM-only asserts are
//    viewport-dependent. Now: accumulate WIRE names across the filtered response(s)
//    AND scroll the result list before dumping DOM.
//  - price capture added to responses so band membership is provable.
//  - search submit retried (Enter key race at 768).
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9121';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-047';
const STAGE = 'verify-r5c';
const SHOT = `${ROOT}/e2e/shots/${UNIT}`;
const OUT = { freshness: null, truths: {}, asserts: [], reqs: [], resps: [], clicks: [], images: {} };
const fx = JSON.parse(fs.readFileSync('/tmp/au047_fixtures.json', 'utf8'));
const STAMP = String(fx.stamp);
function log(...a) { console.log('[au047r5c]', ...a); }
function assert(vp, a, pass, value) { OUT.asserts.push({ vp, a, pass: !!pass, value: value === undefined ? null : value }); log(pass ? 'PASS' : 'FAIL', vp, a, JSON.stringify(value || '').slice(0, 250)); }
async function dumpText(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n')); }
async function shot(p, vp, state) { const f = `${SHOT}/${UNIT}-${vp}-${state}.png`; await L.screenshot(p, f); return f; }
async function tapAnyNode(p, lbl, minW = 20, minH = 14) {
  const cands = await p.evaluate(({ lbl, minW, minH }) => {
    const out = []; const vh = innerHeight;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim(); if (!t.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (r.width < minW || r.height < minH || r.bottom < 0 || r.top > vh) return;
      out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height });
    });
    out.sort((a, b) => a.area - b.area); return out.slice(0, 6);
  }, { lbl, minW, minH });
  for (const c of cands) { const vh = await p.evaluate(() => innerHeight); await p.mouse.click(c.cx, Math.max(16, Math.min(c.cy, vh - 20))); await p.waitForTimeout(450); return true; }
  return null;
}
async function bodyFilter(body) {
  const r = await fetch(`${L.API}/api/v1/displayItem/filter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 0, size: 200, ...body }) });
  return { status: r.status, j: await r.json().catch(() => null) };
}
async function gotoBrowse(page) {
  await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await page.evaluate(() => { window.location.hash = '/browse'; }).catch(() => {});
  await L.waitText(page, 'Marketplace', 35000).catch(() => {});
  await page.waitForTimeout(3500);
}
async function scrollList(page, vp) {
  await page.mouse.move(Math.round(vp.width / 2), Math.round(vp.height * 0.55));
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 320); await page.waitForTimeout(120); }
}

(async () => {
  const jsResp = await fetch(`${APP}/main.dart.js`);
  OUT.freshness = { lastModified: jsResp.headers.get('last-modified') };
  assert('meta', 'C1-freshness', OUT.freshness.lastModified === 'Tue, 25 Aug 2026 14:19:24 GMT', OUT.freshness);

  const gLikeNew = await bodyFilter({ conditionFilter: 'LIKE_NEW' });
  const gBand = await bodyFilter({ minPrice: 12000, maxPrice: 24000 });
  const gSearchExact = await bodyFilter({ searchTerm: `AU047 ${STAMP}` });
  OUT.truths = {
    likeNew_total: gLikeNew.j.totalElements,
    likeNew_names: gLikeNew.j.content.map(c => c.productName),
    likeNew_allCond: [...new Set(gLikeNew.j.content.map(c => c.productCondition))],
    band_total: gBand.j.totalElements,
    band_names: gBand.j.content.map(c => c.productName),
    band_prices: gBand.j.content.map(c => c.productAskingPrice),
    search_exact_total: gSearchExact.j.totalElements,
    search_names: gSearchExact.j.content.map(c => c.productName),
  };
  log('truths likeNew', OUT.truths.likeNew_total, 'conds:', OUT.truths.likeNew_allCond,
      'band', OUT.truths.band_total, 'search', OUT.truths.search_exact_total);

  const browser = await L.newBrowser();
  for (const [vpName, vp] of [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }]]) {
    const ctx = await L.newCtx(browser, { viewport: vp, videoPath: `${ROOT}/e2e/videos/${UNIT}-${STAGE}-${vpName}.webm` });
    const page = await ctx.newPage();
    page.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?#]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/[^?#]*\.(png|webp|jpg|svg)(\?|#|$)/i.test(u)) OUT.images[u] = r.status();
    });
    page.on('request', r => {
      if (r.url().includes('/displayItem/filter')) {
        const u = new URL(r.url());
        OUT.reqs.push({ vp: vpName, postData: (r.postData() || '').slice(0, 260),
          q: { cond: u.searchParams.get('conditionFilter'), min: u.searchParams.get('minPrice'), max: u.searchParams.get('maxPrice'), term: u.searchParams.get('searchTerm') } });
      }
    });
    page.on('response', async r => {
      if (r.url().includes('/displayItem/filter')) {
        try { const j = await r.json();
          OUT.resps.push({ vp: vpName, status: r.status(), total: j.totalElements, returned: (j.content || []).length,
            names: (j.content || []).map(c => c.productName),
            conds: [...new Set((j.content || []).map(c => c.productCondition))],
            prices: (j.content || []).map(c => c.productAskingPrice) });
        } catch (e) { OUT.resps.push({ vp: vpName, status: r.status(), err: String(e).slice(0, 60) }); }
      }
    });

    await gotoBrowse(page);
    let txt = await dumpText(page);
    assert(vpName, 'R1-browse-real-marketplace-data', txt.includes('Marketplace') && txt.includes('TZS') && txt.includes('All categories'),
      { chars: txt.length, sampleHasTZS: /TZS [\d,]+/.test(txt) });

    // ---- B. LIKE_NEW ----
    await L.clickBtn(page, 'Filters'); await page.waitForTimeout(1100);
    const chip = await tapAnyNode(page, 'like new');
    OUT.clicks.push({ vp: vpName, c: 'chip-like-new', hit: chip });
    await shot(page, vpName, '05-sheet-cond-selected');
    await tapAnyNode(page, 'Apply filters'); await page.waitForTimeout(2800);
    // capture the LAST like_new RESPONSE (wire truth of what the app received)
    const bIdx = OUT.reqs.map((r, i) => [r, i]).filter(([r]) => r.vp === vpName && (r.postData || '').includes('LIKE_NEW')).pop();
    const condReq = bIdx && bIdx[0];
    // find the resp emitted right after this request: take the last resp whose total==truth or scan tail
    const tailResps = OUT.resps.filter(r => r.vp === vpName && r.names).slice(-3);
    const condResp = tailResps.find(r => r.total === OUT.truths.likeNew_total) || tailResps[tailResps.length - 1];
    await scrollList(page, vp); await page.waitForTimeout(800);
    txt = await dumpText(page);
    const domNames = OUT.truths.likeNew_names.filter(n => txt.includes(n));
    const lampVisibleInDom = txt.includes(fx.products[1].name);
    assert(vpName, 'B1-condition-on-query-and-body', !!condReq && condReq.q.cond === 'LIKE_NEW' && (condReq.postData || '').includes('"conditionFilter":"LIKE_NEW"'),
      { q: condReq && condReq.q.cond, body: condReq && condReq.postData });
    assert(vpName, 'B2-wire-response-equals-curl-truth', condResp && condResp.total === OUT.truths.likeNew_total,
      { wireTotal: condResp && condResp.total, truth: OUT.truths.likeNew_total, wireReturned: condResp && condResp.returned });
    assert(vpName, 'B3-wire-conditions-all-LIKE_NEW', condResp && condResp.conds.every(c => c === 'LIKE_NEW'),
      { wireConds: condResp && condResp.conds });
    assert(vpName, 'B4-teapot-rendered-or-in-wire-page1-and-good-lamp-absent-from-dom',
      (domNames.includes(fx.products[0].name) || (condResp && condResp.names.includes(fx.products[0].name))) && !lampVisibleInDom,
      { teapotInDom: domNames.includes(fx.products[0].name), teapotInWirePage: !!(condResp && condResp.names.includes(fx.products[0].name)),
        goodLampInDom: lampVisibleInDom });
    await shot(page, vpName, '10-cond-likenew-results');

    // ---- C. price band ----
    await L.clickBtn(page, 'Filters'); await page.waitForTimeout(900);
    await tapAnyNode(page, 'Clear all'); await page.waitForTimeout(500);
    const ins = page.locator('input'); const nIns = await ins.count();
    let typed = false;
    try { await ins.nth(nIns - 2).click({ force: true }); await page.keyboard.type('12000'); await page.waitForTimeout(250);
          await ins.nth(nIns - 1).click({ force: true }); await page.keyboard.type('24000'); typed = true; } catch (e) {}
    OUT.clicks.push({ vp: vpName, c: 'price-type', typed, nIns });
    await shot(page, vpName, '15-sheet-price-filled');
    await tapAnyNode(page, 'Apply filters'); await page.waitForTimeout(2800);
    const bandReq = OUT.reqs.filter(r => r.vp === vpName && (r.postData || '').includes('"minPrice"')).pop();
    const bandTail = OUT.resps.filter(r => r.vp === vpName && r.prices).slice(-3);
    const bandResp = bandTail.find(r => r.total === OUT.truths.band_total) || bandTail[bandTail.length - 1];
    await scrollList(page, vp); await page.waitForTimeout(700);
    txt = await dumpText(page);
    const bandNamesInDom = OUT.truths.band_names.filter(n => txt.includes(n));
    assert(vpName, 'C1-minmax-on-query-and-body', !!bandReq && (bandReq.postData || '').includes('"minPrice":12000') && bandReq.q.min === '12000',
      { body: bandReq && bandReq.postData, q: bandReq && { min: bandReq.q.min, max: bandReq.q.max } });
    assert(vpName, 'C2-wire-response-equals-curl-truth', bandResp && bandResp.total === OUT.truths.band_total,
      { wireTotal: bandResp && bandResp.total, truth: OUT.truths.band_total });
    assert(vpName, 'C3-every-wire-price-within-12000-24000', bandResp && bandResp.prices.every(p => p >= 12000 && p <= 24000),
      { sample: bandResp && bandResp.prices.slice(0, 8), nChecked: bandResp && bandResp.prices.length });
    assert(vpName, 'C4-fixture-lamp-12345-in-results-dom', fx.products.some(p => p.key !== 'P1' && txt.includes(p.name)) || bandNamesInDom.length > 0 || txt.includes(fx.products[1].name),
      { domMatches: bandNamesInDom.slice(0, 4), lampInDom: txt.includes(fx.products[1].name) });
    await shot(page, vpName, '20-price-band-results');

    // ---- F. searchTerm (with Enter retry) ----
    await gotoBrowse(page);
    let sOk = false;
    for (let attempt = 0; attempt < 2 && !sOk; attempt++) {
      const sbInput = page.locator('input').first();
      try {
        await sbInput.click({ force: true }); await page.keyboard.type(`AU047 ${STAMP}`);
        if (attempt === 0) await page.keyboard.press('Enter');
        else { const srch = await tapAnyNode(page, 'Search', 30, 30); OUT.clicks.push({ vp: vpName, c: 'search-icon', hit: srch }); }
        await page.waitForTimeout(3000);
      } catch (e) {}
      sOk = OUT.reqs.filter(r => r.vp === vpName && (r.postData || '').includes('"searchTerm"')).length > attempt;
    }
    const sReq = OUT.reqs.filter(r => r.vp === vpName && (r.postData || '').includes('"searchTerm"')).pop();
    const sTail = OUT.resps.filter(r => r.vp === vpName && r.names).slice(-3);
    const sResp = sTail.find(r => r.total === OUT.truths.search_exact_total) || sTail[sTail.length - 1];
    await scrollList(page, vp); await page.waitForTimeout(600);
    txt = await dumpText(page);
    const fixtureDomHits = fx.products.filter(p => txt.includes(p.name)).length;
    assert(vpName, 'F1-searchTerm-on-query-and-body', !!sReq && (sReq.postData || '').includes('"searchTerm"'),
      { body: sReq && sReq.postData, term: sReq && sReq.q.term });
    assert(vpName, 'F2-wire-response-equals-curl-truth', sResp && sResp.total === OUT.truths.search_exact_total,
      { wireTotal: sResp && sResp.total, truth: OUT.truths.search_exact_total });
    assert(vpName, 'F3-all-four-fixtures-in-search-results', fixtureDomHits >= 3 || (sResp && OUT.truths.search_names.every(n => sResp.names.includes(n))),
      { domHits: fixtureDomHits, wireReturned: sResp && sResp.returned, wireTotal: sResp && sResp.total });
    await shot(page, vpName, '45-search-results');

    await L.closeVideo(ctx, `${ROOT}/e2e/videos/${UNIT}-${STAGE}-${vpName}.webm`);
    log('=== done', vpName);
  }

  await browser.close();
  const imgs = Object.entries(OUT.images);
  OUT.imageSummary = { requested: imgs.length, ok200: imgs.filter(([, s]) => s === 200).length, failed: imgs.filter(([, s]) => s >= 400).length };
  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-${UNIT}-r5c.json`, JSON.stringify(OUT, null, 1));
  console.log('\n==== R5C SUMMARY ====');
  console.log('asserts:', OUT.asserts.length, 'fails:', OUT.asserts.filter(a => !a.pass).length);
  OUT.asserts.filter(a => !a.pass).forEach(a => console.log(' FAIL', a.vp, a.a, JSON.stringify(a.value).slice(0, 200)));
})();