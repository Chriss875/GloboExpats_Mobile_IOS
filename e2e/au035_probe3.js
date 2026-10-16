// probe3: are the item texts present but OFFSCREEN (not in the a11y tree because
// Flutter only materializes semantics for the visible viewport)? Scroll to the
// item row and re-dump. Also check the semantics ENABLED state.
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

  // scroll stepwise; after each, look for LANÇ in tree
  for(let i=0;i<16;i++){
    await p.mouse.move(190,350); await p.mouse.wheel(0,-300); await p.waitForTimeout(120); // ensure at top first
  }
  let found=false;
  for(let i=0;i<20 && !found;i++){
    await p.mouse.move(190,350); await p.mouse.wheel(0,180); await p.waitForTimeout(260);
    const t=await L.allText(p);
    found = t.includes('LANC') || t.includes('La vie');
    console.log(`scroll ${i}: hasLANC=${t.includes('LANC')} hasPackSize=${t.includes('Pack Size')}`);
  }
  // also try keyboard PageDown + drag gesture (Flutter web scroll via touch)
  if(!found){
    console.log('trying touch-drag scroll...');
    for(let i=0;i<10 && !found;i++){
      await p.mouse.move(190,500);
      await p.mouse.down();
      for(let s=0;s<8;s++){ await p.mouse.move(190,500-s*40); await p.waitForTimeout(60); }
      await p.mouse.up();
      await p.waitForTimeout(400);
      const t=await L.allText(p);
      found=t.includes('LANC');
      console.log('drag',i,'hasLANC=',t.includes('LANC'));
    }
  }
  console.log('FINAL found:',found);
  const t=await L.allText(p);
  console.log(t.split('\n').filter(Boolean).slice(0,50).join('\n'));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
