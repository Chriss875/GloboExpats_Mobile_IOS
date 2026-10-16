// au048_skeptic_r15e.js — AU-048 SKEPTIC v2: >=6 attack classes vs the r15e PASS.
// Fixes vs the first attempt (its A7/A9 BROKEN rows were harness artifacts):
//  * typed terms via triple-click select-all (50-backspace clear leaves '116574' tail
//    on this build, so exact-term matching never matched and trackSearch "didn't fire");
//  * live ground truth from the sandbox (the stale /tmp map said cc(0)=125; a second
//    widget-0 fixture with cc=220 exists now).
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9131';
const TOKEN = 'AU048R71787692116574';
const OUT = { attacks: [] };
function log(...a){ console.log('[sk2]',...a); }
function rec(id,name,broken,detail){ OUT.attacks.push({id,name,broken:!!broken,detail});
  log(broken?'BROKEN':'held  ',id,name,JSON.stringify(detail).slice(0,220)); }
async function dump(p){ return p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')); }
async function pickSort(p,label){
  await p.locator('flt-semantics[role="button"]',{hasText:'Sort'}).first().click({force:true}).catch(()=>{});
  await p.waitForTimeout(800);
  const cands=await p.evaluate((lbl)=>{
    const out=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim(); if(!t.includes(lbl))return;
      let child=false; e.querySelectorAll('flt-semantics').forEach(c=>{if((c.textContent||'').includes(lbl))child=true;});
      if(child)return;
      const r=e.getBoundingClientRect();
      if(r.width<8||r.height<8||r.bottom<0||r.top>innerHeight)return;
      out.push({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});
    });
    return out.slice(0,3);
  },label);
  for(const c of cands){ await p.mouse.click(c.x,Math.min(c.y,650)); break; }
  await p.waitForTimeout(1800);
}
async function validatedOrder(p,gt){
  const rows=await p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      const m=t.match(/Probe Widget (\d+)/); if(!m)return;
      const pm=t.match(/TSh ([\d,]+)/); if(!pm)return;
      let child=false;
      e.querySelectorAll('flt-semantics').forEach(c=>{if((c.textContent||'').includes('Probe Widget')&&/TSh /.test(c.textContent||''))child=true;});
      if(child)return;
      out.push({w:Number(m[1]),price:Number(pm[1].replace(/,/g,'')),top:e.getBoundingClientRect().top});
    });
    return out;
  });
  rows.sort((a,b)=>a.top-b.top);
  const seen=new Set(); const out=[];
  for(const r of rows){
    if(seen.has(r.w))continue; seen.add(r.w);
    if(gt.price[r.w]!==undefined && Math.abs(gt.price[r.w]-r.price)>1) continue; // phantom node
    out.push(r.w);
  }
  return out;
}
function mono(a,d){ if(a.length<5)return false;
  for(let i=1;i<a.length;i++){const x=a[i-1],y=a[i]; if(d>0?y<x:y>x)return false;} return true; }

(async()=>{
  // LIVE ground truth
  const r0=await fetch(`${L.API}/api/v1/displayItem/filter`,
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({searchTerm:TOKEN,page:0,size:31})});
  const j0=await r0.json();
  const gt={price:{},cc:{},rating:{}};
  for(const c of j0.content){
    const m=c.productName.match(/Probe Widget (\d+)/); if(!m)continue;
    const w=Number(m[1]);
    if(gt.cc[w]===undefined || c.clickCount>gt.cc[w]){
      gt.price[w]=c.productAskingPrice; gt.cc[w]=c.clickCount??0; gt.rating[w]=c.averageRating??0;
    }
  }
  rec('A0','live-groundtruth-shape',{broken:false},{rows:j0.content.length,widgets:Object.keys(gt.price).length});

  // A1 freshness forgery
  {
    const h=await fetch(`${APP}/main.dart.js`,{method:'HEAD'});
    const lm=h.headers.get('last-modified');
    const body=await(await fetch(`${APP}/main.dart.js`)).text();
    const markers=body.includes('trackSearch')&&body.includes('Highest Rating')&&body.includes('Trending');
    rec('A1','freshness-forgery-mtime+content',!(lm==='Wed, 26 Aug 2026 08:15:26 GMT'&&markers),{lm,markers});
  }
  // A2 seed drift / fixture tamper since verify run
  {
    const total=(await(await fetch(`${L.API}/api/v1/displayItem/filter`,
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({searchTerm:TOKEN,page:0,size:1})})).json()).totalElements;
    rec('A2','seed-drift-total-no-longer-31',total!==31,{totalElements:total});
  }
  // A3 sort is fake (server order already sorted -> client sort unproven)
  {
    const b=await L.newBrowser();
    const ctx=await b.newContext({viewport:{width:375,height:667}});
    const p=await ctx.newPage();
    const calls=[];
    p.on('request',r=>{ if(/displayItem\/filter/.test(r.url())){
      let body={};try{body=JSON.parse(r.postData()||'{}');}catch(e){}
      calls.push(body.searchTerm!==undefined?{term:body.searchTerm,size:body.size,ts:!!body.trackSearch}:null); }});
    await p.goto(`${APP}/#/,`,{waitUntil:'load',timeout:90000}).catch(()=>{});
    await p.goto(`${APP}/#/search?q=${encodeURIComponent(TOKEN)}`,{waitUntil:'load',timeout:90000}).catch(()=>{});
    await p.waitForTimeout(12000);
    const base=await validatedOrder(p,gt);
    const basePrices=base.map(w=>gt.price[w]);
    rec('A3','baseline-already-price-sorted(client-sort-unproven)',mono(basePrices,1),
      {first6:basePrices.slice(0,6)});
    // A4 menu options missing
    await p.locator('flt-semantics[role="button"]',{hasText:'Sort'}).first().click({force:true}).catch(()=>{});
    await p.waitForTimeout(800);
    const mt=await dump(p);
    const missing=['Relevance','Price: Low to High','Price: High to Low','Newest','Highest Rating','Trending']
      .filter(o=>!mt.includes(o));
    rec('A4','sort-menu-options-missing',missing.length>0,{missing});
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);

    // A5 price-asc not truly sorted after pick
    await pickSort(p,'Price: Low to High');
    const asc=await validatedOrder(p,gt);
    rec('A5','price-asc-not-truly-sorted-after-pick',!mono(asc.map(w=>gt.price[w]),1),
      {n:asc.length,first6:asc.slice(0,6).map(w=>gt.price[w])});

    // A6 trending not cc-desc
    await pickSort(p,'Trending');
    const tw=await validatedOrder(p,gt);
    const tcc=tw.map(w=>gt.cc[w]);
    rec('A6','trending-not-clickcount-desc-or-wrong-top',!(tw[0]===9&&mono(tcc,-1)),
      {top5:tw.slice(0,5).map(w=>`${w}(cc${gt.cc[w]})`),monotonic:mono(tcc,-1)});

    // A7 trackSearch not fired exactly once for a CLEAN zero term
    const ZERO='zzsk'+Math.floor(Math.random()*1e6);
    const inp=p.locator('input[type="text"]').first();
    await inp.waitFor({state:'attached',timeout:15000}).catch(()=>{});
    await inp.click({force:true}).catch(()=>{}); await page_wait(p,300);
    await p.mouse.click(187,32,{clickCount:3}).catch(()=>{});
    await page_wait(p,250);
    await p.keyboard.type(ZERO,{delay:9}); await p.keyboard.press('Enter');
    const fv=await p.evaluate(()=>document.querySelector('input[type="text"]')?.value);
    await page_wait(p,7000);
    const T=await dump(p);
    const zeroCalls=calls.filter(c=>c&&c.term===ZERO);
    rec('A7','tracksearch-not-exactly-once-for-clean-zero-term',
      !(zeroCalls.filter(c=>c.ts).length===1&&T.includes('No results found.')),
      {typedField:fv,calls:zeroCalls,emptyState:T.includes('No results found.')});

    // A8 request-board suggestion absent
    rec('A8','request-board-suggestion-absent-in-dom',!T.includes('Request Board'),
      {domHasRequestBoard:T.includes('Request Board'),couldnFind:T.includes("We couldn't find")});

    // A9 deep-link restore lie
    await p.evaluate(t=>{window.location.hash='/search?q='+encodeURIComponent(t);},TOKEN);
    await page_wait(p,5000);
    const fv2=await p.evaluate(()=>document.querySelector('input[type="text"]')?.value);
    rec('A9','deep-link-q-not-restored-in-field',fv2!==TOKEN,{fieldValue:fv2});

    // A10 images failing
    const imgs={};
    p.on('response',r=>{const u=r.url();if(/\/uploads\/[^?#]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u))imgs[u]=r.status();});
    await p.evaluate(t=>{window.location.hash='/search?q='+encodeURIComponent(t);},TOKEN);
    await page_wait(p,8000);
    const bad=Object.entries(imgs).filter(([,s])=>s>=400);
    rec('A10','fixture-image-request-fails',bad.length>0||Object.keys(imgs).length===0,
      {tracked:Object.keys(imgs).length,failing:bad});

    await b.close();
  }
  OUT.attacks_broken=OUT.attacks.filter(a=>a.broken).length;
  OUT.verdict=OUT.attacks_broken===0?'HELD':'BROKEN';
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/raw-AU-048-skeptic-r15e.json',
    JSON.stringify(OUT,null,1));
  log(`DONE attacks=${OUT.attacks.length} broken=${OUT.attacks_broken} verdict=${OUT.verdict}`);
})().catch(e=>{console.error('SKEPTIC FAILED',e);process.exit(1);});
async function page_wait(p,ms){await p.waitForTimeout(ms);}
