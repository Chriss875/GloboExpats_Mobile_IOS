// AU-012 FINAL verifier — forgot-password 4-stage flow on FROZEN :9108 (sha 16b9b33).
// Findings lane: RW fixtures created via REAL API; only self-created accounts mutated.
const fs=require('fs');
process.chdir('/home/devsystemadmin/GloboExpats_Mobile/e2e');
const lib=require('./lib_verify.js');
const {REF,API}=lib;
const APP='http://localhost:9108';
const {execSync}=require('child_process');
const acct=JSON.parse(fs.readFileSync('tmp_au012_account.json','utf8'));   // mobile-viewport fixture
const acct2=JSON.parse(fs.readFileSync('tmp_au012_account2.json','utf8')); // tablet-viewport fixture
const SH='e2e/shots/AU-012';
const R={checks:{},failures:[],evidence:[],nav:0,state:0,data:0,buttons:{total:0,ok:0,failed:[]},imgs:{},parity:{blocker:0,major:0,minor:0,accepted:0},vision:{}};
const dbOtp=email=>execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -tAc "select reset_password_otp from users where logging_email='${email}'"`,{encoding:'utf8'}).trim();
async function apiLogin(email,pw){const r=await fetch(`${API}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pw})});return {status:r.status,ok:r.status===200&&(await r.json().catch(()=>({}))).token};}
function watch(p){p.on('response',r=>{const u=r.url();if(/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)||/\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u))R.imgs[u]=r.status();});}

(async()=>{
 const browser=await lib.newBrowser();

 /* ============ A. MOBILE 375x667, semantics ON (canonical harness) ============ */
 const ctx=await lib.newCtx(browser,{viewport:{width:375,height:667},videoPath:'/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-012-mobile.webm'});
 const p=await ctx.newPage(); watch(p);
 const net=[];
 p.on('response',async r=>{if(r.url().includes('8083')){let b='';try{b=(await r.text()).slice(0,60);}catch(e){}net.push(r.status()+' '+r.request().method()+' '+r.url().replace(API,'')+' :: '+b);}});
 await p.goto(APP+'/#/reset-password',{waitUntil:'load',timeout:90000}).catch(()=>{});
 const t0=await lib.waitText(p,'Reset Your Password',30000);
 R.checks.stage1_renders=!!t0; if(!t0){R.failures.push('stage 1 (email) never rendered');}
 await p.waitForTimeout(1500);
 await lib.screenshot(p,`${SH}/AU-012-mobile-s1-email.png`);
 const copy=['Reset Your Password',"Enter your email address and we'll send you a verification code.",'Email','Verify OTP','New Password','Back to login'];
 const c1=await lib.allText(p);
 R.checks.stage1_copy_complete=copy.every(t=>c1.includes(t));
 copy.forEach(t=>{if(!c1.includes(t))R.failures.push('stage1 missing copy: '+t);});
 R.state++;
 // type fixture email
 const ei=p.locator('input[type="text"]').first();
 await p.waitForTimeout(4000);
 await ei.click({force:true,timeout:20000});await p.waitForTimeout(400);
 await p.keyboard.type(acct.email,{delay:30});
 await lib.screenshot(p,`${SH}/AU-012-mobile-s1-filled.png`);
 // BUTTON 1: Send Verification Code
 R.buttons.total++;
 let sent=await lib.clickBtn(p,'Send Verification Code');
 if(!sent){await p.mouse.click(187,348);sent=true;}
 let busy=false;
 for(let i=0;i<10;i++){await p.waitForTimeout(500);if(!(await lib.allText(p)).includes('Send Verification Code')){busy=true;break;}}
 R.checks.send_click_triggers_busy=busy;
 if(!busy)R.buttons.failed.push('Send Verification Code (no busy state)');
 else R.buttons.ok++;
 // expected effect: advance to stage 2
 let otpStage=false;
 for(let i=0;i<20;i++){otpStage=await lib.waitText(p,'Enter the 6-digit code we sent to',1000);if(otpStage)break;}
 R.checks.stage2_reached=false; // recorded definitively below
 await p.waitForTimeout(2500);
 otpStage=otpStage||await lib.waitText(p,'Enter the 6-digit code we sent to',1000);
 R.checks.stage2_reached=otpStage;
 R.nav++;
 if(!otpStage){
   R.failures.push(`STAGE 1->2 BROKEN: POST reset-passwordEmail returned ${net.find(n=>n.includes('reset-passwordEmail'))||'NO CALL'} but UI stayed on email stage (new-password stage unreachable)`);
   // capture the swallowed error snackbar in a NO-semantics twin context
   const c2=await browser.newContext({viewport:{width:375,height:667}});
   const pn=await c2.newPage();
   await pn.goto(APP+'/#/reset-password',{waitUntil:'load',timeout:90000}).catch(()=>{});
   await pn.waitForTimeout(9000);
   const ein=p.locator('input').first();
   await ein.click({force:true});await pn.keyboard.type(acct.email,{delay:20});
   const sb=pn.locator('flt-semantics[role="button"]',{hasText:'Send Verification Code'}).first();
   await sb.click({timeout:5000}).catch(()=>pn.mouse.click(187,348));
   let snack=null;
   for(let i=0;i<48;i++){await pn.waitForTimeout(250);const t=await pn.evaluate(()=>document.body.innerText||'');const m=t.match(/Failed to send OTP[^\n]*|OTP Sent!/);if(m){snack=m[0];break;}}
   R.checks.swallowed_error_message=snack;
   if(snack)R.failures.push('user-visible failure: "'+snack+'" shown although backend answered 200 (plain-text body breaks jsonDecode in ApiClient.forgotPassword)');
   await lib.screenshot(pn,`${SH}/AU-012-mobile-s1-error-snackbar.png`);
   await c2.close();
 } else {
   R.data++;
 }
 await lib.screenshot(p,`${SH}/AU-012-mobile-stuck-stage1.png`);

 /* ---- ROOT-CAUSE CONTROL EXPERIMENT (diagnostic, not a pass claim):
        rewrite the same response to JSON in flight -> flow advances ---- */
 {
  const cx=await browser.newContext({viewport:{width:375,height:667}});
  const pc=await cx.newPage();
  let rewrote=false;
  await pc.route('**/api/v1/userManagement/reset-passwordEmail*',async route=>{
    const resp=await route.fetch();const body=await resp.text();rewrote=true;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({message:body.trim()})});
  });
  await pc.goto(APP+'/#/reset-password',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(pc,'Reset Your Password',30000);
  await pc.waitForTimeout(1200);
  const em=`au012.ctrl.${Date.now()}@gmail.com`;
  await fetch(`${API}/api/v1/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:'C',lastName:'T',password:'CtrlOld!1',emailAddress:em})});
  const e2=pc.locator('input[type="text"]').first();
  await pc.waitForTimeout(4000);
  await e2.click({force:true,timeout:20000});await pc.keyboard.type(em,{delay:20});
  const s2=pc.locator('flt-semantics[role="button"]',{hasText:'Send Verification Code'}).first();
  await s2.click({timeout:5000});
  let ok2=false;
  for(let i=0;i<20;i++){ok2=await lib.waitText(pc,'Enter the 6-digit code we sent to',1000);if(ok2)break;}
  R.checks.control_json_rewrite_reaches_stage2=ok2&&rewrote;
  await lib.screenshot(pc,`${SH}/AU-012-control-jsonrewrite-reaches-stage2.png`);
  await cx.close();
 }

 /* ============ B. TABLET 768x1024 with fixture #2 ============ */
 const ctxT=await lib.newCtx(browser,{viewport:{width:768,height:1024}});
 const q=await ctxT.newPage();watch(q);
 const netT=[];
 q.on('response',async r=>{if(r.url().includes('8083')){let b='';try{b=(await r.text()).slice(0,60);}catch(e){}netT.push(r.status()+' '+r.request().method()+' '+r.url().replace(API,'')+' :: '+b);}});
 await q.goto(APP+'/#/reset-password',{waitUntil:'load',timeout:90000}).catch(()=>{});
 const tt=await lib.waitText(q,'Reset Your Password',30000);
 R.checks.tablet_stage1_renders=!!tt;
 await q.waitForTimeout(1500);
 await lib.screenshot(q,`${SH}/AU-012-tablet-s1-email.png`);
 const eq=q.locator('input[type="text"]').first();
 await q.waitForTimeout(4000);
 await eq.click({force:true,timeout:20000});await q.keyboard.type(acct2.email,{delay:25});
 await lib.screenshot(q,`${SH}/AU-012-tablet-s1-filled.png`);
 R.buttons.total++;
 const st=q.locator('flt-semantics[role="button"]',{hasText:'Send Verification Code'}).first();
 const cs=await st.click({timeout:8000}).then(()=>true).catch(()=>false);
 if(!cs){await q.mouse.click(383,348);}
 let busyT=false;
 for(let i=0;i<10;i++){await q.waitForTimeout(500);if(!(await lib.allText(q)).includes('Send Verification Code')){busyT=true;break;}}
 if(busyT)R.buttons.ok++;else R.buttons.failed.push('tablet Send Verification Code');
 let otpT=false;
 for(let i=0;i<20;i++){otpT=await lib.waitText(q,'Enter the 6-digit code we sent to',1000);if(otpT)break;}
 R.checks.tablet_stage2_reached=otpT;
 R.nav++;
 if(!otpT)R.failures.push('TABLET: stage 1->2 broken identically; net='+JSON.stringify(netT.slice(-2)));
 await lib.screenshot(q,`${SH}/AU-012-tablet-stuck-stage1.png`);
 await lib.closeVideo(ctxT,null).catch(()=>{});

 /* ============ C. REFERENCE PARITY — same flow on :3000 at 375x667 ============ */
 {
  const cr=await browser.newContext({viewport:{width:375,height:667}});
  const pr=await cr.newPage();
  const refNet=[];
  pr.on('response',r=>{if(r.url().includes('reset-passwordEmail'))refNet.push(r.status());});
  await pr.goto(REF+'/reset-password',{waitUntil:'domcontentloaded',timeout:90000}).catch(e=>console.log('ref goto',e.message));
  await pr.waitForTimeout(6000);
  await lib.screenshot(pr,`${SH}/AU-012-ref-mobile-reset-password.png`);
  const refHasForm=(await pr.evaluate(()=>document.body.innerText)).includes('Reset');
  R.checks.ref_page_loads=refHasForm;
  // drive it: email input + submit
  const inp=pr.locator('input').first();
  await inp.click({force:true}).catch(()=>{});
  await pr.keyboard.type(acct.email,{delay:20});
  const btn=pr.locator('button',{hasText:/Send|Continue/i}).first();
  await btn.click({timeout:8000}).catch(()=>pr.keyboard.press('Enter'));
  let refOtp=false;
  for(let i=0;i<16;i++){await pr.waitForTimeout(1000);
    const t=await pr.evaluate(()=>document.body.innerText||'');
    if(/verify|code|otp/i.test(t)&&refNet.length){refOtp=true;break;}
    if(/failed|error/i.test(t)&&refNet.length===0)break;}
  R.checks.ref_advance_after_send=refOtp;
  R.checks.ref_send_status=refNet[0]||null;
  await pr.waitForTimeout(800);
  await lib.screenshot(pr,`${SH}/AU-012-ref-mobile-after-send.png`);
  if(refOtp&&refNet[0]===200){R.parity.blocker++;R.parity.blockerDetail='reference advances past email stage on identical sandbox data; mobile build stays stuck';}
  await cr.close();
 }

 /* ============ D. API TRUTH CHAIN on fixture #1 (backend works; isolate client bug) ==== */
 {
  // request OTP for acct1 via raw API, read it from DB, set NEW password, prove login flip
  const r1=await fetch(`${API}/api/v1/userManagement/reset-passwordEmail?email=${encodeURIComponent(acct.email)}`,{method:'POST'});
  const o=dbOtp(acct.email);
  const v=await fetch(`${API}/api/v1/userManagement/verify-otp?loggingEmail=${encodeURIComponent(acct.email)}&otp=${o}`,{method:'POST'});
  const vb=await v.text();
  const np=await fetch(`${API}/api/v1/userManagement/new-password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({loggingEmail:acct.email,newPassword:'Au012New!pass9'})});
  const nb=await np.text();
  const lnew=await apiLogin(acct.email,'Au012New!pass9');
  const lold=await apiLogin(acct.email,acct.oldPw);
  R.checks.api_chain_status={send:r1.status,verify:v.status+':'+vb.trim(),newpw:np.status+':'+nb.trim()};
  R.checks.api_login_with_NEW_password=lnew.ok;
  R.checks.api_OLD_password_rejected=!lold.ok&&lold.status===401;
  R.data+=2;
  if(!lnew.ok)R.failures.push('API: login with NEW password failed ('+lnew.status+')');
  if(lold.ok)R.failures.push('API: OLD password still accepted!');
  // also flip acct2 so both fixtures end in a known state
  await fetch(`${API}/api/v1/userManagement/reset-passwordEmail?email=${encodeURIComponent(acct2.email)}`,{method:'POST'});
  const o2=dbOtp(acct2.email);
  await fetch(`${API}/api/v1/userManagement/verify-otp?loggingEmail=${encodeURIComponent(acct2.email)}&otp=${o2}`,{method:'POST'});
  await fetch(`${API}/api/v1/userManagement/new-password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({loggingEmail:acct2.email,newPassword:'Au012Tab!new77'})});
  const lt=await apiLogin(acct2.email,'Au012Tab!new77');
  const lot=await apiLogin(acct2.email,acct2.oldPw);
  R.checks.acct2_new_pw_login=lt.ok;R.checks.acct2_old_pw_rejected=!lot.ok;
  if(!lt.ok)R.failures.push('acct2 new-pw login failed');
  if(lot.ok)R.failures.push('acct2 old-pw still works');
 }

 /* ============ E. DEEP LINK check (path vs hash router) ==== */
 {
  const cd=await browser.newContext({viewport:{width:375,height:667}});
  const pd=await cd.newPage();
  const resp=await pd.goto(APP+'/reset-password',{waitUntil:'load',timeout:60000}).catch(()=>null);
  R.checks.deeplink_path_status=resp?resp.status():null;
  if(R.checks.deeplink_path_status!==200){R.parity.minor++;R.parityMinor='direct path /reset-password 404s on static host (hash /#/reset-password required); web reference serves the path directly';}
  await cd.close();
 }

 R.checks.images_requested=Object.values(R.imgs).length;
 R.checks.images_200=Object.values(R.imgs).filter(s=>s===200||s===304).length;
 R.checks.images_broken=Object.entries(R.imgs).filter(([,v])=>v>=400).map(([k,v])=>v+' '+k);
 R.checks.network_log_mobile=net;
 fs.writeFileSync('tmp_AU-012_final_results.json',JSON.stringify(R,null,1));
 console.log(JSON.stringify(R.checks,null,1));
 console.log('FAILURES:',JSON.stringify(R.failures,null,1));
 console.log('BUTTONS:',JSON.stringify(R.buttons));
 await lib.closeVideo(ctx,'e2e/videos/AU-012-mobile.webm').catch(()=>{});
 await browser.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
