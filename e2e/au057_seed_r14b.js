// au057_seed_r14b.js — RW fixtures for AU-057 r14, take 2 (REAL API only).
// Lesson from r14a: PATCH delivery-time/confirm moves an assigned order to
//   AWAITING_DELIVERY, where POST /dispatch 409s ("not ready ... status:
//   AWAITING_DELIVERY") — dispatch requires READY_FOR_DISPATCH straight after
//   assign. So the two legs need SEPARATE orders:
//   orderA: assign -> propose -> buyer confirm      (delivery-time UI contract)
//   orderB: assign -> dispatch -> IN_TRANSIT + code (OTP handover contract)
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au057_fixtures_r14.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';
const BUYER_EMAIL = `au057r14c${STAMP}@gmail.com`;
const SELLER_EMAIL = `au057r14d${STAMP}@gmail.com`;
const dayPlus = n => new Date(Date.now() + n * 24 * 3600 * 1000).toISOString().slice(0, 10);
const log = (...a) => console.log('[seed-r14b]', ...a);

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
    totalAmount: j.totalAmount, orderNumber: j.orderNumber,
    trip: j.trip ? { tripId: j.trip.tripId, deliveryTimeStatus: j.trip.deliveryTimeStatus,
      proposedDeliveryTime: j.trip.proposedDeliveryTime,
      transporterName: j.trip.transporter && j.trip.transporter.fullName } : null };
}

(async () => {
  const fx = { stamp: STAMP, build_sha: 'e694463', buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU057R14B', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed ' + JSON.stringify(reg.json).slice(0, 200));
  }
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.seller.token = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  const atok = await L.apiLogin(L.ADMIN);
  for (const [k, t] of [['buyer', fx.buyer.token], ['seller', fx.seller.token]]) {
    const me = await L.api(t, 'GET', '/api/v1/userManagement/user-details');
    fx[k].userId = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  }
  await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' });

  // ---- ONE product, TWO units bought in two orders
  const product = {
    productName: `au057r14b Transport Chain Lamp ${STAMP}`,
    productQuantity: 6, categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: 'AU-057 r14b RW fixture: delivery-time propose/confirm + dispatch/OTP handover.',
    currency: 'TZS', askingPrice: 17500, originalPrice: 21000, condition: 'NEW',
  };
  const pr = await postProduct(fx.seller.token, product, 'receipt-proof.png');
  if (pr.status !== 201) throw new Error('post-product failed ' + JSON.stringify(pr.json).slice(0, 250));
  fx.productId = pr.json.productId || pr.json.id || (pr.json.product && (pr.json.product.productId || pr.json.id));
  await L.api(atok, 'PATCH', `/api/v1/admin/products/${fx.productId}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' });
  await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: 'AU057R14B Street 4', city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
    label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+255713001555' });

  async function checkout(tag) {
    const buyDetails = {
      firstName: 'AU057R14BFirst', lastName: 'AU057R14BBuyer', emailAddress: BUYER_EMAIL,
      phoneNumber: '+255713001555', address: 'AU057R14B Street 4', city: 'Dar es Salaam',
      state: 'Dar es Salaam', country: 'Tanzania', zipCode: '',
      deliveryMethod: "Seller's delivery", paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
      fulfillmentType: 'SELLER_DELIVERY', currency: 'TZS',
      latitude: -6.7924, longitude: 39.2083,
      // TODAY's window: dispatch opens at slotStart EAT - 1h, already past for
      // MORNING (09:00 EAT) and AFTERNOON (11:00 EAT) — lets POST /dispatch succeed now.
      preferredDeliveryWindows: [{ date: new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10),
        slot: tag === 'A' ? 'MORNING' : 'AFTERNOON' }],
    };
    const pf = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/proforma', { buyDetails, items: [{ productId: fx.productId, quantity: 1 }] });
    if (![200, 201].includes(pf.status)) throw new Error(`proforma ${tag} failed`);
    const pj = pf.json || {};
    const sp = await L.api(fx.buyer.token, 'POST', `/api/v1/proformas/${pj.proformaId}/submit-payment`,
      { transactionReferences: [`AU057R14B-${tag}-${STAMP}`], paymentMethodType: 'MOBILE_MONEY' });
    if (![200, 201].includes(sp.status)) throw new Error(`submit-payment ${tag} failed ${JSON.stringify(sp.json).slice(0, 160)}`);
    const cp = await L.api(atok, 'POST', `/api/v1/admin/proformas/${pj.proformaId}/confirm-payment`);
    if (![200, 201].includes(cp.status)) throw new Error(`confirm-payment ${tag} failed`);
    const sOrders = await L.api(fx.seller.token, 'GET', '/api/v1/orders?orderType=selling');
    const rows = Array.isArray(sOrders.json) ? sOrders.json : (sOrders.json && sOrders.json.content) || [];
    const o = rows.find(x => x.totalAmount === pj.grandTotal);
    if (!o) throw new Error(`order ${tag} not found among ${rows.length}`);
    const cf = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${o.orderId}/confirm-availability`);
    const s0 = await snap(fx.seller.token, o.orderId);
    log(`order${tag}:`, o.orderNumber, s0.status, `(confirm-availability ${cf.status})`);
    return { orderId: String(o.orderId), orderNumber: o.orderNumber, proformaId: pj.proformaId, grandTotal: pj.grandTotal };
  }

  fx.orderA = await checkout('A'); // delivery-time propose/confirm leg
  fx.orderB = await checkout('B'); // dispatch + OTP handover leg

  // ---- inline-create a REAL transporter owned by this seller
  const nt = await L.api(fx.seller.token, 'POST', '/api/v1/transporters', {
    fullName: `au057r14b Rider ${STAMP}`, phoneNumber: '+255713009992',
    vehicleType: 'MOTORBIKE', plateNumber: `T${String(STAMP).slice(-6)} BD`, active: true });
  if (![200, 201].includes(nt.status)) throw new Error('create transporter failed ' + JSON.stringify(nt.json).slice(0, 220));
  fx.createdTransporter = nt.json; fx.transporterId = nt.json.transporterId;
  log('transporter:', fx.transporterId, fx.createdTransporter.fullName);

  // ---- grant the BUYER the real TRANSPORTER role via admin link (trips gate)
  const lk = await L.api(atok, 'POST', `/api/v1/admin/transporters/${fx.transporterId}/link`, { userId: fx.buyer.userId });
  log('link-account(grant TRANSPORTER):', lk.status);
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });

  const t0 = await L.api(fx.buyer.token, 'GET', '/api/v1/transporter/trips');
  fx.tripsBeforeAssign = { status: t0.status, body: t0.json };
  log('trips(pre-assign):', t0.status, JSON.stringify(t0.json).slice(0, 90));

  // ---- ORDER A: assign -> propose -> buyer confirm (both PATCH endpoints)
  const asgA = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${fx.orderA.orderId}/transporter`, { transporterId: fx.transporterId });
  log('assignA:', asgA.status);
  if (![200, 201].includes(asgA.status)) throw new Error('assign A failed ' + JSON.stringify(asgA.json).slice(0, 200));
  fx.afterAssignA = await snap(fx.seller.token, fx.orderA.orderId);
  const iso = new Date(Date.now() + 26 * 3600 * 1000).toISOString().slice(0, 19);
  const pp = await L.api(fx.seller.token, 'PATCH', `/api/v1/orders/${fx.orderA.orderId}/delivery-time/propose`,
    { proposedDeliveryTime: iso, note: 'au057r14b proposed window' });
  log('propose-delivery-time:', pp.status);
  fx.proposal = pp;
  fx.afterPropose = await snap(fx.buyer.token, fx.orderA.orderId);
  const pc = await L.api(fx.buyer.token, 'PATCH', `/api/v1/orders/${fx.orderA.orderId}/delivery-time/confirm`);
  log('confirm-delivery-time(buyer):', pc.status);
  fx.confirmation = pc;
  fx.afterConfirmA = await snap(fx.buyer.token, fx.orderA.orderId);

  // ---- ORDER B: assign -> dispatch -> IN_TRANSIT + buyer-visible code
  const asgB = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${fx.orderB.orderId}/transporter`, { transporterId: fx.transporterId });
  log('assignB:', asgB.status);
  if (![200, 201].includes(asgB.status)) throw new Error('assign B failed ' + JSON.stringify(asgB.json).slice(0, 200));
  const dp = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${fx.orderB.orderId}/dispatch`);
  log('dispatch:', dp.status, dp.status >= 400 ? JSON.stringify(dp.json).slice(0, 180) : '');
  if (![200, 201].includes(dp.status)) throw new Error('dispatch failed ' + JSON.stringify(dp.json).slice(0, 220));
  fx.afterDispatch = await snap(fx.seller.token, fx.orderB.orderId);
  fx.buyerAfterDispatch = await snap(fx.buyer.token, fx.orderB.orderId);

  // ---- trips list now carries the live trip (server-scoped)
  const t1 = await L.api(fx.buyer.token, 'GET', '/api/v1/transporter/trips');
  const tb = Array.isArray(t1.json) ? t1.json : [];
  fx.tripsAfterDispatch = { status: t1.status, count: tb.length };
  if (tb[0]) fx.tripsAfterDispatch.first = { tripId: tb[0].tripId, orderId: tb[0].orderId, orderStatus: tb[0].orderStatus,
    buyerName: tb[0].buyerName, buyerPhone: tb[0].buyerPhone, pickup: tb[0].pickup, dropoff: tb[0].dropoff,
    deliveryCodeRequired: tb[0].deliveryCodeRequired, proposedDeliveryTime: tb[0].proposedDeliveryTime };
  log('trips(post-dispatch):', t1.status, 'rows', tb.length);

  const t2 = await L.api(fx.seller.token, 'GET', '/api/v1/transporter/trips');
  fx.tripsAsSeller = { status: t2.status, body: t2.json };
  log('trips-as-seller(role gate):', t2.status);

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 1));
  console.log('\nFIXTURES ->', OUT);
  console.log(JSON.stringify({ orderA: fx.orderA.orderNumber, orderB: fx.orderB.orderNumber,
    transporterId: fx.transporterId, transporterName: fx.createdTransporter.fullName,
    afterAssignA: fx.afterAssignA.status, afterPropose: fx.afterPropose.status, afterConfirmA: fx.afterConfirmA.status,
    proposalStatus: fx.proposal.status, confirmStatus: fx.confirmation.status,
    orderBFinal: fx.afterDispatch.status, buyerCodePresent: !!fx.buyerAfterDispatch.deliveryCode,
    tripsRows: fx.tripsAfterDispatch.count, sellerTripsGate: fx.tripsAsSeller.status }, null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
