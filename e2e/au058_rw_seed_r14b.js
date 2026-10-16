// au058_rw_seed_r14b.js — RW fixtures v2 for AU-058 (fixes r14 contract mistakes):
//  - proforma: POST /api/v1/checkout/proforma {buyDetails, items:[{productId,quantity}]}
//  - quote   : POST /api/v1/checkout/delivery-quote {destination:{city,country,lat,lng}, items}
//  - orders  : POST /api/v1/proformas/{id}/submit-payment  (creates per-seller orders,
//              writes PAYMENT_BUYING notifications to the buyer)
// Also mints NEW_REQUEST broadcast via request-board post by the OTHER account.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const STAMP = Date.now();
const PW = 'StrongPass!1';
const BEMAIL = `au058bbuyer${STAMP}@gmail.com`;
const SEMAIL = `au058bseller${STAMP}@gmail.com`;
const TITLE = `au<NNN>r14 ${STAMP}`;
const PNG = fs.readFileSync(path.join(__dirname, 'fixtures', 'receipt-proof.png'));
const step = (s, x) => console.log('[seed]', s, x !== undefined ? JSON.stringify(x).slice(0, 240) : '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  for (const [role, email] of [['buyer', BEMAIL], ['seller', SEMAIL]]) {
    const r = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU058' + role, lastName: 'R14B', password: PW, emailAddress: email });
    step('register-' + role, { status: r.status });
    if (![200, 201].includes(r.status)) throw new Error(role + ' reg failed');
  }
  const btok = await L.apiLogin({ email: BEMAIL, pw: PW });
  const stok = await L.apiLogin({ email: SEMAIL, pw: PW });
  const bme = await L.api(btok, 'GET', '/api/v1/userManagement/user-details');
  const buid = bme.json && bme.json.userId;
  const atok = await L.apiLogin(L.ADMIN);
  const sme = await L.api(stok, 'GET', '/api/v1/userManagement/user-details');
  const suid = sme.json && sme.json.userId;
  step('ids', { buyerId: buid, sellerId: suid });
  await L.api(atok, 'PATCH', `/api/v1/admin/users/${suid}/status`, { status: 'VERIFIED' });

  // listing with a real image
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify({
    productName: `${TITLE} Lamp`, productQuantity: 3,
    categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: `AU-058 r14b fixture listing ${STAMP}. Real sandbox row.`,
    currency: 'TZS', askingPrice: 12000, originalPrice: 15000, condition: 'NEW',
  }))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([PNG], { type: 'image/png' }), 'fixture.png');
  const pr = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form });
  const pj = await pr.json().catch(() => null);
  const pid = pj && (pj.productId || pj.id || (pj.product && pj.product.productId));
  step('post-product', { status: pr.status, pid });
  if (!pid) throw new Error('no productId');

  // request-board row from the BUYER so the SELLER gets NEW_REQUEST (and the buyer's
  // own feed stays clean of it — we assert the seller side separately if needed)
  const req = await L.api(stok, 'POST', '/api/v1/request-board', {
    title: TITLE + ' request', description: `AU-058 r14b NEW_REQUEST target (${STAMP})`,
    category: 'Other', location: 'Mikocheni', requestType: 'GOODS',
  });
  step('request-board-post', { status: req.status, id: req.json && req.json.id });

  const buyDetails = {
    firstName: 'AU058Buyer', lastName: 'R14B', emailAddress: BEMAIL, phoneNumber: '+255700000001',
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
  step('proforma', { status: prof.status, body: JSON.stringify(prof.json).slice(0, 260) });
  if (![200, 201].includes(prof.status)) throw new Error('proforma failed');
  const proformaId = prof.json.proformaId;
  const pfNum = prof.json.proformaNumber;

  const q = await L.api(btok, 'POST', '/api/v1/checkout/delivery-quote', {
    destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7905, longitude: 39.2795 },
    items: [{ productId: pid, quantity: 1 }],
  });
  step('delivery-quote', { status: q.status, body: JSON.stringify(q.json).slice(0, 220) });

  // submit-payment creates the per-seller ORDERS (AWAITING_PAYMENT? -> see readback)
  const sub = await L.api(btok, 'POST', `/api/v1/proformas/${proformaId}/submit-payment`,
    { paymentMethodType: 'MOBILE_MONEY', paidAmount: 20000 });
  step('submit-payment', { status: sub.status, body: JSON.stringify(sub.json).slice(0, 300) });

  fs.writeFileSync('/tmp/au058_fixtures_r14.json', JSON.stringify({
    stamp: STAMP, title: TITLE, buyerEmail: BEMAIL, pw: PW, sellerEmail: SEMAIL,
    buyerToken: btok, sellerToken: stok, adminToken: atok, buyerId: buid, sellerId: suid,
    productId: pid, requestId: req.json && req.json.id, proformaId, proformaNumber: pfNum,
    quote: q.json, submitted: sub.json,
  }, null, 2));

  await sleep(3500);
  const nf = await L.api(btok, 'GET', '/api/v1/notifications?page=0&size=50');
  const rows = (nf.json && nf.json.content) || [];
  console.log('BUYER FEED:', nf.status, 'rows=', rows.length);
  rows.forEach(n => console.log(' ', n.notificationId, n.isRead ? 'R' : 'U', n.notificationType, JSON.stringify((n.title || '').slice(0, 62)), '->', n.actionUrl));
  const uc = await L.api(btok, 'GET', '/api/v1/notifications/unread-count');
  console.log('UNREAD:', uc.status, uc.json);
  const ords = await L.api(btok, 'GET', '/api/v1/orders');
  console.log('ORDERS:', (ords.json || []).map(o => ({ id: o.orderId && o.orderId.slice(0, 8), num: o.orderNumber, st: o.status })));
  fs.writeFileSync('/tmp/au058_groundtruth_r14.json', JSON.stringify({ feed: nf.json, unread: uc.json, orders: ords.json }, null, 2));
  console.log('FIXTURES OK -> /tmp/au058_fixtures_r14.json');
})().catch(e => { console.error('SEED FATAL', e.message); process.exit(1); });
