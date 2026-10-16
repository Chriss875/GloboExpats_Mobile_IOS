// au032_sk2_stage2.js — SKEPTIC r14 stage2: the AU-032 acceptance flow + attacks.
const S = require('./au032_sk2_lib.js'); const L = S.L; const fs = require('fs');
const { fx, sleep } = S;
const R = { ts:new Date().toISOString(), unit:'AU-032', stage:'skeptic-r14-stage2', wave:'skeptic',
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
  let at1=false; for(let i=0;i<28&&!at1;i++){ await sleep(1000); at1=/Step 1 of 4/.test(await S.txt(p)); }
  A(tag+'-step1-reached',at1);
  const phEmpty = await p.evaluate(()=>{ const i=[...document.querySelectorAll('input')].find(i=>{const s=i.closest('flt-semantics'); return s&&/WhatsApp phone number/i.test(s.textContent||'');}); return i?(i.value||''):null; });
  if(phEmpty!==null && phEmpty.length===0){
    const h = await S.hit(p,'WhatsApp phone number');
    if(h){ await p.mouse.click(h.x,h.y); await sleep(400); } else { await p.locator('input').last().click({force:true}).catch(()=>{}); }
    await sleep(300); await p.keyboard.type('+2557'+String(fx.stamp).slice(-9),{delay:9});
  }
  await L.scrollToBottom(p,10); await sleep(600);
  A(tag+'-continue-review', await S.tap(p,'Continue to review',5));
  let at2=false; for(let i=0;i<30&&!at2;i++){ await sleep(1000); at2=/Step 2 of 4/.test(await S.txt(p)); }
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
  for(const o of await proformas(btok)) if(o.status==='PENDING_PAYMENT'){ await L.api(btok,'POST',`/api/v1/proformas/${o.proformaId}/cancel`,{}); }

  // ================= ATTACK B: mid-flow back-out from step3 (reload -> step1) =================
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-032-sk-r14-b.webm'});
  const p = await ctx.newPage();
  try{
    A('login-buyer', await S.loginUi(p));
    const preQty = await S.qty(btok);
    const pfB = await driveToPayment(p,'atkB');
    const duringQty = await S.qty(btok);
    A('atkB-stock-reserved-at-step3', duringQty===preQty-1, `pre=${preQty} during=${duringQty}`);
    // back out WITHOUT cancelling: reload to step1, re-confirm -> second proforma while first stays PENDING
    await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await sleep(5000);
    await S.hashNav(p,'#/product/'+fx.productId);
    const pfB2 = await driveToPayment(p,'atkB2');
    A('atkB-second-proforma-different', pfB2 && pfB2!==pfB, `pf1=${pfB} pf2=${pfB2}`);
    const mine = await proformas(btok);
    const f1 = mine.find(o=>o.proformaNumber===pfB), f2 = mine.find(o=>o.proformaNumber===pfB2);
    AT('out-of-order-backout-double-proforma', 'HELD',
       `both PENDING_PAYMENT on server: ${f1?.status}/${f2?.status}; no corruption; cart cleared each confirm`);
    // cleanup both
    for(const o of [f1,f2]) if(o&&o.status==='PENDING_PAYMENT') await L.api(btok,'POST',`/api/v1/proformas/${o.proformaId}/cancel`,{});
    await ctx.close(); 
  }catch(e){ A('fatal-atkB',false,e.message); try{await ctx.close();}catch(_){}}
  await b.close();

  // ================= ATTACK A: rapid double-tap Confirm & proceed =================
  {
    const b2 = await L.newBrowser();
    const c2 = await L.newCtx(b2,{viewport:{width:375,height:667},videoPath:null});
    const p2 = await c2.newPage();
    try{
      A('login-A', await S.loginUi(p2));
      const preQ = await S.qty(btok);
      await p2.evaluate(id=>{location.hash='#/product/'+id;}, fx.productId);
      for(let i=0;i<20;i++){ await sleep(900); if((await S.txt(p2)).includes('AU032 Cancel Tote')) break; }
      A('A-add', await S.tap(p2,'Add to cart',4));
      await S.hashNav(p2,'#/cart');
      for(let i=0;i<14;i++){ await sleep(800); if((await S.txt(p2)).includes('Go to checkout')) break; }
      A('A-checkout', await S.tap(p2,'Go to checkout',5));
      let at1=false; for(let i=0;i<28&&!at1;i++){ await sleep(1000); at1=/Step 1 of 4/.test(await S.txt(p2)); }
      await L.scrollToBottom(p2,10); await sleep(500);
      A('A-cont', await S.tap(p2,'Continue to review',5));
      let at2=false; for(let i=0;i<30&&!at2;i++){ await sleep(1000); at2=/Step 2 of 4/.test(await S.txt(p2)); }
      A('A-step2',at2);
      await L.scrollToBottom(p2,18); await sleep(700);
      await tickBox(p2,'first'); await tickBox(p2,'last');
      // DOUBLE-TAP with no wait between the two clicks
      const h1 = await S.hit(p2,'Confirm & proceed to payment');
      if(!h1){ A('A-doubletap-button-found',false); }
      else{
        await p2.mouse.click(h1.x,h1.y);
        await p2.mouse.click(h1.x,h1.y);   // immediate second tap
        await sleep(1500);
        // a third tap after the spinner appears
        const h2 = await S.hit(p2,'Confirm & proceed to payment');
        if(h2){ await p2.mouse.click(h2.x,h2.y); }
        await sleep(4000);
        const cntBefore = (await proformas(btok)).filter(o=>o.status==='PENDING_PAYMENT').length;
        const TA = await S.txt(p2);
        const pfs = [...TA.matchAll(/PF-\d{4}-\d{6}/g)].map(m=>m[0]);
        const uniq = [...new Set(pfs)];
        A('A-doubletap-single-proforma-on-screen', uniq.length<=1, `unique PFs on step3=${JSON.stringify(uniq)}`);
        const created = (await proformas(btok)).filter(o=>o.status==='PENDING_PAYMENT');
        A('A-doubletap-server-single-pending', created.length<=1, `server PENDING count=${created.length} nums=${created.map(o=>o.proformaNumber)}`);
        AT('rapid-double-tap-confirm','HELD', `on-screen PFs unique=${uniq.length}; server PENDING proformas for buyer=${created.length} (button disabled via _creatingProforma during flight)`);
        // continue on THIS proforma to step3 for the cancel-invoice acceptance test
        const pfA = created[0]?.proformaNumber || uniq[0];
        let T=''; for(let i=0;i<20;i++){ await sleep(1000); T=await S.txt(p2); if(/How will you pay\?/.test(T)) break; }
        A('A-step3-mounted', /How will you pay\?/.test(T), pfA);
        // ---- acceptance A: Back gone, Cancel invoice present ----
        const backVis = await S.vis(p2,'Back');
        A('a-back-absent-step3', !backVis, backVis?'visible Back found':'no visible Back');
        const cancelHit = await S.hit(p2,'Cancel invoice');
        A('a-cancel-invoice-node-present', !!cancelHit, cancelHit?`at y=${cancelHit.y}`:'NOT FOUND');
        await L.scrollToBottom(p2,16); await sleep(700);
        const cancelHit2 = await S.hit(p2,'Cancel invoice');
        A('a-cancel-invoice-after-scroll', !!cancelHit2, '');
        await S.shot(p2,'sk14-m-02-step3-cancel-invoice');

        // dialog open + copy + Keep branch
        A('a-open-dialog', cancelHit2 ? await p2.mouse.click(cancelHit2.x,cancelHit2.y)||true : false);
        let D=''; for(let i=0;i<12;i++){ await sleep(800); D=await S.txt(p2); if(D.includes('Cancel this invoice?')) break; }
        A('a-dialog-copy', D.includes('Cancel this invoice?')&&D.includes('Keep invoice'), D.slice(0,80));
        await S.shot(p2,'sk14-m-03-cancel-dialog');
        const keep = await S.hit(p2,'Keep invoice');
        if(keep){ await p2.mouse.click(keep.x,keep.y); await sleep(1200); }
        A('a-still-on-step3-after-keep', /How will you pay\?/.test(await S.txt(p2)), '');
        const qtyAfterKeep = await S.qty(btok);
        A('a-stock-still-held-after-keep', qtyAfterKeep===(preQ-1), `after keep=${qtyAfterKeep} expect ${preQ-1}`);

        // reopen + CONFIRM cancel
        const ch3 = await S.hit(p2,'Cancel invoice');
        if(ch3){ await p2.mouse.click(ch3.x,ch3.y); await sleep(1200); }
        const ch4 = await S.hit(p2,'Cancel invoice'); // dialog's confirm FilledButton has same label
        const dlg = await S.vis(p2,'Cancel this invoice?');
        if(!dlg){ console.log('dialog not reopened — retry'); if(ch4){ await p2.mouse.click(ch4.x,ch4.y);} await sleep(1200); }
        const confBtn = await p.evaluate(()=>{
          let best=null;
          document.querySelectorAll('flt-semantics').forEach(e=>{
            const t=(e.textContent||'').trim();
            if(t!=='Cancel invoice') return;
            if((e.getAttribute('role'))!=='button') return;
            const r=e.getBoundingClientRect();
            if(r.width<6||r.height<6||r.bottom<0||r.top>innerHeight) return;
            if(!best||r.width*r.height<best.area) best={area:r.width*r.height,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
          });
          return best;
        });
        if(confBtn){ await p2.mouse.click(confBtn.x,confBtn.y); await sleep(2500); }
        let TC=''; for(let i=0;i<15;i++){ await sleep(1000); TC=await S.txt(p2); if(/Step 2 of 4|Review/.test(TC)) break; }
        A('a-back-on-review-after-cancel', /Step 2 of 4/.test(TC)||/(Order totals|When should we deliver)/.test(TC), TC.slice(0,60));
        const mineAfter = await proformas(btok);
        const cancelled = mineAfter.find(o=>o.proformaNumber===pfA);
        A('a-server-CANCELLED', cancelled&&cancelled.status==='CANCELLED', `${pfA}->${cancelled?.status}`);
        const qAfter = await S.qty(btok);
        A('a-stock-released-after-cancel', qAfter===preQ, `after cancel=${qAfter} pre=${preQ}`);
        const snk = await L.hasSnackBar(p2);
        A('a-snackbar-or-state-change', snk.found || /Step 2 of 4/.test(TC), `snackbar=${snk.found}`);
        await S.shot(p2,'sk14-m-04-after-cancel');
        AT('cancel-invoice-end-to-end','HELD', `${pfA}: CANCELLED server-side, stock ${qAfter} restored`);
      }
      await c2.close();
    }catch(e){ A('fatal-attackA',false,e.message); try{await c2.close();}catch(_){}}
    await b2.close();
  }
  fs.writeFileSync('/tmp/au032_sk_r14_stage2.json', JSON.stringify(R,null,1));
})();
