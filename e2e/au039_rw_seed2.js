// au039_rw_seed2.js — SECOND AU-039 fixture (order B) minted through the REAL sandbox API.
// Purpose: a clean IN_TRANSIT order to (a) prove the wrong-code x3 -> LOCKED contract on the
// server, (b) exercise the BUYER-side regenerate endpoint (only buyer/admin may call it —
// seller call was 403 FORBIDDEN on order A), then leave the order freshly regenerated +
// still IN_TRANSIT for the browser leg. Mutates ONLY what it creates.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au039_fixtures_b.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';
const BUYER_EMAIL = `au039bbuyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au039bseller${STAMP}@gmail.com`;
const png = f => fs.readFileSync(path.join(__dirname, 'fixtures', f));

async function postProduct(tok, product) {
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([png('receipt-proof.png')], { type: 'image/png' }), 'receipt-proof.png');
  const r = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: form });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const in48h = () => new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 10);
async function myOrders(tok) {
  const l = await L.api(tok, 'GET', '/api/v1/orders');
  return Array.isArray(l.json) ? l.json : [];
}

(async () => {
  const fx = { stamp: STAMP, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };
  const log = (...a) => console.log('[seedB]', ...a);

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU039B', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    log(`register ${k}:`, reg.status);
    if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed');
  }
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.seller.token = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  for (const [k, t] of [['buyer', fx.buyer.token], ['seller', fx.seller.token]]) {
    const me = await L.api(t, 'GET', '/api/v1/userManagement/user-details');
    fx[k].userId = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  }
  const atok = await L.apiLogin(L.ADMIN);
  log('verify seller:', (await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' })).status);

  const product = {
    productName: `AU039 Handoff Probe Blender ${STAMP}`,
    productQuantity: 3,
    categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: 'AU-039 RW fixture B: lockout + buyer regenerate contract.',
    currency: 'TZS', askingPrice: 21000, originalPrice: 25000, condition: 'NEW',
  };
  const pr = await postProduct(fx.seller.token, product);
  log('post-product:', pr.status);
  if (pr.status !== 201) throw new Error('post-product failed');
  fx.productId = pr.json.productId || pr.json.id || (pr.json.product && (pr.json.product.productId || pr.json.id));
  log('logistics:', (await L.api(atok, 'PATCH', `/api/v1/admin/products/${fx.productId}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' })).status);

  log('addr:', (await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: 'AU039B Street 5', city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
    label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+255713000777' })).status);

  const beforeIds = new Set((await myOrders(fx.buyer.token)).map(o => o.orderId));
  const buyDetails = {
    firstName: 'AU039BFirst', lastName: 'AU039BBuyer', emailAddress: BUYER_EMAIL,
    phoneNumber: '+255713000777', address: 'AU039B Street 5', city: 'Dar es Salaam',
    state: 'Dar es Salaam', country: 'Tanzania', zipCode: '',
    deliveryMethod: "Seller's delivery", paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
    fulfillmentType: 'SELLER_DELIVERY', currency: 'TZS', latitude: -6.7924, longitude: 39.2083,
    preferredDeliveryWindows: [{ date: in48h(), slot: 'MORNING' }],
  };
  const pf = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/proforma', { buyDetails, items: [{ productId: fx.productId, quantity: 1 }] });
  if (![200, 201].includes(pf.status)) throw new Error('proforma failed');
  const pj = pf.json;
  const sp = await L.api(fx.buyer.token, 'POST', `/api/v1/proformas/${pj.proformaId}/submit-payment`,
    { transactionReferences: [`AU039B${STAMP}`], paymentMethodType: 'MOBILE_MONEY' });
  if (![200, 201].includes(sp.status)) throw new Error('submit-payment failed');

  let orderId = null;
  for (let i = 0; i < 10 && !orderId; i++) {
    const fresh = (await myOrders(fx.buyer.token)).filter(o => !beforeIds.has(o.orderId)).map(o => o.orderId);
    if (fresh.length) orderId = String(fresh[0]); else await new Promise(r => setTimeout(r, 1200));
  }
  if (!orderId) throw new Error('order not found');
  fx.orderId = orderId;
  const d0 = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${orderId}`);
  fx.orderNumber = d0.json.orderNumber; fx.grandTotal = pj.grandTotal;
  log('order:', fx.orderNumber, d0.json.status);

  // advance: admin mark-paid (mints AWAITING_DELIVERY directly), transporter, admin dispatch
  log('mark-paid:', (await L.api(atok, 'PATCH', `/api/v1/admin/orders/${orderId}/mark-paid`)).status);
  const tr = await L.api(fx.seller.token, 'POST', '/api/v1/transporters',
    { fullName: `AU039 Rider B ${STAMP}`, phoneNumber: '+255715000111', whatsAppPhoneNumber: '+255715000111', vehicleType: 'MOTORBIKE', plateNumber: `T3B${String(STAMP).slice(-4)}`, active: true });
  if (![200, 201].includes(tr.status)) throw new Error('transporter create failed');
  fx.transporterId = tr.json.transporterId;
  const asg = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${orderId}/transporter`,
    { transporterId: fx.transporterId, proposedDeliveryTime: new Date(Date.now() + 3600e3).toISOString(), note: 'au039b' });
  log('assign:', asg.status);
  if (![200, 201].includes(asg.status)) throw new Error('assign failed');
  let dp = await L.api(atok, 'POST', `/api/v1/orders/${orderId}/dispatch`);
  log('dispatch(admin):', dp.status, JSON.stringify(dp.json || {}).slice(0, 140));
  if (![200, 201].includes(dp.status)) throw new Error('dispatch failed');

  const od = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${orderId}`);
  fx.afterDispatch = { status: od.json.status, deliveryCode: od.json.deliveryCode ?? null };
  if (!/^\d{6}$/.test(String(fx.afterDispatch.deliveryCode))) throw new Error('no code after dispatch');
  log('T18 fixture B ready:', fx.orderNumber, 'code', fx.afterDispatch.deliveryCode);

  // ---- LOCKOUT CONTRACT PROBE: three wrong codes as SELLER ----
  const probes = [];
  let lockedSeen = false, lastBody = null;
  for (let i = 1; i <= 4; i++) {
    const w = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${orderId}/verify-delivery`, { code: String(100000 + i * 7) });
    lastBody = w.json || {};
    probes.push({ attempt: i, http: w.status, body: lastBody });
    if (lastBody.message === 'DELIVERY_CODE_LOCKED' || /lock/i.test(lastBody.message || '')) { lockedSeen = true; break; }
  }
  fx.wrongCodeProbes = probes;
  fx.lockedAfterThree = lockedSeen;
  console.log('wrong-code ladder:', probes.map(p => `${p.attempt}:${p.http}:${p.body.message}${p.body.attemptsRemaining != null ? '(' + p.body.attemptsRemaining + ')' : ''}`).join(' | '));
  const R = [], FAILS = [];
  function ok3(name, cond, detail) {
    R.push({ name, pass: !!cond, detail: String(detail || '').slice(0, 200) });
    console.log((cond ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' :: ' + detail : ''));
    if (!cond) FAILS.push(name);
  }
  ok3('wrong-code-x3-then-LOCKED', lockedSeen, probes.map(p => p.http + ':' + (p.body.message || '')).join('|'));

  // ---- verify a correct code is ALSO rejected once locked ----
  if (lockedSeen) {
    const cv = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${orderId}/verify-delivery`, { code: fx.afterDispatch.deliveryCode });
    fx.lockedCorrectCodeProbe = { http: cv.status, body: cv.json };
    ok3('locked-correct-code-rejected-too', cv.status !== 200, JSON.stringify(cv.json || {}).slice(0, 120));
  }

  // ---- BUYER regenerate (the endpoint that must reset the lock) ----
  const rgSeller = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${orderId}/regenerate-delivery-code`);
  const rgBuyer = await L.api(fx.buyer.token, 'POST', `/api/v1/orders/${orderId}/regenerate-delivery-code`);
  fx.regenerate = { sellerCall: { http: rgSeller.status }, buyerCall: { http: rgBuyer.status, body: rgBuyer.json } };
  ok3('buyer-can-regenerate', [200, 201].includes(rgBuyer.status), JSON.stringify(rgBuyer.json || {}).slice(0, 160));
  const od2 = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${orderId}`);
  fx.codeAfterRegen = od2.json.deliveryCode ?? null;
  fx.statusAfterRegen = od2.json.status;
  ok3('regenerate-new-different-code-still-IN_TRANSIT-unlocked',
    /^\d{6}$/.test(String(fx.codeAfterRegen)) && fx.codeAfterRegen !== fx.afterDispatch.deliveryCode && fx.statusAfterRegen === 'IN_TRANSIT',
    `new=${fx.codeAfterRegen} old=${fx.afterDispatch.deliveryCode} status=${fx.statusAfterRegen}`);
  // unlocked proof: one more wrong code returns INVALID (not LOCKED)
  const postRg = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${orderId}/verify-delivery`, { code: '987650' });
  fx.postRegenWrongProbe = { http: postRg.status, body: postRg.json };
  ok3('after-regenerate-wrong-code-back-to-INVALID-not-LOCKED',
    postRg.json && postRg.json.message === 'INVALID_DELIVERY_CODE',
    JSON.stringify(postRg.json || {}).slice(0, 120));
  fs.writeFileSync(OUT, JSON.stringify({ ...fx, asserts: R, failures: FAILS }, null, 2));
  console.log('\nSEED-B OK ->', OUT, '| order', fx.orderNumber, '| code now', fx.codeAfterRegen, '| fails:', FAILS.join(',') || 'none');
})().catch(e => { console.error('SEED-B FAIL:', e.message); process.exit(1); });
