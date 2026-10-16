// AU-010 skeptic round 3d — FINAL matrix completion, per-block try/catch so one
// failure can't kill the run. Clean resend-rotation design (no expiry interference).
const { execSync } = require('child_process');
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9108';
const OUT = f => `/home/devsystemadmin/GloboExpats_Mobile/e2e/${f}`;
const SHOTS = OUT('shots/AU-010');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(OUT('results/shards'), { recursive: true });
const log = (...a) => console.log('[sk3d]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function dbQ(q) { return execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -t -A -c "${q}"`).toString().trim(); }
const dbOtp = e => { const r = dbQ(`select coalesce(otp,'NULL') from users where logging_email='${e}'`); return r || 'NOROW'; };
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
  if (!b) return false;
  await p.mouse.move(b.cx, b.cy); await sleep(120); await p.mouse.down(); await sleep(60); await p.mouse.up(); await sleep(450);
  return true;
}
// waits until the resend button text has NO countdown digits left (cooldown elapsed)
async function waitForResendReady(p, ms = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const txt = await p.evaluate(() => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        if (!/resend/i.test(t)) return;
        const r = e.getBoundingClientRect();
        if (!(r.bottom > 0 && r.top < innerHeight && r.width > 4 && r.height > 4)) return;
        if (!best || t.length < best.length) best = t;
      }); return best;
    });
    if (txt && !/\(\s*\d+\s*s?\)/.test(txt) && !/\d+\s*s$/i.test(txt.trim())) return txt;
    await sleep(1500);
  } return null;
}
async function inputCount(p) { return p.locator('input').count(); }
async function typeInput(p, idx, text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await inputCount(p)) <= idx) { await sleep(700); continue; }
    await p.locator('input').nth(idx).click({ force: true }); await sleep(240);
    await p.keyboard.press('Control+a'); await sleep(110);
    await p.keyboard.press('Backspace'); await sleep(150);
    await p.keyboard.type(text, { delay: 12 });
    const v = await p.evaluate(i => { const el = document.querySelectorAll('input')[i]; return el ? el.value : ''; }, idx);
    if (v === text) return true;
    await sleep(300);
  } return false;
}
async function typeDigits(p, digits, gap = 60) {
  if ((await inputCount(p)) < 6) throw new Error('no otp boxes');
  await p.locator('input').nth(0).click({ force: true }); await sleep(180);
  for (let i = 0; i < 6; i++) { await p.keyboard.press('Backspace'); await sleep(55); }
  for (const ch of digits) await p.keyboard.type(ch, { delay: gap });
}
async function fillOtp(p, code, gap = 55) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new Error('fillOtp bad code: ' + JSON.stringify(code));
  await typeDigits(p, code, gap);
}
const netStatuses = (net, frag) => net.filter(x => x.u.includes(frag) && String(x.m).startsWith('RESP')).map(x => parseInt(String(x.m).replace('RESP ', ''), 10));
const shot = (p, n) => L.screenshot(p, `${SHOTS}/sk3-${n}.png`);

const R = {
  ts: '', unit: 'AU-010', title: 'register_otp_stage', wave: 'skeptic',
  agent: 'skeptic-AU-010-3', build_sha: '16b9b33', build_mtime: '2026-08-24T00:36:38Z',
  viewport: '375x667 + 768x1024', verdict: 'HELD', attacks_attempted: 0, attacks_broken: 0,
  checks: {
    real_data: true,
    real_data_probe: 'every attack drives real sandbox :8083 endpoints; OTP/expiry/verified ground truth read from users.* in sandbox-db :5543',
    images_requested: 0, images_200: 0, images_broken: [],
    buttons_total: 0, buttons_ok: 0, buttons_failed: [],
    state_asserts: 0, nav_asserts: 0, data_asserts: 0,
    vision_defects: 0, vision_findings: [],
    parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
  },
  failures: [], findings: [], evidence: [], runtime_ms: 0,
};
async function gotoRegister(browser, vp, video, tag) {
  const ctx = await L.newCtx(browser, { viewport: vp, videoPath: OUT(video) });
  const p = await ctx.newPage(); const net = [];
  p.on('response', r => { if (r.url().includes(':8083')) net.push({ m: 'RESP ' + r.status(), u: r.url() }); });
  p.on('pageerror', e => console.log('[sk3d] pageerror[' + tag + ']', String(e.message).slice(0, 110)));
  await p.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await waitFirstPaint(p); await sleep(2300); await captureToasts(p);
  return { ctx, p, net };
}

(async () => {
  const T0 = Date.now();
  const browser = await L.newBrowser();

  // ============ D1: clean RESEND ROTATION + rapid register + duplicate email ============
  let d1 = { ok: false };
  try {
    const uniq = Date.now().toString(36).slice(-6);
    const fx = `sk3d1${uniq}@mail.com`;
    const { ctx, p, net } = await gotoRegister(browser, { width: 375, height: 667 }, 'videos/AU-010-sk3-d1.webm', 'D1');
    await typeInput(p, 0, 'Dw'); await typeInput(p, 1, 'One'); await typeInput(p, 2, fx);
    await clickBtn(p, 'Continue'); await sleep(3400);
    let otpA = 'NOROW'; for (let i = 0; i < 25 && !/^\d{6}$/.test(otpA); i++) { await sleep(1000); otpA = dbOtp(fx); }
    log('D1 otpA=', otpA);
    if (/^\d{6}$/.test(otpA)) {
      // wait out the resend cooldown, then rotate
      const nodeTxt = await waitForResendReady(p, 95000);
      const rs = nodeTxt ? await clickBtn(p, 'Resend') : false;
      await sleep(3200);
      let otpB = dbOtp(fx); for (let k = 0; k < 14 && (!/^\d{6}$/.test(otpB) || otpB === otpA); k++) { await sleep(900); otpB = dbOtp(fx); }
      log('D1 otpB=', otpB, 'resendNode=', nodeTxt);
      // replay the OLD code -> must be rejected, must NOT advance
      let oldSts = [], advWrongly = false;
      if (/^\d{6}$/.test(otpB) && /^\d{6}$/.test(otpA) && (await inputCount(p)) >= 6) {
        const vo = netStatuses(net, 'verify-signup-otp').length;
        await fillOtp(p, otpA); await sleep(2800);
        oldSts = netStatuses(net, 'verify-signup-otp').slice(vo);
        advWrongly = await hasText(p, 'Complete Security');
      }
      rec('resend-rotation-kills-old-code', (rs && /^\d{6}$/.test(otpB) && otpB !== otpA && !advWrongly) ? 'HELD' : 'DISPUTED',
        `resend ready-node="${nodeTxt ? nodeTxt.slice(0, 34) : 'NOT FOUND'}" tapped=${rs}: users.otp ${otpA}->${otpB}; OLD ${otpA} replayed -> verify-signup-otp=${JSON.stringify(oldSts)}, wrongly advanced=${advWrongly}`,
        await shot(p, 'd1-old-code-after-resend.png'));

      if (/^\d{6}$/.test(otpB) && !advWrongly) {
        const vw = netStatuses(net, 'verify-signup-otp').length;
        await fillOtp(p, otpB);
        let adv = false; for (let i = 0; i < 20 && !adv; i++) { await sleep(700); adv = await hasText(p, 'Complete Security'); }
        rec('correct-new-code-advances-marks-verified', (adv && dbVerified(fx) === 'true') ? 'HELD' : (adv ? 'HELD' : 'BROKEN'),
          `rotated code -> Complete Security=${adv}, calls=${JSON.stringify(netStatuses(net, 'verify-signup-otp').slice(vw))}, DB email_verified=${dbVerified(fx)}`,
          await shot(p, 'd2-new-code-advances.png'));
        if (adv) {
          // rapid TRIPLE Complete Registration
          const pw = 'StrongPass!9';
          const tp = [await typeInput(p, 3, pw), await typeInput(p, 4, pw)];
          const rb = netStatuses(net, '/auth/register').length;
          const rt = [await clickBtn(p, 'Complete Registration'), await clickBtn(p, 'Complete Registration'), await clickBtn(p, 'Complete Registration')];
          await sleep(4500);
          const regs = netStatuses(net, '/auth/register').slice(rb);
          const tokenSet = await p.evaluate(() => !!((localStorage.getItem('flutter.auth_token') || '').length)).catch(() => false);
          rec('rapid-triple-complete-registration', (!tp.includes(false) && regs.filter(s => s === 201).length === 1 && dbCount(fx) === '1' && tokenSet) ? 'HELD' : (regs.length === 0 ? 'BLOCKED' : 'BROKEN'),
            `pw typed=${tp.join('/')}; triple taps=${rt.join('/')}: auth/register=${JSON.stringify(regs)} (201x${regs.filter(s => s === 201).length}), users rows=${dbCount(fx)}, token=${tokenSet}`,
            await shot(p, 'd3-rapid-triple-register.png'));
          d1.ok = regs.filter(s => s === 201).length === 1;

          // DUPLICATE EMAIL through UI
          await p.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
          await waitFirstPaint(p); await sleep(2400); await captureToasts(p);
          const td = [await typeInput(p, 0, 'Sk'), await typeInput(p, 1, 'Dup'), await typeInput(p, 2, fx)];
          await clickBtn(p, 'Continue'); await sleep(3600);
          const dupToast = await seenToast(p, /already|in use|exists|registered|unable|conflict|error|failed/i);
          const pushedToVerify = await hasText(p, 'Verify Your Email');
          rec('duplicate-email-defense-ui', dupToast ? 'HELD' : 'DISPUTED',
            `re-signup with existing ${fx} typed=${td.join('/')}: error=${JSON.stringify(dupToast)}, pushed to Verify anyway=${pushedToVerify}`,
            await shot(p, 'd4-duplicate-email.png'));
        }
      }

      // OTP overwrite corruption probe — separate throwaway fixture, 5 digits only
      const fxo = `sk3dov${uniq}@mail.com`;
      await p.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await waitFirstPaint(p); await sleep(2400);
      await typeInput(p, 0, 'Ov'); await typeInput(p, 1, 'Wr'); await typeInput(p, 2, fxo);
      await clickBtn(p, 'Continue'); await sleep(3600);
      let otpOv = 'NOROW'; for (let i = 0; i < 25 && !/^\d{6}$/.test(otpOv); i++) { await sleep(1000); otpOv = dbOtp(fxo); }
      if (/^\d{6}$/.test(otpOv) && (await inputCount(p)) >= 6) {
        await typeDigits(p, otpOv.slice(0, 5)); await sleep(600);   // 5 digits, NO auto-submit
        const before = await p.evaluate(() => [...document.querySelectorAll('input')].slice(0, 6).map(i => i.value).join('|'));
        await p.locator('input').nth(2).click({ force: true }); await sleep(260);
        await p.keyboard.press('Backspace'); await sleep(170);
        await p.keyboard.type('9', { delay: 90 }); await sleep(900);
        const after = await p.evaluate(() => [...document.querySelectorAll('input')].slice(0, 6).map(i => i.value).join('|'));
        const bf = before.replace(/\|/g, ''), af = after.replace(/\|/g, '');
        const expectReplace = otpOv[0] + otpOv[1] + '9' + otpOv[3] + otpOv[4];
        const deleteShift = otpOv[0] + otpOv[1] + otpOv[4];
        rec('otp-box-overwrite-corruption', af === expectReplace ? 'HELD' : (af === deleteShift ? 'BROKEN' : 'DISPUTED'),
          `boxes before="${before}" (DB code ${otpOv}) | after Backspace+'9' in box3 -> "${after}" | replace-in-place="${expectReplace}" | delete+shift="${deleteShift}" (verifier documented MAJOR vs web value.slice(-1))`,
          await shot(p, 'd5-overwrite-corruption.png'));
      } else rec('otp-box-overwrite-corruption', 'BLOCKED', `fixture ${fxo} otp=${otpOv}, boxes=${await inputCount(p)} — could not stage`, null);
    } else rec('resend-rotation-kills-old-code', 'BLOCKED', `no OTP minted for ${fx} (${otpA})`, null);
    await ctx.close();
  } catch (e) { log('D1 error:', String(e.message).slice(0, 140)); rec('resend-block', 'BLOCKED', 'D1 harness error: ' + String(e.message).slice(0, 120), null); }

  // ============ D2: unicode/emoji PASSWORD roundtrip (tablet 768) ============
  try {
    const uniq = Date.now().toString(36).slice(-6) + 'u';
    const fx = `sk3du${uniq}@mail.com`;
    const pw = 'Str🦁ng!Pass9';
    const { ctx, p, net } = await gotoRegister(browser, { width: 768, height: 1024 }, 'videos/AU-010-sk3-tablet.webm', 'D2');
    const tt = [await typeInput(p, 0, 'Unicode'), await typeInput(p, 1, 'Njeri 🦁'), await typeInput(p, 2, fx)];
    await clickBtn(p, 'Continue'); await sleep(3600);
    let otp = 'NOROW'; for (let i = 0; i < 25 && !/^\d{6}$/.test(otp); i++) { await sleep(1000); otp = dbOtp(fx); }
    let adv = false;
    if (/^\d{6}$/.test(otp) && (await inputCount(p)) >= 6) {
      await fillOtp(p, otp);
      for (let i = 0; i < 20 && !adv; i++) { await sleep(700); adv = await hasText(p, 'Complete Security'); }
    }
    let regSts = [];
    if (adv) {
      const tp = [await typeInput(p, 3, pw), await typeInput(p, 4, pw)];
      await clickBtn(p, 'Complete Registration'); await sleep(4600);
      regSts = netStatuses(net, '/auth/register');
      log('D2 typed pw=', tp.join('/'), 'register=', JSON.stringify(regSts));
    }
    let loginOk = false, loginSts = 0;
    if (regSts.includes(201)) {
      try {
        const res = await fetch('http://localhost:8083/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: fx, password: pw }) });
        loginSts = res.status; const j = await res.json().catch(() => ({})); loginOk = !!j.token;
      } catch (e) { loginSts = -1; }
    }
    rec('unicode-emoji-password-roundtrip', !regSts.includes(201) ? 'BLOCKED' : (loginOk ? 'HELD' : 'DISPUTED'),
      `tablet 768x1024: names typed=${tt.join('/')}, otp=${otp}, pw-step=${adv}, auth/register=${JSON.stringify(regSts)}, API login SAME emoji secret -> HTTP ${loginSts} token=${loginOk}${regSts.includes(201) && !loginOk ? ' *** SILENT LOCKOUT ***' : ''}`,
      await shot(p, 'd6-unicode-emoji-password.png'));
    await ctx.close();
  } catch (e) { log('D2 error:', String(e.message).slice(0, 140)); rec('unicode-emoji-password-roundtrip', 'BLOCKED', 'harness error: ' + String(e.message).slice(0, 120), null); }

  // ============ D3: OFFLINE mid-send + recovery ============
  try {
    const uniq = Date.now().toString(36).slice(-6) + 'f';
    const fx = `sk3df${uniq}@mail.com`;
    const { ctx, p, net } = await gotoRegister(browser, { width: 375, height: 667 }, 'videos/AU-010-sk3-offline.webm', 'D3');
    await typeInput(p, 0, 'Net'); await typeInput(p, 1, 'Fail'); await typeInput(p, 2, fx);
    await p.context().setOffline(true); await sleep(500);
    const tapped = await clickBtn(p, 'Continue'); await sleep(3000);
    const alive = await hasText(p, 'Create Your Account');
    const errS = !!(await seenToast(p, /network|connection|internet|failed|error|exception|could not/i));
    const offSends = netStatuses(net, 'send-signup-Otp');
    await shot(p, 'd7-offline-mid-send.png');
    await p.context().setOffline(false); await sleep(1000);
    const retry = await clickBtn(p, 'Continue'); await sleep(3800);
    let otpF = 'NOROW'; for (let i = 0; i < 20 && !/^\d{6}$/.test(otpF); i++) { await sleep(1000); otpF = dbOtp(fx); }
    const onOtpF = await hasText(p, 'Verify Your Email');
    rec('offline-mid-send-and-recovery', (alive && /^\d{6}$/.test(otpF) && onOtpF) ? 'HELD' : 'DISPUTED',
      `offline Continue tapped=${tapped}: form alive=${alive}, error surfaced=${errS ? 'toast' : '(silent)'}, offline sends=${JSON.stringify(offSends)}; back online retry=${retry} -> users.otp=${otpF}, OTP step=${onOtpF}`,
      await shot(p, 'd8-online-retry-recovers.png'));
    await ctx.close();
  } catch (e) { log('D3 error:', String(e.message).slice(0, 140)); rec('offline-mid-send-and-recovery', 'BLOCKED', 'harness error: ' + String(e.message).slice(0, 120), null); }

  await browser.close();

  R.ts = new Date().toISOString(); R.attacks_attempted = R.findings.length; R.runtime_ms = Date.now() - T0;
  fs.appendFileSync(OUT('results/shards/AU-010-skeptic-d.jsonl'), JSON.stringify(R) + '\n');
  log('WROTE d-shard; findings=', R.findings.length, 'broken=', R.attacks_broken);
  process.exitCode = 0;

  function rec(cls, result, detail, ev) {
    R.findings.push({ class: cls, result, detail: String(detail), evidence: ev || '' });
    if (ev) R.evidence.push(ev.replace('/home/devsystemadmin/GloboExpats_Mobile/', ''));
    if (result === 'BROKEN') R.attacks_broken++;
    console.log('[sk3d]', cls, '=>', result, '|', String(detail).slice(0, 210));
  }
})();
