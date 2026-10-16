// au037_verify_r3.js — AU-037 round 3: the seller-side cancel UI leg, done properly.
// r2 lesson: AWAITING_PAYMENT selling orders are HIDDEN from the seller list by the
// backend's escrow gate (OrderLifecycleService L849), so a seller-visible cancellable
// order must sit at AWAITING_SELLER_CONFIRMATION (escrowPending=false). Order I
// (ORD-2026-000031) is parked there, untouched.
// Also re-proves G3 (item tile / seller row) on the tablet viewport where r1/r2
// scroll timing was flaky, using explicit per-node rect probes instead of text search.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9112';
const fx = JSON.parse(fs.readFileSync('/tmp/au037_fixtures.json', 'utf8'));
const SHOT_DIR = 'e2e/shots/AU-037';
const I_ID = fx.orderI.orderId;
const I_NUM = fx.orderI.number;

const R = { ts: new Date().toISOString(), unit: 'AU-037', stage: 'verify-r3', asserts: [], failures: [], network: [], evidence: [] };
function ok(name, cond, detail) {
  R.asserts.push({ name, pass: !!cond, detail: String(detail || '').slice(0, 200) });
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : ''));
  if (!cond) R.failures.push(name);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
}
async function findNode(p, label) {
  return p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return;
      if (!best || r.width * r.height < best.area)
        best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), label: t.slice(0, 60) };
    });
    return best;
  }, label);
}
async function tap(p, label, tries = 1) {
  for (let i = 0; i < tries; i++) {
    const hit = await findNode(p, label);
    if (hit) { await p.mouse.click(Math.max(3, Math.min(hit.x, 764)), Math.max(20, Math.min(hit.y, 1020))); await sleep(900); return true; }
    await p.mouse.move(300, 400); await p.mouse.wheel(0, 220); await sleep(300);
  }
  return false;
}
async function scrollToText(p, needle, maxWheels = 20) {
  for (let i = 0; i < maxWheels; i++) {
    if (await visible(p, needle)) return true;
    await p.mouse.move(300, 420); await p.mouse.wheel(0, 240); await sleep(240);
  }
  return false;
}
async function visible(p, needle) {
  return p.evaluate((n) => {
    let r = false;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (r) return;
      if ((e.textContent || '').includes(n)) { const b = e.getBoundingClientRect(); if (b.bottom > 0 && b.top < innerHeight && b.height > 2) r = true; }
    });
    return r;
  }, needle);
}
async function isLoggedIn(p) {
  try { return !!await p.evaluate(() => localStorage.getItem('flutter.auth_token') || ''); } catch (e) { return false; }
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await L.newBrowser();

  // ================= TABLET 768x1024 — seller cancels order I with reason =================
  const ctx = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: 'e2e/videos/AU-037-r3-tablet.webm' });
  const q = await ctx.newPage();
  q.on('response', r => { if (/localhost:8083\/api\//.test(r.url())) R.network.push(`${r.request().method()} ${r.url().replace('http://localhost:8083', '')} -> ${r.status()}`); });

  await q.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(q, 'Buy now', 45000);
  if (!(await isLoggedIn(q))) {
    await L.clickBtn(q, 'Login'); await L.waitText(q, 'Welcome back', 25000);
    const ei = q.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(300); await q.keyboard.type(fx.seller.email, { delay: 14 });
    const pi = q.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(300); await q.keyboard.type(fx.seller.pw, { delay: 14 });
    await L.clickBtn(q, 'Log in');
    let li = false; for (let i = 0; i < 30 && !li; i++) { await sleep(1000); li = await isLoggedIn(q); }
    ok('seller-login', li, '');
  }
  await sleep(1500);

  // pre-check server truth
  const pre = await L.api(fx.seller.token, 'GET', `/api/v1/orders/${I_ID}`);
  ok('pre-state-AWAITING_SELLER_CONFIRMATION', pre.json.status === 'AWAITING_SELLER_CONFIRMATION', `${pre.json.orderNumber} ${pre.json.status}`);

  await q.goto(APP + '/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(5500);
  let T = await txt(q);
  ok('seller-orders-list-renders', T.includes('My orders') || T.includes('Selling'), T.slice(0, 60).replace(/\n/g, '|'));
  // the list defaults to the BUYING scope; switch to Selling (ChoiceChip) first
  ok('switch-to-selling-scope', await tap(q, 'Selling', 2), '');
  await sleep(1500);
  T = await txt(q);
  ok('list-shows-order-I', T.includes(I_NUM), I_NUM);
  await L.screenshot(q, `${SHOT_DIR}/flutter-768-r3-01-seller-list-with-I.png`);

  // open the order
  ok('open-order-I', await tap(q, I_NUM, 3), '');
  await sleep(1800);
  T = await txt(q);
  ok('I-detail-open', T.includes(I_NUM), T.slice(0, 70).replace(/\n/g, '|'));
  ok('I-status-banner-payment-confirmed-awaiting-seller', T.includes('New order - confirm item is available'), 'seller §9 copy for AWAITING_SELLER_CONFIRMATION');

  // G3 on this screen: item tile, price, total
  const itemVisible = await scrollToText(q, 'AU037 Receipt Tote', 14);
  ok('G3-item-tile-renders-tablet', itemVisible, '"AU037 Receipt Tote <stamp>"');
  T = await txt(q);
  ok('G3-price-line-tablet', T.includes('14,000'), 'TSh 14,000');
  ok('G3-total-line-tablet', T.includes('16,000'), 'TSh 16,000 total');
  ok('G3-buyer-name-row-tablet', T.includes('AU037Buyer Buyer'), 'buyer name (seller perspective)');
  await L.screenshot(q, `${SHOT_DIR}/flutter-768-r3-02-I-detail.png`);

  // ---- Cancel flow ----
  const cancelSeen = await scrollToText(q, 'Cancel', 20);
  ok('cancel-button-reachable', cancelSeen && !!(await findNode(q, 'Cancel')), '');
  await L.screenshot(q, `${SHOT_DIR}/flutter-768-r3-03-before-cancel.png`);

  ok('open-cancel-dialog', await tap(q, 'Cancel', 2), '');
  await sleep(1200);
  T = await txt(q);
  ok('cancel-dialog-rendered', T.includes('Reason') && (await findNode(q, 'Keep order')) !== null, 'Reason field + Keep order action');

  // negative path: Keep order -> nothing changes
  ok('keep-order-negative-path', await tap(q, 'Keep order'), '');
  await sleep(1600);
  const neg = await L.api(fx.seller.token, 'GET', `/api/v1/orders/${I_ID}`);
  ok('keep-order-no-state-change', neg.json.status === 'AWAITING_SELLER_CONFIRMATION', neg.json.status);

  // positive path: reopen, type reason, confirm "Cancel order"
  ok('reopen-cancel-dialog', await tap(q, 'Cancel', 2), '');
  await sleep(1100);
  const ins = q.locator('input,textarea');
  const nIns = await ins.count();
  ok('reason-input-present', nIns > 0, `${nIns} input(s)`);
  if (nIns > 0) {
    await ins.first().click({ force: true }).catch(() => {}); await sleep(250);
    await q.keyboard.type('AU037 r3 seller cancel via UI', { delay: 12 });
    await sleep(250);
  }
  const reasonDom = await q.evaluate(() => { const el = document.querySelector('input,textarea'); return el ? el.value : null; }).catch(() => null);
  ok('cancel-reason-typed-in-dom', !!reasonDom && String(reasonDom).includes('AU037 r3'), String(reasonDom).slice(0, 60));
  await L.screenshot(q, `${SHOT_DIR}/flutter-768-r3-04-cancel-dialog-filled.png`);

  const confirmNode = await findNode(q, 'Cancel order');
  ok('confirm-cancel-order-control-present', !!confirmNode, confirmNode ? confirmNode.label : 'missing');
  if (confirmNode) { await q.mouse.click(confirmNode.x, confirmNode.y); await sleep(3200); }

  // server truth after UI submit
  const post = await L.api(fx.seller.token, 'GET', `/api/v1/orders/${I_ID}`);
  ok('T21-I-CANCELLED-after-UI-flow', post.json.status === 'CANCELLED', post.json.status);
  ok('T21-refund-REFUND_PENDING-after-cancel-of-paid-order',
    post.json.refundStatus === 'REFUND_PENDING' || String(post.json.refundAmount) === '16000.0',
    `refundStatus=${post.json.refundStatus} refundAmount=${post.json.refundAmount}`);
  ok('T21-network-PATCH-seller-cancel-200',
    R.network.some(l => l.includes(`/orders/${I_ID}/seller-cancel`) && l.includes('-> 200')),
    R.network.filter(l => l.includes('seller-cancel')).join(';').slice(0, 140));
  T = await txt(q);
  ok('UI-shows-cancelled-state', /Cancelled/i.test(T), T.split('\n').filter(x => /Cancel/i.test(x)).slice(0, 2).join('|'));
  await L.screenshot(q, `${SHOT_DIR}/flutter-768-r3-05-I-cancelled.png`);

  await ctx.close();

  // ================= MOBILE 375 — buyer escrow banner + no phantom Cancel =================
  const ctx2 = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-037-r3-mobile.webm' });
  const b = await ctx2.newPage();
  b.on('response', r => { if (/localhost:8083\/api\//.test(r.url())) R.network.push(`[buyer] ${r.request().method()} ${r.url().replace('http://localhost:8083', '')} -> ${r.status()}`); });
  await b.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(b, 'Buy now', 45000);
  if (!(await isLoggedIn(b))) {
    await L.clickBtn(b, 'Login'); await L.waitText(b, 'Welcome back', 25000);
    const ei = b.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(300); await b.keyboard.type(fx.buyer.email, { delay: 14 });
    const pi = b.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(300); await b.keyboard.type(fx.buyer.pw, { delay: 14 });
    await L.clickBtn(b, 'Log in');
    let li = false; for (let i = 0; i < 30 && !li; i++) { await sleep(1000); li = await isLoggedIn(b); }
  }
  await sleep(1400);
  // open CANCELLED order E from the buyer side: cancelled state + refund badge parity
  await b.goto(APP + '/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(5200);
  T = await txt(b);
  ok('mobile-list-shows-cancelled-E', T.includes('ORD-2026-000027'), '');
  await tap(b, 'ORD-2026-000027', 3);
  await sleep(1800);
  T = await txt(b);
  ok('E-detail-open-mobile', T.includes('ORD-2026-000027'), '');
  ok('E-shows-cancelled-status', /Cancelled/i.test(T), T.split('\n').filter(x => /Cancel/i.test(x)).slice(0, 2).join('|'));
  ok('E-refund-pending-badge-or-copy', T.includes('Refund pending') || T.includes('refund'), T.split('\n').filter(x => /[Rr]efund/i.test(x)).slice(0, 2).join('|'));
  // defect re-proof: NO Cancel button may remain on a terminal order
  ok('no-cancel-on-terminal-order', !(await findNode(b, 'Cancel')), '');
  await scrollToText(b, 'Refund', 10);
  await L.screenshot(b, `${SHOT_DIR}/flutter-375-r3-01-E-cancelled-refund.png`);

  await ctx2.close();
  await browser.close();

  fs.writeFileSync('/tmp/au037_r3_result.json', JSON.stringify(R, null, 2));
  console.log('\nR3 DONE. failures:', R.failures.length ? R.failures.join(' | ') : 'none');
})().catch(e => { console.error('R3 CRASH:', e); process.exit(1); });
