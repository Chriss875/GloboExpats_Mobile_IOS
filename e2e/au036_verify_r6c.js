// au036_verify_r6c.js — AU-036 r6c. Fixes two r6/r6b HARNESS defects:
//  (1) deep links: fragment-only page.goto() is a same-document navigation the
//      Flutter detail view does not remount -> every state loads with a UNIQUE
//      QUERY (?au036=N) forcing a genuine full boot straight onto the deep link;
//      asserts the rendered order number == target BEFORE reading any banner.
//  (2) click sweep: coordinates were captured up-front, so after the first click
//      moved the layout every later click hit a stale point. Now coordinates are
//      re-read IMMEDIATELY before each individual click, and an effect is ALSO
//      accepted as a screenshot-bytes diff (visual change with identical a11y
//      text still counts, e.g. filter chips).
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9121';
const UNIT = 'AU-036', STAGE = 'verify-r6c';
const SHOT_DIR = 'e2e/shots/AU-036';
const fx = JSON.parse(fs.readFileSync('/tmp/au036_r5.json', 'utf8'));
const S2_WANT = 'Payment submitted - awaiting GloboExpats verification';
const REL_WANT = 'Payment released to seller';

let NAVSEQ = 0;

const R = { ts: new Date().toISOString(), unit: UNIT, stage: STAGE, build_sha: 'e1a5762',
  bundle_mtime: null,
  checks: { fresh: null, real_data: true, images_requested: 0, images_200: 0,
    images_broken: [], buttons_total: 0, buttons_ok: 0, buttons_failed: [],
    state_asserts: 0, vision_defects: 0, vision_findings: [], placeholder_hits: [],
    parity_blocker: 0, parity_major: 0, parity_minor: 0 },
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
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  R.bundle_mtime = lm;
  R.checks.fresh = lm;
  assert('1-freshness-e1a5762-bundle', head.status === 200 && lm === 'Tue, 25 Aug 2026 14:19:24 GMT',
    `HTTP ${head.status} Last-Modified: ${lm}`);

  const btok = await L.apiLogin({ email: fx.buyer.email, pw: fx.buyer.pw });
  const stok = await L.apiLogin({ email: fx.seller.email, pw: fx.seller.pw });
  fx.buyer.token = btok; fx.seller.token = stok;
  const dA = await L.api(btok, 'GET', `/api/v1/orders/${fx.state2.orderId}`);
  const dC = await L.api(btok, 'GET', `/api/v1/orders/${fx.chainC.orderId}`);
  const dD = await L.api(btok, 'GET', `/api/v1/orders/${fx.chainD.orderId}`);
  R.fixturesNow = {
    A: { num: dA.json.orderNumber, s: dA.json.status, e: dA.json.escrowPending,
      p: dA.json.paymentStatus, po: dA.json.payoutStatus },
    C: { num: dC.json.orderNumber, s: dC.json.status, po: dC.json.payoutStatus },
    D: { num: dD.json.orderNumber, s: dD.json.status, r: dD.json.refundStatus, amount: dD.json.refundAmount } };
  console.log('fixtures now:', JSON.stringify(R.fixturesNow));
  assert('2-api-A-state2-trap-fields', dA.json.status === 'AWAITING_PAYMENT' &&
    dA.json.escrowPending === true && dA.json.paymentStatus === 'PENDING' && dA.json.payoutStatus === 'HELD',
    JSON.stringify(R.fixturesNow.A) + '  <- payout HELD while payment PENDING: the V1 trap');
  // real transitions executed earlier in THIS campaign through the admin API
  const refResp = await fetch(`${L.API}/api/v1/admin/orders/${fx.chainC.orderId}/release-payment`,
    { method: 'POST', headers: { Authorization: 'Bearer ' + await L.apiLogin(L.ADMIN) } });
  assert('2-api-C-release-already-released', refResp.status === 409 || refResp.status === 200,
    `re-POST release-payment -> HTTP ${refResp.status} (already RELEASED from r6 real call)`);
  const rrj = await refResp.json().catch(() => ({}));
  assert('2-api-C-payout-RELEASED', dC.json.payoutStatus === 'RELEASED', JSON.stringify(R.fixturesNow.C));
  assert('2-api-D-refunded-with-amount', dD.json.refundStatus === 'REFUNDED' && dD.json.refundAmount > 0,
    JSON.stringify(R.fixturesNow.D));

  const sList = await L.api(stok, 'GET', '/api/v1/orders');
  const sRows = Array.isArray(sList.json) ? sList.json : [];
  assert('T25-api-seller-list-hides-state2', !sRows.some(o => o.orderNumber === dA.json.orderNumber),
    `seller list rows=${JSON.stringify(sRows.map(o => o.orderNumber))}`);
  const sDet = await L.api(stok, 'GET', `/api/v1/orders/${fx.state2.orderId}`);
  assert('T25-api-seller-detail-404', sDet.status === 404,
    `HTTP ${sDet.status} ${JSON.stringify(sDet.json).slice(0, 90)}`);

  const browser = await L.newBrowser();
  try {
    for (const [vpName, viewport] of [['mobile', { width: 375, height: 667 }], ['tablet', { width: 768, height: 1024 }]]) {
      const videoPath = `e2e/videos/AU-036-r6c-${vpName}.webm`;
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
          return ok;
        }
        assert(`login-buyer-${vpName}`, await uiBuyerLogin());

        // full-boot deep link: unique query forces a real document load
        async function bootOrder(orderNumber, settle = 6000) {
          ++NAVSEQ;
          await page.goto(APP + `/?au036=${NAVSEQ}#/orders/${orderNumber}`, { waitUntil: 'load', timeout: 90000 });
          await sleep(settle);
          return txt(page);
        }
        function headOf(T, n = 16) { return T.split('\n').filter(Boolean).slice(0, n).join('|').slice(0, 320); }
        function shows(T, num) { return T.includes(num); }

        // ---- STATE 2 (V1 fix)
        let T = await bootOrder(dA.json.orderNumber); scanPh(T);
        assert(`nav-orderA-rendered-${vpName}`, shows(T, dA.json.orderNumber),
          `detail shows ${dA.json.orderNumber}: ${shows(T, dA.json.orderNumber)}`);
        const s2hit = T.includes(S2_WANT);
        if (s2hit) R.checks.state_asserts++;
        assert(`3-banner-state2-${vpName}`, s2hit,
          s2hit ? `"${S2_WANT}" verbatim` : `MISSING; got=${headOf(T)}`);
        assert(`3-paymentline-PENDING-${vpName}`, /\bPENDING\b/.test(T), `'PENDING' line under the under-review banner`);
        await shot(page, vpName, '20-state2');

        // ---- STATE REFUNDED (real refund POSTed in r6 leg, HTTP 200)
        T = await bootOrder(dD.json.orderNumber); scanPh(T);
        assert(`nav-orderD-rendered-${vpName}`, shows(T, dD.json.orderNumber),
          `detail shows ${dD.json.orderNumber}`);
        const refWant = `Refunded · TSh ${(dD.json.refundAmount || 32000).toString()}`;
        const refHit = T.includes(refWant);
        if (refHit) R.checks.state_asserts++;
        assert(`3-banner-refunded-with-amount-${vpName}`, refHit,
          refHit ? `"${refWant}" verbatim` : `MISSING "${refWant}"; got=${headOf(T)}`);
        assert(`3-cancelled-chip-on-D-${vpName}`, /CANCELLED|Cancelled/i.test(T), 'CANCELLED status alongside Refunded banner');
        await shot(page, vpName, '21-refunded');

        // ---- STATE RELEASED (real release POSTed in r6 leg, HTTP 200)
        T = await bootOrder(dC.json.orderNumber); scanPh(T);
        assert(`nav-orderC-rendered-${vpName}`, shows(T, dC.json.orderNumber),
          `detail shows ${dC.json.orderNumber}`);
        const relHit = T.includes(REL_WANT);
        if (relHit) R.checks.state_asserts++;
        assert(`3-banner-released-${vpName}`, relHit,
          relHit ? `"${REL_WANT}" verbatim` : `MISSING "${REL_WANT}"; got=${headOf(T)}`);
        assert(`3-completed-after-release-${vpName}`, /COMPLETED|Completed/.test(T), 'completed chip after release');
        await shot(page, vpName, '22-released');

        // ---- LIST contains all three fixture orders
        ++NAVSEQ;
        await page.goto(APP + `/?au036=${NAVSEQ}#/orders`, { waitUntil: 'load', timeout: 90000 }); await sleep(5000);
        const TL = await txt(page); scanPh(TL);
        const wantNums = [dA.json.orderNumber, dC.json.orderNumber, dD.json.orderNumber];
        const listRes = wantNums.map(n => ({ n, ok: TL.includes(n) }));
        if (listRes.every(x => x.ok)) R.checks.state_asserts++;
        assert(`3-list-shows-all-fixtures-${vpName}`, listRes.every(x => x.ok),
          listRes.map(x => `${x.n}:${x.ok}`).join(' '));

        // ---- CLICK-EVERYTHING with per-click coordinate refresh + PNG-diff effects
        async function grabCtrls() {
          return page.evaluate(() => {
            const out = [];
            document.querySelectorAll('flt-semantics').forEach(e => {
              const role = e.getAttribute('role'); const tap = e.getAttribute('flt-tappable') !== null;
              if (role !== 'button' && !tap) return;
              const r = e.getBoundingClientRect();
              if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
              out.push({ kind: role === 'button' ? 'button' : 'tappable',
                label: (e.textContent || '').trim().replace(/\n/g, ' ').slice(0, 44),
                x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
            });
            document.querySelectorAll('input').forEach(i =>
              out.push({ kind: 'input', label: (i.getAttribute('aria-label') || i.type || 'input'), x: 0, y: 0 }));
            return out;
          });
        }
        async function sweep(tag) {
          const pending = new Set(); const doneLabels = []; const dead = [];
          let effects = 0, total = 0;
          for (let round = 0; round < 24; round++) {
            const ctrls = await grabCtrls();
            const fresh = ctrls.find(c => c.kind === 'input' ? false : !pending.has(c.kind + '|' + c.label));
            if (ctrls.some(c => c.kind === 'input') && !pending.has('input|' + (ctrls.find(c => c.kind === 'input')?.label || ''))) {
              const inp = ctrls.find(c => c.kind === 'input');
              pending.add('input|' + inp.label); total++; doneLabels.push(inp.label + ':input-present');
              continue;
            }
            if (!fresh) break;
            const key = fresh.kind + '|' + fresh.label;
            pending.add(key); total++;
            const bufBefore = await page.screenshot().catch(() => null);
            const beforeT = await txt(page); const beforeNet = net.length; const beforeUrl = page.url();
            // FRESH coordinates for exactly this node, read right now
            const now = await page.evaluate(lbl => {
              let hit = null;
              document.querySelectorAll('flt-semantics').forEach(e => {
                if (hit) return;
                const t = (e.textContent || '').trim().replace(/\n/g, ' ');
                if (!t.startsWith(lbl.slice(0, 30)) && !t.includes(lbl.slice(0, 30))) return;
                const role = e.getAttribute('role'); const tap = e.getAttribute('flt-tappable') !== null;
                if (role !== 'button' && !tap) return;
                const r = e.getBoundingClientRect();
                if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
                hit = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: r.width };
              });
              return hit;
            }, fresh.label);
            if (now) await page.mouse.click(Math.min(Math.max(now.x, 5), viewport.width - 5),
              Math.min(Math.max(now.y, 5), viewport.height - 5));
            else await page.mouse.click(Math.min(Math.max(fresh.x, 5), viewport.width - 5),
              Math.min(Math.max(fresh.y, 5), viewport.height - 5));
            await sleep(1000);
            const afterT = await txt(page); const bufAfter = await page.screenshot().catch(() => null);
            const pngChanged = !!(bufBefore && bufAfter && !bufBefore.equals(bufAfter));
            const changed = beforeT !== afterT || net.length > beforeNet || page.url() !== beforeUrl || pngChanged;
            doneLabels.push(fresh.label.slice(0, 34) + (changed ? '[eff]' : '[DEAD]'));
            if (changed) effects++; else dead.push(fresh.label.slice(0, 30));
            if (!(await L.isLoggedIn(page))) {
              assert(`recover-login-after-${tag}-${fresh.label.slice(0, 16)}`.slice(0, 60),
                await uiBuyerLogin(), 're-login after logout-inducing click');
              ++NAVSEQ;
              await page.goto(APP + `/?au036=${NAVSEQ}#/orders`, { waitUntil: 'load', timeout: 90000 }); await sleep(4200);
            }
          }
          return { total, effects, dead, doneLabels };
        }
        const swList = await sweep('list');
        R.checks.buttons_total += swList.total; R.checks.buttons_ok += swList.effects;
        R.checks.buttons_failed.push(...swList.dead.map(d => vpName + ':list:' + d));
        assert(`4-clicks-orders-list-${vpName}`, swList.total > 0 && swList.dead.length === 0,
          `enumerated=${swList.total} withEffect=${swList.effects} dead=[${swList.dead.slice(0, 5).join(';')}]`);
        await shot(page, vpName, '23-after-list-clicks');
        fs.writeFileSync(`e2e/results/shards/raw-AU-036-r6c-listclicks-${vpName}.json`,
          JSON.stringify(swList.doneLabels, null, 1));

        T = await bootOrder(dA.json.orderNumber); scanPh(T);
        const swDet = await sweep('state2-detail');
        R.checks.buttons_total += swDet.total; R.checks.buttons_ok += swDet.effects;
        R.checks.buttons_failed.push(...swDet.dead.map(d => vpName + ':detail:' + d));
        assert(`4-clicks-state2-detail-${vpName}`, swDet.total > 0 && swDet.dead.length === 0,
          `enumerated=${swDet.total} withEffect=${swDet.effects} dead=[${swDet.dead.slice(0, 5).join(';')}] controls=${JSON.stringify(swDet.doneLabels).slice(0, 220)}`);
        await shot(page, vpName, '24-after-detail-clicks');

        R.checks.images_requested += Object.keys(imgMap).length;
        R.checks.images_200 += Object.values(imgMap).filter(s => s === 200 || s === 304).length;
        R.checks.images_broken.push(...Object.entries(imgMap).filter(([, s]) => s >= 400).map(([u]) => u));
        fs.writeFileSync(`e2e/results/shards/raw-AU-036-r6c-net-${vpName}.json`, JSON.stringify(net, null, 1));
      } finally { await L.closeVideo(ctx, videoPath); }

      // ---------- T25 UI leg as THE SELLER
      const videoPath2 = `e2e/videos/AU-036-r6c-t25-${vpName}.webm`;
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
        ++NAVSEQ;
        await p2.goto(APP + `/?au036=t25-${NAVSEQ}#/orders`, { waitUntil: 'load', timeout: 90000 }); await sleep(4800);
        const TS = await txt(p2);
        const hidden = !TS.includes(dA.json.orderNumber);
        if (hidden) R.checks.state_asserts++;
        assert(`T25-ui-selling-view-hides-${vpName}`, hidden,
          `"${dA.json.orderNumber}" absent from seller orders view`);
        await shot(p2, vpName, '25-t25-selling-hidden');
        ++NAVSEQ;
        await p2.goto(APP + `/?au036=t25dl-${NAVSEQ}#/orders/${fx.state2.orderId}`, { waitUntil: 'load', timeout: 90000 });
        await sleep(5200);
        const TD = await txt(p2);
        const blocked = !TD.includes(String(fx.state2.totalAmount)) && !TD.includes(S2_WANT);
        if (blocked) R.checks.state_asserts++;
        assert(`T25-ui-detail-blocked-${vpName}`, blocked,
          `no order data leaked; head=${TD.split('\n').filter(Boolean).slice(0, 5).join('|').slice(0, 180)}`);
        await shot(p2, vpName, '26-t25-detail-blocked');
      } finally { await L.closeVideo(ctx2, videoPath2); }
    }
  } finally { await browser.close().catch(() => {}); }

  fs.writeFileSync('e2e/results/shards/raw-AU-036-r6c.json', JSON.stringify(R, null, 1));
  console.log('\nSUMMARY', R.asserts.filter(a => a.pass).length + '/' + R.asserts.length,
    'imgs', R.checks.images_requested + '/' + R.checks.images_200,
    'btns', R.checks.buttons_ok + '/' + R.checks.buttons_total,
    'state_asserts', R.checks.state_asserts,
    'placeholders', JSON.stringify(R.checks.placeholder_hits),
    'brokenImgs', JSON.stringify(R.checks.images_broken));
})().catch(e => {
  console.error('FATAL', e.message);
  fs.writeFileSync('e2e/results/shards/raw-AU-036-r6c.json', JSON.stringify({ ...R, fatal: e.message }, null, 1));
  process.exit(1);
});
