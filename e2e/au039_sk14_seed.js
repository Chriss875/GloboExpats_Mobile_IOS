// au039_sk14_seed.js — SKEPTIC AU-039 fixtures, minted through the REAL sandbox API.
// Two orders advanced through the real escrow chain (admin confirm-payment -> seller
// confirm-availability -> transporter assign -> admin dispatch) so both sit IN_TRANSIT
// with a 6-digit deliveryCode. Prefix "au-039sk14" — no collision with other agents.
//   E = /tmp/au039sk14_E.json  buyer leg (self-confirm / regenerate / deadline)
//   F = /tmp/au039sk14_F.json  seller leg (wrong-code ladder + correct verify)
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const PW = 'StrongPass!1';
const STAMP = Date.now();
const PNG = fs.readFileSync(path.join(__dirname, 'fixtures', 'receipt-proof.png'));
const log = (...a) => console.log('[seed-sk14]', ...a);
const in48h = () => new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 10);

async function postProduct(tok, name) {
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify({
    productName: name, productQuantity: 3,
    categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: `AU-039 skeptic fixture ${STAMP} — throwaway sandbox row.`,
    currency: 'TZS', askingPrice: 15000, originalPrice: 18000, condition: 'NEW',
  }))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([PNG], { type: 'image/png' }), 'fixture.png');
  const r = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: form });
  const j = await r.json().catch(() => null);
  if (![200, 201].includes(r.status)) throw new Error('post-product failed ' + r.status);
  return j.productId || j.id || (j.product && (j.product.productId || j.id));
}

async function mintOrder(tag) {
  const email = `au-039sk14${tag}${STAMP}@gmail.com`;
  const bEmail = tag === 'b' ? email : `au-039sk14${tag}buyer${STAMP}@gmail.com`;
  const sEmail = tag === 'b' ? `au-039sk14${tag}seller${STAMP}@gmail.com` : email;
  for (const e of [bEmail, sEmail]) {
    await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'Sk14' + tag.toUpperCase(), lastName: e === bEmail ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
  }
  const btok = await L.apiLogin({ email: bEmail, pw: PW });
  const stok = await L.apiLogin({ email: sEmail, pw: PW });
  const atok = await L.apiLogin(L.ADMIN);
  const buid = (await L.api(btok, 'GET', '/api/v1/userManagement/user-details')).json.userId;
  const suid = (await L.api(stok, 'GET', '/api/v1/userManagement/user-details')).json.userId;
  log(tag, 'users', { buid, suid });
  const v1 = await L.api(atok, 'PATCH', `/api/v1/admin/users/${suid}/status`, { status: 'VERIFIED' });
  log(tag, 'verify-seller', v1.status);

  const pid = await postProduct(stok, `au-039sk14 ${tag.toUpperCase()} Grinder ${STAMP}`);
  log(tag, 'product', pid);
  log(tag, 'logistics', (await L.api(atok, 'PATCH', `/api/v1/admin/products/${pid}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' })).status);
  log(tag, 'addr', (await L.api(btok, 'POST', '/api/v1/add-address', {
    street: `au-039sk14 ${tag} Street 4`, city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
    label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+255713000777' })).status);

  const buyDetails = {
    firstName: 'Sk14' + tag.toUpperCase() + 'First', lastName: 'Skeptic', emailAddress: bEmail,
    phoneNumber: '+255713000777', address: `au-039sk14 ${tag} Street 4`, city: 'Dar es Salaam',
    state: 'Dar es Salaam', country: 'Tanzania', zipCode: '',
    deliveryMethod: "Seller's delivery", paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
    fulfillmentType: 'SELLER_DELIVERY', currency: 'TZS', latitude: -6.7924, longitude: 39.2083,
    preferredDeliveryWindows: [{ date: in48h(), slot: 'EVENING' }],
  };
  const before = new Set(((await L.api(btok, 'GET', '/api/v1/orders')).json || []).map(o => o.orderId));
  const pf = await L.api(btok, 'POST', '/api/v1/checkout/proforma', { buyDetails, items: [{ productId: pid, quantity: 1 }] });
  if (![200, 201].includes(pf.status)) throw new Error('proforma failed ' + pf.status);
  const sp = await L.api(btok, 'POST', `/api/v1/proformas/${pf.json.proformaId}/submit-payment`,
    { transactionReferences: [`SK14-${tag}-${STAMP}`], paymentMethodType: 'MOBILE_MONEY' });
  if (![200, 201].includes(sp.status)) throw new Error('submit-payment failed ' + sp.status);
  const rows = ((await L.api(btok, 'GET', '/api/v1/orders')).json || []);
  const fresh = rows.filter(o => !before.has(o.orderId));
  if (!fresh.length) throw new Error('order not found');
  const orderId = String(fresh[0].orderId);
  const d0 = await L.api(btok, 'GET', `/api/v1/orders/${orderId}`);
  log(tag, 'order', d0.json.orderNumber, d0.json.status);

  log(tag, 'mark-paid', (await L.api(atok, 'PATCH', `/api/v1/admin/orders/${orderId}/mark-paid`)).status);
  // seller confirms availability so escrow_pending clears and the order can be dispatched
  const av = await L.api(stok, 'POST', `/api/v1/orders/${orderId}/confirm-availability`, {});
  log(tag, 'confirm-availability', av.status);
  const tr = await L.api(stok, 'POST', '/api/v1/transporters', {
    fullName: `au-039sk14 Rider ${tag} ${STAMP}`, phoneNumber: '+255715000111', whatsAppPhoneNumber: '+255715000111',
    vehicleType: 'MOTORBIKE', plateNumber: `T1K${String(STAMP).slice(-5)}`, active: true });
  if (![200, 201].includes(tr.status)) throw new Error('transporter create failed');
  const transporterId = tr.json.transporterId;
  log(tag, 'assign', (await L.api(stok, 'POST', `/api/v1/orders/${orderId}/transporter`, { transporterId, note: 'sk14' })).status);
  const dp = await L.api(atok, 'POST', `/api/v1/orders/${orderId}/dispatch`);
  log(tag, 'dispatch(admin)', dp.status);
  if (![200, 201].includes(dp.status)) throw new Error('dispatch failed ' + JSON.stringify(dp.json));
  const od = await L.api(btok, 'GET', `/api/v1/orders/${orderId}`);
  if (!/^\d{6}$/.test(String(od.json.deliveryCode))) throw new Error('no delivery code after dispatch');
  return {
    tag, stamp: STAMP,
    buyer: { email: bEmail, pw: PW, token: btok, userId: buid },
    seller: { email: sEmail, pw: PW, token: stok, userId: suid },
    adminToken: atok, productId: pid, orderId, orderNumber: od.json.orderNumber, transporterId,
    afterDispatch: { status: od.json.status, deliveryCode: od.json.deliveryCode },
  };
}

(async () => {
  const E = await mintOrder('e');   // buyer leg
  const F = await mintOrder('f');   // seller leg
  fs.writeFileSync('/tmp/au039sk14_E.json', JSON.stringify(E, null, 2));
  fs.writeFileSync('/tmp/au039sk14_F.json', JSON.stringify(F, null, 2));
  console.log('\nSEED-SK14 OK | E:', E.orderNumber, E.afterDispatch.deliveryCode, '| F:', F.orderNumber, F.afterDispatch.deliveryCode);
})().catch(e => { console.error('SEED-SK14 FAIL:', e.message); process.exit(1); });
