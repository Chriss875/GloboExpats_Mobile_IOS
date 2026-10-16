// 768x1024: WA row click -> does the row show ripple? Compare screenshots at click+0/150ms
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:768,height:1024}});
  const p=await c.newPage(); p.setDefaultTimeout(20000);
  await p.goto('http://localhost:9108/#/product/627',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Fixture WhatsApp Contact Phone Listing',25000); await p.waitForTimeout(2000);
  await p.mouse.move(380,500); await p.mouse.wheel(0,600); await p.waitForTimeout(800);
  const hit=await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const t=(e.textContent||'').trim(); if(!t.startsWith('WhatsApp seller')) return;
      const r=e.getBoundingClientRect(); if(r.bottom<0||r.top>innerHeight) return;
      best={cx:r.x+r.width/2,cy:r.y+r.height/2};}); return best;});
  console.log('tap',JSON.stringify(hit));
  await p.screenshot({path:'/tmp/waripple_before.png'});
  // press and hold for screenshot during ink animation
  await p.mouse.move(hit.cx,hit.cy);
  await p.mouse.down();
  await p.waitForTimeout(120);
  await p.screenshot({path:'/tmp/waripple_during.png'});
  await p.mouse.up();
  await p.waitForTimeout(200);
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
