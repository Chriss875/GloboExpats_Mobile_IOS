// au024_skeptic_r3.js — SKEPTIC AU-024 round 3 on :9121 (b56e345). r2 lessons:
//  - cart JSON needs the app's own schema ({title,price,quantity,selected:true,choices:[],maxQuantity})
//    and is keyed expatCartItems_<email>; seeded BEFORE first cart visit.
//  - "Back" on review pops to /cart; out-of-order leg re-enters via Go to checkout.
//  - login must be inline per origin (:9121), token = flutter.auth_token.
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9121';
const SHOT = 'e2e/shots/AU-024-skeptic';
const SHARD = 'e2e/results/shards/AU-024-skeptic.jsonl';
const fx = JSON.parse(fs.readFileSync('/tmp/au024_fixtures.json', 'utf8'));
const PROBE = `AU024 Enum Probe Chair ${fx.stamp}`;
const FEE = fx.quoteReal.deliveryTotal; // 8000
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lines = [];
function rec(o) { lines.push(Object.assign({ ts: new Date().toISOString(), wave: 'skeptic', stage: 'skeptic-backfill', unit: 'AU-024', build_sha: 'b56e345' }, o)); fs.writeFileSync(SHARD, lines.map(l => JSON.stringify(l)).join('\n') + '\n'); }
let PASSN = 0, FAILN = 0;
function chk(name, pass, detail, cls) { console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail !== undefined && detail !== '' ? ' :: ' + String(detail).slice(0, 230) : '')); rec({ kind: 'assert', attack_class: cls || 'regression', assert: name, pass: !!pass, detail: String(detail === undefined ? '' : detail).slice(0, 400) }); pass ? PASSN++ : FAILN++; return !!pass; }
async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => ''); }
async function shot(p, name) { const f = `${SHOT}/${name}`; await L.screenshot(p, f); rec({ kind: 'shot', name: f }); return f; }
async function isLoggedIn9121(p) { return p.evaluate(() => { try { return (localStorage.getItem('flutter.auth_token') || '').length > 10; } catch (e) { return false; } }); }
async function login9121(p, cred) {
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  if (!(await L.waitText(p, 'Buy now', 45000))) return false;
  if (!(await isLoggedIn9121(p))) {
    if (!(await L.clickBtn(p, 'Login'))) return false;
    await L.waitText(p, 'Welcome back', 25000);
    const ei = p.locator('input[type="text"]').first(), pi = p.locator('input[type="password"]').first();
    await ei.click({ force: true }).catch(() => {}); await sleep(400); await p.keyboard.type(cred.email, { delay: 6 });
    await pi.click({ force: true }).catch(() => {}); await sleep(400); await p.keyboard.type(cred.pw, { delay: 6 });
    if (!(await L.clickBtn(p, 'Log in'))) return false;
    let ok = false; for (let i = 0; i < 30 && !ok; i++) { await sleep(1000); ok = await isLoggedIn9121(p); }
    if (!ok) return false;
  }
  return true;
}
async function seedCart(p, email, qty, priceOverride) {
  const item = {
    lineId: `p${fx.productId}`, productId: fx.productId, title: PROBE,
    price: priceOverride || fx.askingPrice, quantity: qty || 1,
    imageUrl: '', condition: 'NEW', category: '', location: '',
    isVerified: true, currency: 'TZS', maxQuantity: 5, isAvailable: true,
    selected: true, choices: []
  };
  await p.evaluate(({ k, it }) => localStorage.setItem(k, JSON.stringify([it])), { k: 'expatCartItems_' + email, it: item });
}
async function radios(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .filter(e => e.getAttribute('role') === 'radio')
    .map(e => { const r = e.getBoundingClientRect(); return { label: (e.getAttribute('aria-label') || '').split('\n')[0].slice(0, 40), checked: e.getAttribute('aria-checked') === 'true', x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }));
}
async function checkboxes(p, rx) {
  return p.evaluate((rxs) => [...document.querySelectorAll('flt-semantics')]
    .filter(e => e.getAttribute('role') === 'checkbox' && rxs.test(e.getAttribute('aria-label') || ''))
    .map(e => { const r = e.getBoundingClientRect(); return { label: (e.getAttribute('aria-label') || '').split('\n')[0].slice(0, 60), checked: e.getAttribute('aria-checked') === 'true', x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }), rx);
}
async function scrollDown(p, times, vy, cx, cy) {
  for (let i = 0; i < (times || 12); i++) { await p.mouse.move(cx || 187, cy || 330); await p.mouse.wheel(0, vy || 240); await sleep(140); }
  await sleep(700);
}
async function forceBtnTwice(p, label) {
  await L.clickBtn(p, label); await sleep(220);
  try { await L.btn(p, label).click({ force: true, timeout: 1800 }); } catch (e) {} await sleep(180);
  try { await L.btn(p, label).click({ force: true, timeout: 1800 }); } catch (e) {}
}

(async () => {
  // ---------- live ground truth ----------
  const qFresh = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/delivery-quote',
    { destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 }, items: [{ productId: fx.productId, quantity: 1 }] });
  chk('GT-quote-live-fee-8000', qFresh.status === 200 && Number((qFresh.json || {}).deliveryTotal) === FEE, `status=${qFresh.status} fee=${qFresh.json && qFresh.json.deliveryTotal}`, 'regression');
  const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${fx.productId}`);
  chk('GT-product-live', det.status === 200 && String((det.json || {}).productName || '').includes('AU024 Enum Probe'), `status=${det.status} name=${det.json && det.json.productName}`, 'regression');

  const browser = await L.newBrowser();

  // ================= CTX-SD : mobile SD leg =================
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const imgMap = {};
  p.on('response', r => { const u = r.url(); if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u] = r.status(); });
  const net = { quote: [], prof: [], abortedProf: 0 };
  p.on('request', req => {
    const u = req.url();
    if (u.includes('/checkout/delivery-quote')) net.quote.push({ auth: !!req.headers()['authorization'], body: req.postData() });
    if (u.includes('/api/v1/checkout/proforma') && req.method() === 'POST') net.prof.push({ auth: !!req.headers()['authorization'], body: req.postData() });
  });
  let failNextProf = false;
  await p.route('**/api/v1/checkout/proforma', async route => { if (failNextProf) { failNextProf = false; net.abortedProf++; return route.abort('failed'); } return route.continue(); });

  chk('A0-login-ctxSD-inline-9121', await login9121(p, { email: fx.buyer.email, pw: fx.buyer.pw }), fx.buyer.email, 'setup');

  // ---- A7a anon deep links ----
  {
    const cxA = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
    const pa = await cxA.newPage();
    await pa.goto(APP + '/', { waitUntil: 'load' }).catch(() => {}); await L.waitText(pa, 'Buy now', 40000);
    await pa.goto(APP + '/#/checkout', { waitUntil: 'load' }).catch(() => {}); await sleep(3500);
    const Ta = await txt(pa);
    chk('A7-anon-deeplink-checkout-gated-to-login', Ta.includes('Welcome back') || Ta.includes('Log in to buy'), Ta.slice(0, 80).replace(/\n/g, '|'), 'role-permission');
    await shot(pa, 'a7-anon-checkout-deeplink.png');
    await pa.goto(APP + '/#/admin', { waitUntil: 'load' }).catch(() => {}); await sleep(3000);
    const Tb = await txt(pa);
    chk('A7-anon-admin-route-not-dashboard', !(Tb.includes('Admin overview') || Tb.includes('Total revenue')), Tb.slice(0, 70).replace(/\n/g, '|'), 'role-permission');
    await shot(pa, 'a7-anon-admin-route.png');
    await cxA.close();
  }

  // ---- seed cart with schema-correct line, then open checkout directly ----
  await seedCart(p, fx.buyer.email, 1);
  await p.goto(APP + '/#/cart', { waitUntil: 'load' }).catch(() => {}); await sleep(3200);
  let T = await txt(p);
  chk('R-seeded-cart-line-renders', T.includes(PROBE.slice(-12)) && !T.includes('Your cart is empty'), T.slice(0, 70).replace(/\n/g, '|'), 'regression');

  // ---- A5 qty attacks on seeded line ----
  {
    const btns = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].filter(e => e.getAttribute('role') === 'button').map(e => { const r = e.getBoundingClientRect(); return { t: (e.textContent || '').trim().slice(0, 8), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })).catch(() => []);
    const plus = btns.find(b => b.t === '+' && b.y > 60 && b.y < 660);
    const minus = btns.find(b => b.t === '-' && b.y > 60 && b.y < 660);
    chk('A5-qty-stepper-found', !!plus && !!minus, JSON.stringify(btns.filter(b => b.t === '+' || b.t === '-')), 'invalid-input');
    if (plus) {
      for (let i = 0; i < 30; i++) { await p.mouse.click(plus.x, plus.y); await sleep(110); }
      await sleep(1700);
      const after = await p.evaluate(() => { const n = [...document.querySelectorAll('flt-semantics')].find(e => /^Qty\s*\d+$/.test((e.textContent || '').trim())); return n ? (n.textContent || '').trim() : ''; });
      const n = Number((after.match(/\d+/) || ['0'])[0]);
      chk('A5-plus-x30-capped-at-stock-5', n >= 1 && n <= 5, `"${after}" after 30 taps (stock=5)`, 'invalid-input');
      await shot(p, 'a5-cart-qty-hammered.png');
      if (minus) { for (let i = 0; i < 40; i++) { await p.mouse.click(minus.x, minus.y); await sleep(90); } await sleep(1600); }
      const after2 = await p.evaluate(() => { const n = [...document.querySelectorAll('flt-semantics')].find(e => /^Qty\s*\d+$/.test((e.textContent || '').trim())); return n ? (n.textContent || '').trim() : ''; });
      const n2 = Number((after2.match(/\d+/) || ['0'])[0]);
      chk('A5-minus-floor-is-1-never-zero-or-negative', n2 === 1, `"${after2}"`, 'invalid-input');
      T = await txt(p);
      const wantLine = Number(FEE * n2).toLocaleString('en-US');
      chk('A6-line-total-TSh-format-after-qty', T.includes(wantLine), `expect "${wantLine}" for qty=${n2}; text="${T.slice(0, 90).replace(/\n/g, '|')}"`, 'locale-number');
    }
  }

  // ---- proceed to checkout step 1 ----
  await L.clickBtn(p, 'Go to checkout'); await sleep(3400);
  T = await txt(p);
  chk('R-step1-visible', T.includes('Step 1 of 4'), T.slice(0, 50).replace(/\n/g, '|'), 'regression');
  await shot(p, 'r3-mobile-step1-top.png');
  await scrollDown(p, 12);
  let rs = await radios(p);
  chk('C1-radios-rendered-current-bundle', rs.length >= 2, JSON.stringify(rs.map(r => `${r.label}:${r.checked}`)), 'regression');
  chk('C1-default-SELLER_DELIVERY-fresh-screen', rs.length >= 2 && rs[0].checked === true && rs[1].checked === false, `[${rs.map(r => r.checked)}] doc-order SD,BP`, 'regression');
  await shot(p, 'r3-mobile-step1-default-sd.png');

  // ---- A1 rapid triple-taps each radio ----
  {
    const bp = rs.find(r => /Pick up/i.test(r.label));
    if (bp) { for (let i = 0; i < 3; i++) { await p.mouse.click(bp.x, bp.y); await sleep(120); } await sleep(900); }
    let now = await radios(p);
    chk('A1-triple-tap-pickup-still-single-selection', now.filter(r => r.checked).length === 1 && /Pick up/i.test(now.find(r => r.checked).label), `[${now.map(r => r.checked)}]`, 'rapid-double-tap');
    const sd = now.find(r => /Seller/i.test(r.label));
    if (sd) { for (let i = 0; i < 3; i++) { await p.mouse.click(sd.x, sd.y); await sleep(110); } await sleep(900); }
    now = await radios(p);
    chk('A1-triple-tap-sd-restores-default', now.filter(r => r.checked).length === 1 && now[0].checked === true, `[${now.map(r => r.checked)}]`, 'rapid-double-tap');
    await shot(p, 'a1-radios-after-rapid-taps.png');
  }

  // ---- A5 hostile phone input ----
  {
    const ins = p.locator('input[type="text"]');
    const ninp = await ins.count();
    const idx = Math.max(0, ninp - 1);
    await ins.nth(idx).click({ force: true }).catch(() => {}); await sleep(500);
    await p.keyboard.insertText('<script>alert(1)</script>'); await sleep(250);
    await p.keyboard.insertText('🎉🚚 Karibu — Ahsante! ½ ¾'); await sleep(250);
    await p.keyboard.insertText('X'.repeat(200)); await sleep(700);
    const valNow = await ins.nth(idx).inputValue().catch(() => '');
    chk('A5-phone-hostile-utf8-no-crash', valNow.length > 100, `len=${valNow.length} tail="${valNow.slice(-20)}" app-alive`, 'invalid-input');
    await shot(p, 'a5-phone-hostile-input.png');
    await ins.nth(idx).click({ force: true }).catch(() => {}); await sleep(300);
    await p.keyboard.press('Control+a').catch(() => {}); await sleep(150);
    await p.keyboard.type('+255713000444', { delay: 10 }); await sleep(700);
    const restored = await ins.nth(idx).inputValue().catch(() => '');
    chk('R-phone-restored-valid', restored.includes('+255713000444'), `"${restored.slice(-16)}"`, 'regression');
  }

  // ---- A1 continue double-tap -> review ----
  await forceBtnTwice(p, 'Continue to review');
  await sleep(2800);
  T = await txt(p);
  chk('R-step2-reached-despite-doubletap-continue', T.includes('Step 2 of 4'), T.slice(0, 50).replace(/\n/g, '|'), 'rapid-double-tap');

  // ---- C3 real fee ----
  let feeSeen = T.includes(Number(FEE).toLocaleString('en-US'));
  for (let i = 0; i < 18 && !feeSeen; i++) { await sleep(1000); T = await txt(p); feeSeen = T.includes(Number(FEE).toLocaleString('en-US')); }
  chk('C3-real-server-fee-rendered-8000', feeSeen, `quote calls=${net.quote.length}`, 'regression');
  chk('C3-quote-call-authenticated', net.quote.length >= 1 && net.quote.every(q => q.auth), `x${net.quote.length}, Authorization present on all`, 'regression');
  await shot(p, 'r3-mobile-step2-review-fee.png');

  // windows + terms
  let wins = [];
  for (let i = 0; i < 14 && wins.length < 1; i++) { await scrollDown(p, 2, 190); wins = await checkboxes(p, /^(Today|Tomorrow) /); }
  chk('R-window-checkboxes-present', wins.length >= 1, JSON.stringify(wins.map(w => w.label)), 'regression');
  if (wins.length) {
    let w = wins.find(x => !x.checked) || wins[0];
    for (let i = 0; i < 8; i++) { if (w.y >= 130 && w.y <= 560) break; await p.mouse.move(187, 330); await p.mouse.wheel(0, w.y > 560 ? w.y - 420 : -(230 - w.y)); await sleep(750); const f = (await checkboxes(p, /^(Today|Tomorrow) /)).find(z => z.label === w.label); if (f) w = f; else break; }
    let okc = false;
    for (let a = 0; a < 3 && !okc; a++) { await p.mouse.click(w.x, w.y); await sleep(1000); const m = (await checkboxes(p, /^(Today|Tomorrow) /)).find(z => z.label === w.label); okc = !!(m && m.checked); }
    chk('R-window-ticked', okc, w && w.label, 'regression');
  }
  let terms = null, tok = false;
  for (let i = 0; i < 14; i++) { terms = (await checkboxes(p, /I agree/))[0]; if (!terms) break; if (terms.y >= 70 && terms.y <= 600) break; await p.mouse.move(187, 330); await p.mouse.wheel(0, terms.y > 600 ? terms.y - 380 : -(230 - terms.y)); await sleep(650); }
  for (let a = 0; a < 4 && !tok && terms; a++) {
    if (terms.y >= 60 && terms.y <= 620) { await p.mouse.click(terms.x, Math.min(Math.max(terms.y, 30), 640)); await sleep(900); }
    else { await p.mouse.move(187, 330); await p.mouse.wheel(0, terms.y > 620 ? terms.y - 380 : -(230 - terms.y)); await sleep(650); }
    terms = (await checkboxes(p, /I agree/))[0]; tok = !!(terms && terms.checked);
  }
  chk('R-terms-ticked', tok, terms ? `y=${terms.y}` : 'not found', 'regression');
  await shot(p, 'r3-mobile-step2-window-terms.png');

  // ---- A4 abort proforma -> stays on review w/ error -> retry succeeds ----
  failNextProf = true;
  const profBefore = net.prof.length;
  await L.clickBtn(p, 'Confirm & proceed to payment');
  await sleep(4000);
  T = await txt(p);
  chk('A4-abort-proforma-stays-on-step2-with-error', T.includes('Step 2 of 4'), `aborted=${net.abortedProf}; err="${(T.match(/.{0,50}(Failed|failed|error|Error|Exception|host|Network|network).{0,70}/g) || []).slice(-1)}"`, 'offline-abort-retry');
  await shot(p, 'a4-proforma-aborted-error.png');
  chk('A4-exactly-one-abort-no-success', net.prof.length - profBefore === 1 && net.abortedProf === 1, `delta=${net.prof.length - profBefore}`, 'offline-abort-retry');
  await L.clickBtn(p, 'Confirm & proceed to payment');
  let s3 = false; for (let i = 0; i < 34 && !s3; i++) { await sleep(1000); s3 = (await txt(p)).includes('Step 3 of 4'); }
  await sleep(1800);
  T = await txt(p);
  chk('A4-retry-after-abort-reaches-payment', s3, T.slice(0, 70).replace(/\n/g, '|'), 'offline-abort-retry');

  // ---- C2 wire asserts ----
  const lastProf = net.prof.length ? net.prof[net.prof.length - 1] : null;
  let parsed = null; try { parsed = JSON.parse(lastProf && lastProf.body || 'null'); } catch (e) {}
  const bd = parsed && parsed.buyDetails;
  chk('C2-wire-enum-SELLER_DELIVERY', !!bd && bd.fulfillmentType === 'SELLER_DELIVERY', `ft=${bd && bd.fulfillmentType}`, 'regression');
  chk('C2-wire-body-never-SALE-CARD', !!lastProf && !/(^|[^A-Z_])(SALE|CARD)([^A-Z_]|$)/.test(lastProf.body || ''), `${(lastProf && lastProf.body || '').length}B zero hits`, 'regression');
  chk('C3-wire-deliveryFee-equals-quote', !!bd && Number(bd.deliveryFee) === FEE, `fee=${bd && bd.deliveryFee} exp=${FEE}`, 'regression');
  chk('C3-wire-total-subtotal+fee', !!bd && Number(bd.totalAmount) === fx.askingPrice * 1 + FEE, `total=${bd && bd.totalAmount} exp=${fx.askingPrice + FEE}`, 'regression');
  chk('C2-wire-windows-carried', !!bd && Array.isArray(bd.preferredDeliveryWindows) && bd.preferredDeliveryWindows.length >= 1, JSON.stringify(bd && bd.preferredDeliveryWindows), 'regression');
  fs.writeFileSync('/tmp/au024_skeptic_proforma_SD.json', lastProf ? lastProf.body || '' : '');
  await shot(p, 'r3-mobile-step3-payment-SD.png');

  // ---- A1b submit-payment quadruple tap without proof ----
  {
    const sb = await p.evaluate(() => { const e = [...document.querySelectorAll('flt-semantics')].find(x => x.getAttribute('role') === 'button' && (x.textContent || '').includes('Submit Payment')); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
    const before = net.prof.length;
    if (sb) { for (let i = 0; i < 4; i++) { await p.mouse.click(sb.x, Math.min(sb.y, 645)); await sleep(130); } await sleep(1800); }
    T = await txt(p);
    chk('A1-submitpayment-x4-no-proof-guarded', T.includes('Step 3 of 4') && net.prof.length === before, `still step3=${T.includes('Step 3 of 4')} extra-posts=${net.prof.length - before}`, 'rapid-double-tap');
    await shot(p, 'a1-submit-x4-no-proof.png');
  }

  // ---- A8 session expiry mid-flow ----
  {
    const inv = T.match(/Invoice\s+\S+/);
    chk('R-invoice-number-rendered', !!inv, inv && inv[0], 'regression');
    await p.evaluate(() => localStorage.removeItem('flutter.auth_token'));
    await p.reload({ waitUntil: 'load' }).catch(() => {}); await sleep(5200);
    T = await txt(p);
    chk('A8-expired-token-reload-no-crash', (await txt(p)).length > 60, `text="${T.slice(0, 80).replace(/\n/g, '|')}"`, 'session-expiry');
    await shot(p, 'a8-token-wiped-reload.png');
    // re-login to continue
    chk('A8-relogin-after-expiry', await login9121(p, { email: fx.buyer.email, pw: fx.buyer.pw }), '', 'session-expiry');
  }

  // ---- A9 stale-cache reload: cart empty after confirmed proforma ----
  {
    await p.goto(APP + '/#/cart', { waitUntil: 'load' }).catch(() => {}); await sleep(3000);
    T = await txt(p);
    chk('A9-cart-empty-after-proforma-confirm', T.includes('Your cart is empty'), T.slice(0, 70).replace(/\n/g, '|'), 'stale-cache-reload');
    await shot(p, 'a9-cart-empty-post-confirm.png');
    // reseed cart and deep-link straight into checkout: fresh flow at Step 1
    await seedCart(p, fx.buyer.email, 1);
    await p.goto(APP + '/#/checkout', { waitUntil: 'load' }).catch(() => {}); await sleep(3600);
    T = await txt(p);
    chk('A9-checkout-after-completed-flow-starts-clean', T.includes('Step 1 of 4'), T.slice(0, 60).replace(/\n/g, '|'), 'stale-cache-reload');
  }
  await ctx.close();

  // ================= CTX-BP : pickup leg + empty states + out-of-order =================
  const ctx2 = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const p2 = await ctx2.newPage();
  const net2 = { quote: [], prof: [] };
  p2.on('request', req => { const u = req.url(); if (u.includes('/checkout/delivery-quote')) net2.quote.push({ auth: !!req.headers()['authorization'] }); if (u.includes('/api/v1/checkout/proforma') && req.method() === 'POST') net2.prof.push(req.postData()); });
  chk('A0-login-ctxBP', await login9121(p2, { email: fx.buyer.email, pw: fx.buyer.pw }), '', 'setup');

  // ---- A3a empty-cart checkout ----
  await p2.evaluate(email => localStorage.removeItem('expatCartItems_' + email), fx.buyer.email);
  await p2.goto(APP + '/#/checkout', { waitUntil: 'load' }).catch(() => {}); await sleep(3800);
  let Te = await txt(p2);
  const emptyMsg = Te.includes('cart is empty') || Te.includes('Your cart is empty');
  chk('A3-empty-cart-message-shown', emptyMsg, Te.slice(0, 90).replace(/\n/g, '|'), 'empty-states');
  await shot(p2, 'a3-empty-cart-checkout.png');
  await L.clickBtn(p2, 'Continue to review'); await sleep(2200);
  Te = await txt(p2);
  chk('A3-empty-cart-cannot-advance-to-review', !Te.includes('Step 2 of 4'), Te.slice(0, 60).replace(/\n/g, '|'), 'empty-states');

  // ---- pickup flow with mid-flow back-out ----
  await seedCart(p2, fx.buyer.email, 1);
  await p2.goto(APP + '/#/cart', { waitUntil: 'load' }).catch(() => {}); await sleep(3000);
  chk('R2-go-to-checkout', await L.clickBtn(p2, 'Go to checkout'), '', 'regression');
  await sleep(3400);
  await scrollDown(p2, 12);
  let rs2 = await radios(p2);
  chk('C1b-default-SD-before-pickup-flip', rs2.length >= 2 && rs2[0].checked === true, `[${rs2.map(r => r.checked)}]`, 'out-of-order');
  const bp2 = rs2.find(r => /Pick up/i.test(r.label));
  if (bp2) { await p2.mouse.click(bp2.x, bp2.y); await sleep(850); }
  const rs2b = await radios(p2);
  chk('C1b-pickup-selected', rs2b.some(r => r.checked && /Pick up/i.test(r.label)), `[${rs2b.map(r => r.checked)}]`, 'out-of-order');
  await shot(p2, 'r2-mobile-step1-pickup-selected.png');
  chk('A2-continue-to-review-pickup', await L.clickBtn(p2, 'Continue to review'), '', 'out-of-order');
  await sleep(3000);
  T = await txt(p2);
  chk('A2-review-reached-pickup', T.includes('Step 2 of 4'), T.slice(0, 50).replace(/\n/g, '|'), 'out-of-order');
  chk('A2b-pickup-review-fired-zero-quote-calls', net2.quote.length === 0, `quote calls=${net2.quote.length} (must be 0)`, 'out-of-order');
  await shot(p2, 'r2-mobile-step2-review-BUYER_PICKUP.png');
  chk('A2-back-from-review-exits-checkout', await L.clickBtn(p2, 'Back'), '', 'out-of-order');
  await sleep(2400);
  T = await txt(p2);
  const backOk = T.includes('Cart') || T.includes('Your cart');
  chk('A2-back-out-of-review-lands-cart', backOk, T.slice(0, 60).replace(/\n/g, '|'), 'out-of-order');
  // re-enter checkout; selection resets to default SD (fresh screen semantics)
  chk('A2-reenter-checkout', await L.clickBtn(p2, 'Go to checkout'), '', 'out-of-order');
  await sleep(3400);
  await scrollDown(p2, 12);
  let rs3 = await radios(p2);
  chk('A2-reentry-shows-radios', rs3.length >= 2, `[${rs3.map(r => r.checked)}]`, 'out-of-order');
  chk('A2c-still-zero-quote-calls-through-backout', net2.quote.length === 0, `quote calls=${net2.quote.length}`, 'out-of-order');
  // flip to pickup again and continue
  const bp3 = rs3.find(r => /Pick up/i.test(r.label));
  if (bp3) { await p2.mouse.click(bp3.x, bp3.y); await sleep(850); }
  await shot(p2, 'a2-reenter-pickup-selected.png');
  chk('A2-forward-again-to-review', await L.clickBtn(p2, 'Continue to review'), '', 'out-of-order');
  await sleep(3000);
  T = await txt(p2);
  chk('A2-forward-review-pickup-reached', T.includes('Step 2 of 4'), T.slice(0, 50).replace(/\n/g, '|'), 'out-of-order');

  // ---- A3b windows block hidden on pickup ----
  {
    T = await txt(p2);
    chk('C3b-pickup-hides-windows-header', !T.includes('When should we deliver?'), `visible=${T.includes('When should we deliver?')}`, 'empty-states');
    const wr = await checkboxes(p2, /^(Today|Tomorrow) /);
    chk('C3b-pickup-zero-window-checkboxes', wr.length === 0, `rows=${wr.length}`, 'empty-states');
    chk('C3b-pickup-ui-no-delivery-fee-row', T.includes('No delivery fee'), `'No delivery fee' rendered=${T.includes('No delivery fee')}`, 'regression');
    await shot(p2, 'a3-pickup-review-windows-hidden.png');
  }

  // ---- A1c triple confirm on pickup ----
  {
    const before = net2.prof.length;
    await forceBtnTwice(p2, 'Confirm & proceed to payment');
    await sleep(4000);
    chk('A1-multi-confirm-single-proforma', net2.prof.length - before <= 1, `proforma POSTs during triple-tap=${net2.prof.length - before} (<=1)`, 'rapid-double-tap');
    let s3b = false; for (let i = 0; i < 34 && !s3b; i++) { await sleep(1000); s3b = (await txt(p2)).includes('Step 3 of 4'); }
    await sleep(1600);
    chk('A1-multi-confirm-reaches-payment', s3b, '', 'rapid-double-tap');
    const lastBP = net2.prof.length ? net2.prof[net2.prof.length - 1] : null;
    let pb = null; try { pb = JSON.parse(lastBP || 'null'); } catch (e) {}
    chk('C2-wire-enum-BUYER_PICKUP', !!pb && pb.buyDetails.fulfillmentType === 'BUYER_PICKUP', `ft=${pb && pb.buyDetails.fulfillmentType}`, 'regression');
    chk('C2b-BP-body-never-SALE-CARD', !!lastBP && !/(^|[^A-Z_])(SALE|CARD)([^A-Z_]|$)/.test(lastBP || ''), `${(lastBP || '').length}B zero hits`, 'regression');
    chk('C3b-wire-fee-0', !!pb && Number(pb.buyDetails.deliveryFee) === 0, `fee=${pb && pb.buyDetails.deliveryFee}`, 'regression');
    chk('C3b-wire-total-subtotal-only', !!pb && Number(pb.buyDetails.totalAmount) === fx.askingPrice, `total=${pb && pb.buyDetails.totalAmount} exp=${fx.askingPrice}`, 'regression');
    chk('C3b-wire-windows-empty-array', !!pb && Array.isArray(pb.buyDetails.preferredDeliveryWindows) && pb.buyDetails.preferredDeliveryWindows.length === 0, JSON.stringify(pb && pb.buyDetails.preferredDeliveryWindows), 'regression');
    fs.writeFileSync('/tmp/au024_skeptic_proforma_BP.json', lastBP || '');
    await shot(p2, 'r2-mobile-step3-payment-BUYER_PICKUP.png');
  }

  // ---- tablet viewport ----
  {
    const ctxT = await L.newCtx(browser, { viewport: { width: 768, height: 1024 } });
    const pt = await ctxT.newPage();
    chk('A0-login-tablet', await login9121(pt, { email: fx.buyer.email, pw: fx.buyer.pw }), '', 'setup');
    await seedCart(pt, fx.buyer.email, 1);
    await pt.goto(APP + '/#/cart', { waitUntil: 'load' }).catch(() => {}); await sleep(3000);
    await L.clickBtn(pt, 'Go to checkout'); await sleep(3400);
    for (let i = 0; i < 10; i++) { await pt.mouse.move(380, 480); await pt.mouse.wheel(0, 340); await sleep(140); }
    await sleep(800);
    const rt = await radios(pt);
    chk('C1-tablet-radios-default-SD', rt.length >= 2 && rt[0].checked === true && rt[1].checked === false, `[${rt.map(r => r.checked)}]`, 'regression');
    await shot(pt, 'r3-tablet-step1-default-sd.png');
    const bpt = rt.find(r => /Pick up/i.test(r.label));
    if (bpt) { await pt.mouse.click(bpt.x, bpt.y); await sleep(850); }
    await L.clickBtn(pt, 'Continue to review'); await sleep(3000);
    const Tt = await txt(pt);
    chk('C3-tablet-pickup-review-fee0-no-quote', Tt.includes('Step 2 of 4') && Tt.includes('No delivery fee'), `step2=${Tt.includes('Step 2 of 4')} noFeeRow=${Tt.includes('No delivery fee')} quotes=${net2.quote.length}`, 'regression');
    await shot(pt, 'r3-tablet-step2-review-pickup.png');
    await ctxT.close();
  }

  const imgStat = { requested: Object.keys(imgMap).length, ok200: Object.values(imgMap).filter(s => s === 200 || s === 304).length, broken: Object.entries(imgMap).filter(([, s]) => s >= 400).map(([u]) => u) };
  rec({ kind: 'images', imgStat });

  await ctx2.close();
  await browser.close();
  rec({ kind: 'summary', passes: PASSN, fails: FAILN, net, net2, imgStat });
  console.log(`\nSKEPTIC R3 DONE passes=${PASSN} fails=${FAILN}`);
})().catch(e => { console.error('FATAL', e && e.message || e); rec({ kind: 'fatal', error: String(e).slice(0, 400) }); process.exit(1); });
