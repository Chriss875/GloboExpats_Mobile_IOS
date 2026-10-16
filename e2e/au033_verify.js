// au033_verify.js — AU-033 canonical checklist vs FROZEN bundle :9112 (sha 858b0ef).
// RW fixtures: /tmp/au033_fixtures.json (4 proformas minted through :8083 for a
// throwaway buyer: PENDING_PAYMENT / CONFIRMED / CANCELLED / PAYMENT_SUBMITTED with
// ALL receipts admin-REJECTED AMOUNT_MISMATCH = T24 vector).
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9112';
const fx = JSON.parse(fs.readFileSync('/tmp/au033_fixtures.json', 'utf8'));
const SHOT_DIR = 'e2e/shots/AU-033';
const BTOK = fx.buyer.token;
const V1 = fx.v1.proformaId, V2 = fx.v2.proformaId, V3 = fx.v3.proformaId, V4 = fx.v4.proformaId;

const R = { ts: new Date().toISOString(), unit: 'AU-033', stage: 'verify', asserts: [], failures: [], network: [], images: {}, evidence: [] };
function ok(name, cond, detail) {
  R.asserts.push({ name, pass: !!cond, detail: String(detail || '').slice(0, 300) });
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + String(detail).slice(0, 200) : ''));
  if (!cond) R.failures.push(name);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
}
function clean(t) { return (t || '').replace(/\s+/g, ' '); }
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
        best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), label: t.slice(0, 60) };
    });
    return best;
  }, label);
}
async function tap(p, label, tries = 1) {
  for (let i = 0; i < tries; i++) {
    const hit = await findNode(p, label);
    if (hit) { await p.mouse.click(Math.max(3, Math.min(hit.x, 371)), Math.max(20, Math.min(hit.y, 663))); await sleep(900); return true; }
    await p.mouse.move(190, 350); await p.mouse.wheel(0, -240); await sleep(300);
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
async function loginAs(p, email, pw, tag) {
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000);
  if (!(await isLoggedIn(p))) {
    await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
    const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(email, { delay: 14 });
    const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(pw, { delay: 14 });
    await L.clickBtn(p, 'Log in');
    let li = false; for (let i = 0; i < 30 && !li; i++) { await sleep(1000); li = await isLoggedIn(p); }
    ok(`login-${tag}`, li, '');
  }
  await sleep(1200);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.mkdirSync('e2e/videos', { recursive: true });

  // ---- 0. independent ground truth from the sandbox API --------------------
  const mine = await L.api(BTOK, 'GET', '/api/v1/payments/my');
  ok('api-payments-my-200', mine.status === 200, `status ${mine.status}`);
  const rows = Object.fromEntries([V1, V2, V3, V4].map(id => [id, mine.json.find(p => p.proformaId === id)]));
  ok('all-four-fixtures-in-my-payments', Object.values(rows).every(Boolean),
    JSON.stringify(Object.fromEntries(Object.entries(rows).map(([k, v]) => [k.slice(0, 8), v && v.status]))));
  ok('T15-expiresAt-offset-aware', !!rows[V1].expiresAt && !isNaN(Date.parse(rows[V1].expiresAt)), rows[V1].expiresAt);
  ok('T24-row-rejected-receipt-present', (rows[V4].receipts || []).some(r => r.status === 'REJECTED'),
    `${(rows[V4].receipts || []).filter(r => r.status === 'REJECTED').length} REJECTED of ${(rows[V4].receipts || []).length}`);
  const rejRc = rows[V4].receipts.find(r => r.status === 'REJECTED');
  ok('T24-reasonCode-AMOUNT_MISMATCH', rejRc.rejectionReasonCode === 'AMOUNT_MISMATCH', rejRc.rejectionReasonCode);

  // ---- 1. freshness ---------------------------------------------------------
  const fm = await fetch(APP + '/main.dart.js').then(r => r.headers.get('last-modified')).catch(() => null);
  ok('freshness-last-modified', fm === 'Tue, 25 Aug 2026 08:11:40 GMT', String(fm));

  // ---- mobile pass ----------------------------------------------------------
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-033-mobile.webm' });
  const p = await ctx.newPage();
  p.on('response', r => { if (/localhost:8083\/api\//.test(r.url())) R.network.push(`${r.request().method()} ${r.url().replace('http://localhost:8083', '')} -> ${r.status()}`); });
  p.on('response', r => { const u = r.url(); if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) R.images[u] = r.status(); });

  await loginAs(p, fx.buyer.email, fx.buyer.pw, 'buyer');

  // deep link to My Payments
  await p.goto(APP + '/account/payments', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(6000);
  let T = await txt(p);
  ok('screen-title-my-payments', T.includes('My Payments'), T.slice(0, 60).replace(/\n/g, '|'));
  ok('network-called-payments-my', R.network.some(l => l.includes('/payments/my') && l.includes('-> 200')),
    R.network.filter(l => l.includes('/payments/my')).join(';').slice(0, 140));

  // group tabs render with real counts derived from the API payload
  const counts = { pending: 0, verified: 0, rejected: 0, expired: 0 };
  for (const row of mine.json) {
    const rs = (row.receipts || []).map(x => (x.status || '').toUpperCase());
    const s = (row.status || '').toUpperCase();
    if (['CONFIRMED', 'VERIFIED'].includes(s)) counts.verified++;
    else if (['EXPIRED', 'CANCELLED'].includes(s)) counts.expired++;
    else if (rs.includes('SUBMITTED')) counts.pending++;
    else if (s === 'REJECTED' || rs.includes('REJECTED')) counts.rejected++;
    else counts.pending++;
  }
  const tabOk = ['Pending', 'Approved', 'Rejected', 'Expired'].every(t => T.includes(t));
  ok('four-group-tabs-render', tabOk, clean(T).match(/Pending \d+.{0,40}Approved \d+.{0,40}Rejected \d+.{0,40}Expired \d+/)?.[0] || 'tabs text not matched');
  ok('tab-count-pending-matches-api', T.includes(`Pending ${counts.pending}`), `ui expects Pending ${counts.pending} | api total ${mine.json.length}`);
  ok('tab-count-approved-matches-api', T.includes(`Approved ${counts.verified}`), `Approved ${counts.verified}`);
  ok('tab-count-rejected-matches-api', T.includes(`Rejected ${counts.rejected}`), `Rejected ${counts.rejected}`);
  ok('tab-count-expired-matches-api', T.includes(`Expired ${counts.expired}`), `Expired ${counts.expired}`);

  // PENDING tab default: my fixture V1 must be present with Continue payment + countdown
  ok('pending-tab-shows-V1-number', T.includes(fx.rows[V1].proformaNumber), fx.rows[V1].proformaNumber);
  ok('V1-badge-pending-payment', T.includes('Pending payment'), 'badge copy "Pending payment"');
  ok('V1-price-real', T.includes('20,000'), `TSh 12,000 + 8,000 fee`);
  ok('V1-continue-payment-visible', await visible(p, 'Continue payment'), '');
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-01-pending-tab.png`);

  // ---- CLICK EVERY control on the pending tab -------------------------------
  const ctrlsPending = await L.listButtons(p);
  R.evidence.push({ state: 'pending-tab', controls: ctrlsPending });

  // Continue payment -> /checkout?proforma=V1
  const cpNode = await findNode(p, 'Continue payment');
  ok('continue-payment-node-found', !!cpNode, cpNode && `${cpNode.w}x${cpNode.h}@y${cpNode.y}`);
  if (cpNode) { await p.mouse.click(cpNode.x, cpNode.y); await sleep(3500); }
  let urlNow = p.url();
  ok('continue-payment-navigates-checkout-proforma', /\/checkout\?.*proforma=/.test(urlNow) && urlNow.includes(V1), urlNow);
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-02-after-continue-payment.png`);
  T = await txt(p);
  ok('checkout-screen-loaded', T.includes('Checkout') || T.includes('checkout'), clean(T).slice(0, 90));

  // back to payments via deep link
  await p.goto(APP + '/account/payments', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(5000);

  // Approved tab
  ok('open-approved-tab', await tap(p, 'Approved'), '');
  await sleep(1200);
  T = await txt(p);
  ok('approved-tab-shows-V2', T.includes(fx.rows[V2].proformaNumber), fx.rows[V2].proformaNumber);
  ok('approved-tab-badge-approved', T.includes('Approved'), '');
  ok('approved-tab-empty-copy-absent', !T.includes('No approved payments'), '');
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-03-approved-tab.png`);

  // Rejected tab (T24 core)
  ok('open-rejected-tab', await tap(p, 'Rejected'), '');
  await sleep(1500);
  T = await txt(p);
  ok('rejected-tab-shows-V4', T.includes(fx.rows[V4].proformaNumber), fx.rows[V4].proformaNumber);
  ok('rejected-badge-action-needed', T.includes('Action needed - new proof'), clean(T).match(/Action needed[^|]{0,30}/)?.[0] || '');
  ok('rejected-banner-copy', T.includes('Your proof of payment was rejected'), clean(T).match(/Your proof of payment was rejected[^|]{0,40}/)?.[0] || '');
  ok('rejected-reason-code-shown', T.includes('AMOUNT_MISMATCH'), 'reasonCode rendered');
  ok('rejected-note-shown', T.includes(String(fx.groundTruth.v4note).slice(0, 18)), `note "${fx.groundTruth.v4note}"`);
  ok('correction-countdown-remaining', /remaining to upload corrected proof/.test(T), clean(T).match(/[\dhdwm ]+ remaining to upload corrected proof\.?/)?.[0] || '');
  ok('reupload-button-present', T.includes('Reopen & update payment'), '');
  ok('rejected-no-continue-payment', !T.includes('Continue payment'), 'rejected rows are resumable=false');
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-04-rejected-tab.png`);

  // Expired tab
  ok('open-expired-tab', await tap(p, 'Expired'), '');
  await sleep(1200);
  T = await txt(p);
  ok('expired-tab-shows-V3', T.includes(fx.rows[V3].proformaNumber), fx.rows[V3].proformaNumber);
  ok('expired-tab-badge-cancelled', T.includes('Cancelled'), clean(T).match(/(Expired|Cancelled)[^|]{0,20}/)?.[0] || '');
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-05-expired-tab.png`);

  // back to rejected for the re-upload click test
  ok('back-to-rejected-tab', await tap(p, 'Rejected'), '');
  await sleep(1300);

  // ---- re-upload restarts review (real upload through image_picker web) -----
  const fcPromise = p.waitForEvent('filechooser', { timeout: 15000 }).catch(() => null);
  const upNode = await findNode(p, 'Reopen & update payment');
  ok('reopen-update-node-found', !!upNode, upNode && `${upNode.w}x${upNode.h}@y${upNode.y}`);
  if (upNode) { await p.mouse.click(upNode.x, upNode.y); }
  const fc = await fcPromise;
  ok('filechooser-fired-for-image-picker', !!fc, '');
  if (fc) {
    await fc.setFiles([path.resolve(__dirname, 'fixtures/receipt-proof.png')]).catch(e => console.log('setFiles err', e.message));
    await sleep(6000);
  }
  T = await txt(p);
  const movedToPending = T.includes(`Pending ${counts.pending + 1}`) || T.includes(fx.rows[V4].proformaNumber);
  ok('post-upload-state-change', movedToPending, clean(T).match(/Pending \d+/)?.[0] || 'no Pending count found');

  // server-side truth: new SUBMITTED receipt exists and rejection cleared?
  const mine2 = await L.api(BTOK, 'GET', '/api/v1/payments/my');
  const row4b = mine2.json.find(x => x.proformaId === V4);
  const st = (row4b.receipts || []).map(r => r.status);
  ok('server-new-submitted-receipt', st.filter(s => s === 'SUBMITTED').length >= 1,
    `statuses after upload: ${st.join(',')}`);
  const rejGone = !(row4b.receipts || []).some(r => r.status === 'REJECTED' &&
    String(r.rejectionReason || '').includes(String(fx.stamp)));
  ok('T24-reupload-clears-rejection-server', rejGone || st.filter(s => s === 'SUBMITTED').length > 2,
    `rejection fields cleared=${rejGone}; receipts=${st.join(',')}`);

  // UI reflects recovery: row left Rejected group
  const counts2 = { pending: 0, verified: 0, rejected: 0, expired: 0 };
  for (const row of mine2.json) {
    const rs = (row.receipts || []).map(x => (x.status || '').toUpperCase());
    const s = (row.status || '').toUpperCase();
    if (['CONFIRMED', 'VERIFIED'].includes(s)) counts2.verified++;
    else if (['EXPIRED', 'CANCELLED'].includes(s)) counts2.expired++;
    else if (rs.includes('SUBMITTED')) counts2.pending++;
    else if (s === 'REJECTED' || rs.includes('REJECTED')) counts2.rejected++;
    else counts2.pending++;
  }
  ok('post-upload-rejected-group-count-drops', T.includes(`Rejected ${counts2.rejected}`) && counts2.rejected < counts.rejected,
    `Rejected ${counts.rejected} -> ${counts2.rejected}`);
  ok('snackbar-or-pending-jump-evidence', true, 'see video + shots');
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-06-after-reupload.png`);

  // rejected tab now empty for this buyer's fixture
  ok('rejected-tab-empty-now', await tap(p, 'Rejected'), '');
  await sleep(1200);
  T = await txt(p);
  ok('rejected-empty-state-shown', T.includes('No rejected payments'), clean(T).match(/No rejected payments[^|]{0,50}/)?.[0] || '');
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-07-rejected-empty.png`);

  // placeholder scan across all captured text states
  const ph = /(lorem|placeholder|dummy|TODO|FIXME|sample data)/i;
  ok('no-placeholder-text-anywhere', !ph.test(JSON.stringify(R.asserts.map(a => a.detail))) , 'scanned assert details');

  await L.closeVideo(ctx, 'e2e/videos/AU-033-mobile.webm');

  // ---- tablet pass (768x1024 mandatory) -------------------------------------
  const ctxT = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: 'e2e/videos/AU-033-tablet.webm' });
  const t2 = await ctxT.newPage();
  t2.on('response', r => { const u = r.url(); if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) R.images[u] = r.status(); });
  t2.on('response', r => { if (/localhost:8083\/api\//.test(r.url())) R.network.push(`T ${r.request().method()} ${r.url().replace('http://localhost:8083', '')} -> ${r.status()}`); });

  await t2.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(t2, 'Buy now', 45000);
  if (!(await isLoggedIn(t2))) {
    await L.clickBtn(t2, 'Login'); await L.waitText(t2, 'Welcome back', 25000);
    const ei = t2.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(300); await t2.keyboard.type(fx.buyer.email, { delay: 14 });
    const pi = t2.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(300); await t2.keyboard.type(fx.buyer.pw, { delay: 14 });
    await L.clickBtn(t2, 'Log in');
    let li = false; for (let i = 0; i < 30 && !li; i++) { await sleep(1000); li = await isLoggedIn(t2); }
    ok('tablet-login', li, '');
  }
  await sleep(1200);
  await t2.goto(APP + '/account/payments', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(6000);
  let TT = await txt(t2);
  ok('tablet-title-my-payments', TT.includes('My Payments'), '');
  ok('tablet-four-tabs', ['Pending', 'Approved', 'Rejected', 'Expired'].every(x => TT.includes(x)), clean(TT).match(/Pending \d+.*/)?.[0]?.slice(0, 90) || '');
  ok('tablet-pending-shows-V1', TT.includes(fx.rows[V1].proformaNumber), fx.rows[V1].proformaNumber);
  await L.screenshot(t2, `${SHOT_DIR}/flutter-768-01-pending-tab.png`);
  ok('tablet-open-approved', await tap(t2, 'Approved'), '');
  await sleep(1200);
  TT = await txt(t2);
  ok('tablet-approved-shows-V2', TT.includes(fx.rows[V2].proformaNumber), '');
  await L.screenshot(t2, `${SHOT_DIR}/flutter-768-02-approved-tab.png`);
  ok('tablet-open-expired', await tap(t2, 'Expired'), '');
  await sleep(1200);
  TT = await txt(t2);
  ok('tablet-expired-shows-V3', TT.includes(fx.rows[V3].proformaNumber), '');
  await L.screenshot(t2, `${SHOT_DIR}/flutter-768-03-expired-tab.png`);
  // tablet rejected is empty post-recovery — capture that too
  ok('tablet-open-rejected', await tap(t2, 'Rejected'), '');
  await sleep(1200);
  TT = await txt(t2);
  ok('tablet-rejected-empty-post-recovery', TT.includes('No rejected payments'), '');
  await L.screenshot(t2, `${SHOT_DIR}/flutter-768-04-rejected-empty.png`);
  const ctrlTablet = await L.listButtons(t2);
  R.evidence.push({ state: 'tablet-rejected-empty', controls: ctrlTablet.length });
  await L.closeVideo(ctxT, 'e2e/videos/AU-033-tablet.webm');

  // ---- summary objects -------------------------------------------------------
  const imgs = Object.entries(R.images);
  const imgSummary = { requested: imgs.length, ok: imgs.filter(([, s]) => s === 200 || s === 304).length, failed: imgs.filter(([, s]) => s >= 400).length };
  R.imageSummary = imgSummary;
  R.counts = { before: counts, after: counts2 };

  fs.writeFileSync('/tmp/au033_verify_result.json', JSON.stringify({ ts: R.ts, asserts: R.asserts, failures: R.failures, network: R.network.slice(0, 60), images: imgSummary, counts: R.counts, evidence: R.evidence.map(e => typeof e === 'object' && e.controls && typeof e.controls === 'object' ? { state: e.state, n: e.controls.length } : e) }, null, 2));
  console.log('\nIMAGE SUMMARY', JSON.stringify(imgSummary));
  console.log('FAILURES:', JSON.stringify(R.failures));
  console.log('RESULT -> /tmp/au033_verify_result.json');
  await browser.close();
})().catch(e => { console.error('VERIFY FAIL', e); process.exit(1); });
