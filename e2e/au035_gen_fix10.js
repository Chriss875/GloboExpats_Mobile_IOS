// probe10: after the 409, wait longer (10s) and re-dump — maybe setState runs
// but the semantics tree updates late. Also watch for ANY new node.
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
  await p.mouse.click(tb.x,Math.min(tb.y,640)); await p.waitForTimeout(3000);
  const before=await p.screenshot();
  // click generate via Playwright locator (proper trusted click)
  const loc=p.locator('flt-semantics[role="button"]',{hasText:'Generate new code'}).first();
  try{ await loc.click({timeout:5000}); console.log('locator click ok'); }
  catch(e){ console.log('locator click failed:', e.message.slice(0,80)); }
  for(let w=1;w<=12;w++){
    await p.waitForTimeout(1000);
    const after=await p.screenshot();
    if(!before.equals(after)){ console.log(`PIXELS CHANGED at ${w}s`); break; }
    if(w===12) console.log('NO PIXEL CHANGE after 12s');
  }
  console.log('regen:',regen);
  const msgNodes=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>[(e.textContent||'').trim(),(e.getAttribute('aria-label')||'').trim()].filter(Boolean).join('~')).filter(t=>/Could not|New code/i.test(t)));
  console.log('msg nodes:',JSON.stringify(msgNodes));
  await p.screenshot({path:'/tmp/gen_after12.png'});
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
