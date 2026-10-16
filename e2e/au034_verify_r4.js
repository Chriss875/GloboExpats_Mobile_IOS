// au034_verify_r4.js — AU-034 canonical run. Entry = cold deep link /orders ->
// login gate (returnUrl=/orders) -> login -> lands back on /orders (AU-022
// returnUrl contract, proven live). Then the full checklist.
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9112';
const REF = 'http://localhost:3000';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-034';
const SHOT_DIR = `${ROOT}/e2e/shots/${UNIT}`;
const OUT = { asserts: [], network: [], clicks: [], images: {} };
function log(...a){ console.log('[au034-r4]', ...a); }
async function dumpText(p){
  return p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'')).join('\n'));
}
async function shot(p,vp,state){
  const f=`${SHOT_DIR}/${UNIT}-${vp}-${state}.png`; await L.screenshot(p,f); log('shot',vp,state); return f;
}
function expectedGroups(orders){
  const EAT=3*3600e3, M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const norm=s=>{s=String(s??'').toUpperCase().replace(/[\s-]+/g,'_');return s==='CONFIRMED'?'COMPLETED':s};
  return orders.map(o=>{
    const s=norm(o.status);
    const rental=(o.items||[]).some(i=>i&&i.rentalBooking);
    let g;
    if(rental){ g=(s==='COMPLETED')?'completed':['CANCELLED','FAILED','EXPIRED'].includes(s)?'cancelled':'ongoing'; }
    else if(['COMPLETED','DELIVERED','PICKED_UP'].includes(s)) g='completed';
    else if(['CANCELLED','FAILED','EXPIRED'].includes(s)) g='cancelled';
    else { const dl=o.fulfillmentDeadline?Date.parse(o.fulfillmentDeadline):null; g=(dl!==null&&!isNaN(dl)&&Date.now()>dl)?'overdue':'ongoing'; }
    const d=new Date(Date.parse(o.createdAt)+EAT);
    const stamp=`${String(d.getUTCDate()).padStart(2,'0')} ${M[d.getUTCMonth()]}, ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
    return {num:o.orderNumber,status:s,type:o.orderType||'buying',group:g,stamp,total:o.totalAmount,seller:o.sellerName,buyer:o.buyerName};
  });
}
async function chipClick(page,label){
  const loc=page.locator('flt-semantics[role="button"]',{hasText:label}).first();
  try{ await loc.click({timeout:5000}); await page.waitForTimeout(800); return true; }
  catch(e){ return false; }
}

(async()=>{
  const bt=await L.apiLogin(L.BUYER);
  const stok=await L.apiLogin({email:'au054seller1787624747348@gmail.com',pw:'StrongPass!1'});
  const bAll=(await L.api(bt,'GET','/api/v1/orders')).json;
  const sAll=(await L.api(stok,'GET','/api/v1/orders')).json;
  const expBuyer=expectedGroups(bAll), expSeller=expectedGroups(sAll);
  fs.writeFileSync(`${ROOT}/e2e/tmp/AU-034-groundtruth.json`, JSON.stringify({expBuyer,expSeller,sellerRaw:sAll},null,1));
  const counts=list=>{const c={ongoing:0,overdue:0,completed:0,cancelled:0};for(const o of list)c[o.group]++;return c;};
  log('buyer counts',JSON.stringify(counts(expBuyer)),'seller',JSON.stringify(counts(expSeller)));

  const browser=await L.newBrowser();
  for(const [vpName,vp] of [['375',{width:375,height:667}],['768',{width:768,height:1024}]]){
    const ctx=await L.newCtx(browser,{viewport:vp,videoPath:`${ROOT}/e2e/videos/${UNIT}-verify-${vpName}.webm`});
    const page=await ctx.newPage();
    const imgs=L.watchImages(page);
    let ordersApiCalls=0;
    page.on('response',r=>{const u=r.url(); if(u.includes('/api/')&&!u.includes('/uploads/'))OUT.network.push({vp:vpName,url:u.slice(0,130),status:r.status()}); if(/\/api\/v1\/orders(\?|$)/.test(u)&&r.status()===200)ordersApiCalls++;});

    // ---- entry: cold deep link while logged out -> auth gate -> login -> back to /orders
    await page.goto(APP+'/orders',{waitUntil:'load',timeout:90000}).catch(()=>{});
    await L.waitText(page,'Welcome back',30000).catch(()=>{});
    let txt=await dumpText(page);
    OUT.asserts.push({vp:vpName,a:'cold-deeplink-gated-by-login',pass:/login\?returnUrl=\/orders/.test(page.url()),value:page.url()});
    const ei=page.locator('input[type="text"]').first(); const pi=page.locator('input[type="password"]').first();
    await ei.click({force:true}); await page.waitForTimeout(300); await page.keyboard.type(L.BUYER.email);
    await pi.click({force:true}); await page.waitForTimeout(300); await page.keyboard.type(L.BUYER.pw);
    await L.clickBtn(page,'Log in');
    let landed=false;
    for(let i=0;i<25;i++){ await page.waitForTimeout(800); if(await L.isLoggedIn(page)&&!/Welcome back/.test(await dumpText(page))){landed=true;break;} }
    await page.waitForTimeout(1500);
    txt=await dumpText(page);
    OUT.asserts.push({vp:vpName,a:'returnurl-lands-on-orders',pass:landed&&/orders#\/orders$/.test(page.url())&&txt.includes('My orders'),value:{landed,url:page.url()}});
    OUT.asserts.push({vp:vpName,a:'login',pass:landed});
    OUT.asserts.push({vp:vpName,a:'orders-api-fetched',pass:ordersApiCalls>0,value:ordersApiCalls});
    OUT.asserts.push({vp:vpName,a:'split-chips-present',pass:txt.includes('Buying')&&txt.includes('Selling')});
    OUT.asserts.push({vp:vpName,a:'group-tabs-present',pass:['All','Ongoing','Overdue','Completed','Cancelled'].every(t=>txt.includes(t))});

    // real data rows under All
    const allRows=expBuyer.map(e=>e.num);
    const missing=allRows.filter(n=>!txt.includes(n));
    OUT.asserts.push({vp:vpName,a:'all-buying-rows-under-All',pass:missing.length===0,value:{total:allRows.length,missing}});
    OUT.asserts.push({vp:vpName,a:'buyer-perspective-status-labels',
      pass:/Payment confirmed - awaiting seller|Seller confirmed - preparing your delivery|Awaiting payment verification/.test(txt)});
    const stampMiss=expBuyer.filter(e=>!txt.includes(e.stamp));
    OUT.asserts.push({vp:vpName,a:'eat-stamps-offset-aware',pass:stampMiss.length===0,
      value:{expected:expBuyer.map(e=>[e.num,e.stamp]),missing:stampMiss.map(e=>e.num)}});
    const ph=/lorem|placeholder|dummy|TODO/i.exec(txt);
    OUT.asserts.push({vp:vpName,a:'no-placeholder-strings',pass:!ph,value:ph&&ph[0]});
    await shot(page,vpName,'10-buying-all');

    async function filterCheck(label,expectIn,expectOut,shotState){
      const okClick=await chipClick(page,label);
      txt=await dumpText(page);
      const okIn=expectIn.every(n=>txt.includes(n));
      const okOut=expectOut.every(n=>!txt.includes(n));
      OUT.asserts.push({vp:vpName,a:`${label.toLowerCase()}-filter-real`,pass:okIn&&okOut,value:{click:okClick,expectCount:expectIn.length,leaked:expectOut.filter(n=>txt.includes(n)).length}});
      await shot(page,vpName,shotState);
    }
    await filterCheck('Overdue', expBuyer.filter(e=>e.group==='overdue').map(e=>e.num),
                             expBuyer.filter(e=>e.group!=='overdue').map(e=>e.num),'11-buying-overdue');
    await filterCheck('Completed', expBuyer.filter(e=>e.group==='completed').map(e=>e.num),
                              expBuyer.filter(e=>e.group!=='completed').map(e=>e.num),'12-buying-completed');
    await filterCheck('Cancelled', expBuyer.filter(e=>e.group==='cancelled').map(e=>e.num),
                              expBuyer.filter(e=>e.group!=='cancelled').map(e=>e.num),'13-buying-cancelled');
    await filterCheck('Ongoing', expBuyer.filter(e=>e.group==='ongoing').map(e=>e.num),
                            expBuyer.filter(e=>e.group!=='ongoing').map(e=>e.num),'14-buying-ongoing');
    await chipClick(page,'All'); txt=await dumpText(page);
    OUT.asserts.push({vp:vpName,a:'all-restores-everything',pass:allRows.every(n=>txt.includes(n))});

    // ---- selling tab via orderType fallback
    const sellOk=await chipClick(page,'Selling'); await page.waitForTimeout(600);
    txt=await dumpText(page);
    const sellNums=expSeller.map(e=>e.num);
    const buyingOnly=expBuyer.map(e=>e.num).filter(n=>!sellNums.includes(n));
    const okSell=sellOk&&txt.includes('Selling orders')&&sellNums.every(n=>txt.includes(n))&&buyingOnly.every(n=>!txt.includes(n));
    OUT.asserts.push({vp:vpName,a:'selling-tab-orderType-split',pass:okSell,value:{click:sellOk,sellingRows:sellNums,buyingHidden:buyingOnly.length}});
    OUT.asserts.push({vp:vpName,a:'seller-perspective-label',pass:/assign a driver|New order/.test(txt),value:{snippet:(txt.match(/[^\n]*driver[^\n]*|[^\n]*New order[^\n]*/)||[])[0]}});
    const sellStampMiss=expSeller.filter(e=>!txt.includes(e.stamp));
    OUT.asserts.push({vp:vpName,a:'selling-stamps-eat',pass:sellStampMiss.length===0,value:{missing:sellStampMiss.map(e=>e.num)}});
    await shot(page,vpName,'15-selling-all');

    await filterCheck('Completed', expSeller.filter(e=>e.group==='completed').map(e=>e.num),
                              expSeller.filter(e=>e.group!=='completed').map(e=>e.num),'16-selling-completed');
    await chipClick(page,'Cancelled'); txt=await dumpText(page);
    OUT.asserts.push({vp:vpName,a:'empty-group-message',pass:/no selling orders yet/i.test(txt)});
    await shot(page,vpName,'17-selling-cancelled-empty');

    // ---- row click opens detail
    await chipClick(page,'Buying'); await page.waitForTimeout(700);
    await chipClick(page,'All'); await page.waitForTimeout(500);
    txt=await dumpText(page);
    let target=expBuyer.find(e=>txt.includes(e.num))||expBuyer[0];
    let rowClicked=false;
    try{
      const row=page.locator('flt-semantics[flt-tappable=""]',{hasText:target.num}).last();
      await row.click({timeout:6000}); rowClicked=true;
    }catch(e){}
    await page.waitForTimeout(2000);
    txt=await dumpText(page);
    const detailMarkers=/Placed on |Track delivery|Timeline/.exec(txt);
    const detailOk=rowClicked&&txt.includes(target.num)&&!!detailMarkers;
    OUT.asserts.push({vp:vpName,a:'row-click-opens-detail',pass:detailOk,value:{num:target.num,rowClicked,detailMarkers:detailMarkers&&detailMarkers[0]}});
    await shot(page,vpName,'18-detail-after-row-click');
    const detailStamps=/Placed on ([^\n]+)/.exec(txt);
    OUT.asserts.push({vp:vpName,a:'detail-placed-on-eat-stamp',pass:!!detailStamps&&/\d{2} \w{3} \d{4}, \d{2}:\d{2}/.test(detailStamps[1]),value:detailStamps&&detailStamps[1]});
    const backBtn=page.locator('flt-semantics[role="button"]',{hasText:'Back'}).first();
    let backOk=false; try{ await backBtn.click({timeout:4000}); backOk=true; }catch(e){}
    await page.waitForTimeout(1200);
    txt=await dumpText(page);
    OUT.asserts.push({vp:vpName,a:'back-to-list',pass:backOk&&txt.includes('My orders'),value:{backOk}});

    // ---- click-everything inventory scoped to ORDERS SCREEN controls
    const ctrls=await L.listButtons(page);
    const scopeCtrls=ctrls.filter(c=>{
      if(c.kind==='input')return false;
      return /My orders|Selling orders|^Buying$|^Buying\n|^Selling$|^Selling\n|^All$|Ongoing|Overdue|Completed|Cancelled|ORD-\d{4}/.test(c.label)||c.label.startsWith('Back');
    });
    let okClicks=0; const failed=[];
    for(const c of scopeCtrls){
      try{
        const before=await dumpText(page);
        let effect=false;
        const key=c.label.split('\n')[0].slice(0,20);
        if(c.kind==='button'){
          const loc=page.locator('flt-semantics[role="button"]',{hasText:key}).first();
          try{ await loc.click({timeout:3500}); effect=true; }catch(e){}
        } else {
          const loc=page.locator('flt-semantics[flt-tappable=""]',{hasText:key}).last();
          try{ await loc.click({timeout:3500}); effect=true; }catch(e){}
        }
        await page.waitForTimeout(750);
        const after=await dumpText(page);
        if(effect&&(after!==before)){ okClicks++; }
        else if(effect){ okClicks++; OUT.clicks.push({vp:vpName,label:c.label.slice(0,28),note:'no-tree-change(active-control)'}); }
        else failed.push(c.kind+':'+c.label.slice(0,40));
        const t2=await dumpText(page);
        if(!t2.includes('My orders')&&!t2.includes('Selling orders')){
          const b2=page.locator('flt-semantics[role="button"]',{hasText:'Back'}).first();
          try{ await b2.click({timeout:3000}); }catch(e){}
          await page.waitForTimeout(900);
        }
      }catch(e){ failed.push(c.kind+':'+c.label.slice(0,40)); }
    }
    OUT.asserts.push({vp:vpName,a:'click-everything-orders-ui',pass:failed.length===0,value:{controls:scopeCtrls.length,ok:okClicks,failed}});
    await shot(page,vpName,'19-after-enumerated-clicks');

    const im=L.imageSummary(imgs);
    OUT.images[vpName]=im;
    OUT.asserts.push({vp:vpName,a:'images-all-200',pass:im.failed===0,value:im});
    OUT.imgUrls={...(OUT.imgUrls||{}),...imgs};
    await L.closeVideo(ctx,`${ROOT}/e2e/videos/${UNIT}-verify-${vpName}.webm`);
  }
  await browser.close();

  // ---------- PARITY :3000 (same flow, same data, both viewports) ----------
  for(const [vpName,vp] of [['375',{width:375,height:667}],['768',{width:768,height:1024}]]){
    const browser2=await L.newBrowser();
    const ctx2=await browser2.newContext({viewport:vp});
    const page=await ctx2.newPage();
    await page.goto(REF+'/login',{waitUntil:'load',timeout:90000}).catch(()=>{});
    await page.waitForTimeout(1500);
    const em=page.locator('input[type="email"],input[name="email"],input[type="text"]').first();
    await em.fill(L.BUYER.email).catch(()=>{});
    await page.locator('input[type="password"]').first().fill(L.BUYER.pw).catch(()=>{});
    await page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first().click({timeout:6000}).catch(()=>{});
    await page.waitForTimeout(4500);
    await page.goto(REF+'/expat/dashboard?tab=orders',{waitUntil:'load',timeout:90000}).catch(()=>{});
    await page.waitForTimeout(5500);
    let refTxt=await page.evaluate(()=>document.body.innerText);
    fs.writeFileSync(`${ROOT}/e2e/tmp/AU-034-ref-${vpName}.txt`,refTxt);
    await page.screenshot({path:`${SHOT_DIR}/${UNIT}-ref-${vpName}-orders.png`}).catch(()=>{});
    const tabs=['Ongoing','Overdue','Completed','Cancelled'];
    const refTabs=tabs.filter(t=>refTxt.includes(t));
    OUT.asserts.push({vp:vpName,a:'parity-ref-group-tabs-present',pass:refTabs.length===4,value:refTabs});
    const refStamps=(refTxt.match(/Created [^\n]+/g)||[]).slice(0,9);
    OUT.asserts.push({vp:vpName,a:'parity-ref-created-stamps-present',pass:refStamps.length>0,value:refStamps});
    const refRows=['ORD-2026-000023','ORD-2026-000020','ORD-2026-000019','ORD-2026-000014','ORD-2026-000013','ORD-2026-000012','ORD-2026-000011'];
    const refRowHits=refRows.filter(n=>refTxt.includes(n));
    OUT.asserts.push({vp:vpName,a:'parity-ref-shows-same-orders',pass:refRowHits.length>=5,value:{found:refRowHits.length,of:refRows.length,hits:refRowHits}});
    const badgeBlock=(refTxt.match(/\d+\s*\n\s*(?:Ongoing|Overdue|Completed|Cancelled)/g)||[]);
    OUT.parityBadges={...(OUT.parityBadges||{}),[vpName]:badgeBlock.slice(0,8)};
    OUT.refLoginHead={...(OUT.refLoginHead||{}),[vpName]:refTxt.slice(0,160)};
    await ctx2.close(); await browser2.close();
  }

  fs.writeFileSync(`${ROOT}/e2e/tmp/AU-034-out.json`, JSON.stringify(OUT,null,1));
  const fails=OUT.asserts.filter(a=>!a.pass);
  log('DONE asserts=',OUT.asserts.length,'fail=',fails.length);
  for(const f of fails) console.log('FAIL>',f.vp,f.a,JSON.stringify(f.value??null).slice(0,220));
})().catch(e=>{console.error('VERIFY FAIL',e);process.exit(1);});
