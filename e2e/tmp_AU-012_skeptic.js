// AU-012 skeptic — attack the verifier's FAIL conclusion (6+ attacks).
const fs=require('fs'); process.chdir('/home/devsystemadmin/GloboExpats_Mobile/e2e');
const lib=require('./lib_verify.js');
const {API}=lib; const APP='http://localhost:9108';
const {execSync}=require('child_process');
const F=[];
const dbOtp=e=>execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -tAc "select reset_password_otp from users where logging_email='${e}'"`,{encoding:'utf8'}).trim();
(async()=>{
 const b=await lib.newBrowser();

 // ATTACK 1: wrong-OTP path — does the UI surface the body-level rejection?
 {
  const c=await b.newContext({viewport:{width:375,height:667}}); const p=await c.newPage();
  let rewrote=false;
  await p.route('**/api/v1/userManagement/reset-passwordEmail*',async r=>{const resp=await r.fetch();const t=await resp.text();rewrote=true;
    await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({message:t.trim()})});});
  await p.goto(APP+'/#/reset-password',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Reset Your Password',30000); await p.waitForTimeout(5000);
  const em=`au012.sk1.${Date.now()}@gmail.com`;
  await fetch(`${API}/api/v1/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:'S',lastName:'K',password:'SkOld!123',emailAddress:em})});
  const ei=p.locator('input[type="text"]').first();
  await ei.click({force:true}); await p.keyboard.type(em,{delay:20});
  await p.locator('flt-semantics[role="button"]',{hasText:'Send Verification Code'}).first().click({timeout:8000});
  let s2=false; for(let i=0;i<20;i++){s2=await lib.waitText(p,'Enter the 6-digit code we sent to',1000); if(s2)break;}
  console.log('A1 stage2 reached:',s2);
  const otp=dbOtp(em);
  const oi=p.locator('input').first();
  await oi.click({force:true}); await p.keyboard.type('000000');
  await lib.clickBtn(p,'Verify Code');
  let rej=false;
  for(let i=0;i<30;i++){rej=await lib.waitText(p,'Invalid or expired OTP',1000); if(rej)break;}
  console.log('A1 WRONG OTP surfaced as rejection:',rej, '| stayed on otp stage:', (await lib.allText(p)).includes('Enter the 6-digit'));
  if(!rej)F.push({class:'wrong-otp-feedback',result:'broken',detail:'wrong OTP did not surface "Invalid or expired OTP"',evidence:'tmp_AU-012_skeptic_out.txt'});
  else F.push({class:'wrong-otp-feedback',result:'held',detail:'wrong OTP rejected with message + stays on stage',evidence:'tmp_AU-012_skeptic_out.txt'});
  await lib.screenshot(p,'shots/AU-012/AU-012-skeptic-wrongotp.png');
  await c.close();
 }

 // ATTACK 2: resend rotates OTP in DB (real effect)
 {
  const em=`au012.sk2.${Date.now()}@gmail.com`;
  await fetch(`${API}/api/v1/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:'S',lastName:'K2',password:'SkOld!456',emailAddress:em})});
  await fetch(`${API}/api/v1/userManagement/reset-passwordEmail?email=${encodeURIComponent(em)}`,{method:'POST'});
  const o1=dbOtp(em);
  await fetch(`${API}/api/v1/userManagement/reset-passwordEmail?email=${encodeURIComponent(em)}`,{method:'POST'});
  const o2=dbOtp(em);
  console.log('A2 resend rotated OTP:', o1!==o2, `(${o1} -> ${o2})`);
  F.push(o1!==o2?{class:'otp-rotation',result:'held',detail:`resend rotates code ${o1}->${o2}`,evidence:'tmp_AU-012_skeptic_out.txt'}
                :{class:'otp-rotation',result:'broken',detail:'OTP did not rotate on resend',evidence:''});
 }

 // ATTACK 3: new-password validation — short pw rejected CLIENT-side before any API call
 {
  const c=await b.newContext({viewport:{width:375,height:667}}); const p=await c.newPage();
  let npwCalled=0;
  await p.route('**/api/v1/userManagement/new-password*',async r=>{npwCalled++;return r.fulfill({status:200,contentType:'application/json',body:'"Password reset successfully"'});});
  let rewrote=false;
  await p.route('**/api/v1/userManagement/reset-passwordEmail*',async r=>{const resp=await r.fetch();const t=await resp.text();rewrote=true;
    await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({message:t.trim()})});});
  await p.goto(APP+'/#/reset-password',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Reset Your Password',30000); await p.waitForTimeout(5000);
  const em=`au012.sk3.${Date.now()}@gmail.com`;
  await fetch(`${API}/api/v1/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:'S',lastName:'K3',password:'SkOld!789',emailAddress:em})});
  const ei=p.locator('input[type="text"]').first();
  await ei.click({force:true}); await p.keyboard.type(em,{delay:20});
  await p.locator('flt-semantics[role="button"]',{hasText:'Send Verification Code'}).first().click({timeout:8000});
  let s2=false; for(let i=0;i<20;i++){s2=await lib.waitText(p,'Enter the 6-digit code we sent to',1000); if(s2)break;}
  const otp=dbOtp(em);
  await p.locator('input').first().click({force:true}); await p.keyboard.type(otp);
  await lib.clickBtn(p,'Verify Code');
  let s3=false; for(let i=0;i<15;i++){s3=await lib.waitText(p,'Create a strong password',1000); if(s3)break;}
  console.log('A3 reached password stage:',s3);
  if(s3){
    await p.waitForTimeout(3000);
    let pi=null, ci=null;
    for(let w=0;w<20;w++){
      if(await p.locator('input[type="password"]').count()>=2){ pi=p.locator('input[type="password"]').nth(0); ci=p.locator('input[type="password"]').nth(1); break; }
      if(await p.locator('input').count()>=2){ pi=p.locator('input').nth(0); ci=p.locator('input').nth(1); break; }
      await p.waitForTimeout(500);
    }
    console.log('A3 field types found:', pi? 'yes':'no');
    await pi.click({force:true}); await p.keyboard.type('Ab1!');
    await ci.click({force:true}); await p.keyboard.type('Ab1!');
    await lib.clickBtn(p,'Reset Password');
    const shortRej=await lib.waitText(p,'at least 6 characters',6000);
    console.log('A3 short-pw rejected client-side:',shortRej,'| new-password API calls while invalid:',npwCalled);
    if(!shortRej||npwCalled>0)F.push({class:'pw-validation',result:'broken',detail:`short pw not blocked (${shortRej}, apiCalls=${npwCalled})`,evidence:''});
    else F.push({class:'pw-validation',result:'held',detail:'short pw rejected with zero new-password API calls',evidence:'shots/AU-012/AU-012-skeptic-shortpw.png'});
    await lib.screenshot(p,'shots/AU-012/AU-012-skeptic-shortpw.png');
    // mismatch guard
    await ci.click({force:true}); await p.keyboard.press('Control+a'); await p.keyboard.type('Different9!');
    await lib.clickBtn(p,'Reset Password');
    const mis=await lib.waitText(p,'Passwords do not match',6000);
    console.log('A3 mismatch rejected:',mis,'| cumulative new-password calls:',npwCalled);
    F.push(mis&&npwCalled===0?{class:'pw-mismatch',result:'held',detail:'mismatch rejected client-side',evidence:''}
                             :{class:'pw-mismatch',result:'broken',detail:'mismatch guard leak',evidence:''});
    // NOW valid submit -> success + REAL password flip proven by API login
    await pi.click({force:true}); await p.waitForTimeout(200); await p.keyboard.press('Control+a'); await p.keyboard.type('SkNew!pass99');
    await ci.click({force:true}); await p.waitForTimeout(200); await p.keyboard.press('Control+a'); await p.keyboard.type('SkNew!pass99');
    await lib.clickBtn(p,'Reset Password');
    let succ=false; for(let i=0;i<15;i++){succ=await lib.waitText(p,'Password Reset!',1000); if(succ)break;}
    console.log('A3 success stage:',succ);
    const ln=await fetch(`${API}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,password:'SkNew!pass99'})});
    const lo=await fetch(`${API}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,password:'SkOld!789'})});
    console.log('A3 API login NEW pw:',ln.status,'| OLD pw:',lo.status);
    F.push(succ&&ln.status===200&&lo.status===401?{class:'end-to-end-reset',result:'held',detail:'UI flow flips credential: NEW pw 200, OLD pw 401',evidence:'shots/AU-012/AU-012-skeptic-success.png'}
                                                 :{class:'end-to-end-reset',result:'broken',detail:`succ=${succ} new=${ln.status} old=${lo.status}`,evidence:''});
    await lib.screenshot(p,'shots/AU-012/AU-012-skeptic-success.png');
  } else F.push({class:'flow-reachability',result:'broken',detail:'password stage unreachable even with JSON rewrite + valid OTP',evidence:''});
  await c.close();
 }

 // ATTACK 4: expired/unset OTP handling via API truth probe
 {
  const em=`au012.sk4.${Date.now()}@gmail.com`;
  await fetch(`${API}/api/v1/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:'S',lastName:'K4',password:'SkOld!000',emailAddress:em})});
  const v=await fetch(`${API}/api/v1/userManagement/verify-otp?loggingEmail=${encodeURIComponent(em)}&otp=999999`,{method:'POST'});
  const vb=await v.text();
  console.log('A4 verify without requesting OTP -> ',v.status,vb.trim());
  F.push({class:'otp-absent-guard',result:v.text&&vb.includes('already')?'info':'info',detail:`verify-otp w/o request answers "${vb.trim()}" (backend semantics; UI mirrors body)`,evidence:'tmp_AU-012_skeptic_out.txt'});
 }

 // ATTACK 5: unknown email at stage1 — UI must NOT advance
 {
  const c=await b.newContext({viewport:{width:375,height:667}}); const p=await c.newPage();
  await p.goto(APP+'/#/reset-password',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Reset Your Password',30000); await p.waitForTimeout(5000);
  const ghost=`au012.ghost.${Date.now()}@gmail.com`;
  const ei=p.locator('input[type="text"]').first();
  await ei.click({force:true}); await p.keyboard.type(ghost,{delay:20});
  await p.locator('flt-semantics[role="button"]',{hasText:'Send Verification Code'}).first().click({timeout:8000});
  let err=false;
  for(let i=0;i<30;i++){err=await lib.waitText(p,'No account found',1000); if(err)break;}
  const stillStage1=(await lib.allText(p)).includes('Reset Your Password');
  console.log('A5 unknown email surfaced:',err,'| stays on stage1:',stillStage1);
  F.push(err&&stillStage1?{class:'unknown-email',result:'held',detail:'unknown email shows "No account found..." and blocks progression',evidence:'shots/AU-012/AU-012-skeptic-ghost.png'}
                         :{class:'unknown-email',result:'broken',detail:`err=${err} stays=${stillStage1}`,evidence:''});
  await lib.screenshot(p,'shots/AU-012/AU-012-skeptic-ghost.png');
  await c.close();
 }

 // ATTACK 6: reference parity — web :3000 DOES advance past email on same backend?
 {
  const c=await b.newContext({viewport:{width:375,height:667}}); const p=await c.newPage();
  const em=`au012.sk6.${Date.now()}@gmail.com`;
  await fetch(`${API}/api/v1/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:'S',lastName:'K6',password:'RefOld!11',emailAddress:em})});
  const net=[];
  p.on('response',r=>{if(r.url().includes('reset-passwordEmail'))net.push(r.status());});
  await p.goto('http://localhost:3000/reset-password',{waitUntil:'domcontentloaded',timeout:90000}).catch(e=>console.log('ref goto fail'));
  await p.waitForTimeout(7000);
  const inp=p.locator('input').first();
  await inp.click({force:true}).catch(()=>{});
  await p.keyboard.type(em,{delay:20});
  const btn=p.locator('button',{hasText:/Send|Continue|Next/i}).first();
  const clicked=await btn.click({timeout:8000}).then(()=>true).catch(()=>false);
  if(!clicked){ await p.keyboard.press('Enter'); }
  let adv=false;
  for(let i=0;i<16;i++){await p.waitForTimeout(1000);
    const t=await p.evaluate(()=>document.body.innerText||'');
    if(/code|otp/i.test(t)&&net.length){adv=true;break;}
    if(/failed|error/i.test(t)&&net.length)break;}
  const txt=await p.evaluate(()=>document.body.innerText||'');
  const stuck=/Reset Your Password/i.test(txt)&&!/code sent|enter the code|verification code/i.test(txt.replace(/Reset Your Password/gi,''));
  console.log('A6 REF send status:',JSON.stringify(net),'advanced:',adv,'| ref text head:',txt.replace(/\n+/g,' | ').slice(0,180));
  F.push(net[0]===200&&adv?{class:'parity-ref-vs-mobile',result:'broken-for-mobile',detail:'reference advances past email on identical sandbox data+viewport while mobile build cannot',evidence:'shots/AU-012/AU-012-ref-parity-attack.png'}
                          :{class:'parity-ref-vs-mobile',result:'ref-also-blocked',detail:`ref status=${net[0]||'none'} adv=${adv}`,evidence:'shots/AU-012/AU-012-ref-parity-attack.png'});
  await lib.screenshot(p,'shots/AU-012/AU-012-ref-parity-attack.png');
  await c.close();
 }
 fs.writeFileSync('tmp_AU-012_skeptic_results.json',JSON.stringify(F,null,1));
 console.log('FINDINGS:',JSON.stringify(F,null,1));
 await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
