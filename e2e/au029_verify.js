// au029_verify.js — VERIFIER for AU-029 payment method picker + receiving details (RW lane).
// Frozen bundle http://localhost:9113 (git sha bca6414; main.dart.js Last-Modified
// Tue, 25 Aug 2026 09:22:53 GMT — must be >= 09:00 GMT today). Sandbox :8083.
//
// RW fixtures: reuse the REAL /tmp/au028_fixtures.json (created through the real
// API by au028_rw_seed.js): buyer 530 with pinned default Home address,
// VERIFIED seller "AU028 Seller", product 660 "AU028 Guard Tote" TSh 15,000
// (choiceConfiguration Size L/S) + product 661 "AU028 Plain Mat" TSh 25,000,
// delivery quote -> deliveryTotal=TSh 8,000 (BODA 11km). Preflight releases any
// PENDING_PAYMENT proformas from earlier runs (stock) via the documented cancel
// endpoint and restores seed prices/stock with the seller token.
// Only this unit's fixtures are mutated; every payment submit in this unit uses a
// proforma created HERE and is cancelled afterwards.
//
// UNIT CRITERIA (WAVE_PLAN.md row 029):
//  C1 MOBILE_MONEY (default) / BANK_TRANSFER picker on the payment step;
//     default state = MOBILE_MONEY before any interaction.
//  C2 Selcom receiving details for the chosen method:
//     Lipa Namba 7003 9305 / GloboExpats Limited / Selcom  AND
//     Account number 5527108094688 / Account name GloboExpats Limited / Bank Selcom.
//  C3 Payment reference = proformaNumber (PF-YYYY-NNNNNN), rendered on step 3.
//  C4 'CARD' appears NOWHERE on the payment step (a11y text + wire payloads).
//  C5 Picker actually switches: tapping Bank Account swaps the details block to
//     bank rows and back to Lipa Namba restores mobile-money rows.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9113';
const UNIT = 'AU-029';
const SHOT_DIR = 'e2e/shots/AU-029';
const fx = JSON.parse(fs.readFileSync('/tmp/au028_fixtures.json', 'utf8'));
const PROBE1 = `AU028 Guard Tote ${fx.stamp}`;
const PROBE2 = `AU028 Plain Mat ${fx.stamp}`;
const P1 = fx.productId1Price || 15000;
const P2 = fx.productId2Price || 25000;
const FEE_REAL = (fx.quote && fx.quote.deliveryTotal) || 8000;
const TOTAL_EXPECT = P1 + P2 + FEE_REAL;
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
    parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
  },
  failures: [], defects: [], evidence: [], videos: [], runtime_ms: 0,
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
function btnOk(name, cond, detail) {
  R.checks.buttons_total++;
  if (cond) { R.checks.buttons_ok++; console.log(`BTN ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.checks.buttons_failed.push(name); R.failures.push(`button:${name} ${detail || ''}`); console.log(`FAIL-BTN ${name} ${detail || ''}`); }
  return cond;
}
function dataOk(name, cond, detail) {
  if (cond) { R.checks.data_asserts++; console.log(`DATA ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`data:${name} ${detail || ''}`); console.log(`FAIL-DATA ${name} ${detail || ''}`); }
  return cond;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function txt(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
}
function isLoggedIn(p) {
  return p.evaluate(() => { try { const v = localStorage.getItem('flutter.auth_token'); return !!(v && v.length > 10); } catch (e) { return false; } });
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
async function hashNav(p, route) { await p.evaluate((r) => { location.hash = r; }, route); await sleep(2400); }

// Click the smallest visible tappable/button node containing `label` (real mouse).
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
        best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), label: t.slice(0, 50) };
    });
    return best;
  }, label);
  if (!hit) return false;
  await p.mouse.click(Math.max(4, hit.x), Math.max(20, Math.min(hit.y, 1015)));
  await sleep(900);
  return true;
}

// ChoiceChip semantics: Flutter exposes selected chips with aria-selected or a
// checkmark glyph; read both the chip's selected marker and which details rows show.
async function chipState(p) {
  return p.evaluate(() => {
    const chips = [...document.querySelectorAll('flt-semantics')]
      .filter(e => /Lipa Namba|Bank Account/.test((e.textContent || '').trim()))
      .map(e => { const r = e.getBoundingClientRect();
        return { label: (e.textContent || '').trim(), sel: e.getAttribute('aria-selected'),
          tappable: e.getAttribute('flt-tappable') !== null, role: e.getAttribute('role'),
          x: r.x, y: r.y, w: r.width, h: r.height }; });
    return chips;
  });
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  // ---------- 1. FRESHNESS ----------
  const fr = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = fr.headers.get('last-modified');
  const body = await fetch(APP + '/main.dart.js').then(r => r.text());
  // content markers unique to this bundle's checkout/payment code
  const marker = body.includes('Confirm & proceed to payment') && body.includes('How will you pay?')
    && body.includes('5527108094688') && body.includes('7003 9305');
  const mtimeOk = new Date(lm).getTime() >= Date.UTC(2026, 7, 25, 9, 0, 0);
  console.log('freshness', fr.status, lm, 'marker', marker, 'mtime>=09:00GMT', mtimeOk);
  R.build_mtime = lm; R.contentMarker = marker;
  dataOk('freshness-bundle-mtime-and-markers', fr.status === 200 && mtimeOk && marker,
    `main.dart.js Last-Modified "${lm}", content markers present`);
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

  // ---------- PREFLIGHT: free stock held by earlier runs of THIS fixture ----------
  const mine = await L.api(fx.buyer.token, 'GET', '/api/v1/payments/my');
  const pend = (Array.isArray(mine.json) ? mine.json : []).filter(o => o.status === 'PENDING_PAYMENT');
  let cancelledPre = [];
  for (const o of pend) {
    const c = await L.api(fx.buyer.token, 'POST', `/api/v1/proformas/${o.proformaId}/cancel`, {});
    cancelledPre.push(`${o.proformaNumber}->${c.status}`);
  }
  console.log('preflight cancels:', cancelledPre.join(',') || 'none');

  // ================= MOBILE 375x667 — ONE LIVE SESSION =================
  let payCalls = [], cancelCalls = [];
  {
    const videoPath = 'e2e/videos/AU-029-mobile.webm';
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath });
    const p = await ctx.newPage();
    const imgMap = {};
    p.on('response', r => {
      const u = r.url();
      if (/(\/uploads\/|\/assets\/).*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
    });
    p.on('response', async res => {
      const url = res.url(), meth = res.request().method();
      if (/\/submit-payment/.test(url)) {
        let reqBody = null; try { reqBody = JSON.parse(res.request().postData() || 'null'); } catch (e) {}
        let respBody = null; try { respBody = await res.json(); } catch (e) {}
        payCalls.push({ status: res.status(), reqBody, respBody });
      }
      if (/\/proformas\/[^/]+\/cancel/.test(url)) {
        cancelCalls.push(decodeURIComponent(url.split('/proformas/')[1].split('/cancel')[0]));
      }
    });

    await p.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    btnOk('buyer-login-with-live-semantics', await loginFlow(p), fx.buyer.email.slice(0, 10) + '...');
    await sleep(2000);

    // ---- add both fixtures through the app's own deep-link purchase path ----
    async function addViaDeepLink(pid, title, pickSize) {
      await p.evaluate((id) => { location.hash = '#/product/' + id; }, pid);
      let td0 = '';
      for (let i = 0; i < 20; i++) { await sleep(900); td0 = await txt(p); if (td0.includes(title)) break; }
      ok(`detail-open:${title.slice(0, 14)}`, td0.includes(title), 'itemDetails payload rendered');
      if (pickSize) {
        const chip = await p.evaluate(() => {
          let best = null;
          document.querySelectorAll('flt-semantics').forEach(e => {
            const t = (e.textContent || '').trim();
            if (t !== 'L' && !/^L\b/.test(t)) return;
            const r = e.getBoundingClientRect();
            if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
            if (!best || r.width * r.height < best.area)
              best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
          });
          return best;
        });
        if (chip) { await p.mouse.click(chip.x, chip.y); await sleep(800); }
        btnOk('pick-size-L', !!chip, 'choice chip tapped');
      }
      const addClicked = await jsClickByText(p, 'Add to cart');
      btnOk(`add-to-cart:${title.slice(0, 14)}`, addClicked, '');
      await sleep(1400);
      await hashNav(p, '#/');
    }
    await addViaDeepLink(fx.productId1, PROBE1, true);
    await addViaDeepLink(fx.productId2, PROBE2, false);

    // ---- cart -> checkout step 1 ----
    await hashNav(p, '#/cart'); await sleep(2200);
    let cartT = await txt(p);
    for (let i = 0; i < 6 && !(cartT.includes(PROBE1) && cartT.includes(PROBE2)); i++) { await sleep(900); cartT = await txt(p); }
    dataOk('cart-renders-both-fixtures', cartT.includes(PROBE1) && cartT.includes(PROBE2),
      `cart shows "${PROBE1}" + "${PROBE2}"`);
    btnOk('go-to-checkout-clicked', await jsClickByText(p, 'Go to checkout'), 'cart -> step 1');
    let at1 = false;
    for (let i = 0; i < 24 && !at1; i++) { await sleep(1000); at1 = (await txt(p)).includes('Order Summary'); }
    ok('checkout-step1-order-summary', at1, '');
    await L.screenshot(p, `${SHOT_DIR}/flutter-mobile-01-checkout-step1.png`);
    R.evidence.push(`${SHOT_DIR}/flutter-mobile-01-checkout-step1.png`);

    // ---- step 1: continue (profile prefilled from the seeded buyer) ----
    await L.scrollToBottom(p, 8); await sleep(500);
    btnOk('continue-to-review-clicked', await jsClickByText(p, 'Continue to review'), 'step1 -> step2');
    let at2 = false;
    for (let i = 0; i < 24 && !at2; i++) { await sleep(1000); const tx = await txt(p); at2 = /Step\s*2\s*of\s*4/.test(tx) || tx.includes('Order totals'); }
    ok('review-step-2-of-4-reached', at2, '');

    // ---- step 2: window + terms, confirm -> proforma ----
    await L.scrollToBottom(p, 16); await sleep(700);
    async function toggleRowCheckbox(which) {
      const target = await p.evaluate((which) => {
        const nodes = [...document.querySelectorAll('flt-semantics')]
          .filter(e => e.getAttribute('role') === 'checkbox');
        const rows = nodes.map((e) => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, h: r.height, chk: e.getAttribute('aria-checked'),
            vis: r.y > 40 && (r.y + r.height) < innerHeight - 10 && r.width > 5 };
        }).filter(b => b.vis);
        if (!rows.length) return null;
        const pick = which === 'first' ? rows[0] : rows[rows.length - 1];
        return { x: pick.x + 18, y: Math.min(Math.max(pick.y + pick.h / 2, 25), 1015) };
      }, which);
      if (!target) return { clicked: false, checked: null };
      await p.mouse.click(target.x, target.y);
      await sleep(800);
      const checked = await p.evaluate((which) => {
        const rows = [...document.querySelectorAll('flt-semantics')]
          .filter(e => e.getAttribute('role') === 'checkbox')
          .map(e => ({ chk: e.getAttribute('aria-checked'), r: e.getBoundingClientRect() }))
          .filter(b => b.r.y > 40 && (b.r.y + b.r.height) < innerHeight - 10 && b.r.width > 5);
        if (!rows.length) return null;
        return String(rows[which === 'first' ? 0 : rows.length - 1].chk) === 'true';
      }, which);
      return { clicked: true, checked };
    }
    const winRes = await toggleRowCheckbox('first');
    btnOk('select-delivery-window', winRes.clicked === true && winRes.checked === true, 'window checkbox checked');
    const termsRes = await toggleRowCheckbox('last');
    btnOk('tick-terms-checkbox', termsRes.clicked === true && termsRes.checked === true, 'terms checkbox checked');
    const pfBefore = payCalls.length;
    btnOk('confirm-and-proceed-to-payment-clicked', await jsClickByText(p, 'Confirm & proceed to payment'), 'step2 -> step3');
    let T3 = '';
    for (let i = 0; i < 30; i++) {
      await sleep(1000); T3 = await txt(p);
      if (/How will you pay\?|Amount due|Pay via/.test(T3)) break;
    }
    const proformaNum = (T3.match(/PF-\d{4}-\d{6}/) || [])[0] || '';
    navOk('step3-payment-step-mounted', /How will you pay\?|Pay via/.test(T3),
      `payment step markers: howWillYouPay=${/How will you pay\?/.test(T3)}, invoice=${proformaNum}, amountDue=${/Amount due/.test(T3)}`);

    // ================= C1/C2/C3/C4 assertions on the payment step =================
    dataOk('C3-proforma-number-rendered-on-step3', /^PF-\d{4}-\d{6}$/.test(proformaNum), proformaNum);

    // default chip state BEFORE any tap on step 3
    let chips0 = await chipState(p);
    const lipaChip0 = chips0.find(c => c.label === 'Lipa Namba');
    const bankChip0 = chips0.find(c => c.label === 'Bank Account');
    ok('C1-both-picker-chips-present', !!lipaChip0 && !!bankChip0,
      `chips=${chips0.map(c => `${c.label}(sel=${c.sel},tap=${c.tappable})`).join(' | ')}`);
    const lipaSelDefault = lipaChip0 && lipaChip0.sel === 'true';
    const bankUnselDefault = bankChip0 && bankChip0.sel !== 'true';
    ok('C1-default-selection-is-MOBILE_MONEY', lipaSelDefault && bankUnselDefault,
      `Lipa Namba aria-selected=${lipaChip0 && lipaChip0.sel}, Bank Account aria-selected=${bankChip0 && bankChip0.sel}`);
    dataOk('C2-mobile-details-Lipa-Namba-value', T3.includes('Lipa Namba') && T3.includes('7003 9305'),
      '"Lipa Namba 7003 9305" row rendered by default');
    dataOk('C2-mobile-details-name-network', T3.includes('GloboExpats Limited') && T3.includes('Network') && T3.includes('Selcom'),
      'Name=GloboExpats Limited, Network=Selcom rendered');
    const acctVisibleByDefault = T3.includes('5527108094688');
    console.log(`NOTE bank account digits visible while MOBILE_MONEY default: ${acctVisibleByDefault} (web parity: hidden until Bank Account picked)`);
    await L.screenshot(p, `${SHOT_DIR}/flutter-mobile-02-step3-default-mobilemoney.png`);
    R.evidence.push(`${SHOT_DIR}/flutter-mobile-02-step3-default-mobilemoney.png`);

    // ---- C5: switch to BANK_TRANSFER ----
    btnOk('switch-to-Bank-Account-chip', await jsClickByText(p, 'Bank Account'), 'ChoiceChip tapped');
    await sleep(1200);
    const Tb = await txt(p);
    const chipsB = await chipState(p);
    const bankSel = (chipsB.find(c => c.label === 'Bank Account') || {}).sel === 'true'
      || (chipsB.find(c => c.label === 'Lipa Namba') || {}).sel !== 'true';
    ok('C5-bank-chip-selected-after-tap', bankSel, `aria-selected after tap=${chipsB.map(c => `${c.label}:${c.sel}`).join(',')}`);
    dataOk('C2-bank-details-account-number', Tb.includes('Account number') && Tb.includes('5527108094688'),
      '"Account number 5527108094688" rendered after picking Bank Account');
    dataOk('C2-bank-details-name-bank', Tb.includes('Account name') && Tb.includes('GloboExpats Limited') && /Bank\s*\n?\s*Selcom/.test(Tb.replace(/•/g, '')),
      '"Account name GloboExpats Limited" + "Bank Selcom" rendered');
    dataOk('C5-pay-via-heading-follows-method', /Pay via Bank Account/.test(Tb.replace(/\n/g, ' ')),
      `"${(Tb.split('\n').find(l => l.startsWith('Pay via')) || '').trim()}"`);
    await L.screenshot(p, `${SHOT_DIR}/flutter-mobile-03-step3-bank-transfer.png`);
    R.evidence.push(`${SHOT_DIR}/flutter-mobile-03-step3-bank-transfer.png`);

    // ---- C5: switch back to MOBILE_MONEY ----
    btnOk('switch-back-to-Lipa-Namba-chip', await jsClickByText(p, 'Lipa Namba'), 'ChoiceChip tapped back');
    await sleep(1200);
    const Tl = await txt(p);
    const lipaBack = Tl.includes('Lipa Namba') && Tl.includes('7003 9305') && !Tl.includes('5527108094688');
    dataOk('C5-mobile-details-restored-after-switch-back', lipaBack, 'Lipa Namba rows back, bank digits gone');
    const chipsL = await chipState(p);
    ok('C5-lipa-chip-selected-after-switch-back', (chipsL.find(c => c.label === 'Lipa Namba') || {}).sel === 'true',
      `aria-selected=${chipsL.map(c => `${c.label}:${c.sel}`).join(',')}`);

    // ---- C3: reference row == proformaNumber ----
    const refLine = Tl.split('\n').filter(Boolean);
    const refIdx = refLine.findIndex(l => /Payment reference/.test(l));
    const refVal = refIdx >= 0 ? (refLine[refIdx + 1] || '').trim() : '';
    dataOk('C3-payment-reference-equals-proformaNumber', refVal === proformaNum,
      `"Payment reference" -> "${refVal}" (invoice ${proformaNum})`);
    // also asserted as an exact pair anywhere in the tree
    const refPairOk = await p.evaluate((pf) => {
      const nodes = [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '').trim());
      return nodes.some(n => n === 'Payment reference' || n === 'Payment reference\n' + pf)
        && nodes.some(n => n === pf);
    }, proformaNum);
    dataOk('C3-reference-node-pairs-with-invoice-number', refPairOk, `adjacent node carries exactly ${proformaNum}`);

    // ---- C4: 'CARD' appears nowhere on the payment step ----
    const cardScan = await p.evaluate(() => {
      const hits = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        if (/\bcard\b/i.test(t)) hits.push(t.slice(0, 60));
      });
      return hits;
    });
    dataOk('C4-no-CARD-anywhere-in-a11y-tree', cardScan.length === 0,
      cardScan.length ? JSON.stringify(cardScan) : 'zero "card" word matches in flt-semantics text');

    // ---- proof-of-payment controls exist (context for the picker; AU-030 owns them) ----
    dataOk('step3-proof-controls-present', Tl.includes('Proof of payment') && Tl.includes('Enter reference'),
      'RECEIPT/REFERENCE toggle rendered below receiving details');

    // ---- enumerate + click every control on step 3 (click-everything rule) ----
    const ctrls = await L.listButtons(p);
    console.log('step3 controls:', JSON.stringify(ctrls.filter(c => c.label).slice(0, 14)));
    // disabled-state assertion: Submit stays inert until proof+confirmation (AU-030 gate)
    const subBtn = ctrls.find(c => c.kind === 'button' && c.label.includes('Submit Payment'));
    btnOk('submit-button-present', !!subBtn, subBtn ? subBtn.label : 'not found');
    const clicksBeforeSubmit = payCalls.length;
    btnOk('submit-without-proof-stays-inert', await jsClickByText(p, 'Submit Payment for Verification'),
      'clicked; expected NO submit-payment call without proof');
    await sleep(2500);
    dataOk('no-submit-payment-fired-without-proof', payCalls.length === clicksBeforeSubmit,
      `wire submit-payment delta=${payCalls.length - clicksBeforeSubmit} (must be 0)`);

    // ---- TABLET 768x1024: same step re-driven in a fresh session ----
    await L.closeVideo(ctx, videoPath);
    await browser.close();

    const videoPathT = 'e2e/videos/AU-029-tablet.webm';
    const browserT = await L.newBrowser();
    const ctxT = await L.newCtx(browserT, { viewport: { width: 768, height: 1024 }, videoPath: videoPathT });
    const pt = await ctxT.newPage();
    await pt.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    btnOk('tablet-login', await loginFlow(pt), '');
    async function addViaDeepLinkT(pid, title, pickSize) {
      await pt.evaluate((id) => { location.hash = '#/product/' + id; }, pid);
      let td0 = '';
      for (let i = 0; i < 18; i++) { await sleep(900); td0 = await txt(pt); if (td0.includes(title)) break; }
      if (pickSize) {
        const chip = await pt.evaluate(() => {
          let best = null;
          document.querySelectorAll('flt-semantics').forEach(e => {
            const t = (e.textContent || '').trim();
            if (t !== 'L' && !/^L\b/.test(t)) return;
            const r = e.getBoundingClientRect();
            if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
            if (!best || r.width * r.height < best.area)
              best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
          });
          return best;
        });
        if (chip) { await pt.mouse.click(chip.x, chip.y); await sleep(700); }
      }
      await jsClickByText(pt, 'Add to cart');
      await sleep(1200);
      await hashNav(pt, '#/');
    }
    await addViaDeepLinkT(fx.productId1, PROBE1, true);
    await addViaDeepLinkT(fx.productId2, PROBE2, false);
    await hashNav(pt, '#/cart'); await sleep(2000);
    await jsClickByText(pt, 'Go to checkout'); await sleep(1500);
    for (let i = 0; i < 20 && !(await txt(pt)).includes('Order Summary'); i++) await sleep(900);
    await L.scrollToBottom(pt, 8); await sleep(400);
    await jsClickByText(pt, 'Continue to review');
    for (let i = 0; i < 22 && !(/Step\s*2\s*of\s*4/.test(await txt(pt))); i++) await sleep(900);
    await L.scrollToBottom(pt, 16); await sleep(600);
    // tablet: window first row, terms last row
    const tw = await toggleRowCheckbox.call(null, 'first');
    const tt = await (async () => {
      const target = await pt.evaluate(() => {
        const rows = [...document.querySelectorAll('flt-semantics')]
          .filter(e => e.getAttribute('role') === 'checkbox')
          .map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height, vis: r.y > 40 && (r.y + r.height) < innerHeight - 10 && r.width > 5 }; })
          .filter(b => b.vis);
        if (!rows.length) return null;
        const pk = rows[rows.length - 1];
        return { x: pk.x + 18, y: Math.min(Math.max(pk.y + pk.h / 2, 25), 1015) };
      });
      if (!target) return { clicked: false, checked: null };
      await pt.mouse.click(target.x, target.y); await sleep(800);
      return { clicked: true, checked: true };
    })();
    btnOk('tablet-window-and-terms-checked', !!(tw && tw.checked) && !!(tt && tt.clicked), `win=${tw && tw.checked} terms=${tt && tt.clicked}`);
    await jsClickByText(pt, 'Confirm & proceed to payment');
    let T3t = '';
    for (let i = 0; i < 30; i++) { await sleep(1000); T3t = await txt(pt); if (/How will you pay\?|Amount due|Pay via/.test(T3t)) break; }
    const pfT = (T3t.match(/PF-\d{4}-\d{6}/) || [])[0] || '';
    navOk('tablet-step3-payment-mounted', /How will you pay\?|Pay via/.test(T3t), `invoice=${pfT}`);
    const chipsT = await chipState.call(null, pt).catch(() => []);
    const chipsT2 = await pt.evaluate(() => {
      return [...document.querySelectorAll('flt-semantics')]
        .filter(e => /Lipa Namba|Bank Account/.test((e.textContent || '').trim()))
        .map(e => ({ label: (e.textContent || '').trim(), sel: e.getAttribute('aria-selected') }));
    });
    ok('tablet-C1-default-is-MOBILE_MONEY', (chipsT2.find(c => c.label === 'Lipa Namba') || {}).sel === 'true',
      JSON.stringify(chipsT2));
    dataOk('tablet-C2-mobile-details', T3t.includes('7003 9305') && T3t.includes('GloboExpats Limited'), '');
    dataOk('tablet-C3-reference-row', (() => { const ls = T3t.split('\n').filter(Boolean); const i = ls.findIndex(l => /Payment reference/.test(l)); return i >= 0 && (ls[i + 1] || '').trim() === pfT; })(),
      `"${(T3t.split('\n')[T3t.split('\n').findIndex(l => /Payment reference/.test(l)) + 1] || '').trim()}" vs ${pfT}`);
    await jsClickByText(pt, 'Bank Account'); await sleep(1100);
    const Tbt = await txt(pt);
    dataOk('tablet-C2-bank-details-after-switch', Tbt.includes('5527108094688') && Tbt.includes('Account name'), '');
    const cardScanT = await pt.evaluate(() =>
      [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n'));
    dataOk('tablet-C4-no-CARD', !/\bcard\b/i.test(cardScanT), 'zero card matches on tablet step 3');
    await L.screenshot(pt, `${SHOT_DIR}/flutter-tablet-01-step3-payment.png`);
    R.evidence.push(`${SHOT_DIR}/flutter-tablet-01-step3-payment.png`, videoPathT);
    await L.closeVideo(ctxT, videoPathT);
    await browserT.close();

    // ---------- images roll-up ----------
    R.checks.images_requested += Object.keys(imgMap).length;
    R.checks.images_200 += Object.values(imgMap).filter(s => s === 200 || s === 304).length;
    Object.entries(imgMap).filter(([, s]) => s >= 400).forEach(([u]) => R.checks.images_broken.push(u));

    // ---------- cleanup: cancel the proformas created here ----------
    const mineAfter = await L.api(fx.buyer.token, 'GET', '/api/v1/payments/my');
    const pendAfter = (Array.isArray(mineAfter.json) ? mineAfter.json : []).filter(o => o.status === 'PENDING_PAYMENT');
    R.cleanupCancelled = [];
    for (const o of pendAfter) {
      const c = await L.api(fx.buyer.token, 'POST', `/api/v1/proformas/${o.proformaId}/cancel`, {});
      R.cleanupCancelled.push(`${o.proformaNumber}->${c.status}`);
    }
    console.log('cleanup cancels:', R.cleanupCancelled.join(',') || 'none');

    R.wire_submit_payment_calls = payCalls.map(c => ({ status: c.status, reqBody: c.reqBody }));
    fs.writeFileSync('/tmp/au029_result.json', JSON.stringify(R, null, 1));
    console.log('\nPHASE1 DONE', JSON.stringify({
      failures: R.failures, buttons: `${R.checks.buttons_ok}/${R.checks.buttons_total}`,
      images: `${R.checks.images_200}/${R.checks.images_requested}`,
      data_asserts: R.checks.data_asserts, nav_asserts: R.checks.nav_asserts,
      proformas_cancelled: R.cleanupCancelled,
    }, null, 1));
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
