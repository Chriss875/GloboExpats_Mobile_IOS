// au038_rw_seed6.js — RW fixture minting for AU-038 verify-r6 (fresh accounts, real API only).
// Chain proven end-to-end on the sandbox (API_MAP.md):
//   register -> post-product -> admin logistics -> add-address ->
//   checkout/proforma -> proformas/{id}/submit-payment -> admin proformas/{id}/confirm-payment
//   => AWAITING_SELLER_CONFIRMATION
// Vectors minted:
//   A  AWAITING_SELLER_CONFIRMATION   (banner + Confirm availability + decline(reason) UI)
//   B  ASC -> confirm-availability -> AWAITING_DELIVERY (mark-picked-up/delivered surface)
//   C  same as B but window YESTERDAY -> DISPATCH_TOO_EARLY probe target (T17)
//   D  B-chain continued via API to IN_TRANSIT (Mark delivered surface)
//   E  C-order after transporter+dispatch success (correct chain dispatch succeeds)
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au038_fixtures_r6.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';
const BUYER_EMAIL = `au038b${STAMP}@gmail.com`;
const SELLER_EMAIL = `au038s${STAMP}@gmail.com`;
// server clock is EAT (UTC+3); window dates are plain calendar days for the buyer's TZ
const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);

function png(file) { return fs.readFileSync(path.join(__dirname, 'fixtures', file)); }
async function postProduct(tok, product, file) {
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([png(file)], { type: 'image/png' }), file);
  const r = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: form });
  const j = await r.json().catch(() => null);
  return { status: r.status, json: j };
}

async function checkout(btok, productId, refTag, windowDate, slot) {
  const buyDetails = {
    firstName: 'AU038First', lastName: 'AU038Buyer', emailAddress: BUYER_EMAIL,
    phoneNumber: '+255713000444', address: 'AU038 Street 9', city: 'Dar es Salaam',
    state: 'Dar es Salaam', country: 'Tanzania', zipCode: '',
    deliveryMethod: "Seller's delivery", paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
    fulfillmentType: 'SELLER_DELIVERY', currency: 'TZS',
    latitude: -6.7924, longitude: 39.2083,
    preferredDeliveryWindows: [{ date: windowDate, slot }],
  };
  const pf = await L.api(btok, 'POST', '/api/v1/checkout/proforma', { buyDetails, items: [{ productId, quantity: 1 }] });
  if (![200, 201].includes(pf.status)) throw new Error('proforma failed ' + JSON.stringify(pf.json).slice(0, 250));
  const pj = pf.json || {};
  const sp = await L.api(btok, 'POST', `/api/v1/proformas/${pj.proformaId}/submit-payment`,
    { transactionReferences: [`AU038R6-${refTag}-${STAMP}`], paymentMethodType: 'MOBILE_MONEY' });
  if (![200, 201].includes(sp.status)) throw new Error('submit-payment failed ' + JSON.stringify(sp.json).slice(0, 250));
  const list = await L.api(btok, 'GET', '/api/v1/orders');
  const rows = Array.isArray(list.json) ? list.json : [];
  const mine = rows.filter(o => o.totalAmount === pj.grandTotal &&
    !rows.slice(0, rows.indexOf(o)).some(x => x.orderId === o.orderId));
  if (!mine.length) throw new Error('order not found after submit-payment');
  const o = mine[mine.length - 1];
  return { proformaId: pj.proformaId, grandTotal: pj.grandTotal, orderId: o.orderId, orderNumber: o.orderNumber };
}

async function snap(tok, orderId) {
  const d = await L.api(tok, 'GET', `/api/v1/orders/${orderId}`);
  const j = d.json || {};
  return { apiStatus: d.status, status: j.status, escrowPending: j.escrowPending,
    payoutStatus: j.payoutStatus, canDispatch: j.canDispatch,
    dispatchBlockedReason: j.dispatchBlockedReason, dispatchBlockers: j.dispatchBlockers,
    totalAmount: j.totalAmount, orderNumber: j.orderNumber,
    windows: (j.preferredDeliveryWindows || j.deliveryWindows || []).map(w => ({ date: w.date, slot: w.slot })),
    items: (j.items || []).map(i => i.productName || i.title) };
}

(async () => {
  const fx = { stamp: STAMP, buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU038R6', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    console.log(`register ${k}:`, reg.status);
    if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed ' + reg.status);
  }
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.seller.token = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  for (const [k, t] of [['buyer', fx.buyer.token], ['seller', fx.seller.token]]) {
    const me = await L.api(t, 'GET', '/api/v1/userManagement/user-details');
    fx[k].userId = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  }
  console.log('userIds', fx.buyer.userId, fx.seller.userId);

  const atok = await L.apiLogin(L.ADMIN);
  console.log('seller verified:', (await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' })).status);

  const product = {
    productName: `AU038 R6 Fulfil Probe Lamp ${STAMP}`,
    productQuantity: 5, categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: 'AU-038 r6 RW fixture: availability gate, pickup/deliver actions, dispatch guard.',
    currency: 'TZS', askingPrice: 18000, originalPrice: 22000, condition: 'NEW',
  };
  const pr = await postProduct(fx.seller.token, product, 'receipt-proof.png');
  console.log('post-product:', pr.status);
  if (pr.status !== 201) throw new Error('post-product failed ' + JSON.stringify(pr.json).slice(0, 250));
  fx.productId = pr.json.productId || pr.json.id || (pr.json.product && (pr.json.product.productId || pr.json.id));
  console.log('productId', fx.productId);
  console.log('logistics:', (await L.api(atok, 'PATCH', `/api/v1/admin/products/${fx.productId}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' })).status);
  const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${fx.productId}`);
  console.log('public itemDetails:', det.status, det.json && det.json.productName);
  console.log('addr:', (await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: 'AU038 Street 9', city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
    label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+255713000444' })).status);

  // ---- A: stays AWAITING_SELLER_CONFIRMATION (banner / confirm / decline vector)
  {
    const c = await checkout(fx.buyer.token, fx.productId, 'A', tomorrow(), 'AFTERNOON');
    fx.A = { ...c };
    const cp = await L.api(atok, 'POST', `/api/v1/admin/proformas/${c.proformaId}/confirm-payment`);
    if (![200, 201].includes(cp.status)) throw new Error('A confirm-payment ' + JSON.stringify(cp.json).slice(0, 200));
    fx.A.after = await snap(fx.seller.token, c.orderId);
    console.log('A:', fx.A.after.status, fx.A.orderNumber, 'total=' + fx.A.after.totalAmount);
  }
  // ---- B: ASC -> confirm-availability -> AWAITING_DELIVERY (tomorrow EVENING)
  {
    const c = await checkout(fx.buyer.token, fx.productId, 'B', tomorrow(), 'EVENING');
    fx.B = { ...c };
    await L.api(atok, 'POST', `/api/v1/admin/proformas/${c.proformaId}/confirm-payment`);
    const cf = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${c.orderId}/confirm-availability`);
    console.log('B confirm-availability:', cf.status);
    fx.B.confirmed = await snap(fx.seller.token, c.orderId);
    console.log('B:', fx.B.confirmed.status, fx.B.orderNumber, 'canDispatch=' + fx.B.confirmed.canDispatch,
      'blockers=' + JSON.stringify(fx.B.confirmed.dispatchBlockers), 'win=' + JSON.stringify(fx.B.confirmed.windows));
  }
  // ---- C: past window -> confirm -> DISPATCH_TOO_EARLY probe target (UI attempt)
  {
    const c = await checkout(fx.buyer.token, fx.productId, 'C', yesterday(), 'MORNING');
    fx.C = { ...c };
    await L.api(atok, 'POST', `/api/v1/admin/proformas/${c.proformaId}/confirm-payment`);
    console.log('C confirm-availability:', (await L.api(fx.seller.token, 'POST', `/api/v1/orders/${c.orderId}/confirm-availability`)).status);
    fx.C.confirmed = await snap(fx.seller.token, c.orderId);
    console.log('C:', fx.C.confirmed.status, fx.C.orderNumber, 'reason=' + fx.C.confirmed.dispatchBlockedReason,
      'blockers=' + JSON.stringify(fx.C.confirmed.dispatchBlockers), 'win=' + JSON.stringify(fx.C.confirmed.windows));
  }
  // ---- D: another tomorrow-window order confirmed then marked PICKED UP via API -> IN_TRANSIT
  {
    const c = await checkout(fx.buyer.token, fx.productId, 'D', tomorrow(), 'EVENING');
    fx.D = { ...c };
    await L.api(atok, 'POST', `/api/v1/admin/proformas/${c.proformaId}/confirm-payment`);
    await L.api(fx.seller.token, 'POST', `/api/v1/orders/${c.orderId}/confirm-availability`);
    let tp = await L.api(fx.seller.token, 'GET', '/api/v1/transporters/my');
    const tid = Array.isArray(tp.json) && tp.json.length ? (tp.json[0].transporterId ?? tp.json[0].id) : null;
    console.log('D transporters/my:', tp.status, 'count=', Array.isArray(tp.json) ? tp.json.length : typeof tp.json);
    if (tid != null) {
      const ta = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${c.orderId}/transporter`, { transporterId: tid });
      console.log('D assign-transporter:', ta.status, JSON.stringify(ta.json || {}).slice(0, 160));
    }
    fx.D.prePickup = await snap(fx.seller.token, c.orderId);
    const mp = await L.api(fx.seller.token, 'PATCH', `/api/v1/orders/${c.orderId}/mark-picked-up`);
    console.log('D mark-picked-up:', mp.status, JSON.stringify(mp.json || {}).slice(0, 160));
    fx.D.pickedUp = await snap(fx.seller.token, c.orderId);
    console.log('D now:', fx.D.pickedUp.status, fx.D.orderNumber, 'reason=' + fx.D.pickedUp.dispatchBlockedReason);
  }
  // ---- E: correct chain dispatch SUCCESS — reuse C (past window => no timing blocker),
  //         assign transporter via API, leave dispatch itself to the UI.
  {
    const c = fx.C;
    let tp = await L.api(fx.seller.token, 'GET', '/api/v1/transporters/my');
    const tid = Array.isArray(tp.json) && tp.json.length ? (tp.json[0].transporterId ?? tp.json[0].id) : null;
    console.log('E transporters/my:', tp.status, 'count=', Array.isArray(tp.json) ? tp.json.length : typeof tp.json);
    if (tid != null) {
      const ta = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${c.orderId}/transporter`, { transporterId: tid });
      console.log('E assign-transporter:', ta.status, JSON.stringify(ta.json || {}).slice(0, 160));
      fx.E = { orderId: c.orderId, orderNumber: c.orderNumber, transporterAssigned: ta.status };
      fx.E.ready = await snap(fx.seller.token, c.orderId);
      console.log('E ready-for-dispatch state:', fx.E.ready.status, 'canDispatch=' + fx.E.ready.canDispatch,
        'reason=' + fx.E.ready.dispatchBlockedReason, 'blockers=' + JSON.stringify(fx.E.ready.dispatchBlockers));
    } else {
      fx.E = { error: 'no transporter available from /transporters/my' };
      console.log('E SKIPPED (no transporter):', JSON.stringify(tp.json || {}).slice(0, 300));
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('\nFIXTURES OK ->', OUT);
})().catch(e => { console.error('SEED FAIL', e.message); process.exit(1); });
