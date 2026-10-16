// probe2: same but scroll the tracking screen to find Generate new code and
// click it, watching for any UI response over 8s.
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await b.newContext({viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  const net=[];
  p.on('request', r=>{ if(/regenerate/.test(r.url())) net.push('REQ '+r.url().slice(-60)); });
  p.on('response', r=>{ if(/regenerate/.test(r.url())) net.push('RESP '+r.status()+' '+r.url().slice(-60)); });
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
  // find Track delivery anywhere (scroll if needed)
  let tb=null;
  for(let i=0;i<10&&!tb;i++){
    tb=await p.evaluate(()=>{ let hit=null; document.querySelectorAll('flt-semantics').forEach(e=>{ if(hit)return;
      if(/Track delivery/.test((e.textContent||'')) && e.getAttribute('flt-tappable')!==null){ const r=e.getBoundingClientRect();
        if(r.width>0&&r.bottom>=0&&r.top<=innerHeight) hit={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; } }); return hit; });
    if(!tb){ await p.mouse.move(190,350); await p.mouse.wheel(0,320); await p.waitForTimeout(200); }
  }
  console.log('track:',tb);
  await p.mouse.click(tb.x,Math.min(tb.y,640)); await p.waitForTimeout(2600);
  // find Generate new code
  let gb=null;
  for(let i=0;i<10&&!gb;i++){
    gb=await p.evaluate(()=>{ let hit=null; document.querySelectorAll('flt-semantics').forEach(e=>{ if(hit)return;
      if(/Generate new code/.test((e.textContent||'')) && e.getAttribute('flt-tappable')!==null){ const r=e.getBoundingClientRect();
        if(r.width>0&&r.bottom>=0&&r.top<=innerHeight) hit={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; } }); return hit; });
    if(!gb){ await p.mouse.move(190,350); await p.mouse.wheel(0,300); await p.waitForTimeout(220); }
  }
  console.log('generate:',gb);
  if(gb){
    const before=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'').trim()).join('\n'));
    await p.mouse.click(gb.x,Math.min(gb.y,640));
    for(let w=1;w<=8;w++){ await p.waitForTimeout(1000);
      const after=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'').trim()).join('\n'));
      if(after!==before){ console.log(`CHANGED at ${w}s`); break; }
      if(w===8) console.log('NO CHANGE after 8s');
    }
    const sb=await L.hasSnackBar(p); console.log('snackbar band:', sb.found);
    console.log('net:', net);
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
