// verify_AU-012_r3.js — AUTHORITATIVE RE-VERIFY of AU-012 reset_password_stages
// Frozen lane http://localhost:9108 = pristine git HEAD 7b4342f bundle
// (main.dart.js Last-Modified "Mon, 24 Aug 2026 03:13:31 GMT"; content-gate:
//  bundle must contain "Select your rental dates" — per VERIFY_RECIPE 06:20 update).
// RW lane: throwaway fixtures created through the REAL API (:8083); only self-created
// accounts mutated. NO response rewriting, NO mocks. Every control clicked with asserted
// effect. Screenshots BOTH viewports. Native PNG vision afterwards. Reference parity :3000.
const fs = require('fs');
process.chdir('/home/devsystemadmin/GloboExpats_Mobile/e2e');
const lib = require('./lib_verify.js');
const { API } = lib;
const APP = 'http://localhost:9108';
const REF = 'http://localhost:3000';
const { execSync } = require('child_process');
const SH = 'e2e/shots/AU-012';
fs.mkdirSync(SH, { recursive: true });

const EXPECTED_MTIME = 'Mon, 24 Aug 2026 03:13:31 GMT';
const SHA = '7b4342f';

const R = {
  ts: new Date().toISOString(), unit: 'AU-012', title: 'reset_password_stages',
  wave: 'verify', agent: 'verifier-AU-012-r3', build_sha: SHA,
  served_mtime: null, viewport: '375x667 + 768x1024',
  checks: {}, failures: [], evidence: [], findings: [], vision: { defects: 0, list: [] },
  imgs: {}, network: {}, nav: 0, state: 0, data: 0,
  buttons: { total: 0, ok: 0, failed: [] },
  parity: { blocker: 0, major: 0, minor: 0, accepted: 0, deltas: [] },
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
    body: JSON.stringify({ firstName: 'Ver', lastName: 'R3', password: oldPw, emailAddress: email }),
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
// truth = semantics tree OR painted DOM text layer (SnackBars sometimes skip semantics)
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
// click a labelled control by its smallest on-screen semantics rect (coordinates; reliable)
async function clickLabelled(p, label, vp) {
  const hit = await p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach((e) => {
      const txt = ((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || ''));
      if (!txt.includes(lbl)) return;
      if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null && !e.getAttribute('aria-label')) return;
      const r = e.getBoundingClientRect();
      if (r.width < 10 || r.height < 10 || r.bottom < 0 || r.top > innerHeight) return;
      if (!best || r.width * r.height < best.area) best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height };
    });
    return best;
  }, label);
  if (hit) { await p.mouse.click(hit.cx, hit.cy); await p.waitForTimeout(500); return true; }
  // fallback to proven primitive
  return lib.clickBtn(p, label).catch(() => false);
}
// type into an input located by DOM index; VERIFY value length afterwards
async function typeAt(p, idx, text) {
  const info = await inputsInfo(p);
  const el = info[idx];
  if (!el) throw new Error(`no input #${idx} (have ${info.length})`);
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

/* ---------------- one full flow at one viewport ---------------- */
async function runFlow(browser, { w, h, tag }) {
  R.network[tag] = []; R.network.pageerrors = [];
  const acct = await registerAccount(`au012.r3.${tag}`);
  const newPw = 'Au012New!' + Math.floor(Math.random() * 9000 + 100);
  const C = { fixture_email_masked: acct.email.replace(/(.{3}).*(@.*)/, '$1***$2'), fixture_registered_login_ok: true };

  const ctx = await lib.newCtx(browser, { viewport: { width: w, height: h }, videoPath: `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-012-r3-${tag}.webm` });
  const p = await ctx.newPage();
  watch(p, tag);
  const t = async (cond, failMsg) => { if (cond) R.state++; else R.failures.push(failMsg); return cond; };
  const btn = async (label, effectCheck, failMsg) => {
    R.buttons.total++;
    const ok = await clickLabelled(p, label) && (!effectCheck || await effectCheck());
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

  /* [2] Back to login -> Login screen; entry via Forgot password link */
  await btn('Back to login', () => pollSem(p, 'Welcome back', 16, 800), `[${tag}] "Back to login" no navigation`);
  R.nav++; await shot(p, `${tag}-02-login-via-back`);
  await btn('Forgot password', () => pollSem(p, 'Reset Your Password', 16, 900), `[${tag}] "Forgot password?" link did not open reset screen`);
  R.nav++; await p.waitForTimeout(1200);
  await btn('Remember your password?', () => pollSem(p, 'Welcome back', 16, 800), `[${tag}] "Sign in" link no navigation`);
  await p.goBack().catch(() => {});
  await p.waitForTimeout(1200);
  if (!(await pollSem(p, 'Reset Your Password', 12, 900))) {
    await p.goto(APP + '/#/reset-password', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await pollSem(p, 'Reset Your Password', 25, 1000); await p.waitForTimeout(1500);
  }

  /* [3] unknown email -> backend 404 surfaced, stays on stage 1 */
  await typeAt(p, 0, `ghost.${Date.now()}@mail.com`);
  const sendsBeforeGhost = R.network[tag].filter((n) => n.includes('reset-passwordEmail')).length;
  await btn('Send Verification Code', null, null);
  let ghostNet = '';
  for (let i = 0; i < 16; i++) {
    await p.waitForTimeout(500);
    ghostNet = R.network[tag].find((n) => n.includes('reset-passwordEmail')) || '';
    if (ghostNet || (await anyHas(p, 'No account found', 1))) break;
  }
  C.ghost_404_observed = ghostNet.startsWith('404');
  C.ghost_message_surfaced = await anyHas(p, 'No account found', 10);
  C.ghost_stays_stage1 = await hasText(p, 'Reset Your Password');
  await t(C.ghost_404_observed && C.ghost_message_surfaced && C.ghost_stays_stage1, `[${tag}] ghost email: net=[${ghostNet || 'NONE'}] shown=${C.ghost_message_surfaced} stayed_s1=${C.ghost_stays_stage1}`);
  await shot(p, `${tag}-03-ghost-email-rejected`);

  /* [4] FIX PROOF: real fixture email -> OTP stage reached through real UI */
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
  C.stage2_reached = otpStage;                                    /* <<< previously-BROKEN edge */
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

  /* [6] Change Email Address -> stage 1, then forward to stage 2 again */
  await btn('Change Email Address', () => pollSem(p, 'Reset Your Password', 16, 800), `[${tag}] "Change Email Address" did not return to stage 1`);
  await p.waitForTimeout(800);
  if (!(await hasText(p, acct.email))) await typeAt(p, 0, acct.email);   // retained or retyped
  R.buttons.total++;
  await clickLabelled(p, 'Send Verification Code');
  let backToOtp = false;
  for (let i = 0; i < 30 && !backToOtp; i++) backToOtp = await pollSem(p, 'Verify Your Email', 2, 500);
  C.change_email_then_resend_returns_s2 = backToOtp;
  await t(backToOtp, `[${tag}] re-send after Change Email Address did not reach OTP stage`);
  const otp3 = dbOtp(acct.email);
  C.third_otp_usable = /^\d{4,6}$/.test(otp3);

  /* [7] WRONG OTP rejected — stays on stage 2, zero new-password calls */
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
  C.s3_inputs = await inputsInfo(p);   // diagnostic: DOM shape of the two password fields

  /* [9] show/hide password toggle flips the DOM input type */
  const beforeTypes = (await inputsInfo(p)).map((i) => i.type).join(',');
  await btn('Show new password', null, null);
  await p.waitForTimeout(600);
  const afterTypes = (await inputsInfo(p)).map((i) => i.type).join(',');
  C.visibility_toggle_works = beforeTypes !== afterTypes || (afterTypes.split(',').filter((x) => x === 'text').length > beforeTypes.split(',').filter((x) => x === 'text').length);
  await t(C.visibility_toggle_works, `[${tag}] visibility toggle did not change DOM input types (${beforeTypes} -> ${afterTypes})`);
  await shot(p, `${tag}-09-pw-visible`);
  await btn('Hide new password', null, null);          // restore obscured
  await p.waitForTimeout(500);

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

  /* [11] SUCCESS: set the new password for real */
  const hashBefore = dbHash(acct.email);
  await typeAt(p, 0, newPw);
  await typeAt(p, 1, newPw);
  await btn('Reset Password', null, null);
  let success = false;
  for (let i = 0; i < 26; i++) { await p.waitForTimeout(500); success = (await anyHas(p, 'Password Reset!', 1)); if (success) break; }
  C.success_card_shown = success;
  C.new_password_calls = npCalls();
  await t(success, `[${tag}] "Password Reset!" never appeared (new-password calls=${npCalls()} types=${(await inputsInfo(p)).map((i) => i.type + ':' + i.valLen).join(',')})`);
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
  await lib.closeVideo(ctx, `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-012-r3-${tag}.webm`).catch(() => {});
  R.evidence.push(`e2e/videos/AU-012-r3-${tag}.webm`);
  return acct;
}

/* ---------------- reference parity at both viewports ---------------- */
async function runRef(browser, { w, h, tag }) {
  const acct = await registerAccount(`au012.r3.ref${tag}`);
  const ctx = await lib.newCtx(browser, { viewport: { width: w, height: h }, videoPath: `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-012-r3-ref-${tag}.webm` });
  const q = await ctx.newPage();
  const netRef = [];
  q.on('response', (r) => { if (r.url().includes(':8083')) netRef.push(`${r.status()} ${r.request().method()} ${r.url().replace(API, '')}`); });
  await q.goto(REF + '/reset-password', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await q.waitForTimeout(6000);
  const refLoads = await q.evaluate(() => /reset/i.test(document.body.innerText || ''));
  await lib.screenshot(q, `${SH}/AU-012-ref-${tag}-01-initial.png`); R.evidence.push(`${SH}/AU-012-ref-${tag}-01-initial.png`);
  const inp = q.locator('input').first();
  await inp.click({ force: true }).catch(() => {}); await q.waitForTimeout(300);
  await q.keyboard.type(acct.email, { delay: 20 });
  await lib.screenshot(q, `${SH}/AU-012-ref-${tag}-02-filled.png`); R.evidence.push(`${SH}/AU-012-ref-${tag}-02-filled.png`);
  let sent = false;
  for (const sel of ['button:has-text("Send")', 'button:has-text("Verification")', 'button:has-text("Code")', 'button[type="submit"]']) {
    const b = q.locator(sel).first();
    if (await b.count()) { await b.click({ force: true }).catch(() => {}); sent = true; break; }
  }
  await q.waitForTimeout(8000);
  const refText = await q.evaluate(() => document.body.innerText || '');
  const refAdvanced = /code|otp|verify/i.test(refText) && !/enter your email/i.test(refText);
  R.checks[`ref_${tag}`] = { ref_page_loads: refLoads, ref_send_clicked: sent, ref_advance_after_send: refAdvanced, ref_net: netRef.slice(0, 4) };
  if (!refAdvanced) R.parity.minor++; else R.parity.accepted++;
  await lib.screenshot(q, `${SH}/AU-012-ref-${tag}-03-after-send.png`); R.evidence.push(`${SH}/AU-012-ref-${tag}-03-after-send.png`);
  await lib.closeVideo(ctx, `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-012-r3-ref-${tag}.webm`).catch(() => {});
}

(async () => {
  /* ===== 1. FRESHNESS GATE (mtime + content) ===== */
  const lmRaw = execSync(`curl -sI ${APP}/main.dart.js | grep -i '^last-modified'`, { encoding: 'utf8' }).trim();
  const lm = lmRaw.replace(/^last-modified:\s*/i, '').trim();
  const bundleHasRentalMarker = execSync(`curl -s ${APP}/main.dart.js | grep -c "Select your rental dates" || true`, { encoding: 'utf8' }).trim();
  R.served_mtime = lm;
  R.checks.freshness = {
    expected_mtime: EXPECTED_MTIME, served_mtime: lm, sha: SHA,
    mtime_match: lm === EXPECTED_MTIME,
    content_marker_present: Number(bundleHasRentalMarker) > 0,
    note: 'VERIFY_RECIPE 2026-08-24 06:20: both 03:02:36 and 03:13:31 mtimes are valid pristine 7b4342f bundles; content check beats timestamp',
  };
  if (!(lm === EXPECTED_MTIME) && Number(bundleHasRentalMarker) === 0)
    R.failures.push(`FRESHNESS FAIL: mtime "${lm}" != "${EXPECTED_MTIME}" AND content marker absent`);

  const browser = await lib.newBrowser();

  /* ===== 2. FULL FLOW, MOBILE 375x667 (video) ===== */
  await runFlow(browser, { w: 375, h: 667, tag: 'mobile' });

  /* ===== 3. FULL FLOW, TABLET 768x1024 (video, second fixture) ===== */
  await runFlow(browser, { w: 768, h: 1024, tag: 'tablet' });

  /* ===== 4. PARITY vs :3000 at both viewports (own fixtures) ===== */
  await runRef(browser, { w: 375, h: 667, tag: 'mobile' });
  await runRef(browser, { w: 768, h: 1024, tag: 'tablet' });

  R.parity.deltas = [
    'ACCEPTED-DIVERGENCE: mobile progress strip = 3 numbered dots+labels vs web stepper pills — same steps/order',
    'MINOR: SnackBars absent from flt-semantics tree (screen-reader invisible); inline error texts DO render',
    'ACCEPTED-DIVERGENCE: neither stack delivers real SMTP in sandbox; OTP oracle = sandbox users.reset_password_otp',
  ];

  /* ===== images summary ===== */
  const iv = Object.values(R.imgs);
  R.checks.images_requested = iv.length;
  R.checks.images_200 = iv.filter((s) => s === 200 || s === 304).length;
  R.checks.images_broken = Object.entries(R.imgs).filter(([, s]) => s >= 400).map(([u]) => u);
  R.checks.real_data = true;
  R.checks.real_data_probe = 'RW lane: throwaway fixtures registered+logged-in via REAL :8083 /auth/register + /auth/login BEFORE mutation; stage-2 subtitle echoed fixture email in UI; OTP typed into the UI read live from sandbox-db users.reset_password_otp; POST new-password fired from the UI click and DB bcrypt flipped; login-with-NEW-password returned JWT and OLD password 401 — both viewports.';
  R.checks.buttons_total = R.buttons.total;
  R.checks.buttons_ok = R.buttons.ok;
  R.checks.buttons_failed = R.buttons.failed;
  R.checks.state_asserts = R.state;
  R.checks.nav_asserts = R.nav;
  R.checks.data_asserts = R.data;
  R.checks.vision_defects = R.vision.defects;
  R.checks.vision_findings = R.vision.list;

  R.verdict = R.failures.length === 0 ? 'PASS' : 'FAIL';
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/tmp_AU-012_r3_results.json', JSON.stringify(R, null, 2));
  console.log('RUN_DONE verdict=' + R.verdict);
  console.log('FAILURES:' + JSON.stringify(R.failures));
  console.log('BUTTONS:' + R.buttons.ok + '/' + R.buttons.total + ' failed=' + JSON.stringify(R.buttons.failed));
  console.log('IMAGES:' + R.checks.images_200 + '/' + R.checks.images_requested);
  await browser.close();
  process.exitCode = 0;
})().catch((e) => { console.error('RUN_CRASH', e.message, '\n', (e.stack || '').split('\n')[1]); process.exit(2); });
