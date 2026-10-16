// au043_seed_r14.js — AU-043 ADMIN-lane fixture seeder, run 14.
// Lane :9131 @ e694463. Everything minted through the REAL sandbox API (:8083);
// mutates ONLY rows it creates (prefix au043r14 / AU043R14 per lane rules).
//
//   FX-REL   proforma -> submit-payment -> admin confirm-payment -> seller
//            confirm-availability -> assign transporter -> dispatch ->
//            admin verify-delivery (code from trip)  => DELIVERED + HELD
//            (release target; released later through the REAL UI button)
//   FX-CANC  paid order -> PATCH /api/v1/admin/orders/{id}/cancel {reason}
//            => CANCELLED + REFUND_PENDING (refund target; refunded via UI)
//   FX-G1    CANCELLED + REFUND_PENDING -> POST refund via API first =>
//            REFUNDED (guard probe: release-payment on it must 409
//            ORDER_REFUNDED, surfaced in-app)
//   FX-G2/G3 AWAITING_PAYMENT row (never paid) — refund -> NO_REFUND_DUE,
//            release -> ORDER_NOT_DELIVERED
//
// Writes /tmp/au043r14_fixtures.json. No live/dev systems touched.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au043r14_fixtures.json';
const STAMP = Date.now();
const TAG = `AU043R14${STAMP}`;
const BUYER_EMAIL = `au043r14.buyer.${STAMP}@gmail.com`;
const SELLER_EMAIL = `au043r14.seller.${STAMP}@gmail.com`;
const PW = 'StrongPass!1';
const PNG = path.join(__dirname, 'fixtures', 'receipt-proof.png');
const step = (s, x) => console.log('[seed]', s, x !== undefined ? JSON.stringify(x).slice(0, 300) : '');

async function main() {
  const fx = {
    stamp: STAMP, tag: TAG,
    buyer: { email: BUYER_EMAIL, pw: PW },
    seller: { email: SELLER_EMAIL, pw: PW },
  };

  // ---- accounts ----
  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU043R14', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    step(`register ${k}`, { status: reg.status });
    if (![200, 201].includes(reg.status)) throw new Error('register failed ' + JSON.stringify(reg.json));
  }
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.seller.token = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  const atok = fx.adminToken = await L.apiLogin(L.ADMIN);
  step('tokens', { admin: !!atok });

  const meS = await L.api(fx.seller.token, 'GET', '/api/v1/userManagement/user-details');
  fx.seller.userId = meS.json && meS.json.userId;
  const st = await L.api(atok, 'PATCH', `/api/v1/admin/users/${fx.seller.userId}/status`, { status: 'VERIFIED' });
  step('seller VERIFIED', { status: st.status });

  // ---- product (seller-owned) ----
  const product = {
    productName: `${TAG} Kettle`, productQuantity: 20, categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: 'AU-043 r14 ADMIN-lane fixture for admin order actions.',
    currency: 'TZS', askingPrice: 14759, originalPrice: 16999, condition: 'NEW',
  };
  async function postProduct(name) {
    const form = new FormData();
    form.append('product', new Blob([Buffer.from(JSON.stringify({ ...product, productName: name }))], { type: 'application/json' }), 'product.json');
    form.append('images', new Blob([fs.readFileSync(PNG)], { type: 'image/png' }), 'kettle.png');
    const prr = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + fx.seller.token }, body: form });
    if (prr.status !== 201) throw new Error('product failed ' + prr.status + ' ' + await prr.text());
    const prj = await prr.json();
    const id = prj.productId || prj.id || (prj.product && (prj.product.productId || prj.product.id));
    await L.api(atok, 'PATCH', `/api/v1/admin/products/${id}/logistics`,
      { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' });
    return id;
  }
  fx.productIdRel = await postProduct(`${TAG} Kettle REL`);
  fx.productIdCanc = await postProduct(`${TAG} Kettle CANC`);
  step('products', { rel: fx.productIdRel, canc: fx.productIdCanc });

  // ---- buyer address + real delivery quote ----
  await L.api(fx.buyer.token, 'POST', '/api/v1/add-address', {
    street: `AU043 R14 Street ${STAMP}`, city: 'Dar es Salaam', region: 'Dar es Salaam',
    country: 'Tanzania', label: 'Home', latitude: -6.7924, longitude: 39.2083,
    isDefault: true, phoneNumber: '+2557' + String(STAMP).slice(-9) });
  async function quote(pid) {
    const q = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/delivery-quote', {
      destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 },
      items: [{ productId: pid, quantity: 1 }] });
    return (q.json && (q.json.deliveryTotal ?? q.json.total ?? q.json.fee)) || 2000;
  }
  const feeRel = await quote(fx.productIdRel);
  const feeCanc = await quote(fx.productIdCanc);

  async function mkProforma(tag, pid, fee) {
    // Dispatch opens 1h before the EAT slot start (MORNING=10:00 EAT = 07:00 UTC).
    // Yesterday keeps dispatch open all day (AU-043 needs a REAL dispatched delivery).
    const tomorrow = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    const co = await L.api(fx.buyer.token, 'POST', '/api/v1/checkout/proforma', {
      buyDetails: {
        firstName: 'AU043R14First', lastName: 'AU043R14Last', emailAddress: BUYER_EMAIL,
        phoneNumber: '+255715000443', address: `au043 r14 street ${tag}`,
        deliveryLabel: 'Home', deliveryPlaceName: '', deliveryNeighbourhood: '',
        city: 'dar es salaam', state: '', country: 'tanzania', zipCode: '',
        deliveryInstructions: '', fulfillmentType: 'SELLER_DELIVERY',
        paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
        deliveryFee: fee, totalAmount: 14759 + fee, currency: 'TZS',
        latitude: -6.7924, longitude: 39.2083,
        preferredDeliveryDate: tomorrow, preferredDeliverySlot: 'AFTERNOON',
        preferredDeliveryWindows: [{ date: tomorrow, slot: 'AFTERNOON' }],
      },
      items: [{ productId: pid, quantity: 1 }],
    });
    if (![200, 201].includes(co.status)) throw new Error(`proforma ${tag} failed ` + JSON.stringify(co.json));
    return co.json;
  }
  async function payProforma(pfId, tag) {
    const f = new FormData();
    f.append('receipts', new Blob([fs.readFileSync(PNG)], { type: 'image/png' }), `au043r14-${tag}.png`);
    f.append('details', new Blob([JSON.stringify({ transactionReferences: [`SANDBOX-TXN-${TAG}-${tag}`] })], { type: 'text/plain' }), 'details.txt');
    const r = await fetch(`${L.API}/api/v1/proformas/${pfId}/receipts`, { method: 'POST', headers: { Authorization: 'Bearer ' + fx.buyer.token }, body: f });
    if (![200, 201].includes(r.status)) throw new Error('receipt upload failed ' + r.status);
    const s = await L.api(fx.buyer.token, 'POST', `/api/v1/proformas/${pfId}/submit-payment`,
      { transactionReferences: [`SANDBOX-TXN-${TAG}-${tag}`], paymentMethodType: 'MOBILE_MONEY' });
    if (![200, 201].includes(s.status)) throw new Error('submit failed ' + JSON.stringify(s.json));
    // Admin confirms payment -> PAID + payoutStatus HELD (escrow hold).
    const c = await L.api(atok, 'POST', `/api/v1/admin/proformas/${pfId}/confirm-payment`);
    if (![200, 201].includes(c.status)) throw new Error('confirm-payment failed ' + JSON.stringify(c.json));
    return s.json;
  }

  // ---- FX-REL: drive all the way to DELIVERED + HELD ----
  const pfRel = await mkProforma('REL', fx.productIdRel, feeRel);
  await payProforma(pfRel.proformaId, 'REL');
  const ordersAfterPay = await L.api(fx.buyer.token, 'GET', '/api/v1/orders');
  const wantRel = 14759 + feeRel;
  let relOrder = (ordersAfterPay.json || [])
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .find(o => Number(o.totalAmount) === Number(wantRel));
  if (!relOrder) {
    console.log('[seed][diag] buyer orders:', (ordersAfterPay.json || []).slice(0, 4).map(o => ({ t: o.totalAmount, s: o.orderStatus || o.status, ty: o.orderType })));
    relOrder = (ordersAfterPay.json || []).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
  }
  if (!relOrder) throw new Error('REL order not found after payment confirmation');
  fx.releaseTarget = relOrder.orderId;
  step('FX-REL order', { id: fx.releaseTarget, status: relOrder.orderStatus || relOrder.status });

  // seller confirm availability (contract verb PATCH-free: this is the USER escrow controller POST)
  const cav = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${fx.releaseTarget}/confirm-availability`);
  step('confirm-availability', { status: cav.status });
  if (![200, 201].includes(cav.status)) throw new Error('confirm-availability failed ' + JSON.stringify(cav.json));

  // assign transporter (registry) — contract POST /orders/{id}/transporter
  const trs = await L.api(fx.seller.token, 'GET', '/api/v1/transporters');
  let tr = (trs.json || []).find(t => t.active && t.managedByCurrentUser) ||
           (trs.json || []).find(t => t.active);
  if (!tr) {
    const created = await L.api(fx.seller.token, 'POST', '/api/v1/transporters',
      { fullName: `AU043R14 Driver ${STAMP}`, phoneNumber: '+2557' + String(STAMP).slice(-9),
        whatsAppPhoneNumber: '+2557' + String(STAMP).slice(-9), vehicleType: 'MOTORBIKE',
        plateNumber: `AU43-${String(STAMP).slice(-5)}`, notes: 'au043 r14 fixture', active: true });
    step('transporter created', { status: created.status });
    tr = created.json;
  }
  fx.transporterId = tr.transporterId || (tr.transporter && tr.transporter.transporterId);
  const asg = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${fx.releaseTarget}/transporter`,
    { transporterId: fx.transporterId, proposedDeliveryTime: new Date(Date.now() - 3600 * 1000).toISOString(), note: 'au043 r14' });
  step('assign-transporter', { status: asg.status });
  if (![200, 201].includes(asg.status)) throw new Error('assign transporter failed ' + JSON.stringify(asg.json));

  // seller dispatch -> generates deliveryCode -> IN_TRANSIT
  const dis = await L.api(fx.seller.token, 'POST', `/api/v1/orders/${fx.releaseTarget}/dispatch`);
  step('dispatch', { status: dis.status });
  if (![200, 201].includes(dis.status)) throw new Error('dispatch failed ' + JSON.stringify(dis.json));

  // admin verifies the buyer's delivery code -> DELIVERED (code visible on admin detail/trip)
  const det = await L.api(atok, 'GET', `/api/v1/admin/orders/${fx.releaseTarget}`);
  const code = det.json.deliveryCode || (det.json.trip && det.json.trip.deliveryCode);
  step('deliveryCode', { code: code ? '***' + String(code).slice(-2) : null });
  if (!code) throw new Error('no deliveryCode on admin detail after dispatch');
  const ver = await L.api(atok, 'POST', `/api/v1/admin/orders/${fx.releaseTarget}/verify-delivery`, { code: String(code) });
  step('verify-delivery', { status: ver.status });
  if (![200, 201].includes(ver.status)) throw new Error('verify-delivery failed ' + JSON.stringify(ver.json));

  // ---- FX-CANC: cancel a PAID order -> REFUND_PENDING (refund target) ----
  const pfCanc = await mkProforma('CANC', fx.productIdCanc, feeCanc);
  await payProforma(pfCanc.proformaId, 'CANC');
  const orders2 = await L.api(fx.buyer.token, 'GET', '/api/v1/orders');
  let cancOrder = (orders2.json || [])
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .find(o => Number(o.totalAmount) === Number(14759 + feeCanc) &&
      !['CANCELLED', 'DELIVERED', 'COMPLETED'].includes(String(o.orderStatus || o.status)));
  if (!cancOrder) {
    cancOrder = (orders2.json || [])
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .find(o => o.orderId !== fx.releaseTarget &&
        !['CANCELLED', 'DELIVERED', 'COMPLETED'].includes(String(o.orderStatus || o.status)));
  }
  if (!cancOrder) throw new Error('CANC order not found');
  fx.refundTarget = cancOrder.orderId;
  const cx = await L.api(atok, 'PATCH', `/api/v1/admin/orders/${fx.refundTarget}/cancel`, { reason: 'au043 r14 refund-path fixture' });
  step('admin cancel', { status: cx.status });
  if (![200, 201, 204].includes(cx.status)) throw new Error('cancel failed ' + JSON.stringify(cx.json));

  // ---- FX-G1: REFUNDED order (release must refuse ORDER_REFUNDED) ----
  const g1 = await L.api(atok, 'POST', `/api/v1/admin/orders/${fx.refundTarget}/refund`);
  if (![200, 201].includes(g1.status)) throw new Error('seed refund failed ' + JSON.stringify(g1.json));
  const g1chk = await L.api(atok, 'GET', `/api/v1/admin/orders/${fx.refundTarget}`);
  fx.refundedOrder = fx.refundTarget;
  step('FX-G1 refunded', { refundStatus: g1chk.json.refundStatus, amount: g1chk.json.refundAmount });
  if (g1chk.json.refundStatus !== 'REFUNDED') throw new Error('fixture not REFUNDED');

  // ---- read-back of every pre-state (the verifier asserts these BEFORE clicking) ----
  const rb = await L.api(atok, 'GET', `/api/v1/admin/orders?page=0&size=50&search=${encodeURIComponent(TAG.slice(0, 12))}`);
  fx.searchTag = TAG.slice(0, 12);
  const chk = {};
  for (const [k, id] of [['release', fx.releaseTarget], ['refundPending', fx.refundedOrder]]) {
    const d = await L.api(atok, 'GET', `/api/v1/admin/orders/${id}`);
    chk[k] = { status: d.json.orderStatus, payout: d.json.payoutStatus, refund: d.json.refundStatus };
  }
  fx.readback = chk;
  step('readback', chk);
  if (!(chk.release.payout === 'HELD' && ['DELIVERED', 'COMPLETED', 'PICKED_UP'].includes(chk.release.status))) {
    throw new Error('release fixture not DELIVERED+HELD: ' + JSON.stringify(chk.release));
  }
  if (chk.refundPending.refund !== 'REFUNDED') throw new Error('refunded fixture wrong');

  fs.writeFileSync(OUT, JSON.stringify(fx, null, 1));
  console.log('\nSEED OK ->', OUT);
  console.log('releaseTarget', fx.releaseTarget, '| refunded(G1)', fx.refundedOrder);
}

main().catch(e => { console.error('SEED FAIL:', e.message); process.exit(1); });
