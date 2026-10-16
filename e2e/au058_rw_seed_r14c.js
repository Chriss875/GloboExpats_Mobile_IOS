// au058_rw_seed_r14c.js — RW fixtures v3 for AU-058: submit-payment now carries a
// transactionReference (PAYMENT_PROOF_REQUIRED fix) so the backend really creates the
// per-seller order and writes PAYMENT_BUYING / ORDER notifications to this buyer.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const STAMP = Date.now();
const PW = 'StrongPass!1';
const BEMAIL = `au058cbuyer${STAMP}@gmail.com`;
const SEMAIL = `au058cseller${STAMP}@gmail.com`;
const TITLE = `au<NNN>r14 ${STAMP}`;
const PNG = fs.readFileSync(path.join(__dirname, 'fixtures', 'receipt-proof.png'));
const step = (s, x) => console.log('[seed]', s, x !== undefined ? JSON.stringify(x).slice(0, 240) : '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  for (const [role, email] of [['buyer', BEMAIL], ['seller', SEMAIL]]) {
    const r = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU058C' + role, lastName: 'R14', password: PW, emailAddress: email });
    step('register-' + role, { status: r.status });
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
    productDescription: `AU-058 r14c fixture listing ${STAMP}. Real sandbox row.`,
    currency: 'TZS', askingPrice: 12000, originalPrice: 15000, condition: 'NEW',
  }))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([PNG], { type: 'image/png' }), 'fixture.png');
  const pr = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form });
  const pj = await pr.json().catch(() => null);
  const pid = pj && (pj.productId || pj.id || (pj.product && pj.product.productId));
  step('post-product', { status: pr.status, pid });

  const buyDetails = {
    firstName: 'AU058Buyer', lastName: 'R14C', emailAddress: BEMAIL, phoneNumber: '+255700000002',
    address: '123 Msasani Road', deliveryLabel: 'Home', deliveryPlaceName: 'Wizard Plaza',
    deliveryNeighbourhood: 'Mikocheni', city: 'Dar es Salaam', state: '', country: 'Tanzania',
    zipCode: '', deliveryInstructions: '', fulfillmentType: 'SELLER_DELIVERY',
    paymentMethodType: 'MOBILE_MONEY', deliveryFee: 8000, agreeToTerms: true,
    totalAmount: 20000, currency: 'TZS', latitude: -6.7905, longitude: 39.2795,
    preferredDeliveryDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    preferredDeliverySlot: 'MORNING',
    preferredDeliveryWindows: [{ date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), slot: 'MORNING' }],
  };
  const prof = await L.api(btok, 'POST', '/api/v1/checkout/proforma',
    { buyDetails, items: [{ productId: pid, quantity: 1 }] });
  step('proforma', { status: prof.status, num: prof.json && prof.json.proformaNumber });
  const proformaId = prof.json.proformaId;

  const q = await L.api(btok, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7905, longitude: 39.2795 },
    items: [{ productId: pid, quantity: 1 }],
  });
  step('delivery-quote', { status: q.status });

  // payment receipt upload (multipart) then submit-payment with reference
  const recForm = new FormData();
  recForm.append('receipts', new Blob([PNG], { type: 'image/png' }), 'proof.png');
  recForm.append('details', new Blob([Buffer.from(JSON.stringify({
    paymentMethodType: 'MOBILE_MONEY', transactionReference: `AU058-${STAMP}`,
  }))], { type: 'application/json' }));
  const rec = await fetch(`${L.API}/api/v1/proformas/${proformaId}/receipts`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + btok }, body: recForm,
  });
  step('receipt-upload', { status: rec.status, body: JSON.stringify((await rec.clone().json().catch(() => null)) || {}).slice(0, 200) });

  const sub = await L.api(btok, 'POST', `/api/v1/proformas/${proformaId}/submit-payment`,
    { paymentMethodType: 'MOBILE_MONEY', transactionReferences: [`AU058-${STAMP}`] });
  step('submit-payment', { status: sub.status, body: JSON.stringify(sub.json).slice(0, 400) });

  fs.writeFileSync('/tmp/au058_fixtures_r14.json', JSON.stringify({
    stamp: STAMP, title: TITLE, buyerEmail: BEMAIL, pw: PW, sellerEmail: SEMAIL,
    buyerToken: btok, sellerToken: stok, adminToken: atok, buyerId: buid, sellerId: suid,
    productId: pid, proformaId, proformaNumber: prof.json.proformaNumber, submitted: sub.json,
  }, null, 2));

  await sleep(3500);
  const nf = await L.api(btok, 'GET', '/api/v1/notifications?page=0&size=50');
  const rows = (nf.json && nf.json.content) || [];
  console.log('BUYER FEED:', nf.status, 'rows=', rows.length);
  rows.forEach(n => console.log(' ', n.notificationId, n.isRead ? 'R' : 'U', n.notificationType, JSON.stringify((n.title || '').slice(0, 62)), '->', n.actionUrl));
  const uc = await L.api(btok, 'GET', '/api/v1/notifications/unread-count');
  console.log('UNREAD:', uc.status, uc.json);
  const ords = await L.api(btok, 'GET', '/api/v1/orders');
  console.log('ORDERS:', JSON.stringify((ords.json || []).map(o => ({ id: o.orderId && o.orderId.slice(0, 8), num: o.orderNumber, st: o.status, escrow: o.escrowPending }))));
  fs.writeFileSync('/tmp/au058_groundtruth_r14.json', JSON.stringify({ feed: nf.json, unread: uc.json, orders: ords.json }, null, 2));
  console.log('FIXTURES OK -> /tmp/au058_fixtures_r14.json');
})().catch(e => { console.error('SEED FATAL', e.message); process.exit(1); });
