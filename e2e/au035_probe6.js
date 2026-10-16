// probe6: o23 — dump EVERY node (text+aria) around 'Payment:' to see the exact
// banner/badge strings rendered. Maybe the badge text is there but my regex
// missed it because the sweep scrolled past.
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await b.newContext({viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:9112/',{waitUntil:'load'});
  await L.waitText(p,'Buy now',25000);
  await L.clickBtn(p,'Login'); await L.waitText(p,'Welcome back',25000);
  const ei=p.locator('input[type="text"]').first(), pi=p.locator('input[type="password"]').first();
  await ei.click({force:true}); await p.waitForTimeout(300); await p.keyboard.type(L.BUYER.email);
  await pi.click({force:true}); await p.waitForTimeout(300); await p.keyboard.type(L.BUYER.pw);
  await L.clickBtn(p,'Log in');
  for(let i=0;i<25;i++){ if(await L.isLoggedIn(p)) break; await p.waitForTimeout(1000); }
  await p.goto('http://localhost:9112/orders/49dee2e4-e785-45e9-91a8-6a4dac2b3270',{waitUntil:'load'});
  for(let i=0;i<20;i++){ let t=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'')).join('')); if(t.includes('Placed on')) break; await p.waitForTimeout(900); }
  await p.waitForTimeout(2500);
  for(let i=0;i<16;i++){
    const nodes=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>[(e.textContent||'').trim(),(e.getAttribute('aria-label')||'').trim()].filter(Boolean)));
    const payIdx=nodes.findIndex(n=>n[0]==='Payment:');
    if(payIdx>=0){
      console.log('Payment section found at scroll step',i);
      for(const n of nodes.slice(Math.max(0,payIdx-1), payIdx+8)) console.log('  NODE:', JSON.stringify(n));
      break;
    }
    await p.mouse.move(190,350); await p.mouse.wheel(0,240); await p.waitForTimeout(180);
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
