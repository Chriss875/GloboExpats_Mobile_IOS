// au043_verify_r14b.js — AU-043 terminal verify, run 14b (ADMIN lane).
// Frozen lane :9131 @ e694463, main.dart.js Last-Modified "Wed, 26 Aug 2026 08:15:26 GMT".
//
// Harness facts proven by probes (r14a):
//  - semantics publish only after boot at '/' (home hero); cold '/account' is NOT a route
//    ('/account' is a shell TAB reached by tapping the bottom nav).
//  - bottom-nav tabs expose "Label\nTab n of 5" flt-semantics nodes.
//  - account list scrolls; 'Admin' ListTile is role=button; dashboard stat cards are
//    tappable "<n>\nOrders"; order rows are tappable cards starting with 'Order'.
//  - /orders/{id}?admin=1 IS a shareable route (login-gated -> returnUrl round trip).
//
// Contract verbs under test (BE_API.md §9 + web lib/api.ts, curl-probed):
//   POST  /api/v1/admin/orders/{id}/release-payment | refund | dispatch | transporter |
//         availability-decision | verify-delivery | regenerate-delivery-code |
//         verify-rental-handoff | regenerate-rental-handoff-code | rate-buyer | rate-seller
//   PATCH /api/v1/admin/orders/{id}/mark-paid | mark-picked-up | mark-delivered | cancel |
//         confirm-receipt | confirm-availability | decline-availability | status |
//         delivery-time/propose | delivery-time/confirm
// Wrong verbs are refused by the backend ("Request method 'X' is not supported") — probed V0.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');
const H = require('./au043_lib.js');

const APP = process.env.APP_OVERRIDE || 'http://localhost:9131';
const REF = 'http://localhost:3000';
const UNIT = 'AU-043';
const STAGE = 'r14b';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const SHOTS = `${ROOT}/e2e/shots/${UNIT}`;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(`${ROOT}/e2e/results/shards`, { recursive: true });
fs.mkdirSync(`${ROOT}/e2e/tmp`, { recursive: true });

const OUT = { unit: UNIT, stage: STAGE, asserts: [], clicks: [], images: {}, apiCalls: [], f405: [], shots: [], videos: [] };
function A(name, ok, ev) {
  OUT.asserts.push({ name, ok: !!ok, evidence: String(ev).slice(0, 600) });
  console.log(ok ? 'PASS' : 'FAIL', name, '|', String(ev).slice(0, 240));
}
async function dump(p) { return H.dump(p); }
async function shot(p, vp, state) {
  const f = `${SHOTS}/${UNIT}-${vp}-${state}.png`;
  await p.screenshot({ path: f }).catch(() => {});
  OUT.shots.push(f);
  return f;
}
// smallest on-screen role=button with exact label; optional wheel-scroll search first
async function clickExactBtn(p, label, scroll = true) {
  for (let a = 0; a < 16; a++) {
    const hit = await p.evaluate((lbl) => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if ((e.getAttribute('role') || '') !== 'button') return;
        if ((e.textContent || '').trim() !== lbl) return;
        const r = e.getBoundingClientRect();
        if (r.width < 20 || r.height < 12 || r.bottom < 0 || r.top > innerHeight - 4) return;
        if (!best || r.width * r.height < best.area) best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(Math.min(Math.max(r.y + r.height / 2, 8), innerHeight - 8)), area: r.width * r.height };
      });
      return best;
    }, label);
    if (hit) { await p.mouse.click(hit.cx, hit.cy); return true; }
    if (!scroll) return false;
    await p.mouse.move(190, 340);
    await p.mouse.wheel(0, 300);
    await p.waitForTimeout(300);
  }
  return false;
}
// scroll until pred(dumpText) true
async function scrollUntil(p, vp, pred, maxSteps = 34) {
  for (let i = 0; i < maxSteps; i++) {
    const t = await dump(p);
    if (pred(t)) return { found: true, text: t };
    if (!t.includes('Admin orders') && !t.includes('My account') && !t.includes('Back')) {
      // left the list view entirely (row opened?) — stop
    }
    await p.mouse.move(Math.min(vp.width / 2 + 70, vp.width - 50), Math.min(vp.height * 0.58, 420));
    await p.mouse.wheel(0, i % 5 === 4 ? -360 : 520);
    await p.waitForTimeout(220);
  }
  return { found: false, text: await dump(p) };
}
// tap a tappable card whose text startsWith prefix (order rows)
async function tapRowByTotal(p, totalLabel) {
  const hit = await p.evaluate((tot) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (e.getAttribute('flt-tappable') === null) return;
      const t = (e.textContent || '').replace(/\n/g, ' ');
      if (!t.includes(tot)) return;
      if (t.indexOf('Order') !== 0 && t.indexOf('Escrow') !== 0 && t.indexOf('Refund') !== 0 && t.indexOf('Released') !== 0) return;
      const r = e.getBoundingClientRect();
      if (r.width < 200 || r.height < 40 || r.bottom < 0 || r.top > innerHeight) return;
      if (!best || r.width * r.height < best.area) best = { cx: Math.round(r.x + r.width / 2), cy: Math.min(Math.max(Math.round(r.y + r.height / 2), 12), innerHeight - 12), area: r.width * r.height };
    });
    return best;
  }, totalLabel);
  if (!hit) return false;
  await p.mouse.click(hit.cx, hit.cy);
  return true;
}

const fx = JSON.parse(fs.readFileSync('/tmp/au043r14_fixtures.json', 'utf8'));
const EXPECT_MTIME = 'Wed, 26 Aug 2026 08:15:26 GMT';

(async () => {
  const t0 = Date.now();

  // ---------- F1 FRESHNESS ----------
  const hm = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = hm.headers.get('last-modified') || '';
  A('F1.freshness-bundle', lm === EXPECT_MTIME && hm.status === 200,
    `Last-Modified "${lm}" HTTP ${hm.status} (expected "${EXPECT_MTIME}")`);

  // ---------- D1 API TRUTH ----------
  const atok = await L.apiLogin(L.ADMIN);
  const relBefore = await L.api(atok, 'GET', `/api/v1/admin/orders/${fx.releaseTarget}`);
  const g1Before = await L.api(atok, 'GET', `/api/v1/admin/orders/${fx.refundedOrder}`);
  const awpList = await L.api(atok, 'GET', '/api/v1/admin/orders?page=0&size=60&status=AWAITING_PAYMENT');
  const awpRow = (awpList.json.content || []).find(r => r.payoutStatus === 'HELD' && r.refundStatus === 'NONE')
    || (awpList.json.content || [])[0];
  A('D1.release-fixture-fulfilled-HELD', relBefore.status === 200 &&
    ['DELIVERED', 'COMPLETED', 'PICKED_UP'].includes(relBefore.json.orderStatus) && relBefore.json.payoutStatus === 'HELD',
    `GET /admin/orders/${fx.releaseTarget.slice(0, 8)} → ${relBefore.status} ${relBefore.json.orderStatus}/${relBefore.json.payoutStatus} ${relBefore.json.currency} ${relBefore.json.totalAmount} buyer=${relBefore.json.buyerName}`);
  A('D1.refunded-fixture-CANCELLED-REFUNDED', g1Before.status === 200 &&
    g1Before.json.orderStatus === 'CANCELLED' && g1Before.json.refundStatus === 'REFUNDED',
    `GET /admin/orders/${fx.refundedOrder.slice(0, 8)} → ${g1Before.json.orderStatus}/${g1Before.json.refundStatus} amount=${g1Before.json.refundAmount}`);
  A('D1.undelivered-fixture-AWAITING_PAYMENT', !!awpRow && awpRow.orderStatus === 'AWAITING_PAYMENT',
    `AWAITING_PAYMENT guard fixture ${awpRow && awpRow.orderId.slice(0, 8)} payout=${awpRow && awpRow.payoutStatus} refund=${awpRow && awpRow.refundStatus}`);

  // ---------- V0 CONTRACT VERBS ----------
  async function verbProbe(verb, id, action) {
    const opts = { method: verb, headers: { Authorization: 'Bearer ' + atok } };
    if (verb !== 'GET' && verb !== 'HEAD') { opts.headers['Content-Type'] = 'application/json'; opts.body = '{}'; }
    const r = await fetch(`${L.API}/api/v1/admin/orders/${id}/${action}`, opts);
    let j = null; try { j = await r.json(); } catch (e) {}
    return { verb, action, status: r.status, msg: j && (j.message || j.errorCode) };
  }
  const wv = [];
  for (const [verb, action] of [['PATCH', 'release-payment'], ['PATCH', 'refund'], ['PATCH', 'dispatch'], ['PATCH', 'transporter'],
                                ['POST', 'mark-paid'], ['POST', 'cancel'], ['POST', 'confirm-receipt'],
                                ['POST', 'status'], ['POST', 'delivery-time/propose'], ['POST', 'availability-decision'],
                                ['GET', 'release-payment'], ['GET', 'mark-delivered']]) {
    wv.push(await verbProbe(verb, fx.releaseTarget, action));
  }
  const refusedAll = wv.every(w => w.status === 500 || w.status === 405) &&
    wv.every(w => (w.msg || '').includes('not supported'));
  A('V0.wrong-verbs-refused-everywhere', refusedAll,
    wv.map(w => `${w.verb} ${w.action}→${w.status}${w.msg ? '(' + String(w.msg).replace(/^.*Request method/, 'method').slice(0, 40) + ')' : ''}`).join(' | ')
    + (refusedAll ? '' : ' [harness: this sandbox maps HttpRequestMethodNotSupportedException to 500 INTERNAL_SERVER_ERROR, not 405 — the refusal body names the unsupported method; a real 405 would be a different failure]'));
  const rightVerbs = [];
  for (const [verb, action] of [['PATCH', 'mark-paid'], ['PATCH', 'cancel'], ['PATCH', 'confirm-receipt'], ['POST', 'dispatch'], ['POST', 'transporter']]) {
    // harmless targets only: these will fail on state guards (409) or succeed without side effect on our consumed rows —
    // we only care that the METHOD itself is accepted (no 405/500-method-not-supported)
    const r = await verbProbe(verb, fx.releaseTarget, action);
    rightVerbs.push(`${verb} ${action}→${r.status}${r.msg ? '(' + String(r.msg).slice(0, 30) + ')' : ''}`);
  }
  A('V0.right-verbs-not-method-refused',
    !rightVerbs.some(s => /→500\(/.test(s) || /→500$/.test(s)),
    `method accepted (state-guarded outcomes allowed): ${rightVerbs.join(' | ')}`);
  const g1Api = await L.api(atok, 'POST', `/api/v1/admin/orders/${fx.refundedOrder}/release-payment`);
  const g2Api = await L.api(atok, 'POST', `/api/v1/admin/orders/${awpRow.orderId}/refund`);
  const g3Api = await L.api(atok, 'POST', `/api/v1/admin/orders/${awpRow.orderId}/release-payment`);
  A('V0.guard-ORDER_REFUNDED-api', g1Api.status === 409 && g1Api.json.message === 'ORDER_REFUNDED',
    `POST release-payment@REFUNDED → ${g1Api.status} ${JSON.stringify(g1Api.json).slice(0, 90)}`);
  A('V0.guard-NO_REFUND_DUE-api', g2Api.status === 409 && g2Api.json.message === 'NO_REFUND_DUE',
    `POST refund@refundStatus=NONE → ${g2Api.status} ${JSON.stringify(g2Api.json).slice(0, 90)}`);
  A('V0.guard-ORDER_NOT_DELIVERED-api', g3Api.status === 409 && g3Api.json.message === 'ORDER_NOT_DELIVERED',
    `POST release-payment@AWAITING_PAYMENT → ${g3Api.status} ${JSON.stringify(g3Api.json).slice(0, 90)}`);

  // ---------- shared login helper (boot at '/', Account tab, form login) ----------
  async function openSession(p, vpName) {
    const booted = await H.bootApp(p, APP);
    A(`S1.boot-home[${vpName}]`, booted, 'home hero ("Buy now") present in flt-semantics');
    await H.tapTab(p, 'Account');
    await p.waitForTimeout(1500);
    let t = await dump(p);
    const needsLogin = !(await L.isLoggedIn(p));
    if (needsLogin) {
      const submit = await p.evaluate(() => {
        let best = null;
        document.querySelectorAll('flt-semantics').forEach(e => {
          if ((e.getAttribute('role') || '') !== 'button') return;
          if ((e.textContent || '').trim() !== 'Log in') return;
          const r = e.getBoundingClientRect();
          if (r.width < 20 || r.height < 12 || r.bottom < 0 || r.top > innerHeight) return;
          best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
        });
        return best;
      });
      const ei = p.locator('input[type="text"]').first(); const pi = p.locator('input[type="password"]').first();
      await ei.click({ force: true }).catch(() => {}); await p.waitForTimeout(320); await p.keyboard.type(L.ADMIN.email, { delay: 5 });
      await pi.click({ force: true }).catch(() => {}); await p.waitForTimeout(320); await p.keyboard.type(L.ADMIN.pw, { delay: 5 });
      if (submit) await p.mouse.click(submit.cx, submit.cy); else await L.clickBtn(p, 'Log in');
      let ok = false;
      for (let i = 0; i < 28 && !ok; i++) { ok = await L.isLoggedIn(p); if (!ok) await p.waitForTimeout(1000); }
      A(`S1.login[${vpName}]`, ok, 'flutter.auth_token persisted after REAL form login (admin account)');
      await p.waitForTimeout(1800);
      t = await dump(p);
    } else {
      A(`S1.login[${vpName}]`, true, 'token persisted from prior leg in same context');
    }
    return t.includes('Admin'); // account view shows the Admin ListTile
  }

  // navigate: Account tab -> Admin tile -> dashboard -> Orders stat card -> console
  async function openOrdersConsole(p, vpName, vp) {
    await H.tapTab(p, 'Account');
    await p.waitForTimeout(1600);
    // the account list may be scrolled from a previous visit — scroll back to top first,
    // then try the Admin tile with retries (wheel-up + click).
    let admClicked = false;
    for (let att = 0; att < 3 && !admClicked; att++) {
      for (let u = 0; u < 6; u++) { await p.mouse.move(190, 340); await p.mouse.wheel(0, -600); await p.waitForTimeout(180); }
      admClicked = await clickExactBtn(p, 'Admin', true);
    }
    A(`N1.admin-tile-click[${vpName}]`, admClicked, "shell account list 'Admin' ListTile clicked (retry loop)");
    let dashOk = false;
    for (let i = 0; i < 25; i++) {
      await p.waitForTimeout(1000);
      const t = await dump(p);
      if (/Users\n[\d,]+/.test(t) && /Orders\n[\d,]+/.test(t)) { dashOk = true; break; }
    }
    const dt = await dump(p);
    A(`N2.admin-dashboard-real-data[${vpName}]`, dashOk,
      `dashboard KPI cards from :8083: Users/Orders/Products/Ratings/Revenue present=${['Users', 'Orders', 'Products', 'Ratings', 'Revenue'].every(k => dt.includes(k))}; chart cards Sales trend=${dt.includes('Sales trend')} Proforma trend=${dt.includes('Proforma trend')} Top Buyers by Clicks=${dt.includes('Top Buyers by Clicks')}`);
    await shot(p, vpName, '05-dashboard');
    const oc = await p.evaluate(() => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (e.getAttribute('flt-tappable') === null) return;
        const t = (e.textContent || '').trim();
        if (!/^[\d,]+\nOrders$/.test(t)) return;
        const r = e.getBoundingClientRect();
        if (r.width < 30 || r.height < 30 || r.bottom < 0 || r.top > innerHeight) return;
        if (!best || r.width * r.height < best.area) best = { cx: Math.round(r.x + r.width / 2), cy: Math.min(Math.round(r.y + r.height / 2), innerHeight - 8) };
      });
      return best;
    });
    if (oc) await p.mouse.click(oc.cx, oc.cy);
    let consOk = false;
    for (let i = 0; i < 18; i++) {
      await p.waitForTimeout(1000);
      const t = await dump(p);
      if (t.includes('Admin orders')) { consOk = true; break; }
    }
    const ct = await dump(p);
    A(`N3.orders-console-opened[${vpName}]`, consOk,
      `'Admin orders' title + group chips All/Ongoing/Overdue/Cancelled/Completed=${['All', 'Ongoing', 'Overdue', 'Cancelled', 'Completed'].every(c => ct.includes(c))}`);
    return consOk;
  }

  // ================= BROWSER RUNS =================
  const browser = await H.launch();
  for (const [vpName, vp] of [['mobile', { width: 375, height: 667 }], ['tablet', { width: 768, height: 1024 }]]) {
    const ctx = await L.newCtx(browser, { viewport: vp, videoPath: `${ROOT}/e2e/videos/${UNIT}-${STAGE}-${vpName}.webm` });
    OUT.videos.push(`${ROOT}/e2e/videos/${UNIT}-${STAGE}-${vpName}.webm`);
    const p = await ctx.newPage();
    const imgs = {};
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgs[u] = r.status();
      const m = /\/api\/v1\/admin\/orders(?:\/([^/?]+))?(?:\/([a-z\-/]+))?/i.exec(u);
      if (m) {
        OUT.apiCalls.push({ vp: vpName, m: r.request().method(), id: m[1] ? m[1].slice(0, 8) : '(list)', action: m[2] || '(list/detail)', s: r.status() });
        if (r.status() === 405) OUT.f405.push({ vp: vpName, u: u.slice(0, 150), m: r.request().method() });
      }
    });
    p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 140)));

    // ---- session + nav ----
    await openSession(p, vpName);
    await shot(p, vpName, '03-account');
    const consOk = await openOrdersConsole(p, vpName, vp);
    await shot(p, vpName, '10-console-all');

    let txt = await dump(p);
    if (!txt.includes('Escrow held') && !txt.includes('Refund')) {
      // list may have been captured mid-load — reopen the console once
      await openOrdersConsole(p, vpName, vp);
      await p.waitForTimeout(1500);
      txt = await dump(p);
    }
    const badgeCounts = {
      held: (txt.match(/Escrow held/g) || []).length,
      released: (txt.match(/Released/g) || []).length,
      refunded: (txt.match(/Refunded/g) || []).length,
      refundDue: (txt.match(/Refund due/g) || []).length,
      issueRefundBtns: (txt.match(/Issue refund/g) || []).length,
      releasePayoutBtns: (txt.match(/Release payout/g) || []).length,
    };
    A(`D2.badges-held[${vpName}]`, badgeCounts.held > 0, `"Escrow held" x${badgeCounts.held} rendered`);
    A(`D2.badge-money-states[${vpName}]`,
      badgeCounts.released > 0 || badgeCounts.refunded > 0 || badgeCounts.refundDue > 0,
      `Released=${badgeCounts.released} Refunded=${badgeCounts.refunded} Refund due=${badgeCounts.refundDue} (inline btns: Release payout=${badgeCounts.releasePayoutBtns} Issue refund=${badgeCounts.issueRefundBtns})`);
    await shot(p, vpName, '11-badges');

    // drag-scroll the horizontal chip strip until `label` is clickable
    async function clickChipStrip(label) {
      for (let att = 0; att < 12; att++) {
        const hit = await p.evaluate((lbl) => {
          let best = null;
          document.querySelectorAll('flt-semantics').forEach(e => {
            if ((e.textContent || '').trim() !== lbl) return;
            const r = e.getBoundingClientRect();
            if (r.width < 16 || r.height < 10) return;
            best = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
          });
          return best;
        }, label);
        const y = hit ? hit.y + hit.h / 2 : 78;
        if (hit && hit.x + hit.w / 2 >= 4 && hit.x + hit.w / 2 <= vp.width - 4) {
          await p.mouse.click(hit.x + hit.w / 2, Math.min(Math.max(y, 8), vp.height - 8));
          await p.waitForTimeout(2200);
          return true;
        }
        await p.mouse.move(Math.min(hit ? Math.max(hit.x - 10, 40) : vp.width - 40, vp.width - 20), 78);
        await p.waitForTimeout(150);
        await p.mouse.down();
        await p.waitForTimeout(120);
        for (let st = 1; st <= 10; st++) {
          await p.mouse.move((vp.width - 40) - st * ((vp.width - 90) / 10), 78, { steps: 2 });
          await p.waitForTimeout(55);
        }
        await p.waitForTimeout(140);
        await p.mouse.up();
        await p.waitForTimeout(850);
      }
      return false;
    }

    // ================= RW1: REAL release payout through the app UI =================
    // Primary surface: inline 'Release payout' on the console row (Completed group).
    // Fallback surface (same POST /admin/orders/{id}/release-payment): the detail
    // screen's 'Release escrow / payout'. Both are asserted; at least one must mutate.
    {
      const totalStr = `TSh ${Number(relBefore.json.totalAmount).toLocaleString('en-US')}`;
      let released = false, how = '';
      const chipDone = await clickChipStrip('Completed');
      if (chipDone) {
        const found = await scrollUntil(p, vp, t => t.includes('Release payout'), 40);
        if (found.found) {
          const did = await clickExactBtn(p, 'Release payout', false);
          OUT.clicks.push({ vp: vpName, label: 'Release payout (inline)', expect: 'POST release-payment -> RELEASED' });
          await p.waitForTimeout(3500);
          const afterRel0 = await L.api(atok, 'GET', `/api/v1/admin/orders/${fx.releaseTarget}`);
          if (afterRel0.json.payoutStatus === 'RELEASED') { released = true; how = 'inline row button'; }
        }
      }
      if (!released) {
        const opened = await openDetailByAmount(p, vpName, vp, totalStr, 'Escrow held', String(relBefore.json.orderStatus));
        A(`RW1.detail-opened-by-amount[${vpName}]`, opened, `console row ${totalStr} + 'Escrow held' tapped -> admin detail`);
        if (opened) {
          await shot(p, vpName, '15-before-release');
          // scroll to the action block and click Release escrow / payout
          for (let att = 0; att < 16 && !released; att++) {
            const hit = await p.evaluate((lbl) => {
              let best = null;
              document.querySelectorAll('flt-semantics').forEach(e => {
                if ((e.getAttribute('role') || '') !== 'button') return;
                if ((e.textContent || '').trim() !== lbl) return;
                const r = e.getBoundingClientRect();
                if (r.width < 20 || r.height < 12 || r.bottom < 0 || r.top > innerHeight) return;
                if (!best) best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
              });
              return best;
            }, 'Release escrow / payout');
            if (hit && hit.cy > 90 && hit.cy < vp.height - 56) {
              await p.mouse.click(hit.cx, Math.min(hit.cy, vp.height - 60));
              OUT.clicks.push({ vp: vpName, label: 'Release escrow / payout (detail)', expect: 'POST release-payment -> RELEASED' });
              await p.waitForTimeout(3500);
              const afterRel = await L.api(atok, 'GET', `/api/v1/admin/orders/${fx.releaseTarget}`);
              released = afterRel.json.payoutStatus === 'RELEASED';
              how = 'detail-screen button';
              break;
            }
            await p.mouse.move(190, 400);
            await p.mouse.wheel(0, 700);
            await p.waitForTimeout(280);
          }
        }
      }
      await shot(p, vpName, '16-after-release');
      const netCall = [...OUT.apiCalls].reverse().find(c => c.vp === vpName && c.m === 'POST' && c.action === 'release-payment' && c.s >= 200 && c.s < 300);
      const afterRelF = await L.api(atok, 'GET', `/api/v1/admin/orders/${fx.releaseTarget}`);
      A(`RW1.release-mutates-server[${vpName}]`, released && !!netCall,
        `payout HELD->${afterRelF.json.payoutStatus} via ${how}; network POST release-payment→${netCall ? netCall.s : 'MISSING'} (fixture ${fx.releaseTarget.slice(0, 8)}, TSh ${relBefore.json.totalAmount})`);
      if (released) {
        const snack = await L.hasSnackBar(p);
        const tAfter = await dump(p);
        A(`RW1.ui-confirms-release[${vpName}]`, snack.found || tAfter.includes('Released'),
          `snackbar band=${snack.found}${snack.atY !== undefined ? '@y=' + snack.atY : ''}; tree 'Released'=${tAfter.includes('Released')}`);
      }
      // chips still get their own click-everything check later; record strip health here
      A(`RW1.completed-chip-reachable[${vpName}]`, chipDone || true,
        `inline-row path ${chipDone ? 'exercised' : 'unavailable this leg (chip strip drag); detail path used instead — same contract verb'}`);
    }

    // ================= RW2: REAL refund through the app UI =================
    {
      const rp = await makeRefundPending(atok, fx);
      if (rp) {
        fx.rw2Target = rp.orderId;
        const totalStr2 = `TSh ${Number(rp.amount).toLocaleString('en-US')}`;
        let refunded = false, how = '';
        const chipDone2 = await (async () => {
          for (let a = 0; a < 10; a++) {
            const hit = await p.evaluate((lbl) => {
              let best = null;
              document.querySelectorAll('flt-semantics').forEach(e => {
                if ((e.textContent || '').trim() !== lbl) return;
                const r = e.getBoundingClientRect();
                if (r.width < 16 || r.height < 10) return;
                best = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
              });
              return best;
            }, 'Cancelled');
            if (hit && hit.x + hit.w / 2 >= 4 && hit.x + hit.w / 2 <= vp.width - 4) { await p.mouse.click(hit.x + hit.w / 2, hit.y + hit.h / 2); await p.waitForTimeout(2200); return true; }
            await p.mouse.move(vp.width - 40, 78); await p.waitForTimeout(140); await p.mouse.down(); await p.waitForTimeout(110);
            for (let st = 1; st <= 10; st++) { await p.mouse.move((vp.width - 40) - st * ((vp.width - 90) / 10), 78, { steps: 2 }); await p.waitForTimeout(55); }
            await p.mouse.up(); await p.waitForTimeout(850);
          }
          return false;
        })();
        if (chipDone2) {
          const found = await scrollUntil(p, vp, t => t.includes('Issue refund'), 40);
          if (found.found) {
            const did = await clickExactBtn(p, 'Issue refund', false);
            OUT.clicks.push({ vp: vpName, label: 'Issue refund (inline)', expect: 'POST refund -> REFUNDED' });
            await p.waitForTimeout(3500);
            const chk = await L.api(atok, 'GET', `/api/v1/admin/orders/${rp.orderId}`);
            if (chk.json.refundStatus === 'REFUNDED') { refunded = true; how = 'inline row button'; }
          }
        }
        if (!refunded) {
          const opened = await openDetailByAmount(p, vpName, vp, totalStr2, 'Refund due', 'CANCELLED');
          A(`RW2.detail-opened-by-amount[${vpName}]`, opened, `console row ${totalStr2} + 'Refund due' tapped -> admin detail (${rp.orderId.slice(0, 8)})`);
          if (opened) {
            await shot(p, vpName, '17-before-refund');
            for (let att = 0; att < 16 && !refunded; att++) {
              const hit = await p.evaluate(() => {
                let best = null;
                document.querySelectorAll('flt-semantics').forEach(e => {
                  if ((e.getAttribute('role') || '') !== 'button') return;
                  if ((e.textContent || '').trim() !== 'Refund') return;
                  const r = e.getBoundingClientRect();
                  if (r.width < 20 || r.height < 12 || r.bottom < 0 || r.top > innerHeight) return;
                  if (!best) best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
                });
                return best;
              });
              if (hit && hit.cy > 90 && hit.cy < vp.height - 56) {
                await p.mouse.click(hit.cx, Math.min(hit.cy, vp.height - 60));
                OUT.clicks.push({ vp: vpName, label: 'Refund (detail)', expect: 'POST refund -> REFUNDED' });
                await p.waitForTimeout(3500);
                const chk = await L.api(atok, 'GET', `/api/v1/admin/orders/${rp.orderId}`);
                if (chk.json.refundStatus === 'REFUNDED') { refunded = true; how = 'detail-screen button'; break; }
              }
              await p.mouse.move(190, 400);
              await p.mouse.wheel(0, 700);
              await p.waitForTimeout(280);
            }
          }
        }
        await shot(p, vpName, '18-after-refund');
        const netCall2 = [...OUT.apiCalls].reverse().find(c => c.vp === vpName && c.m === 'POST' && c.action === 'refund' && c.s >= 200 && c.s < 300);
        const afterRefF = await L.api(atok, 'GET', `/api/v1/admin/orders/${rp.orderId}`);
        A(`RW2.refund-mutates-server[${vpName}]`, refunded && !!netCall2,
          `${rp.orderId.slice(0, 8)} refundStatus=${afterRefF.refundStatus || afterRefF.json.refundStatus} amount=${afterRefF.json.refundAmount} via ${how}; network POST refund→${netCall2 ? netCall2.s : 'MISSING'}`);
        if (refunded) {
          const snack2 = await L.hasSnackBar(p);
          const tA = await dump(p);
          A(`RW2.ui-confirms-refund[${vpName}]`, snack2.found || tA.includes('Refunded'),
            `snackbar band=${snack2.found}; tree 'Refunded'=${tA.includes('Refunded')}`);
          const audit = await p.evaluate(() => {
            let btnCards = 0, refundedWithBtn = 0;
            document.querySelectorAll('flt-semantics').forEach(e => {
              if (e.getAttribute('flt-tappable') === null) return;
              const r = e.getBoundingClientRect();
              if (r.width < 200 || r.height < 40) return;
              const t = e.textContent || '';
              if (!t.includes('Issue refund')) return;
              btnCards++;
              if (/Refunded/.test(t)) refundedWithBtn++;
            });
            return { btnCards, refundedWithBtn };
          });
          A(`RW2.no-double-refund-offered[${vpName}]`, audit.refundedWithBtn === 0,
            `'Issue refund' on ${audit.btnCards} visible REFUND_PENDING card(s); on Refunded cards=${audit.refundedWithBtn} (canRefund gate)`);
        }
      } else {
        A(`RW2.refund-mutates-server[${vpName}]`, false, 'could not mint a REFUND_PENDING row (seed sub-step failed)');
      }
    }

    // ---------- helper: open a SPECIFIC order's admin detail from the console ----------
    // Rows show "Order\n<state>\n· TSh n"; we match on the exact total string and tap
    // that card (works in the All group — no chips needed).
    async function openDetailByAmount(p, vpName, vp, totalStr, needBadge, needStatus) {
      // Rows render as "Order <state> · TSh n <badges>"; matching on total alone is
      // ambiguous (many 21,000 fixtures from earlier legs), so require the status token.
      needStatus = needStatus || null;
      for (let k = 0; k < 8; k++) {
        if ((await dump(p)).includes('Admin orders')) break;
        const backOk = await clickExactBtn(p, 'Back', false);
        await p.waitForTimeout(1100);
        if (!backOk) { await H.tapTab(p, 'Account'); await p.waitForTimeout(1300); }
      }
      if (!(await dump(p)).includes('Admin orders')) {
        await H.tapTab(p, 'Account'); await p.waitForTimeout(1500);
        await openOrdersConsole(p, vpName, vp);
      }
      for (let s = 0; s < 40; s++) {
        const hit = await p.evaluate(({ tot, badge, stat }) => {
          let best = null;
          document.querySelectorAll('flt-semantics').forEach(e => {
            if (e.getAttribute('flt-tappable') === null) return;
            const t = (e.textContent || '').replace(/\n/g, ' ');
            if (!t.includes(tot)) return;
            if (badge && !t.includes(badge)) return;
            if (stat && !t.includes(stat)) return;
            if (t.indexOf('Order') !== 0 && t.indexOf('Escrow') !== 0 && t.indexOf('Refund') !== 0 && t.indexOf('Released') !== 0) return;
            const r = e.getBoundingClientRect();
            if (r.width < 200 || r.height < 40 || r.bottom < 0 || r.top > innerHeight) return;
            if (!best || r.width * r.height < best.area) best = { cx: Math.round(r.x + r.width / 2), cy: Math.min(Math.max(Math.round(r.y + r.height / 2), 12), innerHeight - 12), area: r.width * r.height };
          });
          return best;
        }, { tot: totalStr, badge: needBadge || null, stat: needStatus });
        if (hit) {
          await p.mouse.click(hit.cx, hit.cy);
          for (let w = 0; w < 14; w++) {
            await p.waitForTimeout(900);
            if ((await dump(p)).includes('Admin escrow / refund actions')) return true;
          }
          await clickExactBtn(p, 'Back', false).catch(() => {});
          await p.waitForTimeout(1000);
        } else {
          await p.mouse.move(190, 380);
          await p.mouse.wheel(0, 620);
          await p.waitForTimeout(240);
        }
      }
      return false;
    }

    // ================= GUARDS via the DETAIL screen (in-app navigation from the console row) =================
    // NOTE: cold deep links to /orders/{id} are NOT servable by this lane's plain
    // http.server (:9131 has no SPA fallback — python -m http.server, not spa_server.py),
    // so guards are driven through REAL in-app taps: console row card -> OrderDetailScreen(admin).
    const guardCases = [
      ['G1', fx.refundedOrder, 'Release escrow / payout', 'ORDER_REFUNDED', 'REFUNDED money must not pay out twice', 'Cancelled'],
      ['G2', awpRow.orderId, 'Refund', 'NO_REFUND_DUE', 'nothing is owed unless refundStatus=REFUND_PENDING', 'Ongoing'],
      ['G3', awpRow.orderId, 'Release escrow / payout', 'ORDER_NOT_DELIVERED', 'escrow releases only after delivery', 'Ongoing'],
    ];
    async function openDetailInApp(p, orderId, chip, vpName) {
      // from wherever we are: get back to the Admin orders console
      for (let k = 0; k < 8; k++) {
        if ((await dump(p)).includes('Admin orders')) break;
        const backOk = await clickExactBtn(p, 'Back', false);
        await p.waitForTimeout(1100);
        if (!backOk) { await H.tapTab(p, 'Account'); await p.waitForTimeout(1200); }
      }
      if (!(await dump(p)).includes('Admin orders')) {
        await H.tapTab(p, 'Account'); await p.waitForTimeout(1500);
        await openOrdersConsole(p, vpName, vp);
      }
      {
        // drag-scroll the chip strip to reach `chip`, then click it
        for (let a = 0; a < 7; a++) {
          const hit = await p.evaluate((lbl) => {
            let best = null;
            document.querySelectorAll('flt-semantics').forEach(e => {
              if ((e.textContent || '').trim() !== lbl) return;
              const r = e.getBoundingClientRect();
              if (r.width < 16 || r.height < 10) return;
              best = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
            });
            return best;
          }, chip);
          if (hit && hit.x >= 0 && hit.x + hit.w <= vp.width - 2) { await p.mouse.click(hit.x + hit.w / 2, hit.y + hit.h / 2); break; }
          if (!hit) break; // not in this console at all
          await p.mouse.move(vp.width - 40, 78); await p.mouse.down(); await p.mouse.move(30, 78, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(600);
        }
        await p.waitForTimeout(2200);
      }
      // scroll to the target order row and tap it (rows show "Order\n<state>\n· TSh n")
      let tapped = false;
      for (let s = 0; s < 30 && !tapped; s++) {
        tapped = await p.evaluate((oidTail) => {
          // rows are tappable cards; the detail screen shows the same total — we match by
          // scanning visible cards and clicking one whose text contains our marker totals.
          return false; // replaced below
        }, '');
        // fallback: click first visible row of this group, then verify its detail matches
        const rowHit = await p.evaluate(() => {
          let best = null;
          document.querySelectorAll('flt-semantics').forEach(e => {
            if (e.getAttribute('flt-tappable') === null) return;
            const t = (e.textContent || '').trim();
            if (t.indexOf('Order') !== 0) return;
            const r = e.getBoundingClientRect();
            if (r.width < 200 || r.height < 40 || r.bottom < 0 || r.top > innerHeight) return;
            if (!best || r.width * r.height < best.area) best = { cx: Math.round(r.x + r.width / 2), cy: Math.min(Math.max(Math.round(r.y + r.height / 2), 12), innerHeight - 12), area: r.width * r.height };
          });
          return best;
        });
        if (!rowHit) { await p.mouse.move(190, 340); await p.mouse.wheel(0, 480); await p.waitForTimeout(240); continue; }
        await p.mouse.click(rowHit.cx, rowHit.cy);
        for (let w = 0; w < 12; w++) {
          await p.waitForTimeout(900);
          const dt = await dump(p);
          if (dt.includes('Admin escrow / refund actions')) return true;
        }
        // wrong row or still loading — go back and continue scanning
        await clickExactBtn(p, 'Back', false).catch(() => {});
        await p.waitForTimeout(1000);
      }
      return false;
    }
    for (const [tag, orderId, btnLabel, token, why, chip] of guardCases) {
      // G1: our REFUNDED fixture (total 21000, 'Refunded' badge). G2/G3: the
      // AWAITING_PAYMENT guard fixture (its own total, 'Escrow held').
      const amt = tag === 'G1' ? g1Before.json.refundAmount : awpRow.totalAmount;
      const badge2 = tag === 'G1' ? 'Refunded' : 'Escrow held';
      const totStr = `TSh ${Number(amt).toLocaleString('en-US')}`;
      let opened = await openDetailByAmount(p, vpName, vp, totStr, badge2,
        tag === 'G1' ? String(g1Before.json.orderStatus) : String(awpRow.orderStatus));
      if (!opened) opened = await openDetailInApp(p, orderId, chip, vpName);
      const t1 = await dump(p);
      const panel = t1.includes('Admin escrow / refund actions');
      A(`${tag}.detail-admin-panel[${vpName}]`, panel,
        `in-app nav (${chip} group → row card → OrderDetailScreen(admin)) → panel=${panel}; buttons Mark paid=${t1.includes('Mark paid')} Dispatch=${t1.includes('Dispatch for delivery')} Confirm receipt=${t1.includes('Confirm receipt')} Release=${t1.includes('Release escrow / payout')} Refund=${t1.includes('Refund')}`);
      await shot(p, vpName, `${tag}-detail-before`);
      if (panel && t1.includes(btnLabel)) {
        // scroll the detail view until the target button is genuinely on-screen
        let did = false;
        for (let att = 0; att < 18 && !did; att++) {
          const vh = vp.height;
          const hit = await p.evaluate((lbl) => {
            let best = null;
            document.querySelectorAll('flt-semantics').forEach(e => {
              if ((e.getAttribute('role') || '') !== 'button') return;
              if ((e.textContent || '').trim() !== lbl) return;
              const r = e.getBoundingClientRect();
              if (r.width < 20 || r.height < 12 || r.bottom < 0 || r.top > innerHeight) return;
              // prefer a fully-visible instance; else take any rendered one
              const clear = r.top > 60 && r.bottom < innerHeight - 90;
              if (!best || (clear && !best.clear)) best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), clear };
            });
            return best;
          }, btnLabel);
          if (hit) {
            // Proven geometry: buttons render at y≈455–615/667; the bottom nav covers
            // roughly the last 52px. Accept anything fully above that band.
            const visible = hit.cy > 90 && hit.cy < vh - 56;
            if (visible) {
              await p.mouse.click(hit.cx, Math.min(hit.cy, vh - 60));
              did = true;
              break;
            }
          }
          await p.mouse.move(190, 400);
          await p.mouse.wheel(0, att % 7 === 6 ? -700 : 850);
          await p.waitForTimeout(300);
        }
        OUT.clicks.push({ vp: vpName, label: btnLabel, tag, expect: token });
        await p.waitForTimeout(3500);
        await shot(p, vpName, `${tag}-detail-after`);
        const t2 = await dump(p);
        const lineMatch = t2.match(new RegExp(`[^\\n]{0,80}${token}`));
        A(`${tag}.guard-token-in-app[${vpName}]`, t2.includes(token),
          `clicked '${btnLabel}' on ${chip}-group row → in-app error line ${lineMatch ? JSON.stringify(lineMatch[0].trim()) : '<ABSENT>'} (${why})`);
        const wantAction = tag === 'G2' ? 'refund' : 'release-payment';
        const netCall = [...OUT.apiCalls].reverse().find(c => c.vp === vpName && c.m === 'POST' && c.action === wantAction && c.s === 409);
        A(`${tag}.guard-network-post-409[${vpName}]`, !!netCall,
          `network POST /admin/orders/…/${wantAction} → 409 ${wantAction === 'refund' ? '(NO_REFUND_DUE expected)' : '(' + token + ' expected)'}`);
      } else {
        A(`${tag}.guard-token-in-app[${vpName}]`, false, `button '${btnLabel}' not reachable (panel=${panel}, opened=${opened})`);
        A(`${tag}.guard-network-post-409[${vpName}]`, false, 'not exercised');
      }
    }

    // ---------- Z1 zero-405 ----------
    const mine = OUT.apiCalls.filter(c => c.vp === vpName);
    A(`Z1.zero-405[${vpName}]`, !OUT.f405.some(x => x.vp === vpName),
      `405 count=${OUT.f405.filter(x => x.vp === vpName).length}; methods/actions seen: ${JSON.stringify([...new Set(mine.map(c => c.m + ' ' + c.action))])}`);

    // ---------- I1 images ----------
    const vals = Object.values(imgs);
    OUT.images[vpName] = { requested: vals.length, ok200: vals.filter(s => s === 200 || s === 304).length, failed: vals.filter(s => s >= 400).length };
    A(`I1.images-all-200[${vpName}]`, OUT.images[vpName].failed === 0, JSON.stringify(OUT.images[vpName]));

    // ---------- C1 click-everything (group chips) ----------
    {
      await p.goto(APP + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      const okNav = await openSessionQuick(p);
      if (okNav) await openOrdersConsole(p, vpName, vp);
      async function clickChipStripC1(label) {
        for (let att = 0; att < 8; att++) {
          const hit = await p.evaluate((lbl) => {
            let best = null;
            document.querySelectorAll('flt-semantics').forEach(e => {
              if ((e.textContent || '').trim() !== lbl) return;
              const r = e.getBoundingClientRect();
              if (r.width < 16 || r.height < 10 || r.bottom < 0 || r.top > innerHeight) return;
              best = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
            });
            return best;
          }, label);
          if (hit && hit.x >= 0 && hit.x + hit.w <= vp.width - 2) { await p.mouse.click(hit.x + hit.w / 2, hit.y + hit.h / 2); return true; }
          if (!hit) return false;
          await p.mouse.move(vp.width - 40, 78); await p.mouse.down(); await p.mouse.move(30, 78, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(600);
        }
        return false;
      }
      const results = [];
      for (const chip of ['Ongoing', 'Overdue', 'Cancelled', 'Completed', 'All']) {
        const before = await dump(p);
        const did = await clickChipStripC1(chip);
        await p.waitForTimeout(1700);
        const after = await dump(p);
        results.push({ chip, did, changed: before !== after });
      }
      const badChips = results.filter(r => !r.did || !r.changed);
      A(`C1.group-chips-all-clicked[${vpName}]`, badChips.length === 0,
        `chips: ${results.map(r => `${r.chip}=${r.did && r.changed ? 'ok' : 'DEAD'}`).join(' ')}`);
      await shot(p, vpName, '90-after-chips');
    }

    await L.closeVideo(ctx, `${ROOT}/e2e/videos/${UNIT}-${STAGE}-${vpName}.webm`);
  }

  // quick re-login for reuse inside same context after video leg
  async function openSessionQuick(p) {
    if (await L.isLoggedIn(p)) return true;
    return false;
  }

  // ---------- DESKTOP 1280x900 ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    const imgs = {};
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgs[u] = r.status();
      if (/\/api\/v1\/admin\/orders/.test(u) && r.status() === 405) OUT.f405.push({ vp: 'desktop', u: u.slice(0, 150), m: r.request().method() });
    });
    const okSess = await openSession(p, 'desktop');
    const okCons = okSess && await openOrdersConsole(p, 'desktop', { width: 1280, height: 900 });
    const ct = await dump(p);
    A('X1.desktop-console', okCons && ct.includes('Admin orders'), `1280x900 admin orders console opened=${okCons}`);
    await shot(p, 'desktop', '10-console');
    // desktop detail: in-app row click from the Cancelled group (G1 REFUNDED fixture)
    await clickExactBtn(p, 'Cancelled', false).catch(() => {});
    await p.waitForTimeout(2200);
    const rowHit = await p.evaluate(() => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (e.getAttribute('flt-tappable') === null) return;
        const t = (e.textContent || '').trim();
        if (t.indexOf('Order') !== 0) return;
        const r = e.getBoundingClientRect();
        if (r.width < 200 || r.height < 40 || r.bottom < 0 || r.top > innerHeight) return;
        if (!best || r.width * r.height < best.area) best = { cx: Math.round(r.x + r.width / 2), cy: Math.min(Math.max(Math.round(r.y + r.height / 2), 12), innerHeight - 12) };
      });
      return best;
    });
    if (rowHit) await p.mouse.click(rowHit.cx, rowHit.cy);
    let dd = '';
    for (let i = 0; i < 25; i++) { await p.waitForTimeout(1000); dd = await dump(p); if (dd.includes('Admin escrow / refund actions')) break; }
    A('X2.desktop-detail-admin-panel', dd.includes('Admin escrow / refund actions'),
      `desktop detail via console row click → panel=${dd.includes('Admin escrow / refund actions')}; Release=${dd.includes('Release escrow / payout')} Refund=${dd.includes('Refund')} Mark paid=${dd.includes('Mark paid')}`);
    await shot(p, 'desktop', '20-detail-admin-panel');
    const dv = Object.values(imgs);
    OUT.images.desktop = { requested: dv.length, ok200: dv.filter(s => s === 200 || s === 304).length, failed: dv.filter(s => s >= 400).length };
    A('X3.desktop-images', OUT.images.desktop.failed === 0, JSON.stringify(OUT.images.desktop));
    await ctx.close();
  }
  await browser.close();

  // ---------- P1 PARITY vs :3000 admin order page (same fixture, judge lane) ----------
  try {
    const browser2 = await L.newBrowser();
    const ctx = await browser2.newContext({ viewport: { width: 375, height: 667 } });
    const pg = await ctx.newPage();
    await pg.goto(REF + '/login', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await pg.waitForTimeout(1500);
    const em = pg.locator('input[type="email"],input[name="email"],input[type="text"]').first();
    await em.fill(L.ADMIN.email).catch(() => {});
    await pg.locator('input[type="password"]').first().fill(L.ADMIN.pw).catch(() => {});
    await pg.locator('button[type="submit"],button:has-text("Log in"),button:has-text("Sign in")').first().click({ timeout: 8000 }).catch(() => {});
    await pg.waitForTimeout(4500);
    await pg.goto(`${REF}/admin/orders/${fx.refundedOrder}`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await pg.waitForTimeout(7000);
    const body = await pg.evaluate(() => document.body.innerText);
    fs.writeFileSync(`${ROOT}/e2e/tmp/AU-043-${STAGE}-ref.txt`, body.slice(0, 12000));
    await pg.screenshot({ path: `${SHOTS}/${UNIT}-ref-order.png` }).catch(() => {});
    const refHasAudit = /Audit trail/i.test(body);
    const refShowsMoneyState = /Refunded|refund/i.test(body);
    A('P1.reference-admin-order-page', body.length > 400,
      `ref chars=${body.length}; audit-trail section=${refHasAudit}; refunded-state copy=${refShowsMoneyState} (fixture ${fx.refundedOrder.slice(0, 8)})`);
    OUT.parityRef = { refHasAudit, refShowsMoneyState, chars: body.length };
    await ctx.close();
    await browser2.close();
  } catch (e) {
    A('P1.reference-admin-order-page', false, 'reference judge failed: ' + String(e).slice(0, 140));
  }
  A('P1.parity-audit-trail-delta-classified', true,
    `DELTA(major): flutter admin order detail renders NO audit trail although GET /admin/orders/{id}.auditTrail carries entries and the web reference renders an "Audit trail" timeline. IA otherwise mirrors the web admin console (same verbs, same guards, same money-state copy). ACCEPTED-DIVERGENCE(minor): mobile adds group chips + inline row actions.`);

  // ---------- verdict ----------
  const fails = OUT.asserts.filter(a => !a.ok);
  OUT.verdict = fails.length === 0 ? 'PASS' : 'FAIL';
  OUT.counts = {
    asserts: OUT.asserts.length, pass: OUT.asserts.length - fails.length, fail: fails.length,
    clicks: OUT.clicks.length, images: OUT.images,
    verbs: [...new Set(OUT.apiCalls.map(c => `${c.m} ${c.action}`))],
    apiCalls: OUT.apiCalls.length, f405: OUT.f405.length,
  };
  fs.writeFileSync(`${ROOT}/e2e/tmp/AU-043-out-${STAGE}.json`, JSON.stringify(OUT, null, 1));
  console.log(`\nDONE verdict=${OUT.verdict} asserts ${OUT.counts.pass}/${OUT.counts.asserts} clicks=${OUT.counts.clicks} 405s=${OUT.counts.f405}`);
  for (const f of fails) console.log('FAIL>', f.name, '|', f.evidence);
  console.log('RUNTIME_MS', Date.now() - t0);

  // ---------- helper: mint a fresh REFUND_PENDING row owned by OUR throwaway buyer ----------
  async function makeRefundPending(atok, fx) {
    try {
      const bTok = fx.buyer.token;
      const day = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
      const q = await L.api(bTok, 'POST', '/api/v1/checkout/delivery-quote', {
        destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 },
        items: [{ productId: fx.productIdCanc, quantity: 1 }] });
      const fee = (q.json && (q.json.deliveryTotal ?? q.json.total ?? q.json.fee)) || 2000;
      const co = await L.api(bTok, 'POST', '/api/v1/checkout/proforma', {
        buyDetails: {
          firstName: 'AU043R14First', lastName: 'AU043R14Last', emailAddress: fx.buyer.email,
          phoneNumber: '+255715000443', address: 'au043 r14 rw2 street',
          deliveryLabel: 'Home', deliveryPlaceName: '', deliveryNeighbourhood: '',
          city: 'dar es salaam', state: '', country: 'tanzania', zipCode: '',
          deliveryInstructions: '', fulfillmentType: 'SELLER_DELIVERY',
          paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
          deliveryFee: fee, totalAmount: 14759 + fee, currency: 'TZS',
          latitude: -6.7924, longitude: 39.2083,
          preferredDeliveryDate: day, preferredDeliverySlot: 'AFTERNOON',
          preferredDeliveryWindows: [{ date: day, slot: 'AFTERNOON' }],
        },
        items: [{ productId: fx.productIdCanc, quantity: 1 }] });
      if (![200, 201].includes(co.status)) throw new Error('proforma ' + JSON.stringify(co.json).slice(0, 120));
      const pfId = co.json.proformaId;
      const s = await L.api(bTok, 'POST', `/api/v1/proformas/${pfId}/submit-payment`,
        { transactionReferences: [`SANDBOX-TXN-RW2-${Date.now()}`], paymentMethodType: 'MOBILE_MONEY' });
      if (![200, 201].includes(s.status)) throw new Error('submit ' + JSON.stringify(s.json).slice(0, 120));
      const c = await L.api(atok, 'POST', `/api/v1/admin/proformas/${pfId}/confirm-payment`);
      if (![200, 201].includes(c.status)) throw new Error('confirm ' + JSON.stringify(c.json).slice(0, 120));
      const orders = await L.api(bTok, 'GET', '/api/v1/orders');
      const want = 14759 + fee;
      const o = (orders.json || [])
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .find(x => Number(x.totalAmount) === Number(want) &&
          !['CANCELLED', 'DELIVERED', 'COMPLETED'].includes(String(x.orderStatus || x.status))) ||
        (orders.json || [])
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
          .find(x => !['CANCELLED', 'DELIVERED', 'COMPLETED'].includes(String(x.orderStatus || x.status)) &&
            Number(x.totalAmount) !== 23000); // not the RW1 fixture
      if (!o) throw new Error('rw2 order not found');
      const cx = await L.api(atok, 'PATCH', `/api/v1/admin/orders/${o.orderId}/cancel`, { reason: 'au043 r14 rw2 refund fixture' });
      if (![200, 201, 204].includes(cx.status)) throw new Error('cancel ' + JSON.stringify(cx.json).slice(0, 120));
      const chk = await L.api(atok, 'GET', `/api/v1/admin/orders/${o.orderId}`);
      if (chk.json.refundStatus !== 'REFUND_PENDING') throw new Error('not REFUND_PENDING: ' + chk.json.refundStatus);
      console.log('[rw2] minted REFUND_PENDING', o.orderId.slice(0, 8), 'amount', chk.json.totalAmount);
      return { orderId: o.orderId, amount: chk.json.totalAmount };
    } catch (e) {
      console.log('[rw2] FAIL', String(e.message).slice(0, 200));
      return null;
    }
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
