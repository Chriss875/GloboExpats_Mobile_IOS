// 375x667: FAB — click; watch for popup OR fallback snackbar. Also log window.open calls.
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(25000);
  await p.goto('http://localhost:9108/#/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Featured',30000).catch(()=>{}); await p.waitForTimeout(2500);
  const seen=[]; c.on('page', np=>seen.push(np.url()));
  // instrument BEFORE tap
  await p.evaluate(()=>{ window.__openLog=[]; const o=window.open;
    window.open=function(u){window.__openLog.push(String(u)); try{return o.call(window,u,'_blank');}catch(e){return null;}}; });
  const fab=await p.evaluate(()=>{
    let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()==='WhatsApp support'){
        const r=e.getBoundingClientRect(); best={cx:r.x+r.width/2,cy:r.y+r.height/2};}});
    return best;});
  console.log('FAB:',JSON.stringify(fab));
  await p.mouse.click(Math.round(fab.cx),Math.round(fab.cy));
  let outcome=null;
  for(let i=0;i<25;i++){ await p.waitForTimeout(250);
    if(seen.length){ outcome='POPUP '+seen[0]; break; }
    const t=await lib.allText(p);
    if(/693 749 306/.test(t)){ outcome='SNACKBAR'; break; } }
  console.log('outcome=',outcome,'openLog=',JSON.stringify(await p.evaluate(()=>window.__openLog||[])));
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
