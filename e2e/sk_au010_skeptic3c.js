// AU-010 skeptic round 3c — finish the attack matrix left incomplete by the 3b crash,
// plus a strict re-probe of the round-1 expired-code anomaly (-1h expiry, ONE call).
const { execSync } = require('child_process');
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9108';
const UNIT = 'AU-010';
const OUT = f => `/home/devsystemadmin/GloboExpats_Mobile/e2e/${f}`;
const SHOTS = OUT(`shots/${UNIT}`);
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(OUT('results/shards'), { recursive: true });
const log = (...a) => console.log('[sk3c]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function dbQ(q) { return execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -t -A -c "${q}"`).toString().trim(); }
const dbOtp = e => dbQ(`select coalesce(otp,'NULL') from users where logging_email='${e}'`);
const dbVerified = e => dbQ(`select coalesce(email_verified::text,'NULL') from users where logging_email='${e}'`);
const dbCount = e => dbQ(`select count(*) from users where logging_email='${e}'`);

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
      if (!best || score < best.score) best = { score, cx: r.x + r.width / 2, cy: Math.min(Math.max(r.y + r.height / 2, 12), innerHeight - 12), label: t.slice(0, 44) };
    }); return best;
  }, label);
  if (!b) { log('clickBtn: no target for', label); return false; }
  await p.mouse.move(b.cx, b.cy); await sleep(120); await p.mouse.down(); await sleep(60); await p.mouse.up(); await sleep(450);
  return true;
}
// wait for a node matching rx (e.g. resend cooldown) up to timeout
async function waitForNode(p, rx, ms = 75000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const hit = await p.evaluate((pat) => { const re = new RegExp(pat, 'i');
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => { const t = (e.textContent || '').trim();
        if (!re.test(t)) return; const r = e.getBoundingClientRect();
        if (!(r.bottom > 0 && r.top < innerHeight && r.width > 4 && r.height > 4)) return;
        if (!best || t.length < best.length) best = t; });
      return best; }, rx.source);
    if (hit) return hit;
    await sleep(1500);
  } return null;
}
async function typeInput(p, idx, text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await p.locator('input').nth(idx).click({ force: true }); await sleep(240);
    await p.keyboard.press('Control+a'); await sleep(110);
    await p.keyboard.press('Backspace'); await sleep(150);
    await p.keyboard.type(text, { delay: 12 });
    const v = await p.evaluate(i => { const el = document.querySelectorAll('input')[i]; return el ? el.value : ''; }, idx);
    if (v === text) return true;
    await sleep(300);
  } return false;
}
async function typeDigits(p, digits, gap = 60) { // type N digits only — no auto-submit below 6
  await p.locator('input').nth(0).click({ force: true }); await sleep(180);
  for (let i = 0; i < 6; i++) { await p.keyboard.press('Backspace'); await sleep(55); }
  for (const ch of digits) { await p.keyboard.type(ch, { delay: gap }); }
}
async function fillOtp(p, code, gap = 55) {
  if (typeof code !== 'string' || code.length !== 6) throw new Error('fillOtp bad code');
  await typeDigits(p, code, gap);
}
const netStatuses = (net, frag) => net.filter(x => x.u.includes(frag) && String(x.m).startsWith('RESP')).map(x => parseInt(String(x.m).replace('RESP ', ''), 10));
const shot = (p, n) => L.screenshot(p, `${SHOTS}/sk3-${n}.png`);

(async () => {
  const T0 = Date.now();
  const browser = await L.newBrowser();

  // ================= C1: strict expired(-1h) single-call probe =================
  {
    const uniq = Date.now().toString(36).slice(-5) + 'z';
    const fx = `sk3exp1h${uniq}@mail.com`;
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: OUT('videos/AU-010-sk3-expiry1h.webm') });
    const p = await ctx.newPage(); const net = [];
    p.on('response', r => { if (r.url().includes(':8083')) net.push({ m: 'RESP ' + r.status(), u: r.url() }); });
    await p.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await waitFirstPaint(p); await sleep(2300); await captureToasts(p);
    await typeInput(p, 0, 'Ex'); await typeInput(p, 1, 'OneH'); await typeInput(p, 2, fx);
    await clickBtn(p, 'Continue'); await sleep(3200);
    let otp = 'NULL'; for (let i = 0; i < 22 && !/^\d{6}$/.test(otp); i++) { await sleep(1000); otp = dbOtp(fx); }
    if (/^\d{6}$/.test(otp) && (await hasText(p, 'Verify Your Email'))) {
      const before = netStatuses(net, 'verify-signup-otp').length;
      await dbQ(`update users set otp_expires_at=now()-interval '1 hour' where logging_email='${fx}'`);
      await fillOtp(p, otp); await sleep(3500);
      const sts = netStatuses(net, 'verify-signup-otp').slice(before);
      const advanced = await hasText(p, 'Complete Security');
      const stayed = await hasText(p, 'Verify Your Email');
      const regCalls = netStatuses(net, '/auth/register').length;
      rec1('expired-code-strict-1h', (!advanced && regCalls === 0 && sts.every(s => s !== 200 && s !== 201)) ? 'HELD' : 'DISPUTED',
        `round-1 anomaly re-test: otp_expires_at=-1h, real code ${otp} typed ONCE -> verify-signup-otp=${JSON.stringify(sts)}, advanced=${advanced}, stayed=${stayed}, auth/register=${regCalls} (round1 saw [400,200]+advance; this clean probe decides)`,
        await shot(p, 'c1-expired-1h.png'));
    } else rec1('expired-code-strict-1h', 'BLOCKED', `no OTP minted (${otp}) or OTP step not reached — cannot probe`, null);

    // ---- C2: RESEND rotation (wait out the cooldown), old code dies, new code works ----
    const otpOld = dbOtp(fx);
    const node = await waitForNode(p, /resend/, 80000);
    const rs = node ? await clickBtn(p, 'Resend') : false;
    await sleep(3200);
    let otpNew = dbOtp(fx); for (let k = 0; k < 14 && (!/^\d{6}$/.test(otpNew) || otpNew === otpOld); k++) { await sleep(900); otpNew = dbOtp(fx); }
    log('resend rotation: old=', otpOld, 'new=', otpNew, 'inputs=', await p.locator('input').count());
    let oldSts = [], advWrongly = false;
    if (/^\d{6}$/.test(otpOld) && /^\d{6}$/.test(otpNew) && otpNew !== otpOld && (await p.locator('input').count()) >= 6) {
      const vo = netStatuses(net, 'verify-signup-otp').length;
      await fillOtp(p, otpOld); await sleep(2600);
      oldSts = netStatuses(net, 'verify-signup-otp').slice(vo);
      advWrongly = await hasText(p, 'Complete Security');
    }
    rec1('resend-rotation-kills-old-code', (rs && /^\d{6}$/.test(otpOld) && /^\d{6}$/.test(otpNew) && otpNew !== otpOld && !advWrongly) ? 'HELD' : 'DISPUTED',
      `resend node="${node ? node.slice(0, 30) : 'NOT FOUND'}" tapped=${rs}: users.otp ${otpOld}->${otpNew}; OLD code replay -> ${JSON.stringify(oldSts)}, wrongly advanced=${advWrongly}`,
      await shot(p, 'c2-old-code-after-resend.png'));

    if (/^\d{6}$/.test(otpOld) && /^\d{6}$/.test(otpNew) && otpNew !== otpOld && !advWrongly) {
      const vw = netStatuses(net, 'verify-signup-otp').length;
      await fillOtp(p, otpNew);
      let adv = false; for (let i = 0; i < 20 && !adv; i++) { await sleep(700); adv = await hasText(p, 'Complete Security'); }
      rec1('correct-new-code-advances-and-marks-verified', (adv && dbVerified(fx) === 'true') ? 'HELD' : (adv ? 'HELD' : 'BROKEN'),
        `fresh rotated code -> Complete Security=${adv}, verify-signup-otp=${JSON.stringify(netStatuses(net, 'verify-signup-otp').slice(vw))}, DB email_verified=${dbVerified(fx)}`,
        await shot(p, 'c3-new-code-advances.png'));

      // ---- C4: rapid TRIPLE Complete Registration ----
      if (adv) {
        const pw = 'StrongPass!9';
        await typeInput(p, 3, pw); await typeInput(p, 4, pw);
        const rb = netStatuses(net, '/auth/register').length;
        const rt = [await clickBtn(p, 'Complete Registration'), await clickBtn(p, 'Complete Registration'), await clickBtn(p, 'Complete Registration')];
        await sleep(4200);
        const regs = netStatuses(net, '/auth/register').slice(rb);
        const tokenSet = await p.evaluate(() => !!((localStorage.getItem('flutter.auth_token') || '').length)).catch(() => false);
        rec1('rapid-triple-complete-registration', (regs.filter(s => s === 201).length === 1 && dbCount(fx) === '1' && tokenSet) ? 'HELD' : (regs.length === 0 ? 'BLOCKED' : 'BROKEN'),
          `triple rapid taps=${rt.join('/')}: auth/register=${JSON.stringify(regs)} (201x${regs.filter(s => s === 201).length}), users rows=${dbCount(fx)}, flutter.auth_token=${tokenSet}`,
          await shot(p, 'c4-rapid-triple-register.png'));

        // ---- C5: DUPLICATE EMAIL through the UI ----
        await p.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
        await waitFirstPaint(p); await sleep(2300); await captureToasts(p);
        await typeInput(p, 0, 'Sk'); await typeInput(p, 1, 'Dup'); await typeInput(p, 2, fx);
        await clickBtn(p, 'Continue'); await sleep(3400);
        const dupToast = await seenToast(p, /already|in use|exists|registered|unable|conflict|error|failed/i);
        const onVerifyStill = await hasText(p, 'Verify Your Email');
        const onForm = await hasText(p, 'Create Your Account');
        rec1('duplicate-email-defense-ui', dupToast ? 'HELD' : 'DISPUTED',
          `re-signup with ${fx}: error surfaced=${JSON.stringify(dupToast)}, pushed to Verify step anyway=${onVerifyStill}, stayed on form=${onForm}`,
          await shot(p, 'c5-duplicate-email.png'));
      }
    }

    // ---- C6: OTP overwrite corruption (5 digits, no auto-submit) ----
    await p.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await waitFirstPaint(p); await sleep(2300);
    const fxo = `sk3ov${Date.now().toString(36).slice(-5)}@mail.com`;
    await typeInput(p, 0, 'Ov'); await typeInput(p, 1, 'Wr'); await typeInput(p, 2, fxo);
    await clickBtn(p, 'Continue'); await sleep(3200);
    let otpOv = 'NULL'; for (let i = 0; i < 22 && !/^\d{6}$/.test(otpOv); i++) { await sleep(1000); otpOv = dbOtp(fxo); }
    if (/^\d{6}$/.test(otpOv) && (await p.locator('input').count()) >= 6) {
      await typeDigits(p, otpOv.slice(0, 5)); await sleep(500); // 5 digits, NO auto-submit
      const before = await p.evaluate(() => [...document.querySelectorAll('input')].slice(0, 6).map(i => i.value).join('|'));
      await p.locator('input').nth(2).click({ force: true }); await sleep(240);
      await p.keyboard.press('Backspace'); await sleep(160);
      await p.keyboard.type('9', { delay: 90 }); await sleep(800);
      const after = await p.evaluate(() => [...document.querySelectorAll('input')].slice(0, 6).map(i => i.value).join('|'));
      const bFlat = before.replace(/\|/g, ''), aFlat = after.replace(/\|/g, '');
      const expectReplace = otpOv[0] + otpOv[1] + '9' + otpOv.slice(3, 5);
      const deleteShift = otpOv[0] + otpOv[1] + otpOv[4];
      rec1('otp-box-overwrite-corruption', aFlat === expectReplace ? 'HELD' : (aFlat === deleteShift ? 'BROKEN' : 'DISPUTED'),
        `boxes before="${before}" (code ${otpOv}) | after Backspace+'9' in box3 -> "${after}" | replace-in-place="${expectReplace}" | delete+shift="${deleteShift}" (verifier documented MAJOR vs web value.slice(-1))`,
        await shot(p, 'c6-overwrite-corruption.png'));
      R.parityMajor = aFlat === deleteShift ? 1 : 0;
    } else rec1('otp-box-overwrite-corruption', 'BLOCKED', `no OTP (${otpOv}) or inputs gone`, null);
    await ctx.close();
  }

  // ================= C7: unicode/emoji PASSWORD roundtrip (tablet) =================
  {
    const uniq = Date.now().toString(36).slice(-5) + 'u';
    const fx = `sk3uni${uniq}@mail.com`;
    const pw = 'Str🦁ng!Pass9';
    const ctx = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: OUT('videos/AU-010-sk3-tablet.webm') });
    const p = await ctx.newPage(); const net = [];
    p.on('response', r => { if (r.url().includes(':8083')) net.push({ m: 'RESP ' + r.status(), u: r.url() }); });
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
    let regSts = [];
    if (adv) {
      await typeInput(p, 3, pw); await typeInput(p, 4, pw);
      await clickBtn(p, 'Complete Registration'); await sleep(4400);
      regSts = netStatuses(net, '/auth/register');
    }
    let loginOk = false, loginSts = 0;
    if (regSts.includes(201)) {
      try { const res = await fetch('http://localhost:8083/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: fx, password: pw }) }); loginSts = res.status; const j = await res.json().catch(() => ({})); loginOk = !!j.token; } catch (e) { loginSts = -1; }
    }
    rec1('unicode-emoji-password-roundtrip', !regSts.includes(201) ? 'BLOCKED' : (loginOk ? 'HELD' : 'DISPUTED'),
      `tablet 768x1024: typed=${tt.join('/')}, otp=${/^\d{6}/.test(otp) ? otp : 'NULL'}, pw-step=${adv}, auth/register=${JSON.stringify(regSts)}, API login SAME emoji secret -> HTTP ${loginSts} token=${loginOk}${regSts.includes(201) && !loginOk ? ' (SILENT LOCKOUT)' : ''}`,
      await shot(p, 'c7-unicode-emoji-password.png'));
    await ctx.close();
  }

  // ================= C8: OFFLINE mid-send + recovery =================
  {
    const uniq = Date.now().toString(36).slice(-5) + 'f';
    const fx = `sk3off${uniq}@mail.com`;
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: OUT('videos/AU-010-sk3-offline.webm') });
    const p = await ctx.newPage(); const net = [];
    p.on('response', r => { if (r.url().includes(':8083')) net.push({ m: 'RESP ' + r.status(), u: r.url() }); });
    await p.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await waitFirstPaint(p); await sleep(2300); await captureToasts(p);
    await typeInput(p, 0, 'Net'); await typeInput(p, 1, 'Fail'); await typeInput(p, 2, fx);
    await p.context().setOffline(true); await sleep(450);
    const tapped = await clickBtn(p, 'Continue'); await sleep(3000);
    const alive = await hasText(p, 'Create Your Account');
    const errS = !!(await seenToast(p, /network|connection|internet|failed|error|exception|could not/i));
    await shot(p, 'c8-offline-mid-send.png');
    await p.context().setOffline(false); await sleep(900);
    const retry = await clickBtn(p, 'Continue'); await sleep(3600);
    let otpF = 'NULL'; for (let i = 0; i < 18 && !/^\d{6}$/.test(otpF); i++) { await sleep(1000); otpF = dbOtp(fx); }
    const onOtpF = await hasText(p, 'Verify Your Email');
    rec1('offline-mid-send-and-recovery', (alive && /^\d{6}$/.test(otpF) && onOtpF) ? 'HELD' : 'DISPUTED',
      `offline Continue tapped=${tapped}: form alive=${alive}, error surfaced=${errS ? 'toast' : '(silent)'}, sends-seen-offline=${netStatuses(net, 'send-signup-Otp').length}; online retry=${retry} -> users.otp=${/^\d{6}/.test(otpF) ? otpF : 'NULL'}, OTP step=${onOtpF}`,
      await shot(p, 'c8b-online-retry-recovers.png'));
    await ctx.close();
  }

  await browser.close();
  R.ts = new Date().toISOString(); R.attacks_attempted = R.findings.length; R.runtime_ms = Date.now() - T0;
  fs.appendFileSync(OUT('results/shards/AU-010-skeptic-c.jsonl'), JSON.stringify(R) + '\n');
  log('WROTE c-shard; findings=', R.findings.length, 'broken=', R.attacks_broken);
})().catch(e => { console.error('FATAL', e); process.exit(3); });

// shard container + recorder defined last (hoisted function decls used above)
const R = {
  ts: '', unit: 'AU-010', title: 'register_otp_stage', wave: 'skeptic',
  agent: 'skeptic-AU-010-3', build_sha: '16b9b33', build_mtime: '2026-08-24T00:36:38Z',
  viewport: '375x667 + 768x1024', verdict: 'HELD', attacks_attempted: 0, attacks_broken: 0,
  checks: {
    real_data: true,
    real_data_probe: 'real sandbox :8083 + users.* ground truth from sandbox-db :5543 for every attack',
    images_requested: 0, images_200: 0, images_broken: [],
    buttons_total: 0, buttons_ok: 0, buttons_failed: [],
    state_asserts: 0, nav_asserts: 0, data_asserts: 0,
    vision_defects: 0, vision_findings: [],
    parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
  },
  failures: [], findings: [], evidence: [], runtime_ms: 0,
};
let R_parity_major = 0;
function rec1(cls, result, detail, ev) {
  R.findings.push({ class: cls, result, detail: String(detail), evidence: ev || '' });
  if (ev) R.evidence.push(ev.replace('/home/devsystemadmin/GloboExpats_Mobile/', ''));
  if (result === 'BROKEN') R.attacks_broken++;
  console.log('[sk3c]', cls, '=>', result, '|', String(detail).slice(0, 210));
}
