// au042_rw_seed.js — ADMIN-lane fixtures for AU-042 (admin payments review loop).
// Created ONLY through the REAL sandbox API (:8083); mutates only what it creates.
// Mints, for a throwaway buyer + VERIFIED seller product:
//   A  PAYMENT_SUBMITTED proforma w/ receipt  -> single approve path (verify receipt -> confirm-payment) [T16]
//   B  PAYMENT_SUBMITTED proforma w/ receipt  -> bulk-approve multi-select vector
//   C  PAYMENT_SUBMITTED proforma w/ receipt  -> reject w/ reasonCode=AMOUNT_MISMATCH vector
//   D  PAYMENT_SUBMITTED proforma             -> cancel-after-rejection window probe (409 CORRECTION_WINDOW_OPEN)
//   E  PENDING_PAYMENT proforma               -> status-filter isolation check
// Also proves the authed receipt proxy: GET /admin/receipts/{id}/file with admin token = 200 PNG bytes;
// without token = 401/302; with BUYER token = forbidden (admin-only proxy).
// Writes /tmp/au042_fixtures.json.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au042_fixtures.json';
const STAMP = Date.now();
const BUYER_EMAIL = `au042buyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au042seller${STAMP}@gmail.com`;
const PW = 'StrongPass!1';
const PNG = path.join(__dirname, 'fixtures', 'receipt-proof.png');
const step = (s, x) => console.log('[seed]', s, x !== undefined ? JSON.stringify(x).slice(0, 300) : '');

async function main() {
  const fx = { stamp: STAMP, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW }, receipts: {} };

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU042', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    step(`register ${k}`, { status: reg.status });
    if (![200, 201].includes(reg.status)) throw new Error('register failed ' + JSON.stringify(reg.json));
  }
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.seller.token = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  const atok = fx.adminToken = await L.apiLogin(L.ADMIN);

  const meB = await L.api(fx.buyer.token, 'GET', '/api/v1/userManagement/user-details');
  const meS = await L.api(fx.seller.token, 'GET', '/api/v1/userManagement/user-details');
  fx.seller.userId = meS.json && (meS.json.userId ?? (meS.json.user && meS.json.user.userId));
  step('userIds', { buyer: meB.json && meB.json.userId, seller: fx.seller.userId });

  // seller profile prefill + VERIFIED
  {
    const pf = new FormData();
    pf.append('profileInformationDTO', new Blob([JSON.stringify({ firstName: 'AU042First', lastName: 'AU042Last', whatsAppPhoneNumber: '+2557' + String(STAMP).slice(-9) })], { type: 'application/json' }), 'profile.json');
    const pr = await fetch(L.API + '/api/v1/userManagement/editProfile', { method: 'PATCH', headers: { Authorization: 'Bearer ' + fx.buyer.token }, body: pf });
    step('buyer profile patch', { status: pr.status });
  }
  step('verify seller', { status: (await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' })).status });

  // ---- product (seller-owned, logistics pinned so quoting works) ----------
  const product = {
    productName: `AU042 Review Probe Kettle ${STAMP}`,
    productQuantity: 20,
    categoryId: 3,
    subcategoryId: 26,
    productCountry: 'Tanzania',
    productRegion: 'Dar es Salaam',
    productStreet: 'Mikocheni',
    productDescription: 'AU-042 ADMIN-lane fixture line for the payments review loop.',
    currency: 'TZS',
    askingPrice: 13000,
    originalPrice: 16000,
    condition: 'NEW',
  };
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([fs.readFileSync(PNG)], { type: 'image/png' }), 'kettle.png');
  const prr = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + fx.seller.token }, body: form });
  const prj = await prr.json().catch(() => null);
  step('post-product', { status: prr.status });
  if (prr.status !== 201) throw new Error('product failed ' + JSON.stringify(prj));
  fx.productId = prj.productId || prj.id || (prj.product && (prj.product.productId || prj.product.id));
  const logi = await L.api(atok, 'PATCH', `/api/v1/admin/products/${fx.productId}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' });
  step('logistics patch', { status: logi.status });

  // buyer default address + quote
  const a1 = await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: 'AU042 Home Street 4', city: 'Dar es Salaam', region: 'Dar es Salaam',
    country: 'Tanzania', label: 'Home', latitude: -6.7924, longitude: 39.2083,
    isDefault: true, phoneNumber: '+2557' + String(STAMP).slice(-9) });
  step('address', { status: a1.status });
  const q = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 },
    items: [{ productId: fx.productId, quantity: 1 }] });
  const fee = (q.json && q.json.deliveryTotal) || 2000;
  fx.fee = fee; fx.quoteTotal = q.json && q.json.deliveryTotal;
  step('delivery-quote', { status: q.status, fee });

  async function mkProforma(tag) {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    const co = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/proforma', {
      buyDetails: {
        firstName: 'AU042First', lastName: 'AU042Last', emailAddress: BUYER_EMAIL,
        phoneNumber: '+255715000444', address: 'au042 seed street',
        deliveryLabel: 'Home', deliveryPlaceName: '', deliveryNeighbourhood: '',
        city: 'dar es salaam', state: '', country: 'tanzania', zipCode: '',
        deliveryInstructions: '', fulfillmentType: 'SELLER_DELIVERY',
        paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
        deliveryFee: fee, totalAmount: 13000 + fee, currency: 'TZS',
        latitude: -6.7924, longitude: 39.2083,
        preferredDeliveryDate: tomorrow, preferredDeliverySlot: 'EVENING',
        preferredDeliveryWindows: [{ date: tomorrow, slot: 'EVENING' }],
      },
      items: [{ productId: fx.productId, quantity: 1 }],
    });
    step(`proforma ${tag}`, { status: co.status, number: co.json && co.json.proformaNumber, total: co.json && co.json.grandTotal });
    if (![200, 201].includes(co.status)) throw new Error('proforma ' + tag + ' failed ' + JSON.stringify(co.json));
    return co.json;
  }

  async function submitWithReceipt(pfId, tag) {
    const f = new FormData();
    f.append('receipts', new Blob([fs.readFileSync(PNG)], { type: 'image/png' }), `au042-${tag}.png`);
    f.append('details', new Blob([JSON.stringify({ transactionReferences: [`SANDBOX-TXN-AU042-${tag}-${STAMP}`] })], { type: 'text/plain' }), 'details.txt');
    const r = await fetch(`${L.API}/api/v1/proformas/${pfId}/receipts`, { method: 'POST', headers: { Authorization: 'Bearer ' + fx.buyer.token }, body: f });
    const j = await r.json().catch(() => null);
    step(`receipt upload ${tag}`, { status: r.status });
    if (![200, 201].includes(r.status)) throw new Error('receipt upload failed ' + JSON.stringify(j));
    const s = await L.api(fx.buyer.token, 'POST', `/api/v1/proformas/${pfId}/submit-payment`,
      { transactionReferences: [`SANDBOX-TXN-AU042-${tag}-${STAMP}`], paymentMethodType: 'MOBILE_MONEY' });
    step(`submit ${tag}`, { status: s.status, st: s.json && s.json.status });
    if (![200, 201].includes(s.status)) throw new Error('submit failed ' + JSON.stringify(s.json));
    return j;
  }

  // ---- A/B/C/D submitted fixtures + E pending ------------------------------
  fx.A = await mkProforma('A-single'); await submitWithReceipt(fx.A.proformaId, 'A');
  fx.B = await mkProforma('B-bulk');   await submitWithReceipt(fx.B.proformaId, 'B');
  fx.C = await mkProforma('C-reject'); await submitWithReceipt(fx.C.proformaId, 'C');
  fx.D = await mkProforma('D-window'); await submitWithReceipt(fx.D.proformaId, 'D');
  fx.E = await mkProforma('E-pending');

  // read back receipts from the ADMIN queue (ground truth)
  const queue = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=50');
  step('admin/payments PAYMENT_SUBMITTED', { status: queue.status, totalElements: queue.json && queue.json.totalElements });
  if (queue.status !== 200) throw new Error('admin payments queue failed');
  const rows = {};
  for (const id of [fx.A.proformaId, fx.B.proformaId, fx.C.proformaId, fx.D.proformaId, fx.E.proformaId]) {
    rows[id] = queue.json.content.find(p => p.proformaId === id);
  }
  for (const [tag, id] of [['A', fx.A.proformaId], ['B', fx.B.proformaId], ['C', fx.C.proformaId]]) {
    const row = rows[id];
    if (!row) throw new Error(tag + ' missing from queue');
    fx.receipts[tag] = (row.receipts || []).map(r => ({ receiptId: r.receiptId, status: r.status }));
    if (!fx.receipts[tag].length) throw new Error(tag + ' has no receipts');
  }
  fx.queueRowSample = rows[fx.A.proformaId];

  // ---- authed-proxy proof (admin vs buyer vs anon) -------------------------
  const rid = fx.receipts.A[0].receiptId;
  async function fileProbe(tok, label) {
    // redirect:'manual' so the unauthenticated 302->Google-OAuth is observed, not followed
    // (following it leaves the box and throws "fetch failed" — r5 lesson).
    const r = await fetch(`${L.API}/api/v1/admin/receipts/${rid}/file`,
      { redirect: 'manual', headers: tok ? { Authorization: 'Bearer ' + tok } : {} });
    const buf = r.body ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0);
    step(`file probe ${label}`, { status: r.status, type: r.headers.get('content-type'), bytes: buf.length });
    return { status: r.status, bytes: buf.length, ct: r.headers.get('content-type') };
  }
  fx.proxyAdmin = await fileProbe(atok, 'admin');
  fx.proxyBuyer = await fileProbe(fx.buyer.token, 'buyer(non-admin)');
  fx.proxyAnon = await fileProbe(null, 'anon');

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 1));
  console.log('\nFIXTURES OK ->', OUT);
  console.log('A', fx.A.proformaId, '| B', fx.B.proformaId, '| C', fx.C.proformaId, '| D', fx.D.proformaId, '| E', fx.E.proformaId);
}

main().catch(e => { console.error('SEED FAIL:', e.message); process.exit(1); });
