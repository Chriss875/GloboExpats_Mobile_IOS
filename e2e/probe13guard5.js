// anon 637: check whether the widget test path differs — the guard throws
// 'Product not found' only for requiresPrivilegedViewer; a raw 404 rethrows
// 'itemDetails failed: HTTP 404' → generic branch. Confirm which one fires:
// we already know generic fired. Now confirm the widget tests still pass because
// they inject a fake ApiClient that throws 'Product not found'.
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(30000);
  await p.goto('http://localhost:9108/#/product/637',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await p.waitForTimeout(7000);
  const t=await lib.allText(p);
  console.log('anon637 renders:', JSON.stringify({
    exactGuardCopy: t.includes('Error: Product not found'),
    backToBrowse: t.includes('Back to Browse'),
    genericErr: t.includes("couldn't find that"),
    commerce: t.includes('Add to Cart')||t.includes('Buy now'),
  }));
  // Back button in app bar exists — click it (should pop/navigate)
  if(t.includes('Back to Browse')===false){
    // try the app-bar back arrow
    const back=await p.evaluate(()=>{let best=null;
      document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
        const r=e.getBoundingClientRect();
        if(r.x<80&&r.y<90&&r.width<70&&r.height<70) best={cx:r.x+r.width/2,cy:r.y+r.height/2};});
      return best;});
    console.log('appbar back:',JSON.stringify(back));
    if(back){ await p.mouse.click(Math.round(back.cx),Math.round(back.cy)); await p.waitForTimeout(1500);
      console.log('after back url=',await p.evaluate(()=>location.hash)); }
  }
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
