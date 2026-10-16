// probe9: robust — scroll to Track delivery, click, wait, then DOM-click
// Generate new code and check the message node + screenshot.
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await b.newContext({viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  let regen=null;
  p.on('response', async r=>{ if(/regenerate/.test(r.url())){ regen=r.status(); } });
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
  console.log('track:',tb);
  await p.mouse.click(tb.x,Math.min(tb.y,640)); await p.waitForTimeout(3000);
  // now find generate node (scroll to it)
  let gb=null;
  for(let i=0;i<12&&!gb;i++){
    gb=await p.evaluate(()=>{ let hit=null; document.querySelectorAll('flt-semantics').forEach(e=>{ if(hit)return;
      if(/Generate new code/.test((e.textContent||'')) && e.getAttribute('flt-tappable')!==null){ const r=e.getBoundingClientRect();
        if(r.width>0&&r.top>=60&&r.bottom<=innerHeight-20) hit={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; } }); return hit; });
    if(!gb){ await p.mouse.move(190,350); await p.mouse.wheel(0,220); await p.waitForTimeout(240); }
  }
  console.log('generate (in-view):',gb);
  regen=null;
  const did=await p.evaluate(()=>{ let ok=false; document.querySelectorAll('flt-semantics').forEach(e=>{ if(ok)return;
    if(/Generate new code/.test((e.textContent||'')) && e.getAttribute('flt-tappable')!==null){
      e.dispatchEvent(new MouseEvent('click',{bubbles:true})); ok=true; } }); return ok; });
  console.log('dispatched:',did);
  for(let w=1;w<=5;w++){ await p.waitForTimeout(900); if(regen) break; }
  console.log('regen HTTP:',regen);
  const msgNodes=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>[(e.textContent||'').trim(),(e.getAttribute('aria-label')||'').trim()].filter(Boolean).join('~')).filter(t=>/Could not|New code generated/i.test(t)));
  console.log('msg nodes:',JSON.stringify(msgNodes));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
