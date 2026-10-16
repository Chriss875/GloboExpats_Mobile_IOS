// au057_seed_r15.js — mint ONE fresh IN_TRANSIT order (C) for the corrected r15 pass.
// Reuses the r14 accounts/product/transporter; today's window already open.
const fs = require('fs');
const L = require('./lib_verify.js');
const fx = JSON.parse(fs.readFileSync('/tmp/au057_fixtures_r14.json', 'utf8'));
const STAMP = Date.now();
const dayPlus = n => new Date(Date.now() + n * 24 * 3600 * 1000).toISOString().slice(0, 10);
const log = (...a) => console.log('[seed-c]', ...a);

(async () => {
  const btok = await L.apiLogin({ email: fx.buyer.email, pw: fx.buyer.pw });
  const stok = await L.apiLogin({ email: fx.seller.email, pw: fx.seller.pw });
  const atok = await L.apiLogin(L.ADMIN);
  const buyDetails = {
    firstName: 'AU057R14First', lastName: 'AU057R14Buyer', emailAddress: fx.buyer.email,
    phoneNumber: '+255713001555', address: 'AU057R14B Street 4', city: 'Dar es Salaam',
    state: 'Dar es Salaam', country: 'Tanzania', zipCode: '',
    deliveryMethod: "Seller's delivery", paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true,
    fulfillmentType: 'SELLER_DELIVERY', currency: 'TZS',
    latitude: -6.7924, longitude: 39.2083,
    preferredDeliveryWindows: [{ date: new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10), slot: 'AFTERNOON' }],
  };
  const pf = await L.api(btok, 'POST', '/api/v1/checkout/proforma', { buyDetails, items: [{ productId: fx.productId, quantity: 1 }] });
  if (![200, 201].includes(pf.status)) throw new Error('proforma ' + JSON.stringify(pf.json).slice(0, 160));
  const pj = pf.json;
  await L.api(btok, 'POST', `/api/v1/proformas/${pj.proformaId}/submit-payment`,
    { transactionReferences: [`AU057C-${STAMP}`], paymentMethodType: 'MOBILE_MONEY' });
  const cp = await L.api(atok, 'POST', `/api/v1/admin/proformas/${pj.proformaId}/confirm-payment`);
  if (![200, 201].includes(cp.status)) throw new Error('confirm-payment');
  const sOrders = await L.api(stok, 'GET', '/api/v1/orders?orderType=selling');
  const rows = Array.isArray(sOrders.json) ? sOrders.json : [];
  const o = rows.find(x => x.totalAmount === pj.grandTotal);
  if (!o) throw new Error('order C not found');
  const orderId = String(o.orderId);
  log('orderC:', o.orderNumber, orderId);
  log('confirm-availability:', (await L.api(stok, 'POST', `/api/v1/orders/${orderId}/confirm-availability`)).status);
  log('assign:', (await L.api(stok, 'POST', `/api/v1/orders/${orderId}/transporter`, { transporterId: fx.transporterId })).status);
  const dp = await L.api(stok, 'POST', `/api/v1/orders/${orderId}/dispatch`);
  log('dispatch:', dp.status, dp.status >= 400 ? JSON.stringify(dp.json).slice(0, 140) : '');
  const bd = await L.api(btok, 'GET', `/api/v1/orders/${orderId}`);
  const out = { ...fx, orderC: { orderId, orderNumber: o.orderNumber },
    orderCFinal: bd.json.status, orderCBuyerCode: bd.json.deliveryCode,
    orderCBuyerCanConfirm: bd.json.buyerCanConfirmDelivery };
  // refresh tokens for the browser pass
  out.buyer.token = btok; out.seller.token = stok;
  fs.writeFileSync('/tmp/au057_fixtures_r15.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ orderC: out.orderC, status: out.orderCFinal,
    code: out.orderCBuyerCode, canConfirm: out.orderCBuyerCanConfirm }, null, 1));
})().catch(e => { console.error('FATAL', e.message || e); process.exit(1); });
