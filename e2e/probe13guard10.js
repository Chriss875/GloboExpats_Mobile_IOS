// Admin sees hidden 637 (owner==admin here) + Who-viewed panel on public 623.
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
  const out=[];
  for(const vp of [{name:'375',w:375,h:667},{name:'768',w:768,h:1024}]){
    const b=await lib.newBrowser();
    const c=await b.newContext({viewport:{width:vp.w,height:vp.h}});
    const p=await c.newPage(); p.setDefaultTimeout(25000);
    await loginPrecise(p);
    // admin on hidden 637
    await p.goto(`${APP}/#/product/637`,{waitUntil:'load',timeout:60000}).catch(()=>{});
    await p.waitForTimeout(4500);
    let t=await lib.allText(p);
    const sees637=t.includes('AU013R2 Hidden');
    out.push({vp:vp.name,case:'admin-637',sees:sees637});
    await p.screenshot({path:`${SHOTS}/flutter-${vp.name}-hidden-admin-ownerfallback-visible.png`});
    // who-viewed on public 623
    await p.goto(`${APP}/#/product/623`,{waitUntil:'load',timeout:60000}).catch(()=>{});
    await lib.waitText(p,'apartment',25000).catch(()=>{}); await p.waitForTimeout(3000);
    t=await lib.allText(p);
    const who=t.includes('Who viewed this listing');
    const views=/\d+ total views/.test(t);
    const viewerName=t.includes('Globo Expats');
    console.log(vp.name,'whoViewed=',who,'viewsLine=',views,'viewerName=',viewerName);
    out.push({vp:vp.name,who,views,viewerName});
    await p.screenshot({path:`${SHOTS}/flutter-${vp.name}-pub-admin-whoviewed.png`});
    await b.close();
  }
  require('fs').writeFileSync('/tmp/au013_admin.json',JSON.stringify(out,null,1));
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
