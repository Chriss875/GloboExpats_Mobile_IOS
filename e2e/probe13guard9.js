// OWNER fallback test: buyer(142) opens OWN hidden 631 (404 anon) — should recover
// via user-details products (owner fallback), rendering the listing.
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP='http://localhost:9108';
const SHOTS='/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-013';
async function loginPrecise(pg){
  await pg.goto(`${APP}/#/login`,{waitUntil:'load',timeout:90000}).catch(()=>{});
  if(await lib.isLoggedIn(pg)) return true;
  await lib.waitText(pg,'Welcome back',25000);
  const ei=pg.locator('input[type="text"]').first(), pi=pg.locator('input[type="password"]').first();
  await ei.click({force:true}); await pg.waitForTimeout(350); await pg.keyboard.type(lib.BUYER.email);
  await pi.click({force:true}); await pg.waitForTimeout(350); await pg.keyboard.type(lib.BUYER.pw);
  const b=await pg.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      if((e.textContent||'').trim()!=='Log in') return;
      const r=e.getBoundingClientRect();
      if(!best||r.width*r.height<best.w*best.h) best={cx:r.x+r.width/2,cy:r.y+r.height/2};
    }); return best;});
  if(!b) return false;
  await pg.mouse.click(Math.round(b.cx),Math.round(b.cy));
  let ok=false; for(let i=0;i<30&&!ok;i++){ ok=await lib.isLoggedIn(pg); if(!ok) await pg.waitForTimeout(1000);} 
  return ok;
}
(async()=>{
  for(const vp of [{name:'375',w:375,h:667},{name:'768',w:768,h:1024}]){
    const b=await lib.newBrowser();
    const c=await b.newContext({viewport:{width:vp.w,height:vp.h}});
    const p=await c.newPage(); p.setDefaultTimeout(25000);
    const li=await loginPrecise(p);
    const rec=[];
    p.on('response', async r=>{ if(/user-details/.test(r.url())) rec.push(r.status()+' user-details'); });
    await p.goto(`${APP}/#/product/631`,{waitUntil:'load',timeout:60000}).catch(()=>{});
    await p.waitForTimeout(5000);
    const t=await lib.allText(p);
    const recovered=t.includes('AU013 Hidden Fixture 0824-A');
    const generic=t.includes("couldn't find that");
    console.log(vp.name,'owner-fallback 631 login=',li,'recovered=',recovered,'genericErr=',generic,'userDetailsCalls=',rec.length);
    res = {vp:vp.name,recovered,generic,ud:rec.length};
    await p.screenshot({path:`${SHOTS}/flutter-${vp.name}-hidden-ownerfallback-631.png`});
    await b.close();
  }
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
