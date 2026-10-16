// 768 WhatsApp row on 627 with mid-viewport click (the pattern that works)
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:768,height:1024}});
  const p=await c.newPage(); p.setDefaultTimeout(25000);
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
  const seen=[]; c.on('page', np=>seen.push(np.url()));
  await p.goto('http://localhost:9108/#/product/627',{waitUntil:'load',timeout:60000}).catch(()=>{});
  await lib.waitText(p,'Fixture WhatsApp Contact Phone Listing',25000).catch(()=>{}); await p.waitForTimeout(1500);
  for(let s=0;s<12;s++){
    const pos=await p.evaluate(()=>{let best=null;
      document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
        if(!(e.textContent||'').startsWith('WhatsApp seller')) return;
        const r=e.getBoundingClientRect(); best={y:r.y,cx:r.x+r.width/2,cy:r.y+r.height/2,vis:r.bottom>0&&r.top<innerHeight};});
      return best;});
    if(pos&&pos.vis){ 
      console.log('row at y=',Math.round(pos.y));
      await p.mouse.click(Math.round(pos.cx),Math.round(pos.cy)); break; }
    await p.mouse.move(380,400); await p.mouse.wheel(0,300); await p.waitForTimeout(350);
  }
  for(let i=0;i<20;i++){ await p.waitForTimeout(300); if(seen.length) break; }
  console.log('768 627 wa popups=',JSON.stringify(seen));
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
