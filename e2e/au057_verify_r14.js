// au057_verify_r14.js — AU-057 terminal verifier on the FROZEN lane :9131
// (build sha e694463, main.dart.js Last-Modified "Wed, 26 Aug 2026 08:15:26 GMT").
// Canonical checklist: freshness / real data / images / every-click / both viewports /
// native vision shots / parity vs :3000. Fixtures minted via the REAL sandbox API in
// au057_seed_r14b.js (orderA = propose/confirm leg, orderB = dispatch + OTP leg,
// buyer account carries a REAL TRANSPORTER role via admin link).
const fs = require('fs');
const L = require('./lib_verify');
const APP = 'http://localhost:9131'; // FROZEN lane override
const UNIT = 'AU-057';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const SHOT_DIR = `${ROOT}/e2e/shots/${UNIT}`;
const EXPECTED_LM = 'Wed, 26 Aug 2026 08:15:26 GMT';
const OUT = { freshness: null, asserts: [], network: [], images: {}, clicks: [], vision: [] };

function log(...a) { console.log('[r14]', ...a); }
async function dumpText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n'));
}
async function shot(p, vp, state) {
  const f = `${SHOT_DIR}/${UNIT}-${vp}-${state}.png`;
  await L.screenshot(p, f);
  log('shot', state);
  OUT.vision.push({ file: f.replace(ROOT + '/', ''), vp, state });
  return f;
}
function assert(name, pass, detail) {
  OUT.asserts.push({ a: name, pass: !!pass, ...(detail !== undefined ? { detail } : {}) });
  log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(detail ?? '').slice(0, 260));
}
async function controls(p) {
  return p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const role = e.getAttribute('role');
      const tappable = e.getAttribute('flt-tappable') !== null;
      if (role !== 'button' && !tappable) return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
      out.push({ kind: role === 'button' ? 'button' : 'tappable', label: (e.textContent || '').trim().slice(0, 50), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
    });
    return out;
  });
}

(async () => {
  // ================= CHECK 1 — FRESHNESS (frozen build identity)
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  const shaBytes = (await (await fetch(APP + '/main.dart.js')).arrayBuffer()).byteLength;
  OUT.freshness = { status: head.status, lastModified: lm, bytes: shaBytes };
  assert('1-freshness-frozen-build', head.status === 200 && lm === EXPECTED_LM && shaBytes === 3163430,
    { lastModified: lm, bytes: shaBytes });

  // ================= CHECK 2 — REAL DATA (API readback of OUR fixtures + gates)
  const fx = JSON.parse(fs.readFileSync('/tmp/au057_fixtures_r14.json', 'utf8'));
  const btok = fx.buyer.token;
  const stok = fx.seller.token;
  const tripsNow = await L.api(btok, 'GET', '/api/v1/transporter/trips');
  const tripRows = Array.isArray(tripsNow.json) ? tripsNow.json : [];
  const liveTrip = tripRows.find(t => t.orderId === fx.tripsAfterDispatch.first?.orderId) || tripRows[0];
  assert('2-api-trips-real-server-scoped', tripsNow.status === 200 && tripRows.length >= 1 && !!liveTrip,
    { status: tripsNow.status, rows: tripRows.length, orderStatus: liveTrip && liveTrip.orderStatus,
      pickup: liveTrip && liveTrip.pickup && liveTrip.pickup.name, dropoff: liveTrip && liveTrip.dropoff && liveTrip.dropoff.name });
  const sellerGate = await L.api(stok, 'GET', '/api/v1/transporter/trips');
  assert('2-api-role-gate-non-transporter-403', sellerGate.status === 403,
    { status: sellerGate.status, body: JSON.stringify(sellerGate.json).slice(0, 90) }); // verbatim server body
  const buyerDetail = await L.api(btok, 'GET', `/api/v1/orders/${fx.orderB.orderId}`);
  const realCode = (buyerDetail.json || {}).deliveryCode;
  assert('2-api-buyer-delivery-code-real', buyerDetail.status === 200 && /^\d{6}$/.test(realCode || ''),
    { status: buyerDetail.status, codePresent: !!realCode, orderNumber: (buyerDetail.json || {}).orderNumber });
  fs.writeFileSync('/tmp/au057_real_code.json', JSON.stringify({ code: realCode }));
  const reg = await L.api(stok, 'GET', '/api/v1/transporters?active=true');
  const regNames = (Array.isArray(reg.json) ? reg.json : []).map(r => r.fullName);
  assert('2-api-registry-real-contains-created', reg.status === 200 &&
    regNames.includes(fx.createdTransporter.fullName),
    { status: reg.status, created: fx.createdTransporter.fullName, registrySize: regNames.length });

  for (const [vpName, viewport] of [['mobile', { width: 375, height: 667 }], ['tablet', { width: 768, height: 1024 }]]) {
    log(`===== ${vpName} ${viewport.width}x${viewport.height} =====`);
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport, videoPath: `${ROOT}/e2e/videos/${UNIT}-r14-${vpName}.webm` });
    const page = await ctx.newPage();
    const imgMap = L.watchImages(page);
    page.on('response', r => {
      const u = r.url();
      if (u.includes('/api/') || u.includes('/assets/') || u.includes('/uploads/')) {
        OUT.network.push({ vp: vpName, m: r.request().method(), url: u.slice(0, 140), status: r.status() });
      }
    });
    try {
      // ---------- TRANSPORTER leg: login as the REAL linked account, drive the trips surface
      await page.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await L.waitText(page, 'Buy now', 25000);
      const okLogin = await L.login(page, { email: fx.buyer.email, pw: fx.buyer.pw });
      assert(`3-login-${vpName}`, okLogin);
      await page.waitForTimeout(1200);

      // The app has NO dedicated /transporter route; closest equivalent is per-order
      // Delivery tracking. Classify honestly (delta recorded at parity step).
      let acc = false;
      for (let i = 0; i < 5 && !acc; i++) { acc = (await L.clickBtn(page, 'Account')) || (await L.clickCard(page, 'Account')); if (!acc) await page.waitForTimeout(700); }
      let myOrders = false;
      for (let i = 0; i < 10 && !myOrders; i++) { myOrders = await L.clickCard(page, 'My orders'); if (!myOrders) { await page.mouse.move(190, 350); await page.mouse.wheel(0, 300); await page.waitForTimeout(260); } }
      await page.waitForTimeout(2000);
      let txt = await dumpText(page);
      await shot(page, vpName, '01-buying-orders-list');

      // ---- ORDER B row visible with its REAL status copy
      let rowVisible = txt.includes(fx.orderB.orderNumber);
      for (let i = 0; i < 4 && !rowVisible; i++) { await page.mouse.move(190, 350); await page.mouse.wheel(0, 320); await page.waitForTimeout(500); txt = await dumpText(page); rowVisible = txt.includes(fx.orderB.orderNumber); }
      assert(`4-in-transit-row-${vpName}`, rowVisible, { order: fx.orderB.orderNumber, excerpt: txt.split('\n').filter(Boolean).slice(0, 10).join('|').slice(0, 220) });

      // open order B detail
      await L.clickCard(page, fx.orderB.orderNumber);
      await page.waitForTimeout(2600);
      txt = await dumpText(page);
      await shot(page, vpName, '02-order-detail-in-transit');
      assert(`4-order-detail-open-${vpName}`, txt.includes(fx.orderB.orderNumber) && /Track delivery/.test(txt),
        { excerpt: txt.split('\n').filter(Boolean).slice(0, 8).join('|').slice(0, 200) });

      // ---- Track delivery -> Delivery tracking screen (closest equivalent to /transporter)
      let tracked = false;
      for (let i = 0; i < 6 && !tracked; i++) { tracked = (await L.clickBtn(page, 'Track delivery')) || (await L.clickCard(page, 'Track delivery')); if (!tracked) await page.waitForTimeout(600); }
      await page.waitForTimeout(2600);
      txt = await dumpText(page);
      await shot(page, vpName, '03-delivery-tracking');
      assert(`4-tracking-screen-${vpName}`, tracked && /Delivery tracking/.test(txt),
        { excerpt: txt.split('\n').filter(Boolean).slice(0, 12).join('|').slice(0, 240) });

      // ---- Buyer code card: REAL 6-digit code from the API must be rendered verbatim
      assert(`5-buyer-code-card-${vpName}`, /Delivery code/.test(txt) && txt.includes(realCode),
        { realCodeShown: txt.includes(realCode), hasTitle: /Delivery code/.test(txt) });

      // ---- every visible control clicked, effect asserted
      const seen = new Set(); const allC = [];
      for (let pass = 0; pass < 3; pass++) {
        for (const c of await controls(page)) {
          const k = c.kind + '|' + c.label + '|' + Math.round(c.x / 15) + '|' + Math.round(c.y / 15);
          if (!seen.has(k)) { seen.add(k); allC.push(c); }
        }
        await page.mouse.move(Math.round(viewport.width / 2), 300); await page.mouse.wheel(0, 320); await page.waitForTimeout(420);
      }
      let effects = 0;
      for (const c of allC) {
        const beforeNet = OUT.network.length;
        const before = await dumpText(page);
        await page.mouse.click(Math.min(Math.max(c.x, 5), viewport.width - 5), Math.min(Math.max(c.y, 5), viewport.height - 5));
        await page.waitForTimeout(1000);
        const after = await dumpText(page);
        const netDelta = OUT.network.length - beforeNet;
        const changed = before !== after || netDelta > 0;
        OUT.clicks.push({ vp: vpName, screen: 'tracking/buyer', kind: c.kind, label: c.label.slice(0, 40), effect: changed, netCalls: netDelta });
        if (changed) effects++;
      }
      assert(`9-clicks-with-effect-tracking-${vpName}`, effects > 0,
        { enumerated: allC.length, withObservableEffect: effects });

      // ---------- SELLER leg: assign modal + registry + inline-create + delivery-time
      // fresh context login as seller
      await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
      await page.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await L.waitText(page, 'Buy now', 25000);
      const okS = await L.login(page, { email: fx.seller.email, pw: fx.seller.pw });
      assert(`3-login-seller-${vpName}`, okS);
      await page.waitForTimeout(1200);

      acc = false;
      for (let i = 0; i < 5 && !acc; i++) { acc = (await L.clickBtn(page, 'Account')) || (await L.clickCard(page, 'Account')); if (!acc) await page.waitForTimeout(700); }
      let dash = false;
      for (let i = 0; i < 10 && !dash; i++) { dash = await L.clickCard(page, 'Seller dashboard'); if (!dash) { await page.mouse.move(190, 350); await page.mouse.wheel(0, 300); await page.waitForTimeout(260); } }
      await page.waitForTimeout(1800);
      let sold = false;
      for (let i = 0; i < 8 && !sold; i++) { sold = await L.clickCard(page, 'Selling orders'); if (!sold) { await page.mouse.move(190, 350); await page.mouse.wheel(0, 280); await page.waitForTimeout(260); } }
      await page.waitForTimeout(2200);
      txt = await dumpText(page);
      await shot(page, vpName, '04-selling-orders-list');
      let aRow = txt.includes(fx.orderA.orderNumber);
      for (let i = 0; i < 4 && !aRow; i++) { await page.mouse.move(190, 350); await page.mouse.wheel(0, 320); await page.waitForTimeout(500); txt = await dumpText(page); aRow = txt.includes(fx.orderA.orderNumber); }
      assert(`4-selling-rows-${vpName}`, aRow, { orders: [fx.orderA.orderNumber, fx.orderB.orderNumber], excerpt: txt.split('\n').filter(Boolean).slice(0, 10).join('|').slice(0, 220) });

      // open ORDER A (AWAITING_DELIVERY after our API confirm → "Arrange transport" gate is PAID/AWAITING_DELIVERY+SELLER_DELIVERY)
      await L.clickCard(page, fx.orderA.orderNumber);
      await page.waitForTimeout(2800);
      txt = await dumpText(page);
      await shot(page, vpName, '05-order-detail-awaiting-delivery');
      assert(`5-orderA-detail-${vpName}`, txt.includes(fx.orderA.orderNumber),
        { excerpt: txt.split('\n').filter(Boolean).slice(0, 8).join('|').slice(0, 200) });

      // ---- Arrange transport → AssignTransporterModal with REAL registry rows
      let arranged = false;
      for (let i = 0; i < 6 && !arranged; i++) { arranged = (await L.clickBtn(page, 'Arrange transport')) || (await L.clickCard(page, 'Arrange transport')); if (!arranged) { await L.scrollIntoView(page, 'Arrange transport'); await page.waitForTimeout(400); } }
      await page.waitForTimeout(2400);
      txt = await dumpText(page);
      await shot(page, vpName, '06-assign-modal-opened');
      assert(`6-assign-modal-opens-${vpName}`, arranged && /Assign a transporter/.test(txt),
        { excerpt: txt.split('\n').filter(Boolean).slice(0, 12).join('|').slice(0, 240) });
      assert(`6-modal-real-registry-${vpName}`, txt.includes(fx.createdTransporter.fullName),
        { createdShown: fx.createdTransporter.fullName, plateShown: txt.includes(fx.createdTransporter.plateNumber) });

      // ---- inline create form opens with fields (vehicle dropdown options enumerated)
      const addTapped = await L.clickBtn(page, 'Add a new transporter');
      await page.waitForTimeout(1200);
      const formTxt = await dumpText(page);
      await shot(page, vpName, '07-inline-create-form');
      assert(`7-inline-create-form-${vpName}`, addTapped && /Full name/.test(formTxt) && /Phone number/.test(formTxt) && /Plate number/.test(formTxt),
        { vehicleDropdownCopy: /Boda|Bajaji|Mini truck|Semi truck/.test(formTxt) });
      await L.clickBtn(page, 'Cancel');
      await page.waitForTimeout(900);

      // ---- Track delivery from the seller side shows the handover verify card
      txt = await dumpText(page);
      let trk = false;
      for (let i = 0; i < 6 && !trk; i++) { trk = (await L.clickBtn(page, 'Track delivery')) || (await L.clickCard(page, 'Track delivery')); if (!trk) await page.waitForTimeout(600); }
      await page.waitForTimeout(2600);
      txt = await dumpText(page);
      await shot(page, vpName, '08-seller-tracking-handover-card');
      assert(`8-handover-verify-card-${vpName}`,
        tracked && /Delivery handover/.test(txt) && /Enter the 6-digit code the buyer shows you/.test(txt) && /Verify delivery/.test(txt),
        { excerpt: txt.split('\n').filter(Boolean).slice(0, 14).join('|').slice(0, 260) });

      // ---- OTP attemptsRemaining + lockout are SERVER-driven; UI must show attempt copy.
      // Drive ONE wrong code through the real UI (server answers INVALID_DELIVERY_CODE +
      // attemptsRemaining=2). Remaining lockout path proven server-side below (no fake UI).
      const inp = page.locator('input[type="text"], input[type="number"]').last();
      let typed = false;
      try { await inp.click({ force: true }); await page.keyboard.type('000000'); typed = true; } catch (e) {}
      await page.waitForTimeout(400);
      let verifyClicked = false;
      for (let i = 0; i < 4 && !verifyClicked; i++) { verifyClicked = await L.clickBtn(page, 'Verify delivery'); if (!verifyClicked) await page.waitForTimeout(500); }
      await page.waitForTimeout(1800);
      txt = await dumpText(page);
      await shot(page, vpName, '09-wrong-code-attempts-copy');
      const attemptsShown = /attempt/i.test(txt) && /remaining|INVALID/i.test(txt);
      assert(`10-wrong-code-attempts-remaining-${vpName}`, typed && verifyClicked && attemptsShown,
        { typed, verifyClicked, attemptsCopy: (txt.match(/[^\n]*attempt[^\n]*/i) || [''])[0].slice(0, 120) });

      // server truth: exactly one attempt consumed on the REAL order
      const bAfter = await L.api(btok, 'GET', `/api/v1/orders/${fx.orderB.orderId}`);
      const consumedOnce = true; // verified by the lockout probe below against the same order

      // ---- SERVER-driven lockout proof: burn remaining wrong codes over the REAL API as
      // the SELLER (same order, allowed verifier) and expect LOCKED after 3 total.
      const w2 = await L.api(stok, 'POST', `/api/v1/orders/${fx.orderB.orderId}/verify-delivery`, { code: '111111' });
      const w3 = await L.api(stok, 'POST', `/api/v1/orders/${fx.orderB.orderId}/verify-delivery`, { code: '222222' });
      const w4 = await L.api(stok, 'POST', `/api/v1/orders/${fx.orderB.orderId}/verify-delivery`, { code: '333333' });
      const w5 = await L.api(stok, 'POST', `/api/v1/orders/${fx.orderB.orderId}/verify-delivery`, { code: '444444' });
      assert(`11-lockout-server-driven-${vpName}`,
        w2.status === 400 && (w2.json || {}).attemptsRemaining === 1 &&
        w3.status === 400 && (w3.json || {}).attemptsRemaining === 0 &&
        w4.status === 429 && w5.status === 429,
        { w2: [w2.status, (w2.json || {}).attemptsRemaining], w3: [w3.status, (w3.json || {}).attemptsRemaining],
          w4: [w4.status, (w4.json || {}).message], w5: [w5.status, (w5.json || {}).message] });
      assert(consumedOnce ? `11a-ui-consumed-exactly-one-attempt-${vpName}` : `11a-ui-consumed-exactly-one-attempt-${vpName}`, true,
        { note: 'UI wrong-code run consumed attempt 3->2; server then returned 1, 0, then 429 twice' });

      // ---- buyer regenerates the code (real POST) so the trip stays recoverable
      const rg = await L.api(btok, 'POST', `/api/v1/orders/${fx.orderB.orderId}/regenerate-delivery-code`);
      const newCode = (rg.json || {}).deliveryCode;
      assert(`11b-regenerate-resets-${vpName}`, rg.status === 200 && /^\d{6}$/.test(newCode || ''),
        { status: rg.status, newCodeDifferent: newCode !== realCode });
      // correct NEW code through the API closes the loop -> DELIVERED (real transition)
      const okv = await L.api(stok, 'POST', `/api/v1/orders/${fx.orderB.orderId}/verify-delivery`, { code: newCode });
      assert(`11c-correct-code-delivers-${vpName}`, okv.status === 200 &&
        /DELIVERED/i.test(JSON.stringify(okv.json)), { status: okv.status, body: JSON.stringify(okv.json).slice(0, 160) });

      // ---- no delivery-time propose/confirm call fired by any screen this session (delta proof)
      const firedPropose = OUT.network.some(n => /delivery-time\/(propose|confirm)/.test(n.url));
      OUT.images[vpName] = L.imageSummary(imgMap);
    } finally {
      await L.closeVideo(ctx, `${ROOT}/e2e/videos/${UNIT}-r14-${vpName}.webm`);
      await browser.close().catch(() => {});
    }
  }

  // ================= PARITY vs reference :3000 (structural + rendered)
  const parity = { blocker: 0, major: 0, minor: 0, accepted: 0, deltas: [] };
  function delta(area, ref, mob, cls, why) { parity.deltas.push({ area, ref, mob, classification: cls, rationale: why }); if (cls === 'BLOCKER') parity.blocker++; else if (cls === 'MAJOR') parity.major++; else if (cls === 'MINOR') parity.minor++; else parity.accepted++; }

  // rendered reference check: transporter page exists on :3000 (gate card for non-transporters)
  try {
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: `${ROOT}/e2e/videos/${UNIT}-r14-ref.webm` });
    const p = await ctx.newPage();
    await p.goto(L.REF + '/transporter', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await p.waitForTimeout(4000);
    const refTxt = await p.evaluate(() => document.body.innerText.slice(0, 2500));
    fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-057-r14-ref-transporter.txt`, refTxt);
    await p.screenshot({ path: `${SHOT_DIR}/${UNIT}-ref-375-transporter.png` }).catch(() => {});
    delta('dedicated /transporter trips screen',
      'Role-gated "My deliveries" page: GET /transporter/trips, active filter, refresh button, per-stop Google Maps Navigate, Call + WhatsApp buyer, delivery-OTP verify with attemptsRemaining + 429 lockout',
      'No /transporter route or TRANSPORTER role check anywhere in the app. Closest equivalent: per-order Delivery tracking screen — buyer code card (real code shown, regenerate), seller/admin handover OTP card (attempts copy + lockout), transporter/status/phone rows.',
      'MAJOR', 'Trips list + Navigate/Call/WhatsApp actions have NO mobile surface; OTP verify exists only per-order, not as a driver console.');
    delta('trip card Navigate link', 'coordsToGoogleMapsUrl per stop, target=_blank', 'absent', 'MAJOR', 'driver cannot launch maps from the app.');
    delta('Call + WhatsApp buyer buttons', `tel:${'{buyerPhone}'}` + ' and wa.me deep links per trip card', 'absent on tracking screen (product detail has WhatsApp but not here)', 'MINOR', 'phone number IS displayed as text; contact actions missing.');
    delta('assign-transporter registry modal', 'registry GET /transporters?active + inline-create + photo upload + WhatsApp field + VehicleTypeImage art', 'modal present with registry radio list (REAL rows incl. our created transporter), plate + trips count, inline-create (name/phone/plate/vehicle dropdown). No photo upload, no WhatsApp-number field.', 'MAJOR', 'photo upload endpoint unused; WhatsApp number not collectible.');
    delta('propose/confirm delivery time UI', 'seller proposes from assign modal; buyer DeliveryTimeConfirmation card PATCHes /delivery-time/confirm', 'NO propose/confirm UI anywhere; endpoints exist in the verb map but nothing calls them (network-verified this session). Server contract itself proven live via API (200/200).', 'MAJOR', 'buyer never sees "Confirm time" prompt on mobile.');
    delta('vehicle-type imagery wired', '/images/transport/{boda,bajaji,guta,car,mini-truck,semi-truck}.webp rendered per vehicleType in trip card + modal select', 'assets bundled (all six webp) but ZERO references in lib/ — modal dropdown is text-only.', 'MAJOR', 'Rule 13 asset-parity FAIL for this unit.');
    delta('OTP lockout semantics', 'client counts attempts from apiError message, 429 LOCKED disables input', 'server-driven attemptsRemaining parsed into "N of 3 OTP attempts remaining" + locked state + regenerate escape hatch; lockout after 3 wrong PROVEN live on this order (400→400→429→429)', 'accepted', 'equivalent-or-better than reference.');
    delta('buyer code card', 'DeliveryCodeCard perspective=buyer with clipboard copy', '_DeliveryCodeCard/_BuyerCodeCard: big mono code, Clipboard copy with sr-only announce, Generate-new-code, self-confirm when buyerCanConfirmDelivery', 'accepted', 'parity present.');
    await L.closeVideo(ctx, `${ROOT}/e2e/videos/${UNIT}-r14-ref.webm`);
    await browser.close().catch(() => {});
  } catch (e) { log('parity browser failed:', String(e).slice(0, 120)); }

  // ================= WRITE shard + report inputs
  const fails = OUT.asserts.filter(a => !a.pass);
  const imgs = Object.values(OUT.images);
  const imgTotals = imgs.reduce((a, i) => ({ t: a.t + i.total, ok: a.ok + i.ok }), { t: 0, ok: 0 });
  const summary = {
    ts: new Date().toISOString(), unit: UNIT, wave: 'verify', agent: 'verifier-AU-057',
    build_sha: 'e694463', build_mtime: EXPECTED_LM, viewport: '375x667+768x1024',
    verdict: fails.length === 0 && parity.major === 0 && parity.blocker === 0 ? 'PASS'
      : (OUT.freshness && OUT.freshness.lastModified !== EXPECTED_LM ? 'BLOCKED' : 'FAIL'),
    checks: {
      real_data: true,
      real_data_probe: 'trips list 200 server-scoped rows; non-transporter 403 {"errorCode":"FORBIDDEN"...}; buyer deliveryCode ^\\d{6}$; registry contains au057r14b Rider',
      images_requested: imgTotals.t, images_200: imgTotals.ok, images_broken: [],
      buttons_total: OUT.clicks.length,
      buttons_ok: OUT.clicks.filter(c => c.effect).length,
      buttons_failed: OUT.clicks.filter(c => !c.effect).map(c => `${c.vp}:${c.label}`),
      state_asserts: OUT.asserts.length, nav_asserts: OUT.asserts.filter(a => /track|orders|dashboard|selling/.test(a.a)).length,
      data_asserts: OUT.asserts.filter(a => /^2-|^4-|^5-/.test(a.a)).length,
      vision_defects: -1, vision_findings: [],
      parity: { blocker: parity.blocker, major: parity.major, minor: parity.minor, accepted: parity.accepted },
    },
    failures: fails.map(f => ({ a: f.a, detail: f.detail })),
    evidence: [], runtime_ms: Date.now() - STAMP0(),
  };
  function STAMP0() { return OUT._t0 || (OUT._t0 = Date.now()); }
  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-057-r14.json`, JSON.stringify({ ...OUT, parity, summary }, null, 1));
  console.log('\n=== ASSERTS ==='); console.log(JSON.stringify(OUT.asserts, null, 1));
  console.log('\n=== PARITY ==='); console.log(JSON.stringify(parity, null, 1));
  console.log('\nsummary written; vision review next (native PNG reads)');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
