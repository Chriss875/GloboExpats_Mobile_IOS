// probe_au012_r2map.js — map semantics controls at every reset-password stage (mobile vp)
// Diagnostic only: dumps control lists + screenshots; creates ONE throwaway fixture via real API.
const fs = require('fs');
process.chdir('/home/devsystemadmin/GloboExpats_Mobile/e2e');
const lib = require('./lib_verify.js');
const { API } = lib;
const APP = 'http://localhost:9108';
const { execSync } = require('child_process');
const SH = 'e2e/shots/AU-012';

const dbOtp = (email) => execSync(
  `docker exec sandbox-db psql -U postgres -d expat_platform -tAc "select coalesce(reset_password_otp,'NULL') from users where logging_email='${email}'"`,
  { encoding: 'utf8' }).trim();

(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-012-r2-probe.webm' });
  const p = await ctx.newPage();
  const net = [];
  p.on('response', (r) => { if (r.url().includes(':8083')) net.push(`${r.status()} ${r.request().method()} ${r.url().replace(API, '')}`); });

  // fixture
  const email = `au012.r2probe.${Date.now()}@mail.com`;
  const oldPw = 'ProbeOld!' + Math.floor(Math.random() * 9000 + 1000);
  const reg = await fetch(`${API}/api/v1/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName: 'P', lastName: 'R2', password: oldPw, emailAddress: email }) });
  const loginOk = await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: oldPw }) });
  console.log('FIXTURE', email, 'reg=' + reg.status, 'login=' + loginOk.status);

  await p.goto(APP + '/#/reset-password', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await lib.waitText(p, 'Reset Your Password', 40000);
  await p.waitForTimeout(2500);
  console.log('== S1 CONTROLS =='); console.log(JSON.stringify(await lib.listButtons(p)));
  await lib.screenshot(p, `${SH}/probe-r2-01-s1.png`);

  // type email
  const ei = p.locator('input[type="text"]').first();
  await ei.click({ force: true, timeout: 15000 }); await p.waitForTimeout(350);
  await p.keyboard.type(email, { delay: 25 });
  await lib.screenshot(p, `${SH}/probe-r2-02-s1-filled.png`);

  // send
  let sent = await lib.clickBtn(p, 'Send Verification Code').catch(() => false);
  console.log('send clicked:', sent);
  let s2 = false;
  for (let i = 0; i < 30 && !s2; i++) { s2 = await lib.waitText(p, 'Verify Your Email', 1000); }
  console.log('STAGE2 REACHED:', s2);
  await p.waitForTimeout(1500);
  console.log('== S2 CONTROLS =='); console.log(JSON.stringify(await lib.listButtons(p)));
  console.log('S2 TEXT:', JSON.stringify((await lib.allText(p)).slice(0, 600)));
  await lib.screenshot(p, `${SH}/probe-r2-03-s2.png`);
  const otp1 = dbOtp(email);
  console.log('DB OTP round1:', otp1);

  // resend
  const before = otp1;
  await lib.clickBtn(p, "Didn't receive the code? Resend");
  let otp2 = before;
  for (let i = 0; i < 14; i++) { await p.waitForTimeout(600); otp2 = dbOtp(email); if (/^\d+$/.test(otp2) && otp2 !== before) break; }
  console.log('OTP after resend:', otp2);
  await p.waitForTimeout(800);
  await lib.screenshot(p, `${SH}/probe-r2-04-after-resend.png`);

  // change email address
  let ch = await lib.clickBtn(p, 'Change Email Address').catch(() => false);
  console.log('change-email clicked:', ch);
  let s1back = await lib.waitText(p, 'Reset Your Password', 12000);
  console.log('BACK ON S1:', s1back);
  await p.waitForTimeout(900);
  console.log('S1 text after change-email:', JSON.stringify((await lib.allText(p)).slice(0, 300)));
  // go forward again
  if (!s1back) { await p.goto(APP + '/#/reset-password', { waitUntil: 'load' }); await lib.waitText(p, 'Reset Your Password', 30000); await p.waitForTimeout(1500); }
  const eiVal = await p.evaluate(() => { const i = document.querySelector('input'); return i ? i.value : null; }).catch(() => null);
  console.log('email input value retained:', eiVal);
  if (eiVal !== email) {
    const e2 = p.locator('input[type="text"]').first();
    await e2.click({ force: true }); await p.waitForTimeout(250);
    await p.keyboard.press('Control+a'); for (let i = 0; i < 30; i++) { await p.keyboard.press('Backspace'); await p.waitForTimeout(12); }
    await p.keyboard.type(email, { delay: 22 });
  }
  await lib.clickBtn(p, 'Send Verification Code');
  let s2b = false;
  for (let i = 0; i < 30 && !s2b; i++) s2b = await lib.waitText(p, 'Verify Your Email', 1000);
  console.log('RE-ENTRY S2:', s2b);
  await p.waitForTimeout(1200);
  const otp3 = dbOtp(email);
  console.log('OTP round3:', otp3);

  // WRONG otp first
  const wrong = otp3 === '000000' ? '111111' : '000000';
  const oi = p.locator('input').first();
  await oi.click({ force: true }); await p.waitForTimeout(250);
  await p.keyboard.type(wrong, { delay: 25 });
  await lib.clickBtn(p, 'Verify Code');
  let wmsg = false;
  for (let i = 0; i < 16; i++) {
    await p.waitForTimeout(500);
    const dom = await p.evaluate(() => document.body.innerText || '').catch(() => '');
    const sem = await lib.allText(p);
    wmsg = dom.includes('Invalid or expired OTP') || sem.includes('Invalid or expired OTP') || dom.includes('Wrong OTP') || sem.includes('Wrong OTP');
    if (wmsg) break;
  }
  console.log('WRONG OTP REJECTED:', wmsg, '| still s2:', await lib.waitText(p, 'Verify Your Email', 3000));
  await lib.screenshot(p, `${SH}/probe-r2-05-wrong-otp.png`);

  // CORRECT otp -> stage 3
  const oi2 = p.locator('input').first();
  await oi2.click({ force: true }); await p.waitForTimeout(200);
  await p.keyboard.press('Control+a');
  for (let i = 0; i < 10; i++) { await p.keyboard.press('Backspace'); await p.waitForTimeout(15); }
  await p.keyboard.type(otp3, { delay: 25 });
  await lib.clickBtn(p, 'Verify Code');
  let s3 = false;
  for (let i = 0; i < 30 && !s3; i++) s3 = await lib.waitText(p, 'Set New Password', 1000);
  console.log('STAGE3 REACHED:', s3);
  await p.waitForTimeout(1500);
  console.log('== S3 CONTROLS =='); console.log(JSON.stringify(await lib.listButtons(p)));
  console.log('S3 TEXT:', JSON.stringify((await lib.allText(p)).slice(0, 500)));
  await lib.screenshot(p, `${SH}/probe-r2-06-s3.png`);

  // dump input elements info at stage 3
  console.log('INPUTS AT S3:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ type: i.type, w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height), x: Math.round(i.getBoundingClientRect().x), y: Math.round(i.getBoundingClientRect().y) })))));

  // type new pw into first password input
  const npw = 'NewPw!' + Math.floor(Math.random() * 9000 + 1000);
  const pi = p.locator('input[type="password"]').first();
  await pi.click({ force: true, timeout: 15000 }).catch(async (e) => { console.log('pw click failed', e.message); });
  await p.waitForTimeout(300);
  await p.keyboard.type(npw, { delay: 25 });
  const ci = p.locator('input[type="password"]').nth(1);
  await ci.click({ force: true, timeout: 15000 }); await p.waitForTimeout(300);
  await p.keyboard.type(npw, { delay: 25 });
  await lib.screenshot(p, `${SH}/probe-r2-07-pw-filled.png`);
  console.log('inputs after typing:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ type: i.type, val: (i.value || '').length })))));

  // submit
  const rpClicked = await lib.clickBtn(p, 'Reset Password').catch(() => false);
  console.log('reset-password clicked:', rpClicked);
  let success = false;
  for (let i = 0; i < 26; i++) { await p.waitForTimeout(500); const t = await lib.allText(p); const dom = await p.evaluate(() => document.body.innerText || '').catch(() => ''); success = t.includes('Password Reset!') || dom.includes('Password Reset!'); if (success) break; }
  console.log('SUCCESS CARD:', success);
  console.log('NET TAIL:', JSON.stringify(net.slice(-6)));
  await p.waitForTimeout(1200);
  await lib.screenshot(p, `${SH}/probe-r2-08-success-or-fail.png`);
  const hash = (em) => execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -tAc "select coalesce(password,'') from users where logging_email='${em}'"`, { encoding: 'utf8' }).trim();
  console.log('HASH NOW:', hash(email).slice(0, 14));
  const lNew = await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: npw }) });
  const lOld = await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: oldPw }) });
  console.log('LOGIN NEW:', lNew.status, ' LOGIN OLD:', lOld.status);

  await lib.closeVideo(ctx, '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-012-r2-probe.webm');
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/tmp_au012_probe_fixture.json', JSON.stringify({ email, oldPw, newPw: npw }));
  await browser.close();
})().catch((e) => { console.error('CRASH', e.message); process.exit(1); });
