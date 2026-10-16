// 375x667: home FAB — click; watch for popup AND snackbar fallback (exact string).
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(25000);
  await p.goto('http://localhost:9108/#/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Featured',30000).catch(()=>{}); await p.waitForTimeout(2500);
  let snack=null;
  const seen=[]; c.on('page', np=>seen.push(np.url()));
  const fab=await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(t==='WhatsApp support'){ const r=e.getBoundingClientRect(); best={cx:r.x+r.width/2,cy:r.y+r.height/2}; }});
    return best;});
  if(fab){ await p.mouse.click(Math.round(fab.cx),Math.round(fab.cy)); }
  for(let i=0;i<25;i++){ await p.waitForTimeout(250);
    if(seen.length) { console.log('POPUP:',seen[0]); break; }
    const t=await lib.allText(p);
    if(/693 749 306/.test(t)){ snack='FALLBACK SNACKBAR'; break; } }
  console.log('final popups=',JSON.stringify(seen),'snackbar=',snack);
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
