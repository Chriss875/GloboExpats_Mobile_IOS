// au040_rw_seed.js — RW fixtures for AU-040/AU-041 sell-wizard verification.
// Verifies the sandbox admin user is a VERIFIED seller (it is), and provides a
// fresh listing title stamp for the publish run. No product is created here —
// the wizard itself must create it through the real API during verification.
const fs = require('fs');
process.chdir(require('path').resolve(__dirname,'..'));
const L = require('./lib_verify.js');

(async () => {
  const STAMP = Date.now();
  const tok = await L.apiLogin(L.ADMIN);
  const me = await L.api(tok, 'GET', '/api/v1/userManagement/user-details');
  const uid = me.json && (me.json.userId ?? (me.json.user && me.json.user.userId));
  // fetch live commission rate for a category the wizard will use
  const cats = await L.api(null, 'GET', '/api/v1/products/categories');
  const electronics = (cats.json || []).find(c => c.categoryName === 'Electronics');
  const fx = {
    stamp: STAMP,
    seller: L.ADMIN,
    userId: uid,
    categoryId: electronics ? electronics.categoryId : 1,
    categoryName: electronics ? electronics.categoryName : 'Electronics',
    commissionRate: electronics ? electronics.commissionRate : null,
    listingTitle: `AU040 Wizard Listing ${STAMP}`,
    subcategoryId: 2, // Computers & Laptops
  };
  fs.writeFileSync('/tmp/au040_fixtures.json', JSON.stringify(fx, null, 2));
  console.log('FIXTURES OK', JSON.stringify({userId: uid, cat: fx.categoryId, rate: fx.commissionRate}));
})();
