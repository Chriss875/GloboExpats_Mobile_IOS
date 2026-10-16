// parity probe 2: full login + order load on :3000
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await b.newContext({viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:3000/login',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await p.waitForTimeout(3500);
  const em=p.locator('input[type="email"]'), pw=p.locator('input[type="password"]');
  await em.click(); await em.fill(L.BUYER.email);
  await pw.click(); await pw.fill(L.BUYER.pw);
  await p.getByText('Sign In', {exact:true}).click().catch(async()=>{ 
    await p.evaluate(()=>{ const el=[...document.querySelectorAll('button')].find(e=>/Sign In/i.test(e.textContent||'')); el&&el.click(); }); });
  await p.waitForTimeout(7000);
  console.log('after login URL:', p.url());
  console.log('token present:', await p.evaluate(()=>!!localStorage.getItem('expat_auth_token')));
  await p.goto('http://localhost:3000/orders/2499e6e9-b5f9-4b47-982e-1d50f99144c5',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await p.waitForTimeout(9000);
  const body=await p.evaluate(()=>document.body.innerText);
  console.log('ORDER PAGE len:', body.length);
  console.log(body.replace(/\n+/g,' | ').slice(0,1400));
  await p.screenshot({path:'/tmp/ref_o12_375.png'});
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
