// A3-mismatch isolate: JSON-rewritten flow, mismatch confirm -> expect "Passwords do not match"
const fs=require('fs'); process.chdir('/home/devsystemadmin/GloboExpats_Mobile/e2e');
const lib=require('./lib_verify.js'); const {API}=lib; const APP='http://localhost:9108';
const {execSync}=require('child_process');
(async()=>{
 const b=await lib.newBrowser();
 const c=await b.newContext({viewport:{width:375,height:667}}); const p=await c.newPage();
 let rewrote=false;
 await p.route('**/api/v1/userManagement/reset-passwordEmail*',async r=>{const resp=await r.fetch();const t=await resp.text();rewrote=true;
   await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({message:t.trim()})});});
 await p.goto(APP+'/#/reset-password',{waitUntil:'load',timeout:90000}).catch(()=>{});
 await lib.waitText(p,'Reset Your Password',30000); await p.waitForTimeout(5000);
 const em=`au012.mis.${Date.now()}@gmail.com`;
 await fetch(`${API}/api/v1/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:'M',lastName:'S',password:'MisOld!111',emailAddress:em})});
 await p.locator('input[type="text"]').first().click({force:true}); await p.keyboard.type(em,{delay:20});
 await p.locator('flt-semantics[role="button"]',{hasText:'Send Verification Code'}).first().click({timeout:8000});
 for(let i=0;i<20;i++){ if(await lib.waitText(p,'Enter the 6-digit code we sent to',1000))break; }
 const otp=execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -tAc "select reset_password_otp from users where logging_email='${em}'"`,{encoding:'utf8'}).trim();
 await p.locator('input').first().click({force:true}); await p.keyboard.type(otp);
 await lib.clickBtn(p,'Verify Code');
 for(let i=0;i<15;i++){ if(await lib.waitText(p,'Create a strong password',1000))break; }
 await p.waitForTimeout(2000);
 console.log('inputs:',await p.locator('input').count(),'pw inputs:',await p.locator('input[type="password"]').count());
 // type into first field only
 const f0=p.locator('input').nth(0), f1=p.locator('input').nth(1);
 await f0.click({force:true}); await p.waitForTimeout(250); await p.keyboard.type('Mismatch!22',{delay:40});
 await f1.click({force:true}); await p.waitForTimeout(250); await p.keyboard.type('Different33',{delay:40});
 await lib.clickBtn(p,'Reset Password');
 let msg=null;
 for(let i=0;i<40;i++){ await p.waitForTimeout(250);
   const t=await p.evaluate(()=>document.body.innerText||'');
   const m=t.match(/Passwords do not match[^\n]*/);
   if(m){msg=m[0]+' @'+((i+1)*0.25)+'s';break;} }
 console.log('mismatch msg:',msg??'NONE');
 await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
