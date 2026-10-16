// au038_rw_seed.js — RW-lane fixture minting for AU-038 through the REAL sandbox API (:8083).
// Creates throwaway buyer + seller, a product (image + admin logistics flip), then drives
// the real purchase chain to AWAITING_SELLER_CONFIRMATION.
// Mints THREE fixtures:
//   A) stays at AWAITING_SELLER_CONFIRMATION  -> banner/confirm/decline UI vector
//   B) confirm-availability -> PAID/AWAITING_DELIVERY (SELLER_DELIVERY) -> "Mark Picked Up"/"Arrange transport"
//   C) same as B but with a delivery window in the past -> dispatch too-early probe target
// Writes /tmp/au038_fixtures.json. Mutates ONLY what it created.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au038_fixtures.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';
const BUYER_EMAIL = `au038buyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au038seller${stamp()}@gmail.com`;
function stamp() { return STAMP; }

function png(file) { return fs.readFileSync(path.join(__dirname, 'fixtures', file)); }
async function postProduct(tok, product, file) {
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([png(file)], { type: 'image/png' }), file);
  const r = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: form });
  const j = await r.json().catch(() => null);
  return { status: r.status, json: j };
}
const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);

async function checkout(btok, productId, windowDate, slot = 'AFTERNOON') {
  const buyDetails = {
    firstName: 'AU038First', lastName: 'AU038Buyer', emailAddress: BUYER_EMAIL,
    phoneNumber: '+255713000444', address: 'AU038 Street 9', city: 'Dar es Salaam',
    state: 'Dar es Salaam', country: 'Tanzania', zipCode: '',
    deliveryMethod: "Seller's delivery", paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
    fulfillmentType: 'SELLER_DELIVERY', currency: 'TZS',
    latitude: -6.7924, longitude: 39.2083,
    preferredDeliveryWindows: [{ date: windowDate, slot }],
  };
  const pf = await L.api(btok, 'POST', '/api/v1/checkout/proforma', { buyDetails, items: [{ productId, quantity: 1 }] });
  if (![200, 201].includes(pf.status)) throw new Error('proforma failed ' + JSON.stringify(pf.json).slice(0, 200));
  const pj = pf.json || {};
  const sp = await L.api(btok, 'POST', `/api/v1/proformas/${pj.proformaId}/submit-payment`,
    { transactionReferences: [`AU038REF${STAMP}-${productId}`], paymentMethodType: 'MOBILE_MONEY' });
  if (![200, 201].includes(sp.status)) throw new Error('submit-payment failed ' + JSON.stringify(sp.json).slice(0, 200));
  // orders materialize at submit; find OUR order by totalAmount match
  const list = await L.api(btok, 'GET', '/api/v1/orders');
  const rows = Array.isArray(list.json) ? list.json : [];
  const mine = rows.filter(o => o.totalAmount === pj.grandTotal);
  if (!mine.length) throw new Error('order not found after submit-payment');
  const o = mine[mine.length - 1];
  const d = await L.api(btok, 'GET', `/api/v1/orders/${o.orderId}`);
  return { proformaId: pj.proformaId, grandTotal: pj.grandTotal, orderId: o.orderId, orderNumber: o.orderNumber, detail: d.json };
}

(async () => {
  const fx = { stamp: STAMP, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU038', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    console.log(`register ${k}:`, reg.status, JSON.stringify(reg.json || {}).slice(0, 120));
    if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed');
  }
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.seller.token = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });

  for (const [k, t] of [['buyer', fx.buyer.token], ['seller', fx.seller.token]]) {
    const me = await L.api(t, 'GET', '/api/v1/userManagement/user-details');
    fx[k].userId = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  }
  console.log('userIds', fx.buyer.userId, fx.seller.userId);

  console.log('profileB', (await L.api(fx.buyer.token, 'PUT', '/api/v1/userManagement/update-user-details',
    { firstName: 'AU038First', lastName: 'AU038Buyer', whatsAppPhoneNumber: '+255713000444' })).status);

  const atok = await L.apiLogin(L.ADMIN); fx.adminToken = 'set'; fx.admin = L.ADMIN;
  const verS = await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' });
  console.log('verify seller:', verS.status);

  // ---- product owned by our seller
  const product = {
    productName: `AU038 Gate Probe Lamp ${STAMP}`,
    productQuantity: 5,
    categoryId: 3,
    subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: 'AU-038 RW fixture: seller availability gate + dispatch guard.',
    currency: 'TZS', askingPrice: 18000, originalPrice: 22000, condition: 'NEW',
  };
  const pr = await postProduct(fx.seller.token, product, 'receipt-proof.png');
  console.log('post-product:', pr.status);
  if (pr.status !== 201) throw new Error('post-product failed ' + JSON.stringify(pr.json).slice(0, 250));
  fx.productId = pr.json.productId || pr.json.id || (pr.json.product && (pr.json.product.productId || pr.json.id));
  const logi = await L.api(atok, 'PATCH', `/api/v1/admin/products/${fx.productId}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' });
  console.log('logistics:', logi.status);

  const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${fx.productId}`);
  console.log('public itemDetails:', det.status, det.json && det.json.productName);
  if (det.status !== 200) throw new Error('not publicly visible');

  // ---- buyer address
  console.log('addr:', (await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: 'AU038 Street 9', city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
    label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+255713000444' })).status);

  // ---- A: stays AWAITING_SELLER_CONFIRMATION after admin confirm-payment
  fx.A = {};
  {
    const c = await checkout(fx.buyer.token, fx.productId, tomorrow(), 'AFTERNOON');
    fx.A.proformaId = c.proformaId; fx.A.grandTotal = c.grandTotal;
    fx.A.orderId = c.orderId; fx.A.orderNumber = c.orderNumber;
    const cp = await L.api(atok, 'PATCH', `/api/v1/admin/orders/${c.orderId}/mark-paid`);
    console.log('A mark-paid:', cp.status, JSON.stringify(cp.json || {}).slice(0, 160));
    const d2 = await L.api(fx.seller.token, 'GET', `/api/v1/orders/${c.orderId}`);
    fx.A.after = d2.json && { status: d2.json.status, escrowPending: d2.json.escrowPending, payoutStatus: d2.json.payoutStatus, canDispatch: d2.json.canDispatch, dispatchBlockedReason: d2.json.dispatchBlockedReason, dispatchBlockers: d2.json.dispatchBlockers };
    console.log('A state after mark-paid:', JSON.stringify(fx.A.after));
    if (!d2.json || d2.json.status !== 'AWAITING_SELLER_CONFIRMATION') throw new Error('fixture A did not reach ASC');
  }

  // ---- B: confirm availability -> PAID/AWAITING_DELIVERY (pickup/deliver vector)
  fx.B = {};
  {
    const c = await checkout(fx.buyer.token, fx.productId, tomorrow(), 'EVENING');
    fx.B.proformaId = c.proformaId; fx.B.grandTotal = c.grandTotal;
    fx.B.orderId = c.orderId; fx.B.orderNumber = c.orderNumber;
    await L.api(atok, 'PATCH', `/api/v1/admin/orders/${c.orderId}/mark-paid`);
    const cf = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${c.orderId}/confirm-availability`);
    console.log('B confirm-availability:', cf.status, JSON.stringify(cf.json || {}).slice(0, 160));
    const d2 = await L.api(fx.seller.token, 'GET', `/api/v1/orders/${c.orderId}`);
    fx.B.after = d2.json && { status: d2.json.status, canDispatch: d2.json.canDispatch, dispatchBlockedReason: d2.json.dispatchBlockedReason, dispatchBlockers: d2.json.dispatchBlockers, fulfillmentType: d2.json.fulfillmentType, deliveryWindow: d2.json.preferredDeliveryWindows };
    console.log('B state after confirm:', JSON.stringify(fx.B.after));
  }

  // ---- C: window in the past -> dispatch too early probe target
  fx.C = {};
  try {
    const c = await checkout(fx.buyer.token, fx.productId, yesterday(), 'MORNING');
    fx.C.proformaId = c.proformaId; fx.C.grandTotal = c.grandTotal;
    fx.C.orderId = c.orderId; fx.C.orderNumber = c.orderNumber;
    await L.api(atok, 'PATCH', /orders/.test('') ? '' : `/api/v1/admin/orders/${c.orderId}/mark-paid`);
    const cf = await L.api(fx.seller.token, 'POST', `/api v1`.replace(' ', '/') + `/orders/${c.orderId}/confirm-availability`);
    console.log('C confirm-availability:', cf.status);
    const dp = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${c.orderId}/dispatch`);
    fx.C.dispatchProbe = { status: dp.status, body: dp.json };
    console.log('C dispatch probe:', dp.status, JSON.stringify(dp.json || {}).slice(0, 260));
    const d2 = await L.api(fx.seller.token, 'GET', `/api/v1/orders/${c.orderId}`);
    fx.C.after = d2.json && { status: d2.json.status, canDispatch: d2.json.canDispatch, dispatchBlockedReason: d2.json.dispatchBlockedReason, dispatchBlockers: d2.json.dispatchBlockers, windows: d2.json.preferredDeliveryWindows };
    console.log('C state:', JSON.stringify(fx.C.after));
  } catch (e) { fx.C.error = e.message; console.log('C fixture note:', e.message); }

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('FIXTURES OK ->', OUT);
})().catch(e => { console.error('SEED FAIL', e.message); process.exit(1); });
