// B3 deep verification: is the /checkout gate REALLY dead when token is removed mid-session?
// Compare: (a) cold load signed-out, (b) token cleared in-flight, (c) reference web behavior.
const L=require('./lib_verify.js');
const APP='http://localhost:9131';
(async()=>{
 const b=await L.newBrowser();
 const ctx=await b.newContext({viewport:{width:375,height:667}});
 const p=await ctx.newPage();
 // (a) COLD load of #/checkout with NO storage at all (fresh context = signed out)
 await p.goto(APP+'/#/checkout',{waitUntil:'load'});
 await p.waitForTimeout(9000);
 let t=(await L.allText(p)).replace(/\s+/g,' ');
 console.log('A-cold-anon:', JSON.stringify(t.slice(0,200)));
 await L.screenshot(p,'e2e/shots/AU-008/AU-008-sk2-375-B3a-cold-anon-checkout.png');

 // login, then clear token IN FLIGHT and re-navigate
 const BUYER={email:'mobile.test.20260820@gmail.com',pw:'StrongPass!1'};
 await p.goto(APP+'/',{waitUntil:'load'}); await L.waitText(p,'expat marketplace',30000); await p.waitForTimeout(3000);
 await p.evaluate(()=>{window.location.hash='#/login';}); await p.waitForTimeout(2500);
 const ei=p.locator('input[type="text"]').first(), pi=p.locator('input[type="password"]').first();
 await ei.click({force:true}).catch(()=>{}); await p.waitForTimeout(250); await p.keyboard.type(BUYER.email);
 await pi.click({force:true}).catch(()=>{}); await p.waitForTimeout(250); await p.keyboard.type(BUYER.pw);
 await L.clickBtn(p,'Log in');
 let ok=false; for(let i=0;i<25&&!ok;i++){ok=await L.isLoggedIn(p); if(!ok)await p.waitForTimeout(800);}
 console.log('logged in:', ok);
 // (b) clear BOTH keys then navigate
 await p.evaluate(()=>{ localStorage.removeItem('flutter.auth_token'); sessionStorage.clear(); });
 console.log('keys after clear:', await p.evaluate(()=>Object.keys(localStorage)));
 await p.evaluate(()=>{window.location.hash='#/checkout';}); await p.waitForTimeout(4000);
 t=(await L.allText(p)).replace(/\s+/g,' ');
 console.log('B-token-cleared-nav:', JSON.stringify(t.slice(0,220)));
 await L.screenshot(p,'e2e/shots/AU-008/AU-008-sk2-375-B3b-tokenclear-checkout.png');
 // (c) full RELOAD after clearing (simulates restart with dead session)
 await p.reload({waitUntil:'load'}); await p.waitForTimeout(8000);
 t=(await L.allText(p)).replace(/\s+/g,' ');
 console.log('C-reload-after-clear:', JSON.stringify(t.slice(0,220)), 'url=', p.url());
 await L.screenshot(p,'e2e/shots/AU-008/AU-008-sk2-375-B3c-reload-checkout.png');
 await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
