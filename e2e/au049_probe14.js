// probe: reference /browse at 768 — what does the neighbourhood control look like,
// does the sheet expose subcategory checkboxes, grid/list toggle visible?
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:768,height:1024}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:3000/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await p.waitForTimeout(7000);
  const t=await p.evaluate(()=>document.body.innerText);
  console.log('has Grid view btn:', await p.getByLabel('Grid view').count(), 'List view:', await p.getByLabel('List view').count());
  console.log('empty cats shown:', ['Food & Groceries','Garden & Outdoors','Pet & Supplies'].filter(n=>t.includes(n)));
  console.log('Oyster Bay in page:', t.includes('Oyster Bay'));
  console.log('Condition chips:', ['Like New','NEW','Good'].filter(c=>t.includes(c)));
  console.log('Product source:', ['Community','Shops'].filter(c=>t.includes(c)));
  console.log('subcategory sample:', ['Paintings & Prints','Handmade Crafts','Collectibles'].filter(c=>t.includes(c)));
  // open the mobile filter sheet? At 768 the desktop sidebar shows filters
  await L.screenshot(p,'/tmp/au049_ref768.png');
  // click List view and screenshot
  if(await p.getByLabel('List view').count()){ await p.getByLabel('List view').click(); await p.waitForTimeout(1500); await L.screenshot(p,'/tmp/au049_ref768list.png'); }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
