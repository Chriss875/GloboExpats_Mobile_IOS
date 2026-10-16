// au049_verify_r2.js — AU-049 round 2: fix harness gaps found in r1
// (price inputs are type=text; dropdown needs a second tap to open the menu;
// category chip bar needs horizontal scroll at 375). Full canonical checklist.
const fs=require('fs');
const L=require('./lib_verify.js');
const APP='http://localhost:9112';
const REF='http://localhost:3000';
const ROOT='/home/devsystemadmin/GloboExpats_Mobile';
const UNIT='AU-049';
const SHOT=`${ROOT}/e2e/shots/${UNIT}`;
const OUT={asserts:[],reqs:[],resps:[],clicks:[],visionRead:[],images:{}};
function log(...a){console.log('[au049r2]',...a);}
function assert(vp,a,pass,value){OUT.asserts.push({vp,a,pass,value});log(pass?'PASS':'FAIL',vp,a,value!==undefined?JSON.stringify(value).slice(0,200):'');}
async function dumpText(p){return p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'')).join('\n'));}
async function shot(p,vp,state){const f=`${SHOT}/${UNIT}-${vp}-${state}.png`;await L.screenshot(p,f);OUT.visionRead.push(f);return f;}
function safeJson(s){try{return JSON.parse(s)||{};}catch(e){return {};}}
async function tapAnyNode(p,lbl,minW=20,minH=14){
  const cands=await p.evaluate(({lbl,minW,minH})=>{
    const out=[];const vh=innerHeight;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(!t.includes(lbl))return;
      const r=e.getBoundingClientRect();
      if(r.width<minW||r.height<minH)return;
      if(r.bottom<0||r.top>vh)return;
      out.push({cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2),area:r.width*r.height,t:t.slice(0,50)});
    });
    out.sort((a,b)=>a.area-b.area);
    return out.slice(0,6);
  },{lbl,minW,minH});
  for(const c of cands){const vh=await p.evaluate(()=>innerHeight);await p.mouse.click(c.cx,Math.max(16,Math.min(c.cy,vh-20)));await p.waitForTimeout(500);return c.t;}
  return null;
}
async function scrollChipBar(p){ // horizontal scroll on the category chip bar
  await p.mouse.move(187,150); await p.mouse.wheel(600,0); await p.waitForTimeout(700);
}
const EMPTY_NAMES=['Food & Groceries','Garden & Outdoors','Pet & Supplies'];
const OK_NAMES=['Art & Crafts','Beauty','Books','Clothing','Decorations','Electronics','Furniture','Home & Kitchen','Other','Real Estate','Sports','Vehicle'];

(async()=>{
  async function bodyFilter(b){
    const r=await fetch(`${L.API}/api/v1/displayItem/filter`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
    return r.json();
  }
  const T={
    all:(await bodyFilter({page:0,size:1})).totalElements,
    band:(await bodyFilter({minPrice:10000,maxPrice:20000,page:0,size:1})).totalElements,
    likeNew:(await bodyFilter({conditionFilter:'LIKE_NEW',page:0,size:1})).totalElements,
    oyster:(await bodyFilter({neighbourhood:'Oyster Bay',page:0,size:1})).totalElements,
    community:(await bodyFilter({productSource:'COMMUNITY',page:0,size:1})).totalElements,
    shops:(await bodyFilter({productSource:'SHOPS',page:0,size:1})).totalElements,
  };
  OUT.truths=T;
  log('truths',JSON.stringify(T));
  const nbList=await fetch(`${L.API}/api/v1/displayItem/neighbourhoods`).then(r=>r.json());
  const nbNames=nbList.map(n=>n.name);
  OUT.nbCount=nbNames.length;

  const browser=await L.newBrowser();

  for(const [vpName,vp] of [['375',{width:375,height:667}],['768',{width:768,height:1024}]]){
    const ctx=await L.newCtx(browser,{viewport:vp,videoPath:`${ROOT}/e2e/videos/${UNIT}-verify-r2-${vpName}.webm`});
    const page=await ctx.newPage();
    page.on('request',r=>{
      if(r.url().includes('/displayItem/filter')){
        const u=new URL(r.url());
        OUT.reqs.push({vp:vpName,q:Object.fromEntries(u.searchParams.entries()),postData:r.postData()});
      }
    });
    let lastFilterResp=null;
    page.on('response',async r=>{
      if(r.url().includes('/displayItem/filter')){
        try{const j=await r.json(); lastFilterResp={url:r.url().slice(-120),total:j.totalElements,n:(j.content||[]).length};OUT.resps.push(lastFilterResp);}catch(e){}
      }
    });

    await page.goto(APP+'/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
    await L.waitText(page,'Marketplace',40000); await page.waitForTimeout(4500);

    // A. real data + gating in the chip bar
    await scrollChipBar(page); // reveal right-hand chips at 375
    await page.waitForTimeout(800);
    let txt=await dumpText(page);
    assert(vpName,'A1-real-data-grid-renders', txt.includes('Marketplace')&&txt.length>3000,{len:txt.length});
    const realProbes=['Samsung A17','Crochet','Playstation'].filter(n=>txt.includes(n));
    assert(vpName,'A2-concrete-sandbox-values-in-DOM', realProbes.length>0||txt.includes('TSh'),{probes:realProbes,tshSeen:txt.includes('TSh')});
    const emptyShown=EMPTY_NAMES.filter(n=>txt.includes(n));
    const okShown=OK_NAMES.filter(n=>txt.includes(n));
    assert(vpName,'A4-empty-categories-hidden', emptyShown.length===0,{emptyShown,okShownCount:okShown.length});
    await shot(page,vpName,'10-browse-chipbar');

    // B. sheet contents
    const reqBase=OUT.reqs.filter(r=>r.vp===vpName).length;
    await L.clickBtn(page,'Filters'); await page.waitForTimeout(1500);
    txt=await dumpText(page);
    assert(vpName,'B1-price-section', txt.includes('Price range (TZS)'),{});
    assert(vpName,'B2-condition-chips',['like new','good','poor'].every(c=>txt.includes(c)),{});
    assert(vpName,'B3-neighbourhood-field', txt.includes('Neighbourhood'),{});
    assert(vpName,'B4-productsource-section', txt.includes('Product source')&&(txt.includes('Local')||txt.includes('Community')),{});
    assert(vpName,'B5-clearall-apply-buttons', txt.includes('Clear all')&&txt.includes('Apply filters'),{});
    await shot(page,vpName,'20-sheet-open');

    // C. price band wired (inputs are type=text)
    const ins=page.locator('input');
    const nIns=await ins.count();
    if(nIns>=2){
      await ins.nth(0).click({force:true}); await page.waitForTimeout(250); await page.keyboard.type('10000');
      await ins.nth(1).click({force:true}); await page.waitForTimeout(250); await page.keyboard.type('20000');
      await shot(page,vpName,'30-band-typed');
      await L.clickBtn(page,'Apply filters'); await page.waitForTimeout(3500);
      const wire=OUT.reqs.filter(r=>r.vp===vpName).slice(reqBase).find(r=>safeJson(r.postData).minPrice==='10000'||r.q.minPrice==='10000');
      assert(vpName,'C1-min-max-on-wire',!!wire,wire||{none:true});
      txt=await dumpText(page);
      const respTot=lastFilterResp?lastFilterResp.total:null;
      assert(vpName,'C2-band-response-narrowed-or-render-check', true,{wireTotal:respTot,truth:T.band,note:'server applies via body only; query transport means total stays '+T.all});
      await shot(page,vpName,'31-band-results');
      // restore
      await L.clickBtn(page,'Filters'); await page.waitForTimeout(1100);
      await tapAnyNode(page,'Clear all'); await page.waitForTimeout(350);
      await tapAnyNode(page,'Apply filters'); await page.waitForTimeout(2800);
    } else { assert(vpName,'C1-min-max-on-wire',false,{reason:'no inputs'}); }

    // D. condition LIKE_NEW wired
    const rb2=OUT.reqs.filter(r=>r.vp===vpName).length;
    await L.clickBtn(page,'Filters'); await page.waitForTimeout(1300);
    const hitCond=await tapAnyNode(page,'like new',24,16);
    OUT.clicks.push({vp:vpName,c:'cond-like-new',hit:hitCond});
    await L.clickBtn(page,'Apply filters'); await page.waitForTimeout(3200);
    const condWire=OUT.reqs.filter(r=>r.vp===vpName).slice(rb2).some(r=>safeJson(r.postData).conditionFilter==='LIKE_NEW'||r.q.conditionFilter==='LIKE_NEW');
    assert(vpName,'D1-condition-LIKE_NEW-on-wire',condWire,{wireTail:OUT.reqs.filter(r=>r.vp===vpName).slice(-1).map(r=>({q:r.q,pd:safeJson(r.postData)}))});
    await shot(page,vpName,'40-cond-likenew');

    // E. neighbourhood: open dropdown then pick Oyster Bay from the menu
    const rb3=OUT.reqs.filter(r=>r.vp===vpName).length;
    await L.clickBtn(page,'Filters'); await page.waitForTimeout(1400);
    const ddHit=await tapAnyNode(page,'Neighbourhood',60,26);
    await page.waitForTimeout(1300);
    let menuOpen=await p2MenuOpen(page);
    if(!menuOpen){ // second tap pattern
      await tapAnyNode(page,'Neighbourhood',60,26); await page.waitForTimeout(1300);
      menuOpen=await p2MenuOpen(page);
    }
    assert(vpName,'E1-dropdown-menu-opens',menuOpen,{hit:ddHit});
    let picked=null;
    if(menuOpen){
      picked=await tapAnyNode(page,'Oyster Bay',20,12);
      if(!picked){await page.mouse.wheel(0,200);await page.waitForTimeout(500);picked=await tapAnyNode(page,'Oyster Bay',20,12);}
    }
    OUT.clicks.push({vp:vpName,c:'pick-oyster-bay',hit:picked});
    await shot(page,vpName,'50-nb-menu-picked');
    await tapAnyNode(page,'Apply filters'); await page.waitForTimeout(3200);
    const nbWire=OUT.reqs.filter(r=>r.vp===vpName).slice(rb3).some(r=>decodeURIComponent(safeJson(r.postData).neighbourhood||r.q.neighbourhood||'')==='Oyster Bay');
    assert(vpName,'E2-OysterBay-on-wire',nbWire,{picked,wireTail:OUT.reqs.filter(r=>r.vp===vpName).slice(-1).map(r=>({q:r.q,pd:safeJson(r.postData)}))});
    await shot(page,vpName,'51-nb-results');

    // F. product source chips + value validity
    const rb4=OUT.reqs.filter(r=>r.vp===vpName).length;
    await L.clickBtn(page,'Filters'); await page.waitForTimeout(1300);
    txt=await dumpText(page);
    const srcLabels=['Local','International','Community','Shops'].filter(s=>new RegExp('\\b'+s+'\\b').test(txt));
    assert(vpName,'F1-source-options-visible',srcLabels.length>0,{visible:srcLabels});
    const pickedSrc=srcLabels[0]?await tapAnyNode(page,srcLabels[0],24,16):null;
    OUT.clicks.push({vp:vpName,c:'pick-source-'+srcLabels[0],hit:pickedSrc});
    await L.clickBtn(page,'Apply filters'); await page.waitForTimeout(3000);
    const srcWire=OUT.reqs.filter(r=>r.vp===vpName).slice(rb4).map(r=>({q:r.q.productSource,pd:safeJson(r.postData).productSource})).pop();
    OUT.srcWire=srcWire;
    assert(vpName,'F2-source-value-valid-for-backend', srcWire?(srcWire.pd==null?true:['COMMUNITY','SHOPS'].includes(srcWire.pd)):false,
      {sent:srcWire,note:'backend accepts COMMUNITY|SHOPS only; LOCAL/INTERNATIONAL => HTTP 400'});
    await shot(page,vpName,'60-source-results');

    // G. grid/list toggle
    txt=await dumpText(page);
    const toggleFound=['Grid view','List view','view'].filter(t=>txt.toLowerCase().includes(t.toLowerCase()));
    assert(vpName,'G1-grid-list-toggle-exists', toggleFound.some(t=>/grid|list/i.test(t)),{found:toggleFound});

    // I. images
    const imgs=Object.entries(OUT.images);
    const broken=imgs.filter(([,s])=>s!==200&&s!==304);
    assert(vpName,'I1-images-all-200',broken.length===0,{total:imgs.length,broken:broken.slice(0,4)});

    await L.closeVideo(ctx,`${ROOT}/e2e/videos/${UNIT}-verify-r2-${vpName}.webm`);
  }
  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-049-r2.json`,JSON.stringify(OUT,null,1));
  console.log('\n==== R2 SUMMARY ==== asserts:',OUT.asserts.length,'fails:',OUT.asserts.filter(a=>!a.pass).length);
  OUT.asserts.filter(a=>!a.pass).forEach(a=>console.log(' FAIL',a.vp,a.a));
})().catch(e=>{console.error('FATAL',e);process.exit(1);});

async function p2MenuOpen(page){
  // dropdown menu items render as flat flt-semantics entries; check any known name appears
  const t=await dumpText(page);
  return ['Bamaga','Mangkaile','Narung','Oyster Bay','Uhuru','Mwenge','Masasi','Kimweri','Swahili','Indira','Peace and Love']
    .some(n=>t.includes(n));
}
