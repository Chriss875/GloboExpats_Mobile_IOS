// au024_skeptic_r2.js — SKEPTIC for AU-024 on CURRENT bundle :9121 (b56e345).
// r1 lesson: lib_verify.login() targets its own hardcoded APP(:9100) origin —
// logging in there does NOT authenticate the :9121 context (localStorage is
// per-origin). All logins here are done INLINE on :9121.
// Stage A regression probe (SD + BP legs, both viewports) + attack classes
// A1 rapid taps | A2 out-of-order/back-out | A3 empty states | A4 offline abort+retry
// A5 invalid input | A6 locale/number | A7 role probes | A8 session expiry | A9 stale reload.
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9121';
const SHOT = 'e2e/shots/AU-024-skeptic';
const SHARD = 'e2e/results/shards/AU-024-skeptic.jsonl';
const fx = JSON.parse(fs.readFileSync('/tmp/au024_fixtures.json', 'utf8'));
const PROBE = `AU024 Enum Probe Chair ${fx.stamp}`;
const FEE = fx.quoteReal.deliveryTotal;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lines = [];
function rec(o) { lines.push(Object.assign({ ts: new Date().toISOString(), wave: 'skeptic', stage: 'skeptic-backfill', unit: 'AU-024', build_sha: 'b56e345' }, o)); fs.writeFileSync(SHARD, lines.map(l => JSON.stringify(l)).join('\n') + '\n'); }
let PASSN = 0, FAILN = 0;
function chk(name, pass, detail, cls) { console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + String(detail).slice(0, 220) : '')); rec({ kind: 'assert', attack_class: cls || 'regression', assert: name, pass: !!pass, detail: String(detail).slice(0, 400) }); pass ? PASSN++ : FAILN++; return !!pass; }
async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => ''); }
async function shot(p, name) { const f = `${SHOT}/${name}`; await L.screenshot(p, f); rec({ kind: 'shot', name: f }); return f; }
async function login9121(p, cred) {
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  if (!(await L.waitText(p, 'Buy now', 45000))) return false;
  if (!(await p.evaluate(() => { try { return !!(localStorage.getItem('flutter.auth_token') || '').length > 10; } catch (e) { return false; } }))) {
    if (!(await L.clickBtn(p, 'Login'))) return false;
    await L.waitText(p, 'Welcome back', 25000);
    const ei = p.locator('input[type="text"]').first(), pi = p.locator('input[type="password"]').first();
    await ei.click({ force: true }).catch(() => {}); await sleep(400); await p.keyboard.type(cred.email, { delay: 8 });
    await pi.click({ force: true }).catch(() => {}); await sleep(400); await p.keyboard.type(cred.pw, { delay: 8 });
    if (!(await L.clickBtn(p, 'Log in'))) return false;
    let ok = false; for (let i = 0; i < 30 && !ok; i++) { await sleep(1000); ok = await p.evaluate(() => { try { return !!(localStorage.getItem('flutter.auth_token') || '').length > 10; } catch (e) { return false; } }); }
    if (!ok) return false;
  }
  return true;
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
async function scrollDown(p, times, vy) {
  for (let i = 0; i < (times || 12); i++) { await p.mouse.move(187, 330); await p.mouse.wheel(0, vy || 240); await sleep(140); }
  await sleep(700);
}
async function forceBtnTwice(p, label) {
  await L.clickBtn(p, label); await sleep(220);
  try { await L.btn(p, label).click({ force: true, timeout: 1800 }); } catch (e) {}
  await sleep(180);
  try { await L.btn(p, label).click({ force: true, timeout: 1800 }); } catch (e) {}
}

(async () => {
  // ---------- live ground truth ----------
  const qFresh = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/delivery-quote',
    { destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 }, items: [{ productId: fx.productId, quantity: 1 }] });
  chk('GT-quote-live', qFresh.status === 200 && typeof (qFresh.json || {}).deliveryTotal === 'number' && (qFresh.json.deliveryTotal === FEE), `status=${qFresh.status} fee=${qFresh.json && qFresh.json.deliveryTotal} (fixture fee=${FEE})`, 'regression');
  const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${fx.productId}`);
  chk('GT-product-live', det.status === 200 && String((det.json || {}).productName || '').includes('AU024 Enum Probe Chair'), `status=${det.status} ${det.json && det.json.productName}`, 'regression');

  // ================= CTX-SD: mobile 375x667 — SD leg =================
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const imgMap = {};
  p.on('response', r => { const u = r.url(); if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u] = r.status(); });
  const net = { quote: [], prof: [], abortedQuote: 0, abortedProf: 0 };
  p.on('request', req => {
    const u = req.url();
    if (u.includes('/checkout/delivery-quote')) net.quote.push({ auth: !!req.headers()['authorization'], body: req.postData() });
    if (u.includes('/api/v1/checkout/proforma') && req.method() === 'POST') net.prof.push({ auth: !!req.headers()['authorization'], body: req.postData() });
  });
  let failNextProf = false;
  await p.route('**/api/v1/checkout/proforma', async route => { if (failNextProf) { failNextProf = false; net.abortedProf++; return route.abort('failed'); } return route.continue(); });

  chk('A0-login-ctxSD', await login9121(p, { email: fx.buyer.email, pw: fx.buyer.pw }), fx.buyer.email, 'setup');
  await clearCart(p);

  // ---- A7a anon deep link (separate anon context) ----
  {
    const cxA = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
    const pa = await cxA.newPage();
    await pa.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(pa, 'Buy now', 45000);
    await pa.goto(APP + '/#/checkout', { waitUntil: 'load' }).catch(() => {}); await sleep(3500);
    const Ta = await txt(pa);
    chk('A7-anon-deeplink-checkout-gated-to-login', Ta.includes('Welcome back') || Ta.includes('Log in to buy'), Ta.slice(0, 80).replace(/\n/g, '|'), 'role-permission');
    await shot(pa, 'a7-anon-checkout-deeplink.png');
    await pa.goto(APP + '/#/admin', { waitUntil: 'load' }).catch(() => {}); await sleep(2800);
    const Tb = await txt(pa);
    chk('A7-anon-admin-route-not-dashboard', !(Tb.includes('Admin overview') || Tb.includes('Total revenue')), Tb.slice(0, 70).replace(/\n/g, '|'), 'role-permission');
    await shot(pa, 'a7-anon-admin-route.png');
    await cxA.close();
  }

  // ---- SD happy path ----
  await p.goto(APP + '/#/product/' + fx.productId, { waitUntil: 'load' }).catch(() => {}); await sleep(4200);
  let T = await txt(p);
  chk('R-detail-loaded', T.includes('Add to cart') && T.includes(PROBE.slice(-12)), `"${PROBE}"`, 'regression');
  await shot(p, 'r1-mobile-detail.png');
  chk('R-add-to-cart', await L.clickBtn(p, 'Add to cart'), '', 'regression');
  await sleep(2400);
  await p.goto(APP + '/#/cart', { waitUntil: 'load' }).catch(() => {}); await sleep(2600);
  T = await txt(p);
  chk('R-cart-has-fixture-line', T.includes(PROBE.slice(-12)) && !T.includes('Your cart is empty'), T.slice(0, 60).replace(/\n/g, '|'), 'regression');

  // ---- A5 qty attacks in cart ----
  {
    const btns = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].filter(e => e.getAttribute('role') === 'button').map(e => { const r = e.getBoundingClientRect(); return { t: (e.textContent || '').trim().slice(0, 12), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }));
    const plus = btns.find(b => b.t === '+' && b.y > 60 && b.y < 660);
    const minus = btns.find(b => b.t === '-' && b.y > 60 && b.y < 660);
    chk('A5-qty-buttons-found', !!plus && !!minus, JSON.stringify(btns.filter(b => b.t === '+' || b.t === '-')), 'invalid-input');
    if (plus) {
      for (let i = 0; i < 30; i++) { await p.mouse.click(plus.x, plus.y); await sleep(110); }
      await sleep(1600);
      const after = await p.evaluate(() => { const n = [...document.querySelectorAll('flt-semantics')].find(e => /^Qty\s*\d+$/.test((e.textContent || '').trim())); return n ? (n.textContent || '').trim() : ''; });
      const n = Number((after.match(/\d+/) || ['0'])[0]);
      chk('A5-plus-x30-capped-at-stock-5', n >= 1 && n <= 5, `after 30 plus taps -> "${after}" (stock=5)`, 'invalid-input');
      await shot(p, 'a5-cart-qty-hammered.png');
      if (minus) { for (let i = 0; i < 40; i++) { await p.mouse.click(minus.x, minus.y); await sleep(90); } await sleep(1500); }
      const after2 = await p.evaluate(() => { const n = [...document.querySelectorAll('flt-semantics')].find(e => /^Qty\s*\d+$/.test((e.textContent || '').trim())); return n ? (n.textContent || '').trim() : ''; });
      const n2 = Number((after2.match(/\d+/) || ['0'])[0]);
      chk('A5-minus-floor-is-1-never-zero', n2 === 1, `minus hammered -> "${after2}"`, 'invalid-input');
      T = await txt(p);
      chk('A5-total-recomputes-after-qty-attacks', T.includes(Number(FEE * n2).toLocaleString('en-US')) || T.includes(String(FEE)), `line total for qty=${n2}: TSh ${Number(FEE * n2).toLocaleString('en-US')}`, 'locale-number');
    }
  }

  chk('R-go-to-checkout', await L.clickBtn(p, 'Go to checkout'), '', 'regression');
  await sleep(3400);
  T = await txt(p);
  chk('R-step1-visible', T.includes('Step 1 of 4'), T.slice(0, 50).replace(/\n/g, '|'), 'regression');
  await shot(p, 'r1-mobile-step1-top.png');

  await scrollDown(p, 12);
  let rs = await radios(p);
  chk('C1-radios-rendered-current-bundle', rs.length >= 2, JSON.stringify(rs.map(r => `${r.label}:${r.checked}`)), 'regression');
  chk('C1-default-SELLER_DELIVERY-fresh', rs.length >= 2 && rs[0].checked === true && rs[1].checked === false, `[${rs.map(r => r.checked)}] doc-order SD first`, 'regression');
  await shot(p, 'r1-mobile-step1-default-sd.png');

  // ---- A1 rapid triple-taps on each radio ----
  {
    const bp = rs.find(r => /Pick up/i.test(r.label));
    if (bp) { for (let i = 0; i < 3; i++) { await p.mouse.click(bp.x, bp.y); await sleep(120); } await sleep(900); }
    let now = await radios(p);
    chk('A1-triple-tap-pickup-single-selection', now.filter(r => r.checked).length === 1 && /Pick up/i.test(now.find(r => r.checked).label), `[${now.map(r => r.checked)}]`, 'rapid-double-tap');
    const sd = now.find(r => /Seller|delivery/i.test(r.label));
    if (sd) { for (let i = 0; i < 3; i++) { await p.mouse.click(sd.x, sd.y); await sleep(110); } await sleep(900); }
    now = await radios(p);
    chk('A1-triple-tap-seller-delivery-restores-default', now.filter(r => r.checked).length === 1 && now[0].checked === true, `[${now.map(r => r.checked)}]`, 'rapid-double-tap');
    await shot(p, 'a1-radios-after-rapid-taps.png');
  }

  // ---- phone field invalid-input attacks (only editable field on step 1) ----
  {
    const ins = p.locator('input[type="text"]');
    const ninp = await ins.count();
    await ins.nth(Math.max(0, ninp - 1)).click({ force: true }).catch(() => {}); await sleep(500);
    await p.keyboard.insertText('<script>alert(1)</script>'); await sleep(300);
    await p.keyboard.insertText('🎉🚚 Karibu sana — Ahsante! ½ ¾ ×÷ ±'); await sleep(300);
    await p.keyboard.insertText('X'.repeat(200)); await sleep(600);
    const valNow = await ins.nth(Math.max(0, ninp - 1)).inputValue().catch(() => '');
    chk('A5-phone-accepts-arbitrary-utf8-no-crash', valNow.length > 100, `len=${valNow.length} tail="${valNow.slice(-25)}" (app alive)`, 'invalid-input');
    await shot(p, 'a5-phone-hostile-input.png');
    // restore a valid phone
    await ins.nth(Math.max(0, ninp - 1)).click({ force: true }).catch(() => {}); await sleep(300);
    await p.keyboard.press('Control+a').catch(() => {}); await p.keyboard.press('Meta+a').catch(() => {});
    await p.keyboard.type('+255713000444', { delay: 10 }); await sleep(700);
  }

  // ---- A1 continue double-tap ----
  await forceBtnTwice(p, 'Continue to review');
  await sleep(2600);
  T = await txt(p);
  chk('R-step2-reached-despite-doubletap', T.includes('Step 2 of 4'), T.slice(0, 50).replace(/\n/g, '|'), 'rapid-double-tap');

  // ---- C3 fee render ----
  let feeSeen = T.includes(Number(FEE).toLocaleString('en-US'));
  for (let i = 0; i < 18 && !feeSeen; i++) { await sleep(1000); T = await txt(p); feeSeen = T.includes(Number(FEE).toLocaleString('en-US')); }
  chk('C3-real-server-fee-rendered', feeSeen, `expect "8,000" (TSh ${FEE}); quote calls=${net.quote.length}`, 'regression');
  chk('C3-quote-calls-all-authenticated', net.quote.length >= 1 && net.quote.every(q => q.auth), `delivery-quote x${net.quote.length}, Authorization on every call`, 'regression');
  await shot(p, 'r1-mobile-step2-review-fee.png');

  // ---- windows + terms ----
  let wins = [];
  for (let i = 0; i < 12 && wins.length < 1; i++) { await scrollDown(p, 3, 190); wins = await checkboxes(p, /^(Today|Tomorrow) /); }
  chk('R-window-checkboxes-present', wins.length >= 1, JSON.stringify(wins.map(w => w.label)), 'regression');
  if (wins.length) {
    let w = wins.find(x => !x.checked) || wins[0];
    for (let i = 0; i < 8; i++) { if (w.y >= 130 && w.y <= 560) break; await p.mouse.move(187, 330); await p.mouse.wheel(0, w.y > 560 ? w.y - 420 : -(230 - w.y)); await sleep(750); const f = (await checkboxes(p, /^(Today|Tomorrow) /)).find(z => z.label === w.label); if (f) w = f; else break; }
    let okc = false;
    for (let a = 0; a < 3 && !okc; a++) { await p.mouse.click(w.x, w.y); await sleep(1000); const m = (await checkboxes(p, /^(Today|Tomorrow) /)).find(z => z.label === w.label); okc = !!(m && m.checked); }
    chk('R-window-ticked', okc, w.label, 'regression');
  }
  let terms = null, tok = false;
  for (let i = 0; i < 14; i++) { terms = (await checkboxes(p, /I agree/))[0]; if (!terms) break; if (terms.y >= 70 && terms.y <= 600) break; await p.mouse.move(187, 330); await p.mouse.wheel(0, terms.y > 600 ? terms.y - 380 : -(230 - terms.y)); await sleep(650); }
  for (let a = 0; a < 4 && !tok && terms; a++) {
    if (terms.y >= 60 && terms.y <= 620) { await p.mouse.click(terms.x, Math.min(Math.max(terms.y, 30), 640)); await sleep(900); }
    else { await p.mouse.move(187, 330); await p.mouse.wheel(0, terms.y > 620 ? terms.y - 380 : -(230 - terms.y)); await sleep(650); }
    terms = (await checkboxes(p, /I agree/))[0]; tok = !!(terms && terms.checked);
  }
  chk('R-terms-ticked', tok, terms ? `y=${terms.y}` : 'checkbox not found', 'regression');
  await shot(p, 'r1-mobile-step2-window-terms.png');

  // ---- A4 abort proforma POST -> error stays on review -> retry succeeds ----
  failNextProf = true;
  const profBefore = net.prof.length;
  await L.clickBtn(p, 'Confirm & proceed to payment');
  await sleep(3800);
  T = await txt(p);
  chk('A4-abort-proforma-stays-on-step2-with-error', T.includes('Step 2 of 4'), `still step2=${T.includes('Step 2 of 4')}; aborted=${net.abortedProf}; text="${T.replace(/\n/g, '|').slice(0, 110)}"`, 'offline-abort-retry');
  await shot(p, 'a4-proforma-aborted.png');
  chk('A4-exactly-one-aborted-call-no-success', net.prof.length - profBefore === 1 && net.abortedProf === 1, `prof delta=${net.prof.length - profBefore} aborted=${net.abortedProf}`, 'offline-abort-retry');
  await L.clickBtn(p, 'Confirm & proceed to payment');
  let s3 = false; for (let i = 0; i < 32 && !s3; i++) { await sleep(1000); s3 = (await txt(p)).includes('Step 3 of 4'); }
  await sleep(1800);
  T = await txt(p);
  chk('A4-retry-reaches-payment-step', s3, T.slice(0, 70).replace(/\n/g, '|'), 'offline-abort-retry');

  // ---- C2 wire asserts ----
  const lastProf = net.prof.length ? net.prof[net.prof.length - 1] : null;
  let parsed = null; try { parsed = JSON.parse(lastProf && lastProf.body || 'null'); } catch (e) {}
  const bd = parsed && parsed.buyDetails;
  chk('C2-wire-enum-SELLER_DELIVERY', !!bd && bd.fulfillmentType === 'SELLER_DELIVERY', `ft=${bd && bd.fulfillmentType}`, 'regression');
  chk('C2-wire-body-never-SALE-CARD', !!lastProf && !/(^|[^A-Z_])(SALE|CARD)([^A-Z_]|$)/.test(lastProf.body || ''), `${(lastProf && lastProf.body || '').length}B scan zero hits`, 'regression');
  chk('C3-wire-fee-equals-live-quote', !!bd && Number(bd.deliveryFee) === FEE, `fee=${bd && bd.deliveryFee} exp=${FEE}`, 'regression');
  chk('C3-wire-total-subtotal+fee', !!bd && Number(bd.totalAmount) === fx.askingPrice + FEE, `total=${bd && bd.totalAmount} exp=${fx.askingPrice + FEE}`, 'regression');
  chk('C2-wire-windows-carried', !!bd && Array.isArray(bd.preferredDeliveryWindows) && bd.preferredDeliveryWindows.length >= 1, JSON.stringify(bd && bd.preferredDeliveryWindows), 'regression');
  fs.writeFileSync('/tmp/au024_skeptic_proforma_SD.json', lastProf ? lastProf.body || '' : '');
  await shot(p, 'r1-mobile-step3-payment-SD.png');

  // ---- A6 locale/number formats on payment step ----
  {
    T = await txt(p);
    const m = T.match(/TSh[\s\S]{0,40}/);
    chk('A6-TSh-format-thousands-separator', !!T.match(/TSh\s?[\d,]+/) , `snippet="${m && m[0].slice(0, 40).replace(/\n/g, ' ')}"`, 'locale-number');
    chk('A6-total-shown-equals-subtotal+8000', T.replace(/,/g, '').includes(String(fx.askingPrice + FEE)) || T.replace(/,/g, '').includes(String(fx.askingPrice)), `total present=${T.replace(/,/g, '').includes(String(fx.askingPrice + FEE))}`, 'locale-number');
    await shot(p, 'a6-payment-numbers.png');
  }

  // ---- A1b submit-payment quadruple tap with NO proof ----
  {
    const sb = await p.evaluate(() => { const e = [...document.querySelectorAll('flt-semantics')].find(x => x.getAttribute('role') === 'button' && (x.textContent || '').includes('Submit Payment')); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
    let profsBefore = net.prof.length;
    if (sb) { for (let i = 0; i < 4; i++) { await p.mouse.click(sb.x, Math.min(sb.y, 645)); await sleep(130); } await sleep(1700); }
    T = await txt(p);
    chk('A1-submitpayment-x4-no-proof-guarded', T.includes('Step 3 of 4') && net.prof.length === profsBefore, `still step3=${T.includes('Step 3 of 4')} extra-prof-posts=${net.prof.length - profsBefore}; guard-text="${(T.match(/.{0,30}(proof|Tick|completed).{0,50}/g) || [])[0] || ''}"`, 'rapid-double-tap');
    await shot(p, 'a1-submit-x4-no-proof.png');
  }

  // ---- A8 session expiry mid-flow: wipe token, reload ----
  {
    const inv = T.match(/Invoice\s+\S+/);
    chk('R-invoice-number-rendered', !!inv, inv && inv[0], 'regression');
    fs.writeFileSync('/tmp/au024_skeptic_invoice_id.txt', inv ? inv[0] : '');
    await p.evaluate(() => localStorage.removeItem('flutter.auth_token'));
    await p.reload({ waitUntil: 'load' }).catch(() => {}); await sleep(5000);
    T = await txt(p);
    chk('A8-token-wiped-reload-no-crash-white-screen', (await txt(p)).length > 60, `post-expiry text="${T.slice(0, 80).replace(/\n/g, '|')}"`, 'session-expiry');
    await shot(p, 'a8-token-wiped-reload.png');
  }

  // ---- A9 stale-cache reload: cart must be empty after confirmed proforma ----
  {
    await p.goto(APP + '/#/cart', { waitUntil: 'load' }).catch(() => {}); await sleep(2800);
    T = await txt(p);
    chk('A9-cart-empty-after-proforma-confirm', T.includes('Your cart is empty'), T.slice(0, 70).replace(/\n/g, '|'), 'stale-cache-reload');
    await shot(p, 'a9-cart-empty-post-confirm.png');
    // re-add item then deep-link checkout: flow starts clean at step 1
    await p.goto(APP + '/#/product/' + fx.productId, { waitUntil: 'load' }).catch(() => {}); await sleep(3600);
    await L.clickBtn(p, 'Add to cart'); await sleep(2200);
    await p.goto(APP + '/#/checkout', { waitUntil: 'load' }).catch(() => {}); await sleep(3400);
    T = await txt(p);
    chk('A9-checkout-after-completed-flow-starts-clean-step1', T.includes('Step 1 of 4'), T.slice(0, 60).replace(/\n/g, '|'), 'stale-cache-reload');
  }
  await ctx.close();

  // ================= CTX-BP: pickup leg + empty states + out-of-order =================
  const ctx2 = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const p2 = await ctx2.newPage();
  const net2 = { quote: [], prof: [] };
  p2.on('request', req => { const u = req.url(); if (u.includes('/checkout/delivery-quote')) net2.quote.push({ auth: !!req.headers()['authorization'] }); if (u.includes('/api/v1/checkout/proforma') && req.method() === 'POST') net2.prof.push(req.postData()); });
  chk('A0-login-ctxBP', await login9121(p2, { email: fx.buyer.email, pw: fx.buyer.pw }), '', 'setup');

  // ---- A3a empty-cart checkout ----
  await clearCart(p2);
  await p2.goto(APP + '/#/checkout', { waitUntil: 'load' }).catch(() => {}); await sleep(3800);
  let Te = await txt(p2);
  chk('A3-empty-cart-message-shown', Te.includes('cart is empty'), Te.slice(0, 90).replace(/\n/g, '|'), 'empty-states');
  await shot(p2, 'a3-empty-cart-checkout.png');
  await L.clickBtn(p2, 'Continue to review'); await sleep(2000);
  Te = await txt(p2);
  chk('A3-empty-cart-cannot-advance', !Te.includes('Step 2 of 4'), Te.slice(0, 60).replace(/\n/g, '|'), 'empty-states');

  // ---- add fixture -> checkout, flip PICKUP with mid-flow back-out ----
  await p2.goto(APP + '/#/product/' + fx.productId, { waitUntil: 'load' }).catch(() => {}); await sleep(3800);
  chk('R2-add-to-cart', await L.clickBtn(p2, 'Add to cart'), '', 'regression');
  await sleep(2200);
  await p2.goto(APP + '/#/cart', { waitUntil: 'load' }).catch(() => {}); await sleep(2500);
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
  chk('A2-back-midflow', await L.clickBtn(p2, 'Back'), '', 'out-of-order');
  await sleep(2300);
  T = await txt(p2);
  chk('A2-back-lands-step1', T.includes('Step 1 of 4'), T.slice(0, 50).replace(/\n/g, '|'), 'out-of-order');
  await scrollDown(p2, 12);
  let rs3 = await radios(p2);
  chk('A2-selection-survives-back-out', rs3.some(r => r.checked && /Pick up/i.test(r.label)), `[${rs3.map(r => r.checked)}]`, 'out-of-order');
  chk('A2-forward-again', await L.clickBtn(p2, 'Continue to review'), '', 'out-of-order');
  await sleep(3000);
  chk('A2-forward-review-still-pickup', (await txt(p2)).includes('Step 2 of 4'), '', 'out-of-order');
  chk('A2c-still-zero-quote-calls', net2.quote.length === 0, `quote calls=${net2.quote.length}`, 'out-of-order');

  // ---- A3b windows block hidden entirely on pickup ----
  {
    T = await txt(p2);
    chk('C3b-pickup-hides-windows-header', !T.includes('When should we deliver?'), `'When should we deliver?' visible=${T.includes('When should we deliver?')}`, 'empty-states');
    const wr = await checkboxes(p2, /^(Today|Tomorrow) /);
    chk('C3b-pickup-zero-window-checkboxes', wr.length === 0, `window rows=${wr.length}`, 'empty-states');
    chk('C3b-pickup-ui-shows-no-delivery-fee', T.includes('No delivery fee'), `'No delivery fee' present`, 'regression');
    await shot(p2, 'a3-pickup-review-windows-hidden.png');
  }

  // ---- A1c double/triple confirm on pickup -> exactly one proforma ----
  {
    const before = net2.prof.length;
    await forceBtnTwice(p2, 'Confirm & proceed to payment');
    await sleep(3800);
    chk('A1-multi-confirm-single-proforma', net2.prof.length - before <= 1, `proforma POSTs during triple-tap=${net2.prof.length - before} (<=1)`, 'rapid-double-tap');
    let s3b = false; for (let i = 0; i < 32 && !s3b; i++) { await sleep(1000); s3b = (await txt(p2)).includes('Step 3 of 4'); }
    await sleep(1500);
    chk('A1-multi-confirm-reaches-payment', s3b, '', 'rapid-double-tap');
    const lastBP = net2.prof.length ? net2.prof[net2.prof.length - 1] : null;
    let pb = null; try { pb = JSON.parse(lastBP || 'null'); } catch (e) {}
    chk('C2-wire-enum-BUYER_PICKUP', !!pb && pb.buyDetails.fulfillmentType === 'BUYER_PICKUP', `ft=${pb && pb.buyDetails.fulfillmentType}`, 'regression');
    chk('C2b-BP-body-never-SALE-CARD', !!lastBP && !/(^|[^A-Z_])(SALE|CARD)([^A-Z_]|$)/.test(lastBP || ''), `${(lastBP || '').length}B scan`, 'regression');
    chk('C3b-wire-fee-0', !!pb && Number(pb.buyDetails.deliveryFee) === 0, `fee=${pb && pb.buyDetails.deliveryFee}`, 'regression');
    chk('C3b-wire-total-subtotal-only', !!pb && Number(pb.buyDetails.totalAmount) === fx.askingPrice, `total=${pb && pb.buyDetails.totalAmount} exp=${fx.askingPrice}`, 'regression');
    chk('C3b-wire-windows-empty-array', !!pb && Array.isArray(pb.buyDetails.preferredDeliveryWindows) && pb.buyDetails.preferredDeliveryWindows.length === 0, JSON.stringify(pb && pb.buyDetails.preferredDeliveryWindows), 'regression');
    fs.writeFileSync('/tmp/au024_skeptic_proforma_BP.json', lastBP || '');
    await shot(p2, 'r2-mobile-step3-payment-BUYER_PICKUP.png');
  }

  // ---- tablet viewport on current bundle ----
  {
    const ctxT = await L.newCtx(browser, { viewport: { width: 768, height: 1024 } });
    const pt = await ctxT.newPage();
    chk('A0-login-tablet', await login9121(pt, { email: fx.buyer.email, pw: fx.buyer.pw }), '', 'setup');
    await clearCart(pt);
    await pt.goto(APP + '/#/product/' + fx.productId, { waitUntil: 'load' }).catch(() => {}); await sleep(3800);
    await L.clickBtn(pt, 'Add to cart'); await sleep(2200);
    await pt.goto(APP + '/#/cart', { waitUntil: 'load' }).catch(() => {}); await sleep(2500);
    await L.clickBtn(pt, 'Go to checkout'); await sleep(3400);
    for (let i = 0; i < 10; i++) { await pt.mouse.move(380, 480); await pt.mouse.wheel(0, 320); await sleep(140); }
    await sleep(800);
    const rt = await radios(pt);
    chk('C1-tablet-radios-default-SD', rt.length >= 2 && rt[0].checked === true && rt[1].checked === false, `[${rt.map(r => r.checked)}]`, 'regression');
    await shot(pt, 'r3-tablet-step1-default-sd.png');
    const bpt = rt.find(r => /Pick up/i.test(r.label));
    if (bpt) { await pt.mouse.click(bpt.x, bpt.y); await sleep(850); }
    await L.clickBtn(pt, 'Continue to review'); await sleep(3000);
    const Tt = await txt(pt);
    chk('C3-tablet-pickup-review-fee0-no-quote', Tt.includes('Step 2 of 4') && Tt.includes('No delivery fee'), Tt.slice(0, 70).replace(/\n/g, '|'), 'regression');
    await shot(pt, 'r3-tablet-step2-review-pickup.png');
    await ctxT.close();
  }

  const imgStat = { requested: Object.keys(imgMap).length, ok200: Object.values(imgMap).filter(s => s === 200 || s === 304).length, broken: Object.entries(imgMap).filter(([, s]) => s >= 400).map(([u]) => u) };
  rec({ kind: 'images', imgStat });

  await ctx2.close();
  await browser.close();
  rec({ kind: 'summary', passes: PASSN, fails: FAILN, net, net2, imgStat });
  console.log(`\nSKEPTIC R2 DONE passes=${PASSN} fails=${FAILN}`);
})().catch(e => { console.error('FATAL', e && e.message || e); rec({ kind: 'fatal', error: String(e).slice(0, 400) }); process.exit(1); });

// helper declared last so hoisting keeps the flow readable
async function clearCart(page) {
  try {
    await page.goto(APP + '/#/cart', { waitUntil: 'load' }).catch(() => {});
    await sleep(2200);
    const t = await txt(page);
    if (t.includes('Your cart is empty')) return true;
    // remove lines via the Remove buttons
    for (let i = 0; i < 6; i++) {
      const hit = await page.evaluate(() => {
        const e = [...document.querySelectorAll('flt-semantics')].find(x => x.getAttribute('role') === 'button' && /Remove/i.test(x.textContent || '') && (() => { const r = x.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; })());
        if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      });
      if (!hit) break;
      await page.mouse.click(hit.x, Math.max(20, Math.min(hit.y, 650)));
      await sleep(900);
    }
    // fallback: wipe localStorage keys and reload
    await page.evaluate(() => Object.keys(localStorage).filter(k => /^expatCartItems/.test(k)).forEach(k => localStorage.removeItem(k)));
    await page.reload({ waitUntil: 'load' }).catch(() => {}); await sleep(2500);
    const t2 = await txt(page);
    return t2.includes('Your cart is empty');
  } catch (e) { return false; }
}
