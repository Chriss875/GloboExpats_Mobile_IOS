// au033sk14_rw_seed.js — RW-lane fixtures for AU-033 My Payments + rejected-proof recovery.
// Created ONLY through the REAL sandbox API (:8083). Mints, for a throwaway buyer:
//   V1 PENDING_PAYMENT proforma (Continue payment + ticking proforma countdown vector)
//   V2 CONFIRMED proforma (Approved tab)
//   V3 EXPIRED proforma (Expired tab)
//   V4 REJECTED row: submit-payment -> admin rejects ALL receipts with
//      reasonCode=AMOUNT_MISMATCH (T24) -> payments/my rejected + correctionDeadline ~ +48h
// Writes /tmp/au033sk14_fixtures.json. Mutates only what this script creates.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au033sk14_rw_fixtures.json';
const STAMP = Date.now();
const BUYER_EMAIL = `au033sk14buyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au033sk14seller${STAMP}@gmail.com`;
const PW = 'StrongPass!1';
const PNG = path.join(__dirname, 'fixtures', 'receipt-proof.png');

function step(s, extra) { console.log('[seed]', s, extra !== undefined ? JSON.stringify(extra).slice(0, 260) : ''); }

async function main() {
  const fx = { stamp: STAMP, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };

  // ---- accounts ------------------------------------------------------------
  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU033', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    step(`register ${k}`, { status: reg.status });
    if (![200, 201].includes(reg.status)) throw new Error('register failed ' + JSON.stringify(reg.json));
  }
  const btok = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  const stok = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  fx.buyer.token = btok; fx.seller.token = stok;
  const meB = await L.api(btok, 'GET', '/api/v1/userManagement/user-details');
  fx.buyer.userId = meB.json && (meB.json.userId ?? (meB.json.user && meB.json.user.userId));
  const meS = await L.api(stok, 'GET', '/api/v1/userManagement/user-details');
  fx.seller.userId = meS.json && (meS.json.userId ?? (meS.json.user && meS.json.user.userId));
  step('userIds', { buyer: fx.buyer.userId, seller: fx.seller.userId });

  const atok = await L.apiLogin(L.ADMIN);
  fx.adminToken = atok;

  // seller profile name/phone (checkout prefill) + VERIFIED status
  {
    const pf = new FormData();
    pf.append('profileInformationDTO', new Blob([JSON.stringify({ firstName: 'AU033First', lastName: 'AU033Last', whatsAppPhoneNumber: '+2557' + String(STAMP).slice(-9) })], { type: 'application/json' }), 'profile.json');
    const pr = await fetch(L.API + '/api/v1/userManagement/editProfile', { method: 'PATCH', headers: { Authorization: 'Bearer ' + btok }, body: pf });
    step('buyer profile patch', { status: pr.status });
  }
  const ver = await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' });
  step('verify seller', { status: ver.status });

  // ---- product -------------------------------------------------------------
  const product = {
    productName: `AU033 Payment Probe Lamp ${STAMP}`,
    productQuantity: 12,
    categoryId: 3,
    subcategoryId: 26,
    productCountry: 'Tanzania',
    productRegion: 'Dar es Salaam',
    productStreet: 'Mikocheni',
    productDescription: 'AU-033 RW fixture line for the My Payments panel verification.',
    currency: 'TZS',
    askingPrice: 12000,
    originalPrice: 15000,
    condition: 'NEW',
  };
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([fs.readFileSync(PNG)], { type: 'image/png' }), 'lamp.png');
  const prr = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form });
  const prj = await prr.json().catch(() => null);
  step('post-product', { status: prr.status });
  if (prr.status !== 201) throw new Error('product failed ' + JSON.stringify(prj));
  fx.productId = prj.productId || prj.id || (prj.product && (prj.product.productId || prj.product.id));
  step('productId', fx.productId);

  const logi = await L.api(atok, 'PATCH', `/api/v1/admin/products/${fx.productId}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' });
  step('logistics patch', { status: logi.status });
  if (![200, 204].includes(logi.status)) throw new Error('logistics failed');

  // buyer saved default address
  const a1 = await L.api(btok, 'POST', '/api/v1/add-address', {
    street: 'AU033 Home Street 3', city: 'Dar es Salaam', region: 'Dar es Salaam',
    country: 'Tanzania', label: 'Home', latitude: -6.7924, longitude: 39.2083,
    isDefault: true, phoneNumber: '+2557' + String(STAMP).slice(-9) });
  step('address', { status: a1.status });

  // delivery quote (ground truth fee)
  const q = await L.api(btok, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 },
    items: [{ productId: fx.productId, quantity: 1 }] });
  const fee = (q.json && q.json.deliveryTotal) || 2000;
  fx.quote = q.json;
  step('delivery-quote', { status: q.status, total: fee });

  async function mkProforma(tag) {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    const co = await L.api(btok, 'POST', '/api/v1/checkout/proforma', {
      buyDetails: {
        firstName: 'AU033First', lastName: 'AU033Last', emailAddress: BUYER_EMAIL,
        phoneNumber: '+255715000333', address: 'au033sk14 seed street',
        deliveryLabel: 'Home', deliveryPlaceName: '', deliveryNeighbourhood: '',
        city: 'dar es salaam', state: '', country: 'tanzania', zipCode: '',
        deliveryInstructions: '', fulfillmentType: 'SELLER_DELIVERY',
        paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
        deliveryFee: fee, totalAmount: 12000 + fee, currency: 'TZS',
        latitude: -6.7924, longitude: 39.2083,
        preferredDeliveryDate: tomorrow, preferredDeliverySlot: 'EVENING',
        preferredDeliveryWindows: [{ date: tomorrow, slot: 'EVENING' }],
      },
      items: [{ productId: fx.productId, quantity: 1 }],
    });
    step(`proforma ${tag}`, { status: co.status, number: co.json && co.json.proformaNumber });
    if (![200, 201].includes(co.status)) throw new Error('proforma ' + tag + ' failed ' + JSON.stringify(co.json));
    return co.json;
  }

  async function uploadReceipt(pfId, name) {
    const f = new FormData();
    f.append('receipts', new Blob([fs.readFileSync(PNG)], { type: 'image/png' }), name);
    f.append('details', new Blob([JSON.stringify({ transactionReferences: [`SANDBOX-TXN-AU033-${pfId.slice(0, 8)}`] })], { type: 'text/plain' }), 'details.txt');
    const r = await fetch(`${L.API}/api/v1/proformas/${pfId}/receipts`, { method: 'POST', headers: { Authorization: 'Bearer ' + btok }, body: f });
    const j = await r.json().catch(() => null);
    step('upload receipt', { status: r.status, first: j && j[0] && j[0].status });
    if (![200, 201].includes(r.status)) throw new Error('receipt upload failed ' + JSON.stringify(j));
    return j;
  }

  // ---- V1: PENDING_PAYMENT (untouched) -------------------------------------
  const v1 = await mkProforma('V1-pending');

  // ---- V2: CONFIRMED --------------------------------------------------------
  const v2 = await mkProforma('V2-confirmed');
  await uploadReceipt(v2.proformaId, 'au033sk14-v2.png');
  const s2 = await L.api(btok, 'POST', `/api/v1/proformas/${v2.proformaId}/submit-payment`, { transactionReferences: ['SANDBOX-TXN-AU033-V2'], paymentMethodType: 'MOBILE_MONEY' });
  step('submit V2', { status: s2.status, st: s2.json && s2.json.status });
  const c2 = await L.api(atok, 'POST', `/api/v1/admin/proformas/${v2.proformaId}/confirm-payment`);
  step('admin confirm V2', { status: c2.status, st: c2.json && c2.json.status });

  // ---- V3: EXPIRED (cancel == terminal, groups to Expired with CANCELLED) ---
  const v3 = await mkProforma('V3-cancelled');
  const cx = await L.api(btok, 'POST', `/api/v1/proformas/${v3.proformaId}/cancel`);
  step('cancel V3', { status: cx.status, st: cx.json && cx.json.status });

  // ---- V4: REJECTED (T24) ---------------------------------------------------
  const v4 = await mkProforma('V4-rejected');
  await uploadReceipt(v4.proformaId, 'au033sk14-v4.png');
  const s4 = await L.api(btok, 'POST', `/api/v1/proformas/${v4.proformaId}/submit-payment`, { transactionReferences: ['SANDBOX-TXN-AU033-V4'], paymentMethodType: 'MOBILE_MONEY' });
  step('submit V4', { status: s4.status, st: s4.json && s4.json.status });
  const my4a = await L.api(btok, 'GET', '/api/v1/payments/my');
  const row4a = my4a.json.find(p => p.proformaId === v4.proformaId);
  const rcIds = (row4a.receipts || []).map(r => r.receiptId);
  step('V4 receipts before reject', rcIds);
  if (!rcIds.length) throw new Error('no receipts on V4 to reject');
  for (const id of rcIds) {
    const rej = await L.api(atok, 'POST', `/api/v1/admin/receipts/${id}/reject`, { reasonCode: 'AMOUNT_MISMATCH', note: `AU033 T24 probe ${STAMP}` });
    step(`reject ${id.slice(0, 8)}`, { status: rej.status, code: rej.json && rej.json.rejectionReasonCode });
  }

  // ground truth read-back of all four rows
  const mine = await L.api(btok, 'GET', '/api/v1/payments/my');
  const rows = {};
  for (const id of [v1.proformaId, v2.proformaId, v3.proformaId, v4.proformaId]) {
    rows[id] = mine.json.find(p => p.proformaId === id);
  }
  fx.rows = rows;
  fx.v1 = v1; fx.v2 = v2; fx.v3 = v3; fx.v4 = v4;
  fx.fee = fee;
  fx.groundTruth = {
    pending: rows[v1.proformaId] && rows[v1.proformaId].status,
    confirmed: rows[v2.proformaId] && rows[v2.proformaId].status,
    cancelled: rows[v3.proformaId] && rows[v3.proformaId].status,
    submittedRejectedRow: rows[v4.proformaId] && rows[v4.proformaId].status,
    v4rejectedReceipts: (rows[v4.proformaId].receipts || []).filter(r => r.status === 'REJECTED').length,
    v4reasonCode: ((rows[v4.proformaId].receipts || []).find(r => r.status === 'REJECTED') || {}).rejectionReasonCode,
    v4note: ((rows[v4.proformaId].receipts || []).find(r => r.status === 'REJECTED') || {}).rejectionReason,
  };
  step('GROUND TRUTH', fx.groundTruth);

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('\nFIXTURES OK ->', OUT);
}

main().catch(e => { console.error('SEED FAIL', e); process.exit(1); });
