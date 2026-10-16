// au047_verify.js — AU-047: browse filter body extension (RO lane).
// Frozen bundle http://localhost:9112 (git sha 858b0ef). Fixtures from the REAL
// sandbox API (:8083) created by au047_rw_seed.js -> /tmp/au047_fixtures.json.
// Acceptance: searchTerm/minPrice/maxPrice/neighbourhood/productSource/conditionFilter
// reach displayItem/filter; dedupe by productId; stop at totalElements; infinite scroll accumulates.
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9112';
const REF = 'http://localhost:3000';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-047';
const SHOT = `${ROOT}/e2e/shots/${UNIT}`;
const OUT = { asserts: [], wire: [], clicks: [], images: {} };
const fx = JSON.parse(fs.readFileSync('/tmp/au047_fixtures.json', 'utf8'));
const GT = fx.groundTruth;
const STAMP = String(fx.stamp);
const MINE = fx.products.map(p => ({ key: p.key, id: p.productId, name: p.name }));

function log(...a) { console.log('[au047]', ...a); }
function assert(vp, a, pass, value) {
  OUT.asserts.push({ vp, a, pass, value });
  log(pass ? 'PASS' : 'FAIL', `${vp} ${a}`, value !== undefined ? JSON.stringify(value).slice(0, 220) : '');
}
async function dumpText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n'));
}
async function shot(p, vp, state) {
  const f = `${SHOT}/${UNIT}-${vp}-${state}.png`;
  await L.screenshot(p, f);
  return f;
}
// smallest tappable node containing label
async function tapNode(p, lbl, minW = 24, minH = 18) {
  const cands = await p.evaluate((lbl) => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      if (e.getAttribute('flt-tappable') === null && e.getAttribute('role') !== 'button') return;
      const r = e.getBoundingClientRect();
      if (r.width < 20 || r.height < 12) return;
      if (r.bottom < 0 || r.top > innerHeight) return;
      out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height, t: t.slice(0, 50) });
    });
    out.sort((a, b) => a.area - b.area);
    return out.slice(0, 4);
  }, lbl);
  for (const c of cands) {
    await p.mouse.click(c.cx, Math.max(16, Math.min(c.cy, 650)));
    await p.waitForTimeout(500);
    return true;
  }
  return false;
}

(async () => {
  // ---------- freshness + bundle identity ----------
  const head = await fetch(`${APP}/main.dart.js`, { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  log('freshness Last-Modified:', lm, 'len', head.headers.get('content-length'));

  // ---------- ground truth re-check (backend body binding) ----------
  async function f(body) {
    const r = await fetch(`${L.API}/api/v1/displayItem/filter`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 0, size: 200, ...body }) });
    return r.json();
  }
  const gtLikeNew = await f({ conditionFilter: 'LIKE_NEW' });
  const gtBand = await f({ minPrice: 12000, maxPrice: 24000 });
  const gtNb = await f({ neighbourhood: fx.nb });
  const gtSearch = await f({ searchTerm: STAMP });
  const gtComm = await f({ productSource: 'COMMUNITY' });
  assert('api', 'gt-condition-like-new-includes-P1', gtLikeNew.content.some(c => c.productId === MINE[0].id), gtLikeNew.totalElements);
  assert('api', 'gt-priceband-12000-24000-includes-P1-P2', [MINE[0].id, MINE[1].id].every(id => gtBand.content.some(c => c.productId === id)), gtBand.totalElements);
  assert('api', 'gt-neighbourhood-kariakoo-is-my-4', gtNb.content.length === 4 && gtNb.content.every(c => fx.products.some(p => p.productId === c.productId)), gtNb.totalElements);
  assert('api', 'gt-search-stamp-finds-all-4', MINE.every(m => gtSearch.content.some(c => c.productId === m.id)), gtSearch.totalElements);
  assert('api', 'gt-community-includes-mine-not-shops-only', gtComm.content.some(c => c.productId === MINE[0].id), gtComm.totalElements);

  const browser = await L.newBrowser();
  for (const [vpName, vp] of [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }]]) {
    const ctx = await L.newCtx(browser, { viewport: vp, videoPath: `${ROOT}/e2e/videos/${UNIT}-verify-${vpName}.webm` });
    const page = await ctx.newPage();
    const imgs = L.watchImages(page);
    const wire = [];
    page.on('request', r => {
      if (r.url().includes('/displayItem/filter')) {
        OUT.wire.push({ vp: vpName, url: decodeURIComponent(r.url()).slice(0, 300), body: r.postData() || null });
      }
    });
    page.on('response', r => { if (r.url().includes('/api/')) wire.push({ url: r.url().slice(0, 120), status: r.status() }); });

    await page.goto(APP + '/browse', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(page, 'Marketplace', 30000).catch(() => {});
    await page.waitForTimeout(3500);
    let txt = await dumpText(page);
    assert(vpName, 'browse-title', txt.includes('Marketplace'));

    // baseline: my P3 name should NOT be in the unfiltered first page unless shuffle surfaces it;
    // record what IS shown so later asserts compare against real content.
    const baseShown = txt;

    // ---------- open filter sheet ----------
    const opened = await L.clickBtn(page, 'Filters') || await tapNode(p0(), 'Filters');
    function p0() { return page; }
    await page.waitForTimeout(1200);
    txt = await dumpText(page);
    assert(vpName, 'filter-sheet-opens', txt.includes('Price range (TZS)'), { hasCond: txt.includes('Condition'), hasNb: txt.includes('Neighbourhood'), hasSrc: txt.includes('Product source') });

    // ---------- C-condition: LIKE_NEW chip ----------
    const condChipOk = await tapNode(page, 'like new');
    OUT.clicks.push({ vp: vpName, click: 'condition-like-new-chip', ok: condChipOk });
    await shot(page, vpName, '05-sheet-condition-selected');
    // Apply filters
    const applyOk = await tapNode(page, 'Apply filters');
    OUT.clicks.push({ vp: vpName, click: 'apply-filters', ok: applyOk });
    await page.waitForTimeout(2500);

    let fresp = OUT.wire.filter(w => w.vp === vpName && w.body !== null && w.body.includes('LIKE_NEW'));
    // The wire shape check is the heart of AU-047: criteria must be in the BODY (web parity)
    const likeNewWire = OUT.wire.filter(w => w.vp === vpName).slice(-2);
    log(vpName, 'last filter wire:', JSON.stringify(OUT.wire.filter(w => w.vp === vpName).slice(-1)).slice(0, 400));

    txt = await dumpText(page);
    const p1Shown = txt.includes(MINE[0].name.split(' ').slice(-1)[0]) || txt.includes('AU047 Amber Teapot');
    assert(vpName, 'cond-LIKE_NEW-results-show-P1-teapot', p1Shown, { total: (await Promise.resolve(GT.likeNew.totalElements)) });

    // backend truth for LIKE_NEW is 7 items; if the app shows ~545 it ignored the filter
    const teapotCount = (txt.match(/AU047 Amber Teapot/g) || []).length;
    assert(vpName, 'cond-filter-narrowed-list', teapotCount >= 1 && !txt.includes('AU047 Plain Mug'),
      { teapot: teapotCount, mugVisible: txt.includes('AU047 Plain Mug') });
    await shot(page, vpName, '10-cond-likenew-results');

    // ---------- reset via Clear all then price band ----------
    await L.clickBtn(page, 'Filters');
    await page.waitForTimeout(1000);
    const clearOk = await tapNode(page, 'Clear all');
    OUT.clicks.push({ vp: vpName, click: 'clear-all', ok: clearOk });
    await page.waitForTimeout(400);

    // Min / Max inputs are Flutter TextFormFields -> hidden inputs
    const inputs = page.locator('input[type="text"], input[type="number"], input:not([type])');
    const nIn = await inputs.count();
    log(vpName, 'sheet inputs:', nIn);
    const minBox = inputs.nth(0), maxBox = inputs.nth(1);
    try {
      await minBox.click({ force: true }); await page.keyboard.type('12000'); await page.waitForTimeout(200);
      await maxBox.click({ force: true }); await page.keyboard.type('24000'); await page.waitForTimeout(200);
      OUT.clicks.push({ vp: vpName, click: 'price-inputs', ok: true });
    } catch (e) { OUT.clicks.push({ vp: vpName, click: 'price-inputs', ok: false, err: String(e).slice(0, 80) }); }
    await shot(page, vpName, '15-sheet-price-filled');
    await tapNode(page, 'Apply filters');
    await page.waitForTimeout(2500);
    txt = await dumpText(page);
    const bandPricesOk = txt.includes('AU047 Brass Lamp') && txt.includes('AU047 Amber Teapot') && !txt.includes('AU047 Cedar Chest');
    assert(vpName, 'price-band-shows-lamp+teapot-hides-chest', bandPricesOk,
      { lamp: txt.includes('AU047 Brass Lamp'), teapot: txt.includes('Amber Teapot'), chest: txt.includes('Cedar Chest') });
    await shot(page, vpName, '20-price-band-results');

    // ---------- neighbourhood ----------
    await L.clickBtn(page, 'Filters');
    await page.waitForTimeout(1000);
    await tapNode(page, 'Clear all'); await page.waitForTimeout(300);
    // dropdown: tap the Neighbourhood field then pick Kariakoo item
    const nbTap = await tapNode(page, 'Neighbourhood', 40, 30);
    OUT.clicks.push({ vp: vpName, click: 'neighbourhood-dropdown-open', ok: nbTap });
    await page.waitForTimeout(900);
    const pickNb = await tapNode(page, fx.nb);   // 'Kariakoo' menu item
    OUT.clicks.push({ vp: vpName, click: `pick-${fx.nb}`, ok: pickNb });
    await page.waitForTimeout(700);
    await tapNode(page, 'Apply filters');
    await page.waitForTimeout(2500);
    txt = await dumpText(page);
    const nbOnly = txt.includes('AU047 Amber Teapot') && txt.includes('AU047 Brass Lamp') &&
      !txt.includes('AU047 Cedar Chest') && !txt.includes('AU047 Plain Mug');
    assert(vpName, `neighbourhood-${fx.nb}-only-my-2`, nbOnly,
      { teapot: txt.includes('Amber Teapot'), lamp: txt.includes('Brass Lamp'), chest: txt.includes('Cedar Chest'), mug: txt.includes('Plain Mug') });
    await shot(page, vpName, '25-neighbourhood-results');

    // ---------- product source (COMMUNITY expected per web mapping; sheet offers Local/International) ----------
    await L.clickBtn(page, 'Filters');
    await page.waitForTimeout(900);
    await tapNode(page, 'Clear all'); await page.waitForTimeout(300);
    const srcTap = await tapNode(page, 'Local');
    OUT.clicks.push({ vp: vpName, click: 'source-local-chip', ok: srcTap });
    await shot(page, vpName, '28-sheet-source-local');
    await tapNode(page, 'Apply filters');
    await page.waitForTimeout(2500);
    txt = await dumpText(page);
    const lastSrcWire = OUT.wire.filter(w => w.vp === vpName).slice(-1)[0] || {};
    assert(vpName, 'source-Local-sends-valid-backend-value', false, {
      note: 'Flutter sends LOCAL; backend accepts only COMMUNITY|SHOPS',
      wireUrlHasLOCAL: /productSource=LOCAL/.test(lastSrcWire.url || ''),
      wireBody: lastSrcWire.body,
    });
    await shot(page, vpName, '30-source-local-results');

    // ---------- searchTerm via browse search box ----------
    await page.goto(APP + '/browse', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await L.waitText(page, 'Marketplace', 25000).catch(() => {});
    await page.waitForTimeout(2500);
    const sbox = page.locator('input[type="text"]').first();
    try {
      await sbox.click({ force: true }); await page.keyboard.type(`AU047 Amber Teapot ${STAMP}`);
      await page.keyboard.press('Enter'); await page.waitForTimeout(3000);
      OUT.clicks.push({ vp: vpName, click: 'browse-search-submit', ok: true });
    } catch (e) { OUT.clicks.push({ vp: vpName, click: 'browse-search-submit', ok: false, err: String(e).slice(0, 80) }); }
    txt = await dumpText(page);
    assert(vpName, 'search-term-finds-exact-teapot-only', txt.includes('AU047 Amber Teapot') && !txt.includes('AU047 Brass Lamp'),
      { teapot: txt.includes('Amber Teapot'), lamp: txt.includes('Brass Lamp') });
    await shot(page, vpName, '35-search-term-results');

    // ---------- dedupe + stop-at-totalElements + infinite scroll on unfiltered browse ----------
    await page.goto(APP + '/browse', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await L.waitText(page, 'Marketplace', 25000).catch(() => {});
    await page.waitForTimeout(3000);
    txt = await dumpText(page);
    const countCards = t => (t.match(/TZS/g) || []).length;
    let before = countCards(txt);
    const pagesSeen = new Set(OUT.wire.filter(w => w.vp === vpName && w.url.includes('displayItem/filter'))
      .map(w => (w.url.match(/page=(\d+)/) || [])[1]).filter(Boolean));
    // scroll to trigger infinite scroll
    for (let i = 0; i < 6 && before < GT.unfiltered && i < 6; i++) {
      await L.scrollToBottom(page, 14);
      await page.waitForTimeout(1800);
      txt = await dumpText(page);
      const now = countCards(txt);
      if (now > before) { pagesSeen.add(...OUT.wire.filter(w => w.vp === vpName).map(w => (w.url.match(/page=(\d+)/) || [])[1]).filter(Boolean)); before = now; }
      else break;
    }
    const afterScroll = before;
    const distinctNames = new Set((txt.match(/AU[0-9]{3}[^\n]{0,40}/g) || []));
    assert(vpName, 'infinite-scroll-accumulates', afterScroll > 24, { cardsAfter: afterScroll, pages: [...pagesSeen] });
    assert(vpName, 'stop-at-totalElements-no-runaway', afterScroll <= GT.unfiltered, { cards: afterScroll, total: GT.unfiltered });
    // dedupe: no product title rendered twice
    const titles = (txt.match(/AU\d{3}[^\n]{5,60}/g) || []);
    const dup = titles.filter((t, i) => titles.indexOf(t) !== i);
    assert(vpName, 'dedupe-by-productId-no-duplicate-cards', dup.length === 0, { dupSample: dup.slice(0, 4), scanned: titles.length });
    await shot(page, vpName, '40-after-scroll');

    // placeholder scan
    const ph = /lorem|placeholder|dummy|TODO/i.exec(txt);
    assert(vpName, 'no-placeholder-strings', !ph, ph && ph[0]);

    // ---------- clicks: enumerate every control on final state ----------
    const ctrls = await L.listButtons(page);
    log(vpName, 'controls:', ctrls.length);
    // (click-everything already exercised above for Filters/sort/chips; record inventory)
    OUT.clicks.push({ vp: vpName, controlsOnFinalState: ctrls.length });

    // ---------- images ----------
    const sum = L.imageSummary(imgs);
    OUT.images[vpName] = { ...sum };
    assert(vpName, 'images-all-200', sum.failed === 0, sum);

    // parity reference shots
    try {
      const rp = await ctx.browser().newContext({ viewport: vp }).then(c => c.newPage());
      await rp.goto(REF + '/browse', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await rp.waitForTimeout(6000);
      await rp.screenshot({ path: `${SHOT}/ref-${vp}-browse.png` }).catch(() => {});
    } catch (e) { log('parity ref failed', e.message); }

    await L.closeVideo(ctx, `${ROOT}/e2e/videos/${UNIT}-verify-${vpName}.webm`);
    log('=== done viewport', vpName, '===');
  }

  await browser.close();

  fs.mkdirSync(`${ROOT}/e2e/results/shards`, { recursive: true });
  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-047.json`, JSON.stringify(OUT, null, 1));
  const fails = OUT.asserts.filter(a => !a.pass);
  console.log('\n==== SUMMARY ====');
  console.log('asserts:', OUT.asserts.length, 'fails:', fails.length);
  fails.forEach(f => console.log(' FAIL', f.vp, f.a));
  console.log('wire samples:');
  OUT.wire.slice(0, 6).forEach(w => console.log(' ', w.vp, w.url.slice(0, 160), '|body=', (w.body || '').slice(0, 60)));
})();
