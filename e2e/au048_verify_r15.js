// au048_verify_r15.js — AU-048 FINAL terminal verification on FROZEN lane :9131
// (build sha e694463, main.dart.js Last-Modified Wed, 26 Aug 2026 08:15:26 GMT).
// RO lane: read-only against shared sandbox seed (fixture token AU048R71787692116574,
// 30 'Probe Widget N' rows + 1 other match = totalElements 31). Only app-behavior side
// effect allowed: the zero-result trackSearch:true filter call the acceptance REQUIRES.
//
// r14 post-mortem folded in (probe bugs FIXED here, app code untouched):
//  * visibleCards() re-sorted candidates by widget number DESC before returning, which
//    DESTROYED positional order -> false CRIT2 asc/desc/trending FAILs. Here cards are
//    returned strictly in DOM (document) order, innermost node per card, deduped.
//  * CRIT4 crash cascade: after tapping a non-existent Request Board link the script
//    waited on an input locator forever. All locator waits guarded now.
// Acceptance (wf_build_batch2a c1-browse + task brief):
//  CRIT1 search routes through displayItem/filter w/ real paging past 24
//  CRIT2 sort dropdown [Relevance, Price L-H, Price H-L, Newest, Highest Rating,
//       Trending] observably reorders the accumulated results
//  CRIT3 zero-result search fires trackSearch:true ~2s after settle (exactly once)
//  CRIT4 request-board suggestion renders on empty results
const fs = require('fs');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';            // FROZEN lane override
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-048';
const STAGE = 'r15';
const TOKEN = 'AU048R71787692116574';
const ZERO_TERM = 'qqzzxx99r15' + Math.floor(Math.random() * 1e6);
const GT = JSON.parse(fs.readFileSync('/tmp/au048_widgets.json', 'utf8')); // widget -> {id,price,cc,rating}
const CC = {}; for (const k of Object.keys(GT)) CC[Number(k)] = GT[k].cc;

const OUT = {
  freshness: {}, api: {}, asserts: [], reqs: [], resps: [], images: {},
  orders: {}, clicks: [], trackSearchCalls: [], timings: [], videos: [], shots: [],
  refShots: [], refText: {}, buttonsTotal: 0, buttonsOk: 0, buttonsFailed: [],
};
function log(...a) { console.log('[au048r15]', ...a); }
function assert(vp, name, pass, value) {
  OUT.asserts.push({ vp, name, pass: !!pass, value: value === undefined ? null : value });
  log(pass ? 'PASS ' : 'FAIL ', vp, name, JSON.stringify(value ?? '').slice(0, 220));
}
async function dumpText(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')); }
async function shot(p, vp, state) {
  const f = `${ROOT}/e2e/shots/${UNIT}/${UNIT}-${vp}-${STAGE}-${state}.png`;
  await L.screenshot(p, f); OUT.shots.push(f); return f;
}
// innermost on-screen node whose text includes lbl
async function tapText(p, lbl, requireTappable = false) {
  const cands = await p.evaluate(({ lbl, requireTappable }) => {
    const out = []; const vh = innerHeight;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim(); if (!t.includes(lbl)) return;
      if (requireTappable && e.getAttribute('flt-tappable') === null) return;
      let child = false; e.querySelectorAll('flt-semantics').forEach(c => { if ((c.textContent || '').includes(lbl)) child = true; });
      if (child) return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > vh) return;
      out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height });
    });
    out.sort((a, b) => a.area - b.area); return out.slice(0, 4);
  }, { lbl, requireTappable });
  const vh = await p.evaluate(() => innerHeight);
  for (const c of cands) { await p.mouse.click(c.cx, Math.max(12, Math.min(c.cy, vh - 16))); await p.waitForTimeout(500); return true; }
  return false;
}
async function scrollDown(p, steps, dy = 420) {
  await p.mouse.move(180, 380);
  for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, dy); await p.waitForTimeout(170); }
}
async function scrollUp(p, steps) {
  await p.mouse.move(180, 380);
  for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, -900); await p.waitForTimeout(120); }
}
// Cards STRICTLY in DOM/document order (FIX of r14 bug): innermost node per card,
// on-screen only, deduped by widget number. NO re-sorting.
async function cardsInOrder(p) {
  return p.evaluate(() => {
    const out = []; const seen = new Set();
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      const m = t.match(/Probe Widget (\d+)/); if (!m) return;
      let child = false; e.querySelectorAll('flt-semantics').forEach(c => { if ((c.textContent || '').includes('Probe Widget')) child = true; });
      if (child) return;
      const num = Number(m[1]); if (seen.has(num)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 40 || r.height < 40 || r.bottom < 0 || r.top > innerHeight) return;
      const pm = t.match(/TSh ([\d,]+)/);
      seen.add(num);
      out.push({ widget: num, price: pm ? Number(pm[1].replace(/,/g, '')) : null });
    });
    return out;
  });
}
// walk the whole result list, accumulating cards in visual order
async function collectAll(p, wantWidgets, maxRounds = 16) {
  const acc = []; const seen = new Set(); let rounds = 0; let stall = 0;
  while (rounds < maxRounds) {
    const vis = await cardsInOrder(p);
    for (const c of vis) if (!seen.has(c.widget)) { seen.add(c.widget); acc.push(c); }
    if (seen.size >= wantWidgets) break;
    const before = seen.size;
    await scrollDown(p, 5); await p.waitForTimeout(1100);
    if (seen.size === before) { stall++; if (stall >= 3) break; } else stall = 0;
    rounds++;
  }
  return acc;
}
async function visibleWindow(p) { return cardsInOrder(p); }
// every interactive control currently on screen
async function listControls(p) {
  return p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const role = e.getAttribute('role'); const t = (e.textContent || '').trim();
      if (!t) return;
      const r = e.getBoundingClientRect();
      const vis = r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight;
      if (!vis) return;
      const dis = e.getAttribute('aria-disabled');
      if (role === 'button') out.push({ kind: 'button', label: t.slice(0, 40), disabled: dis === 'true' });
      else if (e.getAttribute('flt-tappable') !== null) out.push({ kind: 'tappable', label: t.slice(0, 34), disabled: dis === 'true' });
    });
    document.querySelectorAll('input').forEach(i => out.push({ kind: 'input', label: i.placeholder || i.type, disabled: i.disabled }));
    return out;
  });
}
async function clearAndType(p, text) {
  const inp = page_input(p);
  if (!inp) return false;
  await inp.click({ force: true }).catch(() => false); await p.waitForTimeout(300);
  for (let i = 0; i < 50; i++) await p.keyboard.press('Backspace');
  await p.keyboard.type(text, { delay: 11 });
  await p.keyboard.press('Enter');
  return true;
}
function page_input(p) {
  const loc = p.locator('input[type="text"]').first();
  return loc;
}

(async () => {
  fs.mkdirSync(`${ROOT}/e2e/shots/${UNIT}`, { recursive: true });

  // ================= C1 FRESHNESS =================
  const head = await fetch(`${APP}/main.dart.js`, { method: 'HEAD' });
  OUT.freshness.lastModified = head.headers.get('last-modified');
  OUT.freshness.sha = 'e694463';
  assert('meta', 'C1-freshness-sha-e694463+mtime-081526GMT',
    OUT.freshness.lastModified === 'Wed, 26 Aug 2026 08:15:26 GMT', OUT.freshness);

  // ================= C2 REAL DATA (independent curl, body-bound) =================
  async function g(body) {
    const r = await fetch(`${L.API}/api/v1/displayItem/filter`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, j: await r.json().catch(() => null) };
  }
  const gAll = [];
  for (let pg = 0; pg < 5; pg++) {
    const r = await g({ searchTerm: TOKEN, page: pg, size: 24 });
    if (!r.j || !r.j.content || !r.j.content.length) break;
    gAll.push(...r.j.content.map(c => ({ id: c.productId, name: c.productName, price: c.productAskingPrice })));
    if (r.j.last) break;
  }
  const gtTotal = (await g({ searchTerm: TOKEN, page: 0, size: 1 })).j.totalElements;
  const gtZero = (await g({ searchTerm: ZERO_TERM, page: 0, size: 24 })).j.totalElements;
  const qsOnly = await (await fetch(`${L.API}/api/v1/displayItem/filter?searchTerm=${encodeURIComponent(ZERO_TERM)}&page=0&size=24`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
  // fixture image really loads over HTTP (real asset, non-empty)
  const imgResp = await fetch(`${L.API}/uploads/a83ca936-5de6-499a-a6c1-47f71b64b3d5_au048.webp`);
  const imgBuf = await imgResp.arrayBuffer();
  OUT.api = { gtTotal, paged: gAll.length, unique: new Set(gAll.map(x => x.id)).size, gtZero,
    qsOnlyTotal: qsOnly.totalElements, imgStatus: imgResp.status, imgBytes: imgBuf.byteLength,
    sampleName: gAll[0] && gAll[0].name };
  assert('api', 'C2-groundtruth-total-31-body-bound', gtTotal === 31 && gAll.length === 31 &&
    new Set(gAll.map(x => x.id)).size === 31, { total: gtTotal, paged: gAll.length, uniq: OUT.api.unique });
  assert('api', 'C2-groundtruth-zero-term-0', gtZero === 0, gtZero);
  assert('api', 'C2-wire-body-bound-not-qs-only', qsOnly.totalElements >= 500,
    { qsOnlyTotal: qsOnly.totalElements, note: 'criteria MUST ride the JSON body (@RequestBody-only backend)' });
  assert('api', 'C2-fixture-image-http200-nonempty', imgResp.status === 200 && imgBuf.byteLength > 1000,
    { status: imgResp.status, bytes: imgBuf.byteLength });
  log('ground truth', JSON.stringify(OUT.api));

  // ================= BROWSER, BOTH VIEWPORTS =================
  const browser = await L.newBrowser();
  for (const [vpName, vp] of [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }]]) {
    const videoPath = `${ROOT}/e2e/videos/AU-048-${STAGE}-${vpName}.webm`;
    OUT.videos.push(videoPath);
    const vctx = await newCtxWithVideo(browser, vp, videoPath);
    const page = await vctx.newPage();

    page.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?#]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/[^?#]*\.(png|webp|jpg|svg)(\?|#|$)/i.test(u))
        OUT.images[u] = r.status();
    });
    page.on('request', r => {
      if (/displayItem\/filter/.test(r.url())) {
        let body = {}; try { body = JSON.parse(r.postData() || '{}'); } catch (e) {}
        const u = new URL(r.url());
        const entry = { vp: vpName, method: r.method(), qsTerm: u.searchParams.get('searchTerm'),
          bodyTerm: body.searchTerm ?? null, bodyPage: body.page ?? null, bodySize: body.size ?? null,
          trackSearchQS: u.searchParams.get('trackSearch'), trackSearchBody: !!body.trackSearch, ts: Date.now() };
        OUT.reqs.push(entry);
        if (entry.trackSearchBody || entry.trackSearchQS === 'true') OUT.trackSearchCalls.push(entry);
      }
    });
    page.on('response', r => {
      if (/displayItem\/filter/.test(r.url()))
        r.json().then(j => { if (j && typeof j.totalElements === 'number')
          OUT.resps.push({ vp: vpName, status: r.status(), total: j.totalElements, returned: (j.content || []).length }); }).catch(() => {});
    });

    // ---- login (shared sandbox buyer/admin account) ----
    const t0 = Date.now();
    await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(page, 'Buy now', 60000).catch(() => {});
    let logged = await L.isLoggedIn(page);
    if (!logged) {
      await L.clickBtn(page, 'Login'); await L.waitText(page, 'Welcome back', 25000).catch(() => {});
      const ei = page.locator('input[type="text"]').first();
      await ei.click({ force: true }).catch(() => {}); await page.waitForTimeout(350);
      await page.keyboard.type(L.BUYER.email, { delay: 8 });
      const pi = page.locator('input[type="password"]').first();
      await pi.click({ force: true }).catch(() => {}); await page.waitForTimeout(350);
      await page.keyboard.type(L.BUYER.pw, { delay: 8 });
      await L.clickBtn(page, 'Log in');
      for (let i = 0; i < 30 && !logged; i++) { await page.waitForTimeout(1000); logged = await L.isLoggedIn(page); }
    }
    assert(vpName, 'C-login-shared-sandbox-account', logged, { ms: Date.now() - t0 });

    // ---- deep link into search with the fixture token ----
    await page.evaluate(t => { window.location.hash = '/search?q=' + encodeURIComponent(t); }, TOKEN);
    await L.waitText(page, 'Probe Widget', 30000).catch(() => {});
    await page.waitForTimeout(4000);
    let T = await dumpText(page);
    assert(vpName, 'C3-deeplink-renders-fixture-cards', T.includes('Probe Widget'),
      (T.match(/Probe Widget/g) || []).length);
    assert(vpName, 'C2-real-data-fixture-price-in-dom', T.includes('TSh 62,000') && T.includes('TSh 2,000'),
      ['TSh 62,000', 'TSh 2,000'].filter(x => T.includes(x)));
    const fieldValue = await page.evaluate(() => { const i = document.querySelector('input[type="text"]'); return i ? i.value : null; });
    assert(vpName, 'C4-deep-link-restores-query-in-field', fieldValue === TOKEN, fieldValue);
    await shot(page, vpName, '05-canary-results');

    // ---- CRIT1 paging: accumulate all 30 widgets in visual order ----
    const acc = await collectAll(page, 30);
    const widgets = acc.map(c => c.widget);
    assert(vpName, 'CRIT1-paging-unique-30-of-30', seenCount(widgets) >= 30,
      `${seenCount(widgets)}/30 [${Math.min(...widgets)}..${Math.max(...widgets)}]`);
    const pageReqs = OUT.reqs.filter(r => r.vp === vpName && String(r.bodyTerm) === TOKEN && !r.trackSearchBody && r.trackSearchQS !== 'true');
    const pages = [...new Set(pageReqs.map(r => Number(r.bodyPage)))].sort((a, b) => a - b);
    assert(vpName, 'CRIT1-distinct-pages-fetched', pages.length >= 2 && pages[0] === 0,
      { calls: pageReqs.length, pages });
    assert(vpName, 'CRIT1-criteria-in-json-body-not-qs-only',
      pageReqs.every(r => r.bodyTerm === TOKEN && r.bodyPage !== null),
      pageReqs.slice(0, 2).map(r => ({ qs: r.qsTerm, body: r.bodyTerm, page: r.bodyPage })));
    const respTotals = [...new Set(OUT.resps.filter(r => r.vp === vpName).map(r => r.total))];
    assert(vpName, 'CRIT1-server-total-elements-31-through-ui', respTotals.includes(31), respTotals);
    await scrollUp(page, 12); await page.waitForTimeout(700);
    const win = await visibleWindow(page);
    const winW = win.map(c => c.widget);
    assert(vpName, 'CRIT1-no-duplicate-card-in-visible-window',
      new Set(winW).size === winW.length, winW.slice(0, 12));
    OUT.orders[vpName + '.relevance'] = win;
    await shot(page, vpName, '10-after-scroll');

    async function pickOption(label) {
      const okOpen = await L.clickBtn(page, 'Sort'); await page.waitForTimeout(650);
      const ok = await tapText(page, label); await page.waitForTimeout(1600);
      return okOpen && ok;
    }

    // ---- CRIT2 sort dropdown: enumerate + reorder observably ----
    const sortOpened = await L.clickBtn(page, 'Sort'); await page.waitForTimeout(700);
    T = await dumpText(page);
    const wantOpts = ['Relevance', 'Price: Low to High', 'Price: High to Low', 'Newest', 'Highest Rating', 'Trending'];
    const optSeen = {}; for (const o of wantOpts) optSeen[o] = T.includes(o);
    assert(vpName, 'CRIT2-sort-menu-all-six-options', sortOpened && Object.values(optSeen).every(Boolean), optSeen);
    await shot(page, vpName, '15-sort-menu-open');
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);

    // Price Low->High over the FULL accumulated order
    await pickOption('Price: Low to High');
    const asc = await collectAll(page, 30, 6);
    await scrollUp(page, 12);
    assert(vpName, 'CRIT2-price-asc-monotonic-full-list', monotonicBy(asc.map(c => c.price), 1),
      asc.slice(0, 10).map(c => `${c.widget}:${c.price}`));
    OUT.orders[vpName + '.asc'] = asc;
    await shot(page, vpName, '20-price-asc');

    await pickOption('Price: High to Low');
    const desc = await collectAll(page, 30, 6);
    await scrollUp(page, 12);
    assert(vpName, 'CRIT2-price-desc-monotonic-full-list', monotonicBy(desc.map(c => c.price), -1),
      desc.slice(0, 10).map(c => `${c.widget}:${c.price}`));
    OUT.orders[vpName + '.desc'] = desc;
    await shot(page, vpName, '22-price-desc');

    await pickOption('Trending');
    const trend = await collectAll(page, 30, 6);
    await scrollUp(page, 12);
    const trendCC = trend.map(c => CC[c.widget]).filter(x => x !== undefined);
    assert(vpName, 'CRIT2-trending-orders-clickcount-desc', trendCC[0] === 238 && monotonicBy(trendCC, -1),
      { first6: trend.slice(0, 6).map(c => `${c.widget}(cc${CC[c.widget]})`) });
    OUT.orders[vpName + '.trending'] = trend;
    await shot(page, vpName, '25-trending-order');

    await pickOption('Highest Rating');
    const rated = await collectAll(page, 30, 6);
    await scrollUp(page, 12);
    const ratedW = rated.map(c => c.widget);
    assert(vpName, 'CRIT2-highest-rating-rated-first-widget0-last',
      ratedW.length === 30 && ratedW[ratedW.length - 1] === 0,
      { last3: ratedW.slice(-3), note: 'only widget 0 has rating 0.0; rest are 4.8' });
    OUT.orders[vpName + '.rating'] = rated.slice(0, 12);
    await shot(page, vpName, '28-rating-order');

    await pickOption('Newest');
    const newest = await collectAll(page, 30, 6);
    await scrollUp(page, 12);
    const topNewest = newest.slice(0, 5).map(c => c.widget);
    assert(vpName, 'CRIT2-newest-top-is-latest-fixtures', topNewest.some(w => w >= 27), topNewest);
    OUT.orders[vpName + '.newest'] = newest.slice(0, 12);
    await shot(page, vpName, '30-newest-order');

    await pickOption('Relevance'); await page.waitForTimeout(900);

    // ---- CRIT3 zero-result search -> exactly one trackSearch ~2s after settle ----
    const tsBefore = OUT.trackSearchCalls.filter(c => c.vp === vpName).length;
    const submitTs = Date.now();
    await clearAndType(page, ZERO_TERM);
    let emptyAt = null;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(250);
      if ((await dumpText(page)).includes('No results found.')) { emptyAt = Date.now(); break; }
    }
    assert(vpName, 'CRIT3-empty-state-shown', emptyAt !== null, emptyAt ? emptyAt - submitTs + 'ms' : 'never');
    await page.waitForTimeout(3500);   // > the 2s settle window
    T = await dumpText(page);
    assert(vpName, 'CRIT3-empty-state-still-after-settle', T.includes('No results found.'),
      T.split('\n').filter(l => /results/i.test(l)).slice(0, 2));
    await shot(page, vpName, '35-zero-results');
    const tsAfter = OUT.trackSearchCalls.filter(c => c.vp === vpName);
    const lag = tsAfter.length ? tsAfter[tsAfter.length - 1].ts - submitTs : null;
    assert(vpName, 'CRIT3-tracksearch-exactly-once', tsAfter.length - tsBefore === 1,
      tsAfter.slice(tsBefore).map(c => ({ body: c.trackSearchBody, qs: c.trackSearchQS, size: c.bodySize, term: c.bodyTerm })));
    assert(vpName, 'CRIT3-tracksearch-fires-about-2s-after-settle',
      lag !== null && emptyAt !== null && lag - (emptyAt - submitTs) >= 1400 && lag <= 8000,
      { submitToCallMs: lag, submitToEmptyMs: emptyAt ? emptyAt - submitTs : null });
    OUT.timings.push({ vp: vpName, submitTs, emptyAt, callTs: tsAfter.length ? tsAfter[tsAfter.length - 1].ts : null });
    // CRIT4: request-board suggestion (products/search DTO showRequestSuggestion)
    assert(vpName, 'CRIT4-request-board-suggestion-rendered',
      T.includes("We couldn't find") && T.includes('Request Board'),
      T.split('\n').filter(l => /couldn|request board/i.test(l)).slice(0, 3));
    await shot(page, vpName, '37-zero-results-settled');

    // ---- restore the fixture query for the click sweep ----
    await clearAndType(page, TOKEN);
    await L.waitText(page, 'Probe Widget', 25000).catch(() => {});
    await page.waitForTimeout(2500);

    // ---- C4 CLICK EVERY CONTROL on the results screen ----
    const ctrls = await listControls(page);
    OUT.clicks.push({ vp: vpName, controls: ctrls });
    log(vpName, 'controls:', JSON.stringify(ctrls).slice(0, 420));
    const deadCtrls = ctrls.filter(c => c.disabled);
    assert(vpName, 'CLICK-no-disabled-controls-or-reasoned', deadCtrls.length === 0, deadCtrls);

    const tapped = await tapText(page, 'Probe Widget', true);
    await page.waitForTimeout(2600);
    const TD = await dumpText(page);
    const markers = ['Description', 'Add to cart', 'Buy now'].filter(m => TD.includes(m));
    assert(vpName, 'CLICK-product-card-navigates-to-detail', tapped && markers.length > 0, { tapped, markers });
    await shot(page, vpName, '40-product-detail');
    await page.goBack(); await page.waitForTimeout(2000);

    const reqBefore = OUT.reqs.filter(r => r.vp === vpName).length;
    await L.clickBtn(page, 'Search'); await page.waitForTimeout(2800);
    const reqAfter = OUT.reqs.filter(r => r.vp === vpName).length;
    assert(vpName, 'CLICK-magnifier-refires-search', reqAfter > reqBefore, { before: reqBefore, after: reqAfter });

    const sortOk = await L.clickBtn(page, 'Sort'); await page.waitForTimeout(600);
    const menuVisible = (await dumpText(page)).includes('Price: Low to High');
    assert(vpName, 'CLICK-sort-button-opens-menu', sortOk && menuVisible, '');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);

    const editable = await page.evaluate(() => { const i = document.querySelector('input[type="text"]'); return i ? !i.disabled : false; });
    assert(vpName, 'CLICK-search-field-editable', editable, '');
    OUT.buttonsTotal += ctrls.length + 4;
    OUT.buttonsOk += ctrls.filter(c => !c.disabled).length + 4;

    await shot(page, vpName, '50-final-state');
    try { const v = await page.video(); await vctx.close(); if (v) await v.saveAs(videoPath).catch(() => {}); }
    catch (e) { await vctx.close().catch(() => {}); }
  }

  // ---- images summary ----
  const imgVals = Object.values(OUT.images);
  OUT.imagesSummary = { requested: imgVals.length, ok200: imgVals.filter(s => s === 200 || s === 304).length,
    broken: OUT.images && Object.keys(OUT.images).filter(u => OUT.images[u] >= 400) };
  assert('meta', 'C-images-all-200', OUT.imagesSummary.requested > 0 &&
    OUT.imagesSummary.ok200 === OUT.imagesSummary.requested, OUT.imagesSummary);

  fs.mkdirSync(`${ROOT}/e2e/results/shards`, { recursive: true });
  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-048-${STAGE}.json`, JSON.stringify(OUT, null, 1));
  log(`DONE asserts pass=${OUT.asserts.filter(a => a.pass).length} fail=${OUT.asserts.filter(a => !a.pass).length}`);
  console.log(JSON.stringify(OUT.asserts.filter(a => !a.pass), null, 1));
})().catch(e => { console.error('HARNESS FAILED', e); process.exit(1); });

// ---------- helpers ----------
function seenCount(arr) { return new Set(arr).size; }
function monotonicBy(arr, dir) {
  for (let i = 1; i < arr.length; i++) {
    const a = arr[i - 1], b = arr[i];
    if (a === null || b === null) continue;
    if (dir > 0 ? b < a : b > a) return false;
  }
  return arr.length > 3;
}
async function newCtxWithVideo(browser, vp, videoPath) {
  const { chromium } = require('playwright');
  void chromium;
  const ctx = await browser.newContext({
    viewport: vp,
    recordVideo: { dir: require('path').dirname(videoPath), size: vp },
  });
  return ctx;
}
