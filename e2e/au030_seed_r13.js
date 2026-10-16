// au030_seed_r13.js — RW-lane fixture minting for AU-030 verify-r13
//   (payment_proof_upload_submit_result) — REAL sandbox API :8083 ONLY.
// Creates throwaway buyer + throwaway VERIFIED seller owning ONE choice-configured product:
//   "AU030 R13 Proof Tote <stamp>" — TSh 15,000, Size L/S (choice needed to mirror the real
//   detail->cart path used by earlier AU-030 runs; plain products are covered in AU-029).
// Chain proven by au029_seed_r13: register -> post-product(+img) -> admin logistics ->
//   add-address(default Home). No rows outside what this script creates are touched.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au030_fixtures_r13.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';
const BUYER_EMAIL = `au030r13b${STAMP}@gmail.com`;
const SELLER_EMAIL = `au030r13s${STAMP}@gmail.com`;
const dayPlus = n => new Date(Date.now() + n * 24 * 3600 * 1000).toISOString().slice(0, 10);
const log = (...a) => console.log('[seed-au030]', ...a);
const png = f => fs.readFileSync(path.join(__dirname, 'fixtures', f));

(async () => {
  const fx = { stamp: STAMP, build_sha: 'c6b4d61',
    buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU030R13', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    log('register', k, reg.status);
    if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed ' + JSON.stringify(reg.json).slice(0, 160));
  }
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.seller.token = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  const atok = await L.apiLogin(L.ADMIN);
  fx.adminToken = atok;
  for (const [k, t] of [['buyer', fx.buyer.token], ['seller', fx.seller.token]]) {
    const me = await L.api(t, 'GET', '/api/v1/userManagement/user-details');
    fx[k].userId = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  }
  log('userIds buyer/seller:', fx.buyer.userId, fx.seller.userId);
  log('verify seller:', (await L.api(atok, 'PATCH',
    `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' })).status);

  // profile prefill (checkout step 1 reads it)
  {
    const pf = new FormData();
    pf.append('profileInformationDTO', new Blob([JSON.stringify({
      firstName: 'AU030First', lastName: 'AU030Buyer',
      whatsAppPhoneNumber: '+2557' + String(STAMP).slice(-9),
    })], { type: 'application/json' }), 'profile.json');
    const pr = await fetch(L.API + '/api/v1/userManagement/editProfile',
      { method: 'PATCH', headers: { Authorization: 'Bearer ' + fx.buyer.token }, body: pf });
    log('profile patch:', pr.status);
  }

  const product = {
    productName: `AU030 R13 Proof Tote ${STAMP}`,
    productQuantity: 8, categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: 'AU-030 r13 RW fixture: payment proof upload -> submit -> result walk on checkout step 3/4.',
    currency: 'TZS', askingPrice: 15000, originalPrice: 18000, condition: 'NEW',
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
  form.append('images', new Blob([png('receipt-proof.png')], { type: 'image/png' }), 'tote.png');
  const pr = await fetch(`${L.API}/api/v1/products/post-product`,
    { method: 'POST', headers: { Authorization: 'Bearer ' + fx.seller.token }, body: form });
  const pj = await pr.json().catch(() => null);
  log('post-product:', pr.status);
  if (pr.status !== 201) throw new Error('post-product failed ' + JSON.stringify(pj).slice(0, 240));
  fx.productId = pj.productId || pj.id || (pj.product && (pj.product.productId || pj.product.id));

  log('logistics:', (await L.api(atok, 'PATCH', `/api/v1/admin/products/${fx.productId}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' })).status);

  const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${fx.productId}`);
  fx.groundTruth = {
    status: det.status, productName: det.json && det.json.productName,
    askingPrice: det.json && det.json.productAskingPrice,
    image0: det.json && det.json.productImages && det.json.productImages[0],
    sellerName: det.json && det.json.sellerName,
  };
  log('public itemDetails:', det.status, fx.groundTruth.productName, 'TSh', fx.groundTruth.askingPrice, 'img', JSON.stringify(fx.groundTruth.image0));

  const attrs = (det.json.choiceConfiguration && det.json.choiceConfiguration.attributes) || [];
  const size = attrs.find(a => a.name === 'Size') || attrs[0];
  fx.sizeDefId = size && size.definitionId;
  fx.sizeValues = ((size && size.values) || []).map(v => ({ id: v.id, label: v.label }));
  log('size def/values:', fx.sizeDefId, JSON.stringify(fx.sizeValues));

  log('addr:', (await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: 'AU030R13 Street 5', city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
    label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true,
    phoneNumber: '+2557' + String(STAMP).slice(-9),
  })).status);

  // quote ground truth
  const q = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 },
    items: [{ productId: fx.productId, quantity: 1 }] });
  fx.quoteStatus = q.status;
  fx.quoteDeliveryTotal = q.json && q.json.deliveryTotal;
  fx.quoteMode = q.json && q.json.sellerGroups && q.json.sellerGroups[0] && q.json.sellerGroups[0].transportMode;
  log('quote:', q.status, 'deliveryTotal=TSh', fx.quoteDeliveryTotal, 'mode=', fx.quoteMode);

  // preflight: this fresh buyer must hold zero pending proformas (sanity)
  const mine = await L.api(fx.buyer.token, 'GET', '/api/v1/payments/my');
  const arr0 = Array.isArray(mine.json) ? mine.json : [];
  log('preflight proformas for fresh buyer:', arr0.length);
  if (arr0.length !== 0) throw new Error('fresh buyer already holds proformas — abort');

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 1));
  log('\nFIXTURES OK ->', OUT, '| product', fx.productId);
})().catch(e => { console.error('SEED FAIL', e.message); process.exit(1); });
