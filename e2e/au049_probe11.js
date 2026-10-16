// probe: click Neighbourhood (role=button) and screenshot immediately + after delay;
// the dropdown menu may render as an overlay NOT in flt-semantics — check DOM children.
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:768,height:1024}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:9112/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Marketplace',40000); await p.waitForTimeout(4500);
  await L.clickBtn(p,'Filters'); await p.waitForTimeout(1500);
  await p.click('flt-semantics[role="button"] >> text="Neighbourhood"').catch(async e=>{ 
    // fallback: coordinates
    const dd=await p.evaluate(()=>{let hit=null;document.querySelectorAll('flt-semantics').forEach(e=>{if(hit)return;const tx=(e.textContent||'').trim();if(tx==='Neighbourhood'){const r=e.getBoundingClientRect();hit={x:r.x+r.width/2,y:r.y+r.height/2};}});return hit;});
    await p.mouse.click(dd.x,dd.y);
  });
  for(const ms of [600,1600,3000]){
    await p.waitForTimeout(ms===600?600:ms===1600?1000:1400);
    const info=await p.evaluate(()=>({
      nodes:document.querySelectorAll('flt-semantics').length,
      texts:[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'').trim()).filter(x=>x&&x.length<45&&!x.includes('FiltersClear')).slice(0,40),
      bodyKids:document.querySelector('flutter-view')?document.querySelector('flutter-view').children.length:-1
    }));
    console.log('t+'+ms, JSON.stringify(info));
  }
  await p.screenshot({path:'/tmp/au049_dd2.png'});
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
