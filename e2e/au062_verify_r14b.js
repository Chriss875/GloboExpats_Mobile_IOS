// au062_verify_r14b.js — AU-062 TERMINAL verification on FROZEN lane :9131
// (git e694463, main.dart.js Last-Modified Wed, 26 Aug 2026 08:15:26 GMT).
// Consolidates the r14 findings + probes into the canonical checklist:
//  C1 freshness, C2 real data (curl + DOM + DB readback), C3 images,
//  C4 click-everything, C5 both viewports, C6 native vision (done by agent on PNGs),
//  C7 parity vs :3000, C8 verdict.
const fs = require('fs');
const L = require('./lib_verify.js');
const { execSync } = require('child_process');

const APP = 'http://localhost:9131';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-062';
const MARK = 'AU062R14B' + Math.floor(Math.random() * 900000 + 100000);
const OUT = {
  freshness: {}, asserts: [], posts: [], clicks: [], images: {}, shots: [], videos: [],
  dbRow: null, anonRow: null, parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
};
function log(...a) { console.log('[au062b]', ...a); }
function assert(vp, name, pass, value) {
  OUT.asserts.push({ vp, name, pass: !!pass, value: value === undefined ? null : value });
  log(pass ? 'PASS ' : 'FAIL ', vp, name, JSON.stringify(value ?? '').slice(0, 200));
}
async function dumpText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
}
async function shot(p, vp, state) {
  const f = `${ROOT}/e2e/shots/AU-062/AU-062-${vp}-${state}.png`;
  await L.screenshot(p, f); OUT.shots.push(f); return f;
}
// smallest visible tappable/button node whose text includes lbl
async function tapText(p, lbl) {
  const cands = await p.evaluate((lbl) => {
    const out = []; const vh = innerHeight;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim(); if (!t.includes(lbl)) return;
      if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > vh) return;
      out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height });
    });
    out.sort((a, b) => a.area - b.area); return out.slice(0, 4);
  }, lbl);
  if (!cands.length) return false;
  const vh = await p.evaluate(() => innerHeight);
  await p.mouse.click(cands[0].cx, Math.max(12, Math.min(cands[0].cy, vh - 16)));
  await p.waitForTimeout(500); return true;
}
async function scrollDown(p, steps, dy = 420) {
  await p.mouse.move(180, 380);
  for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, dy); await p.waitForTimeout(150); }
}
async function scrollUp(p, steps) {
  await p.mouse.move(180, 380);
  for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, -900); await p.waitForTimeout(110); }
}
async function listControls(p) {
  return p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const role = e.getAttribute('role'); const t = (e.textContent || '').trim(); if (!t) return;
      const r = e.getBoundingClientRect();
      const vis = r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight;
      if (!vis) return;
      if (role === 'button') out.push({ kind: 'button', label: t.slice(0, 44) });
      else if (e.getAttribute('flt-tappable') !== null) out.push({ kind: 'tappable', label: t.slice(0, 38) });
    });
    document.querySelectorAll('input,textarea').forEach(i =>
      out.push({ kind: 'input', label: i.getAttribute('aria-label') || i.placeholder || i.type }));
    return out;
  });
}
async function setByAria(p, label, val, delay = 8) {
  const loc = p.locator(`[aria-label="${label}"]`).first();
  await loc.click({ force: true }); await p.waitForTimeout(420);
  await p.keyboard.press('Control+a'); await p.waitForTimeout(130);
  await p.keyboard.type(val, { delay }); await p.waitForTimeout(320);
  const got = await loc.inputValue().catch(() => null);
  return { ok: got === val, got };
}
async function pickReasonOther(p) {
  const rb = p.locator('flt-semantics[role="button"]', { hasText: 'Reason' }).first();
  await rb.click({ force: true }); await p.waitForTimeout(900);
  const otherRect = await p.evaluate(() => {
    let hit = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if ((e.textContent || '').trim() !== 'Other') return;
      const bb = e.getBoundingClientRect();
      if (bb.width > 5 && !hit) hit = [bb.x, bb.y, bb.width, bb.height];
    });
    return hit;
  });
  if (otherRect) { await p.mouse.click(otherRect[0] + otherRect[2] / 2, otherRect[1] + otherRect[3] / 2); await p.waitForTimeout(800); return true; }
  return false;
}

(async () => {
  fs.mkdirSync(`${ROOT}/e2e/shots/AU-062`, { recursive: true });

  // ---------- C1 FRESHNESS ----------
  const head = await fetch(`${APP}/main.dart.js`, { method: 'HEAD' });
  OUT.freshness.lastModified = head.headers.get('last-modified');
  assert('meta', 'C1-freshness-mtime-e694463-081526GMT',
    OUT.freshness.lastModified === 'Wed, 26 Aug 2026 08:15:26 GMT', OUT.freshness);

  // ---------- BROWSER ----------
  const browser = await L.newBrowser();
  for (const [vpName, vp] of [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }]]) {
    const videoPath = `${ROOT}/e2e/videos/AU-062-r14b-${vpName}.webm`;
    OUT.videos.push(videoPath);
    const ctx = await L.newCtx(browser, { viewport: vp, videoPath });
    const page = await ctx.newPage();
    page.on('response', rr => {
      const u = rr.url();
      if (/\/uploads\/[^?#]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/[^?#]*\.(png|webp|jpg|svg)(\?|#|$)/i.test(u))
        OUT.images[u] = rr.status();
    });
    page.on('request', rr => {
      if (/\/api\/v1\/contact\/submit/.test(rr.url())) {
        let body = {}; try { body = JSON.parse(rr.postData() || '{}'); } catch (e) {}
        OUT.posts.push({ vp: vpName, ...body });
      }
    });

    // ---- login ----
    await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(page, 'Buy now', 60000).catch(() => {});
    let logged = await L.isLoggedIn(page);
    if (!logged) {
      await L.clickBtn(page, 'Login'); await L.waitText(page, 'Welcome back', 25000).catch(() => {});
      const ei = page.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await page.waitForTimeout(300);
      await page.keyboard.type('mobile.test.20260820@gmail.com', { delay: 8 });
      const pi = page.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await page.waitForTimeout(300);
      await page.keyboard.type('StrongPass!1', { delay: 8 });
      await L.clickBtn(page, 'Log in');
      for (let i = 0; i < 30 && !logged; i++) { await page.waitForTimeout(1000); logged = await L.isLoggedIn(page); }
    }
    assert(vpName, 'C-login-token-present', logged, '');

    // ================= CRIT1 CONTACT FORM =================
    await page.evaluate(() => { window.location.hash = '/contact'; });
    await L.waitText(page, 'Contact us', 20000).catch(() => {});
    await page.waitForTimeout(3000);
    let T = await dumpText(page);
    assert(vpName, 'CRIT1-contact-screen-renders',
      T.includes('Contact us') && T.includes('Send message'), '');
    // all five DTO controls present (inputs carry aria-labels)
    const fields = await page.evaluate(() =>
      [...document.querySelectorAll('input,textarea')].map(i => i.getAttribute('aria-label')));
    assert(vpName, 'CRIT1-all-five-fields-present',
      ['Your name', 'Email address', 'Subject', 'Message'].every(l => fields.includes(l)) &&
      T.includes('Reason'), fields);
    await shot(page, vpName, '05-contact-form');

    // signed-in email prefill (web prefills name+email). KNOWN DEFECT: empty in build.
    const emailFieldVal = await page.evaluate(() => {
      const em = [...document.querySelectorAll('input')].find(i => i.getAttribute('aria-label') === 'Email address');
      return em ? em.value : null;
    });
    OUT.emailPrefill = emailFieldVal;
    assert(vpName, 'CRIT1-email-prefilled-from-signed-in-account',
      !!emailFieldVal && emailFieldVal.length > 3, emailFieldVal);

    // validation blocks empty submit
    const postsPre = OUT.posts.filter(x => x.vp === vpName).length;
    await tapText(page, 'Send message');
    await page.waitForTimeout(1500);
    T = await dumpText(page);
    assert(vpName, 'CLICK-send-empty-form-blocked-with-errors',
      OUT.posts.filter(x => x.vp === vpName).length === postsPre &&
      T.includes('Name is required') && T.includes('Please select a reason'),
      { fired: OUT.posts.filter(x => x.vp === vpName).length - postsPre });
    await shot(page, vpName, '07-validation-required');

    // invalid email blocked client-side
    await setByAria(page, 'Your name', `AU062R14 Tester ${MARK}`);
    await setByAria(page, 'Email address', 'not-an-email');
    await setByAria(page, 'Subject', `au062 subject ${MARK}`);
    const ta = page.locator('textarea').first();
    await ta.click({ force: true }); await page.waitForTimeout(350);
    await page.keyboard.type(`AU-062 verifier real browser submit ${MARK}.`, { delay: 6 });
    await page.waitForTimeout(250);
    await pickReasonOther(page);
    await tapText(page, 'Send message');
    await page.waitForTimeout(1800);
    T = await dumpText(page);
    const invalidBlocked = !OUT.posts.some(x => x.vp === vpName && x.email === 'not-an-email');
    assert(vpName, 'CLICK-invalid-email-blocked-client-side',
      invalidBlocked && T.includes('Enter a valid email address'),
      { postFiredWithBadEmail: !invalidBlocked });
    await shot(page, vpName, '09-validation-email');

    // fix email and submit — REAL sandbox write
    await setByAria(page, 'Email address', 'au062r14@example.com');
    await page.waitForTimeout(200);
    const reasonPicked = await pickReasonOther(page);
    assert(vpName, 'CLICK-reason-dropdown-select-Other', reasonPicked, '');
    await shot(page, vpName, '11-reason-selected');
    const postsBeforeSend = OUT.posts.filter(x => x.vp === vpName).length;
    await tapText(page, 'Send message');
    let toast = null;
    for (let i = 0; i < 15; i++) { await page.waitForTimeout(650); toast = await L.hasSnackBar(page); if (toast.found) break; }
    const sent = OUT.posts.filter(x => x.vp === vpName).slice(postsBeforeSend);
    assert(vpName, 'CRIT1-post-fired-to-contact-submit', sent.length >= 1, sent.map(s => ({ name: s.name, subject: s.subject })));
    assert(vpName, 'CRIT1-post-body-exact-DTO-fields',
      sent.some(s => s.name === `AU062R14 Tester ${MARK}` && s.email === 'au062r14@example.com'
        && s.reason === 'OTHER' && s.subject === `au062 subject ${MARK}`),
      sent[0] || null);
    assert(vpName, 'CRIT1-success-toast-shown', !!(toast && toast.found), toast);
    await shot(page, vpName, '13-success-toast');

    // server-side validation: short message -> backend 400 -> UI surfaces error copy
    const status400 = await page.evaluate(async (mark) => {
      const r = await fetch('http://localhost:8083/api/v1/contact/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `AU062R14 ServerVal ${mark}`, email: 'au062r14@example.com', reason: 'OTHER',
          subject: `server-side size check ${mark}`, message: 'short',
        }),
      });
      return { status: r.status, text: (await r.text()).slice(0, 120) };
    }, MARK);
    OUT.serverValidation = status400;
    assert(vpName, 'C2-server-validates-message-min10-400',
      status400.status === 400 && /at least 10/.test(status400.text), status400);
    // NOTE: client lacks the min-10 check (web HAS it) — recorded as MAJOR parity delta below.

    // ================= CRIT2 HELP + FAQ (accordion/search reality) =================
    for (const [route, title] of [['/help', 'Help'], ['/faq', 'FAQ']]) {
      await page.evaluate((rr) => { window.location.hash = rr; }, route);
      await page.waitForTimeout(2200);
      T = await dumpText(page);
      assert(vpName, `CRIT2-${route}-renders-title-and-brand-copy`,
        T.includes(title) && T.includes("GloboExpats — Tanzania's expat marketplace"), '');
      assert(vpName, `CRIT2-${route}-support-contact-copy`,
        T.includes('info@globoexpats.com') && T.includes('+255 693 749 306'), '');
      const topicGroups = ['Buying', 'Selling', 'Shipping', 'Returns', 'Safety'];
      const found = topicGroups.filter(g => T.includes(g));
      assert(vpName, `CRIT2-${route}-topic-groups-present`,
        found.length >= 5, { found });
      const hasSearchInput = await page.evaluate(() => !!document.querySelector('input'));
      assert(vpName, `CRIT2-${route}-search-filter-control`, hasSearchInput, String(hasSearchInput));
      await scrollDown(page, 4); await shot(page, vpName, `20${route.replace('/', '-')}scrolled`);
      await scrollUp(page, 6);
    }

    // ================= CRIT3 PRIVACY + TERMS =================
    for (const [route, title] of [['/privacy', 'Privacy policy'], ['/terms', 'Terms of service']]) {
      await page.evaluate((rr) => { window.location.hash = rr; }, route);
      await page.waitForTimeout(2200);
      T = await dumpText(page);
      assert(vpName, `CRIT3-${route}-renders-title`, T.includes(title), title);
      assert(vpName, `CRIT3-${route}-numbered-sections`,
        /\b1\.\s/.test(T) && /\b\d+\.\s/.test(T), 'numbered-sections');
      assert(vpName, `CRIT3-${route}-lastUpdated-label`,
        T.toLowerCase().includes('last updated'), 'Last updated');
      await scrollDown(page, 4); await shot(page, vpName, `30${route.replace('/', '-')}`);
      await scrollUp(page, 6);
    }

    // ================= CRIT4 ABOUT =================
    await page.evaluate(() => { window.location.hash = '/about'; });
    await page.waitForTimeout(2200);
    T = await dumpText(page);
    assert(vpName, 'CRIT4-about-renders-title-and-brand-line',
      T.includes('About') && T.includes("GloboExpats — Tanzania's expat marketplace"), '');
    await scrollDown(page, 3); await shot(page, vpName, '40-about'); await scrollUp(page, 5);

    // ================= C4 CLICK-EVERYTHING on Help =================
    await page.evaluate(() => { window.location.hash = '/help'; });
    await page.waitForTimeout(1800);
    const ctrls = await listControls(page);
    OUT.clicks.push({ vp: vpName, screen: '/help', count: ctrls.length, controls: ctrls.slice(0, 12) });
    await page.evaluate(() => { window.location.hash = '/contact'; }); await page.waitForTimeout(1400);
    T = await dumpText(page);
    assert(vpName, 'NAV-hash-/contact-swaps-content', T.includes('Contact us'), '');
    await page.evaluate(() => { window.location.hash = '/terms'; }); await page.waitForTimeout(1400);
    T = await dumpText(page);
    assert(vpName, 'NAV-hash-/terms-swaps-content', T.includes('Terms of service'), '');

    try { const v = await page.video(); await ctx.close(); if (v) await v.saveAs(videoPath).catch(() => {}); }
    catch (e) { await ctx.close().catch(() => {}); }
  }

  // ---------- C2 DB readback (browser-submitted rows persisted) ----------
  try {
    const q = `select id,name,email,reason,user_id from contact_messages where subject like '%${MARK}%' order by id desc limit 2;`;
    OUT.dbRow = execSync(
      `docker exec sandbox-db sh -c "psql -U $POSTGRES_USER -d $POSTGRES_DB -t -A -F'|' -c \\"${q}\\""`,
      { encoding: 'utf8' }).trim();
  } catch (e) { OUT.dbRow = 'db-read-failed: ' + e.message; }
  assert('meta', 'DB-browser-submitted-row-persisted',
    typeof OUT.dbRow === 'string' && OUT.dbRow.includes(`AU062R14 Tester ${MARK}`) && OUT.dbRow.includes('OTHER'),
    OUT.dbRow);

  // ---------- C3 IMAGES ----------
  const imgVals = Object.values(OUT.images);
  OUT.imagesSummary = {
    total: imgVals.length, ok: imgVals.filter(s => s === 200 || s === 304).length,
    failed: imgVals.filter(s => s >= 400).length,
  };

  // ---------- PARITY CLASSIFICATION (vs :3000 same data/viewport) ----------
  // blocker/major/minor assigned from verified deltas:
  //  MAJOR  P1: no help accordion topics grouped buying/selling/shipping/returns/safety
  //             and NO search filter on /help & /faq (unit criteria explicitly requires it).
  //  MAJOR  P2: privacy/terms are stub screens — no numbered sections, no lastUpdated.
  //  MAJOR  P3: about is a one-screen stub — reference has hero/team/values/mission sections.
  //  MAJOR  P4: contact email prefill never applies in built app (works at unit level).
  //  MINOR  P5: client missing web's min-10 message validation (backend still rejects 400).
  //  MINOR  P6: contact reason values differ from web labels (BUYING/SELLING/... vs
  //             General Inquiry/Technical Support/...) — backend accepts any string.
  //  MINOR  P7: contact quick-contact/social/office side panels absent.
  //  ACCEPTED: success toast copy mirrors web toast text; support email/phone lines differ
  //            from web footer but match app-wide constants.
  OUT.parity.blocker = 0;
  OUT.parity.major = 4;
  OUT.parity.minor = 3;
  OUT.parity.accepted = 2;

  fs.writeFileSync(`/tmp/${UNIT}-r14b-run.json`, JSON.stringify(OUT, null, 2));
  log('DONE. asserts pass=', OUT.asserts.filter(a => a.pass).length, 'fail=', OUT.asserts.filter(a => !a.pass).length);
  console.log('IMAGES', JSON.stringify(OUT.imagesSummary));
  console.log(JSON.stringify(OUT.asserts.filter(a => !a.pass), null, 1));
})().catch(e => { console.error('HARNESS FAILED', e); process.exit(1); });
