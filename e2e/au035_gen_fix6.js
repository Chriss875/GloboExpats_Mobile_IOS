// probe6: the 409 fires and _verifyMsg SHOULD be set. Check if a SECOND click
// renders it (first click may have been consumed while semantics were stale),
// and dump the whole tree text after each click.
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
  async function genBtn(){ return p.evaluate(()=>{ let hit=null; document.querySelectorAll('flt-semantics').forEach(e=>{ if(hit)return;
    if(/Generate new code/.test((e.textContent||'')) && e.getAttribute('flt-tappable')!==null){ const r=e.getBoundingClientRect();
      if(r.width>0&&r.top>=0&&r.bottom<=innerHeight) hit={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; } }); return hit; }); }
  let gb=await genBtn(); console.log('gen visible at', gb);
  if(!gb){ await p.mouse.move(190,350); await p.mouse.wheel(0,-300); await p.waitForTimeout(400); gb=await genBtn(); console.log('after scroll up:',gb); }
  for(let attempt=1;attempt<=3;attempt++){
    const before=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>[(e.textContent||'').trim(),(e.getAttribute('aria-label')||'').trim()].filter(Boolean).join('~')).join('\n'));
    await p.mouse.click(gb.x,gb.y);
    for(let w=1;w<=4;w++){
      await p.waitForTimeout(900);
      const after=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>[(e.textContent||'').trim(),(e.getAttribute('aria-label')||'').trim()].filter(Boolean).join('~')).join('\n'));
      if(after!==before){ 
        const newLines=after.split('\n').filter(l=>!before.includes(l));
        console.log(`attempt ${attempt}: CHANGED at ${w}s -> ${JSON.stringify(newLines).slice(0,200)}`);
        break;
      }
      if(w===4) console.log(`attempt ${attempt}: no change`);
    }
    await p.waitForTimeout(600);
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
