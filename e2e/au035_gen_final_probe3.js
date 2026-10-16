// probe3: after Back (which exits the tracking screen), the sweep's later
// scroll passes found 'Generate new code'? No — controls() only sees on-screen
// nodes. The sweep recorded Generate with NO-EFFECT because the click landed
// on the DETAIL screen where the button doesn't exist... unless the sweep was
// still ON the tracking screen and its y was off-viewport (y=405 fine). The
// real difference: in probe2, after clicking Back we left the screen. In the
// sweep, no Back was clicked between Verify-delivery dialog dismissal
// ('dialog-opened' path clicks Cancel/OK/Back INSIDE the dialog if present,
// else nothing) — so Generate should have been clickable. Re-run sweep order
// WITHOUT pressing Back after the dialog.
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
  async function findBtn(re){
    return p.evaluate((rx)=>{ let hit=null;
      document.querySelectorAll('flt-semantics').forEach(e=>{
        if(hit) return;
        if(new RegExp(rx).test((e.textContent||'')+' '+(e.getAttribute('aria-label')||'')) && e.getAttribute('flt-tappable')!==null){
          const r=e.getBoundingClientRect();
          if(r.width>0&&r.top>=60&&r.bottom<=innerHeight-10) hit={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
        }});
      return hit;
    }, re);
  }
  let tb=null;
  for(let i=0;i<12&&!tb;i++){ tb=await findBtn('Track delivery'); if(!tb){ await p.mouse.move(190,350); await p.mouse.wheel(0,320); await p.waitForTimeout(240);} }
  await p.mouse.click(tb.x,Math.min(tb.y,640)); await p.waitForTimeout(2200);
  const vd=await findBtn('Verify delivery');
  await p.mouse.click(vd.x,vd.y); await p.waitForTimeout(1500);
  // What happened? Verify delivery with EMPTY code field does nothing
  // (onPressed only fires when code non-empty). So NO dialog opened; the
  // sweep's detector found a 'Cancel/OK/Back' node elsewhere? Check screen:
  const txt=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'').trim()).filter(Boolean).slice(0,10).join('|'));
  console.log('screen after verify-click:',txt.slice(0,160));
  // now generate:
  let gb=null;
  for(let i=0;i<10&&!gb;i++){ gb=await findBtn('Generate new code'); if(!gb){ await p.mouse.move(190,350); await p.mouse.wheel(0,-260); await p.waitForTimeout(230);} }
  console.log('generate:',gb);
  if(gb){
    await p.mouse.click(gb.x,gb.y);
    for(let w=1;w<=5;w++){ await p.waitForTimeout(900); if(regenCount) break; }
    console.log('regenCount=',regenCount);
    const msg=await p.evaluate(()=>{ const hits=[]; document.querySelectorAll('*').forEach(e=>{
      const a=e.getAttribute&&e.getAttribute('aria-label'); if(a&&/Could not regenerate/i.test(a)) hits.push(a.slice(0,100)); }); return hits[0]||''; });
    console.log('refusal rendered:', /Could not regenerate/i.test(msg));
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
