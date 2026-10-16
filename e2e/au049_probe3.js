// probe: price fields are type=text (not number) — find them by label position and
// type into them; then check wire. Also try dropdown via keyboard.
const L=require('./lib_verify.js');
const APP='http://localhost:9112';
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  const reqs=[];
  p.on('request',r=>{ if(r.url().includes('/displayItem/filter')){ const u=new URL(r.url()); reqs.push({q:Object.fromEntries(u.searchParams.entries()),body:r.postData()}); } });
  await p.goto(APP+'/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Marketplace',40000); await p.waitForTimeout(4500);
  await L.clickBtn(p,'Filters'); await p.waitForTimeout(1500);
  // two text inputs = Min, Max (in DOM order)
  const ins=p.locator('input');
  console.log('n inputs', await ins.count());
  await ins.nth(0).click({force:true}); await p.waitForTimeout(300); await p.keyboard.type('10000');
  await ins.nth(1).click({force:true}); await p.waitForTimeout(300); await p.keyboard.type('20000');
  await p.screenshot({path:'/tmp/au049_price.png'});
  // apply
  const ap=await L.clickBtn(p,'Apply filters'); console.log('apply clicked',ap);
  await p.waitForTimeout(3500);
  console.log('REQS:',JSON.stringify(reqs.slice(-3),null,1));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
