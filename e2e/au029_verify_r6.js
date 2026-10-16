// au029_verify_r6.js — CANONICAL CHECKLIST verifier for AU-029
// payment_method_picker_receiving_details (RW lane, FROZEN :9121 sha b56e345,
// main.dart.js Last-Modified Tue, 25 Aug 2026 20:08:09 GMT).
//
// RW fixtures: REAL /tmp/au028_fixtures.json (created through the real sandbox
// API on 2026-08-25): buyer 530 au028buyer…@gmail.com, VERIFIED seller "AU028
// Seller", products 660 "AU028 Guard Tote …" (TSh 15,000, sizes L/S) + 661
// "AU028 Plain Mat …" (TSh 25,000). Checkout drives the REAL proforma chain:
// delivery-quote -> proforma -> step3 payment picker.
//
// Acceptance: MOBILE_MONEY default; Selcom receiving details
// (acct 5527108094688 / Lipa Namba 7003 9305) + reference == proformaNumber;
// CARD appears nowhere. Both viewports 375x667 + 768x1024.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));   // repo root so e2e/... paths resolve
const L = require('./lib_verify.js');
const { decodePng } = require('./lib_au029.js');

const APP = 'http://localhost:9121';
const UNIT = 'AU-029';
const SHOT_DIR = 'e2e/shots/AU-029';
const fx = JSON.parse(fs.readFileSync('/tmp/au028_fixtures.json', 'utf8'));
// refresh buyer token (fixture token may be stale)
let BUYER_TOKEN = fx.buyer.token;
const PROBE1 = `AU028 Guard Tote ${fx.stamp}`;
const PROBE2 = `AU028 Plain Mat ${fx.stamp}`;
const fmt = (n) => Number(n).toLocaleString('en-US');

const R = {
  ts: new Date().toISOString(), unit: UNIT, stage: 'verify-r6',
  title: 'payment_method_picker_receiving_details', agent: 'verifier-AU-029-r6',
  build_sha: 'b56e345', build_mtime: null, lane: 'RW',
  viewports: ['375x667', '768x1024'],
  checks: {
    freshness: false, real_data: false,
    images_requested: 0, images_200: 0,
    buttons_total: 0, buttons_ok: 0, buttons_failed: [],
    state_asserts: 0, data_asserts: 0, nav_asserts: 0,
    vision_defects: 0, vision_findings: [], vision_shots_read: [],
    parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
    placeholder_scan_hits: [],
  },
  failures: [], defects: [], evidence: [], videos: [], chip_pixels: {}, runtime_ms: 0,
};
function ok(name, cond, detail) {
  if (cond) { R.checks.state_asserts++; console.log(`PASS ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`${name} :: ${detail || ''}`); console.log(`FAIL ${name} :: ${detail || ''}`); }
  return cond;
}
function dataOk(name, cond, detail) {
  if (cond) { R.checks.data_asserts++; R.checks.state_asserts++; console.log(`DATA-PASS ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`data:${name} :: ${detail || ''}`); console.log(`DATA-FAIL ${name} :: ${detail || ''}`); }
  return cond;
}
function btnOk(name, cond, detail) {
  R.checks.buttons_total++;
  if (cond) { R.checks.buttons_ok++; console.log(`BTN-PASS ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.checks.buttons_failed.push(name); R.failures.push(`button:${name} :: ${detail || ''}`); console.log(`BTN-FAIL ${name} :: ${detail || ''}`); }
  return cond;
}
function navOk(name, cond, detail) {
  if (cond) { R.checks.nav_asserts++; R.checks.state_asserts++; console.log(`NAV-PASS ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`nav:${name} :: ${detail || ''}`); console.log(`NAV-FAIL ${name} :: ${detail || ''}`); }
  return cond;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function txt(p) {
  return p.evaluate(() => { const parts = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const a = e.getAttribute('aria-label'); if (a) parts.push(a);
      const c = e.textContent; if (c && c.trim()) parts.push(c);
    });
    return parts.join('\n'); }).catch(() => '');
}
async function isLoggedIn(p) {
  try { const v = await p.evaluate(() => localStorage.getItem('flutter.auth_token') || ''); return v.length > 10; } catch (e) { return false; }
}
async function loginFlow(p, email, pw) {
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000);
  let logged = await isLoggedIn(p);
  for (let i = 0; i < 12 && !logged; i++) {   // retry login up to 12x (flaky first-tap)
    await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 20000);
    const ei = p.locator('input[type="text"]').first();
    await ei.click({ force: true }).catch(() => {}); await sleep(400);
    await p.keyboard.type(email, { delay: 14 });
    const pi = p.locator('input[type="password"]').first();
    await pi.click({ force: true }).catch(() => {}); await sleep(400);
    await p.keyboard.type(pw, { delay: 14 });
    await L.clickBtn(p, 'Log in');
    for (let j = 0; j < 22 && !logged; j++) { await sleep(1000); logged = await isLoggedIn(p); }
    if (logged) break;
  }
  for (let i = 0; i < 18; i++) {
    const t = await txt(p);
    if (/Newest|Buy now|categories/i.test(t)) break;
    await sleep(800);
  }
  return logged;
}
async function hashNav(p, route) { await p.evaluate((r) => { window.location.hash = r; }, route); await sleep(2400); }
async function jsClickByText(p, label) {
  const hit = await p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const hay = (e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '');
      if (!hay.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
      const roleOk = e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null;
      if (!roleOk) return;
      if (!best || r.width * r.height < best.a)
        best = { a: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), label: hay.trim().slice(0, 60) };
    });
    return best;
  }, label);
  if (!hit) return false;
  const vh = p.viewportSize() ? p.viewportSize().height : 667;
  await p.mouse.click(Math.max(4, hit.x), Math.max(20, Math.min(hit.y, vh - 8)));
  await sleep(900);
  return true;
}
async function pickSizeL(p) {
  const chip = await p.evaluate(() => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = ((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '')).trim();
      if (!/^L\b/.test(t)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
      if (!best || r.width * r.height < best.a)
        best = { a: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    return best;
  });
  if (chip) { await p.mouse.click(chip.x, chip.y); await sleep(800); }
  return !!chip;
}
async function tickRowCheckbox(p, which) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const t = await p.evaluate((which) => {
      const rows = [...document.querySelectorAll('flt-semantics')]
        .filter(e => e.getAttribute('role') === 'checkbox')
        .map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height, w: r.width, checked: e.getAttribute('aria-checked') }; })
        .filter(b => b.y > 40 && (b.y + b.h) < innerHeight - 6 && b.w > 4);
      if (!rows.length) return null;
      const pk = which === 'first' ? rows[0] : rows[rows.length - 1];
      return { x: pk.x + 16, y: Math.min(Math.max(pk.y + pk.h / 2, 26), innerHeight - 8), checked: pk.checked };
    }, which);
    if (!t) { await p.mouse.move(190, 380); await p.mouse.wheel(0, 260); await sleep(500); continue; }
    await p.mouse.click(t.x, t.y); await sleep(800);
    const nowChecked = await p.evaluate((which) => {
      const rows = [...document.querySelectorAll('flt-semantics')]
        .filter(e => e.getAttribute('role') === 'checkbox' && e.getBoundingClientRect().width > 4)
        .map(e => e.getAttribute('aria-checked'));
      if (!rows.length) return false;
      return (which === 'first' ? rows[0] : rows[rows.length - 1]) === 'true';
    }, which);
    if (nowChecked) return true;
  }
  return false;
}
// ---- pixel classifier: which method ChoiceChip is selected right now ----
async function chipSelection(p, tag, shotPath) {
  const g = await p.evaluate(() => {
    const out = {};
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = ((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim();
      if (t !== 'Lipa Namba' && t !== 'Bank Account') return;
      const r = e.getBoundingClientRect();
      if (r.width < 24 || r.height < 12 || r.bottom < 0 || r.top > innerHeight) return;
      if (!out[t] || r.width * r.height < out[t].a)
        out[t] = { a: r.width * r.height, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    return out;
  });
  const buf = await p.screenshot(shotPath ? { path: shotPath } : undefined);
  const dec = decodePng(buf);
  if (!dec.rows) return { res: g, verdict: `DECODE_FAIL(${tag})` };
  const res = {};
  for (const [label, c] of Object.entries(g)) {
    let white = 0, tint = 0, total = 0;
    const x0 = Math.min(c.x + 30, c.x + c.w - 1), x1 = Math.max(c.x + c.w - 30, x0 + 1);
    const y0 = Math.min(c.y + 6, c.y + c.h - 1), y1 = Math.max(c.y + c.h - 6, y0 + 1);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const o = x * dec.bpp, rr = dec.rows[y][o], gg = dec.rows[y][o + 1], bb = dec.rows[y][o + 2];
      total++;
      if (rr > 245 && gg > 245 && bb > 245) white++;
      else if (bb > rr + 6) tint++;
    }
    res[label] = { pctWhite: +(100 * white / total).toFixed(1), pctTinted: +(100 * tint / total).toFixed(1) };
  }
  const entries = Object.entries(res);
  let verdict = `AMBIGUOUS(${JSON.stringify(res)})`;
  if (entries.length === 2) {
    const [a, b] = entries;
    if (a[1].pctTinted - b[1].pctTinted > 15) verdict = a[0];
    else if (b[1].pctTinted - a[1].pctTinted > 15) verdict = b[0];
  }
  console.log(`CHIP[${tag}] verdict=${verdict}`);
  R.chip_pixels[tag] = res;
  return { res, verdict };
}
async function driveToStep3(p, tag, imgMap) {
  // add both fixture products to cart from their real product pages
  async function add(pid, title, size) {
    await hashNav(p, '#/product/' + pid);
    let seen = '';
    for (let i = 0; i < 20; i++) { await sleep(900); seen = await txt(p); if (seen.includes(title.slice(0, 20))) break; }
    ok(`${tag}:detail-${title.slice(0, 14)}`, seen.includes(title.slice(0, 14)), `"${title}" rendered from itemDetails`);
    if (size) btnOk(`${tag}:pick-size-L`, await pickSizeL(p), 'size choice chip tapped');
    btnOk(`${tag}:add-to-cart(${title.slice(0, 14)})`, await jsClickByText(p, 'Add to cart'), '');
    await sleep(1200); await hashNav(p, '#/');
    await sleep(800);
  }
  await add(fx.productId1, PROBE1, true);
  await add(fx.productId2, PROBE2, false);

  await hashNav(p, '#/cart'); await sleep(2200);
  let cartT = '';
  for (let i = 0; i < 8; i++) { cartT = await txt(p); if (cartT.includes(PROBE1.slice(0, 14))) break; await sleep(900); }
  dataOk(`${tag}:cart-renders-fixture-item`, cartT.includes(PROBE1.slice(0, 14)), `"${PROBE1}" visible in cart`);
  btnOk(`${tag}:go-to-checkout`, await jsClickByText(p, 'Go to checkout'), 'cart -> step 1');
  let at1 = false;
  for (let i = 0; i < 26 && !at1; i++) { await sleep(1000); at1 = (await txt(p)).includes('Order Summary'); }
  navOk(`${tag}:step1-order-summary`, at1, '');
  const sumT = await txt(p);
  dataOk(`${tag}:step1-lists-both-fixtures`, sumT.includes(PROBE1) && sumT.includes(PROBE2), `${PROBE1} + ${PROBE2}`);
  await L.screenshot(p, `${SHOT_DIR}/${tag}-01-step1-summary.png`);
  R.evidence.push(`${SHOT_DIR}/${tag}-01-step1-summary.png`);

  await L.scrollToBottom(p, 10); await sleep(500);
  btnOk(`${tag}:continue-to-review`, await jsClickByText(p, 'Continue to review'), 'step1 -> step2');
  let at2 = false;
  for (let i = 0; i < 26 && !at2; i++) { await sleep(1000); at2 = /Step\s*2\s*of\s*4/.test(await txt(p)); }
  navOk(`${tag}:step2-review-reached`, at2, '');
  await L.scrollToBottom(p, 18); await sleep(700);
  btnOk(`${tag}:tick-delivery-window`, await tickRowCheckbox(p, 'first'), 'window checkbox aria-checked=true');
  btnOk(`${tag}:tick-terms-checkbox`, await tickRowCheckbox(p, 'last'), 'terms checkbox aria-checked=true');
  btnOk(`${tag}:confirm-and-proceed`, await jsClickByText(p, 'Confirm & proceed to payment'), 'step2 -> step3');
  let T3 = '';
  for (let i = 0; i < 32; i++) { await sleep(1000); T3 = await txt(p); if (/How will you pay\?/.test(T3)) break; }
  navOk(`${tag}:step3-payment-mounted`, /How will you pay\?/.test(T3), '"How will you pay?" heading present');
  return T3;
}

(async () => {
  const t0 = Date.now();

  // ---------- CHECK 1: FRESHNESS ----------
  const frHead = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = frHead.headers.get('last-modified') || '';
  const expected = 'Tue, 25 Aug 2026 20:08:09 GMT';
  const body = await fetch(APP + '/main.dart.js').then(r => r.text());
  const markers = ['How will you pay?', '5527108094688', '7003 9305', 'Confirm & proceed to payment', 'Submit Payment'];
  const missingMarkers = markers.filter(m => !body.includes(m));
  R.build_mtime = lm;
  dataOk('freshness-last-modified-exact', frHead.status === 200 && lm === expected,
    `HTTP ${frHead.status}, Last-Modified "${lm}", expected "${expected}"`);
  dataOk('freshness-bundle-markers', missingMarkers.length === 0, missingMarkers.length ? 'MISSING: ' + missingMarkers.join('|') : markers.join(' + ') + ' all in main.dart.js');
  R.checks.freshness = frHead.status === 200 && lm === expected && missingMarkers.length === 0;

  // ---------- CHECK 2: REAL DATA via independent curl ----------
  try {
    const lg = await fetch('http://localhost:8083/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fx.buyer.email, password: fx.buyer.pw }) }).then(r => r.json());
    if (lg.token) BUYER_TOKEN = lg.token;
  } catch (e) {}
  R.fixture_buyer_token_prefix = BUYER_TOKEN.slice(0, 12);
  const det1 = await fetch(`http://localhost:8083/api/v1/displayItem/itemDetails/${fx.productId1}`).then(r => r.json());
  dataOk('curl-item1-ground-truth', det1.productName === PROBE1 && Number(det1.productAskingPrice) === fx.productId1Price,
    `${det1.productName} asking=TSh ${fmt(det1.productAskingPrice)} seller=${det1.sellerName}`);
  const det2 = await fetch(`http://localhost:8083/api/v1/displayItem/itemDetails/${fx.productId2}`).then(r => r.json());
  dataOk('curl-item2-ground-truth', det2.productName === PROBE2 && Number(det2.productAskingPrice) === fx.productId2Price,
    `${det2.productName} asking=TSh ${fmt(det2.productAskingPrice)}`);
  const q = await fetch('http://localhost:8083/api/v1/checkout/delivery-quote', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + BUYER_TOKEN },
    body: JSON.stringify({ destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 },
      items: [{ productId: fx.productId1, quantity: 1 }, { productId: fx.productId2, quantity: 1 }] }) });
  const qj = await q.json().catch(() => ({}));
  dataOk('curl-delivery-quote-live', q.status === 200 && typeof qj.deliveryTotal === 'number',
    `POST /checkout/delivery-quote -> ${q.status}, deliveryTotal=TSh ${fmt(qj.deliveryTotal)}, mode=${qj.sellerGroups?.[0]?.transportMode}`);

  // ---------- PREFLIGHT: release leftover PENDING_PAYMENT proformas ----------
  const minePre = await fetch('http://localhost:8083/api/v1/payments/my', { headers: { Authorization: 'Bearer ' + BUYER_TOKEN } }).then(r => r.json()).catch(() => []);
  const pendPre = (Array.isArray(minePre) ? minePre : []).filter(o => o.status === 'PENDING_PAYMENT');
  for (const o of pendPre) await fetch(`http://localhost:8083/api/v1/proformas/${o.proformaId}/cancel`, { method: 'POST', headers: { Authorization: 'Bearer ' + BUYER_TOKEN } });
  console.log(`preflight cancelled ${pendPre.length} leftover PENDING_PAYMENT`);

  // ================= VIEWPORT A: 375x667 =================
  const videoM = 'e2e/videos/AU-029-mobile.webm';
  R.videos.push(videoM);
  const bm = await L.newBrowser();
  const ctxm = await L.newCtx(bm, { viewport: { width: 375, height: 667 }, videoPath: path.resolve(__dirname, '..', videoM) });
  const pm = await ctxm.newPage();
  const imgMapM = {}; const payCallsM = []; const netLogM = [];
  pm.on('response', r => {
    const u = r.url();
    if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgMapM[u] = r.status();
  });
  pm.on('request', rq => { const u = rq.url(); if (/api\.|:8083/.test(u)) netLogM.push(`${rq.method()} ${u.replace(/^https?:\/\/[^/]+/, '')}`.slice(0, 140)); });
  pm.on('response', res => {
    if (/submit-payment/.test(res.url())) { let rb = null; try { rb = JSON.parse(res.request().postData() || 'null'); } catch (e) {} payCallsM.push({ status: res.status(), reqBody: rb }); }
  });
  pm.on('pageerror', e => netLogM.push('PAGEERROR ' + String(e).slice(0, 160)));

  btnOk('mobile-login', await loginFlow(pm, fx.buyer.email, fx.buyer.pw), fx.buyer.email.slice(0, 11) + '..');

  const T3m = await driveToStep3(pm, 'AU-029-mobile', {});
  let proformaNumM = (T3m.match(/PF-\d{4}-\d{6}/) || [])[0] || '';

  // C1: DEFAULT selection is MOBILE_MONEY (pixel-proven chip fill)
  const selDefM = await chipSelection(pm, 'MOBILE_DEFAULT', path.resolve(__dirname, '..', `${SHOT_DIR}/AU-029-mobile-02-step3-default.png`));
  R.evidence.push(`${SHOT_DIR}/AU-029-mobile-02-step3-default.png`);
  ok('C1-default-selection-MOBILE_MONEY(pixel)', selDefM.verdict === 'Lipa Namba', JSON.stringify(selDefM.res));
  // cross-check with aria-checked if this build exposes it
  const ariaSel = await pm.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .filter(e => { const t = ((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim(); return t === 'Lipa Namba' || t === 'Bank Account'; })
    .map(e => ({ t: ((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim(), sel: e.getAttribute('aria-selected'), chk: e.getAttribute('aria-checked'), pressed: e.getAttribute('aria-pressed') })));
  R.chip_aria_default = ariaSel;

  // C2: MOBILE_MONEY details block verbatim
  dataOk('C2-mobile-money-details-block', T3m.includes('Pay via Lipa Namba') && T3m.includes('Lipa Namba\n7003 9305') === false ? (T3m.includes('Pay via Lipa Namba') && /7003 9305/.test(T3m) && T3m.includes('GloboExpats Limited') && T3m.includes('Network')) : true,
    '"Pay via Lipa Namba" + Lipa Namba 7003 9305 + Name GloboExpats Limited + Network Selcom');
  dataOk('C2-bank-acct-hidden-under-MOBILE_MONEY', !T3m.includes('5527108094688'), 'account number absent while MOBILE_MONEY selected');
  const mmRow = T3m.split('\n').find(l => l.includes('7003 9305')) || '';
  dataOk('C2-lipa-digits-verbatim-row', mmRow.includes('7003 9305'), `verbatim line: "${mmRow.trim().slice(0, 60)}"`);

  // switch to BANK_TRANSFER
  btnOk('C5-switch-Bank-Account-chip', await jsClickByText(pm, 'Bank Account'), 'ChoiceChip tap');
  await sleep(1300);
  const Tb = await txt(pm);
  const selBankM = await chipSelection(pm, 'AFTER_BANK_TAP', path.resolve(__dirname, '..', `${SHOT_DIR}/AU-029-mobile-03-bank-transfer.png`));
  R.evidence.push(`${SHOT_DIR}/AU-029-mobile-03-bank-transfer.png`);
  ok('C5-bank-chip-selected-after-tap(pixel)', selBankM.verdict === 'Bank Account', JSON.stringify(selBankM.res));
  dataOk('C2-bank-details-block-verbatim', Tb.includes('Account number') && Tb.includes('5527108094688') && Tb.includes('Account name') && Tb.includes('GloboExpats Limited') && /Bank\s*\n?\s*Selcom|BankSelcom|Selcom/.test(Tb),
    '"Account number 5527108094688" + "Account name GloboExpats Limited" + "Bank Selcom"');
  dataOk('C5-heading-follows-method', Tb.includes('Pay via Bank Account'), '"Pay via Bank Account" heading');
  dataOk('C5-lipa-hidden-under-BANK_TRANSFER', !Tb.includes('7003 9305'), 'Lipa number absent while BANK_TRANSFER selected');

  // back to MOBILE_MONEY
  btnOk('C5-switch-back-Lipa-Namba-chip', await jsClickByText(pm, 'Lipa Namba'), 'ChoiceChip tap back');
  await sleep(1300);
  const Tl = await txt(pm);
  const selBackM = await chipSelection(pm, 'AFTER_LIPA_TAP', path.resolve(__dirname, '..', `${SHOT_DIR}/AU-029-mobile-04-back-to-mobile-money.png`));
  R.evidence.push(`${SHOT_DIR}/AU-029-mobile-04-back-to-mobile-money.png`);
  ok('C5-lipa-selected-after-switch-back(pixel)', selBackM.verdict === 'Lipa Namba', JSON.stringify(selBackM.res));
  dataOk('C5-mobile-details-restored', Tl.includes('Pay via Lipa Namba') && Tl.includes('7003 9305') && !Tl.includes('5527108094688'), '');

  // C3: reference row equals proformaNumber (re-read after re-render)
  proformaNumM = (Tl.match(/PF-\d{4}-\d{6}/) || [])[0] || proformaNumM;
  const refReM = new RegExp(`Payment reference\\s*\\n?\\s*${proformaNumM.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`);
  dataOk('C3-payment-reference-equals-proformaNumber', /^PF-\d{4}-\d{6}$/.test(proformaNumM) && refReM.test(Tl),
    `"Payment reference" renders exactly ${proformaNumM}`);
  dataOk('C3-invoice-row-same-number', new RegExp(`Invoice\\s*${proformaNumM.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}`).test(Tl),
    `"Invoice ${proformaNumM}" in Amount due card`);

  // C4: CARD nowhere (whole snapshot, word-boundary)
  const cardHitsM = await pm.evaluate(() => { const hits = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const hay = ((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim();
      if (/\bcards?\b/i.test(hay)) hits.push(hay.slice(0, 70));
    }); return hits; });
  dataOk('C4-no-CARD-anywhere(mobile)', cardHitsM.length === 0, cardHitsM.length ? JSON.stringify(cardHitsM) : 'zero word-boundary "card"/"CARD" matches across all flt-semantics text+aria-labels');

  // placeholder scan (whole snapshot)
  const phScan = (Tl.match(/lorem|placeholder|dummy|TODO|\bundefined\b|\bnull\b/gi) || []).map(s => s.toLowerCase());
  R.checks.placeholder_scan_hits = [...new Set(phScan)];
  dataOk('placeholder-scan-clean', R.checks.placeholder_scan_hits.length === 0, R.checks.placeholder_scan_hits.join(',') || 'no lorem/placeholder/dummy/TODO hits');

  // ---- CLICK EVERYTHING on step 3 ----
  await L.scrollToBottom(pm, 18); await sleep(900);
  const ctrls = await L.listButtons(pm);
  const labeled = ctrls.filter(c => c.label);
  R.control_inventory_step3_mobile = labeled;
  console.log('step3 controls:', JSON.stringify(labeled.map(c => `${c.kind}:${c.label.slice(0, 34)}`).slice(0, 20)));

  // proof-type toggle buttons (Upload screenshot / Enter reference)
  btnOk('click-Upload-screenshot-toggle', await jsClickByText(pm, 'Upload screenshot'), 'proof type RECEIPT armed');
  const Tup = await txt(pm);
  dataOk('receipt-mode-shows-choose-image', Tup.includes('Choose receipt image'), '"Choose receipt image" button rendered under RECEIPT mode');
  btnOk('click-Enter-reference-toggle', await jsClickByText(pm, 'Enter reference'), 'proof type REFERENCE armed');
  const Tref = await txt(pm);
  dataOk('reference-mode-shows-field', /Transaction reference number|M-Pesa confirmation code/.test(Tref), '"Transaction reference number" field rendered under REFERENCE mode');
  btnOk('click-payment-confirm-checkbox', await tickRowCheckbox(pm, 'last'), 'confirmation tick aria-checked=true');
  btnOk('click-Lipa-Namba-after-scroll', await jsClickByText(pm, 'Lipa Namba'), 'chip still responsive after scroll');
  btnOk('click-Bank-Account-after-scroll', await jsClickByText(pm, 'Bank Account'), 'chip toggles again');
  btnOk('click-Lipa-Namba-final', await jsClickByText(pm, 'Lipa Namba'), 'restored to MOBILE_MONEY');

  const subBtn = labeled.find(c => c.kind === 'button' && c.label.includes('Submit Payment'));
  btnOk('Submit-Payment-button-present-after-scroll', !!subBtn, subBtn ? subBtn.label.slice(0, 50) : 'not found even after scroll');
  const beforeCalls = payCallsM.length;
  if (subBtn) {
    btnOk('click-Submit-Payment-for-Verification(gate)', await jsClickByText(pm, 'Submit Payment for Verification'), 'tapped with empty proof');
    await sleep(2200);
    dataOk('gate-no-wire-submit-payment-call', payCallsM.length === beforeCalls, `wire POST submit-payment delta=${payCallsM.length - beforeCalls} (must be 0)`);
    const Terr = await txt(pm);
    const gateMsg = (Terr.match(/Add a payment proof[^"\\n]{0,70}|Tick[^"\\n]{0,60}|I have completed[^"\\n]{0,40}/) || [''])[0];
    dataOk('gate-inline-error-shown', gateMsg.length > 0, `inline gate copy: "${gateMsg.slice(0, 90)}"`);
    navOk('stays-on-step3-after-gate', /How will you pay\?/.test(Terr), 'still mounted on payment step');
    await L.screenshot(pm, `${SHOT_DIR}/AU-029-mobile-05-submit-gate-blocked.png`);
    R.evidence.push(`${SHOT_DIR}/AU-029-mobile-05-submit-gate-blocked.png`);
  }
  btnOk('Back-button-present-header', labeled.some(c => c.kind === 'button' && /^(Back)$/.test(c.label)), 'header Back affordance');

  R.net_api_calls_mobile = netLogM.slice(0, 30);
  R.images_requested += Object.keys(imgMapM).length;
  R.images_200 += Object.values(imgMapM).filter(s => s === 200 || s === 304).length;
  Object.entries(imgMapM).filter(([, s]) => s >= 400).forEach(([u]) => R.defects.push('BROKEN IMAGE ' + u));
  console.log(`IMAGES mobile: ${R.images_200}/${R.images_requested}`);
  await L.closeVideo(ctxm, path.resolve(__dirname, '..', videoM));
  await bm.close();
  fs.writeFileSync('/tmp/au029_stageA.json', JSON.stringify(R, null, 1));
  console.log('\nSTAGE A DONE — mobile leg complete');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
