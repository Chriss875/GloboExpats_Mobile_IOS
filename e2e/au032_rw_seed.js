// au032_rw_seed.js — RW-lane fixtures for AU-032 (cancel invoice + completion +
// instructions page) minted ONLY through the REAL sandbox API (:8083).
// Creates: throwaway buyer + VERIFIED seller owning one product
//   "AU032 Cancel Tote <stamp>" — TSh 12,000, qty 8 (stock-release probe)
// plus address + delivery quote. Checkout/proforma/orders are driven from the UI
// in the verifier so the screens under test do the mutating.
// Writes /tmp/au032_fixtures.json. Mutates ONLY what this script creates.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const OUT = '/tmp/au032_fixtures.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';
const BUYER_EMAIL = `au032buyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au032seller${STAMP}@gmail.com`;

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
      { firstName: 'AU032', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
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

  // checkout contact step prefills from the buyer profile
  const pfUp = new FormData();
  pfUp.append('profileInformationDTO', new Blob([JSON.stringify({ firstName: 'AU032First', lastName: 'AU032Buyer', whatsAppPhoneNumber: '+2557' + String(STAMP).slice(-9) })], { type: 'application/json' }), 'profile.json');
  const prUp = await fetch(L.API + '/api/v1/userManagement/editProfile', { method: 'PATCH', headers: { Authorization: 'Bearer ' + fx.buyer.token }, body: pfUp });
  console.log('profile patch:', prUp.status);

  const atok = await L.apiLogin(L.ADMIN); fx.adminToken = atok;
  const verS = await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' });
  console.log('verify seller:', verS.status);

  const product = {
    productName: `AU032 Cancel Tote ${STAMP}`,
    productQuantity: 8,
    categoryId: 3,
    subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: 'AU-032 RW fixture: cancel-invoice stock-release probe purchase.',
    currency: 'TZS', askingPrice: 12000, originalPrice: 15000, condition: 'NEW',
  };
  const prd = await postProduct(fx.seller.token, product, 'receipt-proof.png');
  console.log('post-product:', prd.status);
  if (prd.status !== 201) throw new Error('post-product failed ' + JSON.stringify(prd.json).slice(0, 200));
  const pid = prd.json.productId || prd.json.id || (prd.json.product && (prd.json.product.productId || prd.json.id));
  fx.productId = pid;
  const logi = await L.api(atok, 'PATCH', `/api/v1/admin/products/${pid}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' });
  console.log('logistics:', logi.status);

  const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${pid}`);
  console.log('public itemDetails:', det.status, det.json && det.json.productName,
    'qty=', det.json && (det.json.productQuantity ?? det.json.quantity),
    'price=', det.json && det.json.productAskingPrice,
    'img=', det.json && det.json.productImages && det.json.productImages[0]);
  if (det.status !== 200) throw new Error('not publicly visible');
  fx.baseQty = det.json.productQuantity ?? det.json.quantity;
  fx.price = det.json.productAskingPrice;
  fx.image = det.json.productImages && det.json.productImages[0];
  fx.sellerName = det.json.sellerName;

  // buyer saved pinned default address (contact step prefill)
  const a1 = await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: 'AU032 Street 32', city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
    label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+2557' + String(STAMP).slice(-9) });
  console.log('addr:', a1.status);
  if (![200, 201].includes(a1.status)) throw new Error('addr failed ' + JSON.stringify(a1.json).slice(0, 200));

  // server-computed fee ground truth
  const q = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/delivery-quote', {
    items: [{ productId: pid, quantity: 1 }],
    destinationLatitude: -6.7924, destinationLongitude: -39.2083 + 39.2083 - 39.2083, destinationAddressId: null });
  const q2 = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/delivery-quote', {
    items: [{ productId: pid, quantity: 1 }], destinationAddressId: null,
    destinationLatitude: -6.7924, destinationLongitude: 39.2083 });
  console.log('quote:', q2.status, JSON.stringify(q2.json).slice(0, 240));
  fx.quoteStatus = q2.status; fx.quote = q2.json;

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('\nFIXTURES OK ->', OUT);
})().catch(e => { console.error('SEED FAIL', e); process.exit(1); });
