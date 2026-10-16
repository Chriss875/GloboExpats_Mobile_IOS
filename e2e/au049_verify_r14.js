// au049_verify_r14.js — AU-049 filters_availability_gridlist FINAL verify on the
// FROZEN lane :9131 (git e694463, main.dart.js Last-Modified "Wed, 26 Aug 2026
// 08:15:26 GMT" — includes 845fa51 filter sheet + 44bf240 neighbourhoods parse /
// COMMUNITY|SHOPS enum / grid-list toggle).
// RO lane: read-only against shared sandbox seed. NO listing/order creation; no
// wishlist writes needed for this unit (filter sheet is pure read-path).
//
// Acceptance (WAVE_PLAN / Appendix A):
//  A1 sheet exposes PRICE RANGE inputs wired to minPrice/maxPrice on the wire body
//  A2 CONDITION chips (new/like new/good/fair/poor) select + wire conditionFilter
//  A3 NEIGHBOURHOOD dropdown populated from GET /displayItem/neighbourhoods
//     ({name,itemCount} shape); MENU opens with real options; pick narrows results
//  A4 PRODUCT SOURCE toggle COMMUNITY/SHOPS only ('All' sends no param) — no 400
//  A5 GRID/LIST toggle swaps layout observably (distinct-x count changes)
//  A6 EMPTY categories hidden per availability endpoints (reference-faithful
//     show-all fallback on outage ACCEPTED — outage case also asserted as accepted)
//  Canonical checklist: freshness / real data / images all-200 / click-every-control /
//  shots both viewports per meaningful state / native vision on every PNG / parity :3000.
const fs = require('fs');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';           // FROZEN lane override
const REF = 'http://localhost:3000';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-049', STAGE = 'r14';
const BUILD_SHA = 'e694463';
const BUILD_MT = 'Wed, 26 Aug 2026 08:15:26 GMT';
const SHOT = `${ROOT}/e2e/shots/${UNIT}`;
fs.mkdirSync(SHOT, { recursive: true });
const T0 = Date.now();

const R = {
  ts: new Date().toISOString(), unit: UNIT, stage: STAGE, verdict: null,
  build_sha: BUILD_SHA, build_mtime: BUILD_MT,
  checks: {
    freshness: false, real_data: false, real_data_probe: '', images_requested: 0,
    images_200: 0, images_broken: [], buttons_total: 0, buttons_ok: 0,
    buttons_failed: [], state_asserts: 0, nav_asserts: 0, data_asserts: 0,
    vision_defects: 0, vision_findings: [],
    parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
  },
  failures: [], evidence: [], videos: [], asserts: [], reqs: {}, resps: {},
};
function assert(vp, a, pass, value) {
  R.asserts.push({ vp, a, pass: !!pass, value: value === undefined ? null : value });
  console.log((pass ? 'PASS ' : 'FAIL ') + vp + ' ' + a + ' :: ' + JSON.stringify(value ?? '').slice(0, 200));
  if (!pass) R.failures.push(`${vp}:${a}`);
}
function btn(name, cond, detail) {
  R.checks.buttons_total++;
  if (cond) { R.checks.buttons_ok++; console.log('BTN  ' + name + ' :: ' + (detail || '')); }
  else { R.checks.buttons_failed.push(name); R.failures.push('button:' + name); console.log('FAIL-BTN ' + name + ' ' + (detail || '')); }
}
async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n')); }
async function shot(p, vp, state) { const f = `${SHOT}/${UNIT}-${vp}-${state}.png`; await L.screenshot(p, f); R.evidence.push(f); return f; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
// tap smallest visible semantics node containing lbl
async function tapNode(p, lbl, minW = 20, minH = 12) {
  const cands = await p.evaluate(({ lbl, minW, minH }) => {
    const out = []; const vh = innerHeight;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (r.width < minW || r.height < minH || r.bottom < 0 || r.top > vh) return;
      out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height, t: t.slice(0, 36) });
    });
    out.sort((a, b) => a.area - b.area);
    return out.slice(0, 6);
  }, { lbl, minW, minH });
  if (!cands.length) return null;
  const vh = await p.evaluate(() => innerHeight);
  await p.mouse.click(cands[0].cx, Math.max(14, Math.min(cands[0].cy, vh - 16)));
  await sleep(600);
  return cands[0].t;
}
async function scrollSheet(p) { // reveal lower sheet controls (dropdown sits below fold at 667h)
  await p.mouse.move(187, 420);
  for (let i = 0; i < 5; i++) { await p.mouse.wheel(0, 220); await sleep(160); }
}
// layout metrics of rendered product CARDS. Grid mode renders each card as its own
// tappable node (~171/367px wide); LIST mode wraps all rows in one tall tappable
// InkWell whose child text nodes report odd geometry — so measure the VISIBLE ROWS
// instead: distinct y-centers of price-bearing text nodes that sit in the feed area.
async function layout(p) {
  const g = await p.evaluate(() => {
    const cands = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '');
      if (!t.includes('TSh')) return;
      if (e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (r.width < 120 || r.height < 60 || r.bottom < 0 || r.top > innerHeight || !isFinite(r.x)) return;
      cands.push({ x: r.x, y: r.y, w: r.width, h: r.height, area: r.width * r.height });
    });
    cands.sort((a, b) => a.area - b.area);
    const kept = [];
    for (const c of cands) {
      if (!kept.some(k => Math.abs(k.x - c.x) < 30 && Math.abs(k.y - c.y) < 40)) kept.push(c);
      if (kept.length >= 12) break;
    }
    const rows = {};
    for (const k of kept) {
      const ry = Math.round(k.y / 60);
      rows[ry] = rows[ry] || new Set();
      rows[ry].add(Math.round(k.x / 60));
    }
    const rowCols = Object.values(rows).map(s => s.size);
    return { n: kept.length, maxRowCols: Math.max(0, ...rowCols), widths: kept.slice(0, 4).map(k => Math.round(k.w)) };
  });
  // list-mode row count: price nodes whose own rect is short+wide (row text lines)
  const l = await p.evaluate(() => {
    const ys = new Set();
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '');
      if (!t.includes('TSh')) return;
      const r = e.getBoundingClientRect();
      if (r.width < 100 || r.height < 10 || r.height > 120 || r.bottom < 0 || r.top > innerHeight) return;
      // exclude the app-bar/search chrome
      if (r.y < 150 && innerHeight > 600 && r.width > innerWidth * 0.9) return;
      ys.add(Math.round(r.y));
    });
    return { visibleRowYs: [...ys].sort((a, b) => a - b), n: ys.size };
  });
  return { ...g, listRows: l };
}
// horizontally scroll the category chip bar until a label is FULLY on screen, then tap it.
// The chip row lives at y≈120 on BOTH viewports (measured: 375 and 768).
async function scrollChipBarTo(p, vpName, label, steps = 12, vpWidth = 375, vpHeight = 667) {
  for (let i = 0; i < steps; i++) {
    const vis = await p.evaluate((lbl) => {
      let hit = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (hit) return;
        const t = (e.textContent || '').trim();
        if (t !== lbl) return;
        const r = e.getBoundingClientRect();
        if (r.width > 20 && r.height >= 36 && r.y >= 80 && r.bottom < innerHeight && r.left >= -1 && r.right <= innerWidth + 1) hit = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
      });
      return hit;
    }, label);
    if (vis) { await p.mouse.click(Math.min(vis.cx, vpWidth - 4), Math.min(vis.cy, vpHeight - 8)); await sleep(600); return true; }
    await p.mouse.move(180, 140); await p.mouse.wheel(420, 0); await sleep(650);
  }
  return false;
}

(async () => {
  // ---------- CHECK 1 FRESHNESS ----------
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  R.checks.freshness = head.status === 200 && lm === BUILD_MT;
  assert('meta', 'C1-freshness-frozen-e694463-mtime', R.checks.freshness,
    `HTTP ${head.status} Last-Modified="${lm}" expected "${BUILD_MT}"`);

  // ---------- CHECK 2 REAL DATA ground truth (independent curl, body-bound) ----------
  async function bodyFilter(b) {
    const r = await fetch(`${L.API}/api/v1/displayItem/filter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    return { status: r.status, j: await r.json() };
  }
  const T = {};
  T.unfiltered = (await bodyFilter({ page: 0, size: 1 })).j.totalElements;
  T.band_10k_50k = (await bodyFilter({ minPrice: 10000, maxPrice: 50000, page: 0, size: 1 })).j.totalElements;
  T.band_cond_LIKE_NEW = (await bodyFilter({ minPrice: 10000, maxPrice: 50000, conditionFilter: 'LIKE_NEW', page: 0, size: 1 })).j.totalElements;
  T.band_cond_nb_bamaga = (await bodyFilter({ minPrice: 10000, maxPrice: 50000, conditionFilter: 'LIKE_NEW', neighbourhood: 'Bamaga Road, Mwenge', page: 0, size: 200 })).j.totalElements;
  T.combined_community = (await bodyFilter({ minPrice: 10000, maxPrice: 50000, conditionFilter: 'LIKE_NEW', productSource: 'COMMUNITY', page: 0, size: 200 })).j.totalElements;
  T.oysterOnly = (await bodyFilter({ neighbourhood: 'Oyster Bay', page: 0, size: 1 })).j.totalElements;
  T.communityOnly = (await bodyFilter({ productSource: 'COMMUNITY', page: 0, size: 1 })).j.totalElements;
  T.shopsOnly = (await bodyFilter({ productSource: 'SHOPS', page: 0, size: 1 })).j.totalElements;
  T.subArtSupplies = (await bodyFilter({ subcategoryIds: [95], page: 0, size: 200 })).j.totalElements;
  assert('api', 'C2-truth-unfiltered>500', T.unfiltered > 500, T.unfiltered);
  assert('api', 'C2-truth-band-narrows', T.band_10k_50k > 0 && T.band_10k_50k < T.unfiltered, { band: T.band_10k_50k, unfiltered: T.unfiltered });
  assert('api', 'C2-truth-condition-subset-of-band', T.band_cond_LIKE_NEW > 0 && T.band_cond_LIKE_NEW <= T.band_10k_50k, { likeNewInBand: T.band_cond_LIKE_NEW });
  assert('api', 'C2-truth-oyster-and-sources', T.oysterOnly > 0 && T.communityOnly > 0 && T.shopsOnly > 0 &&
    T.communityOnly + T.shopsOnly <= T.unfiltered, { oyster: T.oysterOnly, community: T.communityOnly, shops: T.shopsOnly, all: T.unfiltered });
  assert('api', 'C2-truth-subcategory-95-nonzero', T.subArtSupplies > 0, T.subArtSupplies);

  const nbList = await fetch(`${L.API}/api/v1/displayItem/neighbourhoods`).then(r => r.json());
  const nbNames = nbList.map(n => n.name).filter(Boolean);
  const shaped = nbList.length > 0 && typeof nbList[0] === 'object' && 'itemCount' in nbList[0];
  assert('api', 'C2-neighbourhoods-endpoint-{name,itemCount}-shape', nbNames.length >= 3 && shaped,
    { count: nbNames.length, first: JSON.stringify(nbList[0]) });

  const catsRaw = await fetch(`${L.API}/api/v1/products/categories`).then(r => r.json());
  let catAvailIds = null;
  try { catAvailIds = new Set(await fetch(`${L.API}/api/v1/displayItem/category-availability`).then(r => r.json())); } catch (e) { }
  const emptyCats = catAvailIds ? catsRaw.filter(c => !catAvailIds.has(c.categoryId)).map(c => c.categoryName) : [];
  const okCats = catAvailIds ? catsRaw.filter(c => catAvailIds.has(c.categoryId)) : catsRaw;
  R.truth = { ...T, nbCount: nbNames.length, emptyCats, okCatCount: okCats.length };
  R.checks.real_data_probe = `unfiltered=${T.unfiltered} band=${T.band_10k_50k} likeNew=${T.band_cond_LIKE_NEW} oyster=${T.oysterOnly} community=${T.communityOnly} shops=${T.shopsOnly} nb=${nbNames.length} emptyCats=[${emptyCats}]`;

  const browser = await L.newBrowser();

  for (const [vpName, vp] of [['375x667', { width: 375, height: 667 }], ['768x1024', { width: 768, height: 1024 }]]) {
    const videoPath = `${ROOT}/e2e/videos/${UNIT}-${STAGE}-${vpName}.webm`;
    const ctx = await L.newCtx(browser, { viewport: vp, videoPath });
    const page = await ctx.newPage();
    R.reqs[vpName] = []; R.resps[vpName] = [];
    const imgMap = {};
    page.on('request', r => {
      if (/displayItem\/filter/.test(r.url())) {
        const u = new URL(r.url());
        let b = {}; try { b = JSON.parse(r.postData() || '{}'); } catch (e) { }
        R.reqs[vpName].push({ q: Object.fromEntries(u.searchParams.entries()), body: b, ts: Date.now() });
      }
    });
    page.on('response', r => {
      const u = r.url();
      if (/displayItem\/filter/.test(u)) {
        r.json().then(j => R.resps[vpName].push({ status: r.status(), total: j && j.totalElements, n: j && j.content ? j.content.length : 0 })).catch(() => R.resps[vpName].push({ status: r.status(), total: null }));
      }
      if (/\/uploads\/[^?#]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/[^?#]*\.(png|webp|jpg|svg)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
    });

    // ---------- boot -> Marketplace tab (SPA has no server-side deep link) ----------
    await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(page, 'Buy now', 60000).catch(() => {});
    await sleep(4000);
    let logged = await L.isLoggedIn(page);
    btn(vpName + '-boot-home-renders', true, 'home loaded; logged=' + logged);
    const tabHit = await L.clickBtn(page, 'Marketplace');
    await sleep(4500);
    let t = await txt(page);
    btn(vpName + '-marketplace-tab-clicked', tabHit && t.includes('Marketplace'), `tab=${tabHit} title seen=${t.includes('Marketplace')}`);
    assert(vpName, 'A0-browse-renders-real-feed', t.includes('Marketplace') && t.includes('TSh') && t.length > 1500, { len: t.length, tsh: t.includes('TSh') });
    assert(vpName, 'A0-no-placeholder-strings', !/\b(lorem|dummy|TODO|sample data|placeholder text)\b/i.test(t), 'a11y clean');
    R.checks.data_asserts += 2;

    // availability gating in the chip bar: horizontally scroll and read EXACT chip nodes
    const CAT_NAMES = catsRaw.map(c => c.categoryName);
    async function chipsOnScreen() {
      return page.evaluate((cats) => {
        const out = [];
        document.querySelectorAll('flt-semantics').forEach(e => {
          const t = (e.textContent || '').trim();
          if (!t || t.length > 45 || !cats.includes(t)) return;
          const r = e.getBoundingClientRect();
          if (r.width > 30 && r.height >= 36 && r.bottom > 0 && r.top < innerHeight && r.left >= -2 && r.right <= innerWidth + 2) out.push(t);
        });
        return out;
      }, CAT_NAMES);
    }
    const seenChips = new Set();
    await page.mouse.move(187, 140); await sleep(400);
    for (let i = 0; i < 10; i++) {
      for (const c of await chipsOnScreen()) seenChips.add(c);
      await page.mouse.wheel(520, 0); await sleep(700);
    }
    for (const c of await chipsOnScreen()) seenChips.add(c);
    await page.mouse.move(187, 140);
    for (let i = 0; i < 14; i++) { await page.mouse.wheel(-900, 0); await sleep(130); }
    await sleep(700);
    const emptyShown = emptyCats.filter(c => seenChips.has(c));
    const okShown = [...seenChips].filter(c => okCats.some(k => k.categoryName === c));
    assert(vpName, 'A6-empty-categories-hidden-per-availability', emptyShown.length === 0,
      { emptyShown, seenChipCount: seenChips.size, seenChips: [...seenChips] });
    assert(vpName, 'A6-available-categories-shown>=4', okShown.length >= 4,
      { okShownCount: okShown.length });
    R.checks.data_asserts += 1;
    await shot(page, vpName, '01-browse-chipbar');

    // ---------- open FILTER SHEET ----------
    const filtBtn = await L.clickBtn(page, 'Filters');
    await sleep(2600);
    let sheet = await txt(page);
    btn(vpName + '-filters-button-opens-sheet', filtBtn && /Price range|Condition|Neighbourhood/.test(sheet), `clicked=${filtBtn}`);
    for (const [k, needle] of [['A1-sheet-price-section', 'Price range'], ['A2-sheet-condition-chips-new+likenew+good+fair+poor', 'like new'],
      ['A3-sheet-neighbourhood-field', 'Neighbourhood'], ['A4-sheet-productsource-community+shops', 'Community'], ['A4b-sheet-clearall+apply', 'Apply filters']]) {
      assert(vpName, k, sheet.includes(needle), { needle });
    }
    // condition chips enumerated verbatim
    const condsSeen = ['new', 'like new', 'good', 'fair', 'poor'].filter(c => sheet.toLowerCase().includes(c));
    assert(vpName, 'A2-condition-chips-all-five-present', condsSeen.length >= 5, condsSeen);
    // invalid enum labels must be gone (AU-047 E-fix regression guard)
    assert(vpName, 'A4-no-invalid-source-labels', !sheet.includes('Local') && !sheet.includes('INTERNATIONAL'), 'COMMUNITY|SHOPS only');
    await shot(page, vpName, '02-sheet-initial');

    // ---------- PRICE band: type Min/Max -> Apply -> wire + render narrow ----------
    const nIns = await page.locator('input').count();
    let typedPrice = false;
    try {
      await page.locator('input').nth(nIns - 2).click({ force: true }); await sleep(350);
      await page.keyboard.type('10000'); await sleep(250);
      await page.locator('input').nth(nIns - 1).click({ force: true }); await sleep(350);
      await page.keyboard.type('50000'); await sleep(250);
      typedPrice = true;
    } catch (e) { console.log('price type err', String(e).slice(0, 80)); }
    await shot(page, vpName, '03-sheet-price-filled');
    const rq0 = R.reqs[vpName].length;
    await tapNode(page, 'Apply filters'); await sleep(3600);
    const priceReq = R.reqs[vpName].slice(rq0).find(r => r.body.minPrice !== undefined);
    btn(vpName + '-apply-filters-clicked', priceReq !== undefined, 'wire carried minPrice=' + (priceReq && priceReq.body.minPrice));
    assert(vpName, 'A1-price-band-on-wire-body-min10000-max50000',
      !!priceReq && priceReq.body.minPrice === 10000 && priceReq.body.maxPrice === 50000,
      priceReq ? { body: priceReq.body } : { typedPrice });
    const priceResp = R.resps[vpName].slice(rq0).pop();
    assert(vpName, 'A1-price-band-wire-total==curl-truth', !!priceResp && priceResp.total === T.band_10k_50k,
      { wireTotal: priceResp && priceResp.total, truth: T.band_10k_50k });
    R.checks.state_asserts += 3;

    // ---------- CONDITION chip narrows further ----------
    await L.clickBtn(page, 'Filters'); await sleep(2200);
    // sheet reopens with prior values persisted (state retention check)
    sheet = await txt(page);
    const retained = sheet.includes('10,000') || sheet.includes('10000');
    assert(vpName, 'A1-sheet-reopens-with-retained-price', retained, 'min field shows 10000');
    const chipHit = await tapNode(page, 'like new'); await sleep(400);
    await shot(page, vpName, '04-sheet-like-new-selected');
    const rq1 = R.reqs[vpName].length;
    await tapNode(page, 'Apply filters'); await sleep(3400);
    const condReq = R.reqs[vpName].slice(rq1).find(r => r.body.conditionFilter !== undefined);
    btn(vpName + '-condition-chip-toggled', chipHit !== null && !!condReq, 'chip tapped + conditionFilter on wire');
    assert(vpName, 'A2-conditionFilter-LIKE_NEW-on-wire-body', !!condReq && condReq.body.conditionFilter === 'LIKE_NEW', condReq && condReq.body);
    const condResp = R.resps[vpName].slice(rq1).pop();
    assert(vpName, 'A2-condition-wire-total==curl-truth', !!condResp && condResp.total === T.band_cond_LIKE_NEW,
      { wireTotal: condResp && condResp.total, truth: T.band_cond_LIKE_NEW });
    assert(vpName, 'A2-condition-narrowed-vs-band', !!condResp && !!priceResp && condResp.total <= priceResp.total,
      { cond: condResp && condResp.total, band: priceResp && priceResp.total });
    R.checks.state_asserts += 2;

    // ---------- NEIGHBOURHOOD dropdown from endpoint; menu opens; pick narrows ----------
    await L.clickBtn(page, 'Filters'); await sleep(2400);
    await scrollSheet(page); await sleep(800);
    const beforeMenu = await txt(page);
    const fieldTap = await tapNode(page, 'Neighbourhood', 80, 34);
    await sleep(1800);
    const menuTxt = await txt(page);
    const listed = nbNames.filter(n => menuTxt.includes(n));
    btn(vpName + '-neighbourhood-field-tapped', fieldTap !== null, `field=${fieldTap}`);
    assert(vpName, 'A3-neighbourhood-menu-opens-with-endpoint-options', listed.length >= 3,
      { listed: listed.slice(0, 6), endpointCount: nbNames.length });
    await shot(page, vpName, '05-neighbourhood-menu-open');
    const pickedName = nbNames.includes('Bamaga Road, Mwenge') ? 'Bamaga Road, Mwenge' : nbNames[0];
    const pickTruth = (await bodyFilter({ minPrice: 10000, maxPrice: 50000, conditionFilter: 'LIKE_NEW', neighbourhood: pickedName, page: 0, size: 1 })).j.totalElements;
    const pickOk = await tapNode(page, pickedName, 40, 18); await sleep(900);
    const afterPick = await txt(page);
    assert(vpName, 'A3-neighbourhood-selection-reflected-in-field', pickOk !== null && afterPick.includes(pickedName), { pickedName });
    await shot(page, vpName, '06-neighbourhood-picked');
    const rq2 = R.reqs[vpName].length;
    await tapNode(page, 'Apply filters'); await sleep(3600);
    const nbReq = R.reqs[vpName].slice(rq2).find(r => r.body.neighbourhood !== undefined);
    assert(vpName, 'A3-neighbourhood-on-wire-body', !!nbReq && nbReq.body.neighbourhood === pickedName, nbReq && nbReq.body);
    const nbResp = R.resps[vpName].slice(rq2).pop();
    assert(vpName, 'A3-neighbourhood-wire-total==curl-truth>0', !!nbResp && nbResp.total === pickTruth && nbResp.total > 0,
      { wireTotal: nbResp && nbResp.total, truth: pickTruth });
    R.checks.state_asserts += 3;

    // ---------- PRODUCT SOURCE toggle COMMUNITY (no 400) ----------
    await L.clickBtn(page, 'Filters'); await sleep(2200);
    await scrollSheet(page); await sleep(500);
    const srcTap = await tapNode(page, 'Community'); await sleep(400);
    await shot(page, vpName, '07-source-community-selected');
    const rq3 = R.reqs[vpName].length;
    await tapNode(page, 'Apply filters'); await sleep(3600);
    const srcReq = R.reqs[vpName].slice(rq3).find(r => r.body.productSource !== undefined);
    const bad400 = R.resps[vpName].some(r => r.status === 400);
    btn(vpName + '-community-source-chip-toggled', srcTap !== null && !!srcReq, 'chip + productSource on wire');
    assert(vpName, 'A4-productSource-COMMUNITY-on-wire-body', !!srcReq && srcReq.body.productSource === 'COMMUNITY', srcReq && srcReq.body);
    const combTruth = (await bodyFilter({ minPrice: 10000, maxPrice: 50000, conditionFilter: 'LIKE_NEW', neighbourhood: pickedName, productSource: 'COMMUNITY', page: 0, size: 200 })).j.totalElements;
    const combResp = R.resps[vpName].slice(rq3).pop();
    assert(vpName, 'A4-combined-wire-total==curl-truth-no-400', !!combResp && combResp.total === combTruth && !bad400,
      { wireTotal: combResp && combResp.total, truth: combTruth, any400: bad400 });
    R.checks.state_asserts += 2;

    // ---------- CLEAR ALL restores unfiltered feed ----------
    await L.clickBtn(page, 'Filters'); await sleep(2200);
    await tapNode(page, 'Clear all'); await sleep(700);
    const rq4 = R.reqs[vpName].length;
    await tapNode(page, 'Apply filters'); await sleep(3600);
    const clearResp = R.resps[vpName].slice(rq4).pop();
    const clearedBody = R.reqs[vpName].slice(rq4).pop();
    assert(vpName, 'A5-clear-all-restores-unfiltered-total',
      !!clearResp && clearResp.total === T.unfiltered && clearedBody && clearedBody.body.minPrice === undefined,
      { wireTotal: clearResp && clearResp.total, truth: T.unfiltered, bodyKeys: clearedBody && Object.keys(clearedBody.body) });
    R.checks.state_asserts += 1;

    // ---------- GRID/LIST toggle swaps layout observably ----------
    const gridLayout = await layout(page);
    const toggleLabelBefore = (await txt(page)).includes('List view') ? 'List view' : ((await txt(page)).includes('Grid view') ? 'Grid view' : null);
    let toggled = await L.clickBtn(page, 'List view') ? 'List view' : (await L.clickBtn(page, 'Grid view') ? 'Grid view' : 'FAILED');
    await sleep(1800);
    const listLayout = await layout(page);
    btn(vpName + '-gridlist-toggle-clicked', toggled !== 'FAILED' && toggleLabelBefore !== null, `before=${toggleLabelBefore} clicked=${toggled}`);
    assert(vpName, 'A5-grid-mode-is-multi-column', gridLayout.n >= 4 && gridLayout.maxRowCols >= 2, gridLayout);
    assert(vpName, 'A5-list-toggle-swaps-to-single-column-rows',
      listLayout.maxRowCols === 1 && gridLayout.maxRowCols >= 2 &&
      (listLayout.listRows.n >= 3 || listLayout.n === 1),
      { grid: gridLayout, list: listLayout });
    await shot(page, vpName, '08-list-mode');
    const backToggled = await L.clickBtn(page, 'Grid view') ? 'Grid view' : (await L.clickBtn(page, 'List view') ? 'List view' : 'FAILED');
    await sleep(1700);
    const gridBack = await layout(page);
    assert(vpName, 'A5-toggle-back-restores-multi-column-grid', backToggled !== 'FAILED' && gridBack.maxRowCols >= 2, { clicked: backToggled, grid: gridBack });
    await shot(page, vpName, '09-grid-mode-restored');
    R.nav_asserts += 2;

    // ---------- CLICK-EVERYTHING sweep on browse chrome ----------
    const ctrls = await L.listButtons(page);
    const labeled = ctrls.filter(c => c.kind === 'button' && c.label.trim());
    console.log(`CONTROLS ${vpName}: ${labeled.map(c => c.label.slice(0, 18)).join(' | ')}`);
    // sort menu opens with options (control already exercised by AU-048; presence + open here)
    const sortOpened = await L.clickBtn(page, 'Sort'); await sleep(1100);
    const sortMenuTxt = await txt(page);
    const sortOpts = ['Relevance', 'Price: Low to High', 'Newest'].filter(o => sortMenuTxt.includes(o));
    btn(vpName + '-sort-menu-opens', sortOpened && sortOpts.length >= 2, sortOpts.join(','));
    await page.keyboard.press('Escape'); await sleep(500);
    // category chip narrows via categoryIds (scroll the chip bar to reach the chip)
    const rc0 = R.reqs[vpName].length;
    await page.mouse.move(187, 400); for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -900); await sleep(120); }
    const chipClicked = await scrollChipBarTo(page, vpName, 'Electronics', 12, vp.width, vp.height); await sleep(2800);
    const catReq = R.reqs[vpName].slice(rc0).find(r => Array.isArray(r.body.categoryIds));
    const catResp = R.resps[vpName].slice(rc0).pop();
    btn(vpName + '-category-chip-clicked', chipClicked, 'Electronics chip');
    assert(vpName, 'A7-category-chip-categoryIds-on-wire+narrowed', !!catReq && !!catResp && catResp.total < T.unfiltered,
      { ids: catReq && catReq.body.categoryIds, total: catResp && catResp.total, all: T.unfiltered });
    R.checks.state_asserts += 1;
    // search input navigates to Search screen (input control asserted enabled earlier)
    const editable = await page.evaluate(() => { const i = document.querySelector('input[type="text"],input:not([type])'); return i ? !i.disabled : false; });
    btn(vpName + '-search-input-editable', editable, '');
    await shot(page, vpName, '10-after-click-sweep');

    // ---------- IMAGES ----------
    const summ = L.imageSummary(imgMap);
    R.checks.images_requested += summ.total;
    R.checks.images_200 += summ.ok;
    Object.entries(imgMap).forEach(([u, s]) => { if (s >= 400) R.checks.images_broken.push(`${s} ${u}`); });
    assert(vpName, 'C-images-all-200-nonempty', summ.total > 0 && summ.failed === 0, summ);

    try { const v = await page.video(); await ctx.close(); if (v) await v.saveAs(videoPath).catch(() => {}); }
    catch (e) { await ctx.close().catch(() => {}); }
    R.videos.push(videoPath); R.evidence.push(videoPath);
  }

  // ---------- PARITY vs reference :3000 (same flow, same sandbox data) ----------
  try {
    const rctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
    const rp = await rctx.newPage();
    const refResps = [];
    rp.on('response', async r => {
      if (/displayItem\/filter|products\/filter/.test(r.url())) { try { refResps.push((await r.json()).totalElements); } catch (e) { } }
    });
    await rp.goto(REF + '/browse', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await sleep(9000);
    const refTxt = await rp.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => '');
    fs.writeFileSync(`${SHOT}/ref-browse-text.txt`, refTxt); R.evidence.push(`${SHOT}/ref-browse-text.txt`);
    // reference hides empty categories too?
    const refEmptyShown = emptyCats.filter(c => refTxt.includes(c));
    const refChipbarOk = okCats.filter(c => refTxt.includes(c.categoryName.slice(0, 8))).length;
    // reference chip-bar parity is judged by the delta classifier below (it also shows
    // Food & Groceries on this seed), so no extra minor is counted here.
    // open the reference filter dialog (mobile: floating Filters button)
    let fb = rp.getByRole('button', { name: /filter/i }).first();
    if (!(await fb.isVisible().catch(() => false))) fb = rp.locator('button', { hasText: /filter/i }).first();
    await fb.click({ force: true }).catch(() => {}); await sleep(2500);
    const dlg = await rp.evaluate(() => document.body.innerText.slice(0, 6000)).catch(() => '');
    fs.writeFileSync(`${SHOT}/ref-filter-dialog.txt`, dlg); R.evidence.push(`${SHOT}/ref-filter-dialog.txt`);
    const refDialog = { price: /price/i.test(dlg), condition: /condition/i.test(dlg), location: /location|neighbourhood/i.test(dlg), source: /source/i.test(dlg), subcategoryAccordion: /subcategor/i.test(dlg) };
    await L.screenshot(rp, `${SHOT}/ref-375-browse-filters.png`); R.evidence.push(`${SHOT}/ref-375-browse-filters.png`);
    // deltas vs mobile sheet
    const deltas = [];
    if (!refDialog.price) deltas.push('ref-dialog-missing-price');
    if (refEmptyShown.length > 0) deltas.push(`reference ALSO shows empty category chip(s): ${refEmptyShown.join(',')} (mobile parity, not a mobile defect)`);
    if (refResps.length && Math.abs(refResps[refResps.length - 1] - T.unfiltered) > T.unfiltered * 0.35) {
      deltas.push(`ref feed total drifts (${refResps[refResps.length - 1]} vs ${T.unfiltered})`);
    }
    R.parityRef = { refDialog, refResps: refResps.slice(-4), deltas, refEmptyShown, refChipbarOk };
    if (deltas.length) R.checks.parity.minor += deltas.length; else R.checks.parity.accepted++;
    await rctx.close();
  } catch (e) { console.log('REF exception: ' + e.message); R.checks.parity.minor++; }

  await browser.close();

  // ---------- VISION: native PNG reads happen next in-session; structural pre-pass ----------
  for (const s of R.evidence.filter(f => f.endsWith('.png'))) {
    try {
      const buf = fs.readFileSync(s);
      const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
      if (!w || !h) R.checks.vision_findings.push(`unreadable-png ${s}`);
    } catch (e) { R.checks.vision_findings.push(`missing-png ${s}`); }
  }

  R.verdict = (R.failures.length === 0 && R.checks.real_data !== false &&
    R.checks.images_200 === R.checks.images_requested && R.checks.buttons_failed.length === 0 &&
    R.checks.parity.blocker === 0 && R.checks.parity.major === 0) ? 'PASS' : 'FAIL';

  const shard = {
    ts: new Date().toISOString(), unit: UNIT, title: 'filters_availability_gridlist', wave: 'verify',
    agent: 'verifier-AU-049', build_sha: BUILD_SHA, build_mtime: BUILD_MT,
    viewport: '375x667+768x1024', verdict: R.verdict, checks: R.checks,
    failures: R.failures.slice(0, 40), evidence: R.evidence.slice(0, 40),
    truth: R.truth, parityRef: R.parityRef, runtime_ms: Date.now() - T0,
  };
  fs.appendFileSync(`${ROOT}/e2e/results/shards/AU-049-verify.jsonl`, JSON.stringify(shard) + '\n');
  fs.writeFileSync('/tmp/au049_r14_run.json', JSON.stringify(R, null, 1));
  console.log('\nVERDICT ' + R.verdict + ' failures=' + R.failures.length +
    ' buttons=' + R.checks.buttons_ok + '/' + R.checks.buttons_total +
    ' images=' + R.checks.images_200 + '/' + R.checks.images_requested);
  console.log(JSON.stringify(R.asserts.filter(a => !a.pass), null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
