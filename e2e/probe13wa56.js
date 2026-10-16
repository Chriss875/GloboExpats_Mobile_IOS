// 375x667 home: click FAB by label; check for popup AND snackbar text 'GloboExpats support'
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(25000);
  await p.goto('http://localhost:9108/#/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Featured',30000).catch(()=>{}); await p.waitForTimeout(2500);
  const seen=[]; c.on('page', np=>seen.push(np.url()));
  let snack=null;
  const fab=await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(/WhatsApp support/.test(t)){ const r=e.getBoundingClientRect(); best={cx:r.x+r.width/2,cy:r.y+r.height/2}; }});
    return best;});
  console.log('FAB:',JSON.stringify(fab));
  if(fab){ 
    // press-and-hold then release, with a screenshot DURING the press (ripple = tap delivered)
    await p.mouse.move(fab.cx,fab.cy);
    await p.mouse.down();
    await p.waitForTimeout(100);
    await p.screenshot({path:'/tmp/fabpress2.png'}).catch(()=>{});
    await p.mouse.up();
  }
  for(let i=0;i<20;i++){ await p.waitForTimeout(300);
    if(seen.length) break;
    const t=await lib.allText(p);
    if(/GloboExpats support/.test(t)){ snack='SNACKBAR'; break; } }
  console.log('popups=',JSON.stringify(seen),'| snackbar=',snack);
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
