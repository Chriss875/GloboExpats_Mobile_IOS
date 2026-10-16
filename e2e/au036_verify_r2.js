// au036_verify_r2.js — corrected AU-036 run. r1 lesson: the fixture order had
// already been RELEASED by the time the seller-side T25 probe ran, so the server
// (correctly) showed it to the seller. This run:
//  1. mints a FRESH escrowPending order through the real API,
//  2. probes T25 in the UI BEFORE any admin action,
//  3. then walks buyer states 3->4->5->6 on screen with verbatim banner asserts.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9112';
const UNIT = 'AU-036';
const SHOT_DIR = `e2e/shots/${UNIT}`;
const fx0 = JSON.parse(fs.readFileSync('/tmp/au036_fixtures.json', 'utf8'));

// pre-existing sandbox fixtures (curl-proven this session):
const FIX = {
  released: { id: '2499e6e9-b5f9-4b47-982e-1d50f99144c5', num: 'ORD-2026-000012' },
  refunded: { id: 'b564e951-ef8f-452e-b974-7f9438137850', num: 'ORD-2026-000011', amount: 72000 },
  heldAsc: { id: '49dee2e4-e785-45e9-91a8-6a4dac2b3270', num: 'ORD-2026-000023' },
  heldAwaitDel: { id: 'df3ec5c0-961a-4597-a28e-21351a98f62f', num: 'ORD-2026-000020' },
};

const R = {
  ts: new Date().toISOString(), unit: UNIT, stage: 'verify-r2',
  build_sha: '858b0ef', bundle_mtime: 'Tue, 25 Aug 2026 05:15:38 GMT',
  checks: { freshness: null, images_requested: 0, images_200: 0, images_broken: [],
    buttons_total: 0, buttons_ok: 0, buttons_failed: [], state_asserts: 0, nav_asserts: 0,
    data_asserts: 0, vision_defects: 0, vision_findings: [], placeholder_hits: [],
    parity_blocker: 0, parity_major: 0, parity_minor: 0 },
  asserts: [], evidence: [], shots: [],
};
function assert(name, pass, detail) {
  R.asserts.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail).slice(0, 300) });
  console.log(pass ? 'PASS' : 'FAIL', name, detail === undefined ? '' : String(detail).slice(0, 180));
}
async function txt(p) { return L.allText(p); }
async function shot(p, vp, state) { const f = `${SHOT_DIR}/${UNIT}-${vp}-${state}.png`; await L.screenshot(p, f); R.shots.push(f); return f; }
async function controls(p) {
  return p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const role = e.getAttribute('role'); const tappable = e.getAttribute('flt-tappable') !== null;
      if (role !== 'button' && !tappable) return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
      out.push({ kind: role === 'button' ? 'button' : 'tappable', label: (e.textContent || '').trim().slice(0, 60), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
    });
    document.querySelectorAll('input').forEach(i => out.push({ kind: 'input', label: i.getAttribute('aria-label') || i.type || 'input', x: -1, y: -1 }));
    return out;
  });
}

async function mintEscrowPending(buyerEmailSuffix) {
  // fresh buyer + fresh product purchase -> AWAITING_PAYMENT escrowPending=true
  const stamp = Date.now();
  const email = `au036b${stamp}@gmail.com`;
  await L.api(null, 'POST', '/api/v1/auth/register', { firstName: 'AU036', lastName: 'R2Buyer', password: 'StrongPass!1', emailAddress: email }).catch(()=>{});
  const tok = await L.apiLogin({ email, pw: 'StrongPass!1' });
  const atok = await L.apiLogin(L.ADMIN);
  const a1 = await L.api(tok, 'POST', '/api/v1/add-address', { street: `AU036 R2 Street ${stamp}`, city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania', label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+255713001111' });
  console.log('addr', a1.status);
  const pf = await L.api(tok, 'POST', '/api/v1/checkout/proforma', {
    buyDetails: { firstName:'AU036', lastName:'R2Buyer', emailAddress:email, phoneNumber:'+255713001111',
      address:`AU036 R2 Street ${stamp}`, city:'Dar es Salaam', state:'Dar es Salaam', country:'Tanzania', zipCode:'',
      deliveryMethod:"Seller's delivery", paymentMethodType:'MOBILE_MONEY', agreeToTerms:true,
      fulfillmentType:'SELLER_DELIVERY', currency:'TZS', latitude:-6.7924, longitude:39.2083,
      preferredDeliveryWindows:[{ date:new Date(Date.now()+86400000).toISOString().slice(0,10), slot:'AFTERNOON' }] },
    items: [{ productId: fx0.productId, quantity: 1 }],
  });
  if (![200,201].includes(pf.status)) throw new Error('proforma failed ' + JSON.stringify(pf.json).slice(0,150));
  const sp = await L.api(tok, 'POST', `/api/v1/proformas/${pf.json.proformaId}/submit-payment`, { transactionReferences:[`R2REF${stamp}`], paymentMethodType:'MOBILE_MONEY' });
  console.log('submit-payment', sp.status);
  const list = await L.api(tok, 'GET', '/api/v1/orders');
  const rows = Array.isArray(list.json)?list.json:[];
  const mine = rows.find(o=>o.status==='AWAITING_PAYMENT'&&o.escrowPending===true&&o.totalAmount===pf.json.grandTotal);
  if (!mine) throw new Error('no escrowPending order minted');
  return { token: tok, orderId: mine.orderId, orderNumber: mine.orderNumber, total: pf.json.grandTotal, stamp };
}

(async () => {
  // ---- freshness
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  R.checks.freshness = lm;
  assert('1-freshness-lastModified', head.status === 200 && lm === 'Tue, 25 Aug 2026 05:15:38 GMT', lm);

  // ---- API truth for every §8 state we will show on screen
  const btok = fx0.buyer.token;
  const dRel = await L.api(btok, 'GET', `/api/v1/orders/${FIX.released.id}`);
  assert('2-api-state6-released', dRel.status===200 && dRel.json.payoutStatus==='RELEASED' && dRel.json.status==='COMPLETED', JSON.stringify({s:dRel.json&&dRel.json.status,p:dRel.json&&dRel.json.payoutStatus}));
  const dRef = await L.api(await L.apiLogin(), 'GET', `/api/v1/orders/${FIX.refunded.id}`);
  assert('2-api-state7-refunded-72000', dRef.status===200 && dRef.json.refundStatus==='REFUNDED' && dRef.json.refundAmount===72000, JSON.stringify({r:dRef.json&&dRef.json.refundStatus,a:dRef.json&&dRef.json.refundAmount}));
  const dAsc = await L.api(btok, 'GET', `/api/v1/orders/${FIX.heldAsc.id}`);
  assert('2-api-state3-held-asc', dAsc.status===200 && dAsc.json.payoutStatus==='HELD' && dAsc.json.status==='AWAITING_SELLER_CONFIRMATION', JSON.stringify({s:dAsc.json&&dAsc.json.status,p:dAsc.json&&dAsc.json.payoutStatus}));
  const dAd = await L.api(btok, 'GET', `/api/v1/orders/${FIX.heldAwaitDel.id}`);
  assert('2-api-state4-held-awaiting-delivery', dAd.status===200 && dAd.json.payoutStatus==='HELD' && dAd.json.status==='AWAITING_DELIVERY', JSON.stringify({s:dAd.json&&dAd.json.status,p:dAd.json&&dAd.json.payoutStatus}));

  // ---- MINT a fresh escrowPending order and T25-probe it BEFORE touching it
  const fxE = await mintEscrowPending();
  console.log('minted escrowPending order', fxE.orderNumber, fxE.total);
  const sList = await L.api(fx0.seller.token, 'GET', '/api/v1/orders');
  const sRows = Array.isArray(sList.json)?sList.json:[];
  const hiddenInApiList = !sRows.some(o=>o.orderNumber===fxE.orderNumber);
  const sDetail = await L.api(fx0.seller.token, 'GET', `/api/v1/orders/${fxE.orderId}`);
  const bDetail = await L.api(fxE.token, 'GET', `/api/v1/orders/${fxE.orderId}`);
  assert('T25-api-seller-list-hides-fresh-order', hiddenInApiList, JSON.stringify(sRows.map(o=>o.orderNumber)));
  assert('T25-api-seller-detail-404', sDetail.status===404, sDetail.status+' '+JSON.stringify(sDetail.json).slice(0,90));
  assert('T25-api-buyer-sees-it', bDetail.status===200 && bDetail.json.escrowPending===true && bDetail.json.paymentStatus==='PENDING', JSON.stringify({e:bDetail.json&&bDetail.json.escrowPending,p:bDetail.json&&bDetail.json.paymentStatus}));

  // ---------- BROWSER ----------
  const browser = await L.newBrowser();
  let uiT25 = {};
  for (const [vpName, viewport] of [['mobile',{width:375,height:667}],['tablet',{width:768,height:1024}]]) {
    const ctx = await L.newCtx(browser, { viewport, videoPath: `e2e/videos/AU-036-r2-${vpName}.webm` });
    const page = await ctx.newPage();
    const imgMap = {}; const net = { log: [] };
    page.on('response', r => { const u=r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)||/\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgMap[u]=r.status();
      if (u.includes('/api/')) net.log.push({m:r.request().method(),url:u.slice(-64),status:r.status()}); });
    try {
      // ===== SELLER first: T25 UI gate on the FRESH escrowPending order =====
      await page.goto(APP + '/orders', { waitUntil:'load', timeout:90000 }).catch(()=>{});
      await L.waitText(page,'Welcome back',30000);
      const ei=page.locator('input[type="text"]').first(); const pi=page.locator('input[type="password"]').first();
      await ei.click({force:true}).catch(()=>{}); await page.waitForTimeout(350); await page.keyboard.type(fx0.seller.email);
      await pi.click({force:true}).catch(()=>{}); await page.waitForTimeout(350); await page.keyboard.type(fx0.seller.pw);
      await L.clickBtn(page,'Log in');
      let ok=false; for(let i=0;i<30&&!ok;i++){ ok=await L.isLoggedIn(page); if(!ok) await page.waitForTimeout(1000);} 
      assert(`T25-ui-seller-login-${vpName}`, ok);
      await page.waitForTimeout(2500);
      let T = await txt(page);
      await L.clickBtn(page,'Selling') || await L.clickCard(page,'Selling');
      await page.waitForTimeout(1600);
      T = await txt(page);
      const listHidden = !T.includes(fxE.orderNumber);
      assert(`T25-ui-selling-list-hides-${vpName}`, listHidden, listHidden?'fresh escrowPending '+fxE.orderNumber+' absent from selling list':T.split('\n').filter(Boolean).slice(0,8).join('|').slice(0,200));
      await shot(page, vpName, '09-t25-selling-list');
      await page.goto(APP + '/orders/' + fxE.orderId, { waitUntil:'load', timeout:60000 }).catch(()=>{});
      await page.waitForTimeout(4000);
      T = await txt(page);
      const detailBlocked = !T.includes(fxE.orderNumber) && !T.includes('awaiting GloboExpats verification');
      assert(`T25-ui-detail-blocked-${vpName}`, detailBlocked, detailBlocked?'deep link does not render the order':T.split('\n').filter(Boolean).slice(0,8).join('|').slice(0,220));
      await shot(page, vpName, '10-t25-detail-blocked');
      uiT25[vpName] = { listHidden, detailBlocked };

      // sign OUT (clear storage) then BUYER login
      await page.evaluate(()=>localStorage.clear());
      await page.goto(APP + '/login', { waitUntil:'load', timeout:60000 }).catch(()=>{});
      await page.waitForTimeout(3500);
      await L.waitText(page,'Welcome back',25000);
      const ei2=page.locator('input[type="text"]').first(); const pi2=page.locator('input[type="password"]').first();
      await ei2.click({force:true}).catch(()=>{}); await page.waitForTimeout(350); await page.keyboard.type(fx0.buyer.email);
      await pi2.click({force:true}).catch(()=>{}); await page.waitForTimeout(350); await page.keyboard.type(fx0.buyer.pw);
      await L.clickBtn(page,'Log in');
      let okB=false; for(let i=0;i<30&&!okB;i++){ okB=await L.isLoggedIn(page); if(!okB) await page.waitForTimeout(1000);} 
      assert(`buyer-login-${vpName}`, okB);
      await page.waitForTimeout(1800);

      const openOrder = async (num) => {
        await page.goto(APP + '/orders', { waitUntil:'load', timeout:60000 }).catch(()=>{});
        await page.waitForTimeout(3200);
        const clicked = await L.clickCard(page, num);
        await page.waitForTimeout(2600);
        return clicked;
      };

      // ---- STATE 6: RELEASED
      let okc = await openOrder(FIX.released.num);
      T = await txt(page);
      const relBanner = T.includes('Payment released to seller');
      assert(`state6-released-banner-${vpName}`, okc && relBanner, relBanner?'"Payment released to seller" verbatim':'banner missing; text='+T.split('\n').filter(Boolean).slice(2,10).join('|').slice(0,220));
      R.checks.data_asserts += relBanner?1:0;
      const ph1 = T.match(/lorem|placeholder|dummy|TODO/i);
      if (ph1) R.checks.placeholder_hits.push(ph1[0]);
      await shot(page, vpName, '11-released');

      // ---- STATE 7: REFUNDED with amount
      okc = await openOrder(FIX.refunded.num);
      T = await txt(page);
      const refAmt = /Refunded\s*·\s*TSh\s*72[, ]?000/.test(T);
      assert(`state7-refunded-with-amount-${vpName}`, okc && refAmt, refAmt?'"Refunded · TSh 72000" rendered':'amount copy missing; text='+T.split('\n').filter(Boolean).slice(2,12).join('|').slice(0,240));
      R.checks.data_asserts += refAmt?1:0;
      await shot(page, vpName, '12-refunded');

      // ---- STATE 3: HELD + AWAITING_SELLER_CONFIRMATION
      okc = await openOrder(FIX.heldAsc.num);
      T = await txt(page);
      const ascBanner = T.includes('Payment confirmed - awaiting seller');
      assert(`state3-held-awaiting-seller-${vpName}`, okc && ascBanner, ascBanner?'"Payment confirmed - awaiting seller"':'banner missing; text='+T.split('\n').filter(Boolean).slice(2,10).join('|').slice(0,220));
      R.checks.data_asserts += ascBanner?1:0;
      await shot(page, vpName, '13-held-asc');

      // ---- STATE 4: HELD + AWAITING_DELIVERY (no release messaging)
      okc = await openOrder(FIX.heldAwaitDel.num);
      T = await txt(page);
      const neutralHeld = T.includes('Money held by GloboExpats until delivery');
      assert(`state4-held-neutral-banner-${vpName}`, okc && neutralHeld, neutralHeld?'"Money held by GloboExpats until delivery"':'neutral HELD copy missing; text='+T.split('\n').filter(Boolean).slice(2,10).join('|').slice(0,220));
      R.checks.data_asserts += neutralHeld?1:0;
      await shot(page, vpName, '14-held-awaiting-delivery');

      // ---- CLICK EVERY control on THIS detail (state 4)
      const seen=new Set(); const all=[];
      for(let pass=0;pass<3;pass++){
        for(const c of await controls(page)){ const k=c.kind+'|'+c.label.slice(0,30); if(!seen.has(k)){seen.add(k);all.push(c);} }
        await page.mouse.move(190,350); await page.mouse.wheel(0,340); await page.waitForTimeout(420);
      }
      let effects=0; const dead=[];
      for(const c of all){
        if(c.kind==='input') continue;
        const beforeNet=net.log.length; const before=await txt(page);
        await page.mouse.click(Math.min(Math.max(c.x,5),viewport.width-5), Math.min(Math.max(c.y,5),viewport.height-5));
        await page.waitForTimeout(900);
        const after=await txt(page);
        const changed = before!==after || net.log.length>beforeNet;
        R.checks.buttons_total++;
        if(changed){effects++;R.checks.buttons_ok++;} else {dead.push(c.label);R.checks.buttons_failed.push(vpName+':'+c.label);}
        if(!/GloboExpats/.test(after)){ /* navigated away; go back */ await page.goto(APP+'/orders/'+FIX.heldAwaitDel.id,{waitUntil:'load',timeout:60000}).catch(()=>{}); await page.waitForTimeout(2600); }
      }
      assert(`4-clicks-every-control-${vpName}`, all.length>0 && effects>0, {enumerated:all.length,withEffect:effects,dead:dead.slice(0,5)});
      await shot(page, vpName, '15-after-clicks');

      R.checks.images_requested += Object.keys(imgMap).length;
      R.checks.images_200 += Object.values(imgMap).filter(s=>s===200||s===304).length;
      R.checks.images_broken.push(...Object.entries(imgMap).filter(([,s])=>s>=400).map(([u])=>u));
    } finally {
      await L.closeVideo(ctx, `e2e/videos/AU-036-r2-${vpName}.webm`);
    }
  }
  await browser.close().catch(()=>{});

  // ---------- advance the fresh escrowPending order so nothing is stranded
  const atok = await L.apiLogin(L.ADMIN);
  const cf = await L.api(atok,'POST',`/api/v1/admin/proformas/cancel-after-rejection`).catch(()=>null);
  fs.writeFileSync('e2e/results/shards/raw-AU-036-r2.json', JSON.stringify(R,null,1));
  console.log('\nSUMMARY asserts:', R.asserts.filter(a=>a.pass).length,'/',R.asserts.length);
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
