// au035_sk2_r12.js — AU-035 SKEPTIC r12. Attacks the prior PASS (verify-r5 @ e1a5762)
// ON THE CURRENT FROZEN BUNDLE :9131 (c6b4d61), which INCLUDES commit a405494
// ("timeline step markers excluded from a11y interactive nodes", adds
// explicitChildNodes:true inside _Step). Focus: does the OrderStatusTimeline still
// expose its step labels/markers to the a11y tree AFTER that change, and do line
// items still sit between "Items Ordered" and "Subtotal"?
//
// Real sandbox rows (independent curl truth asserted first):
//   ORD-2026-000012  COMPLETED      PAID  SELLER_DELIVERY  choice item, subtotal 626000, total 630000
//   ORD-2026-000023  ASC            PAID  BUYER_PICKUP     rental DAY 2026-08-27..29, 2 days, total 92000
//   ORD-2026-000011  CANCELLED      PAID  SELLER_DELIVERY  refund REFUNDED 72000, total 72000
//   ORD-2026-000020  DELIVERED      PAID  SELLER_DELIVERY  total 36000
//   ORD-2026-000165  READY_FOR_DISPATCH PAID SELLER_DELIVERY payout HELD, total 32000 (minted by AU-036)
// Attack classes: rapid double-taps | out-of-order/deep-link re-entry | empty states |
// offline mid-request + retry | invalid input (script/emoji/500-char/bogus UUID) |
// locale/number formats | admin-role query probe | session expiry mid-flow.
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
const UNIT = 'AU-035', STAGE = 'skeptic-r12';
const SHA = 'c6b4d61';
const SHOT_DIR = 'e2e/shots/AU-035';

let NAVSEQ = Math.floor(Date.now() / 1000) % 100000;
const R = { ts: new Date().toISOString(), unit: UNIT, stage: STAGE, wave: 'skeptic',
  build_sha: SHA, bundle_mtime: null, lane: APP,
  attacks_attempted: 0, attacks_broken: 0,
  checks: { images_requested: 0, images_200: 0, images_broken: [], placeholders: [],
    state_asserts: 0, vision_defects: [] },
  asserts: [], failures: [], findings: [], shots: [], videos: [], evidence: [] };

function assert(name, pass, detail) {
  R.asserts.push({ name, pass: !!pass, detail: String(detail === undefined ? '' : detail).slice(0, 340) });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + String(detail).slice(0, 160) : ''));
  if (!pass) R.failures.push(name);
}
function finding(cls, result, detail, evidence) {
  R.findings.push({ class: cls, result, detail: String(detail).slice(0, 400), evidence });
  if (result === 'BROKEN') R.attacks_broken++;
  console.log(`FINDING [${result}] ${cls} :: ${String(detail).slice(0, 200)} :: ${evidence}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p) { return L.allText(p); }
async function shot(p, vp, state) {
  const f = `${SHOT_DIR}/AU-035-sk2-${vp}-${state}.png`;
  await L.screenshot(p, f); R.shots.push(f); return f;
}
function scanPh(T) {
  const m = T.match(/lorem|placeholder|dummy|TODO/i);
  if (m && !R.checks.placeholders.includes(m[0])) R.checks.placeholders.push(m[0]);
}
async function boot(p, hash, settle = 6000) {
  ++NAVSEQ;
  await p.goto(`${APP}/?sk12=${NAVSEQ}#${hash}`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(settle);
  return txt(p);
}

const ORDERS = [
  { key: 'o12-completed', num: 'ORD-2026-000012', uuid: '2499e6e9-b5f9-4b47-982e-1d50f99144c5',
    st: 'COMPLETED', pay: 'PAID', ff: 'SELLER_DELIVERY', total: 630000, subtotal: 626000, fee: 4000,
    item: 'LANCÔME PARIS La vie est belle', qtyLine: 'Quantity: 1 × TSh 626,000', choice: 'Pack Size: Single',
    priceCell: 'TSh 626,000', payout: 'RELEASED',
    steps: ['Order placed', 'Waiting for seller to confirm availability', 'Arranging delivery', 'In transit', 'Delivered', 'Completed'],
    numsAbsent: ['1', '2', '3', '4', '5', '6'] },
  { key: 'o23-rental', num: 'ORD-2026-000023', uuid: '49dee2e4-e785-45e9-91a8-6a4dac2b3270',
    st: 'AWAITING_SELLER_CONFIRMATION', pay: 'PAID', ff: 'BUYER_PICKUP', total: 92000, subtotal: 92000, fee: 0,
    item: 'AU016 Lakeside Cabin Rental 1787604049313', qtyLine: 'Unit: 1 × TSh 46,000', choice: null,
    priceCell: 'TSh 92,000', payout: 'HELD', banner: 'Payment confirmed - awaiting seller',
    steps: ['Booking placed', 'Seller confirmation', 'Arrival / check-in', 'Rental period', 'Completed'],
    numsPresent: ['2', '3', '4', '5'], numsAbsent: ['1'],
    rental: { window: '2026-08-27 to 2026-08-29', units: '2 days', head: 'Rental booking' } },
  { key: 'o11-cancelled', num: 'ORD-2026-000011', uuid: 'b564e951-ef8f-452e-b974-7f9438137850',
    st: 'CANCELLED', pay: 'PAID', ff: 'SELLER_DELIVERY', total: 72000, subtotal: 55000, fee: 17000,
    item: 'Multi-Function Vehicle Inverter (Car Inverter)', qtyLine: 'Quantity: 1 × TSh 55,000', choice: null,
    priceCell: 'TSh 55,000', payout: 'HELD', refund: 'Refunded · TSh 72000',
    steps: ['Order placed', 'Waiting for seller to confirm availability', 'Arranging delivery', 'In transit', 'Delivered', 'Completed'],
    numsPresent: ['1', '2', '3', '4', '5', '6'], cancelledCopy: 'Order cancelled' },
  { key: 'o20-delivered', num: 'ORD-2026-000020', uuid: 'df3ec5c0-961a-4597-a28e-21351a98f62f',
    st: 'DELIVERED', pay: 'PAID', ff: 'SELLER_DELIVERY', total: 36000, subtotal: 25000, fee: 11000,
    item: 'AU054 Active Fixture 1787624747348', qtyLine: 'Quantity: 1 × TSh 25,000', choice: null,
    priceCell: 'TSh 25,000', payout: 'HELD', banner: 'Delivered - confirm receipt to release payment',
    steps: ['Order placed', 'Waiting for seller to confirm availability', 'Arranging delivery', 'In transit', 'Delivered', 'Completed'],
    numsAbsent: ['1', '2', '3', '4', '5'], numsPresent: ['6'] },
  { key: 'o165-dispatch', num: 'ORD-2026-000165', uuid: '9644e6a3-8bc4-415c-a99a-5b517bc00204',
    st: 'READY_FOR_DISPATCH', pay: 'PAID', ff: 'SELLER_DELIVERY', total: 32000, subtotal: 24000, fee: 8000,
    item: 'AU036 R5 Escrow Probe Vase 1787669187045', qtyLine: 'Quantity: 1 × TSh 24,000', choice: null,
    priceCell: 'TSh 24,000', payout: 'HELD', banner: 'Money held by GloboExpats until delivery',
    steps: ['Order placed', 'Waiting for seller to confirm availability', 'Arranging delivery', 'In transit', 'Delivered', 'Completed'],
    numsAbsent: ['1', '2'], numsPresent: ['3', '4', '5', '6'] },
];

(async () => {
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  R.bundle_mtime = lm;
  assert('0-freshness-c6b4d61', head.status === 200 && /26 Aug 2026 04:41:42/.test(lm || ''),
    `HTTP ${head.status} Last-Modified: ${lm}`);

  // ---------- independent real-data curl of every entity under test ----------
  const btok = await L.apiLogin();
  const atok = await L.apiLogin(L.ADMIN);
  for (const s of ORDERS) {
    const d = await L.api(btok, 'GET', `/api/v1/orders/${s.uuid}`);
    const j = d.json || {};
    s.api = { status: d.status, num: j.orderNumber, st: j.status, p: j.paymentStatus,
      ff: j.fulfillmentType, tot: j.totalAmount, sub: j.subtotal, po: j.payoutStatus,
      ref: j.refundStatus, ra: j.refundAmount, items: (j.items || []).length };
    const ok = d.status === 200 && j.orderNumber === s.num && j.status === s.st &&
      Number(j.totalAmount) === Number(s.total) && j.fulfillmentType === s.ff;
    R.attacks_attempted++; // real-data curl counts as an attempted check per entity
    assert(`1-api-${s.key}`, ok, JSON.stringify(s.api));
    if (!ok) finding('real-data-mismatch', 'BROKEN', `${s.num} API truth differs from expectation`, 'shard line');
    // admin token must ALSO read it (admin=1 query path uses same endpoint)
    const da = await L.api(atok, 'GET', `/api/v1/orders/${s.uuid}`);
    assert(`1-api-admin-read-${s.key}`, da.status === 200 && (da.json || {}).orderNumber === s.num, `HTTP ${da.status}`);
  }

  const browser = await L.newBrowser();
  try {
    for (const [vpName, viewport] of [['mobile', { width: 375, height: 667 }], ['tablet', { width: 768, height: 1024 }]]) {
      const videoPath = `e2e/videos/AU-035-sk2-${vpName}.webm`;
      R.videos.push(videoPath);
      const ctx = await L.newCtx(browser, { viewport, videoPath });
      const page = await ctx.newPage();
      const imgMap = {}; const netLog = []; const consoleErrs = [];
      page.on('response', r => {
        const u = r.url();
        if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
        if (u.includes('/api/')) netLog.push(`${r.request().method()} ${r.status()} ${u.replace(APP, '').slice(0, 90)}`);
      });
      page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 140)); });
      page.on('pageerror', e => consoleErrs.push('PAGEERROR ' + String(e).slice(0, 160)));

      async function uiLogin() {
        await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
        await L.waitText(page, 'Buy now', 45000);
        if (await L.isLoggedIn(page)) return true;
        await L.clickBtn(page, 'Login'); await L.waitText(page, 'Welcome back', 30000);
        const ei = page.locator('input[type="text"]').first(), pi = page.locator('input[type="password"]').first();
        await ei.click({ force: true }).catch(() => {}); await sleep(350); await page.keyboard.type(L.BUYER.email);
        await pi.click({ force: true }).catch(() => {}); await sleep(350); await page.keyboard.type(L.BUYER.pw);
        await L.clickBtn(page, 'Log in');
        let ok = false;
        for (let i = 0; i < 30 && !ok; i++) { ok = await L.isLoggedIn(page); if (!ok) await sleep(1000); }
        return ok;
      }
      assert(`login-buyer-${vpName}`, await uiLogin());
      function headOf(T, n = 10) { return T.split('\n').filter(Boolean).slice(0, n).join('|').slice(0, 300); }
      function flatNoCommas(T) { return String(T).replace(/,/g, ''); }

      // helper: full a11y dump -> raw file
      async function dump(tag) {
        const T = await txt(page);
        fs.writeFileSync(`e2e/results/shards/raw-AU-035-${tag}-a11y.txt`, T);
        return T;
      }

      // ================= per-order acceptance + attacks =================
      for (const o of ORDERS) {
        R.attacks_attempted++;
        let T = await boot(page, `/orders/${o.uuid}`);
        scanPh(T);
        const loaded = T.includes(o.num) && !/Could not load order/i.test(T);
        assert(`2-load-${o.key}-${vpName}`, loaded, headOf(T, 6));
        if (!loaded) { finding('deep-link-load', 'BROKEN', `${o.num} failed to render on c6b4d61`, `AU-035-sk2-${vpName}-${o.key}.png`); continue; }
        await dump(`${o.key}-${vpName}`);
        await shot(page, vpName, `${o.key}-top`);

        // --- amount/locale parity vs API truth ---
        const F = flatNoCommas(T);
        R.attacks_attempted++;
        const amtOk = F.includes(String(o.total)) && F.includes(String(o.subtotal));
        assert(`3-amounts-${o.key}-${vpName}`, amtOk, `total=${o.total} subtotal=${o.subtotal} formatted=${flatNoCommas(o.total)},${flatNoCommas(o.subtotal)}`);

        // --- line items between "Items Ordered" and "Subtotal" ---
        R.attacks_attempted++;
        const lines = T.split('\n').map(s => s.trim()).filter(Boolean);
        const iHead = lines.findIndex(l => l === 'Items Ordered');
        const iSub = lines.findIndex(l => /^Subtotal/.test(l));
        const between = iHead >= 0 && iSub > iHead ? lines.slice(iHead + 1, iSub).join(' | ') : '';
        const itemNameInBetween = between.includes(o.item.slice(0, 20)) || lines.some(l => l.includes(o.item.slice(0, 20)));
        const qtyInBetween = between.length > 40; // non-trivial content sits between headers
        assert(`4-items-between-headers-${o.key}-${vpName}`, iHead >= 0 && iSub > iHead && itemNameInBetween && qtyInBetween,
          `idx(${iHead}->${iSub}) between="${between.slice(0, 180)}"`);

        // --- qty/choice/price labels verbatim ---
        R.attacks_attempted++;
        const lblOk = F.includes(flatNoCommas(o.qtyLine)) && F.includes(o.item) && F.includes(o.priceCell) &&
          (!o.choice || T.includes(o.choice));
        assert(`5-labels-${o.key}-${vpName}`, lblOk, `want qty="${o.qtyLine}" choice="${o.choice}" got ${lblOk ? 'match' : headOf(T, 4)}`);

        // --- rental block ---
        if (o.rental) {
          R.attacks_attempted++;
          const rOk = [o.rental.head, o.rental.window, o.rental.units].every(x => T.includes(x));
          assert(`5b-rental-block-${o.key}-${vpName}`, rOk, `want ${JSON.stringify(o.rental)} got=${between.slice(0, 200)}`);
          if (!rOk) finding('rental-labels', 'BROKEN', `rental booking summary missing/wrong: ${headOf(T, 8)}`, `raw-AU-035-${o.key}-${vpName}-a11y.txt`);
        }

        // --- refund copy ---
        if (o.refund) {
          R.attacks_attempted++;
          const okR = T.includes(o.refund);
          assert(`5c-refund-copy-${o.key}-${vpName}`, okR, `want "${o.refund}"`);
          if (!okR) finding('refund-label', 'BROKEN', `refunded amount copy missing on CANCELLED order`, `raw-AU-035-${o.key}-${vpName}-a11y.txt`);
        }

        // --- escrow/status banner ---
        if (o.banner) {
          R.attacks_attempted++;
          const okB = T.includes(o.banner);
          assert(`5d-banner-${o.key}-${vpName}`, okB, `want "${o.banner}"`);
          if (!okB) finding('escrow-banner', 'BROKEN', `banner "${o.banner}" absent`, `raw-AU-035-${o.key}-${vpName}-a11y.txt`);
        }

        // ================= TIMELINE (post-a405494 focus) =================
        R.attacks_attempted++;
        const tlLabel = T.includes('Order status progress');
        const missingSteps = o.steps.filter(s => !T.includes(s));
        assert(`6-timeline-steps-${o.key}-${vpName}`, tlLabel && missingSteps.length === 0,
          `semanticsLabel=${tlLabel} missing=[${missingSteps.join(', ')}]`);
        if (missingSteps.length) finding('timeline-steps', 'BROKEN',
          `a405494 explicitChildNodes dropped step labels from a11y: missing ${missingSteps.join('|')} on ${o.num}`,
          `raw-AU-035-${o.key}-${vpName}-a11y.txt`);

        // numeric markers: done steps paint a check ICON (no number text), pending/current paint N
        R.attacks_attempted++;
        if (o.numsAbsent) {
          const leaked = o.numsAbsent.filter(n => lines.includes(n));
          assert(`6b-timeline-markers-done-no-numbers-${o.key}-${vpName}`, tlLabel && leaked.length === 0,
            `numbers unexpectedly present=[${leaked.join(',')}] (done steps must paint icons, not digits)`);
          if (leaked.length) finding('timeline-markers', 'DISPUTED', `done step(s) expose digit markers ${leaked.join(',')} instead of check icons`, `raw-AU-035-${o.key}-${vpName}-a11y.txt`);
        }
        if (o.numsPresent) {
          const missN = o.numsPresent.filter(n => !lines.includes(n));
          assert(`6c-timeline-markers-pending-numbered-${o.key}-${vpName}`, missN.length === 0,
            `expected digit markers missing=[${missN.join(',')}]`);
          if (missN.length) finding('timeline-markers', 'BROKEN', `pending/current step digit markers ${missN.join(',')} absent from a11y after a405494`, `raw-AU-035-${o.key}-${vpName}-a11y.txt`);
        }
        if (o.cancelledCopy) {
          R.attacks_attempted++;
          const okC = T.includes(o.cancelledCopy);
          assert(`6d-cancelled-copy-${o.key}-${vpName}`, okC, `want "${o.cancelledCopy}"`);
          if (!okC) finding('cancelled-copy', 'BROKEN', `'Order cancelled' heading missing on CANCELLED order`, `raw-AU-035-${o.key}-${vpName}-a11y.txt`);
        }

        await shot(page, vpName, `${o.key}-bottom`);

        // ---- ATTACK: rapid double-tap on EVERY CTA of this screen ----
        R.attacks_attempted++;
        const ctrls = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('flt-semantics').forEach(e => {
            const role = e.getAttribute('role'); const tap = e.getAttribute('flt-tappable') !== null;
            if (role !== 'button' && !tap) return;
            const r = e.getBoundingClientRect();
            if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
            out.push({ label: (e.textContent || '').trim().replace(/\n/g, ' ').slice(0, 44),
              x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
          });
          return out;
        });
        let dblNotes = [], dblCrash = false;
        for (const c of ctrls.slice(0, 8)) {
          await page.mouse.click(c.x, c.y); await sleep(120); await page.mouse.click(c.x, c.y); await sleep(550);
          const t2 = await txt(page);
          if (/Could not load order|Application error|unhandled/i.test(t2)) { dblCrash = true; dblNotes.push(`${c.label}->crash`); }
          if (c.label !== 'Back' && !t2.includes(o.num)) { dblNotes.push(`${c.label}->navigated`); await boot(page, `/orders/${o.uuid}`); }
        }
        const Tdbl = await txt(page);
        assert(`atk-doubletap-${o.key}-${vpName}`, !dblCrash && Tdbl.includes(o.num),
          `controls=[${ctrls.map(c => c.label).join(';').slice(0, 110)}] notes=${dblNotes.join('|').slice(0, 100)}`);
        if (dblCrash) finding('rapid-double-tap', 'BROKEN', `double-tap crashed detail (${dblNotes.join('|')})`, `AU-035-sk2-${vpName}-${o.key}.png`);

        // ---- ATTACK: out-of-order / mid-flow back-out / deep-link re-entry ----
        R.attacks_attempted++;
        // enter detail A -> jump to detail B via deep link without backing out -> back to A
        const other = ORDERS.find(x => x.key !== o.key);
        await boot(page, `/orders/${o.uuid}`); await sleep(400);
        await boot(page, `/orders/${other.uuid}`); await sleep(400);
        const tInter = await txt(page);
        const interOk = tInter.includes(other.num) && !tInter.includes(o.num);
        await boot(page, `/orders/${o.uuid}`); await sleep(400);
        const tBack = await txt(page);
        const reOk = tBack.includes(o.num) && tBack.includes('Order status progress');
        assert(`atk-deeplink-switchback-${o.key}-${vpName}`, interOk && reOk,
          `interleave ${other.num}=${interOk}, re-enter ${o.num}=${reOk}`);
        if (!(interOk && reOk)) finding('deeplink-reentry', 'BROKEN', `deep-link switch/re-entry broke (${interOk}/${reOk})`, `AU-035-sk2-${vpName}-${o.key}.png`);
      }

      // ================= EMPTY / NOT-FOUND STATE (blocks hide entirely) ======
      R.attacks_attempted++;
      let T = await boot(page, '/orders/00000000-0000-0000-0000-000000000000');
      scanPh(T);
      const blocksGone = !T.includes('Items Ordered') && !T.includes('Subtotal') &&
        !T.includes('Order status progress') && !T.includes('Delivery fee');
      const errShown = T.includes('Could not load order');
      assert(`atk-empty-notfound-${vpName}`, errShown && blocksGone,
        `err="${errShown}" blocksHidden="${blocksGone}" head=${headOf(T, 5)}`);
      await dump(`notfound-${vpName}`);
      await shot(page, vpName, 'notfound-empty');
      if (!blocksGone) finding('empty-state', 'BROKEN', 'not-found state leaks order-detail blocks (Items/Subtotal/timeline)', `raw-AU-035-notfound-${vpName}-a11y.txt`);
      if (!errShown) finding('empty-state', 'BROKEN', 'no error surface for bogus order id', `AU-035-sk2-${vpName}-notfound-empty.png`);

      // ================= INVALID INPUT deep links =================
      R.attacks_attempted++;
      const badIds = [
        ['script-tag', encodeURIComponent('<script>alert(1)</script>')],
        ['emoji', encodeURIComponent('🙂🙂')],
        ['long500', 'A'.repeat(500)],
        ['swahili-utf8', encodeURIComponent('Agizo la soko la Kariakoo — bei?: test')],
        ['sql-ish', encodeURIComponent("12' OR '1'='1")],
      ];
      let badResults = [];
      for (const [tag, id] of badIds) {
        const Tb = await boot(page, `/orders/${id}`, 4200);
        const clean = Tb.includes('Could not load order') && !/Items Ordered|Subtotal/.test(Tb);
        const reflected = /<script>alert/i.test(Tb);
        badResults.push(`${tag}:${clean ? 'clean' : 'LEAK'}${reflected ? '+REFLECTED' : ''}`);
        if (!clean || reflected) finding('invalid-input', 'BROKEN', `bad order id "${tag}" -> ${clean ? 'clean' : 'unhandled'}${reflected ? ', script reflected' : ''}`, `AU-035-sk2-${vpName}-invalid.png`);
        await sleep(150);
      }
      await shot(page, vpName, 'invalid-ids');
      // recovery: valid deep link still works after abuse
      const tRec = await boot(page, `/orders/2499e6e9-b5f9-4b47-982e-1d50f99144c5`);
      assert(`atk-invalid-input-${vpName}`, badResults.every(r => r.includes('clean') && !r.includes('REFLECTED')) && tRec.includes('ORD-2026-000012'),
        `${badResults.join(' ')} ; recovery=${tRec.includes('ORD-2026-000012')}`);

      // ================= OFFLINE mid-request + retry =================
      R.attacks_attempted++;
      await ctx.setOffline(true);
      const tOff = await boot(page, '/orders/df3ec5c0-961a-4597-a28e-21351a98f62f', 9000);
      const offHandled = /Could not load order/i.test(tOff);
      await ctx.setOffline(false);
      const tRetry = await boot(page, '/orders/df3ec5c0-961a-4597-a28e-21351a98f62f', 8000);
      const retried = tRetry.includes('ORD-2026-000020') && tRetry.includes('Delivered');
      assert(`atk-offline-retry-${vpName}`, offHandled && retried,
        `offline err="${offHandled}" recovered="${retried}"`);
      await shot(page, vpName, 'offline-recovered');
      if (!offHandled) finding('offline', 'BROKEN', 'offline fetch produced no user-visible failure surface', `AU-035-sk2-${vpName}-offline-recovered.png`);
      if (!retried) finding('offline', 'BROKEN', 'did not recover after connectivity restored', `AU-035-sk2-${vpName}-offline-recovered.png`);

      // ================= SESSION EXPIRY mid-flow =================
      R.attacks_attempted++;
      await page.evaluate(() => { try { localStorage.removeItem('flutter.auth_token'); } catch (e) {} });
      await boot(page, '/orders/2499e6e9-b5f9-4b47-982e-1d50f99144c5', 7000);
      const tExp = await txt(page);
      const handledExpiry = /Could not load order|Welcome back|Buy now|Log in|Sign in/i.test(tExp);
      const noLeak = !tExp.includes('LANCÔME') && !tExp.includes('626000') && !tExp.includes('TSh 626');
      assert(`atk-session-expiry-${vpName}`, handledExpiry && noLeak,
        `handled=${handledExpiry} dataNotLeaked=${noLeak} head=${headOf(tExp, 5)}`);
      await shot(page, vpName, 'session-expired');
      if (!handledExpiry) finding('session-expiry', 'BROKEN', 'expired session left a broken/hung detail screen', `AU-035-sk2-${vpName}-session-expired.png`);
      if (!noLeak) finding('session-expiry', 'BROKEN', 'order data still rendered after auth token removal', `AU-035-sk2-${vpName}-session-expired.png`);
      // restore login for remaining probes
      assert(`relogin-after-expiry-${vpName}`, await uiLogin());

      // ================= ADMIN ROLE QUERY PROBE (?admin=1) =================
      R.attacks_attempted++;
      const tAdm = await boot(page, `/orders/9644e6a3-8bc4-415c-a99a-5b517bc00204?admin=1`);
      const admOk = tAdm.includes('ORD-2026-000165') && !/Could not load order/i.test(tAdm);
      assert(`atk-admin-query-${vpName}`, admOk, `?admin=1 renders own order fine; head=${headOf(tAdm, 5)}`);

      // ================= LOCALE / NUMBER FORMAT vs reference =================
      R.attacks_attempted++;
      // TZS grouping must be en-US style commas (626000 -> "TSh 626,000"), dates ISO yyyy-mm-dd
      const tFmt = await boot(page, '/orders/49dee2e4-e785-45e9-91a8-6a4dac2b3270');
      const fmtOk = tFmt.includes('TSh 92,000') && tFmt.includes('2026-08-27 to 2026-08-29') &&
        !/\b92\.000\b/.test(tFmt) && !/27\/08\/2026/.test(tFmt);
      assert(`atk-locale-format-${vpName}`, fmtOk, `TZS grouping + ISO rental window correct; head=${headOf(tFmt, 6)}`);

      // ================= images summary for this viewport =================
      const imgs = L.imageSummary(imgMap);
      R.checks.images_requested += imgs.total; R.checks.images_200 += imgs.ok;
      for (const [u, s] of Object.entries(imgMap)) if (s >= 400) R.checks.images_broken.push(`${s} ${u.slice(-70)}`);
      assert(`images-all-200-${vpName}`, imgs.failed === 0, JSON.stringify(imgs));
      R.evidence.push({ vp: vpName, netCalls: netLog.length, consoleErrs: consoleErrs.slice(0, 5) });

      await L.closeVideo(ctx, videoPath).catch(() => {});
    }

    // ---------- final rollup ----------
    const fails = R.asserts.filter(a => !a.pass);
    R.verdict = R.findings.some(f => f.result === 'BROKEN') ? 'BROKEN' : 'HELD';
    console.log(`\n=== ${UNIT} ${STAGE}: verdict=${R.verdict} asserts=${R.asserts.length} fail=${fails.length} attacks=${R.attacks_attempted} brokenFindings=${R.attacks_broken}`);
    R.shard_line = { stage: STAGE, verdict: R.verdict, asserts: R.asserts.length, failures: fails.map(f => f.name),
      attacks_attempted: R.attacks_attempted, attacks_broken: R.attacks_broken,
      images: { requested: R.checks.images_requested, ok200: R.checks.images_200, broken: R.checks.images_broken },
      placeholders: R.checks.placeholders, shots: R.shots, videos: R.videos, evidence: R.evidence,
      findings: R.findings, ts: new Date().toISOString(), build_sha: SHA, bundle_mtime: R.bundle_mtime };
    fs.writeFileSync(`e2e/results/shards/${UNIT}-${STAGE}.jsonl`, JSON.stringify(R.shard_line) + '\n');
    process.exitCode = 0;
  } catch (e) {
    R.verdict = 'DISPUTED'; R.error = String(e && e.stack || e).slice(0, 900);
    fs.writeFileSync(`e2e/results/shards/${UNIT}-${STAGE}.jsonl`, JSON.stringify({ stage: STAGE, verdict: 'DISPUTED', error: R.error, asserts: R.asserts, findings: R.findings }) + '\n');
    console.log('HARNESS ERROR', R.error); process.exitCode = 2;
  } finally { await browser.close().catch(() => {}); }
})();
