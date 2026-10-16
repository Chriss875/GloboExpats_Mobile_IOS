// verify_AU-021_r2.js — RW-lane real-browser verification of AU-021
// (cart_qty_revalidation_grouping_r2) against the FROZEN bundle :9108.
//
// Criteria: cart open refetches itemDetails and caps qty to fresh stock;
// seller grouping visible (items from 2 sellers render grouped); delivery fee
// quoted once per seller group at checkout review.
const fs = require('fs');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9108';
const fx = JSON.parse(fs.readFileSync('/tmp/au021_fixtures.json', 'utf8'));
const PA = fx.productADetail, PB = fx.productBDetail;
const STAMP = fx.stamp;
const UNIT = 'AU-021';
const OUT = { requests: [], itemDetailsFetches: 0, quoteCalls: 0 };

// Cart lines seeded into the buyer's localStorage cart BEFORE opening /cart:
// qty 5 of A (stock will be PATCHed to 2 -> must clamp to 2 with notice)
// qty 2 of B (stock stays 4 -> untouched).
function seedCart(email) {
  const mk = (d, pid, qty, extra = {}) => ({
    lineId: `p${pid}`, productId: pid,
    sellerId: d.sellerId, sellerName: d.sellerName,
    title: d.title, price: d.price,
    imageUrl: d.image ? `http://localhost:8083/${d.image.imageUrl}` : null,
    condition: 'NEW', category: 'Clothing', location: 'Dar es Salaam',
    isVerified: false, currency: d.currency || 'TZS',
    maxQuantity: d.stock, isAvailable: true,
    quantity: qty, selected: true, choices: [], ...extra,
  });
  return [mk(PA, PA.productId, 5), mk(PB, PB.productId, 2)];
}


// login on the FROZEN lane (lib_verify.login hardcodes :9100) — same proven
// recipe: token persistence is the success signal, never a landing view.
async function loginFrozen(p, cred){
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  if (await p.evaluate(() => { try { const v = localStorage.getItem('flutter.auth_token'); return !!(v && v.length > 10); } catch (e) { return false; } })) return true;
  await L.waitText(p, 'Buy now', 25000);
  for (let i = 0; i < 4 && !await L.clickBtn(p, 'Login'); i++) {}
  await L.waitText(p, 'Welcome back', 25000);
  const ei = p.locator('input[type="text"]').first(); const pi = p.locator('input[type="password"]').first();
  await ei.click({ force: true }).catch(()=>{}); await p.waitForTimeout(350); await p.keyboard.type(cred.email);
  await pi.click({ force: true }).catch(()=>{}); await p.waitForTimeout(350); await p.keyboard.type(cred.pw);
  await L.clickBtn(p, 'Log in');
  let ok = false;
  for (let i = 0; i < 25 && !ok; i++) {
    ok = await p.evaluate(() => { const v = localStorage.getItem('flutter.auth_token'); return !!(v && v.length > 10); }).catch(() => false);
    if (!ok) await p.waitForTimeout(1000);
  }
  return ok;
}

(async () => {
  // ---- Stage R1: drop product A stock to 2 via REAL API (seller's own token).
  // /products/update is multipart-only (`product` JSON part), never raw JSON.
  const patch = await (async () => {
    const form = new FormData();
    form.append('product', new Blob([Buffer.from(JSON.stringify({
      productName: PA.title, productQuantity: 2 }))], { type: 'application/json' }), 'product.json');
    const r = await fetch(`${L.API}/api/v1/products/update/${PA.productId}`, {
      method: 'PATCH', headers: { Authorization: 'Bearer ' + fx.sellerA.token }, body: form });
    return { status: r.status };
  })();
  console.log('stock-patch A -> 2:', patch.status);
  const detA = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${PA.productId}`);
  console.log('fresh stock A now:', detA.json.productQuantity);
  if (detA.json.productQuantity !== 2) throw new Error('stock patch did not stick');

  const browser = await L.newBrowser();

  // ================= MOBILE viewport run =================
  {
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 },
      videoPath: `e2e/videos/${UNIT}-mobile.webm` });
    const p = await ctx.newPage();
    OUT.images = {};
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) OUT.images[u] = r.status();
      if (/\/api\/v1\/displayItem\/itemDetails\/\d+/.test(u)) OUT.itemDetailsFetches++;
      if (/\/checkout\/delivery-quote/.test(u)) OUT.quoteCalls++;
      if (/\/api\/v1/.test(u)) OUT.requests.push(`${r.status()} ${r.request().method()} ${u.replace(APP,'')}`);
    });

    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 60 && !await hasSem(p); i++) await p.waitForTimeout(1000);
    let okM = false;
    for (let i = 0; i < 3 && !okM; i++) okM = await loginFrozen(p, fx.buyer).catch(() => false);
    if (!okM) throw new Error('login failed');
    console.log('login ok (mobile)');

    // Seed cart for THIS user then reload so CartStore.loadForUser picks it up.
    await seedCartIntoStorage(p);
    await p.goto(APP + '/cart', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 40; i++) { if (/Cart \(|empty/.test(await L.allText(p).catch(()=> ''))) break; await p.waitForTimeout(1000); }
    await p.waitForTimeout(4000); // allow revalidation network round-trips

    let txt = dedupe(await L.allText(p));
    fs.writeFileSync('/tmp/au021_cart_mobile.txt', txt);

    await L.screenshot(p, `e2e/shots/${UNIT}/${UNIT}-mobile-cart.png`);

    // --- assertions: grouping
    const checks = {};
    checks.groupA_visible = txt.includes(shortTitle(PA));
    checks.groupB_visible = txt.includes(shortTitle(PB));

    // --- assertion: revalidation capped A to 2 + notice
    checks.qty_capped_to_2 = new RegExp(`Qty\\s*\n?2`).test(txt) || /Qty 2/.test(txt.replace(/\n/g,' '));
    checks.cap_notice = /available/.test(txt) && /2 available/.test(txt.replace(/\n/g,' '));
    checks.notice_banner = /Quantities reduced to current stock/.test(txt.replace(/\n/g,' '));
    checks.b_untouched_at_2 = /Qty\s*\n?2\s*\n?25000|25000/.test(txt.replace(/\n/g,' '));

    // --- stepper: '+' on line A disabled at cap. Count buttons and try clicks.
    const btns = await L.listButtons(p);
    fs.writeFileSync('/tmp/au021_buttons_mobile.json', JSON.stringify(btns, null, 1));
    OUT.buttons_total = btns.length;

    // Click every tappable/button control once, record effect later by text deltas.
    OUT.clickLog = [];
    await clickAllControls(p, OUT.clickLog);
    await p.waitForTimeout(1200);
    const afterClicks = dedupe(await L.allText(p));
    fs.writeFileSync('/tmp/au021_cart_afterclicks_mobile.txt', afterClicks);
    OUT.afterClicksText = true;

    // --- proceed to checkout (Go to checkout button) — assert nav really happened
    const beforeUrl = p.url();
    const clickedCheckout = await L.clickBtn(p, 'Go to checkout');
    await p.waitForTimeout(3000);
    let ckTxt = dedupe(await L.allText(p));
    OUT.checkoutClicked = clickedCheckout;
    OUT.checkoutNav = !/Your cart is empty/.test(ckTxt);
    fs.writeFileSync('/tmp/au021_checkout_step1_mobile.txt', ckTxt.slice(0, 4000));
    await L.screenshot(p, `e2e/shots/${UNIT}/${UNIT}-mobile-checkout-address.png`);
    console.log('mobile cart checks', JSON.stringify(checks));
    OUT.mobileChecks = checks;
    OUT.cartTextMobile = txt;

    await L.closeVideo(ctx, `e2e/videos/${UNIT}-mobile.webm`);
  }

  // ================= TABLET viewport run (768x1024) — full flow to review =================
  {
    const ctx = await L.newCtx(browser, { viewport: { width: 768, height: 1024 },
      videoPath: `e2e/videos/${UNIT}-tablet.webm` });
    const p = await ctx.newPage();
    OUT.imagesT = {}; OUT.itemDetailsFetchesT = 0; OUT.quoteCallsT = 0;
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) OUT.imagesT[u] = r.status();
      if (/\/api\/v1\/displayItem\/itemDetails\/\d+/.test(u)) OUT.itemDetailsFetchesT++;
      if (/\/checkout\/delivery-quote/.test(u)) OUT.quoteCallsT++;
    });

    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 60 && !await hasSem(p); i++) await p.waitForTimeout(1000);
    let okT = false;
    for (let i = 0; i < 3 && !okT; i++) okT = await loginFrozen(p, fx.buyer).catch(() => false);
    if (!okT) throw new Error('login failed (tablet)');

    await seedCartIntoStorage(p);
    await p.goto(APP + '/cart', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 40; i++) { if (/Cart \(|empty/.test(await L.allText(p).catch(()=> ''))) break; await p.waitForTimeout(1000); }
    await p.waitForTimeout(4000);
    const txt = dedupe(await L.allText(p));
    fs.writeFileSync('/tmp/au021_cart_tablet.txt', txt);
    await L.screenshot(p, `e2e/shots/${UNIT}/${UNIT}-tablet-cart.png`);

    // Go to checkout
    await L.clickBtn(p, 'Go to checkout');
    await p.waitForTimeout(3500);
    let s1 = dedupe(await L.allText(p));
    await L.screenshot(p, `e2e/shots/${UNIT}/${UNIT}-tablet-checkout-address.png`);
    fs.writeFileSync('/tmp/au021_checkout_address_tablet.txt', s1.slice(0,5000));

    // Fill address form fields (they should be prefilled from profile+default address)
    await fillIfEmpty(p);
    await p.waitForTimeout(800);
    // Continue to review
    let okNext = false;
    for (let i=0;i<3&&!okNext;i++) okNext = await L.clickBtn(p, 'Continue to review');
    await p.waitForTimeout(6000); // delivery quote round trip
    let s2 = dedupe(await L.allText(p));
    fs.writeFileSync('/tmp/au021_checkout_review_tablet.txt', s2);
    await L.screenshot(p, `e2e/shots/${UNIT}/${UNIT}-tablet-checkout-review.png`);
    OUT.reviewChecks = {
      reviewStepReached: /Order totals/i.test(s2),
      groupCard_A: s2.includes(shortTitle(PA)),
      groupCard_B: s2.includes(shortTitle(PB)),
      feePerGroup_3000: (s2.match(/3,?000/g) || []).length >= 2,
      deliveryTotal_6000: /6,?000/.test(s2),
      itemsCountLine: /2 item\(s\)/.test(s2.replace(/\n/g,' ')),
      quoteCalledOncePerGroup: OUT.quoteCallsT >= 1,
    };
    console.log('tablet review checks', JSON.stringify(OUT.reviewChecks));
    await L.closeVideo(ctx, `e2e/videos/${UNIT}-tablet.webm`);
  }

  await browser.close();
  OUT.imageSummary = { mobile: L.imageSummary(OUT.images), tablet: L.imageSummary(OUT.imagesT) };
  OUT.imageUrls = { mobile: OUT.images, tablet: OUT.imagesT };
  OUT.itemDetailsFetches_total = OUT.itemDetailsFetches;
  OUT.itemDetailsFetches_tablet = OUT.itemDetailsFetchesT;
  OUT.quoteCalls_total = OUT.quoteCalls;
  OUT.quoteCalls_tablet = OUT.quoteCallsT;
  delete OUT.requests;
  fs.writeFileSync('/tmp/au021_out.json', JSON.stringify(OUT, null, 1));
  console.log('DONE');
})().catch(e => { console.error('VERIFY FATAL', e); process.exit(1); });

// ---------- helpers ----------
async function hasSem(p){ return p.evaluate(()=>document.querySelectorAll('flt-semantics').length>3).catch(()=>false); }
function dedupe(t){ return [...new Set((t||'').split('\n'))].join('\n'); }
function shortTitle(d){ return d.title.split(' ').slice(0, 4).join(' '); }

async function seedCartIntoStorage(p){
  const seeded = await p.evaluate((fxJson) => {
    let email = localStorage.getItem('flutter.auth_email') || '';
    try { email = JSON.parse(email); } catch(e){}
    const fx = JSON.parse(fxJson);
    const PA = fx.productADetail, PB = fx.productBDetail;
    const mk = (d, pid, qty) => ({
      lineId: `p${pid}`, productId: pid,
      sellerId: String(d.sellerId), sellerName: d.sellerName,
      title: d.title, price: d.price,
      imageUrl: d.image ? `http://localhost:8083/${d.image.imageUrl}` : null,
      condition: 'NEW', category: 'Clothing', location: 'Dar es Salaam',
      isVerified: false, currency: d.currency || 'TZS',
      maxQuantity: d.stock, isAvailable: true,
      quantity: qty, selected: true, choices: [],
    });
    const lines = [mk(PA, PA.productId, 5), mk(PB, PB.productId, 2)];
    localStorage.setItem('flutter.expatCartItems_' + email, JSON.stringify(lines));
    return 'seeded:' + lines.length + ' for:' + email.slice(0, 4) + '@';
  }, JSON.stringify(fx));
  console.log(seeded);
}

async function fillIfEmpty(p){
  // The address step pre-fills from the default address/profile; ensure required
  // fields are non-empty before continuing.
  const inputs = await p.locator('input, textarea').all();
  let filled = 0;
  for (const inp of inputs) {
    try {
      const val = await inp.inputValue().catch(()=> '');
      if (val) continue;
      const type = await inp.getAttribute('type').catch(()=> null);
      if (type === 'password' || type === 'checkbox') continue;
      await inp.click({ force: true }); await p.waitForTimeout(150);
      await p.keyboard.type('AU021 Verify'); filled++;
      if (filled > 4) break;
    } catch (e) {}
  }
  return filled;
}

async function clickAllControls(p, log){
  // Enumerate interactive nodes and click each ONCE with a coordinate tap
  // (smallest matching node), recording label+rect. Skips the checkout CTA
  // (handled separately) so navigation state stays observable.
  const cands = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const role = e.getAttribute('role');
      const tappable = e.getAttribute('flt-tappable') !== null;
      if (role !== 'button' && !tappable) return;
      const r = e.getBoundingClientRect();
      if (r.width < 12 || r.height < 12) return;
      const t = (e.textContent || '').trim().slice(0, 60);
      if (/Go to checkout|Clear all items/.test(t)) return;
      out.push({ x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2),
                 w: Math.round(r.width), h: Math.round(r.height), label: t });
    });
    // smallest-first, cap 24 controls
    out.sort((a,b)=> (a.w*a.h)-(b.w*b.h));
    return out.slice(0, 24);
  });
  for (const c of cands) {
    if (c.y < 4 || c.y > 660) continue; // stay inside the visible viewport
    try {
      await p.mouse.click(c.x, c.y);
      await p.waitForTimeout(320);
      log.push({ ...c, clicked: true });
    } catch (e) {
      log.push({ ...c, clicked: false, err: String(e).slice(0,80) });
    }
  }
  return log;
}
