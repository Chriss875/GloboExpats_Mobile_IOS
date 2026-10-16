// anon 637 — dump FULL text at steady state to see exactly which branch rendered
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(30000);
  await p.goto('http://localhost:9108/#/product/637',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await p.waitForTimeout(7000);
  const t=await lib.allText(p);
  console.log('FULLTEXT:',t.split('\n').filter(x=>x.trim()).slice(0,20).join(' | ').slice(0,400));
  console.log('hasNotFoundCopy:',t.includes('Product not found'),'hasGenericErr:',t.includes("couldn't find that"),'hasBackBtn:',t.includes('Back to Browse'));
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
