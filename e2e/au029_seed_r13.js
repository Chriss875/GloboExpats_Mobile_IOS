// au029_seed_r13.js — RW-lane fixture minting for AU-029 verify-r13 (REAL sandbox API :8083 only).
// Creates throwaway buyer + throwaway VERIFIED seller owning ONE plain product:
//   "AU029 R13 Selcom Lamp <stamp>" — TSh 12,500, no choices -> Add-to-cart needs no chip pick.
// Chain proven by au038_seed_r13: register -> post-product(+img) -> admin logistics ->
//   add-address(default Home). Browser then drives cart -> checkout step1 -> step2 -> step3.
// Also mints ONE real API proforma (PENDING_PAYMENT) purely as GROUND TRUTH for the
// proformaNumber shape (PF-YYYY-NNNNNN) and price math; cancelled again right after so the
// buyer has zero leftover pending rows before the browser run.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au029_fixtures_r13.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';
const BUYER_EMAIL = `au029r13b${STAMP}@gmail.com`;
const SELLER_EMAIL = `au029r13s${STAMP}@gmail.com`;
const dayPlus = n => new Date(Date.now() + n * 24 * 3600 * 1000).toISOString().slice(0, 10);
const log = (...a) => console.log('[seed-au029]', ...a);

function png(f) { return fs.readFileSync(path.join(__dirname, 'fixtures', f)); }

(async () => {
  const fx = { stamp: STAMP, build_sha: 'c6b4d61',
    buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU029R13', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
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
  log('userIds', fx.buyer.userId, fx.seller.userId);
  log('verify seller:', (await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' })).status);

  // profile prefill (checkout step 1 reads it)
  {
    const pf = new FormData();
    pf.append('profileInformationDTO', new Blob([JSON.stringify({
      firstName: 'AU029First', lastName: 'AU029Buyer', whatsAppPhoneNumber: '+2557' + String(STAMP).slice(-9)
    })], { type: 'application/json' }), 'profile.json');
    const pr = await fetch(L.API + '/api/v1/userManagement/editProfile',
      { method: 'PATCH', headers: { Authorization: 'Bearer ' + fx.buyer.token }, body: pf });
    log('profile patch:', pr.status);
  }

  const product = {
    productName: `AU029 R13 Selcom Lamp ${STAMP}`,
    productQuantity: 6, categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: 'AU-029 r13 RW fixture: payment method picker + Selcom receiving details on checkout step 3.',
    currency: 'TZS', askingPrice: 12500, originalPrice: 15000, condition: 'NEW',
  };
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([png('receipt-proof.png')], { type: 'image/png' }), 'lamp.png');
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
  log('public itemDetails:', det.status, fx.groundTruth.productName, 'TSh', fx.groundTruth.askingPrice, 'img', fx.groundTruth.image0);

  log('addr:', (await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: 'AU029R13 Street 7', city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
    label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+2557' + String(STAMP).slice(-9),
  })).status);

  // quote ground truth (what review totals must be built from)
  const q = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 },
    items: [{ productId: fx.productId, quantity: 1 }] });
  fx.quoteStatus = q.status; fx.quoteDeliveryTotal = q.json && q.json.deliveryTotal;
  fx.quoteMode = q.json && q.json.sellerGroups && q.json.sellerGroups[0] && q.json.sellerGroups[0].transportMode;
  log('quote:', q.status, 'deliveryTotal=TSh', fx.quoteDeliveryTotal, 'mode=', fx.quoteMode);

  // ---- GROUND TRUTH proforma via the REAL API (then cancel it) ----
  const buyDetails = {
    firstName: 'AU029First', lastName: 'AU029Buyer', emailAddress: BUYER_EMAIL,
    phoneNumber: '+2557' + String(STAMP).slice(-9), address: 'AU029R13 Street 7', city: 'Dar es Salaam',
    state: 'Dar es Salaam', country: 'Tanzania', zipCode: '',
    deliveryMethod: "Seller's delivery", paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
    fulfillmentType: 'SELLER_DELIVERY', currency: 'TZS', latitude: -6.7924, longitude: 39.2083,
    preferredDeliveryWindows: [{ date: dayPlus(2), slot: 'EVENING' }],
  };
  const pfr = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/proforma',
    { buyDetails, items: [{ productId: fx.productId, quantity: 1 }] });
  log('proforma:', pfr.status, JSON.stringify(pfr.json || {}).slice(0, 400));
  if (![200, 201].includes(pfr.status)) throw new Error('proforma failed');
  fx.apiProforma = {
    proformaId: pfr.json.proformaId, proformaNumber: pfr.json.proformaNumber,
    grandTotal: pfr.json.grandTotal, subtotal: pfr.json.subtotal ?? pfr.json.totalAmount,
    keys: Object.keys(pfr.json || {}),
  };
  const cxl = await L.api(fx.buyer.token, 'POST', `/api/v1/proformas/${fx.apiProforma.proformaId}/cancel`, {});
  log('cancel ground-truth proforma:', cxl.status);

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 1));
  log('\nFIXTURES OK ->', OUT, '| product', fx.productId, '| apiProforma', JSON.stringify(fx.apiProforma));
})().catch(e => { console.error('SEED FAIL', e.message); process.exit(1); });
