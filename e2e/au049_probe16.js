// probe: reference — open Categories accordion in the sidebar, check empty cats listed,
// pick Electronics, then look for Subcategories accordion + checkboxes.
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:1280,height:900}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:3000/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await p.waitForTimeout(8000);
  // expand the Categories accordion
  const acc=p.getByRole('button',{name:/Categories/}).first();
  console.log('acc count', await acc.count());
  if(await acc.count()){ await acc.click().catch(e=>console.log('acc click err')); await p.waitForTimeout(1500); }
  let t=await p.evaluate(()=>document.body.innerText);
  console.log('after expand, empty cats:', ['Food & Groceries','Garden & Outdoors','Pet & Supplies'].filter(n=>t.includes(n)));
  console.log('ok cats:', ['Electronics','Furniture','Clothing','Real Estate'].filter(n=>t.includes(n)));
  // tick Electronics checkbox
  const el=p.getByText('Electronics',{exact:true}).first();
  if(await el.count()){ await el.click().catch(()=>{}); await p.waitForTimeout(3500); }
  t=await p.evaluate(()=>document.body.innerText);
  console.log('Subcategories section:', t.includes('Subcategories'));
  console.log('electronics subcats:', ['Headphones & Audio','Cameras','Laptops','TV & Audio','Accessories','Gaming'].filter(c=>t.includes(c)).slice(0,8));
  await L.screenshot(p,'/tmp/au049_ref_cats.png');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
