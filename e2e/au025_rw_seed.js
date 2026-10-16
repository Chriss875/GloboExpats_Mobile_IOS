// au025_rw_seed.js — RW-lane fixtures for AU-025 through the REAL sandbox API (:8083).
// Creates: throwaway buyer (profile name+phone, TWO saved pinned addresses — the
// second one with GARBAGE coords to force a quote failure), throwaway seller,
// ONE delivery-eligible product with image, admin logistics flip (BODA + pin).
// Writes /tmp/au025_fixtures.json. Only mutates what this script creates.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const OUT = '/tmp/au025_fixtures.json';
const STAMP = Date.now();
const BUYER_EMAIL = `au025buyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au025seller${STAMP}@gmail.com`;
const PW = 'StrongPass!1';

function png(file) { return fs.readFileSync(path.join(__dirname, 'fixtures', file)); }

async function main() {
  const fx = { stamp: STAMP, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU025', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
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

  // Profile fields checkout step-1 prefills
  const prof = await L.api(btok, 'PUT', '/api/v1/userManagement/update-user-details',
    { firstName: 'AU025First', lastName: 'AU025Last', whatsAppPhoneNumber: '+255713000333' });
  console.log('profile update:', prof.status);

  const atok = await L.apiLogin(L.ADMIN);
  fx.adminToken = atok;
  const ver = await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' });
  console.log('verify seller:', ver.status);

  const product = {
    productName: `AU025 Quote Probe Table ${STAMP}`,
    productQuantity: 5,
    categoryId: 3,
    subcategoryId: 26,
    productCountry: 'Tanzania',
    productRegion: 'Dar es Salaam',
    productStreet: 'Mikocheni',
    productDescription: 'AU-025 RW fixture: delivery-quote verification item with a real seller pin.',
    currency: 'TZS',
    askingPrice: 24500,
    originalPrice: 29000,
    condition: 'NEW',
  };
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([png('receipt-proof.png')], { type: 'image/png' }), 'table.png');
  const r = await fetch(`${L.API}/api/v1/products/post-product`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form });
  const pj = await r.json().catch(() => null);
  console.log('post-product:', r.status);
  if (r.status !== 201) throw new Error('product create failed: ' + JSON.stringify(pj).slice(0, 300));
  const pid = pj.productId || pj.id || (pj.product && (pj.product.productId || pj.product.id));
  fx.productId = pid;

  const logi = await L.api(atok, 'PATCH', `/api/v1/admin/products/${pid}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' });
  console.log('logistics:', logi.status);

  // Buyer saved addresses: A = default w/ REAL Dar es Salaam pin (quote should succeed),
  // B = garbage ocean coords far off the road network (quote should fail / route unavailable).
  const a1 = await L.api(btok, 'POST', '/api/v1/add-address', {
    street: 'AU025 Home Street 21', city: 'Dar es Salaam', region: 'Dar es Salaam',
    country: 'Tanzania', label: 'Home', latitude: -6.7924, longitude: 39.2083,
    isDefault: true, phoneNumber: '+255713000333' });
  console.log('addr1(real pin):', a1.status);
  if (![200, 201].includes(a1.status)) throw new Error('addr1 failed');
  const a2 = await L.api(btok, 'POST', '/api/v1/add-address', {
    street: 'AU025 Garbage Street 99', city: 'Dar es Salaam', region: 'Pwani',
    country: 'Tanzania', label: 'Work', latitude: -7.0000, longitude: 39.0500,
    isDefault: false, phoneNumber: '+255713000333' });
  console.log('addr2(garbage):', a2.status);
  if (![200, 201].includes(a2.status)) throw new Error('addr2 failed');

  const list = await L.api(btok, 'GET', '/api/v1/get-addresses');
  fx.addresses = (list.json || []).map(a => ({ addressId: a.addressId, label: a.label, street: a.street,
    region: a.region, city: a.city, latitude: a.latitude, longitude: a.longitude, isDefault: a.isDefault }));
  console.log('addresses:', JSON.stringify(fx.addresses));

  const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${pid}`);
  console.log('public itemDetails:', det.status, det.json && det.json.productName);
  if (det.status !== 200) throw new Error('not publicly visible');
  fx.askingPrice = det.json && det.json.productAskingPrice;
  fx.image = det.json && det.json.productImages && det.json.productImages[0];
  fx.sellerName = det.json && (det.json.sellerName ?? det.json.sellerOrganization);

  // ---- REAL-API quote probes (ground truth for the UI assertions) ----
  // P1: real coords -> expect numeric consolidatedDeliveryFee >= 0
  const qReal = await L.api(btok, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 },
    items: [{ productId: pid, quantity: 1 }] });
  console.log('\nQUOTE real-pin:', qReal.status, JSON.stringify(qReal.json).slice(0, 400));
  fx.quoteRealStatus = qReal.status; fx.quoteReal = qReal.json;

  // P2: garbage coords -> expect failure reason surfaced
  const qBad = await L.api(btok, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -7.0, longitude: 39.05 },
    items: [{ productId: pid, quantity: 1 }] });
  console.log('QUOTE garbage-pin:', qBad.status, JSON.stringify(qBad.json).slice(0, 400));
  fx.quoteGarbageStatus = qBad.status; fx.quoteGarbage = qBad.json;

  // P3: no coords at all -> BUYER_LOCATION_* family
  const qNoPin = await L.api(btok, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania' },
    items: [{ productId: pid, quantity: 1 }] });
  console.log('QUOTE no-pin:', qNoPin.status, JSON.stringify(qNoPin.json).slice(0, 400));
  fx.quoteNoPinStatus = qNoPin.status; fx.quoteNoPin = qNoPin.json;

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('\nFIXTURES OK ->', OUT);
}
main().catch(e => { console.error('SEED FAIL', e); process.exit(1); });
