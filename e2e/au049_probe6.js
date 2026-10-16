// probe: keyboard interaction with the dropdown (Flutter web a11y): focus + Enter/Space
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:768,height:1024}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:9112/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Marketplace',40000); await p.waitForTimeout(4500);
  await L.clickBtn(p,'Filters'); await p.waitForTimeout(1500);
  const dd=await p.evaluate(()=>{let hit=null;document.querySelectorAll('flt-semantics').forEach(e=>{if(hit)return;const tx=(e.textContent||'').trim();if(tx==='Neighbourhood'){const r=e.getBoundingClientRect();if(r.width>40)hit={cx:r.x+r.width/2,cy:r.y+r.height/2};}});return hit;});
  // try clicking at slightly different points (the field is 608x48; maybe an overlay intercepts)
  for(const [dx,dy] of [[0,0],[-200,0],[200,0],[0,-10]]){
    await p.mouse.click(dd.cx+dx, dd.cy+dy); await p.waitForTimeout(1500);
    const t=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'').trim()).filter(Boolean));
    const opened=['Bamaga','Oyster Bay','Uhuru'].some(n=>t.some(x=>x.includes(n)));
    console.log('click at',dx,dy,'-> menu open?',opened);
    if(opened){ await p.screenshot({path:'/tmp/au049_open.png'}); break; }
    // dismiss possible popup by pressing Escape
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
