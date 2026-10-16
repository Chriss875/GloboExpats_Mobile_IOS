// AU-008 skeptic r12 — STAGE 1: nav-level probes on :9131 @c6b4d61 (hash lane) + CORS control
const {L,shot,SHOT} = require('./sk008_lib.js');
const APP = process.env.APP || 'http://localhost:9131';
const OUT = process.env.OUTSHARD || '/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/AU-008-skeptic-r12.jsonl';
const fs=require('fs');
function rec(o){ fs.appendFileSync(OUT, JSON.stringify(Object.assign({ts:new Date().toISOString(),unit:'AU-008',wave:'skeptic',stage:'skeptic-r12',build_sha:'c6b4d61',app:APP},o))+'\n'); console.log(JSON.stringify(o)); }

// [name, hash, expect(text predicate), note]
const PROBES=[
 ['AU-000 home','#/','t=>/Buy\\. Sell\\. Connect\\.|Shop by Category/.test(t)'],
 ['AU-001 login-persists','#/account','async t=>{ const tok=await p.evaluate(()=>localStorage.getItem("flutter.auth_token")); return typeof tok==="string"&&tok.length>20; }'],
 ['AU-002 render','#/','t=>t.length>200'],
 ['AU-003 orders-gate','#/orders','t=>t.includes("Log in")||t.includes("Welcome back")'],
 ['AU-010 register','#/register','t=>t.includes("Register")||t.includes("Create account")||t.includes("Account")'],
 ['AU-013 product-404','#/product/999999','t=>t.includes("not found")||t.includes("couldn\'t find")'],
 ['AU-020 cart','#/cart','t=>/cart|Cart|empty/i.test(t)'],
 ['AU-022 checkout-gate','#/checkout','t=>t.toLowerCase().includes("log in")'],
 ['AU-034 orders-returnurl','#/orders','t=>t.includes("Welcome back")'],
 ['AU-042 admin-payments-review','#/admin/payments-review','t=>t.includes("Payment review")||t.includes("Log in")'],
 ['AU-050 saved','#/account/saved','t=>t.length>30'],
 ['AU-056 requests','#/requests','t=>t.length>50'],
 ['AU-058 notifications','#/account/notifications','t=>t.length>20'],
];
(async()=>{
 // ---- A. cold-load nav probes, anonymous, 375x667
 let b=await L.newBrowser();
 const ONLY=process.env.VPO||'';
 for (const vp of [{w:375,h:667,name:'375'},{w:768,h:1024,name:'768'}]) { if(ONLY&&vp.name!==ONLY) continue;
  const ctx=await b.newContext({viewport:{width:vp.w,height:vp.h}, recordVideo:{dir:'e2e/videos',size:{width:vp.w,height:vp.h}}});
  const p=await ctx.newPage();
  const stats={ok:0,bad:0,failed:0,failUrls:[],imgOk:0,imgBad:0,imgFailUrls:[]};
  p.on('response',r=>{ const u=r.url();
    if(/localhost:808[34]/.test(u)){ if(r.status()<400)stats.ok++; else {stats.bad++;} }
    if(/\/uploads\/[^?]*\.(png|jpe?g|webp)|\/assets\/.*\.(png|webp|jpg)/i.test(u)){ if(r.status()<400)stats.imgOk++; else {stats.imgBad++; stats.imgFailUrls.push(r.status()+' '+u.slice(-60));}}
  });
  p.on('requestfailed',r=>{ if(/localhost:808[34]/.test(r.url())){stats.failed++; stats.failUrls.push((r.failure()&&r.failure().errorText||'?').slice(0,24)+' '+r.url().slice(21,80));}});
  await p.goto(APP+'/',{waitUntil:'load'});
  await p.waitForTimeout(6000);
  await L.waitText(p,'expat marketplace',25000);
  for (const [name,hash,predSrc] of PROBES){
    await p.evaluate(h=>{window.location.hash=h;},hash);
    try{ await p.waitForFunction(()=>window.location.hash!=='',null,{timeout:5000}); }catch(e){}
    await p.waitForTimeout(3500);
    const t=await L.allText(p);
    let pred; try{ pred=eval('(t,p)=>('+predSrc+')'); }catch(e){ pred=null; }
    let pass=false;
    try{ pass=pred? !!(await pred(t,p)) : false; }catch(e){ pass=false; }
    const st={...stats};
    await shot(p,vp.name,name.replace(/[^A-Za-z0-9-]/g,''));
    rec({probe:name, viewport:vp.w+'x'+vp.h, pass, textLen:t.length,
         api:{ok:st.ok,bad:st.bad,blocked:st.failed}, sampleBlocked:st.failUrls.slice(0,2),
         img:{ok:st.imgOk,bad:st.imgBad},
         excerpt:t.slice(0,180).replace(/\s+/g,' ')});
    // reset to home between probes
    await p.evaluate(()=>{window.location.hash='#/';}); await p.waitForTimeout(1200);
  }
  const v=await p.video(); if(v){await v.saveAs(`e2e/videos/AU-008-sk2-${vp.name}.webm`).catch(()=>{});}
  await ctx.close();
 }
 await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
