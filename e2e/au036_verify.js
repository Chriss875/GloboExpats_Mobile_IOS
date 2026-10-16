// au036_verify.js — REAL-BROWSER verification of AU-036 escrow visibility states
// on the FROZEN lane :9112 (sha 858b0ef). Canonical checklist, both viewports.
// Fixtures: /tmp/au036_fixtures.json (RW-lane minted through :8083) + pre-existing
// sandbox orders for states the fixture alone cannot show (REFUNDED 72000).
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9112';
const UNIT = 'AU-036';
const SHOT_DIR = `e2e/shots/${UNIT}`;
const fx = JSON.parse(fs.readFileSync('/tmp/au036_fixtures.json', 'utf8'));
const T25 = JSON.parse(fs.readFileSync('/tmp/au036_t25.json', 'utf8'));
const LC = JSON.parse(fs.readFileSync('/tmp/au036_lifecycle.json', 'utf8'));

// Pre-existing sandbox fixtures (verified via curl before this run):
const FIX = {
  released: { id: '2499e6e9-b5f9-4b47-982e-1d50f99144c5', num: 'ORD-2026-000012', status: 'COMPLETED', payout: 'RELEASED', total: '32,000' },
  refunded: { id: 'b564e951-ef8f-452e-b974-7f9438137850', num: 'ORD-2026-000011', status: 'CANCELLED', refundStatus: 'REFUNDED', amount: 72000 },
  heldAsc: { id: '49dee2e4-e785-45e9-91a8-6a4dac2b3270', num: 'ORD-2026-000023', status: 'AWAITING_SELLER_CONFIRMATION', payout: 'HELD' },
};

const R = {
  ts: new Date().toISOString(), unit: UNIT, stage: 'verify',
  build_sha: '858b0ef', bundle_mtime: 'Tue, 25 Aug 2026 05:15:38 GMT',
  checks: { freshness: null,
    images_requested: 0, images_200: 0, images_broken: [],
    buttons_total: 0, buttons_ok: 0, buttons_failed: [],
    state_asserts: 0, nav_asserts: 0, data_asserts: 0,
    vision_defects: 0, vision_findings: [], placeholder_hits: [],
    parity_blocker: 0, parity_major: 0, parity_minor: 0 },
  asserts: [], evidence: [], shots: [], defects: [],
};
function assert(name, pass, detail) {
  R.asserts.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail).slice(0, 260) });
  console.log(pass ? 'PASS' : 'FAIL', name, detail === undefined ? '' : String(detail).slice(0, 200));
}
async function txt(p) { return L.allText(p); }
async function shot(p, vp, state) { const f = `${SHOT_DIR}/${UNIT}-${vp}-${state}.png`; await L.screenshot(p, f); R.shots.push(f); return f; }
async function controls(p) {
  return p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const role = e.getAttribute('role'); const tappable = e.getAttribute('flt-tappable') !== null;
      if (role !== 'button' && !tappable) return;
      if (e.tagName === 'INPUT') return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
      out.push({ kind: role === 'button' ? 'button' : 'tappable', label: (e.textContent || '').trim().slice(0, 60), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
    });
    document.querySelectorAll('input').forEach(i => out.push({ kind: 'input', label: i.getAttribute('aria-label') || i.type || 'input', x: -1, y: -1 }));
    return out;
  });
}
// click a control by coords with clamping; returns whether anything changed
async function clickControl(p, c, viewport, netRef) {
  if (c.kind === 'input') return false;
  const before = await txt(p); const beforeNet = netRef.log.length;
  await p.mouse.click(Math.min(Math.max(c.x, 5), viewport.width - 5), Math.min(Math.max(c.y, 5), viewport.height - 5));
  await p.waitForTimeout(900);
  const after = await txt(p);
  const changed = before !== after || netRef.log.length > beforeNet;
  return changed ? 'effect' : 'none';
}

(async () => {
  // ---------- CHECK 1 freshness ----------
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  R.checks.freshness = lm;
  assert('1-freshness-lastModified', head.status === 200 && lm === 'Tue, 25 Aug 2026 05:15:38 GMT', lm);

  // ---------- CHECK 2 real data (API side already probed; re-assert here) ----------
  const btok = fx.buyer.token;
  const d3 = await L.api(btok, 'GET', `/api/v1/orders/${fx.order.orderId}`);
  const j3 = d3.json || {};
  assert('2-api-fixture-order-state6', d3.status === 200 && j3.payoutStatus === 'RELEASED' && j3.status === 'DELIVERED',
    JSON.stringify(({ status: j3.status, payout: j3.payoutStatus })));
  const dR = await L.api(L.BUYER.email ? await L.apiLogin() : '', 'GET', `/api/v1/orders/${FIX.refunded.id}`);
  const jR = dR.json || {};
  assert('2-api-refunded-fixture', dR.status === 200 && jR.refundStatus === 'REFUNDED' && jR.refundAmount === 72000,
    JSON.stringify({ refundStatus: jR.refundStatus, refundAmount: jR.refundAmount }));
  assert('2-api-T25-server-gate', T25.t25_list_hidden === true && T25.t25_detail_status === 404 && T25.buyerListHasIt === true,
    JSON.stringify(T25));
  assert('2-api-lifecycle-chain', LC.steps.some(s => s.name === 'release-payment' && s.status === 200),
    'fixture order advanced HELD->RELEASED through real admin API');

  const browser = await L.newBrowser();
  for (const [vpName, viewport] of [['mobile', { width: 375, height: 667 }], ['tablet', { width: 768, height: 1024 }]]) {
    const ctx = await L.newCtx(browser, { viewport, videoPath: `e2e/videos/AU-036-${vpName}.webm` });
    const page = await ctx.newPage();
    const imgMap = {}; const net = { log: [] };
    page.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
      if (u.includes('/api/')) net.log.push({ m: r.request().method(), url: u.slice(-70), status: r.status() });
    });

    try {
      await page.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await L.waitText(page, 'Buy now', 25000);

      // ---- login as the fixture buyer (typed into real UI)
      await L.clickBtn(page, 'Login'); await L.waitText(page, 'Welcome back', 25000);
      const ei = page.locator('input[type="text"]').first(); const pi = page.locator('input[type="password"]').first();
      await ei.click({ force: true }).catch(() => {}); await page.waitForTimeout(350); await page.keyboard.type(fx.buyer.email);
      await pi.click({ force: true }).catch(() => {}); await page.waitForTimeout(350); await page.keyboard.type(fx.buyer.pw);
      await L.clickBtn(page, 'Log in');
      let okLogin = false;
      for (let i = 0; i < 25 && !okLogin; i++) { okLogin = await L.isLoggedIn(page); if (!okLogin) await page.waitForTimeout(1000); }
      assert(`3-login-${vpName}`, okLogin);
      await page.waitForTimeout(1500);
      await shot(page, vpName, '01-home');

      // ---- open Orders via Account tab (real navigation)
      let acc = false;
      for (let i = 0; i < 5 && !acc; i++) { acc = (await L.clickBtn(page, 'Account')) || (await L.clickCard(page, 'Account')); if (!acc) await page.waitForTimeout(700); }
      await page.waitForTimeout(1000);
      let sold = false;
      for (let i = 0; i < 10 && !sold; i++) { sold = await L.clickCard(page, 'My orders') || await L.clickCard(page, 'Orders'); if (!sold) { await page.mouse.move(190, 350); await page.mouse.wheel(0, 300); await page.waitForTimeout(280); } }
      await page.waitForTimeout(2200);
      let T = await txt(page);
      const onOrders = T.includes('Buying') && T.includes('Selling');
      assert(`nav-orders-screen-${vpName}`, onOrders, onOrders ? 'orders screen w/ Buying|Selling chips' : T.split('\n').filter(Boolean).slice(0, 6).join('|'));
      await shot(page, vpName, '02-orders-list');

      // ---- STATE 6: RELEASED order row -> detail banner "Payment released to seller"
      const relRow = await L.clickCard(page, FIX.released.num);
      await page.waitForTimeout(2600); T = await txt(page);
      const relBanner = T.includes('Payment released to seller');
      assert(`state6-released-banner-${vpName}`, relRow && relBanner, relBanner ? '"Payment released to seller" verbatim' : T.split('\n').filter(Boolean).slice(0, 10).join('|'));
      R.checks.data_asserts += relBanner ? 1 : 0;
      await shot(page, vpName, '03-released-detail');

      // placeholder scan
      const ph = T.match(/lorem|placeholder|dummy|TODO/i);
      if (ph) R.checks.placeholder_hits.push(ph[0]);
      assert(`2-no-placeholder-${vpName}-released`, !ph, ph || 'clean');

      // back to list
      await page.goto(APP + '/orders', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(3200); T = await txt(page);

      // ---- REFUNDED order: amount must be shown
      const refOk = await L.clickCard(page, FIX.refunded.num);
      await page.waitForTimeout(2600); T = await txt(page);
      const refAmt = T.includes('Refunded · TSh 72000') || /Refunded\s*·?\s*TSh\s*72[ ,]?000/.test(T);
      assert(`state7-refunded-with-amount-${vpName}`, refOk && refAmt, refAmt ? '"Refunded · TSh 72000" rendered' : T.split('\n').filter(Boolean).slice(0, 12).join('|'));
      R.checks.data_asserts += refAmt ? 1 : 0;
      await shot(page, vpName, '04-refunded-detail');

      await page.goto(APP + '/orders', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(3200); T = await txt(page);

      // ---- state 3: HELD + AWAITING_SELLER_CONFIRMATION ("Payment confirmed - awaiting seller")
      const ascOk = await L.clickCard(page, FIX.heldAsc.num);
      await page.waitForTimeout(2600); T = await txt(page);
      const ascBanner = T.includes('Payment confirmed - awaiting seller');
      assert(`state3-held-awaiting-seller-${vpName}`, ascOk && ascBanner, ascBanner ? '"Payment confirmed - awaiting seller"' : T.split('\n').filter(Boolean).slice(0, 12).join('|'));
      R.checks.data_asserts += ascBanner ? 1 : 0;
      await shot(page, vpName, '05-held-asc-detail');

      // ---- state 2: our OWN escrowPending order (buyer sees it; seller must not)
      await page.goto(APP + '/orders', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(3200);
      const st2 = await L.clickCard(page, 'ORD-2026-000025');
      await page.waitForTimeout(2600); T = await txt(page);
      const underReview = T.includes('awaiting GloboExpats verification');
      assert(`state2-under-review-${vpName}`, st2 && underReview, underReview ? '"Payment submitted - awaiting GloboExpats verification"' : T.split('\n').filter(Boolean).slice(0, 12).join('|'));
      R.checks.data_asserts += underReview ? 1 : 0;
      await shot(page, vpName, '06-under-review-detail');

      // ---------- CLICK EVERY control on this detail ----------
      const seen = new Set(); const all = [];
      for (let pass = 0; pass < 3; pass++) {
        for (const c of await controls(page)) {
          const k = c.kind + '|' + c.label.slice(0, 30);
          if (!seen.has(k)) { seen.add(k); all.push(c); }
        }
        await page.mouse.move(190, 350); await page.mouse.wheel(0, 340); await page.waitForTimeout(420);
      }
      let effects = 0; const dead = [];
      for (const c of all) {
        if (c.kind === 'input') { continue; }
        const res = await clickControl(page, c, viewport, net);
        R.checks.buttons_total++;
        if (res === 'effect') { effects++; R.checks.buttons_ok++; } else { dead.push(c.label); R.checks.buttons_failed.push(`${vpName}:${c.label}`); }
        // restore: reload detail if we navigated away
        if (!/(verification|Order)/.test(await txt(page))) { await page.goto(APP + '/orders/' + fx.order.orderId, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await page.waitForTimeout(2600); }
      }
      assert(`4-clicks-every-control-${vpName}`, all.length > 0, { enumerated: all.length, withEffect: effects, dead: dead.slice(0, 6) });

      // ---- T25 in the UI: log into the app as OUR SELLER and confirm no selling row/detail
      await page.goto(APP + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await page.evaluate(() => localStorage.clear());
      await page.goto(APP + '/login', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(3500);
      let Tl = await txt(page);
      if (!Tl.includes('Welcome back')) { await L.waitText(page, 'Welcome back', 20000); Tl = await txt(page); }
      const ei2 = page.locator('input[type="text"]').first(); const pi2 = page.locator('input[type="password"]').first();
      await ei2.click({ force: true }).catch(() => {}); await page.waitForTimeout(350); await page.keyboard.type(fx.seller.email);
      await pi2.click({ force: true }).catch(() => {}); await page.waitForTimeout(350); await page.keyboard.type(fx.seller.pw);
      await L.clickBtn(page, 'Log in');
      let okS = false;
      for (let i = 0; i < 25 && !okS; i++) { okS = await L.isLoggedIn(page); if (!okS) await page.waitForTimeout(1000); }
      assert(`T25-seller-login-${vpName}`, okS);
      await page.waitForTimeout(1500);
      // selling orders screen as the seller: our escrowPending order number must NOT appear
      await page.goto(APP + '/orders', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(3200);
      await L.clickBtn(page, 'Selling') || await L.clickCard(page, 'Selling');
      await page.waitForTimeout(1800);
      T = await txt(page);
      const hiddenInList = !T.includes('ORD-2026-000025');
      assert(`T25-seller-list-hides-order-${vpName}`, hiddenInList, hiddenInList ? 'no ORD-2026-000025 anywhere on selling list' : 'LEAKED into selling list');
      await shot(page, vpName, '07-t25-selling-hidden');
      // direct deep link to the order as seller -> honest not-found/error, never the order
      await page.goto(APP + '/orders/' + fx.order.orderId, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(3600); T = await txt(page);
      const blocked = !T.includes('awaiting GloboExpats verification') && !T.includes('ORD-2026-000025');
      assert(`T25-seller-detail-blocked-${vpName}`, blocked, blocked ? 'detail deep link does NOT render the escrowPending order' : 'DETAIL LEAK: seller sees buyer order');
      await shot(page, vpName, '08-t25-detail-blocked');

      R.checks.images_requested += Object.keys(imgMap).length;
      R.checks.images_200 += Object.values(imgMap).filter(s => s === 200 || s === 304).length;
      R.checks.images_broken.push(...Object.entries(imgMap).filter(([, s]) => s >= 400).map(([u]) => u));
    } finally {
      await L.closeVideo(ctx, `e2e/videos/AU-036-${vpName}.webm`);
    }
  }

  await browser.close().catch(() => {});
  fs.writeFileSync(`e2e/results/shards/raw-AU-036.json`, JSON.stringify(R, null, 1));
  console.log('\nSUMMARY asserts:', R.asserts.filter(a => a.pass).length, '/', R.asserts.length);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
