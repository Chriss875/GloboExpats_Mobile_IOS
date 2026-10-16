// r15e — FINAL AU-048 verdict run on FROZEN :9131. RO lane.
// Fixes vs r15b (probe-only):
//  * ground truth read LIVE from the sandbox at run start (the /tmp fixture map was
//    stale: a duplicate 'Probe Widget 0' fixture with cc=220 exists now, which made
//    the trending check falsely fail);
//  * CRIT2 trending/rating judged against LIVE server clickCounts/ratings;
//  * typed zero-term via triple-click select-all (50-backspace clear leaves a
//    '116574' tail on this build -> term never matched exactly);
//  * CRIT3 timing measured from empty-state detection;
//  * parity vs :3000 uses a term present in BOTH backends ('Lamp').
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9131';
const REF = 'http://localhost:3000';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-048', STAGE = 'r15e';
const TOKEN = 'AU048R71787692116574';

const OUT = { freshness:{}, api:{}, asserts:[], reqs:[], resps:[], images:{}, orders:{},
  clicks:[], trackSearchCalls:[], timings:[], videos:[], shots:[], refShots:[], refText:{},
  buttonsTotal:0, buttonsOk:0 };
function log(...a){ console.log('[r15e]', ...a); }
function assert(vp,name,pass,value){
  OUT.asserts.push({vp,name,pass:!!pass,value:value===undefined?null:value});
  log(pass?'PASS ':'FAIL ', vp, name, JSON.stringify(value??'').slice(0,240));
}
async function dumpText(p){ return p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')); }
async function shot(p,vp,state){ const f=`${ROOT}/e2e/shots/${UNIT}/${UNIT}-${vp}-${STAGE}-${state}.png`; await L.screenshot(p,f); OUT.shots.push(f); return f; }
async function g(body){
  const r = await fetch(`${L.API}/api/v1/displayItem/filter`,
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {status:r.status, j:await r.json().catch(()=>null)};
}
async function tapText(p,lbl,requireTappable=false){
  const cands = await p.evaluate(({lbl,requireTappable})=>{
    const out=[]; const vh=innerHeight;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim(); if(!t.includes(lbl))return;
      if(requireTappable && e.getAttribute('flt-tappable')===null)return;
      let child=false; e.querySelectorAll('flt-semantics').forEach(c=>{if((c.textContent||'').includes(lbl))child=true;});
      if(child)return;
      const r=e.getBoundingClientRect();
      if(r.width<8||r.height<8||r.bottom<0||r.top>vh)return;
      out.push({cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2),area:r.width*r.height});
    });
    out.sort((a,b)=>a.area-b.area); return out.slice(0,4);
  },{lbl,requireTappable});
  const vh=await p.evaluate(()=>innerHeight);
  for(const c of cands){ await p.mouse.click(c.cx,Math.max(12,Math.min(c.cy,vh-16))); await p.waitForTimeout(500); return true; }
  return false;
}
async function scrollToTop(p){
  await p.mouse.move(180,380);
  for(let i=0;i<16;i++){ await p.mouse.wheel(0,-3000); await p.waitForTimeout(100); }
  await p.waitForTimeout(500);
}
// card nodes carrying BOTH name and price, innermost, deduped by widget (max cc kept)
async function cardsValidated(p, gt){
  const rows = await p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      const m=t.match(/Probe Widget (\d+)/); if(!m) return;
      const pm=t.match(/TSh ([\d,]+)/); if(!pm) return;
      let child=false;
      e.querySelectorAll('flt-semantics').forEach(c=>{ if((c.textContent||'').includes('Probe Widget') && /TSh /.test(c.textContent||'')) child=true; });
      if(child) return;
      out.push({ w:Number(m[1]), price:Number(pm[1].replace(/,/g,'')), top:e.getBoundingClientRect().top });
    });
    return out;
  });
  // dedupe by widget keeping the first occurrence in top-order; validate price against LIVE gt
  rows.sort((a,b)=>a.top-b.top);
  const seen=new Set(); const bad=[];
  const out=[];
  for(const r of rows){
    if(seen.has(r.w)) continue;
    seen.add(r.w);
    const expect=gt.priceByWidget[r.w];
    if(expect!==undefined && Math.abs(expect-r.price)>1) { bad.push(r); continue; }
    out.push(r);
  }
  return { cards:out.map(r=>({widget:r.w, price:r.price})), dropped:bad };
}
function mono(a,d){ if(a.length<5) return false;
  for(let i=1;i<a.length;i++){ const x=a[i-1],y=a[i]; if(x==null||y==null)continue; if(d>0?y<x:y>x) return false; } return true; }

(async()=>{
  fs.mkdirSync(`${ROOT}/e2e/shots/${UNIT}`,{recursive:true});

  // ---------- C1 freshness ----------
  const head = await fetch(`${APP}/main.dart.js`,{method:'HEAD'});
  OUT.freshness.lastModified = head.headers.get('last-modified');
  assert('meta','C1-freshness-sha-e694463+mtime-081526GMT',
    OUT.freshness.lastModified==='Wed, 26 Aug 2026 08:15:26 GMT', OUT.freshness);

  // ---------- C2 LIVE ground truth ----------
  const gAll=[];
  for(let pg=0;pg<5;pg++){
    const r=await g({searchTerm:TOKEN,page:pg,size:24});
    if(!r.j||!r.j.content||!r.j.content.length) break;
    gAll.push(...r.j.content);
    if(r.j.last) break;
  }
  const priceByWidget={}; const ccByWidget={}; const ratingByWidget={};
  for(const c of gAll){
    const m=c.productName.match(/Probe Widget (\d+)/); if(!m) continue;
    const w=Number(m[1]);
    if(priceByWidget[w]===undefined || c.clickCount>(ccByWidget[w]??-1)){
      priceByWidget[w]=c.productAskingPrice; ccByWidget[w]=c.clickCount??0; ratingByWidget[w]=c.averageRating??0;
    }
  }
  const gt={ total:gAll.length, unique:new Set(gAll.map(c=>c.productId)).size,
    widgets:Object.keys(priceByWidget).length, priceByWidget, ccByWidget, ratingByWidget,
    sampleName:gAll[0]&&gAll[0].productName };
  OUT.api.gt=gt;
  const ZERO_TERM='qqzzxx99r15e'+Math.floor(Math.random()*1e6);
  const gtZero=(await g({searchTerm:ZERO_TERM,page:0,size:24})).j.totalElements;
  const qsOnly=await(await fetch(`${L.API}/api/v1/displayItem/filter?searchTerm=${encodeURIComponent(ZERO_TERM)}&page=0&size=24`,
    {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
  const imgResp=await fetch(`${L.API}/uploads/a83ca936-5de6-499a-a6c1-47f71b64b3d5_au048.webp`);
  const imgBytes=(await imgResp.arrayBuffer()).byteLength;
  assert('api','C2-groundtruth-live-31-products-30-widgets',
    gt.total===31&&gt.unique===31&&gt.widgets===30, {total:gt.total,uniq:gt.unique,widgets:gt.widgets});
  assert('api','C2-groundtruth-zero-term-0', gtZero===0, gtZero);
  assert('api','C2-wire-body-bound-not-qs-only', qsOnly.totalElements>=500,{qsOnlyTotal:qsOnly.totalElements});
  assert('api','C2-fixture-image-http200-nonempty', imgResp.status===200&&imgBytes>1000,{status:imgResp.status,bytes:imgBytes});

  // ---------- reference parity (shared term Lamp + zero state) ----------
  {
    const rb=await L.newBrowser();
    try{
      const rc=await rb.newContext({viewport:{width:375,height:667}});
      const rp=await rc.newPage();
      await rp.goto(`${REF}/browse?q=Lamp`,{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
      await rp.waitForTimeout(8000);
      const lampTxt=await rp.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,1500));
      OUT.refText.lamp=lampTxt;
      const f1=`${ROOT}/e2e/shots/${UNIT}/AU-048-ref-${STAGE}-lamp.png`;
      await L.screenshot(rp,f1); OUT.refShots.push(f1);
      await rp.goto(`${REF}/browse?q=${encodeURIComponent(ZERO_TERM)}`,{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
      await rp.waitForTimeout(7000);
      const ztxt=await rp.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,1500));
      OUT.refText.zero=ztxt;
      const f2=`${ROOT}/e2e/shots/${UNIT}/AU-048-ref-${STAGE}-zero.png`;
      await L.screenshot(rp,f2); OUT.refShots.push(f2);
      await rc.close();
    } finally { await rb.close(); }
    const refLampShowsProducts = !OUT.refText.lamp.includes('No products found') && /TSh [\d,]+/.test(OUT.refText.lamp);
    assert('ref','PARITY-ref-lamp-renders-real-products', refLampShowsProducts,
      { prices:(OUT.refText.lamp.match(/TSh [\d,]+/g)||[]).slice(0,4) });
  }

  // ---------- browser both viewports ----------
  const browser=await L.newBrowser();
  for(const [vpName,vp] of [['375',{width:375,height:667}],['768',{width:768,height:1024}]]){
    const videoPath=`${ROOT}/e2e/videos/AU-048-${STAGE}-${vpName}.webm`;
    OUT.videos.push(videoPath);
    const vctx=await browser.newContext({viewport:vp,recordVideo:{dir:require('path').dirname(videoPath),size:vp}});
    const page=await vctx.newPage();
    page.on('response',r=>{const u=r.url();
      if(/\/uploads\/[^?#]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)||/\/assets\/[^?#]*\.(png|webp|jpg|svg)(\?|#|$)/i.test(u)) OUT.images[u]=r.status();});
    page.on('request',r=>{
      if(/displayItem\/filter/.test(r.url())){
        let body={};try{body=JSON.parse(r.postData()||'{}');}catch(e){}
        const u=new URL(r.url());
        const e={vp:vpName,qsTerm:u.searchParams.get('searchTerm'),bodyTerm:body.searchTerm??null,
          bodyPage:body.page??null,bodySize:body.size??null,trackSearchQS:u.searchParams.get('trackSearch'),
          trackSearchBody:!!body.trackSearch,ts:Date.now()};
        OUT.reqs.push(e);
        if(e.trackSearchBody||e.trackSearchQS==='true') OUT.trackSearchCalls.push(e);
      }});
    page.on('response',r=>{ if(/displayItem\/filter/.test(r.url()))
      r.json().then(j=>{if(j&&typeof j.totalElements==='number')
        OUT.resps.push({vp:vpName,status:r.status(),total:j.totalElements,returned:(j.content||[]).length});}).catch(()=>{}); });

    // login
    await page.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
    await L.waitText(page,'Buy now',60000).catch(()=>{});
    let logged=await L.isLoggedIn(page);
    if(!logged){
      await L.clickBtn(page,'Login'); await L.waitText(page,'Welcome back',25000).catch(()=>{});
      const ei=page.locator('input[type="text"]').first(); await ei.click({force:true}).catch(()=>{}); await page.waitForTimeout(350);
      await page.keyboard.type(L.BUYER.email,{delay:7});
      const pi=page.locator('input[type="password"]').first(); await pi.click({force:true}).catch(()=>{}); await page.waitForTimeout(350);
      await page.keyboard.type(L.BUYER.pw,{delay:7});
      await L.clickBtn(page,'Log in');
      for(let i=0;i<30&&!logged;i++){ await page.waitForTimeout(1000); logged=await L.isLoggedIn(page); }
    }
    assert(vpName,'C-login-shared-sandbox-account',logged,'');

    // deep link
    await page.evaluate(t=>{window.location.hash='/search?q='+encodeURIComponent(t);},TOKEN);
    await L.waitText(page,'Probe Widget',30000).catch(()=>{});
    await page.waitForTimeout(3500);
    let T=await dumpText(page);
    assert(vpName,'C3-deeplink-renders-fixture-cards',T.includes('Probe Widget'),(T.match(/Probe Widget/g)||[]).length);
    assert(vpName,'C2-real-data-fixture-prices-in-dom',T.includes('TSh 62,000')&&T.includes('TSh 2,000'),
      ['TSh 62,000','TSh 2,000'].filter(x=>T.includes(x)));
    const fv=await page.evaluate(()=>{const i=document.querySelector('input[type="text"]');return i?i.value:null;});
    assert(vpName,'C4-deep-link-restores-query-in-field',fv===TOKEN,fv);
    await shot(page,vpName,'05-canary-results');

    // CRIT1 paging
    const seen=new Set(); let rounds=0;
    while(rounds<14){
      const {cards}=await cardsValidated(page,gt);
      cards.forEach(c=>seen.add(c.widget));
      if(seen.size>=30) break;
      await page.mouse.move(180,vp.height*0.6);
      await page.mouse.wheel(0,2400); await page.waitForTimeout(1300);
      rounds++;
    }
    assert(vpName,'CRIT1-paging-unique-30-of-30',seen.size>=30,`${seen.size}/30`);
    const pageReqs=OUT.reqs.filter(r=>r.vp===vpName&&String(r.bodyTerm)===TOKEN&&!r.trackSearchBody&&r.trackSearchQS!=='true');
    const pages=[...new Set(pageReqs.map(r=>Number(r.bodyPage)))].sort((a,b)=>a-b);
    assert(vpName,'CRIT1-distinct-pages-fetched',pages.length>=2&&pages[0]===0,{calls:pageReqs.length,pages});
    assert(vpName,'CRIT1-criteria-in-json-body-not-qs-only',
      pageReqs.every(r=>r.bodyTerm===TOKEN&&r.bodyPage!==null),
      pageReqs.slice(0,2).map(r=>({body:r.bodyTerm,page:r.bodyPage})));
    const totals=[...new Set(OUT.resps.filter(r=>r.vp===vpName).map(r=>r.total))];
    assert(vpName,'CRIT1-server-total-31-through-ui',totals.includes(31),totals);

    async function settled(label){
      await page.waitForTimeout(1100);
      const {cards}=await cardsValidated(page,gt);
      OUT.orders[vpName+'.'+label]=cards; return cards;
    }
    async function pick(opt){
      await scrollToTop(page);
      const o=await L.clickBtn(page,'Sort'); await page.waitForTimeout(650);
      const pk=await tapText(page,opt); await page.waitForTimeout(1600);
      return o&&pk;
    }

    // CRIT2 sort menu
    await scrollToTop(page);
    const so=await L.clickBtn(page,'Sort'); await page.waitForTimeout(700);
    T=await dumpText(page);
    const wantOpts=['Relevance','Price: Low to High','Price: High to Low','Newest','Highest Rating','Trending'];
    const optSeen={}; for(const o of wantOpts) optSeen[o]=T.includes(o);
    assert(vpName,'CRIT2-sort-menu-all-six-options',so&&Object.values(optSeen).every(Boolean),optSeen);
    await shot(page,vpName,'15-sort-menu-open');
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);

    const rel=(await settled('relevance')).map(c=>c.widget);
    assert(vpName,'CRIT2-baseline-relevance-newest-first-server-order',
      rel.length>=25&&rel[0]>=rel[rel.length-1],{first5:rel.slice(0,5),last3:rel.slice(-3)});

    await pick('Price: Low to High');
    const asc=await settled('asc');
    assert(vpName,'CRIT2-price-asc-monotonic',mono(asc.map(c=>c.price),1),
      asc.slice(0,8).map(c=>`${c.widget}:${c.price}`));

    await pick('Price: High to Low');
    const desc=await settled('desc');
    assert(vpName,'CRIT2-price-desc-monotonic-and-reversed',
      mono(desc.map(c=>c.price),-1)&&desc[0].price===asc[asc.length-1].price,
      {first:`${desc[0].widget}:${desc[0].price}`,ascLast:`${asc[asc.length-1].widget}:${asc[asc.length-1].price}`});
    await shot(page,vpName,'22-price-desc');

    await pick('Trending');
    const trend=await settled('trending');
    const tw=trend.map(c=>c.widget);
    const tcc=trend.filter(c=>ccByWidget[c.widget]!==undefined).map(c=>ccByWidget[c.widget]);
    assert(vpName,'CRIT2-trending-orders-live-clickcount-desc',
      tw[0]===9&&mono(tcc,-1),
      {first6:trend.slice(0,6).map(c=>`${c.widget}(cc${ccByWidget[c.widget]})`),monotonic:mono(tcc,-1)});
    await shot(page,vpName,'25-trending-order');

    await pick('Highest Rating');
    const rated=await settled('rating');
    const rw=rated.map(c=>c.widget);
    const minRatingFirstHalf=Math.min(...rated.slice(0,Math.ceil(rw.length/2)).map(c=>ratingByWidget[c.widget]??5));
    assert(vpName,'CRIT2-highest-rating-rated-first-widget0-last',
      rw.length>=25&&rw[rw.length-1]===0&&minRatingFirstHalf>0,
      {last3:rw.slice(-3),minRatingFirstHalf});
    await shot(page,vpName,'28-rating-order');

    await pick('Newest');
    const newest=await settled('newest');
    const nw=newest.map(c=>c.widget);
    assert(vpName,'CRIT2-newest-top-is-latest-fixtures',nw.slice(0,5).some(w=>w>=27),nw.slice(0,5));
    await shot(page,vpName,'30-newest-order');

    const sig=a=>a.slice(0,10).join(',');
    assert(vpName,'CRIT2-options-observably-reorder',
      new Set([sig(rel),sig(asc.map(c=>c.widget)),sig(desc.map(c=>c.widget)),sig(tw),sig(nw)]).size===5,
      {distinctSignatures:new Set([sig(rel),sig(asc.map(c=>c.widget)),sig(desc.map(c=>c.widget)),sig(tw),sig(nw)]).size});

    await pick('Relevance'); await page.waitForTimeout(800);

    // CRIT3 zero-result: select-all replace typing (clean term)
    const tsBefore=OUT.trackSearchCalls.filter(c=>c.vp===vpName).length;
    await scrollToTop(page);
    const inp=page.locator('input[type="text"]').first();
    await inp.waitFor({state:'attached',timeout:15000}).catch(()=>{});
    await inp.click({force:true}).catch(()=>{}); await page.waitForTimeout(350);
    await page.mouse.click(187,32,{clickCount:3}).catch(()=>{});   // select existing query text
    await page.waitForTimeout(250);
    await page.keyboard.type(ZERO_TERM,{delay:8});
    await page.keyboard.press('Enter');
    const fvNow=await page.evaluate(()=>document.querySelector('input[type="text"]')?.value);
    assert(vpName,'CRIT3-typed-term-exact-in-field',fvNow===ZERO_TERM,fvNow);
    let emptyAt=null;
    for(let i=0;i<48;i++){
      await page.waitForTimeout(250);
      if((await dumpText(page)).includes('No results found.')){emptyAt=Date.now();break;}
    }
    assert(vpName,'CRIT3-empty-state-shown',emptyAt!==null,emptyAt?'yes':'never');
    await page.waitForTimeout(3500);
    T=await dumpText(page);
    assert(vpName,'CRIT3-empty-state-persists-after-settle',T.includes('No results found.'),
      T.split('\n').filter(l=>/results/i.test(l)).slice(0,2));
    await shot(page,vpName,'35-zero-results');
    const tsAfter=OUT.trackSearchCalls.filter(c=>c.vp===vpName);
    const call=tsAfter[tsAfter.length-1];
    assert(vpName,'CRIT3-tracksearch-exactly-once-per-miss',tsAfter.length-tsBefore===1,
      tsAfter.slice(tsBefore).map(c=>({body:c.trackSearchBody,qs:c.trackSearchQS,size:c.bodySize,term:c.bodyTerm})));
    const lag=emptyAt&&call?call.ts-emptyAt:null;
    assert(vpName,'CRIT3-tracksearch-fires-about-2s-after-settle',
      lag!==null&&lag>=1200&&lag<=6000,{msAfterEmptyDetected:lag,size:call&&call.bodySize,term:call&&call.bodyTerm});
    OUT.timings.push({vp:vpName,emptyAt,callTs:call&&call.ts,lag});

    // CRIT4 request-board suggestion
    assert(vpName,'CRIT4-request-board-suggestion-rendered',
      T.includes("We couldn't find")&&T.includes('Request Board'),
      {couldnFind:T.includes("We couldn't find"),requestBoard:T.includes('Request Board'),
       domLines:T.split('\n').filter(l=>/couldn|request/i.test(l)).slice(0,3)});
    await shot(page,vpName,'37-zero-results-settled');

    // restore
    await inp.click({force:true}).catch(()=>{}); await page.waitForTimeout(300);
    await page.mouse.click(187,32,{clickCount:3}).catch(()=>{});
    await page.waitForTimeout(200);
    await page.keyboard.type(TOKEN,{delay:8}); await page.keyboard.press('Enter');
    await L.waitText(page,'Probe Widget',25000).catch(()=>{});
    await page.waitForTimeout(2200);
    await scrollToTop(page);

    // clicks
    const listButtons=p=>p.evaluate(()=>{
      const out=[];
      document.querySelectorAll('flt-semantics').forEach(e=>{
        const role=e.getAttribute('role');const t=(e.textContent||'').trim();if(!t)return;
        const r=e.getBoundingClientRect();
        const vis=r.width>4&&r.height>4&&r.bottom>0&&r.top<innerHeight;
        if(!vis)return;
        const dis=e.getAttribute('aria-disabled');
        if(role==='button')out.push({kind:'button',label:t.slice(0,40),disabled:dis==='true'});
        else if(e.getAttribute('flt-tappable')!==null)out.push({kind:'tappable',label:t.slice(0,34),disabled:dis==='true'});
      });
      document.querySelectorAll('input').forEach(i=>out.push({kind:'input',label:i.placeholder||i.type,disabled:i.disabled}));
      return out;});
    const ctrls=await listButtons(page);
    OUT.clicks.push({vp:vpName,controls:ctrls});
    const dead=ctrls.filter(c=>c.disabled);
    assert(vpName,'CLICK-no-disabled-controls-or-reasoned',dead.length===0,dead);
    const tapped=await tapText(page,'Probe Widget',true);
    await page.waitForTimeout(2600);
    const TD=await dumpText(page);
    const markers=['Description','Add to cart','Buy now'].filter(m=>TD.includes(m));
    assert(vpName,'CLICK-product-card-navigates-to-detail',tapped&&markers.length>0,{tapped,markers});
    await shot(page,vpName,'40-product-detail');
    await page.goBack(); await page.waitForTimeout(2000);
    const rb0=OUT.reqs.filter(r=>r.vp===vpName).length;
    await L.clickBtn(page,'Search'); await page.waitForTimeout(2800);
    const rb1=OUT.reqs.filter(r=>r.vp===vpName).length;
    assert(vpName,'CLICK-magnifier-refires-search',rb1>rb0,{before:rb0,after:rb1});
    const sok=await L.clickBtn(page,'Sort'); await page.waitForTimeout(600);
    const menuVisible=(await dumpText(page)).includes('Price: Low to High');
    assert(vpName,'CLICK-sort-button-opens-menu',sok&&menuVisible,'');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    const editable=await page.evaluate(()=>{const i=document.querySelector('input[type="text"]');return i?!i.disabled:false;});
    assert(vpName,'CLICK-search-field-editable',editable,'');
    OUT.buttonsTotal+=ctrls.length+4;
    OUT.buttonsOk+=ctrls.filter(c=>!c.disabled).length+4;
    await shot(page,vpName,'50-final-state');
    try{const v=await page.video();await vctx.close();if(v)await v.saveAs(videoPath).catch(()=>{});}
    catch(e){await vctx.close().catch(()=>{});}
  }

  // ---------- images ----------
  const vals=Object.values(OUT.images);
  OUT.imagesSummary={requested:vals.length,ok200:vals.filter(s=>s===200||s===304).length,
    brokenUrls:Object.keys(OUT.images).filter(u=>OUT.images[u]>=400)};
  assert('meta','C-images-all-200',OUT.imagesSummary.requested>0&&OUT.imagesSummary.ok200===OUT.imagesSummary.requested,OUT.imagesSummary);

  fs.mkdirSync(`${ROOT}/e2e/results/shards`,{recursive:true});
  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-048-${STAGE}.json`,JSON.stringify(OUT,null,1));
  log(`DONE pass=${OUT.asserts.filter(a=>a.pass).length} fail=${OUT.asserts.filter(a=>!a.pass).length}`);
  console.log(JSON.stringify(OUT.asserts.filter(a=>!a.pass),null,1));
})().catch(e=>{console.error('HARNESS FAILED',e);process.exit(1);});
