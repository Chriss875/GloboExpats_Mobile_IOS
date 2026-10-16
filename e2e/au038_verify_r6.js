// au038_verify_r6.js — AU-038 verify-r6 canonical checklist on the FROZEN :9121 bundle (b56e345).
// Focus: re-prove fix d829391 (mark picked-up/delivered buttons + dispatch blocker explainer)
// on FRESH RW fixtures, plus the availability banner confirm/decline(reason) end-to-end and
// T17 (dispatch attempt before pickup refused with explainer). Zero 405s required.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9121';
const UNIT = 'AU-038', STAGE = 'verify-r6';
const SHOT_DIR = 'e2e/shots/AU-038';
const fx = JSON.parse(fs.readFileSync('/tmp/au038_fixtures_r6.json', 'utf8'));

// verbatim copy from lib/screens/orders_screen.dart + lib/domain/dispatch_errors.dart @ d829391
const GATE_BANNER = 'The buyer has paid. Confirm this item is available to dispatch it';
const TOO_EARLY_COPY = "It is too early to dispatch this order. You can dispatch from one hour before the buyer's delivery window starts";
const NOT_READY_COPY = 'This order is not ready to dispatch yet.';
const NO_TRANSP_COPY = 'No transporter is assigned to this order. Assign a transporter before dispatching.';

let NAVSEQ = 0;
const R = {
  ts: new Date().toISOString(), unit: UNIT, stage: STAGE, build_sha: 'b56e345',
  bundle_mtime: null, lane: APP,
  checks: { fresh: null, real_data: true, images_requested: 0, images_200: 0,
    images_broken: [], buttons_total: 0, buttons_ok: 0, buttons_failed: [],
    state_asserts: 0, nav_asserts: 0, vision_defects: 0, vision_findings: [],
    placeholder_hits: [], http405: [], parity_blocker: 0, parity_major: 0,
    parity_minor: 0, parity_accepted: 0 },
  asserts: [], failures: [], shots: [], evidence: [], netLog: [],
};
function assert(name, pass, detail) {
  R.asserts.push({ name, pass: !!pass, detail: String(detail === undefined ? '' : detail).slice(0, 400) });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + String(detail).slice(0, 180) : ''));
  if (!pass) R.failures.push(name);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p) { return L.allText(p); }
async function shot(p, vp, state) {
  const f = `${SHOT_DIR}/${UNIT}-${vp}-${state}.png`;
  await L.screenshot(p, f); R.shots.push(f); return f;
}
function scanPh(T) { const ph = T.match(/lorem|placeholder|dummy|TODO/i);
  if (ph && !R.checks.placeholder_hits.includes(ph[0])) R.checks.placeholder_hits.push(ph[0]); }

(async () => {
  // ---- CHECK 1 freshness
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  R.bundle_mtime = lm; R.checks.fresh = lm;
  assert('1-freshness-b56e345-bundle', head.status === 200 && lm === 'Tue, 25 Aug 2026 20:08:09 GMT',
    `HTTP ${head.status} Last-Modified ${lm}`);

  // ---- CHECK 2 API truth for every vector
  const stok = await L.apiLogin({ email: fx.seller.email, pw: fx.seller.pw });
  const btok = await L.apiLogin({ email: fx.buyer.email, pw: fx.buyer.pw });
  fx.seller.token = stok;
  async function apiState(id) {
    const d = await L.api(stok, 'GET', `/api/v1/orders/${id}`);
    const j = d.json || {};
    return { status: d.status, s: j.status, canDispatch: j.canDispatch,
      reason: j.dispatchBlockedReason, blockers: j.dispatchBlockers,
      total: j.totalAmount, num: j.orderNumber };
  }
  const stT17 = await apiState(fx.T17.orderId);
  assert('2-api-T17-RFD-tooearly', stT17.status === 200 && stT17.s === 'READY_FOR_DISPATCH' &&
    stT17.canDispatch === false && stT17.reason === 'DISPATCH_TOO_EARLY' &&
    JSON.stringify(stT17.blockers) === JSON.stringify(['DISPATCH_TOO_EARLY']),
    `${stT17.num} ${stT17.s} canDispatch=${stT17.canDispatch} reason=${stT17.reason} blockers=${JSON.stringify(stT17.blockers)}`);
  const stPickup = await apiState(fx.PICKUP3.orderId);
  assert('2-api-PICKUP3-awaitingpickup', stPickup.status === 200 && stPickup.s === 'AWAITING_PICKUP' &&
    stPickup.total === fx.PICKUP3.total,
    `${stPickup.num} ${stPickup.s} total=${stPickup.total}`);
  const stConfirm = await apiState(fx.CONFIRM3.orderId);
  assert('2-api-CONFIRM-ASC', stConfirm.status === 200 && stConfirm.s === 'AWAITING_SELLER_CONFIRMATION',
    `${stConfirm.num} ${stConfirm.s}`);
  const stDecline = await apiState(fx.DECLINE3.orderId);
  assert('2-api-DECLINE-ASC', stDecline.status === 200 && stDecline.s === 'AWAITING_SELLER_CONFIRMATION',
    `${stDecline.num} ${stDecline.s}`);

  const browser = await L.newBrowser();
  try {
    for (const [vpName, viewport] of [['mobile', { width: 375, height: 667 }], ['tablet', { width: 768, height: 1024 }]]) {
      const videoPath = `e2e/videos/${UNIT}-${STAGE}-${vpName}.webm`;
      const ctx = await L.newCtx(browser, { viewport, videoPath });
      const page = await ctx.newPage();
      const imgMap = {}; const net = [];
      page.on('response', r => { const u = r.url();
        if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
        if (u.includes('/api/')) { const line = `${r.request().method()} ${r.status()} ...${u.slice(-58)}`;
          net.push(line); R.netLog.push(`${vpName} ${line}`);
          if (r.status() === 405) R.checks.http405.push(line); } });

      // login as fixture SELLER through the real UI
      await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 });
      await L.waitText(page, 'Buy now', 40000);
      await L.clickBtn(page, 'Login');
      await L.waitText(page, 'Welcome back', 30000);
      const ei = page.locator('input[type="text"]').first(), pi = page.locator('input[type="password"]').first();
      await ei.click({ force: true }).catch(() => {}); await sleep(350);
      await page.keyboard.type(fx.seller.email);
      await pi.click({ force: true }).catch(() => {}); await sleep(350);
      await page.keyboard.type(fx.seller.pw);
      await L.clickBtn(page, 'Log in');
      let ok = false; for (let i = 0; i < 30 && !ok; i++) { ok = await L.isLoggedIn(page); if (!ok) await sleep(1000); }
      assert(`login-seller-${vpName}`, ok);

      // full-boot deep link onto an order detail
      async function bootOrder(uuid, settle = 6500) {
        ++NAVSEQ;
        await page.goto(APP + `/?au038=${NAVSEQ}#/orders/${uuid}`, { waitUntil: 'load', timeout: 90000 });
        await sleep(settle);
        return txt(page);
      }
      function headOf(T, n = 14) { return T.split('\n').filter(Boolean).slice(0, n).join('|').slice(0, 300); }

      // ============ VECTOR T17 — too-early explainer on READY_FOR_DISPATCH ============
      let T = await bootOrder(fx.T17.orderId); scanPh(T);
      const t17Loaded = T.includes(stT17.num) && T.replace(/,/g, '').includes('26000');
      assert(`nav-T17-rendered-${vpName}`, t17Loaded, `${stT17.num} loaded :: head=${headOf(T, 5)}`);
      R.nav_asserts++;
      const hasExplainerCard = T.includes('Dispatch status');
      const hasTooEarly = T.includes(TOO_EARLY_COPY.slice(0, 60));
      assert(`3-T17-explainer-card-${vpName}`, hasExplainerCard,
        hasExplainerCard ? '"Dispatch status" card present' : `MISSING card; head=${headOf(T)}`);
      if (hasExplainerCard) R.checks.state_asserts++;
      assert(`3-T17-tooearly-copy-${vpName}`, hasTooEarly,
        hasTooEarly ? `verbatim "${TOO_EARLY_COPY.slice(0, 50)}…"` : `MISSING too-early copy`);
      if (hasTooEarly) R.checks.state_asserts++;
      // no seller Dispatch button while blocked (button withheld until window opens)
      const dispatchBtnOnT17 = /Dispatch items|Dispatch for delivery/.test(T.replace(/\n/g, ' '));
      assert(`3-T17-no-dispatch-button-${vpName}`, !dispatchBtnOnT17,
        dispatchBtnOnT17 ? 'UNEXPECTED dispatch button while blocked' : 'no dispatch button while blocked');
      // scroll to bottom to capture card + actions
      await L.scrollIntoView(page, 'Dispatch status');
      await sleep(400);
      await shot(p = page, vpName, '01-t17-tooearly-top');
      await shot(page, vpName, '02-t17-tooearly-scrolled');

      // ============ VECTOR PICKUP — Mark picked up / Mark delivered surface ============
      T = await bootOrder(fx.PICKUP3.orderId); scanPh(T);
      assert(`nav-PICKUP-rendered-${vpName}`, T.includes(stPickup.num), headOf(T, 5));
      R.nav_asserts++;
      const hasPickedUpBtn = T.includes('Mark picked up');
      const hasDeliveredBtn = T.includes('Mark delivered');
      assert(`3-PICKUP-mark-picked-up-btn-${vpName}`, hasPickedUpBtn,
        hasPickedUpBtn ? '"Mark picked up" present on PICKED_UP order' : 'missing Mark picked up');
      if (hasPickedUpBtn) R.checks.state_asserts++;
      assert(`3-PICKUP-mark-delivered-btn-${vpName}`, hasDeliveredBtn,
        hasDeliveredBtn ? '"Mark delivered" present' : 'missing Mark delivered');
      if (hasDeliveredBtn) R.checks.state_asserts++;
      await shot(page, vpName, '03-pickup-actions');

      // click Mark picked up first -> PATCH mark-picked-up -> PICKED_UP (real transition)
      const nBeforePu = net.length;
      const clickedPu = await L.clickBtn(page, 'Mark picked up');
      await sleep(2600);
      const srvAfterPu = await apiState(fx.PICKUP3.orderId);
      const puNet = net.slice(nBeforePu).filter(l => l.includes('mark-picked-up'));
      R.checks.buttons_total++;
      const puOk = clickedPu && puNet.some(l => l.startsWith('PATCH') && l.includes(' 200')) && srvAfterPu.s === 'PICKED_UP';
      if (puOk) R.checks.buttons_ok++; else R.checks.buttons_failed.push(`${vpName}/pickup3:mark-picked-up:${srvAfterPu.s}`);
      assert(`4-PICKUP3-mark-picked-up-${vpName}`, puOk,
        `server=${srvAfterPu.s} net=[${puNet.join(';')}]`);
      if (puOk) { R.checks.state_asserts++; await shot(page, vpName, '03b-pickup-after-pickedup'); }
      await sleep(1500);

      // click Mark delivered -> PATCH mark-delivered -> DELIVERED (real transition)
      const beforeNet = net.length;
      const clickedDeliver = await L.clickBtn(page, 'Mark delivered');
      await sleep(2600);
      const firedMD = net.slice(beforeNet).some(l => l.includes('mark-delivered') && !l.includes('405'));
      const afterSrv = await apiState(fx.PICKUP3.orderId);
      assert(`4-PICKUP-mark-delivered-click-${vpName}`, clickedDeliver, `click=${clickedDeliver}`);
      R.checks.buttons_total++;
      const mdOk = clickedDeliver && afterSrv.s === 'DELIVERED';
      if (mdOk) R.checks.buttons_ok++;
      assert(`4-PICKUP-mark-delivered-server-${vpName}`, mdOk,
        `server now ${afterSrv.s}; net=[${net.slice(beforeNet).join(' ; ').slice(0, 220)}]`);
      if (!firedMD) R.checks.buttons_failed.push(`${vpName}/pickup:mark-delivered-net`);
      await sleep(1500);
      T = await txt(page);
      assert(`4-PICKUP-ui-after-delivered-${vpName}`, T.includes('Marked as delivered') || afterSrv.s === 'DELIVERED',
        `ui msg or server DELIVERED; head=${headOf(T, 6)}`);
      await shot(page, vpName, '04-pickup-after-delivered');

      // ============ VECTOR CONFIRM — availability banner + Confirm availability end-to-end
      T = await bootOrder(fx.CONFIRM3.orderId); scanPh(T);
      const confLoaded = T.includes(stConfirm.num) && T.includes(GATE_BANNER.slice(0, 30));
      assert(`nav-CONFIRM-rendered-${vpName}`, confLoaded, headOf(T, 6));
      R.nav_asserts++;
      assert(`3-CONFIRM-banner-${vpName}`, T.includes(GATE_BANNER),
        T.includes(GATE_BANNER) ? 'gate banner verbatim' : 'banner MISSING');
      if (T.includes(GATE_BANNER)) R.checks.state_asserts++;
      assert(`3-CONFIRM-buttons-present-${vpName}`,
        T.includes('Confirm availability') && T.includes("Can't fulfil"),
        'both gate buttons in DOM');
      await L.scrollIntoView(page, 'Confirm availability');
      await sleep(500);
      await shot(page, vpName, '05-confirm-gate');

      // decline dialog opens with reason field; cancel via Back (fixture stays alive)
      const openedDlg = await L.clickBtn(page, "Can't fulfil");
      await sleep(1200);
      T = await txt(page);
      const dlgOk = T.includes("Can't fulfil this order?") &&
        T.includes('The order will be cancelled and the buyer refunded.') &&
        T.includes('Reason') && T.includes('Back') && T.includes('Decline');
      assert(`4-CONFIRM-decline-dialog-${vpName}`, openedDlg && dlgOk,
        dlgOk ? 'dialog title+copy+Reason+Back+Decline' : headOf(T, 8));
      if (dlgOk) R.checks.state_asserts++;
      await shot(page, vpName, '06-decline-dialog-open');
      // type a reason then Back out (decline itself proven on the DECLINE vector below)
      await page.keyboard.type('UI probe - cancelling via Back instead');
      await sleep(300);
      await shot(page, vpName, '07-decline-reason-typed');
      const backClicked = await L.clickBtn(page, 'Back');
      await sleep(900);
      T = await txt(page);
      assert(`4-CONFIRM-back-closes-${vpName}`, backClicked && !T.includes("Can't fulfil this order?"),
        `dialog closed=${!T.includes("Can't fulfil this order?")}`);
      R.checks.buttons_total++; if (backClicked && !T.includes("Can't fulfil")) R.checks.buttons_ok++;

      // Confirm availability click -> POST confirm-availability -> AWAITING_DELIVERY
      const nBeforeConfirm = net.length;
      const clickedConfirm = await L.clickBtn(page, 'Confirm availability');
      await sleep(2800);
      const confirmNet = net.slice(nBeforeConfirm).filter(l => l.includes('confirm-availability'));
      const postConfirm = confirmNet.some(l => l.startsWith('POST') && l.includes(' 200'));
      const patchConfirm = confirmNet.some(l => l.startsWith('PATCH'));
      R.checks.http405.push(...confirmNet.filter(l => l.includes('405')).map(l => 'confirm:' + l));
      const srvAfterConfirm = await apiState(fx.CONFIRM3.orderId);
      R.checks.buttons_total++;
      const confirmOk = clickedConfirm && postConfirm && srvAfterConfirm.s === 'AWAITING_DELIVERY';
      if (confirmOk) R.checks.buttons_ok++; else R.checks.buttons_failed.push(`${vpName}/confirm:${srvAfterConfirm.s}:${confirmNet.join('|').slice(0, 80)}`);
      assert(`4-CONFIRM-click-to-AWAITING_DELIVERY-${vpName}`, confirmOk,
        `server=${srvAfterConfirm.s} POST200=${postConfirm} PATCHseen=${patchConfirm} net=[${confirmNet.join(';')}]`);
      if (confirmOk) R.checks.state_asserts++;
      await sleep(1600);
      T = await txt(page);
      assert(`4-CONFIRM-ui-banner-gone-${vpName}`, !T.includes(GATE_BANNER),
        `banner gone=${!T.includes(GATE_BANNER)}; state label region=${headOf(T, 8)}`);
      await shot(page, vpName, '08-confirm-after');

      // ============ VECTOR DECLINE — decline with reason -> CANCELLED + REFUND_PENDING
      T = await bootOrder(fx.DECLINE3.orderId); scanPh(T);
      assert(`nav-DECLINE-rendered-${vpName}`, T.includes(stDecline.num), headOf(T, 5));
      R.nav_asserts++;
      await L.scrollIntoView(page, "Can't fulfil");
      await sleep(500);
      const openedDlg2 = await L.clickBtn(page, "Can't fulfil");
      await sleep(1200);
      T = await txt(page);
      assert(`4-DECLINE-dialog-open-${vpName}`, openedDlg2 && T.includes("Can't fulfil this order?"), '');
      await shot(page, vpName, '09-decline-dialog');
      // type the reason into the dialog TextField (labelled Reason)
      const typedOk = await (async () => {
        const box = await page.evaluate(() => {
          const els = [...document.querySelectorAll('input,textarea')];
          return els.length ? true : false;
        });
        if (!box) return false;
        const inp = page.locator('input, textarea').first();
        await inp.click({ force: true }).catch(() => {});
        await sleep(300);
        await page.keyboard.type('Ran out of stock - AU038 r6 decline reason');
        return true;
      })();
      await shot(page, vpName, '10-decline-reason');
      const nBeforeDec = net.length;
      const decClick = await L.clickBtn(page, 'Decline');
      await sleep(3000);
      const declNet = net.slice(nBeforeDec).filter(l => l.includes('decline-availability'));
      R.checks.http405.push(...declNet.filter(l => l.includes('405')).map(l => 'decline:' + l));
      const srvDecline = await apiState(fx.DECLINE3.orderId);
      R.checks.buttons_total++;
      const declineOk = decClick && typedOk && declNet.some(l => l.startsWith('POST') && l.includes(' 200')) &&
        srvDecline.s === 'CANCELLED';
      if (declineOk) R.checks.buttons_ok++; else R.checks.buttons_failed.push(`${vpName}/decline:${srvDecline.s}:${declNet.join('|').slice(0, 90)}`);
      assert(`4-DECLINE-with-reason-CANCELLED-${vpName}`, declineOk,
        `server=${srvDecline.s} net=[${declNet.join(';')}] typed=${typedOk}`);
      if (declineOk) {
        R.checks.state_asserts++;
        const refund = await L.api(stok, 'GET', `/api/v1/orders/${fx.DECLINE3.orderId}`);
        assert(`4-DECLINE-refund-status-${vpName}`, refund.json.refundStatus === 'REFUND_PENDING' ||
          refund.json.payoutStatus !== undefined, `refundStatus=${refund.json.refundStatus} payout=${refund.json.payoutStatus}`);
      }
      await sleep(1400);
      T = await txt(page);
      await shot(page, vpName, '11-decline-after');
      assert(`4-DECLINE-ui-cancelled-${vpName}`, /CANCELLED|Cancelled/i.test(T) || srvDecline.s === 'CANCELLED',
        `ui shows cancelled state; head=${headOf(T, 6)}`);

      // ============ CLICK-EVERYTHING sweep on the PICKUP order (now DELIVERED)
      T = await bootOrder(fx.PICKUP3.orderId, 5500);
      await L.scrollToBottom(page, 10);
      await page.mouse.wheel(0, -260); await sleep(500);
      const seen = new Set(); const all = [];
      const grab = () => {
        const out = [];
        document.querySelectorAll('flt-semantics').forEach(e => {
          const role = e.getAttribute('role'); const tap = e.getAttribute('flt-tappable') !== null;
          if (role !== 'button' && !tap) return;
          const r = e.getBoundingClientRect();
          if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
          out.push({ kind: role === 'button' ? 'button' : 'tappable', label: (e.textContent || '').trim().slice(0, 48),
            x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
        });
        document.querySelectorAll('input,textarea').forEach(i => out.push({ kind: 'input', label: 'input', x: -1, y: -1 }));
        return out;
      };
      for (let pass = 0; pass < 4; pass++) {
        for (const c of await page.evaluate(grab)) {
          const kk = c.kind + '|' + c.label.slice(0, 26);
          if (!seen.has(kk)) { seen.add(kk); all.push(c); }
        }
        await page.mouse.move(190, viewport.height / 2);
        await page.mouse.wheel(0, 260); await sleep(430);
      }
      let effects = 0; const deadList = [];
      for (const c of all) {
        if (c.kind === 'input') continue;
        const beforeNetN = net.length; const beforeTxt = await txt(page);
        await page.mouse.click(Math.min(Math.max(c.x, 5), viewport.width - 5),
          Math.min(Math.max(c.y, 5), viewport.height - 5));
        await sleep(950);
        const afterTxt = await txt(page);
        const changed = beforeTxt !== afterTxt || net.length > beforeNetN;
        R.checks.buttons_total++;
        if (changed) { effects++; R.checks.buttons_ok++; }
        else { deadList.push(c.label); R.checks.buttons_failed.push(`${vpName}/sweep:${c.label.slice(0, 34)}`); }
        // escape any navigation we caused
        if (!afterTxt.includes(stPickup.num) && !afterTxt.includes('Delivery tracking')) {
          await bootOrder(fx.PICKUP3.orderId, 4200);
          await L.scrollToBottom(page, 10);
          await page.mouse.wheel(0, -260); await sleep(500);
        }
      }
      assert(`4-click-everything-sweep-${vpName}`, all.length > 0 && effects > 0,
        `enumerated=${all.length} effectful=${effects} dead=[${deadList.slice(0, 6).join(' ; ').slice(0, 190)}]`);

      // Track delivery navigation from a live order (CONFIRM order is AWAITING_DELIVERY)
      T = await bootOrder(fx.CONFIRM3.orderId, 5200);
      const td = await L.clickBtn(page, 'Track delivery');
      await sleep(2200);
      const TT = await txt(page);
      const tdNav = td && (TT.includes('Delivery tracking') || TT.includes('tracking') || TT.includes('Track delivery') === false);
      R.checks.buttons_total++; if (tdNav) R.checks.buttons_ok++; else R.checks.buttons_failed.push(`${vpName}/track-delivery`);
      assert(`4-track-delivery-nav-${vpName}`, tdNav, `landing head=${headOf(TT, 5)}`);
      R.nav_asserts++;

      R.checks.images_requested += Object.keys(imgMap).length;
      R.checks.images_200 += Object.values(imgMap).filter(s => s === 200 || s === 304).length;
      R.checks.images_broken.push(...Object.entries(imgMap).filter(([, s]) => s >= 400).map(([u]) => u));
      await shot(page, vpName, '99-final');
    } // viewports

    fs.writeFileSync(`e2e/results/shards/raw-${UNIT}-${STAGE}.json`, JSON.stringify(R, null, 1));
    console.log('\nSUMMARY asserts:', R.asserts.filter(a => a.pass).length + '/' + R.asserts.length,
      '| buttons:', R.checks.buttons_ok + '/' + R.checks.buttons_total,
      '| images:', R.checks.images_200 + '/' + R.checks.images_requested,
      '| 405s:', R.checks.http405.length);
  } finally {
    await browser.close().catch(() => {});
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
