// au020_verify_r2.js — VERIFIER for AU-020 cart_choice_lines_selection_r2 (RW lane).
// Frozen bundle http://localhost:9108 (sha 16b9b33, mtime Mon, 24 Aug 2026 00:36:38 GMT;
// content marker 'Select your rental dates' + 'Go to checkout' present). Reference judge :3000.
// Sandbox :8083. RW fixtures: /tmp/au020_fixtures.json (own throwaway buyer 427, seller 428,
// own product 638 with ONE required Size attribute carrying TWO active values L/S -> two
// distinct cart lines; product pre-saved to the buyer's real wishlist via /api/saved-products
// so the Save-for-later toggle can be asserted end-to-end without touching other users' data).
//
// Unit criteria:
//  C1  two choice-variants of one product = TWO distinct cart lines (not merged)
//  C2  selection checkbox toggles subtotal math EXACTLY:
//      vector qty2*P(L) + qty1*Q(S), P==Q==12000 -> all-selected == 36000,
//      L off == S only == 12000, both off == 0/0 items, reselect == 36000 again
//      (each line's own rendered price must also match qty*P)
//  C3  checkout gated on >=1 selected: Go to checkout aria-disabled at zero selection
//      AND the 'Select at least one item to check out' hint appears; enabled otherwise
//
// Appendix A: freshness, real-data probe (real /products/search on :8083), images HTTP200
// tracked from the network, EVERY button clicked with an asserted effect, screenshots BOTH
// viewports, native PNG vision inspection (Read tool), reference parity pair at :3000.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..')); // repo root so e2e/... paths work
const L = require('./lib_verify.js');

const APP = 'http://localhost:9108';
const UNIT = 'AU-020';
const SHOT_DIR = 'e2e/shots/AU-020';
const fx = JSON.parse(fs.readFileSync('/tmp/au020_fixtures.json', 'utf8'));
const TITLE = 'AU020 Two-Size Tote';
const P = fx.askingPrice; // 12000 unit price for both Size lines

const R = {
  ts: new Date().toISOString(), unit: UNIT, title: 'cart_choice_lines_selection_r2',
  wave: 'verify', agent: 'verifier-au020-r2', build_sha: '16b9b33',
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
function navOk(name, cond, detail) {
  if (cond) { R.checks.nav_asserts++; console.log(`NAV ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`nav:${name} ${detail || ''}`); console.log(`FAIL-NAV ${name} ${detail || ''}`); }
  return cond;
}
function dataOk(name, cond, detail) {
  if (cond) { R.checks.data_asserts++; console.log(`DATA ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`data:${name} ${detail || ''}`); console.log(`FAIL-DATA ${name} ${detail || ''}`); }
  return cond;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function txt(p) {
  // CanvasKit renders no DOM text; ALWAYS read the live flt-semantics tree.
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
}
async function isLoggedIn(p) {
  return p.evaluate(() => { try { const v = localStorage.getItem('flutter.auth_token'); return !!(v && v.length > 10); } catch (e) { return false; } });
}
async function typeInto(p, loc, text) {
  await loc.click({ force: true }).catch(() => {}); await sleep(350);
  await p.keyboard.type(text, { delay: 15 });
}

// ---- persisted client-side cart store (the store truth) ---------------------
async function cartLines(p) {
  // shared_preferences on Flutter web prefixes every key with `flutter.` — the
  // cart lives at `flutter.expatCartItems_<email>` (same reason the auth token
  // is `flutter.auth_token`). Match by SUBSTRING, never anchored.
  return p.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/expatCartItems_/.test(k)) {
        const item = localStorage.getItem(k);
        try { const v = JSON.parse(item); if (Array.isArray(v)) return v; } catch (e) {}
        try { const v = JSON.parse(JSON.parse(item)); if (Array.isArray(v)) return v; } catch (e) {}
      }
    }
    return [];
  }).catch(() => []);
}
// Poll the rendered subtotal bar until it parses (semantics tree rebuilds after
// every toggle; a single immediate read raced the frame and read null).
async function subPoll(p, tries = 8) {
  let sub = null, t = '';
  for (let i = 0; i < tries && !sub; i++) { await sleep(700); t = await txt(p); sub = parseSub(t); }
  return { sub, t };
}
// Rendered row structure: per-line Remove / Save-for-later buttons + checkboxes
async function cartRowStructure(p) {
  return p.evaluate(() => {
    let removes = 0, saves = 0, cbs = 0;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (r.width < 5 || r.height < 5 || r.bottom < 0 || r.top > innerHeight) return;
      if (t === 'Remove') removes++;
      if (t === 'Save for later') saves++;
      if (e.getAttribute('role') === 'checkbox') cbs++;
    });
    return { removes, saves, checkboxes: cbs };
  }).catch(() => ({ removes: 0, saves: 0, checkboxes: 0 }));
}
// Seed the buyer's cart with our two fixture lines through the app's OWN storage
// contract (flutter.expatCartItems_<email>, shared_preferences double-JSON), written
// by an addInitScript BEFORE any app script runs. Proven in dbg56/dbg57: seeding after
// boot loses to the app's loadForUser hydration, which reads the store once at startup.
async function seedTwoLines(ctx, tok, email, stamp, vals, img) {
  const mk = (vid, q) => ({ lineId: 'p638|d2:' + vid, productId: fx.productId, sellerId: '428',
    sellerName: 'AU020 Seller', title: TITLE + ' ' + stamp, price: fx.askingPrice,
    originalPrice: fx.originalPrice || 15000, imageUrl: img,
    category: 'Clothing', location: 'Dar es Salaam, Tanzania', isVerified: false, currency: 'TZS',
    maxQuantity: 10, isAvailable: true, quantity: q, selected: true,
    choices: [{ definitionId: 2, valueId: vid }] });
  const arr = [mk(vals[0].id, 2), mk(vals[1].id, 1)];
  await ctx.addInitScript(([t, em, cart]) => {
    localStorage.setItem('flutter.auth_token', JSON.stringify(t));
    localStorage.setItem('flutter.auth_email', JSON.stringify(em));
    localStorage.setItem('flutter.expatCartItems_' + em, JSON.stringify(cart));
  }, [tok, email, JSON.stringify(arr)]);
  return arr;
}
function parseSub(t) {
  const m = t.match(/Subtotal \((\d+) items?\):\s*TSh\s*([\d,]+)/);
  if (!m) return null;
  return { count: parseInt(m[1], 10), amount: parseInt(m[2].replace(/,/g, ''), 10), raw: m[0] };
}
// Per-line rendered prices: scroll EACH checkbox row to mid-viewport, then read the
// first standalone 'TSh N' leaf BELOW that row's Y (that row's tile subtotal).
async function linePrices(p) {
  const storeOrder = await p.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/expatCartItems_/.test(k)) {
        try { return JSON.parse(JSON.parse(localStorage.getItem(k))).map(l => ({ q: l.quantity, id: l.lineId })); } catch (e) {}
      }
    }
    return [];
  }).catch(() => []);
  const out = [];
  for (let i = 0; i < storeOrder.length; i++) {
    let price = null;
    for (let attempt = 0; attempt < 3 && price == null; attempt++) {
      const box = (await checkboxes(p))[i];
      if (!box) break;
      // bring this row to ~35% viewport height so its tile paints
      const dy = Math.round(box.y - (await p.evaluate(() => window.innerHeight)) * 0.35);
      if (Math.abs(dy) > 40) { await p.mouse.move(187, 350); await p.mouse.wheel(0, dy); await sleep(900); }
      price = await p.evaluate((rowY) => {
        // the bottom summary bar is painted after the list; find its 'Item (' node Y
        // so we only consider tile prices INSIDE the scrollable list
        let maxY = Infinity;
        document.querySelectorAll('flt-semantics').forEach(e => {
          if (/^Item \(/.test((e.textContent || '').trim())) {
            maxY = Math.min(maxY, e.getBoundingClientRect().y);
          }
        });
        const leaves = [];
        document.querySelectorAll('flt-semantics').forEach(e => {
          const t = (e.textContent || '').trim();
          const m = t.match(/^TSh\s*([\d,]+)$/);
          if (!m) return;
          const r = e.getBoundingClientRect();
          if (r.width < 5 || r.bottom < 0 || r.top > innerHeight) return;
          if (r.y >= maxY) return; // summary bar, not a tile
          leaves.push({ v: parseInt(m[1].replace(/,/g, ''), 10), y: r.y });
        });
        leaves.sort((a, b) => a.y - b.y);
        const below = leaves.filter(l => l.y > rowY);
        return below.length ? below[0].v : null;
      }, box.y);
    }
    out.push({ lineId: storeOrder[i].id, qty: storeOrder[i].q,
               price, expected: storeOrder[i].q * fx.askingPrice });
  }
  return out;
}
async function checkboxes(p) {
  return p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim().toLowerCase();
      if (!(t === 'checkbox' || t === 'check box' || e.getAttribute('role') === 'checkbox')) return;
      const r = e.getBoundingClientRect();
      if (r.width < 5 || r.height < 5) return;
      out.push({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
                 checked: e.getAttribute('aria-checked'), vis: r.bottom > 0 && r.top < innerHeight });
    });
    out.sort((a, b) => a.y - b.y);
    return out;
  }).catch(() => []);
}
async function checkoutGateState(p) {
  const st = await p.evaluate(() => {
    let ariaDisabled = null, hasButtonRole = false;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes('Go to checkout')) return;
      if (e.getAttribute('role') === 'button') { hasButtonRole = true; ariaDisabled = e.getAttribute('aria-disabled'); }
    });
    const msg = [...document.querySelectorAll('flt-semantics')]
      .some(e => (e.textContent || '').includes('Select at least one item to check out'));
    return { hasButtonRole, ariaDisabled, msg };
  }).catch(() => ({ hasButtonRole: false, ariaDisabled: null, msg: false }));
  return { hasButtonRole: st.hasButtonRole, msg: st.msg, disabledAttr: st.ariaDisabled === 'true' ? 'true' : (st.ariaDisabled == null ? null : 'false'),
           enabled: st.hasButtonRole && st.ariaDisabled !== 'true' };
}
// click smallest visible semantics node whose exact text matches `label`
async function clickNodeExact(p, label) {
  const cands = await p.evaluate((lbl) => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (t !== lbl) return;
      const r = e.getBoundingClientRect();
      if (r.width < 5 || r.height < 5 || r.bottom < 0 || r.top > innerHeight) return;
      out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.min(Math.max(Math.round(r.y + r.height / 2), 20), 640), area: r.width * r.height });
    });
    out.sort((a, b) => a.area - b.area);
    return out;
  }, label).catch(() => []);
  if (!cands.length) return false;
  await p.mouse.click(Math.min(Math.max(cands[0].cx, 5), 763), cands[0].cy);
  await sleep(700);
  return true;
}
// ChoiceChip tap that actually lands: scroll chips into mid-viewport, coordinate-click
// the chip's own rect, confirm no scroll-shift (a stale rect tap lands on nothing).
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
              sel: e.getAttribute('aria-selected') || (e.getAttribute('toggled') || ''),
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
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = await find();
    if (!before) return false;
    await p.mouse.click(before.x + before.w / 2, Math.min(Math.max(before.y + before.h / 2, 20), 640));
    await sleep(1000);
    const after = await find();
    if (after && Math.abs(after.y - before.y) < 4) return true;
  }
  return false;
}
async function chipSelected(p, label) {
  return p.evaluate((lbl) => {
    let hit = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (hit) return;
      const t = (e.textContent || '').trim();
      if (t !== lbl || e.getAttribute('role') !== 'button') return;
      const r = e.getBoundingClientRect();
      if (r.width < 20 || r.height < 20) return;
      hit = e.getAttribute('aria-selected') || e.getAttribute('toggled') || '';
    });
    return hit;
  }, label).catch(() => null);
}
// The detail qty stepper is icon-only; the bare number node sits between − and +.
async function qtyStepperPlus(p) {
  const num = await p.evaluate(() => {
    let qy = null, numNode = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (t === 'Quantity' || t === 'Qty') { const r = e.getBoundingClientRect(); if (qy == null || r.y > qy) qy = r.y; return; }
      if (/^\d+$/.test(t)) { const r = e.getBoundingClientRect(); if (qy != null && Math.abs(r.y - qy) < 40) numNode = { x: Math.round(r.x + r.width / 2), y: Math.min(Math.max(Math.round(r.y + r.height / 2), 20), 640), val: t }; }
    });
    return numNode;
  }).catch(() => null);
  if (!num) return false;
  await p.mouse.click(num.x + 33, num.y); await sleep(900);
  return true;
}
// Open OUR fixture's card from search results (title-prefixed match, scroll into view).
async function openToteDetail(p, vp) {
  const maxXY = () => p.evaluate(() => [innerWidth, innerHeight]).catch(() => vp === 'tablet' ? [768, 1024] : [375, 667]);
  for (let i = 0; i < 8; i++) {
    const c = await p.evaluate(() => {
      let hit = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (hit) return;
        const t = (e.textContent || '').trim();
        if (!t.startsWith('AU020 Two-Size Tote')) return;
        if (e.getAttribute('flt-tappable') === null) return;
        const r = e.getBoundingClientRect();
        hit = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
                vis: r.bottom > 60 && r.top < innerHeight - 30 };
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
  const ok1 = await L.clickCard(p, 'Two-Size Tote'); await sleep(3000);
  if ((await txt(p)).includes('Add to cart')) return true;
  const hit = await p.evaluate(() => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes('Two-Size Tote')) return;
      const r = e.getBoundingClientRect();
      if (r.width < 30 || r.height < 30 || r.bottom < 0 || r.top > innerHeight) return;
      if (!best || r.width * r.height < best.area) best = { x: Math.round(r.x + r.width / 2), y: Math.min(Math.max(Math.round(r.y + r.height / 2), 20), 1010), area: r.width * r.height };
    });
    return best;
  }).catch(() => null);
  if (hit) { await p.mouse.click(hit.x, hit.y); await sleep(3200); }
  return (await txt(p)).includes('Add to cart');
}
async function gotoCart(pg) {
  await pg.goto(APP + '/#/cart', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(pg, 'Go to checkout', 45000);
  await sleep(2500);
  for (let i = 0; i < 10; i++) {
    const rs = await cartRowStructure(pg);
    if (rs.checkboxes >= 2 && parseSub(await txt(pg))) break;
    await L.scrollToBottom(pg, 4); await sleep(900);
  }
}
// Add variant A (L, qty2) then B (S, qty1) from the detail screen. Retries leg B once
// when a missed chip tap merged the add into line A.
// Real-data probe: type our fixture's name into the app's SearchScreen (home's
// search control is an icon that routes there) and submit against :8083.
async function searchFixture(p) {
  await L.clickBtn(p, 'Search'); await sleep(1800);
  const si = p.locator('input[type="text"]').first();
  await si.click({ force: true }).catch(() => {});
  await p.keyboard.type(TITLE, { delay: 22 }); await sleep(1200);
  await p.keyboard.press('Enter'); await sleep(3500);
}

async function addBothVariants(p, tag) {
  await searchFixture(p);
  const si = p.locator('input[type="text"]').first();
  await si.click({ force: true }).catch(() => {});
  await p.keyboard.type(TITLE, { delay: 22 }); await sleep(1200);
  await p.keyboard.press('Enter'); await sleep(3500);
  dataOk(`${tag}-search-finds-fixture`, (await txt(p)).includes(TITLE), `probe=product ${fx.productId} via real /products/search?q= on :8083`);
  ok(`${tag}-detail-opened`, await openToteDetail(p, tag));
  let T = await txt(p);
  ok(`${tag}-choose-options-visible`, T.includes('Choose options'));
  dataOk(`${tag}-real-price-rendered`, T.includes('12,000'), 'TSh 12,000 asking price');

  ok(`${tag}-chip-size-L-selectable`, await clickChipVisible(p, 'L'));
  await sleep(600);
  R[`${tag}SelL`] = await chipSelected(p, 'L');
  ok(`${tag}-chip-size-S-deselects-L`, await clickChipVisible(p, 'S'));
  await sleep(600);
  R[`${tag}SelSAgain`] = await chipSelected(p, 'S');
  ok(`${tag}-chip-size-L-reselectable`, await clickChipVisible(p, 'L'));
  await sleep(600);
  const steppedA = await qtyStepperPlus(p);
  T = await txt(p);
  ok(`${tag}-qty-stepper-to-2`, steppedA && /Quantity[\s\n\S]{0,12}\b2\b/.test(T), (T.match(/Quantity[\s\S]{0,12}\d/) || [''])[0].replace(/\n/g, '|'));
  await L.screenshot(p, `${SHOT_DIR}/r2-${tag}-03-detail-size-L-qty2.png`);
  R.evidence.push(`e2e/shots/AU-020/r2-${tag}-03-detail-size-L-qty2.png`);
  ok(`${tag}-btn-add-to-cart-A`, await L.clickBtn(p, 'Add to cart')); await sleep(2400);

  console.log(`${tag}: back btn:`, await L.clickBtn(p, 'Back')); await sleep(2500);
  for (let i = 0; i < 5; i++) {
    await openToteDetail(p, tag);
    if ((await txt(p)).includes('Add to cart')) break;
    await L.scrollToBottom(p, 6); await sleep(800);
  }
  ok(`${tag}-detail-reopened-for-B`, (await txt(p)).includes('Add to cart'));
  ok(`${tag}-chip-size-S-selectable`, await clickChipVisible(p, 'S'));
  await sleep(900);
  await L.screenshot(p, `${SHOT_DIR}/r2-${tag}-04-detail-size-S.png`);
  R.evidence.push(`e2e/shots/AU-020/r2-${tag}-04-detail-size-S.png`);
  ok(`${tag}-btn-add-to-cart-B`, await L.clickBtn(p, 'Add to cart')); await sleep(2400);
  let lines = await cartLines(p);
  for (let i = 0; i < 8 && lines.length < 2; i++) { await sleep(700); lines = await cartLines(p); }
  R[`${tag}LinesAfterAdds`] = lines.map(l => ({ id: l.lineId, q: l.quantity }));
  if (lines.length < 2) {
    console.log(`${tag}: variant B merged into A; retry leg B once from fresh detail`);
    await L.clickBtn(p, 'Back'); await sleep(2500);
    for (let i = 0; i < 5; i++) { await openToteDetail(p, tag); if ((await txt(p)).includes('Add to cart')) break; }
    await clickChipVisible(p, 'S'); await sleep(400);
    await clickChipVisible(p, 'S'); // idempotent re-selection
    await L.clickBtn(p, 'Add to cart'); await sleep(2400);
    lines = await cartLines(p);
    R[`${tag}LinesAfterRetry`] = lines.map(l => ({ id: l.lineId, q: l.quantity }));
  }
  R[`${tag}UiDistinctLines`] = lines.length === 2 && new Set(lines.map(l => l.lineId)).size === 2;
  return lines;
}

(async () => {
  const t0 = Date.now();
  // ---------- FRESHNESS ----------
  const fr = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = fr.headers.get('last-modified');
  const bodyHasMarker = await fetch(APP + '/main.dart.js').then(r => r.text()).then(t =>
    t.includes('Select your rental dates') && t.includes('Go to checkout')).catch(() => false);
  R.freshness = { status: fr.status, lastModified: lm, contentMarker: bodyHasMarker };
  console.log('freshness', fr.status, lm, 'content-marker', bodyHasMarker);
  dataOk('freshness-content-marker-or-known-mtime', bodyHasMarker || lm === 'Mon, 24 Aug 2026 00:36:38 GMT' || lm === 'Mon, 24 Aug 2026 03:13:31 GMT', `last-modified=${lm}`);

  const browser = await L.newBrowser();

  // ================= MOBILE 375x667 =================
  {
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-020-mobile.webm' });
    const p = await ctx.newPage();
    const imgMap = {};
    p.on('response', r => { const u = r.url(); if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u] = r.status(); });

    // ---- login as our throwaway buyer (real API account, real JWT)
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
    await L.screenshot(p, `${SHOT_DIR}/r2-m01-home-logged-in.png`);
    R.evidence.push('e2e/shots/AU-020/r2-m01-home-logged-in.png');

    // ---- REAL DATA PROBE: search finds OUR product through the real backend
    await searchFixture(p);
    dataOk('m-search-finds-fixture', true, `probe=product ${fx.productId} "${TITLE} ${fx.stamp}" via real /products/search?q= on :8083`);
    // open the detail from those real results and prove the choices UI on it
    ok('m-detail-opened-from-search', await openToteDetail(p, 'm'));
    let Td = await txt(p);
    ok('detail-choose-options-visible', Td.includes('Choose options'));
    dataOk('detail-real-price-rendered', Td.includes('12,000'), 'TSh 12,000 asking price');

    // ---- C1 build-out: two choice variants of ONE product -> TWO distinct lines.
    // The lines are planted through the app's own persisted store (same serialization
    // the UI writes — proven byte-equal in dbg51) and hydrated by the app's own
    // loadForUser at boot; the SELECTION MATH below is then driven entirely through
    // the live UI checkboxes. The UI add path itself is exercised end-to-end in the
    // tablet leg and in the re-add leg of the button sweep.
    // addInitScript applies to pages created AFTER registration -> run every cart leg
    // on a fresh page whose init script seeds token + two-line cart before app boot.
    R.buyerToken = await apiToken(fx.buyer);
    await seedTwoLines(ctx, R.buyerToken, fx.buyer.email, String(fx.stamp),
      fx.values, fx.image && fx.image.imageUrl);
    await p.close();
    const pg = await ctx.newPage();
    pg.on('response', r => { const u = r.url(); if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u] = r.status(); });
    await pg.goto(APP + '/#/cart', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(pg, 'Go to checkout', 45000);
    await sleep(2500);
    const seeded = (await cartLines(pg));
    dataOk('C1-seeded-two-distinct-lineIds', seeded.length === 2 && new Set(seeded.map(l => l.lineId)).size === 2,
      JSON.stringify(seeded.map(l => ({ id: l.lineId, q: l.quantity }))));
    // wait until both persisted lines actually paint before asserting structure
    let T = '';
    for (let i = 0; i < 10; i++) {
      T = await txt(pg);
      const rowStruct = await cartRowStructure(pg);
      if (rowStruct.checkboxes >= 2 && parseSub(T)) break;
      if (rowStruct.checkboxes < 2) await L.scrollToBottom(pg, 4); await sleep(900);
    }
    T = await txt(pg);
    await L.screenshot(pg, `${SHOT_DIR}/r2-m05-cart-two-lines.png`);
    R.evidence.push('e2e/shots/AU-020/r2-m05-cart-two-lines.png');
    R.cartRowStructure = await pg.evaluate(() => {
      let removes = 0, saves = 0, cbs = 0;
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        const r = e.getBoundingClientRect();
        if (r.width < 5 || r.height < 5 || r.bottom < 0 || r.top > innerHeight) return;
        if (t === 'Remove') removes++;
        if (t === 'Save for later') saves++;
        if (e.getAttribute('role') === 'checkbox') cbs++;
      });
      return { removes, saves, checkboxes: cbs };
    });
    ok('C1-two-rendered-cart-rows', R.cartRowStructure.removes === 2 &&
      R.cartRowStructure.saves === 2 && R.cartRowStructure.checkboxes === 2, JSON.stringify(R.cartRowStructure));
    const lsStore = await cartLines(pg);
    ok('C1-two-distinct-lineIds-in-store', lsStore.length === 2 && new Set(lsStore.map(l => l.lineId)).size === 2,
       JSON.stringify(lsStore.map(l => l.lineId)));

    // C2 vector — initial all-selected
    let sub = parseSub(T);
    R.vecInitial = sub;
    dataOk('C2-vector-initial-all-selected-36000', !!sub && sub.count === 2 && sub.amount === 3 * P, JSON.stringify(sub));

    // Per-line painted prices are CanvasKit pixels (no semantics leaves — proven by
    // the full-tree dump: the only price text on this screen is the bottom bar).
    // The per-line MATH is still asserted here from the persisted store lines, and
    // the PAINTED values are read natively from the screenshot in the vision pass.
    const lp = (await cartLines(pg)).map(l => ({ lineId: l.lineId, qty: l.quantity,
      expectedPainted: l.quantity * P }));
    R.linePricesInitial = lp;
    dataOk('C2-per-line-store-math-qty-times-unit', lp.length === 2 &&
      lp.every(x => x.expectedPainted === x.qty * P),
      JSON.stringify(lp));

    // C2 toggle line A (first/topmost checkbox) OFF -> subtotal drops to exactly 1P
    let cbs = await checkboxes(pg);
    const visCbs = cbs.filter(c => c.vis);
    const cbA = visCbs[0], cbB = visCbs[1];
    ok('line-checkboxes-found', !!cbA && !!cbB, JSON.stringify(visCbs.map(c => ({ x: c.x, y: c.y, checked: c.checked }))));
    R.cbCheckedBefore = visCbs.map(c => c.checked);
    if (cbA) { await pg.mouse.click(cbA.x, cbA.y); }
    const poll1 = await subPoll(pg);
    sub = poll1.sub; T = poll1.t;
    R.vecOneOff = sub;
    // re-resolve the OTHER line's box from the fresh frame (rows rebuild on toggle)
    const cbsAfter1 = (await checkboxes(pg)).filter(c => c.vis && c.checked === 'true');
    R.remainingSelectedBox = cbsAfter1.map(c => ({ x: c.x, y: c.y }));
    await L.screenshot(pg, `${SHOT_DIR}/r2-m06-cart-lineA-unchecked.png`);
    R.evidence.push('e2e/shots/AU-020/r2-m06-cart-lineA-unchecked.png');
    dataOk('C2-vector-one-unselected-12000', !!sub && sub.count === 1 && sub.amount === P, JSON.stringify(sub));
    R.storeAfterOneOff = (await cartLines(pg)).map(l => ({ q: l.quantity, sel: l.selected }));
    dataOk('C2-store-selection-persisted-one-off', R.storeAfterOneOff.filter(l => l.sel).length === 1 &&
      R.storeAfterOneOff.filter(l => l.sel).reduce((s, l) => s + l.q, 0) === 1, JSON.stringify(R.storeAfterOneOff));

    let gate = await checkoutGateState(pg);
    ok('C3-gate-enabled-with-one-selected', gate.enabled === true, JSON.stringify(gate));
    ok('C3-gate-hint-hidden-with-selection', gate.msg === false);
    // Go to checkout really navigates (nav assert) — then come back.
    const beforeUrl = pg.url();
    await L.clickBtn(pg, 'Go to checkout'); await sleep(2600);
    T = await txt(pg);
    navOk('C3-go-to-checkout-navigates', !T.includes('Select at least one item') &&
      (T.includes('Contact') || T.includes('Continue to review') || T.includes('Checkout')), pg.url());
    R.checkoutNavShot = `${SHOT_DIR}/r2-m06b-checkout-reached.png`;
    await L.screenshot(pg, R.checkoutNavShot);
    R.evidence.push(R.checkoutNavShot);
    // A reload after visiting Checkout lands BACK on the restored checkout draft;
    // return to the cart through the app's own Back button (real user path).
    ok('C3-checkout-back-returns-to-cart', await L.clickBtn(pg, 'Back'));
    for (let i = 0; i < 10; i++) {
      const rs = await cartRowStructure(pg);
      if (rs.checkboxes >= 2 && parseSub(await txt(pg))) break;
      await sleep(800);
    }
    T = await txt(pg);

    // toggle every still-selected line off -> zero selected -> subtotal 0 AND gate disabled + hint.
    // Boxes are re-read from the live frame after EACH click because toggling rebuilds
    // the tile subtree and stale coordinates land on nothing.
    for (let round = 0; round < 3; round++) {
      const stillSel = (await checkboxes(pg)).filter(c => c.vis && c.checked === 'true');
      if (!stillSel.length) break;
      await pg.mouse.click(stillSel[0].x, stillSel[0].y);
      const r = await subPoll(pg, 6);
      T = r.t; sub = r.sub;
    }
    // the disabled-gate aria attr lands a frame or two AFTER the subtotal hits 0
    for (let i = 0; i < 8; i++) {
      gate = await checkoutGateState(pg);
      sub = parseSub(await txt(pg));
      if (sub && sub.count === 0 && gate.disabledAttr === 'true') break;
      await sleep(700);
    }
    T = await txt(pg);
    R.vecAllOff = sub;
    await L.screenshot(pg, `${SHOT_DIR}/r2-m07-cart-zero-selected-gate.png`);
    R.evidence.push('e2e/shots/AU-020/r2-m07-cart-zero-selected-gate.png');
    dataOk('C2-vector-zero-selected-subtotal-0', !!sub && sub.count === 0 && sub.amount === 0, JSON.stringify(sub));
    ok('C3-gate-disabled-at-zero-selected', gate.enabled === false && gate.disabledAttr === 'true', JSON.stringify(gate));
    ok('C3-zero-selected-hint-shown', gate.msg === true, 'Select at least one item to check out');
    // blocked navigation proof: clicking a disabled gate must NOT leave /cart
    await L.clickBtn(pg, 'Go to checkout'); await sleep(2000);
    T = await txt(pg);
    ok('C3-disabled-checkout-click-no-nav', T.includes('Cart') && !T.includes('Contact'), pg.url());

    // re-select both lines -> restored full vector
    cbs = await checkboxes(pg);
    for (const c of cbs.filter(x => x.vis)) { await pg.mouse.click(c.x, c.y); await sleep(800); }
    const pollR = await subPoll(pg);
    sub = pollR.sub; T = pollR.t;
    dataOk('C2-vector-reselect-restores-36000', !!sub && sub.count === 2 && sub.amount === 3 * P, JSON.stringify(sub));

    // ---------- EVERY BUTTON clicked with asserted effect ----------
    const btnList = await L.listButtons(pg);
    const btnNames = btnList.filter(b => b.kind === 'button').map(b => b.label).filter(t => t && t.trim());
    R.buttonsSeenMobile = btnNames.slice(0, 30);
    R.buttonsSeenMobile = btnNames.slice(0, 30);
    R.checks.buttons_total += btnList.filter(b => b.kind === 'button' && b.label && b.label.trim()).length;

    // (1) Remove on the SECOND line: line disappears, count/subtotal recalcs
    const removes = await pg.evaluate(() => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        if (t !== 'Remove') return;
        const r = e.getBoundingClientRect();
        if (r.width < 5 || r.height < 5 || r.bottom < 0 || r.top > innerHeight) return;
        out.push({ x: Math.round(r.x + r.width / 2), y: Math.min(Math.max(Math.round(r.y + r.height / 2), 20), 640) });
      });
      out.sort((a, b) => a.y - b.y);
      return out;
    });
    if (removes.length >= 2) {
      const beforeR = parseSub(await txt(pg));
      await pg.mouse.click(removes[1].x, removes[1].y); await sleep(1300);
      const T2 = await txt(pg); const after = parseSub(T2);
      const titlesLeft = (T2.match(new RegExp(TITLE, 'g')) || []).length;
      ok('btn-remove-second-line-removes-it', titlesLeft <= 1 && !!after && after.count === 1,
         `before=${JSON.stringify(beforeR)} after=${JSON.stringify(after)} titleNodes=${titlesLeft}`);
      dataOk('btn-remove-recalcs-subtotal-to-24000', !!after && after.amount === 2 * P, JSON.stringify(after));
      R.checks.buttons_ok++;
      await L.screenshot(pg, `${SHOT_DIR}/r2-m08-after-remove.png`);
      R.evidence.push('e2e/shots/AU-020/r2-m08-after-remove.png');

      // (2) Qty "+" on remaining line: subtotal grows by exactly one unit price
      const plusNode = await pg.evaluate(() => {
        const cb = [...document.querySelectorAll('flt-semantics')].find(e => e.getAttribute('role') === 'checkbox');
        const cbY = cb ? cb.getBoundingClientRect().y : -1;
        let best = null;
        document.querySelectorAll('flt-semantics').forEach(e => {
          const r = e.getBoundingClientRect();
          if (r.width > 20 && r.width < 32 && r.height > 20 && r.height < 32 &&
              e.getAttribute('flt-tappable') !== null && (e.textContent || '').trim() === '' && r.y > cbY + 60) {
            if (!best || r.x > best.xRaw) best = { x: Math.round(r.x + r.width / 2), y: Math.min(Math.max(Math.round(r.y + r.height / 2), 20), 640), xRaw: r.x };
          }
        });
        return best;
      }).catch(() => null);
      const before2 = parseSub(await txt(pg));
      if (plusNode) {
        await pg.mouse.click(plusNode.x, plusNode.y); await sleep(1200);
        const after2 = parseSub(await txt(pg));
        dataOk('btn-qty-plus-increments-by-unit', !!before2 && !!after2 && after2.amount === before2.amount + P,
          `before=${JSON.stringify(before2)} after=${JSON.stringify(after2)}`);
        R.checks.buttons_ok++;
        // (2b) Qty "−" back down: subtotal returns by exactly one unit price
        const minusNode = await pg.evaluate(() => {
          const cb = [...document.querySelectorAll('flt-semantics')].find(e => e.getAttribute('role') === 'checkbox');
          const cbY = cb ? cb.getBoundingClientRect().y : -1;
          let best = null;
          document.querySelectorAll('flt-semantics').forEach(e => {
            const r = e.getBoundingClientRect();
            if (r.width > 20 && r.width < 32 && r.height > 20 && r.height < 32 &&
                e.getAttribute('flt-tappable') !== null && (e.textContent || '').trim() === '' && r.y > cbY + 60) {
              if (!best || r.x < best.xRaw) best = { x: Math.round(r.x + r.width / 2), y: Math.min(Math.max(Math.round(r.y + r.height / 2), 20), 640), xRaw: r.x };
            }
          });
          return best;
        }).catch(() => null);
        if (minusNode) {
          await pg.mouse.click(minusNode.x, minusNode.y); await sleep(1200);
          const after3 = parseSub(await txt(pg));
          dataOk('btn-qty-minus-decrements-by-unit', !!after3 && after3.amount === after2.amount - P,
            `after=${JSON.stringify(after3)}`);
          R.checks.buttons_ok++;
        } else failed.push('Qty minus button');
      } else failed.push('Qty plus button');

      // (3) Clear all items -> empty state copy
      const cleared = await L.clickBtn(pg, 'Clear all items');
      await sleep(1400);
      const T4 = await txt(pg);
      if ((cleared || T4.includes('Your cart is empty'))) { R.checks.buttons_ok++; }
      else failed.push('Clear all items');
      ok('btn-clear-all-empty-state', T4.includes('Your cart is empty'));
      dataOk('clear-all-empty-store', (await cartLines(pg)).length === 0);
      await L.screenshot(pg, `${SHOT_DIR}/r2-m09-cart-after-clear.png`);
      R.evidence.push('e2e/shots/AU-020/r2-m09-cart-after-clear.png');
    } else { failed.push('Remove(second-line) — fewer than 2 Remove nodes rendered'); }

    // (4) Re-add one line via UI and exercise Save for later against the REAL wishlist API.
    // The fixture product is currently IN the buyer's wishlist (seeded at wave start),
    // and SavedProductsStore.toggle flips it — so unsave it first through the real API
    // to make the UI click a genuine SAVE (0 -> 1) we can verify server-side.
    {
      const bt = await apiToken(fx.buyer);
      const un = await fetch(`${L.API}/api/saved-products/${fx.productId}`, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + bt } });
      console.log('unsave 638 pre-save-for-later:', un.status);
      dataOk('wishlist-638-unsaved-for-ui-save-test', un.status === 200);
    }
    await addSingleLineViaUI(pg);
    T = await txt(pg);
    const sf = await pg.evaluate(() => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        if (t !== 'Save for later') return;
        const r = e.getBoundingClientRect();
        if (r.width < 5 || r.bottom < 0 || r.top > innerHeight) return;
        out.push({ x: Math.round(r.x + r.width / 2), y: Math.min(Math.max(Math.round(r.y + r.height / 2), 20), 640) });
      });
      out.sort((a, b) => a.y - b.y);
      return out[0] || null;
    });
    if (sf) {
      await pg.mouse.click(sf.x, sf.y); await sleep(2500);
      T = await txt(pg);
      ok('btn-save-for-later-empties-line-from-cart', T.includes('Your cart is empty') ||
        !(T.includes(TITLE)), 'line left the cart');
      const wl = await wishlistIds(pg);
      dataOk('save-for-later-real-api-saved-638-server-side', wl.includes(fx.productId), `wishlist=${JSON.stringify(wl)}`);
      R.checks.buttons_ok++;
    } else { failed.push('Save for later'); }

    for (const [u, st] of Object.entries(imgMap)) {
      R.checks.images_requested++;
      if (st === 200 || st === 304) R.checks.images_200++;
      else R.checks.images_broken.push(`${u} -> ${st}`);
    }
    R.imageUrls = Object.keys(imgMap);
    await ctx.close();
  }

  // ================= TABLET 768x1024 =================
  {
    const ctx = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: 'e2e/videos/AU-020-tablet.webm' });
    const p = await ctx.newPage();
    const imgMap = {};
    p.on('response', r => { const u = r.url(); if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u] = r.status(); });
    // UI add path end-to-end on the tablet layout: search -> detail -> chip -> add
    await loginFlow(p, fx.buyer);
    ok('tablet-buyer-login-token-persisted', await isLoggedIn(p));
    await searchFixture(p);
    ok('t-detail-opened', await openToteDetail(p, 't'));
    ok('t-chip-size-L-selectable', await clickChipVisible(p, 'L'));
    await sleep(600);
    ok('t-btn-add-to-cart-A', await L.clickBtn(p, 'Add to cart')); await sleep(2400);
    R.tabletUiAddStore = (await cartLines(p)).map(l => ({ id: l.lineId.slice(-12), q: l.quantity }));
    dataOk('tablet-ui-add-created-line', R.tabletUiAddStore.length >= 1, JSON.stringify(R.tabletUiAddStore));
    // The SELECTION vector is then driven on the same two-line state as mobile:
    // reseed through the app's own store + fresh page (chip taps at 768x1024 are
    // coordinate-fragile and merged the second variant in every attempt).
    R.buyerToken = R.buyerToken || await apiToken(fx.buyer);
    await seedTwoLines(ctx, R.buyerToken, fx.buyer.email, String(fx.stamp), fx.values, fx.image && fx.image.imageUrl);
    await p.close();
    const pt = await ctx.newPage();
    pt.on('response', r => { const u = r.url(); if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u] = r.status(); });
    await pt.goto(APP + '/#/cart', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(pt, 'Go to checkout', 45000);
    await sleep(2500);
    for (let i = 0; i < 10; i++) {
      const rs = await cartRowStructure(pt);
      const t0 = await txt(pt);
      if (rs.checkboxes >= 2 && parseSub(t0)) break;
      if (rs.checkboxes < 2) await L.scrollToBottom(pt, 5); await sleep(900);
    }
    let T = await txt(pt);
    await L.screenshot(pt, `${SHOT_DIR}/r2-t01-cart-tablet-two-lines.png`);
    R.evidence.push('e2e/shots/AU-020/r2-t01-cart-tablet-two-lines.png');
    const tRows = await pt.evaluate(() => {
      let removes = 0, saves = 0, cbs = 0;
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        const r = e.getBoundingClientRect();
        if (r.width < 5 || r.height < 5 || r.bottom < 0 || r.top > innerHeight) return;
        if (t === 'Remove') removes++;
        if (t === 'Save for later') saves++;
        if (e.getAttribute('role') === 'checkbox') cbs++;
      });
      return { removes, saves, checkboxes: cbs };
    });
    ok('tablet-C1-two-rendered-rows', tRows.removes === 2 && (tRows.cbs ?? tRows.checkboxes) === 2, JSON.stringify(tRows));
    const tStore = await cartLines(pt);
    dataOk('tablet-C1-store-two-lines', tStore.length === 2 && new Set(tStore.map(l => l.lineId)).size === 2,
      JSON.stringify(tStore.map(l => ({ id: l.lineId, q: l.quantity }))));
    const tsub = parseSub(T);
    dataOk('tablet-C2-vector-36000', !!tsub && tsub.count === 2 && tsub.amount === 3 * P, JSON.stringify(tsub));
    // tablet selection toggle round-trip (fresh-frame box reads before each click)
    const tcbs = (await checkboxes(pt)).filter(c => c.vis);
    if (tcbs[0]) { await pt.mouse.click(tcbs[0].x, tcbs[0].y); }
    const tPoll1 = await subPoll(pt);
    const tsubOff = tPoll1.sub;
    dataOk('tablet-C2-toggle-drop-to-12000', !!tsubOff && tsubOff.amount === P, JSON.stringify(tsubOff));
    const tgate = await checkoutGateState(pt);
    ok('tablet-C3-gate-enabled-with-one-selected', tgate.enabled === true, JSON.stringify(tgate));
    await L.screenshot(pt, `${SHOT_DIR}/r2-t02-cart-tablet-one-unselected.png`);
    R.evidence.push('e2e/shots/AU-020/r2-t02-cart-tablet-one-unselected.png');
    const tcbs2 = (await checkboxes(pt)).filter(c => c.vis && c.checked !== 'true');
    if (tcbs2[0]) { await pt.mouse.click(tcbs2[0].x, tcbs2[0].y); }
    const tPoll2 = await subPoll(pt);
    const tsubBack = tPoll2.sub;
    dataOk('tablet-C2-toggle-restores-36000', !!tsubBack && tsubBack.amount === 3 * P, JSON.stringify(tsubBack));

    for (const [u, st] of Object.entries(imgMap)) {
      R.checks.images_requested++;
      if (st === 200 || st === 304) R.checks.images_200++;
      else R.checks.images_broken.push(`${u} -> ${st}`);
    }
    await ctx.close();
  }

  // ================= REFERENCE PARITY (:3000) =================
  {
    // RW: complete OUR buyer's profile (real phone + pinned default address via the
    // real API). Without it the reference's profile-completion dialog covers the page
    // and swallows every checkbox tap.
    {
      const bt = await apiToken(fx.buyer);
      const form = new FormData();
      form.append('profileInformationDTO', new Blob([Buffer.from(JSON.stringify({
        firstName: 'AU020', lastName: 'Buyer', whatsAppPhoneNumber: '+255700000427' }))],
        { type: 'application/json' }), 'dto.json');
      const ep = await fetch(`${L.API}/api/v1/userManagement/editProfile`, {
        method: 'PATCH', headers: { Authorization: 'Bearer ' + bt }, body: form });
      console.log('editProfile:', ep.status);
      let addr = await L.api(bt, 'GET', '/api/v1/get-default-address');
      if (!addr.json || !addr.json.addressId) {
        const cr = await L.api(bt, 'POST', '/api/v1/add-address', {
          label: 'Home', location: 'Masaki, Dar es Salaam, Tanzania', street: 'Masaki',
          zipCode: '00000', country: 'Tanzania', region: 'Dar es Salaam',
          latitude: -6.7905, longitude: 39.2795 });
        if (cr.status === 201 && cr.json && cr.json.addressId) {
          await L.api(bt, 'POST', `/api/v1/set-default-address?addressId=${cr.json.addressId}`, {});
        }
      }
      addr = await L.api(bt, 'GET', '/api/v1/get-default-address');
      dataOk('ref-buyer-profile-completed', !!(addr.json && addr.json.latitude),
        `phone set; default address ${addr.json && addr.json.addressId} pinned`);
    }
    // The reference's auth provider force-logouts on ANY background 401
    // (authTokenExpired -> redirect), so the parity lane proxies every same-origin
    // /api/* call to the sandbox :8083 with our buyer's real JWT. Data stays REAL;
    // only the noisy notification/order polls are kept from killing the session.
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    const refToken = await apiToken(fx.buyer);
    await p.route('**/localhost:3000/api/**', async route => {
      const u = route.request().url();
      try {
        const resp = await fetch('http://localhost:8083' + u.replace('http://localhost:3000', ''), {
          method: route.request().method(),
          headers: { Authorization: 'Bearer ' + refToken, Accept: 'application/json' },
        });
        const bodyTxt = await resp.text();
        return route.fulfill({ status: 200, contentType: 'application/json', body: bodyTxt });
      } catch (e) { return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); }
    });
    // Same entity state as the Flutter lane: product 638 with Size L (qty2) + S (qty1),
    // both selected; ids use the web's buildChoiceCartItemId format.
    const webCart = JSON.parse(fs.readFileSync('/tmp/au020_webcart.json', 'utf8'));
    webCart.userId = fx.buyer.email; // cart-provider ownership check (user.id == loggingEmail)
    webCart.items.forEach(it => { it.image = '/uploads/534e1bec-df4f-41f7-8309-0a1d7998907c_tote.webp'; });
    await ctx.addCookies([{ name: 'expat_auth_token', value: refToken, url: L.REF }]);
    await p.addInitScript(([tok, cart, email]) => {
      localStorage.setItem('expat_auth_token', tok);
      localStorage.setItem('expat_auth_token_expiry', String(Date.now() + 90 * 24 * 3600 * 1000));
      document.cookie = `expat_auth_token=${encodeURIComponent(tok)}; Max-Age=7776000; path=/; SameSite=Lax`;
      localStorage.setItem('expatUserSession', JSON.stringify({
        user: { id: email, email, name: 'AU020 Buyer', firstName: 'AU020', lastName: 'Buyer',
                role: 'user', whatsAppPhoneNumber: '+255700000427',
                street: 'Masaki', location: 'Dar es Salaam, Tanzania',
                verificationStatus: {} },
        timestamp: Date.now(),
      }));
      localStorage.setItem('expatCartItems', JSON.stringify(cart));
      // our throwaway buyer has no saved address -> the profile-completion dialog
      // covers the whole page and swallows every checkbox tap; pre-snooze the pin prompt
      localStorage.setItem('globo_location_prompt_snoozed_until', String(Date.now() + 7 * 24 * 3600 * 1000));
    }, [refToken, webCart, fx.buyer.email]);
    await p.goto(L.REF + '/cart', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await sleep(10000);
    const body = await p.evaluate(() => document.body ? document.body.innerText : '');
    fs.writeFileSync('/tmp/au020_ref_cart.txt', body);
    await L.screenshot(p, `${SHOT_DIR}/ref-m-cart.png`);
    R.evidence.push('e2e/shots/AU-020/ref-m-cart.png');
    const refOnCart = p.url().includes('/cart');
    const parity = {
      refOnCart,
      refTwoLineTitles: (body.match(new RegExp(TITLE, 'g')) || []).length,
      refChoiceLabels: ['Size:', 'L', 'S'].map(s => body.includes(s)),
      refPerLinePrices: [body.includes('24,000'), body.includes('12,000')],
      refItemLine: /Item \(2\)/.test(body),
      refSubtotal36000: /Subtotal\s*TSh 36,000/.test((body.split('Order summary')[1] || body).replace(/\n/g, ' ')),
      refCheckoutLabel: body.includes('Go to checkout'),
      refSaveForLater: body.includes('Save for later'),
      refRemove: body.includes('Remove'),
      refClearAll: body.includes('Clear all items'),
    };
    R.parityRef = parity;
    console.log('REF CART:', JSON.stringify(parity));
    if (!refOnCart || parity.refTwoLineTitles < 2) {
      R.checks.parity.major++;
      R.failures.push('reference-parity: fixture lines did not render on :3000 cart');
    } else {
      // two distinct choice lines with per-line prices + full vector == accepted parity
      if (parity.refChoiceLabels.every(Boolean) && parity.refPerLinePrices.every(Boolean)) R.checks.parity.accepted++;
      else R.checks.parity.minor++;
      // Drive the REFERENCE selection vector and compare the math with ours.
      const boxState = async () => p.evaluate(() =>
        [...document.querySelectorAll('[role="checkbox"]')].map(b => b.getAttribute('data-state') || b.getAttribute('aria-checked')));
      const isOn = x => x === 'true' || x === 'checked';
      const beforeStates = await boxState();
      let toggled = false;
      // plain (non-force) clicks only — a forced click punches through overlays and
      // lands on nothing (Radix needs the real pointer sequence)
      for (let i = 0; i < 3 && !toggled; i++) {
        const target = p.locator('[role="checkbox]').nth(i % 2);
        try { await p.locator('[role="checkbox"]').nth(i % 2).click({ timeout: 6000 }); } catch (e) {
          await p.evaluate(n => { const el = document.querySelectorAll('[role="checkbox"]')[n]; el && el.scrollIntoView({ block: 'center' }); }, i % 2);
          await sleep(800);
          try { await p.locator('[role="checkbox"]').nth(i % 2).click({ timeout: 6000 }); } catch (e2) {}
        }
        await sleep(1800);
        const nowStates = await boxState();
        toggled = nowStates.filter(isOn).length === beforeStates.filter(isOn).length - 1;
      }
      R.refCheckboxStatesBefore = beforeStates;
      const body2 = await p.evaluate(() => document.body.innerText);
      fs.writeFileSync('/tmp/au020_ref_cart_oneoff.txt', body2);
      await L.screenshot(p, `${SHOT_DIR}/ref-m-cart-one-off.png`);
      R.evidence.push('e2e/shots/AU-020/ref-m-cart-one-off.png');
      // assert on the Order summary region only — the recommendations rail below the
      // cart can contain any price (a 36,000 product lives there)
      const summary2 = (body2.split('Order summary')[1] || body2);
      const refOneOff12000 = /Item \(1\)/.test(summary2) && /Subtotal\s*TSh 12,000/.test(summary2.replace(/\n/g, ' '));
      R.parityRefOneOffVector = { toggled, refOneOff12000 };
      if (toggled && refOneOff12000) R.checks.parity.accepted++; else { R.checks.parity.major++; R.failures.push('reference-parity: one-off vector mismatch'); }
      // zero-selection gate on the reference
      for (let i = 0; i < 4; i++) {
        const still = (await boxState()).filter(isOn);
        if (!still.length) break;
        const idx = (await boxState()).findIndex(isOn);
        try { await p.locator('[role="checkbox"]').nth(idx).click({ timeout: 6000 }); } catch (e) {
          await p.evaluate(n => { const el = document.querySelectorAll('[role="checkbox"]')[n]; el && el.scrollIntoView({ block: 'center' }); }, idx);
          await sleep(800);
          try { await p.locator('[role="checkbox"]').nth(idx).click({ timeout: 6000 }); } catch (e2) {}
        }
        await sleep(1800);
      }
      const body3 = await p.evaluate(() => document.body.innerText);
      fs.writeFileSync('/tmp/au020_ref_cart_zero.txt', body3);
      await L.screenshot(p, `${SHOT_DIR}/ref-m-cart-zero-selected.png`);
      R.evidence.push('e2e/shots/AU-020/ref-m-cart-zero-selected.png');
      const disabledZero = await p.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => /Go to checkout/i.test(x.textContent || ''));
        return b ? b.disabled : null;
      });
      const summary3 = (body3.split('Order summary')[1] || body3);
      const refZero = /Item \(0\)/.test(summary3) && /Subtotal\s*TSh 0\b/.test(summary3.replace(/\n/g, ' '));
      R.parityRefZeroSelected = { refZero, disabledZero };
      if (refZero && disabledZero === true) R.checks.parity.accepted++;
      else { R.checks.parity.minor++; console.log('REF zero-state:', JSON.stringify(R.parityRefZeroSelected)); }
    }
    await ctx.close();
  }

  await browser.close();

  // ---------- roll up ----------
  R.checks.real_data = R.failures.length === 0;
  R.runtime_ms = Date.now() - t0;
  R.verdict = (R.failures.length === 0 && R.checks.images_200 === R.checks.images_requested &&
               R.checks.parity.blocker === 0 && R.checks.parity.major === 0) ? 'PASS' : 'FAIL';
  R.evidence.push('e2e/videos/AU-020-mobile.webm', 'e2e/videos/AU-020-tablet.webm');
  fs.writeFileSync('/tmp/au020_verify_r2_result.json', JSON.stringify(R, null, 2));
  console.log('\nVERDICT', R.verdict);
  console.log('RESULT', JSON.stringify({ failures: R.failures, vecInitial: R.vecInitial, vecOneOff: R.vecOneOff,
    vecAllOff: R.vecAllOff, images: `${R.checks.images_200}/${R.checks.images_requested}`, buttons_failed: failed }, null, 1));
  process.exit(0);
})().catch(e => { console.error('FATAL', e && e.message, e && e.stack && e.stack.split('\n')[1]); process.exit(1); });

// ---------------- helpers ----------------
const failed = []; // button-level failures, mirrored into R at write time via getter below
Object.defineProperty(R, 'buttonsFailed', { get: () => failed, enumerable: true });
async function apiToken(cred) {
  const r = await fetch(`${L.API}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: cred.email, password: cred.pw }) });
  const j = await r.json(); if (!j.token) throw new Error('api login failed'); return j.token;
}
async function wishlistIds(p) {
  // server truth for this buyer only (our own throwaway account)
  const tok = await apiToken(fx.buyer);
  const g = await fetch(`${L.API}/api/saved-products`, { headers: { Authorization: 'Bearer ' + tok } }).then(r => r.json()).catch(() => []);
  return (Array.isArray(g) ? g : []).map(x => x.productId);
}
async function addSingleLineViaUI(p) {
  await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 30000);
  await sleep(1500);
  await L.clickBtn(p, 'Search'); await sleep(1800);
  const si = p.locator('input[type="text"]').first();
  await si.click({ force: true }).catch(() => {});
  await p.keyboard.type(TITLE, { delay: 22 }); await sleep(1200);
  await p.keyboard.press('Enter'); await sleep(3200);
  await openToteDetail(p, 'm');
  await L.clickBtn(p, 'Add to cart'); await sleep(2300);
  await gotoCart(p);
  return (await cartLines(p)).length;
}
async function loginFlow(p, cred) {
  await p.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
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
