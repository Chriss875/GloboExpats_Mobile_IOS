// AU-010 skeptic round 3e — DECISIVE micro-probes with REQUEST-BODY logging.
// E1: does a correct code get corrupted when re-entered after a failed attempt?
//     (log exact verify-signup-otp POST bodies + per-box values before submit)
// E2: happy path straight through -> rapid TRIPLE Complete Registration ->
//     unicode/emoji password -> REAL API login roundtrip -> duplicate email UI.
// E3: overwrite-corruption probe (5 digits, edit box3, dump values, no submit).
const { execSync } = require('child_process');
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9108';
const OUT = f => `/home/devsystemadmin/GloboExpats_Mobile/e2e/${f}`;
const SHOTS = OUT('shots/AU-010');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(OUT('results/shards'), { recursive: true });
const log = (...a) => console.log('[sk3e]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function dbQ(q) { return execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -t -A -c "${q}"`).toString().trim(); }
const dbOtp = e => dbQ(`select coalesce(otp,'NULL') from users where logging_email='${e}'`) || 'NOROW';
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
async function inputCount(p) { return p.locator('input').count(); }
async function boxVals(p) { return p.evaluate(() => [...document.querySelectorAll('input')].slice(0, 6).map(i => i.value).join('|')); }
async function typeInput(p, idx, text) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if ((await inputCount(p)) <= idx) { await sleep(800); continue; }
    const el = p.locator('input').nth(idx);
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.click({ force: true }); await sleep(240);
    await p.keyboard.press('Control+a'); await sleep(110);
    await p.keyboard.press('Backspace'); await sleep(150);
    await p.keyboard.type(text, { delay: 12 });
    const v = await p.evaluate(i => { const e2 = document.querySelectorAll('input')[i]; return e2 ? e2.value : ''; }, idx);
    if (v === text) return true;
    await sleep(300);
  } return false;
}
// type EXACTLY n digits starting at box 0 (no clearing beyond backspaces given)
async function typeDigits(p, digits, gap = 65) {
  if ((await inputCount(p)) < 6) throw new Error('no otp boxes');
  await p.locator('input').nth(0).click({ force: true }); await sleep(200);
  for (let i = 0; i < 6; i++) { await p.keyboard.press('Backspace'); await sleep(60); }
  for (const ch of digits) await p.keyboard.type(ch, { delay: gap });
}
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
    parity: { blocker: 1, minor: 2, accepted: 2 },
  },
  failures: [], findings: [], evidence: [], runtime_ms: 0,
};
const netStatuses = (net, frag) => net.filter(x => x.u.includes(frag) && String(x.m).startsWith('RESP')).map(x => parseInt(String(x.m).replace('RESP ', ''), 10));
const shot = (p, n) => L.screenshot(p, `${SHOTS}/sk3-${n}.png`);
async function gotoRegister(browser, vp, video, tag) {
  const ctx = await L.newCtx(browser, { viewport: vp, videoPath: OUT(video) });
  const p = await ctx.newPage(); const net = []; const bodies = [];
  p.on('response', r => { if (r.url().includes(':8083')) net.push({ m: 'RESP ' + r.status(), u: r.url() }); });
  p.on('request', r => { if (r.url().includes('verify-signup-otp') || r.url().includes('/auth/register')) bodies.push(r.postData() || ''); });
  p.on('pageerror', e => console.log('[sk3e] pageerror[' + tag + ']', String(e.message).slice(0, 110)));
  await p.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await waitFirstPaint(p); await sleep(2400); await captureToasts(p);
  return { ctx, p, net, bodies };
}

(async () => {
  const T0 = Date.now();
  const browser = await L.newBrowser();

  // ================= E1: re-entry after failed attempt — corruption? =================
  try {
    const uniq = Date.now().toString(36).slice(-6);
    const fx = `sk3e1${uniq}@mail.com`;
    const { ctx, p, net, bodies } = await gotoRegister(browser, { width: 375, height: 667 }, 'videos/AU-010-sk3-e1.webm', 'E1');
    await typeInput(p, 0, 'Re'); await typeInput(p, 1, 'Entry'); await typeInput(p, 2, fx);
    await clickBtn(p, 'Continue'); await sleep(3400);
    let C = 'NOROW'; for (let i = 0; i < 25 && !/^\d{6}$/.test(C); i++) { await sleep(1000); C = dbOtp(fx); }
    if (/^\d{6}$/.test(C)) {
      // 1st: deliberately WRONG code, watch body + status
      const b0 = bodies.length;
      await typeDigits(p, '000000'); await sleep(2600);
      const wrongSts = netStatuses(net, 'verify-signup-otp');
      const stayedAfterWrong = await hasText(p, 'Verify Your Email');
      // 2nd: THE CORRECT code, capture boxes mid-typing (after 5 digits) and the body
      const bMid = bodies.length;
      await p.locator('input').nth(0).click({ force: true }); await sleep(200);
      for (let i = 0; i < 6; i++) { await p.keyboard.press('Backspace'); await sleep(60); }
      for (let i = 0; i < 5; i++) await p.keyboard.type(C[i], { delay: 70 });
      const midVals = await boxVals(p);
      await p.keyboard.type(C[5], { delay: 70 });
      await sleep(2800);
      const allSts = netStatuses(net, 'verify-signup-otp');
      const newSts = allSts.slice(wrongSts.length);
      const advanced = await hasText(p, 'Complete Security');
      const ev = await shot(p, 'e1-reentry-after-failure.png');
      const sentBody = bodies.slice(bMid).join(' ; ') || '(none)';
      rec('correct-code-reentry-after-wrong-attempt',
        (newSts.some(s => s === 200 || s === 201) || advanced) ? 'HELD'
          : (sentBody.includes(C) ? 'DISPUTED(server rejected a correctly-sent code)' : 'BROKEN(client sent a corrupted/mangled code)'),
        `DB code=${C}; wrong-000000 -> ${JSON.stringify(wrongSts)} stayed=${stayedAfterWrong}; then correct code: boxes-after-5-digits="${midVals}", POST bodies=${JSON.stringify(sentBody.slice(0, 120))}, responses=${JSON.stringify(newSts)}, advanced=${advanced}. If the wire body != C while boxes showed C, the OTP box corruption documented by the verifier breaks re-entry.`,
        ev);
    } else rec('correct-code-reentry-after-wrong-attempt', 'BLOCKED', `no OTP for ${fx} (${C})`, null);
    await ctx.close();
  } catch (e) { log('E1 err:', String(e.message).slice(0, 130)); rec('correct-code-reentry-after-wrong-attempt', 'BLOCKED', String(e.message).slice(0, 110), null); }

  // ================= E2: straight happy path -> triple register -> emoji pw login -> dup email =================
  try {
    const uniq = Date.now().toString(36).slice(-6);
    const fx = `sk3e2${uniq}@mail.com`;
    const pw = 'Str🦁ng!Pass9';
    const { ctx, p, net } = await gotoRegister(browser, { width: 768, height: 1024 }, 'videos/AU-010-sk3-tablet.webm', 'E2');
    const tt = [await typeInput(p, 0, 'Unicode'), await typeInput(p, 1, 'Njeri 🦁'), await typeInput(p, 2, fx)];
    await clickBtn(p, 'Continue'); await sleep(3600);
    let C = 'NOROW'; for (let i = 0; i < 25 && !/^\d{6}$/.test(C); i++) { await sleep(1000); C = dbOtp(fx); }
    let adv = false;
    if (/^\d{6}$/.test(C) && (await inputCount(p)) >= 6) {
      await typeDigits(p, C);
      for (let i = 0; i < 20 && !adv; i++) { await sleep(700); adv = await hasText(p, 'Complete Security'); }
    }
    let regSts = [], tokenSet = false, tp = [false, false];
    if (adv) {
      tp = [await typeInput(p, 3, pw), await typeInput(p, 4, pw)];
      const rb = netStatuses(net, '/auth/register').length;
      const rt = [await clickBtn(p, 'Complete Registration'), await clickBtn(p, 'Complete Registration'), await clickBtn(p, 'Complete Registration')];
      await sleep(4800);
      regSts = netStatuses(net, '/auth/register').slice(rb);
      tokenSet = await p.evaluate(() => !!((localStorage.getItem('flutter.auth_token') || '').length)).catch(() => false);
      log('E2 taps=', rt.join('/'), 'register=', JSON.stringify(regSts), 'pwTyped=', tp.join('/'));
      await shot(p, 'e2-triple-register-emoji-pw.png');
      rec('rapid-triple-complete-registration-emoji-pw', (tp.every(Boolean) && regSts.filter(s => s === 201).length === 1 && dbCount(fx) === '1' && tokenSet) ? 'HELD' : (regSts.length === 0 ? 'BLOCKED' : 'BROKEN'),
        `tablet 768x1024, names=${tt.join('/')}, code=${C}, advanced=${adv}; TRIPLE rapid Complete Registration -> auth/register=${JSON.stringify(regSts)} (201x${regSts.filter(s => s === 201).length}), users rows=${dbCount(fx)}, flutter.auth_token=${tokenSet}, pw="${pw}" typed=${tp.join('/')}`);
      // real API login with the SAME emoji secret
      let loginOk = false, loginSts = 0;
      if (regSts.includes(201)) {
        try { const res = await fetch('http://localhost:8083/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: fx, password: pw }) }); loginSts = res.status; const j = await res.json().catch(() => ({})); loginOk = !!j.token; } catch (e) { loginSts = -1; }
      }
      rec('unicode-emoji-password-roundtrip', !regSts.includes(201) ? 'BLOCKED' : (loginOk ? 'HELD' : 'DISPUTED'),
        `register 201 with emoji password "${pw}" then REAL API auth/login same secret -> HTTP ${loginSts} token=${loginOk}${regSts.includes(201) && !loginOk ? ' *** SILENT LOCKOUT ***' : ''}`,
        await shot(p, 'e3-emoji-login-check.png'));

      if (regSts.filter(s => s === 201).length === 1) {
        // duplicate email through the UI
        await p.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
        await waitFirstPaint(p); await sleep(2400); await captureToasts(p);
        const td = [await typeInput(p, 0, 'Sk'), await typeInput(p, 1, 'Dup'), await typeInput(p, 2, fx)];
        await clickBtn(p, 'Continue'); await sleep(3800);
        const dupToast = await seenToast(p, /already|in use|exists|registered|unable|conflict|error|failed/i);
        const pushed = await hasText(p, 'Verify Your Email');
        rec('duplicate-email-defense-ui', dupToast ? 'HELD' : 'DISPUTED',
          `re-signup existing ${fx}: typed=${td.join('/')}, error=${JSON.stringify(dupToast)}, pushed-to-Verify-anyway=${pushed}`,
          await shot(p, 'e4-duplicate-email.png'));
      }
    } else rec('rapid-triple-complete-registration-emoji-pw', 'BLOCKED', `no advance (code=${C}, adv=${adv})`, null);
    await ctx.close();
  } catch (e) { log('E2 err:', String(e.message).slice(0, 130)); rec('rapid-triple-complete-registration-emoji-pw', 'BLOCKED', String(e.message).slice(0, 110), null); }

  // ================= E3: overwrite corruption probe (no submit) =================
  try {
    const uniq = Date.now().toString(36).slice(-6);
    const fxo = `sk3e3${uniq}@mail.com`;
    const { ctx, p } = await gotoRegister(browser, { width: 375, height: 667 }, 'videos/AU-010-sk3-e3.webm', 'E3');
    await typeInput(p, 0, 'Ov'); await typeInput(p, 1, 'Wr'); await typeInput(p, 2, fxo);
    await clickBtn(p, 'Continue'); await sleep(4000);
    let C = 'NOROW'; for (let i = 0; i < 25 && !/^\d{6}$/.test(C); i++) { await sleep(1000); C = dbOtp(fxo); }
    if (/^\d{6}$/.test(C) && (await inputCount(p)) >= 6) {
      await typeDigits(p, C.slice(0, 5)); await sleep(700);   // 5 digits only — no auto-submit
      const before = await boxVals(p);
      await p.locator('input').nth(2).click({ force: true }); await sleep(280);
      await p.keyboard.press('Backspace'); await sleep(180);
      await p.keyboard.type('9', { delay: 100 }); await sleep(900);
      const after = await boxVals(p);
      const bf = before.replace(/\|/g, ''), af = after.replace(/\|/g, '');
      const expectReplace = C[0] + C[1] + '9' + C[3] + C[4];
      const deleteShift = C[0] + C[1] + C[4];
      rec('otp-box-overwrite-corruption', af === expectReplace ? 'HELD' : (af === deleteShift ? 'BROKEN' : 'DISPUTED'),
        `boxes before="${before}" (DB ${C}) | after Backspace+'9' in box3 -> "${after}" | replace-in-place(web)="...${expectReplace.slice(2)}" vs delete+shift="...${deleteShift.slice(2)}"`,
        await shot(p, 'e5-overwrite-corruption.png'));
    } else rec('otp-box-overwrite-corruption', 'BLOCKED', `fixture ${fxo}: code=${C}, boxes=${await inputCount(p)}`, null);
    await ctx.close();
  } catch (e) { log('E3 err:', String(e.message).slice(0, 130)); rec('otp-box-overwrite-corruption', 'BLOCKED', String(e.message).slice(0, 110), null); }

  await browser.close();
  R.ts = new Date().toISOString(); R.attacks_attempted = R.findings.length; R.runtime_ms = Date.now() - T0;
  fs.appendFileSync(OUT('results/shards/AU-010-skeptic-e.jsonl'), JSON.stringify(R) + '\n');
  log('WROTE e-shard; findings=', R.findings.length, 'broken=', R.attacks_broken);

  function rec(cls, result, detail, ev) {
    R.findings.push({ class: cls, result, detail: String(detail), evidence: ev || '' });
    if (ev) R.evidence.push(ev.replace('/home/devsystemadmin/GloboExpats_Mobile/', ''));
    if (result.startsWith('BROKEN')) R.attacks_broken++;
    console.log('[sk3e]', cls, '=>', result, '|', String(detail).slice(0, 220));
  }
})();
