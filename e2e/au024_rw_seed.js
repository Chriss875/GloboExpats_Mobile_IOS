// au024_rw_seed.js — RW-lane fixtures for AU-024 (fulfillment_type_enum) through the
// REAL sandbox API (:8083). Creates: throwaway buyer (profile + ONE pinned saved
// address "Home" with a real Dar es Salaam pin so SELLER_DELIVERY quotes fine),
// throwaway seller, ONE delivery-eligible product with an image, admin logistics
// flip. Writes /tmp/au024_fixtures.json. Only mutates what this script creates.
// Also runs the ground-truth API probe: POST /api/v1/checkout/proforma with each
// fulfillmentType to prove the backend accepts SELLER_DELIVERY/BUYER_PICKUP and
// rejects legacy SALE/CARD.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const OUT = '/tmp/au024_fixtures.json';
const STAMP = Date.now();
const BUYER_EMAIL = `au024buyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au024seller${STAMP}@gmail.com`;
const PW = 'StrongPass!1';

function png(file) { return fs.readFileSync(path.join(__dirname, 'fixtures', file)); }

async function main() {
  const fx = { stamp: STAMP, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU024', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    console.log(`register ${k}:`, reg.status);
    if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed');
  }
  const btok = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  const stok = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  fx.buyer.token = btok; fx.seller.token = stok;
  const me = await L.api(btok, 'GET', '/api/v1/userManagement/user-details');
  fx.buyer.userId = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  const mes = await L.api(stok, 'GET', '/api/v1/userManagement/user-details');
  fx.seller.userId = mes.json && (mes.json.user ? mes.json.user.userId : mes.json.userId);
  console.log('userIds', fx.buyer.userId, fx.seller.userId);

  const prof = await L.api(btok, 'PUT', '/api/v1/userManagement/update-user-details',
    { firstName: 'AU024First', lastName: 'AU024Last', whatsAppPhoneNumber: '+255713000444' });
  console.log('profile update:', prof.status);

  const atok = await L.apiLogin(L.ADMIN);
  fx.adminToken = atok;
  const ver = await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' });
  console.log('verify seller:', ver.status);

  const product = {
    productName: `AU024 Enum Probe Chair ${STAMP}`,
    productQuantity: 5,
    categoryId: 3,
    subcategoryId: 26,
    productCountry: 'Tanzania',
    productRegion: 'Dar es Salaam',
    productStreet: 'Mikocheni',
    productDescription: 'AU-024 RW fixture: fulfillment-type enum verification item.',
    currency: 'TZS',
    askingPrice: 15000,
    originalPrice: 18000,
    condition: 'NEW',
  };
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([png('receipt-proof.png')], { type: 'image/png' }), 'chair.png');
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

  // Buyer saved address: default w/ REAL Dar es Salaam pin (quote succeeds).
  const a1 = await L.api(btok, 'POST', '/api/v1/add-address', {
    street: 'AU024 Home Street 8', city: 'Dar es Salaam', region: 'Dar es Salaam',
    country: 'Tanzania', label: 'Home', latitude: -6.7924, longitude: 39.2083,
    isDefault: true, phoneNumber: '+255713000444' });
  console.log('addr1(real pin):', a1.status);
  if (![200, 201].includes(a1.status)) throw new Error('addr1 failed');

  const list = await L.api(btok, 'GET', '/api/v1/get-addresses');
  fx.addresses = (list.json || []).map(a => ({ addressId: a.addressId, label: a.label, street: a.street,
    latitude: a.latitude, longitude: a.longitude, isDefault: a.isDefault }));
  console.log('addresses:', JSON.stringify(fx.addresses));

  const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${pid}`);
  console.log('public itemDetails:', det.status, det.json && det.json.productName);
  if (det.status !== 200) throw new Error('not publicly visible');
  fx.askingPrice = det.json && det.json.productAskingPrice;
  fx.image = det.json && det.json.productImages && det.json.productImages[0];
  fx.sellerName = det.json && (det.json.sellerName ?? det.json.sellerOrganization);

  // ---- Ground-truth API probes ----
  // Q1: real coords quote -> numeric fee the UI must render on SELLER_DELIVERY.
  const qReal = await L.api(btok, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 },
    items: [{ productId: pid, quantity: 1 }] });
  console.log('\nQUOTE real-pin:', qReal.status, JSON.stringify(qReal.json).slice(0, 400));
  fx.quoteRealStatus = qReal.status; fx.quoteReal = qReal.json;

  // P1: proforma with SELLER_DELIVERY (accepted; cancelled right away — own fixture).
  const items = [{ productId: pid, quantity: 1, selectedChoices: [] }];
  const FEE = (qReal.json && qReal.json.deliveryTotal) || 0;
  const baseBuy = {
    firstName: 'AU024First', lastName: 'AU024Last',
    emailAddress: BUYER_EMAIL, phoneNumber: '+255713000444',
    address: 'AU024 Home Street 8', deliveryLabel: 'Home',
    deliveryPlaceName: '', deliveryNeighbourhood: '',
    city: 'Dar es Salaam', state: '', country: 'Tanzania', zipCode: '',
    deliveryInstructions: '', agreeToTerms: true, currency: 'TZS',
    latitude: -6.7924, longitude: 39.2083,
    preferredDeliveryDate: '2026-08-26', preferredDeliverySlot: 'EVENING',
    preferredDeliveryWindows: [{ date: '2026-08-26', slot: 'EVENING' }],
    paymentMethodType: 'MOBILE_MONEY',
    deliveryFee: FEE,
    totalAmount: 15000 + FEE,
  };
  const wrap = (ft, extra={}) => ({ buyDetails: { ...baseBuy, fulfillmentType: ft, ...extra }, items });
  let pSD = await L.api(btok, 'POST', '/api/v1/checkout/proforma', wrap('SELLER_DELIVERY'));
  console.log('PROFORMA SELLER_DELIVERY:', pSD.status, JSON.stringify(pSD.json).slice(0, 500));
  fx.proformaSellerDelivery = { status: pSD.status, body: pSD.json };
  const sdId = pSD.json && (pSD.json.proformaId ?? pSD.json.id);
  if (sdId) { const c = await L.api(btok, 'POST', `/api/v1/proformas/${sdId}/cancel`); console.log('cancel SD proforma:', c.status); }

  // P2: proforma with BUYER_PICKUP (accepted; deliveryFee forced 0 client-side).
  const pBP = await L.api(btok, 'POST', '/api/v1/checkout/proforma', wrap('BUYER_PICKUP'));
  console.log('PROFORMA BUYER_PICKUP:', pBP.status, JSON.stringify(pBP.json).slice(0, 500));
  fx.proformaBuyerPickup = { status: pBP.status, body: pBP.json };
  const bpId = pBP.json && (pBP.json.proformaId ?? pBP.json.id);
  if (bpId) { const c = await L.api(btok, 'POST', `/api/v1/proformas/${bpId}/cancel`); console.log('cancel BP proforma:', c.status); }

  // P3: legacy enum must NOT be accepted by the backend either way — record only.
  const pSale = await L.api(btok, 'POST', '/api/v1/checkout/proforma', wrap('SALE'));
  console.log('PROFORMA legacy SALE ->', pSale.status, JSON.stringify(pSale.json).slice(0, 200));
  fx.proformaLegacySale = { status: pSale.status };

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('\nFIXTURES OK ->', OUT);
}
main().catch(e => { console.error('SEED FAIL', e); process.exit(1); });
