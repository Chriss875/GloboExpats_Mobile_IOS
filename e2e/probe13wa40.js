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
  // click the row, then IMMEDIATELY evaluate window.open override presence
  const hit=await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const t=(e.textContent||'').trim(); if(!t.startsWith('WhatsApp seller')) return;
      const r=e.getBoundingClientRect(); if(r.bottom<0||r.top>innerHeight) return;
      best={cx:r.x+r.width/2,cy:r.y+r.height/2};}); return best;});
  console.log('tap',JSON.stringify(hit));
  await p.mouse.click(Math.round(hit.cx),Math.round(hit.cy));
  await p.waitForTimeout(1000);
  // Check the semantics node's attributes AFTER tap — did Flutter update focus?
  const postState = await p.evaluate(()=>{
    let row=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      if((e.textContent||'').startsWith('WhatsApp seller')) row=e;});
    return {attrs: row? Object.values(row.attributes).map(a=>a.name).join(',') : null,
            hasFocus: document.activeElement===row};
  });
  console.log('post-tap:',JSON.stringify(postState));
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
