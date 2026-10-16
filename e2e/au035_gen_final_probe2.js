// probe2: coordinate click works in isolation. In the SWEEP the click happens
// while the detail screen is showing (the sweep runs BEFORE Track delivery is
// clicked) — 'Generate new code' is not on screen then; the sweep found it
// only because... wait, controls() filters to on-screen. Reproduce the exact
// sweep order: detail → click 'Track delivery' (state-changed, stays?) → then
// 'Verify delivery' opens dialog → dismissed via dialog-opened path? Check
// what screen the sweep is on when it clicks Generate.
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
  // replicate sweep: scroll down through detail; when Generate appears on the
  // TRACKING screen (after Track delivery was clicked) click it and watch.
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
  console.log('track:',tb);
  // click Track delivery like the sweep did (state-changed = navigated)
  await p.mouse.click(tb.x,Math.min(tb.y,640)); await p.waitForTimeout(2200);
  let vd=await findBtn('Verify delivery'); console.log('verify:',vd);
  // sweep clicked Verify delivery -> dialog-opened. Reproduce:
  await p.mouse.click(vd.x,vd.y); await p.waitForTimeout(1500);
  // now dismiss any dialog by pressing Back control or Cancel
  const cancel=await p.evaluate(()=>{ let hit=null; document.querySelectorAll('flt-semantics').forEach(e=>{ if(hit)return;
    if(/^(Cancel|Back|OK)$/.test((e.textContent||'').trim()) && e.getAttribute('flt-tappable')!==null){ const r=e.getBoundingClientRect();
      if(r.width>0&&r.top>=0&&r.bottom<=innerHeight) hit={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; } }); return hit; });
  console.log('cancel/back:',cancel);
  if(cancel){ await p.mouse.click(cancel.x,cancel.y); await p.waitForTimeout(900); }
  // NOW click generate as the sweep would
  let gb=null;
  for(let i=0;i<10&&!gb;i++){ gb=await findBtn('Generate new code'); if(!gb){ await p.mouse.move(190,350); await p.mouse.wheel(0,260); await p.waitForTimeout(230);} }
  console.log('generate:',gb);
  if(gb){
    await p.mouse.click(gb.x,gb.y);
    for(let w=1;w<=5;w++){ await p.waitForTimeout(900); if(regenCount) break; }
    console.log('regenCount=',regenCount);
    const msg=await p.evaluate(()=>{ const hits=[]; document.querySelectorAll('*').forEach(e=>{
      const a=e.getAttribute&&e.getAttribute('aria-label'); if(a&&/Could not regenerate/i.test(a)) hits.push(a.slice(0,100)); }); return hits[0]||''; });
    console.log('msg present:', /Could not regenerate/i.test(msg));
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
