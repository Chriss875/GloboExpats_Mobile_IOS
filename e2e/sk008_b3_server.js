// B3c: does the cleared-session checkout still fire AUTHENTICATED API calls / allow order submit?
const L=require('./lib_verify.js');
const APP='http://localhost:9131';
(async()=>{
 const b=await L.newBrowser();
 const ctx=await b.newContext({viewport:{width:375,height:667}});
 const p=await ctx.newPage();
 await p.goto(APP+'/',{waitUntil:'load'}); await L.waitText(p,'expat marketplace',30000); await p.waitForTimeout(3000);
 await p.evaluate(()=>{window.location.hash='#/login';}); await p.waitForTimeout(2500);
 const ei=p.locator('input[type="text"]').first(), pi=p.locator('input[type="password"]').first();
 await ei.click({force:true}).catch(()=>{}); await p.waitForTimeout(250); await p.keyboard.type('mobile.test.20260820@gmail.com');
 await pi.click({force:true}).catch(()=>{}); await p.waitForTimeout(250); await p.keyboard.type('StrongPass!1');
 await L.clickBtn(p,'Log in');
 let ok=false; for(let i=0;i<25&&!ok;i++){ok=await L.isLoggedIn(p); if(!ok)await p.waitForTimeout(800);}
 // capture API auth headers after token clear
 const calls=[];
 p.on('request',r=>{ if(/localhost:8083/.test(r.url())) calls.push({u:r.url().slice(21,80), auth:(r.headers()['authorization']||'none').slice(0,16)}); });
 await p.evaluate(()=>{localStorage.removeItem('flutter.auth_token');});
 await p.evaluate(()=>{window.location.hash='#/orders';}); await p.waitForTimeout(3500);
 let t=(await L.allText(p)).replace(/\s+/g,' ');
 console.log('ORDERS after clear:', JSON.stringify(t.slice(0,160)));
 console.log('calls:', JSON.stringify(calls.slice(0,6),null,1));
 await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
