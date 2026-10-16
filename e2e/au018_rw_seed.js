// au018_rw_seed.js — RW fixtures for AU-018 buy gates, created through the REAL
// sandbox API (:8083). Creates:
//   1) an OOS listing (productQuantity 0) owned by the BUYER  -> own-item AND OOS gate
//   2) a normal in-stock listing owned by the BUYER           -> own-item gate with buttons enabled
//   3) a normal in-stock listing owned by ANOTHER seller      -> control (buy should work)
// Writes /tmp/au018_fixtures.json. Only mutates what this script creates.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');
const OUT = '/tmp/au018_fixtures.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';

async function postProduct(token, product, imageFile) {
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  if (imageFile) {
    const img = fs.readFileSync(path.join(__dirname, 'fixtures', imageFile));
    form.append('images', new Blob([img], { type: 'image/png' }), imageFile);
  }
  const r = await fetch(`${L.API}/api/v1/products/post-product`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
  const pj = await r.json().catch(() => null);
  if (r.status !== 201) throw new Error(`post-product ${r.status}: ${JSON.stringify(pj).slice(0,300)}`);
  return pj.productId || pj.id || (pj.product && (pj.product.productId || pj.product.id));
}

async function main() {
  const fx = { stamp: STAMP };
  // Buyer = the canonical BUYER account from lib_verify (userId 142, VERIFIED).
  const btok = await L.apiLogin(L.BUYER);
  fx.buyerToken = btok;
  const me = await L.api(btok, 'GET', '/api/v1/userManagement/user-details');
  fx.buyerUserId = me.json.userId;
  console.log('buyer userId:', fx.buyerUserId);

  // A second verified seller for the control listing.
  const SELLER_EMAIL = `au018seller${STAMP}@gmail.com`;
  const reg = await L.api(null, 'POST', '/api/v1/auth/register',
    { firstName: 'AU018', lastName: 'Seller', password: PW, emailAddress: SELLER_EMAIL });
  console.log('register seller:', reg.status);
  if (![200,201,400,409].includes(reg.status)) throw new Error('register failed');
  const stok = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  const mes = await L.api(stok, 'GET', '/api/v1/userManagement/user-details');
  const sid = mes.json.userId;
  const atok = await L.apiLogin(L.ADMIN);
  const ver = await L.api(atok, 'PATCH', `/api/v1/admin/users/${sid}/status`, { status: 'VERIFIED' });
  console.log('verify seller', sid, ':', ver.status);
  fx.controlSellerId = sid;

  const base = {
    categoryId: 1, subcategoryId: 5,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    currency: 'TZS',
    productDescription: 'AU-018 RW fixture: real sandbox listing used to verify the purchase gates (own item / out of stock) in the mobile build.',
    condition: 'NEW',
  };
  const stampName = n => `AU018 ${n} ${STAMP}`;

  // 1) OWN + OOS listing (buyer-owned, quantity 0)
  fx.ownOosId = await postProduct(btok, { ...base,
    productName: stampName('Own Out Of Stock Bowl'), productQuantity: 0, askingPrice: 42000, originalPrice: 48000 }, 'receipt-proof.png');

  // 2) OWN + IN STOCK listing (buyer-owned, quantity 4)
  fx.ownInStockId = await postProduct(btok, { ...base,
    productName: stampName('Own In Stock Teak Set'), productQuantity: 4, askingPrice: 51000, originalPrice: 56000 });

  // 3) CONTROL: other-seller, in stock
  fx.controlId = await postProduct(stok, { ...base,
    productName: stampName('Other Seller Control Rug'), productQuantity: 6, askingPrice: 33000, originalPrice: 37000 }, 'receipt-proof.png');

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('FIXTURES OK ->', OUT);
  console.log(JSON.stringify(fx, null, 2));
}
main().catch(e => { console.error('SEED FATAL', e.message); process.exit(1); });
