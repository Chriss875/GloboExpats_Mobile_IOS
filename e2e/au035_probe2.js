// probe2: dump the RAW order-detail JSON the app actually fetched + the widget
// tree state. Maybe fetchOrderDetail got a list-shaped response or items were
// dropped by an older model in the frozen build.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await b.newContext({viewport:{width:375,height:667}});
  const p = await ctx.newPage();
  p.on('response', async r => {
    if(/\/api\/v1\/orders\/[0-9a-f-]+$/.test(r.url())){
      let body=''; try{ body = await r.text(); }catch(e){}
      console.log('API-RESP', r.status(), r.url().slice(-20), 'len', body.length);
      try{ const j=JSON.parse(body); console.log('  keys:', Object.keys(j).join(','));
        console.log('  status:', j.status, '| items:', JSON.stringify(j.items||null).slice(0,300));
      }catch(e){ console.log('  parse fail'); }
    }
  });
  await p.goto('http://localhost:9112/',{waitUntil:'load'});
  await L.waitText(p,'Buy now',25000);
  await L.clickBtn(p,'Login'); await L.waitText(p,'Welcome back',25000);
  const ei=p.locator('input[type="text"]').first(), pi=p.locator('input[type="password"]').first();
  await ei.click({force:true}); await p.waitForTimeout(300); await p.keyboard.type(L.BUYER.email);
  await pi.click({force:true}); await p.waitForTimeout(300); await p.keyboard.type(L.BUYER.pw);
  await L.clickBtn(p,'Log in');
  for(let i=0;i<25;i++){ if(await L.isLoggedIn(p)) break; await p.waitForTimeout(1000); }
  await p.goto('http://localhost:9112/orders/2499e6e9-b5f9-4b47-982e-1d50f99144c5',{waitUntil:'load'});
  for(let i=0;i<20;i++){ const t=await L.allText(p); if(t.includes('Placed on')) break; await p.waitForTimeout(900); }
  await p.waitForTimeout(2500);
  // count flt-semantics nodes between 'Items Ordered' and 'Subtotal'
  const probe = await p.evaluate(()=>{
    const nodes=[...document.querySelectorAll('flt-semantics')];
    const iIdx=nodes.findIndex(n=>(n.textContent||'').trim()==='Items Ordered');
    const sIdx=nodes.findIndex(n=>(n.textContent||'').trim()==='Subtotal');
    return {iIdx, sIdx, between: nodes.slice(Math.max(iIdx,0), sIdx<0?undefined:sIdx).map(n=>({txt:(n.textContent||'').trim().slice(0,40), tag:n.tagName, tappable:n.getAttribute('flt-tappable')!==null})).slice(0,25)};
  });
  console.log(JSON.stringify(probe,null,1));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
