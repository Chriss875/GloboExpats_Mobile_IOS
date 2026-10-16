// au036_verify_r5b.js — remaining §8 states on :9121 with FULL page reload per
// deep link (r5a lesson: repeated location.hash writes don't re-trigger the
// router; every navigation here = goto('/') + hash + wait for fresh content).
// States: REFUND_PENDING (own fixture), RELEASED, REFUNDED(72000),
// DELIVERED-still-HELD, plus state-2 detail control dump.
const fs=require('fs'); const path=require('path');
process.chdir(path.resolve(__dirname,'..'));
const L=require('./lib_verify.js');
const APP='http://localhost:9121';
const SHOT_DIR='e2e/shots/AU-036';
const fx=JSON.parse(fs.readFileSync('/tmp/au036_r5.json','utf8'));
const FIX={
  released:{id:'2499e6e9-b5f9-4b47-982e-1d50f99144c5',want:'Payment released to seller'},
  refunded:{id:'b564e951-ef8f-452e-b974-7f9438137850',want:'Refunded · TSh 72000'},
};
const RP_WANT='Cancellation refund pending - GloboExpats will return your money';
// DELIVERED still HELD: find from buyer142's list at runtime
const R={ts:new Date().toISOString(),unit:'AU-036',stage:'verify-r5b',build_sha:'e1a5762',
  asserts:[],failures:[],shots:[],checks:{state_asserts:0}};
function assert(n,p,d){R.asserts.push({name:n,pass:!!p,detail:String(d||'').slice(0,300)});
  console.log((p?'PASS ':'FAIL ')+n+(d?' :: '+String(d).slice(0,140):''));if(!p)R.failures.push(n);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function shot(p,vp,st){const f=`${SHOT_DIR}/AU-036-${vp}-${st}.png`;await L.screenshot(p,f);R.shots.push(f);return f;}

(async()=>{
 const btok=await L.apiLogin({email:fx.buyer.email,pw:fx.buyer.pw});
 const btok142=await L.apiLogin();
 // pick a DELIVERED-but-not-released order for state 5 if one exists
 let delivered=null;
 const rows=await L.api(btok142,'GET','/api/v1/orders');
 for(const o of (Array.isArray(rows.json)?rows.json:[])){
   const d=await L.api(btok142,'GET',`/api/v1/orders/${o.orderId}`);
   if(d.status===200&&['DELIVERED','PICKED_UP'].includes(d.json.status)&&d.json.payoutStatus==='HELD'){delivered={id:o.orderId,num:o.orderNumber};break;}
 }
 console.log('delivered-held fixture:',JSON.stringify(delivered));

 const browser=await L.newBrowser();
 try{
  for(const [vpName,viewport] of [['mobile',{width:375,height:667}],['tablet',{width:768,height:1024}]]){
   const videoPath=`e2e/videos/AU-036-r5b-${vpName}.webm`;
   const ctx=await L.newCtx(browser,{viewport,videoPath});
   const page=await ctx.newPage();
   try{
    await page.goto(APP+'/',{waitUntil:'load',timeout:90000});
    await L.waitText(page,'Buy now',40000);
    await L.clickBtn(page,'Login'); await L.waitText(page,'Welcome back',30000);
    const ei=page.locator('input[type="text"]').first(),pi=page.locator('input[type="password"]').first();
    await ei.click({force:true}).catch(()=>{});await sleep(350);await page.keyboard.type(fx.buyer.email);
    await pi.click({force:true}).catch(()=>{});await sleep(350);await page.keyboard.type(fx.buyer.pw);
    await L.clickBtn(page,'Log in');
    let logged=false;for(let i=0;i<30&&!logged;i++){logged=await L.isLoggedIn(page);if(!logged)await sleep(1000);}
    assert(`login-${vpName}`,logged);

    async function deep(orderId){
      await page.goto(APP+'/',{waitUntil:'load',timeout:60000});await sleep(2200);
      await page.evaluate(h=>{window.location.hash=h;},`#/orders/${orderId}`);
      await sleep(4500);
    }
    async function check(tag,id,want){
      await deep(id);
      const T=await L.allText(page);
      const hit=T.includes(want);
      if(hit)R.checks.state_asserts++;
      assert(`banner-${tag}-${vpName}`,hit,hit?`"${want}" verbatim`:`MISSING; head=${T.split('\n').filter(Boolean).slice(0,14).join('|').slice(0,240)}`);
      return T;
    }
    // REFUND_PENDING (own fixture, CANCELLED)
    const TRP=await check('refund-pending',fx.refundPending.orderId,RP_WANT);
    assert(`refund-pending-cancelled-chip-${vpName}`,/Cancelled|CANCELLED/i.test(TRP),`cancelled chip rendered=${/Cancelled|CANCELLED/i.test(TRP)}`);
    await shot(page,vpName,'10-refund-pending');
    // RELEASED
    await check('released',FIX.released.id,FIX.released.want);
    await shot(page,vpName,'11-released');
    // REFUNDED amount verbatim
    const TRF=await check('refunded',FIX.refunded.id,FIX.refunded.want);
    assert(`refunded-amount-verbatim-${vpName}`,TRF.includes('TSh 72000'),'"TSh 72000" present');
    await shot(page,vpName,'12-refunded');
    // DELIVERED still HELD -> 'Delivered - confirm receipt to release payment'
    if(delivered){const TD=await check('delivered-held',delivered.id,'Delivered - confirm receipt to release payment');
      await shot(page,vpName,'13-delivered-held');}
    else console.log(vpName,'no DELIVERED+HELD sandbox order available today (recorded)');
    // state-2 detail: dump controls + confirm banner again after reloads
    await deep(fx.state2.orderId);
    const T2=await L.allText(page);
    assert(`state2-banner-after-reload-${vpName}`,T2.includes('Payment submitted - awaiting GloboExpats verification'),'verbatim after reload');
    fs.writeFileSync(`/tmp/au036_r5_state2_text_${vpName}.txt`,T2);
    await shot(page,vpName,'14-state2-detail');
   }finally{await L.closeVideo(ctx,videoPath);}
  }
 }finally{await browser.close().catch(()=>{});}
 fs.writeFileSync('e2e/results/shards/raw-AU-036-r5b.json',JSON.stringify(R,null,1));
 console.log('\nSUMMARY r5b',R.asserts.filter(a=>a.pass).length+'/'+R.asserts.length);
})().catch(e=>{console.error('FATAL',e.message);
 fs.writeFileSync('e2e/results/shards/raw-AU-036-r5b.json',JSON.stringify({...R,fatal:e.message},null,1));
 process.exit(1);});
