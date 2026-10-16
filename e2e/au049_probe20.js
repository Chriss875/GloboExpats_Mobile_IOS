// FINAL probe: reference — actually PICK Oyster Bay and verify the product grid narrows
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  let resp=null;
  p.on('response',async r=>{ if(r.url().includes('/displayItem/filter')){ try{const j=await r.json(); resp={total:j.totalElements,url:r.url().slice(-140)};}catch(e){} } });
  await p.goto('http://localhost:3000/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await p.waitForTimeout(7000);
  await p.getByRole('button',{name:/Filter/i}).first().click().catch(()=>{}); await p.waitForTimeout(1200);
  // expand Location
  for(const label of ['Location']){
    const loc=p.getByText(label,{exact:true}).first();
    if(await loc.count()){ await loc.click().catch(()=>{}); await p.waitForTimeout(900); }
  }
  const cb=p.locator('[role="combobox"]').first();
  if(await cb.count()){ await cb.click().catch(()=>{}); await p.waitForTimeout(1300); }
  const ob=p.getByText('Oyster Bay',{exact:true}).first();
  if(await ob.count()){ await ob.click().catch(()=>{}); await p.waitForTimeout(4000); }
  console.log('REF RESP:', JSON.stringify(resp));
  const t=await p.evaluate(()=>document.body.innerText);
  console.log('grid narrowed text sample:', t.slice(0,200).replace(/\n+/g,' | '));
  await L.screenshot(p,'/tmp/au049_ref_nbpick.png');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
