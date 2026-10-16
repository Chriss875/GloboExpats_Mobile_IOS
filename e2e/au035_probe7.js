// probe7: does the ORDER LIST row for o23 show a different banner? And check
// the detail again after full reload — maybe the first fetch raced.
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await b.newContext({viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  let apiJson=null;
  p.on('response', async r=>{ if(/\/api\/v1\/orders\/49dee2e4/.test(r.url())){ try{apiJson=await r.json();}catch(e){} } });
  await p.goto('http://localhost:9112/',{waitUntil:'load'});
  await L.waitText(p,'Buy now',25000);
  await L.clickBtn(p,'Login'); await L.waitText(p,'Welcome back',25000);
  const ei=p.locator('input[type="text"]').first(), pi=p.locator('input[type="password"]').first();
  await ei.click({force:true}); await p.waitForTimeout(300); await p.keyboard.type(L.BUYER.email);
  await pi.click({force:true}); await p.waitForTimeout(300); await p.keyboard.type(L.BUYER.pw);
  await L.clickBtn(p,'Log in');
  for(let i=0;i<25;i++){ if(await L.isLoggedIn(p)) break; await p.waitForTimeout(1000); }
  await p.goto('http://localhost:9112/orders/49dee2e4-e785-45e9-91a8-6a4dac2b3270',{waitUntil:'load'});
  for(let i=0;i<20;i++){ const t=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'')).join('')); if(t.includes('Placed on')) break; await p.waitForTimeout(900); }
  await p.waitForTimeout(2500);
  console.log('API payoutStatus seen by app:', apiJson && apiJson.payoutStatus, '| status:', apiJson&&apiJson.status);
  // The widget passes o.status (raw 'AWAITING_SELLER_CONFIRMATION') — confirm the
  // rendered node again:
  const nodes=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>[(e.textContent||'').trim(),(e.getAttribute('aria-label')||'').trim()].filter(Boolean)));
  const payIdx=nodes.findIndex(n=>n[0]==='Payment:');
  console.log(JSON.stringify(nodes.slice(Math.max(0,payIdx-1),payIdx+4)));
  console.log('has "Held by GloboExpats":', JSON.stringify(nodes).includes('Held by GloboExpats'));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
