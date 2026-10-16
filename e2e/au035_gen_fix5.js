// probe5: after the 409, dump ALL nodes (text+aria) to find where/whether the
// error message rendered — maybe it's offscreen below.
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await b.newContext({viewport:{width:375,height:667}});
  const p=await ctx.newPage();
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
  for(let i=0;i<10&&!tb;i++){
    tb=await p.evaluate(()=>{ let hit=null; document.querySelectorAll('flt-semantics').forEach(e=>{ if(hit)return;
      if(/Track delivery/.test((e.textContent||'')) && e.getAttribute('flt-tappable')!==null){ const r=e.getBoundingClientRect();
        if(r.width>0&&r.bottom>=0&&r.top<=innerHeight) hit={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; } }); return hit; });
    if(!tb){ await p.mouse.move(190,350); await p.mouse.wheel(0,320); await p.waitForTimeout(200); }
  }
  await p.mouse.click(tb.x,Math.min(tb.y,640)); await p.waitForTimeout(2800);
  // click generate wherever it is
  const gb=await p.evaluate(()=>{ let hit=null; document.querySelectorAll('flt-semantics').forEach(e=>{ if(hit)return;
    if(/Generate new code/.test((e.textContent||'')) && e.getAttribute('flt-tappable')!==null){ const r=e.getBoundingClientRect();
      if(r.width>0) hit={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; } }); return hit; });
  await p.mouse.click(gb.x,gb.y); await p.waitForTimeout(3500);
  const all=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>{
    const t=(e.textContent||'').trim(), a=(e.getAttribute('aria-label')||'').trim();
    const r=e.getBoundingClientRect();
    return {t:t||a, y:Math.round(r.y), vis:r.top>=0&&r.bottom<=innerHeight};
  }).filter(n=>n.t));
  console.log(JSON.stringify(all.slice(-12)));
  console.log('has "Could not regenerate":', JSON.stringify(all).includes('Could not regenerate'));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
