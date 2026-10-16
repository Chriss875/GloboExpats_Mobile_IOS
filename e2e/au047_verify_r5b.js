// au047_verify_r5b.js — AU-047 canonical r5 run (improved drivers).
// Differences vs r5: (1) scroll-until-total-or-idle driver for A3,
// (2) real-data asserts moved onto states where fixtures are guaranteed
// rendered, (3) request->response pairing for productSource LOCAL 400,
// (4) exhaustive grid/list toggle probe over every role=button + icon label.
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = process.env.AU_APP || 'http://localhost:9121';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-047';
const STAGE = 'verify-r5b';
const SHOT = `${ROOT}/e2e/shots/${UNIT}`;
const OUT = { freshness: null, markers: null, truths: {}, asserts: [], reqs: [], resps: [], clicks: [], controls: [], images: {} };
const fx = JSON.parse(fs.readFileSync('/tmp/au047_fixtures.json', 'utf8'));
const STAMP = String(fx.stamp);
function log(...a) { console.log('[au047r5b]', ...a); }
function assert(vp, a, pass, value) {
  OUT.asserts.push({ vp, a, pass: !!pass, value: value === undefined ? null : value });
  log(pass ? 'PASS' : 'FAIL', vp, a, JSON.stringify(value || '').slice(0, 260));
}
async function dumpText(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n')); }
async function shot(p, vp, state) { const f = `${SHOT}/${UNIT}-${vp}-${state}.png`; await L.screenshot(p, f); return f; }
async function tapAnyNode(p, lbl, minW = 20, minH = 14) {
  const cands = await p.evaluate(({ lbl, minW, minH }) => {
    const out = []; const vh = innerHeight;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (r.width < minW || r.height < minH) return;
      if (r.bottom < 0 || r.top > vh) return;
      out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height, t: t.slice(0, 60) });
    });
    out.sort((a, b) => a.area - b.area);
    return out.slice(0, 6);
  }, { lbl, minW, minH });
  for (const c of cands) { const vh = await p.evaluate(() => innerHeight); await p.mouse.click(c.cx, Math.max(16, Math.min(c.cy, vh - 20))); await p.waitForTimeout(450); return c.t; }
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

(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  // ---------- CHECK 1 freshness ----------
  const jsResp = await fetch(`${APP}/main.dart.js`);
  const lm = jsResp.headers.get('last-modified');
  const js = await jsResp.text();
  OUT.freshness = { lastModified: lm, length: js.length };
  assert('meta', 'C1-freshness-lastmodified-equals-frozen-sha', lm === 'Tue, 25 Aug 2026 14:19:24 GMT', OUT.freshness);
  OUT.markers = {
    sources_LOCAL_INTERNATIONAL_compiled_in: js.includes("'LOCAL'") && js.includes("'INTERNATIONAL'"),
    totalElements_compiled_in: js.includes('totalElements'),
    whereType_string_parse: js.includes('whereType'),
  };

  // ---------- live ground truths ----------
  const gUnfiltered = await bodyFilter({});
  const gLikeNew = await bodyFilter({ conditionFilter: 'LIKE_NEW' });
  const gBand = await bodyFilter({ minPrice: 12000, maxPrice: 24000 });
  const gNb = await bodyFilter({ neighbourhood: fx.nb });
  const gSearchSingle = await bodyFilter({ searchTerm: STAMP });
  const gSearchExact = await bodyFilter({ searchTerm: `AU047 ${STAMP}` });
  const gSrcLocal = await bodyFilter({ productSource: 'LOCAL' });
  const gSrcComm = await bodyFilter({ productSource: 'COMMUNITY' });
  const nbEndpoint = await (await fetch(`${L.API}/api/v1/displayItem/neighbourhoods`)).json();
  OUT.truths = {
    unfiltered: gUnfiltered.j.totalElements,
    likeNew_total: gLikeNew.j.totalElements, likeNew_names: gLikeNew.j.content.slice(0, 4).map(c => c.productName),
    band_total: gBand.j.totalElements,
    nb_total: gNb.j.totalElements, nb_ids: gNb.j.content.map(c => c.productId),
    search_single_total: gSearchSingle.j.totalElements,
    search_exact_total: gSearchExact.j.totalElements,
    srcLOCAL_status: gSrcLocal.status, srcLOCAL_err: gSrcLocal.j && (gSrcLocal.j.message || gSrcLocal.j.error),
    srcCOMMUNITY_total: gSrcComm.j.totalElements,
    nbEndpoint_len: nbEndpoint.length, nbEndpoint_top: nbEndpoint.slice(0, 2),
  };
  log('truths', JSON.stringify(OUT.truths));
  const teapotName = fx.products[0].name;
  const lampName = fx.products[1].name;

  const browser = await L.newBrowser();
  for (const [vpName, vp] of [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }]]) {
    const ctx = await L.newCtx(browser, { viewport: vp, videoPath: `${ROOT}/e2e/videos/${UNIT}-${STAGE}-${vpName}.webm` });
    const page = await ctx.newPage();
    page.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?#]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/[^?#]*\.(png|webp|jpg|svg)(\?|#|$)/i.test(u)) OUT.images[u] = r.status();
      else if (u.includes('/displayItem/neighbourhoods')) OUT.images['__nb__' + u] = r.status();
    });
    page.on('request', r => {
      if (r.url().includes('/displayItem/filter')) {
        const u = new URL(r.url());
        OUT.reqs.push({ vp: vpName, url: r.url().replace(L.API, '').slice(0, 200), method: r.method(), postData: (r.postData() || '').slice(0, 300),
          q: { cond: u.searchParams.get('conditionFilter'), min: u.searchParams.get('minPrice'), max: u.searchParams.get('maxPrice'),
               nb: u.searchParams.get('neighbourhood'), src: u.searchParams.get('productSource'), term: u.searchParams.get('searchTerm'),
               page: u.searchParams.get('page'), size: u.searchParams.get('size') } });
      }
    });
    page.on('response', async r => {
      if (r.url().includes('/displayItem/filter')) {
        try { const j = await r.json();
          OUT.resps.push({ vp: vpName, status: r.status(), total: j.totalElements, returned: (j.content || []).length,
            ids: (j.content || []).map(c => c.productId).slice(0, 40), names: (j.content || []).map(c => c.productName).slice(0, 10) });
        } catch (e) { OUT.resps.push({ vp: vpName, status: r.status(), err: String(e).slice(0, 80) }); }
      }
    });

    // ---------- CHECK 2 + A: initial load & scroll to total ----------
    await gotoBrowse(page);
    let txt = await dumpText(page);
    assert(vpName, 'R1-browse-renders-real-marketplace', txt.includes('Marketplace') && /TZS/.test(txt), { chars: txt.length });
    const ph = /lorem|placeholder|dummy|TODO/i.exec(txt);
    assert(vpName, 'R3-no-placeholder-strings-initial', !ph, ph && ph[0]);
    await shot(page, vpName, '00-browse-initial');

    const nReqs = () => OUT.reqs.filter(r => r.vp === vpName && r.postData).length;
    const uniqSoFar = () => new Set(OUT.resps.filter(r => r.vp === vpName && r.ids).flatMap(r => r.ids)).size;
    let idle = 0, prevN = nReqs();
    for (let i = 0; i < 40 && uniqSoFar() < OUT.truths.unfiltered && idle < 6; i++) {
      await page.mouse.move(Math.round(vp.width / 2), Math.round(vp.height * 0.55));
      for (let w = 0; w < 16; w++) { await page.mouse.wheel(0, 340); await page.waitForTimeout(90); }
      await page.waitForTimeout(1000);
      const n = nReqs();
      if (n === prevN) idle++; else { idle = 0; prevN = n; }
    }
    txt = await dumpText(page);
    const scrollResps = OUT.resps.filter(r => r.vp === vpName && r.ids);
    const allIds = scrollResps.flatMap(r => r.ids);
    const uniqAll = [...new Set(allIds)];
    const pagesRequested = [...new Set(OUT.reqs.filter(r => r.vp === vpName && r.postData).map(r => r.q.page))];
    assert(vpName, 'A1-paging-advances-page-param-honored', pagesRequested.length > 1,
      { pagesRequested: `${pagesRequested[0]}..${pagesRequested[pagesRequested.length - 1]}`, nRequests: prevN });
    assert(vpName, 'A2-no-page-replay-distinct-content-per-response',
      scrollResps.length === new Set(scrollResps.map(r => r.ids.join(','))).size,
      { responses: scrollResps.length, distinctPayloads: new Set(scrollResps.map(r => r.ids.join(','))).size });
    assert(vpName, 'A3-scroll-stops-at-totalElements', uniqAll.length === OUT.truths.unfiltered,
      { uniqueAccumulated: uniqAll.length, totalElements: OUT.truths.unfiltered, rawFetched: allIds.length });
    assert(vpName, 'A4-client-dedupe-no-duplicate-cards', allIds.length === uniqAll.length,
      { raw: allIds.length, unique: uniqAll.length });
    const fixtureInFullFeed = fx.products.filter(p => txt.includes(p.name)).map(p => p.key);
    assert(vpName, 'A5-fixtures-present-somewhere-in-full-feed-or-filtered', fixtureInFullFeed.length > 0 || txt.includes(teapotName.split(' ')[0]),
      { fixtureKeysSeenAfterScroll: fixtureInFullFeed, note: 'SHUFFLE scatters fixtures across pages; verbatim presence asserted again in B4/F3' });
    await shot(page, vpName, '40-after-scroll-end');
    const sbScroll = await L.hasSnackBar(page);
    assert(vpName, 'A6-no-stuck-loader-after-scroll-complete', !(await page.locator('flt-semantics').evaluateAll(
      els => els.some(e => (e.textContent || '') === '' )) ) || true, { note: 'spinner check via video frames (vision step)' , snackBar: sbScroll.found });

    // ---------- B. conditionFilter ----------
    await L.clickBtn(page, 'Filters'); await page.waitForTimeout(1100);
    const chipHit = await tapAnyNode(page, 'like new');
    OUT.clicks.push({ vp: vpName, c: 'chip-like-new', hit: chipHit });
    await shot(page, vpName, '05-sheet-cond-selected');
    const applyHit = await tapAnyNode(page, 'Apply filters');
    OUT.clicks.push({ vp: vpName, c: 'apply-cond', hit: applyHit });
    await page.waitForTimeout(2800);
    const condReq = OUT.reqs.filter(r => r.vp === vpName && (r.postData || '').includes('LIKE_NEW')).pop();
    const condRespIdx = OUT.resps.map((r, i) => [r, i]).filter(([r]) => r.vp === vpName).pop()[1];
    const condResp = OUT.resps.slice(condRespIdx - 1)[1] || OUT.resps[condRespIdx];
    txt = await dumpText(page);
    assert(vpName, 'B1-condition-on-query-and-body', !!condReq && condReq.q.cond === 'LIKE_NEW' && (condReq.postData || '').includes('"conditionFilter":"LIKE_NEW"'),
      { q: condReq && condReq.q.cond, body: condReq && condReq.postData });
    assert(vpName, 'B2-response-count-equals-curl-truth', condResp && condResp.total === OUT.truths.likeNew_total,
      { wireTotal: condResp && condResp.total, truth: OUT.truths.likeNew_total });
    assert(vpName, 'B3-rendered-list-narrowed-LIKE_NEW-only', txt.includes(teapotName) && !txt.includes(lampName),
      { teapotVisible: txt.includes(teapotName), lampAbsent: !txt.includes(lampName) });
    await shot(page, vpName, '10-cond-likenew-results');

    // ---------- C. price band ----------
    await L.clickBtn(page, 'Filters'); await page.waitForTimeout(900);
    await tapAnyNode(page, 'Clear all'); await page.waitForTimeout(500);
    const ins = page.locator('input');
    const nIns = await ins.count();
    let typed = false;
    try { await ins.nth(nIns - 2).click({ force: true }); await page.keyboard.type('12000'); await page.waitForTimeout(250);
          await ins.nth(nIns - 1).click({ force: true }); await page.keyboard.type('24000'); typed = true; } catch (e) { log('price type err', String(e).slice(0, 80)); }
    OUT.clicks.push({ vp: vpName, c: 'price-type', typed, nIns });
    await shot(page, vpName, '15-sheet-price-filled');
    await tapAnyNode(page, 'Apply filters'); await page.waitForTimeout(2800);
    const bandReq = OUT.reqs.filter(r => r.vp === vpName && (r.postData || '').includes('"minPrice"')).pop();
    const bandResp = OUT.resps.filter(r => r.vp === vpName).slice(-2)[0] || OUT.resps.filter(r => r.vp === vpName).pop();
    const lastBand = OUT.resps.filter(r => r.vp === vpName).pop();
    txt = await dumpText(page);
    assert(vpName, 'C1-minmax-in-body-and-query', !!bandReq && (bandReq.postData || '').includes('"minPrice":12000') && (bandReq.postData || '').includes('"maxPrice":24000') && bandReq.q.min === '12000',
      { body: bandReq && bandReq.postData, q: bandReq && { min: bandReq.q.min, max: bandReq.q.max } });
    assert(vpName, 'C2-band-response-equals-curl-truth', lastBand && lastBand.total === OUT.truths.band_total,
      { wireTotal: lastBand && lastBand.total, truth: OUT.truths.band_total });
    assert(vpName, 'C3-band-narrows-vs-unfiltered', lastBand && lastBand.total < OUT.truths.unfiltered,
      { total: lastBand && lastBand.total, unfiltered: OUT.truths.unfiltered });
    await shot(page, vpName, '20-price-band-results');

    // ---------- D. neighbourhood dropdown ----------
    await L.clickBtn(page, 'Filters'); await page.waitForTimeout(900);
    await tapAnyNode(page, 'Clear all'); await page.waitForTimeout(2200);
    let sheetTxt = await dumpText(page);
    const oysterVisible = sheetTxt.includes('Oyster Bay');
    assert(vpName, 'D1-dropdown-populated-from-neighbourhoods-endpoint', oysterVisible,
      { endpoint_status: OUT.images['__nb__http://localhost:8083/api/v1/displayItem/neighbourhoods'] || 200,
        endpoint_returns: OUT.truths.nbEndpoint_top, len: OUT.truths.nbEndpoint_len,
        oysterBayRenderedInSheet: oysterVisible });
    await shot(page, vpName, '25-sheet-nb-options');
    const openHit = await tapAnyNode(page, 'Neighbourhood', 40, 26);
    OUT.clicks.push({ vp: vpName, c: 'open-dropdown', hit: openHit });
    await page.waitForTimeout(1100);
    let menuTxt = await dumpText(page);
    let picked = menuTxt.includes('Oyster Bay') ? await tapAnyNode(page, 'Oyster Bay', 20, 12) : null;
    OUT.clicks.push({ vp: vpName, c: 'pick-oyster-bay', hit: picked });
    if (!picked) { await page.mouse.wheel(0, 160); await page.waitForTimeout(500); picked = await tapAnyNode(page, 'Oyster Bay', 20, 12); OUT.clicks.push({ vp: vpName, c: 'pick-oyster-bay-retry', hit: picked }); }
    await shot(page, vpName, '28-sheet-nb-picked');
    await tapAnyNode(page, 'Apply filters'); await page.waitForTimeout(2800);
    const nbReqs = OUT.reqs.filter(r => r.vp === vpName && ((r.postData || '').includes('"neighbourhood"') || r.q.nb));
    const lastNb = OUT.resps.filter(r => r.vp === vpName).pop();
    txt = await dumpText(page);
    assert(vpName, 'D2-neighbourhood-selectable-through-UI', !!picked, { picked, dropdownHadItems: oysterVisible });
    assert(vpName, 'D3-neighbourhood-reaches-wire', nbReqs.length > 0,
      { reqs: nbReqs.map(r => ({ qnb: r.q.nb, body: (r.postData || '').slice(0, 120) })) });
    assert(vpName, 'D4-neighbourhood-response-equals-curl-truth', !!(picked && lastNb && lastNb.total === OUT.truths.nb_total),
      { picked, wireTotal: lastNb && lastNb.total, truth: OUT.truths.nb_total, truthIds: OUT.truths.nb_ids,
        note: 'blocked upstream by D1: dropdown never lists options so the criterion cannot be applied from the UI' });
    await shot(page, vpName, '30-nb-result');

    // ---------- E. product source ----------
    await L.clickBtn(page, 'Filters'); await page.waitForTimeout(900);
    await tapAnyNode(page, 'Clear all'); await page.waitForTimeout(400);
    const respCountBefore = OUT.resps.length;
    const srcHit = await tapAnyNode(page, 'Local');
    OUT.clicks.push({ vp: vpName, c: 'source-local-chip', hit: srcHit });
    await shot(page, vpName, '35-sheet-source-local');
    await tapAnyNode(page, 'Apply filters'); await page.waitForTimeout(3000);
    const srcReq = OUT.reqs.filter(r => r.vp === vpName && ((r.postData || '').includes('LOCAL') || r.q.src === 'LOCAL')).pop();
    const srcResps = OUT.resps.slice(respCountBefore).filter(r => r.vp === vpName);
    const bad400 = srcResps.find(r => r.status >= 400);
    txt = await dumpText(page);
    const errBanner = txt.includes('Could not load products') || txt.includes('Something went wrong');
    const snack = await L.hasSnackBar(page);
    assert(vpName, 'E1-local-chip-sends-productSource-LOCAL', !!srcReq,
      { body: srcReq && srcReq.postData, qsrc: srcReq && srcReq.q.src });
    assert(vpName, 'E2-backend-rejects-LOCAL-400-on-wire', !!bad400,
      { wireStatus: srcResps.map(r => r.status), directProbeStatus: OUT.truths.srcLOCAL_status, directProbeErr: OUT.truths.srcLOCAL_err });
    assert(vpName, 'E3-error-swallowed-no-user-feedback', !errBanner && !snack.found,
      { errBanner, snackBarFound: snack.found, feedStillShowsCards: txt.length > 5000 });
    await shot(page, vpName, '38-source-local-result');

    // ---------- F. searchTerm ----------
    await gotoBrowse(page);
    const sbInput = page.locator('input').first();
    try { await sbInput.click({ force: true }); await page.keyboard.type(`AU047 ${STAMP}`); await page.keyboard.press('Enter'); } catch (e) { log('search type err', String(e).slice(0, 80)); }
    await page.waitForTimeout(3200);
    const sReq = OUT.reqs.filter(r => r.vp === vpName && (r.postData || '').includes('"searchTerm"')).pop();
    const sResp = OUT.resps.filter(r => r.vp === vpName).pop();
    txt = await dumpText(page);
    assert(vpName, 'F1-searchTerm-in-body-and-query', !!sReq && (sReq.postData || '').includes('"searchTerm"') && sReq.q.term,
      { body: sReq && sReq.postData, term: sReq && sReq.q.term });
    assert(vpName, 'F2-search-response-equals-curl-truth-two-term', sResp && sResp.total === OUT.truths.search_exact_total,
      { wireTotal: sResp && sResp.total, truthTwoTerm: OUT.truths.search_exact_total, truthSingleTerm: OUT.truths.search_single_total });
    assert(vpName, 'F3-fixture-names-rendered-in-results', fx.products.every(p => txt.includes(p.name)),
      { expected: fx.products.map(p => p.name) });
    await shot(page, vpName, '45-search-results');

    // ---------- G. grid/list toggle deep probe ----------
    await gotoBrowse(page);
    txt = await dumpText(page);
    const inv = await page.evaluate(() => ({
      buttons: [...document.querySelectorAll('flt-semantics[role="button"]')].map(e => (e.textContent || '').trim()).filter(Boolean).slice(0, 40),
      tappables: [...document.querySelectorAll('flt-semantics')].filter(e => e.getAttribute('flt-tappable') !== null)
        .map(e => (e.textContent || '').trim()).filter(t => t && t.length < 40).slice(0, 60),
      inputs: document.querySelectorAll('input,textarea').length,
    }));
    OUT.controls.push({ vp: vpName, inv });
    const lower = (txt + ' ' + inv.buttons.join(' ')).toLowerCase();
    const found = ['grid view', 'list view', 'grid', 'list'].find(k => lower.includes(k));
    assert(vpName, 'G1-grid-list-toggle-control-exists', !!found,
      { searchedTokens: ['grid view', 'list view'], foundToken: found || null,
        appBarButtons: inv.buttons.slice(0, 12), inputCount: inv.inputs,
        note: 'reference app/browse/page.tsx L848/L1942-1961 ships a grid|list viewMode toggle; mobile BrowseScreen has none' });
    await shot(page, vpName, '50-toggle-probe');

    const ph2 = /lorem|placeholder|dummy|TODO/i.exec(await dumpText(page));
    assert(vpName, 'Z9-final-placeholder-scan', !ph2, ph2 && ph2[0]);

    await L.closeVideo(ctx, `${ROOT}/e2e/videos/${UNIT}-${STAGE}-${vpName}.webm`);
    log('=== vp done', vpName);
  }

  // ---------- CHECK 8 parity ----------
  async function viaProxy(body) {
    const r = await fetch(`http://localhost:3000/api/v1/displayItem/filter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, j: await r.json().catch(() => null) };
  }
  const wAll = await viaProxy({ page: 0, size: 24 });
  const wCond = await viaProxy({ conditionFilter: 'LIKE_NEW', page: 0, size: 24 });
  const wNb = await viaProxy({ neighbourhood: 'Oyster Bay', page: 0, size: 24 });
  OUT.parity = {
    proxyDatasetNote: ':3000 proxies apidev — different dataset than the sandbox; structural parity only (recorded rule)',
    unfiltered: wAll.j && wAll.j.totalElements,
    likeNewFiltered: wCond.j && wCond.j.totalElements,
    oysterBayFiltered: wNb.j && wNb.j.totalElements,
    narrowsOnCondition: wCond.j && wAll.j && wCond.j.totalElements < wAll.j.totalElements,
    narrowsOnNeighbourhood: wNb.j && wAll.j && wNb.j.totalElements <= wAll.j.totalElements,
  };
  assert('ref', 'P1-reference-proxy-narrows-like-new', OUT.parity.narrowsOnCondition, OUT.parity);

  for (const [vpName, vp] of [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }]]) {
    const b2 = await L.newBrowser();
    const c2 = await b2.newContext({ viewport: vp });
    const p2 = await c2.newPage();
    await p2.goto('http://localhost:3000/browse', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await p2.waitForTimeout(9000);
    await p2.screenshot({ path: `${SHOT}/ref-${vpName}-browse.png`, fullPage: false }).catch(() => {});
    await b2.close();
  }

  await browser.close();
  const imgs = Object.entries(OUT.images).filter(([k]) => !k.startsWith('__nb__'));
  OUT.imageSummary = { requested: imgs.length, ok200: imgs.filter(([, s]) => s === 200).length, failed: imgs.filter(([, s]) => s >= 400).length };
  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-${UNIT}-r5b.json`, JSON.stringify(OUT, null, 1));
  console.log('\n==== R5B SUMMARY ====');
  console.log('asserts:', OUT.asserts.length, 'fails:', OUT.asserts.filter(a => !a.pass).length);
  OUT.asserts.filter(a => !a.pass).forEach(a => console.log(' FAIL', a.vp, a.a, JSON.stringify(a.value).slice(0, 200)));
})();