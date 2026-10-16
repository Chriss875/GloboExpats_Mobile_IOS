// Final evidence shots: 627 WA row at both viewports + 623 views line
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const SHOTS='/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-013';
async function loginPrecise(pg,APP){
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
    await loginPrecise(p,'http://localhost:9108');
    // 623 top (views line)
    await p.goto('http://localhost:9108/#/product/623',{waitUntil:'load',timeout:60000}).catch(()=>{});
    await lib.waitText(p,'apartment',25000).catch(()=>{}); await p.waitForTimeout(2500);
    await p.screenshot({path:`${SHOTS}/flutter-${vp.name}-pub-detail-top.png`});
    // scrolled (who-viewed + wa row)
    for(let s=0;s<14;s++){ await p.mouse.move(vp.w/2-5,400); await p.mouse.wheel(0,400); await p.waitForTimeout(180); }
    await p.waitForTimeout(700);
    await p.screenshot({path:`${SHOTS}/flutter-${vp.name}-pub-detail-scrolled.png`});
    // 627 wa row shot
    await p.goto('http://localhost:9108/#/product/627',{waitUntil:'load',timeout:60000}).catch(()=>{});
    await lib.waitText(p,'Fixture WhatsApp Contact Phone Listing',25000).catch(()=>{}); await p.waitForTimeout(1500);
    for(let s=0;s<12;s++){
      const pos=await p.evaluate(()=>{let best=null;
        document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
          if(!(e.textContent||'').startsWith('WhatsApp seller')) return;
          const r=e.getBoundingClientRect(); best={y:r.y,vis:r.bottom>0&&r.top<innerHeight};});
        return best;});
      if(pos&&pos.vis) break;
      await p.mouse.move(vp.w/2-5,400); await p.mouse.wheel(0,300); await p.waitForTimeout(300);
    }
    await p.screenshot({path:`${SHOTS}/flutter-${vp.name}-627-whatsapp-row.png`});
    console.log(vp.name,'shots done');
    await b.close();
  }
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
