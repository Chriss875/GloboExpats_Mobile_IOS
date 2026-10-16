// au036_seed_r6.js — AU-036 verify-r6 fixture completion through the REAL
// sandbox API (:8083). Reuses the r5 throwaway buyer+seller+product (784) and
// mints:
//   Order C — full chain: proforma -> submit-payment -> admin confirm-payment
//             -> seller confirm-availability -> transporter -> dispatch ->
//             verify-delivery => DELIVERED + payoutStatus=HELD. STOPS THERE:
//             release-payment is fired MID-BROWSER so the UI state flip to
//             "Payment released to seller" is filmed on a real transition.
//   Order D — decline-availability path: submit-payment -> confirm-payment ->
//             seller decline-availability => CANCELLED + REFUND_PENDING.
//             STOPS THERE: POST /admin/orders/{id}/refund happens MID-BROWSER
//             so the REFUNDED banner + amount flip is filmed on a real
//             transition. refundAmount = totalAmount (OrderEscrowService L515).
// Mutates ONLY what this campaign's own seeds created.
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const fx = JSON.parse(fs.readFileSync('/tmp/au036_r5.json', 'utf8'));
const step = (s, x) => console.log('[r6seed]', s, x === undefined ? '' : JSON.stringify(x).slice(0, 240));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const btok = await L.apiLogin({ email: fx.buyer.email, pw: fx.buyer.pw });
  const stok = await L.apiLogin({ email: fx.seller.email, pw: fx.seller.pw });
  const atok = await L.apiLogin(L.ADMIN);
  fx.buyer.token = btok; fx.seller.token = stok; fx.adminToken = atok;

  const buyDetails = {
    firstName: 'AU036R5', lastName: 'Buyer', emailAddress: fx.buyer.email, phoneNumber: '+255713000555',
    address: `AU036 R5 Street ${fx.stamp}`, city: 'Dar es Salaam', state: 'Dar es Salaam', country: 'Tanzania',
    zipCode: '', deliveryMethod: "Seller's delivery", paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
    fulfillmentType: 'SELLER_DELIVERY', currency: 'TZS', latitude: -6.7924, longitude: 39.2083,
    preferredDeliveryWindows: [{ date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), slot: 'AFTERNOON' }],
  };
  async function checkout(tag) {
    const pf = await L.api(btok, 'POST', '/api/v1/checkout/proforma', { buyDetails, items: [{ productId: fx.productId, quantity: 1 }] });
    if (![200, 201].includes(pf.status)) throw new Error(`proforma ${tag} failed ${pf.status}`);
    const sp = await L.api(btok, 'POST', `/api/v1/proformas/${pf.json.proformaId}/submit-payment`,
      { transactionReferences: [`AU036R6-${tag}-${fx.stamp}`], paymentMethodType: 'MOBILE_MONEY' });
    if (![200, 201].includes(sp.status)) throw new Error(`submit-payment ${tag} failed ${sp.status} ${JSON.stringify(sp.json).slice(0, 120)}`);
    let ids = ((pf.json.sellerGroups) || []).map(g => g.orderId).filter(Boolean);
    if (!ids.length) ids = ((sp.json && sp.json.sellerGroups) || []).map(g => g.orderId).filter(Boolean);
    let oid = ids[0];
    if (!oid) {
      const rows = await L.api(btok, 'GET', '/api/v1/orders');
      const hit = (Array.isArray(rows.json) ? rows.json : []).find(o => o.totalAmount === pf.json.grandTotal && o.status === 'AWAITING_PAYMENT' && !ids.includes(o.orderId));
      oid = hit && hit.orderId;
    }
    step(`checkout ${tag}`, { orderId: oid, proforma: pf.json.proformaNumber, total: pf.json.grandTotal });
    return { orderId: oid, proformaId: pf.json.proformaId, proformaNumber: pf.json.proformaNumber, grandTotal: pf.json.grandTotal };
  }

  // ================= ORDER C — chain to DELIVERED + HELD =================
  const C = await checkout('C');
  const cpC = await L.api(atok, 'POST', `/api/v1/admin/proformas/${C.proformaId}/confirm-payment`, {});
  step('C confirm-payment', { status: cpC.status });
  const d3 = await L.api(btok, 'GET', `/api/v1/orders/${C.orderId}`);
  step('C state3', { s: d3.json && d3.json.status, po: d3.json && d3.json.payoutStatus });
  if (!((d3.json || {}).status === 'AWAITING_SELLER_CONFIRMATION')) throw new Error('C not ASC');

  const caC = await L.api(stok, 'POST', `/api/v1/orders/${C.orderId}/confirm-availability`,
    { preferredDeliverySlot: 'AFTERNOON', preferredDeliveryDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), orderId: C.orderId });
  step('C confirm-availability', { status: caC.status });
  const d4 = await L.api(btok, 'GET', `/api/v1/orders/${C.orderId}`);
  step('C state4', { s: d4.json && d4.json.status, po: d4.json && d4.json.payoutStatus });

  // transporter owned by OUR seller (MOTORBIKE carries the BODA tariff class)
  const tr = await L.api(stok, 'POST', '/api/v1/transporters', {
    fullName: `AU036 R6 Rider ${fx.stamp}`, phoneNumber: '+255716000777', whatsAppPhoneNumber: '+255716000777',
    vehicleType: 'MOTORBIKE', plateNumber: `A36R6-${fx.stamp % 100000}`, active: true });
  step('C transporter', { status: tr.status, id: tr.json && tr.json.transporterId });
  if (tr.status !== 201) throw new Error('transporter failed');
  fx.transporterId = tr.json.transporterId;

  const atC = await L.api(stok, 'POST', `/api/v1/orders/${C.orderId}/transporter`,
    { transporterId: fx.transporterId, proposedDeliveryTime: new Date(Date.now() + 3600 * 1000).toISOString(), note: 'au036 r6' });
  step('C assign-transporter', { status: atC.status, body: atC.json });
  if (![200, 201].includes(atC.status)) throw new Error('C assign failed');
  const dpC = await L.api(stok, 'POST', `/api/v1/orders/${C.orderId}/dispatch`, {});
  step('C dispatch', { status: dpC.status });
  if (dpC.status !== 200) throw new Error('C dispatch failed');
  const dit = await L.api(btok, 'GET', `/api/v1/orders/${C.orderId}`);
  step('C in-transit', { s: dit.json && dit.json.status, code: dit.json && dit.json.deliveryCode });
  if (!(dit.json || {}).deliveryCode) throw new Error('C no deliveryCode');
  const vdC = await L.api(stok, 'POST', `/api/v1/orders/${C.orderId}/verify-delivery`, { code: dit.json.deliveryCode });
  step('C verify-delivery', { status: vdC.status });
  const d5 = await L.api(btok, 'GET', `/api/v1/orders/${C.orderId}`);
  fx.chainC = {
    ...C,
    delivered: { status: d5.json.status, payoutStatus: d5.json.payoutStatus,
      paymentStatus: d5.json.paymentStatus, escrowPending: !!d5.json.escrowPending },
  };
  step('C DELIVERED+HELD', fx.chainC.delivered);
  if (!(d5.json.status === 'DELIVERED' && d5.json.payoutStatus === 'HELD')) throw new Error('C not DELIVERED+HELD');

  // ================= ORDER D — decline -> CANCELLED + REFUND_PENDING ======
  const D = await checkout('D');
  const cpD = await L.api(atok, 'POST', `/api/v1/admin/proformas/${D.proformaId}/confirm-payment`, {});
  step('D confirm-payment', { status: cpD.status });
  const dD = await L.api(btok, 'GET', `/api/v1/orders/${D.orderId}`);
  if (!((dD.json || {}).status === 'AWAITING_SELLER_CONFIRMATION')) throw new Error('D not ASC');
  const decD = await L.api(stok, 'POST', `/api/v1/orders/${D.orderId}/decline-availability`,
    { reason: `AU036 r6 probe: item unavailable (stamp ${fx.stamp})` });
  step('D decline-availability', { status: decD.status });
  if (![200, 201].includes(decD.status)) throw new Error('D decline failed');
  const dDr = await L.api(btok, 'GET', `/api/v1/orders/${D.orderId}`);
  fx.chainD = {
    ...D,
    cancelled: { status: dDr.json.status, refundStatus: dDr.json.refundStatus,
      payoutStatus: dDr.json.payoutStatus, totalAmount: dDr.json.totalAmount },
  };
  step('D CANCELLED+REFUND_PENDING', fx.chainD.cancelled);
  if (!(dDr.json.refundStatus === 'REFUND_PENDING')) throw new Error('D not REFUND_PENDING');

  fs.writeFileSync('/tmp/au036_r5.json', JSON.stringify(fx, null, 1));
  console.log('R6 SEED OK — C paused at DELIVERED+HELD (release in browser), D paused at REFUND_PENDING (refund in browser)');
})().catch(e => { console.error('R6 SEED FAIL', e.message); process.exit(1); });
