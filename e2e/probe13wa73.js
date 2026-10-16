// WhatsApp row on 623? (627 has it; 623 also shows WhatsApp seller per panel text)
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
  const seen=[]; c.on('page', np=>seen.push(np.url()));
  await p.goto('http://localhost:9108/#/product/623',{waitUntil:'load',timeout:60000}).catch(()=>{});
  await lib.waitText(p,'apartment',25000).catch(()=>{}); await p.waitForTimeout(2000);
  const t=await lib.allText(p);
  console.log('623 wa row present:',t.includes('WhatsApp seller'));
  // tap it
  const hit=await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      if(!(e.textContent||'').startsWith('WhatsApp seller')) return;
      const r=e.getBoundingClientRect(); if(r.bottom<0||r.top>innerHeight) return;
      best={cx:r.x+r.width/2,cy:r.y+r.height/2};}); return best;});
  if(hit){ 
    await p.mouse.move(187,400); await p.mouse.wheel(0,600); await p.waitForTimeout(700);
    const hit2=await p.evaluate(()=>{let best=null;
      document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
        if(!(e.textContent||'').startsWith('WhatsApp seller')) return;
        const r=e.getBoundingClientRect(); if(r.bottom<0||r.top>innerHeight) return;
        best={cx:r.x+r.width/2,cy:r.y+r.height/2};}); return best;});
    if(hit2) {
      for(let n=0;n<3 && !seen.length;n++){
        await p.mouse.click(Math.round(hit2.cx),Math.round(hit2.cy));
        for(let i=0;i<8;i++){ await p.waitForTimeout(300); if(seen.length) break; }
      }
    }
  }
  console.log('623 wa popups=',JSON.stringify(seen));
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
