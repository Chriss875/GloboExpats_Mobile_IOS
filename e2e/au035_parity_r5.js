// parity r5: the reference lane proxies to apidev (BACKEND_URL in .env), which
// has ZERO orders for this buyer — the same-data parity comparison is
// impossible against :3000 for sandbox-created orders. Instead: drive the ref
// UI as far as it goes and RECORD the structural delta + reason. Also verify
// the reference's order-detail STRUCTURE using its own test suite contract
// (Items Ordered card, Quantity label, timeline) from source, documented.
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await b.newContext({viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:3000/login',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await p.waitForTimeout(3500);
  await p.locator('input[type="email"]').fill(L.BUYER.email);
  await p.locator('input[type="password"]').fill(L.BUYER.pw);
  await p.evaluate(()=>{ const el=[...document.querySelectorAll('button')].find(e=>/Sign In/i.test(e.textContent||'')); el&&el.click(); });
  await p.waitForTimeout(6500);
  // dashboard orders tab is where the ref lists orders
  await p.goto('http://localhost:3000/expat/dashboard?tab=orders',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await p.waitForTimeout(8000);
  const body=await p.evaluate(()=>document.body.innerText||'');
  console.log('DASHBOARD len', body.length);
  console.log(body.replace(/\n+/g,' | ').slice(0,900));
  await p.screenshot({path:'/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-035/AU-035-375-ref-dashboard-orders.png'});
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
