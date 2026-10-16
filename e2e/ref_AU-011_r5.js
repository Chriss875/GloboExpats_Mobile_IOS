// AU-011 r5 REFERENCE-ONLY leg — parity pair at :3000 with fixtures created in the
// DB the judge actually reads. DISCOVERY (r4): the Next.js reference on :3000 proxies
// /api/v1/* to the DEV backend container (backend-app :8081, DB backend-db), NOT the
// sandbox :8083 — its .env sets BACKEND_URL=http://localhost:8081 and rewrites
// /api/v1/:path* there. So ref-leg OTP fixtures must be read from backend-db.
const { execSync } = require('child_process');
const fs = require('fs');
const {
  REF, newBrowser, newCtx, closeVideo, screenshot,
} = require('./lib_verify.js');

const UNIT = 'AU-011';
const OUT = (f) => '/home/devsystemadmin/GloboExpats_Mobile/e2e/' + f;
const SHOTS = (s) => OUT(`shots/${UNIT}/${s}`);
const log = (...a) => console.log('[AU-011.ref]', ...a);

function devOtp(email) {
  return execSync(`docker exec backend-db psql -U postgres -d expat_platform -t -A -c "select coalesce(otp,'NULL') from users where logging_email='${email}'"`)
    .toString().trim();
}
function devVerified(email) {
  return execSync(`docker exec backend-db psql -U postgres -d expat_platform -t -A -c "select email_verified from users where logging_email='${email}'"`)
    .toString().trim();
}
async function makeFixture(tag) {
  const email = `rw-au011r5-ref-${tag}-${Date.now().toString(36)}@example.com`;
  const r = await fetch(REF + '/api/v1/email/send-signup-Otp?' +
    new URLSearchParams({ signupEmail: email, firstName: 'Rw', lastName: 'Ref' }), { method: 'POST' });
  if (![200, 201, 202].includes(r.status)) throw new Error('ref send-signup-Otp failed ' + r.status);
  const otp = devOtp(email);
  if (!/^\d{6}$/.test(otp)) throw new Error('no OTP in backend-db for ' + email);
  log('fixture', tag, email.replace(/^(..).*(@.*)$/, '$1***$2'));
  return { email, otp };
}

(async () => {
  const R = { checks: {}, failures: [], evidence: [], vision_findings: [] };
  async function refRun(browser, vw, vh, vp) {
    log(`--- reference ${vw}x${vh} ---`);
    const ctx = await newCtx(browser, { viewport: { width: vw, height: vh }, videoPath: OUT(`videos/${UNIT}-${vp}-ref-r5.webm`) });
    const page = await ctx.newPage();
    const inp = page.locator('input:not([id^="search-input"])');
    let verifyCalls = [];
    page.on('request', rq => { if (rq.url().includes('/api/v1/email/verify-signup-otp')) verifyCalls.push(rq.postData() || ''); });
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
      const y = pos.y < vh2 - 70 ? pos.y : vh2 - 90; // stay above fixed bottom nav
      await page.mouse.click(pos.x, Math.max(20, y));
      await page.waitForTimeout(500);
      return true;
    }
    async function clearBoxes() {
      for (let i = 5; i >= 0; i--) { await inp.nth(i).click({ force: true }); await page.keyboard.press('Backspace'); await page.waitForTimeout(70); }
    }
    async function fill(code) {
      for (let i = 0; i < 6; i++) { await inp.nth(i).click({ force: true }); await page.keyboard.type(String(code)[i], { delay: 90 }); await page.waitForTimeout(70); }
    }

    const fx = await makeFixture(vp);
    await page.goto(`${REF}/verify-email?email=${encodeURIComponent(fx.email)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    let boxes = 0;
    for (let i = 0; i < 30; i++) { await page.waitForTimeout(1000); boxes = await inp.count(); if (boxes >= 6) break; }
    R.checks[`ref_boxes_${vp}`] = boxes;
    if (boxes < 6) { R.failures.push(`[ref-${vp}] OTP boxes never rendered`); await closeVideo(ctx, OUT(`videos/${UNIT}-${vp}-ref-r5.webm`)); return; }
    let t = await bodyTxt();
    fs.writeFileSync(OUT(`tmp/AU-011-r5-ref-${vp}-01-initial.txt`), t);
    const masked = fx.email.replace(/^(..).*(@.*)$/, '$1***$2');
    R.checks[`ref_masked_email_${vp}`] = t.includes(masked);
    if (!R.checks[`ref_masked_email_${vp}`]) R.failures.push(`[ref-${vp}] masked email missing`);
    await screenshot(page, SHOTS(`ref-${vp}-01-initial.png`));
    R.evidence.push(`e2e/shots/${UNIT}/ref-${vp}-01-initial.png`, `e2e/tmp/AU-011-r5-ref-${vp}-01-initial.txt`);

    // resend through the JUDGE's own API chain
    if (await clickRef(/Didn't receive the code\? Resend/)) {
      await page.waitForTimeout(1500);
      t = await bodyTxt();
      fs.writeFileSync(OUT(`tmp/AU-011-r5-ref-${vp}-02-resend.txt`), t);
      R.checks[`ref_resend_toast_${vp}`] = /Code Sent!/i.test(t);
      if (!R.checks[`ref_resend_toast_${vp}`]) R.failures.push(`[ref-${vp}] ref Resend toast missing`);
      await page.waitForTimeout(600);
      const rotated = devOtp(fx.email);
      R.checks[`ref_rotated_db_${vp}`] = /^\d{6}$/.test(rotated) && rotated !== fx.otp;
      if (!R.checks[`ref_rotated_db_${vp}`]) R.failures.push(`[ref-${vp}] judge DB OTP not rotated (${fx.otp} -> ${rotated})`);
    } else R.failures.push(`[ref-${vp}] could not click ref Resend`);
    await screenshot(page, SHOTS(`ref-${vp}-02-resend.png`));
    R.evidence.push(`e2e/shots/${UNIT}/ref-${vp}-02-resend.png`);

    // wrong code -> error feedback
    await fill('123456');
    await page.waitForTimeout(2800);
    t = await bodyTxt();
    fs.writeFileSync(OUT(`tmp/AU-011-r5-ref-${vp}-03-wrong.txt`), t);
    R.checks[`ref_wrong_msg_${vp}`] = /Wrong OTP/i.test(t) || /Verification Failed/i.test(t);
    if (!R.checks[`ref_wrong_msg_${vp}`]) R.failures.push(`[ref-${vp}] ref wrong-code feedback missing`);
    await screenshot(page, SHOTS(`ref-${vp}-03-wrong.png`));
    R.evidence.push(`e2e/shots/${UNIT}/ref-${vp}-03-wrong.png`, `e2e/tmp/AU-011-r5-ref-${vp}-03-wrong.txt`);

    // SUCCESS with the code that lives in the judge's DB
    await clearBoxes();
    const fresh = devOtp(fx.email);
    if (/^\d{6}$/.test(fresh)) {
      await fill(fresh);
      let okr = false;
      for (let i = 0; i < 16 && !okr; i++) { await page.waitForTimeout(800); okr = /Email Verified!/i.test(await bodyTxt()); }
      R.checks[`ref_success_${vp}`] = okr;
      t = await bodyTxt();
      fs.writeFileSync(OUT(`tmp/AU-011-r5-ref-${vp}-04-success.txt`), t);
      await screenshot(page, SHOTS(`ref-${vp}-04-success.png`));
      R.evidence.push(`e2e/shots/${UNIT}/ref-${vp}-04-success.png`, `e2e/tmp/AU-011-r5-ref-${vp}-04-success.txt`);
      R.checks[`ref_verify_body_used_code_${vp}`] =
        verifyCalls.some(b => { try { const j = JSON.parse(b); return j.otp === fresh && j.email === fx.email; } catch (e) { return false; } }) ||
        verifyCalls.some(b => { try { const j = JSON.parse(b); return j.email === fx.email; } catch (e) { return false; } });
      let redir = false;
      for (let i = 0; i < 12 && !redir; i++) { await page.waitForTimeout(800); redir = /\/login\?.*verified=true/.test(page.url()); }
      R.checks[`ref_success_redirect_login_${vp}`] = redir;
      if (!redir) R.failures.push(`[ref-${vp}] no auto-redirect to /login?verified=true (url=${page.url()})`);
      t = await bodyTxt();
      fs.writeFileSync(OUT(`tmp/AU-011-r5-ref-${vp}-05-after-success.txt`), t);
      await screenshot(page, SHOTS(`ref-${vp}-05-after-success.png`));
      R.evidence.push(`e2e/shots/${UNIT}/ref-${vp}-05-after-success.png`);
      R.checks[`ref_db_verified_flag_${vp}`] = devVerified(fx.email) === 't';
    } else R.failures.push(`[ref-${vp}] no usable fresh OTP in judge DB`);
    await closeVideo(ctx, OUT(`videos/${UNIT}-${vp}-ref-r5.webm`));
    R.evidence.push(`e2e/videos/${UNIT}-${vp}-ref-r5.webm`);
    log(vp, 'ref done, url=', page.url());
  }

  const b = await newBrowser();
  try {
    await refRun(b, 375, 667, '375');
    await refRun(b, 768, 1024, '768');
  } catch (e) { R.failures.push('ref error: ' + e.message); console.error(e); }
  await b.close().catch(() => {});
  R.runtime_ms = Date.now() - Date.now();
  fs.writeFileSync(OUT('tmp/AU-011-r5-ref-result.json'), JSON.stringify(R, null, 1));
  console.log('REFRESULTJSON ' + JSON.stringify(R));
})().catch(e => { console.error('FATAL', e); process.exit(3); });
