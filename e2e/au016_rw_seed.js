// au016_rw_seed.js — RW-lane fixtures for AU-016 rental booking through the REAL
// sandbox API (:8083). Creates: throwaway buyer + seller accounts, one FOR_RENT
// product (listingType FOR_RENT + ratePeriod DAY) with a real image, then flips
// deliverySetupReady via the admin logistics repair endpoint.
// Writes /tmp/au016_fixtures.json. Only mutates what this script creates.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const OUT = '/tmp/au016_fixtures.json';
const STAMP = Date.now();
// Sandbox register/login only accepts personal domains (AuthService.ALLOWED_EMAIL_DOMAINS).
const BUYER_EMAIL = `au016buyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au016seller${STAMP}@gmail.com`;
const PW = 'StrongPass!1';

async function main() {
  const fx = { stamp: STAMP, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU016', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    console.log(`register ${k}:`, reg.status, JSON.stringify(reg.json).slice(0, 120));
    if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed');
  }

  const btok = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  const stok = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  fx.buyer.token = btok; fx.seller.token = stok;
  const me = await L.api(btok, 'GET', '/api/v1/userManagement/user-details');
  fx.buyer.userId = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  const mes = await L.api(stok, 'GET', '/api/v1/userManagement/user-details');
  fx.seller.userId = mes.json && (mes.json.userId ?? (mes.json.user && mes.json.user.userId));
  console.log('buyer', fx.buyer.userId, '| seller', fx.seller.userId);

  // Seller must be VERIFIED before post-product accepts anything.
  const atok = await L.apiLogin(L.ADMIN);
  fx.adminToken = atok;
  const ver = await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' });
  console.log('verify seller:', ver.status);

  // FOR_RENT product: daily rate. Field names mirror the web sell wizard payload.
  const product = {
    productName: `AU016 Lakeside Cabin Rental ${STAMP}`,
    productQuantity: 1,
    categoryId: 5,
    subcategoryId: 38, // Real Estate > Apartments for Rent (matches product 623)
    productCountry: 'Tanzania',
    productRegion: 'Dar es Salaam',
    productStreet: 'Kigamboni',
    productDescription: 'AU-016 RW fixture: FOR_RENT listing with a DAY rate — the detail screen must render rate period + booking picker and carry the booking into the cart line signature.',
    currency: 'TZS',
    askingPrice: 45000,
    originalPrice: 55000,
    condition: 'NEW',
    rentalConfiguration: { enabled: true, listingType: 'FOR_RENT', ratePeriod: 'DAY' },
  };
  const img = fs.readFileSync(path.join(__dirname, 'fixtures', 'receipt-proof.png'));
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([img], { type: 'image/png' }), 'cabin.png');

  const r = await fetch(`${L.API}/api/v1/products/post-product`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form,
  });
  const pj = await r.json().catch(() => null);
  console.log('post-product:', r.status, JSON.stringify(pj).slice(0, 300));
  if (r.status !== 201) throw new Error('product create failed: ' + r.status);
  const pid = pj.productId || pj.id || (pj.product && (pj.product.productId || pj.product.id));
  fx.productId = pid;

  const logi = await L.api(atok, 'PATCH', `/api/v1/admin/products/${pid}/logistics`,
    { latitude: -6.8597, longitude: 39.2906, deliveryTransportMode: 'BODA', neighbourhood: 'Kigamboni' });
  console.log('logistics:', logi.status);

  const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${pid}`);
  if (det.status !== 200) throw new Error('product not publicly visible after logistics flip');
  fx.listingType = det.json && det.json.listingType;
  fx.ratePeriod = det.json && ((det.json.rentalBooking && det.json.rentalBooking.ratePeriod) || det.json.ratePeriod);
  fx.askingPrice = det.json && det.json.productAskingPrice;
  fx.currency = det.json && det.json.productCurrency;
  fx.title = det.json && det.json.productName;
  fx.image = det.json && det.json.productImages && det.json.productImages[0];
  console.log('PUBLIC OK', JSON.stringify({ productId: pid, listingType: fx.listingType, ratePeriod: fx.ratePeriod, price: fx.askingPrice }));

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('FIXTURES OK ->', OUT);
}

main().catch(e => { console.error('SEED FATAL', e.message); process.exit(1); });
