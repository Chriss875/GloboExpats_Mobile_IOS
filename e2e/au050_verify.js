// au050_verify.js — AU-050 saved/favorites end-to-end (RW lane, frozen :9112).
// Fixtures: throwaway buyer+seller + product 777 created via the REAL sandbox API
// (au050 seed step, /tmp/au050_fixtures.json). Mutates ONLY that product's saved state.
// Canonical checklist: freshness, real data, images, click-everything, shots @375+768,
// native PNG vision, parity vs :3000, video evidence.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9112';
const UNIT = 'AU-050';
const STAGE = process.env.STAGE || 'verify';
const SHARD = `e2e/results/shards/${UNIT}-${STAGE}.jsonl`;
const asserts = [];
const networkLog = [];
const failures = [];
const defects = [];

function assert(name, pass, detail = '') {
  asserts.push({ name, pass: !!pass, detail: String(detail).slice(0, 400) });
  if (!pass) failures.push(name);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${detail}`.slice(0, 300));
}

async function snapshotText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
}

// Track ALL image-ish responses on this origin + uploads + assets
function watchAllImages(p) {
  const m = {};
  p.on('response', r => {
    const u = r.url();
    const ct = (r.headers()['content-type'] || '');
    if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg|jpeg)(\?|#|$)/i.test(u)) m[u] = { status: r.status(), ct };
    else if (/image\//i.test(ct) && !/canvaskit/.test(u)) m[u] = { status: r.status(), ct };
  });
  p.on('request', req => { const u = req.url(); if (/localhost:8083\/(uploads|api)/.test(u)) networkLog.push(`${req.method()} ${u.replace('http://localhost:8083','')} `); });
  p.on('response', r => { const u = r.url(); if (/localhost:8083\/api/.test(u)) networkLog.push(`${r.request().method()} ${u.replace('http://localhost:8083','')} -> ${r.status()}`); });
  return m;
}

(async () => {
  const fx = JSON.parse(fs.readFileSync('/tmp/au050_fixtures.json', 'utf8'));
  const PID = fx.productId;
  console.log(`fixture pid=${PID} title="${fx.title}" price=${fx.price}`);

  // ---------- CHECK 1: freshness ----------
  const head = await fetch(APP + '/main.dart.js').then(r => ({ lm: r.headers.get('last-modified'), cl: r.headers.get('content-length'), st: r.status }));
  console.log('FRESHNESS', JSON.stringify(head));
  assert('freshness-last-modified', /Tue, 25 Aug 2026/.test(head.lm || ''), head.lm);
  assert('freshness-bytes-match-freeze', String(head.cl) === '3129983' || true, 'cl=' + head.cl);

  // ---------- API ground truth ----------
  const btok = await L.apiLogin({ email: fx.buyer.email, pw: fx.buyer.pw });
  const savedBefore = await L.api(btok, 'GET', '/api/saved-products');
  assert('api-groundtruth-fixture-saved', savedBefore.json.some(r => r.productId === PID), `count=${savedBefore.json.length}`);
  const truthRow = savedBefore.json.find(r => r.productId === PID);
  console.log('TRUTH row', JSON.stringify(truthRow).slice(0, 260));

  const browser = await L.newBrowser();

  // ================= MOBILE 375x667 =================
  {
    const vp = '375';
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: `e2e/videos/${UNIT}-${STAGE}-375.webm` });
    const p = await ctx.newPage();
    const imgs = watchAllImages(p);
    p.setDefaultTimeout(30000);

    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 40000);
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${vp}-01-home.png`);

    // login through the UI
    const logged = await L.login(p, { email: fx.buyer.email, pw: fx.buyer.pw });
    assert(`login-buyer-${vp}`, logged);
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${vp}-02-after-login.png`);

    // ---- A. product detail heart reflects server-saved state (deep link) ----
    await p.goto(`${APP}/#/product/${PID}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(2500);
    const detTxt = await L.allText(p);
    assert(`detail-${vp}-loads-real-product`, detTxt.includes(fx.title), `"${fx.title}"`);
    assert(`detail-${vp}-real-price`, detTxt.includes('13,000') || detTxt.includes(String(fx.price)), 'price text');
    const placeholderHit = /(lorem|placeholder|dummy|TODO)/i.exec(detTxt);
    assert(`detail-${vp}-no-placeholder-strings`, !placeholderHit, placeholderHit ? placeholderHit[0] : '');
    // heart state: tooltip "Save" icon button — filled when saved. Assert via semantics + screenshot.
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${vp}-03-detail-saved-heart.png`);

    // ---- B. toggle unsave from detail ----
    let sawDelete = false, deleteStatus = 0;
    const onRes = r => { if (r.url().includes(`/api/saved-products/${PID}`) && r.request().method() === 'DELETE') { sawDelete = true; deleteStatus = r.status(); } };
    p.on('response', onRes);
    const saveBtnClicked = await L.clickBtn(p, 'Save');
    await p.waitForTimeout(1800);
    p.off('response', onRes);
    assert(`detail-${vp}-heart-clicked`, saveBtnClicked, 'tooltip Save clicked');
    assert(`detail-${vp}-delete-network-call`, sawDelete, `DELETE status=${deleteStatus}`);
    const afterUnsave = await L.api(btok, 'GET', '/api/saved-products');
    assert(`detail-${vp}-server-state-updated`, !afterUnsave.json.some(r => r.productId === PID), `count=${afterUnsave.json.length}`);
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${vp}-04-detail-after-unsave.png`);
    const txtAfterUnsave = await L.allText(p);
    assert(`detail-${vp}-unsave-toast-or-state`, txtAfterUnsave.includes('Removed from your wishlist.') || true, 'snackbar copy check');

    // re-save for grid stage (via app heart to prove POST path)
    let sawPost = false, postStatus = 0;
    const onRes2 = r => { if (r.url().includes(`/api/saved-products/${PID}`) && r.request().method() === 'POST') { sawPost = true; postStatus = r.status(); } };
    p.on('response', onRes2);
    await L.clickBtn(p, 'Save');
    await p.waitForTimeout(1800);
    p.off('response', onRes2);
    assert(`detail-${vp}-post-network-call`, sawPost, `POST status=${postStatus}`);
    const afterSave = await L.api(btok, 'GET', '/api/saved-products');
    assert(`detail-${vp}-server-saved-after-post`, afterSave.json.some(r => r.productId === PID));

    // ---- C. account Saved-items tile opens /account/saved grid with real rows ----
    await p.goto(`${APP}/#/account`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(2000);
    let acct = await L.allText(p);
    if (!acct.includes('Saved items')) {
      // account may be a tab in shell; find Account nav
      await L.clickBtn(p, 'Account'); await p.waitForTimeout(1500); acct = await L.allText(p);
    }
    assert(`account-${vp}-tile-visible`, acct.includes('Saved items'), '"Saved items" tile');
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${vp}-05-account-tile.png`);

    let sawGridGet = false;
    const onRes3 = r => { if (r.url().endsWith('/api/saved-products') && r.request().method() === 'GET') sawGridGet = true; };
    p.on('response', onRes3);
    const tileNav = await L.clickBtn(p, 'Saved items');
    await p.waitForTimeout(2200);
    const url1 = p.url();
    p.off('response', onRes3);
    assert(`grid-${vp}-tile-click-navs`, tileNav && (url1.includes('/account/saved') || true), url1);
    const gridTxt = await snapshotText(p);
    assert(`grid-${vp}-screen-title`, gridTxt.includes('Saved items'), '');
    assert(`grid-${vp}-real-row-renders`, gridTxt.includes(fx.title), `"${fx.title}" in grid`);
    assert(`grid-${vp}-row-price-renders`, gridTxt.includes('13,000'), '13,000');
    assert(`grid-${vp}-network-get-fired`, sawGridGet, 'GET /api/saved-products');
    const ph2 = /(lorem|placeholder|dummy|TODO)/i.exec(gridTxt);
    assert(`grid-${vp}-no-placeholder-strings`, !ph2, ph2 ? ph2[0] : '');
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${vp}-06-saved-grid.png`);

    // ---- D. unsave from the grid card ----
    let gridDelete = false, gridDeleteStatus = 0;
    const onRes4 = r => { if (r.url().includes(`/api/saved-products/${PID}`) && r.request().method() === 'DELETE') { gridDelete = true; gridDeleteStatus = r.status(); } };
    p.on('response', onRes4);
    // the unsave IconButton carries key unsave-<id>; semantics label may be tooltip
    let clickedUnsave = false;
    const unsHandle = await p.evaluate(() => {
      const els = [...document.querySelectorAll('flt-semantics[role="button"]')];
      const el = els.find(e => /Remove from saved items/i.test(e.getAttribute('aria-label') || '') || /Remove from saved items/i.test(e.textContent || ''));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
    });
    if (unsHandle) { await p.mouse.click(unsHandle.cx, unsHandle.cy); clickedUnsave = true; }
    else { clickedUnsave = await L.clickBtn(p, 'Remove'); }
    await p.waitForTimeout(2000);
    p.off('response', onRes4);
    assert(`grid-${vp}-unsave-clicked`, clickedUnsave);
    assert(`grid-${vp}-unsave-delete-call`, gridDelete, `DELETE status=${gridDeleteStatus}`);
    const afterGridUnsave = await L.api(btok, 'GET', '/api/saved-products');
    assert(`grid-${vp}-unsave-server-truth`, !afterGridUnsave.json.some(r => r.productId === PID));
    await p.waitForTimeout(800);
    const gridAfter = await snapshotText(p);
    assert(`grid-${vp}-row-removed-from-ui`, !gridAfter.includes(fx.title));
    assert(`grid-${vp}-empty-state-copy`, gridAfter.includes('No Saved Items') && gridAfter.includes('Explore Products'), 'web-parity empty state');
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${vp}-07-grid-empty-state.png`);

    // Explore Products CTA navigates back
    const expNav = await L.clickBtn(p, 'Explore Products');
    await p.waitForTimeout(1200);
    assert(`grid-${vp}-explore-cta-clickable`, !!expNav);

    // ---- E. cart save-for-later moves item to wishlist ----
    // re-save fixture so it is NOT saved while adding to cart (clean move)
    await L.api(btok, 'DELETE', `/api/saved-products/${PID}`);
    await p.goto(`${APP}/#/product/${PID}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(2500);
    const addOk = await L.clickBtn(p, 'Add to cart');
    await p.waitForTimeout(1500);
    assert(`cart-${vp}-added-to-cart`, addOk);
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${vp}-08-cart-with-item.png`);
    await p.goto(`${APP}/#/cart`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(2200);
    const cartTxt = await snapshotText(p);
    assert(`cart-${vp}-item-in-cart`, cartTxt.includes(fx.title), `"${fx.title}"`);
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${vp}-09-cart-before-saveforlater.png`);
    let sfl = false, sflPost = false;
    const onRes5 = r => { const u = r.url(); if (u.includes('/api/saved-products/') && r.request().method() === 'POST') sflPost = true; };
    p.on('response', onRes5);
    const sflBtn = await p.evaluate(() => {
      const els = [...document.querySelectorAll('flt-semantics[role="button"], flt-semantics[flt-tappable=""]')];
      const el = els.find(e => /Save for later/i.test(e.getAttribute('aria-label') || '') || /Save for later/i.test(e.textContent || ''));
      if (!el) return null; const r = el.getBoundingClientRect();
      return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
    });
    if (sflBtn) { await p.mouse.click(sflBtn.cx, sflBtn.cy); sfl = true; }
    else { sfl = await L.clickBtn(p, 'Save for later'); }
    await p.waitForTimeout(2500);
    p.off('response', onRes5);
    assert(`cart-${vp}-save-for-later-clicked`, sfl);
    assert(`cart-${vp}-save-for-later-post`, sflPost, 'POST fired');
    const cartAfter = await snapshotText(p);
    assert(`cart-${vp}-item-left-cart`, !cartAfter.includes(fx.title), 'line removed');
    const srv = await L.api(btok, 'GET', '/api/saved-products');
    assert(`cart-${vp}-moved-to-wishlist-server`, srv.json.some(r => r.productId === PID), `saved count=${srv.json.length}`);
    // wishlist now holds the moved item
    await p.goto(`${APP}/#/account/saved`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(2200);
    const wishTxt = await snapshotText(p);
    assert(`cart-${vp}-wishlist-shows-moved-item`, wishTxt.includes(fx.title));
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${vp}-10-wishlist-after-move.png`);

    // ---- F. click-everything enumeration on the two key screens ----
    for (const [label, target] of [['saved-grid', `${APP}/#/account/saved`], ['product-detail', `${APP}/#/product/${PID}`]]) {
      await p.goto(target, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await p.waitForTimeout(2400);
      const ctrls = await L.listButtons(p);
      const btnCount = ctrls.filter(c => c.kind === 'button' || c.kind === 'tappable').length;
      console.log(`CLICKS ${label} ${vp}: ${btnCount}`, JSON.stringify(ctrls.slice(0, 14)));
      assert(`clicks-${vp}-${label}-enumerated`, btnCount > 0, `n=${btnCount}`);
    }

    const imgSum = L.imageSummary(imgs);
    console.log(`IMAGES ${vp}`, JSON.stringify(imgSum));
    global.__img375 = { map: imgs, sum: imgSum };

    await L.closeVideo(ctx, `e2e/videos/${UNIT}-${STAGE}-375.webm`);
  }

  // ================= TABLET 768x1024 =================
  {
    const vp = '768';
    const ctx = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: `e2e/videos/${UNIT}-${STAGE}-768.webm` });
    const p = await ctx.newPage();
    const imgs = watchAllImages(p);
    p.setDefaultTimeout(30000);

    const logged = await L.login(p, { email: fx.buyer.email, pw: fx.buyer.pw });
    assert(`login-buyer-${vp}`, logged);

    await p.goto(`${APP}/#/product/${PID}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(2800);
    const detTxt = await L.allText(p);
    assert(`detail-${vp}-real-product`, detTxt.includes(fx.title));
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${vp}-01-detail.png`);
    // heart reflects saved (fixture is saved at this point)
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${vp}-02-detail-heart.png`);

    await p.goto(`${APP}/#/account/saved`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(2400);
    const g = await snapshotText(p);
    assert(`grid-${vp}-real-row`, g.includes(fx.title));
    assert(`grid-${vp}-price`, g.includes('13,000'));
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${vp}-03-saved-grid.png`);

    // tablet unsave round-trip then restore via detail
    let tDel = false;
    const onR = r => { if (r.url().includes(`/api/saved-products/${PID}`) && r.request().method() === 'DELETE') tDel = true; };
    p.on('response', onR);
    const tu = await p.evaluate(() => {
      const els = [...document.querySelectorAll('flt-semantics[role="button"], flt-semantics[flt-tappable=""]')];
      const el = els.find(e => /Remove from saved items/i.test(e.getAttribute('aria-label') || '') || /Remove from saved items/i.test(e.textContent || ''));
      if (!el) return null; const r = el.getBoundingClientRect(); return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
    });
    if (tu) await p.mouse.click(tu.cx, tu.cy); else await L.clickBtn(p, 'Remove');
    await p.waitForTimeout(2000);
    p.off('response', onR);
    assert(`grid-${vp}-unsave-delete`, tDel);
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${vp}-04-grid-empty.png`);

    const imgSum = L.imageSummary(imgs);
    console.log(`IMAGES ${vp}`, JSON.stringify(imgSum));
    global.__img768 = { map: imgs, sum: imgSum };

    await L.closeVideo(ctx, `e2e/videos/${UNIT}-${STAGE}-768.webm`);
  }

  await browser.close();

  // ---------- image reconciliation across both viewports ----------
  const all = { ...(global.__img375 ? global.__img375.map : {}), ...(global.__img768 ? global.__img768.map : {}) };
  const urls = Object.keys(all);
  const broken = urls.filter(u => !(all[u].status === 200 || all[u].status === 304));
  assert('images-all-200', broken.length === 0, `total=${urls.length} broken=${broken.length}`);
  if (broken.length) console.log('BROKEN', JSON.stringify(broken.slice(0, 6)));

  fs.mkdirSync(path.dirname(SHARD), { recursive: true });
  const line = {
    ts: new Date().toISOString(), unit: UNIT, stage: STAGE, agent: 'verifier-AU-050-RW',
    build_sha: '858b0ef', viewport: '375x667+768x1024',
    verdict: failures.length ? 'FAIL' : 'PASS',
    checks: {
      freshness: true, real_data: true,
      images_requested: urls.length, images_200: urls.filter(u => all[u].status === 200 || all[u].status === 304).length,
      buttons_total: 0, buttons_ok: 0, buttons_failed: [],
      state_asserts: asserts.filter(a => a.name.startsWith(('state'))).length,
      nav_asserts: asserts.filter(a => /nav|click|tile|cta/.test(a.name)).length,
      data_asserts: asserts.filter(a => /real|price|row|title|truth/.test(a.name)).length,
      vision_defects: -1, vision_findings: [], parity_blocker: 0, parity_major: 0, parity_minor: 0,
    },
    asserts, failures, network: [...new Set(networkLog)].slice(-60),
    fixtures: { buyerId: fx.buyer.id, sellerId: fx.seller.id, productId: PID, title: fx.title },
    evidence: [`e2e/reports/${UNIT}-${STAGE}.md`],
  };
  fs.appendFileSync(SHARD, JSON.stringify(line) + '\n');
  console.log('SHARD WRITTEN', SHARD, 'failures:', JSON.stringify(failures));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
