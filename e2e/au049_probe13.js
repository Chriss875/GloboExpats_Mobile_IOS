// probe: does the dropdown respond to a click ANYWHERE? Try tapping and checking for
// a route/semantics change with a much later wait; also try tapping the field's center
// via Playwright's element handle (real event path), then keyboard down-arrow.
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:768,height:1024}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:9112/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Marketplace',40000); await p.waitForTimeout(4500);
  await L.clickBtn(p,'Filters'); await p.waitForTimeout(1500);
  // focus the field by clicking, then send keyboard events
  const dd=await p.evaluate(()=>{let hit=null;document.querySelectorAll('flt-semantics').forEach(e=>{if(hit)return;const tx=(e.textContent||'').trim();if(tx==='Neighbourhood'){const r=e.getBoundingClientRect();hit={x:r.x+r.width/2,y:r.y+r.height/2};}});return hit;});
  await p.mouse.click(dd.x,dd.y); await p.waitForTimeout(800);
  await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
  let t=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'').trim()).filter(Boolean));
  console.log('after Enter:', t.some(x=>x.includes('Oyster Bay')));
  await p.keyboard.press(' '); await p.waitForTimeout(1200);
  t=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'').trim()).filter(Boolean));
  console.log('after Space:', t.some(x=>x.includes('Oyster Bay')));
  // ArrowDown to open
  await p.keyboard.press('ArrowDown'); await p.waitForTimeout(1200);
  t=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'').trim()).filter(Boolean));
  console.log('after ArrowDown:', t.some(x=>x.includes('Oyster Bay')));
  await L.screenshot(p,'/tmp/au049_kb.png');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
