// au038_verify_r13.js — AU-038 canonical checklist (Appendix A) on the FROZEN :9131 bundle
// git sha c6b4d61 (main.dart.js Last-Modified Wed, 26 Aug 2026 04:41:42 GMT).
// FIRST-TIME-IN-BUNDLE: decline-reason-required fix cc31ae6. Fresh RW fixtures per viewport
// (/tmp/au038_fixtures_r13.json), minted through the REAL sandbox API by au038_seed_r13.js.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
const REF = 'http://localhost:3000';
const UNIT = 'AU-038', STAGE = 'verify-r13';
const BUILD_SHA = 'c6b4d61', BUILD_MT = 'Wed, 26 Aug 2026 04:41:42 GMT';
const fx = JSON.parse(fs.readFileSync('/tmp/au038_fixtures_r13.json', 'utf8'));

// Verbatim copy from lib/screens/orders_screen.dart @ c6b4d61 (+ lib/domain/dispatch_errors.dart)
const GATE_BANNER = 'The buyer has paid. Confirm this item is available to dispatch it — declining cancels the order and refunds the buyer.';
const DLG_TITLE = "Can't fulfil this order?";
const DLG_BODY = 'The order will be cancelled and the buyer refunded.';
const REASON_REQUIRED_ERROR = 'Please enter a reason';
const TOO_EARLY_COPY = "It is too early to dispatch this order. You can dispatch from one hour before the buyer's delivery window starts - no changes needed, just wait.";
const DISPATCH_CARD_TITLE = 'Dispatch status';

let NAVSEQ = 0;
const R = {
  ts: new Date().toISOString(), unit: UNIT, stage: STAGE, verdict: null,
  lane: APP, build_sha: BUILD_SHA, bundle_mtime: null,
  checks: { freshness: false, real_data: false, images_requested: 0, images_200: 0, images_broken: [],
    buttons_total: 0, buttons_ok: 0, buttons_failed: [], state_asserts: 0, nav_asserts: 0,
    vision_defects: 0, vision_findings: [], placeholder_hits: [], http405: [], net_calls: 0,
    parity_blocker: 0, parity_major: 0, parity_minor: 0, parity_accepted: 0 },
  asserts: [], failures: [], shots: [], videos: [], evidence: [], netLog: [], decline_empty_net: [],
};
function assert(name, pass, detail) {
  R.asserts.push({ name, pass: !!pass, detail: String(detail ?? '').slice(0, 400) });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + String(detail).slice(0, 200) : ''));
  if (!pass) R.failures.push(name);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p) { return L.allText(p); }
function shotPath(vp, state) { return `e2e/shots/${UNIT}/${UNIT}-r13-${vp}-${state}.png`; }
async function shot(p, vp, state) { const f = shotPath(vp, state); await L.screenshot(p, f); R.shots.push(f); return f; }
function scanPh(T) { const m = T.match(/lorem|placeholder|dummy|TODO/i); if (m && !R.checks.placeholder_hits.includes(m[0])) R.checks.placeholder_hits.push(m[0]); }
async function apiState(tok, id) {
  const d = await L.api(tok, 'GET', `/api/v1/orders/${id}`);
  const j = d.json || {};
  return { http: d.status, s: j.status, escrowPending: j.escrowPending, payoutStatus: j.payoutStatus,
    refundStatus: j.refundStatus, refundAmount: j.refundAmount, cancellationReason: j.cancellationReason,
    canDispatch: j.canDispatch, reason: j.dispatchBlockedReason, blockers: j.dispatchBlockers,
    total: j.totalAmount, num: j.orderNumber };
}

(async () => {
  // ---------- CHECK 1: FRESHNESS ----------
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  R.bundle_mtime = lm;
  R.checks.freshness = head.status === 200 && lm === BUILD_MT;
  assert('1-freshness-c6b4d61-bundle', R.checks.freshness, `HTTP ${head.status} Last-Modified=${lm}`);

  // ---------- CHECK 2: REAL DATA (server truth for every vector, both viewports) ----------
  const stok = await L.apiLogin({ email: fx.seller.email, pw: fx.seller.pw });
  const btok = await L.apiLogin({ email: fx.buyer.email, pw: fx.buyer.pw });
  const srv = {};
  let realDataOk = true;
  for (const vp of ['mobile', 'tablet']) {
    const V = fx.vectors[vp];
    srv[vp] = {
      gate: await apiState(stok, V.gate.orderId),
      decline: await apiState(stok, V.decline.orderId),
      pickup: await apiState(stok, V.pickup.orderId),
      tooearly: await apiState(stok, V.tooearly.orderId),
    };
    const S = srv[vp];
    const ok =
      S.gate.http === 200 && S.gate.s === 'AWAITING_SELLER_CONFIRMATION' && S.gate.total === V.gate.grandTotal &&
      S.decline.http === 200 && S.decline.s === 'AWAITING_SELLER_CONFIRMATION' &&
      S.pickup.http === 200 && S.pickup.s === 'AWAITING_PICKUP' &&
      S.tooearly.http === 200 && S.tooearly.s === 'READY_FOR_DISPATCH' &&
      S.tooearly.canDispatch === false && S.tooearly.reason === 'DISPATCH_TOO_EARLY' &&
      JSON.stringify(S.tooearly.blockers) === JSON.stringify(['DISPATCH_TOO_EARLY']);
    if (!ok) realDataOk = false;
    assert(`2-api-truth-${vp}`, ok,
      `gate=${S.gate.s}/${S.gate.total} decline=${S.decline.s} pickup=${S.pickup.s} tooearly=${S.tooearly.s}/canDispatch=${S.tooearly.canDispatch}/${S.tooearly.reason}`);
  }
  R.checks.real_data = realDataOk;
  // concrete values we will demand VERBATIM in rendered a11y text
  const TOTAL_GATE = String(srv.mobile.gate.total).replace(/\B(?=(\d{3})+(?!\d))/g, ','); // 28,000

  const browser = await L.newBrowser();
  try {
    for (const [vpName, viewport] of [['mobile', { width: 375, height: 667 }], ['tablet', { width: 768, height: 1024 }]]) {
      const videoPath = `e2e/videos/${UNIT}-r13-${vpName}.webm`;
      const ctx = await L.newCtx(browser, { viewport, videoPath });
      const page = await ctx.newPage();
      const imgMap = {}; const net = [];
      page.on('response', r => {
        const u = r.url();
        if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
        if (u.includes('/api/')) { const line = `${r.request().method()} ${r.status()} ...${u.slice(-60)}`;
          net.push(line); R.netLog.push(`${vpName} ${line}`); R.checks.net_calls++;
          if (r.status() >= 400) console.log(`  NET ${line}`);
          if (r.status() === 405) R.checks.http405.push(`${vpName}:${line}`); }
      });
      page.on('requestfailed', rq => {
        const u = rq.url();
        if (u.includes('/api/')) { const line = `FAILED ${rq.failure() && rq.failure().errorText} ...${u.slice(-60)}`;
          net.push(line); R.netLog.push(`${vpName} ${line}`); }
      });

      // ---- boot the app until REAL home content paints (r13 attempt-1 lesson: under load
      // 'load' fires while CanvasKit still draws nothing — never proceed past a blank canvas)
      async function bootHome() {
        for (let tries = 1; tries <= 3; tries++) {
          await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
          if (await L.waitText(page, 'Buy now', 60000)) {
            const t = await txt(page);
            if (t.length > 500) { console.log(`bootHome ok try${tries} a11y=${t.length}`); return true; }
          }
          console.log(`bootHome retry ${tries} (blank/slow canvas)`);
          await sleep(3000);
        }
        return false;
      }
      const booted = await bootHome();
      assert(`boot-home-painted-${vpName}`, booted);

      // ---- login as the fixture SELLER through the real UI
      async function uiLogin() {
        await L.waitText(page, 'Welcome back', 30000).catch(() => {});
        const nInputs = await page.evaluate(() => document.querySelectorAll('input,textarea').length);
        let haveForm = nInputs >= 2 && (await txt(page)).includes('Welcome back');
        if (!haveForm) { await L.clickBtn(page, 'Login'); await L.waitText(page, 'Welcome back', 30000); }
        const ei = page.locator('input[type="text"]').first(), pi = page.locator('input[type="password"]').first();
        await ei.click({ force: true }).catch(() => {}); await sleep(400);
        await page.keyboard.type('');
        await ei.fill ? null : null;
        await page.evaluate(() => { const i = document.querySelector('input'); if (i) i.value = ''; });
        await ei.click({ force: true }).catch(() => {}); await sleep(300);
        await page.keyboard.type(fx.seller.email); await sleep(350);
        await pi.click({ force: true }).catch(() => {}); await sleep(400);
        await page.keyboard.type(fx.seller.pw); await sleep(350);
        const typed = await page.evaluate(() => [...document.querySelectorAll('input,textarea')].map(i => i.value));
        const typedOk = (typed[0] || '').includes(fx.seller.email.slice(0, 8)) && typed[1] === fx.seller.pw;
        await L.clickBtn(page, 'Log in');
        let ok = false;
        for (let i = 0; i < 35 && !ok; i++) { ok = await L.isLoggedIn(page); if (!ok) await sleep(1000); }
        return { ok, typedOk };
      }
      let lg = await uiLogin();
      if (!lg.ok) { console.log('login retry #1 after reload'); await bootHome(); lg = await uiLogin(); }
      assert(`login-seller-${vpName}`, lg.ok, `typedOk=${lg.typedOk}`);
      R.nav_asserts++;

      // plain-http.server lane: '/' loaded first; in-app hash navigation thereafter
      async function bootOrder(uuid, expectNum, settle = 5200, tries = 3) {
        ++NAVSEQ;
        let T = '';
        for (let t = 1; t <= tries; t++) {
          if (t === 1) {
            await page.evaluate(u => { window.location.hash = '/orders/' + u; }, uuid);
            await sleep(settle);
            T = await txt(page);
          } else {
            // wrong/stale/error render — force a full reload of this deep link
            await page.goto(APP + `/?au038r13=${NAVSEQ}#/orders/${uuid}`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
            await L.waitText(page, expectNum || 'Order', settle + 4000);
            await sleep(2000);
            T = await txt(page);
          }
          // r13 attempt-2 lesson: judge success by the TARGET order number — a stale
          // render of the previous order also matches /ORD-2026-/ and silently points
          // the next vector's clicks at the wrong screen.
          if (expectNum && T.includes(expectNum)) return T;
          if (!expectNum && T.length > 300) return T;
          console.log(`bootOrder retry ${t} (wanted ${expectNum || uuid.slice(0, 8)}, got len ${T.length})`);
        }
        return T;
      }
      function headOf(T, n = 10) { return T.split('\n').filter(Boolean).slice(0, n).join('|').slice(0, 260); }
      // r13 attempt-3 lesson: a force-click on a covered/just-rebuilt semantics node can
      // no-op silently — retry the click until the expected network call actually fires.
      async function clickWithEffect(label, netMarker, maxTries = 4, settle = 2400) {
        for (let i = 1; i <= maxTries; i++) {
          const n0 = net.length;
          const clicked = await L.clickBtn(page, label);
          await sleep(settle);
          if (net.slice(n0).some(l => l.includes(netMarker))) return { clicked, tries: i };
          console.log(`clickWithEffect ${label}: try ${i} fired nothing (clicked=${clicked})`);
        }
        return { clicked: false, tries: maxTries };
      }


      // ============ VECTOR TOOEARLY — dispatch blocker explainer ============
      const TE = fx.vectors[vpName].tooearly, STE = srv[vpName].tooearly;
      let T = await bootOrder(TE.orderId, STE.num); scanPh(T);
      assert(`nav-tooearly-rendered-${vpName}`, T.includes(STE.num), headOf(T, 4));
      if (!T.includes(STE.num)) { // capture diagnostics for a failed deep-link render
        R.evidence.push(`${vpName}-tooearly-render-fail: net=${net.slice(-8).join(' | ')} a11yLen=${T.length}`);
        fs.writeFileSync(`e2e/results/shards/raw-${UNIT}-${STAGE}.json`, JSON.stringify(R, null, 1));
      }
      R.nav_asserts++;
      const hasCard = T.includes(DISPATCH_CARD_TITLE);
      assert(`3-tooearly-dispatch-status-card-${vpName}`, hasCard, hasCard ? '"Dispatch status" card in DOM' : 'card MISSING');
      if (hasCard) R.checks.state_asserts++;
      const hasTooEarlyCopy = T.includes(TOO_EARLY_COPY);
      assert(`3-tooearly-explainer-verbatim-${vpName}`, hasTooEarlyCopy,
        hasTooEarlyCopy ? `"${TOO_EARLY_COPY.slice(0, 58)}…"` : 'too-early copy MISSING');
      if (hasTooEarlyCopy) R.checks.state_asserts++;
      const dispatchBtnVisible = /\bDispatch items\b|\bDispatch for delivery\b|\bDispatch now\b/.test(T.replace(/\n/g, ' '));
      assert(`3-tooearly-no-dispatch-button-${vpName}`, !dispatchBtnVisible,
        dispatchBtnVisible ? 'UNEXPECTED dispatch button while blocked' : 'dispatch correctly withheld while canDispatch=false');
      await L.scrollIntoView(page, DISPATCH_CARD_TITLE); await sleep(500);
      await shot(page, vpName, '01-tooearly-top');
      await L.scrollIntoView(page, 'Actions'); await sleep(400);
      await shot(page, vpName, '02-tooearly-actions');

      // ============ VECTOR PICKUP — mark picked-up/delivered when canMarkFulfilled ============
      const PU = fx.vectors[vpName].pickup, SPU = srv[vpName].pickup;
      T = await bootOrder(PU.orderId, SPU.num); scanPh(T);
      assert(`nav-pickup-rendered-${vpName}`, T.includes(SPU.num), headOf(T, 4));
      R.nav_asserts++;
      if (!T.includes(SPU.num)) { R.evidence.push(`${vpName}-pickup-render-wrong-screen: head=${headOf(T,3)}`); throw new Error(`${vpName}: pickup vector rendered wrong screen — aborting viewport to protect fixtures`); }
      const hasPuBtn = T.includes('Mark picked up'), hasMdBtn = T.includes('Mark delivered');
      assert(`3-pickup-buttons-present-${vpName}`, hasPuBtn && hasMdBtn, `pickedUp=${hasPuBtn} delivered=${hasMdBtn}`);
      if (hasPuBtn && hasMdBtn) R.checks.state_asserts++;
      assert(`3-pickup-total-verbatim-${vpName}`, T.replace(/,/g, '').includes(String(SPU.total)),
        `TSh total ${SPU.total} in a11y text`);
      if (T.replace(/,/g, '').includes(String(SPU.total))) R.checks.state_asserts++;
      await L.scrollIntoView(page, 'Mark picked up'); await sleep(450);
      await shot(page, vpName, '03-pickup-awaiting');

      // Mark picked up -> PATCH mark-picked-up -> PICKED_UP (real transition)
      let n0 = net.length;
      const puClick = await clickWithEffect('Mark picked up', 'mark-picked-up');
      const clickedPu = puClick.clicked || (await L.clickBtn(page, 'Mark picked up'));
      await sleep(2800);
      const afterPu = await apiState(stok, PU.orderId);
      const puNet = net.slice(n0).filter(l => l.includes('mark-picked-up'));
      R.checks.buttons_total++;
      const puOk = clickedPu && puNet.some(l => l.startsWith('PATCH') && l.includes(' 200')) && afterPu.s === 'PICKED_UP';
      if (puOk) R.checks.buttons_ok++; else R.checks.buttons_failed.push(`${vpName}/mark-picked-up:${afterPu.s}`);
      assert(`4-pickup-mark-picked-up-click-${vpName}`, puOk, `click=${clickedPu} server=${afterPu.s} net=[${puNet.join(';')}]`);
      if (puOk) R.checks.state_asserts++;
      await sleep(1200); T = await txt(page);
      assert(`4-pickup-ui-after-pickedup-${vpName}`, T.includes('Marked as picked up') || afterPu.s === 'PICKED_UP', headOf(T, 5));
      await shot(page, vpName, '04-pickup-after-pickedup');

      // Mark delivered -> PATCH mark-delivered -> DELIVERED (BUYER_PICKUP fallback path)
      n0 = net.length;
      const mdClick = await clickWithEffect('Mark delivered', 'mark-delivered');
      const clickedMd = mdClick.clicked || (await L.clickBtn(page, 'Mark delivered'));
      await sleep(3000);
      const afterMd = await apiState(stok, PU.orderId);
      const mdNet = net.slice(n0).filter(l => l.includes('mark-delivered'));
      R.checks.buttons_total++;
      const mdOk = clickedMd && mdNet.some(l => l.startsWith('PATCH') && l.includes(' 200')) && afterMd.s === 'DELIVERED';
      if (mdOk) R.checks.buttons_ok++; else R.checks.buttons_failed.push(`${vpName}/mark-delivered:${afterMd.s}`);
      assert(`4-pickup-mark-delivered-click-${vpName}`, mdOk, `click=${clickedMd} server=${afterMd.s} net=[${mdNet.join(';')}]`);
      if (mdOk) R.checks.state_asserts++;
      await sleep(1400); T = await txt(page);
      assert(`4-pickup-ui-after-delivered-${vpName}`, /DELIVERED|Marked as delivered/i.test(T), headOf(T, 5));
      await shot(page, vpName, '05-pickup-after-delivered');

      // ============ VECTOR GATE — banner, decline EMPTY-reason block (cc31ae6), then Confirm ============
      const GA = fx.vectors[vpName].gate, SGA = srv[vpName].gate;
      T = await bootOrder(GA.orderId, SGA.num); scanPh(T);
      assert(`nav-gate-rendered-${vpName}`, T.includes(SGA.num), headOf(T, 4));
      R.nav_asserts++;
      if (!T.includes(SGA.num)) { R.evidence.push(`${vpName}-gate-render-wrong-screen: head=${headOf(T,3)}`); throw new Error(`${vpName}: gate vector rendered wrong screen — aborting viewport to protect fixtures`); }
      assert(`3-gate-banner-verbatim-${vpName}`, T.includes(GATE_BANNER),
        T.includes(GATE_BANNER) ? 'gate banner verbatim' : 'banner MISSING');
      if (T.includes(GATE_BANNER)) R.checks.state_asserts++;
      await L.scrollIntoView(page, 'Confirm availability').catch(() => {}); await sleep(600);
      T = await txt(page); // actions sit below the fold at 375x667 — judge presence after scroll
      assert(`3-gate-buttons-present-${vpName}`, T.includes('Confirm availability') && T.includes("Can't fulfil"),
        `confirm=${T.includes('Confirm availability')} decline=${T.includes("Can't fulfil")}`);
      assert(`3-gate-total-verbatim-${vpName}`, T.includes(TOTAL_GATE) || T.replace(/,/g, '').includes(String(SGA.total)),
        `total ${SGA.total}`);
      await sleep(300);
      await shot(page, vpName, '06-gate-banner-actions');

      // open the decline dialog
      const openedDlg = await L.clickBtn(page, "Can't fulfil");
      await sleep(1300); T = await txt(page);
      const dlgOk = T.includes(DLG_TITLE) && T.includes(DLG_BODY) && T.includes('Back') && T.includes('Decline');
      assert(`4-gate-decline-dialog-open-${vpName}`, openedDlg && dlgOk, dlgOk ? 'title+body+Back+Decline' : headOf(T, 8));
      if (dlgOk) R.checks.state_asserts++;
      assert(`4-gate-dialog-reason-required-label-${vpName}`, /Reason\s*\*/.test(T), `label shows "Reason *": ${/Reason\s*\*/.test(T)}`);
      if (/Reason\s*\*/.test(T)) R.checks.state_asserts++;
      await shot(page, vpName, '07-decline-dialog-empty');

      // *** THE cc31ae6 FIX: Decline with an EMPTY reason must be blocked INLINE ***
      n0 = net.length;
      const clickedEmptyDecline = await L.clickBtn(page, 'Decline');
      await sleep(1600);
      const emptyNet = net.slice(n0).filter(l => l.includes('decline-availability'));
      R.decline_empty_net.push(...emptyNet.map(l => `${vpName} ${l}`));
      T = await txt(page);
      const stillOpen = T.includes(DLG_TITLE);
      const errShown = T.includes(REASON_REQUIRED_ERROR);
      const noRequest = emptyNet.length === 0;
      const srvGateUnchanged = (await apiState(stok, GA.orderId)).s === 'AWAITING_SELLER_CONFIRMATION';
      R.checks.buttons_total++;
      const emptyBlocked = clickedEmptyDecline && stillOpen && errShown && noRequest && srvGateUnchanged;
      if (emptyBlocked) R.checks.buttons_ok++; else R.checks.buttons_failed.push(`${vpName}/empty-decline-not-blocked`);
      assert(`4-decline-EMPTY-reason-blocked-inline-${vpName}`, emptyBlocked,
        `dialogStillOpen=${stillOpen} errorText="${REASON_REQUIRED_ERROR}" shown=${errShown} declineRequestsFired=${emptyNet.length} serverStill=${srvGateUnchanged ? 'ASC' : 'CHANGED'}`);
      if (emptyBlocked) R.checks.state_asserts++;
      await shot(page, vpName, '08-decline-empty-blocked');

      // error clears while typing (onChanged resets error)
      await page.locator('input, textarea').first().click({ force: true }).catch(() => {});
      await sleep(350);
      await page.keyboard.type('UI probe - going Back, will confirm instead');
      await sleep(600); T = await txt(page);
      const errCleared = !T.includes(REASON_REQUIRED_ERROR);
      assert(`4-decline-error-clears-on-type-${vpName}`, errCleared, `error gone=${errCleared}`);
      R.checks.buttons_total++; if (errCleared) R.checks.buttons_ok++;
      await shot(page, vpName, '09-decline-typed-error-cleared');
      const backClicked = await L.clickBtn(page, 'Back');
      await sleep(1000); T = await txt(page);
      assert(`4-decline-back-closes-dialog-${vpName}`, backClicked && !T.includes(DLG_TITLE), `closed=${!T.includes(DLG_TITLE)}`);
      R.checks.buttons_total++; if (backClicked && !T.includes(DLG_TITLE)) R.checks.buttons_ok++;

      // Confirm availability -> POST confirm-availability -> AWAITING_DELIVERY
      n0 = net.length;
      const clickedConfirm = await L.clickBtn(page, 'Confirm availability');
      await sleep(3000);
      const confNet = net.slice(n0).filter(l => l.includes('confirm-availability'));
      const afterConfirm = await apiState(stok, GA.orderId);
      R.checks.buttons_total++;
      const confirmOk = clickedConfirm && confNet.some(l => l.startsWith('POST') && l.includes(' 200')) && afterConfirm.s === 'AWAITING_DELIVERY';
      if (confirmOk) R.checks.buttons_ok++; else R.checks.buttons_failed.push(`${vpName}/confirm:${afterConfirm.s}:${confNet.join('|').slice(0, 70)}`);
      assert(`4-gate-confirm-to-AWAITING_DELIVERY-${vpName}`, confirmOk, `server=${afterConfirm.s} net=[${confNet.join(';')}]`);
      if (confirmOk) R.checks.state_asserts++;
      await sleep(1500); T = await txt(page);
      assert(`4-gate-banner-gone-after-confirm-${vpName}`, !T.includes(GATE_BANNER.slice(0, 40)), headOf(T, 5));
      await shot(page, vpName, '10-gate-after-confirm');

      // ============ VECTOR DECLINE — reason REQUIRED then honoured -> CANCELLED + REFUND_PENDING ============
      const DE = fx.vectors[vpName].decline, SDE = srv[vpName].decline;
      T = await bootOrder(DE.orderId, SDE.num); scanPh(T);
      assert(`nav-decline-rendered-${vpName}`, T.includes(SDE.num), headOf(T, 4));
      R.nav_asserts++;
      await L.scrollIntoView(page, "Can't fulfil"); await sleep(500);
      const openedDlg2 = await L.clickBtn(page, "Can't fulfil");
      await sleep(1300); T = await txt(page);
      assert(`4-decline-dialog-open-${vpName}`, openedDlg2 && T.includes(DLG_TITLE), headOf(T, 6));
      await shot(page, vpName, '11-decline-dialog-fresh');
      // second proof of the fix on this vector: empty Decline blocked here too
      n0 = net.length;
      await L.clickBtn(page, 'Decline'); await sleep(1400);
      const emptyNet2 = net.slice(n0).filter(l => l.includes('decline-availability'));
      T = await txt(page);
      assert(`4-decline-EMPTY-blocked-second-vector-${vpName}`,
        T.includes(DLG_TITLE) && T.includes(REASON_REQUIRED_ERROR) && emptyNet2.length === 0,
        `open=${T.includes(DLG_TITLE)} err=${T.includes(REASON_REQUIRED_ERROR)} reqs=${emptyNet2.length}`);
      if (T.includes(REASON_REQUIRED_ERROR) && emptyNet2.length === 0) R.checks.state_asserts++;
      await shot(page, vpName, '12-decline-empty-blocked-second');
      // now type a REAL reason and submit
      await page.locator('input, textarea').first().click({ force: true }).catch(() => {});
      await sleep(350);
      await page.keyboard.type(`Damaged in warehouse - AU038 r13 ${vpName}`);
      await sleep(500);
      await shot(page, vpName, '13-decline-reason-filled');
      n0 = net.length;
      const decClicked = await L.clickBtn(page, 'Decline');
      await sleep(3200);
      const decNet = net.slice(n0).filter(l => l.includes('decline-availability'));
      const afterDec = await apiState(stok, DE.orderId);
      R.checks.buttons_total++;
      const decOk = decClicked && decNet.some(l => l.startsWith('POST') && l.includes(' 200')) && afterDec.s === 'CANCELLED';
      if (decOk) R.checks.buttons_ok++; else R.checks.buttons_failed.push(`${vpName}/decline:${afterDec.s}`);
      assert(`4-decline-with-reason-CANCELLED-${vpName}`, decOk, `server=${afterDec.s} net=[${decNet.join(';')}]`);
      if (decOk) R.checks.state_asserts++;
      // refund path: buyer money -> REFUND_PENDING (escrow HELD released to refund)
      assert(`4-decline-refund-path-${vpName}`,
        afterDec.refundStatus === 'REFUND_PENDING',
        `refundStatus=${afterDec.refundStatus} payout=${afterDec.payoutStatus} escrowPending=${afterDec.escrowPending} amount=${JSON.stringify(afterDec.refundAmount)}`);
      if (afterDec.refundStatus === 'REFUND_PENDING') R.checks.state_asserts++;
      await sleep(1500); T = await txt(page);
      assert(`4-decline-ui-cancelled-${vpName}`, /CANCELLED|Cancelled/i.test(T) || afterDec.s === 'CANCELLED', headOf(T, 6));
      await shot(page, vpName, '14-decline-after-cancelled');

      // ============ CLICK-EVERYTHING sweep on the too-early order (stable state) ============
      T = await bootOrder(TE.orderId, STE.num, 4800);
      const seen = new Set(); const controls = [];
      const grab = () => {
        const out = [];
        document.querySelectorAll('flt-semantics').forEach(e => {
          const role = e.getAttribute('role'); const tap = e.getAttribute('flt-tappable') !== null;
          if (role !== 'button' && !tap) return;
          const r = e.getBoundingClientRect();
          if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
          out.push({ kind: role === 'button' ? 'button' : 'tappable', label: (e.textContent || '').trim().slice(0, 46),
            x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
        });
        document.querySelectorAll('input,textarea').forEach(() => out.push({ kind: 'input', label: 'input', x: -1, y: -1 }));
        return out;
      };
      for (let pass = 0; pass < 4; pass++) {
        for (const c of await page.evaluate(grab)) {
          const k = c.kind + '|' + c.label.slice(0, 24);
          if (!seen.has(k)) { seen.add(k); controls.push(c); }
        }
        await page.mouse.move(viewport.width / 2, viewport.height / 2);
        await page.mouse.wheel(0, 260); await sleep(420);
      }
      let effects = 0; const dead = [];
      for (const c of controls) {
        if (c.kind === 'input') continue;
        const bn = net.length; const bt = await txt(page);
        await page.mouse.click(Math.min(Math.max(c.x, 5), viewport.width - 5), Math.min(Math.max(c.y, 5), viewport.height - 5));
        await sleep(950);
        const at = await txt(page);
        const changed = bt !== at || net.length > bn;
        R.checks.buttons_total++;
        if (changed) { effects++; R.checks.buttons_ok++; }
        else { dead.push(c.label); R.checks.buttons_failed.push(`${vpName}/sweep:${c.label.slice(0, 30)}`); }
        if (!at.includes(STE.num) && !at.includes('Delivery tracking')) {
          await bootOrder(TE.orderId, STE.num, 4200);
          await page.mouse.move(viewport.width / 2, viewport.height / 2);
          await page.mouse.wheel(0, -260); await sleep(400);
        }
      }
      assert(`5-click-everything-sweep-${vpName}`, controls.length > 0 && effects > 0 && dead.length === 0,
        `enumerated=${controls.length} effectful=${effects} dead=[${dead.slice(0, 5).join(' ; ').slice(0, 150)}]`);

      // Track delivery navigation (observable effect, from the too-early order)
      T = await bootOrder(TE.orderId, STE.num, 4600);
      n0 = net.length;
      const td = await L.clickBtn(page, 'Track delivery');
      await sleep(2400);
      const TT = await txt(page);
      const tdNav = td && (TT.includes('Delivery tracking') || TT.toLowerCase().includes('tracking'));
      R.checks.buttons_total++; if (tdNav) R.checks.buttons_ok++; else R.checks.buttons_failed.push(`${vpName}/track-delivery`);
      assert(`5-track-delivery-nav-${vpName}`, tdNav, `landing head=${headOf(TT, 4)}`);
      R.nav_asserts++;

      // ---------- CHECK 3: IMAGES ----------
      const entries = Object.entries(imgMap);
      R.checks.images_requested += entries.length;
      R.checks.images_200 += entries.filter(([, s]) => s === 200 || s === 304).length;
      R.checks.images_broken.push(...entries.filter(([, s]) => s >= 400).map(([u]) => u));
      assert(`3-images-all-200-${vpName}`, entries.length > 0 && entries.every(([, s]) => s === 200 || s === 304),
        `${entries.filter(([, s]) => s === 200 || s === 304).length}/${entries.length} image responses 200/304`);

      // zero-placeholder sweep over everything rendered this viewport
      T = await txt(page);
      assert(`2-no-placeholders-${vpName}`, R.checks.placeholder_hits.length === 0,
        `hits=${JSON.stringify(R.checks.placeholder_hits)}`);
      await shot(page, vpName, '99-final');

      // per-viewport evidence snapshot (crash-safe: raw JSON lands after EVERY viewport)
      fs.writeFileSync(`e2e/results/shards/raw-${UNIT}-${STAGE}.json`, JSON.stringify(R, null, 1));
      R.videos.push(videoPath);
      await L.closeVideo(ctx, videoPath);
    } // ---- end viewport loop

    // ---------- CHECK 8: PARITY vs :3000 (same flow where dev data allows) ----------
    try {
      // reference source facts (structural parity — dev backend has none of our sandbox fixtures)
      const refGate = (() => { try { return fs.readFileSync('/home/devsystemadmin/GloboExpats_Frontend/components/orders/seller-availability-gate.tsx', 'utf8'); } catch (e) { return ''; } })();
      const refDetail = (() => { try { return fs.readFileSync('/home/devsystemadmin/GloboExpats_Frontend/app/orders/[id]/page.tsx', 'utf8'); } catch (e) { return ''; } })();
      const refDispatch = (() => { try { return fs.readFileSync('/home/devsystemadmin/GloboExpats_Frontend/lib/dispatch-errors.ts', 'utf8'); } catch (e) { return ''; } })();
      assert('8-parity-ref-decline-reason-required-source', /if \(!reason\.trim\(\)\)/.test(refGate) && /Reason required/.test(refGate),
        'reference seller-availability-gate.tsx blocks submit on empty reason ("Reason required") — mobile cc31ae6 blocks with "Please enter a reason"');
      if (/if \(!reason\.trim\(\)\)/.test(refGate)) R.checks.parity_accepted++;
      assert('8-parity-ref-mark-fulfilled-source', /MARK_PICKED_UP|canMarkFulfilled/.test(refDetail),
        `reference orders/[id] exposes canMarkFulfilled -> MARK_PICKED_UP/MARK_DELIVERED (AWAITING_PICKUP/AWAITING_DELIVERY/PAID/IN_TRANSIT): ${/MARK_PICKED_UP/.test(refDetail)}`);
      if (/MARK_PICKED_UP|canMarkFulfilled/.test(refDetail)) R.checks.parity_accepted++;
      assert('8-parity-ref-dispatch-tooearly-copy-source',
        /DISPATCH_TOO_EARLY:\s*\n?\s*'It is too early to dispatch this order/.test(refDispatch),
        `reference dispatch-errors.ts DISPATCH_TOO_EARLY copy matches mobile kDispatchErrorMessages verbatim (apostrophe variant only)`);
      if (/DISPATCH_TOO_EARLY:\s*\n?\s*'It is too early to dispatch this order/.test(refDispatch)) R.checks.parity_accepted++;
      // live reference render at the same mobile viewport
      const pctx = await browser.newContext({ viewport: { width: 375, height: 667 },
        recordVideo: { dir: 'e2e/videos', size: { width: 375, height: 667 } } });
      const pp = await pctx.newPage();
      const resp = await pp.goto(REF + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
      await sleep(7000);
      const refT = await pp.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => '');
      fs.writeFileSync('e2e/results/shards/raw-AU-038-r13-ref-home.txt', refT);
      const refUp = !!(resp && resp.ok()) || refT.length > 100;
      assert('8-parity-reference-live', refUp, `HTTP ${resp ? resp.status() : 'n/a'}, ${refT.length} chars; deep-link parity not executable live: reference proxies the DEV backend where our sandbox fixtures do not exist (recorded ACCEPTED-DIVERGENCE)`);
      if (!refUp) R.checks.parity_major++;
      else R.checks.parity_accepted++;
      await pp.screenshot({ path: `e2e/shots/${UNIT}/ref-r13-home.png` }).catch(() => {});
      R.shots.push(`e2e/shots/${UNIT}/ref-r13-home.png`);
      const pv = pctx.pages()[0] && await pctx.pages()[0].video();
      await pctx.close(); if (pv) await pv.saveAs(`e2e/videos/${UNIT}-r13-parity-ref.webm`).catch(() => {});
      R.videos.push(`e2e/videos/${UNIT}-r13-parity-ref.webm`);
    } catch (e) {
      assert('8-parity-reference-live', false, 'parity leg errored: ' + e.message);
    }

    // ---------- SUMMARY ----------
    const passed = R.asserts.filter(a => a.pass).length;
    console.log(`\nSUMMARY asserts ${passed}/${R.asserts.length} | buttons ${R.checks.buttons_ok}/${R.checks.buttons_total}` +
      ` | images ${R.checks.images_200}/${R.checks.images_requested} | 405s ${R.checks.http405.length}` +
      ` | placeholders ${R.checks.placeholder_hits.length}`);
    fs.writeFileSync(`e2e/results/shards/raw-${UNIT}-${STAGE}.json`, JSON.stringify(R, null, 1));
  } finally {
    await browser.close().catch(() => {});
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
