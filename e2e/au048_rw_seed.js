// au048_rw_seed.js — RW-lane fixtures for AU-048 (search paging/sort/tracking).
// Creates through the REAL sandbox API (:8083): one throwaway seller account, then
// 30 listings sharing a unique search token so a single searchTerm yields >24 hits
// (proves page accumulation past the 24/page boundary) with DISTINCT prices and
// clickCount values so client-side sort orders are machine-checkable.
// Writes /tmp/au048_fixtures.json. Mutates ONLY rows this script creates.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const OUT = '/tmp/au048_fixtures.json';
const STAMP = Date.now();
const SELLER_EMAIL = `au048seller${STAMP}@gmail.com`;
const PW = 'StrongPass!1';
const TOKEN = `AU048R7${STAMP}`; // shared search term across all 30 fixtures

// price asc, clickCount desc-ish variety, ratings varied — distinct on every axis
const N = 30;
const products = [];
for (let i = 0; i < N; i++) {
  products.push({
    key: `P${String(i).padStart(2, '0')}`,
    name: `${TOKEN} Probe Widget ${i}`,
    cond: ['NEW', 'LIKE_NEW', 'GOOD'][i % 3],
    // prices scattered non-monotonically so asc/desc sorts are provable
    price: [5000, 91000, 24000, 13000, 66000, 8000, 45000, 12000, 77000, 30000,
            7000, 55000, 20000, 99000, 15000, 6000, 40000, 25000, 85000, 11000,
            9000, 48000, 22000, 72000, 16000, 58000, 35000, 1000 + i * 3, 44000, 62000][i],
    orig: null,
    ratingSeed: i % 5,
  });
}

(async () => {
  const fx = { stamp: STAMP, token: TOKEN, email: SELLER_EMAIL, pw: PW, products: [], groundTruth: {} };

  const reg = await L.api(null, 'POST', '/api/v1/auth/register',
    { firstName: 'AU048', lastName: 'Seller', password: PW, emailAddress: SELLER_EMAIL });
  console.log('register seller:', reg.status);
  if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed ' + reg.status);

  const stok = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  const me = await L.api(stok, 'GET', '/api/v1/userManagement/user-details');
  const sellerId = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  fx.sellerId = sellerId;
  console.log('sellerId', sellerId);

  const atok = await L.apiLogin(L.ADMIN);
  const ver = await L.api(atok, 'PATCH', `/api/v1/admin/users/${sellerId}/status`, { status: 'VERIFIED' });
  console.log('verify seller:', ver.status);

  const img = fs.readFileSync(path.join(__dirname, 'fixtures', 'receipt-proof.png'));
  for (let i = 0; i < products.length; i++) { const p = products[i];
    const product = {
      productName: p.name,
      productQuantity: 5,
      categoryId: 1,
      subcategoryId: 2,
      productCountry: 'Tanzania',
      productRegion: 'Dar es Salaam',
      productStreet: 'Mikocheni AU048',
      productDescription: `AU-048 r7 fixture ${p.key}: search paging/sort/tracking probe.`,
      currency: 'TZS',
      askingPrice: p.price,
      originalPrice: Math.round(p.price * 1.2),
      condition: p.cond,
    };
    const form = new FormData();
    form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
    form.append('images', new Blob([img], { type: 'image/png' }), 'au048.png');
    const r = await fetch(`${L.API}/api/v1/products/post-product`,
      { method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form });
    const pj = await r.json().catch(() => null);
    if (r.status !== 201) throw new Error(`${p.key} create failed ${r.status} ${JSON.stringify(pj).slice(0, 200)}`);
    const pid = pj.productId || pj.id || (pj.product && (pj.product.productId || pj.product.id));
    const logi = await L.api(atok, 'PATCH', `/api/v1/admin/products/${pid}/logistics`,
      { latitude: -6.8165, longitude: 39.2894, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' });
    // clickCount is what Trending sorts by; set a distinct value per fixture
    const cc = await L.api(atok, 'PATCH', `/api/v1/admin/products/${pid}/logistics`,
      { latitude: -6.8165, longitude: 39.2894, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni', clickCount: (N - i) * 7 });
    const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${pid}`);
    const ccVal = det.json && (det.json.clickCount ?? det.json.productClickCount);
    console.log(p.key, 'id=', pid, 'price=', p.price, 'logistics=', logi.status, 'clickCount=', cc.status, 'public cc=', ccVal,
      det.status !== 200 ? ('PUBFAIL ' + det.status) : det.json && det.json.productName);
    fx.products.push({ key: p.key, productId: pid, name: p.name, cond: p.cond, price: p.price, clickCount: ccVal });
  }

  // Ground truth via BODY-bound filter (the way the fixed app calls it)
  async function f(body) {
    const r = await fetch(`${L.API}/api/v1/displayItem/filter`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, j: await r.json().catch(() => null) };
  }
  const all = [];
  for (let pg = 0; pg < 4; pg++) {
    const r = await f({ searchTerm: TOKEN, page: pg, size: 12 });
    if (!r.j || !r.j.content) break;
    all.push(...r.j.content.map(c => ({ productId: c.productId, name: c.productName, price: c.productAskingPrice })));
    if (r.j.last) break;
  }
  fx.groundTruth.searchTotal = (await f({ searchTerm: TOKEN, page: 0, size: 12 })).j.totalElements;
  fx.groundTruth.wireNames = all.map(x => x.name);
  fx.groundTruth.wireIds = all.map(x => x.productId);
  fx.groundTruth.wirePrices = all.map(x => x.price);
  fx.groundTruth.uniqueIds = new Set(fx.groundTruth.wireIds).size;
  fx.groundTruth.zeroTerm = 'qqzzxx99r7miss';
  const z = await f({ searchTerm: fx.groundTruth.zeroTerm, page: 0, size: 24 });
  fx.groundTruth.zeroTotal = z.j.totalElements;
  console.log('GROUND TRUTH', JSON.stringify(fx.groundTruth, null, 1));
  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('FIXTURES OK ->', OUT);
})().catch(e => { console.error('SEED FAILED', e); process.exit(1); });
