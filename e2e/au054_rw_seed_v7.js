// au054_rw_seed_v7.js — FRESH RW fixtures for AU-054 verify-r7 through the REAL
// sandbox API (:8083) only. Mints a throwaway VERIFIED seller owning 5 listings:
//   ACTIVE   APPROVED/AVAILABLE qty4 price25000 image + clicks bumped via public itemDetails
//   PENDING  PENDING qty2 price9000
//   ARCHIVED APPROVED/AVAILABLE -> real PATCH /products/status/{id} {status:'ARCHIVED'} (two-field row)
//   OOS      APPROVED/AVAILABLE qty0 -> PATCH {status:'OUT_OF_STOCK'}
//   LEGACY   PENDING, no logistics setup (banner probe row)
//   DELETEME APPROVED/AVAILABLE throwaway for the confirmed-delete path
// Writes /tmp/au054v7_fixtures.json. Mutates only what it creates.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const OUT = '/tmp/au054v7_fixtures.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';
const EMAIL = `au054v7seller${STAMP}@gmail.com`;
const PNG = fs.readFileSync(path.join(__dirname, 'fixtures', 'receipt-proof.png'));

const step = (s, x) => console.log('[seed]', s, x !== undefined ? JSON.stringify(x).slice(0, 220) : '');

async function postProduct(tok, p, withImage) {
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(p))], { type: 'application/json' }), 'product.json');
  if (withImage) form.append('images', new Blob([PNG], { type: 'image/png' }), 'active.png');
  const r = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: form });
  const j = await r.json().catch(() => null);
  return { status: r.status, json: j };
}

(async () => {
  // ---- seller account ----
  const reg = await L.api(null, 'POST', '/api/v1/auth/register',
    { firstName: 'AU054V7', lastName: 'Seller', password: PW, emailAddress: EMAIL });
  step('register', { status: reg.status });
  if (![200, 201].includes(reg.status)) throw new Error('register failed ' + JSON.stringify(reg.json));
  const stok = await L.apiLogin({ email: EMAIL, pw: PW });
  const me = await L.api(stok, 'GET', '/api/v1/userManagement/user-details');
  const uid = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  step('userId', uid);
  const atok = await L.apiLogin(L.ADMIN);
  const ver = await L.api(atok, 'PATCH', `/api/v1/admin/users/${uid}/status`, { status: 'VERIFIED' });
  step('verify-seller', { status: ver.status });

  const base = (name, price, qty) => ({
    productName: `AU054 ${name} ${STAMP}`, productQuantity: qty,
    categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: `AU-054 verify-r7 fixture row (${name}). Real sandbox listing.`,
    currency: 'TZS', askingPrice: price, originalPrice: Math.round(price * 1.2), condition: 'NEW',
  });

  async function mk(name, price, qty, withImage) {
    const pr = await postProduct(stok, base(name, price, qty), withImage);
    step(`post ${name}`, { status: pr.status });
    if (![200, 201].includes(pr.status)) throw new Error(`${name} failed ` + JSON.stringify(pr.json).slice(0, 200));
    return pr.json.productId || pr.json.id || (pr.json.product && (pr.json.product.productId || pr.json.id));
  }

  const activeId = await mk('Active Fixture', 25000, 4, true);
  const pendingId = await mk('Pending Fixture', 9000, 2, false);
  const archivedId = await mk('Archived Fixture', 15000, 3, false);
  const oosId = await mk('Outofstock Fixture', 7000, 5, false);
  const legacyId = await mk('Legacy Fixture', 3000, 1, false);
  let deletemeId = await mk('DeleteMe Fixture', 5000, 1, false);

  // ARCHIVED via the REAL status endpoint (backend sets availabilityStatus=ARCHIVED,
  // keeps productStatus=APPROVED — the two-field model this unit tests).
  const pArch = await L.api(stok, 'PATCH', `/api/v1/products/status/${archivedId}`, { status: 'ARCHIVED' });
  step('patch-ARCHIVED', { id: archivedId, status: pArch.status });
  if (![200, 204].includes(pArch.status)) throw new Error('archive patch failed');
  const pOos = await L.api(stok, 'PATCH', `/api/v1/products/status/${oosId}`, { status: 'OUT_OF_STOCK' });
  step('patch-OOS', { id: oosId, status: pOos.status });

  // clicks on the ACTIVE row via the PUBLIC detail endpoint (real view counting).
  let clicks = -1;
  for (let i = 0; i < 6; i++) {
    const d = await L.api(null, 'GET', `/api/v1/displayItem/itemDetails/${activeId}`);
    if (d.status === 200) clicks = Number(d.json && d.json.clickCount) || 0;
    await new Promise(r => setTimeout(r, 350));
  }
  step('clicks-active', clicks);

  const fx = { stamp: STAMP, email: EMAIL, pw: PW, token: stok, userId: uid,
    activeId, pendingId, archivedId, oosId, legacyId, deletemeId, activeClicks: clicks };
  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));

  // ground truth dump for checklist #2
  const gt = await L.api(stok, 'GET', '/api/v1/userManagement/user-details');
  const rows = ((gt.json && gt.json.products) || []).filter(r => fxIds(fx).includes(r.productId));
  fs.writeFileSync('/tmp/au054v7_groundtruth.json', JSON.stringify(rows, null, 2));
  console.log('GROUND TRUTH ROWS:');
  for (const r of rows) {
    console.log(JSON.stringify({ id: r.productId, name: r.productName, ps: r.productStatus,
      as: r.availabilityStatus, qty: r.productQuantity, clicks: r.clickCount, img: !!(r.productImages || []).length }));
  }
  const ord = await L.api(stok, 'GET', '/api/v1/orders');
  const selling = (Array.isArray(ord.json) ? ord.json : []).filter(o => o.orderType === 'selling');
  console.log('SELLING ORDERS:', selling.length, JSON.stringify(selling.map(o => ({ n: o.orderNumber, pay: o.paymentStatus, tot: o.totalAmount }))));
  fx.sellingOrders = selling;
  fs.writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log('FIXTURES OK ->', OUT);
})().catch(e => { console.error('SEED FATAL', e.message); process.exit(1); });

function fxIds(fx) { return [fx.activeId, fx.pendingId, fx.archivedId, fx.oosId, fx.legacyId, fx.deletemeId].filter(Boolean); }
