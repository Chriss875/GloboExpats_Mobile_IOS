// au039_r6_seed.js — FRESH AU-039 verify-r6 fixtures through the REAL sandbox API only.
// Chain (per acceptance): register throwaway buyer+seller -> post product -> address ->
// proforma -> submit-payment -> ADMIN confirm-payment -> seller confirm-availability ->
// seller transporter assign -> ADMIN dispatch  =>  IN_TRANSIT + 6-digit deliveryCode.
// Mints THREE independent orders:
//   A: BUYER TABLET leg — read-only code card view only (never mutated)
//   B: SELLER leg — wrong-code ladder + lockout + regenerate reset, all in-app
//   C: BUYER MOBILE leg — read-only card, in-app regenerate (fresh code), self-confirm -> DELIVERED
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au039r6_fixture.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';
const BUYER_EMAIL = `au039r6buyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au039r6seller${STAMP}@gmail.com`;
const png = f => fs.readFileSync(path.join(__dirname, 'fixtures', f));
const log = (...a) => console.log('[seed]', ...a);
const in48h = () => new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 10);

async function postProduct(tok, name) {
  const form = new FormData();
  const product = {
    productName: name, productQuantity: 5,
    categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: 'AU-039 verify-r6 RW fixture: delivery code handoff card end-to-end.',
    currency: 'TZS', askingPrice: 18200, originalPrice: 22500, condition: 'NEW',
  };
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([png('receipt-proof.png')], { type: 'image/png' }), 'receipt-proof.png');
  const r = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: form });
  const j = await r.json().catch(() => null);
  if (r.status !== 201) throw new Error('post-product failed ' + r.status + ' ' + JSON.stringify(j).slice(0, 200));
  return j.productId || j.id || (j.product && (j.product.productId || j.id));
}

async function checkout(btok, productId, tag) {
  const buyDetails = {
    firstName: 'AU039R6First', lastName: 'AU039R6Buyer', emailAddress: BUYER_EMAIL,
    phoneNumber: '+255713000777', address: 'AU039R6 Street 12', city: 'Dar es Salaam',
    state: 'Dar es Salaam', country: 'Tanzania', zipCode: '',
    deliveryMethod: "Seller's delivery", paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
    fulfillmentType: 'SELLER_DELIVERY', currency: 'TZS', latitude: -6.7924, longitude: 39.2083,
    preferredDeliveryWindows: [{ date: in48h(), slot: 'EVENING' }],
  };
  const pf = await L.api(btok, 'POST', '/api/v1/checkout/proforma', { buyDetails, items: [{ productId, quantity: 1 }] });
  if (![200, 201].includes(pf.status)) throw new Error('proforma failed ' + JSON.stringify(pf.json).slice(0, 220));
  const sp = await L.api(btok, 'POST', `/api/v1/proformas/${pf.json.proformaId}/submit-payment`,
    { transactionReferences: [`AU039R6${tag}${STAMP}`], paymentMethodType: 'MOBILE_MONEY' });
  if (![200, 201].includes(sp.status)) throw new Error('submit-payment failed ' + JSON.stringify(sp.json).slice(0, 220));
  return { proformaId: pf.json.proformaId, grandTotal: pf.json.grandTotal };
}

async function driveToInTransit(atok, btok, stok, c) {
  const cp = await L.api(atok, 'POST', `/api/v1/admin/proformas/${c.proformaId}/confirm-payment`);
  if (![200, 201].includes(cp.status)) throw new Error('confirm-payment failed ' + JSON.stringify(cp.json).slice(0, 240));
  // order id from buyer list (newest matching proforma total)
  const rows0 = ((await L.api(btok, 'GET', '/api/v1/orders')).json) || [];
  let orderId = null;
  const cand = rows0.find(o => String(o.proformaId ?? o.proforma?.proformaId ?? '') === String(c.proformaId))
    || rows0.filter(o => Number(o.totalAmount) === Number(c.grandTotal)).sort((a, b) => b.orderId - a.orderId)[0]
    || rows0.sort((a, b) => b.orderId - a.orderId)[0];
  orderId = cand && cand.orderId;
  if (!orderId) throw new Error('order not found after confirm-payment');
  const ca = await L.api(stok, 'POST', `/api/v1/orders/${orderId}/confirm-availability`);
  if (![200, 201].includes(ca.status)) throw new Error('confirm-availability failed ' + JSON.stringify(ca.json).slice(0, 240));
  const tr = await L.api(stok, 'POST', '/api/v1/transporters',
    { fullName: `AU039 R6 Rider ${STAMP}`, phoneNumber: '+255715000333', whatsAppPhoneNumber: '+255715000333',
      vehicleType: 'MOTORBIKE', plateNumber: `TR6${String(STAMP).slice(-4)}`, active: true });
  if (![200, 201].includes(tr.status)) throw new Error('transporter create failed ' + JSON.stringify(tr.json).slice(0, 200));
  const asg = await L.api(stok, 'POST', `/api/v1/orders/${orderId}/transporter`,
    { transporterId: tr.json.transporterId, proposedDeliveryTime: new Date(Date.now() + 3600e3).toISOString(), note: 'au039r6' });
  if (![200, 201].includes(asg.status)) throw new Error('transporter assign failed ' + JSON.stringify(asg.json).slice(0, 240));
  const dp = await L.api(atok, 'POST', `/api/v1/orders/${orderId}/dispatch`);
  if (![200, 201].includes(dp.status)) throw new Error('dispatch failed ' + JSON.stringify(dp.json).slice(0, 240));
  const od = await L.api(btok, 'GET', `/api/v1/orders/${orderId}`);
  return { orderId: String(orderId), orderNumber: od.json.orderNumber, status: od.json.status,
    deliveryCode: od.json.deliveryCode == null ? null : String(od.json.deliveryCode),
    buyerCanConfirmDelivery: od.json.buyerCanConfirmDelivery === true, transporterId: tr.json.transporterId };
}

(async () => {
  const fx = { stamp: STAMP, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };
  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU039R6', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed ' + JSON.stringify(reg.json).slice(0, 160));
  }
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.seller.token = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  for (const [k, t] of [['buyer', fx.buyer.token], ['seller', fx.seller.token]]) {
    const me = await L.api(t, 'GET', '/api/v1/userManagement/user-details');
    fx[k].userId = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
    if (!fx[k].userId) throw new Error(k + ' userId missing');
  }
  const atok = await L.apiLogin(L.ADMIN);
  fx.adminEmail = L.ADMIN.email;
  log('verify seller:', (await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' })).status);

  const pidA = await postProduct(fx.seller.token, `AU039R6 Handoff Card A ${STAMP}`);
  const pidB = await postProduct(fx.seller.token, `AU039R6 Handoff Card B ${STAMP}`);
  for (const [k, pid] of [['A', pidA], ['B', pidB]]) {
    log(`logistics-${k}:`, (await L.api(atok, 'PATCH', `/api/v1/admin/products/${pid}/logistics`,
      { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' })).status);
  }
  log('addr:', (await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: 'AU039R6 Street 12', city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
    label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+255713000777' })).status);

  const cA = await checkout(fx.buyer.token, pidA, 'A'); const tA0 = Date.now();
  fx.A = await driveToInTransit(atok, fx.buyer.token, fx.seller.token, cA); log('A:', JSON.stringify(fx.A));
  if (!(/^\d{6}$/.test(String(fx.A.deliveryCode))) || !fx.A.buyerCanConfirmDelivery)
    throw new Error('order A not ready: ' + JSON.stringify(fx.A));

  const cB = await checkout(fx.buyer.token, pidB, 'B');
  fx.B = await driveToInTransit(atok, fx.buyer.token, fx.seller.token, cB); log('B:', JSON.stringify(fx.B));
  if (!(/^\d{6}$/.test(String(fx.B.deliveryCode)))) throw new Error('order B not ready: ' + JSON.stringify(fx.B));

  // sanity: seller list must show B as selling (that is what gates the in-app verify card)
  const sl = await L.api(fx.seller.token, 'GET', '/api/v1/orders');
  const rowB = (sl.json || []).find(o => String(o.orderId) === fx.B.orderId);
  fx.B.orderTypeSeenBySeller = rowB && rowB.orderType;
  log('seller view of B:', rowB ? `${rowB.orderNumber} ${rowB.status} type=${rowB.orderType}` : 'MISSING');

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('\nSEED OK ->', OUT);
})().catch(e => { console.error('SEED FAIL:', e.message); process.exit(1); });
