// au036_seed_r5.js — RW-lane fixture minting for AU-036 r5 through the REAL
// sandbox API (:8083). Mints: throwaway buyer + seller + product + checkout ->
// order S2 (AWAITING_PAYMENT, escrowPending=true) and order RP (seller
// decline-availability -> CANCELLED, REFUND_PENDING). Writes /tmp/au036_r5.json.
// Mutates ONLY what it creates here.
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const OUT = '/tmp/au036_r5.json';
const STAMP = Date.now();
const PW = 'StrongPass!1';
const BUYER_EMAIL = `au036r5buyer${STAMP}@gmail.com`;
const SELLER_EMAIL = `au036r5seller${STAMP}@gmail.com`;
const step = (s, extra) => console.log('[seed]', s, extra === undefined ? '' : JSON.stringify(extra).slice(0, 260));
function png(f){ return fs.readFileSync(path.join(__dirname,'fixtures',f)); }

(async () => {
  const fx = { stamp: STAMP,
    buyer: { email: BUYER_EMAIL, pw: PW }, seller: { email: SELLER_EMAIL, pw: PW } };
  for (const [k, e] of [['buyer', BUYER_EMAIL], ['seller', SELLER_EMAIL]]) {
    const reg = await L.api(null, 'POST', '/api/v1/auth/register',
      { firstName: 'AU036R5', lastName: k === 'buyer' ? 'Buyer' : 'Seller', password: PW, emailAddress: e });
    step(`register ${k}`, reg.status);
    if (![200,201,400,409].includes(reg.status)) throw new Error('register failed '+reg.status);
  }
  fx.buyer.token = await L.apiLogin({ email: BUYER_EMAIL, pw: PW });
  fx.seller.token = await L.apiLogin({ email: SELLER_EMAIL, pw: PW });
  const meB = await L.api(fx.buyer.token,'GET','/api/v1/userManagement/user-details');
  fx.buyer.userId = meB.json && (meB.json.userId ?? (meB.json.user && meB.json.user.userId));
  const meS = await L.api(fx.seller.token,'GET','/api/v1/userManagement/user-details');
  fx.seller.userId = meS.json && (meS.json.userId ?? (meS.json.user && meS.json.user.userId));

  const atok = await L.apiLogin(L.ADMIN); fx.adminToken = atok;
  step('verify seller', (await L.api(atok,'PATCH',`/api/v1/admin/users/${fx.seller.userId}/status`,{status:'VERIFIED'})).status);

  const product = {
    productName: `AU036 R5 Escrow Probe Vase ${STAMP}`,
    productQuantity: 5, categoryId: 3, subcategoryId: 26,
    productCountry:'Tanzania', productRegion:'Dar es Salaam', productStreet:'Mikocheni',
    productDescription: 'AU-036 r5 RW fixture for escrow visibility states (real sandbox purchase).',
    currency:'TZS', askingPrice: 24000, originalPrice: 29000, condition:'NEW',
  };
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))],{type:'application/json'}),'product.json');
  form.append('images', new Blob([png('receipt-proof.png')],{type:'image/png'}),'receipt-proof.png');
  const pr = await fetch(`${L.API}/api/v1/products/post-product`,{method:'POST',headers:{Authorization:'Bearer '+fx.seller.token},body:form});
  step('post-product', pr.status);
  if (pr.status !== 201) throw new Error('post-product failed ' + pr.status);
  const pj0 = await pr.json();
  const pid = pj0.productId || pj0.id || (pj0.product && pj0.product.id);
  fx.productId = pid; step('productId', pid);
  step('logistics', (await L.api(atok,'PATCH',`/api/v1/admin/products/${pid}/logistics`,
    { latitude:-6.7905, longitude:39.2795, deliveryTransportMode:'BODA', neighbourhood:'Mikocheni' })).status);

  const a1 = await L.api(fx.buyer.token,'POST','/api/v1/add-address',{
    street:`AU036 R5 Street ${STAMP}`, city:'Dar es Salaam', region:'Dar es Salaam', country:'Tanzania',
    label:'Home', latitude:-6.7924, longitude:39.2083, isDefault:true, phoneNumber:'+255713000555'});
  step('add-address', a1.status);

  const buyDetails = {
    firstName:'AU036R5', lastName:'Buyer', emailAddress:BUYER_EMAIL, phoneNumber:'+255713000555',
    address:`AU036 R5 Street ${STAMP}`, city:'Dar es Salaam', state:'Dar es Salaam', country:'Tanzania',
    zipCode:'', deliveryMethod:"Seller's delivery", paymentMethodType:'MOBILE_MONEY', agreeToTerms:true,
    fulfillmentType:'SELLER_DELIVERY', currency:'TZS', latitude:-6.7924, longitude:39.2083,
    preferredDeliveryWindows:[{ date:new Date(Date.now()+86400000).toISOString().slice(0,10), slot:'AFTERNOON' }],
  };
  async function checkout(qty){
    const pf = await L.api(fx.buyer.token,'POST','/api/v1/checkout/proforma',{ buyDetails, items:[{ productId: pid, quantity: qty }]});
    if (![200,201].includes(pf.status)) throw new Error('proforma failed '+JSON.stringify(pf.json).slice(0,160));
    const ref = `AU036R5-${STAMP}-${qty}`;
    const sp = await L.api(fx.buyer.token,'POST',`/api/v1/proformas/${pf.json.proformaId}/submit-payment`,
      { transactionReferences:[ref], paymentMethodType:'MOBILE_MONEY' });
    if (![200,201].includes(sp.status)) throw new Error('submit-payment failed '+sp.status+' '+JSON.stringify(sp.json).slice(0,160));
    let ids = ((pf.json.sellerGroups)||[]).map(g=>g.orderId).filter(Boolean);
    if (!ids.length) ids = ((sp.json && sp.json.sellerGroups)||[]).map(g=>g.orderId).filter(Boolean);
    return { proformaId: pf.json.proformaId, proformaNumber: pf.json.proformaNumber,
      grandTotal: pf.json.grandTotal, orderIds: ids, ref };
  }
  // ---- Order A: stays in state 2 (escrowPending) — the V1-fix banner under test
  const A = await checkout(1);
  fx.A = A;
  let oa = null;
  for (const id of A.orderIds){ const d = await L.api(fx.buyer.token,'GET',`/api/v1/orders/${id}`);
    if (d.status===200) oa = d.json; }
  if (!oa) { // discover via list when create payload omits ids
    const rows = await L.api(fx.buyer.token,'GET','/api/v1/orders');
    const arr = Array.isArray(rows.json)?rows.json:[];
    oa = arr.find(o=>o.status==='AWAITING_PAYMENT'&&o.escrowPending===true&&o.totalAmount===A.grandTotal);
  }
  fx.state2 = oa ? { orderId: oa.orderId, orderNumber: oa.orderNumber, status: oa.status,
    escrowPending: oa.escrowPending, paymentStatus: oa.paymentStatus, payoutStatus: oa.payoutStatus,
    totalAmount: oa.totalAmount } : null;
  step('order A (state2)', fx.state2);
  if (!fx.state2) throw new Error('no escrowPending order minted');

  // ---- Order B: admin confirm-payment -> AWAITING_SELLER_CONFIRMATION, then seller
  //      DECLINE availability -> CANCELLED + REFUND_PENDING (the new visible banner)
  const B = await checkout(1);
  fx.B = B;
  let obId = B.orderIds[0];
  if (!obId) {
    const rows = await L.api(fx.buyer.token,'GET','/api/v1/orders');
    const arr = Array.isArray(rows.json)?rows.json:[];
    obId = (arr.filter(o=>o.totalAmount===B.grandTotal&&o.status==='AWAITING_PAYMENT').map(o=>o.orderId))[0];
  }
  const cp = await L.api(atok,'POST',`/api/v1/admin/proformas/${B.proformaId}/confirm-payment`,{});
  step('admin confirm-payment B', cp.status);
  const pre = await L.api(fx.buyer.token,'GET',`/api/v1/orders/${obId}`);
  step('order B after confirm', { status: pre.json && pre.json.status });
  if (!((pre.json||{}).status==='AWAITING_SELLER_CONFIRMATION')) throw new Error('order B not in ASC: '+pre.status+' '+JSON.stringify(pre.json&&{s:pre.json.status}));
  const dec = await L.api(fx.seller.token,'POST',`/api/v1/orders/${obId}/decline-availability`,
    { reason: `AU036 r5 probe: item unavailable (stamp ${STAMP})` });
  step('decline-availability B', { status: dec.status, body: dec.json });
  if (![200,201].includes(dec.status)) throw new Error('decline failed '+dec.status);
  const postB = await L.api(fx.buyer.token,'GET',`/api/v1/orders/${obId}`);
  fx.refundPending = postB.status===200 ? { orderId: postB.json.orderId, orderNumber: postB.json.orderNumber,
    status: postB.json.status, refundStatus: postB.json.refundStatus, payoutStatus: postB.json.payoutStatus,
    totalAmount: postB.json.totalAmount } : null;
  step('order B (refund pending)', fx.refundPending);
  if (!(fx.refundPending && fx.refundPending.refundStatus==='REFUND_PENDING')) throw new Error('REFUND_PENDING not reached');

  fs.writeFileSync(OUT, JSON.stringify(fx,null,1));
  console.log('SEED OK ->', OUT);
})().catch(e => { console.error('SEED FAIL', e.message); process.exit(1); });
