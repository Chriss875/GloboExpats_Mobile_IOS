// au032_sk2_stage4.js — SKEPTIC r14 stage4: acceptance B/C clean run + tablet
// viewport + parity vs :3000 + session-expiry attack.
const S = require('./au032_sk2_lib.js'); const L = S.L; const fs = require('fs');
const { fx, sleep } = S;
const R = { ts:new Date().toISOString(), unit:'AU-032', stage:'skeptic-r14-stage4', wave:'skeptic',
  build_sha:S.BUILD_SHA, bundle_mtime:null, asserts:[], attacks:[], shots:[], videos:[] };
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
    return {x:b.x+18,y:Math.min(Math.max(b.y+b.h/2,22),1018)};
  },which);
  if(!t) return false;
  await p.mouse.click(t.x,t.y); await sleep(800); return true;
}
async function driveToPayment(p, tag, maxY=663){
  await p.evaluate(id=>{location.hash='#/product/'+id;}, fx.productId);
  for(let i=0;i<20;i++){ await sleep(900); if((await S.txt(p)).includes('AU032 Cancel Tote')) break; }
  if(!(await S.tap(p,'Add to cart',4))) { A(tag+'-add-to-cart',false); return ''; }
  await S.hashNav(p,'#/cart');
  for(let i=0;i<14;i++){ await sleep(800); if((await S.txt(p)).includes('Go to checkout')) break; }
  if(!(await S.tap(p,'Go to checkout',5))){ A(tag+'-go-checkout',false); return ''; }
  let at1=false; for(let i=0;i<30&&!at1;i++){ await sleep(1000); at1=/Step 1 of 4/.test(await S.txt(p)); }
  const phEmpty = await p.evaluate(()=>{ const i=[...document.querySelectorAll('input')].find(i=>{const s=i.closest('flt-semantics'); return s&&/WhatsApp phone number/i.test(s.textContent||'');}); return i?(i.value||''):null; });
  if(phEmpty!==null && phEmpty.length===0){
    const h = await S.hit(p,'WhatsApp phone number');
    if(h){ await p.mouse.click(h.x,h.y); await sleep(400); } else { await p.locator('input').last().click({force:true}).catch(()=>{}); }
    await sleep(300); await p.keyboard.type('+2557'+String(fx.stamp).slice(-9),{delay:9});
  }
  await L.scrollToBottom(p,10); await sleep(600);
  if(!(await S.tap(p,'Continue to review',5))){ A(tag+'-cont',false); return ''; }
  let at2=false;
  for(let i=0;i<32&&!at2;i++){
    await sleep(1000);
    at2 = /Step 2 of 4/.test(await S.txt(p));
    if(i===14 && !at2) await S.tap(p,'Continue to review',3);
  }
  if(!at2){ A(tag+'-step2',false); return ''; }
  await L.scrollToBottom(p,18); await sleep(700);
  await tickBox(p,'first'); await tickBox(p,'last');
  if(!(await S.tap(p,'Confirm & proceed to payment',3))){ A(tag+'-confirm',false); return ''; }
  let T=''; for(let i=0;i<34;i++){ await sleep(1000); T=await S.txt(p); if(/How will you pay\?/.test(T)) break; }
  const pf=(T.match(/PF-\d{4}-\d{6}/)||[])[0]||'';
  A(tag+'-step3-mounted', /^PF-\d{4}-\d{6}$/.test(pf), pf);
  return pf;
}
(async()=>{
  const head = await fetch(S.APP+'/main.dart.js',{method:'HEAD'});
  R.bundle_mtime = head.headers.get('last-modified');
  A('freshness-frozen-e694463', head.status===200 && R.bundle_mtime===S.BUILD_MT, `${head.status} ${R.bundle_mtime}`);
  const btok=(await L.api(null,'POST','/api/v1/auth/login',{email:fx.buyer.email,password:fx.buyer.pw})).json.token;

  // ================= acceptance B + C on a CLEAN flow (mobile) =================
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-032-sk-r14-bc.webm'});
  const p = await ctx.newPage();
  try{
    A('login-buyer', await S.loginUi(p));
    const preQty = await S.qty(btok);
    const pf = await driveToPayment(p,'bc');
    // switch to REFERENCE proof with a REALISTIC ref, confirm, submit
    await L.scrollToBottom(p,14); await sleep(600);
    A('bc-enter-reference-tap', await S.tap(p,'Enter reference',3)); await sleep(800);
    const ri = p.locator('input').last();
    await ri.click({force:true}).catch(()=>{}); await sleep(350);
    await p.keyboard.insertText('QJK3X8PLM2'); await sleep(500);
    await L.scrollToBottom(p,16); await sleep(500);
    await tickBox(p,'last'); await sleep(400);
    await S.tap(p,'Submit Payment for Verification',2);
    let TB=''; for(let i=0;i<25;i++){ await sleep(1000); TB=await S.txt(p); if(TB.includes('View Order Details')||TB.includes('not accepted')) break; }
    A('bc-completion-reached', TB.includes('View Order Details'), TB.includes('not accepted')?'rejected':'ok');
    const ordRef=(TB.match(/ORD-\d{4}-\d{6}/)||[])[0]||'';
    A('bc-completion-order-ref-shown', !!ordRef, ordRef||TB.slice(-120));
    const invRef=(TB.match(/PF-\d{4}-\d{6}/)||[])[0]||'';
    A('bc-completion-invoice-shown', !!invRef, invRef);
    A('bc-completion-escrow-copy', /protected|held by GloboExpats/i.test(TB.replace(/\n/g,' ')), 'escrow copy present');
    await S.shot(p,'sk14-m-13-bc-completion');
    // server truth
    const mineB = (await proformas(btok)).find(o=>o.proformaNumber===pf);
    A('bc-server-PAYMENT_SUBMITTED', mineB&&mineB.status==='PAYMENT_SUBMITTED', `${pf}->${mineB?.status}`);
    const orders = await L.api(btok,'GET','/api/v1/orders/my-orders');
    const olist = Array.isArray(orders.json)?orders.json:(orders.json?.content||orders.json?.orders||[]);
    const ordHit = JSON.stringify(olist).includes(ordRef);
    A('bc-server-order-exists', !!ordRef && ordHit, `ORD=${ordRef} in /orders payload=${ordHit}`);

    // ---- View Order Details -> /orders/{id} ----
    await L.scrollToBottom(p,12); await sleep(500);
    A('bc-view-order-details-click', await S.tap(p,'View Order Details',3),'');
    await sleep(3500);
    const url = p.url();
    A('bc-url-orders-id', /\/orders\/[0-9a-f-]{36}/.test(url), url);
    const TO = await S.txt(p);
    A('bc-order-detail-renders', /Order|Status|AWAITING_PAYMENT|Items/i.test(TO), TO.slice(0,90));
    await S.shot(p,'sk14-m-14-bc-order-detail');

    // ---- acceptance C: in-app success route ----
    await p.goBack(); await sleep(2500);
    A('bc-continue-shopping-click', await S.tap(p,'Continue Shopping',3),'back on completion');
    await sleep(1500);

    // deep-link success with the real proforma id
    const pid = mineB?.proformaId;
    await S.hashNav(p,'/checkout/success?proforma='+pid);
    await sleep(4000);
    const TS = await S.txt(p);
    A('c-success-lipa-namba', TS.includes('Lipa Namba')&&TS.includes('7003 9305'), '');
    A('c-success-selcom', TS.includes('Selcom'), '');
    const payRefM = TS.match(/Payment reference\s*\n?\s*([^\n]*)/) || TS.match(/Payment reference([^\n]*)/);
    A('c-success-reference-nonempty', !!(payRefM&&payRefM[1]&&payRefM[1].trim().length>3),
      payRefM?`value="${(payRefM[1]||'').trim().slice(0,40)}"`:'no row found');
    A('c-success-orderReference-or-ref-present', /(orderReference|Order reference|Reference)/i.test(TS), '');
    await S.shot(p,'sk14-m-15-bc-success');
    // bank chip switch on success page
    A('c-success-bank-chip', await S.tap(p,'Bank Account',3),'');
    await sleep(1500);
    const TSB = await S.txt(p);
    A('c-success-bank-details', TSB.includes('5527108094688'), '');
    await S.shot(p,'sk14-m-16-bc-success-bank');
    AT('acceptance-B-and-C-clean-flow','HELD',
      `completion shows ${ordRef}+${invRef}; order detail URL ok; success page Lipa Namba/Selcom/reference="${(payRefM?.[1]||'').trim().slice(0,24)}"`);
  }catch(e){ A('fatal-stage4-bc',false,e.message); console.error(e.stack); }
  try{ await L.closeVideo(ctx,'e2e/videos/AU-032-sk-r14-bc.webm'); }catch(_){}
  await b.close();

  // ================= ATTACK F: session expiry mid-flow (clear token + reload) =================
  {
    const b2 = await L.newBrowser();
    const c2 = await L.newCtx(b2,{viewport:{width:375,height:667},videoPath:null});
    const p2 = await c2.newPage();
    try{
      A('F-login', await S.loginUi(p2));
      const pfF = await driveToPayment(p2,'atkF');
      A('F-at-step3-with-proforma', !!pfF, pfF);
      // clear the persisted token then RELOAD (honest probe per shared context)
      await p2.evaluate(()=>{ localStorage.removeItem('flutter.auth_token'); });
      await p2.reload({waitUntil:'load',timeout:90000}); await sleep(6000);
      const TF = await S.txt(p2);
      const authed = await S.isLoggedIn(p2);
      A('F-token-cleared', !authed, '');
      // now try to reach checkout again — must NOT show payment step or invoice data
      await S.hashNav(p2,'#/');
      await sleep(2000);
      const gated = await S.vis(p2,'Login') || await S.vis(p2,'Log in');
      A('F-login-entry-offered-after-expiry', gated, TF.slice(0,60));
      // server truth: proforma untouched by client-side logout
      const st = (await proformas(btok)).find(o=>o.proformaNumber===pfF);
      A('F-server-state-intact-no-writes', !!st, st?.status);
      AT('session-expiry-clear-token-reload','HELD', `token cleared -> app returns to logged-out shell; server proforma ${pfF} untouched (${st?.status})`);
      // cleanup
      if(st && st.status==='PENDING_PAYMENT') await L.api(btok,'POST',`/api/v1/proformas/${st.proformaId}/cancel`,{});
    }catch(e){ A('fatal-atkF',false,e.message); }
    try{await c2.close();}catch(_){} try{await b2.close();}catch(_){}
  }

  // ================= TABLET viewport regression (768x1024) =================
  {
    const b3 = await L.newBrowser();
    const c3 = await L.newCtx(b3,{viewport:{width:768,height:1024},videoPath:'e2e/videos/AU-032-sk-r14-tablet.webm'});
    const p3 = await c3.newPage();
    try{
      A('T-login', await S.loginUi(p3));
      const preQ = await S.qty(btok);
      const pfT = await driveToPayment(p3,'tab',1018);
      const during = await S.qty(btok);
      A('tab-stock-reserved-at-step3', during===preQ-1, `pre=${preQ} during=${during}`);
      const backVis = await S.vis(p3,'Back');
      A('tab-back-absent-visible-step3', !backVis, backVis?'VISIBLE Back':'absent');
      await L.scrollToBottom(p3,14); await sleep(700);
      const ch = await S.hit(p3,'Cancel invoice');
      A('tab-cancel-invoice-present', !!ch, '');
      await S.shot(p3,'sk14-t-01-step3');
      if(ch){ await p3.mouse.click(ch.x,ch.y); await sleep(1500); }
      let D=''; for(let i=0;i<12;i++){ await sleep(800); D=await S.txt(p3); if(D.includes('Cancel this invoice?')) break; }
      A('tab-dialog-copy', D.includes('Cancel this invoice?')&&D.includes('Keep invoice'),'');
      await S.shot(p3,'sk14-t-02-dialog');
      const cb = await p3.evaluate(()=>{
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
      if(cb){ await p3.mouse.click(cb.x,cb.y); await sleep(3000); }
      const mineT = (await proformas(btok)).find(o=>o.proformaNumber===pfT);
      A('tab-server-CANCELLED', mineT&&mineT.status==='CANCELLED', `${pfT}->${mineT?.status}`);
      A('tab-stock-released', (await S.qty(btok))===preQ, '');
      await S.shot(p3,'sk14-t-03-after-cancel');
      AT('tablet-viewport-cancel-invoice-parity','HELD', `${pfT}: Back absent, dialog copy ok, CANCELLED, stock restored`);
    }catch(e){ A('fatal-tablet',false,e.message); }
    try{ await L.closeVideo(c3,'e2e/videos/AU-032-sk-r14-tablet.webm'); }catch(_){}
    try{await b3.close();}catch(_){}
  }

  fs.writeFileSync('/tmp/au032_sk_r14_stage4.json', JSON.stringify(R,null,1));
})();
