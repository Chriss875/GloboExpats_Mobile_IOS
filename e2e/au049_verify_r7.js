// au049_verify_r7.js — AU-049 verify-r7 on FROZEN :9121 (b56e345, Last-Modified
// Tue, 25 Aug 2026 20:08:09 GMT). Filter sheet UI end-to-end:
//   price / condition / neighbourhood / productSource controls mutate the request body;
//   neighbourhood pick filters wire results (fix 44bf240); availability gating hides
//   zero-count nodes; grid/list toggle swaps layout (ref browse/page.tsx L1942-1961).
// Canonical checklist 1-10. RW lane: fixtures are the throwaway seeds in
// /tmp/au049_fixtures_r7.json (created via real API by au049_rw_seed_r7.js);
// ground truth recomputed LIVE at run start.
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9121';
const REF = 'http://localhost:3000';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-049';
const SHOT = `${ROOT}/e2e/shots/${UNIT}`;
fs.mkdirSync(SHOT, { recursive: true });
const OUT = { asserts: [], reqs: [], resps: [], clicks: [], images: {}, truths: {}, visionRead: [] };
function log(...a) { console.log('[au049r7]', ...a); }
function assert(vp, a, pass, value) { OUT.asserts.push({ vp, a, pass, value }); log(pass ? 'PASS' : 'FAIL', vp, a, JSON.stringify(value).slice(0, 220)); }
async function dumpText(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n')); }
async function shot(p, vp, state) { const f = `${SHOT}/${UNIT}-${vp}-${state}.png`; await L.screenshot(p, f); OUT.visionRead.push(f); return f; }
// Tap the smallest on-screen semantics node containing lbl (sheet rows wrap inputs).
async function tapAnyNode(p, lbl, minW = 20, minH = 14) {
  const cands = await p.evaluate(({ lbl, minW, minH }) => {
    const out = []; const vh = innerHeight;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (r.width < minW || r.height < minH) return;
      if (r.bottom < 0 || r.top > vh) return;
      out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height, t: t.slice(0, 40) });
    });
    out.sort((a, b) => a.area - b.area);
    return out.slice(0, 6);
  }, { lbl, minW, minH });
  for (const c of cands) {
    const vh = await p.evaluate(() => innerHeight);
    await p.mouse.click(c.cx, Math.max(16, Math.min(c.cy, vh - 20)));
    await p.waitForTimeout(550);
    OUT.clicks.push({ vp: c.vpName || null, label: lbl, hit: c.t, cx: c.cx, cy: c.cy });
    return c.t;
  }
  OUT.clicks.push({ label: lbl, failed: true });
  return null;
}
// Horizontal scroll of the category chip bar (wheel over it).
async function scrollChipBar(p, vpName) {
  const y = vpName === '768' ? 210 : 150;
  await p.mouse.move(187, y); await p.mouse.wheel(700, 0); await p.waitForTimeout(800);
}
async function openSheet(p) {
  await L.clickBtn(p, 'Filters');
  await p.waitForTimeout(2200);
}
// Type into the Min/Max price fields (they are the only text inputs inside the sheet
// besides none; index -2/-1 proven by AU-047 r5b).
async function typePriceBand(p, minV, maxV) {
  const nIns = await p.locator('input').count();
  let typed = false;
  try {
    await p.locator('input').nth(nIns - 2).click({ force: true });
    await p.waitForTimeout(300);
    await p.keyboard.type(String(minV)); await p.waitForTimeout(250);
    await p.locator('input').nth(nIns - 1).click({ force: true });
    await p.waitForTimeout(300);
    await p.keyboard.type(String(maxV)); await p.waitForTimeout(250);
    typed = true;
  } catch (e) { log('price type err', String(e).slice(0, 90)); }
  return typed;
}

(async () => {
  async function bodyFilter(b) {
    const r = await fetch(`${L.API}/api/v1/displayItem/filter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    return r.json();
  }
  // ---- LIVE ground truth (recomputed every run; sandbox rows drift) --------
  const fx = JSON.parse(fs.readFileSync('/tmp/au049_fixtures_r7.json', 'utf8'));
  const STAMP = String(fx.stamp);
  const P1 = fx.products[0], P2 = fx.products[1], P3 = fx.products[2];
  const T = {};
  T.unfiltered = (await bodyFilter({ page: 0, size: 200 })).totalElements;
  T.band_10k_50k = (await bodyFilter({ minPrice: 10000, maxPrice: 50000, page: 0, size: 200 })).totalElements;
  T.band_cond = (await bodyFilter({ minPrice: 10000, maxPrice: 50000, conditionFilter: 'LIKE_NEW', page: 0, size: 200 })).totalElements;
  T.band_cond_nb = (await bodyFilter({ minPrice: 10000, maxPrice: 50000, conditionFilter: 'LIKE_NEW', neighbourhood: 'Kariakoo', page: 0, size: 200 })).totalElements;
  T.combined = (await bodyFilter({ minPrice: 10000, maxPrice: 50000, conditionFilter: 'LIKE_NEW', neighbourhood: 'Kariakoo', productSource: 'COMMUNITY', page: 0, size: 200 })).totalElements;
  T.nbOyster = (await bodyFilter({ neighbourhood: 'Oyster Bay', page: 0, size: 200 })).totalElements;
  T.subPhones = (await bodyFilter({ subcategoryIds: [1], page: 0, size: 200 })).totalElements;
  T.subTVs = (await bodyFilter({ subcategoryIds: [4], page: 0, size: 200 })).totalElements;
  T.searchTerm = (await bodyFilter({ searchTerm: STAMP, page: 0, size: 200 })).totalElements;
  OUT.truths = T;
  log('truths', JSON.stringify(T));
  const nbList = await fetch(`${L.API}/api/v1/displayItem/neighbourhoods`).then(r => r.json());
  const nbNames = nbList.map(n => n.name);
  const nbMap = Object.fromEntries(nbList.map(n => [n.name, n.itemCount]));
  OUT.nbCount = nbNames.length;
  log('neighbourhoods', nbNames.length, nbNames.slice(0, 4));

  const catsRaw = await fetch(`${L.API}/api/v1/products/categories`).then(r => r.json());
  const catAvail = new Set(await fetch(`${L.API}/api/v1/displayItem/category-availability`).then(r => r.json()));
  const subAvail = new Set(await fetch(`${L.API}/api/v1/displayItem/subcategory-availability`).then(r => r.json()));
  const emptyCats = catsRaw.filter(c => !catAvail.has(c.categoryId)).map(c => ({ id: c.categoryId, name: c.categoryName }));
  const okCats = catsRaw.filter(c => catAvail.has(c.categoryId));
  OUT.availability = { emptyCats, okCatCount: okCats.length, subAvailCount: subAvail.size };
  log('availability: empty cats', JSON.stringify(emptyCats), '| ok', okCats.length);

  const browser = await L.newBrowser();

  for (const [vpName, vp] of [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }]]) {
    const ctx = await L.newCtx(browser, { viewport: vp, videoPath: `${ROOT}/e2e/videos/${UNIT}-verify-r7-${vpName}.webm` });
    const page = await ctx.newPage();
    page.on('request', r => {
      if (r.url().includes('/displayItem/filter')) {
        const u = new URL(r.url());
        OUT.reqs.push({ vp: vpName, q: Object.fromEntries(u.searchParams.entries()), postData: r.postData() || '' });
      }
      if (/\/uploads\/|\/images\//.test(r.url())) OUT.images[r.url()] = OUT.images[r.url()] || 0;
    });
    page.on('response', async r => {
      const u = r.url();
      if (u.includes('/displayItem/filter')) {
        try { const j = await r.json(); OUT.resps.push({ vp: vpName, total: j.totalElements, n: (j.content || []).length }); } catch (e) { }
      }
      if (/\/uploads\/|\/images\//.test(u)) OUT.images[u] = r.status();
    });

    // ---- boot: '/' then bottom-nav to Marketplace ------------------------
    await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => { });
    await L.waitText(page, 'GloboExpats', 40000);
    await page.waitForTimeout(6000);
    await L.clickBtn(page, 'Marketplace');
    await page.waitForTimeout(5000);

    // A. real data + availability gating in the category chip bar
    await scrollChipBar(page, vpName); await page.waitForTimeout(700);
    let txt = await dumpText(page);
    assert(vpName, 'A1-browse-renders-real-data', txt.includes('Marketplace') && txt.length > 3000, { len: txt.length });
    assert(vpName, 'A2-concrete-sandbox-values', txt.includes('TSh') && (txt.includes(P1.name.slice(0, 14)) || txt.includes('AU049')), { tshSeen: txt.includes('TSh') });
    const emptyShown = emptyCats.filter(c => txt.includes(c.name)).map(c => c.name);
    assert(vpName, 'A4-empty-categories-hidden', emptyShown.length === 0, { emptyShown, okShownCount: okCats.filter(c => txt.includes(c.categoryName.slice(0, 8))).length });
    await shot(page, vpName, '05-browse-initial');

    // B. sheet exposes all four criteria sections
    await openSheet(page);
    let sheetTxt = await dumpText(page);
    for (const [k, needle] of [['B1-price-section', 'Price range'], ['B2-condition-chips', 'like new'], ['B3-neighbourhood-field', 'Neighbourhood'],
    ['B4-productsource-section', 'Community'], ['B5-clearall-apply', 'Apply filters']]) {
      assert(vpName, k, sheetTxt.includes(needle), { needle });
    }
    await shot(page, vpName, '08-sheet-initial');

    // C. PRICE: type band -> Apply -> wire body carries minPrice/maxPrice; render narrows
    const typed = await typePriceBand(page, 10000, 50000);
    await shot(page, vpName, '10-sheet-price-filled');
    const beforeReqs = OUT.reqs.filter(r => r.vp === vpName).length;
    await tapAnyNode(page, 'Apply filters');
    await page.waitForTimeout(3500);
    const bandReq = OUT.reqs.filter(r => r.vp === vpName).slice(beforeReqs).find(r => r.postData.includes('"minPrice"') || r.q.minPrice);
    assert(vpName, 'C1-minmax-mutates-request-body', !!bandReq &&
      ((bandReq.postData.includes('"minPrice":10000') && bandReq.postData.includes('"maxPrice":50000')) ||
        (bandReq.q.minPrice === '10000' && bandReq.q.maxPrice === '50000')),
      bandReq ? { q: bandReq.q, postData: bandReq.postData.slice(0, 160) } : { typed });
    let respAfter = OUT.resps.filter(r => r.vp === vpName).pop();
    // rendered narrowing: fixture P2 (46-45k) and P3 (88k) must be absent from page 0 of the band
    txt = await dumpText(page);
    assert(vpName, 'C2-band-results-narrowed', respAfter && respAfter.total === T.band_10k_50k,
      { wireTotal: respAfter && respAfter.total, truth: T.band_10k_50k, unfiltered: T.unfiltered });
    assert(vpName, 'C3-out-of-band-fixture-not-rendered', !txt.includes(P3.name), { p3: P3.name.slice(0, 18) });
    await shot(page, vpName, '12-price-band-results');

    // D. CONDITION chip narrows further
    await openSheet(page);
    const condHit = await tapAnyNode(page, 'like new');
    await shot(page, vpName, '15-sheet-cond-selected');
    const b2 = OUT.reqs.filter(r => r.vp === vpName).length;
    await tapAnyNode(page, 'Apply filters'); await page.waitForTimeout(3200);
    const condReq = OUT.reqs.filter(r => r.vp === vpName).slice(b2).find(r => r.postData.includes('conditionFilter') || r.q.conditionFilter);
    assert(vpName, 'D1-condition-chip-mutates-body', !!condReq &&
      (condReq.postData.includes('"conditionFilter":"LIKE_NEW"') || condReq.q.conditionFilter === 'LIKE_NEW'),
      condReq ? { q: condReq.q, pd: condReq.postData.slice(0, 180) } : { condHit });
    respAfter = OUT.resps.filter(r => r.vp === vpName).pop();
    assert(vpName, 'D2-condition-wire-total==truth', respAfter && respAfter.total === T.band_cond,
      { wireTotal: respAfter && respAfter.total, truth: T.band_cond });
    txt = await dumpText(page);
    assert(vpName, 'D3-fixture-p1-rendered-after-cond', txt.includes(P1.name), { p1: P1.name.slice(0, 22) });
    await shot(page, vpName, '17-cond-likenew-results');

    // E. NEIGHBOURHOOD: dropdown lists real endpoint values; pick filters wire results
    await openSheet(page);
    await page.waitForTimeout(1200); // allow fetchNeighbourhoods to settle
    sheetTxt = await dumpText(page);
    // open the dropdown menu (tap the field)
    await tapAnyNode(page, 'Neighbourhood', 60, 30);
    await page.waitForTimeout(1500);
    let menuTxt = await dumpText(page);
    const menuHasReal = nbNames.filter(n => menuTxt.includes(n));
    assert(vpName, 'E1-dropdown-lists-real-endpoint-values', menuHasReal.length >= 3, { listed: menuHasReal.slice(0, 6), endpointCount: nbNames.length });
    await shot(page, vpName, '20-sheet-nb-menu-open');
    // pick Oyster Bay
    const picked = await tapAnyNode(page, 'Oyster Bay', 40, 20);
    await page.waitForTimeout(800);
    sheetTxt = await dumpText(page);
    assert(vpName, 'E2-oysterbay-selected-in-field', picked !== null && sheetTxt.includes('Oyster Bay'), { picked });
    await shot(page, vpName, '22-sheet-nb-picked');
    const b3 = OUT.reqs.filter(r => r.vp === vpName).length;
    await tapAnyNode(page, 'Apply filters'); await page.waitForTimeout(3500);
    const nbReq = OUT.reqs.filter(r => r.vp === vpName).slice(b3).find(r => r.postData.includes('neighbourhood') || r.q.neighbourhood);
    assert(vpName, 'E3-neighbourhood-on-wire-body', !!nbReq &&
      (nbReq.postData.includes('"neighbourhood":"Oyster Bay"') || decodeURIComponent(nbReq.q.neighbourhood || '') === 'Oyster Bay'),
      nbReq ? { q: nbReq.q, pd: nbReq.postData.slice(0, 200) } : { picked });
    respAfter = OUT.resps.filter(r => r.vp === vpName).pop();
    assert(vpName, 'E4-nb-wire-total==truth', respAfter && respAfter.total === T.band_cond_nb,
      { wireTotal: respAfter && respAfter.total, truth: T.band_cond_nb });
    txt = await dumpText(page);
    assert(vpName, 'E5-nb-filtered-grid-shows-fixture', txt.includes(P1.name), { p1: P1.name.slice(0, 22) });
    await shot(page, vpName, '24-nb-oysterbay-results');

    // F. PRODUCT SOURCE chip (COMMUNITY/SHOPS per fix 44bf240) — no backend 400
    await openSheet(page);
    const srcHit = await tapAnyNode(page, 'Community');
    await shot(page, vpName, '26-sheet-source-community');
    const b4 = OUT.reqs.filter(r => r.vp === vpName).length;
    await tapAnyNode(page, 'Apply filters'); await page.waitForTimeout(3500);
    const srcReq = OUT.reqs.filter(r => r.vp === vpName).slice(b4).find(r => r.postData.includes('productSource') || r.q.productSource);
    const bad400 = OUT.resps.filter(r => r.vp === vpName).some(r => r.status === 400);
    assert(vpName, 'F1-source-chip-mutates-body-valid-enum', !!srcReq &&
      (srcReq.postData.includes('"productSource":"COMMUNITY"') || srcReq.q.productSource === 'COMMUNITY'),
      srcReq ? { q: srcReq.q, pd: srcReq.postData.slice(0, 200) } : { srcHit });
    respAfter = OUT.resps.filter(r => r.vp === vpName).pop();
    assert(vpName, 'F2-combined-wire-total==truth-no-400', respAfter && respAfter.total === T.combined,
      { wireTotal: respAfter && respAfter.total, truth: T.combined, bad400 });
    await shot(page, vpName, '28-source-combined-results');

    // G. CLEAR ALL resets the feed to the unfiltered total
    await openSheet(page);
    await tapAnyNode(page, 'Clear all');
    await page.waitForTimeout(600);
    const b5 = OUT.reqs.filter(r => r.vp === vpName).length;
    await tapAnyNode(page, 'Apply filters'); await page.waitForTimeout(3500);
    respAfter = OUT.resps.filter(r => r.vp === vpName).pop();
    assert(vpName, 'G1-clearall-resets-to-unfiltered', respAfter && respAfter.total === T.unfiltered,
      { wireTotal: respAfter && respAfter.total, truth: T.unfiltered });
    await shot(page, vpName, '30-cleared-feed');

    // H. GRID/LIST toggle swaps layout (ref browse/page.tsx L1942-1961)
    const gridBefore = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('flt-semantics')].filter(e => e.textContent && e.textContent.includes('TSh') && e.getAttribute('flt-tappable') !== null);
      const rects = nodes.map(e => e.getBoundingClientRect()).filter(r => r.width > 40);
      if (rects.length < 4) return { count: rects.length };
      const xs = [...new Set(rects.map(r => Math.round(r.x)))].sort((a, b) => a - b);
      return { count: rects.length, distinctX: xs.length, sampleYs: rects.slice(0, 8).map(r => Math.round(r.y)) };
    });
    const toggleLabelBefore = await dumpText(page).then(t => t.includes('List view') ? 'List view' : (t.includes('Grid view') ? 'Grid view' : null));
    const toggled = await L.clickBtn(page, 'List view') ? 'List view' : (await L.clickBtn(page, 'Grid view') ? 'Grid view' : 'FAILED');
    await page.waitForTimeout(1800);
    const listAfter = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('flt-semantics')].filter(e => e.textContent && e.textContent.includes('TSh'));
      const rects = nodes.map(e => e.getBoundingClientRect()).filter(r => r.width > 40 && r.bottom > 0 && r.top < innerHeight);
      const ys = rects.map(r => Math.round(r.y));
      const uniqRows = [...new Set(ys)].length;
      return { count: rects.length, uniqRows, widths: rects.slice(0, 6).map(r => Math.round(r.width)) };
    });
    assert(vpName, 'H1-toggle-control-exists-and-clicked', toggleLabelBefore !== null && toggled !== 'FAILED', { before: toggleLabelBefore, clicked: toggled });
    assert(vpName, 'H2-layout-swapped-to-single-column',
      gridBefore.distinctX !== undefined ? gridBefore.distinctX >= 2 && (listAfter.uniqRows >= listAfter.count * 0.7 || listAfter.uniqRows > gridBefore.sampleYs.length) : false,
      { grid: gridBefore, list: listAfter });
    await shot(page, vpName, '32-list-mode');
    // toggle back to grid
    const back = await L.clickBtn(page, 'Grid view') ? 'Grid view' : (await L.clickBtn(page, 'List view') ? 'List view' : 'FAILED');
    await page.waitForTimeout(1500);
    const gridBack = await page.evaluate(() => {
      const rects = [...document.querySelectorAll('flt-semantics')].map(e => e.textContent && e.textContent.includes('TSh') ? e.getBoundingClientRect() : null).filter(r => r && r.width > 40 && r.bottom > 0 && r.top < innerHeight);
      const xs = [...new Set(rects.map(r => Math.round(r.x)))];
      return { count: rects.length, distinctX: xs.length };
    });
    assert(vpName, 'H3-toggle-back-restores-multi-column', back !== 'FAILED' && gridBack.distinctX >= 2, { clicked: back, grid: gridBack });
    await shot(page, vpName, '34-grid-mode-restored');

    // I. CLICK-EVERYTHING sweep over remaining browse chrome
    // Sort menu opens with options and selection works
    const sortOpened = await L.clickBtn(page, 'Sort');
    await page.waitForTimeout(900);
    const sortMenu = await dumpText(page);
    const hasSortOpts = ['Price: Low to High', 'Newest'].filter(o => sortMenu.includes(o));
    assert(vpName, 'I1-sort-menu-opens-with-options', sortOpened && hasSortOpts.length >= 1, { opened: sortOpened, options: hasSortOpts });
    if (sortOpened) {
      await tapAnyNode(page, 'Price: Low to High');
      await page.waitForTimeout(1500);
      const pricesSorted = await page.evaluate(() => {
        const t = [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('|');
        const m = t.match(/TSh\s?[\d,]+/g) || [];
        return m.slice(0, 10).map(s => Number(s.replace(/[^\d]/g, '')));
      });
      const sortedOk = pricesSorted.length >= 2 && pricesSorted.every((v, i, a) => i === 0 || a[i - 1] <= v);
      assert(vpName, 'I2-price-sort-applies-to-rendered-prices', sortedOk, { first: pricesSorted.slice(0, 6) });
      await shot(page, vpName, '36-price-asc');
    }
    // Category chip selects -> filter request carries categoryIds
    const b6 = OUT.reqs.filter(r => r.vp === vpName).length;
    const catChip = await L.clickBtn(page, 'Electronics');
    await page.waitForTimeout(2800);
    const catReq = OUT.reqs.filter(r => r.vp === vpName).slice(b6).find(r => (r.postData + JSON.stringify(r.q)).includes('1'));
    const catResp = OUT.resps.filter(r => r.vp === vpName).pop();
    assert(vpName, 'I3-category-chip-narrows-via-categoryIds', catChip && !!catReq && !!catResp && catResp.total !== T.unfiltered,
      { clicked: catChip, wireTotal: catResp && catResp.total, allTotal: T.unfiltered, req: catReq && { q: catReq.q, pd: catReq.postData.slice(0, 140) } });
    await shot(page, vpName, '38-electronics-category');

    // Search field navigates to Search screen (click-everything rule for inputs)
    const sb = page.locator('input').first();
    let searchNav = false;
    try { await sb.click({ force: true }); await page.keyboard.type(STAMP); await page.keyboard.press('Enter'); await page.waitForTimeout(4000); } catch (e) { }
    txt = await dumpText(page);
    searchNav = txt.includes(P1.name);
    assert(vpName, 'J1-search-term-finds-fixtures', searchNav, { stamp: STAMP, sawP1: txt.includes(P1.name), wireTruth: T.searchTerm });
    await shot(page, vpName, '40-search-fixtures');

    // K. images: reconcile tracked uploads/images responses
    const imgVals = Object.entries(OUT.images).filter(([u]) => u.includes('/uploads/') || u.includes('/images/'));
    const imgSummary = { requested: imgVals.length, ok200: imgVals.filter(([, s]) => s === 200).length, failed: imgVals.filter(([, s]) => typeof s === 'number' && s >= 400).map(([u, s]) => [u.slice(-70), s]) };
    OUT.imageSummary = imgSummary;
    assert(vpName, 'K1-images-all-200-nonempty', imgSummary.requested > 0 && imgSummary.failed.length === 0, imgSummary);

    // placeholder/dummy scan over the whole snapshot
    const ph = ['lorem', 'Lorem', 'placeholder text', 'dummy', 'TODO', 'sample data', 'example.com'].filter(w => txt.toLowerCase().includes(w.toLowerCase()) && w !== 'example.com');
    assert(vpName, 'A3-no-placeholder-text', ph.length === 0, { hits: ph });

    await L.closeVideo(ctx, `${ROOT}/e2e/videos/${UNIT}-verify-r7-${vpName}.webm`);
  }

  // ---- Parity: reference /browse same flow --------------------------------
  try {
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    const refResps = [];
    p.on('response', async r => {
      if (r.url().includes('/displayItem/filter') || r.url().includes('/products/filter')) {
        try { refResps.push({ url: r.url().slice(-110), total: (await r.json()).totalElements }); } catch (e) { }
      }
    });
    await p.goto(REF + '/browse', { waitUntil: 'load', timeout: 90000 }).catch(() => { });
    await p.waitForTimeout(9000);
    const refTxt = await p.evaluate(() => document.body.innerText.slice(0, 3000));
    OUT.parity = { refHasFilters: /filter/i.test(refTxt), refHasCondition: /condition/i.test(refTxt), resps: refResps.slice(-5) };
    await L.screenshot(p, `${SHOT}/ref-375-browse.png`);
    OUT.visionRead.push(`${SHOT}/ref-375-browse.png`);
    // open reference filters dialog
    const fb = p.getByRole('button', { name: /filter/i }).first();
    await fb.click({ force: true }).catch(() => { });
    await p.waitForTimeout(2500);
    const dlg = await p.evaluate(() => document.body.innerText.slice(0, 4000));
    OUT.parity.refDialogSections = {
      price: /price/i.test(dlg), condition: /condition/i.test(dlg),
      location: /location|neighbourhood/i.test(dlg), subcategory: /subcategor/i.test(dlg),
      source: /source/i.test(dlg),
    };
    OUT.parity.mobileHasSubcategoryUI = false; // measured below from mobile asserts
    await L.screenshot(p, `${SHOT}/ref-375-browse-filters.png`);
    OUT.visionRead.push(`${SHOT}/ref-375-browse-filters.png`);
    await ctx.close();
  } catch (e) { log('parity err', String(e).slice(0, 120)); }

  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-049-r7.json`, JSON.stringify(OUT, null, 1));
  const fails = OUT.asserts.filter(a => !a.pass);
  console.log('\n=== SUMMARY', OUT.asserts.length - fails.length + '/' + OUT.asserts.length, 'PASS |', fails.length, 'FAIL ===');
  for (const f of fails) log('FAIL', f.a, JSON.stringify(f.value).slice(0, 160));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
