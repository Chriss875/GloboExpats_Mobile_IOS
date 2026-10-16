// au034_verify_r2.js — AU-034 re-run: in-app login FIRST, then deep-link /orders
// (cold deep-link while logged-out lands on the login gate — expected behavior;
//  the run must establish the session before deep linking).
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9112';
const REF = 'http://localhost:3000';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-034';
const SHOT_DIR = `${ROOT}/e2e/shots/${UNIT}`;
const OUT = { asserts: [], network: [], clicks: [], images: {} };
function log(...a){ console.log('[au034-r2]', ...a); }
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
async function clickChip(page,label){
  const cands=await page.evaluate((lbl)=>{
    const out=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(!t.includes(lbl))return;
      if(e.getAttribute('flt-tappable')===null)return;
      const r=e.getBoundingClientRect();
      if(r.width<30||r.height<20)return;
      if(r.bottom<0||r.top>innerHeight)return;
      out.push({cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2),area:r.width*r.height});
    });
    out.sort((a,b)=>a.area-b.area);
    return out.slice(0,4);
  },label);
  for(const c of cands){ await page.mouse.click(c.cx,Math.max(20,Math.min(c.cy,640))); await page.waitForTimeout(700); return true; }
  return false;
}

(async()=>{
  const bt=await L.apiLogin(L.BUYER);
  const stok=await L.apiLogin({email:'au054seller1787624747348@gmail.com',pw:'StrongPass!1'});
  const bAll=(await L.api(bt,'GET','/api/v1/orders')).json;
  const sAll=(await L.api(stok,'GET','/api/v1/orders')).json;
  const expBuyer=expectedGroups(bAll), expSeller=expectedGroups(sAll);
  fs.writeFileSync(`${ROOT}/e2e/tmp/AU-034-groundtruth.json`, JSON.stringify({expBuyer,expSeller},null,1));
  const counts=list=>{const c={ongoing:0,overdue:0,completed:0,cancelled:0};for(const o of list)c[o.group]++;return c;};
  const bc=counts(expBuyer), sc=counts(expSeller);
  log('buyer counts',JSON.stringify(bc),'seller',JSON.stringify(sc));

  const browser=await L.newBrowser();
  for(const [vpName,vp] of [['375',{width:375,height:667}],['768',{width:768,height:1024}]]){
    const ctx=await L.newCtx(browser,{viewport:vp,videoPath:`${ROOT}/e2e/videos/${UNIT}-verify-${vpName}.webm`});
    const page=await ctx.newPage();
    const imgs=L.watchImages(page);
    let ordersApiCalls=0;
    page.on('response',r=>{const u=r.url(); if(u.includes('/api/')&&!u.includes('/uploads/'))OUT.network.push({vp:vpName,url:u.slice(0,130),status:r.status()}); if(/\/api\/v1\/orders(\?|$)/.test(u)&&r.status()===200)ordersApiCalls++;});

    await page.goto(APP,{waitUntil:'load',timeout:90000}).catch(()=>{});
    const li=await L.login(page,L.BUYER);
    OUT.asserts.push({vp:vpName,a:'login',pass:li});

    // cold deep link WITH persisted token
    await page.goto(APP+'/orders',{waitUntil:'load',timeout:60000}).catch(()=>{});
    await L.waitText(page,'My orders',25000).catch(()=>{});
    await page.waitForTimeout(1200);
    let txt=await dumpText(page);
    OUT.asserts.push({vp:vpName,a:'deep-link-orders-renders',pass:txt.includes('My orders')});
    OUT.asserts.push({vp:vpName,a:'orders-api-fetched',pass:ordersApiCalls>0,value:ordersApiCalls});
    OUT.asserts.push({vp:vpName,a:'split-chips-present',pass:txt.includes('Buying')&&txt.includes('Selling')});
    OUT.asserts.push({vp:vpName,a:'group-tabs-present',pass:['All','Ongoing','Overdue','Completed','Cancelled'].every(t=>txt.includes(t))});

    // real data rows
    const allRows=expBuyer.map(e=>e.num);
    const missing=allRows.filter(n=>!txt.includes(n));
    OUT.asserts.push({vp:vpName,a:'all-buying-rows-under-All',pass:missing.length===0,value:{total:allRows.length,missing}});
    // status labels are perspective-mapped; assert a couple of exact reference strings
    OUT.asserts.push({vp:vpName,a:'buyer-perspective-labels',pass:
      txt.includes('Payment confirmed - awaiting seller')||txt.includes('Seller confirmed - preparing your delivery'),
      value:{sample:'AWAITING_DELIVERY buyer label'}});
    // tz stamps
    const stampMiss=expBuyer.filter(e=>!txt.includes(e.stamp));
    OUT.asserts.push({vp:vpName,a:'eat-stamps-offset-aware',pass:stampMiss.length===0,
      value:{expected:expBuyer.map(e=>e.stamp).slice(0,7),missing:stampMiss.map(e=>e.num)}});
    // naive-vs-offset sanity is covered by ground truth (createdAt has Z offset here)
    const ph=/lorem|placeholder|dummy|TODO/i.exec(txt);
    OUT.asserts.push({vp:vpName,a:'no-placeholder-strings',pass:!ph,value:ph&&ph[0]});
    await shot(page,vpName,'10-buying-all');

    // ---- group filters with real membership assertions
    async function filterCheck(label,expectIn,expectOut,shotState){
      await clickChip(page,label);
      txt=await dumpText(page);
      const okIn=expectIn.every(n=>txt.includes(n)), okOut=expectOut.length===0||expectOut.every(n=>!txt.includes(n));
      OUT.asserts.push({vp:vpName,a:`${label.toLowerCase()}-filter-real`,pass:okIn&&okOut,value:{expectCount:expectIn.length}});
      await shot(page,vpName,shotState);
      return okIn&&okOut;
    }
    await filterCheck('Overdue', expBuyer.filter(e=>e.group==='overdue').map(e=>e.num),
                             expBuyer.filter(e=>e.group!=='overdue').map(e=>e.num),'11-buying-overdue');
    await filterCheck('Completed', expBuyer.filter(e=>e.group==='completed').map(e=>e.num),
                              expBuyer.filter(e=>e.group!=='completed').map(e=>e.num),'12-buying-completed');
    await filterCheck('Cancelled', expBuyer.filter(e=>e.group==='cancelled').map(e=>e.num),
                              expBuyer.filter(e=>e.group!=='cancelled').map(e=>e.num),'13-buying-cancelled');
    await filterCheck('Ongoing', expBuyer.filter(e=>e.group==='ongoing').map(e=>e.num),
                            expBuyer.filter(e=>e.group!=='ongoing').map(e=>e.num),'14-buying-ongoing');
    await clickChip(page,'All'); await page.waitForTimeout(500);

    // ---- selling tab via orderType fallback
    await L.clickBtn(page,'Selling'); await page.waitForTimeout(1000);
    txt=await dumpText(page);
    const sellNums=expSeller.map(e=>e.num);
    const buyingOnly=expBuyer.map(e=>e.num).filter(n=>!sellNums.includes(n));
    const okSell=txt.includes('Selling orders')&&sellNums.every(n=>txt.includes(n))&&buyingOnly.every(n=>!txt.includes(n));
    OUT.asserts.push({vp:vpName,a:'selling-tab-orderType-split',pass:okSell,value:{sellingRows:sellNums,buyingHidden:buyingOnly.length}});
    // seller-perspective wording on the seller side (PAID/AWAITING_DELIVERY -> 'Confirmed - assign a driver' family)
    OUT.asserts.push({vp:vpName,a:'seller-perspective-label',pass:/assign a driver|New order/.test(txt)});
    const sellStampMiss=expSeller.filter(e=>!txt.includes(e.stamp));
    OUT.asserts.push({vp:vpName,a:'selling-stamps-eat',pass:sellStampMiss.length===0,value:{missing:sellStampMiss.map(e=>e.num)}});
    await shot(page,vpName,'15-selling-all');

    await filterCheck('Completed', expSeller.filter(e=>e.group==='completed').map(e=>e.num),
                              expSeller.filter(e=>e.group!=='completed').map(e=>e.num),'16-selling-completed');
    // empty group message (seller has no cancelled)
    await clickChip(page,'Cancelled'); txt=await dumpText(page);
    const emptyOk=/no selling orders yet/i.test(txt);
    OUT.asserts.push({vp:vpName,a:'empty-group-message',pass:emptyOk});
    await shot(page,vpName,'17-selling-cancelled-empty');

    // ---- row click navigates to detail
    await L.clickBtn(page,'Buying'); await page.waitForTimeout(800);
    await clickChip(page,'All'); await page.waitForTimeout(600);
    txt=await dumpText(page);
    let target=expBuyer.find(e=>txt.includes(e.num));   // topmost visible row
    if(!target){
      // buying chip may not have switched; force via ChoiceChip coordinates then re-read
      await clickChip(page,'Buying'); await page.waitForTimeout(800);
      await clickChip(page,'All'); await page.waitForTimeout(500);
      txt=await dumpText(page);
      target=expBuyer.find(e=>txt.includes(e.num));
    }
    if(!target) throw new Error('no buying rows rendered before row-click test');
    let clicked=false;
    for(let i=0;i<6&&!clicked;i++){ clicked=await L.clickCard(page,target.num); if(!clicked){await page.mouse.move(190,350);await page.mouse.wheel(0,260);await page.waitForTimeout(300);} }
    await page.waitForTimeout(1800);
    txt=await dumpText(page);
    const detailOk=txt.includes(target.num)&&/Placed on |Track delivery|Timeline|Total: /i.test(txt);
    OUT.asserts.push({vp:vpName,a:'row-click-opens-detail',pass:detailOk,value:target.num});
    await shot(page,vpName,'18-detail-after-row-click');
    const backOk=await L.clickBtn(page,'Back');
    await page.waitForTimeout(1000);
    txt=await dumpText(page);
    OUT.asserts.push({vp:vpName,a:'back-to-list',pass:backOk&&txt.includes('My orders')});

    // ---- click-everything inventory ON THE ORDERS SCREEN ONLY (scoped to this unit)
    await clickChip(page,'Buying'); // ensure buying side active if back lost state
    await page.waitForTimeout(400);
    const ctrls=await L.listButtons(page);
    const scopeCtrls=ctrls.filter(c=>{
      const l=c.label;
      const isOrdersUi=/My orders|Selling orders|Buying|Selling|All|Ongoing|Overdue|Completed|Cancelled|ORD-|Back|Home\nTab|Marketplace\nTab|Sell\nTab|Requests\nTab|Account\nTab/.test(l);
      return isOrdersUi;
    });
    let okClicks=0; const failed=[];
    for(const c of scopeCtrls){
      if(c.kind==='input'){okClicks++;continue;}
      try{
        const before=await dumpText(page);
        let effect=false;
        if(c.kind==='button'){ effect=await L.clickBtn(page,c.label.split('\n')[0].slice(0,24)); }
        else { effect=await L.clickCard(page,c.label.split('\n')[0].slice(0,24)); }
        await page.waitForTimeout(700);
        const after=await dumpText(page);
        if(effect&&(after!==before)){ okClicks++; }
        else if(effect){ okClicks++; OUT.clicks.push({vp:vpName,label:c.label.slice(0,30),note:'clicked,no-tree-change(active-chip)'}); }
        else failed.push(c.kind+':'+c.label.slice(0,40));
        // return to list view if we navigated into a detail
        const t2=await dumpText(page);
        if(!t2.includes('My orders')&&!t2.includes('Selling orders')){
          await L.clickBtn(page,'Back'); await page.waitForTimeout(900);
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

  // ---------- PARITY :3000 ----------
  const parity={blocker:0,major:0,minor:0,accepted:0,deltas:[]};
  for(const [vpName,vp] of [['375',{width:375,height:667}],['768',{width:768,height:1024}]]){
    const browser2=await L.newBrowser();
    const ctx2=await browser2.newContext({viewport:vp});
    const page=await ctx2.newPage();
    await page.goto(REF+'/login',{waitUntil:'load',timeout:90000}).catch(()=>{});
    await page.evaluate(t=>localStorage.setItem('token',t),bt).catch(()=>{});
    await page.goto(REF+'/expat/dashboard?tab=orders',{waitUntil:'load',timeout:90000}).catch(()=>{});
    await page.waitForTimeout(4500);
    let refTxt=await page.evaluate(()=>document.body.innerText);
    if(/log ?in|sign in/i.test(refTxt.slice(0,200))){
      await page.goto(REF+'/login',{waitUntil:'load'}).catch(()=>{});
      await page.fill('input[type="email"],input[name="email"]',L.BUYER.email).catch(()=>{});
      await page.fill('input[type="password"]',L.BUYER.pw).catch(()=>{});
      await page.click('button[type="submit"]').catch(()=>{});
      await page.waitForTimeout(4000);
      await page.goto(REF+'/expat/dashboard?tab=orders',{waitUntil:'load',timeout:90000}).catch(()=>{});
      await page.waitForTimeout(4500);
      refTxt=await page.evaluate(()=>document.body.innerText);
    }
    fs.writeFileSync(`${ROOT}/e2e/tmp/AU-034-ref-${vpName}.txt`,refTxt);
    await page.screenshot({path:`${SHOT_DIR}/${UNIT}-ref-${vpName}-orders.png`}).catch(()=>{});
    const tabs=['Ongoing','Overdue','Completed','Cancelled'];
    const refTabs=tabs.filter(t=>refTxt.includes(t));
    OUT.asserts.push({vp:vpName,a:'parity-ref-group-tabs-present',pass:refTabs.length===4,value:refTabs});
    const refStamps=(refTxt.match(/Created [^\n]+/g)||[]).slice(0,9);
    OUT.asserts.push({vp:vpName,a:'parity-ref-created-stamps-present',pass:refStamps.length>0,value:refStamps});
    const refRows=['ORD-2026-000023','ORD-2026-000020','ORD-2026-000019','ORD-2026-000014','ORD-2026-000013','ORD-2026-000012','ORD-2026-000011'];
    const refRowHits=refRows.filter(n=>refTxt.includes(n));
    OUT.asserts.push({vp:vpName,a:'parity-ref-shows-same-orders',pass:refRowHits.length===refRows.length,value:{found:refRowHits.length,of:refRows.length}});
    // structural deltas
    const d=[];
    if(refTabs.length!==5) d.push({delta:'ref group tabs',cls:refTabs.length<4?'MAJOR':'MINOR'});
    if(!/Created /.test(refTxt)) d.push({delta:'ref Created stamps missing',cls:'MAJOR'});
    parity.deltas.push({vp:vpName,deltas:d});
    await ctx2.close(); await browser2.close();
  }

  fs.writeFileSync(`${ROOT}/e2e/tmp/AU-034-out.json`, JSON.stringify({OUT,parity},null,1));
  const fails=OUT.asserts.filter(a=>!a.pass);
  log('DONE asserts=',OUT.asserts.length,'fail=',fails.length);
  for(const f of fails) console.log('FAIL>',f.vp,f.a,JSON.stringify(f.value??null).slice(0,200));
})().catch(e=>{console.error('VERIFY FAIL',e);process.exit(1);});
