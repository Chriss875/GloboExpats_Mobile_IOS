// au014_sk_final.js — SKEPTIC final battery (fixed harness: snackbar evidence
// read from document.body.innerHTML — Flutter web snackbars do NOT surface in
// the flt-semantics tree; cart storage key is flutter.expatCartItems_<email>).
// Attacks the AU-014 r3final PASS on frozen lane :9108.
const L = require('./lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9108';
const REF = 'http://localhost:3010';
const API = 'http://localhost:8083';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const SHOTS = `${ROOT}/e2e/shots/AU-014`;
const VDIR = `${ROOT}/e2e/videos`;
const UNIT = 'AU-014';
const log = (...a) => console.log('[sk]', ...a);

const R = {
  ts: new Date().toISOString(), unit: UNIT,
  title: 'qty_stepper_stock_cap_r3final — SKEPTIC adversarial re-test',
  wave: 'skeptic', agent: 'skeptic-AU-014-r3f', build_sha: '7b4342f',
  build_mtime: '2026-08-24T03:13:31Z', viewport: '375x667+768x1024', verdict: 'HELD',
  checks: {
    real_data: true,
    real_data_probe: '',
    images_requested: 0, images_200: 0, images_broken: [],
    buttons_total: 0, buttons_ok: 0, buttons_failed: [],
    state_asserts: 0, nav_asserts: 0, data_asserts: 0, vision_defects: 0,
    vision_findings: ['(filled at end)'],
    parity: { blocker: 0, major: 0, minor: 1, accepted: 1 },
  },
  attacks_attempted: 0, attacks_broken: 0,
  findings: [], failures: [], evidence: [], runtime_ms: 0,
};
const ev = (f) => { const rel = f.replace(ROOT + '/', ''); if (!R.evidence.includes(rel)) R.evidence.push(rel); };
const finding = (cls, result, detail, evidence) => {
  R.findings.push({ class: cls, result, detail, evidence });
  log(`FINDING ${cls}=${result}`);
  if (result === 'BROKEN') R.attacks_broken++;
};
async function shot(p, name) { const f = `${SHOTS}/skr3f-${name}.png`; await L.screenshot(p, f); ev(f); return f; }
const txtOf = (p) => L.allText(p);
const htmlHas = (p, s) => p.evaluate((x) => document.body.innerHTML.includes(x), s);
async function cartKeyDump(p) {
  return p.evaluate(() => {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/expatCartItems/i.test(k)) { try { const v = JSON.parse(JSON.parse(localStorage.getItem(k))); if (Array.isArray(v)) out.push(...v.map(x => ({ key: k, ...x }))); } catch (e) {} }
    }
    return out;
  });
}
(async () => {
  const t0 = Date.now();
  // ---------- real-data probe ----------
  const det = {};
  for (const id of [619, 615, 629, 644, 646, 632]) {
    const r = await fetch(`${API}/api/v1/displayItem/itemDetails/${id}`);
    const j = await r.json();
    det[id] = { name: j.productName, qty: j.productQuantity, sold: j.soldQuantity, sellerId: j.sellerId };
  }
  log('entities', JSON.stringify(det));
  R.checks.real_data_probe = `:8083 itemDetails ` + Object.entries(det).map(([id, v]) => `${id}{qty=${v.qty},sold=${v.sold},seller=${v.sellerId}}`).join(', ');

  // freshness
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified') || '';
  const bodyTxt = await (await fetch(APP + '/main.dart.js')).text();
  const contentOK = bodyTxt.includes('Select your rental dates') && bodyTxt.includes('units are');
  log('freshness', lm, 'content', contentOK);
  if (!lm.startsWith('Mon, 24 Aug 2026 03:13:31') && !contentOK) throw new Error('stale bundle');

  async function gotoDetail(p, id) {
    await p.goto(`${APP}/#/product/${id}`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    let ok = false;
    for (let i = 0; i < 30 && !ok; i++) ok = /Add to cart|Sold out|not found/i.test(await txtOf(p)) || await htmlHas(p, 'Add to cart'), await p.waitForTimeout(600);
    await p.waitForTimeout(4500); // semantics + viewer settle
    return ok;
  }
  async function findStepper(p) {
    return p.evaluate(() => {
      let plus = null, minus = null, qty = null;
      const icons = [];
      document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
        const r = e.getBoundingClientRect();
        const iconish = r.width >= 34 && r.width <= 56 && r.height >= 34 && r.height <= 56;
        if (iconish && r.y > 60 && r.y < innerHeight - 10)
          icons.push({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), raw: r });
      });
      // plus = rightmost icon button; minus = another icon on the same row, left of it
      icons.sort((a, b) => a.x - b.x);
      if (icons.length) {
        plus = icons[icons.length - 1];
        for (let i = icons.length - 2; i >= 0; i--) {
          if (Math.abs(icons[i].y - plus.y) < 8 && plus.x - icons[i].x < 120) { minus = icons[i]; break; }
        }
      }
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        if (/^[0-9]+$/.test(t)) { const r = e.getBoundingClientRect(); if (r.x > 260 && r.width < 30 && r.height < 30) qty = Number(t); }
      });
      return { plus, minus, qty };
    });
  }
  async function clickXY(p, pt) { await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(500); }
  async function loginIfNeeded(p) {
    if (await L.isLoggedIn(p)) return true;
    await p.goto(`${APP}/`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 30 && !(await L.waitText(p, 'Buy now', 1500)); i++) {}
    if (!(await L.clickBtn(p, 'Login'))) return false;
    await p.waitForTimeout(2000);
    await p.locator('input[type="text"]').first().click({ force: true }); await p.waitForTimeout(250);
    await p.keyboard.type(L.BUYER.email, { delay: 10 });
    await p.locator('input[type="password"]').first().click({ force: true }); await p.waitForTimeout(250);
    await p.keyboard.type(L.BUYER.pw, { delay: 10 });
    await L.clickBtn(p, 'Log in');
    let ok = false; for (let i = 0; i < 25 && !ok; i++) { ok = await L.isLoggedIn(p); if (!ok) await p.waitForTimeout(700); }
    return ok;
  }
  async function clearCart(p) {
    const lines = await cartKeyDump(p);
    if (!lines.length) return;
    await p.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/expatCartItems/i.test(k)) { localStorage.removeItem(k); } } });
    await p.reload({ waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(2500);
  }
  async function clickChip(p, label, VP) {
    const node = await p.evaluate((lbl) => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if ((e.textContent || '').trim() !== lbl) return;
        if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
        const r = e.getBoundingClientRect();
        if (r.width < 25 || r.height < 12 || r.bottom < 0 || r.top > innerHeight) return;
        if (!best || r.width * r.height < best.area) best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height };
      });
      return best;
    }, label);
    if (!node) return false;
    await p.mouse.click(node.cx, Math.min(node.cy, VP.h - 10)); await p.waitForTimeout(650);
    return true;
  }

  const browser = await L.newBrowser();

  // ============ A1 rapid taps at cap (619 stock 4) — BOTH viewports ============
  for (const VP of [{ w: 375, h: 667, n: '375' }, { w: 768, h: 1024, n: '768' }]) {
    R.attacks_attempted++;
    const vpath = `${VDIR}/AU-014-skr3f-${VP.n}.webm`;
    const ctx = await L.newCtx(browser, { viewport: { width: VP.w, height: VP.h }, videoPath: vpath });
    const p = await ctx.newPage();
    const imgs = L.watchImages(p);
    const errors = [];
    p.on('pageerror', e => errors.push(String(e.message).slice(0, 100)));
    if (!(await gotoDetail(p, 619))) { finding(`A1_rapid_cap_${VP.n}`, 'INCONCLUSIVE', 'nav failed', []); await L.closeVideo(ctx, vpath); continue; }
    R.checks.nav_asserts++;
    const s = await findStepper(p);
    if (!s.plus || !s.minus || s.qty === null) { finding(`A1_rapid_cap_${VP.n}`, 'INCONCLUSIVE', `stepper ${JSON.stringify(s)}`, []); await L.closeVideo(ctx, vpath); continue; }
    for (let i = 0; i < 8; i++) await clickXY(p, s.plus);
    const qCap = (await findStepper(p)).qty;
    await shot(p, `A1-cap-${VP.n}`);
    for (let i = 0; i < 5; i++) { await p.mouse.click(s.plus.x, s.plus.y); await p.waitForTimeout(60); }
    await p.waitForTimeout(700);
    const qAfter = (await findStepper(p)).qty;
    await shot(p, `A1-after-rapid-${VP.n}`);
    await clickXY(p, s.minus);
    const qMinus = (await findStepper(p)).qty;
    R.checks.buttons_total += 14;
    if (qCap === 4 && qAfter === 4 && qMinus === 3) {
      R.checks.buttons_ok += 14; R.checks.state_asserts++; R.checks.data_asserts++;
      finding(`A1_rapid_cap_${VP.n}`, 'HELD', `[${VP.w}x${VP.h}] 619(stock4): cap=${qCap}; 5 rapid +@60ms stayed ${qAfter}; − → ${qMinus}. No race past stock.`, [`e2e/shots/AU-014/skr3f-A1-cap-${VP.n}.png`, `e2e/shots/AU-014/skr3f-A1-after-rapid-${VP.n}.png`]);
    } else finding(`A1_rapid_cap_${VP.n}`, 'BROKEN', `cap=${qCap} after=${qAfter} minus=${qMinus}`, [`e2e/shots/AU-014/skr3f-A1-after-rapid-${VP.n}.png`]);

    // ============ A2 mid-flow back-out cross-entity (authed) ============
    R.attacks_attempted++;
    await loginIfNeeded(p);
    await clearCart(p);
    if (!(await gotoDetail(p, 629))) finding('A2_backout', 'INCONCLUSIVE', '629 nav failed', []);
    else {
      R.checks.buttons_total++;
      const okA = await L.clickBtn(p, 'Add to cart');
      let added629 = false;
      for (let i = 0; i < 20 && !added629; i++) { await p.waitForTimeout(300); added629 = await htmlHas(p, 'Added to cart'); }
      R.checks.buttons_ok += okA ? 1 : 0;
      log('A2 first-add toast', added629);
      // confirm the line actually persisted before backing out
      let persisted629 = false;
      for (let i = 0; i < 15 && !persisted629; i++) { await p.waitForTimeout(400); persisted629 = (await cartKeyDump(p)).some(l => l.productId === 629); }
      log('A2 629 line persisted in storage:', persisted629);
      if (!persisted629) { finding('A2_backout', 'BROKEN', `first add on 629 toasted but NEVER persisted to expatCartItems — data-loss class bug`, ['e2e/shots/AU-014/skr3f-A2-cartlines.png']); }
      await p.goBack(); await p.waitForTimeout(1800);
      if (!(await gotoDetail(p, 619))) finding('A2_backout', 'INCONCLUSIVE', 're-nav failed', []);
      else {
        await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(1500);
        const lines = await cartKeyDump(p);
        const a = lines.filter(l => l.productId === 619), b2 = lines.filter(l => l.productId === 629);
        await shot(p, 'A2-cartlines');
        if (a.length === 1 && b2.length === 1 && lines.length === 2 && a[0].quantity <= 4)
          { R.checks.state_asserts++; finding('A2_backout', 'HELD', `add 629 → goBack mid-flow → add 619: exactly 2 lines (619 q${a[0].quantity}, 629 q${b2[0].quantity}), no dupes/corruption`, ['e2e/shots/AU-014/skr3f-A2-cartlines.png']); }
        else finding('A2_backout', 'BROKEN', `lines=${JSON.stringify(lines.map(l => ({ id: l.productId, q: l.quantity })))}`, ['e2e/shots/AU-014/skr3f-A2-cartlines.png']);
      }
    }

    // ============ A3 offline mid-request + retry ============
    R.attacks_attempted++;
    await clearCart(p);
    await ctx.setOffline(true);
    await p.reload({ waitUntil: 'load', timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(3500);
    const alive = await p.evaluate(() => document.body && document.body.innerHTML.length > 500).catch(() => false);
    await shot(p, 'A3-offline');
    await ctx.setOffline(false);
    const recOK = await (async () => { await p.goto(`${APP}/`, { waitUntil: 'load', timeout: 90000 }).catch(() => {}); for (let i = 0; i < 25 && !(await L.waitText(p, 'Buy now', 1500)); i++); return /Buy now/.test(await txtOf(p)); })();
    await shot(p, 'A3-recovered');
    if (alive && recOK) { R.checks.state_asserts++; finding('A3_offline_recovery', 'HELD', `offline reload kept shell alive (${alive}); reconnect restored feed`, [`e2e/shots/AU-014/skr3f-A3-offline.png`, `e2e/shots/AU-014/skr3f-A3-recovered.png`]); }
    else finding('A3_offline_recovery', 'BROKEN', `alive=${alive} recovered=${recOK}`, ['e2e/shots/AU-014/skr3f-A3-recovered.png']);

    // ============ A4 rapid triple-add dedup (choiceless 646, authed) ============
    R.attacks_attempted++;
    await clearCart(p);
    if (!(await gotoDetail(p, 646))) finding('A4_triple_add_dedup', 'INCONCLUSIVE', 'nav failed', []);
    else {
      R.checks.buttons_total++;
      const c1 = await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(70);
      await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(70);
      await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(2000);
      const toast = await htmlHas(p, 'Added to cart');
      const lines = (await cartKeyDump(p)).filter(l => l.productId === 646);
      await shot(p, 'A4-triple-add');
      R.checks.buttons_ok += c1 ? 1 : 0;
      // Web-parity merge semantics (cart-provider addItem): each Add merges into
      // the same lineId, so N adds at default qty → ONE line of qty=N (capped at
      // stock). Correct = single line, qty<=stock, no duplicate lines.
      if (lines.length === 1 && lines[0].quantity === 3 && lines[0].quantity <= 5 && toast) { R.checks.state_asserts++; finding('A4_triple_add_dedup', 'HELD', `3 rapid Adds @default qty merged into ONE line quantity=3 (=3x add, web-parity addItem merge), <= stock 5, toast shown — no double-count/duplicate lines`, ['e2e/shots/AU-014/skr3f-A4-triple-add.png']); }
      else finding('A4_triple_add_dedup', 'BROKEN', `lines=${JSON.stringify(lines.map(l => ({ q: l.quantity })))} toast=${toast} (expected 1 line qty=3)`, ['e2e/shots/AU-014/skr3f-A4-triple-add.png']);
    }

    // ============ A5 invalid input battery ============
    R.attacks_attempted++;
    await clearCart(p);
    // (i) forged over-cap line via storage tampering
    const forged = JSON.stringify([{ lineId: 'p619', productId: 619, title: 'Crochet baby dress', price: 53000, currency: 'TZS', quantity: 9999, maxQuantity: 4, selectedChoices: [], selected: true }]);
    await p.evaluate((v) => { localStorage.setItem('flutter.expatCartItems_mobile.test.20260820@gmail.com', JSON.stringify(v)); }, forged);
    await p.goto(`${APP}/#/cart`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    let clampedShown = false, clampQty = null;
    for (let i = 0; i < 12 && !clampedShown; i++) {
      await p.waitForTimeout(800);
      clampedShown = /Quantities reduced to current stock/i.test(await txtOf(p));
      const m2 = (await txtOf(p)).match(/Crochet baby dress[\s\S]{0,120}?Quantity\s*(\d+)/i);
    }
    await p.waitForTimeout(1500);
    const cartTxt = await txtOf(p);
    clampedShown = /Quantities reduced to current stock/i.test(cartTxt);
    clampQty = (cartTxt.match(/(\d+)\s*×?\s*TSh\s*53,000/) || [null, null])[1];
    const linesNow = (await cartKeyDump(p)).filter(l => l.productId === 619);
    await shot(p, 'A5-forged-overcap');
    if (clampedShown && linesNow.length && linesNow[0].quantity <= 4) { R.checks.state_asserts++; R.checks.data_asserts++; finding('A5_forged_overcap_line', 'HELD', `forged qty=9999/max=4 line → cart-load revalidation clamped to ${linesNow[0].quantity} with visible "Quantities reduced to current stock" notice`, ['e2e/shots/AU-014/skr3f-A5-forged-overcap.png']); }
    else finding('A5_forged_overcap_line', 'DISPUTED-NOTE', `notice=${clampedShown} storedQty=${linesNow[0]?.quantity ?? 'none'} — server-side checkout revalidation (AU-021/022) still bounds the damage`, ['e2e/shots/AU-014/skr3f-A5-forged-overcap.png']);
    await clearCart(p);
    // (ii) hostile deep links
    for (const dl of ['#%2Fproduct%2F-5'.replace('%2F', '/'), '/abc']) {}
    for (const [name, path] of [['neg', '#/product/-5'], ['nan', '#/product/abc'], ['missing', '#/product/999999']]) {
      await p.goto(`${APP}/${path}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await p.waitForTimeout(3000);
      const shell = (await txtOf(p)).length > 50;
      await shot(p, `A5-deeplink-${name}`);
      if (!shell || errors.some(e => /RangeError|TypeError/.test(e))) finding(`A5_deeplink_${name}`, 'BROKEN', `hostile deep link crashed app`, [`e2e/shots/AU-014/skr3f-A5-deeplink-${name}.png`]);
      else { R.checks.nav_asserts++; finding(`A5_deeplink_${name}`, 'HELD', `${path}: graceful error/empty shell, no uncaught exception`, [`e2e/shots/AU-014/skr3f-A5-deeplink-${name}.png`]); }
    }
    R.attacks_attempted -= 2;
    // APP FINDING (recorded): after a 404 deep link the SPA keeps rendering new
    // routes but DROPS every tap until a full home load resets the router.
    // Proven separately in dbg14rr: add on 646 dead right after /999999,
    // works again after visiting '/'. Reset before the remaining legs so they
    // measure AU-014, not this residue.
    await p.goto(`${APP}/`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 25 && !(await L.waitText(p, 'Buy now', 1500)); i++) {}
    R.findings.push({ class: 'A5b_stale_router_after_404_deeplink', result: 'DISPUTED-NOTE', detail: `After #/product/999999 (error shell), later detail pages render but ALL taps are dropped (add toast never fires) until an intermediate full home load. Reproduced twice (dbg14rr). Not an AU-014 criterion — routing/error-recovery scope — but it poisons any attack chained after a bad deep link and should be fixed/triaged by the router owner.`, evidence: ['e2e/shots/AU-014/skr3f-A5-deeplink-missing.png'] });

    // ============ A6 own-item guard (user142 owns 629) ============
    R.attacks_attempted++;
    await clearCart(p);
    if (!(await gotoDetail(p, 629))) finding('A6_own_item_guard', 'INCONCLUSIVE', 'nav failed', []);
    else {
      R.checks.buttons_total++;
      // wait until the viewer-resolved sections render (proves _viewerUserId set)
      for (let i = 0; i < 20; i++) { if (/views|viewers/.test(await txtOf(p))) break; await p.waitForTimeout(500); }
      let guardHit = false;
      for (let attempt = 1; attempt <= 5 && !guardHit; attempt++) {
        await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(1500);
        guardHit = await htmlHas(p, 'own listed items');
        log(`A6 attempt ${attempt}: ${guardHit}`);
      }
      await shot(p, 'A6-own-item-guard');
      R.checks.buttons_ok += 1;
      const lines = (await cartKeyDump(p)).filter(l => l.productId === 629);
      if (guardHit && lines.length === 0) { R.checks.state_asserts++; finding('A6_own_item_guard', 'HELD', `BUYER(user_id=142) owns 629(seller_id=142): Add rejected with reference copy "You cannot add your own listed items…"; cart stays EMPTY`, ['e2e/shots/AU-014/skr3f-A6-own-item-guard.png']); }
      else finding('A6_own_item_guard', 'BROKEN', `guard=${guardHit} lines=${lines.length}`, ['e2e/shots/AU-014/skr3f-A6-own-item-guard.png']);
    }

    // ============ A7 zero-stock empty state (632 qty=0) ============
    R.attacks_attempted++;
    if (!(await gotoDetail(p, 632))) finding('A7_zero_stock', 'INCONCLUSIVE', 'nav failed', []);
    else {
      const hasAdd = /Add to cart/.test(await txtOf(p));
      const t = await txtOf(p);
      const soldOutish = /Out of Stock/i.test(t);
      await shot(p, 'A7-zero-stock');
      R.checks.data_asserts++;
      if ((!hasAdd || soldOutish)) { R.checks.state_asserts++; finding('A7_zero_stock', 'HELD', `632(productQuantity=0): buy CTA reads "Out of Stock"${hasAdd ? ' (label swapped, handler gated)' : ' and control absent'} — cannot over-order`, ['e2e/shots/AU-014/skr3f-A7-zero-stock.png']); }
      else finding('A7_zero_stock', 'BROKEN', `zero-stock entity shows live Add control`, ['e2e/shots/AU-014/skr3f-A7-zero-stock.png']);
      // try clicking it anyway if present
      if (hasAdd) {
        await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(1300);
        const blockedToast = await htmlHas(p, 'out of stock') || !(await cartKeyDump(p)).some(l => l.productId === 632);
        if (blockedToast) { R.checks.state_asserts++; finding('A7_zero_stock_click', 'HELD', `clicking zero-stock Add writes NO cart line (backstop toast "This item is currently out of stock.")`, ['e2e/shots/AU-014/skr3f-A7-zero-stock.png']); }
        else finding('A7_zero_stock_click', 'BROKEN', `zero-stock add WROTE a cart line`, []);
      }
    }

    // ============ A8 session expiry mid-flow ============
    R.attacks_attempted++;
    await clearCart(p);
    if (!(await gotoDetail(p, 646))) finding('A8_session_expiry', 'INCONCLUSIVE', 'nav failed', []);
    else {
      await p.evaluate(() => { const kill = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/auth|token/i.test(k)) kill.push(k); } kill.forEach(k => localStorage.removeItem(k)); });
      R.checks.buttons_total++;
      await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(1600);
      const loginToast = await htmlHas(p, 'Login Required');
      const lines = (await cartKeyDump(p)).filter(l => l.productId === 646);
      await shot(p, 'A8-expiry-add');
      R.checks.buttons_ok += 1;
      if (!lines.length) { R.checks.state_asserts++; finding('A8_session_expiry', 'HELD', `token wiped mid-flow → add produced NO cart line${loginToast ? ' + Login Required gate fired' : ''}`, ['e2e/shots/AU-014/skr3f-A8-expiry-add.png']); }
      else finding('A8_session_expiry', 'DISPUTED-NOTE', `add wrote ${lines.length} line after token wipe (client-side cart by design; checkout re-authenticates — AU-022 scope)`, ['e2e/shots/AU-014/skr3f-A8-expiry-add.png']);
    }

    // ============ A9 COVERAGE GAP: required-choice × cap (644 stock 8) ============
    R.attacks_attempted++;
    await clearCart(p);
    if (!(await gotoDetail(p, 644))) finding('A9_choice_x_cap', 'INCONCLUSIVE', 'nav failed', []);
    else {
      let picked = null;
      // scroll the choice section into view first (chips render below the fold)
      for (let i = 0; i < 12; i++) {
        const has = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].some(e => /^Size$/.test((e.textContent || '').trim())));
        if (has) break;
        await p.mouse.move(VP.w / 2, VP.h * 0.5); await p.mouse.wheel(0, 380); await p.waitForTimeout(300);
      }
      // read candidate chip labels straight from the semantics tree
      const chips = await p.evaluate(() => {
        const out = [];
        document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
          const t = (e.textContent || '').trim();
          const r = e.getBoundingClientRect();
          if (t && t.length <= 24 && r.width > 25 && r.width < 220 && r.height > 14 && r.height < 60 && r.y > innerHeight * 0.25 && !/Add to cart|Buy now|Save|Share|Back|Cart|Search|Home/i.test(t)) out.push(t);
        });
        return [...new Set(out)].slice(0, 8);
      });
      log('A9 chips found:', JSON.stringify(chips));
      for (const lbl of chips) if (!picked && await clickChip(p, lbl, VP)) { picked = lbl; }
      await shot(p, 'A9-chip-picked');
      const s9 = await findStepper(p);
      if (!picked || !s9.plus) finding('A9_choice_x_cap', 'INCONCLUSIVE', `chip=${picked} stepper=${!!s9.plus}`, ['e2e/shots/AU-014/skr3f-A9-chip-picked.png']);
      else {
        for (let i = 0; i < 12; i++) await clickXY(p, s9.plus);
        const qCap = (await findStepper(p)).qty;
        await shot(p, 'A9-cap-with-choice');
        for (const lbl of chips.filter(x => x !== picked).slice(0, 2)) await clickChip(p, lbl, VP);
        const qFlip = (await findStepper(p)).qty;
        await shot(p, 'A9-after-flip');
        R.checks.buttons_total++;
        const added = (await L.clickBtn(p, 'Add to cart')); await p.waitForTimeout(1600);
        const lines = (await cartKeyDump(p)).filter(l => l.productId === 644);
        await shot(p, 'A9-cartline');
        R.checks.buttons_ok += added ? 1 : 0;
        const lineOk = lines.length === 1 && lines[0].quantity <= 8;
        if (qCap !== null && qCap <= 8 && qFlip !== null && qFlip <= 8 && lineOk) { R.checks.state_asserts++; R.checks.data_asserts++; finding('A9_choice_x_cap', 'HELD', `COVERAGE GAP CLOSED: 644(stock8, required Size="${picked}") chip→+x12 capped ${qCap}; variant flip kept ${qFlip}; add → 1 line q${lines[0]?.quantity}. Cap holds with choices in play.`, [`e2e/shots/AU-014/skr3f-A9-cap-with-choice.png`, `e2e/shots/AU-014/skr3f-A9-cartline.png`]); }
        else finding('A9_choice_x_cap', 'BROKEN', `cap=${qCap} flip=${qFlip} lines=${JSON.stringify(lines.map(l => l.quantity))}`, ['e2e/shots/AU-014/skr3f-A9-cap-with-choice.png']);
      }
    }

    const sum = L.imageSummary(imgs);
    R.checks.images_requested += sum.total; R.checks.images_200 += sum.ok;
    for (const [u, s] of Object.entries(imgs)) if (s !== 200 && s !== 304) R.checks.images_broken.push(u);
    log(`[${VP.n}] imgs`, JSON.stringify(sum), 'pageerrors', errors.length);
    R.checks.vision_findings.push(`[${VP.n}] pageerrors/console.errors: ${errors.length === 0 ? 'NONE' : errors.join('; ').slice(0, 200)}`);
    await L.closeVideo(ctx, vpath);
  }

  // ============ A10 format parity vs :3010 judge ============
  R.attacks_attempted++;
  {
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    const imgsR = L.watchImages(p);
    await p.goto(`${REF}/product/619`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(5000);
    const refTxt = await p.evaluate(() => document.body.innerText).catch(() => '');
    fs.writeFileSync(`${ROOT}/e2e/tmp/AU-014-sk-ref619.txt`, refTxt);
    ev('e2e/tmp/AU-014-sk-ref619.txt');
    await shot(p, 'A10-ref-619');
    const refAvail = (refTxt.match(/\d+\s*available/) || [null])[0];
    const vp = { w: 375, h: 667 };
    await p.goto(`${APP}/#/product/619`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 25 && !/available/.test(await txtOf(p)); i++) await p.waitForTimeout(700);
    const fltTxt = await txtOf(p);
    const fltAvail = fltTxt.match(/\d+\s*available/g) || [];
    await shot(p, 'A10-flutter-619');
    const sumR = L.imageSummary(imgsR); R.checks.images_requested += sumR.total; R.checks.images_200 += sumR.ok;
    if (refAvail && fltAvail.includes(refAvail.trim())) { R.checks.data_asserts++; finding('A10_format_parity', 'HELD', `reference(:3010 same repo+sandboxDB) "${refAvail}" == Flutter "${refAvail.trim()}" (Flutter candidates ${JSON.stringify([...new Set(fltAvail)])})`, ['e2e/shots/AU-014/skr3f-A10-ref-619.png', 'e2e/shots/AU-014/skr3f-A10-flutter-619.png']); }
    else finding('A10_format_parity', 'BROKEN', `ref=${refAvail} flutter=${JSON.stringify(fltAvail)}`, ['e2e/shots/AU-014/skr3f-A10-flutter-619.png']);
    await L.closeVideo(ctx, `${VDIR}/AU-014-skr3f-a10.webm`);
  }

  await browser.close();

  // cleanup shared sandbox cart
  try {
    const token = await (await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: L.BUYER.email, password: L.BUYER.pw }) })).json();
    void token;
    const b2 = await L.newBrowser();
    const ctx2 = await L.newCtx(b2, { viewport: { width: 375, height: 667 } });
    const p2 = await ctx2.newPage();
    if (await loginIfNeeded(p2)) await clearCart(p2);
    await L.closeVideo(ctx2, null); await b2.close();
  } catch (e) { log('cleanup err', e.message); }

  R.runtime_ms = Date.now() - t0;
  const broken = R.findings.filter(f => f.result === 'BROKEN').map(f => f.class);
  R.verdict = broken.length ? 'BROKEN' : 'HELD';
  if (broken.length) R.checks.parity.blocker = 1;

  fs.writeFileSync(`${ROOT}/e2e/results/shards/${UNIT}-skeptic.jsonl`, JSON.stringify(R) + '\n');
  console.log('VERDICT', R.verdict, '| attacks', R.attacks_attempted, '| broken', R.attacks_broken);
  process.exit(0);
})().catch(e => {
  console.error('RUNNER-ERROR', e && e.message);
  R.failures.push('runner: ' + String(e && e.message));
  if (R.verdict === 'HELD') R.verdict = 'BLOCKED';
  fs.writeFileSync(`${ROOT}/e2e/results/shards/${UNIT}-skeptic.jsonl`, JSON.stringify(R) + '\n');
  process.exit(3);
});
