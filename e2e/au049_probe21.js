// probe: reference — after picking Oyster Bay, wait longer and capture the LAST filter
// response (the one with neighbourhood param) + rendered card names
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  const resps=[];
  p.on('response',async r=>{ if(r.url().includes('/displayItem/filter')){ try{const j=await r.json(); resps.push({total:j.totalElements,url:r.url().slice(-160)});}catch(e){} } });
  await p.goto('http://localhost:3000/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await p.waitForTimeout(7000);
  await p.getByRole('button',{name:/Filter/i}).first().click().catch(()=>{}); await p.waitForTimeout(1200);
  await p.getByText('Location',{exact:true}).first().click().catch(()=>{}); await p.waitForTimeout(900);
  await p.locator('[role="combobox"]').first().click().catch(()=>{}); await p.waitForTimeout(1300);
  await p.getByText('Oyster Bay',{exact:true}).first().click().catch(()=>{}); await p.waitForTimeout(7000);
  console.log('RESPS:', JSON.stringify(resps.slice(-4),null,1));
  const cards=await p.evaluate(()=>[...document.querySelectorAll('a[href^="/product/"]')].length);
  console.log('product cards:',cards);
  await L.screenshot(p,'/tmp/au049_ref_nbpick2.png');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
