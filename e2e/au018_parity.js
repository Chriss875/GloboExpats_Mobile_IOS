// au018_parity.js — checklist #7: same gate flow on the Next.js reference :3000.
// CONSTRAINT (recorded): :3000 proxies to the DEV backend (:8081; totalElements=267,
// maxId~508), NOT the sandbox (:8083; 510 products incl. our AU-018 fixtures). Same-data
// parity would require writing fixtures to dev = FORBIDDEN. Parity therefore asserts the
// GATE BEHAVIOUR on the reference's own data and records the dataset delta as
// ACCEPTED-DIVERGENCE. No video here (CPU-starved box); shots are the evidence.
const fs = require('fs');
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const UNIT='AU-018';
const OUT = `/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/${UNIT}`;
const R = {asserts:[], popups:[], notes:[]};
function assert(n,c,d){ R.asserts.push({n,pass:!!c,d:d||''}); console.log(`${c?'PASS':'FAIL'}  ${n}${d?' :: '+d:''}`); }

(async()=>{
  const vp = {width: parseInt(process.argv[2]||'375'), height: parseInt(process.argv[3]||'667')};
  const V = `${vp.width}x${vp.height}`;
  const b = await L.newBrowser();
  const ctx = await b.newContext({viewport:vp});
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  const S = async st => { const f=`${OUT}/ref-${V}-${st}.png`; await L.screenshot(p,f); return f; };
  console.log(`\n##### REF ${V} #####`);

  // 1) a purchasable listing from the reference's own dataset
  let refPid=null;
  try{
    await p.goto('http://localhost:3000/browse',{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});
    await p.waitForTimeout(1500);
    const ids = await p.evaluate(async ()=>{ try{
      const r = await fetch('/api/v1/products/get-all-products?page=0&size=12',{credentials:'omit'});
      const j = await r.json(); return (j.content||[]).filter(x=>(x.productQuantity||0)>0).map(x=>String(x.productId)).slice(0,6);
    }catch(e){ return []; } });
    console.log('   ids:', JSON.stringify(ids));
    for(const id of ids){
      await p.goto(`http://localhost:3000/product/${id}`,{waitUntil:'domcontentloaded',timeout:30000}).catch(e=>console.log('   goto',id,e.message.split('\n')[0]));
      await p.waitForTimeout(2500);
      const t=await p.evaluate(()=>document.body.innerText);
      console.log(`   id=${id} len=${t.length} add=${/Add to ?Cart/i.test(t)} nf=${/Product not found|no longer available/i.test(t)}`);
      if(/Product not found|no longer available/i.test(t)) continue;
      if(!/Add to ?Cart|Buy Now/i.test(t)) continue;
      refPid=id; break;
    }
  }catch(e){ console.log('   discover err', e.message); }
  R.refPid=refPid;
  assert(`[${V}] REF renders a purchasable listing from its own dataset`, !!refPid, String(refPid));
  if(!refPid){ fs.writeFileSync('/tmp/au018_parity.json', JSON.stringify(R,null,2)); await b.close(); return; }

  // 2) SIGNED-OUT gate
  // Mobile reference: desktop Add to Cart/Buy Now are hidden (display:none); the sticky
  // bottom bar carries one visible "Buy now" — that is the purchase entry point at 375px.
  const addBtn = p.locator('button:visible', {hasText: /^(Buy now|Add to ?Cart|Buy Now)$/i}).last();
  if(await addBtn.count()){
    await addBtn.scrollIntoViewIfNeeded().catch(()=>{});
    await addBtn.click({timeout:5000, force:true}).catch(e=>console.log('   click err', e.message.split('\n')[0]));
    await p.waitForTimeout(1200);
    const body = await p.evaluate(()=>document.body.innerText);
    const loginToast = /Login Required/i.test(body);
    const popup = /Verification Required|verify your organization/i.test(body);
    R.popups.push({vp:V,state:'signedout',popup});
    assert(`[${V}] REF signed-out Add to Cart -> "Login Required" toast`, loginToast, popup?'POPUP SHOWN':'toast text absent');
    await S('signedout-loginrequired');
  } else assert(`[${V}] REF signed-out shows Add to Cart`, false);

  // 3) SIGN IN through the reference UI with its own demo creds (dev backend)
  await p.goto('http://localhost:3000/login',{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});
  await p.waitForTimeout(2000);
  const em = p.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]').first();
  const pw = p.locator('input[type="password"]').first();
  let signedIn=false, note='';
  if(await em.count() && await pw.count()){
    await em.fill(L.BUYER.email).catch(()=>{});
    await pw.fill(L.BUYER.pw).catch(()=>{});
    const lb = p.locator('button', {hasText: /^\s*(Log ?in|Sign ?in)\s*$/i}).last();
    await lb.click({timeout:4000}).catch(()=>{});
    await p.waitForTimeout(3500);
    const body = await p.evaluate(()=>document.body.innerText);
    signedIn = !/^\s*Login\s*$/.test(body) && /Logout|My Account|My Orders/.test(body);
    note = signedIn ? 'signed in via reference UI' :
      (/Invalid|incorrect|not found|failed/i.test(body) ? 'login rejected: sandbox account does not exist on the dev backend' : 'login form did not advance');
  } else note='reference has no visible email+password login inputs';
  assert(`[${V}] REF sign-in with the verifier account`, false, `NOT REPRODUCIBLE ON REFERENCE: ${note}; writing a matching account to dev is forbidden`);
  R.signedIn = signedIn;

  await S('final-'+V.replace(':',''));
  fs.writeFileSync('/tmp/au018_parity.json', JSON.stringify(R,null,2));
  console.log('\nparity:', R.asserts.filter(a=>a.pass).length+'/'+R.asserts.length);
  await b.close();
})();
