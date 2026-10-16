// au032_sk2_stage1.js — SKEPTIC r14 stage1: happy-path regression on FROZEN :9131
// + attack A (rapid double-tap Confirm) + attack B (out-of-order back-out).
const S = require('./au032_sk2_lib.js');
const L = S.L; const fs = require('fs');
const { fx, sleep } = S;
const R = { ts:new Date().toISOString(), unit:'AU-032', stage:'skeptic-r14-stage1', wave:'skeptic',
  build_sha:S.BUILD_SHA, bundle_mtime:null, asserts:[], attacks:[], shots:[], videos:[] };
function A(name, pass, detail=''){ R.asserts.push({name,pass:!!pass,detail:String(detail).slice(0,300)}); console.log((pass?'PASS ':'FAIL ')+name+(detail?' :: '+String(detail).slice(0,150):'')); }
function AT(name, result, detail=''){ R.attacks.push({name,result,detail:String(detail).slice(0,300)}); console.log('ATTACK '+result+' '+name+' :: '+String(detail).slice(0,180)); }
async function driveToPayment(p, tag){
  await p.evaluate(id=>{location.hash='#/product/'+id;}, fx.productId);
  for(let i=0;i<20;i++){ await sleep(1000); if((await S.txt(p)).includes('AU032 Cancel Tote')) break; }
  const add = await S.tap(p,'Add to cart',3); A(tag+'-add-to-cart',add);
  await S.hashNav(p,'#/cart');
  for(let i=0;i<12;i++){ await sleep(900); if((await S.txt(p)).includes('Go to checkout')) break; }
  A(tag+'-go-to-checkout', await S.tap(p,'Go to checkout',4),'cart -> step1');
  let at1=false; for(let i=0;i<25&&!at1;i++){ await sleep(1000); at1=/Step 1 of 4/.test(await S.txt(p)); }
  A(tag+'-checkout-step1',at1);
  // phone field may be empty on a fresh profile
  const phEmpty = await p.evaluate(()=>{ const i=[...document.querySelectorAll('input')].find(i=>{const s=i.closest('flt-semantics'); return s&&/WhatsApp phone number/i.test(s.textContent||'');}); return i?(i.value||''):null; });
  if(phEmpty!==null && phEmpty.length===0){
    const h = await S.hit(p,'WhatsApp phone number');
    if(h){ await p.mouse.click(h.x,h.y); await sleep(400); } else { await p.locator('input').last().click({force:true}).catch(()=>{}); }
    await sleep(300); await p.keyboard.type('+2557'+String(fx.stamp).slice(-9),{delay:9});
  }
  await L.scrollToBottom(p,10); await sleep(500);
  A(tag+'-continue-to-review', await S.tap(p,'Continue to review',4));
  let at2=false; for(let i=0;i<28&&!at2;i++){ await sleep(1000); at2=/Step 2 of 4/.test(await S.txt(p)); }
  A(tag+'-review-step2',at2);
  await L.scrollToBottom(p,18); await sleep(600);
  const win = await tickBox(p,'first'); const terms = await tickBox(p,'last');
  A(tag+'-tick-window',win); A(tag+'-tick-terms',terms);
  return await S.tap(p,'Confirm & proceed to payment',3);
}
async function tickBox(p, which){
  const t = await p.evaluate((w)=>{
    const rows=[...document.querySelectorAll('flt-semantics')].filter(e=>e.getAttribute('role')==='checkbox')
      .map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,h:r.height,w:r.width};})
      .filter(b=>b.w>5&&b.h>5&&b.y>40&&(b.y+b.h)<innerHeight-6);
    if(!rows.length) return null;
    const b = w==='first'?rows[0]:rows[rows.length-1];
    return {x:b.x+18,y:Math.min(Math.max(b.y+b.h/2,22),663)};
  },which);
  if(!t) return false;
  await p.mouse.click(t.x,t.y); await sleep(800);
  return true;
}
async function proformas(tok){ const r=await L.api(tok,'GET','/api/v1/payments/my'); return Array.isArray(r.json)?r.json:[]; }
(async()=>{
  const head = await fetch(S.APP+'/main.dart.js',{method:'HEAD'});
  R.bundle_mtime = head.headers.get('last-modified');
  A('freshness-frozen-e694463', head.status===200 && R.bundle_mtime===S.BUILD_MT, `${head.status} ${R.bundle_mtime}`);

  const btok=(await L.api(null,'POST','/api/v1/auth/login',{email:fx.buyer.email,password:fx.buyer.pw})).json.token;
  fx.buyer.token = btok;
  const det=await L.api(btok,'GET',`/api/v1/displayItem/itemDetails/${fx.productId}`);
  A('fixture-product-live', det.status===200&&det.json.productName.includes('AU032 Cancel Tote'), `qty=${det.json.productQuantity}`);
  // cleanup any leftover pending proforma from earlier attempts
  for(const o of await proformas(btok)) if(o.status==='PENDING_PAYMENT'){ await L.api(btok,'POST',`/api/v1/proformas/${o.proformaId}/cancel`,{}); }

  const b = await L.newBrowser();
  const ctx = await L.newCtx(b,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-032-sk-r14-mobile.webm'});
  const p = await ctx.newPage();
  const imgMap={};
  p.on('response',r=>{const u=r.url(); if(/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)||/\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgMap[u]=r.status();});
  try{
    A('login-buyer', await S.loginUi(p), fx.buyer.email.slice(0,14));
    const preQty = await S.qty(btok);
    A('drive-to-payment-step3', await driveToPayment(p,'s1'));
    let T=''; for(let i=0;i<32;i++){ await sleep(1000); T=await S.txt(p); if(/How will you pay\?/.test(T)) break; }
    const pfM=(T.match(/PF-\d{4}-\d{6}/)||[])[0]||''; const pfId=((T.match(/PF-\d{4}-\d{6}/)||[''])[0]);
    A('step3-mounted-invoice-shown', /How will you pay\?/.test(T)&&/^PF-\d{4}-\d{6}$/.test(pfM), pfM);
    const duringQty = await S.qty(btok);
    A('stock-reserved-at-step3', duringQty===preQty-1, `pre=${preQty} during=${duringQty} expect ${preQty-1}`);
    await S.shot(p,'sk14-m-01-step3');

    // --- visible Back must be ABSENT at step 3 ---
    const backVis = await S.vis(p,'Back');
    A('a-back-absent-visible-step3', !backVis, backVis?'a visible Back node found':'no visible Back');
    const cancelVis = await S.vis(p,'Cancel invoice');
    A('a-cancel-invoice-present', cancelVis, '');

    // ================= ATTACK A: rapid double-tap on Confirm & proceed =================
    // fresh cart first
    await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await sleep(5000);
    A('atkA-drive2-payment', await driveToPayment(p,'atkA'));
    let T2=''; for(let i=0;i<32;i++){ await sleep(1000); T2=await S.txt(p); if(/How will you pay\?/.test(T2)) break; }
    const pf2=(T2.match(/PF-\d{4}-\d{6}/)||[])[0]||'';
    A('atkA-second-proforma-created', /^PF-\d{4}-\d{6}$/.test(pf2)&&pf2!==pfM, `pf1=${pfM} pf2=${pf2}`);
    // go BACK to review step via... there is no Back at step>=3; use reload to step2? Instead:
    // double-tap test belongs on step2's Confirm. Drive a THIRD flow and double-tap Confirm.
    await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await sleep(5000);
    // stage1 continues in au032_sk2_stage1b.js for the rest
    R.pf1 = pfM; R.pf2 = pf2; R.preQty = preQty; R.duringQty = duringQty;
  } catch(e){ A('fatal-stage1',false,e.message); console.error('ERR',e.message); }
  fs.writeFileSync('/tmp/au032_sk_r14_state.json', JSON.stringify({...R, imgMap}, null, 1));
  const pv = ctx.pages()[0] && await ctx.pages()[0].video();
  await L.closeVideo(ctx,'e2e/videos/AU-032-sk-r14-mobile.webm');
  await b.close();
  fs.writeFileSync('/tmp/au032_sk_r14_stage1.json', JSON.stringify(R,null,1));
})();
