// au037_resume.js — resume the AU-037 fixture chain from /tmp/au037_fixtures.json.
// Fixes the TRANSPORT_MODE_MISMATCH (vehicleType must be MOTORBIKE, not "BODA" —
// TransporterVehicleType enum), then drives order A to DELIVERED and mints order C (PENDING).
const fs = require('fs');
const L = require('./lib_verify.js');
const fx = JSON.parse(fs.readFileSync('/tmp/au037_fixtures.json', 'utf8'));
const step = (s, extra) => console.log('[resume]', s, extra !== undefined ? JSON.stringify(extra).slice(0, 220) : '');

async function main() {
  const btok = fx.buyer.token, stok = fx.seller.token, atok = fx.adminToken;
  let aid = fx.orderA.orderIds[0];

  // 1. create a compatible transporter (MOTORBIKE carries BODA tariff class)
  const tr = await L.api(stok, 'POST', '/api/v1/transporters', {
    fullName: `AU037 Rider B ${fx.stamp}`, phoneNumber: '+255715000999', whatsAppPhoneNumber: '+255715000999',
    vehicleType: 'MOTORBIKE', plateNumber: `AU37B-${fx.stamp % 10000}`, active: true,
  });
  step('transporter create MOTORBIKE', { status: tr.status, id: tr.json && tr.json.transporterId });
  if (tr.status !== 201) throw new Error('transporter failed');
  fx.transporterId = tr.json.transporterId;

  // 2. assign + dispatch + verify-delivery on order A
  const at = await L.api(stok, 'POST', `/api/v1/orders/${aid}/transporter`,
    { transporterId: fx.transporterId, proposedDeliveryTime: new Date(Date.now() + 3600 * 1000).toISOString(), note: 'au037' });
  step('assign transporter A', { status: at.status });
  if (at.status !== 200 && at.status !== 201) throw new Error('assign failed ' + JSON.stringify(at.json));
  const dp = await L.api(stok, 'POST', `/api/v1/orders/${aid}/dispatch`);
  step('dispatch A', { status: dp.status, body: dp.json });
  if (dp.status !== 200) throw new Error('dispatch failed');

  const od = await L.api(btok, 'GET', `/api/v1/orders/${aid}`);
  fx.deliveryCode = od.json && od.json.deliveryCode;
  step('deliveryCode buyer-view', { code: fx.deliveryCode, status: od.json && od.json.status });
  if (!fx.deliveryCode) throw new Error('no deliveryCode for buyer');

  const vd = await L.api(stok, 'POST', `/api/v1/orders/${aid}/verify-delivery`, { code: fx.deliveryCode });
  step('verify-delivery A', { status: vd.status, body: vd.json });
  if (vd.status !== 200) throw new Error('verify-delivery failed');

  const oda = await L.api(btok, 'GET', `/api/v1/orders/${aid}`);
  fx.orderA.finalStatus = oda.json && (oda.json.status || oda.json.orderStatus);
  fx.orderA.buyerRatedBefore = oda.json && oda.json.buyerRated;
  step('orderA final', { status: fx.orderA.finalStatus });

  // 3. order C — PENDING vector: proforma + submit-payment leaves AWAITING_PAYMENT...
  //    PENDING is the pre-verification state minted by checkout BEFORE submit; probe it by
  //    creating proforma C and reading sellerGroups[].orderId directly after create.
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const fee = (fx.quote && fx.quote.deliveryTotal) || 2000;
  const co = await L.api(btok, 'POST', '/api/v1/checkout/proforma', {
    buyDetails: {
      firstName: 'AU037First', lastName: 'AU037Last', emailAddress: fx.buyer.email,
      phoneNumber: '+255715000777', address: 'au037 seed street',
      deliveryLabel: 'Home', deliveryPlaceName: '', deliveryNeighbourhood: '',
      city: 'dar es salaam', state: '', country: 'tanzania', zipCode: '',
      deliveryInstructions: '', fulfillmentType: 'SELLER_DELIVERY',
      paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
      deliveryFee: fee, totalAmount: 14000 + fee,
      currency: 'TZS', latitude: -6.7924, longitude: 39.2083,
      preferredDeliveryDate: tomorrow, preferredDeliverySlot: 'EVENING',
      preferredDeliveryWindows: [{ date: tomorrow, slot: 'EVENING' }],
    },
    items: [{ productId: fx.productId, quantity: 1 }],
  });
  step('proforma C', { status: co.status, id: co.json && co.json.proformaId });
  if (co.status !== 200 && co.status !== 201) throw new Error('proforma C failed');
  fx.orderC = { pfId: co.json.proformaId || co.json.id, orderIds: (co.json.sellerGroups || []).map(g => g.orderId).filter(Boolean) };
  step('orderC ids at create', { ids: fx.orderC.orderIds });

  if (!fx.orderC.orderIds.length) {
    // orders only materialize at submit-payment on this backend — accept that and
    // record it (the app's Cancel button gates on PENDING/AWAITING_PAYMENT anyway).
    const sub = await L.api(btok, 'POST', `/api/v1/proformas/${fx.orderC.pfId}/submit-payment`,
      { transactionReferences: [`AU037-TXN-C`], paymentMethodType: 'MOBILE_MONEY' });
    step('submit-payment C', { status: sub.status });
    fx.orderC.orderIds = ((sub.json && sub.json.sellerGroups) || []).map(g => g.orderId).filter(Boolean);
    step('orderC ids after submit', { ids: fx.orderC.orderIds });
  }
  const oc = await L.api(btok, 'GET', `/api/v1/orders/${fx.orderC.orderIds[0]}`);
  fx.orderC.statusAfterSubmit = oc.json && oc.json.status;
  step('orderC status', { status: fx.orderC.statusAfterSubmit });

  fs.writeFileSync('/tmp/au037_fixtures.json', JSON.stringify(fx, null, 2));
  console.log('FIXTURES UPDATED');
}
main().catch(e => { console.error('RESUME FAILED:', e.message); process.exit(1); });
