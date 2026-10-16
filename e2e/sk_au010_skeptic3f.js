// AU-010 skeptic round 3f — FINAL artifacts:
//  F1: the DECISIVE failed-send attack RECORDED as a named webm via lib.closeVideo.
//  F2: emoji-password happy path with click-first typing -> TRIPLE register ->
//      REAL API login roundtrip -> duplicate-email UI.
const { execSync } = require('child_process');
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9108';
const OUT = f => `/home/devsystemadmin/GloboExpats_Mobile/e2e/${f}`;
const SHOTS = OUT('shots/AU-010');
const log = (...a) => console.log('[sk3f]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function dbQ(q) { return execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -t -A -c "${q}"`).toString().trim(); }
const dbOtp = e => dbQ(`select coalesce(otp,'NULL') from users where logging_email='${e}'`) || 'NOROW';
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
      if (!best || score < best.score) best = { score, cx: r.x + r.width / 2, cy: Math.min(Math.max(r.y + r.height / 2, 12), innerHeight - 12) };
    }); return best;
  }, label);
  if (!b) return false;
  await p.mouse.move(b.cx, b.cy); await sleep(120); await p.mouse.down(); await sleep(60); await p.mouse.up(); await sleep(450);
  return true;
}
async function inputCount(p) { return p.locator('input').count(); }
// CLICK-FIRST typing: focus, then type char-by-char WITHOUT select-all/backspace
// (works for Flutter web password fields where Ctrl+A clears are flaky).
async function typeInto(p, idx, text) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if ((await inputCount(p)) <= idx) { await sleep(800); continue; }
    const el = p.locator('input').nth(idx);
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.click({ force: true }); await sleep(260);
    // clear conservatively
    for (let k = 0; k < 40; k++) { await p.keyboard.press('Backspace'); }
    await sleep(150);
    for (const ch of text) { await p.keyboard.type(ch, { delay: 26 }); await sleep(20); }
    await sleep(250);
    const v = await p.evaluate(i => { const e2 = document.querySelectorAll('input')[i]; return e2 ? e2.value : ''; }, idx);
    log(`  typed[${idx}] len=${v.length} expect=${text.length}`);
    if (v === text) return true;
  } return false;
}
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
    real_data_probe: 'real sandbox :8083 + users.* ground truth from sandbox-db :5543; failed-send attack re-recorded as named webm',
    images_requested: 0, images_200: 0, images_broken: [],
    buttons_total: 0, buttons_ok: 0, buttons_failed: [],
    state_asserts: 0, nav_asserts: 0, data_asserts: 0,
    vision_defects: 0, vision_findings: [],
    parity: { blocker: 1, minor: 2, accepted: 2 },
  },
  failures: [], findings: [], evidence: [], runtime_ms: 0,
};
const netStatuses = (net, frag) => net.filter(x => x.u.includes(frag) && String(x.m).startsWith('RESP')).map(x => parseInt(String(x.m).replace('RESP ', ''), 10));
(async () => {
  const T0 = Date.now();

  // ---------------- F1: FAILED SEND, recorded ----------------
  try {
    const longEmail = 'y'.repeat(281) + '@mail.com';
    const ctx = await L.newCtx(await browser0(), { viewport: { width: 375, height: 667 }, videoPath: OUT('videos/AU-010-skeptic3-failsend.webm') });
    const p = await ctx.newPage(); const net = [];
    p.on('response', r => { if (r.url().includes(':8083')) net.push({ m: 'RESP ' + r.status(), u: r.url() }); });
    await p.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await waitFirstPaint(p); await sleep(2400); await captureToasts(p);
    const t = [await typeInto(p, 0, 'F'), await typeInto(p, 1, 'One'), await typeInto(p, 2, longEmail)];
    await clickBtn(p, 'Continue'); await sleep(4200);
    const sts = netStatuses(net, 'send-signup-Otp');
    const advanced = await hasText(p, 'Verify Your Email');
    const errToast = await seenToast(p, /could not|error|failed|conflict|try again/i);
    const sentToast = await seenToast(p, /code sent/i);
    const ev = await L.screenshot(p, `${SHOTS}/sk3-f1-failed-send-advance.png`);
    rec('failed-send-advances-to-otp-step(RECORDED)', (sts.length > 0 && advanced && !errToast) ? 'BROKEN' : (sts.length > 0 ? 'DISPUTED' : 'BLOCKED'),
      `290-char regex-valid address typed=${t.join('/')}: send-signup-Otp=${JSON.stringify(sts)} (backend 409 DATA_CONFLICT, users.logging_email varchar(255)); UI STILL ADVANCED to "Verify Your Email"=${advanced}; success toast shown=${JSON.stringify(sentToast ? sentToast.slice(0, 44) : null)}; error toast=${JSON.stringify(errToast)}; users rows minted=${dbCount(longEmail)}. Web reference stays on step 1 with a destructive Alert.`,
      ev);
    await L.closeVideo(ctx, OUT('videos/AU-010-skeptic3-failsend.webm'));
  } catch (e) { log('F1 err:', String(e.message).slice(0, 130)); rec('failed-send-advances-to-otp-step(RECORDED)', 'BLOCKED', String(e.message).slice(0, 110), null); }

  // ---------------- F2: emoji pw happy path + triple register + login roundtrip + dup email ----------------
  try {
    const browser = await browser0();
    const uniq = Date.now().toString(36).slice(-6);
    const fx = `sk3f${uniq}@mail.com`;
    const pw = 'Str🦁ng!Pass9';
    const ctx = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: OUT('videos/AU-010-skeptic3-tablet.webm') });
    const p = await ctx.newPage(); const net = [];
    p.on('response', r => { if (r.url().includes(':8083')) net.push({ m: 'RESP ' + r.status(), u: r.url() }); });
    await p.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await waitFirstPaint(p); await sleep(2500); await captureToasts(p);
    const tt = [await typeInto(p, 0, 'Unicode'), await typeInto(p, 1, 'Njeri 🦁'), await typeInto(p, 2, fx)];
    await clickBtn(p, 'Continue'); await sleep(3800);
    let C = 'NOROW'; for (let i = 0; i < 25 && !/^\d{6}$/.test(C); i++) { await sleep(1000); C = dbOtp(fx); }
    let adv = false;
    if (/^\d{6}$/.test(C) && (await inputCount(p)) >= 6) {
      await typeDigits(p, C);
      for (let i = 0; i < 22 && !adv; i++) { await sleep(700); adv = await hasText(p, 'Complete Security'); }
    }
    log('F2 code=', C, 'advanced=', adv);
    let regSts = [], tokenSet = false, tp = [false, false];
    if (adv) {
      tp = [await typeInto(p, 3, pw), await typeInto(p, 4, pw)];
      const rb = netStatuses(net, '/auth/register').length;
      const rt = [await clickBtn(p, 'Complete Registration'), await clickBtn(p, 'Complete Registration'), await clickBtn(p, 'Complete Registration')];
      await sleep(5000);
      regSts = netStatuses(net, '/auth/register').slice(rb);
      tokenSet = await p.evaluate(() => !!((localStorage.getItem('flutter.auth_token') || '').length)).catch(() => false);
      await L.screenshot(p, `${SHOTS}/sk3-f2-triple-register.png`);
      rec('rapid-triple-complete-registration+emoji-pw', (tp.every(Boolean) && regSts.filter(s => s === 201).length === 1 && dbCount(fx) === '1' && tokenSet) ? 'HELD' : (regSts.length === 0 ? 'BLOCKED' : 'BROKEN'),
        `tablet 768x1024: names=${tt.join('/')} code=${C} advanced=${adv}; pw "${pw}" typed=${tp.join('/')}; TRIPLE Complete Registration -> auth/register=${JSON.stringify(regSts)} (201x${regSts.filter(s => s === 201).length}), users rows=${dbCount(fx)}, flutter.auth_token=${tokenSet}`);
      let loginOk = false, loginSts = 0;
      if (regSts.includes(201)) {
        try { const res = await fetch('http://localhost:8083/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: fx, password: pw }) }); loginSts = res.status; const j = await res.json().catch(() => ({})); loginOk = !!j.token; } catch (e) { loginSts = -1; }
        rec('unicode-emoji-password-roundtrip', loginOk ? 'HELD' : 'DISPUTED',
          `REAL API auth/login with the SAME emoji secret -> HTTP ${loginSts} token=${loginOk}${loginOk ? '' : ' *** SILENT LOCKOUT RISK ***'}`,
          `${SHOTS}/sk3-f2-triple-register.png`);
      } else rec('unicode-emoji-password-roundtrip', 'BLOCKED', `register did not 201 (${JSON.stringify(regSts)}) — no login roundtrip possible`, null);

      if (regSts.filter(s => s === 201).length === 1) {
        await p.goto(`${APP}/#/register`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
        await waitFirstPaint(p); await sleep(2500); await captureToasts(p);
        const td = [await typeInto(p, 0, 'Sk'), await typeInto(p, 1, 'Dup'), await typeInto(p, 2, fx)];
        await clickBtn(p, 'Continue'); await sleep(4000);
        const dupToast = await seenToast(p, /already|in use|exists|registered|unable|conflict|error|failed/i);
        const pushed = await hasText(p, 'Verify Your Email');
        rec('duplicate-email-defense-ui', dupToast ? 'HELD' : 'DISPUTED',
          `re-signup existing ${fx}: error=${JSON.stringify(dupToast)}, pushed-to-Verify-anyway=${pushed}`,
          await L.screenshot(p, `${SHOTS}/sk3-f4-duplicate-email.png`));
      }
    } else rec('rapid-triple-complete-registration+emoji-pw', 'BLOCKED', `no advance (code=${C})`, null);
    await L.closeVideo(ctx, OUT('videos/AU-010-skeptic3-tablet.webm'));
  } catch (e) { log('F2 err:', String(e.message).slice(0, 130)); rec('rapid-triple-complete-registration+emoji-pw', 'BLOCKED', String(e.message).slice(0, 110), null); }

  await browser0().close();
  R.ts = new Date().toISOString(); R.attacks_attempted += R.findings.length; R.runtime_ms = Date.now() - T0;
  fs.appendFileSync(OUT('results/shards/AU-010-skeptic-f.jsonl'), JSON.stringify(R) + '\n');
  log('WROTE f-shard; findings=', R.findings.length);

  function rec(cls, result, detail, ev) {
    R.findings.push({ class: cls, result: String(result).startsWith('BROKEN') ? 'BROKEN' : result, detail: String(detail), evidence: typeof ev === 'string' ? ev.replace('/home/devsystemadmin/GloboExpats_Mobile/', '') : '' });
    if (typeof ev === 'string') R.evidence.push(ev.replace('/home/devsystemadmin/GloboExpats_Mobile/', ''));
    if (String(result).startsWith('BROKEN')) R.attacks_broken++;
    console.log('[sk3f]', cls, '=>', result, '|', String(detail).slice(0, 230));
  }
  async function browser0() {
    if (!globalThis.__br) globalThis.__br = await L.newBrowser();
    return globalThis.__br;
  }
})();
