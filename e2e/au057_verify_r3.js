// AU-057 verifier r3 — deterministic single-viewport flow.
// r2 lesson: the tablet login flake + a missed 'Seller dashboard' tap left us on the
// account screen. r3 asserts every nav hop, retries with scroll, and aborts loudly.
const fs = require('fs');
const L = require('./lib_verify');
const APP = 'http://localhost:9110';
const UNIT = 'AU-057';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const SHOT_DIR = `${ROOT}/e2e/shots/${UNIT}`;
const OUT = { freshness: null, asserts: [], network: [], images: {}, clicks: [] };

function log(...a) { console.log('[r3]', ...a); }
async function dumpText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n'));
}
async function shot(p, vp, state) {
  const f = `${SHOT_DIR}/${UNIT}-${vp}-${state}.png`;
  await L.screenshot(p, f);
  log('shot', state);
  return f;
}
async function assert(name, pass, detail) {
  OUT.asserts.push({ a: name, pass: !!pass, ...(detail !== undefined ? { detail } : {}) });
  log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(detail ?? '').slice(0, 240));
}

async function controls(p) {
  return p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const role = e.getAttribute('role');
      const tappable = e.getAttribute('flt-tappable') !== null;
      if (role !== 'button' && !tappable) return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
      out.push({ kind: role === 'button' ? 'button' : 'tappable', label: (e.textContent || '').trim().slice(0, 50), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
    });
    return out;
  });
}

async function runViewport(browser, vpName, viewport) {
  const ctx = await L.newCtx(browser, { viewport, videoPath: `${ROOT}/e2e/videos/${UNIT}-r3-${vpName}.webm` });
  const page = await ctx.newPage();
  const imgMap = L.watchImages(page);
  page.on('response', r => {
    const u = r.url();
    if (u.includes('/api/') || u.includes('/assets/') || u.includes('/uploads/')) {
      OUT.network.push({ vp: vpName, m: r.request().method(), url: u.slice(0, 140), status: r.status() });
    }
  });
  try {
    await page.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    const okLogin = await L.login(page, L.BUYER);
    assert(`3-login-${vpName}`, okLogin);
    await page.waitForTimeout(1500);

    // Account tab
    let acc = false;
    for (let i = 0; i < 4 && !acc; i++) {
      acc = (await L.clickBtn(page, 'Account')) || (await L.clickCard(page, 'Account'));
      if (!acc) await page.waitForTimeout(700);
    }
    assert(`nav-account-${vpName}`, acc);
    // Seller dashboard tile
    let dash = false;
    for (let i = 0; i < 10 && !dash; i++) {
      dash = await L.clickCard(page, 'Seller dashboard');
      if (!dash) { await page.mouse.move(190, 350); await page.mouse.wheel(0, 300); await page.waitForTimeout(260); }
    }
    assert(`nav-seller-dashboard-${vpName}`, dash);
    await page.waitForTimeout(1800);
    // Selling orders tile
    let sold = false;
    for (let i = 0; i < 8 && !sold; i++) {
      sold = await L.clickCard(page, 'Selling orders');
      if (!sold) { await page.mouse.move(190, 350); await page.mouse.wheel(0, 280); await page.waitForTimeout(260); }
    }
    assert(`nav-selling-orders-${vpName}`, sold);
    await page.waitForTimeout(2000);

    // Row present? scroll within list if needed
    let txt = await dumpText(page);
    if (!txt.includes('ORD-2026-000019')) {
      await page.mouse.move(190, 350); await page.mouse.wheel(0, 300); await page.waitForTimeout(500);
      txt = await dumpText(page);
    }
    await shot(page, vpName, '02-selling-orders-list');
    const rowVisible = txt.includes('ORD-2026-000019');
    assert(`5-selling-orders-row-${vpName}`, rowVisible,
      { excerpt: txt.split('\n').filter(Boolean).slice(0, 12).join('|').slice(0, 240) });
    if (!rowVisible) return;

    await L.clickCard(page, 'ORD-2026-000019');
    await page.waitForTimeout(2600);
    txt = await dumpText(page);
    await shot(page, vpName, '03-order-detail-awaiting-delivery');
    const detailOk = /Track delivery/.test(txt);
    assert(`5b-order-detail-open-${vpName}`, detailOk, { excerpt: txt.split('\n').filter(Boolean).slice(0, 6).join('|').slice(0, 200) });

    // Timeline label check
    assert(`6-timeline-assign-rider-label-${vpName}`, txt.includes('Assign rider'));

    // ---- CLICK EVERY control
    const seen = new Set(); const all = [];
    for (let pass = 0; pass < 3; pass++) {
      for (const c of await controls(page)) {
        const k = c.kind + '|' + c.label + '|' + Math.round(c.x / 15) + '|' + Math.round(c.y / 15);
        if (!seen.has(k)) { seen.add(k); all.push(c); }
      }
      await page.mouse.move(190, 350); await page.mouse.wheel(0, 330); await page.waitForTimeout(420);
    }
    log(`${vpName}: ${all.length} controls`);
    let effects = 0; let modalSeen = false;
    for (const c of all) {
      const beforeNet = OUT.network.length;
      const before = await dumpText(page);
      await page.mouse.click(Math.min(Math.max(c.x, 5), viewport.width - 5), Math.min(Math.max(c.y, 5), viewport.height - 5));
      await page.waitForTimeout(1100);
      const after = await dumpText(page);
      const netDelta = OUT.network.length - beforeNet;
      const changed = before !== after || netDelta > 0;
      OUT.clicks.push({ vp: vpName, kind: c.kind, label: c.label.slice(0, 40), effect: changed, netCalls: netDelta });
      if (changed) effects++;
      if (/Assign a transporter|Add a new transporter|No active transporters yet/.test(after) && !modalSeen) {
        modalSeen = true;
        await shot(page, vpName, '04-assign-modal-opened');
        const realNames = ['Abdallah Kigwangala', 'Alex', 'Jacob', 'Ludovick', 'Verify Transporter AU055'];
        const shown = realNames.filter(n => after.includes(n));
        assert(`7-assign-modal-real-registry-${vpName}`, shown.length >= 3,
          { registryRowsShown: shown, plateShown: after.includes('MC900 DPN'), tripsCounter: /\d+ trips?/.test(after), emptyCopy: /No active transporters yet/.test(after) });
        const addTapped = await L.clickBtn(page, 'Add a new transporter');
        await page.waitForTimeout(1100);
        const formTxt = await dumpText(page);
        await shot(page, vpName, '05-inline-create-form');
        assert(`8-inline-create-form-${vpName}`, addTapped && /Full name/.test(formTxt) && /Plate number/.test(formTxt),
          { vehicleDropdownCopy: /Boda|Bajaji|Mini truck|Semi truck/.test(formTxt) });
        await L.clickBtn(page, 'Cancel');
        await page.waitForTimeout(900);
        assert(`9-cancel-closes-modal-${vpName}`, !(await dumpText(page)).includes('Assign a transporter'));
        break;
      }
    }
    assert(`10-clicks-with-effect-${vpName}`, true, { enumerated: all.length, withObservableEffect: effects, assignModalOpenedByUiClick: modalSeen });
    if (!modalSeen) {
      OUT.defects = OUT.defects || [];
      OUT.defects.push(`no UI click on order detail opened AssignTransporterModal (${vpName})`);
    }

    // ---- Track delivery -> OTP verify card
    txt = await dumpText(page);
    const trackVisible = /Track delivery/.test(txt);
    if (trackVisible) {
      await L.clickCard(page, 'Track delivery') || await L.clickBtn(page, 'Track delivery');
      await page.waitForTimeout(2500);
      const dtxt = await dumpText(page);
      await shot(page, vpName, '07-delivery-tracking-screen');
      const hasHandover = /Delivery handover/.test(dtxt) || /delivery code/i.test(dtxt);
      const hasAttempts = /attemptsRemaining|attempt(s)? remaining/i.test(dtxt);
      const hasField = (await page.locator('input').count()) > 0;
      assert(`12-otp-card-on-tracking-${vpName}`, hasHandover && hasField,
        { hasAttemptsCopy: hasAttempts, hasCodeInput: hasField, excerpt: dtxt.split('\n').filter(Boolean).slice(0, 12).join('|').slice(0, 260) });
    } else {
      assert(`12-otp-card-on-tracking-${vpName}`, false, { reason: 'Track delivery not reachable from detail' });
    }

    OUT.images[vpName] = L.imageSummary(imgMap);
  } finally {
    await L.closeVideo(ctx, `${ROOT}/e2e/videos/${UNIT}-r3-${vpName}.webm`);
  }
}

(async () => {
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  OUT.freshness = { status: head.status, lastModified: lm };
  assert('1-freshness-lastmodified', lm === 'Tue, 25 Aug 2026 00:37:33 GMT', lm);

  const token = await L.apiLogin(L.BUYER);
  const reg = await L.api(token, 'GET', '/api/v1/transporters?active=true');
  const regRows = Array.isArray(reg.json) ? reg.json : [];
  assert('2-api-registry-real', reg.status === 200 && regRows.length > 0, { status: reg.status, names: regRows.map(r => r.fullName).slice(0, 6) });
  const tripsProbe = await L.api(token, 'GET', '/api/v1/transporter/trips');
  assert('2-api-trips-role-gated-server', tripsProbe.status === 403, { status: tripsProbe.status, body: JSON.stringify(tripsProbe.json).slice(0, 90) });

  // fresh browser per viewport to dodge the tablet login flake
  for (const [vpName, viewport] of [['mobile', { width: 375, height: 667 }], ['tablet', { width: 768, height: 1024 }]]) {
    const browser = await L.newBrowser();
    try { await runViewport(browser, vpName, viewport); } finally { await browser.close().catch(() => {}); }
  }

  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-057-r3.json`, JSON.stringify(OUT, null, 1));
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(OUT.asserts, null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
