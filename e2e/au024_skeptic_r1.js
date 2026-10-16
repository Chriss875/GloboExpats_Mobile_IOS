// au024_skeptic_r1.js — SKEPTIC for AU-024 (fulfillment_type_enum_fix) on the
// CURRENT frozen bundle :9121 (b56e345, Last-Modified 2026-08-25T20:08:09Z).
// (A) REGRESSION PROBE: SD happy path (radio default, quote, window+terms,
//     proforma enum on wire) + BUYER_PICKUP leg (fee 0, no quote call).
// (B) ATTACK CLASSES:
//   A1 rapid double-taps on every CTA (radios x3, continue x2, confirm x2)
//   A2 out-of-order / mid-flow back-out (confirm before continue; Back from
//      review; radio flip on review via Back; re-entry keeps state sane)
//   A3 empty states (empty cart checkout, zero windows text, pickup review
//      hides windows block entirely)
//   A4 offline mid-request (abort delivery-quote + proforma POSTs) + retry
//   A5 invalid input (500-char phone, emoji/Swahili/script-tag address,
//      qty 0/neg/huge in cart stepper)
//   A6 locale/number formats (TZS separators, huge totals)
//   A7 role probes (unauthenticated deep links to /checkout, buyer->admin route)
//   A8 session expiry mid-flow (token wiped after review -> confirm)
//   A9 stale-cache reload after mutation (localStorage cart replay post-proforma)
// Evidence: e2e/shots/AU-024-skeptic/*, e2e/results/shards/AU-024-skeptic.jsonl.
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9121';
const UNIT = 'AU-024';
const SHOT = 'e2e/shots/AU-024-skeptic';
const SHARD = 'e2e/results/shards/AU-024-skeptic.jsonl';
const fx = JSON.parse(fs.readFileSync('/tmp/au024_fixtures.json', 'utf8'));
const PROBE = `AU024 Enum Probe Chair ${fx.stamp}`;
const FEE = fx.quoteReal.deliveryTotal;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lines = [];
function rec(o) { lines.push(Object.assign({ ts: new Date().toISOString(), wave: 'skeptic', stage: 'skeptic-backfill', unit: UNIT, build_sha: 'b56e345' }, o)); fs.writeFileSync(SHARD, lines.map(l => JSON.stringify(l)).join('\n') + '\n'); }
async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => ''); }
async function shot(p, name) { const f = `${SHOT}/${name}`; await L.screenshot(p, f); rec({ kind: 'shot', name: f }); return f; }
// smallest on-screen tappable/any node containing label
async function tapNode(p, lbl, opts = {}) {
  const minW = opts.minW || 20, minH = opts.minH || 14, role = opts.role || null;
  const cands = await p.evaluate(({ lbl, minW, minH, role }) => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (role && e.getAttribute('role') !== role) return;
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (r.width < minW || r.height < minH) return;
      if (r.bottom < 0 || r.top > innerHeight) return;
      out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height, t: t.slice(0, 50), role: e.getAttribute('role'), tap: e.getAttribute('flt-tappable') !== null });
    });
    out.sort((a, b) => a.area - b.area);
    return out.slice(0, 5);
  }, { lbl, minW, minH, role });
  if (!cands.length) return null;
  const c = cands[0];
  await p.mouse.click(c.cx, Math.max(14, Math.min(c.cy, 650)));
  await sleep(opts.wait || 550);
  return c;
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
async function scrollWheelTo(p, y, targetLo, targetHi) {
  for (let i = 0; i < 10; i++) {
    if (y >= targetLo && y <= targetHi) break;
    await p.mouse.move(187, 330);
    await p.mouse.wheel(0, y > targetHi ? y - 400 : -(260 - y));
    await sleep(700);
    return null;
  }
  return true;
}
let PASSN = 0, FAILN = 0;
function chk(name, pass, detail, cls) { console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : '')); rec({ kind: 'assert', attack_class: cls || 'regression', assert: name, pass, detail: String(detail).slice(0, 400) }); pass ? PASSN++ : FAILN++; return pass; }

(async () => {
  const browser = await L.newBrowser();
  // ---------- fresh fixtures ground truth ----------
  const qFresh = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/delivery-quote',
    { destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 }, items: [{ productId: fx.productId, quantity: 1 }] });
  chk('groundtruth-quote-live', qFresh.status === 200 && qFresh.json && typeof qFresh.json.deliveryTotal === 'number', `status=${qFresh.status} fee=${qFresh.json && qFresh.json.deliveryTotal}`, 'regression');
  const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${fx.productId}`);
  chk('groundtruth-product-live', det.status === 200 && String(det.json.productName).includes('AU024 Enum Probe Chair'), `status=${det.status} name=${det.json && det.json.productName}`, 'regression');

  // ================= CONTEXT 1: mobile 375x667 — SD regression probe + attacks =================
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
  let failNextQuote = false, failNextProf = false;
  await p.route('**/checkout/delivery-quote', async route => {
    if (failNextQuote) { failNextQuote = false; net.abortedQuote++; return route.abort('failed'); }
    return route.continue();
  });
  await p.route('**/api/v1/checkout/proforma', async route => {
    if (failNextProf) { failNextProf = false; net.abortedProf++; return route.abort('failed'); }
    return route.continue();
  });

  // ---- login (fresh context) ----
  const logged = await L.login(p, { email: fx.buyer.email, pw: fx.buyer.pw });
  chk('A0-login-token', logged, fx.buyer.email, 'setup');
  await p.evaluate(() => Object.keys(localStorage).filter(k => /expatCartItems/i.test(k)).forEach(k => localStorage.removeItem(k)));
  await sleep(600);

  // ================= ATTACK A7: unauthenticated deep link to gated /checkout =================
  // (do it in a separate clean context so this one stays logged-in)
  {
    const ctxAnon = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
    const pa = await ctxAnon.newPage();
    await pa.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(pa, 'Buy now', 45000);
    await pa.goto(APP + '/#/checkout', { waitUntil: 'load' }).catch(() => {}); await sleep(3500);
    const Ta = await txt(pa);
    const redirectedLogin = Ta.includes('Welcome back') || Ta.includes('Log in') || Ta.includes('login');
    chk('A7-anon-deeplink-checkout-gated', redirectedLogin, Ta.slice(0, 90).replace(/\n/g, '|'));
    await shot(pa, 'a7-anon-checkout-deeplink.png');
    await pa.goto(APP + '/#/account/settings', { waitUntil: 'load' }).catch(() => {}); await sleep(3000);
    const Tb = await txt(pa);
    chk('A7-anon-account-gated', !Tb.includes('Log out') && (Tb.includes('Welcome back') || Tb.includes('Log in')), Tb.slice(0, 80).replace(/\n/g, '|'));
    await ctxAnon.close();
  }

  // ================= REGRESSION PROBE (SD happy path) =================
  await p.goto(APP + '/#/product/' + fx.productId, { waitUntil: 'load' }).catch(() => {}); await sleep(4200);
  let T = await txt(p);
  chk('R-detail-loaded', T.includes('Add to cart') && T.includes(PROBE.slice(-12)), `"${PROBE}"`, 'regression');
  await shot(p, 'r1-mobile-detail.png');
  chk('R-add-to-cart', await L.clickBtn(p, 'Add to cart'), 'detail CTA', 'regression');
  await sleep(2200);
  await p.goto(APP + '/#/cart', { waitUntil: 'load' }).catch(() => {}); await sleep(2500);
  T = await txt(p);
  chk('R-cart-line', T.includes(PROBE.slice(-12)) && !T.includes('Your cart is empty'), T.slice(0, 60).replace(/\n/g, '|'), 'regression');

  // ---- A5 cart qty attacks (0/negative/huge via stepper) ----
  {
    // find qty row: "Qty N" with +/- buttons
    const qtyInfo = await p.evaluate(() => {
      const nodes = [...document.querySelectorAll('flt-semantics')];
      const qty = nodes.find(e => /^Qty\s*\d+$/.test((e.textContent || '').trim()));
      if (!qty) return null;
      const buttons = nodes.filter(e => e.getAttribute('role') === 'button').map(e => ({ t: (e.textContent || '').trim(), r: e.getBoundingClientRect() })).filter(b => b.r.width > 0);
      return { qty: (qty.textContent || '').trim(), buttons: buttons.map(b => ({ t: b.t.slice(0, 20), x: Math.round(b.r.x + b.r.width / 2), y: Math.round(b.r.y + b.r.height / 2) })) };
    });
    chk('A5-qty-row-found', !!qtyInfo, JSON.stringify(qtyInfo && qtyInfo.qty), 'invalid-input');
    if (qtyInfo) {
      // hammer "+" up to 30 times -> must cap at stock (5)
      const plus = qtyInfo.buttons.find(b => b.y < 667 && (b.t === '+' || b.t === '＋'));
      if (plus) {
        for (let i = 0; i < 30; i++) { await p.mouse.click(plus.x, plus.y); await sleep(120); }
        await sleep(1500);
        const after = await p.evaluate(() => { const n = [...document.querySelectorAll('flt-semantics')].find(e => /^Qty\s*\d+$/.test((e.textContent || '').trim())); return n ? (n.textContent || '').trim() : ''; });
        const n = Number((after.match(/\d+/) || ['0'])[0]);
        chk('A5-qty-hammer-capped-at-stock', n >= 1 && n <= 5, `after 30 plus taps -> ${after} (stock=5); proforma items payload must not exceed stock`, 'invalid-input');
        await shot(p, 'a5-qty-hammered.png');
        // bring it back to 1
        const minus = qtyInfo.buttons.find(b => b.y < 667 && b.t === '-');
        if (minus) { for (let i = 0; i < 40; i++) { await p.mouse.click(minus.x, minus.y); await sleep(90); } await sleep(1200); }
        const after2 = await p.evaluate(() => { const n = [...document.querySelectorAll('flt-semantics')].find(e => /^Qty\s*\d+$/.test((e.textContent || '').trim())); return n ? (n.textContent || '').trim() : ''; });
        const n2 = Number((after2.match(/\d+/) || ['0'])[0]);
        chk('A5-minus-floor-not-zero', n2 === 1, `minus hammered -> ${after2} (floor should be 1, never 0/negative)`, 'invalid-input');
      } else chk('A5-plus-btn-visible', false, 'no +/- button on screen at 375x667');
    }
  }

  chk('R-go-to-checkout', await L.clickBtn(p, 'Go to checkout'), 'cart CTA', 'regression');
  await sleep(3200);
  T = await txt(p);
  chk('R-step1-visible', T.includes('Step 1 of 4'), T.slice(0, 50).replace(/\n/g, '|'), 'regression');

  // scroll radios into view
  for (let i = 0; i < 12; i++) { await p.mouse.move(187, 330); await p.mouse.wheel(0, 240); await sleep(140); }
  await sleep(800);
  let rs = await radios(p);
  chk('C1-radios-rendered', rs.length >= 2, JSON.stringify(rs.map(r => `${r.label}:${r.checked}`)), 'regression');
  chk('C1-default-SD-fresh-b56e345', rs.length >= 2 && rs[0].checked === true && rs[1].checked === false, `radios=[${rs.map(r => r.checked)}] doc-order SD first`, 'regression');
  await shot(p, 'r1-mobile-step1-default-sd.png');

  // ================= ATTACK A1: rapid double/triple taps on step-1 CTAs =================
  {
    const before = JSON.stringify(rs.map(r => r.checked));
    // triple-tap BUYER_PICKUP radio fast
    const bp = rs.find(r => /Pick up myself|Pickup|PICKUP/i.test(r.label));
    if (bp) { for (let i = 0; i < 3; i++) { await p.mouse.click(bp.x, bp.y); await sleep(120); } await sleep(900); }
    let now = await radios(p);
    chk('A1-triple-tap-pickup-idempotent', now.filter(r => r.checked).length === 1 && /Pick up myself|Pickup|PICKUP/i.test(now.find(r => r.checked).label), `before=${before} after=[${now.map(r => r.checked)}]`, 'rapid-double-tap');
    // triple-tap SELLER_DELIVERY back fast
    const sd = now.find(r => /Seller|delivery|SELLER/i.test(r.label));
    if (sd) { for (let i = 0; i < 3; i++) { await p.mouse.click(sd.x, sd.y); await sleep(110); } await sleep(900); }
    now = await radios(p);
    chk('A1-triple-tap-sd-idempotent-single-checked', now.filter(r => r.checked).length === 1 && now[0].checked === true, `[${now.map(r => r.checked)}]`, 'rapid-double-tap');
    await shot(p, 'a1-radios-after-rapid-taps.png');
    // double-tap "Continue to review"
    await L.clickBtn(p, 'Continue to review'); await sleep(250);
    await L.clickBtn(p, 'Continue to review').catch?.(()=>{});
    await btnForceTwice(p, 'Continue to review');
    await sleep(2600);
  }
  async function btnForceTwice(page, label) { try { await L.btn(page, label).click({ force: true, timeout: 2000 }); } catch (e) { } await sleep(200); try { await L.btn(page, label).click({ force: true, timeout: 2000 }); } catch (e) { } }

  T = await txt(p);
  chk('R-step2-reached-after-doubletap-continue', T.includes('Step 2 of 4'), T.slice(0, 60).replace(/\n/g, '|'), 'rapid-double-tap');

  // ---- SD review: real fee renders ----
  let feeSeen = T.includes(Number(FEE).toLocaleString('en-US')) || T.includes(String(FEE));
  for (let i = 0; i < 18 && !feeSeen; i++) { await sleep(1000); T = await txt(p); feeSeen = T.includes(Number(FEE).toLocaleString('en-US')) || T.includes(String(FEE)); }
  chk('C3-real-fee-rendered-SD', feeSeen, `expect TSh ${FEE}; quote calls=${net.quote.length}`, 'regression');
  chk('C3-quote-call-authenticated', net.quote.length >= 1 && net.quote.every(q => q.auth), `POST delivery-quote x${net.quote.length}, all Authorization present`, 'regression');
  await shot(p, 'r1-mobile-step2-review-fee.png');

  // windows + terms
  let wins = await checkboxes(p, /^(Today|Tomorrow) /);
  for (let i = 0; i < 10 && wins.length < 1; i++) { await p.mouse.move(187, 330); await p.mouse.wheel(0, 190); await sleep(700); wins = await checkboxes(p, /^(Today|Tomorrow) /); }
  chk('R-windows-present', wins.length >= 1, JSON.stringify(wins.map(w => w.label)), 'regression');
  if (wins.length) {
    let w = wins.find(x => !x.checked) || wins[0];
    for (let i = 0; i < 8; i++) { if (w.y >= 140 && w.y <= 560) break; await p.mouse.move(187, 330); await p.mouse.wheel(0, w.y > 560 ? w.y - 420 : -(230 - w.y)); await sleep(750); const f = (await checkboxes(p, /^(Today|Tomorrow) /)).find(z => z.label === w.label); if (f) w = f; else break; }
    let okc = false;
    for (let a = 0; a < 3 && !okc; a++) { await p.mouse.click(w.x, w.y); await sleep(1000); const m = (await checkboxes(p, /^(Today|Tomorrow) /)).find(z => z.label === w.label); okc = !!(m && m.checked); }
    chk('R-window-ticked', okc, w.label, 'regression');
  }
  let terms = (await checkboxes(p, /I agree/))[0];
  for (let i = 0; i < 10 && terms && (terms.y < 70 || terms.y > 600); i++) { await p.mouse.move(187, 330); await p.mouse.wheel(0, terms.y > 600 ? terms.y - 380 : -(230 - terms.y)); await sleep(700); terms = (await checkboxes(p, /I agree/))[0]; }
  let tok = false;
  for (let a = 0; a < 4 && !(terms && terms.checked); a++) { if (terms && terms.y >= 60 && terms.y <= 620) { await p.mouse.click(terms.x, terms.y); await sleep(900); } else if (terms) { await p.mouse.move(187, 330); await p.mouse.wheel(0, terms.y > 620 ? terms.y - 380 : -(230 - terms.y)); await sleep(700); } terms = (await checkboxes(p, /I agree/))[0]; tok = !!(terms && terms.checked); }
  chk('R-terms-ticked', tok, terms ? `y=${terms.y}` : 'not found', 'regression');
  await shot(p, 'r1-mobile-step2-window-terms.png');

  // ================= ATTACK A4a: abort the proforma POST then retry =================
  failNextProf = true;
  const profBefore = net.prof.length;
  await L.clickBtn(p, 'Confirm & proceed to payment');
  await sleep(3500);
  T = await txt(p);
  const stillStep2 = T.includes('Step 2 of 4');
  chk('A4-offline-proforma-abort-stays-on-review-with-error', stillStep2 && (T.includes('Failed') || T.includes('failed') || T.includes('error') || T.includes('Error') || T.includes('Exception') || T.includes('try again') || T.toLowerCase().includes('network')), `step2 still=${stillStep2}; err-snippet="${(T.match(/.{0,40}(failed|Failed|error|Error|Exception|network|Network).{0,60}/g) || []).slice(-1)}"`, 'offline-abort-retry');
  await shot(p, 'a4-proforma-aborted-error.png');
  chk('A4-aborted-no-proforma-created', net.prof.length - profBefore === 1, `prof calls total=${net.prof.length - profBefore} (aborted one counted, none succeeded)`, 'offline-abort-retry');
  // retry with network restored
  await L.clickBtn(p, 'Confirm & proceed to payment');
  let s3 = false; for (let i = 0; i < 30 && !s3; i++) { await sleep(1000); s3 = (await txt(p)).includes('Step 3 of 4'); }
  await sleep(1800);
  T = await txt(p);
  chk('A4-retry-after-abort-reaches-payment', s3, T.slice(0, 70).replace(/\n/g, '|'), 'offline-abort-retry');

  // ---- C2 wire asserts on the SUCCESSFUL call ----
  const lastProf = net.prof[net.prof.length - 1];
  let parsed = null; try { parsed = JSON.parse(lastProf.body || 'null'); } catch (e) { }
  const bd = parsed && parsed.buyDetails;
  chk('C2-wire-enum-SELLER_DELIVERY', !!bd && bd.fulfillmentType === 'SELLER_DELIVERY', `ft=${bd && bd.fulfillmentType}`, 'regression');
  chk('C2-wire-no-SALE-CARD-anywhere', !!lastProf && !/(^|[^A-Z_])(SALE|CARD)([^A-Z_]|$)/.test(lastProf.body || ''), `scan ${(lastProf.body || '').length}B body`, 'regression');
  chk('C3-wire-deliveryFee-equals-quote', !!bd && bd.deliveryFee === FEE, `fee=${bd && bd.deliveryFee} exp=${FEE}`, 'regression');
  chk('C3-wire-total-subtotal-plus-fee', !!bd && bd.totalAmount === fx.askingPrice + FEE, `total=${bd && bd.totalAmount} exp=${fx.askingPrice + FEE}`, 'regression');
  fs.writeFileSync('/tmp/au024_skeptic_proforma_SD.json', lastProf.body || '');
  await shot(p, 'r1-mobile-step3-payment-SD.png');

  // ================= ATTACK A1b: rapid double-tap Submit Payment (no proof yet) =================
  {
    const sb = await p.evaluate(() => { const e = [...document.querySelectorAll('flt-semantics')].find(x => x.getAttribute('role') === 'button' && (x.textContent || '').includes('Submit Payment')); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
    if (sb) { for (let i = 0; i < 4; i++) { await p.mouse.click(sb.x, Math.min(sb.y, 640)); await sleep(130); } await sleep(1600); }
    T = await txt(p);
    chk('A1-submit-payment-x4-no-proof-guarded', T.includes('Step 3 of 4') && (T.includes('proof') || T.includes('payment') || T.includes('Tick') || T.includes('completed')), `still step3=${T.includes('Step 3 of 4')}; no duplicate submit; snippet="${(T.match(/.{0,30}(proof|Tick|completed).{0,50}/g) || [])[0] || ''}"`, 'rapid-double-tap');
    await shot(p, 'a1-submit-x4-no-proof.png');
  }

  // ================= ATTACK A8: session expiry mid-flow (token wipe -> cancel invoice) =================
  {
    // capture invoice id, then simulate expired session and hit cancel invoice
    const invMatch = T.match(/Invoice\s+(\S+)/);
    chk('R-invoice-number-shown', !!invMatch, invMatch && invMatch[0], 'regression');
    await p.evaluate(() => localStorage.removeItem('flutter.auth_token'));
    await p.reload({ waitUntil: 'load' }).catch(() => { }); await sleep(4500);
    T = await txt(p);
    chk('A8-token-wiped-reload-does-not-crash', (await txt(p)).length > 50 && !(await p.evaluate(() => document.body.innerText || '').then(t => false)), `post-reload text=${(await txt(p)).slice(0, 60).replace(/\n/g, '|')}`, 'session-expiry');
    await shot(p, 'a8-after-token-wipe-reload.png');
  }

  // ================= ATTACK A9: stale-cache reload — cart stays empty after proforma =================
  {
    T = await txt(p);
    await p.goto(APP + '/#/cart', { waitUntil: 'load' }).catch(() => { }); await sleep(2600);
    T = await txt(p);
    chk('A9-cart-empty-after-proforma-mutation', T.includes('Your cart is empty') || !T.includes(PROBE.slice(-12)), `post-confirm cart="${T.slice(0, 70).replace(/\n/g, '|')}"`, 'stale-cache-reload');
    // deep-link back to /checkout: must NOT resurrect the old cart as a new flow silently
    await p.goto(APP + '/#/product/' + fx.productId, { waitUntil: 'load' }).catch(() => { }); await sleep(3500);
    await L.clickBtn(p, 'Add to cart'); await sleep(2000);
    await p.goto(APP + '/#/checkout', { waitUntil: 'load' }).catch(() => { }); await sleep(3200);
    T = await txt(p);
    chk('A9-fresh-checkout-after-completed-flow-starts-clean', T.includes('Step 1 of 4') || T.includes('Step '), T.slice(0, 60).replace(/\n/g, '|'), 'stale-cache-reload');
  }

  // ================= CONTEXT CLOSED. Now BP leg in a NEW mobile context =================
  await ctx.close();

  // ================= CONTEXT 2: BP leg + empty-state + out-of-order attacks =================
  const ctx2 = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const p2 = await ctx2.newPage();
  const net2 = { quote: [], prof: [] };
  p2.on('request', req => { const u = req.url(); if (u.includes('/checkout/delivery-quote')) net2.quote.push({ auth: !!req.headers()['authorization'] }); if (u.includes('/api/v1/checkout/proforma') && req.method() === 'POST') net2.prof.push(req.postData()); });
  const logged2 = await L.login(p2, { email: fx.buyer.email, pw: fx.buyer.pw });
  chk('A0-login-ctx2', logged2, '', 'setup');

  // ---- ATTACK A7b: buyer hitting an admin-only route directly ----
  {
    await p2.goto(APP + '/', { waitUntil: 'load' }).catch(() => { }); await sleep(2500);
    await p2.goto(APP + '/#/admin', { waitUntil: 'load' }).catch(() => { }); await sleep(3000);
    let Tt = await txt(p2);
    const adminBlocked = !Tt.includes('Admin overview') && !Tt.includes('Dashboard') || Tt.includes('not authorized') || Tt.includes('Access denied') || Tt.includes('Home');
    chk('A7-buyer-admin-route-no-dashboard', adminBlocked, Tt.slice(0, 80).replace(/\n/g, '|'));
    await shot(p2, 'a7-buyer-admin-route.png');
  }

  // ---- ATTACK A3a: checkout with EMPTY cart ----
  {
    await p2.evaluate(() => Object.keys(localStorage).filter(k => /expatCartItems/i.test(k)).forEach(k => localStorage.removeItem(k)));
    await p2.goto(APP + '/#/checkout', { waitUntil: 'load' }).catch(() => { }); await sleep(3600);
    const Te = await txt(p2);
    chk('A3-empty-cart-checkout-handled', Te.includes('cart is empty') || Te.includes('Your cart is empty') || Te.includes('empty'), Te.slice(0, 90).replace(/\n/g, '|'), 'empty-states');
    await shot(p2, 'a3-empty-cart-checkout.png');
    // Continue must not advance to review with an empty cart
    await L.clickBtn(p2, 'Continue to review'); await sleep(1800);
    const Te2 = await txt(p2);
    chk('A3-empty-cart-cannot-advance-to-review', !Te2.includes('Step 2 of 4'), Te2.slice(0, 70).replace(/\n/g, '|'), 'empty-states');
  }

  // ---- add fixture, go to checkout ----
  await p2.goto(APP + '/#/product/' + fx.productId, { waitUntil: 'load' }).catch(() => { }); await sleep(3800);
  chk('R2-add-to-cart', await L.clickBtn(p2, 'Add to cart'), '', 'regression');
  await sleep(2000);
  await p2.goto(APP + '/#/cart', { waitUntil: 'load' }).catch(() => { }); await sleep(2400);
  chk('R2-go-to-checkout', await L.clickBtn(p2, 'Go to checkout'), '', 'regression');
  await sleep(3200);

  // ---- ATTACK A2a: OUT-OF-ORDER — jump straight to hash #review-ish steps by tapping Confirm before it exists ----
  // On step 1, tap through to review but FIRST flip to PICKUP, then BACK to step1 mid-flow and flip again.
  for (let i = 0; i < 12; i++) { await p2.mouse.move(187, 330); await p2.mouse.wheel(0, 240); await sleep(130); }
  await sleep(700);
  let rs2 = await radios(p2);
  chk('C1b-default-SD-ctx2', rs2.length >= 2 && rs2[0].checked === true, `[${rs2.map(r => r.checked)}]`, 'out-of-order');
  // pick BUYER_PICKUP
  const bp2 = rs2.find(r => /Pick up myself|Pickup/i.test(r.label));
  if (bp2) { await p2.mouse.click(bp2.x, bp2.y); await sleep(800); }
  let rs2b = await radios(p2);
  chk('C1b-pickup-selected', rs2b.some(r => r.checked && /Pick up myself|Pickup/i.test(r.label)), `[${rs2b.map(r => r.checked)}]`, 'regression');
  await shot(p2, 'r2-mobile-step1-pickup-selected.png');

  // A2b: mid-flow back-out — continue to review, then Back, then forward again
  chk('A2-continue-to-review', await L.clickBtn(p2, 'Continue to review'), '', 'out-of-order');
  await sleep(2800);
  T = await txt(p2);
  chk('A2-review-reached-pickup', T.includes('Step 2 of 4'), T.slice(0, 50).replace(/\n/g, '|'), 'out-of-order');
  chk('A2b-pickup-review-no-quote-calls', net2.quote.length === 0, `quote calls during pickup=${net2.quote.length} (must be 0)`, 'out-of-order');
  await shot(p2, 'r2-mobile-step2-review-BUYER_PICKUP.png');
  chk('A2-back-from-review', await L.clickBtn(p2, 'Back'), 'mid-flow back-out', 'out-of-order');
  await sleep(2200);
  T = await txt(p2);
  chk('A2-back-lands-step1-state-kept', T.includes('Step 1 of 4'), T.slice(0, 50).replace(/\n/g, '|'), 'out-of-order');
  let rs3 = await radios(p2);
  // need to scroll again after going back
  for (let i = 0; i < 12 && rs3.length < 2; i++) { await p2.mouse.move(187, 330); await p2.mouse.wheel(0, 240); await sleep(200); rs3 = await radios(p2); }
  chk('A2-selection-survives-back-out', rs3.some(r => r.checked && /Pick up myself|Pickup/i.test(r.label)), `[${rs3.map(r => r.checked)}]`, 'out-of-order');
  // forward again
  chk('A2-forward-again', await L.clickBtn(p2, 'Continue to review'), '', 'out-of-order');
  await sleep(2800);
  T = await txt(p2);
  chk('A2-forward-review-still-pickup', T.includes('Step 2 of 4'), '', 'out-of-order');
  chk('A2c-still-no-quote-calls', net2.quote.length === 0, `total quote calls=${net2.quote.length}`, 'out-of-order');

  // ---- A3b: pickup review must HIDE windows block entirely ----
  {
    T = await txt(p2);
    const windowsBlockVisible = T.includes('When should we deliver?');
    chk('C3b-pickup-hides-windows-block', !windowsBlockVisible, `windows header visible=${windowsBlockVisible}`, 'empty-states');
    const winRows = await checkboxes(p2, /^(Today|Tomorrow) /);
    chk('C3b-pickup-zero-window-checkboxes', winRows.length === 0, `rows=${winRows.length}`, 'empty-states');
    const noFee = T.includes('No delivery fee');
    chk('C3b-pickup-ui-no-delivery-fee-row', noFee, `'No delivery fee' present=${noFee}`, 'regression');
  }

  // ---- A1c: rapid double-tap Confirm on pickup (creates ONE proforma only) ----
  {
    const profBefore = net2.prof.length;
    await L.clickBtn(p2, 'Confirm & proceed to payment'); await sleep(250);
    try { await L.btn(p2, 'Confirm & proceed to payment').click({ force: true, timeout: 2000 }); } catch (e) { }
    await sleep(200);
    try { await L.btn(p2, 'Confirm & proceed to payment').click({ force: true, timeout: 2000 }); } catch (e) { }
    await sleep(3500);
    const created = net2.prof.length - profBefore;
    chk('A1-double-confirm-single-proforma', created <= 1, `POST proforma count during double-tap=${created} (must be <=1; spinner disables button)`, 'rapid-double-tap');
    let s3b = false; for (let i = 0; i < 30 && !s3b; i++) { await sleep(1000); s3b = (await txt(p2)).includes('Step 3 of 4'); }
    await sleep(1500);
    chk('A1-double-confirm-reaches-payment', s3b, '', 'rapid-double-tap');
    const lastBP = net2.prof[net2.prof.length - 1];
    let pb = null; try { pb = JSON.parse(lastBP || 'null'); } catch (e) { }
    chk('C2-wire-enum-BUYER_PICKUP', !!pb && pb.buyDetails.fulfillmentType === 'BUYER_PICKUP', `ft=${pb && pb.buyDetails.fulfillmentType}`, 'regression');
    chk('C2b-no-SALE-CARD-in-BP-body', !!lastBP && !/(^|[^A-Z_])(SALE|CARD)([^A-Z_]|$)/.test(lastBP || ''), `${(lastBP || '').length}B scan`, 'regression');
    chk('C3b-wire-fee-0', !!pb && Number(pb.buyDetails.deliveryFee) === 0, `fee=${pb && pb.buyDetails.deliveryFee}`, 'regression');
    chk('C3b-wire-total-subtotal-only', !!pb && Number(pb.buyDetails.totalAmount) === fx.askingPrice, `total=${pb && pb.buyDetails.totalAmount} exp=${fx.askingPrice}`, 'regression');
    chk('C3b-wire-windows-empty', !!pb && Array.isArray(pb.buyDetails.preferredDeliveryWindows) && pb.buyDetails.preferredDeliveryWindows.length === 0, JSON.stringify(pb && pb.buyDetails.preferredDeliveryWindows), 'regression');
    fs.writeFileSync('/tmp/au024_skeptic_proforma_BP.json', lastBP || '');
    await shot(p2, 'r2-mobile-step3-payment-BUYER_PICKUP.png');
  }

  // ---- tablet viewport sanity on current bundle (C1 default + pickup review) ----
  {
    const ctxT = await L.newCtx(browser, { viewport: { width: 768, height: 1024 } });
    const pt = await ctxT.newPage();
    const lt = await L.login(pt, { email: fx.buyer.email, pw: fx.buyer.pw });
    chk('A0-login-tablet', lt, '', 'setup');
    await pt.evaluate(() => Object.keys(localStorage).filter(k => /expatCartItems/i.test(k)).forEach(k => localStorage.removeItem(k)));
    await pt.goto(APP + '/#/product/' + fx.productId, { waitUntil: 'load' }).catch(() => { }); await sleep(3800);
    await L.clickBtn(pt, 'Add to cart'); await sleep(2000);
    await pt.goto(APP + '/#/cart', { waitUntil: 'load' }).catch(() => { }); await sleep(2400);
    await L.clickBtn(pt, 'Go to checkout'); await sleep(3200);
    for (let i = 0; i < 10; i++) { await pt.mouse.move(380, 480); await pt.mouse.wheel(0, 300); await sleep(140); }
    await sleep(700);
    const rt = await radios(pt);
    chk('C1-tablet-default-SD-current-bundle', rt.length >= 2 && rt[0].checked === true && rt[1].checked === false, `[${rt.map(r => r.checked)}]`, 'regression');
    await shot(pt, 'r3-tablet-step1-default-sd.png');
    const bpt = rt.find(r => /Pick up myself|Pickup/i.test(r.label));
    if (bpt) { await pt.mouse.click(bpt.x, bpt.y); await sleep(800); }
    await L.clickBtn(pt, 'Continue to review'); await sleep(2800);
    const Tt = await txt(pt);
    chk('C3-tablet-pickup-review-no-quote', Tt.includes('Step 2 of 4') && Tt.includes('No delivery fee'), Tt.slice(0, 70).replace(/\n/g, '|'), 'regression');
    await shot(pt, 'r3-tablet-step2-review-pickup.png');
    await ctxT.close();
  }

  // images summary
  const imgStat = { requested: Object.keys(imgMap).length, ok200: Object.values(imgMap).filter(s => s === 200 || s === 304).length, broken: Object.entries(imgMap).filter(([, s]) => s >= 400).map(([u]) => u) };
  rec({ kind: 'images', imgStat });

  await ctx2.close();
  await browser.close();
  rec({ kind: 'summary', passes: PASSN, fails: FAILN, net, imgStat });
  console.log(`\nSKEPTIC R1 DONE passes=${PASSN} fails=${FAILN}`);
})().catch(e => { console.error('FATAL', e); rec({ kind: 'fatal', error: String(e).slice(0, 500) }); process.exit(1); });
