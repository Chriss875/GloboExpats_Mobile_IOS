// au039_rw_seed_c.js — THIRD AU-039 fixture (order C) for the INTERACTIVE browser loop:
// buyer opens Track delivery, types WRONG codes x3 (app-side lock), taps Generate new code
// (real buyer-authorized regenerate), then the seller verifies the NEW code -> DELIVERED.
// Minted through the REAL sandbox API only. Mutates ONLY what it creates.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au039_fixtures_c.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';
const BUYER_EMAIL = `au039r9dbuyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au039r9dseller${STAMP}@gmail.com`;
const png = f => fs.readFileSync(path.join(__dirname, 'fixtures', f));

async function postProduct(tok, product) {
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([png('receipt-proof.png')], { type: 'image/png' }), 'receipt-proof.png');
  const r = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: form });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const in48h = () => new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 10);

(async () => {
  const fx = { stamp: STAMP, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };
  const log = (...a) => console.log('[seedC]', ...a);
  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU039R9D', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed');
  }
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.seller.token = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  for (const [k, t] of [['buyer', fx.buyer.token], ['seller', fx.seller.token]]) {
    const me = await L.api(t, 'GET', '/api/v1/userManagement/user-details');
    fx[k].userId = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  }
  const atok = await L.apiLogin(L.ADMIN);
  log('verify seller:', (await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' })).status);

  const product = {
    productName: `AU039 Handoff Probe Grinder ${STAMP}`,
    productQuantity: 2,
    categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: 'AU-039 RW fixture C: interactive verify/regenerate browser loop.',
    currency: 'TZS', askingPrice: 17500, originalPrice: 21000, condition: 'NEW',
  };
  const pr = await postProduct(fx.seller.token, product);
  if (pr.status !== 201) throw new Error('post-product failed');
  fx.productId = pr.json.productId || pr.json.id || (pr.json.product && (pr.json.product.productId || pr.json.id));
  log('logistics:', (await L.api(atok, 'PATCH', `/api/v1/admin/products/${fx.productId}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' })).status);
  log('addr:', (await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: 'AU039R9D Street 7', city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
    label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+255713000888' })).status);

  const buyDetails = {
    firstName: 'AU039R9DFirst', lastName: 'AU039R9DBuyer', emailAddress: BUYER_EMAIL,
    phoneNumber: '+255713000888', address: 'AU039R9D Street 7', city: 'Dar es Salaam',
    state: 'Dar es Salaam', country: 'Tanzania', zipCode: '',
    deliveryMethod: "Seller's delivery", paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
    fulfillmentType: 'SELLER_DELIVERY', currency: 'TZS', latitude: -6.7924, longitude: 39.2083,
    preferredDeliveryWindows: [{ date: in48h(), slot: 'EVENING' }],
  };
  const beforeIds = new Set((await (async () => { const l = await L.api(fx.buyer.token, 'GET', '/api/v1/orders'); return Array.isArray(l.json) ? l.json : []; })()).map(o => o.orderId));
  const pf = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/proforma', { buyDetails, items: [{ productId: fx.productId, quantity: 1 }] });
  if (![200, 201].includes(pf.status)) throw new Error('proforma failed');
  const sp = await L.api(fx.buyer.token, 'POST', `/api/v1/proformas/${pf.json.proformaId}/submit-payment`,
    { transactionReferences: [`AU039R9D${STAMP}`], paymentMethodType: 'MOBILE_MONEY' });
  if (![200, 201].includes(sp.status)) throw new Error('submit-payment failed');

  // NOTE: submit-payment already created the order; find it among ALL buyer orders newest-first
  const l2 = await L.api(fx.buyer.token, 'GET', '/api/v1/orders');
  const rows = Array.isArray(l2.json) ? l2.json : [];
  const fresh = rows.filter(o => !beforeIds.has(o.orderId));
  if (!fresh.length) throw new Error('order not found');
  fx.orderId = String(fresh[0].orderId);
  const d0 = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${fx.orderId}`);
  fx.orderNumber = d0.json.orderNumber;
  log('order:', fx.orderNumber, d0.json.status);

  log('mark-paid:', (await L.api(atok, 'PATCH', `/api/v1/admin/orders/${fx.orderId}/mark-paid`)).status);
  const tr = await L.api(fx.seller.token, 'POST', '/api/v1/transporters',
    { fullName: `AU039 Rider C ${STAMP}`, phoneNumber: '+255715000222', whatsAppPhoneNumber: '+255715000222', vehicleType: 'MOTORBIKE', plateNumber: `T3C${String(STAMP).slice(-4)}`, active: true });
  if (![200, 201].includes(tr.status)) throw new Error('transporter create failed');
  fx.transporterId = tr.json.transporterId;
  const asg = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${fx.orderId}/transporter`, { transporterId: fx.transporterId, note: 'au039r9d' });
  log('assign:', asg.status);
  const dp = await L.api(atok, 'POST', `/api/v1/orders/${fx.orderId}/dispatch`);
  log('dispatch(admin):', dp.status);
  if (![200, 201].includes(dp.status)) throw new Error('dispatch failed ' + JSON.stringify(dp.json));
  const od = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${fx.orderId}`);
  fx.afterDispatch = { status: od.json.status, deliveryCode: od.json.deliveryCode ?? null };
  if (!/^\d{6}$/.test(String(fx.afterDispatch.deliveryCode))) throw new Error('no code');
  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('\nSEED-C OK ->', OUT, '|', fx.orderNumber, '| code', fx.afterDispatch.deliveryCode);
})().catch(e => { console.error('SEED-C FAIL:', e.message); process.exit(1); });
