// au047_verify_r3.js — AU-047 round 3: close the two open measurement gaps.
// G1: neighbourhood param reaching the WIRE through the real UI (dropdown pick).
// G2: web-parity judge on :3000 (proxy filters correctly) vs Flutter (query-only, dead).
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9112';
const REF = 'http://localhost:3000';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-047';
const SHOT = `${ROOT}/e2e/shots/${UNIT}`;
const OUT = { asserts: [], reqs: [], resps: [], clicks: [] };
function log(...a){ console.log('[au047r3]', ...a); }
function assert(vp,a,pass,value){ OUT.asserts.push({vp,a,pass,value}); log(pass?'PASS':'FAIL',vp,a,value!==undefined?JSON.stringify(value).slice(0,240):''); }
async function dumpText(p){ return p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'')).join('\n')); }
async function shot(p,vp,state){ const f=`${SHOT}/${UNIT}-${vp}-${state}.png`; await L.screenshot(p,f); return f; }
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
async function bodyFilter(body){
  const r=await fetch(`${L.API}/api/v1/displayItem/filter`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page:0,size:200,...body})});
  return r.json();
}

(async()=>{
  // ---- G2: reference judge on :3000 proxy (body transport works there) ----
  async function viaProxy(body){ const r=await fetch(`${REF}/api/v1/displayItem/filter`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); return r.json(); }
  const wAll=await viaProxy({page:0,size:24});
  const wCond=await viaProxy({conditionFilter:'LIKE_NEW',page:0,size:24});
  assert('ref','G2a-web-proxy-filters-LIKE_NEW',wCond.totalElements<wAll.totalElements,
    {refFiltered:wCond.totalElements,refUnfiltered:wAll.totalElements});

  // sandbox truth for Oyster Bay
  const T_nb=await bodyFilter({neighbourhood:'Oyster Bay'});
  log('truth Oyster Bay total',T_nb.totalElements);

  const browser=await L.newBrowser();
  for(const [vpName,vp] of [['375',{width:375,height:667}],['768',{width:768,height:1024}]]){
    const ctx=await L.newCtx(browser,{viewport:vp,videoPath:`${ROOT}/e2e/videos/${UNIT}-verify-r3-${vpName}.webm`});
    const page=await ctx.newPage();
    page.on('request',r=>{
      if(r.url().includes('/displayItem/filter')){
        const u=new URL(r.url());
        OUT.reqs.push({vp:vpName,url:r.url().replace(L.API,''),
          q:{nb:u.searchParams.get('neighbourhood'),cond:u.searchParams.get('conditionFilter'),src:u.searchParams.get('productSource'),term:u.searchParams.get('searchTerm')},
          postData:r.postData()});
      }
    });
    let respNb=null;
    page.on('response',async r=>{ if(r.url().includes('neighbourhood=')&&r.url().includes('/displayItem/filter')){
      try{ const j=await r.json(); respNb={total:j.totalElements,n:(j.content||[]).length,status:r.status()}; OUT.resps.push(respNb);}catch(e){} } });

    await page.goto(APP+'/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
    await L.waitText(page,'Marketplace',30000).catch(()=>{});
    await page.waitForTimeout(3500);

    await L.clickBtn(page,'Filters'); await page.waitForTimeout(1100);
    // wait for neighbourhood options to load
    let nbVisible=false;
    for(let i=0;i<10;i++){ nbVisible=(await dumpText(page)).includes('Oyster Bay'); if(nbVisible)break; await page.waitForTimeout(700); }
    assert(vpName,'G1a-dropdown-lists-Oyster-Bay',nbVisible);
    await shot(page,vpName,'90-sheet-nb-options');

    // open dropdown
    const opened=await tapAnyNode(page,'Neighbourhood',40,26);
    OUT.clicks.push({vp:vpName,c:'open-dropdown',hit:opened});
    await page.waitForTimeout(1100);
    // menu items render as flat list; click the Oyster Bay entry
    let picked=await tapAnyNode(page,'Oyster Bay',20,12);
    OUT.clicks.push({vp:vpName,c:'pick-oysterbay',hit:picked});
    if(!picked){ // scroll sheet down a bit and retry
      await page.mouse.wheel(0,160); await page.waitForTimeout(500);
      picked=await tapAnyNode(page,'Oyster Bay',20,12);
      OUT.clicks.push({vp:vpName,c:'pick-oysterbay-retry',hit:picked});
    }
    await shot(page,vpName,'91-sheet-nb-picked');
    await tapAnyNode(page,'Apply filters');
    await page.waitForTimeout(2600);

    const nbReq=OUT.reqs.filter(r=>r.vp===vpName&&r.q.nb==='Oyster%20Bay'||(OUT.reqs.find(x=>x.vp===vpName&&decodeURIComponent(x.q.nb||'')==='Oyster Bay'))&&false).pop();
    const wireNb=OUT.reqs.filter(r=>r.vp===vpName).map(r=>r.q.nb).filter(Boolean);
    assert(vpName,'G1b-neighbourhood-reaches-wire-as-query-param',wireNb.includes('Oyster Bay'),{wireNb,body:OUT.reqs.filter(r=>r.vp===vpName).map(r=>r.postData).pop()});
    assert(vpName,'G1c-response-still-unfiltered-DEFECT',
      !!respNb && respNb.total>T_nb.totalElements*5,
      {wireTotal:respNb&&respNb.total,sandboxTruth:T_nb.totalElements});
    txt=await dumpText(page);
    assert(vpName,'G1d-rendered-list-not-narrowed-to-neighbourhood',
      txt.includes('AU047 Plain Mug')||txt.length>5000,
      {mugVisible:txt.includes('AU047 Plain Mug')});
    await shot(page,vpName,'92-nb-result');
    await L.closeVideo(ctx,`${ROOT}/e2e/videos/${UNIT}-verify-r3-${vpName}.webm`);
  }
  await browser.close();
  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-047-r3.json`,JSON.stringify(OUT,null,1));
  console.log('\n==== R3 SUMMARY ====');
  console.log('asserts:',OUT.asserts.length,'fails:',OUT.asserts.filter(a=>!a.pass).length);
  OUT.asserts.filter(a=>!a.pass).forEach(a=>console.log(' FAIL',a.vp,a.a));
})();
