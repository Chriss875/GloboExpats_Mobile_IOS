// au039_verify_r5.js — INTERACTIVE browser loop on fixture C (ORD-2026-000056, IN_TRANSIT):
//   buyer opens Track delivery -> types 3 WRONG codes in the app card -> app locks ->
//   taps "Generate new code" (REAL buyer-authorized regenerate; server resets attempts) ->
//   seller verifies the NEW code via real API -> DELIVERED.
// Canonical checks: network, images, clicks, both viewports, screenshots.
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9112';
const fxC = JSON.parse(fs.readFileSync('/tmp/au039_fixtures_c.json', 'utf8'));
const SHOT_DIR = 'e2e/shots/AU-039';
const OID = String(fxC.orderId), ONUM = fxC.orderNumber;
const OLD_CODE = String(fxC.afterDispatch.deliveryCode);
const R = { ts: new Date().toISOString(), unit: 'AU-039', stage: 'verify-r5', asserts: [], failures: [], network: [], evidence: [] };
const ok = (n, c, d) => { R.asserts.push({ name: n, pass: !!c, detail: String(d || '').slice(0, 220) }); console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? ' :: ' + String(d).slice(0, 150) : '')); if (!c) R.failures.push(n); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const txt = p => p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
async function isLoggedIn(p) { try { return !!await p.evaluate(() => localStorage.getItem('flutter.auth_token') || ''); } catch (e) { return false; } }
async function findNode(p, label) {
  return p.evaluate((lbl) => { let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => { const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return;
      if (!best || r.width * r.height < best.area) best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), label: t.slice(0, 50) };
    }); return best; }, label);
}
async function tap(p, label, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const h = await findNode(p, label);
    if (h) { await p.mouse.click(Math.max(3, Math.min(h.x, 760)), Math.max(20, Math.min(h.y, 1015))); await sleep(1100); return true; }
    await p.mouse.move(190, 350); await p.mouse.wheel(0, i % 2 === 0 ? 260 : -260); await sleep(320);
  } return false;
}
(async () => {
  const pre = await L.api(fxC.buyer.token, 'GET', `/api/v1/orders/${OID}`);
  ok('pre-C-IN_TRANSIT-with-code', pre.json.status === 'IN_TRANSIT' && /^\d{6}$/.test(String(pre.json.deliveryCode)), `${pre.json.status} ${pre.json.deliveryCode}`);

  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-039-r5-interactive.webm' });
  const p = await ctx.newPage();
  const imgs = {}; const imgStore = [];
  p.on('response', r => { const u = r.url(); if (/localhost:8083\/api\//.test(u)) R.network.push(`${r.request().method()} ${u.replace('http://localhost:8083', '')} -> ${r.status()}`); });
  imgStore.push(L.watchImages(p));
  // login
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000);
  if (!(await isLoggedIn(p))) {
    await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
    const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(fxC.buyer.email, { delay: 14 });
    const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(fxC.buyer.pw, { delay: 14 });
    await L.clickBtn(p, 'Log in');
    let li = false; for (let i = 0; i < 30 && !li; i++) { await sleep(1000); li = await isLoggedIn(p); }
    ok('login-buyerC', li, '');
  }
  await sleep(1500);
  await p.goto(APP + '/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(5200);
  let T = await txt(p);
  ok('list-shows-C', T.includes(ONUM), ONUM);
  ok('open-detail-C', await tap(p, ONUM, 4) && (await txt(p)).includes(ONUM), '');
  ok('detail-shows-old-code-card', (await txt(p)).includes(OLD_CODE), OLD_CODE);
  ok('nav-track-delivery', await tap(p, 'Track delivery', 5), '');
  await sleep(2600);
  T = await txt(p);
  ok('tracking-screen-open', T.includes('Delivery tracking'), '');
  ok('handover-card-input-present', !!(await p.locator('input').count()), `${await p.locator('input').count()} input(s)`);

  // ---- 3 wrong codes typed in the APP ----
  for (let i = 1; i <= 3; i++) {
    const inp = p.locator('input').first();
    await inp.click({ force: true }).catch(() => {}); await sleep(250);
    await p.keyboard.type(String(900000 + i * 13), { delay: 20 }); await sleep(300);
    const typed = await p.evaluate(() => { const el = document.querySelector('input'); return el ? el.value : null; });
    ok(`wrong-code-${i}-typed`, typed === String(900000 + i * 13), `dom="${typed}"`);
    await L.screenshot(p, `${SHOT_DIR}/flutter-375-r5-0${i}-typed-wrong.png`);
    ok(`tap-verify-${i}`, await tap(p, 'Verify delivery', 2), '');
    await sleep(1600);
    T = await txt(p);
    const dec = T.includes(`${i} attempt`) || /attempt/i.test(T);
    ok(`app-attempts-message-${i}`, /attempt/i.test(T), T.split('\n').filter(x => /attempt|INVALID|lock/i.test(x)).slice(0, 2).join('|'));
    if (i === 3) {
      ok('app-locked-after-three', T.includes('Three attempts have been used'), T.split('\n').filter(x => /three|lock/i.test(x)).slice(0, 2).join('|'));
      const vbtn = await findNode(p, 'Verify delivery');
      const disabled = vbtn ? null : 'missing';
      // disabled check: Flutter semantics exposes disabled buttons without role=button OR with aria-disabled
      const dis = await p.evaluate(() => {
        let found = null;
        document.querySelectorAll('flt-semantics').forEach(e => {
          if (found) return;
          if ((e.textContent || '').includes('Verify delivery')) found = { disabled: e.hasAttribute('aria-disabled') && e.getAttribute('aria-disabled') !== 'false', role: e.getAttribute('role'), tappable: e.getAttribute('flt-tappable') };
        });
        return found;
      });
      ok('verify-btn-disabled-or-dimmed-when-locked', !!dis && (dis.disabled || dis.role !== 'button' || dis.tappable === null), JSON.stringify(dis));
      await L.screenshot(p, `${SHOT_DIR}/flutter-375-r5-04-locked.png`);
    }
  }

  // ---- regenerate from the BUYER's handover card (server truth) ----
  const rgNetBefore = R.network.length;
  ok('tap-generate-new-code', await tap(p, 'Generate new code', 2), '');
  await sleep(2000);
  T = await txt(p);
  ok('app-regenerate-success-copy', T.includes('New code generated'), T.split('\n').filter(x => /new code/i.test(x)).slice(0, 2).join('|'));
  ok('network-regenerate-called', R.network.slice(rgNetBefore).some(l => l.includes('/regenerate-delivery-code') && l.includes('-> 200')),
    R.network.slice(rgNetBefore).filter(l => l.includes('regenerate')).join('|'));
  const afterRg = await L.api(fxC.buyer.token, 'GET', `/api/v1/orders/${OID}`);
  const NEW_CODE = String(afterRg.json.deliveryCode);
  ok('server-issued-new-different-code-still-IN_TRANSIT', /^\d{6}$/.test(NEW_CODE) && NEW_CODE !== OLD_CODE && afterRg.json.status === 'IN_TRANSIT',
    `old=${OLD_CODE} new=${NEW_CODE} status=${afterRg.json.status}`);
  fs.writeFileSync('/tmp/au039_c_newcode.json', JSON.stringify({ NEW_CODE }));
  await ctx.close();

  // ---- TABLET: buyer re-opens tracking; card shows fresh unlocked state ----
  const ctxT = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: 'e2e/videos/AU-039-r5-tablet.webm' });
  const pt = await ctxT.newPage(); pt.on('response', r => { const u = r.url(); if (/localhost:8083\/api\//.test(u)) R.network.push(`${r.request().method()} ${u.replace('http://localhost:8083', '')} -> ${r.status()}`); });
  imgStore.push(L.watchImages(pt));
  await pt.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(pt, 'Buy now', 45000);
  if (!(await isLoggedIn(pt))) {
    await L.clickBtn(pt, 'Login'); await L.waitText(pt, 'Welcome back', 25000);
    const ei = pt.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(300); await pt.keyboard.type(fxC.buyer.email, { delay: 14 });
    const pi = pt.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(300); await pt.keyboard.type(fxC.buyer.pw, { delay: 14 });
    await L.clickBtn(pt, 'Log in');
    let li = false; for (let i = 0; i < 30 && !li; i++) { await sleep(1000); li = await isLoggedIn(pt); }
    ok('tablet-login', li, '');
  }
  await sleep(1400);
  await pt.goto(APP + '/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(5000);
  TT = await txt(pt);
  ok('tablet-list-shows-C', TT.includes(ONUM), '');
  await tap(pt, ONUM, 4); await sleep(2000);
  ok('tablet-detail-shows-new-code', (await txt(pt)).includes(NEW_CODE), NEW_CODE);
  await L.screenshot(pt, `${SHOT_DIR}/flutter-768-r5-01-new-code.png`);
  await tap(pt, 'Track delivery', 5); await sleep(2400);
  ok('tablet-tracking-open', (await txt(pt)).includes('Delivery tracking'), '');
  await L.screenshot(pt, `${SHOT_DIR}/flutter-768-r5-02-tracking.png`);
  await ctxT.close();
  await browser.close();

  // ---- SELLER verifies the NEW code via REAL API (T19) ----
  const vd = await L.api(fxC.seller.token, 'POST', `/api/v1/orders/${OID}/verify-delivery`, { code: NEW_CODE });
  R.verifyDelivery = { status: vd.status, body: vd.json };
  ok('T19-correct-new-code-verifies', vd.status === 200 && (vd.json || {}).status === 'DELIVERED', JSON.stringify(vd.json || {}).slice(0, 180));
  const fin = await L.api(fxC.buyer.token, 'GET', `/api/v1/orders/${OID}`);
  ok('T19-final-status-DELIVERED-code-hidden', fin.json.status === 'DELIVERED' && (fin.json.deliveryCode == null || fin.json.deliveryCode === ''),
    `status=${fin.json.status} code=${JSON.stringify(fin.json.deliveryCode)}`);

  let tot = 0, okc = 0;
  for (const m of imgStore.flat()) for (const s of Object.values(m)) { tot++; if (s === 200 || s === 304) okc++; }
  R.images_requested = tot; R.images_200 = okc;

  const line = { ts: R.ts, unit: 'AU-039', stage: 'verify-r5', agent: 'verifier-AU-039-RW', build_sha: '858b0ef',
    viewport: '375x667+768x1024', verdict: R.failures.length ? 'FAIL' : 'PASS',
    checks: { images_requested: tot, images_200: okc }, failures: R.failures, asserts: R.asserts,
    verifyDelivery: R.verifyDelivery, network: R.network.slice(0, 60) };
  fs.mkdirSync('e2e/results/shards', { recursive: true });
  fs.appendFileSync('e2e/results/shards/AU-039-verify.jsonl', JSON.stringify(line) + '\n');
  fs.writeFileSync('/tmp/au039_r5_result.json', JSON.stringify(R, null, 2));
  console.log('\nimages:', tot, okc);
  console.log('R5 DONE. fails:', R.failures.length ? R.failures.join(' | ') : 'none');
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
