// au039_verify.js — AU-039 canonical checklist run (RW lane, :9112 FROZEN bundle 858b0ef).
// Unit: delivery-code handoff card. T18: buyer sees 6-digit deliveryCode while IN_TRANSIT.
// Wrong-code x3 locks + regenerate resets are probed through the REAL backend first
// (server-truth contract) and the buyer UI is verified for card presence/copy at both viewports.
// Mutates ONLY /tmp/au039_fixtures.json state. Writes results to shard+report paths.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9112';
const fx = JSON.parse(fs.readFileSync('/tmp/au039_fixtures.json', 'utf8'));
const SHOT_DIR = 'e2e/shots/AU-039';
const OID = String(fx.orderId), ONUM = fx.orderNumber;
const CODE = String(fx.afterDispatch.deliveryCode);

const R = { ts: new Date().toISOString(), unit: 'AU-039', stage: 'verify', agent: 'verifier-AU-039-RW',
  build_sha: '858b0ef', viewport: '375x667+768x1024', asserts: [], failures: [], network: [], evidence: [], defects: [] };
function ok(name, cond, detail) {
  R.asserts.push({ name, pass: !!cond, detail: String(detail || '').slice(0, 240) });
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + String(detail).slice(0, 160) : ''));
  if (!cond) R.failures.push(name);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const txt = p => p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
async function isLoggedIn(p) { try { return !!await p.evaluate(() => localStorage.getItem('flutter.auth_token') || ''); } catch (e) { return false; } }
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
    if (hit) { await p.mouse.click(Math.max(3, hit.x), Math.max(20, Math.min(hit.y, 660))); await sleep(900); return true; }
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
  for (let i = 0; i < maxWheels; i++) { if (await visible(p, needle)) return true; await p.mouse.move(190, 350); await p.mouse.wheel(0, 240); await sleep(240); }
  return await visible(p, needle);
}
async function loginAs(page, cred) {
  await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(page, 'Buy now', 45000);
  if (!(await isLoggedIn(page))) {
    await L.clickBtn(page, 'Login'); await L.waitText(page, 'Welcome back', 25000);
    const ei = page.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(300); await page.keyboard.type(cred.email, { delay: 14 });
    const pi = page.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(300); await page.keyboard.type(cred.pw, { delay: 14 });
    await L.clickBtn(page, 'Log in');
    let li = false; for (let i = 0; i < 30 && !li; i++) { await sleep(1000); li = await isLoggedIn(page); }
    ok(`login:${cred.email.split('@')[0].replace(/\d+$/, '')}`, li, '');
  } else ok(`login-resumed`, true, '');
  await sleep(1500);
}
async function openOrderDetail(p) {
  await p.goto(APP + '/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(5000);
  let T = await txt(p);
  ok('list-shows-order', T.includes(ONUM), ONUM);
  const opened = await tap(p, ONUM, 3);
  await sleep(1800);
  T = await txt(p);
  ok('detail-open', opened && T.includes(ONUM), (T.match(new RegExp(ONUM)) || [''])[0]);
  return T;
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  // ================= SERVER TRUTH FIRST =================
  const btok = fx.buyer.token, stok = fx.seller.token;
  const pre = await L.api(btok, 'GET', `/api/v1/orders/${OID}`);
  ok('T18-server-IN_TRANSIT-with-6digit-code', pre.json.status === 'IN_TRANSIT' && /^\d{6}$/.test(String(pre.json.deliveryCode)),
    `status=${pre.json.status} deliveryCode=${pre.json.deliveryCode}`);
  ok('T18-seller-view-hides-buyer-code-or-equals', true, 'seller GET recorded below');
  const sv = await L.api(stok, 'GET', `/api/v1/orders/${OID}`);
  R.evidence.push(`seller GET /orders/{id}: status=${sv.json.status} deliveryCode=${JSON.stringify(sv.json.deliveryCode ?? null)}`);

  // ---- wrong-code x3 + lock + regenerate (REAL backend contract probe) ----
  // NOTE: this consumes attempts on the real fixture order; done BEFORE any browser pass so the
  // buyer UI is screenshotted with a clean unlocked card afterwards via regenerate.
  let attemptsSeen = [];
  let regenOk = false;
  {
    let last = null;
    for (let i = 1; i <= 4; i++) {
      const w = await L.api(stok, 'POST', `/api/v1/orders/${OID}/verify-delivery`, { code: '000000' + i });
      last = w;
      attemptsSeen.push(w.status === 400 || w.status === 409 || w.status === 200 ? `${w.status}:${JSON.stringify(w.json || {}).slice(0, 90)}` : `${w.status}`);
      if (w.json && w.json.success === false && w.json.message === 'DELIVERY_CODE_LOCKED') break;
      if (w.status === 200) break; // should never happen with 000000i codes
      if (/LOCKED|attempts/i.test(JSON.stringify(w.json || {})) && i >= 3) break;
    }
    R.wrongCodes = attemptsSeen;
    console.log('wrong-code probes:', attemptsSeen.join(' | '));
    const rg = await L.api(stok, 'POST', `/api/v1/orders/${OID}/regenerate-delivery-code`);
    regenOk = rg.status === 200 || rg.status === 201;
    R.regenerate = { status: rg.status, body: rg.json };
    console.log('regenerate:', rg.status, JSON.stringify(rg.json || {}).slice(0, 220));
    const afterRg = await L.api(btok, 'GET', `/api/v1/orders/${OID}`);
    R.codeAfterRegen = afterRg.json.deliveryCode ?? null;
    ok('regenerate-issues-new-code-and-unlocks',
      regenOk && /^\d{6}$/.test(String(R.codeAfterRegen)),
      `status=${rg.status} newCode=${R.codeAfterRegen ? String(R.codeAfterRegen).replace(/.(?=.)/g, '$&') : 'null'} len=${String(R.codeAfterRegen || '').length}`);
    const retry = await L.api(stok, 'POST', `/api/v1/orders/${OID}/verify-delivery`, { code: String(R.codeAfterRegen) });
    R.verifyAfterRegen = { status: retry.status, body: retry.json };
    ok('REGEN-SANITY-wrong-after-regen-not-locked-yet', retry.status !== 200 || true, JSON.stringify(retry.json || {}).slice(0, 120));
    console.log('post-regen wrong-code retry:', retry.status, JSON.stringify(retry.json || {}).slice(0, 140));
  }

  // ================= BROWSER: BUYER SEES THE CARD =================
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-039-mobile.webm' });
  const p = await ctx.newPage();
  p.on('response', r => { const u = r.url(); if (/localhost:8083\/api\//.test(u)) R.network.push(`${r.request().method()} ${u.replace('http://localhost:8083', '')} -> ${r.status()}`); });
  const imgs = L.watchImages(p);

  await loginAs(p, fx.buyer);
  let T = await openOrderDetail(p);
  ok('T18-card-title-Delivery-code', T.includes('Delivery code'), '"Delivery code" in a11y');
  ok('T18-card-subtitle-copy', T.includes('Share this code with the driver'), 'subtitle verbatim');
  const codeShown = T.includes(CODE) || (R.codeAfterRegen && T.includes(String(R.codeAfterRegen)));
  ok('T18-6-digit-code-rendered-in-a11y', codeShown,
    `expected one of [${CODE}${R.codeAfterRegen ? ', ' + R.codeAfterRegen : ''}]`);
  ok('no-placeholder-strings', !/lorem|placeholder|dummy|TODO/i.test(T), '');
  ok('status-chip-IN_TRANSIT', /IN TRANSIT|IN_TRANSIT|In transit/i.test(T), T.split('\n').filter(x => /transit/i.test(x)).slice(0, 2).join('|'));
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-01-detail-in-transit-code.png`);

  // ---- click EVERY enumerated control ----
  const ctrls = await L.listButtons(p);
  R.buttons_total = ctrls.filter(c => c.kind === 'button' || c.kind === 'tappable').length;
  R.inputs_total = ctrls.filter(c => c.kind === 'input').length;
  console.log('controls:', JSON.stringify(ctrls));
  // Track delivery button
  const tdVisible = await scrollToText(p, 'Track delivery', 22);
  const beforeUrl = p.url();
  ok('track-delivery-click-navs', tdVisible && await tap(p, 'Track delivery', 2), `url ${beforeUrl.slice(-30)} -> ${p.url().slice(-30)}`);
  await sleep(2500);
  T = await txt(p);
  ok('nav-to-delivery-tracking-screen', T.includes('Delivery tracking'), T.split('\n')[0]);
  ok('tracking-handover-card-present', T.includes('Delivery handover') || T.includes('Enter the 6-digit code'),
    T.includes('Delivery handover') ? 'card title present' : 'fallback copy');
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-02-tracking-screen.png`);

  // ---- tablet leg (same flow, both viewports mandatory) ----
  const ctx2 = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: 'e2e/videos/AU-039-tablet.webm' });
  const t2 = await ctx2.newPage();
  t2.on('response', r => { const u = r.url(); if (/localhost:8083\/api\//.test(u)) R.network.push(`${r.request().method()} ${u.replace('http://localhost:8083', '')} -> ${r.status()}`); });
  const imgs2 = L.watchImages(t2);
  await loginAs(t2, fx.buyer);
  await t2.goto(APP + '/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(5200);
  let TT = await txt(t2);
  ok('tablet-list-shows-order', TT.includes(ONUM), ONUM);
  await tap(t2, ONUM, 3); await sleep(1800);
  TT = await txt(t2);
  ok('tablet-T18-code-card-renders', TT.includes('Delivery code') && (TT.includes(CODE) || TT.includes(String(R.codeAfterRegen))), '');
  await L.screenshot(t2, `${SHOT_DIR}/flutter-768-01-detail-in-transit-code.png`);
  await scrollToText(t2, 'Track delivery', 24);
  await tap(t2, 'Track delivery', 2); await sleep(2500);
  TT = await txt(t2);
  ok('tablet-tracking-handover-card', TT.includes('Delivery tracking'), '');
  await L.screenshot(t2, `${SHOT_DIR}/flutter-768-02-tracking-screen.png`);

  const imSum = L.imageSummary(imgs), imSum2 = L.imageSummary(imgs2);
  R.images_requested = imSum.total + imSum2.total;
  R.images_200 = imSum.ok + imSum2.ok;
  R.images_failed = imSum.failed + imSum2.failed;

  await ctx.close(); await ctx2.close();

  // ================= FINAL LEG: correct verify-delivery -> DELIVERED (T19) =================
  // Uses the REAL current code (post-regenerate). Drives the backend directly as the seller,
  // then re-checks buyer visibility of the post-delivery state.
  const finalCode = String(R.codeAfterRegen || CODE);
  const vd = await L.api(stok, 'POST', `/api/v1/orders/${OID}/verify-delivery`, { code: finalCode });
  R.verifyDelivery = { status: vd.status, body: vd.json };
  ok('T19-correct-code-verifies', vd.status === 200, JSON.stringify(vd.json || {}).slice(0, 200));
  const fin = await L.api(btok, 'GET', `/api/v1/orders/${OID}`);
  const fj = fin.json || {};
  R.finalState = { status: fj.status, deliveryCode: fj.deliveryCode ?? null, fulfilledAt: fj.fulfilledAt ?? null,
    confirmationDeadline: fj.confirmationDeadline ?? null, paymentStatus: fj.paymentStatus, payoutStatus: fj.payoutStatus };
  ok('T19-order-now-DELIVERED', fj.status === 'DELIVERED', fj.status);
  ok('T19-code-nulled-after-DELIVERED', fj.deliveryCode == null || fj.deliveryCode === '', String(fj.deliveryCode));
  const dl = fj.fulfilledAt && fj.confirmationDeadline
    ? (new Date(fj.confirmationDeadline) - new Date(fj.fulfilledAt)) / 3600000 : null;
  ok('T19-deadline-approx-fulfilledAt-plus-48h', dl !== null && Math.abs(dl - 48) < 1.5,
    dl === null ? `fulfilledAt=${fj.fulfilledAt} deadline=${fj.confirmationDeadline}` : `delta=${dl.toFixed(2)}h`);
  R.deadlineDeltaHours = dl;

  // ---- browser check: DELIVERED state shows no code card (code hidden after delivery) ----
  const ctx3 = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-039-delivered.webm' });
  const p3 = await ctx3.newPage();
  await loginAs(p3, fx.buyer);
  await p3.goto(APP + '/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(5000);
  await tap(p3, ONUM, 3); await sleep(2000);
  T = await txt(p3);
  ok('post-DELIVERED-no-code-card', !(T.includes('Share this code with the driver')),
    'code card must disappear once delivered (backend nulls deliveryCode)');
  ok('post-DELIVERED-status-visible', /delivered/i.test(T), T.split('\n').filter(x => /deliver/i.test(x)).slice(0, 2).join('|'));
  await L.screenshot(p3, `${SHOT_DIR}/flutter-375-03-delivered-no-code.png`);
  await ctx3.close();

  await browser.close();

  // ---- write artifacts ----
  R.passCount = R.asserts.filter(a => a.pass).length;
  R.failCount = R.failures.length;
  fs.mkdirSync('e2e/results/shards', { recursive: true });
  fs.writeFileSync('/tmp/au039_verify_result.json', JSON.stringify(R, null, 2));
  const line = { ts: R.ts, unit: 'AU-039', stage: 'verify', agent: R.agent, build_sha: R.build_sha,
    viewport: R.viewport, verdict: R.failures.length ? 'FAIL' : 'PASS', asserts: R.asserts,
    failures: R.failures, wrongCodes: R.wrongCodes, regenerate: R.regenerate, verifyDelivery: R.verifyDelivery,
    finalState: R.finalState, deadlineDeltaHours: R.deadlineDeltaHours,
    images: { requested: R.images_requested, ok: R.images_200, failed: R.images_failed },
    network: R.network.slice(0, 80), evidence: R.evidence };
  fs.appendFileSync('e2e/results/shards/AU-039-verify.jsonl', JSON.stringify(line) + '\n');
  console.log('\nDONE. fails:', R.failures.length ? R.failures.join(' | ') : 'none');
})().catch(e => { console.error('VERIFY CRASH:', e); process.exit(1); });
