// 375x667: dump home semantics labels containing 'WhatsApp' or FAB-like nodes
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(25000);
  await p.goto('http://localhost:9108/#/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Featured',30000).catch(()=>{}); await p.waitForTimeout(2500);
  const info=await p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      const r=e.getBoundingClientRect();
      if(/WhatsApp/.test(t) || (e.getAttribute('role')==='button'&&r.width<80&&r.height<80&&r.x>innerWidth-100&&r.y>innerHeight-140)){
        out.push({t:t.slice(0,40),role:e.getAttribute('role'),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width)});
      }});
    return out;
  });
  console.log(JSON.stringify(info,null,0));
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
