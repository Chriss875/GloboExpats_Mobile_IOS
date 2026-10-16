// probe20: the diff text WAS in outerHTML (aria-label on a node). Extract the
// node carrying it and read its aria-label verbatim.
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await b.newContext({viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  let regen=null;
  p.on('response', async r=>{ if(/regenerate/.test(r.url())) regen=r.status(); });
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
  for(let i=0;i<12;i++){
    var gb=await p.evaluate(()=>{ let hit=null; document.querySelectorAll('flt-semantics').forEach(e=>{ if(hit)return;
      if(/Generate new code/.test((e.textContent||'')) && e.getAttribute('flt-tappable')!==null){ const r=e.getBoundingClientRect();
        if(r.width>0) hit={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; } }); return hit; });
    if(gb && gb.y>150 && gb.y<500) break;
    await p.mouse.move(190,350); await p.mouse.wheel(0, gb && gb.y>=500 ? -220 : 200); await p.waitForTimeout(230);
  }
  const loc=p.locator('flt-semantics[role="button"]',{hasText:'Generate new code'}).first();
  await loc.click({timeout:6000});
  await p.waitForTimeout(3500);
  console.log('regen HTTP:',regen);
  const found = await p.evaluate(()=>{
    const hits=[];
    document.querySelectorAll('*').forEach(e=>{
      const a=e.getAttribute&&e.getAttribute('aria-label');
      if(a&&/Could not regenerate/i.test(a)) hits.push({tag:e.tagName, label:a.slice(0,140)});
      const c=(e.textContent||'');
      if(/Could not regenerate/i.test(c)&&c.length<200) hits.push({tag:e.tagName, text:c.trim().slice(0,140)});
    });
    return hits.slice(0,5);
  });
  console.log('FOUND:', JSON.stringify(found,null,1));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
