// probe: reference mobile sheet — scroll inside, check neighbourhood + subcategories
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:3000/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await p.waitForTimeout(7000);
  const filt=p.getByRole('button',{name:/Filter/i}).first();
  await filt.click().catch(()=>{}); await p.waitForTimeout(1500);
  // scroll within the sheet
  for(let i=0;i<6;i++){ await p.mouse.move(180,350); await p.mouse.wheel(0,400); await p.waitForTimeout(300); }
  const t=await p.evaluate(()=>document.body.innerText);
  console.log('sections after scroll:', ['Price Range','Product Source','Categories','Subcategories','Location','Condition','Neighbourhood'].filter(s=>t.includes(s)));
  console.log('neighbourhood trigger:', t.includes('Any listing location'));
  // expand Categories accordion to see subcategory section appear?
  const cat=p.getByText('Categories').first();
  if(await cat.count()){await cat.click().catch(()=>{}); await p.waitForTimeout(1200);}
  const t2=await p.evaluate(()=>document.body.innerText);
  console.log('cats visible:', ['Electronics','Furniture','Food & Groceries','Garden & Outdoors','Pet & Supplies'].filter(s=>t2.includes(s)));
  await L.screenshot(p,'/tmp/au049_ref_sheet2.png');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
