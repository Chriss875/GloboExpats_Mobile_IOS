// AU-011 verifier r4 — otp_verify_screen (/verify-email), frozen bundle :9108
// sha 16b9b33, main.dart.js mtime 2026-08-24T00:36:38Z (asserted before run).
//
// r4 fixes over r3 (harness bugs, not app bugs):
//  - hash-only page.goto does NOT remount /verify-email with the new ?email=
//    (fixture B leg was verifying against fixture A's account) -> every stage
//    now runs in its OWN context/page.
//  - resend DB-rotation compared post-resend values on BOTH sides -> now
//    compares against the fixture-creation OTP.
//  - "Code Sent!" snackbar is NOT exposed in flt-semantics (a11y gap) -> poll
//    document.body.innerText (caught live in probe5).
//  - ref legs crashed when the long-lived browser died -> separate browsers
//    per lane group.
const fs = require('fs');
const { execSync } = require('child_process');
const {
  REF, API, newBrowser, newCtx, closeVideo, allText,
  btn, clickBtn, listButtons, watchImages, imageSummary,
  screenshot,
} = require('./lib_verify.js');

const UNIT = 'AU-011';
const APP = 'http://localhost:9108'; // frozen verify bundle (lib_verify's APP stays :9100)
const OUT = (f) => '/home/devsystemadmin/GloboExpats_Mobile/e2e/' + f;
const SHOTS = (s) => OUT(`shots/${UNIT}/${s}`);
const log = (...a) => console.log('[AU-011.r4]', ...a);

function dbOtp(email) {
  return execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -t -A -c "select coalesce(otp,'NULL') from users where lower(logging_email)=lower('${email}')"`)
    .toString().trim();
}
function dbVerified(email) {
  return execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -t -A -c "select email_verified from users where lower(logging_email)=lower('${email}')"`)
    .toString().trim();
}
function dbExpire(email) {
  execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -c "update users set otp_expires_at = now() - interval '1 minute' where lower(logging_email)=lower('${email}')"`);
}
async function makeFixture(tag) {
  const email = `rw-au011r4-${tag}-${Date.now().toString(36)}@example.com`;
  const r = await fetch(API + '/api/v1/email/send-signup-Otp?' +
    new URLSearchParams({ signupEmail: email, firstName: 'Rw', lastName: 'Au011r4' }), { method: 'POST' });
  if (![200, 201, 202].includes(r.status)) throw new Error('send-signup-Otp failed ' + r.status);
  const otp = dbOtp(email);
  if (!/^\d{6}$/.test(otp)) throw new Error('no OTP in sandbox DB for ' + email);
  log('fixture', tag, email.replace(/^(..).*(@.*)$/, '$1***$2'));
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
async function typeCode(page, code, step = 110) {
  const n = Math.min(6, String(code).length);
  for (let i = 0; i < n; i++) {
    await page.locator('input').nth(i).click({ force: true });
    await page.keyboard.type(String(code)[i]);
    await page.waitForTimeout(step);
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
async function waitForBody(page, re, ms, step = 150) {
  const dl = Date.now() + ms;
  while (Date.now() < dl) {
    const t = await page.evaluate(() => document.body.innerText || '');
    if (re.test(t)) return t.match(re)[0];
    await page.waitForTimeout(step);
  }
  return null;
}

(async () => {
  const lm = execSync('curl -sI http://localhost:9108/main.dart.js').toString();
  if (!/last-modified:\s*Mon, 24 Aug 2026 00:36:38 GMT/i.test(lm)) {
    console.error('FATAL: bundle not the frozen build:', lm.trim()); process.exit(4);
  }
  log('bundle freshness OK (16b9b33 @ 2026-08-24T00:36:38Z)');

  const t0 = Date.now();
  const R = { checks: {}, failures: [], evidence: [], vision_findings: [], parity: { blocker: 0, major: 0, minor: 0, accepted: 0 } };
  const netByVp = {};
  let placeholderHits = [];
  async function snap(page, name) {
    const t = await allText(page);
    fs.writeFileSync(OUT(`tmp/AU-011-r4-${name}.txt`), t);
    const m = t.match(/lorem|placeholder|dummy|TODO|coming soon/gi);
    if (m) placeholderHits.push({ name, hits: [...new Set(m)] });
    return t;
  }

  // ---------- STAGE A: wrong code + explicit-guard + resend ----------
  async function stageWrongResend(browser, vw, vh, vp) {
    log(`--- ${vp} stageA wrong/resend ---`);
    const videoPath = OUT(`videos/${UNIT}-${vp}-r4.webm`);
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

    const fx = await makeFixture(`${vp}a`);
    if (!await openVerify(page, fx.email)) {
      R.failures.push(`[${vp}] stageA: verify-email screen never rendered`);
      await closeVideo(ctx, videoPath); return;
    }
    let txt = await snap(page, `${vp}-01-initial`);
    const masked = fx.email.replace(/^(..).*(@.*)$/, '$1***$2');
    R.checks[`masked_email_${vp}`] = txt.includes(masked);
    if (!R.checks[`masked_email_${vp}`]) R.failures.push(`[${vp}] REAL DATA: masked email "${masked}" absent`);
    R.checks[`otp_boxes_${vp}`] = await page.locator('input').count();
    if (R.checks[`otp_boxes_${vp}`] !== 6) R.failures.push(`[${vp}] expected 6 OTP boxes`);
    R.checks[`cooldown_text_${vp}`] = /Resend code in \d+s/.test(txt);
    await screenshot(page, SHOTS(`${UNIT}-${vp}-01-initial.png`));
    R.evidence.push(`e2e/shots/${UNIT}/${UNIT}-${vp}-01-initial.png`, `e2e/tmp/AU-011-r4-${vp}-01-initial.txt`);

    // controls snapshot + disabled guard
    fs.writeFileSync(OUT(`tmp/AU-011-r4-controls-${vp}.json`), JSON.stringify(await listButtons(page), null, 1));
    let dis = await page.evaluate(() => {
      const el = [...document.querySelectorAll('flt-semantics[role="button"]')]
        .find(e => (e.textContent || '').includes('Confirm email'));
      return el ? el.getAttribute('aria-disabled') : 'ABSENT';
    });
    R.checks[`confirm_disabled_empty_${vp}`] = dis;
    if (dis !== 'true') R.failures.push(`[${vp}] Confirm not disabled with empty code (${dis})`);
    await clickBtn(page, 'Confirm email');
    await page.waitForTimeout(1000);
    R.checks[`empty_confirm_no_net_${vp}`] = net.verify.length === 0 && net.send.length === 0;
    if (!R.checks[`empty_confirm_no_net_${vp}`]) R.failures.push(`[${vp}] disabled Confirm fired network calls`);

    // partial code -> still guarded, click fires nothing
    await typeCode(page, '12345');
    dis = await page.evaluate(() => {
      const el = [...document.querySelectorAll('flt-semantics[role="button"]')]
        .find(e => (e.textContent || '').includes('Confirm email'));
      return el ? el.getAttribute('aria-disabled') : 'ABSENT';
    });
    R.checks[`confirm_disabled_partial_${vp}`] = dis;
    if (dis !== 'true') R.failures.push(`[${vp}] Confirm not disabled with 5-digit code (${dis})`);
    await clickBtn(page, 'Confirm email');
    await page.waitForTimeout(900);
    R.checks[`partial_click_no_net_${vp}`] = net.verify.length === 0;
    if (!R.checks[`partial_click_no_net_${vp}`] && net.verify.length > 0) {
      // some builds auto-submit on complete only; a call here would mean premature fire
      R.failures.push(`[${vp}] Confirm click with 5-digit code fired verify`);
    }
    await screenshot(page, SHOTS(`${UNIT}-${vp}-02-confirm-partial.png`));
    R.evidence.push(`e2e/shots/${UNIT}/${UNIT}-${vp}-02-confirm-partial.png`);

    // complete the code (6th digit) -> auto-submit carries the ENTERED code
    await page.locator('input').nth(5).click({ force: true });
    await page.keyboard.type('6');
    const hitWrong = await waitForText(page, /Wrong OTP/i, 9000, 300);
    txt = await snap(page, `${vp}-03-wrong`);
    await screenshot(page, SHOTS(`${UNIT}-${vp}-03-wrong-typed.png`));
    R.evidence.push(`e2e/shots/${UNIT}/${UNIT}-${vp}-03-wrong-typed.png`);
    R.checks[`verify_calls_${vp}`] = net.verify.length;
    R.checks[`verify_body_entered_code_${vp}`] =
      net.verify.length === 1 && (() => { try { const b = JSON.parse(net.verify[0].body); return b.otp === '123456' && b.email === fx.email; } catch (e) { return false; } })();
    if (!R.checks[`verify_body_entered_code_${vp}`]) R.failures.push(`[${vp}] verify bodies: ${JSON.stringify(net.verify)}`);
    R.checks[`no_resend_on_verify_${vp}`] = net.send.length === 0;
    if (!R.checks[`no_resend_on_verify_${vp}`]) R.failures.push(`[${vp}] Verify RE-SENT an OTP`);
    R.checks[`wrong_msg_${vp}`] = !!hitWrong && /Wrong OTP/i.test(txt);
    if (!R.checks[`wrong_msg_${vp}`]) R.failures.push(`[${vp}] "Wrong OTP" not surfaced; head=${txt.slice(0, 140)}`);
    R.checks[`db_otp_intact_after_wrong_${vp}`] = /^\d{6}$/.test(dbOtp(fx.email));
    txt = await snap(page, `${vp}-04-wrong-settled`);
    await screenshot(page, SHOTS(`${UNIT}-${vp}-04-wrong-error.png`));
    R.evidence.push(`e2e/shots/${UNIT}/${UNIT}-${vp}-04-wrong-error.png`);

    // RESEND after the 60s cooldown -> send-signup-Otp + Code Sent! + DB rotation
    let cdClicked = false, waitedMs = 0;
    while (!cdClicked && waitedMs < 85000) {
      cdClicked = await clickBtn(page, "Didn't receive the code? Resend");
      if (cdClicked) break;
      const m = /Resend code in (\d+)s/.exec(await allText(page));
      if (!m) break;
      await page.waitForTimeout(Math.min(6000, (+m[1] + 1) * 1000));
      waitedMs += 6100;
    }
    R.checks[`resend_clicked_${vp}`] = cdClicked;
    if (!cdClicked) R.failures.push(`[${vp}] Resend never clickable within 85s`);
    else {
      const toast = await waitForBody(page, /Code Sent![^\n]*/, 6000, 150);
      R.checks[`resend_toast_dom_${vp}`] = !!toast;
      if (toast) fs.writeFileSync(OUT(`tmp/AU-011-r4-${vp}-resend-toast.txt`), toast);
      else R.failures.push(`[${vp}] "Code Sent!" toast not captured in DOM innerText`);
      // cooldown restarted?
      const cdTxt = await allText(page);
      R.checks[`cooldown_restarted_${vp}`] = /Resend code in \d+s/.test(cdTxt);
    }
    R.checks[`resend_network_${vp}`] = net.send.length >= 1;
    if (!R.checks[`resend_network_${vp}`]) R.failures.push(`[${vp}] Resend produced no send-signup-Otp request`);
    const otpPost = dbOtp(fx.email);
    R.checks[`resend_rotated_db_${vp}`] = /^\d{6}$/.test(otpPost) && otpPost !== fx.otp;
    if (!R.checks[`resend_rotated_db_${vp}`]) R.failures.push(`[${vp}] DB OTP not rotated by Resend (${fx.otp} -> ${otpPost})`);
    await page.waitForTimeout(2500); // let toast expire before the shot
    txt = await snap(page, `${vp}-05-resend`);
    await screenshot(page, SHOTS(`${UNIT}-${vp}-05-resent.png`));
    R.evidence.push(`e2e/shots/${UNIT}/${UNIT}-${vp}-05-resent.png`);
    R.images = R.images || {}; R.images[vp] = imageSummary(imgs);
    await closeVideo(ctx, videoPath);
    R.evidence.push(`e2e/videos/${UNIT}-${vp}-r4.webm`);
    log(vp, 'stageA done');
  }

  // ---------- STAGE B: SUCCESS with the real code ----------
  async function stageSuccess(browser, vw, vh, vp) {
    log(`--- ${vp} stageB success ---`);
    const videoPath = OUT(`videos/${UNIT}-${vp}-success-r4.webm`);
    const ctx = await newCtx(browser, { viewport: { width: vw, height: vh }, videoPath });
    const page = await ctx.newPage();
    const net = { verify: [] };
    page.on('request', (rq) => {
      if (rq.url().includes('/api/v1/email/verify-signup-otp')) net.verify.push({ body: rq.postData() || '' });
    });
    const fx = await makeFixture(`${vp}b`);
    if (!await openVerify(page, fx.email)) {
      R.failures.push(`[${vp}] stageB: screen never rendered`); await closeVideo(ctx, videoPath); return;
    }
    await typeCode(page, fx.otp);
    await page.waitForTimeout(500);
    await screenshot(page, SHOTS(`${UNIT}-${vp}-06-correct-typed.png`));
    R.evidence.push(`e2e/shots/${UNIT}/${UNIT}-${vp}-06-correct-typed.png`);
    const okT = await waitForText(page, /Email Verified!/i, 12000, 400);
    R.checks[`success_state_${vp}`] = !!okT;
    if (!R.checks[`success_state_${vp}`]) R.failures.push(`[${vp}] "Email Verified!" never appeared`);
    const txt = await snap(page, `${vp}-06-success`);
    await screenshot(page, SHOTS(`${UNIT}-${vp}-07-success.png`));
    R.evidence.push(`e2e/shots/${UNIT}/${UNIT}-${vp}-07-success.png`, `e2e/tmp/AU-011-r4-${vp}-06-success.txt`);
    R.checks[`db_otp_cleared_after_success_${vp}`] = dbOtp(fx.email) === 'NULL';
    R.checks[`db_email_verified_flag_${vp}`] = dbVerified(fx.email) === 't';
    if (!R.checks[`db_email_verified_flag_${vp}`]) R.failures.push(`[${vp}] users.email_verified != true (${dbVerified(fx.email)})`);
    R.checks[`success_body_matches_otp_${vp}`] =
      net.verify.some(v => { try { const b = JSON.parse(v.body); return b.otp === fx.otp && b.email === fx.email; } catch (e) { return false; } });
    if (!R.checks[`success_body_matches_otp_${vp}`]) R.failures.push(`[${vp}] no verify body carried the correct OTP`);

    if (R.checks[`success_state_${vp}`]) {
      const gl = await clickBtn(page, 'Go to login');
      await page.waitForTimeout(2600);
      const t2 = await snap(page, `${vp}-07-after-goto-login`);
      R.checks[`goto_login_nav_${vp}`] = gl && (page.url().includes('login') || /Welcome back/.test(t2));
      if (!R.checks[`goto_login_nav_${vp}`]) R.failures.push(`[${vp}] Go to login did not navigate (url=${page.url()})`);
      await screenshot(page, SHOTS(`${UNIT}-${vp}-08-login-after-success.png`));
      R.evidence.push(`e2e/shots/${UNIT}/${UNIT}-${vp}-08-login-after-success.png`);
    }
    await closeVideo(ctx, videoPath);
    R.evidence.push(`e2e/videos/${UNIT}-${vp}-success-r4.webm`);
    log(vp, 'stageB done');
  }

  async function stageGoback(browser, vw, vh, vp) {
    const videoPath = OUT(`videos/${UNIT}-${vp}-goback-r4.webm`);
    const ctx = await newCtx(browser, { viewport: { width: vw, height: vh }, videoPath });
    const page = await ctx.newPage();
    const fx = await makeFixture(`${vp}gb`);
    if (!await openVerify(page, fx.email)) { R.failures.push(`[${vp}] goback: screen never rendered`); await closeVideo(ctx, videoPath); return; }
    await snap(page, `${vp}-08-goback-before`);
    const gb = await clickBtn(page, 'Go back');
    await page.waitForTimeout(2600);
    const t = await snap(page, `${vp}-08-goback-after`);
    R.checks[`go_back_nav_${vp}`] = gb && (page.url().includes('register') || /Create Your Account/.test(t));
    if (!R.checks[`go_back_nav_${vp}`]) R.failures.push(`[${vp}] Go back did not reach register (url=${page.url()})`);
    await screenshot(page, SHOTS(`${UNIT}-${vp}-09-goback-register.png`));
    R.evidence.push(`e2e/shots/${UNIT}/${UNIT}-${vp}-09-goback-register.png`, `e2e/videos/${UNIT}-${vp}-goback-r4.webm`);
    await closeVideo(ctx, videoPath);
  }

  async function stageExpired(browser, vw, vh, vp) {
    const videoPath = OUT(`videos/${UNIT}-${vp}-expired-r4.webm`);
    const ctx = await newCtx(browser, { viewport: { width: vw, height: vh }, videoPath });
    const page = await ctx.newPage();
    const net = { verify: [] };
    page.on('request', (rq) => { if (rq.url().includes('/api/v1/email/verify-signup-otp')) net.verify.push(rq.postData() || ''); });
    const fx = await makeFixture(`${vp}exp`);
    dbExpire(fx.email);
    if (!await openVerify(page, fx.email)) { R.failures.push(`[${vp}] expired: screen never rendered`); await closeVideo(ctx, videoPath); return; }
    await typeCode(page, fx.otp);
    const errT = await waitForText(page, /expired/i, 9000, 250);
    R.checks[`expired_message_${vp}`] = !!errT;
    await screenshot(page, SHOTS(`${UNIT}-${vp}-10-expired-message.png`));
    R.evidence.push(`e2e/shots/${UNIT}/${UNIT}-${vp}-10-expired-message.png`);
    const t = await snap(page, `${vp}-10-expired-msg`);
    if (!R.checks[`expired_message_${vp}`]) R.failures.push(`[${vp}] expired message missing; head=${t.slice(0, 140)}`);
    let redirected = false;
    for (let i = 0; i < 14 && !redirected; i++) { await page.waitForTimeout(700); redirected = page.url().includes('register'); }
    const t2 = await snap(page, `${vp}-11-expired-after`);
    R.checks[`expired_redirect_register_${vp}`] = redirected || /Create Your Account/.test(t2);
    if (!R.checks[`expired_redirect_register_${vp}`]) R.failures.push(`[${vp}] no redirect to register after expiry (url=${page.url()})`);
    R.checks[`db_otp_cleared_after_expired_${vp}`] = dbOtp(fx.email) === 'NULL';
    R.checks[`expired_verify_called_with_code_${vp}`] =
      net.verify.some(b => { try { return JSON.parse(b).otp === fx.otp && JSON.parse(b).email === fx.email; } catch (e) { return false; } });
    await screenshot(page, SHOTS(`${UNIT}-${vp}-11-expired-register.png`));
    R.evidence.push(`e2e/shots/${UNIT}/${UNIT}-${vp}-11-expired-register.png`, `e2e/videos/${UNIT}-${vp}-expired-r4.webm`);
    await closeVideo(ctx, videoPath);
    log(vp, 'expired done, url=', page.url());
  }

  // ---------------- REFERENCE (:3000) ----------------
  async function refRun(browser, vw, vh, vp) {
    log(`--- reference ${vw}x${vh} ---`);
    const ctx = await newCtx(browser, { viewport: { width: vw, height: vh }, videoPath: OUT(`videos/${UNIT}-${vp}-ref-r4.webm`) });
    const page = await ctx.newPage();
    const inp = page.locator('input:not([id^="search-input"])');
    const bodyTxt = () => page.evaluate(() => document.body.innerText.slice(0, 1600));
    const findBtn = (re) => page.evaluate((src) => {
      const b = [...document.querySelectorAll('button')].find(x => src.test(x.textContent || ''));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }, re);
    async function clickRef(re) {
      await page.mouse.move(190, 300);
      await page.mouse.wheel(0, 260);
      await page.waitForTimeout(450);
      const pos = await findBtn(re);
      if (!pos) return false;
      const vh2 = await page.evaluate(() => innerHeight);
      const y = pos.y < vh2 - 70 ? pos.y : vh2 - 90;
      await page.mouse.click(pos.x, Math.max(20, y));
      await page.waitForTimeout(500);
      return true;
    }
    async function clearRefBoxes() {
      for (let i = 5; i >= 0; i--) { await inp.nth(i).click({ force: true }); await page.keyboard.press('Backspace'); await page.waitForTimeout(70); }
    }

    const fx = await makeFixture(`ref${vp}`);
    await page.goto(`${REF}/verify-email?email=${encodeURIComponent(fx.email)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    let boxes = 0;
    for (let i = 0; i < 30; i++) { await page.waitForTimeout(1000); boxes = await inp.count(); if (boxes >= 6) break; }
    R.checks[`ref_boxes_${vp}`] = boxes;
    let t = await bodyTxt();
    fs.writeFileSync(OUT(`tmp/AU-011-r4-ref-${vp}-01-initial.txt`), t);
    R.checks[`ref_masked_email_${vp}`] = t.includes(fx.email.replace(/^(..).*(@.*)$/, '$1***$2'));
    await screenshot(page, SHOTS(`ref-${vp}-01-initial.png`));
    R.evidence.push(`e2e/shots/${UNIT}/ref-${vp}-01-initial.png`);

    if (await clickRef(/Didn't receive the code\? Resend/)) {
      await page.waitForTimeout(1200);
      t = await bodyTxt();
      fs.writeFileSync(OUT(`tmp/AU-011-r4-ref-${vp}-02-resend.txt`), t);
      R.checks[`ref_resend_toast_${vp}`] = /Code Sent!/i.test(t);
      if (!R.checks[`ref_resend_toast_${vp}`]) R.failures.push(`[ref-${vp}] ref Resend toast missing`);
    } else R.failures.push(`[ref-${vp}] could not click ref Resend`);
    await screenshot(page, SHOTS(`ref-${vp}-02-resend.png`));
    R.evidence.push(`e2e/shots/${UNIT}/ref-${vp}-02-resend.png`);

    await clearRefBoxes();
    for (let i = 0; i < 6; i++) { await inp.nth(i).click({ force: true }); await page.keyboard.type(String(i + 1)); await page.waitForTimeout(80); }
    await page.waitForTimeout(400);
    await clickRef(/Confirm email/) || await page.keyboard.press('Enter');
    await page.waitForTimeout(2800);
    t = await bodyTxt();
    fs.writeFileSync(OUT(`tmp/AU-011-r4-ref-${vp}-03-wrong.txt`), t);
    R.checks[`ref_wrong_msg_${vp}`] = /Wrong OTP/i.test(t) || /Verification Failed/i.test(t);
    if (!R.checks[`ref_wrong_msg_${vp}`]) R.failures.push(`[ref-${vp}] ref wrong-code feedback missing`);
    await screenshot(page, SHOTS(`ref-${vp}-03-wrong.png`));
    R.evidence.push(`e2e/shots/${UNIT}/ref-${vp}-03-wrong.png`);

    const fresh = dbOtp(fx.email);
    await clearRefBoxes();
    if (/^\d{6}$/.test(fresh)) {
      for (let i = 0; i < 6; i++) { await inp.nth(i).click({ force: true }); await page.keyboard.type(fresh[i]); await page.waitForTimeout(80); }
      await page.waitForTimeout(400);
      await clickRef(/Confirm email/);
      let okr = false;
      for (let i = 0; i < 18 && !okr; i++) { await page.waitForTimeout(800); okr = /Email Verified!/i.test(await bodyTxt()); }
      R.checks[`ref_success_${vp}`] = okr;
      t = await bodyTxt();
      fs.writeFileSync(OUT(`tmp/AU-011-r4-ref-${vp}-04-success.txt`), t);
      await screenshot(page, SHOTS(`ref-${vp}-04-success.png`));
      R.evidence.push(`e2e/shots/${UNIT}/ref-${vp}-04-success.png`);
      let redir = false;
      for (let i = 0; i < 12 && !redir; i++) { await page.waitForTimeout(800); redir = /\/login\?.*verified=true/.test(page.url()); }
      R.checks[`ref_success_redirect_login_${vp}`] = redir;
      if (!redir) R.failures.push(`[ref-${vp}] no auto-redirect to /login?verified=true (url=${page.url()})`);
      t = await bodyTxt();
      fs.writeFileSync(OUT(`tmp/AU-011-r4-ref-${vp}-05-after-success.txt`), t);
      await screenshot(page, SHOTS(`ref-${vp}-05-after-success.png`));
      R.evidence.push(`e2e/shots/${UNIT}/ref-${vp}-05-after-success.png`);
    } else R.failures.push(`[ref-${vp}] no usable fresh OTP for ref success leg`);
    await closeVideo(ctx, OUT(`videos/${UNIT}-${vp}-ref-r4.webm`));
    R.evidence.push(`e2e/videos/${UNIT}-${vp}-ref-r4.webm`);
    log(vp, 'ref done, url=', page.url());
  }

  // lanes in separate browsers (r3 crashed a long-lived browser mid-run)
  const bFlut375 = await newBrowser();
  try {
    await stageWrongResend(bFlut375, 375, 667, '375');
    await stageSuccess(bFlut375, 375, 667, '375');
    await stageGoback(bFlut375, 375, 667, '375');
    await stageExpired(bFlut375, 375, 667, '375');
  } catch (e) { R.failures.push('flutter375 error: ' + e.message); console.error(e); }
  await bFlut375.close().catch(() => {});

  const bFlut768 = await newBrowser();
  try {
    await stageWrongResend(bFlut768, 768, 1024, '768');
    await stageSuccess(bFlut768, 768, 1024, '768');
    await stageGoback(bFlut768, 768, 1024, '768');
    await stageExpired(bFlut768, 768, 1024, '768');
  } catch (e) { R.failures.push('flutter768 error: ' + e.message); console.error(e); }
  await bFlut768.close().catch(() => {});

  const bRef = await newBrowser();
  try {
    await refRun(bRef, 375, 667, '375');
    await refRun(bRef, 768, 1024, '768');
  } catch (e) { R.failures.push('ref error: ' + e.message); console.error(e); }
  await bRef.close().catch(() => {});

  R.checks.placeholder_scan_hits = placeholderHits.filter(h => h.hits.length);
  R.net = Object.fromEntries(Object.entries(netByVp).map(([k, v]) => [k, { verify: v.verify.length, send: v.send.length }]));
  R.runtime_ms = Date.now() - t0;
  fs.writeFileSync(OUT('tmp/AU-011-r4-result.json'), JSON.stringify(R, null, 1));
  console.log('RESULTJSON ' + JSON.stringify(R));
})().catch(e => { console.error('FATAL', e); process.exit(3); });
