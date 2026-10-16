const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:768,height:1024}});
  const p=await c.newPage(); p.setDefaultTimeout(20000);
  await p.goto('http://localhost:9108/#/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Featured',25000).catch(()=>{}); await p.waitForTimeout(2500);
  const popups=[]; 
  const ctx2 = await b.newContext({viewport:{width:768,height:1024}});
  const p2=await ctx2.newPage();
  // same browser? NO — newContext in same browser still shares the browser process.
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
