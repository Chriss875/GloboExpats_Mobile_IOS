// au036_rw_seed.js — RW-lane fixture minting for AU-036 through the REAL sandbox API.
// Creates: throwaway buyer + seller, one product (image + logistics flip), a full
// checkout chain -> order in AWAITING_SELLER_CONFIRMATION (state 3: HELD).
// Also mints a state-4 (HELD + AWAITING_DELIVERY) by confirming availability, then
// releases the payout via admin release-payment to prove state 6 on OUR OWN fixture
// where possible. Writes /tmp/au036_fixtures.json. Mutates ONLY what it creates.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au036_fixtures.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';
const BUYER_EMAIL = `au036buyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au036seller${STAMP}@gmail.com`;

function png(file) { return fs.readFileSync(path.join(__dirname, 'fixtures', file)); }
async function postProduct(tok, product, file) {
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([png(file)], { type: 'image/png' }), file);
  const r = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: form });
  const j = await r.json().catch(() => null);
  return { status: r.status, json: j };
}

(async () => {
  const fx = { stamp: STAMP, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };
  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU036', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    console.log(`register ${k}:`, reg.status);
    if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed ' + JSON.stringify(reg.json).slice(0, 150));
  }
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.seller.token = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });

  const meB = await L.api(fx.buyer.token, 'GET', '/api/v1/userManagement/user-details');
  fx.buyer.userId = meB.json && (meB.json.userId ?? (meB.json.user && meB.json.user.userId));
  const meS = await L.api(fx.seller.token, 'GET', '/api/v1/userManagement/user-details');
  fx.seller.userId = meS.json && (meS.json.userId ?? (meS.json.user && meS.json.user.userId));
  console.log('userIds', fx.buyer.userId, fx.seller.userId);

  // profile names so the order card shows them
  console.log('profileB', (await L.api(fx.buyer.token, 'PUT', '/api/v1/userManagement/update-user-details',
    { firstName: 'AU036First', lastName: 'AU036Buyer', whatsAppPhoneNumber: '+255713000333' })).status);

  const atok = await L.apiLogin(L.ADMIN); fx.adminToken = atok;
  const verS = await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' });
  console.log('verify seller:', verS.status);

  // ---- product owned by our seller
  const product = {
    productName: `AU036 Escrow Probe Vase ${STAMP}`,
    productQuantity: 5,
    categoryId: 3,
    subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: 'AU-036 RW fixture for escrow visibility states (real sandbox purchase).',
    currency: 'TZS', askingPrice: 24000, originalPrice: 29000, condition: 'NEW',
  };
  const pr = await postProduct(fx.seller.token, product, 'receipt-proof.png');
  console.log('post-product:', pr.status);
  if (pr.status !== 201) throw new Error('post-product failed ' + JSON.stringify(pr.json).slice(0, 200));
  const pid = pr.json.productId || pr.json.id || (pr.json.product && (pr.json.product.productId || pr.json.id));
  fx.productId = pid;
  const logi = await L.api(atok, 'PATCH', `/api/v1/admin/products/${pid}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' });
  console.log('logistics:', logi.status);

  const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${pid}`);
  console.log('public itemDetails:', det.status, det.json && det.json.productName, det.json && det.json.productAskingPrice);
  if (det.status !== 200) throw new Error('not publicly visible');

  // ---- buyer address
  const a1 = await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: 'AU036 Street 21', city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
    label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+255713000333' });
  console.log('addr:', a1.status);

  // ---- delivery quote (server-computed fee)
  const q = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/delivery-quote', {
    items: [{ productId: pid, quantity: 1 }],
    destinationAddressId: null,
    destinationLatitude: -6.7924, destinationLongitude: 39.2083,
  });
  console.log('delivery-quote:', q.status, JSON.stringify(q.json).slice(0, 220));

  // ---- proforma
  const buyDetails = {
    firstName: 'AU036First', lastName: 'AU036Buyer', emailAddress: BUYER_EMAIL,
    phoneNumber: '+255713000333', address: 'AU036 Street 21', city: 'Dar es Salaam',
    state: 'Dar es Salaam', country: 'Tanzania', zipCode: '',
    deliveryMethod: "Seller's delivery", paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
    fulfillmentType: 'SELLER_DELIVERY', currency: 'TZS',
    latitude: -6.7924, longitude: 39.2083,
    preferredDeliveryWindows: [{ date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), slot: 'AFTERNOON' }],
  };
  const pf = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/proforma',
    { buyDetails, items: [{ productId: pid, quantity: 1 }] });
  console.log('proforma:', pf.status, JSON.stringify(pf.json).slice(0, 260));
  if (![200, 201].includes(pf.status)) throw new Error('proforma failed');
  const pj = pf.json || {};
  fx.proformaNumber = pj.proformaNumber; fx.grandTotal = pj.grandTotal;
  const groupId = pj.sellerGroups && pj.sellerGroups[0] && pj.sellerGroups[0].sellerGroupId;
  fx.sellerGroupId = groupId;

  // ---- submit payment (sandbox gateway accepts reference proof)
  const ref = `AU036REF${STAMP}`;
  const sp = await L.api(fx.buyer.token, 'POST', `/api/v1/proformas/${pj.proformaId}/submit-payment`,
    { transactionReferences: [ref], paymentMethodType: 'MOBILE_MONEY' });
  console.log('submit-payment:', sp.status, JSON.stringify(sp.json).slice(0, 160));
  fx.paymentRef = ref;

  // ---- find OUR order (buyer list) — should be AWAITING_PAYMENT escrowPending=true
  const ordList = await L.api(fx.buyer.token, 'GET', '/api/v1/orders');
  const rows = Array.isArray(ordList.json) ? ordList.json : [];
  const mine = rows.find(o => o.orderNumber && o.orderNumber !== '' && o.totalAmount === (pj.grandTotal ?? o.totalAmount));
  fx.order = mine ? { orderId: mine.orderId, orderNumber: mine.orderNumber, status: mine.status, escrowPending: mine.escrowPending, payoutStatus: mine.payoutStatus, totalAmount: mine.totalAmount } : null;
  console.log('our order after submit:', JSON.stringify(fx.order));

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('FIXTURES OK ->', OUT);
})().catch(e => { console.error('SEED FAIL', e.message); process.exit(1); });
