const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:768,height:1024}});
  const p=await c.newPage(); p.setDefaultTimeout(20000);
  await p.goto('http://localhost:9108/#/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Featured',25000).catch(()=>{});
  await p.waitForTimeout(2500);
  const popups=[]; p.context().on('page', np=>popups.push(np.url()));
  // click home WhatsApp FAB
  const fab=await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const r=e.getBoundingClientRect(); const cx=r.x+r.width/2, cy=r.y+r.height/2;
      if(cx>innerWidth-90 && cy>innerHeight-120) best={cx,cy};});
    return best;});
  console.log('FAB',JSON.stringify(fab));
  if(fab) await p.mouse.click(Math.round(fab.cx),Math.round(fab.cy));
  for(let i=1;i<=5;i++){ await p.waitForTimeout(1000); if(popups.length) break; }
  console.log('HOME FAB popups=',JSON.stringify(popups));
  // now detail page WA row
  popups.length=0;
  await p.goto('http://localhost:9108/#/product/627',{waitUntil:'load',timeout:60000}).catch(()=>{});
  await lib.waitText(p,'Fixture WhatsApp Contact Phone Listing',25000); await p.waitForTimeout(1500);
  await p.mouse.move(380,500); await p.mouse.wheel(0,600); await p.waitForTimeout(700);
  const hit=await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const t=(e.textContent||'').trim(); if(!t.startsWith('WhatsApp seller')) return;
      const r=e.getBoundingClientRect(); if(r.bottom<0||r.top>innerHeight) return;
      best={cx:r.x+r.width/2,cy:r.y+r.height/2};}); return best;});
  console.log('WA row',JSON.stringify(hit));
  if(hit){ await p.mouse.click(Math.round(hit.cx),Math.round(hit.cy)); }
  for(let i=1;i<=5;i++){ await p.waitForTimeout(1000); if(popups.length) break; }
  console.log('DETAIL popups=',JSON.stringify(popups));
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
