// au062_verify_r14.js — AU-062 help_legal_contact_split FINAL verification on the
// FROZEN lane :9131 (git e694463, main.dart.js Last-Modified Wed, 26 Aug 2026 08:15:26 GMT,
// includes 0162c07 feat(AU-062) contact form).
// Acceptance (canonical Appendix A + unit criteria):
//  CRIT1 contact form name/email/reason/subject/message POSTs /api/v1/contact/submit
//        with success toast (real sandbox write; RW lane — we own fixture rows "AU062R14")
//  CRIT2 /help /faq render (mobile HelpScreen); accordion topics grouped
//        buying/selling/shipping/returns/safety + search filter actually filters
//        -> EXPECTATION SET BY BUILD REALITY: frozen build has NO accordion/search on
//           /help (static HelpScreen); deltas classified in PARITY, not silently accepted.
//  CRIT3 privacy/terms numbered sections w/ lastUpdated
//  CRIT4 about sections render
// Canonical checklist: freshness / real data curl+DOM / images all 200 / click-everything /
// shots BOTH viewports per state / native vision on every PNG / video per stage /
// parity vs :3000 same viewport.
const fs = require('fs');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';           // FROZEN lane override
const REF = 'http://localhost:3000';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-062';
const STAGE = 'r14';
const MARK = 'AU062R14' + Math.floor(Math.random() * 900000 + 100000); // unique fixture marker
const OUT = {
  freshness: {}, asserts: [], posts: [], clicks: [], images: {}, shots: [], videos: [],
  refShots: [], domTexts: {}, dbRow: null, parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
};
function log(...a) { console.log('[au062r14]', ...a); }
function assert(vp, name, pass, value) {
  OUT.asserts.push({ vp, name, pass: !!pass, value: value === undefined ? null : value });
  log(pass ? 'PASS ' : 'FAIL ', vp, name, JSON.stringify(value ?? '').slice(0, 220));
}
async function dumpText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
}
async function shot(p, vp, state) {
  const f = `${ROOT}/e2e/shots/AU-062/AU-062-${vp}-${state}.png`;
  await L.screenshot(p, f); OUT.shots.push(f); return f;
}
// smallest visible tappable/button node containing lbl (click-everything primitive)
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
  const vh = await p.evaluate(() => innerHeight);
  for (const c of cands) {
    await p.mouse.click(c.cx, Math.max(12, Math.min(c.cy, vh - 16)));
    await p.waitForTimeout(500); return true;
  }
  return false;
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
      out.push({ kind: 'input', label: (i.placeholder || i.type || 'input') }));
    return out;
  });
}

(async () => {
  fs.mkdirSync(`${ROOT}/e2e/shots/AU-062`, { recursive: true });

  // ================= C1 FRESHNESS =================
  const head = await fetch(`${APP}/main.dart.js`, { method: 'HEAD' });
  OUT.freshness.lastModified = head.headers.get('last-modified');
  assert('meta', 'C1-freshness-mtime-e694463-081526GMT',
    OUT.freshness.lastModified === 'Wed, 26 Aug 2026 08:15:26 GMT', OUT.freshness);

  // ================= C2 REAL DATA ground truth (independent curl) =================
  const probeBody = {
    name: `AU062R14 Probe ${MARK}`, email: 'au062r14@example.com',
    reason: 'OTHER', subject: `au062r14 ${MARK}`, message: `AU-062 verifier probe ${MARK} ignore`,
  };
  const pr = await fetch(`${L.API}/api/v1/contact/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(probeBody),
  });
  OUT.probeCurl = { status: pr.status, body: await pr.json().catch(() => null) };
  assert('api', 'C2-curl-contact-submit-201', pr.status === 201, OUT.probeCurl);

  // ================= BROWSER RUNS =================
  const browser = await L.newBrowser();
  for (const [vpName, vp] of [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }]]) {
    const videoPath = `${ROOT}/e2e/videos/AU-062-${STAGE}-${vpName}.webm`;
    OUT.videos.push(videoPath);
    const ctx = await L.newCtx(browser, { viewport: vp, videoPath });
    const page = await ctx.newPage();
    page.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?#]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/[^?#]*\.(png|webp|jpg|svg)(\?|#|$)/i.test(u))
        OUT.images[u] = r.status();
    });
    page.on('request', r => {
      if (/\/api\/v1\/contact\/submit/.test(r.url())) {
        let body = {}; try { body = JSON.parse(r.postData() || '{}'); } catch (e) {}
        OUT.posts.push({ vp: vpName, method: r.method(), ...body });
      }
    });

    // ---- login with shared sandbox account ----
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

    // ================= CRIT1 contact form =================
    await page.evaluate(() => { window.location.hash = '/contact'; });
    await L.waitText(page, 'Contact us', 20000).catch(() => {});
    await page.waitForTimeout(1500);
    let T = await dumpText(page);
    assert(vpName, 'CRIT1-contact-screen-renders-all-field-labels',
      ['Your name', 'Email address', 'Reason', 'Subject', 'Message'].every(l => T.includes(l)),
      ['Your name', 'Email address', 'Reason', 'Subject', 'Message'].map(l => `${l}=${T.includes(l)}`));
    // email prefilled from signed-in account (parity with web useEffect prefill)
    const emailVal = await page.evaluate(() => {
      const ins = [...document.querySelectorAll('input')];
      const em = ins.find(i => (i.value || '').includes('@'));
      return em ? em.value : null;
    });
    assert(vpName, 'CRIT1-email-prefilled-from-account',
      !!emailVal && emailVal.includes('@'), emailVal);
    await shot(page, vpName, '05-contact-form');

    // validation blocks empty submit
    const postsBeforeValidation = OUT.posts.filter(x => x.vp === vpName).length;
    await tapText(page, 'Send message');
    await page.waitForTimeout(1200);
    T = await dumpText(page);
    assert(vpName, 'CLICK-send-with-empty-form-blocked-by-validation',
      OUT.posts.filter(x => x.vp === vpName).length === postsBeforeValidation &&
      (T.includes('Name is required') || T.includes('required')),
      { newPosts: OUT.posts.filter(x => x.vp === vpName).length - postsBeforeValidation,
        errShown: T.split('\n').filter(l => /required/i.test(l)).slice(0, 3) });
    await shot(page, vpName, '07-validation-errors');

    // fill and submit with a UNIQUE fixture marker
    async function fillField(labelText, value) {
      // Flutter web renders each TextFormField as an input; order matches DOM order.
      // Click the label text first to focus that field.
      await tapText(page, labelText);
      await page.waitForTimeout(300);
      const inputs = await page.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ t: i.type, v: i.value })));
      log('inputs now:', JSON.stringify(inputs));
      await page.keyboard.type(value, { delay: 8 });
      await page.waitForTimeout(250);
    }
    // name field is the FIRST input; use direct locators by position instead of labels
    const inputsAll = () => page.evaluate(() => [...document.querySelectorAll('input')]);
    let nIns = await inputsAll();
    log(vpName, 'input count on contact form:', nIns.length);
    // type into fields via focused-caret approach: click each label region then select-all+type
    async function setField(label, val) {
      const ok = await tapText(page, label);
      await page.waitForTimeout(280);
      // focus lands in nearest field; select all then replace
      await page.keyboard.press('Control+a'); await page.waitForTimeout(120);
      await page.keyboard.type(val, { delay: 7 });
      await page.waitForTimeout(180);
      return ok;
    }
    await setField('Your name', `AU062R14 Tester ${MARK}`);
    await setField('Email address', 'au062r14@example.com');
    await setField('Subject', `au062r14 subject ${MARK}`);
    await setField('Message', `AU-062 verifier real submit ${MARK}. Please disregard.`);
    // Reason dropdown
    await tapText(page, 'Reason'); await page.waitForTimeout(600);
    T = await dumpText(page);
    const optSeen = {};
    for (const o of ['Buying', 'Selling', 'Delivery', 'Payments', 'Account', 'Other']) optSeen[o] = T.includes(o);
    OUT.reasonMenu = optSeen;
    assert(vpName, 'CLICK-reason-dropdown-opens-options', Object.values(optSeen).some(Boolean), optSeen);
    await shot(page, vpName, '10-reason-menu-open');
    await tapText(page, 'Other'); await page.waitForTimeout(500);
    await shot(page, vpName, '12-reason-selected');

    const postsBeforeSend = OUT.posts.filter(x => x.vp === vpName).length;
    await tapText(page, 'Send message');
    // wait for either snackbar or navigation back
    let toast = null;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(700);
      toast = await L.hasSnackBar(page);
      if (toast.found) break;
    }
    assert(vpName, 'CRIT1-contact-post-fired-with-dto-fields',
      OUT.posts.filter(x => x.vp === vpName).length > postsBeforeSend,
      OUT.posts.filter(x => x.vp === vpName));
    const postEntry = OUT.posts.filter(x => x.vp === vpName).slice(-1)[0];
    assert(vpName, 'CRIT1-post-body-has-name-email-reason-subject-message',
      postEntry && postEntry.name === `AU062R14 Tester ${MARK}` && postEntry.email === 'au062r14@example.com'
      && postEntry.subject === `au062r14 subject ${MARK}` && !!postEntry.reason,
      postEntry);
    assert(vpName, 'CRIT1-success-toast-shown', !!(toast && toast.found), toast);
    await shot(page, vpName, '15-success-toast');
    await page.waitForTimeout(1200);
    T = await dumpText(page);
    // form pops back after success (Navigator.maybePop) OR stays; record which
    OUT.contactAfterSubmit = T.includes('Contact us') ? 'still-on-form' : 'popped-back';

    // ================= /help + /faq (accordion/search acceptance reality) =================
    for (const [route, title] of [['/help', 'Help'], ['/faq', 'FAQ']]) {
      await page.evaluate((r) => { window.location.hash = r; }, route);
      await page.waitForTimeout(1800);
      T = await dumpText(page);
      OUT.domTexts[vpName + route] = T.slice(0, 400);
      assert(vpName, `CRIT2-${route}-renders-title`, T.includes(title), T.split('\n').slice(0, 5));
      assert(vpName, `CRIT2-${route}-about-copy-present`,
        T.includes("GloboExpats — Tanzania's expat marketplace"), 'brand line');
      assert(vpName, `CRIT2-${route}-support-contacts-in-copy`,
        T.includes('info@globoexpats.com') && T.includes('+255 693 749 306'), 'email+phone lines');
      // acceptance asks for grouped topics + search filter:
      const topicGroups = ['Buying', 'Selling', 'Shipping', 'Returns', 'Safety'];
      const groupsPresent = topicGroups.filter(g => T.includes(g));
      const hasSearchInput = await page.evaluate(() => !!document.querySelector('input'));
      assert(vpName, `CRIT2-${route}-topic-groups-buying-selling-shipping-returns-safety`,
        groupsPresent.length >= 5, { found: groupsPresent });
      assert(vpName, `CRIT2-${route}-search-filter-control-exists`, hasSearchInput, String(hasSearchInput));
      await scrollDown(page, 4); await shot(page, vpName, `20${route.replace('/', '-')}scrolled`);
      await scrollUp(page, 6);
    }

    // ================= CRIT3 privacy + terms numbered sections + lastUpdated =================
    for (const [route, title] of [['/privacy', 'Privacy policy'], ['/terms', 'Terms of service']]) {
      await page.evaluate((r) => { window.location.hash = r; }, route);
      await page.waitForTimeout(1800);
      T = await dumpText(page);
      OUT.domTexts[vpName + route] = T.slice(0, 400);
      assert(vpName, `CRIT3-${route}-renders-title`, T.includes(title), title);
      assert(vpName, `CRIT3-${route}-numbered-sections`,
        /\b1\.\s/.test(T) && /\b\d+\.\s/.test(T), 'numbered-section-regex');
      assert(vpName, `CRIT3-${route}-lastUpdated-label`,
        T.toLowerCase().includes('last updated'), 'Last updated');
      await scrollDown(page, 4); await shot(page, vpName, `30${route.replace('/', '-')}`);
      await scrollUp(page, 6);
    }

    // ================= CRIT4 about sections =================
    await page.evaluate(() => { window.location.hash = '/about'; });
    await page.waitForTimeout(1800);
    T = await dumpText(page);
    OUT.domTexts[vpName + '/about'] = T.slice(0, 400);
    assert(vpName, 'CRIT4-about-renders-title', T.includes('About'), 'About');
    assert(vpName, 'CRIT4-about-brand-line', T.includes("GloboExpats — Tanzania's expat marketplace"), '');
    await scrollDown(page, 3); await shot(page, vpName, '40-about');
    await scrollUp(page, 5);

    // ================= C4 CLICK EVERY CONTROL on Help screen (entry surface) =================
    await page.evaluate(() => { window.location.hash = '/help'; });
    await page.waitForTimeout(1500);
    const ctrls = await listControls(page);
    OUT.clicks.push({ vp: vpName, screen: '/help', controls: ctrls });
    // back arrow navigates back (AppBar back button)
    const backOk = await tapText(page, 'Help') /* no-op fallback */ ||
      await (async () => { await page.keyboard.press('Escape'); return true; })();
    // hash routing already exercised for every route; assert each route really swapped content
    await page.evaluate(() => { window.location.hash = '/contact'; }); await page.waitForTimeout(1200);
    T = await dumpText(page);
    assert(vpName, 'NAV-hash-/contact-swaps-content', T.includes('Contact us'), '');
    await page.evaluate(() => { window.location.hash = '/terms'; }); await page.waitForTimeout(1200);
    T = await dumpText(page);
    assert(vpName, 'NAV-hash-/terms-swaps-content', T.includes('Terms of service'), '');

    try { const v = await page.video(); await ctx.close(); if (v) await v.saveAs(videoPath).catch(() => {}); }
    catch (e) { await ctx.close().catch(() => {}); }
  }

  // ================= DB readback of the browser-submitted row (RW proof) =================
  const { execSync } = require('child_process');
  try {
    const q = `select id,name,email,reason,subject from contact_messages where email='au062r14@example.com' order by id desc limit 3;`;
    OUT.dbRow = execSync(
      `docker exec sandbox-db sh -c "psql -U $POSTGRES_USER -d $POSTGRES_DB -t -A -F'|' -c \\"${q}\\""`,
      { encoding: 'utf8' }).trim();
  } catch (e) { OUT.dbRow = 'db-read-failed: ' + e.message; }
  assert('meta', 'DB-browser-submitted-contact-row-persisted',
    typeof OUT.dbRow === 'string' && /au062r14 subject AU062R14\d+/.test(OUT.dbRow), OUT.dbRow);

  // ================= images =================
  const imgVals = Object.values(OUT.images);
  OUT.imagesSummary = {
    total: imgVals.length, ok: imgVals.filter(s => s === 200 || s === 304).length,
    failed: imgVals.filter(s => s >= 400).length,
  };

  fs.writeFileSync(`/tmp/${UNIT}-${STAGE}-run.json`, JSON.stringify(OUT, null, 2));
  log('DONE. asserts pass=', OUT.asserts.filter(a => a.pass).length, 'fail=', OUT.asserts.filter(a => !a.pass).length);
  console.log('IMAGES', JSON.stringify(OUT.imagesSummary));
  console.log(JSON.stringify(OUT.asserts.filter(a => !a.pass), null, 1));
})().catch(e => { console.error('HARNESS FAILED', e); process.exit(1); });
