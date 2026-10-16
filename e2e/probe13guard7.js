// 768 anon 637 — confirm same generic-error branch at tablet viewport
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:768,height:1024}});
  const p=await c.newPage(); p.setDefaultTimeout(30000);
  await p.goto('http://localhost:9108/#/product/637',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await p.waitForTimeout(7000);
  const t=await lib.allText(p);
  console.log('768 anon637:',JSON.stringify({
    exactGuardCopy:t.includes('Error: Product not found'),
    backToBrowse:t.includes('Back to Browse'),
    genericErr:t.includes("couldn't find that"),
    commerce:t.includes('Add to Cart')||t.includes('Buy now')}));
  await p.screenshot({path:'/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-013/flutter-768-hidden-anon-notfound.png'});
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
