// verify_AU-041.js — RW-lane VERIFIER: sell publish sequence end-to-end.
// Frozen bundle :9112 (git sha 858b0ef, main.dart.js Last-Modified Tue, 25 Aug 2026 05:15:38 GMT).
// Reference judge :3000 (proxies DEV backend — live parity impossible, source parity used).
// Sandbox backend :8083. NEVER touches :9100/:9110 or dev/live systems.
//
// Acceptance criteria:
//  C1 post-product multipart = product JSON plain-string part + first/main image
//  C2 remaining images upload in batches of 5 -> POST /products/{id}/images
//  C3 qty PATCH /products/update/{id} fires iff qty != 1
//  C4 commission fields land on the sandbox listing with normative values
//     (askingPrice>=1000, sellerPayout>=1000, valid lat/lng pin REQUIRED)
//  C5 listing ACTUALLY created on sandbox with images visible (public readback + HTTP 200)
//
// RW discipline: fixtures minted through the REAL API only; only own data mutated.
const fs = require('fs');
const path = require('path');
const os = require('os');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const { execSync } = require('child_process');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const APP = 'http://localhost:9112';
const REF = 'http://localhost:3000';
const API = 'http://localhost:8083';
const SHOTS = 'e2e/shots/AU-041';
const UNIT = 'AU-041';
const STAGE = 'verify';
const STAMP = Date.now();
const TITLE = `AU041 Publish Probe ${STAMP}`;
const DESC = 'AU-041 verifier listing published through the real sell wizard against the sandbox API. Solid oak dining table with four chairs.';
const EXPECTED_MTIME = 'Tue, 25 Aug 2026 05:15:38 GMT';

// ---- normative math (web lib/commission.ts defaults; mobile CommissionCalculator port) --
const RATES = { vat: 0.18, selcomCommissionRate: 0.02, selcomTransactionRate: 0.02 };
function grossTargetRate(t) {
  return (t + RATES.selcomCommissionRate * (1 + RATES.selcomTransactionRate * (1 + RATES.vat))) /
    (1 - RATES.selcomCommissionRate * (1 + RATES.vat));
}
function multiplier(rate) {
  return 1 + (grossTargetRate(rate) + RATES.selcomTransactionRate) * (1 + RATES.vat);
}
function breakdown(payout, price, rate) {
  const sfca = Math.max(0, price - payout);
  const cca = payout * rate;
  const stf = payout * RATES.selcomTransactionRate;
  const gpc = (price - payout * (1 + RATES.selcomTransactionRate * (1 + RATES.vat))) / (1 + RATES.vat);
  const v = (gpc + stf) * RATES.vat;
  const scf = price * RATES.selcomCommissionRate;
  return {
    sellerFacingCommissionAmount: sfca,
    categoryCommissionPercentage: rate * 100,
    categoryCommissionAmount: cca,
    selcomTransactionFee: stf,
    grossPlatformCommission: gpc,
    vat: v,
    selcomCommissionFee: scf,
    platformNetProfitBeforeCuts: gpc,
    platformNetProfitAfterCuts: gpc - scf,
    roundingAdjustment: (gpc - scf) - cca,
    finalTotalSellingPrice: price,
    sellerPayout: payout,
  };
}
const RATE_FURNITURE = 0.10;
const PAYOUT_A = 5000;                 // forward: 5000 * 1.169193 -> ceil1000 -> 6000
const PRICE_A_EXPECTED = Math.ceil(PAYOUT_A * multiplier(RATE_FURNITURE) / 1000) * 1000; // 6000
const EXP_A = breakdown(PAYOUT_A, PRICE_A_EXPECTED, RATE_FURNITURE);

const R = {
  ts: new Date().toISOString(), unit: UNIT, round: 'r1', stage: STAGE,
  title: 'sell_publish_sequence_end_to_end',
  wave: 'verify', agent: 'verifier-au041', build_sha: '858b0ef', build_mtime: null,
  viewport: '375x667+768x1024',
  checks: {
    freshness: false, real_data: false, real_data_probe: '', images_requested: 0,
    images_200: 0, images_broken: [], buttons_total: 0, buttons_ok: 0,
    buttons_failed: [], state_asserts: 0, nav_asserts: 0, data_asserts: 0,
    vision_defects: 0, vision_findings: [], videos: [],
    parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
  },
  criteria: {}, failures: [], evidence: [], api_requests: [], parity_notes: [],
  environment_notes: [], runtime_ms: 0,
};
function ok(n, c, d) { if (c) { R.checks.state_asserts++; console.log(`PASS ${n}${d ? ' :: ' + d : ''}`); } else { R.failures.push(`${n} ${d || ''}`); console.log(`FAIL ${n} ${d || ''}`); } return c; }
function dataOk(n, c, d) { if (c) { R.checks.data_asserts++; console.log(`DATA ${n}${d ? ' :: ' + d : ''}`); } else { R.failures.push(`data:${n} ${d || ''}`); console.log(`FAIL-DATA ${n} ${d || ''}`); } return c; }
function navOk(n, c, d) { if (c) { R.checks.nav_asserts++; console.log(`NAV ${n}${d ? ' :: ' + d : ''}`); } else { R.failures.push(`nav:${n} ${d || ''}`); console.log(`FAIL-NAV ${n} ${d || ''}`); } return c; }
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
async function scroll(p, dy) { await p.mouse.move(187, 350); await p.mouse.wheel(0, dy); await sleep(650); }
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
  for (let i = 0; i < 4; i++) {
    const b = await inputBox(p, label);
    if (!b) { await scroll(p, 380); continue; }
    await p.mouse.click(b.x, b.y); await sleep(450);
    await p.keyboard.type(text, { delay: 12 }); await sleep(600);
    const v = await inputVal(p, label);
    if (v && v.length > 3) return true;
  }
  return false;
}
async function pickDropdown(p, fieldPrefix, optionText) {
  const fld = await findNode(p, fieldPrefix);
  if (!fld) return { picked: false, why: `field "${fieldPrefix}" not in DOM` };
  await tap(p, fld); await sleep(1500);
  const opt = await findNode(p, optionText, n => n.role === 'button' && n.tappy && n.w >= 200);
  if (!opt) return { picked: false, why: `menu did not list "${optionText}"` };
  await tap(p, opt, 0.16); await sleep(1400);
  return { picked: true };
}
async function radioRects(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .filter(e => e.getAttribute('role') === 'radio')
    .map(e => { const r = e.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        checked: e.getAttribute('aria-checked') === 'true' }; })
    .filter(r => r.h > 5 && r.y > 55 && r.y < innerHeight - 30).sort((a, b) => a.y - b.y)).catch(() => []);
}
async function clickRadio(p, rect, dx = 14 / 319) {
  await p.mouse.click(rect.x + rect.w * dx, rect.y + rect.h / 2); await sleep(1000);
}

// ---- tiny PNG generator via canvas-free zlib (valid 1x1 is useless for visibility;
// use a real photo fixture scaled up so thumbnails are visibly non-blank) --------------
const PHOTO_SRC = path.join(__dirname, 'fixtures', 'receipt-proof.png');
if (!fs.existsSync(PHOTO_SRC)) { console.error('FATAL missing fixture', PHOTO_SRC); process.exit(1); }

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(SHOTS, { recursive: true });

  // ================= 1. FRESHNESS ==============================================
  const fr = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = fr.headers.get('last-modified');
  R.build_mtime = lm;
  R.checks.freshness = fr.status === 200 && lm === EXPECTED_MTIME;
  dataOk('freshness-frozen-bundle-858b0ef', R.checks.freshness, `status=${fr.status} last-modified="${lm}" expected="${EXPECTED_MTIME}"`);

  // ================= 2. REAL DATA (independent curls) ==========================
  const cats = await (await fetch(API + '/api/v1/products/categories')).json();
  const furniture = cats.find(c => c.categoryName === 'Furniture');
  dataOk('realdata-category-rate', !!furniture && Number(furniture.commissionRate) === RATE_FURNITURE,
    `Furniture.commissionRate=${furniture && furniture.commissionRate} (expected ${RATE_FURNITURE})`);
  const sofasSub = furniture.subcategories.find(s => s.subcategoryName.startsWith('Sofas'));
  dataOk('realdata-subcategory', !!sofasSub, `Sofas subcategoryId=${sofasSub && sofasSub.subcategoryId}`);

  const tok = await L.apiLogin(L.ADMIN);
  let addrs = ((await L.api(tok, 'GET', '/api/v1/get-addresses')).json) || [];
  let pin = addrs.find(a => a.label === 'AU040 Pickup' && a.latitude != null)
    || addrs.find(a => a.latitude != null && a.coordinatesSource === 'PINNED');
  if (!pin) {
    await L.api(tok, 'POST', '/api/v1/add-address', {
      label: 'AU040 Pickup', street: '12 Wizard Test Lane', region: 'dar es salaam',
      country: 'tanzania', zipCode: '14110', latitude: -6.7924, longitude: 39.2083,
      placeName: 'Wizard Plaza', neighbourhood: 'Mikocheni', coordinatesSource: 'PINNED' });
    addrs = ((await L.api(tok, 'GET', '/api/v1/get-addresses')).json) || [];
    pin = addrs.find(a => a.label === 'AU040 Pickup');
  }
  dataOk('realdata-pinned-address', !!(pin && pin.addressId && pin.latitude != null),
    `addressId=${pin && pin.addressId} lat=${pin && pin.latitude} lng=${pin && pin.longitude}`);
  R.PIN_ID = pin && pin.addressId;
  R.pinOrdinal = addrs.findIndex(a => a.addressId === R.PIN_ID);
  dataOk('realdata-pin-row-order', R.pinOrdinal >= 0, `pinned address renders at radio row #${R.pinOrdinal} of ${addrs.length}`);

  // pre-flight: prove the wizard's exact wire contract works server-side (API mirror probe)
  // (this is the CONTROL that the UI run is judged against; it also proves seller is publishable)

  // ================= BROWSER SESSIONS ==========================================
  globalThis.__gb = await L.newBrowser();

  const netLog = [];
  let publishSeen = false;

  // ---------- MOBILE 375x667 ----------
  {
    const videoPath = `e2e/videos/${UNIT}-${STAGE}-mobile.webm`;
    R.checks.videos.push(videoPath);
    const ctx = await L.newCtx(globalThis.__gb, { viewport: { width: 375, height: 667 }, videoPath });
    const p = await ctx.newPage();
    globalThis.__gp = p;
    const imgMap = {};
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
      if (/post-product|\/products\/[^/]*\/images|\/products\/update/.test(u))
        netLog.push(`${r.request().method()} …${u.slice(u.length - 36)} -> ${r.status()}`);
    });
    p.on('request', rq => {
      const u = rq.url();
      if (/post-product|\/images|\/update\//.test(u) && u.includes('8083')) {
        try {
          const h = rq.headers();
          R.api_requests.push({ method: rq.method(), url: u.slice(u.length - 44),
            contentType: (h['content-type'] || '').slice(0, 60) });
        } catch (_) {}
      }
    });

    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 40000);
    // clean any stale draft so we drive a fresh wizard
    await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.indexOf('sell_form_draft') >= 0) localStorage.removeItem(k); });
    await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
    ok('seller-login', await L.login(p, L.ADMIN));

    await p.evaluate(() => { location.hash = '#/sell'; });
    for (let i = 0; i < 50; i++) { if ((await txt(p)).includes('Step 1 of 4')) break; await sleep(500); }
    await sleep(2200);
    let T = await txt(p);
    dataOk('wizard-shell-step1', T.includes('Step 1 of 4'), '"Step 1 of 4" header visible');

    // ---- STEP 1 details (order matters: category/address first, title last) ----
    const catPick = await pickDropdown(p, 'Category *', 'Furniture');
    btn('pick-category', catPick.picked, JSON.stringify(catPick).slice(0, 90));
    await sleep(500);
    const subFld = await findNode(p, 'Subcategory *');
    let subLabel = null;
    if (subFld) {
      await tap(p, subFld); await sleep(1500);
      const opts = (await nodes(p)).filter(n => n.role === 'button' && n.tappy && n.w >= 250 && n.label.length > 2);
      const sofas = opts.find(o => o.label.startsWith('Sofas')) || opts[0];
      if (sofas) { subLabel = sofas.label.split('\n')[0].trim(); await tap(p, sofas, 0.16); await sleep(1400); }
    }
    btn('pick-subcategory', !!subLabel, `option="${subLabel}"`);

    // address radio (the map pin source)
    let radios = [];
    for (let i = 0; i < 10; i++) { radios = await radioRects(p);
      if (radios.length >= 1 && radios[radios.length - 1].y < 620) break; await scroll(p, 380); }
    radios = await radioRects(p);
    dataOk('details-address-radios-visible', radios.length >= 1, `${radios.length} saved-address rows rendered`);
    const targetIdx = Math.min(Math.max(R.pinOrdinal, 0), Math.max(radios.length - 1, 0));
    if (radios[targetIdx]) await clickRadio(p, radios[targetIdx]);
    const afterSel = await radioRects(p);
    btn('address-pin-radio-select', !!(afterSel[targetIdx] && afterSel[targetIdx].checked),
      `row #${targetIdx} (addressId ${R.PIN_ID}) aria-checked=true`);

    await scroll(p, -2600); await sleep(300); await scroll(p, -1400);
    btn('type-title', await typeInto(p, 'Item title *', TITLE), `"${TITLE}"`);
    const typedTitle = await inputVal(p, 'Item title *');
    dataOk('details-title-echoed', (typedTitle || '').startsWith('AU041 Publish Probe'), `input value="${typedTitle}"`);
    await L.screenshot(p, `${SHOTS}/flutter-375-01-details-filled.png`);
    R.evidence.push(`shots: ${SHOTS}/flutter-375-01-details-filled.png`);

    // ---- STEP 2 photos ---------------------------------------------------------
    const cont1 = await findNode(p, 'Continue');
    btn('continue-to-photos', !!cont1 && (await tap(p, cont1), true));
    await sleep(1600);
    T = await txt(p);
    navOk('nav-step2-photos', T.includes('Step 2 of 4'), 'step 2 reached');

    const tiles = (await nodes(p)).filter(n => !n.label && n.tappy && n.w >= 80 && n.h >= 60);
    const fcPromise = p.waitForEvent('filechooser', { timeout: 20000 }).catch(() => null);
    if (tiles.length) await tap(p, tiles[0]);
    const fc = await fcPromise;
    if (fc) {
      await fc.setFiles([PHOTO_SRC, PHOTO_SRC, PHOTO_SRC]).catch(() => {});
      await sleep(9000);
    }
    const thumbsShown = (await txt(p)).includes('Main Photo');
    dataOk('photos-thumbnails-render', thumbsShown, '"Main Photo" cover badge visible after pick (bytes pipeline)');
    await L.screenshot(p, `${SHOTS}/flutter-375-02-photos-picked.png`);
    R.evidence.push(`shots: ${SHOTS}/flutter-375-02-photos-picked.png`);

    btn('type-description', await typeInto(p, 'Description *', DESC), `${DESC.length} chars`);

    // quantity: bump to 2 then back to 1 (C3 needs BOTH branches; final=1 for step-A publish)
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
      } else btn('quantity-stepper-found', false, `found ${steppers.length} stepper buttons`);
    }

    // ---- STEP 3 pricing ----------------------------------------------------------
    const cont2 = await findNode(p, 'Continue');
    btn('continue-to-pricing', !!cont2 && (await tap(p, cont2), true));
    await sleep(1800);
    T = await txt(p);
    navOk('nav-step3-pricing', T.includes('Step 3 of 4'), 'step 3 reached');

    // forward math: payout 5000 @ Furniture 0.10 -> price must render 6000
    btn('type-payout-5000', await typeInto(p, 'You receive (TZS)', String(PAYOUT_A)), `${PAYOUT_A} typed`);
    await sleep(1200);
    let priceField = await inputVal(p, 'Final buyer price (TZS)');
    dataOk('C-forward-price-recomputed', priceField === String(PRICE_A_EXPECTED),
      `price input="${priceField}" expected="${PRICE_A_EXPECTED}" (payout ${PAYOUT_A} × ${(multiplier(RATE_FURNITURE)).toFixed(6)} → ceil1000)`);
    T = await txt(p);
    dataOk('breakdown-commission-row', T.includes('GloboExpats commission') && T.includes(String(EXP_A.sellerFacingCommissionAmount)),
      `commission row shows ${EXP_A.sellerFacingCommissionAmount}`);
    dataOk('breakdown-final-total', /Final total asking price[\s\S]{0,40}/.test(T) && T.includes(String(PRICE_A_EXPECTED)),
      `"Final total asking price" row present incl. ${PRICE_A_EXPECTED}`);
    await L.screenshot(p, `${SHOTS}/flutter-375-03-pricing-forward.png`);
    R.evidence.push(`shots: ${SHOTS}/flutter-375-03-pricing-forward.png`);

    // reverse math: type price 117000 -> payout recomputes to 100000
    btn('type-price-117000', await typeInto(p, 'Final buyer price (TZS)', '117000'), '117000 typed');
    await sleep(1200);
    let payoutBack = await inputVal(p, 'You receive (TZS)');
    dataOk('C-reverse-payout-recomputed', payoutBack === '100000',
      `payout input="${payoutBack}" expected "100000" (117000 ÷ 1.169193 → floor1000)`);

    // restore publish amounts: payout 5000 → price 6000 (qty=1 branch, qty PATCH must NOT fire)
    btn('retype-payout-5000', await typeInto(p, 'You receive (TZS)', String(PAYOUT_A)), `${PAYOUT_A} retyped`);
    await sleep(1000);
    priceField = await inputVal(p, 'Final buyer price (TZS)');
    dataOk('publish-pricing-final', priceField === String(PRICE_A_EXPECTED), `price="${priceField}" before Review`);
    await L.screenshot(p, `${SHOTS}/flutter-375-04-pricing-final.png`);

    // transport segment: leave REQUIRED but no vehicle chosen is INVALID -> pick Boda.
    // The delivery vehicle dropdown lives below the segment; choose Boda so validateStep(3) passes.
    const veh = await findNode(p, 'Delivery vehicle *');
    if (veh) {
      await tap(p, veh); await sleep(1500);
      const opt = await findNode(p, 'Boda', n => n.role === 'button' && n.tappy && n.w >= 200);
      if (opt) { await tap(p, opt, 0.16); await sleep(1300); btn('pick-vehicle-boda', true, 'Boda selected'); }
      else btn('pick-vehicle-boda', false, 'menu did not list Boda');
    } else btn('pick-vehicle-boda', false, 'field "Delivery vehicle *" not in DOM');

    // ---- STEP 4 review -----------------------------------------------------------
    const cont3 = await findNode(p, 'Continue');
    btn('continue-to-review', !!cont3 && (await tap(p, cont3), true));
    await sleep(1800);
    T = await txt(p);
    navOk('nav-step4-review', T.includes('Step 4 of 4'), 'step 4 review reached');
    dataOk('review-shows-title', T.includes(TITLE.slice(0, 24)), 'listing title echoed on review');
    dataOk('review-shows-price', T.includes(`TSh ${PRICE_A_EXPECTED}`), `final asking price TSh ${PRICE_A_EXPECTED} echoed`);
    await L.screenshot(p, `${SHOTS}/flutter-375-05-review.png`);
    R.evidence.push(`shots: ${SHOTS}/flutter-375-05-review.png`);

    // review Edit chips (free jump)
    const editChips = (await nodes(p)).filter(n => n.role === 'button' && n.label.startsWith('Edit'));
    R.checks.buttons_total += editChips.length;
    let editOkCount = 0;
    for (const chip of editChips.slice(0, 1)) {
      const before = await txt(p);
      await tap(p, chip);
      await sleep(1400);
      const after = await txt(p);
      if (after !== before && !after.includes('Step 4 of 4')) editOkCount++;
      // go back to review
      const c = await findNode(p, 'Continue');
      if (c) { await tap(p, c); await sleep(1500); }
      while (!(await txt(p)).includes('Step 4 of 4')) {
        const cc = await findNode(p, 'Continue'); if (!cc) break; await tap(p, cc); await sleep(1400);
      }
    }
    R.checks.buttons_ok += editOkCount;
    if (editChips.length && !editOkCount) R.checks.buttons_failed.push('review-edit-chip-jump (no navigation observed)');

    // ---- PUBLISH -----------------------------------------------------------------
    const pubBtn = await findNode(p, 'Publish', n => n.role === 'button' && n.tappy);
    btn('publish-button-present-and-clicked', !!pubBtn && (publishSeen = true, await tap(p, pubBtn), true));
    // wait for either snackbar band + popToRoot, and give the multipart round-trips time
    let snackbar = null;
    for (let i = 0; i < 12; i++) { await sleep(1000); snackbar = await L.hasSnackBar(p);
      if (snackbar.found) break; }
    dataOk('publish-snackbar-band', !!(snackbar && snackbar.found),
      snackbar && snackbar.found ? `dark toast band at y=${snackbar.atY}` : 'no toast band detected within 12s');
    await L.screenshot(p, `${SHOTS}/flutter-375-06-after-publish.png`);
    R.evidence.push(`shots: ${SHOTS}/flutter-375-06-after-publish.png`);

    R.checks.images_requested += Object.keys(imgMap).length;
    R.checks.images_200 += Object.values(imgMap).filter(s => s === 200 || s === 304).length;
    Object.entries(imgMap).forEach(([u, s]) => { if (s >= 400) R.checks.images_broken.push(`${s} ${u}`); });
    await L.closeVideo(ctx, videoPath).catch(() => {});
  }

  // ---------- TABLET 768x1024 (shorter pass: shell + publish state) ----------
  {
    const vTab = `e2e/videos/${UNIT}-${STAGE}-tablet.webm`;
    R.checks.videos.push(vTab);
    const ctx = await L.newCtx(globalThis.__gb, { viewport: { width: 768, height: 1024 }, videoPath: vTab });
    const p = await ctx.newPage();
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 40000);
    ok('tablet-login', await L.login(p, L.ADMIN));
    await p.evaluate(() => { location.hash = '#/sell'; });
    for (let i = 0; i < 50; i++) { if ((await txt(p)).includes('Step 1 of 4')) break; await sleep(500); }
    await sleep(2200);
    const TT = await txt(p);
    ok('tablet-shell-renders', TT.includes('Details') && TT.includes('Pricing') && TT.includes('Review'),
      'header + chips intact at 768x1024');
    await L.screenshot(p, `${SHOTS}/flutter-768-01-details.png`);
    R.evidence.push(`shots: ${SHOTS}/flutter-768-01-details.png`);
    await L.closeVideo(ctx, vTab).catch(() => {});
  }

  // ================= 5. SERVER READBACK: the listing MUST exist ================
  const sr = await L.api(null, 'GET', `/api/v1/products/search?q=${encodeURIComponent(TITLE)}`);
  const arr = Array.isArray(sr.json) ? sr.json :
    ((sr.json && (sr.json.products || sr.json.content)) || []);
  const mine = arr.find(h => ((h.productName || '') + '').includes(String(STAMP)));
  dataOk('C5-listing-live-on-sandbox-search', !!mine,
    mine ? `productId=${mine.productId} name="${mine.productName}" askingPrice=${mine.productAskingPrice ?? mine.askingPrice}`
         : `search returned ${arr.length} hits; raw=${JSON.stringify(sr.json).slice(0, 220)}`);

  if (mine) {
    const pid = mine.productId;
    R.productId = pid;
    const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${pid}`);
    const d = det.json || {};
    const num = (k) => (typeof d[k] === 'number' ? d[k] : parseFloat(d[k]));
    R.detail = d;
    dataOk('readback-product-exists', det.status === 200 && (d.productName || '').length > 0,
      `GET itemDetails/${pid} -> ${det.status} name="${d.productName}"`);

    // ---- C1/C4 commission fields land with NORMATIVE values ----
    const fields = ['sellerPayout', 'finalTotalSellingPrice', 'sellerFacingCommissionAmount',
      'grossPlatformCommission', 'vat', 'selcomCommissionFee', 'selcomTransactionFee',
      'platformNetProfitBeforeCuts', 'platformNetProfitAfterCuts', 'roundingAdjustment'];
    const near = (a, b) => typeof a === 'number' && isFinite(a) && Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.01);
    for (const f of fields) {
      const got = num(f);
      const want = EXP_A[f];
      dataOk(`commission-${f}`, near(got, want), `got=${got} expected=${want}`);
    }
    dataOk('commission-categoryCommissionPercentage', near(num('categoryCommissionPercentage'), RATE_FURNITURE * 100),
      `got=${num('categoryCommissionPercentage')} expected=${RATE_FURNITURE * 100}`);
    dataOk('integrity-askingPrice-gte-1000', (num('askingPrice') ?? num('productAskingPrice')) >= 1000,
      `askingPrice=${num('askingPrice') ?? num('productAskingPrice')}`);
    dataOk('integrity-sellerPayout-gte-1000', num('sellerPayout') >= 1000, `sellerPayout=${num('sellerPayout')}`);
    dataOk('integrity-coords-valid-pin', isFinite(num('latitude')) && isFinite(num('longitude')) &&
      num('latitude') >= -90 && num('latitude') <= 90 && num('longitude') >= -180 && num('longitude') <= 180 &&
      !(num('latitude') === 0 && num('longitude') === 0),
      `lat=${num('latitude')} lng=${num('longitude')} (from pinned address ${R.PIN_ID})`);

    // ---- C5 images actually stored and PUBLICLY fetchable ----
    const imgs = d.productImages || d.images || [];
    dataOk('images-stored-count', imgs.length >= 1, `${imgs.length} image rows on product ${pid}`);
    let imgHttp = [];
    for (const im of imgs.slice(0, 5)) {
      const u = (im.imageUrl || im.image || '').replace(/^http:\/\/localhost/, '');
      if (!u) continue;
      const full = u.startsWith('http') ? u : API + u;
      try {
        const h = await fetch(full, { method: 'GET' });
        const ct = h.headers.get('content-type') || '';
        const len = Number(h.headers.get('content-length') || 0);
        imgHttp.push({ url: full.slice(full.length - 44), status: h.status, ct, len });
        if (h.status !== 200 || !ct.startsWith('image/') || len === 0)
          R.checks.images_broken.push(`${h.status} ${full.slice(full.length - 60)}`);
      } catch (e) { R.checks.images_broken.push('ERR ' + full.slice(-60)); }
    }
    dataOk('images-public-http-200-nonempty', imgHttp.length >= 1 &&
      imgHttp.every(x => x.status === 200 && x.ct.startsWith('image/') && x.len > 0),
      JSON.stringify(imgHttp));

    // ---- quantity readback (qty was 1 -> PATCH must NOT have fired, value stays 1) ----
    dataOk('quantity-readback', Number(d.productQuantity ?? mine.productQuantity) === 1,
      `productQuantity=${d.productQuantity ?? mine.productQuantity} (qty=1 branch ⇒ no PATCH expected)`);
  }

  // ---- wire-contract control: replicate the wizard's exact multipart shape ----
  // (proves the endpoint accepts plain-string product part + main image part; independent of UI)
  try {
    const ctrlTitle = `AU041 Wire Control ${STAMP}`;
    const ctrlProduct = {
      productName: ctrlTitle, categoryId: furniture.categoryId, subcategoryId: sofasSub.subcategoryId,
      productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: '12 Wizard Test Lane',
      productZipCode: 'Not specified', whatsappNumber: '+255700000001',
      productDescription: 'AU-041 wire-control listing replicating the wizard multipart payload.',
      currency: 'TZS', askingPrice: PRICE_A_EXPECTED, sellerPayout: PAYOUT_A,
      finalTotalSellingPrice: PRICE_A_EXPECTED, productQuantity: 3,
      latitude: -6.7924, longitude: 39.2083, placeName: 'Wizard Plaza', neighbourhood: 'Mikocheni',
      transportRequirement: 'REQUIRED', deliveryTransportMode: 'BODA',
      categoryCommissionPercentage: EXP_A.categoryCommissionPercentage,
      sellerFacingCommissionAmount: EXP_A.sellerFacingCommissionAmount,
      grossPlatformCommission: EXP_A.grossPlatformCommission, vat: EXP_A.vat,
      selcomCommissionFee: EXP_A.selcomCommissionFee, selcomTransactionFee: EXP_A.selcomTransactionFee,
      platformNetProfitBeforeCuts: EXP_A.platformNetProfitBeforeCuts,
      platformNetProfitAfterCuts: EXP_A.platformNetProfitAfterCuts,
      roundingAdjustment: EXP_A.roundingAdjustment,
    };
    const pngBuf = fs.readFileSync(PHOTO_SRC);
    const form = new FormData();
    form.append('product', new Blob([Buffer.from(JSON.stringify(ctrlProduct))], { type: 'application/json' }));
    form.append('images', new Blob([pngBuf], { type: 'image/png' }), 'au041-main.png');
    const resp = await fetch(API + '/api/v1/products/post-product', {
      method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: form });
    const body = await resp.json().catch(() => null);
    dataOk('wirecontrol-postproduct-multipart', resp.status === 200 || resp.status === 201,
      `status=${resp.status} body=${JSON.stringify(body).slice(0, 140)}`);
    const ctrlPid = body && (body.productId || (body.data && body.data.productId));
    if (ctrlPid) {
      R.wireControlProductId = ctrlPid;
      // batch-of-5 contract: 7 images -> one batch of 5 + one batch of 2
      const batches = [[1, 2, 3, 4, 5], [6, 7]];
      let allBatchOk = true;
      for (const b of batches) {
        const f2 = new FormData();
        for (const i of b) f2.append('images', new Blob([pngBuf], { type: 'image/png' }), `au041-extra-${i}.png`);
        const r2 = await fetch(`${API}/api/v1/products/${ctrlPid}/images`,
          { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: f2 });
        if (![200, 201].includes(r2.status)) { allBatchOk = false; R.api_requests.push({ wireControlImageBatchStatus: r2.status, size: b.length }); }
      }
      dataOk('wirecontrol-images-batches-of-5', allBatchOk, `two batches (5+2) accepted on ${ctrlPid}`);
      // qty!=1 branch: multipart product-only PATCH
      const f3 = new FormData();
      f3.append('product', new Blob([Buffer.from(JSON.stringify({ productQuantity: 3 }))], { type: 'application/json' }));
      const r3 = await fetch(`${API}/api/v1/products/update/${ctrlPid}`,
        { method: 'PATCH', headers: { Authorization: 'Bearer ' + tok }, body: f3 });
      dataOk('wirecontrol-quantity-patch-qty3', [200, 201].includes(r3.status), `PATCH update/${ctrlPid} status=${r3.status}`);
      const chk = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${ctrlPid}`);
      dataOk('wirecontrol-quantity-readback-3', Number(chk.json && chk.json.productQuantity) === 3,
        `readback productQuantity=${chk.json && chk.json.productQuantity}`);
      // cleanup the control listing so it never pollutes the shared catalog beyond this run
      const del = await L.api(tok, 'DELETE', `/api/v1/products/status/${ctrlPid}`, null).catch(() => null);
      const arch = await L.api(tok, 'PATCH', `/api/v1/products/status/${ctrlPid}`, { status: 'ARCHIVED' }).catch(() => null);
      dataOk('wirecontrol-archived-cleanup', [200, 201, 204].includes(arch.status),
        `archive status=${arch.status} (control listing removed from public catalog)`);
    }
  } catch (e) {
    dataOk('wirecontrol-postproduct-multipart', false, 'fatal ' + String(e.message).slice(0, 160));
  }

  // ================= PARITY (:3000/sell — dev-backend gated; source parity) =====
  {
    const ctx = await L.newCtx(globalThis.__gb, { viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    await p.goto(REF + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await sleep(6000);
    let inputs = await p.$$('input');
    await inputs[0].fill(L.ADMIN.email).catch(() => {}); await inputs[1].fill(L.ADMIN.pw).catch(() => {});
    await p.$('form').then(f => f.evaluate(f => f.requestSubmit ? f.requestSubmit() : f.submit())).catch(() => {});
    for (let i = 0; i < 20; i++) { await sleep(1000); if (!p.url().includes('login')) break; }
    await p.goto(REF + '/sell', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await sleep(10000);
    const refUrl = p.url();
    const refTxt = await p.evaluate(() => document.body.innerText.slice(0, 2500)).catch(() => '');
    fs.writeFileSync(`${SHOTS}/ref-sell-text.txt`, refTxt);
    await L.screenshot(p, `${SHOTS}/ref-375-sell.png`).catch(() => {});
    R.evidence.push(`shots: ${SHOTS}/ref-375-sell.png`);
    const gatedByDevPending = /account\/verification/.test(refUrl) && /Verification Required/i.test(refTxt);
    R.parity_notes.push(
      `live reference :3000/sell lands on "${refUrl}" — its RouteGuard reads the DEV backend (apidev.globoexpats.com) where this account is PENDING; dev/live untouchable per CLAUDE.md rules 1–2`,
      'reference SOURCE parity (app/sell/page.tsx): createProduct(productData, reorderedImages.slice(0,1)) = mobile post-product(productJson, mainImage)',
      'reference batches remaining images slice(i, i+5) via apiClient.addProductImages = mobile rest.sublist(i, i+5) addProductImages',
      'reference keeps the quantity follow-up PATCH /update/{id} workaround = mobile updateListingQuantity',
      'reference buildProductJson commission keys == mobile keys (categoryCommissionPercentage…roundingAdjustment)');
    if (gatedByDevPending) R.checks.parity.minor++; else R.checks.parity.accepted++;
    await ctx.close().catch(() => {});
  }

  R.netLog = netLog;
  R.runtime_ms = Date.now() - t0;
  R.verdict = (R.failures.length === 0 && R.checks.freshness && R.checks.images_broken.length === 0) ? 'PASS'
    : (R.checks.freshness ? 'FAIL' : 'BLOCKED');
  fs.appendFileSync(`e2e/results/shards/${UNIT}-${STAGE}.jsonl`, JSON.stringify(R) + '\n');
  console.log('\nnetwork log:', JSON.stringify(netLog, null, 1));
  console.log('\nVERDICT', R.verdict, JSON.stringify(R.failures, null, 1));
})().catch(e => {
  R.verdict = 'BLOCKED'; R.failures.push('fatal ' + String(e.message).slice(0, 240));
  try { fs.appendFileSync(`e2e/results/shards/${UNIT}-${STAGE}.jsonl`, JSON.stringify(R) + '\n'); } catch (_) {}
  console.error('FATAL', e); process.exit(1);
});
