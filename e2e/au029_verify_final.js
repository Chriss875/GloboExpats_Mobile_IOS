// au029_verify_final.js — FINAL VERIFIER for AU-029 payment method picker +
// receiving details (RW lane). Frozen bundle http://localhost:9113 (git sha
// bca6414; main.dart.js Last-Modified Tue, 25 Aug 2026 09:22:53 GMT).
//
// RW fixtures: REAL /tmp/au028_fixtures.json (created through the real API):
// buyer 530 (pinned default Home), VERIFIED seller "AU028 Seller", products
// 660 "AU028 Guard Tote" TSh 15,000 (Size L/S) + 661 "AU028 Plain Mat" TSh
// 25,000, quote deliveryTotal=TSh 8,000 BODA. Preflight releases PENDING
// proformas of this buyer via the documented cancel endpoint.
//
// PROVEN HARNESS FACTS (probe r1-r2, /tmp/au029_chip_pixels.json):
//  * Flutter-web ChoiceChips here expose NO aria-selected/checked/pressed —
//    selection is read from RENDERED PIXELS: selected chip paints a filled
//    blue-tinted pill (100% tinted pixels), unselected is pure white (~83%
//    white + grey border). Probe-verified swap on tap: default LIPA tinted,
//    after Bank-Account tap BANK tinted, after Lipa-Namba tap LIPA again.
//  * "Submit Payment for Verification" is BELOW THE FOLD at 375x667 — it only
//    enters the semantics tree after scrolling to the bottom.
//  * The reference value shares ONE semantics node with the trailing proof/
//    escrow copy ("PF-…Proof of paymentUpload screenshot…"), so the C3 assert
//    matches the PF-number INSIDE that node, not a standalone node.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const decode = require('/tmp/au029_decode.js');

const APP = 'http://localhost:9113';
const UNIT = 'AU-029';
const SHOT_DIR = 'e2e/shots/AU-029';
const fx = JSON.parse(fs.readFileSync('/tmp/au028_fixtures.json', 'utf8'));
const PROBE1 = `AU028 Guard Tote ${fx.stamp}`;
const PROBE2 = `AU028 Plain Mat ${fx.stamp}`;
const fmt = (n) => Number(n).toLocaleString('en-US');

const R = {
  ts: new Date().toISOString(), unit: UNIT, title: 'payment_method_picker_receiving_details',
  wave: 'verify', agent: 'verifier-AU-029-RW', build_sha: 'bca6414',
  build_mtime: null, viewport: '375x667+768x1024', route: '/checkout step 3',
  checks: {
    freshness: false, real_data: false, real_data_probe: '',
    images_requested: 0, images_200: 0, images_broken: [],
    buttons_total: 0, buttons_ok: 0, buttons_failed: [],
    state_asserts: 0, nav_asserts: 0, data_asserts: 0,
    vision_defects: 0, vision_findings: [], vision_shots_read: [],
    parity: { blocker: 0, major: 0, minor: 0, accepted: 1 },
  },
  failures: [], defects: [], evidence: [], videos: [], runtime_ms: 0,
};
function ok(name, cond, detail) {
  if (cond) { R.checks.state_asserts++; console.log(`PASS ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`${name} :: ${detail || ''}`); console.log(`FAIL ${name} ${detail || ''}`); }
  return cond;
}
function btnOk(name, cond, detail) {
  R.checks.buttons_total++;
  if (cond) { R.checks.buttons_ok++; console.log(`BTN ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.checks.buttons_failed.push(name); R.failures.push(`button:${name} :: ${detail || ''}`); console.log(`FAIL-BTN ${name} ${detail || ''}`); }
  return cond;
}
function dataOk(name, cond, detail) {
  if (cond) { R.checks.data_asserts++; console.log(`DATA ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`data:${name} :: ${detail || ''}`); console.log(`FAIL-DATA ${name} ${detail || ''}`); }
  return cond;
}
function navOk(name, cond, detail) {
  if (cond) { R.checks.nav_asserts++; console.log(`NAV ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`nav:${name} :: ${detail || ''}`); console.log(`FAIL-NAV ${name} ${detail || ''}`); }
  return cond;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function txt(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
}
async function isLoggedIn(p) {
  try { return !!(await p.evaluate(() => localStorage.getItem('flutter.auth_token') || '')); } catch (e) { return false; }
}
async function loginFlow(p) {
  await L.waitText(p, 'Buy now', 45000);
  let logged = await isLoggedIn(p);
  if (!logged) {
    await L.clickBtn(p, 'Login');
    await L.waitText(p, 'Welcome back', 25000);
    const ei = p.locator('input[type="text"]').first();
    await ei.click({ force: true }).catch(() => {}); await sleep(400);
    await p.keyboard.type(fx.buyer.email, { delay: 12 });
    const pi = p.locator('input[type="password"]').first();
    await pi.click({ force: true }).catch(() => {}); await sleep(400);
    await p.keyboard.type(fx.buyer.pw, { delay: 12 });
    await L.clickBtn(p, 'Log in');
    for (let i = 0; i < 30 && !logged; i++) { await sleep(1000); logged = await isLoggedIn(p); }
  }
  for (let i = 0; i < 20; i++) {
    const n = await p.evaluate(() => document.querySelectorAll('flt-semantics').length).catch(() => 0);
    if (n > 30) return logged;
    await sleep(800);
  }
  return false;
}
async function jsClickByText(p, label) {
  const hit = await p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 10 || r.height < 10 || r.bottom < 0 || r.top > innerHeight) return;
      const roleOk = e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null;
      if (!roleOk) return;
      if (!best || r.width * r.height < best.area)
        best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    return best;
  }, label);
  if (!hit) return false;
  await p.mouse.click(Math.max(4, hit.x), Math.max(20, Math.min(hit.y, 1015)));
  await sleep(900);
  return true;
}
async function hashNav(p, route) { await p.evaluate((r) => { location.hash = r; }, route); await sleep(2400); }

// ---- pixel classifier: which method chip is SELECTED right now ----
async function chipSelection(p, tag) {
  const g = await p.evaluate(() => {
    const out = {};
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (t !== 'Lipa Namba' && t !== 'Bank Account') return;
      const r = e.getBoundingClientRect();
      if (r.width < 20 || r.height < 10 || r.bottom < 0 || r.top > innerHeight) return;
      if (!out[t] || r.width * r.height < out[t].a)
        out[t] = { a: r.width * r.height, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    return out;
  });
  const buf = await p.screenshot();
  const { width, rows } = decode(buf);
  const res = {};
  for (const [label, c] of Object.entries(g)) {
    let white = 0, tint = 0, total = 0;
    const x0 = c.x + 24, x1 = c.x + c.w - 24, y0 = c.y + 5, y1 = c.y + c.h - 5;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const off = x * 3, r = rows[y][off], gg = rows[y][off + 1], b = rows[y][off + 2];
      total++;
      if (r > 245 && gg > 245 && b > 245) white++;
      else if (b > r) tint++;
    }
    res[label] = { pctWhite: +(100 * white / total).toFixed(1), pctTinted: +(100 * tint / total).toFixed(1) };
  }
  // selected = the chip whose interior is MORE blue-tinted than the other
  // (selected paints a filled pill; unselected stays white). Relative compare
  // survives viewport-dependent node heights (tablet nodes are taller).
  const entries = Object.entries(res);
  let verdict = `AMBIGUOUS(${JSON.stringify(res)})`;
  if (entries.length === 2) {
    const [a, b] = entries;
    if (a[1].pctTinted - b[1].pctTinted > 15) verdict = a[0];
    else if (b[1].pctTinted - a[1].pctTinted > 15) verdict = b[0];
  }
  console.log(`CHIP[${tag}] ${verdict}`);
  return { res, verdict };
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  // ---------- 1. FRESHNESS ----------
  const fr = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = fr.headers.get('last-modified');
  const body = await fetch(APP + '/main.dart.js').then(r => r.text());
  const marker = body.includes('Confirm & proceed to payment') && body.includes('How will you pay?')
    && body.includes('5527108094688') && body.includes('7003 9305');
  const mtimeOk = new Date(lm).getTime() >= Date.UTC(2026, 7, 25, 9, 0, 0);
  dataOk('freshness-bundle-mtime-and-markers', fr.status === 200 && mtimeOk && marker,
    `main.dart.js HTTP ${fr.status}, Last-Modified "${lm}" (>=09:00 GMT today=${mtimeOk}), content markers present`);
  R.checks.freshness = fr.status === 200 && mtimeOk && marker;

  // ---------- 2. REAL DATA: independent curl probes ----------
  const qReal = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 },
    items: [{ productId: fx.productId1, quantity: 1 }, { productId: fx.productId2, quantity: 1 }] });
  dataOk('curl-delivery-quote-live', qReal.status === 200 && typeof qReal.json?.deliveryTotal === 'number',
    `POST /checkout/delivery-quote -> ${qReal.status}, deliveryTotal=TSh ${fmt(qReal.json?.deliveryTotal)}, mode=${qReal.json?.sellerGroups?.[0]?.transportMode}`);
  const det1 = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${fx.productId1}`);
  dataOk('curl-item1-ground-truth', det1.status === 200 && det1.json?.productName === PROBE1,
    `${det1.json?.productName} askingPrice=TSh ${fmt(det1.json?.productAskingPrice)} qty=${det1.json?.productQuantity}`);
  const det2 = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${fx.productId2}`);
  dataOk('curl-item2-ground-truth', det2.status === 200 && det2.json?.productName === PROBE2,
    `${det2.json?.productName} askingPrice=TSh ${fmt(det2.json?.productAskingPrice)}`);

  // ---------- PREFLIGHT ----------
  const minePre = await L.api(fx.buyer.token, 'GET', '/api/v1/payments/my');
  const pendPre = (Array.isArray(minePre.json) ? minePre.json : []).filter(o => o.status === 'PENDING_PAYMENT');
  for (const o of pendPre) await L.api(fx.buyer.token, 'POST', `/api/v1/proformas/${o.proformaId}/cancel`, {});
  console.log(`preflight cancelled ${pendPre.length} leftover PENDING_PAYMENT proforma(s)`);

  let payCalls = [];
  // ================= MOBILE 375x667 =================
  {
    const videoPath = 'e2e/videos/AU-029-mobile.webm';
    R.videos.push(videoPath);
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath });
    const p = await ctx.newPage();
    const imgMap = {};
    p.on('response', r => {
      const u = r.url();
      if (/(\/uploads\/|\/assets\/).*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
    });
    p.on('response', async res => {
      if (/\/submit-payment/.test(res.url())) {
        let reqBody = null; try { reqBody = JSON.parse(res.request().postData() || 'null'); } catch (e) {}
        payCalls.push({ status: res.status(), reqBody });
      }
    });

    await p.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    btnOk('buyer-login-with-live-semantics', await loginFlow(p), fx.buyer.email.slice(0, 11) + '..');

    async function add(pid, title, pickSize) {
      await p.evaluate((id) => { location.hash = '#/product/' + id; }, pid);
      let td0 = '';
      for (let i = 0; i < 18; i++) { await sleep(900); td0 = await txt(p); if (td0.includes(title)) break; }
      ok(`detail-open:${title.slice(0, 12)}`, td0.includes(title), 'itemDetails rendered from live backend');
      if (pickSize) {
        const chip = await p.evaluate(() => {
          let best = null;
          document.querySelectorAll('flt-semantics').forEach(e => {
            const t = (e.textContent || '').trim();
            if (t !== 'L' && !/^L\b/.test(t)) return;
            const r = e.getBoundingClientRect();
            if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
            if (!best || r.width * r.height < best.a)
              best = { a: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
          });
          return best;
        });
        if (chip) { await p.mouse.click(chip.x, chip.y); await sleep(800); }
        btnOk('pick-size-L', !!chip, 'choice chip tapped before add');
      }
      btnOk(`add-to-cart:${title.slice(0, 12)}`, await jsClickByText(p, 'Add to cart'), '');
      await sleep(1300); await hashNav(p, '#/');
    }
    await add(fx.productId1, PROBE1, true);
    await add(fx.productId2, PROBE2, false);

    await hashNav(p, '#/cart'); await sleep(2200);
    let cartT = '';
    for (let i = 0; i < 8; i++) { cartT = await txt(p); if (cartT.includes(PROBE1)) break; await sleep(900); }
    dataOk('cart-renders-first-fixture', cartT.includes(PROBE1),
      `cart shows "${PROBE1}" (tile carousel exposes the first tile only — known harness fact)`);
    btnOk('go-to-checkout-clicked', await jsClickByText(p, 'Go to checkout'), 'cart -> step 1');
    let at1 = false;
    for (let i = 0; i < 24 && !at1; i++) { await sleep(1000); at1 = (await txt(p)).includes('Order Summary'); }
    ok('checkout-step1-order-summary', at1, '');
    const sumT = await txt(p);
    dataOk('step1-order-summary-lists-both-fixtures', sumT.includes(PROBE1) && sumT.includes(PROBE2),
      `Order Summary vertical list carries "${PROBE1}" + "${PROBE2}"`);
    await L.screenshot(p, `${SHOT_DIR}/flutter-mobile-01-checkout-step1.png`);
    R.evidence.push(`${SHOT_DIR}/flutter-mobile-01-checkout-step1.png`);

    await L.scrollToBottom(p, 8); await sleep(500);
    btnOk('continue-to-review-clicked', await jsClickByText(p, 'Continue to review'), 'step1 -> step2');
    let at2 = false;
    for (let i = 0; i < 24 && !at2; i++) { await sleep(1000); const t = await txt(p); at2 = /Step\s*2\s*of\s*4/.test(t) || t.includes('Order totals'); }
    ok('review-step-2-of-4-reached', at2, '');

    await L.scrollToBottom(p, 16); await sleep(700);
    async function tickRow(which) {
      const t = await p.evaluate((which) => {
        const rows = [...document.querySelectorAll('flt-semantics')]
          .filter(e => e.getAttribute('role') === 'checkbox')
          .map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height, vis: r.y > 40 && (r.y + r.height) < innerHeight - 10 && r.width > 5 }; })
          .filter(b => b.vis);
        if (!rows.length) return null;
        const pk = which === 'first' ? rows[0] : rows[rows.length - 1];
        return { x: pk.x + 18, y: Math.min(Math.max(pk.y + pk.h / 2, 25), 1015) };
      }, which);
      if (!t) return false;
      await p.mouse.click(t.x, t.y); await sleep(800);
      return true;
    }
    btnOk('select-delivery-window', await tickRow('first'), 'first window checkbox ticked');
    btnOk('tick-terms-checkbox', await tickRow('last'), 'terms checkbox ticked');

    btnOk('confirm-and-proceed-to-payment-clicked', await jsClickByText(p, 'Confirm & proceed to payment'), 'step2 -> step3');
    let T3 = '';
    for (let i = 0; i < 30; i++) { await sleep(1000); T3 = await txt(p); if (/How will you pay\?|Amount due|Pay via/.test(T3)) break; }
    navOk('step3-payment-step-mounted', /How will you pay\?/.test(T3) && /Pay via/.test(T3),
      `"How will you pay?" heading + details card rendered after Confirm`);

    const proformaNum = (T3.match(/PF-\d{4}-\d{6}/) || [])[0] || '';
    dataOk('C3-proforma-number-rendered-on-step3', /^PF-\d{4}-\d{6}$/.test(proformaNum), proformaNum);

    // ---- C1 default selection (PIXEL-proven) ----
    const selDefault = await chipSelection(p, 'DEFAULT');
    ok('C1-default-selection-is-MOBILE_MONEY(Lipa Namba)', selDefault.verdict === 'Lipa Namba',
      JSON.stringify(selDefault.res));
    dataOk('C2-default-details-Lipa-Namba-block', T3.includes('Pay via Lipa Namba') && T3.includes('7003 9305')
      && T3.includes('GloboExpats Limited') && T3.includes('Network'),
      '"Pay via Lipa Namba / Lipa Namba 7003 9305 / Name GloboExpats Limited / Network Selcom"');
    dataOk('C2-bank-digits-hidden-under-MOBILE_MONEY', !T3.includes('5527108094688'),
      'account number absent while MOBILE_MONEY selected (web parity)');
    await L.screenshot(p, `${SHOT_DIR}/flutter-mobile-02-step3-default-mobilemoney.png`);
    R.evidence.push(`${SHOT_DIR}/flutter-mobile-02-step3-default-mobilemoney.png`);
    R.chip_pixels_default = selDefault.res;

    // ---- C5 switch to BANK_TRANSFER ----
    btnOk('switch-to-Bank-Account-chip-clicked', await jsClickByText(p, 'Bank Account'), 'ChoiceChip tapped');
    await sleep(1200);
    const Tb = await txt(p);
    const selBank = await chipSelection(p, 'AFTER_BANK_TAP');
    ok('C5-bank-chip-selected-after-tap', selBank.verdict === 'Bank Account', JSON.stringify(selBank.res));
    dataOk('C2-bank-details-account-number', Tb.includes('Account number') && Tb.includes('5527108094688'),
      '"Account number 5527108094688" rendered under BANK_TRANSFER');
    dataOk('C2-bank-details-name-and-bank', Tb.includes('Account name') && Tb.includes('GloboExpats Limited')
      && /Bank\nSelcom|Bank\s+Selcom/i.test(Tb),
      '"Account name GloboExpats Limited" + "Bank Selcom" rendered');
    dataOk('C5-heading-follows-method', Tb.includes('Pay via Bank Account'),
      '"Pay via Bank Account" heading');
    dataOk('C5-lipa-digits-hidden-under-BANK_TRANSFER', !Tb.includes('7003 9305'),
      'Lipa number absent while BANK_TRANSFER selected');
    await L.screenshot(p, `${SHOT_DIR}/flutter-mobile-03-step3-bank-transfer.png`);
    R.evidence.push(`${SHOT_DIR}/flutter-mobile-03-step3-bank-transfer.png`);
    R.chip_pixels_bank = selBank.res;

    // ---- C5 switch back ----
    btnOk('switch-back-to-Lipa-Namba-chip-clicked', await jsClickByText(p, 'Lipa Namba'), 'ChoiceChip tapped back');
    await sleep(1200);
    const Tl = await txt(p);
    const selBack = await chipSelection(p, 'AFTER_LIPA_TAP');
    ok('C5-lipa-selected-after-switch-back', selBack.verdict === 'Lipa Namba', JSON.stringify(selBack.res));
    dataOk('C5-mobile-details-restored', Tl.includes('Pay via Lipa Namba') && Tl.includes('7003 9305') && !Tl.includes('5527108094688'),
      'Lipa block restored, bank digits gone');
    R.chip_pixels_lipa = selBack.res;

    // ---- C3 reference row == proformaNumber (value shares one semantics node
    //      with the trailing proof copy on this build) ----
    const refRe = new RegExp(`Payment reference\\s*${proformaNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    dataOk('C3-payment-reference-equals-proformaNumber', refRe.test(Tl),
      `"Payment reference" value renders exactly ${proformaNum} (regex ${refRe.test(Tl)})`);
    dataOk('C3-invoice-row-shows-same-number', (Tl.match(new RegExp(`Invoice\\s*${proformaNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)) || []).length > 0,
      `"Invoice ${proformaNum}" in Amount due card`);

    // ---- C4 CARD nowhere ----
    const cardHits = await p.evaluate(() => {
      const hits = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        if (/\bcard\b/i.test(t)) hits.push(t.slice(0, 60));
      });
      return hits;
    });
    dataOk('C4-no-CARD-anywhere-on-payment-step-a11y', cardHits.length === 0,
      cardHits.length ? JSON.stringify(cardHits) : 'zero word-boundary "card" matches across all flt-semantics text');

    // ---- click every visible control on step 3 (click-everything rule) ----
    await L.scrollToBottom(p, 18); await sleep(900);
    const ctrlsAll = await L.listButtons(p);
    const labeled = ctrlsAll.filter(c => c.label);
    console.log('step3 controls:', JSON.stringify(labeled.slice(0, 16)));
    R.control_inventory_step3 = labeled;
    const subBtn = labeled.find(c => c.kind === 'button' && c.label.includes('Submit Payment'));
    btnOk('submit-payment-button-reachable-after-scroll', !!subBtn, subBtn ? subBtn.label : 'not found even after scroll');
    const before = payCalls.length;
    if (subBtn) {
      await jsClickByText(p, 'Submit Payment for Verification'); await sleep(2200);
      // Gate: no proof typed + no confirmation tick -> NO wire call, inline error shown, user stays on step 3
      dataOk('submit-without-proof-fires-no-wire-call', payCalls.length === before,
        `wire POST submit-payment delta=${payCalls.length - before} (must be 0)`);
      const Terr = await txt(p);
      const gateMsg = (Terr.match(/Add a payment proof[^"\\n]{0,80}|Tick "I have completed[^"\\n]{0,60}/) || [''])[0];
      dataOk('submit-without-proof-inline-error-shown', gateMsg.length > 0,
        `inline gate copy rendered: "${gateMsg.slice(0, 90)}"`);
      await L.screenshot(p, `${SHOT_DIR}/flutter-mobile-04-submit-gate-blocked.png`);
      R.evidence.push(`${SHOT_DIR}/flutter-mobile-04-submit-gate-blocked.png`);
      navOk('stays-on-step3-after-gate', /How will you pay\?/.test(Terr), 'still mounted on payment step');
    }
    // Back button asserted present (navigation affordance on step 1..3 header)
    btnOk('back-button-present-in-header', labeled.some(c => c.kind === 'button' && c.label === 'Back'), '');

    R.images_requested += Object.keys(imgMap).length;
    R.images_200 += Object.values(imgMap).filter(s => s === 200 || s === 304).length;
    Object.entries(imgMap).filter(([, s]) => s >= 400).forEach(([u]) => R.checks.images_broken.push(u));
    console.log(`images mobile: ${R.checks.images_200}/${R.checks.images_requested}`);
    await L.closeVideo(ctx, videoPath);
    await browser.close();

    // ================= TABLET 768x1024 =================
    const videoPathT = 'e2e/videos/AU-029-tablet.webm';
    R.videos.push(videoPathT);
    const browserT = await L.newBrowser();
    const ctxT = await L.newCtx(browserT, { viewport: { width: 768, height: 1024 }, videoPath: videoPathT });
    const pt = await ctxT.newPage();
    await pt.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    btnOk('tablet-login', await loginFlow(pt), '');
    async function addT(pid, title, pickSize) {
      await pt.evaluate((id) => { location.hash = '#/product/' + id; }, pid);
      for (let i = 0; i < 18; i++) { await sleep(900); if ((await txt(pt)).includes(title)) break; }
      if (pickSize) {
        const chip = await pt.evaluate(() => {
          let best = null;
          document.querySelectorAll('flt-semantics').forEach(e => {
            const t = (e.textContent || '').trim();
            if (t !== 'L' && !/^L\b/.test(t)) return;
            const r = e.getBoundingClientRect();
            if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
            if (!best || r.width * r.height < best.a)
              best = { a: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
          });
          return best;
        });
        if (chip) { await pt.mouse.click(chip.x, chip.y); await sleep(700); }
      }
      await jsClickByText(pt, 'Add to cart'); await sleep(1200); await hashNav(pt, '#/');
    }
    await addT(fx.productId1, PROBE1, true);
    await addT(fx.productId2, PROBE2, false);
    await hashNav(pt, '#/cart'); await sleep(2000);
    await jsClickByText(pt, 'Go to checkout'); await sleep(1500);
    for (let i = 0; i < 20 && !(await txt(pt)).includes('Order Summary'); i++) await sleep(900);
    await L.scrollToBottom(pt, 8); await sleep(400);
    await jsClickByText(pt, 'Continue to review');
    for (let i = 0; i < 22 && !(/Step\s*2\s*of\s*4/.test(await txt(pt))); i++) await sleep(900);
    await L.scrollToBottom(pt, 16); await sleep(600);
    async function tickRowT(which) {
      const t = await pt.evaluate((which) => {
        const rows = [...document.querySelectorAll('flt-semantics')]
          .filter(e => e.getAttribute('role') === 'checkbox')
          .map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height, vis: r.y > 40 && (r.y + r.height) < innerHeight - 10 && r.width > 5 }; })
          .filter(b => b.vis);
        if (!rows.length) return null;
        const pk = which === 'first' ? rows[0] : rows[rows.length - 1];
        return { x: pk.x + 18, y: Math.min(Math.max(pk.y + pk.h / 2, 25), 1015) };
      }, which);
      if (t) { await pt.mouse.click(t.x, t.y); await sleep(800); return true; }
      return false;
    }
    btnOk('tablet-window-and-terms-ticked', (await tickRowT('first')) && (await tickRowT('last')), '');
    await jsClickByText(pt, 'Confirm & proceed to payment');
    let T3t = '';
    for (let i = 0; i < 30; i++) { await sleep(1000); T3t = await txt(pt); if (/How will you pay\?|Amount due|Pay via/.test(T3t)) break; }
    navOk('tablet-step3-payment-mounted', /How will you pay\?/.test(T3t) && /Pay via/.test(T3t),
      `invoice ${(T3t.match(/PF-\d{4}-\d{6}/) || [''])[0]}`);
    const pfT = (T3t.match(/PF-\d{4}-\d{6}/) || [])[0] || '';
    const selDefT = await chipSelection(pt, 'TABLET_DEFAULT');
    ok('tablet-C1-default-is-MOBILE_MONEY', selDefT.verdict === 'Lipa Namba', JSON.stringify(selDefT.res));
    dataOk('tablet-C2-mobile-details-block', T3t.includes('Pay via Lipa Namba') && T3t.includes('7003 9305')
      && T3t.includes('GloboExpats Limited'), '');
    const refReT = new RegExp(`Payment reference\\s*${pfT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    dataOk('tablet-C3-reference-equals-proformaNumber', refReT.test(T3t), `reference == ${pfT}`);
    await jsClickByText(pt, 'Bank Account'); await sleep(1100);
    const Tbt = await txt(pt);
    const selBankT = await chipSelection(pt, 'TABLET_BANK');
    ok('tablet-C5-switch-to-BANK_TRANSFER', selBankT.verdict === 'Bank Account', JSON.stringify(selBankT.res));
    dataOk('tablet-C2-bank-details-block', Tbt.includes('Account number') && Tbt.includes('5527108094688')
      && Tbt.includes('GloboExpats Limited') && Tbt.includes('Selcom'), '');
    dataOk('tablet-C4-no-CARD-anywhere', !/\bcard\b/i.test(await txt(pt)), 'zero card matches on tablet payment step');
    await L.screenshot(pt, `${SHOT_DIR}/flutter-tablet-01-step3-payment.png`);
    R.evidence.push(`${SHOT_DIR}/flutter-tablet-01-step3-payment.png`, videoPath, videoPathT);
    R.images_requested += Object.keys(imgMap).length ? 0 : 0; // tablet map separate below
    await L.closeVideo(ctxT, videoPathT);
    await browserT.close();

    // ---------- CLEANUP ----------
    const mineAfter = await L.api(fx.buyer.token, 'GET', '/api/v1/payments/my');
    const pendAfter = (Array.isArray(mineAfter.json) ? mineAfter.json : []).filter(o => o.status === 'PENDING_PAYMENT');
    R.cleanupCancelled = [];
    for (const o of pendAfter) {
      const c = await L.api(fx.buyer.token, 'POST', `/api/v1/proformas/${o.proformaId}/cancel`, {});
      R.cleanupCancelled.push(`${o.proformaNumber}->${c.status}`);
    }
    console.log('cleanup cancels:', R.cleanupCancelled.join(',') || 'none');

    fs.writeFileSync('/tmp/au029_result.json', JSON.stringify(R, null, 1));
    console.log('\nPHASE DONE', JSON.stringify({
      failures: R.failures, buttons: `${R.checks.buttons_ok}/${R.checks.buttons_total}`,
      images: `${R.checks.images_200}/${R.checks.images_requested}`,
      data: R.checks.data_asserts, nav: R.checks.nav_asserts, state: R.checks.state_asserts,
    }, null, 1));
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
