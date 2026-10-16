// au057_seed_r14.js — RW fixture minting for AU-057 verify-r14 (REAL API only, prefix au057r14).
// Chain (proven in au038_seed_r13): register -> post-product -> admin logistics -> add-address
//   -> checkout/proforma -> submit-payment -> admin confirm-payment -> seller confirm-availability
//   -> POST /orders/{id}/transporter (assign, real registry transporter) -> POST dispatch
//   => IN_TRANSIT + buyer-visible deliveryCode.
// Also: fresh inline-create transporter via POST /transporters (owned by the fixture seller),
//   manager-link + /transporters/{id}/link to grant the BUYER account TRANSPORTER so the trips
//   list can be driven as a real role-gated user. Only our own fixtures are mutated.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au057_fixtures_r14.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';
const BUYER_EMAIL = `au057r14b${STAMP}@gmail.com`;
const SELLER_EMAIL = `au057r14s${STAMP}@gmail.com`;
const dayPlus = n => new Date(Date.now() + n * 24 * 3600 * 1000).toISOString().slice(0, 10);
const log = (...a) => console.log('[seed-r14]', ...a);

function png(file) { return fs.readFileSync(path.join(__dirname, 'fixtures', file)); }
async function postProduct(tok, product, file) {
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([png(file)], { type: 'image/png' }), file);
  const r = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: form });
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function snap(tok, orderId) {
  const d = await L.api(tok, 'GET', `/api/v1/orders/${orderId}`);
  const j = d.json || {};
  return { apiStatus: d.status, status: j.status, normalizedStatus: j.normalizedStatus, orderType: j.orderType,
    deliveryCode: j.deliveryCode, buyerCanConfirmDelivery: j.buyerCanConfirmDelivery,
    canDispatch: j.canDispatch, dispatchBlockedReason: j.dispatchBlockedReason,
    totalAmount: j.totalAmount, orderNumber: j.orderNumber,
    trip: j.trip ? { tripId: j.trip.tripId, deliveryTimeStatus: j.trip.deliveryTimeStatus,
      proposedDeliveryTime: j.trip.proposedDeliveryTime, transporterName: j.trip.transporter && j.trip.transporter.fullName } : null };
}

(async () => {
  const fx = { stamp: STAMP, build_sha: 'e694463', buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };

  // ---- accounts (fresh, ours alone)
  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU057R14', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    log(`register ${k}:`, reg.status);
    if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed ' + JSON.stringify(reg.json).slice(0, 200));
  }
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.seller.token = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  const atok = await L.apiLogin(L.ADMIN); // sandbox shared account holds ADMIN
  for (const [k, t] of [['buyer', fx.buyer.token], ['seller', fx.seller.token]]) {
    const me = await L.api(t, 'GET', '/api/v1/userManagement/user-details');
    fx[k].userId = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  }
  log('userIds', fx.buyer.userId, fx.seller.userId, 'admin-token-ok', !!atok);
  log('seller verified:', (await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' })).status);

  // ---- product + logistics pin (SELLER_DELIVERY needs BODA-capable mode)
  const product = {
    productName: `au057r14 Transport Chain Lamp ${STAMP}`,
    productQuantity: 6, categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: 'AU-057 r14 RW fixture: assign-transporter modal, dispatch, OTP handover, buyer code card.',
    currency: 'TZS', askingPrice: 17500, originalPrice: 21000, condition: 'NEW',
  };
  const pr = await postProduct(fx.seller.token, product, 'receipt-proof.png');
  log('post-product:', pr.status);
  if (pr.status !== 201) throw new Error('post-product failed ' + JSON.stringify(pr.json).slice(0, 250));
  fx.productId = pr.json.productId || pr.json.id || (pr.json.product && (pr.json.product.productId || pr.json.id));
  log('logistics:', (await L.api(atok, 'PATCH', `/api/v1/admin/products/${fx.productId}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' })).status);
  log('addr:', (await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: 'AU057R14 Street 2', city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
    label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+255713001444' })).status);

  // ---- checkout chain -> AWAITING_SELLER_CONFIRMATION
  const buyDetails = {
    firstName: 'AU057R14First', lastName: 'AU057R14Buyer', emailAddress: BUYER_EMAIL,
    phoneNumber: '+255713001444', address: 'AU057R14 Street 2', city: 'Dar es Salaam',
    state: 'Dar es Salaam', country: 'Tanzania', zipCode: '',
    deliveryMethod: "Seller's delivery", paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
    fulfillmentType: 'SELLER_DELIVERY', currency: 'TZS',
    latitude: -6.7924, longitude: 39.2083,
    preferredDeliveryWindows: [{ date: dayPlus(1), slot: 'MORNING' }],
  };
  const pf = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/proforma', { buyDetails, items: [{ productId: fx.productId, quantity: 1 }] });
  if (![200, 201].includes(pf.status)) throw new Error('proforma failed ' + JSON.stringify(pf.json).slice(0, 250));
  fx.proformaId = pf.json.proformaId; fx.grandTotal = pf.json.grandTotal;
  log('proforma:', fx.proformaId, 'total', fx.grandTotal);
  const sp = await L.api(fx.buyer.token, 'POST', `/api/v1/proformas/${fx.proformaId}/submit-payment`,
    { transactionReferences: [`AU057R14-${STAMP}`], paymentMethodType: 'MOBILE_MONEY' });
  log('submit-payment:', sp.status);
  if (![200, 201].includes(sp.status)) throw new Error('submit-payment failed ' + JSON.stringify(sp.json).slice(0, 220));
  const cp = await L.api(atok, 'POST', `/api/v1/admin/proformas/${fx.proformaId}/confirm-payment`);
  log('confirm-payment:', cp.status);
  if (![200, 201].includes(cp.status)) throw new Error('confirm-payment failed ' + JSON.stringify(cp.json).slice(0, 220));

  // newest seller order matching our total
  const sOrders = await L.api(fx.seller.token, 'GET', '/api/v1/orders?orderType=selling');
  let rows = Array.isArray(sOrders.json) ? sOrders.json : (sOrders.json && sOrders.json.content) || [];
  let target = rows.find(o => o.totalAmount === fx.grandTotal);
  if (!target) { // fallback: match by product name in items
    target = rows.find(o => JSON.stringify(o.items || []).includes(String(STAMP)));
  }
  if (!target) throw new Error('fixture order not found among ' + rows.length);
  fx.orderId = String(target.orderId); fx.orderNumber = target.orderNumber;
  log('order:', fx.orderNumber, fx.orderId);
  fx.beforeConfirm = await snap(fx.seller.token, fx.orderId);
  log('status pre-confirm:', fx.beforeConfirm.status);

  // ---- seller confirms availability -> AWAITING_DELIVERY ("Confirmed - assign a driver")
  const cf = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${fx.orderId}/confirm-availability`);
  log('confirm-availability:', cf.status, cf.status >= 400 ? JSON.stringify(cf.json).slice(0, 160) : '');
  fx.afterConfirm = await snap(fx.seller.token, fx.orderId);
  log('status post-confirm:', fx.afterConfirm.status);

  // ---- inline-create a REAL transporter owned by this seller (POST /transporters)
  const nt = await L.api(fx.seller.token, 'POST', '/api/v1/transporters', {
    fullName: `au057r14 Rider ${STAMP}`, phoneNumber: '+255713009991',
    vehicleType: 'MOTORBIKE', plateNumber: `T${String(STAMP).slice(-6)} BODA`, active: true });
  log('create-transporter:', nt.status);
  if (![200, 201].includes(nt.status)) throw new Error('create transporter failed ' + JSON.stringify(nt.json).slice(0, 220));
  fx.createdTransporter = nt.json; fx.transporterId = nt.json.transporterId;

  // ---- link the BUYER account as a manager AND grant TRANSPORTER (real role gate path)
  const mg = await L.api(atok, 'POST', `/api/v1/admin/transporters/${fx.transporterId}/managers`,
    { userId: fx.buyer.userId, role: 'DRIVER' });
  log('add-manager(buyer):', mg.status, mg.status >= 400 ? JSON.stringify(mg.json).slice(0, 140) : '');
  const lk = await L.api(atok, 'POST', `/api/v1/admin/transporters/${fx.transporterId}/link`, { userId: fx.buyer.userId });
  log('link-account(grant TRANSPORTER):', lk.status);
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW }); // re-login to pick up role

  // ---- TRIPS LIST before any trip exists (role-gated empty state, server-scoped)
  const t0 = await L.api(fx.buyer.token, 'GET', '/api/v1/transporter/trips');
  log('trips(pre-assign):', t0.status, JSON.stringify(t0.json).slice(0, 120));
  fx.tripsBeforeAssign = { status: t0.status, body: t0.json };

  // ---- ASSIGN the created transporter (registry row the app will show) -> READY_FOR_DISPATCH
  const asg = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${fx.orderId}/transporter`,
    { transporterId: fx.transporterId });
  log('assign:', asg.status, asg.status >= 400 ? JSON.stringify(asg.json).slice(0, 200) : '');
  if (![200, 201].includes(asg.status)) throw new Error('assign failed ' + JSON.stringify(asg.json).slice(0, 220));
  fx.assignment = asg.json;
  fx.afterAssign = await snap(fx.seller.token, fx.orderId);
  log('status post-assign:', fx.afterAssign.status, 'trip', JSON.stringify(fx.afterAssign.trip));

  // ---- propose a NEW delivery time then CONFIRM it (PATCH endpoints, both sides proven)
  const iso = new Date(Date.now() + 26 * 3600 * 1000).toISOString().slice(0, 19);
  const pp = await L.api(fx.seller.token, 'PATCH', `/api/v1/orders/${fx.orderId}/delivery-time/propose`,
    { proposedDeliveryTime: iso, note: 'au057r14 proposed window' });
  log('propose-delivery-time:', pp.status, pp.status >= 400 ? JSON.stringify(pp.json).slice(0, 180) : JSON.stringify(pp.json).slice(0, 120));
  fx.proposal = { status: pp.status, body: pp.json };
  const pc = await L.api(fx.buyer.token, 'PATCH', `/api/v1/orders/${fx.orderId}/delivery-time/confirm`);
  log('confirm-delivery-time(buyer):', pc.status);
  fx.confirmation = { status: pc.status, body: pc.json };

  // ---- DISPATCH by the seller (who owns/manages the transporter) -> IN_TRANSIT + buyer code
  const dp = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${fx.orderId}/dispatch`);
  log('dispatch:', dp.status, dp.status >= 400 ? JSON.stringify(dp.json).slice(0, 200) : JSON.stringify(dp.json).slice(0, 120));
  if (![200, 201].includes(dp.status)) throw new Error('dispatch failed ' + JSON.stringify(dp.json).slice(0, 220));
  fx.afterDispatch = await snap(fx.seller.token, fx.orderId);
  fx.buyerAfterDispatch = await snap(fx.buyer.token, fx.orderId);
  log('IN_TRANSIT?', fx.afterDispatch.status, '| buyer deliveryCode present:', !!fx.buyerAfterDispatch.deliveryCode);

  // ---- TRIPS LIST now shows the live trip for the linked account (server-scoped proof)
  const t1 = await L.api(fx.buyer.token, 'GET', '/api/v1/transporter/trips');
  const tb = Array.isArray(t1.json) ? t1.json : [];
  log('trips(post-dispatch):', t1.status, 'rows', tb.length, tb[0] ? JSON.stringify(tb[0]).slice(0, 260) : '');
  fx.tripsAfterDispatch = { status: t1.status, count: tb.length,
    first: tb[0] ? { tripId: tb[0].tripId, orderStatus: tb[0].orderStatus, buyerName: tb[0].buyerName,
      buyerPhone: tb[0].buyerPhone, pickup: tb[0].pickup, dropoff: tb[0].dropoff,
      deliveryCodeRequired: tb[0].deliveryCodeRequired, proposedDeliveryTime: tb[0].proposedDeliveryTime } : null };

  // ---- NON-transporter refused on trips (reference gate parity)
  const t2 = await L.api(fx.seller.token, 'GET', '/api/v1/transporter/trips');
  fx.tripsAsSeller = { status: t2.status, body: t2.json };

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 1));
  console.log('\nFIXTURES ->', OUT);
  console.log(JSON.stringify({ orderId: fx.orderId, orderNumber: fx.orderNumber, transporterId: fx.transporterId,
    buyerHasTransporterRole: true, inTransit: fx.afterDispatch.status === 'IN_TRANSIT',
    buyerCodePresent: !!fx.buyerAfterDispatch.deliveryCode, tripsRows: fx.tripsAfterDispatch.count }, null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
