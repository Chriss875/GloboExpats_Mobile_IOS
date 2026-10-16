// probe3: click Generate new code and dump the WHOLE tree (not just visible
// nodes) — the msg text may be below the fold.
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
  await p.mouse.click(tb.x,Math.min(tb.y,640)); await p.waitForTimeout(2600);
  let gb=null;
  for(let i=0;i<10&&!gb;i++){
    gb=await p.evaluate(()=>{ let hit=null; document.querySelectorAll('flt-semantics').forEach(e=>{ if(hit)return;
      if(/Generate new code/.test((e.textContent||'')) && e.getAttribute('flt-tappable')!==null){ const r=e.getBoundingClientRect();
        if(r.width>0&&r.bottom>=0&&r.top<=innerHeight) hit={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; } }); return hit; });
    if(!gb){ await p.mouse.move(190,350); await p.mouse.wheel(0,300); await p.waitForTimeout(220); }
  }
  // scroll the card fully into view first
  await p.mouse.move(190,350); await p.mouse.wheel(0,-200); await p.waitForTimeout(300);
  const beforeFull=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>[(e.textContent||'').trim(),(e.getAttribute('aria-label')||'').trim()].filter(Boolean).join('~')).join('\n'));
  await p.mouse.click(gb.x,Math.min(gb.y,600));
  for(let w=1;w<=7;w++){
    await p.waitForTimeout(1000);
    const afterFull=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>[(e.textContent||'').trim(),(e.getAttribute('aria-label')||'').trim()].filter(Boolean).join('~')).join('\n'));
    if(afterFull!==beforeFull){
      console.log(`TREE CHANGED at ${w}s`);
      const diffLines = afterFull.split('\n').filter(l=>!beforeFull.includes(l));
      console.log('NEW LINES:', JSON.stringify(diffLines).slice(0,400));
      break;
    }
    if(w===7) console.log('NO TREE CHANGE after 7s (whole-tree compare)');
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
