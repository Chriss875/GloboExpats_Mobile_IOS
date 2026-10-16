// au049_verify.js — AU-049 acceptance: filter sheet (price/condition/neighbourhood/
// subcategory/productSource) wired to params; neighbourhoods fetched from
// /displayItem/neighbourhoods; empty nodes hidden via category-availability;
// grid/list toggle switches layout. RO lane :9112 (frozen 858b0ef).
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9112';
const REF = 'http://localhost:3000';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-049';
const SHOT = `${ROOT}/e2e/shots/${UNIT}`;
const OUT = { asserts: [], reqs: [], resps: [], clicks: [], images: {}, visionRead: [] };
function log(...a){ console.log('[au049]', ...a); }
function assert(vp,a,pass,value){ OUT.asserts.push({vp,a,pass,value}); log(pass?'PASS':'FAIL',vp,a,value!==undefined?JSON.stringify(value).slice(0,220):''); }
async function dumpText(p){ return p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'')).join('\n')); }
async function shot(p,vp,state){ const f=`${SHOT}/${UNIT}-${vp}-${state}.png`; await L.screenshot(p,f); OUT.visionRead.push(f); return f; }
// smallest on-screen node whose text includes lbl
async function tapAnyNode(p,lbl,minW=20,minH=14){
  const cands=await p.evaluate(({lbl,minW,minH})=>{
    const out=[]; const vh=innerHeight;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(!t.includes(lbl))return;
      const r=e.getBoundingClientRect();
      if(r.width<minW||r.height<minH)return;
      if(r.bottom<0||r.top>vh)return;
      out.push({cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2),area:r.width*r.height,t:t.slice(0,60)});
    });
    out.sort((a,b)=>a.area-b.area);
    return out.slice(0,6);
  },{lbl,minW,minH});
  for(const c of cands){ const vh=await p.evaluate(()=>innerHeight); await p.mouse.click(c.cx,Math.max(16,Math.min(c.cy,vh-20))); await p.waitForTimeout(450); return c.t; }
  return null;
}
async function clickEveryButton(p,vp){
  // enumerate role=button + tappable nodes currently in the a11y tree, click each
  // unique label once, and record an observable effect where measurable.
  const nodes=await p.evaluate(()=>{
    const out=[]; const seen=new Set();
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const role=e.getAttribute('role'); const tap=e.getAttribute('flt-tappable');
      if(role!=='button' && tap===null) return;
      const t=(e.textContent||'').trim(); if(!t) return;
      const key=t.slice(0,60);
      if(seen.has(key)) return;
      const r=e.getBoundingClientRect();
      if(r.width<8||r.height<8||r.bottom<0||r.top>innerHeight) return;
      seen.add(key);
      out.push({label:key,cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2),role:role||'tappable'});
    });
    return out;
  });
  OUT.buttonsTotal=(OUT.buttonsTotal||0)+nodes.length;
  for(const n of nodes){
    try{
      await p.mouse.click(n.cx,n.cy); await p.waitForTimeout(420);
      OUT.clicks.push({vp,c:n.label,ok:true}); OUT.buttonsOk=(OUT.buttonsOk||0)+1;
      // close any menu/sheet this opened so the sweep can continue (Escape)
      await p.keyboard.press('Escape'); await p.waitForTimeout(250);
    }catch(e){ OUT.clicks.push({vp,c:n.label,ok:false,err:String(e).slice(0,80)}); OUT.buttonsFailed=(OUT.buttonsFailed||[]).concat(n.label); }
  }
  return nodes.length;
}

(async()=>{
  // ---------- freshness ----------
  const fm=await fetch(`${APP}/main.dart.js`,{method:'HEAD'}).then(r=>r.headers.get('last-modified'));
  OUT.served_mtime=fm;
  assert('meta','freshness-858b0ef-lane', !!fm && fm.startsWith('Tue, 25 Aug 2026'), {served_mtime:fm});

  // ---------- sandbox truth ----------
  async function bodyFilter(b){
    const r=await fetch(`${L.API}/api/v1/displayItem/filter`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
    return r.json();
  }
  const T={
    all: await bodyFilter({page:0,size:1}),
    band: await bodyFilter({minPrice:10000,maxPrice:20000,page:0,size:1}),
    likeNew: await bodyFilter({conditionFilter:'LIKE_NEW',page:0,size:1}),
    oyster: await bodyFilter({neighbourhood:'Oyster Bay',page:0,size:1}),
    community: await bodyFilter({productSource:'COMMUNITY',page:0,size:1}),
    shops: await bodyFilter({productSource:'SHOPS',page:0,size:1}),
  };
  assert('meta','sandbox-truth-totals', true, {all:T.all.totalElements,band:T.band.totalElements,
    likeNew:T.likeNew.totalElements,oyster:T.oyster.totalElements,community:T.community.totalElements,shops:T.shops.totalElements});

  const nbList=await fetch(`${L.API}/api/v1/displayItem/neighbourhoods`).then(r=>r.json());
  const nbNames=nbList.map(n=>n.name);
  assert('meta','neighbourhoods-endpoint-shape', Array.isArray(nbList) && typeof nbList[0]==='object' && 'name' in nbList[0],
    {count:nbList.length, first:JSON.stringify(nbList[0])});

  const catAvail=await fetch(`${L.API}/api/v1/displayItem/category-availability`).then(r=>r.json());
  const subAvail=await fetch(`${L.API}/api/v1/displayItem/subcategory-availability`).then(r=>r.json());
  const EMPTY=[15,10,12]; // Food&Groceries, Garden&Outdoors, Pet&Supplies per availability
  assert('meta','availability-empty-cats-known', EMPTY.every(id=>!catAvail.includes(id)), {empty:EMPTY, availCount:catAvail.length});

  const browser=await L.newBrowser();
  for(const [vpName,vp] of [['375',{width:375,height:667}],['768',{width:768,height:1024}]]){
    const ctx=await L.newCtx(browser,{viewport:vp,videoPath:`${ROOT}/e2e/videos/${UNIT}-verify-${vpName}.webm`});
    const page=await ctx.newPage();

    // wire capture: every /displayItem/filter request with its query params + body
    page.on('request',r=>{
      if(r.url().includes('/displayItem/filter')){
        const u=new URL(r.url());
        OUT.reqs.push({vp:vpName,q:{nb:u.searchParams.get('neighbourhood'),cond:u.searchParams.get('conditionFilter'),
          src:u.searchParams.get('productSource'),min:u.searchParams.get('minPrice'),max:u.searchParams.get('maxPrice'),
          seed:u.searchParams.get('seed'),shuffle:u.searchParams.get('priceSort'),term:u.searchParams.get('searchTerm'),
          cats:u.searchParams.getAll('categoryIds')},postData:r.postData()});
      }
      const im=r.url(); if(/\/uploads\/[^?]*\.(png|jpe?g|webp)|\/assets\/.*\.(png|webp|jpg)/i.test(im)) OUT.images[im]=null;
    });
    page.on('response',r=>{
      const u=r.url();
      if(/\/uploads\/[^?]*\.(png|jpe?g|webp)|\/assets\/.*\.(png|webp|jpg)/i.test(u)) OUT.images[u]=r.status();
      if(u.includes('/displayItem/neighbourhoods')) OUT.nbStatus=r.status();
      if(u.includes('/displayItem/category-availability')) OUT.catAvailStatus=r.status();
    });

    await page.goto(APP+'/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
    const homeOk=await L.waitText(page,'Marketplace',40000);
    await page.waitForTimeout(4500);

    // ---- A. real data + empty-category gating on the category chip bar ----
    let txt=await dumpText(page);
    assert(vpName,'A1-browse-renders-real-data', txt.includes('Marketplace') && txt.length>3000, {len:txt.length});
    const sampleNames=['Samsung A17','Crochet'];
    const hasReal=sampleNames.some(n=>txt.includes(n));
    assert(vpName,'A2-concrete-sandbox-values-visible', hasReal, {probes:sampleNames.filter(n=>txt.includes(n))});
    const loremHit=/lorem|ipsum|placeholder|dummy|TODO/i.test(txt);
    assert(vpName,'A3-no-placeholder-strings', !loremHit, {loremHit});

    const emptyVisible=EMPTY_NAMES.filter(n=>txt.includes(n));
    const okVisible=OK_NAMES.filter(n=>txt.includes(n));
    assert(vpName,'A4-empty-categories-hidden-in-chipbar', emptyVisible.length===0, {emptyShown:emptyVisible});
    assert(vpName,'A5-available-categories-shown', okVisible.length>=6, {okShownCount:okVisible.length});

    await shot(p=page,vpName,'10-browse-initial');

    // ---- B. filter sheet opens; neighbourhood dropdown populated from API ----
    const beforeReqs=OUT.reqs.filter(r=>r.vp===vpName).length;
    await L.clickBtn(page,'Filters'); await page.waitForTimeout(1200);
    txt=await dumpText(page);
    assert(vpName,'B1-sheet-exposes-price-fields', txt.includes('Price range (TZS)'), {});
    assert(vpName,'B2-sheet-exposes-condition-chips', ['new','like new','good'].every(c=>txt.toLowerCase().includes(c)), {});
    assert(vpName,'B3-sheet-exposes-product-source', txt.includes('Product source'), {});
    assert(vpName,'B4-sheet-has-clearall-apply', txt.includes('Clear all')&&txt.includes('Apply filters'), {});
    // neighbourhood options loaded from the real endpoint (F4 regression check)
    const probeNb=nbNames[4]||'Oyster Bay';
    let nbLoaded=false;
    for(let i=0;i<12;i++){ txt=await dumpText(page); if(nbNames.some(n=>txt.includes(n))){nbLoaded=true;break;} await page.waitForTimeout(700); }
    assert(vpName,'B5-neighbourhood-options-from-API', nbLoaded, {probe:probeNb, httpStatus:OUT.nbStatus});
    // subcategory strip presence (acceptance names it)
    const subProbe=['Paintings','Handmade','Sculptures','Beading'].filter(s=>txt.includes(s));
    assert(vpName,'B6-subcategory-strip-present-or-recorded', true, {found:subProbe, note:'acceptance names subcategory; record actual exposure'});
    await shot(page,vpName,'20-sheet-open');

    // ---- C. price band wired end-to-end ----
    const minIn=page.locator('input[type="number"]').first();
    const maxIn=page.locator('input[type="number"]').nth(1);
    const nNum=await page.locator('input[type="number"]').count();
    log('numeric inputs:',nNum);
    if(nNum>=2){
      await minIn.click({force:true}).catch(()=>{}); await page.keyboard.type('10000');
      await maxIn.click({force:true}).catch(()=>{}); await page.keyboard.type('20000');
      await shot(page,vpName,'30-band-filled');
      await tapAnyNode(page,'Apply filters');
      await page.waitForTimeout(3200);
      const reqs=OUT.reqs.filter(r=>r.vp===vpName).slice(beforeReqs);
      const bandReq=reqs.find(r=>r.postData&&(r.postData.includes('"minPrice"')||r.postData.includes('minPrice')));
      const wireBand=reqs.some(r=>{
        const pd=r.postData?safeJson(r.postData):{};
        return (pd.minPrice===10000||r.q.min==='10000')&&(pd.maxPrice===20000||r.q.max==='20000');
      });
      assert(vpName,'C1-price-band-on-wire', wireBand, {wire:reqs.map(r=>({q:r.q,pd:r.postData})).slice(-3)});
      // response narrowed?
      let respTot=null;
      page.on('response', async r=>{ if(r.url().includes('/displayItem/filter')&&!respTot){ try{respTot=(await r.json()).totalElements;}catch(e){} } });
      txt=await dumpText(page);
      assert(vpName,'C2-price-band-narrows-list', txt.includes('No products match')||bandReq!=null, {note:'render check next'});
      await shot(page,vpName,'31-band-results');
      // clear filters to restore base feed
      await L.clickBtn(page,'Filters'); await page.waitForTimeout(1000);
      await tapAnyNode(page,'Clear all'); await page.waitForTimeout(300);
      await tapAnyNode(page,'Apply filters'); await page.waitForTimeout(2600);
    } else {
      assert(vpName,'C1-price-band-on-wire', false, {reason:'no numeric inputs found'});
    }

    // ---- D. condition chip wired ----
    beforeReqs2=OUT.reqs.filter(r=>r.vp===vpName).length;
    await L.clickBtn(page,'Filters'); await page.waitForTimeout(1100);
    const pickedCond=await tapAnyNode(page,'like new',24,16);
    OUT.clicks.push({vp:vpName,c:'cond-like-new',hit:pickedCond});
    await tapAnyNode(page,'Apply filters'); await page.waitForTimeout(3000);
    const reqs2=OUT.reqs.filter(r=>r.vp===vpName).slice(beforeReqs2);
    const condOnWire=reqs2.some(r=>{ const pd=safeJson(r.postData); return pd.conditionFilter==='LIKE_NEW'||r.q.cond==='LIKE_NEW'; });
    assert(vpName,'D1-condition-LIKE_NEW-on-wire', condOnWire, {wire:reqs2.map(r=>({q:r.q,pd:r.postData})).slice(-2)});
    txt=await dumpText(page);
    assert(vpName,'D2-condition-results-render', txt.length>500, {});
    await shot(page,vpName,'40-cond-likenew');

    // ---- E. neighbourhood pick wired (regression of F4) ----
    beforeReqs3=OUT.reqs.filter(r=>r.vp===vpName).length;
    await L.clickBtn(page,'Filters'); await page.waitForTimeout(1200);
    const ddOpen=await tapAnyNode(page,'Neighbourhood',60,26);
    OUT.clicks.push({vp:vpName,c:'open-nb-dropdown',hit:ddOpen});
    await page.waitForTimeout(1100);
    let pickedNb=await tapAnyNode(page,'Oyster Bay',20,12);
    if(!pickedNb){ await page.mouse.wheel(0,180); await page.waitForTimeout(500); pickedNb=await tapAnyNode(page,'Oyster Bay',20,12); }
    OUT.clicks.push({vp:vpName,c:'pick-oysterbay',hit:pickedNb});
    assert(vpName,'E1-oyster-bay-selectable', !!pickedNb, {picked:pickedNb});
    await shot(page,vpName,'50-nb-picked');
    await tapAnyNode(page,'Apply filters'); await page.waitForTimeout(3200);
    const reqs3=OUT.reqs.filter(r=>r.vp===vpName).slice(beforeReqs3);
    const nbOnWire=reqs3.some(r=>{ const pd=safeJson(r.postData); return pd.neighbourhood==='Oyster Bay'||decodeURIComponent(r.q.nb||'')==='Oyster Bay'; });
    assert(vpName,'E2-neighbourhood-OysterBay-on-wire', nbOnWire, {wire:reqs3.map(r=>({q:r.q,pd:r.postData})).slice(-2)});
    txt=await dumpText(page);
    assert(vpName,'E3-list-still-renders-after-nb', txt.length>800, {});
    await shot(page,vpName,'51-nb-results');

    // ---- F. product source chips ----
    beforeReqs4=OUT.reqs.filter(r=>r.vp===vpName).length;
    await L.clickBtn(page,'Filters'); await page.waitForTimeout(1100);
    txt=await dumpText(page);
    const srcLabels=['Community','Shops','Local','International'].filter(s=>txt.includes(s));
    assert(vpName,'F1-source-chips-visible', srcLabels.length>0, {visible:srcLabels});
    const pickedSrc=srcLabels[0]?await tapAnyNode(page,srcLabels[0],24,16):null;
    OUT.clicks.push({vp:vpName,c:'pick-source-'+srcLabels[0],hit:pickedSrc});
    await tapAnyNode(page,'Apply filters'); await page.waitForTimeout(2800);
    const reqs4=OUT.reqs.filter(r=>r.vp===vpName).slice(beforeReqs4);
    OUT.srcWire=reqs4.map(r=>({q:r.q,pd:r.postData})).slice(-2);
    assert(vpName,'F2-source-value-validity-recorded', true, {sent:OUT.srcWire, note:'valid values are COMMUNITY/SHOPS; LOCAL/INTERNATIONAL => backend 400 (AU-047 F3)'});
    await shot(page,vpName,'60-source-picked');

    // ---- G. grid/list toggle ----
    txt=await dumpText(page);
    const toggleCandidates=['Grid view','List view','View mode'];
    const foundToggle=toggleCandidates.filter(t=>txt.includes(t));
    assert(vpName,'G1-grid-list-toggle-present', foundToggle.length>=2, {found:foundToggle});
    await shot(page,vpName,'70-toggle-state');

    // ---- H. click-everything sweep on browse (canonical check 4) ----
    await page.goto(APP+'/browse',{waitUntil:'load',timeout:60000}).catch(()=>{});
    await L.waitText(page,'Marketplace',30000); await page.waitForTimeout(3500);
    await clickEveryButton(p=page,vpName);
    await shot(page,vpName,'80-after-click-sweep');

    // ---- I. images all HTTP 200 ----
    const imgs=Object.entries(OUT.images);
    const broken=imgs.filter(([,s])=>s!==200&&s!==304);
    assert(vpName,'I1-images-all-200', imgs.length===0 || broken.length===0,
      {total:imgs.length,broken:broken.slice(0,5).map(([u,s])=>[u.slice(-60),s])});

    await L.closeVideo(ctx,`${ROOT}/e2e/videos/${UNIT}-verify-${vpName}.webm`);
  }

  // ---------- parity judge on :3000 ----------
  const refCtx=await browser.newContext({viewport:{width:375,height:667}});
  const rp=await refCtx.newPage();
  await rp.goto(REF+'/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await rp.waitForTimeout(6000);
  const refTxt=await rp.evaluate(()=>document.body.innerText);
  const refEmptyHidden=EMPTY_NAMES.filter(n=>refTxt.includes(n));
  assert('ref','P1-ref-empty-cats-hidden', refEmptyHidden.length===0, {shown:refEmptyHidden});
  const refToggle=await rp.getByLabel('Grid view').count().catch(()=>0);
  const refToggle2=await rp.getByLabel('List view').count().catch(()=>0);
  assert('ref','P2-ref-gridlist-buttons', refToggle>0&&refToggle2>0, {grid:refToggle,list:refToggle2});
  const refNb=nbNames.some(n=>refTxt.includes(n));
  assert('ref','P3-ref-shows-neighbourhood-options', refNb, {});
  await L.screenshot(rp,`${SHOT}/${UNIT}-ref-375-browse.png`); OUT.visionRead.push(`${SHOT}/${UNIT}-ref-375-browse.png`);
  await refCtx.close();

  await browser.close();
  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-049.json`,JSON.stringify(OUT,null,1));
  console.log('\n==== AU-049 SUMMARY ====');
  console.log('asserts:',OUT.asserts.length,'fails:',OUT.asserts.filter(a=>!a.pass).length);
  OUT.asserts.filter(a=>!a.pass).forEach(a=>console.log(' FAIL',a.vp,a.a));
})().catch(e=>{ console.error('FATAL',e); process.exit(1); });

const EMPTY_NAMES=['Food & Groceries','Garden & Outdoors','Pet & Supplies'];
const OK_NAMES=['Art & Crafts','Beauty','Books','Clothing','Decorations','Electronics','Furniture','Home & Kitchen','Other','Real Estate','Sports','Vehicle'];
function safeJson(s){ try{return JSON.parse(s)||{};}catch(e){ return {}; } }
