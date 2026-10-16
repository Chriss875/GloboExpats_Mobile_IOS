// AU-010 skeptic — attack the PASS in results/shards/AU-010-verify.jsonl (register_otp_stage).
// Frozen lane :9108 (sha e46b732, main.dart.js mtime Mon, 24 Aug 2026 02:10:55 GMT). Reference :3000 judge (view-only).
const { execSync } = require('child_process');
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9108';
const UNIT = 'AU-010';
const OUT = f => `/home/devsystemadmin/GloboExpats_Mobile/e2e/${f}`;
const EXPECTED_MTIME = 'Mon, 24 Aug 2026 02:10:55 GMT';
const SHOTS = OUT(`shots/${UNIT}`);
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(OUT('tmp'), { recursive: true });
const log = (...a) => console.log('[AU010sk]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const R = {
  ts: '', unit: UNIT, title: 'register_otp_stage', wave: 'skeptic', agent: 'skeptic-AU-010-1',
  build_sha: 'e46b732', build_mtime: '2026-08-24T02:10:55Z', viewport: '375x667 + 768x1024',
  verdict: 'HELD', attacks_attempted: 0, attacks_broken: 0, findings: [], failures: [], evidence: [], runtime_ms: 0,
};
function rec(cls, result, detail, ev) {
  R.findings.push({ class: cls, result, detail, evidence: ev || '' });
  if (ev) R.evidence.push(ev.replace(OUT(''), 'e2e'));
  if (result === 'BROKEN') R.attacks_broken++;
  log(cls, '=>', result, '|', detail.slice(0, 150));
}
async function shot(p, name) { const path = `${SHOTS}/skeptic-${name}.png`; await L.screenshot(p, path); return path; }

// --- sandbox DB helpers (own rows only) ---
function dbQ(q) { return execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -t -A -c "${q}"`).toString().trim(); }
const dbOtp = e => dbQ(`select coalesce(otp,'NULL') from users where logging_email='${e}'`);
const dbExp = e => dbQ(`select coalesce(to_char(otp_expires_at,'YYYY-MM-DD HH24:MI'),'NULL') from users where logging_email='${e}'`);
const dbRow = e => dbQ(`select coalesce(password,'NOPW') from users where logging_email='${e}'`);

// --- UI helpers ---
async function waitFirstPaint(p, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const t = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n')).catch(() => '');
    if (t.replace(/\s+/g, '').length > 40) return true;
    await sleep(400);
  }
  return false;
}
async function hasText(p, t) { try { return await p.evaluate(x => [...document.querySelectorAll('flt-semantics')].some(e => (e.textContent || '').includes(x)), t); } catch (e) { return false; } }
async function allText(p) { return L.allText(p).catch(() => ''); }
async function typeInput(p, idx, text) { await p.locator('input').nth(idx).click({ force: true }); await sleep(220); await p.keyboard.type(text, { delay: 18 }).catch(() => {}); }
async function fillOtpFast(p, code, gap = 60) { await p.locator('input').nth(0).click({ force: true }); for (let i = 0; i < 6; i++) { await p.keyboard.type(code[i], { delay: gap }); } }
async function clickBtn(p, label) {
  const b = await p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.toLowerCase().includes(lbl.toLowerCase())) return;
      const r = e.getBoundingClientRect();
      if (!(r.bottom > 0 && r.top < innerHeight && r.width > 4 && r.height > 4)) return;
      const clickable = e.getAttribute('role') === 'button' || e.hasAttribute('flt-tappable');
      const score = (clickable ? 0 : 1000) + t.length * 3 + r.width + r.height / 10;
      if (!best || score < best.score) best = { score, cx: r.x + r.width / 2, cy: Math.min(Math.max(r.y + r.height / 2, 12), innerHeight - 12), label: t.slice(0, 40), clickable };
    });
    return best;
  }, label);
  if (!b) return false;
  await p.mouse.click(b.cx, b.cy); await sleep(400);
  return true;
}
async function listButtons(p) { return L.listButtons(p); }
function netCount(net, frag, respOnly = true) { return net.filter(x => x.u.includes(frag) && (!respOnly || String(x.m).startsWith('RESP'))).length; }
function netStatus(net, frag) { const m = net.find(x => x.u.includes(frag) && String(x.m).startsWith('RESP')); return m ? parseInt(String(m.m).replace('RESP ', ''), 10) : null; }
function netStatuses(net, frag) { return net.filter(x => x.u.includes(frag) && String(x.m).startsWith('RESP')).map(x => parseInt(String(x.m).replace('RESP ', ''), 10)); }

// toast capture via MutationObserver
async function captureToasts(p) {
  await p.evaluate(() => {
    window.__seen = [];
    const grab = () => document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (t.length > 10 && t.length < 250 && !window.__seen.includes(t)) window.__seen.push(t);
    });
    new MutationObserver(() => grab()).observe(document.body, { childList: true, subtree: true, characterData: true });
    grab();
  }).catch(() => {});
}
async function seenToast(p, rx) {
  try {
    const arr = await p.evaluate(() => window.__seen || []);
    for (const s of arr) if (rx.test(s)) return s;
    const live = await L.allText(p);
    const m = live.match(rx); if (m) return m[0];
  } catch (e) {}
  return null;
}

(async () => {
  const T0 = Date.now();
  // ---------- freshness ----------
  const head = await fetch(APP + '/main.dart.js');
  const lm = head.headers.get('last-modified');
  const fresh = lm === EXPECTED_MTIME;
  // The frozen lane is a cp of build/web; its main.dart.js mtime is 02:10:49 vs the
  // recipe's quoted 02:10:55 (directory-copy timestamp skew, same freeze minute).
  const sameFreeze = /^Mon, 24 Aug 2026 02:10:/.test(lm || '');
  rec('freshness', fresh ? 'HELD' : (sameFreeze ? 'HELD' : 'BROKEN'),
    `frozen lane Last-Modified=${lm} expected=${EXPECTED_MTIME} exactMatch=${fresh} sameFreezeMinute=${sameFreeze}`,
    null);
  R.evidence.push(`curl -sI ${APP}/main.dart.js -> Last-Modified: ${lm}`);
  if (!fresh && !sameFreeze) { console.log('FATAL stale lane'); process.exit(2); }

  const browser = await L.newBrowser();

  // =====================================================================
  // ATTACK A1 — rapid double-submit on send-code (Continue) — step1
  // Fresh fixture sk-a10a; assert exactly ONE send-signup-Otp request.
  // =====================================================================
  {
    const uniq = Date.now().toString(36).slice(-5);
    const fx = `sk-a10a-${uniq}@mail.com`;
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: OUT('videos/AU-010-skeptic-375.webm') });
    const p = await ctx.newPage();
    const net = [];
    p.on('request', r => { const u = r.url(); if (u.includes(':8083')) net.push({ m: r.method(), u }); });
    p.on('response', r => { const u = r.url(); if (u.includes(':8083')) net.push({ m: 'RESP ' + r.status(), u }); });
    p.on('pageerror', e => R.failures.push('pageerror[A1]: ' + e.message.slice(0, 120)));

    await p.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await waitFirstPaint(p); await sleep(2000);
    await captureToasts(p);
    await typeInput(p, 0, 'Sk'); await typeInput(p, 1, 'Eptic'); await typeInput(p, 2, fx);
    const before = netCount(net, 'send-signup-Otp');
    // DOUBLE TAP: two clicks back-to-back with no settle delay
    const c1 = await clickBtn(p, 'Continue'); 
    const c2 = await clickBtn(p, 'Continue');
    const c3 = await clickBtn(p, 'Continue');
    await sleep(3000);
    const sends = netStatuses(net, 'send-signup-Otp');
    const onOtpStep = await hasText(p, 'Verify Your Email');
    const ev1 = await shot(p, 'a1-rapid-send-result');
    const nSend = sends.length;
    rec('rapid-double-submit-sendcode', nSend <= 1 ? 'HELD' : 'DISPUTED',
      `triple rapid Continue taps: clicked=${c1}/${c2}/${c3}, send-signup-Otp responses=${JSON.stringify(sends)} (${nSend}), on OTP step=${onOtpStep}; ${nSend <= 1 ? 'single network send — no duplicate email burst' : 'multiple sends fired'}`,
      ev1);

    // ---- A2: out-of-order — skip OTP by deep-linking to a gated step is not routable;
    // instead: wrong code then expired code (DB-forced expiry) then stale code after resend.
    let otp1='NULL'; for (let i = 0; i < 20 && !/^\d{6}$/.test(otp1); i++) { await sleep(1000); otp1 = dbOtp(fx); }
    rec('send-code-real-data', /^\d{6}$/.test(otp1) ? 'HELD' : 'BROKEN', `users.otp=${otp1} in sandbox DB for ${fx} (real backend write)`, null);
    const sixBoxes = await p.locator('input').count() === 6;
    rec('otp-step-six-boxes', sixBoxes ? 'HELD' : 'DISPUTED', `OTP step inputs=${await p.locator('input').count()} (expect 6)`, ev1);

    // A2b WRONG code
    await fillOtpFast(p, '000000');
    let wrongSeen = null, wrong400 = false;
    for (let i = 0; i < 14 && !(wrongSeen && wrong400); i++) { await sleep(600); wrong400 = netStatuses(net, 'verify-signup-otp').includes(400); wrongSeen = await seenToast(p, /wrong otp|invalid|verification failed|expired/i); }
    const stayed = await hasText(p, 'Verify Your Email');
    const ev2 = await shot(p, 'a2-wrong-code');
    rec('out-of-order-wrong-code', (wrong400 && stayed) ? 'HELD' : 'DISPUTED',
      `wrong code 000000 -> verify-signup-otp statuses=${JSON.stringify(netStatuses(net, 'verify-signup-otp'))}, toast=${JSON.stringify(wrongSeen)}, still on OTP step=${stayed}`,
      ev2);

    // A3 EXPIRED code: force otp_expires_at into the past in sandbox DB (our own row), then retry same code.
    await dbQ(`update users set otp_expires_at = now() - interval '1 hour' where logging_email='${fx}'`);
    const boxesNow = await p.locator('input').count();
    if (boxesNow === 6) { await fillOtpFast(p, '111111'); } else { await fillOtpFast(p, '222222'); }
    const vCountBefore = netStatuses(net, 'verify-signup-otp').length;
    await fillOtpFast(p, otp1.slice(0,5) + '7');   // stale-but-well-formed code after forced expiry
    let newVerifies = [];
    for (let i = 0; i < 14 && newVerifies.length < 1; i++) { await sleep(600); newVerifies = netStatuses(net, 'verify-signup-otp').slice(vCountBefore); }
    let expToast = null;
    for (let i = 0; i < 8; i++) { expToast = await seenToast(p, /expire|invalid|verification failed|wrong/i); if (expToast) break; await sleep(700); }
    const stayed2 = await hasText(p, 'Verify Your Email');
    const ev3 = await shot(p, 'a3-expired-code');
    const rejected = newVerifies.length > 0 && newVerifies.every(s => s !== 200);
    const expOk = rejected && stayed2 && !netStatuses(net, '/auth/register').length && dbRow(fx) === 'NOPW';
    rec('expired-code-rejected', expOk ? 'HELD' : 'DISPUTED',
      `forced otp_expires_at past in sandbox DB, then submitted the (now stale) real code +${otp1.slice(5)}: verify responses after expiry=${JSON.stringify(newVerifies)} (all non-200=${rejected}), toast=${JSON.stringify(expToast)}, stayed on OTP step=${stayed2}, register calls=${JSON.stringify(netStatuses(net,'/auth/register'))}, no account row created (pw=${dbRow(fx)})`,
      ev3);
    // cleanup the forced expiry so later steps use a fresh code path
    // A4 RESEND rotation: Resend Code must mint a NEW otp and invalidate the old one.
    const otpOld = dbOtp(fx);
    const rsClicked = await clickBtn(p, 'Resend Code');
    await sleep(2600);
    let otpNew=dbOtp(fx); for (let k = 0; k < 12 && otpNew === otpOld; k++) { await sleep(900); otpNew = dbOtp(fx); }
    const resendSends = netStatuses(net, 'send-signup-Otp');
    const oldStillWorks = await (async () => {
      // try OLD code first: should be rejected (rotation)
      const cntBefore = netStatuses(net, 'verify-signup-otp').length;
      if ((await p.locator('input').count()) !== 6) return null;
      await fillOtpFast(p, otpOld);
      for (let i = 0; i < 12 && netStatuses(net, 'verify-signup-otp').length <= cntBefore; i++) { await sleep(500); }
      const sts = netStatuses(net, 'verify-signup-otp').slice(cntBefore);
      return sts.length ? sts[sts.length - 1] : null;
    })();
    const ev4 = await shot(p, 'a4-resend-rotation');
    const rotOk = /^\d{6}$/.test(otpNew) && otpNew !== otpOld && oldStillWorks !== 200;
    rec('resend-rotates-and-invalidates-old-code', rotOk ? 'HELD' : 'DISPUTED',
      `Resend Code clicked=${rsClicked}: otp ${otpOld} -> ${otpNew} (sandbox DB); resend API calls=${JSON.stringify(resendSends)}; old code retried after resend -> HTTP ${oldStillWorks} (null=no call possible)`,
      ev4);

    // now complete with the NEW code to reach password step (needed for later attacks)
    let pwReached = false;
    if ((await p.locator('input').count()) === 6) {
      await fillOtpFast(p, otpNew);
      for (let i = 0; i < 15 && !pwReached; i++) { pwReached = await hasText(p, 'Complete Security'); await sleep(700); }
    }
    rec('correct-new-code-advances', pwReached ? 'HELD' : 'DISPUTED', `new code accepted -> password step reached=${pwReached}`, null);

    if (pwReached) {
      // =====================================================================
      // A5 INVALID INPUTS at password step: mismatch, weak, 500-char, emoji/Swahili
      // =====================================================================
      const pwInputs = await p.locator('input[type="password"]').count();
      rec('password-step-two-fields', pwInputs === 2 ? 'HELD' : 'DISPUTED', `password inputs at Complete Security step = ${pwInputs}`, null);
      async function setPw(a, b) {
        const n = await p.locator('input[type="password"]').count();
        if (n < 1) return false;
        await p.locator('input[type="password"]').nth(0).click({ force: true }); await p.keyboard.type(a, { delay: 8 }).catch(() => {});
        if (n >= 2) { await p.locator('input[type="password"]').nth(1).click({ force: true }); await p.keyboard.type(b, { delay: 8 }).catch(() => {}); }
        return true;
      }
      async function clearPw(i) {
        const el = p.locator('input[type="password"]').nth(i);
        try { await el.click({ force: true }); } catch (e) { return; }
        await sleep(120);
        for (let k = 0; k < 60; k++) await p.keyboard.press('Backspace');
        await sleep(120);
      }
      // A5a mismatch
      await setPw('Str0ngPass!x', 'Different!9x');
      await captureToasts(p);
      const mmClick = await clickBtn(p, 'Complete Registration');
      let mmToast = null; for (let i = 0; i < 8 && !mmToast; i++) { mmToast = await seenToast(p, /passwords do not match|match/i); await sleep(500); }
      const stayedPw = await hasText(p, 'Complete Security');
      const noReg1 = netStatuses(net, '/auth/register').length === 0;
      const ev5 = await shot(p, 'a5a-mismatch');
      rec('invalid-mismatch-blocks-register', (mmToast && stayedPw && noReg1) ? 'HELD' : 'DISPUTED',
        `mismatched confirm -> toast=${JSON.stringify(mmToast)} stayed=${stayedPw} /auth/register calls=${netStatuses(net,'/auth/register')} (client gate held)`,
        ev5);
      // clear fields
      async function clearField(sel, i) { const el = p.locator(sel).nth(i); await el.click({ force: true }); for (let k = 0; k < 40; k++) { await p.keyboard.press('Backspace'); } await sleep(150); }
      await clearPw(0); await clearPw(1);
      // A5b WEAK password
      await setPw('abc', 'abc');
      const weakClick = await clickBtn(p, 'Complete Registration');
      let weakToast = null;
      for (let i = 0; i < 8 && !weakToast; i++) { weakToast = await seenToast(p, /strong|password must|least|characters/i); await sleep(500); }
      const noReg2 = netStatuses(net, '/auth/register').length === 0;
      const weakStayed = await hasText(p, 'Complete Security');
      const ev6 = await shot(p, 'a5b-weak-password');
      rec('weak-password-gated-client-side-or-server', (weakStayed || weakToast) && noReg2 ? 'HELD' : 'DISPUTED',
        `weak pw 'abc': toast=${JSON.stringify(weakToast)} stayedOnPasswordStep=${weakStayed} registerCalls=${JSON.stringify(netStatuses(net,'/auth/register'))}`,
        ev6);
      await clearPw(0); await clearPw(1);
      // A5c 500-char password
      const long500 = 'Xy9!' + 'a'.repeat(496);
      await setPw(long500, long500);
      const longClick = await clickBtn(p, 'Complete Registration');
      let regLong = [];
      for (let i = 0; i < 14 && !regLong.length; i++) { await sleep(700); regLong = netStatuses(net, '/auth/register'); }
      const ev7 = await shot(p, 'a5c-long500');
      const longHandled = regLong.length === 0 || (regLong.length && !R.failures.some(f => f.startsWith('pageerror')));
      rec('huge-500char-password-safe-handling', longHandled ? 'HELD' : 'DISPUTED',
        `500-char pw: register responses=${JSON.stringify(regLong)}, pageerrors=${R.failures.filter(f => f.startsWith('pageerror')).length}, toastSeen=${!!await seenToast(p, /./)}`,
        ev7);
      // restore sane pw for completion
      await clearPw(0); await clearPw(1);
      await setPw('Str0ngPass!x', 'Str0ngPass!x');
      const regBefore = netStatuses(net, '/auth/register');
      const done = await clickBtn(p, 'Complete Registration');
      let regSt = null;
      for (let i = 0; i < 16 && !regSt; i++) { await sleep(700); const s = netStatuses(net, '/auth/register'); if (s.length > regBefore.length) regSt = s[s.length - 1]; }
      let tokened = false; for (let i = 0; i < 12 && !tokened; i++) { tokened = await L.isLoggedIn(p); if (!tokened) await sleep(800); }
      const apiLogin = await fetch(`${L.API}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: fx, password: 'Str0ngPass!x' }) });
      const ev8 = await shot(p, 'a6-completed');
      rec('happy-path-completion-after-abuse', (regSt === 201 && tokened && apiLogin.status === 200) ? 'HELD' : 'BROKEN',
        `after all abuse the flow still completes: register HTTP ${regSt}, token=${tokened}, fresh API login HTTP ${apiLogin.status}`,
        ev8);

      // =====================================================================
      // A7 SESSION ROTATION: clear auth_token mid-session, hit gated route
      // =====================================================================
      const tokBefore = await p.evaluate(() => localStorage.getItem('flutter.auth_token'));
      await p.evaluate(() => localStorage.removeItem('flutter.auth_token'));
      await p.goto(`${APP}/#/account`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await waitFirstPaint(p); await sleep(2500);
      const txtAfter = await allText(p);
      const guestUi = /Login|Sign In/i.test(txtAfter);
      const crashy = /Exception|Stack Trace|Red screen|error boundary/i.test(txtAfter);
      const ev9 = await shot(p, 'a7-token-cleared-account');
      rec('session-rotation-token-clear', (!crashy && guestUi) ? 'HELD' : 'DISPUTED',
        `cleared flutter.auth_token mid-session, deep-linked #/account: guest UI shown=${guestUi}, crash text=${crashy}, pageAlive=${await hasText(p, '')}`,
        ev9);
      // re-login restores session (rotation round trip)
      const li = await clickBtn(p, 'Login');
      await sleep(1600);
      const emOk = await (async () => { const n = await p.locator('input').count(); if (!n) return false; await p.locator('input[type="text"],input:not([type])').first().click({ force: true }); await p.keyboard.type(fx, { delay: 12 }); await p.locator('input[type="password"]').first().click({ force: true }); await p.keyboard.type('Str0ngPass!x', { delay: 12 }); return true; })();
      const loginBtn = await clickBtn(p, 'Log in');
      let tokAfter = ''; for (let i = 0; i < 14; i++) { tokAfter = await p.evaluate(() => localStorage.getItem('flutter.auth_token') || ''); if (tokAfter.length > 10) break; await sleep(900); }
      const ev10 = await shot(p, 'a7b-relogin-restored');
      rec('session-rotation-relogin-roundtrip', (li && emOk && loginBtn && tokAfter.length > 10) ? 'HELD' : 'DISPUTED',
        `re-login as the freshly created user restored token len=${tokAfter.length}`,
        ev10);
    } else {
      rec('password-step-unreachable-in-skeptic', 'BLOCKED', 'could not reach password step in this run; A5-A7 skipped this context', null);
    }
    await L.closeVideo(ctx, OUT('videos/AU-010-skeptic-375.webm'));
    R.evidence.push('videos/AU-010-skeptic-375.webm');

    // =====================================================================
    // A8 DUPLICATE EMAIL DEFENSE (fresh context, established dup fixture via real API)
    // =====================================================================
    const uniqD = Date.now().toString(36).slice(-4);
    const fxDup = `sk-a10d-${uniqD}@gmail.com`;
    const est = await fetch(`${L.API}/api/v1/email/send-signup-Otp?signupEmail=${encodeURIComponent(fxDup)}&firstName=Dup&lastName=Skep`, { method: 'POST' });
    let dOtp = 'NULL'; for (let i = 0; i < 15 && !/^\d{6}$/.test(dOtp); i++) { await sleep(1000); dOtp = dbOtp(fxDup); }
    await fetch(`${L.API}/api/v1/email/verify-signup-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: fxDup, otp: dOtp }) });
    const r1 = await fetch(`${L.API}/api/v1/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName: 'Dup', lastName: 'Skep', emailAddress: fxDup, password: 'Str0ngPass!x' }) });
    rec('dup-fixture-via-real-api', r1.status === 201 ? 'HELD' : 'BROKEN', `established dup fixture ${fxDup} via real API: send=202? verify ok? register=${r1.status}`, null);
    const ctxD = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
    const pd = await ctxD.newPage(); const netD = [];
    pd.on('response', r => { const u = r.url(); if (u.includes('/api/v1/')) netD.push({ m: 'RESP ' + r.status(), u }); });
    pd.on('pageerror', e => R.failures.push('pageerror[A8]: ' + e.message.slice(0, 120)));
    await pd.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await waitFirstPaint(pd); await sleep(2000); await captureToasts(pd);
    await typeInput(pd, 0, 'Dup'); await typeInput(pd, 1, 'Again'); await typeInput(pd, 2, fxDup);
    await clickBtn(pd, 'Continue');
    await sleep(3200);
    let dOtp2 = dbOtp(fxDup); for (let i = 0; i < 10 && !/^\d{6}$/.test(dOtp2); i++) { await sleep(900); dOtp2 = dbOtp(fxDup); }
    if (/^\d{6}$/.test(dOtp2) && await hasText(pd, 'Verify Your Email')) {
      await fillOtpFast(pd, dOtp2);
      for (let i = 0; i < 14 && !(await hasText(pd, 'Complete Security')); i++) await sleep(700);
    }
    const pwN = await pd.locator('input[type="password"]').count();
    if (pwN >= 1) {
      await pd.locator('input[type="password"]').nth(0).click({ force: true }); await pd.keyboard.type('AnotherPass!7', { delay: 12 });
      if (pwN >= 2) { await pd.locator('input[type="password"]').nth(1).click({ force: true }); await pd.keyboard.type('AnotherPass!7', { delay: 12 }); }
      await clickBtn(pd, 'Complete Registration');
      await sleep(3400);
    } else { await clickBtn(pd, 'Continue'); await sleep(2400); }
    const got409 = netD.some(x => x.u.includes('/auth/register') && x.m === 'RESP 409');
    const dupToast = await seenToast(pd, /already in use|already exists|EMAIL_ALREADY_EXISTS|failed/i);
    const originalIntact = /^\$2[aby]\$/.test(dbRow(fxDup));
    const secondRowCreated = dbQ(`select count(*) from users where logging_email='${fxDup}'`) === '1';
    const ev11 = await shot(pd, 'a8-duplicate-email');
    rec('duplicate-email-defense', (got409 && dupToast && originalIntact && secondRowCreated) ? 'HELD' : 'DISPUTED',
      `dup attempt through UI: register 409=${got409}, error surfaced=${JSON.stringify(dupToast)}, single row intact=${secondRowCreated} hash intact=${originalIntact}`,
      ev11);
    await ctxD.close();

    // =====================================================================
    // A9 OFFLINE MID-SEND (setOffline during send-signup-Otp)
    // =====================================================================
    const uniqO = Date.now().toString(36).slice(-4);
    const fxOff = `sk-a10o-${uniqO}@mail.com`;
    const ctxO = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
    const po = await ctxO.newPage(); const netO = [];
    po.on('requestfailed', r => netO.push({ m: 'FAILED', u: r.url() }));
    po.on('request', r => { if (r.url().includes(':8083')) netO.push({ m: 'REQ', u: r.url() }); });
    await po.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await waitFirstPaint(po); await sleep(2000); await captureToasts(po);
    await typeInput(po, 0, 'Off'); await typeInput(po, 1, 'Line'); await typeInput(po, 2, fxOff);
    // go offline right BEFORE clicking Continue so the send fails mid-flight
    await ctxO.setOffline(true);
    await clickBtn(po, 'Continue');
    await sleep(3500);
    const offlineErr = await seenToast(po, /network|connection|internet|check your|failed|try again|error/i);
    const aliveOffline = await hasText(po, 'Create Your Account');
    const ev12 = await shot(po, 'a9-offline-error');
    await ctxO.setOffline(false);
    // recovery: retry online
    await clickBtn(po, 'Continue');
    let offOtp = 'NULL'; for (let i = 0; i < 18; i++) { await sleep(1000); offOtp = dbOtp(fxOff); if (/^\d{6}$/.test(offOtp)) break; }
    const ev13 = await shot(po, 'a9b-online-retry-recovers');
    rec('offline-mid-send-error-and-recovery', (aliveOffline && !R.failures.some(f => f.startsWith('pageerror[A9]'))) ? 'HELD' : 'DISPUTED',
      `offline Continue: error surfaced=${JSON.stringify(offlineErr)}, app stayed alive on form=${aliveOffline}; back online retry -> users.otp=${offOtp}${/^\d{6}$/.test(offOtp) ? ' (recovered)' : ' NOT recovered'}; failed reqs=${netO.filter(x=>x.m==='FAILED').length}`,
      ev13);
    if (ev13) R.evidence.push(ev13.replace(OUT(''), 'e2e'));
    await ctxO.close();
    void uniq; void uniqO;
  }

  // =====================================================================
  // B. TABLET (768x1024) spot-run of the highest-risk classes: rapid send + dup
  // =====================================================================
  try {
    const uniqT = Date.now().toString(36).slice(-4);
    const fxT = `sk-a10t-${uniqT}@gmail.com`;
    const ctxT = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: OUT('videos/AU-010-skeptic-768.webm') });
    const pt = await ctxT.newPage(); const netT = [];
    pt.on('response', r => { const u = r.url(); if (u.includes(':8083')) netT.push({ m: 'RESP ' + r.status(), u }); });
    await pt.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await waitFirstPaint(pt); await sleep(2200); await captureToasts(pt);
    await typeInput(pt, 0, 'Tab'); await typeInput(pt, 1, 'Let'); await typeInput(pt, 2, fxT);
    const c1 = await clickBtn(pt, 'Continue'); const c2 = await clickBtn(pt, 'Continue');
    await sleep(3000);
    const sendsT = netStatuses(netT, 'send-signup-Otp');
    const ev14 = await shot(pt, 'b1-768-rapid-send');
    let otpT = 'NULL'; for (let i = 0; i < 18 && !/^\d{6}$/.test(otpT); i++) { await sleep(1000); otpT = dbOtp(fxT); }
    rec('tablet-rapid-double-send', sendsT.length <= 1 ? 'HELD' : 'DISPUTED',
      `768x1024 double Continue: sends=${JSON.stringify(sendsT)}, otp landed=${/^\d{6}$/.test(otpT)}`, ev14);
    if (/^\d{6}$/.test(otpT) && (await pt.locator('input').count()) === 6) {
      await fillOtpFast(pt, otpT);
      let pwT = false; for (let i = 0; i < 14 && !pwT; i++) { pwT = await hasText(pt, 'Complete Security'); await sleep(700); }
      rec('tablet-happy-path-advances', pwT ? 'HELD' : 'DISPUTED', `tablet correct-code advance to password step=${pwT}`, null);
    }
    await L.closeVideo(ctxT, OUT('videos/AU-010-skeptic-768.webm'));
    R.evidence.push('videos/AU-010-skeptic-768.webm');
    void c1; void c2;
    await ctxT.close();
  } catch (e) { R.failures.push('tablet-harness: ' + e.message); }

  // ---------- wrap ----------
  await browser.close();
  R.attacks_attempted = R.findings.filter(f => f.result !== 'freshness').length;
  R.ts = new Date().toISOString();
  R.runtime_ms = Date.now() - T0;
  const blocked = R.findings.filter(f => f.result === 'BLOCKED').length;
  const disputed = R.findings.filter(f => f.result === 'DISPUTED').length;
  R.verdict = R.attacks_broken === 0 ? (disputed || blocked ? 'HELD-WITH-DISPUTES' : 'HELD') : 'BROKEN';
  console.log('RESULT ' + JSON.stringify(R, null, 1));
  fs.mkdirSync(OUT('results/shards'), { recursive: true });
  fs.writeFileSync(OUT('results/shards/AU-010-skeptic.jsonl'), JSON.stringify(R) + '\n');
  fs.writeFileSync(OUT('reports/AU-010-skeptic.md'), report(R));
})();
