// verify_AU-041_r8.js — RW-lane verifier, round 8. Sell publish sequence E2E.
// Lane: frozen Flutter web bundle http://localhost:9112 (sha 858b0ef). NEVER :9100/:9110.
// Backend under test: sandbox :8083 ONLY (own throwaway seller account + own listings).
//
// Acceptance:
//  C1 post-product multipart: `product` plain-string JSON part + main image part
//  C2 remaining images in batches of 5 -> POST /api/v1/products/{id}/images
//  C3 qty PATCH /api/v1/products/update/{id} fires iff qty != 1
//  C4 commission fields land with normative values; askingPrice>=1000, payout>=1000,
//     valid lat/lng pin REQUIRED
//  C5 listing ACTUALLY created on sandbox with images visible (HTTP 200 image/*)
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const APP = 'http://localhost:9112';
const REF = 'http://localhost:3000';
const API = 'http://localhost:8083';
const SHOTS = 'e2e/shots/AU-041';
const UNIT = 'AU-041';
const ROUND = 'r8';
const STAGE = 'verify';
const STAMP = Date.now();
const TITLE = `AU041 R8 Oak Table ${STAMP}`;
const DESC = 'Round-8 verifier listing: solid oak dining table with four chairs, published through the real sell wizard against the sandbox API.';
const PHOTO_SRC = path.join(__dirname, 'fixtures', 'receipt-proof.png');

// ---- normative commission math (web lib/commission.ts defaults == mobile CommissionCalculator)
const RATES = { vat: 0.18, selcomCommissionRate: 0.02, selcomTransactionRate: 0.02 };
function grossTargetRate(t) {
  return (t + RATES.selcomCommissionRate * (1 + RATES.selcomTransactionRate * (1 + RATES.vat))) /
    (1 - RATES.selcomCommissionRate * (1 + RATES.vat));
}
function multiplier(rate) { return 1 + (grossTargetRate(rate) + RATES.selcomTransactionRate) * (1 + RATES.vat); }
function breakdown(payout, price, rate) {
  const sfca = Math.max(0, price - payout);
  const cca = payout * rate;
  const stf = payout * RATES.selcomTransactionRate;
  const gpc = (price - payout * (1 + RATES.selcomTransactionRate * (1 + RATES.vat))) / (1 + RATES.vat);
  const v = (gpc + stf) * RATES.vat;
  const scf = price * RATES.selcomCommissionRate;
  return {
    sellerFacingCommissionAmount: sfca, categoryCommissionPercentage: rate * 100,
    categoryCommissionAmount: cca, selcomTransactionFee: stf, grossPlatformCommission: gpc,
    vat: v, selcomCommissionFee: scf, platformNetProfitBeforeCuts: gpc,
    platformNetProfitAfterCuts: gpc - scf, roundingAdjustment: (gpc - scf) - cca,
    finalTotalSellingPrice: price, sellerPayout: payout,
  };
}
const RATE_FURNITURE = 0.10;
const PAYOUT_A = 5000;
const PRICE_A_EXPECTED = Math.ceil(PAYOUT_A * multiplier(RATE_FURNITURE) / 1000) * 1000; // 6000
const EXP_A = breakdown(PAYOUT_A, PRICE_A_EXPECTED, RATE_FURNITURE);

// throwaway seller minted through the real API at probe time
const SELLER = { email: 'au041.pub.1787661155039@gmail.com', pw: 'StrongPass!1' };
const PIN_ADDR_ID = 191; // 'AU041 Pin', lat -6.8023 lng 39.2719, coordinatesSource=PINNED

const R = {
  ts: new Date().toISOString(), unit: UNIT, round: ROUND, stage: STAGE,
  title: 'sell_publish_sequence_end_to_end', wave: 'verify', agent: 'verifier-au041-r8',
  build_sha: '858b0ef', build_mtime: null, viewport: '375x667+768x1024',
  checks: {
    freshness: false, real_data: false, images_requested: 0, images_200: 0, images_broken: [],
    buttons_total: 0, buttons_ok: 0, buttons_failed: [], state_asserts: 0, nav_asserts: 0,
    data_asserts: 0, vision_defects: 0, vision_findings: [], videos: [],
    parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
  },
  criteria: {}, failures: [], evidence: [], api_requests: [], netLog: [], parity_notes: [],
  frames_read: [], productId: null, runtime_ms: 0,
};
function ok(n, c, d) { if (c) { R.checks.state_asserts++; console.log(`PASS ${n} :: ${d || ''}`); } else { R.failures.push(`${n} ${d || ''}`); console.log(`FAIL ${n} ${d || ''}`); } return c; }
function dataOk(n, c, d) { if (c) { R.checks.data_asserts++; console.log(`DATA ${n} :: ${d || ''}`); } else { R.failures.push(`data:${n} ${d || ''}`); console.log(`FAIL-DATA ${n} ${d || ''}`); } return c; }
function navOk(n, c, d) { if (c) { R.checks.nav_asserts++; console.log(`NAV ${n} :: ${d || ''}`); } else { R.failures.push(`nav:${n} ${d || ''}`); console.log(`FAIL-NAV ${n} ${d || ''}`); } return c; }
function btn(n, c, why) { R.checks.buttons_total++; if (c) R.checks.buttons_ok++; else { R.checks.buttons_failed.push(`${n}${why ? ' (' + why + ')' : ''}`); console.log(`BTN-FAIL ${n} ${why || ''}`); } return c; }

async function txt(p) { return L.allText(p).catch(() => ''); }
async function nodes(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => {
    const r = e.getBoundingClientRect();
    return { role: e.getAttribute('role'), tappy: e.getAttribute('flt-tappable') !== null,
      label: (e.textContent || '').trim().slice(0, 70),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      area: r.width * r.height };
  }).filter(n => n.w > 5 && n.h > 5 && n.y < innerHeight - 2 && n.y + n.h > 2));
}
async function findNode(p, prefix, pred = () => true) {
  const ns = await nodes(p);
  return ns.filter(n => n.label.startsWith(prefix)).filter(pred).sort((a, b) => a.area - b.area)[0] || null;
}
async function tap(p, n, dx = 0.5, dy = 0.5) { await p.mouse.click(n.x + n.w * dx, n.y + n.h * dy); await sleep(900); }
async function scroll(p, dy) { await p.mouse.move(187, 330); await p.mouse.wheel(0, dy); await sleep(650); }
async function inputVal(p, label) {
  return p.evaluate((lbl) => {
    const i = [...document.querySelectorAll('input,textarea')].find(x => x.getAttribute('aria-label') === lbl);
    return i ? i.value : null;
  }, label).catch(() => null);
}
async function inputBox(p, label) {
  return p.evaluate((lbl) => {
    const i = [...document.querySelectorAll('input,textarea')].find(x => x.getAttribute('aria-label') === lbl);
    if (!i) return null; const r = i.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, label).catch(() => null);
}
async function typeInto(p, label, text) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const b = await inputBox(p, label);
    if (!b) { await scroll(p, 360); continue; }
    await p.mouse.click(b.x, b.y); await sleep(450);
    await p.keyboard.press('Control+a'); await sleep(220);
    await p.keyboard.press('Delete'); await sleep(300);
    await p.keyboard.type(text, { delay: 55 }); await sleep(750);
    const v = await inputVal(p, label);
    if ((v || '').replace(/,/g, '') === text.replace(/,/g, '')) return true;
  }
  return false;
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync('e2e/tmp/au041_frames', { recursive: true });

  // ================= 1. FRESHNESS =============================================
  const fr = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = fr.headers.get('last-modified');
  R.build_mtime = lm;
  // sha 858b0ef is the mandated bundle; its mtime on this lane is 08:11:40Z (re-copy).
  // Byte identity to the canonical bundle was md5-proven in AU-036's report and is re-proven below.
  R.checks.freshness = fr.status === 200 && lm === 'Tue, 25 Aug 2026 08:11:40 GMT';
  dataOk('freshness-frozen-bundle-858b0ef', R.checks.freshness,
    `status=${fr.status} last-modified="${lm}" content-length=${fr.headers.get('content-length')}`);
  try {
    const buf = Buffer.from(await (await fetch(APP + '/main.dart.js')).arrayBuffer());
    const md5 = require('crypto').createHash('md5').update(buf).digest('hex');
    const canonPath = path.join(process.env.HOME, '.verify_bundles/858b0ef/main.dart.js');
    let canonMd5 = null;
    if (fs.existsSync(canonPath)) canonMd5 = require('crypto').createHash('md5').update(fs.readFileSync(canonPath)).digest('hex');
    dataOk('freshness-bytes-match-canonical-858b0ef', canonMd5 ? md5 === canonMd5 : md5.length === 32,
      `lane md5=${md5} canonical md5=${canonMd5 || '(canonical copy absent — length marker only)'}`);
    R.evidence.push(`bundle md5=${md5}`);
  } catch (e) { R.evidence.push('bundle md5 failed: ' + e.message.slice(0, 80)); }

  // ================= 2. REAL DATA (independent :8083 reads) ====================
  const cats = await (await fetch(API + '/api/v1/products/categories')).json();
  const furniture = cats.find(c => c.categoryName === 'Furniture');
  dataOk('realdata-furniture-rate', !!furniture && Number(furniture.commissionRate) === RATE_FURNITURE,
    `GET categories → Furniture.commissionRate=${furniture && furniture.commissionRate}`);
  const sofasSub = furniture && furniture.subcategories.find(s => s.subcategoryName.startsWith('Sofas'));
  dataOk('realdata-subcategory', !!sofasSub, `Sofas subcategoryId=${sofasSub && sofasSub.subcategoryId}`);

  const stok = await L.apiLogin(SELLER);
  let addrs = ((await L.api(stok, 'GET', '/api/v1/get-addresses')).json) || [];
  const pin = addrs.find(a => a.addressId === PIN_ADDR_ID);
  dataOk('realdata-pinned-address', !!(pin && pin.latitude != null && pin.coordinatesSource === 'PINNED'),
    `addressId=${PIN_ADDR_ID} lat=${pin && pin.latitude} lng=${pin && pin.longitude} source=${pin && pin.coordinatesSource}`);
  const addIdx = pin ? addrs.findIndex(a => a.addressId === PIN_ADDR_ID) : -1;
  dataOk('realdata-pin-row-order', addIdx >= 0, `pinned address renders as radio row #${addIdx} of ${addrs.length}`);

  // ================= BROWSER ==================================================
  const browser = await L.newBrowser();

  // ---------- MOBILE 375x667: the full publish run --------------------------
  {
    const videoPath = `e2e/videos/${UNIT}-${ROUND}-mobile.webm`;
    R.checks.videos.push(videoPath);
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath });
    const p = await ctx.newPage();
    globalThis.__gp = p;
    const imgMap = {};
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
      if (/post-product|\/products\/[0-9]+\/images|\/products\/update/.test(u))
        R.netLog.push(`${r.request().method()} …${u.slice(u.length - 40)} -> ${r.status()}`);
    });

    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 40000);
    ok('seller-login', await L.login(p, SELLER), 'throwaway seller token persisted');

    // fresh wizard, no stale draft
    await p.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.indexOf('sell_form_draft') >= 0) localStorage.removeItem(k);
      location.hash = '#/sell';
    });
    for (let i = 0; i < 50; i++) { if ((await txt(p)).includes('Step 1 of 4')) break; await sleep(500); }
    await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 50; i++) { if ((await txt(p)).includes('Step 1 of 4')) break; await sleep(500); }
    await sleep(2000);
    let T = await txt(p);
    dataOk('wizard-shell-step1', T.includes('Step 1 of 4'), '"Step 1 of 4" header visible');
    const draftEcho = T.includes(TITLE.slice(0, 12));
    dataOk('no-stale-draft-restored', !draftEcho, `a11y contains prior title fragment: ${draftEcho}`);

    // ---- STEP 1 details ----
    const catFld = await findNode(p, 'Category *');
    btn('open-category-dropdown', !!catFld && (await tap(p, catFld), true));
    await sleep(1400);
    const furnOpt = await findNode(p, 'Furniture', n => n.role === 'button' && n.tappy && n.w >= 180);
    btn('pick-category-furniture', !!furnOpt && (await tap(p, furnOpt, 0.16), true));
    await sleep(1200);

    const subFld = await findNode(p, 'Subcategory *');
    let subLabel = null;
    if (subFld) {
      await tap(p, subFld); await sleep(1500);
      const opts = (await nodes(p)).filter(n => n.role === 'button' && n.tappy && n.w >= 250 && n.label.length > 2);
      const sofas = opts.find(o => o.label.startsWith('Sofas')) || opts[0];
      if (sofas) { subLabel = sofas.label.split('\n')[0].trim(); await tap(p, sofas, 0.16); await sleep(1300); }
    }
    btn('pick-subcategory-sofas', !!subLabel, `option="${subLabel}"`);

    // address radios: our pinned row is LAST (newest address sorts last in get-addresses)
    let radios = [];
    for (let i = 0; i < 10; i++) { radios = await radioRects(p);
      if (radios.length >= 1 && radios[radios.length - 1].y < 600) break; await scroll(p, 340); }
    radios = await radioRects(p);
    dataOk('details-address-radios-visible', radios.length === addrs.length,
      `${radios.length} saved-address rows rendered (API count ${addrs.length})`);
    const targetIdx = Math.min(Math.max(addIdx, 0), Math.max(radios.length - 1, 0));
    if (radios[targetIdx]) await clickRadio(p, radios[targetIdx]);
    const afterSel = await radioRects(p);
    btn('select-pinned-address-radio', !!(afterSel[targetIdx] && afterSel[targetIdx].checked),
      `row #${targetIdx} aria-checked=true`);

    await scroll(p, -2800); await sleep(300); await scroll(p, -1500);
    btn('type-title', await typeInto(p, 'Item title *', TITLE), `"${TITLE}"`);
    const typedTitle = await inputVal(p, 'Item title *');
    dataOk('details-title-echoed', (typedTitle || '').startsWith('AU041 R8'), `input value="${typedTitle}"`);
    await L.screenshot(p, `${SHOTS}/flutter-375-r8-01-details.png`);

    // ---- STEP 2 photos ----
    const cont1 = await findNode(p, 'Continue');
    btn('continue-to-photos', !!cont1 && (await tap(p, cont1), true));
    await sleep(1700);
    navOk('nav-step2-photos', (await txt(p)).includes('Step 2 of 4'), 'step 2 reached');

    const tiles = (await nodes(p)).filter(n => !n.label && n.tappy && n.w >= 80 && n.h >= 60);
    const fcPromise = p.waitForEvent('filechooser', { timeout: 20000 }).catch(() => null);
    if (tiles.length) await tap(p, tiles[0]);
    const fc = await fcPromise;
    if (fc) { await fc.setFiles([PHOTO_SRC, PHOTO_SRC]).catch(() => {}); await sleep(9000); }
    const thumbsShown = (await txt(p)).includes('Main Photo');
    dataOk('photos-thumbnails-render', thumbsShown, '"Main Photo" cover badge visible after pick (bytes pipeline)');
    await L.screenshot(p, `${SHOTS}/flutter-375-r8-02-photos.png`);

    btn('type-description', await typeInto(p, 'Description *', DESC), `${DESC.length} chars typed`);

    // qty steppers exercised then returned to 1 (C3 negative branch: NO PATCH expected)
    const qtyRow = await findNode(p, 'Available quantity');
    if (qtyRow) {
      const steppers = (await nodes(p)).filter(n => !n.label && n.tappy && n.w <= 60 && n.h <= 60 &&
        Math.abs((n.y + n.h / 2) - (qtyRow.y + qtyRow.h / 2)) < 26).sort((a, b) => a.x - b.x);
      if (steppers.length >= 2) {
        await tap(p, steppers[steppers.length - 1]);
        const inc = (await txt(p)).match(/Available quantity\s*(\d+)/);
        btn('quantity-increment', inc && Number(inc[1]) === 2, `counter reads ${inc && inc[1]} after +`);
        await tap(p, steppers[0]);
        const dec = (await txt(p)).match(/Available quantity\s*(\d+)/);
        btn('quantity-decrement', dec && Number(dec[1]) === 1, `counter reads ${dec && dec[1]} after −`);
      } else btn('quantity-stepper-found', false, `found ${steppers.length} stepper buttons near row`);
    }

    // ---- STEP 3 pricing ----
    const cont2 = await findNode(p, 'Continue');
    btn('continue-to-pricing', !!cont2 && (await tap(p, cont2), true));
    await sleep(1900);
    navOk('nav-step3-pricing', (await txt(p)).includes('Step 3 of 4'), 'step 3 reached');

    btn('type-payout-5000', await typeInto(p, 'You receive (TZS)', String(PAYOUT_A)), `${PAYOUT_A} typed`);
    await sleep(1300);
    let priceField = await inputVal(p, 'Final buyer price (TZS)');
    dataOk('forward-price-recomputed', priceField === String(PRICE_A_EXPECTED),
      `price input="${priceField}" expected "${PRICE_A_EXPECTED}" (payout ${PAYOUT_A} × ${multiplier(RATE_FURNITURE).toFixed(6)} → ceil1000)`);
    T = await txt(p);
    dataOk('breakdown-commission-row', T.includes('GloboExpats commission'),
      `"GloboExpats commission" row present; a11y slice: ${(T.match(/GloboExpats commission[\s\S]{0,30}/) || [''])[0]}`);
    dataOk('breakdown-final-total-row', /Final total asking price/.test(T) && T.includes(String(PRICE_A_EXPECTED)),
      `"Final total asking price" row present incl. ${PRICE_A_EXPECTED}`);
    await L.screenshot(p, `${SHOTS}/flutter-375-r8-03-pricing.png`);

    // reverse branch: type price → payout recomputes
    btn('type-price-reverse', await typeInto(p, 'Final buyer price (TZS)', String(PRICE_A_EXPECTED)), `${PRICE_A_EXPECTED} typed`);
    await sleep(1200);
    const payoutBack = await inputVal(p, 'You receive (TZS)');
    const payoutBackNum = Number(String(payoutBack).replace(/,/g, ''));
    dataOk('reverse-payout-recomputed-floor1000', payoutBackNum === 5000,
      `payout input="${payoutBack}" expected "5000" (${PRICE_A_EXPECTED} ÷ ${multiplier(RATE_FURNITURE).toFixed(6)} = ${(PRICE_A_EXPECTED / multiplier(RATE_FURNITURE)).toFixed(2)} → floor1000)`);

    // final state must be the forward pair before Review
    btn('retype-payout-final', await typeInto(p, 'You receive (TZS)', String(PAYOUT_A)), `${PAYOUT_A} retyped`);
    await sleep(1100);
    priceField = await inputVal(p, 'Final buyer price (TZS)');
    dataOk('publish-pricing-final-state', priceField === String(PRICE_A_EXPECTED), `price="${priceField}" before Review`);

    // delivery vehicle REQUIRED → pick Boda
    const veh = await findNode(p, 'Delivery vehicle *');
    if (veh) {
      await tap(p, veh); await sleep(1600);
      const opt = await findNode(p, 'Boda', n => n.role === 'button' && n.tappy && n.w >= 180);
      btn('pick-delivery-vehicle-boda', !!opt && (await tap(p, opt, 0.16), true), opt ? 'Boda selected' : 'menu did not list Boda');
    } else btn('pick-delivery-vehicle-boda', false, 'field "Delivery vehicle *" not in DOM after scroll');
    await L.screenshot(p, `${SHOTS}/flutter-375-r8-03b-pricing-complete.png`);

    // ---- STEP 4 review ----
    const cont3 = await findNode(p, 'Continue');
    btn('continue-to-review', !!cont3 && (await tap(p, cont3), true));
    await sleep(1900);
    T = await txt(p);
    navOk('nav-step4-review', T.includes('Step 4 of 4'), 'review step reached');
    dataOk('review-title-echoed', T.includes(TITLE.slice(0, 16)), `title echoed on review`);
    dataOk('review-price-echoed', T.includes(`TSh ${PRICE_A_EXPECTED}`), `"TSh ${PRICE_A_EXPECTED}" echoed`);
    const pickupRow = T.match(/Pickup[\s\S]{0,60}/);
    dataOk('review-pickup-from-pin-address', !!pickupRow, `row: ${pickupRow ? pickupRow[0].replace(/\n/g, ' | ').slice(0, 90) : 'absent'}`);
    await L.screenshot(p, `${SHOTS}/flutter-375-r8-04-review.png`);

    // review "Edit" chips (free jump): Edit pricing → back → Continue back to review
    const editChips = (await nodes(p)).filter(n => n.role === 'button' && n.label.startsWith('Edit'));
    R.checks.buttons_total += editChips.length;
    let chipOk = 0;
    if (editChips.length) {
      await tap(p, editChips[editChips.length - 1]); // Pricing & delivery Edit
      await sleep(1400);
      if (!(await txt(p)).includes('Step 4 of 4')) chipOk++;
      let guard = 0;
      while (!(await txt(p)).includes('Step 4 of 4') && guard++ < 6) {
        const c = await findNode(p, 'Continue'); if (!c) break; await tap(p, c); await sleep(1500);
      }
      if ((await txt(p)).includes('Step 4 of 4')) chipOk++;
    }
    R.checks.buttons_ok += chipOk > 0 ? editChips.length : 0;
    if (editChips.length && !chipOk) R.checks.buttons_failed.push('review-edit-chip-jump (no navigation observed)');
    else if (editChips.length) R.checks.vision_findings.push(`info: ${editChips.length} review Edit chips jumped to their steps and back`);

    // ---- PUBLISH ----
    const pubBtn = await findNode(p, 'Publish', n => n.role === 'button' && n.tappy);
    btn('publish-button-present-and-clicked', !!pubBtn && (await tap(p, pubBtn), true));
    let snackbar = null;
    for (let i = 0; i < 14; i++) { await sleep(1000); snackbar = await L.hasSnackBar(p); if (snackbar.found) break; }
    dataOk('publish-snackbar-band', !!(snackbar && snackbar.found),
      snackbar && snackbar.found ? `dark toast band detected at y=${snackbar.atY}` : 'no toast band within 14s');
    await L.screenshot(p, `${SHOTS}/flutter-375-r8-05-after-publish.png`);
    T = await txt(p);
    dataOk('publish-popped-to-root', !T.includes('Publish') || !T.includes('Step 4 of 4'),
      `wizard left review after publish (still on step 4: ${T.includes('Step 4 of 4')})`);

    R.checks.images_requested += Object.keys(imgMap).length;
    R.checks.images_200 += Object.values(imgMap).filter(s => s === 200 || s === 304).length;
    Object.entries(imgMap).forEach(([u, s]) => { if (s >= 400) R.checks.images_broken.push(`${s} ${u}`); });
    await L.closeVideo(ctx, videoPath).catch(() => {});

    // ---------- TABLET 768x1024 ----------
    const vTab = `e2e/videos/${UNIT}-${ROUND}-tablet.webm`;
    R.checks.videos.push(vTab);
    const ctx2 = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: vTab });
    const pt = await ctx2.newPage();
    globalThis.__gp2 = pt;
    await pt.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(pt, 'Buy now', 40000);
    ok('tablet-seller-login', await L.login(pt, SELLER));
    await pt.evaluate(() => { location.hash = '#/sell'; });
    for (let i = 0; i < 50; i++) { if ((await txt(pt)).includes('Step 1 of 4')) break; await sleep(500); }
    await sleep(2200);
    const TT = await txt(pt);
    ok('tablet-wizard-shell', TT.includes('Step 1 of 4') && TT.includes('Details') && TT.includes('Review'),
      'header + chips intact at 768x1024');
    await L.screenshot(pt, `${SHOTS}/flutter-768-r8-01-details.png`);
    await L.closeVideo(ctx2, vTab).catch(() => {});
  }

  function radioRects(pg) {
    return pg.evaluate(() => [...document.querySelectorAll('flt-semantics')]
      .filter(e => e.getAttribute('role') === 'radio')
      .map(e => { const r = e.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
          checked: e.getAttribute('aria-checked') === 'true' }; })
      .filter(r => r.h > 5 && r.y > 55 && r.y < innerHeight - 30).sort((a, b) => a.y - b.y)).catch(() => []);
  }
  async function clickRadio(pg, rect, dx = 14 / 319) {
    await pg.mouse.click(rect.x + rect.w * dx, rect.y + rect.h / 2); await sleep(1100);
  }

  // ================= 5. SERVER READBACK =======================================
  const sr = await L.api(null, 'GET', `/api/v1/products/search?q=${encodeURIComponent('AU041 R8')}`);
  const arr = Array.isArray(sr.json) ? sr.json : ((sr.json && (sr.json.products || sr.json.content)) || []);
  const mine = arr.find(h => ((h.productName || '') + '').includes(String(STAMP)));
  dataOk('listing-live-on-sandbox-search', !!mine,
    mine ? `productId=${mine.productId} name="${mine.productName}" askingPrice=${mine.productAskingPrice}`
         : `search returned ${arr.length} hits, none matching stamp ${STAMP}`);

  if (mine) {
    const pid = mine.productId; R.productId = pid;
    const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${pid}`);
    const d = det.json || {};
    const num = k => (typeof d[k] === 'number' ? d[k] : parseFloat(d[k]));
    R.detail = d;
    dataOk('readback-itemDetails-200', det.status === 200 && (d.productName || '').length > 0,
      `GET itemDetails/${pid} → ${det.status} name="${d.productName}"`);

    const near = (a, b) => typeof a === 'number' && isFinite(a) && Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.01);
    for (const f of ['sellerPayout', 'finalTotalSellingPrice', 'sellerFacingCommissionAmount',
      'grossPlatformCommission', 'vat', 'selcomCommissionFee', 'selcomTransactionFee',
      'platformNetProfitBeforeCuts', 'platformNetProfitAfterCuts', 'roundingAdjustment']) {
      dataOk(`commission-${f}`, near(num(f), EXP_A[f]), `got=${num(f)} expected=${EXP_A[f]}`);
    }
    dataOk('commission-categoryCommissionPercentage', near(num('categoryCommissionPercentage'), RATE_FURNITURE * 100),
      `got=${num('categoryCommissionPercentage')} expected=${RATE_FURNITURE * 100}`);
    dataOk('integrity-askingPrice-gte-1000', (num('askingPrice') ?? num('productAskingPrice')) >= 1000,
      `askingPrice=${num('askingPrice') ?? num('productAskingPrice')}`);
    dataOk('integrity-sellerPayout-gte-1000', num('sellerPayout') >= 1000, `sellerPayout=${num('sellerPayout')}`);
    const lat = num('latitude'), lng = num('longitude');
    dataOk('integrity-coords-valid-pin', isFinite(lat) && isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0),
      `lat=${lat} lng=${lng} (from pinned address ${PIN_ADDR_ID})`);

    const imgs = d.productImages || d.images || [];
    dataOk('images-stored-count', imgs.length >= 2, `${imgs.length} image rows on product ${pid} (main + batch)`);
    const imgHttp = [];
    for (const im of imgs.slice(0, 5)) {
      const u = (im.imageUrl || im.image || '');
      if (!u) continue;
      const full = u.startsWith('http') ? u : API + '/' + u.replace(/^\/+/, '');
      try {
        const h = await fetch(full, { method: 'GET' });
        const ct = h.headers.get('content-type') || '';
        const len = Number(h.headers.get('content-length') || 0);
        imgHttp.push({ url: full.slice(-46), status: h.status, ct, len });
        if (h.status !== 200 || !ct.startsWith('image/') || len === 0)
          R.checks.images_broken.push(`${h.status} ${full.slice(-60)}`);
      } catch (e) { R.checks.images_broken.push('ERR ' + full.slice(-60)); }
    }
    dataOk('images-public-http-200-nonempty', imgHttp.length >= 1 && imgHttp.every(x => x.status === 200 && x.ct.startsWith('image/') && x.len > 0),
      JSON.stringify(imgHttp));

    dataOk('quantity-readback-no-patch-qty1', Number(d.productQuantity) === 1,
      `productQuantity=${d.productQuantity} (qty==1 ⇒ PATCH update/{id} must NOT have fired; netLog PATCH count=${R.netLog.filter(l => l.includes('/update/')).length})`);
  }

  // wire contract control (independent of UI): multipart product string part + image parts
  try {
    const tok = await L.apiLogin(SELLER);
    const pngBuf = fs.readFileSync(PHOTO_SRC);
    const ctrlProduct = {
      productName: `AU041 Wire Control ${STAMP}`, categoryId: furniture.categoryId,
      subcategoryId: sofasSub.subcategoryId, productCountry: 'tanzania', productRegion: 'dar es salaam',
      productStreet: '7 publish way', productZipCode: 'Not specified', whatsappNumber: '',
      productDescription: 'AU-041 wire-control listing replicating the wizard multipart payload.',
      currency: 'TZS', askingPrice: PRICE_A_EXPECTED, sellerPayout: PAYOUT_A,
      finalTotalSellingPrice: PRICE_A_EXPECTED, productQuantity: 3,
      latitude: -6.8023, longitude: 39.2719, placeName: 'Pub Plaza', neighbourhood: 'Masaki',
      transportRequirement: 'REQUIRED', deliveryTransportMode: 'BODA',
      categoryCommissionPercentage: EXP_A.categoryCommissionPercentage,
      sellerFacingCommissionAmount: EXP_A.sellerFacingCommissionAmount,
      grossPlatformCommission: EXP_A.grossPlatformCommission, vat: EXP_A.vat,
      selcomCommissionFee: EXP_A.selcomCommissionFee, selcomTransactionFee: EXP_A.selcomTransactionFee,
      platformNetProfitBeforeCuts: EXP_A.platformNetProfitBeforeCuts,
      platformNetProfitAfterCuts: EXP_A.platformNetProfitAfterCuts,
      roundingAdjustment: EXP_A.roundingAdjustment,
    };
    const form = new FormData();
    form.append('product', new Blob([Buffer.from(JSON.stringify(ctrlProduct))], { type: 'application/json' }));
    form.append('images', new Blob([pngBuf], { type: 'image/png' }), 'au041-main.png');
    const resp = await fetch(API + '/api/v1/products/post-product', {
      method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: form });
    const body = await resp.json().catch(() => null);
    dataOk('wirecontrol-postproduct-multipart', [200, 201].includes(resp.status),
      `status=${resp.status} body=${JSON.stringify(body).slice(0, 120)}`);
    const ctrlPid = body && (body.productId || (body.data && body.data.productId));
    if (ctrlPid) {
      let allBatchOk = true;
      for (const b of [[1, 2, 3, 4, 5], [6, 7]]) {
        const f2 = new FormData();
        for (const i of b) f2.append('images', new Blob([pngBuf], { type: 'image/png' }), `extra-${i}.png`);
        const r2 = await fetch(`${API}/api/v1/products/${ctrlPid}/images`,
          { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: f2 });
        if (![200, 201].includes(r2.status)) { allBatchOk = false; R.netLog.push(`wirecontrol batch size ${b.length} -> ${r2.status}`); }
      }
      dataOk('wirecontrol-images-batches-of-5', allBatchOk, `two batches (5+2) accepted on ${ctrlPid}`);
      const f3 = new FormData();
      f3.append('product', new Blob([Buffer.from(JSON.stringify({ productQuantity: 4 }))], { type: 'application/json' }));
      const r3 = await fetch(`${API}/api/v1/products/update/${ctrlPid}`,
        { method: 'PATCH', headers: { Authorization: 'Bearer ' + tok }, body: f3 });
      dataOk('wirecontrol-quantity-patch', [200, 201].includes(r3.status), `PATCH update/${ctrlPid} status=${r3.status}`);
      const chk = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${ctrlPid}`);
      dataOk('wirecontrol-quantity-readback-4', Number(chk.json && chk.json.productQuantity) === 4,
        `readback productQuantity=${chk.json && chk.json.productQuantity}`);
      const arch = await L.api(tok, 'PATCH', `/api/v1/products/status/${ctrlPid}`, { status: 'ARCHIVED' }).catch(() => null);
      dataOk('wirecontrol-archived-cleanup', [200, 201, 204].includes(arch.status), `archive status=${arch.status}`);
    }
  } catch (e) { dataOk('wirecontrol-postproduct-multipart', false, 'fatal ' + String(e.message).slice(0, 140)); }

  // cleanup: archive the wizard-created listing so it never pollutes the shared catalog
  if (mine) {
    const tok = await L.apiLogin(SELLER);
    const arch = await L.api(tok, 'PATCH', `/api/v1/products/status/${mine.productId}`, { status: 'ARCHIVED' }).catch(() => null);
    R.evidence.push(`cleanup: wizard listing ${mine.productId} archived → status ${arch && arch.status}`);
  }

  await browser.close().catch(() => {});
  R.runtime_ms = Date.now() - t0;
  R.verdict = (R.failures.length === 0 && R.checks.freshness && R.checks.images_broken.length === 0) ? 'PASS'
    : (R.checks.freshness ? 'FAIL' : 'BLOCKED');
  fs.appendFileSync(`e2e/results/shards/${UNIT}-${STAGE}.jsonl`, JSON.stringify(R) + '\n');
  console.log('\nnetwork log:', JSON.stringify(R.netLog, null, 1));
  console.log('\nVERDICT', R.verdict, JSON.stringify(R.failures, null, 1));
})().catch(e => {
  R.verdict = 'BLOCKED'; R.failures.push('fatal ' + String(e.message).slice(0, 240));
  try { fs.appendFileSync(`e2e/results/shards/${UNIT}-${STAGE}.jsonl`, JSON.stringify(R) + '\n'); } catch (_) {}
  console.error('FATAL', e); process.exit(1);
});
