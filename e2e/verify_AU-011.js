// AU-011 verifier — otp_verify_screen (/verify-email), frozen bundle :9106 (sha 1490456)
// Hash-URL deep link (#/verify-email?email=...) is the app's routing strategy.
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const {
  APP, REF, API, newBrowser, newCtx, closeVideo, allText, waitText,
  btn, clickBtn, listButtons, watchImages, imageSummary,
  screenshot, shotName, api,
} = require('./lib_verify.js');

const APP9106 = 'http://localhost:9106';
const UNIT = 'AU-011';
const OUT = (f) => path.join('/home/devsystemadmin/GloboExpats_Mobile/e2e', f);
const log = (...a) => console.log('[AU-011]', ...a);

function dbOtp(email) {
  const q = `docker exec sandbox-db psql -U postgres -d expat_platform -t -A -c "select coalesce(otp,'NULL') from users where logging_email='${email}'"`;
  return execSync(q).toString().trim();
}
function expireInDb(email) {
  execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -c "update users set otp_expires_at = now() - interval '1 minute' where logging_email='${email}'"`);
}

// RW fixture through the REAL sandbox API; OTP read from sandbox DB (outbox has no SMTP here).
async function makeFixture(tag) {
  const email = `rw-au011-${tag}@example.com`;
  const r = await api(null, 'POST',
    `/api/v1/email/send-signup-Otp?signupEmail=${encodeURIComponent(email)}&firstName=Rw&lastName=Au011`);
  if (![200, 201, 202].includes(r.status)) throw new Error('send-signup-Otp failed ' + r.status);
  const otp = dbOtp(email);
  if (!/^\d{6}$/.test(otp)) throw new Error('no OTP in DB for ' + email);
  return { email, otp };
}

async function openVerify(page, email) {
  await page.goto(`${APP9106}/#/verify-email?email=${encodeURIComponent(email)}`,
    { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    if (/Verify your email/.test(await allText(page))) return true;
  }
  return false;
}
async function typeCode(page, code) {
  for (let i = 0; i < 6; i++) {
    await page.locator('input').nth(i).click({ force: true });
    await page.keyboard.type(code[i]);
    await page.waitForTimeout(90);
  }
}

(async () => {
  const t0 = Date.now();
  const results = { checks: {}, failures: [], evidence: [], images: {} };

  // ---------- FIXTURES ----------
  const wrong = await makeFixture('wrong');
  const expiredFx = await makeFixture('expired');
  const ok = await makeFixture('ok');
  log('fixtures ready:', JSON.stringify({ wrong: wrong.otp, expired: expiredFx.otp, okEmail: ok.email }));

  const browser = await newBrowser();
  let netLog = [];
  const verifyCalls = () => netLog.filter(x => x.u.includes('/api/v1/email/verify-signup-otp'));
  const sendCalls = () => netLog.filter(x => x.u.includes('/api/v1/email/send-signup-Otp'));
  let sendCountAtStart = 0;

  async function runViewport(vw, vh, vpTag) {
    const videoPath = OUT(`videos/${UNIT}-${vpTag}.webm`);
    const ctx = await newCtx(browser, { viewport: { width: vw, height: vh }, videoPath });
    const page = await ctx.newPage();
    page.on('response', (r) => netLog.push({ u: r.url(), s: r.status() }));
    const imgs = watchImages(page);
    sendCountAtStart = sendCalls().length;

    // ---------- STATE 1: initial ----------
    if (!await openVerify(page, ok.email)) {
      results.failures.push(`[${vpTag}] verify-email screen never rendered`);
      await closeVideo(ctx, videoPath); return;
    }
    const masked = ok.email.replace(/^(..).*(@.*)$/, '$1***$2');
    const txt1 = await allText(page);
    fs.writeFileSync(OUT(`tmp/AU-011-a11y-${vpTag}-01-initial.txt`), txt1);
    results.checks[`masked_email_${vpTag}`] = txt1.includes(masked) || txt1.includes("We've emailed a one time security code");
    if (!txt1.includes(masked)) results.failures.push(`real_data[${vpTag}]: masked email "${masked}" not in a11y text`);
    results.checks[`otp_boxes_${vpTag}`] = await page.locator('input').count();
    if (results.checks[`otp_boxes_${vpTag}`] !== 6) results.failures.push(`otp_boxes[${vpTag}]!=6`);
    await screenshot(page, OUT(shotName(UNIT, vpTag, '01-initial')));

    // ---------- STATE 2: WRONG code -> message, no re-send ----------
    await typeCode(page, '123456');           // wrong by construction (auto-submits via onCompleted)
    await page.waitForTimeout(2500);
    await screenshot(page, OUT(shotName(UNIT, vpTag, '02-wrong-typed')));
    await clickBtn(page, 'Confirm email');    // explicit click too
    await page.waitForTimeout(3000);
    const vWrong = verifyCalls().length;
    const sWrong = sendCalls().length;
    const bodyWrong = JSON.stringify([...new Set(netLog.filter(x => x.u.includes('verify-signup-otp')).map(x => JSON.stringify(x)))]);
    results.checks[`verify_calls_wrong_${vpTag}`] = vWrong;
    if (vWrong === 0) results.failures.push(`verify[${vpTag}]: NO /verify-signup-otp request fired (${bodyWrong})`);
    if (sWrong > sendCountAtStart) results.failures.push(`verify[${vpTag}]: Confirm RE-SENT an OTP (${sWrong - sendCountAtStart} sends)`);
    const t2 = await allText(page);
    fs.writeFileSync(OUT(`tmp/AU-011-a11y-${vpTag}-02-wrong.txt`), t2);
    results.checks[`wrong_msg_${vpTag}`] = /Wrong OTP/i.test(t2);
    if (!results.checks[`wrong_msg_${vpTag}`]) results.failures.push(`wrong_msg[${vpTag}]: backend "Wrong OTP" not surfaced; head=${t2.slice(0,160)}`);
    await screenshot(page, OUT(shotName(UNIT, vpTag, '03-wrong-error')));
    results.checks[`db_otp_intact_after_wrong_${vpTag}`] = /^\d{6}$/.test(dbOtp(ok.email));
    log(vpTag, 'wrong-code done: verifies=', vWrong, 'sends=', sWrong);

    // clear boxes before resend test (error state leaves them filled)
    // ---------- STATE 3: RESEND works & rotates the OTP ----------
    const sBefore = sendCalls().length;
    const oldOtp = dbOtp(ok.email);
    let clicked = false, waited = 0;
    while (!clicked && waited < 75000) {
      clicked = await clickBtn(page, "Didn't receive the code? Resend");
      if (clicked) break;
      const cd = /Resend code in (\d+)s/.exec(await allText(page));
      if (!cd) break;
      await page.waitForTimeout(Math.min(5000, (+cd[1] + 1) * 1000));
      waited += 5100;
    }
    results.checks[`resend_clicked_${vpTag}`] = clicked;
    if (!clicked) results.failures.push(`resend[${vpTag}]: Resend control never became clickable`);
    await page.waitForTimeout(2500);
    results.checks[`resend_calls_${vpTag}`] = sendCalls().length - sBefore;
    if (results.checks[`resend_calls_${vpTag}`] < 1) results.failures.push(`resend[${vpTag}]: no send-signup-Otp request after Resend click`);
    const t3 = await allText(page);
    fs.writeFileSync(OUT(`tmp/AU-011-a11y-${vpTag}-03-resend.txt`), t3);
    results.checks[`resend_toast_${vpTag}`] = /Code Sent|new verification code has been sent/i.test(t3);
    if (!results.checks[`resend_toast_${vpTag}`]) results.failures.push(`resend_toast[${vpTag}]: confirmation missing`);
    await screenshot(page, OUT(shotName(UNIT, vpTag, '04-resent')));
    const newOtp = dbOtp(ok.email);
    results.checks[`resend_rotated_db_${vpTag}`] = /^\d{6}$/.test(newOtp) && newOtp !== oldOtp;
    if (!results.checks[`resend_rotated_db_${vpTag}`]) results.failures.push(`resend[${vpTag}]: DB OTP not rotated (${oldOtp} -> ${newOtp})`);
    log(vpTag, 'resend done; rotated otp=', newOtp);

    // ---------- STATE 4: SUCCESS with the fresh code ----------
    await typeCode(page, newOtp);
    await page.waitForTimeout(600);
    await screenshot(page, OUT(shotName(UNIT, vpTag, '05-correct-typed')));
    await clickBtn(page, 'Confirm email');
    let success = false;
    for (let i = 0; i < 20 && !success; i++) { await page.waitForTimeout(700); success = /Email Verified!/.test(await allText(page)); }
    results.checks[`success_state_${vpTag}`] = success;
    if (!success) results.failures.push(`success[${vpTag}]: "Email Verified!" never appeared`);
    results.checks[`db_otp_cleared_after_success_${vpTag}`] = dbOtp(ok.email) === 'NULL';
    fs.writeFileSync(OUT(`tmp/AU-011-a11y-${vpTag}-04-success.txt`), await allText(page));
    await screenshot(page, OUT(shotName(UNIT, vpTag, '06-success')));
    log(vpTag, 'success done');

    // ---------- STATE 5: every remaining control ----------
    // Go back button (present only pre-success): reopen screen
    await openVerify(page, ok.email);
    const ctrlsBefore = await listButtons(page);
    fs.writeFileSync(OUT(`tmp/AU-011-controls-${vpTag}.json`), JSON.stringify(ctrlsBefore, null, 1));
    const gb = await clickBtn(page, 'Go back');
    await page.waitForTimeout(2000);
    const tGb = await allText(page);
    results.checks[`go_back_nav_${vpTag}`] = gb && (/Create Your Account/.test(tGb) || /register/.test(page.url()));
    if (!results.checks[`go_back_nav_${vpTag}`]) results.failures.push(`go_back[${vpTag}]: did not reach register (url=${page.url()})`);
    fs.writeFileSync(OUT(`tmp/AU-011-a11y-${vpTag}-05-goback.txt`), tGb);
    await screenshot(page, OUT(shotName(UNIT, vpTag, '07-goback-register')));

    results.images[vpTag] = imageSummary(imgs);
    log(vpTag, 'images:', JSON.stringify(results.images[vpTag]));
    if (results.images[vpTag].failed > 0) results.failures.push(`images[${vpTag}]: ${results.images[vpTag].failed} failed asset requests`);

    await closeVideo(ctx, videoPath);
  }

  try {
    await runViewport(375, 667, '375');
    netLog = []; sendCountAtStart = 0;
    await runViewport(768, 1024, '768');
  } catch (e) { results.failures.push('viewport-run error: ' + e.message); console.error(e); }

  // ---------- STATE 6: EXPIRED code -> message + redirect to register (375) ----------
  try {
    const ctx = await newCtx(browser, { viewport: { width: 375, height: 667 },
      videoPath: OUT(`videos/${UNIT}-expired.webm`) });
    const page = await ctx.newPage();
    expireInDb(expiredFx.email);
    if (!await openVerify(page, expiredFx.email)) results.failures.push('expired: screen never rendered');
    await typeCode(page, expiredFx.otp);
    await page.waitForTimeout(600);
    await clickBtn(page, 'Confirm email');
    await page.waitForTimeout(3000);
    const tE = await allText(page);
    fs.writeFileSync(OUT('tmp/AU-011-a11y-375-06-expired.txt'), tE);
    results.checks.expired_message = /expired/i.test(tE);
    if (!results.checks.expired_message) results.failures.push('expired: message missing; head=' + tE.slice(0,160));
    await screenshot(page, OUT(shotName(UNIT, '375', '08-expired-message')));
    let redirected = false;
    for (let i = 0; i < 12 && !redirected; i++) {
      await page.waitForTimeout(700);
      redirected = /register|#\/$|\/#\/?$/.test(page.url()) === false ? false : false;
      redirected = page.url().includes('register');
    }
    const tR = await allText(page);
    fs.writeFileSync(OUT('tmp/AU-011-a11y-375-after-expired.txt'), tR);
    results.checks.expired_redirect = redirected || /Create Your Account/.test(tR);
    if (!results.checks.expired_redirect) results.failures.push('expired: no redirect to register; url=' + page.url());
    await screenshot(page, OUT(shotName(UNIT, '375', '09-expired-redirected')));
    log('expired scenario done; url=', page.url());
    await closeVideo(ctx, OUT(`videos/${UNIT}-expired.webm`));
  } catch (e) { results.failures.push('expired-scenario error: ' + e.message); console.error(e); }

  await browser.close();

  fs.writeFileSync(OUT('tmp/AU-011-network.json'), JSON.stringify({ tail: netLog.slice(-40),
    verifyTotal: verifyCalls().length, sendTotal: sendCalls().length }, null, 1));

  results.runtime_ms = Date.now() - t0;
  console.log('RESULTJSON ' + JSON.stringify(results));
})().catch(e => { console.error('FATAL', e); process.exit(3); });
