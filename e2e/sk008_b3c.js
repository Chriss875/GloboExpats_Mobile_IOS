// B3 final: after token clear + checkout nav, does the FLOW still work end-to-end
// (i.e. is the stale session exploitable, or just a client-side view)?
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
 await p.evaluate(()=>{localStorage.removeItem('flutter.auth_token'); window.location.hash='#/checkout';});
 await p.waitForTimeout(4000);
 // click through the flow to see if it errors at submit
 const t0=(await L.allText(p)).replace(/\s+/g,' ');
 console.log('step1 visible:', t0.includes('Step 1 of 4'));
 const cont = t0.includes('Continue');
 if(cont){ await L.clickBtn(p,'Continue'); await p.waitForTimeout(3000); }
 const t1=(await L.allText(p)).replace(/\s+/g,' ');
 console.log('after continue:', JSON.stringify(t1.slice(0,200)));
 await L.screenshot(p,'e2e/shots/AU-008/AU-008-sk2-375-B3d-stale-flow.png');
 await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
