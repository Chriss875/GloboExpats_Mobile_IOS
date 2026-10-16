const L = require('./lib_verify.js');
(async()=>{
 for (const APP of ['http://localhost:9104','http://localhost:9131']) {
  const b = await L.newBrowser();
  const ctx = await b.newContext({viewport:{width:375,height:667}});
  const p = await ctx.newPage();
  let ok=0, bad=0; const urls=[];
  p.on('response', r=>{ if(/localhost:8083/.test(r.url())){ urls.push(r.status()+' '+r.url().slice(21,80)); if(r.status()<400) ok++; else bad++; }});
  const failed=[];
  p.on('requestfailed', r=>failed.push(r.failure()&&r.failure().errorText));
  await p.goto(APP,{waitUntil:'load',timeout:60000});
  await p.waitForTimeout(12000);
  const t=await L.allText(p);
  console.log(`\n##### ${APP}: apiOK=${ok} apiBad=${bad} failed=${failed.length}`);
  console.log('catErr='+t.includes('Could not load categories')+' prodErr='+t.includes('Could not load products'));
  console.log('sample:', JSON.stringify(urls.slice(0,6),null,1));
  console.log('featured value present:', /TSh\s?[\d,]+/.test(t), ' first price:', (t.match(/TSh ?[\d,]+/)||['none'])[0]);
  await b.close();
 }
})().catch(e=>{console.error(e);process.exit(1);});
