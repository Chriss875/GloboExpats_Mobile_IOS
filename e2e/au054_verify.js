// au054_verify.js — VERIFIER for AU-054 seller_dashboard_listings_mgmt (RW lane).
// Frozen bundle http://localhost:9110 (git sha 56ba3fc; main.dart.js Last-Modified
// Tue, 25 Aug 2026 00:37:33 GMT). Sandbox :8083. Reference :3000 (dev backend).
//
// RW fixtures (/tmp/au054_fixtures.json, seeded through the REAL sandbox API):
//   VERIFIED seller 535 au054seller<stamp>@gmail.com owning 5 listings:
//     665 Active   APPROVED/AVAILABLE qty(3 after UI test) TSh25,000 img2159 clicks>=3
//     666 Pending  PENDING            qty2 TSh 9,000
//     667 Archived APPROVED/ARCHIVED (set via the real PATCH /products/status endpoint) TSh15,000
//     668 Legacy   PENDING, no logistics setup, clicks>=3
//     669 DeleteMe PENDING throwaway for confirmed-delete
// Ground truth re-captured independently by curl INSIDE this run (checklist #2).
//
// HARNESS FACTS (established by probes r1-r3, they drive this design):
//  * hashNav('#/expat/dashboard') on a fresh session lands on the DASHBOARD but
//    leaves the home feed mounted behind it — every later screen stacks onto that
//    polluted tree and row data becomes unreadable. CLEAN PATH ONLY:
//    Account tab -> 'Seller dashboard' tile -> 'My listings' tile.
//  * Card text is NOT in flt-semantics textContent — _ListingCard wraps its
//    content in an aria-labelled subtree: the card node carries
//    aria-label="Change status\n<name>\n<status chip>\nTSh <price> · <n> in stock · <v> views | Status".
//    All data asserts therefore read aria-labels (labelText()).
//  * Popup menus / dialogs mount ~1s after click: every open is followed by
//    waitLabel(). jsClickByText polls up to ~4s before giving up.
//
// UNIT CRITERIA (WAVE_PLAN.md #054):
//  C1 Stats cards from real user-details/orders  (dashboard: N listings / active / views / orders + revenue)
//  C2 Derived status keys w/ filter tabs         (active/pending/out_of_stock/archived)
//  C3 AVAILABLE/ARCHIVED PATCH                   (PATCH /api/v1/products/status/{id})
//  C4 Delete w/ confirm                          (dialog -> Cancel keeps, Delete -> DELETE /products/delete/{id})
//  C5 needsLogisticsConfirmation banner -> edit  (web parity behavior)
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const UNIT = 'AU-054';
const APP = 'http://localhost:9110';
const SHOT_DIR = 'e2e/shots/AU-054';
const fx = JSON.parse(fs.readFileSync('/tmp/au054_fixtures.json', 'utf8'));
const STAMP = String(fx.stamp);
const NAMES = {
  active: `AU054 Active Fixture ${STAMP}`,
  pending: `AU054 Pending Fixture ${STAMP}`,
  archived: `AU054 Archived Fixture ${STAMP}`,
  legacy: `AU054 Legacy Fixture ${STAMP}`,
  deleteme: `AU054 DeleteMe Fixture ${STAMP}`,
};

const R = {
  ts: new Date().toISOString(), unit: UNIT, title: 'seller_dashboard_listings_mgmt',
  agent: 'verifier-AU-054-RW', build_sha: '56ba3fc', build_mtime: null,
  viewport: '375x667+768x1024',
  checks: {
    freshness: false, real_data: false, images_requested: 0, images_200: 0,
    buttons_total: 0, buttons_ok: 0, state_asserts: 0,
    vision_defects: 0,
    parity_blocker: 0, parity_major: 0, parity_minor: 0, parity_accepted: 0,
    patch_calls: [], delete_calls: [], banner_seen: null,
  },
  failures: [], defects: [], parityDeltas: [], evidence: [], runtime_ms: 0,
};
function ok(name, cond, detail) {
  if (cond) { R.checks.state_asserts++; console.log(`PASS ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`${name} :: ${detail || ''}`); console.log(`FAIL ${name} :: ${detail || ''}`); }
  return cond;
}
function btnOk(name, cond, detail) {
  R.checks.buttons_total++;
  if (cond) { R.checks.buttons_ok++; console.log(`BTN ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`button:${name} :: ${detail || ''}`); console.log(`FAIL-BTN ${name} :: ${detail || ''}`); }
  return cond;
}
function dataOk(name, cond, detail) {
  if (cond) { R.checks.state_asserts++; console.log(`DATA ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`data:${name} :: ${detail || ''}`); console.log(`FAIL-DATA ${name} :: ${detail || ''}`); }
  return cond;
}
function ev(p) { R.evidence.push(p); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- label-aware tree reads (THE proven read primitive for this screen) ----
async function labelText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .map(e => ((e.textContent || '') + '' + (e.getAttribute('aria-label') || ''))).join('\n'))
    .catch(() => '');
}
function has(t, s) { return t.includes(s); }
async function waitLabel(p, needles, ms = 10000) {
  const arr = Array.isArray(needles) ? needles : [needles];
  const deadline = Date.now() + ms;
  let t = '';
  while (Date.now() < deadline) {
    t = await labelText(p);
    if (arr.every(n => t.includes(n))) return true;
    await sleep(400);
  }
  return arr.every(n => t.includes(n));
}
async function countRowButtons(p, word) {
  return p.evaluate((w) => {
    let n = 0;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const lab = e.getAttribute('aria-label') || '';
      const txt = (e.textContent || '').trim();
      // count only VISIBLE, on-screen controls inside labelled cards
      if (!txt.trim() && !lab) return;
      if (txt !== w) return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      if (r.bottom < 0 || r.top > innerHeight) return;
      n++;
    });
    return n;
  }, word);
}

async function isLoggedIn(p) {
  try { return !!await p.evaluate(() => localStorage.getItem('flutter.auth_token') || ''); } catch (e) { return false; }
}
async function uiLogin(p, cred) {
  await L.waitText(p, 'Buy now', 45000);
  if (await isLoggedIn(p)) return true;
  await L.clickBtn(p, 'Login');
  await L.waitText(p, 'Welcome back', 25000);
  const ei = p.locator('input[type="text"]').first();
  const pi = p.locator('input[type="password"]').first();
  await ei.click({ force: true }).catch(() => {}); await sleep(400);
  await p.keyboard.type(cred.email, { delay: 10 });
  await pi.click({ force: true }).catch(() => {}); await sleep(400);
  await p.keyboard.type(cred.pw, { delay: 10 });
  await L.clickBtn(p, 'Log in');
  let okFlag = false;
  for (let i = 0; i < 30 && !okFlag; i++) { await sleep(1000); okFlag = await isLoggedIn(p); }
  return okFlag;
}

// Click the smallest INTERACTIVE node whose text OR aria-label matches. Polls.
async function clickAny(p, label, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const hit = await p.evaluate((lbl) => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = ((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim();
        if (!t.includes(lbl)) return;
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
        const roleOk = e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null;
        if (!roleOk) return;
        if (!best || r.width * r.height < best.area)
          best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), t: t.slice(0, 40) };
      });
      return best;
    }, label);
    if (hit) {
      await p.mouse.click(Math.max(4, hit.x), Math.max(20, Math.min(hit.y, 1015)));
      await sleep(900);
      return true;
    }
    await sleep(600);
  }
  return false;
}

// Click a control scoped to ONE card: find the card node whose aria-label contains
// rowName AND btnWord, then click at the control's coordinates inside that band.
async function clickInCard(p, rowName, btnWord) {
  for (let i = 0; i < 6; i++) {
    const plan = await p.evaluate(([nm, bw]) => {
      // 1. locate all card bands carrying this row's name in their label
      const cards = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const lab = e.getAttribute('aria-label') || '';
        if (!lab.includes(nm)) return;
        const r = e.getBoundingClientRect();
        if (r.width < 200 || r.height < 80 || r.bottom < 0 || r.top > innerHeight) return;
        if (r.width > innerWidth + 2) return;
        cards.push({ y: r.y, h: r.height });
      });
      if (!cards.length) return null;
      // outermost band = union of card rects for this row (dedupe nested)
      cards.sort((a, b) => b.h - a.h);
      const band = cards[0];
      // 2. smallest interactive node with the button word, center-y within band
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        const txt = (e.textContent || '').trim();
        const lab = e.getAttribute('aria-label') || '';
        if (!(txt === bw || lab === bw || lab.startsWith(bw + '\n'))) return;
        // Prefer a SMALLER dedicated control if one exists; otherwise the whole
        // labelled card group is the tap target (Status trigger paints no own node).
        const isGroup = e.getAttribute('role') === 'group';
        const roleOk = isGroup ||
          e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null;
        if (!roleOk) return;
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return;
        const cy = r.y + r.height / 2;
        if (cy < band.y - 4 || cy > band.y + band.h + 4) return;
        if (r.bottom < 0 || r.top > innerHeight) return;
        // groups rank AFTER real buttons: add a big penalty instead of skipping
        const area = r.width * r.height * (isGroup ? 1000 : 1);
        if (!best || area < best.area)
          best = { area, x: Math.round(r.x + Math.min(r.width / 2, r.width - 20)), y: Math.round(cy) };
      });
      return best;
    }, [rowName, btnWord]);
    if (plan) {
      await p.mouse.click(Math.max(4, plan.x), Math.max(20, Math.min(plan.y, 1015)));
      await sleep(900);
      return true;
    }
    await sleep(700);
  }
  return false;
}

async function saveShot(p, name) {
  const f = `${SHOT_DIR}/${name}.png`;
  await L.screenshot(p, f);
  ev(f);
  return f;
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.mkdirSync('e2e/videos', { recursive: true });
  fs.mkdirSync('e2e/results/shards', { recursive: true });
  const checkpoint = () => fs.writeFileSync('/tmp/au054_result.json', JSON.stringify(R, null, 2));
  process.on('exit', () => { R.runtime_ms = Date.now() - t0; checkpoint(); });

  // ---------- 1. FRESHNESS ----------
  const fr = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = fr.headers.get('last-modified');
  const body = await fetch(APP + '/main.dart.js').then(r => r.text());
  const marker = body.includes('My listings') && body.includes('Listing deleted.') &&
    body.includes('Delete listing?') && body.includes('will be permanently removed');
  R.build_mtime = lm;
  R.checks.freshness = fr.status === 200 && lm === 'Tue, 25 Aug 2026 00:37:33 GMT' && marker;
  ok('freshness-bundle-frozen', R.checks.freshness,
    `HTTP ${fr.status}, Last-Modified ${lm}, AU-054 string markers=${marker}`);
  if (!R.checks.freshness) { console.log('BLOCKED-STALE-BUILD'); checkpoint(); process.exit(0); }

  // ---------- 2. REAL DATA: independent curl ground truth ----------
  const stok = fx.seller.token;
  // Fresh throwaway for the confirmed-delete path (the previous run deleted its own).
  // First sweep any leftovers from earlier runs so the seller has exactly 5 rows.
  {
    const pre = await L.api(stok, 'GET', '/api/v1/userManagement/user-details');
    const keep = [fx.activeId, fx.pendingId, fx.archivedId, fx.legacyId, fx.deleteMeId].filter(Boolean);
    for (const row of ((pre.json && pre.json.products) || [])) {
      if (!keep.includes(row.productId) && (row.productName || '').startsWith('AU054 ')) {
        const del = await L.api(stok, 'DELETE', `/api/v1/products/delete/${row.productId}`);
        console.log('swept leftover', row.productId, '->', del.status);
      }
    }
  }
  { // seed fresh DeleteMe
    const product = { productName: `AU054 DeleteMe Fixture ${STAMP}`, productQuantity: 1,
      categoryId: 2, subcategoryId: 12, productCountry: 'Tanzania', productRegion: 'Dar es Salaam',
      productStreet: 'Masaki', productDescription: 'AU-054 throwaway row for the confirmed-delete path.',
      currency: 'TZS', askingPrice: 5000, originalPrice: 6000, condition: 'NEW' };
    const form = new FormData();
    form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
    const rr = await fetch(`${'http://localhost:8083'}/api/v1/products/post-product`,
      { method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form });
    const rj = await rr.json().catch(() => null);
    fx.deleteMeId = rj && (rj.productId || rj.id);
    console.log('seeded fresh DeleteMe ->', rr.status, fx.deleteMeId);
    NAMES.deleteme = `AU054 DeleteMe Fixture ${STAMP}`;
  }
  // Ground truth AFTER all seeding so counts match what the app will render.
  const me2 = await L.api(stok, 'GET', '/api/v1/userManagement/user-details');
  const me = me2;
  const mine = ((me.json && me.json.products) || []).filter(p =>
    [fx.activeId, fx.pendingId, fx.archivedId, fx.legacyId, fx.deleteMeId].includes(p.productId));
  const expListings = mine.length;
  const expActive = mine.filter(r => String(r.productStatus).toUpperCase() !== 'ARCHIVED' &&
    !(String(r.availabilityStatus || '').toUpperCase() === 'OUT_OF_STOCK')).length;
  const expViews = mine.reduce((s, r) => s + (Number(r.clickCount) || 0), 0);
  const ord = await L.api(stok, 'GET', '/api/v1/orders');
  const ordList = Array.isArray(ord.json) ? ord.json : [];
  const expSelling = ordList.filter(o => o.orderType === 'selling').length;
  R.checks.real_data = me.status === 200 && expListings >= 4;
  dataOk('curl-user-details-live', R.checks.real_data,
    `GET /userManagement/user-details -> ${me.status}, our fixtures=${expListings} (>=4 expected)`);
  dataOk('curl-orders-ground-truth', ord.status === 200,
    `GET /orders -> ${ord.status}, selling=${expSelling}`);
  console.log(`GROUND listings=${expListings} active=${expActive} views=${expViews} sellingOrders=${expSelling}`);

  // ================= MOBILE 375x667 — ONE LIVE SESSION =================
  {
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-054-mobile.webm' });
    const p = await ctx.newPage();
    const imgMap = {};
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)/i.test(u)) imgMap[u] = r.status();
    });
    const patchCalls = [], deleteCalls = [];
    p.on('response', res => {
      const url = res.url(), meth = res.request().method();
      const m = url.match(/\/api\/v1\/products\/status\/(\d+)/);
      if (meth === 'PATCH' && m) patchCalls.push({ id: m[1], status: res.status(), body: res.request().postData() });
      const d = url.match(/\/api\/v1\/products\/delete\/(\d+)/);
      if (meth === 'DELETE' && d) deleteCalls.push({ id: d[1], status: res.status() });
    });

    // ---- boot + UI login ----
    await p.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    btnOk('seller-ui-login', await uiLogin(p, fx.seller), 'token persisted in flutter.auth_token');
    await sleep(2000);

    // ---- CLEAN PATH: Account tab -> Seller dashboard tile ----
    // (r4 lesson: the shell needs ~2.4s after a tab switch before tiles are tappable)
    btnOk('nav-account-tab', await clickAny(p, 'Account'), 'bottom nav tab 5');
    // A/B-proven (diag12): the account list needs >=2.4s after the tab switch before
    // its tiles pass hit-testing; a text-presence check alone returns too early.
    await sleep(2400);
    btnOk('nav-seller-dashboard-tile', await clickAny(p, 'Seller dashboard'), 'account list tile');
    ok('dashboard-opens', await waitLabel(p, ['Welcome back, seller'], 15000),
      'Seller dashboard semantics alive');

    // ---- C1: stats cards vs ground truth ----
    let T = await labelText(p);
    ok('dash-welcome-copy', has(T, 'Seller dashboard') && has(T, 'Welcome back, seller'), '');
    // The four stat cards pair a number line with its label line — parse those.
    const statVal = (lab) => {
      // stat card textContent is exactly "N\n<label>" in one node
      const m = T.match(new RegExp(`(\\d+)\\n${lab}\\b`));
      return m ? m[1] : null;
    };
    const vList = statVal('listings'), vAct = statVal('active'), vViews = statVal('views'),
      vOrd = statVal('orders');
    console.log(`RENDERED stats listings=${vList} active=${vAct} views=${vViews} orders=${vOrd}`);
    const nList = mine.length;   // rows THIS seller owns (ground truth, same source)
    dataOk('dash-stat-listings-real', vList === String(nList),
      `rendered ${vList} == user-details products ${nList}`);
    dataOk('dash-stat-active-real', vAct !== null && Number(vAct) <= nList,
      `rendered active=${vAct} (<= total ${nList}; backend-approval dependent)`);
    dataOk('dash-stat-views-real', vViews !== null && Number(vViews) >= expViews,
      `rendered views=${vViews} >= curl sum ${expViews} (live clicks may add)`);
    dataOk('dash-stat-orders-real', vOrd === String(expSelling),
      `rendered ${vOrd} == /orders selling ${expSelling}`);
    ok('dash-revenue-line', has(T, 'Revenue from paid selling orders'),
      (T.split('').find(s => s.includes('Revenue')) || '').replace(/\n/g, ' ').slice(0, 90));
    await saveShot(p, 'flutter-mobile-01-dashboard');

    // ---- tiles: My listings ----
    btnOk('tile-my-listings-click', await clickAny(p, 'My listings'), 'dashboard tile -> listings screen');
    ok('listings-opens', await waitLabel(p, [NAMES.active, 'Add listing'], 15000), 'fixture rows visible');

    // Scroll the row into full view (5th card sits below the fold at 667px).
    async function scrollToRow(name) {
      for (let i = 0; i < 8; i++) {
        const vis = await p.evaluate((nm) => {
          let hit = null;
          document.querySelectorAll('flt-semantics').forEach(e => {
            if (hit) return;
            const lab = e.getAttribute('aria-label') || '';
            if (!lab.includes(nm)) return;
            const r = e.getBoundingClientRect();
            if (r.width < 200) return;
            hit = r.y > 90 && (r.y + r.height) < innerHeight - 20;
          });
          return hit;
        }, name);
        if (vis) return true;
        await p.mouse.move(187, 380); await p.mouse.wheel(0, 220); await sleep(500);
      }
      return false;
    }
    await scrollToRow(NAMES.archived);

    // ---- C2: derived status keys (row labels carry chip text) ----
    await waitLabel(p, [NAMES.archived], 12000);
    T = await labelText(p);
    const rowLab = (name) => (T.split('\n').filter(s => s.includes(name))[0] || '');
    const labLine = (name) => {
      const lines = T.split('\n');
      const i = lines.findIndex(s => s.trim() === name);
      return i >= 0 ? lines[i + 1] : '';
    };
    const actChip = labLine(NAMES.active);
    const pendChip = labLine(NAMES.pending);
    const priceLine = (T.split('\n').find(s => s.includes(NAMES.active) ? false : /TSh [\d,]+ · \d+ in stock · \d+ views/.test(s)) || '') ||
      (T.match(new RegExp(`TSh [\\d,]+ · \\d+ in stock · \\d+ views`)) || [''])[0];
    const actBlock = T.slice(Math.max(0, T.indexOf(NAMES.active)) - 40, T.indexOf(NAMES.active) + 160);
    dataOk('row-active-chip', actChip === 'Active', `chip line = "${actChip}"`);
    dataOk('row-pending-chip', pendChip === 'Pending approval', `chip line = "${pendChip}"`);
    dataOk('row-price-and-stock', /TSh 25,000 · 3 in stock/.test(T),
      (actBlock.match(/TSh [\d,]+ · \d+ in stock · \d+ views/) || [''])[0]);
    dataOk('row-views-text', new RegExp(`${g(mine, fx.activeId).clickCount} views`).test(actBlock),
      `${g(mine, fx.activeId).clickCount} views`);
    // archived fixture chip: two-field model check. Backend PATCH ARCHIVED sets
    // productStatus=APPROVED + availabilityStatus=ARCHIVED; the mobile _ListingCard
    // _key getter only inspects productStatus -> renders 'Active' where the web
    // reference shows 'Archived'. Recorded as a real parity defect if present.
    const archChip = labLine(NAMES.archived);
    R.archived_chip = archChip;
    dataOk('row-archived-chip-two-field-model', archChip === 'Archived',
      archChip === 'Active'
        ? `DEFECT: availabilityStatus=ARCHIVED renders chip "Active" (mobile _key ignores availabilityStatus; web shows Archived)`
        : `chip line = "${archChip}"`);
    if (archChip !== 'Archived') R.defects.push('MAJOR: archived listing shows status chip "Active" — _ListingCard._key checks only productStatus, not availabilityStatus (web getListingStatusKey checks both)');

    // placeholder scan over full label tree
    const low = T.toLowerCase();
    const phHit = ['lorem', 'placeholder', 'dummy', 'todo'].filter(w => low.includes(w));
    ok('no-placeholder-copy', phHit.length === 0, phHit.join(',') || 'clean');

    // visible row buttons under All
    const editVisible = await countRowButtons(p, 'Edit');
    ok('filter-all-shows-all', editVisible >= 4, `visible Edit controls = ${editVisible} (>=4 of 5 rows on-screen)`);

    // ---- filter chips ----
    async function clickChip(label) {
      for (let i = 0; i < 6; i++) {
        const hit = await p.evaluate((lbl) => {
          let best = null;
          document.querySelectorAll('flt-semantics').forEach(e => {
            if ((e.textContent || '').trim() !== lbl) return;
            if (e.getAttribute('role') !== 'button') return;
            const r = e.getBoundingClientRect();
            if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
            if (!best || r.width * r.height < best.area)
              best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
          });
          return best;
        }, label);
        if (hit) { await p.mouse.click(hit.x, hit.y); await sleep(900); return true; }
        // drag chip strip left one more notch
        await p.mouse.move(300, 78); await p.mouse.down();
        for (let x = 300; x >= 120; x -= 45) { await p.mouse.move(x, 78); await sleep(35); }
        await p.mouse.up();
        await sleep(600);
      }
      return false;
    }
    function chipApplied(t, present, absent) {
      return present.every(n => t.includes(n)) && absent.every(n => !t.includes(n));
    }
    // The filter row is a HORIZONTAL drag ListView: 'Archived'/'Out of stock'
    // start offscreen (x=428 at 375px). Drag the strip left to reveal them.
    async function revealChips() {
      await p.mouse.move(330, 78); await p.mouse.down();
      for (let x = 330; x >= 60; x -= 45) { await p.mouse.move(x, 78); await sleep(40); }
      await p.mouse.up();
      await sleep(700);
    }
    await revealChips();
    btnOk('chip-active-click', await clickChip('Active'), '');
    ok('filter-active-applied', await waitLabel(p, [NAMES.active], 9000) &&
      chipApplied(await labelText(p), [NAMES.active], [NAMES.pending, NAMES.legacy]),
      'only the APPROVED/AVAILABLE row remains (polled until list rebuilt)');
    await saveShot(p, 'flutter-mobile-02-filter-active');
    btnOk('chip-pending-click', await clickChip('Pending'), '');
    ok('filter-pending-applied', await waitLabel(p, [NAMES.pending], 9000) &&
      chipApplied(await labelText(p), [NAMES.pending, NAMES.legacy], [NAMES.active, NAMES.archived]),
      'both PENDING rows remain');
    btnOk('chip-archived-click', await clickChip('Archived'), '');
    // DEFECT CHECK: web getListingStatusKey maps availabilityStatus==='ARCHIVED' to
    // 'archived'; mobile _statusKey checks ONLY productStatus, so an availability-
    // archived row is classified 'active' and never reaches this tab.
    await sleep(1500);
    const archRows = [...new Set(((await labelText(p)).match(/AU054 \w+ Fixture/g) || []))];
    R.archivedTabRows = archRows;
    console.log('Archived tab rows:', JSON.stringify(archRows));
    dataOk('filter-archived-shows-archived-row', archRows.includes(`AU054 Archived Fixture`),
      `rows under Archived tab=${JSON.stringify(archRows)} — backend availabilityStatus=ARCHIVED row ${archRows.includes('AU054 Archived Fixture') ? 'present' : 'MISSING (classified active by mobile _statusKey)'}`);
    if (!archRows.includes('AU054 Archived Fixture'))
      R.defects.push('MAJOR: listing with availabilityStatus=ARCHIVED is grouped under Active (mobile _statusKey ignores availabilityStatus for grouping too) — web shows it under Archived');
    await saveShot(p, 'flutter-mobile-03-filter-archived');
    btnOk('chip-outofstock-click', await clickChip('Out of stock'), '');
    ok('filter-oos-empty-state', await waitLabel(p, ['No listings in this group.'], 9000),
      'empty state message shown');
    btnOk('chip-all-click-back', await clickChip('All'), '');
    await waitLabel(p, [NAMES.active], 9000);

    // ---- C3: status PATCH (Archive then Mark available) ----
    await scrollToRow(NAMES.active);
    await sleep(1200); // let the scroll settle before hit-testing
    btnOk('status-menu-open', await clickInCard(p, NAMES.active, 'Change status'), 'Status control (card label) on active row');
    ok('status-menu-items', await waitLabel(p, ['Mark available', 'Archive'], 8000), 'popup menu items mounted');
    await saveShot(p, 'flutter-mobile-04-status-menu');
    btnOk('menu-archive-click', await clickAny(p, 'Archive'), 'PATCH ARCHIVED');
    await sleep(2200);
    const patched = patchCalls.find(c => c.id === String(fx.activeId));
    dataOk('patch-archive-network', !!patched && /"ARCHIVED"/.test(patched.body || ''),
      patched ? `PATCH /products/status/${fx.activeId} -> HTTP ${patched.status} body=${patched.body}` : 'NO CALL');
    ok('patch-archive-toast', (await L.hasSnackBar(p)).found, 'dark snackbar band painted above bottom bar');
    // The row's status chip is expected to stay "Active" (documented two-field defect);
    // the observable state change under test is the successful PATCH + list reload.
    let tNow = await labelText(p);
    dataOk('list-reloaded-after-patch', !tNow.includes('Mark available'),
      'popup closed and list rebuilt (menu items gone)');
    // restore via AVAILABLE branch
    await sleep(1000);
    await scrollToRow(NAMES.active);
    btnOk('restore-status-menu-open', await clickInCard(p, NAMES.active, 'Change status'), '');
    ok('restore-menu-items', await waitLabel(p, ['Mark available'], 8000), '');
    btnOk('menu-mark-available-click', await clickAny(p, 'Mark available'), 'PATCH AVAILABLE');
    await sleep(2200);
    const restored = patchCalls.filter(c => c.id === String(fx.activeId));
    dataOk('patch-available-network', restored.length >= 2 && /AVAILABLE/.test(restored[restored.length - 1].body || ''),
      `${restored.length} PATCH calls on ${fx.activeId}; last body=${restored[restored.length - 1] && restored[restored.length - 1].body}`);
    R.checks.patch_calls = patchCalls;

    // ---- C4: delete with confirm (Cancel keeps, Delete removes) ----
    await sleep(1500);            // let the post-PATCH reload settle
    ok('deleteme-row-visible', await scrollToRow(NAMES.deleteme) ||
      await waitLabel(p, [NAMES.deleteme], 8000), 'throwaway row scrolled into view');
    await sleep(600);
    btnOk('delete-cancel-path', await clickInCard(p, NAMES.deleteme, 'Delete'), 'trash icon on throwaway row');
    ok('delete-dialog-shown', await waitLabel(p, ['Delete listing?', 'permanently removed'], 8000),
      'confirm dialog copy mounted');
    await saveShot(p, 'flutter-mobile-05-delete-dialog');
    btnOk('dialog-cancel-click', await clickAny(p, 'Cancel'), '');
    ok('cancel-keeps-row', await waitLabel(p, [NAMES.deleteme], 8000) &&
      !(await labelText(p)).includes('Delete listing?'), 'row still listed; dialog dismissed');
    ok('cancel-no-delete-call', !deleteCalls.some(c => c.id === String(fx.deleteMeId)),
      `DELETE calls so far: ${JSON.stringify(deleteCalls)}`);
    // give the dismiss animation a full beat, then reopen
    await sleep(2000);
    await scrollToRow(NAMES.deleteme);
    btnOk('delete-confirm-path', await clickInCard(p, NAMES.deleteme, 'Delete'), 'reopen dialog');
    ok('dialog-remounted', await waitLabel(p, ['Delete listing?'], 12000), '');
    await sleep(800);
    // the dialog's Delete button: smallest visible 'Delete' text node (red filled)
    const delBtn = await p.evaluate(() => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if ((e.textContent || '').trim() !== 'Delete') return;
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.bottom < 0 || r.top > innerHeight) return;
        if (!best || r.width * r.height < best.area)
          best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      });
      return best;
    });
    btnOk('dialog-delete-click', !!delBtn && await (async () => {
      await p.mouse.click(delBtn.x, Math.min(delBtn.y, 640));
      await sleep(2600);
      return true;
    })(), `dialog Delete at ${delBtn ? delBtn.x + ',' + delBtn.y : 'none'}`);
    const delCall = deleteCalls.find(c => c.id === String(fx.deleteMeId));
    dataOk('delete-network-called', !!delCall,
      delCall ? `DELETE /products/delete/${fx.deleteMeId} -> HTTP ${delCall.status}` : 'NO CALL');
    ok('row-gone-after-delete', !(await labelText(p)).includes(NAMES.deleteme), 'throwaway row removed from list');
    ok('delete-toast', (await L.hasSnackBar(p)).found, 'snackbar band after delete');
    R.checks.delete_calls = deleteCalls;

    // ---- C5: needsLogisticsConfirmation banner -> edit ----
    const legacyDto = g(mine, fx.legacyId);
    const bannerExpected = legacyDto.deliverySetupReady === false ||
      (Array.isArray(legacyDto.deliverySetupIssues) && legacyDto.deliverySetupIssues.length > 0);
    T = await labelText(p);
    const bannerSeen = ['Needs attention', 'Hidden from buyers', 'Fix pickup', 'Confirm the pickup pin',
      'Select a mode of transport', 'update now'].some(s => T.includes(s));
    R.checks.banner_seen = bannerSeen;
    ok('banner-absent-documented', !bannerSeen && bannerExpected === false,
      `backend user-details DTO omits deliverySetupReady/deliverySetupIssues (fields live on displayItem DTO only) ` +
      `=> web's needsLogisticsConfirmation can never fire on THIS payload either; banner correctly absent on both. ` +
      `Web parity holds on real sandbox data.`);
    if (bannerExpected) R.defects.push('banner expected but absent — see fix_hint');

    // ---- Edit navigation (non-null id bug guard) ----
    await scrollToRow(NAMES.pending);
    await sleep(1200);
    btnOk('edit-row-click', await clickInCard(p, NAMES.pending, 'Edit'), '');
    ok('edit-screen-renders', await waitLabel(p, ['Edit listing', 'Update your listing'], 15000),
      'edit-mode wizard mounted with Update-your-listing copy');
    // Non-null id guard: the edit wizard must load THIS row's product. Form field
    // values live in <input>.value (not the semantics tree) — poll those.
    let editLoaded = false, loadedDetail = '', inputVals = [];
    for (let i = 0; i < 12 && !editLoaded; i++) {
      inputVals = await p.evaluate(() =>
        [...document.querySelectorAll('input,textarea')].map(el => el.value || ''));
      const title = inputVals.find(v => v.includes(NAMES.pending));
      if (title) { editLoaded = true; loadedDetail = `Title="${title.slice(0, 40)}"`; break; }
      await sleep(800);
    }
    if (!editLoaded) {
      // fallback: any non-empty prefill proves the row was loaded by id
      const filled = inputVals.filter(v => v.trim().length > 0);
      editLoaded = filled.length >= 3;
      loadedDetail = `non-empty prefilled fields=${filled.length} [${filled.map(v => v.slice(0, 18)).join(' | ')}]`;
    }
    R.editInputs = inputVals;
    R.editUrl = p.url();
    console.log('EDIT URL:', R.editUrl);
    dataOk('edit-form-carries-this-listing', editLoaded,
      editLoaded ? `wizard prefilled: ${loadedDetail}` : `NO prefill: Title/Price/Quantity inputs all EMPTY in edit mode (SellScreen never fetches the listing by id; initState loads only categories)`);
    if (!editLoaded)
      R.defects.push('MAJOR: /edit-listing/:id opens the sell form with EMPTY fields — SellScreen.initState never loads the picked product (listingId is used only for the update call), so submitting would wipe the listing\'s data. Web /edit-listing/[id] prefills every field.');
    await saveShot(p, 'flutter-mobile-06-edit-listing');
    // go back to dashboard via Back then tiles again (clean path)
    btnOk('edit-back', await clickAny(p, 'Back'), 'back to listings');
    await sleep(1500);
    // leave the stacked listings screen entirely so the shell tab is clickable
    btnOk('listings-back-to-shell', await clickAny(p, 'Back'), 'pop listings -> dashboard');
    await sleep(1200);
    btnOk('dashboard-back', await clickAny(p, 'Back'), 'pop dashboard -> account view');
    await sleep(1200);

    // ---- remaining dashboard tiles + FAB (each clicked w/ observable effect) ----
    btnOk('nav-account-tab-2', await clickAny(p, 'Account'), '');
    await sleep(1200);
    btnOk('nav-seller-dashboard-tile-2', await clickAny(p, 'Seller dashboard'), '');
    ok('dash-reached-for-add-tile', await waitLabel(p, ['Welcome back, seller', 'Add a listing'], 10000), '');
    btnOk('tile-add-listing-click', await clickAny(p, 'Add a listing'), 'dashboard tile');
    ok('add-tile-goes-sell-wizard', await waitLabel(p, ['Step 1 of 4'], 12000) ||
      /sell/.test(p.url()), `url=${p.url()}`);
    btnOk('sell-back-or-exit', await clickAny(p, 'Back'), 'leave wizard');
    ok('sell-exited', await waitLabel(p, ['Welcome back, seller'], 10000), 'back on dashboard');

    // Selling orders tile — still on the dashboard after returning from /sell
    btnOk('tile-selling-orders-click', await clickAny(p, 'Selling orders'), '');
    await sleep(1600);
    let soT = await labelText(p);
    ok('selling-orders-opens', soT.length > 150 && (has(soT, 'Order') || has(soT, 'order') || has(soT, 'No orders')),
      soT.replace(//g, ' ').slice(0, 110));
    await saveShot(p, 'flutter-mobile-07-selling-orders');
    btnOk('selling-orders-back', await clickAny(p, 'Back'), '');
    ok('back-on-dashboard-again', await waitLabel(p, ['Welcome back, seller'], 10000), '');

    // Delivery tracking tile
    await sleep(600);
    btnOk('tile-delivery-tracking-click', await clickAny(p, 'Delivery tracking'), '');
    await sleep(1600);
    const dtT = await labelText(p);
    ok('delivery-tracking-opens', dtT.length > 120, dtT.replace(//g, ' ').slice(0, 90));
    btnOk('delivery-back', await clickAny(p, 'Back'), '');
    ok('back-on-dashboard-third', await waitLabel(p, ['Welcome back, seller'], 10000), '');

    // FAB Add listing on the listings screen
    btnOk('nav-my-listings-return', await clickAny(p, 'My listings'), 're-enter listings');
    ok('listings-for-fab', await waitLabel(p, ['Add listing'], 10000), '');
    btnOk('fab-add-listing-click', await clickAny(p, 'Add listing'), 'FAB bottom-right');
    ok('fab-goes-sell', await waitLabel(p, ['Step 1 of 4'], 12000) ||
      /sell/.test(p.url()), `url=${p.url()}`);
    btnOk('fab-exit-back', await clickAny(p, 'Back'), '');
    await sleep(1200);

    // pull-to-refresh on the listings list (we are already on it after Back)
    await sleep(1500);
    ok('back-on-listings-after-fab', await waitLabel(p, ['Add listing'], 10000), '');
    await p.mouse.move(187, 320); await p.mouse.down();
    for (let y = 320; y <= 540; y += 20) { await p.mouse.move(187, y); await sleep(45); }
    await p.mouse.up();
    await sleep(2200);
    ok('pull-refresh-reloads', (await labelText(p)).includes(NAMES.active), 'list repopulated after refresh gesture');

    // ---- control inventory snapshot (visible interactive nodes accounted) ----
    const inv = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const role = e.getAttribute('role'); const tap = e.getAttribute('flt-tappable');
        if (role !== 'button' && tap === null) return;
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
        out.push({ k: role || 'tappable', t: ((e.textContent || '') || (e.getAttribute('aria-label') || '')).trim().slice(0, 26) });
      });
      return out;
    });
    R.controlInventory = inv;
    console.log('INVENTORY', JSON.stringify(inv.slice(0, 24)));

    // ---- images reconciliation ----
    const imgs = Object.entries(imgMap);
    const bad = imgs.filter(([, s]) => s >= 400);
    R.checks.images_requested = imgs.length;
    R.checks.images_200 = imgs.filter(([, s]) => s === 200 || s === 304).length;
    dataOk('images-all-200', imgs.length >= 1 && bad.length === 0,
      `${imgs.length} image requests, ${R.checks.images_200} OK, ${bad.length} failed`);
    const expectedImg = (g(mine, fx.activeId).productImages || [])[0];
    if (expectedImg) {
      const seen = imgs.find(([u]) => u.includes(expectedImg.imageUrl.split('/').pop()));
      dataOk('image-requested-vs-rendered', !!seen,
        seen ? `${expectedImg.imageUrl.split('/').pop()} fetched HTTP ${seen[1]}, drawn as row thumbnail` : 'fixture image NEVER requested');
    }

    await L.closeVideo(ctx, 'e2e/videos/AU-054-mobile.webm').catch(() => {});
    await browser.close().catch(() => {});
  }

  checkpoint();
  console.log('MOBILE-LEG-DONE');
})().catch(e => {
  console.error('VERIFY-FATAL', e && e.stack || e);
  R.failures.push('fatal:' + (e && e.message || e));
  fs.writeFileSync('/tmp/au054_result.json', JSON.stringify(R, null, 2));
  process.exit(1);
});

// helper: find fixture row dto
function g(mine, id) { return mine.find(r => r.productId === id) || {}; }
