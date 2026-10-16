// au027_rw_seed.js — RW-lane fixtures for AU-027 through the REAL sandbox API (:8083).
// Creates: throwaway buyer (pinned Home address + profile name/phone), throwaway
// seller (VERIFIED), TWO products owned by that seller:
//   P1 "AU027 Choice Tote <stamp>"  — choiceConfiguration Size L/S (review step must
//                                     show selected-choice labels on its lines)
//   P2 "AU027 Plain Lamp <stamp>"   — no choices (plain line)
// Both get admin logistics pins (BODA) so the SELLER_DELIVERY quote succeeds and the
// review step renders real per-seller consolidated fees.
// Writes /tmp/au027_fixtures.json. Only mutates what this script creates.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const OUT = '/tmp/au027_fixtures.json';
const STAMP = Date.now();
const BUYER_EMAIL = `au027buyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au027seller${STAMP}@gmail.com`;
const PW = 'StrongPass!1';

function png(file) { return fs.readFileSync(path.join(__dirname, 'fixtures', file)); }

async function main() {
  const fx = { stamp: STAMP, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU027', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
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
  console.log('buyer userId', fx.buyer.userId, '| seller userId', fx.seller.userId);

  // checkout step-1 prefills from the buyer profile
  const prof = await L.api(btok, 'PUT', '/api/v1/userManagement/update-user-details',
    { firstName: 'AU027First', lastName: 'AU027Last', whatsAppPhoneNumber: '+255715000444' });
  console.log('profile update:', prof.status);

  const atok = await L.apiLogin(L.ADMIN);
  fx.adminToken = atok;
  const ver = await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' });
  console.log('verify seller:', ver.status);

  async function postProduct(product, imgName) {
    const form = new FormData();
    form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
    form.append('images', new Blob([png('receipt-proof.png')], { type: 'image/png' }), imgName);
    const r = await fetch(`${L.API}/api/v1/products/post-product`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form });
    const pj = await r.json().catch(() => null);
    console.log(`post-product ${product.productName}:`, r.status);
    if (r.status !== 201) throw new Error('create failed ' + JSON.stringify(pj).slice(0, 300));
    return pj.productId || pj.id || (pj.product && (pj.product.productId || pj.product.id));
  }

  // P1: choice-configured (Size L / S required BUTTONS)
  const p1 = {
    productName: `AU027 Choice Tote ${STAMP}`,
    productQuantity: 8,
    categoryId: 3,
    subcategoryId: 26, // Accessories allows Size=2 predefined XS..XXL labels
    productCountry: 'Tanzania',
    productRegion: 'Dar es Salaam',
    productStreet: 'Mikocheni',
    productDescription: 'AU-027 RW fixture: choice-configured product; review step must label the chosen size per line.',
    currency: 'TZS',
    askingPrice: 12000,
    originalPrice: 15000,
    condition: 'NEW',
    choiceConfiguration: {
      hasChoices: true,
      attributes: [
        {
          definitionId: 2, name: 'Size', inputType: 'BUTTONS', required: true,
          visual: false, allowDifferentPrices: false, defaultValueId: null,
          values: [
            { id: null, label: 'L', colorHex: null, unit: null, imageUrl: null, imageIndex: null, priceOverridden: false, sellerPayoutAdjustment: 0, active: true },
            { id: null, label: 'S', colorHex: null, unit: null, imageUrl: null, imageIndex: null, priceOverridden: false, sellerPayoutAdjustment: 0, active: true },
          ],
        },
      ],
    },
  };
  fx.productId1 = await postProduct(p1, 'tote.png');

  // P2: plain product (no choices)
  const p2 = {
    productName: `AU027 Plain Lamp ${STAMP}`,
    productQuantity: 5,
    categoryId: 3,
    subcategoryId: 26,
    productCountry: 'Tanzania',
    productRegion: 'Dar es Salaam',
    productStreet: 'Mikocheni',
    productDescription: 'AU-027 RW fixture: plain product line without selected-choice labels.',
    currency: 'TZS',
    askingPrice: 24500,
    originalPrice: 29000,
    condition: 'NEW',
  };
  fx.productId2 = await postProduct(p2, 'lamp.png');

  // logistics pins so both are publicly visible + delivery-quoteable
  for (const pid of [fx.productId1, fx.productId2]) {
    const logi = await L.api(atok, 'PATCH', `/api/v1/admin/products/${pid}/logistics`,
      { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' });
    console.log(`logistics ${pid}:`, logi.status);
    if (![200, 204].includes(logi.status)) throw new Error('logistics flip failed ' + JSON.stringify(logi.json).slice(0, 200));
  }

  // buyer saved pinned address (default)
  const a1 = await L.api(btok, 'POST', '/api/v1/add-address', {
    street: 'AU027 Home Street 7', city: 'Dar es Salaam', region: 'Dar es Salaam',
    country: 'Tanzania', label: 'Home', latitude: -6.7924, longitude: 39.2083,
    isDefault: true, phoneNumber: '+255715000444' });
  console.log('addr1(real pin):', a1.status);
  if (![200, 201].includes(a1.status)) throw new Error('addr1 failed');

  // public visibility + ground-truth echo
  for (const k of ['productId1', 'productId2']) {
    const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${fx[k]}`);
    console.log('public itemDetails', fx[k], det.status, det.json && det.json.productName);
    if (det.status !== 200) throw new Error(k + ' not publicly visible');
    fx[k + 'Price'] = det.json && det.json.productAskingPrice;
    fx[k + 'Image'] = det.json && det.json.productImages && det.json.productImages[0];
    if (k === 'productId1') {
      const attrs = (det.json.choiceConfiguration && det.json.choiceConfiguration.attributes) || [];
      const size = attrs.find(a => a.name === 'Size') || attrs[0];
      fx.sizeDefId = size && size.definitionId;
      fx.sizeValues = ((size && size.values) || []).map(v => ({ id: v.id, label: v.label }));
    }
  }
  fx.sellerName = (await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${fx.productId1}`)).json.sellerName;

  // ---- REAL-API quote probe (ground truth for the review-step fee assertions) ----
  const q = await L.api(btok, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 },
    items: [{ productId: fx.productId1, quantity: 1 }, { productId: fx.productId2, quantity: 1 }] });
  console.log('QUOTE both-items:', q.status, JSON.stringify(q.json).slice(0, 300));
  fx.quoteStatus = q.status; fx.quote = q.json;

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('\nFIXTURES OK ->', OUT);
}
main().catch(e => { console.error('SEED FAIL', e); process.exit(1); });
