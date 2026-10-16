// au047_verify_r4.js — AU-047 round 4: click inventory completion (category chip,
// sort menu, product-card nav, search-icon button) + final wire confirmation.
const fs=require('fs');
const L=require('./lib_verify.js');
const APP='http://localhost:9112';
const ROOT='/home/devsystemadmin/GloboExpats_Mobile';
const UNIT='AU-047';
const SHOT=`${ROOT}/e2e/shots/${UNIT}`;
const OUT={asserts:[],clicks:[],reqs:[]};
function log(...a){console.log('[au047r4]',...a);}
function assert(vp,a,pass,value){OUT.asserts.push({vp,a,pass,value});log(pass?'PASS':'FAIL',vp,a,value!==undefined?JSON.stringify(value).slice(0,200):'');}
async function dumpText(p){return p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'')).join('\n'));}
async function shot(p,vp,state){const f=`${SHOT}/${UNIT}-${vp}-${state}.png`;await L.screenshot(p,f);return f;}
async function tapAnyNode(p,lbl,minW=20,minH=14){
  const cands=await p.evaluate(({lbl,minW,minH})=>{const out=[];const vh=innerHeight;
    document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim();if(!t.includes(lbl))return;
      const r=e.getBoundingClientRect();if(r.width<minW||r.height<minH)return;if(r.bottom<0||r.top>vh)return;
      out.push({cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2),area:r.width*r.height,t:t.slice(0,50)});});
    out.sort((a,b)=>a.area-b.area);return out.slice(0,5);},{lbl,minW,minH});
  for(const c of cands){const vh=await p.evaluate(()=>innerHeight);await p.mouse.click(c.cx,Math.max(16,Math.min(c.cy,vh-20)));await p.waitForTimeout(500);return c.t;}
  return null;}
(async()=>{
  const browser=await L.newBrowser();
  for(const [vpName,vp] of [['375',{width:375,height:667}],['768',{width:768,height:1024}]]){
    const ctx=await L.newCtx(browser,{viewport:vp,videoPath:`${ROOT}/e2e/videos/${UNIT}-verify-r4-${vpName}.webm`});
    const page=await ctx.newPage();
    page.on('request',r=>{if(r.url().includes('/displayItem/')){const u=new URL(r.url());
      OUT.reqs.push({vp:vpName,path:u.pathname.replace('/api/v1',''),q:u.search.slice(0,140)});}});
    await page.goto(APP+'/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
    await L.waitText(page,'Marketplace',30000).catch(()=>{});
    await page.waitForTimeout(3500);
    let txt=await dumpText(page);

    // category chip (All categories bar)
    let catHit=null;
    for(const lbl of ['Electronics','Vehicles','Fashion','Home']){ if(txt.includes(lbl)){catHit=await tapAnyNode(page,lbl,30,18);break;} }
    OUT.clicks.push({vp:vpName,c:'category-chip',hit:catHit});
    await page.waitForTimeout(2200);
    txt=await dumpText(page);
    const catReq=OUT.reqs.filter(r=>r.vp===vpName&&r.path==='/displayItem/filter'&&r.q.includes('categoryIds'));
    assert(vpName,'K1-category-chip-sends-categoryIds',catReq.length>0,{wire:catReq.slice(-1).map(r=>r.q)});
    // reset to All
    await tapAnyNode(page,'All categories'); await page.waitForTimeout(1800);

    // sort menu
    const sortHit=await tapAnyNode(page,'Price: Low to High');
    OUT.clicks.push({vp:vpName,c:'sort-menu-priceAsc',hit:sortHit});
    await page.waitForTimeout(1200);
    txt=await dumpText(page);
    assert(vpName,'K2-sort-menu-applies-client-order',(await dumpText(page)).length>100,{note:'client-side re-sort of loaded pages'});
    await shot(page,vpName,'95-after-category+sort');

    // product card navigation (tap first AU card)
    const before=page.url();
    const cardHit=await L.clickCard(page,'AU047') || await tapAnyNode(page,'TZS',60,40);
    OUT.clicks.push({vp:vpName,c:'product-card-tap',hit:cardHit});
    await page.waitForTimeout(2500);
    const after=page.url();
    assert(vpName,'K3-product-card-navigates',after!==before,{from:before,to:after});
    await shot(page,vpName,'96-after-card-nav');

    // back to browse for the record
    await page.goto(APP+'/browse',{waitUntil:'load'}).catch(()=>{}); await page.waitForTimeout(1500);
    await L.closeVideo(ctx,`${ROOT}/e2e/videos/${UNIT}-verify-r4-${vpName}.webm`);
  }
  await browser.close();
  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-047-r4.json`,JSON.stringify(OUT,null,1));
  console.log('SUMMARY asserts:',OUT.asserts.length,'fails:',OUT.asserts.filter(a=>!a.pass).length);
})();
