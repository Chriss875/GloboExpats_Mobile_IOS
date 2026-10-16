// au032_sk2_stage8.js — FINAL micro-probes:
//  P-a) AppBar 'Back' tap at step 3: where does it land? (step-level violation vs route pop)
//  P-b) empty cart: VISIBILITY-filtered 'Go to checkout'
//  P-c) capture the UI's real create-proforma request body -> replay via API ->
//       watch DB + public itemDetails during PENDING -> cancel -> watch release.
const S = require('./au032_sk2_lib.js'); const L = S.L; const fs = require('fs');
const { execSync } = require('child_process');
const { fx, sleep } = S;
const R = { ts:new Date().toISOString(), unit:'AU-032', stage:'skeptic-r14-stage8', wave:'skeptic',
  build_sha:S.BUILD_SHA, bundle_mtime:null, asserts:[], attacks:[], shots:[], captured:null };
function AT(name,result,detail=''){ R.attacks.push({attack:name,result,detail:String(detail).slice(0,320)}); console.log('ATTACK-'+result+' '+name+' :: '+String(detail).slice(0,190)); }
function A(name, pass, detail=''){ R.asserts.push({name,pass:!!pass,detail:String(detail).slice(0,320)}); console.log((pass?'PASS ':'FAIL ')+name+(detail?' :: '+String(detail).slice(0,170):'')); }
async function tickBox(p, which){
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
(async()=>{
  const head = await fetch(S.APP+'/main.dart.js',{method:'HEAD'});
  R.bundle_mtime = head.headers.get('last-modified');
  A('freshness-frozen-e694463', head.status===200 && R.bundle_mtime===S.BUILD_MT, `${head.status} ${R.bundle_mtime}`);
  const btok=(await L.api(null,'POST','/api/v1/auth/login',{email:fx.buyer.email,password:fx.buyer.pw})).json.token;

  // ---------- P-b first (cheap): empty cart visibility ----------
  {
    const b = await L.newBrowser();
    const c = await b.newContext({viewport:{width:375,height:667}});
    const p = await c.newPage();
    await S.loginUi(p);
    await S.hashNav(p,'#/cart'); await sleep(4000);
    const visGo = await S.vis(p,'Go to checkout');
    A('pb-empty-cart-go-checkout-not-visible', !visGo, `visibility-filtered Go to checkout=${visGo}`);
    const visCheckoutWord = await S.vis(p,'Proceed');
    console.log('proceed visible:', visCheckoutWord);
    await c.close(); await b.close();
  }

  // ---------- P-c: capture real proforma payload, replay, watch DB + endpoint ----------
  let captured=null;
  {
    const b = await L.newBrowser();
    const c = await L.newCtx(b,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-032-sk-r14-pc.webm'});
    const p = await c.newPage();
    p.on('request', r=>{ if(/\/checkout\/proforma$/.test(r.url()) && r.method()==='POST'){ try{captured=JSON.parse(r.postData());}catch(e){} } });
    try{
      A('pc-login', await S.loginUi(p));
      // ensure single fixture in cart: clear via UI add path
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
      await tickBox(p,'first'); await tickBox(p,'last');
      await S.tap(p,'Confirm & proceed to payment',3);
      let T3=''; for(let i=0;i<34;i++){ await sleep(1000); T3=await S.txt(p); if(/How will you pay\?/.test(T3)) break; }
      const pf=(T3.match(/PF-\d{4}-\d{6}/)||[])[0]||'';
      A('pc-step3-mounted', /^PF-\d{4}-\d{6}$/.test(pf), pf);

      // ---------- P-a: AppBar Back tap at step 3 ----------
      await p.mouse.click(24, 28); await sleep(2500);
      const TA = await S.txt(p);
      const land = {
        review: /Step 2 of 4/.test(TA),
        step1: /Step 1 of 4/.test(TA),
        leftCheckout: !/How will you pay\?/.test(TA) && !/Step [123] of 4/.test(TA),
        homeOrCart: /My cart|Your cart|Buy now|Home/i.test(TA)
      };
      console.log('P-a landing:', JSON.stringify(land));
      A('pa-appbar-back-at-step3-does-NOT-return-to-review', !land.review,
        `after AppBar Back: reviewStep=${land.review} step1=${land.step1} leftFlow=${land.leftCheckout}`);
      await S.shot(p,'sk14-m-22-after-appbar-back');
      AT('appbar-back-tap-at-step3','HELD', JSON.stringify(land));
    }catch(e){ A('fatal-pc-ui',false,e.message); }
    try{ await L.closeVideo(c,'e2e/videos/AU-032-sk-r14-pc.webm'); }catch(_){}
    try{await b.close();}catch(_){}
  }

  if(captured){
    R.captured = captured;
    fs.writeFileSync('/tmp/au032_captured_proforma.json', JSON.stringify(captured,null,1));
    // find the newest pending proforma created by that UI flow (the one left dangling)
    const mine=(await L.api(btok,'GET','/api/v1/payments/my')).json||[];
    const pend=mine.filter(o=>o.status==='PENDING_PAYMENT');
    console.log('pending after UI flow:', pend.map(o=>o.proformaNumber).join(','));
    if(pend.length){
      const target=pend[pend.length-1];
      const pid=target.proformaId;
      // DB quantity + public endpoint, before/during/after
      const dbq = () => execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -tAc "SELECT product_quantity FROM products WHERE product_id=${fx.productId}"`).toString().trim();
      const pubq = async () => (await L.api(btok,'GET',`/api/v1/displayItem/itemDetails/${fx.productId}`)).json.productQuantity;
      const dbBefore=dbq(), pubBefore=await pubq();
      console.log(`BEFORE cancel: db=${dbBefore} public=${pubBefore} (${target.proformaNumber})`);
      await sleep(3000);
      const dbDuring=dbq(), pubDuring=await pubq();
      console.log(`DURING pending: db=${dbDuring} public=${pubDuring}`);
      await L.api(btok,'POST',`/api/v1/proformas/${pid}/cancel`,{});
      await sleep(1500);
      const dbAfter=dbq(), pubAfter=await pubq();
      console.log(`AFTER cancel: db=${dbAfter} public=${pubAfter}`);
      A('pc-db-decrements-on-reserve', Number(dbDuring)===Number(dbBefore)-1, `db ${dbBefore}->${dbDuring} while PENDING`);
      A('pc-db-releases-on-cancel', Number(dbAfter)===Number(dbBefore), `db ${dbDuring}->${dbAfter} after CANCELLED`);
      A('pc-public-endpoint-mirrors-db', Number(pubDuring)===Number(dbDuring)&&Number(pubAfter)===Number(dbAfter),
        `public during=${pubDuring} db during=${dbDuring}; public after=${pubAfter} db after=${dbAfter}`);
      AT('stock-reserve-release-db-truth', (Number(dbDuring)===Number(dbBefore)-1&&Number(dbAfter)===Number(dbBefore))?'HELD':'DISPUTED',
        `${target.proformaNumber}: db ${dbBefore}->${dbDuring}->${dbAfter}; public ${pubBefore}->${pubDuring}->${pubAfter}`);
    } else { A('pc-no-pending-left',false,'nothing to probe'); }
  } else { A('pc-captured-request',false,'no proforma POST captured'); }

  fs.writeFileSync('/tmp/au032_sk_r14_stage8.json', JSON.stringify(R,null,1));
})();
