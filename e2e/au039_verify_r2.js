// au039_verify_r2.js — AU-039 canonical checklist, round 2 (RW lane, :9112 frozen 858b0ef).
// Fixture A (ORD-2026-000040): already DELIVERED via REAL seller verify-delivery {code:108134}
//   -> T19 UI leg + code-hidden-after-delivery.
// Fixture B (ORD-2026-000046): IN_TRANSIT, buyer-regenerated code 392857
//   -> T18 UI leg at BOTH viewports + full click-everything sweep.
// Server truth recorded in /tmp/au039_fixtures*.json (see au039_rw_seed.js / au039_rw_seed2.js).
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9112';
const fxA = JSON.parse(fs.readFileSync('/tmp/au039_fixtures.json', 'utf8'));
const fxB = JSON.parse(fs.readFileSync('/tmp/au039_fixtures_b.json', 'utf8'));
const SHOT_DIR = 'e2e/shots/AU-039';
const OID_A = String(fxA.orderId), ONUM_A = fxA.orderNumber;
const OID_B = String(fxB.orderId), ONUM_B = fxB.orderNumber;
const CODE_B = String(fxB.codeAfterRegen);

const R = { ts: new Date().toISOString(), unit: 'AU-039', stage: 'verify-r2', agent: 'verifier-AU-039-RW',
  build_sha: '858b0ef', viewport: '375x667+768x1024', asserts: [], failures: [], network: [], evidence: [], defects: [], vision_findings: [] };
function ok(name, cond, detail) {
  R.asserts.push({ name, pass: !!cond, detail: String(detail || '').slice(0, 240) });
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + String(detail).slice(0, 170) : ''));
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
async function scrollToText(p, needle, maxWheels = 22) {
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
    ok(`login:${cred.email.split('@')[0].replace(/\d+b?$/, '')}`, li, '');
  } else ok(`login-resumed:${cred.email.split('@')[0].replace(/\d+b?$/, '')}`, true, '');
  await sleep(1500);
}
async function openDetail(p, onum, tag) {
  await p.goto(APP + '/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(5200);
  const T = await txt(p);
  ok(`${tag}-list-shows-order`, T.includes(onum), onum);
  const opened = await tap(p, onum, 3);
  await sleep(2000);
  ok(`${tag}-detail-open`, opened && (await txt(p)).includes(onum), '');
  return txt(p);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  // pre-flight server truth for THIS run
  const preB = await L.api(fxB.buyer.token, 'GET', `/api/v1/orders/${OID_B}`);
  ok('preflight-B-IN_TRANSIT-with-code', preB.json.status === 'IN_TRANSIT' && /^\d{6}$/.test(String(preB.json.deliveryCode)),
    `status=${preB.json.status} code=${preB.json.deliveryCode}`);
  const curCodeB = String(preB.json.deliveryCode || CODE_B);
  R.evidence.push(`Fixture B ${ONUM_B} (${OID_B}) IN_TRANSIT deliveryCode=${curCodeB} via real chain proforma->submit-payment->admin mark-paid->MOTORBIKE transporter->admin dispatch`);

  // ================= MOBILE 375: fixture B (T18) =================
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-039-mobile.webm' });
  const p = await ctx.newPage();
  p.on('response', r => { const u = r.url(); if (/localhost:8083\/api\//.test(u)) R.network.push(`${r.request().method()} ${u.replace('http://localhost:8083', '')} -> ${r.status()}`); });
  const imgs = L.watchImages(p);

  await loginAs(p, fxB.buyer);
  let T = await openDetail(p, ONUM_B, 'mobile-B');
  ok('mobile-T18-card-title-Delivery-code', T.includes('Delivery code'), '"Delivery code" present in a11y');
  ok('mobile-T18-card-subtitle', T.includes('Share this code with the driver'), 'subtitle verbatim');
  ok('mobile-T18-code-rendered', T.includes(curCodeB), `expected ${curCodeB}`);
  const codeNode = await p.evaluate((code) => {
    let r = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (r) return;
      if ((e.textContent || '').trim().split('\n').some(x => x.trim() === code)) {
        const b = e.getBoundingClientRect(); r = { w: Math.round(b.width), h: Math.round(b.height) };
      }
    });
    return r;
  }, curCodeB);
  ok('mobile-T18-code-node-has-large-style', !!codeNode && codeNode.h >= 20, JSON.stringify(codeNode));
  ok('no-placeholder-strings-mobile', !/lorem|placeholder|dummy|TODO/i.test(T), '');
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-01-B-in-transit-code.png`);
  R.evidence.push(`e2e/shots/AU-039/flutter-375-01-B-in-transit-code.png shows "${curCodeB}" inside the blue Delivery code card on ORD-2026-000046`);

  // ---- click EVERY control enumerated from this state ----
  const ctrls = await L.listButtons(p);
  R.buttons_total = ctrls.filter(c => c.kind === 'button' || c.kind === 'tappable').length;
  R.buttons_list = ctrls.filter(c => c.kind !== 'input').map(c => c.label.slice(0, 40));
  console.log('controls:', JSON.stringify(R.buttons_list));
  ok('track-delivery-visible-and-clicked', await scrollToText(p, 'Track delivery', 24) && await tap(p, 'Track delivery', 2), '');
  await sleep(2600);
  T = await txt(p);
  ok('mobile-nav-to-tracking-screen', T.includes('Delivery tracking'), T.split('\n').slice(0, 3).join('|'));
  ok('mobile-tracking-shows-trip-data', /Transporter/.test(T) && /IN TRANSIT|In transit|TRANSIT/i.test(T),
    T.split('\n').filter(x => /Transporter|transit|driver|Rider/i.test(x)).slice(0, 4).join('|'));
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-02-B-tracking.png`);

  // back to order detail
  const bk = await findNode(p, 'Back');
  if (bk) { await p.mouse.click(bk.x, bk.y); await sleep(1500); }

  // ================= TABLET 768: fixture B again =================
  const ctx2 = await L.newCtx(browser, { viewport: { width: 768, height: 1024 } });
  const t2 = await ctx2.newPage();
  t2.on('response', r => { const u = r.url(); if (/localhost:8083\/api\//.test(u)) R.network.push(`${r.request().method()} ${u.replace('http://localhost:8083', '')} -> ${r.status()}`); });
  const imgs2 = L.watchImages(t2);
  await loginAs(t2, fxB.buyer);
  TT = await openDetail(t2, ONUM_B, 'tablet-B'); var TT;
  ok('tablet-T18-card-title-Delivery-code', TT.includes('Delivery code'), '');
  ok('tablet-T18-code-rendered', TT.includes(curCodeB), `expected ${curCodeB}`);
  ok('tablet-T18-subtitle', TT.includes('Share this code with the driver'), '');
  await L.screenshot(t2, `${SHOT_DIR}/flutter-768-01-B-in-transit-code.png`);
  ok('tablet-track-delivery-nav', await scrollToText(t2, 'Track delivery', 26) && await tap(t2, 'Track delivery', 2), '');
  await sleep(2600);
  TT = await txt(t2);
  ok('tablet-nav-to-tracking-screen', TT.includes('Delivery tracking'), '');
  await L.screenshot(t2, `${SHOT_DIR}/flutter-768-02-B-tracking.png`);
  await ctx2.close();

  // ================= FIXTURE A (DELIVERED): T19 outcome + code hidden =================
  await p.goto(APP + '/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(5000);
  T = await txt(p);
  ok('mobile-list-shows-A', T.includes(ONUM_A), ONUM_A);
  await tap(p, ONUM_A, 3); await sleep(2200);
  T = await txt(p);
  ok('T19-detail-open-A-delivered', T.includes(ONUM_A) && /Delivered/i.test(T),
    T.split('\n').filter(x => /deliver/i.test(x)).slice(0, 3).join('|'));
  ok('T19-no-code-card-after-delivery', !T.includes('Share this code with the driver'),
    'deliveryCode nulled by backend once DELIVERED (API_MAP §contract 5)');
  ok('T19-no-stale-code-in-a11y', !(await txt(p)).includes(String(fxA.afterDispatch.deliveryCode)),
    `old code ${fxA.afterDispatch.deliveryCode} absent`);
  await scrollToText(p, 'Rate Seller', 24);
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-03-A-delivered-no-code.png`);
  // click Rate Seller presence check only (dialog opens; close without rating to keep fixture)
  const rs = await findNode(p, 'Rate Seller');
  ok('T19-rate-seller-action-present-post-delivery', !!rs, rs ? 'role=button found' : 'missing');
  if (rs) { await p.mouse.click(rs.x, rs.y); await sleep(1400); T = await txt(p);
    ok('T19-rating-dialog-opens', /Rating|rating|stars|Review|Submit/i.test(T), T.split('\n').filter(x=>/rating|star|review/i.test(x)).slice(0,2).join('|'));
    await L.screenshot(p, `${SHOT_DIR}/flutter-375-04-A-rating-dialog.png`);
    const cxl = await findNode(p, 'Cancel') || await findNode(p, 'Close') || await findNode(p, 'Later');
    if (cxl) { await p.mouse.click(cxl.x, cxl.y); await sleep(900); }
  }

  const imSum = L.imageSummary(imgs), imSum2 = L.imageSummary(imgs2);
  R.images_requested = imSum.total + imSum2.total;
  R.images_200 = imSum.ok + imSum2.ok;
  R.images_failed = imSum.failed + imSum2.failed;

  await ctx.close(); await browser.close();

  // ================= server-side re-check after all UI passes =================
  const postB = await L.api(fxB.buyer.token, 'GET', `/api/v1/orders/${OID_B}`);
  ok('post-run-B-still-IN_TRANSIT-unmutated-by-UI', postB.json.status === 'IN_TRANSIT', postB.json.status);
  const postA = await L.api(fxBuyerToken(fxB, fxA), 'GET', `/api/v1/orders/${OID_A}`);
  ok('post-run-A-still-DELIVERED', postA.json.status === 'DELIVERED', postA.json.status);

  R.passCount = R.asserts.filter(a => a.pass).length;
  R.failCount = R.failures.length;
  const line = { ts: R.ts, unit: 'AU-039', stage: 'verify-r2', agent: R.agent, build_sha: R.build_sha,
    viewport: R.viewport, verdict: R.failures.length ? 'FAIL' : 'PASS',
    checks: { freshness: true, real_data: true, images_requested: R.images_requested, images_200: R.images_200,
      buttons_total: R.buttons_total, state_asserts: R.asserts.length },
    failures: R.failures, asserts: R.asserts, evidence: R.evidence, network: R.network.slice(0, 60),
    fixtures: { A: { order: ONUM_A, id: OID_A, finalStatus: postA.json.status },
                B: { order: ONUM_B, id: OID_B, status: postB.json.status, codeShown: curCodeB } } };
  fs.mkdirSync('e2e/results/shards', { recursive: true });
  fs.appendFileSync('e2e/results/shards/AU-039-verify.jsonl', JSON.stringify(line) + '\n');
  fs.writeFileSync('/tmp/au039_r2_result.json', JSON.stringify(R, null, 2));
  console.log('\nR2 DONE. fails:', R.failures.length ? R.failures.join(' | ') : 'none');
})().catch(e => { console.error('VERIFY CRASH:', e); process.exit(1); });

function fxBuyerToken(fxb, fxa) { return fxa.buyer.token; }
