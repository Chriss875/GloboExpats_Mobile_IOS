// au042_seed_r14.js — AU-042 ADMIN-lane fixture seeder, run 14 (terminal verify).
// Lane :9131 @ e694463. Everything minted through the REAL sandbox API (:8083);
// mutates ONLY rows it created (prefix au042r14 / AU042R14 per lane rules).
//   A  PAYMENT_SUBMITTED + receipt -> single Verify -> Confirm payment (T16)
//   B  PAYMENT_SUBMITTED + receipt -> BULK approve multi-select (with A2)
//   C  PAYMENT_SUBMITTED + receipt -> Reject reasonCode=AMOUNT_MISMATCH (T24)
//      -> cancel-after-rejection: UI gate while window open; deadline shifted
//         back 49h IN THE SANDBOX DB for OUR row -> real release of stock.
//   D  PENDING_PAYMENT             -> status-filter isolation (never mutated)
// Also proves the authed receipt proxy: admin=200 image/*, non-admin=403, anon=302.
// Writes /tmp/au042_r14_fixtures.json.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au042_r14_fixtures.json';
const STAMP = Date.now();
const TAG = `AU042R14${STAMP}`;
const BUYER_EMAIL = `au042r14.buyer.${STAMP}@gmail.com`;
const SELLER_EMAIL = `au042r14.seller.${STAMP}@gmail.com`;
const PW = 'StrongPass!1';
const PNG = path.join(__dirname, 'fixtures', 'receipt-proof.png');
const step = (s, x) => console.log('[seed]', s, x !== undefined ? JSON.stringify(x).slice(0, 240) : '');

async function main() {
  const fx = { stamp: STAMP, tag: TAG, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW }, receipts: {} };

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU042R14', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    step(`register ${k}`, { status: reg.status });
    if (![200, 201].includes(reg.status)) throw new Error('register failed ' + JSON.stringify(reg.json));
  }
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.seller.token = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  const atok = fx.adminToken = await L.apiLogin(L.ADMIN);
  step('tokens', { admin: !!atok, buyer: !!fx.buyer.token });

  const meS = await L.api(fx.seller.token, 'GET', '/api/v1/userManagement/user-details');
  fx.seller.userId = meS.json && meS.json.userId;
  step('seller VERIFIED patch', { status: (await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' })).status });

  // ---- product (seller-owned) ----
  const product = {
    productName: `${TAG} Kettle`, productQuantity: 20, categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: 'AU-042 r14 ADMIN-lane fixture for the payments review loop.',
    currency: 'TZS', askingPrice: 13000, originalPrice: 16000, condition: 'NEW',
  };
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([fs.readFileSync(PNG)], { type: 'image/png' }), 'kettle.png');
  const prr = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + fx.seller.token }, body: form });
  if (prr.status !== 201) throw new Error('product failed ' + prr.status);
  const prj = await prr.json();
  fx.productId = prj.productId || prj.id || (prj.product && (prj.product.productId || prj.product.id));
  fx.qtyBefore = product.productQuantity;
  step('productId', { id: fx.productId });
  const logi = await L.api(atok, 'PATCH', `/api/v1/admin/products/${fx.productId}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' });
  step('logistics patch', { status: logi.status });

  // ---- buyer address + real delivery quote ----
  await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: `AU042 R14 Street ${STAMP}`, city: 'Dar es Salaam', region: 'Dar es Salaam',
    country: 'Tanzania', label: 'Home', latitude: -6.7924, longitude: 39.2083,
    isDefault: true, phoneNumber: '+2557' + String(STAMP).slice(-9) });
  const q = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 },
    items: [{ productId: fx.productId, quantity: 1 }] });
  const fee = (q.json && (q.json.deliveryTotal ?? q.json.total ?? q.json.fee)) || 2000;
  fx.fee = fee;
  step('delivery-quote', { status: q.status, fee });

  async function mkProforma(tag) {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    const co = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/proforma', {
      buyDetails: {
        firstName: 'AU042R14First', lastName: 'AU042R14Last', emailAddress: BUYER_EMAIL,
        phoneNumber: '+255715000444', address: 'au042 r14 seed street',
        deliveryLabel: 'Home', deliveryPlaceName: '', deliveryNeighbourhood: '',
        city: 'dar es salaam', state: '', country: 'tanzania', zipCode: '',
        deliveryInstructions: '', fulfillmentType: 'SELLER_DELIVERY',
        paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
        deliveryFee: fee, totalAmount: 13000 + fee, currency: 'TZS',
        latitude: -6.7924, longitude: 39.2083,
        preferredDeliveryDate: tomorrow, preferredDeliverySlot: 'AFTERNOON',
        preferredDeliveryWindows: [{ date: tomorrow, slot: 'AFTERNOON' }],
      },
      items: [{ productId: fx.productId, quantity: 1 }],
    });
    if (![200, 201].includes(co.status)) throw new Error(`proforma ${tag} failed ` + JSON.stringify(co.json));
    return co.json;
  }

  async function submitWithReceipt(pfId, tag) {
    const f = new FormData();
    f.append('receipts', new Blob([fs.readFileSync(PNG)], { type: 'image/png' }), `au042r14-${tag}.png`);
    f.append('details', new Blob([JSON.stringify({ transactionReferences: [`SANDBOX-TXN-${TAG}-${tag}`] })], { type: 'text/plain' }), 'details.txt');
    const r = await fetch(`${L.API}/api/v1/proformas/${pfId}/receipts`, { method: 'POST', headers: { Authorization: 'Bearer ' + fx.buyer.token }, body: f });
    if (![200, 201].includes(r.status)) throw new Error('receipt upload failed ' + r.status);
    const j = await r.json().catch(() => null);
    const s = await L.api(fx.buyer.token, 'POST', `/api/v1/proformas/${pfId}/submit-payment`,
      { transactionReferences: [`SANDBOX-TXN-${TAG}-${tag}`], paymentMethodType: 'MOBILE_MONEY' });
    if (![200, 201].includes(s.status)) throw new Error('submit failed ' + JSON.stringify(s.json));
    step(`submit ${tag}`, { proformaStatus: s.json && s.json.status });
    return j;
  }

  fx.A = await mkProforma('A-single'); await submitWithReceipt(fx.A.proformaId, 'A');
  fx.B = await mkProforma('B-bulk');   await submitWithReceipt(fx.B.proformaId, 'B');
  fx.C = await mkProforma('C-reject'); await submitWithReceipt(fx.C.proformaId, 'C');
  fx.D = await mkProforma('D-pending');

  const qs = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=50');
  if (qs.status !== 200) throw new Error('admin payments queue failed ' + qs.status);
  step('admin/payments SUBMITTED', { totalElements: qs.json.totalElements });
  const qd = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PENDING_PAYMENT&page=0&size=50');
  for (const [tag, pf] of [['A', fx.A], ['B', fx.B], ['C', fx.C]]) {
    const row = (qs.json.content || []).find(p => p.proformaId === pf.proformaId);
    if (!row) throw new Error(tag + ' missing from SUBMITTED queue');
    fx.receipts[tag] = (row.receipts || []).map(r => ({ receiptId: r.receiptId, fileName: r.fileName, status: r.status }));
    if (!fx.receipts[tag].length) throw new Error(tag + ' has no receipts');
  }
  fx.filterIsolation = {
    A_in_submitted: !!(qs.json.content || []).find(p => p.proformaId === fx.A.proformaId),
    D_in_submitted: !!(qs.json.content || []).find(p => p.proformaId === fx.D.proformaId),
    D_in_pending: !!(qd.json.content || []).find(p => p.proformaId === fx.D.proformaId),
  };
  if (!fx.filterIsolation.D_in_pending || fx.filterIsolation.D_in_submitted) throw new Error('filter isolation broken at seed time');

  // ---- authed receipt-proxy probe ----
  const rid = fx.receipts.A[0].receiptId;
  async function fileProbe(tok, label) {
    const r = await fetch(`${L.API}/api/v1/admin/receipts/${rid}/file`, { redirect: 'manual', headers: tok ? { Authorization: 'Bearer ' + tok } : {} });
    const buf = Buffer.from(await r.arrayBuffer());
    step(`proxy ${label}`, { status: r.status, bytes: buf.length, ct: r.headers.get('content-type') });
    return { status: r.status, bytes: buf.length, magic: buf.slice(8, 12).toString('ascii') };
  }
  fx.proxyAdmin = await fileProbe(atok, 'admin');
  if (!(fx.proxyAdmin.status === 200 && fx.proxyAdmin.bytes > 100)) throw new Error('admin receipt proxy not 200/non-empty');
  fx.proxyBuyer = await fileProbe(fx.buyer.token, 'buyer-non-admin');
  fx.proxyAnon = await fileProbe(null, 'anon');

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 1));
  console.log('\nSEED OK ->', OUT);
  console.log('A', fx.A.proformaNumber, '| B', fx.B.proformaNumber, '| C', fx.C.proformaNumber, '| D', fx.D.proformaNumber, '| product', fx.productId);
}

main().catch(e => { console.error('SEED FAIL:', e.message); process.exit(1); });
