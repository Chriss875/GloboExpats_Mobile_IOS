// probe4: does the click actually land? Move the button into center view and
// use a slow tap; also log the ApiException path by watching console errors.
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await b.newContext({viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  let regenStatus=null;
  p.on('response', async r=>{ if(/regenerate/.test(r.url())){ regenStatus=r.status(); } });
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
  // to tracking screen
  let tb=null;
  for(let i=0;i<10&&!tb;i++){
    tb=await p.evaluate(()=>{ let hit=null; document.querySelectorAll('flt-semantics').forEach(e=>{ if(hit)return;
      if(/Track delivery/.test((e.textContent||'')) && e.getAttribute('flt-tappable')!==null){ const r=e.getBoundingClientRect();
        if(r.width>0&&r.bottom>=0&&r.top<=innerHeight) hit={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; } }); return hit; });
    if(!tb){ await p.mouse.move(190,350); await p.mouse.wheel(0,320); await p.waitForTimeout(200); }
  }
  await p.mouse.click(tb.x,Math.min(tb.y,640)); await p.waitForTimeout(2800);
  // scroll so Generate is mid-screen
  for(let i=0;i<12;i++){
    gb=await p.evaluate(()=>{ let hit=null; document.querySelectorAll('flt-semantics').forEach(e=>{ if(hit)return;
      if(/Generate new code/.test((e.textContent||'')) && e.getAttribute('flt-tappable')!==null){ const r=e.getBoundingClientRect();
        if(r.width>0) hit={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; } }); return hit; });
    if(gb && gb.y>150 && gb.y<520) break;
    if(!gb || gb.y>=520){ await p.mouse.move(190,350); await p.mouse.wheel(0,-260); }
    else { await p.mouse.move(190,350); await p.mouse.wheel(0,200); }
    await p.waitForTimeout(250);
  }
  console.log('generate at:',gb);
  // tap with down/up and longer press
  await p.mouse.move(gb.x,gb.y); await p.waitForTimeout(300);
  await p.mouse.down(); await p.waitForTimeout(120); await p.mouse.up();
  for(let w=1;w<=8;w++){
    await p.waitForTimeout(1000);
    if(regenStatus!==null){
      const msg=await p.evaluate(()=>{ let m=null; document.querySelectorAll('flt-semantics').forEach(e=>{ if(m)return;
        const t=(e.textContent||'').trim(); if(/Could not regenerate|New code generated/.test(t)) m=t; }); return m; });
      console.log(`after ${w}s: regen HTTP=${regenStatus} msgNode=${JSON.stringify(msg)}`);
      if(msg||w===8) break;
    } else console.log(`after ${w}s: no request seen`);
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
