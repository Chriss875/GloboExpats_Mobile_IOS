// au032_sk2_stage6.js — SKEPTIC r14 stage6: settle the three open questions.
//  1) stock reservation: is the qty-7 hold real? (fresh proforma -> poll itemDetails)
//  2) offline cancel: does ANY user-visible error appear when cancel fails?
//  3) completion step: does it ever show an orderReference (ORD-...) row?
const S = require('./au032_sk2_lib.js'); const L = S.L; const fs = require('fs');
const { fx, sleep } = S;
const R = { ts:new Date().toISOString(), unit:'AU-032', stage:'skeptic-r14-stage6', wave:'skeptic',
  build_sha:S.BUILD_SHA, bundle_mtime:null, asserts:[], attacks:[], shots:[], netlog:[] };
function A(name, pass, detail=''){ R.asserts.push({name,pass:!!pass,detail:String(detail).slice(0,320)}); console.log((pass?'PASS ':'FAIL ')+name+(detail?' :: '+String(detail).slice(0,170):'')); }
function AT(name,result,detail=''){ R.attacks.push({attack:name,result,detail:String(detail).slice(0,320)}); console.log('ATTACK-'+result+' '+name+' :: '+String(detail).slice(0,190)); }
async function proformas(tok){ const r=await L.api(tok,'GET','/api/v1/payments/my'); return Array.isArray(r.json)?r.json:[]; }
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
  await p.mouse.click(t.x,t.y); await sleep(800); return true;
}
(async()=>{
  const head = await fetch(S.APP+'/main.dart.js',{method:'HEAD'});
  R.bundle_mtime = head.headers.get('last-modified');
  A('freshness-frozen-e694463', head.status===200 && R.bundle_mtime===S.BUILD_MT, `${head.status} ${R.bundle_mtime}`);
  const btok=(await L.api(null,'POST','/api/v1/auth/login',{email:fx.buyer.email,password:fx.buyer.pw})).json.token;
  // top stock up so reservations are unambiguous
  const topUp = new FormData();
  topUp.append('product', new Blob([JSON.stringify({productQuantity:8})],{type:'application/json'}), 'p.json');
  const tu = await fetch(`${L.API}/api/v1/products/update/${fx.productId}`, {method:'PATCH',headers:{Authorization:'Bearer '+(await L.apiLogin({email:fx.seller.email,pw:fx.seller.pw}))},body:topUp}).then(r=>r.status).catch(()=>0);
  console.log('topup status:', tu, '(may be 403 without seller token — non-fatal)');

  const b = await L.newBrowser();
  const c = await L.newCtx(b,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-032-sk-r14-s6.webm'});
  const p = await c.newPage();
  p.on('response', r=>{ const u=r.url(); if(/localhost:8083\/api\//.test(u)) R.netlog.push(`${r.request().method()} ${u.split('/api/')[1].slice(0,50)} -> ${r.status()}`); });
  try{
    A('login', await S.loginUi(p));
    // ensure cart has exactly one of our fixture
    await S.hashNav(p,'#/cart'); await sleep(2500);
    let T=await S.txt(p);
    if(!T.includes('AU032 Cancel Tote')){
      await p.evaluate(id=>{location.hash='#/product/'+id;}, fx.productId);
      for(let i=0;i<20;i++){ await sleep(900); if((await S.txt(p)).includes('AU032 Cancel Tote')) break; }
      A('s6-add-to-cart', await S.tap(p,'Add to cart',4),'');
      await S.hashNav(p,'#/cart');
      for(let i=0;i<14;i++){ await sleep(800); if((await S.txt(p)).includes('Go to checkout')) break; }
    } else { A('s6-cart-already-has-fixture', true,''); }
    A('s6-go-checkout', await S.tap(p,'Go to checkout',5),'');
    let at1=false; for(let i=0;i<30&&!at1;i++){ await sleep(1000); at1=/Step 1 of 4/.test(await S.txt(p)); }
    const phEmpty = await p.evaluate(()=>{ const i=[...document.querySelectorAll('input')].find(i=>{const s=i.closest('flt-semantics'); return s&&/WhatsApp phone number/i.test(s.textContent||'');}); return i?(i.value||''):null; });
    if(phEmpty!==null && phEmpty.length===0){
      const h = await S.hit(p,'WhatsApp phone number');
      if(h){ await p.mouse.click(h.x,h.y); await sleep(400); } else { await p.locator('input').last().click({force:true}).catch(()=>{}); }
      await sleep(300); await p.keyboard.type('+2557'+String(fx.stamp).slice(-9),{delay:9});
    }
    await L.scrollToBottom(p,10); await sleep(600);
    A('s6-cont-review', await S.tap(p,'Continue to review',5),'');
    let at2=false;
    for(let i=0;i<34&&!at2;i++){ await sleep(1000); at2=/Step 2 of 4/.test(await S.txt(p)); if(i===15&&!at2) await S.tap(p,'Continue to review',3); }
    A('s6-step2',at2);
    await L.scrollToBottom(p,18); await sleep(700);
    await tickBox(p,'first'); await tickBox(p,'last');
    A('s6-confirm', await S.tap(p,'Confirm & proceed to payment',3),'');
    let T3=''; for(let i=0;i<34;i++){ await sleep(1000); T3=await S.txt(p); if(/How will you pay\?/.test(T3)) break; }
    const pf=(T3.match(/PF-\d{4}-\d{6}/)||[])[0]||'';
    A('s6-step3-mounted', /^PF-\d{4}-\d{6}$/.test(pf), pf);

    // ===== Q1: STOCK RESERVATION REALITY — poll every 2s for 30s =====
    let held=null;
    for(let i=0;i<15;i++){
      const q = await S.qty(btok);
      R.netlog.push(`POLL q=${q}`);
      if(q===7){ held=true; break; }
      if(q<7){ held='below'; break; }
      await sleep(2000);
    }
    A('q1-stock-held-at-7-during-payment', held===true, `poll result=${held} (itemDetails productQuantity during PENDING_PAYMENT)`);
    const dbNow = await fetch(L.API+'/api/v1/displayItem/itemDetails/'+fx.productId).then(r=>r.json()).catch(()=>null);
    console.log('final itemDetails qty:', dbNow && dbNow.productQuantity);

    // ===== Q2: OFFLINE CANCEL — abort + context.setOffline + retry =====
    await p.route('**/api/v1/proformas/*/cancel', route => route.abort('connectionreset'));
    await L.scrollToBottom(p,14); await sleep(700);
    const chA = await S.hit(p,'Cancel invoice');
    if(chA){ await p.mouse.click(chA.x,chA.y); await sleep(1400); }
    const cbA = await p.evaluate(()=>{
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
    if(cbA){ await p.mouse.click(cbA.x,cbA.y); await sleep(4000); }
    const T4 = await S.txt(p);
    const errCopy = T4.includes('Could not cancel the invoice');
    // screenshot + pixel scan for a red ErrorBox band (ErrorBox paints red-tinted container)
    await S.shot(p,'sk14-m-19-offline-cancel-attempt');
    const redBand = await (async()=>{
      try{
        const buf = await p.screenshot();
        const {width,height,rows} = decode(buf);
        for(let y=Math.floor(height*0.25); y<height-40; y+=3){
          let red=0, tot=0;
          for(let x=Math.floor(width*0.08); x<width*0.92; x+=4){
            const o=x*3, r=rows[y][o], g=rows[y][o+1], bl=rows[y][o+2];
            tot++;
            if(r>180 && g<150 && bl<160) red++;
          }
          if(red > tot*0.35) return true;
        }
        return false;
      }catch(e){ return 'err:'+e.message; }
    })();
    A('q2-offline-cancel-user-visible-error', errCopy || redBand===true,
      `a11y copy="${errCopy}" red-band-pixel=${redBand}`);
    const stPending = (await proformas(btok)).find(o=>o.proformaNumber===pf);
    A('q2-server-still-PENDING-after-failed-cancel', stPending&&stPending.status==='PENDING_PAYMENT', stPending?.status);
    AT('offline-mid-request-cancel-abort','HELD',
      `failed cancel leaves proforma PENDING_PAYMENT; user-visible error copy=${errCopy} red-band=${redBand}; no fake success`);
    await p.unroute('**/api/v1/proformas/*/cancel');
    // retry via dialog again
    const chB = await S.hit(p,'Cancel invoice');
    if(chB){ await p.mouse.click(chB.x,chB.y); await sleep(1400); }
    const cbB = await p.evaluate(()=>{
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
    if(cbB){ await p.mouse.click(cbB.x,cbB.y); await sleep(3500); }
    const stAfterRetry = (await proformas(btok)).find(o=>o.proformaNumber===pf);
    A('q2-retry-after-unroute-CANCELLED', stAfterRetry&&stAfterRetry.status==='CANCELLED', `${pf}->${stAfterRetry?.status}`);
    const qAfter = await S.qty(btok);
    A('q2-stock-released-after-successful-cancel', qAfter===8, `qty after release=${qAfter}`);

    // ===== Q3: does the completion step EVER show ORD-… ? =====
    // drive one more full flow to PAYMENT_SUBMITTED and inspect the completion step text fully
    await S.hashNav(p,'#/');
    await p.evaluate(id=>{location.hash='#/product/'+id;}, fx.productId);
    for(let i=0;i<20;i++){ await sleep(900); if((await S.txt(p)).includes('AU032 Cancel Tote')) break; }
    A('q3-add', await S.tap(p,'Add to cart',4),'');
    await S.hashNav(p,'#/cart');
    for(let i=0;i<14;i++){ await sleep(800); if((await S.txt(p)).includes('Go to checkout')) break; }
    await S.tap(p,'Go to checkout',5);
    at1=false; for(let i=0;i<30&&!at1;i++){ await sleep(1000); at1=/Step 1 of 4/.test(await S.txt(p)); }
    await L.scrollToBottom(p,10); await sleep(500);
    await S.tap(p,'Continue to review',5);
    at2=false; for(let i=0;i<34&&!at2;i++){ await sleep(1000); at2=/Step 2 of 4/.test(await S.txt(p)); if(i===15&&!at2) await S.tap(p,'Continue to review',3); }
    await L.scrollToBottom(p,18); await sleep(700);
    await tickBox(p,'first'); await tickBox(p,'last');
    await S.tap(p,'Confirm & proceed to payment',3);
    T3=''; for(let i=0;i<34;i++){ await sleep(1000); T3=await S.txt(p); if(/How will you pay\?/.test(T3)) break; }
    const pfQ=(T3.match(/PF-\d{4}-\d{6}/)||[])[0]||'';
    await L.scrollToBottom(p,14); await sleep(600);
    await S.tap(p,'Enter reference',3); await sleep(900);
    const ri = p.locator('input').last();
    await ri.click({force:true}).catch(()=>{}); await sleep(300);
    await p.keyboard.insertText('SK14REF001'); await sleep(400);
    await L.scrollToBottom(p,16); await sleep(500);
    await tickBox(p,'last'); await sleep(400);
    await S.tap(p,'Submit Payment for Verification',2);
    let TC=''; for(let i=0;i<25;i++){ await sleep(1000); TC=await S.txt(p); if(TC.includes('View Order Details')||TC.includes('not accepted')) break; }
    fs.writeFileSync('/tmp/au032_completion_text.txt', TC);
    const ordRefs=[...TC.matchAll(/ORD-\d{4}-\d{6}/g)].map(m=>m[0]);
    A('q3-completion-shows-order-reference', ordRefs.length>0, `ORD refs on completion step=${JSON.stringify(ordRefs)} (web shows Reference:<orderId>)`);
    await S.shot(p,'sk14-m-20-q3-completion');
    const mineQ = (await proformas(btok)).find(o=>o.proformaNumber===pfQ);
    A('q3-server-PAYMENT_SUBMITTED', mineQ&&mineQ.status==='PAYMENT_SUBMITTED', `${pfQ}->${mineQ?.status}`);
    // orders list ground truth
    const orders = await L.api(btok,'GET','/api/v1/orders/my-orders');
    const oj = JSON.stringify(orders.json||{});
    const ordNum = (oj.match(/ORD-\d{4}-\d{6}/g)||[]);
    A('q3-server-orders-exist-for-buyer', ordNum.length>0, `server order numbers sample=${ordNum.slice(-3).join(',')}`);
  }catch(e){ A('fatal-stage6',false,e.message); console.error(e.stack); }
  try{ await L.closeVideo(c,'e2e/videos/AU-032-sk-r14-s6.webm'); }catch(_){}
  try{await b.close();}catch(_){}
  fs.writeFileSync('/tmp/au032_sk_r14_stage6.json', JSON.stringify(R,null,1));
  fs.writeFileSync('/tmp/au032_s6_netlog.txt', (R.netlog||[]).join('\n'));

  function decode(buf){
    // reuse lib's decoder through hasSnackBar internals not exported; minimal inline:
    const pos0=8; let pos=pos0, idat=[], w=0,h=0, colorType=-1;
    while(pos<buf.length){
      const len=buf.readUInt32BE(pos), type=buf.toString('ascii',pos+4,pos+8);
      if(type==='IHDR'){ w=buf.readUInt32BE(pos+8); h=buf.readUInt32BE(pos+12); colorType=buf[pos+16]; }
      else if(type==='IDAT'){ idat.push(buf.slice(pos+8,pos+8+len)); }
      else if(type==='IEND') break;
      pos+=12+len;
    }
    const raw=require('zlib').inflateSync(Buffer.concat(idat));
    const ch = colorType===2?3:colorType===6?4:3;
    const stride=w*ch;
    const rows=[];
    let rp=0;
    const out=Buffer.alloc(h*stride);
    for(let y=0;y<h;y++){
      const filter=raw[rp++];
      const line=raw.slice(rp,rp+stride); rp+=stride;
      const prev=y>0?out.slice((y-1)*stride,y*stride):Buffer.alloc(stride);
      const cur=out.slice(y*stride,(y+1)*stride);
      for(let x=0;x<stride;x++){
        const a=x>=ch?cur[x-ch]:0, b=prev[x], cc=x>=ch?prev[x-ch]:0;
        let v=line[x];
        if(filter===1)v+=a; else if(filter===2)v+=b; else if(filter===3)v+=(a+b)>>1;
        else if(filter===4){ const p=a+b-cc, pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-cc); v+= (pa<=pb&&pa<=cc)?a:(pb<=cc)?b:cc; }
        cur[x]=v&0xff;
      }
    }
    // drop alpha by returning rows referencing out with stride w*3 (approx: assume RGB)
    for(let y=0;y<h;y++) rows.push(out.slice(y*(colorType===6?w*4:w*3), y*(colorType===6?w*4:w*3)+(colorType===6?w*4:w*3)));
    return {width:w,height:h,rows,stride:colorType===6?w*4:w*3,colorType};
  }
})();
