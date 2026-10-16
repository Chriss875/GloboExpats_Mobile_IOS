// AU-008 B3 recheck: clear the REAL storage key (flutter.auth_token) AND reload,
// then assert the checkout gate. Two variants: with and without reload.
const {execSync}=require('child_process');
process.chdir('/home/devsystemadmin/GloboExpats_Mobile');
const L=require('./lib_verify.js');
(async()=>{
 const b=await L.newBrowser();
 const ctx=await b.newContext({viewport:{width:375,height:667}});
 const p=await ctx.newPage();
 await p.goto('http://localhost:9131/',{waitUntil:'load'}); await L.waitText(p,'expat marketplace',30000); await p.waitForTimeout(3000);
 await p.evaluate(()=>{window.location.hash='#/login';}); await p.waitForTimeout(2500);
 const ei=p.locator('input[type="text"]').first(), pi=p.locator('input[type="password"]').first();
 await ei.click({force:true}).catch(()=>{}); await p.waitForTimeout(250); await p.keyboard.type('mobile.test.20260820@gmail.com');
 await pi.click({force:true}).catch(()=>{}); await p.waitForTimeout(250); await p.keyboard.type('StrongPass!1');
 await L.clickBtn(p,'Log in');
 let ok=false; for(let i=0;i<25&&!ok;i++){ok=await L.isLoggedIn(p); if(!ok)await p.waitForTimeout(800);}
 console.log('logged in:',ok);
 // enumerate all localStorage keys containing 'auth' or 'token'
 const keys = await p.evaluate(()=>Object.keys(localStorage));
 console.log('LS keys:', JSON.stringify(keys.filter(k=>/auth|token|cart/i.test(k))));
 await L.screenshot(p,'e2e/shots/AU-008/AU-008-sk2r14-375-b3-login.png');

 // VARIANT 1 (skeptic's original): remove key, no reload
 await p.evaluate(()=>{localStorage.removeItem('flutter.auth_token');});
 await p.evaluate(()=>{window.location.hash='#/checkout';});
 await p.waitForTimeout(4000);
 let t=(await L.allText(p)).replace(/\s+/g,' ');
 console.log('V1 no-reload gate visible:', t.includes('Please log in to checkout'), '| step1:', t.includes('Step 1 of 4'));
 await L.screenshot(p,'e2e/shots/AU-008/AU-008-sk2r14-375-b3-v1-noreload.png');

 // VARIANT 2: clear key + full reload -> app restores session from storage; if none, gate must show
 await p.evaluate(()=>{localStorage.clear(); window.location.hash='#/checkout'; window.location.reload();});
 await p.waitForTimeout(9000);
 t=(await L.allText(p)).replace(/\s+/g,' ');
 console.log('V2 cleared+reloaded gate visible:', t.includes('Please log in to checkout'), '| excerpt:', JSON.stringify(t.slice(0,160)));
 await L.screenshot(p,'e2e/shots/AU-008/AU-008-sk2r14-375-b3-v2-reload.png');
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
