// AU-013 skeptic r5 — attack class A: guard bypass via client-side payload flip.
const { chromium } = require('playwright');
const fs = require('fs');
const L = require('./lib_verify.js');
const APP='http://localhost:9112', API='http://localhost:8083';
const SHOTS='/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-013';
const VDIR='/home/devsystemadmin/GloboExpats_Mobile/e2e/videos';
fs.mkdirSync(SHOTS,{recursive:true}); fs.mkdirSync(VDIR,{recursive:true});

async function openDeep(p,id){
  await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await p.waitForTimeout(2500);
  await p.evaluate(h=>{window.location.hash=h;},`#/product/${id}`);
  let t='',t0=Date.now();
  while(Date.now()-t0<30000){
    await p.waitForTimeout(900);
    t=await L.allText(p).catch(()=>'');
    if(/Error: Product not found|Could not load product/.test(t)) break;
    const hasBody=/total views|Quantity|FOR RENT|available|Description/i.test(t);
    if((/Add to cart|Buy now/.test(t))&&hasBody) break;
    if(/Who viewed this listing/i.test(t)) break;
  }
  return t;
}
(async()=>{
  const out={attacks:[],evidence:[]};
  const b=await L.newBrowser();
  // --- anon leg
  {
    const ctx=await b.newContext({viewport:{width:375,height:667},
      recordVideo:{dir:VDIR,size:{width:375,height:667}}});
    const p=await ctx.newPage(); ctx._v=`${VDIR}/AU-013-sk2-flip-anon.webm`;
    let flipped=0;
    await p.route('**/api/v1/displayItem/itemDetails/710', async route=>{
      const resp=await route.fetch(); let body=resp.text();
      try{const j=JSON.parse(body); j.deliverySetupReady=false; j.deliverySetupGrandfathered=false;
          j.latitude=null;j.longitude=null;j.transportModeSource=null;j.coordinatesSource=null;
          body=JSON.stringify(j);flipped++;}catch(e){}
      route.fulfill({status:resp.status(),contentType:'application/json',body});
    });
    const t=await openDeep(p,710);
    const nf=/\bError: Product not found\b/.test(t), gen=/Could not load product/.test(t);
    const back=await L.btn(p,'Back to Browse').count().catch(()=>0);
    const leak=/Add to cart|Buy now|Contact seller|WhatsApp/i.test(t);
    await p.screenshot({path:`${SHOTS}/sk2-flip-anon.png`}).catch(()=>{});
    out.attacks.push({class:'A payload-flip (anon)',nf,gen,back,leak,flipped});
    out.evidence.push(`A(anon): nf=${nf} generic=${gen} back=${back} leak=${leak} flips=${flipped}`);
    const v=p.video(); await ctx.close().catch(()=>{}); if(v) await v.saveAs(ctx._v).catch(()=>{});
  }
  // --- signed-in non-owner leg (fresh non-admin buyer)
  {
    const tok=await fetch(API+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:'au013sk2b@gmail.com',password:'StrongPass!1'})}).then(r=>r.json()).then(j=>j.token);
    const ctx=await b.newContext({viewport:{width:375,height:667},
      recordVideo:{dir:VDIR,size:{width:375,height:667}}});
    const p=await ctx.newPage(); ctx._v=`${VDIR}/AU-013-sk2-flip-buyer.webm`;
    await p.addInitScript(tok=>{localStorage.setItem('flutter.auth_token',JSON.stringify(tok));},'tok:'+tok.slice(0,4));
    // NOTE addInitScript arg form: use function(arg)
    await ctx.close().catch(()=>{});
    await b.close(); process.exit(3); // placeholder — will rewrite
  }
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
