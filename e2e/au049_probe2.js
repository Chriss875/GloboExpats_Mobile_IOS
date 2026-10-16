// probe: what does the sheet actually contain? are there text fields? does the
// neighbourhood dropdown open? is there any grid/list toggle anywhere?
const L=require('./lib_verify.js');
const APP='http://localhost:9112';
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  await p.goto(APP+'/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Marketplace',40000); await p.waitForTimeout(4500);
  await L.clickBtn(p,'Filters'); await p.waitForTimeout(1500);
  const inputs=await p.evaluate(()=>[...document.querySelectorAll('input,textarea')].map(i=>({type:i.type,ph:i.placeholder,val:(i.value||'').slice(0,20)})));
  console.log('INPUTS:',JSON.stringify(inputs));
  const t1=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'').trim()).filter(Boolean));
  console.log('SHEET NODES:',JSON.stringify(t1.slice(0,40),null,0));
  // click the Neighbourhood dropdown field
  const dd=await p.evaluate(()=>{ let hit=null; document.querySelectorAll('flt-semantics').forEach(e=>{ if(hit)return; const t=(e.textContent||'').trim(); if(t.includes('Neighbourhood')){const r=e.getBoundingClientRect(); if(r.width>30){hit={cx:r.x+r.width/2,cy:r.y+r.height/2,a:r.width*r.height};}} }); return hit; });
  console.log('DD:',dd);
  if(dd){ await p.mouse.click(dd.cx,dd.cy); await p.waitForTimeout(1500); }
  const t2=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'').trim()).filter(Boolean));
  console.log('AFTER-DD NEW NODES:',JSON.stringify(t2.slice(0,60)));
  const inputCount=await p.evaluate(()=>document.querySelectorAll('input').length);
  console.log('input count after dd:',inputCount);
  await p.screenshot({path:'/tmp/au049_dd.png'});
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
