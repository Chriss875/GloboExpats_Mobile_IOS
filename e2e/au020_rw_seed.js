// au020_rw_seed.js — RW-lane fixtures for AU-020 through the REAL sandbox API (:8083).
// Creates: throwaway buyer account, seller account (own products not purchasable,
// so the buyer must be a different user), one product with TWO choice values on the
// SAME required attribute (so two different selections = two distinct cart lines),
// then flips deliverySetupReady via the admin repair endpoint.
// Writes /tmp/au020_fixtures.json. Only mutates what this script creates.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const OUT = '/tmp/au020_fixtures.json';
const STAMP = Date.now();
// NOTE: the sandbox backend rejects non-personal domains at register AND login
// (AuthService.ALLOWED_EMAIL_DOMAINS) — gmail.com is required for throwaway accounts.
const BUYER_EMAIL = `au020buyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au020seller${STAMP}@gmail.com`;
const PW = 'StrongPass!1';

function png(file) {
  // 1x1 PNG
  return fs.readFileSync(path.join(__dirname, 'fixtures', file));
}

async function main() {
  const fx = { stamp: STAMP, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };

  // 1) register both accounts (idempotent-ish: tolerate existing)
  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU020', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
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
  console.log('buyer userId', fx.buyer.userId, '| seller userId', fx.seller.userId);

  // New users register as verificationStatus=PENDING and post-product refuses
  // unverified sellers ("Seller not verified") — the sandbox admin (BUYER const,
  // ADMIN role) flips our seller to VERIFIED through the real admin endpoint.
  const atok = await L.apiLogin(L.ADMIN);
  fx.adminToken = atok;
  const ver = await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`,
    { status: 'VERIFIED' });
  console.log('verify seller:', ver.status, JSON.stringify(ver.json).slice(0, 140));

  // 2) create product with choices: Size attribute with TWO values (required BUTTONS)
  const product = {
    productName: `AU020 Two-Size Tote ${STAMP}`,
    productQuantity: 10,
    categoryId: 3,
    subcategoryId: 26, // Clothing > Accessories
    productCountry: 'Tanzania',
    productRegion: 'Dar es Salaam',
    productStreet: 'Masaki',
    productDescription: 'AU-020 RW fixture: same product, two selectable sizes -> must render as two distinct cart lines with independent selection.',
    currency: 'TZS',
    askingPrice: 12000,
    originalPrice: 15000,
    condition: 'NEW',
    // definitionId must be one of the subcategory's ACTIVE recommended
    // definitions (subcategory 26 Accessories allows Size=2, Design=4, Style=6,
    // Condition=18, Color=1, Pattern=5); labels must come from the Size
    // predefined values (XS..XXL) — custom labels are rejected.
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
  const img = png('receipt-proof.png');
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([img], { type: 'image/png' }), 'tote.png');

  const r = await fetch(`${L.API}/api/v1/products/post-product`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form,
  });
  const pj = await r.json().catch(() => null);
  console.log('post-product:', r.status, JSON.stringify(pj).slice(0, 300));
  if (r.status !== 201) throw new Error('product create failed');
  const pid = pj.productId || pj.id || (pj.product && (pj.product.productId || pj.product.id));
  fx.productId = pid;

  // 3) make it publicly visible via admin logistics repair
  const logi = await L.api(atok, 'PATCH', `/api/v1/admin/products/${pid}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Masaki' });
  console.log('logistics:', logi.status, JSON.stringify(logi.json));

  // 4) verify public visibility + echo back the real choice value ids
  const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${pid}`);
  console.log('public itemDetails:', det.status, det.json && det.json.productName);
  const attrs = (det.json && det.json.choiceConfiguration && det.json.choiceConfiguration.attributes) || [];
  const sizeAttr = attrs.find(a => a.name === 'Size') || attrs[0];
  fx.sizeDefId = sizeAttr && sizeAttr.definitionId;
  fx.values = ((sizeAttr && sizeAttr.values) || []).map(v => ({ id: v.id, label: v.label }));
  fx.askingPrice = det.json && det.json.productAskingPrice;
  fx.currency = det.json && det.json.productCurrency;
  fx.image = det.json && det.json.productImages && det.json.productImages[0];
  if (!det.json || det.status !== 200) throw new Error('product not publicly visible after logistics flip');

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('FIXTURES OK ->', OUT);
  console.log(JSON.stringify({ productId: pid, defId: fx.sizeDefId, values: fx.values, price: fx.askingPrice }));
}

main().catch(e => { console.error('SEED FATAL', e.message); process.exit(1); });
