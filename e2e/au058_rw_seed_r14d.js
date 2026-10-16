// au058_rw_seed_r14d.js — RW fixtures v4 for AU-058: after the buyer's real
// submit-payment, the ADMIN verifies the payment (real sandbox payment review) so the
// seller confirms availability and a driver is assigned -> ORDER_BUYING notifications
// with /orders/{id} actionUrls land in THIS buyer's feed. Everything through :8083.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const STAMP = Date.now();
const PW = 'StrongPass!1';
const BEMAIL = `au058dbuyer${STAMP}@gmail.com`;
const SEMAIL = `au058dseller${STAMP}@gmail.com`;
const TITLE = `au<NNN>r14 ${STAMP}`;
const PNG = fs.readFileSync(path.join(__dirname, 'fixtures', 'receipt-proof.png'));
const step = (s, x) => console.log('[seed]', s, x !== undefined ? JSON.stringify(x).slice(0, 240) : '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  for (const [role, email] of [['buyer', BEMAIL], ['seller', SEMAIL]]) {
    await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU058D' + role, lastName: 'R14', password: PW, emailAddress: email });
  }
  const btok = await L.apiLogin({ email: BEMAIL, pw: PW });
  const stok = await L.apiLogin({ email: SEMAIL, pw: PW });
  const buid = (await L.api(btok, 'GET', '/api/v1/userManagement/user-details')).json.userId;
  const atok = await L.apiLogin(L.ADMIN);
  const suid = (await L.api(stok, 'GET', '/api/v1/userManagement/user-details')).json.userId;
  await L.api(atok, 'PATCH', `/api/v1/admin/users/${suid}/status`, { status: 'VERIFIED' });

  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify({
    productName: `${TITLE} Lamp`, productQuantity: 3,
    categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: `AU-058 r14d fixture listing ${STAMP}. Real sandbox row.`,
    currency: 'TZS', askingPrice: 12000, originalPrice: 15000, condition: 'NEW',
  }))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([PNG], { type: 'image/png' }), 'fixture.png');
  const pr = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form });
  const pj = await pr.json().catch(() => null);
  const pid = pj && (pj.productId || pj.id || (pj.product && pj.product.productId));
  step('post-product', { status: pr.status, pid });

  const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const buyDetails = {
    firstName: 'AU058Buyer', lastName: 'R14D', emailAddress: BEMAIL, phoneNumber: '+255700000003',
    address: '123 Msasani Road', deliveryLabel: 'Home', deliveryPlaceName: 'Wizard Plaza',
    deliveryNeighbourhood: 'Mikocheni', city: 'Dar es Salaam', state: '', country: 'Tanzania',
    zipCode: '', deliveryInstructions: '', fulfillmentType: 'SELLER_DELIVERY',
    paymentMethodType: 'MOBILE_MONEY', deliveryFee: 8000, agreeToTerms: true,
    totalAmount: 20000, currency: 'TZS', latitude: -6.7905, longitude: 39.2795,
    preferredDeliveryDate: day, preferredDeliverySlot: 'MORNING',
    preferredDeliveryWindows: [{ date: day, slot: 'MORNING' }],
  };
  const prof = await L.api(btok, 'POST', '/api/v1/checkout/proforma',
    { buyDetails, items: [{ productId: pid, quantity: 1 }] });
  const proformaId = prof.json.proformaId;
  step('proforma', { status: prof.status, num: prof.json.proformaNumber });

  await L.api(btok, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7905, longitude: 39.2795 },
    items: [{ productId: pid, quantity: 1 }],
  });

  const recForm = new FormData();
  recForm.append('receipts', new Blob([PNG], { type: 'image/png' }), 'proof.png');
  recForm.append('details', new Blob([Buffer.from(JSON.stringify({
    paymentMethodType: 'MOBILE_MONEY', transactionReference: `AU058-${STAMP}`,
  }))], { type: 'application/json' }));
  await fetch(`${L.API}/api/v1/proformas/${proformaId}/receipts`, { method: 'POST', headers: { Authorization: 'Bearer ' + btok }, body: recForm });
  const sub = await L.api(btok, 'POST', `/api/v1/proformas/${proformaId}/submit-payment`,
    { paymentMethodType: 'MOBILE_MONEY', transactionReferences: [`AU058-${STAMP}`] });
  step('submit-payment', { status: sub.status });

  // ---- ADMIN confirms the payment (real sandbox payment review) ----
  const cf = await L.api(atok, 'POST', `/api/v1/admin/proformas/${proformaId}/confirm-payment`, {});
  step('admin-confirm-payment', { status: cf.status, body: JSON.stringify(cf.json).slice(0, 220) });

  fs.writeFileSync('/tmp/au058_fixtures_r14.json', JSON.stringify({
    stamp: STAMP, title: TITLE, buyerEmail: BEMAIL, pw: PW, sellerEmail: SEMAIL,
    buyerToken: btok, sellerToken: stok, adminToken: atok, buyerId: buid, sellerId: suid,
    productId: pid, proformaId, proformaNumber: prof.json.proformaNumber,
  }, null, 2));

  await sleep(4000);
  const nf = await L.api(btok, 'GET', '/api/v1/notifications?page=0&size=50');
  const rows2 = (nf.json && nf.json.content) || [];
  console.log('BUYER FEED:', nf.status, 'rows=', rows2.length);
  rows2.forEach(n => console.log(' ', n.notificationId, n.isRead ? 'R' : 'U', n.notificationType, JSON.stringify((n.title || '').slice(0, 62)), '->', n.actionUrl));
  console.log('UNREAD:', (await L.api(btok, 'GET', '/api/v1/notifications/unread-count')).json);
  const ords = await L.api(btok, 'GET', '/api/v1/orders');
  console.log('ORDERS:', JSON.stringify((ords.json || []).map(o => ({ id: o.orderId && o.orderId.slice(0, 8), num: o.orderNumber, st: o.status, escrow: o.escrowPending }))));
  fs.writeFileSync('/tmp/au058_groundtruth_r14.json', JSON.stringify({ feed: nf.json, unread: (await L.api(btok, 'GET', '/api/v1/notifications/unread-count')).json, orders: ords.json }, null, 2));
})().catch(e => { console.error('SEED FATAL', e.message); process.exit(1); });
// appended: seller confirm-availability -> driver assign -> ORDER_BUYING rows
