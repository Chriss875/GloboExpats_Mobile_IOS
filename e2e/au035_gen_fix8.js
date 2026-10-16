// probe8: click via the semantics node's own click() (a11y action) instead of
// coordinates — maybe coordinate clicks land on a wrapper.
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
  // to tracking screen
  const tb=await p.evaluate(()=>{ let hit=null; document.querySelectorAll('flt-semantics').forEach(e=>{ if(hit)return;
    if(/Track delivery/.test((e.textContent||'')) && e.getAttribute('flt-tappable')!==null){ const r=e.getBoundingClientRect();
      if(r.width>0&&r.bottom>=0&&r.top<=innerHeight) hit={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; } }); return hit; });
  console.log("track", tb); if(!tb){ console.log("NO TRACK BTN"); process.exit(1);} 
  await p.mouse.click(tb.x,Math.min(tb.y,640)); await p.waitForTimeout(2800);
  regen=null;
  // dispatch a real DOM click on the node itself
  const did=await p.evaluate(()=>{ let hit=false; document.querySelectorAll('flt-semantics').forEach(e=>{ if(hit)return;
    if(/Generate new code/.test((e.textContent||'')) && e.getAttribute('flt-tappable')!==null){
      const r=e.getBoundingClientRect();
      if(r.width>0 && r.top>=0 && r.bottom<=innerHeight){ e.click(); e.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); hit=true; } } });
    return hit; });
  console.log('dom-click dispatched:', did);
  await p.waitForTimeout(4000);
  console.log('regen status:', regen);
  const msgNode=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>[(e.textContent||'').trim(),(e.getAttribute('aria-label')||'').trim()].filter(Boolean).join('~')).filter(t=>/regenerate|New code|Could not/i.test(t)));
  console.log('msg nodes:', JSON.stringify(msgNode));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
