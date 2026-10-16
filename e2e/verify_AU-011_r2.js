// AU-011 verifier r2 (v3) — otp_verify_screen (/verify-email), frozen bundle :9107
// sha 4b22459, main.dart.js mtime 2026-08-23T23:02:21Z GMT (asserted by caller before run)
//
// Acceptance: Verify calls verifySignupOtp with the ENTERED code (never re-sends);
// expired code -> message + redirect to register; resend works.
//
// v3 fixes over first r2 attempt (harness bugs, not app bugs):
//  - success leg runs BEFORE the 60s resend cooldown wait (backend OTP window is 300s;
//    waiting cooldown+typing blew past it at 768 -> "Email Verified!" never reachable)
//  - "Code Sent!" snackbar is transient (~3s): poll allText every 150ms right after the click
//  - reference @375: Resend/Confirm sit behind the fixed bottom nav until the page is
//    scrolled; wheel-scroll first, then coordinate click (real-user equivalent)
const fs = require('fs');
const { execSync } = require('child_process');
const {
  REF, newBrowser, newCtx, closeVideo, allText,
  btn, clickBtn, listButtons, watchImages, imageSummary,
  screenshot, shotName,
} = require('./lib_verify.js');

const APP = 'http://localhost:9107';
const UNIT = 'AU-011';
const OUT = (f) => path.join('/home/devsystemadmin/GloboExpats_Mobile/e2e', f);
function path_join(a, b) { return a.replace(/\/?$/, '/') + b; }
const SHOTS = (s) => OUT(`shots/${UNIT}/${s}`);
const log = (...a) => console.log('[AU-011.r2]', ...a);
// (path imported lazily to keep top clean)
let path = require('path');

function dbOtp(email) {
  return execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -t -A -c "select coalesce(otp,'NULL') from users where logging_email='${email}'"`)
    .toString().trim();
}
function dbExpire(email) {
  execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -c "update users set otp_expires_at = now() - interval '1 minute' where logging_email='${email}'"`);
}
async function makeFixture(tag) {
  const email = `rw-au011v3-${tag}-${Date.now().toString(36)}@example.com`;
  const r = await fetch('http://localhost:8083/api/v1/email/send-signup-Otp?' +
    new URLSearchParams({ signupEmail: email, firstName: 'Rw', lastName: 'Au011v3' }), { method: 'POST' });
  if (![200, 201, 202].includes(r.status)) throw new Error('send-signup-Otp failed ' + r.status);
  const otp = dbOtp(email);
  if (!/^\d{6}$/.test(otp)) throw new Error('no OTP in sandbox DB for ' + email);
  log('fixture', tag, email);
  return { email, otp };
}

async function openVerify(page, email) {
  await page.goto(`${APP}/#/verify-email?email=${encodeURIComponent(email)}`,
    { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1200);
    const t = await allText(page);
    if (/Verify your email/.test(t) && /security code/.test(t)) return true;
  }
  return false;
}
async function typeCode(page, code) {
  for (let i = 0; i < 6; i++) {
    await page.locator('input').nth(i).click({ force: true });
    await page.keyboard.type(code[i]);
    await page.waitForTimeout(110);
  }
}
async function clearBoxes(page) {
  for (let i = 5; i >= 0; i--) {
    await page.locator('input').nth(i).click({ force: true });
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(80);
  }
}
async function waitForText(page, re, ms, step = 250) {
  const dl = Date.now() + ms;
  while (Date.now() < dl) {
    const t = await allText(page);
    if (re.test(t)) return t;
    await page.waitForTimeout(step);
  }
  return null;
}

(async () => {
  const t0 = Date.now();
  const R = { checks: {}, failures: [], evidence: [], vision_findings: [], parity: { blocker: 0, major: 0, minor: 0, accepted: 0 } };
  const netByVp = {};
  let placeholderHits = [];

  async function snap(page, name) {
    const t = await allText(page);
    fs.writeFileSync(OUT(`tmp/AU-011-r2-${name}.txt`), t);
    const m = t.match(/lorem|placeholder|dummy|TODO|coming soon/gi);
    if (m) placeholderHits.push({ name, hits: [...new Set(m)] });
    return t;
  }

  // ---------------- FLUTTER ----------------
  async function flutterMain(vw, vh, vp) {
    log(`--- flutter ${vw}x${vh} ---`);
    const videoPath = OUT(`videos/${UNIT}-${vp}-r2.webm`);
    const ctx = await newCtx(browser, { viewport: { width: vw, height: vh }, videoPath });
    const page = await ctx.newPage();
    const imgs = watchImages(page);
    const net = { verify: [], send: [] };
    page.on('request', (rq) => {
      const u = rq.url();
      if (u.includes('/api/v1/email/verify-signup-otp')) net.verify.push({ body: rq.postData() || '' });
      if (u.includes('/api/v1/email/send-signup-Otp')) net.send.push({ u });
    });
    netByVp[vp] = net;

    // ===== FIXTURE A: wrong code + resend (cooldown wait happens HERE only) =====
    const fxA = await makeFixture(`${vp}a`);
    if (!await openVerify(page, fxA.email)) {
      R.failures.push(`[${vp}] verify-email screen never rendered`); await closeVideo(ctx, videoPath); return;
    }
    let txt = await snap(page, `${vp}-01-initial`);
    const masked = fxA.email.replace(/^(..).*(@.*)$/, '$1***$2');
    R.checks[`masked_email_${vp}`] = txt.includes(masked);
    if (!R.checks[`masked_email_${vp}`]) R.failures.push(`[${vp}] REAL DATA: masked email "${masked}" absent from a11y text`);
    R.checks[`otp_boxes_${vp}`] = await page.locator('input').count();
    if (R.checks[`otp_boxes_${vp}`] !== 6) R.failures.push(`[${vp}] expected 6 OTP boxes, saw ${R.checks[`otp_boxes_${vp}`]}`);
    R.checks[`cooldown_text_${vp}`] = /Resend code in \d+s/.test(txt);
    await screenshot(page, SHOTS(shotName(UNIT, vp, '01-initial').split('/').pop()));

    // enumerate controls; Confirm must be aria-disabled while incomplete
    fs.writeFileSync(OUT(`tmp/AU-011-r2-controls-${vp}-initial.json`),
      JSON.stringify(await listButtons(page), null, 1));
    const dis = await page.evaluate(() => {
      const el = [...document.querySelectorAll('flt-semantics[role="button"]')]
        .find(e => (e.textContent || '').includes('Confirm email'));
      return el ? el.getAttribute('aria-disabled') : 'ABSENT';
    });
    R.checks[`confirm_disabled_attr_${vp}`] = dis;
    if (dis !== 'true') R.failures.push(`[${vp}] Confirm not disabled with empty code (aria-disabled=${dis})`);
    await clickBtn(page, 'Confirm email');           // click the disabled control
    await page.waitForTimeout(1200);
    R.checks[`disabled_click_no_network_${vp}`] = net.verify.length === 0 && net.send.length === 0;
    if (!R.checks[`disabled_click_no_network_${vp}`]) R.failures.push(`[${vp}] clicking disabled Confirm fired network calls`);
    await screenshot(page, SHOTS(shotName(UNIT, vp, '02-confirm-disabled').split('/').pop()));
    const resendIsBtnCd = await page.evaluate(() =>
      [...document.querySelectorAll('flt-semantics[role="button"]')].some(e => /Resend/i.test(e.textContent || '')));
    R.checks[`resend_not_button_during_cooldown_${vp}`] = !resendIsBtnCd;

    // WRONG code (auto-submit on 6th digit) — entered code must go to verifySignupOtp
    await typeCode(page, '123456');
    const hitWrong = await waitForText(page, /Wrong OTP/i, 9000, 300);
    txt = await snap(page, `${vp}-03-wrong`);
    await screenshot(page, SHOTS(shotName(UNIT, vp, '03-wrong-typed').split('/').pop()));
    R.checks[`verify_calls_wrong_${vp}`] = net.verify.length;
    R.checks[`verify_body_uses_entered_code_${vp}`] =
      net.verify.length > 0 && net.verify.every(v => { try { const b = JSON.parse(v.body); return b.otp === '123456' && b.email === fxA.email; } catch (e) { return false; } });
    if (!R.checks[`verify_body_uses_entered_code_${vp}`]) R.failures.push(`[${vp}] verify bodies: ${JSON.stringify(net.verify)}`);
    R.checks[`no_resend_on_verify_${vp}`] = net.send.length === 0;
    if (!R.checks[`no_resend_on_verify_${vp}`]) R.failures.push(`[${vp}] Verify RE-SENT an OTP (${net.send.length} sends)`);
    R.checks[`wrong_msg_${vp}`] = !!hitWrong && /Wrong OTP/i.test(txt);
    if (!R.checks[`wrong_msg_${vp}`]) R.failures.push(`[${vp}] backend "Wrong OTP" not surfaced; head=${txt.slice(0, 140)}`);
    R.checks[`db_otp_intact_after_wrong_${vp}`] = /^\d{6}$/.test(dbOtp(fxA.email));
    // explicit Confirm click on the filled boxes (click-everything)
    const vB = net.verify.length;
    await clickBtn(page, 'Confirm email');
    await page.waitForTimeout(2200);
    R.checks[`explicit_confirm_fires_${vp}`] = net.verify.length > vB;
    if (!R.checks[`explicit_confirm_fires_${vp}`]) R.failures.push(`[${vp}] explicit Confirm click fired no verify call`);
    txt = await snap(page, `${vp}-04-wrong-explicit`);
    await screenshot(page, SHOTS(shotName(UNIT, vp, '04-wrong-error').split('/').pop()));

    // RESEND after cooldown expires -> send-signup-Otp request + Code Sent! toast
    let cdClicked = false, waitedMs = 0;
    while (!cdClicked && waitedMs < 80000) {
      cdClicked = await clickBtn(page, "Didn't receive the code? Resend");
      if (cdClicked) break;
      const m = /Resend code in (\d+)s/.exec(await allText(page));
      if (!m) break;
      await page.waitForTimeout(Math.min(6000, (+m[1] + 1) * 1000));
      waitedMs += 6100;
    }
    R.checks[`resend_clicked_${vp}`] = cdClicked;
    if (!cdClicked) R.failures.push(`[${vp}] Resend never became clickable within 80s`);
    else {
      const toastT = await waitForText(page, /Code Sent!/i, 5000, 150);
      R.checks[`resend_toast_${vp}`] = !!toastT;
      if (!R.checks[`resend_toast_${vp}`]) R.failures.push(`[${vp}] "Code Sent!" snackbar not observed after Resend`);
    }
    R.checks[`resend_network_${vp}`] = net.send.length >= 1;
    if (!R.checks[`resend_network_${vp}`]) R.failures.push(`[${vp}] Resend produced no send-signup-Otp request`);
    const otpPreResend = dbOtp(fxA.email);
    await page.waitForTimeout(800);
    const otpPostResend = dbOtp(fxA.email);
    R.checks[`resend_rotated_db_${vp}`] = /^\d{6}$/.test(otpPostResend) && otpPostResend !== otpPreResend;
    if (!R.checks[`resend_rotated_db_${vp}`]) R.failures.push(`[${vp}] DB OTP not rotated by Resend (${otpPreResend} -> ${otpPostResend})`);
    txt = await snap(page, `${vp}-05-resend`);
    await screenshot(page, SHOTS(shotName(UNIT, vp, '05-resent').split('/').pop()));
    R.images = R.images || {}; R.images[vp] = imageSummary(imgs);

    // ===== FIXTURE B: SUCCESS with the ORIGINAL code, inside the validity window =====
    const fxB = await makeFixture(`${vp}b`);
    await clearBoxes(page);
    await openVerify(page, fxB.email);
    await typeCode(page, fxB.otp);
    await page.waitForTimeout(600);
    await screenshot(page, SHOTS(shotName(UNIT, vp, '06-correct-typed').split('/').pop()));
    const okT = await waitForText(page, /Email Verified!/i, 12000, 400);
    R.checks[`success_state_${vp}`] = !!okT;
    if (!R.checks[`success_state_${vp}`]) R.failures.push(`[${vp}] "Email Verified!" never appeared`);
    txt = await snap(page, `${vp}-06-success`);
    await screenshot(page, SHOTS(shotName(UNIT, vp, '07-success').split('/').pop()));
    R.checks[`db_otp_cleared_after_success_${vp}`] = dbOtp(fxB.email) === 'NULL';
    R.checks[`success_verify_body_matches_otp_${vp}`] =
      net.verify.some(v => { try { return JSON.parse(v.body).otp === fxB.otp && JSON.parse(v.body).email === fxB.email; } catch (e) { return false; } });
    if (!R.checks[`success_verify_body_matches_otp_${vp}`]) R.failures.push(`[${vp}] no verify body carried the correct OTP`);

    // success CTA -> login
    const gl = await clickBtn(page, 'Go to login');
    await page.waitForTimeout(2600);
    txt = await snap(page, `${vp}-07-after-goto-login`);
    R.checks[`goto_login_nav_${vp}`] = gl && (page.url().includes('login') || /Welcome back/.test(txt));
    if (!R.checks[`goto_login_nav_${vp}`]) R.failures.push(`[${vp}] Go to login did not navigate (url=${page.url()})`);
    await screenshot(page, SHOTS(shotName(UNIT, vp, '08-login-after-success').split('/').pop()));
    log(vp, 'main done');
    await closeVideo(ctx, videoPath);
  }

  async function flutterGoback(browser2, vw, vh, vp) {
    const videoPath = OUT(`videos/${UNIT}-${vp}-goback-r2.webm`);
    const ctx = await newCtx(browser2, { viewport: { width: vw, height: vh }, videoPath });
    const page = await ctx.newPage();
    const fx = await makeFixture(`${vp}gb`);
    if (!await openVerify(page, fx.email)) { R.failures.push(`[${vp}] goback: screen never rendered`); await closeVideo(ctx, videoPath); return; }
    await snap(page, `${vp}-08-goback-before`);
    const gb = await clickBtn(page, 'Go back');
    await page.waitForTimeout(2600);
    const t = await snap(page, `${vp}-08-goback-after`);
    R.checks[`go_back_nav_${vp}`] = gb && (page.url().includes('register') || /Create Your Account/.test(t));
    if (!R.checks[`go_back_nav_${vp}`]) R.failures.push(`[${vp}] Go back did not reach register (url=${page.url()})`);
    await screenshot(page, SHOTS(shotName(UNIT, vp, '09-goback-register').split('/').pop()));
    await closeVideo(ctx, videoPath);
  }

  async function flutterExpired(browser2, vw, vh, vp) {
    const videoPath = OUT(`videos/${UNIT}-${vp}-expired-r2.webm`);
    const ctx = await newCtx(browser2, { viewport: { width: vw, height: vh }, videoPath });
    const page = await ctx.newPage();
    const fx = await makeFixture(`${vp}exp`);
    dbExpire(fx.email);
    if (!await openVerify(page, fx.email)) { R.failures.push(`[${vp}] expired: screen never rendered`); await closeVideo(ctx, videoPath); return; }
    await typeCode(page, fx.otp);
    const errT = await waitForText(page, /expired/i, 9000, 250);
    R.checks[`expired_message_${vp}`] = !!errT;
    if (errT) await screenshot(page, SHOTS(shotName(UNIT, vp, '10-expired-message').split('/').pop())); // shoot while banner is up
    const t = await snap(page, `${vp}-10-expired-msg`);
    if (!R.checks[`expired_message_${vp}`]) R.failures.push(`[${vp}] expired message missing; head=${t.slice(0, 140)}`);
    let redirected = false;
    for (let i = 0; i < 14 && !redirected; i++) { await page.waitForTimeout(700); redirected = page.url().includes('register'); }
    const t2 = await snap(page, `${vp}-11-expired-after`);
    R.checks[`expired_redirect_register_${vp}`] = redirected || /Create Your Account/.test(t2);
    if (!R.checks[`expired_redirect_register_${vp}`]) R.failures.push(`[${vp}] no redirect to register after expiry (url=${page.url()})`);
    R.checks[`db_otp_cleared_after_expired_${vp}`] = dbOtp(fx.email) === 'NULL';
    await screenshot(page, SHOTS(shotName(UNIT, vp, '11-expired-register').split('/').pop()));
    log(vp, 'expired done, url=', page.url());
    await closeVideo(ctx, videoPath);
  }

  // ---------------- REFERENCE (:3000) ----------------
  async function refRun(vw, vh, vp) {
    log(`--- reference ${vw}x${vh} ---`);
    const ctx = await newCtx(browser, { viewport: { width: vw, height: vh }, videoPath: OUT(`videos/${UNIT}-${vp}-ref-r2.webm`) });
    const page = await ctx.newPage();
    const inp = page.locator('input:not([id^="search-input"])');
    const bodyTxt = () => page.evaluate(() => document.body.innerText.slice(0, 1600));
    const findBtn = (re) => page.evaluate((src) => {
      const b = [...document.querySelectorAll('button')].find(x => src.test(x.textContent || ''));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), top: Math.round(r.top) };
    }, re);
    // Real-user click: wheel the page up so the control clears the fixed bottom nav, then click coords.
    async function clickRef(re) {
      await page.mouse.move(190, 300);
      await page.mouse.wheel(0, 260);
      await page.waitForTimeout(450);
      const pos = await findBtn(re);
      if (!pos) return false;
      const vh2 = await page.evaluate(() => innerHeight);
      const y = pos.y < vh2 - 70 ? pos.y : vh2 - 90;   // stay above the bottom nav strip
      await page.mouse.click(pos.x, Math.max(20, y));
      await page.waitForTimeout(500);
      return true;
    }

    const fx = await makeFixture(`ref${vp}`);
    await page.goto(`${REF}/verify-email?email=${encodeURIComponent(fx.email)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    let boxes = 0;
    for (let i = 0; i < 30; i++) { await page.waitForTimeout(1000); boxes = await inp.count(); if (boxes >= 6) break; }
    R.checks[`ref_boxes_${vp}`] = boxes;
    let t = await bodyTxt();
    fs.writeFileSync(OUT(`tmp/AU-011-r2-ref-${vp}-01-initial.txt`), t);
    R.checks[`ref_masked_email_${vp}`] = t.includes(fx.email.replace(/^(..).*(@.*)$/, '$1***$2'));
    await screenshot(page, SHOTS(`ref-${vp}-01-initial.png`));

    // ref resend
    if (await clickRef(/Didn't receive the code\? Resend/)) {
      await page.waitForTimeout(1200);
      t = await bodyTxt();
      fs.writeFileSync(OUT(`tmp/AU-011-r2-ref-${vp}-02-resend.txt`), t);
      R.checks[`ref_resend_toast_${vp}`] = /Code Sent!/i.test(t);
      if (!R.checks[`ref_resend_toast_${vp}`]) R.failures.push(`[ref-${vp}] ref Resend toast missing`);
    } else R.failures.push(`[ref-${vp}] could not click ref Resend`);
    await screenshot(page, SHOTS(`ref-${vp}-02-resend.png`));

    // ref wrong code
    await clearRefBoxes(page, inp);
    for (let i = 0; i < 6; i++) { await inp.nth(i).click({ force: true }); await page.keyboard.type(String(i + 1)); await page.waitForTimeout(80); }
    await page.waitForTimeout(400);
    await clickRef(/Confirm email/) || await page.keyboard.press('Enter');
    await page.waitForTimeout(2800);
    t = await bodyTxt();
    fs.writeFileSync(OUT(`tmp/AU-011-r2-ref-${vp}-03-wrong.txt`), t);
    R.checks[`ref_wrong_msg_${vp}`] = /Wrong OTP/i.test(t) || /Verification Failed/i.test(t);
    if (!R.checks[`ref_wrong_msg_${vp}`]) R.failures.push(`[ref-${vp}] ref wrong-code feedback missing`);
    await screenshot(page, SHOTS(`ref-${vp}-03-wrong.png`));

    // ref success with fresh code (web rotates on resend above)
    const fresh = dbOtp(fx.email);
    await clearRefBoxes(page, inp);
    if (/^\d{6}$/.test(fresh)) {
      for (let i = 0; i < 6; i++) { await inp.nth(i).click({ force: true }); await page.keyboard.type(fresh[i]); await page.waitForTimeout(80); }
      await page.waitForTimeout(400);
      await clickRef(/Confirm email/);
      let okr = false;
      for (let i = 0; i < 18 && !okr; i++) { await page.waitForTimeout(800); okr = /Email Verified!/i.test(await bodyTxt()); }
      R.checks[`ref_success_${vp}`] = okr;
      t = await bodyTxt();
      fs.writeFileSync(OUT(`tmp/AU-011-r2-ref-${vp}-04-success.txt`), t);
      await screenshot(page, SHOTS(`ref-${vp}-04-success.png`));
      let redir = false;
      for (let i = 0; i < 12 && !redir; i++) { await page.waitForTimeout(800); redir = /\/login\?.*verified=true/.test(page.url()); }
      R.checks[`ref_success_redirect_login_${vp}`] = redir;
      if (!redir) R.failures.push(`[ref-${vp}] no auto-redirect to /login?verified=true (url=${page.url()})`);
      t = await bodyTxt();
      fs.writeFileSync(OUT(`tmp/AU-011-r2-ref-${vp}-05-after-success.txt`), t);
      await screenshot(page, SHOTS(`ref-${vp}-05-after-success.png`));
    } else R.failures.push(`[ref-${vp}] no usable fresh OTP for ref success leg`);
    log(vp, 'ref done, url=', page.url());
    await closeVideo(ctx, OUT(`videos/${UNIT}-${vp}-ref-r2.webm`));
  }
  async function clearRefBoxes(page, inp) {
    for (let i = 5; i >= 0; i--) {
      await inp.nth(i).click({ force: true });
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(70);
    }
  }

  const browser = await newBrowser();
  try {
    await flutterMain(375, 667, '375');
    await flutterGoback(browser, 375, 667, '375');
    await flutterExpired(browser, 375, 667, '375');
    await flutterMain(768, 1024, '768');
    await flutterGoback(browser, 768, 1024, '768');
    await flutterExpired(browser, 768, 1024, '768');
    await refRun(375, 667, '375');
    await refRun(768, 1024, '768');
  } catch (e) { R.failures.push('run error: ' + e.message); console.error(e); }
  await browser.close();

  R.checks.placeholder_scan_hits = placeholderHits.filter(h => h.hits.length);
  R.net = Object.fromEntries(Object.entries(netByVp).map(([k, v]) => [k, { verify: v.verify.length, send: v.send.length }]));
  R.runtime_ms = Date.now() - t0;
  console.log('RESULTJSON ' + JSON.stringify(R));
})().catch(e => { console.error('FATAL', e); process.exit(3); });
