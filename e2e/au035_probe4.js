// probe4: check the semantics tree state — is the item row present but with
// EMPTY textContent (CanvasKit text isn't exposed per-node)? Dump innerText of
// all nodes + look at aria-labels. Also try enabling a11y differently.
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
  await p.goto('http://localhost:9112/orders/2499e6e9-b5f9-4b47-982e-1d50f99144c5',{waitUntil:'load'});
  for(let i=0;i<20;i++){ const t=await L.allText(p); if(t.includes('Placed on')) break; await p.waitForTimeout(900); }
  await p.waitForTimeout(2000);
  // scroll so 'Items Ordered' region visible, then dump ALL node attrs
  const info = await p.evaluate(()=>{
    const nodes=[...document.querySelectorAll('flt-semantics')];
    const iIdx=nodes.findIndex(n=>(n.textContent||'').trim()==='Items Ordered');
    return { total:nodes.length, iIdx,
      sample: nodes.slice(Math.max(iIdx-2,0), iIdx+8).map(n=>({txt:(n.textContent||''), label:n.getAttribute('aria-label'), role:n.getAttribute('role'), childN:n.children.length})) };
  });
  console.log(JSON.stringify(info,null,1));
  // count how many nodes have empty text
  const emptyCount = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].filter(n=>!(n.textContent||'').trim()).length);
  console.log('empty-text nodes:', emptyCount);
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
