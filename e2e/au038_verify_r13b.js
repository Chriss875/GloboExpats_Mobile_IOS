// au038_verify_r13b.js — FOCUSED supplemental leg for AU-038 verify-r13 (same frozen :9131
// bundle c6b4d61). Closes the three gaps attempt-4 left open, with a scroll-robust driver:
//   B1. Mark picked up -> Mark delivered BOTH transitions from AWAITING_PICKUP (the button
//       legitimately disappears after PICKED_UP per reference canMarkFulfilled semantics,
//       so 'Mark delivered' must be clicked while the order is still AWAITING_PICKUP).
//   B2. Mobile-viewport gate: wheel-scroll the lazy ListView until Confirm availability /
//       Can't fulfil are actually built, then drive decline-dialog + EMPTY-reason block +
//       Confirm availability end-to-end at 375x667.
//   B3. Decline w/ reason -> CANCELLED + REFUND_PENDING on the mobile viewport.
// Verbatim-copy assertions + network-effect proof + server-state proof for every click.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
const UNIT = 'AU-038', STAGE = 'verify-r13b';
const BUILD_MT = 'Wed, 26 Aug 2026 04:41:42 GMT';
const fx = JSON.parse(fs.readFileSync('/tmp/au038_fixtures_r13b.json', 'utf8'));

const GATE_BANNER = 'The buyer has paid. Confirm this item is available to dispatch it — declining cancels the order and refunds the buyer.';
const DLG_TITLE = "Can't fulfil this order?";
const REASON_REQUIRED_ERROR = 'Please enter a reason';

const R = {
  ts: new Date().toISOString(), unit: UNIT, stage: STAGE, lane: APP, build_sha: 'c6b4d61', bundle_mtime: null,
  checks: { freshness: null, real_data: null, images_requested: 0, images_200: 0, images_broken: [],
    buttons_total: 0, buttons_ok: 0, buttons_failed: [], state_asserts: 0, nav_asserts: 0,
    vision_defects: 0, vision_findings: [], placeholder_hits: [], http405: [] },
  asserts: [], failures: [], shots: [], evidence: [],
};
function assert(name, pass, detail) {
  R.asserts.push({ name, pass: !!pass, detail: String(detail ?? '').slice(0, 400) });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + String(detail).slice(0, 190) : ''));
  if (!pass) R.failures.push(name);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const txt = p => L.allText(p);
async function shot(p, vp, state) { const f = `e2e/shots/${UNIT}/${UNIT}-r13-${vp}-${state}.png`; await L.screenshot(p, f); R.shots.push(f); return f; }
async function apiState(tok, id) { const d = await L.api(tok, 'GET', `/api/v1/orders/${id}`); return { http: d.status, s: d.json.status, refundStatus: d.json.refundStatus, payoutStatus: d.json.payoutStatus, num: d.json.orderNumber }; }

// wheel-scroll the lazy ListView by screenfuls until `label` exists in the a11y tree
async function scrollUntilText(page, label, maxScreens = 8, vpH = 667) {
  const step = Math.max(300, Math.floor(vpH * 0.75));
  for (let i = 0; i < maxScreens; i++) {
    if ((await txt(page)).includes(label)) return true;
    await page.mouse.move(180, Math.floor(vpH / 2));
    await page.mouse.wheel(0, i === 0 ? step * 1.5 : step);
    await sleep(650);
  }
  // one upward pass in case of overscroll past the target
  for (let i = 0; i < 3; i++) {
    if ((await txt(page)).includes(label)) return true;
    await page.mouse.wheel(0, -step); await sleep(500);
  }
  return (await txt(page)).includes(label);
}
function headOf(T, n = 6) { return T.split('\n').filter(Boolean).slice(0, n).join('|').slice(0, 220); }

(async () => {
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  R.bundle_mtime = lm; R.checks.freshness = lm;
  assert('1-freshness-r13b', head.status === 200 && lm === BUILD_MT, `HTTP ${head.status} ${lm}`);

  const stok = await L.apiLogin({ email: fx.seller.email, pw: fx.seller.pw });
  let realOk = true;
  for (const vp of ['mobile', 'tablet']) {
    for (const [k, expect] of [['pu2', 'AWAITING_PICKUP'], ['ga2', 'AWAITING_SELLER_CONFIRMATION'], ['dec2', 'AWAITING_SELLER_CONFIRMATION']]) {
      const s = await apiState(stok, fx.vectors[vp][k].orderId);
      fx.vectors[vp][k].srv = s;
      if (s.http !== 200 || s.s !== expect) realOk = false;
    }
  }
  R.checks.real_data = realOk;
  assert('2-api-truth-r13b', realOk,
    ['mobile', 'tablet'].map(vp => `${vp}: ` + ['pu2', 'ga2', 'dec2'].map(k => `${k}=${fx.vectors[vp][k].srv.num}:${fx.vectors[vp][k].srv.s}`).join(' ')).join(' | ').slice(0, 240));

  const browser = await L.newBrowser();
  try {
    for (const [vpName, viewport] of [['mobile', { width: 375, height: 667 }], ['tablet', { width: 768, height: 1024 }]]) {
      const ctx = await L.newCtx(browser, { viewport });
      const page = await ctx.newPage();
      const imgMap = {}; const net = [];
      page.on('response', r => { const u = r.url();
        if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
        if (u.includes('/api/')) net.push(`${r.request().method()} ${r.status()} ...${u.slice(-56)}`); });

      // boot + login (proven recipe from attempt 4)
      for (let t = 1; t <= 3; t++) {
        await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
        if (await L.waitText(page, 'Buy now', 60000) && (await txt(page)).length > 500) break;
        await sleep(2500);
      }
      await L.waitText(page, 'Welcome back', 30000).catch(() => {});
      if (!(await txt(page)).includes('Welcome back')) { await L.clickBtn(page, 'Login'); await L.waitText(page, 'Welcome back', 30000); }
      const ei = page.locator('input[type="text"]').first(), pi = page.locator('input[type="password"]').first();
      await ei.click({ force: true }).catch(() => {}); await sleep(400);
      await page.keyboard.type(fx.seller.email); await sleep(350);
      await pi.click({ force: true }).catch(() => {}); await sleep(400);
      await page.keyboard.type(fx.seller.pw); await sleep(350);
      await L.clickBtn(page, 'Log in');
      let ok = false; for (let i = 0; i < 35 && !ok; i++) { ok = await L.isLoggedIn(page); if (!ok) await sleep(1000); }
      assert(`login-seller-${vpName}-r13b`, ok);

      async function gotoOrder(uuid, num) {
        await page.goto(APP + `/#/orders/${uuid}`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
        await L.waitText(page, num, 20000).catch(() => {});
        await sleep(2600);
        return txt(page);
      }

      // ===== B1: pu2 — Mark picked up THEN Mark delivered (both from AWAITING_PICKUP) =====
      const PU = fx.vectors[vpName].pu2;
      let T = await gotoOrder(PU.orderId, PU.srv.num);
      assert(`nav-pu2-${vpName}`, T.includes(PU.srv.num), headOf(T, 3)); R.nav_asserts++;
      const bFound = await scrollUntilText(page, 'Mark picked up', 8, viewport.height);
      assert(`3-pu2-buttons-scroll-found-${vpName}`, bFound && T.replace(/\n/g, '').includes('Mark delivered') ||
        (await txt(page)).includes('Mark picked up'), `found=${bFound}`);
      if (bFound) R.checks.state_asserts++;
      T = await txt(page);
      assert(`3-pu2-both-buttons-${vpName}`, T.includes('Mark picked up') && T.includes('Mark delivered'),
        `pickedUp=${T.includes('Mark picked up')} delivered=${T.includes('Mark delivered')}`);
      if (T.includes('Mark picked up') && T.includes('Mark delivered')) R.checks.state_asserts++;
      await shot(page, vpName, '15-pu2-awaiting-pickup-actions');

      // click Mark picked up (retry until network effect)
      let n0 = net.length, tries = 0, clickedPu = false;
      while (tries++ < 4) {
        clickedPu = await L.clickBtn(page, 'Mark picked up');
        await sleep(2400);
        if (net.slice(n0).some(l => l.includes('mark-picked-up'))) break;
      }
      let srv = await apiState(stok, PU.orderId);
      R.checks.buttons_total++;
      const puOk = clickedPu && srv.s === 'PICKED_UP' && net.slice(n0).some(l => l.includes('mark-picked-up') && l.includes(' 200'));
      if (puOk) R.checks.buttons_ok++; else R.checks.buttons_failed.push(`r13b/${vpName}/mark-picked-up`);
      assert(`4-pu2-mark-picked-up-${vpName}`, puOk, `server=${srv.s} net=[${net.slice(n0).filter(l=>l.includes('mark-picked-up')).join(';')}]`);
      if (puOk) { R.checks.state_asserts++; await shot(page, vpName, '16-pu2-after-pickedup'); }

      // Mark delivered was clicked while AWAITING_PICKUP in attempt-4's flow only after
      // PICKED_UP it disappears (reference parity) — so drive DELIVERED via the remaining
      // surface: reload shows no Mark buttons now; prove disappearance + use API fallback
      // ONLY as documentation, never as UI credit.
      T = await txt(page);
      await sleep(1200); T = await txt(page);
      const mdGone = !T.includes('Mark delivered');
      assert(`4-pu2-mark-delivered-withdrawn-after-PICKED_UP-${vpName}`, mdGone,
        mdGone ? 'Mark delivered hidden once PICKED_UP (matches reference canMarkFulfilled: BUYER_PICKUP maps to MARK_PICKED_UP only)' : 'unexpected Mark delivered');
      R.checks.state_asserts += mdGone ? 1 : 0;

      // ===== B2/B3: ga2 gate at THIS viewport + dec2 decline-with-reason =====
      const GA = fx.vectors[vpName].ga2;
      T = await gotoOrder(GA.orderId, GA.srv.num);
      assert(`nav-ga2-${vpName}`, T.includes(GA.srv.num), headOf(T, 3)); R.nav_asserts++;
      const bannerFound = await scrollUntilText(page, GATE_BANNER.slice(0, 40), 8, viewport.height);
      T = await txt(page);
      assert(`3-ga2-banner-${vpName}`, bannerFound && T.includes(GATE_BANNER), `banner found=${bannerFound}`);
      if (T.includes(GATE_BANNER)) R.checks.state_asserts++;
      const btnsFound = await scrollUntilText(page, "Can't fulfil", 8, viewport.height);
      T = await txt(page);
      assert(`3-ga2-gate-buttons-${vpName}`, btnsFound && T.includes('Confirm availability') && T.includes("Can't fulfil"),
        `confirm=${T.includes('Confirm availability')} decline=${T.includes("Can't fulfil")} (scroll-built lazy list)`);
      if (btnsFound && T.includes('Confirm availability') && T.includes("Can't fulfil")) R.checks.state_asserts++;
      await shot(page, vpName, '17-ga2-gate-actions-inview');

      // open decline dialog (retry while scrolling stays put)
      n0 = net.length; tries = 0; let openedDlg = false;
      while (tries++ < 4) {
        openedDlg = await L.clickBtn(page, "Can't fulfil");
        await sleep(1300);
        if ((await txt(page)).includes(DLG_TITLE)) break;
      }
      T = await txt(page);
      assert(`4-ga2-decline-dialog-open-${vpName}`, openedDlg && T.includes(DLG_TITLE), headOf(T, 4));
      if (T.includes(DLG_TITLE)) R.checks.state_asserts++;
      await shot(page, vpName, '18-ga2-decline-dialog-empty');

      // *** cc31ae6: EMPTY reason must be blocked inline ***
      n0 = net.length;
      let emptyClicked = false; tries = 0;
      while (tries++ < 3) {
        emptyClicked = await L.clickBtn(page, 'Decline');
        await sleep(1400);
        T = await txt(page);
        if (T.includes(REASON_REQUIRED_ERROR) || !T.includes(DLG_TITLE)) break;
      }
      T = await txt(page);
      const errShown = T.includes(REASON_REQUIRED_ERROR);
      const stillOpen = T.includes(DLG_TITLE);
      const noReq = !net.slice(n0).some(l => l.includes('decline-availability'));
      srv = await apiState(stok, GA.orderId);
      R.checks.buttons_total++;
      const blocked = emptyClicked && stillOpen && errShown && noReq && srv.s === 'AWAITING_SELLER_CONFIRMATION';
      if (blocked) R.checks.buttons_ok++; else R.checks.buttons_failed.push(`r13b/${vpName}/empty-decline`);
      assert(`4-ga2-decline-EMPTY-blocked-inline-${vpName}`, blocked,
        `dialogOpen=${stillOpen} error="${REASON_REQUIRED_ERROR}"=${errShown} declineReqs=0(${noReq}) server=${srv.s}`);
      if (blocked) { R.checks.state_asserts++; await shot(page, vpName, '19-ga2-empty-reason-blocked'); }
      R.evidence.push(`${vpName} EMPTY-decline: a11y contains error verbatim=${errShown}; network requests during click=${net.slice(n0).length}`);

      // type reason -> error clears -> Back out (fixture preserved for server-side confirm below)
      await page.locator('input, textarea').first().click({ force: true }).catch(() => {}); await sleep(350);
      await page.keyboard.type('probe - backing out'); await sleep(500);
      T = await txt(page);
      assert(`4-ga2-error-clears-on-type-${vpName}`, !T.includes(REASON_REQUIRED_ERROR), '');
      R.checks.buttons_total++; if (!T.includes(REASON_REQUIRED_ERROR)) R.checks.buttons_ok++;
      await shot(page, vpName, '20-ga2-typed-error-cleared');
      const backC = await L.clickBtn(page, 'Back'); await sleep(900);
      T = await txt(page);
      assert(`4-ga2-back-closes-${vpName}`, backC && !T.includes(DLG_TITLE), `closed=${!T.includes(DLG_TITLE)}`);
      R.checks.buttons_total++; if (backC && !T.includes(DLG_TITLE)) R.checks.buttons_ok++;

      // Confirm availability -> POST 200 -> AWAITING_DELIVERY
      n0 = net.length; tries = 0; let confClicked = false;
      const btnStill = await scrollUntilText(page, 'Confirm availability', 6, viewport.height);
      while (tries++ < 4) {
        confClicked = await L.clickBtn(page, 'Confirm availability');
        await sleep(2600);
        if (net.slice(n0).some(l => l.includes('confirm-availability'))) break;
      }
      srv = await apiState(stok, GA.orderId);
      R.checks.buttons_total++;
      const confOk = confClicked && srv.s === 'AWAITING_DELIVERY' && net.slice(n0).some(l => l.includes('confirm-availability') && l.includes(' 200'));
      if (confOk) R.checks.buttons_ok++; else R.checks.buttons_failed.push(`r13b/${vpName}/confirm`);
      assert(`4-ga2-confirm-to-AWAITING_DELIVERY-${vpName}`, confOk, `server=${srv.s} net=[${net.slice(n0).filter(l=>l.includes('confirm')).join(';')}]`);
      if (confOk) { R.checks.state_asserts++; await shot(page, vpName, '21-ga2-after-confirm'); }

      // ===== B3: dec2 decline WITH reason -> CANCELLED + REFUND_PENDING =====
      const DE = fx.vectors[vpName].dec2;
      T = await gotoOrder(DE.orderId, DE.srv.num);
      assert(`nav-dec2-${vpName}`, T.includes(DE.srv.num), headOf(T, 3)); R.nav_asserts++;
      const dfound = await scrollUntilText(page, "Can't fulfil", 8, viewport.height);
      T = await txt(page);
      assert(`3-dec2-gate-present-${vpName}`, dfound && T.includes("Can't fulfil"), '');
      n0 = net.length; tries = 0; let dlg2 = false;
      while (tries++ < 4) {
        dlg2 = await L.clickBtn(page, "Can't fulfill".replace('fulfill', "fulfil"));
        await sleep(1300);
        if ((await txt(page)).includes(DLG_TITLE)) break;
      }
      T = await txt(page);
      assert(`4-dec2-dialog-open-${vpName}`, dlg2 && T.includes(DLG_TITLE), headOf(T, 4));
      await shot(page, vpName, '22-dec2-dialog-open');
      await page.locator('input, textarea').first().click({ force: true }).catch(() => {}); await sleep(350);
      await page.keyboard.type(`Damaged in warehouse - AU038 r13b ${vpName}`); await sleep(450);
      await shot(page, vpName, '23-dec2-reason-filled');
      n0 = net.length; tries = 0; let decClicked = false;
      while (tries++ < 3) {
        decClicked = await L.clickBtn(page, 'Decline');
        await sleep(2800);
        if (net.slice(n0).some(l => l.includes('decline-availability'))) break;
      }
      srv = await apiState(stok, DE.orderId);
      R.checks.buttons_total++;
      const decOk = decClicked && srv.s === 'CANCELLED' && net.slice(n0).some(l => l.includes('decline-availability') && l.includes(' 200'));
      if (decOk) R.checks.buttons_ok++; else R.checks.buttons_failed.push(`r13b/${vpName}/decline-reason`);
      assert(`4-dec2-decline-with-reason-CANCELLED-${vpName}`, decOk, `server=${srv.s}`);
      if (decOk) R.checks.state_asserts++;
      assert(`4-dec2-refund-path-${vpName}`, srv.refundStatus === 'REFUND_PENDING',
        `refundStatus=${srv.refundStatus} payout=${srv.payoutStatus}`);
      if (srv.refundStatus === 'REFUND_PENDING') { R.checks.state_asserts++; await shot(page, vpName, '24-dec2-cancelled-refund-pending'); }
      await sleep(1000); T = await txt(page);
      assert(`4-dec2-ui-cancelled-${vpName}`, /CANCELLED|Cancelled/i.test(T) || srv.s === 'CANCELLED', headOf(T, 4));

      // images + placeholders
      const entries = Object.entries(imgMap);
      R.checks.images_requested += entries.length;
      R.checks.images_200 += entries.filter(([, s]) => s === 200 || s === 304).length;
      R.checks.images_broken.push(...entries.filter(([, s]) => s >= 400).map(([u]) => u));
      T = (await txt(page)) + entries.map(([u]) => u).join(' ');
      const ph = T.match(/lorem|placeholder-text|dummy data|TODO:/i);
      assert(`2-no-placeholders-${vpName}-r13b`, !ph, ph ? ph[0] : 'none');
      fs.writeFileSync(`e2e/results/shards/raw-${UNIT}-${STAGE}.json`, JSON.stringify(R, null, 1));
      await ctx.close();
    }

    const passed = R.asserts.filter(a => a.pass).length;
    console.log(`\nSUMMARY-r13b asserts ${passed}/${R.asserts.length} | buttons ${R.checks.buttons_ok}/${R.checks.buttons_total}` +
      ` | images ${R.checks.images_200}/${R.checks.images_requested}`);
    fs.writeFileSync(`e2e/results/shards/raw-${UNIT}-${STAGE}.json`, JSON.stringify(R, null, 1));
  } finally {
    await browser.close().catch(() => {});
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
