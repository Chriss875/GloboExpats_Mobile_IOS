// probe: click the dropdown and check the RENDERED pixels for a menu (CanvasKit paints
// outside the semantics tree when the menu has no semantics). Compare screenshots
// before/after tap by pixel diff.
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:768,height:1024}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:9112/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Marketplace',40000); await p.waitForTimeout(4500);
  await L.clickBtn(p,'Filters'); await p.waitForTimeout(1500);
  await L.screenshot(p,'/tmp/au049_before.png');
  const dd=await p.evaluate(()=>{let hit=null;document.querySelectorAll('flt-semantics').forEach(e=>{if(hit)return;const tx=(e.textContent||'').trim();if(tx==='Neighbourhood'){const r=e.getBoundingClientRect();hit={x:r.x+30,y:r.y+r.height/2};}});return hit;});
  await p.mouse.click(dd.x,dd.y); await p.waitForTimeout(2200);
  await L.screenshot(p,'/tmp/au049_after.png');
  console.log('shots taken');
  // pixel-diff via PNG decode in lib? do quick byte-length + hash compare
  const fs=require('fs');
  const h1=fs.statSync('/tmp/au049_before.png').size, h2=fs.statSync('/tmp/au049_after.png').size;
  console.log('sizes',h1,h2);
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
