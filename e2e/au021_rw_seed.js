// au021_rw_seed.js — RW-lane fixtures for AU-021 through the REAL sandbox API (:8083).
// Creates: throwaway buyer, two throwaway sellers (A and B), one product per seller
// (different stock), buyer address with map pin. Only mutates what this script creates.
// Writes /tmp/au021_fixtures.json.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const OUT = '/tmp/au021_fixtures.json';
let adminToken = null;
const STAMP = Date.now();
// Sandbox rejects non-personal domains at register AND login (ALLOWED_EMAIL_DOMAINS).
const BUYER_EMAIL = `au021buyer${STAMP}@gmail.com`;
const SELLER_A = `au021sellera${STAMP}@gmail.com`;
const SELLER_B = `au021sellerb${STAMP}@gmail.com`;
const PW = 'StrongPass!1';

function png(file) { return fs.readFileSync(path.join(__dirname, 'fixtures', file)); }

async function createProduct(token, name, qty, price) {
  const product = {
    productName: name,
    productQuantity: qty,
    categoryId: 3,
    subcategoryId: 26, // Clothing > Accessories
    productCountry: 'Tanzania',
    productRegion: 'Dar es Salaam',
    productStreet: 'Masaki',
    productDescription: 'AU-021 RW fixture (qty revalidation + seller grouping).',
    currency: 'TZS',
    askingPrice: price,
    originalPrice: Math.round(price * 1.25),
    condition: 'NEW',
  };
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([png('receipt-proof.png')], { type: 'image/png' }), 'item.png');
  const r = await fetch(`${L.API}/api/v1/products/post-product`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form,
  });
  const j = await r.json().catch(() => null);
  if (r.status !== 201) throw new Error(`post-product ${name} -> ${r.status} ${JSON.stringify(j).slice(0,200)}`);
  return j.productId || j.id || (j.product && (j.product.productId || j.product.id));
}

async function main() {
  const fx = { stamp: STAMP, buyer: { email: BUYER_EMAIL, pw: PW },
               sellerA: { email: SELLER_A, pw: PW }, sellerB: { email: SELLER_B, pw: PW } };

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['sellerA', SELLER_A], ['sellerB', SELLER_B]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU021', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    console.log(`register ${k}:`, reg.status);
    if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed ' + JSON.stringify(reg.json).slice(0,150));
  }

  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.sellerA.token = await L.apiLogin({ email: SELLER_A, pw: PW });
  fx.sellerB.token = await L.apiLogin({ email: SELLER_B, pw: PW });

  const me = async (t) => {
    const r = await L.api(t, 'GET', '/api/v1/userManagement/user-details');
    return r.json && (r.json.userId ?? (r.json.user && r.json.user.userId));
  };
  fx.buyer.userId = await me(fx.buyer.token);
  fx.sellerA.userId = await me(fx.sellerA.token);
  fx.sellerB.userId = await me(fx.sellerB.token);
  console.log('userIds', fx.buyer.userId, fx.sellerA.userId, fx.sellerB.userId);

  adminToken = await L.apiLogin(L.ADMIN);

  // post-product requires user.verified=true ("Seller not verified" otherwise).
  // NOTE: PATCH /admin/seller-verifications/{id}/approve 409s in this sandbox
  // (approveRequestInternal re-saves the User row; if any user holds
  // organizational_email='support@globoexpats.com' the unique index
  // uk3d7pw8hfjv3hdmct4dukwjxgl fires). The direct status endpoint
  // PATCH /admin/users/{id}/status {status:'VERIFIED'} avoids that write and
  // is the sanctioned fixture path.
  for (const k of ['sellerA', 'sellerB']) {
    const st = await L.api(adminToken, 'PATCH', `/api/v1/admin/users/${fx[k].userId}/status`,
      { status: 'VERIFIED' });
    console.log(`verify ${k}:`, st.status, JSON.stringify(st.json).slice(0, 120));
    if (![200, 201].includes(st.status)) throw new Error('verify failed for ' + k);
  }

  // Products with deliberately DIFFERENT stock so grouping + caps are distinguishable.
  // Stock A is later PATCHed down to 2 to prove the cart-open revalidation cap.
  fx.productA = await createProduct(fx.sellerA.token, `AU021 Woven Basket A ${STAMP}`, 9, 12000);
  fx.productB = await createProduct(fx.sellerB.token, `AU021 Carved Bowl B ${STAMP}`, 4, 25000);

  const atok = adminToken;
  fx.adminToken = atok;
  for (const [key, lat, lng] of [['productA', -6.8001, 39.2751], ['productB', -6.8102, 39.2805]]) {
    const logi = await L.api(atok, 'PATCH', `/api/v1/admin/products/${fx[key]}/logistics`,
      { latitude: lat, longitude: lng, deliveryTransportMode: 'BODA', neighbourhood: 'Masaki' });
    console.log(`logistics ${key}:`, logi.status, JSON.stringify(logi.json).slice(0, 160));
  }

  for (const key of ['productA', 'productB']) {
    const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${fx[key]}`);
    if (det.status !== 200 || !det.json || !det.json.productName) throw new Error(`${key} not public`);
    fx[key + 'Detail'] = {
      productId: det.json.productId ?? fx[key],
      title: det.json.productName,
      stock: det.json.productQuantity,
      price: det.json.productAskingPrice,
      currency: det.json.productCurrency,
      image: det.json.productImages && det.json.productImages[0],
      sellerId: String(det.json.sellerId ?? det.json.sellerUserId ?? ''),
      sellerName: det.json.sellerName ?? '',
      sellerVerified: !!det.json.verified,
    };
    console.log(key, JSON.stringify(fx[key + 'Detail']));
  }

  // Buyer address with a real Dar es Salaam pin (checkout delivery-quote needs it).
  const addr = await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    country: 'Tanzania', region: 'Dar es Salaam', street: 'AU021 Slip Rd Masaki',
    zipCode: '00000', latitude: -6.7905, longitude: 39.2795, label: 'AU021 Home',
    placeName: 'Masaki', neighbourhood: 'Masaki', isDefault: true,
  });
  console.log('add-address:', addr.status, JSON.stringify(addr.json).slice(0, 220));
  if (![200, 201].includes(addr.status)) throw new Error('address failed');
  fx.addressId = addr.json && (addr.json.addressId ?? addr.json.id);

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('FIXTURES OK ->', OUT);
}

main().catch(e => { console.error('SEED FATAL', e.message); process.exit(1); });
