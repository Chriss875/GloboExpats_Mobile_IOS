// CONTROL on a DIFFERENT page: home screen WhatsApp FAB at 375x667 anon — does IT launch?
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(25000);
  await p.goto('http://localhost:9108/#/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Featured',30000).catch(()=>{}); await p.waitForTimeout(2500);
  const seen=[]; c.on('page', np=>seen.push(np.url()));
  const fab=await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const r=e.getBoundingClientRect(); const cx=r.x+r.width/2, cy=r.y+r.height/2;
      if(r.width<80&&r.height<80&&cx>innerWidth-90&&cy>innerHeight-120) best={cx,cy};});
    return best;});
  console.log('FAB:',JSON.stringify(fab));
  if(fab){ await p.mouse.click(Math.round(fab.cx),Math.round(fab.cy)); }
  for(let i=0;i<20;i++){ await p.waitForTimeout(400); if(seen.length) break; }
  console.log('HOME FAB popups=',JSON.stringify(seen));
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
