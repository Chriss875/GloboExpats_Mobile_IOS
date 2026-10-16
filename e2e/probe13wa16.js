// 768x1024, login, WA row: click then screenshot burst to catch transient SnackBar
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:768,height:1024}});
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
  await p.goto('http://localhost:9108/#/product/627',{waitUntil:'load',timeout:60000}).catch(()=>{});
  await lib.waitText(p,'Fixture WhatsApp Contact Phone Listing',25000); await p.waitForTimeout(1500);
  await p.mouse.move(380,500); await p.mouse.wheel(0,600); await p.waitForTimeout(800);
  const hit=await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const t=(e.textContent||'').trim(); if(!t.startsWith('WhatsApp seller')) return;
      const r=e.getBoundingClientRect(); if(r.bottom<0||r.top>innerHeight) return;
      best={cx:r.x+r.width/2,cy:r.y+r.height/2};}); return best;});
  console.log('tap',JSON.stringify(hit));
  if(hit){ await p.mouse.click(Math.round(hit.cx),Math.round(hit.cy)); }
  // rapid screenshots to catch a snackbar (4s window)
  for(let i=1;i<=8;i++){ 
    await p.screenshot({path:`/tmp/wa768_${i}.png`}).catch(()=>{});
    await p.waitForTimeout(500);
  }
  console.log('burst done');
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
