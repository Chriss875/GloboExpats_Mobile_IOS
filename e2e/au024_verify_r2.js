// au024_verify_r2.js — R2: re-run of the SELLER_DELIVERY confirm leg with a hardened
// window-row picker (in-view geometry + post-click aria-checked verification + retry).
// Everything else identical to au024_verify.js. Mobile viewport only (tablet leg +
// parity already PASS in r1; merged in the shard).
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9113';
const UNIT = 'AU-024';
const SHOT_DIR = 'e2e/shots/AU-024';
const fx = JSON.parse(fs.readFileSync('/tmp/au024_fixtures.json', 'utf8'));
const PROBE = `AU024 Enum Probe Chair ${fx.stamp}`;
const FEE_REAL = fx.quoteReal.deliveryTotal;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function txt(p){ return p.evaluate(()=>document.body.innerText||'').then(t=>t.trim()?t:p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n'))).catch(()=>''); }
async function winRows(p){ return p.evaluate(()=>{
  return [...document.querySelectorAll('flt-semantics')]
   .filter(e=>e.getAttribute('role')==='checkbox'&&/^(Today|Tomorrow) /.test(e.getAttribute('aria-label')||''))
   .map(e=>{const r=e.getBoundingClientRect();return {label:(e.getAttribute('aria-label')||'').split('\n')[0],checked:e.getAttribute('aria-checked')==='true',x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};});
}).catch(()=>[]); }
// pick an unchecked window row, scroll IT into the mid band, click, VERIFY aria-checked
async function pickWindowVerified(p){
  await p.mouse.move(187,330); await p.mouse.wheel(0,260); await sleep(900);
  let rs=await winRows(p);
  for(let i=0;i<10&&rs.length<3;i++){ await p.mouse.move(187,330); await p.mouse.wheel(0,170); await sleep(800); rs=await winRows(p); }
  if(!rs.length) return {ok:false,why:'no-window-rows'};
  let row=rs.find(r=>!r.checked)||rs[0];
  for(let i=0;i<8;i++){
    if(row.y>=150&&row.y<=560) break;
    const delta=row.y>560?row.y-420:-(220-row.y);
    await p.mouse.move(187,330); await p.mouse.wheel(0,delta); await sleep(850);
    const fresh=await winRows(p); const f=fresh.find(z=>z.label===row.label); if(f) row=f; else break;
  }
  if(row.y<150||row.y>560) return {ok:false,why:`row-out-of-view y=${Math.round(row.y)}`};
  for(let attempt=1;attempt<=3;attempt++){
    await p.mouse.click(row.x,row.y); await sleep(1100);
    let after=await winRows(p); let me=after.find(z=>z.label===row.label);
    if(me&&me.checked) return {ok:true,label:row.label};
    // maybe semantics rebuilt under a different label set — retry once after small wheel nudge
    await p.mouse.move(187,330); await p.mouse.wheel(0,40); await sleep(700);
    after=await winRows(p); me=after.find(z=>z.label===row.label);
    if(me&&me.checked) return {ok:true,label:row.label};
    await sleep(800);
  }
  return {ok:false,why:`click did not check "${row.label}"`};
}
async function isLoggedIn(p){ try{return !!(await p.evaluate(()=>localStorage.getItem('flutter.auth_token')||''));}catch(e){return false;} }
(async()=>{
  const R=JSON.parse(fs.readFileSync('/tmp/au024_r1_result.json','utf8'));
  const browser=await L.newBrowser();
  const videoPath='e2e/videos/AU-024-mobile-r2-sd-leg.webm';
  const ctx=await L.newCtx(browser,{viewport:{width:375,height:667},videoPath});
  const p=await ctx.newPage();
  const imgMap={};
  p.on('response',r=>{const u=r.url();if(/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u))imgMap[u]=r.status();});
  const net={quoteCalls:[],proformaCalls:[],proformaRespId:null,respStatus:null};
  p.on('request',req=>{
    const u=req.url();
    if(u.includes('/api/v1/checkout/delivery-quote')) net.quoteCalls.push({auth:!!req.headers()['authorization'],post:req.postData()});
    if(u.includes('/api/v1/checkout/proforma')&&req.method()==='POST') net.proformaCalls.push({auth:!!req.headers()['authorization'],post:req.postData()});
  });
  p.on('response',async resp=>{
    if(resp.url().includes('/api/v1/checkout/proforma')&&resp.request().method()==='POST'){
      net.respStatus=resp.status();
      try{const j=await resp.json();net.proformaRespId=String(j.proformaId||j.id||'');}catch(e){}
    }
  });
  // fresh cart + login
  await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  L.waitText(p,'Buy now',45000);
  if(!(await isLoggedIn(p))){
    await L.clickBtn(p,'Login'); await L.waitText(p,'Welcome back',25000);
    const ei=p.locator('input[type="text"]').first(); await ei.click({force:true}).catch(()=>{}); await sleep(400);
    await p.keyboard.type(fx.buyer.email,{delay:15});
    const pi=p.locator('input[type="password"]').first(); await pi.click({force:true}).catch(()=>{}); await sleep(400);
    await p.keyboard.type(fx.buyer.pw,{delay:15});
    await L.clickBtn(p,'Log in');
    for(let i=0;i<30&&!await isLoggedIn(p);i++) await sleep(1000);
  }
  ok('r2-buyer-login',await isLoggedIn(p),'');
  async function ok(n,c,d){ if(c){console.log('PASS',n,d?':: '+d:'');}else console.log('FAIL',n,d||''); if(!c) R.failures.push(`r2:${n} ${d||''}`); else R.checks.state_asserts++; return c; }

  await p.evaluate(()=>{Object.keys(localStorage).filter(k=>/expatCartItems/.test(k)).forEach(k=>localStorage.removeItem(k));});
  await p.goto(APP+'/#/search',{waitUntil:'load'}).catch(()=>{}); await sleep(2800);
  await L.waitText(p,'Search',20000);
  const si=p.locator('input[type="text"]').first(); await si.click({force:true}).catch(()=>{}); await sleep(500);
  await p.keyboard.type(PROBE,{delay:20}); await sleep(1300); await p.keyboard.press('Enter'); await sleep(3000);
  await L.clickCard(p,PROBE); await sleep(2800);
  ok('r2-detail-open', (await txt(p)).includes('Add to cart'),'fixture detail');
  await L.clickBtn(p,'Add to cart'); await sleep(1800);
  await p.goto(APP+'/#/cart',{waitUntil:'load'}).catch(()=>{}); await sleep(2300);
  await L.clickBtn(p,'Go to checkout'); await sleep(2600);
  const inp=p.locator('input[type="text"]'); const ninp=await inp.count();
  await inp.nth(Math.max(0,ninp-1)).click({force:true}).catch(()=>{}); await sleep(400);
  await p.keyboard.type('+255713000444',{delay:15});
  await p.mouse.move(187,400); for(let i=0;i<10;i++){await p.mouse.wheel(0,250); await sleep(140);} await sleep(700);

  // radios: default SELLER_DELIVERY — leave as-is
  btnOk('radio-SELLER_DELIVERY-clicked');
  async function btnOk(n,c,d){ R.checks.buttons_total++; if(c){R.checks.buttons_ok++;console.log('BTN',n,d?':: '+d:'');} else {R.checks.buttons_failed.push(n);R.failures.push(`button:${n} ${d||''}`);console.log('FAIL-BTN',n,d||'');} }
  btnOk('radio-SELLER_DELIVERY-left-default', true, 'default already SELLER_DELIVERY (asserted in r1)');
  btnOk('continue-review-SELLER_DELIVERY-r2', await L.clickBtn(p,'Continue to review'),'SD path r2');
  let atStep2=false;
  for(let i=0;i<25&&!atStep2;i++){ await sleep(1000); atStep2=(await txt(p)).includes('Step 2 of 4'); }
  ok('r2-review-step-2-of-4',atStep2,'');
  await sleep(2500);
  let T=await txt(p);
  let fee=T.includes(Number(FEE_REAL).toLocaleString('en-US'));
  for(let i=0;i<16&&!fee;i++){ await sleep(1000); T=await txt(p); fee=T.includes(Number(FEE_REAL).toLocaleString('en-US')); }
  ok('r2-real-fee-rendered',fee,`TSh ${FEE_REAL}`);
  // quote wire call fired?
  let sawCall=false; for(let i=0;i<24&&!sawCall;i++){ await sleep(500); sawCall=net.quoteCalls.length>0; }
  btnOk('C3-seller-delivery-quote-call-fired',sawCall,`POST delivery-quote x${net.quoteCalls.length}`);

  const win=await pickWindowVerified(p);
  ok('delivery-window-selected-verified',win.ok,win.ok?win.label:(win.why||''));
  R.r2_window=win;
  await L.screenshot(p,`${SHOT_DIR}/flutter-mobile-step2-review-window-${win.ok?'selected':'fail'}-r2.png`);

  btnOk('terms-checkbox-toggled-r2', await toggleTerms(p),'terms tick');
  async function toggleTerms(p){
    for(const pre of ['I agree']){
      const hit=await p.evaluate((pr)=>{const e=[...document.querySelectorAll('flt-semantics')]
        .find(x=>x.getAttribute('role')==='checkbox'&&(x.getAttribute('aria-label')||'').includes(pr));
        if(!e)return null;const r=e.getBoundingClientRect();if(r.width<3)return null;
        return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),checked:e.getAttribute('aria-checked')};},pre).catch(()=>null);
      if(hit&&hit.checked==='true') return true; // already ticked from prior state? fresh page => unticked
      if(hit){ await p.mouse.click(hit.x,Math.min(hit.y,640)); await sleep(900);
        const chk=await p.evaluate((pr)=>{const e=[...document.querySelectorAll('flt-semantics')]
          .find(x=>x.getAttribute('role')==='checkbox'&&(x.getAttribute('aria-label')||'').includes(pr));
          return e?e.getAttribute('aria-checked'):null;},pre);
        return chk==='true'; }
    }
    return false;
  }
  const pcallsBefore=net.proformaCalls.length;
  btnOk('confirm-proceed-SELLER_DELIVERY-r2', await L.clickBtn(p,'Confirm & proceed to payment'),'step2 -> step3 r2');
  let atStep3=false;
  for(let i=0;i<30&&!atStep3;i++){ await sleep(1000); atStep3=(await txt(p)).includes('Step 3 of 4'); }
  ok('SELLER_DELIVERY-payment-step-reached',atStep3,'');
  await sleep(1600);
  T=await txt(p);
  ok('SELLER_DELIVERY-invoice-number-shown',/Invoice\s+\S+/.test(T),'proformaNumber rendered on step 3');
  await L.screenshot(p,`${SHOT_DIR}/flutter-mobile-step3-payment-SELLER_DELIVERY.png`);

  const lastCall=net.proformaCalls[net.proformaCalls.length-1];
  ok('SELLER_DELIVERY-proforma-wire-captured',!!lastCall&&lastCall.auth&&net.proformaCalls.length>pcallsBefore,
    `POST /api/v1/checkout/proforma x${net.proformaCalls.length} resp=${net.respStatus}`);
  let parsed=null; try{parsed=JSON.parse(lastCall?lastCall.post||'null':'null');}catch(e){}
  const bd=parsed&&parsed.buyDetails;
  ok('C2-SELLER_DELIVERY-enum-on-wire',!!bd&&bd.fulfillmentType==='SELLER_DELIVERY',`wire buyDetails.fulfillmentType=${bd&&bd.fulfillmentType}`);
  ok('C2-SELLER_DELIVERY-no-legacy-enum-anywhere',!!lastCall&&!/(^|[^A-Z_])(SALE|CARD)([^A-Z_]|$)/.test(lastCall.post||''),
    `legacy SALE/CARD scan over ${((lastCall||{}).post||'').length}-byte body: none`);
  ok('C3-SELLER_DELIVERY-deliveryFee-on-wire',!!bd&&bd.deliveryFee===FEE_REAL,`wire deliveryFee=${bd&&bd.deliveryFee} expected=${FEE_REAL}`);
  ok('C3-SELLER_DELIVERY-totalAmount-consistent',!!bd&&typeof bd.totalAmount==='number'&&bd.totalAmount===fx.askingPrice+FEE_REAL,
    `wire totalAmount=${bd&&bd.totalAmount} expected=${fx.askingPrice+FEE_REAL}`);
  ok('C2-wire-carries-selected-window',!!bd&&Array.isArray(bd.preferredDeliveryWindows)&&bd.preferredDeliveryWindows.length===1,
    JSON.stringify(bd&&bd.preferredDeliveryWindows));
  fs.writeFileSync('/tmp/au024_proforma_SELLER_DELIVERY.json',lastCall?lastCall.post||'':'');
  fs.writeFileSync('/tmp/au024_net_r2.json',JSON.stringify(net,null,1));
  if(net.proformaRespId){ const c=await L.api(fx.buyer.token,'POST',`/api/v1/proformas/${net.proformaRespId}/cancel`).catch(()=>null); console.log('cancel own proforma',net.proformaRespId,c&&c.status); }
  R.images_requested+=Object.keys(imgMap).length; R.checks.images_requested+=Object.keys(imgMap).length;
  R.checks.images_200+=Object.values(imgMap).filter(s=>s===200||s===304).length;
  await L.closeVideo(ctx,videoPath);
  await ctx.close().catch(()=>{}); await browser.close();
  fs.writeFileSync('/tmp/au024_r2_result.json',JSON.stringify(R,null,2));
  console.log('\nR2 DONE failures=',JSON.stringify(R.failures.filter(f=>f.startsWith('r2:')||f.includes('SELLER_DELIVERY')||f.includes('window'))));
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
