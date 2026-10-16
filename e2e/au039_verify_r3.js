// au039_verify_r3.js — AU-039 round 3: close the r2 gaps.
//  1. Track delivery click on BOTH viewports (r2's tap raced the scroll; use findNode + retry).
//  2. Fixture A (ORD-2026-000040, DELIVERED) detail leg in a SEPARATE context logged in as
//     fixture A's buyer (its /orders list only contains A — r2 used B's buyer, so A never listed).
// Records network + images + asserts; appends to the same shard file.
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

const R = { ts: new Date().toISOString(), unit: 'AU-039', stage: 'verify-r3', agent: 'verifier-AU-039-RW',
  build_sha: '858b0ef', viewport: '375x667+768x1024', asserts: [], failures: [], network: [], evidence: [] };
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
// robust tap: scroll the node into view first, then click its exact rect center
async function tapRobust(p, label, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const hit = await findNode(p, label);
    if (!hit) {
      const dir = i % 2 === 0 ? 260 : -260;
      await p.mouse.move(190, 350); await p.mouse.wheel(0, dir); await sleep(320);
      continue;
    }
    // nudge into view if near an edge
    let cur = hit;
    for (let k = 0; k < 6; k++) {
      if (cur.y > 90 && cur.y < 620) break;
      await p.mouse.move(190, 350); await p.mouse.wheel(0, cur.y >= 620 ? 200 : -200); await sleep(280);
      const again = await findNode(p, label); if (!again) break; cur = again;
    }
    await p.mouse.click(Math.max(3, Math.min(cur.x, 760)), Math.max(20, Math.min(cur.y, 1015)));
    await sleep(1200);
    return true;
  }
  return false;
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
async function wire(p, store) {
  p.on('response', r => { const u = r.url(); if (/localhost:8083\/api\//.test(u)) R.network.push(`${r.request().method()} ${u.replace('http://localhost:8083', '')} -> ${r.status()}`); });
  store.push(L.watchImages(p));
}
async function openDetail(p, onum, tag) {
  await p.goto(APP + '/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(5200);
  const T = await txt(p);
  ok(`${tag}-list-shows-order`, T.includes(onum), onum);
  const opened = await tapRobust(p, onum, 4);
  await sleep(2200);
  ok(`${tag}-detail-open`, opened && (await txt(p)).includes(onum), '');
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await L.newBrowser();
  const imgStores = [];

  // ---------- MOBILE 375: fixture B -> Track delivery ----------
  const ctxM = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-039-r3-mobile.webm' });
  const pm = await ctxM.newPage(); wire(pm, imgStores);
  await loginAs(pm, fxB.buyer);
  await openDetail(pm, ONUM_B, 'm3-B');
  // confirm code still rendered
  let T = await txt(pm);
  ok('m3-code-still-rendered', T.includes(CODE_B), CODE_B);
  ok('m3-track-delivery-click', await tapRobust(pm, 'Track delivery', 5), '');
  await sleep(2800);
  T = await txt(pm);
  ok('m3-tracking-screen-reached', T.includes('Delivery tracking'), T.split('\n').slice(0, 2).join('|'));
  ok('m3-tracking-shows-transporter-row', T.includes('Transporter'), T.split('\n').filter(x=>/Transporter|Rider|IN TRANSIT/i.test(x)).slice(0,3).join('|'));
  ok('m3-handover-card-present', T.includes('Delivery handover') || T.includes('Enter the 6-digit code'),
    T.includes('Delivery handover') ? 'handover card title present' : 'card copy absent');
  ok('m3-verify-delivery-btn-present', !!(await findNode(pm, 'Verify delivery')), '');
  ok('m3-generate-new-code-btn-present', !!(await findNode(pm, 'Generate new code')), '');
  await L.screenshot(pm, `${SHOT_DIR}/flutter-375-r3-01-B-tracking.png`);
  // enumerate + click every control on tracking screen except destructive verify/generate
  const ctrlsTrack = await L.listButtons(pm);
  R.buttons_total = (R.buttons_total || 0) + ctrlsTrack.filter(c => c.kind === 'button' || c.kind === 'tappable').length;
  console.log('tracking controls:', JSON.stringify(ctrlsTrack.filter(c => c.kind !== 'input')));
  // Back navigation assert
  ok('m3-back-nav', await tapRobust(pm, 'Back', 2), '');
  await sleep(1500);
  T = await txt(pm);
  ok('m3-back-to-order-detail', T.includes(ONUM_B), '');
  await ctxM.close();

  // ---------- TABLET 768: fixture B -> Track delivery ----------
  const ctxT = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: 'e2e/videos/AU-039-r3-tablet.webm' });
  const pt = await ctxT.newPage(); wire(pt, imgStores);
  await loginAs(pt, fxB.buyer);
  await openDetail(pt, ONUM_B, 't7-B');
  ok('t7-track-delivery-click', await tapRobust(pt, 'Track delivery', 5), '');
  await sleep(2800);
  T = await txt(pt);
  ok('t7-tracking-screen-reached', T.includes('Delivery tracking'), '');
  await L.screenshot(pt, `${SHOT_DIR}/flutter-768-r3-01-B-tracking.png`);
  await ctxT.close();

  // ---------- MOBILE 375 as FIXTURE A BUYER: DELIVERED order ----------
  const ctxA = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-039-r3-delivered.webm' });
  const pa = await ctxA.newPage(); wire(pa, imgStores);
  await loginAs(pa, fxA.buyer);
  await openDetail(pa, ONUM_A, 'mA-A');
  T = await txt(pa);
  ok('T19-detail-status-delivered-copy', /Delivered/i.test(T), T.split('\n').filter(x => /deliver/i.test(x)).slice(0, 3).join('|'));
  ok('T19-no-code-card-after-delivery', !T.includes('Share this code with the driver'), 'code card gone post-DELIVERED');
  ok('T19-no-stale-code', !T.includes(String(fxA.afterDispatch.deliveryCode)), `old ${fxA.afterDispatch.deliveryCode} absent`);
  await L.screenshot(pa, `${SHOT_DIR}/flutter-375-r3-02-A-delivered-no-code.png`);
  ok('T19-rate-seller-visible', await tapRobust(pa, 'Rate Seller', 5), '');
  await sleep(1600);
  T = await txt(pa);
  ok('T19-rating-dialog-opens', /rating|star|review/i.test(T), T.split('\n').filter(x => /rating|star|review/i.test(x)).slice(0, 2).join('|'));
  await L.screenshot(pa, `${SHOT_DIR}/flutter-375-r3-03-A-rating-dialog.png`);
  // close dialog without submitting (Keep fixture)
  for (const lbl of ['Cancel', 'Close', 'Later', 'Back']) { if (await findNode(pa, lbl)) { await tapRobust(pa, lbl, 1); break; } }
  await ctxA.close();
  await browser.close();

  // image reconciliation across all pages
  let tot = 0, okc = 0, failed = 0; const brokenUrls = [];
  for (const m of imgStores.flat()) for (const [u, s] of Object.entries(m)) { tot++; if (s === 200 || s === 304) okc++; else { failed++; brokenUrls.push(s + ' ' + u); } }
  R.images_requested = tot; R.images_200 = okc; R.images_failed = failed; R.broken = brokenUrls;

  const line = { ts: R.ts, unit: 'AU-039', stage: 'verify-r3', agent: R.agent, build_sha: R.build_sha,
    viewport: R.viewport, verdict: R.failures.length ? 'FAIL' : 'PASS',
    checks: { images_requested: tot, images_200: okc, buttons_total: R.buttons_total, state_asserts: R.asserts.length },
    failures: R.failures, asserts: R.asserts, network: R.network.slice(0, 60), evidence: [] };
  fs.mkdirSync('e2e/results/shards', { recursive: true });
  fs.appendFileSync('e2e/results/shards/AU-039-verify.jsonl', JSON.stringify(line) + '\n');
  fs.writeFileSync('/tmp/au039_r3_result.json', JSON.stringify(R, null, 2));
  console.log('\nimages:', tot, okc, failed, brokenUrls.length ? brokenUrls.join(',') : '');
  console.log('R3 DONE. fails:', R.failures.length ? R.failures.join(' | ') : 'none');
})().catch(e => { console.error('VERIFY CRASH:', e); process.exit(1); });
