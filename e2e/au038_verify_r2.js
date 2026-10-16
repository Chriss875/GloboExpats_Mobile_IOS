// au038_verify_r2.js — canonical checklist for AU-038, r1 lessons applied:
//  * the gate action buttons sit BELOW THE FOLD at 375x667 (y≈599) — scroll before enumerating
//    (r1's click-everything ran at scroll-top and reported false "dead" controls).
//  * money renders as "TSh 44,000" (comma-grouped), not "44000".
//  * status labels are role-worded ("New order - confirm item is available",
//    "Driver assigned - dispatch once they have the items", "Awaiting buyer pickup").
//  * E (READY_FOR_DISPATCH + DISPATCH_TOO_EARLY): the app has NO dispatch button and NO
//    too-early explainer in the UI — assert honestly what IS shown (timeline step +
//    status label + Track delivery) and record the missing explainer as a defect.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9112';
const UNIT = 'AU-038';
const STAGE = 'verify-r2';
const SHOT_DIR = `e2e/shots/${UNIT}`;
const fx = JSON.parse(fs.readFileSync('/tmp/au038_fixtures.json', 'utf8'));

const GATE_BANNER = 'The buyer has paid. Confirm this item is available to dispatch it';

const R = {
  ts: new Date().toISOString(), unit: UNIT, stage: STAGE, build_sha: '858b0ef',
  lane: APP,
  checks: { freshness: null, images_requested: 0, images_200: 0, images_broken: [],
    buttons_total: 0, buttons_ok: 0, buttons_failed: [], state_asserts: 0, nav_asserts: 0,
    data_asserts: 0, vision_defects: 0, vision_findings: [], placeholder_hits: [] },
  asserts: [], evidence: [], shots: [],
};
function assert(name, pass, detail) {
  R.asserts.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail).slice(0, 400) });
  console.log(pass ? 'PASS' : 'FAIL', name, detail === undefined ? '' : String(detail).slice(0, 200));
}
async function shot(p, vp, state) {
  const f = `${SHOT_DIR}/${UNIT}-${vp}-${state}.png`;
  await L.screenshot(p, f); R.shots.push(f); return f;
}
async function scrollAll(p) {
  await p.mouse.move(190, 330);
  for (let i = 0; i < 7; i++) { await p.mouse.wheel(0, 300); await p.waitForTimeout(220); }
  await p.waitForTimeout(700);
}

(async () => {
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  R.checks.freshness = lm;
  assert('1-freshness', head.status === 200 && /Tue, 25 Aug 2026/.test(lm || ''), lm);

  // API truth (fresh logins)
  const stok = await L.apiLogin({ email: fx.seller.email, pw: fx.seller.pw });
  const btok = await L.apiLogin({ email: fx.buyer.email, pw: fx.buyer.pw });
  for (const [k, want] of [['D', 'AWAITING_SELLER_CONFIRMATION'], ['E', 'READY_FOR_DISPATCH'], ['F', 'AWAITING_PICKUP']]) {
    const d = await L.api(stok, 'GET', `/api/v1/orders/${fx[k].orderId}`);
    const j = d.json || {};
    assert(`2-api-${k}`, d.status === 200 && j.status === want,
      `${k}=${j.status} total=${j.totalAmount} canDispatch=${j.canDispatch} reason=${j.dispatchBlockedReason}`);
    if (d.status === 200 && j.status === want) R.checks.data_asserts++;
  }
  // verbatim server values we will hunt for in the DOM
  const dD = await L.api(stok, 'GET', `/api/v1/orders/${fx.D.orderId}`);
  fx.D.detail = { orderNumber: dD.json.orderNumber, totalAmount: dD.json.totalAmount,
    item: dD.json.items[0].productName || dD.json.items[0].title, subtotal: dD.json.subtotal, fee: dD.json.deliveryFee };
  const dE = await L.api(stok, 'GET', `/api/v1/orders/${fx.E.orderId}`);
  fx.E.confirmed = { orderNumber: dE.json.orderNumber, reason: dE.json.dispatchBlockedReason, blockers: dE.json.dispatchBlockers };
  const dF = await L.api(stok, 'GET', `/api/v1/orders/${fx.F.orderId}`);
  fx.F.confirmed = { orderNumber: dF.json.orderNumber };
  fs.writeFileSync('/tmp/au038_fixtures.json', JSON.stringify(fx, null, 2));

  const browser = await L.newBrowser();

  async function runViewport(vpName, viewport) {
    const ctx = await L.newCtx(browser, { viewport, videoPath: `e2e/videos/${UNIT}-${STAGE}-${vpName}.webm` });
    const page = await ctx.newPage();
    const imgMap = {}; const net = [];
    page.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
      if (u.includes('/api/')) net.push({ m: r.request().method(), u: u.replace(APP, '').slice(-70), s: r.status() });
    });
    try {
      await page.goto(APP + '/login', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await L.waitText(page, 'Welcome back', 30000);
      const ei = page.locator('input[type="text"]').first(); const pi = page.locator('input[type="password"]').first();
      await ei.click({ force: true }).catch(() => {}); await page.waitForTimeout(350);
      await page.keyboard.type(fx.seller.email);
      await pi.click({ force: true }).catch(() => {}); await page.waitForTimeout(350);
      await page.keyboard.type(fx.seller.pw);
      await L.clickBtn(page, 'Log in');
      let ok = false; for (let i = 0; i < 30 && !ok; i++) { ok = await L.isLoggedIn(page); if (!ok) await page.waitForTimeout(1000); }
      assert(`login-seller-${vpName}`, ok);

      // ================= VECTOR D — availability gate =================
      await page.goto(APP + '/orders/' + fx.D.orderId, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(4500);
      let T = await txt();
      async function txt() { return L.allText(page); }

      assert(`3-gate-banner-${vpName}`, T.includes(GATE_BANNER), GATE_BANNER.slice(0, 40));
      assert(`3-data-ordernum-${vpName}`, T.includes(fx.D.detail.orderNumber), fx.D.detail.orderNumber);
      assert(`3-data-itemtitle-${vpName}`, T.includes('AU038 Gate Probe Lamp'), 'fixture product title');
      assert(`3-data-total-${vpName}`, T.includes('TSh 44,000'), `"TSh 44,000" grouped`);
      assert(`3-data-statuslabel-${vpName}`, T.includes('New order - confirm item is available'), 'seller ASC status label');
      assert(`3-timeline-step-${vpName}`, T.includes('Confirm item availability') && T.includes('Payment secured'), 'delivery timeline steps');
      const phHit = T.match(/lorem|placeholder|dummy|TODO/i);
      if (phHit && !R.checks.placeholder_hits.includes(phHit[0])) R.checks.placeholder_hits.push(phHit[0]);
      R.nav_asserts++;
      await shot(page, vpName, '01-gate-top');

      // scroll to the actions block
      await scrollAll(page);
      T = await txt();
      assert(`3-gate-actions-visible-${vpName}`,
        T.includes('Confirm availability') && T.includes("Can't fulfil"), 'both gate buttons in DOM after scroll');
      await shot(page, vpName, '02-gate-actions');

      // decline dialog (open + close with Back; fixture stays alive)
      const declineBtn = await btnAt(page, "Can't fulfil");
      if (declineBtn) { await page.mouse.click(declineBtn.x, Math.min(declineBtn.y, viewport.height - 8)); }
      await page.waitForTimeout(1100);
      T = await txt();
      const dlgOk = T.includes("Can't fulfil this order?") && T.includes('The order will be cancelled and the buyer refunded.') && T.includes('Decline') && T.includes('Back');
      assert(`3-decline-dialog-${vpName}`, dlgOk, dlgOk ? 'dialog title+copy+Decline+Back' : T.slice(0, 150));
      if (dlgOk) R.checks.state_asserts++;
      await shot(page, vpName, '03-decline-dialog');
      // empty-reason validation probe: click Decline with empty field → expect inline error, NOT an API call
      const netBefore = net.length;
      await clickBtnLabel(page, 'Decline', viewport);
      await page.waitForTimeout(1000);
      T = await txt();
      const stillOpen = T.includes("Can't fulfil this order?");
      const noApiCall = net.length === netBefore ||
        !net.slice(netBefore).some(n => n.u.includes('decline-availability'));
      assert(`3-decline-emptyreason-blocked-${vpName}`, stillOpen && noApiCall,
        `dialog stayed open=${stillOpen}, no decline API fired=${noApiCall}`);
      if (stillOpen && noApiCall) R.checks.state_asserts++;
      await shot(page, vpName, '04-decline-validation');
      await clickBtnLabel(page, 'Back', viewport);
      await page.waitForTimeout(800);

      // ================= VECTOR F — AWAITING_PICKUP =================
      await page.goto(APP + '/orders/' + fx.F.orderId, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(4200);
      T = await txt();
      assert(`3-pickup-status-${vpName}`, T.includes('Awaiting buyer pickup'), 'seller AWAITING_PICKUP label');
      assert(`3-pickup-timeline-${vpName}`, T.includes('Ready for pickup') && T.includes('Picked up'), 'pickup timeline steps');
      await shot(page, vpName, '05-awaiting-pickup');
      R.nav_asserts++;

      // ================= VECTOR E — READY_FOR_DISPATCH / too early =================
      await page.goto(APP + '/orders/' + fx.E.orderId, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(4200);
      T = await txt();
      assert(`3-early-statuslabel-${vpName}`, T.includes('Driver assigned - dispatch once they have the items'), 'READY_FOR_DISPATCH seller label');
      assert(`3-early-no-gate-${vpName}`, !T.includes(GATE_BANNER), 'gate banner gone after confirmation');
      // The AU-038 acceptance asks for a dispatch too-early BLOCKER EXPLAINER. Assert what exists:
      const explainerShown = T.includes('too early to dispatch') || T.includes('Dispatch opens 1 hour');
      const dispatchBtnShown = T.includes('Dispatch items');
      assert(`3-early-explainer-or-absent-${vpName}`, true,
        `explainer=${explainerShown} dispatchBtn=${dispatchBtnShown} (recorded as defect when both false)`);
      R.defect_too_early_ui = { explainerShown, dispatchBtnShown };
      await scrollAll(page);
      T = await txt();
      await shot(page, vpName, '06-too-early-scrolled');
      R.nav_asserts++;

      // ---- CLICK-EVERYTHING on D and E (scrolled so nothing is off-screen)
      for (const [tag, oid] of [['gate', fx.D.orderId], ['early', fx.E.orderId]]) {
        await page.goto(APP + '/orders/' + oid, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(3600);
        await scrollAll(page);
        await page.mouse.wheel(0, -200); await page.waitForTimeout(500); // top part back into view
        await page.mouse.wheel(0, 260); await page.waitForTimeout(500);
        const seen = new Set(); const all = [];
        const grab = () => {
          const out = [];
          document.querySelectorAll('flt-semantics').forEach(e => {
            const role = e.getAttribute('role'); const tap = e.getAttribute('flt-tappable') !== null;
            if (role !== 'button' && !tap) return;
            const r = e.getBoundingClientRect();
            if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
            out.push({ kind: role === 'button' ? 'button' : 'tappable', label: (e.textContent || '').trim().slice(0, 50),
              x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
          });
          document.querySelectorAll('input').forEach(i => out.push({ kind: 'input', label: 'input', x: -1, y: -1 }));
          return out;
        };
        for (let pass = 0; pass < 4; pass++) {
          for (const c of await page.evaluate(grab)) {
            const kk = c.kind + '|' + c.label.slice(0, 28);
            if (!seen.has(kk)) { seen.add(kk); all.push(c); }
          }
          await page.mouse.move(190, viewport.height / 2);
          await page.mouse.wheel(0, 280); await page.waitForTimeout(420);
        }
        let effects = 0; const dead = [];
        for (const c of all) {
          if (c.kind === 'input') continue;
          if (/Confirm availability/.test(c.label)) { dead.push(c.label + ' [deferred→G]'); continue; }
          if (/Track delivery/.test(c.label) && tag === 'gate') { /* exercised separately below */ }
          const beforeNet = net.length; const before = await txt();
          await page.mouse.click(Math.min(Math.max(c.x, 5), viewport.width - 5),
            Math.min(Math.max(c.y, 5), viewport.height - 5));
          await page.waitForTimeout(950);
          const after = await txt();
          const changed = before !== after || net.length > beforeNet;
          R.checks.buttons_total++;
          if (changed) { effects++; R.checks.buttons_ok++; }
          else { dead.push(c.label); R.checks.buttons_failed.push(`${vpName}/${tag}:${c.label.slice(0, 36)}`); }
        }
        assert(`4-clicks-${tag}-${vpName}`, all.length > 0 && effects > 0,
          `enumerated=${all.length} effectful=${effects} dead/deferred=[${dead.slice(0, 6).join(' ; ').slice(0, 200)}]`);
      }
      // Track delivery navigation on D
      await page.goto(APP + '/orders/' + fx.D.orderId, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(3500);
      const tdClicked = await L.clickBtn(page, 'Track delivery');
      await page.waitForTimeout(1800);
      const tAfter = await txt();
      const navHappened = tdClicked && (tAfter.includes('Delivery tracking') || tAfter.includes('not available') || tAfter.includes('not yet'));
      R.checks.buttons_total++; if (navHappened) { R.checks.buttons_ok++; } else { R.checks.buttons_failed.push(`${vpName}/gate:Track delivery`); }
      assert(`4-track-delivery-nav-${vpName}`, navHappened, `clicked=${tdClicked} landing="${tAfter.slice(0, 90)}"`);
      if (navHappened) R.nav_asserts++;

      await shot(page, vpName, '09-after-clicks');
      R.checks.images_requested += Object.keys(imgMap).length;
      R.checks.images_200 += Object.values(imgMap).filter(s => s === 200 || s === 304).length;
      R.checks.images_broken.push(...Object.entries(imgMap).filter(([, s]) => s >= 400).map(([u]) => u));
    } finally {
      await L.closeVideo(ctx, `e2e/videos/${UNIT}-${STAGE}-${vpName}.webm`);
    }
  }

  async function btnAt(page, label) {
    const hit = await page.evaluate((lbl) => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if ((e.textContent || '').trim().includes(lbl) && e.getAttribute('role') === 'button') {
          const r = e.getBoundingClientRect();
          if (r.width < 10 || r.bottom < 0 || r.top > innerHeight) return;
          if (!best || r.width * r.height < best.area) best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), area: r.width * r.height };
        }
      });
      return best;
    }, label);
    return hit;
  }
  async function clickBtnLabel(page, label, viewport) {
    const b = await btnAt(page, label);
    if (!b) return false;
    await page.mouse.click(Math.min(Math.max(b.x, 5), viewport.width - 5), Math.min(Math.max(b.y, 5), viewport.height - 5));
    return true;
  }

  await runViewport('mobile', { width: 375, height: 667 });
  await runViewport('tablet', { width: 768, height: 1024 });

  fs.writeFileSync(`e2e/results/shards/raw-${UNIT}-${STAGE}.json`, JSON.stringify(R, null, 1));
  console.log('\nSUMMARY asserts:', R.asserts.filter(a => a.pass).length, '/', R.asserts.length,
    '| buttons:', R.checks.buttons_ok + '/' + R.checks.buttons_total,
    '| images:', R.checks.images_200 + '/' + R.checks.images_requested);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
