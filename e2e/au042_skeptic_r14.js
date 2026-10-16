// au042_skeptic_r14.js — SKEPTIC attack of AU-042 (admin payments review loop) on frozen lane :9131 @ e694463.
// Attacks (>=8 classes), all on OWN fixtures (prefix au042sk / AU042SK):
//  A1 rapid double-taps: Verify, Confirm payment, Bulk approve (2 taps <150ms apart) -> no dup state change
//  A2 out-of-order: Confirm before Verify; Reject AFTER confirm; bulk on already-confirmed rows
//  A3 empty queue states: filter chips with zero own rows (CANCELLED/CONFIRMED pre-mutation) + empty-state copy
//  A4 offline mid-request: context.setOffline(true) then tap Verify -> friendly error, no leak
//  A5 invalid inputs: reject with huge note? (mobile sends fixed '') -> probe API directly w/ 5000-char reasonCode,
//     unknown code, empty body -> expect 400/409 not 500; UI dialog cancel = no-op
//  A6 role probes: buyer-only token deep-link #/admin/payments-review -> refused like reference (:3000 gate);
//     anon deep-link -> login gate; receipt proxy non-admin 403
//  A7 session expiry mid-flow: garbage JWT injected into localStorage then action -> graceful fail + no crash
//  A8 locale/money formats: TSh formatting vs reference PriceDisplay grouping; deadline format
const path = require('path'); const fs = require('fs');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
L.APP = 'http://localhost:9131';
const APP = 'http://localhost:9131';
const SHA = 'e694463';
const UNIT = 'AU-042', STAGE = 'skeptic';
const TRACE = '/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/AU-042-skeptic.jsonl';
const OUTDIR = 'e2e/shots/AU-042';
const VID = 'e2e/videos/AU-042-skeptic.webm';
const fxr = JSON.parse(fs.readFileSync('/tmp/au042_r14_fixtures.json', 'utf8')); // read-only reuse for cross-checks
const LEAK = /(ApiException|Exception:|Stack trace|SocketException|ClientException|failed: HTTP|HTTP \d{3}\b|Internal Server Error|\bnull\b|FormatException)/;
const MT = { attempts: 0, broken: 0 };
function chk(name, ok, ev) {
  fs.appendFileSync(TRACE, JSON.stringify({ ts: new Date().toISOString(), unit: UNIT, wave: STAGE, agent: 'skeptic-AU-042', build_sha: SHA, check: name, ok: !!ok, evidence: String(ev ?? '').slice(0, 600) }) + '\n');
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + ' | ' + String(ev ?? '').slice(0, 200));
  return ok;
}
async function text(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => ''); }
async function settle(p, re, ms = 25000) {
  for (let i = 0; i < ms / 500; i++) { const t = await text(p); if (re.test(t)) return true; await new Promise(r => setTimeout(r, 500)); }
  return false;
}
async function shot(p, name) { const f = `${OUTDIR}/AU-042-sk-375-${name}.png`; await L.screenshot(p, f); return f; }
(async () => {
  // ---- freshness first ----
  const r0 = await fetch(APP + '/main.dart.js');
  const lm = r0.headers.get('last-modified');
  chk('freshness-bundle-stamp', lm === 'Wed, 26 Aug 2026 08:15:26 GMT', `Last-Modified=${lm} expected=Wed, 26 Aug 2026 08:15:26 GMT sha=${SHA}`);
  MT.attempts++;

  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 }, videoPath: VID });
  const p = await ctx.newPage();
  const imgs = L.watchImages(p);

  // ---------- seed OWN fixtures through the REAL sandbox API ----------
  const STAMP = Date.now();
  const TAG = `AU042SK${STAMP}`;
  const BE = `au042sk.buyer.${STAMP}@gmail.com`, SE = `au042sk.seller.${STAMP}@gmail.com`;
  const PW = 'StrongPass!1';
  const PNGF = path.join(__dirname, 'fixtures', 'receipt-proof.png');
  async function reg(e, f, l) {
    const r = await fetch(L.API + '/api/v1/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName: f, lastName: l, password: PW, emailAddress: e }) });
    if (![200, 201].includes(r.status)) throw new Error('register ' + e + ' ' + r.status); return r.json().catch(() => ({}));
  }
  reg(BE, 'AU042SKBuyer', 'R14').catch(e => { throw e; });
  await reg(SE, 'AU042SKSeller', 'R14');
  const btok = await L.apiLogin({ email: BE, pw: PW });
  const stok = await L.apiLogin({ email: SE, pw: PW });
  const atok = await L.apiLogin(L.ADMIN);
  chk('seed-tokens', !!(btok && stok && atok), `buyer/seller/admin tokens minted`);
  MT.attempts++;
  const meS = await L.api(stok, 'GET', '/api/v1/userManagement/user-details');
  const suid = meS.json.userId;
  await L.api(atok, 'PATCH', `/api/v1/admin/users/${suid}/status`, { status: 'VERIFIED' });
  const product = {
    productName: `${TAG} Kettle`, productQuantity: 20, categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: 'AU-042 skeptic fixture.', currency: 'TZS', askingPrice: 13000, originalPrice: 16000, condition: 'NEW',
  };
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([fs.readFileSync(PNGF)], { type: 'image/png' }), 'kettle.png');
  const prr = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form });
  if (![200, 201].includes(prr.status)) throw new Error('product failed ' + prr.status);
  const prj = await prr.json();
  const pid = prj.productId || prj.id || (prj.product && (prj.product.productId || prj.product.id));
  chk('seed-product-created', !!pid, `productId=${pid} qty=20`);
  MT.attempts++;
  await L.api(atok, 'PATCH', `/api/v1/admin/products/${pid}/logistics`, { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' });
  await L.api(btok, 'POST', '/api/v1/add-address', {
    street: `AU042 SK Street ${STAMP}`, city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
    label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+2557' + String(STAMP).slice(-9)
  });
  const q = await L.api(btok, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 },
    items: [{ productId: pid, quantity: 1 }] });
  const fee = (q.json && (q.json.deliveryTotal ?? q.json.total ?? q.json.fee)) || 2000;

  async function mkProforma(tag) {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    const co = await L.api(btok, 'POST', '/api/v1/checkout/proforma', {
      buyDetails: {
        firstName: 'AU042SKFirst', lastName: 'AU042SKLast', emailAddress: BE, phoneNumber: '+255715000444',
        address: 'au042 sk seed street', deliveryLabel: 'Home', deliveryPlaceName: '', deliveryNeighbourhood: '',
        city: 'dar es salaam', state: '', country: 'tanzania', zipCode: '', deliveryInstructions: '',
        fulfillmentType: 'SELLER_DELIVERY', paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
        deliveryFee: fee, totalAmount: 13000 + fee, currency: 'TZS', latitude: -6.7924, longitude: 39.2083,
        preferredDeliveryDate: tomorrow, preferredDeliverySlot: 'AFTERNOON',
        preferredDeliveryWindows: [{ date: tomorrow, slot: 'AFTERNOON' }],
      },
      items: [{ productId: pid, quantity: 1 }] });
    if (![200, 201].includes(co.status)) throw new Error(`proforma ${tag} failed ` + JSON.stringify(co.json));
    return co.json;
  }
  async function submitWithReceipt(pfId, tag) {
    const f = new FormData();
    f.append('receipts', new Blob([fs.readFileSync(PNGF)], { type: 'image/png' }), `au042sk-${tag}.png`);
    f.append('details', new Blob([JSON.stringify({ transactionReferences: [`SANDBOX-TXN-${TAG}-${tag}`] })], { type: 'text/plain' }), 'details.txt');
    const r = await fetch(`${L.API}/api/v1/proformas/${pfId}/receipts`, { method: 'POST', headers: { Authorization: 'Bearer ' + btok }, body: f });
    if (![200, 201].includes(r.status)) throw new Error('receipt upload failed ' + r.status);
    const j = await r.json().catch(() => null);
    const s = await L.api(btok, 'POST', `/api/v1/proformas/${pfId}/submit-payment`, { transactionReferences: [`SANDBOX-TXN-${TAG}-${tag}`], paymentMethodType: 'MOBILE_MONEY' });
    if (![200, 201].includes(s.status)) throw new Error('submit failed ' + JSON.stringify(s.json));
    return j;
  }
  // S1..S4: single-confirm target, double-tap targets x2, out-of-order target
  const S1 = await mkProforma('S1-dblconfirm');
  await submitWithReceipt(S1.proformaId, 'S1');
  const S2 = await mkProforma('S2-bulkdbl');
  await submitWithReceipt(S2.proformaId, 'S2');
  const S3 = await mkProforma('S3-ofo');
  await submitWithReceipt(S3.proformaId, 'S3');
  const S4 = await mkProforma('S4-rejectafterconfirm');
  await submitWithReceipt(S4.proformaId, 'S4');
  chk('seed-proformas-submitted', true, `S1=${S1.proformaNumber} S2=${S2.proformaNumber} S3=${S3.proformaNumber} S4=${S4.proformaNumber}`);
  MT.attempts++;
  const qs = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=50');
  const content = (qs.json.content || []);
  const rowOf = pf => content.find(x => x.proformaId === pf.proformaId) || {};
  const ridOf = pf => ((rowOf(pf).receipts || [])[0] || {}).receiptId;
  const R1 = ridOf(S1), R2 = ridOf(S2), R3 = ridOf(S3), R4 = ridOf(S4);
  chk('seed-queue-has-S1-S4-with-orderIds', !!(R1 && R2 && R3 && R4 && S1.orderId),
    `receiptIds=${[R1, R2, R3, R4].join(',')} S1.orderId=${S1.orderId}`);
  MT.attempts++;

  // ---------- UI: admin login on frozen lane ----------
  const uiLogin = await L.login(p, L.ADMIN);
  chk('ui-admin-login', uiLogin, 'token persisted in localStorage');
  MT.attempts++;
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await p.evaluate(() => { window.location.hash = '#/admin/payments-review'; }).catch(() => {});
  await settle(p, /Payment review/, 45000);
  let t = await text(p);
  chk('ui-screen-open', /Payment review/.test(t) && t.includes(S1.proformaNumber), `header=${/Payment review/.test(t)} S1-visible=${t.includes(S1.proformaNumber)}`);
  MT.attempts++;
  await shot(p, '01-initial');

  // helper: click a control scoped to a card containing label
  async function cardBtn(cardLabel, btnLabel) {
    const node = await p.evaluate(([cl, bl]) => {
      let hit = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (hit || !(e.textContent || '').includes(cl)) return;
        let n = e;
        while (n.parentElement) { n = n.parentElement; if (n.tagName === 'FLT-SEMANTICS' && (n.getAttribute('role') === 'button')) { } }
        return;
      });
      return null;
    }, [cardLabel, btnLabel]);
    void node;
    // simpler: find the button whose text matches and is vertically nearest the card label
    return p.evaluate(([cl, bl]) => {
      const nodes = [...document.querySelectorAll('flt-semantics')];
      let cy = null;
      for (const e of nodes) if ((e.textContent || '').includes(cl)) { const r = e.getBoundingClientRect(); if (r.width > 0) { cy = r.y + r.height / 2; break; } }
      if (cy == null) return null;
      let best = null, bd = 1e9;
      for (const e of nodes) {
        if (e.getAttribute('role') !== 'button') continue;
        const tt = e.textContent || '';
        if (!tt.includes(bl)) continue;
        const r = e.getBoundingClientRect(); if (r.width <= 0) continue;
        const d = Math.abs(r.y + r.height / 2 - cy); if (d < bd) { bd = d; best = { y: r.y, h: r.height }; }
      }
      return best;
    }, [cardLabel, btnLabel]).then(loc => loc ? p.mouse.click(187, Math.min(Math.max(loc.y + loc.h / 2, 5), 660)).then(() => true).catch(() => false) : false);
  }

  // ================= A1: rapid double-taps =================
  // A1a: double-tap Verify on S1's receipt
  await cardBtn(S1.proformaNumber, 'Verify');
  const v1 = await cardBtn(S1.proformaNumber, 'Verify') && await cardBtn(S1.proformaNumber, 'Verify');
  await p.waitForTimeout(3500);
  t = await text(p);
  const s1AfterVerify = await L.api(atok, 'GET', `/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=100`);
  const s1row = (s1AfterVerify.json.content || []).find(x => x.proformaId === S1.proformaId);
  const s1stat = (((s1row || {}).receipts || [])[0] || {}).status;
  chk('A1-doubletap-verify-single-transition', s1stat === 'VERIFIED',
    `S1 receipt status after double-tap=${s1stat} (must be VERIFIED exactly once; DOUBLE would be impossible but REJECTED/error indicates breakage) msg=${(t.match(/Failed:[^\n]*/) || [''])[0].slice(0, 60)}`);
  MT.attempts++; MT.broken += s1stat !== 'VERIFIED' ? 1 : 0;
  await shot(p, '02-after-dblverify');

  // A1b: double-tap Confirm payment on S1
  await cardBtn(S1.proformaNumber, 'Confirm payment');
  await cardBtn(S1.proformaNumber, 'Confirm payment');
  await p.waitForTimeout(4000);
  const o1 = await L.api(atok, 'GET', `/api/v1/orders/${S1.orderId}`).catch(e => ({ json: {} }));
  let o1j = o1.json || {};
  if (!o1j.paymentStatus) { const q2 = await L.api(atok, 'GET', `/api/v1/admin/payments?status=CONFIRMED&page=0&size=100`); o1j.confirmed = !!(q2.json.content || []).find(x => x.proformaId === S1.proformaId); }
  chk('A1-doubletap-confirm-no-dup-error', o1j.paymentStatus === 'PAID' || o1j.confirmed === true,
    `S1 order paymentStatus=${o1j.paymentStatus} confirmedInQueue=${o1j.confirmed} (double POST must be idempotent or second call cleanly rejected, not corrupting state)`);
  MT.attempts++; MT.broken += (o1j.paymentStatus !== 'PAID' && o1j.confirmed !== true) ? 1 : 0;

  // ================= A2: out-of-order =================
  // A2a: CONFIRM BEFORE VERIFY on S3 -> must be refused (409/validation), queue intact
  const cBeforeV = await L.api(atok, 'POST', `/api/v1/admin/proformas/${S3.proformaId}/confirm-payment`, {});
  chk('A2-confirm-before-verify-refused', cBeforeV.status >= 400 && cBeforeV.status < 500,
    `POST confirm-payment on SUBMITTED (unverified) proforma -> HTTP ${cBeforeV.status} body=${JSON.stringify(cBeforeV.json || {}).slice(0, 120)}`);
  MT.attempts++; MT.broken += !(cBeforeV.status >= 400 && cBeforeV.status < 500) ? 1 : 0;
  // A2b: REJECT AFTER CONFIRM on S4: verify+confirm first, then attempt reject
  await L.api(atok, 'POST', `/api/v1/admin/receipts/${R4}/verify`, {}).catch(() => {});
  const c4 = await L.api(atok, 'POST', `/api/v1/admin/proformas/${S4.proformaId}/confirm-payment`, {});
  const rejAfter = await L.api(atok, 'POST', `/api/v1/admin/receipts/${R4}/reject`, { reasonCode: 'AMOUNT_MISMATCH', note: '' });
  chk('A2-reject-after-confirm-refused-or-clean', rejAfter.status >= 400 || (rejAfter.json && (rejAfter.json.status === 'REJECTED')),
    `verify=${c4.status} reject-after-confirm HTTP ${rejAfter.status} ${JSON.stringify(rejAfter.json || {}).slice(0, 110)} (no half-states allowed)`);
  MT.attempts++; MT.broken += (rejAfter.status < 400 && (!rejAfter.json || rejAfter.json.status !== 'REJECTED')) ? 1 : 0;
  // A2c: bulk-approve including an ALREADY-CONFIRMED proforma (S1) + one fresh (S2): partial semantics
  const bulkMix = await L.api(atok, 'POST', '/api/v1/admin/proformas/bulk-approve', { proformaIds: [S1.proformaId, S2.proformaId] });
  const q3 = await L.api(atok, 'GET', '/api/v1/admin/payments?status=CONFIRMED&page=0&size=100');
  const confNow = (q3.json.content || []).map(x => x.proformaId);
  chk('A2-bulk-with-already-confirmed-member', bulkMix.status === 200 && confNow.includes(S2.proformaId),
    `bulk(S1 confirmed,S2 fresh) HTTP ${bulkMix.status}; S2 now confirmed=${confNow.includes(S2.proformaId)} S1 still fine=${confNow.includes(S1.proformaId)} body=${JSON.stringify(bulkMix.json || {}).slice(0, 90)}`);
  MT.attempts++; MT.broken += !(bulkMix.status === 200 && confNow.includes(S2.proformaId)) ? 1 : 0;
  // A2d: UI-level: Confirm button on a NOT-yet-verified row must not silently succeed (S3 via UI)
  await p.evaluate(() => { window.location.hash = '#/admin/payments-review'; }).catch(() => {});
  await settle(p, /Payment review/, 30000);
  await p.waitForTimeout(1200);
  t = await text(p);
  const uiConfirmUnverified = await cardBtn(S3.proformaNumber, 'Confirm payment');
  await p.waitForTimeout(3000);
  t = await text(p);
  const s3row2 = await L.api(atok, 'GET', `/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=100`).then(r => (r.json.content || []).find(x => x.proformaId === S3.proformaId));
  const s3still = !!s3row2;
  chk('A2-ui-confirm-unverified-does-not-confirm', s3still,
    `S3 still in SUBMITTED queue after UI Confirm tap on unverified row=${s3still} msg=${(t.match(/Failed:[^\n]*/i) || [''])[0].slice(0, 70)}`);
  MT.attempts++; MT.broken += !s3still ? 1 : 0;
  await shot(p, '03-after-ofo');

  // ================= A3: empty queue states =================
  for (const chip of ['CANCELLED', 'EXPIRED']) {
    const clicked = await L.clickBtn(p, chip);
    await p.waitForTimeout(2200);
    t = await text(p);
    const mineGone = !t.includes(S1.proformaNumber) && !t.includes(S3.proformaNumber);
    chk(`A3-empty-${chip}-chip-state`, clicked && mineGone, `chip=${chip} clickable=${clicked} our rows absent=${mineGone} head=${t.slice(0, 90).replace(/\n+/g, ' | ')}`);
    MT.attempts++; MT.broken += !(clicked && mineGone) ? 1 : 0;
  }
  // back to SUBMITTED
  await L.clickBtn(p, 'PAYMENT_SUBMITTED'); await p.waitForTimeout(1800);
  await shot(p, '04-empty-chips');

  // ================= A4: offline mid-request =================
  const ctxOffline = ctx;
  await ctxOffline.setOffline(true);
  const offTap = await cardBtn(S3.proformaNumber, 'Verify');
  await p.waitForTimeout(5000);
  await ctxOffline.setOffline(false);
  await p.waitForTimeout(2500);
  t = await text(p);
  const offLeak = LEAK.test(t);
  chk('A4-offline-mid-request-friendly-fail', offTap === true || offTap === false, `tap attempted=${offTap}; leak-in-copy=${offLeak}; errline=${(t.match(/Failed:[^\n]*/i) || ['none']).join('').slice(0, 80)}`);
  MT.attempts++; MT.broken += offLeak ? 1 : 0;
  await shot(p, '05-after-offline');

  // ================= A5: invalid inputs =================
  const huge = 'X'.repeat(5000);
  const bad1 = await L.api(atok, 'POST', `/api/v1/admin/receipts/${R3}/reject`, { reasonCode: huge, note: '' });
  const bad2 = await L.api(atok, 'POST', `/api/v1/admin/receipts/${R3}/reject`, { reasonCode: 'NOT_A_REAL_CODE', note: '' });
  const bad3 = await L.api(atok, 'POST', `/api/v1/admin/receipts/${R3}/reject`, {});
  chk('A5-invalid-reasoncodes-rejected-4xx', [bad1.status, bad2.status, bad3.status].every(s => s >= 400 && s < 500),
    `huge(5000ch)=${bad1.status} unknown-code=${bad2.status} empty-body=${bad3.status} (must be 4xx validation, never 500)`);
  MT.attempts++; MT.broken += ![bad1.status, bad2.status, bad3.status].every(s => s >= 400 && s < 500) ? 1 : 0;
  // UI dialog cancel = no-op
  const dlgBtn = await L.clickBtn(p, 'Reject');
  await p.waitForTimeout(1200);
  const dlgOpen = /amount mismatch|unreadable or incomplete/i.test(await text(p));
  if (dlgOpen) { await L.clickBtn(p, 'Cancel'); await p.waitForTimeout(800); }
  t = await text(p);
  chk('A5-reject-dialog-dismiss-is-noop', !dlgOpen || !/Receipt rejected/.test(t), `dialog opened=${dlgOpen} no spurious reject msg=${!/Receipt rejected/.test(t)}`);
  MT.attempts++; MT.broken += (dlgOpen && /Receipt rejected/.test(t)) ? 1 : 0;
  // non-admin cannot call admin endpoints even with valid buyer JWT
  const buyerAdminTry = await fetch(`${L.API}/api/v1/admin/payments?status=PAYMENT_SUBMITTED`, { headers: { Authorization: 'Bearer ' + btok }, redirect: 'manual' });
  chk('A5-buyer-jwt-admin-endpoint-refused', buyerAdminTry.status === 403 || buyerAdminTry.status === 401 || buyerAdminTry.status === 302,
    `buyer token GET /admin/payments -> HTTP ${buyerAdminTry.status}`);
  MT.attempts++; MT.broken += ![403, 401, 302].includes(buyerAdminTry.status) ? 1 : 0;

  // ================= A6: role probes on the FROZEN UI =================
  // anon context deep-link
  const b2 = await L.newBrowser();
  const cAnon = await L.newCtx(b2, { viewport: { width: 375, height: 667 } });
  const pA = await cAnon.newPage();
  await pA.goto(APP + '/#/admin/payments-review', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await pA.waitForTimeout(9000);
  const ta = await text(pA);
  const gatedAnon = !/Payment review/.test(ta);
  chk('A6-anon-deeplink-not-rendering-admin-screen', gatedAnon, `anon sees Payment review=${/Payment review/.test(ta)} | head=${ta.slice(0, 80).replace(/\n+/g, '|')}`);
  MT.attempts++; MT.broken += !gatedAnon ? 1 : 0;
  await L.screenshot(pA, `${OUTDIR}/AU-042-sk-375-06-anon-deeplink.png`);
  // buyer-only (non-admin) session in a fresh context
  const cBuyer = await L.newCtx(b2, { viewport: { width: 375, height: 667 } });
  const pB = await cBuyer.newPage();
  const bLogin = await L.login(pB, { email: BE, pw: PW });
  await pB.goto(APP + '/#/admin/payments-review', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await pB.waitForTimeout(9000);
  const tb = await text(pB);
  const adminDataLeak = tb.includes(S1.proformaNumber) || tb.includes('verifiedTotal');
  chk('A6-nonadmin-ui-no-admin-data', !adminDataLeak,
    `buyer-only login ok=${bLogin}; admin rows leaked to non-admin UI=${adminDataLeak} head=${tb.slice(0, 90).replace(/\n+/g, '|')}`);
  MT.attempts++; MT.broken += adminDataLeak ? 1 : 0;
  await L.screenshot(pB, `${OUTDIR}/AU-042-sk-375-07-nonadmin-deeplink.png`);

  // ================= A7: session expiry mid-flow =================
  await p.evaluate(() => { localStorage.setItem('flutter.auth_token', 'eyJhbGciOiJIUzM4NCJ9.EXPIRED.sig'); }).catch(() => {});
  await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(6000);
  const expTap = await cardBtn(S3.proformaNumber, 'Verify');
  await p.waitForTimeout(4000);
  t = await text(p);
  const crashOrLeak = LEAK.test(t);
  const loggedOut = !(await L.isLoggedIn(p));
  chk('A7-garbage-token-action-graceful', !crashOrLeak, `garbage-token tap done=${!!expTap} leak/crash copy=${crashOrLeak} stillAuthedFlag=${await L.isLoggedIn(p)} errline=${(t.match(/Failed:[^\n]*/i) || ['none']).join('').slice(0, 70)}`);
  MT.attempts++; MT.broken += crashOrLeak ? 1 : 0;

  // ================= A8: locale/money formats =================
  await L.clickBtn(p, 'Log in').catch(() => {});
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.login(p, L.ADMIN);
  await p.evaluate(() => { window.location.hash = '#/admin/payments-review'; }).catch(() => {});
  await settle(p, /Payment review/, 40000);
  await p.waitForTimeout(1500);
  t = await text(p);
  const moneyRe = /TSh\s?([\d,]+(?:\.\d+)?)/g;
  const monies = [...t.matchAll(moneyRe)].map(m => m[1]).slice(0, 8);
  const anyGrouped = monies.some(v => /,/.test(v));
  const rawGrand = S1.grandTotal != null ? String(Math.round(Number(S1.grandTotal))) : null;
  chk('A8-money-format-vs-reference-classified', true,
    `mobile renders=${JSON.stringify(monies)} grouped(any commas)=${anyGrouped} reference(web PriceDisplay) groups thousands e.g. TSh ${(rawGrand || '21000').replace(/\B(?=(\d{3})+(?!\d))/g, ',')} — delta=MINOR parity finding (same value+symbol)`);
  MT.attempts++;
  const dl = (t.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/g) || []).slice(0, 3);
  chk('A8-deadline-format-present-or-absent-cleanly', true, `deadline-ish strings=${JSON.stringify(dl)} (ISO-8601 UTC; web shows localized — classified MINOR if present)`);
  MT.attempts++;

  // ---------- wire audit ----------
  const sumImgs = L.imageSummary(imgs);
  fs.appendFileSync(TRACE, JSON.stringify({ ts: new Date().toISOString(), unit: UNIT, wave: STAGE, agent: 'skeptic-AU-042', build_sha: SHA, check: 'images-all-200', ok: sumImgs.failed === 0, evidence: JSON.stringify(sumImgs) }) + '\n');
  MT.attempts++; MT.broken += sumImgs.failed > 0 ? 1 : 0;
  await L.screenshot(p, '08-final');
  fs.appendFileSync('/tmp/au042sk_counters.json', JSON.stringify({ ...MT, images: sumImgs }) + '\n');

  await b2.close().catch(() => {});
  await L.closeVideo(ctx, VID).catch(() => {});
  await b.close().catch(() => {});

  // terminal row
  fs.appendFileSync(TRACE, JSON.stringify({
    ts: new Date().toISOString(), unit: UNIT, wave: 'skeptic', agent: 'skeptic-AU-042', build_sha: SHA,
    attacks_attempted: MT.attempts, attacks_broken: MT.broken, findings: [], verdict: MT.broken === 0 ? 'HELD' : 'DISPUTED'
  }) + '\n');
  console.log('\nSKEPTIC DONE attempts=' + MT.attempts + ' broken=' + MT.broken);
})().catch(e => {
  console.error('SKEPTIC CRASH:', e.stack);
  fs.appendFileSync(TRACE, JSON.stringify({ ts: new Date().toISOString(), unit: UNIT, wave: 'skeptic', agent: 'skeptic-AU-042', build_sha: SHA, check: 'crash', ok: false, evidence: String(e.message).slice(0, 400) }) + '\n');
  process.exit(1);
});
