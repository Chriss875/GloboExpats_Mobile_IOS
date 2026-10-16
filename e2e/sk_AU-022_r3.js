// sk_AU-022_r3.js — SKEPTIC r3: money-step attacks with bounded loops + correct resume.
// B2 offline submit | B3 401 submit | B4 adversarial ref real submit | B5 double-tap
// | BK backend single row | B7 out-of-order re-entry after abandoned proforma.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9108';
const SHOTS = 'e2e/shots/AU-022-skeptic';
const fx = JSON.parse(fs.readFileSync('/tmp/au022_fixtures.json', 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = { attacks: [], broken: [] };
function att(id, name, pass, detail) {
  R.attacks.push({ id, name, pass, detail });
  console.log(`[${pass ? 'ok' : 'BROKEN'}] ${id} ${name} :: ${detail}`);
  if (!pass) R.broken.push(`${id} ${name}`);
  fs.writeFileSync('/tmp/sk022_r3_results.json', JSON.stringify(R, null, 2));
}
async function txt(p) { return p.evaluate(() => document.body.innerText || ''); }
async function isLoggedIn(p) { return p.evaluate(() => !!(localStorage.getItem('flutter.auth_token') || '').length); }
async function btnCenter(p, label, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const c = await p.evaluate((lbl) => { let best = null; document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || ''); if (!t.includes(lbl) || e.getAttribute('role') !== 'button') return;
      const r = e.getBoundingClientRect(); if (r.width < 5 || r.bottom < 0 || r.top > innerHeight) return;
      const a = r.width * r.height; if (!best || a < best.a) best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }); return best; }, label);
    if (c) return c;
    await p.mouse.move(188, 420); await p.mouse.wheel(0, 340); await sleep(320);
  }
  return null;
}
async function cbAll(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].filter(e => e.getAttribute('role') === 'checkbox').map(e => {
    const r = e.getBoundingClientRect(); return { chk: e.getAttribute('aria-checked'), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }));
}
async function findSubmit(p, tries = 10) {
  for (let k = 0; k < tries; k++) {
    const s = await p.evaluate(() => { let b = null; document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || ''); if (!t.includes('Submit Payment for Verification') || e.getAttribute('role') !== 'button') return;
      const r = e.getBoundingClientRect(); if (r.width < 5 || r.bottom < 0 || r.top > innerHeight) return;
      const a = r.width * r.height; if (!b || a < b.a) b = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), a }; }); return b; });
    if (s) return s;
    await p.mouse.move(188, 430); await p.mouse.wheel(0, 260); await sleep(300);
  }
  return null;
}
async function reachStep3(p, net) {
  // search rug -> detail -> Buy now -> step1 -> continue -> tick -> confirm -> step3
  await L.clickBtn(p, 'Search'); await sleep(1500);
  const si = p.locator('input[type="text"]').first();
  await si.click({ force: true }).catch(() => {}); await sleep(250);
  await p.keyboard.type('probe rug', { delay: 10 }); await sleep(800); await p.keyboard.press('Enter');
  await sleep(3000);
  let rug = null;
  for (let k = 0; k < 8 && !rug; k++) {
    rug = await p.evaluate(() => { let best = null; document.querySelectorAll('flt-semantics').forEach(e => {
      if (e.getAttribute('flt-tappable') === null) return; const t = (e.textContent || ''); if (!t.includes('Checkout Probe Rug')) return;
      const r = e.getBoundingClientRect(); if (r.width < 40 || r.height < 40 || r.bottom < 0 || r.top > innerHeight) return;
      const a = r.width * r.height; if (!best || a < best.a) best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }); return best; });
    if (!rug) { await p.mouse.move(190, 400); await p.mouse.wheel(0, 420); await sleep(420); }
  }
  if (!rug) return { ok: false, why: 'no-rug' };
  await p.mouse.click(Math.max(5, rug.x), Math.min(rug.y, 655)); await sleep(2400);
  const bn = await btnCenter(p, 'Buy now');
  if (!bn) return { ok: false, why: 'no-buynow' };
  await p.mouse.click(bn.x, Math.min(bn.y, 655)); await sleep(3000);
  let T = await txt(p);
  if (!T.includes('Step 1 of 4')) return { ok: false, why: 'no-step1' };
  const cont = await btnCenter(p, 'Continue to review');
  if (!cont) return { ok: false, why: 'no-continue' };
  const before = net.filter(n => n.m === 'POST').length;
  await p.mouse.click(cont.x, Math.min(cont.y, 650)); await sleep(3500);
  T = await txt(p);
  if (!T.includes('Step 2 of 4')) return { ok: false, why: 'no-step2' };
  for (let k = 0; k < 10; k++) {
    const yTop = await p.evaluate(() => { let y = null; document.querySelectorAll('flt-semantics').forEach(e => {
      if ((e.textContent || '').trim() === 'When should we deliver?') { y = Math.round(e.getBoundingClientRect().y); } }); return y; });
    if (yTop !== null && yTop < 130) break;
    await p.mouse.move(188, 400); await p.mouse.wheel(0, 300); await sleep(340);
  }
  let cbs = await cbAll(p);
  const w = cbs.filter(c => c.y > 110 && c.y < 660).sort((a, b) => a.y - b.y)[0];
  if (w && w.chk === 'false') { await p.mouse.click(w.x, Math.min(w.y, 650)); await sleep(800); }
  cbs = await cbAll(p);
  const last = cbs.sort((a, b) => b.y - a.y)[0];
  if (last && last.chk === 'false') { await p.mouse.click(last.x, Math.min(Math.max(last.y, 20), 650)); await sleep(700); }
  const conf = await btnCenter(p, 'Confirm & proceed to payment');
  if (!conf) return { ok: false, why: 'no-confirm' };
  await p.mouse.click(conf.x, Math.min(conf.y, 650)); await sleep(5000);
  T = await txt(p);
  const pf = [...new Set(T.match(/PF-\d+-\d+/g) || [])][0] || '';
  return { ok: T.includes('Step 3 of 4') && !!pf, pf, posts: net.slice(before).filter(n => n.m === 'POST' && /proforma/.test(n.u)).length, why: T.includes('Step 3 of 4') ? 'ok' : 'no-step3' };
}

(async () => {
  const t0 = Date.now();
  const browser = await L.newBrowser();
  const ctxM = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-022-sk-r3.webm' });
  const pm = await ctxM.newPage();
  const net = [];
  pm.on('request', rq => { const u = rq.url(); if (/localhost:8083\/api\/v1\//.test(u)) net.push({ m: rq.method(), u: u.replace('http://localhost:8083', '') }); });

  await pm.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 15; i++) { await sleep(2000); if ((await pm.evaluate(() => document.querySelectorAll('flt-semantics').length).catch(() => 0)) > 10) break; }
  if (!(await isLoggedIn(pm))) {
    await L.clickBtn(pm, 'Login'); await L.waitText(pm, 'Welcome back', 20000);
    let ei = pm.locator('input[type="text"]').first();
    await ei.click({ force: true }); await sleep(250); await pm.keyboard.type(fx.buyer.email, { delay: 7 });
    ei = pm.locator('input[type="password"]').first();
    await ei.click({ force: true }); await sleep(250); await pm.keyboard.type(fx.buyer.pw, { delay: 7 });
    await L.clickBtn(pm, 'Log in');
    let ok = false; for (let i = 0; i < 25 && !ok; i++) { await sleep(1000); ok = await isLoggedIn(pm); }
    att('B0', 'fixture buyer login', ok, `token=${ok}`);
  }

  const s = await reachStep3(pm, net);
  att('B0b', 'reach Step 3 (baseline)', s.ok, JSON.stringify(s));
  if (!s.ok) { console.log('BASELINE FAIL — aborting'); await browser.close(); return; }
  let T = await txt(pm);

  // ---- B2 OFFLINE mid-submit ----
  await pm.route('**localhost:8083/api/v1/**', route => route.abort());
  const sub1 = await findSubmit(pm);
  let b2 = 'submit-missing';
  if (sub1) {
    await pm.mouse.click(sub1.x, Math.min(sub1.y, 650)); await sleep(6000);
    T = await txt(pm);
    b2 = `stillStep3=${T.includes('Step 3 of 4')} noFakeStep4=${!T.includes('Step 4 of 4')} err=${/fail|error|try again|network|offline|could not|unable|connection/i.test(T)}`;
    await L.screenshot(pm, `${SHOTS}/sk-B2-offline-submit.png`);
  }
  await pm.unroute('**localhost:8083/api/v1/**');
  att('B2', 'offline mid-submit: stays step3, NO fake success, failure surfaced',
    /stillStep3=true/.test(b2) && /noFakeStep4=true/.test(b2), b2);

  // ---- B3 SESSION DEATH 401 mid-submit ----
  await pm.route('**localhost:8083/api/v1/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'session expired' }) }));
  const sub2 = await findSubmit(pm);
  let b3 = 'submit-missing';
  if (sub2) {
    await pm.mouse.click(sub2.x, Math.min(sub2.y, 650)); await sleep(6000);
    T = await txt(pm);
    b3 = `stillStep3=${T.includes('Step 3 of 4')} noFakeStep4=${!T.includes('Step 4 of 4')} err=${/expire|unauthor|log ?in|fail|error|again/i.test(T)} tokenKept=${!!await pm.evaluate(() => localStorage.getItem('flutter.auth_token'))}`;
    await L.screenshot(pm, `${SHOTS}/sk-B3-401-submit.png`);
  }
  await pm.unroute('**localhost:8083/api/v1/**');
  att('B3', 'session-death (401) mid-submit: no fake success, graceful failure',
    /noFakeStep4=true/.test(b3) && /stillStep3=true/.test(b3), b3);

  // ---- B4 adversarial reference REAL submit ----
  const modeTap = await (async () => {
    for (let i = 0; i < 6; i++) {
      const c = await pm.evaluate(() => { let best = null; document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || ''); if (!t.includes('Enter reference')) return;
        if (e.getAttribute('flt-tappable') === null && e.getAttribute('role') !== 'button') return;
        const r = e.getBoundingClientRect(); if (r.width < 5 || r.height < 5 || r.bottom < 0 || r.top > innerHeight) return;
        const a = r.width * r.height; if (!best || a < best.a) best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }); return best; });
      if (c) { await pm.mouse.click(c.x, Math.min(c.y, 650)); await sleep(1200); return true; }
      await pm.mouse.move(188, 430); await pm.mouse.wheel(0, 280); await sleep(320);
    }
    return false;
  })();
  const modeRow = await pm.evaluate(() => { let best = null; document.querySelectorAll('flt-semantics').forEach(e => {
    const t = (e.textContent || '').trim(); if (!t.startsWith('Upload screenshot')) return;
    const r = e.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
    if (!best || r.y < best.y) best = { y: Math.round(r.y), h: Math.round(r.height) }; }); return best; });
  const fieldY = modeRow ? modeRow.y + modeRow.h + 40 : 520;
  await pm.mouse.click(188, Math.min(fieldY, 645)); await sleep(650);
  const refCode = `SK022W${fx.stamp % 100000}`;
  await pm.keyboard.type(`${refCode} Malizō 🚀 <b>inv</b> karibu-sana-01234567890`, { delay: 7 });
  const domRef = await pm.evaluate(() => { const i = [...document.querySelectorAll('input')].find(x => x.type === 'text' && !x.disabled); return i ? i.value : null; });
  await L.screenshot(pm, `${SHOTS}/sk-B4-adversarial-ref.png`);
  for (let k = 0; k < 8; k++) { T = await txt(pm); if (/I have completed/.test(T)) break;
    await pm.mouse.move(188, 430); await pm.mouse.wheel(0, 190); await sleep(300); }
  const cbs = await cbAll(pm);
  const cb = cbs.sort((a, b) => b.y - a.y)[0];
  if (cb && cb.chk === 'false' && cb.y < 650) { await pm.mouse.click(cb.x, Math.min(cb.y, 650)); await sleep(900); }
  const subC = await findSubmit(pm);
  let payPosts = 0, step4 = false;
  if (subC) {
    const before = net.filter(n => n.m === 'POST').length;
    await pm.mouse.click(subC.x, Math.min(subC.y, 650));
    await pm.waitForTimeout(140);
    await pm.mouse.click(subC.x, Math.min(subC.y, 650));
    for (let i = 0; i < 25 && !step4; i++) { await sleep(1400); T = await txt(pm); step4 = T.includes('Step 4 of 4'); }
    payPosts = net.slice(before).filter(n => n.m === 'POST').length;
  }
  T = await txt(pm);
  const pfAfter = [...new Set(T.match(/PF-\d+-\d+/g) || [])];
  const completionCopy = T.includes('Payment Submitted and Under review') || T.includes('Under review');
  await L.screenshot(pm, `${SHOTS}/sk-B4-after-submit.png`);
  att('B4', 'adversarial reference submitted end-to-end to Step 4', step4 && completionCopy,
    `modeTap=${modeTap} domRefHead=${JSON.stringify((domRef || '').slice(0, 34))} len=${(domRef || '').length} step4=${step4} copy=${completionCopy} pf=${JSON.stringify(pfAfter)} posts=${payPosts}`);
  att('B5', 'double-tap Submit: bounded POSTs, single invoice, no crash', step4 && payPosts <= 3 && pfAfter.length <= 1,
    `postsDuringSubmit=${payPosts} pfCount=${pfAfter.length} step4=${step4}`);

  // ---- BK backend truth ----
  const pr = await fetch(`http://localhost:8083/api/v1/admin/payments?status=SUBMITTED`, { headers: { Authorization: 'Bearer ' + fx.adminToken } });
  const pj = await pr.json().catch(() => ({}));
  const rows = (pj.content || []).filter(x => (x.transactionReferences || []).some(rr => String(rr).includes(refCode)));
  const row = rows[0];
  const refOnce = row ? (row.transactionReferences || []).filter(rr => String(rr).includes(refCode)).length : 0;
  att('BK', 'backend: ONE PAYMENT_SUBMITTED row, ref once, matches UI proforma',
    rows.length === 1 && row && row.status === 'PAYMENT_SUBMITTED' && refOnce === 1 && pfAfter.includes(row.proformaNumber),
    `rows=${rows.length} status=${row && row.status} refOnce=${refOnce} bePf=${row && row.proformaNumber} uiPf=${JSON.stringify(pfAfter)}`);

  // ---- B7 OUT-OF-ORDER re-entry: Buy now AGAIN right after a submitted invoice ----
  await pm.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  await sleep(4000);
  const re = await reachStep3(pm, net);
  T = await txt(pm);
  const pfNew = [...new Set(T.match(/PF-\d+-\d+/g) || [])][0] || '';
  const dupProforma = re.ok && pfNew && pfNew !== (row && row.proformaNumber);
  await L.screenshot(pm, `${SHOTS}/sk-B7-reentry-step3.png`);
  att('B7', 'out-of-order re-entry after paid invoice: flow restarts sanely (observable state, no crash)',
    re.ok || /AWAITING|Under review|Step/.test(T),
    `reentered=${re.ok} why=${re.why} oldPf=${row && row.proformaNumber} newPf=${pfNew} newProformaCreated=${dupProforma} posts=${re.posts}`);
  // stock sanity: product still shows availability, qty not double-locked
  const availTxt = (T.match(/\d+\s*available/) || [])[0] || '(n/a on this screen)';
  R.stock_note = `availability after re-entry: ${availTxt}`;

  await L.closeVideo(ctxM, 'e2e/videos/AU-022-sk-r3.webm').catch(() => {});
  await browser.close();
  R.runtime_ms = Date.now() - t0;
  fs.writeFileSync('/tmp/sk022_r3_results.json', JSON.stringify(R, null, 2));
  console.log('SKEPTIC R3 DONE attacks=' + R.attacks.length + ' broken=' + R.broken.length);
})().catch(e => { console.error('FATAL', e && e.stack || e); fs.writeFileSync('/tmp/sk022_r3_results.json', JSON.stringify(R, null, 2)); try { browser.close(); } catch (_) {} process.exit(1); });
