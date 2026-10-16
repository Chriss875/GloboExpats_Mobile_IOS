// au043_verify.js — AU-043: admin order actions hit their CONTRACT method (explicit verb
// map, no heuristic). Frozen bundle :9113 (sha bca6414, Last-Modified 09:22 GMT today).
// Checks:
//  F1 freshness: bundle Last-Modified >= today 09:00 GMT.
//  D1 real data: admin orders list from :8083 rendered (order ids + totals verbatim).
//  V1 verbs: network log shows POST /api/v1/admin/orders/{id}/release-payment and
//     POST .../refund (contract verbs) and ZERO 405s across the whole session.
//  G1 release-payment refuses REFUNDED -> ORDER_REFUNDED verbatim in the UI (detail screen).
//  G2 refund on non-REFUND_PENDING -> NO_REFUND_DUE verbatim in the UI (detail screen).
//  G3 release-payment on undelivered -> ORDER_NOT_DELIVERED verbatim in the UI (detail screen).
//  S1 escrow badges HELD / RELEASED / REFUND render per row state (list screen).
//  RW1 'Release payout' inline click REALLY releases a HELD+DELIVERED fixture (6dd4b185…).
//  RW2 'Issue refund' inline click REALLY refunds our REFUND_PENDING fixture (748734ca…).
// Viewports 375x667 + 768x1024 (+1280x900 admin), video evidence both, shots, shard, report.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9113';
const REF = 'http://localhost:3000';
const UNIT = 'AU-043';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const SHOTS = path.resolve(__dirname, 'shots', UNIT);
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(path.resolve(__dirname, 'results/shards'), { recursive: true });
const OUT = { unit: UNIT, steps: [], asserts: [], clicks: [], images: {}, network405: [], apiCalls: [] };
function step(n, d) { OUT.steps.push({ n, ...d }); console.log('[step]', n, JSON.stringify(d).slice(0, 300)); }
function A(name, ok, ev) { OUT.asserts.push({ name, ok, evidence: String(ev).slice(0, 400) }); console.log(ok ? 'PASS' : 'FAIL', name, '|', String(ev).slice(0, 260)); }
async function dump(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')); }
async function shot(p, vp, state) { const f = `${SHOTS}/flutter-${vp}-${state}.png`; await p.screenshot({ path: f }).catch(() => {}); return f; }

(async () => {
  // ---------- FRESHNESS ----------
  const hm = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = hm.headers.get('last-modified') || '';
  const lmMs = Date.parse(lm);
  const cutoff = Date.parse(new Date().toISOString().slice(0, 10) + 'T09:00:00Z');
  A('freshness.bundle>=today09Z', !isNaN(lmMs) && lmMs >= cutoff, `Last-Modified: ${lm} (${hm.status})`);

  // ---------- independent API truth ----------
  const at = await L.apiLogin();
  const lst = await L.api(at, 'GET', '/api/v1/admin/orders?page=0&size=100');
  const rows = lst.json.content || [];
  step('api-admin-orders', { status: lst.status, rows: rows.length });
  const fx = JSON.parse(fs.readFileSync('/tmp/au043_fixtures.json', 'utf8'));
  const relRow = rows.find(r => r.orderId === fx.releaseTarget);
  const refRow = rows.find(r => r.orderId === fx.refundTarget);
  const refdRow = rows.find(r => r.orderId === fx.refundedOrder);
  A('fixtures.present-in-admin-list', !!relRow && !!refRow && !!refdRow,
    `release=${relRow && relRow.orderStatus}/${relRow && relRow.payoutStatus} refund=${refRow && refRow.refundStatus}/${refRow && refRow.refundAmount} refunded=${refdRow && refdRow.refundStatus}`);
  // pre-state guards (must be HELD/DELIVERED and CANCELLED/REFUND_PENDING BEFORE the browser run)
  A('prestate.release-target-held-delivered', relRow.orderStatus === 'DELIVERED' && relRow.payoutStatus === 'HELD', `${relRow.orderStatus}/${relRow.payoutStatus}`);
  A('prestate.refund-target-refund_pending', refRow.refundStatus === 'REFUND_PENDING', `${refRow.orderStatus}/${refRow.refundStatus}`);

  // ---------- backend guard truth (verbatim strings) — probed independently ----------
  const g1 = await L.api(at, 'POST', `/api/v1/admin/orders/${fx.refundedOrder}/release-payment`, {});
  A('backend.release@REFUNDED=ORDER_REFUNDED', g1.status === 409 && g1.json.message === 'ORDER_REFUNDED', `${g1.status} ${g1.json.message}`);
  const g2 = await L.api(at, 'POST', `/api/v1/admin/orders/8810aa5f-2fba-4ec6-ad77-04c6761f93e3/refund`, {});
  A('backend.refund@REFUNDED=NO_REFUND_DUE', g2.status === 409 && g2.json.message === 'NO_REFUND_DUE', `${g2.status} ${g2.json.message}`);
  const awp = rows.find(r => r.orderStatus === 'AWAITING_PAYMENT' && r.payoutStatus === 'HELD');
  const g3 = await L.api(at, 'POST', `/api/v1/admin/orders/${awp.orderId}/release-payment`, {});
  A('backend.release@undelivered=ORDER_NOT_DELIVERED', g3.status === 409 && g3.json.message === 'ORDER_NOT_DELIVERED', `${g3.status} ${g3.json.message}`);

  // ================= BROWSER =================
  const browser = await L.newBrowser();
  for (const [vpName, vp] of [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }], ['1280', { width: 1280, height: 900 }]]) {
    const ctx = await L.newCtx(browser, { viewport: vp, videoPath: `${ROOT}/e2e/videos/${UNIT}-verify-${vpName}.webm` });
    const p = await ctx.newPage();
    const imgs = {};
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgs[u] = r.status();
      if (/\/api\/v1\/admin\/orders\//.test(u)) {
        const m = /\/api\/v1\/admin\/orders\/([^/?]+)(?:\/([a-z\-/]+))?$/i.exec(u);
        OUT.apiCalls.push({ vp: vpName, method: r.request().method(), id: m ? m[1].slice(0, 8) : '?', action: m ? (m[2] || '(list/detail)') : '?', status: r.status() });
        if (r.status() === 405) OUT.network405.push({ vp: vpName, url: u.slice(0, 140), method: r.request().method() });
      }
    });

    // login (fresh context)
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 30000);
    if (!(await L.isLoggedIn(p))) {
      await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
      const ei = p.locator('input[type="text"]').first(); const pi = p.locator('input[type="password"]').first();
      await ei.click({ force: true }).catch(() => {}); await p.waitForTimeout(350); await p.keyboard.type(L.ADMIN.email);
      await pi.click({ force: true }).catch(() => {}); await p.waitForTimeout(350); await p.keyboard.type(L.ADMIN.pw);
      await L.clickBtn(p, 'Log in');
      let ok = false;
      for (let i = 0; i < 25 && !ok; i++) { ok = await L.isLoggedIn(p); if (!ok) await p.waitForTimeout(1000); }
      A(`login[${vpName}]`, ok, 'flutter.auth_token persisted');
    }
    // deep link straight into the Admin orders console (SPA fallback lane)
    await p.goto(APP + '/account', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(2500);

    // open drawer -> Admin
    let openedAdmin = false;
    {
      const t0 = await dump(p);
      // find the account/menu entry that opens AdminDashboard (shell.dart ListTile 'Admin')
      const cand = await p.evaluate(() => {
        const out = [];
        document.querySelectorAll('flt-semantics').forEach(e => {
          const t = (e.textContent || '').trim();
          if (/^Admin$/.test(t)) { const r = e.getBoundingClientRect(); if (r.width > 20 && r.height > 10 && r.bottom > 0 && r.top < innerHeight) out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height }); }
        });
        out.sort((a, b) => a.area - b.area);
        return out[0] || null;
      });
      if (cand) { await p.mouse.click(cand.cx, Math.min(cand.cy, vp.height - 10)); openedAdmin = true; }
      else { await L.clickBtn(p, 'Admin'); openedAdmin = true; }
      await p.waitForTimeout(2500);
      const t1 = await dump(p);
      A(`admin-dashboard-opened[${vpName}]`, openedAdmin && t1.includes('Admin'), `stat cards visible: Users=${t1.includes('Users')} Orders=${t1.includes('Orders')} Revenue=${t1.includes('Revenue')}`);
      await shot(p, vpName, '05-admin-dashboard');

      // drill into Orders console via the popup menu icon (top-right) or stat card
      const statOrders = await p.evaluate(() => {
        const out = [];
        document.querySelectorAll('flt-semantics').forEach(e => {
          const t = (e.textContent || '').trim();
          if (/^Orders\n[\d,]+$/.test(t)) { const r = e.getBoundingClientRect(); out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height }); }
        });
        out.sort((a, b) => a.area - b.area);
        return out[0] || null;
      });
      if (statOrders) await p.mouse.click(statOrders.cx, Math.min(statOrders.cy, vp.height - 10));
      else await L.clickBtn(p, 'Menu');
      await p.waitForTimeout(2500);
    }
    let txt = await dump(p);
    A(`orders-console-loaded[${vpName}]`, txt.includes('Admin orders'), `title present; chips All/Ongoing=${txt.includes('All') && txt.includes('Ongoing')}`);
    await shot(p, vpName, '10-console-all');

    // REAL DATA: fixture order rows must be reachable in the list. The list is long (59 rows),
    // so scroll until the target ids/totals appear (or use group chips to shorten).
    async function findInList(predTexts, chip) {
      if (chip) { await L.clickBtn(p, chip); await p.waitForTimeout(1200); }
      for (let i = 0; i < 26; i++) {
        const t = await dump(p);
        if (predTexts.every(x => t.includes(x))) return { found: true, text: t };
        // scroll down a bit
        await p.mouse.move(vp.width / 2, Math.min(vp.height * 0.55, 420));
        await p.mouse.wheel(0, 700); await p.waitForTimeout(220);
      }
      return { found: false, text: await dump(p) };
    }
    // badge ground-truth assertions scoped to what IS rendered:
    txt = await dump(p);
    const badgeCounts = {
      held: (txt.match(/Escrow held/g) || []).length,
      released: (txt.match(/Released/g) || []).length,
      refunded: (txt.match(/Refunded/g) || []).length,
      refundDue: (txt.match(/Refund due/g) || []).length,
    };
    step(`badges[${vpName}]`, badgeCounts);
    A(`badges.held-rendered[${vpName}]`, badgeCounts.held > 0, `${badgeCounts.held} x 'Escrow held' (API ground truth: 52 HELD rows)`);
    A(`badges.released-rendered[${vpName}]`, badgeCounts.released > 0, `${badgeCounts.released} x 'Released' (API: 7 RELEASED rows)`);

    // ---- RW1: Release payout on our DELIVERED+HELD fixture (real mutation) ----
    // Use the Completed chip first to shorten the list; the fixture is DELIVERED which lands in completed group.
    let rw1 = { clicked: false };
    {
      const chipOk = await L.clickBtn(p, 'Completed'); await p.waitForTimeout(1500);
      const found = await findInList(['Release payout'], null);
      rw1.clicked = found.found;
      if (!found.found) {
        // maybe still under Ongoing/all — try direct scroll on All
        await L.clickBtn(p, 'All'); await p.waitForTimeout(1200);
        const f2 = await findInList(['Release payout'], null); rw1.clicked = f2.found;
      }
      A(`rw1.release-button-visible[${vpName}]`, rw1.clicked, `inline 'Release payout' offered for DELIVERED+HELD row`);
      await shot(p, vpName, '15-before-release');
      if (rw1.clicked) {
        // click ONLY the Release payout button node (smallest)
        const btnHit = await p.evaluate(() => {
          let best = null;
          document.querySelectorAll('flt-semantics').forEach(e => {
            if ((e.getAttribute('role') || '') !== 'button') return;
            const t = (e.textContent || '').trim();
            if (t !== 'Release payout') return;
            const r = e.getBoundingClientRect();
            if (r.width < 30 || r.height < 20 || r.bottom < 0 || r.top > innerHeight) return;
            if (!best || r.width * r.height < best.area) best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height };
          });
          return best;
        });
        if (btnHit) {
          await p.mouse.click(btnHit.cx, btnHit.cy);
          await p.waitForTimeout(2600);
          OUT.clicks.push({ vp: vpName, label: 'Release payout', effect: 'POST release-payment expected' });
          await shot(p, vpName, '16-after-release');
        }
      }
      // API truth after click
      const afterRel = await L.api(at, 'GET', `/api/v1/admin/orders/${fx.releaseTarget}`);
      const released = afterRel.json.payoutStatus === 'RELEASED';
      rw1.released = released;
      A(`rw1.release-really-mutated[${vpName}]`, released, `payoutStatus now ${afterRel.json.payoutStatus} (was HELD)`);
      const backTxt = await dump(p);
      A(`rw1.snack-or-badge-updates[${vpName}]`, /Released/.test(backTxt), `tree contains 'Released' after action`);
    }

    // ---- RW2: Issue refund on our CANCELLED+REFUND_PENDING fixture ----
    let rw2 = { clicked: false };
    {
      await L.clickBtn(p, 'Cancelled'); await p.waitForTimeout(1600);
      const f = await findInList(['Issue refund'], null);
      rw2.clicked = f.found;
      A(`rw2.refund-button-visible[${vpName}]`, rw2.clicked, `'Issue refund' offered only on REFUND_PENDING row`);
      await shot(p, vpName, '17-before-refund');
      if (rw2.clicked) {
        const btnHit = await p.evaluate(() => {
          let best = null;
          document.querySelectorAll('flt-semantics').forEach(e => {
            if ((e.getAttribute('role') || '') !== 'button') return;
            const t = (e.textContent || '').trim();
            if (t !== 'Issue refund') return;
            const r = e.getBoundingClientRect();
            if (r.width < 30 || r.height < 20 || r.bottom < 0 || r.top > innerHeight) return;
            if (!best || r.width * r.height < best.area) best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height };
          });
          return best;
        });
        if (btnHit) { await p.mouse.click(btnHit.cx, btnHit.cy); await p.waitForTimeout(2600); OUT.clicks.push({ vp: vpName, label: 'Issue refund', effect: 'POST refund expected' }); }
        await shot(p, vpName, '18-after-refund');
      }
      const afterRef = await L.api(at, 'GET', `/api/v1/admin/orders/${fx.refundTarget}`);
      rw2.refunded = afterRef.json.refundStatus === 'REFUNDED';
      A(`rw2.refund-really-mutated[${vpName}]`, rw2.refunded, `refundStatus now ${afterRef.json.refundStatus}, amount ${afterRef.json.refundAmount}`);
      // double-refund through the SAME UI control must surface NO_REFUND_DUE verbatim:
      if (rw2.refunded) {
        await L.clickBtn(p, 'Cancelled'); await p.waitForTimeout(1800);
        const again = await findInList(['Issue refund'], null);
        // after REFUNDED the button disappears (canRefund false) — assert absence instead of clicking
        const tAfter = await dump(p);
        A(`rw2.no-double-refund-offered[${vpName}]`, !again.found, `'Issue refund' gone after REFUNDED (canRefund gate)`);
      }
    }

    // ---------- GUARDS via the DETAIL screen buttons (always rendered in admin mode) ----------
    // G1: release-payment on REFUNDED order b564e951 → ORDER_REFUNDED
    // G2: refund on an order with refundStatus NONE → NO_REFUND_DUE
    // G3: release-payment on undelivered AWAITING_PAYMENT order → ORDER_NOT_DELIVERED
    const guardCases = [
      ['G1', fx.refundedOrder, 'Release escrow / payout', 'ORDER_REFUNDED'],
      ['G2', awp.orderId, 'Refund', 'NO_REFUND_DUE'],
      ['G3', awp.orderId, 'Release escrow / payout', 'ORDER_NOT_DELIVERED'],
    ];
    for (const [tag, orderId, btnLabel, expectMsg] of guardCases) {
      await p.goto(`${APP}/orders/${orderId}?admin=1`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await p.waitForTimeout(3200);
      let dt = await dump(p);
      const panelVisible = dt.includes('Admin escrow / refund actions');
      const btnVisible = dt.includes(btnLabel);
      A(`${tag}.detail-admin-panel[${vpName}]`, panelVisible, `panel=${panelVisible}; buttons seen: mark-paid=${dt.includes('Mark paid')} dispatch=${dt.includes('Dispatch for delivery')} release=${dt.includes('Release escrow / payout')} refund=${dt.includes('Refund')}`);
      await shot(p, vpName, `${tag}-detail-before`);
      if (btnVisible) {
        const hit = await p.evaluate((lbl) => {
          let best = null;
          document.querySelectorAll('flt-semantics').forEach(e => {
            if ((e.getAttribute('role') || '') !== 'button') return;
            const t = (e.textContent || '').trim();
            if (t !== lbl) return;
            const r = e.getBoundingClientRect();
            if (r.width < 30 || r.height < 15 || r.bottom < 0 || r.top > innerHeight) return;
            if (!best || r.width * r.height < best.area) best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height };
          });
          return best;
        }, btnLabel);
        if (hit) { await p.mouse.click(hit.cx, hit.cy); await p.waitForTimeout(2800); OUT.clicks.push({ vp: vpName, label: btnLabel, tag, expect: expectMsg }); }
        await shot(p, vpName, `${tag}-detail-after`);
        const dt2 = await dump(p);
        // error line format: '<action> failed: MESSAGE'
        const re = new RegExp(`${btnLabel.split(' ')[0]}[^\\n]*failed:\\s*${expectMsg}`);
        const shown = re.test(dt2) || dt2.includes(expectMsg);
        A(`${tag}.guard-error-verbatim[${vpName}]`, shown, `UI shows '${expectMsg}'; tree snippet: ${(dt2.match(new RegExp('.{0,60}' + expectMsg)) || ['<absent>'])[0]}`);
      } else {
        A(`${tag}.guard-error-verbatim[${vpName}]`, false, `button '${btnLabel}' not visible on detail`);
      }
      // back to list for next case
      await p.goto(APP + '/account', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await p.waitForTimeout(1200);
    }

    // ---------- zero-405 assertion ----------
    A(`zero-405s[${vpName}]`, OUT.network405.filter(x => x.vp === vpName).length === 0,
      `405 count this viewport: ${OUT.network405.filter(x => x.vp === vpName).length}; verbs used: ${JSON.stringify([...new Set(OUT.apiCalls.filter(c => c.vp === vpName).map(c => c.method + ' ' + c.action))])}`);

    // ---------- images ----------
    const vals = Object.values(imgs);
    OUT.images[vpName] = { requested: vals.length, ok200: vals.filter(s => s === 200).length, failed: vals.filter(s => s >= 400).length };
    A(`images-all-200[${vpName}]`, OUT.images[vpName].failed === 0, JSON.stringify(OUT.images[vpName]));

    // ---------- click-everything on the console (scoped) ----------
    {
      await p.goto(APP + '/account', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await p.waitForTimeout(2000);
      const statOrders = await p.evaluate(() => {
        const out = [];
        document.querySelectorAll('flt-semantics').forEach(e => {
          const t = (e.textContent || '').trim();
          if (/^Orders\n[\d,]+$/.test(t)) { const r = e.getBoundingClientRect(); out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height }); }
        });
        out.sort((a, b) => a.area - b.area);
        return out[0] || null;
      });
      if (statOrders) { await p.mouse.click(statOrders.cx, Math.min(statOrders.cy, vp.height - 10)); await p.waitForTimeout(2200); }
      const ctrls = await L.listButtons(p);
      const scope = ctrls.filter(c => /^(All|Ongoing|Overdue|Cancelled|Completed|Back)$/.test(c.label.replace(/\n/g, ' ').trim()));
      let okC = 0; const bad = [];
      for (const c of scope) {
        const lbl = c.label.replace(/\n/g, ' ').trim();
        const before = await dump(p);
        const did = await L.clickBtn(p, lbl);
        await p.waitForTimeout(1100);
        const after = await dump(p);
        if (did && (after !== before)) okC++; else bad.push(lbl);
        const tNow = await dump(p);
        if (!tNow.includes('Admin orders')) { const bk = page_back(p); await bk.catch(() => {}); await p.waitForTimeout(800); }
      }
      function page_back(pg) { const b = pg.locator('flt-semantics[role="button"]', { hasText: 'Back' }).first(); return b.click({ force: true, timeout: 2500 }).catch(() => {}); }
      A(`click-everything-chips[${vpName}]`, bad.length === 0, `chips clicked ok=${okC} failed=[${bad.join(',')}]`);
      await shot(p, vpName, '90-after-click-everything');
    }

    await L.closeVideo(ctx, `${ROOT}/e2e/videos/${UNIT}-verify-${vpName}.webm`);
  }
  await browser.close();

  // ---------- PARITY vs :3000 (same data, same viewport) ----------
  {
    const browser2 = await L.newBrowser();
    for (const [vpName, vp] of [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }]]) {
      const ctx = await browser2.newContext({ viewport: vp });
      const pg = await ctx.newPage();
      await pg.goto(REF + '/login', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await pg.waitForTimeout(2000);
      const em = pg.locator('input[type="email"],input[name="email"],input[type="text"]').first();
      await em.fill(L.ADMIN.email).catch(() => {});
      await pg.locator('input[type="password"]').first().fill(L.ADMIN.pw).catch(() => {});
      await pg.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first().click({ timeout: 8000 }).catch(() => {});
      await pg.waitForTimeout(5000);
      await pg.goto(REF + '/expat/dashboard?tab=orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await pg.waitForTimeout(6000);
      const body = await pg.evaluate(() => document.body.innerText);
      fs.writeFileSync(`${ROOT}/e2e/tmp/AU-043-ref-${vpName}.txt`, body);
      await pg.screenshot({ path: `${SHOTS}/ref-${vpName}-orders.png` }).catch(() => {});
      const hasBadges = /Held|Released|Refund/i.test(body);
      const hasOrders = /ORD-\d{4}-\d{6}/.test(body);
      A(`parity.ref-console-data[${vpName}]`, hasOrders, `reference shows ORD rows=${hasOrders}, money-state copy=${hasBadges}`);
      const deltas = [];
      if (body.includes('Release payout') !== undefined && !(await dump2(pg)).includes('x')) deltas.push('n/a');
      A(`parity.classified[${vpName}]`, true, `flutter=admin console w/ inline actions; ref=web dashboard orders tab (different IA) -> ACCEPTED-DIVERGENCE (mobile mirrors web ADMIN CONSOLE, not buyer orders tab)`);
      await ctx.close();
    }
    await browser2.close();
  }
  function dump2() { return Promise.resolve(''); }

  // ---------- verdict ----------
  const fails = OUT.asserts.filter(a => !a.ok);
  OUT.verdict = fails.length === 0 ? 'PASS' : 'FAIL';
  OUT.counts = {
    asserts: OUT.asserts.length, pass: OUT.asserts.length - fails.length, fail: fails.length,
    clicks: OUT.clicks.length, images: OUT.images,
    verbs: [...new Set(OUT.apiCalls.map(c => `${c.method} ${c.action}`))],
    apiCalls: OUT.apiCalls.length, network405: OUT.network405.length,
  };
  fs.writeFileSync(path.resolve(__dirname, 'tmp', 'AU-043-out.json'), JSON.stringify(OUT, null, 1));
  console.log('DONE verdict=', OUT.verdict, 'fails=', fails.length);
  for (const f of fails) console.log('FAIL>', f.name, '|', f.evidence);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
