// Click-counter increment: read total before, open 623 in-app (logged in), read after.
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const before=await (await fetch(`${lib.API}/api/v1/products/623/clicks/total`)).json();
  console.log('before:',JSON.stringify(before));
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
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
    console.log('login',ok);
  }
  await p.goto('http://localhost:9108/#/product/623',{waitUntil:'load',timeout:60000}).catch(()=>{});
  await lib.waitText(p,'apartment',25000).catch(()=>{});
  // wait for the POST clicks to fire
  let sawPost=false;
  const done=new Promise(r=>{ p.on('request',rq=>{ if(rq.method()==='POST'&&/\/products\/623\/clicks(\?|$)/.test(rq.url())) { sawPost=true; r(null); } }); });
  await Promise.race([done, new Promise(r=>setTimeout(r,15000))]);
  console.log('saw POST clicks in browser:',sawPost);
  await p.waitForTimeout(1500);
  const after=await (await fetch(`${lib.API}/api/v1/products/623/clicks/total`)).json();
  console.log('after :',JSON.stringify(after));
  console.log('DELTA total =',after.totalClickCount-before.totalClickCount);
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
