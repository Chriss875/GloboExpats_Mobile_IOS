// au049_rw_seed_r7.js — RW-lane fixtures for AU-049 verify-r7 (filter sheet UI end-to-end).
// Creates through the REAL sandbox API (:8083): throwaway seller account, then THREE
// listings with machine-checkable criteria, all in Electronics cat 1:
//   P1 subcat Smart Phones(1)      LIKE_NEW TSh 13,500  neighbourhood "Kariakoo"
//   P2 subcat TVs & Displays(4)    NEW      TSh 45,000  neighbourhood "Oyster Bay"
//   P3 subcat Gaming Consoles(7)   GOOD     TSh 88,000  neighbourhood "Kariakoo"
// Ground truth recomputed LIVE via POST /displayItem/filter (body binding).
// Writes /tmp/au049_fixtures_r7.json. Mutates ONLY what this script creates.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const OUT = '/tmp/au049_fixtures_r7.json';
const STAMP = Date.now();
const SELLER_EMAIL = `au049seller${STAMP}@gmail.com`;
const PW = 'StrongPass!1';
const NB1 = 'Kariakoo', NB2 = 'Oyster Bay';

const PRODUCTS = [
  { key: 'P1', name: `AU049 Pixel Buds ${STAMP}`, cond: 'LIKE_NEW', price: 13500, orig: 16000,
    street: 'Kariakoo AU049', nb: NB1, cat: 1, sub: 1,
    desc: 'AU-049 RW fixture one: earbuds for condition+price+neighbourhood probe.' },
  { key: 'P2', name: `AU049 LG Monitor ${STAMP}`, cond: 'NEW', price: 45000, orig: 52000,
    street: 'Oyster Bay AU049', nb: NB2, cat: 1, sub: 4,
    desc: 'AU-049 RW fixture two: monitor for the Oyster Bay + subcategory probe.' },
  { key: 'P3', name: `AU049 Game Pad ${STAMP}`, cond: 'GOOD', price: 88000, orig: 99000,
    street: 'Kariakoo AU049', nb: NB1, cat: 1, sub: 7,
    desc: 'AU-049 RW fixture three: controller for the out-of-band probe.' },
];

async function main() {
  const fx = { stamp: STAMP, products: [], emails: { seller: SELLER_EMAIL, pw: PW } };

  const reg = await L.api(null, 'POST', '/api/v1/auth/register',
    { firstName: 'AU049', lastName: 'Seller', password: PW, emailAddress: SELLER_EMAIL });
  console.log('register seller:', reg.status);
  if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed ' + reg.status);

  const stok = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  fx.sellerToken = stok;
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
      productName: p.name, productQuantity: 3, categoryId: p.cat, subcategoryId: p.sub,
      productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: p.street,
      productDescription: p.desc, currency: 'TZS', askingPrice: p.price, originalPrice: p.orig,
      condition: p.cond,
    };
    const form = new FormData();
    form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
    form.append('images', new Blob([img], { type: 'image/png' }), 'au049.png');
    const r = await fetch(`${L.API}/api/v1/products/post-product`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form });
    const pj = await r.json().catch(() => null);
    if (r.status !== 201) throw new Error(`${p.key} create failed ${r.status} ${JSON.stringify(pj).slice(0, 200)}`);
    const pid = pj.productId || pj.id || (pj.product && (pj.product.productId || pj.product.id));
    console.log(p.key, 'created id=', pid);

    const logi = await L.api(atok, 'PATCH', `/api/v1/admin/products/${pid}/logistics`,
      { latitude: -6.8165, longitude: 39.2894, deliveryTransportMode: 'BODA', neighbourhood: p.nb });
    console.log(p.key, 'logistics:', logi.status, JSON.stringify(logi.json || {}).slice(0, 120));

    const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${pid}`);
    console.log(p.key, 'public:', det.status, det.json && det.json.productName, det.json && det.json.productCondition,
      det.json && det.json.productAskingPrice, 'sub=', det.json && det.json.subcategoryId);
    fx.products.push({ ...p, productId: pid });
  }

  // Ground truth per criterion, resolved the way the BACKEND binds them (body)
  async function f(body) {
    const r = await fetch(`${L.API}/api/v1/displayItem/filter`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 0, size: 200, ...body }) });
    return { status: r.status, j: await r.json().catch(() => null) };
  }
  const gt = {};
  gt.unfiltered = (await f({})).j.totalElements;
  gt.likeNew = (await f({ conditionFilter: 'LIKE_NEW' })).j;
  gt.priceBand_10k_50k = (await f({ minPrice: 10000, maxPrice: 50000 })).j;
  gt.nbKariakoo = (await f({ neighbourhood: NB1 })).j;
  gt.nbOysterBay = (await f({ neighbourhood: NB2 })).j;
  gt.community = (await f({ productSource: 'COMMUNITY' })).j.totalElements;
  gt.shops = (await f({ productSource: 'SHOPS' })).j.totalElements;
  gt.subSmartPhones = (await f({ subcategoryIds: [1] })).j;
  gt.subTVs = (await f({ subcategoryIds: [4] })).j;
  gt.searchTerm = (await f({ searchTerm: String(STAMP) })).j;

  const slim = v => v && v.content ? { totalElements: v.totalElements, ids: v.content.map(c => c.productId),
    names: v.content.slice(0, 6).map(c => c.productName),
    prices: v.content.map(c => c.productAskingPrice).slice(0, 12) } : v;
  const out = {};
  for (const [k, v] of Object.entries(gt)) out[k] = typeof v === 'number' ? { totalElements: v } : slim(v);
  fx.groundTruth = out;
  console.log('GROUND TRUTH', JSON.stringify(out, null, 1));

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('FIXTURES OK ->', OUT);
}

main().catch(e => { console.error('SEED FATAL', e.message); process.exit(1); });
