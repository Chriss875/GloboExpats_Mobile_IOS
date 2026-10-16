// 637 anon — the itemDetails request itself: status code + body
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(30000);
  const resp=[];
  p.on('response', async r=>{
    if(/itemDetails\/637/.test(r.url())){
      let body=''; try{ body=(await r.text()).slice(0,150); }catch(e){}
      resp.push(r.status()+' '+body);
    }});
  await p.goto('http://localhost:9108/#/product/637',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await p.waitForTimeout(7000);
  console.log(JSON.stringify(resp,null,0));
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
