// au047_rw_seed.js — RW-lane fixtures for AU-047 (browse filter body extension).
// Creates through the REAL sandbox API (:8083): throwaway seller + buyer accounts,
// then FOUR listings with distinct, machine-checkable criteria:
//   P1  condition LIKE_NEW, price 12345, street "Kariakoo AU047", source COMMUNITY
//   P2  condition GOOD,      price 23456, street "Kariakoo AU047"
//   P3  condition NEW,       price 98765, street "Sinza AU047"
//   P4  (control) plain listing, no distinctive markers
// Writes /tmp/au047_fixtures.json. Mutates ONLY what this script creates.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const OUT = '/tmp/au047_fixtures.json';
const STAMP = Date.now();
const SELLER_EMAIL = `au047seller${STAMP}@gmail.com`;
const BUYER_EMAIL = `au047buyer${STAMP}@gmail.com`;
const PW = 'StrongPass!1';
const NB = 'Kariakoo'; // neighbourhood value typed into the sheet dropdown

const PRODUCTS = [
  { key: 'P1', name: `AU047 Amber Teapot ${STAMP}`, cond: 'LIKE_NEW', price: 12345, orig: 15000,
    street: `Kariakoo AU047`, desc: 'AU-047 RW fixture one: teapot for the condition+price+neighbourhood probe.' },
  { key: 'P2', name: `AU047 Brass Lamp ${STAMP}`, cond: 'GOOD', price: 23456, orig: 28000,
    street: `Kariakoo AU047`, desc: 'AU-047 RW fixture two: lamp for the price-band probe.' },
  { key: 'P3', name: `AU047 Cedar Chest ${STAMP}`, cond: 'NEW', price: 98765, orig: 120000,
    street: `Sinza AU047`, desc: 'AU-047 RW fixture three: chest for the out-of-band probe.' },
  { key: 'P4', name: `AU047 Plain Mug ${STAMP}`, cond: 'NEW', price: 5000, orig: 6000,
    street: 'Mikocheni', desc: 'AU-047 RW control fixture: mug.' },
];

async function main() {
  const fx = { stamp: STAMP, nb: NB, products: [], emails: { seller: SELLER_EMAIL, buyer: BUYER_EMAIL, pw: PW } };

  for (const [k, e] of [['seller', SELLER_EMAIL], ['buyer', BUYER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU047', lastName: k === 'seller' ? 'Seller' : 'Buyer', password: PW, emailAddress: e });
    console.log(`register ${k}:`, reg.status);
    if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed ' + reg.status);
  }
  const stok = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  const btok = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.sellerToken = stok; fx.buyerToken = btok;
  const me = await L.api(stok, 'GET', '/api/v1/userManagement/user-details');
  const sellerId = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  fx.sellerId = sellerId;
  console.log('sellerId', sellerId);

  const atok = await L.apiLogin(L.ADMIN);
  const ver = await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.sellerId}/status`, { status: 'VERIFIED' });
  console.log('verify seller:', ver.status);

  const img = fs.readFileSync(path.join(__dirname, 'fixtures', 'receipt-proof.png'));

  for (const p of PRODUCTS) {
    const product = {
      productName: p.name,
      productQuantity: 3,
      categoryId: 1,
      subcategoryId: 2,
      productCountry: 'Tanzania',
      productRegion: 'Dar es Salaam',
      productStreet: p.street,
      productDescription: p.desc,
      currency: 'TZS',
      askingPrice: p.price,
      originalPrice: p.orig,
      condition: p.cond,
    };
    const form = new FormData();
    form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
    form.append('images', new Blob([img], { type: 'image/png' }), 'au047.png');
    const r = await fetch(`${L.API}/api/v1/products/post-product`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form,
    });
    const pj = await r.json().catch(() => null);
    if (r.status !== 201) throw new Error(`${p.key} create failed ${r.status} ${JSON.stringify(pj).slice(0, 200)}`);
    const pid = pj.productId || pj.id || (pj.product && (pj.product.productId || pj.product.id));
    console.log(p.key, 'created id=', pid);

    // logistics flip -> publicly visible; neighbourhood saved on the listing
    const logi = await L.api(atok, 'PATCH', `/api/v1/admin/products/${pid}/logistics`,
      { latitude: -6.8165, longitude: 39.2894, deliveryTransportMode: 'BODA', neighbourhood: NB });
    console.log(p.key, 'logistics:', logi.status, JSON.stringify(logi.json || {}).slice(0, 120));

    const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${pid}`);
    console.log(p.key, 'public:', det.status, det.json && det.json.productName, det.json && det.json.productCondition,
      det.json && det.json.productAskingPrice);
    fx.products.push({ key: p.key, productId: pid, name: p.name, cond: p.cond, price: p.price, street: p.street });
  }

  // Ground truth per criterion, computed the way the BACKEND resolves them (body binding)
  async function f(body) {
    const r = await fetch(`${L.API}/api/v1/displayItem/filter`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 0, size: 200, ...body }) });
    return { status: r.status, j: await r.json().catch(() => null) };
  }
  const gt = {};
  gt.unfiltered = (await f({})).j.totalElements;
  gt.likeNew = (await f({ conditionFilter: 'LIKE_NEW' })).j;
  gt.priceBand = (await f({ minPrice: 12000, maxPrice: 24000 })).j;
  gt.neighbourhood = (await f({ neighbourhood: NB })).j;
  gt.searchTerm = (await f({ searchTerm: String(STAMP) })).j;
  gt.community = (await f({ productSource: 'COMMUNITY' })).j;
  gt.shops = (await f({ productSource: 'SHOPS' })).j;
  for (const [k, v] of Object.entries(gt)) {
    if (v && v.content) {
      gt[k] = { totalElements: v.totalElements, ids: v.content.map(c => c.productId),
        hasMine: v.content.some(c => c.productId === fx.products[0].productId) };
      if (k === 'likeNew') gt[k].names = v.content.map(c => c.productName);
      if (k === 'priceBand') gt[k].prices = v.content.map(c => c.productAskingPrice);
      if (k === 'searchTerm') gt[k].names = v.content.map(c => c.productName);
      if (k === 'community') gt[k].sampleNames = v.content.slice(0, 5).map(c => c.productName);
    } else if (typeof v === 'number') gt[k] = { totalElements: v };
  }
  fx.groundTruth = gt;
  console.log('GROUND TRUTH', JSON.stringify(gt, null, 1));

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('FIXTURES OK ->', OUT);
}

main().catch(e => { console.error('SEED FATAL', e.message); process.exit(1); });
