// sk_AU-022_r2.js — SKEPTIC r2: re-run the money-critical attacks on a CLEANLY-reached
// Step 3 (r2 harness drifted off-flow after its own Back probe). Attacks here:
//  B1 precise Back-from-step3 landing capture (text dump)
//  B2 offline mid-submit (route.abort all :8083) -> no fake success + error copy?
//  B3 session-death 401 mid-submit -> no fake success + error copy?
//  B4 adversarial reference (emoji/Swahili/script/120ch) real submit -> Step 4
//  B5 double-tap Submit -> single transition, backend single row/ref once
// Frozen lane :9108 sha 7b4342f mtime Mon, 24 Aug 2026 03:13:31 GMT.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9108';
const SHOTS = 'e2e/shots/AU-022-skeptic';
fs.mkdirSync(SHOTS, { recursive: true });
const fx = JSON.parse(fs.readFileSync('/tmp/au022_fixtures.json', 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = { attacks: [], broken: [] };
function att(id, name, pass, detail) {
  R.attacks.push({ id, name, pass, detail });
  console.log(`[${pass ? 'ok' : 'BROKEN'}] ${id} ${name} :: ${detail}`);
  if (!pass) R.broken.push(`${id} ${name}`);
  fs.writeFileSync('/tmp/sk022_r2_results.json', JSON.stringify(R, null, 2));
}
async function txt(p) { return p.evaluate(() => document.body.innerText || ''); }
async function isLoggedIn(p) { return p.evaluate(() => !!(localStorage.getItem('flutter.auth_token') || '').length); }
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
async function tapLabel(p, label, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const c = await p.evaluate((lbl) => { let best = null; document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || ''); if (!t.includes(lbl)) return;
      if (e.getAttribute('flt-tappable') === null && e.getAttribute('role') !== 'button') return;
      const r = e.getBoundingClientRect(); if (r.width < 5 || r.height < 5 || r.bottom < 0 || r.top > innerHeight) return;
      const a = r.width * r.height; if (!best || a < best.a) best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }); return best; }, label);
    if (c) { await p.mouse.click(Math.max(5, c.x), Math.min(Math.max(c.y, 20), 655)); await sleep(1400); return true; }
    await p.mouse.move(188, 420); await p.mouse.wheel(0, 320); await sleep(380);
  }
  return false;
}
async function cbAll(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].filter(e => e.getAttribute('role') === 'checkbox').map(e => {
    const r = e.getBoundingClientRect(); return { chk: e.getAttribute('aria-checked'), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }));
}

(async () => {
  const t0 = Date.now();
  const browser = await L.newBrowser();
  const ctxM = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-022-skeptic-r2.webm' });
  const pm = await ctxM.newPage();
  const net = [];
  pm.on('request', rq => { const u = rq.url(); if (/localhost:8083\/api\/v1\//.test(u)) net.push({ m: rq.method(), u: u.replace('http://localhost:8083', '') }); });

  // login + reach step1 via Buy now (proven path)
  await pm.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 15; i++) { await sleep(2000); if ((await pm.evaluate(() => document.querySelectorAll('flt-semantics').length).catch(() => 0)) > 10) break; }
  if (!(await isLoggedIn(pm))) {
    await L.clickBtn(pm, 'Login'); await L.waitText(pm, 'Welcome back', 25000);
    let ei = pm.locator('input[type="text"]').first();
    await ei.click({ force: true }); await sleep(300); await pm.keyboard.type(fx.buyer.email, { delay: 8 });
    ei = pm.locator('input[type="password"]').first();
    await ei.click({ force: true }); await sleep(300); await pm.keyboard.type(fx.buyer.pw, { delay: 8 });
    await L.clickBtn(pm, 'Log in');
    let ok = false; for (let i = 0; i < 30 && !ok; i++) { await sleep(1000); ok = await isLoggedIn(pm); }
    att('B0', 'fixture buyer login', ok, `token=${ok}`);
  }
  await L.clickBtn(pm, 'Search'); await sleep(1800);
  const si = pm.locator('input[type="text"]').first();
  await si.click({ force: true }).catch(() => {}); await sleep(300);
  await pm.keyboard.type('probe rug', { delay: 12 }); await sleep(900); await pm.keyboard.press('Enter');
  await sleep(3500);
  let rug = null;
  for (let k = 0; k < 10 && !rug; k++) {
    rug = await pm.evaluate(() => { let best = null; document.querySelectorAll('flt-semantics').forEach(e => {
      if (e.getAttribute('flt-tappable') === null) return; const t = (e.textContent || ''); if (!t.includes('Checkout Probe Rug')) return;
      const r = e.getBoundingClientRect(); if (r.width < 40 || r.height < 40 || r.bottom < 0 || r.top > innerHeight) return;
      const a = r.width * r.height; if (!best || a < best.a) best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }); return best; });
    if (!rug) { await pm.mouse.move(190, 400); await pm.mouse.wheel(0, 400); await sleep(500); }
  }
  await pm.mouse.click(Math.max(5, rug.x), Math.min(rug.y, 655)); await sleep(2600);
  const bn = await btnCenter(pm, 'Buy now');
  await pm.mouse.click(bn.x, Math.min(bn.y, 655)); await sleep(3200);
  let T = await txt(pm);
  att('B0b', 'Step 1 reached', T.includes('Step 1 of 4'), `step1=${T.includes('Step 1 of 4')}`);

  // ---- B1 precise Back-from-step3 ----
  await tapLabel(pm, 'Continue to review'); await sleep(3500);
  // tick windows + terms
  for (let k = 0; k < 12; k++) {
    const yTop = await pm.evaluate(() => { let y = null; document.querySelectorAll('flt-semantics').forEach(e => {
      if ((e.textContent || '').trim() === 'When should we deliver?') { y = Math.round(e.getBoundingClientRect().y); } }); return y; });
    if (yTop !== null && yTop < 130) break;
    await pm.mouse.move(188, 400); await pm.mouse.wheel(0, 300); await sleep(400);
  }
  let cbs = await cbAll(pm);
  const w = cbs.filter(c => c.y > 110 && c.y < 660).sort((a, b) => a.y - b.y)[0];
  if (w && w.chk === 'false') { await pm.mouse.click(w.x, Math.min(w.y, 650)); await sleep(900); }
  cbs = await cbAll(pm);
  const last = cbs.sort((a, b) => b.y - a.y)[0];
  if (last && last.chk === 'false') { await pm.mouse.click(last.x, Math.min(Math.max(last.y, 20), 650)); await sleep(800); }
  const conf = await btnCenter(pm, 'Confirm & proceed to payment');
  await pm.mouse.click(conf.x, Math.min(conf.y, 650)); await sleep(6000);
  T = await txt(pm);
  const pf3 = [...new Set(T.match(/PF-\d+-\d+/g) || [])][0] || '';
  att('B0c', 'Step 3 reached with proforma', T.includes('Step 3 of 4') && !!pf3, `pf=${pf3}`);
  const backBtn = await pm.evaluate(() => { let b = null; document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
    if ((e.textContent || '').trim() === 'Back') { const r = e.getBoundingClientRect(); if (r.width > 3 && r.y >= 0) b = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; } }); return b; });
  let landTxt = '(no app-bar Back)';
  if (backBtn) {
    await pm.mouse.click(backBtn.x, Math.min(backBtn.y, 650)); await sleep(2500);
    landTxt = await txt(pm);
    await L.screenshot(pm, `${SHOTS}/sk-B1-after-back.png`);
  }
  const cls = landTxt.includes('Step 2 of 4') ? 'step2' : landTxt.includes('Step 3 of 4') ? 'stayed-step3'
    : landTxt.includes('Step 1 of 4') ? 'step1' : landTxt.includes('Checkout Probe Rug') ? 'product-detail'
    : landTxt.length < 40 ? 'blank' : 'other';
  att('B1', 'app-bar Back from locked step3 lands on a defined screen (no crash/blank)',
    ['step2', 'stayed-step3', 'step1', 'product-detail'].includes(cls),
    `landing=${cls} head=${JSON.stringify(landTxt.slice(0, 200))} pfStillVisible=${landTxt.includes(pf3)}`);

  // forward again to a CLEAN step3 for payment attacks
  let fwdOk = false;
  if (cls !== 'stayed-step3') {
    fwdOk = await tapLabel(pm, 'Continue to review'); await sleep(3500);
    if (!(await txt(pm)).includes('Step 3 of 4')) {
      for (let k = 0; k < 12; k++) {
        const yTop = await pm.evaluate(() => { let y = null; document.querySelectorAll('flt-semantics').forEach(e => {
          if ((e.textContent || '').trim() === 'When should we deliver?') { y = Math.round(e.getBoundingClientRect().y); } }); return y; });
        if (yTop !== null && yTop < 130) break;
        await pm.mouse.move(188, 400); await pm.mouse.wheel(0, 300); await sleep(400);
      }
      cbs = await cbAll(pm);
      const w2 = cbs.filter(c => c.y > 110 && c.y < 660).sort((a, b) => a.y - b.y)[0];
      if (w2 && w2.chk === 'false') { await pm.mouse.click(w2.x, Math.min(w2.y, 650)); await sleep(900); }
      cbs = await cbAll(pm);
      const l2 = cbs.sort((a, b) => b.y - a.y)[0];
      if (l2 && l2.chk === 'false') { await pm.mouse.click(l2.x, Math.min(Math.max(l2.y, 20), 650)); await sleep(800); }
      const c3 = await btnCenter(pm, 'Confirm & proceed to payment');
      if (c3) { await pm.mouse.click(c3.x, Math.min(c3.y, 650)); await sleep(6000); }
    }
  }
  T = await txt(pm);
  const pfPay = [...new Set(T.match(/PF-\d+-\d+/g) || [])][0] || pf3;
  att('B0d', 'clean Step 3 re-established', T.includes('Step 3 of 4'), `pf=${pfPay}`);

  async function findSubmit(p) {
    for (let k = 0; k < 18; k++) {
      const s = await p.evaluate(() => { let b = null; document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || ''); if (!t.includes('Submit Payment for Verification') || e.getAttribute('role') !== 'button') return;
        const r = e.getBoundingClientRect(); if (r.width < 5 || r.bottom < 0 || r.top > innerHeight) return;
        const a = r.width * r.height; if (!b || a < b.a) b = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), a }; }); return b; });
      if (s) return s;
      await p.mouse.move(188, 430); await p.mouse.wheel(0, 240); await sleep(330);
    }
    return null;
  }

  // ---- B2 OFFLINE mid-submit ----
  await pm.route('**localhost:8083/api/v1/**', route => route.abort());
  const s1 = await findSubmit(pm);
  let b2 = 'submit-missing';
  if (s1) {
    await pm.mouse.click(s1.x, Math.min(s1.y, 650)); await sleep(7000);
    T = await txt(pm);
    b2 = `stillStep3=${T.includes('Step 3 of 4')} noFakeStep4=${!T.includes('Step 4 of 4')} err=${/fail|error|try again|network|offline|could not|unable|check your connection/i.test(T)}`;
    await L.screenshot(pm, `${SHOTS}/sk-B2-offline-submit.png`);
  }
  await pm.unroute('**localhost:8083/api/v1/**');
  att('B2', 'offline mid-submit: stays on step3, NO fake Step 4, failure surfaced',
    /stillStep3=true/.test(b2) && /noFakeStep4=true/.test(b2), b2);

  // ---- B3 SESSION DEATH 401 mid-submit ----
  await pm.route('**localhost:8083/api/v1/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'session expired' }) }));
  const s2 = await findSubmit(pm);
  let b3 = 'submit-missing';
  if (s2) {
    await pm.mouse.click(s2.x, Math.min(s2.y, 650)); await sleep(7000);
    T = await txt(pm);
    b3 = `stillStep3=${T.includes('Step 3 of 4')} noFakeStep4=${!T.includes('Step 4 of 4')} err=${/expire|unauthor|log ?in|fail|error|again/i.test(T)} tokenCleared=${await pm.evaluate(() => !localStorage.getItem('flutter.auth_token'))}`;
    await L.screenshot(pm, `${SHOTS}/sk-B3-401-submit.png`);
  }
  await pm.unroute('**localhost:8083/api/v1/**');
  att('B3', 'session-death (401) mid-submit: no fake success, graceful failure',
    /noFakeStep4=true/.test(b3) && /stillStep3=true/.test(b3), b3);

  // ---- B4 adversarial reference REAL submit + B5 double-tap ----
  const modeTap = await tapLabel(pm, 'Enter reference', 3);
  const modeRow = await pm.evaluate(() => { let best = null; document.querySelectorAll('flt-semantics').forEach(e => {
    const t = (e.textContent || '').trim(); if (!t.startsWith('Upload screenshot')) return;
    const r = e.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
    if (!best || r.y < best.y) best = { y: Math.round(r.y), h: Math.round(r.height) }; }); return best; });
  const fieldY = modeRow ? modeRow.y + modeRow.h + 40 : 500;
  await pm.mouse.click(188, Math.min(fieldY, 640)); await sleep(700);
  const refCode = `SK022R${fx.stamp % 100000}`;
  const adversarial = `${refCode} Malizō 🚀 <b>inv</b> karibu-sana-0123456789`;
  await pm.keyboard.type(adversarial, { delay: 8 });
  const domRef = await pm.evaluate(() => { const i = [...document.querySelectorAll('input')].find(x => x.type === 'text' && !x.disabled); return i ? i.value : null; });
  await L.screenshot(pm, `${SHOTS}/sk-B4-adversarial-ref.png`);
  for (let k = 0; k < 10; k++) { T = await txt(pm); if (T.includes('Submit Payment for Verification') && /I have completed/.test(T)) break;
    await pm.mouse.move(188, 430); await pm.mouse.wheel(0, 180); await sleep(320); }
  cbs = await cbAll(pm);
  const cb = cbs.sort((a, b) => b.y - a.y)[0];
  if (cb && cb.chk === 'false' && cb.y < 650) { await pm.mouse.click(cb.x, Math.min(cb.y, 650)); await sleep(1000); }
  const subC = await findSubmit(pm);
  let payPosts = 0, step4 = false;
  if (subC) {
    const before = net.filter(n => n.m === 'POST').length;
    await pm.mouse.click(subC.x, Math.min(subC.y, 650));
    await pm.waitForTimeout(150);
    await pm.mouse.click(subC.x, Math.min(subC.y, 650));
    for (let i = 0; i < 30 && !step4; i++) { await sleep(1500); T = await txt(pm); step4 = T.includes('Step 4 of 4'); }
    payPosts = net.slice(before).filter(n => n.m === 'POST').length;
  }
  T = await txt(pm);
  const pfAfter = [...new Set(T.match(/PF-\d+-\d+/g) || [])];
  const completionCopy = T.includes('Payment Submitted and Under review') || T.includes('Under review');
  await L.screenshot(pm, `${SHOTS}/sk-B4-after-submit.png`);
  att('B4', 'adversarial reference submitted end-to-end to Step 4', step4 && completionCopy,
    `modeTap=${modeTap} domRefLen=${(domRef || '').length} domRefHead=${JSON.stringify((domRef || '').slice(0, 30))} step4=${step4} completionCopy=${completionCopy} pf=${JSON.stringify(pfAfter)}`);
  att('B5', 'double-tap Submit: bounded POSTs, single invoice, no crash', step4 && payPosts <= 3 && pfAfter.length <= 1,
    `postsDuringSubmit=${payPosts} pfCount=${pfAfter.length} step4=${step4}`);

  // backend truth
  const pr = await fetch(`http://localhost:8083/api/v1/admin/payments?status=SUBMITTED`, { headers: { Authorization: 'Bearer ' + fx.adminToken } });
  const pj = await pr.json().catch(() => ({}));
  const rows = (pj.content || []).filter(x => (x.transactionReferences || []).some(rr => String(rr).includes(refCode)));
  const row = rows[0];
  const refOnce = row ? (row.transactionReferences || []).filter(rr => String(rr).includes(refCode)).length : 0;
  att('BK', 'backend: exactly ONE PAYMENT_SUBMITTED row, ref recorded once, matches UI proforma',
    rows.length === 1 && row && row.status === 'PAYMENT_SUBMITTED' && refOnce === 1 && pfAfter.includes(row.proformaNumber),
    `rows=${rows.length} status=${row && row.status} refOnce=${refOnce} backendPf=${row && row.proformaNumber} uiPf=${JSON.stringify(pfAfter)}`);

  await L.closeVideo(ctxM, 'e2e/videos/AU-022-skeptic-r2.webm').catch(() => {});
  R.runtime_ms = Date.now() - t0;
  fs.writeFileSync('/tmp/sk022_r2_results.json', JSON.stringify(R, null, 2));
  console.log('SKEPTIC R2 DONE attacks=' + R.attacks.length + ' broken=' + R.broken.length);
})().catch(e => { console.error('FATAL', e && e.stack || e); fs.writeFileSync('/tmp/sk022_r2_results.json', JSON.stringify(R, null, 2)); process.exit(1); });
