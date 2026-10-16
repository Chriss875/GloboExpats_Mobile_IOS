// anon (no login): WA row tap at 375x667 vs 768x1024
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  for(const vp of [{name:'375',w:375,h:667},{name:'768',w:768,h:1024}]){
    const b=await lib.newBrowser();
    const c=await b.newContext({viewport:{width:vp.w,height:vp.h}});
    const p=await c.newPage(); p.setDefaultTimeout(20000);
    const popups=[]; p.context().on('page', np=>popups.push(np.url()));
    await p.goto('http://localhost:9108/#/product/627',{waitUntil:'load',timeout:90000}).catch(()=>{});
    await lib.waitText(p,'Fixture WhatsApp Contact Phone Listing',25000); await p.waitForTimeout(2000);
    await p.mouse.move(vp.w/2,400); await p.mouse.wheel(0,600); await p.waitForTimeout(800);
    const hit=await p.evaluate(()=>{let best=null;
      document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
        const t=(e.textContent||'').trim(); if(!t.startsWith('WhatsApp seller')) return;
        const r=e.getBoundingClientRect(); if(r.bottom<0||r.top>innerHeight) return;
        best={cx:r.x+r.width/2,cy:r.y+r.height/2};}); return best;});
    console.log(vp.name,'anon tap',JSON.stringify(hit));
    if(hit){ await p.mouse.click(Math.round(hit.cx),Math.round(hit.cy)); }
    for(let i=1;i<=5;i++){ await p.waitForTimeout(1000); if(popups.length) break; }
    console.log(vp.name,'anon popups=',JSON.stringify(popups));
    await b.close();
  }
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
