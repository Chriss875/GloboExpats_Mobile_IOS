// anon 637 with LONGER wait (cold load ~7s); also dump text to see what renders
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(30000);
  await p.goto('http://localhost:9108/#/product/637',{waitUntil:'load',timeout:90000}).catch(()=>{});
  for(let i=1;i<=10;i++){
    await p.waitForTimeout(1500);
    const t=await lib.allText(p);
    console.log('t+'+i*1.5+'s', JSON.stringify({nf:t.includes('Product not found'),err:t.includes('Could not load'),
      sample:t.split('\n').filter(x=>x.trim()).slice(0,6).join('|').slice(0,120)}));
    if(t.includes('Product not found')||t.includes('Could not load')) break;
  }
  await p.screenshot({path:'/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-013/flutter-375-hidden-anon-notfound.png'});
  const t=await lib.allText(p);
  if(t.includes('Back to Browse')){
    await lib.clickBtn(p,'Back to Browse'); await p.waitForTimeout(1800);
    console.log('after back url=',await p.evaluate(()=>location.hash),'marketplace=',await lib.waitText(p,'Marketplace',8000));
    await p.screenshot({path:'/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-013/flutter-375-hidden-anon-after-back.png'});
  }
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
