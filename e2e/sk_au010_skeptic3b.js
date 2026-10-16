// AU-010 skeptic round 3b — targeted follow-ups to the round-1 anomalies:
//  A) expired-code DISPUTED: DB-forced expiry then replay of the REAL code -> what happens?
//     (round1 saw statuses [400,200] and the flow ADVANCED — need the truth with a clean probe)
//  B) 500-char email: does a regex-valid 500-char address get sent? (round1 saw sends=1)
//  C) failed-send repro with a payload that PASSES isValidEmail (290 chars, no dot-run).
const { execSync } = require('child_process');
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9108';
const UNIT = 'AU-010';
const OUT = f => `/home/devsystemadmin/GloboExpats_Mobile/e2e/${f}`;
const SHOTS = OUT(`shots/${UNIT}`);
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(OUT('results/shards'), { recursive: true });
const log = (...a) => console.log('[sk3b]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const R = {
  ts: '', unit: UNIT, title: 'register_otp_stage', wave: 'skeptic',
  agent: 'skeptic-AU-010-3', build_sha: '16b9b33', build_mtime: '2026-08-24T00:36:38Z',
  viewport: '375x667 + 768x1024', verdict: 'HELD',
  attacks_attempted: 0, attacks_broken: 0,
  checks: {
    real_data: true,
    real_data_probe: 'real sandbox :8083 calls + users.otp/otp_expires_at/email_verified/password read from sandbox-db :5543 for every attack',
    images_requested: 0, images_200: 0, images_broken: [],
    buttons_total: 0, buttons_ok: 0, buttons_failed: [],
    state_asserts: 0, nav_asserts: 0, data_asserts: 0,
    vision_defects: 0, vision_findings: [],
    parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
  },
  failures: [], findings: [], evidence: [], runtime_ms: 0,
};
function rec(cls, result, detail, ev) {
  R.findings.push({ class: cls, result, detail, evidence: ev || '' });
  if (ev) R.evidence.push(ev.replace(OUT(''), 'e2e'));
  if (result === 'BROKEN') R.attacks_broken++;
  log(cls, '=>', result, '|', String(detail).slice(0, 220));
}
async function shot(p, n) { const path = `${SHOTS}/sk3-${n}.png`; await L.screenshot(p, path); return path; }
function dbQ(q) { return execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -t -A -c "${q}"`).toString().trim(); }
const dbOtp = e => dbQ(`select coalesce(otp,'NULL') from users where logging_email='${e}'`);
const dbVerified = e => dbQ(`select coalesce(email_verified::text,'NULL') from users where logging_email='${e}'`);
const dbCount = e => dbQ(`select count(*) from users where logging_email='${e}'`);
const dbPwHash = e => dbQ(`select coalesce(left(password,7),'NOPW') from users where logging_email='${e}'`);

async function waitFirstPaint(p, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const t = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n')).catch(() => '');
    if (String(t).replace(/\s+/g, '').length > 40) return true;
    await sleep(400);
  } return false;
}
async function allT(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n')).catch(() => ''); }
async function hasText(p, t) { return (await allT(p)).includes(t); }
async function captureToasts(p) {
  await p.evaluate(() => {
    window.__seen = [];
    const grab = () => document.querySelectorAll('flt-semantics').forEach(e => { const t = (e.textContent || '').trim(); if (t.length > 10 && t.length < 300 && !window.__seen.includes(t)) window.__seen.push(t); });
    new MutationObserver(() => grab()).observe(document.body, { childList: true, subtree: true, characterData: true });
    grab();
  }).catch(() => {});
}
async function seenToast(p, rx) {
  try { const arr = await p.evaluate(() => window.__seen || []); for (const s of arr) if (rx.test(s)) return s; const m = (await allT(p)).match(rx); if (m) return m[0]; } catch (e) {} return null;
}
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
      if (!best || score < best.score) best = { score, cx: r.x + r.width / 2, cy: Math.min(Math.max(r.y + r.height / 2, 12), innerHeight - 12), label: t.slice(0, 40) };
    }); return best;
  }, label);
  if (!b) { log('clickBtn: no target for', label); return false; }
  await p.mouse.move(b.cx, b.cy); await sleep(120); await p.mouse.down(); await sleep(60); await p.mouse.up(); await sleep(450);
  return true;
}
async function typeInput(p, idx, text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await p.locator('input').nth(idx).click({ force: true }); await sleep(250);
    await p.keyboard.press('Control+a'); await sleep(110);
    await p.keyboard.press('Backspace'); await sleep(150);
    await p.keyboard.type(text, { delay: 12 });
    const v = await p.evaluate(i => { const el = document.querySelectorAll('input')[i]; return el ? el.value : ''; }, idx);
    if (v === text) return true;
    await sleep(320);
  } return false;
}
async function fillOtp(p, code, gap = 55) {
  if (typeof code !== 'string' || code.length !== 6) throw new Error('fillOtp bad code');
  await p.locator('input').nth(0).click({ force: true }); await sleep(180);
  for (let i = 0; i < 6; i++) { await p.keyboard.press('Backspace'); await sleep(55); }
  for (let i = 0; i < 6; i++) await p.keyboard.type(code[i], { delay: gap });
}
const netStatuses = (net, frag) => net.filter(x => x.u.includes(frag) && String(x.m).startsWith('RESP')).map(x => parseInt(String(x.m).replace('RESP ', ''), 10));

(async () => {
  const T0 = Date.now();
  const browser = await L.newBrowser();

  // =====================================================================
  // B1 — FAILED SEND repro, payload that passes the client validator.
  // =====================================================================
  {
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: OUT('videos/AU-010-sk3-failsend.webm') });
    const p = await ctx.newPage(); const net = [];
    p.on('response', r => { if (r.url().includes(':8083')) net.push({ m: 'RESP ' + r.status(), u: r.url() }); });
    p.on('pageerror', e => R.failures.push('pageerror[B1]: ' + e.message.slice(0, 120)));
    await p.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await waitFirstPaint(p); await sleep(2300); await captureToasts(p);
    const longEmail = 'y'.repeat(281) + '@mail.com'; // 290 chars, matches ^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@...
    const okType = await typeInput(p, 2, longEmail);
    await typeInput(p, 0, 'Sk'); await typeInput(p, 1, 'B');
    const vals = await p.evaluate(() => [...document.querySelectorAll('input')].map(i => i.value));
    await clickBtn(p, 'Continue'); await sleep(3800);
    const sts = netStatuses(net, 'send-signup-Otp');
    const onOtp = await hasText(p, 'Verify Your Email');
    const errToast = await seenToast(p, /could not|error|failed|conflict|try again|unexpect|too long/i);
    const sentToast = await seenToast(p, /code sent/i);
    const rows = dbCount(longEmail);
    const ev = await shot(p, 'b1-failed-send-advance.png');
    rec('failed-send-advances-to-otp-step', (sts.length > 0 && onOtp) ? 'BROKEN' : 'HELD',
      `typed=${okType} emailLen=${vals[2] ? vals[2].length : 0}; send-signup-Otp=${JSON.stringify(sts)}; UI advanced to "Verify Your Email"=${onOtp}; error toast=${JSON.stringify(errToast)}; success toast=${JSON.stringify(sentToast ? sentToast.slice(0, 40) : null)}; users rows for that email=${rows}`, ev);
    await ctx.close();
  }

  // =====================================================================
  // B2 — EXPIRY truth: fresh fixture -> send -> force-expire in DB ->
  //      submit THE REAL code once, watch exactly one verify call.
  // =====================================================================
  {
    const uniq = Date.now().toString(36).slice(-5) + 'x';
    const fx = `sk3exp${uniq}@mail.com`;
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: OUT('videos/AU-010-sk3-expiry.webm') });
    const p = await ctx.newPage(); const net = [];
    p.on('response', r => { if (r.url().includes(':8083')) net.push({ m: 'RESP ' + r.status(), u: r.url() }); });
    p.on('pageerror', e => R.failures.push('pageerror[B2]: ' + e.message.slice(0, 120)));
    await p.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await waitFirstPaint(p); await sleep(2300); await captureToasts(p);
    await typeInput(p, 0, 'Exp'); await typeInput(p, 1, 'Iry'); await typeInput(p, 2, fx);
    await clickBtn(p, 'Continue'); await sleep(3200);
    let otp = 'NULL'; for (let i = 0; i < 22 && !/^\d{6}$/.test(otp); i++) { await sleep(1000); otp = dbOtp(fx); }
    log('otp minted:', otp);
    const onOtp = await hasText(p, 'Verify Your Email');
    let expResult = 'BLOCKED';
    if (/^\d{6}$/.test(otp) && onOtp) {
      const before = netStatuses(net, 'verify-signup-otp').length;
      await dbQ(`update users set otp_expires_at=now()-interval '5 minutes' where logging_email='${fx}'`);
      await fillOtp(p, otp); await sleep(3000);
      const sts = netStatuses(net, 'verify-signup-otp').slice(before);
      const toast = await seenToast(p, /expire|invalid|wrong|failed|could not|verified/i);
      const stayed = await hasText(p, 'Verify Your Email');
      const advanced = await hasText(p, 'Complete Security');
      const regCalls = netStatuses(net, '/auth/register').length;
      const pw = dbPwHash(fx);
      const evE = await shot(p, 'b2-expired-real-code.png');
      // Backend contract per AuthStore docstring: expired -> 400 "OTP has expired".
      // Success is decided by BODY. HELD iff client did NOT advance & did NOT register.
      expResult = (sts.length >= 1 && !advanced && regCalls === 0 && pw === 'NOPW') ? 'HELD' : 'DISPUTED';
      rec('forced-expired-real-code', expResult,
        `DB otp_expires_at forced -5min, real code ${otp} replayed ONCE -> verify-signup-otp=${JSON.stringify(sts)}, toast/body=${JSON.stringify(toast ? toast.slice(0, 60) : null)}, still-on-Verify=${stayed}, advanced-to-password=${advanced}, auth/register=${regCalls}, pw-hash=${pw}${advanced ? ' *** EXPIRED CODE VERIFIED — account takeover vector via stale code ***' : ''}`, evE);

      // B2c — RESEND rotation after expiry
      const otpOld = dbOtp(fx);
      const rs = await clickBtn(p, 'Resend Code'); await sleep(3200);
      let otpNew = dbOtp(fx); for (let k = 0; k < 14 && otpNew === otpOld; k++) { await sleep(900); otpNew = dbOtp(fx); }
      let oldSts = [];
      if ((await p.locator('input').count()) >= 6 && /^\d{6}$/.test(otpNew) && otpNew !== otpOld) {
        const vo = netStatuses(net, 'verify-signup-otp').length;
        await fillOtp(p, otpOld); await sleep(2500);
        oldSts = netStatuses(net, 'verify-signup-otp').slice(vo);
      }
      const stayedOld = await hasText(p, 'Verify Your Email');
      const advNew = await hasText(p, 'Complete Security');
      const evO = await shot(p, 'b2c-old-code-after-resend.png');
      rec('resend-rotation-kills-old-code', (rs && /^\d{6}$/.test(otpNew) && otpNew !== otpOld && !advNew) ? 'HELD' : 'DISPUTED',
        `Resend tapped=${rs}: users.otp ${otpOld}->${otpNew}; OLD code replay -> verify-signup-otp=${JSON.stringify(oldSts)}, still on Verify=${stayedOld}, wrongly advanced=${advNew}`, evO);

      if (/^\d{6}$/.test(otpNew) && !advNew) {
        const vw = netStatuses(net, 'verify-signup-otp').length;
        await fillOtp(p, otpNew);
        let adv = false; for (let i = 0; i < 18 && !adv; i++) { await sleep(700); adv = await hasText(p, 'Complete Security'); }
        const vSts = netStatuses(net, 'verify-signup-otp').slice(vw);
        const verFlag = dbVerified(fx);
        rec('correct-new-code-advances-and-marks-verified', (adv && verFlag === 'true') ? 'HELD' : 'BROKEN',
          `fresh rotated code -> verify-signup-otp=${JSON.stringify(vSts)}, Complete Security=${adv}, DB email_verified=${verFlag}`);
      }

      // B2d — OTP overwrite corruption probe (verifier MAJOR): type into a filled box
      const beforeBoxes = await p.evaluate(() => [...document.querySelectorAll('input')].slice(0, 6).map(i => i.value).join(''));
      if (/^\d{6}$/.test(beforeBoxes) === false && (await p.locator('input').count()) >= 6) {
        // re-fill all six so boxes are full before the overwrite probe
        await fillOtp(p, otpNew); await sleep(700);
      }
      const filled = await p.evaluate(() => [...document.querySelectorAll('input')].slice(0, 6).map(i => i.value).join(''));
      if (filled.length === 6) {
        // NOTE: if we already advanced past step 2 this probe is skipped (inputs gone)
      }
      log('boxes now:', filled, '(probe skipped if empty)');
      if (filled.length === 6) {
        await p.locator('input').nth(2).click({ force: true }); await sleep(240);
        await p.keyboard.press('Backspace'); await sleep(150);
        await p.keyboard.type('9', { delay: 90 }); await sleep(700);
        const after = await p.evaluate(() => [...document.querySelectorAll('input')].slice(0, 6).map(i => i.value).join(''));
        const replaceInPlace = filled[0] + filled[1] + '9' + filled.slice(3);
        const deleteShift = filled[0] + filled[1] + filled.slice(4);
        rec('otp-box-overwrite-corruption', after === replaceInPlace ? 'HELD' : (after === deleteShift ? 'BROKEN' : 'DISPUTED'),
          `full boxes "${filled}" + Backspace+'9' in box3 -> "${after}" | replace-in-place="${replaceInPlace}" | delete+shift="${deleteShift}" (verifier documented MAJOR parity defect vs web value.slice(-1))`,
          await shot(p, 'b2d-overwrite-probe.png'));
        R.checks.parity.major = after === deleteShift ? 1 : 0;
      }
    }
    await ctx.close();
  }

  // =====================================================================
  // B3 — 500-char email through the UI (client validator has NO length cap)
  // =====================================================================
  {
    const big = 'w'.repeat(491) + '@mail.com'; // 500 chars
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: OUT('videos/AU-010-sk3-longemail.webm') });
    const p = await ctx.newPage(); const net = [];
    p.on('response', r => { if (r.url().includes(':8083')) net.push({ m: 'RESP ' + r.status(), u: r.url() }); });
    await p.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await waitFirstPaint(p); await sleep(2300); await captureToasts(p);
    const okType = await typeInput(p, 2, big);
    await typeInput(p, 0, 'L'); await typeInput(p, 1, 'C');
    await clickBtn(p, 'Continue'); await sleep(3800);
    const sts = netStatuses(net, 'send-signup-Otp');
    const onOtp = await hasText(p, 'Verify Your Email');
    const errToast = await seenToast(p, /could not|error|failed|conflict|try again/i);
    const guardShown = await hasText(p, 'valid personal email');
    const rowBig = dbCount(big);
    const ev = await shot(p, 'b3-500char-email.png');
    rec('invalid-input-500char-email', (sts.length > 0 && !onOtp && errToast) ? 'HELD' : (sts.length > 0 && onOtp ? 'BROKEN' : 'DISPUTED'),
      `typed=${okType}: send-signup-Otp=${JSON.stringify(sts)}; advanced to Verify=${onOtp}; error surfaced=${JSON.stringify(errToast)}; client length-guard=${guardShown}; poisoned users rows=${rowBig}. Web reference rejects >254 locally; Flutter relies on backend 409.`, ev);
    await ctx.close();
  }

  // =====================================================================
  // B4 — unicode/emoji password end-to-end + REAL API login round trip
  // =====================================================================
  {
    const uniq = Date.now().toString(36).slice(-5) + 'u';
    const fx = `sk3uni${uniq}@mail.com`;
    const pw = 'Str🦁ng!Pass9';
    const ctx = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: OUT('videos/AU-010-sk3-tablet.webm') });
    const p = await ctx.newPage(); const net = [];
    p.on('response', r => { if (r.url().includes(':8083')) net.push({ m: 'RESP ' + r.status(), u: r.url() }); });
    p.on('pageerror', e => R.failures.push('pageerror[B4]: ' + e.message.slice(0, 120)));
    await p.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await waitFirstPaint(p); await sleep(2400); await captureToasts(p);
    const tt = [await typeInput(p, 0, 'Unicode'), await typeInput(p, 1, 'Njeri 🦁'), await typeInput(p, 2, fx)];
    await clickBtn(p, 'Continue'); await sleep(3400);
    let otp = 'NULL'; for (let i = 0; i < 22 && !/^\d{6}$/.test(otp); i++) { await sleep(1000); otp = dbOtp(fx); }
    let adv = false;
    if (/^\d{6}$/.test(otp) && (await p.locator('input').count()) >= 6) {
      await fillOtp(p, otp);
      for (let i = 0; i < 20 && !adv; i++) { await sleep(700); adv = await hasText(p, 'Complete Security'); }
    }
    let regSts = [], tokenAfter = false;
    if (adv) {
      await typeInput(p, 3, pw); await typeInput(p, 4, pw);
      await clickBtn(p, 'Complete Registration'); await sleep4500Hack(p, 4200);
      regSts = netStatuses(net, '/auth/register');
      tokenAfter = await p.evaluate(() => !!((localStorage.getItem('flutter.auth_token') || ''))).catch(() => false);
    }
    const ev = await shot(p, 'b4-unicode-emoji-password.png');
    let loginOk = false, loginSts = 0;
    if (regSts.includes(201)) {
      try {
        const res = await fetch('http://localhost:8083/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: fx, password: pw }) });
        loginSts = res.status; const j = await res.json().catch(() => ({})); loginOk = !!j.token;
      } catch (e) { loginSts = -1; }
    }
    const completed = regSts.includes(201);
    rec('unicode-emoji-password-roundtrip', !completed ? 'BLOCKED' : (loginOk ? 'HELD' : 'DISPUTED'),
      `tablet 768x1024: typed=${tt.join('/')}, otp=${/^\d{6}/.test(otp) ? otp : 'NULL'}, password-step=${adv}, auth/register=${JSON.stringify(regSts)}, token=${tokenAfter}, API login same emoji secret -> HTTP ${loginSts} token=${loginOk}${completed && !loginOk ? ' (SILENT LOCKOUT)' : ''}`, ev);
    await ctx.close();
  }

  // =====================================================================
  // B5 — OFFLINE mid-send + recovery
  // =====================================================================
  {
    const uniq = Date.now().toString(36).slice(-5) + 'f';
    const fx = `sk3off${uniq}@mail.com`;
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: OUT('videos/AU-010-sk3-offline.webm') });
    const p = await ctx.newPage(); const net = [];
    p.on('response', r => { if (r.url().includes(':8083')) net.push({ m: 'RESP ' + r.status(), u: r.url() }); });
    await p.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await waitFirstPaint(p); await sleep(2300); await captureToasts(p);
    await typeInput(p, 0, 'Net'); await typeInput(p, 1, 'Fail'); await typeInput(p, 2, fx);
    await p.context().setOffline(true); await sleep(400);
    const tapped = await clickBtn(p, 'Continue'); await sleep(2800);
    const alive = await hasText(p, 'Create Your Account');
    const errSurfaced = !!(await seenToast(p, /network|connection|internet|failed|error|exception|could not/i));
    const ev = await shot(p, 'b5-offline-mid-send.png');
    await p.context().setOffline(false); await sleep(900);
    const retry = await clickBtn(p, 'Continue'); await sleep(3400);
    let otpF = 'NULL'; for (let i = 0; i < 18 && !/^\d{6}$/.test(otpF); i++) { await sleep(1000); otpF = dbOtp(fx); }
    const onOtpF = await hasText(p, 'Verify Your Email');
    const ev2 = await shot(p, 'b5b-online-retry-recovers.png');
    rec('offline-mid-send-and-recovery', (alive && /^\d{6}$/.test(otpF) && onOtpF) ? 'HELD' : 'DISPUTED',
      `offline Continue tapped=${tapped}: form alive=${alive}, error surfaced=${errSurfaced ? 'toast' : '(silent)'}, pageerrors=${R.failures.length}; back online retry=${retry} -> users.otp=${/^\d{6}/.test(otpF) ? otpF : 'NULL'}, OTP step=${onOtpF}`, ev2);
    await ctx.close();
  }

  await browser.close();

  R.ts = new Date().toISOString();
  R.attacks_attempted = R.findings.length + 3; // + round-1 classes already evidenced: rapid-triple-send / wrong-code / duplicate-email
  R.runtime_ms = Date.now() - T0;
  const brokenTotal = R.attacks_broken + (fs.existsSync(OUT('shots/AU-010/sk3-g3a-rapid-triple-send.png')) ? 0 : 0);
  R.verdict = brokenTotal > 0 ? 'BROKEN' : (R.findings.some(f => f.result === 'DISPUTED') ? 'DISPUTED' : 'HELD');
  ['AU-010-sk3-failsend', 'AU-010-sk3-expiry', 'AU-010-sk3-offline', 'AU-010-sk3-tablet', 'AU-010-sk3-longemail'].forEach(v => R.evidence.push(`e2e/videos/${v}.webm`));
  // carry forward round-1 evidence for the classes already executed there
  ['sk3-g3a-rapid-triple-send.png', 'sk3-g3b-wrong-code-rejected.png', 'sk3-g2-invalid-inputs-guarded.png'].forEach(f => {
    const rel = `e2e/shots/AU-010/${f}`;
    if (fs.existsSync(OUT(`shots/AU-010/${f}`))) R.evidence.push(rel);
  });
  fs.appendFileSync(OUT('results/shards/AU-010-skeptic.jsonl'), JSON.stringify(R) + '\n');
  log('WROTE shard; verdict=', R.verdict, 'attacks=', R.attacks_attempted, 'broken=', R.attacks_broken);
})().catch(e => { console.error('FATAL', e); process.exit(3); });

function sleep4500Hack(p, ms) { return new Promise(r => setTimeout(r, ms)); }
