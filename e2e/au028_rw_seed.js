// au028_rw_seed.js — RW-lane fixtures for AU-028 proforma_payload_price_guard,
// created ONLY through the REAL sandbox API (:8083).
// Creates: throwaway buyer (pinned default Home address + profile name/phone),
// throwaway VERIFIED seller owning TWO products:
//   P1 "AU028 Guard Tote <stamp>"  — TSh 15,000, choiceConfiguration Size L/S
//   P2 "AU028 Plain Mat <stamp>"   — TSh 24,500, no choices
// Both get admin logistics pins (BODA) so SELLER_DELIVERY quoting succeeds.
// Also proves (no-op mutation: same price written back) that the SELLER token can
// PATCH /api/v1/products/update/{id} — the lever the price-guard trip needs.
// Writes /tmp/au028_fixtures.json. Only mutates what this script creates.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const OUT = '/tmp/au028_fixtures.json';
const STAMP = Date.now();
const BUYER_EMAIL = `au028buyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au028seller${STAMP}@gmail.com`;
const PW = 'StrongPass!1';

function png(file) { return fs.readFileSync(path.join(__dirname, 'fixtures', file)); }

async function main() {
  const fx = { stamp: STAMP, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU028', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    console.log(`register ${k}:`, reg.status);
    if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed ' + JSON.stringify(reg.json).slice(0, 200));
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
  {
    const pf = new FormData();
    pf.append('profileInformationDTO', new Blob([JSON.stringify({ firstName: 'AU028First', lastName: 'AU028Last', whatsAppPhoneNumber: '+2557' + String(STAMP).slice(-9) })], { type: 'application/json' }), 'profile.json');
    const pr = await fetch(L.API + '/api/v1/userManagement/editProfile', { method: 'PATCH', headers: { Authorization: 'Bearer ' + btok }, body: pf });
    console.log('profile patch (multipart):', pr.status);
  }

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

  // P1: choice-configured tote @ 15,000 (price-guard victim)
  const p1 = {
    productName: `AU028 Guard Tote ${STAMP}`,
    productQuantity: 8,
    categoryId: 3,
    subcategoryId: 26,
    productCountry: 'Tanzania',
    productRegion: 'Dar es Salaam',
    productStreet: 'Mikocheni',
    productDescription: 'AU-028 RW fixture: proforma payload + authoritative-price-guard probe line.',
    currency: 'TZS',
    askingPrice: 15000,
    originalPrice: 18000,
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

  // P2: plain product @ 24,500
  const p2 = {
    productName: `AU028 Plain Mat ${STAMP}`,
    productQuantity: 5,
    categoryId: 3,
    subcategoryId: 26,
    productCountry: 'Tanzania',
    productRegion: 'Dar es Salaam',
    productStreet: 'Mikocheni',
    productDescription: 'AU-028 RW fixture: plain second line.',
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
    street: 'AU028 Home Street 9', city: 'Dar es Salaam', region: 'Dar es Salaam',
    country: 'Tanzania', label: 'Home', latitude: -6.7924, longitude: 39.2083,
    isDefault: true, phoneNumber: '+2557' + String(STAMP).slice(-9) });
  console.log('addr1(real pin):', a1.status);
  if (![200, 201].includes(a1.status)) throw new Error('addr1 failed ' + JSON.stringify(a1.json).slice(0, 200));

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

  // ---- REAL-API quote probe (ground truth for review totals) ----
  const q = await L.api(btok, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 },
    items: [{ productId: fx.productId1, quantity: 1 }, { productId: fx.productId2, quantity: 1 }] });
  console.log('QUOTE both-items:', q.status, JSON.stringify(q.json).slice(0, 260));
  fx.quoteStatus = q.status; fx.quote = q.json;

  // ---- PROVE a product-update lever exists for the price-guard trip ----
  // NO-OP probe: writes the SAME price back. Endpoint consumes multipart
  // (@RequestPart product / @RequestParam imageIds), so try form first.
  async function tryUpdate(tok, asForm) {
    let r;
    if (asForm) {
      const f = new FormData();
      f.append('product', new Blob([JSON.stringify({ askingPrice: fx.productId1Price })],
        { type: 'application/json' }), 'product.json');
      r = await fetch(`${L.API}/api/v1/products/update/${fx.productId1}`, {
        method: 'PATCH', headers: { Authorization: 'Bearer ' + tok }, body: f });
    } else {
      r = await fetch(`${L.API}/api/v1/products/update/${fx.productId1}`, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify({ askingPrice: fx.productId1Price }) });
    }
    const j = await r.text().catch(() => '');
    return { status: r.status, snippet: j.slice(0, 120) };
  }
  fx.updateLever = null;
  for (const [label, tok, asForm] of [
    ['seller-form', stok, true], ['seller-json', stok, false],
    ['admin-form', atok, true], ['admin-json', atok, false]]) {
    const res = await tryUpdate(tok, asForm);
    console.log(`update probe ${label}:`, res.status, res.snippet.replace(/\n/g, ' '));
    if ([200, 201, 204].includes(res.status)) { fx.updateLever = label; break; }
  }
  console.log('update lever:', fx.updateLever);

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('\nFIXTURES OK ->', OUT);
}
main().catch(e => { console.error('SEED FAIL', e); process.exit(1); });
