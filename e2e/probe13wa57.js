// 375x667 home: click FAB; screenshot burst 10 x 250ms to catch the snackbar.
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(25000);
  await p.goto('http://localhost:9108/#/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Featured',30000).catch(()=>{}); await p.waitForTimeout(2500);
  const fab=await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(/WhatsApp support/.test(t)){ const r=e.getBoundingClientRect(); best={cx:r.x+r.width/2,cy:r.y+r.height/2}; }});
    return best;});
  if(fab){ await p.mouse.click(Math.round(fab.cx),Math.round(fab.cy)); }
  for(let i=1;i<=10;i++){
    await p.screenshot({path:`/tmp/fabq_${i}.png`}).catch(()=>{});
    await p.waitForTimeout(250);
  }
  console.log('done');
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
