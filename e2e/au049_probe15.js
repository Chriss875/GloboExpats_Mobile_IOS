// probe: reference at 768 — open the category strip / check empty-cat visibility in
// the taxonomy strips, and confirm the neighbourhood select inside the filter sidebar
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:1280,height:900}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:3000/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await p.waitForTimeout(8000);
  const t=await p.evaluate(()=>document.body.innerText);
  console.log('empty cats:', ['Food & Groceries','Garden & Outdoors','Pet & Supplies'].filter(n=>t.includes(n)));
  console.log('neighbourhood options present (sidebar):', t.includes('Neighbourhood'));
  // count grid/list toggle
  console.log('grid/list:', await p.getByLabel('Grid view').count(), await p.getByLabel('List view').count());
  // click a category then look for subcategory chips
  const cat=p.getByText('Electronics',{exact:true}).first();
  if(await cat.count()){ await cat.click().catch(()=>{}); await p.waitForTimeout(4000); }
  const t2=await p.evaluate(()=>document.body.innerText);
  console.log('subcats after cat click:', ['Headphones','Cameras','Laptops','TV & Audio','Accessories'].filter(c=>t2.includes(c)).slice(0,6));
  await L.screenshot(p,'/tmp/au049_ref1280.png');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
