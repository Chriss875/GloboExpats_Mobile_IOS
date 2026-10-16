// au038_seed_r13.js — RW fixture minting for AU-038 verify-r13 (fresh accounts, REAL API only).
// Focus: the decline-reason-required fix cc31ae6 is IN the frozen :9131 bundle for the first time.
// Vectors per viewport (mobile + tablet get their OWN set so each viewport drives every transition):
//   gate      AWAITING_SELLER_CONFIRMATION (banner + Confirm availability + Can't fulfil)
//   decline   AWAITING_SELLER_CONFIRMATION (empty-reason block, then reason -> CANCELLED+REFUND_PENDING)
//   pickup    BUYER_PICKUP confirmed -> AWAITING_PICKUP (Mark picked up -> Mark delivered)
//   tooearly  SELLER_DELIVERY confirmed + transporter -> READY_FOR_DISPATCH canDispatch=false
// Chain (API_MAP.md, proven): register -> post-product -> admin logistics -> add-address ->
//   checkout/proforma -> proformas/{id}/submit-payment -> admin proformas/{id}/confirm-payment
//   => AWAITING_SELLER_CONFIRMATION.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au038_fixtures_r13.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';
const BUYER_EMAIL = `au038r13b${STAMP}@gmail.com`;
const SELLER_EMAIL = `au038r13s${STAMP}@gmail.com`;
// server clock is EAT (UTC+3); windows are plain calendar days for the buyer's TZ
const dayPlus = n => new Date(Date.now() + n * 24 * 3600 * 1000).toISOString().slice(0, 10);

function png(file) { return fs.readFileSync(path.join(__dirname, 'fixtures', file)); }
async function postProduct(tok, product, file) {
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([png(file)], { type: 'image/png' }), file);
  const r = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: form });
  return { status: r.status, json: await r.json().catch(() => null) };
}

async function snap(tok, orderId) {
  const d = await L.api(tok, 'GET', `/api/v1/orders/${orderId}`);
  const j = d.json || {};
  return { apiStatus: d.status, status: j.status, escrowPending: j.escrowPending, payoutStatus: j.payoutStatus,
    refundStatus: j.refundStatus, refundAmount: j.refundAmount, canDispatch: j.canDispatch,
    dispatchBlockedReason: j.dispatchBlockedReason, dispatchBlockers: j.dispatchBlockers,
    totalAmount: j.totalAmount, currency: j.currency, orderNumber: j.orderNumber,
    cancellationReason: j.cancellationReason,
    windows: (j.preferredDeliveryWindows || []).map(w => ({ date: w.date, slot: w.slot })),
    items: (j.items || []).map(i => i.productName || i.title),
    sellerName: j.sellerName };
}
const log = (...a) => console.log('[seed-r13]', ...a);

async function checkout(btok, productId, tag, fulfillmentType, windowDate, slot) {
  const buyDetails = {
    firstName: 'AU038R13First', lastName: 'AU038R13Buyer', emailAddress: BUYER_EMAIL,
    phoneNumber: '+255713001333', address: 'AU038R13 Street 5', city: 'Dar es Salaam',
    state: 'Dar es Salaam', country: 'Tanzania', zipCode: '',
    deliveryMethod: fulfillmentType === 'BUYER_PICKUP' ? 'Pickup' : "Seller's delivery",
    paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
    fulfillmentType, currency: 'TZS',
    latitude: -6.7924, longitude: 39.2083,
    preferredDeliveryWindows: [{ date: windowDate, slot }],
  };
  const pf = await L.api(btok, 'POST', '/api/v1/checkout/proforma', { buyDetails, items: [{ productId, quantity: 1 }] });
  if (![200, 201].includes(pf.status)) throw new Error(`proforma ${tag} failed ${pf.status} ${JSON.stringify(pf.json).slice(0, 220)}`);
  const pj = pf.json || {};
  const sp = await L.api(btok, 'POST', `/api/v1/proformas/${pj.proformaId}/submit-payment`,
    { transactionReferences: [`AU038R13-${tag}-${STAMP}`], paymentMethodType: 'MOBILE_MONEY' });
  if (![200, 201].includes(sp.status)) throw new Error(`submit-payment ${tag} failed ${JSON.stringify(sp.json).slice(0, 220)}`);
  // newest buyer order not seen before this checkout
  const list = await L.api(btok, 'GET', '/api/v1/orders');
  const rows = Array.isArray(list.json) ? list.json : [];
  const o = rows.find(x => x.totalAmount === pj.grandTotal);
  if (!o) throw new Error(`order ${tag} not found (grandTotal ${pj.grandTotal})`);
  return { proformaId: pj.proformaId, grandTotal: pj.grandTotal, orderId: String(o.orderId), orderNumber: o.orderNumber, fulfillmentType };
}

(async () => {
  const fx = { stamp: STAMP, build_sha: 'c6b4d61', buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };

  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU038R13', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    log(`register ${k}:`, reg.status);
    if (![200, 201, 400, 409].includes(reg.status)) throw new Error('register failed ' + JSON.stringify(reg.json).slice(0, 150));
  }
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.seller.token = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  for (const [k, t] of [['buyer', fx.buyer.token], ['seller', fx.seller.token]]) {
    const me = await L.api(t, 'GET', '/api/v1/userManagement/user-details');
    fx[k].userId = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  }
  log('userIds', fx.buyer.userId, fx.seller.userId);
  const atok = await L.apiLogin(L.ADMIN);
  log('seller verified:', (await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' })).status);

  const product = {
    productName: `AU038 R13 Fulfil Gate Lamp ${STAMP}`,
    productQuantity: 8, categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: 'AU-038 r13 RW fixture: availability gate, decline-reason-required, pickup/deliver actions, dispatch blocker explainer.',
    currency: 'TZS', askingPrice: 19000, originalPrice: 24000, condition: 'NEW',
  };
  const pr = await postProduct(fx.seller.token, product, 'receipt-proof.png');
  log('post-product:', pr.status);
  if (pr.status !== 201) throw new Error('post-product failed ' + JSON.stringify(pr.json).slice(0, 220));
  fx.productId = pr.json.productId || pr.json.id || (pr.json.product && (pr.json.product.productId || pr.json.id));
  log('logistics:', (await L.api(atok, 'PATCH', `/api/v1/admin/products/${fx.productId}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' })).status);
  const det = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${fx.productId}`);
  log('public itemDetails:', det.status, det.json && det.json.productName);
  log('addr:', (await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: 'AU038R13 Street 5', city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
    label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+255713001333' })).status);

  async function mint(tag, ft, winDate, slot, opts = {}) {
    const c = await checkout(fx.buyer.token, fx.productId, tag, ft, winDate, slot);
    const cp = await L.api(atok, 'POST', `/api/v1/admin/proformas/${c.proformaId}/confirm-payment`);
    if (![200, 201].includes(cp.status)) throw new Error(`${tag} confirm-payment ${JSON.stringify(cp.json).slice(0, 200)}`);
    const s0 = await snap(fx.seller.token, c.orderId);
    log(`${tag}:`, c.orderNumber, s0.status, 'total=' + s0.totalAmount, ft);
    const v = { ...c, initial: s0 };
    if (opts.confirm) {
      const cf = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${c.orderId}/confirm-availability`);
      log(`${tag} confirm-availability:`, cf.status);
      v.afterConfirm = await snap(fx.seller.token, c.orderId);
      log(`${tag} afterConfirm:`, v.afterConfirm.status, 'canDispatch=' + v.afterConfirm.canDispatch,
        'reason=' + v.afterConfirm.dispatchBlockedReason, 'blockers=' + JSON.stringify(v.afterConfirm.dispatchBlockers));
    }
    return v;
  }

  fx.vectors = {};
  for (const vp of ['mobile', 'tablet']) {
    fx.vectors[vp] = {
      gate: await mint(`GATE-${vp}`, 'SELLER_DELIVERY', dayPlus(2), 'EVENING'),
      decline: await mint(`DECLINE-${vp}`, 'SELLER_DELIVERY', dayPlus(2), 'AFTERNOON'),
      pickup: await mint(`PICKUP-${vp}`, 'BUYER_PICKUP', dayPlus(2), 'EVENING', { confirm: true }),
      tooearly: await mint(`TOOEARLY-${vp}`, 'SELLER_DELIVERY', dayPlus(2), 'MORNING', { confirm: true }),
    };
    // tooearly: assign a freshly-minted transporter via the real API so the only remaining
    // blocker is timing (READY_FOR_DISPATCH + canDispatch=false).
    const tr = await L.api(fx.seller.token, 'POST', '/api/v1/transporters',
      { fullName: `AU038 Rider R13 ${vp} ${STAMP}`, phoneNumber: '+255715001111', whatsAppPhoneNumber: '+255715001111',
        vehicleType: 'MOTORBIKE', plateNumber: `T13${String(STAMP).slice(-4)}${vp === 'mobile' ? 'M' : 'T'}`, active: true });
    log(`${vp} transporter create:`, tr.status, tr.json && tr.json.transporterId);
    fx.vectors[vp].tooearly.transporterId = tr.json && tr.json.transporterId;
    if (tr.json && tr.json.transporterId != null) {
      const ta = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${fx.vectors[vp].tooearly.orderId}/transporter`,
        { transporterId: tr.json.transporterId, note: 'au038 r13 too-early vector' });
      log(`${vp} assign-transporter:`, ta.status, JSON.stringify(ta.json || {}).slice(0, 140));
    }
    fx.vectors[vp].tooearly.final = await snap(fx.seller.token, fx.vectors[vp].tooearly.orderId);
    log(`${vp} tooearly final:`, fx.vectors[vp].tooearly.final.status,
      'canDispatch=' + fx.vectors[vp].tooearly.final.canDispatch,
      'reason=' + fx.vectors[vp].tooearly.final.dispatchBlockedReason,
      'blockers=' + JSON.stringify(fx.vectors[vp].tooearly.final.dispatchBlockers),
      'win=' + JSON.stringify(fx.vectors[vp].tooearly.final.windows));
  }

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  log('\nFIXTURES OK ->', OUT);
})().catch(e => { console.error('SEED FAIL', e.message); process.exit(1); });
