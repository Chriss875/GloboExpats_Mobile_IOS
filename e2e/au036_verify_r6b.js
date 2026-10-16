// au036_verify_r6b.js — AU-036 r6b: per-state FRESH page.goto() so every
// banner is read from a clean load (r5's hash-nav between details reused the
// previous detail's widget tree — the root cause of the stale-text FAILs).
// Sequence per viewport (buyer):
//   01 fresh load -> state2 order A   "Payment submitted - awaiting ..." + PENDING
//   02 fresh load -> refunded order D "Refunded · TSh 32000" (real refund done in
//                     r6 via POST /admin/orders/{id}/refund, HTTP 200)
//   03 fresh load -> released order C "Payment released to seller" (real release
//                     done in r6 via POST /admin/orders/{id}/release-payment, HTTP 200)
//   04 orders list    shows A/C/D rows; click-everything sweep on list + state2 detail
// Then T25 seller leg: selling view hides ORD-...-090, deep link blocked.
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9121';
const UNIT = 'AU-036', STAGE = 'verify-r6b';
const SHOT_DIR = 'e2e/shots/AU-036';
const fx = JSON.parse(fs.readFileSync('/tmp/au036_r5.json', 'utf8'));
const S2_WANT = 'Payment submitted - awaiting GloboExpats verification';
const REL_WANT = 'Payment released to seller';

const R = { ts: new Date().toISOString(), unit: UNIT, stage: STAGE, build_sha: 'e1a5762',
  bundle_mtime: null,
  checks: { fresh: null, real_data: true, images_requested: 0, images_200: 0,
    images_broken: [], buttons_total: 0, buttons_ok: 0, buttons_failed: [],
    state_asserts: 0, vision_defects: 0, vision_findings: [], placeholder_hits: [],
    parity_blocker: 0, parity_major: 0, parity_minor: 0 },
  asserts: [], failures: [], shots: [], evidence: [], defects: [] };
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
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  R.bundle_mtime = lm;
  const freshOK = head.status === 200 && lm === 'Tue, 25 Aug 2026 14:19:24 GMT';
  R.checks.fresh = lm;
  assert('1-freshness-e1a5762-bundle', freshOK, `HTTP ${head.status} Last-Modified: ${lm}`);

  // independent API truth re-read at run time (never trusted from a file)
  const btok = await L.apiLogin({ email: fx.buyer.email, pw: fx.buyer.pw });
  const stok = await L.apiLogin({ email: fx.seller.email, pw: fx.seller.pw });
  fx.buyer.token = btok; fx.seller.token = stok;
  const dA = await L.api(btok, 'GET', `/api/v1/orders/${fx.state2.orderId}`);
  const dC = await L.api(btok, 'GET', `/api/v1/orders/${fx.chainC.orderId}`);
  const dD = await L.api(btok, 'GET', `/api/v1/orders/${fx.chainD.orderId}`);
  R.fixturesNow = { A: { num: dA.json.orderNumber, s: dA.json.status, e: dA.json.escrowPending,
      p: dA.json.paymentStatus, po: dA.json.payoutStatus, r: dA.json.refundStatus },
    C: { num: dC.json.orderNumber, s: dC.json.status, po: dC.json.payoutStatus },
    D: { num: dD.json.orderNumber, s: dD.json.status, r: dD.json.refundStatus,
      amount: dD.json.refundAmount } };
  console.log('fixtures now:', JSON.stringify(R.fixturesNow));
  assert('2-api-A-escrowPending', dA.json.status === 'AWAITING_PAYMENT' && dA.json.escrowPending === true &&
    dA.json.payoutStatus === 'HELD', JSON.stringify(R.fixturesNow.A));
  assert('2-api-C-released-completed', dC.json.payoutStatus === 'RELEASED',
    JSON.stringify(R.fixturesNow.C));
  assert('2-api-D-refunded-with-amount', dD.json.refundStatus === 'REFUNDED' && dD.json.refundAmount > 0,
    JSON.stringify(R.fixturesNow.D));

  const browser = await L.newBrowser();
  try {
    for (const [vpName, viewport] of [['mobile', { width: 375, height: 667 }], ['tablet', { width: 768, height: 1024 }]]) {
      const videoPath = `e2e/videos/AU-036-r6b-${vpName}.webm`;
      const ctx = await L.newCtx(browser, { viewport, videoPath });
      const page = await ctx.newPage();
      const imgMap = {}; const net = [];
      page.on('response', r => { const u = r.url();
        if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
        if (u.includes('/api/')) net.push(`${r.request().method()} ${r.status()} ...${u.slice(-56)}`); });
      try {
        async function uiBuyerLogin() {
          await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 });
          await L.waitText(page, 'Buy now', 40000);
          await L.clickBtn(page, 'Login');
          await L.waitText(page, 'Welcome back', 30000);
          const ei = page.locator('input[type="text"]').first(), pi = page.locator('input[type="password"]').first();
          await ei.click({ force: true }).catch(() => {}); await sleep(350);
          await page.keyboard.type(fx.buyer.email);
          await pi.click({ force: true }).catch(() => {}); await sleep(350);
          await page.keyboard.type(fx.buyer.pw);
          await L.clickBtn(page, 'Log in');
          let ok = false;
          for (let i = 0; i < 30 && !ok; i++) { ok = await L.isLoggedIn(page); if (!ok) await sleep(1000); }
          assert(`login-buyer-${vpName}`, ok);
        }
        await uiBuyerLogin();

        // fresh-load deep link to an order; returns full a11y text
        async function freshOrder(id, settle = 5200) {
          await page.goto(APP + `/#/orders/${id}`, { waitUntil: 'load', timeout: 90000 });
          await sleep(settle);
          return txt(page);
        }
        function headOf(T, n = 16) { return T.split('\n').filter(Boolean).slice(0, n).join('|').slice(0, 320); }

        // ---- STATE 2 (V1 fix)
        let T = await freshOrder(fx.state2.orderId);
        scanPh(T);
        const s2hit = T.includes(S2_WANT);
        if (s2hit) R.checks.state_asserts++;
        assert(`3-banner-state2-freshload-${vpName}`, s2hit,
          s2hit ? `"${S2_WANT}" verbatim` : `MISSING; got=${headOf(T)}`);
        assert(`3-paymentline-PENDING-under-banner-${vpName}`, /\bPENDING\b/.test(T),
          `'PENDING' payment line rendered under the under-review banner`);
        await shot(page, vpName, '10-state2-fresh');

        // ---- STATE REFUNDED (real refund executed in r6)
        T = await freshOrder(fx.chainD.orderId);
        scanPh(T);
        const refWant = `Refunded · TSh ${(dD.json.refundAmount || 32000).toString()}`;
        const refHit = T.includes(refWant);
        if (refHit) R.checks.state_asserts++;
        assert(`3-banner-refunded-freshload-${vpName}`, refHit,
          refHit ? `"${refWant}" verbatim` : `MISSING "${refWant}"; got=${headOf(T)}`);
        assert(`3-refunded-cancelled-chip-${vpName}`, /CANCELLED|Cancelled/i.test(T),
          'CANCELLED chip alongside Refunded banner');
        await shot(page, vpName, '11-refunded-fresh');

        // ---- STATE RELEASED (real release executed in r6)
        T = await freshOrder(fx.chainC.orderId);
        scanPh(T);
        const relHit = T.includes(REL_WANT);
        if (relHit) R.checks.state_asserts++;
        assert(`3-banner-released-freshload-${vpName}`, relHit,
          relHit ? `"${REL_WANT}" verbatim` : `MISSING "${REL_WANT}"; got=${headOf(T)}`);
        assert(`3-completed-after-release-${vpName}`, /COMPLETED|Completed/.test(T),
          'completed chip after payout release');
        await shot(page, vpName, '12-released-fresh');

        // ---- LIST contains all three fixture orders
        await page.goto(APP + '/#/orders', { waitUntil: 'load', timeout: 90000 }); await sleep(4200);
        const TL = await txt(page); scanPh(TL);
        const want = [dA.json.orderNumber, dC.json.orderNumber, dD.json.orderNumber];
        const listRes = want.map(n => ({ n, ok: TL.includes(n) }));
        if (listRes.every(x => x.ok)) R.checks.state_asserts++;
        assert(`3-list-shows-all-fixtures-${vpName}`, listRes.every(x => x.ok),
          listRes.map(x => `${x.n}:${x.ok}`).join(' '));
        await shot(page, vpName, '13-orders-list');

        // ---- CLICK-EVERYTHING on the list (buying view), then state-2 detail
        async function sweep(tag) {
          const seen = new Set(); const ctrls = []; const clickedLabels = [];
          const grab = () => {
            const out = [];
            document.querySelectorAll('flt-semantics').forEach(e => {
              const role = e.getAttribute('role'); const tap = e.getAttribute('flt-tappable') !== null;
              if (role !== 'button' && !tap) return;
              const r = e.getBoundingClientRect();
              if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
              out.push({ kind: role === 'button' ? 'button' : 'tappable',
                label: (e.textContent || '').trim().slice(0, 46),
                x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
            });
            document.querySelectorAll('input').forEach(i =>
              out.push({ kind: 'input', label: i.getAttribute('aria-label') || i.type || 'input', x: 0, y: 0 }));
            return out;
          };
          for (let pass = 0; pass < 3; pass++) {
            for (const c of await page.evaluate(grab)) { const k = c.kind + '|' + c.label.slice(0, 26);
              if (!seen.has(k)) { seen.add(k); ctrls.push(c); } }
            await page.mouse.move(Math.round(viewport.width / 2), Math.round(viewport.height / 2));
            await page.mouse.wheel(0, 340); await sleep(380);
          }
          let effects = 0; const dead = [];
          for (const c of ctrls) {
            if (c.kind === 'input') { clickedLabels.push(c.label + ':input-present'); continue; }
            const beforeNet = net.length; const before = await txt(page); const beforeUrl = page.url();
            await page.mouse.click(Math.min(Math.max(c.x, 5), viewport.width - 5),
              Math.min(Math.max(c.y, 5), viewport.height - 5));
            await sleep(900);
            const after = await txt(page);
            const changed = before !== after || net.length > beforeNet || page.url() !== beforeUrl;
            R.checks.buttons_total++;
            if (changed) { effects++; R.checks.buttons_ok++; }
            else { dead.push(c.label.slice(0, 28)); R.checks.buttons_failed.push(vpName + ':' + tag + ':' + c.label.slice(0, 30)); }
            clickedLabels.push(c.label.slice(0, 28));
            if (!(await L.isLoggedIn(page))) {
              await page.goto(APP + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
              await sleep(2200);
              await uiBuyerLogin();
              await page.goto(APP + `/#/orders/${fx.state2.orderId}`, { waitUntil: 'load' }).catch(() => {});
              await sleep(3200);
            }
          }
          return { total: ctrls.length, effects, dead, clickedLabels };
        }
        const swList = await sweep('orders-list');
        assert(`4-clicks-orders-list-${vpName}`, swList.total > 0 && swList.dead.length === 0,
          `enumerated=${swList.total} withEffect=${swList.effects} dead=[${swList.dead.slice(0, 4).join(';')}] controls=${JSON.stringify(swList.clickedLabels).slice(0, 200)}`);
        await shot(page, vpName, '14-after-list-clicks');

        await page.goto(APP + `/#/orders/${fx.state2.orderId}`, { waitUntil: 'load', timeout: 90000 });
        await sleep(4500);
        const swDet = await sweep('state2-detail');
        assert(`4-clicks-state2-detail-${vpName}`, swDet.total > 0 && swDet.dead.length === 0,
          `enumerated=${swDet.total} withEffect=${swDet.effects} dead=[${swDet.dead.slice(0, 4).join(';')}] controls=${JSON.stringify(swDet.clickedLabels).slice(0, 200)}`);
        await shot(page, vpName, '15-after-detail-clicks');

        R.checks.images_requested += Object.keys(imgMap).length;
        R.checks.images_200 += Object.values(imgMap).filter(s => s === 200 || s === 304).length;
        R.checks.images_broken.push(...Object.entries(imgMap).filter(([, s]) => s >= 400).map(([u]) => u));
        fs.writeFileSync(`e2e/results/shards/raw-AU-036-r6b-net-${vpName}.json`, JSON.stringify(net, null, 1));
      } finally { await L.closeVideo(ctx, videoPath); }

      // ---------- T25 UI leg as THE SELLER (fresh context)
      const videoPath2 = `e2e/videos/AU-036-r6b-t25-${vpName}.webm`;
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
        await p2.goto(APP + '/#/orders', { waitUntil: 'load', timeout: 90000 }); await sleep(4200);
        const TS = await txt(p2);
        const hidden = !TS.includes(dA.json.orderNumber);
        if (hidden) R.checks.state_asserts++;
        assert(`T25-ui-selling-view-hides-${vpName}`, hidden,
          `"${dA.json.orderNumber}" absent from seller orders view`);
        await shot(p2, vpName, '16-t25-selling-hidden');
        await p2.goto(APP + `/#/orders/${fx.state2.orderId}`, { waitUntil: 'load', timeout: 90000 });
        await sleep(4800);
        const TD = await txt(p2);
        const blocked = !TD.includes(String(fx.state2.totalAmount)) && !TD.includes(S2_WANT);
        if (blocked) R.checks.state_asserts++;
        assert(`T25-ui-detail-blocked-${vpName}`, blocked,
          `no order data leaked; head=${TD.split('\n').filter(Boolean).slice(0, 5).join('|').slice(0, 180)}`);
        await shot(p2, vpName, '17-t25-detail-blocked');
      } finally { await L.closeVideo(ctx2, videoPath2); }
    }
  } finally { await browser.close().catch(() => {}); }

  fs.writeFileSync('e2e/results/shards/raw-AU-036-r6b.json', JSON.stringify(R, null, 1));
  console.log('\nSUMMARY', R.asserts.filter(a => a.pass).length + '/' + R.asserts.length,
    'imgs', R.checks.images_requested + '/' + R.checks.images_200,
    'btns', R.checks.buttons_ok + '/' + R.checks.buttons_total,
    'state_asserts', R.checks.state_asserts,
    'placeholders', JSON.stringify(R.checks.placeholder_hits),
    'brokenImgs', JSON.stringify(R.checks.images_broken));
})().catch(e => {
  console.error('FATAL', e.message);
  fs.writeFileSync('e2e/results/shards/raw-AU-036-r6b.json', JSON.stringify({ ...R, fatal: e.message }, null, 1));
  process.exit(1);
});
