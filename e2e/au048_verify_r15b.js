// au048_verify_r15b.js — AU-048 terminal verification v2 on FROZEN lane :9131
// (sha e694463, main.dart.js Last-Modified Wed, 26 Aug 2026 08:15:26 GMT). RO lane.
// Fixes over r15 (probe-only; app code untouched):
//  * ORDER READS: Flutter's SingleChildScrollView+Column keeps every accumulated card
//    in the semantics tree, each positioned at its layout rect. So read ALL innermost
//    'Probe Widget N' nodes and sort by rect.y — the true visual order, no scrolling
//    during the read (r15 scrolled while reading -> perturbed trending/rating orders).
//  * trackSearch timing: measure call_ts - empty_detected_ts (must be ~2s); r15 capped
//    wall-clock from submit at 8s which the 768 run legitimately exceeded (typing time).
// Acceptance: C1 freshness / C2 real data / images / clicks / shots both viewports /
// native vision / CRIT1 paging / CRIT2 six-option sort / CRIT3 trackSearch / CRIT4
// request-board suggestion / PARITY vs :3000.
const fs = require('fs');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
const REF = 'http://localhost:3000';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-048';
const STAGE = 'r15b';
const TOKEN = 'AU048R71787692116574';
const ZERO_TERM = 'qqzzxx99r15b' + Math.floor(Math.random() * 1e6);
const GT = JSON.parse(fs.readFileSync('/tmp/au048_widgets.json', 'utf8'));
const CC = {}; for (const k of Object.keys(GT)) CC[Number(k)] = GT[k].cc;

const OUT = { freshness: {}, api: {}, asserts: [], reqs: [], resps: [], images: {},
  orders: {}, clicks: [], trackSearchCalls: [], timings: [], videos: [], shots: [],
  refShots: [], refText: {}, buttonsTotal: 0, buttonsOk: 0 };
function log(...a) { console.log('[au048r15b]', ...a); }
function assert(vp, name, pass, value) {
  OUT.asserts.push({ vp, name, pass: !!pass, value: value === undefined ? null : value });
  log(pass ? 'PASS ' : 'FAIL ', vp, name, JSON.stringify(value ?? '').slice(0, 240));
}
async function dumpText(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')); }
async function shot(p, vp, state) {
  const f = `${ROOT}/e2e/shots/${UNIT}/${UNIT}-${vp}-${STAGE}-${state}.png`;
  await L.screenshot(p, f); OUT.shots.push(f); return f;
}
// ALL innermost fixture-card nodes in VISUAL order (sorted by layout y), deduped.
async function cardsInVisualOrder(p) {
  return p.evaluate(() => {
    const rows = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      const m = t.match(/Probe Widget (\d+)/); if (!m) return;
      let child = false; e.querySelectorAll('flt-semantics').forEach(c => { if ((c.textContent || '').includes('Probe Widget')) child = true; });
      if (child) return;
      const num = Number(m[1]);
      const pm = t.match(/TSh ([\d,]+)/);
      const r = e.getBoundingClientRect();
      rows.push({ widget: num, price: pm ? Number(pm[1].replace(/,/g, '')) : null, y: Math.round(r.y), h: Math.round(r.height) });
    });
    rows.sort((a, b) => a.y - b.y);
    const seen = new Set(); const out = [];
    for (const c of rows) { if (seen.has(c.widget)) continue; seen.add(c.widget); out.push({ widget: c.widget, price: c.price }); }
    return out;
  });
}
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
async function scrollToTop(p) {
  await p.mouse.move(180, 380);
  for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, -1200); await p.waitForTimeout(90); }
  await p.waitForTimeout(400);
}
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
  const inp = p.locator('input[type="text"]').first();
  await inp.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
  await inp.click({ force: true }).catch(() => {}); await p.waitForTimeout(300);
  for (let i = 0; i < 50; i++) await p.keyboard.press('Backspace');
  await p.keyboard.type(text, { delay: 9 });
  await p.keyboard.press('Enter');
}
function monotonicBy(arr, dir) {
  if (arr.length < 5) return false;
  for (let i = 1; i < arr.length; i++) {
    const a = arr[i - 1], b = arr[i];
    if (a === null || b === null) continue;
    if (dir > 0 ? b < a : b > a) return false;
  }
  return true;
}

(async () => {
  fs.mkdirSync(`${ROOT}/e2e/shots/${UNIT}`, { recursive: true });

  // ---------- C1 FRESHNESS ----------
  const head = await fetch(`${APP}/main.dart.js`, { method: 'HEAD' });
  OUT.freshness.lastModified = head.headers.get('last-modified');
  assert('meta', 'C1-freshness-sha-e694463+mtime-081526GMT',
    OUT.freshness.lastModified === 'Wed, 26 Aug 2026 08:15:26 GMT', OUT.freshness);

  // ---------- C2 REAL DATA ----------
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
  const imgResp = await fetch(`${L.API}/uploads/a83ca936-5de6-499a-a6c1-47f71b64b3d5_au048.webp`);
  const imgBytes = (await imgResp.arrayBuffer()).byteLength;
  OUT.api = { gtTotal, paged: gAll.length, uniq: new Set(gAll.map(x => x.id)).size, gtZero,
    qsOnlyTotal: qsOnly.totalElements, imgStatus: imgResp.status, imgBytes };
  assert('api', 'C2-groundtruth-total-31-body-bound', gtTotal === 31 && gAll.length === 31 &&
    new Set(gAll.map(x => x.id)).size === 31, { total: gtTotal, paged: gAll.length, uniq: OUT.api.uniq });
  assert('api', 'C2-groundtruth-zero-term-0', gtZero === 0, gtZero);
  assert('api', 'C2-wire-body-bound-not-qs-only', qsOnly.totalElements >= 500, { qsOnlyTotal: qsOnly.totalElements });
  assert('api', 'C2-fixture-image-http200-nonempty', imgResp.status === 200 && imgBytes > 1000,
    { status: imgResp.status, bytes: imgBytes });

  // ---------- REFERENCE (:3000) PARITY CAPTURES ----------
  const rb = await L.newBrowser();
  try {
    for (const [nm, url] of [['ref-results', `${REF}/browse?q=${encodeURIComponent(TOKEN)}`],
                             ['ref-zero', `${REF}/browse?q=${encodeURIComponent(ZERO_TERM)}`]]) {
      const rctx = await rb.newContext({ viewport: { width: 375, height: 667 } });
      const rp = await rctx.newPage();
      await rp.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await rp.waitForTimeout(7000);
      const txt = await rp.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1200));
      OUT.refText[nm] = txt;
      const f = `${ROOT}/e2e/shots/${UNIT}/AU-048-ref-${STAGE}-${nm}.png`;
      await L.screenshot(rp, f); OUT.refShots.push(f);
      await rctx.close();
    }
  } finally { await rb.close(); }
  const refHasFixtures = (OUT.refText['ref-results'] || '').includes('Probe Widget');
  const refZeroCopy = OUT.refText['ref-zero'] || '';
  const refZeroShowsEmpty = refZeroCopy.includes('No products found');
  log('REF zero copy:', JSON.stringify(refZeroCopy.slice(0, 260)));
  assert('ref', 'PARITY-ref-renders-fixture-data', refHasFixtures, refHasFixtures);
  assert('ref', 'PARITY-ref-zero-state-copy-captured', refZeroShowsEmpty,
    { hasNoProductsFound: refZeroShowsEmpty, sample: refZeroCopy.slice(0, 160) });

  // ---------- BROWSER, BOTH VIEWPORTS ----------
  const browser = await L.newBrowser();
  for (const [vpName, vp] of [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }]]) {
    const videoPath = `${ROOT}/e2e/videos/AU-048-${STAGE}-${vpName}.webm`;
    OUT.videos.push(videoPath);
    const vctx = await browser.newContext({ viewport: vp, recordVideo: { dir: require('path').dirname(videoPath), size: vp } });
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

    // ---- login ----
    await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(page, 'Buy now', 60000).catch(() => {});
    let logged = await L.isLoggedIn(page);
    if (!logged) {
      await L.clickBtn(page, 'Login'); await L.waitText(page, 'Welcome back', 25000).catch(() => {});
      const ei = page.locator('input[type="text"]').first();
      await ei.click({ force: true }).catch(() => {}); await page.waitForTimeout(350);
      await page.keyboard.type(L.BUYER.email, { delay: 7 });
      const pi = page.locator('input[type="password"]').first();
      await pi.click({ force: true }).catch(() => {}); await page.waitForTimeout(350);
      await page.keyboard.type(L.BUYER.pw, { delay: 7 });
      await L.clickBtn(page, 'Log in');
      for (let i = 0; i < 30 && !logged; i++) { await page.waitForTimeout(1000); logged = await L.isLoggedIn(page); }
    }
    assert(vpName, 'C-login-shared-sandbox-account', logged, '');

    // ---- deep link into search ----
    await page.evaluate(t => { window.location.hash = '/search?q=' + encodeURIComponent(t); }, TOKEN);
    await L.waitText(page, 'Probe Widget', 30000).catch(() => {});
    await page.waitForTimeout(3500);
    let T = await dumpText(page);
    assert(vpName, 'C3-deeplink-renders-fixture-cards', T.includes('Probe Widget'), (T.match(/Probe Widget/g) || []).length);
    assert(vpName, 'C2-real-data-fixture-prices-in-dom', T.includes('TSh 62,000') && T.includes('TSh 2,000'),
      ['TSh 62,000', 'TSh 2,000'].filter(x => T.includes(x)));
    const fieldValue = await page.evaluate(() => { const i = document.querySelector('input[type="text"]'); return i ? i.value : null; });
    assert(vpName, 'C4-deep-link-restores-query-in-field', fieldValue === TOKEN, fieldValue);
    await shot(page, vpName, '05-canary-results');

    // ---- CRIT1 paging: load everything, count unique + distinct pages ----
    let seen = new Set(); let rounds = 0;
    while (rounds < 14) {
      const cards = await cardsInVisualOrder(page);
      cards.forEach(c => seen.add(c.widget));
      if (seen.size >= 30) break;
      await page.mouse.move(180, vp.height * 0.6);
      await page.mouse.wheel(0, 2400); await page.waitForTimeout(1300);
      rounds++;
    }
    assert(vpName, 'CRIT1-paging-unique-30-of-30', seen.size >= 30,
      `${seen.size}/30 [${Math.min(...seen)}..${Math.max(...seen)}]`);
    const pageReqs = OUT.reqs.filter(r => r.vp === vpName && String(r.bodyTerm) === TOKEN && !r.trackSearchBody && r.trackSearchQS !== 'true');
    const pages = [...new Set(pageReqs.map(r => Number(r.bodyPage)))].sort((a, b) => a - b);
    assert(vpName, 'CRIT1-distinct-pages-fetched', pages.length >= 2 && pages[0] === 0, { calls: pageReqs.length, pages });
    assert(vpName, 'CRIT1-criteria-in-json-body-not-qs-only',
      pageReqs.every(r => r.bodyTerm === TOKEN && r.bodyPage !== null),
      pageReqs.slice(0, 2).map(r => ({ qs: r.qsTerm, body: r.bodyTerm, page: r.bodyPage })));
    const totals = [...new Set(OUT.resps.filter(r => r.vp === vpName).map(r => r.total))];
    assert(vpName, 'CRIT1-server-total-31-through-ui', totals.includes(31), totals);

    async function settledOrder(label) {
      await page.waitForTimeout(1200);
      const cards = await cardsInVisualOrder(page);
      OUT.orders[vpName + '.' + label] = cards;
      return cards;
    }
    async function pickOption(opt) {
      await scrollToTop(page);
      const opened = await L.clickBtn(page, 'Sort'); await page.waitForTimeout(650);
      const picked = await tapText(page, opt); await page.waitForTimeout(1500);
      return opened && picked;
    }

    // ---- CRIT2 sort menu enumerates all six ----
    await scrollToTop(page);
    const sortOpened = await L.clickBtn(page, 'Sort'); await page.waitForTimeout(700);
    T = await dumpText(page);
    const wantOpts = ['Relevance', 'Price: Low to High', 'Price: High to Low', 'Newest', 'Highest Rating', 'Trending'];
    const optSeen = {}; for (const o of wantOpts) optSeen[o] = T.includes(o);
    assert(vpName, 'CRIT2-sort-menu-all-six-options', sortOpened && Object.values(optSeen).every(Boolean), optSeen);
    await shot(page, vpName, '15-sort-menu-open');
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);

    // relevance baseline
    const relOrder = (await settledOrder('relevance')).map(c => c.widget);
    assert(vpName, 'CRIT2-baseline-relevance-newest-first-server-order',
      relOrder.length >= 25 && relOrder[0] >= relOrder[relOrder.length - 1],
      { first5: relOrder.slice(0, 5), last3: relOrder.slice(-3) });

    // Price Low->High
    await pickOption('Price: Low to High');
    const asc = await settledOrder('asc');
    assert(vpName, 'CRIT2-price-asc-monotonic', monotonicBy(asc.map(c => c.price), 1),
      asc.slice(0, 8).map(c => `${c.widget}:${c.price}`));

    // Price High->Low
    await pickOption('Price: High to Low');
    const desc = await settledOrder('desc');
    assert(vpName, 'CRIT2-price-desc-monotonic-and-reversed',
      monotonicBy(desc.map(c => c.price), -1) &&
        desc[0].widget === asc[asc.length - 1].widget,
      { first: `${desc[0].widget}:${desc[0].price}`, ascLast: `${asc[asc.length - 1].widget}:${asc[asc.length - 1].price}` });
    await shot(page, vpName, '22-price-desc');

    // Trending (clickCount desc)
    await pickOption('Trending');
    const trend = await settledOrder('trending');
    const tcc = trend.map(c => CC[c.widget]).filter(x => x !== undefined);
    assert(vpName, 'CRIT2-trending-orders-clickcount-desc',
      tcc[0] === 238 && monotonicBy(tcc, -1),
      { first6: trend.slice(0, 6).map(c => `${c.widget}(cc${CC[c.widget]})`) });
    await shot(page, vpName, '25-trending-order');

    // Highest Rating: only widget 0 has rating 0.0
    await pickOption('Highest Rating');
    const rated = await settledOrder('rating');
    const rw = rated.map(c => c.widget);
    assert(vpName, 'CRIT2-highest-rating-widget0-last',
      rw.length >= 25 && rw[rw.length - 1] === 0 && !rw.slice(0, Math.ceil(rw.length / 2)).includes(0),
      { last3: rw.slice(-3), firstHalfHasWidget0: rw.slice(0, Math.ceil(rw.length / 2)).includes(0) });
    await shot(page, vpName, '28-rating-order');

    // Newest
    await pickOption('Newest');
    const newest = await settledOrder('newest');
    const nw = newest.map(c => c.widget);
    assert(vpName, 'CRIT2-newest-top-is-latest-fixtures', nw.slice(0, 5).some(w => w >= 27), nw.slice(0, 5));
    await shot(page, vpName, '30-newest-order');

    // observable reorder across options
    const sig = arr => arr.slice(0, 10).join(',');
    assert(vpName, 'CRIT2-options-observably-reorder',
      new Set([sig(relOrder), sig(asc.map(c => c.widget)), sig(desc.map(c => c.widget)),
        sig(trend.map(c => c.widget)), sig(nw)]).size === 5,
      { distinctTop10Signatures: new Set([sig(relOrder), sig(asc.map(c => c.widget)), sig(desc.map(c => c.widget)), sig(trend.map(c => c.widget)), sig(nw)]).size });

    await pickOption('Relevance'); await page.waitForTimeout(800);

    // ---- CRIT3 zero-result -> one trackSearch ~2s AFTER EMPTY SETTLE ----
    const tsBefore = OUT.trackSearchCalls.filter(c => c.vp === vpName).length;
    await scrollToTop(page);
    await clearAndType(page, ZERO_TERM);
    let emptyAt = null;
    for (let i = 0; i < 48; i++) {
      await page.waitForTimeout(250);
      if ((await dumpText(page)).includes('No results found.')) { emptyAt = Date.now(); break; }
    }
    assert(vpName, 'CRIT3-empty-state-shown', emptyAt !== null, emptyAt ? 'after-' + (emptyAt % 100000) + 'ms' : 'never');
    await page.waitForTimeout(3500);   // ride past the 2s settle
    T = await dumpText(page);
    assert(vpName, 'CRIT3-empty-state-persists-after-settle', T.includes('No results found.'),
      T.split('\n').filter(l => /results/i.test(l)).slice(0, 2));
    await shot(page, vpName, '35-zero-results');
    const tsAfter = OUT.trackSearchCalls.filter(c => c.vp === vpName);
    const call = tsAfter[tsAfter.length - 1];
    assert(vpName, 'CRIT3-tracksearch-exactly-once-per-miss', tsAfter.length - tsBefore === 1,
      tsAfter.slice(tsBefore).map(c => ({ body: c.trackSearchBody, qs: c.trackSearchQS, size: c.bodySize, term: c.bodyTerm })));
    const lagAfterEmpty = emptyAt && call ? call.ts - emptyAt : null;
    assert(vpName, 'CRIT3-tracksearch-fires-about-2s-after-settle',
      lagAfterEmpty !== null && lagAfterEmpty >= 1200 && lagAfterEmpty <= 6000,
      { msAfterEmptyDetected: lagAfterEmpty, size: call && call.bodySize, term: call && call.bodyTerm });
    OUT.timings.push({ vp: vpName, emptyAt, callTs: call && call.ts, lagAfterEmpty });

    // ---- CRIT4 request-board suggestion on empty results ----
    assert(vpName, 'CRIT4-request-board-suggestion-rendered',
      T.includes("We couldn't find") && T.includes('Request Board'),
      { couldnFind: T.includes("We couldn't find"), requestBoard: T.includes('Request Board'),
        domLines: T.split('\n').filter(l => /couldn|request/i.test(l)).slice(0, 3) });
    await shot(page, vpName, '37-zero-results-settled');

    // ---- restore fixture query ----
    await clearAndType(page, TOKEN);
    await L.waitText(page, 'Probe Widget', 25000).catch(() => {});
    await page.waitForTimeout(2200);
    await scrollToTop(page);

    // ---- C4 CLICK EVERY CONTROL ----
    const ctrls = await listControls(page);
    OUT.clicks.push({ vp: vpName, controls: ctrls });
    const dead = ctrls.filter(c => c.disabled);
    assert(vpName, 'CLICK-no-disabled-controls-or-reasoned', dead.length === 0, dead);

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

  // ---------- images ----------
  const vals = Object.values(OUT.images);
  OUT.imagesSummary = { requested: vals.length, ok200: vals.filter(s => s === 200 || s === 304).length,
    brokenUrls: Object.keys(OUT.images).filter(u => OUT.images[u] >= 400) };
  assert('meta', 'C-images-all-200', OUT.imagesSummary.requested > 0 &&
    OUT.imagesSummary.ok200 === OUT.imagesSummary.requested, OUT.imagesSummary);

  fs.mkdirSync(`${ROOT}/e2e/results/shards`, { recursive: true });
  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-048-${STAGE}.json`, JSON.stringify(OUT, null, 1));
  log(`DONE asserts pass=${OUT.asserts.filter(a => a.pass).length} fail=${OUT.asserts.filter(a => !a.pass).length}`);
  console.log(JSON.stringify(OUT.asserts.filter(a => !a.pass), null, 1));
})().catch(e => { console.error('HARNESS FAILED', e); process.exit(1); });
