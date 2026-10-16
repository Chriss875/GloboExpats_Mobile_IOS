// The sweep clicks 'Generate new code' via mouse coords; probes showed the
// refusal message DOES render when clicked via locator. Diagnose: coordinate
// click on the TextButton icon half vs label half.
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await b.newContext({viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  let regenCount=0;
  p.on('response', async r=>{ if(/regenerate/.test(r.url())) regenCount++; });
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
  let tb=null;
  for(let i=0;i<12&&!tb;i++){
    tb=await p.evaluate(()=>{ let hit=null; document.querySelectorAll('flt-semantics').forEach(e=>{ if(hit)return;
      if(/Track delivery/.test((e.textContent||'')) && e.getAttribute('flt-tappable')!==null){ const r=e.getBoundingClientRect();
        if(r.width>0&&r.bottom>=0&&r.top<=innerHeight) hit={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; } }); return hit; });
    if(!tb){ await p.mouse.move(190,350); await p.mouse.wheel(0,300); await p.waitForTimeout(240); }
  }
  await p.mouse.click(tb.x,Math.min(tb.y,640)); await p.waitForTimeout(3000);
  // coordinate click exactly as the sweep does
  const gb=await p.evaluate(()=>{ let hit=null; document.querySelectorAll('flt-semantics').forEach(e=>{ if(hit)return;
    if(/Generate new code/.test((e.textContent||'')) && e.getAttribute('flt-tappable')!==null){ const r=e.getBoundingClientRect();
      if(r.width>0&&r.top>60&&r.bottom<innerHeight) hit={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; } }); return hit; });
  console.log('gb:',gb);
  await p.mouse.move(gb.x,gb.y); await p.waitForTimeout(140); await p.mouse.down(); await p.waitForTimeout(90); await p.mouse.up();
  for(let w=1;w<=5;w++){ await p.waitForTimeout(800); if(regenCount) break; }
  console.log('after coord click regenCount=',regenCount);
  const msg=await p.evaluate(()=>{ const hits=[]; document.querySelectorAll('*').forEach(e=>{
    const a=e.getAttribute&&e.getAttribute('aria-label'); if(a&&/Could not regenerate/i.test(a)) hits.push(a.slice(0,80)); }); return hits[0]||''; });
  console.log('msg:',msg);
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
