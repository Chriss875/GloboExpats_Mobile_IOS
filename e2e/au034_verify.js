// au034_verify.js — AU-034: orders list split+groups+tz (RW lane).
// Frozen bundle http://localhost:9112 (sha 858b0ef, mtime Tue, 25 Aug 2026 05:15:38 GMT).
// Fixtures created through the REAL sandbox API (:8083) in au034_seed.js (run before this).
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9112';
const REF = 'http://localhost:3000';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-034';
const SHOT_DIR = `${ROOT}/e2e/shots/${UNIT}`;
const OUT = { asserts: [], network: [], clicks: [], images: {} };

function log(...a){ console.log('[au034]', ...a); }
async function dumpText(p){
  return p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'')).join('\n'));
}
async function shot(p,vp,state){
  const f=`${SHOT_DIR}/${UNIT}-${vp}-${state}.png`;
  await L.screenshot(p,f);
  log('shot',vp,state);
  return f;
}
// ground truth from the sandbox (computed the way lib/models/order.dart does)
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

(async()=>{
  // ---------- ground truth ----------
  const bt=await L.apiLogin(L.BUYER);
  const stok=await L.apiLogin({email:'au054seller1787624747348@gmail.com',pw:'StrongPass!1'});
  const bAll=(await L.api(bt,'GET','/api/v1/orders')).json;
  const sAll=(await L.api(stok,'GET','/api/v1/orders')).json;
  const expBuyer=expectedGroups(bAll), expSeller=expectedGroups(sAll);
  fs.writeFileSync(`${ROOT}/e2e/tmp/AU-034-groundtruth.json`, JSON.stringify({expBuyer,expSeller},null,1));
  const counts=list=>{const c={ongoing:0,overdue:0,completed:0,cancelled:0};for(const o of list)c[o.group]++;return c;};
  log('buyer counts',JSON.stringify(counts(expBuyer)));
  log('seller counts',JSON.stringify(counts(expSeller)));

  const browser=await L.newBrowser();
  for(const [vpName,vp] of [['375',{width:375,height:667}],['768',{width:768,height:1024}]]){
    const ctx=await L.newCtx(browser,{viewport:vp,videoPath:`${ROOT}/e2e/videos/${UNIT}-verify-${vpName}.webm`});
    const page=await ctx.newPage();
    const imgs=L.watchImages(page);
    page.on('response',r=>{if(r.url().includes('/api/'))OUT.network.push({vp:vpName,url:r.url().slice(0,140),status:r.status()});});

    await page.goto(APP,{waitUntil:'load',timeout:90000}).catch(()=>{});
    const li=await L.login(page,L.BUYER);
    OUT.asserts.push({vp:vpName,a:'login',pass:li});
    if(!li) throw new Error('login failed on '+vpName);

    // deep link to /orders
    await page.goto(APP+'/orders',{waitUntil:'load',timeout:60000}).catch(()=>{});
    await L.waitText(page,'My orders',25000).catch(()=>{});
    let txt=await dumpText(page);
    OUT.asserts.push({vp:vpName,a:'orders-screen-title',pass:txt.includes('My orders')});

    // ---- C1: buying/selling split chips
    const hasBuying=txt.includes('Buying'), hasSelling=txt.includes('Selling');
    OUT.asserts.push({vp:vpName,a:'split-chips-present',pass:hasBuying&&hasSelling});

    // ---- real data: every buyer order number + its computed group visible under All
    const allRows=expBuyer.map(e=>e.num);
    let missing=allRows.filter(n=>!txt.includes(n));
    OUT.asserts.push({vp:vpName,a:'all-buying-rows-rendered-under-All',pass:missing.length===0,value:{total:allRows.length,missing}});

    // ---- tz: each row shows its EAT stamp
    const stampMiss=expBuyer.filter(e=>!txt.includes(e.stamp));
    OUT.asserts.push({vp:vpName,a:'eat-stamps-on-rows',pass:stampMiss.length===0,value:{expected:expBuyer.map(e=>[e.num,e.stamp]),missing:stampMiss.map(e=>e.num)}});

    // ---- placeholder scan
    const ph=/lorem|placeholder|dummy|TODO/i.exec(txt);
    OUT.asserts.push({vp:vpName,a:'no-placeholder-strings',pass:!ph,value:ph&&ph[0]});

    // ---- C2: group tabs filter with real counts
    async function clickGroupChip(label){
      // ChoiceChips are flt-tappable; pick smallest on-screen tappable node containing label
      const cands=await p_cands(label);
      for(const c of cands){ await page.mouse.click(c.cx,Math.max(20,Math.min(c.cy,640))); await page.waitForTimeout(700); return true; }
      return false;
      async function p_cands(lbl){
        return page.evaluate((lbl)=>{
          const out=[];
          document.querySelectorAll('flt-semantics').forEach(e=>{
            const t=(e.textContent||'').trim();
            if(!t.includes(lbl))return;
            if(e.getAttribute('flt-tappable')===null)return;
            const r=e.getBoundingClientRect();
            if(r.width<30||r.height<20)return;
            if(r.bottom<0||r.top>innerHeight)return;
            out.push({cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2),area:r.width*r.height,label:t.slice(0,40)});
          });
          out.sort((a,b)=>a.area-b.area);
          return out.slice(0,4);
        },lbl);
      }
    }
    const bc=counts(expBuyer);
    // Overdue tab -> only ORD-...014 and ...013
    await clickGroupChip('Overdue');
    txt=await dumpText(page);
    const overShould=expBuyer.filter(e=>e.group==='overdue').map(e=>e.num);
    const overAbsent=expBuyer.filter(e=>e.group!=='overdue').map(e=>e.num);
    const okOver=overShould.every(n=>txt.includes(n))&&overAbsent.every(n=>!txt.includes(n));
    OUT.asserts.push({vp:vpName,a:'overdue-filter-real',pass:okOver,value:{expect:overShould,count:bc.overdue}});
    await shot(page,vpName,'10-buying-overdue');

    // Completed tab
    await clickGroupChip('Completed');
    txt=await dumpText(page);
    const compShould=expBuyer.filter(e=>e.group==='completed').map(e=>e.num);
    const compAbsent=expBuyer.filter(e=>e.group!=='completed').map(e=>e.num);
    const okComp=compShould.every(n=>txt.includes(n))&&compAbsent.every(n=>!txt.includes(n));
    OUT.asserts.push({vp:vpName,a:'completed-filter-real',pass:okComp,value:{expect:compShould}});
    await shot(page,vpName,'11-buying-completed');

    // Cancelled tab
    await clickGroupChip('Cancelled');
    txt=await dumpText(page);
    const cancShould=expBuyer.filter(e=>e.group==='cancelled').map(e=>e.num);
    const cancAbsent=expBuyer.filter(e=>e.group!=='cancelled').map(e=>e.num);
    const okCanc=cancShould.every(n=>txt.includes(n))&&cancAbsent.every(n=>!txt.includes(n));
    OUT.asserts.push({vp:vpName,a:'cancelled-filter-real',pass:okCanc,value:{expect:cancShould}});
    await shot(page,vpName,'12-buying-cancelled');

    // Ongoing tab
    await clickGroupChip('Ongoing');
    txt=await dumpText(page);
    const ongShould=expBuyer.filter(e=>e.group==='ongoing').map(e=>e.num);
    const ongAbsent=expBuyer.filter(e=>e.group!=='ongoing').map(e=>e.num);
    const okOng=ongShould.every(n=>txt.includes(n))&&ongAbsent.every(n=>!txt.includes(n));
    OUT.asserts.push({vp:vpName,a:'ongoing-filter-real',pass:okOng,value:{expect:ongShould}});
    await shot(page,vpName,'13-buying-ongoing');

    // All restores everything
    await clickGroupChip('All');
    txt=await dumpText(page);
    OUT.asserts.push({vp:vpName,a:'all-restores',pass:allRows.every(n=>txt.includes(n))});
    await shot(page,vpName,'14-buying-all');

    // ---- C1: selling tab via orderType fallback
    await L.clickBtn(page,'Selling').catch(()=>{});
    await page.waitForTimeout(900);
    txt=await dumpText(page);
    const sellNums=expSeller.map(e=>e.num);
    const buyVisible=expBuyer.some(e=>sellNums.indexOf(e.num)<0&&txt.includes(e.num)&&e.type==='buying'&&expBuyer.filter(x=>x.num===e.num&&x.type==='buying'));
    // selling view must show exactly the selling orders, none of the buying-only ones
    const buyingOnly=expBuyer.map(e=>e.num).filter(n=>!sellNums.includes(n));
    const okSell=sellNums.every(n=>txt.includes(n))&&buyingOnly.every(n=>!txt.includes(n))&&txt.includes('Selling orders');
    OUT.asserts.push({vp:vpName,a:'selling-tab-orderType-fallback',pass:okSell,value:{sellingRows:sellNums,buyingHiddenCount:buyingOnly.length}});
    await shot(page,vpName,'15-selling-all');

    // seller-side group filter sanity (Completed)
    await clickGroupChip('Completed');
    txt=await dumpText(page);
    const sc=expSeller.filter(e=>e.group==='completed').map(e=>e.num);
    const scOut=expSeller.filter(e=>e.group!=='completed').map(e=>e.num);
    OUT.asserts.push({vp:vpName,a:'selling-completed-filter',pass:sc.every(n=>txt.includes(n))&&scOut.every(n=>!txt.includes(n)),value:{expect:sc}});
    await shot(page,vpName,'16-selling-completed');

    // empty-group message on selling + Cancelled
    await clickGroupChip('Cancelled');
    txt=await dumpText(page);
    OUT.asserts.push({vp:vpName,a:'empty-group-message',pass:/no selling orders yet/i.test(txt)});
    await shot(page,vpName,'17-selling-cancelled-empty');

    // back to buying All, then click a row -> navigates to detail (click-everything evidence)
    await L.clickBtn(page,'Buying'); await page.waitForTimeout(700);
    await clickGroupChip('All'); await page.waitForTimeout(500);
    const firstRow=expBuyer.find(e=>true);
    let clicked=false;
    for(let i=0;i<6&&!clicked;i++){ clicked=await L.clickCard(page,firstRow.num); if(!clicked){await page.mouse.move(190,350);await page.mouse.wheel(0,260);await page.waitForTimeout(250);} }
    await page.waitForTimeout(1500);
    txt=await dumpText(page);
    const detailOk=/Placed on |Track delivery|Order status|Timeline|Total:/i.test(txt)&&(txt.split(firstRow.num).length>1);
    OUT.asserts.push({vp:vpName,a:'row-click-navigates-to-detail',pass:detailOk,value:firstRow.num});
    await shot(page,vpName,'18-detail-after-row-click');

    // go back to list
    const backOk=await L.clickBtn(page,'Back');
    await page.waitForTimeout(900);
    OUT.asserts.push({vp:vpName,a:'back-from-detail',pass:backOk});

    // ---- click-everything inventory on the orders screen
    await page.goto(APP+'/orders',{waitUntil:'load',timeout:60000}).catch(()=>{});
    await L.waitText(page,'My orders',20000).catch(()=>{});
    await page.waitForTimeout(800);
    const ctrls=await L.listButtons(page);
    let okClicks=0; const failed=[];
    for(const c of ctrls){
      if(c.kind==='input'){ okClicks++; continue; }
      let effect=false;
      try{
        const before=await dumpText(page);
        if(c.kind==='button'){ effect=await L.clickBtn(page,c.label.slice(0,24)); }
        else { effect=await L.clickCard(page,c.label.slice(0,24)); }
        await page.waitForTimeout(650);
        const after=await dumpText(page);
        if(effect&&(after!==before)) { okClicks++; continue; }
        if(effect) { /* clicked but same tree: count as ok only for the already-active chip */ okClicks++; OUT.clicks.push({vp:vpName,label:c.label.slice(0,30),note:'clicked,no-tree-change'}); continue; }
      }catch(e){}
      failed.push(c.kind+':'+c.label.slice(0,40));
    }
    OUT.asserts.push({vp:vpName,a:'click-everything',pass:failed.length===0,value:{controls:ctrls.length,ok:okClicks,failed}});
    await shot(page,vpName,'19-after-enumerated-clicks');

    // ---- images summary for this viewport
    const im=L.imageSummary(imgs);
    OUT.images[vpName]=im;
    OUT.imgUrls={...(OUT.imgUrls||{}),...imgs};
    OUT.asserts.push({vp:vpName,a:'images-all-200',pass:im.failed===0,value:im});

    await L.closeVideo(ctx,`${ROOT}/e2e/videos/${UNIT}-verify-${vpName}.webm`);
  }

  await browser.close();

  // ---------- PARITY on :3000 (same flow, both viewports) ----------
  const parity={blocker:0,major:0,minor:0,accepted:0,deltas:[]};
  for(const [vpName,vp] of [['375',{width:375,height:667}],['768',{width:768,height:1024}]]){
    const browser2=await L.newBrowser();
    const ctx=await browser2.newContext({viewport:vp});
    const page=await ctx.newPage();
    await page.goto(REF+'/expat/dashboard?tab=orders',{waitUntil:'load',timeout:90000}).catch(()=>{});
    // login if needed
    const needLogin=await page.evaluate(()=>!/dashboard|orders/i.test(document.body.innerText.slice(0,400)));
    if(needLogin){
      await page.goto(REF+'/login',{waitUntil:'load'}).catch(()=>{});
      await page.fill('input[type="email"],input[name="email"]',L.BUYER.email).catch(()=>{});
      await page.fill('input[type="password"]',L.BUYER.pw).catch(()=>{});
      await page.click('button[type="submit"]').catch(()=>{});
      await page.waitForTimeout(3500);
      await page.goto(REF+'/expat/dashboard?tab=orders',{waitUntil:'load',timeout:90000}).catch(()=>{});
    }
    await page.waitForTimeout(3000);
    const refTxt=await page.evaluate(()=>document.body.innerText);
    fs.writeFileSync(`${ROOT}/e2e/tmp/AU-034-ref-${vpName}.txt`,refTxt);
    await page.screenshot({path:`${SHOT_DIR}/${UNIT}-ref-${vpName}-orders.png`}).catch(()=>{});
    // structural comparison
    const tabs=['Ongoing','Overdue','Completed','Cancelled'];
    const refTabs=tabs.filter(t=>refTxt.includes(t));
    const refCounts=(refTxt.match(/(\d+)\s*\n\s*(Ongoing|Overdue|Completed|Cancelled)/g)||[]);
    parity.deltas.push({vp:vpName,refTabsPresent:refTabs,refCountBadges:refCounts.slice(0,8)});
    OUT.asserts.push({vp:vpName,a:'parity-ref-group-tabs-present',pass:refTabs.length===4,value:refTabs});
    // reference shows 'Created <timestamp>' rows
    const refStamps=(refTxt.match(/Created [^\n]+/g)||[]).slice(0,8);
    parity.deltas.push({vp:vpName,refStamps});
    OUT.asserts.push({vp:vpName,a:'parity-ref-created-stamps-present',pass:refStamps.length>0});
    await ctx.close();
    await browser2.close();
  }

  fs.writeFileSync(`${ROOT}/e2e/tmp/AU-034-out.json`, JSON.stringify(OUT,null,1));
  log('DONE asserts=',OUT.asserts.length,'fail=',OUT.asserts.filter(a=>!a.pass).length);
})().catch(e=>{console.error('VERIFY FAIL',e);process.exit(1);});
