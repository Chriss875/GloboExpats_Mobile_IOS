// au037_verify_r4.js — AU-037 final leg: buyer Cancel dialog on AWAITING_PAYMENT,
// both paths (Keep order no-op; confirm -> backend 409 surfaced verbatim), plus
// explicit item-tile rect evidence at 375. Order B (ORD-2026-000022) is still
// AWAITING_PAYMENT — untouched by every prior round.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9112';
const fx = JSON.parse(fs.readFileSync('/tmp/au037_fixtures.json', 'utf8'));
const SHOT_DIR = 'e2e/shots/AU-037';
const B_ID = fx.orderB.orderIds[0];
const B_NUM = 'ORD-2026-000022';

const R = { ts: new Date().toISOString(), unit: 'AU-037', stage: 'verify-r4', asserts: [], failures: [], network: [], evidence: [] };
function ok(name, cond, detail) {
  R.asserts.push({ name, pass: !!cond, detail: String(detail || '').slice(0, 220) });
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
    if (hit) { await p.mouse.click(Math.max(3, Math.min(hit.x, 371)), Math.max(20, Math.min(hit.y, 663))); await sleep(900); return true; }
    await p.mouse.move(190, 350); await p.mouse.wheel(0, 220); await sleep(300);
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
async function scrollToText(p, needle, maxWheels = 20) {
  for (let i = 0; i < maxWheels; i++) {
    if (await visible(p, needle)) return true;
    await p.mouse.move(190, 350); await p.mouse.wheel(0, 240); await sleep(240);
  }
  return false;
}
async function isLoggedIn(p) {
  try { return !!await p.evaluate(() => localStorage.getItem('flutter.auth_token') || ''); } catch (e) { return false; }
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-037-r4-mobile.webm' });
  const p = await ctx.newPage();
  p.on('response', r => { if (/localhost:8083\/api\//.test(r.url())) R.network.push(`${r.request().method()} ${r.url().replace('http://localhost:8083', '')} -> ${r.status()}`); });

  const pre = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${B_ID}`);
  ok('pre-state-B-AWAITING_PAYMENT', pre.json.status === 'AWAITING_PAYMENT', `${pre.json.orderNumber} ${pre.json.status}`);

  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000);
  if (!(await isLoggedIn(p))) {
    await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
    const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(fx.buyer.email, { delay: 14 });
    const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(fx.buyer.pw, { delay: 14 });
    await L.clickBtn(p, 'Log in');
    let li = false; for (let i = 0; i < 30 && !li; i++) { await sleep(1000); li = await isLoggedIn(p); }
    ok('buyer-login', li, '');
  }
  await sleep(1400);

  await p.goto(APP + '/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(5500);
  let T = await txt(p);
  ok('list-shows-order-B', T.includes(B_NUM), B_NUM);
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-r4-01-list.png`);

  ok('open-order-B', await tap(p, B_NUM, 3), '');
  await sleep(1800);
  T = await txt(p);
  ok('B-detail-open', T.includes(B_NUM), T.slice(0, 70).replace(/\n/g, '|'));
  ok('B-status-awaiting-payment-verification', T.includes('Awaiting payment verification'), '');

  // G3 with explicit waits
  const itemOk = await scrollToText(p, 'AU037 Receipt Tote', 16);
  ok('G3-item-tile-renders-mobile', itemOk, '"AU037 Receipt Tote <stamp>" in a11y tree while visible');
  T = await txt(p);
  ok('G3-price-line-mobile', T.includes('14,000'), 'TSh 14,000 line price');
  ok('G3-seller-name-mobile', T.includes('AU037Seller Seller'), 'seller name row');
  ok('G3-total-line-mobile', T.includes('16,000'), 'total 16,000 = 14,000 + 2,000 fee');
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-r4-02-B-detail-items.png`);

  // ---- Cancel dialog: negative path ----
  const cancelReachable = await scrollToText(p, 'Cancel', 20);
  ok('cancel-button-visible-to-buyer-DEFECT-EVIDENCE', cancelReachable && !!(await findNode(p, 'Cancel')),
    'buying+AWAITING_PAYMENT shows Cancel though PATCH seller-cancel always 409s for buyers');
  ok('open-cancel-dialog-neg', await tap(p, 'Cancel', 2), '');
  await sleep(1200);
  T = await txt(p);
  ok('cancel-dialog-reason-and-keep-order', T.includes('Reason') && !!(await findNode(p, 'Keep order')), 'dialog title "Cancel order" + Reason field + Keep order');
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-r4-03-cancel-dialog-open.png`);
  ok('keep-order-dismisses', await tap(p, 'Keep order'), '');
  await sleep(1500);
  const negState = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${B_ID}`);
  ok('keep-order-no-server-change', negState.json.status === 'AWAITING_PAYMENT', negState.json.status);

  // ---- positive path: reason typed, confirm -> 409 surfaced ----
  ok('reopen-cancel-dialog-pos', await tap(p, 'Cancel', 2), '');
  await sleep(1100);
  const ins = p.locator('input,textarea');
  const nIns = await ins.count();
  ok('reason-input-present', nIns > 0, `${nIns} input(s)`);
  if (nIns > 0) {
    await ins.first().click({ force: true }).catch(() => {}); await sleep(250);
    await p.keyboard.type('AU037 r4 buyer cancel attempt', { delay: 12 });
    await sleep(250);
  }
  const domVal = await p.evaluate(() => { const el = document.querySelector('input,textarea'); return el ? el.value : null; }).catch(() => null);
  ok('reason-typed-in-dom', !!domVal && String(domVal).includes('AU037 r4'), String(domVal).slice(0, 50));
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-r4-04-cancel-reason-typed.png`);
  const confirmNode = await findNode(p, 'Cancel order');
  ok('confirm-control-present', !!confirmNode, '');
  if (confirmNode) { await p.mouse.click(confirmNode.x, confirmNode.y); await sleep(3000); }

  T = await txt(p);
  const errShown = T.includes('not the seller') || T.toLowerCase().includes('failed');
  ok('backend-409-surfaced-verbatim-in-ui', errShown,
    T.split('\n').filter(x => /seller|failed/i.test(x)).slice(0, 2).join('|'));
  ok('network-shows-PATCH-seller-cancel-409',
    R.network.some(l => l.includes(`/orders/${B_ID}/seller-cancel`) && l.includes('-> 409')),
    R.network.filter(l => l.includes('seller-cancel')).join(';').slice(0, 160));
  const postState = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${B_ID}`);
  ok('no-fake-success-order-still-AWAITING_PAYMENT', postState.json.status === 'AWAITING_PAYMENT', postState.json.status);
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-r4-05-after-confirm-409.png`);

  // ---- tablet pass of the same dialog (both viewports mandatory) ----
  const ctx2 = await L.newCtx(browser, { viewport: { width: 768, height: 1024 } });
  const t2 = await ctx2.newPage();
  await t2.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(t2, 'Buy now', 45000);
  if (!(await isLoggedIn(t2))) {
    await L.clickBtn(t2, 'Login'); await L.waitText(t2, 'Welcome back', 25000);
    const ei = t2.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(300); await t2.keyboard.type(fx.buyer.email, { delay: 14 });
    const pi = t2.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(300); await t2.keyboard.type(fx.buyer.pw, { delay: 14 });
    await L.clickBtn(t2, 'Log in');
    let li = false; for (let i = 0; i < 30 && !li; i++) { await sleep(1000); li = await isLoggedIn(t2); }
  }
  await sleep(1300);
  await t2.goto(APP + '/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(5000);
  T = await txt(t2);
  ok('tablet-list-shows-B', T.includes(B_NUM), '');
  await tap(t2, B_NUM, 3);
  await sleep(1800);
  T = await txt(t2);
  ok('tablet-B-detail-open', T.includes(B_NUM) && T.includes('Awaiting payment verification'), '');
  await scrollToText(t2, 'Cancel', 20);
  await L.screenshot(t2, `${SHOT_DIR}/flutter-768-r4-01-B-before-cancel.png`);
  ok('tablet-open-cancel-dialog', await tap(t2, 'Cancel', 2), '');
  await sleep(1200);
  T = await txt(t2);
  ok('tablet-cancel-dialog-rendered', T.includes('Reason') && T.includes('Cancel order'), '');
  await L.screenshot(t2, `${SHOT_DIR}/flutter-768-r4-02-cancel-dialog-tablet.png`);
  ok('tablet-keep-order-close', await tap(t2, 'Keep order'), '');
  await ctx2.close();

  await ctx.close();
  await browser.close();

  fs.writeFileSync('/tmp/au037_r4_result.json', JSON.stringify(R, null, 2));
  console.log('\nR4 DONE. failures:', R.failures.length ? R.failures.join(' | ') : 'none');
})().catch(e => { console.error('R4 CRASH:', e); process.exit(1); });
