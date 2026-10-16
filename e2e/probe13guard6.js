// 637 anon — the REAL hidden fixture: itemDetails 404s. The web reference shows
// 'Product not found'. Compare BOTH apps on the same entity now.
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const REF='http://localhost:3000';
(async()=>{
  // Reference (judge)
  const rb=await lib.newBrowser();
  const rc=await rb.newContext({viewport:{width:375,height:667}});
  const rp=await rc.newPage(); rp.setDefaultTimeout(30000);
  const refResp=[];
  rp.on('response', async r=>{ if(/itemDetails\/637|products\/637/.test(r.url())&&r.request().method()==='GET') refResp.push(r.status()+' '+r.url().slice(0,90)); });
  await rp.goto(`${REF}/product/637`,{waitUntil:'networkidle',timeout:60000}).catch(()=>{});
  await rp.waitForTimeout(3000);
  const rtext=await rp.evaluate(()=>document.body.innerText.slice(0,300));
  console.log('REF text:',JSON.stringify(rtext));
  console.log('REF responses:',JSON.stringify(refResp,null,0).slice(0,400));
  await rp.screenshot({path:'/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-013/ref-375-hidden-anon.png'});
  await rb.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
