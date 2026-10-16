// au022_rw_seed.js — RW-lane fixtures for AU-022 through the REAL sandbox API (:8083).
// Creates: throwaway buyer (with profile name + phone), throwaway seller, ONE product
// with a required choice attr + image, admin logistics flip, TWO saved buyer addresses
// (first = default w/ pin lat/lng; second different coords for the lockstep check).
// Writes /tmp/au022_fixtures.json. Only mutates what this script creates.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const OUT = '/tmp/au022_fixtures.json';
const STAMP = Date.now();
const BUYER_EMAIL = `au022buyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au022seller${STAMP}@gmail.com`;
const PW = 'StrongPass!1';

function png(file) { return fs.readFileSync(path.join(__dirname, 'fixtures', file)); }

async function main() {
  const fx = { stamp: STAMP, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU022', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    console.log(`register ${k}:`, reg.status);
    if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed');
  }
  const btok = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  const stok = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  fx.buyer.token = btok; fx.seller.token = stok;
  const me = await L.api(btok, 'GET', '/api/v1/userManagement/user-details');
  fx.buyer.userId = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  const mes = await L.api(stok, 'GET', '/api/v1/userManagement/user-details');
  fx.seller.userId = mes.json && (mes.json.userId ?? (mes.json.user && mes.json.user.userId));
  console.log('userIds', fx.buyer.userId, fx.seller.userId);

  // Profile fields checkout step-1 prefills: firstName/lastName/email/whatsAppPhoneNumber
  const prof = await L.api(btok, 'PUT', '/api/v1/userManagement/update-user-details',
    { firstName: 'AU022First', lastName: 'AU022Last', whatsAppPhoneNumber: '+255712000222' });
  console.log('profile update:', prof.status, JSON.stringify(prof.json).slice(0, 120));

  const atok = await L.apiLogin(L.ADMIN);
  fx.adminToken = atok;
  const ver = await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' });
  console.log('verify seller:', ver.status);

  const product = {
    productName: `AU022 Checkout Probe Rug ${STAMP}`,
    productQuantity: 8,
    categoryId: 3,
    subcategoryId: 26,
    productCountry: 'Tanzania',
    productRegion: 'Dar es Salaam',
    productStreet: 'Mikocheni',
    productDescription: 'AU-022 RW fixture: 4-step checkout machine verification item with a real sandbox pin.',
    currency: 'TZS',
    askingPrice: 18500,
    originalPrice: 22000,
    condition: 'NEW',
    choiceConfiguration: {
      hasChoices: true,
      attributes: [{
        definitionId: 2, name: 'Size', inputType: 'BUTTONS', required: true,
        visual: false, allowDifferentPrices: false, defaultValueId: null,
        values: [
          { id: null, label: 'L', colorHex: null, unit: null, imageUrl: null, imageIndex: null, priceOverridden: false, sellerPayoutAdjustment: 0, active: true },
          { id: null, label: 'S', colorHex: null, unit: null, imageUrl: null, imageIndex: null, priceOverridden: false, sellerPayoutAdjustment: 0, active: true },
        ],
      }],
    },
  };
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([png('receipt-proof.png')], { type: 'image/png' }), 'rug.png');
  const r = await fetch(`${L.API}/api/v1/products/post-product`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form });
  const pj = await r.json().catch(() => null);
  console.log('post-product:', r.status);
  if (r.status !== 201) throw new Error('product create failed: ' + JSON.stringify(pj).slice(0, 200));
  const pid = pj.productId || pj.id || (pj.product && (pj.product.productId || pj.product.id));
  fx.productId = pid;

  const logi = await L.api(atok, 'PATCH', `/api/v1/admin/products/${pid}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' });
  console.log('logistics:', logi.status);

  // Two saved addresses on the BUYER: default w/ pin A, second w/ pin B.
  const a1 = await L.api(btok, 'POST', '/api/v1/add-address', {
    street: 'AU022 Default Street 14', city: 'Dar es Salaam', region: 'Dar es Salaam',
    country: 'Tanzania', label: 'Home', latitude: -6.7924, longitude: 39.2083,
    isDefault: true, phoneNumber: '+255712000222' });
  console.log('addr1:', a1.status);
  if (a1.status !== 201 && a1.status !== 200) throw new Error('addr1 failed');
  const a2 = await L.api(btok, 'POST', '/api/v1/add-address', {
    street: 'AU022 Alternate Street 9', city: 'Dar es Salaam', region: 'Pwani',
    country: 'Tanzania', label: 'Work', latitude: -6.8759, longitude: 39.2817 });
  console.log('addr2:', a2.status);
  if (a2.status !== 201 && a2.status !== 200) throw new Error('addr2 failed');

  const list = await L.api(btok, 'GET', '/api/v1/get-addresses');
  fx.addresses = (list.json || []).map(a => ({ addressId: a.addressId, label: a.label, street: a.street,
    region: a.region, latitude: a.latitude, longitude: a.longitude, isDefault: a.isDefault }));
  console.log('addresses:', JSON.stringify(fx.addresses));
  if (fx.addresses.length < 2) throw new Error('expected >=2 addresses');

  const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${pid}`);
  console.log('public itemDetails:', det.status, det.json && det.json.productName);
  if (det.status !== 200) throw new Error('not publicly visible');
  fx.askingPrice = det.json && det.json.productAskingPrice;
  fx.image = det.json && det.json.productImages && det.json.productImages[0];
  const attrs = (det.json && det.json.choiceConfiguration && det.json.choiceConfiguration.attributes) || [];
  fx.sizeDefId = attrs[0] && attrs[0].definitionId;
  fx.values = ((attrs[0] && attrs[0].values) || []).map(v => ({ id: v.id, label: v.label }));
  console.log('values', JSON.stringify(fx.values), 'price', fx.askingPrice);

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('FIXTURES OK ->', OUT);
}
main().catch(e => { console.error('SEED FAIL', e); process.exit(1); });
