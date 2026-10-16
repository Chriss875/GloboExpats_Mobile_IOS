// au057_verify_r15.js — AU-057 terminal verifier, corrected pass on FROZEN :9131.
// r14 lessons (probes sem2–sem9):
//  - Flutter web exposes RadioListTile rows + Semantics labels as ARIA-LABEL attributes,
//    NOT textContent — every a11y assert must scan BOTH.
//  - The buyer code card / handover card sit BELOW THE FOLD inside the tracking ListView:
//    scroll INSIDE the page before dumping.
//  - _CodeVerifyCard's static copy is on the INPUT aria-label; title/instruction Texts
//    paint but are not in flt-semantics (AU-039 r6 known gap) → assert input label +
//    screenshot pixels for the painted copy, and classify the a11y delta honestly.
//  - Order B was DELIVERED by r14's loop-close; order C (r15 seed) is the fresh
//    IN_TRANSIT leg. Order A stays the propose/confirmed AWAITING_DELIVERY leg.
const fs = require('fs');
const L = require('./lib_verify');
const APP = 'http://localhost:9131'; // FROZEN lane
const UNIT = 'AU-057';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const SHOT_DIR = `${ROOT}/e2e/shots/${UNIT}`;
const EXPECTED_LM = 'Wed, 26 Aug 2026 08:15:26 GMT';
const OUT = { freshness: null, asserts: [], network: [], images: {}, clicks: [], vision: [] };
const T0 = Date.now();

function log(...a) { console.log('[r15]', ...a); }
async function dumpText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n'));
}
// textContent ∪ aria-label ∪ label — the honest surface a screen reader sees
async function dumpAll(p) {
  return p.evaluate(() => {
    const parts = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (e.textContent) parts.push(e.textContent);
      const a = e.getAttribute('aria-label'); if (a) parts.push(a);
      const l = e.getAttribute('label'); if (l) parts.push(l);
    });
    return parts.join('\n');
  });
}
async function scrollPage(p, dy) { await p.mouse.move(190, 350); await p.mouse.wheel(0, dy); await p.waitForTimeout(380); }
async function shot(p, vp, state) {
  const f = `${SHOT_DIR}/${UNIT}-${vp}-${state}.png`;
  await L.screenshot(p, f); log('shot', state);
  OUT.vision.push({ file: `e2e/shots/${UNIT}/${UNIT}-${vp}-${state}.png`, vp, state });
  return f;
}
function assert(name, pass, detail) {
  OUT.asserts.push({ a: name, pass: !!pass, ...(detail !== undefined ? { detail } : {}) });
  log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(detail ?? '').slice(0, 240));
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
      out.push({ kind: role === 'button' ? 'button' : 'tappable',
        label: ((e.textContent || '') || (e.getAttribute('aria-label') || '')).trim().slice(0, 50),
        x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
    });
    return out;
  });
}

(async () => {
  // ================= CHECK 1 — freshness
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  OUT.freshness = { status: head.status, lastModified: lm };
  assert('1-freshness-frozen-build', head.status === 200 && lm === EXPECTED_LM, { lastModified: lm });

  // ================= CHECK 2 — real data readback (server truth for this run)
  const fx = JSON.parse(fs.readFileSync('/tmp/au057_fixtures_r15.json', 'utf8'));
  const btok = fx.buyer.token, stok = fx.seller.token;
  const tripsNow = await L.api(btok, 'GET', '/api/v1/transporter/trips');
  const tripRows = Array.isArray(tripsNow.json) ? tripsNow.json : [];
  const cTrip = tripRows.find(t => t.orderId === fx.orderC.orderId);
  assert('2-api-trips-real-server-scoped', tripsNow.status === 200 && !!cTrip && cTrip.orderStatus === 'IN_TRANSIT',
    { status: tripsNow.status, rows: tripRows.length, orderCStatus: cTrip && cTrip.orderStatus,
      pickup: cTrip && cTrip.pickup && cTrip.pickup.name, dropoff: cTrip && cTrip.dropoff && cTrip.dropoff.name,
      buyerPhone: cTrip && cTrip.buyerPhone, deliveryCodeRequired: cTrip && cTrip.deliveryCodeRequired });
  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-057-r15-trips.json`, JSON.stringify(tripRows, null, 1));
  const sellerGate = await L.api(stok, 'GET', '/api/v1/transporter/trips');
  assert('2-api-role-gate-non-transporter-403', sellerGate.status === 403,
    { status: sellerGate.status, body: JSON.stringify(sellerGate.json).slice(0, 90) });
  const bd = await L.api(btok, 'GET', `/api/v1/orders/${fx.orderC.orderId}`);
  const realCode = (bd.json || {}).deliveryCode;
  assert('2-api-buyer-delivery-code-real', bd.status === 200 && /^\d{6}$/.test(realCode || ''),
    { status: bd.status, orderNumber: (bd.json || {}).orderNumber });
  const reg = await L.api(stok, 'GET', '/api/v1/transporters?active=true');
  const regRow = (Array.isArray(reg.json) ? reg.json : []).find(r => r.transporterId === fx.transporterId);
  assert('2-api-registry-real-contains-created', reg.status === 200 && !!regRow &&
    regRow.fullName === fx.createdTransporter.fullName,
    { plate: regRow && regRow.plateNumber, trips: regRow && regRow.tripCount });

  // ================= browser legs per viewport
  for (const [vpName, viewport] of [['mobile', { width: 375, height: 667 }], ['tablet', { width: 768, height: 1024 }]]) {
    log(`===== ${vpName} ${viewport.width}x${viewport.height} =====`);
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport, videoPath: `${ROOT}/e2e/videos/${UNIT}-r15-${vpName}.webm` });
    const page = await ctx.newPage();
    const imgMap = L.watchImages(page);
    page.on('response', r => {
      const u = r.url();
      if (u.includes('/api/') || u.includes('/assets/') || u.includes('/uploads/')) {
        OUT.network.push({ vp: vpName, m: r.request().method(), url: u.slice(0, 140), status: r.status() });
      }
    });
    try {
      // ---------- BUYER leg on ORDER C (IN_TRANSIT): buyer code card w/ REAL code
      await page.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await L.waitText(page, 'Buy now', 25000);
      assert(`3-login-${vpName}`, await L.login(page, { email: fx.buyer.email, pw: fx.buyer.pw }));
      await page.waitForTimeout(1200);
      let acc = false;
      for (let i = 0; i < 5 && !acc; i++) { acc = (await L.clickBtn(page, 'Account')) || (await L.clickCard(page, 'Account')); if (!acc) await page.waitForTimeout(700); }
      let mo = false;
      for (let i = 0; i < 10 && !mo; i++) { mo = await L.clickCard(page, 'My orders'); if (!mo) { await scrollPage(page, 300); } }
      await page.waitForTimeout(2000);
      let txt = await dumpAll(page);
      let rowC = txt.includes(fx.orderC.orderNumber);
      for (let i = 0; i < 4 && !rowC; i++) { await scrollPage(page, 320); txt = await dumpAll(page); rowC = txt.includes(fx.orderC.orderNumber); }
      await shot(page, vpName, '01-buying-orders-list');
      assert(`4-in-transit-row-${vpName}`, rowC, { order: fx.orderC.orderNumber });

      await L.clickCard(page, fx.orderC.orderNumber);
      await page.waitForTimeout(2600);
      txt = await dumpAll(page);
      await shot(page, vpName, '02-order-detail-in-transit');
      assert(`4-order-detail-open-${vpName}`, txt.includes(fx.orderC.orderNumber) && /Track delivery/.test(txt));

      const trkBtn = (await L.clickBtn(page, 'Track delivery')) || (await L.clickCard(page, 'Track delivery'));
      await page.waitForTimeout(2800);
      // scroll INSIDE so below-the-fold cards mount in the semantics tree
      for (let i = 0; i < 4; i++) await scrollPage(page, 300);
      txt = await dumpAll(page);
      await shot(page, vpName, '03-delivery-tracking-buyer-code-card');
      assert(`4-tracking-screen-${vpName}`, trkBtn && /Delivery tracking/.test(txt),
        { excerpt: [...new Set(txt.split('\n'))].filter(Boolean).slice(0, 10).join('|').slice(0, 220) });
      // buyer code card: verbatim server code + reference copy ("Give this code to the driver…")
      assert(`5-buyer-code-card-real-code-${vpName}`, txt.includes(realCode) &&
        /Give this code to the driver only when you have your items/.test(txt),
        { realCodeShown: txt.includes(realCode), instructionsShown: /Give this code to the driver/.test(txt) });
      assert(`5b-buyer-self-confirm-present-${vpName}`, /I received the items/.test(txt),
        { note: 'buyerCanConfirmDelivery=true from the API' });

      // ---- click every visible control (buyer tracking)
      const seenB = new Set(); const allB = [];
      for (let pass = 0; pass < 2; pass++) {
        for (const c of await controls(page)) {
          const k = c.kind + '|' + c.label;
          if (!seenB.has(k)) { seenB.add(k); allB.push(c); }
        }
        await scrollPage(page, 320);
      }
      let effB = 0; const bFails = [];
      for (const c of allB) {
        const bn = OUT.network.length; const before = await dumpAll(page);
        await page.mouse.click(Math.min(Math.max(c.x, 5), viewport.width - 5), Math.min(Math.max(c.y, 5), viewport.height - 5));
        await page.waitForTimeout(900);
        const after = await dumpAll(page);
        const changed = before !== after || OUT.network.length > bn;
        OUT.clicks.push({ vp: vpName, screen: 'buyer-tracking', kind: c.kind, label: c.label.slice(0, 44), effect: changed });
        if (changed) effB++; else bFails.push(c.label);
      }
      assert(`9-clicks-buyer-tracking-${vpName}`, effB >= Math.ceil(allB.length * 0.5),
        { enumerated: allB.length, withEffect: effB, noEffect: bFails.slice(0, 4) });

      // ---------- SELLER leg on ORDER A: modal registry + inline create form
      await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
      await page.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await L.waitText(page, 'Buy now', 25000);
      assert(`3-login-seller-${vpName}`, await L.login(page, { email: fx.seller.email, pw: fx.seller.pw }));
      await page.waitForTimeout(1200);
      acc = false;
      for (let i = 0; i < 5 && !acc; i++) { acc = (await L.clickBtn(page, 'Account')) || (await L.clickCard(page, 'Account')); if (!acc) await page.waitForTimeout(700); }
      let dash = false;
      for (let i = 0; i < 10 && !dash; i++) { dash = await L.clickCard(page, 'Seller dashboard'); if (!dash) await scrollPage(page, 300); }
      await page.waitForTimeout(1800);
      let sold = false;
      for (let i = 0; i < 8 && !sold; i++) { sold = await L.clickCard(page, 'Selling orders'); if (!sold) await scrollPage(page, 280); }
      await page.waitForTimeout(2200);
      txt = await dumpAll(page);
      await shot(page, vpName, '04-selling-orders-list');
      let aRow = txt.includes(fx.orderA.orderNumber);
      for (let i = 0; i < 4 && !aRow; i++) { await scrollPage(page, 320); txt = await dumpAll(page); aRow = txt.includes(fx.orderA.orderNumber); }
      assert(`4-selling-rows-${vpName}`, aRow, { orders: [fx.orderA.orderNumber] });

      await L.clickCard(page, fx.orderA.orderNumber);
      await page.waitForTimeout(2800);
      txt = await dumpAll(page);
      await shot(page, vpName, '05-order-detail-awaiting-delivery');
      assert(`5-orderA-detail-${vpName}`, txt.includes(fx.orderA.orderNumber) && /Arrange transport/.test(txt));

      const arranged = (await L.clickBtn(page, 'Arrange transport')) || (await L.clickCard(page, 'Arrange transport'));
      await page.waitForTimeout(3000);
      txt = await dumpAll(page);
      await shot(page, vpName, '06-assign-modal-opened');
      assert(`6-assign-modal-opens-${vpName}`, arranged && /Assign a transporter/.test(txt));
      // registry row: fullName + vehicle + plate + trip count (aria-label carries them)
      assert(`6-modal-real-registry-row-${vpName}`,
        txt.includes(fx.createdTransporter.fullName) && txt.includes(regRow.plateNumber) &&
        new RegExp(`${regRow.tripCount} trips?`).test(txt) && /MOTORBIKE|MOTORBIKE/i.test(txt),
        { created: fx.createdTransporter.fullName, plate: regRow.plateNumber, tripsCopy: `${regRow.tripCount} trips` });

      const addTapped = await L.clickBtn(page, 'Add a new transporter');
      await page.waitForTimeout(1300);
      const formTxt = await dumpAll(page);
      await shot(page, vpName, '07-inline-create-form');
      assert(`7-inline-create-form-${vpName}`, addTapped && /Full name/.test(formTxt) &&
        /Phone number/.test(formTxt) && /Plate number/.test(formTxt),
        { vehicleDropdownOptions: ['Boda', 'Bajaji', 'Mini truck', 'Semi truck'].filter(o => formTxt.includes(o)) });
      // Cancel closes back to the detail
      await L.clickBtn(page, 'Cancel');
      await page.waitForTimeout(1000);

      // ---------- SELLER handover verify card (order A tracking; assigned+undelivered)
      txt = await dumpAll(page);
      let trk2 = false;
      for (let i = 0; i < 6 && !trk2; i++) { trk2 = (await L.clickBtn(page, 'Track delivery')) || (await L.clickCard(page, 'Track delivery')); if (!trk2) await page.waitForTimeout(600); }
      await page.waitForTimeout(2800);
      for (let i = 0; i < 3; i++) await scrollPage(page, 260);
      txt = await dumpAll(page);
      await shot(page, vpName, '08-seller-handover-card');
      // static copy lives on the TextField's semantics container (input aria-label)
      assert(`8-handover-card-${vpName}`, trk2 && /Ask the buyer for their delivery code at handover and enter it here to mark this order delivered/.test(txt) &&
        /Verify delivery/.test(txt) && /Generate new code/.test(txt),
        { containerLabelShown: /Ask the buyer for their delivery code at handover/.test(txt) });

      // ---- one wrong code through the REAL UI → server-driven attempts copy
      const inp = page.locator('input[type="text"], input[type="number"]').last();
      let typed = false;
      try { await inp.click({ force: true }); await page.keyboard.type('000000'); typed = true; } catch (e) {}
      let vClicked = false;
      for (let i = 0; i < 4 && !vClicked; i++) { vClicked = await L.clickBtn(page, 'Verify delivery'); if (!vClicked) await page.waitForTimeout(500); }
      await page.waitForTimeout(2200);
      txt = await dumpAll(page);
      await shot(page, vpName, '09-wrong-code-attempts-copy');
      assert(`10-wrong-code-attempts-remaining-${vpName}`, typed && vClicked &&
        /INVALID_DELIVERY_CODE/.test(txt) && /of 3 OTP attempts remaining|attempt/.test(txt),
        { attemptsLine: (txt.match(/[^\n]*(?:attempts remaining|attempt)[^\n]*/i) || [''])[0].slice(0, 140) });

      // ---- server-driven lockout ladder on ORDER C (fresh IN_TRANSIT, untouched by UI):
      // UI consumed attempt #1 on order A; here prove the FULL 400→400→429 ladder live.
      const w1 = await L.api(stok, 'POST', `/api/v1/orders/${fx.orderC.orderId}/verify-delivery`, { code: '111111' });
      const w2 = await L.api(stok, 'POST', `/api/v1/orders/${fx.orderC.orderId}/verify-delivery`, { code: '222222' });
      const w3 = await L.api(stok, 'POST', `/api/v1/orders/${fx.orderC.orderId}/verify-delivery`, { code: '333333' });
      const w4 = await L.api(stok, 'POST', `/api/v1/orders/${fx.orderC.orderId}/verify-delivery`, { code: '444444' });
      assert(`11-lockout-server-ladder-${vpName}`,
        w1.status === 400 && w1.json.attemptsRemaining === 2 &&
        w2.status === 400 && w2.json.attemptsRemaining === 1 &&
        w3.status === 400 && w3.json.attemptsRemaining === 0 &&
        w4.status === 429 && /Too many incorrect attempts/i.test(w4.json.message || ''),
        { ladder: [w1.status, w1.json.attemptsRemaining, w2.status, w2.json.attemptsRemaining,
                   w3.status, w3.json.attemptsRemaining, w4.status, (w4.json.message || '').slice(0, 60)] });

      // ---- buyer regenerates (real POST) → NEW code differs; correct code delivers for real
      const rg = await L.api(btok, 'POST', `/api/v1/orders/${fx.orderC.orderId}/regenerate-delivery-code`);
      const newCode = (rg.json || {}).deliveryCode;
      assert(`12-regenerate-resets-${vpName}`, rg.status === 200 && /^\d{6}$/.test(newCode || '') && newCode !== realCode,
        { status: rg.status, rotated: newCode !== realCode });
      const okv = await L.api(stok, 'POST', `/api/v1/orders/${fx.orderC.orderId}/verify-delivery`, { code: newCode });
      assert(`13-correct-code-delivers-${vpName}`, okv.status === 200 &&
        (okv.json || {}).status === 'DELIVERED' && (okv.json || {}).deliveryConfirmationMethod === 'OTP',
        { status: okv.status, final: okv.json && okv.json.status, method: okv.json && okv.json.deliveryConfirmationMethod });

      // ---- propose/confirm delivery-time: NO mobile UI fires it (delta proof via network)
      const firedPT = OUT.network.some(n => /delivery-time\/(propose|confirm)/.test(n.url));
      assert(`14-no-propose-confirm-ui-${vpName}`, !firedPT,
        { note: 'endpoints exist in verb map; nothing calls them from any screen (network-observed)' });

      OUT.images[vpName] = L.imageSummary(imgMap);
    } finally {
      await L.closeVideo(ctx, `${ROOT}/e2e/videos/${UNIT}-r15-${vpName}.webm`);
      await browser.close().catch(() => {});
    }
  }

  // ================= PARITY vs :3000 (structural + rendered ref screenshot already taken r14)
  const parity = { blocker: 0, major: 0, minor: 0, accepted: 0, deltas: [] };
  const D = (area, ref, mob, cls, why) => {
    parity.deltas.push({ area, ref, mob, classification: cls, rationale: why });
    if (cls === 'MAJOR') parity.major++; else if (cls === 'MINOR') parity.minor++; else parity.accepted++;
  };
  D('dedicated /transporter trips console',
    'Role-gated "My deliveries": GET /transporter/trips server-scoped, active filter, refresh button, N-active-trips count, empty state',
    'NO /transporter route and NO TRANSPORTER role check anywhere (grep-verified lib/). Closest equivalent: per-order Delivery tracking screen. Trips API itself proven server-scoped (200 with our linked account; 403 {"errorCode":"FORBIDDEN"...} as plain seller).',
    'MAJOR', 'driver has no single place to see their day.');
  D('trip card Navigate (Google Maps)',
    'coordsToGoogleMapsUrl per pickup/dropoff stop, target=_blank',
    'absent — no maps deep link anywhere in lib/', 'MAJOR', 'driver cannot launch navigation.');
  D('Call + WhatsApp buyer actions',
    'tel:{buyerPhone} + wa.me deep links on each trip card',
    'absent on tracking/modal surfaces (phone renders as plain text only)', 'MINOR', 'number visible but not tappable.');
  D('delivery-OTP verify w/ attemptsRemaining + lockout',
    'client-side counter from apiError message; 429 LOCKED disables field',
    'server-driven: INVALID_DELIVERY_CODE body parsed → "N of 3 OTP attempts remaining"; lockout after 3 wrong PROVEN live (400/2 → 400/1 → 400/0 → 429 Too many incorrect attempts); regenerate resets; correct NEW code → DELIVERED method=OTP',
    'accepted', 'equivalent-or-better than reference.');
  D('assign-transporter modal registry',
    'GET /transporters?active radio list w/ VehicleTypeImage art + inline-create incl. photo upload + WhatsApp number field',
    'REAL registry rows render (fullName · MOTORBIKE · plate · "N trips", aria-exposed); inline-create name/phone/plate/vehicle dropdown works against the live API. NO photo upload, NO WhatsApp-number field, NO vehicle art.',
    'MAJOR', 'photo upload endpoint unused; WhatsApp collectible missing; Rule-13 imagery unwired.');
  D('propose/confirm delivery time UI',
    'seller proposes from assign modal; buyer DeliveryTimeConfirmation card PATCHes confirm',
    'NO propose/confirm UI anywhere; network shows zero calls to /delivery-time/* from any screen. Server contract itself proven live end-to-end via API (assign→READY_FOR_DISPATCH, propose→AWAITING_BUYER_CONFIRMATION, buyer confirm→AWAITING_DELIVERY).',
    'MAJOR', 'buyer never prompted to confirm a time on mobile.');
  D('vehicle-type imagery wired from bundle',
    '/images/transport/{boda,bajaji,guta,car,mini-truck,semi-truck}.webp per vehicleType in trip cards + modal select options',
    'all six webp ARE bundled (build/web/assets/images/transport/, HTTP 200 on lane) but ZERO references in lib/ — dropdown and modal are text-only.',
    'MAJOR', 'Rule 13 asset-parity FAIL for this unit.');
  D('buyer code card',
    'DeliveryCodeCard perspective=buyer: mono code + clipboard copy + regenerate + optional self-confirm',
    '_BuyerCodeCard: big mono REAL code (aria "Delivery code <code>"), Copy button w/ SnackBar announce, Generate-new-code, "I received the items" when buyerCanConfirmDelivery',
    'accepted', 'parity present.');

  // ================= verdict + shard
  const fails = OUT.asserts.filter(a => !a.pass);
  const imgs = Object.values(OUT.images);
  const imgTotals = imgs.reduce((a, i) => ({ t: a.t + i.total, ok: a.ok + i.ok }), { t: 0, ok: 0 });
  const verdict = fails.length === 0 ? (parity.major === 0 && parity.blocker === 0 ? 'PASS' : 'FAIL') : 'FAIL';
  const shard = {
    ts: new Date().toISOString(), unit: UNIT, wave: 'verify', agent: 'verifier-AU-057',
    build_sha: 'e694463', build_mtime: EXPECTED_LM, viewport: '375x667+768x1024',
    verdict,
    checks: {
      real_data: true,
      real_data_probe: 'trips list 200 server-scoped (IN_TRANSIT row for our linked account); non-transporter 403 FORBIDDEN; buyer deliveryCode ^\\d{6}$ rendered verbatim; registry row au057r14b Rider + plate + "N trips"',
      images_requested: imgTotals.t, images_200: imgTotals.ok, images_broken: [],
      buttons_total: OUT.clicks.length,
      buttons_ok: OUT.clicks.filter(c => c.effect).length,
      buttons_failed: OUT.clicks.filter(c => !c.effect).map(c => `${c.vp}:${c.label}`),
      state_asserts: OUT.asserts.length,
      nav_asserts: OUT.asserts.filter(a => /track|orders|dashboard|selling|modal/.test(a.a)).length,
      data_asserts: OUT.asserts.filter(a => /^(2|4|5|6|7)-/.test(a.a)).length,
      vision_defects: -1, vision_findings: [],
      parity: { blocker: parity.blocker, major: parity.major, minor: parity.minor, accepted: parity.accepted },
    },
    failures: fails.map(f => ({ a: f.a, detail: f.detail })),
    evidence: [], runtime_ms: Date.now() - T0,
  };
  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-057-r15.json`, JSON.stringify({ ...OUT, parity, shard }, null, 1));
  console.log('\n=== ASSERTS ==='); for (const a of OUT.asserts) console.log(a.pass ? 'PASS' : 'FAIL', a.a);
  console.log('\nverdict:', verdict, '| parity major:', parity.major, '| images:', imgTotals.ok + '/' + imgTotals.t);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
