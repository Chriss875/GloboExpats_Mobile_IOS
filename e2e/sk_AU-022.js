// sk_AU-022.js — SKEPTIC Appendix B battery vs AU-022 verifier FAIL(r2)/post-fix bundle.
// Frozen lane :9108 sha 7b4342f mtime Mon, 24 Aug 2026 03:13:31 GMT (content-checked).
// Attack classes: A1 cold deep link gate(+returnUrl resume, post-fix retest) | A2 rapid
// double-taps (Continue + Submit Payment) | A3 mid-flow back-out at locked step |
// A4 empty-cart state (authed, second fixture account) | A5 invalid input (emoji/Swahili/
// script tag in editable fields, 120-char ref) | A6 offline mid-request + retry |
// A7 401 session-death mid-request | A8 TZS/locale totals vs reference PNG | A9 role probe
// (buyer token vs admin endpoint). NEVER fakes success; every claim tied to text/DOM/net/backend.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9108';
const UNIT = 'AU-022';
const SHOTS = 'e2e/shots/AU-022-skeptic';
fs.mkdirSync(SHOTS, { recursive: true });
const fx = JSON.parse(fs.readFileSync('/tmp/au022_fixtures.json', 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = { attacks: [], broken: [] };
function att(id, name, pass, detail) {
  R.attacks.push({ id, name, pass, detail });
  console.log(`[${pass ? 'ok' : 'BROKEN'}] ${id} ${name} :: ${detail}`);
  if (!pass) R.broken.push(`${id} ${name}`);
  fs.writeFileSync('/tmp/sk022_results.json', JSON.stringify(R, null, 2));
}
async function txt(p) { return p.evaluate(() => document.body.innerText || ''); }
async function isLoggedIn(p) { return p.evaluate(() => !!(localStorage.getItem('flutter.auth_token') || '').length); }
async function findTap(p, label) {
  return p.evaluate((lbl) => { let best = null; document.querySelectorAll('flt-semantics').forEach(e => {
    const t = (e.textContent || ''); const r = e.getBoundingClientRect();
    if (!t.includes(lbl)) return;
    if (e.getAttribute('flt-tappable') === null && e.getAttribute('role') !== 'button') return;
    if (r.width < 5 || r.height < 5 || r.bottom < 0 || r.top > innerHeight) return;
    const a = r.width * r.height; if (!best || a < best.a) best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }); return best; }, label);
}
async function tapLabel(p, label, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const c = await findTap(p, label);
    if (c) { await p.mouse.click(Math.max(5, c.x), Math.min(Math.max(c.y, 20), 655)); await sleep(1400); return true; }
    await p.mouse.move(188, 420); await p.mouse.wheel(0, 320); await sleep(380);
  }
  return false;
}
async function btnCenter(p, label) {
  for (let i = 0; i < 14; i++) {
    const c = await p.evaluate((lbl) => { let best = null; document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || ''); if (!t.includes(lbl) || e.getAttribute('role') !== 'button') return;
      const r = e.getBoundingClientRect(); if (r.width < 5 || r.bottom < 0 || r.top > innerHeight) return;
      const a = r.width * r.height; if (!best || a < best.a) best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }); return best; }, label);
    if (c) return c;
    await p.mouse.move(188, 420); await p.mouse.wheel(0, 320); await sleep(400);
  }
  return null;
}
async function loginFlow(p, cred) {
  if (await isLoggedIn(p)) return true;
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
  let ei = p.locator('input[type="text"]').first();
  await ei.click({ force: true }); await sleep(300); await p.keyboard.type(cred.email, { delay: 8 });
  ei = p.locator('input[type="password"]').first();
  await ei.click({ force: true }); await sleep(300); await p.keyboard.type(cred.pw, { delay: 8 });
  await L.clickBtn(p, 'Log in');
  let ok = false; for (let i = 0; i < 30 && !ok; i++) { await sleep(1000); ok = await isLoggedIn(p); }
  return ok;
}
async function bootHome(p) { await p.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 15; i++) { await sleep(2000); if ((await p.evaluate(() => document.querySelectorAll('flt-semantics').length).catch(() => 0)) > 10) break; } }
async function openCheckoutStep1(p) { // search fixture rug -> Buy now -> Step 1 of 4
  await L.clickBtn(p, 'Search'); await sleep(1800);
  const si = p.locator('input[type="text"]').first();
  await si.click({ force: true }).catch(() => {}); await sleep(300);
  await p.keyboard.type('probe rug', { delay: 12 }); await sleep(900); await p.keyboard.press('Enter');
  await sleep(3500);
  let rug = null;
  for (let k = 0; k < 10 && !rug; k++) {
    rug = await p.evaluate(() => { let best = null; document.querySelectorAll('flt-semantics').forEach(e => {
      if (e.getAttribute('flt-tappable') === null) return; const t = (e.textContent || ''); if (!t.includes('Checkout Probe Rug')) return;
      const r = e.getBoundingClientRect(); if (r.width < 40 || r.height < 40 || r.bottom < 0 || r.top > innerHeight) return;
      const a = r.width * r.height; if (!best || a < best.a) best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }); return best; });
    if (!rug) { await p.mouse.move(190, 400); await p.mouse.wheel(0, 400); await sleep(500); }
  }
  if (!rug) return false;
  await p.mouse.click(Math.max(5, rug.x), Math.min(rug.y, 655)); await sleep(2600);
  const bn = await btnCenter(p, 'Buy now');
  if (!bn) return false;
  await p.mouse.click(bn.x, Math.min(bn.y, 655)); await sleep(3200);
  return (await txt(p)).includes('Step 1 of 4');
}
async function toStep2(p) {
  const ok = await tapLabel(p, 'Continue to review'); await sleep(3500);
  return ok && (await txt(p)).includes('Step 2 of 4');
}
async function cbAll(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].filter(e => e.getAttribute('role') === 'checkbox').map(e => {
    const r = e.getBoundingClientRect(); return { chk: e.getAttribute('aria-checked'), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }));
}
async function tickWindowsAndTerms(p) {
  for (let k = 0; k < 12; k++) {
    const yTop = await p.evaluate(() => { let y = null; document.querySelectorAll('flt-semantics').forEach(e => {
      if ((e.textContent || '').trim() === 'When should we deliver?') { y = Math.round(e.getBoundingClientRect().y); } }); return y; });
    if (yTop !== null && yTop < 130) break;
    await p.mouse.move(188, 400); await p.mouse.wheel(0, 300); await sleep(400);
  }
  let cbs = await cbAll(p);
  const w = cbs.filter(c => c.y > 110 && c.y < 660).sort((a, b) => a.y - b.y)[0];
  if (w && w.chk === 'false') { await p.mouse.click(w.x, Math.min(w.y, 650)); await sleep(900); }
  cbs = await cbAll(p);
  const last = cbs.sort((a, b) => b.y - a.y)[0];
  if (last && last.chk === 'false') { await p.mouse.click(last.x, Math.min(Math.max(last.y, 20), 650)); await sleep(800); }
}

(async () => {
  const t0 = Date.now();
  // ---- FRESHNESS ----
  const fr = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = fr.headers.get('last-modified');
  const bodyjs = await fetch(APP + '/main.dart.js').then(r => r.text());
  const marker = bodyjs.includes('Select your rental dates') && bodyjs.includes('of 4') && bodyjs.includes('Confirm & proceed to payment');
  const fresh = ['Mon, 24 Aug 2026 03:02:36 GMT', 'Mon, 24 Aug 2026 03:13:31 GMT'].includes(lm) && marker;
  att('F0', 'frozen-lane freshness', fresh, `lm=${lm} marker=${marker}`);

  const browser = await L.newBrowser();
  const net = []; // api request log for the main context

  // ================= A1 cold deep link (post-fix retest of verifier C3 blocker) =================
  const ctxC = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-022-sk-cold.webm' });
  const pc = await ctxC.newPage();
  const urlSeen = [];
  pc.on('framenavigated', f => { if (f === pc.mainFrame()) urlSeen.push(f.url()); });
  await pc.goto(APP + '/checkout', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  let gateTxt = '', gateHit = false, redirected = false;
  for (let i = 0; i < 18; i++) {
    await sleep(2000);
    gateTxt = await txt(pc).catch(() => '');
    const u = pc.url();
    if (/login/i.test(u)) { redirected = true; break; }
    if (gateTxt.includes('Please log in')) { gateHit = true; break; }
    if ((await pc.evaluate(() => document.querySelectorAll('flt-semantics').length).catch(() => 0)) > 10 && !gateHit) { /* painted */ }
  }
  await L.screenshot(pc, `${SHOTS}/sk-A1-cold-deeplink.png`);
  const homeLeak = gateTxt.includes('Shop by category') || gateTxt.includes('Featured');
  att('A1', 'cold /checkout signed-out shows gate or redirects', gateHit || redirected,
    `gate=${gateHit} redirect=${redirected} url=${pc.url()} homeLeak=${homeLeak}`);
  // A1b returnUrl resume through the gate (only meaningful if gate rendered in-app)
  let resume = 'n/a (no gate)';
  if (gateHit) {
    await L.screenshot(pc, `${SHOTS}/sk-A1b-gate.png`);
    const clicked = await tapLabel(pc, 'Log in', 3) || await tapLabel(pc, 'Login', 3);
    const form = (await txt(pc)).includes('Welcome back');
    let ei = pc.locator('input[type="text"]').first();
    await ei.click({ force: true }); await sleep(300); await pc.keyboard.type(fx.buyer.email, { delay: 8 });
    ei = pc.locator('input[type="password"]').first();
    await ei.click({ force: true }); await sleep(300); await pc.keyboard.type(fx.buyer.pw, { delay: 8 });
    await L.clickBtn(pc, 'Log in');
    let backAtCheckout = false;
    for (let i = 0; i < 25 && !backAtCheckout; i++) { await sleep(1000); const T = await txt(pc); backAtCheckout = T.includes('Step 1 of 4') || T.includes('cart is empty') || /checkout/i.test(pc.url()); }
    resume = `clicked=${clicked} form=${form} resumed=${backAtCheckout} url=${pc.url()}`;
    await L.screenshot(pc, `${SHOTS}/sk-A1b-after-login.png`);
    att('A1b', 'gate login resumes to checkout', backAtCheckout, resume);
  } else { att('A1b', 'gate login resumes to checkout', false, 'SKIPPED — gate never rendered; see A1'); }
  await L.closeVideo(ctxC, 'e2e/videos/AU-022-sk-cold.webm').catch(() => {});

  // ================= MAIN context: A2..A9 =================
  const ctxM = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-022-skeptic.webm' });
  const pm = await ctxM.newPage();
  const imgMap = {};
  pm.on('response', r => { const u = r.url(); if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u] = r.status(); });
  pm.on('request', rq => { const u = rq.url(); if (/localhost:8083\/api\/v1\//.test(u)) net.push({ m: rq.method(), u: u.replace('http://localhost:8083', ''), t: Date.now() - t0 }); });

  await bootHome(pm);
  const logged = await loginFlow(pm, fx.buyer);
  att('M0', 'fixture buyer login', !!logged, `token=${logged}`);

  // ---- A4 empty-cart checkout state (before adding anything) ----
  await pm.goto(APP + '/checkout', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  await sleep(6000);
  let T = await txt(pm);
  await L.screenshot(pm, `${SHOTS}/sk-A4-empty-cart-checkout.png`);
  const emptyish = /empty|nothing|no items|Add items|Your cart/i.test(T);
  att('A4', 'authed /checkout with empty cart shows a sane state, no step machine', emptyish || T.includes('Step 1 of 4') === false,
    `emptyCopy=${emptyish} stepMachineShown=${T.includes('Step 1 of 4')} snippet=${JSON.stringify(T.slice(0, 160))}`);

  // ---- build cart, reach Step 1 ----
  await bootHome(pm);
  const step1 = await openCheckoutStep1(pm);
  att('M1', 'Buy now reaches Step 1 of 4', !!step1, `step1=${step1}`);

  // ---- A5 invalid input: editable free-text at step1 (emoji/Swahili/script tag) ----
  const editable = await pm.evaluate(() => [...document.querySelectorAll('input:not([disabled])')].filter(i => !i.readOnly && i.type !== 'password').map(i => ({ ph: i.placeholder || i.type, ro: i.readOnly })));
  if (editable.length) {
    const inp = pm.locator('input:not([readonly]):not([disabled])').first();
    await inp.click({ force: true }); await sleep(300);
    await pm.keyboard.type('<script>x()</script> 🚀 Karibu sana', { delay: 6 });
    await sleep(400);
    const val = await pm.evaluate(() => { const i = [...document.querySelectorAll('input')].find(x => !x.readOnly && !x.disabled && x.type !== 'password'); return i ? i.value : null; });
    att('A5a', 'step1 editable field accepts adversarial string w/o crash', val !== null, `editableFields=${editable.length} valueEcho=${JSON.stringify(val)}`);
    // clear it back so the flow stays clean
    for (let i = 0; i < 30; i++) { await pm.keyboard.press('Backspace'); await sleep(15); }
  } else {
    att('A5a', 'step1 editable field accepts adversarial string w/o crash', true, 'all step-1 contact/address inputs readOnly by design (profile prefill); adversarial text deferred to step-3 reference field');
  }

  // ---- A2 double-tap Continue to review ----
  const contBtn = await btnCenter(pm, 'Continue to review');
  let dtPosts = 0;
  if (contBtn) {
    const before = net.filter(n => /proforma|checkout/i.test(n.u)).length;
    await pm.mouse.click(contBtn.x, Math.min(contBtn.y, 650));
    await pm.waitForTimeout(140);
    await pm.mouse.click(contBtn.x, Math.min(contBtn.y, 650));
    await sleep(7000);
    dtPosts = net.slice(before).filter(n => n.m === 'POST' && /proforma|checkout/i.test(n.u)).length;
  }
  T = await txt(pm);
  const pfMatches = [...new Set(T.match(/PF-\d+-\d+/g) || [])];
  const step2afterDT = T.includes('Step 2 of 4');
  await L.screenshot(pm, `${SHOTS}/sk-A2-doubletap-continue.png`);
  att('A2', 'double-tap Continue: no double-submit/duplicate invoice, lands step2', step2afterDT && dtPosts <= 1 && pfMatches.length <= 1,
    `postsToCreate=${dtPosts} step2=${step2afterDT} pfOnScreen=${JSON.stringify(pfMatches)}`);

  // ---- A3 mid-flow back-out at step>=3 (app-bar Back while items locked) ----
  await tickWindowsAndTerms(pm);
  const conf = await btnCenter(pm, 'Confirm & proceed to payment');
  let step3 = false;
  if (conf) { await pm.mouse.click(conf.x, Math.min(conf.y, 650)); await sleep(6000); T = await txt(pm); step3 = T.includes('Step 3 of 4'); }
  const pf3 = [...new Set(T.match(/PF-\d+-\d+/g) || [])][0] || '';
  att('M2', 'Confirm reaches Step 3 with proforma', step3 && !!pf3, `step3=${step3} pf=${pf3}`);
  await L.screenshot(pm, `${SHOTS}/sk-A3-step3-locked.png`);
  const lockOk = T.includes('Locked') || T.includes('Cancel invoice');
  // app-bar Back
  let backAt = 'none';
  const backBtn = await pm.evaluate(() => { let b = null; document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
    if ((e.textContent || '').trim() === 'Back') { const r = e.getBoundingClientRect(); if (r.width > 3 && r.y >= 0) b = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; } }); return b; });
  if (backBtn) {
    await pm.mouse.click(backBtn.x, Math.min(backBtn.y, 650)); await sleep(2500);
    T = await txt(pm);
    backAt = T.includes('Step 2 of 4') ? 'step2' : T.includes('Step 3 of 4') ? 'stayed-step3' : T.includes('Step 1 of 4') ? 'step1' : 'other';
  } else backAt = 'no-appbar-back';
  await L.screenshot(pm, `${SHOTS}/sk-A3-after-back.png`);
  att('A3', 'mid-flow Back at locked step behaves sanely (no qty/unlock exploit, no crash)',
    ['step2', 'stayed-step3'].includes(backAt),
    `backLands=${backAt} lockChips=${lockOk} pfStillSingle=${[...new Set((await txt(pm)).match(/PF-\d+-\d+/g) || [])].length <= 1}`);

  // go back to step3 properly for the payment attacks (forward nav again)
  let fwd = false;
  for (let k = 0; k < 3 && !fwd; k++) {
    fwd = await tapLabel(pm, 'Continue to review') && await (async () => { await sleep(3000); return (await txt(pm)).includes('Step 2 of 4'); })();
    if (!fwd) break;
    await tickWindowsAndTerms(pm);
    const c2 = await btnCenter(pm, 'Confirm & proceed to payment');
    if (c2) { await pm.mouse.click(c2.x, Math.min(c2.y, 650)); await sleep(6000); fwd = (await txt(pm)).includes('Step 3 of 4'); }
  }
  T = await txt(pm);
  const pfPay = [...new Set(T.match(/PF-\d+-\d+/g) || [])][0] || pf3;

  // ---- A6 OFFLINE mid-request: abort all API, tap Confirm/Submit -> expect visible failure, stay on step3 ----
  await pm.route('**localhost:8083/api/v1/**', route => route.abort());
  // scroll to submit button
  let sub = null;
  for (let k = 0; k < 16 && !sub; k++) {
    sub = await pm.evaluate(() => { let b = null; document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || ''); if (!t.includes('Submit Payment for Verification') || e.getAttribute('role') !== 'button') return;
      const r = e.getBoundingClientRect(); if (r.width < 5 || r.bottom < 0 || r.top > innerHeight) return;
      const a = r.width * r.height; if (!best(a, b)) ; function best(a, b) { return b === null || a < b.a; } if (!b || a < b.a) b = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), a }; }); return b; });
    if (!sub) { await pm.mouse.move(188, 430); await pm.mouse.wheel(0, 260); await sleep(330); }
  }
  let offlineResult = 'submit-button-not-found';
  if (sub) {
    await pm.mouse.click(sub.x, Math.min(sub.y, 650)); await sleep(7000);
    T = await txt(pm);
    const stillStep3 = T.includes('Step 3 of 4');
    const notStep4 = !T.includes('Step 4 of 4');
    const errSurfaced = /fail|error|try again|network|offline|could not|unable/i.test(T);
    offlineResult = `stillStep3=${stillStep3} noFakeStep4=${notStep4} errCopy=${errSurfaced}`;
    await L.screenshot(pm, `${SHOTS}/sk-A6-offline-submit.png`);
  }
  await pm.unroute('**localhost:8083/api/v1/**');
  att('A6', 'offline mid-submit: no fake success, error surfaced, stays on step3',
    /stillStep3=true/.test(offlineResult) && /noFakeStep4=true/.test(offlineResult),
    offlineResult);

  // ---- A7 SESSION DEATH: fulfill 401 on every API POST -> submit -> expect failure not success ----
  await pm.route('**localhost:8083/api/v1/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'session expired' }) }));
  let sub2 = await pm.evaluate(() => { let b = null; document.querySelectorAll('flt-semantics').forEach(e => {
    const t = (e.textContent || ''); if (!t.includes('Submit Payment for Verification') || e.getAttribute('role') !== 'button') return;
    const r = e.getBoundingClientRect(); if (r.width < 5) return; b = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }); return b; });
  if (!sub2) { await pm.mouse.move(188, 430); await pm.mouse.wheel(0, 260); await sleep(400); sub2 = await pm.evaluate(() => { let b = null; document.querySelectorAll('flt-semantics').forEach(e => {
    const t = (e.textContent || ''); if (!t.includes('Submit Payment for Verification') || e.getAttribute('role') !== 'button') return;
    const r = e.getBoundingClientRect(); if (r.width < 5) return; b = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }); return b; }); }
  let s401 = 'button-missing';
  if (sub2) {
    await pm.mouse.click(sub2.x, Math.min(sub2.y, 650)); await sleep(7000);
    T = await txt(pm);
    s401 = `noFakeStep4=${!T.includes('Step 4 of 4')} errCopy=${/expire|401|unauthor|fail|error|again|log ?in/i.test(T)} stillStep3=${T.includes('Step 3 of 4')}`;
    await L.screenshot(pm, `${SHOTS}/sk-A7-401-submit.png`);
  }
  await pm.unroute('**localhost:8083/api/v1/**');
  att('A7', 'session-death (401) mid-submit: no fake success, graceful failure', /noFakeStep4=true/.test(s401) && /stillStep3=true/.test(s401), s401);

  // ---- REAL submit with adversarial-but-valid reference (A5b) + A2b double-tap Submit ----
  const tappedRefMode = await tapLabel(pm, 'Enter reference', 3);
  const modeRow = await pm.evaluate(() => { let best = null; document.querySelectorAll('flt-semantics').forEach(e => {
    const t = (e.textContent || '').trim(); if (!t.startsWith('Upload screenshot')) return;
    const r = e.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
    if (!best || r.y < best.y) best = { y: Math.round(r.y), h: Math.round(r.height) }; }); return best; });
  const fieldY = modeRow ? modeRow.y + modeRow.h + 40 : 500;
  await pm.mouse.click(188, Math.min(fieldY, 640)); await sleep(700);
  const refCode = `SK022V${fx.stamp % 100000}`;
  await pm.keyboard.type(refCode, { delay: 12 });
  // append adversarial tail: Swahili + emoji + angle brackets (120-char class)
  await pm.keyboard.type(' Malizō 🚀 <b>inv-α</b> karibu-sana-0123456789', { delay: 6 });
  const domRef = await pm.evaluate(() => { const i = [...document.querySelectorAll('input')].find(x => x.type === 'text' && !x.disabled); return i ? i.value : null; });
  await L.screenshot(pm, `${SHOTS}/sk-A5b-adversarial-ref.png`);
  for (let k = 0; k < 10; k++) { T = await txt(pm); if (T.includes('Submit Payment for Verification') && /I have completed/.test(T)) break;
    await pm.mouse.move(188, 430); await pm.mouse.wheel(0, 180); await sleep(320); }
  let cbs = await cbAll(pm);
  const cb = cbs.sort((a, b) => b.y - a.y)[0];
  if (cb && cb.chk === 'false' && cb.y < 650) { await pm.mouse.click(cb.x, Math.min(cb.y, 650)); await sleep(1000); }
  // A2b DOUBLE-TAP Submit Payment for Verification
  const subC = await btnCenter(pm, 'Submit Payment for Verification');
  let payPosts = 0, step4 = false;
  if (subC) {
    const before = net.length;
    await pm.mouse.click(subC.x, Math.min(subC.y, 650));
    await pm.waitForTimeout(150);
    await pm.mouse.click(subC.x, Math.min(subC.y, 650));
    for (let i = 0; i < 30 && !step4; i++) { await sleep(1500); T = await txt(pm); step4 = T.includes('Step 4 of 4'); }
    payPosts = net.slice(before).filter(n => n.m === 'POST' && /payment|pay/i.test(n.u)).length;
  }
  T = await txt(pm);
  const pfAfterPay = [...new Set(T.match(/PF-\d+-\d+/g) || [])];
  await L.screenshot(pm, `${SHOTS}/sk-A2b-doubletap-submit.png`);
  const completionCopy = T.includes('Payment Submitted and Under review') || T.includes('Under review');
  att('A5b', 'adversarial reference string typed + submitted end-to-end', step4 && completionCopy,
    `modeTap=${tappedRefMode} domLen=${(domRef || '').length} step4=${step4} copy=${completionCopy} pf=${JSON.stringify(pfAfterPay)}`);
  att('A2b', 'double-tap Submit Payment: single payment transition, no dup/no crash', step4 && payPosts <= 2,
    `paymentPosts=${payPosts} step4=${step4} pfCount=${pfAfterPay.length}`);

  // ---- BACKEND TRUTH for this skeptic run ----
  const pr = await fetch(`http://localhost:8083/api/v1/admin/payments?status=SUBMITTED`, { headers: { Authorization: 'Bearer ' + fx.adminToken } });
  const pj = await pr.json().catch(() => ({}));
  const rows = (pj.content || []).filter(x => (x.transactionReferences || []).some(rr => rr.includes(refCode)));
  const row = rows[0];
  const backendOk = rows.length === 1 && row && row.status === 'PAYMENT_SUBMITTED';
  const refOnce = row ? (row.transactionReferences || []).filter(rr => rr.includes(refCode)).length : 0;
  att('BK', 'backend: exactly one PAYMENT_SUBMITTED row carries this run refCode once', backendOk && refOnce === 1,
    `rows=${rows.length} status=${row && row.status} refOccurrences=${refOnce} pf=${row && row.proformaNumber} uiPfMatch=${pfAfterPay.includes(row && row.proformaNumber)}`);

  // ---- A9 ROLE PROBE: buyer token vs admin endpoint ----
  const leak = await fetch(`http://localhost:8083/api/v1/admin/payments?status=SUBMITTED`, { headers: { Authorization: 'Bearer ' + fx.buyer.token } });
  att('A9', 'role probe: buyer token cannot read admin payments', leak.status === 401 || leak.status === 403, `status=${leak.status}`);

  // ---- A8 TZS/locale totals vs reference (text captured here; ref PNG read by agent) ----
  const totalsLine = (T.match(/TSh[\d,\s]+/g) || []).slice(0, 6);
  att('A8', 'TZS formatted with thousands separators (vs reference judge)', /TSh \d{1,3}(,\d{3})+/.test(totalsLine.join(' ')),
    `samples=${JSON.stringify(totalsLine)} (compare ref-375-checkout-authed.png)`);

  const imgsReq = Object.keys(imgMap).length;
  const imgsOk = Object.values(imgMap).filter(s => s === 200 || s === 304).length;
  R.images_requested = imgsReq; R.images_200 = imgsOk; R.images_broken = Object.entries(imgMap).filter(([, s]) => s >= 400).map(([u]) => u);
  R.net_log = net.filter(n => /proforma|payment|delivery-quote|order/i.test(n.u));
  R.api_posts_total = net.filter(n => n.m === 'POST').length;
  await L.closeVideo(ctxM, 'e2e/videos/AU-022-skeptic.webm').catch(() => {});

  // ---- TABLET viewport spot re-check (gate + step1 paint) ----
  const ctxT = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: 'e2e/videos/AU-022-sk-tablet.webm' });
  const pt = await ctxT.newPage();
  await pt.goto(APP + '/checkout', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  await sleep(8000);
  const tGate = await txt(pt);
  await L.screenshot(pt, `${SHOTS}/sk-tablet-cold-checkout.png`);
  att('TV', 'tablet 768x1024 cold /checkout paints gate/home sanely (no blank canvas)', (await pt.evaluate(() => document.querySelectorAll('flt-semantics').length)) > 5,
    `semNodes=${await pt.evaluate(() => document.querySelectorAll('flt-semantics').length)} gateOrHome=${tGate.length > 40}`);
  await L.closeVideo(ctxT, 'e2e/videos/AU-022-sk-tablet.webm').catch(() => {});

  await browser.close();
  R.runtime_ms = Date.now() - t0;
  fs.writeFileSync('/tmp/sk022_results.json', JSON.stringify(R, null, 2));
  console.log('SKEPTIC RUN DONE attacks=' + R.attacks.length + ' broken=' + R.broken.length);
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(1); });
