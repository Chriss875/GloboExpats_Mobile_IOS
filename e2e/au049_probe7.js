// probe: is the neighbourhood list EMPTY (F4 regression) — check the rendered
// dropdown item count by opening the menu and dumping the FULL a11y tree incl. offscreen
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:768,height:1024}});
  const p=await ctx.newPage();
  let nbResp=null;
  p.on('response',async r=>{ if(r.url().includes('neighbourhoods')){ try{ const j=await r.json(); nbResp={status:r.status(),n:Array.isArray(j)?j.length:null,first:JSON.stringify((j||[])[0])}; }catch(e){} } });
  await p.goto('http://localhost:9112/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Marketplace',40000); await p.waitForTimeout(5000);
  await L.clickBtn(p,'Filters'); await p.waitForTimeout(2500);
  console.log('NB RESPONSE:',JSON.stringify(nbResp));
  // full dump of ALL semantics nodes (not just short ones)
  const all=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>({t:(e.textContent||'').trim().slice(0,40),h:e.getBoundingClientRect().height|0})));
  console.log('ALL NODES:',all.length);
  console.log(JSON.stringify(all.slice(0,50)));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
