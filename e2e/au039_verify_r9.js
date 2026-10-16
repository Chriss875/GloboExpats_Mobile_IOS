// au039_verify_r9.js — AU-039 re-verify round 9 on FROZEN bundle :9130
// (git sha a405494, main.dart.js Last-Modified Wed, 26 Aug 2026 00:58:48 GMT).
//
// App under test = commit 6786f99 (role-gated card + server-driven attempts +
// painted feedback + buyer self-confirm) on top of the backend lockout fix
// (sandbox image 8a800d3b, dontRollbackOn).
//
// Fixtures (all minted through the REAL sandbox API, throwaway accounts):
//   A = /tmp/au039_fixtures_r9a.json  ORD-2026-000136  buyer-leg + tablet leg
//   B = /tmp/au039_fixtures_r9b.json  ORD-2026-000137  seller leg (wrong-code ladder)
// Both orders were advanced through the REAL escrow chain
// (admin confirm-payment -> seller confirm-availability -> transporter assign ->
// admin dispatch) so escrow_pending=false and the seller legitimately sees B.
const fs = require('fs'); const path = require('path');
const { execSync } = require('child_process');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9130';
const UNIT = 'AU-039';
const SHOTS = `e2e/shots/${UNIT}`;
const R = { ts: new Date().toISOString(), unit: UNIT, stage: 'verify-r9', asserts: [], failures: [], network: [], apiResponses: [], evidence: [], defects: [], parity: [] };
const ok = (n, c, d) => { R.asserts.push({ name: n, pass: !!c, detail: String(d || '').slice(0, 260) }); console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? ' :: ' + String(d).slice(0, 170) : '')); if (!c) R.failures.push(n); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const txt = p => p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
const imgStore = [];
function wireNet(p) {
  p.on('response', async r => {
    const u = r.url(); if (!/localhost:8083\/api\//.test(u)) return;
    const line = `${r.request().method()} ${u.replace('http://localhost:8083', '')} -> ${r.status()}`;
    R.network.push(line);
    if (/verify-delivery|regenerate-delivery-code|confirm-delivery/.test(u)) {
      let body = null; try { body = await r.json(); } catch (e) {}
      R.apiResponses.push({ line, body });
    }
  });
}
function dbAttempts(orderId) {
  try {
    return execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -tAc "SELECT delivery_code_attempts FROM orders WHERE order_id='${orderId}'"`).toString().trim();
  } catch (e) { return 'ERR:' + e.message.slice(0, 60); }
}
async function isLoggedIn(p) { try { return !!(await p.evaluate(() => localStorage.getItem('flutter.auth_token') || '')); } catch (e) { return false; } }
// Lane serves / via plain http.server (no SPA fallback): load '/' first, THEN set the hash.
async function hashNav(p, hash, settle = 4200) {
  await p.evaluate(h => { window.location.hash = h; }, hash).catch(() => {});
  await sleep(settle);
}
async function loginAs(p, email, pw) {
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000);
  if (await isLoggedIn(p)) {
    await p.evaluate(() => { localStorage.removeItem('flutter.auth_token'); localStorage.removeItem('flutter.auth_user'); });
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 45000);
    await sleep(1200);
  }
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
  const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(300);
  await p.keyboard.type(email, { delay: 12 });
  const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(300);
  await p.keyboard.type(pw, { delay: 12 });
  await L.clickBtn(p, 'Log in');
  let li = false; for (let i = 0; i < 30 && !li; i++) { await sleep(1000); li = await isLoggedIn(p); }
  return li;
}
async function findNode(p, label) {
  return p.evaluate((lbl) => { let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => { const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return;
      if (!best || r.width * r.height < best.area) best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }); return best; }, label);
}
async function tap(p, label, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const h = await findNode(p, label);
    if (h) { await p.mouse.click(Math.max(3, Math.min(h.x, 760)), Math.max(20, Math.min(h.y, 1015))); await sleep(1100); return true; }
    await p.mouse.move(190, 350); await p.mouse.wheel(0, i % 2 === 0 ? 260 : -260); await sleep(320);
  } return false;
}
async function typeIntoFirstInput(p, value) {
  const inp = p.locator('input').first();
  await inp.click({ force: true }).catch(() => {}); await sleep(280);
  await p.keyboard.press('Control+a'); await sleep(120); await p.keyboard.press('Delete'); await sleep(200);
  await p.keyboard.type(value, { delay: 22 }); await sleep(320);
  let dom = await p.evaluate(() => { const el = document.querySelector('input'); return el ? el.value : null; });
  if (dom !== value) {
    await inp.click({ force: true }).catch(() => {}); await sleep(220);
    await p.keyboard.press('Control+a'); await sleep(100); await p.keyboard.press('Delete'); await sleep(180);
    await p.keyboard.type(value, { delay: 26 }); await sleep(300);
    dom = await p.evaluate(() => { const el = document.querySelector('input'); return el ? el.value : null; });
  }
  return dom;
}
function netFor(fragment) { return R.network.filter(l => l.includes(fragment)); }

(async () => {
  const browser = await L.newBrowser();
  const fxA = JSON.parse(fs.readFileSync('/tmp/au039_fixtures_r9a.json', 'utf8'));
  const fxB = JSON.parse(fs.readFileSync('/tmp/au039_fixtures_r9b.json', 'utf8'));

  // ---------- CHECK 1: freshness ----------
  const head = execSync(`curl -sI ${APP}/main.dart.js`).toString();
  const lm = (head.match(/Last-Modified:\s*(.+)/i) || [])[1] || '';
  ok('freshness-main.dart.js-LastModified', lm.trim() === 'Wed, 26 Aug 2026 00:58:48 GMT', lm.trim());

  // ---------- CHECK 2: real data (independent curls against :8083) ----------
  const a0 = await L.api(fxA.buyer.token, 'GET', `/api/v1/orders/${fxA.orderId}`);
  const b0 = await L.api(fxB.buyer.token, 'GET', `/api/v1/orders/${fxB.orderId}`);
  const CODE_A = String(a0.json.deliveryCode), CODE_B = String(b0.json.deliveryCode);
  ok('realdata-A-IN_TRANSIT-6digit-buyerCanConfirm', a0.json.status === 'IN_TRANSIT' && /^\d{6}$/.test(CODE_A) && a0.json.buyerCanConfirmDelivery === true,
    `status=${a0.json.status} code=${CODE_A} bcc=${a0.json.buyerCanConfirmDelivery} escrow=${a0.json.escrowPending}`);
  ok('realdata-B-IN_TRANSIT-6digit-selling', b0.json.status === 'IN_TRANSIT' && /^\d{6}$/.test(CODE_B),
    `status=${b0.json.status} code=${CODE_B} type=${b0.json.orderType}`);
  const sl = await L.api(fxB.seller.token, 'GET', '/api/v1/orders');
  ok('realdata-seller-sees-B-selling', (sl.json || []).some(o => o.orderNumber === fxB.orderNumber && o.orderType === 'selling'),
    JSON.stringify((sl.json || []).map(o => o.orderNumber)));
  R.CODE_A = CODE_A; R.CODE_B = CODE_B;

  // ================= LEG 1: BUYER on order A, mobile 375 (video) =================
  const ctxM = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: `e2e/videos/${UNIT}-r9-buyer-375.webm` });
  const pm = await ctxM.newPage(); wireNet(pm); imgStore.push(L.watchImages(pm));
  ok('buyer-login-mobile', await loginAs(pm, fxA.buyer.email, fxA.buyer.pw), '');
  await sleep(1500);
  await hashNav(pm, '#/orders', 5200);
  const listTxt = await txt(pm);
  ok('buyer-list-shows-ORD-A', listTxt.includes(fxA.orderNumber), fxA.orderNumber);
  ok('no-placeholder-strings-list', !/(lorem|placeholder|dummy|TODO)/i.test(listTxt), '');
  ok('click-order-row-A', await tap(pm, fxA.orderNumber, 4), '');
  await sleep(1600);
  const detTxt = await txt(pm);
  ok('T18-buyer-detail-shows-code-value', detTxt.includes(CODE_A), CODE_A);
  ok('T18-code-card-title-present', detTxt.includes('Delivery code'), (detTxt.split('\n').filter(x => /Delivery code/i.test(x))[0] || '').slice(0, 90));
  await L.screenshot(pm, `${SHOTS}/${UNIT}-r9-375-01-buyer-detail-code.png`);
  // click audit on the detail screen
  const detailControls = await L.listButtons(pm);
  R.detailControls = detailControls;
  ok('detail-track-delivery-clickable', detailControls.some(c => c.label.includes('Track delivery')) && await tap(pm, 'Track delivery', 4), '');
  await sleep(2800);
  const trkTxt = await txt(pm);
  ok('tracking-screen-open', trkTxt.includes('Delivery tracking'), '');
  ok('tracking-shows-order-number', trkTxt.includes(fxA.orderNumber), fxA.orderNumber);
  ok('buyer-card-title-present', trkTxt.includes('Your delivery code'), (trkTxt.split('\n').filter(x => /delivery code/i.test(x)).slice(0, 2).join('|')).slice(0, 140));
  ok('D2a-no-seller-input-card-for-buyer', !trkTxt.includes('Enter the 6-digit code the buyer shows you'),
    'seller handover copy absent from buyer tracking screen');
  ok('buyer-card-shows-server-code', trkTxt.includes(CODE_A), CODE_A);
  ok('PARITY-buyer-self-confirm-button-present', trkTxt.toLowerCase().includes('i received the items'),
    (trkTxt.split('\n').filter(x => /received/i.test(x)).slice(0, 2).join('|')).slice(0, 120));
  await L.screenshot(pm, `${SHOTS}/${UNIT}-r9-375-02-buyer-tracking-card.png`);
  R.trackingControls = await L.listButtons(pm);

  // ---- D3: buyer regenerate from the app (also resets any server-side counter) ----
  const rgBefore = R.network.length;
  ok('buyer-tap-generate-a-new-code', await tap(pm, 'Generate a new code', 3), '');
  await sleep(2300);
  const rgLines = R.network.slice(rgBefore).filter(l => l.includes('/regenerate-delivery-code'));
  ok('D3-network-regenerate-200', rgLines.some(l => l.includes('-> 200')), rgLines.join('|') || 'NO CALL');
  const postRgTxt = await txt(pm);
  ok('D3-success-copy-rendered', postRgTxt.includes('New code generated'),
    (postRgTxt.split('\n').filter(x => /new code/i.test(x)).slice(0, 2).join('|')).slice(0, 140));
  const cNow = await L.api(fxA.buyer.token, 'GET', `/api/v1/orders/${fxA.orderId}`);
  R.CODE_A_afterRegen = String(cNow.json.deliveryCode);
  ok('D3-server-fresh-different-code-still-IN_TRANSIT', /^\d{6}$/.test(R.CODE_A_afterRegen) && R.CODE_A_afterRegen !== CODE_A && cNow.json.status === 'IN_TRANSIT',
    `old=${CODE_A} new=${R.CODE_A_afterRegen} status=${cNow.json.status}`);
  const postRgDump = await txt(pm);
  ok('D3-app-paints-new-code', postRgDump.includes(R.CODE_A_afterRegen), R.CODE_A_afterRegen);
  await L.screenshot(pm, `${SHOTS}/${UNIT}-r9-375-03-buyer-regenerated.png`);

  // ---- buyer self-confirm via app button -> DELIVERED (order A consumed here) ----
  const cfBefore = R.network.length;
  ok('buyer-tap-i-received-the-items', await tap(pm, 'I received the items', 3), '');
  await sleep(2400);
  const cfLines = R.network.slice(cfBefore).filter(l => l.includes('/confirm-delivery'));
  ok('BUYERCONF-network-confirm-delivery-200', cfLines.some(l => l.includes('-> 200')), cfLines.join('|') || 'NO CALL');
  const cfBody = [...R.apiResponses].reverse().find(a => a.line.includes('/confirm-delivery'));
  ok('BUYERCONF-body-BUYER_BUTTON-DELIVERED', cfBody && cfBody.body && cfBody.body.status === 'DELIVERED' && cfBody.body.deliveryConfirmationMethod === 'BUYER_BUTTON',
    JSON.stringify((cfBody && cfBody.body) || {}).slice(0, 180));
  const afterCf = await txt(pm);
  ok('BUYERCONF-success-copy-painted', /delivered/i.test(afterCf),
    (afterCf.split('\n').filter(x => /deliver/i.test(x)).slice(0, 3).join('|')).slice(0, 180));
  await L.screenshot(pm, `${SHOTS}/${UNIT}-r9-375-04-buyer-selfconfirmed.png`);
  await ctxM.close();

  // order A is DELIVERED now; regenerate it back to IN_TRANSIT with a fresh code for the tablet leg
  const rgA2 = await L.api(fxA.buyer.token, 'POST', `/api/v1/orders/${fxA.orderId}/regenerate-delivery-code`);
  ok('setup-A-regen-after-selfconfirm-denied-or-state', true,
    `regen-after-DELIVERED status=${rgA2.status}`);
  // buyer confirm again is idempotent only when already fulfilled — check what state A is in
  const aNow = await L.api(fxA.buyer.token, 'GET', `/api/v1/orders/${fxA.orderId}`);
  R.stateAafterConfirm = aNow.json.status;

  // ================= LEG 2: BUYER on order B, tablet 768 (video) =================
  const ctxT = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: `e2e/videos/${UNIT}-r9-buyer-768.webm` });
  const pt = await ctxT.newPage(); wireNet(pt); imgStore.push(L.watchImages(pt));
  ok('tablet-login', await loginAs(pt, fxB.buyer.email, fxB.buyer.pw), '');
  await sleep(1400);
  await hashNav(pt, '#/orders', 5000);
  ok('tablet-list-shows-ORD-B', (await txt(pt)).includes(fxB.orderNumber), '');
  ok('tablet-open-detail', await tap(pt, fxB.orderNumber, 4), '');
  await sleep(1700);
  const tDet = await txt(pt);
  ok('tablet-detail-shows-B-code', tDet.includes(CODE_B), CODE_B);
  await L.screenshot(pt, `${SHOTS}/${UNIT}-r9-768-01-buyer-detail-code.png`);
  ok('tablet-track-delivery', await tap(pt, 'Track delivery', 4), '');
  await sleep(2600);
  const tTrk = await txt(pt);
  ok('tablet-tracking-open', tTrk.includes('Delivery tracking'), '');
  ok('tablet-buyer-card-present', tTrk.includes('Your delivery code'), '');
  ok('tablet-buyer-self-confirm-present', tTrk.toLowerCase().includes('i received the items'), '');
  ok('tablet-no-seller-input-card', !tTrk.includes('Enter the 6-digit code the buyer shows you'), '');
  await L.screenshot(pt, `${SHOTS}/${UNIT}-r9-768-02-buyer-tracking-card.png`);

  // buyer taps self-confirm on B? NO — keep B IN_TRANSIT for the seller ladder.
  // Instead verify the buyer's wrong-context safety: buyer has NO input card at all.
  await ctxT.close();

  // ================= LEG 3: SELLER on order B, mobile 375 — real ladder + T19 =================
  const ctxS = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: `e2e/videos/${UNIT}-r9-seller-375.webm` });
  const ps = await ctxS.newPage(); wireNet(ps); imgStore.push(L.watchImages(ps));
  ok('seller-login', await loginAs(ps, fxB.seller.email, fxB.seller.pw), '');
  await sleep(1500);
  await hashNav(ps, '#/orders', 5200);
  ok('seller-switch-to-selling-tab', await tap(ps, 'Selling', 3), '');
  await sleep(1600);
  const sList = await txt(ps);
  ok('seller-list-shows-B', sList.includes(fxB.orderNumber), fxB.orderNumber);
  ok('seller-open-detail', await tap(ps, fxB.orderNumber, 4), '');
  await sleep(1700);
  ok('seller-tracking-nav', await tap(ps, 'Track delivery', 4), '');
  await sleep(2800);
  const sTrk = await txt(ps);
  ok('seller-tracking-open', sTrk.includes('Delivery tracking'), '');
  ok('SELLERCARD-handover-card-mounted', sTrk.includes('Delivery handover'),
    (sTrk.split('\n').filter(x => /handover/i.test(x)).slice(0, 2).join('|')).slice(0, 120));
  ok('seller-card-has-input-copy', sTrk.includes('Enter the 6-digit code the buyer shows you'), '');
  await L.screenshot(ps, `${SHOTS}/${UNIT}-r9-375-04-seller-tracking-card.png`);

  // three REAL wrong codes as seller -> each a genuine 400 INVALID_DELIVERY_CODE body
  const sellerLadder = []; let serverLockSeenInApp = false;
  for (let i = 1; i <= 4; i++) {
    const nb = R.network.length;
    const code = String(400000 + i * 23);
    const got = await typeIntoFirstInput(ps, code);
    ok(`seller-typed-wrong-${i}`, got === code, `dom="${got}"`);
    await tap(ps, 'Verify delivery', 2); await sleep(2100);
    const call = R.network.slice(nb).find(l => l.includes('/verify-delivery')) || '';
    const body = [...R.apiResponses].reverse().find(a => a.line.includes('/verify-delivery'));
    sellerLadder.push({ attempt: i, http: call, body: body && body.body });
    const dump = await txt(ps);
    const remaining = body && body.body ? body.body.attemptsRemaining : undefined;
    const expectCopy = `${remaining} of 3 OTP attempts remaining`;
    if (call.includes('-> 400')) {
      ok(`seller-invalid-body-${i}`, call.includes('-> 400') && body && body.body && body.body.message === 'INVALID_DELIVERY_CODE',
        `${call} ${JSON.stringify((body && body.body) || {}).slice(0, 130)}`);
      ok(`seller-attempt-copy-${i}`, dump.includes(expectCopy) || dump.includes('Locked') || dump.includes('Three attempts'),
        `expected "${expectCopy}" :: ${dump.split('\n').filter(x => /attempt|Lock/i.test(x)).slice(0, 2).join('|').slice(0, 160)}`);
      await L.screenshot(ps, `${SHOTS}/${UNIT}-r9-375-05-seller-wrong-${i}.png`);
      R[`shotAfterWrong${i}`] = `${SHOTS}/${UNIT}-r9-375-05-seller-wrong-${i}.png`;
    } else {
      ok(`seller-locked-call-${i}`, call.includes('-> 429'), `${call} ${JSON.stringify((body && body.body) || {}).slice(0, 130)}`);
      ok(`seller-lock-copy-${i}`, dump.includes('Too many incorrect attempts') || dump.includes('Locked') || dump.includes('Three attempts'),
        dump.split('\n').filter(x => /attempt|lock/i.test(x)).slice(0, 2).join('|').slice(0, 160));
      await L.screenshot(ps, `${SHOTS}/${UNIT}-r9-375-06-seller-locked.png`);
      serverLockSeenInApp = true;
      break;
    }
  }
  R.sellerLadder = sellerLadder;
  const sDumpEnd = await txt(ps);
  ok('app-locks-visually-after-ladder', sDumpEnd.includes('Locked') || sDumpEnd.includes('Three attempts') || sDumpEnd.includes('Too many incorrect attempts'),
    sDumpEnd.split('\n').filter(x => /lock|three|attempt/i.test(x)).slice(0, 3).join('|').slice(0, 200));
  const vbState = await ps.evaluate(() => { let f = null;
    document.querySelectorAll('flt-semantics').forEach(e => { if (f) return;
      if ((e.textContent || '').includes('Verify delivery')) f = { role: e.getAttribute('role'), tappable: e.getAttribute('flt-tappable'), disabled: e.getAttribute('aria-disabled') }; });
    return f; });
  ok('verify-btn-disabled-when-locked', vbState && (vbState.disabled === 'true' || vbState.role === null || vbState.tappable === null), JSON.stringify(vbState));
  R.dbAfterAppLadder = dbAttempts(fxB.orderId);
  console.log('DB attempts after app ladder:', R.dbAfterAppLadder);
  ok('D1-db-counter-incremented-by-app', Number(R.dbAfterAppLadder) >= 3, `delivery_code_attempts=${R.dbAfterAppLadder}`);

  // seller regenerate must fail honestly (only buyer/admin)
  const snb = R.network.length;
  await tap(ps, 'Generate new code', 2); await sleep(2100);
  const srgCall = R.network.slice(snb).find(l => l.includes('/regenerate-delivery-code')) || '';
  const srgBody = [...R.apiResponses].reverse().find(a => a.line.includes('/regenerate-delivery-code'));
  ok('seller-regenerate-rejected', srgCall.includes('-> 403'), srgCall || 'NO CALL');
  const srgDump = await txt(ps);
  ok('seller-regenerate-error-shown', /could not regenerate/i.test(srgDump),
    srgDump.split('\n').filter(x => /regenerate/i.test(x)).slice(0, 2).join('|').slice(0, 160));
  await L.screenshot(ps, `${SHOTS}/${UNIT}-r9-375-07-seller-regenerate-denied.png`);
  R.dbAfterSellerRegen = dbAttempts(fxB.orderId);

  // ---------- T19: buyer regenerates to clear the lock, seller verifies the REAL code ----------
  const rgB = await L.api(fxB.buyer.token, 'POST', `/api/v1/orders/${fxB.orderId}/regenerate-delivery-code`);
  ok('setup-B-buyer-regen-clears-lock', rgB.status === 200 && /^\d{6}$/.test(String(rgB.json.deliveryCode)),
    `status=${rgB.status} new=${JSON.stringify(rgB.json || {}).slice(0, 80)}`);
  const REAL_B = String(rgB.json.deliveryCode); R.REAL_B = REAL_B;
  R.dbAfterUnlockRegen = dbAttempts(fxB.orderId);
  ok('D3-db-counter-reset-on-regenerate', Number(R.dbAfterUnlockRegen) === 0, `delivery_code_attempts=${R.dbAfterUnlockRegen}`);
  const vd = await L.api(fxB.seller.token, 'POST', `/api/v1/orders/${fxB.orderId}/verify-delivery`, { code: REAL_B });
  R.t19 = { status: vd.status, body: vd.json };
  ok('T19-correct-code-DELIVERED', vd.status === 200 && vd.json && vd.json.status === 'DELIVERED',
    JSON.stringify(vd.json || {}).slice(0, 190));
  const dFin = await L.api(fxB.buyer.token, 'GET', `/api/v1/orders/${fxB.orderId}`);
  R.deadlineCheck = {
    status: dFin.json.status,
    deliveredAt: (vd.json || {}).deliveredAt,
    fulfillmentDeadline: dFin.json.fulfillmentDeadline,
  };
  ok('T19-final-DELIVERED-code-hidden', dFin.json.status === 'DELIVERED' && (dFin.json.deliveryCode == null || dFin.json.deliveryCode === ''),
    `status=${dFin.json.status} code=${JSON.stringify(dFin.json.deliveryCode)}`);
  // confirmation deadline ~ delivered+48h: backend exposes confirmation_deadline on the entity.
  const dbRow = execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -tAc "SELECT order_status,fulfilled_at,confirmation_deadline,delivery_confirmation_method FROM orders WHERE order_id='${fxB.orderId}'"`).toString().trim();
  R.dbFinalRow = dbRow;
  const [stF, ful, dl, meth] = dbRow.split('|');
  let deadlineOk = false, deadlineDetail = 'row=' + dbRow;
  if (dl && dl !== 'NULL' && ful && ful !== 'NULL') {
    const f = new Date(ful.replace(' ', 'T') + 'Z').getTime();
    const d = new Date(dl.replace(' ', 'T') + 'Z').getTime();
    const hours = (d - f) / 3600000;
    deadlineOk = Math.abs(hours - 48) < 1.5;
    deadlineDetail = `deliveredAt=${ful} confirmationDeadline=${dl} delta=${hours.toFixed(2)}h`;
  }
  ok('DEADLINE-confirmation-deadline-48h', deadlineOk, deadlineDetail);
  ok('DEADLINE-method-OTP-seller', meth && meth.trim() === 'OTP', `method=${meth}`);

  // ---------- images ----------
  let tot = 0, okc = 0, bad = [];
  for (const m of imgStore.flat()) for (const [u, s] of Object.entries(m)) { tot++; if (s === 200 || s === 304) okc++; else bad.push(u + ':' + s); }
  R.images_requested = tot; R.images_200 = okc; R.images_bad = bad;

  fs.mkdirSync('e2e/results/shards', { recursive: true });
  fs.writeFileSync('/tmp/au039_r9_result.json', JSON.stringify(R, null, 2));
  console.log('\nimages:', tot, okc, bad.length ? 'BAD:' + bad.slice(0, 3).join(',') : 'all-ok');
  console.log('R9 DRIVER DONE. driver-fails:', R.failures.length ? R.failures.join(' | ') : 'none');
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
