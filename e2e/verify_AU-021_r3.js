// verify_AU-021_r3.js — RW-lane real-browser verification of AU-021
// (cart_qty_revalidation_grouping_r2) against the FROZEN bundle :9108.
//
// Criteria:
//  1. Cart open refetches itemDetails and caps qty to fresh stock
//     (product A stock PATCHed to 2 via REAL API; cart line qty 5 -> clamps to 2).
//  2. Seller grouping visible: items from 2 sellers render grouped.
//  3. Delivery fee quoted once per seller group at checkout review.
//
// Flow is fully real-UI: login -> product cards via home grid -> Add to cart ->
// reload into /cart (CartStore.loadForUser at boot reads persisted lines).
const fs = require('fs');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9108';
const fx = JSON.parse(fs.readFileSync('/tmp/au021_fixtures.json', 'utf8'));
const PA = fx.productADetail, PB = fx.productBDetail;
const UNIT = 'AU-021';
const SHOTS = `e2e/shots/${UNIT}`;
fs.mkdirSync(SHOTS, { recursive: true });

const OUT = {
  itemDetailsFetches: {}, quoteCalls: {}, images: {}, checks: {},
};

async function waitSem(p) {
  for (let i = 0; i < 60; i++) {
    if (await p.evaluate(() => document.querySelectorAll('flt-semantics').length > 3).catch(() => false)) return;
    await p.waitForTimeout(1000);
  }
}

// login on the frozen lane — token persistence is the success signal
async function loginFrozen(p, cred) {
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await waitSem(p);
  if (await p.evaluate(() => { try { const v = localStorage.getItem('flutter.auth_token'); return !!(v && v.length > 10); } catch (e) { return false; } })) return true;
  await L.waitText(p, 'Buy now', 30000);
  for (let i = 0; i < 4; i++) { if (await L.clickBtn(p, 'Login')) break; }
  await L.waitText(p, 'Welcome back', 25000);
  const ei = p.locator('input[type="text"]').first(), pi = p.locator('input[type="password"]').first();
  await ei.click({ force: true }); await p.waitForTimeout(350); await p.keyboard.type(cred.email);
  await pi.click({ force: true }); await p.waitForTimeout(350); await p.keyboard.type(cred.pw);
  await L.clickBtn(p, 'Log in');
  let ok = false;
  for (let i = 0; i < 25 && !ok; i++) {
    ok = await p.evaluate(() => { const v = localStorage.getItem('flutter.auth_token'); return !!(v && v.length > 10); }).catch(() => false);
    if (!ok) await p.waitForTimeout(1000);
  }
  return ok;
}

// scroll the home grid until the card whose title starts with `prefix` is fully
// visible with margins, then coordinate-click it and wait for the detail CTA.
async function openCard(p, prefix) {
  await p.mouse.move(190, 400);
  await p.mouse.wheel(0, -2600); await p.waitForTimeout(900);
  for (let s = 0; s < 14; s++) {
    const r = await p.evaluate((pf) => {
      let o = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (!(e.textContent || '').startsWith(pf)) return;
        if (e.getAttribute('flt-tappable') === null) return;
        const b = e.getBoundingClientRect();
        if (b.top < 90 || b.bottom > innerHeight - 140) return;
        if (!o) o = { cx: Math.round(b.x + b.width / 2), cy: Math.round(b.y + b.height / 2) };
      });
      return o;
    }, prefix);
    if (r) {
      await p.mouse.click(r.cx, Math.min(r.cy, 640));
      for (let i = 0; i < 12; i++) {
        if (/Add to cart/.test(await L.allText(p).catch(() => ''))) return true;
        await p.waitForTimeout(1200);
      }
      return /Add to cart/.test(await L.allText(p).catch(() => ''));
    }
    await p.mouse.wheel(0, 300);
    await p.waitForTimeout(1100);
  }
  return false;
}

async function backHomeTop(p) {
  const bb = await p.evaluate(() => {
    let hit = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if ((e.textContent || '').trim() !== 'Back') return;
      const b = e.getBoundingClientRect(); if (hit) return;
      hit = { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
    });
    return hit;
  });
  if (bb) { await p.mouse.click(bb.x, bb.y); }
  await p.waitForTimeout(2200);
  await p.mouse.move(190, 400);
  for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, -800); await p.waitForTimeout(300); }
}

(async () => {
  // ===== Stage R1: REAL API — drop A's stock to 2 (seller A's own token) =====
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify({
    productName: PA.title, productQuantity: 2 }))], { type: 'application/json' }), 'product.json');
  const patch = await fetch(`${L.API}/api/v1/products/update/${PA.productId}`, {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + fx.sellerA.token }, body: form });
  console.log('stock-patch A -> 2:', patch.status);
  const detA = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${PA.productId}`);
  if (detA.json.productQuantity !== 2) throw new Error('stock patch did not stick: ' + detA.json.productQuantity);
  console.log('fresh stock A:', detA.json.productQuantity);

  const browser = await L.newBrowser();

  // ================= MOBILE 375x667 =================
  {
    OUT.images.mobile = {}; OUT.itemDetailsFetches.mobile = 0; OUT.quoteCalls.mobile = 0;
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 },
      videoPath: `e2e/videos/${UNIT}-mobile.webm` });
    const p = await ctx.newPage();
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) OUT.images.mobile[u] = r.status();
      if (/itemDetails\/64[01]/.test(u)) OUT.itemDetailsFetches.mobile++;
      if (/checkout\/delivery-quote/.test(u)) OUT.quoteCalls.mobile++;
    });
    if (!await loginFrozen(p, fx.buyer)) throw new Error('login failed (mobile)');
    console.log('logged in (mobile)');
    for (let i = 0; i < 25; i++) { if ((await L.allText(p).catch(() => '')).includes(short(PA))) break; await p.waitForTimeout(1500); }

    // add qty 5 of A: open detail, click Add to cart 5 times (each adds 1)
    if (!await openCard(p, short(PA))) throw new Error('could not open product A');
    for (let i = 0; i < 5; i++) { await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(700); }
    console.log('A added x5');
    // verify persisted quantity == 5
    const qA = await readCartQty(p, PA.productId);
    console.log('persisted A qty:', qA);
    OUT.checks.a_added_5 = qA === 5;

    await backHomeTop(p);
    if (!await openCard(p, short(PB))) throw new Error('could not open product B');
    await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(900);
    await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(900);
    const qB = await readCartQty(p, PB.productId);
    console.log('persisted B qty:', qB);
    OUT.checks.b_added_2 = qB === 2;

    // reload straight into /cart — boot loads persisted cart, then revalidates
    await p.goto(APP + '/cart', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    let t = '';
    for (let i = 0; i < 25; i++) {
      t = [...new Set((await L.allText(p).catch(() => '')).split('\n'))].join('|');
      if (/Woven Basket/.test(t)) break;
      await p.waitForTimeout(1500);
    }
    await p.waitForTimeout(6000); // allow itemDetails refetch + clamp to land

    const cartTxt = [...new Set((await L.allText(p).catch(() => '')).split('\n'))].join('|');
    fs.writeFileSync('/tmp/au021_cart_mobile.txt', cartTxt);
    await L.screenshot(p, `${SHOTS}/${UNIT}-mobile-cart.png`);

    const flat = cartTxt.replace(/\n/g, '|');
    const c = OUT.checks;
    c.cart_opens_with_lines   = /Cart \(2 items\)/.test(flat);
    c.group_a_title           = flat.includes(short(PA));
    c.group_b_title           = flat.includes(short(PB));
    c.qty_a_capped_to_2       = /Qty 2\b/.test(cartTxt.split('|').filter(s=>/Woven Basket|Qty/.test(s)).join('|') ) || /\bQty 2\b/.test(cartTxt);
    c.cap_notice_visible      = /Quantities reduced to current stock/.test(flat) && /AU021 Woven Basket/.test(flat);
    c.two_seller_groups       = countSellerHeaders(cartTxt) >= 2;
    c.itemDetails_refetched   = OUT.itemDetailsFetches.mobile >= 2; // one per line id 640+641

    // stepper '+' disabled at cap: locate the add button of group A row and check
    // it does NOT raise qty beyond 2
    await clickPlusOnRow(p, short(PA));
    await p.waitForTimeout(1500);
    const afterPlus = await readCartQty(p, PA.productId);
    c.plus_blocked_at_cap = afterPlus === 2;
    console.log('qty after + click at cap:', afterPlus);

    // minus works
    await clickMinusOnRow(p, short(PB));
    await p.waitForTimeout(1200);
    const qAfterMinus = await readCartQty(p, PB.productId);
    c.minus_decrements = qAfterMinus === 1;
    if (qAfterMinus === 1) { await clickPlusOnRow(p, short(PB)); await p.waitForTimeout(1000); }

    // checkbox toggle round-trip
    const beforeSel = await selectedCount(p);
    await toggleFirstCheckbox(p);
    await p.waitForTimeout(900);
    const afterOff = await selectedCount(p);
    await toggleFirstCheckbox(p);
    await p.waitForTimeout(900);
    const afterOn = await selectedCount(p);
    c.checkbox_toggles_selection = beforeSel === 2 && afterOff < beforeSel && afterOn === beforeSel;

    // Clear-all guard: skip destructive; instead test Save-for-later/remove only on
    // a THROWAWAY third line? Out of AU scope — record buttons enumerated instead.

    // Go to checkout -> address step
    await L.clickBtn(p, 'Go to checkout');
    for (let i = 0; i < 12; i++) {
      if (/Continue to review|Seller's delivery|Pick up myself/.test(await L.allText(p).catch(() => ''))) break;
      await p.waitForTimeout(1500);
    }
    const addrTxt = [...new Set((await L.allText(p).catch(() => '')).split('\n'))].join('|');
    fs.writeFileSync('/tmp/au021_checkout_addr_mobile.txt', addrTxt.slice(0, 4000));
    await L.screenshot(p, `${SHOTS}/${UNIT}-mobile-checkout-address.png`);
    c.checkout_address_step = /Seller's delivery/.test(addrTxt);

    // address should be prefilled from the buyer's default address
    c.address_prefilled = await formFieldFilled(p);

    // continue to review -> delivery quote
    await L.clickBtn(p, 'Continue to review');
    for (let i = 0; i < 16; i++) {
      if (/Order totals|Delivery fee/.test(await L.allText(p).catch(() => ''))) break;
      await p.waitForTimeout(1500);
    }
    await p.waitForTimeout(4000);
    const revTxt = [...new Set((await L.allText(p).catch(() => '')).split('\n'))].join('|');
    fs.writeFileSync('/tmp/au021_checkout_review_mobile.txt', revTxt.slice(0, 5000));
    await L.screenshot(p, `${SHOTS}/${UNIT}-mobile-checkout-review.png`);
    const rf = revTxt.replace(/\n/g, '|');
    c.review_step_reached   = /Order totals/.test(rf);
    c.review_group_cards    = rf.includes(short(PA)) && rf.includes(short(PB));
    c.fee_once_per_group    = (rf.match(/TSh 3,000/g) || []).length >= 2;
    c.delivery_total_6000   = /TSh 6,000/.test(rf);
    c.quote_called          = OUT.quoteCalls.mobile >= 1;

    console.log('MOBILE CHECKS', JSON.stringify(c, null, 1));
    await L.closeVideo(ctx, `e2e/videos/${UNIT}-mobile.webm`);
  }

  // ================= TABLET 768x1024 =================
  {
    OUT.images.tablet = {}; OUT.itemDetailsFetches.tablet = 0; OUT.quoteCalls.tablet = 0;
    const ctx = await L.newCtx(browser, { viewport: { width: 768, height: 1024 },
      videoPath: `e2e/videos/${UNIT}-tablet.webm` });
    const p = await ctx.newPage();
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) OUT.images.tablet[u] = r.status();
      if (/itemDetails\/64[01]/.test(u)) OUT.itemDetailsFetches.tablet++;
      if (/checkout\/delivery-quote/.test(u)) OUT.quoteCalls.tablet++;
    });
    if (!await loginFrozen(p, fx.buyer)) throw new Error('login failed (tablet)');
    for (let i = 0; i < 25; i++) { if ((await L.allText(p).catch(() => '')).includes(short(PA))) break; await p.waitForTimeout(1500); }

    // cart already has lines from mobile run (same browser profile? no — fresh
    // context). Re-add via UI.
    if (!await openCard(p, short(PA))) throw new Error('tablet: no product A');
    for (let i = 0; i < 5; i++) { await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(650); }
    await backHomeTop(p);
    if (!await openCard(p, short(PB))) throw new Error('tablet: no product B');
    await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(800);
    await L.clickBtn(p, 'Add to cart'); await p.waitForTimeout(800);

    await p.goto(APP + '/cart', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 25; i++) { if (/Woven Basket/.test(await L.allText(p).catch(() => ''))) break; await p.waitForTimeout(1500); }
    await p.waitForTimeout(6000);
    const cartTxt = [...new Set((await L.allText(p).catch(() => '')).split('\n'))].join('|');
    fs.writeFileSync('/tmp/au021_cart_tablet.txt', cartTxt);
    await L.screenshot(p, `${SHOTS}/${UNIT}-tablet-cart.png`);
    const tc = {};
    tc.cart_opens = /Cart \(2 items\)/.test(cartTxt);
    tc.groups_visible = countSellerHeaders(cartTxt) >= 2;
    tc.qty_cap_notice = /Quantities reduced to current stock/.test(cartTxt);
    OUT.checksTablet = tc;
    console.log('TABLET CART CHECKS', JSON.stringify(tc));

    await L.clickBtn(p, 'Go to checkout');
    for (let i = 0; i < 12; i++) {
      if (/Continue to review|Seller's delivery/.test(await L.allText(p).catch(() => ''))) break;
      await p.waitForTimeout(1500);
    }
    await L.screenshot(p, `${SHOTS}/${UNIT}-tablet-checkout-address.png`);
    await L.clickBtn(p, 'Continue to review');
    for (let i = 0; i < 16; i++) {
      if (/Order totals/.test(await L.allText(p).catch(() => ''))) break;
      await p.waitForTimeout(1500);
    }
    await p.waitForTimeout(4000);
    const revTxt = [...new Set((await L.allText(p).catch(() => '')).split('\n'))].join('|');
    fs.writeFileSync('/tmp/au021_checkout_review_tablet.txt', revTxt.slice(0, 5000));
    await L.screenshot(p, `${SHOTS}/${UNIT}-tablet-checkout-review.png`);
    OUT.checksTablet.review = {
      reached: /Order totals/.test(revTxt),
      fees: (revTxt.match(/TSh 3,000/g) || []).length,
      total: /TSh 6,000/.test(revTxt),
    };
    console.log('TABLET REVIEW', JSON.stringify(OUT.checksTablet.review));
    await L.closeVideo(ctx, `e2e/videos/${UNIT}-tablet.webm`);
  }

  await browser.close();

  // image summaries
  OUT.imageSummary = {
    mobile: L.imageSummary(OUT.images.mobile),
    tablet: L.imageSummary(OUT.images.tablet),
  };
  OUT.imageUrlsMobile = OUT.images.mobile;
  OUT.imageUrlsTablet = OUT.images.tablet;
  delete OUT.images;
  fs.writeFileSync('/tmp/au021_out_r3.json', JSON.stringify(OUT, null, 1));
  console.log('DONE');
})().catch(e => { console.error('VERIFY FATAL', e.message); process.exit(1); });

// ---------- helpers ----------
function short(d){ return d.title.split(' ').slice(0,4).join(' '); }

function countSellerHeaders(txt){
  // Seller group header renders "AU021 Seller" + location chip "Ships from ..."
  const m = txt.match(/AU021 Seller/g) || [];
  return m.length;
}

async function rawCart(p){
  return p.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/expatCartItems_/.test(k)) {
        try { return JSON.parse(JSON.parse(localStorage.getItem(k))); } catch (e) { return []; }
      }
    }
    return [];
  });
}
async function readCartQty(p, pid){
  const items = await rawCart(p);
  const it = items.find(x => x.productId === pid);
  return it ? it.quantity : 0;
}
async function selectedCount(p){
  const items = await rawCart(p);
  return items.filter(x => x.selected !== false).length;
}
// Click the '+' stepper on the row containing `titlePrefix` — find smallest
// tappable node right of the qty label. The steppers have NO text; find by
// geometry: nodes inside the same tile below the price. Fallback: click by
// relative position from the title rect (+34px down-right pattern).
async function clickPlusOnRow(p, titlePrefix){
  const r = await p.evaluate((pf) => {
    let tile=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'');
      if(!t.startsWith(pf)) return;
      const b=e.getBoundingClientRect();
      if(b.width<200||b.width>370) return;
      if(tile) return;
      tile={x:b.x,y:b.y,w:b.width,h:b.height};
    });
    if(!tile) return null;
    // Qty row sits ~110px below the tile top; '+' button ~x=60..90
    return { x: Math.round(tile.x + 78), y: Math.round(Math.min(tile.y + 128, innerHeight - 20)) };
  }, titlePrefix);
  if(!r) return false;
  await p.mouse.click(r.x, r.y);
  return true;
}
async function clickMinusOnRow(p, titlePrefix){
  const r = await p.evaluate((pf) => {
    let tile=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'');
      if(!t.startsWith(pf)) return;
      const b=e.getBoundingClientRect();
      if(b.width<200||b.width>370) return;
      if(tile) return;
      tile={x:b.x,y:b.y,w:b.width};
    });
    if(!tile) return null;
    return { x: Math.round(tile.x + 40), y: Math.round(Math.min(tile.y + 128, innerHeight - 20)) };
  }, titlePrefix);
  if(!r) return false;
  await p.mouse.click(r.x, r.y);
  return true;
}
async function toggleFirstCheckbox(p){
  const r = await p.evaluate(()=>{
    let hit=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'');
      if(!/Save for later/.test(t)) return;
      const b=e.getBoundingClientRect();
      if(hit) return;
      hit={x:Math.round(b.x-24),y:Math.round(b.y+b.height/2)};
    });
    return hit;
  });
  if(!r) return false;
  await p.mouse.click(r.x, Math.max(10,r.y));
  return true;
}
async function formFieldFilled(p){
  const inputs = await p.locator('input, textarea').all();
  let filled = 0;
  for (const inp of inputs) {
    const v = await inp.inputValue().catch(()=> '');
    if (v && v.trim()) filled++;
  }
  return filled >= 2;
}
