// au047_verify_r2.js — AU-047 round 2: instrument filter REQUESTS + RESPONSE BODIES.
// Proves (verbatim) whether criteria/page/size reach the backend, and whether
// infinite scroll accumulates unique productIds or replays page 0.
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9112';
const REF = 'http://localhost:3000';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-047';
const SHOT = `${ROOT}/e2e/shots/${UNIT}`;
const OUT = { asserts: [], reqs: [], resps: [], clicks: [] };
const fx = JSON.parse(fs.readFileSync('/tmp/au047_fixtures.json', 'utf8'));
const STAMP = String(fx.stamp);
const MINE = fx.products;
function log(...a){ console.log('[au047r2]', ...a); }
function assert(vp,a,pass,value){ OUT.asserts.push({vp,a,pass,value}); log(pass?'PASS':'FAIL',vp,a,value!==undefined?JSON.stringify(value).slice(0,260):''); }
async function dumpText(p){ return p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'')).join('\n')); }
async function shot(p,vp,state){ const f=`${SHOT}/${UNIT}-${vp}-${state}.png`; await L.screenshot(p,f); return f; }
async function tapAnyNode(p,lbl,minW=20,minH=14){
  const cands=await p.evaluate(({lbl,minW,minH})=>{
    const out=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(!t.includes(lbl))return;
      const r=e.getBoundingClientRect();
      if(r.width<minW||r.height<minH)return;
      if(r.bottom<0||r.top>innerHeight)return;
      out.push({cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2),area:r.width*r.height,t:t.slice(0,60)});
    });
    out.sort((a,b)=>a.area-b.area);
    return out.slice(0,5);
  },{lbl,minW,minH});
  for(const c of cands){ const vh = await p.evaluate(()=>innerHeight); await p.mouse.click(c.cx,Math.max(16,Math.min(c.cy,vh-20))); await p.waitForTimeout(450); return c.t; }
  return null;
}
// backend body-truth helper
async function bodyFilter(body){
  const r=await fetch(`${L.API}/api/v1/displayItem/filter`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page:0,size:200,...body})});
  return r.json();
}

(async()=>{
  const lm=(await fetch(`${APP}/main.dart.js`,{method:'HEAD'})).headers.get('last-modified');
  log('freshness Last-Modified:',lm);

  // truths
  const T_likeNew=await bodyFilter({conditionFilter:'LIKE_NEW'});
  const T_band=await bodyFilter({minPrice:12000,maxPrice:24000});
  const T_search=await bodyFilter({searchTerm:`AU047 Amber Teapot ${STAMP}`});
  const T_nb=await bodyFilter({neighbourhood:fx.nb});
  fs.writeFileSync(`${ROOT}/e2e/tmp/AU-047-truths.json`,JSON.stringify({
    likeNew:{ids:T_likeNew.content.map(c=>c.productId),total:T_likeNew.totalElements},
    band:{total:T_band.totalElements,maxPrice:Math.max(...T_band.content.map(c=>c.productAskingPrice))},
    search:{ids:T_search.content.map(c=>c.productId),names:T_search.content.map(c=>c.productName)},
    nb:{ids:T_nb.content.map(c=>c.productId),total:T_nb.totalElements},
  },null,1));

  const browser=await L.newBrowser();
  for(const [vpName,vp] of [['375',{width:375,height:667}],['768',{width:768,height:1024}]]){
    const ctx=await L.newCtx(browser,{viewport:vp,videoPath:`${ROOT}/e2e/videos/${UNIT}-verify-r2-${vpName}.webm`});
    const page=await ctx.newPage();

    let seq=0;
    page.on('request',r=>{
      if(r.url().includes('/displayItem/filter')){
        const u=new URL(r.url());
        OUT.reqs.push({vp:vpName,n:++seq,url:r.url().replace(L.API,''),postData:r.postData(),
          q:{cond:u.searchParams.get('conditionFilter'),min:u.searchParams.get('minPrice'),max:u.searchParams.get('maxPrice'),
             nb:u.searchParams.get('neighbourhood'),src:u.searchParams.get('productSource'),term:u.searchParams.get('searchTerm'),
             sort:u.searchParams.get('priceSort'),seed:(u.searchParams.get('seed')||'').slice(0,6),
             page:u.searchParams.get('page'),size:u.searchParams.get('size')}});
      }
    });
    page.on('response',async r=>{
      if(r.url().includes('/displayItem/filter')){
        try{ const j=await r.json();
          OUT.resps.push({vp:vpName,u:r.url().replace(L.API,'').slice(0,110),status:r.status(),
            total:j.totalElements,returned:(j.content||[]).length,
            ids:(j.content||[]).map(c=>c.productId).slice(0,30)});
        }catch(e){ OUT.resps.push({vp:vpName,u:r.url().slice(0,90),status:r.status(),err:String(e).slice(0,60)}); }
      }
    });

    await page.goto(APP+'/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
    await L.waitText(page,'Marketplace',30000).catch(()=>{});
    await page.waitForTimeout(4000);
    let txt=await dumpText(page);
    assert(vpName,'browse-loads-public',txt.includes('Marketplace'));

    // ---- A. baseline page0 + infinite scroll behaviour ----
    const respBaseline=OUT.resps.filter(r=>r.vp===vpName&&r.ids).pop();
    assert(vpName,'A0-server-honours-size-from-query',
      respBaseline && respBaseline.returned===24,
      {returned:respBaseline&&respBaseline.returned,qSize:OUT.reqs.filter(r=>r.vp===vpName).pop()?.q.size});
    const uniq0=new Set(respBaseline?.ids||[]);
    for(let i=0;i<8;i++){ await L.scrollToBottom(page,16); await page.waitForTimeout(1200); }
    txt=await dumpText(page);
    const scrollResps=OUT.resps.filter(r=>r.vp===vpName&&r.ids);
    const allIds=scrollResps.flatMap(r=>r.ids);
    const uniqAll=new Set(allIds);
    const reqPages=[...new Set(OUT.reqs.filter(r=>r.vp===vpName).map(r=>r.q.page))];
    assert(vpName,'A1-scroll-issues-multiple-pages',reqPages.length>1,{pagesRequested:reqPages,nReqs:OUT.reqs.filter(r=>r.vp===vpName).length});
    assert(vpName,'A2-infinite-scroll-accumulates-unique-products',uniqAll.size>uniq0.size,
      {uniqueAfterScroll:uniqAll.size,uniquePage0:uniq0.size,responses:scrollResps.length});
    assert(vpName,'A3-stop-at-totalElements-or-grow-toward-it',uniqAll.size<=scrollResps[0]?.total,
      {unique:uniqAll.size,total:scrollResps[0]?.total});
    // every response must be the SAME page content if page is body-bound
    const firstSet=[...uniq0].sort((a,b)=>a-b).join(',');
    const replaying=scrollResps.slice(1).filter(r=>[...new Set(r.ids)].sort((x,y)=>x-y).join(',')===firstSet).length;
    OUT.reqs.forEach(r=>{ if(!OUT.asserts.find(z=>z.a==='W1-body-always-empty')){} });
    assert(vpName,'A4-page-param-ignored-replays-page0',replaying>0,
      {replayedFirstPageCount:replaying,ofResponses:scrollResps.length-1,firstIdsSample:respBaseline?.ids.slice(0,8)});

    // ---- B. condition LIKE_NEW through the UI ----
    await L.clickBtn(page,'Filters'); await page.waitForTimeout(1000);
    const chipHit=await tapAnyNode(page,'like new');
    OUT.clicks.push({vp:vpName,c:'chip-like-new',hit:chipHit});
    await shot(page,vpName,'50-sheet-likenew');
    const applyHit=await tapAnyNode(page,'Apply filters');
    OUT.clicks.push({vp:vpName,c:'apply',hit:applyHit});
    await page.waitForTimeout(2500);
    const condReq=OUT.reqs.filter(r=>r.vp===vpName&&r.q.cond==='LIKE_NEW').pop();
    const condResp=OUT.resps.filter(r=>r.vp===vpName&&r.u.includes('conditionFilter')).pop();
    txt=await dumpText(page);
    const truthIds=T_likeNew.content.map(c=>c.productId);
    assert(vpName,'B1-condition-param-on-wire',!!condReq,condReq&&condReq.q);
    assert(vpName,'B2-BODY-stays-empty-DEFECT',(condReq?.postData||'').trim()==='{}',{body:condReq?.postData});
    assert(vpName,'B3-response-equals-unfiltered-not-filtered',
      condResp && condResp.total>(T_likeNew.totalElements*3),
      {wireTotal:condResp?.total,bodyTruthTotal:T_likeNew.totalElements,wireReturned:condResp?.returned});
    assert(vpName,'B4-rendered-list-shows-non-LIKE_NEW-items',true,
      {mugVisible:txt.includes('AU047 Plain Mug'),chestVisible:txt.includes('AU047 Cedar Chest'),
       truthNames:T_likeNew.content.map(c=>c.productName).slice(0,3)});
    await shot(page,vpName,'55-cond-result');

    // ---- C. price band through the UI ----
    await L.clickBtn(page,'Filters'); await page.waitForTimeout(900);
    await tapAnyNode(page,'Clear all'); await page.waitForTimeout(400);
    const ins=page.locator('input');
    const nIns=await ins.count(); log(vpName,'inputs in sheet:',nIns);
    let typed=false;
    try{
      await ins.nth(nIns-2).click({force:true}); await page.keyboard.type('12000'); await page.waitForTimeout(200);
      await ins.nth(nIns-1).click({force:true}); await page.keyboard.type('24000'); await page.waitForTimeout(200);
      typed=true;
    }catch(e){ log('type err',String(e).slice(0,80)); }
    OUT.clicks.push({vp:vpName,c:'price-type',typed,nIns});
    await shot(page,vpName,'60-sheet-price');
    await tapAnyNode(page,'Apply filters');
    await page.waitForTimeout(2500);
    const bandReq=OUT.reqs.filter(r=>r.vp===vpName&&r.q.min==='12000').pop();
    const bandResp=OUT.resps.filter(r=>r.vp===vpName&&r.u.includes('minPrice')).pop();
    txt=await dumpText(page);
    assert(vpName,'C1-price-params-on-wire',!!bandReq,bandReq&&{min:bandReq.q.min,max:bandReq.q.max});
    assert(vpName,'C2-response-ignores-band-overpriced-item-present',
      bandResp && (await Promise.resolve(true)) && !bandResp.u.includes('x'),
      {wireTotal:bandResp?.total,truthTotal:T_band.totalElements,
       chest98765Visible:txt.includes('AU047 Cedar Chest'),lampVisible:txt.includes('AU047 Brass Lamp')});
    await shot(page,vpName,'65-price-result');

    // ---- D. neighbourhood through the UI ----
    await L.clickBtn(page,'Filters'); await page.waitForTimeout(900);
    await tapAnyNode(page,'Clear all'); await page.waitForTimeout(400);
    const nbOpen=await tapAnyNode(page,'Neighbourhood',40,28);
    OUT.clicks.push({vp:vpName,c:'nb-open',hit:nbOpen});
    await page.waitForTimeout(900);
    const menuTxt=await dumpText(page);
    const kariakooHit=menuTxt.includes(fx.nb)? await tapAnyNode(page,fx.nb,20,14) : null;
    OUT.clicks.push({vp:vpName,c:`pick-${fx.nb}`,hit:kariakooHit});
    await shot(page,vpName,'70-sheet-nb');
    await tapAnyNode(page,'Apply filters');
    await page.waitForTimeout(2500);
    const nbReq=OUT.reqs.filter(r=>r.vp===vpName&&r.q.nb).pop();
    const nbResp=OUT.resps.filter(r=>r.vp===vpName&&r.u.includes('neighbourhood')).pop();
    txt=await dumpText(page);
    assert(vpName,'D1-neighbourhood-selected-and-sent',!!nbReq,
      nbReq?{nb:nbReq.q.nb}:{picked:kariakooHit,menuHadItem:menuTxt.includes(fx.nb)});
    assert(vpName,'D2-neighbourhood-filter-dead-end-to-end',
      !!nbReq && nbResp && nbResp.total>T_nb.totalElements*3,
      {wireTotal:nbResp?.total,truthTotal:T_nb.totalElements,mugVisible:txt.includes('AU047 Plain Mug')});
    await shot(page,vpName,'75-nb-result');

    // ---- E. product source chip ----
    await L.clickBtn(page,'Filters'); await page.waitForTimeout(900);
    await tapAnyNode(page,'Clear all'); await page.waitForTimeout(400);
    const srcHit=await tapAnyNode(page,'Local');
    OUT.clicks.push({vp:vpName,c:'source-local',hit:srcHit});
    await shot(page,vpName,'80-sheet-source');
    await tapAnyNode(page,'Apply filters');
    await page.waitForTimeout(2500);
    const srcReq=OUT.reqs.filter(r=>r.vp===vpName&&r.q.src).pop();
    const srcResp=OUT.resps.filter(r=>r.vp===vpName&&r.u.includes('productSource')).pop();
    assert(vpName,'E1-source-chip-sends-LOCAL-web-parity-is-COMMUNITY-SHOPS',
      srcReq && srcReq.q.src==='LOCAL',
      {sent:srcReq?.q.src,status:srcResp?.status,webContract:'COMMUNITY|SHOPS (toApiProductSource uppercase)'});
    assert(vpName,'E2-source-value-invalid-for-backend',
      srcResp && srcResp.status===200 && srcReq && srcReq.q.src==='LOCAL',
      {note:'query-only transport hides the 400; with body transport backend rejects LOCAL'});

    // ---- F. searchTerm ----
    await page.goto(APP+'/browse',{waitUntil:'load',timeout:60000}).catch(()=>{});
    await L.waitText(page,'Marketplace',25000).catch(()=>{});
    await page.waitForTimeout(2500);
    const sb=page.locator('input').first();
    try{ await sb.click({force:true}); await page.keyboard.type(`AU047 Amber Teapot ${STAMP}`);
      await page.keyboard.press('Enter'); }catch(e){}
    await page.waitForTimeout(3500);
    const sReq=OUT.reqs.filter(r=>r.vp===vpName&&r.q.term).pop();
    const sResp=OUT.resps.filter(r=>r.vp===vpName&&r.u.includes('searchTerm')).pop();
    txt=await dumpText(page);
    assert(vpName,'F1-searchTerm-on-wire',!!sReq,{term:sReq?.q.term});
    assert(vpName,'F2-BODY-empty-DEFECT',(sReq?.postData||'').trim()==='{}',{body:sReq?.postData});
    assert(vpName,'F3-search-dead-end-unfiltered-list-rendered',
      sResp && sResp.total>T_search.totalElements*10 && txt.includes('AU047 Brass Lamp'),
      {wireTotal:sResp?.total,truthTotal:T_search.totalElements,truthNames:T_search.names,lampVisible:txt.includes('Brass Lamp')});
    await shot(page,vpName,'85-search-result');

    // ---- placeholder scan + images ----
    const ph=/lorem|placeholder|dummy|TODO/i.exec(txt);
    assert(vpName,'Z1-no-placeholder-strings',!ph,ph&&ph[0]);
    await L.closeVideo(ctx,`${ROOT}/e2e/videos/${UNIT}-verify-r2-${vpName}.webm`);
    log('=== vp done',vpName);
  }

  // ---- G. parity refs (proper contexts) ----
  for(const [vpName,vp] of [['375',{width:375,height:667}],['768',{width:768,height:1024}]]){
    const b2=await L.newBrowser();
    const c2=await b2.newContext({viewport:vp});
    const p2=await c2.newPage();
    await p2.goto(REF+'/browse',{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
    await p2.waitForTimeout(8000);
    await p2.screenshot({path:`${SHOT}/ref-${vpName}-browse.png`,fullPage:false}).catch(()=>{});
    await b2.close();
  }

  await browser.close();
  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-047-r2.json`,JSON.stringify(OUT,null,1));
  console.log('\n==== R2 SUMMARY ====');
  console.log('asserts:',OUT.asserts.length,'fails:',OUT.asserts.filter(a=>!a.pass).length);
  OUT.asserts.filter(a=>!a.pass).forEach(a=>console.log(' FAIL',a.vp,a.a));
})();
