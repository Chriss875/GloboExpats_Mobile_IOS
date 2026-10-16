// au013_sk2.js — SKEPTIC r5 for AU-013 (product detail hidden-guard + click tracking).
// Attacks the r4 PASS with classes the earlier passes did NOT cover.
// Frozen bundle :9112 sha 858b0ef, sandbox :8083. Evidence -> results/shards + reports.
const fs = require('fs');
const L = require('./lib_verify.js');
const APP='http://localhost:9112', API='http://localhost:8083';
const SHOTS='/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-013';
const VDIR='/home/devsystemadmin/GloboExpats_Mobile/e2e/videos';
fs.mkdirSync(SHOTS,{recursive:true}); fs.mkdirSync(VDIR,{recursive:true});
const R={ ts:new Date().toISOString(), unit:'AU-013-skeptic-r5', title:'detail_hidden_guard_tracking',
  agent:'skeptic-AU-013', build_sha:'858b0ef', app:APP, verdict:'PASS?',
  expected_mtime:'"Tue, 25 Aug 2026 08:11:40 GMT"', attacks:[], findings:[], failures:[], evidence:[] };
const log=(...a)=>console.log('[sk5]',...a);
function attack(cls,steps,observed,verdict,ev){ R.attacks.push({class:cls,steps,observed,verdict});
  if(ev) R.evidence.push(...ev.filter(Boolean));
  log(verdict, '|', cls, '|', observed);
}
async function freshCtx(b,vp,tag,init){ const ctx=await b.newContext({viewport:{width:vp[0],height:vp[1]},
    recordVideo:{dir:VDIR,size:{width:vp[0],height:vp[1]}}});
  ctx._v=`${VDIR}/AU-013-sk2-${tag}.webm`; if(init) await ctx.addInitScript(init); return ctx; }
async function closeCtx(ctx){ try{ const v=ctx.pages()[0]&&await ctx.pages()[0].video(); await ctx.close();
  if(v&&ctx._v) await v.saveAs(ctx._v).catch(()=>{});}catch(e){} }
const seedToken=(token,email)=>`window.localStorage.setItem('flutter.auth_token', JSON.stringify(${JSON.stringify(token)})); window.localStorage.setItem('flutter.auth_email', JSON.stringify(${JSON.stringify(email)}));`;
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
const nf=t=>/\bError: Product not found\b/.test(t), generic=t=>/Could not load product/.test(t);
const db=q=>require('child_process').execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -t -A -c "${q}"`).toString().trim();

(async()=>{
  // ---------- build stamp ----------
  { const h=await fetch(APP+'/main.dart.js',{method:'HEAD'});
    const lm=h.headers.get('last-modified');
    R.evidence.push(`HEAD ${APP}/main.dart.js -> ${h.status}; Last-Modified: "${lm}" (expected ${R.expected_mtime})`);
    if(lm!=='Tue, 25 Aug 2026 08:11:40 GMT'){ R.verdict='DISPUTED'; R.failures.push('build stamp mismatch '+lm); } }

  const b=await L.newBrowser();
  const adminTok=await L.apiLogin(L.BUYER);
  const me=await fetch(API+'/api/v1/userManagement/user-details',{headers:{Authorization:'Bearer '+adminTok}}).then(r=>r.json());
  const myId=Number(me.userId||me.id||0); const email=L.BUYER.email;
  R.evidence.push(`viewer id=${myId} roles=${JSON.stringify((me.roles||[]).map(r=>r.roleName))}`);

  // fresh non-admin buyer
  let buyerTok=null;
  { const em=`au013sk${Date.now()%100000}@gmail.com`;
    await fetch(API+'/api/v1/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({firstName:'SK',lastName:'Five',password:'StrongPass!1',emailAddress:em})}).catch(()=>{});
    buyerTok=await fetch(API+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:em,password:'StrongPass!1'})}).then(r=>r.json()).then(j=>j.token||null).catch(()=>null);
    R.evidence.push(`fresh non-admin buyer=${em} tokenAcquired=${!!buyerTok}`); }

  // fixture 710: public-shaped row the backend still hides (no coords/mode => deliverySetupReady:false)
  const PID=710;
  { const anon=await fetch(`${API}/api/v1/displayItem/itemDetails/${PID}`).then(r=>r.status);
    const auth=buyerTok?await fetch(`${API}/api/v1/displayItem/itemDetails/${PID}`,{headers:{Authorization:'Bearer '+buyerTok}}).then(r=>r.status):'n/a';
    R.evidence.push(`probe anon itemDetails/${PID} -> HTTP ${anon}; non-admin -> HTTP ${auth} (backend hides it itself)`); }

  // ================= A. payload-flip guard bypass =================
  await (async()=>{ try{
    let flips=0;
    const mkRoute=()=>async route=>{ const resp=await route.fetch(); let body=resp.text();
      try{const j=JSON.parse(body); j.deliverySetupReady=false; j.deliverySetupGrandfathered=false;
        j.latitude=null;j.longitude=null;j.transportModeSource=null;j.coordinatesSource=null;
        body=JSON.stringify(j);flips++;}catch(e){}
      route.fulfill({status:resp.status(),contentType:'application/json',body}); };

    const c1=await freshCtx(b,[375,667],'flip-anon'); const p1=await c1.newPage();
    await p1.route('**/displayItem/itemDetails/'+PID,mkRoute());
    let t=await openDeep(p1,PID);
    const aNF=nf(t),aGen=generic(t),aBack=await L.btn(p1,'Back to Browse').count().catch(()=>0),
          aLeak=/Add to cart|Buy now|Contact seller|WhatsApp/i.test(t);
    await L.screenshot(p1,`${SHOTS}/sk2-flip-anon.png`).catch(()=>{});
    await closeCtx(c1);

    const c2=await freshCtx(b,[375,667],'flip-buyer',seedToken(buyerTok,'au013sk@x'));
    const p2=await c2.newPage();
    await p2.route('**/displayItem/itemDetails/'+PID,mkRoute());
    let t2=await openDeep(p2,PID);
    const bNF=nf(t2),bGen=generic(t2),bBack=await L.btn(p2,'Back to Browse').count().catch(()=>0),
          bLeak=/Add to cart|Buy now|Contact seller|WhatsApp/i.test(t2);
    await L.screenshot(p2,`${SHOTS}/sk2-flip-buyer.png`).catch(()=>{});
    await closeCtx(c2);

    const ok=aNF&&!aGen&&!aLeak&&bNF&&!bGen&&!bLeak;
    attack('guard-bypass via client-side payload flip (deliverySetupReady=false injected into an otherwise-public itemDetails response)',
      `route-intercept itemDetails/${PID}: force deliverySetupReady=false + strip coords/mode; open as ANON then as fresh non-admin buyer`,
      `anon nf=${aNF} generic=${aGen} backBtns=${aBack} leak=${aLeak} || non-admin nf=${bNF} generic=${bGen} backBtns=${bBack} leak=${bLeak} || flipsApplied=${flips}`,
      ok?'HELD':'BROKEN',
      ['e2e/shots/AU-013/sk2-flip-anon.png','e2e/shots/AU-013/sk2-flip-buyer.png']);
  }catch(e){attack('payload-flip guard bypass','harness error',String(e).slice(0,200),'DISPUTED');} })();

  await b.close();
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/AU-013-skeptic-r5-partial.json', JSON.stringify(R,null,1));
})().catch(e=>{console.error('FATAL',String(e).slice(0,400));process.exit(1)});
