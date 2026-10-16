// probe5: dump the o23 detail payment section text + the reference login flow.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await b.newContext({viewport:{width:375,height:667}});
  const p = await ctx.newPage();
  await p.goto('http://localhost:9112/',{waitUntil:'load'});
  await L.waitText(p,'Buy now',25000);
  await L.clickBtn(p,'Login'); await L.waitText(p,'Welcome back',25000);
  const ei=p.locator('input[type="text"]').first(), pi=p.locator('input[type="password"]').first();
  await ei.click({force:true}); await p.waitForTimeout(300); await p.keyboard.type(L.BUYER.email);
  await pi.click({force:true}); await p.waitForTimeout(300); await p.keyboard.type(L.BUYER.pw);
  await L.clickBtn(p,'Log in');
  for(let i=0;i<25;i++){ if(await L.isLoggedIn(p)) break; await p.waitForTimeout(1000); }
  await p.goto('http://localhost:9112/orders/49dee2e4-e785-45e9-91a8-6a4dac2b3270',{waitUntil:'load'});
  for(let i=0;i<20;i++){ const t=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'')+' '+(e.getAttribute('aria-label')||'')).join('\n')); if(t.includes('Placed on')) break; await p.waitForTimeout(900); }
  await p.waitForTimeout(2000);
  let all='';
  for(let i=0;i<14;i++){
    const t=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>[(e.textContent||'').trim(),(e.getAttribute('aria-label')||'').trim()].filter(Boolean).join(' || ')).join('\n'));
    all+='\n'+t;
    await p.mouse.move(190,350); await p.mouse.wheel(0,260); await p.waitForTimeout(160);
  }
  // print lines around Payment
  const idx=all.indexOf('Payment');
  console.log('--- payment region ---');
  console.log(all.slice(Math.max(0,idx-600), idx+400));
  console.log('--- has HELD?', /held/i.test(all), '| has "Held by GloboExpats"?', all.includes('Held by GloboExpats'));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
