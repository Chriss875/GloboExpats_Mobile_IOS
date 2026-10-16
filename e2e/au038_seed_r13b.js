// au038_seed_r13b.js — supplemental RW fixtures for the AU-038 r13b focused leg.
// Reuses the r13 buyer/seller accounts (created by me via the REAL API), posts a FRESH
// product (old one exhausted its stock of 8) and mints 3 vectors x 2 viewports:
//   pu2    BUYER_PICKUP -> admin confirm -> confirm-availability => AWAITING_PICKUP
//   ga2    SELLER_DELIVERY window +2d -> ASC (banner + Confirm availability)
//   dec2   SELLER_DELIVERY window +2d -> ASC (decline w/ reason -> CANCELLED+REFUND_PENDING)
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const fx0 = JSON.parse(fs.readFileSync('/tmp/au038_fixtures_r13.json', 'utf8'));
const OUT = '/tmp/au038_fixtures_r13b.json';
const STAMP = Date.now();
const dayPlus = n => new Date(Date.now() + n * 24 * 3600 * 1000).toISOString().slice(0, 10);
function png(file) { return fs.readFileSync(path.join(__dirname, 'fixtures', file)); }
const log = (...a) => console.log('[seed-r13b]', ...a);

async function main() {
  const btok = await L.apiLogin({ email: fx0.buyer.email, pw: fx0.buyer.pw });
  const stok = await L.apiLogin({ email: fx0.seller.email, pw: fx0.seller.pw });
  const atok = await L.apiLogin(L.ADMIN);
  const form = new FormData();
  const product = {
    productName: `AU038 R13b Gate Probe Stool ${STAMP}`,
    productQuantity: 10, categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: 'AU-038 r13b RW fixture: focused mark-delivered + mobile-viewport gate proof.',
    currency: 'TZS', askingPrice: 15000, originalPrice: 19000, condition: 'NEW',
  };
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([png('receipt-proof.png')], { type: 'image/png' }), 'receipt-proof.png');
  const pr = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form });
  const prj = await pr.json().catch(() => null);
  log('post-product:', pr.status);
  if (pr.status !== 201) throw new Error('post-product failed');
  const pid = prj.productId || prj.id || (prj.product && (prj.product.productId || prj.id));
  log('logistics:', (await L.api(atok, 'PATCH', `/api/v1/admin/products/${pid}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' })).status);
  log('itemDetails:', (await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${pid}`)).status);

  async function checkout(tag, ft, winDate, slot) {
    const buyDetails = {
      firstName: 'AU038R13First', lastName: 'AU038R13Buyer', emailAddress: fx0.buyer.email,
      phoneNumber: '+255713001333', address: 'AU038R13 Street 5', city: 'Dar es Salaam',
      state: 'Dar es Salaam', country: 'Tanzania', zipCode: '',
      deliveryMethod: ft === 'BUYER_PICKUP' ? 'Pickup' : "Seller's delivery",
      paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true, fulfillmentType: ft, currency: 'TZS',
      latitude: -6.7924, longitude: 39.2083, preferredDeliveryWindows: [{ date: winDate, slot }],
    };
    const pf = await L.api(btok, 'POST', '/api/v1/checkout/proforma', { buyDetails, items: [{ productId: pid, quantity: 1 }] });
    if (![200, 201].includes(pf.status)) throw new Error(`proforma ${tag} ${pf.status}`);
    await L.api(btok, 'POST', `/api/v1/proformas/${pf.json.proformaId}/submit-payment`,
      { transactionReferences: [`AU038R13B-${tag}-${STAMP}`], paymentMethodType: 'MOBILE_MONEY' });
    const rows = (await L.api(btok, 'GET', '/api/v1/orders')).json || [];
    const o = rows.find(x => x.totalAmount === pf.json.grandTotal && !rows.slice(0, rows.indexOf(x)).some(y => y.orderId === x.orderId));
    if (!o) throw new Error(`order ${tag} not found`);
    const cp = await L.api(atok, 'POST', `/api/v1/admin/proformas/${pf.json.proformaId}/confirm-payment`);
    if (![200, 201].includes(cp.status)) throw new Error(`${tag} confirm-payment`);
    return { orderId: String(o.orderId), orderNumber: o.orderNumber };
  }

  const fx = { stamp: STAMP, build_sha: 'c6b4d61', buyer: fx0.buyer, seller: fx0.seller, vectors: {} };
  for (const vp of ['mobile', 'tablet']) {
    const v = {};
    v.pu2 = await checkout(`PU2-${vp}`, 'BUYER_PICKUP', dayPlus(2), 'EVENING');
    let cf = await L.api(stok, 'POST', `/api/v1/orders/${v.pu2.orderId}/confirm-availability`);
    log(`${vp} pu2 confirm-availability:`, cf.status, (cf.json || {}).orderStatus);
    v.ga2 = await checkout(`GA2-${vp}`, 'SELLER_DELIVERY', dayPlus(2), 'MORNING');
    v.dec2 = await checkout(`DEC2-${vp}`, 'SELLER_DELIVERY', dayPlus(2), 'AFTERNOON');
    for (const k of ['pu2', 'ga2', 'dec2']) {
      const d = await L.api(stok, 'GET', `/api/v1/orders/${v[k].orderId}`);
      v[k].status = d.json.status; v[k].total = d.json.totalAmount;
      log(vp, k, v[k].orderNumber, v[k].status, 'total=' + v[k].total);
    }
    fx.vectors[vp] = v;
  }
  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  log('FIXTURES OK ->', OUT);
}
main().catch(e => { console.error('SEED FAIL', e.message); process.exit(1); });
