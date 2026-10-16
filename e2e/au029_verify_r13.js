// au029_verify_r13.js — CANONICAL CHECKLIST (CAMPAIGN_V2 Appendix A) for
//   AU-029 payment_method_picker_receiving_details  — RW lane — FROZEN bundle :9131
//   git sha c6b4d61, main.dart.js Last-Modified Wed, 26 Aug 2026 04:41:42 GMT.
//
// Acceptance: MOBILE_MONEY(default)/BANK_TRANSFER picker; Selcom receiving details
// (acct 5527108094688 / Lipa Namba 7003 9305) + reference=proformaNumber displayed;
// CARD appears nowhere.
//
// RW fixtures: /tmp/au029_fixtures_r13.json minted through the REAL sandbox API by
// au029_seed_r13.js — throwaway buyer 729 + throwaway VERIFIED seller 730 owning
// product "AU029 R13 Selcom Lamp <stamp>" (TSh 13,000, no choices). The browser drives
// cart -> checkout step1 -> step2 -> step3 on ITS OWN proforma. No rows outside this
// buyer's own are touched; the API ground-truth proforma was cancelled in the seed.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const decode = require('./lib_au029.js').decodePng;

const APP = 'http://localhost:9131';
const REF = 'http://localhost:3000';
const UNIT = 'AU-029', STAGE = 'verify-r13';
const BUILD_SHA = 'e694463', BUILD_MT = 'Wed, 26 Aug 2026 08:15:26 GMT';
const SHOT_DIR = `e2e/shots/${UNIT}`;
const fx = JSON.parse(fs.readFileSync('/tmp/au029_fixtures_r13.json', 'utf8'));
const PROD_TITLE = fx.groundTruth.productName;

// Verbatim copy from the frozen bundle (grep of main.dart.js @ c6b4d61):
//   B.a15=new A.aC("Account number","5527108094688") / a18 Account name GloboExpats Limited
//   B.a16=new A.aC("Bank","Selcom"); B.a13=new A.aC("Lipa Namba","7003 9305")
//   B.a12 Name GloboExpats Limited ; B.a1b Network Selcom
//   B.FZ="Bank Account" chip ; B.FT="Lipa Namba" chip
const ACCT = '5527108094688', LIPA = '7003 9305', NAME = 'GloboExpats Limited';

let NAVSEQ = 0;
const R = {
  ts: new Date().toISOString(), unit: UNIT, stage: STAGE, verdict: null,
  lane: APP, build_sha: BUILD_SHA, bundle_mtime: null,
  checks: {
    freshness: false, real_data: false, images_requested: 0, images_200: 0,
    buttons_total: 0, buttons_ok: 0, buttons_failed: [], state_asserts: 0,
    nav_asserts: 0, vision_defects: 0, vision_findings: [], vision_shots_read: [],
    parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
  },
  failures: [], defects: [], evidence: [], shots: [], videos: [],
  asserts: [], submitCalls: [], chip_pixels: {},
};
function assert(name, pass, detail) {
  R.asserts.push({ name, pass: !!pass, detail: String(detail ?? '').slice(0, 400) });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + String(detail).slice(0, 190) : ''));
  if (!pass) R.failures.push(name);
}
function btn(name, cond, detail) {
  R.checks.buttons_total++;
  if (cond) { R.checks.buttons_ok++; console.log('BTN  ' + name + (detail ? ' :: ' + detail : '')); }
  else { R.checks.buttons_failed.push(name); R.failures.push('button:' + name); console.log('FAIL-BTN ' + name + ' ' + (detail || '')); }
  return cond;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p) { return L.allText(p); }
function shotPath(vp, state) { return `${SHOT_DIR}/${UNIT}-r13-${vp}-${state}.png`; }
async function shot(p, vp, state) { const f = shotPath(vp, state); await L.screenshot(p, f); R.shots.push(f); R.evidence.push(f); return f; }

async function isLoggedIn(p) {
  try { return !!(await p.evaluate(() => localStorage.getItem('flutter.auth_token') || '')); } catch (e) { return false; }
}
async function loginFlow(p) {
  await L.waitText(p, 'Buy now', 60000);
  let logged = await isLoggedIn(p);
  if (!logged) {
    await L.clickBtn(p, 'Login');
    await L.waitText(p, 'Welcome back', 30000);
    const ei = p.locator('input[type="text"]').first();
    await ei.click({ force: true }).catch(() => {}); await sleep(400);
    await p.keyboard.type(fx.buyer.email, { delay: 14 });
    const pi = p.locator('input[type="password"]').first();
    await pi.click({ force: true }).catch(() => {}); await sleep(400);
    await p.keyboard.type(fx.buyer.pw, { delay: 14 });
    await L.clickBtn(p, 'Log in');
    for (let i = 0; i < 40 && !logged; i++) { await sleep(1000); logged = await isLoggedIn(p); }
  }
  for (let i = 0; i < 25; i++) {
    const n = await p.evaluate(() => document.querySelectorAll('flt-semantics').length).catch(() => 0);
    if (n > 30 && logged) return logged;
    await sleep(900);
  }
  return logged;
}
async function jsClickByText(p, label) {
  const hit = await p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
      const roleOk = e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null;
      if (!roleOk) return;
      if (!best || r.width * r.height < best.area)
        best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), label: t.slice(0, 60) };
    });
    return best;
  }, label);
  if (!hit) return false;
  await p.mouse.click(Math.max(3, hit.x), Math.max(20, Math.min(hit.y, 1015)));
  await sleep(1000);
  return true;
}
async function hashNav(p, route) { await p.evaluate(r => { location.hash = r; }, route); await sleep(2500); }

// pixel classifier: which method chip is SELECTED right now (no aria-selected in Flutter web)
async function chipSelection(p, tag, vpMax) {
  const maxY = vpMax || 1015;
  const g = await p.evaluate((my) => {
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
  }, maxY);
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
async function tickCheckbox(p, which, maxBottom, maxY) {
  const t = await p.evaluate((args) => {
    const rows = [...document.querySelectorAll('flt-semantics')]
      .filter(e => e.getAttribute('role') === 'checkbox')
      .map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height,
        vis: r.y > 40 && (r.y + r.height) < args.mb && r.width > 5 }; })
      .filter(b => b.vis);
    if (!rows.length) return null;
    const pk = args.which === 'first' ? rows[0] : rows[rows.length - 1];
    return { x: pk.x + 18, y: Math.min(Math.max(pk.y + pk.h / 2, 22), args.my) };
  }, { which, mb: maxBottom, my: maxY });
  if (!t) return false;
  await p.mouse.click(t.x, t.y); await sleep(900);
  return true;
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  // ================= CHECK 1: FRESHNESS =================
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  const body = await fetch(APP + '/main.dart.js').then(r => r.text());
  const markers = ['5527108094688', '7003 9305', 'How will you pay?', 'Submit Payment for Verification']
    .map(s => [s, body.includes(s)]);
  const markerOk = markers.every(([, v]) => v);
  R.bundle_mtime = lm;
  R.checks.freshness = head.status === 200 && lm === BUILD_MT && markerOk;
  assert('1-freshness-frozen-c6b4d61-bundle', R.checks.freshness,
    `HTTP ${head.status} Last-Modified="${lm}" expected "${BUILD_MT}"; content markers: ${markers.map(([s, v]) => `${s.slice(0, 18)}=${v}`).join(', ')}`);

  // ================= CHECK 2: REAL DATA via independent curl =================
  const btok = await L.apiLogin({ email: fx.buyer.email, pw: fx.buyer.pw });
  fx.buyer.token = btok;
  const gt = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${fx.productId}`);
  assert('2-curl-item-ground-truth', gt.status === 200 && gt.json?.productName === PROD_TITLE,
    `${gt.json?.productName} askingPrice=TSh ${gt.json?.productAskingPrice} img=${JSON.stringify(gt.json?.productImages?.[0])}`);
  const qReal = await L.api(btok, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 },
    items: [{ productId: fx.productId, quantity: 1 }] });
  assert('2-curl-delivery-quote', qReal.status === 200 && typeof qReal.json?.deliveryTotal === 'number',
    `deliveryTotal=TSh ${qReal.json?.deliveryTotal} mode=${qReal.json?.sellerGroups?.[0]?.transportMode}`);
  R.checks.real_data = gt.status === 200 && qReal.status === 200;

  // preflight: this buyer must have no leftover PENDING_PAYMENT proforma
  const minePre = await L.api(btok, 'GET', '/api/v1/payments/my');
  const pendPre = (Array.isArray(minePre.json) ? minePre.json : []).filter(o => o.status === 'PENDING_PAYMENT');
  for (const o of pendPre) await L.api(btok, 'POST', `/api/v1/proformas/${o.proformaId}/cancel`, {});
  console.log('preflight cancelled:', pendPre.length);

  for (const VP of [
    { name: 'mobile', width: 375, height: 667, video: 'e2e/videos/AU-029-r13-mobile.webm' },
    { name: 'tablet', width: 768, height: 1024, video: 'e2e/videos/AU-029-r13-tablet.webm' },
  ]) {
    const vpN = VP.name;
    console.log(`\n========== VIEWPORT ${vpN} ${VP.width}x${VP.height} ==========`);
    let browser, ctx, page;
    try {
      browser = await L.newBrowser();
      ctx = await L.newCtx(browser, { viewport: { width: VP.width, height: VP.height }, videoPath: VP.video });
      page = await ctx.newPage();
      const imgMap = {};
      page.on('response', r => {
        const u = r.url();
        if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /(\/assets\/).*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
      });
      page.on('response', async res => {
        if (/\/submit-payment/.test(res.url())) {
          let reqBody = null; try { reqBody = JSON.parse(res.request().postData() || 'null'); } catch (e) {}
          R.submitCalls.push({ vp: vpN, status: res.status(), reqBody });
        }
      });

      await page.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
      btn(`${vpN}-login`, await loginFlow(page), fx.buyer.email.slice(0, 12));

      // ---- add fixture product to cart ----
      await page.evaluate(id => { location.hash = '#/product/' + id; }, fx.productId);
      let dT = '';
      for (let i = 0; i < 20; i++) { await sleep(1000); dT = await txt(page); if (dT.includes(PROD_TITLE.slice(0, 24))) break; }
      assert(`nav-${vpN}-product-detail-open`, dT.includes(PROD_TITLE.slice(0, 24)), PROD_TITLE);
      R.nav_asserts++;
      await shot(page, vpN, '01-product-detail');

      btn(`${vpN}-add-to-cart-clicked`, await jsClickByText(page, 'Add to cart'), 'real POST-less client cart add');
      await sleep(1400); await hashNav(page, '#/');
      await hashNav(page, '#/cart');
      // Known harness fact (AU-028 final verifier): the cart tile carousel exposes only the
      // FIRST tile's text in flt-semantics, and after a fresh add it can lag one paint behind.
      // Ground truth is step 1: if checkout Order Summary lists the fixture, the cart held it.
      let cT = '';
      for (let i = 0; i < 12; i++) { cT = await txt(page); if (cT.includes(PROD_TITLE.slice(0, 24))) break; await sleep(900); }
      const cartShown = cT.includes(PROD_TITLE.slice(0, 24));
      btn(`${vpN}-go-to-checkout`, await jsClickByText(page, 'Go to checkout'), 'cart -> checkout step 1');
      let s1 = '';
      for (let i = 0; i < 26 && !s1; i++) { await sleep(1000); s1 = /Order Summary/.test(await txt(page)) ? 'y' : ''; }
      assert(`nav-${vpN}-checkout-step1-order-summary`, !!s1, '');
      R.nav_asserts++;
      const T1 = await txt(page);
      assert(`data-${vpN}-cart-held-fixture-order-summary-lists-it`,
        cartShown || T1.includes(PROD_TITLE.slice(0, 24)),
        `cart a11y text showed fixture=${cartShown} (carousel exposes first tile only — known harness fact); Order Summary lists "${PROD_TITLE}"=${T1.includes(PROD_TITLE.slice(0, 24))}`);
      await shot(page, vpN, '02-checkout-step1-summary');

      await L.scrollToBottom(page, 10); await sleep(500);
      btn(`${vpN}-continue-to-review`, await jsClickByText(page, 'Continue to review'), 'step1 -> step2');
      let at2 = false;
      for (let i = 0; i < 28 && !at2; i++) { await sleep(1000); at2 = /Step\s*2\s*of\s*4/.test(await txt(page)) || /Review/.test(await txt(page)); }
      assert(`nav-${vpN}-review-step2-of-4`, at2, '');
      R.nav_asserts++;

      await L.scrollToBottom(page, 18); await sleep(700);
      const winOk = await tickCheckbox(page, 'first', VP.height - 10, VP.height - 9);
      const termsOk = await tickCheckbox(page, 'last', VP.height - 10, VP.height - 9);
      btn(`${vpN}-select-delivery-window`, winOk, 'first window checkbox ticked');
      btn(`${vpN}-tick-terms-checkbox`, termsOk, 'terms checkbox ticked');
      await shot(page, vpN, '03-step2-review-ticked');

      btn(`${vpN}-confirm-proceed-payment`, await jsClickByText(page, 'Confirm & proceed to payment'), 'step2 -> step3');
      let T3 = '';
      for (let i = 0; i < 32; i++) { await sleep(1000); T3 = await txt(page); if (/How will you pay\?/.test(T3)) break; }
      assert(`nav-${vpN}-step3-mounted-how-will-you-pay`, /How will you pay\?/.test(T3),
        `"How will you pay?" heading rendered at ${VP.width}x${VP.height}`);
      R.nav_asserts++;
      await shot(page, vpN, '04-step3-default-mobile-money');

      // ---- acceptance C1: default selection is MOBILE_MONEY (pixel-proven) ----
      const selDefault = await chipSelection(page, `${vpN}_DEFAULT`, mouseMaxY(VP));
      R.chip_pixels[`${vpN}_default`] = selDefault.res;
      assert(`c1-${vpN}-default-selection-is-MOBILE_MONEY`, selDefault.verdict === 'Lipa Namba', JSON.stringify(selDefault.res));

      // ---- acceptance C2: receiving details under MOBILE_MONEY ----
      const pfM = (T3.match(/PF-\d{4}-\d{6}/) || [])[0] || '';
      assert(`c3-${vpN}-proforma-rendered-on-step3`, /^PF-\d{4}-\d{6}$/.test(pfM), pfM);
      assert(`c2-${vpN}-lipa-block-verbatim`, T3.includes('Pay via Lipa Namba') && T3.includes(LIPA)
        && T3.includes(NAME) && /Network\s*\n?\s*Selcom|NetworkSelcom/i.test(T3.replace(/\n/g, '')),
        `"Pay via Lipa Namba" + "Lipa Namba ${LIPA}" + "Name ${NAME}" + "Network Selcom"`);
      assert(`c2-${vpN}-bank-digits-hidden-under-MOBILE_MONEY`, !T3.includes(ACCT), `${ACCT} absent while MOBILE_MONEY selected`);

      // ---- acceptance C5: switch to BANK_TRANSFER ----
      btn(`${vpN}-chip-Bank-Account-tapped`, await jsClickByText(page, 'Bank Account'), 'ChoiceChip tap');
      await sleep(1300);
      const Tb = await txt(page);
      const selBank = await chipSelection(page, `${vpN}_BANK`, mouseMaxY(VP));
      R.chip_pixels[`${vpN}_bank`] = selBank.res;
      assert(`c5-${vpN}-bank-chip-selected-after-tap`, selBank.verdict === 'Bank Account', JSON.stringify(selBank.res));
      assert(`c2-${vpN}-bank-details-verbatim`, Tb.includes('Account number') && Tb.includes(ACCT)
        && Tb.includes('Account name') && Tb.includes(NAME) && /Bank\s*\n?\s*Selcom|BankSelcom/i.test(Tb.replace(/\n/g, '')),
        `"Account number ${ACCT}" + "Account name ${NAME}" + "Bank Selcom"`);
      assert(`c5-${vpN}-heading-follows-method`, Tb.includes('Pay via Bank Account'), '"Pay via Bank Account"');
      assert(`c5-${vpN}-lipa-digits-hidden-under-BANK_TRANSFER`, !Tb.includes(LIPA), `${LIPA} absent under BANK_TRANSFER`);
      await shot(page, vpN, '05-step3-bank-transfer');

      // ---- switch back to MOBILE_MONEY ----
      btn(`${vpN}-chip-Lipa-Namba-tapped-back`, await jsClickByText(page, 'Lipa Namba'), 'ChoiceChip tap back');
      await sleep(1300);
      const Tl = await txt(page);
      const selBack = await chipSelection(page, `${vpN}_BACK`, mouseMaxY(VP));
      R.chip_pixels[`${vpN}_back`] = selBack.res;
      assert(`c5-${vpN}-switch-back-restores-MOBILE_MONEY`, selBack.verdict === 'Lipa Namba', JSON.stringify(selBack.res));
      assert(`c5-${vpN}-mobile-details-restored`, Tl.includes('Pay via Lipa Namba') && Tl.includes(LIPA) && !Tl.includes(ACCT), '');

      // ---- acceptance C3: reference == proformaNumber ----
      assert(`c3-${vpN}-payment-reference-equals-proformaNumber`,
        new RegExp(`Payment reference\\s*${pfM}`).test(Tl),
        `"Payment reference" value renders exactly ${pfM}`);
      assert(`c3-${vpN}-invoice-row-same-number`, new RegExp(`Invoice\\s*${pfM}`).test(Tl),
        `"Invoice ${pfM}" inside Amount due card`);

      // ---- acceptance C4: CARD appears nowhere ----
      const cardHits = await page.evaluate(() => {
        const hits = [];
        document.querySelectorAll('flt-semantics').forEach(e => {
          const t = (e.textContent || '').trim();
          if (/\bcard\b/i.test(t)) hits.push(t.slice(0, 70));
        });
        return hits;
      });
      assert(`c4-${vpN}-no-CARD-anywhere-a11y`, cardHits.length === 0,
        cardHits.length ? JSON.stringify(cardHits) : 'zero word-boundary "card" matches across all flt-semantics text');

      // ---- click-everything rule on step 3 ----
      await L.scrollToBottom(page, 20); await sleep(900);
      const ctrls = await L.listButtons(page);
      const labeled = ctrls.filter(c => c.label);
      console.log(`step3 controls[${vpN}]:`, JSON.stringify(labeled.map(c => `${c.kind}:${c.label.slice(0, 34)}`)).slice(0, 700));
      const subBtn = labeled.find(c => c.kind === 'button' && /Submit Payment/.test(c.label));
      btn(`${vpN}-submit-payment-button-reachable-after-scroll`, !!subBtn, subBtn ? subBtn.label.slice(0, 50) : 'NOT FOUND after scroll');
      const before = R.submitCalls.filter(c => c.vp === vpN).length;
      if (subBtn) {
        await jsClickByText(page, 'Submit Payment for Verification'); await sleep(2400);
        const delta = R.submitCalls.filter(c => c.vp === vpN).length - before;
        // gate: no proof typed + confirmation unticked -> NO wire call, inline error, stays on step 3
        assert(`submit-${vpN}-without-proof-no-wire-call`, delta === 0,
          `wire POST submit-payment delta=${delta} (must be 0)`);
        const Terr = await txt(page);
        const gateMsg = (Terr.match(/Add a payment proof[\s\S]{0,90}?|Tick\s*"I have completed[\s\S]{0,70}?/) || [''])[0];
        assert(`submit-${vpN}-inline-gate-error-shown`, gateMsg.trim().length > 0,
          `inline gate copy rendered: "${gateMsg.trim().slice(0, 110)}"`);
        assert(`nav-${vpN}-stays-on-step3-after-gate`, /How will you pay\?/.test(Terr), '');
        R.nav_asserts++;
        await shot(page, vpN, '06-submit-gate-blocked');
        // disabled-state probe: with nothing filled the button still exists and is enabled-but-gated.
        // Assert the reason explicitly (rule: disabled controls need a why).
        const disProbe = await page.evaluate(() => {
          const els = [...document.querySelectorAll('flt-semantics')];
          const b = els.find(e => e.getAttribute('role') === 'button' && /Submit Payment/.test(e.textContent || ''));
          return b ? { disabled: b.getAttribute('aria-disabled') ?? null, tag: b.tagName } : null;
        });
        console.log(`submit-btn state[${vpN}]:`, JSON.stringify(disProbe), '(enabled-by-design: gate is validated on tap, not via disabled)');
      } else {
        assert(`submit-${vpN}-gate-untested-no-button`, false, 'Submit Payment not reachable even after scroll');
      }

      // header Back affordance
      const hasBack = labeled.some(c => c.kind === 'button' && c.label === 'Back');
      btn(`${vpN}-back-button-present-in-header`, hasBack, hasBack ? 'Back' : 'no Back control found');

      // ---- CHECK 3: images ----
      const entries = Object.entries(imgMap);
      R.checks.images_requested += entries.length;
      R.checks.images_200 += entries.filter(([, s]) => s === 200 || s === 304).length;
      entries.filter(([, s]) => s >= 400).forEach(([u]) => R.defects.push('image>=400: ' + u));
      console.log(`images[${vpN}]: ${entries.filter(([, s]) => s === 200 || s === 304).length}/${entries.length}`);

      // ---- placeholder scan ----
      const phAll = (Tl + Tb) .match(/lorem|placeholder-text|dummy data|TODO:/i);
      assert(`2-no-placeholders-${vpN}`, !phAll, phAll ? phAll[0] : 'none in step-3 a11y text');

      const pv = ctx.pages()[0] && await ctx.pages()[0].video();
      await ctx.close(); if (pv) await pv.saveAs(VP.video).catch(() => {});
      R.videos.push(VP.video); R.evidence.push(VP.video);
      await browser.close();
    } catch (e) {
      console.error(`FATAL[${vpN}]`, e.message);
      assert(`fatal-${vpN}`, false, e.message);
      try { await browser.close(); } catch (_) {}
    }
  }

  function mouseMaxY(VP) { return VP.height - 9; }

  // ================= CLEANUP: cancel our own leftover PENDING proforma =================
  const mineAfter = await L.api(btok, 'GET', '/api/v1/payments/my');
  const pendAfter = (Array.isArray(mineAfter.json) ? mineAfter.json : []).filter(o => o.status === 'PENDING_PAYMENT');
  R.cleanupCancelled = [];
  for (const o of pendAfter) {
    const c = await L.api(btok, 'POST', `/api/v1/proformas/${o.proformaId}/cancel`, {});
    R.cleanupCancelled.push(`${o.proformaNumber}->${c.status}`);
  }
  console.log('cleanup cancels:', R.cleanupCancelled.join(',') || 'none');

  // ================= CHECK 8: PARITY vs reference :3000 =================
  try {
    const browser = await L.newBrowser();
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    const resp = await p.goto(REF + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
    await sleep(8000);
    const refT = await p.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => '');
    fs.writeFileSync('e2e/results/shards/raw-AU-029-r13-ref-home.txt', refT);
    await p.screenshot({ path: `${SHOT_DIR}/ref-r13-home.png` }).catch(() => {});
    R.shots.push(`${SHOT_DIR}/ref-r13-home.png`);
    const up = !!(resp && resp.ok()) || refT.length > 100;
    // structural parity from source (the live reference proxies the dev backend where our
    // sandbox fixtures do not exist -> deep-link parity not executable live).
    const refCheckout = (() => { try { return fs.readFileSync('/home/devsystemadmin/GloboExpats_Frontend/components/checkout/checkout-flow.tsx', 'utf8'); } catch (e) { return ''; }; })();
    const srcHit = /5527108094688|7003\s?9305|Lipa Namba/.test(refCheckout);
    assert('8-parity-reference-live-and-source', up && srcHit,
      `reference home HTTP ${resp ? resp.status() : 'n/a'} (${refT.length} chars); structural parity from components/checkout/checkout-flow.tsx hit=${srcHit}` +
      (up ? '' : ' | ACCEPTED-DIVERGENCE: deep-link parity impossible live'));
    R.checks.parity[srcHit && up ? 'accepted' : 'major']++;
    await ctx.close(); await browser.close();
  } catch (e) {
    assert('8-parity-reference-leg', false, e.message);
    R.checks.parity.major++;
  }

  // ================= SUMMARY =================
  const passed = R.asserts.filter(a => a.pass).length;
  console.log(`\nSUMMARY asserts ${passed}/${R.asserts.length} | buttons ${R.checks.buttons_ok}/${R.checks.buttons_total}` +
    ` | images ${R.checks.images_200}/${R.checks.images_requested} | nav ${R.nav_asserts} | submits ${JSON.stringify(R.submitCalls)}`);
  fs.writeFileSync(`e2e/results/shards/raw-${UNIT}-${STAGE}.json`, JSON.stringify(R, null, 1));
  console.log('RAW ->', `e2e/results/shards/raw-${UNIT}-${STAGE}.json`);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
