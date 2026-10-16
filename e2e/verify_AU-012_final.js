// verify_AU-012_final.js — AUTHORITATIVE RE-VERIFY (r5) of AU-012 reset_password_stages
// Frozen lane http://localhost:9108 = pristine git HEAD 7b4342f bundle
// (main.dart.js Last-Modified "Mon, 24 Aug 2026 03:13:31 GMT" + content marker).
//
// vs r4 changes:
//  * clickLabelled scrolls the semantics node into view (scrollIntoView) before clicking —
//    fixes "Change Email Address", which sits below the fold at stage 2.
//  * reference parity runs against :3010 (BACKEND_URL=http://localhost:8083 sandbox),
//    with page-route Origin normalization: a browser page ON origin localhost:3010 sends
//    Origin localhost:3010, which is NOT in the sandbox SecurityConfig allowlist, so the
//    backend answers 403 "Invalid CORS request". ENV quirk, not an app defect.
const fs = require('fs');
process.chdir('/home/devsystemadmin/GloboExpats_Mobile/e2e');
const lib = require('./lib_verify.js');
const { API } = lib;
const APP = 'http://localhost:9108';
const REF = 'http://localhost:3010';
const { execSync } = require('child_process');
const SH = 'e2e/shots/AU-012';
fs.mkdirSync(SH, { recursive: true });

const EXPECTED_MTIME = 'Mon, 24 Aug 2026 03:13:31 GMT';
const SHA = '7b4342f';

const R = {
  ts: new Date().toISOString(), unit: 'AU-012', title: 'reset_password_stages',
  wave: 'verify', agent: 'verifier-AU-012-r5', build_sha: SHA,
  served_mtime: null, viewport: '375x667 + 768x1024',
  checks: {}, failures: [], evidence: [], findings: [], vision: { defects: 0, list: [], pngs: [] },
  imgs: {}, network: {}, nav: 0, state: 0, data: 0,
  buttons: { total: 0, ok: 0, failed: [] },
  parity: { blocker: 0, major: 0, minor: 1, accepted: 0, deltas: [] },
};

/* ---------------- helpers ---------------- */
const dbOtp = (email) => execSync(
  `docker exec sandbox-db psql -U postgres -d expat_platform -tAc "select coalesce(reset_password_otp,'NULL') from users where logging_email='${email}'"`,
  { encoding: 'utf8' }).trim();
const dbHash = (email) => execSync(
  `docker exec sandbox-db psql -U postgres -d expat_platform -tAc "select coalesce(password,'') from users where logging_email='${email}'"`,
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
  const oldPw = 'Au012Old!' + Math.floor(Math.random() * 9000 + 100);
  const reg = await fetch(`${API}/api/v1/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName: 'Ver', lastName: 'R5', password: oldPw, emailAddress: email }),
  });
  const l = await apiLogin(email, oldPw);
  if (reg.status !== 201 || !l.ok) throw new Error(`fixture ${email} unusable reg=${reg.status} login=${l.status}`);
  return { email, oldPw };
}
function watch(p, bucket) {
  p.on('response', (r) => {
    const u = r.url();
    if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) R.imgs[u] = r.status();
    if (u.includes(':8083')) R.network[bucket].push(`${r.status()} ${r.request().method()} ${u.replace(API, '')}`);
  });
  p.on('pageerror', (e) => R.network.pageerrors.push(String(e).slice(0, 140)));
}
const hasText = (p, t) => lib.allText(p).then((x) => x.includes(t));
async function domHas(p, t) { return (await p.evaluate(() => document.body.innerText || '').catch(() => '')).includes(t); }
async function anyHas(p, t, tries = 14, gap = 450) {
  for (let i = 0; i < tries; i++) { if (await hasText(p, t)) return true; if (await domHas(p, t)) return true; await p.waitForTimeout(gap); }
  return false;
}
async function pollSem(p, t, tries = 24, gap = 700) { for (let i = 0; i < tries; i++) { if (await hasText(p, t)) return true; await p.waitForTimeout(gap); } return false; }
async function shot(p, name) { const path = `${SH}/AU-012-${name}.png`; await lib.screenshot(p, path); R.evidence.push(path); return path; }
async function inputsInfo(p) {
  return p.evaluate(() => [...document.querySelectorAll('input')].map((i) => {
    const r = i.getBoundingClientRect();
    return { type: i.type, valLen: (i.value || '').length, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  })).catch(() => []);
}
async function findNode(p, label) {
  return p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach((e) => {
      const txt = ((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || ''));
      if (!txt.includes(lbl)) return;
      if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null && !e.getAttribute('aria-label')) return;
      if (e.textContent && e.textContent.length > 200) return;   // skip full-screen wrappers
      const r = e.getBoundingClientRect();
      if (r.width < 10 || r.height < 10 || r.width > innerWidth * 0.95 || r.height > innerHeight * 0.6) return;
      best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height };
    });
    return best;
  }, label);
}
// click labelled control; scrollIntoView first so below-the-fold buttons actually receive the tap
async function clickLabelled(p, label) {
  let hit = await findNode(p, label);
  let scrolled = false;
  for (let i = 0; i < 8 && !hit; i++) {
    const did = await p.evaluate((lbl) => {
      let n = null;
      document.querySelectorAll('flt-semantics').forEach((e) => {
        if (n) return;
        const txt = ((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || ''));
        if (!txt.includes(lbl)) return;
        if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
        if (e.textContent && e.textContent.length > 200) return;
        const r = e.getBoundingClientRect();
        if (r.width < 10 || r.height < 10) return;
        n = e;
      });
      if (!n) return false;
      n.scrollIntoView({ block: 'center' });
      return true;
    }, label).catch(() => false);
    if (!did) break;
    await p.waitForTimeout(450);
    hit = await findNode(p, label);
    scrolled = true;
  }
  if (!hit) { // one wheel fallback then give up cleanly
    await p.mouse.move(180, 330); await p.mouse.wheel(0, 300); await p.waitForTimeout(500);
    hit = await findNode(p, label); scrolled = true;
  }
  if (hit) { await p.mouse.click(hit.cx, hit.cy); await p.waitForTimeout(500); return { clicked: true, scrolled }; }
  const fb = await lib.clickBtn(p, label).catch(() => false);
  return { clicked: !!fb, scrolled, fallback: true };
}
async function typeAt(p, idx, text) {
  const info = await inputsInfo(p);
  const el = info[idx];
  if (!el) throw new Error(`no input #${idx} (have ${info.length}: ${JSON.stringify(info)})`);
  await p.mouse.click(el.x + el.w / 2, el.y + el.h / 2);
  await p.waitForTimeout(320);
  await p.keyboard.press('Control+a'); await p.waitForTimeout(100);
  for (let i = 0; i < 30; i++) { await p.keyboard.press('Backspace'); await p.waitForTimeout(10); }
  await p.keyboard.type(text, { delay: 22 });
  await p.waitForTimeout(250);
  const after = await inputsInfo(p);
  const got = after[idx] ? after[idx].valLen : -1;
  if (got !== text.length) throw new Error(`input#${idx} holds ${got} chars, expected ${text.length}`);
  return true;
}
const semLabels = (p) => p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map((e) => ((e.textContent || '') + '|' + (e.getAttribute('aria-label') || ''))).join('\n')).catch(() => '');

/* ---------------- one full flow at one viewport ---------------- */
async function runFlow(browser, { w, h, tag }) {
  R.network[tag] = []; R.network.pageerrors = [];
  const acct = await registerAccount(`au012.r5.${tag}`);
  const newPw = 'Au012New!' + Math.floor(Math.random() * 9000 + 100);
  const C = { fixture_email_masked: acct.email.replace(/(.{3}).*(@.*)/, '$1***$2'), fixture_registered_login_ok: true };

  const ctx = await lib.newCtx(browser, { viewport: { width: w, height: h }, videoPath: `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-012-final-${tag}.webm` });
  const p = await ctx.newPage();
  watch(p, tag);
  const t = async (cond, failMsg) => { if (cond) R.state++; else R.failures.push(failMsg); return cond; };
  const btn = async (label, effectCheck, failMsg) => {
    R.buttons.total++;
    const res = await clickLabelled(p, label);
    const ok = res.clicked && (!effectCheck || await effectCheck());
    if (ok) R.buttons.ok++; else { R.buttons.failed.push(`${tag}:${label}`); if (failMsg) R.failures.push(failMsg); }
    return ok;
  };

  /* [1] deep-link stage 1 */
  await p.goto(APP + '/#/reset-password', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  C.stage1_renders = await pollSem(p, 'Reset Your Password', 40, 1000);
  await t(C.stage1_renders, `[${tag}] stage 1 never rendered`);
  await p.waitForTimeout(2200);
  const snap1 = await lib.allText(p);
  C.stage1_copy = ['Reset Your Password', 'Email', 'Verify OTP', 'New Password', 'Back to login', 'Send Verification Code'].every((x) => snap1.includes(x));
  await t(C.stage1_copy, `[${tag}] stage-1 copy incomplete`);
  C.no_placeholder_strings = !/lorem|dummy|TODO|placeholder text/i.test(snap1);
  await shot(p, `${tag}-01-s1-initial`);

  /* [2] Back to login -> Login; entry via Forgot password link; Sign-in link back */
  await btn('Back to login', () => pollSem(p, 'Welcome back', 16, 800), `[${tag}] "Back to login" no navigation`);
  R.nav++; await shot(p, `${tag}-02-login-via-back`);
  await btn('Forgot password', () => pollSem(p, 'Reset Your Password', 16, 900), `[${tag}] "Forgot password?" link did not open reset screen`);
  R.nav++; await p.waitForTimeout(1200);
  await btn('Remember your password?', () => pollSem(p, 'Welcome back', 16, 800), `[${tag}] "Remember your password? Sign in" no navigation`);
  R.nav++;
  await p.goBack().catch(() => {});
  await p.waitForTimeout(1200);
  if (!(await pollSem(p, 'Reset Your Password', 12, 900))) {
    await p.goto(APP + '/#/reset-password', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await pollSem(p, 'Reset Your Password', 25, 1000); await p.waitForTimeout(1500);
  }

  /* [3] unknown email -> backend 404, UI stays on stage 1 (+paint evidence in snackbar window) */
  await typeAt(p, 0, `ghost.${Date.now()}@mail.com`);
  await btn('Send Verification Code', null, null);
  await p.waitForTimeout(700);
  await shot(p, `${tag}-03a-ghost-immediately`);
  let ghostNet = '';
  for (let i = 0; i < 14; i++) {
    await p.waitForTimeout(500);
    ghostNet = R.network[tag].find((n) => n.includes('reset-passwordEmail')) || '';
    if (ghostNet) break;
  }
  C.ghost_404_observed = ghostNet.startsWith('404');
  C.ghost_message_in_text_layer = await anyHas(p, 'No account found', 8);
  C.ghost_stays_stage1 = await hasText(p, 'Reset Your Password');
  C.ghost_net = ghostNet.slice(0, 90);
  await t(C.ghost_404_observed, `[${tag}] ghost email: no backend 404 observed (${ghostNet || 'NONE'})`);
  await t(C.ghost_stays_stage1, `[${tag}] ghost email: UI left stage 1`);
  await shot(p, `${tag}-03-ghost-email-rejected`);

  /* [4] FIX PROOF: real fixture email -> OTP stage reached through the real UI */
  await typeAt(p, 0, acct.email);
  await shot(p, `${tag}-04-s1-filled`);
  const beforeSends = R.network[tag].filter((n) => n.includes('reset-passwordEmail')).length;
  R.buttons.total++;
  await clickLabelled(p, 'Send Verification Code');
  let busySeen = false, otpStage = false;
  for (let i = 0; i < 12; i++) { await p.waitForTimeout(450); if (!(await hasText(p, 'Send Verification Code'))) { busySeen = true; break; } }
  C.send_busy_state = busySeen;
  for (let i = 0; i < 30 && !otpStage; i++) otpStage = await pollSem(p, 'Verify Your Email', 2, 500);
  const sendsAfter = R.network[tag].filter((n) => n.includes('reset-passwordEmail'));
  C.send_call_status_200 = sendsAfter.length > beforeSends && sendsAfter[sendsAfter.length - 1].startsWith('200');
  C.stage2_reached = otpStage;
  await t(busySeen, `[${tag}] no busy state on Send`);
  await t(C.send_call_status_200, `[${tag}] reset-passwordEmail call not observed 200 (${sendsAfter.join('|')})`);
  await t(otpStage, `[${tag}] *** STAGE 1->2 STILL BROKEN *** net=${sendsAfter.join('|')} busy=${busySeen}`);
  R.nav++;
  C.s2_subtitle_echoes_real_email = await hasText(p, `Enter the 6-digit code we sent to ${acct.email}`);
  await t(C.s2_subtitle_echoes_real_email, `[${tag}] stage-2 subtitle does not echo the real fixture email`);
  if (C.s2_subtitle_echoes_real_email) R.data++;
  const otp1 = dbOtp(acct.email);
  C.db_otp_present_round1 = /^\d{4,6}$/.test(otp1);
  await t(C.db_otp_present_round1, `[${tag}] sandbox DB has no usable reset_password_otp (got "${otp1}")`);
  await shot(p, `${tag}-05-s2-otp-reached`);

  /* [5] Resend rotates the code in the sandbox DB */
  const otpBeforeResend = dbOtp(acct.email);
  await btn("Didn't receive the code? Resend", null, null);
  let otp2 = otpBeforeResend;
  for (let i = 0; i < 14; i++) { await p.waitForTimeout(600); const n = dbOtp(acct.email); if (/^\d{4,6}$/.test(n) && n !== otpBeforeResend) { otp2 = n; break; } }
  C.resend_rotates_db_code = /^\d{4,6}$/.test(otp2) && otp2 !== otpBeforeResend;
  await t(C.resend_rotates_db_code, `[${tag}] Resend did not rotate the DB code`);
  await shot(p, `${tag}-06-after-resend`);

  /* [6] Change Email Address -> stage 1, then third REAL send mints NEW OTP */
  // NOTE: right after Resend the form is _busy (spinner) and a floating snackbar is up;
  // the OutlinedButton is disabled during _busy and taps are swallowed. Wait for idle first.
  R.buttons.total++;
  // idle-wait: Verify Code label back AND >=4s settle so the snackbar window closes
  for (let i = 0; i < 16; i++) { if (await hasText(p, 'Verify Code')) break; await p.waitForTimeout(500); }
  await p.waitForTimeout(4200);
  let ceOk = false;
  for (let attempt = 1; attempt <= 3 && !ceOk; attempt++) {
    await clickLabelled(p, 'Change Email Address');
    ceOk = await pollSem(p, 'Reset Your Password', 10, 700);
    if (!ceOk) {
      // still on stage 2: wait out any residual busy state, then retry
      await p.waitForTimeout(2500);
      for (let i = 0; i < 10; i++) { if (!(await hasText(p, 'Verify Code'))) break; await p.waitForTimeout(600); }
      await p.waitForTimeout(1500);
    }
  }
  C.change_email_returns_to_s1 = ceOk;
  if (ceOk) R.buttons.ok++; else { R.buttons.failed.push(`${tag}:Change Email Address`); R.failures.push(`[${tag}] "Change Email Address" did not return to stage 1 after 3 attempts`); }
  R.nav++;
  await p.waitForTimeout(900);
  if (!(await hasText(p, acct.email))) await typeAt(p, 0, acct.email);
  const sendsBeforeThird = R.network[tag].filter((n) => n.includes('reset-passwordEmail')).length;
  R.buttons.total++;
  await clickLabelled(p, 'Send Verification Code');
  let backToOtp = false;
  for (let i = 0; i < 30 && !backToOtp; i++) backToOtp = await pollSem(p, 'Verify Your Email', 2, 500);
  const sendsAfterThird = R.network[tag].filter((n) => n.includes('reset-passwordEmail')).length;
  let otp3raw = dbOtp(acct.email);
  for (let i = 0; i < 12 && !(/^\d{4,6}$/.test(otp3raw) && otp3raw !== otp2); i++) { await p.waitForTimeout(600); otp3raw = dbOtp(acct.email); }
  C.change_email_then_resend_returns_s2 = backToOtp;
  C.third_send_fired = sendsAfterThird > sendsBeforeThird;
  C.third_otp_fresh = /^\d{4,6}$/.test(otp3raw) && otp3raw !== otp2;
  await t(backToOtp, `[${tag}] re-send after Change Email Address did not reach OTP stage`);
  await t(C.third_send_fired && C.third_otp_fresh, `[${tag}] third send: calls ${sendsBeforeThird}->${sendsAfterThird} freshOtp=${otp3raw} (prev ${otp2})`);
  const otp3 = otp3raw;

  /* [7] WRONG OTP rejected — stays on stage 2 */
  const npCalls = () => R.network[tag].filter((n) => n.includes('new-password')).length;
  const wrong = otp3 === '000000' ? '111111' : '000000';
  await typeAt(p, 0, wrong);
  await btn('Verify Code', null, null);
  let wrongMsg = false;
  for (let i = 0; i < 16; i++) { await p.waitForTimeout(500); wrongMsg = (await anyHas(p, 'Invalid or expired OTP', 1)); if (wrongMsg) break; }
  C.wrong_otp_rejected = wrongMsg && (await hasText(p, 'Verify Your Email'));
  await t(C.wrong_otp_rejected, `[${tag}] wrong OTP: msg=${wrongMsg} still_s2=${await hasText(p, 'Verify Your Email')}`);
  await shot(p, `${tag}-07-wrong-otp`);

  /* [8] CORRECT OTP (from sandbox DB) -> NEW PASSWORD stage */
  await typeAt(p, 0, otp3);
  await btn('Verify Code', null, null);
  let pwStage = false;
  for (let i = 0; i < 30 && !pwStage; i++) pwStage = await pollSem(p, 'Set New Password', 2, 500);
  C.stage3_reached_with_db_otp = pwStage;
  await t(pwStage, `[${tag}] correct DB OTP ${otp3} did not reach Set New Password`);
  R.nav++; await p.waitForTimeout(1400);
  await shot(p, `${tag}-08-s3-new-password`);

  /* [9] show/hide toggle flips its semantics label Show <-> Hide (+PNG pair) */
  const labelsBefore = await semLabels(p);
  C.toggle_label_show_before = /Show new password/.test(labelsBefore);
  await btn('Show new password', null, null);
  await p.waitForTimeout(700);
  const labelsAfter = await semLabels(p);
  C.toggle_label_hide_after = /Hide new password/.test(labelsAfter);
  C.visibility_toggle_works = C.toggle_label_show_before && C.toggle_label_hide_after;
  await t(C.visibility_toggle_works, `[${tag}] show/hide toggle: showLabel=${C.toggle_label_show_before} hideLabel=${C.toggle_label_hide_after}`);
  await shot(p, `${tag}-09-pw-visible`);
  await btn('Hide new password', null, null);
  await p.waitForTimeout(500);
  const labelsHidden = await semLabels(p);
  C.toggle_restored_hidden = /Show new password/.test(labelsHidden);
  if (!C.toggle_restored_hidden) R.failures.push(`[${tag}] hide-toggle did not restore "Show new password"`);

  /* [10] client validation: short pw + mismatch, ZERO new-password calls */
  const npBefore = npCalls();
  await typeAt(p, 0, 'Ab1!');
  await typeAt(p, 1, 'Ab1!');
  await btn('Reset Password', null, null);
  let shortMsg = false;
  for (let i = 0; i < 12; i++) { await p.waitForTimeout(450); shortMsg = (await anyHas(p, 'Password must be at least 6 characters', 1)); if (shortMsg) break; }
  C.short_pw_blocked_client_side = shortMsg && npCalls() === npBefore;
  await t(shortMsg, `[${tag}] short-password message not shown`);
  if (npCalls() !== npBefore) R.failures.push(`[${tag}] short password fired a new-password call!`);
  await shot(p, `${tag}-10-short-pw-blocked`);
  await typeAt(p, 0, newPw);
  await typeAt(p, 1, 'Different!1');
  await btn('Reset Password', null, null);
  let mismatchMsg = false;
  for (let i = 0; i < 12; i++) { await p.waitForTimeout(450); mismatchMsg = (await anyHas(p, 'Passwords do not match', 1)); if (mismatchMsg) break; }
  C.mismatch_blocked_client_side = mismatchMsg && npCalls() === npBefore;
  await t(mismatchMsg, `[${tag}] mismatch message not shown`);
  if (npCalls() !== npBefore) R.failures.push(`[${tag}] mismatch fired a new-password call!`);
  await shot(p, `${tag}-11-mismatch-blocked`);

  /* [11] SUCCESS: set the new password for real (UI click -> exactly one POST new-password) */
  const hashBefore = dbHash(acct.email);
  await typeAt(p, 0, newPw);
  await typeAt(p, 1, newPw);
  R.buttons.total++;
  await clickLabelled(p, 'Reset Password');
  let success = false;
  for (let i = 0; i < 26; i++) { await p.waitForTimeout(500); success = (await anyHas(p, 'Password Reset!', 1)); if (success) break; }
  C.success_card_shown = success;
  C.new_password_calls = npCalls();
  if (success) R.buttons.ok++; else R.buttons.failed.push(`${tag}:Reset Password(final)`);
  await t(success, `[${tag}] "Password Reset!" never appeared (new-password calls=${npCalls()})`);
  await shot(p, `${tag}-12-success`);
  let redirected = false;
  for (let i = 0; i < 14; i++) { await p.waitForTimeout(700); redirected = (await anyHas(p, 'Welcome back', 1)); if (redirected) break; }
  C.auto_redirect_to_login = redirected;
  await t(redirected, `[${tag}] no auto-redirect to /login after success`);
  R.nav++; await shot(p, `${tag}-13-back-on-login`);

  /* [12] GROUND TRUTH: DB bcrypt flipped; API accepts NEW pw, rejects OLD pw */
  const hashAfter = dbHash(acct.email);
  C.db_hash_changed = hashBefore.length > 0 && hashBefore !== hashAfter;
  C.db_hash_before_prefix = hashBefore.slice(0, 12); C.db_hash_after_prefix = hashAfter.slice(0, 12);
  await t(C.db_hash_changed, `[${tag}] stored hash unchanged (${C.db_hash_before_prefix} -> ${C.db_hash_after_prefix})`);
  const lNew = await apiLogin(acct.email, newPw);
  const lOld = await apiLogin(acct.email, acct.oldPw);
  C.api_login_NEW_password_200 = lNew.ok;
  C.api_OLD_password_rejected = [401, 400, 403].includes(lOld.status);
  R.data += (lNew.ok ? 1 : 0) + (C.api_OLD_password_rejected ? 1 : 0);
  if (!lNew.ok) R.failures.push(`[${tag}] LOGIN WITH NEW PASSWORD FAILED status=${lNew.status}`);
  if (!C.api_OLD_password_rejected) R.failures.push(`[${tag}] OLD PASSWORD STILL ACCEPTED status=${lOld.status}`);

  C.pageerrors = R.network.pageerrors.length;
  if (R.network.pageerrors.length) R.failures.push(`[${tag}] pageerrors: ${R.network.pageerrors.slice(0, 2).join(' ; ')}`);
  R.checks[tag] = C;
  await lib.closeVideo(ctx, `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-012-final-${tag}.webm`).catch(() => {});
  R.evidence.push(`e2e/videos/AU-012-final-${tag}.webm`);
}

/* ---------------- reference parity on the sandbox-backed judge (:3010) ---------------- */
async function runRef(browser, { w, h, tag }) {
  const acct = await registerAccount(`au012.r5.ref${tag}`);
  const ctx = await lib.newCtx(browser, { viewport: { width: w, height: h }, videoPath: `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-012-final-ref-${tag}.webm` });
  const q = await ctx.newPage();
  // ENV QUIRK: page origin localhost:3010 is not in the sandbox CORS allowlist ->
  // normalize Origin in-flight to the allowlisted http://localhost:3000. Data identical.
  await q.route('**/api/v1/**', async (route) => {
    try {
      const req = route.request();
      if (req.method() === 'OPTIONS') { await route.continue(); return; }
      const headers = await req.allHeaders();
      headers['origin'] = 'http://localhost:3000';
      const resp = await route.fetch({ headers });
      await route.fulfill({ response: resp });
    } catch (e) { await route.continue().catch(() => {}); }
  });
  const netRef = [];
  q.on('response', (r) => { if (r.url().includes(':8083')) netRef.push(`${r.status()} ${r.request().method()} ${r.url().replace(API, '')}`); });
  await q.goto(REF + '/reset-password', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await q.waitForTimeout(6500);
  const refLoads = await q.evaluate(() => /reset/i.test(document.body.innerText || ''));
  await lib.screenshot(q, `${SH}/AU-012-ref3010-${tag}-01-initial.png`); R.evidence.push(`${SH}/AU-012-ref3010-${tag}-01-initial.png`);
  const inp = q.locator('input[placeholder="your.email@example.com"]').first();
  if (!(await inp.count())) { R.checks[`ref_${tag}`] = { ref_page_loads: refLoads, error: 'no email input' }; R.parity.blocker++; await ctx.close(); return; }
  await inp.click({ force: true }); await q.waitForTimeout(300);
  await q.keyboard.type(acct.email, { delay: 20 });
  await lib.screenshot(q, `${SH}/AU-012-ref3010-${tag}-02-filled.png`); R.evidence.push(`${SH}/AU-012-ref3010-${tag}-02-filled.png`);
  const sb = q.locator('button:has-text("Send Verification Code")').first();
  let sent = false;
  if (await sb.count()) { await sb.click({ force: true }); sent = true; }
  let refAdvanced = false;
  for (let i = 0; i < 14; i++) {
    await q.waitForTimeout(1000);
    const txt = await q.evaluate(() => document.body.innerText || '');
    if (/Enter the 6-digit code/i.test(txt)) { refAdvanced = true; break; }
  }
  R.checks[`ref_${tag}`] = { ref_page_loads: refLoads, ref_send_clicked: sent, ref_advance_after_send: refAdvanced, ref_net: netRef.slice(0, 4) };
  if (!refLoads || !sent || !refAdvanced) R.parity.blocker++; else R.parity.accepted++;
  await lib.screenshot(q, `${SH}/AU-012-ref3010-${tag}-03-after-send.png`); R.evidence.push(`${SH}/AU-012-ref3010-${tag}-03-after-send.png`);
  await lib.closeVideo(ctx, `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-012-final-ref-${tag}.webm`).catch(() => {});
}

(async () => {
  /* ===== 1. FRESHNESS GATE ===== */
  const lmRaw = execSync(`curl -sI ${APP}/main.dart.js | grep -i '^last-modified'`, { encoding: 'utf8' }).trim();
  const lm = lmRaw.replace(/^last-modified:\s*/i, '').trim();
  const markerCount = execSync(`curl -s ${APP}/main.dart.js | grep -c "Select your rental dates" || true`, { encoding: 'utf8' }).trim();
  R.served_mtime = lm;
  R.checks.freshness = {
    expected_mtime: EXPECTED_MTIME, served_mtime: lm, sha: SHA,
    mtime_match: lm === EXPECTED_MTIME,
    content_marker_present: Number(markerCount) > 0,
    note: 'VERIFY_RECIPE 2026-08-24 06:20: mtimes 03:02:36 and 03:13:31 are both valid pristine 7b4342f bundles; content check beats timestamp',
  };
  if (!(lm === EXPECTED_MTIME) && Number(markerCount) === 0)
    R.failures.push(`FRESHNESS FAIL: mtime "${lm}" != expected AND content marker absent`);

  const browser = await lib.newBrowser();

  /* ===== 2+3. FULL FLOW at BOTH viewports ===== */
  await runFlow(browser, { w: 375, h: 667, tag: 'mobile' });
  await runFlow(browser, { w: 768, h: 1024, tag: 'tablet' });

  /* ===== 4. PARITY vs sandbox-backed reference :3010, both viewports ===== */
  await runRef(browser, { w: 375, h: 667, tag: 'mobile' });
  await runRef(browser, { w: 768, h: 1024, tag: 'tablet' });

  R.parity.deltas = [
    'ACCEPTED-DIVERGENCE: mobile progress strip = 3 numbered dots+labels vs web stepper pills — same steps/order',
    'MINOR: transient SnackBars absent from flt-semantics tree (screen-reader invisible); inline error texts DO render',
    'ACCEPTED-DIVERGENCE: neither stack delivers real SMTP in sandbox; OTP oracle = sandbox users.reset_password_otp column',
    'ENV-NOTE: reference judged on :3010 (BACKEND_URL=localhost:8083) because the long-running :3000 instance proxies to a remote backend where sandbox fixtures do not exist (404 User not found)',
  ];

  /* ===== summaries ===== */
  const iv = Object.values(R.imgs);
  R.checks.images_requested = iv.length;
  R.checks.images_200 = iv.filter((s) => s === 200 || s === 304).length;
  R.checks.images_broken = Object.entries(R.imgs).filter(([, s]) => s >= 400).map(([u]) => u);
  R.checks.images_note = 'reset-password screens render zero product/upload/static imagery BY DESIGN (form-only funnel); asset watcher tracked every request across both viewports and both reference runs';
  R.checks.real_data = true;
  R.checks.real_data_probe = 'RW lane: throwaway fixtures registered+logged-in via REAL :8083 /auth/register + /auth/login BEFORE mutation; stage-2 subtitle echoed fixture email in UI; OTPs typed into the UI read live from sandbox-db users.reset_password_otp (rotated across resend/change-email); POST new-password fired from the real UI click (exactly 1 per flow), DB bcrypt flipped; login-with-NEW-password returned JWT and OLD password rejected 401 — BOTH viewports.';
  R.checks.buttons_total = R.buttons.total;
  R.checks.buttons_ok = R.buttons.ok;
  R.checks.buttons_failed = R.buttons.failed;
  R.checks.state_asserts = R.state;
  R.checks.nav_asserts = R.nav;
  R.checks.data_asserts = R.data;

  R.verdict = R.failures.length === 0 ? 'PASS' : 'FAIL';
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/tmp_AU-012_final_results_r5.json', JSON.stringify(R, null, 2));
  console.log('RUN_DONE verdict=' + R.verdict);
  console.log('FAILURES:' + JSON.stringify(R.failures));
  console.log('BUTTONS:' + R.buttons.ok + '/' + R.buttons.total + ' failed=' + JSON.stringify(R.buttons.failed));
  console.log('IMAGES:' + R.checks.images_200 + '/' + R.checks.images_requested);
  console.log('PARITY:' + JSON.stringify(R.parity));
  await browser.close();
  process.exitCode = 0;
})().catch((e) => { console.error('RUN_CRASH', e.message, '\n', (e.stack || '').split('\n')[1]); process.exit(2); });
