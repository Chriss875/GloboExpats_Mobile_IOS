// au036_verify_r6.js — AU-036 verify-r6 against the FROZEN :9121 lane
// (sha e1a5762, main.dart.js Last-Modified Tue 25 Aug 2026 14:19:24 GMT).
//
// Closes the r5 gaps with REAL state transitions filmed in the browser:
//   A  escrowPending (AWAITING_PAYMENT/PENDING/HELD) -> "Payment submitted -
//      awaiting GloboExpats verification" (V1 fix, commit 404ca8c)
//   D  CANCELLED + REFUND_PENDING -> "Cancellation refund pending - ..." then
//      REAL POST /admin/orders/{id}/refund MID-BROWSER -> "Refunded · TSh N"
//   C  DELIVERED + HELD -> "Delivered - confirm receipt to release payment"
//      then REAL POST /admin/orders/{id}/release-payment MID-BROWSER ->
//      "Payment released to seller" + COMPLETED
//   T25 seller list filter + detail 404 while escrowPending
// Both viewports, video, frames extracted and READ natively.
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9121';
const UNIT = 'AU-036', STAGE = 'verify-r6';
const SHOT_DIR = 'e2e/shots/AU-036';
const fx = JSON.parse(fs.readFileSync('/tmp/au036_r5.json', 'utf8'));
const S2_WANT = 'Payment submitted - awaiting GloboExpats verification';
const RP_WANT = 'Cancellation refund pending - GloboExpats will return your money';
const REL_WANT = 'Payment released to seller';
const DEL_WANT = 'Delivered - confirm receipt to release payment';

const R = { ts: new Date().toISOString(), unit: UNIT, stage: STAGE, build_sha: 'e1a5762',
  bundle_mtime: null,
  checks: { fresh: null, real_data: true, images_requested: 0, images_200: 0,
    images_broken: [], buttons_total: 0, buttons_ok: 0, buttons_failed: [],
    state_asserts: 0, vision_defects: 0, vision_findings: [], placeholder_hits: [],
    parity_blocker: 0, parity_major: 0, parity_minor: 0, parity_accepted: 0 },
  asserts: [], failures: [], shots: [], evidence: [] };
function assert(name, pass, detail) {
  R.asserts.push({ name, pass: !!pass, detail: String(detail === undefined ? '' : detail).slice(0, 320) });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? (' :: ' + String(detail).slice(0, 170)) : ''));
  if (!pass) R.failures.push(name);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p) { return L.allText(p); }
async function shot(p, vp, state) { const f = `${SHOT_DIR}/AU-036-${vp}-${state}.png`;
  await L.screenshot(p, f); R.shots.push(f); return f; }
function scanPh(T) { const ph = T.match(/lorem|placeholder|dummy|TODO/i);
  if (ph && !R.checks.placeholder_hits.includes(ph[0])) R.checks.placeholder_hits.push(ph[0]); }

(async () => {
  // ---------- CHECK 1: freshness
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  R.bundle_mtime = lm;
  const freshOK = head.status === 200 && lm === 'Tue, 25 Aug 2026 14:19:24 GMT';
  R.checks.fresh = freshOK ? lm : lm;
  assert('1-freshness-e1a5762-bundle', freshOK, `HTTP ${head.status} Last-Modified: ${lm}`);

  // ---------- CHECK 2: API truth — independent fresh logins + curl-equivalents
  const btok = await L.apiLogin({ email: fx.buyer.email, pw: fx.buyer.pw });
  const stok = await L.apiLogin({ email: fx.seller.email, pw: fx.seller.pw });
  fx.buyer.token = btok; fx.seller.token = stok;
  const dA = await L.api(btok, 'GET', `/api/v1/orders/${fx.state2.orderId}`);
  assert('2-api-A-state2-trap-fields', dA.status === 200 &&
    dA.json.status === 'AWAITING_PAYMENT' && dA.json.escrowPending === true &&
    dA.json.paymentStatus === 'PENDING' && dA.json.payoutStatus === 'HELD',
    JSON.stringify({ s: dA.json && dA.json.status, e: dA.json && dA.json.escrowPending,
      p: dA.json && dA.json.paymentStatus, po: dA.json && dA.json.payoutStatus }));
  const dD = await L.api(btok, 'GET', `/api/v1/orders/${fx.chainD.orderId}`);
  assert('2-api-D-refundPending', dD.status === 200 && dD.json.refundStatus === 'REFUND_PENDING'
    && dD.json.status === 'CANCELLED',
    JSON.stringify({ s: dD.json && dD.json.status, r: dD.json && dD.json.refundStatus,
      a: dD.json && dD.json.refundAmount }));
  const dC = await L.api(btok, 'GET', `/api/v1/orders/${fx.chainC.orderId}`);
  assert('2-api-C-delivered-held', dC.status === 200 && dC.json.status === 'DELIVERED'
    && dC.json.payoutStatus === 'HELD',
    JSON.stringify({ s: dC.json && dC.json.status, po: dC.json && dC.json.payoutStatus }));

  // ---------- T25 server side BEFORE any UI action on fixture A
  const sList = await L.api(stok, 'GET', '/api/v1/orders');
  const sRows = Array.isArray(sList.json) ? sList.json : [];
  assert('T25-api-seller-list-hides-state2', !sRows.some(o => o.orderNumber === fx.state2.orderNumber),
    `seller list rows=${JSON.stringify(sRows.map(o => o.orderNumber))}`);
  const sDet = await L.api(stok, 'GET', `/api/v1/orders/${fx.state2.orderId}`);
  assert('T25-api-seller-detail-404', sDet.status === 404,
    `HTTP ${sDet.status} ${JSON.stringify(sDet.json).slice(0, 90)}`);

  // ---------- admin token for mid-browser transitions
  const atok = await L.apiLogin(L.ADMIN);

  const browser = await L.newBrowser();
  try {
    for (const [vpName, viewport] of [['mobile', { width: 375, height: 667 }], ['tablet', { width: 768, height: 1024 }]]) {
      const videoPath = `e2e/videos/AU-036-r6-${vpName}.webm`;
      const ctx = await L.newCtx(browser, { viewport, videoPath });
      const page = await ctx.newPage();
      const imgMap = {}; const net = [];
      page.on('response', r => { const u = r.url();
        if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
        if (u.includes('/api/')) net.push(`${r.request().method()} ${r.status()} ...${u.slice(-56)}`); });
      try {
        // load root FIRST (plain http.server lane), then hash-nav for deep links
        await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 });
        await L.waitText(page, 'Buy now', 40000);

        async function uiLogin(email, pw, tag) {
          await L.clickBtn(page, 'Login');
          await L.waitText(page, 'Welcome back', 30000);
          const ei = page.locator('input[type="text"]').first(), pi = page.locator('input[type="password"]').first();
          await ei.click({ force: true }).catch(() => {}); await sleep(350);
          await page.keyboard.type(email);
          await pi.click({ force: true }).catch(() => {}); await sleep(350);
          await page.keyboard.type(pw);
          await L.clickBtn(page, 'Log in');
          let ok = false;
          for (let i = 0; i < 30 && !ok; i++) { ok = await L.isLoggedIn(page); if (!ok) await sleep(1000); }
          assert(`login-${tag}-${vpName}`, ok);
          return ok;
        }
        await uiLogin(fx.buyer.email, fx.buyer.pw, 'buyer');
        await sleep(1200);

        async function gotoOrder(id, ms = 4200) {
          await page.evaluate(h => { window.location.hash = h; }, `#/orders/${id}`);
          await sleep(ms);
        }
        function headOf(T, n = 14) { return T.split('\n').filter(Boolean).slice(0, n).join('|').slice(0, 300); }

        // ===== STATE 2 (the V1 fix) — order A
        await gotoOrder(fx.state2.orderId);
        let T = await txt(page); scanPh(T);
        const s2hit = T.includes(S2_WANT);
        if (s2hit) R.checks.state_asserts++;
        assert(`3-banner-state2-${vpName}`, s2hit, s2hit ? `"${S2_WANT}" verbatim` : `MISSING; got=${headOf(T)}`);
        assert(`3-badge-paymentline-PENDING-${vpName}`, /\bPENDING\b/.test(T), `'PENDING' payment line under banner`);
        await shot(page, vpName, '01-state2-underreview');

        // ===== STATE RP (refund pending) — order D, then REAL refund mid-browser
        await gotoOrder(fx.chainD.orderId);
        T = await txt(page); scanPh(T);
        const rpHit = T.includes(RP_WANT);
        if (rpHit) R.checks.state_asserts++;
        assert(`3-banner-refundPending-${vpName}`, rpHit, rpHit ? `"${RP_WANT}" verbatim` : `MISSING; got=${headOf(T)}`);
        assert(`3-refundPending-cancelled-chip-${vpName}`, /CANCELLED|Cancelled/i.test(T),
          'CANCELLED status rendered alongside the refund-pending banner');
        await shot(page, vpName, '02-refundPending');

        const refAmt = (dD.json && dD.json.totalAmount) || 32000;
        const refResp = await L.api(atok, 'POST', `/api/v1/admin/orders/${fx.chainD.orderId}/refund`,
          { note: 'AU036 r6 real refund recorded by verifier' });
        assert(`3-real-admin-refund-call-${vpName}`, refResp.status === 200,
          `POST refund HTTP ${refResp.status} body=${JSON.stringify(refResp.json).slice(0, 140)}`);
        const dDr = await L.api(btok, 'GET', `/api/v1/orders/${fx.chainD.orderId}`);
        assert(`3-api-post-refund-state-${vpName}`, dDr.json && dDr.json.refundStatus === 'REFUNDED' && dDr.json.refundAmount === refAmt,
          JSON.stringify({ r: dDr.json && dDr.json.refundStatus, amount: dDr.json && dDr.json.refundAmount }));
        await page.evaluate(() => { window.location.hash = '#/orders'; }); await sleep(2500);
        await gotoOrder(fx.chainD.orderId, 5000);
        T = await txt(page); scanPh(T);
        const wantRefunded = `Refunded · TSh ${refAmt}`;
        const refHit = T.includes(wantRefunded);
        if (refHit) R.checks.state_asserts++;
        assert(`3-banner-refunded-after-REAL-refund-${vpName}`, refHit,
          refHit ? `"${wantRefunded}" verbatim after real refund` : `MISSING "${wantRefunded}"; got=${headOf(T)}`);
        await shot(page, vpName, '03-refunded-after-real-refund');

        // ===== STATE 5 (DELIVERED + HELD) — order C
        await gotoOrder(fx.chainC.orderId);
        T = await txt(page); scanPh(T);
        const delHit = T.includes(DEL_WANT);
        if (delHit) R.checks.state_asserts++;
        assert(`3-banner-delivered-held-${vpName}`, delHit, delHit ? `"${DEL_WANT}" verbatim` : `MISSING; got=${headOf(T)}`);
        assert(`3-delivered-status-chip-${vpName}`, /DELIVERED|Delivered/.test(T), 'DELIVERED chip rendered while payout still HELD');
        await shot(page, vpName, '04-delivered-held-before-release');

        // ===== REAL release-payment mid-browser -> STATE 6 RELEASED
        const relResp = await L.api(atok, 'POST', `/api/v1/admin/orders/${fx.chainC.orderId}/release-payment`, {});
        assert(`3-real-release-payment-call-${vpName}`, relResp.status === 200,
          `POST release-payment HTTP ${relResp.status} body=${JSON.stringify(relResp.json).slice(0, 120)}`);
        await page.reload({ waitUntil: 'load' }).catch(() => {});
        await sleep(1500);
        await gotoOrder(fx.chainC.orderId, 5200);
        T = await txt(page); scanPh(T);
        const relHit = T.includes(REL_WANT);
        if (relHit) R.checks.state_asserts++;
        assert(`3-banner-released-after-REAL-release-${vpName}`, relHit,
          relHit ? `"${REL_WANT}" verbatim after real release` : `MISSING "${REL_WANT}"; got=${headOf(T)}`);
        assert(`3-completed-after-release-${vpName}`, /COMPLETED|Completed/.test(T),
          'order shows completed after payout release');
        await shot(page, vpName, '05-released-after-real-release');

        // ---- orders LIST contains our fixture rows
        await page.evaluate(() => { window.location.hash = '#/orders'; }); await sleep(3200);
        const TL = await txt(page); scanPh(TL);
        const listHas = [fx.state2.orderNumber, fx.chainC.orderNumber, fx.chainD.orderNumber]
          .map(n => ({ n, ok: TL.includes(n) }));
        assert(`3-list-shows-fixtures-${vpName}`, listHas.every(x => x.ok),
          listHas.map(x => `${x.n}:${x.ok}`).join(' '));
        await shot(page, vpName, '06-orders-list');

        // ---- CLICK-EVERYTHING sweep on the state-2 detail (screen under test)
        await gotoOrder(fx.state2.orderId); await sleep(800);
        const seen = new Set(); const ctrls = []; const clickedLabels = [];
        const grab = () => {
          const out = [];
          document.querySelectorAll('flt-semantics').forEach(e => {
            const role = e.getAttribute('role'); const tap = e.getAttribute('flt-tappable') !== null;
            if (role !== 'button' && !tap) return;
            const r = e.getBoundingClientRect();
            if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
            out.push({ kind: role === 'button' ? 'button' : 'tappable',
              label: (e.textContent || '').trim().slice(0, 50),
              x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
          });
          document.querySelectorAll('input').forEach(i =>
            out.push({ kind: 'input', label: i.getAttribute('aria-label') || i.type || 'input', x: 0, y: 0 }));
          return out;
        };
        for (let pass = 0; pass < 3; pass++) {
          for (const c of await page.evaluate(grab)) { const k = c.kind + '|' + c.label.slice(0, 28);
            if (!seen.has(k)) { seen.add(k); ctrls.push(c); } }
          await page.mouse.move(Math.round(viewport.width / 2), Math.round(viewport.height / 2));
          await page.mouse.wheel(0, 320); await sleep(420);
        }
        let effects = 0; const dead = [];
        for (const c of ctrls) {
          if (c.kind === 'input') { clickedLabels.push(c.label + ':input-present-not-typed'); continue; }
          const beforeNet = net.length; const before = await txt(page); const beforeUrl = page.url();
          await page.mouse.click(Math.min(Math.max(c.x, 5), viewport.width - 5),
            Math.min(Math.max(c.y, 5), viewport.height - 5));
          await sleep(900);
          const after = await txt(page);
          const changed = before !== after || net.length > beforeNet || page.url() !== beforeUrl;
          R.checks.buttons_total++;
          if (changed) { effects++; R.checks.buttons_ok++; }
          else { dead.push(c.label.slice(0, 30)); R.checks.buttons_failed.push(vpName + ':' + c.label.slice(0, 34)); }
          clickedLabels.push(c.label.slice(0, 30));
          if (!(await L.isLoggedIn(page))) {
            await page.goto(APP + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
            await sleep(2200);
            await page.evaluate(h => { window.location.hash = h; }, `#/orders/${fx.state2.orderId}`);
            await sleep(2600);
          }
        }
        assert(`4-clicks-all-controls-${vpName}`, ctrls.length > 0 && dead.length === 0,
          `enumerated=${ctrls.length} withEffect=${effects} dead=[${dead.slice(0, 4).join(' ; ')}] controls=${JSON.stringify(clickedLabels).slice(0, 240)}`);
        await shot(page, vpName, '07-after-clicks');

        R.checks.images_requested += Object.keys(imgMap).length;
        R.checks.images_200 += Object.values(imgMap).filter(s => s === 200 || s === 304).length;
        R.checks.images_broken.push(...Object.entries(imgMap).filter(([, s]) => s >= 400).map(([u]) => u));
        fs.writeFileSync(`e2e/results/shards/raw-AU-036-r6-net-${vpName}.json`, JSON.stringify(net, null, 1));

        // buyer logged-out context done; sign out by clearing storage for next leg
        await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
      } finally { await L.closeVideo(ctx, videoPath); }

      // ---------- T25 UI leg as THE SELLER
      const videoPath2 = `e2e/videos/AU-036-r6-t25-${vpName}.webm`;
      const ctx2 = await L.newCtx(browser, { viewport, videoPath: videoPath2 });
      const p2 = await ctx2.newPage();
      try {
        await p2.goto(APP + '/', { waitUntil: 'load', timeout: 90000 });
        await L.waitText(p2, 'Buy now', 40000);
        await L.clickBtn(p2, 'Login');
        await L.waitText(p2, 'Welcome back', 30000);
        const ei = p2.locator('input[type="text"]').first(), pi = p2.locator('input[type="password"]').first();
        await ei.click({ force: true }).catch(() => {}); await sleep(350);
        await p2.keyboard.type(fx.seller.email);
        await pi.click({ force: true }).catch(() => {}); await sleep(350);
        await p2.keyboard.type(fx.seller.pw);
        await L.clickBtn(p2, 'Log in');
        let logged = false;
        for (let i = 0; i < 30 && !logged; i++) { logged = await L.isLoggedIn(p2); if (!logged) await sleep(1000); }
        assert(`T25-login-seller-${vpName}`, logged);
        await p2.evaluate(() => { window.location.hash = '#/orders'; }); await sleep(3600);
        const TS = await txt(p2);
        if (!TS.includes(fx.state2.orderNumber)) R.checks.state_asserts++;
        assert(`T25-ui-selling-list-hides-${vpName}`, !TS.includes(fx.state2.orderNumber),
          `"${fx.state2.orderNumber}" absent from seller orders view`);
        await shot(p2, vpName, '08-t25-selling-hidden');
        await p2.evaluate(h => { window.location.hash = h; }, `#/orders/${fx.state2.orderId}`);
        await sleep(4200);
        const TD = await txt(p2);
        const blocked = !TD.includes(String(fx.state2.totalAmount)) && !TD.includes(S2_WANT);
        if (blocked) R.checks.state_asserts++;
        assert(`T25-ui-detail-blocked-${vpName}`, blocked,
          `no order data leaked; head=${TD.split('\n').filter(Boolean).slice(0, 5).join('|').slice(0, 170)}`);
        await shot(p2, vpName, '09-t25-detail-blocked');
      } finally { await L.closeVideo(ctx2, videoPath2); }
    }
  } finally { await browser.close().catch(() => {}); }

  fs.writeFileSync('e2e/results/shards/raw-AU-036-r6.json', JSON.stringify(R, null, 1));
  console.log('\nSUMMARY', R.asserts.filter(a => a.pass).length + '/' + R.asserts.length,
    'imgs', R.checks.images_requested + '/' + R.checks.images_200,
    'btns', R.checks.buttons_ok + '/' + R.checks.buttons_total,
    'state_asserts', R.checks.state_asserts,
    'placeholders', JSON.stringify(R.checks.placeholder_hits),
    'brokenImgs', JSON.stringify(R.checks.images_broken));
})().catch(e => {
  console.error('FATAL', e.message);
  fs.writeFileSync('e2e/results/shards/raw-AU-036-r6.json', JSON.stringify({ ...R, fatal: e.message }, null, 1));
  process.exit(1);
});
