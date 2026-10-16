// probe: is the dropdown menu rendering but NOT in the a11y tree? Screenshot after tap.
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:768,height:1024}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:9112/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Marketplace',40000); await p.waitForTimeout(4500);
  await L.clickBtn(p,'Filters'); await p.waitForTimeout(1500);
  const dd=await p.evaluate(()=>{let hit=null;document.querySelectorAll('flt-semantics').forEach(e=>{if(hit)return;const tx=(e.textContent||'').trim();if(tx==='Neighbourhood'){const r=e.getBoundingClientRect();if(r.width>40)hit={cx:r.x+r.width/2,cy:r.y+r.height/2};}});return hit;});
  await p.mouse.click(dd.cx,dd.cy); await p.waitForTimeout(2000);
  await p.screenshot({path:'/tmp/au049_aftertap.png'});
  // count semantics nodes now
  const n=await p.evaluate(()=>({nodes:document.querySelectorAll('flt-semantics').length, texts:[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'').trim()).filter(x=>x&&x.length<40).slice(0,40)}));
  console.log(JSON.stringify(n,null,1));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
