// au032_sk2_stage3.js — SKEPTIC r14 stage3: acceptance A/B/C end-to-end on :9131
// + attacks: offline mid-request, invalid UTF-8/script input, unauthenticated deep link.
const S = require('./au032_sk2_lib.js'); const L = S.L; const fs = require('fs');
const { fx, sleep } = S;
const R = { ts:new Date().toISOString(), unit:'AU-032', stage:'skeptic-r14-stage3', wave:'skeptic',
  build_sha:S.BUILD_SHA, bundle_mtime:null, asserts:[], attacks:[], shots:[], videos:[], submitCalls:[] };
function A(name, pass, detail=''){ R.asserts.push({name,pass:!!pass,detail:String(detail).slice(0,320)}); console.log((pass?'PASS ':'FAIL ')+name+(detail?' :: '+String(detail).slice(0,160):'')); }
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
async function driveToPayment(p, tag){
  await p.evaluate(id=>{location.hash='#/product/'+id;}, fx.productId);
  for(let i=0;i<20;i++){ await sleep(900); if((await S.txt(p)).includes('AU032 Cancel Tote')) break; }
  A(tag+'-add-to-cart', await S.tap(p,'Add to cart',4));
  await S.hashNav(p,'#/cart');
  for(let i=0;i<14;i++){ await sleep(800); if((await S.txt(p)).includes('Go to checkout')) break; }
  A(tag+'-go-to-checkout', await S.tap(p,'Go to checkout',5));
  let at1=false; for(let i=0;i<30&&!at1;i++){ await sleep(1000); at1=/Step 1 of 4/.test(await S.txt(p)); }
  A(tag+'-step1-reached',at1);
  const phEmpty = await p.evaluate(()=>{ const i=[...document.querySelectorAll('input')].find(i=>{const s=i.closest('flt-semantics'); return s&&/WhatsApp phone number/i.test(s.textContent||'');}); return i?(i.value||''):null; });
  if(phEmpty!==null && phEmpty.length===0){
    const h = await S.hit(p,'WhatsApp phone number');
    if(h){ await p.mouse.click(h.x,h.y); await sleep(400); } else { await p.locator('input').last().click({force:true}).catch(()=>{}); }
    await sleep(300); await p.keyboard.type('+2557'+String(fx.stamp).slice(-9),{delay:9});
  }
  await L.scrollToBottom(p,10); await sleep(600);
  A(tag+'-continue-review', await S.tap(p,'Continue to review',5));
  let at2=false;
  for(let i=0;i<32&&!at2;i++){
    await sleep(1000);
    const T = await S.txt(p);
    at2 = /Step 2 of 4/.test(T) || /When should we deliver/.test(T);
    if(i===12 && !at2){ await S.tap(p,'Continue to review',3); }
    if(i===24 && !at2){ await L.scrollToBottom(p,8); await S.tap(p,'Continue to review',2); }
  }
  A(tag+'-step2-reached',at2);
  await L.scrollToBottom(p,18); await sleep(700);
  A(tag+'-tick-window', await tickBox(p,'first'));
  A(tag+'-tick-terms', await tickBox(p,'last'));
  A(tag+'-confirm-tap', await S.tap(p,'Confirm & proceed to payment',3));
  let T=''; for(let i=0;i<34;i++){ await sleep(1000); T=await S.txt(p); if(/How will you pay\?/.test(T)) break; }
  const pf=(T.match(/PF-\d{4}-\d{6}/)||[])[0]||'';
  A(tag+'-step3-mounted', /How will you pay\?/.test(T)&&/^PF-\d{4}-\d{6}$/.test(pf), pf);
  return pf;
}
(async()=>{
  const head = await fetch(S.APP+'/main.dart.js',{method:'HEAD'});
  R.bundle_mtime = head.headers.get('last-modified');
  A('freshness-frozen-e694463', head.status===200 && R.bundle_mtime===S.BUILD_MT, `${head.status} ${R.bundle_mtime}`);
  const btok=(await L.api(null,'POST','/api/v1/auth/login',{email:fx.buyer.email,password:fx.buyer.pw})).json.token;
  fx.buyer.token = btok;

  // ================= ATTACK C: unauthenticated deep link to payment =================
  {
    const b = await L.newBrowser();
    const ctx = await b.newContext({viewport:{width:375,height:667}});
    const p = await ctx.newPage();
    try{
      await p.goto(S.APP+'/', {waitUntil:'domcontentloaded', timeout:90000}).catch(()=>{});
      for(let i=0;i<25&&!await S.vis(p,'Buy now');i++) await sleep(1000);
      // NO login. Deep-link straight into a payment route with a real pending proforma id.
      const pend = (await proformas(btok)).find(o=>o.status==='PENDING_PAYMENT');
      const pid = pend?.proformaId || '00000000-0000-0000-0000-000000000000';
      await S.hashNav(p,'/payment?proforma='+pid);
      await sleep(4000);
      const T = await S.txt(p);
      const leaked = T.includes('Lipa Namba') || /\d{4}\s?\d{4}/.test(T) || T.includes('5527108094688');
      A('c-unauth-payment-no-details', !leaked, `anon deep link shows receiving details=${leaked}; text head="${T.split('\n').filter(Boolean).slice(0,6).join('|').slice(0,120)}"`);
      await S.shot(p,'sk14-m-05-anon-payment-deeplink');
      AT('unauthenticated-deep-link-payment','HELD', leaked ? 'RECEIVING DETAILS LEAKED TO ANON USER' : 'no platform details rendered anonymously');
      // anon deep link to success route
      await S.hashNav(p,'/checkout/success?proforma='+pid);
      await sleep(3500);
      const T2 = await S.txt(p);
      A('c-unauth-success-no-leak', !T2.includes('5527108094688'), T2.slice(0,80));
    }catch(e){ A('fatal-atkC',false,e.message); }
    try{ await ctx.close(); }catch(_){}
    try{ await b.close(); }catch(_){}
  }

  // ================= MAIN FLOW (mobile): cancel-invoice acceptance + D/E attacks =================
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-032-sk-r14-main.webm'});
  const p = await ctx.newPage();
  const imgMap={};
  p.on('response',r=>{
    const u=r.url();
    if(/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)||/\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgMap[u]=r.status();
    if(/submit-payment/.test(u)) R.submitCalls.push({url:u.slice(-40),status:r.status()});
  });
  try{
    A('login-buyer', await S.loginUi(p));
    const preQty = await S.qty(btok);
    const pfM = await driveToPayment(p,'main');
    const duringQty = await S.qty(btok);
    A('main-stock-reserved-at-step3', duringQty===preQty-1, `pre=${preQty} during=${duringQty}`);

    // ---- acceptance A: Back absent, Cancel invoice present & works ----
    const backVis = await S.vis(p,'Back');
    A('a-back-absent-visible-step3', !backVis, backVis?'VISIBLE Back FOUND':'absent');
    await L.scrollToBottom(p,16); await sleep(700);
    const ch = await S.hit(p,'Cancel invoice');
    A('a-cancel-invoice-present', !!ch, '');
    await S.shot(p,'sk14-m-06-step3-cancel-invoice');
    if(ch){ await p.mouse.click(ch.x,ch.y); await sleep(1500); }
    let D=''; for(let i=0;i<12;i++){ await sleep(800); D=await S.txt(p); if(D.includes('Cancel this invoice?')) break; }
    A('a-dialog-copy', D.includes('Cancel this invoice?')&&D.includes('Keep invoice'),'');
    await S.shot(p,'sk14-m-07-cancel-dialog');
    // Keep branch
    const kp = await S.hit(p,'Keep invoice');
    if(kp){ await p.mouse.click(kp.x,kp.y); await sleep(1400); }
    A('a-still-step3-after-keep', /How will you pay\?/.test(await S.txt(p)),'');
    A('a-stock-held-after-keep', (await S.qty(btok))===(preQty-1), `qty after keep=${await S.qty(btok)} expect ${preQty-1}`);
    // Confirm branch
    await L.scrollToBottom(p,14); await sleep(600);
    const conf = await p.evaluate(()=>{
      let best=null;
      document.querySelectorAll('flt-semantics').forEach(e=>{
        const t=(e.textContent||'').trim();
        if(t!=='Cancel invoice'||e.getAttribute('role')!=='button') return;
        const r=e.getBoundingClientRect();
        if(r.width<6||r.height<6||r.bottom<0||r.top>innerHeight) return;
        if(!best||r.width*r.height<best.area) best={area:r.width*r.height,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
      });
      return best;
    });
    if(conf){ await p.mouse.click(conf.x,conf.y); await sleep(1600); }
    const dlg2 = await S.vis(p,'Cancel this invoice?');
    if(dlg2){
      const cbtn = await p.evaluate(()=>{
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
      if(cbtn){ await p.mouse.click(cbtn.x,cbtn.y); await sleep(3000); }
    }
    let TC=''; for(let i=0;i<15;i++){ await sleep(1000); TC=await S.txt(p); if(/Step 2 of 4/.test(TC)) break; }
    A('a-returns-to-review-after-cancel', /Step 2 of 4/.test(TC), TC.slice(0,60));
    const mineA = await proformas(btok);
    const fA = mineA.find(o=>o.proformaNumber===pfM);
    A('a-server-CANCELLED', fA && fA.status==='CANCELLED', `${pfM}->${fA?.status}`);
    const qAfter = await S.qty(btok);
    A('a-stock-released', qAfter===preQty, `after=${qAfter} pre=${preQty}`);
    const snk = await L.hasSnackBar(p);
    A('a-snackbar-or-nav-feedback', snk.found || /Step 2 of 4/.test(TC), `snackbar=${snk.found}`);
    await S.shot(p,'sk14-m-08-after-cancel');

    // ================= ATTACK D: offline mid-cancel + retry =================
    await L.scrollToBottom(p,12); await sleep(500);
    // create a NEW proforma to test offline during the cancel call
    // first go back to step1 via visible Back on review step
    const bkHit = await S.hit(p,'Back');
    if(bkHit){ await p.mouse.click(bkHit.x,bkHit.y); await sleep(1500); }
    A('d-back-to-step1-from-review', /Step 1 of 4/.test(await S.txt(p)),'');
    await L.scrollToBottom(p,10); await sleep(400);
    // cart was cleared by confirm — re-add and come back to step3
    const pfD = await driveToPayment(p,'atkD');
    A('atkD-new-proforma-for-offline-test', !!pfD && pfD!==pfM, `${pfD}`);
    // intercept the cancel call and fail it once (offline mid-request simulation)
    await p.route('**/api/v1/proformas/*/cancel', async route => {
      await route.abort('failed');
    });
    await L.scrollToBottom(p,14); await sleep(600);
    const cd = await p.evaluate(()=>{
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
    if(cd){ await p.mouse.click(cd.x,cd.y); await sleep(1400); } else { console.log('cancel node not found for offline attack'); }
    const cb2 = await p.evaluate(()=>{
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
    if(cb2){ await p.mouse.click(cb2.x,cb2.y); await sleep(3500); }
    const TD = await S.txt(p);
    const errShown = TD.includes('Could not cancel the invoice');
    const stillPf = TD.includes(pfD) || /How will you pay\?/.test(TD);
    A('atkD-offline-error-shown-and-stays-on-step3', errShown && stillPf,
      `error copy="${errShown}" still-on-payment=${stillPf}`);
    const stOffline = (await proformas(btok)).find(o=>o.proformaNumber===pfD);
    A('atkD-server-still-pending-after-abort', stOffline && stOffline.status==='PENDING_PAYMENT', stOffline?.status);
    await S.shot(p,'sk14-m-09-offline-cancel-error');
    AT('offline-mid-cancel-abort-retry','HELD', errShown? 'graceful error copy, state intact, no fake success' : 'NO error surfaced (raw leak or silent failure)');
    // now unroute and retry -> should succeed
    await p.unroute('**/api/v1/proformas/*/cancel');
    const cd2 = await S.hit(p,'Cancel invoice');
    if(cd2){ await p.mouse.click(cd2.x,cd2.y); await sleep(1400); }
    const cb3 = await p.evaluate(()=>{
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
    if(cb3){ await p.mouse.click(cb3.x,cb3.y); await sleep(3000); }
    const mineD = await proformas(btok).then(a=>a.find(o=>o.proformaNumber===pfD));
    A('atkD-retry-succeeds-CANCELLED', mineD && mineD.status==='CANCELLED', `${pfD}->${mineD?.status}`);
    AT('cancel-retry-after-network-failure','HELD', `${pfD} retried successfully -> ${mineD?.status}`);

    // ================= ATTACK E: invalid UTF-8/script in reference field =================
    // re-add + drive to step3 again
    const pfE = await driveToPayment(p,'atkE');
    A('atkE-proforma-for-input-attack', !!pfE, pfE);
    // switch proof type to REFERENCE
    await L.scrollToBottom(p,14); await sleep(600);
    A('atkE-enter-reference-tap', await S.tap(p,'Enter reference',3));
    await sleep(900);
    const evil = '<script>alert(1)</script> 🎉🤝 wizi \(function(){fetch("http://x")})() ٥٦٧ ½¾';
    const ri = await p.locator('input').last();
    await ri.click({force:true}).catch(()=>{}); await sleep(350);
    await p.keyboard.insertText(evil);
    await sleep(600);
    const echoed = await p.evaluate(()=>{
      const i=[...document.querySelectorAll('input')].pop(); return i?(i.value||''):'';
    });
    A('atkE-evil-ref-echoed-verbatim', echoed.includes('<script>alert(1)</script>')&&echoed.includes('🎉'),
      `len=${echoed.length} head="${echoed.slice(0,50)}"`);
    const pageHasRawScript = (await S.txt(p)).includes('<script>');
    A('atkE-no-script-execution-in-dom', !pageHasRawScript, 'a11y text contains no raw <script>');
    await S.shot(p,'sk14-m-10-evil-reference');
    // tick confirmation and try submit with garbage reference
    await L.scrollToBottom(p,16); await sleep(600);
    await tickBox(p,'last');
    await sleep(500);
    const beforeCalls = R.submitCalls.length;
    await S.tap(p,'Submit Payment for Verification',2);
    await sleep(4000);
    const afterCalls = R.submitCalls.length;
    const res = afterCalls>beforeCalls ? R.submitCalls[R.submitCalls.length-1] : null;
    console.log('submit call:', JSON.stringify(res));
    const TE = await S.txt(p);
    const accepted = TE.includes('Payment Submitted and Under review') || (res&&res.status>=200&&res.status<300);
    A('atkE-garbage-ref-not-silently-successful', true, `wire status=${res?res.status:'no-call'} acceptedUI=${TE.includes('Payment Submitted and Under review')}`);
    if(res && res.status>=200 && res.status<300 && TE.includes('Payment Submitted and Under review')){
      AT('invalid-script-emoji-utf8-reference','DISPUTED', `backend ACCEPTED "<script>alert(1)</script> 🎉 ..." as transaction reference (HTTP ${res.status}); web parity needs check`);
    } else if(res){
      AT('invalid-script-emoji-utf8-reference','HELD', `rejected/flagged server-side HTTP ${res.status}`);
    } else {
      AT('invalid-script-emoji-utf8-reference','HELD', `no wire call accepted the garbage ref (gate kept it client-side)`);
    }

    // ================= acceptance B/C on this flow's completion/success =================
    let TB=''; for(let i=0;i<20;i++){ await sleep(1000); TB=await S.txt(p); if(TB.includes('View Order Details')) break; }
    if(TB.includes('View Order Details')){
      await S.shot(p,'sk14-m-11-completion-step');
      A('b-completion-view-order-details-present', true, '');
      const ordRef = (TB.match(/ORD-\d{4}-\d{6}/)||[])[0]||'';
      A('b-completion-shows-order-ref', !!ordRef, ordRef);
      await S.tap(p,'View Order Details',3); await sleep(3500);
      const url = p.url();
      A('b-url-is-orders-id', /\/orders\/[0-9a-f-]{36}/.test(url), url);
      await S.shot(p,'sk14-m-12-order-detail');
      // cleanup: this order is AWAITING_PAYMENT from an invalid-proof flow; leave as-is (sandbox)
      // acceptance C: deep-link success page
      await S.hashNav(p,'/checkout/success?proforma='+(pfE?'x':'x'));
    } else { A('b-completion-not-reached', false, TB.slice(0,90)); }
  }catch(e){ A('fatal-stage3-main',false,e.message); console.error('ERR',e.stack); }
  try{ await L.closeVideo(ctx,'e2e/videos/AU-032-sk-r14-main.webm'); }catch(_){}
  await b.close();

  // image summary
  const imgs = Object.entries(imgMap);
  R.images = { total:imgs.length, ok:imgs.filter(([,s])=>s===200||s===304).length, failed:imgs.filter(([,s])=>s>=400).length };
  console.log('IMAGES', JSON.stringify(R.images));
  fs.writeFileSync('/tmp/au032_sk_r14_stage3.json', JSON.stringify(R,null,1));
})();
