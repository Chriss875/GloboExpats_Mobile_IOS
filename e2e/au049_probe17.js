// probe: reference mobile 375 — open the Filter sheet, enumerate its sections verbatim
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:3000/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await p.waitForTimeout(7000);
  // find the filter trigger button (SlidersHorizontal icon with text Filters?)
  const btns=await p.evaluate(()=>[...document.querySelectorAll('button')].map(x=>({t:(x.innerText||'').trim().slice(0,30),aria:x.getAttribute('aria-label')})).filter(x=>x.t||x.aria));
  console.log('BUTTONS:',JSON.stringify(btns.slice(0,25)));
  const filt=p.getByRole('button',{name:/Filter/i}).first();
  if(await filt.count()){ await filt.click().catch(()=>{}); await p.waitForTimeout(2000); }
  const t=await p.evaluate(()=>document.body.innerText);
  console.log('SHEET SECTIONS:', ['Price Range','Product Source','Categories','Subcategories','Location','Condition','Neighbourhood','Any listing location'].filter(s=>t.includes(s)));
  console.log('community/shops:', ['Community','Shops'].filter(s=>t.includes(s)));
  await L.screenshot(p,'/tmp/au049_ref_sheet.png');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
