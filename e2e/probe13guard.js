// Guard matrix on corrected bundle: anon 637 + non-owner buyer 624 (375 & 768)
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
  const res=[];
  for(const vp of [{name:'375',w:375,h:667},{name:'768',w:768,h:1024}]){
    // ANON hidden 637
    {
      const b=await lib.newBrowser();
      const c=await b.newContext({viewport:{width:vp.w,height:vp.h}});
      const p=await c.newPage(); p.setDefaultTimeout(25000);
      await p.goto(`${APP}/#/product/637`,{waitUntil:'load',timeout:90000}).catch(()=>{});
      const nf=await lib.waitText(p,'Product not found',20000);
      const t=await lib.allText(p);
      const back=t.includes('Back to Browse');
      const commerce=t.includes('Add to Cart')||t.includes('Buy now');
      console.log(vp.name,'anon637 nf=',nf,'back=',back,'commerce=',commerce);
      res.push({vp:vp.name,case:'anon637',nf,back,commerce});
      await p.screenshot({path:`${SHOTS}/flutter-${vp.name}-hidden-anon-notfound.png`});
      if(back){ await lib.clickBtn(p,'Back to Browse'); await p.waitForTimeout(1500);
        const nav=await lib.waitText(p,'Marketplace',12000); console.log(vp.name,'back nav=',nav); res.push({vp:vp.name,case:'backnav',nav}); }
      await b.close();
    }
    // NON-OWNER BUYER on PENDING 624 (seller 59)
    {
      const b=await lib.newBrowser();
      const c=await b.newContext({viewport:{width:vp.w,height:vp.h}});
      const p=await c.newPage(); p.setDefaultTimeout(25000);
      const li=await loginPrecise(p);
      await p.goto(`${APP}/#/product/624`,{waitUntil:'load',timeout:60000}).catch(()=>{});
      await p.waitForTimeout(3500);
      const t=await lib.allText(p);
      const nf=t.includes('Product not found');
      const body=t.includes('Body Oil');
      console.log(vp.name,'buyer624 login=',li,'nf=',nf,'sawBodyOil=',body);
      res.push({vp:vp.name,case:'buyer624',li,nf,body});
      await p.screenshot({path:`${SHOTS}/flutter-${vp.name}-hidden-buyer-624-notfound.png`});
      await b.close();
    }
    // OWNER+ADMIN sees own hidden 637
    {
      const b=await lib.newBrowser();
      const c=await b.newContext({viewport:{width:vp.w,height:vp.h}});
      const p=await c.newPage(); p.setDefaultTimeout(25000);
      const li=await loginPrecise(p);
      await p.goto(`${APP}/#/product/637`,{waitUntil:'load',timeout:60000}).catch(()=>{});
      await lib.waitText(p,'AU013R2 Hidden',20000).catch(()=>{}); await p.waitForTimeout(1000);
      const t=await lib.allText(p);
      const seen=t.includes('AU013R2 Hidden');
      console.log(vp.name,'owner-admin 637 visible=',seen);
      res.push({vp:vp.name,case:'ownerAdmin637',seen});
      await p.screenshot({path:`${SHOTS}/flutter-${vp.name}-hidden-owner-visible.png`});
      await b.close();
    }
  }
  require('fs').writeFileSync('/tmp/au013_guard.json',JSON.stringify(res,null,1));
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
