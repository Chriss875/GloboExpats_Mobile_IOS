// Isolate skeptic A3: after success stage, does the DB password actually change?
const fs=require('fs'); process.chdir('/home/devsystemadmin/GloboExpats_Mobile/e2e');
const lib=require('./lib_verify.js'); const {API}=lib; const APP='http://localhost:9108';
const {execSync}=require('child_process');
const dbPwHash=e=>execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -tAc "select substring(password,1,20) from users where logging_email='${e}'"`,{encoding:'utf8'}).trim();
(async()=>{
 const b=await lib.newBrowser();
 const c=await b.newContext({viewport:{width:375,height:667}}); const p=await c.newPage();
 let rewrote=false;
 await p.route('**/api/v1/userManagement/reset-passwordEmail*',async r=>{const resp=await r.fetch();const t=await resp.text();rewrote=true;
   await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({message:t.trim()})});});
 await p.goto(APP+'/#/reset-password',{waitUntil:'load',timeout:90000}).catch(()=>{});
 await lib.waitText(p,'Reset Your Password',30000); await p.waitForTimeout(5000);
 const em=`au012.iso.${Date.now()}@gmail.com`;
 const oldPw='IsoOld!1234';
 await fetch(`${API}/api/v1/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:'I',lastName:'S',password:oldPw,emailAddress:em})});
 const hashBefore=dbPwHash(em);
 console.log('hash before:', hashBefore);
 const ei=p.locator('input[type="text"]').first();
 await ei.click({force:true}); await p.keyboard.type(em,{delay:20});
 await p.locator('flt-semantics[role="button"]',{hasText:'Send Verification Code'}).first().click({timeout:8000});
 let s2=false; for(let i=0;i<20;i++){s2=await lib.waitText(p,'Enter the 6-digit code we sent to',1000); if(s2)break;}
 const otp=execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -tAc "select reset_password_otp from users where logging_email='${em}'"`,{encoding:'utf8'}).trim();
 await p.locator('input').first().click({force:true}); await p.keyboard.type(otp);
 await lib.clickBtn(p,'Verify Code');
 let s3=false; for(let i=0;i<15;i++){s3=await lib.waitText(p,'Create a strong password',1000); if(s3)break;}
 console.log('stage3:',s3);
 // fill new pw
 let pi=null,ci=null;
 for(let w=0;w<24;w++){ if(await p.locator('input').count()>=2){pi=p.locator('input').nth(0);ci=p.locator('input').nth(1);break;} await p.waitForTimeout(500);} 
 await pi.click({force:true}); await p.waitForTimeout(300); await p.keyboard.type('IsoNew!pass99',{delay:40});
 await ci.click({force:true}); await p.waitForTimeout(300); await p.keyboard.type('IsoNew!pass99',{delay:40});
 // verify what the fields contain via semantics
 const t=(await lib.allText(p));
 console.log('fields show dots?', t.includes('•'), '| text sample:', t.slice(-120).replace(/\n+/g,'|'));
 await lib.clickBtn(p,'Reset Password');
 let succ=false; for(let i=0;i<15;i++){succ=await lib.waitText(p,'Password Reset!',1000); if(succ)break;}
 console.log('success stage:', succ);
 const hashAfter=dbPwHash(em);
 console.log('hash after :', hashAfter, '| CHANGED:', hashBefore!==hashAfter);
 const ln=await fetch(`${API}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,password:'IsoNew!pass99'})});
 const lo=await fetch(`${API}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,password:oldPw})});
 console.log('login NEW:',ln.status,'| login OLD:',lo.status);
 await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
