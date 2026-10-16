// au037_r5_seed.js — RW fixtures for AU-037 verify-r5 on the FROZEN e1a5762 bundle (:9121).
// Mints everything through the REAL sandbox API (:8083), throwaway accounts only:
//   buyer + VERIFIED seller + product (image) + logistics + transporter(MOTORBIKE)
//   order R  : checkout -> submit-payment -> admin confirm-payment -> confirm-availability
//              -> assign transporter -> admin dispatch -> seller verify-delivery => DELIVERED
//              (LEFT at DELIVERED: the app's Confirm Received / Rate Seller vector)
//   order S  : same chain but stopped after submit-payment => AWAITING_PAYMENT escrowPending
//              (buyer NO-Cancel assertion target; also probed for a phantom buyer cancel via API)
// Writes /tmp/au037_r5_fixtures.json.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au037_r5_fixtures.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';
const BUYER_EMAIL = `au037r5buyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au037r5seller${STAMP}@gmail.com`;
const PRICE = 14000, FEE = 2000;
const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
const step = (s, extra) => console.log('[seed]', s, extra !== undefined ? JSON.stringify(extra).slice(0, 200) : '');

function png(file) { return fs.readFileSync(path.join(__dirname, 'fixtures', file)); }

async function postProduct(tok, product, file) {
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([png(file)], { type: 'image/png' }), file);
  const r = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: form });
  const j = await r.json().catch(() => null);
  return { status: r.status, json: j };
}

async function checkout(btok, productId, refTag, slot) {
  const buyDetails = {
    firstName: 'AU037R5', lastName: 'Buyer', emailAddress: BUYER_EMAIL,
    phoneNumber: '+255715000777', address: 'au037 r5 seed street',
    deliveryLabel: 'Home', deliveryPlaceName: '', deliveryNeighbourhood: '',
    city: 'dar es salaam', state: '', country: 'tanzania', zipCode: '',
    deliveryInstructions: '', fulfillmentType: 'SELLER_DELIVERY',
    paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
    deliveryFee: FEE, totalAmount: PRICE + FEE, currency: 'TZS',
    latitude: -6.7924, longitude: 39.2083,
    preferredDeliveryDate: tomorrow(), preferredDeliverySlot: slot,
    preferredDeliveryWindows: [{ date: tomorrow(), slot }],
  };
  const pf = await L.api(btok, 'POST', '/api/v1/checkout/proforma', { buyDetails, items: [{ productId, quantity: 1 }] });
  if (![200, 201].includes(pf.status)) throw new Error('proforma failed ' + JSON.stringify(pf.json).slice(0, 250));
  const pj = pf.json || {};
  const sp = await L.api(btok, 'POST', `/api/v1/proformas/${pj.proformaId}/submit-payment`,
    { transactionReferences: [`AU037R5-${refTag}-${STAMP}`], paymentMethodType: 'MOBILE_MONEY' });
  if (![200, 201].includes(sp.status)) throw new Error('submit-payment failed ' + JSON.stringify(sp.json).slice(0, 250));
  const ids = ((sp.json && sp.json.sellerGroups) || []).map(g => g.orderId).filter(Boolean);
  let orderId = ids[0];
  if (!orderId) {
    // fall back: find newest own AWAITING_PAYMENT order
    const list = await L.api(btok, 'GET', '/api/v1/orders');
    const rows = Array.isArray(list.json) ? list.json : [];
    const mine = rows.filter(o => o.orderType === 'buying' && o.status === 'AWAITING_PAYMENT' && o.totalAmount === PRICE + FEE);
    orderId = mine.length ? mine[mine.length - 1].orderId : null;
  }
  if (!orderId) throw new Error('no order id after submit-payment');
  return { proformaId: pj.proformaId, grandTotal: pj.grandTotal, orderId };
}

async function main() {
  const fx = { stamp: STAMP, price: PRICE, fee: FEE, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU037R5', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    step(`register ${k}`, reg.status);
    if (![200, 201].includes(reg.status)) throw new Error('register failed');
  }
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.seller.token = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });

  for (const [k, t] of [['buyer', fx.buyer.token], ['seller', fx.seller.token]]) {
    const me = await L.api(t, 'GET', '/api/v1/userManagement/user-details');
    fx[k].userId = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  }
  step('userIds', { buyer: fx.buyer.userId, seller: fx.seller.userId });

  const atok = await L.apiLogin(L.ADMIN);
  fx.adminToken = atok;
  const ver = await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' });
  step('verify seller', ver.status);

  const product = {
    productName: `AU037R5 Receipt Tote ${STAMP}`,
    productQuantity: 6,
    categoryId: 3,
    subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: 'AU-037 r5 RW fixture: buyer confirm-receipt/rating + cancel gating.',
    currency: 'TZS', askingPrice: PRICE, originalPrice: 17500, condition: 'NEW',
  };
  const pr = await postProduct(fx.seller.token, product, 'receipt-proof.png');
  step('post-product', pr.status);
  if (pr.status !== 201) throw new Error('post-product failed ' + JSON.stringify(pr.json).slice(0, 250));
  fx.productId = pr.json.productId || pr.json.id || (pr.json.product && (pr.json.product.productId || pr.json.id));
  const lg = await L.api(atok, 'PATCH', `/api/v1/admin/products/${fx.productId}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' });
  step('logistics', lg.status);
  const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${fx.productId}`);
  fx.publicTitle = det.json && det.json.productName;
  fx.publicImage = det.json && det.json.productImages && det.json.productImages[0];
  step('public itemDetails', { status: det.status, title: fx.publicTitle, img: fx.publicImage });

  const ad = await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: 'AU037R5 Street 3', city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
    label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+255715000777' });
  step('address', ad.status);

  // transporter compatible with BODA tariff class
  const tr = await L.api(fx.seller.token, 'POST', '/api/v1/transporters', {
    fullName: `AU037R5 Rider ${STAMP}`, phoneNumber: '+255715000999', whatsAppPhoneNumber: '+255715000999',
    vehicleType: 'MOTORBIKE', plateNumber: `AU37R5-${STAMP % 10000}`, active: true });
  step('transporter create', tr.status);
  if (![200, 201].includes(tr.status)) throw new Error('transporter failed');
  fx.transporterId = tr.json.transporterId;

  async function driveToDelivered(c) {
    const cp = await L.api(atok, 'POST', `/api/v1/admin/proformas/${c.proformaId}/confirm-payment`);
    if (![200, 201].includes(cp.status)) throw new Error('confirm-payment failed ' + JSON.stringify(cp.json).slice(0, 200));
    const cf = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${c.orderId}/confirm-availability`);
    if (![200, 201].includes(cf.status)) throw new Error('confirm-availability failed ' + JSON.stringify(cf.json).slice(0, 200));
    const at = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${c.orderId}/transporter`,
      { transporterId: fx.transporterId, proposedDeliveryTime: new Date(Date.now() + 3600 * 1000).toISOString(), note: 'au037 r5' });
    if (![200, 201].includes(at.status)) throw new Error('assign transporter failed ' + JSON.stringify(at.json).slice(0, 200));
    const dp = await L.api(atok, 'POST', `/api/v1/orders/${c.orderId}/dispatch`);
    if (![200, 201].includes(dp.status)) throw new Error('dispatch failed ' + JSON.stringify(dp.json).slice(0, 200));
    const od = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${c.orderId}`);
    const code = od.json.deliveryCode;
    if (!code) throw new Error('no deliveryCode while IN_TRANSIT');
    fx.lastDeliveryCode = code;
    const vd = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${c.orderId}/verify-delivery`, { code });
    if (![200, 201].includes(vd.status)) throw new Error('verify-delivery failed ' + JSON.stringify(vd.json).slice(0, 200));
    const fin = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${c.orderId}`);
    return fin.json;
  }

  // ---- order R: DELIVERED, untouched by rating (Confirm Received / Rate Seller vector)
  {
    const c = await checkout(fx.buyer.token, fx.productId, 'R', 'AFTERNOON');
    const j = await driveToDelivered(c);
    fx.orderR = { proformaId: c.proformaId, orderId: c.orderId, number: j.orderNumber, status: j.status,
      totalAmount: j.totalAmount, deliveryCodeUsed: fx.lastDeliveryCode };
    step('orderR DELIVERED', { num: j.orderNumber, status: j.status });
  }

  // ---- order S: AWAITING_PAYMENT (escrowPending), buyer no-Cancel target
  {
    const c = await checkout(fx.buyer.token, fx.productId, 'S', 'EVENING');
    const d = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${c.orderId}`);
    fx.orderS = { proformaId: c.proformaId, orderId: c.orderId, number: d.json.orderNumber,
      status: d.json.status, escrowPending: d.json.escrowPending, refundStatus: d.json.refundStatus };
    step('orderS AWAITING_PAYMENT', { num: d.json.orderNumber, status: d.json.status, escrowPending: d.json.escrowPending });

    // API probe: does ANY buyer-role cancel path exist? (reference has none; D1 fix removed the button)
    const probe = await L.api(fx.buyer.token, 'PATCH', `/api/v1/orders/${c.orderId}/seller-cancel`, { reason: 'au037 r5 phantom buyer cancel probe' });
    fx.orderS.phantomCancelProbe = { status: probe.status, body: probe.json };
    step('phantom buyer cancel probe', probe.status);
    const after = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${c.orderId}`);
    fx.orderS.statusAfterProbe = after.json.status;
    step('orderS status after probe', after.json.status);
  }

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('FIXTURES OK ->', OUT);
}
main().catch(e => { console.error('SEED FAIL:', e.message); process.exit(1); });
