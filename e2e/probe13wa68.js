// 375x667: FAB click — check the served bundle's freshness + which sha it matches.
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const http=require('http');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(25000);
  // fetch main.dart.js header
  await new Promise(res=>{
    http.get('http://localhost:9108/main.dart.js', r=>{ console.log('served Last-Modified:', r.headers['last-modified'], 'len:', r.headers['content-length']); r.resume(); r.on('end',res); });
  });
  await p.goto('http://localhost:9108/#/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Featured',30000).catch(()=>{}); await p.waitForTimeout(2500);
  // Does the bundle contain url_launcher_web? Check via a marker string unique to it.
  const marker = await p.evaluate(async ()=>{
    const t = await (await fetch('/main.dart.js')).text();
    return { hasUrlLauncherWeb: /__url_launcher::link/.test(t), size: t.length };
  });
  console.log('marker check:', JSON.stringify(marker));
  const seen=[]; c.on('page', np=>seen.push(np.url()));
  const fab=await p.evaluate(()=>{
    let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()==='WhatsApp support'){
        const r=e.getBoundingClientRect(); best={cx:r.x+r.width/2,cy:r.y+r.height/2};}});
    return best;});
  if(fab){ await p.mouse.click(Math.round(fab.cx),Math.round(fab.cy)); }
  let outcome=null;
  for(let i=0;i<20;i++){ await p.waitForTimeout(250);
    if(seen.length){ outcome='POPUP '+seen[0]; break; }
    const t=await lib.allText(p);
    if(/693 749 306/.test(t)){ outcome='SNACKBAR'; break; } }
  console.log('outcome=',outcome);
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
