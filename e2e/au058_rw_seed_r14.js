// au058_rw_seed_r14.js — RW fixtures for the AU-058 verify run, minted through the
// REAL sandbox API (:8083) only. Creates a throwaway VERIFIED seller + throwaway
// buyer, posts a real listing (image attached) and a request-board row (NEW_REQUEST
// broadcast), then drives buyer cart -> proforma -> delivery quote -> order create so
// the backend itself writes ORDER/PAYMENT notifications addressed to that buyer.
// Writes /tmp/au058_fixtures_r14.json. Mutates only what it created.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au058_fixtures_r14.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';
const BEMAIL = `au058buyer${STAMP}@gmail.com`;
const SEMAIL = `au058seller${STAMP}@gmail.com`;
const TITLE = `au058r14 ${STAMP}`;
const PNG = fs.readFileSync(path.join(__dirname, 'fixtures', 'receipt-proof.png'));
const step = (s, x) => console.log('[seed]', s, x !== undefined ? JSON.stringify(x).slice(0, 260) : '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // ---- accounts ----
  for (const [role, email] of [['buyer', BEMAIL], ['seller', SEMAIL]]) {
    const r = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU058' + role, lastName: 'R14', password: PW, emailAddress: email });
    step('register-' + role, { status: r.status });
    if (![200, 201].includes(r.status)) throw new Error(role + ' reg failed ' + JSON.stringify(r.json));
  }
  const btok = await L.apiLogin({ email: BEMAIL, pw: PW });
  let stok = await L.apiLogin({ email: SEMAIL, pw: PW });
  const bme = await L.api(btok, 'GET', '/api/v1/userManagement/user-details');
  const buid = bme.json && (bme.json.userId ?? (bme.json.user && bme.json.user.userId));
  step('buyerId', buid);

  // verify the SELLER via the admin account (same as au054 seed does)
  const atok = await L.apiLogin(L.ADMIN);
  const sme = await L.api(stok, 'GET', '/api/v1/userManagement/user-details');
  const suid = sme.json && (sme.json.userId ?? (sme.json.user && sme.json.user.userId));
  const ver = await L.api(atok, 'PATCH', `/api/v1/admin/users/${suid}/status`, { status: 'VERIFIED' });
  step('verify-seller', { suid, status: ver.status });

  // ---- seller listing (real image) ----
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify({
    productName: `${TITLE} Lamp`, productQuantity: 3,
    categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: `AU-058 r14 fixture listing ${STAMP}. Real sandbox row.`,
    currency: 'TZS', askingPrice: 12000, originalPrice: 15000, condition: 'NEW',
  }))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([PNG], { type: 'image/png' }), 'fixture.png');
  const pr = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form });
  const pj = await pr.json().catch(() => null);
  step('post-product', { status: pr.status });
  const pid = pj && (pj.productId || pj.id || (pj.product && pj.product.productId));
  if (!pid) throw new Error('no productId ' + JSON.stringify(pj).slice(0, 200));

  // ---- NEW_REQUEST broadcast fixture: seller posts on the request board ----
  let reqId = null;
  const req = await L.api(stok, 'POST', '/api/v1/request-board', {
    title: `${TITLE} request`, description: `AU-058 r14 NEW_REQUEST broadcast target (${STAMP})`,
    category: 'Other', location: 'Mikocheni', requestType: 'GOODS',
  });
  step('request-board-post', { status: req.status });
  reqId = (req.json && (req.json.id || req.json.requestId)) || null;

  // ---- buyer cart -> proforma -> delivery quote -> order ----
  const add = await L.api(btok, 'POST', '/api/saved-products/add-to-cart', { productId: pid, quantity: 1 });
  step('add-to-cart', { status: add.status, body: JSON.stringify(add.json).slice(0, 120) });
  const prof = await L.api(btok, 'POST', '/api/v1/checkout/proforma', { productIds: [pid] });
  step('proforma', { status: prof.status, body: JSON.stringify(prof.json).slice(0, 260) });
  const pfNum = prof.json && (prof.json.proformaNumber || prof.json.number);

  const addr = {
    placeName: 'Wizard Plaza', neighbourhood: 'Mikocheni', addressLine: '123 Msasani Road',
    city: 'Dar es Salaam', state: 'Dar es Salaam', country: 'Tanzania',
    latitude: -6.7905, longitude: 39.2795,
  };
  const qbody = pfNum ? { proformaNumber: pfNum, deliveryAddress: addr } : { deliveryAddress: addr };
  const q = await L.api(btok, 'POST', '/api/v1/checkout/delivery-quote', qbody);
  step('delivery-quote', { status: q.status, body: JSON.stringify(q.json).slice(0, 220) });

  const ordBody = pfNum ? {
    proformaNumber: pfNum, deliveryAddress: addr,
    paymentMethodType: 'MOBILE_MONEY', fulfillmentType: 'SELLER_DELIVERY',
  } : { productIds: [pid], deliveryAddress: addr };
  const ord = await L.api(btok, 'POST', '/api/v1/orders', ordBody);
  step('create-order', { status: ord.status, body: JSON.stringify(ord.json).slice(0, 300) });

  fs.writeFileSync(OUT, JSON.stringify({
    stamp: STAMP, buyerEmail: BEMAIL, pw: PW, sellerEmail: SEMAIL,
    buyerToken: btok, sellerToken: stok, adminToken: atok, buyerId: buid, sellerId: suid,
    productId: pid, requestId: reqId, proforma: prof.json, quote: q.json, order: ord.json,
  }, null, 2));

  // ground truth readback: the THROWAWAY buyer's own feed
  await sleep(3000);
  const nf = await L.api(btok, 'GET', '/api/v1/notifications?page=0&size=50');
  const rows = (nf.json && nf.json.content) || [];
  console.log('BUYER FEED:', nf.status, 'rows=', rows.length);
  rows.forEach(n => console.log(' ', n.notificationId, n.isRead ? 'R' : 'U', n.notificationType, JSON.stringify((n.title || '').slice(0, 60)), '->', n.actionUrl));
  const uc = await L.api(btok, 'GET', '/api/v1/notifications/unread-count');
  console.log('UNREAD COUNT:', uc.status, uc.json);
  fs.writeFileSync('/tmp/au058_groundtruth_r14.json', JSON.stringify({ feed: nf.json, unread: uc.json }, null, 2));
  console.log('FIXTURES OK ->', OUT);
})().catch(e => { console.error('SEED FATAL', e.message); process.exit(1); });
