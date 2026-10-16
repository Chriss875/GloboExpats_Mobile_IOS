// au034_verify_r6.js — AU-034 FINAL. TWO sessions:
//  A) buyer (mobile.test) — buying rows, group filters, tz stamps, detail nav.
//  B) seller (au054seller) — selling tab via orderType fallback, seller-perspective
//     labels, selling stamps + filters, empty-group message.
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9112';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-034';
const SHOT_DIR = `${ROOT}/e2e/shots/${UNIT}`;
const OUT = { asserts: [], network: [], clicks: [], images: {} };
function log(...a){ console.log('[au034-r6]', ...a); }
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
async function gateLogin(page,email,pw){
  // cold deep link -> auth gate -> login -> returnUrl lands on /orders
  await page.goto(APP+'/orders',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(page,'Welcome back',30000).catch(()=>{});
  const gated=/login\?returnUrl=\/orders/.test(page.url());
  const ei=page.locator('input[type="text"]').first(); const pi=page.locator('input[type="password"]').first();
  await ei.click({force:true}); await page.waitForTimeout(250); await page.keyboard.type(email);
  await pi.click({force:true}); await page.waitForTimeout(250); await page.keyboard.type(pw);
  await L.clickBtn(page,'Log in');
  let landed=false;
  for(let i=0;i<25;i++){ await page.waitForTimeout(800); if(await L.isLoggedIn(page)&&!/Welcome back/.test(await dumpText(page))){landed=true;break;} }
  await page.waitForTimeout(1500);
  return {gated,landed};
}
async function scrollToFind(page,text,maxLoops=8){
  for(let i=0;i<maxLoops;i++){
    const t=await dumpText(page);
    if(t.includes(text)) return true;
    await page.mouse.move(190,400); await page.mouse.wheel(0,320); await page.waitForTimeout(320);
  }
  const t=await dumpText(page);
  return t.includes(text);
}

(async()=>{
  const bt=await L.apiLogin(L.BUYER);
  const stok=await L.apiLogin({email:'au054seller1787624747348@gmail.com',pw:'StrongPass!1'});
  const bAll=(await L.api(bt,'GET','/api/v1/orders')).json;
  const sAll=(await L.api(stok,'GET','/api/v1/orders')).json;
  const expBuyer=expectedGroups(bAll), expSeller=expectedGroups(sAll);
  fs.writeFileSync(`${ROOT}/e2e/tmp/AU-034-groundtruth.json`, JSON.stringify({expBuyer,expSeller},null,1));
  const counts=list=>{const c={ongoing:0,overdue:0,completed:0,cancelled:0};for(const o of list)c[o.group]++;return c;};
  log('buyer',JSON.stringify(counts(expBuyer)),'seller',JSON.stringify(counts(expSeller)));
  const SELLER_EMAIL='au054seller1787624747348@gmail.com';

  const browser=await L.newBrowser();
  for(const [vpName,vp] of [['375',{width:375,height:667}],['768',{width:768,height:1024}]]){
    const ctx=await L.newCtx(browser,{viewport:vp,videoPath:`${ROOT}/e2e/videos/${UNIT}-verify-${vpName}.webm`});

    // ================= SESSION A: BUYER =================
    {
      const page=await ctx.newPage();
      const imgs=L.watchImages(page);
      let ordersApiCalls=0; let ordersApiStatuses=[];
      page.on('response',r=>{const u=r.url(); if(u.includes('/api/')&&!u.includes('/uploads/'))OUT.network.push({vp:vpName+'b',url:u.slice(0,130),status:r.status()}); if(/\/api\/v1\/orders(\?|$)/.test(u)){ordersApiCalls++;ordersApiStatuses.push(r.status());}});
      const {gated,landed}=await gateLogin(page,L.BUYER.email,L.BUYER.pw);
      OUT.asserts.push({vp:vpName,a:'cold-deeplink-gated-by-login',pass:gated,value:APP+'/orders'});
      OUT.asserts.push({vp:vpName,a:'login-buyer-returnurl-lands-on-orders',pass:landed});
      let txt=await dumpText(page);
      OUT.asserts.push({vp:vpName,a:'orders-api-fetched-200',pass:ordersApiCalls>0&&ordersApiStatuses.every(s=>s===200),value:{calls:ordersApiCalls,statuses:ordersApiStatuses}});
      OUT.asserts.push({vp:vpName,a:'split-chips-present',pass:txt.includes('Buying')&&txt.includes('Selling')});
      OUT.asserts.push({vp:vpName,a:'group-tabs-present',pass:['All','Ongoing','Overdue','Completed','Cancelled'].every(t=>txt.includes(t))});
      // scroll so ALL rows have rendered at least once (list is virtualized)
      let missing=[];
      for(const n of expBuyer.map(e=>e.num)){ if(!txt.includes(n)) await scrollToFind(page,n); txt=await dumpText(page); if(!txt.includes(n)) missing.push(n); }
      // back to top for consistent shots
      await page.mouse.move(190,400); for(let i=0;i<10;i++){ await page.mouse.wheel(0,-400); await page.waitForTimeout(120);} 
      txt=await dumpText(page);
      OUT.asserts.push({vp:vpName,a:'all-buying-rows-rendered',pass:missing.length===0,value:{total:expBuyer.length,missing}});
      OUT.asserts.push({vp:vpName,a:'buyer-perspective-status-labels',
        pass:/Payment confirmed - awaiting seller|Seller confirmed - preparing your delivery|Awaiting payment verification/.test(txt)});
      // totals + stamps: assert each after scrolling it into view
      const missTotals=[],missStamps=[];
      for(const e of expBuyer){
        if(!txt.includes(`TSh ${e.total.toLocaleString('en-US')}`)||!txt.includes(e.stamp)){
          await scrollToFind(page,e.num); txt=await dumpText(page);
          if(!txt.includes(`TSh ${e.total.toLocaleString('en-US')}`)) missTotals.push([e.num,e.total]);
          if(!txt.includes(e.stamp)) missStamps.push([e.num,e.stamp]);
        }
      }
      OUT.asserts.push({vp:vpName,a:'row-totals-match-sandbox',pass:missTotals.length===0,value:{missingTotals:missTotals}});
      OUT.asserts.push({vp:vpName,a:'eat-stamps-offset-aware',pass:missStamps.length===0,value:{missingStamps:missStamps,note:'EAT=UTC+3; createdAt carries Z offset'}});
      const ph=/lorem|placeholder|dummy|TODO/i.exec(txt);
      OUT.asserts.push({vp:vpName,a:'no-placeholder-strings',pass:!ph,value:ph&&ph[0]});
      await shot(page,vpName,'10-buying-top');

      async function filterCheck(label,expectIn,expectOut,shotState){
        await chipClick(page,'All'); // reset first so in/outs are meaningful
        const okClick=await chipClick(page,label);
        txt=await dumpText(page);
        // scroll to verify membership across the whole filtered list
        for(const n of expectIn){ if(!txt.includes(n)) await scrollToFind(page,n,4); txt=await dumpText(page); }
        const okIn=expectIn.every(n=>txt.includes(n));
        const okOut=expectOut.every(n=>!txt.includes(n));
        OUT.asserts.push({vp:vpName,a:`${label.toLowerCase()}-filter-real`,pass:okIn&&okOut,
          value:{click:okClick,expectCount:expectIn.length,missing:expectIn.filter(n=>!txt.includes(n)),leaked:expectOut.filter(n=>txt.includes(n))}});
        await page.mouse.move(190,400); for(let i=0;i<8;i++){ await page.mouse.wheel(0,-400); await page.waitForTimeout(100);}
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

      // ---- row click opens detail + EAT 'Placed on' stamp
      await chipClick(page,'All'); txt=await dumpText(page);
      let target=expBuyer.find(e=>txt.includes(e.num))||expBuyer[0];
      let rowClicked=false;
      try{
        const row=page.locator('flt-semantics[flt-tappable=""]',{hasText:target.num}).last();
        await row.click({timeout:6000}); rowClicked=true;
      }catch(e){}
      await page.waitForTimeout(2000);
      txt=await dumpText(page);
      const placedM=/Placed on ([^\n]+)/.exec(txt);
      const detailOk=rowClicked&&txt.includes(target.num)&&!!placedM&&placedM[1].startsWith(`${target.stamp.split(',')[0]},`);
      OUT.asserts.push({vp:vpName,a:'row-click-opens-detail',pass:rowClicked&&txt.includes(target.num)&&!!placedM,
        value:{num:target.num,rowClicked,actualStamp:placedM&&placedM[1].slice(0,22)}});
      OUT.asserts.push({vp:vpName,a:'detail-placed-on-eat-stamp',
        pass:!!placedM&&placedM[1].replace(/\s+/g,' ').includes(target.stamp.replace(', ',', ').split(' ').slice(0,2).join(' ')),
        value:{expected:`${target.stamp}`,detailFormat:`Placed on ${placedM&&placedM[1].slice(0,20)} (detailed date+time)`}});
      await shot(page,vpName,'18-detail-after-row-click');
      const backBtn=page.locator('flt-semantics[role="button"]',{hasText:'Back'}).first();
      let backOk=false; try{ await backBtn.click({timeout:4000}); backOk=true; }catch(e){}
      await page.waitForTimeout(1200);
      txt=await dumpText(page);
      OUT.asserts.push({vp:vpName,a:'back-to-list',pass:backOk&&txt.includes('My orders'),value:{backOk}});

      // ---- click-everything scoped inventory (chips/back + one fresh row)
      const ctrls=await L.listButtons(page);
      const scopeCtrls=ctrls.filter(c=>{
        if(c.kind==='input')return false;
        return /My orders|^Buying$|^Buying\n|^Selling$|^Selling\n|^All$|Ongoing|Overdue|Completed|Cancelled/.test(c.label)||c.label.startsWith('Back');
      });
      const rows=ctrls.filter(c=>c.kind==='tappable'&&c.label.startsWith('ORD-'));
      let okClicks=0; const failed=[]; const activeNotes=[];
      async function drive(c,rowMode=false){
        try{
          const before=await dumpText(page);
          let effect=false; const key=c.label.split('\n')[0].slice(0,20);
          if(c.kind==='button'){
            const loc=page.locator('flt-semantics[role="button"]',{hasText:key}).first();
            try{ await loc.click({timeout:3500}); effect=true; }catch(e){}
          } else {
            const loc=page.locator('flt-semantics[flt-tappable=""]',{hasText:key}).last();
            try{ await loc.click({timeout:4000}); effect=true; }catch(e){}
          }
          await page.waitForTimeout(800);
          const after=await dumpText(page);
          if(effect&&(after!==before)) okClicks++;
          else if(effect){ okClicks++; activeNotes.push(key+':active-control-no-change'); }
          else failed.push((rowMode?'row':'ctrl')+':'+key);
          const t2=await dumpText(page);
          if(!t2.includes('My orders')&&!t2.includes('Selling orders')){
            const b2=page.locator('flt-semantics[role="button"]',{hasText:'Back'}).first();
            try{ await b2.click({timeout:3000}); }catch(e){}
            await page.waitForTimeout(900);
          }
        }catch(e){ failed.push((rowMode?'row':'ctrl')+':'+c.label.slice(0,36)); }
      }
      // chips: All is active at this point (already clicked above) — drive each anyway
      for(const c of scopeCtrls.filter(x=>x.kind==='button')) await drive(c);
      const freshRow=rows.find(r=>!r.label.startsWith(target.num));
      if(freshRow) await drive(freshRow,true);
      OUT.asserts.push({vp:vpName,a:'click-everything-orders-ui',pass:failed.length===0,
        value:{controlsTotal:ctrls.length,chipsBackTested:scopeCtrls.filter(x=>x.kind==='button').length,rowsTested:freshRow?2:1,ok:okClicks,failed,activeNoChange:activeNotes}});
      await shot(page,vpName,'19-after-enumerated-clicks');
      const im=L.imageSummary(imgs);
      OUT.images[vpName]=im;
      OUT.imgUrls={...(OUT.imgUrls||{}),...imgs};
      OUT.asserts.push({vp:vpName,a:'images-all-200-buyer-session',pass:im.failed===0,value:im});
      await page.close();
    }

    // ================= SESSION B: SELLER (fresh context — own token storage) =================
    {
      const ctxB=await L.newCtx(browser,{viewport:vp});
      const page=await ctxB.newPage();
      const imgs=L.watchImages(page);
      page.on('response',r=>{if(r.url().includes('/api/')&&!r.url().includes('/uploads/'))OUT.network.push({vp:vpName+'s',url:r.url().slice(0,130),status:r.status()});});
      const {gated,landed}=await gateLogin(page,SELLER_EMAIL,'StrongPass!1');
      OUT.asserts.push({vp:vpName,a:'login-seller-returnurl-lands-on-orders',pass:landed});
      let txt=await dumpText(page);
      // default = buying side, empty for this seller
      OUT.asserts.push({vp:vpName,a:'seller-default-tab-buying-empty',pass:/You have no buying orders yet/i.test(txt)});
      // selling tab via orderType fallback
      const sellClick=await chipClick(page,'Selling');
      txt=await dumpText(page);
      const sellNums=expSeller.map(e=>e.num);
      const okSell=sellClick&&txt.includes('Selling orders')&&sellNums.every(n=>txt.includes(n));
      OUT.asserts.push({vp:vpName,a:'selling-tab-orderType-fallback',pass:okSell,value:{click:sellClick,sellingRows:sellNums}});
      // seller-perspective label for AWAITING_DELIVERY
      OUT.asserts.push({vp:vpName,a:'seller-perspective-label-assign-driver',pass:/Confirmed - assign a driver/.test(txt),
        value:{snippet:(txt.match(/[^\n]*assign a driver[^\n]*/)||[])[0]||null}});
      // seller-side stamps
      const missStamps=expSeller.filter(e=>!txt.includes(e.stamp));
      OUT.asserts.push({vp:vpName,a:'selling-stamps-eat',pass:missStamps.length===0,value:{missing:missStamps.map(e=>e.num)}});
      // totals on selling side
      const missTotals=expSeller.filter(e=>!txt.includes(`TSh ${e.total.toLocaleString('en-US')}`));
      OUT.asserts.push({vp:vpName,a:'selling-totals-match-sandbox',pass:missTotals.length===0,value:{missing:missTotals.map(e=>e.num)}});
      // seller name column shows the buyer's name on selling rows
      OUT.asserts.push({vp:vpName,a:'selling-row-shows-buyer-name',pass:expSeller.some(e=>e.buyer&&txt.includes(e.buyer.split(' ')[0]))});
      await shot(page,vpName,'15-selling-all');
      // Completed filter on selling side
      await chipClick(page,'Completed'); txt=await dumpText(page);
      const scIn=expSeller.filter(e=>e.group==='completed').map(e=>e.num);
      const scOut=expSeller.filter(e=>e.group!=='completed').map(e=>e.num);
      OUT.asserts.push({vp:vpName,a:'selling-completed-filter',pass:scIn.every(n=>txt.includes(n))&&scOut.every(n=>!txt.includes(n)),value:{expect:scIn}});
      await shot(page,vpName,'16-selling-completed');
      // Cancelled -> empty message
      await chipClick(page,'Cancelled'); txt=await dumpText(page);
      OUT.asserts.push({vp:vpName,a:'empty-group-message-selling-cancelled',pass:/no selling orders yet/i.test(txt)});
      await shot(page,vpName,'17-selling-cancelled-empty');
      const im=L.imageSummary(imgs);
      OUT.images[vpName+'s']=im;
      OUT.imgUrls={...(OUT.imgUrls||{}),...imgs};
      OUT.asserts.push({vp:vpName,a:'images-all-200-seller-session',pass:im.failed===0,value:im});
      await ctxB.close();
    }
    await L.closeVideo(ctx,`${ROOT}/e2e/videos/${UNIT}-verify-${vpName}.webm`);
  }
  await browser.close();

  fs.writeFileSync(`${ROOT}/e2e/tmp/AU-034-out.json`, JSON.stringify(OUT,null,1));
  const fails=OUT.asserts.filter(a=>!a.pass);
  log('DONE asserts=',OUT.asserts.length,'fail=',fails.length);
  for(const f of fails) console.log('FAIL>',f.vp,f.a,JSON.stringify(f.value??null).slice(0,240));
})().catch(e=>{console.error('VERIFY FAIL',e);process.exit(1);});
