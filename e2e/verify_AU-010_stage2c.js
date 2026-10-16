// AU-010 stage 2c: desktop funnel via recovery path (Change Email remounts clean boxes).
// Documents overwrite-defect separately; funnel completed without touching corrupted boxes.
const lib = require('./lib_verify');
const { execSync } = require('child_process');
const ep4 = String(Math.floor(Date.now()/1000));
const E_D = `campaign.au010.${ep4}d@mail.com`;
const PW='StrongPass!1';
const SHOTS='e2e/shots/AU-010';
const fails=[]; const navAsserts=[]; const stateAsserts=[]; const dataAsserts=[];
const btnTotal=new Map(); const netlog=[];
function mark(l,ok){ btnTotal.set(l,!!ok); if(!ok) fails.push(`button[${l}] no asserted effect`); }
function otpFor(email){ const esc=email.replace(/'/g,"''");
 return execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -t -A -c "select otp from users where logging_email='${esc}'"`).toString().trim()||null; }
async function typeInto(page,loc,text){
 for(let a=0;a<3;a++){ await loc.click({force:true}).catch(()=>{}); await page.waitForTimeout(250);
  if(a>0){ await page.keyboard.press('Control+a'); await page.waitForTimeout(150); }
  await page.keyboard.type(text,{delay:40});
  const v=await page.evaluate(()=>{const els=[...document.querySelectorAll('input')];return els.length?els.map(e=>e.value):null;});
  if(v&&v.includes(text))return true; await page.waitForTimeout(300);} return false; }
async function fillCode(page,code){
 const di=page.locator('input:not([type=password])');
 for(let i=0;i<6;i++){
   let done=false;
   for(let a=0;a<3&&!done;a++){
     await di.nth(i).click({force:true}).catch(()=>{}); await page.waitForTimeout(250);
     await page.keyboard.press('Digit'+code[i]); await page.waitForTimeout(300);
     const vals=await page.evaluate(()=>[...document.querySelectorAll('input')].map(e=>e.value));
     done = vals.slice(0,i+1).join('')===code.slice(0,i+1);
   }
   if(!done) return false;
 }
 return true; }
(async()=>{
 const browser=await lib.newBrowser();
 const ctxD=await lib.newCtx(browser,{viewport:{width:768,height:1024},videoPath:'e2e/videos/AU-010-desktop.webm'});
 const q=await ctxD.newPage();
 q.on('response',r=>{const u=r.url(); if(/:8083\/api\//.test(u)) netlog.push(`${r.request().method()} ${u.replace('http://localhost:8083','').slice(0,60)} -> ${r.status()}`);});
 await q.goto('http://localhost:9108',{waitUntil:'load',timeout:90000});
 await lib.waitText(q,'Buy now',30000);
 await lib.clickBtn(q,'Login'); await lib.waitText(q,'Welcome back',20000);
 await lib.clickBtn(q,'New here? Create an account');
 const dReg=await lib.waitText(q,'Create Your Account',20000);
 navAsserts.push(['desktop: register reachable', dReg]);
 // empty-submit validation
 await lib.clickBtn(q,'Continue'); await q.waitForTimeout(700);
 const valTxt=await lib.allText(q);
 stateAsserts.push(['desktop empty-submit validation shown', valTxt.includes('Required')&&valTxt.includes('Enter your email')]);
 if(!(valTxt.includes('Required')&&valTxt.includes('Enter your email'))) fails.push('desktop empty-submit no validation');
 await typeInto(q,q.locator('input[type="text"]').nth(0),'Dee');
 await typeInto(q,q.locator('input[type="text"]').nth(1),'Ten');
 const dOk=await typeInto(q,q.locator('input[type="text"]').nth(2),E_D);
 stateAsserts.push(['desktop email typed & verified via DOM',dOk]); if(!dOk) fails.push('desktop email lost keystrokes');
 await lib.screenshot(q,`${SHOTS}/au010-d-s1-info.png`);
 await lib.clickBtn(q,'Continue');
 const dS2=await lib.waitText(q,'Verify Your Email',25000);
 mark('Continue(desktop)',dS2); if(!dS2) fails.push('desktop stuck at step1');
 let dOtp=null;
 for(let i=0;i<10&&!dOtp;i++){ await q.waitForTimeout(500); dOtp=otpFor(E_D); }
 dataAsserts.push(['send-signup-Otp 202 (desktop)', netlog.some(l=>l.includes('/send-signup-Otp')&&l.includes('-> 202'))]);
 dataAsserts.push(['OTP stored for desktop account', !!dOtp]); if(!dOtp) fails.push('no desktop OTP stored');
 await lib.screenshot(q,`${SHOTS}/au010-d-s2-otp.png`);
 // WRONG code on fresh boxes -> rejection
 let bad='000000'; if(bad===dOtp) bad='000001';
 const badFilled=await fillCode(q,bad);
 let adv=false; for(let i=0;i<12&&!adv;i++){ await q.waitForTimeout(1000); adv=(await lib.allText(q)).includes('Complete Security'); }
 const tWrong=await lib.allText(q);
 const wrongRej=!adv && tWrong.includes('Wrong OTP');
 mark('wrong OTP rejected(desktop)', badFilled&&wrongRej);
 stateAsserts.push(['desktop wrong-OTP rejected (400 + Wrong OTP, stays on step2)',wrongRej]);
 if(!badFilled) fails.push('desktop wrong code could not be typed');
 if(!wrongRej) fails.push(`desktop wrong code not rejected (adv=${adv})`);
 dataAsserts.push(['verify-signup-otp 400 on wrong code (desktop)', netlog.some(l=>l.includes('/verify-signup-otp')&&l.includes('-> 400'))]);
 await lib.screenshot(q,`${SHOTS}/au010-d-s2-wrong.png`);
 // RECOVERY PATH: Change Email -> step1 -> Continue -> clean boxes -> correct code
 const chOk=await lib.clickBtn(q,'Change Email'); await q.waitForTimeout(600);
 const backToInfo=(await lib.allText(q)).includes('Create Your Account');
 mark('Change Email(desktop)',chOk&&backToInfo);
 stateAsserts.push(['Change Email returns to step 1 (recovery entry point)',backToInfo]);
 if(!(chOk&&backToInfo)) fails.push('Change Email no effect');
 await lib.screenshot(q,`${SHOTS}/au010-d-s2-change-email.png`);
 await typeInto(q,q.locator('input[type="text"]').nth(2),E_D); // email persists but re-verify
 await lib.clickBtn(q,'Continue');
 const s2again=await lib.waitText(q,'Verify Your Email',20000);
 if(!s2again) fails.push('re-forward to step2 failed');
 const boxCount=await q.locator('input:not([type=password])').count();
 const emptyVals=await q.evaluate(()=>[...document.querySelectorAll('input')].map(e=>e.value).join(''));
 stateAsserts.push([`OTP boxes remounted clean (${boxCount} boxes, values='${emptyVals}')`, boxCount===6&&emptyVals==='']);
 dOtp=otpFor(E_D);
 const goodOk=await fillCode(q,dOtp);
 let s3=false; for(let i=0;i<15&&!s3;i++){ await q.waitForTimeout(1000); s3=(await lib.allText(q)).includes('Complete Security'); }
 mark('correct OTP advances(desktop)', goodOk&&s3); if(!s3) fails.push('desktop correct code did not advance');
 dataAsserts.push(['verify-signup-otp 200 correct (desktop)', netlog.some(l=>l.includes('/verify-signup-otp')&&l.includes('-> 200'))]);
 await lib.screenshot(q,`${SHOTS}/au010-d-s3-password.png`);
 const dpw=q.locator('input[type=password]');
 await dpw.first().waitFor({state:'visible',timeout:25000}).catch(()=>{});
 // short-password defense (desktop)
 await dpw.nth(0).click({force:true}); await q.keyboard.type('Short1!');
 await dpw.nth(1).click({force:true}); await q.keyboard.type('Short1!');
 await lib.clickBtn(q,'Complete Registration'); await q.waitForTimeout(800);
 const shortMsg=(await lib.allText(q)).includes('Password must be at least 8 characters.');
 stateAsserts.push(['desktop short-password rejected',shortMsg]); if(!shortMsg) fails.push('desktop accepted short pw');
 await dpw.nth(0).click({force:true}); await q.keyboard.press('Control+a'); await q.keyboard.type(PW);
 await dpw.nth(1).click({force:true}); await q.keyboard.press('Control+a'); await q.keyboard.type(PW);
 await lib.clickBtn(q,'Complete Registration');
 let tok=false; for(let i=0;i<25&&!tok;i++){ tok=await lib.isLoggedIn(q); if(!tok) await q.waitForTimeout(800); }
 mark('Complete Registration(desktop)',tok);
 stateAsserts.push(['desktop funnel ends signed-in',tok]); if(!tok) fails.push('desktop register not signed-in');
 dataAsserts.push(['auth/register 201 (desktop)', netlog.some(l=>l.includes('/api/v1/auth/register')&&l.includes('-> 201'))]);
 await lib.screenshot(q,`${SHOTS}/au010-d-s4-signed-in.png`);
 await lib.closeVideo(ctxD,'e2e/videos/AU-010-desktop.webm');

 // reference parity
 const ctxR=await browser.newContext({viewport:{width:375,height:667}});
 const r=await ctxR.newPage();
 await r.goto('http://localhost:3000/register',{waitUntil:'load',timeout:60000}).catch(()=>{});
 await r.waitForTimeout(4000);
 await r.screenshot({path:`${SHOTS}/au010-ref-s1-info.png`}).catch(()=>{});
 const refTxt=await r.evaluate(()=>document.body.innerText).catch(()=>'');
 for(const t of ['Create Your Account','First Name','Last Name']) if(!refTxt.includes(t)) fails.push(`reference step1 missing "${t}"`);
 const refs=r.locator('input'); const nR=await refs.count();
 if(nR>=3){
   await refs.nth(0).fill('Ref'+ep4.slice(-3)); await refs.nth(1).fill('Parity');
   await refs.nth(2).fill(`campaign.au010.ref${ep4}@mail.com`);
   await r.locator('button',{hasText:'Continue'}).first().click().catch(()=>{});
   await r.waitForTimeout(3500);
   const ref2=await r.evaluate(()=>document.body.innerText).catch(()=>'');
   for(const t of ['Verify Your Email','Verification Code','Resend Code']) if(!ref2.includes(t)) fails.push(`reference step2 missing "${t}"`);
   await r.screenshot({path:`${SHOTS}/au010-ref-s2-otp.png`}).catch(()=>{});
   stateAsserts.push(['reference reached OTP step', ref2.includes('Verify Your Email')]);
 }
 await ctxR.close();

 console.log(JSON.stringify({emails:{desktop:E_D},netlog,fails,navAsserts,stateAsserts,dataAsserts,buttons:[...btnTotal.entries()]},null,1));
 require('fs').writeFileSync('/tmp/au010_run5.json',JSON.stringify({emails:{desktop:E_D},netlog,fails,navAsserts,stateAsserts,dataAsserts,buttons:[...btnTotal.entries()]},null,1));
 await browser.close();
})().catch(e=>{console.error('FATAL',e.message);require('fs').writeFileSync('/tmp/au010_run5.json','FATAL '+e.message);process.exit(1)});
