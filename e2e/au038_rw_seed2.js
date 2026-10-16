// au038_rw_seed2.js — RW fixture minting for AU-038 (correct chain: admin confirm-payment
// on the PROFORMA is what mints AWAITING_SELLER_CONFIRMATION, not mark-paid).
// A: stays ASC (banner/confirm/decline vector)
// B: ASC -> confirm-availability -> AWAITING_DELIVERY (pickup/deliver + dispatch guard vector)
// C: same as B but window in the past -> DISPATCH_TOO_EARLY probe target
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au038_fixtures.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';
const BUYER_EMAIL = `au038buyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au038seller${STAMP}@gmail.com`;
const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);

function png(file) { return fs.readFileSync(path.join(__dirname, 'fixtures', file)); }
async function postProduct(tok, product, file) {
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([png(file)], { type: 'image/png' }), file);
  const r = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: form });
  const j = await r.json().catch(() => null);
  return { status: r.status, json: j };
}

async function checkout(btok, productId, refTag, windowDate, slot) {
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
  if (![200, 201].includes(pf.status)) throw new Error('proforma failed ' + JSON.stringify(pf.json).slice(0, 250));
  const pj = pf.json || {};
  const sp = await L.api(btok, 'POST', `/api/v1/proformas/${pj.proformaId}/submit-payment`,
    { transactionReferences: [`AU038-${refTag}-${STAMP}`], paymentMethodType: 'MOBILE_MONEY' });
  if (![200, 201].includes(sp.status)) throw new Error('submit-payment failed ' + JSON.stringify(sp.json).slice(0, 250));
  const list = await L.api(btok, 'GET', '/api/v1/orders');
  const rows = Array.isArray(list.json) ? list.json : [];
  const mine = rows.filter(o => o.totalAmount === pj.grandTotal && !rows.slice(0, rows.indexOf(o)).some(x => x.orderId === o.orderId));
  if (!mine.length) throw new Error('order not found after submit-payment');
  const o = mine[mine.length - 1];
  return { proformaId: pj.proformaId, grandTotal: pj.grandTotal, orderId: o.orderId, orderNumber: o.orderNumber };
}

async function toASC(atok, btok, stok, c) {
  const cp = await L.api(atok, 'POST', `/api/v1/admin/proformas/${c.proformaId}/confirm-payment`);
  if (![200, 201].includes(cp.status)) throw new Error('confirm-payment failed ' + JSON.stringify(cp.json).slice(0, 220));
  const d = await L.api(stok, 'GET', `/api/v1/orders/${c.orderId}`);
  const j = d.json || {};
  return { apiStatus: d.status, status: j.status, escrowPending: j.escrowPending, payoutStatus: j.payoutStatus,
    canDispatch: j.canDispatch, dispatchBlockedReason: j.dispatchBlockedReason, dispatchBlockers: j.dispatchBlockers,
    totalAmount: j.totalAmount, fulfillmentType: j.fulfillmentType };
}

(async () => {
  const fx = { stamp: STAMP, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU038', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    console.log(`register ${k}:`, reg.status);
    if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed');
  }
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.seller.token = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });

  for (const [k, t] of [['buyer', fx.buyer.token], ['seller', fx.seller.token]]) {
    const me = await L.api(t, 'GET', '/api/v1/userManagement/user-details');
    fx[k].userId = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  }
  console.log('userIds', fx.buyer.userId, fx.seller.userId);

  const atok = await L.apiLogin(L.ADMIN);
  console.log('verify seller:', (await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' })).status);

  const product = {
    productName: `AU038 Gate Probe Lamp B ${STAMP}`,
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
  console.log('logistics:', (await L.api(atok, 'PATCH', `/api/v1/admin/products/${fx.productId}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' })).status);
  const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${fx.productId}`);
  console.log('public itemDetails:', det.status, det.json && det.json.productName);

  console.log('addr:', (await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: 'AU038 Street 9', city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
    label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+255713000444' })).status);

  // ---- A: ASC (UI banner / confirm / decline vector) — LEFT UNTOUCHED for the browser run
  {
    const c = await checkout(fx.buyer.token, fx.productId, 'A', tomorrow(), 'AFTERNOON');
    fx.A = { ...c };
    fx.A.after = await toASC(atok, fx.buyer.token, fx.seller.token, c);
    console.log('A @ASC:', JSON.stringify(fx.A.after));
  }
  // ---- B: ASC -> confirm-availability -> AWAITING_DELIVERY
  {
    const c = await checkout(fx.buyer.token, fx.productId, 'B', tomorrow(), 'EVENING');
    fx.B = { ...c };
    fx.B.after = await toASC(atok, fx.buyer.token, fx.seller.token, c);
    const cf = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${c.orderId}/confirm-availability`);
    console.log('B confirm-availability:', cf.status, JSON.stringify(cf.json || {}).slice(0, 140));
    const d = await L.api(fx.seller.token, 'GET', `/api/v1/orders/${c.orderId}`);
    const j = d.json || {};
    fx.B.confirmed = { apiStatus: d.status, status: j.status, payoutStatus: j.payoutStatus,
      canDispatch: j.canDispatch, dispatchBlockedReason: j.dispatchBlockedReason, dispatchBlockers: j.dispatchBlockers,
      windows: j.preferredDeliveryWindows || j.deliveryWindows };
    console.log('B after confirm:', JSON.stringify(fx.B.confirmed));
  }
  // ---- C: past window -> dispatch-too-early probe
  {
    try {
      const c = await checkout(fx.buyer.token, fx.productId, 'C', yesterday(), 'MORNING');
      fx.C = { ...c };
      fx.C.after = await toASC(atok, fx.buyer.token, fx.seller.token, c);
      const cf = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${c.orderId}/confirm-availability`);
      console.log('C confirm-availability:', cf.status);
      const dp = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${c.orderId}/dispatch`);
      fx.C.dispatchProbe = { status: dp.status, body: dp.json };
      console.log('C dispatch probe:', dp.status, JSON.stringify(dp.json || {}).slice(0, 300));
      const d = await L.api(fx.seller.token, 'GET', `/api/v1/orders/${c.orderId}`);
      const j = d.json || {};
      fx.C.confirmed = { apiStatus: d.status, status: j.status, canDispatch: j.canDispatch,
        dispatchBlockedReason: j.dispatchBlockedReason, dispatchBlockers: j.dispatchBlockers,
        windows: j.preferredDeliveryWindows || j.deliveryWindows };
      console.log('C state:', JSON.stringify(fx.C.confirmed));
    } catch (e) { fx.C = { error: e.message }; console.log('C note:', e.message); }
  }

  fx.adminUsed = true;
  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('FIXTURES OK ->', OUT);
})().catch(e => { console.error('SEED FAIL', e.message); process.exit(1); });
