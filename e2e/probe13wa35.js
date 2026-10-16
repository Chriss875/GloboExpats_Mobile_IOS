// 375x667: WA row click; check if a popup opens in the SAME page via location change
// or whether window.open returned null because of 'noopener' (popup blocked silently).
// Also try clicking at slightly different offsets within the row.
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(20000);
  await p.goto('http://localhost:9108/#/product/627',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Fixture WhatsApp Contact Phone Listing',25000); await p.waitForTimeout(2000);
  await p.mouse.move(187,300); await p.mouse.wheel(0,600); await p.waitForTimeout(800);
  const seen=[]; c.on('page', np=>seen.push(np.url()));
  const r=await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const t=(e.textContent||'').trim(); if(!t.startsWith('WhatsApp seller')) return;
      const b=e.getBoundingClientRect(); if(b.bottom<0||b.top>innerHeight) return;
      best={x:b.x,y:b.y,w:b.width,h:b.height};}); return best;});
  console.log('row rect',JSON.stringify(r));
  for(const [dx,dy] of [[0.5,0.5],[0.1,0.5],[0.9,0.5],[0.5,0.2],[0.5,0.8]]){
    const x=r.x+r.w*dx, y=r.y+r.h*dy;
    await p.mouse.click(x,y);
    for(let i=0;i<6;i++){ await p.waitForTimeout(500); if(seen.length) break; }
    if(seen.length){ console.log(`HIT at (${dx},${dy})`,seen[0]); break; } else console.log(`no launch at (${dx},${dy})`);
  }
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
