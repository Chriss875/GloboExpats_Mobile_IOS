// Who-viewed panel: dump the panel text to enumerate actual viewers rendered.
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
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
  }
  const analyticsResp=[];
  p.on('response', async r=>{ if(/clicks\/analytics/.test(r.url())){ let b=''; try{b=(await r.text()).slice(0,200);}catch(e){} analyticsResp.push(r.status()+' '+b); }});
  await p.goto('http://localhost:9108/#/product/623',{waitUntil:'load',timeout:60000}).catch(()=>{});
  await lib.waitText(p,'apartment',25000).catch(()=>{}); await p.waitForTimeout(3500);
  const t=await lib.allText(p);
  const i=t.indexOf('Who viewed this listing');
  console.log('panel text:', JSON.stringify(t.slice(i,i+260)));
  console.log('analytics:',JSON.stringify(analyticsResp).slice(0,400));
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
