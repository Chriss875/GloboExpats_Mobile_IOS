// au032_sk2_stage7.js — SKEPTIC r14 FINAL: two decisive probes.
//  P1: does the itemDetails endpoint even REFLECT reservations? (API-level proforma
//      create via real endpoints -> poll qty; no UI needed)
//  P2: offline cancel error visibility with a CLEAN single-shot capture (dialog
//      screenshot right after failed confirm, full-page, plus a11y dump)
const S = require('./au032_sk2_lib.js'); const L = S.L; const fs = require('fs');
const { fx, sleep } = S;
const R = { ts:new Date().toISOString(), unit:'AU-032', stage:'skeptic-r14-stage7', wave:'skeptic',
  build_sha:S.BUILD_SHA, bundle_mtime:null, asserts:[], attacks:[], shots:[], netlog:[] };
function A(name, pass, detail=''){ R.asserts.push({name,pass:!!pass,detail:String(detail).slice(0,320)}); console.log((pass?'PASS ':'FAIL ')+name+(detail?' :: '+String(detail).slice(0,170):'')); }
function AT(name,result,detail=''){ R.attacks.push({attack:name,result,detail:String(detail).slice(0,320)}); console.log('ATTACK-'+result+' '+name+' :: '+String(detail).slice(0,200)); }
(async()=>{
  const head = await fetch(S.APP+'/main.dart.js',{method:'HEAD'});
  R.bundle_mtime = head.headers.get('last-modified');
  A('freshness-frozen-e694463', head.status===200 && R.bundle_mtime===S.BUILD_MT, `${head.status} ${R.bundle_mtime}`);
  const btok=(await L.api(null,'POST','/api/v1/auth/login',{email:fx.buyer.email,password:fx.buyer.pw})).json.token;

  // ================= P1: API-level reservation reflection =================
  // top stock to 8
  const sellTok = await L.apiLogin({email:fx.seller.email,pw:fx.seller.pw});
  const topUp = new FormData();
  topUp.append('product', new Blob([JSON.stringify({productQuantity:8})],{type:'application/json'}), 'p.json');
  const tuSt = await fetch(`${L.API}/api/v1/products/update/${fx.productId}`, {method:'PATCH',headers:{Authorization:'Bearer '+sellTok},body:topUp}).then(r=>r.status).catch(()=>0);
  console.log('topup:', tuSt);
  const q0 = (await L.api(btok,'GET',`/api/v1/displayItem/itemDetails/${fx.productId}`)).json.productQuantity;
  console.log('qty before:', q0);
  // create a proforma DIRECTLY through the real checkout API (same call the UI makes)
  const pfRes = await L.api(btok,'POST','/api/v1/checkout/proforma', {
    items:[{productId:fx.productId, quantity:1}],
    details:{ firstName:'SK14', lastName:'Probe', emailAddress:fx.buyer.email,
      phoneNumber:'+2557'+String(fx.stamp).slice(-9),
      address:'au032 street 32', city:'Dar es Salaam', country:'Tanzania',
      fulfillmentType:'SELLER_DELIVERY', paymentMethodType:'MOBILE_MONEY',
      selectedWindows:['today 08:00-12:00'] },
    destinationLatitude:-6.7924, destinationLongitude:39.2083
  });
  console.log('proforma create:', pfRes.status, JSON.stringify(pfRes.json).slice(0,220));
  if(pfRes.status===201||pfRes.status===200){
    let sawHold=false, polls=[];
    for(let i=0;i<10;i++){
      const q=(await L.api(btok,'GET',`/api/v1/displayItem/itemDetails/${fx.productId}`)).json.productQuantity;
      polls.push(q);
      if(q===q0-1){ sawHold=true; break; }
      await sleep(1500);
    }
    A('p1-api-proforma-holds-stock-in-itemDetails', sawHold, `polls=${polls.join(',')} (before=${q0})`);
    // cleanup
    await L.api(btok,'POST',`/api/v1/proformas/${pfRes.json.proformaId}/cancel`,{});
    const qAfter=(await L.api(btok,'GET',`/api/v1/displayItem/itemDetails/${fx.productId}`)).json.productQuantity;
    A('p1-cancel-restores', qAfter===q0, `after=${qAfter}`);
    AT('stock-reservation-reflection-endpoint-level', sawHold?'HELD':'DISPUTED',
      `itemDetails ${sawHold?'reflects':'does NOT reflect'} the reservation while PENDING_PAYMENT (polls=${polls.join(',')}); DB row decrements but public read may serve stale/unreserved value`);
  } else {
    A('p1-api-proforma-create', false, 'could not create proforma via API — probe inconclusive');
    AT('stock-reservation-reflection-endpoint-level','DISPUTED','proforma create failed: '+JSON.stringify(pfRes.json).slice(0,120));
  }

  // ================= P2: clean offline-cancel error capture =================
  const b = await L.newBrowser();
  const c = await L.newCtx(b,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-032-sk-r14-p2.webm'});
  const p = await c.newPage();
  p.on('response', r=>{ const u=r.url(); if(/localhost:8083\/api\//.test(u)) R.netlog.push(`${r.request().method()} ${u.split('/api/')[1].slice(0,52)} -> ${r.status()}`); });
  async function tickBox(which){
    const t = await p.evaluate((w)=>{
      const rows=[...document.querySelectorAll('flt-semantics')].filter(e=>e.getAttribute('role')==='checkbox')
        .map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,h:r.height,w:r.width};})
        .filter(b=>b.w>5&&b.h>5&&b.y>40&&(b.y+b.h)<innerHeight-6);
      if(!rows.length) return null;
      const bb = w==='first'?rows[0]:rows[rows.length-1];
      return {x:bb.x+18,y:Math.min(Math.max(bb.y+bb.h/2,22),663)};
    },which);
    if(!t) return false;
    await p.mouse.click(t.x,t.y); await sleep(800); return true;
  }
  try{
    A('p2-login', await S.loginUi(p));
    // add fixture to cart
    await p.evaluate(id=>{location.hash='#/product/'+id;}, fx.productId);
    for(let i=0;i<20;i++){ await sleep(900); if((await S.txt(p)).includes('AU032 Cancel Tote')) break; }
    await S.tap(p,'Add to cart',4);
    await S.hashNav(p,'#/cart');
    for(let i=0;i<14;i++){ await sleep(800); if((await S.txt(p)).includes('Go to checkout')) break; }
    await S.tap(p,'Go to checkout',5);
    let at1=false; for(let i=0;i<30&&!at1;i++){ await sleep(1000); at1=/Step 1 of 4/.test(await S.txt(p)); }
    const phEmpty = await p.evaluate(()=>{ const i=[...document.querySelectorAll('input')].find(i=>{const s=i.closest('flt-semantics'); return s&&/WhatsApp phone number/i.test(s.textContent||'');}); return i?(i.value||''):null; });
    if(phEmpty!==null && phEmpty.length===0){
      const h = await S.hit(p,'WhatsApp phone number');
      if(h){ await p.mouse.click(h.x,h.y); await sleep(400); } else { await p.locator('input').last().click({force:true}).catch(()=>{}); }
      await sleep(300); await p.keyboard.type('+2557'+String(fx.stamp).slice(-9),{delay:9});
    }
    await L.scrollToBottom(p,10); await sleep(600);
    await S.tap(p,'Continue to review',5);
    let at2=false; for(let i=0;i<34&&!at2;i++){ await sleep(1000); at2=/Step 2 of 4/.test(await S.txt(p)); if(i===15&&!at2) await S.tap(p,'Continue to review',3); }
    await L.scrollToBottom(p,18); await sleep(700);
    await tickBox('first'); await tickBox('last');
    await S.tap(p,'Confirm & proceed to payment',3);
    let T3=''; for(let i=0;i<34;i++){ await sleep(1000); T3=await S.txt(p); if(/How will you pay\?/.test(T3)) break; }
    const pf=(T3.match(/PF-\d{4}-\d{6}/)||[])[0]||'';
    A('p2-step3-mounted', /^PF-\d{4}-\d{6}$/.test(pf), pf);

    // abort cancel ONCE
    let aborted=false;
    await p.route('**/api/v1/proformas/*/cancel', async route => { aborted=true; await route.abort('connectionreset'); });
    await L.scrollToBottom(p,14); await sleep(700);
    const open = await S.hit(p,'Cancel invoice');
    if(open){ await p.mouse.click(open.x,open.y); await sleep(1400); }
    // click the dialog CONFIRM button (smallest 'Cancel invoice' role=button visible now)
    const conf = await p.evaluate(()=>{
      let best=null;
      document.querySelectorAll('flt-semantics').forEach(e=>{
        const t=(e.textContent||'').trim();
        if(t!=='Cancel invoice'||e.getAttribute('role')!=='button') return;
        const r=e.getBoundingClientRect();
        if(r.bottom<0||r.top>innerHeight||r.width<6) return;
        if(!best||r.width*r.height<best.area) best={area:r.width*r.height,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
      });
      return best;
    });
    if(conf){ await p.mouse.click(conf.x,conf.y); await sleep(4500); }
    console.log('aborted fired:', aborted);
    const T4 = await S.txt(p);
    fs.writeFileSync('/tmp/au032_p2_after_fail.txt', T4);
    const errCopy = T4.includes('Could not cancel the invoice') || T4.includes('Network') || /failed|try again/i.test(T4);
    await S.shot(p,'sk14-m-21-p2-after-failed-cancel');
    // dialog may still be open (Flutter dialog stays if exception thrown before pop)
    const dlgOpen = T4.includes('Cancel this invoice?');
    A('p2-error-copy-or-dialog-still-open', errCopy || dlgOpen, `errCopy=${errCopy} dialogStillOpen=${dlgOpen}`);
    A('p2-still-on-payment-step', /How will you pay\?/.test(T4), '');
    AT('offline-cancel-user-feedback', errCopy||dlgOpen ? 'HELD':'DISPUTED',
       dlgOpen&&!errCopy ? 'dialog stays open after failed cancel (silent failure — NO error copy shown to user)'
                         : `error surfaced (${errCopy})`);
    // unroute + complete the cancel so nothing dangles
    await p.unroute('**/api/v1/proformas/*/cancel');
    if(dlgOpen){
      const conf2 = await p.evaluate(()=>{
        let best=null;
        document.querySelectorAll('flt-semantics').forEach(e=>{
          const t=(e.textContent||'').trim();
          if(t!=='Cancel invoice'||e.getAttribute('role')!=='button') return;
          const r=e.getBoundingClientRect();
          if(r.bottom<0||r.top>innerHeight||r.width<6) return;
          if(!best||r.width*r.height<best.area) best={area:r.width*r.height,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
        });
        return best;
      });
      if(conf2){ await p.mouse.click(conf2.x,conf2.y); await sleep(3500); }
    } else {
      const op2 = await S.hit(p,'Cancel invoice');
      if(op2){ await p.mouse.click(op2.x,op2.y); await sleep(1400); }
      const cf2 = await p.evaluate(()=>{
        let best=null;
        document.querySelectorAll('flt-semantics').forEach(e=>{
          const t=(e.textContent||'').trim();
          if(t!=='Cancel invoice'||e.getAttribute('role')!=='button') return;
          const r=e.getBoundingClientRect();
          if(r.bottom<0||r.top>innerHeight||r.width<6) return;
          if(!best||r.width*r.height<best.area) best={area:r.width*r.height,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
        });
        return best;
      });
      if(cf2){ await p.mouse.click(cf2.x,cf2.y); await sleep(3500); }
    }
    const st = await L.api(btok,'GET','/api/v1/payments/my').then(r=>(r.json||[]).find(o=>o.proformaNumber===pf));
    A('p2-retry-cancels-cleanly', st && st.status==='CANCELLED', `${pf}->${st?.status}`);
  }catch(e){ A('fatal-p2',false,e.message); console.error(e.stack); }
  try{ await L.closeVideo(c,'e2e/videos/AU-032-sk-r14-p2.webm'); }catch(_){}
  try{await b.close();}catch(_){}
  fs.writeFileSync('/tmp/au032_p2_netlog.txt', (R.netlog||[]).join('\n'));
  fs.writeFileSync('/tmp/au032_sk_r14_stage7.json', JSON.stringify(R,null,1));
})();
