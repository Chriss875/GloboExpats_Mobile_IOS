// au047_probe_nb.js — why doesn't the dropdown list Oyster Bay? Capture the
// neighbourhoods request/response from inside the page and the sheet a11y text.
const L=require('./lib_verify.js');
(async()=>{
  const browser=await L.newBrowser();
  const ctx=await browser.newContext({viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  const nb=[];
  p.on('response',async r=>{ if(r.url().includes('neighbourhood')){ let b=null; try{b=await r.text()}catch(e){}; nb.push({url:r.url().slice(0,100),status:r.status(),bodyHead:(b||'').slice(0,150)}); } });
  await p.goto('http://localhost:9112/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Marketplace',30000);
  await p.waitForTimeout(3000);
  await L.clickBtn(p,'Filters');
  for(let i=0;i<12;i++){ await p.waitForTimeout(800); const t=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent).join('\n')); if(t.includes('Oyster Bay')||i===11){ console.log('sheet text after',i+1,'polls:\n',t.slice(0,1200)); break; } }
  console.log('\nneighbourhood network:',JSON.stringify(nb,null,1));
  await browser.close();
})();
