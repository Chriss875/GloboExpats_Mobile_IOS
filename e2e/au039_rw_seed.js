// au039_rw_seed.js — RW-lane fixture minting for AU-039 through the REAL sandbox API (:8083).
// Creates throwaway buyer + seller, a product (image + admin logistics flip), drives the real
// purchase chain all the way to IN_TRANSIT with a buyer-visible 6-digit deliveryCode:
//   register -> product -> admin logistics flip -> address -> proforma -> submit-payment ->
//   admin mark-paid -> seller confirm-availability -> assign transporter -> seller dispatch
// Records server truth BEFORE/AFTER dispatch (T18) incl. deliveryCode + fulfilledAt fields.
// Mutates ONLY what it created. Writes /tmp/au039_fixtures.json.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au039_fixtures.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';
const BUYER_EMAIL = `au039buyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au039seller${STAMP}@gmail.com`;
const png = f => fs.readFileSync(path.join(__dirname, 'fixtures', f));

async function postProduct(tok, product, file) {
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([png(file)], { type: 'image/png' }), file);
  const r = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: form });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const tomorrow = () => new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 10);

async function myOrderIds(tok) {
  const l = await L.api(tok, 'GET', '/api/v1/orders');
  const rows = Array.isArray(l.json) ? l.json : [];
  return new Set(rows.map(o => o.orderId).filter(Boolean));
}

(async () => {
  const fx = { stamp: STAMP, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };
  const log = (...a) => console.log('[seed]', ...a);

  // ---- accounts ----
  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU039', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    log(`register ${k}:`, reg.status, JSON.stringify(reg.json || {}).slice(0, 100));
    if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed');
  }
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.seller.token = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  for (const [k, t] of [['buyer', fx.buyer.token], ['seller', fx.seller.token]]) {
    const me = await L.api(t, 'GET', '/api/v1/userManagement/user-details');
    fx[k].userId = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  }
  log('userIds', fx.buyer.userId, fx.seller.userId);
  log('profileB', (await L.api(fx.buyer.token, 'PUT', '/api/v1/userManagement/update-user-details',
    { firstName: 'AU039First', lastName: 'AU039Buyer', whatsAppPhoneNumber: '+255713000555' })).status);

  const atok = await L.apiLogin(L.ADMIN);
  log('verify seller:', (await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' })).status);

  // ---- product owned by our seller ----
  const product = {
    productName: `AU039 Handoff Probe Kettle ${STAMP}`,
    productQuantity: 4,
    categoryId: 3,
    subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: 'AU-039 RW fixture: delivery-code handoff card (IN_TRANSIT OTP).',
    currency: 'TZS', askingPrice: 15000, originalPrice: 19000, condition: 'NEW',
  };
  const pr = await postProduct(fx.seller.token, product, 'receipt-proof.png');
  log('post-product:', pr.status);
  if (pr.status !== 201) throw new Error('post-product failed ' + JSON.stringify(pr.json).slice(0, 250));
  fx.productId = pr.json.productId || pr.json.id || (pr.json.product && (pr.json.product.productId || pr.json.id));
  log('logistics:', (await L.api(atok, 'PATCH', `/api/v1/admin/products/${fx.productId}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' })).status);
  const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${fx.productId}`);
  log('public itemDetails:', det.status, det.json && det.json.productName);
  if (det.status !== 200) throw new Error('not publicly visible');

  log('addr:', (await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: 'AU039 Street 3', city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
    label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+255713000555' })).status);

  // ---- checkout -> AWAITING_PAYMENT ----
  const before = await myOrderIds(fx.buyer.token);
  const buyDetails = {
    firstName: 'AU039First', lastName: 'AU039Buyer', emailAddress: BUYER_EMAIL,
    phoneNumber: '+255713000555', address: 'AU039 Street 3', city: 'Dar es Salaam',
    state: 'Dar es Salaam', country: 'Tanzania', zipCode: '',
    deliveryMethod: "Seller's delivery", paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
    fulfillmentType: 'SELLER_DELIVERY', currency: 'TZS',
    latitude: -6.7924, longitude: 39.2083,
    preferredDeliveryWindows: [{ date: tomorrow(), slot: 'AFTERNOON' }],
  };
  const pf = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/proforma', { buyDetails, items: [{ productId: fx.productId, quantity: 1 }] });
  log('proforma:', pf.status, JSON.stringify(pf.json || {}).slice(0, 160));
  if (![200, 201].includes(pf.status)) throw new Error('proforma failed');
  const pj = pf.json;
  fx.grandTotal = pj.grandTotal;
  const sp = await L.api(fx.buyer.token, 'POST', `/api/v1/proformas/${pj.proformaId}/submit-payment`,
    { transactionReferences: [`AU039REF${STAMP}`], paymentMethodType: 'MOBILE_MONEY' });
  log('submit-payment:', sp.status, JSON.stringify(sp.json || {}).slice(0, 160));
  if (![200, 201].includes(sp.status)) throw new Error('submit-payment failed');

  let orderId = null, orderNumber = null;
  for (let i = 0; i < 10 && !orderId; i++) {
    const after = await myOrderIds(fx.buyer.token);
    const fresh = [...after].filter(id => !before.has(id));
    if (fresh.length) { orderId = fresh[fresh.length - 1]; break; }
    await new Promise(r => setTimeout(r, 1200));
  }
  if (!orderId) throw new Error('new order not found after submit-payment');
  fx.orderId = String(orderId);
  const d0 = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${fx.orderId}`);
  orderNumber = d0.json && d0.json.orderNumber;
  fx.orderNumber = orderNumber;
  log('order minted:', fx.orderId, orderNumber, d0.json && d0.json.status);

  // ---- advance: mark-paid -> confirm-availability ----
  const mp = await L.api(atok, 'PATCH', `/api/v1/admin/orders/${fx.orderId}/mark-paid`);
  log('mark-paid:', mp.status, JSON.stringify(mp.json || {}).slice(0, 140));
  const ca = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${fx.orderId}/confirm-availability`);
  log('confirm-availability:', ca.status, JSON.stringify(ca.json || {}).slice(0, 140));
  const dA = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${fx.orderId}`);
  fx.afterConfirm = { status: dA.json && dA.json.status, fulfillmentType: dA.json && dA.json.fulfillmentType };

  // ---- transporter: prefer an existing managed one, else create our own ----
  let transporterId = null;
  const tl = await L.api(fx.seller.token, 'GET', '/api/v1/transporters?active=true&managedByCurrentUser=true');
  const trows = (tl.json && (tl.json.content || tl.json.transporters || tl.json)) || [];
  const arr = Array.isArray(trows) ? trows : [];
  log('existing transporters:', arr.length);
  if (arr.length) transporterId = arr[0].transporterId || arr[0].id;
  if (!transporterId) {
    const nt = await L.api(fx.seller.token, 'POST', '/api/v1/transporters',
      { fullName: `AU039 Rider ${STAMP}`, phoneNumber: '+255714000999', whatsAppPhoneNumber: '+255714000999', vehicleType: 'MOTORBIKE', plateNumber: `T39${String(STAMP).slice(-4)}`, active: true });
    log('create transporter:', nt.status, JSON.stringify(nt.json || {}).slice(0, 160));
    if (![200, 201].includes(nt.status)) throw new Error('transporter create failed');
    transporterId = nt.json.transporterId || nt.json.id;
  }
  fx.transporterId = transporterId;

  const asg = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${fx.orderId}/transporter`, { transporterId, note: 'AU039 handoff run' });
  log('assign transporter:', asg.status, JSON.stringify(asg.json || {}).slice(0, 200));
  if (![200, 201].includes(asg.status)) {
    const asg2 = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${fx.orderId}/transporter`,
      { transporterId, proposedDeliveryTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), note: 'AU039 handoff run' });
    log('assign retry w/ time:', asg2.status, JSON.stringify(asg2.json || {}).slice(0, 200));
    if (![200, 201].includes(asg2.status)) throw new Error('transporter assign failed');
  }

  // ---- dispatch -> IN_TRANSIT + buyer deliveryCode (T18) ----
  const preD = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${fx.orderId}`);
  fx.beforeDispatch = {
    status: preD.json.status, deliveryCode: preD.json.deliveryCode ?? null,
    canDispatch: preD.json.canDispatch, dispatchBlockedReason: preD.json.dispatchBlockedReason ?? null,
    at: new Date().toISOString(),
  };
  // Admin dispatch bypasses the DISPATCH_TOO_EARLY delivery-window guard
  // (sandbox-proven in AU-037 r2; the seller endpoint enforces it).
  let dp = await L.api(atok, 'POST', `/api/v1/orders/${fx.orderId}/dispatch`);
  if (![200, 201].includes(dp.status))
    dp = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${fx.orderId}/dispatch`);
  log('dispatch:', dp.status, JSON.stringify(dp.json || {}).slice(0, 300));
  fx.dispatchResp = { status: dp.status, body: dp.json };
  if (![200, 201].includes(dp.status)) throw new Error('dispatch failed');

  const postD = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${fx.orderId}`);
  const j = postD.json || {};
  fx.afterDispatch = {
    status: j.status, deliveryCode: j.deliveryCode ?? null, paymentStatus: j.paymentStatus,
    payoutStatus: j.payoutStatus, fulfilledAt: j.fulfilledAt ?? j.deliveredAt ?? null,
    confirmationDeadline: j.confirmationDeadline ?? null, canDispatch: j.canDispatch,
    transporterName: j.transporterName ?? null, rawKeys: Object.keys(j).sort(),
    at: new Date().toISOString(),
  };
  fx.dispatchWindowMs = (new Date(fx.afterDispatch.at) - new Date(fx.beforeDispatch.at));
  log('afterDispatch:', JSON.stringify({ ...fx.afterDispatch, rawKeys: undefined }));
  if (!fx.afterDispatch.deliveryCode || !/^\d{6}$/.test(String(fx.afterDispatch.deliveryCode)))
    throw new Error('no 6-digit deliveryCode exposed to buyer after dispatch: ' + JSON.stringify(fx.afterDispatch));

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('\nSEED OK ->', OUT, '| order', fx.orderNumber, '| code', fx.afterDispatch.deliveryCode);
})().catch(e => { console.error('SEED FAIL:', e.message); process.exit(1); });
