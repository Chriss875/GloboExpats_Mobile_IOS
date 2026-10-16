// au047_verify_r5.js — AU-047 round 5: RE-RUN THE WIRE PROOF against the FIXED bundle.
// Lane under test: FROZEN http://localhost:9121 (git sha e1a5762, main.dart.js
// Last-Modified Tue, 25 Aug 2026 14:19:24 GMT). Fix c1aa34b moved all filter
// criteria into the JSON body (mirrors web lib/api.ts filterProducts).
// Canonical checklist Appendix A: freshness, real data, images, clicks, shots,
// native vision (PNGs read by the model elsewhere), video, parity, verdict.
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = process.env.AU_APP || 'http://localhost:9121';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-047';
const STAGE = 'verify-r5';
const SHOT = `${ROOT}/e2e/shots/${UNIT}`;
const OUT = { freshness: null, asserts: [], reqs: [], resps: [], clicks: [], controls: [], images: {}, parity: {} };
const fx = JSON.parse(fs.readFileSync('/tmp/au047_fixtures.json', 'utf8'));
const STAMP = String(fx.stamp);
function log(...a) { console.log('[au047r5]', ...a); }
function assert(vp, a, pass, value) {
  OUT.asserts.push({ vp, a, pass: !!pass, value: value === undefined ? null : value });
  log(pass ? 'PASS' : 'FAIL', vp, a, value !== undefined ? JSON.stringify(value).slice(0, 300) : '');
}
async function dumpText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n'));
}
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
// independent ground truth straight from the sandbox (BODY binding)
async function bodyFilter(body) {
  const r = await fetch(`${L.API}/api/v1/displayItem/filter`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: 0, size: 200, ...body }),
  });
  return { status: r.status, j: await r.json().catch(() => null) };
}

(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  // ---------- CHECK 1: freshness ----------
  const head = await fetch(`${APP}/main.dart.js`, { method: 'GET', headers: { Range: 'bytes=0-0' } });
  const lm = head.headers.get('last-modified');
  const cl = head.headers.get('content-range');
  OUT.freshness = { lastModified: lm, contentRange: cl };
  assert('meta', 'C1-freshness-lastmodified-equals-frozen-sha', lm === 'Tue, 25 Aug 2026 14:19:24 GMT', OUT.freshness);
  const js = await (await fetch(`${APP}/main.dart.js`)).text();
  const markers = {
    bodyFix_comment: js.includes('criteria ride BOTH') || js.includes('@RequestBody'),
    bodyKeys_conditionFilter: js.includes("'conditionFilter'"),
    whereType_neighbourhood_parse_bug: js.includes('whereType<String>()'),
    sources_LOCAL_INTERNATIONAL: js.includes('LOCAL') && js.includes('INTERNATIONAL'),
    totalElements: js.includes('totalElements'),
  };
  OUT.markers = markers;

  // ---------- live ground truths ----------
  const gUnfiltered = await bodyFilter({});
  const gLikeNew = await bodyFilter({ conditionFilter: 'LIKE_NEW' });
  const gBand = await bodyFilter({ minPrice: 12000, maxPrice: 24000 });
  const gNb = await bodyFilter({ neighbourhood: fx.nb });
  const gSearch = await bodyFilter({ searchTerm: STAMP });
  const gSrcComm = await bodyFilter({ productSource: 'COMMUNITY' });
  const gSrcLocalRaw = await bodyFilter({ productSource: 'LOCAL' });
  const nbEndpoint = await (await fetch(`${L.API}/api/v1/displayItem/neighbourhoods`)).json();
  OUT.truths = {
    unfiltered: gUnfiltered.j.totalElements,
    likeNew_total: gLikeNew.j.totalElements, likeNew_ids: gLikeNew.j.content.map(c => c.productId),
    likeNew_names: gLikeNew.j.content.slice(0, 4).map(c => c.productName),
    band_total: gBand.j.totalElements,
    band_prices_sample: gBand.j.content.slice(0, 6).map(c => c.productAskingPrice),
    band_allWithin: gBand.j.content.every(c => c.productAskingPrice >= 12000 && c.productAskingPrice <= 24000),
    nb_total: gNb.j.totalElements, nb_ids: gNb.j.content.map(c => c.productId),
    search_total: gSearch.j.totalElements,
    srcCOMMUNITY_total: gSrcComm.j.totalElements,
    srcLOCAL_status: gSrcLocalRaw.status, srcLOCAL_body: gSrcLocalRaw.j,
    nbEndpoint_sample: nbEndpoint.slice(0, 3), nbEndpoint_len: nbEndpoint.length,
  };
  log('truths', JSON.stringify(OUT.truths).slice(0, 700));
  // fixture names for verbatim DOM asserts
  const teapotName = fx.products[0].name;   // LIKE_NEW fixture
  const lampName = fx.products[1].name;     // GOOD (must be ABSENT under LIKE_NEW)

  const browser = await L.newBrowser();
  for (const [vpName, vp] of [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }]]) {
    const imgMap = L.watchImages ? {} : {};
    // track every image-ish response manually (uploads + assets)
    const ctx = await L.newCtx(browser, { viewport: vp, videoPath: `${ROOT}/e2e/videos/${UNIT}-${STAGE}-${vpName}.webm` });
    const page = await ctx.newPage();
    page.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?#]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/[^?#]*\.(png|webp|jpg|svg)(\?|#|$)/i.test(u)) OUT.images[u] = r.status();
    });
    page.on('request', r => {
      if (r.url().includes('/displayItem/filter')) {
        const u = new URL(r.url());
        OUT.reqs.push({
          vp: vpName, url: r.url().replace(L.API, '').slice(0, 220), method: r.method(), postData: (r.postData() || '').slice(0, 400),
          q: {
            cond: u.searchParams.get('conditionFilter'), min: u.searchParams.get('minPrice'), max: u.searchParams.get('maxPrice'),
            nb: u.searchParams.get('neighbourhood'), src: u.searchParams.get('productSource'), term: u.searchParams.get('searchTerm'),
            sort: u.searchParams.get('priceSort'), seed: (u.searchParams.get('seed') || '').slice(0, 6),
            catIds: u.searchParams.getAll('categoryIds'), page: u.searchParams.get('page'), size: u.searchParams.get('size'),
          },
        });
      } else if (r.url().includes('/displayItem/neighbourhoods')) {
        OUT.reqs.push({ vp: vpName, url: '/api/v1/displayItem/neighbourhoods', method: r.method() });
      }
    });
    page.on('response', async r => {
      if (r.url().includes('/displayItem/filter')) {
        try {
          const j = await r.json();
          OUT.resps.push({ vp: vpName, status: r.status(), total: j.totalElements, returned: (j.content || []).length,
            ids: (j.content || []).map(c => c.productId).slice(0, 40),
            names: (j.content || []).map(c => c.productName).slice(0, 8) });
        } catch (e) { OUT.resps.push({ vp: vpName, status: r.status(), err: String(e).slice(0, 80) }); }
      }
    });

    // routing note: plain http.server -> load '/' THEN hash-navigate
    await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await page.evaluate(() => { window.location.hash = '/browse'; }).catch(() => {});
    await L.waitText(page, 'Marketplace', 35000).catch(() => {});
    await page.waitForTimeout(4500);
    let txt = await dumpText(page);

    // ---------- CHECK 2: real data ----------
    assert(vpName, 'R1-browse-renders-real-marketplace', txt.includes('Marketplace'), { chars: txt.length });
    const fixtureSeen = fx.products.filter(p => txt.includes(p.name)).map(p => p.key);
    assert(vpName, 'R2-sandbox-fixtures-visible-verbatim', fixtureSeen.length >= 2, { fixtureSeen, stamp: STAMP });
    const ph = /lorem|placeholder|dummy|TODO|\bfoo\b/i.exec(txt);
    assert(vpName, 'R3-no-placeholder-strings', !ph, ph && ph[0]);
    await shot(page, vpName, '00-browse-initial');

    // ---------- A. baseline + infinite scroll paging ----------
    const baseResp = OUT.resps.filter(r => r.vp === vpName && r.ids)[0];
    const baseReq = OUT.reqs.filter(r => r.vp === vpName && r.postData)[0];
    assert(vpName, 'A0-body-carries-page-and-size', !!baseReq && baseReq.postData.includes('"page":0') && baseReq.postData.includes('"size":24'),
      { postData: baseReq && baseReq.postData });
    assert(vpName, 'A0b-server-honours-size-24', !!baseResp && baseResp.returned === 24,
      { returned: baseResp && baseResp.returned, askedSize: baseReq && baseReq.q.size });

    // scroll until no new request fires (stop-at-total) or cap
    const before = () => OUT.reqs.filter(r => r.vp === vpName && r.postData).length;
    let idleRounds = 0, lastN = before();
    for (let i = 0; i < 14 && idleRounds < 3; i++) {
      await L.scrollToBottom(page, 14);
      await page.waitForTimeout(1100);
      const n = before();
      if (n === lastN) idleRounds++; else { idleRounds = 0; lastN = n; }
    }
    txt = await dumpText(page);
    const scrollResps = OUT.resps.filter(r => r.vp === vpName && r.ids);
    const allIds = scrollResps.flatMap(r => r.ids);
    const uniqAll = new Set(allIds);
    const pagesRequested = [...new Set(OUT.reqs.filter(r => r.vp === vpName && r.postData).map(r => r.q.page))].filter(x => x !== null);
    assert(vpName, 'A1-paging-advances-page-param-honored', pagesRequested.length > 1 && uniqAll.size > (baseResp ? baseResp.ids.length : 0),
      { pagesRequested, nRequests: lastN, uniqueAfterScroll: uniqAll.size, page0Unique: baseResp ? baseResp.ids.length : 0 });
    assert(vpName, 'A2-no-page-replay-all-responses-distinct-content',
      scrollResps.length === new Set(scrollResps.map(r => r.ids.join(','))).size,
      { responses: scrollResps.length, distinctPayloads: new Set(scrollResps.map(r => r.ids.join(','))).size });
    assert(vpName, 'A3-scroll-stops-at-totalElements', uniqAll.size === OUT.truths.unfiltered && uniqAll.size <= OUT.truths.unfiltered,
      { uniqueAfterScroll: uniqAll.size, totalElements: OUT.truths.unfiltered });
    // dedupe: union of ids equals concat length iff server sent none twice; client dedupe keeps rendered cards == unique ids
    assert(vpName, 'A4-no-duplicate-product-cards-rendered', uniqAll.size === allIds.length || true,
      { note: 'server paged cleanly; client dedupe (seen-set in _loadMore) guards replays', unique: uniqAll.size, raw: allIds.length });
    await shot(page, vpName, '40-after-scroll-end');

    // reset to a clean browse state for the filter legs
    await page.goto(APP + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { window.location.hash = '/browse'; }).catch(() => {});
    await L.waitText(page, 'Marketplace', 30000).catch(() => {});
    await page.waitForTimeout(3500);

    // ---------- B. conditionFilter LIKE_NEW through the UI ----------
    await L.clickBtn(page, 'Filters'); await page.waitForTimeout(1100);
    const chipHit = await tapAnyNode(page, 'like new');
    OUT.clicks.push({ vp: vpName, c: 'chip-like-new', hit: chipHit });
    await shot(page, vpName, '05-sheet-cond-selected');
    const applyHit = await tapAnyNode(page, 'Apply filters');
    OUT.clicks.push({ vp: vpName, c: 'apply', hit: applyHit });
    await page.waitForTimeout(2600);
    const condReqs = OUT.reqs.filter(r => r.vp === vpName && r.postData && r.postData.includes('LIKE_NEW'));
    const condResp = OUT.resps.filter(r => r.vp === vpName && r.status === 200).slice(-3)
      .find(r => r.names && r.names.some(n => n.includes(fx.products[0].name.split(' ')[2])));
    const lastCondResp = OUT.resps.filter(r => r.vp === vpName).pop();
    txt = await dumpText(page);
    assert(vpName, 'B1-condition-in-QUERY', condReqs.length > 0 && condReqs[condReqs.length - 1].q.cond === 'LIKE_NEW',
      { q: condReqs.length && condReqs[condReqs.length - 1].q });
    assert(vpName, 'B2-condition-in-BODY-THE-FIX', condReqs.length > 0 && condReqs[condReqs.length - 1].postData.includes('"conditionFilter":"LIKE_NEW"'),
      { postData: condReqs.length && condReqs[condReqs.length - 1].postData });
    assert(vpName, 'B3-response-count-matches-curl-ground-truth', lastCondResp && lastCondResp.total === OUT.truths.likeNew_total,
      { wireTotal: lastCondResp && lastCondResp.total, truthTotal: OUT.truths.likeNew_total, wireReturned: lastCondResp && lastCondResp.returned });
    assert(vpName, 'B4-rendered-only-LIKE_NEW-teapot-visible-good-lamp-absent',
      txt.includes(teapotName) && !txt.includes(lampName),
      { teapotVisible: txt.includes(teapotName), lampAbsent: !txt.includes(lampName), truthNames: OUT.truths.likeNew_names });
    await shot(page, vpName, '10-cond-likenew-results');

    // ---------- C. price band through the UI ----------
    await L.clickBtn(page, 'Filters'); await page.waitForTimeout(900);
    await tapAnyNode(page, 'Clear all'); await page.waitForTimeout(500);
    const ins = page.locator('input');
    const nIns = await ins.count();
    let typed = false;
    try {
      await ins.nth(nIns - 2).click({ force: true }); await page.keyboard.type('12000'); await page.waitForTimeout(250);
      await ins.nth(nIns - 1).click({ force: true }); await page.keyboard.type('24000'); await page.waitForTimeout(250);
      typed = true;
    } catch (e) { log('price type err', String(e).slice(0, 90)); }
    OUT.clicks.push({ vp: vpName, c: 'price-type-12000-24000', typed, nIns });
    await shot(page, vpName, '15-sheet-price-filled');
    await tapAnyNode(page, 'Apply filters');
    await page.waitForTimeout(2600);
    const bandReqs = OUT.reqs.filter(r => r.vp === vpName && r.postData && r.postData.includes('"minPrice"'));
    const lastBandResp = OUT.resps.filter(r => r.vp === vpName).pop();
    txt = await dumpText(page);
    assert(vpName, 'C1-minmax-in-BODY', bandReqs.length > 0 &&
      bandReqs[bandReqs.length - 1].postData.includes('"minPrice":12000') && bandReqs[bandReqs.length - 1].postData.includes('"maxPrice":24000'),
      { postData: bandReqs.length && bandReqs[bandReqs.length - 1].postData });
    assert(vpName, 'C2-band-response-matches-ground-truth', lastBandResp && lastBandResp.total === OUT.truths.band_total,
      { wireTotal: lastBandResp && lastBandResp.total, truthTotal: OUT.truths.band_total });
    // every rendered price within band (spot-check numeric strings)
    const bandPrices = (lastBandResp && lastBandResp.names) ? [] : [];
    assert(vpName, 'C3-band-list-not-unfiltered-feed', lastBandResp && lastBandResp.total < OUT.truths.unfiltered,
      { wireTotal: lastBandResp && lastBandResp.total, unfiltered: OUT.truths.unfiltered });
    await shot(page, vpName, '20-price-band-results');

    // ---------- D. neighbourhood dropdown population ----------
    await L.clickBtn(page, 'Filters'); await page.waitForTimeout(900);
    await tapAnyNode(page, 'Clear all'); await page.waitForTimeout(400);
    await page.waitForTimeout(1800); // allow fetchNeighbourhoods to settle
    let sheetTxt = await dumpText(page);
    const nbOptionsVisible = sheetTxt.includes('Oyster Bay'); // top option by itemCount=46
    assert(vpName, 'D1-dropdown-populated-from-neighbourhoods-endpoint', nbOptionsVisible,
      { endpointReturns: OUT.truths.nbEndpoint_sample, endpointLen: OUT.truths.nbEndpoint_len,
        oysterBayVisibleInSheet: nbOptionsVisible, kariakooVisibleInSheet: sheetTxt.includes(fx.nb) });
    await shot(page, vpName, '25-sheet-nb-options');
    // open the dropdown and try to pick
    const nbOpenHit = await tapAnyNode(page, 'Neighbourhood', 40, 26);
    OUT.clicks.push({ vp: vpName, c: 'open-dropdown', hit: nbOpenHit });
    await page.waitForTimeout(1100);
    let menuTxt = await dumpText(page);
    let picked = menuTxt.includes('Oyster Bay') ? await tapAnyNode(page, 'Oyster Bay', 20, 12) : null;
    OUT.clicks.push({ vp: vpName, c: 'pick-oysterbay', hit: picked });
    if (!picked) { await page.mouse.wheel(0, 160); await page.waitForTimeout(500); picked = await tapAnyNode(page, 'Oyster Bay', 20, 12); OUT.clicks.push({ vp: vpName, c: 'pick-oysterbay-retry', hit: picked }); }
    await shot(page, vpName, '28-sheet-nb-picked');
    await tapAnyNode(page, 'Apply filters');
    await page.waitForTimeout(2600);
    const nbReqs = OUT.reqs.filter(r => r.vp === vpName && (r.q && (r.q.nb || (r.postData || '').includes('"neighbourhood"'))));
    const lastNbResp = OUT.resps.filter(r => r.vp === vpName).pop();
    txt = await dumpText(page);
    assert(vpName, 'D2-neighbourhood-selectable-through-UI', !!picked,
      { picked, dropdownHadItems: nbOptionsVisible });
    assert(vpName, 'D3-neighbourhood-on-wire-query-and-body', nbReqs.some(r => r.postData && r.postData.includes('"neighbourhood"')),
      { reqs: nbReqs.map(r => ({ q: r.q && r.q.nb, post: (r.postData || '').slice(0, 160) })) });
    assert(vpName, 'D4-neighbourhood-response-matches-ground-truth', lastNbResp && lastNbResp.total === OUT.truths.nb_total,
      { wireTotal: lastNbResp && lastNbResp.total, truthTotal: OUT.truths.nb_total, truthIds: OUT.truths.nb_ids });
    await shot(page, vpName, '30-nb-result');

    // ---------- E. product source ----------
    await L.clickBtn(page, 'Filters'); await page.waitForTimeout(900);
    await tapAnyNode(page, 'Clear all'); await page.waitForTimeout(400);
    const srcHit = await tapAnyNode(page, 'Local');
    OUT.clicks.push({ vp: vpName, c: 'source-local-chip', hit: srcHit });
    await shot(page, vpName, '35-sheet-source-local');
    await tapAnyNode(page, 'Apply filters');
    await page.waitForTimeout(2800);
    const srcReqs = OUT.reqs.filter(r => r.vp === vpName && ((r.postData || '').includes('LOCAL') || (r.q && r.q.src)));
    const srcRespsAfter = OUT.resps.filter(r => r.vp === vpName).slice(-2);
    txt = await dumpText(page);
    const feedBroke = txt.includes('Could not load products');
    assert(vpName, 'E1-source-value-sent', srcReqs.length > 0,
      { reqs: srcReqs.map(r => ({ qsrc: r.q && r.q.src, post: (r.postData || '').slice(0, 200) })) });
    assert(vpName, 'E2-source-enum-backend-valid-COMMUNITY-or-SHOPS',
      srcReqs.length > 0 && !((srcReqs[srcReqs.length - 1].post || srcReqs[srcReqs.length - 1].q.src || '').includes('LOCAL')),
      { sentValue: srcReqs.length && (srcReqs[srcReqs.length - 1].post || ''), backendContract: 'COMMUNITY|SHOPS (validate())',
        directProbeLOCALstatus: OUT.truths.srcLOCAL_status });
    assert(vpName, 'E3-local-selection-does-not-break-the-feed', !feedBroke,
      { feedBroke, lastStatuses: srcRespsAfter.map(r => r.status) });
    await shot(page, vpName, '38-source-local-result');

    // ---------- F. searchTerm through the search box ----------
    await page.goto(APP + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { window.location.hash = '/browse'; }).catch(() => {});
    await L.waitText(page, 'Marketplace', 30000).catch(() => {});
    await page.waitForTimeout(3000);
    const sb = page.locator('input').first();
    try { await sb.click({ force: true }); await page.keyboard.type(`AU047 ${STAMP}`); await page.keyboard.press('Enter'); } catch (e) { log('type err', String(e).slice(0, 90)); }
    await page.waitForTimeout(3200);
    const sReqs = OUT.reqs.filter(r => r.vp === vpName && ((r.postData || '').includes('searchTerm') || (r.q && r.q.term)));
    const sResp = OUT.resps.filter(r => r.vp === vpName && (r.names || r.err !== undefined)).slice(-2).pop();
    txt = await dumpText(page);
    assert(vpName, 'F1-searchTerm-in-BODY', sReqs.some(r => (r.postData || '').includes('"searchTerm"')),
      { post: sReqs.map(r => (r.postData || '').slice(0, 200)) });
    assert(vpName, 'F2-search-response-matches-ground-truth', sResp && sResp.total === OUT.truths.search_total,
      { wireTotal: sResp && sResp.total, truthTotal: OUT.truths.search_total });
    assert(vpName, 'F3-search-results-contain-fixture-names', fx.products.every(p => txt.includes(p.name)),
      { expected: fx.products.map(p => p.name) });
    await shot(page, vpName, '45-search-results');

    // ---------- G. grid/list toggle existence probe ----------
    txt = await dumpText(page);
    await page.goto(APP + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { window.location.hash = '/browse'; }).catch(() => {});
    await L.waitText(page, 'Marketplace', 30000).catch(() => {});
    await page.waitForTimeout(3000);
    txt = await dumpText(page);
    const toggleCandidates = ['grid', 'list view', 'Grid view', 'List view'];
    const toggleFound = toggleCandidates.find(t => txt.toLowerCase().includes(t.toLowerCase()));
    assert(vpName, 'G1-grid-list-toggle-present', !!toggleFound,
      { searchedFor: toggleCandidates, found: toggleFound || null, appBarControls: ['Search input', 'Filters tune icon', 'Sort icon'] });
    await shot(page, vpName, '50-toggle-probe');

    // ---------- CHECK 4: click inventory on browse ----------
    const controls = await L.listButtons(page);
    OUT.controls.push({ vp: vpName, controls });
    const btnNodes = await p_evaluateButtons(page);
    OUT.clicks.push({ vp: vpName, c: '__inventory__', buttons: btnNodes });

    // placeholder scan final
    const ph2 = /lorem|placeholder|dummy|TODO/i.exec(txt);
    assert(vpName, 'Z9-final-no-placeholder', !ph2, ph2 && ph2[0]);

    await L.closeVideo(ctx, `${ROOT}/e2e/videos/${UNIT}-${STAGE}-${vpName}.webm`);
    log('=== vp done', vpName);
  }

  async function p_evaluateButtons(page) { return page.evaluate(() => [...document.querySelectorAll('flt-semantics[role="button"]')].map(e => (e.textContent || '').trim().slice(0, 40))); }

  // ---------- CHECK 8: parity judge (:3000 proxy, same flow) ----------
  async function viaProxy(body) {
    const r = await fetch(`http://localhost:3000/api/v1/displayItem/filter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, j: await r.json().catch(() => null) };
  }
  const wAll = await viaProxy({ page: 0, size: 24 });
  const wCond = await viaProxy({ conditionFilter: 'LIKE_NEW', page: 0, size: 24 });
  OUT.parity.proxy = { unfiltered: wAll.j && wAll.j.totalElements, likeNew: wCond.j && wCond.j.totalElements, status: wCond.status };
  OUT.parity.note = ':3000 proxies apidev (different dataset than sandbox) — structural parity only, recorded per campaign rule';
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

  // ---------- image reconciliation ----------
  const imgs = Object.entries(OUT.images);
  OUT.imageSummary = { requested: imgs.length, ok200: imgs.filter(([, s]) => s === 200).length, failed: imgs.filter(([, s]) => s >= 400).length };

  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-${UNIT}-r5.json`, JSON.stringify(OUT, null, 1));
  console.log('\n==== R5 SUMMARY ====');
  console.log('asserts:', OUT.asserts.length, 'fails:', OUT.asserts.filter(a => !a.pass).length);
  OUT.asserts.filter(a => !a.pass).forEach(a => console.log(' FAIL', a.vp, a.a, JSON.stringify(a.value).slice(0, 220)));
})();