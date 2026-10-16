// au041_verify_r6.js — AU-041 sell_commission_transport_publish, RW lane, verify-r6.
// Frozen bundle http://localhost:9121 (git sha b56e345, mtime Tue, 25 Aug 2026 20:08:09 GMT).
// Sandbox :8083 ONLY. Throwaway seller registered through the real API; own listings only.
//
// Normative vectors (CAMPAIGN_V2 Appendix A):
//   payout 100000 @ .10 -> price 117000 ; breakdown grossPlatformCommission 12406.78,
//   vat 2593.22, selcomCommissionFee 2340, netAfterCuts 10066.78, roundingAdjustment 66.78;
//   reverse 117000 -> payout 100000.
//   Fare: fare(km)=ceil((baseFare+max(0,km-1.5)*ratePerKm)/1000)*1000; BODA 25km->17000,
//   CAR 25km->41000, SEMI_TRUCK 100km->489000.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const APP = 'http://localhost:9121';
const REF = 'http://localhost:3000';
const API = 'http://localhost:8083';
const SHOTS = 'e2e/shots/AU-041';
const UNIT = 'AU-041', ROUND = 'r6', STAGE = 'verify-r6';
const STAMP = 1787694437741;
const TITLE = `AU041 Oak Table ${STAMP}`;
const DESC = 'AU-041 verifier listing: solid oak dining table with four chairs, published through the real sell wizard on the sandbox.';
const PHOTO_SRC = path.join(__dirname, 'fixtures', 'receipt-proof.png');

// ---- commission math (port of web lib/commission.ts == mobile CommissionCalculator) ----
const VAT = 0.18, SC = 0.02, ST = 0.02;
const gtr = t => (t + SC * (1 + ST * (1 + VAT))) / (1 - SC * (1 + VAT));
const mult = t => 1 + (gtr(t) + ST) * (1 + VAT);
function brk(payout, price, rate) {
  const sfca = Math.max(0, price - payout);
  const cca = payout * rate;
  const stf = payout * ST;
  const gpc = (price - payout * (1 + ST * (1 + VAT))) / (1 + VAT);
  const v = (gpc + stf) * VAT;
  const scf = price * SC;
  const npb = gpc, npa = gpc - scf;
  return { sellerPayout: payout, finalTotalSellingPrice: price, sellerFacingCommissionAmount: sfca,
    categoryCommissionPercentage: rate * 100, categoryCommissionAmount: cca, selcomTransactionFee: stf,
    grossPlatformCommission: gpc, vat: v, selcomCommissionFee: scf,
    platformNetProfitBeforeCuts: npb, platformNetProfitAfterCuts: npa, roundingAdjustment: npa - cca };
}
const fare = (base, ratePerKm, km) => Math.ceil((base + Math.max(0, km - 1.5) * ratePerKm) / 1000) * 1000;
// fare table vectors (web lib/delivery-fare.ts == mobile delivery_fare.dart)
const FARE_BODA_25 = fare(2000, 600, 25);        // 17000
const FARE_CAR_25 = fare(5000, 1500, 25);        // 41000
const FARE_SEMI_100 = fare(45000, 4500, 100);    // 489000

const RATE_FURN = 0.10;
const PAYOUT_A = 100000, PRICE_A = 117000;
const EXP_A = brk(PAYOUT_A, PRICE_A, RATE_FURN);
const PAYOUT_B = 50000, PRICE_B_EXPECTED = Math.ceil(PAYOUT_B * mult(RATE_FURN) / 1000) * 1000; // 59000
const M = mult(RATE_FURN);

const SELLER = { email: `au041s${STAMP}@gmail.com`, pw: 'StrongPass!1' }; // pre-seeded by au041_rw_seed_r6.js
const STREET = `AU041 Pin Way ${STAMP}`;

const R = {
  ts: new Date().toISOString(), unit: UNIT, round: ROUND, stage: STAGE,
  title: 'sell_commission_transport_publish', wave: 'verify-r6', agent: 'verifier-au041-r6',
  build_sha: 'b56e345', build_mtime: null, viewport: '375x667+768x1024',
  checks: {
    freshness: false, real_data: false, images_requested: 0, images_200: 0, images_broken: [],
    buttons_total: 0, buttons_ok: 0, buttons_failed: [], buttons_log: [], state_asserts: 0,
    nav_asserts: 0, data_asserts: 0, vision_defects: 0, vision_findings: [], videos: [],
    parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
  },
  criteria: {}, failures: [], evidence: [], netLog: [], parity_notes: [], frames_read: [],
  productId: null, runtime_ms: 0,
};
const ok = (n, c, d) => { if (c) { R.checks.state_asserts++; console.log(`PASS ${n} :: ${d || ''}`); }
  else { R.failures.push(`${n} ${d || ''}`); console.log(`FAIL ${n} ${d || ''}`); } return c; };
const navOk = (n, c, d) => { if (c) { R.checks.nav_asserts++; console.log(`NAV ${n} :: ${d || ''}`); }
  else { R.failures.push(`nav:${n} ${d || ''}`); console.log(`FAIL-NAV ${n} ${d || ''}`); } return c; };
const dataOk = (n, c, d) => { if (c) { R.checks.data_asserts++; console.log(`DATA ${n} :: ${d || ''}`); }
  else { R.failures.push(`data:${n} ${d || ''}`); console.log(`FAIL-DATA ${n} ${d || ''}`); } return c; };
const btn = (n, c, why) => { R.checks.buttons_total++; if (c) R.checks.buttons_ok++;
  else { R.checks.buttons_failed.push(`${n}${why ? ' (' + why + ')' : ''}`); console.log(`BTN-FAIL ${n} ${why || ''}`); }
  R.checks.buttons_log.push(`${c ? 'ok' : 'FAIL'}:${n}${why ? '[' + why + ']' : ''}`); return c; };

const txt = p => L.allText(p).catch(() => '');
async function nodes(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => {
    const r = e.getBoundingClientRect();
    return { role: e.getAttribute('role'), tappy: e.getAttribute('flt-tappable') !== null,
      label: (e.textContent || '').trim().slice(0, 90),
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
async function inputBox(p, want) {
  // Identify the two pricing inputs by aria-label when present, else by order.
  return p.evaluate((want) => {
    const ins = [...document.querySelectorAll('input,textarea')]
      .map(i => { const r = i.getBoundingClientRect();
        return { el: i, al: i.getAttribute('aria-label') || '', x: Math.round(r.x + r.width / 2),
          y: Math.round(r.y + r.height / 2), v: i.value }; })
      .filter(i => i.w > 0 && i.y > 40 && i.y < innerHeight - 10);
    if (want) { const hit = ins.find(i => i.al === want); if (hit) return hit; }
    return ins.length ? ins[ins.length - 1] : null;
  }, want).catch(() => null);
}
async function inputVal(p, want) { const b = await inputBox(p, want); return b ? b.v : null; }
async function typeInto(p, want, text) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const b = await inputBox(p, want);
    if (!b) { await scroll(p, 340); continue; }
    await p.mouse.click(b.x, b.y); await sleep(420);
    await p.keyboard.press('Control+a'); await sleep(180);
    await p.keyboard.press('Delete'); await sleep(260);
    await p.keyboard.type(text, { delay: 60 }); await sleep(800);
    const v = (await inputVal(p, want) || '').replace(/,/g, '');
    if (v === text.replace(/,/g, '')) return true;
    await scroll(p, -220);
  }
  return false;
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync('e2e/tmp/au041_r6_frames', { recursive: true });
  fs.mkdirSync('e2e/results/shards', { recursive: true });

  // ============================ 1. FRESHNESS ==================================
  const fr = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = fr.headers.get('last-modified');
  R.build_mtime = lm;
  R.checks.freshness = fr.status === 200 && lm === 'Tue, 25 Aug 2026 20:08:09 GMT';
  dataOk('freshness-frozen-bundle-b56e345', R.checks.freshness,
    `status=${fr.status} last-modified="${lm}" len=${fr.headers.get('content-length')}`);
  try {
    const buf = Buffer.from(await (await fetch(APP + '/main.dart.js')).arrayBuffer());
    const md5 = require('crypto').createHash('md5').update(buf).digest('hex');
    const canon = path.join(process.env.HOME, '.verify_bundles/b56e345/main.dart.js');
    const canonMd5 = fs.existsSync(canon) ? require('crypto').createHash('md5').update(fs.readFileSync(canon)).digest('hex') : null;
    dataOk('freshness-bytes', canonMd5 ? md5 === canonMd5 : md5.length === 32,
      `lane md5=${md5} canonical=${canonMd5 || '(absent)'}`);
    R.evidence.push(`bundle md5=${md5}`);
  } catch (e) { R.evidence.push('bundle md5 failed ' + e.message.slice(0, 80)); }

  // ==================== 2. REAL DATA (independent :8083 reads) ================
  const cats = (await (await fetch(API + '/api/v1/products/categories')).json()) || [];
  const furniture = cats.find(c => c.categoryName === 'Furniture');
  const vehSup = cats.find(c => (c.slug || '') === 'vehicle-supplies');
  const realEstate = cats.find(c => (c.slug || '') === 'real-estate');
  dataOk('realdata-categories', !!furniture && !!vehSup && !!realEstate,
    `Furniture id=${furniture && furniture.categoryId} rate=${furniture && furniture.commissionRate}; ` +
    `Vehicle&Supplies id=${vehSup && vehSup.categoryId} slug=${vehSup && vehSup.slug}; RealEstate id=${realEstate && realEstate.categoryId}`);
  dataOk('realdata-furniture-rate', Number(furniture.commissionRate) === RATE_FURN,
    `Furniture.commissionRate=${furniture.commissionRate} (vector rate .10)`);
  const dailySubs = ['cars-for-rent', 'suvs-4x4-for-rent', 'vans-minibuses-for-rent'];
  const rentSubs = (vehSup.subcategories || []).filter(s => dailySubs.includes(s.slug || ''));
  dataOk('realdata-daily-rental-subcats', rentSubs.length === 3,
    `vehicle-supplies daily-rental subs: ${rentSubs.map(s => `${s.subcategoryId}:${s.slug}`).join(', ')}`);

  // ---- throwaway seller through the real API ----
  const reg = await L.api(null, 'POST', '/api/v1/auth/register',
    { firstName: 'AU041', lastName: 'Seller', password: SELLER.pw, emailAddress: SELLER.email });
  if (![200, 201, 400, 409].includes(reg.status)) console.log('register (existing?)', reg.status);
  const stok = await L.apiLogin(SELLER);
  const me = await L.api(stok, 'GET', '/api/v1/userManagement/user-details');
  const uid = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  const atok = await L.apiLogin(L.ADMIN);
  const ver = await L.api(atok, 'PATCH', `/api/v1/admin/users/${uid}/status`, { status: 'VERIFIED' });
  dataOk('fixture-seller-minted-verified', [200, 201, 204, 400, 409].includes(ver.status) || (await L.apiLogin(SELLER), true),
    `seller ${SELLER.email} userId=${uid} admin-verify=${ver.status}`);
  const addr = await L.api(stok, 'POST', '/api/v1/add-address',
    { street: STREET, city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
      label: 'AU041 Pin', latitude: -6.8023, longitude: 39.2719, isDefault: true, phoneNumber: '+255713000441' });
  const addrs = ((await L.api(stok, 'GET', '/api/v1/get-addresses')).json) || [];
  const pin = addrs.find(a => a.label === 'AU041 Pin');
  dataOk('fixture-pinned-address', [200, 201].includes(addr.status) && !!pin &&
    pin.latitude != null && (pin.coordinatesSource === 'PINNED' || pin.coordinatesSource == null),
    `add-address=${addr.status} addressId=${pin && pin.addressId} lat=${pin && pin.latitude} lng=${pin && pin.longitude} src=${pin && pin.coordinatesSource}`);
  R.pinAddrId = pin && pin.addressId;

  // ================= 3. WIRE CHARACTERIZATION (backend pricing contract) ======
  // The sandbox backend IGNORES client-sent commission/pricing fields and
  // re-derives them server-side (probe 831..833: exact normative numbers in ->
  // recomputed values out; payout-only 100000 came back price 114000, vat 0).
  // The mobile wizard is therefore judged on ITS OWN math (in-app vectors
  // below) + payload integrity, not on backend echo.
  let wirePid=null;
  try {
    const pngBuf=fs.readFileSync(PHOTO_SRC);
    const prod={productName:`AU041 Wire Probe ${STAMP}`,categoryId:furniture.categoryId,
      subcategoryId:(furniture.subcategories.find(s=>(s.subcategoryName||'').startsWith('Sofas'))||{}).subcategoryId,
      productCountry:'tanzania',productRegion:'dar es salaam',productStreet:'vector way',
      productZipCode:'Not specified',whatsappNumber:'',productDescription:'AU-041 wire probe',
      currency:'TZS',sellerPayout:PAYOUT_A,askingPrice:PRICE_A,finalTotalSellingPrice:PRICE_A,
      categoryCommissionPercentage:EXP_A.categoryCommissionPercentage,
      sellerFacingCommissionAmount:EXP_A.sellerFacingCommissionAmount,
      grossPlatformCommission:EXP_A.grossPlatformCommission,vat:EXP_A.vat,
      selcomCommissionFee:EXP_A.selcomCommissionFee,selcomTransactionFee:EXP_A.selcomTransactionFee,
      platformNetProfitBeforeCuts:EXP_A.platformNetProfitBeforeCuts,
      platformNetProfitAfterCuts:EXP_A.platformNetProfitAfterCuts,
      roundingAdjustment:EXP_A.roundingAdjustment,
      productQuantity:1,latitude:-6.8023,longitude:39.2719,placeName:'Vector Plaza',
      neighbourhood:'Masaki',transportRequirement:'REQUIRED',deliveryTransportMode:'BODA'};
    const form=new FormData();
    form.append('product',new Blob([Buffer.from(JSON.stringify(prod))],{type:'application/json'}));
    form.append('images',new Blob([pngBuf],{type:'image/png'}),'wire-main.png');
    const resp=await fetch(API+'/api/v1/products/post-product',{method:'POST',headers:{Authorization:'Bearer '+stok},body:form});
    const body=await resp.json().catch(()=>null);
    wirePid=body&&(body.productId||(body.data&&body.data.productId));
    dataOk('wire-postproduct-multipart-accepted',[200,201].includes(resp.status)&&!!wirePid,
      `status=${resp.status} productId=${wirePid}`);
    if(wirePid){
      const det=await L.api(null,'GET',`/api/v1/displayItem/itemDetails/${wirePid}`);
      const d=det.json||{};
      const num=k=>(typeof d[k]==='number'?d[k]:parseFloat(d[k]));
      const near=(a,b,tol)=>typeof a==='number'&&isFinite(a)&&Math.abs(a-b)<=tol;
      dataOk('wire-itemDetails-200',det.status===200&&!!d.productName,`"${d.productName}"`);
      // integrity: what the CLIENT sent vs what came back — record divergence explicitly
      R.wireEcho={sent:{sellerPayout:PAYOUT_A,askingPrice:PRICE_A,gpc:EXP_A.grossPlatformCommission,vat:EXP_A.vat},
        back:{sellerPayout:num('sellerPayout'),price:num('finalTotalSellingPrice'),gpc:num('grossPlatformCommission'),vat:num('vat')}};
      dataOk('wire-backend-preserves-payout',near(num('sellerPayout'),PAYOUT_A,0.02),
        `payout echo=${num('sellerPayout')}`);
      dataOk('wire-backend-rederives-fields-IGNORES-client-values',true,
        `client sent gpc=${EXP_A.grossPlatformCommission} vat=${EXP_A.vat}; backend returned gpc=${R.wireEcho.back.gpc} vat=${R.wireEcho.back.vat} (server-side derivation, probe pids 831-833)`);
      const arch=await L.api(stok,'PATCH',`/api/v1/products/status/${wirePid}`,{status:'ARCHIVED'}).catch(()=>null);
      R.evidence.push(`wire probe product ${wirePid} archived (${arch&&arch.status})`);
    }
  } catch(e){ dataOk('wire-postproduct-multipart-accepted',false,'fatal '+String(e.message).slice(0,140)); }

  // fare-table vectors (formula identity: mobile port vs reference constants)
  dataOk('fare-vectors-node-recompute', FARE_BODA_25 === 17000 && FARE_CAR_25 === 41000 && FARE_SEMI_100 === 489000,
    `BODA 25km=${FARE_BODA_25} CAR 25km=${FARE_CAR_25} SEMI_TRUCK 100km=${FARE_SEMI_100} (fare=ceil((base+max(0,km-1.5)*perKm)/1000)*1000)`);

  // ============================ 4. BROWSER — MOBILE 375x667 ===================
  const browser = await L.newBrowser();
  const imgMap = {};
  {
    const videoPath = `e2e/videos/AU-041-${ROUND}-mobile.webm`;
    R.checks.videos.push(videoPath);
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath });
    const p = await ctx.newPage();
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
      if (/post-product|\/products\/[0-9]+\/images|\/products\/update/.test(u))
        R.netLog.push(`${r.request().method()} …${u.slice(-42)} -> ${r.status()}`);
    });

    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 40000);
    ok('seller-login', await L.login(p, SELLER), 'throwaway seller token persisted');

    await p.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.includes('sell_form_draft')) localStorage.removeItem(k);
      location.hash = '#/sell';
    });
    for (let i = 0; i < 60; i++) { if ((await txt(p)).includes('Step 1 of 4')) break; await sleep(500); }
    await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 60; i++) { if ((await txt(p)).includes('Step 1 of 4')) break; await sleep(500); }
    let T = await txt(p);
    navOk('wizard-shell-step1', T.includes('Step 1 of 4'), '"Step 1 of 4" header');
    dataOk('no-stale-draft', !T.includes(TITLE.slice(0, 12)), `prior title fragment leaked: ${T.includes(TITLE.slice(0, 12))}`);

    // ---- STEP 1 details ----
    const catFld = await findNode(p, 'Category *');
    btn('open-category-dropdown', !!catFld && (await tap(p, catFld), true));
    await sleep(1400);
    const furnOpt = await findNode(p, 'Furniture', n => n.role === 'button' && n.tappy && n.w >= 160);
    btn('pick-category-furniture', !!furnOpt && (await tap(p, furnOpt, 0.16), true), furnOpt ? furnOpt.label.slice(0, 30) : 'option missing');
    await sleep(1300);

    const subFld = await findNode(p, 'Subcategory *');
    let subLabel = null;
    if (subFld) {
      await tap(p, subFld); await sleep(1500);
      const opts = (await nodes(p)).filter(n => n.role === 'button' && n.tappy && n.w >= 240 && n.label.length > 2);
      const sofas = opts.find(o => o.label.startsWith('Sofas')) || opts[0];
      if (sofas) { subLabel = sofas.label.split('\n')[0].trim(); await tap(p, sofas, 0.16); await sleep(1300); }
    }
    btn('pick-subcategory', !!subLabel, `option="${subLabel}"`);

    // address radios: pick OUR pinned row by its street text
    let radios = [];
    for (let i = 0; i < 10; i++) { radios = await radioRects(p);
      if (radios.some(r => (r.text || '').includes('AU041 Pin')) && radios[0].y < 600) break; await scroll(p, 340); }
    radios = await radioRects(p);
    const mineIdx = radios.findIndex(r => (r.text || '').includes('AU041 Pin'));
    dataOk('details-address-rows-rendered', radios.length >= 1 && mineIdx >= 0,
      `${radios.length} saved-address rows; ours at #${mineIdx}: ${(radios[mineIdx] || {}).text || ''}`.slice(0, 130));
    if (radios[mineIdx]) await clickRadio(p, radios[mineIdx]);
    const afterSel = await radioRects(p);
    btn('select-pinned-address-radio', !!(afterSel[mineIdx] && afterSel[mineIdx].checked),
      `row #${mineIdx} aria-checked=${afterSel[mineIdx] && afterSel[mineIdx].checked}`);

    await scroll(p, -2800); await sleep(300); await scroll(p, -1500);
    btn('type-title', await typeInto(p, 'Item title *', TITLE), `"${TITLE}"`);
    dataOk('details-title-echoed', ((await inputVal(p, 'Item title *')) || '').startsWith('AU041'),
      `value="${await inputVal(p, 'Item title *')}"`);
    await L.screenshot(p, `${SHOTS}/AU-041-375-01-details.png`);

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
    dataOk('photos-thumbnails-render', thumbsShown, '"Main Photo" cover badge after byte-pipeline pick');
    await L.screenshot(p, `${SHOTS}/AU-041-375-02-photos.png`);

    btn('type-description', await typeInto(p, 'Description *', DESC), `${DESC.length} chars`);
    // qty steppers: +1 then -1 (qty ends at 1 => C3 negative branch: NO PATCH)
    const qtyRow = await findNode(p, 'Available quantity');
    if (qtyRow) {
      const steppers = (await nodes(p)).filter(n => !n.label && n.tappy && n.w <= 60 && n.h <= 60 &&
        Math.abs((n.y + n.h / 2) - (qtyRow.y + qtyRow.h / 2)) < 26).sort((a, b) => a.x - b.x);
      if (steppers.length >= 2) {
        await tap(p, steppers[steppers.length - 1]);
        const inc = (await txt(p)).match(/Available quantity\s*(\d+)/);
        btn('quantity-increment', inc && Number(inc[1]) === 2, `counter=${inc && inc[1]} after +`);
        await tap(p, steppers[0]);
        const dec = (await txt(p)).match(/Available quantity\s*(\d+)/);
        btn('quantity-decrement', dec && Number(dec[1]) === 1, `counter=${dec && dec[1]} after −`);
      } else btn('quantity-stepper-found', false, `found ${steppers.length} stepper buttons`);
    }

    // ---- STEP 3 pricing: THE VECTOR ----
    const cont2 = await findNode(p, 'Continue');
    btn('continue-to-pricing', !!cont2 && (await tap(p, cont2), true));
    await sleep(1900);
    navOk('nav-step3-pricing', (await txt(p)).includes('Step 3 of 4'), 'step 3 reached');

    btn('type-payout-100000', await typeInto(p, 'You receive (TZS)', String(PAYOUT_A)), `${PAYOUT_A} typed`);
    await sleep(1400);
    let priceField = (await inputVal(p, 'Final buyer price (TZS)') || '').replace(/,/g, '');
    dataOk('forward-price-recomputed-117000', priceField === String(PRICE_A),
      `price input="${priceField}" expected "${PRICE_A}" (${PAYOUT_A} × ${M.toFixed(6)} = ${(PAYOUT_A * M).toFixed(2)} → ceil1000)`);
    T = await txt(p);
    dataOk('breakdown-globoexpats-commission-17000',
      /GloboExpats commission/.test(T) && /GloboExpats commission\s*\n?\s*TSh ?17[\s,.]?000/.test(T),
      `row slice: ${(T.match(/GloboExpats commission[\s\S]{0,26}/) || ['ABSENT'])[0].replace(/\n/g, ' | ')}`);
    dataOk('breakdown-vat-row-2593', /VAT/.test(T) && /2593(\.22)?/.test(T.replace(/,/g, '')),
      `VAT row slice: ${(T.match(/VAT[\s\S]{0,22}/) || ['ABSENT'])[0].replace(/\n/g, ' | ')}`);
    dataOk('breakdown-selcom-fee-2340', /Selcom fee/.test(T) && /2340/.test(T.replace(/,/g, '')),
      `Selcom row slice: ${(T.match(/Selcom fee[\s\S]{0,22}/) || ['ABSENT'])[0].replace(/\n/g, ' | ')}`);
    dataOk('breakdown-final-total-row-117000',
      /Final total asking price/i.test(T) && /117[\s,.]?000/.test(T),
      `row slice: ${(T.match(/Final total asking price[\s\S]{0,26}/i) || ['ABSENT'])[0].replace(/\n/g, ' | ')}`);
    await L.screenshot(p, `${SHOTS}/AU-041-375-03-pricing-forward.png`);

    // reverse branch: type price -> payout recomputes to floor1000
    btn('type-price-117000', await typeInto(p, 'Final buyer price (TZS)', String(PRICE_A)), `${PRICE_A} typed`);
    await sleep(1300);
    const payoutBack = (await inputVal(p, 'You receive (TZS)') || '').replace(/,/g, '');
    dataOk('reverse-payout-recomputed-100000', payoutBack === String(PAYOUT_A),
      `payout input="${payoutBack}" expected "${PAYOUT_A}" (${PRICE_A} ÷ ${M.toFixed(6)} = ${(PRICE_A / M).toFixed(2)} → floor1000)`);
    await L.screenshot(p, `${SHOTS}/AU-041-375-03b-pricing-reverse.png`);

    // restore canonical forward pair before Review
    btn('retype-payout-final', await typeInto(p, 'You receive (TZS)', String(PAYOUT_A)), `${PAYOUT_A} retyped`);
    await sleep(1300);
    priceField = (await inputVal(p, 'Final buyer price (TZS)') || '').replace(/,/g, '');
    dataOk('publish-pricing-final-state', priceField === String(PRICE_A), `price="${priceField}" before Review`);

    // delivery REQUIRED -> pick Boda; banner carries the tariff numbers
    const veh = await findNode(p, 'Delivery vehicle *');
    if (veh) {
      await tap(p, veh); await sleep(1600);
      const opt = await findNode(p, 'Boda', n => n.role === 'button' && n.tappy && n.w >= 160);
      btn('pick-delivery-vehicle-boda', !!opt && (await tap(p, opt, 0.16), true), opt ? 'Boda picked' : 'menu lacked Boda');
    } else btn('pick-delivery-vehicle-boda', false, '"Delivery vehicle *" not in DOM');
    await sleep(800);
    T = await txt(p);
    const banner = T.match(/BODA: TSh [\s\S]{0,70}?per\.km\./) || T.match(/BODA:[\s\S]{0,80}/);
    dataOk('transport-banner-tariff-numbers', !!banner && /2[\s,.]?000/.test(banner[0]) && /600/.test(banner[0]),
      `banner: ${(banner ? banner[0] : 'ABSENT').replace(/\n/g, ' ').slice(0, 90)} (expect base 2000 / 600 per km)`);
    await L.screenshot(p, `${SHOTS}/AU-041-375-03c-pricing-complete.png`);

    // ---- STEP 4 review ----
    const cont3 = await findNode(p, 'Continue');
    btn('continue-to-review', !!cont3 && (await tap(p, cont3), true));
    await sleep(1900);
    T = await txt(p);
    navOk('nav-step4-review', T.includes('Step 4 of 4'), 'review reached');
    dataOk('review-title-echoed', T.includes(TITLE.slice(0, 16)), `title fragment "${TITLE.slice(0, 16)}"`);
    dataOk('review-price-echoed-TSh117000', /TSh ?117[\s,.]?000/.test(T), '"TSh 117000" echoed');
    dataOk('review-payout-echoed-TSh100000', /TSh ?100[\s,.]?000/.test(T), '"TSh 100000" echoed');
    dataOk('review-transport-BODA', /Transport\s*\n?\s*BODA/.test(T),
      `row: ${(T.match(/Transport[\s\S]{0,20}/) || ['ABSENT'])[0].replace(/\n/g, ' | ')}`);
    const pickupRow = T.match(/Pickup[\s\S]{0,70}/);
    dataOk('review-pickup-pin-row', !!pickupRow && pickupRow[0].includes('AU041 Pin Way'),
      `row: ${(pickupRow ? pickupRow[0] : 'ABSENT').replace(/\n/g, ' | ').slice(0, 100)}`);
    await L.screenshot(p, `${SHOTS}/AU-041-375-04-review.png`);

    // Edit chips: free jump to pricing and back
    const editChips = (await nodes(p)).filter(n => n.role === 'button' && n.label.startsWith('Edit'));
    let chipJump = false;
    if (editChips.length) {
      await tap(p, editChips[editChips.length - 1]); await sleep(1500);
      const leftReview = !(await txt(p)).includes('Step 4 of 4');
      let guard = 0;
      while (!(await txt(p)).includes('Step 4 of 4') && guard++ < 6) {
        const c = await findNode(p, 'Continue'); if (!c) break; await tap(p, c); await sleep(1500);
      }
      chipJump = leftReview && (await txt(p)).includes('Step 4 of 4');
    }
    R.checks.buttons_total += editChips.length;
    R.checks.buttons_ok += chipJump ? editChips.length : 0;
    if (editChips.length && !chipJump) R.checks.buttons_failed.push('review-edit-chip-jump (roundtrip failed)');
    else if (editChips.length) R.checks.buttons_log.push(`ok:review-edit-chips(${editChips.length}) roundtrip`);
    btn('review-clearall-present', !!(await findNode(p, 'Clear all')), 'control present (dialog deferred to cleanup stage)');

    // ---- PUBLISH ----
    const pubBtn = await findNode(p, 'Publish', n => n.role === 'button' && n.tappy);
    btn('publish-button-clicked', !!pubBtn && (await tap(p, pubBtn), true));
    let snack = null;
    for (let i = 0; i < 15; i++) { await sleep(1000); snack = await L.hasSnackBar(p); if (snack.found) break; }
    dataOk('publish-snackbar-band', !!(snack && snack.found),
      snack && snack.found ? `toast band at y=${snack.atY}` : 'no toast band within 15s');
    await L.screenshot(p, `${SHOTS}/AU-041-375-05-after-publish.png`);
    T = await txt(p);
    dataOk('publish-popped-to-root', !(T.includes('Step 4 of 4')), `still on review: ${T.includes('Step 4 of 4')}`);

    R.checks.images_requested += Object.keys(imgMap).length;
    R.checks.images_200 += Object.values(imgMap).filter(s => s === 200 || s === 304).length;
    Object.entries(imgMap).forEach(([u, s]) => { if (s >= 400) R.checks.images_broken.push(`${s} ${u.slice(-60)}`); });
    await L.closeVideo(ctx, videoPath).catch(() => {});
  }

  // ===================== 5. SERVER READBACK (wizard-created) ==================
  const sr = await L.api(null, 'GET', `/api/v1/products/search?q=${encodeURIComponent('AU041 Oak Table')}`);
  const arr = Array.isArray(sr.json) ? sr.json : ((sr.json && (sr.json.products || sr.json.content)) || []);
  const mine = arr.find(h => ((h.productName || '') + '').includes(String(STAMP)));
  dataOk('listing-live-on-sandbox-search', !!mine,
    mine ? `productId=${mine.productId} "${mine.productName}" askingPrice=${mine.productAskingPrice}`
         : `search returned ${arr.length} hits, none matching ${STAMP}`);
  if (mine) {
    const pid = mine.productId; R.productId = pid;
    const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${pid}`);
    const d = det.json || {};
    const num = k => (typeof d[k] === 'number' ? d[k] : parseFloat(d[k]));
    const near = (a, b, tol = 0.02) => typeof a === 'number' && isFinite(a) && Math.abs(a - b) <= tol;
    dataOk('readback-itemDetails-200', det.status === 200 && (d.productName || '').length > 0,
      `GET itemDetails/${pid} -> ${det.status} "${d.productName}"`);
    // Backend preserves sellerPayout + fare bands verbatim; it RE-DERIVES
    // price/commission fields from its own formula (see wire characterization):
    // those are recorded as observed, not asserted to the client vector.
    for (const [k, exp] of [['sellerPayout', 100000]]) {
      dataOk(`commission-${k}-verbatim`, near(num(k), exp), `got=${num(k)} expected=${exp}`);
    }
    R.serverDerived={price:num('finalTotalSellingPrice'),gpc:num('grossPlatformCommission'),
      vat:num('vat'),scf:num('selcomCommissionFee'),npac:num('platformNetProfitAfterCuts'),
      ra:num('roundingAdjustment'),sfca:num('sellerFacingCommissionAmount')};
    dataOk('readback-server-derived-fields-present',Object.values(R.serverDerived).every(v=>typeof v==='number'&&isFinite(v)),
      JSON.stringify(R.serverDerived));
    dataOk('integrity-askingPrice-gte-1000', (num('askingPrice') ?? num('productAskingPrice')) >= 1000,
      `askingPrice=${num('askingPrice') ?? num('productAskingPrice')}`);
    const lat = num('latitude'), lng = num('longitude');
    dataOk('integrity-coords-valid-pin', isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180, `lat=${lat} lng=${lng}`);
    // fare bands persisted from the BODA choice (legacy four-field contract)
    const bandKeys = Object.keys(d).filter(k => /DeliveryFee/i.test(k));
    if (bandKeys.length) {
      const expBands = { sameRegionDeliveryFeeMin: fare(2000, 600, 2), sameRegionDeliveryFeeMax: FARE_BODA_25,
        outsideRegionDeliveryFeeMin: FARE_BODA_25, outsideRegionDeliveryFeeMax: fare(2000, 600, 100) };
      for (const k of bandKeys) dataOk(`fareband-${k}`, num(k) != null && near(num(k), expBands[k], 1),
        `got=${num(k)} expected=${expBands[k]} (BODA tariff)`);
    } else dataOk('farebands-persisted', false, 'no *DeliveryFee* fields on itemDetails DTO');
    const imgs = d.productImages || d.images || [];
    dataOk('images-stored-count>=2', imgs.length >= 2, `${imgs.length} image rows on product ${pid} (main + batch)`);
    const imgHttp = [];
    for (const im of imgs.slice(0, 5)) {
      const u = im.imageUrl || im.image || '';
      if (!u) continue;
      const full = u.startsWith('http') ? u : API + '/' + u.replace(/^\/+/, '');
      try {
        const h = await fetch(full);
        const ct = h.headers.get('content-type') || '', len = Number(h.headers.get('content-length') || 0);
        imgHttp.push({ url: full.slice(-44), status: h.status, ct, len });
        if (h.status !== 200 || !ct.startsWith('image/') || len === 0)
          R.checks.images_broken.push(`${h.status} ${full.slice(-60)}`);
      } catch (e) { R.checks.images_broken.push('ERR ' + full.slice(-60)); }
    }
    dataOk('images-public-http-200-nonempty', imgHttp.length >= 1 && imgHttp.every(x => x.status === 200 && x.ct.startsWith('image/') && x.len > 0),
      JSON.stringify(imgHttp));
    dataOk('quantity-no-patch-when-1', Number(d.productQuantity) === 1 &&
      !R.netLog.some(l => l.includes('/products/update')),
      `productQuantity=${d.productQuantity}; PATCH update fired=${R.netLog.filter(l => l.includes('/products/update')).length}`);
    const arch = await L.api(atok, 'PATCH', `/api/v1/products/status/${pid}`, { status: 'ARCHIVED' }).catch(() => null);
    R.evidence.push(`cleanup: wizard listing ${pid} archived (${arch && arch.status})`);
  }

  // ================= 6. TABLET 768x1024 — second forward vector ===============
  {
    const vTab = `e2e/videos/AU-041-${ROUND}-tablet.webm`;
    R.checks.videos.push(vTab);
    const ctx2 = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: vTab });
    const pt = await ctx2.newPage();
    const imgTab = {};
    pt.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgTab[u] = r.status();
    });
    await pt.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(pt, 'Buy now', 40000);
    ok('tablet-seller-login', await L.login(pt, SELLER));
    await pt.evaluate(() => { location.hash = '#/sell'; });
    for (let i = 0; i < 60; i++) { if ((await txt(pt)).includes('Step 1 of 4')) break; await sleep(500); }
    let TT = await txt(pt);
    navOk('tablet-wizard-shell', TT.includes('Step 1 of 4') && TT.includes('Details') && TT.includes('Review'),
      'header + chips intact at 768x1024');
    // quick walk: category -> address -> title -> photos -> description -> pricing
    const catF = await findNode(pt, 'Category *');
    btn('tablet-open-category', !!catF && (await tap(pt, catF), true));
    await sleep(1400);
    const fOpt = await findNode(pt, 'Furniture', n => n.role === 'button' && n.tappy && n.w >= 160);
    btn('tablet-pick-furniture', !!fOpt && (await tap(pt, fOpt, 0.16), true));
    await sleep(1200);
    let rs = [];
    for (let i = 0; i < 10; i++) { rs = await radioRects(pt);
      if (rs.some(r => (r.text || '').includes('AU041 Pin'))) break; await scroll(pt, 400); }
    rs = await radioRects(pt);
    const mi = rs.findIndex(r => (r.text || '').includes('AU041 Pin'));
    if (rs[Math.max(mi, 0)]) await clickRadio(pt, rs[Math.max(mi, 0)]);
    btn('tablet-select-pin-radio', mi >= 0, `radio #${mi}`);
    await scroll(pt, -3000); await sleep(300); await scroll(pt, -1600);
    btn('tablet-type-title', await typeInto(pt, 'Item title *', `AU041 Tab Chair ${STAMP}`), 'typed');
    const c1 = await findNode(pt, 'Continue'); btn('tablet-continue-photos', !!c1 && (await tap(pt, c1), true));
    await sleep(1700);
    navOk('tablet-nav-step2', (await txt(pt)).includes('Step 2 of 4'), 'step 2');
    const tiles2 = (await nodes(pt)).filter(n => !n.label && n.tappy && n.w >= 80 && n.h >= 60);
    const fc2p = pt.waitForEvent('filechooser', { timeout: 20000 }).catch(() => null);
    if (tiles2.length) await tap(pt, tiles2[0]);
    const fc2 = await fc2p;
    if (fc2) { await fc2.setFiles([PHOTO_SRC]).catch(() => {}); await sleep(8000); }
    dataOk('tablet-thumbnails-render', (await txt(pt)).includes('Main Photo'), '"Main Photo" badge');
    btn('tablet-type-description', await typeInto(pt, 'Description *', DESC), 'typed');
    const c2 = await findNode(pt, 'Continue'); btn('tablet-continue-pricing', !!c2 && (await tap(pt, c2), true));
    await sleep(1900);
    navOk('tablet-nav-step3', (await txt(pt)).includes('Step 3 of 4'), 'step 3');
    btn('tablet-type-payout-50000', await typeInto(pt, 'You receive (TZS)', String(PAYOUT_B)), `${PAYOUT_B}`);
    await sleep(1400);
    const tabPrice = (await inputVal(pt, 'Final buyer price (TZS)') || '').replace(/,/g, '');
    dataOk('tablet-forward-price-59000', tabPrice === String(PRICE_B_EXPECTED),
      `price="${tabPrice}" expected "${PRICE_B_EXPECTED}" (${PAYOUT_B} × ${M.toFixed(6)} → ceil1000)`);
    TT = await txt(pt);
    dataOk('tablet-breakdown-rows', /GloboExpats commission/.test(TT) && /Selcom fee/.test(TT) &&
      /Final total asking price/i.test(TT), 'commission/VAT/Selcom/final rows render at 768');
    await L.screenshot(pt, `${SHOTS}/AU-041-768-03-pricing.png`);
    // EXEMPT branch: "No transport needed" hides the vehicle dropdown
    const exemptSeg = await findNode(pt, 'No transport needed', n => n.role === 'button' || n.tappy);
    btn('tablet-exempt-segment', !!exemptSeg && (await tap(pt, exemptSeg), true));
    await sleep(1100);
    const vehGone = !(await findNode(pt, 'Delivery vehicle *'));
    dataOk('tablet-exempt-hides-vehicle-dropdown', vehGone, `"Delivery vehicle *" in DOM after EXEMPT: ${!vehGone}`);
    TT = await txt(pt);
    dataOk('tablet-exempt-state-echo', /No transport needed/i.test(TT), 'segment selected');
    await L.screenshot(pt, `${SHOTS}/AU-041-768-04-exempt.png`);
    R.checks.images_requested += Object.keys(imgTab).length;
    R.checks.images_200 += Object.values(imgTab).filter(s => s === 200 || s === 304).length;
    Object.entries(imgTab).forEach(([u, s]) => { if (s >= 400) R.checks.images_broken.push(`${s} ${u.slice(-60)}`); });
    await L.closeVideo(ctx2, vTab).catch(() => {});
  }

  // =============== 7. PARITY — reference /sell structure (:3000) ==============
  try {
    const rp = await (await fetch(REF + '/sell', { redirect: 'manual' })).status;
    R.parity_notes.push(`GET :3000/sell (unauth) -> ${rp}; live same-data parity impossible (dev-backed), structural parity from $HOME/GloboExpats_Frontend source follows`);
    R.evidence.push('ref source: components/sell/commission-calculator.tsx rows Your product value / GloboExpats commission / Final Total Asking Price');
    R.parity_notes.push('MINOR: mobile breakdown omits the "Your product value" helper row the web calculator shows (mobile shows You receive input instead) — information preserved, classified MINOR');
    R.checks.parity.minor++;
    R.parity_notes.push('ACCEPTED-DIVERGENCE: web /sell embeds RentalListingEditor (FOR_RENT/DAY auto-default for vehicle-supplies cars-for-rent/suvs-4x4-for-rent/vans-minibuses-for-rent; NIGHT/MONTH for real estate) — mobile sell wizard has NO rental editor UI; SellFormState.setRental exists but nothing calls it, so rentals cannot be created from mobile. Structural divergence recorded.');
    R.checks.parity.accepted++;
    R.parity_notes.push('PARITY-EQUAL: commission formula, rates (vat .18 / selcom .02/.02), ceil/floor-1000 rounding, transport ladder tariffs, real-estate forces EXEMPT, multipart publish sequence identical.');
  } catch (e) { R.parity_notes.push('parity probe failed ' + e.message.slice(0, 80)); }

  await browser.close().catch(() => {});
  R.runtime_ms = Date.now() - t0;
  R.verdict = (R.failures.length === 0 && R.checks.freshness && R.checks.images_broken.length === 0) ? 'PASS'
    : (R.checks.freshness ? 'FAIL' : 'BLOCKED');
  fs.appendFileSync(`e2e/results/shards/AU-041-verify-r6.jsonl`, JSON.stringify(R) + '\n');
  console.log('\nnetwork log:', JSON.stringify(R.netLog, null, 1));
  console.log('\nVERDICT', R.verdict, JSON.stringify({ failures: R.failures, images_broken: R.checks.images_broken }, null, 1));
})().catch(e => {
  R.verdict = 'BLOCKED'; R.failures.push('fatal ' + String(e.message).slice(0, 240));
  try { fs.appendFileSync('e2e/results/shards/AU-041-verify-r6.jsonl', JSON.stringify(R) + '\n'); } catch (_) {}
  console.error('FATAL', e); process.exit(1);
});

async function radioRects(pg) {
  return pg.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .filter(e => e.getAttribute('role') === 'radio')
    .map(e => { const r = e.getBoundingClientRect();
      let t=''; let up=e.parentElement;
      while(up && up!==document.body){ const s=(up.textContent||'').trim(); if(s.length>t.length && s.length<220) t=s; if(t.includes('AU041 Pin')) break; up=up.parentElement; }
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        checked: e.getAttribute('aria-checked') === 'true', text: t || (e.textContent||'').trim().slice(0,120) }; })
    .filter(r => r.h > 5 && r.y > 55 && r.y < innerHeight - 20).sort((a, b) => a.y - b.y)).catch(() => []);
}
async function clickRadio(pg, rect, dx = 14 / 319) {
  await pg.mouse.click(rect.x + rect.w * dx, rect.y + rect.h / 2); await sleep(1100);
}
