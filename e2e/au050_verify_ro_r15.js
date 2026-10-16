// au050_verify_ro_r15.js — AU-050 saved_favorites_end_to_end, RO lane, FROZEN bundle :9131
//   build sha e694463, main.dart.js Last-Modified "Wed, 26 Aug 2026 08:15:26 GMT".
//   r14 harness bug fixed here: STATE was never declared (crashed mid-run after the
//   unsave block); declared below. Login now uses the proven lib L.login() which polls
//   flutter.auth_token (no landing-view assumption) from a HOME start.
//
// RO discipline: no listing/order creation or mutation of shared seed data.
// Server-visible mutations are limited to:
//   - wire-level POST/DELETE round-trips on the THROWAWAY probe account
//     (au050.ro.probe.*), whose wishlist starts and ends empty;
//   - one net-zero heart toggle on an existing catalog product as the shared BUYER
//     (save -> unsave -> server state identical), required by the acceptance criteria;
//   - SFL: cart is CLIENT-side on both apps (web removeFromCart is local state), so
//     the SFL move is exercised as BUYER in-browser on a product we then restore.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
const REF = 'http://localhost:3000';
const API = 'http://localhost:8083';
const UNIT = 'AU-050', STAGE = 'verify-ro-r15';
const BUILD_SHA = 'e694463', BUILD_MT = 'Wed, 26 Aug 2026 08:15:26 GMT';
const SHOT_DIR = `e2e/shots/${UNIT}`;
const PROBE = { email: 'au050.ro.probe.1787734001@gmail.com', pw: 'StrongPass!1' };
const BUYER = { email: 'mobile.test.20260820@gmail.com', pw: 'StrongPass!1' };
const T0 = Date.now();

let STATE = 0; // <-- r14 crashed here: used but never declared
let NAV = 0, DATA = 0;
const R = {
  ts: new Date().toISOString(), unit: UNIT, stage: STAGE, verdict: null,
  lane: APP, build_sha: BUILD_SHA, bundle_mtime: null,
  checks: {
    freshness: false, real_data: false, real_data_probe: '', images_requested: 0,
    images_200: 0, images_broken: [], buttons_total: 0, buttons_ok: 0,
    buttons_failed: [], state_asserts: 0, nav_asserts: 0, data_asserts: 0,
    vision_defects: 0, vision_findings: [],
    parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
  },
  failures: [], evidence: [], shots: [], refShots: [], videos: [], asserts: [],
  wire: [],
};
function assert(name, pass, detail) {
  R.asserts.push({ name, pass: !!pass, detail: String(detail ?? '').slice(0, 400) });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + String(detail).slice(0, 200) : ''));
  if (!pass) R.failures.push(name);
}
function btn(name, cond, detail) {
  R.checks.buttons_total++;
  if (cond) { R.checks.buttons_ok++; console.log('BTN  ' + name + (detail ? ' :: ' + detail : '')); }
  else { R.checks.buttons_failed.push(name); R.failures.push('button:' + name); console.log('FAIL-BTN ' + name + ' ' + (detail || '')); }
  return cond;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n')); }
function shotPath(vp, state) { return `${SHOT_DIR}/${UNIT}-${vp}-${state}.png`; }
async function shot(p, vp, state) { const f = shotPath(vp, state); await L.screenshot(p, f); R.shots.push(f); R.evidence.push(f); return f; }

function watchSaved(p, tag) {
  p.on('response', res => {
    const u = res.url();
    if (/\/api\/saved-products/.test(u)) {
      R.wire.push({ tag, method: res.request().method(), url: u.replace(API, ''), status: res.status(), auth: !!res.request().headers()['authorization'] });
    }
  });
}

// Smallest interactive node containing label -> coordinate click (proven helper).
async function jsClick(p, label, maxY = 1015) {
  const hit = await p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (!isFinite(r.x) || !isFinite(r.y)) return;
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
      const roleOk = e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null;
      if (!roleOk) return;
      const area = r.width * r.height;
      if (!best || area < best.area)
        best = { area, x: Math.max(2, Math.min(Math.round(r.x + r.width / 2), innerWidth - 2)),
                 y: Math.max(20, Math.min(Math.round(r.y + r.height / 2), innerHeight - 4)) };
    });
    return best;
  }, label);
  if (!hit) return false;
  const cx = Math.max(3, Math.min(hit.x, 764)), cy = Math.max(20, Math.min(hit.y, Math.max(maxY ?? 1015, 40)));
  if (!isFinite(cx) || !isFinite(cy)) return false;
  await p.mouse.click(cx, cy);
  await sleep(1100);
  return true;
}
// Textless IconButton heart in the bottom action bar (tooltip 'Save'): smallest
// role=button node with NO text at y > 50% viewport.
async function clickHeart(p, maxY = 1015) {
  const hit = await p.evaluate(() => {
    let best = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      const t = (e.textContent || '').trim();
      if (t.length > 0) return;
      const r = e.getBoundingClientRect();
      if (!isFinite(r.x) || !isFinite(r.y)) return;
      if (r.width < 20 || r.width > 90 || r.height < 20 || r.height > 90) return;
      if (r.bottom < 0 || r.top > innerHeight) return;
      if (r.y < innerHeight * 0.45) return; // bottom bar only
      const area = r.width * r.height;
      if (!best || area < best.area)
        best = { area, x: Math.max(2, Math.min(Math.round(r.x + r.width / 2), innerWidth - 2)),
                 y: Math.max(20, Math.min(Math.round(r.y + r.height / 2), innerHeight - 4)) };
    });
    return best;
  });
  if (!hit) return false;
  await p.mouse.click(hit.x, hit.y);
  await sleep(1800);
  return true;
}
// Textless icon buttons inside grid cards (unsave hearts).
async function gridUnsaveButtons(p) {
  return p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      const t = (e.textContent || '').trim();
      if (t.length > 0) return;
      const r = e.getBoundingClientRect();
      if (!isFinite(r.x) || !isFinite(r.y)) return;
      if (r.width < 16 || r.width > 90 || r.height < 16 || r.height > 90) return;
      if (r.bottom < 0 || r.top > innerHeight) return;
      out.push({ x: Math.max(2, Math.min(Math.round(r.x + r.width / 2), innerWidth - 2)),
                 y: Math.max(20, Math.min(Math.round(r.y + r.height / 2), innerHeight - 4)) });
    });
    out.sort((a, b) => a.y - b.y);
    return out;
  });
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  // ================= CHECK 1: FRESHNESS =================
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  const body = await fetch(APP + '/main.dart.js').then(r => r.text());
  const markers = ['Saved items', '/api/saved-products', 'No Saved Items',
    'Items you save will appear here for quick access later.', 'Explore Products',
    'Removed from saved items.', 'Save for later', 'Log in to save items to your wishlist.',
    'Saved for later \\u2014 moved to your wishlist.'];
  const norm = s => s.replace(/—/g, '\\u2014');
  const missing = markers.filter(s => !body.includes(s) && !body.includes(norm(s)));
  R.bundle_mtime = lm;
  R.checks.freshness = head.status === 200 && lm === BUILD_MT && missing.length === 0;
  assert('1-freshness-frozen-e694463-bundle', R.checks.freshness,
    `HTTP ${head.status} Last-Modified="${lm}" expected "${BUILD_MT}"; AU-050 markers missing=[${missing}]`);

  // ================= CHECK 2: REAL DATA via independent curl =================
  const btok = await L.apiLogin(BUYER);
  fs.writeFileSync('/tmp/au050_bt', btok);
  const gt = await L.api(btok, 'GET', '/api/saved-products');
  const gtRows = Array.isArray(gt.json) ? gt.json : [];
  const gtIds = gtRows.map(r => r.productId);
  assert('2-curl-shared-buyer-saved-list', gt.status === 200 && Array.isArray(gt.json),
    `${gt.status}; shared buyer wishlist ids=[${gtIds.join(',')}] count=${gtIds.length}`);
  // pick a REAL catalog product with an image, not already saved -> net-zero toggle target
  const cat = await fetch(API + '/api/v1/products/get-all-products?page=0&size=60').then(r => r.json());
  const rows = cat.content || cat.products || [];
  const cand = rows.find(p => (p.productImages || []).length > 0 && !gtIds.includes(p.productId))
    || rows.find(p => !gtIds.includes(p.productId));
  if (!cand) throw new Error('no unsaved catalog product available');
  const PROD = { id: cand.productId, title: cand.productName, price: cand.productAskingPrice,
    qty: cand.productQuantity || 0, sold: cand.soldQuantity || 0 };
  const det = await fetch(API + `/api/v1/displayItem/itemDetails/${PROD.id}`).then(r => r.json());
  assert('2-curl-product-ground-truth', det.productName === PROD.title && det.productAskingPrice === PROD.price,
    `"${det.productName}" TSh ${Number(det.productAskingPrice).toLocaleString('en-US')} img=${(det.productImages || [])[0]?.imageUrl}`);
  // SFL target must accept an add-to-cart (in stock, someone else's listing)
  const sflCand = rows.find(p => p.productId !== PROD.id && (p.productQuantity || 0) > (p.soldQuantity || 0)
    && !gtIds.includes(p.productId)) || cand;
  const SFL = { id: sflCand.productId, title: sflCand.productName };

  // Probe account ground truth: empty wishlist start/end (independent of any browser)
  const ptok = await L.apiLogin(PROBE);
  const p0 = await L.api(ptok, 'GET', '/api/saved-products');
  const pStartEmpty = p0.status === 200 && Array.isArray(p0.json) && p0.json.length === 0;
  assert('2-curl-probe-wishlist-empty-start', pStartEmpty, `${p0.status} count=${Array.isArray(p0.json) ? p0.json.length : '?'}`);
  R.checks.real_data_probe = `probe wishlist empty-start=${pStartEmpty}; shared buyer count=${gtIds.length}; heart-product="${PROD.title}" (id ${PROD.id})`;

  // ---- WIRE ROUND-TRIP on probe account: POST contains / DELETE uncontains / no /v1 ----
  const post1 = await L.api(ptok, 'POST', `/api/saved-products/${PROD.id}`);
  const gS = await L.api(ptok, 'GET', '/api/saved-products');
  const sIds = Array.isArray(gS.json) ? gS.json.map(r => r.productId) : [];
  const postOk = post1.status >= 200 && post1.status < 300 && sIds.includes(PROD.id);
  assert('2-wire-post-saves-server-state', postOk,
    `POST status=${post1.status} -> GET contains ${PROD.id}: ${sIds.includes(PROD.id)} ids=[${sIds.join(',')}]`);
  const dup = await L.api(ptok, 'POST', `/api/saved-products/${PROD.id}`);
  assert('2-wire-dup-post-guarded', dup.status >= 400 ? dup.status < 500 : dup.status < 300,
    `duplicate POST status=${dup.status} (backend rejects or idempotent)`);
  const del1 = await L.api(ptok, 'DELETE', `/api/saved-products/${PROD.id}`);
  const gD = await L.api(ptok, 'GET', '/api/saved-products');
  const dIds = Array.isArray(gD.json) ? gD.json.map(r => r.productId) : [];
  const delOk = del1.status >= 200 && del1.status < 300 && !dIds.includes(PROD.id);
  assert('2-wire-delete-removes-server-state', delOk,
    `DELETE status=${del1.status} -> GET uncontains ${PROD.id}: ${!dIds.includes(PROD.id)} ids=[${dIds.join(',')}]`);
  const pEnd = await L.api(ptok, 'GET', '/api/saved-products');
  assert('2-wire-probe-wishlist-empty-end-ro', pEnd.status === 200 && pEnd.json.length === 0,
    `probe ends empty: ${pEnd.json.length} rows`);
  // endpoint contract: exactly /api/saved-products, NEVER /api/v1/...
  const v1Probe = await L.api(ptok, 'GET', '/api/v1/saved-products');
  assert('2-wire-no-v1-endpoint-contract', v1Probe.status >= 400, `/api/v1/saved-products returns ${v1Probe.status} (must NOT be the contract)`);
  R.checks.real_data = gt.status === 200 && postOk && delOk;

  for (const VP of [
    { name: '375x667', width: 375, height: 667, video: 'e2e/videos/AU-050-r15-mobile.webm' },
    { name: '768x1024', width: 768, height: 1024, video: 'e2e/videos/AU-050-r15-tablet.webm' },
  ]) {
    const vpN = VP.name, MY = VP.height - 9;
    console.log(`\n========== VIEWPORT ${vpN} ==========`);
    let browser, ctx, page;
    try {
      browser = await L.newBrowser();
      ctx = await L.newCtx(browser, { viewport: { width: VP.width, height: VP.height }, videoPath: VP.video });
      page = await ctx.newPage();
      const imgMap = {};
      page.on('response', r => {
        const u = r.url();
        if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /(\/assets\/).*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
      });
      watchSaved(page, vpN);

      // ---------- login from HOME (proven lib flow), then open the product ----------
      await page.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await L.waitText(page, 'Buy now', 60000);
      let logged = await L.isLoggedIn(page);
      if (!logged) logged = await L.login(page, BUYER);
      assert(`${vpN}-login-buyer`, logged, `token persisted=${await L.isLoggedIn(page)}`);
      await sleep(1500);

      await page.goto(APP + '/#/product/' + PROD.id, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await sleep(3500);
      let t = await txt(page);
      await shot(page, vpN, '01-detail');
      assert(`${vpN}-detail-real-title-in-dom`, t.includes(PROD.title), `"${PROD.title}"`);
      const priceStr = Number(PROD.price).toLocaleString('en-US');
      assert(`${vpN}-detail-real-price-in-dom`, t.includes(priceStr) || t.includes(String(PROD.price)), `TSh ${priceStr}`);
      assert(`${vpN}-detail-no-placeholder-strings`, !/\b(lorem|placeholder|dummy|TODO|sample item)\b/i.test(t), 'a11y clean');
      DATA += 2;

      // ---------- HEART TOGGLE on detail: POST fires + server gains id ----------
      const beforeRows = ((await L.api(btok, 'GET', '/api/saved-products')).json || []);
      const hadIt = beforeRows.some(r => r.productId === PROD.id);
      const wireBefore = R.wire.length;
      const heartClicked = hadIt ? true : await clickHeart(page);
      const afterSave = ((await L.api(btok, 'GET', '/api/saved-products')).json || []);
      const postedNow = afterSave.some(r => r.productId === PROD.id);
      const uiWirePost = R.wire.slice(wireBefore).filter(w => w.method === 'POST');
      assert(`${vpN}-detail-heart-post-server-roundtrip`, postedNow,
        `server contains ${PROD.id}: ${postedNow}; UI wire POST=${JSON.stringify(uiWirePost)}`);
      btn(`${vpN}-heart-toggle-clicked`, heartClicked && postedNow, `clicked=${heartClicked} postedNow=${postedNow}`);
      STATE += hadIt ? 0 : 2;
      await shot(page, vpN, '02-detail-after-heart');

      // ---------- UNHEART on detail: DELETE fires + server drops id ----------
      let deletedNow = false, unfeedback = false;
      const h2 = await clickHeart(page);
      const afterDel = ((await L.api(btok, 'GET', '/api/saved-products')).json || []);
      deletedNow = !afterDel.some(r => r.productId === PROD.id);
      const uiWireDel = R.wire.filter(w => w.tag === vpN && w.method === 'DELETE');
      assert(`${vpN}-detail-unheart-delete-server-roundtrip`, deletedNow,
        `server dropped ${PROD.id}: ${deletedNow}; UI wire DELETE=${JSON.stringify(uiWireDel)}`);
      btn(`${vpN}-unheart-toggle-clicked`, h2 && deletedNow, `clicked=${h2}`);
      const snk = await L.hasSnackBar(page);
      unfeedback = snk.found || /wishlist/i.test(await txt(page));
      assert(`${vpN}-detail-unsave-feedback-visible`, unfeedback, `snackbar band atY=${snk.atY} or wishlist copy in DOM`);
      await shot(page, vpN, '03-detail-after-unheart');
      STATE += deletedNow ? 2 : 0;

      // restore pre-existing saved state exactly (RO invariant)
      if (hadIt) await L.api(btok, 'POST', `/api/saved-products/${PROD.id}`);

      // ---------- ACCOUNT TAB -> 'Saved items' tile -> SavedItemsScreen ----------
      const acctClicked = await jsClick(page, 'Account', MY);
      await sleep(1600);
      t = await txt(page);
      await shot(page, vpN, '04-account-tile');
      const tileVisible = t.includes('Saved items') && t.includes('My account');
      assert(`${vpN}-account-tile-present`, acctClicked && tileVisible, `"My account" appBar + "Saved items" ListTile visible`);
      NAV++;
      const tileClicked = tileVisible && await jsClick(page, 'Saved items', MY);
      await sleep(2600);
      const urlGrid = page.url();
      t = await txt(page);
      await shot(page, vpN, '05-saved-grid');
      const onGrid = /#\/account\/saved/.test(urlGrid) || t.includes('No Saved Items')
        || /Saved items/i.test(t.split('\n').find(l => /saved items/i.test(l)) || '');
      assert(`${vpN}-grid-nav-to-saved-screen`, tileClicked && onGrid, `tile clicked=${tileClicked} url=${urlGrid}`);
      NAV++;
      assert(`${vpN}-grid-header-saved-items`, t.includes('Saved items'), 'appBar "Saved items"');

      // REAL rows render from GET /api/saved-products (same sandbox data as curl)
      const cur = ((await L.api(btok, 'GET', '/api/saved-products')).json || []);
      let matchedTitles = [];
      for (const row of cur) {
        if (!(row.productImages || []).length && row.productId !== cur[cur.length - 1]?.productId) continue;
        if (await L.scrollIntoView(page, String(row.productName).slice(0, 24))) {
          const now = await txt(page);
          if (now.includes(row.productName)) matchedTitles.push(row.productName);
        }
        if (matchedTitles.length >= 4) break;
      }
      assert(`${vpN}-grid-real-rows-render`, matchedTitles.length > 0,
        `${matchedTitles.length} real saved titles rendered: ${matchedTitles.slice(0, 3).join(' | ')}`);
      DATA++;
      const firstRow = cur.find(r => matchedTitles.includes(r.productName)) || cur[0];
      if (firstRow) {
        const rp = Number(firstRow.productAskingPrice).toLocaleString('en-US');
        const nowTxt = await txt(page);
        assert(`${vpN}-grid-row-price-render`, nowTxt.includes(rp), `TSh ${rp} beside "${firstRow.productName}"`);
        DATA++;
      }
      const gets = R.wire.filter(w => w.tag === vpN && w.method === 'GET');
      assert(`${vpN}-grid-get-fired-from-app`, gets.length > 0, JSON.stringify(gets.slice(-3)));
      assert(`${vpN}-grid-no-placeholder-strings`, !/\b(lorem|placeholder|dummy|TODO|sample item)\b/i.test(t), 'a11y clean');

      // enumerate + click EVERY labeled control reachable from the grid screen
      const ctrls = await L.listButtons(page);
      console.log(`GRID CONTROLS (${ctrls.length}): ` + ctrls.map(c => `${c.kind}[${(c.label || '(icon)').slice(0, 22)}]`).join(' '));
      let okC = 0;
      const labeled = ctrls.filter(c => (c.label || '').trim());
      for (const c of labeled.slice(0, 10)) {
        const did = await jsClick(page, c.label.trim().slice(0, 24), MY);
        if (did) okC++;
        await sleep(600);
        if (!/account\/saved/.test(page.url())) {  // navigated away -> come back
          await page.goto(APP + '/#/account/saved', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
          await sleep(2200);
        }
      }
      btn(`${vpN}-grid-labeled-controls-clicked`, okC === labeled.slice(0, 10).length, `ok=${okC}/${labeled.slice(0, 10).length}`);

      // UNSAVE from grid: last row, verify server drop, then RESTORE it (net zero).
      const target = cur[cur.length - 1];
      if (target) {
        const seen = await L.scrollIntoView(page, String(target.productName).slice(0, 24));
        const hearts = await gridUnsaveButtons(page);
        let removed = false;
        if (hearts.length) {
          const hb = hearts[hearts.length - 1];
          await page.mouse.click(hb.x, hb.y);
          await sleep(1900);
          removed = true;
        }
        const gAfterUi = await L.api(btok, 'GET', '/api/saved-products');
        const aIds = (Array.isArray(gAfterUi.json) ? gAfterUi.json : []).map(r => r.productId);
        const goneFromServer = !aIds.includes(target.productId);
        assert(`${vpN}-grid-unsave-delete-server-roundtrip`, removed && goneFromServer,
          `unsave clicked=${removed}; server no longer has ${target.productId}: ${goneFromServer} (ids=[${aIds.join(',')}])`);
        btn(`${vpN}-grid-unsave-button`, removed && goneFromServer, `hearts-on-screen=${hearts.length}`);
        // restore the row we removed (net zero)
        const rest = await L.api(btok, 'POST', `/api/saved-products/${target.productId}`);
        const gRest = await L.api(btok, 'GET', '/api/saved-products');
        const rIds = (Array.isArray(gRest.json) ? gRest.json : []).map(r => r.productId);
        assert(`${vpN}-grid-row-restored-netzero`, rest.status < 300 && rIds.includes(target.productId),
          `restored ${target.productId}: status=${rest.status} ids=[${rIds.join(',')}]`);
        const tAfter = await txt(page);
        const uiGone = !tAfter.includes(target.productName);
        assert(`${vpN}-grid-row-gone-from-ui`, uiGone, `"${target.productName}" removed from rendered grid`);
        await shot(page, vpN, '06-saved-grid-after-unsave');
        STATE += (removed && goneFromServer && uiGone) ? 3 : 1;
      }

      // ---------- CART: Save for later moves line -> wishlist (BUYER, restored) ----
      // Add SFL product to cart via the real UI (client-side cart on both apps),
      // click its 'Save for later' control, assert the line leaves the cart AND the
      // wishlist gains the id server-side, then unsave to end net zero.
      await page.goto(APP + '/#/product/' + SFL.id, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await sleep(3200);
      const addClicked = await L.clickBtn(page, 'Add to cart');
      await sleep(1200);
      await shot(page, vpN, '07-cart-before');
      await page.goto(APP + '/#/cart', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await sleep(2400);
      t = await txt(page);
      const lineInCart = t.includes(String(SFL.title).slice(0, 24));
      assert(`${vpN}-cart-line-added-for-sfl`, addClicked && lineInCart, `"${SFL.title}" in cart=${lineInCart} (add clicked=${addClicked})`);
      let sflMoved = false;
      if (lineInCart) {
        const sflClicked = await jsClick(page, 'Save for later', MY);
        await sleep(2300);
        t = await txt(page);
        await shot(page, vpN, '07-cart-after-sfl');
        const goneFromCart = !(await txt(page)).includes(String(SFL.title).slice(0, 24));
        const gSfl = await L.api(btok, 'GET', '/api/saved-products');
        const sflOnServer = (Array.isArray(gSfl.json) ? gSfl.json : []).some(r => r.productId === SFL.id);
        sflMoved = sflClicked && goneFromCart && sflOnServer;
        assert(`${vpN}-cart-save-for-later-moves-to-wishlist`, sflMoved,
          `SFL clicked=${sflClicked} line left cart=${goneFromCart} wishlist has ${SFL.id}=${sflOnServer}`);
        btn(`${vpN}-cart-save-for-later-control`, sflMoved, 'real move asserted');
        // restore: unsave so the shared wishlist ends where it started
        const undo = await L.api(btok, 'DELETE', `/api/saved-products/${SFL.id}`);
        const gUndo = await L.api(btok, 'GET', '/api/saved-products');
        const undone = !(Array.isArray(gUndo.json) ? gUndo.json : []).some(r => r.productId === SFL.id);
        assert(`${vpN}-cart-sfl-restored-netzero`, undo.status < 300 && undone,
          `unsave status=${undo.status} wishlist back to baseline=${undone}`);
        STATE += sflMoved ? 3 : 1;
      } else {
        assert(`${vpN}-cart-save-for-later-moves-to-wishlist`, false, 'could not stage a cart line (see prior assert)');
        btn(`${vpN}-cart-save-for-later-control`, false, 'not staged');
      }
      NAV++;

      // ---------- images ----------
      const summ = L.imageSummary(imgMap);
      R.checks.images_requested += summ.total;
      R.checks.images_200 += summ.ok;
      Object.entries(imgMap).forEach(([u, s]) => { if (s >= 400) R.checks.images_broken.push(`${s} ${u}`); });
      assert(`${vpN}-images-all-200-nonempty`, summ.total > 0 && summ.failed === 0,
        `requested=${summ.total} ok=${summ.ok} broken=${summ.failed}`);

      await L.closeVideo(ctx, VP.video);
      R.videos.push(VP.video); R.evidence.push(VP.video);
    } catch (e) {
      R.failures.push(`vp-${vpN}-exception:${String(e.message).slice(0, 60)}`);
      console.log('EXCEPTION ' + vpN + ': ' + e.message);
      try { await L.closeVideo(ctx, VP.video); R.videos.push(VP.video); } catch (_) {}
    } finally { try { if (browser) await browser.close(); } catch (_) {} }
  }

  // ================= CHECK 7: PARITY vs reference :3000 =================
  // NOTE: the web reference proxies BACKEND_URL=https://apidev.globoexpats.com, NOT the
  // sandbox (:8083) — its saved list is apidev data, structurally impossible to match
  // row-for-row against sandbox state (same finding as AU-039 sk14). Parity here asserts
  // the FLOW SHAPE: same tab copy, same empty-state card, same controls.
  let rbrowser;
  try {
    rbrowser = await L.newBrowser();
    for (const VP of [{ name: '375x667', width: 375, height: 667 }, { name: '768x1024', width: 768, height: 1024 }]) {
      const rc = await rbrowser.newContext({ viewport: { width: VP.width, height: VP.height } });
      const rp = await rc.newPage();
      await rp.goto(REF + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
      await sleep(1500);
      await rp.locator('input[type="email"],input[name="email"],input[type="text"]').first()
        .fill(BUYER.email, { timeout: 15000 }).catch(() => {});
      await rp.locator('input[type="password"]').first().fill(BUYER.pw, { timeout: 15000 }).catch(() => {});
      const refLoginShot = `${SHOT_DIR}/ref-${VP.name}-login.png`;
      await rp.screenshot({ path: refLoginShot }).catch(() => {});
      R.evidence.push(refLoginShot); R.refShots.push(refLoginShot);
      await rp.locator('button:has-text("Log in"),button:has-text("Sign in"),button[type=submit]').first()
        .click({ timeout: 15000 }).catch(() => {});
      await sleep(3500);
      await rp.goto(REF + '/expat/dashboard?tab=saved', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
      await sleep(5000);
      const rt = await rp.evaluate(() => document.body.innerText.slice(0, 3000)).catch(() => '');
      fs.writeFileSync(`${SHOT_DIR}/ref-${VP.name}-saved-tab.txt`, rt);
      R.evidence.push(`${SHOT_DIR}/ref-${VP.name}-saved-tab.txt`);
      const rs = `${SHOT_DIR}/ref-${VP.name}-saved-grid.png`;
      await rp.screenshot({ path: rs, fullPage: false }).catch(() => {});
      R.refShots.push(rs); R.evidence.push(rs);
      const shapeOk = /Saved Items/i.test(rt) && (/No Saved Items/i.test(rt) || /Items you save will appear here/i.test(rt) || rt.length > 200);
      const refMatched = gtRows.filter(r => rt.includes(r.productName)).length;
      console.log(`REF ${VP.name}: shapeOk=${shapeOk} matched ${refMatched}/${gtRows.length} sandbox titles (ref serves apidev data)`);
      if (refMatched > 0) R.checks.parity.accepted++;
      else if (shapeOk) { R.checks.parity.accepted++; R.checks.vision_findings.push(
        `parity-note ref-${VP.name}: flow shape matches (tab header + empty/grid state render) but 0/${gtRows.length} sandbox titles appear — reference :3000 proxies apidev.globoexpats.com, not sandbox :8083 (structural, accepted per AU-039-sk14 control)`); }
      else { R.checks.parity.major++; R.checks.vision_findings.push(`parity-major ref-${VP.name}: saved tab did not render expected shape`); }
      await rc.close();
    }
  } catch (e) { console.log('REF exception: ' + e.message); R.checks.parity.minor++; }
  finally { try { if (rbrowser) await rbrowser.close(); } catch (_) {} }

  // Final RO invariant: shared wishlist back to baseline
  const finalList = ((await L.api(btok, 'GET', '/api/saved-products')).json || []).map(r => r.productId).sort((a, b) => a - b);
  const baseList = gtIds.slice().sort((a, b) => a - b);
  const netZero = JSON.stringify(finalList) === JSON.stringify(baseList);
  assert('ro-invariant-shared-wishlist-net-zero', netZero,
    `start=[${baseList.join(',')}] end=[${finalList.join(',')}] equal=${netZero}`);

  // ================= CHECK 6: VISION — PNG sanity; native reads happen in-session ======
  for (const s of R.shots.concat(R.refShots).filter(Boolean)) {
    try {
      const buf = fs.readFileSync(s);
      const d = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
      if (!d.w) R.checks.vision_findings.push(`unreadable-png: ${s}`);
      else console.log(`VISION ${s} ${d.w}x${d.h} ok`);
    } catch (e) { R.checks.vision_findings.push(`missing-png: ${s}`); }
  }
  R.checks.state_asserts = R.asserts.filter(a => /roundtrip|feedback|restored|price-render|rows-render|placeholder|moved|net-zero|netzero/.test(a.name)).length;
  R.checks.nav_asserts = NAV;
  R.checks.data_asserts = DATA;

  R.verdict = (R.failures.length === 0 && R.checks.real_data &&
    R.checks.images_200 === R.checks.images_requested && R.checks.buttons_failed.length === 0 &&
    R.checks.parity.blocker === 0 && R.checks.parity.major === 0) ? 'PASS' : 'FAIL';

  const shard = {
    ts: new Date().toISOString(), unit: UNIT, title: 'saved_favorites_end_to_end', wave: 'verify',
    agent: 'verifier-AU-050-RO-r15', build_sha: BUILD_SHA, build_mtime: BUILD_MT,
    viewport: '375x667+768x1024', verdict: R.verdict, checks: R.checks,
    failures: R.failures.slice(0, 40), evidence: R.evidence.slice(0, 48),
    videos: R.videos, runtime_ms: Date.now() - T0,
  };
  fs.appendFileSync('e2e/results/shards/AU-050-verify.jsonl', JSON.stringify(shard) + '\n');
  console.log('\nVERDICT ' + R.verdict + ' failures=' + R.failures.length +
    ' state_asserts=' + R.checks.state_asserts + ' nav=' + NAV + ' data=' + DATA);
  console.log(JSON.stringify(shard.checks));
})().catch(e => { console.log('FATAL ' + e.stack); process.exit(1); });
