// probe: click 'Generate new code' on the tracking screen and watch network +
// tree for 6s (does the app show ANY response to the refused request?)
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await b.newContext({viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  const net=[];
  p.on('response', r=>{ if(/regenerate|delivery-code|handoff/.test(r.url())) net.push(r.status()+' '+r.url().slice(-50)); });
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
  // open Track delivery
  const btns=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>({t:(e.textContent||'').trim(),tap:e.getAttribute('flt-tappable')!==null,x:Math.round(e.getBoundingClientRect().x+e.getBoundingClientRect().width/2),y:Math.round(e.getBoundingClientRect().y+e.getBoundingClientRect().height/2)})).filter(e=>e.tap&&/Track delivery/.test(e.t)));
  console.log('track buttons:', JSON.stringify(btns));
  if(btns[0]){ await p.mouse.click(btns[0].x,btns[0].y); await p.waitForTimeout(2500); }
  const g=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>({t:(e.textContent||'').trim(),tap:e.getAttribute('flt-tappable')!==null,x:Math.round(e.getBoundingClientRect().x+e.getBoundingClientRect().width/2),y:Math.round(e.getBoundingClientRect().y+e.getBoundingClientRect().height/2)})).filter(e=>e.tap&&/Generate new code/.test(e.t)));
  console.log('generate buttons:', JSON.stringify(g));
  if(g[0]){ await p.mouse.click(g[0].x,g[0].y); 
    for(let i=0;i<8;i++){ await p.waitForTimeout(800);
      const t=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'').trim()).join('\n'));
      if(i===7) console.log('tree after gen:', t.split('\n').filter(Boolean).slice(0,14).join(' | '));
    } }
  console.log('net calls:', net);
  const sb=await L.hasSnackBar(p); console.log('snackbar band:', sb.found, sb.atY||'');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
