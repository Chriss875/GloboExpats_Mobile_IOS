// probe: does the Sort menu open (PopupMenuButton)? If yes, use the same interaction
// pattern for the DropdownButton. Also try tapping dropdown via its empty-value node.
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:768,height:1024}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:9112/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Marketplace',40000); await p.waitForTimeout(4500);
  await L.clickBtn(p,'Sort'); await p.waitForTimeout(1200);
  let t=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'').trim()).filter(Boolean));
  console.log('AFTER SORT CLICK:',JSON.stringify(t.slice(0,30)));
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  // now the sheet dropdown
  await L.clickBtn(p,'Filters'); await p.waitForTimeout(1500);
  const nodes=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map((e,i)=>({i,t:(e.textContent||'').trim().slice(0,30),role:e.getAttribute('role'),tap:e.getAttribute('flt-tappable'),r:(()=>{const b=e.getBoundingClientRect();return [b.x|0,b.y|0,b.width|0,b.height|0];})()})).filter(n=>n.t));
  console.log('SHEET NODES:',JSON.stringify(nodes.filter(n=>!n.t.includes('FiltersClear')),null,0));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
