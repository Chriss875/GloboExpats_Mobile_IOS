// 375x667 with LOGIN (the exact config that produced a popup in au013_r2b.js run at 05:05)
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(20000);
  await p.goto('http://localhost:9108/#/login',{waitUntil:'load',timeout:90000}).catch(()=>{});
  if(!await lib.isLoggedIn(p)){
    await lib.waitText(p,'Welcome back',25000);
    const ei=p.locator('input[type="text"]').first(), pi=p.locator('input[type="password"]').first();
    await ei.click({force:true}); await p.waitForTimeout(300); await p.keyboard.type(lib.BUYER.email);
    await pi.click({force:true}); await p.waitForTimeout(300); await p.keyboard.type(lib.BUYER.pw);
    const btn=await p.evaluate(()=>{let best=null;document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{if((e.textContent||'').trim()!=='Log in')return;const r=e.getBoundingClientRect();if(!best||r.width*r.height<best.w*best.h)best={cx:r.x+r.width/2,cy:r.y+r.height/2};});return best;});
    await p.mouse.click(Math.round(btn.cx),Math.round(btn.cy));
    let ok=false; for(let i=0;i<30&&!ok;i++){ok=await lib.isLoggedIn(p); if(!ok)await p.waitForTimeout(1000);} 
  }
  const popups=[]; p.context().on('page', np=>popups.push(np.url()));
  await p.goto('http://localhost:9108/#/product/627',{waitUntil:'load',timeout:60000}).catch(()=>{});
  await lib.waitText(p,'Fixture WhatsApp Contact Phone Listing',25000); await p.waitForTimeout(1500);
  await p.mouse.move(187,300); await p.mouse.wheel(0,600); await p.waitForTimeout(800);
  const hit=await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const t=(e.textContent||'').trim(); if(!t.startsWith('WhatsApp seller')) return;
      const r=e.getBoundingClientRect(); if(r.bottom<0||r.top>innerHeight) return;
      best={cx:r.x+r.width/2,cy:r.y+r.height/2};}); return best;});
  console.log('tap',JSON.stringify(hit));
  if(hit){ await p.mouse.click(Math.round(hit.cx),Math.round(hit.cy)); }
  for(let i=1;i<=5;i++){ await p.waitForTimeout(1000); if(popups.length) break; }
  console.log('popups=',JSON.stringify(popups));
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
