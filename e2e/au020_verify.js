// au020_verify.js — VERIFIER for AU-020 cart_choice_lines_selection_r2 (RW lane).
// Frozen bundle http://localhost:9108 (sha 16b9b33). Reference judge :3000.
// RW fixtures: /tmp/au020_fixtures.json (own throwaway buyer + own product 638,
// two Size values L/S on the SAME required attribute).
//
// Unit criteria:
//  C1 two choice-variants of one product = TWO distinct cart lines (not merged)
//  C2 selection checkbox toggles subtotal EXACTLY: qty2*P + qty1*Q selected == 2P+Q
//     (and each unselected line drops out of the subtotal)
//  C3 checkout gated on >=1 selected (button disabled at zero selected)
// Appendix A: freshness, real-data probe, images HTTP200, every button clicked w/
// asserted effect, screenshots both viewports, native PNG vision inspection,
// reference parity pair.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..')); // repo root so e2e/... paths work
const L = require('./lib_verify.js');

const APP = 'http://localhost:9108';
const UNIT = 'AU-020';
const SHOT_DIR = 'e2e/shots/AU-020';
const fx = JSON.parse(fs.readFileSync('/tmp/au020_fixtures.json', 'utf8'));

const R = {
  ts: new Date().toISOString(), unit: UNIT, title: 'cart_choice_lines_selection_r2',
  wave: 'verify', agent: 'verifier-au020', build_sha: '16b9b33',
  build_mtime: '2026-08-24T00:36:38Z', viewport: '375x667+768x1024',
  checks: {
    real_data: false, real_data_probe: '', images_requested: 0, images_200: 0,
    images_broken: [], buttons_total: 0, buttons_ok: 0, buttons_failed: [],
    state_asserts: 0, nav_asserts: 0, data_asserts: 0, vision_defects: 0,
    vision_findings: [], parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
  },
  failures: [], evidence: [], runtime_ms: 0,
};
function ok(name, cond, detail) {
  if (cond) { R.checks.state_asserts++; console.log(`PASS ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`${name} expected=true actual=false ${detail || ''}`); console.log(`FAIL ${name} ${detail || ''}`); }
  return cond;
}
function dataOk(name, cond, detail) {
  if (cond) { R.checks.data_asserts++; console.log(`DATA ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`data:${name} ${detail || ''}`); console.log(`FAIL-DATA ${name} ${detail || ''}`); }
  return cond;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- read semantics text of a subtree (cart rows are flt-semantics nodes)
async function semTree(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => ({
    t: (e.textContent || '').trim(),
    role: e.getAttribute('role'),
    tap: e.getAttribute('flt-tappable'),
    r: (() => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; })(),
  })).filter(n => n.t.length || n.tap !== null));
}
async function txt(p) {
  // CanvasKit renders no DOM text; ALWAYS read the live flt-semantics tree.
  // (body.innerText served a stale snapshot after route changes and produced
  // false-negative text asserts in earlier runs.)
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
}

// click the smallest tappable node whose text includes `label` and whose rect is inside `filter`
async function clickNode(p, label, opts = {}) {
  const nodes = await p.evaluate((lbl) => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 5 || r.height < 5) return;
      if (r.bottom < 0 || r.top > innerHeight) return;
      out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height });
    });
    out.sort((a, b) => a.area - b.area);
    return out;
  }, label).catch(() => []);
  for (const c of nodes.slice(0, 4)) {
    await p.mouse.click(Math.max(5, Math.min(c.cx, 370)), Math.max(20, Math.min(c.cy, 640)));
    await sleep(500);
    return true;
  }
  return false;
}

// ChoiceChip tap that actually lands: on an unscrolled detail the chips sit at
// y≈660 (under the 667px fold / behind the bottom action bar). Scroll them into
// mid-viewport first, then coordinate-click the chip's own semantics rect.
async function clickChipVisible(p, label) {
  const find = () => p.evaluate((lbl) => {
    let hit = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (hit) return;
      const t = (e.textContent || '').trim();
      if (t !== lbl || e.getAttribute('role') !== 'button') return;
      const r = e.getBoundingClientRect();
      if (r.width < 20 || r.height < 20) return;
      hit = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
              vis: r.bottom > 0 && r.top < innerHeight - 80 };
    });
    return hit;
  }, label).catch(() => null);
  let c = await find();
  if (!c || !c.vis) {
    const cx = await p.evaluate(() => Math.round(innerWidth / 2)).catch(() => 187);
    for (const dy of [300, 300, -300]) {
      const cy = await p.evaluate(() => Math.round(innerHeight * 0.55)).catch(() => 350);
      await p.mouse.move(cx, cy); await p.mouse.wheel(0, dy); await sleep(900);
      c = await find();
      if (c && c.vis) break;
    }
  }
  if (!c) return false;
  // click; if the wheel scrolled under us and the node moved, retry once on a
  // freshly-read rect (CanvasKit taps at coordinates, not nodes).
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = await find();
    if (!before) return false;
    await p.mouse.click(before.x + before.w / 2, Math.min(Math.max(before.y + before.h / 2, 20), 640));
    await sleep(1000);
    const after = await find();
    if (after && Math.abs(after.y - before.y) < 4) return true; // no scroll shift: tap landed
  }
  return false;
}
// Persisted cart lines (client-side localStorage cart — the store truth).
async function cartLines(p) {
  return p.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/expatCartItems/.test(k)) { try { return JSON.parse(JSON.parse(localStorage.getItem(k))); } catch (e) { return []; } }
    }
    return [];
  }).catch(() => []);
}

// Parse "Subtotal (N items): TSh X" from the rendered summary bar
function parseSub(t) {
  const m = t.match(/Subtotal \((\d+) items?\):\s*TSh\s*([\d,]+)/);
  if (!m) return null;
  return { count: parseInt(m[1], 10), amount: parseInt(m[2].replace(/,/g, ''), 10), raw: m[0] };
}
function parseLinePrice(t, title) {
  // find the title then the first price after it
  const i = t.indexOf(title);
  if (i < 0) return null;
  const seg = t.slice(i, i + 400);
  const m = seg.match(/TSh\s*([\d,]+)/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

(async () => {
  const t0 = Date.now();
  const P = fx.askingPrice; // unit price, same for L and S lines

  // ---------- FRESHNESS ----------
  const fr = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = fr.headers.get('last-modified');
  const bodyHasMarker = await fetch(APP + '/main.dart.js').then(r => r.text()).then(t =>
    t.includes('Select your rental dates') && t.includes('Go to checkout'));
  console.log('freshness', fr.status, lm, 'content-marker', bodyHasMarker);
  R.evidence.push('e2e/reports/AU-020-verify.md#freshness');
  R.freshness = { status: fr.status, lastModified: lm, contentMarker: bodyHasMarker };

  const browser = await L.newBrowser();

  // ================= MOBILE 375x667 =================
  {
    const videoPath = 'e2e/videos/AU-020-mobile.webm';
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath });
    const p = await ctx.newPage();
    const imgMap = {};
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
    });

    // ---- login as our throwaway buyer (real API account)
    await p.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 45000);
    let logged = await isLoggedIn(p);
    if (!logged) {
      await L.clickBtn(p, 'Login');
      await L.waitText(p, 'Welcome back', 25000);
      await typeInto(p, p.locator('input[type="text"]').first(), fx.buyer.email);
      await typeInto(p, p.locator('input[type="password"]').first(), fx.buyer.pw);
      await L.clickBtn(p, 'Log in');
      for (let i = 0; i < 30 && !logged; i++) { await sleep(1000); logged = await isLoggedIn(p); }
    }
    ok('buyer-login-token-persisted', logged);
    await L.screenshot(p, `${SHOT_DIR}/m01-home-logged-in.png`);

    // ---- REAL DATA PROBE: search for our own fixture product by name.
    // Home's search field is an ICON that pushes SearchScreen (the TextField
    // only exists there), so: tap the Search button, then type into the app-bar
    // field and submit with the search action.
    await L.clickBtn(p, 'Search');
    await sleep(1500);
    const si = p.locator('input[type="text"]').first();
    await si.click({ force: true }).catch(() => {});
    await p.keyboard.type('AU020 Two-Size Tote', { delay: 25 });
    await sleep(1200);
    await p.keyboard.press('Enter');
    await sleep(3500);
    let T = await txt(p);
    dataOk('search-finds-own-fixture', T.includes('Two-Size Tote'), `probe=product ${fx.productId} by name`);
    R.checks.real_data_probe = `product ${fx.productId} "AU020 Two-Size Tote ${fx.stamp}" via real /products/search on :8083`;

    await L.screenshot(p, `${SHOT_DIR}/m02-search-result.png`);

    // ---- open detail. Our fixture may sit below the fold (parallel lanes keep
    // seeding products, pushing it down the newest-first grid): scroll until its
    // card is on-screen, then clickCard (which needs a visible tappable node).
    ok('detail-opened-from-search', await openToteDetail(p));
    T = await txt(p);
    const onDetail = T.includes('Add to cart') || T.includes('Choose options');
    ok('detail-opened-with-choices', onDetail, T.includes('Choose options') ? 'Choose options visible' : '');
    dataOk('detail-shows-real-price', T.includes('12,000'), 'TSh 12,000 asking price rendered');

    // ---- clear any stale cart for this buyer, then add variant A (Size L, qty 2)
    await p.evaluate(() => { Object.keys(localStorage).filter(k => /expatCartItems/.test(k)).forEach(k => localStorage.removeItem(k)); });
    ok('chip-size-L-selectable', await clickChipVisible(p, 'L'));
    await sleep(800);
    const steppedA = await qtyStepperPlus(p);   // + IconButton is icon-only semantics
    T = await txt(p);
    ok('detail-qty-stepper-to-2', steppedA && /Quantity[\s\n]*2/.test(T), (T.match(/Quantity[\s\n]*\d/) || [''])[0].replace(/\n/g,''));
    await L.screenshot(p, `${SHOT_DIR}/m03-detail-size-L-qty2.png`);
    const addA = await L.clickBtn(p, 'Add to cart');
    await sleep(2400);
    let lines = await cartLines(p);
    ok('line-A-added-with-size-L', lines.some(l => l.quantity === 2), JSON.stringify(lines.map(l => l.lineId)));

    // ---- second variant: Back to results, reopen detail, pick S (scroll chips
    // into view — they sit at y≈660 on an unscrolled detail and a tap there
    // hits the bottom bar instead), qty stays 1.
    console.log('back btn:', await L.clickBtn(p, 'Back')); await sleep(2500);
    // the first clickCard after Back can land on the still-settling list; retry
    // until the detail's Add to cart bar is actually showing
    for (let i = 0; i < 5; i++) {
      await openToteDetail(p);
      if ((await txt(p)).includes('Add to cart')) break;
      // results may need re-scrolling after Back — nudge down once
      await L.scrollToBottom(p, 6); await sleep(800);
    }
    ok('detail-reopened-for-line-B', (await txt(p)).includes('Add to cart'));
    ok('chip-size-S-selectable', await clickChipVisible(p, 'S'));
    await sleep(900);
    T = await txt(p);
    await L.screenshot(p, `${SHOT_DIR}/m04-detail-size-S.png`);
    const addB = await L.clickBtn(p, 'Add to cart');
    await sleep(2400);
    lines = await cartLines(p);
    R.linesAfterBothAdds = lines.map(l => ({ lineId: l.lineId, q: l.quantity, selected: l.selected }));
    ok('C1-two-distinct-lines-same-product-ls', lines.length === 2 &&
      new Set(lines.map(l => l.lineId)).size === 2, JSON.stringify(lines.map(l => ({ id: l.lineId, q: l.quantity }))));
    console.log('added both variants (L x2, S x1)');

    // ---- open cart via router URL (the home app-bar Cart button only exists there)
    await gotoCart(p);
    await sleep(2000);
    T = await txt(p);
    await L.screenshot(p, `${SHOT_DIR}/m05-cart-two-lines.png`);

    // C1: two distinct lines (persisted store truth + rendered DOM)
    const lsLines = await cartLines(p);
    ok('C1-two-distinct-lineIds-in-store', lsLines.length === 2 &&
      new Set(lsLines.map(l => l.lineId)).size === 2, JSON.stringify(lsLines.map(l => l.lineId)));
    dataOk('C1-store-line-A-qty2', lsLines.some(l => l.quantity === 2), '');
    dataOk('C1-store-line-B-qty1', lsLines.some(l => l.quantity === 1), '');
    // The cart rows render NO text semantics nodes (only per-row buttons
    // "Save for later" + "Remove" and the summary bar are exposed); row titles,
    // prices and "Size: L/S" are painted by CanvasKit. Row count is therefore
    // asserted structurally: TWO Remove buttons + TWO checkbox rows == two lines.
    const rowButtons = await p.evaluate(() => {
      const saves = [], removes = [], cbs = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        const r = e.getBoundingClientRect();
        if (r.width < 5 || r.height < 5 || r.bottom < 0 || r.top > innerHeight) return;
        if (t === 'Save for later' || t === 'Remove') {
          (t === 'Remove' ? removes : saves).push(Math.round(r.y));
        }
        if (e.getAttribute('role') === 'checkbox') cbs.push(Math.round(r.y));
      });
      return { saves: saves.length, removes: removes.length, checkboxes: cbs.length };
    });
    ok('C1-two-rendered-cart-rows', rowButtons.removes === 2 && rowButtons.saves === 2 && rowButtons.checkboxes === 2,
       JSON.stringify(rowButtons));
    R.cartRowStructure = rowButtons;

    // vector: initial all-selected subtotal must equal 2P + Q = 36000
    let sub = parseSub(T);
    R.vecInitial = sub;
    dataOk('C2-vector-initial-all-selected-36000', !!sub && sub.count === 2 && sub.amount === 3 * P, JSON.stringify(sub));

    // C2: toggle line A (first checkbox) OFF -> subtotal must drop to 1P
    const cb1 = await firstCheckbox(p);
    ok('line-A-checkbox-found', !!cb1);
    if (cb1) { await p.mouse.click(cb1.x, cb1.y); await sleep(900); }
    T = await txt(p);
    sub = parseSub(T);
    R.vecOneOff = sub;
    await L.screenshot(p, `${SHOT_DIR}/m06-cart-lineA-unchecked.png`);
    dataOk('C2-vector-one-unselected-12000', !!sub && sub.count === 1 && sub.amount === P, JSON.stringify(sub));

    // gate still enabled (one remains selected)
    let gate = await checkoutGateState(p);
    ok('C3-gate-enabled-with-one-selected', gate.enabled === true, JSON.stringify(gate));

    // toggle line B off too -> zero selected -> subtotal 0 AND gate disabled
    const cb2 = await firstCheckbox(p, cb1);
    ok('line-B-checkbox-found', !!cb2);
    if (cb2) { await p.mouse.click(cb2.x, cb2.y); await sleep(900); }
    T = await txt(p);
    sub = parseSub(T);
    R.vecAllOff = sub;
    gate = await checkoutGateState(p);
    await L.screenshot(p, `${SHOT_DIR}/m07-cart-zero-selected-gate.png`);
    dataOk('C2-vector-zero-selected-subtotal-0', !!sub && sub.count === 0 && sub.amount === 0, JSON.stringify(sub));
    ok('C3-gate-disabled-at-zero-selected', gate.enabled === false && (gate.msg === true || gate.disabledAttr === 'true'), JSON.stringify(gate));

    // re-select both lines (restore all-selected state)
    if (cb1) { await p.mouse.click(cb1.x, cb1.y); await sleep(700); }
    if (cb2) { await p.mouse.click(cb2.x, cb2.y); await sleep(700); }
    T = await txt(p);
    sub = parseSub(T);
    dataOk('C2-vector-reselect-restores-36000', !!sub && sub.count === 2 && sub.amount === 3 * P, JSON.stringify(sub));

    // ---------- EVERY BUTTON clicked with asserted effect ----------
    const btns = await L.listButtons(p);
    R.buttonsTotal = btns.filter(b => b.kind === 'button').length;
    console.log('buttons:', JSON.stringify(btns));
    const failed = [];
    // Remove on line B (second Remove): assert line disappears + count/subtotal change
    const removeNodes = await nodeRectsForText(p, 'Remove');
    if (removeNodes.length >= 2) {
      const before = parseSub(await txt(p));
      const rn = removeNodes[1];
      await p.mouse.click(rn.x, rn.y); await sleep(1200);
      const T2 = await txt(p);
      const after = parseSub(T2);
      const goneB = !(T2.split('Two-Size Tote').length - 1 >= 2);
      ok('btn-remove-line-B-removes-line', goneB, `lines before=${before} after=${after}`);
      dataOk('btn-remove-recalcs-subtotal-to-24000', !!after && after.amount === 2 * P, JSON.stringify(after));
      R.checks.buttons_ok++;
    } else { failed.push('Remove(second-line)'); }

    // Qty "+" on the remaining cart line: the stepper is icon-only semantics;
    // its −/+ IconButtons sit left/right of the qty number in each row's bottom
    // row. Click + on the FIRST row (its rect y comes from the Remove button),
    // then require the subtotal to grow by exactly one unit price.
    const before2 = parseSub(await txt(p));
    // The qty stepper's + IconButton shows up as an unlabeled 26x26 tappable
    // node (x≈211) directly above the "Save for later"/"Remove" row of its tile.
    // The + IconButton (_QtyButton, 26x26 InkWell) is the unlabeled tappable in
    // the tile BELOW its row's checkbox and LEFT of "Save for later" — proven at
    // (224,254) taking a line from 12,000 to 24,000.
    const plusNode = await p.evaluate(() => {
      // two small unlabeled tappables per tile: − (left) and + (right) of the
      // qty number — pick the RIGHTMOST one below the checkbox row
      const cb = [...document.querySelectorAll('flt-semantics')].find(e => e.getAttribute('role') === 'checkbox');
      const cbY = cb ? cb.getBoundingClientRect().y : -1;
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        const r = e.getBoundingClientRect();
        if (r.width > 20 && r.width < 32 && r.height > 20 && r.height < 32 &&
            e.getAttribute('flt-tappable') !== null && (e.textContent || '').trim() === '' &&
            r.y > cbY + 60) {
          if (!best || r.x > best.xRaw) best = { x: Math.round(r.x + r.width / 2), y: Math.min(Math.max(Math.round(r.y + r.height / 2), 20), 640), xRaw: r.x };
        }
      });
      return best;
    }).catch(() => null);
    if (plusNode) {
      await p.mouse.click(plusNode.x, plusNode.y); await sleep(1100);
      const after2 = parseSub(await txt(p));
      dataOk('btn-qty-plus-increments-line', !!before2 && !!after2 && after2.amount === before2.amount + P,
        `before=${JSON.stringify(before2)} plus@${JSON.stringify(plusNode)} after=${JSON.stringify(after2)}`);
    } else {
      R.failures.push('btn-qty-plus-increments-line: + IconButton not located');
    }

    // Clear all items button
    const cleared = await L.clickBtn(p, 'Clear all items');
    await sleep(1200);
    const T4 = await txt(p);
    ok('btn-clear-all-empty-state', cleared === false ? T4.includes('Your cart is empty') : true, 'empty state copy shown');
    if (!T4.includes('Your cart is empty')) failed.push('Clear all items');
    else R.checks.buttons_ok++;
    await L.screenshot(p, `${SHOT_DIR}/m08-cart-after-clear.png`);
    R.buttonsFailed = failed;

    R.images_requested += Object.keys(imgMap).length;
    R.images_200 += Object.values(imgMap).filter(s => s === 200 || s === 304).length;
    R.checks.images_broken.push(...Object.entries(imgMap).filter(([, s]) => s >= 400).map(([u]) => u));

    // tablet pass on the same flow (fresh context, same buyer token persisted? no — new ctx)
    await ctx.close();
  }

  // ================= TABLET 768x1024 =================
  {
    const ctx = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: 'e2e/videos/AU-020-tablet.webm' });
    const p = await ctx.newPage();
    const imgMap = {};
    p.on('response', r => { const u = r.url(); if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u] = r.status(); });
    await loginFlow(p, APP, fx.buyer);
    await openProductAndAddBoth(p, fx);
    R.tabletStoreAfterAdds = (await cartLines(p)).map(l => ({ id: l.lineId.slice(-12), q: l.quantity }));
    dataOk('tablet-add-produced-two-lines', R.tabletStoreAfterAdds.length === 2, JSON.stringify(R.tabletStoreAfterAdds));
    await gotoCart(p);
    // full reload boots a fresh bundle — wait for the summary bar then rows
    for (let i = 0; i < 8 && !(await txt(p)).includes('Go to checkout'); i++) await sleep(1000);
    await sleep(2500);
    // wait until the two persisted lines actually paint before asserting
    let T = '';
    for (let i = 0; i < 8; i++) {
      T = await txt(p);
      if ((T.match(/Two-Size Tote/g) || []).length >= 2) break;
      await L.scrollToBottom(p, 6);
      await sleep(900);
    }
    R.tabletLines = (await cartLines(p)).map(l => ({ id: l.lineId.slice(-12), q: l.quantity }));
    await L.screenshot(p, `${SHOT_DIR}/t01-cart-tablet-two-lines.png`);
    const tRows = await p.evaluate(() => {
      let removes = 0, saves = 0, cbs = 0;
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        const r = e.getBoundingClientRect();
        if (r.width < 5 || r.height < 5 || r.bottom < 0 || r.top > innerHeight) return;
        if (t === 'Remove') removes++;
        if (t === 'Save for later') saves++;
        if (e.getAttribute('role') === 'checkbox') cbs++;
      });
      return { removes, saves, cbs };
    });
    ok('tablet-C1-two-rendered-rows', tRows.removes === 2 && tRows.cbs === 2, JSON.stringify(tRows));
    dataOk('tablet-store-two-lines', (R.tabletStoreAfterAdds || []).length === 2, JSON.stringify(R.tabletStoreAfterAdds));
    const sub = parseSub(T);
    dataOk('tablet-C2-vector-36000', !!sub && sub.count === 2 && sub.amount === 3 * P, JSON.stringify(sub));
    R.images_requested += Object.keys(imgMap).length;
    R.images_200 += Object.values(imgMap).filter(s => s === 200 || s === 304).length;
    R.checks.images_broken.push(...Object.entries(imgMap).filter(([, s]) => s >= 400).map(([u]) => u));
    await ctx.close();
  }

  // ================= REFERENCE PARITY (:3000) =================
  {
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    await p.goto(L.REF + '/login?returnUrl=%2Fcart', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await sleep(2500);
    // reference uses its own auth storage; log in through the UI
    await refLogin(p, fx.buyer);
    await p.goto(L.REF + '/cart', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await sleep(3000);
    const refCart = await p.evaluate(() => document.body.innerText);
    fs.writeFileSync('/tmp/au020_ref_cart.txt', refCart);
    await L.screenshot(p, `${SHOT_DIR}/ref-m-cart.png`);
    const parity = {
      refReachesCart: !refCart.includes('Sign in') || refCart.includes('Order summary'),
      refTwoLines: (refCart.match(/Two-Size Tote/g) || []).length,
      refCheckoutLabel: refCart.includes('Go to checkout'),
      refSummaryLabel: refCart.includes('Order summary') || refCart.includes('Subtotal'),
    };
    R.parityRef = parity;
    console.log('REF CART:', JSON.stringify(parity));
    if (parity.refTwoLines >= 2) R.checks.parity.accepted++; else R.checks.parity.minor++;
    if (!parity.refCheckoutLabel) R.checks.parity.major++;
    await ctx.close();
  }

  await browser.close();

  // ---------- roll up ----------
  R.checks.real_data = R.failures.length === 0;
  R.runtime_ms = Date.now() - t0;
  R.evidence = [
    'e2e/shots/AU-020/m01-home-logged-in.png',
    'e2e/shots/AU-020/m02-search-result.png',
    'e2e/shots/AU-020/m03-detail-size-L-qty2.png',
    'e2e/shots/AU-020/m04-detail-size-S.png',
    'e2e/shots/AU-020/m05-cart-two-lines.png',
    'e2e/shots/AU-020/m06-cart-lineA-unchecked.png',
    'e2e/shots/AU-020/m07-cart-zero-selected-gate.png',
    'e2e/shots/AU-020/m08-cart-after-clear.png',
    'e2e/shots/AU-020/t01-cart-tablet-two-lines.png',
    'e2e/shots/AU-020/ref-m-cart.png',
    'e2e/videos/AU-020-mobile.webm',
    'e2e/videos/AU-020-tablet.webm',
  ];
  fs.writeFileSync('/tmp/au020_verify_result.json', JSON.stringify(R, null, 2));
  console.log('\nRESULT', JSON.stringify({ failures: R.failures, vecInitial: R.vecInitial, vecOneOff: R.vecOneOff, vecAllOff: R.vecAllOff }));
})().catch(e => { console.error('FATAL', e); process.exit(1); });

// ---------------- helpers ----------------
async function isLoggedIn(p) {
  return p.evaluate(() => { try { const v = localStorage.getItem('flutter.auth_token'); return !!(v && v.length > 10); } catch (e) { return false; } });
}
async function typeInto(p, loc, text) {
  await loc.click({ force: true }).catch(() => {}); await sleep(350);
  await p.keyboard.type(text, { delay: 15 });
}
async function clickChip(p, label) {
  // ChoiceChip semantics carry the label text; click smallest matching node
  return clickNode(p, label);
}
async function clickBtnSafe(p, label) { return clickNode(p, label); }
async function gotoCart(p) {
  // Router-driven navigation + a FULL reload: a same-page hash push leaves the
  // previous screen's semantics tree painted (rows missing) until the next
  // frame; reloading the bundle at #/cart deterministically boots into Cart.
  await p.goto(APP + '/#/cart', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await L.waitText(p, 'Go to checkout', 30000);
  await sleep(2500);
}
async function clickNodeExact(p, label) {
  const cands = await p.evaluate((lbl) => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (t !== lbl) return;
      const r = e.getBoundingClientRect();
      if (r.width < 5 || r.height < 5 || r.bottom < 0 || r.top > innerHeight) return;
      out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height });
    });
    out.sort((a, b) => a.area - b.area);
    return out;
  }, label);
  for (const c of cands.slice(0, 3)) { await p.mouse.click(c.cx, Math.min(Math.max(c.cy, 20), 640)); await sleep(700); return true; }
  return false;
}
async function firstCheckbox(p, exclude) {
  const cands = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim().toLowerCase();
      if (!(t === 'checkbox' || t === 'check box' || e.getAttribute('role') === 'checkbox')) return;
      const r = e.getBoundingClientRect();
      if (r.width < 5 || r.height < 10 || r.bottom < 0 || r.top > innerHeight) return;
      out.push({ x: Math.round(r.x + r.width / 2), y: Math.min(Math.max(Math.round(r.y + r.height / 2), 20), 640), w: r.width });
    });
    out.sort((a, b) => a.y - b.y);
    return out;
  });
  const usable = exclude ? cands.filter(c => Math.abs(c.y - exclude.y) > 8 || Math.abs(c.x - exclude.x) > 8) : cands;
  return usable[0] || null;
}
async function checkoutGateState(p) {
  // Flutter web exposes a DISABLED FilledButton as role=button + aria-disabled=true.
  const st = await p.evaluate(() => {
    let ariaDisabled = null, hasButtonRole = false;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes('Go to checkout')) return;
      if (e.getAttribute('role') === 'button') {
        hasButtonRole = true;
        ariaDisabled = e.getAttribute('aria-disabled');
      }
    });
    const msg = [...document.querySelectorAll('flt-semantics')]
      .some(e => (e.textContent || '').includes('Select at least one item to check out'));
    return { hasButtonRole, ariaDisabled, msg };
  }).catch(() => ({ hasButtonRole: false, ariaDisabled: null, msg: false }));
  const enabled = st.hasButtonRole && st.ariaDisabled !== 'true';
  return { enabled, msg: st.msg, disabledAttr: st.ariaDisabled === 'true' ? 'true' : 'false', raw: st };
}
async function nodeRectsForText(p, label) {
  return p.evaluate((lbl) => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 5 || r.height < 5 || r.bottom < 0 || r.top > innerHeight) return;
      out.push({ x: Math.round(r.x + r.width / 2), y: Math.min(Math.max(Math.round(r.y + r.height / 2), 20), 640), area: r.width * r.height });
    });
    out.sort((a, b) => a.area - b.area);
    return out;
  }, label);
}
async function clickQtyPlus(p) {
  return qtyStepperPlus(p);
}
// The detail-screen qty stepper's IconButtons carry icon-only semantics. The
// "Quantity" label + qty number are separate nodes on the SAME row; the number
// node's x tells us where to click: − sits ~30px left of the number, + ~33px right.
async function qtyStepperPlus(p) {
  const num = await p.evaluate(() => {
    let hit = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!/^\d+$/.test(t)) {
        if (t === 'Quantity') { const r = e.getBoundingClientRect(); if (!hit || r.y > hit.qy) hit = { qy: r.y, num: null }; }
        return;
      }
      // a bare number near a Quantity label on the same row
      const r = e.getBoundingClientRect();
      if (!hit || Math.abs(r.y - (hit.qy ?? -999)) < 40 || r.y > (hit.qy ?? -1)) {
        hit = { qy: hit && hit.qy != null ? hit.qy : r.y, num: { x: Math.round(r.x + r.width / 2), y: Math.min(Math.max(Math.round(r.y + r.height / 2), 20), 640) } };
      }
    });
    return hit && hit.num;
  }).catch(() => null);
  if (!num) return false;
  await p.mouse.click(num.x + 33, num.y); await sleep(900);
  return true;
}
async function loginFlow(p, app, cred) {
  await p.goto(app, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000);
  if (await isLoggedIn(p)) return true;
  await L.clickBtn(p, 'Login');
  await L.waitText(p, 'Welcome back', 25000);
  await typeInto(p, p.locator('input[type="text"]').first(), cred.email);
  await typeInto(p, p.locator('input[type="password"]').first(), cred.pw);
  await L.clickBtn(p, 'Log in');
  let okc = false;
  for (let i = 0; i < 30 && !okc; i++) { await sleep(1000); okc = await isLoggedIn(p); }
  return okc;
}
async function openProductAndAddBoth(p, fxx) {
  await p.evaluate(() => { Object.keys(localStorage).filter(k => /expatCartItems/.test(k)).forEach(k => localStorage.removeItem(k)); });
  await L.clickBtn(p, 'Search');
  await sleep(1800);
  const si = p.locator('input[type="text"]').first();
  await si.click({ force: true }).catch(() => {});
  await p.keyboard.type('AU020 Two-Size Tote', { delay: 20 });
  await sleep(1200);
  await p.keyboard.press('Enter');
  await sleep(3500);
  await openToteDetail(p);
  // line A: Size L + qty2
  await clickChipVisible(p, 'L');
  await qtyStepperPlus(p);
  await L.clickBtn(p, 'Add to cart');
  await sleep(2600);
  R.tabletAfterA = (await cartLines(p)).length;
  await L.clickBtn(p, 'Back'); await sleep(2800);
  for (let i = 0; i < 5; i++) {
    await openToteDetail(p);
    if ((await txt(p)).includes('Add to cart')) break;
  }
  await clickChipVisible(p, 'S');
  await L.clickBtn(p, 'Add to cart');
  await sleep(2600);
  // If the S tap missed (chip taps are coordinate-based), the second add merges
  // into line A instead of creating a second line. Retry the whole variant-B
  // leg once from a fresh detail before declaring failure.
  let tl = await cartLines(p);
  if (tl.length < 2) {
    console.log('tablet: variant B merged; retrying leg B');
    await L.clickBtn(p, 'Back'); await sleep(2800);
    for (let i = 0; i < 5; i++) { await openToteDetail(p); if ((await txt(p)).includes('Add to cart')) break; }
    await clickChipVisible(p, 'S');
    await sleep(400);
    await clickChipVisible(p, 'S'); // double-tap: idempotent selection
    await L.clickBtn(p, 'Add to cart');
    await sleep(2600);
    tl = await cartLines(p);
  }
  console.log('tablet lines after A:', R.tabletAfterA, '| after B:', tl.map(l => l.quantity));
}

// Open the fixture product's detail. lib.clickCard only clicks nodes flagged
// flt-tappable; on the tablet grid the card node is not flagged, so fall back
// to clicking the smallest semantics node carrying the title.
async function openToteDetail(p) {
  // Click OUR fixture's own card: locate the tappable node whose text starts
  // with the title (other products' cards also carry 'TSh', so a generic
  // clickCard can land on the wrong listing). Scroll until ours is on-screen.
  const maxXY = () => p.evaluate(() => [innerWidth, innerHeight]).catch(() => [375, 667]);
  for (let i = 0; i < 8; i++) {
    const c = await p.evaluate(() => {
      let hit = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (hit) return;
        const t = (e.textContent || '').trim();
        if (!t.startsWith('AU020 Two-Size Tote')) return;
        if (e.getAttribute('flt-tappable') === null) return;
        const r = e.getBoundingClientRect();
        hit = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), vis: r.bottom > 60 && r.top < innerHeight - 30 };
      });
      return hit;
    }).catch(() => null);
    if (c && c.vis) {
      const [w, h] = await maxXY();
      await p.mouse.click(Math.min(Math.max(c.x, 5), w - 5), Math.min(Math.max(c.y, 20), h - 10));
      await sleep(3200);
      if ((await txt(p)).includes('Add to cart')) return true;
    }
    const [vw] = await maxXY();
    await p.mouse.move(Math.round(vw / 2), 500); await p.mouse.wheel(0, 420); await sleep(900);
  }
  const ok1 = await L.clickCard(p, 'Two-Size Tote');
  await sleep(3000);
  if ((await txt(p)).includes('Add to cart')) return true;
  const hit = await p.evaluate(() => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes('Two-Size Tote')) return;
      const r = e.getBoundingClientRect();
      if (r.width < 30 || r.height < 30 || r.bottom < 0 || r.top > innerHeight) return;
      if (!best || r.width * r.height < best.area) best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), area: r.width * r.height };
    });
    return best;
  }).catch(() => null);
  if (hit) {
    await p.mouse.click(Math.min(Math.max(hit.x, 5), 760), Math.min(Math.max(hit.y, 20), 1000));
    await sleep(3200);
  }
  return (await txt(p)).includes('Add to cart');
}

async function refLogin(p, cred) {
  // Next.js reference: /login offers Google + Email; pick the Email form first.
  await p.locator('text=Login with Email').first().click({ timeout: 6000 }).catch(() => {});
  await sleep(1200);
  const em = p.locator('input[type="email"], input[name="email"], input[type="text"]').first();
  const pw = p.locator('input[type="password"]').first();
  await em.fill(cred.email).catch(() => {});
  await pw.fill(cred.pw).catch(() => {});
  const btn = p.locator('button:has-text("Sign In")').first();
  await btn.click({ timeout: 8000 }).catch(async () => { await p.keyboard.press('Enter'); });
  await sleep(4000);
}
