// probe: why does the o12 detail a11y tree lack the item title/choices?
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
  // scroll to very bottom slowly, dumping text each step
  let lastLen=-1;
  for(let i=0;i<18;i++){
    await p.mouse.move(190,350); await p.mouse.wheel(0,260); await p.waitForTimeout(220);
    const t=await L.allText(p);
    console.log(`step ${i} len=${t.length} hasLANC=${t.includes('LANC')} hasPackSize=${t.includes('Pack Size')} hasQty=${t.includes('Quantity:')}`);
  }
  const final = await L.allText(p);
  console.log('--- FULL TREE ---');
  console.log(final.split('\n').filter(Boolean).slice(0,80).join('\n'));
  await p.screenshot({path:'/tmp/au035_bottom.png'});
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
