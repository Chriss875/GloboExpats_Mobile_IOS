// 375x667 home: FAB via label; click; screenshot burst 8x250ms to catch snackbar
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
  console.log('FAB:',JSON.stringify(fab));
  if(fab){ await p.mouse.click(Math.round(fab.cx),Math.round(fab.cy)); }
  for(let i=1;i<=10;i++){
    await p.screenshot({path:`/tmp/fabb_${i}.png`}).catch(()=>{});
    await p.waitForTimeout(250);
  }
  console.log('burst done');
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
