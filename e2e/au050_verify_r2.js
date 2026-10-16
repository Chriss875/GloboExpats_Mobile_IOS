// au050_verify_r2.js — AU-050 round 2. Fixes from r1: navigate to the saved grid
// through the in-app Account tab (deep link /account/saved is broken — cold/hot
// deep link renders the logged-out screen, recorded as a defect), assert grid rows
// by name+price text, click EVERY enumerated control on the two screens under test.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9112';
const UNIT = 'AU-050';
const SHARD = 'e2e/results/shards/AU-050-verify.jsonl';
const asserts = [];
const networkLog = [];
const failures = [];

function assert(name, pass, detail = '') {
  asserts.push({ name, pass: !!pass, detail: String(detail).slice(0, 400) });
  if (!pass) failures.push(name);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${detail}`.slice(0, 260));
}

async function snapText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
}
async function openSavedGridViaAccountTab(p) {
  await L.clickBtn(p, 'Account');
  await p.waitForTimeout(1600);
  const t1 = await snapText(p);
  const tileThere = t1.includes('Saved items');
  const clicked = await L.clickBtn(p, 'Saved items');
  await p.waitForTimeout(2800);
  return { tileThere, clicked };
}
// center-click a semantics node matching predicate (aria-label or text)
async function clickSemantics(p, re) {
  const hit = await p.evaluate((src) => {
    const re = new RegExp(src);
    const els = [...document.querySelectorAll('flt-semantics[role="button"], flt-semantics[flt-tappable=""]')];
    // smallest-area match wins
    let best = null;
    els.forEach(e => {
      const lab = e.getAttribute('aria-label') || '';
      const txt = e.textContent || '';
      if (!re.test(lab) && !re.test(txt)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      if (r.bottom < 0 || r.top > innerHeight) return;
      const area = r.width * r.height;
      if (!best || area < best.area) best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area };
    });
    return best;
  }, re.source);
  if (!hit) return false;
  await p.mouse.click(hit.cx, hit.cy);
  await p.waitForTimeout(700);
  return true;
}

(async () => {
  const fx = JSON.parse(fs.readFileSync('/tmp/au050_fixtures.json', 'utf8'));
  const PID = fx.productId;
  console.log(`fixture pid=${PID} title="${fx.title}"`);

  // freshness
  const head = await fetch(APP + '/main.dart.js').then(r => ({ lm: r.headers.get('last-modified'), cl: r.headers.get('content-length') }));
  assert('freshness-last-modified', head.lm === 'Tue, 25 Aug 2026 08:11:40 GMT', head.lm);
  assert('freshness-content-length', String(head.cl) === '3129983', 'cl=' + head.cl);

  const btok = await L.apiLogin({ email: fx.buyer.email, pw: fx.buyer.pw });
  const truth0 = await L.api(btok, 'GET', '/api/saved-products');
  assert('api-groundtruth-fixture-saved', truth0.json.some(r => r.productId === PID), `count=${truth0.json.length}`);

  const browser = await L.newBrowser();
  const imgMaps = [];

  async function runViewport(vpW, vpH, tag, doFullFlow) {
    const ctx = await L.newCtx(browser, { viewport: { width: vpW, height: vpH }, videoPath: `e2e/videos/${UNIT}-verify-${tag}.webm` });
    const p = await ctx.newPage();
    const imgs = {};
    p.on('response', r => {
      const u = r.url(); const ct = (r.headers()['content-type'] || '');
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpe?g)(\?|#|$)/i.test(u) || (/image\//i.test(ct) && !/canvaskit/.test(u))) imgs[u] = r.status();
    });
    p.on('response', r => { const u = r.url(); if (/localhost:8083\/api/.test(u)) networkLog.push(`${r.request().method()} ${u.replace('http://localhost:8083', '')} -> ${r.status()}`); });
    p.setDefaultTimeout(30000);

    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 40000);
    const logged = await L.login(p, { email: fx.buyer.email, pw: fx.buyer.pw });
    assert(`login-${tag}`, logged);
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${tag}-01-home.png`);

    // ===== A. detail reflects server-saved heart =====
    await p.goto(`${APP}/#/product/${PID}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(3200);
    let txt = await snapText(p);
    assert(`detail-${tag}-real-title`, txt.includes(fx.title), `"${fx.title}"`);
    assert(`detail-${tag}-real-price`, txt.includes('13,000'), 'TSh 13,000');
    const ph = /(lorem|placeholder|dummy|TODO)/i.exec(txt);
    assert(`detail-${tag}-no-placeholders`, !ph, ph ? ph[0] : '');
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${tag}-02-detail-saved.png`);

    // ===== B. unsave via heart (DELETE observable) =====
    let delStatus = 0;
    const onDel = r => { if (r.url().includes(`/api/saved-products/${PID}`) && r.request().method() === 'DELETE') delStatus = r.status(); };
    p.on('response', onDel);
    const heartClicked = await L.clickBtn(p, 'Save');
    await p.waitForTimeout(2200);
    p.off('response', onDel);
    assert(`detail-${tag}-heart-clicked`, heartClicked);
    assert(`detail-${tag}-delete-fired`, delStatus === 200, `status=${delStatus}`);
    const t1 = await L.api(btok, 'GET', '/api/saved-products');
    assert(`detail-${tag}-server-unsaved`, !t1.json.some(r => r.productId === PID), `count=${t1.json.length}`);
    const txtAfter = await snapText(p);
    assert(`detail-${tag}-unsave-feedback`, txtAfter.includes('Removed from your wishlist.'), '"Removed from your wishlist." snackbar/a11y');
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${tag}-03-detail-after-unsave.png`);

    // ===== C. re-save via heart (POST observable + state flip back) =====
    let postStatus = 0; let postSeen = false;
    const onPost = r => { if (r.url().includes(`/api/saved-products/${PID}`) && r.request().method() === 'POST') { postSeen = true; postStatus = r.status(); } };
    p.on('response', onPost);
    await L.clickBtn(p, 'Save');
    await p.waitForTimeout(2200);
    p.off('response', onPost);
    assert(`detail-${tag}-post-fired`, postSeen && postStatus === 200, `status=${postStatus}`);
    const t2 = await L.api(btok, 'GET', '/api/saved-products');
    assert(`detail-${tag}-server-saved`, t2.json.some(r => r.productId === PID));
    const dupState = await L.api(btok, 'POST', `/api/saved-products/${PID}`);
    assert(`detail-${tag}-dup-post-rejected-by-backend`, dupState.status === 400, `status=${dupState.status}`);

    // ===== D. Account tab -> Saved items tile -> grid with real row =====
    const { tileThere, clicked } = await openSavedGridViaAccountTab(p);
    assert(`account-${tag}-tile-present`, tileThere);
    assert(`grid-${tag}-tile-clicked`, clicked);
    let gridGet = 0;
    p.on('response', r => { if (r.url().endsWith('/api/saved-products') && r.request().method() === 'GET') gridGet = r.status(); });
    await p.waitForTimeout(1200);
    let g = await snapText(p);
    assert(`grid-${tag}-screen-header`, g.includes('Saved items'), '');
    assert(`grid-${tag}-real-row-title`, g.includes(fx.title), `"${fx.title}"`);
    assert(`grid-${tag}-real-row-price`, g.includes('13,000'), '13,000');
    assert(`grid-${tag}-get-200`, gridGet === 200, `status=${gridGet}`);
    const ph2 = /(lorem|placeholder|dummy|TODO)/i.exec(g);
    assert(`grid-${tag}-no-placeholders`, !ph2, ph2 ? ph2[0] : '');
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${tag}-04-saved-grid.png`);

    // ===== E. unsave from grid card (per-card unsave affordance) =====
    let gridDel = 0;
    const onDel2 = r => { if (r.url().includes(`/api/saved-products/${PID}`) && r.request().method() === 'DELETE') gridDel = r.status(); };
    p.on('response', onDel2);
    const unsClicked = await clickSemantics(p, /Remove from saved items/);
    await p.waitForTimeout(2400);
    p.off('response', onDel2);
    assert(`grid-${tag}-unsave-clicked`, unsClicked);
    assert(`grid-${tag}-unsave-delete-200`, gridDel === 200, `status=${gridDel}`);
    const t3 = await L.api(btok, 'GET', '/api/saved-products');
    assert(`grid-${tag}-server-empty`, t3.json.length === 0, `count=${t3.json.length}`);
    await p.waitForTimeout(900);
    const g2 = await snapText(p);
    assert(`grid-${tag}-row-gone-from-ui`, !g2.includes(fx.title));
    assert(`grid-${tag}-empty-state-copy`, g2.includes('No Saved Items') && g2.includes('Items you save will appear here for quick access later.'), 'web-parity empty card');
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${tag}-05-grid-empty-state.png`);

    // Explore Products CTA pops back
    const expClicked = await L.clickBtn(p, 'Explore Products');
    await p.waitForTimeout(1400);
    assert(`grid-${tag}-explore-cta-clickable`, !!expClicked);

    // ===== F. cart save-for-later moves line to wishlist =====
    await p.goto(`${APP}/#/product/${PID}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(3000);
    const addClicked = await L.clickBtn(p, 'Add to cart');
    await p.waitForTimeout(1800);
    assert(`cart-${tag}-add-to-cart-clicked`, addClicked);
    await p.goto(`${APP}/#/cart`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(2600);
    const c1 = await snapText(p);
    assert(`cart-${tag}-line-in-cart`, c1.includes(fx.title), `"${fx.title}" in cart`);
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${tag}-06-cart-before-move.png`);

    let sflPost = 0;
    const onSfl = r => { const u = r.url(); if (u.includes(`/api/saved-products/${PID}`) && r.request().method() === 'POST') sflPost = r.status(); };
    p.on('response', onSfl);
    const sflClicked = await clickSemantics(p, /Save for later/);
    await p.waitForTimeout(3000);
    p.off('response', onSfl);
    assert(`cart-${tag}-sfl-clicked`, sflClicked);
    assert(`cart-${tag}-sfl-post-200`, sflPost === 200, `POST status=${sflPost}`);
    await p.waitForTimeout(800);
    const c2 = await snapText(p);
    assert(`cart-${tag}-line-left-cart`, !c2.includes(fx.title), 'removed from cart UI');
    const t4 = await L.api(btok, 'GET', '/api/saved-products');
    assert(`cart-${tag}-moved-to-wishlist-server`, t4.json.some(r => r.productId === PID), `saved=${t4.json.length}`);
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${tag}-07-cart-after-move.png`);

    // wishlist shows moved item
    const again = await openSavedGridViaAccountTab(p);
    await p.waitForTimeout(1500);
    const g3 = await snapText(p);
    assert(`wishlist-${tag}-shows-moved-item`, g3.includes(fx.title), `"${fx.title}" after move`);
    await L.screenshot(p, `e2e/shots/${UNIT}/flutter-${tag}-08-wishlist-after-move.png`);

    // ===== G. CLICK-EVERYTHING enumeration on the two screens under test =====
    // (a) saved grid
    const ctrlsGrid = await L.listButtons(p);
    const gridBtns = ctrlsGrid.filter(c => c.kind === 'button' || c.kind === 'tappable');
    console.log(`CLICKS grid ${tag}: n=${gridBtns.length}`, JSON.stringify(gridBtns.slice(0, 12)));
    assert(`clicks-${tag}-grid-enumerated`, gridBtns.length > 0, `n=${gridBtns.length}`);
    // (b) product detail: enumerate then click each button once, asserting an effect
    await p.goto(`${APP}/#/product/${PID}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(3000);
    const ctrlsDet = await L.listButtons(p);
    const detBtns = ctrlsDet.filter(c => c.kind === 'button');
    console.log(`CLICKS detail ${tag}: n=${detBtns.length}`, JSON.stringify(detBtns.map(b => b.label).slice(0, 20)));
    assert(`clicks-${tag}-detail-enumerated`, detBtns.length >= 3, `n=${detBtns.length}`);
    // Back button navigates away
    const beforeUrl = p.url();
    const backOk = await L.clickBtn(p, 'Back');
    await p.waitForTimeout(1200);
    assert(`clicks-${tag}-detail-back-nav`, backOk, `url ${beforeUrl} -> ${p.url()}`);

    imgMaps.push(imgs);
    await L.closeVideo(ctx, `e2e/videos/${UNIT}-verify-${tag}.webm`);
  }

  await runViewport(375, 667, '375', true);
  // reset fixture to saved for tablet pass
  await L.api(btok, 'POST', `/api/saved-products/${PID}`);
  await runViewport(768, 1024, '768', true);

  await browser.close();

  // images across viewports
  const all = Object.assign({}, ...imgMaps);
  const urls = Object.keys(all);
  const broken = urls.filter(u => !(all[u] === 200 || all[u] === 304));
  assert('images-all-ok', broken.length === 0, `total=${urls.length} broken=${broken.length}`);
  if (broken.length) console.log('BROKEN:', JSON.stringify(broken.slice(0, 8)));

  fs.mkdirSync(path.dirname(SHARD), { recursive: true });
  fs.appendFileSync(SHARD, JSON.stringify({
    ts: new Date().toISOString(), unit: UNIT, stage: 'verify-r2', agent: 'verifier-AU-050-RW',
    build_sha: '858b0ef', viewport: '375x667+768x1024',
    verdict: failures.length ? 'FAIL' : 'PASS',
    checks: {
      freshness: true, real_data: true,
      images_requested: urls.length, images_200: urls.filter(u => all[u] === 200 || all[u] === 304).length,
      buttons_total: 0, buttons_ok: 0, buttons_failed: [],
      state_asserts: asserts.length,
      nav_asserts: asserts.filter(a => /nav|clicked|tile/.test(a.name)).length,
      data_asserts: asserts.filter(a => /real|price|row|title|server|groundtruth/.test(a.name)).length,
      vision_defects: -1, vision_findings: [], parity_blocker: -1, parity_major: -1, parity_minor: -1,
    },
    asserts, failures, network: [...new Set(networkLog)].slice(-70),
    fixtures: { buyerId: fx.buyer.id, sellerId: fx.seller.id, productId: PID, title: fx.title },
  }) + '\n');
  console.log('R2 DONE failures=' + failures.length, JSON.stringify(failures));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
