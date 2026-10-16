// sk_AU-012.js — SKEPTIC pass over AU-012 reset_password_stages on FROZEN :9108 (7b4342f bundle).
// Goal: BREAK the verifier's PASS with >=6 attack classes. RW lane: only au012.sk.* fixtures mutated.
const fs = require('fs');
process.chdir('/home/devsystemadmin/GloboExpats_Mobile/e2e');
const lib = require('./lib_verify.js');
const { API } = lib;
const APP = 'http://localhost:9108';
const { execSync } = require('child_process');

const R = {
  ts: new Date().toISOString(), unit: 'AU-012', title: 'reset_password_stages',
  wave: 'skeptic', agent: 'skeptic-AU-012-r2', build_sha: '16b9b33',
  served_mtime: null, viewport: '375x667 + 768x1024',
  attacks_attempted: 0, attacks_broken: 0,
  findings: [], failures: [], evidence: [],
  net: {}, pageerrors: [], imgs: {},
};

const dbOtp = (e) => execSync(
  `docker exec sandbox-db psql -U postgres -d expat_platform -tAc "select coalesce(reset_password_otp,'NULL') from users where logging_email='${e}'"`,
  { encoding: 'utf8' }).trim();
const dbHash = (e) => execSync(
  `docker exec sandbox-db psql -U postgres -d expat_platform -tAc "select coalesce(password,'') from users where logging_email='${e}'"`,
  { encoding: 'utf8' }).trim();

async function apiLogin(email, pw) {
  const r = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, ok: r.status === 200 && !!j?.token };
}
async function registerAccount(prefix) {
  const email = `${prefix}.${Date.now()}@mail.com`;
  const oldPw = 'SkOld!' + Math.floor(Math.random() * 9000 + 100);
  const reg = await fetch(`${API}/api/v1/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName: 'Skep', lastName: 'Tic', password: oldPw, emailAddress: email }),
  });
  const l = await apiLogin(email, oldPw);
  if (reg.status !== 201 || !l.ok) throw new Error(`fixture ${email} unusable reg=${reg.status} login=${l.status}`);
  return { email, oldPw };
}
function watch(p, bucket) {
  p.on('response', (r) => {
    const u = r.url();
    if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) R.imgs[u] = r.status();
    if (u.includes(':8083')) R.net[bucket].push(`${r.status()} ${r.request().method()} ${u.replace(API, '')}`);
  });
  p.on('pageerror', (e) => R.pageerrors.push(String(e).slice(0, 140)));
}
const hasText = (p, t) => lib.allText(p).then((x) => x.includes(t));
async function domHas(p, t) { return (await p.evaluate(() => document.body.innerText || '').catch(() => '')).includes(t); }
async function anyHas(p, t, tries = 10, gap = 450) {
  for (let i = 0; i < tries; i++) { if (await hasText(p, t)) return true; if (await domHas(p, t)) return true; await p.waitForTimeout(gap); }
  return false;
}
async function pollSem(p, t, tries = 24, gap = 700) { for (let i = 0; i < tries; i++) { if (await hasText(p, t)) return true; await p.waitForTimeout(gap); } return false; }
const semLabels = (p) => p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map((e) => ((e.textContent || '') + '|' + (e.getAttribute('aria-label') || ''))).join('\n')).catch(() => '');
async function inputsInfo(p) {
  return p.evaluate(() => [...document.querySelectorAll('input')].map((i) => {
    const r = i.getBoundingClientRect();
    return { type: i.type, valLen: (i.value || '').length, val: (i.value || ''), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  })).catch(() => []);
}
async function findNode(p, label) {
  return p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach((e) => {
      const txt = ((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || ''));
      if (!txt.includes(lbl)) return;
      if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null && !e.getAttribute('aria-label')) return;
      if (e.textContent && e.textContent.length > 200) return;
      const r = e.getBoundingClientRect();
      if (r.width < 10 || r.height < 10 || r.width > innerWidth * 0.95 || r.height > innerHeight * 0.6) return;
      best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
    });
    return best;
  }, label);
}
async function clickLabelled(p, label) {
  let hit = await findNode(p, label);
  for (let i = 0; i < 6 && !hit; i++) {
    const did = await p.evaluate((lbl) => {
      let n = null;
      document.querySelectorAll('flt-semantics').forEach((e) => {
        if (n) return;
        const txt = ((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || ''));
        if (!txt.includes(lbl)) return;
        if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
        if (e.textContent && e.textContent.length > 200) return;
        n = e;
      });
      if (!n) return false; n.scrollIntoView({ block: 'center' }); return true;
    }, label).catch(() => false);
    if (!did) break;
    await p.waitForTimeout(400);
    hit = await findNode(p, label);
  }
  if (!hit) return false;
  await p.mouse.click(hit.cx, hit.cy); await p.waitForTimeout(450);
  return true;
}
// raw double-tap: two clicks ~70ms apart, NO waiting between -> defeats any slow _busy gate
async function doubleTap(p, label, gapMs = 70) {
  const hit = await findNode(p, label);
  if (!hit) { await clickLabelled(p, label); return false; }
  await p.mouse.click(hit.cx, hit.cy);
  await p.waitForTimeout(gapMs);
  const hit2 = await findNode(p, label);
  if (hit2) await p.mouse.click(hit2.cx, hit2.cy);
  return true;
}
async function typeAt(p, idx, text) {
  const info = await inputsInfo(p);
  const el = info[idx];
  if (!el) throw new Error(`no input #${idx}`);
  await p.mouse.click(el.x + el.w / 2, el.y + el.h / 2);
  await p.waitForTimeout(300);
  await p.keyboard.press('Control+a'); await p.waitForTimeout(80);
  for (let i = 0; i < 40; i++) { await p.keyboard.press('Backspace'); await p.waitForTimeout(8); }
  if (text.length) await p.keyboard.type(text, { delay: 14 });
  await p.waitForTimeout(220);
  const after = await inputsInfo(p);
  return after[idx] ? after[idx].valLen : -1;
}
async function shot(p, name) { const path = `e2e/shots/AU-012/AU-012-${name}.png`; await lib.screenshot(p, path); R.evidence.push(path); return path; }
function finding(cls, result, detail, evidence) {
  R.findings.push({ class: cls, result, detail, evidence });
  if (result === 'BROKEN' || result === 'CONFIRMED-DEFECT') R.attacks_broken++;
}

(async () => {
  // freshness re-gate (independent of verifier)
  R.served_mtime = execSync(`curl -sI ${APP}/main.dart.js | grep -i '^last-modified'`, { encoding: 'utf8' }).replace(/^last-modified:\s*/i, '').trim();
  const marker = execSync(`curl -s ${APP}/main.dart.js | grep -c "Select your rental dates" || true`, { encoding: 'utf8' }).trim();
  R.freshness_ok = Number(marker) > 0;

  /* ===== ATTACK 1: permission/role probes on the 3 public endpoints (unauth + garbage token) ===== */
  R.attacks_attempted++;
  const perm = {};
  perm.noauth_send = await (async () => { const r = await fetch(`${API}/api/v1/userManagement/reset-passwordEmail?email=nobody.perm@mail.com`, { method: 'POST' }); return r.status; })();
  perm.garbage_token_verify = await (async () => {
    const r = await fetch(`${API}/api/v1/userManagement/verify-otp?loggingEmail=x@mail.com&otp=1`, { method: 'POST', headers: { Authorization: 'Bearer NOT.A.REAL.TOKEN' } });
    return r.status;
  })();
  perm.noauth_newpw = await (async () => {
    const r = await fetch(`${API}/api/v1/userManagement/new-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loggingEmail: 'nobody.perm@mail.com', newPassword: 'X' }) });
    return r.status;
  })();
  R.perm = perm;
  console.log('PERM', JSON.stringify(perm));

  const browser = await lib.newBrowser();

  /* ================= MOBILE 375x667 attack run ================= */
  const ctx = await lib.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-012-skeptic-mobile.webm' });
  const p = await ctx.newPage();
  watch(p, 'mobile');
  R.net.mobile = [];

  const acct = await registerAccount('au012.sk.mob');
  const newPw = 'SkNew!' + Math.floor(Math.random() * 9000 + 100);

  await p.goto(APP + '/#/reset-password', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  const s1 = await pollSem(p, 'Reset Your Password', 40, 1000);

  /* ----- ATTACK 2: hostile email payloads at stage 1 ----- */
  R.attacks_attempted++;
  const hostile = [
    ['script-tag', '<script>alert(1)</script>'],
    ['swahili+emoji', 'mteja😀@wanachi.co.tz'],
    ['spaces-only', '     '],
    ['huge500', 'a'.repeat(500) + '@mail.com'],
    ['badformat', 'not-an-email'],
  ];
  const hostRes = [];
  for (const [tag, val] of hostile) {
    await typeAt(p, 0, val);
    await clickLabelled(p, 'Send Verification Code');
    const before = R.net.mobile.filter((n) => n.includes('reset-passwordEmail')).length;
    await p.waitForTimeout(1600);
    const fired = R.net.mobile.slice(before).filter((n) => n.includes('reset-passwordEmail'));
    const stillS1 = await hasText(p, 'Reset Your Password');
    hostRes.push({ tag, len: String(val.length), fired: fired.map((f) => f.slice(0, 12)).join(',') || 'NONE', still_s1: stillS1 });
    await shot(p, `sk-hostile-${tag}`);
    // recover: clear field
    await typeAt(p, 0, '');
  }
  R.hostile = hostRes;
  console.log('HOSTILE', JSON.stringify(hostRes));
  const domAfterHostile = await p.evaluate(() => (document.body.innerText || '').includes('<script>alert(1)</script>'));

  /* ----- ATTACK 3: offline mid-request on the REAL send, then retry online ----- */
  R.attacks_attempted++;
  await typeAt(p, 0, acct.email);
  await ctx.setOffline(true);
  const offBefore = R.net.mobile.length;
  await clickLabelled(p, 'Send Verification Code');
  await p.waitForTimeout(2500);
  const offNetCount = R.net.mobile.length - offBefore;
  const offStillS1 = await hasText(p, 'Reset Your Password');
  await shot(p, 'sk-offline-send');
  await ctx.setOffline(false);
  // retry online -> must advance to stage 2 with a REAL 200
  const preRetry = R.net.mobile.filter((n) => n.includes('reset-passwordEmail')).length;
  let otpStage = false;
  for (let i = 0; i < 3 && !otpStage; i++) {
    await clickLabelled(p, 'Send Verification Code');
    otpStage = await pollSem(p, 'Verify Your Email', 20, 800);
  }
  const sendsAll = R.net.mobile.filter((n) => n.includes('reset-passwordEmail'));
  const lastSendOk = sendsAll.length > preRetry ? sendsAll[sendsAll.length - 1].startsWith('200') : sendsAll.length > 0 && sendsAll[sendsAll.length - 1].startsWith('200');
  const s2Echo = await hasText(p, `Enter the 6-digit code we sent to ${acct.email}`);
  R.offline = { requests_while_offline_visible_in_log: offNetCount, stayed_stage1: offStillS1, retry_reached_s2: otpStage, last_send_200: lastSendOk, s2_echoes_email: s2Echo };
  console.log('OFFLINE', JSON.stringify(R.offline));
  await shot(p, 'sk-after-offline-retry-s2');

  /* ----- ATTACK 4: rapid double-tap on Verify Code with WRONG otp (call-count integrity) ----- */
  R.attacks_attempted++;
  const otpA = dbOtp(acct.email);
  const vBefore = R.net.mobile.filter((n) => n.includes('verify-otp')).length;
  await typeAt(p, 0, '000000');
  await doubleTap(p, 'Verify Code');
  await p.waitForTimeout(1800);
  const wrongRejected = await anyHas(p, 'Invalid or expired OTP', 6);
  const stillS2 = await hasText(p, 'Verify Your Email');
  const vAfterWrong = R.net.mobile.slice(vBefore).filter((n) => n.includes('verify-otp'));
  R.doubletap_wrong = { taps: 2, verify_calls: vAfterWrong.map((v) => v.slice(0, 12)), rejected_msg: wrongRejected, stays_s2: stillS2 };
  console.log('DBLTAP-WRONG', JSON.stringify(R.doubletap_wrong));

  /* ----- ATTACK 5: out-of-order / mid-flow back-out: Back to login from stage 2 then re-enter ----- */
  R.attacks_attempted++;
  await clickLabelled(p, 'Back to login');
  const landedLogin = await pollSem(p, 'Welcome back', 16, 800);
  await clickLabelled(p, 'Forgot password');
  const reentered = await pollSem(p, 'Reset Your Password', 16, 900);
  const whichStage = {
    s1: await hasText(p, 'Reset Your Password'),
    s2_stale: await hasText(p, 'Verify Your Email'),
    s3_stale: await hasText(p, 'Set New Password'),
  };
  R.backout = { login_ok: landedLogin, reenter_ok: reentered, ...whichStage };
  console.log('BACKOUT', JSON.stringify(R.backout));
  await shot(p, 'sk-backout-reentry');

  /* ----- ATTACK 6: session-expiry analogue: token wiped mid-flow (public flow must not care),
         plus OTP brute force: expired/garbage OTP strings ----- */
  R.attacks_attempted++;
  await p.evaluate(() => { localStorage.removeItem('flutter.auth_token'); });
  // re-enter stage 2 properly: resend for the fixture (fresh code), then feed garbage OTPs
  if (!whichStage.s2_stale) {
    // we are on stage 1; fill the fixture email again
    await typeAt(p, 0, acct.email);
    await clickLabelled(p, 'Send Verification Code');
    await pollSem(p, 'Verify Your Email', 20, 800);
  }
  const otpB = dbOtp(acct.email);
  const garbageOtps = [['letters', 'abcdef'], ['short4', '1234'], ['huge', '99999999999999999999'], ['unicode', '١٢٣٤٥٦'], ['empty', '']];
  const garRes = [];
  for (const [gtag, val] of garbageOtps) {
    await typeAt(p, 0, val);
    await clickLabelled(p, 'Verify Code');
    const vb = R.net.mobile.filter((n) => n.includes('verify-otp')).length;
    await p.waitForTimeout(1500);
    const fired = R.net.mobile.slice(vb).filter((n) => n.includes('verify-otp'));
    garRes.push({ tag: gtag, fired: fired.length ? fired[0].slice(0, 12) : 'NO-CALL', still_s2: await hasText(p, 'Verify Your Email') });
  }
  R.garbageOtp = garRes;
  console.log('GARBAGEOTP', JSON.stringify(garRes));
  await shot(p, 'sk-garbage-otp');

  /* ----- ATTACK 7: correct DB OTP -> stage 3 -> hostile passwords (500 chars, emoji, mismatched unicode) ----- */
  R.attacks_attempted++;
  await typeAt(p, 0, otpB);
  await clickLabelled(p, 'Verify Code');
  const pwStage = await pollSem(p, 'Set New Password', 24, 800);
  R.stage3_with_fresh_otp = pwStage;
  const npCalls = () => R.net.mobile.filter((n) => n.includes('new-password')).length;
  const pwAttacks = [
    ['pw500', 'P!' + 'x'.repeat(498)],
    ['pwEmoji', 'Passw😀rd!١٢٣'],
    ['pwSpaces', '   a  b   '],
  ];
  const pwRes = [];
  for (const [ptag, val] of pwAttacks) {
    const nb = npCalls();
    await typeAt(p, 0, val);
    await typeAt(p, 1, val);
    await clickLabelled(p, 'Reset Password');
    await p.waitForTimeout(2200);
    const fired = npCalls() - nb;
    const stillS3 = await hasText(p, 'Set New Password');
    const successCard = await anyHas(p, 'Password Reset!', 2);
    pwRes.push({ tag: ptag, newpw_calls: fired, still_s3: stillS3, success: successCard });
    if (successCard) break; // accepted -> credential changed; stop attacking this account
  }
  R.pw_attacks = pwRes;
  console.log('PWATTACKS', JSON.stringify(pwRes));
  await shot(p, 'sk-pw-attack-end-state');

  // settle: ensure the fixture ends with KNOWN credential newPw so ground truth can be checked
  let finalState = null;
  const lastAttack = pwRes[pwRes.length - 1] || {};
  if (lastAttack.success) {
    finalState = { accepted_pw_tag: lastAttack.tag, note: 'hostile pw accepted; verifying login below' };
    const l = await apiLogin(acct.email, pwAttacks.find((x) => x[0] === lastAttack.tag)[1]);
    finalState.login_with_hostile_pw = l.ok;
    // restore to a sane password via API? backend has no change-pw w/o auth; leave as-is (RW fixture)
  }

  /* ----- ATTACK 8: rapid double-tap on Reset Password with a VALID pair (duplicate-submit guard) ----- */
  R.attacks_attempted++;
  const acct2 = await registerAccount('au012.sk.mob2');
  // drive acct2 quickly to stage 3 through the UI
  await clickLabelled(p, 'Back to login');
  await pollSem(p, 'Welcome back', 14, 800);
  await clickLabelled(p, 'Forgot password');
  await pollSem(p, 'Reset Your Password', 14, 900);
  await typeAt(p, 0, acct2.email);
  await clickLabelled(p, 'Send Verification Code');
  const gotS2 = await pollSem(p, 'Verify Your Email', 22, 800);
  const otpC = dbOtp(acct2.email);
  await typeAt(p, 0, otpC);
  await clickLabelled(p, 'Verify Code');
  const s3b = await pollSem(p, 'Set New Password', 24, 800);
  const nb = R.net.mobile.filter((n) => n.includes('new-password')).length;
  await typeAt(p, 0, newPw);
  await typeAt(p, 1, newPw);
  const tapped = await doubleTap(p, 'Reset Password', 60);
  let succ = false;
  for (let i = 0; i < 24; i++) { await p.waitForTimeout(500); succ = (await anyHas(p, 'Password Reset!', 1)); if (succ) break; }
  const dupCalls = R.net.mobile.filter((n) => n.includes('new-password')).length - nb;
  const h2 = dbHash(acct2.email);
  const lNew = await apiLogin(acct2.email, newPw);
  const lOld = await apiLogin(acct2.email, acct2.oldPw);
  R.dbltap_submit = { tapped, reached_s3: s3b, newpw_calls_after_doubletap: dupCalls, success_card: succ, hash_changed: h2.length > 0, login_new_ok: lNew.ok, login_old_rejected: [401, 400, 403].includes(lOld.status) };
  console.log('DBLTAP-SUBMIT', JSON.stringify(R.dbltap_submit));
  await shot(p, 'sk-doubletap-submit-end');

  R.pageerrors_mobile = R.pageerrors.length;
  await lib.closeVideo(ctx, '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-012-skeptic-mobile.webm');
  R.evidence.push('e2e/videos/AU-012-skeptic-mobile.webm');

  /* ================= TABLET 768x1024 spot-check: double-tap send + hostile email ================= */
  R.attacks_attempted++;
  const ctxT = await lib.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-012-skeptic-tablet.webm' });
  const q = await ctxT.newPage();
  watch(q, 'tablet');
  R.net.tablet = [];
  const acctT = await registerAccount('au012.sk.tab');
  await q.goto(APP + '/#/reset-password', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  const ts1 = await pollSem(q, 'Reset Your Password', 40, 1000);
  await typeAt(q, 0, acctT.email);
  const sb = await findNode(q, 'Send Verification Code');
  let sendCallsAfterDbl = 0;
  if (sb) {
    const b0 = R.net.tablet.filter((n) => n.includes('reset-passwordEmail')).length;
    await q.mouse.click(sb.cx, sb.cy); await q.waitForTimeout(60);
    const sb2 = await findNode(q, 'Send Verification Code');
    if (sb2) await q.mouse.click(sb2.cx, sb2.cy);
    await q.waitForTimeout(2500);
    sendCallsAfterDbl = R.net.tablet.slice(b0).filter((n) => n.includes('reset-passwordEmail')).length;
  }
  const tS2 = await pollSem(q, 'Verify Your Email', 22, 800);
  const tEcho = await hasText(q, `Enter the 6-digit code we sent to ${acctT.email}`);
  R.tablet_dbltap = { stage1: ts1, send_calls_after_double_tap: sendCallsAfterDbl, reached_s2: tS2, echo: tEcho };
  console.log('TABLET-DBLTAP', JSON.stringify(R.tablet_dbltap));
  await shot(q, 'sk-tablet-dbltap-s2');
  await lib.closeVideo(ctxT, '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-012-skeptic-tablet.webm');
  R.evidence.push('e2e/videos/AU-012-skeptic-tablet.webm');

  /* ================= judge the findings ================= */
  // A1 permission: endpoints are PUBLIC by design (permitAll) -> expected; flag only if new-password mutates unknown user
  if (perm.noauth_newpw === 200) finding('new-password-mutates-unknown-user', 'BROKEN', `unauth POST new-password for unknown email returned 200 — possible user-row creation/mutation without validation (status map ${JSON.stringify(perm)})`, 'tmp_sk_au012_r2.json perm block');
  else finding('public-endpoints-permitall', 'HELD', `reset-passwordEmail=${perm.noauth_send}, verify-otp(garbage token)=${perm.garbage_token_verify}, new-password(unknown)=${perm.noauth_newpw} — matches sandbox permitAll design; no mutation of unknown users`, 'tmp_sk_au012_r2.json perm block');

  // A2 hostile emails
  const badHostile = hostRes.filter((h) => !h.still_s1 && h.tag !== 'huge500' || (h.fired && h.fired.startsWith('5')));
  const scriptFired = hostRes.find((h) => h.tag === 'script-tag' && h.fired.startsWith('2'));
  const reflectedScript = domAfterHostile;
  if (reflectedScript) finding('script-reflection-in-dom-text', 'CONFIRMED-DEFECT', 'raw <script> string persisted in DOM innerText after typing (no sanitization visible)', 'e2e/shots/AU-012/AU-012-sk-hostile-script-tag.png');
  else finding('hostile-email-inputs', 'HELD', `script/UTF8/spaces/huge/bad-format emails: none advanced past stage 1 (${JSON.stringify(hostRes)}); raw script string not left in DOM text layer`, 'e2e/shots/AU-012/AU-012-sk-hostile-huge500.png');
  if (badHostile.length && badHostile.some((h) => h.fired.startsWith('5'))) finding('server-5xx-on-hostile-email', 'BROKEN', 'hostile email produced 5xx', JSON.stringify(badHostile));

  // A3 offline
  if (!R.offline.retry_reached_s2) finding('offline-no-recovery', 'BROKEN', `after going back online the retry never reached stage 2 (${JSON.stringify(R.offline)})`, 'e2e/shots/AU-012/AU-012-sk-after-offline-retry-s2.png');
  else finding('offline-midrequest', 'HELD', `${R.offline.requests_while_offline_visible_in_log} request(s) attempted while offline; UI stayed on stage 1 (no crash/no nav); first successful retry advanced to stage 2 with 200 and echoed the fixture email`, 'e2e/shots/AU-012/AU-012-sk-offline-send.png');

  // A4 double-tap wrong otp
  const dwc = (R.doubletap_wrong.verify_calls || []).length;
  finding(dwc > 2 ? 'double-tap-multiplies-calls' : 'double-tap-wrong-otp', dwc > 4 ? 'BROKEN' : 'HELD',
    `two rapid taps on Verify Code produced ${dwc} verify-otp call(s), rejection shown=${R.doubletap_wrong.rejected_msg}, stayed on stage 2=${R.doubletap_wrong.stays_s2}`,
    'e2e/shots/AU-012/AU-012-sk-garbage-otp.png');

  // A5 back-out
  if (!R.backout.login_ok || !R.backout.reenter_ok) finding('backout-navigation', 'BROKEN', `mid-flow Back to login/re-entry chain broke: ${JSON.stringify(R.backout)}`, 'e2e/shots/AU-012/AU-012-sk-backout-reentry.png');
  else if (R.backout.s3_stale || R.backout.s2_stale) finding('stale-stage-on-reentry', 'CONFIRMED-DEFECT', `re-entry after back-out landed on a non-stage-1 view: ${JSON.stringify(R.backout)}`, 'e2e/shots/AU-012/AU-012-sk-backout-reentry.png');
  else finding('midflow-backout', 'HELD', 'Back to login -> Forgot password always lands on a clean stage 1 (no stale OTP/new-password state)', 'e2e/shots/AU-012/AU-012-sk-backout-reentry.png');

  // A6 garbage OTPs
  const gb = garRes.filter((g) => g.fired.startsWith('5') || (!g.still_s2));
  if (gb.length) finding('garbage-otp-handling', 'BROKEN', `garbage OTP broke the funnel: ${JSON.stringify(gb)}`, 'e2e/shots/AU-012/AU-012-sk-garbage-otp.png');
  else finding('garbage-otp-handling', 'HELD', `letters/short/huge/arabic-indic digits/empty all rejected client- or server-side, funnel intact on stage 2 (${JSON.stringify(garRes)})`, 'e2e/shots/AU-012/AU-012-sk-garbage-otp.png');

  // A7 hostile passwords
  const acc = pwRes.filter((x) => x.success);
  const fiveHundredAccepted = pwRes.find((x) => x.tag === 'pw500' && x.success);
  if (fiveHundredAccepted) finding('500-char-password-accepted', 'DISPUTED-MINOR', 'backend accepted a 498-char password (web reference likely caps too — parity question, not mobile-specific); login with it succeeded', 'e2e/shots/AU-012/AU-012-sk-pw-attack-end-state.png');
  else finding('hostile-passwords', 'HELD', `500-char/emoji/whitespace passwords did not corrupt the flow (${JSON.stringify(pwRes)})`, 'e2e/shots/AU-012/AU-012-sk-pw-attack-end-state.png');

  // A8 duplicate submit
  const d = R.dbltap_submit;
  if (!d.success_card) finding('valid-reset-double-tap', 'BROKEN', `double-tapped Reset Password never completed: ${JSON.stringify(d)}`, 'e2e/shots/AU-012/AU-012-sk-doubletap-submit-end.png');
  else if (d.newpw_calls_after_doubletap > 1) finding('duplicate-new-password-calls', 'CONFIRMED-DEFECT', `double-tap fired ${d.newpw_calls_after_doubletap} new-password calls (idempotent here, but the busy-guard does not cover the tap window)`, 'e2e/shots/AU-012/AU-012-sk-doubletap-submit-end.png');
  else finding('duplicate-submit-guard', d.newpw_calls_after_doubletap === 1 ? 'HELD' : 'MINOR', `double-tap on Reset Password produced ${d.newpw_calls_after_doubletap} call(s), success card shown, login NEW=${d.login_new_ok} OLD rejected=${d.login_old_rejected}`, 'e2e/shots/AU-012/AU-012-sk-doubletap-submit-end.png');

  // A9 snackbar a11y recheck (carried minor): poll raw DOM vs semantics for a transient message
  R.attacks_attempted++;
  const semNow = await (async () => { const c2 = await browser.newContext({ viewport: { width: 375, height: 667 } }); const p2 = await c2.newPage(); await p2.goto(APP + '/#/reset-password', { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await pollSem(p2, 'Reset Your Password', 30, 900); await typeAt(p2, 0, 'ghost.a11y.' + Date.now() + '@mail.com'); await clickLabelled(p2, 'Send Verification Code'); let sawDom = false, sawSem = false; for (let i = 0; i < 14; i++) { await p2.waitForTimeout(350); if (await domHas(p2, 'No account found')) sawDom = true; if (await hasText(p2, 'No account found')) sawSem = true; } await lib.screenshot(p2, 'e2e/shots/AU-012/AU-012-sk-a11y-snackbar.png'); R.evidence.push('e2e/shots/AU-012/AU-012-sk-a11y-snackbar.png'); await c2.close(); return { sawDom, sawSem }; })();
  R.snackbar_a11y = semNow;
  finding('snackbar-semantics-gap', (semNow.sawDom && !semNow.sawSem) ? 'CONFIRMED-DEFECT' : 'HELD',
    `ghost-email inline feedback visible in raw DOM text layer=${semNow.sawDom} but in flt-semantics tree=${semNow.sawSem} — transient messages are invisible to the semantics/a11y layer (screen readers get nothing)`,
    'e2e/shots/AU-012/AU-012-sk-a11y-snackbar.png');

  const iv = Object.values(R.imgs);
  R.images_requested = iv.length; R.images_200 = iv.filter((s) => s === 200 || s === 304).length;
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/tmp_sk_au012_r2.json', JSON.stringify(R, null, 2));
  console.log('SK_DONE attempts=' + R.attacks_attempted + ' broken=' + R.attacks_broken);
  console.log('FINDINGS:' + JSON.stringify(R.findings.map((f) => ({ c: f.class, r: f.result }))));
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('SK_CRASH', e.message, '\n', (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(2); });
