// 375x667 anon: WA row — click, then press Enter on the FOCUSED node via keyboard.
// Flutter web semantics nodes respond to Enter/Space as clicks when focused.
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(20000);
  const seen=[]; c.on('page', np=>seen.push(np.url()));
  await p.goto('http://localhost:9108/#/product/627',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Fixture WhatsApp Contact Phone Listing',25000); await p.waitForTimeout(2000);
  await p.mouse.move(187,300); await p.mouse.wheel(0,600); await p.waitForTimeout(800);
  const hit=await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const t=(e.textContent||'').trim(); if(!t.startsWith('WhatsApp seller')) return;
      const r=e.getBoundingClientRect(); if(r.bottom<0||r.top>innerHeight) return;
      best={cx:r.x+r.width/2,cy:r.y+r.height/2};}); return best;});
  await p.mouse.click(Math.round(hit.cx),Math.round(hit.cy)); // focuses the row
  await p.waitForTimeout(400);
  await p.keyboard.press('Enter');
  for(let i=0;i<30;i++){ await p.waitForTimeout(400); if(seen.length) break; }
  console.log('enter-after-click popups=',JSON.stringify(seen));
  if(!seen.length){
    await p.keyboard.press('Space');
    for(let i=0;i<20;i++){ await p.waitForTimeout(400); if(seen.length) break; }
    console.log('space popups=',JSON.stringify(seen));
  }
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
