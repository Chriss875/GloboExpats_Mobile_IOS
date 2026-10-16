// probe: capture the neighbourhoods request from INSIDE the page (service-worker/CORS
// may hide it from page.on(response)); also check console errors.
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:768,height:1024}});
  const p=await ctx.newPage();
  p.on('console',m=>{ if(m.type()==='error'||m.type()==='warning') console.log('CONSOLE',m.type(),(m.text()||'').slice(0,160)); });
  p.on('requestfailed',r=>{ if(r.url().includes('8083')) console.log('REQFAIL',r.url().slice(-70),r.failure()&&r.failure().errorText); });
  let reqs=[];
  p.on('request',r=>{ if(r.url().includes('8083')) reqs.push(r.url().replace('http://localhost:8083','')); });
  await p.goto('http://localhost:9112/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Marketplace',40000); await p.waitForTimeout(5000);
  await L.clickBtn(p,'Filters'); await p.waitForTimeout(3000);
  console.log('API REQS:',JSON.stringify([...new Set(reqs)],null,1));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
