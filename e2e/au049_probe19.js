// probe: reference mobile sheet — expand Location accordion to expose neighbourhood
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:3000/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await p.waitForTimeout(7000);
  await p.getByRole('button',{name:/Filter/i}).first().click().catch(()=>{}); await p.waitForTimeout(1500);
  const loc=p.getByText('Location',{exact:true}).first();
  if(await loc.count()){ await loc.click().catch(()=>{}); await p.waitForTimeout(1200); }
  let t=await p.evaluate(()=>document.body.innerText);
  console.log('nb trigger now:', t.includes('Any listing location'));
  // open the combobox
  const cb=p.getByRole('combobox',{name:/listing location/i}).first();
  if(await cb.count()){ await cb.click().catch(()=>{}); await p.waitForTimeout(1500); }
  t=await p.evaluate(()=>document.body.innerText);
  console.log('options visible:', ['Oyster Bay','Uhuru Street','Mwenge'].filter(s=>t.includes(s)));
  await L.screenshot(p,'/tmp/au049_ref_nb.png');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
