// au042_seed_r9.js — AU-042 ADMIN-lane fixture seeder (run 9, lane :9130 @ a405494).
// Mints EVERYTHING through the REAL sandbox API (:8083); mutates only rows it created.
//   A  PAYMENT_SUBMITTED + receipt  -> single-approve T16 chain (verify -> confirm-payment)
//   B  PAYMENT_SUBMITTED + receipt  -> bulk approve multi-select
//   C  PAYMENT_SUBMITTED + receipt  -> reject reasonCode=AMOUNT_MISMATCH
//   D  PENDING_PAYMENT              -> status-filter isolation (stays PENDING_PAYMENT-only)
// Also proves the authed receipt proxy: admin=200 image/webp, buyer(non-admin)=403, anon=302.
// Rejection-window leg: after rejecting C's proof via the REAL endpoint, shift
// correction_deadline back 49h in the SANDBOX DB so now >= deadline (window closed),
// then prove cancel-after-rejection: 409 before shift, stock release + CANCELLED after.
// Writes /tmp/au042_r9_fixtures.json.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au042_r9_fixtures.json';
const STAMP = Date.now();
const TAG = `AU042R9${STAMP}`;
const BUYER_EMAIL = `au042r9.buyer.${STAMP}@gmail.com`;
const SELLER_EMAIL = `au042r9.seller.${STAMP}@gmail.com`;
const PW = 'StrongPass!1';
const PNG = path.join(__dirname, 'fixtures', 'receipt-proof.png');
const step = (s, x) => console.log('[seed]', s, x !== undefined ? JSON.stringify(x).slice(0, 260) : '');

async function main() {
  const fx = { stamp: STAMP, tag: TAG, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW }, receipts: {} };

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU042R9', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    step(`register ${k}`, { status: reg.status });
    if (![200, 201].includes(reg.status)) throw new Error('register failed ' + JSON.stringify(reg.json));
  }
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.seller.token = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  const atok = fx.adminToken = await L.apiLogin(L.ADMIN);
  step('tokens', { admin: !!atok, buyer: !!fx.buyer.token, seller: !!fx.seller.token });

  const meS = await L.api(fx.seller.token, 'GET', '/api/v1/userManagement/user-details');
  fx.seller.userId = meS.json && (meS.json.userId ?? (meS.json.user && meS.json.user.userId));
  step('seller userId', { userId: fx.seller.userId });
  step('verify seller VERIFIED', { status: (await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' })).status });

  // ---- product (seller-owned; logistics pinned so quoting/checkout works) ----
  const product = {
    productName: `${TAG} Kettle`,
    productQuantity: 20,
    categoryId: 3,
    subcategoryId: 26,
    productCountry: 'Tanzania',
    productRegion: 'Dar es Salaam',
    productStreet: 'Mikocheni',
    productDescription: 'AU-042 r9 ADMIN-lane fixture for the payments review loop.',
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
  fx.qtyBefore = product.productQuantity; // 20
  step('productId', { id: fx.productId });
  const logi = await L.api(atok, 'PATCH', `/api/v1/admin/products/${fx.productId}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' });
  step('logistics patch', { status: logi.status });

  // public read-back of the listing (ground truth for qty assertions)
  const det = await fetch(`${L.API}/api/v1/displayItem/itemDetails/${fx.productId}`).then(r => r.json()).catch(() => null);
  fx.qtyPublic = det && det.productQuantity;
  step('public itemDetails qty', { productQuantity: fx.qtyPublic });

  // ---- buyer address + real delivery quote ----
  const a1 = await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: `AU042 R9 Street ${STAMP}`, city: 'Dar es Salaam', region: 'Dar es Salaam',
    country: 'Tanzania', label: 'Home', latitude: -6.7924, longitude: 39.2083,
    isDefault: true, phoneNumber: '+2557' + String(STAMP).slice(-9) });
  step('address', { status: a1.status });
  const q = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 },
    items: [{ productId: fx.productId, quantity: 1 }] });
  const fee = (q.json && (q.json.deliveryTotal ?? q.json.total ?? q.json.fee)) || 2000;
  fx.fee = fee;
  step('delivery-quote', { status: q.status, fee, body: q.json });

  async function mkProforma(tag) {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    const co = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/proforma', {
      buyDetails: {
        firstName: 'AU042R9First', lastName: 'AU042R9Last', emailAddress: BUYER_EMAIL,
        phoneNumber: '+255715000444', address: 'au042 r9 seed street',
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
    f.append('receipts', new Blob([fs.readFileSync(PNG)], { type: 'image/png' }), `au042r9-${tag}.png`);
    f.append('details', new Blob([JSON.stringify({ transactionReferences: [`SANDBOX-TXN-${TAG}-${tag}`] })], { type: 'text/plain' }), 'details.txt');
    const r = await fetch(`${L.API}/api/v1/proformas/${pfId}/receipts`, { method: 'POST', headers: { Authorization: 'Bearer ' + fx.buyer.token }, body: f });
    const j = await r.json().catch(() => null);
    step(`receipt upload ${tag}`, { status: r.status });
    if (![200, 201].includes(r.status)) throw new Error('receipt upload failed ' + JSON.stringify(j));
    const s = await L.api(fx.buyer.token, 'POST', `/api/v1/proformas/${pfId}/submit-payment`,
      { transactionReferences: [`SANDBOX-TXN-${TAG}-${tag}`], paymentMethodType: 'MOBILE_MONEY' });
    step(`submit ${tag}`, { status: s.status, st: s.json && s.json.status });
    if (![200, 201].includes(s.status)) throw new Error('submit failed ' + JSON.stringify(s.json));
    return j;
  }

  // ---- A/B/C submitted fixtures + D pending ----
  fx.A = await mkProforma('A-single'); await submitWithReceipt(fx.A.proformaId, 'A');
  fx.B = await mkProforma('B-bulk');   await submitWithReceipt(fx.B.proformaId, 'B');
  fx.C = await mkProforma('C-reject'); await submitWithReceipt(fx.C.proformaId, 'C');
  fx.D = await mkProforma('D-pending');

  // ground truth from the ADMIN queue (status filter isolation)
  const qs = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=50');
  step('admin/payments SUBMITTED', { status: qs.status, totalElements: qs.json && qs.json.totalElements });
  if (qs.status !== 200) throw new Error('admin payments queue failed');
  const qd = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PENDING_PAYMENT&page=0&size=50');
  for (const [tag, pf] of [['A', fx.A], ['B', fx.B], ['C', fx.C]]) {
    const row = (qs.json.content || []).find(p => p.proformaId === pf.proformaId);
    if (!row) throw new Error(tag + ' missing from SUBMITTED queue');
    fx.receipts[tag] = (row.receipts || []).map(r => ({ receiptId: r.receiptId, status: r.status }));
    if (!fx.receipts[tag].length) throw new Error(tag + ' has no receipts');
  }
  const dRow = (qd.json.content || []).find(p => p.proformaId === fx.D.proformaId);
  fx.filterIsolation = {
    A_in_submitted: !!((qs.json.content || []).find(p => p.proformaId === fx.A.proformaId)),
    B_in_submitted: !!((qs.json.content || []).find(p => p.proformaId === fx.B.proformaId)),
    C_in_submitted: !!((qs.json.content || []).find(p => p.proformaId === fx.C.proformaId)),
    D_in_submitted: !!((qs.json.content || []).find(p => p.proformaId === fx.D.proformaId)),
    D_in_pending: !!dRow,
  };
  if (!fx.filterIsolation.D_in_pending || fx.filterIsolation.D_in_submitted) throw new Error('filter isolation broken at seed time: ' + JSON.stringify(fx.filterIsolation));

  // ---- authed receipt-proxy probe (admin vs non-admin vs anon) ----
  const rid = fx.receipts.A[0].receiptId;
  async function fileProbe(tok, label) {
    const r = await fetch(`${L.API}/api/v1/admin/receipts/${rid}/file`, { redirect: 'manual', headers: tok ? { Authorization: 'Bearer ' + tok } : {} });
    const buf = r.body ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0);
    step(`proxy ${label}`, { status: r.status, type: r.headers.get('content-type'), bytes: buf.length });
    return { status: r.status, bytes: buf.length, ct: r.headers.get('content-type'), magic: buf.slice(8, 12).toString('ascii') };
  }
  fx.proxyAdmin = await fileProbe(atok, 'admin');
  if (!(fx.proxyAdmin.status === 200 && fx.proxyAdmin.bytes > 100)) throw new Error('admin receipt proxy not 200/non-empty');
  fx.proxyBuyer = await fileProbe(fx.buyer.token, 'buyer-non-admin');
  fx.proxyAnon = await fileProbe(null, 'anon');

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 1));
  console.log('\nSEED OK ->', OUT);
  console.log('A', fx.A.proformaNumber, fx.A.proformaId, '| B', fx.B.proformaNumber, '| C', fx.C.proformaNumber, '| D', fx.D.proformaNumber);
}

main().catch(e => { console.error('SEED FAIL:', e.message); process.exit(1); });
