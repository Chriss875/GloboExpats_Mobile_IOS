// AU-011 pass 2 — fill harness gaps: (a) resend toast capture, (b) Go back nav,
// (c) 768 viewport full flow with fresh fixture, (d) expired message assertion fix.
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const {
  REF, API, newBrowser, newCtx, closeVideo, allText,
  btn, clickBtn, listButtons, watchImages, imageSummary, screenshot, shotName, api,
} = require('./lib_verify.js');

const APP9106 = 'http://localhost:9106';
const UNIT = 'AU-011';
const OUT = (f) => path.join('/home/devsystemadmin/GloboExpats_Mobile/e2e', f);
const SHOT = (vp, state) => OUT(shotName(UNIT, vp, state));
const log = (...a) => console.log('[AU-011.2]', ...a);

function dbOtp(email) {
  return execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -t -A -c "select coalesce(otp,'NULL') from users where logging_email='${email}'"`).toString().trim();
}
function expireInDb(email) {
  execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -c "update users set otp_expires_at = now() - interval '1 minute' where logging_email='${email}'"`);
}
async function makeFixture(tag) {
  const email = `rw-au011-${tag}@example.com`;
  const r = await api(null, 'POST', `/api/v1/email/send-signup-Otp?signupEmail=${encodeURIComponent(email)}&firstName=Rw&lastName=Au011`);
  if (![200,201,202].includes(r.status)) throw new Error('send failed '+r.status);
  const otp = dbOtp(email);
  if (!/^\d{6}$/.test(otp)) throw new Error('no otp for '+email);
  return { email, otp };
}
async function openVerify(page, email) {
  await page.goto(`${APP9106}/#/verify-email?email=${encodeURIComponent(email)}`, { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (/Verify your email/.test(await allText(page))) return true; }
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
  const results = { checks: {}, failures: [], evidence: [], images: {} };
  const browser = await newBrowser();
  let netLog = [];
  const verifyCalls = () => netLog.filter(x => x.u.includes('/api/v1/email/verify-signup-otp')).length;
  const sendCalls = () => netLog.filter(x => x.u.includes('/api/v1/email/send-signup-Otp')).length;

  async function fullFlow(vpTag, vw, vh, tagSuffix) {
    const fx = await makeFixture(tagSuffix);           // fresh email each run
    log(vpTag, 'fixture', fx.email, fx.otp);
    netLog = [];
    const videoPath = OUT(`videos/${UNIT}-${vpTag}-p2.webm`);
    const ctx = await newCtx(browser, { viewport: { width: vw, height: vh }, videoPath });
    const page = await ctx.newPage();
    page.on('response', r => netLog.push({ u: r.url(), s: r.status() }));
    const imgs = watchImages(page);
    const R = (k, v, failMsg) => {
      results.checks[`${k}_${vpTag}`] = v;
      if (v === false || v === 0) { if (failMsg) results.failures.push(failMsg); }
      else if (failMsg) results.evidence.push(`${k}[${vpTag}] ok`);
    };

    if (!await openVerify(page, fx.email)) { results.failures.push(`[${vpTag}] screen never rendered`); await closeVideo(ctx, videoPath); return; }
    const masked = fx.email.replace(/^(..).*(@.*)$/, '$1***$2');
    R('masked_email', (await allText(page)).includes(masked), `real_data[${vpTag}]: masked ${masked} missing`);
    R('otp_boxes', await page.locator('input').count() === 6 ? 6 : 0, `otp_boxes[${vpTag}] != 6`);
    await screenshot(page, SHOT(vpTag, '01-initial'));

    // WRONG code
    await typeCode(page, '123456');
    await clickBtn(page, 'Confirm email');
    await page.waitForTimeout(3000);
    R('verify_calls_wrong', verifyCalls(), `verify[${vpTag}]: no verify-signup-otp request`);
    R('no_resend_on_verify', sendCalls() === 0 ? true : false, `verify[${vpTag}]: re-sent OTP during verify`);
    const tWrong = await allText(page);
    fs.writeFileSync(OUT(`tmp/AU-011-a11y-${vpTag}-wrong.txt`), tWrong);
    R('wrong_msg', /Wrong OTP/.test(tWrong), `wrong_msg[${vpTag}]: not surfaced`);
    R('db_otp_intact_after_wrong', /^\d{6}$/.test(dbOtp(fx.email)), `db[${vpTag}]: otp mutated on wrong attempt`);
    await screenshot(page, SHOT(vpTag, '02-wrong-error'));

    // RESEND
    const sBefore = sendCalls(); const oldOtp = dbOtp(fx.email);
    let clicked = false, waitedMs = 0;
    while (!clicked && waitedMs < 80000) {
      clicked = await clickBtn(page, "Didn't receive the code? Resend");
      if (clicked) break;
      const cd = /Resend code in (\d+)s/.exec(await allText(page));
      if (!cd) break;
      await page.waitForTimeout(Math.min(5000, (+cd[1] + 1) * 1000));
      waitedMs += 5100;
    }
    R('resend_clicked', clicked, `resend[${vpTag}]: never clickable within cooldown window`);
    await page.waitForTimeout(2500);
    R('resend_calls', sendCalls() - sBefore, `resend[${vpTag}]: no send-signup-Otp fired`);
    // snackbar lives ~4s; poll fast right after the click
    let toastSeen = false;
    for (let i = 0; i < 8 && !toastSeen; i++) { toastSeen = /Code Sent|new verification code has been sent/i.test(await allText(page)); if (!toastSeen) await page.waitForTimeout(400); }
    // retry once more if missed: click again is blocked by cooldown, so rely on first observation
    R('resend_toast', toastSeen, `resend_toast[${vpTag}]: confirmation not observed`);
    const newOtp = dbOtp(fx.email);
    R('resend_rotated_db', /^\d{6}$/.test(newOtp) && newOtp !== oldOtp, `resend[${vpTag}]: DB otp not rotated (${oldOtp}->${newOtp})`);
    await screenshot(page, SHOT(vpTag, '03-resent'));
    log(vpTag, 'resend done ->', newOtp);

    // SUCCESS with fresh code
    await typeCode(page, newOtp);
    await clickBtn(page, 'Confirm email');
    let success = false;
    for (let i = 0; i < 20 && !success; i++) { await page.waitForTimeout(700); success = /Email Verified!/.test(await allText(page)); }
    R('success_state', success, `success[${vpTag}]: Email Verified! missing`);
    R('db_cleared_after_success', dbOtp(fx.email) === 'NULL', `db[${vpTag}]: otp not cleared after success`);
    await screenshot(page, SHOT(vpTag, '04-success'));
    fs.writeFileSync(OUT(`tmp/AU-011-a11y-${vpTag}-success.txt`), await allText(page));

    // GO BACK control (fresh screen)
    await openVerify(page, fx.email);
    const ctrls = await listButtons(page);
    fs.writeFileSync(OUT(`tmp/AU-011-controls-${vpTag}-p2.json`), JSON.stringify(ctrls, null, 1));
    const gb = await clickBtn(page, 'Go back');
    await page.waitForTimeout(2200);
    const tGb = await allText(page);
    R('go_back_nav', gb && /Create Your Account/.test(tGb), `go_back[${vpTag}]: register not reached (url=${page.url()})`);
    await screenshot(page, SHOT(vpTag, '05-goback-register'));

    results.images[vpTag] = imageSummary(imgs);
    if (results.images[vpTag].failed > 0) results.failures.push(`images[${vpTag}]: failures=${JSON.stringify(results.images[vpTag])}`);
    await closeVideo(ctx, videoPath);
    return fx;
  }

  try {
    await fullFlow('375', 375, 667, 'ok2');
    await fullFlow('768', 768, 1024, 'ok3');
  } catch (e) { results.failures.push('flow error: ' + e.message); console.error(e); }

  // EXPIRED — assert message BEFORE redirect fires (poll fast from t=1.8s)
  try {
    const fx = await makeFixture('expired3');
    expireInDb(fx.email);
    netLog = [];
    const ctx = await newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: OUT(`videos/${UNIT}-expired-p2.webm`) });
    const page = await ctx.newPage();
    if (!await openVerify(page, fx.email)) results.failures.push('expired[p2]: screen never rendered');
    await typeCode(page, fx.otp);
    await clickBtn(page, 'Confirm email');
    let sawMsg = false;
    for (let i = 0; i < 14 && !sawMsg; i++) { sawMsg = /expired/i.test(await allText(page)); if (!sawMsg) await page.waitForTimeout(350); }
    results.checks.expired_message_p2 = sawMsg;
    if (!sawMsg) results.failures.push('expired[p2]: message not captured (may have redirected too fast)');
    await screenshot(page, SHOT('375', '06-expired-message'));
    let redirected = false;
    for (let i = 0; i < 14 && !redirected; i++) { await page.waitForTimeout(700); redirected = /Create Your Account|Continue/.test(await allText(page)) || page.url().includes('register'); }
    results.checks.expired_redirect_p2 = redirected;
    if (!redirected) results.failures.push('expired[p2]: no redirect to register');
    await screenshot(page, SHOT('375', '07-expired-register'));
    fs.writeFileSync(OUT('tmp/AU-011-a11y-expired-p2.txt'), await allText(page));
    log('expired p2 done, url=', page.url());
    await closeVideo(ctx, OUT(`videos/${UNIT}-expired-p2.webm`));
  } catch (e) { results.failures.push('expired p2 error: ' + e.message); console.error(e); }

  await browser.close();
  console.log('RESULTJSON ' + JSON.stringify(results));
})().catch(e => { console.error('FATAL', e); process.exit(3); });
