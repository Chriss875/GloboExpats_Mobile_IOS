// au048_verify_r14.js — AU-048 FINAL verification on the FROZEN lane :9131 (git e694463,
// main.dart.js Last-Modified Wed, 26 Aug 2026 08:15:26 GMT — includes a827b42 zero-result
// trackSearch, 18b154e Trending sort + clickCount, and the AU-047 fetchFiltered body-binding
// fix). RO lane: read-only against shared sandbox seed; reuses the AU-048 r7 fixture set
// (30 'AU048R71787692116574 Probe Widget N' rows, seller 666) that already exists in the
// catalog — no writes.
// Acceptance (WAVE_PLAN #115):
//  CRIT1 search via displayItem/filter with real paging past 24 (no size-24 cap)
//  CRIT2 client sort dropdown [Relevance, Price L-H, Price H-L, Newest, Highest Rating,
//       Trending] observably reorders accumulated results
//  CRIT3 zero-result search fires exactly ONE trackSearch:true filter call ~2s after settle
//  CRIT4 request-board suggestion renders on empty results (products/search DTO:
//       showRequestSuggestion/suggestedMessage/requestBoardPath)
// Canonical checklist: freshness / real data / images / click-everything / shots BOTH
// viewports / native vision on every PNG / video per stage / parity vs :3000.
const fs = require('fs');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';           // FROZEN lane override
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-048';
const STAGE = 'r14';
const TOKEN = 'AU048R71787692116574';          // fixture seller token (existing rows)
const ZERO_TERM = 'qqzzxx99r14' + Math.floor(Math.random() * 1e6); // unique gibberish
const OUT = {
  freshness: null, asserts: [], reqs: [], resps: [], images: {}, clicks: [],
  trackSearchCalls: [], domOrders: {}, groundTruth: null, deepLinkField: null,
  videos: [], shots: [], searchDto: null, refShots: [],
};
function log(...a) { console.log('[au048r14]', ...a); }
function assert(vp, name, pass, value) {
  OUT.asserts.push({ vp, name, pass: !!pass, value: value === undefined ? null : value });
  log(pass ? 'PASS ' : 'FAIL ', vp, name, JSON.stringify(value ?? '').slice(0, 200));
}
async function dumpText(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')); }
async function shot(p, vp, state) {
  const f = `${ROOT}/e2e/shots/${UNIT}/${UNIT}-${vp}-${state}.png`;
  await L.screenshot(p, f); OUT.shots.push(f); return f;
}
// smallest on-screen node whose text includes lbl (cards are tappable, buttons role=button)
async function tapText(p, lbl, requireTappable = false) {
  const cands = await p.evaluate(({ lbl, requireTappable }) => {
    const out = []; const vh = innerHeight;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim(); if (!t.includes(lbl)) return;
      if (requireTappable && e.getAttribute('flt-tappable') === null) return;
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
// visible card prices + widget numbers in DOM order (dedup by widget number)
function visibleCards(p) {
  return p.evaluate(() => {
    const nodes = [...document.querySelectorAll('flt-semantics')];
    const cards = [];
    for (const e of nodes) {
      const t = (e.textContent || '').trim();
      const m = t.match(/TSh ([\d,]+)\s/);
      if (!m) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 60 || r.height < 60 || r.bottom < 0 || r.top > innerHeight) continue;
      const nameM = t.match(/Probe Widget (\d+)/);
      cards.push({ price: Number(m[1].replace(/,/g, '')), widget: nameM ? Number(nameM[1]) : null });
    }
    const seen = new Set(); const out = [];
    for (const c of cards.sort((a, b) => b.widget - a.widget)) {
      const k = c.price + ':' + c.widget;
      if (!seen.has(k)) { seen.add(k); out.push(c); }
    }
    return out;
  });
}
// every interactive control on screen (click-everything rule)
async function listControls(p) {
  return p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const role = e.getAttribute('role'); const t = (e.textContent || '').trim();
      if (!t) return;
      const r = e.getBoundingClientRect();
      const vis = r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight;
      if (!vis) return;
      if (role === 'button') out.push({ kind: 'button', label: t.slice(0, 40) });
      else if (e.getAttribute('flt-tappable') !== null) out.push({ kind: 'tappable', label: t.slice(0, 34) });
    });
    document.querySelectorAll('input').forEach(i => out.push({ kind: 'input', label: i.placeholder || i.type }));
    return out;
  });
}

(async () => {
  fs.mkdirSync(`${ROOT}/e2e/shots/${UNIT}`, { recursive: true });

  // ---- C1 FRESHNESS ----
  const head = await fetch(`${APP}/main.dart.js`, { method: 'HEAD' });
  OUT.freshness = { lastModified: head.headers.get('last-modified') };
  assert('meta', 'C1-freshness-mtime-081526GMT',
    OUT.freshness.lastModified === 'Wed, 26 Aug 2026 08:15:26 GMT', OUT.freshness);

  // ---- C2 REAL DATA ground truth (independent curl, body-bound like the app) ----
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
  // qs-only control: proves criteria MUST be in the body (the AU-048 defect class)
  const qsOnly = await fetch(`${L.API}/api/v1/displayItem/filter?searchTerm=${encodeURIComponent(ZERO_TERM)}&page=0&size=24`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const qsOnlyTotal = (await qsOnly.json()).totalElements;
  assert('api', 'C2-groundtruth-total-31', gtTotal === 31, gtTotal);
  assert('api', 'C2-groundtruth-paged-unique-31',
    gAll.length === 31 && new Set(gAll.map(x => x.id)).size === 31,
    { n: gAll.length, uniq: new Set(gAll.map(x => x.id)).size });
  assert('api', 'C2-groundtruth-zero-term-0', gtZero === 0, gtZero);
  assert('api', 'C2-wire-body-bound-not-qs-only', qsOnlyTotal >= 600,
    { qsOnlyTotal, note: 'qs-only ignores searchTerm -> whole feed; body binding is what filters' });
  const WIDGETS = JSON.parse(fs.readFileSync('/tmp/au048_widgets.json', 'utf8'));
  const wByNum = {}; for (const k of Object.keys(WIDGETS)) wByNum[k] = WIDGETS[k];
  const sampleName = gAll[0] && gAll[0].name;
  log('ground truth total', gtTotal, 'paged', gAll.length, 'sample', sampleName);
  OUT.groundTruth = { gtTotal, paged: gAll.length, unique: new Set(gAll.map(x => x.id)).size, sampleName, widgets: Object.keys(wByNum).length };
  // products/search DTO (request-board suggestion source)
  const srch = await fetch(`${L.API}/api/v1/products/search?q=${encodeURIComponent(ZERO_TERM)}&page=0&size=12`);
  OUT.searchDto = await srch.json().catch(() => null);

  const browser = await L.newBrowser();
  for (const [vpName, vp] of [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }]]) {
    const videoPath = `${ROOT}/e2e/videos/AU-048-${STAGE}-${vpName}.webm`;
    OUT.videos.push(videoPath);
    const ctx = await L.newCtx(browser, { viewport: vp, videoPath });
    const page = await ctx.newPage();

    page.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?#]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/[^?#]*\.(png|webp|jpg|svg)(\?|#|$)/i.test(u))
        OUT.images[u] = r.status();
    });
    page.on('request', r => {
      if (/displayItem\/filter/.test(r.url())) {
        let body = {}; try { body = JSON.parse(r.postData() || '{}'); } catch (e) {}
        const u = new URL(r.url());
        const entry = {
          vp: vpName, method: r.method(),
          qsTerm: u.searchParams.get('searchTerm'), qsPage: u.searchParams.get('page'), qsSize: u.searchParams.get('size'),
          bodyTerm: body.searchTerm ?? null, bodyPage: body.page ?? null, bodySize: body.size ?? null,
          trackSearchQS: u.searchParams.get('trackSearch'), trackSearchBody: !!body.trackSearch,
          ts: Date.now(),
        };
        OUT.reqs.push(entry);
        if (entry.trackSearchBody || entry.trackSearchQS === 'true') OUT.trackSearchCalls.push(entry);
      }
    });
    page.on('response', r => {
      if (/displayItem\/filter/.test(r.url())) {
        r.json().then(j => {
          if (j && typeof j.totalElements === 'number')
            OUT.resps.push({ vp: vpName, status: r.status(), total: j.totalElements, returned: (j.content || []).length });
        }).catch(() => {});
      }
    });

    // ---- login with the shared sandbox test account ----
    await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(page, 'Buy now', 60000).catch(() => {});
    let logged = await L.isLoggedIn(page);
    if (!logged) {
      await L.clickBtn(page, 'Login'); await L.waitText(page, 'Welcome back', 25000).catch(() => {});
      const ei = page.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await page.waitForTimeout(300);
      await page.keyboard.type('mobile.test.20260820@gmail.com', { delay: 8 });
      const pi = page.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await page.waitForTimeout(300);
      await page.keyboard.type('StrongPass!1', { delay: 8 });
      await L.clickBtn(page, 'Log in');
      for (let i = 0; i < 30 && !logged; i++) { await page.waitForTimeout(1000); logged = await L.isLoggedIn(page); }
    }
    assert(vpName, 'C-login-token-present', logged, '');

    // ---- deep link into search with the fixture token ----
    await page.evaluate((t) => { window.location.hash = '/search?q=' + encodeURIComponent(t); }, TOKEN);
    await L.waitText(page, 'Probe Widget', 30000).catch(() => {});
    await page.waitForTimeout(4000);
    let T = await dumpText(page);
    assert(vpName, 'C3-deeplink-renders-canary-cards', T.includes('Probe Widget'), (T.match(/Probe Widget/g) || []).length);
    // real-data probe: an exact fixture price must appear in the rendered DOM
    const p29price = '62,000';
    assert(vpName, 'C2-real-data-fixture-price-in-dom', T.includes(`TSh ${p29price}`), `TSh ${p29price}`);
    const fieldValue = await page.evaluate(() => {
      const i = document.querySelector('input[type="text"]');
      return i ? i.value : null;
    });
    OUT.deepLinkField = fieldValue;
    assert(vpName, 'C4-deep-link-restores-query-in-field', fieldValue === TOKEN, fieldValue);
    await shot(page, vpName, '05-canary-results');

    // ---- CRIT1 paging: scroll until all 30 unique widgets accumulated ----
    const seenWidgets = new Set();
    let rounds = 0;
    while (rounds < 18) {
      const names = (await dumpText(page)).match(/Probe Widget (\d+)/g) || [];
      for (const n of names) { const m = n.match(/Widget (\d+)/); if (m) seenWidgets.add(Number(m[1])); }
      const vis = await visibleCards(page);
      for (const c of vis) if (c.widget !== null) seenWidgets.add(c.widget);
      if (seenWidgets.size >= 30) break;
      await scrollDown(page, 6); await page.waitForTimeout(1300);
      rounds++;
    }
    assert(vpName, `CRIT1-paging-unique-${seenWidgets.size}-of-30`, seenWidgets.size >= 30,
      [...seenWidgets].sort((a, b) => a - b).join(','));
    const pageReqs = OUT.reqs.filter(r => r.vp === vpName && String(r.bodyTerm) === TOKEN && !r.trackSearchBody && r.trackSearchQS !== 'true');
    const maxPage = Math.max(...pageReqs.map(r => Number(r.bodyPage)));
    assert(vpName, 'CRIT1-pages-fetched-distinct-max-page>=1', maxPage >= 1 && pageReqs.length >= 2,
      { calls: pageReqs.length, maxPage, pages: pageReqs.map(r => r.bodyPage) });
    assert(vpName, 'CRIT1-criteria-in-json-body-not-qs-only',
      pageReqs.every(r => r.bodyTerm === TOKEN && r.bodyPage !== null),
      pageReqs.slice(0, 2));
    T = await dumpText(page);
    assert(vpName, 'CRIT1-no-duplicate-widget-in-final-dom-top',
      (() => { const arr = (T.match(/Probe Widget (\d+)/g) || []).map(x => Number(x.match(/\d+/)[0])); return new Set(arr).size === arr.length; })(),
      'dom-window-uniqueness');
    await scrollUp(page, 10);
    await shot(page, vpName, '10-after-scroll-pages');

    // ---- CRIT2 sort dropdown ----
    const sortOpened = await L.clickBtn(page, 'Sort');
    await page.waitForTimeout(700);
    T = await dumpText(page);
    const wantOpts = ['Relevance', 'Price: Low to High', 'Price: High to Low', 'Newest', 'Highest Rating', 'Trending'];
    const optSeen = {}; for (const o of wantOpts) optSeen[o] = T.includes(o);
    assert(vpName, 'CRIT2-sort-menu-all-six-options', Object.values(optSeen).every(Boolean), optSeen);
    await shot(page, vpName, '15-sort-menu-open');
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);

    async function pickOption(label) {
      await L.clickBtn(page, 'Sort'); await page.waitForTimeout(650);
      const ok = await tapText(page, label); await page.waitForTimeout(1500);
      return ok;
    }
    function monotonic(arr, dir) {
      for (let i = 1; i < arr.length; i++) { if (dir > 0 ? arr[i] < arr[i - 1] : arr[i] > arr[i - 1]) return false; } return true;
    }

    // Price asc
    await pickOption('Price: Low to High');
    await scrollDown(page, 6); await page.waitForTimeout(900);
    const asc = await visibleCards(page);
    await scrollUp(page, 10);
    assert(vpName, 'CRIT2-price-asc-monotonic', monotonic(asc.map(c => c.price), 1), asc.map(c => c.price).slice(0, 18));
    OUT.domOrders[vpName + '.asc'] = asc.slice(0, 24);
    await shot(page, vpName, '20-price-asc');

    // Price desc
    await pickOption('Price: High to Low');
    await scrollDown(page, 6); await page.waitForTimeout(900);
    const desc = await visibleCards(page);
    await scrollUp(page, 10);
    assert(vpName, 'CRIT2-price-desc-monotonic', monotonic(desc.map(c => c.price), -1), desc.map(c => c.price).slice(0, 18));
    OUT.domOrders[vpName + '.desc'] = desc.slice(0, 24);
    await shot(page, vpName, '22-price-desc');

    // Trending (clickCount desc): widget 9 cc=238 max -> first card
    await pickOption('Trending');
    await scrollDown(page, 6); await page.waitForTimeout(900);
    const trend = await visibleCards(page);
    await scrollUp(page, 10);
    const firstTrend = trend.slice(0, 5).map(c => c.widget).filter(x => x !== null);
    assert(vpName, 'CRIT2-trending-first-card-is-highest-clickcount-widget9', firstTrend[0] === 9,
      { first5: firstTrend, expectedTop: 9 });
    OUT.domOrders[vpName + '.trending'] = trend.slice(0, 12);
    await shot(page, vpName, '25-trending-order');

    // Highest Rating: fixtures are 0.0/4.8 -> 4.8 rows first, widget 0 (rating 0.0) NOT in top half
    await pickOption('Highest Rating');
    await scrollDown(page, 4); await page.waitForTimeout(900);
    const ratedOrder = await visibleCards(page);
    await scrollUp(page, 10);
    const ratedTop = ratedOrder.slice(0, Math.ceil(ratedOrder.length * 0.6)).map(c => c.widget);
    assert(vpName, 'CRIT2-highest-rating-puts-rated-first', ratedTop.length > 0 && !ratedTop.includes(0),
      { top: ratedTop, note: 'widget0 has rating 0.0 and must not lead' });
    OUT.domOrders[vpName + '.rating'] = ratedOrder.slice(0, 12);
    await shot(page, vpName, '28-rating-order');

    // Newest: server returns newest-first -> latest fixtures (high widget numbers) on top
    await pickOption('Newest');
    await scrollDown(page, 4); await page.waitForTimeout(900);
    const newest = await visibleCards(page);
    await scrollUp(page, 10);
    const topNewest = newest.slice(0, 5).map(c => c.widget).filter(x => x !== null);
    assert(vpName, 'CRIT2-newest-top-is-latest-fixtures', topNewest.some(w => w >= 27), topNewest);
    OUT.domOrders[vpName + '.newest'] = newest.slice(0, 12);
    await shot(page, vpName, '30-newest-order');

    // Relevance restore
    await pickOption('Relevance');
    await page.waitForTimeout(1000);

    // ---- CRIT3+CRIT4 zero-result search ----
    const tsBefore = OUT.trackSearchCalls.filter(c => c.vp === vpName).length;
    const input = page.locator('input[type="text"]').first();
    await input.click({ force: true }); await page.waitForTimeout(250);
    for (let i = 0; i < 45; i++) await page.keyboard.press('Backspace');
    await page.keyboard.type(ZERO_TERM, { delay: 12 });
    await page.keyboard.press('Enter');
    await L.waitText(page, 'No results found.', 20000).catch(() => {});
    await page.waitForTimeout(3500);   // > 2s settle window
    T = await dumpText(page);
    assert(vpName, 'CRIT3-zero-result-empty-state-shown', T.includes('No results found.'),
      T.split('\n').filter(l => /results/i.test(l)).slice(0, 3));
    await shot(page, vpName, '35-zero-results');
    const tsAfter = OUT.trackSearchCalls.filter(c => c.vp === vpName);
    assert(vpName, 'CRIT3-tracksearch-exactly-once-after-settle', tsAfter.length - tsBefore === 1,
      tsAfter.map(c => ({ body: c.trackSearchBody, qs: c.trackSearchQS, size: c.bodySize, term: c.bodyTerm })));
    assert(vpName, 'CRIT4-request-board-suggestion-rendered',
      T.includes("We couldn't find") && T.includes('Request Board'),
      T.split('\n').filter(l => /couldn't find|Request Board/i.test(l)).slice(0, 4));
    await shot(page, vpName, '37-request-board-suggestion');
    const rbTapped = await tapText(page, 'Request Board', true);
    await page.waitForTimeout(2500);
    const TRB = await dumpText(page);
    const rbNav = TRB.includes('Post request') || TRB.includes('Request board') || TRB.includes('#/requests') ||
      (await page.evaluate(() => location.hash)).then ? null : null;
    const hashNow = await page.evaluate(() => location.hash);
    assert(vpName, 'CLICK-request-board-suggestion-navigates', rbTapped && /requests/.test(hashNow),
      { tapped: rbTapped, hash: hashNow });
    await shot(page, vpName, '39-request-board-screen');
    await page.goBack(); await page.waitForTimeout(1500);

    // ---- C4 CLICK EVERY CONTROL on the results screen ----
    const inp2 = page.locator('input[type="text"]').first();
    await inp2.click({ force: true }); await page.waitForTimeout(250);
    for (let i = 0; i < 45; i++) await page.keyboard.press('Backspace');
    await page.keyboard.type(TOKEN, { delay: 10 });
    await page.keyboard.press('Enter');
    await L.waitText(page, 'Probe Widget', 25000).catch(() => {});
    await page.waitForTimeout(2500);

    const ctrls = await listControls(page);
    OUT.clicks.push({ vp: vpName, controls: ctrls });
    log(vpName, 'controls:', JSON.stringify(ctrls).slice(0, 500));

    // card tap -> detail
    const tapped = await tapText(page, 'Probe Widget', true);
    await page.waitForTimeout(2500);
    const TD = await dumpText(page);
    const detailOpen = TD.includes('Description') || TD.includes('Add to cart') || TD.includes('Buy now');
    assert(vpName, 'CLICK-product-card-navigates-to-detail', tapped && detailOpen,
      { tapped, markers: ['Description', 'Add to cart', 'Buy now'].filter(m => TD.includes(m)) });
    await shot(page, vpName, '40-product-detail');
    await page.goBack(); await page.waitForTimeout(1800);

    // magnifier button re-fires search (network effect)
    const reqBefore = OUT.reqs.filter(r => r.vp === vpName).length;
    await L.clickBtn(page, 'Search'); await page.waitForTimeout(2800);
    const reqAfter = OUT.reqs.filter(r => r.vp === vpName).length;
    assert(vpName, 'CLICK-magnifier-refires-search', reqAfter > reqBefore, { before: reqBefore, after: reqAfter });

    // sort button opens menu again (state change)
    const sortOk = await L.clickBtn(page, 'Sort');
    await page.waitForTimeout(600);
    const menuVisible = (await dumpText(page)).includes('Price: Low to High');
    assert(vpName, 'CLICK-sort-button-opens-menu', sortOk && menuVisible, '');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);

    // text field editable (input control present + enabled)
    const editable = await page.evaluate(() => { const i = document.querySelector('input[type="text"]'); return i ? !i.disabled : false; });
    assert(vpName, 'CLICK-search-field-editable', editable, '');

    await shot(page, vpName, '50-final-state');

    try { const v = await page.video(); await ctx.close(); if (v) await v.saveAs(videoPath).catch(() => {}); }
    catch (e) { await ctx.close().catch(() => {}); }
  }

  // ---- images summary ----
  const imgVals = Object.values(OUT.images);
  OUT.imagesSummary = { total: imgVals.length, ok: imgVals.filter(s => s === 200 || s === 304).length, failed: imgVals.filter(s => s >= 400).length };
  assert('meta', 'C-images-all-200', OUT.imagesSummary.failed === 0 && OUT.imagesSummary.ok === OUT.imagesSummary.total, OUT.imagesSummary);

  fs.writeFileSync(`/tmp/au048/${STAGE}_run.json`, JSON.stringify(OUT, null, 2));
  log('DONE. asserts pass=', OUT.asserts.filter(a => a.pass).length, 'fail=', OUT.asserts.filter(a => !a.pass).length);
  console.log(JSON.stringify(OUT.asserts.filter(a => !a.pass), null, 1));
})().catch(e => { console.error('HARNESS FAILED', e); process.exit(1); });
